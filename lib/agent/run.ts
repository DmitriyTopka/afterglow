// The agent: request -> signals -> Qloo entities -> Qloo affinity over OUR catalog -> ranked picks with provenance.
import baselineFile from "@/data/baseline.json";
import { extract, type Extraction } from "@/lib/llm/extract";
import { QLOO_MODE, type QlooCall } from "@/lib/qloo/client";
import type { QlooEntityType } from "@/lib/qloo/types";
import { rank, shortlist, tasteLight, type Baseline } from "./rank";
import { CATALOG, mapCatalog, resolveSignal, scoreCatalog, type Item } from "./score";
import { demandGap, type Gap } from "./gap";

const baseline = baselineFile.baseline as Baseline;

export interface Step {
  kind: "read" | "lookup" | "score" | "filter" | "rank";
  label: string;
  detail?: string;
  light?: Record<string, number>; // catalog id -> taste percentile within its format, sent with the catalog-scoring step
  status: "ok" | "dropped" | "warn";
}

export interface Pick {
  item: Item;
  affinity: number | null;
  lift: number | null; // how far above its usual audience this shopper's taste scores the item, in SDs
  chain: Array<{ signal: string; contribution: number }>;
  why: string;
  direct: string[]; // signals this item is made by or belongs to (shop metadata, not Qloo)
}

export interface AgentResult {
  request: string;
  extraction: Extraction;
  steps: Step[];
  picks: Pick[];
  calls: QlooCall[];
  modes: { qloo: "mock" | "live"; llm: string };
  usd: number;
  gap?: Gap | null; // store check: what this taste wants most vs what we carry
  signalNames?: string[];
}

const KIND_TO_TYPE: Record<string, QlooEntityType> = {
  person: "urn:entity:person",
  artist: "urn:entity:artist",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  book: "urn:entity:book",
  video_game: "urn:entity:videogame",
  brand: "urn:entity:brand",
  podcast: "urn:entity:podcast",
};

const TYPE_LABEL: Record<string, string> = {
  "urn:entity:brand": "brands",
  "urn:entity:book": "books",
  "urn:entity:videogame": "games",
  "urn:entity:artist": "artists",
  "urn:entity:movie": "movies",
  "urn:entity:tv_show": "TV shows",
};

export async function runAgent(request: string): Promise<AgentResult> {
  const steps: Step[] = [];
  const calls: QlooCall[] = [];

  // 1. Read the request
  const ex = await extract(request);
  const { extraction } = ex;
  steps.push({
    kind: "read",
    label: `Read the request: ${extraction.signals.length} taste signal(s), recipient "${extraction.recipient}"` +
      (extraction.budget_usd ? `, budget $${extraction.budget_usd}` : ", no budget stated"),
    detail: extraction.signals.map((s) => `${s.name} (${s.kind})`).join(", ") || "nothing Qloo can anchor on",
    status: extraction.signals.length ? "ok" : "warn",
  });

  // 2. Resolve signals to Qloo entity IDs
  const resolved: Array<{ name: string; id: string }> = [];
  await Promise.all(
    extraction.signals.map(async (s) => {
      const hit = await resolveSignal(s.name, KIND_TO_TYPE[s.kind], calls);
      if (hit) {
        resolved.push({ name: s.name, id: hit.entity_id });
        steps.push({
          kind: "lookup",
          label: `Found "${s.name}" in Qloo` + (hit.exact ? "" : ` (closest match: ${hit.name})`),
          detail: hit.entity_id,
          status: hit.exact ? "ok" : "warn",
        });
      } else {
        steps.push({ kind: "lookup", label: `"${s.name}" not found in Qloo, dropped as a signal`, status: "dropped" });
      }
    }),
  );
  if (!resolved.length) {
    return { request, extraction, steps, picks: [], calls, modes: { qloo: QLOO_MODE, llm: ex.mode }, usd: ex.usd };
  }

  // 3. Resolve catalog items to Qloo IDs (cached after first run)
  const itemIds = await mapCatalog(calls);
  const unmapped = CATALOG.length - itemIds.size;
  steps.push({
    kind: "lookup",
    label: `Mapped ${itemIds.size} of ${CATALOG.length} catalog items to Qloo entities`,
    detail: unmapped ? `${unmapped} item(s) have no Qloo match and cannot be scored` : undefined,
    status: unmapped ? "warn" : "ok",
  });

  // 4. Ask Qloo to score our catalog against the signals, one call per entity type
  const { scores, byType } = await scoreCatalog(resolved.map((r) => r.id), itemIds, calls);
  byType.forEach((t, k) => {
    steps.push({ kind: "score", label: `Qloo scored ${t.scored} ${TYPE_LABEL[t.type] ?? t.type} from the catalog`, status: t.scored ? "ok" : "warn", ...(k === byType.length - 1 ? { light: tasteLight(CATALOG, scores) } : {}) });
  });

  // 5. Rank: direct matches from shop metadata first, then Qloo lift over the item's usual audience
  const signalNames = extraction.signals.map((s) => s.name);
  const formats = extraction.signals.map((s) => KIND_TO_TYPE[s.kind as string]).filter((t): t is QlooEntityType => !!t && t !== "urn:entity:person");
  const named = new Set(resolved.map((r) => r.id));
  const ranked = rank({ arm: "qloo", items: CATALOG, signalNames, scores, baseline, taste: "pct+fmt", formats, exclude: named });
  const directCount = ranked.filter((r) => r.direct.length).length;
  steps.push({
    kind: "rank",
    label: `${directCount} title(s) by or from what you named; the rest ranked by Qloo affinity within each format`,
    detail: "Titles you named yourself are left out (you have them). Formats you mentioned get a small boost.",
    status: "ok",
  });

  // 6. Business rules: budget per item, one item per category
  const budget = extraction.budget_usd;
  if (budget) {
    const over = ranked.filter((r) => r.item.price_usd > budget);
    const top = over[0];
    if (over.length) {
      steps.push({
        kind: "filter",
        label: `Dropped ${over.length} item(s) over the $${budget} budget`,
        detail: top ? `including "${top.item.title}" ($${top.item.price_usd})` : undefined,
        status: "dropped",
      });
    }
  }
  const nameById = new Map(resolved.map((r) => [r.id, r.name]));
  const picks: Pick[] = shortlist(ranked, budget, 5, 2).map((r) => {
    const chain = (scores.get(r.item.id)?.chain ?? [])
      .map((c) => ({ signal: nameById.get(c.entity_id) ?? c.entity_id, contribution: c.score }))
      .sort((a, b) => b.contribution - a.contribution);
    const p: Pick = { item: r.item, affinity: r.affinity, lift: r.lift, chain, why: "", direct: r.direct };
    p.why = explain(p);
    return p;
  });
  steps.push({ kind: "rank", label: `Shortlist, at most two per format: ${picks.length} pick(s)`, status: "ok" });

  // 7. Store check: does the shop carry what this taste loves most? Missing titles go to the owner as demand.
  const gap = await demandGap(resolved.map((r) => r.id), formats, calls);
  if (gap) {
    const have = gap.wanted.filter((w) => w.owned).length;
    steps.push({
      kind: "score",
      label: `Store check: we carry ${have} of the ${gap.wanted.length} titles this taste loves most`,
      detail: have < gap.wanted.length ? `Missing ones go to the owner as unmet demand: ${gap.wanted.filter((w) => !w.owned).slice(0, 3).map((w) => w.name).join(", ")}` : undefined,
      status: have / gap.wanted.length >= 0.3 ? "ok" : "warn",
    });
  }

  return { request, extraction, steps, picks, calls, modes: { qloo: QLOO_MODE, llm: ex.mode }, usd: ex.usd, gap, signalNames: signalNames };
}

function explain(p: Pick): string {
  if (p.direct.length) return `By or from ${p.direct.join(" and ")}, named in the request, so this is a direct match rather than a Qloo discovery.`;
  if (p.affinity === null || p.lift === null) return `Qloo had no score for this item; it fills a category slot.`;
  const lift = `${p.lift >= 0 ? "+" : ""}${p.lift.toFixed(1)} SD above its usual audience`;
  const lead = p.chain[0];
  if (!lead) return `Qloo affinity ${p.affinity.toFixed(2)}, ${lift}.`;
  return `People whose taste overlaps with ${lead.signal} over-index on ${p.item.qloo.name}: ` +
    `${Math.round(lead.contribution * 100)}% of this match comes from that signal, ${lift}.`;
}

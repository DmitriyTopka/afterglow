// Ranking, kept free of I/O so the eval can compare arms on identical inputs.
//   rules: direct matches from shop metadata, then tag overlap with those matches. No Qloo.
//   qloo:  the same direct matches, then Qloo lift: how much more this shopper's taste likes the item
//          than the reference profiles do (data/baseline.json), so globally popular brands stop winning.
import type { Item, ItemScore } from "./score";

export type Arm = "rules" | "qloo";

export interface Baseline {
  [itemId: string]: { mean: number; sd: number; n: number };
}

export interface Ranked {
  item: Item;
  direct: string[]; // signal names this item is made by or belongs to
  affinity: number | null;
  lift: number | null;
  tagScore: number;
  score: number;
}

export function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

const tagsOf = (item: Item): string[] => item.tags ?? item.mock_tags ?? [];

/** Signals that name the item itself, its creator or the work it belongs to. */
export function directMatches(item: Item, signalNames: string[]): string[] {
  const keys = new Set([item.qloo.name, ...item.creators, ...item.works].map(norm));
  return signalNames.filter((s) => keys.has(norm(s)));
}

/** Lift in baseline standard deviations; null when Qloo did not score the item or there is no baseline. */
export type LiftMode = "raw" | "diff" | "z";

export function lift(itemId: string, s: ItemScore | undefined, baseline: Baseline, mode: LiftMode = "z"): number | null {
  if (!s) return null;
  if (mode === "raw") return s.affinity;
  const b = baseline[itemId];
  if (!b || b.n < 3) return null;
  return mode === "diff" ? s.affinity - b.mean : (s.affinity - b.mean) / Math.max(b.sd, 0.02);
}

export function rank(opts: {
  arm: Arm;
  items: Item[];
  signalNames: string[];
  scores: Map<string, ItemScore>;
  baseline: Baseline;
  liftMode?: LiftMode;
  // Chosen on eval v2 (odd scenarios, confirmed once on even: P@3 0.167 -> 0.383):
  taste?: "z" | "pct+fmt"; // pct+fmt: Qloo affinity percentile within the title's format, +0.5 for formats the shopper named
  formats?: string[]; // Qloo entity types the shopper named (for the +0.5)
  exclude?: Set<string>; // Qloo entity ids the shopper named: they already have these
}): Ranked[] {
  const { arm, signalNames, scores, baseline, liftMode, taste = "z", formats = [], exclude } = opts;
  const items = exclude ? opts.items.filter((i) => !(i.qloo.entity_id && exclude.has(i.qloo.entity_id))) : opts.items;
  const pct = new Map<string, number>();
  if (taste === "pct+fmt") {
    for (const t of new Set(items.map((i) => i.qloo.type))) {
      const xs = items.filter((i) => i.qloo.type === t && scores.has(i.id)).sort((a, b) => scores.get(a.id)!.affinity - scores.get(b.id)!.affinity);
      xs.forEach((i, k) => pct.set(i.id, (k + 1) / xs.length));
    }
  }
  const rows = items.map((item) => {
    const s = scores.get(item.id);
    return {
      item,
      direct: directMatches(item, signalNames),
      affinity: s?.affinity ?? null,
      lift: lift(item.id, s, baseline, liftMode),
      tagScore: 0,
      score: 0,
    };
  });

  const directTags = new Set(rows.filter((r) => r.direct.length).flatMap((r) => tagsOf(r.item)));
  for (const r of rows) {
    r.tagScore = tagsOf(r.item).filter((t) => directTags.has(t)).length;
    // Qloo does not score a signal against itself, so unscored items sink to the bottom instead of vanishing.
    const t = taste === "pct+fmt"
      ? (pct.has(r.item.id) ? pct.get(r.item.id)! * 10 + (formats.includes(r.item.qloo.type) ? 5 : 0) : -50)
      : (r.lift ?? -50);
    const tasteScore = arm === "qloo" ? t : r.tagScore;
    // Direct matches first (more matched signals wins), then the arm's taste score.
    r.score = r.direct.length * 1000 + tasteScore;
  }
  return rows.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
}

/** Business rules on top of the ranking: budget per item, at most `perCategory` per format, top N. */
export function shortlist(ranked: Ranked[], budget: number | null, n = 5, perCategory = 1): Ranked[] {
  const out: Ranked[] = [];
  const used = new Map<string, number>();
  for (const r of ranked) {
    if (budget && r.item.price_usd > budget) continue;
    if ((used.get(r.item.category) ?? 0) >= perCategory) continue;
    used.set(r.item.category, (used.get(r.item.category) ?? 0) + 1);
    out.push(r);
    if (out.length === n) break;
  }
  return out;
}

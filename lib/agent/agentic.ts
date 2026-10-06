// The shop assistant as a tool-using agent. Claude decides which Qloo-backed tool to call next:
// find the shopper's tastes in Qloo, score our catalog, check what the store is missing, look up who the
// fans are, ask the shopper a question, or recommend. The expensive catalog scoring runs at most once;
// every run is capped in model turns and Qloo calls. Falls back to the fixed pipeline (run.ts) on failure.
import Anthropic from "@anthropic-ai/sdk";
import baselineFile from "@/data/baseline.json";
import { canSpend, record } from "@/lib/llm/budget";
import { QLOO_MODE, type QlooCall } from "@/lib/qloo/client";
import type { QlooEntityType } from "@/lib/qloo/types";
import { audience } from "./audience";
import { demandGap, type Gap } from "./gap";
import { rank, shortlist, type Baseline, type Ranked } from "./rank";
import { runAgent, type AgentResult, type Pick, type Step } from "./run";
import { CATALOG, mapCatalog, resolveSignal, scoreCatalog } from "./score";

const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5";
const MAX_TURNS = 6;
const MAX_QLOO_CALLS = 25;
const baseline = baselineFile.baseline as Baseline;
const KIND: Record<string, QlooEntityType> = {
  person: "urn:entity:person", artist: "urn:entity:artist", movie: "urn:entity:movie", tv_show: "urn:entity:tv_show",
  book: "urn:entity:book", video_game: "urn:entity:videogame", podcast: "urn:entity:podcast", brand: "urn:entity:brand",
};
const FORMAT: Record<string, QlooEntityType> = { vinyl: "urn:entity:artist", book: "urn:entity:book", film: "urn:entity:movie", game: "urn:entity:videogame", tv: "urn:entity:tv_show" };

const SYSTEM = `You are the shop assistant agent of Afterglow, an independent store for vinyl, books, films, games and TV box sets.
You work with tools backed by Qloo, a taste-intelligence API. Typical plan:
1. find_tastes with every artist, film, book, game, show, author or director the shopper names (one call, all names).
2. score_catalog once with the found entity ids, the formats the shopper asked for (if any) and the budget (if any).
3. check_store once with the same ids, to see which titles this taste loves most that the store does not carry.
4. Optionally audience, when it helps to explain who the recipient's taste resembles.
5. recommend exactly 5 titles chosen from score_catalog candidates, each with a short plain reason (max 20 words) naming the taste it comes from. Prefer a mix: the obvious match plus at least one surprising cross-format pick.
If the message names nothing you can find, call ask_shopper with one short question instead.
Never invent titles or ids. Never call score_catalog twice. Always end with recommend or ask_shopper, never with plain text.
Write reasons in plain English, no em dashes.`;

const TOOLS: Anthropic.Tool[] = [
  { name: "find_tastes", description: "Resolve the cultural tastes the shopper named (artists, films, books, games, shows, people, brands) to Qloo entities.",
    input_schema: { type: "object", properties: { tastes: { type: "array", items: { type: "object", properties: { name: { type: "string" }, kind: { type: "string", enum: Object.keys(KIND) } }, required: ["name", "kind"] } } }, required: ["tastes"] } },
  { name: "score_catalog", description: "Score all 384 store titles against the found tastes with Qloo affinity and return the best candidates within budget. Expensive: call once.",
    input_schema: { type: "object", properties: { entity_ids: { type: "array", items: { type: "string" } }, formats: { type: "array", items: { type: "string", enum: Object.keys(FORMAT) } }, budget_usd: { type: ["number", "null"] } }, required: ["entity_ids"] } },
  { name: "check_store", description: "Ask Qloo which 10 titles this taste loves most (any store) and see which ones Afterglow carries. Missing titles are reported to the shop owner.",
    input_schema: { type: "object", properties: { entity_ids: { type: "array", items: { type: "string" } }, formats: { type: "array", items: { type: "string", enum: Object.keys(FORMAT) } } }, required: ["entity_ids"] } },
  { name: "audience", description: "Qloo demographics: how fans of these tastes skew by age band and gender.",
    input_schema: { type: "object", properties: { entity_ids: { type: "array", items: { type: "string" } } }, required: ["entity_ids"] } },
  { name: "ask_shopper", description: "Ask the shopper one short question when the message has no taste you can work with. Ends the turn.",
    input_schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] } },
  { name: "recommend", description: "Final answer: exactly 5 store titles from score_catalog candidates, each with a plain reason. Ends the turn.",
    input_schema: { type: "object", properties: { picks: { type: "array", items: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] } }, note: { type: "string" } }, required: ["picks"] } },
];

export interface AgenticResult extends AgentResult { question?: string; note?: string; audience?: string | null; turns: number }

export async function runAgentic(request: string): Promise<AgenticResult> {
  if (!process.env.ANTHROPIC_API_KEY || !canSpend()) return { ...(await runAgent(request)), turns: 0 };
  try {
    return await loop(request);
  } catch (err) {
    console.error("agent loop failed, using the fixed pipeline", err);
    return { ...(await runAgent(request)), turns: 0 };
  }
}

async function loop(request: string): Promise<AgenticResult> {
  const client = new Anthropic();
  const calls: QlooCall[] = [];
  const steps: Step[] = [];
  const named: Array<{ name: string; id: string; type: string }> = [];
  let ranked: Ranked[] | null = null;
  let candidates: Ranked[] = [];
  let scores: Awaited<ReturnType<typeof scoreCatalog>>["scores"] | null = null;
  let gap: Gap | null = null;
  let aud: string | null = null;
  let budget: number | null = null;
  let usd = 0;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: request }];
  const over = () => calls.filter((c) => c.cache === "miss").length >= MAX_QLOO_CALLS;

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 1500, system: SYSTEM, tools: TOOLS, messages });
    usd += record(MODEL, res.usage.input_tokens, res.usage.output_tokens);
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!uses.length) {
      // The model answered in plain text: if it is asking something, treat it as a question to the shopper.
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ").trim();
      if (text && !named.length) {
        steps.push({ kind: "read", label: `Asked you: ${text.slice(0, 200)}`, status: "warn" });
        return { request, extraction: { recipient: "", budget_usd: null, signals: [] } as never, steps, picks: [], calls, modes: { qloo: QLOO_MODE, llm: "agent" }, usd, gap, audience: aud, turns: turn, question: text.slice(0, 300) };
      }
      break;
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = u.input as Record<string, unknown>;
      const reply = (content: unknown, is_error = false) => results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(content), is_error });

      if (u.name === "recommend" || u.name === "ask_shopper") {
        const base = { request, extraction: { recipient: "", budget_usd: budget, signals: named.map((n) => ({ name: n.name, kind: n.type })) }, steps, calls, modes: { qloo: QLOO_MODE, llm: "agent" }, usd, gap, audience: aud, turns: turn } as unknown as AgenticResult;
        if (u.name === "ask_shopper") {
          steps.push({ kind: "read", label: `Asked you: ${String(input.question)}`, status: "warn" });
          return { ...base, picks: [], question: String(input.question) };
        }
        // The store check feeds the owner's demand view, so it always runs before an answer, even if the model skipped it.
        if (u.name === "recommend" && !gap && named.length && !over()) {
          // Formats of the named tastes (a person is most often a director or an author: try films).
          const fmts = [...new Set(named.map((n) => (n.type === "urn:entity:person" ? "urn:entity:movie" : n.type)))];
          gap = await demandGap(named.map((n) => n.id), fmts, calls);
          if (gap) steps.push({ kind: "score", label: `Store check: we carry ${gap.wanted.filter((w) => w.owned).length} of the ${gap.wanted.length} titles this taste loves most`, detail: `Missing ones go to the owner: ${gap.wanted.filter((w) => !w.owned).slice(0, 3).map((w) => w.name).join(", ")}`, status: "ok" });
          base.gap = gap;
        }
        const byId = new Map(candidates.map((r) => [r.item.id, r]));
        const picks: Pick[] = [];
        for (const p of (input.picks as Array<{ id: string; reason: string }>) ?? []) {
          const r = byId.get(p.id);
          if (!r || picks.some((x) => x.item.id === p.id)) continue; // only real catalog candidates, no duplicates
          picks.push({ item: r.item, affinity: r.affinity, lift: r.lift, chain: (scores?.get(r.item.id)?.chain ?? []).map((c) => ({ signal: named.find((n) => n.id === c.entity_id)?.name ?? c.entity_id, contribution: c.score })), why: String(p.reason).replace(/\s*[\u2014\u2013]\s*/g, ", ").slice(0, 200), direct: r.direct });
        }
        steps.push({ kind: "rank", label: `Chose ${picks.length} pick(s) from ${candidates.length} candidates`, detail: typeof input.note === "string" ? input.note : undefined, status: picks.length ? "ok" : "warn" });
        return { ...base, picks: picks.slice(0, 5), note: typeof input.note === "string" ? input.note : undefined };
      }

      if (over()) { reply({ error: "Qloo call budget for this request is used up. Recommend from what you have." }, true); continue; }

      if (u.name === "find_tastes") {
        const found: unknown[] = [];
        for (const t of ((input.tastes as Array<{ name: string; kind: string }>) ?? []).slice(0, 4)) {
          const hit = await resolveSignal(t.name, KIND[t.kind], calls);
          if (hit) { named.push({ name: t.name, id: hit.entity_id, type: KIND[t.kind] ?? "" }); found.push({ name: t.name, qloo_name: hit.name, entity_id: hit.entity_id, exact: hit.exact }); }
          else found.push({ name: t.name, not_found: true });
        }
        steps.push({ kind: "lookup", label: `Looked up ${found.length} taste(s) in Qloo`, detail: named.map((n) => n.name).join(", ") || "none found", status: named.length ? "ok" : "dropped" });
        reply(found);
      } else if (u.name === "score_catalog") {
        if (!ranked) {
          const ids = ((input.entity_ids as string[]) ?? []).filter(Boolean);
          budget = typeof input.budget_usd === "number" ? input.budget_usd : null;
          const formats = ((input.formats as string[]) ?? []).map((f) => FORMAT[f]).filter(Boolean);
          const itemIds = await mapCatalog(calls);
          const scored = await scoreCatalog(ids, itemIds, calls);
          scores = scored.scores;
          ranked = rank({ arm: "qloo", items: CATALOG, signalNames: named.map((n) => n.name), scores, baseline, taste: "pct+fmt", formats, exclude: new Set(ids) });
          candidates = shortlist(ranked, budget, 12, 3);
          steps.push({ kind: "score", label: `Scored all ${CATALOG.length} titles with Qloo affinity`, detail: `${candidates.length} candidates within budget${budget ? ` ($${budget})` : ""}`, status: "ok" });
        }
        reply(candidates.map((r) => ({ id: r.item.id, title: r.item.title, format: r.item.category, price_usd: r.item.price_usd, by_named_taste: r.direct, qloo_lead_taste: named.find((n) => n.id === scores?.get(r.item.id)?.chain?.sort((a, b) => b.score - a.score)[0]?.entity_id)?.name ?? null })));
      } else if (u.name === "check_store") {
        if (!gap) {
          const formats = ((input.formats as string[]) ?? []).map((f) => FORMAT[f]).filter(Boolean);
          gap = await demandGap(((input.entity_ids as string[]) ?? []).filter(Boolean), formats, calls);
          if (gap) steps.push({ kind: "score", label: `Store check: we carry ${gap.wanted.filter((w) => w.owned).length} of the ${gap.wanted.length} titles this taste loves most`, detail: `Missing ones go to the owner: ${gap.wanted.filter((w) => !w.owned).slice(0, 3).map((w) => w.name).join(", ")}`, status: "ok" });
        }
        reply(gap ? { carried: gap.wanted.filter((w) => w.owned).map((w) => w.name), missing: gap.wanted.filter((w) => !w.owned).map((w) => w.name) } : { error: "no data" }, !gap);
      } else if (u.name === "audience") {
        const a = await audience(((input.entity_ids as string[]) ?? []).filter(Boolean), calls);
        aud = a?.summary ?? null;
        if (a) steps.push({ kind: "lookup", label: `Who these fans are: ${a.summary}`, status: "ok" });
        reply(a ?? { error: "no demographic data" }, !a);
      } else {
        reply({ error: `unknown tool ${u.name}` }, true);
      }
    }
    messages.push({ role: "user", content: results });
  }
  // Out of turns without a final answer: fall back to the deterministic shortlist we already have.
  const picks: Pick[] = candidates.slice(0, 5).map((r) => ({ item: r.item, affinity: r.affinity, lift: r.lift, chain: [], why: r.direct.length ? `By ${r.direct.join(" and ")}.` : "Strong Qloo match for these tastes.", direct: r.direct }));
  steps.push({ kind: "rank", label: "Agent ran out of steps; showing the top scored titles", status: "warn" });
  return { request, extraction: { recipient: "", budget_usd: budget, signals: named.map((n) => ({ name: n.name, kind: n.type })) } as never, steps, picks, calls, modes: { qloo: QLOO_MODE, llm: "agent" }, usd, gap, audience: aud, turns: MAX_TURNS };
}

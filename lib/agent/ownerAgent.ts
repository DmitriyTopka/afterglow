// The owner's agent: reads the store's unmet demand, investigates candidates with Qloo, and proposes a
// restock plan of 3 titles with reasons and the coverage it would reach. Claude decides what to look at.
// Caps: 6 model turns, 1 live cold start, 40 live Qloo calls.
import Anthropic from "@anthropic-ai/sdk";
import cycle from "@/data/cycle.json";
import owner from "@/data/owner.json";
import { canSpend, record } from "@/lib/llm/budget";
import { coverage, fmtPct, seedDemand, suggestions, type DemandRow } from "@/lib/cycle";
import type { QlooCall } from "@/lib/qloo/client";
import type { QlooEntityType } from "@/lib/qloo/types";
import { audience } from "./audience";
import { coldStart } from "./coldstart";
import type { Placement } from "./place";
import type { Step } from "./run";

const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5";
const PRE = cycle.placements as Record<string, Placement>;
const SEED_IDS = new Set(seedDemand.flatMap((r) => r.wanted.map((w) => w.entity_id)));
const KIND: Record<string, string> = { "urn:entity:artist": "vinyl", "urn:entity:movie": "film", "urn:entity:book": "book", "urn:entity:videogame": "game", "urn:entity:tv_show": "TV box set" };

const SYSTEM = `You are the merchandising agent of Afterglow, an independent culture store (vinyl, books, films, games, TV).
Shoppers describe tastes; Qloo tells us which titles those tastes love most and which of them we do not stock.
Your job: propose a restock plan of exactly 3 titles that would serve the most unmet demand and fit the store.
Tools: coverage_report (start here), audience (who loves a title, Qloo demographics), place_on_map (where a title would sit
on our taste map and next to which of our titles; costly, use it for at most 2 titles), sections (our map sections and who shops them).
Prefer titles wanted by more shoppers and a mix of formats. Then call plan with 3 picks, each with one plain sentence on why:
which tastes asked for it (asked_by_tastes) and what it adds to the shelf. Do not mention ages, gender or map sections:
the app shows those next to each pick straight from Qloo data. Never invent numbers.
No em dashes. Always end with plan.`;

const TOOLS: Anthropic.Tool[] = [
  { name: "coverage_report", description: "Current taste coverage and the top missing titles with how many shoppers wanted each and the coverage gain if stocked.", input_schema: { type: "object", properties: {} } },
  { name: "audience", description: "Qloo demographics for one title: how its fans skew by age and gender.", input_schema: { type: "object", properties: { entity_id: { type: "string" } }, required: ["entity_id"] } },
  { name: "place_on_map", description: "Score a title against the store's 36 reference tastes (Qloo) and return the map section and our 3 closest titles.", input_schema: { type: "object", properties: { entity_id: { type: "string" } }, required: ["entity_id"] } },
  { name: "sections", description: "The store's map sections: name, size, who shops them (Qloo demographics).", input_schema: { type: "object", properties: {} } },
  { name: "plan", description: "Final restock plan: exactly 3 entity ids from coverage_report, each with a one-sentence reason.", input_schema: { type: "object", properties: { picks: { type: "array", items: { type: "object", properties: { entity_id: { type: "string" }, reason: { type: "string" } }, required: ["entity_id", "reason"] } }, summary: { type: "string" } }, required: ["picks"] } },
];

export interface PlanPick { entity_id: string; name: string; type: string; image: string | null; askedBy: number; reason: string; placement: Placement | null; audience?: string | null; tastes?: string[] }
export interface OwnerPlan { steps: Step[]; picks: PlanPick[]; summary: string; before: number; after: number; usd: number; qlooCalls: number; turns: number }

export async function runOwnerAgent(mine: DemandRow[], addedIds: string[]): Promise<OwnerPlan> {
  const rows = [...seedDemand, ...mine];
  const added = new Set(addedIds);
  const sugg = suggestions(rows, added).slice(0, 15);
  const before = coverage(rows, added);
  const steps: Step[] = [];
  const calls: QlooCall[] = [];
  const placements = new Map<string, Placement | null>();
  let live = 0;
  const audiences = new Map<string, string>(); // entity id -> Qloo demographics summary, shown with the pick
  // Which shopper tastes asked for a title (signals of the requests whose top 10 included it).
  const tastesFor = (id: string) => [...new Set(rows.filter((r) => r.wanted.some((w) => w.entity_id === id)).flatMap((r) => r.signals ?? []))].slice(0, 4);
  let usd = 0;
  const live40 = () => calls.filter((c) => c.cache === "miss").length >= 40;
  if (!process.env.ANTHROPIC_API_KEY || !canSpend()) throw new Error("The owner agent needs the live model");

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `Make this week's restock plan. ${rows.length} shopper requests so far (${mine.length} from this visitor).` }];
  for (let turn = 1; turn <= 6; turn++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 1500, system: SYSTEM, tools: TOOLS, messages });
    usd += record(MODEL, res.usage.input_tokens, res.usage.output_tokens);
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!uses.length) break;
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = u.input as Record<string, string>;
      const reply = (c: unknown, is_error = false) => results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(c), is_error });
      if (u.name === "plan") {
        const picks: PlanPick[] = [];
        for (const p of (u.input as { picks: Array<{ entity_id: string; reason: string }> }).picks ?? []) {
          // The model sometimes passes a title's name instead of its id: accept either.
          const key = String(p.entity_id ?? "").trim().toLowerCase();
          const s = sugg.find((x) => x.entity_id === p.entity_id) ?? sugg.find((x) => x.name.toLowerCase() === key);
          if (!s || picks.some((x) => x.entity_id === s.entity_id)) continue;
          picks.push({ entity_id: s.entity_id, name: s.name, type: s.type, image: s.image, askedBy: s.askedBy, reason: String(p.reason).replace(/\s*[\u2014\u2013]\s*/g, ", ").slice(0, 240), placement: placements.get(s.entity_id) ?? PRE[s.entity_id] ?? null, audience: audiences.get(s.entity_id) ?? null, tastes: tastesFor(s.entity_id) });
        }
        // Never show an empty or short plan: top up with the biggest coverage gains it did not pick.
        for (const s of sugg) {
          if (picks.length >= 3) break;
          if (picks.some((x) => x.entity_id === s.entity_id)) continue;
          picks.push({ entity_id: s.entity_id, name: s.name, type: s.type, image: s.image, askedBy: s.askedBy, reason: `Wanted by ${s.askedBy} shopper${s.askedBy > 1 ? "s" : ""}; one of the biggest coverage gains.`, placement: placements.get(s.entity_id) ?? PRE[s.entity_id] ?? null, audience: audiences.get(s.entity_id) ?? null, tastes: tastesFor(s.entity_id) });
        }
        const after = coverage(rows, new Set([...added, ...picks.map((p) => p.entity_id)]));
        steps.push({ kind: "rank", label: `Proposed ${picks.length} titles: coverage ${fmtPct(before)} -> ${fmtPct(after)}`, status: "ok" });
        return { steps, picks: picks.slice(0, 3), summary: String((u.input as { summary?: string }).summary ?? "").replace(/\s*[\u2014\u2013]\s*/g, ", ").slice(0, 300), before, after, usd, qlooCalls: calls.length, turns: turn };
      }
      if (u.name === "coverage_report") {
        steps.push({ kind: "read", label: `Read the demand: ${rows.length} requests, coverage ${fmtPct(before)}, ${sugg.length} top missing titles`, status: "ok" });
        reply({ coverage_pct: Math.round(before * 1000) / 10, requests: rows.length, missing: sugg.map((s) => ({ entity_id: s.entity_id, name: s.name, format: KIND[s.type] ?? s.type, wanted_by_shoppers: s.askedBy, asked_by_tastes: tastesFor(s.entity_id), coverage_gain_pts: Math.round(s.gain * 1000) / 10 })) });
      } else if (u.name === "sections") {
        steps.push({ kind: "read", label: "Looked at the map sections and who shops them", status: "ok" });
        reply(owner.sections.map((s) => ({ name: s.name, size: s.size, who: (s as { audience?: { summary: string } }).audience?.summary ?? null })));
      } else if (u.name === "audience") {
        if (live40()) { reply({ error: "Qloo budget for this run is used up" }, true); continue; }
        const a = await audience([input.entity_id], calls);
        const name = sugg.find((s) => s.entity_id === input.entity_id)?.name ?? input.entity_id;
        if (a) { audiences.set(input.entity_id, a.summary); steps.push({ kind: "lookup", label: `Who loves ${name}: ${a.summary.toLowerCase()}`, status: "ok" }); }
        reply(a ? { summary: a.summary } : { error: "no demographic data" }, !a);
      } else if (u.name === "place_on_map") {
        const s = sugg.find((x) => x.entity_id === input.entity_id);
        if (!s) { reply({ error: "only titles from coverage_report" }, true); continue; }
        let p: Placement | null = PRE[s.entity_id] ?? placements.get(s.entity_id) ?? null;
        if (!p && live < 1 && !live40() && SEED_IDS.has(s.entity_id)) { live++; p = await coldStart(s.entity_id, s.type as QlooEntityType, calls); } // live placement only for demo-demand titles, never for ids a browser sent
        placements.set(s.entity_id, p);
        if (p) steps.push({ kind: "score", label: `Placed ${s.name} on the map: ${p.clusterName}`, status: "ok" });
        reply(p ? { section: p.clusterName, nearest_store_titles: p.neighbours.map((n) => n.id) } : { error: "not placed (budget or no data)" }, !p);
      } else {
        reply({ error: "unknown tool" }, true);
      }
    }
    messages.push({ role: "user", content: results });
  }
  // No plan in time: take the top 3 by coverage gain.
  const picks = sugg.slice(0, 3).map((s) => ({ entity_id: s.entity_id, name: s.name, type: s.type, image: s.image, askedBy: s.askedBy, reason: `Wanted by ${s.askedBy} shopper(s).`, placement: PRE[s.entity_id] ?? null }));
  steps.push({ kind: "rank", label: "Agent ran out of steps; showing the top 3 by coverage gain", status: "warn" });
  return { steps, picks, summary: "", before, after: coverage(rows, new Set([...added, ...picks.map((p) => p.entity_id)])), usd, qlooCalls: calls.length, turns: 6 };
}

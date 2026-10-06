// The shop assistant as a tool-using agent. Claude decides which Qloo-backed tool to call next:
// find the shopper's tastes in Qloo, score our catalog, check what the store is missing, look up who the
// fans are, ask the shopper a question, or recommend. The expensive catalog scoring runs at most once;
// every run is capped in model turns and Qloo calls. Falls back to the fixed pipeline (run.ts) on failure.
import Anthropic from "@anthropic-ai/sdk";
import baselineFile from "@/data/baseline.json";
import { canSpend, record } from "@/lib/llm/budget";
import { QLOO_MODE, QlooUnavailable, type QlooCall } from "@/lib/qloo/client";
import type { QlooEntityType } from "@/lib/qloo/types";
import { audience } from "./audience";
import { tasteTags } from "./tasteTags";
import { demandGap, type Gap } from "./gap";
import { rank, shortlist, tasteLight, type Baseline, type Ranked } from "./rank";
import { runAgent, type AgentResult, type Pick, type Step } from "./run";
import { CATALOG, mapCatalog, resolveSignal, scoreCatalog, type Demo } from "./score";

const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5";
const MAX_TURNS = 6;
const MAX_QLOO_CALLS = 25;
const baseline = baselineFile.baseline as Baseline;
const KIND: Record<string, QlooEntityType> = {
  person: "urn:entity:person", artist: "urn:entity:artist", movie: "urn:entity:movie", tv_show: "urn:entity:tv_show",
  book: "urn:entity:book", video_game: "urn:entity:videogame", podcast: "urn:entity:podcast", brand: "urn:entity:brand",
};
// Genre words the model likes to attach to anything. A reason may use one only if the title's own data
// (title, category, Qloo tags, blurb) supports it; otherwise the app writes the reason from data instead.
const GENRES = ["western", "horror", "sci-fi", "science fiction", "thriller", "romance", "romantic", "fantasy", "jazz", "punk", "post-punk", "metal", "hip hop", "hip-hop", "folk", "country", "noir", "comedy", "documentary", "anime", "superhero", "mystery", "crime", "war", "musical", "indie", "shoegaze", "gothic", "goth", "psychedelic", "blues", "soul", "electronic", "dystopian", "cyberpunk"];
const supported = (reason: string, it: { title: string; category: string; tags?: string[]; blurb?: string; creators: string[] }, asked: string) => {
  const own = [it.title, it.category, ...(it.tags ?? []), it.blurb ?? "", ...it.creators].join(" ").toLowerCase();
  const shopper = asked.toLowerCase(); // a genre the shopper named may be quoted back ("for a fan of westerns")
  const word = (g: string) => new RegExp(`\\b${g}s?\\b`, "i"); // whole words only: "war" is not in "Edward"
  return GENRES.every((g) => !word(g).test(reason) || word(g).test(own) || (word(g).test(shopper) && new RegExp(`fans? of[^.,;]*\\b${g}`, "i").test(reason)));
};
const AGES = ["35_and_younger", "36_to_55", "55_and_older"] as const;
const GENDERS = ["male", "female"] as const;
// A budget in the shopper's own words ("under $30", "up to 40 dollars"), for when the model never passed one.
const budgetFrom = (text: string): number | null => {
  const m = text.match(/(?:under|below|less than|up to|max(?:imum)?|around|about|no more than|within)?\s*\$\s?(\d{1,4})|(\d{1,4})\s*(?:\$|dollars|usd)\b/i);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const KIND_WORD: Record<string, string> = { "urn:entity:artist": "records", "urn:entity:movie": "films", "urn:entity:book": "books", "urn:entity:videogame": "games", "urn:entity:tv_show": "TV shows" };
const FORMAT: Record<string, QlooEntityType> = { vinyl: "urn:entity:artist", book: "urn:entity:book", film: "urn:entity:movie", game: "urn:entity:videogame", tv: "urn:entity:tv_show" };

const SYSTEM = `You are the shop assistant agent of Afterglow, an independent store for vinyl, books, films, games and TV box sets.
Your goal: five titles from our shelves the recipient will love, within any budget, each with a plain reason,
and a record of what this taste loves that we do not carry (the owner restocks from it).
You decide which tools to use and in what order. What each tool is for:
- find_tastes turns what the shopper named into Qloo entities and returns how Qloo reads that taste as tags. If they describe a genre, scene or mood instead of titles,
  name two or three well-known works or artists that stand for it. Look up every name in one call when you can.
- score_catalog scores all 384 titles against those tastes. It is expensive: once per request, with formats, budget, and the recipient's age band and gender if the message gives them.
- check_store asks Qloo what this taste loves most anywhere and which of those we stock.
- audience tells you how fans of these tastes skew by age and gender; use it when the recipient sounds unlike the typical fan.
- ask_shopper asks one short question only when find_tastes found nothing you can use.
- recommend ends the turn with exactly 5 candidates from score_catalog.
Reasons may only use the facts score_catalog lists for that title (lead taste, Qloo tags, creators, year, format).
Never describe a genre, mood or plot that is not in its tags. Never invent titles or ids. Plain English, no em dashes.`;

const TOOLS: Anthropic.Tool[] = [
  { name: "find_tastes", description: "Resolve the cultural tastes the shopper named (artists, films, books, games, shows, people, brands) to Qloo entities.",
    input_schema: { type: "object", properties: { tastes: { type: "array", items: { type: "object", properties: { name: { type: "string" }, kind: { type: "string", enum: Object.keys(KIND) } }, required: ["name", "kind"] } } }, required: ["tastes"] } },
  { name: "score_catalog", description: "Score all 384 store titles against the found tastes with Qloo affinity and return the best candidates within budget. Expensive: call once.",
    input_schema: { type: "object", properties: { entity_ids: { type: "array", items: { type: "string" } }, formats: { type: "array", items: { type: "string", enum: Object.keys(FORMAT) } }, budget_usd: { type: ["number", "null"] }, recipient_age: { type: "string", enum: ["35_and_younger", "36_to_55", "55_and_older"], description: "Only if the message says or clearly implies the recipient's age (e.g. 'my dad, 60')." }, recipient_gender: { type: "string", enum: ["male", "female"], description: "Only if the message makes it clear." } }, required: ["entity_ids"] } },
  { name: "check_store", description: "Ask Qloo which 10 titles this taste loves most (any store) and see which ones Afterglow carries. Missing titles are reported to the shop owner.",
    input_schema: { type: "object", properties: { entity_ids: { type: "array", items: { type: "string" } }, formats: { type: "array", items: { type: "string", enum: Object.keys(FORMAT) } } }, required: ["entity_ids"] } },
  { name: "audience", description: "Qloo demographics: how fans of these tastes skew by age band and gender.",
    input_schema: { type: "object", properties: { entity_ids: { type: "array", items: { type: "string" } } }, required: ["entity_ids"] } },
  { name: "ask_shopper", description: "Ask the shopper one short question when the message has no taste you can work with. Ends the turn.",
    input_schema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] } },
  { name: "recommend", description: "Final answer: exactly 5 store titles from score_catalog candidates, each with a plain reason. Ends the turn.",
    input_schema: { type: "object", properties: { picks: { type: "array", items: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] } }, note: { type: "string" } }, required: ["picks"] } },
];

export interface AgenticResult extends AgentResult { question?: string; note?: string; audience?: string | null; turns: number; route?: string[] }

export async function runAgentic(request: string, onStep?: (s: Step) => void): Promise<AgenticResult> {
  if (!process.env.ANTHROPIC_API_KEY || !canSpend()) return { ...(await runAgent(request)), turns: 0 };
  try {
    return await loop(request, onStep);
  } catch (err) {
    if (err instanceof QlooUnavailable) throw err;
    console.error("agent loop failed, using the fixed pipeline", err);
    return { ...(await runAgent(request)), turns: 0 };
  }
}

async function loop(request: string, onStep?: (s: Step) => void): Promise<AgenticResult> {
  const client = new Anthropic({ timeout: 20000, maxRetries: 1 });
  const calls: QlooCall[] = [];
  const steps: Step[] = [];
  const emit = (s: Step) => { steps.push(s); onStep?.(s); }; // every step is also streamed to the live screen
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
  const route: string[] = []; // the tools the model chose, in order (eval and the live screen)
  let tags: string[] = []; // Qloo taste analysis (urn:tag) for the named tastes
  let demo: Demo = {}; // recipient age band and gender as Qloo demographic signals, when the message gives them
  let light: Record<string, number> = {};
  // Only entity ids find_tastes actually resolved; an id the model made up would make Qloo answer 400.
  const knownIds = (raw: unknown) => {
    const ok = new Set(named.map((n) => n.id));
    const ids = (Array.isArray(raw) ? raw : []).filter((x): x is string => typeof x === "string" && ok.has(x));
    return ids.length ? ids : named.map((n) => n.id);
  };
  // The named taste that contributes most to a title's Qloo score (explainability), or null.
  const lead = (id: string) => named.find((n) => n.id === [...(scores?.get(id)?.chain ?? [])].sort((a, b) => b.score - a.score)[0]?.entity_id)?.name ?? null;
  // A one-line Qloo fact for a pick, from data only: where it ranks among titles of its kind for this taste.
  // Keep the model's reason when the title's own data backs it; otherwise write it from Qloo data.
  const groundedWhy = (reason: string, r: Ranked) => {
    const clean = reason.replace(/\s*[\u2014\u2013]\s*/g, ", ").slice(0, 200);
    if (clean.trim() && supported(clean, r.item, request)) return clean;
    return `${r.item.category === "Books" ? "Read" : "Loved"} by fans of ${lead(r.item.id) ?? "the tastes you named"}, by Qloo's count.`;
  };
  const basis = (r: Ranked) => {
    if (r.direct.length) return `By ${r.direct.join(" and ")}, named in the request.`;
    const mine = light[r.item.id];
    if (mine === undefined) return undefined;
    const same = CATALOG.filter((i) => i.qloo.type === r.item.qloo.type && light[i.id] !== undefined);
    const rankHere = 1 + same.filter((i) => light[i.id] > mine).length;
    return `Qloo: #${rankHere} of ${same.length} ${KIND_WORD[r.item.qloo.type] ?? "titles"} here for fans of ${lead(r.item.id) ?? "these tastes"}.`;
  };

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 1500, system: SYSTEM, tools: TOOLS, messages });
    usd += record(MODEL, res.usage.input_tokens, res.usage.output_tokens);
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!uses.length) {
      // The model answered in plain text: if it is asking something, treat it as a question to the shopper.
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ").trim();
      if (named.length && turn < MAX_TURNS) {
        // It stopped mid-task with tastes in hand: nudge it to finish with the tools instead of losing the answer.
        messages.push({ role: "user", content: candidates.length ? "Call recommend now with 5 of the scored candidates." : "Call score_catalog with the tastes you found, then recommend." });
        continue;
      }
      if (text && !named.length) {
        emit({ kind: "read", label: `Asked you: ${text.slice(0, 200)}`, status: "warn" });
        return { request, extraction: { recipient: "", budget_usd: null, signals: [] } as never, steps, picks: [], calls, modes: { qloo: QLOO_MODE, llm: "agent" }, usd, gap, audience: aud, turns: turn, question: text.slice(0, 300) };
      }
      break;
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      route.push(u.name);
      const input = u.input as Record<string, unknown>;
      const reply = (content: unknown, is_error = false) => results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(content), is_error });

      if (u.name === "recommend" || u.name === "ask_shopper") {
        const base = { request, extraction: { recipient: "", budget_usd: budget, signals: named.map((n) => ({ name: n.name, kind: n.type })) }, steps, calls, modes: { qloo: QLOO_MODE, llm: "agent" }, usd, gap, audience: aud, turns: turn, route } as unknown as AgenticResult;
        if (u.name === "recommend" && !candidates.length && named.length) {
          reply({ error: "Nothing scored yet. Call score_catalog first, then recommend from its candidates." }, true);
          continue;
        }
        if (u.name === "ask_shopper" && named.length && candidates.length) {
          // Tastes were found and the catalog is scored: answer instead of asking (a question here only loses the shopper).
          reply({ error: "You already have tastes and scored candidates. Call recommend with 5 of them." }, true);
          continue;
        }
        if (u.name === "ask_shopper") {
          const q = String(input.question ?? "").replace(/\s*[\u2014\u2013]\s*/g, ", ").slice(0, 300);
          emit({ kind: "read", label: `Asked you: ${q}`, status: "warn" });
          return { ...base, picks: [], question: q };
        }
        // The store check feeds the owner's demand view, so it always runs before an answer, even if the model skipped it.
        if (u.name === "recommend" && !gap && named.length && !over()) {
          // Formats of the named tastes (a person is most often a director or an author: try films).
          const fmts = [...new Set(named.map((n) => (n.type === "urn:entity:person" ? "urn:entity:movie" : n.type)))];
          gap = await demandGap(named.map((n) => n.id), fmts, calls, demo);
          if (gap) emit({ kind: "score", label: `Store check: we carry ${gap.wanted.filter((w) => w.owned).length} of the ${gap.wanted.length} titles this taste loves most`, detail: `Missing ones go to the owner: ${gap.wanted.filter((w) => !w.owned).slice(0, 3).map((w) => w.name).join(", ")}`, status: "ok" });
          base.gap = gap;
        }
        const byId = new Map(candidates.map((r) => [r.item.id, r]));
        const picks: Pick[] = [];
        for (const p of (input.picks as Array<{ id: string; reason: string }>) ?? []) {
          const r = byId.get(p.id);
          if (!r || picks.some((x) => x.item.id === p.id)) continue; // only real catalog candidates, no duplicates
          picks.push({ item: r.item, affinity: r.affinity, lift: r.lift, chain: (scores?.get(r.item.id)?.chain ?? []).map((c) => ({ signal: named.find((n) => n.id === c.entity_id)?.name ?? c.entity_id, contribution: c.score })), why: groundedWhy(String(p.reason), r), direct: r.direct, basis: basis(r) });
        }
        // Ids the model mistyped are dropped above; never answer with fewer than 5 when we have candidates.
        for (const r of candidates) {
          if (picks.length >= 5) break;
          if (picks.some((x) => x.item.id === r.item.id)) continue;
          picks.push({ item: r.item, affinity: r.affinity, lift: r.lift, chain: (scores?.get(r.item.id)?.chain ?? []).map((c) => ({ signal: named.find((n) => n.id === c.entity_id)?.name ?? c.entity_id, contribution: c.score })), why: groundedWhy("", r), direct: r.direct, basis: basis(r) });
        }
        const note = typeof input.note === "string" ? input.note.replace(/\s*[\u2014\u2013]\s*/g, ", ").slice(0, 300) : undefined;
        emit({ kind: "rank", label: `Chose ${picks.length} pick(s) from ${candidates.length} candidates`, detail: note, status: picks.length ? "ok" : "warn" });
        return { ...base, picks: picks.slice(0, 5), note };
      }

      if (over()) { reply({ error: "Qloo call budget for this request is used up. Recommend from what you have." }, true); continue; }

      if (u.name === "find_tastes") {
        const found: unknown[] = [];
        const before = named.length;
        for (const t of ((input.tastes as Array<{ name: string; kind: string }>) ?? []).slice(0, 4)) {
          if (named.some((n) => n.name.toLowerCase() === String(t.name).toLowerCase())) continue; // already found in an earlier call
          const hit = await resolveSignal(t.name, KIND[t.kind], calls);
          if (hit) { named.push({ name: t.name, id: hit.entity_id, type: KIND[t.kind] ?? "" }); found.push({ name: t.name, qloo_name: hit.name, entity_id: hit.entity_id, exact: hit.exact }); }
          else found.push({ name: t.name, not_found: true });
        }
        if (found.length) emit({ kind: "lookup", label: before ? `Looked up ${found.length} more taste(s) in Qloo` : `Looked up ${found.length} taste(s) in Qloo`, detail: named.slice(before).map((n) => n.name).join(", ") || "none found", status: named.length ? "ok" : "dropped" });
        // Taste analysis: how Qloo reads these tastes as tags. Once, after the first successful lookup.
        if (!tags.length && named.length && !over()) {
          tags = await tasteTags(named.map((n) => n.id), calls, 8, named.map((n) => n.type));
          if (tags.length) emit({ kind: "lookup", label: "Qloo reads this taste as", detail: tags.join(", "), status: "ok", tags });
        }
        reply({ found, qloo_taste_tags: tags });
      } else if (u.name === "score_catalog") {
        if (!ranked) {
          const ids = knownIds(input.entity_ids);
          budget = typeof input.budget_usd === "number" ? input.budget_usd : budgetFrom(request); // the message's own budget if the model left it out
          const formats = ((input.formats as string[]) ?? []).map((f) => FORMAT[f]).filter(Boolean);
          const itemIds = await mapCatalog(calls);
          // Only the values Qloo accepts; anything else the model invents is dropped instead of failing the call.
          const age = AGES.find((a) => a === input.recipient_age);
          const gender = GENDERS.find((g) => g === input.recipient_gender);
          demo = { ...(age ? { age } : {}), ...(gender ? { gender } : {}) };
          const scored = await scoreCatalog(ids, itemIds, calls, CATALOG, demo);
          scores = scored.scores;
          ranked = rank({ arm: "qloo", items: CATALOG, signalNames: named.map((n) => n.name), scores, baseline, taste: "pct+fmt", formats, exclude: new Set(ids) });
          candidates = shortlist(ranked, budget, 12, 3);
          light = tasteLight(CATALOG, scores);
          emit({ kind: "score", label: `Scored all ${CATALOG.length} titles with Qloo affinity`, detail: `${candidates.length} candidates within budget${budget ? ` ($${budget})` : ""}${demo.age || demo.gender ? `, weighted for a recipient ${[demo.gender, demo.age?.replace(/_/g, " ")].filter(Boolean).join(", ")} (Qloo demographics)` : ""}`, status: "ok", light });
        }
        reply(candidates.map((r) => ({ id: r.item.id, title: r.item.title, format: r.item.category, year: r.item.year ?? null, creators: r.item.creators.slice(0, 3), qloo_tags: (r.item.tags ?? []).slice(0, 6), price_usd: r.item.price_usd, by_named_taste: r.direct, qloo_lead_taste: lead(r.item.id) })));
      } else if (u.name === "check_store") {
        if (!gap) {
          const formats = ((input.formats as string[]) ?? []).map((f) => FORMAT[f]).filter(Boolean);
          gap = await demandGap(knownIds(input.entity_ids), formats, calls, demo);
          if (gap) emit({ kind: "score", label: `Store check: we carry ${gap.wanted.filter((w) => w.owned).length} of the ${gap.wanted.length} titles this taste loves most`, detail: `Missing ones go to the owner: ${gap.wanted.filter((w) => !w.owned).slice(0, 3).map((w) => w.name).join(", ")}`, status: "ok" });
        }
        reply(gap ? { carried: gap.wanted.filter((w) => w.owned).map((w) => w.name), missing: gap.wanted.filter((w) => !w.owned).map((w) => w.name) } : { error: "no data" }, !gap);
      } else if (u.name === "audience") {
        const a = await audience(knownIds(input.entity_ids), calls);
        aud = a?.summary ?? null;
        if (a) emit({ kind: "lookup", label: `Who these fans are: ${a.summary}`, status: "ok" });
        reply(a ?? { error: "no demographic data" }, !a);
      } else {
        reply({ error: `unknown tool ${u.name}` }, true);
      }
    }
    messages.push({ role: "user", content: results });
  }
  // The model stopped early (or ran out of turns) without recommending. If tastes were found but the catalog was
  // never scored, score it now so the shopper still gets an answer.
  if (!ranked && named.length && !over()) {
    budget = budget ?? budgetFrom(request); // the model never called score_catalog, so take the budget from the message
    const scored = await scoreCatalog(named.map((n) => n.id), await mapCatalog(calls), calls, CATALOG, demo);
    scores = scored.scores;
    ranked = rank({ arm: "qloo", items: CATALOG, signalNames: named.map((n) => n.name), scores, baseline, taste: "pct+fmt", formats: [], exclude: new Set(named.map((n) => n.id)) });
    candidates = shortlist(ranked, budget, 12, 3);
    light = tasteLight(CATALOG, scores);
    emit({ kind: "score", label: `Scored all ${CATALOG.length} titles with Qloo affinity`, detail: `${candidates.length} candidates${budget ? ` within budget ($${budget})` : ""}`, status: "ok", light });
  }
  // Out of turns without a final answer: fall back to the deterministic shortlist we already have.
  const picks: Pick[] = candidates.slice(0, 5).map((r) => ({ item: r.item, affinity: r.affinity, lift: r.lift, chain: [], why: groundedWhy("", r), direct: r.direct, basis: basis(r) }));
  emit({ kind: "rank", label: "Agent ran out of steps; showing the top scored titles", status: "warn" });
  return { request, extraction: { recipient: "", budget_usd: budget, signals: named.map((n) => ({ name: n.name, kind: n.type })) } as never, steps, picks, calls, modes: { qloo: QLOO_MODE, llm: "agent" }, usd, gap, audience: aud, turns: MAX_TURNS, route };
}

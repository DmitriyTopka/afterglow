// Who may spend live Qloo and Claude calls, and how much.
// LIVE_MODE=closed keeps the public demo on recorded runs (until the deadline, so nobody can burn the month's
// Qloo quota before judging). A request carrying the pass (LIVE_PASS, sent by the browser from ?pass= in the link)
// is always live. The lane travels with the request (AsyncLocalStorage), so the Qloo client and the Claude budget
// can give judges a deeper reserve than anonymous traffic without threading a flag through every call.
import { AsyncLocalStorage } from "node:async_hooks";
import saved from "@/data/saved_answers.json";

export type Lane = { judge: boolean };
export const lane = new AsyncLocalStorage<Lane>();

export function hasPass(req: Request): boolean {
  const pass = process.env.LIVE_PASS ?? "";
  return pass.length >= 8 && req.headers.get("x-afterglow-pass") === pass;
}

/** Live work for this request: with the pass always, without it only when LIVE_MODE is not "closed". */
export function liveFor(req: Request): { live: boolean; judge: boolean } {
  const judge = hasPass(req);
  return { live: judge || process.env.LIVE_MODE !== "closed", judge };
}

export const PAUSED_NOTE = "The live agent is paused right now, so here is a recorded live run for the closest taste.";

// The recorded example closest to a typed request: most shared words with the request and its named tastes.
const SAVED = saved as Record<string, { extraction?: { signals?: Array<{ name: string }> } }>;
// Words every request shares ("loves", "something") say nothing about taste; they must not decide the match.
const STOP = new Set(["love", "loves", "into", "like", "likes", "something", "anything", "under", "with", "what", "would", "every", "winter", "really", "also", "they", "that", "this", "from", "have", "gift", "birthday", "books", "films", "movies", "music", "games", "shows", "fans", "huge", "obsessed"]);
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !STOP.has(w)));
export function nearestSaved(message: string): string {
  const mine = words(message);
  let best = Object.keys(SAVED)[0];
  let score = -1;
  for (const [text, run] of Object.entries(SAVED)) {
    const theirs = words(`${text} ${(run.extraction?.signals ?? []).map((s) => s.name).join(" ")}`);
    const n = [...mine].filter((w) => theirs.has(w)).length;
    if (n > score) { score = n; best = text; }
  }
  return best;
}

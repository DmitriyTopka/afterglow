import cycle from "@/data/cycle.json";
import { QlooUnavailable } from "@/lib/qloo/client";
import { coldStart } from "@/lib/agent/coldstart";
import type { QlooCall } from "@/lib/qloo/client";
import type { QlooEntityType } from "@/lib/qloo/types";
import { allow, isEntityId } from "@/lib/limits";
import { lane, liveFor } from "@/lib/access";

export const maxDuration = 60;

// Cold start for the owner's "add to shelf". Titles from the demo demand are precomputed in data/cycle.json;
// anything else is placed live (36 Qloo calls), capped per instance per day to protect the API quota.
const PRE = cycle.placements as Record<string, unknown>;
const TYPES = new Set(["urn:entity:artist", "urn:entity:book", "urn:entity:movie", "urn:entity:videogame", "urn:entity:tv_show"]);
let day = "";
let used = 0;
const DAILY_LIVE = 10;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { entity_id?: string; type?: string };
  const id = isEntityId(body.entity_id) ? body.entity_id : "";
  const type = typeof body.type === "string" && TYPES.has(body.type) ? (body.type as QlooEntityType) : null;
  if (!id || !type) return Response.json({ error: "entity_id and a sellable type are required" }, { status: 400 });
  if (PRE[id]) return Response.json({ placement: PRE[id], calls: 0, precomputed: true });
  const access = liveFor(req);
  if (!access.live) return Response.json({ error: "Live placement is paused right now. Titles from the demo demand still place instantly." }, { status: 503 });
  const gate = access.judge ? allow(req, "place-judge", 20, 60) : allow(req, "place", 5, 10);
  if (!gate.ok) return Response.json({ error: gate.reason }, { status: 429 });
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; used = 0; }
  if (used >= DAILY_LIVE && !access.judge) return Response.json({ error: "Live placement limit for today is reached. Try a title from the demo demand." }, { status: 429 });
  used++;
  const calls: QlooCall[] = [];
  try {
    const placement = await lane.run({ judge: access.judge }, () => coldStart(id, type, calls));
    if (!placement) return Response.json({ error: "Qloo has too little taste data on this title to place it." }, { status: 422 });
    return Response.json({ placement, calls: calls.length, precomputed: false });
  } catch (err) {
    if (err instanceof QlooUnavailable) return Response.json({ error: err.message, offline: true }, { status: 503 });
    console.error(err);
    return Response.json({ error: "Placing this title failed. Try again in a minute." }, { status: 502 });
  }
}

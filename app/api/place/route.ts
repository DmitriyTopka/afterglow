import cycle from "@/data/cycle.json";
import { coldStart } from "@/lib/agent/coldstart";
import type { QlooCall } from "@/lib/qloo/client";
import type { QlooEntityType } from "@/lib/qloo/types";
import { allow } from "@/lib/limits";

export const maxDuration = 60;

// Cold start for the owner's "add to shelf". Titles from the demo demand are precomputed in data/cycle.json;
// anything else is placed live (36 Qloo calls), capped per instance per day to protect the API quota.
const PRE = cycle.placements as Record<string, unknown>;
const TYPES = new Set(["urn:entity:artist", "urn:entity:book", "urn:entity:movie", "urn:entity:videogame", "urn:entity:tv_show"]);
let day = "";
let used = 0;
const DAILY_LIVE = 25;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { entity_id?: string; type?: string };
  const id = typeof body.entity_id === "string" ? body.entity_id.slice(0, 64) : "";
  const type = typeof body.type === "string" && TYPES.has(body.type) ? (body.type as QlooEntityType) : null;
  if (!id || !type) return Response.json({ error: "entity_id and a sellable type are required" }, { status: 400 });
  if (PRE[id]) return Response.json({ placement: PRE[id], calls: 0, precomputed: true });
  const gate = allow(req, 5, 25);
  if (!gate.ok) return Response.json({ error: gate.reason }, { status: 429 });
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; used = 0; }
  if (used >= DAILY_LIVE) return Response.json({ error: "Live placement limit for today is reached. Try a title from the demo demand." }, { status: 429 });
  used++;
  const calls: QlooCall[] = [];
  try {
    const placement = await coldStart(id, type, calls);
    if (!placement) return Response.json({ error: "Qloo has too little taste data on this title to place it." }, { status: 422 });
    return Response.json({ placement, calls: calls.length, precomputed: false });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Placing this title failed. Try again in a minute." }, { status: 502 });
  }
}

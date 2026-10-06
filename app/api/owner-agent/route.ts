import { runOwnerAgent } from "@/lib/agent/ownerAgent";
import { QlooUnavailable } from "@/lib/qloo/client";
import type { DemandRow } from "@/lib/cycle";
import { allow } from "@/lib/limits";

export const maxDuration = 60;

// The owner's restock agent. The browser sends only its own requests and added titles; demo demand is server-side.
export async function POST(req: Request) {
  const gate = allow(req, 10, 100);
  if (!gate.ok) return Response.json({ error: gate.reason }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { mine?: DemandRow[]; added?: string[] };
  const mine = Array.isArray(body.mine) ? body.mine.slice(-30).filter((r) => Array.isArray(r?.wanted)).map((r) => ({ ...r, wanted: r.wanted.slice(0, 10) })) : [];
  const added = Array.isArray(body.added) ? body.added.filter((x) => typeof x === "string").slice(0, 50) : [];
  try {
    return Response.json(await runOwnerAgent(mine, added));
  } catch (err) {
    if (err instanceof QlooUnavailable) return Response.json({ error: err.message, offline: true }, { status: 503 });
    console.error(err);
    return Response.json({ error: "The restock agent could not run right now." }, { status: 502 });
  }
}

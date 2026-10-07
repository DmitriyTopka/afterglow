import { runOwnerAgent } from "@/lib/agent/ownerAgent";
import { QlooUnavailable } from "@/lib/qloo/client";
import type { DemandRow } from "@/lib/cycle";
import { allow, isEntityId } from "@/lib/limits";
import { lane, liveFor } from "@/lib/access";

export const maxDuration = 60;

// The owner's restock agent. The browser sends only its own requests and added titles; demo demand is server-side.
export async function POST(req: Request) {
  const access = liveFor(req);
  const gate = access.judge ? allow(req, "owner-agent-judge", 30, 200) : allow(req, "owner-agent", 5, 30);
  if (!gate.ok) return Response.json({ error: gate.reason }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { mine?: DemandRow[]; added?: string[] };
  // The browser's rows are untrusted: keep only well-formed Qloo ids, short names and https images.
  const clean = (w: unknown) => {
    const x = w as { entity_id?: unknown; name?: unknown; type?: unknown; image?: unknown; affinity?: unknown; owned?: unknown };
    if (!isEntityId(x?.entity_id) || typeof x.name !== "string" || typeof x.type !== "string") return null;
    return { entity_id: x.entity_id, name: x.name.slice(0, 80), type: x.type.slice(0, 40), image: typeof x.image === "string" && x.image.startsWith("https://") ? x.image.slice(0, 300) : null, affinity: typeof x.affinity === "number" ? x.affinity : 0, owned: x.owned === true };
  };
  const mine = (Array.isArray(body.mine) ? body.mine.slice(-30) : [])
    .map((r) => ({ id: String(r?.id ?? "").slice(0, 40), source: "you" as const, message: String(r?.message ?? "").slice(0, 300), signals: (Array.isArray(r?.signals) ? r.signals : []).slice(0, 6).map((x) => String(x).slice(0, 80)), wanted: (Array.isArray(r?.wanted) ? r.wanted : []).slice(0, 10).map(clean).filter((w): w is NonNullable<ReturnType<typeof clean>> => w !== null) }))
    .filter((r) => r.wanted.length > 0) as DemandRow[];
  const added = Array.isArray(body.added) ? body.added.filter(isEntityId).slice(0, 50) : [];
  try {
    return Response.json(await lane.run({ judge: access.judge }, () => runOwnerAgent(mine, added, { paused: !access.live })));
  } catch (err) {
    if (err instanceof QlooUnavailable) return Response.json({ error: err.message, offline: true }, { status: 503 });
    console.error(err);
    return Response.json({ error: "The restock agent could not run right now." }, { status: 502 });
  }
}

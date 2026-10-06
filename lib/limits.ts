// Per-instance request limits for the public demo, so a script or a crowd cannot burn the Qloo quota.
// Each route has its own bucket: a busy live screen must not lock judges out of the owner's agent.
// Not shared across serverless instances; the Qloo client's quota reserve and the LLM daily cap still apply.
const buckets = new Map<string, { perIp: Map<string, number>; total: number }>();
let day = "";

export function allow(req: Request, route: string, perIpDaily = 20, totalDaily = 300): { ok: true } | { ok: false; reason: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; buckets.clear(); }
  const b = buckets.get(route) ?? { perIp: new Map<string, number>(), total: 0 };
  buckets.set(route, b);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const n = b.perIp.get(ip) ?? 0;
  if (n >= perIpDaily) return { ok: false, reason: "You have used today's live requests. The examples above still work." };
  if (b.total >= totalDaily) return { ok: false, reason: "The demo has reached today's live request limit. The examples above still work." };
  b.perIp.set(ip, n + 1); b.total++;
  return { ok: true };
}

/** Qloo entity ids are UUIDs; anything else is rejected before it can reach the API. */
export const isEntityId = (x: unknown): x is string => typeof x === "string" && /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(x);

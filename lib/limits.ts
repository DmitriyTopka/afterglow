// Per-instance request limits for the public demo, so a script or a crowd cannot burn the Qloo quota.
// Not shared across serverless instances; the Qloo client's own pacing and the LLM daily cap still apply.
const perIp = new Map<string, number>();
let day = "";
let total = 0;

export function allow(req: Request, perIpDaily = 20, totalDaily = 300): { ok: true } | { ok: false; reason: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; total = 0; perIp.clear(); }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const n = perIp.get(ip) ?? 0;
  if (n >= perIpDaily) return { ok: false, reason: "You have used today's live requests. The examples above still work." };
  if (total >= totalDaily) return { ok: false, reason: "The demo has reached today's live request limit. The examples above still work." };
  perIp.set(ip, n + 1); total++;
  return { ok: true };
}

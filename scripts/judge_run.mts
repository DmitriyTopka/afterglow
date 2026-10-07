// Judge-style smoke test: 30 requests written blind, the way a first-time judge would type them. Runs the live agent
// and stores what a judge would see (picks with format and price, the reasons, any question), for review by hand.
// Usage: npx tsx scripts/judge_run.mts <requests.json> <out.json>
import "./env.mts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { runAgentic } = await import("../lib/agent/agentic.ts");
  const [src, OUT] = process.argv.slice(2);
  const reqs: Array<{ id: string; message: string; expect: string }> = JSON.parse(readFileSync(src, "utf8"));
  const runs: Record<string, any> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  let usd = 0, live = 0;
  for (const r of reqs) {
    if (runs[r.id]) continue;
    const t0 = Date.now();
    try {
      const a = await runAgentic(r.message);
      usd += a.usd; live += a.calls.filter((c: any) => c.cache === "miss").length;
      runs[r.id] = { message: r.message, expect: r.expect, secs: Math.round((Date.now() - t0) / 1000), llm: a.modes.llm, turns: a.turns, route: a.route ?? [], question: a.question ?? null,
        tastes: a.extraction?.signals?.map((s: any) => `${s.name} (${s.kind})`) ?? [],
        picks: a.picks.map((p: any) => ({ title: p.item.title, category: p.item.category, price: p.item.price_usd, why: p.why, basis: p.basis })) };
    } catch (err) {
      runs[r.id] = { message: r.message, expect: r.expect, error: String(err) };
    }
    writeFileSync(OUT, JSON.stringify(runs, null, 1));
    const x = runs[r.id];
    console.log(`${r.id} ${x.error ? "ERROR" : `${x.secs}s ${x.route.join(">")} | ${x.question ? "Q: " + x.question.slice(0, 60) : x.picks.map((p: any) => p.category).join(",")}`}`);
  }
  console.log(`spent this run: $${usd.toFixed(3)}, live Qloo calls ${live}`);
})();

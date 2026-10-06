// Eval v4 (07.10): the agent after the council fixes (goal-based prompt, no fixed plan; grounded reasons;
// act merge) on the same 40 frozen blind scenarios. Records the tool route the model chose for each request.
// Claude-only and pipeline arms are reused from v3 (eval/v3_runs.json); they did not change.
import "./env.mts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { runAgentic } = await import("../lib/agent/agentic.ts");
  const { scenarios } = JSON.parse(readFileSync("eval/v2_scenarios.json", "utf8"));
  const OUT = "eval/v4_runs.json";
  const runs: Record<string, any> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  let usd = 0, live = 0;
  for (const s of scenarios) {
    if (runs[s.id]) continue;
    const a = await runAgentic(s.message);
    usd += a.usd; live += a.calls.filter((c: any) => c.cache === "miss").length;
    runs[s.id] = { ids: a.picks.map((p: any) => p.item.id), question: a.question ?? null, turns: a.turns, route: a.route ?? [], qloo: a.calls.filter((c: any) => c.cache === "miss").length, llm: a.modes.llm, why: a.picks.map((p: any) => p.why) };
    writeFileSync(OUT, JSON.stringify(runs, null, 1));
    console.log(`${s.id} ${(a.route ?? []).join(">")} | ${runs[s.id].ids.slice(0, 3).join(",") || "Q"}`);
  }
  console.log(`spent this run: $${usd.toFixed(3)}, live Qloo calls ${live}`);
})();

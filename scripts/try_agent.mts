// Run the tool-using agent on a few messages and print what it did.
import "./env.mts";
(async () => {
  const { runAgentic } = await import("../lib/agent/agentic.ts");
  const msgs = process.argv.slice(2);
  for (const m of msgs) {
    const t0 = Date.now();
    const r = await runAgentic(m);
    console.log(`\n== ${m}\n   llm=${r.modes.llm} turns=${r.turns} qloo=${r.calls.filter((c) => c.cache === "miss").length} live/${r.calls.length} total  $${r.usd.toFixed(4)}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const s of r.steps) console.log(`   - ${s.label}${s.detail ? "  [" + s.detail.slice(0, 90) + "]" : ""}`);
    if (r.question) console.log("   QUESTION:", r.question);
    for (const p of r.picks) console.log(`   * ${p.item.title.slice(0, 50)} - ${p.why}`);
  }
})();

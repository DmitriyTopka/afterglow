import "./env.mts";
(async () => {
  const { runOwnerAgent } = await import("../lib/agent/ownerAgent.ts");
  const t0 = Date.now();
  const r = await runOwnerAgent([], []);
  console.log(`turns ${r.turns} qloo ${r.qlooCalls} $${r.usd.toFixed(4)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${Math.round(r.before * 100)}% -> ${Math.round(r.after * 100)}%`);
  for (const s of r.steps) console.log(" -", s.label);
  for (const p of r.picks) console.log(" *", p.name, "|", p.reason, "|", p.placement?.clusterName ?? "-");
  console.log(" summary:", r.summary);
})();

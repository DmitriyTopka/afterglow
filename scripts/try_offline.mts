// What does a live request do when the Qloo key stops working? (simulated with a wrong key)
process.env.QLOO_API_KEY = "invalid-for-test";
import "./env.mts";
(async () => {
  const { runAgentic } = await import("../lib/agent/agentic.ts");
  try { const r = await runAgentic("He loves Radiohead and Blade Runner, something under $30, a brand new request " + Date.now()); console.log("returned", r.modes, r.picks.length, r.steps.map((s) => s.label)); }
  catch (e) { console.log("threw:", String(e).slice(0, 200)); }
})();

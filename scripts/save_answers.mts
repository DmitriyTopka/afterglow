// Run the live agent once for every one-click example and store the answers in data/saved_answers.json.
import "./env.mts";
import { writeFileSync } from "node:fs";
(async () => {
  const { runAgentic } = await import("../lib/agent/agentic.ts");
  const { EXAMPLES } = await import("../data/examples.ts");
  const saved: Record<string, unknown> = {};
  for (const ex of EXAMPLES) {
    const r = await runAgentic(ex.text);
    if (r.modes.llm !== "agent" || r.modes.qloo !== "live") throw new Error(`not live for "${ex.label}": ${JSON.stringify(r.modes)}`);
    saved[ex.text] = { ...r, calls: r.calls.map(({ endpoint, params, cache, ms }) => ({ endpoint, params, cache, ms })), savedAt: new Date().toISOString() };
    console.log(`${ex.label}: ${r.extraction.signals.map((s) => s.name).join(", ")} -> ${r.picks.map((p) => p.item.title.slice(0, 28)).join(" | ")}  ($${r.usd.toFixed(4)})`);
  }
  writeFileSync("data/saved_answers.json", JSON.stringify(saved, null, 1));
})();

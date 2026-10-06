// Usage: start the app (npm run dev), then: npm run eval [-- --base http://localhost:3000]
// Arm "qloo" = the full agent. Arm "baseline" (LLM picks from the catalog without Qloo) lands with the live LLM key.
import { readFile, writeFile } from "node:fs/promises";

const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "http://localhost:3000";
const { scenarios } = JSON.parse(await readFile(new URL("./scenarios.json", import.meta.url), "utf8"));

const rows = [];
for (const s of scenarios) {
  const res = await fetch(`${base}/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: s.message }),
  });
  const out = await res.json();
  const top3 = (out.picks ?? []).slice(0, 3).map((p) => p.item.id);
  const hits = top3.filter((id) => s.good.includes(id)).length;
  rows.push({ id: s.id, top3, hits, precision_at_3: hits / 3, modes: out.modes });
  console.log(`${s.id}  P@3=${(hits / 3).toFixed(2)}  top3=${top3.join(",")}  qloo=${out.modes?.qloo} llm=${out.modes?.llm}`);
}
const mean = rows.reduce((a, r) => a + r.precision_at_3, 0) / rows.length;
console.log(`\nqloo arm: mean P@3 = ${mean.toFixed(2)} over ${rows.length} scenarios`);
await writeFile(new URL(`./results/run-${Date.now()}.json`, import.meta.url), JSON.stringify({ mean, rows }, null, 2));

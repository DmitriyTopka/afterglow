// Adds the Qloo taste-analysis step and the full Qloo call log (endpoint + params) to the recorded example runs,
// rebuilt from the same Qloo queries (cache first). The model's picks and words stay exactly as recorded.
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { resolveSignal, mapCatalog, scoreCatalog } = await import("../lib/agent/score.ts");
  const { tasteTags } = await import("../lib/agent/tasteTags.ts");
  const { demandGap } = await import("../lib/agent/gap.ts");
  const saved = JSON.parse(readFileSync("data/saved_answers.json", "utf8"));
  for (const [text, run] of Object.entries<any>(saved)) {
    const calls: any[] = [];
    const ids: string[] = []; const types: string[] = [];
    for (const s of run.extraction.signals) { const hit = await resolveSignal(s.name, s.kind, calls); if (hit) { ids.push(hit.entity_id); types.push(s.kind === "urn:entity:person" ? "urn:entity:movie" : s.kind); } }
    const tags = await tasteTags(ids, calls);
    await scoreCatalog(ids, await mapCatalog(calls), calls);
    await demandGap(ids, [...new Set(types)], calls);
    run.calls = calls.map(({ endpoint, params, cache }) => ({ endpoint, params, cache }));
    run.steps = run.steps.filter((s: any) => s.label !== "Qloo reads this taste as");
    if (tags.length) run.steps.splice(1, 0, { kind: "lookup", label: "Qloo reads this taste as", detail: tags.join(", "), status: "ok", tags });
    console.log(text.slice(0, 30), "| tags:", tags.slice(0, 5).join(", "), "| calls", calls.length, "live", calls.filter((c) => c.cache === "miss").length);
  }
  writeFileSync("data/saved_answers.json", JSON.stringify(saved, null, 1));
})();

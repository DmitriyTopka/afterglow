// Adds the taste light (per-format affinity percentile for all 384 titles) to the recorded example runs, without
// re-running the model: the picks stay exactly as recorded. Qloo answers come from the local cache.
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { resolveSignal, mapCatalog, scoreCatalog, CATALOG } = await import("../lib/agent/score.ts");
  const { tasteLight } = await import("../lib/agent/rank.ts");
  const saved = JSON.parse(readFileSync("data/saved_answers.json", "utf8"));
  for (const [text, run] of Object.entries<any>(saved)) {
    const calls: any[] = [];
    const ids: string[] = [];
    for (const s of run.extraction.signals) {
      const hit = await resolveSignal(s.name, s.kind, calls);
      if (hit) ids.push(hit.entity_id);
    }
    const { scores } = await scoreCatalog(ids, await mapCatalog(calls), calls);
    const step = run.steps.find((s: any) => s.label.startsWith("Scored all"));
    step.light = tasteLight(CATALOG, scores);
    const top = Object.entries<number>(step.light).filter(([, v]) => v >= 0.95).length;
    const pickLight = run.picks.map((p: any) => step.light[p.item.id]);
    console.log(text.slice(0, 40), "| signals", ids.length, "| calls", calls.length, "live", calls.filter((c) => c.cache === "miss").length, "| >=0.95:", top, "| picks:", pickLight.join(" "));
  }
  writeFileSync("data/saved_answers.json", JSON.stringify(saved, null, 1));
})();

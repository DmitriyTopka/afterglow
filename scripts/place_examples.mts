// Cold-start placements for the titles the four one-click examples find missing (first 2 each), added to
// data/cycle.json. Clicking "Add to shelf" on an example then needs no live Qloo calls. Cache first.
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { coldStart } = await import("../lib/agent/coldstart.ts");
  const saved = JSON.parse(readFileSync("data/saved_answers.json", "utf8"));
  const cycle = JSON.parse(readFileSync("data/cycle.json", "utf8"));
  const calls: any[] = [];
  for (const run of Object.values<any>(saved)) {
    for (const w of (run.gap?.wanted ?? []).filter((w: any) => !w.owned).slice(0, 2)) {
      if (cycle.placements[w.entity_id]) { console.log(`have ${w.name}`); continue; }
      const p = await coldStart(w.entity_id, w.type, calls);
      if (p) cycle.placements[w.entity_id] = p;
      console.log(`placed ${w.name} -> ${p?.clusterName ?? "no data"}`);
    }
  }
  writeFileSync("data/cycle.json", JSON.stringify(cycle, null, 1));
  console.log(`placements ${Object.keys(cycle.placements).length} | Qloo calls ${calls.length}, live ${calls.filter((c) => c.cache === "miss").length}`);
})();

// Resolve the 36 reference tastes behind the map to Qloo entity ids once, so placing a new title on the map
// (cold start) needs no searches at run time. Output: data/probes.json in the same order as the map projection.
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { resolveSignal } = await import("../lib/agent/score.ts");
  const { probes } = JSON.parse(readFileSync("data/taste_map.json", "utf8")).projection;
  const types = new Map<string, string>();
  for (const p of JSON.parse(readFileSync("data/reference_profiles.json", "utf8")).profiles) types.set(p.name, p.type);
  for (const m of readFileSync("scripts/taste_probes.mts", "utf8").matchAll(/\["([^"]+)", "(urn:entity:[a-z_]+)"\]/g)) types.set(m[1], m[2]);
  const calls: any[] = [];
  const out = [];
  for (const key of probes as string[]) {
    const name = key.split(" -> ")[0];
    const s = await resolveSignal(name, types.get(name), calls);
    out.push({ key, name, entity_id: s?.entity_id ?? null });
  }
  writeFileSync("data/probes.json", JSON.stringify(out, null, 1));
  console.log(out.filter((p) => p.entity_id).length, "of", out.length, "resolved | live calls", calls.filter((c) => c.cache === "miss").length);
})();

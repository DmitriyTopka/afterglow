// "What to stock next": for a map section, ask Qloo what its audience loves (top items of the section as signals)
// and keep only titles the store does not carry. Usage: stock_next.mts [clusterId...]
import "./env.mts";
import { readFileSync } from "node:fs";
(async () => {
  const { insights } = await import("../lib/qloo/client.ts");
  const items = JSON.parse(readFileSync("data/catalog.json", "utf8")).items;
  const map = JSON.parse(readFileSync("data/taste_map.json", "utf8"));
  const owned = new Set(items.map((i: any) => i.qloo.entity_id));
  const calls: any[] = [];
  for (const cid of process.argv.slice(2).map(Number)) {
    const c = map.clusters[cid];
    const members = items.filter((i: any) => map.items[i.id]?.cluster === cid);
    const seeds = c.examples.slice(0, 5).map((t: string) => members.find((m: any) => m.title === t)?.qloo.entity_id).filter(Boolean);
    console.log(`\n== ${c.name} (seeds: ${c.examples.slice(0, 5).map((t: string) => t.slice(0, 25)).join(" / ")})`);
    for (const t of ["urn:entity:artist", "urn:entity:movie", "urn:entity:book"]) {
      const res = await insights({ "filter.type": t as any, "signal.interests.entities": seeds.join(","), take: "15" }, calls);
      const fresh = (res.results.entities ?? []).filter((e: any) => !owned.has(e.entity_id)).slice(0, 5);
      console.log(`  ${t.split(":").pop()}: ${fresh.map((e: any) => e.name).join(", ")}`);
    }
  }
  console.log("live Qloo calls:", calls.filter((c) => c.cache === "miss").length);
})();

// Some Qloo insights results come without an image. Look those titles up once with /search (same type)
// and copy the image into the demo demand (data/cycle.json).
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { search } = await import("../lib/qloo/client.ts");
  const cycle = JSON.parse(readFileSync("data/cycle.json", "utf8"));
  const calls: any[] = []; const found = new Map<string, string | null>();
  for (const row of cycle.demand) for (const w of row.wanted) {
    if (w.image || w.owned) continue;
    if (!found.has(w.entity_id)) {
      const hits = (await search(w.name, w.type, calls)).results ?? [];
      const h = hits.find((x: any) => x.entity_id === w.entity_id) ?? null;
      const url = (h?.properties as any)?.image?.url ?? "";
      found.set(w.entity_id, url.startsWith("http") ? url : null);
    }
    w.image = found.get(w.entity_id) ?? null;
  }
  writeFileSync("data/cycle.json", JSON.stringify(cycle, null, 1));
  console.log("looked up", found.size, "| got images", [...found.values()].filter(Boolean).length, "| live calls", calls.filter((c) => c.cache === "miss").length);
})();

// Per-item dump for one message: affinity, baseline mean/sd, z-lift, direct match. Diagnostic only.
import "./env.mts";
import { readFileSync } from "node:fs";
(async () => {
  const msg = process.argv[2];
  const { mockExtract } = await import("../lib/llm/extract.ts");
  const { search } = await import("../lib/qloo/client.ts");
  const { mapCatalog, scoreCatalog, resolveSignal } = await import("../lib/agent/score.ts");
  const { directMatches } = await import("../lib/agent/rank.ts");
  const catalog = JSON.parse(readFileSync("data/catalog_v1.json", "utf8")); // the 06.10 eval ran on catalog v1
  const { baseline } = JSON.parse(readFileSync("data/baseline_v1.json", "utf8"));
  const KIND: any = { person: "urn:entity:person", artist: "urn:entity:artist", movie: "urn:entity:movie", book: "urn:entity:book", video_game: "urn:entity:videogame", brand: "urn:entity:brand" };
  const calls: any[] = [];
  const ex = mockExtract(msg);
  const ids: string[] = [];
  for (const x of ex.signals) { const h = await resolveSignal(x.name, KIND[x.kind], calls); if (h) { ids.push(h.entity_id); console.log("signal", x.name, "->", h.name); } }
  const itemIds = await mapCatalog(calls, catalog.items);
  const { scores } = await scoreCatalog(ids, itemIds, calls, catalog.items);
  const rows = catalog.items.map((it: any) => { const s = scores.get(it.id), b = baseline[it.id]; return { it, a: s?.affinity, b, z: s && b ? (s.affinity - b.mean) / Math.max(b.sd, 0.02) : null, d: directMatches(it, ex.signals.map((x) => x.name)) }; });
  rows.sort((x: any, y: any) => (y.z ?? -99) - (x.z ?? -99));
  for (const r of rows) console.log(`${r.d.length ? "D" : " "} ${r.it.id} ${r.it.qloo.type.split(":").pop()!.padEnd(9)} aff=${r.a?.toFixed(3) ?? " null"} base=${r.b?.mean.toFixed(3) ?? "  -  "}±${r.b?.sd.toFixed(3) ?? " - "} z=${r.z?.toFixed(2) ?? "null"} $${r.it.price_usd} ${r.it.title.slice(0, 40)}`);
  console.log("live calls", calls.filter((c) => c.cache === "miss").length);
})();

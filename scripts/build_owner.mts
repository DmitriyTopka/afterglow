// Owner view data (precomputed, cached): for each map section, who shops there and what to stock next;
// plus five new products placed on the map by cold start. Output: data/owner.json.
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { insights } = await import("../lib/qloo/client.ts");
  const { resolveSignal } = await import("../lib/agent/score.ts");
  const { place, PROBES } = await import("../lib/agent/place.ts");
  const items = JSON.parse(readFileSync("data/catalog.json", "utf8")).items;
  const map = JSON.parse(readFileSync("data/taste_map.json", "utf8"));
  const owned = new Set(items.map((i: any) => i.qloo.entity_id));
  const TYPES = ["urn:entity:artist", "urn:entity:movie", "urn:entity:book", "urn:entity:videogame", "urn:entity:tv_show"];
  const calls: any[] = [];
  const img = (e: any) => { const u = e.properties?.image?.url ?? ""; return u.startsWith("http") ? u : null; };

  const sections: any[] = [];
  for (const c of map.clusters) {
    const members = items.filter((i: any) => map.items[i.id]?.cluster === c.id);
    const byTitle = new Map(members.map((m: any) => [m.title, m]));
    const top = c.examples.slice(0, 5).map((t: string) => byTitle.get(t)).filter(Boolean);
    const who = map.projection.centroids[c.id].map((v: number, k: number) => ({ taste: PROBES[k].split(" -> ")[0], weight: v }))
      .sort((a: any, b: any) => b.weight - a.weight).slice(0, 5);
    const stock: any[] = [];
    for (const t of TYPES) {
      const res = await insights({ "filter.type": t as any, "signal.interests.entities": top.map((m: any) => m.qloo.entity_id).join(","), take: "12" }, calls);
      for (const e of (res.results.entities ?? []).filter((e: any) => !owned.has(e.entity_id) && img(e)).slice(0, 2))
        stock.push({ entity_id: e.entity_id, name: e.name, type: t, image: img(e), affinity: e.query?.affinity ?? null, blurb: e.properties?.short_description ?? null });
    }
    stock.sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
    sections.push({ id: c.id, name: c.name, line: c.line, size: c.size, categories: c.categories, who, signals: top.map((m: any) => m.id), stock: stock.slice(0, 8) });
    console.log(`${c.name}: who ${who.slice(0, 3).map((w: any) => w.taste).join(", ")} | stock ${stock.slice(0, 4).map((s) => s.name).join(", ")}`);
  }

  // Cold start demo: the top "stock next" suggestion of five different sections, placed from Qloo data alone.
  const probeType = new Map<string, string>();
  for (const p of JSON.parse(readFileSync("data/reference_profiles.json", "utf8")).profiles) probeType.set(p.name, p.type);
  for (const m of readFileSync("scripts/taste_probes.mts", "utf8").matchAll(/\["([^"]+)", "(urn:entity:[a-z_]+)"\]/g)) probeType.set(m[1], m[2]);
  const newcomers = sections.filter((s) => s.stock.length).slice(0, 9).map((s) => ({ ...s.stock[0], suggestedBy: s.id })).filter((x, k, a) => a.findIndex((y) => y.entity_id === x.entity_id) === k).slice(0, 5);
  for (const n of newcomers) {
    const aff: Array<number | null> = [];
    for (const key of PROBES) {
      const name = key.split(" -> ")[0];
      const s = await resolveSignal(name, probeType.get(name), calls);
      if (!s) { aff.push(null); continue; }
      try {
        const res = await insights({ "filter.type": n.type, "signal.interests.entities": s.entity_id, "filter.results.entities": n.entity_id, take: "1" }, calls);
        aff.push(res.results.entities?.[0]?.query?.affinity ?? null);
      } catch { aff.push(null); }
    }
    n.placement = place(aff, n.type);
    console.log(`cold start: ${n.name} -> ${n.placement?.clusterName} (suggested by ${sections[n.suggestedBy].name}), neighbours ${n.placement?.neighbours.map((x: any) => items.find((i: any) => i.id === x.id)?.title.slice(0, 25)).join(" / ")}`);
  }
  writeFileSync("data/owner.json", JSON.stringify({ note: "Built by scripts/build_owner.mts", sections, coldStart: newcomers }, null, 1));
  console.log("live Qloo calls:", calls.filter((c) => c.cache === "miss").length);
})();

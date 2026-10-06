// Taste vectors for the map: affinity of every catalog item for a set of probe tastes (Qloo insights).
// Each item gets one number per probe; the map is built from these vectors (scripts/build_map.py).
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { resolveSignal, mapCatalog, scoreCatalog } = await import("../lib/agent/score.ts");
  const items = JSON.parse(readFileSync("data/catalog.json", "utf8")).items;
  const PROBES: Array<[string, string]> = [
    ["Beyoncé", "urn:entity:artist"], ["Bob Dylan", "urn:entity:artist"], ["Kanye West", "urn:entity:artist"], ["Drake", "urn:entity:artist"],
    ["Lana Del Rey", "urn:entity:artist"], ["Slipknot", "urn:entity:artist"], ["Ed Sheeran", "urn:entity:artist"], ["Frank Ocean", "urn:entity:artist"],
    ["Ludwig van Beethoven", "urn:entity:artist"], ["Dolly Parton", "urn:entity:artist"], ["BLACKPINK", "urn:entity:artist"], ["Star Wars", "urn:entity:movie"],
    ["Pulp Fiction", "urn:entity:movie"], ["Frozen", "urn:entity:movie"], ["Parasite", "urn:entity:movie"], ["Twilight", "urn:entity:movie"],
    ["The Office", "urn:entity:tv_show"], ["Game of Thrones", "urn:entity:tv_show"], ["The Lord of the Rings", "urn:entity:book"],
    ["The Great Gatsby", "urn:entity:book"], ["Atomic Habits", "urn:entity:book"], ["Call of Duty", "urn:entity:videogame"],
    ["Animal Crossing: New Horizons", "urn:entity:videogame"], ["Dark Souls", "urn:entity:videogame"], ["Supreme", "urn:entity:brand"], ["Chanel", "urn:entity:brand"],
  ];
  const calls: any[] = [];
  // ONLY_MISSING=1: score only items that have no vector yet and merge, instead of re-scoring the catalog.
  const base = JSON.parse(readFileSync("data/baseline.json", "utf8")).matrix;
  const prevTv = process.env.ONLY_MISSING ? JSON.parse(readFileSync("data/taste_vectors.json", "utf8")).matrix : {};
  const known = new Set(Object.values(prevTv).flatMap((m: any) => Object.keys(m)));
  const todo = items.filter((i: any) => !known.has(i.id));
  const itemIds = await mapCatalog(calls, todo);
  const matrix: Record<string, Record<string, number>> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(prevTv)])) matrix[k] = { ...(prevTv[k] ?? {}), ...(base[k] ?? {}) };
  for (const [name, type] of PROBES) {
    const s = await resolveSignal(name, type, calls);
    if (!s) { console.log("not found", name); continue; }
    try {
      const { scores } = await scoreCatalog([s.entity_id], itemIds, calls, todo);
      if (!scores.size) { console.log("no scores", name); continue; }
      const key = `${name} -> ${s.name}`;
      matrix[key] = { ...(matrix[key] ?? {}), ...Object.fromEntries([...scores].map(([id, v]) => [id, v.affinity])) };
    } catch (e) { console.log("skip", name, String(e).slice(0, 80)); }
  }
  const usable = Object.entries(matrix).filter(([, m]) => Object.keys(m).length > 0);
  writeFileSync("data/taste_vectors.json", JSON.stringify({ note: "Qloo affinity of each catalog item for each probe taste", probes: usable.map(([k]) => k), matrix: Object.fromEntries(usable) }, null, 0));
  console.log("probes with scores:", usable.length, "| live Qloo calls:", calls.filter((c) => c.cache === "miss").length);
})();

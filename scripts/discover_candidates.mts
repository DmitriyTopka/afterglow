// Step 1 of the real catalog: ask Qloo which artists, books, films, games and shows people with diverse
// tastes actually like. 20 seed tastes x 5 types, take 20 each. Output: data/catalog_build/candidates.json.
import "./env.mts";
import { mkdirSync, writeFileSync } from "node:fs";
(async () => {
  const { insights } = await import("../lib/qloo/client.ts");
  const { resolveSignal } = await import("../lib/agent/score.ts");
  const SEEDS: Array<[string, string]> = [
    ["Taylor Swift", "urn:entity:artist"], ["Metallica", "urn:entity:artist"], ["Kendrick Lamar", "urn:entity:artist"],
    ["Miles Davis", "urn:entity:artist"], ["Radiohead", "urn:entity:artist"], ["Bad Bunny", "urn:entity:artist"],
    ["Johnny Cash", "urn:entity:artist"], ["BTS", "urn:entity:artist"], ["Fleetwood Mac", "urn:entity:artist"],
    ["Billie Eilish", "urn:entity:artist"], ["The Godfather", "urn:entity:movie"], ["Spirited Away", "urn:entity:movie"],
    ["Barbie", "urn:entity:movie"], ["Mad Max: Fury Road", "urn:entity:movie"], ["Pride and Prejudice", "urn:entity:book"],
    ["The Hunger Games", "urn:entity:book"], ["Stephen King", "urn:entity:person"], ["Minecraft", "urn:entity:videogame"],
    ["The Witcher 3: Wild Hunt", "urn:entity:videogame"], ["Breaking Bad", "urn:entity:tv_show"],
  ];
  const TYPES = ["urn:entity:artist", "urn:entity:book", "urn:entity:movie", "urn:entity:videogame", "urn:entity:tv_show"];
  const calls: any[] = [];
  const cand = new Map<string, any>();
  for (const [name, type] of SEEDS) {
    const s = await resolveSignal(name, type, calls);
    if (!s) { console.log("seed not found:", name); continue; }
    for (const t of TYPES) {
      let res: any;
      try {
        res = await insights({ "filter.type": t as any, "signal.interests.entities": s.entity_id, take: "20" }, calls);
      } catch (err) {
        console.log(`skip ${name} -> ${t.split(":").pop()}: ${String(err).slice(0, 90)}`);
        continue;
      }
      for (const e of res.results.entities ?? []) {
        const c = cand.get(e.entity_id) ?? { entity_id: e.entity_id, name: e.name, type: t, popularity: e.popularity ?? null, seeds: [], affinity: [], properties: e.properties ?? {}, tags: (e.tags ?? []).map((x: any) => x.name) };
        c.seeds.push(name);
        c.affinity.push(e.query?.affinity ?? null);
        cand.set(e.entity_id, c);
      }
    }
    console.log(`${name}: candidates so far ${cand.size}`);
  }
  mkdirSync("data/catalog_build", { recursive: true });
  writeFileSync("data/catalog_build/candidates.json", JSON.stringify([...cand.values()], null, 1));
  const byType = Object.fromEntries(TYPES.map((t) => [t.split(":").pop(), [...cand.values()].filter((c) => c.type === t).length]));
  console.log("by type:", byType, "| with image:", [...cand.values()].filter((c) => c.properties?.image?.url?.startsWith("http")).length);
  console.log("live Qloo calls:", calls.filter((c) => c.cache === "miss").length);
})();

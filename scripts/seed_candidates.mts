// The discovery step never returns the seed tastes themselves (Qloo leaves the signal out of its own results),
// so the store was missing Taylor Swift, Miles Davis, Kendrick Lamar... Fetch those entities directly.
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { search } = await import("../lib/qloo/client.ts");
  const { norm } = await import("../lib/agent/rank.ts");
  const NAMES: Array<[string, string]> = [
    ...["Taylor Swift", "Metallica", "Kendrick Lamar", "Miles Davis", "Radiohead", "Bad Bunny", "Johnny Cash", "BTS", "Fleetwood Mac", "Billie Eilish",
      "Beyoncé", "Bob Dylan", "Kanye West", "Drake", "Lana Del Rey", "Slipknot", "Ed Sheeran", "Frank Ocean", "Dolly Parton", "BLACKPINK", "Joe Hisaishi", "Hans Zimmer", "Daft Punk"].map((n) => [n, "urn:entity:artist"] as [string, string]),
    ...["The Godfather", "Spirited Away", "Barbie", "Mad Max: Fury Road", "Star Wars", "Pulp Fiction", "Frozen", "Parasite", "Twilight", "Interstellar", "Inception"].map((n) => [n, "urn:entity:movie"] as [string, string]),
    ...["The Hunger Games", "The Lord of the Rings", "The Great Gatsby", "Atomic Habits", "Kafka on the Shore", "Murder on the Orient Express", "The House in the Cerulean Sea", "It"].map((n) => [n, "urn:entity:book"] as [string, string]),
    ...["Minecraft", "The Witcher 3: Wild Hunt", "Animal Crossing: New Horizons", "Dark Souls", "Elden Ring", "Stardew Valley"].map((n) => [n, "urn:entity:videogame"] as [string, string]),
    ...["Breaking Bad", "The Office", "Game of Thrones", "Friends"].map((n) => [n, "urn:entity:tv_show"] as [string, string]),
  ];
  const owned = new Set(JSON.parse(readFileSync("data/catalog.json", "utf8")).items.map((i: any) => i.qloo.entity_id));
  const calls: any[] = []; const out: any[] = [];
  for (const [name, type] of NAMES) {
    const hits = (await search(name, type, calls)).results ?? [];
    const h = hits.find((e: any) => norm(e.name).startsWith(norm(name))) ?? hits[0];
    if (!h || owned.has(h.entity_id)) { console.log("skip", name, h ? "(already in catalog)" : "(not found)"); continue; }
    out.push({ entity_id: h.entity_id, name: h.name, type, popularity: h.popularity ?? null, seeds: ["direct"], affinity: [], properties: h.properties ?? {}, tags: (h.tags ?? []).map((x: any) => x.name) });
  }
  writeFileSync("data/catalog_build/seed_candidates.json", JSON.stringify(out, null, 1));
  console.log("seed candidates:", out.length, "| with http image:", out.filter((c) => c.properties?.image?.url?.startsWith("http")).length, "| live calls:", calls.filter((c) => c.cache === "miss").length);
})();

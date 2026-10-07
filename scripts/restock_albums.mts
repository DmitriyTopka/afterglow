// The owner's restock list names artists (that is what Qloo returns); a shop orders records. For every missing artist in
// the demo demand and the recorded examples, take the artist's most popular album from the iTunes Search API
// (free, no key; compilations, live and karaoke albums skipped). Output: data/restock_albums.json {entity_id: {...}}.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
(async () => {
  const OUT = "data/restock_albums.json";
  const out: Record<string, { artist: string; album: string; year: string | null }> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const cycle = JSON.parse(readFileSync("data/cycle.json", "utf8"));
  const saved = JSON.parse(readFileSync("data/saved_answers.json", "utf8"));
  const artists = new Map<string, string>();
  for (const d of cycle.demand) for (const w of d.wanted) if (!w.owned && w.type === "urn:entity:artist") artists.set(w.entity_id, w.name);
  for (const r of Object.values<any>(saved)) for (const w of r.gap?.wanted ?? []) if (!w.owned && w.type === "urn:entity:artist") artists.set(w.entity_id, w.name);
  const SKIP = /\b(live|greatest|best of|hits|collection|essential|anthology|karaoke|tribute|remix(es)?|singles|playlist|christmas|demos|sessions|unplugged)\b/i;
  const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
  let n = 0;
  for (const [id, name] of artists) {
    if (out[id]) continue;
    const res = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term: name, entity: "album", limit: "25", country: "US" })}`);
    if (!res.ok) { console.log("itunes", res.status, "stopping; rerun later"); break; }
    const data = await res.json() as { results: Array<{ artistName: string; collectionName: string; releaseDate?: string; trackCount?: number }> };
    const hit = data.results.find((a) => norm(a.artistName) === norm(name) && !SKIP.test(a.collectionName) && (a.trackCount ?? 0) >= 6);
    if (hit) out[id] = { artist: name, album: hit.collectionName.replace(/\s*\((?:Remaster(?:ed)?|Deluxe[^)]*|Expanded[^)]*|\d{4} Remaster[^)]*)\)\s*$/i, ""), year: hit.releaseDate?.slice(0, 4) ?? null };
    console.log(name, "->", hit ? `${out[id].album} (${out[id].year})` : "none");
    writeFileSync(OUT, JSON.stringify(out, null, 1));
    n++;
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("artists", artists.size, "with album", Object.keys(out).length, "looked up now", n);
})();

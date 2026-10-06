// Coverage of a real product sample in Qloo: what share of items resolve to a Qloo entity at all.
// Input data/coverage/sample.json (300 random Amazon listings, 10 categories). One typed /search per lookup, cached.
// found = exact normalized name among the top 3 hits; loose = one name contains the other (>= 5 chars).
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { search } = await import("../lib/qloo/client.ts");
  const { norm } = await import("../lib/agent/rank.ts");
  const sample = JSON.parse(readFileSync("data/coverage/sample.json", "utf8"));
  const MEDIA: Record<string, string> = { Books: "urn:entity:book", Movies_and_TV: "urn:entity:movie", Video_Games: "urn:entity:videogame" };
  const clean = (t: string) => t.replace(/[\[(][^\])]*[\])]/g, " ").replace(/\b(DVD|Blu-ray|VHS|PC|PS[2-5]|Xbox( One| 360| Series X)?|Nintendo Switch|Steam|Standard Edition)\b/gi, " ").split(/[:\-–|,]/)[0].replace(/\s+/g, " ").trim();
  const firstName = (s: string | null) => (s ?? "").split(/\(|,|Format:/)[0].replace(/\s+/g, " ").trim();
  const calls: any[] = [];
  const rows: any[] = [];
  const look = async (raw: string, type: string) => {
    const q = raw.length > 100 ? raw.slice(0, 100).replace(/\s+\S*$/, "") : raw; // Qloo rejects queries over 100 chars
    if (!q || q.length < 2) return { q, status: "skip", hit: null };
    const hits = (await search(q, type, calls)).results ?? [];
    const k = norm(q);
    const exact = hits.find((h: any) => norm(h.name) === k);
    if (exact) return { q, status: "found", hit: exact.name, pop: exact.popularity ?? null };
    const loose = hits.find((h: any) => { const n = norm(h.name); return n.length >= 5 && k.length >= 5 && (n.includes(k) || k.includes(n)); });
    if (loose) return { q, status: "loose", hit: loose.name, pop: loose.popularity ?? null };
    return { q, status: "none", hit: hits[0]?.name ?? null };
  };
  for (const it of sample) {
    let r: any;
    if (MEDIA[it.cat]) r = await look(clean(it.title), MEDIA[it.cat]);
    else if (it.cat === "CDs_and_Vinyl") r = await look(firstName(it.store), "urn:entity:artist");
    else r = await look(firstName(it.store), "urn:entity:brand");
    const author = it.cat === "Books" ? await look(firstName(it.store), "urn:entity:person") : null;
    rows.push({ ...it, lookup: r, author });
  }
  const cats = [...new Set(rows.map((r) => r.cat))];
  console.log("category                    found  loose  none  skip   (what is looked up)");
  const tot = { found: 0, loose: 0, none: 0, skip: 0 };
  for (const c of cats) {
    const rs = rows.filter((r) => r.cat === c);
    const n = (s: string) => rs.filter((r) => r.lookup.status === s).length;
    for (const s of ["found", "loose", "none", "skip"] as const) tot[s] += n(s);
    const what = c === "CDs_and_Vinyl" ? "artist" : ["Books", "Movies_and_TV", "Video_Games"].includes(c) ? "title" : "brand";
    console.log(`${c.padEnd(28)}${String(n("found")).padStart(5)}${String(n("loose")).padStart(7)}${String(n("none")).padStart(6)}${String(n("skip")).padStart(6)}   ${what}`);
  }
  const books = rows.filter((r) => r.cat === "Books");
  console.log(`Books, author as a person: found ${books.filter((r) => r.author?.status === "found").length}, loose ${books.filter((r) => r.author?.status === "loose").length} of ${books.length}`);
  console.log(`TOTAL of ${rows.length}: found ${tot.found}, loose ${tot.loose}, none ${tot.none}, skip ${tot.skip}`);
  console.log("live Qloo calls:", calls.filter((c) => c.cache === "miss").length);
  writeFileSync("data/coverage/result.json", JSON.stringify(rows, null, 1));
})();

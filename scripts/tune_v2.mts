// Ranking variants chosen on the ODD v2 scenarios only; the winner is checked once on the EVEN ones.
// Variants (declared before looking at results):
//   A  exclude the exact titles the shopper named (keep other works by the same creator)
//   B  taste score for non-direct titles: z = lift vs reference tastes (current) | raw = Qloo affinity |
//      pct = affinity percentile within the title's format | pct+fmt = pct plus a bonus for the formats the shopper named
//   C  at most 1 or 2 titles per format in the shortlist
import "./env.mts";
import { readFileSync } from "node:fs";
(async () => {
  const { resolveSignal, mapCatalog, scoreCatalog } = await import("../lib/agent/score.ts");
  const { directMatches, lift } = await import("../lib/agent/rank.ts");
  const items = JSON.parse(readFileSync("data/catalog.json", "utf8")).items;
  const { baseline } = JSON.parse(readFileSync("data/baseline.json", "utf8"));
  const { scenarios } = JSON.parse(readFileSync("eval/v2_scenarios.json", "utf8"));
  const ex = JSON.parse(readFileSync("eval/v2_extractions.json", "utf8"));
  const split = process.argv[2] ?? "odd";
  const only = process.argv[3]; // optional "A,B,C" to run one variant
  const KIND: Record<string, string> = { person: "urn:entity:person", artist: "urn:entity:artist", movie: "urn:entity:movie", tv_show: "urn:entity:tv_show", book: "urn:entity:book", video_game: "urn:entity:videogame", brand: "urn:entity:brand", podcast: "urn:entity:podcast" };
  const FMT: Record<string, string> = { artist: "urn:entity:artist", movie: "urn:entity:movie", tv_show: "urn:entity:tv_show", book: "urn:entity:book", video_game: "urn:entity:videogame" };
  const calls: any[] = [];
  const itemIds = await mapCatalog(calls, items);
  const set = scenarios.filter((s: any) => (Number(s.id.slice(1)) % 2 === 1) === (split === "odd"));
  const prepared: any[] = [];
  for (const s of set) {
    const e = ex[s.id];
    const names = e.signals.map((x: any) => x.name);
    const ids: string[] = [];
    for (const x of e.signals) { const h = await resolveSignal(x.name, KIND[x.kind], calls); if (h) ids.push(h.entity_id); }
    const { scores } = ids.length ? await scoreCatalog(ids, itemIds, calls, items) : { scores: new Map() };
    // affinity percentile within format
    const pct = new Map<string, number>();
    for (const t of new Set(items.map((i: any) => i.qloo.type))) {
      const xs = items.filter((i: any) => i.qloo.type === t && scores.has(i.id)).sort((a: any, b: any) => scores.get(a.id).affinity - scores.get(b.id).affinity);
      xs.forEach((i: any, k: number) => pct.set(i.id, (k + 1) / xs.length));
    }
    prepared.push({ s, names, ids: new Set(ids), scores, pct, fmts: new Set(e.signals.map((x: any) => FMT[x.kind]).filter(Boolean)), budget: e.budget_usd });
  }
  const variants: string[] = [];
  for (const A of ["keep", "exclude"]) for (const B of ["z", "raw", "pct", "pct+fmt"]) for (const C of ["1", "2"]) variants.push(`${A},${B},${C}`);
  const res: Array<[string, number]> = [];
  for (const v of only ? [only] : variants) {
    const [A, B, C] = v.split(",");
    let total = 0;
    for (const p of prepared) {
      const rows = items.filter((it: any) => !(A === "exclude" && p.ids.has(it.qloo.entity_id))).map((it: any) => {
        const sc = p.scores.get(it.id);
        let taste = -50;
        if (sc) taste = B === "z" ? (lift(it.id, sc, baseline) ?? -50) : B === "raw" ? sc.affinity * 10 : (p.pct.get(it.id) ?? 0) * 10 + (B === "pct+fmt" && p.fmts.has(it.qloo.type) ? 5 : 0);
        return { it, score: directMatches(it, p.names).length * 1000 + taste };
      }).sort((a: any, b: any) => b.score - a.score || a.it.id.localeCompare(b.it.id));
      const per = new Map<string, number>(); const top: any[] = [];
      for (const r of rows) {
        if (p.budget && r.it.price_usd > p.budget) continue;
        const n = per.get(r.it.category) ?? 0; if (n >= Number(C)) continue;
        per.set(r.it.category, n + 1); top.push(r.it); if (top.length === 3) break;
      }
      total += top.filter((it) => p.s.good.includes(it.id)).length / 3;
    }
    res.push([v, total / prepared.length]);
  }
  res.sort((a, b) => b[1] - a[1]);
  for (const [v, m] of res) console.log(`${split} n=${prepared.length}  ${v.padEnd(20)} P@3 ${m.toFixed(3)}`);
  console.log("live Qloo calls:", calls.filter((c) => c.cache === "miss").length);
})();

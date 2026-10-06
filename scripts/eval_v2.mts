// Eval v2 on the real catalog (384 items), frozen blind labels in eval/v2_scenarios.json.
// Arms, all with the same extracted signals, budget rule and one-per-category shortlist:
//   random:  expected P@3 of a random order (Monte Carlo)
//   rules:   store metadata only: titles by/of a named taste first, then titles sharing a creator with those; no Qloo, no tags
//   qloo:    Qloo lift only (no direct-match rule)
//   hybrid:  the live agent: direct matches first, then Qloo lift
import "./env.mts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { extract } = await import("../lib/llm/extract.ts");
  const { resolveSignal, mapCatalog, scoreCatalog } = await import("../lib/agent/score.ts");
  const { rank, shortlist, directMatches, norm } = await import("../lib/agent/rank.ts");
  const items = JSON.parse(readFileSync("data/catalog.json", "utf8")).items;
  const { baseline } = JSON.parse(readFileSync("data/baseline.json", "utf8"));
  const { scenarios } = JSON.parse(readFileSync("eval/v2_scenarios.json", "utf8"));
  const KIND: Record<string, string> = { person: "urn:entity:person", artist: "urn:entity:artist", movie: "urn:entity:movie", tv_show: "urn:entity:tv_show", book: "urn:entity:book", video_game: "urn:entity:videogame", brand: "urn:entity:brand", podcast: "urn:entity:podcast" };
  const EX = "eval/v2_extractions.json"; // extraction is done once and reused, so every arm sees the same signals
  const exCache: Record<string, any> = existsSync(EX) ? JSON.parse(readFileSync(EX, "utf8")) : {};
  let usd = 0;
  const calls: any[] = [];
  const itemIds = await mapCatalog(calls, items);
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rows: any[] = [];
  for (const s of scenarios) {
    if (!exCache[s.id]) { const r = await extract(s.message); usd += r.usd; exCache[s.id] = { ...r.extraction, mode: r.mode }; }
    const ex = exCache[s.id];
    const names: string[] = ex.signals.map((x: any) => x.name);
    const ids: string[] = [];
    for (const x of ex.signals) { const h = await resolveSignal(x.name, KIND[x.kind], calls); if (h) ids.push(h.entity_id); }
    const { scores } = ids.length ? await scoreCatalog(ids, itemIds, calls, items) : { scores: new Map() };
    const good = new Set<string>(s.good);
    const budget = ex.budget_usd;
    const top3 = (ranked: any[]) => shortlist(ranked, budget).slice(0, 3);
    // Diagnostics (not the shipped behaviour): budget only, no one-per-category rule, and the exact titles the
    // shopper named left out (labels treat "I love X, what else?" as already owning X).
    const named = new Set(ids);
    const freeTop3 = (ranked: any[]) => ranked.filter((r) => (!budget || r.item.price_usd <= budget) && !named.has(r.item.qloo.entity_id) && r.score > -1e9).slice(0, 3);
    const xtop3 = (ranked: any[]) => shortlist(ranked.filter((r) => !directMatches(r.item, names).length), budget).slice(0, 3);
    const hybrid = rank({ arm: "qloo", items, signalNames: names, scores, baseline });
    const qloo = rank({ arm: "qloo", items, signalNames: [], scores, baseline });
    const direct = new Set(items.filter((i: any) => directMatches(i, names).length).map((i: any) => i.id));
    const directCreators = new Set(items.filter((i: any) => direct.has(i.id)).flatMap((i: any) => i.creators.map(norm)));
    const rules = items.map((item: any) => {
      const d = directMatches(item, names).length;
      const shared = item.creators.filter((c: string) => directCreators.has(norm(c))).length;
      return { item, direct: directMatches(item, names), affinity: null, lift: null, tagScore: 0, score: d * 1000 + shared };
    }).sort((a: any, b: any) => b.score - a.score || a.item.id.localeCompare(b.item.id));
    const out: any = { id: s.id, group: s.group, signals: names, budget };
    for (const [arm, ranked] of [["rules", rules], ["qloo", qloo], ["hybrid", hybrid]] as const) {
      const t = top3(ranked as any[]), x = xtop3(ranked as any[]);
      const f = freeTop3(ranked as any[]);
      out[arm] = { top3: t.map((r: any) => r.item.id), p3: t.filter((r: any) => good.has(r.item.id)).length / 3,
        ftop3: f.map((r: any) => r.item.id), fp3: f.filter((r: any) => good.has(r.item.id)).length / 3, xtop3: x.map((r: any) => r.item.id), xp3: x.filter((r: any) => good.has(r.item.id)).length / 3 };
    }
    let acc = 0;
    for (let k = 0; k < 1000; k++) acc += top3(items.map((item: any) => ({ item, direct: [], score: rnd() })).sort((a: any, b: any) => b.score - a.score)).filter((r: any) => good.has(r.item.id)).length / 3;
    out.random = { p3: acc / 1000 };
    rows.push(out);
    console.log(`${s.id} ${s.group.padEnd(12)} rand ${out.random.p3.toFixed(2)} rules ${out.rules.p3.toFixed(2)} qloo ${out.qloo.p3.toFixed(2)} hybrid ${out.hybrid.p3.toFixed(2)} | x: rules ${out.rules.xp3.toFixed(2)} qloo ${out.qloo.xp3.toFixed(2)} hybrid ${out.hybrid.xp3.toFixed(2)}  [${names.join(", ")}]`);
  }
  writeFileSync(EX, JSON.stringify(exCache, null, 1));
  writeFileSync("eval/results/v2-" + Date.now() + ".json", JSON.stringify(rows, null, 1));
  const mean = (f: (r: any) => number, rs = rows) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(2);
  for (const g of ["all", "in_store", "not_in_store", "multi"]) {
    const rs = g === "all" ? rows : rows.filter((r) => r.group === g);
    console.log(`\n[${g}] n=${rs.length}  P@3 random ${mean((r) => r.random.p3, rs)} rules ${mean((r) => r.rules.p3, rs)} qloo ${mean((r) => r.qloo.p3, rs)} hybrid ${mean((r) => r.hybrid.p3, rs)} | cross-domain rules ${mean((r) => r.rules.xp3, rs)} qloo ${mean((r) => r.qloo.xp3, rs)} hybrid ${mean((r) => r.hybrid.xp3, rs)}`);
    const wl = (a: string, b: string) => `${rs.filter((r) => r[a].p3 > r[b].p3).length}/${rs.filter((r) => r[a].p3 < r[b].p3).length}/${rs.filter((r) => r[a].p3 === r[b].p3).length}`;
    console.log(`   diagnostic, no category rule and named titles left out: rules ${mean((r) => r.rules.fp3, rs)} qloo ${mean((r) => r.qloo.fp3, rs)} hybrid ${mean((r) => r.hybrid.fp3, rs)}`);
    console.log(`   W/L/T hybrid vs rules ${wl("hybrid", "rules")} | hybrid vs qloo ${wl("hybrid", "qloo")} | qloo vs rules ${wl("qloo", "rules")}`);
  }
  console.log(`\nHaiku $${usd.toFixed(4)} | live Qloo calls ${calls.filter((c) => c.cache === "miss").length}`);
})();

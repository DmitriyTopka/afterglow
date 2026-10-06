// Offline eval of ranking arms on one scenario file. Usage: npx tsx scripts/eval_arms.mts eval/labels_tune.json [--verbose]
//   random: expected P@3 of a random order through the same budget + one-per-category rules (Monte Carlo)
//   rules:  direct matches + tag overlap, no Qloo
//   qloo:   direct matches + Qloo lift
import "./env.mts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
(async () => {
  const file = process.argv[2];
  const verbose = process.argv.includes("--verbose");
  const liftMode = (process.argv.find((a) => a.startsWith("--lift="))?.slice(7) ?? "z") as any;
  const { mockExtract } = await import("../lib/llm/extract.ts");
  const { search } = await import("../lib/qloo/client.ts");
  const { mapCatalog, scoreCatalog, resolveSignal } = await import("../lib/agent/score.ts");
  const { rank, shortlist } = await import("../lib/agent/rank.ts");
  const catalog = JSON.parse(readFileSync("data/catalog_v1.json", "utf8")); // the 06.10 eval ran on catalog v1
  const { baseline } = JSON.parse(readFileSync("data/baseline_v1.json", "utf8"));
  const { scenarios } = JSON.parse(readFileSync(file, "utf8"));
  const KIND: Record<string, string> = { person: "urn:entity:person", artist: "urn:entity:artist", movie: "urn:entity:movie", tv_show: "urn:entity:tv_show", book: "urn:entity:book", video_game: "urn:entity:videogame", brand: "urn:entity:brand", podcast: "urn:entity:podcast" };
  const calls: any[] = [];
  const itemIds = await mapCatalog(calls, catalog.items);

  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rows: any[] = [];
  for (const s of scenarios) {
    const ex = mockExtract(s.message);
    const sig: Array<{ name: string; id: string }> = [];
    for (const x of ex.signals) {
      const hit = await resolveSignal(x.name, KIND[x.kind], calls);
      if (hit) sig.push({ name: x.name, id: hit.entity_id });
    }
    const { scores } = sig.length ? await scoreCatalog(sig.map((x) => x.id), itemIds, calls, catalog.items) : { scores: new Map() };
    const good = new Set<string>(s.good);
    const names = ex.signals.map((x) => x.name);
    const out: any = { id: s.id, signals: names, budget: ex.budget_usd };
    for (const arm of ["rules", "qloo"] as const) {
      const ranked = rank({ arm, items: catalog.items, signalNames: names, scores, baseline, liftMode });
      const top = shortlist(ranked, ex.budget_usd).slice(0, 3);
      // Cross-domain view: the same ranking with direct matches removed. This is where Qloo has to earn its place.
      const xtop = shortlist(ranked.filter((r) => !r.direct.length), ex.budget_usd).slice(0, 3);
      out[arm] = {
        top3: top.map((r) => r.item.id),
        p3: top.filter((r) => good.has(r.item.id)).length / 3,
        crossHits: top.filter((r) => !r.direct.length && good.has(r.item.id)).length,
        crossSlots: top.filter((r) => !r.direct.length).length,
        xtop3: xtop.map((r) => r.item.id),
        xp3: xtop.filter((r) => good.has(r.item.id)).length / 3,
      };
      if (verbose) for (const r of xtop) console.log(`   x-${arm.padEnd(5)} ${good.has(r.item.id) ? "+" : "-"} ${r.item.id} lift=${r.lift?.toFixed(2) ?? "null"} aff=${r.affinity?.toFixed(3) ?? "null"} tags=${r.tagScore} ${r.item.title}`);
      if (verbose) for (const r of top) console.log(`   ${arm.padEnd(5)} ${good.has(r.item.id) ? "+" : "-"} ${r.item.id} ${r.direct.length ? "D" : " "} lift=${r.lift?.toFixed(2) ?? "null"} aff=${r.affinity?.toFixed(3) ?? "null"} tags=${r.tagScore} ${r.item.title}`);
    }
    let acc = 0;
    for (let k = 0; k < 2000; k++) {
      const shuffled = catalog.items.map((item) => ({ item, direct: [], affinity: null, lift: null, tagScore: 0, score: rnd() })).sort((a, b) => b.score - a.score);
      acc += shortlist(shuffled as any, ex.budget_usd).slice(0, 3).filter((r) => good.has(r.item.id)).length / 3;
    }
    out.random = { p3: acc / 2000 };
    rows.push(out);
    console.log(`${s.id} [${names.join(", ")}] random=${out.random.p3.toFixed(2)} rules=${out.rules.p3.toFixed(2)} (${out.rules.top3}) qloo=${out.qloo.p3.toFixed(2)} (${out.qloo.top3}) cross: rules ${out.rules.crossHits}/${out.rules.crossSlots} qloo ${out.qloo.crossHits}/${out.qloo.crossSlots}`);
  }
  const mean = (f: (r: any) => number) => (rows.reduce((a, r) => a + f(r), 0) / rows.length).toFixed(2);
  const w = rows.filter((r) => r.qloo.p3 > r.rules.p3).length, l = rows.filter((r) => r.qloo.p3 < r.rules.p3).length;
  const cw = rows.filter((r) => r.qloo.crossHits > r.rules.crossHits).length, cl = rows.filter((r) => r.qloo.crossHits < r.rules.crossHits).length;
  console.log(`\nMEAN P@3  random ${mean((r) => r.random.p3)} | rules ${mean((r) => r.rules.p3)} | qloo ${mean((r) => r.qloo.p3)}`);
  const xw = rows.filter((r) => r.qloo.xp3 > r.rules.xp3).length, xl = rows.filter((r) => r.qloo.xp3 < r.rules.xp3).length;
  console.log(`CROSS-DOMAIN P@3 (direct matches removed)  rules ${mean((r) => r.rules.xp3)} | qloo ${mean((r) => r.qloo.xp3)} | qloo vs rules: ${xw} wins / ${xl} losses / ${rows.length - xw - xl} ties  [lift=${liftMode}]`);
  console.log(`qloo vs rules per scenario, P@3: ${w} wins / ${l} losses / ${rows.length - w - l} ties; cross-domain hits: ${cw} wins / ${cl} losses`);
  console.log(`live Qloo calls this run: ${calls.filter((c) => c.cache === "miss").length}`);
  mkdirSync("eval/results", { recursive: true });
  writeFileSync(`eval/results/arms-${file.split("/").pop()!.replace(".json", "")}-${Date.now()}.json`, JSON.stringify(rows, null, 1));
})();

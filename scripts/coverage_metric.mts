// Step 1 of the cycle: is "unmet demand" measurable? For each of the 40 v2 shopper requests (demo demand),
// take the live agent's picks and their Qloo affinity; check whether low affinity predicts a miss (pooled labels),
// and which map section each request's taste points to. No new Qloo calls (cached).
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { resolveSignal, mapCatalog, scoreCatalog } = await import("../lib/agent/score.ts");
  const { rank, shortlist } = await import("../lib/agent/rank.ts");
  const items = JSON.parse(readFileSync("data/catalog.json", "utf8")).items;
  const { baseline } = JSON.parse(readFileSync("data/baseline.json", "utf8"));
  const map = JSON.parse(readFileSync("data/taste_map.json", "utf8"));
  const { scenarios } = JSON.parse(readFileSync("eval/v2_scenarios.json", "utf8"));
  const ex = JSON.parse(readFileSync("eval/v2_extractions.json", "utf8"));
  const pool = JSON.parse(readFileSync("eval/pool_v2_verdicts.json", "utf8"));
  const KIND: Record<string, string> = { person: "urn:entity:person", artist: "urn:entity:artist", movie: "urn:entity:movie", tv_show: "urn:entity:tv_show", book: "urn:entity:book", video_game: "urn:entity:videogame" };
  const calls: any[] = [];
  const itemIds = await mapCatalog(calls, items);
  const rows: any[] = [];
  for (const s of scenarios) {
    const e = ex[s.id];
    const ids: string[] = [];
    for (const x of e.signals) { const h = await resolveSignal(x.name, KIND[x.kind], calls); if (h) ids.push(h.entity_id); }
    const { scores } = ids.length ? await scoreCatalog(ids, itemIds, calls, items) : { scores: new Map() };
    const formats = e.signals.map((x: any) => KIND[x.kind]).filter((t: string) => t && t !== "urn:entity:person");
    const ranked = rank({ arm: "qloo", items, signalNames: e.signals.map((x: any) => x.name), scores, baseline, taste: "pct+fmt", formats, exclude: new Set(ids) });
    const picks = shortlist(ranked, e.budget_usd, 5, 2);
    const good = new Set([...s.good, ...Object.entries(pool[s.id] ?? {}).filter(([, v]) => v === "yes").map(([k]) => k)]);
    const top = picks.slice(0, 3);
    const hit = top.some((p: any) => good.has(p.item.id));
    const bestAff = Math.max(...top.map((p: any) => p.affinity ?? 0));
    // Where does this taste point? Vote of the 20 titles this taste lifts most above their usual audience
    // (lift, not raw affinity, so evergreen bestsellers do not pull every request into one section).
    const { lift } = await import("../lib/agent/rank.ts");
    const votes = new Map<number, number>();
    [...scores.entries()].map(([id, sc]: any) => [id, lift(id, sc, baseline) ?? -99] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .forEach(([id, l]) => { const c = map.items[id]?.cluster; if (c !== undefined) votes.set(c, (votes.get(c) ?? 0) + Math.max(l, 0)); });
    const section = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    rows.push({ id: s.id, group: s.group, hit, bestAff, section, signals: e.signals.map((x: any) => x.name) });
  }
  const hits = rows.filter((r) => r.hit).map((r) => r.bestAff), miss = rows.filter((r) => !r.hit).map((r) => r.bestAff);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  console.log(`requests with a good pick in top 3: ${hits.length}/${rows.length}; mean best affinity hit ${avg(hits).toFixed(3)} vs miss ${avg(miss).toFixed(3)}`);
  for (const t of [0.85, 0.88, 0.9, 0.92, 0.94]) {
    const met = rows.filter((r) => r.bestAff >= t);
    console.log(`  threshold ${t}: called met ${met.length}, of which actually hit ${met.filter((r) => r.hit).length}; called unmet ${rows.length - met.length}, of which actually missed ${rows.filter((r) => r.bestAff < t && !r.hit).length}`);
  }
  console.log("\nper section (demand = requests whose taste points there; coverage = share with a good pick):");
  for (const c of map.clusters) {
    const rs = rows.filter((r) => r.section === c.id);
    console.log(`  ${(c.name ?? c.id).padEnd(32)} demand ${String(rs.length).padStart(2)}  covered ${rs.filter((r) => r.hit).length}  -> ${rs.length ? Math.round((100 * rs.filter((r) => r.hit).length) / rs.length) + "%" : "-"}   unmet: ${rs.filter((r) => !r.hit).map((r) => r.signals.join("+")).join("; ").slice(0, 120)}`);
  }
  writeFileSync("data/demand_v2.json", JSON.stringify(rows, null, 1));
  console.log("live Qloo calls:", calls.filter((c) => c.cache === "miss").length);
})();

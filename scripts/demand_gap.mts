// Demand gap: for each shopper request, ask Qloo what this taste loves most in the formats the store sells
// (no catalog filter), and check how much of it the store carries. Missing titles, counted across requests,
// are what to stock next. Coverage = share of the request's top-10 wanted titles the store has.
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { insights } = await import("../lib/qloo/client.ts");
  const { resolveSignal } = await import("../lib/agent/score.ts");
  const items = JSON.parse(readFileSync("data/catalog.json", "utf8")).items;
  const owned = new Set(items.map((i: any) => i.qloo.entity_id));
  const { scenarios } = JSON.parse(readFileSync("eval/v2_scenarios.json", "utf8"));
  const ex = JSON.parse(readFileSync("eval/v2_extractions.json", "utf8"));
  const limit = Number(process.argv[2] ?? 40);
  const KIND: Record<string, string> = { person: "urn:entity:person", artist: "urn:entity:artist", movie: "urn:entity:movie", tv_show: "urn:entity:tv_show", book: "urn:entity:book", video_game: "urn:entity:videogame" };
  const SELL = ["urn:entity:artist", "urn:entity:book", "urn:entity:movie", "urn:entity:videogame", "urn:entity:tv_show"];
  const calls: any[] = []; const rows: any[] = []; const wanted = new Map<string, { name: string; type: string; n: number; image: string | null; by: string[] }>();
  for (const s of scenarios.slice(0, limit)) {
    const e = ex[s.id];
    const ids: string[] = [];
    for (const x of e.signals) { const h = await resolveSignal(x.name, KIND[x.kind], calls); if (h) ids.push(h.entity_id); }
    if (!ids.length) continue;
    const named = e.signals.map((x: any) => KIND[x.kind]).filter((t: string) => SELL.includes(t));
    const types = named.length ? [...new Set(named)] : ["urn:entity:artist", "urn:entity:movie"]; // formats the shopper named, else music + film
    let top: any[] = [];
    for (const t of types) {
      let res: any;
      try { res = await insights({ "filter.type": t as any, "signal.interests.entities": ids.join(","), take: "10" }, calls); }
      catch { continue; } // some entities (e.g. certain books) are not valid insight signals
      top = top.concat((res.results.entities ?? []).filter((x: any) => !ids.includes(x.entity_id)).map((x: any) => ({ ...x, t })));
    }
    if (!top.length) continue;
    top = top.sort((a, b) => (b.query?.affinity ?? 0) - (a.query?.affinity ?? 0)).slice(0, 10);
    const have = top.filter((x) => owned.has(x.entity_id));
    rows.push({ id: s.id, signals: e.signals.map((x: any) => x.name), coverage: have.length / (top.length || 1), missing: top.filter((x) => !owned.has(x.entity_id)).map((x) => x.name) });
    for (const x of top.filter((x) => !owned.has(x.entity_id))) {
      const w = wanted.get(x.entity_id) ?? { name: x.name, type: x.t, n: 0, image: x.properties?.image?.url ?? null, by: [] };
      w.n++; w.by.push(e.signals.map((y: any) => y.name).join(" + ")); wanted.set(x.entity_id, w);
    }
    console.log(`${s.id} cover ${Math.round(100 * rows.at(-1).coverage)}%  [${rows.at(-1).signals.join(", ")}] missing: ${rows.at(-1).missing.slice(0, 4).join(", ")}`);
  }
  const mean = rows.reduce((a, r) => a + r.coverage, 0) / rows.length;
  const dist = [0, 0.1, 0.2, 0.3, 0.5].map((t) => `${t * 100}%+: ${rows.filter((r) => r.coverage >= t).length}`).join("  ");
  console.log(`\nmean coverage ${Math.round(mean * 100)}% over ${rows.length} requests | ${dist}`);
  console.log("most wanted titles the store lacks:");
  [...wanted.values()].sort((a, b) => b.n - a.n).slice(0, 12).forEach((w) => console.log(`  ${w.n}x ${w.name} (${w.type.split(":").pop()}) <- ${w.by.slice(0, 2).join(" | ")}`));
  writeFileSync("data/demand_gap_v2.json", JSON.stringify({ rows, wanted: [...wanted.entries()].map(([id, w]) => ({ entity_id: id, ...w })) }, null, 1));
  console.log("live Qloo calls:", calls.filter((c) => c.cache === "miss").length);
})();

// Seed data for the loop: the 40 demo shoppers' store checks (what their taste wants most vs what we carry)
// and cold-start placements for the 10 most wanted missing titles. Output: data/cycle.json.
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { resolveSignal } = await import("../lib/agent/score.ts");
  const { demandGap } = await import("../lib/agent/gap.ts");
  const { coldStart } = await import("../lib/agent/coldstart.ts");
  const { scenarios } = JSON.parse(readFileSync("eval/v2_scenarios.json", "utf8"));
  const ex = JSON.parse(readFileSync("eval/v2_extractions.json", "utf8"));
  const KIND: Record<string, string> = { person: "urn:entity:person", artist: "urn:entity:artist", movie: "urn:entity:movie", tv_show: "urn:entity:tv_show", book: "urn:entity:book", video_game: "urn:entity:videogame" };
  const calls: any[] = [];
  const demand: any[] = [];
  for (const s of scenarios) {
    const e = ex[s.id];
    const ids: string[] = [];
    for (const x of e.signals) { const h = await resolveSignal(x.name, KIND[x.kind], calls); if (h) ids.push(h.entity_id); }
    if (!ids.length) continue;
    const formats = e.signals.map((x: any) => KIND[x.kind]).filter((t: string) => t && t !== "urn:entity:person");
    const gap = await demandGap(ids, formats, calls);
    if (gap) demand.push({ id: s.id, source: "demo", message: s.message, signals: e.signals.map((x: any) => x.name), wanted: gap.wanted });
  }
  const count = new Map<string, any>();
  for (const d of demand) for (const w of d.wanted.filter((w: any) => !w.owned)) {
    const c = count.get(w.entity_id) ?? { ...w, n: 0 }; c.n++; count.set(w.entity_id, c);
  }
  // Two most wanted per format, so the demo shows films, books, games and shows, not only records.
  const ranked = [...count.values()].filter((w) => w.image).sort((a, b) => b.n - a.n || (b.affinity ?? 0) - (a.affinity ?? 0));
  const top = ["urn:entity:artist", "urn:entity:movie", "urn:entity:book", "urn:entity:videogame", "urn:entity:tv_show"].flatMap((t) => ranked.filter((w) => w.type === t).slice(0, 2));
  const placements: Record<string, unknown> = {};
  for (const w of top) {
    const p = await coldStart(w.entity_id, w.type, calls);
    if (p) placements[w.entity_id] = p;
    console.log(`placed ${w.name} (${w.n}x) -> ${p?.clusterName ?? "no data"}`);
  }
  const mean = demand.reduce((a, d) => a + d.wanted.filter((w: any) => w.owned).length / d.wanted.length, 0) / demand.length;
  writeFileSync("data/cycle.json", JSON.stringify({ note: "Built by scripts/build_cycle.mts. Demo demand = the 40 blind test shoppers of eval v2.", demand, placements }, null, 1));
  console.log(`demand rows ${demand.length}, mean coverage ${Math.round(mean * 100)}% | live Qloo calls ${calls.filter((c) => c.cache === "miss").length}`);
})();

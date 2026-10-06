// "A real shelf": Waterloo Records (Austin, TX) publishes its catalog as a public Shopify feed. We take its 500
// best-selling items, keep the artists, resolve them in Qloo, and measure the shelf against (1) what Austin's taste
// loves (Qloo location signal) and (2) what our 38 demo shoppers' tastes love. One Qloo search per artist, cached.
// Output: data/real/waterloo.json (artist names, counts and aggregate prices only; no product listings are copied).
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { search, insights } = await import("../lib/qloo/client.ts");
  const { seedDemand } = await import("../lib/cycle.ts");
  const calls: any[] = [];
  const prods = [1, 2].flatMap((p) => JSON.parse(readFileSync(`data/catalog_build/wb${p}.json`, "utf8")).products);
  const records = prods.filter((p: any) => /vinyl|cd|cassette/i.test(p.product_type ?? ""));
  const byArtist = new Map<string, { items: number; prices: number[] }>();
  for (const p of records) {
    const t = String(p.title).replace(/^Pre-Order:\s*/i, "");
    if (!t.includes(" - ")) continue;
    const a = t.split(" - ")[0].trim();
    if (/^(various|soundtrack|waterloo)/i.test(a)) continue;
    const e = byArtist.get(a) ?? { items: 0, prices: [] };
    e.items++; e.prices.push(Number(p.variants?.[0]?.price ?? 0));
    byArtist.set(a, e);
  }
  const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const shelf: Array<{ artist: string; items: number; entity_id: string | null; qloo_name: string | null }> = [];
  for (const [artist, e] of byArtist) {
    const hits = (await search(artist, "urn:entity:artist", calls)).results ?? [];
    const hit = hits.find((h: any) => norm(h.name) === norm(artist)) ?? null;
    shelf.push({ artist, items: e.items, entity_id: hit?.entity_id ?? null, qloo_name: hit?.name ?? null });
  }
  const ids = new Set(shelf.map((s) => s.entity_id).filter(Boolean) as string[]);
  const names = new Set(shelf.filter((s) => s.entity_id).map((s) => norm(s.artist)));
  const has = (id: string, name: string) => ids.has(id) || names.has(norm(name));
  // 1. The neighbourhood: the 50 artists Austin's taste over-indexes on, per Qloo.
  const local = (await insights({ "filter.type": "urn:entity:artist", "signal.location.query": "Austin, TX", take: "50" } as any, calls)).results.entities ?? [];
  const austin = local.map((e: any) => ({ entity_id: e.entity_id, name: e.name, on_shelf: has(e.entity_id, e.name) }));
  // 2. Our 38 demo shoppers: of the records each taste loves most, how many does this shelf carry?
  const rows = seedDemand.map((r) => {
    const wanted = r.wanted.filter((w) => w.type === "urn:entity:artist");
    return { message: r.message, signals: r.signals, wanted: wanted.map((w) => ({ entity_id: w.entity_id, name: w.name, on_shelf: has(w.entity_id, w.name) })) };
  }).filter((r) => r.wanted.length);
  const missing = new Map<string, { name: string; askedBy: number }>();
  for (const r of rows) for (const w of r.wanted) if (!w.on_shelf) missing.set(w.entity_id, { name: w.name, askedBy: (missing.get(w.entity_id)?.askedBy ?? 0) + 1 });
  const prices = [...byArtist.values()].flatMap((e) => e.prices).filter((x) => x > 0).sort((a, b) => a - b);
  const out = {
    source: "Waterloo Records, Austin TX: public Shopify catalog feed, collection 'waterloo-best-sellers', first 500 items, fetched 2026-10-07. No affiliation.",
    items: prods.length, records: records.length, artists: shelf.length, recognised: ids.size,
    median_price: prices[Math.floor(prices.length / 2)],
    shelf,
    austin: { query: "Austin, TX", top: austin, on_shelf: austin.filter((a: any) => a.on_shelf).length },
    shoppers: { rows: rows.length, wanted: rows.reduce((s, r) => s + r.wanted.length, 0), carried: rows.reduce((s, r) => s + r.wanted.filter((w) => w.on_shelf).length, 0), served: rows.filter((r) => r.wanted.some((w) => w.on_shelf)).length, missing: [...missing.values()].sort((a, b) => b.askedBy - a.askedBy).slice(0, 15) },
    qloo_calls: calls.length, live_calls: calls.filter((c) => c.cache === "miss").length,
  };
  writeFileSync("data/real/waterloo.json", JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ ...out, shelf: undefined, austin: { ...out.austin, top: out.austin.top.slice(0, 12) } }, null, 1));
})();

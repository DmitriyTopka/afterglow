// "A real shelf": independent shops that publish their catalog as a public Shopify feed (robots.txt allows it).
// We read one public collection, keep only the names (artists for a record shop, titles for a bookshop), resolve
// them in Qloo, and measure the shelf against (1) what the shop's city loves (Qloo location signal) and (2) what our
// 38 demo shoppers' tastes love. One Qloo search per name, cached.
// Usage: npx tsx scripts/real_shelf.mts <waterloo|josey|newbury|tattered>
// Output: data/real/<shop>.json (names, counts and aggregate prices only; no product listings are copied).
import "./env.mts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Shop = { name: string; city: string; url: string; collection: string; pages: number; kind: "records" | "books"; files: string[]; fetched: string; label: string; artistIn?: "vendor" };
const SHOPS: Record<string, Shop> = {
  waterloo: { name: "Waterloo Records", city: "Austin, TX", url: "https://waterloorecords.com", collection: "waterloo-best-sellers", pages: 2, kind: "records", files: ["wb1", "wb2"], fetched: "2026-10-06", label: "500 best-selling items" },
  josey: { name: "Josey Records", city: "Dallas, TX", url: "https://joseyrecords.com", collection: "vinyl-lp", pages: 2, kind: "records", files: ["josey1", "josey2"], fetched: "2026-10-07", label: "first 500 items of its vinyl LP collection" },
  newbury: { name: "Newbury Comics", city: "Boston, MA", url: "https://www.newburycomics.com", collection: "vinyl", pages: 2, kind: "records", files: ["newbury1", "newbury2"], fetched: "2026-10-07", label: "first 500 items of its vinyl collection", artistIn: "vendor" },
  tattered: { name: "Tattered Cover", city: "Denver, CO", url: "https://tatteredcover.com", collection: "tc_bestsellers", pages: 1, kind: "books", files: ["tattered1"], fetched: "2026-10-07", label: "30 current best-sellers" },
};

(async () => {
  const key = process.argv[2] ?? "waterloo";
  const shop = SHOPS[key];
  if (!shop) throw new Error(`unknown shop ${key}`);
  // One polite read of the public feed (250 items a page), kept locally and never committed.
  for (let i = 0; i < shop.files.length; i++) {
    const f = `data/catalog_build/${shop.files[i]}.json`;
    if (existsSync(f)) continue;
    const res = await fetch(`${shop.url}/collections/${shop.collection}/products.json?limit=250&page=${i + 1}`, { headers: { "User-Agent": "Mozilla/5.0 (Afterglow hackathon research; one read)" } });
    if (!res.ok) throw new Error(`${shop.url} answered ${res.status}`);
    writeFileSync(f, await res.text());
    await new Promise((r) => setTimeout(r, 1500));
  }
  const { search, insights } = await import("../lib/qloo/client.ts");
  const { seedDemand } = await import("../lib/cycle.ts");
  const calls: any[] = [];
  const type = shop.kind === "records" ? "urn:entity:artist" : "urn:entity:book";
  const prods = shop.files.flatMap((f) => JSON.parse(readFileSync(`data/catalog_build/${f}.json`, "utf8")).products);
  const goods = shop.kind === "records" ? prods.filter((p: any) => /vinyl|cd|cassette/i.test(p.product_type ?? "")) : prods;
  // The name a shopper's taste is matched on: the artist ("Artist - Album") or the book title without series notes.
  const nameOf = (p: any): string | null => {
    const t = String(p.title).replace(/^Pre-Order:\s*/i, "");
    if (shop.artistIn === "vendor") return String(p.vendor ?? "").trim() || null;
    if (shop.kind === "books") return t.replace(/\s*\([^)]*\)\s*$/, "").replace(/:\s*(?:A Novel|A Memoir|Stories)$/i, "").trim() || null;
    if (!t.includes(" - ")) return null;
    return t.split(" - ")[0].trim();
  };
  const byName = new Map<string, { items: number; prices: number[] }>();
  const spelling = new Map<string, string>(); // "Charli Xcx" and "Charli XCX" are one artist: group case-insensitively, keep the first spelling
  for (const p of goods) {
    const raw = nameOf(p);
    if (!raw || /^(various|soundtrack|waterloo)/i.test(raw)) continue;
    const a = spelling.get(raw.toLowerCase()) ?? raw;
    spelling.set(raw.toLowerCase(), a);
    const e = byName.get(a) ?? { items: 0, prices: [] };
    e.items++; e.prices.push(Number(p.variants?.[0]?.price ?? 0));
    byName.set(a, e);
  }
  const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const shelf: Array<{ name: string; items: number; entity_id: string | null; qloo_name: string | null }> = [];
  for (const [name, e] of byName) {
    const hits = (await search(name, type, calls)).results ?? [];
    const hit = hits.find((h: any) => norm(h.name) === norm(name)) ?? null;
    shelf.push({ name, items: e.items, entity_id: hit?.entity_id ?? null, qloo_name: hit?.name ?? null });
  }
  const ids = new Set(shelf.map((s) => s.entity_id).filter(Boolean) as string[]);
  const names = new Set(shelf.filter((s) => s.entity_id).map((s) => norm(s.name)));
  const has = (id: string, name: string) => ids.has(id) || names.has(norm(name));
  // 1. The neighbourhood: the 50 artists or books the city's taste over-indexes on, per Qloo.
  const local = (await insights({ "filter.type": type, "signal.location.query": shop.city, take: "50" } as any, calls)).results.entities ?? [];
  const top = local.map((e: any) => ({ entity_id: e.entity_id, name: e.name, on_shelf: has(e.entity_id, e.name) }));
  // 2. Our 38 demo shoppers: of the titles of this kind each taste loves most, how many does this shelf carry?
  const rows = seedDemand.map((r) => {
    const wanted = r.wanted.filter((w) => w.type === type);
    return { message: r.message, signals: r.signals, wanted: wanted.map((w) => ({ entity_id: w.entity_id, name: w.name, on_shelf: has(w.entity_id, w.name) })) };
  }).filter((r) => r.wanted.length);
  const missing = new Map<string, { name: string; askedBy: number }>();
  for (const r of rows) for (const w of r.wanted) if (!w.on_shelf) missing.set(w.entity_id, { name: w.name, askedBy: (missing.get(w.entity_id)?.askedBy ?? 0) + 1 });
  const prices = [...byName.values()].flatMap((e) => e.prices).filter((x) => x > 0).sort((a, b) => a - b);
  const out = {
    key, shop: shop.name, city: shop.city, kind: shop.kind, url: shop.url,
    source: `${shop.name}, ${shop.city}: public Shopify catalog feed, collection '${shop.collection}', ${shop.label}, fetched ${shop.fetched}. No affiliation.`,
    label: shop.label,
    items: prods.length, goods: goods.length, names: shelf.length, recognised: ids.size,
    median_price: prices[Math.floor(prices.length / 2)],
    shelf,
    local: { query: shop.city, top, on_shelf: top.filter((a: any) => a.on_shelf).length },
    shoppers: { rows: rows.length, wanted: rows.reduce((s, r) => s + r.wanted.length, 0), carried: rows.reduce((s, r) => s + r.wanted.filter((w) => w.on_shelf).length, 0), served: rows.filter((r) => r.wanted.some((w) => w.on_shelf)).length, missing: [...missing.values()].sort((a, b) => b.askedBy - a.askedBy).slice(0, 15) },
    qloo_calls: calls.length, live_calls: calls.filter((c) => c.cache === "miss").length,
  };
  writeFileSync(`data/real/${key}.json`, JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ ...out, shelf: undefined, local: { ...out.local, top: out.local.top.slice(0, 10) }, shoppers: { ...out.shoppers, missing: out.shoppers.missing.slice(0, 5) } }, null, 1));
})();

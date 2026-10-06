// Deterministic stand-in for hackathon.api.qloo.com until the API key arrives.
// Responses follow the documented wire shape; numbers are fabricated and flagged with _mock.
import catalog from "@/data/catalog.json";
import type { InsightsParams, QlooEntity, QlooInsightsResponse, QlooSearchResponse } from "./types";

interface MockEntity {
  name: string;
  subtype: string;
  tags: string[];
}

// Cultural signals a shopper might mention, with the taste tags the mock reasons over.
const SIGNALS: MockEntity[] = [
  { name: "Christopher Nolan", subtype: "urn:entity:person", tags: ["cinema", "scifi", "heist", "space", "noir"] },
  { name: "Hans Zimmer", subtype: "urn:entity:artist", tags: ["orchestral", "cinema", "scifi", "space"] },
  { name: "Interstellar", subtype: "urn:entity:movie", tags: ["scifi", "space", "science", "cinema", "orchestral"] },
  { name: "Denis Villeneuve", subtype: "urn:entity:person", tags: ["cinema", "scifi", "noir", "epic"] },
  { name: "Studio Ghibli", subtype: "urn:entity:brand", tags: ["anime", "cozy", "fantasy", "whimsical"] },
  { name: "Hayao Miyazaki", subtype: "urn:entity:person", tags: ["anime", "cozy", "fantasy"] },
  { name: "Haruki Murakami", subtype: "urn:entity:person", tags: ["literary", "surreal", "jazz", "cozy"] },
  { name: "Agatha Christie", subtype: "urn:entity:person", tags: ["mystery", "vintage", "cozy", "literary"] },
  { name: "Miles Davis", subtype: "urn:entity:artist", tags: ["jazz", "vintage", "audiophile"] },
  { name: "Daft Punk", subtype: "urn:entity:artist", tags: ["electronic", "retro", "dance", "scifi"] },
  { name: "Radiohead", subtype: "urn:entity:artist", tags: ["indie", "alt", "melancholy", "audiophile"] },
  { name: "Wes Anderson", subtype: "urn:entity:person", tags: ["cinema", "whimsical", "design", "vintage"] },
  { name: "Elden Ring", subtype: "urn:entity:videogame", tags: ["gaming", "fantasy", "hardcore", "epic"] },
  { name: "The Legend of Zelda", subtype: "urn:entity:videogame", tags: ["gaming", "fantasy", "adventure", "cozy"] },
  { name: "J.R.R. Tolkien", subtype: "urn:entity:person", tags: ["fantasy", "epic", "literary"] },
  { name: "Kendrick Lamar", subtype: "urn:entity:artist", tags: ["hiphop", "streetwear"] },
  { name: "Patagonia", subtype: "urn:entity:brand", tags: ["outdoor", "everyday"] },
  { name: "Blade Runner", subtype: "urn:entity:movie", tags: ["scifi", "noir", "cinema", "retro"] },
];

const CATALOG_ENTITIES: MockEntity[] = (catalog.items as Array<{ qloo: { name: string; type: string }; tags?: string[]; mock_tags?: string[] }>).map((i) => ({
  name: i.qloo.name,
  subtype: i.qloo.type,
  tags: i.tags ?? i.mock_tags ?? [],
}));

const ALL = dedupe([...SIGNALS, ...CATALOG_ENTITIES]);

function dedupe(list: MockEntity[]): MockEntity[] {
  const seen = new Map<string, MockEntity>();
  for (const e of list) {
    const prev = seen.get(e.name);
    seen.set(e.name, prev ? { ...prev, tags: [...new Set([...prev.tags, ...e.tags])] } : e);
  }
  return [...seen.values()];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function mockId(name: string): string {
  const hex = [hash(name), hash(name + "#1"), hash(name + "#2"), hash(name + "#3")]
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("")
    .toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const BY_ID = new Map(ALL.map((e) => [mockId(e.name), e]));

function toWire(e: MockEntity): QlooEntity {
  return {
    name: e.name,
    entity_id: mockId(e.name),
    type: "urn:entity",
    subtype: e.subtype,
    types: [e.subtype],
    popularity: 0.5 + (hash(e.name + "pop") % 500) / 1000,
    tags: e.tags.map((t) => ({ id: `urn:tag:keyword:mock:${t}`, name: t, type: "urn:tag:keyword:mock" })),
  };
}

export function mockSearch(query: string, types?: string): QlooSearchResponse {
  const q = query.trim().toLowerCase();
  const allowed = types?.split(",").map((t) => t.trim());
  const results = ALL.filter((e) => {
    const n = e.name.toLowerCase();
    return (n.includes(q) || q.includes(n)) && (!allowed || allowed.includes(e.subtype));
  }).map(toWire);
  return { results, _mock: true };
}

function overlap(a: string[], b: string[]): number {
  const shared = a.filter((t) => b.includes(t)).length;
  return shared / Math.sqrt(a.length * b.length || 1);
}

export function mockInsights(p: InsightsParams): QlooInsightsResponse {
  const signals = (p["signal.interests.entities"] ?? "").split(",").map((id) => BY_ID.get(id.trim())).filter(Boolean) as MockEntity[];
  const candidateIds = (p["filter.results.entities"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const pool = candidateIds.length
    ? (candidateIds.map((id) => BY_ID.get(id)).filter(Boolean) as MockEntity[])
    : ALL;

  const scored = pool
    .filter((e) => e.subtype === p["filter.type"])
    .map((e) => {
      const per = signals.map((s) => ({ entity_id: mockId(s.name), raw: overlap(s.tags, e.tags) }));
      const noise = (hash(e.name + signals.map((s) => s.name).join()) % 100) / 2000;
      const mean = per.length ? per.reduce((a, x) => a + x.raw, 0) / per.length : 0;
      const affinity = Math.min(0.99, Math.round((0.15 + mean * 0.8 + noise) * 1000) / 1000);
      const total = per.reduce((a, x) => a + x.raw, 0) || 1;
      const wire = toWire(e);
      wire.query = { affinity };
      if (p["feature.explainability"] === "true") {
        wire.query.explainability = {
          "signal.interests.entities": per.map((x) => ({ entity_id: x.entity_id, score: Math.round((x.raw / total) * 100) / 100 })),
        };
      }
      return wire;
    })
    .sort((a, b) => (b.query!.affinity ?? 0) - (a.query!.affinity ?? 0))
    .slice(0, Number(p.take ?? 20));

  return { success: true, results: { entities: scored }, duration: 3, _mock: true };
}

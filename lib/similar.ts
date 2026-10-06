// "Pairs well with": nearest titles by taste vector (Qloo affinity over the map's 36 reference tastes).
// Pure data, no API calls; vectors are precomputed in data/taste_map.json.
import map from "@/data/taste_map.json";
import catalog from "@/data/catalog.json";

const FORMAT = new Map((catalog.items as Array<{ id: string; category: string }>).map((i) => [i.id, i.category]));

const V = (map.projection as { vectors: Record<string, number[]> }).vectors;
const dot = (a: number[], b: number[]) => a.reduce((s, x, k) => s + x * b[k], 0);

export function similar(id: string, n = 4, exclude: Set<string> = new Set(), perFormat = Infinity): Array<{ id: string; similarity: number }> {
  const v = V[id];
  if (!v) return [];
  const ranked = Object.entries(V)
    .filter(([k]) => k !== id && !exclude.has(k))
    .map(([k, w]) => ({ id: k, similarity: dot(v, w) }))
    .sort((a, b) => b.similarity - a.similarity);
  // Optionally at most `perFormat` per format, so "fans also love" crosses shelves instead of listing four records.
  const seen = new Map<string, number>();
  const out: Array<{ id: string; similarity: number }> = [];
  for (const r of ranked) {
    const f = FORMAT.get(r.id) ?? "";
    if ((seen.get(f) ?? 0) >= perFormat) continue;
    seen.set(f, (seen.get(f) ?? 0) + 1);
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

/** Titles that sit closest to a whole basket (sum of similarities). */
export function completeTheGift(ids: string[], n = 4): Array<{ id: string; similarity: number }> {
  const have = new Set(ids);
  const score = new Map<string, number>();
  for (const id of ids) for (const s of similar(id, 25, have)) score.set(s.id, (score.get(s.id) ?? 0) + s.similarity);
  return [...score.entries()].map(([id, similarity]) => ({ id, similarity })).sort((a, b) => b.similarity - a.similarity).slice(0, n);
}

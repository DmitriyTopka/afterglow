// Cold start: place a product the store has never sold on the taste map, from Qloo data alone.
// Same recipe as scripts/build_map.py: affinity for every probe taste -> centre by entity type ->
// z-score -> unit length -> nearest section centroid and nearest catalog neighbours.
import map from "@/data/taste_map.json";

const P = map.projection as {
  probes: string[];
  type_means: Record<string, number[]>;
  centroids: number[][];
  vectors: Record<string, number[]>;
};

export const PROBES = P.probes;

export interface Placement {
  cluster: number;
  clusterName: string;
  similarity: number; // cosine to the section centre, -1..1
  neighbours: Array<{ id: string; similarity: number }>;
  x: number;
  y: number;
}

/** affinity: one value per probe in PROBES order (null when Qloo returned nothing for that probe). */
export function place(affinity: Array<number | null>, type: string): Placement | null {
  const known = affinity.filter((a): a is number => a !== null);
  if (known.length < PROBES.length / 2) return null;
  const mean = known.reduce((s, v) => s + v, 0) / known.length;
  const tm = P.type_means[type] ?? PROBES.map(() => 0);
  let v = affinity.map((a, k) => (a ?? mean) - tm[k]);
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) + 1e-9;
  v = v.map((x) => (x - m) / sd);
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  v = v.map((x) => x / n);
  const dot = (a: number[], b: number[]) => a.reduce((s, x, k) => s + x * b[k], 0);
  const sims = P.centroids.map((c) => dot(v, c));
  const near5 = Object.entries(P.vectors)
    .map(([id, w]) => ({ id, similarity: dot(v, w) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
  const neighbours = near5.slice(0, 3);
  // Section = where most of its 5 nearest titles live (so the label matches where the cover lands);
  // ties fall back to the nearest section centre.
  const ITEMS = map.items as Record<string, { cluster: number }>;
  const votes = new Map<number, number>();
  for (const n of near5) { const c = ITEMS[n.id]?.cluster; if (c !== undefined) votes.set(c, (votes.get(c) ?? 0) + 1); }
  const best = Math.max(0, ...votes.values());
  const tied = [...votes.entries()].filter(([, n]) => n === best).map(([c]) => c);
  const cluster = tied.length === 1 ? tied[0] : tied.sort((a, b) => sims[b] - sims[a])[0] ?? sims.indexOf(Math.max(...sims));
  const c = map.clusters[cluster] as { name?: string; x: number; y: number };
  // Drop it next to its closest neighbour so it visibly joins that part of the island.
  const inSection = near5.find((n) => ITEMS[n.id]?.cluster === cluster) ?? neighbours[0];
  const near = (map.items as Record<string, { x: number; y: number }>)[inSection.id];
  return { cluster, clusterName: c.name ?? `Section ${cluster}`, similarity: sims[cluster], neighbours, x: near ? near.x + 0.012 : c.x, y: near ? near.y - 0.012 : c.y };
}

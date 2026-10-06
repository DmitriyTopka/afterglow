"""Taste map: cluster catalog items by their Qloo taste vectors and lay clusters out as islands.
Vector = affinity of the item for each probe taste, centred per probe and z-scored per item,
so an item's position reflects WHICH tastes over-index on it, not how popular it is overall."""
import json, numpy as np
from collections import Counter
items = json.load(open("data/catalog.json"))["items"]
tv = json.load(open("data/taste_vectors.json")); probes = tv["probes"]
X = np.array([[tv["matrix"][p].get(i["id"], np.nan) for p in probes] for i in items], dtype=float)
keep = ~np.isnan(X).all(axis=1)  # items Qloo never scored get no place on the map
print("items without any taste data:", [i["title"] for i, k in zip(items, keep) if not k])
items = [i for i, k in zip(items, keep) if k]; X = X[keep]
ids = [i["id"] for i in items]
X = np.where(np.isnan(X), np.nanmean(X, axis=1, keepdims=True), X)
RAW = X.copy()
# Qloo scores each entity type in its own call, so affinity levels differ by type. Centre every probe
# within each type; otherwise the map just sorts books from games.
types = np.array([i["qloo"]["type"] for i in items])
type_means = {}
for t in set(types):
    type_means[t] = X[types == t].mean(axis=0)
    X[types == t] -= type_means[t]
X = (X - X.mean(axis=1, keepdims=True)) / (X.std(axis=1, keepdims=True) + 1e-9)
X = X / np.linalg.norm(X, axis=1, keepdims=True)

def kmeans(X, k, seed):
    rng = np.random.default_rng(seed); C = X[rng.choice(len(X), k, replace=False)]
    for _ in range(100):
        lab = np.argmax(X @ C.T, axis=1)
        C2 = np.array([X[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)])
        C2 /= np.linalg.norm(C2, axis=1, keepdims=True)
        if np.allclose(C, C2): break
        C = C2
    return lab, C, float(np.sum(X * C[lab]))
K = 9
lab, C, _ = max((kmeans(X, K, s) for s in range(30)), key=lambda r: r[2])

# Layout on a 3:2 board (coordinates are fractions of board width/height).
# Sections sit in a 3x3 grid ordered by PCA of their centroids, so similar sections are neighbours.
# Inside a section, covers take hex-grid slots (no overlaps), closest-to-centre slots for the most typical titles.
W, H = 1.0, 2 / 3          # board aspect 3:2, in width units
SLOT = 0.020               # slot pitch in width units (a cover is 0.018 wide, so 2px+ gaps)
U, S, Vt = np.linalg.svd(C - C.mean(0)); P = (C - C.mean(0)) @ Vt[:2].T
cols = np.argsort(P[:, 0]).reshape(3, 3)              # 3 columns by PC1
grid = {}
for ci, col in enumerate(cols):
    for ri, j in enumerate(sorted(col, key=lambda j: P[j, 1])):  # rows by PC2
        grid[int(j)] = (ci, ri)
rng = np.random.default_rng(7)
hexpts = sorted(((q + (r % 2) / 2) * SLOT, r * SLOT) for q in range(-12, 13) for r in range(-12, 13))
hexpts = sorted(hexpts, key=lambda p: p[0] ** 2 + p[1] ** 2)
pos, centre = {}, {}
for j in range(K):
    ci, ri = grid[j]
    cx = (ci + 0.5) / 3 + rng.uniform(-0.025, 0.025)             # a little disorder between sections
    cy = ((ri + 0.5) / 3) * H - 0.018 + rng.uniform(-0.01, 0.01)
    centre[j] = (cx, cy / H)
    mem = np.where(lab == j)[0]; mem = mem[np.argsort(-(X[mem] @ C[j]))]
    for n, m in enumerate(mem):
        dx, dy = hexpts[n]
        pos[ids[m]] = (cx + dx, (cy + dy) / H)
ring = centre
clusters = []
for j in range(K):
    mem = [items[m] for m in np.where(lab == j)[0]]
    mem_sorted = sorted(mem, key=lambda i: -float(X[ids.index(i["id"])] @ C[j]))
    cats = Counter(i["category"] for i in mem); tags = Counter(t for i in mem for t in i.get("tags", [])[:5])
    probe_loading = sorted(zip(probes, C[j]), key=lambda x: -x[1])[:3]
    clusters.append({"id": j, "size": len(mem), "x": ring[j][0], "y": ring[j][1], "categories": dict(cats.most_common()),
                     "top_tags": [t for t, _ in tags.most_common(8)], "leaning": [p.split(" -> ")[0] for p, _ in probe_loading],
                     "examples": [i["title"] for i in mem_sorted[:10]],
                     "radius": float(np.sqrt(hexpts[len(mem) - 1][0] ** 2 + hexpts[len(mem) - 1][1] ** 2))})
# Everything needed to place a NEW product on the same map (cold start): same probes, same centring, centroids.
proj = {"probes": probes, "type_means": {t: [round(float(v), 5) for v in m] for t, m in type_means.items()},
        "centroids": [[round(float(v), 5) for v in c] for c in C],
        "vectors": {i: [round(float(v), 4) for v in X[n]] for n, i in enumerate(ids)}}
json.dump({"note": "Built by scripts/build_map.py from data/taste_vectors.json", "projection": proj, "clusters": clusters,
           "items": {i: {"x": round(p[0], 4), "y": round(p[1], 4), "cluster": int(lab[ids.index(i)])} for i, p in pos.items()}},
          open("data/taste_map.json", "w"), indent=1)
for c in clusters:
    print(f"\n== cluster {c['id']} ({c['size']}) leans: {', '.join(c['leaning'])} | {c['categories']}")
    print("   tags:", ", ".join(c["top_tags"][:6])); print("   ", " / ".join(e[:38] for e in c["examples"][:8]))

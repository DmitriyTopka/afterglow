"""Step 2 of the real catalog: pick products from Qloo candidates and add shop metadata.
Vinyl album titles and covers come from the iTunes Search API, book authors from Open Library,
everything else (images, film credits, platforms) from Qloo itself. Prices are ours (fictional store)."""
import json, re, time, hashlib, urllib.parse, urllib.request
from collections import defaultdict

import sys
C = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "data/catalog_build/candidates.json"))
APPEND = "--append" in sys.argv
QUOTA = {"artist": 110, "book": 90, "movie": 80, "videogame": 50, "tv_show": 30}
PRICE = {"artist": (24, 42), "book": (12, 28), "movie": (15, 30), "videogame": (20, 60), "tv_show": (30, 80)}
CAT = {"artist": "Vinyl", "book": "Books", "movie": "Film", "videogame": "Games", "tv_show": "TV box sets"}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "taste-layer-hackathon/0.1 (sirenamc2 on devpost)"})
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(req, timeout=30))
        except Exception as e:
            time.sleep(3 * (i + 1))
    return None

def price(eid, t):
    lo, hi = PRICE[t]
    return lo + int(hashlib.sha1(eid.encode()).hexdigest(), 16) % (hi - lo + 1)

def http_img(c):
    u = ((c.get("properties") or {}).get("image") or {}).get("url") or ""
    return u if u.startswith("http") else None

def pick(t):
    cs = [c for c in C if c["type"].endswith(":" + t)]
    if t != "artist":
        cs = [c for c in cs if http_img(c)]
    if APPEND:
        return cs
    by_seed = defaultdict(list)
    for c in sorted(cs, key=lambda c: (-len(c["seeds"]), -(c["popularity"] or 0))):
        by_seed[c["seeds"][0]].append(c)
    out, seen = [], set()
    while len(out) < QUOTA[t] and any(by_seed.values()):
        for s in list(by_seed):
            while by_seed[s] and by_seed[s][0]["entity_id"] in seen:
                by_seed[s].pop(0)
            if by_seed[s] and len(out) < QUOTA[t]:
                c = by_seed[s].pop(0); seen.add(c["entity_id"]); out.append(c)
    return out

def clean_book(n):
    return re.sub(r"\s*\([^)]*#[^)]*\)\s*$", "", n).replace(", or There and Back Again", "").strip()

items = []
for t in QUOTA:
    for c in pick(t):
        p = c.get("properties") or {}
        it = {"id": None, "category": CAT[t], "price_usd": price(c["entity_id"], t),
              "qloo": {"type": c["type"], "name": c["name"], "entity_id": c["entity_id"]},
              "tags": c.get("tags", [])[:8], "popularity": c["popularity"], "image": http_img(c), "image_source": "qloo"}
        if t == "artist":
            q = urllib.parse.urlencode({"term": c["name"], "entity": "album", "attribute": "artistTerm", "limit": 15})
            r = get("https://itunes.apple.com/search?" + q) or {"results": []}
            time.sleep(3.2)  # iTunes allows about 20 calls a minute
            albums = [a for a in r["results"] if a.get("artistName", "").lower() == c["name"].lower() and a.get("trackCount", 0) >= 7
                      and not re.search(r"live|greatest|best of|remix|karaoke|tribute|edition\)|collection|essential", a.get("collectionName", ""), re.I)]
            if not albums:
                continue
            a = albums[0]
            it.update(title=f"{c['name']}: {a['collectionName']}, LP", creators=[c["name"]], works=[a["collectionName"]],
                      image=a["artworkUrl100"].replace("100x100bb", "600x600bb"), image_source="itunes", year=(a.get("releaseDate") or "")[:4])
        elif t == "book":
            title = clean_book(c["name"])
            r = get("https://openlibrary.org/search.json?" + urllib.parse.urlencode({"title": title, "fields": "author_name,first_publish_year", "limit": 1})) or {}
            doc = (r.get("docs") or [{}])[0]
            authors = (doc.get("author_name") or [])[:2]
            it.update(title=(f"{authors[0]}: {title}" if authors else title), creators=authors, works=[title], year=str(p.get("publication_year") or doc.get("first_publish_year") or ""))
        elif t in ("movie", "tv_show"):
            fmt = "4K UHD Blu-ray" if t == "movie" and (p.get("release_year") or 0) >= 2010 else ("Blu-ray" if t == "movie" else "complete series box set")
            it.update(title=f"{c['name']} ({fmt})", creators=(p.get("collaborators") or [])[:12], works=[c["name"]], year=str(p.get("release_year") or ""))
        else:
            plats = p.get("platforms") or []
            it.update(title=f"{c['name']}" + (f" ({plats[-1]})" if plats else ""), creators=[x for x in [p.get("developer"), p.get("publisher")] if isinstance(x, str)], works=[c["name"]], year=str(p.get("release_year") or ""))
        it["blurb"] = p.get("short_description") or (p.get("description") or "")[:200]
        items.append(it)
    print(t, sum(1 for i in items if i["qloo"]["type"].endswith(t)))

if APPEND:
    cat = json.load(open("data/catalog.json"))
    start = max(int(i["id"][1:]) for i in cat["items"]) + 1
    for n, it in enumerate(items, start):
        it["id"] = f"c{n:03d}"
    cat["items"] += items
    json.dump(cat, open("data/catalog.json", "w"), indent=1, ensure_ascii=False)
    print("appended", len(items), "-> catalog", len(cat["items"]))
    raise SystemExit
for n, it in enumerate(items, 1):
    it["id"] = f"c{n:03d}"
json.dump({"store": "TBD (fictional demo store)", "note": "Real titles resolved in Qloo; vinyl covers from iTunes Search API, other images from Qloo entity data; prices and the store are made up.", "items": items},
          open("data/catalog_build/catalog_v2.json", "w"), indent=1, ensure_ascii=False)
print("total", len(items), "with image", sum(1 for i in items if i.get("image")), "with creators", sum(1 for i in items if i.get("creators")))

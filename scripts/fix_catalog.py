"""Post-pass on catalog_v2: book authors from the Open Library work with the most editions (title must match),
and game platforms chosen by a shop-friendly priority (mobile-only games dropped)."""
import json, re, time, urllib.parse, urllib.request, hashlib
P = "data/catalog_build/catalog_v2.json"
d = json.load(open(P)); C = {c["entity_id"]: c for c in json.load(open("data/catalog_build/candidates.json"))}
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "taste-layer-hackathon/0.1"})
    for i in range(4):
        try: return json.load(urllib.request.urlopen(req, timeout=30))
        except Exception: time.sleep(3 * (i + 1))
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
keep = []
for it in d["items"]:
    t = it["qloo"]["type"]
    if t.endswith("book"):
        title = it["works"][0]; short = title.split(":")[0]
        r = get("https://openlibrary.org/search.json?" + urllib.parse.urlencode({"title": short, "sort": "editions", "fields": "title,author_name,first_publish_year", "limit": 5})) or {}
        doc = next((x for x in r.get("docs", []) if norm(x.get("title", "")).startswith(norm(short)[:20])), None)
        authors = (doc or {}).get("author_name", [])[:2]
        it["creators"] = authors; it["title"] = f"{authors[0]}: {title}" if authors else title
    if t.endswith("videogame"):
        plats = C[it["qloo"]["entity_id"]]["properties"].get("platforms") or []
        prio = ["PlayStation 5", "Nintendo Switch", "PlayStation 4", "Xbox Series X|S", "Xbox One", "Microsoft Windows", "PlayStation 3", "Xbox 360", "Wii"]
        plat = next((p for p in prio if p in plats), None)
        if not plat: print("drop game (no shop platform):", it["works"][0], plats); continue
        it["title"] = f"{it['works'][0]} ({'PC' if plat == 'Microsoft Windows' else plat})"
    keep.append(it)
d["items"] = keep
json.dump(d, open(P, "w"), indent=1, ensure_ascii=False)
b = [i for i in keep if i["qloo"]["type"].endswith("book")]
print("items", len(keep), "| books without author", sum(1 for i in b if not i["creators"]))

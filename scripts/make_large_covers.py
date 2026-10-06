"""Product-page artwork: download each catalog image again and store up to 640px WebP in public/covers-lg/{id}.webp.
Never upscales: if the source is smaller, the file keeps the source size and the page shows it no larger than that.
Writes data/cover_sizes.json ({id: [w, h]}) so the page knows the real size."""
import io, json, os, urllib.request, concurrent.futures as cf
from collections import Counter
from PIL import Image
items = json.load(open("data/catalog.json"))["items"]
os.makedirs("public/covers-lg", exist_ok=True)
sizes = {}
def job(i):
    out = f"public/covers-lg/{i['id']}.webp"
    try:
        if os.path.exists(out):
            im = Image.open(out); sizes[i["id"]] = list(im.size); return "skip"
        raw = urllib.request.urlopen(urllib.request.Request(i["image"], headers={"User-Agent": "Mozilla/5.0"}), timeout=40).read()
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        im.thumbnail((640, 640), Image.LANCZOS)
        im.save(out, "WEBP", quality=80, method=6)
        sizes[i["id"]] = list(im.size)
        return "ok"
    except Exception as e:
        return "fail:" + type(e).__name__
with cf.ThreadPoolExecutor(8) as ex: print(Counter(ex.map(job, items)))
json.dump(sizes, open("data/cover_sizes.json", "w"))
small = [k for k, (w, h) in sizes.items() if max(w, h) < 420]
print("below 420px:", len(small))

"""Download each catalog image once and store a 240px JPEG thumbnail in public/covers/{id}.jpg."""
import json, subprocess, os, concurrent.futures as cf
from collections import Counter
items = json.load(open("data/catalog.json"))["items"]
def job(i):
    out = f"public/covers/{i['id']}.jpg"
    if os.path.exists(out): return "skip"
    tmp = f"/tmp/cv_{i['id']}"
    if subprocess.run(["curl", "-sL", "-m", "40", "-o", tmp, i["image"]]).returncode or not os.path.exists(tmp) or os.path.getsize(tmp) < 500: return "dl-fail"
    r = subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "70", "-Z", "240", tmp, "--out", out], capture_output=True).returncode
    os.remove(tmp)
    return "ok" if r == 0 and os.path.exists(out) else "conv-fail"
with cf.ThreadPoolExecutor(8) as ex: print(Counter(ex.map(job, items)))

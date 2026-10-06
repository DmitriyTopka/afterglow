# Checks every external image URL in data/*.json (the ones the site renders for titles we do not stock).
# Prints broken URLs by host and by file. Usage: python3 scripts/check_images.py [--json out.json]
import json, re, glob, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
pat = re.compile(r'https?://[^"\\\s]+')
urls = {}
for f in glob.glob('data/*.json'):
    for u in pat.findall(open(f).read()):
        if re.search(r'\.(jpe?g|png|webp)|images\.qloo|mzstatic|media-amazon|lastfm|metacritic', u):
            urls.setdefault(u, set()).add(os.path.basename(f))
def check(u):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-1023'}), timeout=15)
        ct = r.headers.get('Content-Type', '')
        return u, r.status, ct if ct.startswith('image') else 'not-image:' + ct
    except Exception as e:
        return u, getattr(e, 'code', 0), str(e)[:60]
with ThreadPoolExecutor(16) as ex:
    res = list(ex.map(check, urls))
bad = [(u, s, m) for u, s, m in res if not (200 <= s < 300 and not m.startswith('not-image'))]
print(f'checked {len(res)}, broken {len(bad)}')
from collections import Counter
print(Counter(re.sub(r'https?://([^/]+)/.*', r'\1', u) for u, _, _ in bad).most_common())
print(Counter(f for u, _, _ in bad for f in urls[u]).most_common())
if '--json' in sys.argv:
    json.dump([{'url': u, 'status': s, 'msg': m, 'files': sorted(urls[u])} for u, s, m in bad], open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)

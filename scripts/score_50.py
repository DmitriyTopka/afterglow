"""The untuned set the council asked for: the 20 even scenarios of eval v2 (never used for tuning) plus 30 new blind
scenarios (eval/v3_scenarios.json, written and labelled after all tuning). Agent = latest runs (eval/v7_runs.json and
eval/w30_runs.json), Claude alone = the same model with the catalog as text (eval/v3_runs.json, eval/w30_runs.json).
P@3 on the blind labels and pooled with blind-judge verdicts, a paired bootstrap 95% interval for the difference, and
a two-sided sign test on per-request wins. Writes the picks no judge has seen to eval/w50_unjudged.json."""
import json, random
from math import comb

v2 = {s['id']: s for s in json.load(open('eval/v2_scenarios.json'))['scenarios']}
w = {s['id']: s for s in json.load(open('eval/v3_scenarios.json'))['scenarios']}
S = {**{k: v for k, v in v2.items() if int(k[1:]) % 2 == 0}, **w}
v7, v3, w30 = json.load(open('eval/v7_runs.json')), json.load(open('eval/v3_runs.json')), json.load(open('eval/w30_runs.json'))
agent = {k: (v7[k]['ids'] if k in v7 else w30[k]['agent']['ids']) for k in S}
claude = {k: (v3[k]['claude']['ids'] if k in v3 else w30[k]['claude']['ids']) for k in S}
pool = {}
for f in ['eval/pool_verdicts.json', 'eval/pool_v2_verdicts.json', 'eval/pool_v3_verdicts.json', 'eval/pool_v4_verdicts.json',
          'eval/pool_v5_verdicts.json', 'eval/pool_v6_verdicts.json', 'eval/pool_v7_verdicts.json', 'eval/pool_w50_verdicts.json']:
    try:
        for sid, v in json.load(open(f)).items():
            if isinstance(v, dict): pool.setdefault(sid, {}).update(v)
    except FileNotFoundError: pass

def p3(sid, ids, pooled):
    good = set(S[sid]['good']) | ({k for k, v in pool.get(sid, {}).items() if v == 'yes'} if pooled else set())
    return sum(1 for i in ids[:3] if i in good) / 3

unseen = {}
for arm in (agent, claude):
    for sid, ids in arm.items():
        for i in ids[:3]:
            if i not in S[sid]['good'] and i not in pool.get(sid, {}) and i not in unseen.get(sid, []): unseen.setdefault(sid, []).append(i)
json.dump(unseen, open('eval/w50_unjudged.json', 'w'), indent=1)

random.seed(7)
ids = sorted(S)
for pooled in (False, True):
    a = {k: p3(k, agent[k], pooled) for k in ids}; c = {k: p3(k, claude[k], pooled) for k in ids}
    diffs = [a[k] - c[k] for k in ids]
    boot = sorted(sum(random.choice(diffs) for _ in ids) / len(ids) for _ in range(10000))
    wins = sum(d > 0 for d in diffs); losses = sum(d < 0 for d in diffs); n = wins + losses
    p = min(1.0, 2 * sum(comb(n, i) for i in range(min(wins, losses) + 1)) / 2 ** n) if n else 1.0
    print(f"{'pooled' if pooled else 'labels'}: agent {sum(a.values())/len(ids):.2f}  claude {sum(c.values())/len(ids):.2f}  "
          f"diff {sum(diffs)/len(ids):+.2f}  95% CI [{boot[250]:+.2f}, {boot[9750]:+.2f}]  W/L {wins}/{losses}  sign p={p:.3f}  (n={len(ids)})")
print('unjudged top-3 picks (both arms):', sum(len(v) for v in unseen.values()))

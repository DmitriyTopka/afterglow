"""Score eval v4 (agent after council fixes) against v3 arms. P@3 on labels and pooled (labels + blind judge 'yes').
Prints the agent's top-3 picks that no judge has seen yet (they need a blind verdict before pooled numbers are final)."""
import json, glob
S = {s['id']: s for s in json.load(open('eval/v2_scenarios.json'))['scenarios']}
v3 = json.load(open('eval/v3_runs.json')); v4 = json.load(open(__import__("sys").argv[1] if len(__import__("sys").argv) > 1 else "eval/v5_runs.json"))
pool = {}
for f in ['eval/pool_verdicts.json', 'eval/pool_v2_verdicts.json', 'eval/pool_v3_verdicts.json', 'eval/pool_v4_verdicts.json', 'eval/pool_v5_verdicts.json', 'eval/pool_v6_verdicts.json']:
    try:
        for sid, v in json.load(open(f)).items():
            if isinstance(v, dict): pool.setdefault(sid, {}).update(v)
    except FileNotFoundError: pass
def p3(sid, ids, pooled):
    good = set(S[sid]['good']) | ({k for k, v in pool.get(sid, {}).items() if v == 'yes'} if pooled else set())
    return sum(1 for i in ids[:3] if i in good) / 3
arms = {'agent_v5': {k: v['ids'] for k, v in v4.items()}, 'agent_v3': {k: v['agent']['ids'] for k, v in v3.items()}, 'claude': {k: v['claude']['ids'] for k, v in v3.items()}}
unseen = {}
for sid, ids in arms['agent_v5'].items():
    for i in ids[:3]:
        if i not in S[sid]['good'] and i not in pool.get(sid, {}): unseen.setdefault(sid, []).append(i)
for name, subset in [('all 40', sorted(S)), ('even 20 (clean)', [s for s in sorted(S) if int(s[1:]) % 2 == 0])]:
    for pooled in (False, True):
        row = {a: sum(p3(s, arms[a].get(s, []), pooled) for s in subset) / len(subset) for a in arms}
        w = sum(1 for s in subset if p3(s, arms['agent_v5'][s], pooled) > p3(s, arms['claude'][s], pooled))
        l = sum(1 for s in subset if p3(s, arms['agent_v5'][s], pooled) < p3(s, arms['claude'][s], pooled))
        print(f"{name:16} {'pooled' if pooled else 'labels'}: " + "  ".join(f"{a} {v:.2f}" for a, v in row.items()) + f"   v5 vs claude W/L {w}/{l}")
print('questions instead of picks:', [k for k, v in v4.items() if not v['ids']])
print('unjudged top-3 picks:', sum(len(v) for v in unseen.values()))
json.dump(unseen, open('eval/v5_unjudged.json', 'w'), indent=1)

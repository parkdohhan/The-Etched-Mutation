"""실험 A — 거리 → 해석.
거리 = 작가 순서에서 두 씬이 떨어진 칸 수 |a−b| (작가가 벌려 놓은 거리).
해석의 크기 = 그 실의 어긋남 resid (실의 통역이 전체 장부 하나로 설명 안 되는 양)
             + 사람마다 다른 정도 r (같은 실을 밟은 사람들끼리의 통역 차이, w≥2만)
             + 통역 크기 gnorm (그 실을 지날 때 감정이 얼마나 뛰나)
입력: undw_piece-261105.json (edges: a,b,w,r,gnorm,resid)
"""
import json, sys, random, statistics as st
from collections import defaultdict

d = json.load(open(sys.argv[1], encoding="utf-8"))
E = d["edges"]
for e in E: e["gap"] = abs(e["a"] - e["b"])

def grp(g):
    if g == 1: return "1 (작가 이웃)"
    if g == 2: return "2"
    if g <= 4: return "3–4"
    if g <= 8: return "5–8"
    return "9–12"
order = ["1 (작가 이웃)", "2", "3–4", "5–8", "9–12"]
G = defaultdict(list)
for e in E: G[grp(e["gap"])].append(e)

def m(xs): return st.mean(xs) if xs else float("nan")
print("## A-1. 거리 칸 수별 — 실의 수·밟힌 횟수·어긋남")
print("거리      실수  걸음  평균w  w=1비율  w≥3실  통역크기  어긋남(전부)  어긋남(w≥2)  사람차이r(w≥2)")
for k in order:
    es = G[k]
    if not es: continue
    w2 = [e for e in es if e["w"] >= 2]
    print(f"{k:<9} {len(es):>4} {sum(e['w'] for e in es):>5} {m([e['w'] for e in es]):>5.1f} {sum(e['w']==1 for e in es)/len(es):>7.0%} {sum(e['w']>=3 for e in es):>5} {m([e['gnorm'] for e in es]):>8.3f} {m([e['resid'] for e in es]):>12.3f} {m([e['resid'] for e in w2]):>12.3f} {m([e['r'] for e in w2]):>14.3f}")
print()

# 가능한 쌍 수 대비 실제 밟힌 비율 (작가가 벌린 거리 g 인 쌍은 13−g 개)
print("## A-2. 거리별 '가능한 쌍' 중 실제로 누군가 이은 비율 (겉돎의 자)")
for g in range(1, 13):
    poss = 13 - g
    es = [e for e in E if e["gap"] == g]
    print(f"거리 {g:>2}: 가능한 쌍 {poss:>2}, 이어진 쌍 {len(es):>2} ({len(es)/poss:.0%}), 걸음 {sum(e['w'] for e in es):>3}, 평균 어긋남 {m([e['resid'] for e in es]):.3f}")
print()

# 상관 + 영모형 (w≥2 실만, 잡음 통제)
def spearman(x, y):
    def rank(v):
        s = sorted(range(len(v)), key=lambda i: v[i]); r = [0]*len(v)
        i = 0
        while i < len(s):
            j = i
            while j+1 < len(s) and v[s[j+1]] == v[s[i]]: j += 1
            for k in range(i, j+1): r[s[k]] = (i+j)/2
            i = j+1
        return r
    rx, ry = rank(x), rank(y); n = len(x)
    mx, my = sum(rx)/n, sum(ry)/n
    num = sum((a-mx)*(b-my) for a, b in zip(rx, ry))
    den = (sum((a-mx)**2 for a in rx) * sum((b-my)**2 for b in ry)) ** 0.5
    return num/den if den else 0.0

random.seed(20261106)
for label, sel in (("w≥2 실", [e for e in E if e["w"] >= 2]), ("w≥3 실", [e for e in E if e["w"] >= 3]), ("전부", E)):
    gaps = [e["gap"] for e in sel]
    print(f"## A-3. 거리와 해석의 상관 ({label}, n={len(sel)}) — 스피어만, 영모형 = 거리 꼬리표 섞기 2000회")
    for name, key in (("어긋남 resid", "resid"), ("통역 크기 gnorm", "gnorm"), ("사람차이 r", "r"), ("무게 w", "w")):
        ys = [e[key] for e in sel]
        obs = spearman(gaps, ys)
        null = []
        for _ in range(2000):
            g2 = gaps[:]; random.shuffle(g2); null.append(spearman(g2, ys))
        p = sum(1 for v in null if abs(v) >= abs(obs)) / len(null)
        print(f"  {name:<12} ρ = {obs:+.3f}   [섞은 값이 이만큼 큰 비율 {p:.3f}]")
    print()

"""되돌이 걸음을 '작가 순서' 대신 '집단 순서(등뼈)' 기준으로 다시 센다.
집단 순서 = 각 씬이 회차 안에서 차지한 평균 위치(0~1)로 정렬. 하드코딩 없음.
"""
import json, sys, statistics as st
from collections import defaultdict

d = json.load(open(sys.argv[1], encoding="utf-8"))
runs = sorted(d["runSeq"], key=lambda r: r["n"])
labels = {n["id"]: n["label"] for n in d["nodes"]}

# 집단 순서: 평균 정규화 위치
pos = defaultdict(list)
for r in runs:
    s = r["seq"]; L = len(s)
    for i, x in enumerate(s):
        pos[x].append(i / (L - 1) if L > 1 else 0.5)
order = sorted(pos, key=lambda x: st.mean(pos[x]))
rank = {x: i for i, x in enumerate(order)}
print("집단 순서(평균 위치 오름차순):", "→".join(f"{x}" for x in order))
print("  (문서 등뼈: 2→6→5→9→13→7→11→3→10→4, 1·8·12 는 등뼈 밖)")
print("  평균 위치:", ", ".join(f"{x}:{st.mean(pos[x]):.2f}" for x in order))
print()

walks = []
for r in runs:
    s = r["seq"]
    for i in range(1, len(s)):
        if s[i] != s[i-1]: walks.append((s[i-1], s[i]))
mult = defaultdict(int)
for a, b in walks: mult[(min(a,b), max(a,b))] += 1

def count(backfn, name):
    nb = sum(1 for a, b in walks if backfn(a, b))
    thin = [(a, b) for a, b in walks if mult[(min(a,b),max(a,b))] <= 2]
    thick = [(a, b) for a, b in walks if mult[(min(a,b),max(a,b))] >= 3]
    nbt = sum(1 for a, b in thin if backfn(a, b)); nbk = sum(1 for a, b in thick if backfn(a, b))
    print(f"[{name}] 되돌이 {nb}/{len(walks)} = {nb/len(walks):.0%} · 샛길 위 {nbt}/{len(thin)} = {nbt/len(thin):.0%} · 등뼈 위 {nbk}/{len(thick)} = {nbk/len(thick):.0%}")

count(lambda a, b: b < a, "작가 번호 기준")
count(lambda a, b: rank[b] < rank[a], "집단 순서 기준")
print()
# 작가 기준 되돌이 중, 집단 기준으로는 앞으로 가는 걸음 = '반전'이 아니라 '집단 재배열'
both = sum(1 for a, b in walks if b < a and rank[b] < rank[a])
auth_only = sum(1 for a, b in walks if b < a and rank[b] > rank[a])
print(f"작가 기준 되돌이 72 중: 집단 기준으로도 되돌이 {both} · 집단 기준으론 앞으로 {auth_only}")
# 가장 많이 밟힌 되돌이(작가 기준) 실 5개
dirc = defaultdict(int)
for a, b in walks: dirc[(a, b)] += 1
top = sorted(((k, v) for k, v in dirc.items() if k[1] < k[0]), key=lambda kv: -kv[1])[:6]
print("작가 기준 되돌이 걸음 상위:", ", ".join(f"{a}→{b}({v}, 집단:{'앞' if rank[b]>rank[a] else '뒤'})" for (a, b), v in top))

"""기준선 비교 — 같은 자(Σw|잔차|²/Σw|g|²)로 '무변화'·'작가 장부' 모형을 Track B 와 나란히.
입력: undw_raw.json (pull_undw_mac.mjs 산출). 2026-11-06.
"""
import json, sys, math
from collections import defaultdict
raw=json.load(open(sys.argv[1],encoding="utf-8"))
scenes=sorted(raw["scenes"],key=lambda s:s["scene_order"]); sid2i={s["id"]:i for i,s in enumerate(scenes)}
keys=set()
for p in raw["plays"]: keys|=set((p["user_emotion"] or {}).keys())
for s in scenes: keys|=set((s["original_emotion"] or {}).keys())
AX=sorted(keys); D=len(AX)
vec=lambda d:[float((d or {}).get(k,0.0)) for k in AX]
O=[vec(s["original_emotion"]) for s in scenes]
runs=defaultdict(list)
for p in raw["plays"]: runs[p["run_id"]].append(p)
und=defaultdict(list)
for rid,ps in runs.items():
    ps.sort(key=lambda p:p["created_at"])
    for i in range(1,len(ps)):
        a,b=sid2i[ps[i-1]["scene_id"]],sid2i[ps[i]["scene_id"]]
        if a==b: continue
        va,vb=vec(ps[i-1]["user_emotion"]),vec(ps[i]["user_emotion"])
        p_,q_=min(a,b),max(a,b); vp,vq=(va,vb) if a==p_ else (vb,va)
        und[(p_,q_)].append([x-y for x,y in zip(vp,vq)])
n2=lambda v:sum(x*x for x in v)
G=[];A=[];W=[]
for (p_,q_),ds in und.items():
    w=len(ds); G.append([sum(d[k] for d in ds)/w for k in range(D)]); A.append([O[p_][k]-O[q_][k] for k in range(D)]); W.append(w)
den=sum(w*n2(g) for g,w in zip(G,W))
num_author=sum(w*n2([g[k]-a[k] for k in range(D)]) for g,a,w in zip(G,A,W))
s=sum(w*sum(g[k]*a[k] for k in range(D)) for g,a,w in zip(G,A,W))/sum(w*n2(a) for a,w in zip(A,W))
num_s=sum(w*n2([g[k]-s*a[k] for k in range(D)]) for g,a,w in zip(G,A,W))
print("## 같은 조건(Σw|잔차|²/Σw|g|²)에서 기준선 비교")
print(f"  무변화 기준선(이웃 값 같다고 기대, g=0 예측): ρ = 1.000 (정의상)")
print(f"  작가 장부 기준선(작가 원본 차이로 예측):          ρ = {num_author/den:.3f}  · 배율 맞춘 판(s={s:.2f}): ρ = {num_s/den:.3f}")
print(f"  Track B 장부 하나(맞춤) 0.502 · (실 빼고 예측) 0.851 — exp_c_innovation.py 참조")
print("  주의: 작가 벡터(원본 감정)와 독자 벡터(기록 감정)의 눈금이 다를 수 있음 — 배율 맞춘 판이 그 교락의 1차 보정")

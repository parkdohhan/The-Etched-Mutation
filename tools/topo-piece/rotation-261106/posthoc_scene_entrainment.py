"""사후 점검(사전 등록 §10.2) — 같은 씬 안 관객 벡터가 분류기 때문에 똑같이 나오는가.
입력: undw_raw.json (pull_undw_mac.mjs 산출). 기억 축 = 13씬 original_emotion 값>0 키 합집합(사전 등록 §3).
출력: 같은 씬·다른 사람 / 다른 씬·다른 사람 / 축 재배열 바닥 / 씬 평균 뺀 뒤 코사인. 2026-11-07.
"""
import json, sys, math, random, statistics as st
from collections import defaultdict
raw=json.load(open(sys.argv[1],encoding="utf-8"))
scenes=sorted(raw["scenes"],key=lambda s:s["scene_order"]); sid2o={s["id"]:s["scene_order"] for s in scenes}
AX=sorted({k for s in scenes for k,v in (s["original_emotion"] or {}).items() if v and v>0})
vec=lambda d:[float((d or {}).get(k,0.0)) for k in AX]
O={s["scene_order"]:vec(s["original_emotion"]) for s in scenes}
def cos(a,b):
    na=math.sqrt(sum(x*x for x in a)); nb=math.sqrt(sum(x*x for x in b)); return sum(x*y for x,y in zip(a,b))/(na*nb) if na and nb else float('nan')
pts=[(p["run_id"],sid2o[p["scene_id"]],vec(p["user_emotion"])) for p in raw["plays"] if p.get("user_emotion")]
pts=[p for p in pts if any(x>0 for x in p[2])]
by=defaultdict(list)
for r,s,v in pts: by[s].append((r,v))
print(f"축 {len(AX)} · 점 {len(pts)} (영벡터 제외)")
within=[]
for s,items in by.items():
    for i in range(len(items)):
        for j in range(i+1,len(items)):
            if items[i][0]!=items[j][0]: within.append(cos(items[i][1],items[j][1]))
random.seed(261107); allpts=[(s,v) for s,items in by.items() for _,v in items]
between=[]; null=[]
for _ in range(20000):
    (s1,v1),(s2,v2)=random.sample(allpts,2)
    if s1!=s2: between.append(cos(v1,v2))
    w=v2[:]; random.shuffle(w); null.append(cos(v1,w))
cw=[]
for s,items in by.items():
    if len(items)<3: continue
    mean=[st.mean(v[k] for _,v in items) for k in range(len(AX))]
    cen=[(r,[x-m for x,m in zip(v,mean)]) for r,v in items]
    for i in range(len(cen)):
        for j in range(i+1,len(cen)):
            if cen[i][0]!=cen[j][0]:
                c=cos(cen[i][1],cen[j][1])
                if not math.isnan(c): cw.append(c)
print(f"같은 씬·다른 사람 평균 코사인 = {st.mean(within):.3f} (쌍 {len(within)})")
print(f"다른 씬·다른 사람 평균 코사인 = {st.mean(between):.3f}")
print(f"축 무작위 재배열 바닥 평균 코사인 = {st.mean(null):.3f}")
print(f"관객 벡터 vs 그 씬 작가 원본 평균 코사인 = {st.mean(cos(v,O[s]) for s,v in allpts):.3f}")
print(f"씬 평균 뺀 뒤 같은 씬 관객끼리 평균 코사인 = {st.mean(cw):.3f}")

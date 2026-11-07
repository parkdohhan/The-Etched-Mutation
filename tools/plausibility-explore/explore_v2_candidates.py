"""탐색 재분석 (사전 등록 밖, 판정 없음) — v2 등록 후보 고르기. 2026-11-07.
봉인된 tools/plausibility 는 건드리지 않고, 같은 정의(걸음·Ω·백분위·N5)를 파이썬으로 다시 써서
M2_self(회차 안 자기 평균 중심화)·M2_global(관객 평균 중심화)·길이 층화·구획 A 이항검정을 본다.
입력: tools/plausibility/out/raw-<날짜>.json (원문 0자). 출력: 표(표준출력).
"""
import json, sys, math, random, statistics as st
from collections import defaultdict
raw=json.load(open(sys.argv[1],encoding="utf-8"))
scenes=sorted(raw["scenes"],key=lambda s:int(s["scene_order"]))
def parse(v):
    if not v: return {}
    if isinstance(v,dict): return v
    try: return json.loads(v)
    except Exception: return {}
AX=sorted({k for s in scenes for k,v in parse(s["original_emotion"]).items() if float(v)>0})
def vec(d): return [float((d or {}).get(k,0.0)) for k in AX]
def norm(a): return math.sqrt(sum(x*x for x in a))
def unit(a):
    n=norm(a); return [x/n for x in a] if n>0 else [0.0]*len(a)
def cos(a,b):
    na,nb=norm(a),norm(b); return sum(x*y for x,y in zip(a,b))/(na*nb) if na and nb else 0.0
add=lambda a,b:[x+y for x,y in zip(a,b)]; sub=lambda a,b:[x-y for x,y in zip(a,b)]; scale=lambda a,s:[x*s for x in a]
iszero=lambda a,eps=1e-12: norm(a)<=eps
O={s["id"]:unit(vec(parse(s["original_emotion"]))) for s in scenes}
IDS=[s["id"] for s in scenes]; ORD={s["id"]:int(s["scene_order"]) for s in scenes}
obar=unit([sum(O[i][k] for i in IDS) for k in range(len(AX))])
# 걸음 (봉인 코드 규약: 방문 = 일지 visit_order 앞부분 + plays 행, Ω = 미방문, u = 기억 축 단위벡터)
journal={j["run_id"]:j.get("run_traces") for j in raw.get("journals",[])}
runs=defaultdict(list)
for p in raw["plays"]: runs[p["run_id"]].append(p)
steps=[]
for rid,rows in runs.items():
    rows.sort(key=lambda r:r["created_at"])
    visited=set()
    jt=journal.get(rid); vo=jt.get("visit_order") if isinstance(jt,dict) else None
    if vo and rows:
        vo=[str(v).split("-",1)[1] if str(v).startswith(("core-","bridge-","void-")) else str(v) for v in vo]
        if rows[0]["scene_id"] in vo:
            for q in vo[:vo.index(rows[0]["scene_id"])]:
                if q in O: visited.add(q)
    Uprev=[]
    for t in range(len(rows)):
        r=rows[t]; i=r["scene_id"]; u=unit(vec(parse(r["user_emotion"]))); visited.add(i)
        if t+1<len(rows):
            j=rows[t+1]["scene_id"]
            if j!=i:
                omega=[s for s in IDS if s not in visited]
                steps.append(dict(run=rid,i=i,j=j,u=u,isVoid=bool(r.get("is_void")),Uprev=Uprev[:],omega=omega,t=t))
        Uprev.append(u)
print(f"걸음 {len(steps)} · 축 {len(AX)} · 회차 {len(runs)}")
# 관객 전역 평균 (에포크 0 전체, 자기 점 포함 — 탐색이라 누수 허용, 명시)
ug=unit([st.mean(s["u"][k] for s in steps) for k in range(len(AX))])
# ── 식 ──
def N3(s,c): oi=O[s["i"]]; return {k:cos(oi,O[k]) for k in c}
def N6(s,c): return N3(s,c) if iszero(s["u"]) else {k:cos(s["u"],O[k]) for k in c}
def M2_generic(s,c,ref):
    oi=O[s["i"]]; u=s["u"]; flat={k:0.5 for k in c}
    if iszero(u): return flat
    du0=sub(u,ref); di0=sub(oi,ref)
    a=0.5 if (iszero(du0,1e-9) or iszero(di0,1e-9)) else (1+cos(du0,di0))/2
    r=add(scale(oi,1-a),scale(ref,a)); du=sub(u,r)
    if iszero(du,1e-9): return flat
    out={}
    for k in c:
        dk=sub(O[k],r); out[k]=0.5 if iszero(dk,1e-9) else (1+cos(du,dk))/2
    return out
def M2(s,c): return M2_generic(s,c,obar)
def M2_global(s,c): return M2_generic(s,c,ug)
def M2_self(s,c):
    # 자기 평균(현재 포함)을 뺀 변이 vs (ô_k − ō). t=1 이면 영벡터 → 0.5
    hist=s["Uprev"]+[s["u"]]; us=unit([sum(v[k] for v in hist) for k in range(len(AX))])
    d=sub(s["u"],us); flat={k:0.5 for k in c}
    if iszero(d,1e-9): return flat
    return {k:(1+cos(d,sub(O[k],obar)))/2 if not iszero(sub(O[k],obar),1e-9) else 0.5 for k in c}
MODELS={"N3":N3,"N6":N6,"M2":M2,"M2_global":M2_global,"M2_self":M2_self}
EPS=1e-12
def pct(sc,c,j):
    n=len(c)
    if n<2 or j not in sc: return None
    sj=sc[j]; below=sum(1 for k in c if k!=j and sc[k]<sj-EPS); ties=sum(1 for k in c if k!=j and abs(sc[k]-sj)<=EPS)
    return (below+0.5*ties)/(n-1)
def B_pct(fn,stp):
    v=[pct(fn(s,s["omega"]),s["omega"],s["j"]) for s in stp if s["j"] in s["omega"]]
    v=[x for x in v if x is not None]; return (st.mean(v),len(v)) if v else (None,0)
print()
print("## ① 구획 B 백분위 (전체 Ω, 봉인 지표와 같은 정의) — N5 말 바꿔 끼우기 p (1000회, 씨앗 261107)")
byi=defaultdict(list)
for s in steps: byi[s["i"]].append(s)
def permute(stp,rng):
    out=[]
    for s in stp:
        pool=[o for o in byi[s["i"]] if o["run"]!=s["run"]]
        if not pool: out.append(s); continue
        src=pool[rng.randrange(len(pool))]; out.append(dict(s,u=src["u"],isVoid=src["isVoid"]))
    return out
res={}
for name,fn in MODELS.items():
    obs,n=B_pct(fn,steps); rng=random.Random(261107); ge=0; acc=0.0; reps=1000
    for _ in range(reps):
        v,_=B_pct(fn,permute(steps,rng)); acc+=v
        if v>=obs-EPS: ge+=1
    res[name]=(obs,n,(1+ge)/(1+reps),acc/reps)
    print(f"  {name:<10} B 백분위 {obs:.3f} (n={n}) · N5 p = {(1+ge)/(1+reps):.3f} · 영분포 평균 {acc/reps:.3f}")
# 절반 안정성 vs N3
print()
print("## ② 절반 안정성 (Δ = 모형 − N3 의 부호 유지율, 500회)")
runids=sorted(set(s["run"] for s in steps))
for name in ("M2","M2_global","M2_self","N6"):
    fn=MODELS[name]; full=B_pct(fn,steps)[0]-B_pct(N3,steps)[0]; rng=random.Random(261107); same=tot=0
    for _ in range(500):
        ids=runids[:]; rng.shuffle(ids); half=set(ids[:len(ids)//2])
        for part in ([s for s in steps if s["run"] in half],[s for s in steps if s["run"] not in half]):
            a=B_pct(fn,part)[0]; b=B_pct(N3,part)[0]
            if a is None or b is None: continue
            tot+=1; same+= (math.copysign(1,a-b)==math.copysign(1,full))
    print(f"  {name:<10} Δ vs N3 = {full:+.3f} · 부호 유지율 {same/tot:.2f}")
# ── 길이 층화 ──
print()
print("## ③ 길이 층화 — 각 걸음의 Ω 를 작가 감정 거리 1−cos(ô_i,ô_k) 3분위로 나눠, 실제 다음 씬이 든 층 안에서만 백분위")
def strata_pct(fn):
    v=[]
    for s in steps:
        c=s["omega"]
        if s["j"] not in c or len(c)<4: continue
        d={k:1-cos(O[s["i"]],O[k]) for k in c}; srt=sorted(c,key=lambda k:d[k]); n=len(srt)
        groups=[srt[:n//3] if n>=6 else srt[:max(2,n//3)], srt[n//3:2*n//3], srt[2*n//3:]]
        # 단순 3등분 (앞·중·뒤)
        q=n//3; groups=[srt[:q],srt[q:2*q],srt[2*q:]]
        g=next((grp for grp in groups if s["j"] in grp),None)
        if not g or len(g)<2: continue
        p=pct(fn(s,g),g,s["j"])
        if p is not None: v.append(p)
    return (st.mean(v),len(v)) if v else (None,0)
for name,fn in MODELS.items():
    m,n=strata_pct(fn); print(f"  {name:<10} 층 안 백분위 {m:.3f} (n={n})")
# 어느 층에 실제 다음 씬이 드나 (가까운/중간/먼)
cnt=[0,0,0]
for s in steps:
    c=s["omega"]
    if s["j"] not in c or len(c)<4: continue
    d={k:1-cos(O[s["i"]],O[k]) for k in c}; srt=sorted(c,key=lambda k:d[k]); q=len(srt)//3
    g=0 if s["j"] in srt[:q] else (1 if s["j"] in srt[q:2*q] else 2); cnt[g]+=1
print(f"  실제 다음 씬이 든 층: 가까운 {cnt[0]} · 중간 {cnt[1]} · 먼 {cnt[2]}  (균등이면 약 {sum(cnt)/3:.0f}씩)")
# ── 구획 A2 이항검정 (봉인 결과값 재사용) ──
print()
print("## ④ 구획 A2(열린 문 2개 중 j 가 높은 비율, n=118) — 0.5 대비 양측 이항검정 (봉인 결과 metrics 재사용)")
def binom_two_sided(k,n,p=0.5):
    pk=lambda x:math.comb(n,x)*p**x*(1-p)**(n-x); pobs=pk(k)
    return min(1.0,sum(pk(x) for x in range(n+1) if pk(x)<=pobs+1e-15))
for name,rate in (("N3",0.419),("N4",0.407),("N6",0.500),("M1",0.492),("M2",0.517),("M3",0.525)):
    k=round(rate*118); print(f"  {name:<4} {rate:.3f} → k={k}/118, p = {binom_two_sided(k,118):.3f}")

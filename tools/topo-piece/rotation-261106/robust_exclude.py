"""한 계정(12회차)을 빼고 핵심 수치 재계산 — 독립성 점검."""
import json, sys, math, random, statistics as st
from collections import defaultdict
EXCL = set("""ccbbbfa1-95a1-4c90-9c22-4b51e0885a47 a6aa433d-9254-4f4b-886d-7bdfe50a9e57 432ceec5-1b5c-4e06-8666-ed17e7a194fc a20cdf33-feff-42d2-b32b-ba9c9bd2bf64 44b15e05-376f-4787-a4a2-99ea36f09c89 e804fd29-d720-4607-84bf-641ed8763d48 1f8196a4-5dd3-469e-a61a-db1cc40af8cc dbb30025-f8b4-4e0b-bc85-46279b1c685d b7d67361-394f-40c5-9297-e39efa03e1bf 3ff7c74c-234c-4907-afc3-da77dffa1745 94d40926-88c6-4f54-80ca-f32e139691e1 5c7a27dd-a996-44c0-89ff-00fc9596ddc4""".split())
raw=json.load(open(sys.argv[1],encoding="utf-8"))
scenes=sorted(raw["scenes"],key=lambda s:s["scene_order"]); N=len(scenes); sid2i={s["id"]:i for i,s in enumerate(scenes)}
keys=set()
for p in raw["plays"]: keys|=set((p["user_emotion"] or {}).keys())
for s in scenes: keys|=set((s["original_emotion"] or {}).keys())
AX=sorted(keys); D=len(AX); vec=lambda d:[float((d or {}).get(k,0.0)) for k in AX]
O=[vec(s["original_emotion"]) for s in scenes]
def cos(a,b):
    na=math.sqrt(sum(x*x for x in a)); nb=math.sqrt(sum(x*x for x in b)); return sum(x*y for x,y in zip(a,b))/(na*nb) if na and nb else 0
def spearman(x,y):
    def rank(v):
        s=sorted(range(len(v)),key=lambda i:v[i]); r=[0]*len(v); i=0
        while i<len(s):
            j=i
            while j+1<len(s) and v[s[j+1]]==v[s[i]]: j+=1
            for k in range(i,j+1): r[s[k]]=(i+j)/2
            i=j+1
        return r
    rx,ry=rank(x),rank(y); n=len(x); mx,my=sum(rx)/n,sum(ry)/n
    num=sum((a-mx)*(b-my) for a,b in zip(rx,ry)); den=(sum((a-mx)**2 for a in rx)*sum((b-my)**2 for b in ry))**0.5
    return num/den if den else 0
n2=lambda v:sum(x*x for x in v)
def solve(E):
    L=[[0.0]*N for _ in range(N)]; B=[[0.0]*D for _ in range(N)]
    for e in E:
        a,b,w=e["p"],e["q"],e["w"]; L[a][a]+=w; L[b][b]+=w; L[a][b]-=w; L[b][a]-=w
        for k in range(D): B[a][k]+=w*e["g"][k]; B[b][k]-=w*e["g"][k]
    m=N-1; A=[[L[i+1][j+1] for j in range(m)]+[B[i+1][k] for k in range(D)] for i in range(m)]
    for c in range(m):
        piv=max(range(c,m),key=lambda r:abs(A[r][c])); A[c],A[piv]=A[piv],A[c]; pv=A[c][c]
        if abs(pv)<1e-12: continue
        for j in range(c,m+D): A[c][j]/=pv
        for r in range(m):
            if r!=c and A[r][c]!=0:
                f=A[r][c]
                for j in range(c,m+D): A[r][j]-=f*A[c][j]
    h=[[0.0]*D for _ in range(N)]
    for i in range(m):
        for k in range(D): h[i+1][k]=A[i][m+k]
    return h
def connected(E):
    adj=defaultdict(set)
    for e in E: adj[e["p"]].add(e["q"]); adj[e["q"]].add(e["p"])
    seen={0}; st_=[0]
    while st_:
        c=st_.pop()
        for nb in adj[c]:
            if nb not in seen: seen.add(nb); st_.append(nb)
    return len(seen)==N
def analyze(label, excl):
    runs=defaultdict(list)
    for p in raw["plays"]:
        if p["run_id"] in excl: continue
        runs[p["run_id"]].append(p)
    pts=[]; und=defaultdict(list)
    for rid,ps in runs.items():
        ps.sort(key=lambda p:p["created_at"])
        for i in range(1,len(ps)):
            a,b=sid2i[ps[i-1]["scene_id"]],sid2i[ps[i]["scene_id"]]
            if a==b: continue
            va,vb=vec(ps[i-1]["user_emotion"]),vec(ps[i]["user_emotion"])
            pts.append(dict(prev=a,cur=b,v=vb,bd=1-cos(O[a],O[b]),dev=1-cos(vb,O[b])))
            p_,q_=min(a,b),max(a,b); vp,vq=(va,vb) if a==p_ else (vb,va); und[(p_,q_)].append([x-y for x,y in zip(vp,vq)])
    E=[]
    for (p_,q_),ds in und.items():
        w=len(ds); g=[sum(d[k] for d in ds)/w for k in range(D)]; E.append(dict(p=p_,q=q_,w=w,g=g))
    h=solve(E); num=den=0.0
    for e in E: num+=e["w"]*n2([e["g"][k]-(h[e["p"]][k]-h[e["q"]][k]) for k in range(D)]); den+=e["w"]*n2(e["g"])
    rho_fit=num/den
    num=0.0
    for i,e in enumerate(E):
        rest=E[:i]+E[i+1:]
        if not connected(rest): continue
        hh=solve(rest); num+=e["w"]*n2([e["g"][k]-(hh[e["p"]][k]-hh[e["q"]][k]) for k in range(D)])
    rho_loo=num/den
    loops=len(E)-N+1
    x=[p["bd"] for p in pts]; y=[p["dev"] for p in pts]; r_pt=spearman(x,y)
    random.seed(1); by=defaultdict(list)
    for i,p in enumerate(pts): by[p["cur"]].append(i)
    c=0
    for _ in range(1000):
        x2=x[:]
        for s_,idx in by.items():
            vals=[x[i] for i in idx]; random.shuffle(vals)
            for i,v in zip(idx,vals): x2[i]=v
        if abs(spearman(x2,y))>=abs(r_pt): c+=1
    det={s_:st.mean(1-cos(O[s_],O[t]) for t in range(N) if t!=s_) for s_ in range(N)}
    ss=sorted(by); r_sc=spearman([det[s_] for s_ in ss],[st.mean(y[i] for i in by[s_]) for s_ in ss])
    print(f"[{label}] 회차 {len(runs)} · 걸음 {len(pts)} · 실 {len(E)} · 고리 {loops} · ρ(맞춤) {rho_fit:.3f} · ρ(예측) {rho_loo:.3f}")
    print(f"   다리 감정거리 vs 작가 이탈: ρ {r_pt:+.3f} [씬 안 섞기 1000회 p {c/1000:.3f}] · 씬 외딴 정도 vs 이탈 평균(n={len(ss)}): ρ {r_sc:+.3f}")
analyze("전체 37회차", set())
analyze("한 계정 12회차 제외", EXCL)

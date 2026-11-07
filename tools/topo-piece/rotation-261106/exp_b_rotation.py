"""실험 B — 회전 → 뜻 (경로의존).
회전 = 같은 씬에 다른 입구(직전 씬)로 들어옴. 뜻 = 그 씬에서 기록된 감정 벡터.
B1  같은 입구끼리 vs 다른 입구끼리 감정 거리 (씬별 라벨 섞기 영모형)
B2  작가 각도(직전 씬이 작가 이웃) vs 독자 각도(징검다리) — 작가 원본 감정과의 정합(코사인)·엔진 정렬도
B3  들어온 다리의 길이(작가 순서 칸 수) vs 작가 원본과의 거리 — 거리 → 해석(작가로부터의 이탈)
입력: undw_raw.json (DB 읽기 산출)
"""
import json, sys, random, math, statistics as st
from collections import defaultdict

raw = json.load(open(sys.argv[1], encoding="utf-8"))
scenes = sorted(raw["scenes"], key=lambda s: s["scene_order"])
sid2o = {s["id"]: s["scene_order"] for s in scenes}
orig = {s["scene_order"]: s["original_emotion"] or {} for s in scenes}
NN = {1:'욕조',2:'눈보라',3:'전화벨',4:'매달림',5:'진돗개',6:'제물의 얼굴',7:'알고 있었다',8:'서랍',9:'팬티',10:'(빈 씬)',11:'죽었구나',12:'빨래건조대',13:'화면'}

keys = set()
for p in raw["plays"]: keys |= set((p["user_emotion"] or {}).keys())
for o in orig.values(): keys |= set(o.keys())
AX = sorted(keys)
def vec(d): return [float((d or {}).get(k, 0.0)) for k in AX]
def cos(a, b):
    na = math.sqrt(sum(x*x for x in a)); nb = math.sqrt(sum(x*x for x in b))
    return sum(x*y for x, y in zip(a, b)) / (na*nb) if na and nb else 0.0
def cdist(a, b): return 1.0 - cos(a, b)

runs = defaultdict(list)
for p in raw["plays"]:
    runs[p["run_id"]].append(p)
pts = []  # 걸음으로 들어온 점만 (직전 씬이 있는 점)
for rid, ps in runs.items():
    ps.sort(key=lambda p: p["created_at"])
    for i in range(1, len(ps)):
        a, b = sid2o[ps[i-1]["scene_id"]], sid2o[ps[i]["scene_id"]]
        if a == b: continue
        pts.append(dict(run=rid, prev=a, cur=b, v=vec(ps[i]["user_emotion"]), al=ps[i]["alignment"],
                        gap=abs(a-b), author_adj=(abs(a-b) == 1), forward=(b > a)))
print(f"축 {len(AX)} · 걸음으로 들어온 점 {len(pts)} (회차 {len(runs)})")
print()

random.seed(20261106)
R = 2000

# ── B1 ──
print("## B1. 같은 씬, 같은 입구끼리 vs 다른 입구끼리 — 감정 거리(1−코사인)")
by_scene = defaultdict(list)
for p in pts: by_scene[p["cur"]].append(p)
def b1_stat(groups_by_scene):
    """씬마다 (다른 입구끼리 평균 거리 − 같은 입구끼리 평균 거리), 자격: 크기≥2 인 입구 그룹 2개 이상"""
    diffs = {}
    for s, items in groups_by_scene.items():
        g = defaultdict(list)
        for lab, v in items: g[lab].append(v)
        big = [lab for lab, vs in g.items() if len(vs) >= 2]
        if len(big) < 2: continue
        same, diff = [], []
        for i in range(len(items)):
            for j in range(i+1, len(items)):
                (la, va), (lb, vb) = items[i], items[j]
                if la not in big or lb not in big: continue
                (same if la == lb else diff).append(cdist(va, vb))
        if same and diff: diffs[s] = (st.mean(diff) - st.mean(same), len(same), len(diff), len(big))
    return diffs
obs = b1_stat({s: [(p["prev"], p["v"]) for p in ps] for s, ps in by_scene.items()})
print("씬  이름        입구수(≥2명)  같은입구쌍  다른입구쌍  차이(다른−같은)")
for s in sorted(obs):
    d, ns, nd, nb = obs[s]
    print(f"{s:>2}  {NN[s]:<9} {nb:>8} {ns:>9} {nd:>9} {d:>+10.3f}")
T = st.mean(v[0] for v in obs.values())
null = []
for _ in range(R):
    sh = {}
    for s, ps in by_scene.items():
        labs = [p["prev"] for p in ps]; random.shuffle(labs)
        sh[s] = list(zip(labs, [p["v"] for p in ps]))
    st_ = b1_stat(sh)
    null.append(st.mean(v[0] for v in st_.values()) if st_ else 0.0)
print(f"평균 차이 관측 {T:+.3f} vs 섞기 {st.mean(null):+.3f} (섞은 값이 관측 이상인 비율 {sum(1 for v in null if v >= T)/R:.3f})")
print("  읽는 법: 차이 > 0 이면 같은 입구로 온 사람들끼리 더 비슷함 = 입구(각도)가 읽힘을 바꿈")
print()

# ── B2 ──
print("## B2. 작가 각도(직전 씬이 작가 이웃)로 들어옴 vs 독자 각도(징검다리)로 들어옴")
def summarize(sel):
    c = [cos(p["v"], vec(orig[p["cur"]])) for p in sel]
    a = [p["al"] for p in sel if p["al"] is not None]
    return (st.mean(c) if c else float('nan'), st.mean(a) if a else float('nan'), len(sel))
A = [p for p in pts if p["author_adj"]]; B = [p for p in pts if not p["author_adj"]]
ca, aa, na = summarize(A); cb, ab, nb = summarize(B)
print(f"작가 이웃에서 들어온 점 {na}: 작가 원본과 코사인 {ca:.3f} · 엔진 정렬도 {aa:.3f}")
print(f"징검다리로 들어온 점   {nb}: 작가 원본과 코사인 {cb:.3f} · 엔진 정렬도 {ab:.3f}")
dc, da = ca - cb, aa - ab
nc, nal = [], []
for _ in range(R):
    idx = list(range(len(pts))); random.shuffle(idx)
    sA = [pts[i] for i in idx[:na]]; sB = [pts[i] for i in idx[na:]]
    c1, a1, _ = summarize(sA); c2, a2, _ = summarize(sB)
    nc.append(c1 - c2); nal.append(a1 - a2)
print(f"차이(작가−독자): 코사인 {dc:+.3f} [섞기에서 |차이| 이상 비율 {sum(1 for v in nc if abs(v) >= abs(dc))/R:.3f}] · 정렬도 {da:+.3f} [{sum(1 for v in nal if abs(v) >= abs(da))/R:.3f}]")
F = [p for p in pts if p["forward"]]; Bk = [p for p in pts if not p["forward"]]
cf, af, nf = summarize(F); ck, ak, nk = summarize(Bk)
print(f"앞으로 들어온 점 {nf}: 코사인 {cf:.3f} 정렬도 {af:.3f} · 거꾸로 들어온 점 {nk}: 코사인 {ck:.3f} 정렬도 {ak:.3f}")
print()

# ── B3 ──
print("## B3. 들어온 다리 길이(작가 순서 칸 수) vs 작가 원본에서 벗어난 정도(1−코사인)")
def spearman(x, y):
    def rank(v):
        s = sorted(range(len(v)), key=lambda i: v[i]); r = [0]*len(v); i = 0
        while i < len(s):
            j = i
            while j+1 < len(s) and v[s[j+1]] == v[s[i]]: j += 1
            for k in range(i, j+1): r[s[k]] = (i+j)/2
            i = j+1
        return r
    rx, ry = rank(x), rank(y); n = len(x); mx, my = sum(rx)/n, sum(ry)/n
    num = sum((a-mx)*(b-my) for a, b in zip(rx, ry))
    den = (sum((a-mx)**2 for a in rx) * sum((b-my)**2 for b in ry)) ** 0.5
    return num/den if den else 0.0
gaps = [p["gap"] for p in pts]; dev = [1 - cos(p["v"], vec(orig[p["cur"]])) for p in pts]
als = [p["al"] if p["al"] is not None else float('nan') for p in pts]
rho = spearman(gaps, dev)
nulls = []
for _ in range(R):
    g2 = gaps[:]; random.shuffle(g2); nulls.append(spearman(g2, dev))
print(f"스피어만 ρ(다리 길이, 작가에서 벗어남) = {rho:+.3f} [섞기 |ρ| 이상 비율 {sum(1 for v in nulls if abs(v) >= abs(rho))/R:.3f}]")
byg = defaultdict(list)
for p, d_ in zip(pts, dev): byg[min(p["gap"], 9)].append(d_)
print("다리 길이별 벗어남 평균: " + " · ".join(f"{g if g<9 else '9+'}:{st.mean(v):.3f}(n={len(v)})" for g, v in sorted(byg.items())))
print()
print("## 단서: 37회차 탐색, 사전 등록 없음, 접근 가능 씬은 지형 엔진이 공동 결정, 동일인 중복 가능, 씬 1 프롤로그")

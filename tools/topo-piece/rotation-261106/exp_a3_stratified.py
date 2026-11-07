"""A′-3 의 교락 분리 — '외딴 씬 효과' vs '입구(회전) 효과'.
같은 씬 안에서만 다리 거리 꼬리표를 섞는다(층화 영모형). 씬 평균은 그대로, 입구 배정만 무작위.
섞어도 ρ 가 관측만큼 나오면 효과는 씬 자체(떨어진 요소)에, 안 나오면 입구(회전)에 있다.
"""
import json, sys, random, math, statistics as st
from collections import defaultdict
raw = json.load(open(sys.argv[1], encoding="utf-8"))
scenes = sorted(raw["scenes"], key=lambda s: s["scene_order"])
sid2o = {s["id"]: s["scene_order"] for s in scenes}
keys = set()
for s in scenes: keys |= set((s["original_emotion"] or {}).keys())
for p in raw["plays"]: keys |= set((p["user_emotion"] or {}).keys())
AX = sorted(keys)
def vec(d): return [float((d or {}).get(k, 0.0)) for k in AX]
def cos(a, b):
    na = math.sqrt(sum(x*x for x in a)); nb = math.sqrt(sum(x*x for x in b))
    return sum(x*y for x, y in zip(a, b)) / (na*nb) if na and nb else 0.0
O = {s["scene_order"]: vec(s["original_emotion"]) for s in scenes}
NN = {1:'욕조',2:'눈보라',3:'전화벨',4:'매달림',5:'진돗개',6:'제물의 얼굴',7:'알고 있었다',8:'서랍',9:'팬티',10:'(빈 씬)',11:'죽었구나',12:'빨래건조대',13:'화면'}
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
runs = defaultdict(list)
for p in raw["plays"]: runs[p["run_id"]].append(p)
pts = []
for rid, ps in runs.items():
    ps.sort(key=lambda p: p["created_at"])
    for i in range(1, len(ps)):
        a, b = sid2o[ps[i-1]["scene_id"]], sid2o[ps[i]["scene_id"]]
        if a == b: continue
        v = vec(ps[i]["user_emotion"])
        pts.append(dict(run=rid, prev=a, cur=b, bd=1 - cos(O[a], O[b]), dev=1 - cos(v, O[b]), v=v))
x = [p["bd"] for p in pts]; y = [p["dev"] for p in pts]
obs = spearman(x, y)
random.seed(20261106); R = 2000
by = defaultdict(list)
for i, p in enumerate(pts): by[p["cur"]].append(i)
cnt = 0
for _ in range(R):
    x2 = x[:]
    for s, idx in by.items():
        vals = [x[i] for i in idx]; random.shuffle(vals)
        for i, v_ in zip(idx, vals): x2[i] = v_
    if abs(spearman(x2, y)) >= abs(obs): cnt += 1
print(f"## A′-3 층화 영모형 (씬 안에서만 다리 거리 섞기): 관측 ρ = {obs:+.3f}, 섞기 {R}회 중 |ρ| 이상 {cnt} ({cnt/R:.3f})")
print()
print("## 씬 안 상관 (입구 거리 vs 작가 이탈), n≥7 씬만")
tot_w, tot_n = 0.0, 0
for s in sorted(by):
    idx = by[s]
    if len(idx) < 7: continue
    xs = [x[i] for i in idx]; ys = [y[i] for i in idx]
    if len(set(xs)) < 2: continue
    r = spearman(xs, ys); tot_w += r * len(idx); tot_n += len(idx)
    print(f"  {s:>2} {NN[s]:<8} n={len(idx):>2}  ρ = {r:+.3f}  입구 종류 {len(set(p['prev'] for i in idx for p in [pts[i]]))}")
print(f"  n 가중 평균 ρ = {tot_w/tot_n:+.3f}")
print()
# 보조: 작가 이탈을 '입구 두 종류'로 — 감정상 가까운 입구(거리 중앙값 이하) vs 먼 입구, 씬 안 비교
print("## 같은 씬 안에서: 감정상 가까운 입구로 온 점 vs 먼 입구로 온 점의 작가 이탈 평균")
diffs = []
for s in sorted(by):
    idx = by[s]
    if len(idx) < 7: continue
    med = st.median(x[i] for i in idx)
    near = [y[i] for i in idx if x[i] <= med]; far = [y[i] for i in idx if x[i] > med]
    if near and far:
        d_ = st.mean(far) - st.mean(near); diffs.append(d_)
        print(f"  {s:>2} {NN[s]:<8} 가까운 입구 {st.mean(near):.3f} (n={len(near)}) · 먼 입구 {st.mean(far):.3f} (n={len(far)}) · 차이 {d_:+.3f}")
print(f"  씬 {len(diffs)}개 중 먼 입구가 더 벗어난 씬 {sum(1 for d_ in diffs if d_ > 0)}개, 평균 차이 {st.mean(diffs):+.3f}")

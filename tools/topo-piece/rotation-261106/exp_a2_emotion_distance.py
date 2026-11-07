"""실험 A′ — 거리를 '작가 순서 칸 수'가 아니라 '작가가 쓴 감정의 거리'로 다시 잼.
거리(a,b) = 1 − 코사인(작가 원본감정 a, 작가 원본감정 b). 떨어진 씬 = 다른 씬들과 평균 감정 거리가 큰 씬.
해석 = 실의 어긋남 resid · 사람차이 r · 통역크기 gnorm (undw_piece) + 점의 작가 이탈(1−코사인) (undw_raw)
"""
import json, sys, random, math, statistics as st
from collections import defaultdict
piece = json.load(open(sys.argv[1], encoding="utf-8")); raw = json.load(open(sys.argv[2], encoding="utf-8"))
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
random.seed(20261106); R = 2000
def perm(x, y):
    obs = spearman(x, y); c = 0
    for _ in range(R):
        x2 = x[:]; random.shuffle(x2)
        if abs(spearman(x2, y)) >= abs(obs): c += 1
    return obs, c / R

# 씬의 떨어짐 = 다른 12씬과의 평균 감정 거리
det = {s: st.mean(1 - cos(O[s], O[t]) for t in O if t != s) for s in O}
print("## A′-1. 작가 감정으로 본 '떨어진 씬' (다른 씬들과 평균 감정 거리, 클수록 외딴 씬)")
for s, v in sorted(det.items(), key=lambda kv: -kv[1]):
    print(f"  {s:>2} {NN[s]:<8} {v:.3f}")
print()

# 실 단위: 감정 거리 vs 해석
E = piece["edges"]
for e in E: e["ed"] = 1 - cos(O[e["a"]], O[e["b"]])
for label, sel in (("w≥2 실", [e for e in E if e["w"] >= 2]), ("w≥3 실", [e for e in E if e["w"] >= 3]), ("전부", E)):
    print(f"## A′-2. 실의 작가 감정 거리 vs 해석 ({label}, n={len(sel)}) — 스피어만, 섞기 {R}회")
    x = [e["ed"] for e in sel]
    for name, key in (("어긋남 resid", "resid"), ("통역크기 gnorm", "gnorm"), ("사람차이 r", "r"), ("무게 w", "w")):
        obs, p = perm(x, [e[key] for e in sel]); print(f"  {name:<12} ρ = {obs:+.3f} [{p:.3f}]")
    print()

# 점 단위: 들어온 다리의 감정 거리 vs 작가 이탈
runs = defaultdict(list)
for p in raw["plays"]: runs[p["run_id"]].append(p)
xs, ys, al = [], [], []
by_scene_dev = defaultdict(list)
for rid, ps in runs.items():
    ps.sort(key=lambda p: p["created_at"])
    for i in range(1, len(ps)):
        a, b = sid2o[ps[i-1]["scene_id"]], sid2o[ps[i]["scene_id"]]
        if a == b: continue
        v = vec(ps[i]["user_emotion"]); d_ = 1 - cos(v, O[b])
        xs.append(1 - cos(O[a], O[b])); ys.append(d_); by_scene_dev[b].append(d_)
obs, p = perm(xs, ys)
print(f"## A′-3. 점: 들어온 다리의 작가 감정 거리 vs 그 점의 작가 이탈(1−코사인), n={len(xs)}: ρ = {obs:+.3f} [{p:.3f}]")
print()
# 씬 단위: 떨어진 씬일수록 독자 이탈이 큰가 / 사람마다 더 갈리나
ss = sorted(by_scene_dev)
x = [det[s] for s in ss]; y1 = [st.mean(by_scene_dev[s]) for s in ss]; y2 = [st.pstdev(by_scene_dev[s]) for s in ss]
o1, p1 = perm(x, y1); o2, p2 = perm(x, y2)
print(f"## A′-4. 씬(n={len(ss)}): 떨어짐 vs 독자 이탈 평균 ρ = {o1:+.3f} [{p1:.3f}] · 떨어짐 vs 독자 이탈의 퍼짐(표준편차) ρ = {o2:+.3f} [{p2:.3f}]")
print("  씬별 (떨어짐, 이탈 평균, 퍼짐, n): " + " · ".join(f"{s}:{det[s]:.2f}/{st.mean(by_scene_dev[s]):.2f}/{st.pstdev(by_scene_dev[s]):.2f}/{len(by_scene_dev[s])}" for s in ss))

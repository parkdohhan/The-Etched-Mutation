"""실험 C — 칼만 역이용: '예측 잔차(innovation)'로 틈이 잡음인지 구조인지.
맞춘 잔차(resid)는 무거운 실을 더 잘 맞추게 되어 있어 w와 음의 상관이 생길 수밖에 없다(맞춤 편향).
그래서 실 하나를 빼고 장부를 다시 풀어 그 실을 '예측'한 뒤 실제와의 차이를 잰다 = 칼만의 innovation.
sheaf.mjs 규약 그대로: g = mean(v_p − v_q), 가중 라플라시안, 접지 노드 0, ρ = Σw|resid|²/Σw|g|².
입력: undw_raw.json
"""
import json, sys, math, random, statistics as st
from collections import defaultdict
raw = json.load(open(sys.argv[1], encoding="utf-8"))
scenes = sorted(raw["scenes"], key=lambda s: s["scene_order"]); N = len(scenes)
sid2i = {s["id"]: i for i, s in enumerate(scenes)}
keyCount = defaultdict(int)
for p in raw["plays"]:
    for k in (p["user_emotion"] or {}): keyCount[k] += 1
AX = sorted(keyCount, key=lambda k: -keyCount[k]); D = len(AX)
def vec(d): return [float((d or {}).get(k, 0.0)) for k in AX]
runs = defaultdict(list)
for p in raw["plays"]: runs[p["run_id"]].append(p)
walks = []  # (p, q, diff) with p<q, diff = v_p − v_q
for rid, ps in runs.items():
    ps.sort(key=lambda p: p["created_at"])
    for i in range(1, len(ps)):
        a, b = sid2i[ps[i-1]["scene_id"]], sid2i[ps[i]["scene_id"]]
        if a == b: continue
        va, vb = vec(ps[i-1]["user_emotion"]), vec(ps[i]["user_emotion"])
        p, q = min(a, b), max(a, b)
        vp, vq = (va, vb) if a == p else (vb, va)
        walks.append((p, q, [x - y for x, y in zip(vp, vq)]))
def build(walks_):
    und = defaultdict(list)
    for p, q, d_ in walks_: und[(p, q)].append(d_)
    E = []
    for (p, q), ds in und.items():
        w = len(ds); g = [sum(d_[k] for d_ in ds) / w for k in range(D)]
        acc = sum(sum((d_[k] - g[k]) ** 2 for k in range(D)) for d_ in ds)
        E.append(dict(p=p, q=q, w=w, g=g, r=math.sqrt(acc / w), ds=ds))
    return E
def connected(E, n):
    adj = defaultdict(set)
    for e in E: adj[e["p"]].add(e["q"]); adj[e["q"]].add(e["p"])
    seen = {0}; stack = [0]
    while stack:
        c = stack.pop()
        for nb in adj[c]:
            if nb not in seen: seen.add(nb); stack.append(nb)
    return len(seen) == n
def solve(E, n):
    """가중 라플라시안, 접지 0. 반환 h[n][D]"""
    L = [[0.0] * n for _ in range(n)]; B = [[0.0] * D for _ in range(n)]
    for e in E:
        a, b, w = e["p"], e["q"], e["w"]
        L[a][a] += w; L[b][b] += w; L[a][b] -= w; L[b][a] -= w
        for k in range(D): B[a][k] += w * e["g"][k]; B[b][k] -= w * e["g"][k]
    m = n - 1
    A = [[L[i+1][j+1] for j in range(m)] + [B[i+1][k] for k in range(D)] for i in range(m)]
    for c in range(m):  # 가우스 소거 (피벗)
        piv = max(range(c, m), key=lambda r: abs(A[r][c])); A[c], A[piv] = A[piv], A[c]
        pv = A[c][c]
        if abs(pv) < 1e-12: continue
        for j in range(c, m + D): A[c][j] /= pv
        for r in range(m):
            if r != c and A[r][c] != 0:
                f = A[r][c]
                for j in range(c, m + D): A[r][j] -= f * A[c][j]
    h = [[0.0] * D for _ in range(n)]
    for i in range(m):
        for k in range(D): h[i+1][k] = A[i][m + k]
    return h
def n2(v): return sum(x * x for x in v)
def rho(E, h):
    num = den = 0.0
    for e in E:
        res = [e["g"][k] - (h[e["p"]][k] - h[e["q"]][k]) for k in range(D)]
        num += e["w"] * n2(res); den += e["w"] * n2(e["g"])
    return num / den
def loo(E, n):
    """실마다 빼고 다시 풀어 예측 잔차. 다리(빼면 끊김)는 건너뜀."""
    out = []
    for i, e in enumerate(E):
        rest = E[:i] + E[i+1:]
        if not connected(rest, n): out.append(None); continue
        h = solve(rest, n)
        pred = [h[e["p"]][k] - h[e["q"]][k] for k in range(D)]
        out.append(math.sqrt(n2([e["g"][k] - pred[k] for k in range(D)])))
    return out
E = build(walks); h = solve(E, N)
fit = [math.sqrt(n2([e["g"][k] - (h[e["p"]][k] - h[e["q"]][k]) for k in range(D)])) for e in E]
print(f"검산: 실 {len(E)} 걸음 {len(walks)} 축 {D} ρ(맞춤) = {rho(E, h):.4f} (문서 0.5018)")
inn = loo(E, N)
ok = [i for i, v in enumerate(inn) if v is not None]
print(f"예측 잔차 계산된 실 {len(ok)} / {len(E)} (나머지는 빼면 그물이 끊기는 다리)")
def loo_rho(E, inn):
    num = den = 0.0
    for e, v in zip(E, inn):
        if v is None: continue
        num += e["w"] * v * v; den += e["w"] * n2(e["g"])
    return num / den
print(f"ρ(예측) = {loo_rho(E, inn):.4f}  ← 실을 빼고 예측했을 때의 어긋남 (교차검증판)")
print()
def spearman(x, y):
    def rank(v):
        s = sorted(range(len(v)), key=lambda i: v[i]); r = [0]*len(v); i = 0
        while i < len(s):
            j = i
            while j+1 < len(s) and v[s[j+1]] == v[s[i]]: j += 1
            for k in range(i, j+1): r[s[k]] = (i+j)/2
            i = j+1
        return r
    rx, ry = rank(x), rank(y); n_ = len(x); mx, my = sum(rx)/n_, sum(ry)/n_
    num = sum((a-mx)*(b-my) for a, b in zip(rx, ry)); den = (sum((a-mx)**2 for a in rx)*sum((b-my)**2 for b in ry))**0.5
    return num/den if den else 0
print("## 1. 무게별 — 맞춘 잔차 vs 예측 잔차 (잡음이면 예측 잔차도 w 커질수록 줄어야 함)")
for lo, hi in ((1, 1), (2, 2), (3, 4), (5, 7), (8, 99)):
    sel = [i for i in ok if lo <= E[i]["w"] <= hi]
    if sel: print(f"  w {lo}~{hi if hi < 99 else '+'}: 실 {len(sel):>2}, 맞춘 잔차 {st.mean(fit[i] for i in sel):.3f}, 예측 잔차 {st.mean(inn[i] for i in sel):.3f}, 통역 크기 {st.mean(math.sqrt(n2(E[i]['g'])) for i in sel):.3f}")
print(f"  스피어만(w, 맞춘 잔차) = {spearman([E[i]['w'] for i in ok], [fit[i] for i in ok]):+.3f} · 스피어만(w, 예측 잔차) = {spearman([E[i]['w'] for i in ok], [inn[i] for i in ok]):+.3f}")
print()
print("## 2. w≥3 실: 예측 잔차 ÷ (사람차이 r ÷ √w) — 1 근처면 평균의 흔들림, 크면 장부와 진짜 불일치")
ratios = []
for i in ok:
    e = E[i]
    if e["w"] >= 3 and e["r"] > 0: ratios.append(inn[i] / (e["r"] / math.sqrt(e["w"])))
ratios.sort(); print(f"  실 {len(ratios)}개: 중앙값 {ratios[len(ratios)//2]:.2f}, 1 이하 {sum(1 for v in ratios if v <= 1)}개, 2 이상 {sum(1 for v in ratios if v >= 2)}개")
print()
# ── 3. 영모형: 장부 하나 + 걸음 잡음(실측 잔차 풀 재추출) → ρ(예측) 분포 ──
random.seed(20261106); R = 150
pool = [[d_[k] - e["g"][k] for k in range(D)] for e in E if e["w"] >= 2 for d_ in e["ds"]]
print(f"## 3. 영모형 '장부 하나 + 걸음 잡음'(잡음 = 실측 걸음 잔차 풀 {len(pool)}개 재추출), {R}회 → ρ(예측)")
obs = loo_rho(E, inn); null = []
for _ in range(R):
    syn = []
    for p, q, _d in walks:
        base = [h[p][k] - h[q][k] for k in range(D)]; nz = random.choice(pool)
        syn.append((p, q, [base[k] + nz[k] for k in range(D)]))
    Es = build(syn); inns = loo(Es, N); null.append(loo_rho(Es, inns))
null.sort()
print(f"  관측 ρ(예측) {obs:.3f} vs 영모형 평균 {st.mean(null):.3f}, 최대 {null[-1]:.3f}, 관측 이상 비율 {sum(1 for v in null if v >= obs)/R:.3f}")
print("  읽는 법: 관측이 영모형 전부를 넘으면 틈은 '잡음만'으로 설명 안 됨(구조 있음). 안에 들면 잡음으로 충분.")

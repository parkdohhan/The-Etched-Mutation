"""회전 실험 — 떨어진 요소에 두 번째 실이 붙어 고리가 닫히는 사건 세기.

입력: tools/topo-piece/undw_piece-261105.json (읽기만)
정의(정의 v1 §3 어휘):
  점 = 씬 1..13 (작가 순서 = 번호)
  걸음 = 한 회차 안의 이웃 씬 쌍 (a→b)
  실 = 무향 쌍 {a,b}, 무게 w = 밟힌 횟수
  샛길 = w ≤ 2 인 실 / 등뼈 = w ≥ 3
  되돌이 걸음 = b < a (작가 순서를 거꾸로 감)
  떨어진 점(그 시점) = 누적 그물에서 실이 1가닥만 걸린 점 (차수 1)
  고리 닫음 = 새 실의 두 끝이 이미 같은 덩어리에 있을 때 (사이클 수 +1)
"""
import json, sys, random, statistics as st
from collections import defaultdict

path = sys.argv[1]
d = json.load(open(path, encoding="utf-8"))
runs = sorted(d["runSeq"], key=lambda r: r["n"])
edges = {(min(e["a"], e["b"]), max(e["a"], e["b"])): e for e in d["edges"]}
labels = {n["id"]: n["label"] for n in d["nodes"]}
N = len(d["nodes"])

def walks_of(seqs):
    out = []
    for n, seq in seqs:
        for i in range(1, len(seq)):
            a, b = seq[i - 1], seq[i]
            if a != b:
                out.append((n, a, b))
    return out

class UF:
    def __init__(s, n): s.p = list(range(n + 1))
    def f(s, x):
        while s.p[x] != x:
            s.p[x] = s.p[s.p[x]]; x = s.p[x]
        return x
    def u(s, a, b): s.p[s.f(a)] = s.f(b)

def accumulate(seqs):
    """시간순으로 걸음을 쌓으며 사건 분류."""
    uf = UF(N)
    deg = defaultdict(int)            # 단순 그래프 차수
    mult = defaultdict(int)           # 실 무게(누적)
    inc = defaultdict(set)            # 점 → 실 집합
    first_attach = {}; first_loop = {}
    events = []                       # dict per 걸음
    for n, a, b in walks_of(seqs):
        key = (min(a, b), max(a, b))
        back = b < a
        if key in mult:               # 이미 있는 실을 다시 밟음
            mult[key] += 1
            events.append(dict(n=n, a=a, b=b, key=key, kind="repeat", back=back))
            continue
        # 새 실
        da, db = deg[a], deg[b]
        same = (da > 0 and db > 0 and uf.f(a) == uf.f(b))
        thin_a = da > 0 and all(mult[k] <= 2 for k in inc[a])
        thin_b = db > 0 and all(mult[k] <= 2 for k in inc[b])
        kind = "loop" if same else "tree"
        ev = dict(n=n, a=a, b=b, key=key, kind=kind, back=back,
                  deg_a=da, deg_b=db,
                  dangling=(da == 1 or db == 1) if same else None,
                  dangling_pt=(a if da == 1 else (b if db == 1 else None)) if same else None,
                  thin=(thin_a or thin_b) if same else None)
        events.append(ev)
        mult[key] = 1; deg[a] += 1; deg[b] += 1; inc[a].add(key); inc[b].add(key)
        uf.u(a, b)
        for x in (a, b):
            first_attach.setdefault(x, n)
        if same:
            # 고리에 '듦' = 자기 실 중 하나라도 다리(끊으면 갈라지는 실)가 아니게 된 첫 회차.
            # 끝점만 세면 경로 안에 낀 점을 놓치므로 다리 판정으로 센다.
            adj = defaultdict(set)
            for (p_, q_) in mult: adj[p_].add(q_); adj[q_].add(p_)
            def connected_without(x, y):
                seen = {x}; stack = [x]
                while stack:
                    c = stack.pop()
                    for nb in adj[c]:
                        if (c, nb) in ((x, y), (y, x)): continue
                        if nb not in seen: seen.add(nb); stack.append(nb)
                return y in seen
            for (p_, q_) in mult:
                if connected_without(p_, q_):           # 다리가 아님 → 양 끝이 고리 위
                    first_loop.setdefault(p_, n); first_loop.setdefault(q_, n)
    return events, first_attach, first_loop, mult, deg

seqs = [(r["n"], r["seq"]) for r in runs]
W = walks_of(seqs)
ev, fa, fl, mult, deg = accumulate(seqs)

# ── 0. 검산 ──
n_walks = len(W)
n_threads = len(mult)
n_loop = sum(1 for e in ev if e["kind"] == "loop")
n_tree = sum(1 for e in ev if e["kind"] == "tree")
n_back_any = sum(1 for _, a, b in W if b < a)
n_back_adj = sum(1 for _, a, b in W if a - b == 1)
n_fwd_adj = sum(1 for _, a, b in W if b - a == 1)
n_new_nonadj = n_walks - n_back_adj - n_fwd_adj
print("## 0. 검산 (정의 v1 §3 과 맞는지)")
print(f"걸음 {n_walks} (문서 179) · 실 {n_threads} (문서 54) · 고리 닫음 {n_loop} (문서 고리 42) · 첫 붙임(가지) {n_tree} (= 점 13 − 1 = 12)")
print(f"첫 실 방향 {n_fwd_adj} (문서 20) · 첫 실 거꾸로 {n_back_adj} (문서 27) · 그 외 {n_new_nonadj} (문서 132)")
print(f"되돌이 걸음(작가 번호 역행, 비인접 포함) {n_back_any} / {n_walks} = {n_back_any/n_walks:.1%}")
print()

# ── ① 떨어진 점에 두 번째 실이 붙어 고리가 닫힌 사건 ──
loops = [e for e in ev if e["kind"] == "loop"]
dang = [e for e in loops if e["dangling"]]
thin = [e for e in loops if e["thin"]]
print("## ① 고리 닫힘 42건 중, 닫히는 순간 한쪽 끝이 '실 1가닥만 걸린 점'이었던 사건")
print(f"떨어진 점(차수 1)에서 닫힘: {len(dang)} / {len(loops)} = {len(dang)/len(loops):.0%}")
print(f"샛길로만 걸린 점(모든 실 w≤2)에서 닫힘: {len(thin)} / {len(loops)} = {len(thin)/len(loops):.0%}")
print(f"닫힘 걸음 중 되돌이: {sum(e['back'] for e in loops)} / {len(loops)} = {sum(e['back'] for e in loops)/len(loops):.0%}")
print(f"첫 붙임(가지) 걸음 중 되돌이: {sum(e['back'] for e in ev if e['kind']=='tree')} / {n_tree}")
rep = [e for e in ev if e["kind"] == "repeat"]
print(f"이미 있는 실 되밟기 중 되돌이: {sum(e['back'] for e in rep)} / {len(rep)} = {sum(e['back'] for e in rep)/len(rep):.0%}")
print()
print("떨어진 점에서 닫힌 사건 목록 (회차 n: a→b, 떨어진 점, 되돌이?)")
for e in dang:
    print(f"  n={e['n']:>2}: {e['a']}→{e['b']}  떨어진 점={e['dangling_pt']}({labels[e['dangling_pt']]})  되돌이={'예' if e['back'] else '아니오'}  최종 w={mult[e['key']]}")
print()

# ── ② 점마다: 처음 걸린 회차, 처음 고리에 든 회차, 그 사이 사람 수 ──
print("## ② 점마다 '처음 걸림 → 처음 고리 위에 섬(자기 실 중 다리 아닌 것이 생김)' 까지 몇 회차 걸렸나")
print("점  이름          처음걸림  처음고리  사이회차  최종이웃수  샛길이웃수")
for x in range(1, N + 1):
    a_ = fa.get(x); l_ = fl.get(x)
    thin_n = sum(1 for k in mult if x in k and mult[k] <= 2)
    print(f"{x:>2}  {labels[x]:<10}  {str(a_):>6}  {str(l_):>6}  {str((l_-a_) if (a_ and l_) else '-'):>6}  {deg[x]:>6}  {thin_n:>6}")
print()

# ── ③ 되돌이 걸음은 어디에 있나: 샛길 vs 등뼈 ──
print("## ③ 되돌이 걸음의 위치 — 샛길(w≤2) 위인가, 등뼈(w≥3) 위인가")
back_thin = sum(1 for _, a, b in W if b < a and mult[(min(a,b),max(a,b))] <= 2)
back_thick = n_back_any - back_thin
walk_thin = sum(1 for _, a, b in W if mult[(min(a,b),max(a,b))] <= 2)
walk_thick = n_walks - walk_thin
print(f"샛길 위 걸음 {walk_thin}개 중 되돌이 {back_thin} = {back_thin/walk_thin:.0%}")
print(f"등뼈 위 걸음 {walk_thick}개 중 되돌이 {back_thick} = {back_thick/walk_thick:.0%}")
print()

# ── ④ 어긋남(resid) — 떨어진 점에서 닫힌 실 vs 그 외, 샛길 vs 등뼈 ──
print("## ④ 실의 어긋남(resid: 그 실의 통역이 전체 장부 풀이와 안 맞는 정도)")
def mean_resid(keys):
    v = [edges[k]["resid"] for k in keys if k in edges]
    return (st.mean(v), len(v)) if v else (float('nan'), 0)
m1 = mean_resid([e["key"] for e in dang]); m2 = mean_resid([e["key"] for e in loops if not e["dangling"]])
m3 = mean_resid([e["key"] for e in ev if e["kind"] == "tree"])
print(f"떨어진 점에서 고리 닫은 실: 평균 {m1[0]:.3f} (n={m1[1]})")
print(f"붙은 점에서 고리 닫은 실:   평균 {m2[0]:.3f} (n={m2[1]})")
print(f"첫 붙임(가지) 실:           평균 {m3[0]:.3f} (n={m3[1]})")
t1 = mean_resid([k for k in mult if mult[k] <= 2]); t2 = mean_resid([k for k in mult if mult[k] >= 3])
print(f"샛길 실 평균 {t1[0]:.3f} (n={t1[1]}) · 등뼈 실 평균 {t2[0]:.3f} (n={t2[1]})  ← 주의: 샛길은 표본 1~2개라 어긋남이 커 보이는 건 측정 잡음도 섞임")
print()

# ── ⑤ 영모형 — 섞어도 같은 숫자가 나오나 ──
random.seed(20261106)
def stats_for(seqs_):
    ev_, _, _, mult_, _ = accumulate(seqs_)
    loops_ = [e for e in ev_ if e["kind"] == "loop"]
    nd = sum(1 for e in loops_ if e["dangling"])
    nb = sum(1 for e in loops_ if e["back"])
    W_ = walks_of(seqs_)
    bt = sum(1 for _, a, b in W_ if b < a and mult_[(min(a,b),max(a,b))] <= 2)
    wt = sum(1 for _, a, b in W_ if mult_[(min(a,b),max(a,b))] <= 2)
    return nd, len(loops_), nb, (bt / wt if wt else 0)

R = 2000
A = []  # 회차 순서만 섞기 (그물은 같고, 누가 먼저 왔나만 바뀜)
B = []  # 회차 안 씬 순서 섞기 (각자 밟은 씬 집합은 같고, 순서만 바뀜)
for _ in range(R):
    s1 = seqs[:]; random.shuffle(s1); s1 = [(i + 1, s) for i, (_, s) in enumerate(s1)]
    A.append(stats_for(s1))
    s2 = []
    for n, s in seqs:
        t = s[:]; random.shuffle(t); s2.append((n, t))
    B.append(stats_for(s2))
def pct(obs, arr):
    return sum(1 for v in arr if v >= obs) / len(arr)
print(f"## ⑤ 영모형 ({R}회)")
print("관측 vs 섞은 값 평균 [섞은 값이 관측 이상인 비율]")
nd, nl, nb, bt = len(dang), len(loops), sum(e['back'] for e in loops), back_thin / walk_thin
for name, arr in (("회차 순서만 섞기", A), ("회차 안 순서 섞기", B)):
    print(f"[{name}]")
    print(f"  떨어진 점에서 닫힘 수: 관측 {nd} vs {st.mean(x[0] for x in arr):.1f} [{pct(nd, [x[0] for x in arr]):.2f}]  (고리 수 {nl} vs {st.mean(x[1] for x in arr):.1f})")
    print(f"  닫힘 걸음 중 되돌이 수: 관측 {nb} vs {st.mean(x[2] for x in arr):.1f} [{pct(nb, [x[2] for x in arr]):.2f}]")
    print(f"  샛길 위 되돌이 비율: 관측 {bt:.2f} vs {st.mean(x[3] for x in arr):.2f} [{pct(bt, [x[3] for x in arr]):.2f}]")
print()
print("## 단서: 회차 37 중 동일인 중복 가능, 씬 1 프롤로그 기록 없음, 연결은 사람+지형 공동 산물 (정의 v1 §3 단서 그대로)")

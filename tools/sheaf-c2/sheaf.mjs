// tools/sheaf-c2/sheaf.mjs
// C2 층 테스트 계산 엔진 — docs/이본론_층이론_논문화_초안_v0.1-260716.md §11 명세 그대로 구현.
// 명세 밖 수학 결정 없음. 축 정본은 js/shared/math.js 에서 import (재정의 금지).
//
// 용어(§11):
//   회차(run)      = (persona_id, visit) 그룹. 절편 σ_p.
//   dom(p)         = 회차 p 가 방문한 scene_id 집합.
//   겹침 그래프 N  = 회차 노드 + |dom(p)∩dom(q)|≥m 변 (§11.3).
//   g_pq           = 겹침 씬 평균 차이 (오프셋, §11.4).
//   r_pq           = 상수 이동 하나로 번역했을 때의 잔차 (§11.4).
//   h*             = 홀로노미 분해 (§11.5) — 회차별 재보정.
//   ρ              = 순환 성분 비율 = C2 의 숫자 (§11.5).

import { DEFAULT_EMOTION_ANCHORS } from '../../js/shared/math.js';

// A9 = 판단 실기여 교집합 9축 (docs/감정축_통일_제안_v1-260714.md §1.1 A∩B).
export const A9_AXES = ['fear', 'sadness', 'anger', 'joy', 'guilt', 'shame', 'numbness', 'isolation', 'relief'];
export const A17_AXES = [...DEFAULT_EMOTION_ANCHORS];

// ── 벡터 유틸 (차원 D 고정 배열) ──────────────────────────────────
const zeros = (D) => new Array(D).fill(0);
const vsub = (a, b) => a.map((x, i) => x - b[i]);
const vadd = (a, b) => a.map((x, i) => x + b[i]);
const vscale = (a, s) => a.map((x) => x * s);
const vnorm2 = (a) => a.reduce((s, x) => s + x * x, 0); // 제곱 노름
const vnorm = (a) => Math.sqrt(vnorm2(a));

// 희소 분포 {axis: val} → axes 순서의 D차원 벡터 (0-패딩, 축 밖 키는 탈락).
export function embedVector(dist, axes) {
  return axes.map((a) => (dist && dist[a] != null ? dist[a] : 0));
}

// ── 회차 로딩 (§11.1) ────────────────────────────────────────────
// rows → runs: [{id, persona_id, visit, dom: Map(scene_id → vec)}]
export function loadRuns(rows, axes) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.persona_id}|${r.visit}`;
    if (!groups.has(key)) groups.set(key, { id: key, persona_id: r.persona_id, visit: r.visit, dom: new Map() });
    const g = groups.get(key);
    // (회차,씬) 중복은 실측 0건 (run.mjs 검증). 만약 있으면 마지막 값 사용 — 발생 시 로그.
    g.dom.set(r.scene_id, embedVector(r.user_emotion, axes));
  }
  return [...groups.values()];
}

// ── 겹침 그래프 (§11.3) ──────────────────────────────────────────
// edges: [{p, q, scenes:[id], w}]  (p<q 방향 규약)
export function buildNerve(runs, m) {
  const edges = [];
  const domKeys = runs.map((r) => new Set(r.dom.keys()));
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const shared = [];
      for (const s of domKeys[i]) if (domKeys[j].has(s)) shared.push(s);
      if (shared.length >= m) edges.push({ p: i, q: j, scenes: shared, w: shared.length });
    }
  }
  return edges;
}

// ── 불일치 코체인 (§11.4) ────────────────────────────────────────
// 각 변에 g_pq(오프셋), r_pq(잔차) 부여. 방향 p→q.
export function computeCochain(runs, edges, D) {
  for (const e of edges) {
    const diffs = e.scenes.map((s) => vsub(runs[e.p].dom.get(s), runs[e.q].dom.get(s)));
    let g = zeros(D);
    for (const d of diffs) g = vadd(g, d);
    g = vscale(g, 1 / diffs.length);
    let acc = 0;
    for (const d of diffs) acc += vnorm2(vsub(d, g));
    e.g = g;
    e.r = Math.sqrt(acc / diffs.length);
  }
  return edges;
}

// ── 연결 성분 (union-find) ───────────────────────────────────────
function components(n, edges) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const e of edges) parent[find(e.p)] = find(e.q);
  const comp = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!comp.has(r)) comp.set(r, []);
    comp.get(r).push(i);
  }
  return [...comp.values()];
}

// ── 홀로노미 분해 (§11.5) ────────────────────────────────────────
// L h = δᵀ(w·g), 축별 독립. 각 성분마다 기준 노드 접지(h=0) 후 축소 라플라시안을 가우스 소거.
// 반환: h[node] = D차원 벡터.
export function solveHolonomy(n, edges, D) {
  const h = Array.from({ length: n }, () => zeros(D));
  const comps = components(n, edges);
  // 노드 → 성분 로컬 인덱스
  for (const nodes of comps) {
    if (nodes.length === 1) continue; // 고립 노드: h=0
    const local = new Map();
    nodes.forEach((g, i) => local.set(g, i));
    const compEdges = edges.filter((e) => local.has(e.p) && local.has(e.q));
    const size = nodes.length;
    // 전체 가중 라플라시안 L (size×size)
    const L = Array.from({ length: size }, () => zeros(size));
    for (const e of compEdges) {
      const a = local.get(e.p), b = local.get(e.q);
      L[a][a] += e.w; L[b][b] += e.w; L[a][b] -= e.w; L[b][a] -= e.w;
    }
    // RHS b (size×D): b_a += w·g_e (tail=p), b_b -= w·g_e (head=q)
    const B = Array.from({ length: size }, () => zeros(D));
    for (const e of compEdges) {
      const a = local.get(e.p), b = local.get(e.q);
      for (let k = 0; k < D; k++) { B[a][k] += e.w * e.g[k]; B[b][k] -= e.w * e.g[k]; }
    }
    // 기준 노드 = 로컬 0 접지 → 행/열 0 제거, (size-1)×(size-1) SPD 계 풀기
    const ref = 0;
    const idx = [];
    for (let i = 0; i < size; i++) if (i !== ref) idx.push(i);
    const rm = idx.length;
    const A = Array.from({ length: rm }, (_, i) => idx.map((j) => L[idx[i]][j]));
    const bb = Array.from({ length: rm }, (_, i) => idx[i]); // placeholder
    const RHS = idx.map((i) => B[i].slice()); // rm×D
    const X = gaussSolve(A, RHS); // rm×D
    // 로컬 → h
    for (let i = 0; i < rm; i++) h[nodes[idx[i]]] = X[i];
    // ref 노드는 0 유지 (h[nodes[ref]] = zeros)
    void bb;
  }
  return h;
}

// 가우스 소거: A(rm×rm) X = RHS(rm×D). 부분 피벗팅.
function gaussSolve(A, RHS) {
  const n = A.length;
  const D = RHS[0] ? RHS[0].length : 0;
  // 증대 행렬 복사
  const M = A.map((row, i) => [...row, ...RHS[i]]);
  for (let col = 0; col < n; col++) {
    // 피벗
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) continue; // 특이 — 접지로 방지되어야 함
    [M[col], M[piv]] = [M[piv], M[col]];
    const pv = M[col][col];
    for (let j = col; j < n + D; j++) M[col][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = col; j < n + D; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row.slice(n));
}

// ── ρ (§11.5) ────────────────────────────────────────────────────
export function computeRho(edges, h, D) {
  let num = 0, den = 0;
  for (const e of edges) {
    const delta = vsub(h[e.p], h[e.q]); // (δh)_e
    const resid = vsub(e.g, delta);
    num += e.w * vnorm2(resid);
    den += e.w * vnorm2(e.g);
  }
  return den === 0 ? 0 : num / den;
}

// ── 기본 고리 (§11.6) — 스패닝 트리 → fundamental cycles ──────────
// 반환: [{nodes:[...순회 노드], edgeSeq:[{edgeIndex, dir}]}]
export function fundamentalCycles(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  edges.forEach((e, i) => { adj[e.p].push({ to: e.q, ei: i }); adj[e.q].push({ to: e.p, ei: i }); });
  const treeEdge = new Set();
  const parent = new Array(n).fill(-1);
  const parentEdge = new Array(n).fill(-1);
  const depth = new Array(n).fill(-1);
  const visited = new Array(n).fill(false);
  // BFS 스패닝 포레스트
  for (let s = 0; s < n; s++) {
    if (visited[s]) continue;
    visited[s] = true; depth[s] = 0;
    const queue = [s];
    while (queue.length) {
      const u = queue.shift();
      for (const { to, ei } of adj[u]) {
        if (!visited[to]) {
          visited[to] = true; parent[to] = u; parentEdge[to] = ei; depth[to] = depth[u] + 1;
          treeEdge.add(ei); queue.push(to);
        }
      }
    }
  }
  const cycles = [];
  edges.forEach((e, i) => {
    if (treeEdge.has(i)) return;
    // 비트리 변 (p,q): 트리 경로 p..lca..q + 이 변 = 기본 고리
    const path = treePath(e.p, e.q, parent, parentEdge, depth);
    if (!path) return;
    // 고리 노드 순서: q → ...(트리 경로 역)... → p → (비트리 변) → q
    // edgeSeq 를 방향 포함해 구성
    const edgeSeq = [];
    // 트리 경로: path.edges 는 p..q 사이 트리 변 인덱스 목록, path.nodes 는 노드 순서 [p,...,q]
    const nodes = path.nodes; // [p, ..., q]
    for (let k = 0; k + 1 < nodes.length; k++) {
      const a = nodes[k], b = nodes[k + 1];
      const ei = path.edges[k];
      edgeSeq.push({ edgeIndex: ei, dir: edgeDir(edges[ei], a, b) });
    }
    // 닫는 변: q → p (비트리 변 i 는 p→q 로 저장; q→p 이므로 dir=-1)
    edgeSeq.push({ edgeIndex: i, dir: edgeDir(edges[i], nodes[nodes.length - 1], nodes[0]) });
    const cycleNodes = [...nodes]; // p..q, 닫힘은 q→p
    cycles.push({ nodes: cycleNodes, edgeSeq });
  });
  return cycles;
}

// 변 e(p→q 저장)을 a→b 로 순회할 때 방향 부호.
function edgeDir(e, a, b) {
  if (e.p === a && e.q === b) return 1;
  if (e.p === b && e.q === a) return -1;
  throw new Error('edgeDir: 변이 노드쌍과 불일치');
}

// 트리에서 a→b 경로 (노드열 + 변열).
function treePath(a, b, parent, parentEdge, depth) {
  const upA = [], upB = [];
  let x = a, y = b;
  // 깊이 맞추기
  const ea = [], eb = [];
  while (depth[x] > depth[y]) { ea.push(parentEdge[x]); upA.push(x); x = parent[x]; }
  while (depth[y] > depth[x]) { eb.push(parentEdge[y]); upB.push(y); y = parent[y]; }
  while (x !== y) {
    ea.push(parentEdge[x]); upA.push(x); x = parent[x];
    eb.push(parentEdge[y]); upB.push(y); y = parent[y];
  }
  const lca = x;
  // 노드열: a → ... → lca → ... → b
  const nodes = [...upA, lca, ...upB.reverse()];
  const edgesArr = [...ea, ...eb.reverse()];
  return { nodes, edges: edgesArr };
}

// 고리 뒤틀림 W(C)=Σ 방향 g, 잡음 척도=Σ r (§11.6).
export function cycleTwist(cycle, edges, D) {
  let W = zeros(D), noise = 0;
  let allConsistent = true;
  for (const { edgeIndex, dir } of cycle.edgeSeq) {
    const e = edges[edgeIndex];
    W = vadd(W, vscale(e.g, dir));
    noise += e.r;
  }
  return { W, Wnorm: vnorm(W), noise, allConsistent };
}

// Exhibit A (§11.6): 모든 변 정합(≤τ) AND ‖W‖ ≥ 3×잡음.
export function exhibitA(cycles, edges, D, tau) {
  const hits = [];
  for (const c of cycles) {
    const t = cycleTwist(c, edges, D);
    const consistent = c.edgeSeq.every(({ edgeIndex }) => edges[edgeIndex].r <= tau);
    if (consistent && t.Wnorm >= 3 * t.noise && t.noise >= 0) {
      hits.push({ cycle: c, Wnorm: t.Wnorm, noise: t.noise, ratio: t.noise > 0 ? t.Wnorm / t.noise : Infinity });
    }
  }
  return hits;
}

// ── 분위수 & τ ───────────────────────────────────────────────────
export function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// ── 파이프라인 (관측/합성 공용) ──────────────────────────────────
export function runPipeline(runs, D, m) {
  const edges = buildNerve(runs, m);
  computeCochain(runs, edges, D);
  const h = solveHolonomy(runs.length, edges, D);
  const rho = computeRho(edges, h, D);
  return { edges, h, rho };
}

// ── 시드 PRNG (재현성) ──────────────────────────────────────────
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 표준정규 (Box-Muller)
export function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── 영모형 N1: 씬 셔플 (§11.7) ───────────────────────────────────
// 각 회차 안에서 씬 라벨↔벡터 대응을 무작위 치환 (값 집합 보존, 정렬 파괴).
export function shuffleScenes(runs, rng) {
  return runs.map((r) => {
    const scenes = [...r.dom.keys()];
    const vecs = [...r.dom.values()];
    // Fisher-Yates 로 벡터 순서 치환
    const perm = vecs.slice();
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const dom = new Map();
    scenes.forEach((s, i) => dom.set(s, perm[i]));
    return { ...r, dom };
  });
}

// 전역절편 f(씬별 평균)·회차 오프셋 h_p·관측 잔차 풀·축별 std 계산 (N2/N3 공용).
export function computeFH(runs, D) {
  const sceneSum = new Map(), sceneCnt = new Map();
  for (const r of runs) for (const [s, v] of r.dom) {
    if (!sceneSum.has(s)) { sceneSum.set(s, zeros(D)); sceneCnt.set(s, 0); }
    sceneSum.set(s, vadd(sceneSum.get(s), v));
    sceneCnt.set(s, sceneCnt.get(s) + 1);
  }
  const f = new Map();
  for (const [s, sum] of sceneSum) f.set(s, vscale(sum, 1 / sceneCnt.get(s)));
  const hp = runs.map((r) => {
    let acc = zeros(D), cnt = 0;
    for (const [s, v] of r.dom) { acc = vadd(acc, vsub(v, f.get(s))); cnt++; }
    return vscale(acc, 1 / cnt);
  });
  // 관측 잔차 res_p(s)=σ−f−h_p (벡터 풀 + 축별 std)
  const pool = [];
  const resAcc = zeros(D), sq = zeros(D);
  for (let i = 0; i < runs.length; i++) for (const [s, v] of runs[i].dom) {
    const res = vsub(vsub(v, f.get(s)), hp[i]);
    pool.push(res);
    for (let k = 0; k < D; k++) { resAcc[k] += res[k]; sq[k] += res[k] * res[k]; }
  }
  const std = zeros(D);
  for (let k = 0; k < D; k++) {
    const mean = resAcc[k] / pool.length;
    std[k] = Math.sqrt(Math.max(0, sq[k] / pool.length - mean * mean));
  }
  return { f, hp, pool, std };
}

// ── 영모형 N2: 전역절편+보정 합성 (§11.7) — 주 대조군 ───────────
// σ̃_p(s) = f(s) + h_p + ε.  ε=iid, 축별(v1.1 명세 승격) 관측 잔차 분산.  뒤틀림 0 인 세계.
export function synthGlobalSection(runs, D, rng, fh = null) {
  const { f, hp, std } = fh || computeFH(runs, D);
  return runs.map((r, i) => {
    const dom = new Map();
    for (const [s] of r.dom) {
      const base = vadd(f.get(s), hp[i]);
      const eps = std.map((sd) => sd * gaussian(rng));
      dom.set(s, vadd(base, eps));
    }
    return { ...r, dom };
  });
}

// ── 영모형 N3: 잔차 부트스트랩 (§11.7 v1.1, 선택) ────────────────
// σ̃_p(s) = f(s) + h_p + (관측 잔차 벡터 풀에서 통째 복원추출).
// 합=1 제약이 만드는 축 간 상관을 보존(N2 의 iid 가정과 대비).
export function bootstrapResiduals(runs, D, rng, fh = null) {
  const { f, hp, pool } = fh || computeFH(runs, D);
  const N = pool.length;
  return runs.map((r, i) => {
    const dom = new Map();
    for (const [s] of r.dom) {
      const base = vadd(f.get(s), hp[i]);
      const res = pool[Math.floor(rng() * N)]; // 잔차 벡터 통째 재표집
      dom.set(s, vadd(base, res));
    }
    return { ...r, dom };
  });
}

// 고리별 ‖W‖ 계산 (Exhibit A 임계 유도용). 반환: length → [‖W‖...] 누적에 push.
export function collectCycleW(cycles, edges, D, pool) {
  for (const c of cycles) {
    const { Wnorm } = cycleTwist(c, edges, D);
    const len = c.edgeSeq.length;
    if (!pool.has(len)) pool.set(len, []);
    pool.get(len).push(Wnorm);
  }
}

// Exhibit A (§11.6 v1.1): 모든 변 정합(≤τ) AND ‖W‖ > T(|C|).  Tmap: length → 임계.
export function exhibitAThreshold(cycles, edges, D, tau, Tmap) {
  const hits = [];
  for (const c of cycles) {
    const consistent = c.edgeSeq.every(({ edgeIndex }) => edges[edgeIndex].r <= tau);
    if (!consistent) continue;
    const len = c.edgeSeq.length;
    const T = Tmap.get(len);
    if (T == null) continue; // 해당 길이 대조군 표본 없음 (이론상 불가 — 위상 고정)
    const { Wnorm, noise } = cycleTwist(c, edges, D);
    if (Wnorm > T) hits.push({ cycle: c, Wnorm, noise, T, len });
  }
  return hits;
}

// ── 영모형 p-값 (§11.7) ─────────────────────────────────────────
// nullFn(runs, rng) → 합성 runs. resamples 회 재표집, p = #{null_ρ ≥ obs_ρ}/N.
export function nullTest(runs, D, m, obsRho, nullFn, resamples, rng) {
  let ge = 0;
  const nullRhos = [];
  for (let t = 0; t < resamples; t++) {
    const synth = nullFn(runs, rng);
    const { rho } = runPipeline(synth, D, m);
    nullRhos.push(rho);
    if (rho >= obsRho) ge++;
  }
  nullRhos.sort((a, b) => a - b);
  return {
    p: ge / resamples,
    nullMean: nullRhos.reduce((a, b) => a + b, 0) / resamples,
    nullMax: nullRhos[nullRhos.length - 1],
    nullP95: quantile(nullRhos, 0.95),
  };
}

// tools/layer-proofs/verify_numeric.mjs
// Numeric sanity checks for docs/층모델_정리와_증명_v0.1-261123.md.
// These are NOT proofs. They check that each theorem's statement matches what the
// real engine (tools/sheaf-c2/sheaf.mjs) computes, on random instances and on the
// UNDW-001 thread sequences (tools/topo-piece/undw_piece-261105.json).
// Run: node tools/layer-proofs/verify_numeric.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { solveHolonomy, computeRho, fundamentalCycles, cycleTwist, loadRuns, runPipeline, mulberry32, gaussian } from '../sheaf-c2/sheaf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rng = mulberry32(20261123);
const EPS = 1e-9;
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const zeros = (D) => new Array(D).fill(0);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const scale = (a, s) => a.map((x) => x * s);
const n2 = (a) => a.reduce((s, x) => s + x * x, 0);
const randVec = (D) => Array.from({ length: D }, () => gaussian(rng));
const randInt = (n) => Math.floor(rng() * n);

function rhoOf(n, edges, D) { const h = solveHolonomy(n, edges, D); return { h, rho: computeRho(edges, h, D) }; }
function energy(edges, h) { let s = 0; for (const e of edges) s += e.w * n2(sub(e.g, sub(h[e.p], h[e.q]))); return s; }
function denom(edges) { let s = 0; for (const e of edges) s += e.w * n2(e.g); return s; }

// random connected simple graph on n nodes with extra edges
function randomGraph(n, extra, D) {
  const edges = []; const seen = new Set();
  for (let v = 1; v < n; v++) { const u = randInt(v); edges.push({ p: u, q: v }); seen.add(`${u}|${v}`); }
  let tries = 0;
  while (extra > 0 && tries++ < 1000) {
    const a = randInt(n), b = randInt(n); if (a === b) continue;
    const p = Math.min(a, b), q = Math.max(a, b); if (seen.has(`${p}|${q}`)) continue;
    seen.add(`${p}|${q}`); edges.push({ p, q }); extra--;
  }
  for (const e of edges) { e.w = 1 + randInt(9); e.g = randVec(D); e.r = 0; }
  return edges;
}
// small dense linear solver
function solve(A, b) {
  const n = A.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; const pv = M[c][c];
    for (let j = c; j <= n; j++) M[c][j] /= pv;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r[n]);
}

// ── Thm 1: 0 ≤ ρ ≤ 1, and the minimum does not depend on which node is grounded ──
{
  let good = true, maxShift = 0;
  for (let t = 0; t < 200; t++) {
    const n = 4 + randInt(8), D = 1 + randInt(5);
    const edges = randomGraph(n, randInt(12), D);
    const { h, rho } = rhoOf(n, edges, D);
    if (!(rho >= -EPS && rho <= 1 + EPS)) good = false;
    // perturbing h never lowers the energy; shifting h by a constant keeps it
    const E0 = energy(edges, h);
    const c = randVec(D); const hs = h.map((x) => add(x, c));
    maxShift = Math.max(maxShift, Math.abs(energy(edges, hs) - E0));
    const hp = h.map((x) => add(x, scale(randVec(D), 0.1)));
    if (energy(edges, hp) < E0 - 1e-9) good = false;
  }
  ok('T1 범위 0≤ρ≤1 · 최솟값은 접지 선택과 무관', good && maxShift < 1e-8, `200 그물, 상수 이동 시 에너지 변화 최대 ${maxShift.toExponential(1)}`);
}

// ── Thm 2: ρ=0 ⟺ 장부 하나 ⟺ 모든 기본 고리 뒤틀림 0 ; 나무면 항상 0 ; 순수 순환이면 1 ──
{
  let treeMax = 0, gradMax = 0, gradW = 0;
  for (let t = 0; t < 200; t++) {
    const n = 3 + randInt(10), D = 1 + randInt(5);
    const tree = randomGraph(n, 0, D);                       // forest (a tree), arbitrary data
    treeMax = Math.max(treeMax, rhoOf(n, tree, D).rho);
    const edges = randomGraph(n, 3 + randInt(8), D);         // has cycles, but g := δh (one ledger)
    const hh = Array.from({ length: n }, () => randVec(D));
    for (const e of edges) e.g = sub(hh[e.p], hh[e.q]);
    gradMax = Math.max(gradMax, rhoOf(n, edges, D).rho);
    for (const c of fundamentalCycles(n, edges)) gradW = Math.max(gradW, cycleTwist(c, edges, D).Wnorm);
  }
  ok('T2 나무(고리 없음)면 어떤 숫자를 넣어도 ρ=0', treeMax < 1e-12, `200 나무, 최대 ρ ${treeMax.toExponential(1)}`);
  ok('T2 장부 하나에서 나온 통역이면 ρ=0 이고 모든 고리 뒤틀림 0', gradMax < 1e-12 && gradW < 1e-9, `최대 ρ ${gradMax.toExponential(1)}, 최대 ‖W‖ ${gradW.toExponential(1)}`);
  // triangle, equal weights, same vector going round: pure circulation → ρ = 1
  const u = [1, -1, 0];
  const tri = [{ p: 0, q: 1, w: 1, g: u, r: 0 }, { p: 1, q: 2, w: 1, g: u, r: 0 }, { p: 2, q: 0, w: 1, g: u, r: 0 }];
  ok('T2 고리 하나에 같은 통역이 한 방향으로 돌면 ρ=1', Math.abs(rhoOf(3, tri, 3).rho - 1) < 1e-12);
}

// ── Thm 3: 남는 에너지 = Wᵀ (C D⁻¹ Cᵀ)⁻¹ W  (고리 뒤틀림만의 함수) ──
{
  let maxErr = 0;
  for (let t = 0; t < 200; t++) {
    const n = 4 + randInt(8), D = 1 + randInt(4);
    const edges = randomGraph(n, 1 + randInt(10), D);
    const { h } = rhoOf(n, edges, D);
    const Emin = energy(edges, h);
    const cyc = fundamentalCycles(n, edges); const B = cyc.length;
    const C = cyc.map((c) => { const row = zeros(edges.length); for (const { edgeIndex, dir } of c.edgeSeq) row[edgeIndex] += dir; return row; });
    const G = Array.from({ length: B }, (_, i) => Array.from({ length: B }, (_, j) => edges.reduce((s, e, k) => s + C[i][k] * C[j][k] / e.w, 0)));
    let E2 = 0;
    for (let k = 0; k < D; k++) {
      const W = C.map((row) => row.reduce((s, c, ei) => s + c * edges[ei].g[k], 0));
      const lam = solve(G, W); E2 += W.reduce((s, x, i) => s + x * lam[i], 0);
    }
    maxErr = Math.max(maxErr, Math.abs(E2 - Emin) / (1 + Emin));
  }
  ok('T3 남는 에너지는 기본 고리 뒤틀림 W 만으로 계산된다', maxErr < 1e-8, `200 그물, 상대 오차 최대 ${maxErr.toExponential(1)}`);
}

// ── scene net built from runs, same convention as tools/topo-piece/analyze_undw.mjs ──
function sceneNet(runs, D) { // runs: [{seq:[scene idx], v:[vec]}]
  const und = new Map(); const steps = [];
  for (const r of runs) for (let i = 1; i < r.seq.length; i++) {
    const a = r.seq[i - 1], b = r.seq[i]; const p = Math.min(a, b), q = Math.max(a, b);
    const d = a === p ? sub(r.v[i - 1], r.v[i]) : sub(r.v[i], r.v[i - 1]);
    const k = `${p}|${q}`; if (!und.has(k)) und.set(k, { p, q, diffs: [] }); und.get(k).diffs.push(d);
    steps.push({ p, q, w: 1, g: d, r: 0 });
  }
  const edges = [...und.values()].map((e) => {
    const w = e.diffs.length; let g = zeros(D); for (const d of e.diffs) g = add(g, scale(d, 1 / w));
    let acc = 0; for (const d of e.diffs) acc += n2(sub(d, g));
    return { p: e.p, q: e.q, w, g, r: Math.sqrt(acc / w), within: acc };
  });
  return { edges, steps };
}
function randomRuns(nScenes, nRuns, D, ledger = null) {
  const runs = [];
  for (let k = 0; k < nRuns; k++) {
    const perm = Array.from({ length: nScenes }, (_, i) => i).sort(() => rng() - 0.5);
    const seq = perm.slice(0, 2 + randInt(nScenes - 1));
    const c = randVec(D);
    const v = seq.map((s) => (ledger ? add(ledger[s], c) : randVec(D)));
    runs.push({ seq, v });
  }
  return runs;
}

// ── Thm 4: 불변성 ──
{
  let relabel = 0, flip = 0, rot = 0, sc = 0, shift = 0, rescaleDiff = 0;
  for (let t = 0; t < 100; t++) {
    const N = 5 + randInt(6), D = 2 + randInt(4);
    const runs = randomRuns(N, 6 + randInt(10), D);
    const base = sceneNet(runs, D); const r0 = rhoOf(N, base.edges, D).rho;
    // (i) relabel scenes
    const perm = Array.from({ length: N }, (_, i) => i).sort(() => rng() - 0.5);
    const r1 = rhoOf(N, sceneNet(runs.map((r) => ({ seq: r.seq.map((s) => perm[s]), v: r.v })), D).edges, D).rho;
    relabel = Math.max(relabel, Math.abs(r1 - r0));
    // (ii) flip orientation convention of random edges
    const fl = base.edges.map((e) => (rng() < 0.5 ? { ...e, p: e.q, q: e.p, g: scale(e.g, -1) } : e));
    flip = Math.max(flip, Math.abs(rhoOf(N, fl, D).rho - r0));
    // (iv) rotate emotion axes (random orthogonal Q via Gram–Schmidt) and scale uniformly
    const Q = []; for (let i = 0; i < D; i++) { let v = randVec(D); for (const q of Q) v = sub(v, scale(q, v.reduce((s, x, j) => s + x * q[j], 0))); Q.push(scale(v, 1 / Math.sqrt(n2(v)))); }
    const R = (v) => Q.map((q) => q.reduce((s, x, j) => s + x * v[j], 0));
    rot = Math.max(rot, Math.abs(rhoOf(N, sceneNet(runs.map((r) => ({ seq: r.seq, v: r.v.map(R) })), D).edges, D).rho - r0));
    sc = Math.max(sc, Math.abs(rhoOf(N, sceneNet(runs.map((r) => ({ seq: r.seq, v: r.v.map((x) => scale(x, 3.7)) })), D).edges, D).rho - r0));
    // (v) shift each run's whole ledger by its own constant
    shift = Math.max(shift, Math.abs(rhoOf(N, sceneNet(runs.map((r) => { const c = randVec(D); return { seq: r.seq, v: r.v.map((x) => add(x, c)) }; }), D).edges, D).rho - r0));
    // NOT invariant: stretch one axis ×5
    const st = (v) => v.map((x, i) => (i === 0 ? 5 * x : x));
    rescaleDiff = Math.max(rescaleDiff, Math.abs(rhoOf(N, sceneNet(runs.map((r) => ({ seq: r.seq, v: r.v.map(st) })), D).edges, D).rho - r0));
  }
  ok('T4 씬 번호를 바꿔도 ρ 같음', relabel < 1e-10, `최대 차 ${relabel.toExponential(1)}`);
  ok('T4 실의 방향 규약을 뒤집어도 ρ 같음', flip < 1e-10, `최대 차 ${flip.toExponential(1)}`);
  ok('T4 감정 축을 통째로 돌리거나 같은 배율로 늘려도 ρ 같음', rot < 1e-10 && sc < 1e-10, `회전 ${rot.toExponential(1)}, 배율 ${sc.toExponential(1)}`);
  ok('T4 회차마다 장부 전체를 상수만큼 옮겨도 ρ 같음', shift < 1e-10, `최대 차 ${shift.toExponential(1)}`);
  ok('T4 (불변 아님) 축 하나만 5배 늘리면 ρ 가 달라진다', rescaleDiff > 1e-3, `최대 차 ${rescaleDiff.toFixed(3)}`);
}

// ── Thm 5: 무게 = 걸음 수 는 강제된다 ; 다중 그물 항등식 ; ρ_multi=0 ⟺ 장부 하나+회차 상수 ──
{
  let hErr = 0, idErr = 0, ineq = true, zeroMax = 0;
  for (let t = 0; t < 100; t++) {
    const N = 5 + randInt(5), D = 1 + randInt(4);
    const runs = randomRuns(N, 8 + randInt(10), D);
    const { edges, steps } = sceneNet(runs, D);
    const a = rhoOf(N, edges, D), b = rhoOf(N, steps, D);     // weighted simple net vs one-strand-per-step multi net
    const Ea = energy(edges, a.h), Eb = energy(steps, b.h), within = edges.reduce((s, e) => s + e.within, 0);
    hErr = Math.max(hErr, Math.abs(energy(edges, b.h) - Ea));  // multi-net minimiser also minimises the weighted problem
    idErr = Math.max(idErr, Math.abs(Eb - (within + Ea)) / (1 + Eb));
    if (b.rho < a.rho - 1e-10) ineq = false;
    const ledger = Array.from({ length: N }, () => randVec(D));
    const z = sceneNet(randomRuns(N, 8, D, ledger), D);
    zeroMax = Math.max(zeroMax, rhoOf(N, z.steps, D).rho, rhoOf(N, z.edges, D).rho);
  }
  ok('T5 걸음마다 한 가닥(다중 그물)으로 풀어도 같은 장부가 나온다', hErr < 1e-8, `에너지 차 최대 ${hErr.toExponential(1)}`);
  ok('T5 다중 그물 에너지 = 실 안 흩어짐 + 실 사이 어긋남', idErr < 1e-10 && ineq, `상대 오차 최대 ${idErr.toExponential(1)}, ρ_multi ≥ ρ 성립`);
  ok('T5/T6 모든 회차가 장부 하나를 상수만큼만 옮겨 읽으면 ρ=ρ_multi=0', zeroMax < 1e-12, `최대 ${zeroMax.toExponential(1)}`);
}

// ── Thm 8: 쌍별 표가 똑같은 두 세계, ρ 는 0 과 1 (실제 C2 파이프라인, m=2) ──
function world(offsets) { // three runs p,q,r ; overlaps {a,b},{c,d},{e,f} pairwise disjoint
  const base = [1 / 3, 1 / 3, 1 / 3]; const eps = 0.1; const rows = [];
  const put = (run, scene, v) => rows.push({ persona_id: run, visit: 1, scene_id: scene, user_emotion: { x: v[0], y: v[1], z: v[2] } });
  // σ_q − σ_p = A on {a,b} ; σ_r − σ_q = B on {c,d} ; σ_p − σ_r = Cc on {e,f}
  const [A, B, Cc] = offsets.map((o) => scale(o, eps));
  for (const s of ['a', 'b']) { put('p', s, base); put('q', s, add(base, A)); }
  for (const s of ['c', 'd']) { put('q', s, base); put('r', s, add(base, B)); }
  for (const s of ['e', 'f']) { put('r', s, base); put('p', s, add(base, Cc)); }
  return rows;
}
{
  const axes = ['x', 'y', 'z'];
  // X: one ledger exists (offsets are differences of h = e1,e2,e3). Y: the same vector goes round the loop.
  const X = world([[-1, 1, 0], [0, -1, 1], [1, 0, -1]]);
  const Y = world([[-1, 1, 0], [-1, 1, 0], [-1, 1, 0]]);
  const valid = [...X, ...Y].every((r) => { const v = Object.values(r.user_emotion); return v.every((x) => x >= 0) && Math.abs(v.reduce((s, x) => s + x, 0) - 1) < 1e-12; });
  const px = runPipeline(loadRuns(X, axes), 3, 2), py = runPipeline(loadRuns(Y, axes), 3, 2);
  const table = (p) => p.edges.map((e) => `${Math.sqrt(n2(e.g)).toFixed(6)}/${e.r.toFixed(6)}`).join(' ');
  ok('T8 두 세계 모두 감정 분포로 유효(음수 없음, 합 1)', valid);
  ok('T8 쌍별 표(쌍마다 거리와 잔차)가 두 세계에서 완전히 같다', table(px) === table(py) && px.edges.every((e) => e.r < 1e-12), `거리/잔차: ${table(px)}`);
  ok('T8 그런데 ρ 는 한쪽 0, 다른 쪽 1', px.rho < 1e-12 && Math.abs(py.rho - 1) < 1e-12, `ρ(X)=${px.rho.toFixed(3)}, ρ(Y)=${py.rho.toFixed(3)}`);
}

// ── Thm 7 remark: m=2 로만 보면 "쌍 전부 정합 + ρ=0" 인데도 장부 하나가 없을 수 있다 ──
{
  const axes = ['x', 'y', 'z']; const rows = [];
  const put = (run, scene, v) => rows.push({ persona_id: run, visit: 1, scene_id: scene, user_emotion: { x: v[0], y: v[1], z: v[2] } });
  const b = [1 / 3, 1 / 3, 1 / 3];
  for (const s of ['a', 'b']) { put('p', s, b); put('q', s, b); }
  for (const s of ['c', 'd']) { put('q', s, b); put('r', s, b); }
  put('p', 'e', b); put('r', 'e', [0.5, 0.3, 0.2]);            // p and r meet only at e, and disagree there
  const m2 = runPipeline(loadRuns(rows, axes), 3, 2), m1 = runPipeline(loadRuns(rows, axes), 3, 1);
  ok('T7 주의: 겹침 2 이상만 보면 놓치는 어긋남이 있다 (m=2: ρ=0 · m=1: ρ>0)', m2.rho < 1e-12 && m2.edges.every((e) => e.r < 1e-12) && m1.rho > 0.1, `m=2 ρ=${m2.rho.toFixed(3)}, m=1 ρ=${m1.rho.toFixed(3)}`);
}

// ── 순서 층: UNDW-001 실제 실 37가닥 ──
const piece = JSON.parse(fs.readFileSync(path.join(here, '../topo-piece/undw_piece-261105.json'), 'utf8'));
const seqs = piece.runSeq.map((r) => r.seq);
const posOf = (s) => new Map(s.map((x, i) => [x, i]));
function pairs(p, q) { const P = posOf(p), Q = posOf(q); const common = p.filter((x) => Q.has(x)); let tot = 0, disc = 0; for (let i = 0; i < common.length; i++) for (let j = i + 1; j < common.length; j++) { tot++; if ((P.get(common[i]) - P.get(common[j])) * (Q.get(common[i]) - Q.get(common[j])) < 0) disc++; } return { tot, disc }; }
const compat = (p, q) => pairs(p, q).disc === 0;
function hasDirectedCycle(list) { // union of consecutive steps
  const adj = new Map(); for (const s of list) for (let i = 1; i < s.length; i++) { if (!adj.has(s[i - 1])) adj.set(s[i - 1], new Set()); adj.get(s[i - 1]).add(s[i]); }
  const state = new Map(); const dfs = (v) => { state.set(v, 1); for (const w of adj.get(v) || []) { if (state.get(w) === 1) return true; if (!state.get(w) && dfs(w)) return true; } state.set(v, 2); return false; };
  for (const v of adj.keys()) if (!state.get(v) && dfs(v)) return true; return false;
}
{
  // toy examples used in the document
  const A = [1, 2, 3], Bm = [1, 4], Cm = [3, 2, 1];
  ok('T9 양립은 건너뛰기가 안 된다 (장난감 반례 A~B, B~C, A≁C)', compat(A, Bm) && compat(Bm, Cm) && !compat(A, Cm));
  const P = [1, 2, 3, 4], Q = [3, 4, 5, 6], R = [5, 6, 1, 2];
  ok('T10 둘씩은 전부 양립인데 셋을 한 줄로 못 세운다 (장난감 예)', compat(P, Q) && compat(Q, R) && compat(R, P) && hasDirectedCycle([P, Q, R]));
  // Kendall: triangle inequality fails across different domains
  const K = (p, q) => { const { tot, disc } = pairs(p, q); return tot ? disc / tot : NaN; };
  const k1 = K([1, 2, 3, 4], [3, 4]), k2 = K([3, 4], [2, 1, 3, 4]), k3 = K([1, 2, 3, 4], [2, 1, 3, 4]);
  ok('T11 켄달: 지난 씬이 다르면 삼각부등식이 깨진다 (장난감 예)', k3 > k1 + k2 + 1e-12, `K(A,C)=${k3.toFixed(3)} > K(A,B)+K(B,C)=${(k1 + k2).toFixed(3)}`);
  // on a common domain the triangle inequality holds (random check)
  let tri = true;
  for (let t = 0; t < 2000; t++) { const sh = () => [1, 2, 3, 4, 5, 6].sort(() => rng() - 0.5); const a = sh(), b = sh(), c = sh(); if (K(a, c) > K(a, b) + K(b, c) + 1e-12) tri = false; }
  ok('T11 켄달: 지난 씬이 같으면 삼각부등식 성립 (무작위 2000 삼중)', tri);

  // real data
  const n = seqs.length; let incompat = 0, nontrans = 0, condorcet = 0, undefinedK = 0, firstEx = null, condEx = null;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (!compat(seqs[i], seqs[j])) incompat++; if (pairs(seqs[i], seqs[j]).tot === 0) undefinedK++; }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = i + 1; k < n; k++) {
    if (j === i || j === k) continue;
    if (compat(seqs[i], seqs[j]) && compat(seqs[j], seqs[k]) && !compat(seqs[i], seqs[k])) { nontrans++; if (!firstEx && seqs[j].length >= 3) firstEx = [i, j, k]; }
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    if (compat(seqs[i], seqs[j]) && compat(seqs[j], seqs[k]) && compat(seqs[i], seqs[k]) && hasDirectedCycle([seqs[i], seqs[j], seqs[k]])) { condorcet++; if (!condEx) condEx = [i, j, k]; }
  }
  console.log(`\n[실데이터 · 순서 층] 회차 ${n}, 회차 쌍 ${n * (n - 1) / 2}`);
  console.log(`  서로 순서가 부딪히는 쌍(양립 아님): ${incompat}`);
  console.log(`  공통 씬이 2개 미만이라 켄달을 잴 수 없는 쌍: ${undefinedK}`);
  console.log(`  건너뛰기 실패 삼중(A~B, B~C, A≁C): ${nontrans}` + (firstEx ? `  예: 회차 ${firstEx.map((x) => x + 1).join(', ')} = ${firstEx.map((x) => '[' + seqs[x].join('→') + ']').join(' / ')}` : ''));
  console.log(`  둘씩은 전부 양립인데 셋이 한 줄로 안 서는 삼중: ${condorcet}` + (condEx ? `  예: 회차 ${condEx.map((x) => x + 1).join(', ')} = ${condEx.map((x) => '[' + seqs[x].join('→') + ']').join(' / ')}` : ''));
  console.log(`  37가닥 전체를 한 줄로 세울 수 있나: ${hasDirectedCycle(seqs) ? '아니오 (방향 고리 있음)' : '예'}`);
  ok('T9 실데이터에서도 건너뛰기 실패 삼중이 실재한다', nontrans > 0, `${nontrans}건`);
  // Kendall vs first thread 1..13 on runs with ≥3 scenes — reproduces the documented 0.302
  const first = Array.from({ length: 13 }, (_, i) => i + 1);
  const ks = seqs.filter((s) => s.length >= 3).map((s) => K(s, first));
  const mean = ks.reduce((a, b) => a + b, 0) / ks.length;
  ok('켄달(첫 실 대비) 문서 수치 재현 0.302 · 25회차', ks.length === 25 && Math.abs(mean - 0.302) < 0.001, `평균 ${mean.toFixed(3)}, ${ks.length}회차, 최소 ${Math.min(...ks).toFixed(3)}, 최대 ${Math.max(...ks).toFixed(3)}`);
}

// ── 고리 수 세기 (정리 5 따름) + ρ_multi 예시 계산 ──
{
  const E = piece.edges.length, V = piece.nodes.length, steps = piece.edges.reduce((s, e) => s + e.w, 0);
  ok('고리 수: 다중 그물 167 = 씬 그물 42 + 겹친 가닥 125', steps - V + 1 === 167 && E - V + 1 === 42 && steps - E === 125, `걸음 ${steps}, 실 ${E}, 씬 ${V}`);
  const within = piece.edges.reduce((s, e) => s + e.w * e.r * e.r, 0), den = piece.edges.reduce((s, e) => s + e.w * e.gnorm * e.gnorm, 0);
  const rhoMulti = (within + piece.rho * den) / (within + den);
  console.log(`\n[예시 계산 · 판정 아님] UNDW-001 저장 수치(소수 3자리 반올림)로 정리 5 를 적용:`);
  console.log(`  실 안 흩어짐 Σw·r² = ${within.toFixed(2)}, 실 사이 Σw·‖g‖² = ${den.toFixed(2)}, 씬 그물 ρ = ${piece.rho}`);
  console.log(`  → 걸음마다 한 가닥으로 재면 ρ_multi ≈ ${rhoMulti.toFixed(3)}`);
}

console.log(`\n합계: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

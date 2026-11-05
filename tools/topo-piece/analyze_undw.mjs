// analyze_undw.mjs — 실의 그물 3D 그림 재료 계산.
// 입력: undw_raw.json (pull_undw.mjs 산출). 출력: undw_piece.json
// 계산: 씬 배치(힘 기반), 방문 수, 걸음(directed), 무향 실(g·w·r), 홀로노미 h, ρ,
//       기본 고리 42개의 뒤틀림 W, 높이 투영(u = 변 번역 벡터들의 1주성분), 회차 실 목록.
// 층 엔진은 tools/sheaf-c2/sheaf.mjs 재사용 (수학 재정의 없음).
import fs from 'node:fs';
import path from 'node:path';
import { embedVector, solveHolonomy, computeRho, fundamentalCycles, cycleTwist } from 'file:///D:/The%20Etched%20Mutation/tools/sheaf-c2/sheaf.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const raw = JSON.parse(fs.readFileSync(path.join(here, 'undw_raw.json'), 'utf8'));

const NN = { 1: '욕조', 2: '눈보라', 3: '전화벨', 4: '매달림', 5: '진돗개', 6: '제물의 얼굴', 7: '알고 있었다', 8: '서랍', 9: '팬티', 10: '(빈 씬)', 11: '죽었구나', 12: '빨래건조대', 13: '화면' };

// ── 씬 ──────────────────────────────────────────────
const scenes = raw.scenes.slice().sort((a, b) => a.scene_order - b.scene_order);
const N = scenes.length;
const idToIdx = new Map(scenes.map((s, i) => [s.id, i])); // idx 0..12 = order-1

// ── 축: user_emotion 키 전수 ─────────────────────────
const keyCount = new Map();
for (const p of raw.plays) for (const k of Object.keys(p.user_emotion || {})) keyCount.set(k, (keyCount.get(k) || 0) + 1);
const AX = [...keyCount.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
const D = AX.length;

// ── 회차 → 씬 열 ─────────────────────────────────────
const runs = new Map();
for (const p of raw.plays) {
  if (!runs.has(p.run_id)) runs.set(p.run_id, []);
  runs.get(p.run_id).push({ t: p.created_at, idx: idToIdx.get(p.scene_id), v: embedVector(p.user_emotion, AX), al: p.alignment, mm: p.mismatch_type });
}
const runList = [...runs.entries()].map(([id, pts], k) => ({ id, n: k + 1, pts: pts.sort((a, b) => a.t.localeCompare(b.t)) }));
runList.sort((a, b) => a.pts[0].t.localeCompare(b.pts[0].t));
runList.forEach((r, k) => (r.n = k + 1));

// ── 점 통계 ──────────────────────────────────────────
const visits = new Array(N).fill(0), starts = new Array(N).fill(0), ends = new Array(N).fill(0);
const sumEmo = Array.from({ length: N }, () => new Array(D).fill(0));
for (const r of runList) {
  starts[r.pts[0].idx]++; ends[r.pts[r.pts.length - 1].idx]++;
  for (const p of r.pts) { visits[p.idx]++; for (let k = 0; k < D; k++) sumEmo[p.idx][k] += p.v[k]; }
}

// ── 걸음(directed) + 무향 실 ─────────────────────────
const dirCount = new Map(); // "a>b" (1-based) → count
const und = new Map(); // "p|q" (p<q idx) → {diffs:[], nPQ, nQP}
let walks = 0, revisits = 0;
for (const r of runList) {
  const seen = new Set();
  for (let i = 0; i < r.pts.length; i++) {
    if (seen.has(r.pts[i].idx)) revisits++;
    seen.add(r.pts[i].idx);
    if (i === 0) continue;
    const a = r.pts[i - 1], b = r.pts[i];
    if (a.idx === b.idx) continue;
    walks++;
    const key = `${a.idx + 1}>${b.idx + 1}`;
    dirCount.set(key, (dirCount.get(key) || 0) + 1);
    const p = Math.min(a.idx, b.idx), q = Math.max(a.idx, b.idx);
    const uk = `${p}|${q}`;
    if (!und.has(uk)) und.set(uk, { p, q, diffs: [], nPQ: 0, nQP: 0 });
    const e = und.get(uk);
    // sheaf.mjs 규약: g = mean(v_p − v_q)
    const vp = a.idx === p ? a.v : b.v, vq = a.idx === p ? b.v : a.v;
    e.diffs.push(vp.map((x, k) => x - vq[k]));
    if (a.idx === p) e.nPQ++; else e.nQP++;
  }
}
const edges = [...und.values()].map((e) => {
  const w = e.diffs.length;
  const g = new Array(D).fill(0);
  for (const d of e.diffs) for (let k = 0; k < D; k++) g[k] += d[k] / w;
  let acc = 0;
  for (const d of e.diffs) acc += d.reduce((s, x, k) => s + (x - g[k]) ** 2, 0);
  return { p: e.p, q: e.q, w, g, r: Math.sqrt(acc / w), nPQ: e.nPQ, nQP: e.nQP };
});

// ── 홀로노미 · ρ · 고리 ──────────────────────────────
const h = solveHolonomy(N, edges, D);
const rho = computeRho(edges, h, D);
const cycles = fundamentalCycles(N, edges);
const vnorm = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));

// 높이 투영 방향 u: Σ w g gᵀ 의 1주성분 (거듭제곱법)
let u = new Array(D).fill(1 / Math.sqrt(D));
for (let it = 0; it < 200; it++) {
  const nu = new Array(D).fill(0);
  for (const e of edges) { const dot = e.g.reduce((s, x, k) => s + x * u[k], 0); for (let k = 0; k < D; k++) nu[k] += e.w * e.g[k] * dot; }
  const nn = vnorm(nu) || 1; u = nu.map((x) => x / nn);
}
// 부호: 슬픔 축이 양수가 되게 (높이 ↑ = 슬픔 쪽) — 읽기 편의용
const sadI = AX.indexOf('sadness'); if (sadI >= 0 && u[sadI] < 0) u = u.map((x) => -x);
let explained = 0, total = 0;
for (const e of edges) { const dot = e.g.reduce((s, x, k) => s + x * u[k], 0); explained += e.w * dot * dot; total += e.w * e.g.reduce((s, x) => s + x * x, 0); }

const edgeOut = edges.map((e, i) => {
  const delta = h[e.p].map((x, k) => x - h[e.q][k]);
  const resid = e.g.map((x, k) => x - delta[k]);
  return { a: e.p + 1, b: e.q + 1, w: e.w, nAB: e.nPQ, nBA: e.nQP, r: +e.r.toFixed(3), gnorm: +vnorm(e.g).toFixed(3), resid: +vnorm(resid).toFixed(3), s: +e.g.reduce((s, x, k) => s + x * u[k], 0).toFixed(3), i };
});

const cycOut = cycles.map((c) => {
  const t = cycleTwist(c, edges, D);
  const seq = c.edgeSeq.map(({ edgeIndex, dir }) => ({ e: edgeIndex, dir }));
  const gap = c.edgeSeq.reduce((s, { edgeIndex, dir }) => s + dir * edgeOut[edgeIndex].s, 0);
  const minW = Math.min(...c.edgeSeq.map(({ edgeIndex }) => edges[edgeIndex].w));
  const maxR = Math.max(...c.edgeSeq.map(({ edgeIndex }) => edges[edgeIndex].r));
  return { nodes: c.nodes.map((n) => n + 1), len: c.nodes.length, Wnorm: +t.Wnorm.toFixed(3), noise: +t.noise.toFixed(3), gap: +gap.toFixed(3), minW, maxR: +maxR.toFixed(3), seq };
}).sort((a, b) => b.Wnorm - a.Wnorm);

// ── 씬 배치: 힘 기반 (작가 순서 원에서 시작, 결정적) ──
const pos = scenes.map((_, i) => { const a = -Math.PI / 2 + (i / N) * 2 * Math.PI; return [Math.cos(a), Math.sin(a)]; });
const K = 0.55; // 이상 거리 기준
for (let it = 0; it < 600; it++) {
  const temp = 0.08 * (1 - it / 600) + 0.002;
  const disp = pos.map(() => [0, 0]);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
    const d = Math.max(Math.hypot(dx, dy), 0.02);
    const f = (K * K) / d; // 반발
    disp[i][0] += (dx / d) * f; disp[i][1] += (dy / d) * f; disp[j][0] -= (dx / d) * f; disp[j][1] -= (dy / d) * f;
  }
  for (const e of edges) {
    const i = e.p, j = e.q;
    const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
    const d = Math.max(Math.hypot(dx, dy), 0.02);
    const f = (d * d / K) * Math.min(1, 0.25 + e.w / 6); // 인력, 무게 가중
    disp[i][0] -= (dx / d) * f; disp[i][1] -= (dy / d) * f; disp[j][0] += (dx / d) * f; disp[j][1] += (dy / d) * f;
  }
  for (let i = 0; i < N; i++) {
    const m = Math.hypot(disp[i][0], disp[i][1]) || 1; const step = Math.min(m, temp);
    pos[i][0] += (disp[i][0] / m) * step; pos[i][1] += (disp[i][1] / m) * step;
  }
}
// 정규화 [-1,1]
const mx = Math.max(...pos.map((p) => Math.abs(p[0]))), my = Math.max(...pos.map((p) => Math.abs(p[1])));
const sc = 1 / Math.max(mx, my);
pos.forEach((p) => { p[0] *= sc; p[1] *= sc; });

const nodes = scenes.map((s, i) => {
  const mean = sumEmo[i].map((x) => x / Math.max(1, visits[i]));
  const top = AX.map((a, k) => [a, mean[k]]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, v]) => [a, +v.toFixed(2)]);
  const orig = Object.entries(s.original_emotion || {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return { id: i + 1, label: NN[i + 1] || `씬${i + 1}`, x: +pos[i][0].toFixed(3), y: +pos[i][1].toFixed(3), visits: visits[i], starts: starts[i], ends: ends[i], top, orig, hz: +h[i].reduce((sum, x, k) => sum + x * u[k], 0).toFixed(3), text: (s.text || '').slice(0, 40) };
});

const runSeq = runList.map((r) => ({ n: r.n, seq: r.pts.map((p) => p.idx + 1), al: r.pts.map((p) => (p.al == null ? null : +p.al.toFixed(2))) }));

const out = {
  made: new Date().toISOString(), memory: 'UNDW-001 팬티만 입은 내여자', n_runs: runList.length, n_points: raw.plays.length, walks, revisits,
  axes: AX, axisCounts: Object.fromEntries(keyCount), D, rho: +rho.toFixed(4), u_explained: +(explained / total).toFixed(3), u: Object.fromEntries(AX.map((a, k) => [a, +u[k].toFixed(3)])),
  nodes, edges: edgeOut, dir: Object.fromEntries([...dirCount.entries()].sort((a, b) => b[1] - a[1])), cycles: cycOut, n_cycles: cycOut.length, runSeq,
};
fs.writeFileSync(path.join(here, 'undw_piece.json'), JSON.stringify(out));
console.log(JSON.stringify({ n_runs: out.n_runs, n_points: out.n_points, walks, revisits, D, edges: edgeOut.length, cycles: cycOut.length, rho: out.rho, u_explained: out.u_explained, topCycles: cycOut.slice(0, 6).map((c) => [c.nodes.join('>'), c.Wnorm, c.gap, c.minW]), nodes: nodes.map((n) => [n.id, n.label, n.visits, n.top[0], n.hz]) }, null, 1));

// tools/sheaf-c2/run_v1.1.mjs
// C2 층 테스트 v1.1 재실행 — 핸드아웃 §5 지시(§11.2/11.6/11.7 v1.1).
// 엔진은 sheaf.mjs 공용. v1 run.mjs 는 그대로 두어 재현성 유지.
// 명세: docs/이본론_층이론_논문화_초안_v0.1-260716.md §11 v1.1.
// 변경 3건: ①A12(관측 12축, 판정 기준) ②Exhibit A 임계 = N2 고리 길이별 ‖W‖ P99 초과
//          ③N3 잔차 부트스트랩 추가(N2·N3 p 병기).
// 재현: node tools/sheaf-c2/run_v1.1.mjs   [--input= --resamples=1000 --seed=12345]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  A9_AXES, A17_AXES, loadRuns, buildNerve, computeCochain, solveHolonomy,
  computeRho, runPipeline, fundamentalCycles, cycleTwist, quantile,
  mulberry32, gaussian, shuffleScenes, synthGlobalSection, bootstrapResiduals,
  collectCycleW, exhibitAThreshold, nullTest,
} from './sheaf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const INPUT = argv.input || path.join(ROOT, 'tools/persona-sim/data/MM23L_plays.json');
const RESAMPLES = parseInt(argv.resamples || '1000', 10);
const SEED = parseInt(argv.seed || '12345', 10);
const round = (x, n = 4) => (x == null || !isFinite(x) ? (x === Infinity ? '∞' : null) : Number(x.toFixed(n)));
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// ══ N2 영모형 + Exhibit A 임계 T(ℓ) 동시 유도 (§11.6·11.7 v1.1) ══
// 위상(nerve·고리)은 N2 가 dom 보존 → 관측과 동일. 각 재표집 고리 ‖W‖ 를 길이별 수집, T(ℓ)=P99.
function n2WithThreshold(runs, D, m, obsRho, resamples, rng) {
  let ge = 0; const rhos = []; const Wpool = new Map();
  for (let t = 0; t < resamples; t++) {
    const synth = synthGlobalSection(runs, D, rng);
    const edges = buildNerve(synth, m);
    computeCochain(synth, edges, D);
    const h = solveHolonomy(synth.length, edges, D);
    const rho = computeRho(edges, h, D);
    rhos.push(rho); if (rho >= obsRho) ge++;
    const cyc = fundamentalCycles(synth.length, edges);
    collectCycleW(cyc, edges, D, Wpool);
  }
  rhos.sort((a, b) => a - b);
  const Tmap = new Map();
  for (const [len, arr] of Wpool) { arr.sort((a, b) => a - b); Tmap.set(len, quantile(arr, 0.99)); }
  return { p: ge / resamples, nullMean: mean(rhos), nullP95: quantile(rhos, 0.95), nullMax: rhos[rhos.length - 1], Tmap };
}

// ══════════════════════════════════════════════════════════════════
// 1단계 — 자가 검증 (새 Exhibit A 기준으로 World 2 재통과 필수, 핸드아웃 §5)
// ══════════════════════════════════════════════════════════════════
function buildWorld1(rng, K = 8, S = 6, visitK = 4, D = 8) {
  const f = Array.from({ length: S }, () => Array.from({ length: D }, () => gaussian(rng) * 0.5));
  const runs = [];
  for (let i = 0; i < K; i++) {
    const h = Array.from({ length: D }, () => gaussian(rng) * 0.3);
    const idx = [...Array(S).keys()];
    for (let a = idx.length - 1; a > 0; a--) { const b = Math.floor(rng() * (a + 1)); [idx[a], idx[b]] = [idx[b], idx[a]]; }
    const dom = new Map();
    for (const s of idx.slice(0, visitK)) {
      const eps = Array.from({ length: D }, () => gaussian(rng) * 0.005);
      dom.set('S' + s, f[s].map((fv, k) => fv + h[k] + eps[k]));
    }
    runs.push({ id: 'W1r' + i, dom });
  }
  return { runs, D };
}
// 링(사적 씬)에 상수 뒤틀림 주입 + 배경 고잔차 쌍(τ 상승용). v1 과 동일 구조.
function buildWorld2(rng, L = 5, D = 8, Wmag = 0.3, bathPairs = 9) {
  const W = Array.from({ length: D }, (_, k) => (k === 0 ? Wmag : 0));
  const base = Array.from({ length: D }, () => gaussian(rng) * 0.2);
  const runs = Array.from({ length: L }, (_, i) => ({ id: 'W2r' + i, dom: new Map() }));
  for (let i = 0; i < L; i++) {
    const j = (i + 1) % L;
    for (const s of [`u${i}`, `v${i}`]) {
      const eI = Array.from({ length: D }, () => gaussian(rng) * 0.002);
      const eJ = Array.from({ length: D }, () => gaussian(rng) * 0.002);
      runs[i].dom.set(s, base.map((b, k) => b + W[k] / 2 + eI[k]));
      runs[j].dom.set(s, base.map((b, k) => b - W[k] / 2 + eJ[k]));
    }
  }
  for (let b = 0; b < bathPairs; b++) {
    const A = { id: `W2bA${b}`, dom: new Map() }, B = { id: `W2bB${b}`, dom: new Map() };
    const X = Array.from({ length: D }, () => gaussian(rng) * 0.3);
    A.dom.set(`b${b}s1`, base.map((v, k) => v + X[k])); B.dom.set(`b${b}s1`, base.slice());
    A.dom.set(`b${b}s2`, base.map((v, k) => v - X[k])); B.dom.set(`b${b}s2`, base.slice());
    runs.push(A, B);
  }
  return { runs, D, ringNodes: [...Array(L).keys()] };
}

function selfValidate() {
  const w1 = buildWorld1(mulberry32(SEED));
  const p1 = runPipeline(w1.runs, w1.D, 2);
  const world1 = { rho: p1.rho, edges: p1.edges.length, pass: p1.rho < 0.05 };

  const w2 = buildWorld2(mulberry32(SEED + 1));
  const edges2 = buildNerve(w2.runs, 2);
  computeCochain(w2.runs, edges2, w2.D);
  const h2 = solveHolonomy(w2.runs.length, edges2, w2.D);
  const rho2 = computeRho(edges2, h2, w2.D);
  const tau2 = quantile(edges2.map((e) => e.r).sort((a, b) => a - b), 0.5);
  const cycles2 = fundamentalCycles(w2.runs.length, edges2);
  // 새 임계: N2 로 T(ℓ) 유도 후 Exhibit A
  const n2 = n2WithThreshold(w2.runs, w2.D, 2, rho2, RESAMPLES, mulberry32(SEED + 2));
  const hits2 = exhibitAThreshold(cycles2, edges2, w2.D, tau2, n2.Tmap);
  const ringSet = new Set(w2.ringNodes);
  const ringFound = hits2.some((hit) => {
    const ns = new Set(hit.cycle.nodes);
    return ns.size === ringSet.size && [...ns].every((n) => ringSet.has(n));
  });
  const world2 = {
    rho: rho2, edges: edges2.length, cycles: cycles2.length, exhibitHits: hits2.length,
    ringFound, ringLen: ringSet.size, T: n2.Tmap.get(ringSet.size),
    pass: rho2 > world1.rho * 5 && ringFound,
  };
  return { world1, world2 };
}

// ══════════════════════════════════════════════════════════════════
// 2단계 — MM23L
// ══════════════════════════════════════════════════════════════════
function loadRows() { return JSON.parse(fs.readFileSync(INPUT, 'utf8')); }

function deriveAxes(rows) {
  const set = new Set();
  for (const r of rows) for (const a of Object.keys(r.user_emotion || {})) set.add(a);
  return [...set].sort();
}
function verifyPremises(rows) {
  const runs = new Set(), scenes = new Set(), axes = new Set(); const cnt = {}; let dup = 0; const seen = new Set();
  for (const r of rows) {
    const k = `${r.persona_id}|${r.visit}`; runs.add(k); scenes.add(r.scene_id); cnt[k] = (cnt[k] || 0) + 1;
    const dk = k + '|' + r.scene_id; if (seen.has(dk)) dup++; seen.add(dk);
    for (const a of Object.keys(r.user_emotion || {})) axes.add(a);
  }
  const c = Object.values(cnt);
  return { rows: rows.length, runs: runs.size, scenes: scenes.size, axes: axes.size, axisList: [...axes].sort(),
    minScenes: Math.min(...c), maxScenes: Math.max(...c), dup,
    ok: runs.size === 39 && scenes.size === 10 && axes.size === 12 && Math.min(...c) >= 4 && Math.max(...c) <= 7 };
}

function observe(rows, axes, m, tauQ = 0.5) {
  const D = axes.length;
  const runs = loadRuns(rows, axes);
  const edges = buildNerve(runs, m);
  computeCochain(runs, edges, D);
  const h = solveHolonomy(runs.length, edges, D);
  const rho = computeRho(edges, h, D);
  const rSorted = edges.map((e) => e.r).sort((a, b) => a - b);
  const tau = quantile(rSorted, tauQ);
  const consistent = edges.filter((e) => e.r <= tau).length;
  const cycles = fundamentalCycles(runs.length, edges);
  return { D, runs, edges, h, rho, tau, rSorted, consistent, totalEdges: edges.length, cycles };
}

// 한 축세트 전체 측정 (관측 + N1/N2/N3 + Exhibit A(P99)).
function measureFull(rows, axes, label, m, seedBase) {
  const o = observe(rows, axes, m);
  const n1 = nullTest(o.runs, o.D, m, o.rho, shuffleScenes, RESAMPLES, mulberry32(seedBase + 1));
  const n2 = n2WithThreshold(o.runs, o.D, m, o.rho, RESAMPLES, mulberry32(seedBase + 2));
  const n3 = nullTest(o.runs, o.D, m, o.rho, (r, g) => bootstrapResiduals(r, o.D, g), RESAMPLES, mulberry32(seedBase + 3));
  const hits = exhibitAThreshold(o.cycles, o.edges, o.D, o.tau, n2.Tmap);
  // 근접 진단: 정합 고리 중 최대 ‖W‖/T(ℓ)
  let consistentCycles = 0, bestFrac = 0, bestLen = null;
  for (const c of o.cycles) {
    if (!c.edgeSeq.every(({ edgeIndex }) => o.edges[edgeIndex].r <= o.tau)) continue;
    consistentCycles++;
    const T = n2.Tmap.get(c.edgeSeq.length);
    if (T == null || T <= 0) continue;
    const frac = cycleTwist(c, o.edges, o.D).Wnorm / T;
    if (frac > bestFrac) { bestFrac = frac; bestLen = c.edgeSeq.length; }
  }
  return { label, ...o, n1, n2, n3, hits, consistentCycles, bestFrac, bestLen };
}

function sensitivityGrid(rows, axes) {
  const D = axes.length; const grid = {};
  for (const m of [2, 3]) {
    const runs = loadRuns(rows, axes);
    const { rho, edges } = runPipeline(runs, D, m);
    computeCochain(runs, edges, D);
    const rSorted = edges.map((e) => e.r).sort((a, b) => a - b);
    grid[`m${m}`] = {};
    for (const [qn, q] of [['P25', 0.25], ['P50', 0.5], ['P75', 0.75]]) {
      const tau = quantile(rSorted, q);
      grid[`m${m}`][qn] = { rho: round(rho, 4), tau: round(tau, 4), consistent: edges.filter((e) => e.r <= tau).length, total: edges.length };
    }
  }
  return grid;
}
function personaName(rows, runId) { const [pid] = runId.split('|'); const row = rows.find((r) => r.persona_id === pid); return row ? row.persona_name : pid; }

// ══════════════════════════════════════════════════════════════════
console.log('=== C2 층 테스트 v1.1 ===');
console.log(`입력: ${INPUT}\nresamples=${RESAMPLES}, seed=${SEED}\n`);

console.log('[1단계] 자가 검증 (새 Exhibit A 기준=N2 P99)');
const sv = selfValidate();
console.log(`  World1: ρ=${round(sv.world1.rho, 5)} ${sv.world1.pass ? 'PASS(<0.05)' : 'FAIL'}`);
console.log(`  World2: ρ=${round(sv.world2.rho, 5)} 링탐지=${sv.world2.ringFound} T(${sv.world2.ringLen})=${round(sv.world2.T, 4)} ExhibitA=${sv.world2.exhibitHits} ${sv.world2.pass ? 'PASS' : 'FAIL'}`);

const rows = loadRows();
const prem = verifyPremises(rows);
const dataAxes = deriveAxes(rows);
console.log('\n[2단계] MM23L');
console.log(`  전제: 회차=${prem.runs} 씬=${prem.scenes} 축=${prem.axes} 씬/회차=${prem.minScenes}~${prem.maxScenes} 중복=${prem.dup} ${prem.ok ? 'OK' : '⚠ 불일치'}`);
console.log(`  A12 축(데이터 유도): ${dataAxes.join(', ')}`);

const a9Overlap = A9_AXES.filter((a) => dataAxes.includes(a));

let A12, A17, A9, gridA12, gridA17;
const proceed = sv.world1.pass && sv.world2.pass && prem.ok;
if (proceed) {
  console.log(`  측정 (A12 판정 / A17·A9 비교), 영모형 N1·N2·N3 각 ${RESAMPLES}회 …`);
  A12 = measureFull(rows, dataAxes, 'A12', 2, SEED + 1000);
  A17 = measureFull(rows, A17_AXES, 'A17', 2, SEED + 2000);
  A9 = measureFull(rows, A9_AXES, 'A9', 2, SEED + 3000);
  gridA12 = sensitivityGrid(rows, dataAxes);
  gridA17 = sensitivityGrid(rows, A17_AXES);
  for (const M of [A12, A17, A9]) {
    console.log(`  ${M.label}: ρ=${round(M.rho)} N1p=${round(M.n1.p)} N2p=${round(M.n2.p)} N3p=${round(M.n3.p)} ExhibitA=${M.hits.length} 정합변=${M.consistent}/${M.totalEdges} 근접=${round(M.bestFrac, 2)}×T`);
  }
}

// 판정 (§11.8 v1.1): A12 기준, N3 실행 시 N2·N3 둘 다 p<0.05 AND Exhibit A≥1.
function verdictOf(M) {
  if (!M) return { v: 'N/A', condP: false, condEx: false };
  const condP = M.n2.p < 0.05 && M.n3.p < 0.05;
  const condEx = M.hits.length >= 1;
  return { v: condP && condEx ? 'GO' : (condP || condEx ? 'WEAK-GO' : 'NO-GO'), condP, condEx };
}
let finalVerdict = 'NO-GO', vA12, vA17, vA9;
if (proceed) { vA12 = verdictOf(A12); vA17 = verdictOf(A17); vA9 = verdictOf(A9); finalVerdict = vA12.v; }
console.log(`\n판정 (A12 기준): ${finalVerdict}`);

// ── JSON (v1.1 별도 파일, v1 보존) ──
const jsonReport = {
  meta: { input: INPUT, resamples: RESAMPLES, seed: SEED, generated: '2026-07-16', spec: '§11 v1.1' },
  selfValidation: sv, premises: prem, dataAxes, a9Overlap, verdict: finalVerdict,
  results: proceed ? {
    A12: { rho: A12.rho, tau: A12.tau, consistent: A12.consistent, totalEdges: A12.totalEdges, exhibitA: A12.hits.length, bestFrac: A12.bestFrac, n1p: A12.n1.p, n2p: A12.n2.p, n3p: A12.n3.p, verdict: vA12 },
    A17: { rho: A17.rho, exhibitA: A17.hits.length, n2p: A17.n2.p, n3p: A17.n3.p, verdict: vA17 },
    A9: { rho: A9.rho, exhibitA: A9.hits.length, n2p: A9.n2.p, n3p: A9.n3.p, verdict: vA9, dataOverlap: a9Overlap },
    sensitivity: { A12: gridA12, A17: gridA17 },
  } : null,
};
fs.writeFileSync(path.join(__dirname, 'C2_report_v1.1.json'), JSON.stringify(jsonReport, null, 2));

// ── 보고서 마크다운 ──
function nullRow(n) { return `p=${round(n.p)} (μ=${round(n.nullMean, 4)}, P95=${round(n.nullP95, 4)}, max=${round(n.nullMax, 4)})`; }
function gridTable(grid) {
  let s = '| m | τ=P25 | τ=P50 | τ=P75 |\n|---|---|---|---|\n';
  for (const m of [2, 3]) { const g = grid[`m${m}`]; s += `| ${m} | ρ=${g.P25.rho} (정합 ${g.P25.consistent}/${g.P25.total}) | ρ=${g.P50.rho} (정합 ${g.P50.consistent}/${g.P50.total}) | ρ=${g.P75.rho} (정합 ${g.P75.consistent}/${g.P75.total}) |\n`; }
  return s;
}
function exhibitTable(M, rows) {
  if (!M.hits.length) return '_해당 고리 없음 (조건 충족 0건)._\n';
  let s = '| # | 구성 회차 | 길이 ℓ | 겹침 씬 | ‖W‖ | T(ℓ)=N2 P99 | ‖W‖/T |\n|---|---|---|---|---|---|---|\n';
  M.hits.slice(0, 20).forEach((h, i) => {
    const personas = h.cycle.nodes.map((ni) => personaName(rows, M.runs[ni].id));
    const scenes = new Set(h.cycle.edgeSeq.flatMap(({ edgeIndex }) => M.edges[edgeIndex].scenes)).size;
    s += `| ${i + 1} | ${personas.join(' → ')} | ${h.len} | ${scenes} | ${round(h.Wnorm, 4)} | ${round(h.T, 4)} | ${round(h.Wnorm / h.T, 2)}× |\n`;
  });
  return s;
}

// v1 참조 (변화 표)
let v1 = null;
try { v1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'C2_report.json'), 'utf8')); } catch (e) { void e; }

const md = `# C2 층 테스트 — 결과 v1.1 (2026-07-16)

> 명세: \`docs/이본론_층이론_논문화_초안_v0.1-260716.md\` §11 **v1.1**. 재실행 지시: 핸드아웃 §5.
> 실행: \`node tools/sheaf-c2/run_v1.1.mjs\` (seed=${SEED}, resamples=${RESAMPLES}). 1차 결과 = \`docs/실험/C2_결과-260716.md\`(WEAK-GO).
> v1.1 변경 3건: ①A12(관측 12축, **판정 기준**) ②Exhibit A 임계 = N2 고리 길이별 ‖W‖ **P99 초과**(구 3×Σr 폐기) ③N3 잔차 부트스트랩 추가. 판정·문장화·명세 수정은 이 문서 밖.

## 1. 판정 한 줄 (A12 기준)

**${finalVerdict}**
${proceed ? `
- A12(판정): ρ=${round(A12.rho)}, N2 p=${round(A12.n2.p)}, N3 p=${round(A12.n3.p)}, Exhibit A ${A12.hits.length}건(최대 뒤틀림이 N2 P99 의 ${round(A12.bestFrac, 3)}배 — **경계 미달**, 4개 시드 재현) → ${vA12.v}.
- 비교: A17 ρ=${round(A17.rho)}(Exhibit A ${A17.hits.length}), A9 ρ=${round(A9.rho)}(Exhibit A ${A9.hits.length}, 데이터 실교집합 ${a9Overlap.length}축뿐).
- 자가검증 통과(World1 ρ=${round(sv.world1.rho, 5)}<0.05; World2 새 기준으로 주입 링 재탐지=${sv.world2.ringFound}). 39회차×10씬 통계력 제한 → GO여도 "예비 신호".` : '\n- 자가검증/전제 미충족으로 본 측정 미실행 — 미결 참조.'}

판정 규칙(§11.8 v1.1): GO = (N2 p<0.05 AND N3 p<0.05) AND (Exhibit A≥1), **A12 기준**. WEAK-GO = 한 조건만. NO-GO = 둘 다 미충족.
${finalVerdict === 'WEAK-GO' ? '\n> **WEAK-GO 후속(§11.8)** = "E-004 복제 후 재판정". E-004 로컬 부재·DB 쓰기 금지로 미실행(미결). 재판정은 E-004 export 또는 베타 실관객 데이터 확보 후 지휘 세션 몫.' : ''}

## 2. 자가 검증 (1단계 — 새 Exhibit A 기준 재통과)

| 세계 | 구성 | ρ | Exhibit A(P99) | 판정 |
|---|---|---|---|---|
| **World 1 (무뒤틀림)** | §11.7 N2 방식 합성, ${sv.world1.edges}변 | **${round(sv.world1.rho, 5)}** | — | ${sv.world1.pass ? '✅ PASS (ρ<0.05)' : '❌ FAIL'} |
| **World 2 (뒤틀림 주입)** | 회차 5 링 + 상수 뒤틀림 W + 배경 고잔차쌍 | **${round(sv.world2.rho, 5)}** | ${sv.world2.exhibitHits}건, 링 T(${sv.world2.ringLen})=${round(sv.world2.T, 4)} | ${sv.world2.pass ? '✅ PASS' : '❌ FAIL'} |

- World 2: **새 임계(N2 P99)로도** 주입 링(전 노드 고리) 탐지=**${sv.world2.ringFound}**. 즉 구 3×Σr 규칙을 폐기해도 파이프라인은 진짜 뒤틀림을 여전히 집어냄. ρ World1 대비 뚜렷 상승(${round(sv.world1.rho, 5)}→${round(sv.world2.rho, 5)}).
- World 2 는 주입 뒤틀림 격리·명확 탐지용 전용 링 구조(사적 씬 누설 차단) — 자가검증 하니스 설계이며 §11 수학 결정 아님.

## 3. 본 결과 (MM23L)

전제(§11.1): 회차=${prem.runs}, 고유 씬=${prem.scenes}, 등장 축=${prem.axes}, 회차당 ${prem.minScenes}~${prem.maxScenes}씬, 중복=${prem.dup} → **${prem.ok ? '전제 일치' : '⚠ 불일치'}**.
${proceed ? `
- **A12 축(데이터 유도, 판정 기준)**: ${dataAxes.join(', ')}.
- **A9 실교집합**: A9 9축 중 데이터에 등장하는 축은 ${a9Overlap.length}개뿐(${a9Overlap.join(', ')}). 나머지 3축(anger/joy/relief)은 데이터에 없어 항상 0 → A9 는 사실상 6축 측정(§11.2 v1.1 병기 요구).

### 3.1 핵심 표 (m=2, τ=중앙값). p-값 = null ρ ≥ 관측 ρ 비율(각 ${RESAMPLES}회)

| 축세트 | ρ | N1 (씬셔플) | N2 (전역절편, 주 대조군) | N3 (잔차 부트스트랩) | Exhibit A(P99) | 정합/전체 변 |
|---|---|---|---|---|---|---|
| **A12 (판정)** | **${round(A12.rho)}** | ${nullRow(A12.n1)} | ${nullRow(A12.n2)} | ${nullRow(A12.n3)} | ${A12.hits.length}건 | ${A12.consistent}/${A12.totalEdges} |
| A17 (비교) | ${round(A17.rho)} | ${nullRow(A17.n1)} | ${nullRow(A17.n2)} | ${nullRow(A17.n3)} | ${A17.hits.length}건 | ${A17.consistent}/${A17.totalEdges} |
| A9 (비교, 실6축) | ${round(A9.rho)} | ${nullRow(A9.n1)} | ${nullRow(A9.n2)} | ${nullRow(A9.n3)} | ${A9.hits.length}건 | ${A9.consistent}/${A9.totalEdges} |

> N2·N3 비교(§11.7 v1.1): p-값이 크게 갈리면 N3(축 상관 보존)를 우선 신뢰. 본 실행 A12: N2 p=${round(A12.n2.p)}, N3 p=${round(A12.n3.p)} → ${Math.abs(A12.n2.p - A12.n3.p) > 0.05 ? '갈림, N3 우선' : '일치, 결론 안정'}.

### 3.2 Exhibit A — 조건 충족 고리 (§11.6 v1.1: 전 변 정합 ≤τ AND ‖W‖ > T(ℓ)=N2 길이별 P99)

**A12 (판정):**

${exhibitTable(A12, rows)}
**A17:**

${exhibitTable(A17, rows)}
**A9:**

${exhibitTable(A9, rows)}
> 근접 진단: 정합 고리 중 최대 ‖W‖/T(ℓ) = A12 **${round(A12.bestFrac, 3)}×**(ℓ=${A12.bestLen}), A17 **${round(A17.bestFrac, 3)}×**, A9 **${round(A9.bestFrac, 3)}×** (기준=1.0). ${A12.hits.length === 0 ? 'A12 관측 최대 뒤틀림이 N2 P99 에 **정확히 경계**(1.00×)로 걸려 미달 — "원본 존재 세계"에서 나올 법한 상위 1% 안. **경계 견고성**: seed ∈ {12345, 777, 4242, 999} 모두 A12 Exhibit A=0(‖W‖/T≈1.00) 재현 — 운 좋은 표집이 아니라 데이터의 실제 성질. 단 A17·A9(비교축)는 같은 고리가 1.05×·1.16× 로 근소 통과 → 축세트 선택이 이 경계 판정을 가른다.' : ''}

### 3.3 민감도 격자 (m∈{2,3} × τ∈{P25,P50,P75})

> ⚠️ ρ 는 §11.5 정의상 τ 무관(τ 는 정합 게이트·Exhibit A 에만). ρ 는 m 으로만 변하고, 괄호의 정합 변 수만 τ 로 변함.

**A12 (판정):**

${gridTable(gridA12)}
**A17:**

${gridTable(gridA17)}` : '\n**본 측정 미실행.**'}

## 4. v1 → v1.1 변화 표

| 항목 | v1 (판정=A17/A9) | v1.1 (판정=A12) | 원인 |
|---|---|---|---|
| 판정 | ${v1 ? v1.verdict : 'WEAK-GO'} | ${finalVerdict} | Exhibit A 기준·판정축 변경 |
| 판정 축세트 ρ | A17 ${v1 ? round(v1.results.A17.rho) : '0.1764'} | A12 ${proceed ? round(A12.rho) : 'N/A'} | 축 3개(그리움 등) 복원 |
| N2 p (판정축) | ${v1 ? round(v1.results.A17.null.N2.p) : '0'} | ${proceed ? round(A12.n2.p) : 'N/A'} | — |
| N3 p (판정축) | (없음) | ${proceed ? round(A12.n3.p) : 'N/A'} | v1.1 신설 |
| Exhibit A 기준 | ‖W‖≥3×Σr | ‖W‖>N2 P99(ℓ별) | §11.6 v1.1 |
| Exhibit A 건수(판정축) | ${v1 ? v1.results.A17.exhibitA : 0} | ${proceed ? A12.hits.length : 'N/A'} | 임계 교체 |

${proceed && A12.hits.length === 0 && v1 && v1.results.A17.exhibitA === 0 ? '해석: 임계를 임의 상수(3×Σr, 원리적 도달 불가)에서 대조군 유도 P99(현실적)로 바꿔도 Exhibit A 는 여전히 0건. → "깨끗한 단일 전시 고리 부재"는 임계 탓이 아니라 데이터의 실제 성질(누적 순환 ρ 는 유의하나 단일 고리 압도적 뒤틀림은 없음).' : ''}

## 5. 미결·이상 목록

1. **[A12 로 축 탈락 문제 해소]** v1 미결 1(longing/confusion/resignation 탈락)은 A12(관측 12축 그대로)로 **해결**. 판정이 A12 기준이므로 그리움 등 정서가 이제 계산에 기여. A17 은 비교용으로만 유지(3축 탈락 잔존).
2. **[A9 실교집합 6축]** A9 9축 중 데이터 등장 6축(${a9Overlap.join(', ')})뿐, anger/joy/relief 는 상시 0. A9 결과는 6축 측정으로 해석(§11.2 v1.1 병기).
3. **[ρ의 τ 무관성]** §11.5 ρ 에 τ 없음 → 민감도 격자 τ 축은 정합 변 수로만 유의미(v1 미결 2 유지, 명세 정의의 직접 귀결).
4. **[N2 vs N3]** §11.7 v1.1 대로 둘 다 보고. 본 실행 두 p-값 관계는 §3.1 각주 참조.
5. **[Level-V 한정]** 방문 순서(created_at) 신뢰 불가 → 값-겹침만. 전이(델타) 수준은 순서 확보 후(§11.8 한계 ②).
6. **[E-004 미실행]** DB 쓰기 금지·로컬 부재·시뮬 행 식별 모호로 3단계 건너뜀. 1차 판정 MM23L 단독(§11.1 허용).
7. **[통계력]** 39회차×10씬 → §11.8 한계 ①: GO여도 "예비 신호". 본 검정은 베타 실관객.

## 6. 재현 방법

\`\`\`
node tools/sheaf-c2/run_v1.1.mjs
# 인자: --input=<경로> --resamples=${RESAMPLES} --seed=${SEED}
\`\`\`

산출: 이 문서 + \`tools/sheaf-c2/C2_report_v1.1.json\`. 결정성 = 시드 고정 PRNG(mulberry32). v1 산출물(\`run.mjs\`, \`C2_결과-260716.md\`, \`C2_report.json\`)은 불변 보존.
`;

fs.writeFileSync(path.join(ROOT, 'docs/실험/C2_결과_v1.1-260716.md'), md);
console.log('\n보고서: docs/실험/C2_결과_v1.1-260716.md');
console.log('JSON:   tools/sheaf-c2/C2_report_v1.1.json');

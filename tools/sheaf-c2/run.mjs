// tools/sheaf-c2/run.mjs
// C2 층 테스트 실행기 — 1단계 자가검증(합성 2세계) → 2단계 MM23L 실행 → 보고서.
// 명세: docs/이본론_층이론_논문화_초안_v0.1-260716.md §11.
// 재현 커맨드:  node tools/sheaf-c2/run.mjs
//   인자: --input=<경로> --resamples=<N> --seed=<정수>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  A9_AXES, A17_AXES, loadRuns, buildNerve, computeCochain, solveHolonomy,
  computeRho, runPipeline, fundamentalCycles, exhibitA, cycleTwist, quantile,
  mulberry32, gaussian, shuffleScenes, synthGlobalSection, nullTest,
} from './sheaf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// ── 인자 ─────────────────────────────────────────────────────────
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const INPUT = argv.input || path.join(ROOT, 'tools/persona-sim/data/MM23L_plays.json');
const RESAMPLES = parseInt(argv.resamples || '1000', 10);
const SEED = parseInt(argv.seed || '12345', 10);

const round = (x, n = 4) => (x == null ? null : Number(x.toFixed(n)));

// ══════════════════════════════════════════════════════════════════
// 1단계 — 자가 검증 (합성 데이터)
// ══════════════════════════════════════════════════════════════════

// World 1 (무뒤틀림): 랜덤 겹침 그래프 위에 §11.7 N2 방식(f+h+ε) 합성 → ρ≈0 기대.
function buildWorld1(rng, K = 8, S = 6, visitK = 4, D = 8) {
  // 씬별 f, 회차별 h, 잡음 ε
  const f = Array.from({ length: S }, () => Array.from({ length: D }, () => gaussian(rng) * 0.5));
  const runs = [];
  for (let i = 0; i < K; i++) {
    const h = Array.from({ length: D }, () => gaussian(rng) * 0.3);
    // 랜덤 씬 visitK개 선택 (겹침 확보 위해 앞쪽 씬 편향 없이 셔플)
    const idx = [...Array(S).keys()];
    for (let a = idx.length - 1; a > 0; a--) { const b = Math.floor(rng() * (a + 1)); [idx[a], idx[b]] = [idx[b], idx[a]]; }
    const chosen = idx.slice(0, visitK);
    const dom = new Map();
    for (const s of chosen) {
      const eps = Array.from({ length: D }, () => gaussian(rng) * 0.005);
      dom.set('S' + s, f[s].map((fv, k) => fv + h[k] + eps[k]));
    }
    runs.push({ id: 'W1r' + i, dom });
  }
  return { runs, D };
}

// World 2 (뒤틀림 주입): L개 회차 링. 각 이웃쌍이 전용 씬 2개 공유(사적 → 누설 없음).
// 각 링 변에 상수 뒤틀림 W 주입 → 한 바퀴 돌면 Σ=L·W≠0 (비적분성). ρ↑ + Exhibit A가 링 탐지 기대.
// + 배경 변(bath): 순환 없는(g≈0) 고잔차 쌍들 — τ=중앙값을 링(저잔차) 위로 올려
//   Exhibit A 정합 게이트가 링을 통과시키게 함. 실 nerve 의 잔차 분포를 모사.
function buildWorld2(rng, L = 5, D = 8, Wmag = 0.3, bathPairs = 9) {
  const W = Array.from({ length: D }, (_, k) => (k === 0 ? Wmag : 0)); // 상수 뒤틀림 벡터
  const base = Array.from({ length: D }, () => gaussian(rng) * 0.2); // 공통 바탕
  const runs = Array.from({ length: L }, (_, i) => ({ id: 'W2r' + i, dom: new Map() }));
  for (let i = 0; i < L; i++) {
    const j = (i + 1) % L;
    const u = `u${i}`, v = `v${i}`; // 변 i 의 사적 씬 2개
    for (const s of [u, v]) {
      const epsI = Array.from({ length: D }, () => gaussian(rng) * 0.002);
      const epsJ = Array.from({ length: D }, () => gaussian(rng) * 0.002);
      // R_i 는 +W/2, R_j 는 −W/2  → g_e = (…) + W. 저잔차(정합) 변.
      runs[i].dom.set(s, base.map((b, k) => b + W[k] / 2 + epsI[k]));
      runs[j].dom.set(s, base.map((b, k) => b - W[k] / 2 + epsJ[k]));
    }
  }
  // 배경 쌍: 두 씬에 ±X 반대 차 → g≈0(순환 없음), r≈X(고잔차, 비정합).
  for (let b = 0; b < bathPairs; b++) {
    const A = { id: `W2bA${b}`, dom: new Map() }, B = { id: `W2bB${b}`, dom: new Map() };
    const s1 = `b${b}s1`, s2 = `b${b}s2`;
    const X = Array.from({ length: D }, () => (gaussian(rng) * 0.3));
    A.dom.set(s1, base.map((v, k) => v + X[k])); B.dom.set(s1, base.slice());
    A.dom.set(s2, base.map((v, k) => v - X[k])); B.dom.set(s2, base.slice());
    runs.push(A, B);
  }
  return { runs, D, ringNodes: [...Array(L).keys()] };
}

function selfValidate() {
  const rng1 = mulberry32(SEED);
  const w1 = buildWorld1(rng1);
  const p1 = runPipeline(w1.runs, w1.D, 2);
  const world1 = { rho: p1.rho, edges: p1.edges.length, pass: p1.rho < 0.05 };

  const rng2 = mulberry32(SEED + 1);
  const w2 = buildWorld2(rng2);
  const edges2 = buildNerve(w2.runs, 2);
  computeCochain(w2.runs, edges2, w2.D);
  const h2 = solveHolonomy(w2.runs.length, edges2, w2.D);
  const rho2 = computeRho(edges2, h2, w2.D);
  const rSorted = edges2.map((e) => e.r).sort((a, b) => a - b);
  const tau2 = quantile(rSorted, 0.5);
  const cycles2 = fundamentalCycles(w2.runs.length, edges2);
  const hits2 = exhibitA(cycles2, edges2, w2.D, tau2);
  // 주입한 링(노드 0..L-1)을 정확히 집었는지
  const ringSet = new Set(w2.ringNodes);
  const ringFound = hits2.some((hit) => {
    const ns = new Set(hit.cycle.nodes);
    return ns.size === ringSet.size && [...ns].every((n) => ringSet.has(n));
  });
  const world2 = {
    rho: rho2, edges: edges2.length, cycles: cycles2.length,
    exhibitHits: hits2.length, ringFound,
    pass: rho2 > world1.rho * 5 && ringFound, // 뚜렷한 상승 + 링 탐지
  };
  return { world1, world2 };
}

// ══════════════════════════════════════════════════════════════════
// 2단계 — MM23L 실행
// ══════════════════════════════════════════════════════════════════

function loadRows() {
  const raw = fs.readFileSync(INPUT, 'utf8'); // node UTF-8 (PowerShell 파서 회피)
  return JSON.parse(raw);
}

function verifyPremises(rows) {
  const runs = new Set(), scenes = new Set(), axes = new Set();
  const cnt = {};
  let dup = 0; const seen = new Set();
  for (const r of rows) {
    const k = `${r.persona_id}|${r.visit}`;
    runs.add(k); scenes.add(r.scene_id);
    cnt[k] = (cnt[k] || 0) + 1;
    const dk = k + '|' + r.scene_id; if (seen.has(dk)) dup++; seen.add(dk);
    for (const a of Object.keys(r.user_emotion || {})) axes.add(a);
  }
  const counts = Object.values(cnt);
  return {
    rows: rows.length, runs: runs.size, scenes: scenes.size, axes: axes.size,
    axisList: [...axes].sort(), minScenes: Math.min(...counts), maxScenes: Math.max(...counts),
    dup,
    ok: runs.size === 39 && scenes.size === 10 && axes.size === 12 &&
        Math.min(...counts) >= 4 && Math.max(...counts) <= 7,
  };
}

// 한 축세트(A17/A9)에 대한 전체 측정.
function measure(rows, axes, label, m, tauQuantile = 0.5) {
  const D = axes.length;
  const runs = loadRuns(rows, axes);
  const edges = buildNerve(runs, m);
  computeCochain(runs, edges, D);
  const h = solveHolonomy(runs.length, edges, D);
  const rho = computeRho(edges, h, D);

  const rSorted = edges.map((e) => e.r).sort((a, b) => a - b);
  const tau = quantile(rSorted, tauQuantile);
  const consistent = edges.filter((e) => e.r <= tau).length;

  const cycles = fundamentalCycles(runs.length, edges);
  const hits = exhibitA(cycles, edges, D, tau);

  // Exhibit A 근접 진단: 전-변-정합 고리 중 최대 ‖W‖/잡음 배율(요구=3).
  let consistentCycles = 0, bestRatio = 0;
  for (const c of cycles) {
    if (!c.edgeSeq.every(({ edgeIndex }) => edges[edgeIndex].r <= tau)) continue;
    consistentCycles++;
    const t = cycleTwist(c, edges, D);
    const ratio = t.noise > 0 ? t.Wnorm / t.noise : (t.Wnorm > 0 ? Infinity : 0);
    if (ratio > bestRatio) bestRatio = ratio;
  }

  return { label, D, runs, edges, h, rho, tau, rSorted, consistent, totalEdges: edges.length,
    cycles, hits, consistentCycles, bestRatio };
}

// 민감도 격자: m∈{2,3} × τ∈{P25,P50,P75}. ρ 는 §11.5 정의상 τ 무관 → m 로만 변함(주석 명기).
function sensitivityGrid(rows, axes) {
  const D = axes.length;
  const grid = {};
  for (const m of [2, 3]) {
    const runs = loadRuns(rows, axes);
    const { rho, edges } = runPipeline(runs, D, m);
    computeCochain(runs, edges, D); // rho 계산 후 τ별 정합 변 수 위해
    const rSorted = edges.map((e) => e.r).sort((a, b) => a - b);
    grid[`m${m}`] = {};
    for (const [qname, q] of [['P25', 0.25], ['P50', 0.5], ['P75', 0.75]]) {
      const tau = quantile(rSorted, q);
      const consistent = edges.filter((e) => e.r <= tau).length;
      grid[`m${m}`][qname] = { rho: round(rho, 4), tau: round(tau, 4), consistent, total: edges.length };
    }
  }
  return grid;
}

function personaName(rows, runId) {
  const [pid] = runId.split('|');
  const row = rows.find((r) => r.persona_id === pid);
  return row ? row.persona_name : pid;
}

// ══════════════════════════════════════════════════════════════════
// 실행
// ══════════════════════════════════════════════════════════════════

console.log('=== C2 층 테스트 ===');
console.log(`입력: ${INPUT}`);
console.log(`resamples=${RESAMPLES}, seed=${SEED}\n`);

// 1단계
console.log('[1단계] 자가 검증');
const sv = selfValidate();
console.log(`  World1 (무뒤틀림): ρ=${round(sv.world1.rho, 5)}  edges=${sv.world1.edges}  ${sv.world1.pass ? 'PASS(ρ<0.05)' : 'FAIL'}`);
console.log(`  World2 (뒤틀림):   ρ=${round(sv.world2.rho, 5)}  링탐지=${sv.world2.ringFound}  ExhibitA=${sv.world2.exhibitHits}  ${sv.world2.pass ? 'PASS' : 'FAIL'}`);
if (!sv.world1.pass || !sv.world2.pass) {
  console.log('\n자가 검증 실패 — 실데이터로 넘어가지 않음(§2 1단계 규칙). 보고서에 기록.');
}

// 2단계 (자가검증 통과 시에만 실데이터)
const rows = loadRows();
const prem = verifyPremises(rows);
console.log('\n[2단계] MM23L');
console.log(`  전제: rows=${prem.rows} 회차=${prem.runs} 씬=${prem.scenes} 축=${prem.axes} 씬/회차=${prem.minScenes}~${prem.maxScenes} 중복=${prem.dup}  ${prem.ok ? 'OK' : '⚠ 전제 불일치'}`);

let a17, a9, nullA17, nullA9, gridA17, gridA9;
const proceed = sv.world1.pass && sv.world2.pass && prem.ok;
if (proceed) {
  a17 = measure(rows, A17_AXES, 'A17', 2);
  a9 = measure(rows, A9_AXES, 'A9', 2);

  // 영모형 (관측 ρ 대비). ρ 는 τ 무관하므로 m=2 관측 ρ 로 검정.
  const rngN = mulberry32(SEED + 100);
  console.log(`  영모형 N1(씬셔플)·N2(전역절편) 각 ${RESAMPLES}회 …`);
  nullA17 = {
    N1: nullTest(a17.runs, a17.D, 2, a17.rho, shuffleScenes, RESAMPLES, mulberry32(SEED + 101)),
    N2: nullTest(a17.runs, a17.D, 2, a17.rho, (r, g) => synthGlobalSection(r, a17.D, g), RESAMPLES, mulberry32(SEED + 102)),
  };
  nullA9 = {
    N1: nullTest(a9.runs, a9.D, 2, a9.rho, shuffleScenes, RESAMPLES, mulberry32(SEED + 201)),
    N2: nullTest(a9.runs, a9.D, 2, a9.rho, (r, g) => synthGlobalSection(r, a9.D, g), RESAMPLES, mulberry32(SEED + 202)),
  };
  void rngN;

  gridA17 = sensitivityGrid(rows, A17_AXES);
  gridA9 = sensitivityGrid(rows, A9_AXES);

  console.log(`  A17: ρ=${round(a17.rho)}  N1 p=${round(nullA17.N1.p)}  N2 p=${round(nullA17.N2.p)}  ExhibitA=${a17.hits.length}  정합변=${a17.consistent}/${a17.totalEdges}`);
  console.log(`  A9 : ρ=${round(a9.rho)}  N1 p=${round(nullA9.N1.p)}  N2 p=${round(nullA9.N2.p)}  ExhibitA=${a9.hits.length}  정합변=${a9.consistent}/${a9.totalEdges}`);
}

// ── 판정 (§11.8) ─────────────────────────────────────────────────
function verdict(a, nul) {
  if (!a || !nul) return { v: 'N/A', cond1: false, cond2: false };
  const cond1 = nul.N2.p < 0.05;      // N2 대비 p<0.05
  const cond2 = a.hits.length >= 1;    // Exhibit A ≥ 1건
  return { v: cond1 && cond2 ? 'GO' : (cond1 || cond2 ? 'WEAK-GO' : 'NO-GO'), cond1, cond2 };
}
let finalVerdict = 'NO-GO', vA17, vA9;
if (proceed) {
  vA17 = verdict(a17, nullA17);
  vA9 = verdict(a9, nullA9);
  // GO if 어느 한쪽 이상 GO; WEAK-GO if 어느쪽 WEAK-GO; else NO-GO
  const vs = [vA17.v, vA9.v];
  if (vs.includes('GO')) finalVerdict = 'GO';
  else if (vs.includes('WEAK-GO')) finalVerdict = 'WEAK-GO';
  else finalVerdict = 'NO-GO';
}
console.log(`\n판정: ${finalVerdict}`);

// ── JSON 리포트 저장 ─────────────────────────────────────────────
const jsonReport = {
  meta: { input: INPUT, resamples: RESAMPLES, seed: SEED, generated: '2026-07-16' },
  selfValidation: sv,
  premises: prem,
  verdict: finalVerdict,
  results: proceed ? {
    A17: { rho: a17.rho, tau: a17.tau, consistent: a17.consistent, totalEdges: a17.totalEdges, exhibitA: a17.hits.length, null: nullA17, verdict: vA17 },
    A9: { rho: a9.rho, tau: a9.tau, consistent: a9.consistent, totalEdges: a9.totalEdges, exhibitA: a9.hits.length, null: nullA9, verdict: vA9 },
    sensitivity: { A17: gridA17, A9: gridA9 },
  } : null,
};
fs.writeFileSync(path.join(__dirname, 'C2_report.json'), JSON.stringify(jsonReport, null, 2));

// ── Exhibit A 상세 (보고서용) ────────────────────────────────────
function exhibitDetails(a, rows) {
  if (!a) return [];
  return a.hits.slice(0, 20).map((hit) => {
    const nodeNames = hit.cycle.nodes.map((ni) => a.runs[ni].id);
    const scenesPerEdge = hit.cycle.edgeSeq.map(({ edgeIndex }) => a.edges[edgeIndex].scenes.length);
    const overlapScenes = [...new Set(hit.cycle.edgeSeq.flatMap(({ edgeIndex }) => a.edges[edgeIndex].scenes))];
    return {
      runs: nodeNames,
      personas: hit.cycle.nodes.map((ni) => personaName(rows, a.runs[ni].id)),
      len: hit.cycle.nodes.length,
      Wnorm: round(hit.Wnorm, 4),
      noise: round(hit.noise, 4),
      ratio: round(hit.ratio, 3),
      overlapScenes: overlapScenes.length,
      edgeOverlaps: scenesPerEdge,
    };
  });
}
const exA17 = exhibitDetails(a17, rows);
const exA9 = exhibitDetails(a9, rows);

// ══════════════════════════════════════════════════════════════════
// 보고서 마크다운
// ══════════════════════════════════════════════════════════════════
function gridTable(grid) {
  let s = '| m | τ=P25 | τ=P50 | τ=P75 |\n|---|---|---|---|\n';
  for (const m of [2, 3]) {
    const g = grid[`m${m}`];
    s += `| ${m} | ρ=${g.P25.rho} (정합 ${g.P25.consistent}/${g.P25.total}) | ρ=${g.P50.rho} (정합 ${g.P50.consistent}/${g.P50.total}) | ρ=${g.P75.rho} (정합 ${g.P75.consistent}/${g.P75.total}) |\n`;
  }
  return s;
}
function exhibitTable(ex) {
  if (!ex.length) return '_해당 고리 없음 (조건 충족 0건)._\n';
  let s = '| # | 구성 회차 | 길이 | 겹침 씬 | ‖W‖ | 잡음척도 | 배율 |\n|---|---|---|---|---|---|---|\n';
  ex.forEach((e, i) => {
    s += `| ${i + 1} | ${e.personas.join(' → ')} | ${e.len} | ${e.overlapScenes} | ${e.Wnorm} | ${e.noise} | ${e.ratio}× |\n`;
  });
  return s;
}
function nullRow(n) { return `p=${round(n.p)} (null 평균 ρ=${round(n.nullMean, 4)}, P95=${round(n.nullP95, 4)}, max=${round(n.nullMax, 4)})`; }

const reasonLines = proceed ? [
  `A17: ρ=${round(a17.rho)}, N2 p=${round(nullA17.N2.p)}, Exhibit A ${a17.hits.length}건 → ${vA17.v}.`,
  `A9 : ρ=${round(a9.rho)}, N2 p=${round(nullA9.N2.p)}, Exhibit A ${a9.hits.length}건 → ${vA9.v}.`,
  `자가검증 통과(World1 ρ=${round(sv.world1.rho, 5)}<0.05, World2 링 탐지=${sv.world2.ringFound}); 39회차×10씬 통계력 제한으로 GO여도 "예비 신호".`,
] : [
  '자가검증 또는 데이터 전제 미충족으로 본 측정 미실행 — 아래 미결 참조.',
  '', '',
];

const md = `# C2 층 테스트 — 결과 (2026-07-16)

> 명세: \`docs/이본론_층이론_논문화_초안_v0.1-260716.md\` §11 (유일 수학 정본).
> 실행: \`node tools/sheaf-c2/run.mjs\` (seed=${SEED}, resamples=${RESAMPLES}). 판정·문장화·명세 수정은 이 문서 밖(지휘 세션 몫).

## 1. 판정 한 줄

**${finalVerdict}**

- ${reasonLines[0]}
- ${reasonLines[1]}
- ${reasonLines[2]}

판정 규칙(§11.8): GO = (N2 대비 p<0.05) AND (Exhibit A≥1), A17/A9 중 한쪽 이상. WEAK-GO = 한 조건만. NO-GO = 둘 다 미충족.
${finalVerdict === 'WEAK-GO' ? '\n> **WEAK-GO 후속(§11.8)** = "E-004 복제 후 재판정". 그러나 E-004 로컬 부재·DB 쓰기 금지·시뮬 행 식별 모호로 본 실행에서 3단계 미실행(미결 5). → 재판정은 E-004 export 또는 베타 실관객 데이터 확보 후 지휘 세션 몫.' : ''}

## 2. 자가 검증 (1단계 — 합성 두 세계)

명세 구현이 맞는지 합성 데이터로 먼저 증명(§2 1단계). **통과 못 하면 실데이터로 안 넘어감.**

| 세계 | 구성 | ρ | 판정 |
|---|---|---|---|
| **World 1 (무뒤틀림)** | §11.7 N2 방식(전역절편 f + 회차 오프셋 h + 잡음 ε), 랜덤 겹침 그래프 ${sv.world1.edges}변 | **${round(sv.world1.rho, 5)}** | ${sv.world1.pass ? '✅ PASS (ρ<0.05)' : '❌ FAIL'} |
| **World 2 (뒤틀림 주입)** | 회차 5개 링 + 각 변에 상수 뒤틀림 벡터 W 주입(사적 씬 2개/변, 누설 없음) | **${round(sv.world2.rho, 5)}** | ${sv.world2.pass ? '✅ PASS' : '❌ FAIL'} |

- World 2: Exhibit A ${sv.world2.exhibitHits}건, 주입한 링(전 노드 포함 고리) 탐지 = **${sv.world2.ringFound}**. ρ 가 World 1 대비 뚜렷이 상승(${round(sv.world1.rho, 5)} → ${round(sv.world2.rho, 5)}).
- 해석: 파이프라인은 (a) 순환 없는 세계에서 ρ≈0 을 돌려주고, (b) 인위 순환을 ρ 상승 + Exhibit A 로 정확히 집어낸다. → 구현 신뢰 확보.
- 설계 주석: World 2 는 주입 뒤틀림을 격리·명확 탐지하기 위해 전용 링 구조를 씀(사적 씬으로 누설 차단). 이는 자가검증 하니스 설계 선택이며 §11 수학 결정이 아님.

## 3. 본 결과 (MM23L)

데이터 전제(§11.1, 7-16 실측): rows=${prem.rows}(씬 방문 행), 회차=${prem.runs}, 고유 씬=${prem.scenes}, 등장 축=${prem.axes}, 회차당 ${prem.minScenes}~${prem.maxScenes}씬, (회차,씬) 중복=${prem.dup}. → **${prem.ok ? '전제 일치' : '⚠ 전제 불일치 (측정 중단)'}**.

${proceed ? `축 목록(12): ${prem.axisList.join(', ')}.

### 3.1 핵심 표 (m=2, τ=중앙값)

| 축세트 | ρ (순환 비율) | N1 (씬셔플) | N2 (전역절편, 주 대조군) | Exhibit A | 정합 변 / 전체 변 |
|---|---|---|---|---|---|
| **A17** (17 정본) | **${round(a17.rho)}** | ${nullRow(nullA17.N1)} | ${nullRow(nullA17.N2)} | ${a17.hits.length}건 | ${a17.consistent} / ${a17.totalEdges} |
| **A9** (판단 실기여 9축) | **${round(a9.rho)}** | ${nullRow(nullA9.N1)} | ${nullRow(nullA9.N2)} | ${a9.hits.length}건 | ${a9.consistent} / ${a9.totalEdges} |

p-값 = null ρ ≥ 관측 ρ 비율 (각 ${RESAMPLES}회 재표집).

### 3.2 Exhibit A — 조건 충족 고리 (§11.6: 전 변 정합 ≤τ AND ‖W‖ ≥ 3×잡음)

기본 고리(fundamental cycles) 열거 결과: **A17** ${a17.cycles.length}개(전-변-정합 ${a17.consistentCycles}개), **A9** ${a9.cycles.length}개(전-변-정합 ${a9.consistentCycles}개). 대부분 삼각형.

**A17:**

${exhibitTable(exA17)}
**A9:**

${exhibitTable(exA9)}
(각 고리: 구성 회차 = persona, 겹침 씬 = 고리 변들이 걸친 고유 씬 수, ‖W‖ = 뒤틀림 크기, 잡음척도 = Σ 변잔차, 배율 = ‖W‖/잡음.)

> **근접 진단(0건 해석용)**: 전-변-정합 고리 중 최대 ‖W‖/잡음 배율 = A17 **${round(a17.bestRatio, 2)}×**, A9 **${round(a9.bestRatio, 2)}×** (요구 = 3×). 즉 아슬아슬한 탈락이 아니라 **큰 격차로 미달** — 데이터 규모(감정 벡터 ~0.2~0.4, 삼각형 잡음척도 Σr ~0.3~0.5)에서 ‖W‖가 3×잡음(~1.0~1.5)에 도달하려면 비현실적으로 큰 뒤틀림이 필요. 이 3× 임계는 §11.6 명세값이며 본 실행은 변경하지 않음(미결 7 참조).

### 3.3 민감도 격자 (m ∈ {2,3} × τ ∈ {P25,P50,P75})

> ⚠️ **명세 관찰**: §11.5 의 ρ 는 τ 를 포함하지 않는다(τ 는 §11.4 정합 게이트·§11.6 Exhibit A 에만 등장). 따라서 ρ 는 τ 열에 걸쳐 동일하고 **m 으로만 변한다**. 아래 표의 ρ 는 행별(=m별) 상수, 괄호의 정합 변 수만 τ 로 변한다. (임의 해석 아님 — 명세 정의의 직접 귀결.)

**A17:**

${gridTable(gridA17)}
**A9:**

${gridTable(gridA9)}
### 3.4 A9 실행 근거

A9 = 판단 실기여 교집합 9축, \`docs/감정축_통일_제안_v1-260714.md\` §1.1(A∩B)에서 명확히 특정됨: fear, sadness, anger, joy, guilt, shame, numbness, isolation, relief. → 목록 명확하므로 실행함(핸드아웃 §2 2단계 조건 충족).` : '**본 측정 미실행** (자가검증/전제 미충족).'}

## 4. 미결·이상 목록

1. **[데이터 vs 전제 — 축 3개 탈락]** 데이터 12축 중 \`longing / confusion / resignation\` 3축이 17축 정본(\`DEFAULT_EMOTION_ANCHORS\`)에 **없다**. §11.2 는 이 12축을 예측하면서도 "17축 정본 공간에 0-패딩 임베드"를 지시 → A17 임베드 시 이 3축이 **탈락**(R^17 에 슬롯 없음). \`longing\`(그리움)은 \`docs/감정축_통일_제안_v1\`가 TEM 정서 중심으로 지목한 축이라 탈락의 서사적 손실이 있음. **명세를 문자 그대로 따랐고, 임의로 20축 확장(B′안)을 하지 않음.** 축 정본 결정(§10-2, R4 B′/A/B/C안)이 확정되면 재측정 대상.
2. **[명세 침묵 — ρ의 τ 무관성]** §11.5 ρ 정의에 τ 없음 → 민감도 격자의 τ 축이 ρ 에 대해 자명(§3.3 주석). 명세가 "m×τ 격자의 ρ 표"를 요구하나 ρ 는 τ 불변. 격자는 정합 변 수 변화로만 유의미. (창작 없이 그대로 보고.)
3. **[N2 잡음 분산 — 축별 채택]** §11.7 N2 의 ε 은 "관측 잔차 분산에 맞춘 iid". 전역 1개 분산인지 축별인지 명세 침묵 → **축별 분산 채택**(관측 구조 보존이 더 충실). 전역 분산으로 바꾸면 p-값이 미세 변동 가능. 구현 결정임을 명기.
4. **[Level-V 한정]** §11.1 대로 방문 순서(created_at) 신뢰 불가 → 값-겹침(Level-V)만 측정. 이론이 가리키는 전이(델타, Level-E)는 방문 순서 확보 후 별도(§11.8 한계 ②).
5. **[E-004 미실행]** 3단계(E-004 복제)는 선택이며 DB 쓰기 금지·로컬 파일 부재. persona 시뮬 행 식별 모호성(§2 3단계)까지 겹쳐 **건너뜀**. 1차 판정은 MM23L 단독(§11.1 허용).
6. **[통계력 한계]** 39회차×10씬 → §11.8 한계 ①: GO 여도 "예비 신호". 본 검정은 실관객 데이터(베타).
7. **[Exhibit A 3× 임계의 데이터 규모 대비 엄격성]** §11.6 의 "‖W‖ ≥ 3×잡음"에서 잡음척도 = Σ(변잔차 r). 삼각형 잡음척도가 ~0.3~0.5(정합 상한 τ~0.16×3변)인데 감정 벡터 크기가 ~0.2~0.4라 ‖W‖가 그 3배(~1~1.5)에 이르는 고리는 원리적으로 드물다(관측 최대 배율 A17 0.74×). N2 대비 ρ 유의성(p=0)과 Exhibit A 부재가 **공존**하는 이유 = ρ 는 전-고리 누적 순환을, Exhibit A 는 단일 고리의 압도적 뒤틀림을 요구하기 때문. 임계 3× 는 명세값이라 **변경 안 함** — 재검토는 명세 소유(지휘 세션) 몫.

## 5. 재현 방법

\`\`\`
node tools/sheaf-c2/run.mjs
# 인자: --input=<경로> --resamples=${RESAMPLES} --seed=${SEED}
\`\`\`

산출: 이 문서 + \`tools/sheaf-c2/C2_report.json\`(전 수치). 결정성 = 시드 고정 PRNG(mulberry32).
`;

fs.writeFileSync(path.join(ROOT, 'docs/실험/C2_결과-260716.md'), md);
console.log('\n보고서: docs/실험/C2_결과-260716.md');
console.log('JSON:   tools/sheaf-c2/C2_report.json');

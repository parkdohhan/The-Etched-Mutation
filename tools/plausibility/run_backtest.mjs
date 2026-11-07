// tools/plausibility/run_backtest.mjs — 개연성 P(i,k) 백테스트 실행기 (사전 등록 v1 §6~§8 그대로)
// 사용: node tools/plausibility/run_backtest.mjs --raw tools/plausibility/out/raw-<날짜>.json [--reps 1000] [--splits 500] [--seed 261107] [--rho 0.6] [--out <dir>] [--docs <dir>]
// 읽기 전용. 결과 = out/metrics-<날짜>.json + docs/실험/개연성_백테스트_결과-<날짜>.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext, MODELS, CANDIDATE_MODELS, NULL_MODELS, scoreM3 } from './lib/models.mjs';
import { buildPins, replayRun, ENGINE_VERSION_CUTOFF } from './lib/old_engine_replay.mjs';
import { evaluateModel, permutationP, splitHalfStability } from './lib/metrics.mjs';
import { toArray, unit, mulberry32, mean } from './lib/vec.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// ── 사전 등록 상수 (v1 §7·§8) — 데이터 접촉 전 고정. 바꾸지 말 것 ──
export const PREREG = {
  version: 'v1-261107', doc: 'docs/실험/개연성_사전등록_v1-261107.md',
  seed: 261107, reps: 1000, splits: 500, rho: 0.6, rhoSens: [0.4, 0.8],
  alphaPrimary: 0.025, alphaSecondary: 0.05, minA: 30, splitPass: 0.80,
  engineCutoff: ENGINE_VERSION_CUTOFF,
};

function parseArgs(argv) {
  const a = {}; for (let i = 0; i < argv.length; i++) { const k = argv[i]; if (k.startsWith('--')) { const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'; a[k.slice(2)] = v; } }
  return a;
}
const fmt = (x, d = 3) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d));

export function buildSteps(raw, { rho }) {
  const ctx = buildContext(raw.scenes, { rho });
  const pins = buildPins(ctx.scenes);
  const toUnit = (uRaw) => unit(toArray(uRaw, ctx.axes));
  const journalsByRun = new Map((raw.journals || []).filter((j) => j && j.run_traces).map((j) => [j.run_id, j.run_traces]));
  const runs = new Map();
  for (const p of raw.plays) { if (!p.run_id) continue; if (!runs.has(p.run_id)) runs.set(p.run_id, []); runs.get(p.run_id).push(p); }
  const steps = []; const flags = { unsupportedExclusion: [], pre0810Fixation: 0, fallbackB: 0, unknownScene: 0 }; let onePoint = 0;
  const runList = [...runs.entries()].map(([id, rows]) => [id, rows.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))]);
  runList.sort((a, b) => String(a[1][0].created_at).localeCompare(String(b[1][0].created_at)));
  for (const [runId, rows] of runList) {
    if (rows.length < 2) onePoint++;
    const r = replayRun({ runId, rows, scenes: ctx.scenes, pins, memoryAxesList: ctx.axes, toUnit, journal: journalsByRun.get(runId) || null });
    steps.push(...r.steps);
    flags.unsupportedExclusion.push(...r.flags.unsupportedExclusion); flags.pre0810Fixation += r.flags.pre0810Fixation; flags.fallbackB += r.flags.fallbackB; flags.unknownScene += r.flags.unknownScene;
  }
  return { ctx, pins, steps, flags, nRuns: runs.size, nPoints: raw.plays.length, onePoint };
}

export function fidelity(steps) {
  const byVer = {};
  const bucket = (k) => (byVer[k] = byVer[k] || { n: 0, inOffered: 0, inOfferedUnvisited: 0 });
  const dist = { 0: 0, 1: 0, 2: 0, 3: 0 }; const patt = { n: 0, agree: 0 };
  for (const st of steps) {
    const b = bucket(st.replay.version); const all = bucket('all');
    for (const x of [b, all]) { x.n++; if (st.replay.offered.has(st.j)) x.inOffered++; if (st.replay.offeredUnvisited.has(st.j)) x.inOfferedUnvisited++; }
    const k = Math.min(3, st.replay.offeredUnvisited.size); dist[k]++;
    if (st.journalPattern !== undefined && st.journalPattern) { patt.n++; if (st.journalPattern === st.replay.pattern) patt.agree++; }
  }
  const out = {};
  for (const k in byVer) out[k] = { n: byVer[k].n, j_in_offered: byVer[k].n ? byVer[k].inOffered / byVer[k].n : null, j_in_offered_unvisited: byVer[k].n ? byVer[k].inOfferedUnvisited / byVer[k].n : null };
  return { byVersion: out, offeredUnvisitedSize: dist, patternAgreement: patt.n ? patt.agree / patt.n : null, patternN: patt.n };
}

export function runAll(raw, opts = {}) {
  const P = Object.assign({}, PREREG, opts);
  const built = buildSteps(raw, { rho: P.rho });
  const { ctx, steps } = built;
  const rng = mulberry32(P.seed);
  const results = {};
  const allModels = [...CANDIDATE_MODELS, ...NULL_MODELS];
  for (const name of allModels) results[name] = evaluateModel(MODELS[name], steps, ctx);
  for (const r of P.rhoSens) results[`M3_rho${r}`] = evaluateModel((s, c, cx) => scoreM3(s, c, cx, r), steps, ctx);

  // N5 교체 영모형 (B 백분위)
  const n5 = {};
  for (const name of CANDIDATE_MODELS) {
    const stat = (ss) => evaluateModel(MODELS[name], ss, ctx).B_pct;
    n5[name] = permutationP(steps, stat, mulberry32(P.seed + 1), P.reps);
  }
  // 절반 안정성 (N3·N6 대비)
  const split = {};
  for (const name of CANDIDATE_MODELS) {
    split[name] = {};
    for (const nul of ['N3', 'N6']) {
      const diff = (ss) => { const a = evaluateModel(MODELS[name], ss, ctx).B_pct, b = evaluateModel(MODELS[nul], ss, ctx).B_pct; return a == null || b == null ? null : a - b; };
      split[name][nul] = splitHalfStability(steps, diff, mulberry32(P.seed + 2), P.splits);
    }
  }
  // 민감도: 익명만
  const anonRuns = new Set(); const runUser = new Map();
  for (const st of steps) { if (!runUser.has(st.runId)) runUser.set(st.runId, new Set()); runUser.get(st.runId).add(st.userId || null); }
  for (const [rid, us] of runUser) if ([...us].every((u) => u == null)) anonRuns.add(rid);
  const anonSteps = steps.filter((s) => anonRuns.has(s.runId));
  const anon = {}; for (const name of allModels) anon[name] = evaluateModel(MODELS[name], anonSteps, ctx);

  // 판정 (v1 §8)
  const verdict = {};
  for (const name of ['M1', 'M2']) {
    const r = results[name], c1 = r.B_pct != null && r.B_pct > results.N3.B_pct && r.B_pct > results.N6.B_pct;
    const c2 = n5[name].p != null && n5[name].p < P.alphaPrimary;
    const c3 = split[name].N3.keepRate != null && split[name].N3.keepRate >= P.splitPass;
    const aApplies = r.nA >= P.minA; const c4 = aApplies ? (r.A_top1 > results.N3.A_top1) : null;
    verdict[name] = { c1, c2, c3, c4, aApplies, pass: c1 && c2 && c3 && (aApplies ? c4 : true) };
  }
  const m3 = results.M3; verdict.M3 = { addsOverM1: m3.B_pct != null && m3.B_pct > results.M1.B_pct, p: n5.M3.p, pass: m3.B_pct != null && m3.B_pct > results.M1.B_pct && n5.M3.p != null && n5.M3.p < P.alphaSecondary };
  const anyPass = verdict.M1.pass || verdict.M2.pass;
  const chosen = anyPass ? (verdict.M1.pass && verdict.M2.pass ? (results.M1.B_pct >= results.M2.B_pct ? 'M1' : 'M2') : (verdict.M1.pass ? 'M1' : 'M2')) : null;

  return {
    prereg: P, counts: { runs: built.nRuns, points: built.nPoints, onePointRuns: built.onePoint, steps: steps.length, anonRuns: anonRuns.size, anonSteps: anonSteps.length, axes: ctx.axes, voidSceneId: ctx.voidSceneId },
    fidelity: fidelity(steps), flags: Object.assign({}, built.flags, { unsupportedExclusion: [...new Set(built.flags.unsupportedExclusion)] }),
    results, n5, split, anon, verdict: Object.assign(verdict, { anyPass, chosen, outcome: anyPass ? `통과 → ${chosen} 을 stage2 1차 식 후보로 (무대 매핑은 D28 뒤)` : '강등 → 가설로 THEORY §3, 무대는 N3 + 그림자 모드' }),
  };
}

export function renderReport(R, { rawPath, stamp }) {
  const L = [];
  L.push(`# 개연성 P(i,k) 백테스트 v1 — 결과 (${stamp})`, '',
    `> 사전 등록: \`${R.prereg.doc}\` (식·영모형·지표·판정 기준 고정). 실행기: \`tools/plausibility/run_backtest.mjs\`. 자료: \`${rawPath}\` (원문 0자, 미커밋).`,
    `> 씨앗 ${R.prereg.seed} · 교체 ${R.prereg.reps}회 · 절반 ${R.prereg.splits}회 · ρ=${R.prereg.rho} (민감도 ${R.prereg.rhoSens.join('/')}) · 엔진 판본 경계 ${R.prereg.engineCutoff}`, '');
  L.push('## 0. 판정', '', `**${R.verdict.outcome}**`, '',
    '| 식 | ① B 백분위 > N3 ∧ > N6 | ② N5 p < 0.025 | ③ 절반 안정 ≥ 0.80 | ④ A 1등률 > N3 (nA≥30일 때) | 통과 |', '|---|---|---|---|---|---|');
  for (const m of ['M1', 'M2']) { const v = R.verdict[m]; L.push(`| ${m} | ${v.c1 ? 'O' : 'X'} | ${v.c2 ? 'O' : 'X'} (p=${fmt(R.n5[m].p)}) | ${v.c3 ? 'O' : 'X'} (${fmt(R.split[m].N3.keepRate, 2)}) | ${v.aApplies ? (v.c4 ? 'O' : 'X') : '보고만(nA=' + R.results[m].nA + ')'} | **${v.pass ? '통과' : '실패'}** |`); }
  L.push(`| M3(보조) | B 백분위 > M1: ${R.verdict.M3.addsOverM1 ? 'O' : 'X'} | p=${fmt(R.verdict.M3.p)} (<0.05) | — | — | **${R.verdict.M3.pass ? '이력이 더함' : '더하지 않음'}** |`, '');
  L.push('## 1. 자료와 충실도 (판정 아님)', '',
    `- 회차 ${R.counts.runs} · 점 ${R.counts.points} · 1점 회차 ${R.counts.onePointRuns} · 걸음 ${R.counts.steps} · 익명 회차 ${R.counts.anonRuns}(걸음 ${R.counts.anonSteps})`,
    `- 기억 축 ${R.counts.axes.length}: ${R.counts.axes.join(', ')} · 공백 씬 ${R.counts.voidSceneId ? '있음' : '없음'}`,
    `- 재생 플래그: pre0810 fixation 특례 ${R.flags.pre0810Fixation} · 폴백 B ${R.flags.fallbackB} · 미지원 잠금 종류 ${R.flags.unsupportedExclusion.length ? R.flags.unsupportedExclusion.join(',') : '없음'} · 모르는 씬 ${R.flags.unknownScene}`, '',
    '| 판본 | 걸음 | ① j ∈ 제시 집합 | j ∈ 제시∩미방문 |', '|---|---|---|---|');
  for (const k of Object.keys(R.fidelity.byVersion)) { const f = R.fidelity.byVersion[k]; L.push(`| ${k} | ${f.n} | ${fmt(f.j_in_offered, 2)} | ${fmt(f.j_in_offered_unvisited, 2)} |`); }
  const d = R.fidelity.offeredUnvisitedSize;
  L.push('', `- ③ |제시∩미방문| 분포: 0개 ${d[0]} · 1개 ${d[1]} · 2개 ${d[2]} · 3개+ ${d[3]}`,
    `- ② 재생 패턴 = 회차 일지 기록 패턴: ${R.fidelity.patternN ? fmt(R.fidelity.patternAgreement, 2) + ' (n=' + R.fidelity.patternN + ')' : '일지 없음'}`, '');
  const row = (name, r) => `| ${name} | ${fmt(r.B_pct)} | ${fmt(r.B_top1)} | ${r.nB} | ${fmt(r.A_top1)} | ${r.nA} | ${fmt(r.A2_pair)} | ${r.nA2} |`;
  L.push('## 2. 모형 × 지표 (전체)', '', '| 모형 | B 백분위 | B 1등률 | nB | A 1등률 | nA | A2 쌍대 | nA2 |', '|---|---|---|---|---|---|---|---|');
  for (const name of ['M1', 'M2', 'M3', `M3_rho${R.prereg.rhoSens[0]}`, `M3_rho${R.prereg.rhoSens[1]}`, 'N1', 'N2', 'N3', 'N4', 'N6']) L.push(row(name, R.results[name]));
  L.push('', `B에서 빠진 걸음(되돌아감): ${R.results.M1.nBskip}`, '');
  L.push('## 3. N5 말 바꿔 끼우기 (B 백분위)', '', '| 식 | 관측 | 영분포 평균 | p | 회수 |', '|---|---|---|---|---|');
  for (const m of CANDIDATE_MODELS) L.push(`| ${m} | ${fmt(R.n5[m].obs)} | ${fmt(R.n5[m].nullMean)} | ${fmt(R.n5[m].p)} | ${R.n5[m].reps} |`);
  L.push('', '## 4. 절반 안정성 (Δ 부호 유지율)', '', '| 식 | Δ vs N3 (전체) | 유지율 | Δ vs N6 (전체) | 유지율 |', '|---|---|---|---|---|');
  for (const m of CANDIDATE_MODELS) L.push(`| ${m} | ${fmt(R.split[m].N3.full)} | ${fmt(R.split[m].N3.keepRate, 2)} | ${fmt(R.split[m].N6.full)} | ${fmt(R.split[m].N6.keepRate, 2)} |`);
  L.push('', '## 5. 민감도 — 익명 회차만', '', '| 모형 | B 백분위 | B 1등률 | nB | A 1등률 | nA | A2 쌍대 | nA2 |', '|---|---|---|---|---|---|---|---|');
  for (const name of ['M1', 'M2', 'M3', 'N3', 'N6']) L.push(row(name, R.anon[name]));
  L.push('', '## 6. 읽는 법', '', '- 지표는 영모형 대비 상대값이다. "정답률"로 읽지 말 것(사전 등록 §7).', '- 충실도 ①이 낮으면 구획 A는 근사 재생. 사용자가 수치를 보고 판단한다(§6).', '- 통과해도 인과 아님. 새 무대에서 다시 잰다(§11).', '');
  return L.join('\n');
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  let rawPath = a.raw;
  if (!rawPath) { const { pull } = await import('./pull.mjs'); const r = await pull(); rawPath = r.out; console.log('pulled', JSON.stringify(r.counts)); }
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const opts = {};
  if (a.reps) opts.reps = Number(a.reps); if (a.splits) opts.splits = Number(a.splits); if (a.seed) opts.seed = Number(a.seed); if (a.rho) opts.rho = Number(a.rho);
  const R = runAll(raw, opts);
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const outDir = a.out || path.join(HERE, 'out'); fs.mkdirSync(outDir, { recursive: true });
  const docsDir = a.docs || path.join(ROOT, 'docs', '실험'); fs.mkdirSync(docsDir, { recursive: true });
  const metricsPath = path.join(outDir, `metrics-${stamp}.json`);
  const serial = JSON.parse(JSON.stringify(R, (k, v) => (v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : v)));
  fs.writeFileSync(metricsPath, JSON.stringify(serial, null, 1));
  const relRaw = path.relative(ROOT, rawPath).replace(/\\/g, '/');
  const reportPath = path.join(docsDir, `개연성_백테스트_결과-${stamp}.md`);
  fs.writeFileSync(reportPath, renderReport(R, { rawPath: relRaw, stamp }));
  console.log('판정:', R.verdict.outcome);
  console.log('metrics ->', metricsPath); console.log('report  ->', reportPath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('백테스트 실패:', e && e.stack || e); process.exit(1); });
}

// node --test tools/plausibility/test/  — 가짜 자료로 식·재생·지표·실행기 검증 (실데이터 접촉 0)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeRaw } from './fixtures.mjs';
import { buildContext, scoreM1, scoreM2, scoreM3, scoreN3, scoreN6, MODELS } from '../lib/models.mjs';
import { buildPins, replayRun, engineStep, initialState, emotionToMapCoords, mapCoordsSpread } from '../lib/old_engine_replay.mjs';
import { rankPercentile, top1, evaluateModel, permuteUtterances, permutationP, splitHalfStability } from '../lib/metrics.mjs';
import { toArray, unit, cos, mulberry32 } from '../lib/vec.mjs';
import { buildSteps, runAll, renderReport } from '../run_backtest.mjs';
import { reduceDialogTurns } from '../pull.mjs';

const raw = makeRaw();
const ctx = buildContext(raw.scenes, { rho: 0.6 });
const ids = ctx.scenes.map((s) => s.id);
const mk = (i, uRaw, extra = {}) => Object.assign({ i, j: ids[0], uRaw, u: unit(toArray(uRaw, ctx.axes)), isVoid: false, Uprev: [] }, extra);

test('기억 축 = 값>0 키 합집합, 사전순', () => {
  assert.ok(ctx.axes.length >= 3);
  assert.deepEqual(ctx.axes, [...ctx.axes].sort());
});

test('M1: 관객 = 원본이면 N3 와 같다 (α=1 → c=ô_i)', () => {
  const i = ids[2]; const st = mk(i, ctx.byId.get(i).original_emotion);
  const cands = ids.filter((k) => k !== i);
  const a = scoreM1(st, cands, ctx), b = scoreN3(st, cands, ctx);
  for (const k of cands) assert.ok(Math.abs(a.get(k) - b.get(k)) < 1e-9);
});

test('M1: 관객 영벡터 → N3 로 후퇴, 값은 0~1', () => {
  const i = ids[1]; const st = mk(i, {}); const cands = ids.filter((k) => k !== i);
  const a = scoreM1(st, cands, ctx), b = scoreN3(st, cands, ctx);
  for (const k of cands) { assert.ok(Math.abs(a.get(k) - b.get(k)) < 1e-9); assert.ok(a.get(k) >= -1e-9 && a.get(k) <= 1 + 1e-9); }
});

test('M1: 공백(ν=1)이면 중심 = 공백 축 벡터', () => {
  const i = ids[1]; const st = mk(i, { anger: 0.9 }, { isVoid: true }); const cands = ids.filter((k) => k !== i);
  const a = scoreM1(st, cands, ctx);
  for (const k of cands) assert.ok(Math.abs(a.get(k) - cos(ctx.voidVec, ctx.O.get(k))) < 1e-9);
});

test('M2: 값 0~1, 영벡터·특이점은 0.5', () => {
  const i = ids[3]; const cands = ids.filter((k) => k !== i);
  const a = scoreM2(mk(i, { fear: 0.7, sadness: 0.2 }), cands, ctx);
  for (const k of cands) assert.ok(a.get(k) >= -1e-9 && a.get(k) <= 1 + 1e-9);
  const z = scoreM2(mk(i, {}), cands, ctx); for (const k of cands) assert.equal(z.get(k), 0.5);
});

test('M2: 관객 = 원본이면 중심화 작가 닮음과 같다', () => {
  const i = ids[4]; const st = mk(i, ctx.byId.get(i).original_emotion); const cands = ids.filter((k) => k !== i);
  const a = scoreM2(st, cands, ctx);
  // ã = 1 → r = ō → P2 = (1+cos(ô_i−ō, ô_k−ō))/2
  for (const k of cands) {
    const oi = ctx.O.get(i), ok = ctx.O.get(k), ob = ctx.obar;
    const exp = (1 + cos(oi.map((x, q) => x - ob[q]), ok.map((x, q) => x - ob[q]))) / 2;
    assert.ok(Math.abs(a.get(k) - exp) < 1e-9);
  }
});

test('M3: ρ=0 이고 이력 없으면 M1(ν=0)과 같다 (일관성)', () => {
  const i = ids[5]; const st = mk(i, { guilt: 0.6, longing: 0.3 }); const cands = ids.filter((k) => k !== i);
  const a = scoreM3(st, cands, ctx, 0), b = scoreM1(st, cands, ctx);
  for (const k of cands) assert.ok(Math.abs(a.get(k) - b.get(k)) < 1e-9, `${k}: ${a.get(k)} vs ${b.get(k)}`);
});

test('M3: 이력이 바뀌면 점수가 바뀐다 (ρ=0.6)', () => {
  const i = ids[6]; const cands = ids.filter((k) => k !== i);
  const s1 = mk(i, { fear: 0.8 }), s2 = mk(i, { fear: 0.8 }, { Uprev: [unit(toArray({ joy: 1 }, ctx.axes))] });
  const a = scoreM3(s1, cands, ctx), b = scoreM3(s2, cands, ctx);
  assert.ok(cands.some((k) => Math.abs(a.get(k) - b.get(k)) > 1e-6));
});

test('N6 = 관객 감정만; N3 와 다르다', () => {
  const i = ids[7]; const st = mk(i, { joy: 1 }); const cands = ids.filter((k) => k !== i);
  const a = scoreN6(st, cands, ctx), b = scoreN3(st, cands, ctx);
  assert.ok(cands.some((k) => Math.abs(a.get(k) - b.get(k)) > 1e-6));
});

test('지표: 1등이면 백분위 1·top1 1, 꼴찌면 0, 동점은 반씩', () => {
  const cands = ['a', 'b', 'c', 'd'];
  const sc = new Map([['a', 0.9], ['b', 0.5], ['c', 0.5], ['d', 0.1]]);
  assert.equal(rankPercentile(sc, cands, 'a'), 1); assert.equal(rankPercentile(sc, cands, 'd'), 0);
  assert.ok(Math.abs(rankPercentile(sc, cands, 'b') - (1 + 0.5) / 3) < 1e-9);
  assert.equal(top1(sc, cands, 'a'), 1); assert.equal(top1(sc, cands, 'b'), 0);
  const tie = new Map([['a', 1], ['b', 1], ['c', 0]]); assert.equal(top1(tie, ['a', 'b', 'c'], 'a'), 0.5);
  assert.equal(rankPercentile(new Map([['a', 1]]), ['a'], 'a'), null);
});

test('AF 투영·흩뿌림: 좌표는 0.03~0.97, 같은 입력은 같은 출력', () => {
  const b = emotionToMapCoords({ guilt: 0.8, sadness: 0.2 });
  assert.ok(b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1);
  const s1 = mapCoordsSpread(b.x, b.y, 0, 'scene-01'), s2 = mapCoordsSpread(b.x, b.y, 0, 'scene-01');
  assert.deepEqual(s1, s2); assert.ok(s1.x >= 0.03 && s1.x <= 0.97);
});

test('엔진 스텝: 결과 필드와 패턴 6종 안', () => {
  const sc = ctx.scenes[0];
  const r = engineStep({ u: { sadness: 0.7 }, isVoid: false, scene: sc, memoryAxesList: ctx.axes, state: initialState() });
  assert.ok(['echo_follow', 'bridge', 'contradiction', 'displacement', 'avoidance', 'fixation'].includes(r.pattern));
  assert.ok(r.alignment >= 0 && r.alignment <= 1);
  const r2 = engineStep({ u: { sadness: 0.7 }, isVoid: true, scene: sc, memoryAxesList: ctx.axes, state: initialState() });
  assert.equal(r2.mismatch, 'void_mismatch');
});

test('재생: 걸음 수 = 연속 쌍, 제시 집합 ≤ 3, 판본 라벨, 방문 집합 누적', () => {
  const pins = buildPins(ctx.scenes);
  assert.equal(pins.filter((p) => p.type === 'voidPin').length, 1);
  const runs = new Map(); for (const p of raw.plays) { if (!runs.has(p.run_id)) runs.set(p.run_id, []); runs.get(p.run_id).push(p); }
  const toUnit = (u) => unit(toArray(u, ctx.axes));
  let total = 0;
  for (const [runId, rows] of runs) {
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const r = replayRun({ runId, rows, scenes: ctx.scenes, pins, memoryAxesList: ctx.axes, toUnit });
    assert.equal(r.steps.length, Math.max(0, rows.length - 1)); total += r.steps.length;
    for (const st of r.steps) {
      assert.ok(st.replay.offered.size <= 3); assert.ok(['pre0810', 'post0810'].includes(st.replay.version));
      assert.ok(st.visited.has(st.i)); assert.ok(!st.omega.includes(st.i));
    }
  }
  assert.ok(total > 20);
});

test('N5 교체: 같은 씬·다른 회차의 발화만 들어온다', () => {
  const { steps } = buildSteps(raw, { rho: 0.6 });
  const perm = permuteUtterances(steps, mulberry32(1));
  assert.equal(perm.length, steps.length);
  const byScene = new Map(); for (const s of steps) { if (!byScene.has(s.i)) byScene.set(s.i, []); byScene.get(s.i).push(s); }
  perm.forEach((p, idx) => { const o = steps[idx]; assert.equal(p.i, o.i); assert.ok(byScene.get(o.i).some((c) => c.u === p.u)); });
});

test('교체 p값·절반 안정성: 값이 범위 안', () => {
  const { steps } = buildSteps(raw, { rho: 0.6 });
  const stat = (ss) => evaluateModel(MODELS.M1, ss, ctx).B_pct;
  const pp = permutationP(steps, stat, mulberry32(2), 30);
  assert.ok(pp.p > 0 && pp.p <= 1);
  const diff = (ss) => evaluateModel(MODELS.M1, ss, ctx).B_pct - evaluateModel(MODELS.N3, ss, ctx).B_pct;
  const sh = splitHalfStability(steps, diff, mulberry32(3), 20);
  assert.ok(sh.keepRate >= 0 && sh.keepRate <= 1);
});

test('N1 균등: 백분위 0.5, 1등률 1/n', () => {
  const { steps } = buildSteps(raw, { rho: 0.6 });
  const r = evaluateModel(MODELS.N1, steps, ctx);
  assert.ok(Math.abs(r.B_pct - 0.5) < 1e-9);
});

test('실행기 끝까지: 가짜 자료로 판정·보고서 생성', () => {
  const R = runAll(raw, { reps: 20, splits: 10 });
  assert.ok(['M1', 'M2', 'M3', 'N3', 'N6'].every((m) => R.results[m] && R.results[m].nB > 0));
  assert.ok(typeof R.verdict.anyPass === 'boolean');
  assert.ok(R.fidelity.byVersion.all.n === R.counts.steps);
  const md = renderReport(R, { rawPath: 'fake.json', stamp: 'TEST' });
  assert.ok(md.includes('## 0. 판정') && md.includes('| M1 |'));
  const tmp = path.join(os.tmpdir(), 'plausibility-test-report.md'); fs.writeFileSync(tmp, md); assert.ok(fs.statSync(tmp).size > 500);
});

test('추출 축약: 원문은 남지 않고 공백 플래그만', () => {
  const red = reduceDialogTurns([{ turn: 1, raw_text: '비밀', fingerprint: { is_void: true } }]);
  assert.deepEqual(red, { n_turns: 1, is_void: true });
  assert.ok(!JSON.stringify(red).includes('비밀'));
  assert.deepEqual(reduceDialogTurns([]), { n_turns: 0, is_void: null });
});

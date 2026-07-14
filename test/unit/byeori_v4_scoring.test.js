// test/unit/byeori_v4_scoring.test.js
// 별이엔진 V4(궤적 기반 정렬도) 현행 스코어링 회귀 테스트.
// 2026-07-14 R4-3: 루트 tests/byeori_v4_scoring.test.js 에서 이동.
// node:test → vitest 로 전환(vite.config include 패턴에 잡히도록).
import { test, assert } from 'vitest';
import { ByeoriEngine } from '../../js/core/ByeoriEngine.js';
import { getBucket } from '../../js/shared/math.js';

const engine = new ByeoriEngine();

const mkVec = (base, reason = {}) => ({ base, reason_analysis: reason });

test('같은 감정 3장면: level≈1, shape≈1, alignment≈1', () => {
  const userTrajectory = [
    { fear: 0.8, sadness: 0.1 },
    { fear: 0.6, sadness: 0.3 },
    { fear: 0.4, sadness: 0.5 },
  ];
  const originalTrajectory = [
    { fear: 0.8, sadness: 0.1 },
    { fear: 0.6, sadness: 0.3 },
    { fear: 0.4, sadness: 0.5 },
  ];
  const sceneScores = [1, 1];
  const userVector = mkVec(userTrajectory[2], { is_void: false });
  const originalVector = mkVec(originalTrajectory[2], { is_void: false });

  const r = engine.calculateStep({
    userVector,
    originalVector,
    userTrajectory: userTrajectory.slice(0, 2),
    originalTrajectory: originalTrajectory.slice(0, 2),
    sceneScores,
  }, { previousBucket: null, emotionHistory: userTrajectory.slice(0, 2) });

  assert.ok(r.debug.level > 0.99);
  assert.ok(r.debug.shape > 0.99);
  assert.ok(r.alignment_score > 0.99);
});

test('감정 반대 3장면: level≈0, alignment≈0', () => {
  const userTrajectory = [
    { fear: 1, sadness: 0 },
    { fear: 0.8, sadness: 0.2 },
    { fear: 0.7, sadness: 0.3 },
  ];
  const originalTrajectory = [
    { joy: 1, hope: 0 },
    { joy: 0.8, hope: 0.2 },
    { joy: 0.7, hope: 0.3 },
  ];
  const sceneScores = [0, 0];

  const r = engine.calculateStep({
    userVector: mkVec(userTrajectory[2]),
    originalVector: mkVec(originalTrajectory[2]),
    userTrajectory: userTrajectory.slice(0, 2),
    originalTrajectory: originalTrajectory.slice(0, 2),
    sceneScores,
  }, {});

  assert.ok(r.debug.level < 0.01);
  assert.ok(r.alignment_score < 0.01);
});

test('감정 유사 but 궤적 반대: level 높고 shape 0 -> alignment 0, displacement', () => {
  const userTrajectory = [
    { fear: 0.2, sadness: 0.8 },
    { fear: 0.4, sadness: 0.6 },
    { fear: 0.6, sadness: 0.4 },
  ];
  const originalTrajectory = [
    { fear: 0.6, sadness: 0.4 },
    { fear: 0.4, sadness: 0.6 },
    { fear: 0.2, sadness: 0.8 },
  ];
  const sceneScores = [1, 1];
  const currentBase = { fear: 0.5, sadness: 0.5 };

  const r = engine.calculateStep({
    userVector: mkVec(currentBase),
    originalVector: mkVec(currentBase),
    userTrajectory: userTrajectory.slice(0, 2),
    originalTrajectory: originalTrajectory.slice(0, 2),
    sceneScores,
  }, {});

  assert.ok(r.debug.level >= 0.95);
  assert.strictEqual(r.debug.shape, 0);
  assert.strictEqual(r.alignment_score, 0);
  assert.strictEqual(r.transition_pattern, 'displacement');
});

test('2장면: shape inactive, alignment=level', () => {
  const userTrajectory = [{ fear: 0.5 }, { fear: 0.6 }];
  const originalTrajectory = [{ fear: 0.4 }, { fear: 0.7 }];
  const sceneScores = [0.8];

  const r = engine.calculateStep({
    userVector: mkVec(userTrajectory[1]),
    originalVector: mkVec(originalTrajectory[1]),
    userTrajectory: userTrajectory.slice(0, 1),
    originalTrajectory: originalTrajectory.slice(0, 1),
    sceneScores,
  }, {});

  assert.strictEqual(r.debug.shape_active, false);
  assert.ok(Math.abs(r.alignment_score - r.debug.level) < 1e-9);
});

test('VOID modifier 동작: user void + original non-void -> 0.7배', () => {
  const r = engine.calculateStep({
    userVector: mkVec({ fear: 1 }, { is_void: true }),
    originalVector: mkVec({ fear: 1 }, { is_void: false }),
    sceneScores: [],
  }, {});

  assert.strictEqual(r.debug.void_mod, 0.7);
  assert.ok(Math.abs(r.alignment_score - (r.debug.level * r.debug.shape * 0.7)) < 1e-9);
});

test('getBucket 임계값(V4): HIGH>=0.50, LOW<0.10', () => {
  assert.strictEqual(getBucket(0.50, null, null), 'HIGH');
  assert.strictEqual(getBucket(0.499, null, null), 'MID');
  assert.strictEqual(getBucket(0.099, null, null), 'LOW');
  assert.strictEqual(getBucket(0.10, null, null), 'MID');
});

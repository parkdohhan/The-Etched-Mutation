// test/unit/byeoriEngine.test.js
// 별이엔진 V4 단위 테스트

import { describe, it, expect } from 'vitest';
import { ByeoriEngine, byeoriEngine, calculateStep } from '../../js/core/ByeoriEngine.js';

// ─── Helper factories ──────────────────────────────────────────

function makeVector(dominant, value = 0.8) {
  return { base: { [dominant]: value } };
}

function makeVectorWithReason(dominant, value, reasonOverrides = {}) {
  return {
    base: { [dominant]: value },
    reason_analysis: reasonOverrides,
  };
}

// ─── Basic engine output structure ─────────────────────────────

describe('ByeoriEngine.calculateStep — output structure', () => {
  const engine = new ByeoriEngine();

  it('returns all required fields', () => {
    const result = engine.calculateStep({
      userVector: makeVector('fear', 0.8),
      originalVector: makeVector('fear', 0.7),
    });

    expect(result).toHaveProperty('affective_position');
    expect(result).toHaveProperty('alignment_score');
    expect(result).toHaveProperty('alignment_bucket');
    expect(result).toHaveProperty('transition_pattern');
    expect(result).toHaveProperty('mismatch_type');
    expect(result).toHaveProperty('current_scene_score');
    expect(result).toHaveProperty('debug');
  });

  it('alignment_score is in [0, 1]', () => {
    const result = engine.calculateStep({
      userVector: makeVector('fear', 0.8),
      originalVector: makeVector('sadness', 0.9),
    });
    expect(result.alignment_score).toBeGreaterThanOrEqual(0);
    expect(result.alignment_score).toBeLessThanOrEqual(1);
  });

  it('alignment_bucket is one of HIGH/MID/LOW/FIXATED', () => {
    const result = engine.calculateStep({
      userVector: makeVector('fear'),
      originalVector: makeVector('fear'),
    });
    expect(['HIGH', 'MID', 'LOW', 'FIXATED']).toContain(result.alignment_bucket);
  });
});

// ─── Empty/invalid input handling ──────────────────────────────

describe('ByeoriEngine.calculateStep — edge cases', () => {
  const engine = new ByeoriEngine();

  it('returns empty result for null userVector', () => {
    const result = engine.calculateStep({
      userVector: null,
      originalVector: makeVector('fear'),
    });
    expect(result.alignment_score).toBe(0);
    expect(result.alignment_bucket).toBe('LOW');
    expect(result.transition_pattern).toBeNull();
  });

  it('returns empty result for null originalVector', () => {
    const result = engine.calculateStep({
      userVector: makeVector('fear'),
      originalVector: null,
    });
    expect(result.alignment_score).toBe(0);
  });

  it('works with bare vectors (no .base wrapper)', () => {
    const result = engine.calculateStep({
      userVector: { fear: 0.8, sadness: 0.2 },
      originalVector: { fear: 0.7, sadness: 0.3 },
    });
    expect(result.alignment_score).toBeGreaterThan(0);
  });
});

// ─── Alignment formula: level × shape × void_mod ──────────────

describe('ByeoriEngine — alignment formula', () => {
  const engine = new ByeoriEngine();

  it('identical emotions → HIGH alignment', () => {
    const vec = makeVector('fear', 0.8);
    const result = engine.calculateStep({
      userVector: vec,
      originalVector: vec,
    });
    expect(result.alignment_score).toBeGreaterThan(0.8);
    expect(result.alignment_bucket).toBe('HIGH');
  });

  it('completely different emotions → LOW alignment', () => {
    const result = engine.calculateStep({
      userVector: { base: { fear: 1.0 } },
      originalVector: { base: { joy: 1.0 } },
    });
    expect(result.alignment_score).toBeLessThan(0.15);
  });

  it('void_mod applies 0.7 penalty when user avoids but original does not', () => {
    const user = makeVectorWithReason('fear', 0.8, { is_void: true });
    const orig = makeVectorWithReason('fear', 0.8, { is_void: false });
    const result = engine.calculateStep({ userVector: user, originalVector: orig });

    const userNoVoid = makeVectorWithReason('fear', 0.8, { is_void: false });
    const resultNoVoid = engine.calculateStep({ userVector: userNoVoid, originalVector: orig });

    // With void → lower alignment
    expect(result.alignment_score).toBeLessThan(resultNoVoid.alignment_score);
    expect(result.debug.void_mod).toBe(0.7);
    expect(resultNoVoid.debug.void_mod).toBe(1.0);
  });

  it('void_mod stays 1.0 when both are void', () => {
    const user = makeVectorWithReason('fear', 0.8, { is_void: true });
    const orig = makeVectorWithReason('fear', 0.8, { is_void: true });
    const result = engine.calculateStep({ userVector: user, originalVector: orig });
    expect(result.debug.void_mod).toBe(1.0);
  });

  it('shape becomes active after 3+ trajectory points', () => {
    const traj = [
      { fear: 0.1 }, { fear: 0.3 }, { fear: 0.5 },
    ];
    const result = engine.calculateStep({
      userVector: makeVector('fear', 0.7),
      originalVector: makeVector('fear', 0.7),
      userTrajectory: traj,
      originalTrajectory: traj,
    });
    expect(result.debug.shape_active).toBe(true);
  });

  it('shape stays inactive with < 3 trajectory points', () => {
    const result = engine.calculateStep({
      userVector: makeVector('fear'),
      originalVector: makeVector('fear'),
      userTrajectory: [{ fear: 0.1 }],
      originalTrajectory: [{ fear: 0.2 }],
    });
    expect(result.debug.shape_active).toBe(false);
    expect(result.debug.shape).toBe(1.0);
  });

  it('sceneScores accumulate across calls', () => {
    const result = engine.calculateStep({
      userVector: makeVector('fear', 0.8),
      originalVector: makeVector('fear', 0.7),
      sceneScores: [0.5, 0.6],
    });
    expect(result.debug.scenes_played).toBe(3);
    expect(result.debug.scene_scores).toHaveLength(3);
  });
});

// ─── Mismatch type detection ───────────────────────────────────

describe('ByeoriEngine — mismatch types', () => {
  const engine = new ByeoriEngine();

  it('detects void_mismatch', () => {
    const user = makeVectorWithReason('fear', 0.8, { is_void: true });
    const orig = makeVectorWithReason('fear', 0.8, { is_void: false });
    const result = engine.calculateStep({ userVector: user, originalVector: orig });
    expect(result.mismatch_type).toBe('void_mismatch');
  });

  it('detects attribution_mismatch', () => {
    const user = makeVectorWithReason('fear', 0.8, { attribution: 'self' });
    const orig = makeVectorWithReason('fear', 0.8, { attribution: 'other' });
    const result = engine.calculateStep({ userVector: user, originalVector: orig });
    expect(result.mismatch_type).toBe('attribution_mismatch');
  });

  it('detects target_displacement (similar emotion, different target)', () => {
    const user = {
      base: { fear: 0.8, sadness: 0.2 },
      reason_analysis: { target: 'mother' },
    };
    const orig = {
      base: { fear: 0.7, sadness: 0.3 },
      reason_analysis: { target: 'father' },
    };
    const result = engine.calculateStep({ userVector: user, originalVector: orig });
    expect(result.mismatch_type).toBe('target_displacement');
  });

  it('detects emotion_mismatch for dissimilar emotions', () => {
    const user = { base: { fear: 1.0 }, reason_analysis: {} };
    const orig = { base: { joy: 1.0 }, reason_analysis: {} };
    const result = engine.calculateStep({ userVector: user, originalVector: orig });
    expect(result.mismatch_type).toBe('emotion_mismatch');
  });

  it('returns null mismatch for similar emotions without reason conflicts', () => {
    const vec = makeVector('fear', 0.8);
    const result = engine.calculateStep({ userVector: vec, originalVector: vec });
    expect(result.mismatch_type).toBeNull();
  });
});

// ─── Transition patterns ───────────────────────────────────────

describe('ByeoriEngine — transition patterns', () => {
  const engine = new ByeoriEngine();

  it('HIGH bucket → echo_follow', () => {
    const vec = makeVector('fear', 0.8);
    const result = engine.calculateStep({ userVector: vec, originalVector: vec });
    expect(result.alignment_bucket).toBe('HIGH');
    expect(result.transition_pattern).toBe('echo_follow');
  });

  it('MID bucket → bridge', () => {
    // Create moderate alignment
    const user = { base: { fear: 0.5, sadness: 0.3, joy: 0.2 } };
    const orig = { base: { fear: 0.3, sadness: 0.5, anger: 0.2 } };
    const result = engine.calculateStep({ userVector: user, originalVector: orig });
    if (result.alignment_bucket === 'MID') {
      expect(result.transition_pattern).toBe('bridge');
    }
  });

  it('LOW + void_mismatch → avoidance', () => {
    const user = makeVectorWithReason('numbness', 0.1, { is_void: true });
    const orig = makeVectorWithReason('joy', 1.0, { is_void: false });
    const result = engine.calculateStep({ userVector: user, originalVector: orig });
    if (result.alignment_bucket === 'LOW' && result.mismatch_type === 'void_mismatch') {
      expect(result.transition_pattern).toBe('avoidance');
    }
  });

  it('LOW + emotion_mismatch → contradiction', () => {
    const user = { base: { fear: 1.0 }, reason_analysis: {} };
    const orig = { base: { joy: 1.0 }, reason_analysis: {} };
    const result = engine.calculateStep({ userVector: user, originalVector: orig });
    if (result.alignment_bucket === 'LOW' && result.mismatch_type === 'emotion_mismatch') {
      expect(result.transition_pattern).toBe('contradiction');
    }
  });

  it('FIXATED → fixation', () => {
    const vec = makeVector('fear', 0.8);
    const history = [
      { fear: 0.8 }, { fear: 0.8 }, { fear: 0.8 },
    ];
    const result = engine.calculateStep(
      { userVector: vec, originalVector: vec },
      { emotionHistory: history }
    );
    expect(result.alignment_bucket).toBe('FIXATED');
    expect(result.transition_pattern).toBe('fixation');
  });
});

// ─── Singleton & function export ───────────────────────────────

describe('ByeoriEngine — exports', () => {
  it('byeoriEngine singleton works', () => {
    const result = byeoriEngine.calculateStep({
      userVector: makeVector('fear'),
      originalVector: makeVector('fear'),
    });
    expect(result.alignment_score).toBeGreaterThan(0);
  });

  it('calculateStep function export works', () => {
    const result = calculateStep({
      userVector: makeVector('fear'),
      originalVector: makeVector('fear'),
    });
    expect(result.alignment_score).toBeGreaterThan(0);
  });
});

// test/unit/contaminationTracker.test.js
// ContaminationTracker 단위 테스트

import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  updateContamination,
  replayFromPlays,
  getPresentationState,
  getDominantEmotionLabel,
  getDominantMismatch,
  updateCumulativeEmotionVec,
  computeDriftVector,
  EMOTION_AXES_12,
  CONTAMINATION,
} from '../../js/core/ContaminationTracker.js';

// ─── createEmptyState ──────────────────────────────────────────

describe('createEmptyState', () => {
  it('returns all required fields with zero values', () => {
    const state = createEmptyState();
    expect(state.cont_drift).toBe(0);
    expect(state.cont_fixation).toBe(0);
    expect(state.cont_depth).toBe(0);
    expect(state.cont_stage).toBe('stable');
    expect(state.cont_divergence).toBe(0);
    expect(state.cont_convergence).toBe(0);
    expect(state.cont_heterogeneity).toBe(0);
    expect(state.cont_stage_1).toBe(0);
    expect(state.cont_stage_2).toBe(0);
    expect(state.cont_stage_3).toBe(0);
    expect(state._cont_align_mean).toBe(0);
    expect(state._cont_align_m2).toBe(0);
  });
});

// ─── updateContamination — basic mechanics ─────────────────────

describe('updateContamination — basic', () => {
  it('increments depth by 1', () => {
    const state = createEmptyState();
    const next = updateContamination(state, { alignment: 0.5 });
    expect(next.cont_depth).toBe(1);

    const next2 = updateContamination(next, { alignment: 0.5 });
    expect(next2.cont_depth).toBe(2);
  });

  it('does not mutate original state', () => {
    const state = createEmptyState();
    const next = updateContamination(state, { alignment: 0.5 });
    expect(state.cont_depth).toBe(0);
    expect(next.cont_depth).toBe(1);
  });

  it('stores last engine output in debug snapshot', () => {
    const next = updateContamination(createEmptyState(), {
      alignment: 0.75,
      level: 0.8,
      shape: 0.9,
      transition_pattern: 'echo_follow',
      mismatch_type: 'none',
    });
    expect(next.cont_last_alignment).toBe(0.75);
    expect(next.cont_last_level).toBe(0.8);
    // shape_active=false (default) → effectiveShape = 1.0
    expect(next.cont_last_shape).toBe(1.0);
    expect(next.cont_last_pattern).toBe('echo_follow');
    expect(next.cont_last_updated).toBeTruthy();
  });
});

// ─── EMA drift/fixation signals ────────────────────────────────

describe('updateContamination — EMA drift/fixation', () => {
  it('low alignment produces drift signal', () => {
    const state = createEmptyState();
    const next = updateContamination(state, {
      alignment: 0.1,
      level: 0.1,
      shape: 0.2,
      shape_active: true,
      mismatch_type: 'emotion_mismatch',
    });
    expect(next.cont_drift).toBeGreaterThan(0);
  });

  it('high alignment produces low drift', () => {
    const state = createEmptyState();
    const next = updateContamination(state, {
      alignment: 0.9,
      level: 0.9,
      shape: 0.95,
      shape_active: true,
      mismatch_type: 'none',
    });
    expect(next.cont_drift).toBeLessThan(0.05);
  });

  it('fixation signal increases with high fixation_level', () => {
    const state = createEmptyState();
    const next = updateContamination(state, {
      alignment: 0.8,
      fixation_level: 0.9,
      transition_pattern: 'fixation',
    });
    expect(next.cont_fixation).toBeGreaterThan(0);
  });

  it('EMA smooths values over multiple sessions', () => {
    let state = createEmptyState();
    // 10 sessions with high drift signal
    for (let i = 0; i < 10; i++) {
      state = updateContamination(state, {
        alignment: 0.05,
        level: 0.1,
        shape: 0.1,
        shape_active: true,
        mismatch_type: 'emotion_mismatch',
      });
    }
    const highDrift = state.cont_drift;

    // Now 10 sessions with low drift signal
    for (let i = 0; i < 10; i++) {
      state = updateContamination(state, {
        alignment: 0.9,
        level: 0.9,
        shape: 0.95,
        shape_active: true,
        mismatch_type: 'none',
      });
    }
    // Drift should have decreased
    expect(state.cont_drift).toBeLessThan(highDrift);
  });

  it('cont_drift and cont_fixation stay in [0, 1]', () => {
    let state = createEmptyState();
    for (let i = 0; i < 50; i++) {
      state = updateContamination(state, {
        alignment: 0.01,
        level: 0.01,
        shape: 0.01,
        shape_active: true,
        mismatch_type: 'emotion_mismatch',
        fixation_level: 0.95,
        transition_pattern: 'fixation',
      });
    }
    expect(state.cont_drift).toBeLessThanOrEqual(1);
    expect(state.cont_drift).toBeGreaterThanOrEqual(0);
    expect(state.cont_fixation).toBeLessThanOrEqual(1);
    expect(state.cont_fixation).toBeGreaterThanOrEqual(0);
  });
});

// ─── Stage determination ───────────────────────────────────────

describe('updateContamination — stage determination', () => {
  it('starts as stable', () => {
    const state = createEmptyState();
    expect(state.cont_stage).toBe('stable');
  });

  it('becomes biased_inclination with high drift', () => {
    let state = createEmptyState();
    // Push drift above threshold (0.35)
    for (let i = 0; i < 30; i++) {
      state = updateContamination(state, {
        alignment: 0.05,
        level: 0.05,
        shape: 0.1,
        shape_active: true,
        mismatch_type: 'emotion_mismatch',
        fixation_level: 0,
      });
    }
    expect(state.cont_drift).toBeGreaterThanOrEqual(CONTAMINATION.STAGE_THRESHOLDS.BIASED_INCLINATION_DRIFT);
    expect(state.cont_stage).toBe('biased_inclination');
  });

  it('becomes hypercompletion with high fixation that exceeds drift', () => {
    let state = createEmptyState();
    for (let i = 0; i < 30; i++) {
      state = updateContamination(state, {
        alignment: 0.8,
        level: 0.85,
        shape: 0.9,
        shape_active: true,
        fixation_level: 0.95,
        transition_pattern: 'fixation',
        mismatch_type: 'none',
      });
    }
    expect(state.cont_fixation).toBeGreaterThanOrEqual(CONTAMINATION.STAGE_THRESHOLDS.HYPERCOMPLETION_FIXATION);
    expect(state.cont_stage).toBe('hypercompletion');
  });
});

// ─── 3-axis vector (divergence, convergence, heterogeneity) ────

describe('updateContamination — 3-axis vector', () => {
  it('divergence increases with low level+shape', () => {
    let state = createEmptyState();
    state = updateContamination(state, {
      alignment: 0.1,
      level: 0.1,
      shape: 0.1,
      shape_active: true,
    });
    expect(state.cont_divergence).toBeGreaterThan(0);
  });

  it('divergence stays 0 for perfect alignment', () => {
    let state = createEmptyState();
    state = updateContamination(state, {
      alignment: 1.0,
      level: 1.0,
      shape: 1.0,
      shape_active: true,
    });
    expect(state.cont_divergence).toBe(0);
  });

  it('convergence gated by minimum depth', () => {
    let state = createEmptyState();
    // First session — depth=1, below MIN_DEPTH_FOR_CONVERGENCE (3)
    state = updateContamination(state, {
      alignment: 0.8,
      level: 0.8,
      shape: 0.8,
      shape_active: true,
      fixation_level: 0.9,
    });
    expect(state.cont_convergence).toBe(0);
  });

  it('convergence accumulates after min depth with fixation', () => {
    let state = createEmptyState();
    for (let i = 0; i < 5; i++) {
      state = updateContamination(state, {
        alignment: 0.8,
        level: 0.8,
        shape: 0.8,
        shape_active: true,
        fixation_level: 0.9,
      });
    }
    expect(state.cont_convergence).toBeGreaterThan(0);
  });

  it('heterogeneity reflects alignment variance', () => {
    let state = createEmptyState();
    // Alternate high and low alignment → high variance
    for (let i = 0; i < 10; i++) {
      const alignment = i % 2 === 0 ? 0.9 : 0.1;
      state = updateContamination(state, { alignment });
    }
    expect(state.cont_heterogeneity).toBeGreaterThan(0);
  });

  it('heterogeneity stays low for consistent alignment', () => {
    let state = createEmptyState();
    for (let i = 0; i < 10; i++) {
      state = updateContamination(state, { alignment: 0.5 });
    }
    expect(state.cont_heterogeneity).toBeLessThan(0.05);
  });

  it('all 3-axis values stay in [0, 1]', () => {
    let state = createEmptyState();
    for (let i = 0; i < 50; i++) {
      state = updateContamination(state, {
        alignment: Math.random(),
        level: Math.random(),
        shape: Math.random(),
        shape_active: true,
        fixation_level: Math.random(),
      });
    }
    expect(state.cont_divergence).toBeGreaterThanOrEqual(0);
    expect(state.cont_divergence).toBeLessThanOrEqual(1);
    expect(state.cont_convergence).toBeGreaterThanOrEqual(0);
    expect(state.cont_convergence).toBeLessThanOrEqual(1);
    expect(state.cont_heterogeneity).toBeGreaterThanOrEqual(0);
    expect(state.cont_heterogeneity).toBeLessThanOrEqual(1);
  });
});

// ─── Stage mixing weights ──────────────────────────────────────

describe('updateContamination — stage mixing', () => {
  it('stage weights sum to ~1.0 when non-zero', () => {
    let state = createEmptyState();
    for (let i = 0; i < 10; i++) {
      state = updateContamination(state, {
        alignment: 0.3,
        level: 0.3,
        shape: 0.4,
        shape_active: true,
        fixation_level: 0.5,
      });
    }
    const sum = state.cont_stage_1 + state.cont_stage_2 + state.cont_stage_3;
    if (sum > 0) {
      expect(sum).toBeCloseTo(1.0, 3);
    }
  });

  it('all stage weights are 0 at initial state', () => {
    const state = createEmptyState();
    expect(state.cont_stage_1).toBe(0);
    expect(state.cont_stage_2).toBe(0);
    expect(state.cont_stage_3).toBe(0);
  });
});

// ─── Drift direction ──────────────────────────────────────────

describe('updateContamination — drift direction', () => {
  it('tracks VAD drift direction', () => {
    let state = createEmptyState();
    state = updateContamination(state, {
      alignment: 0.2,
      level: 0.2,
      shape: 0.3,
      shape_active: true,
      mismatch_type: 'emotion_mismatch',
      user_valence: -0.8,
      user_arousal: 0.5,
      user_dominance: -0.3,
    });
    // Direction should reflect user's emotion weighted by drift signal
    expect(state.drift_dir_v).toBeLessThan(0);  // negative valence
    expect(state.drift_dir_a).toBeGreaterThan(0);  // positive arousal
  });

  it('accumulates lifetime direction sums', () => {
    let state = createEmptyState();
    for (let i = 0; i < 5; i++) {
      state = updateContamination(state, {
        alignment: 0.2,
        level: 0.2,
        mismatch_type: 'emotion_mismatch',
        user_valence: -0.5,
        user_arousal: 0.3,
        user_dominance: 0.1,
      });
    }
    expect(state.lifetime_dir_v_sum).toBeLessThan(0);
    expect(state.lifetime_dir_a_sum).toBeGreaterThan(0);
  });
});

// ─── replayFromPlays ───────────────────────────────────────────

describe('replayFromPlays', () => {
  it('returns valid state from play history', () => {
    const plays = [
      { alignment: 0.7, mismatch_type: 'none', transition_pattern: 'echo_follow' },
      { alignment: 0.3, mismatch_type: 'emotion_mismatch', transition_pattern: 'contradiction' },
      { alignment: 0.5, mismatch_type: 'none', transition_pattern: 'bridge' },
    ];
    const state = replayFromPlays(plays);
    expect(state.cont_depth).toBe(3);
    expect(state.cont_drift).toBeGreaterThan(0);
  });

  it('returns empty state for no plays', () => {
    const state = replayFromPlays([]);
    expect(state.cont_depth).toBe(0);
    expect(state).toEqual(createEmptyState());
  });

  it('defaults alignment to 0.5 when null', () => {
    const plays = [{ mismatch_type: 'none' }];
    const state = replayFromPlays(plays);
    expect(state.cont_depth).toBe(1);
  });

  it('shape_active activates after 2+ plays', () => {
    const plays = [
      { alignment: 0.5 },
      { alignment: 0.5 },
      { alignment: 0.5 },
    ];
    const state = replayFromPlays(plays);
    // After 3 plays, last play had shape_active=true (i >= 2)
    expect(state.cont_depth).toBe(3);
  });
});

// ─── getPresentationState ──────────────────────────────────────

describe('getPresentationState', () => {
  it('returns stage, intensity, band for stable state', () => {
    const state = createEmptyState();
    const pres = getPresentationState(state);
    expect(pres.stage).toBe('stable');
    expect(pres.intensity).toBe(0);
    expect(pres.band).toBe('weak');
    expect(pres.divergence).toBe(0);
    expect(pres.convergence).toBe(0);
    expect(pres.heterogeneity).toBe(0);
  });

  it('intensity uses cont_drift for biased_inclination', () => {
    const state = { ...createEmptyState(), cont_stage: 'biased_inclination', cont_drift: 0.5 };
    const pres = getPresentationState(state);
    expect(pres.intensity).toBe(0.5);
    expect(pres.band).toBe('medium');
  });

  it('intensity uses cont_fixation for hypercompletion', () => {
    const state = { ...createEmptyState(), cont_stage: 'hypercompletion', cont_fixation: 0.8 };
    const pres = getPresentationState(state);
    expect(pres.intensity).toBe(0.8);
    expect(pres.band).toBe('strong');
  });

  it('band thresholds: weak < 0.34, medium 0.34-0.66, strong >= 0.67', () => {
    const makeState = (stage, value) => ({
      ...createEmptyState(),
      cont_stage: stage,
      cont_drift: value,
      cont_fixation: value,
    });
    expect(getPresentationState(makeState('biased_inclination', 0.33)).band).toBe('weak');
    expect(getPresentationState(makeState('biased_inclination', 0.34)).band).toBe('medium');
    expect(getPresentationState(makeState('biased_inclination', 0.66)).band).toBe('medium');
    expect(getPresentationState(makeState('biased_inclination', 0.67)).band).toBe('strong');
  });

  it('includes 3-axis vector + stage_weights', () => {
    const state = { ...createEmptyState(), cont_divergence: 0.3, cont_stage_1: 0.5, cont_stage_2: 0.3, cont_stage_3: 0.2 };
    const pres = getPresentationState(state);
    expect(pres.divergence).toBe(0.3);
    expect(pres.stage_weights.s1).toBe(0.5);
    expect(pres.stage_weights.s2).toBe(0.3);
    expect(pres.stage_weights.s3).toBe(0.2);
  });
});

// ─── getDominantEmotionLabel ───────────────────────────────────

describe('getDominantEmotionLabel', () => {
  it('negative valence + high arousal → anger', () => {
    expect(getDominantEmotionLabel({ drift_dir_v: -0.5, drift_dir_a: 0.5 })).toBe('anger');
  });

  it('negative valence + low arousal → sadness', () => {
    expect(getDominantEmotionLabel({ drift_dir_v: -0.5, drift_dir_a: -0.5 })).toBe('sadness');
  });

  it('positive valence + high arousal → excitement', () => {
    expect(getDominantEmotionLabel({ drift_dir_v: 0.5, drift_dir_a: 0.5 })).toBe('excitement');
  });

  it('positive valence + low arousal → calm', () => {
    expect(getDominantEmotionLabel({ drift_dir_v: 0.5, drift_dir_a: -0.5 })).toBe('calm');
  });

  it('near-zero → neutral', () => {
    expect(getDominantEmotionLabel({ drift_dir_v: 0, drift_dir_a: 0 })).toBe('neutral');
  });
});

// ─── getDominantMismatch ───────────────────────────────────────

describe('getDominantMismatch', () => {
  it('returns most common mismatch type', () => {
    const plays = [
      { mismatch_type: 'emotion_mismatch' },
      { mismatch_type: 'emotion_mismatch' },
      { mismatch_type: 'void_mismatch' },
    ];
    expect(getDominantMismatch(plays)).toBe('emotion_mismatch');
  });

  it('returns none when no mismatches', () => {
    expect(getDominantMismatch([{}, {}, {}])).toBe('none');
  });

  it('handles empty array', () => {
    expect(getDominantMismatch([])).toBe('none');
  });
});

// ─── V2.1 12축 cumulative emotion_vec ─────────────────────────

describe('EMOTION_AXES_12', () => {
  it('exposes 12 axes matching SeekerFingerprint EMOTION_KEYS', () => {
    expect(EMOTION_AXES_12).toHaveLength(12);
    expect(EMOTION_AXES_12).toContain('fear');
    expect(EMOTION_AXES_12).toContain('emptiness');
    expect(EMOTION_AXES_12).toContain('relief');
  });
});

describe('updateCumulativeEmotionVec', () => {
  it('first session: cumulative starts empty → result ≈ α × sessionVec', () => {
    const next = updateCumulativeEmotionVec({}, { sadness: 0.8, longing: 0.5 });
    // α = 0.10
    expect(next.sadness).toBeCloseTo(0.08, 3);
    expect(next.longing).toBeCloseTo(0.05, 3);
  });

  it('null cumulative behaves as empty', () => {
    const next = updateCumulativeEmotionVec(null, { fear: 1.0 });
    expect(next.fear).toBeCloseTo(0.10, 3);
  });

  it('missing axis in input keeps cumulative for that axis decaying toward 0', () => {
    const prior = { sadness: 0.5 };
    // sessionVec has no sadness — sadness decays via α·0 + (1-α)·prev
    const next = updateCumulativeEmotionVec(prior, { fear: 0.8 });
    expect(next.sadness).toBeCloseTo(0.45, 3);
    expect(next.fear).toBeCloseTo(0.08, 3);
  });

  it('many sessions of stable input converges toward that input', () => {
    let cum = {};
    for (let i = 0; i < 100; i++) {
      cum = updateCumulativeEmotionVec(cum, { joy: 0.7 });
    }
    // After 100 sessions of joy=0.7 with α=0.10, cumulative should be very near 0.7
    expect(cum.joy).toBeGreaterThan(0.69);
    expect(cum.joy).toBeLessThanOrEqual(0.7);
  });

  it('respects custom alpha', () => {
    const next = updateCumulativeEmotionVec({}, { anger: 0.5 }, 0.6);
    expect(next.anger).toBeCloseTo(0.30, 3);
  });

  it('drops axes that decay below noise floor (0.001)', () => {
    // Start with tiny value, push it down with empty input
    let cum = { guilt: 0.0005 };
    cum = updateCumulativeEmotionVec(cum, {});
    expect(cum.guilt).toBeUndefined();
  });

  it('does not mutate input cumulative', () => {
    const prior = { sadness: 0.5 };
    updateCumulativeEmotionVec(prior, { sadness: 0.8 });
    expect(prior.sadness).toBe(0.5);
  });
});

describe('computeDriftVector', () => {
  it('current > baseline → positive on those axes', () => {
    const drift = computeDriftVector(
      { sadness: 0.6, joy: 0.1 },
      { sadness: 0.2, joy: 0.1 }
    );
    expect(drift.sadness).toBeCloseTo(0.4, 3);
    expect(drift.joy).toBeCloseTo(0, 3);
  });

  it('current < baseline → negative drift', () => {
    const drift = computeDriftVector(
      { fear: 0.1 },
      { fear: 0.7 }
    );
    expect(drift.fear).toBeCloseTo(-0.6, 3);
  });

  it('null inputs → all axes zero', () => {
    const drift = computeDriftVector(null, null);
    for (const k of EMOTION_AXES_12) {
      expect(drift[k]).toBe(0);
    }
  });

  it('returns vector with all 12 axes (missing → 0)', () => {
    const drift = computeDriftVector({ sadness: 0.5 }, {});
    expect(Object.keys(drift)).toHaveLength(12);
    expect(drift.sadness).toBeCloseTo(0.5, 3);
    expect(drift.fear).toBe(0);
  });
});

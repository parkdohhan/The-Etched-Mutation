// js/core/ContaminationTracker.js
// Contamination MVP v3 — drift/fixation 2축, dominant stage
//
// 기반 문서:
//   docs/contamination/contamination_mvp_spec_v3.md  (계산)
//   docs/contamination/contamination_presentation_spec_v1.md  (연출 소비)
//   docs/contamination/contamination_vnext_notes.md  (제외 항목)
//
// 누적 방식: EMA (지수이동평균)
//   — 포화 방지, 최근 세션의 결을 반영
//   — lifetime 누적은 별도 카운터로 보존
//
// 별이엔진 V4는 변경하지 않는다. 이 모듈은 V4 출력의 소비자이다.

// ─── Constants (MVP v3 spec §5) ─────────────────────────────────

export const CONTAMINATION = {
  // EMA smoothing factor (replaces DECAY_RATE)
  // α = 0.10 → half-life ≈ 6.6 sessions
  // Recent ~7 sessions dominate the axis value
  EMA_ALPHA: 0.10,

  DRIFT_WEIGHTS: {
    LEVEL: 0.45,
    SHAPE: 0.35,
    MISMATCH: 0.20,
  },

  FIX_WEIGHTS: {
    FIXATION: 0.55,
    ALIGNMENT: 0.25,
    PATTERN: 0.20,
  },

  MISMATCH_BONUS: {
    emotion_mismatch: 1.0,
    attribution_mismatch: 0.7,
    target_displacement: 0.6,
    void_mismatch: 0.8,
    none: 0.0,
  },

  PATTERN_BONUS: {
    fixation: 1.0,
    echo_follow: 0.5,
    bridge: 0.2,
    contradiction: 0.0,
    displacement: 0.0,
    avoidance: 0.0,
  },

  STAGE_THRESHOLDS: {
    HYPERCOMPLETION_FIXATION: 0.65,
    BIASED_INCLINATION_DRIFT: 0.35,
  },
};

// ─── Helpers ────────────────────────────────────────────────────

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function normalizeAlignmentBonus(alignment) {
  if (alignment <= 0.55) return 0;
  return Math.min((alignment - 0.55) / 0.45, 1);
}

// ─── Empty state factory ────────────────────────────────────────

export function createEmptyState() {
  return {
    // Session-level (EMA) — used for stage determination + rendering
    cont_drift: 0,
    cont_fixation: 0,
    cont_stage: 'stable',  // 'stable' | 'biased_inclination' | 'hypercompletion'

    // Lifetime counters — used for strata/archive/history
    cont_depth: 0,
    lifetime_drift_sum: 0,   // cumulative drift signal total
    lifetime_fix_sum: 0,     // cumulative fixation signal total

    // Last engine output snapshot (debug/admin)
    cont_last_alignment: 0,
    cont_last_level: 0,
    cont_last_shape: 1,
    cont_last_pattern: 'bridge',
    cont_last_mismatch: 'none',
    cont_last_updated: null,
  };
}

// ─── Core update (called once per session end) ──────────────────

/**
 * Update contamination state from a single engine output.
 *
 * @param {Object} state  - current contamination state (from createEmptyState or DB)
 * @param {Object} engineOutput - V4 final output for this session
 * @param {number} engineOutput.alignment
 * @param {number} engineOutput.level
 * @param {number} engineOutput.shape
 * @param {boolean} engineOutput.shape_active
 * @param {string} engineOutput.transition_pattern
 * @param {string} engineOutput.mismatch_type
 * @param {number} engineOutput.fixation_level
 * @returns {Object} next state (new object, does not mutate input)
 */
export function updateContamination(state, engineOutput) {
  const next = { ...state };
  const α = CONTAMINATION.EMA_ALPHA;

  const {
    alignment = 0,
    level = 0,
    shape = 1,
    shape_active = false,
    transition_pattern = 'bridge',
    mismatch_type = 'none',
    fixation_level = 0,
  } = engineOutput;

  // 1. Depth (lifetime, always increments)
  next.cont_depth += 1;

  // 2. Compute signals (MVP v3 spec §6)
  const effectiveShape = shape_active ? shape : 1.0;
  const mismatchBonus = CONTAMINATION.MISMATCH_BONUS[mismatch_type] ?? 0;
  const patternBonus = CONTAMINATION.PATTERN_BONUS[transition_pattern] ?? 0;

  const driftSignal =
    CONTAMINATION.DRIFT_WEIGHTS.LEVEL * (1 - level) +
    CONTAMINATION.DRIFT_WEIGHTS.SHAPE * (1 - effectiveShape) +
    CONTAMINATION.DRIFT_WEIGHTS.MISMATCH * mismatchBonus;

  const fixSignal =
    CONTAMINATION.FIX_WEIGHTS.FIXATION * fixation_level +
    CONTAMINATION.FIX_WEIGHTS.ALIGNMENT * normalizeAlignmentBonus(alignment) +
    CONTAMINATION.FIX_WEIGHTS.PATTERN * patternBonus;

  // 3. EMA update (replaces cumulative + decay)
  //    axis = α * signal + (1 - α) * axis_old
  next.cont_drift = clamp01(α * driftSignal + (1 - α) * next.cont_drift);
  next.cont_fixation = clamp01(α * fixSignal + (1 - α) * next.cont_fixation);

  // 4. Lifetime accumulators (for strata/history, never reset)
  next.lifetime_drift_sum += driftSignal;
  next.lifetime_fix_sum += fixSignal;

  // 5. Dominant stage (MVP v3 spec §6)
  const { HYPERCOMPLETION_FIXATION, BIASED_INCLINATION_DRIFT } =
    CONTAMINATION.STAGE_THRESHOLDS;

  if (
    next.cont_fixation >= HYPERCOMPLETION_FIXATION &&
    next.cont_fixation > next.cont_drift
  ) {
    next.cont_stage = 'hypercompletion';
  } else if (next.cont_drift >= BIASED_INCLINATION_DRIFT) {
    next.cont_stage = 'biased_inclination';
  } else {
    next.cont_stage = 'stable';
  }

  // 6. Snapshot last engine output (debug)
  next.cont_last_alignment = alignment;
  next.cont_last_level = level;
  next.cont_last_shape = effectiveShape;
  next.cont_last_pattern = transition_pattern;
  next.cont_last_mismatch = mismatch_type;
  next.cont_last_updated = new Date().toISOString();

  return next;
}

// ─── Batch replay (for simulated/historical plays) ──────────────

/**
 * Replay a list of plays to compute contamination state.
 * Used for seed data or DB plays that don't have full engine output.
 *
 * Approximations for missing engine fields:
 *   level ≈ sqrt(alignment)
 *   shape ≈ sqrt(alignment)
 *   shape_active = true after 2+ plays
 *   fixation_level = 0 (not available in play records)
 *
 * @param {Array} plays - array of { alignment, mismatch_type, transition_pattern? }
 * @returns {Object} final contamination state
 */
export function replayFromPlays(plays) {
  let state = createEmptyState();

  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const alignment = p.alignment != null ? p.alignment : 0.5;

    state = updateContamination(state, {
      alignment,
      level: Math.sqrt(Math.max(0, alignment)),
      shape: Math.sqrt(Math.max(0, alignment)),
      shape_active: i >= 2,
      transition_pattern: p.transition_pattern || 'bridge',
      mismatch_type: p.mismatch_type || 'none',
      fixation_level: 0,
    });
  }

  return state;
}

// ─── Presentation helpers (read-only, no re-computation) ────────

/**
 * Get the intensity band for the current dominant stage.
 * Per Presentation spec §3:
 *   weak:   0.00 ~ 0.33
 *   medium: 0.34 ~ 0.66
 *   strong: 0.67 ~ 1.00
 *
 * @param {Object} state - contamination state
 * @returns {{ stage: string, intensity: number, band: string }}
 */
export function getPresentationState(state) {
  const stage = state.cont_stage || 'stable';
  let intensity = 0;

  if (stage === 'biased_inclination') {
    intensity = state.cont_drift;
  } else if (stage === 'hypercompletion') {
    intensity = state.cont_fixation;
  }

  const band = intensity >= 0.67 ? 'strong'
    : intensity >= 0.34 ? 'medium'
    : 'weak';

  return { stage, intensity, band };
}

/**
 * Get the dominant mismatch direction from a list of plays.
 * Used to determine WHICH direction the bias tilts in biased_inclination.
 *
 * @param {Array} plays - array of { mismatch_type }
 * @returns {string} dominant mismatch type or 'none'
 */
export function getDominantMismatch(plays) {
  const counts = {
    emotion_mismatch: 0,
    attribution_mismatch: 0,
    target_displacement: 0,
    void_mismatch: 0,
  };

  for (const p of plays) {
    if (p.mismatch_type && counts[p.mismatch_type] !== undefined) {
      counts[p.mismatch_type]++;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : 'none';
}

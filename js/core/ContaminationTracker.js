// js/core/ContaminationTracker.js
// Contamination v4 — 2축 MVP (drift/fixation) + 3축 벡터 (divergence/convergence/heterogeneity)
//
// 기반 문서:
//   docs/오염벡터_계산_구현_명세_v2-260327.md  (3축 스펙)
//   docs/contamination/contamination_mvp_spec_v3.md  (2축 MVP)
//   docs/contamination/contamination_presentation_spec_v1-260330.md  (연출 소비)
//
// 2축 MVP: EMA 기반 drift/fixation (기존 호환)
// 3축 벡터: 오염벡터 v2 스펙 — divergence(분자시계 포화), convergence(수렴 진화),
//           heterogeneity(Welford 분산 = 준종 구름 폭)
//
// 별이엔진 V4는 변경하지 않는다. 이 모듈은 V4 출력의 소비자이다.

import { projectEmotionToVAD } from '../shared/math.js';

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

  // ─── 3-axis vector constants (오염벡터 v2 spec) ────────────────
  // Decay: 1/(1 + depth * DECAY_RATE) — molecular clock saturation model
  DECAY_RATE: 0.05,
  // Convergence weights by condition
  FIXATION_CONV_WEIGHT: 0.4,
  HIGH_CONV_WEIGHT: 0.15,
  MID_CONV_WEIGHT: 0.03,
  // Minimum depth before convergence can accumulate
  MIN_DEPTH_FOR_CONVERGENCE: 3,
  // Fixation threshold for strong convergence signal
  FIXATION_THRESHOLD: 0.85,
  // Heterogeneity: Welford variance × this scale, clamped to [0,1]
  HETERO_SCALE: 4.0,
  // Depth at which Stage 2 reaches full weight
  DEPTH_THRESHOLD_S2: 5,
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

    // Drift direction — which emotion direction the memory is pulled toward
    // EMA-tracked with same α as drift/fixation
    drift_dir_v: 0,    // valence  (-1 negative … +1 positive)
    drift_dir_a: 0,    // arousal  (-1 low … +1 high)
    drift_dir_d: 0,    // dominance (-1 powerless … +1 dominant)
    lifetime_dir_v_sum: 0,
    lifetime_dir_a_sum: 0,
    lifetime_dir_d_sum: 0,

    // 3-axis vector (오염벡터 v2 — HIV phylodynamics metrics)
    cont_divergence: 0,      // root-to-tip divergence analog
    cont_convergence: 0,     // convergent evolution analog
    cont_heterogeneity: 0,   // intra-patient diversity (π) analog
    _cont_align_mean: 0,     // Welford online mean
    _cont_align_m2: 0,       // Welford online M2

    // Stage mixing weights (normalized)
    cont_stage_1: 0,         // biased tilt
    cont_stage_2: 0,         // interpretation juxtaposition
    cont_stage_3: 0,         // hypercompletion

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
 * @param {number} [engineOutput.user_valence]   - session user emotion VAD
 * @param {number} [engineOutput.user_arousal]
 * @param {number} [engineOutput.user_dominance]
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
    user_valence = 0,
    user_arousal = 0,
    user_dominance = 0,
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

  // 4b. Drift direction vector (weighted by driftSignal)
  const dirV = user_valence * driftSignal;
  const dirA = user_arousal * driftSignal;
  const dirD = user_dominance * driftSignal;
  next.drift_dir_v = α * dirV + (1 - α) * next.drift_dir_v;
  next.drift_dir_a = α * dirA + (1 - α) * next.drift_dir_a;
  next.drift_dir_d = α * dirD + (1 - α) * next.drift_dir_d;
  next.lifetime_dir_v_sum += dirV;
  next.lifetime_dir_a_sum += dirA;
  next.lifetime_dir_d_sum += dirD;

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

  // ─── 3-axis vector (오염벡터 v2 spec §6) ────────────────────────
  const depth = next.cont_depth;
  const decay3 = 1 / (1 + depth * CONTAMINATION.DECAY_RATE);

  // 6a. Divergence — molecular clock saturation model
  const delta_div = (1 - effectiveShape) * (1 - level);
  next.cont_divergence = clamp01(next.cont_divergence + delta_div * decay3);

  // 6b. Convergence — immune pressure convergent evolution
  //     Gated: depth >= MIN_DEPTH_FOR_CONVERGENCE (shape must be observable)
  let delta_conv = 0;
  if (depth >= CONTAMINATION.MIN_DEPTH_FOR_CONVERGENCE) {
    if (fixation_level >= CONTAMINATION.FIXATION_THRESHOLD) {
      delta_conv = alignment * CONTAMINATION.FIXATION_CONV_WEIGHT;
    } else if (effectiveShape >= 0.7 && level >= 0.7) {
      delta_conv = alignment * CONTAMINATION.HIGH_CONV_WEIGHT;
    } else if (alignment >= 0.5) {
      delta_conv = alignment * CONTAMINATION.MID_CONV_WEIGHT;
    }
  }
  next.cont_convergence = clamp01(next.cont_convergence + delta_conv * decay3);

  // 6c. Heterogeneity — Welford online variance (quasispecies cloud width)
  if (depth >= 1) {
    const d1 = alignment - next._cont_align_mean;
    next._cont_align_mean += d1 / depth;
    const d2 = alignment - next._cont_align_mean;
    next._cont_align_m2 += d1 * d2;

    if (depth >= 2) {
      const variance = next._cont_align_m2 / (depth - 1);
      next.cont_heterogeneity = clamp01(variance * CONTAMINATION.HETERO_SCALE);
    }
  }

  // 6d. Stage mixing — fitness landscape phases
  const raw_1 = next.cont_divergence * (1 - next.cont_convergence);
  const raw_2 = next.cont_heterogeneity * Math.min(depth / CONTAMINATION.DEPTH_THRESHOLD_S2, 1.0);
  const raw_3 = next.cont_convergence * (1 - next.cont_heterogeneity);
  const total = raw_1 + raw_2 + raw_3;

  if (total > 0) {
    next.cont_stage_1 = raw_1 / total;
    next.cont_stage_2 = raw_2 / total;
    next.cont_stage_3 = raw_3 / total;
  } else {
    next.cont_stage_1 = next.cont_stage_2 = next.cont_stage_3 = 0;
  }

  // 7. Snapshot last engine output (debug)
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
 * @param {Array} plays - array of { alignment, mismatch_type, transition_pattern?, user_emotion? }
 * @returns {Object} final contamination state
 */
export function replayFromPlays(plays) {
  let state = createEmptyState();

  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const alignment = p.alignment != null ? p.alignment : 0.5;

    // Convert user_emotion vector → VAD for drift direction
    let uV = 0, uA = 0, uD = 0;
    if (p.user_emotion && typeof p.user_emotion === 'object'
        && Object.values(p.user_emotion).some(v => v > 0)) {
      const vad = projectEmotionToVAD(p.user_emotion);
      uV = vad.v || 0;
      uA = vad.a || 0;
      uD = vad.d || 0;
    }

    state = updateContamination(state, {
      alignment,
      level: Math.sqrt(Math.max(0, alignment)),
      shape: Math.sqrt(Math.max(0, alignment)),
      shape_active: i >= 2,
      transition_pattern: p.transition_pattern || 'bridge',
      mismatch_type: p.mismatch_type || 'none',
      fixation_level: 0,
      user_valence: uV,
      user_arousal: uA,
      user_dominance: uD,
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
 * @returns {{ stage: string, intensity: number, band: string, drift_direction: Object, dominant_emotion_label: string }}
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

  return {
    stage, intensity, band,
    drift_direction: {
      valence: state.drift_dir_v || 0,
      arousal: state.drift_dir_a || 0,
      dominance: state.drift_dir_d || 0,
    },
    dominant_emotion_label: getDominantEmotionLabel(state),
    // 3-axis vector (for downstream consumers)
    divergence: state.cont_divergence || 0,
    convergence: state.cont_convergence || 0,
    heterogeneity: state.cont_heterogeneity || 0,
    stage_weights: {
      s1: state.cont_stage_1 || 0,
      s2: state.cont_stage_2 || 0,
      s3: state.cont_stage_3 || 0,
    },
  };
}

/**
 * Map drift direction VAD to a human-readable emotion label.
 * Simple quadrant classification (MVP level).
 *
 * @param {Object} state - contamination state with drift_dir_v, drift_dir_a
 * @returns {string} 'anger' | 'sadness' | 'excitement' | 'calm' | 'neutral'
 */
export function getDominantEmotionLabel(state) {
  const v = state.drift_dir_v || 0;
  const a = state.drift_dir_a || 0;
  if (v < -0.1 && a > 0.1)  return 'anger';
  if (v < -0.1 && a <= 0.1) return 'sadness';
  if (v >= 0.1 && a > 0.1)  return 'excitement';
  if (v >= 0.1 && a <= 0.1) return 'calm';
  return 'neutral';
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

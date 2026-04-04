// test/unit/math.test.js
// math.js 핵심 함수 단위 테스트

import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  calculateEmbeddingSimilarity,
  calculateVADSimilarity,
  normalizeVector,
  addVectors,
  subtractVectors,
  flattenDeltas,
  cosineFlat,
  calculateShapeSimilarity,
  calculateLevelSimilarity,
  calculateTrajectoryAlignment,
  calculateEmotionScore,
  getBucket,
  calculateFixationLevel,
  checkFixated,
  getDominantEmotion,
  normalizeAnchor,
  DEFAULT_EMOTION_ANCHORS,
} from '../../js/shared/math.js';

// ─── cosineSimilarity (17D emotion vector) ─────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const vec = { fear: 0.5, sadness: 0.3, anger: 0.2 };
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = { fear: 1.0, sadness: 0 };
    const b = { fear: 0, sadness: 1.0 };
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('returns 0 for null/undefined inputs', () => {
    expect(cosineSimilarity(null, { fear: 1 })).toBe(0);
    expect(cosineSimilarity({ fear: 1 }, null)).toBe(0);
    expect(cosineSimilarity(null, null)).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    const zero = { fear: 0, sadness: 0, anger: 0 };
    expect(cosineSimilarity(zero, { fear: 1 })).toBe(0);
  });

  it('uses custom anchor list when provided', () => {
    const a = { fear: 0.8, joy: 0.2 };
    const b = { fear: 0.1, joy: 0.9 };
    // Only joy considered → both have positive joy → high similarity
    const simJoyOnly = cosineSimilarity(a, b, ['joy']);
    expect(simJoyOnly).toBeCloseTo(1.0, 5);
  });

  it('handles Korean anchor normalization', () => {
    const a = { fear: 0.8, sadness: 0.2 };
    const b = { fear: 0.7, sadness: 0.3 };
    // '공포' → 'fear', '슬픔' → 'sadness'
    const sim = cosineSimilarity(a, b, ['공포', '슬픔']);
    expect(sim).toBeGreaterThan(0.9);
  });

  it('handles partial overlap (missing keys default to 0)', () => {
    const a = { fear: 1.0 };
    const b = { fear: 0.5, sadness: 0.5 };
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

// ─── calculateEmbeddingSimilarity (array-based cosine) ─────────

describe('calculateEmbeddingSimilarity', () => {
  it('returns 1 for identical arrays', () => {
    const vec = [0.1, 0.2, 0.3, 0.4];
    expect(calculateEmbeddingSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal arrays', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(calculateEmbeddingSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('clamps negative similarity to 0', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(calculateEmbeddingSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for invalid inputs', () => {
    expect(calculateEmbeddingSimilarity(null, [1])).toBe(0);
    expect(calculateEmbeddingSimilarity([1], null)).toBe(0);
    expect(calculateEmbeddingSimilarity([], [])).toBe(0);
    expect(calculateEmbeddingSimilarity([1, 2], [1])).toBe(0); // length mismatch
  });
});

// ─── calculateVADSimilarity ────────────────────────────────────

describe('calculateVADSimilarity', () => {
  it('returns 1 for identical VAD', () => {
    const vad = { v: 0.5, a: -0.3, d: 0.7 };
    expect(calculateVADSimilarity(vad, vad)).toBeCloseTo(1.0, 5);
  });

  it('returns low value for opposite VAD', () => {
    const a = { v: 1, a: 1, d: 1 };
    const b = { v: -1, a: -1, d: -1 };
    const sim = calculateVADSimilarity(a, b);
    expect(sim).toBeLessThan(0.1);
  });

  it('returns 0 for null input', () => {
    expect(calculateVADSimilarity(null, { v: 0, a: 0, d: 0 })).toBe(0);
  });

  it('returns 0 for NaN values', () => {
    expect(calculateVADSimilarity({ v: NaN, a: 0, d: 0 }, { v: 0, a: 0, d: 0 })).toBe(0);
  });

  it('custom decay factor affects steepness', () => {
    const a = { v: 0.5, a: 0, d: 0 };
    const b = { v: -0.5, a: 0, d: 0 };
    const simK3 = calculateVADSimilarity(a, b, 3.0);
    const simK1 = calculateVADSimilarity(a, b, 1.0);
    // Higher k → steeper decay → lower similarity for same distance
    expect(simK3).toBeLessThan(simK1);
  });
});

// ─── Vector operations ─────────────────────────────────────────

describe('normalizeVector', () => {
  it('normalizes to sum=1', () => {
    const result = normalizeVector({ a: 2, b: 3, c: 5 });
    const sum = Object.values(result).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 5);
    expect(result.a).toBeCloseTo(0.2, 5);
  });

  it('returns original for zero vector', () => {
    const zero = { a: 0, b: 0 };
    expect(normalizeVector(zero)).toEqual(zero);
  });
});

describe('addVectors', () => {
  it('adds matching keys', () => {
    expect(addVectors({ a: 1, b: 2 }, { a: 3, b: 4 })).toEqual({ a: 4, b: 6 });
  });

  it('handles non-overlapping keys', () => {
    expect(addVectors({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });
});

describe('subtractVectors', () => {
  it('subtracts matching keys', () => {
    expect(subtractVectors({ a: 5, b: 3 }, { a: 2, b: 1 })).toEqual({ a: 3, b: 2 });
  });

  it('handles missing keys (defaults to 0)', () => {
    const result = subtractVectors({ a: 1 }, { b: 2 });
    expect(result.a).toBe(1);
    expect(result.b).toBe(-2);
  });

  it('handles null inputs', () => {
    expect(subtractVectors(null, null)).toEqual({});
  });
});

// ─── cosineFlat (1D float array cosine) ────────────────────────

describe('cosineFlat', () => {
  it('returns 1 for identical arrays', () => {
    expect(cosineFlat([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 5);
  });

  it('returns -1 for negated arrays', () => {
    expect(cosineFlat([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for empty/mismatched arrays', () => {
    expect(cosineFlat([], [])).toBe(0);
    expect(cosineFlat([1, 2], [1])).toBe(0);
    expect(cosineFlat(null, [1])).toBe(0);
  });
});

// ─── flattenDeltas ─────────────────────────────────────────────

describe('flattenDeltas', () => {
  it('flattens delta array to 1D', () => {
    const deltas = [{ fear: 0.1, sadness: 0.2 }, { fear: 0.3, sadness: 0.4 }];
    const keys = ['fear', 'sadness'];
    const flat = flattenDeltas(deltas, keys);
    expect(flat).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('fills missing keys with 0', () => {
    const deltas = [{ fear: 0.5 }];
    const keys = ['fear', 'sadness'];
    expect(flattenDeltas(deltas, keys)).toEqual([0.5, 0]);
  });
});

// ─── calculateShapeSimilarity ──────────────────────────────────

describe('calculateShapeSimilarity', () => {
  it('returns inactive (1.0) for < 3 trajectory points', () => {
    const result = calculateShapeSimilarity(
      [{ fear: 0.1 }, { fear: 0.5 }],
      [{ fear: 0.2 }, { fear: 0.6 }]
    );
    expect(result).toEqual({ raw: 1.0, clamped: 1.0, active: false });
  });

  it('returns high similarity for parallel trajectories', () => {
    const userTraj = [
      { fear: 0.1, sadness: 0.2 },
      { fear: 0.3, sadness: 0.4 },
      { fear: 0.5, sadness: 0.6 },
    ];
    const origTraj = [
      { fear: 0.2, sadness: 0.1 },
      { fear: 0.4, sadness: 0.3 },
      { fear: 0.6, sadness: 0.5 },
    ];
    const result = calculateShapeSimilarity(userTraj, origTraj);
    expect(result.active).toBe(true);
    expect(result.clamped).toBeGreaterThan(0.8);
  });

  it('returns low similarity for diverging trajectories', () => {
    const userTraj = [
      { fear: 0.1, joy: 0.0 },
      { fear: 0.5, joy: 0.0 },
      { fear: 0.9, joy: 0.0 },
    ];
    const origTraj = [
      { fear: 0.0, joy: 0.1 },
      { fear: 0.0, joy: 0.5 },
      { fear: 0.0, joy: 0.9 },
    ];
    const result = calculateShapeSimilarity(userTraj, origTraj);
    expect(result.active).toBe(true);
    expect(result.clamped).toBeLessThan(0.5);
  });

  it('clamps negative raw to 0', () => {
    const userTraj = [
      { fear: 0.0, sadness: 1.0 },
      { fear: 1.0, sadness: 0.0 },
      { fear: 0.0, sadness: 1.0 },
    ];
    const origTraj = [
      { fear: 1.0, sadness: 0.0 },
      { fear: 0.0, sadness: 1.0 },
      { fear: 1.0, sadness: 0.0 },
    ];
    const result = calculateShapeSimilarity(userTraj, origTraj);
    expect(result.clamped).toBeGreaterThanOrEqual(0);
  });

  it('handles null trajectories', () => {
    const result = calculateShapeSimilarity(null, null);
    expect(result).toEqual({ raw: 1.0, clamped: 1.0, active: false });
  });
});

// ─── calculateLevelSimilarity ──────────────────────────────────

describe('calculateLevelSimilarity', () => {
  it('returns average of scene scores', () => {
    expect(calculateLevelSimilarity([0.8, 0.6, 0.4])).toBeCloseTo(0.6, 5);
  });

  it('returns 0 for empty array', () => {
    expect(calculateLevelSimilarity([])).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(calculateLevelSimilarity(null)).toBe(0);
  });

  it('returns single score for one element', () => {
    expect(calculateLevelSimilarity([0.75])).toBeCloseTo(0.75, 5);
  });
});

// ─── calculateTrajectoryAlignment ──────────────────────────────

describe('calculateTrajectoryAlignment', () => {
  it('multiplies level × shape × voidMod', () => {
    expect(calculateTrajectoryAlignment(0.8, 0.9, 1.0)).toBeCloseTo(0.72, 5);
  });

  it('applies void penalty (0.7)', () => {
    expect(calculateTrajectoryAlignment(0.8, 0.9, 0.7)).toBeCloseTo(0.504, 5);
  });

  it('clamps to [0, 1]', () => {
    expect(calculateTrajectoryAlignment(1.5, 1.0, 1.0)).toBe(1.0);
    expect(calculateTrajectoryAlignment(-0.5, 1.0, 1.0)).toBe(0);
  });
});

// ─── calculateEmotionScore ─────────────────────────────────────

describe('calculateEmotionScore', () => {
  it('uses embedding similarity when both have embeddings', () => {
    const user = { base: { fear: 0.1 }, embedding: [1, 0, 0] };
    const orig = { base: { fear: 0.9 }, embedding: [0, 1, 0] };
    // Embedding orthogonal → score ≈ 0
    expect(calculateEmotionScore(user, orig)).toBeCloseTo(0, 1);
  });

  it('falls back to cosine when no embeddings', () => {
    const user = { base: { fear: 0.8, sadness: 0.2 } };
    const orig = { base: { fear: 0.7, sadness: 0.3 } };
    const score = calculateEmotionScore(user, orig);
    expect(score).toBeGreaterThan(0.9);
  });

  it('works with bare vectors (no .base wrapper)', () => {
    const user = { fear: 0.5, sadness: 0.5 };
    const orig = { fear: 0.5, sadness: 0.5 };
    expect(calculateEmotionScore(user, orig)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for null inputs', () => {
    expect(calculateEmotionScore(null, { fear: 1 })).toBe(0);
  });
});

// ─── getBucket ─────────────────────────────────────────────────

describe('getBucket', () => {
  it('returns HIGH for alignment >= 0.50', () => {
    expect(getBucket(0.50)).toBe('HIGH');
    expect(getBucket(0.80)).toBe('HIGH');
  });

  it('returns MID for alignment 0.10 ~ 0.49', () => {
    expect(getBucket(0.30)).toBe('MID');
    expect(getBucket(0.10)).toBe('MID');
  });

  it('returns LOW for alignment < 0.10', () => {
    expect(getBucket(0.09)).toBe('LOW');
    expect(getBucket(0.0)).toBe('LOW');
  });

  // Hysteresis tests
  it('maintains HIGH when alignment drops to 0.40 (hysteresis)', () => {
    expect(getBucket(0.40, 'HIGH')).toBe('HIGH');
  });

  it('drops from HIGH when alignment < 0.40', () => {
    expect(getBucket(0.39, 'HIGH')).toBe('MID');
  });

  it('maintains LOW when alignment rises to 0.15 (hysteresis)', () => {
    expect(getBucket(0.15, 'LOW')).toBe('LOW');
  });

  it('exits LOW when alignment > 0.15', () => {
    expect(getBucket(0.16, 'LOW')).toBe('MID');
  });

  // FIXATED detection
  it('returns FIXATED when fixation level >= 0.85', () => {
    const history = [
      { fear: 0.8, sadness: 0.2 },
      { fear: 0.8, sadness: 0.2 },
      { fear: 0.8, sadness: 0.2 },
    ];
    expect(getBucket(0.70, null, history)).toBe('FIXATED');
  });

  it('does not FIXATE with diverse emotion history', () => {
    const history = [
      { fear: 0.9, sadness: 0.0 },
      { sadness: 0.9, fear: 0.0 },
      { joy: 0.9, fear: 0.0 },
    ];
    expect(getBucket(0.70, null, history)).toBe('HIGH');
  });
});

// ─── calculateFixationLevel ────────────────────────────────────

describe('calculateFixationLevel', () => {
  it('returns 0 for < 2 entries', () => {
    expect(calculateFixationLevel([])).toBe(0);
    expect(calculateFixationLevel([{ fear: 1 }])).toBe(0);
  });

  it('returns ~1.0 for identical repeated vectors', () => {
    const vec = { fear: 0.5, sadness: 0.3, anger: 0.2 };
    const level = calculateFixationLevel([vec, vec, vec]);
    expect(level).toBeCloseTo(1.0, 2);
  });

  it('returns low value for diverse vectors', () => {
    const history = [
      { fear: 1.0 },
      { joy: 1.0 },
      { anger: 1.0 },
    ];
    const level = calculateFixationLevel(history);
    expect(level).toBeLessThan(0.3);
  });

  it('uses only last 3 entries', () => {
    const old = { fear: 1.0 };
    const recent = { joy: 0.5, sadness: 0.5 };
    // 4 entries: only last 3 matter
    const level = calculateFixationLevel([old, recent, recent, recent]);
    expect(level).toBeCloseTo(1.0, 2);
  });

  it('handles string-based emotion history', () => {
    expect(calculateFixationLevel(['fear', 'fear', 'fear'])).toBeCloseTo(1.0, 2);
    expect(calculateFixationLevel(['fear', 'joy', 'anger'])).toBeCloseTo(0, 2);
  });
});

// ─── checkFixated (legacy compat) ──────────────────────────────

describe('checkFixated', () => {
  it('returns true for identical repeated vectors', () => {
    const vec = { fear: 0.5, sadness: 0.3 };
    expect(checkFixated([vec, vec, vec])).toBe(true);
  });

  it('returns false for diverse vectors', () => {
    expect(checkFixated([{ fear: 1 }, { joy: 1 }, { anger: 1 }])).toBe(false);
  });
});

// ─── getDominantEmotion ────────────────────────────────────────

describe('getDominantEmotion', () => {
  it('returns the key with highest value', () => {
    expect(getDominantEmotion({ fear: 0.2, sadness: 0.8, anger: 0.1 })).toBe('sadness');
  });

  it('returns sadness as default for empty/null', () => {
    expect(getDominantEmotion(null)).toBe('sadness');
    expect(getDominantEmotion({})).toBe('sadness');
  });
});

// ─── normalizeAnchor ───────────────────────────────────────────

describe('normalizeAnchor', () => {
  it('maps Korean to English', () => {
    expect(normalizeAnchor('공포')).toBe('fear');
    expect(normalizeAnchor('슬픔')).toBe('sadness');
    expect(normalizeAnchor('기쁨')).toBe('joy');
    expect(normalizeAnchor('그리움')).toBe('longing');
  });

  it('lowercases unknown anchors', () => {
    expect(normalizeAnchor('CustomEmotion')).toBe('customemotion');
  });

  it('handles null/undefined', () => {
    expect(normalizeAnchor(null)).toBe('');
    expect(normalizeAnchor(undefined)).toBe('');
  });

  it('trims whitespace', () => {
    expect(normalizeAnchor('  공포  ')).toBe('fear');
  });
});

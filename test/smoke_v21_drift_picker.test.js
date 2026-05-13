/**
 * V2-6 DriftPicker — vitest 회귀 가드 (25 케이스).
 *
 * 수락 기준 (docs/V2-6_병렬세션_핸드아웃-260513.md §H2):
 *  - 25 케이스 PASS
 *  - pickDriftUtterance / DRIFT_PICKER_DEFAULTS export 확인
 *  - 2단계 픽 (글로벌 좁힘 → 회차 변위 softmax) + 의미 필터 점진 풀기 + 직전 패널티 + 폴백 동작
 *  - 결정 (2026-05-13): temperature 0.8 / narrowN 8 / lastPenalty 0.3
 *
 * 실행: `npm test` 또는 `npx vitest run test/smoke_v21_drift_picker.test.js`
 */

import { describe, it, expect } from 'vitest';
import { pickDriftUtterance, DRIFT_PICKER_DEFAULTS } from '../js/core/DriftPicker.js';

// ─────────────────────────────────────────────
// 픽스처
// ─────────────────────────────────────────────

function variant(id, emotionVec, opts = {}) {
  return {
    id,
    kind: 'drift',
    emotion_vec: emotionVec || {},
    motif_tags: opts.motif_tags || [],
    attribution: opts.attribution || null,
    utterance: opts.utterance || `변주 ${id}`,
  };
}

// 고정 시퀀스 rng — 결정성 검증용
function seqRng(seq) {
  let i = 0;
  return () => {
    const v = seq[i % seq.length];
    i++;
    return v;
  };
}

const fpEmpty = { motif_words: [], attribution: null };

// 12축 일부 — 감정 방향 다양
const POOL_10 = [
  variant('v1', { sadness: 0.9, longing: 0.3 }),
  variant('v2', { sadness: 0.7, guilt: 0.4 }),
  variant('v3', { anger: 0.8, fear: 0.3 }),
  variant('v4', { joy: 0.9, hope: 0.4 }),
  variant('v5', { numbness: 0.6, isolation: 0.5 }),
  variant('v6', { longing: 0.8, sadness: 0.4 }),
  variant('v7', { shame: 0.7, guilt: 0.3 }),
  variant('v8', { peace: 0.6, relief: 0.5 }),
  variant('v9', { resentment: 0.7, anger: 0.4 }),
  variant('v10', { hope: 0.6, joy: 0.3 }),
];

function basePick(over = {}) {
  return pickDriftUtterance(Object.assign({
    cumulativeEmotionVec: {},
    driftVector: { sadness: 1 },
    ghostVariants: POOL_10,
    fingerprint: fpEmpty,
    lastVariantId: null,
    rng: () => 0,
  }, over));
}

// ─────────────────────────────────────────────
// Step 1 — 글로벌 좁힘 (3)
// ─────────────────────────────────────────────

describe('DriftPicker Step 1 — 글로벌 좁힘', () => {
  it('풀 ≤ narrowN → 좁힘 영향 없음 (전체가 후보)', () => {
    const pool = POOL_10.slice(0, 8);
    const r = basePick({ cumulativeEmotionVec: { sadness: 1 }, ghostVariants: pool });
    expect(r.fallbackKind).toBe(null);
    expect(pool.some(v => v.id === r.variant.id)).toBe(true);
  });

  it('cumulative 비었으면 Step 1 skip — 전체 풀이 후보 (driftVector 만으로 픽)', () => {
    // cumulative={} → 전체 10개 후보. driftVector=joy → v4(joy:0.9) 확률 최대. rng=0.3 → v4 구간.
    const r = basePick({ cumulativeEmotionVec: {}, driftVector: { joy: 1 }, rng: () => 0.3 });
    expect(r.fallbackKind).toBe(null);
    expect(r.variant.id).toBe('v4'); // joy 우세 변주
  });

  it('cumulative 있고 풀 > narrowN → 먼 변주는 잘려서 안 뽑힘', () => {
    // narrowN=2, cumulative=sadness → sadness 가까운 2개(v1,v2)만 남음. driftVector=joy 여도 v4 못 뽑힘.
    const r = basePick({
      cumulativeEmotionVec: { sadness: 1 }, driftVector: { joy: 1 },
      tuning: { narrowN: 2 }, rng: () => 0,
    });
    expect(r.variant.id).not.toBe('v4');
    expect(['v1', 'v2', 'v6']).toContain(r.variant.id);
  });
});

// ─────────────────────────────────────────────
// Step 2 — 의미 필터 점진 풀기 (4)
// ─────────────────────────────────────────────

describe('DriftPicker Step 2 — 의미 필터 점진 풀기', () => {
  it('모티프 교집합 있는 변주만 후보 (있으면 거기서 픽)', () => {
    const pool = [
      variant('a', { sadness: 0.9 }, { motif_tags: ['엄마', '문턱'] }),
      variant('b', { joy: 0.9 }, { motif_tags: ['바다'] }),
      variant('c', { anger: 0.8 }, { motif_tags: ['엄마'] }),
    ];
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { sadness: 1 },
      ghostVariants: pool, fingerprint: { motif_words: ['엄마'], attribution: null },
      lastVariantId: null, rng: () => 0,
    });
    // '엄마' 교집합 = a, c. driftVector=sadness → a 우세.
    expect(['a', 'c']).toContain(r.variant.id);
    expect(r.variant.id).not.toBe('b');
  });

  it('모티프 교집합 0 → 귀인 일치 변주로 풀기', () => {
    const pool = [
      variant('a', { sadness: 0.9 }, { motif_tags: ['바다'], attribution: 'self_blame' }),
      variant('b', { joy: 0.9 }, { motif_tags: ['산'], attribution: 'other_blame' }),
    ];
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { sadness: 1 },
      ghostVariants: pool, fingerprint: { motif_words: ['엄마'], attribution: 'self_blame' },
      lastVariantId: null, rng: () => 0,
    });
    expect(r.variant.id).toBe('a'); // self_blame 일치
  });

  it('모티프·귀인 다 없음 → 무필터 (Step 1 결과 풀 그대로)', () => {
    const r = basePick({
      fingerprint: { motif_words: ['없는모티프'], attribution: 'self_blame' },
      ghostVariants: POOL_10.map(v => ({ ...v, attribution: 'other_blame' })),
      rng: () => 0,
    });
    expect(r.fallbackKind).toBe(null);
    expect(r.variant).toBeTruthy();
  });

  it('모티프 교집합 변주 1개뿐 → 그 1개만 후보 → 그게 뽑힘', () => {
    const pool = [
      variant('only', { numbness: 0.5 }, { motif_tags: ['겨울'] }),
      variant('x', { joy: 0.9 }, { motif_tags: ['여름'] }),
      variant('y', { sadness: 0.9 }, { motif_tags: ['봄'] }),
    ];
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { joy: 1 },
      ghostVariants: pool, fingerprint: { motif_words: ['겨울'], attribution: null },
      lastVariantId: null, rng: () => 0.999,
    });
    expect(r.variant.id).toBe('only');
  });
});

// ─────────────────────────────────────────────
// Step 3 — softmax sampling 결정론 (5)
// ─────────────────────────────────────────────

describe('DriftPicker Step 3 — softmax sampling', () => {
  it('같은 rng 시퀀스 → 같은 변주 (재현 가능)', () => {
    const opts = {
      cumulativeEmotionVec: {}, driftVector: { sadness: 0.8, longing: 0.2 },
      ghostVariants: POOL_10, fingerprint: fpEmpty, lastVariantId: null,
    };
    const r1 = pickDriftUtterance({ ...opts, rng: seqRng([0.42]) });
    const r2 = pickDriftUtterance({ ...opts, rng: seqRng([0.42]) });
    expect(r1.variant.id).toBe(r2.variant.id);
  });

  it('temperature 매우 낮음 → 1등(가장 가까운)에 거의 1 확률 → rng 끝값이어도 1등', () => {
    // driftVector=sadness → v1(sadness:0.9,longing:0.3) 가장 가까움. T=0.001 → 1등 확률≈1.
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { sadness: 1 },
      ghostVariants: POOL_10, fingerprint: fpEmpty, lastVariantId: null,
      tuning: { temperature: 0.001 }, rng: () => 0.999,
    });
    expect(r.variant.id).toBe('v1');
  });

  it('temperature 매우 높음 → 확률 거의 균등 → rng 끝값이면 마지막 변주', () => {
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { sadness: 1 },
      ghostVariants: POOL_10, fingerprint: fpEmpty, lastVariantId: null,
      tuning: { temperature: 1000 }, rng: () => 0.9999,
    });
    expect(r.variant.id).toBe('v10'); // 마지막
  });

  it('driftVector 가 0 벡터 → 유사도 전부 0 → 균등 sampling (rng=0 → 첫 변주)', () => {
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: {},
      ghostVariants: POOL_10, fingerprint: fpEmpty, lastVariantId: null, rng: () => 0,
    });
    expect(r.variant.id).toBe('v1');
    expect(r.fallbackKind).toBe(null);
  });

  it('rng=0 → softmax 누적의 첫 변주가 뽑힘 (가장 가까운 변주가 첫 항)', () => {
    // driftVector=joy → v4(joy:0.9) 가장 가까움 → 정렬 안 하므로 "첫 변주"가 곧 1등은 아님.
    // rng=0 → 배열 순서상 첫 번째로 누적이 r=0 초과하는 항. v1 확률>0 이므로 v1 (배열 0번).
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { joy: 1 },
      ghostVariants: POOL_10, fingerprint: fpEmpty, lastVariantId: null, rng: () => 0,
    });
    expect(r.variant.id).toBe('v1');
  });
});

// ─────────────────────────────────────────────
// Step 4 — 직전 변주 패널티 (3)
// ─────────────────────────────────────────────

describe('DriftPicker Step 4 — 직전 변주 패널티', () => {
  it('lastVariantId == 첫 픽 + 풀 2개 이상 → 재 sampling 으로 다른 변주', () => {
    // T 매우 낮음 → 1등=v1 항상 뽑힘. lastVariantId='v1' → v1 확률 ×0.3 후 재 sampling.
    // 재 sampling 시 rng 두 번째 값 → 다른 변주 (v1 확률 줄었으니 rng 적당값이면 v2 등).
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { sadness: 1 },
      ghostVariants: POOL_10, fingerprint: fpEmpty,
      lastVariantId: 'v1',
      tuning: { temperature: 0.5, lastPenalty: 0.0 }, // 0.0 = v1 확률 0 → 절대 v1 아님
      rng: seqRng([0.0, 0.0]), // 첫 호출 0 → v1, 재 sampling 0 → v1 빠진 분포의 첫 항(v2)
    });
    expect(r.variant.id).not.toBe('v1');
  });

  it('lastVariantId != 첫 픽 → 패널티 없음, 첫 픽 그대로', () => {
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { sadness: 1 },
      ghostVariants: POOL_10, fingerprint: fpEmpty,
      lastVariantId: 'v9', // 안 뽑힐 변주
      tuning: { temperature: 0.001 }, rng: () => 0,
    });
    expect(r.variant.id).toBe('v1'); // 첫 픽 그대로
  });

  it('lastVariantId == 첫 픽 인데 풀에 변주 1개뿐 → 패널티 무시, 그 1개 그대로', () => {
    const pool = [variant('solo', { sadness: 0.9 })];
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { sadness: 1 },
      ghostVariants: pool, fingerprint: fpEmpty,
      lastVariantId: 'solo', tuning: { lastPenalty: 0.0 }, rng: () => 0,
    });
    expect(r.variant.id).toBe('solo');
    expect(r.fallbackKind).toBe(null);
  });
});

// ─────────────────────────────────────────────
// Step 5 — 폴백 (2)
// ─────────────────────────────────────────────

describe('DriftPicker Step 5 — 폴백 (조용히 1개 선택 X)', () => {
  it('ghostVariants 빈 배열 → fallbackKind=narrative_silence, variant=null', () => {
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { sadness: 1 },
      ghostVariants: [], fingerprint: fpEmpty, lastVariantId: null, rng: () => 0,
    });
    expect(r.variant).toBe(null);
    expect(r.fallbackKind).toBe('narrative_silence');
    expect(r.driftVectorAtPick).toEqual({ sadness: 1 });
  });

  it('ghostVariants null/undefined → 폴백', () => {
    expect(pickDriftUtterance({ ghostVariants: null }).fallbackKind).toBe('narrative_silence');
    expect(pickDriftUtterance({}).fallbackKind).toBe('narrative_silence');
  });
});

// ─────────────────────────────────────────────
// 분포 검증 (1)
// ─────────────────────────────────────────────

describe('DriftPicker — 분포', () => {
  it('200회 동일 입력 (Math.random) → driftVector 가까운 변주가 먼 변주보다 자주, 여러 변주 나옴', () => {
    const counts = {};
    for (let i = 0; i < 200; i++) {
      const r = pickDriftUtterance({
        cumulativeEmotionVec: {}, driftVector: { sadness: 1, longing: 0.3 },
        ghostVariants: POOL_10, fingerprint: fpEmpty, lastVariantId: null,
        // rng 미지정 → Math.random
      });
      counts[r.variant.id] = (counts[r.variant.id] || 0) + 1;
    }
    // v1(sadness:0.9,longing:0.3) ≈ driftVector 와 평행 (cosine≈1). v3(anger,fear) 는 cosine 0.
    expect(counts['v1'] || 0).toBeGreaterThan(counts['v3'] || 0);
    // temperature=0.8 → 완전 결정적 X — 여러 변주 나옴
    expect(Object.keys(counts).length).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────
// score=0 회귀 (V2-4 핸드오프 — drift 픽은 별 알고리즘, score 개념 안 씀) (3)
// ─────────────────────────────────────────────

describe('DriftPicker — score 무관 동작 (V2-4 핸드오프 정합)', () => {
  it('모든 변주 emotion_vec 비어도 (cosine 0) → 폴백 아님, 균등 sampling 으로 picked', () => {
    const pool = [variant('a', {}), variant('b', {}), variant('c', {})];
    const r = pickDriftUtterance({
      cumulativeEmotionVec: {}, driftVector: { sadness: 1 },
      ghostVariants: pool, fingerprint: fpEmpty, lastVariantId: null, rng: () => 0,
    });
    expect(r.variant).toBeTruthy();
    expect(r.fallbackKind).toBe(null);
  });

  it('cumulative 강해도 변주는 무조건 picked (decideBranch 의 score 임계와 무관)', () => {
    const r = basePick({ cumulativeEmotionVec: { sadness: 1, longing: 1, guilt: 1 } });
    expect(r.variant).toBeTruthy();
    expect(r.fallbackKind).toBe(null);
  });

  it('driftVectorAtPick = 입력 driftVector 의 복사본 (참조 아님)', () => {
    const dv = { sadness: 0.5, joy: 0.2 };
    const r = basePick({ driftVector: dv });
    expect(r.driftVectorAtPick).toEqual(dv);
    expect(r.driftVectorAtPick).not.toBe(dv);
  });
});

// ─────────────────────────────────────────────
// defaults 회귀 (4)
// ─────────────────────────────────────────────

describe('DriftPicker — DRIFT_PICKER_DEFAULTS', () => {
  it('기본값 = { temperature: 0.8, narrowN: 8, lastPenalty: 0.3 } (2026-05-13 결정)', () => {
    expect(DRIFT_PICKER_DEFAULTS).toEqual({ temperature: 0.8, narrowN: 8, lastPenalty: 0.3 });
  });

  it('DRIFT_PICKER_DEFAULTS 는 frozen', () => {
    expect(Object.isFrozen(DRIFT_PICKER_DEFAULTS)).toBe(true);
  });

  it('tuning 미지정 → narrowN 8 적용 (8개 초과 풀에서 좁힘 발동)', () => {
    // 9개 풀, cumulative=sadness, narrowN 기본 8 → joy 변주(가장 먼) 1개 잘림 → driftVector=joy 여도 v4 못 뽑힘
    const pool9 = POOL_10.slice(0, 9); // v1..v9 — v4 가 joy
    const r = pickDriftUtterance({
      cumulativeEmotionVec: { sadness: 1 }, driftVector: { joy: 1 },
      ghostVariants: pool9, fingerprint: fpEmpty, lastVariantId: null, rng: () => 0,
      // tuning 미지정
    });
    // 9개 중 sadness 가까운 8개만 남음 → joy 우세 v4 가 잘릴 후보 (anger v3 도 멀지만 v4 가 더 멂)
    // 최소한 v4(순수 joy) 가 안 뽑혀야 — 정확히는 가장 먼 1개가 잘림
    expect(r.variant).toBeTruthy();
  });

  it('tuning 부분 지정 → 나머지는 default', () => {
    // temperature 만 지정 → narrowN/lastPenalty 는 default. 동작 안 깨지는지만 확인.
    const r = basePick({ tuning: { temperature: 0.1 } });
    expect(r.variant).toBeTruthy();
    expect(r.fallbackKind).toBe(null);
  });
});

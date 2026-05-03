/**
 * V2.1 SeekerMatchEngine — vitest 회귀 가드.
 *
 * 작업 0 수락 기준:
 *  - 모든 테스트 PASS
 *  - export 8 종 (DEFAULT_WEIGHTS, emotionCosine, motifOverlap, scoreCard,
 *    pickTopMemory, pickGhostVariant, memoryToCard, ghostVariantToCard) 확인
 *  - V2.1 §15-1 명제 시연: 같은 메모리·다른 seeker 가 다른 유령 변주 선택
 *
 * 실행: `npm test` 또는 `npx vitest run test/smoke_v21_match_engine.test.js`
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  emotionCosine,
  motifOverlap,
  scoreCard,
  pickTopMemory,
  pickGhostVariant,
  memoryToCard,
  ghostVariantToCard,
} from '../js/core/SeekerMatchEngine.js';

// ─────────────────────────────────────────────
// 픽스처
// ─────────────────────────────────────────────

// Mina — 엄마 보고싶음, self_blame, 후각
const seekerMina = {
  emotion_vec: { longing: 0.88, sadness: 0.72, guilt: 0.61 },
  attribution: 'self_blame',
  core_fear: 'abandonment',
  modality: 'olfactory',
  role: 'actor',
  motif_words: ['엄마', '김치찌개', '잘했어야'],
};

// Sujin — 엄마 미움, other_blame, anger 우세
const seekerSujin = {
  emotion_vec: { anger: 0.85, sadness: 0.40, longing: 0.30 },
  attribution: 'other_blame',
  core_fear: 'rejection',
  modality: 'visual',
  role: 'actor',
  motif_words: ['엄마', '미웠어'],
};

const tMomLeft = {
  emotion_vec: { longing: 0.85, sadness: 0.70, guilt: 0.55 },
  attribution: 'self_blame', core_fear: 'abandonment', modality: 'olfactory',
  motif_tags: ['엄마', '겨울', '문턱'],
};
const tAngerFriend = {
  emotion_vec: { anger: 0.85, sadness: 0.30 },
  attribution: 'other_blame', core_fear: 'rejection',
  motif_tags: ['친구', '말다툼'],
};
const tGrandma = {
  emotion_vec: { longing: 0.40, sadness: 0.20, joy: 0.30 },
  attribution: null, core_fear: null, modality: 'olfactory',
  motif_tags: ['할머니', '부엌', '김치찌개'],
};

// ─────────────────────────────────────────────
// emotionCosine
// ─────────────────────────────────────────────

describe('emotionCosine', () => {
  it('동일 벡터 → 1', () => {
    expect(emotionCosine({ sadness: 1 }, { sadness: 1 })).toBeCloseTo(1, 5);
  });
  it('직교 (sadness vs joy) → 0', () => {
    expect(emotionCosine({ sadness: 1 }, { joy: 1 })).toBe(0);
  });
  it('정렬된 2D 닮은꼴 > 0.99', () => {
    expect(emotionCosine(
      { sadness: 0.8, longing: 0.6 },
      { sadness: 0.7, longing: 0.5 },
    )).toBeGreaterThan(0.99);
  });
  it('null/empty → 0', () => {
    expect(emotionCosine(null, { sadness: 1 })).toBe(0);
    expect(emotionCosine({}, { sadness: 1 })).toBe(0);
    expect(emotionCosine({ sadness: 1 }, undefined)).toBe(0);
  });
  it('한쪽만 추가 키 (sadness 1) vs (sadness 1, joy 1) ≈ 1/√2', () => {
    expect(emotionCosine({ sadness: 1 }, { sadness: 1, joy: 1 }))
      .toBeCloseTo(1 / Math.sqrt(2), 5);
  });
  it('대칭성', () => {
    const a = { x: 0.7, y: 0.3 };
    const b = { x: 0.4, y: 0.9 };
    expect(emotionCosine(a, b)).toBeCloseTo(emotionCosine(b, a), 10);
  });
});

// ─────────────────────────────────────────────
// motifOverlap
// ─────────────────────────────────────────────

describe('motifOverlap', () => {
  it('정확 일치 — 1/2', () => {
    expect(motifOverlap(['엄마', '겨울'], ['엄마', '문턱'])).toBe(0.5);
  });
  it('agglutinative — "엄마가" word 안의 "엄마" tag → hit', () => {
    expect(motifOverlap(['엄마가'], ['엄마'])).toBe(1);
  });
  it('빈 입력 → 0', () => {
    expect(motifOverlap([], ['엄마'])).toBe(0);
    expect(motifOverlap(['엄마'], [])).toBe(0);
  });
  it('대소문자 무관', () => {
    expect(motifOverlap(['MOM'], ['mom'])).toBe(1);
  });
  it('빈 문자열 tag 안전', () => {
    expect(motifOverlap(['엄마'], [''])).toBe(0);
  });
});

// ─────────────────────────────────────────────
// scoreCard
// ─────────────────────────────────────────────

describe('scoreCard — Mina 시나리오', () => {
  it('MomLeft 점수 > AngerFriend', () => {
    expect(scoreCard(seekerMina, tMomLeft).score)
      .toBeGreaterThan(scoreCard(seekerMina, tAngerFriend).score);
  });
  it('MomLeft 점수 > Grandma', () => {
    expect(scoreCard(seekerMina, tMomLeft).score)
      .toBeGreaterThan(scoreCard(seekerMina, tGrandma).score);
  });
  it('breakdown 5필드', () => {
    const b = scoreCard(seekerMina, tMomLeft).breakdown;
    expect(b).toHaveProperty('emotion');
    expect(b).toHaveProperty('attribution');
    expect(b).toHaveProperty('coreFear');
    expect(b).toHaveProperty('motif');
    expect(b).toHaveProperty('modality');
  });
  it('null seeker/target → 0', () => {
    expect(scoreCard(null, tMomLeft).score).toBe(0);
    expect(scoreCard(seekerMina, null).score).toBe(0);
  });
});

describe('scoreCard — 가중치', () => {
  it('α=100 → 감정 cosine 압도', () => {
    expect(scoreCard(seekerMina, tMomLeft, { ...DEFAULT_WEIGHTS, alpha: 100 }).score)
      .toBeGreaterThan(90);
  });
  it('motif 만 100배 → 점수 = 100 × motif_overlap', () => {
    const s = scoreCard(seekerMina, tMomLeft, { alpha: 0, beta: 0, gamma: 0, delta: 100, epsilon: 0 });
    const baseMotif = scoreCard(seekerMina, tMomLeft).breakdown.motif;
    expect(s.score).toBeCloseTo(100 * baseMotif, 5);
  });
  it('모든 가중치 0 → 0', () => {
    expect(scoreCard(seekerMina, tMomLeft,
      { alpha: 0, beta: 0, gamma: 0, delta: 0, epsilon: 0 }).score).toBe(0);
  });
});

describe('scoreCard — categorical 슬롯', () => {
  it('attribution 양쪽 unknown → 보너스 0', () => {
    const s = scoreCard(
      { ...seekerMina, attribution: 'unknown' },
      { ...tMomLeft, attribution: 'unknown' },
    );
    expect(s.breakdown.attribution).toBe(0);
  });
  it('core_fear 양쪽 none → 보너스 0', () => {
    const s = scoreCard(
      { ...seekerMina, core_fear: 'none' },
      { ...tMomLeft, core_fear: 'none' },
    );
    expect(s.breakdown.coreFear).toBe(0);
  });
  it('attribution null → 보너스 0', () => {
    const s = scoreCard({ ...seekerMina, attribution: null }, tMomLeft);
    expect(s.breakdown.attribution).toBe(0);
  });
  it('attribution 양쪽 self_blame → 보너스 1', () => {
    const s = scoreCard(seekerMina, tMomLeft);
    expect(s.breakdown.attribution).toBe(1);
  });
});

// ─────────────────────────────────────────────
// pickTopMemory
// ─────────────────────────────────────────────

const memories = [
  { id: 'mom-left',     original_vector: tMomLeft.emotion_vec,     attribution: 'self_blame',  core_fear: 'abandonment', modality: 'olfactory', motif_tags: tMomLeft.motif_tags },
  { id: 'anger-friend', original_vector: tAngerFriend.emotion_vec, attribution: 'other_blame', core_fear: 'rejection',                          motif_tags: tAngerFriend.motif_tags },
  { id: 'grandma',      original_vector: tGrandma.emotion_vec,                                                            modality: 'olfactory', motif_tags: tGrandma.motif_tags },
];

describe('pickTopMemory', () => {
  it('Mina → mom-left 1등', () => {
    const top = pickTopMemory(seekerMina, memories);
    expect(top).not.toBeNull();
    expect(top.memory.id).toBe('mom-left');
  });
  it('runnerUpDelta > 0', () => {
    expect(pickTopMemory(seekerMina, memories).runnerUpDelta).toBeGreaterThan(0);
  });
  it('빈 풀 → null', () => {
    expect(pickTopMemory(seekerMina, [])).toBeNull();
  });
  it('점수 모두 0 → null', () => {
    expect(pickTopMemory(
      { emotion_vec: {}, motif_words: [] },
      [{ id: 'x', original_vector: {} }],
    )).toBeNull();
  });
  it('결정론 — 같은 입력 → 같은 결과', () => {
    const a = pickTopMemory(seekerMina, memories);
    const b = pickTopMemory(seekerMina, memories);
    expect(a.memory.id).toBe(b.memory.id);
    expect(a.score).toBe(b.score);
  });
});

// ─────────────────────────────────────────────
// pickGhostVariant — V2.1 §15-1 핵심
// ─────────────────────────────────────────────

const ghostVariants = [
  { id: 'mom-blame',  emotion_vec: { anger: 0.4, longing: 0.3 },               attribution: 'other_blame', core_fear: 'rejection',   motif_tags: ['엄마'] },
  { id: 'self-blame', emotion_vec: { guilt: 0.7, sadness: 0.6, longing: 0.5 }, attribution: 'self_blame',  core_fear: 'abandonment', motif_tags: ['엄마', '잘했어야'] },
  { id: 'fate-blank', emotion_vec: { numbness: 0.6 },                          attribution: 'fate_blame',  core_fear: 'none',        motif_tags: ['그냥'] },
];

describe('pickGhostVariant — V2.1 명제 시연', () => {
  it('Mina (self_blame + abandonment) → self-blame 변주', () => {
    const v = pickGhostVariant(seekerMina, ghostVariants);
    expect(v.variant.id).toBe('self-blame');
  });
  it('Sujin (other_blame + rejection) → mom-blame 변주', () => {
    const v = pickGhostVariant(seekerSujin, ghostVariants);
    expect(v.variant.id).toBe('mom-blame');
  });
  it('§15-1 시연 — 같은 메모리, 두 seeker 가 다른 유령', () => {
    const vMina = pickGhostVariant(seekerMina, ghostVariants);
    const vSujin = pickGhostVariant(seekerSujin, ghostVariants);
    expect(vMina.variant.id).not.toBe(vSujin.variant.id);
  });
  it('runnerUpDelta > 0', () => {
    expect(pickGhostVariant(seekerMina, ghostVariants).runnerUpDelta).toBeGreaterThan(0);
  });
  it('빈 풀 → null', () => {
    expect(pickGhostVariant(seekerMina, [])).toBeNull();
  });
});

// ─────────────────────────────────────────────
// memoryToCard 어댑터
// ─────────────────────────────────────────────

describe('memoryToCard', () => {
  it('original_vector 우선', () => {
    const c = memoryToCard({ original_vector: { sadness: 1 }, motif_tags: ['엄마'] });
    expect(c.emotion_vec.sadness).toBe(1);
    expect(c.motif_tags).toContain('엄마');
  });
  it('scenes original_emotion 평균 fallback', () => {
    const c = memoryToCard({
      scenes: [
        { original_emotion: { sadness: 0.6 } },
        { original_emotion: { sadness: 0.4, joy: 0.2 } },
      ],
    });
    expect(c.emotion_vec.sadness).toBeCloseTo(0.5, 5);
    expect(c.emotion_vec.joy).toBeCloseTo(0.1, 5);
  });
  it('scenes original_emotion JSON string 파싱', () => {
    const c = memoryToCard({
      scenes: [{ original_emotion: '{"fear":0.7}' }],
    });
    expect(c.emotion_vec.fear).toBeCloseTo(0.7, 5);
  });
  it('없는 슬롯 → null', () => {
    const c = memoryToCard({ original_vector: {} });
    expect(c.attribution).toBeNull();
    expect(c.core_fear).toBeNull();
    expect(c.modality).toBeNull();
    expect(c.role).toBeNull();
  });
  it('null memory 안전', () => {
    const c = memoryToCard(null);
    expect(c.emotion_vec).toEqual({});
    expect(c.motif_tags).toEqual([]);
  });
  it('memory-level + scene-level motif_tags 합집합', () => {
    const c = memoryToCard({
      motif_tags: ['엄마'],
      scenes: [{ meta: { motif_tags: ['겨울'] } }, { motif_tags: ['문턱'] }],
    });
    expect(c.motif_tags).toEqual(expect.arrayContaining(['엄마', '겨울', '문턱']));
  });
});

// ─────────────────────────────────────────────
// ghostVariantToCard 어댑터
// ─────────────────────────────────────────────

describe('ghostVariantToCard', () => {
  it('필드 보존', () => {
    const c = ghostVariantToCard({
      emotion_vec: { sadness: 0.5 },
      attribution: 'self_blame',
      motif_tags: ['엄마'],
    });
    expect(c.emotion_vec.sadness).toBe(0.5);
    expect(c.attribution).toBe('self_blame');
    expect(c.motif_tags).toContain('엄마');
  });
  it('없는 슬롯 → null', () => {
    expect(ghostVariantToCard({ emotion_vec: {} }).core_fear).toBeNull();
  });
  it('null variant 안전', () => {
    const c = ghostVariantToCard(null);
    expect(c.emotion_vec).toEqual({});
    expect(c.motif_tags).toEqual([]);
  });
  it('motif_tags 비배열 → []', () => {
    expect(ghostVariantToCard({ motif_tags: 'not-array' }).motif_tags).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// DEFAULT_WEIGHTS
// ─────────────────────────────────────────────

describe('DEFAULT_WEIGHTS', () => {
  it('5 슬롯 모두 정의', () => {
    expect(DEFAULT_WEIGHTS).toMatchObject({
      alpha: expect.any(Number),
      beta: expect.any(Number),
      gamma: expect.any(Number),
      delta: expect.any(Number),
      epsilon: expect.any(Number),
    });
  });
  it('Object.freeze — 변경 불가', () => {
    expect(Object.isFrozen(DEFAULT_WEIGHTS)).toBe(true);
  });
});

// V2-4 분기 트리거 (classifyBranch) 는 본 파일에서 분리 — js/core/GhostBranchTrigger.js +
// test/smoke_v21_branch_trigger.test.js (decideBranch / buildSpeciationRow) 로 이전.

// ─────────────────────────────────────────────
// V2-1 마이그레이션 컬럼 명세 잠금
// supabase/migrations/20260503000000_v21_ghost_variants_and_dialog_turns.sql
// ghost_variants 컬럼명/제약 enum 이 바뀌면 본 describe 가 빨개짐.
// 매칭 점수 조용한 0 fallback (없는 슬롯 → null → 보너스 0) 방지.
// ─────────────────────────────────────────────

describe('V2-1 마이그레이션 명세 잠금 — ghost_variants 컬럼', () => {
  it('마이그레이션 row 6 슬롯 모두 SeekerCard 로 보존', () => {
    const row = {
      id: 'uuid-1',
      memory_id: 'mem-1',
      kind: 'drift',
      parent_variant_id: null,
      emotion_vec: { sadness: 0.7, longing: 0.5 },
      attribution: 'self_blame',
      core_fear: 'abandonment',
      modality: 'olfactory',
      role: 'actor',
      motif_tags: ['엄마', '겨울'],
      utterance: '내가 늦었어',
      pose: 'crouched',
      created_by: null,
      is_seed: true,
      created_at: '2026-05-03T00:00:00Z',
    };
    const card = ghostVariantToCard(row);
    expect(card.emotion_vec).toEqual({ sadness: 0.7, longing: 0.5 });
    expect(card.attribution).toBe('self_blame');
    expect(card.core_fear).toBe('abandonment');
    expect(card.modality).toBe('olfactory');
    expect(card.role).toBe('actor');
    expect(card.motif_tags).toEqual(['엄마', '겨울']);
  });

  it('어댑터가 카드 6 슬롯 외 컬럼은 SeekerCard 에 누출하지 않음', () => {
    const row = {
      emotion_vec: {},
      id: 'uuid-1',
      memory_id: 'mem-1',
      kind: 'drift',
      parent_variant_id: 'parent-1',
      utterance: '발화',
      pose: 'standing',
      is_seed: true,
      created_by: 'user-1',
      created_at: '2026-05-03',
    };
    const card = ghostVariantToCard(row);
    expect(card).not.toHaveProperty('id');
    expect(card).not.toHaveProperty('memory_id');
    expect(card).not.toHaveProperty('kind');
    expect(card).not.toHaveProperty('parent_variant_id');
    expect(card).not.toHaveProperty('utterance');
    expect(card).not.toHaveProperty('pose');
    expect(card).not.toHaveProperty('is_seed');
    expect(card).not.toHaveProperty('created_by');
    expect(card).not.toHaveProperty('created_at');
  });

  describe('attribution enum (CHECK 제약 4종)', () => {
    const VALUES = ['self_blame', 'other_blame', 'fate_blame', 'unknown'];
    VALUES.forEach((value) => {
      it(`'${value}' 보존`, () => {
        expect(ghostVariantToCard({ attribution: value }).attribution).toBe(value);
      });
    });
  });

  describe('core_fear enum (CHECK 제약 5종)', () => {
    const VALUES = ['abandonment', 'death', 'rejection', 'failure', 'none'];
    VALUES.forEach((value) => {
      it(`'${value}' 보존`, () => {
        expect(ghostVariantToCard({ core_fear: value }).core_fear).toBe(value);
      });
    });
  });

  describe('modality enum (CHECK 제약 5종)', () => {
    const VALUES = ['visual', 'olfactory', 'auditory', 'somatic', 'narrative'];
    VALUES.forEach((value) => {
      it(`'${value}' 보존`, () => {
        expect(ghostVariantToCard({ modality: value }).modality).toBe(value);
      });
    });
  });

  describe('role enum (CHECK 제약 3종)', () => {
    const VALUES = ['actor', 'observer', 'victim'];
    VALUES.forEach((value) => {
      it(`'${value}' 보존`, () => {
        expect(ghostVariantToCard({ role: value }).role).toBe(value);
      });
    });
  });

  describe('kind 별 사전 필터 (caller 책임, 어댑터 외부)', () => {
    const variants = [
      { id: 'd1', kind: 'drift',      emotion_vec: { sadness: 0.7 }, motif_tags: [] },
      { id: 'd2', kind: 'drift',      emotion_vec: { sadness: 0.6 }, motif_tags: [] },
      { id: 's1', kind: 'speciation', emotion_vec: { anger: 0.9 },   motif_tags: [] },
    ];

    it("kind='drift' 풀에서 1등 — 두 drift 중 하나", () => {
      const seeker = { emotion_vec: { sadness: 0.8 }, motif_words: [] };
      const drifts = variants.filter(v => v.kind === 'drift');
      const result = pickGhostVariant(seeker, drifts);
      expect(['d1', 'd2']).toContain(result.variant.id);
    });

    it("kind='speciation' 풀에서 1등 — 시드 1개", () => {
      const seeker = { emotion_vec: { anger: 0.9 }, motif_words: [] };
      const seeds = variants.filter(v => v.kind === 'speciation');
      expect(pickGhostVariant(seeker, seeds).variant.id).toBe('s1');
    });
  });
});

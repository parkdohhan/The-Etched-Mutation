/**
 * V2.1 GhostBranchTrigger — vitest 회귀 가드.
 *
 * V2-4 수락 기준:
 *  - 모든 테스트 PASS
 *  - export 3 종 (DEFAULT_THRESHOLDS, decideBranch, buildSpeciationRow) 확인
 *  - V2.1 §15-1 명제 시연:
 *      - 빈 풀 → speciation 'empty_pool'
 *      - 확실한 매칭 → drift
 *      - 명확한 새 path → speciation
 *      - 애매한 mid band → drift (보수)
 *  - SeekerMatchEngine 결과를 받아 임계 룰 적용 — LLM 호출 X 검증.
 *
 * 실행: `npm test` 또는 `npx vitest run test/smoke_v21_branch_trigger.test.js`
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  decideBranch,
  buildSpeciationRow,
} from '../js/core/GhostBranchTrigger.js';

// ─────────────────────────────────────────────
// 픽스처 — SeekerMatchEngine 점수 분포 검증된 것 활용
// ─────────────────────────────────────────────

// 매칭 1등 score 가 매우 높은 fingerprint (drift 케이스)
const seekerSelfBlame = {
  emotion_vec: { longing: 0.88, sadness: 0.72, guilt: 0.61 },
  attribution: 'self_blame',
  core_fear: 'abandonment',
  modality: 'olfactory',
  role: 'actor',
  motif_words: ['엄마', '김치찌개'],
};

// 풀 안에 거의 동일한 변주 — top score 가 0.7 이상 나오게 설계
const variantNearMatch = {
  id: 'v-near-1',
  emotion_vec: { longing: 0.85, sadness: 0.70, guilt: 0.60 },
  attribution: 'self_blame',
  core_fear: 'abandonment',
  modality: 'olfactory',
  role: 'actor',
  motif_tags: ['엄마', '김치찌개'],
};

// 다른 path — 낮은 score 유도. 편지 (α) 적용으로 score=0 도 topVariant 보존.
const variantFarMismatch = {
  id: 'v-far-1',
  emotion_vec: { anger: 0.9, joy: 0.05 },
  attribution: 'other_blame',
  core_fear: 'rejection',
  modality: 'auditory',
  role: 'observer',
  motif_tags: ['소음', '비명'],
};

// 중간대 — mid band 유도 (감정 강한 매칭 + 카테고리 mismatch).
// normalized 0.44 정도 → [0.4, 0.7) 범위 → drift mid_band_conservative.
const variantMidBand = {
  id: 'v-mid-1',
  emotion_vec: { longing: 0.8, sadness: 0.7, guilt: 0.5 },
  attribution: 'fate_blame',     // mismatch
  core_fear: 'failure',          // mismatch
  modality: 'auditory',          // mismatch
  role: 'observer',              // mismatch
  motif_tags: ['풀', '벽'],
};

// ─────────────────────────────────────────────
// export 표면
// ─────────────────────────────────────────────

describe('GhostBranchTrigger — export 표면', () => {
  it('DEFAULT_THRESHOLDS 키 + 값 범위', () => {
    expect(DEFAULT_THRESHOLDS).toBeDefined();
    expect(DEFAULT_THRESHOLDS.drift_high).toBeGreaterThan(0);
    expect(DEFAULT_THRESHOLDS.drift_high).toBeLessThanOrEqual(1);
    expect(DEFAULT_THRESHOLDS.speciation_low).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_THRESHOLDS.speciation_low).toBeLessThan(DEFAULT_THRESHOLDS.drift_high);
  });

  it('DEFAULT_THRESHOLDS 동결 (튜닝은 호출 시 인자로)', () => {
    expect(Object.isFrozen(DEFAULT_THRESHOLDS)).toBe(true);
  });

  it('decideBranch + buildSpeciationRow 함수 export', () => {
    expect(typeof decideBranch).toBe('function');
    expect(typeof buildSpeciationRow).toBe('function');
  });
});

// ─────────────────────────────────────────────
// decideBranch — 빈 풀 / null 안전
// ─────────────────────────────────────────────

describe('decideBranch — 빈 풀', () => {
  it('빈 배열 → speciation empty_pool', () => {
    const d = decideBranch(seekerSelfBlame, []);
    expect(d.kind).toBe('speciation');
    expect(d.reason).toBe('empty_pool');
    expect(d.topVariant).toBeNull();
    expect(d.topScore).toBe(0);
    expect(d.runnerUpDelta).toBe(0);
  });

  it('null 풀 → speciation empty_pool', () => {
    const d = decideBranch(seekerSelfBlame, null);
    expect(d.kind).toBe('speciation');
    expect(d.reason).toBe('empty_pool');
  });

  it('undefined 풀 → speciation empty_pool', () => {
    const d = decideBranch(seekerSelfBlame, undefined);
    expect(d.kind).toBe('speciation');
    expect(d.reason).toBe('empty_pool');
  });
});

// ─────────────────────────────────────────────
// decideBranch — 임계 분기
// ─────────────────────────────────────────────

describe('decideBranch — 임계 분기 (기본 0.7 / 0.4)', () => {
  it('top score 매우 높음 → drift top_score_high', () => {
    const d = decideBranch(seekerSelfBlame, [variantNearMatch]);
    expect(d.kind).toBe('drift');
    expect(d.reason).toBe('top_score_high');
    expect(d.topVariant).toBe(variantNearMatch);
    expect(d.topScore).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.drift_high);
  });

  it('top score 매우 낮음 → speciation top_score_low + topVariant 보존 (편지 (α))', () => {
    const d = decideBranch(seekerSelfBlame, [variantFarMismatch]);
    expect(d.kind).toBe('speciation');
    expect(d.reason).toBe('top_score_low');
    expect(d.topVariant).toBe(variantFarMismatch); // (α) — score 0 라도 1등 variant 보존
    expect(d.topScore).toBeLessThan(DEFAULT_THRESHOLDS.speciation_low);
  });

  it('top score mid band → drift mid_band_conservative (보수)', () => {
    const d = decideBranch(seekerSelfBlame, [variantMidBand]);
    expect(d.kind).toBe('drift');
    expect(d.reason).toBe('mid_band_conservative');
    expect(d.topScore).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.speciation_low);
    expect(d.topScore).toBeLessThan(DEFAULT_THRESHOLDS.drift_high);
  });

  it('다중 변주 — 1등 + runnerUpDelta 정상 산출', () => {
    const d = decideBranch(seekerSelfBlame, [variantNearMatch, variantFarMismatch, variantMidBand]);
    expect(d.topVariant).toBe(variantNearMatch); // 1등 = 가장 가까운
    expect(d.runnerUpDelta).toBeGreaterThan(0);
    expect(d.kind).toBe('drift');
  });
});

// ─────────────────────────────────────────────
// decideBranch — 커스텀 임계
// ─────────────────────────────────────────────

describe('decideBranch — 커스텀 thresholds', () => {
  it('drift_high 를 매우 높게 → 부분 매칭이 mid band 로 이동', () => {
    // 부분 매칭 — emotion 강하지만 modality/role mismatch (epsilon 빠짐).
    // normalized ≈ 0.85 → 기본(0.7)이면 drift, 커스텀(0.99)이면 mid band.
    const variantPartial = {
      id: 'v-partial-1',
      emotion_vec: { longing: 0.85, sadness: 0.70, guilt: 0.60 },
      attribution: 'self_blame',
      core_fear: 'abandonment',
      modality: 'somatic',  // mismatch (seeker olfactory)
      role: 'observer',     // mismatch (seeker actor)
      motif_tags: ['엄마', '김치찌개'],
    };
    const d = decideBranch(seekerSelfBlame, [variantPartial], {
      drift_high: 0.99,
      speciation_low: 0.4,
    });
    expect(d.kind).toBe('drift');
    expect(d.reason).toBe('mid_band_conservative');
  });

  it('speciation_low 를 매우 높게 → mid band 가 speciation 으로 이동', () => {
    const d = decideBranch(seekerSelfBlame, [variantMidBand], {
      drift_high: 0.99,
      speciation_low: 0.99, // mid band 도 speciation 으로
    });
    expect(d.kind).toBe('speciation');
    expect(d.reason).toBe('top_score_low');
  });
});

// ─────────────────────────────────────────────
// buildSpeciationRow — 페이로드 정합
// ─────────────────────────────────────────────

describe('buildSpeciationRow — ghost_variants INSERT 페이로드', () => {
  const fingerprint = {
    emotion_vec: { sadness: 0.6, anger: 0.4 },
    attribution: 'other_blame',
    core_fear: 'rejection',
    modality: 'visual',
    role: 'observer',
    motif_words: ['거울', '문'],
  };

  it('정상 케이스 — kind=speciation is_seed=false', () => {
    const row = buildSpeciationRow({
      memoryId: 'mem-1',
      parentVariantId: 'v-parent-1',
      fingerprint,
      utterance: '아무도 날 안 봤어.',
    });
    expect(row.memory_id).toBe('mem-1');
    expect(row.kind).toBe('speciation');
    expect(row.parent_variant_id).toBe('v-parent-1');
    expect(row.is_seed).toBe(false);
    expect(row.utterance).toBe('아무도 날 안 봤어.');
    expect(row.emotion_vec).toEqual(fingerprint.emotion_vec);
    expect(row.attribution).toBe('other_blame');
    expect(row.core_fear).toBe('rejection');
    expect(row.modality).toBe('visual');
    expect(row.role).toBe('observer');
    expect(row.motif_tags).toEqual(['거울', '문']);
  });

  it('motif_words → motif_tags 소문자 변환 + 빈 값/null 필터', () => {
    const row = buildSpeciationRow({
      memoryId: 'm',
      fingerprint: { motif_words: ['Mom', '', 'CRY', null] },
      utterance: 'x',
    });
    expect(row.motif_tags).toEqual(['mom', 'cry']);
  });

  it('utterance 빈 입력 → "..." placeholder (CHECK 제약 1자 이상)', () => {
    const row = buildSpeciationRow({
      memoryId: 'm', fingerprint, utterance: '',
    });
    expect(row.utterance).toBe('...');
    expect(row.utterance.length).toBeGreaterThanOrEqual(1);
  });

  it('utterance 공백만 → "..." placeholder', () => {
    const row = buildSpeciationRow({
      memoryId: 'm', fingerprint, utterance: '   \n\t  ',
    });
    expect(row.utterance).toBe('...');
  });

  it('utterance 1000자 초과 → 1000자 클립', () => {
    const long = 'a'.repeat(1500);
    const row = buildSpeciationRow({
      memoryId: 'm', fingerprint, utterance: long,
    });
    expect(row.utterance.length).toBe(1000);
  });

  it('parentVariantId 없음 → null', () => {
    const row = buildSpeciationRow({ memoryId: 'm', fingerprint, utterance: 'x' });
    expect(row.parent_variant_id).toBeNull();
  });

  it('fingerprint 없음 안전 (모두 null/빈)', () => {
    const row = buildSpeciationRow({ memoryId: 'm', utterance: 'x' });
    expect(row.emotion_vec).toEqual({});
    expect(row.attribution).toBeNull();
    expect(row.core_fear).toBeNull();
    expect(row.modality).toBeNull();
    expect(row.role).toBeNull();
    expect(row.motif_tags).toEqual([]);
  });

  it('createdBy null → anon 자동생성 의미 보존', () => {
    const row = buildSpeciationRow({ memoryId: 'm', fingerprint, utterance: 'x' });
    expect(row.created_by).toBeNull();
  });

  it('createdBy 명시 → admin 시연 user.id 보존', () => {
    const row = buildSpeciationRow({
      memoryId: 'm', fingerprint, utterance: 'x', createdBy: 'admin-uuid-1',
    });
    expect(row.created_by).toBe('admin-uuid-1');
  });
});

// ─────────────────────────────────────────────
// 결정론성 — 같은 입력 → 같은 결과
// ─────────────────────────────────────────────

describe('decideBranch — 결정론성 (LLM 호출 X)', () => {
  it('동일 입력 100회 → 동일 결과', () => {
    const first = decideBranch(seekerSelfBlame, [variantNearMatch, variantFarMismatch]);
    for (let i = 0; i < 100; i++) {
      const d = decideBranch(seekerSelfBlame, [variantNearMatch, variantFarMismatch]);
      expect(d.kind).toBe(first.kind);
      expect(d.reason).toBe(first.reason);
      expect(d.topScore).toBe(first.topScore);
    }
  });
});

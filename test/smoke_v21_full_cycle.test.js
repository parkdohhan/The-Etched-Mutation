/**
 * V2.1 풀 사이클 통합 smoke (V2-9) — 영상 컷 직전 회귀 차단.
 *
 * 시나리오 (모듈 체인 시뮬, DOM/네트워크 mock 없이 순수 로직):
 *   ① 오프닝 멀티턴 3턴 → fp 누적 박힘
 *   ② 매칭 — pickTopMemory 가 자리에 맞는 메모리 픽
 *   ③ 변주 매칭 — pickGhostVariant 작동
 *   ④ 분기 트리거 — decideBranch 가 drift 결정
 *   ⑤ DriftPicker — 회차 시작 변주 픽 (anchor 기반)
 *   ⑥ 회차 변위 + plays 도장 row 검증
 *   ⑦ cumulative EMA — 1회차 영향 약 10% 반영
 *   ⑧ 재진입 — 직전 패널티 작동, *다른* variant 픽
 *   ⑨ 폴백 회귀 — 빈 풀 시 narrative_silence + 폴백 문구
 *
 * 본 자리 = 모듈 체인 *호출 시퀀스* 검증. 진짜 DOM/네트워크 없이도 깨졌나 확인.
 * 풀 e2e (브라우저 자동화) 는 5-19 후 playwright 자리.
 *
 * 실행: `npm test` 또는 `npx vitest run test/smoke_v21_full_cycle.test.js`
 *
 * 핸드아웃: docs/V2-6_병렬세션_핸드아웃-260513.md (V2-6 자리 + 메인 통합)
 */

import { describe, it, expect } from 'vitest';
import { initFingerprint, mergeTurn, CHIP_EMOTION_SEED } from '../js/core/SeekerFingerprint.js';
import { pickTopMemory, pickGhostVariant } from '../js/core/SeekerMatchEngine.js';
import { decideBranch } from '../js/core/GhostBranchTrigger.js';
import { computeDriftVector, updateCumulativeEmotionVec } from '../js/core/ContaminationTracker.js';
import { pickDriftUtterance } from '../js/core/DriftPicker.js';
import { pickFallbackString } from '../js/content/narrative_fallback_strings.js';

// ─────────────────────────────────────────────
// 픽스처 — "발자국" 메모리 + 변주 풀 시뮬
// ─────────────────────────────────────────────

const memFootprints = {
  id: 'mem-footprints',
  title: '발자국',
  original_vector: { longing: 0.7, sadness: 0.6, guilt: 0.4 },
  motif_tags: ['엄마', '문턱', '겨울'],
  cumulative_emotion_vec: { longing: 0.05, sadness: 0.04 },
};

const memOther = {
  id: 'mem-other',
  title: '여름',
  original_vector: { joy: 0.7, peace: 0.5 },
  motif_tags: ['바다', '여름'],
  cumulative_emotion_vec: {},
};

function variant(id, ev, opts = {}) {
  return {
    id, kind: 'drift',
    emotion_vec: ev,
    motif_tags: opts.motif_tags || [],
    attribution: opts.attribution || null,
    core_fear: opts.core_fear || null,
    modality: opts.modality || null,
    role: opts.role || null,
    utterance: opts.utterance || `변주 ${id}`,
    is_seed: opts.is_seed != null ? opts.is_seed : true,
    parent_variant_id: opts.parent_variant_id != null ? opts.parent_variant_id : null,
  };
}

// anchor = is_seed + parent_variant_id null + 풍부한 emotion_vec
const anchorVar = variant('anchor', { longing: 0.6, sadness: 0.5, guilt: 0.3 }, {
  motif_tags: ['엄마', '문턱'], attribution: 'self_blame', core_fear: 'abandonment',
  utterance: '그래, 그때 거기 있었어.',
});
const v2 = variant('v2', { longing: 0.7, sadness: 0.4 }, {
  motif_tags: ['엄마'], attribution: 'self_blame',
  utterance: '응. 그 자리에 머물고 싶었어.',
});
const v3 = variant('v3', { sadness: 0.3, longing: 0.2 }, {
  motif_tags: ['겨울'], utterance: '...뭐였더라. 그 언저리.',
});
const v4 = variant('v4', { anger: 0.5, fear: 0.3 }, {
  motif_tags: ['미움'], attribution: 'other_blame',
  utterance: '그건 네 자리가 아닐 텐데.',
});
// 같은 '겨울' 모티프 두 번째 변주 — Step 4 직전 패널티 검증 자리 (filtered.length > 1 필요)
const v5 = variant('v5', { longing: 0.4, sadness: 0.2 }, {
  motif_tags: ['겨울'], utterance: '그 결, 자꾸 떠올라.',
});

const footprintVariants = [anchorVar, v2, v3, v4, v5];

// ─────────────────────────────────────────────
// 풀 사이클 체인 — 변수는 it 사이에서 공유
// ─────────────────────────────────────────────

describe('V2.1 풀 사이클 통합 — 오프닝→매칭→drift 픽→도장→cumulative→재진입', () => {
  let fp;                  // 오프닝 끝 fp
  let memory;              // 매칭된 메모리
  let chosenVariant;       // 1회차 drift 픽 변주
  let driftVector;         // 1회차 변위
  let sessionEmotionVec;   // 1회차 끝 emotion
  let firstPlayPlaysRow;   // 도장 row
  let nextCumulative;      // EMA 갱신 후 cumulative

  it('① 오프닝 3턴 — fp 누적 박힘 (emotion_vec + attribution + motif_words)', () => {
    fp = initFingerprint();
    // 턴 1 — 칩 sadness (alpha=1.0, 첫 턴)
    mergeTurn(fp, { base: CHIP_EMOTION_SEED.sadness, reason_analysis: {}, _raw_text: '' }, 1.0);
    fp._turnsRaw.push({ turn: 1, raw_text: '(chip:sadness)' });
    // 턴 2 — 엄마 자리
    mergeTurn(fp, {
      base: { longing: 0.7, sadness: 0.6 },
      reason_analysis: { attribution: 'self_blame', core_fear: 'abandonment' },
      modality: 'olfactory',
      _raw_text: '엄마가 보고싶었어',
    });
    fp._turnsRaw.push({ turn: 2, raw_text: '엄마가 보고싶었어' });
    // 턴 3 — 겨울 김치찌개
    mergeTurn(fp, {
      base: { longing: 0.5, sadness: 0.5, guilt: 0.4 },
      reason_analysis: { role: 'actor' },
      _raw_text: '겨울 김치찌개 냄새',
    });
    fp._turnsRaw.push({ turn: 3, raw_text: '겨울 김치찌개 냄새' });

    expect(fp.emotion_vec.sadness).toBeGreaterThan(0.4);
    expect(fp.emotion_vec.longing).toBeGreaterThan(0.4);
    expect(fp.attribution).toBe('self_blame');
    expect(fp.core_fear).toBe('abandonment');
    expect(fp.role).toBe('actor');
    expect(fp.modality).toBe('olfactory');
    // motif_words — 한글 2자+ 추출
    expect(fp.motif_words).toEqual(expect.arrayContaining(['엄마가', '보고싶었어', '겨울']));
  });

  it('② 매칭 — pickTopMemory 가 발자국 픽 (motif "엄마" + emotion 정합)', () => {
    const result = pickTopMemory(fp, [memFootprints, memOther]);
    expect(result).toBeTruthy();
    expect(result.memory).toBeTruthy();
    expect(result.memory.id).toBe('mem-footprints');
    memory = result.memory;
  });

  it('③ 변주 매칭 — pickGhostVariant 작동 (anchor 또는 v2 — self_blame + 엄마)', () => {
    const r = pickGhostVariant(fp, footprintVariants);
    expect(r).toBeTruthy();
    expect(r.variant).toBeTruthy();
    expect(['anchor', 'v2']).toContain(r.variant.id);
  });

  it('④ 분기 — decideBranch 가 drift 결정 (top_score_high 또는 mid_band_conservative)', () => {
    const decision = decideBranch(fp, footprintVariants);
    expect(decision.kind).toBe('drift');
    expect(['top_score_high', 'mid_band_conservative']).toContain(decision.reason);
    expect(decision.topVariant).toBeTruthy();
  });

  it('⑤ DriftPicker — 1회차 변주 픽 (anchor 기반, lastId null, fallbackKind null)', () => {
    // 회차 시작 — sessionStorage.tem_final_drift_vector 없으니 driftVector = cumulative
    const result = pickDriftUtterance({
      cumulativeEmotionVec: memory.cumulative_emotion_vec || {},
      driftVector: memory.cumulative_emotion_vec || {},
      ghostVariants: footprintVariants,
      fingerprint: { motif_words: fp.motif_words, attribution: fp.attribution },
      lastVariantId: null,
      rng: () => 0.0, // 결정적
    });
    expect(result.fallbackKind).toBe(null);
    expect(result.variant).toBeTruthy();
    expect(result.variant.id).toBeTruthy();
    chosenVariant = result.variant;
  });

  it('⑥ 회차 변위 계산 + plays 도장 row 검증 (ghost_variant_id + final_drift_vector)', () => {
    // 사용자가 회차 안에서 약간 더 슬픔/그리움 쪽으로 이동 (씬 끝 fp 시뮬)
    sessionEmotionVec = { longing: 0.85, sadness: 0.75, guilt: 0.55 };
    const baseline = { ...fp.emotion_vec };
    driftVector = computeDriftVector(sessionEmotionVec, baseline);
    // 도장 row 시뮬 (play-test.html sealBtn 자리)
    firstPlayPlaysRow = {
      memory_id: memory.id,
      ghost_variant_id: chosenVariant.id,
      final_drift_vector: driftVector,
    };
    expect(firstPlayPlaysRow.ghost_variant_id).not.toBe(null);
    expect(typeof firstPlayPlaysRow.final_drift_vector).toBe('object');
    expect(Object.keys(firstPlayPlaysRow.final_drift_vector).length).toBeGreaterThan(0);
    // 변위는 음수 가능 (사용자가 일부 축에서 감소)
    expect(typeof driftVector.sadness).toBe('number');
  });

  it('⑦ cumulative EMA — prev 보다 크고 session 보다 작음 (α=0.10 작동)', () => {
    const prev = memory.cumulative_emotion_vec || {};
    nextCumulative = updateCumulativeEmotionVec(prev, sessionEmotionVec);
    // sadness: prev 0.04 + 0.10 × 0.75 = 0.115 (대략) — prev 보다 크고 session 0.75 보다 작음
    expect(nextCumulative.sadness).toBeGreaterThan(prev.sadness || 0);
    expect(nextCumulative.sadness).toBeLessThan(sessionEmotionVec.sadness);
    // longing 도 동일
    expect(nextCumulative.longing).toBeGreaterThan(prev.longing || 0);
    expect(nextCumulative.longing).toBeLessThan(sessionEmotionVec.longing);
  });

  it('⑧ 재진입 — 직전 패널티 작동, 1회차와 *다른* variant 픽', () => {
    // sessionStorage.tem_last_variant_id = chosenVariant.id 시뮬
    // 사용자가 1회차랑 다르게 행동 → driftVector 다름
    const secondDriftVector = { anger: 0.3, sadness: -0.1, longing: -0.2 };
    const result = pickDriftUtterance({
      cumulativeEmotionVec: nextCumulative,
      driftVector: secondDriftVector,
      ghostVariants: footprintVariants,
      fingerprint: { motif_words: fp.motif_words, attribution: fp.attribution },
      lastVariantId: chosenVariant.id,
      tuning: { lastPenalty: 0.0 }, // 같은 variant 절대 X
      rng: () => 0.0,
    });
    expect(result.fallbackKind).toBe(null);
    expect(result.variant).toBeTruthy();
    expect(result.variant.id).not.toBe(chosenVariant.id);
  });

  it('⑨ 폴백 회귀 — 빈 풀 시 narrative_silence + 폴백 문구 호출 가능', () => {
    const result = pickDriftUtterance({
      cumulativeEmotionVec: {},
      driftVector: { sadness: 0.5 },
      ghostVariants: [],
      fingerprint: { motif_words: [], attribution: null },
      lastVariantId: null,
    });
    expect(result.variant).toBe(null);
    expect(result.fallbackKind).toBe('narrative_silence');
    // 호출자가 폴백 문구로 침묵 회피
    const fallback = pickFallbackString('vague', 'ko');
    expect(typeof fallback).toBe('string');
    expect(fallback.length).toBeGreaterThan(0);
  });

  it('⑩ 메모리간 격리 — 다른 메모리 변주 침범 X (사이드 이펙트 가드)', () => {
    // 발자국 변주 풀로 픽 → 결과 variant 는 발자국 풀 안의 row 만 (다른 메모리 안 침범)
    const result = pickDriftUtterance({
      cumulativeEmotionVec: { longing: 0.5 },
      driftVector: { longing: 0.3 },
      ghostVariants: footprintVariants,
      fingerprint: { motif_words: ['모래'], attribution: null }, // 발자국 모티프 안 맞음
      lastVariantId: null,
      rng: () => 0.0,
    });
    // 모티프 맞는 거 없음 + 귀인도 없음 → 무필터 → 전체 풀에서 픽
    expect(result.fallbackKind).toBe(null);
    expect(footprintVariants.map(v => v.id)).toContain(result.variant.id);
  });
});

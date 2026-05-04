/**
 * GhostBranchTrigger — V2.1 §15-1 drift vs speciation 결정 모듈.
 *
 * V2.1 SCOPE §4 V2-4: 분기 트리거 시스템
 *  - 입력: SeekerCard (멀티턴 누적 fingerprint, V2-3 결과)
 *  - 입력: 메모리의 ghost_variants 풀 (V2-2 admin 시드 + V2-4 누적 speciation)
 *  - 출력: { kind: 'drift'|'speciation', topVariant, topScore, runnerUpDelta, reason }
 *
 * 정책 (LLM 호출 X, 결정론적):
 *  - top score ≥ DRIFT_HIGH    → drift  (확실한 매칭, 기존 풀에 가까움)
 *  - top score < SPECIATION_LOW → speciation (다른 path, 새 유령 시드)
 *  - 그 사이 (mid band)         → drift  (보수적, 변주 풀 폭발 방지 — V2-8 V3 이월의 hardcode 흡수)
 *  - 빈 풀                      → speciation 'empty_pool' (시드 자동 생성 안 함, 호출자 결정)
 *
 * 임계값은 V2-12 튜닝 단계에서 조정. 본 모듈은 결정 로직만, DB INSERT 는 호출자 책임.
 *
 * 정렬 룰 (편지 핸드오프 (α) 채택):
 *  - SeekerMatchEngine.pickGhostVariant 는 score=0 일 때 null 리턴 — 빈 풀과 구별 X.
 *  - 본 모듈은 scoreCard 만 호출해 *직접 정렬*. score=0 라도 1등 variant 보존.
 *  - 그래야 "풀은 있는데 매칭 약함 → speciation 새 시드 후보" 가 의미 있음 (parent_variant_id 잡힘).
 *
 * 사용:
 *   import { decideBranch, buildSpeciationRow, DEFAULT_THRESHOLDS } from './GhostBranchTrigger.js';
 *   const decision = decideBranch(seekerCard, ghostVariants);
 *   if (decision.kind === 'speciation') {
 *     const row = buildSpeciationRow({
 *       memoryId, parentVariantId: decision.topVariant?.id, fingerprint: seekerCard, utterance
 *     });
 *     await supabase.from('ghost_variants').insert(row);
 *   }
 */

import { scoreCard, ghostVariantToCard, DEFAULT_WEIGHTS } from './SeekerMatchEngine.js';

/**
 * scoreCard 의 절대값 score 를 0~1 로 정규화하는 분모.
 * = α + β + γ + δ + ε (DEFAULT_WEIGHTS 합).
 * 임계값은 정규화된 0~1 비율 (예: 0.7 = "전체 가중치의 70% 매칭").
 *
 * 주: 호출자가 SeekerMatchEngine 의 weights 를 커스텀하면 picked.score 의 분모도 달라짐.
 *   현재는 DEFAULT_WEIGHTS 가정. V2-12 튜닝 단계에서 재검토.
 */
const MAX_SCORE =
  DEFAULT_WEIGHTS.alpha + DEFAULT_WEIGHTS.beta + DEFAULT_WEIGHTS.gamma +
  DEFAULT_WEIGHTS.delta + DEFAULT_WEIGHTS.epsilon;

/**
 * V2-12 튜닝 대상. 작가 한 바퀴 체감 후 0.05 단위로 조정.
 * 보수 정책: mid band 는 drift 로 흡수 (변주 풀 무한 증식 방지).
 *
 * 임계값은 *정규화된 비율* (0~1). picked.score / MAX_SCORE 와 비교.
 */
export const DEFAULT_THRESHOLDS = Object.freeze({
  drift_high: 0.7,        // 정규화 score 이 이상 → 확실한 drift
  speciation_low: 0.4,    // 정규화 score 이 미만 → speciation
});

const REASON = Object.freeze({
  EMPTY_POOL: 'empty_pool',
  TOP_SCORE_HIGH: 'top_score_high',
  TOP_SCORE_LOW: 'top_score_low',
  MID_BAND_CONSERVATIVE: 'mid_band_conservative',
});

/**
 * @typedef {Object} BranchDecision
 * @property {'drift'|'speciation'} kind
 * @property {?Object} topVariant       매칭 1등 ghost_variants row (없으면 null)
 * @property {number} topScore          0~1 정규화 score
 * @property {number} runnerUpDelta     (1등 - 2등) 정규화 score 차이
 * @property {string} reason            empty_pool|top_score_high|top_score_low|mid_band_conservative
 */

/**
 * @param {Object} seeker          SeekerCard (V2-3 누적 fingerprint)
 * @param {Object[]} ghostVariants 메모리 풀 (ghost_variants row 배열)
 * @param {typeof DEFAULT_THRESHOLDS} [thresholds]
 * @returns {BranchDecision}
 */
export function decideBranch(seeker, ghostVariants, thresholds = DEFAULT_THRESHOLDS) {
  const t = thresholds || DEFAULT_THRESHOLDS;

  // 빈 풀 — admin 시드 0개. drift 비교 불가 → speciation. 단 호출자가 시드 자동 생성 정책 결정.
  if (!Array.isArray(ghostVariants) || ghostVariants.length === 0) {
    return {
      kind: 'speciation',
      topVariant: null,
      topScore: 0,
      runnerUpDelta: 0,
      reason: REASON.EMPTY_POOL,
    };
  }

  // 직접 정렬 — score=0 라도 1등 variant 보존 (편지 (α) 해결).
  const scored = ghostVariants.map(v => {
    const r = scoreCard(seeker, ghostVariantToCard(v));
    return { variant: v, score: Number(r.score) || 0 };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const runnerUp = scored[1] ? scored[1].score : 0;
  const rawScore = top.score;
  const topScore = rawScore / MAX_SCORE;
  const runnerUpDelta = (rawScore - runnerUp) / MAX_SCORE;
  const topVariant = top.variant;

  let kind;
  let reason;
  if (topScore >= t.drift_high) {
    kind = 'drift';
    reason = REASON.TOP_SCORE_HIGH;
  } else if (topScore < t.speciation_low) {
    kind = 'speciation';
    reason = REASON.TOP_SCORE_LOW;
  } else {
    // mid band — 보수적. V2-8 (V3 이월) 흡수 정책: 변주 풀 무한 증식 방지.
    kind = 'drift';
    reason = REASON.MID_BAND_CONSERVATIVE;
  }

  return {
    kind,
    topVariant,
    topScore,
    runnerUpDelta,
    reason,
  };
}

/**
 * speciation 시 ghost_variants INSERT 페이로드 빌드. DB 호출은 호출자.
 *
 * V2-1 ghost_variants 컬럼 정합:
 *  - utterance: NOT NULL CHECK 1~1000자. 빈/긴 입력 안전 처리.
 *  - is_seed: false (V2-4 누적은 플레이어 contribution).
 *  - parent_variant_id: top match id (계보 추적), 없으면 null (admin 시드 root 의미와 충돌 X).
 *
 * @param {Object} args
 * @param {string} args.memoryId
 * @param {?string} args.parentVariantId
 * @param {Object} args.fingerprint        SeekerCard (extractor_version 포함 — 멀티턴 마지막 emotion_extract 응답)
 * @param {string} args.utterance          마지막 dialog turn raw_text 권장
 * @param {?string} [args.pose]
 * @param {?string} [args.createdBy]       admin 시연 시 user.id, anon 자동생성 시 null
 * @returns {Object}                        ghost_variants insert payload
 */
export function buildSpeciationRow(args) {
  const a = args || {};
  const fp = a.fingerprint || {};
  const raw = String(a.utterance || '').trim();
  // CHECK 제약: 1~1000자. 빈 입력은 placeholder, 긴 입력은 잘라냄.
  const utterance = raw.length === 0
    ? '...'
    : (raw.length > 1000 ? raw.slice(0, 1000) : raw);

  return {
    memory_id: a.memoryId,
    kind: 'speciation',
    parent_variant_id: a.parentVariantId || null,
    emotion_vec: (fp.emotion_vec && typeof fp.emotion_vec === 'object') ? fp.emotion_vec : {},
    extractor_version: fp.extractor_version || null,
    attribution: fp.attribution || null,
    core_fear: fp.core_fear || null,
    modality: fp.modality || null,
    role: fp.role || null,
    motif_tags: Array.isArray(fp.motif_words)
      ? fp.motif_words
          .filter(w => w != null && String(w).trim().length > 0)
          .map(w => String(w).toLowerCase())
      : [],
    utterance,
    pose: a.pose || null,
    is_seed: false,
    created_by: a.createdBy || null,
  };
}

// 브라우저 콘솔 / wiring 코드 직접 접근용 self-attach.
if (typeof window !== 'undefined') {
  window.GhostBranchTrigger = {
    DEFAULT_THRESHOLDS,
    decideBranch,
    buildSpeciationRow,
  };
}

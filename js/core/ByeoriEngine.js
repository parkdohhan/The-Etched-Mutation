// js/core/ByeoriEngine.js
// 별이 엔진 V3 — 3축 정렬도 복원
// 
// TEM의 존재 이유: "같은 감정이라도 이유가 다르면 다른 경험"
// 
// V2에서 임베딩(0.65) + VAD(0.35)로 바꿨던 것을
// 기획서 원본인 감정(0.4) + 이유(0.4) + 태도(0.2)로 복원.
//
// SSOT (Single Source of Truth) — 정렬도/버킷/전이/미스매치 계산은 여기서만.

import { 
  cosineSimilarity, 
  calculateEmotionScore,
  calculateReasonScore,
  calculateAttitudeScore,
  calculateAlignment,
  calculateFixationLevel,
  getBucket, 
  projectEmotionToVAD,
  calculateEmbeddingSimilarity
} from '../shared/math.js';

/**
 * ByeoriEngine V3 — 별이 엔진
 * 
 * 정렬도 = 감정(0.4) + 이유(0.4) + 태도(0.2)
 */
export class ByeoriEngine {
  constructor() {
    // 엔진은 상태를 가지지 않음 (순수 함수만)
  }

  /**
   * 메인 API: 한 스텝의 계산을 수행
   * 
   * @param {Object} input
   * @param {Object} input.userVector - { base, embedding?, reason_analysis? }
   * @param {Object} input.originalVector - { base, embedding?, reason_analysis? }
   * @param {Array<string>} input.anchorEmotions - 장면별 앵커 (선택)
   * 
   * @param {Object} context
   * @param {string} context.previousBucket - 이전 버킷
   * @param {Array} context.emotionHistory - 감정 히스토리 (벡터 배열)
   * @param {number} context.skipCount - 감정 입력 스킵 횟수
   */
  calculateStep(input, context = {}) {
    const { userVector, originalVector, anchorEmotions = null } = input;
    const { previousBucket = null, emotionHistory = null, skipCount = 0 } = context;

    if (!userVector || !originalVector) {
      console.warn('[ByeoriEngine] userVector 또는 originalVector가 없습니다');
      return this._createEmptyResult();
    }

    // ===== 1. 감정 유사도 (40%) =====
    const emotionScore = calculateEmotionScore(
      userVector, originalVector, anchorEmotions
    );

    // ===== 2. 이유 유사도 (40%) =====
    const reasonScore = calculateReasonScore(
      userVector, originalVector, emotionScore
    );

    // ===== 3. 태도 계수 (20%) =====
    const attitudeScore = calculateAttitudeScore(
      userVector, originalVector, { emotionHistory, skipCount }
    );

    // ===== 4. 정렬도 통합 =====
    const alignmentScore = calculateAlignment(emotionScore, reasonScore, attitudeScore);

    // ===== 5. 버킷 판정 =====
    const alignmentBucket = getBucket(alignmentScore, previousBucket, emotionHistory);

    // ===== 6. 미스매치 타입 (서사 태그용, 점수 불관여) =====
    const mismatchType = this._getMismatchType(userVector, originalVector);

    // ===== 7. VAD 투영 (시각화 전용) =====
    const affectivePosition = projectEmotionToVAD(
      userVector.base || userVector, anchorEmotions
    );

    // ===== 8. 전이 패턴 =====
    const transitionPattern = this._getTransitionPattern(alignmentBucket, mismatchType);

    // ===== 9. 디버그 =====
    const debug = {
      emotion_score: emotionScore,
      reason_score: reasonScore,
      attitude_score: attitudeScore,
      formula: `E${emotionScore.toFixed(2)}×.4 + R${reasonScore.toFixed(2)}×.4 + A${attitudeScore.toFixed(2)}×.2 = ${alignmentScore.toFixed(3)}`,
      fixation_level: emotionHistory ? calculateFixationLevel(emotionHistory) : 0,
      has_reason_data: !!(userVector.reason_analysis && originalVector.reason_analysis),
      has_embedding: !!(userVector.embedding && originalVector.embedding)
    };

    return {
      affective_position: affectivePosition,
      alignment_score: alignmentScore,
      alignment_bucket: alignmentBucket,
      transition_pattern: transitionPattern,
      mismatch_type: mismatchType,
      debug: debug
    };
  }

  /**
   * 미스매치 타입 판정 (서사 태그용, 점수 불관여)
   * 
   * 우선순위:
   * 1. void_mismatch — 결손 불일치
   * 2. attribution_mismatch — 귀인 방향 불일치
   * 3. target_displacement — 감정 대상 전이
   * 4. emotion_mismatch — 감정 구조 불일치 (코사인 < 0.5)
   * 5. null — 없음
   * @private
   */
  _getMismatchType(userVector, originalVector) {
    if (!userVector || !originalVector) return null;

    const userReason = userVector.reason_analysis || {};
    const origReason = originalVector.reason_analysis || {};

    // 1. void_mismatch
    if (!!userReason.is_void !== !!origReason.is_void) {
      return 'void_mismatch';
    }

    // 2. attribution_mismatch
    if (userReason.attribution && origReason.attribution && 
        userReason.attribution !== origReason.attribution) {
      return 'attribution_mismatch';
    }

    // 3. target_displacement
    if (userReason.target && origReason.target && 
        userReason.target !== origReason.target) {
      const emotionSim = cosineSimilarity(
        userVector.base || userVector,
        originalVector.base || originalVector
      );
      if (emotionSim >= 0.5) {
        return 'target_displacement';
      }
    }

    // 4. emotion_mismatch
    const emotionSimilarity = cosineSimilarity(
      userVector.base || userVector,
      originalVector.base || originalVector
    );
    if (emotionSimilarity < 0.5) {
      return 'emotion_mismatch';
    }

    return null;
  }

  /**
   * 전이 패턴 결정
   * 
   * echo_follow: HIGH → 자연스럽게 다음 장면
   * bridge: MID → 중립적 장면
   * contradiction: LOW + emotion/attribution mismatch → 반대 장면
   * displacement: LOW + target_displacement → 대상 전이
   * avoidance: LOW + void_mismatch → 장면 건너뜀
   * fixation: FIXATED → 같은 장면 반복
   * @private
   */
  _getTransitionPattern(bucket, mismatchType) {
    if (bucket === 'FIXATED') return 'fixation';
    if (bucket === 'HIGH') return 'echo_follow';
    if (bucket === 'MID') return 'bridge';
    
    if (bucket === 'LOW') {
      switch (mismatchType) {
        case 'void_mismatch': return 'avoidance';
        case 'target_displacement': return 'displacement';
        case 'emotion_mismatch': return 'contradiction';
        case 'attribution_mismatch': return 'contradiction';
        default: return 'bridge';
      }
    }

    return null;
  }

  /** @private */
  _createEmptyResult() {
    return {
      affective_position: { v: 0, a: 0, d: 0 },
      alignment_score: 0,
      alignment_bucket: 'LOW',
      transition_pattern: null,
      mismatch_type: null,
      debug: {}
    };
  }
}

// 싱글톤
export const byeoriEngine = new ByeoriEngine();

// 편의 함수
export function calculateStep(input, context) {
  return byeoriEngine.calculateStep(input, context);
}

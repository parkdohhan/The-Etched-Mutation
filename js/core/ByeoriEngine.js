// js/core/ByeoriEngine.js
// 별이 엔진 - 정렬도/버킷/전이/미스매치 계산의 SSOT (Single Source of Truth)
// UI/DOM/Supabase를 포함하지 않고 순수 계산만 수행

import { 
  cosineSimilarity, 
  calculateAlignment, 
  getBucket, 
  projectEmotionToVAD,
  calculateVADSimilarity,
  calculateEmbeddingSimilarity
} from '../shared/math.js';
import { TEM_ANCHOR_VAD, TEM_ANCHOR_VAD_EXTENDED } from '../shared/tem_geo_map.js';

// ==================== V2 튜닝 상수 ====================
const EMB_WEIGHT = 0.65;
const VAD_WEIGHT = 0.35;
const EMB_EXPONENT = 1.35;  // 나중에 1.35~1.45로 쉽게 튜닝 가능
const VAD_K = 3.0;
const VOID_PENALTY = 0.7;

/**
 * ByeoriEngine - 별이 엔진 메인 클래스
 * 
 * 정렬도, 버킷, 전이, 미스매치 계산의 SSOT
 * 모든 계산 로직은 이 엔진을 통해서만 수행되어야 함
 */
export class ByeoriEngine {
  constructor() {
    // 엔진은 상태를 가지지 않음 (순수 함수만)
  }

  /**
   * 메인 API: 한 스텝의 계산을 수행
   * 
   * @param {Object} input - 입력 데이터
   * @param {Object} input.userVector - 사용자 감정 벡터 { base, reason_analysis? }
   * @param {Object} input.originalVector - 원본 감정 벡터 { base, reason_analysis? }
   * @param {Array<string>} input.anchorEmotions - 장면별 앵커 감정 목록 (선택)
   * 
   * @param {Object} context - 컨텍스트 데이터
   * @param {string} context.previousBucket - 이전 버킷 상태 ('HIGH'|'MID'|'LOW'|'FIXATED'|null)
   * @param {Array} context.emotionHistory - 감정 히스토리 (FIXATED 판정용)
   * 
   * @returns {Object} 계산 결과
   * @returns {Object} returns.affective_position - VAD 좌표 { v, a, d }
   * @returns {number} returns.alignment_score - 정렬도 (0..1)
   * @returns {string} returns.alignment_bucket - 버킷 ('HIGH'|'MID'|'LOW'|'FIXATED')
   * @returns {string|null} returns.transition_pattern - 전이 패턴 (현재는 null)
   * @returns {string|null} returns.mismatch_type - 미스매치 타입
   * @returns {Object} returns.debug - 디버그 정보 (선택)
   */
  calculateStep(input, context = {}) {
    const { userVector, originalVector, anchorEmotions = null } = input;
    const { previousBucket = null, emotionHistory = null } = context;

    // 입력 검증
    if (!userVector || !originalVector) {
      console.warn('[ByeoriEngine] userVector 또는 originalVector가 없습니다');
      return this._createEmptyResult();
    }

    // 1. V2 정렬도 계산 (Embedding + VAD 중심)
    const alignmentResult = this._calculateSimplerAlignment(
      userVector, 
      originalVector
    );

    // 2. 버킷 판정 (히스테리시스 + FIXATED 포함)
    const alignmentBucket = getBucket(alignmentResult.finalScore, previousBucket, emotionHistory);

    // 3. 미스매치 판정 (narrative tag 분류용)
    const mismatchType = this._getMismatchType(userVector, originalVector);

    // 4. VAD 투영 (시각화용)
    const affectivePosition = projectEmotionToVAD(
      userVector.base || userVector,
      anchorEmotions
    );

    // 5. 전이 패턴 (현재는 null, 추후 구현)
    const transitionPattern = null;

    // 6. 디버그 정보 (V2)
    const debug = {
      vad_score: alignmentResult.vad_score,
      emb_score_raw: alignmentResult.emb_score_raw,
      emb_score_adj: alignmentResult.emb_score_adj,
      void_penalty: alignmentResult.void_penalty,
      weights: { emb: EMB_WEIGHT, vad: VAD_WEIGHT },
      exponent: EMB_EXPONENT,
      k: VAD_K
    };

    return {
      affective_position: affectivePosition,
      alignment_score: alignmentResult.finalScore,
      alignment_bucket: alignmentBucket,
      transition_pattern: transitionPattern,
      mismatch_type: mismatchType,
      debug: debug
    };
  }

  /**
   * V2 정렬도 계산 (Embedding + VAD 중심)
   * 
   * @private
   * @param {Object} userVector - 사용자 벡터 { base, embedding?, reason_analysis? }
   * @param {Object} originalVector - 원본 벡터 { base, embedding?, reason_analysis? }
   * @returns {Object} 계산 결과 { finalScore, vad_score, emb_score_raw, emb_score_adj, void_penalty }
   */
  _calculateSimplerAlignment(userVector, originalVector) {
    if (!userVector || !originalVector) {
      return {
        finalScore: 0,
        vad_score: 0,
        emb_score_raw: null,
        emb_score_adj: 0,
        void_penalty: 1.0
      };
    }

    // ========== Embedding Score ==========
    let emb_score_raw = null;
    let emb_score_adj = 0;

    const userEmbedding = userVector.embedding;
    const origEmbedding = originalVector.embedding;

    if (userEmbedding && origEmbedding && 
        Array.isArray(userEmbedding) && Array.isArray(origEmbedding) &&
        userEmbedding.length > 0 && origEmbedding.length > 0) {
      // Embedding이 둘 다 있으면 calculateEmbeddingSimilarity 사용
      emb_score_raw = calculateEmbeddingSimilarity(userEmbedding, origEmbedding);
      emb_score_adj = Math.pow(emb_score_raw, EMB_EXPONENT);
    } else {
      // Embedding이 없으면 VAD로 대체
      const userVAD = projectEmotionToVAD(userVector.base || userVector);
      const origVAD = projectEmotionToVAD(originalVector.base || originalVector);
      const vadFallback = calculateVADSimilarity(userVAD, origVAD, VAD_K);
      emb_score_raw = vadFallback;
      emb_score_adj = Math.pow(vadFallback, EMB_EXPONENT);
    }

    // ========== VAD Score ==========
    const userVAD = projectEmotionToVAD(userVector.base || userVector);
    const origVAD = projectEmotionToVAD(originalVector.base || originalVector);
    const vad_score = calculateVADSimilarity(userVAD, origVAD, VAD_K);

    // ========== Raw Score ==========
    const rawScore = (emb_score_adj * EMB_WEIGHT) + (vad_score * VAD_WEIGHT);

    // ========== Void Penalty ==========
    const userReason = userVector.reason_analysis || {};
    const origReason = originalVector.reason_analysis || {};
    const voidMismatch = !!userReason.is_void !== !!origReason.is_void;
    const void_penalty = voidMismatch ? VOID_PENALTY : 1.0;

    // ========== Final Score ==========
    const finalScore = Math.max(0, Math.min(1, rawScore * void_penalty));

    return {
      finalScore,
      vad_score,
      emb_score_raw,
      emb_score_adj,
      void_penalty
    };
  }

  /**
   * 미스매치 타입 판정
   * 
   * @private
   * @param {Object} userVector - 사용자 벡터
   * @param {Object} originalVector - 원본 벡터
   * @returns {string|null} 미스매치 타입 또는 null
   */
  /**
   * 미스매치 타입 판정 (narrative tag 분류용, 점수에는 관여하지 않음)
   * 
   * @private
   * @param {Object} userVector - 사용자 벡터
   * @param {Object} originalVector - 원본 벡터
   * @returns {string|null} 미스매치 타입 또는 null
   */
  _getMismatchType(userVector, originalVector) {
    if (!userVector || !originalVector) return null;

    const userReason = userVector.reason_analysis || {};
    const origReason = originalVector.reason_analysis || {};

    // 1. void_mismatch (최우선)
    if (!!userReason.is_void !== !!origReason.is_void) {
      return 'void_mismatch';
    }

    // 2. attribution_mismatch (attribution 존재할 때만)
    if (userReason.attribution && 
        origReason.attribution && 
        userReason.attribution !== origReason.attribution) {
      return 'attribution_mismatch';
    }

    // 3. core_fear_mismatch (core_fear 존재할 때만)
    if (userReason.core_fear && 
        origReason.core_fear && 
        userReason.core_fear !== origReason.core_fear) {
      return 'core_fear_mismatch';
    }

    // 4. emotion_mismatch (fallback)
    const emotionSimilarity = cosineSimilarity(
      userVector.base || userVector,
      originalVector.base || originalVector
    );
    if (emotionSimilarity < 0.5) {
      return 'emotion_mismatch';
    }

    // 일치 (미스매치 없음)
    return null;
  }

  /**
   * 빈 결과 생성 (에러 처리용)
   * 
   * @private
   * @returns {Object} 빈 결과 객체
   */
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

// 싱글톤 인스턴스 export (선택적 사용)
export const byeoriEngine = new ByeoriEngine();

// 편의 함수: calculateStep 직접 호출
export function calculateStep(input, context) {
  return byeoriEngine.calculateStep(input, context);
}

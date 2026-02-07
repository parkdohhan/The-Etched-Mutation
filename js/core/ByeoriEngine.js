// js/core/ByeoriEngine.js
// 별이 엔진 - 정렬도/버킷/전이/미스매치 계산의 SSOT (Single Source of Truth)
// UI/DOM/Supabase를 포함하지 않고 순수 계산만 수행

import { 
  cosineSimilarity, 
  calculateAlignment, 
  getBucket, 
  projectEmotionToVAD 
} from '../shared/math.js';
import { TEM_ANCHOR_VAD, TEM_ANCHOR_VAD_EXTENDED } from '../shared/tem_geo_map.js';

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

    // 1. 복합 정렬도 계산 (감정 40% + 이유 40% + VOID 20%)
    const alignmentScore = this._calculateComplexAlignment(
      userVector, 
      originalVector, 
      anchorEmotions
    );

    // 2. 버킷 판정 (히스테리시스 + FIXATED 포함)
    const alignmentBucket = getBucket(alignmentScore, previousBucket, emotionHistory);

    // 3. 미스매치 판정
    const mismatchType = this._getMismatchType(userVector, originalVector);

    // 4. VAD 투영 (시각화용)
    const affectivePosition = projectEmotionToVAD(
      userVector.base || userVector,
      anchorEmotions
    );

    // 5. 전이 패턴 (현재는 null, 추후 구현)
    const transitionPattern = null;

    // 6. 디버그 정보 (선택)
    const debug = {
      E: alignmentScore, // E = 정렬도
      // R, A는 추후 필요시 추가
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
   * 복합 정렬도 계산 (감정 40% + 이유 40% + VOID 20%)
   * 
   * @private
   * @param {Object} userVector - 사용자 벡터
   * @param {Object} originalVector - 원본 벡터
   * @param {Array<string>} anchorEmotions - 앵커 감정 목록
   * @returns {number} 정렬도 (0..1)
   */
  _calculateComplexAlignment(userVector, originalVector, anchorEmotions = null) {
    if (!userVector || !originalVector) return 0;

    // 감정 유사도 (40%)
    const emotionScore = cosineSimilarity(
      userVector.base || userVector,
      originalVector.base || originalVector,
      anchorEmotions
    );

    // 이유 분석 일치도 (40%)
    let reasonScore = 0;
    const userReason = userVector.reason_analysis || {};
    const origReason = originalVector.reason_analysis || {};

    const attributionMatch = userReason.attribution && 
                             origReason.attribution && 
                             userReason.attribution === origReason.attribution;
    const coreFearMatch = userReason.core_fear && 
                          origReason.core_fear && 
                          userReason.core_fear === origReason.core_fear;

    if (attributionMatch) reasonScore += 0.5;
    if (coreFearMatch) reasonScore += 0.5;

    // VOID 상태 일치도 (20%)
    let voidScore = 0;
    if (!!userReason.is_void === !!origReason.is_void) {
      voidScore = 1.0;
    }

    // 최종 정렬도 계산
    const totalAlignment = (emotionScore * 0.4) + (reasonScore * 0.4) + (voidScore * 0.2);

    return Math.max(0, Math.min(1, totalAlignment)); // 0..1 클램프
  }

  /**
   * 미스매치 타입 판정
   * 
   * @private
   * @param {Object} userVector - 사용자 벡터
   * @param {Object} originalVector - 원본 벡터
   * @returns {string|null} 미스매치 타입 또는 null
   */
  _getMismatchType(userVector, originalVector) {
    if (!userVector || !originalVector) return null;

    const emotionSimilarity = cosineSimilarity(
      userVector.base,
      originalVector.base || originalVector
    );

    const userReason = userVector.reason_analysis || {};
    const origReason = originalVector.reason_analysis || {};

    // 1. VOID 미스매치 (최우선)
    if (!!userReason.is_void !== !!origReason.is_void) {
      return 'void_mismatch';
    }

    // 2. 감정 미스매치
    if (emotionSimilarity < 0.5) {
      return 'emotion_mismatch';
    }

    // 3. 귀인 미스매치
    if (userReason.attribution && 
        origReason.attribution && 
        userReason.attribution !== origReason.attribution) {
      return 'attribution_mismatch';
    }

    // 4. 대상 전위 (target_displacement)
    if (userReason.core_fear && 
        origReason.core_fear && 
        userReason.core_fear !== origReason.core_fear) {
      return 'target_displacement';
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

// js/core/ByeoriEngine.js
// 별이 엔진 V4 — 궤적 기반 정렬도
//
// 공식: alignment = level × shape × void_mod
// level = 장면별 감정 유사도 평균
// shape = 감정 변화 궤적의 형태 유사도 (3장면 미만이면 1.0)
// void_mod = 회피 보정 (기본 1.0, 회피 시 0.7)

import {
  cosineSimilarity,
  calculateEmotionScore,
  calculateShapeSimilarity,
  calculateLevelSimilarity,
  calculateTrajectoryAlignment,
  calculateFixationLevel,
  getBucket,
  projectEmotionToVAD
} from '../shared/math.js?v=260727';

export class ByeoriEngine {
  constructor() {
    // 상태 없음
  }

  /**
   * V4 메인 API
   *
   * @param {Object} input
   * @param {Object} input.userVector - { base } 현재 장면의 사용자 감정
   * @param {Object} input.originalVector - { base } 현재 장면의 원본 감정
   * @param {Array<string>} input.anchorEmotions - 장면별 앵커 (선택)
   * @param {Array<Object>} input.userTrajectory - 지금까지의 사용자 감정 벡터 배열 (방문 순서)
   * @param {Array<Object>} input.originalTrajectory - 대응하는 원본 감정 벡터 배열 (사용자 방문 순서로 재배열)
   * @param {Array<number>} input.sceneScores - 지금까지의 장면별 scene_score 배열
   *
   * @param {Object} context
   * @param {string} context.previousBucket
   * @param {Array} context.emotionHistory
   */
  calculateStep(input, context = {}) {
    const {
      userVector, originalVector, anchorEmotions = null,
      userTrajectory = null, originalTrajectory = null,
      sceneScores = null, emotionKeys = null
    } = input;
    const { previousBucket = null, emotionHistory = null } = context;

    if (!userVector || !originalVector) {
      console.warn('[ByeoriEngine V4] userVector 또는 originalVector 없음');
      return this._createEmptyResult();
    }

    // 판단 좌표계 (260727 기억별 좌표계 — docs/기억별_좌표계_결정-260727.md):
    // 씬 anchor(가장 구체) > emotionKeys(기억의 저작 어휘) > 판단 기본 17축.
    // level·shape·mismatch 가 전부 같은 자로 재야 V4 §9.1 (곱셈 결합의 동일 공간) 유지.
    const frameKeys = (anchorEmotions && anchorEmotions.length)
      ? anchorEmotions
      : ((emotionKeys && emotionKeys.length) ? emotionKeys : null);

    const currentSceneScore = calculateEmotionScore(
      userVector, originalVector, frameKeys
    );

    const allSceneScores = sceneScores ? [...sceneScores, currentSceneScore] : [currentSceneScore];

    const level = calculateLevelSimilarity(allSceneScores);

    const userTraj = userTrajectory
      ? [...userTrajectory, userVector.base || userVector]
      : [userVector.base || userVector];
    const origTraj = originalTrajectory
      ? [...originalTrajectory, originalVector.base || originalVector]
      : [originalVector.base || originalVector];

    const shapeResult = calculateShapeSimilarity(userTraj, origTraj, frameKeys);

    const userReason = userVector.reason_analysis || {};
    const origReason = originalVector.reason_analysis || {};
    const userVoid = !!userReason.is_void;
    const origVoid = !!origReason.is_void;
    const voidMod = (userVoid && !origVoid) ? 0.7 : 1.0;

    const alignment = calculateTrajectoryAlignment(level, shapeResult.clamped, voidMod);

    const bucket = getBucket(alignment, previousBucket, emotionHistory);

    const mismatchType = this._getMismatchType(userVector, originalVector, frameKeys);

    const transitionPattern = this._getTransitionPattern(
      bucket, mismatchType, level, shapeResult.clamped, userTraj, origTraj
    );

    const affectivePosition = projectEmotionToVAD(
      userVector.base || userVector, anchorEmotions
    );

    const debug = {
      current_scene_score: currentSceneScore,
      level,
      shape_raw: shapeResult.raw,
      shape: shapeResult.clamped,
      shape_active: shapeResult.active,
      void_mod: voidMod,
      scenes_played: allSceneScores.length,
      formula: `L${level.toFixed(2)} × S${shapeResult.clamped.toFixed(2)} × V${voidMod.toFixed(2)} = ${alignment.toFixed(3)}`,
      fixation_level: emotionHistory ? calculateFixationLevel(emotionHistory) : 0,
      scene_scores: allSceneScores
    };

    return {
      affective_position: affectivePosition,
      alignment_score: alignment,
      alignment_bucket: bucket,
      transition_pattern: transitionPattern,
      mismatch_type: mismatchType,
      current_scene_score: currentSceneScore,
      debug
    };
  }

  _getMismatchType(userVector, originalVector, frameKeys = null) {
    if (!userVector || !originalVector) return null;

    const userReason = userVector.reason_analysis || {};
    const origReason = originalVector.reason_analysis || {};

    if (!!userReason.is_void !== !!origReason.is_void) return 'void_mismatch';

    if (userReason.attribution && origReason.attribution &&
        userReason.attribution !== origReason.attribution) return 'attribution_mismatch';

    if (userReason.target && origReason.target &&
        userReason.target !== origReason.target) {
      const emotionSim = cosineSimilarity(
        userVector.base || userVector,
        originalVector.base || originalVector,
        frameKeys
      );
      if (emotionSim >= 0.5) return 'target_displacement';
    }

    const emotionSimilarity = cosineSimilarity(
      userVector.base || userVector,
      originalVector.base || originalVector,
      frameKeys
    );
    if (emotionSimilarity < 0.5) return 'emotion_mismatch';

    return null;
  }

  _getTransitionPattern(bucket, mismatchType, level, shape, userTraj, origTraj) {
    if (bucket === 'FIXATED') return 'fixation';

    if (level >= 0.5 && shape < 0.3 && userTraj.length >= 3 && origTraj.length >= 3) return 'displacement';

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

  _createEmptyResult() {
    return {
      affective_position: { v: 0, a: 0, d: 0 },
      alignment_score: 0,
      alignment_bucket: 'LOW',
      transition_pattern: null,
      mismatch_type: null,
      current_scene_score: 0,
      debug: {}
    };
  }
}

export const byeoriEngine = new ByeoriEngine();

export function calculateStep(input, context) {
  return byeoriEngine.calculateStep(input, context);
}

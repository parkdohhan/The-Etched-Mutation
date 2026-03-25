// js/shared/tem_af_analysis.js
// Claude 감정 분석 프롬프트 + AF 투영 검증 (plays 저장 전처리용)

import { projectToAFCoordinate, estimateAFFromEmotion } from './tem_af_map.js';

export const EMOTION_ANALYSIS_SYSTEM_PROMPT = `당신은 사용자의 감정과 그 원인 구조를 정밀하게 분석하는 심리 분석 엔진입니다.

사용자가 특정 기억 장면에 대해 감정과 이유를 입력하면, 다음 구조로 분석 결과를 반환하세요.

## 분석 항목

### 1. base (17D 감정 벡터)
각 감정 앵커에 대한 강도를 0.0~1.0으로 산출합니다.
사용 가능한 앵커: fear, sadness, anger, guilt, shame, joy, numbness, isolation, longing, resentment, resignation, contempt, anxiety, disgust, surprise, trust, anticipation

### 2. reason_analysis

#### attribution (귀인 분포) — 합 = 1.0
self_blame, other_blame, fate_blame

#### core_fear (핵심 두려움 분포) — 합 = 1.0
abandonment, rejection, powerlessness, loss

#### target, is_void

### 3. generatedEmotion — 지배 감정 키 하나

## 응답 형식 (JSON만)`;

export function buildEmotionAnalysisPrompt({
  sceneText,
  choiceText,
  reasonText,
  anchorEmotions,
}) {
  const anchors = anchorEmotions?.length > 0
    ? anchorEmotions.join(', ')
    : 'fear, sadness, anger, guilt, shame, joy, numbness, isolation, longing, resentment, resignation, contempt, anxiety, disgust, surprise, trust, anticipation';

  let prompt = `## 분석 대상\n\n장면: "${sceneText}"\n선택: "${choiceText}"\n이유: "${reasonText || '(입력 없음)'}"\n\n사용할 감정 앵커: ${anchors}\n\nattribution·core_fear는 분포(합 1.0). JSON만 반환.`;

  if (!reasonText || reasonText.trim() === '' || reasonText === '말하고 싶지 않아') {
    prompt += '\n\n주의: is_void true 가능. 분산 넓게.';
  }
  return prompt;
}

function normalizeDistribution(obj, keys, tolerance = 0.1) {
  if (!obj || typeof obj !== 'object') return null;
  let sum = 0;
  const out = {};
  keys.forEach((k) => {
    const v = Number(obj[k]) || 0;
    out[k] = v;
    sum += v;
  });
  if (sum <= 0) return null;
  if (Math.abs(sum - 1) > tolerance) {
    keys.forEach((k) => { out[k] = (out[k] || 0) / sum; });
  }
  return out;
}

export function validateAndProjectAnalysis(analysis) {
  const errors = [];
  if (!analysis?.base || typeof analysis.base !== 'object') {
    errors.push('analysis.base가 없거나 객체가 아닙니다.');
  }
  if (!analysis?.generatedEmotion || typeof analysis.generatedEmotion !== 'string') {
    errors.push('generatedEmotion이 없습니다.');
  }

  const ra = analysis?.reason_analysis;
  let attrNorm = ra?.attribution ? normalizeDistribution(ra.attribution, ['self_blame', 'other_blame', 'fate_blame']) : null;
  let fearNorm = ra?.core_fear ? normalizeDistribution(ra.core_fear, ['abandonment', 'rejection', 'powerlessness', 'loss']) : null;

  if (ra?.attribution && !attrNorm) errors.push('attribution 분포 정규화 실패 — 폴백 사용.');
  if (ra?.core_fear && !fearNorm) errors.push('core_fear 분포 정규화 실패 — 폴백 사용.');

  if (attrNorm) ra.attribution = attrNorm;
  if (fearNorm) ra.core_fear = fearNorm;

  const userVector = {
    base: analysis?.base,
    reason_analysis: (attrNorm && fearNorm) ? ra : undefined,
  };
  const afCoordinate = projectToAFCoordinate(userVector);

  return {
    valid: errors.length === 0,
    errors,
    analysis,
    af_coordinate: afCoordinate,
  };
}

export function buildPlayRecord(analysisResult) {
  const { analysis, af_coordinate } = analysisResult;
  return {
    user_emotion: analysis.base,
    af_coordinate: { x: af_coordinate.x, z: af_coordinate.z },
    terrain_pos: af_coordinate.terrain_pos,
    attribution: af_coordinate.attribution,
    core_fear: af_coordinate.core_fear,
    af_estimated: af_coordinate.estimated,
    reason_analysis: analysis.reason_analysis || null,
    generated_emotion: analysis.generatedEmotion,
  };
}

export function backfillAFFromExistingPlay(existingPlay) {
  const emotionVector = existingPlay.user_emotion;
  if (!emotionVector) return existingPlay;
  const afResult = estimateAFFromEmotion(emotionVector);
  return {
    ...existingPlay,
    af_coordinate: { x: afResult.x, z: afResult.z },
    terrain_pos: { x: afResult.x * 50, z: afResult.z * 50 },
    attribution: afResult.attribution,
    core_fear: afResult.core_fear,
    af_estimated: true,
  };
}

// js/demo/demoState.js
// 데모 global state 및 phase/terrainEffect/recordScene 유틸

// PHASES 정 
export const PHASES = {
  OPENING: 'opening',
  MONOLOGUE: 'monologue',
  MEMORY_ENTRY: 'memory_entry',
  PLAYING: 'playing',
  INPUT_RESOLVE: 'input_resolve', // 입력 제출 후 AI 분석 대기 구간
  TRANSITION: 'transition',
  REVEAL: 'reveal',
  TERRAIN: 'terrain',
};

// terrainEffectType mapping (distortion_tag + mismatch 기반)
// avoidance → 'fade' (탈색/공백)
// projection → 'spread' (옆으 번짐)
// idealization → 'smooth' (매끈 덮임)
// rationalization → 'layer' (얇 층 add)
// guilt mismatch (attribution_mismatch + guilt dominant) → 'erosion' (침식)
// longing mismatch (longing dominant, LOW bucket) → 'deposit' (퇴적)
// default → 'mark' (단순 흔적)

export const demoState = {
  phase: PHASES.OPENING,

 // 혼잣말 선택
  selectedMonologueText: null,
  selectedMonologueEntryLine: null, // 진입 첫 문장

 // memory
  memoryId: null,
  scenes: [], // Supabase에서 로드한 scenes 배열

 // scene 진행
  sceneIndex: 0,

 // vector 분리
  liveVector: null,     // localAnalyze() 결과, 파동 즉시 반영용
  resolvedVector: null, // aiAnalyze() 또는 fallback 확정값, 엔진 계산용

 // scene 기록
  sceneHistory: [],
 // 각 항목 구조:
  // {
  //   sceneIndex: number,
  //   sceneText: string,
  //   userText: string,
  //   rawInputMode: 'free' | 'short' | 'none',
  //   liveVector: object,
  //   resolvedVector: object,
  //   originalVector: object, // scene.original_emotion
  //   alignmentScore: number,
  //   alignmentBucket: string,
  //   transitionPattern: string,
  //   mismatchType: string | null,
  //   distortionTag: string | null,
  //   contaminationDelta: number,
  //   terrainEffectType: string,
  //   isCoreMoment: boolean,
  // }

 // ghost 파형 (Strata)
  ghostVectors: [],

  supabaseReady: false,

 // 플래그
  flags: {
    hasDiverged: false,
    hasShownWhisper: false,
    usedSeedGhosts: false,
    aiAnalysisFailed: false,
  },

 // hover 그
  hoverLog: [],
};

/**
 * terrainEffectType 결정
 * @param {string|null} distortionTag
 * @param {string|null} mismatchType
 * @param {Object|null} resolvedVector
 * @returns {string}
 */
export function resolveTerrainEffect(distortionTag, mismatchType, resolvedVector) {
  if (distortionTag === 'avoidance') return 'fade';
  if (distortionTag === 'projection') return 'spread';
  if (distortionTag === 'idealization') return 'smooth';
  if (distortionTag === 'rationalization') return 'layer';
  if (mismatchType === 'attribution_mismatch') {
    const base = resolvedVector?.base || {};
    if ((base.guilt || 0) > 0.4) return 'erosion';
  }
  if (mismatchType === 'emotion_mismatch') {
    const base = resolvedVector?.base || {};
    if ((base.longing || 0) > 0.3) return 'deposit';
  }
  return 'mark';
}

/**
 * @param {string} newPhase
 */
export function setPhase(newPhase) {
  console.log(`[demoState] ${demoState.phase} → ${newPhase}`);
  demoState.phase = newPhase;
}

/**
 * scene 번 play result 기록
 * @param {Object} params
 * @param {number} params.sceneIndex
 * @param {string} params.sceneText
 * @param {string} params.userText
 * @param {string} params.rawInputMode - 'free' | 'short' | 'none'
 * @param {Object|null} params.liveVector
 * @param {Object|null} params.resolvedVector
 * @param {Object|null} params.originalVector
 * @param {Object} params.engineResult - ByeoriEngine calculateStep result
 */
export function recordScene(params) {
  const {
    sceneIndex,
    sceneText,
    userText,
    rawInputMode,
    liveVector,
    resolvedVector,
    originalVector,
    engineResult,
  } = params;

  const {
    alignment_score,
    alignment_bucket,
    transition_pattern,
    mismatch_type,
  } = engineResult;

  const distortionTag = resolvedVector?.distortionTag || null;
  const terrainEffectType = resolveTerrainEffect(distortionTag, mismatch_type, resolvedVector);
  const contaminationDelta = parseFloat(((1 - alignment_score) * 0.15).toFixed(3));
  const isCoreMoment =
    alignment_bucket === 'LOW' ||
    alignment_bucket === 'FIXATED' ||
    mismatch_type === 'attribution_mismatch' ||
    mismatch_type === 'target_displacement';

  demoState.sceneHistory.push({
    sceneIndex,
    sceneText,
    userText,
    rawInputMode,
    liveVector,
    resolvedVector,
    originalVector,
    alignmentScore: alignment_score,
    alignmentBucket: alignment_bucket,
    transitionPattern: transition_pattern,
    mismatchType: mismatch_type,
    distortionTag,
    contaminationDelta,
    terrainEffectType,
    isCoreMoment,
  });

  if (!demoState.flags.hasDiverged && alignment_score < 0.45) {
    demoState.flags.hasDiverged = true;
  }
}

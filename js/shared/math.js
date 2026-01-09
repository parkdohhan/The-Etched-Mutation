// /js/shared/math.js
// 수학 유틸리티 함수들

import { TEM_ANCHOR_VAD, TEM_ANCHOR_VAD_EXTENDED } from './tem_geo_map.js';

// 전체 앵커 맵 (기본 + 확장)
let ALL_ANCHOR_VAD;
try {
  ALL_ANCHOR_VAD = { ...TEM_ANCHOR_VAD, ...TEM_ANCHOR_VAD_EXTENDED };
  console.log('[VAD] ALL_ANCHOR_VAD 초기화 완료:', Object.keys(ALL_ANCHOR_VAD).length, '개 앵커');
} catch (e) {
  console.error('[VAD] ALL_ANCHOR_VAD 초기화 실패:', e);
  console.error('[VAD] TEM_ANCHOR_VAD:', typeof TEM_ANCHOR_VAD);
  console.error('[VAD] TEM_ANCHOR_VAD_EXTENDED:', typeof TEM_ANCHOR_VAD_EXTENDED);
  ALL_ANCHOR_VAD = {};
}

// 감정 앵커 시스템 (cosineSimilarity에서 사용)
// 기본 17개 앵커 (부정/고통 10개 + 긍정/회복 7개)
export const DEFAULT_EMOTION_ANCHORS = [
  // 부정/고통
  'fear', 'sadness', 'anger', 'guilt', 'shame',
  'isolation', 'numbness', 'moral_pain', 'helplessness', 'despair',
  // 긍정/회복
  'joy', 'hope', 'relief', 'gratitude', 'love', 'peace', 'comfort'
];

// 확장 앵커 (복합/중립)
const EXTENDED_EMOTION_ANCHORS = [
  'longing', 'nostalgia', 'acceptance', 'confusion'
];

// 한글-영문 매핑
export const EMOTION_ANCHOR_MAP = {
  // 부정/고통
  '공포': 'fear',
  '두려움': 'fear',
  '무서움': 'fear',
  '슬픔': 'sadness',
  '우울': 'sadness',
  '비애': 'sadness',
  '분노': 'anger',
  '화': 'anger',
  '짜증': 'anger',
  '죄책감': 'guilt',
  '자책': 'guilt',
  '수치심': 'shame',
  '창피': 'shame',
  '창피함': 'shame',
  '고립': 'isolation',
  '외로움': 'isolation',
  '무감각': 'numbness',
  '마비': 'numbness',
  '공허': 'numbness',
  '도덕적고통': 'moral_pain',
  '도덕적 고통': 'moral_pain',
  '무력감': 'helplessness',
  '절망': 'despair',
  
  // 긍정/회복
  '기쁨': 'joy',
  '행복': 'joy',
  '희망': 'hope',
  '기대': 'hope',
  '안도': 'relief',
  '감사': 'gratitude',
  '고마움': 'gratitude',
  '사랑': 'love',
  '애정': 'love',
  '평화': 'peace',
  '평온': 'peace',
  '고요': 'peace',
  '위로': 'comfort',
  '편안': 'comfort',
  '위안': 'comfort',
  '따뜻함': 'comfort',
  
  // 확장
  '그리움': 'longing',
  '향수': 'nostalgia',
  '수용': 'acceptance',
  '받아들임': 'acceptance',
  '혼란': 'confusion',
  '당혹': 'confusion'
};

// 기록자가 자유 입력한 앵커도 허용 (매핑에 없으면 그대로 사용)
export function normalizeAnchor(anchor) {
  if (!anchor || typeof anchor !== 'string') {
    return String(anchor || '').toLowerCase();
  }
  const trimmed = anchor.trim();
  return EMOTION_ANCHOR_MAP[trimmed] || trimmed.toLowerCase();
}

// 코사인 유사도
export function cosineSimilarity(vec1, vec2, anchorEmotions = null) {
  if (!vec1 || !vec2) return 0;
  
  let keys;
  if (anchorEmotions && Array.isArray(anchorEmotions) && anchorEmotions.length > 0) {
    keys = anchorEmotions.map(anchor => normalizeAnchor(String(anchor)));
  } else {
    keys = DEFAULT_EMOTION_ANCHORS;
  }
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  keys.forEach(key => {
    const v1 = vec1[key] || 0;
    const v2 = vec2[key] || 0;
    dotProduct += v1 * v2;
    mag1 += v1 * v1;
    mag2 += v2 * v2;
  });
  
  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);
  
  if (mag1 === 0 || mag2 === 0) return 0;
  return dotProduct / (mag1 * mag2);
}

// 벡터 정규화
export function normalizeVector(vec) {
  const sum = Object.values(vec).reduce((a, b) => a + b, 0);
  if (sum === 0) return vec;
  
  const normalized = {};
  for (const key in vec) {
    normalized[key] = vec[key] / sum;
  }
  return normalized;
}

// 벡터 합산
export function addVectors(vecA, vecB) {
  const result = { ...vecA };
  for (const key in vecB) {
    result[key] = (result[key] || 0) + vecB[key];
  }
  return result;
}

/**
 * 정렬도 계산 (의미 레이어)
 * 
 * ⚠️ VAD 사용 금지 ⚠️
 * - VAD는 시각화 전용
 * - 이 함수에서 vad, terrain, position 등 사용하면 안 됨
 * - 17차원 앵커 벡터만 사용할 것
 */
// 정렬도 계산 (감정 40% + 이유 40% + VOID 20%)
export function calculateAlignment(emotionSim, reasonSim, voidMatch) {
  return (emotionSim * 0.4) + (reasonSim * 0.4) + (voidMatch * 0.2);
}

/**
 * 버킷 판정 (의미 레이어)
 * 
 * ⚠️ VAD 사용 금지 - 정렬도 값만 사용 ⚠️
 */
// 버킷 판정
export function getBucket(alignment, previousBucket = null, emotionHistory = null) {
  // FIXATED 체크
  if (emotionHistory && emotionHistory.length >= 3) {
    const last3 = emotionHistory.slice(-3);
    if (last3[0] === last3[1] && last3[1] === last3[2]) {
      return 'FIXATED';
    }
  }
  
  // 히스테리시스 적용
  if (previousBucket === 'HIGH' && alignment >= 0.45) return 'HIGH';
  if (previousBucket === 'LOW' && alignment <= 0.25) return 'LOW';
  
  // 첫 판정 또는 MID
  if (alignment >= 0.55) return 'HIGH';
  if (alignment < 0.35) return 'LOW';
  return 'MID';
}

// FIXATED 판정
export function checkFixated(emotionHistory, threshold = 3) {
  if (emotionHistory.length < threshold) return false;
  
  const recent = emotionHistory.slice(-threshold);
  const first = recent[0];
  return recent.every(e => e === first);
}

// 지배적 감정 가져오기
export function getDominantEmotion(vector) {
  if (!vector || typeof vector !== 'object') return 'sadness';
  const entries = Object.entries(vector);
  if (entries.length === 0) return 'sadness';
  return entries.sort((a, b) => (b[1] || 0) - (a[1] || 0))[0][0];
}

// ==================== VAD 투영 시스템 (시각화 전용) ====================

/**
 * 17D 감정 벡터 → VAD 좌표 투영
 * ⚠️ 시각화 전용 - 정렬도/분기 로직에 절대 사용 금지 ⚠️
 * 
 * @param {Object} emotionVec - { fear: 0.3, sadness: 0.5, ... }
 * @param {Array} anchors - 사용할 앵커 목록 (없으면 전체 사용)
 * @returns {Object} { v, a, d } 범위: -1 ~ 1
 */
export function projectEmotionToVAD(emotionVec, anchors = null) {
  // 디버깅: ALL_ANCHOR_VAD 확인
  if (!ALL_ANCHOR_VAD || Object.keys(ALL_ANCHOR_VAD).length === 0) {
    console.error('[VAD] ALL_ANCHOR_VAD가 로드되지 않았습니다!');
    console.error('[VAD] TEM_ANCHOR_VAD:', typeof TEM_ANCHOR_VAD);
    console.error('[VAD] TEM_ANCHOR_VAD_EXTENDED:', typeof TEM_ANCHOR_VAD_EXTENDED);
    return { v: 0, a: 0, d: 0 };
  }
  
  const keys = anchors?.length ? anchors : Object.keys(ALL_ANCHOR_VAD);
  
  let V = 0, A = 0, D = 0;
  let wSum = 0;
  
  for (const k of keys) {
    const weight = Number(emotionVec?.[k] ?? 0);
    if (!weight) continue;
    
    const mapping = ALL_ANCHOR_VAD[k];
    if (!mapping) {
      console.warn(`[VAD] 앵커 "${k}"에 대한 매핑이 없습니다.`);
      continue;
    }
    
    V += weight * mapping.v;
    A += weight * mapping.a;
    D += weight * mapping.d;
    wSum += weight;
  }
  
  // 가중치 합이 0이면 중립
  if (wSum <= 0) {
    console.warn('[VAD] 가중치 합이 0입니다. emotionVec:', emotionVec);
    return { v: 0, a: 0, d: 0 };
  }
  
  // 정규화
  V /= wSum;
  A /= wSum;
  D /= wSum;
  
  // [-1, 1] 클램프
  return {
    v: Math.max(-1, Math.min(1, V)),
    a: Math.max(-1, Math.min(1, A)),
    d: Math.max(-1, Math.min(1, D)),
  };
}

/**
 * VAD → 지형 XZ 좌표 변환
 * ⚠️ 시각화 전용 ⚠️
 * 
 * @param {Object} vad - { v, a, d }
 * @param {number} mapScale - 맵 크기 (기본 100)
 * @returns {Object} { x, z }
 */
export function vadToTerrainXZ(vad, mapScale = 100) {
  return {
    x: vad.v * mapScale,  // Valence → X (동-서)
    z: vad.d * mapScale,  // Dominance → Z (남-북)
  };
}

/**
 * VAD → 지형 속성 (시각화용)
 * ⚠️ 시각화 전용 ⚠️
 * 
 * @param {Object} vad - { v, a, d }
 * @returns {Object} 지형 렌더링 속성
 */
export function vadToTerrainProperties(vad) {
  return {
    // Arousal → 수직 노이즈/난류
    turbulence: Math.abs(vad.a),
    // Valence → 명도 (밝기)
    brightness: (vad.v + 1) / 2,  // 0~1 범위로 변환
    // Dominance → 안정성
    stability: (vad.d + 1) / 2,
  };
}


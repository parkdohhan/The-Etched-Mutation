// /js/shared/math.js
// 수학 유틸리티 function들

import { TEM_ANCHOR_VAD, TEM_ANCHOR_VAD_EXTENDED } from './tem_geo_map.js';

// global anchor 맵 (default + 확장)
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

// emotion anchor 시스템 (cosineSimilarity 서 )
// default 17개 anchor (negative/pain 10개 + positive/recovery 7개)
export const DEFAULT_EMOTION_ANCHORS = [
 // negative/pain
  'fear', 'sadness', 'anger', 'guilt', 'shame',
  'isolation', 'numbness', 'moral_pain', 'helplessness', 'despair',
 // positive/recovery
  'joy', 'hope', 'relief', 'gratitude', 'love', 'peace', 'comfort'
];

// 확장 anchor (복합/중립)
const EXTENDED_EMOTION_ANCHORS = [
  'longing', 'nostalgia', 'acceptance', 'confusion'
];

// 글-영문 mapping
export const EMOTION_ANCHOR_MAP = {
 // negative/pain
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
  
 // positive/recovery
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

// 기록자 자유 input anchor 허용 (mapping 없으면 그대 )
export function normalizeAnchor(anchor) {
  if (!anchor || typeof anchor !== 'string') {
    return String(anchor || '').toLowerCase();
  }
  const trimmed = anchor.trim();
  return EMOTION_ANCHOR_MAP[trimmed] || trimmed.toLowerCase();
}

/**
 * VAD similarity calculate (3D 유클리드 거리 + normalize + 지수 감쇠)
 * 
 * @param {Object} userVAD - {v, a, d} 형태 user VAD 좌표
 * @param {Object} originVAD - {v, a, d} 형태 original VAD 좌표
 * @param {number} k - 지수 감쇠 계수 (default값: 3.0)
 * @returns {number} 0~1 범위 similarity (1 까울수록 유사)
 */
export function calculateVADSimilarity(userVAD, originVAD, k = 3.0) {
 // input validate
  if (!userVAD || !originVAD) return 0;
  
  const v1 = Number(userVAD.v);
  const a1 = Number(userVAD.a);
  const d1 = Number(userVAD.d);
  const v2 = Number(originVAD.v);
  const a2 = Number(originVAD.a);
  const d2 = Number(originVAD.d);
  
 // NaN 방어
  if (isNaN(v1) || isNaN(a1) || isNaN(d1) || isNaN(v2) || isNaN(a2) || isNaN(d2)) {
    return 0;
  }
  
 // 3D 유클리드 거리 calculate
  const dv = v1 - v2;
  const da = a1 - a2;
  const dd = d1 - d2;
  const dist = Math.sqrt(dv * dv + da * da + dd * dd);
  
 // 최대 거리: VAD [-1, 1] 범위라고 정하면 최대 거리 sqrt(12)
  const maxDist = Math.sqrt(12);
  
 // normalize 거리 (0~1 범위)
  const normalizedDist = Math.max(0, Math.min(1, dist / maxDist));
  
 // 지수 감쇠: exp(-k * normalizedDist)
  return Math.exp(-k * normalizedDist);
}

/**
 * 임베딩 similarity calculate (cosine similarity, 음수 0으 클램프)
 * 
 * @param {Array<number>} vecA - 첫 번째 임베딩 vector
 * @param {Array<number>} vecB - 두 번째 임베딩 vector
 * @returns {number} 0~1 범위 similarity (음수 0으 클램프)
 */
export function calculateEmbeddingSimilarity(vecA, vecB) {
 // input validate
  if (!vecA || !vecB || !Array.isArray(vecA) || !Array.isArray(vecB)) {
    return 0;
  }
  
 // 길 불일치 또 빈 vector
  if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  
 // cosine similarity calculate
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    const a = Number(vecA[i]) || 0;
    const b = Number(vecB[i]) || 0;
    dotProduct += a * b;
    magA += a * a;
    magB += b * b;
  }
  
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  
  if (magA === 0 || magB === 0) return 0;
  
  const similarity = dotProduct / (magA * magB);
  
 // 음수 0으 클램프
  return Math.max(0, similarity);
}

/**
 * @deprecated function 구형 emotion vector similarity calculate용입니다.
 * 새 운 임베딩 similarity calculate calculateEmbeddingSimilarity 하세요.
 * 
 * cosine similarity (emotion vector용 - 하위 호환성 maintain)
 * 
 * @param {Object} vec1 - 첫 번째 emotion vector
 * @param {Object} vec2 - 두 번째 emotion vector
 * @param {Array<string>} anchorEmotions - anchor list (선택적)
 * @returns {number} -1~1 범위 cosine similarity
 */
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

// vector normalize
export function normalizeVector(vec) {
  const sum = Object.values(vec).reduce((a, b) => a + b, 0);
  if (sum === 0) return vec;
  
  const normalized = {};
  for (const key in vec) {
    normalized[key] = vec[key] / sum;
  }
  return normalized;
}

// vector 합산
export function addVectors(vecA, vecB) {
  const result = { ...vecA };
  for (const key in vecB) {
    result[key] = (result[key] || 0) + vecB[key];
  }
  return result;
}

/**
 * 감정 벡터 뺄셈 (delta 계산용)
 */
export function subtractVectors(vecA, vecB) {
  const result = {};
  const keys = new Set([...Object.keys(vecA || {}), ...Object.keys(vecB || {})]);
  for (const k of keys) {
    result[k] = (vecA?.[k] || 0) - (vecB?.[k] || 0);
  }
  return result;
}

/**
 * delta 궤적 배열을 1D 배열로 펼치기
 */
export function flattenDeltas(deltas, emotionKeys = null) {
  const keys = emotionKeys || [
    'fear','sadness','anger','guilt','shame','longing','numbness','isolation','moral_pain',
    'joy','hope','relief','gratitude','love','peace','comfort','despair','helplessness',
    'grief','tenderness','confusion','emptiness'
  ];
  const arr = [];
  for (const d of deltas) {
    for (const k of keys) arr.push(d[k] || 0);
  }
  return arr;
}

/**
 * 1D float 배열 간 코사인 유사도
 */
export function cosineFlat(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    mA += a[i] * a[i];
    mB += b[i] * b[i];
  }
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  if (mA === 0 || mB === 0) return 0;
  return dot / (mA * mB);
}

/**
 * V4 궤적 형태 유사도 (Shape Similarity)
 */
export function calculateShapeSimilarity(userTrajectory, originalTrajectory) {
  if (!userTrajectory || !originalTrajectory || userTrajectory.length < 3) {
    return { raw: 1.0, clamped: 1.0, active: false };
  }
  const deltaUser = [];
  const deltaOrig = [];
  for (let i = 1; i < userTrajectory.length; i++) {
    deltaUser.push(subtractVectors(userTrajectory[i], userTrajectory[i - 1]));
    deltaOrig.push(subtractVectors(originalTrajectory[i], originalTrajectory[i - 1]));
  }
  const raw = cosineFlat(flattenDeltas(deltaUser), flattenDeltas(deltaOrig));
  return { raw, clamped: Math.max(0, raw), active: true };
}

/**
 * V4 수준 유사도: 장면별 scene_score 평균
 */
export function calculateLevelSimilarity(sceneScores) {
  if (!sceneScores || sceneScores.length === 0) return 0;
  return sceneScores.reduce((a, b) => a + b, 0) / sceneScores.length;
}

/**
 * V4 궤적 정렬도: level × shape × void_modifier
 */
export function calculateTrajectoryAlignment(level, shape, voidMod = 1.0) {
  return Math.max(0, Math.min(1, level * shape * voidMod));
}

// ==================== 장면 단위 감정 유사도 (V4의 level 입력) ====================
// ⚠️ VAD 금지 — 17dimension anchor vector

/**
 * emotion similarity (Emotion Similarity)
 * 
 * experiencer 기록자 emotion 구조 얼마나 비슷 .
 * 임베딩 있으면 임베딩 우선, 없으면 17D cosine similarity fallback.
 * 
 * @param {Object} userVector - { base, embedding? }
 * @param {Object} originalVector - { base, embedding? }
 * @param {Array<string>} anchorEmotions - scene별 anchor (선택)
 * @returns {number} 0~1
 */
export function calculateEmotionScore(userVector, originalVector, anchorEmotions = null) {
  if (!userVector || !originalVector) return 0;

  const userEmb = userVector.embedding;
  const origEmb = originalVector.embedding;

 // 임베딩 둘 다 있으면 임베딩 similarity
  if (userEmb && origEmb && 
      Array.isArray(userEmb) && Array.isArray(origEmb) &&
      userEmb.length > 0 && origEmb.length > 0) {
    return calculateEmbeddingSimilarity(userEmb, origEmb);
  }

 // fallback: 17D cosine similarity
  const userBase = userVector.base || userVector;
  const origBase = originalVector.base || originalVector;
  return Math.max(0, cosineSimilarity(userBase, origBase, anchorEmotions));
}

// ==================== bucket 판정 ====================
//
// V4 곱셈 분포 기준 (파일럿 후 재조정)
// 히스테리시스: HIGH maintain ≥ 0.40, LOW maintain ≤ 0.15
//
// ⚠️ VAD 금지 — alignment 값 

/**
 * bucket 판정
 * 
 * @param {number} alignment - alignment (0~1)
 * @param {string|null} previousBucket - 전 bucket
 * @param {Array} emotionHistory - emotion 히스토리 (vector array)
 * @returns {string} 'HIGH' | 'MID' | 'LOW' | 'FIXATED'
 */
export function getBucket(alignment, previousBucket = null, emotionHistory = null) {
 // FIXATED 체크 (bucket 판정보다 우선)
  if (emotionHistory && emotionHistory.length >= 3) {
    const fixLevel = calculateFixationLevel(emotionHistory);
    if (fixLevel >= 0.85) {
      return 'FIXATED';
    }
  }
  
 // 히스테리시스 적용
  if (previousBucket === 'HIGH' && alignment >= 0.40) return 'HIGH';
  if (previousBucket === 'LOW' && alignment <= 0.15) return 'LOW';
  
 // 표준 판정
  if (alignment >= 0.50) return 'HIGH';
  if (alignment < 0.10) return 'LOW';
  return 'MID';
}

/**
 * FIXATED 레벨 calculate (연속 similarity 기반)
 * 
 * 단순 === comparison 아니라, 최근 N개 emotion vector cosine similarity 평균으 판정.
 * "비슷 emotion 패턴 반복" 잡 다.
 * 
 * @param {Array} emotionHistory - emotion vector array (최소 2개)
 * @returns {number} 0~1 (1 까울수록 반복)
 */
export function calculateFixationLevel(emotionHistory) {
  if (!emotionHistory || emotionHistory.length < 2) return 0;

  const recent = emotionHistory.slice(-3);
  if (recent.length < 2) return 0;

  let totalSim = 0;
  let pairs = 0;

  for (let i = 0; i < recent.length - 1; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      const a = recent[i];
      const b = recent[j];
      
      if (!a || !b) continue;
      
 // vector면 cosine similarity, 문자열 면 일치 체크
      if (typeof a === 'object' && typeof b === 'object') {
        totalSim += Math.max(0, cosineSimilarity(a, b));
      } else if (typeof a === 'string' && typeof b === 'string') {
        totalSim += (a === b) ? 1.0 : 0.0;
      }
      pairs++;
    }
  }

  if (pairs === 0) return 0;
  return totalSim / pairs;
}

// 하위 호환성 maintain
export function checkFixated(emotionHistory, threshold = 3) {
  return calculateFixationLevel(emotionHistory) >= 0.85;
}

// 지배적 emotion 져오기
export function getDominantEmotion(vector) {
  if (!vector || typeof vector !== 'object') return 'sadness';
  const entries = Object.entries(vector);
  if (entries.length === 0) return 'sadness';
  return entries.sort((a, b) => (b[1] || 0) - (a[1] || 0))[0][0];
}

// ==================== VAD projection 시스템 (시각화 only) ====================

/**
 * 17D emotion vector → VAD 좌표 projection
 * ⚠️ 시각화 only - alignment/분기 직 절대 금지 ⚠️
 * 
 * @param {Object} emotionVec - { fear: 0.3, sadness: 0.5, ... }
 * @param {Array} anchors - anchor list (없으면 global )
 * @returns {Object} { v, a, d } 범위: -1 ~ 1
 */
export function projectEmotionToVAD(emotionVec, anchors = null) {
 // 디버깅: ALL_ANCHOR_VAD check
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
      console.warn(`[VAD] 앵커 "${k}"에 대한 매핑이 not found.`);
      continue;
    }
    
    V += weight * mapping.v;
    A += weight * mapping.a;
    D += weight * mapping.d;
    wSum += weight;
  }
  
 // weight 합 0 면 중립
  if (wSum <= 0) {
    console.warn('[VAD] 가중치 합이 0입니다. emotionVec:', emotionVec);
    return { v: 0, a: 0, d: 0 };
  }
  
 // normalize
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

// ==================== AF 좌표 (Attribution × Core Fear, 시각화 전용) ====================
// 정렬도/ByeoriEngine과 분리. projectEmotionToVAD는 하위 호환용으로 유지.

export {
  ATTRIBUTION_ANCHORS,
  CORE_FEAR_ANCHORS,
  projectAttributionToX,
  projectCoreFearToZ,
  projectToAF,
  afToTerrainXZ,
  estimateAttributionFromEmotion,
  estimateCoreFearFromEmotion,
  estimateAFFromEmotion,
  projectToAFCoordinate,
  EMOTION_COLORS as AF_EMOTION_COLORS,
} from './tem_af_map.js';


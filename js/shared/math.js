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

// ==================== alignment 3축 시스템 ====================
// 
// TEM 존재 유: "같 슬픔 라 유 다르면 다른 경험"
// 
// 공식: alignment = emotion(0.4) + 유(0.4) + 태 (0.2)
//
// ⚠️ VAD 금지 — 17dimension anchor vector 
// ⚠️ 3축 비율 TEM 정체성. 변경 시 기획서 버전 올릴 것.

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

/**
 * 유 similarity (Reason Similarity)
 * 
 * "왜 그렇게 느꼈 " 구조적 comparison.
 * 임베딩 기반 text similarity 아니라, 귀인 방향/핵심 공포/대상 일치 본다.
 * 
 * 구성:
 * - attribution 일치: 0.45 (self_blame vs external 등 — 장 중요)
 * - core_fear 일치: 0.35 (abandonment, punishment 등)
 * - target 일치: 0.20 (emotion 대상 같 )
 * 
 * 유 data 없으면 emotion 점수 감쇠 fallback (0.3배)
 * → " 유 안 물어봤으면 emotion 으 추정하되, 확신 낮춘다"
 * 
 * @param {Object} userVector - { reason_analysis: { attribution, core_fear, target, is_void } }
 * @param {Object} originalVector - 동일 구조
 * @param {number} emotionScoreFallback - 유 없 때 emotion 점수 fallback
 * @returns {number} 0~1
 */
export function calculateReasonScore(userVector, originalVector, emotionScoreFallback = 0) {
  const userReason = userVector?.reason_analysis;
  const origReason = originalVector?.reason_analysis;

 // 둘 다 유 data 없으면 → emotion 점수 30% 대체
  if (!userReason && !origReason) {
    return emotionScoreFallback * 0.3;
  }

 // 쪽 없으면 → comparison 불 , 낮 점수
  if (!userReason || !origReason) {
    return 0.15;
  }

  let score = 0;

 // 1. 귀인 방향 (Attribution) — 0.45
  if (userReason.attribution && origReason.attribution) {
    if (userReason.attribution === origReason.attribution) {
      score += 0.45;
    } else {
 // 부분 일치 체크 (예: self_blame self_doubt 방향 같음)
      const userDir = getAttributionDirection(userReason.attribution);
      const origDir = getAttributionDirection(origReason.attribution);
      if (userDir === origDir) {
        score += 0.20;  // 방향은 같지만 세부가 다름
      }
 // 정반대면 0
    }
  } else if (!userReason.attribution && !origReason.attribution) {
    score += 0.15;  // 둘 다 미정의 — 중립
  }

 // 2. 핵심 공포 (Core Fear) — 0.35
  if (userReason.core_fear && origReason.core_fear) {
    if (userReason.core_fear === origReason.core_fear) {
      score += 0.35;
    } else {
 // 같 카테고리면 부분 점수
      const userCat = getFearCategory(userReason.core_fear);
      const origCat = getFearCategory(origReason.core_fear);
      if (userCat && userCat === origCat) {
        score += 0.15;
      }
    }
  } else if (!userReason.core_fear && !origReason.core_fear) {
    score += 0.10;
  }

 // 3. 대상 (Target) — 0.20
  if (userReason.target && origReason.target) {
    if (userReason.target === origReason.target) {
      score += 0.20;
    }
 // 다르면 0 (displacement 핵심 — 대상 다르면 확실히 다른 유)
  } else if (!userReason.target && !origReason.target) {
    score += 0.05;
  }

  return Math.min(1, score);
}

/**
 * 태 계수 (Attitude Coefficient)
 * 
 * experiencer memory "어떻게 접근하 " 수치화.
 * - 직면(confrontation): 높 점수
 * - 회피(avoidance): 낮 점수
 * - VOID 공명: original VOID면 높음, 아니면 낮음
 * - 반복(fixation): 감쇠
 * 
 * @param {Object} userVector - { reason_analysis: { is_void } }
 * @param {Object} originalVector - 동일 구조
 * @param {Object} attitudeContext - { emotionHistory, inputTimings, skipCount }
 * @returns {number} 0~1
 */
export function calculateAttitudeScore(userVector, originalVector, attitudeContext = {}) {
  let score = 0.5;  // 기본: 중립

  const userReason = userVector?.reason_analysis || {};
  const origReason = originalVector?.reason_analysis || {};

 // 1. VOID 매칭 ( 장 큰 영향)
  const userVoid = !!userReason.is_void;
  const origVoid = !!origReason.is_void;

  if (userVoid && origVoid) {
 // VOID 공명 — 둘 다 말 수 없 state → 높 태 점수
    score = 0.8;
  } else if (userVoid && !origVoid) {
 // 유저 회피 — 기록자 드러냈 데 experiencer 회피
    score = 0.2;
  } else if (!userVoid && origVoid) {
 // 유저 드러냈 데 original VOID — experiencer 기록자보다 용감
    score = 0.6;
  } else {
 // 둘 다 비VOID — 정상 직면
    score = 0.7;
  }

 // 2. 반복 감쇠 (fixation 경향 있으면 태 점수 깎임)
  const { emotionHistory: rawHistory, skipCount = 0 } = attitudeContext;
  const emotionHistory = rawHistory || [];
  if (emotionHistory.length >= 2) {
    const fixationLevel = calculateFixationLevel(emotionHistory);
 // fixation 높 수록 태 점수 감쇠 (최대 0.3 감소)
    score -= fixationLevel * 0.3;
  }

 // 3. 스킵 감쇠 (emotion input 건너뛴 횟수)
  if (skipCount > 0) {
    score -= Math.min(0.2, skipCount * 0.05);
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * alignment 통합 calculate
 * 
 * alignment = emotion(0.4) + 유(0.4) + 태 (0.2)
 * 
 * ⚠️ 비율 TEM 정체성.
 * ⚠️ "emotion 같아 유 다르면 alignment 낮다" 보장하 구조.
 * 
 * @param {number} emotionScore - emotion similarity (0~1)
 * @param {number} reasonScore - 유 similarity (0~1)
 * @param {number} attitudeScore - 태 계수 (0~1)
 * @returns {number} 0~1
 */
export function calculateAlignment(emotionScore, reasonScore, attitudeScore) {
  return Math.max(0, Math.min(1,
    (emotionScore * 0.4) + (reasonScore * 0.4) + (attitudeScore * 0.2)
  ));
}

// ==================== 귀인/공포 분류 헬퍼 ====================

/**
 * 귀인 방향 분류 (내부 vs external vs 상황)
 */
function getAttributionDirection(attribution) {
  if (!attribution) return null;
  const internal = ['self_blame', 'self_doubt', 'self_punishment', 'guilt_driven'];
  const external = ['other_blame', 'betrayal', 'external_threat', 'abandonment_by_other'];
  const situational = ['fate', 'circumstance', 'helpless_situation', 'inevitable'];
  
  if (internal.includes(attribution)) return 'internal';
  if (external.includes(attribution)) return 'external';
  if (situational.includes(attribution)) return 'situational';
  return null;
}

/**
 * 핵심 공포 카테고리 분류
 */
function getFearCategory(coreFear) {
  if (!coreFear) return null;
  const loss = ['abandonment', 'loss', 'separation', 'death_of_loved'];
  const worthlessness = ['inadequacy', 'failure', 'shame', 'not_enough'];
  const powerlessness = ['helplessness', 'loss_of_control', 'entrapment', 'vulnerability'];
  const punishment = ['punishment', 'rejection', 'judgment', 'exposure'];
  
  if (loss.includes(coreFear)) return 'loss';
  if (worthlessness.includes(coreFear)) return 'worthlessness';
  if (powerlessness.includes(coreFear)) return 'powerlessness';
  if (punishment.includes(coreFear)) return 'punishment';
  return null;
}

// ==================== bucket 판정 ====================
//
// 기획서 original 기준으 restore.
// HIGH ≥ 0.55, LOW < 0.35
// 히스테리시스: HIGH maintain ≥ 0.45, LOW maintain ≤ 0.42
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
  if (previousBucket === 'HIGH' && alignment >= 0.45) return 'HIGH';
  if (previousBucket === 'LOW' && alignment <= 0.42) return 'LOW';
  
 // 표준 판정
  if (alignment >= 0.55) return 'HIGH';
  if (alignment < 0.35) return 'LOW';
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


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

/**
 * VAD 유사도 계산 (3D 유클리드 거리 + 정규화 + 지수 감쇠)
 * 
 * @param {Object} userVAD - {v, a, d} 형태의 사용자 VAD 좌표
 * @param {Object} originVAD - {v, a, d} 형태의 원본 VAD 좌표
 * @param {number} k - 지수 감쇠 계수 (기본값: 3.0)
 * @returns {number} 0~1 범위의 유사도 (1에 가까울수록 유사)
 */
export function calculateVADSimilarity(userVAD, originVAD, k = 3.0) {
  // 입력 검증
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
  
  // 3D 유클리드 거리 계산
  const dv = v1 - v2;
  const da = a1 - a2;
  const dd = d1 - d2;
  const dist = Math.sqrt(dv * dv + da * da + dd * dd);
  
  // 최대 거리: VAD가 [-1, 1] 범위라고 가정하면 최대 거리는 sqrt(12)
  const maxDist = Math.sqrt(12);
  
  // 정규화된 거리 (0~1 범위)
  const normalizedDist = Math.max(0, Math.min(1, dist / maxDist));
  
  // 지수 감쇠: exp(-k * normalizedDist)
  return Math.exp(-k * normalizedDist);
}

/**
 * 임베딩 유사도 계산 (코사인 유사도, 음수는 0으로 클램프)
 * 
 * @param {Array<number>} vecA - 첫 번째 임베딩 벡터
 * @param {Array<number>} vecB - 두 번째 임베딩 벡터
 * @returns {number} 0~1 범위의 유사도 (음수는 0으로 클램프)
 */
export function calculateEmbeddingSimilarity(vecA, vecB) {
  // 입력 검증
  if (!vecA || !vecB || !Array.isArray(vecA) || !Array.isArray(vecB)) {
    return 0;
  }
  
  // 길이 불일치 또는 빈 벡터
  if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  
  // 코사인 유사도 계산
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
  
  // 음수는 0으로 클램프
  return Math.max(0, similarity);
}

/**
 * @deprecated 이 함수는 구형 감정 벡터 유사도 계산용입니다.
 * 새로운 임베딩 유사도 계산에는 calculateEmbeddingSimilarity를 사용하세요.
 * 
 * 코사인 유사도 (감정 벡터용 - 하위 호환성 유지)
 * 
 * @param {Object} vec1 - 첫 번째 감정 벡터
 * @param {Object} vec2 - 두 번째 감정 벡터
 * @param {Array<string>} anchorEmotions - 사용할 앵커 목록 (선택적)
 * @returns {number} -1~1 범위의 코사인 유사도
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

// ==================== 정렬도 3축 시스템 ====================
// 
// TEM의 존재 이유: "같은 슬픔이라도 이유가 다르면 다른 경험"
// 
// 공식: 정렬도 = 감정(0.4) + 이유(0.4) + 태도(0.2)
//
// ⚠️ VAD 사용 금지 — 17차원 앵커 벡터만 사용
// ⚠️ 이 3축 비율은 TEM의 정체성. 변경 시 기획서 버전 올릴 것.

/**
 * 감정 유사도 (Emotion Similarity)
 * 
 * 체험자와 기록자의 감정 구조가 얼마나 비슷한가.
 * 임베딩이 있으면 임베딩 우선, 없으면 17D 코사인 유사도 폴백.
 * 
 * @param {Object} userVector - { base, embedding? }
 * @param {Object} originalVector - { base, embedding? }
 * @param {Array<string>} anchorEmotions - 장면별 앵커 (선택)
 * @returns {number} 0~1
 */
export function calculateEmotionScore(userVector, originalVector, anchorEmotions = null) {
  if (!userVector || !originalVector) return 0;

  const userEmb = userVector.embedding;
  const origEmb = originalVector.embedding;

  // 임베딩 둘 다 있으면 임베딩 유사도
  if (userEmb && origEmb && 
      Array.isArray(userEmb) && Array.isArray(origEmb) &&
      userEmb.length > 0 && origEmb.length > 0) {
    return calculateEmbeddingSimilarity(userEmb, origEmb);
  }

  // 폴백: 17D 코사인 유사도
  const userBase = userVector.base || userVector;
  const origBase = originalVector.base || originalVector;
  return Math.max(0, cosineSimilarity(userBase, origBase, anchorEmotions));
}

/**
 * 이유 유사도 (Reason Similarity)
 * 
 * "왜 그렇게 느꼈는가"의 구조적 비교.
 * 임베딩 기반 텍스트 유사도가 아니라, 귀인 방향/핵심 공포/대상의 일치를 본다.
 * 
 * 구성:
 *   - attribution 일치: 0.45 (self_blame vs external 등 — 가장 중요)
 *   - core_fear 일치:  0.35 (abandonment, punishment 등)
 *   - target 일치:     0.20 (감정의 대상이 같은가)
 * 
 * 이유 데이터가 없으면 감정 점수로 감쇠 폴백 (0.3배)
 * → "이유를 안 물어봤으면 감정만으로 추정하되, 확신도를 낮춘다"
 * 
 * @param {Object} userVector - { reason_analysis: { attribution, core_fear, target, is_void } }
 * @param {Object} originalVector - 동일 구조
 * @param {number} emotionScoreFallback - 이유 없을 때 감정 점수로 폴백
 * @returns {number} 0~1
 */
export function calculateReasonScore(userVector, originalVector, emotionScoreFallback = 0) {
  const userReason = userVector?.reason_analysis;
  const origReason = originalVector?.reason_analysis;

  // 둘 다 이유 데이터 없으면 → 감정 점수의 30%로 대체
  if (!userReason && !origReason) {
    return emotionScoreFallback * 0.3;
  }

  // 한쪽만 없으면 → 비교 불가, 낮은 점수
  if (!userReason || !origReason) {
    return 0.15;
  }

  let score = 0;

  // 1. 귀인 방향 (Attribution) — 0.45
  if (userReason.attribution && origReason.attribution) {
    if (userReason.attribution === origReason.attribution) {
      score += 0.45;
    } else {
      // 부분 일치 체크 (예: self_blame과 self_doubt는 방향은 같음)
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
      // 같은 카테고리면 부분 점수
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
    // 다르면 0 (displacement의 핵심 — 대상이 다르면 확실히 다른 이유)
  } else if (!userReason.target && !origReason.target) {
    score += 0.05;
  }

  return Math.min(1, score);
}

/**
 * 태도 계수 (Attitude Coefficient)
 * 
 * 체험자가 기억에 "어떻게 접근하는가"를 수치화.
 * - 직면(confrontation): 높은 점수
 * - 회피(avoidance): 낮은 점수
 * - VOID 공명: 원본도 VOID면 높음, 아니면 낮음
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

  // 1. VOID 매칭 (가장 큰 영향)
  const userVoid = !!userReason.is_void;
  const origVoid = !!origReason.is_void;

  if (userVoid && origVoid) {
    // VOID 공명 — 둘 다 말할 수 없는 상태 → 높은 태도 점수
    score = 0.8;
  } else if (userVoid && !origVoid) {
    // 유저만 회피 — 기록자는 드러냈는데 체험자가 회피
    score = 0.2;
  } else if (!userVoid && origVoid) {
    // 유저는 드러냈는데 원본이 VOID — 체험자가 기록자보다 용감
    score = 0.6;
  } else {
    // 둘 다 비VOID — 정상 직면
    score = 0.7;
  }

  // 2. 반복 감쇠 (fixation 경향이 있으면 태도 점수 깎임)
  const { emotionHistory: rawHistory, skipCount = 0 } = attitudeContext;
  const emotionHistory = rawHistory || [];
  if (emotionHistory.length >= 2) {
    const fixationLevel = calculateFixationLevel(emotionHistory);
    // fixation이 높을수록 태도 점수 감쇠 (최대 0.3 감소)
    score -= fixationLevel * 0.3;
  }

  // 3. 스킵 감쇠 (감정 입력을 건너뛴 횟수)
  if (skipCount > 0) {
    score -= Math.min(0.2, skipCount * 0.05);
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * 정렬도 통합 계산
 * 
 * 정렬도 = 감정(0.4) + 이유(0.4) + 태도(0.2)
 * 
 * ⚠️ 이 비율이 TEM의 정체성.
 * ⚠️ "감정이 같아도 이유가 다르면 정렬도가 낮다"를 보장하는 구조.
 * 
 * @param {number} emotionScore - 감정 유사도 (0~1)
 * @param {number} reasonScore - 이유 유사도 (0~1)
 * @param {number} attitudeScore - 태도 계수 (0~1)
 * @returns {number} 0~1
 */
export function calculateAlignment(emotionScore, reasonScore, attitudeScore) {
  return Math.max(0, Math.min(1,
    (emotionScore * 0.4) + (reasonScore * 0.4) + (attitudeScore * 0.2)
  ));
}

// ==================== 귀인/공포 분류 헬퍼 ====================

/**
 * 귀인 방향 분류 (내부 vs 외부 vs 상황)
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

// ==================== 버킷 판정 ====================
//
// 기획서 원본 기준으로 복원.
// HIGH ≥ 0.55, LOW < 0.35
// 히스테리시스: HIGH 유지 ≥ 0.45, LOW 유지 ≤ 0.42
//
// ⚠️ VAD 사용 금지 — 정렬도 값만 사용

/**
 * 버킷 판정
 * 
 * @param {number} alignment - 정렬도 (0~1)
 * @param {string|null} previousBucket - 이전 버킷
 * @param {Array} emotionHistory - 감정 히스토리 (벡터 배열)
 * @returns {string} 'HIGH' | 'MID' | 'LOW' | 'FIXATED'
 */
export function getBucket(alignment, previousBucket = null, emotionHistory = null) {
  // FIXATED 체크 (버킷 판정보다 우선)
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
 * FIXATED 레벨 계산 (연속 유사도 기반)
 * 
 * 단순 === 비교가 아니라, 최근 N개 감정 벡터의 코사인 유사도 평균으로 판정.
 * "비슷한 감정 패턴의 반복"을 잡는다.
 * 
 * @param {Array} emotionHistory - 감정 벡터 배열 (최소 2개)
 * @returns {number} 0~1 (1에 가까울수록 반복)
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
      
      // 벡터면 코사인 유사도, 문자열이면 일치 체크
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

// 하위 호환성 유지
export function checkFixated(emotionHistory, threshold = 3) {
  return calculateFixationLevel(emotionHistory) >= 0.85;
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


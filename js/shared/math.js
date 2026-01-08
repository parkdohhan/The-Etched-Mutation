// /js/shared/math.js
// 수학 유틸리티 함수들

// 감정 앵커 시스템 (cosineSimilarity에서 사용)
const DEFAULT_EMOTION_ANCHORS = [
  // 부정/고통
  'fear', 'sadness', 'anger', 'guilt', 'shame',
  'isolation', 'numbness', 'moral_pain', 'helplessness', 'despair',
  // 긍정/회복
  'joy', 'hope', 'relief', 'gratitude', 'love', 'peace', 'comfort',
  // 복합/중립
  'longing', 'nostalgia', 'acceptance', 'confusion'
];

// 한글-영문 매핑
const EMOTION_ANCHOR_MAP = {
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
  '수치심': 'shame',
  '창피함': 'shame',
  '고립': 'isolation',
  '외로움': 'isolation',
  '무감각': 'numbness',
  '공허': 'numbness',
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
  '평온': 'peace',
  '고요': 'peace',
  '위안': 'comfort',
  '따뜻함': 'comfort',
  
  // 복합/중립
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

// 정렬도 계산 (감정 40% + 이유 40% + VOID 20%)
export function calculateAlignment(emotionSim, reasonSim, voidMatch) {
  return (emotionSim * 0.4) + (reasonSim * 0.4) + (voidMatch * 0.2);
}

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


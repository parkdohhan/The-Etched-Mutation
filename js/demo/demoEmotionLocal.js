// js/demo/demoEmotionLocal.js
// keyword mapping 기반 즉시 rough vector create

const KEYWORD_MAP = {
  guilt: ['미안', '잘못', '내가', '내 탓', '왜 그랬', '그러지 말았', '후회', '못한', '했어야', '나 때문'],
  longing: ['보고싶', '그립', '다시', '돌아', '그때', '기억', '남아', '아직도', '생각나'],
  sadness: ['슬프', '울', '눈물', '힘들', '아프', '무너', '지쳤', '외로', '서러'],
  fear: ['무서', '두렵', '떨렸', '겁', '불안', '피하', '도망', '싫었', '두려'],
  anger: ['화가', '짜증', '열받', '억울', '왜', '당했', '싫어', '배신', '화났'],
  shame: ['창피', '부끄', '민망', '들킬', '숨기', '말 못', '쪽팔'],
  numbness: ['모르겠', '아무', '없었', '그냥', '별로', '신경', '멍', '몰라'],
  isolation: ['혼자', '아무도', '없었', '버려', '떠났', '남겨', '나만'],
  moral_pain: ['해선 안', '그러면 안', '잘못된', '틀렸', '나쁜 짓'],
};

const ATTRIBUTION_MAP = {
  self: ['내가 먼저', '내 잘못', '내가 했', '내가 안', '내가 못', '나 때문에', '내가 그랬'],
  other: ['걔가', '그가', '그녀가', '상대가', '저 사람', '네가', '그 사람이'],
  situation: ['어쩔 수 없', '할 수 없', '그럴 수밖에', '원래', '다 그래', '별 수', '상황이'],
};

const DISTORTION_MAP = {
  idealization: ['좋았', '행복', '괜찮았', '원래는', '사실은 좋', '나쁘지 않'],
  rationalization: ['어쩔 수 없', '당연히', '원래 다', '그럴만', '이해', '맞는', '어쩌겠'],
  projection: ['걔가', '그 사람이', '상대가', '걔 때문', '그 탓', '너 때문'],
  avoidance: ['모르겠', '그냥', '별로', '뭐', '아무', '상관없', '신경'],
};

/**
 * @param {string} text
 * @returns {{ base: Object, attribution: string|null, distortionTag: string|null, isVoid: boolean, isRough: boolean }|null}
 */
export function localAnalyze(text) {
  if (!text || text.trim().length < 2) return null;

  const base = {
    fear: 0,
    sadness: 0,
    anger: 0,
    guilt: 0,
    shame: 0,
    longing: 0,
    numbness: 0,
    isolation: 0,
    moral_pain: 0,
  };

  let attribution = null;
  let distortionTag = null;

  for (const [emotion, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        base[emotion] = Math.min(1, (base[emotion] || 0) + 0.4);
      }
    }
  }

  for (const [type, keywords] of Object.entries(ATTRIBUTION_MAP)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        attribution = type;
        if (type === 'self') base.guilt = Math.min(1, (base.guilt || 0) + 0.2);
        if (type === 'other') base.anger = Math.min(1, (base.anger || 0) + 0.2);
        break;
      }
    }
    if (attribution) break;
  }

  for (const [tag, keywords] of Object.entries(DISTORTION_MAP)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        distortionTag = tag;
        break;
      }
    }
    if (distortionTag) break;
  }

  const totalScore = Object.values(base).reduce((a, b) => a + b, 0);
  const isVoid = totalScore < 0.1;

  return {
    base,
    attribution,
    distortionTag,
    isVoid,
    isRough: true,
  };
}

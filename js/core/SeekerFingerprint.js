/**
 * SeekerFingerprint — 멀티턴 대화 누적 fingerprint(찾는이 카드) 순수 로직 모음.
 *
 * V2.1 SCOPE §4 V2-3 (대화 입력 + emotion 분석 파이프라인) 의 *DOM·supabase 무관* 영역.
 * opening.js (오프닝 시퀀스 모듈) 가 import 해서 멀티턴 진행 중 누적.
 *
 * 데이터 모델:
 *   SeekerCard = {
 *     emotion_vec: Object<감정키, 0~1>,
 *     attribution: 'self_blame'|'other_blame'|'fate_blame'|null,
 *     core_fear:   'abandonment'|'death'|'rejection'|'failure'|null,
 *     modality:    'visual'|'olfactory'|'auditory'|'somatic'|'narrative'|null,
 *     role:        'actor'|'observer'|'victim'|null,
 *     motif_words: string[],
 *     _turnsRaw:   [{ turn, raw_text, ts }]
 *   }
 *
 * 누적 룰:
 *   - emotion_vec   EMA new = α·turn + (1-α)·old (첫 턴은 α=1 그대로 박음)
 *   - 카테고리      마지막 턴 우선 (덮어쓰기, unknown/none 은 무시)
 *   - motif_words  모든 턴 텍스트의 키워드 합집합 (한글 2자+ 또는 영어 3자+)
 *
 * SeekerMatchEngine.scoreCard 입력으로 그대로 들어감.
 */

// 감정 12축 — claude-scene emotion_extract 출력 키 정합 + SeekerMatchEngine emotion_vec 정합
export const EMOTION_KEYS = Object.freeze([
  'fear', 'sadness', 'anger', 'joy', 'longing', 'guilt',
  'shame', 'numbness', 'isolation', 'relief', 'confusion', 'emptiness',
]);

// 빈 슬롯 다음 질문 풀. 우선순위 = modality > role > attribution > core_fear > fallback.
export const QUESTION_BANK = Object.freeze({
  ko: {
    modality:    '그때 가장 또렷한 게 뭐야 — 소리야, 냄새야, 표정이야?',
    role:        '너는 그 자리에 있었어, 아니면 멀리서 봤어?',
    attribution: '그게 누구 때문이라는 느낌이 들어?',
    core_fear:   '뭐가 가장 두려웠어 — 떠난 것, 미워진 것, 못 한 것 중에?',
    fallback:    '그 다음에 뭐가 떠올라?',
  },
  en: {
    modality:    'What stands out most — a sound, a smell, a face?',
    role:        'Were you there, or watching from far?',
    attribution: 'Whose fault did it feel like?',
    core_fear:   'What scared you most — leaving, being hated, or failing?',
    fallback:    'What comes next?',
  },
});

// 감정 칩 → emotion_vec 시드 (턴 1 칩 입력 시 LLM 호출 대신 직접 박음)
export const CHIP_EMOTION_SEED = Object.freeze({
  sadness: { sadness: 0.85 },
  longing: { longing: 0.85, sadness: 0.30 },
  anger:   { anger:   0.85 },
  fear:    { fear:    0.85 },
  guilt:   { guilt:   0.85, shame: 0.30 },
  joy:     { joy:     0.85 },
});

export const TOTAL_TURNS = 3;

export function initFingerprint() {
  return {
    emotion_vec: {},
    attribution: null,
    core_fear: null,
    modality: null,
    role: null,
    motif_words: [],
    extractor_version: null,  // 멀티턴 마지막 emotion_extract 응답의 prompt_version (speciation INSERT 시 도장)
    _turnsRaw: [],
    _askedSlots: [],
  };
}

/**
 * 한 turn 결과를 fingerprint 에 누적.
 * @param {Object} fp           - SeekerCard
 * @param {Object} turnResult   - { base, reason_analysis, modality, _raw_text }
 * @param {number} [alpha=0.6]  - EMA 계수 (첫 턴은 _turnsRaw 비었으면 1.0)
 */
export function mergeTurn(fp, turnResult, alpha) {
  if (!fp || !turnResult) return fp;
  const a = (typeof alpha === 'number') ? alpha : 0.6;
  const isFirst = (fp._turnsRaw && fp._turnsRaw.length === 0);

  const base = (turnResult.base && typeof turnResult.base === 'object') ? turnResult.base : null;
  if (base) {
    for (const k of EMOTION_KEYS) {
      const v = Number(base[k]) || 0;
      const prev = Number(fp.emotion_vec[k]) || 0;
      const merged = isFirst ? v : (a * v + (1 - a) * prev);
      if (merged > 0.05) fp.emotion_vec[k] = Number(merged.toFixed(3));
      else delete fp.emotion_vec[k];
    }
  }

  const r = (turnResult.reason_analysis && typeof turnResult.reason_analysis === 'object') ? turnResult.reason_analysis : {};
  if (r.attribution && r.attribution !== 'unknown') fp.attribution = r.attribution;
  if (r.core_fear && r.core_fear !== 'none') fp.core_fear = r.core_fear;
  if (r.role && r.role !== 'unknown') fp.role = r.role;
  if (turnResult.modality) fp.modality = turnResult.modality;
  if (turnResult.prompt_version) fp.extractor_version = turnResult.prompt_version;

  const text = String(turnResult._raw_text || '');
  if (text) {
    const words = extractMotifWords(text);
    fp.motif_words = Array.from(new Set([...(fp.motif_words || []), ...words]));
  }
  return fp;
}

/** 한글 2자+ 또는 영어 3자+ 토큰 추출. 모두 소문자. */
export function extractMotifWords(text) {
  if (!text) return [];
  const matches = String(text).match(/[가-힣]{2,}|[a-zA-Z]{3,}/g) || [];
  return matches.map(w => w.toLowerCase());
}

/**
 * 빈 슬롯 우선순위로 다음 질문 픽. modality > role > attribution > core_fear > fallback.
 * 한 번 물은 슬롯은 답이 안 채워졌어도 다시 묻지 않음 (_askedSlots) — 무한 반복 방지.
 */
export function pickNextQuestion(fp, lang) {
  const bank = QUESTION_BANK[lang] || QUESTION_BANK.en;
  if (!fp._askedSlots) fp._askedSlots = [];
  const order = ['modality', 'role', 'attribution', 'core_fear'];
  for (const slot of order) {
    if (!fp[slot] && fp._askedSlots.indexOf(slot) < 0) {
      fp._askedSlots.push(slot);
      return bank[slot];
    }
  }
  return bank.fallback;
}

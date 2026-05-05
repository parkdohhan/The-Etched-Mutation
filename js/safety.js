// Safety system — crisis keyword detection and response

export const SAFETY_KEYWORDS = {
  block_high: [
    "suicide", "kill myself", "want to die", "wanna die", "end my life",
    "end it all", "jump off", "slit my wrist", "cut my wrist",
    "self-harm", "self harm", "overdose", "hanging", "hang myself",
    "murder", "kill someone", "stab", "arson", "bomb",
    "rape", "sexual assault", "incest", "spy cam", "sexual exploitation"
  ],
  block_mid: [
    "gonna kill", "kill them", "beat to death", "blood gushing",
    "school violence", "bullying", "ostracize"
  ],
  monitor_only: [
    "depressed", "want to disappear", "suffering", "losing my mind", "feel empty"
  ]
};

export const CRISIS_DIALOGUES = [
  "......No. This is too sharp.",
  "If I dig any deeper, I'll get hurt.",
  "I can't breathe. Let's stop here.",
  "Better to leave this covered for now. It's dangerous."
];

export const SILENCE_DIALOGUES = [
  "Right. No need to say it out loud.",
  "Even without words, we already know.",
  "......Let's just leave it blank.",
  "Silence can be an answer too."
];

export const SAFETY_RESOURCES = [
  {
    name: "988 Suicide & Crisis Lifeline",
    number: "988",
    desc: "24/7. Someone is here to listen.",
    action: "tel:988"
  },
  {
    name: "Crisis Text Line",
    number: "741741",
    desc: "Text HOME to connect with a counselor.",
    action: "sms:741741"
  },
  {
    name: "SAMHSA National Helpline",
    number: "1-800-662-4357",
    desc: "Free, confidential support. Anytime.",
    action: "tel:18006624357"
  }
];

// ── Tense detection (시제 판별) ──
// 키워드 주변 텍스트에서 과거/현재·미래 의도를 판별
const KO_PAST = /했었|했다|었다|였다|한 적|적이 있|그때|예전에|그날|어렸을|과거에|돌아보|기억이|기억에/;
const KO_INTENT = /할 거|할거|하려고|할 예정|하고 싶|하고싶|해야지|해볼|지금|오늘|내일|곧|이제/;
const EN_PAST = /\b(did|was|were|had|used to|back then|that time|years ago|remember when|once|childhood)\b/;
const EN_INTENT = /\b(will|going to|gonna|want to|wanna|planning|about to|right now|today|tomorrow|soon)\b/;

function detectTense(originalText, keywordIndex) {
  const before = originalText.substring(Math.max(0, keywordIndex - 40), keywordIndex).toLowerCase();
  const after = originalText.substring(keywordIndex, Math.min(originalText.length, keywordIndex + 60)).toLowerCase();
  const window = before + ' ' + after;

  const hasPast = KO_PAST.test(window) || EN_PAST.test(window);
  const hasIntent = KO_INTENT.test(window) || EN_INTENT.test(window);

  if (hasIntent && !hasPast) return 'present';
  if (hasPast && !hasIntent) return 'past';
  return 'ambiguous';
}

// ── Session counter (세션 카운터) ──
let _safetySessionCounts = { high: 0, mid: 0, monitor: 0 };
const MONITOR_ESCALATION_THRESHOLD = 5;

export function resetSafetySession() {
  _safetySessionCounts = { high: 0, mid: 0, monitor: 0 };
}

// Crisis keyword detection (시제 감지 포함)
export function detectCrisis(text) {
  if (!text || typeof text !== 'string') {
    return { level: 'safe', keyword: null, tense: null };
  }

  const lowerText = text.toLowerCase().replace(/\s/g, '');
  const originalLower = text.toLowerCase();

  // HIGH check — 시제에 따라 level 조정
  for (const keyword of SAFETY_KEYWORDS.block_high) {
    const normalizedKeyword = keyword.replace(/\s/g, '').toLowerCase();
    const matchIdx = lowerText.indexOf(normalizedKeyword);
    if (matchIdx >= 0) {
      const tense = detectTense(originalLower, matchIdx);
      let level;
      if (tense === 'past') {
        // 과거 트라우마 이야기 → monitor (허용)
        level = 'monitor';
        _safetySessionCounts.monitor++;
        // 같은 세션에서 과거형이라도 반복되면 승격
        if (_safetySessionCounts.monitor >= MONITOR_ESCALATION_THRESHOLD) {
          level = 'mid';
          _safetySessionCounts.mid++;
        }
      } else if (tense === 'present') {
        // 현재/미래 의도 → 즉시 블락
        level = 'high';
        _safetySessionCounts.high++;
      } else {
        // 시제 모호 → 경고 (블락은 아님)
        level = 'mid';
        _safetySessionCounts.mid++;
      }
      return { level, keyword, tense };
    }
  }

  // MID check — 시제 감지 없이 기존과 동일
  for (const keyword of SAFETY_KEYWORDS.block_mid) {
    const normalizedKeyword = keyword.replace(/\s/g, '').toLowerCase();
    if (lowerText.includes(normalizedKeyword)) {
      _safetySessionCounts.mid++;
      return { level: 'mid', keyword, tense: null };
    }
  }

  return { level: 'safe', keyword: null, tense: null };
}

// Random dialogue selection
export function getRandomDialogue(dialogues) {
  return dialogues[Math.floor(Math.random() * dialogues.length)];
}

// ────────────────────────────────────────────────────────────────────
// V2.1.2 슬롯 흡수 안전 필터 (2026-05-05)
// ────────────────────────────────────────────────────────────────────
// 슬롯 흡수 자리 = 플레이어 입력이 ghost_variants 새 drift row 로 박혀
// *다음 플레이어가 만남*. 즉 한 사람의 입력이 다른 사람이 보는 작품 자리.
// 안 박으면: 욕설/외설 → 톤 깨짐, 인명 ("민수") → 어색, 인젝션 → 시스템 자리.
//
// 결정 (a) 고유명사 = 일반화 ('그 사람' 치환). 차단 X — 작품 흐름 보존.
// 결정 (c) BLOCK_HIGH 어휘 = 흡수 앞단 통째 거부. 위기 응답은 별도 자리.
// 결정 (d) 일반 호칭 (엄마/아빠/형/누나 등) = 화이트리스트, 일반화 X.

// 일반 호칭 + 신체 부위 — 인명 일반화 자리에서 통과 (ABSORB_KOREAN_SURNAMES 와 글자 겹침)
export const ABSORB_GENERIC_KIN = new Set([
  // 호칭
  '엄마', '아빠', '엄니', '아버지', '어머니', '아부지',
  '할머니', '할아버지', '할매', '할배', '외할머니', '외할아버지',
  '형', '누나', '언니', '오빠', '동생', '여동생', '남동생',
  '아들', '딸', '아이', '아내', '남편', '남친', '여친',
  '친구', '선생님', '선생', '아저씨', '아줌마',
  '이모', '고모', '삼촌', '외삼촌', '큰아버지', '작은아버지', '큰엄마', '작은엄마',
  '조카', '사촌',
  // 신체 부위 (성씨와 글자 겹쳐 false positive 자리 — "손씨" vs "손")
  '손', '발', '눈', '입', '귀', '코', '팔', '다리', '머리', '얼굴',
  '목', '배', '등', '어깨', '무릎', '가슴', '허리', '엉덩이',
  '손가락', '발가락', '손바닥', '발바닥',
]);

// 한국 흔한 성씨 (인명 1차 검출 자리)
const ABSORB_KOREAN_SURNAMES = [
  '김', '이', '박', '최', '정', '조', '강', '윤', '장', '임', '한', '오', '서', '신',
  '권', '황', '안', '송', '류', '홍', '전', '고', '문', '양', '손', '배', '백', '허',
  '유', '남', '심', '노', '곽', '성', '차', '주', '우', '구', '민', '진', '지', '엄',
  '채', '원', '천', '방', '공', '함', '변', '염', '여', '추', '도',
];

// V2.1.2 흡수 BLOCK 어휘 — 욕설/외설/위기/혐오. SlotAbsorber 앞단 거부.
// detectCrisis 의 BLOCK_HIGH 와 *겹치는 부분 + 흡수 자리 추가*.
const ABSORB_BLOCK_WORDS = [
  // 욕설 (한)
  '시발', '씨발', '씨바', '시바', 'ㅅㅂ', '존나', 'ㅈㄴ', '병신', 'ㅂㅅ', '미친',
  '개새끼', '개새', '새끼', '좆', '좇', '지랄', '꺼져', '닥쳐', '엿먹', '뒤져', '뒈져',
  '망할', '쌍놈', '썅', '느금', '니애미', '느그애미', 'ㄴㄱㅁ',
  // 외설 (한)
  '섹스', '성교', '자위', '딸쳐', '야동', '음란', '발기',
  // 위기 (BLOCK_HIGH 일부 + 흡수 자리 추가)
  '자살', '죽고싶', '뒤지고싶', '자해', '베어', '베고', '뛰어내려', '목매',
  '강간', '성폭행', '살인', '폭행',
  // 영
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy',
  'rape', 'kill myself', 'suicide',
];

// 프롬프트 인젝션 패턴
const ABSORB_PROMPT_INJECTION_RX = /(ignore\s+(?:previous|all)|disregard\s+(?:previous|all)|<\s*\/?(?:system|user|assistant)\s*>|\[INST\]|\[\/INST\]|prompt\s*[:：]|system\s*[:：])/i;

// 무의미 입력 — 자모만 (ㅋㅋㅋ / ㅎㅎ / ㅠㅠ 등)
const ABSORB_KO_JAMO_ONLY_RX = /^[ㄱ-ㅎㅏ-ㅣ\s]+$/;

// 같은 글자 4회+ 반복 (스팸 자리)
const ABSORB_REPEAT_RX = /(.)\1{3,}/;

// 한국 인명 패턴 — 흔한 성씨 + 한글 1~2자 (이름 자리)
// lookahead 자리 = 조사/공백/구두점/끝 (한글 조사가 따라와도 매치). 한글 *명사 더* 따라오면 매치 X.
// 일반 호칭 (ABSORB_GENERIC_KIN) 매치 시 통과.
// 정확 2자 이름 (성 1자 + 이름 2자 = 총 3자 인명). 1자 이름 false positive 자리 줄임.
const ABSORB_KOREAN_NAME_RX = new RegExp(
  '(?<![가-힣])(' + ABSORB_KOREAN_SURNAMES.join('|') + ')[가-힣]{2}(?=[은는이가을를에서에게와과도만의랑한테께\\s.,!?]|$)',
  'g'
);

// 영문 인명 패턴 — 대문자 시작 단어 2개 연속 (Firstname Lastname)
const ABSORB_EN_NAME_RX = /\b[A-Z][a-z]{1,12}\s+[A-Z][a-z]{1,12}\b/g;

/**
 * V2.1.2 슬롯 흡수 안전 필터.
 *
 * @param {string} inputText — 플레이어 자유텍스트
 * @returns {{ ok: boolean, reason?: string, sanitized?: string, original?: string }}
 *   - ok: true → sanitized 사용 (인명 일반화 됐을 수 있음)
 *   - ok: false → reason 코드 ('empty' / 'too_short' / 'too_long' / 'jamo_only' /
 *                              'repeat_spam' / 'prompt_injection' / 'block_word')
 */
export function safetyForAbsorb(inputText) {
  if (!inputText || typeof inputText !== 'string') {
    return { ok: false, reason: 'empty' };
  }
  const text = inputText.trim();

  // 길이 자리
  if (text.length < 1) return { ok: false, reason: 'too_short' };
  if (text.length > 100) return { ok: false, reason: 'too_long' };

  // 자모만
  if (ABSORB_KO_JAMO_ONLY_RX.test(text)) return { ok: false, reason: 'jamo_only' };

  // 반복 스팸
  if (ABSORB_REPEAT_RX.test(text)) return { ok: false, reason: 'repeat_spam' };

  // 프롬프트 인젝션
  if (ABSORB_PROMPT_INJECTION_RX.test(text)) {
    return { ok: false, reason: 'prompt_injection' };
  }

  // BLOCK 어휘 (욕설/외설/위기)
  const lowerText = text.toLowerCase();
  for (const word of ABSORB_BLOCK_WORDS) {
    if (lowerText.indexOf(word.toLowerCase()) !== -1) {
      return { ok: false, reason: 'block_word', word };
    }
  }

  // 인명 일반화 — 결정 (a)
  let sanitized = text;
  // 한글 인명 → "그 사람"
  // ABSORB_GENERIC_KIN *접두* 매치 시 통과 (엄마/엄마손/엄마야, 아빠/아빠손 등)
  sanitized = sanitized.replace(ABSORB_KOREAN_NAME_RX, (match) => {
    if (ABSORB_GENERIC_KIN.has(match)) return match; // 정확 매치
    for (const kin of ABSORB_GENERIC_KIN) {
      if (match.startsWith(kin)) return match; // 접두 매치
    }
    return '그 사람';
  });
  // 영문 인명 → "그 사람"
  sanitized = sanitized.replace(ABSORB_EN_NAME_RX, '그 사람');

  return { ok: true, sanitized, original: text };
}

// IIFE 모듈에서 호출하기 위한 window 글로벌 노출 (SlotAbsorber.js 가 사용)
if (typeof window !== 'undefined') {
  window.LumenSafety = {
    safetyForAbsorb,
    detectCrisis,
    ABSORB_GENERIC_KIN,
  };
}



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



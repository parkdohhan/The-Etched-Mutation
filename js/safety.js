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

// Crisis keyword detection
export function detectCrisis(text) {
  if (!text || typeof text !== 'string') {
    return { level: 'safe', keyword: null };
  }
  
  const lowerText = text.toLowerCase().replace(/\s/g, '');
  
  // HIGH check
  for (const keyword of SAFETY_KEYWORDS.block_high) {
    const normalizedKeyword = keyword.replace(/\s/g, '').toLowerCase();
    if (lowerText.includes(normalizedKeyword)) {
      return { level: 'high', keyword };
    }
  }
  
  // MID check
  for (const keyword of SAFETY_KEYWORDS.block_mid) {
    const normalizedKeyword = keyword.replace(/\s/g, '').toLowerCase();
    if (lowerText.includes(normalizedKeyword)) {
      return { level: 'mid', keyword };
    }
  }
  
  return { level: 'safe', keyword: null };
}

// Random dialogue selection
export function getRandomDialogue(dialogues) {
  return dialogues[Math.floor(Math.random() * dialogues.length)];
}



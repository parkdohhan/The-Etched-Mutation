// 안전 시스템 - 위기 키워드 감지 및 대응

export const SAFETY_KEYWORDS = {
  block_high: [
    "자살", "죽고싶다", "죽고 싶다", "죽고싶어", "죽고 싶어",
    "뛰어내리", "손목을 긋", "손목 긋", "자해", "약물 과다",
    "수면제", "번개탄", "목을 매", "목매",
    "살인", "칼로 찌르", "방화", "폭탄",
    "강간", "성폭행", "근친", "몰카", "성착취"
  ],
  block_mid: [
    "죽여버리", "패죽이", "피가 솟구쳐",
    "학교 폭력", "왕따", "따돌림"
  ],
  monitor_only: [
    "우울해", "사라지고 싶어", "괴로워", "미치겠어", "허무해"
  ]
};

export const CRISIS_DIALOGUES = [
  "......아냐, 이건 너무 날카로워.",
  "이 이상 파고들면, 내가 다쳐.",
  "숨이 막혀. 여기까지만 하자.",
  "지금은 덮어두는 게 좋겠어. 위험해."
];

export const SILENCE_DIALOGUES = [
  "그래, 굳이 입 밖으로 낼 필요 없어.",
  "말하지 않아도, 우린 이미 아니까.",
  "......그냥, 빈칸으로 남겨두자.",
  "침묵도 대답이 될 수 있어."
];

export const SAFETY_RESOURCES = [
  {
    name: "자살예방 상담전화",
    number: "109",
    desc: "24시간, 당신의 이야기를 들어줍니다.",
    action: "tel:109"
  },
  {
    name: "정신건강 위기상담전화",
    number: "1577-0199",
    desc: "전문가와 연결되는 핫라인",
    action: "tel:15770199"
  },
  {
    name: "청소년 상담",
    number: "1388",
    desc: "힘들 땐 언제든 연락하세요.",
    action: "tel:1388"
  }
];

// 위기 키워드 감지
export function detectCrisis(text) {
  if (!text || typeof text !== 'string') {
    return { level: 'safe', keyword: null };
  }
  
  const lowerText = text.toLowerCase().replace(/\s/g, '');
  
  // HIGH 체크
  for (const keyword of SAFETY_KEYWORDS.block_high) {
    const normalizedKeyword = keyword.replace(/\s/g, '').toLowerCase();
    if (lowerText.includes(normalizedKeyword)) {
      return { level: 'high', keyword };
    }
  }
  
  // MID 체크
  for (const keyword of SAFETY_KEYWORDS.block_mid) {
    const normalizedKeyword = keyword.replace(/\s/g, '').toLowerCase();
    if (lowerText.includes(normalizedKeyword)) {
      return { level: 'mid', keyword };
    }
  }
  
  return { level: 'safe', keyword: null };
}

// 랜덤 대사 선택
export function getRandomDialogue(dialogues) {
  return dialogues[Math.floor(Math.random() * dialogues.length)];
}



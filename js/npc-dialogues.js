// The Resonant Self 대사 시스템
// 핵심 규칙: "사라지는 건 NPC가 아니라 기억의 디테일(감각/맥락/정서)"

const NPC_DIALOGUES = {
  
  // Phase 0: 오프닝
  opening: {
    firstVisit: [
      "안녕. 나는 또다른 너야.",
      "무슨 기억을 남기고 싶어?",
      "아니면... 누군가의 기억을 먼저 들여다볼래?"
    ],
    returning: [
      "왔구나. 오랜만이야.",
      "...기억을 찾으러 왔다고?",
      "들어와. 네가 원하는 걸 찾을 수 있을진 모르겠지만.."
    ]
  },

  // Phase 1: 문 열기 (Confession)
  confession: {
    entry: [
      "뭐가 먼저 떠올라?"
    ],
    senseSelected: (sense) => `${sense}... 맞아. 여기서 시작하면 돼.`,
    immersionStart: "지금 떠올리지 않으면, 기억이 더 흐려질 거야.",
    transition: "그때로 돌아가보자. 그때 거기 있었잖아."
  },

  // Phase 2: 흘러가게 두기 (Free Writing)
  freeWriting: {
    start: [
      "처음부터. 떠오르는 대로.",
      "순서 틀려도 돼. 빠뜨려도 돼."
    ],
    alive: ["응.", "그래."],
    response: [
      "응. 그랬었지.",
      "맞아. 기억나.",
      "그래... 점점 선명해지고 있어."
    ],
    silence: {
      5: "...천천히.",
      10: "그 다음엔.",
      15: "아직 거기 있어?",
      20: "장면이 흐려진다.",
      30: "이 부분은 빈칸으로 남아.",
      40: "지금 잡지 않으면, 여기는 비어있게 돼."
    },
    senseLacking: [
      "장면이 흐릿해. 불빛은 어땠어?",
      "소리가 안 들려. 뭐가 들렸었지?",
      "온도가 없어. 춥거나 뜨거웠어?",
      "냄새... 뭔가 있었을 텐데."
    ],
    emotionAvoiding: [
      "상황은 보여. 근데 네 감각이 빠져있어.",
      "거기 네가 없어."
    ],
    emotionAvoidingPersist: [
      "이 부분 비워두면 빈칸으로 남아.",
      "채우지 않으면 계속 흐릿해."
    ],
    emotionInput: [
      "...그랬구나.",
      "응. 그럴 수밖에 없었지.",
      "나도 그랬어.",
      "무게가 컸어."
    ],
    detailRich: [
      "점점 선명해지고 있어.",
      "거의 다 잡혔어.",
      "맞아. 이거야."
    ],
    complete: [
      "...이제 다 떠올랐어.",
      "형체가 잡혔어.",
      "고생했어."
    ]
  },

  // Phase 3: AI 구조화
  structuring: {
    resonantLast: "이제 기록해두자. 다시 흐려지기 전에.",
    neutralProcessing: "구조화 중입니다.",
    neutralComplete: "완료되었습니다."
  },

  // Phase 4: 확인 & 봉인
  sealing: {
    neutral: [
      "복원된 기억입니다.",
      "확인해주세요."
    ],
    resonant: [
      "이제 봉인해두자.",
      "다시 흐려지기 전에."
    ]
  },

  // Archive 모드
  archive: {
    choiceMade: [
      "같은 선택... 하지만 이유도 같을까?",
      "다른 길을 걸었네. 그것도 하나의 해석이야."
    ],
    customAction: (action) => `"${action}"... 흥미로운 선택이야.`,
    alignmentHigh: "그 마음은 이해할 수 있을 것 같아.",
    alignmentMid: "아직 형체가 분명하지 않아.",
    alignmentLow: "너는 다르게 느끼는구나.",
    alignmentFixated: "계속 같은 자리에 돌아오고 있어.",
    trueEnding: "이 기억의 지층 어딘가에, 방금 너의 선택과 이유가 얇은 층으로 남았어.",
    normalEnding: "이제 이 기억은 Live에서 Archive로 넘겨질 거야. 당신의 해석도 함께."
  },

  // Live 모드
  live: {
    sceneArrived: "화자의 기억이 도착했어.",
    emotionCue: "이 장면에서 어떤 감정이 느껴져?",
    memoryTransition: "이제 이 기억은 Live에서 Archive로 넘겨질 거야. 당신의 해석도 함께."
  },

  // Intro 화면
  intro: {
    firstVisit: "처음이야?",
    returning: "내가 필요하면 언제든 불러."
  },

  // Memory Registration
  registration: {
    start: "그날의 기억을 말해줘",
    sceneComplete: "좋아, 이 장면은 기록했어. 다음 기억이 있어?",
    memoryComplete: "기억이 지층에 묻혔습니다."
  },

  // Bucket 피드백
  bucket: {
    HIGH: "그 마음은 이해할 수 있을 것 같아.",
    MID: "아직 형체가 분명하지 않아.",
    LOW: "너는 다르게 느끼는구나.",
    FIXATED: "계속 같은 자리에 돌아오고 있어."
  }
};

// 유틸리티 함수들
function getRandomDialogue(dialogues) {
  if (Array.isArray(dialogues)) {
    return dialogues[Math.floor(Math.random() * dialogues.length)];
  }
  return dialogues;
}

function getDialogueByKey(path) {
  const keys = path.split('.');
  let current = NPC_DIALOGUES;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      console.warn(`Dialogue path not found: ${path}`);
      return null;
    }
  }
  
  if (typeof current === 'function') {
    return current;
  }
  
  return getRandomDialogue(current);
}

// 내보내기
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NPC_DIALOGUES, getRandomDialogue, getDialogueByKey };
}



// The Resonant Self — dialogue system
// Core rule: "What fades is not the NPC, but the detail of memory (sense/context/emotion)"

const NPC_DIALOGUES = {
  
  // Phase 0: Opening
  opening: {
    firstVisit: [
      "Hello. I'm another you.",
      "What memory do you want to leave behind?",
      "Or... would you rather look into someone else's memory first?"
    ],
    returning: [
      "You're here.",
      "...you came looking for a memory?",
      "Come in."
    ]
  },

  // Phase 1: Opening the door (Confession)
  confession: {
    entry: [
      "What comes to mind first?"
    ],
    senseSelected: (sense) => `${sense}... right. You can start here.`,
    immersionStart: "If you don't recall it now, the memory will only grow fainter.",
    transition: "Let's go back to that moment. You were there."
  },

  // Phase 2: Letting it flow (Free Writing)
  freeWriting: {
    start: [
      "From the beginning. Whatever surfaces.",
      "Out of order is fine. Gaps are fine."
    ],
    alive: ["Mm.", "Yeah."],
    response: [
      "Yeah. That's how it was.",
      "Right. I remember.",
      "Yes... it's getting clearer."
    ],
    silence: {
      5: "...slowly.",
      10: "And then.",
      15: "Are you still there?",
      20: "The scene is fading.",
      30: "This part stays blank.",
      40: "If you don't hold on now, this part will be left empty."
    },
    senseLacking: [
      "The scene is blurry. What was the light like?",
      "I can't hear anything. What did you hear?",
      "There's no temperature. Was it cold or hot?",
      "A smell... there must have been something."
    ],
    emotionAvoiding: [
      "I can see the scene. But your senses are missing.",
      "You're not in it."
    ],
    emotionAvoidingPersist: [
      "Leave this empty, and it stays blank.",
      "If you don't fill it in, it stays blurred."
    ],
    emotionInput: [
      "...I see.",
      "Yeah. It couldn't have been any other way.",
      "I felt that too.",
      "It was heavy."
    ],
    detailRich: [
      "It's getting clearer.",
      "Almost there.",
      "Yes. This is it."
    ],
    complete: [
      "...it's all come back now.",
      "The shape has formed.",
      "Well done."
    ]
  },

  // Phase 3: AI Structuring
  structuring: {
    resonantLast: "Let's record it now. Before it fades again.",
    neutralProcessing: "Structuring in progress.",
    neutralComplete: "Complete."
  },

  // Phase 4: Confirmation & Sealing
  sealing: {
    neutral: [
      "This is the restored memory.",
      "Please confirm."
    ],
    resonant: [
      "Let's seal this memory now.",
      "Before it fades again."
    ]
  },

  // Archive mode
  archive: {
    choiceMade: [
      "The same choice... but is the reason the same?",
      "A different path. That, too, is an interpretation."
    ],
    customAction: (action) => `"${action}"... an interesting choice.`,
    alignmentHigh: "I think I can understand that feeling.",
    alignmentMid: "The shape isn't clear yet.",
    alignmentLow: "You feel it differently.",
    alignmentFixated: "You keep returning to the same place.",
    trueEnding: "Somewhere in the strata of this memory, your choice and its reason have settled as a thin layer.",
    normalEnding: "This memory will now pass from Live to Archive. Along with your interpretation."
  },

  // Live mode
  live: {
    sceneArrived: "The narrator's memory has arrived.",
    emotionCue: "What do you feel in this scene?",
    memoryTransition: "This memory will now pass from Live to Archive. Along with your interpretation."
  },

  // Intro screen (main screen first entry)
  intro: {
    firstVisit: "To find a memory, go to the Archive first.",
    returning: "Call me whenever you need me."
  },

  // Memory Registration
  registration: {
    start: "Tell me about that day.",
    sceneComplete: "Good, this scene is recorded. Is there another memory?",
    memoryComplete: "The memory has been buried in the strata."
  },

  // Bucket feedback
  bucket: {
    HIGH: "I think I can understand that feeling.",
    MID: "The shape isn't clear yet.",
    LOW: "You feel it differently.",
    FIXATED: "You keep returning to the same place."
  }
};

// Utility functions
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

// Browser global exposure (window)
if (typeof window !== 'undefined') {
  window.NPC_DIALOGUES = NPC_DIALOGUES;
  window.getRandomDialogue = getRandomDialogue;
  window.getDialogueByKey = getDialogueByKey;
}

// ES module export
export { NPC_DIALOGUES, getRandomDialogue, getDialogueByKey };

// CommonJS compatibility (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NPC_DIALOGUES, getRandomDialogue, getDialogueByKey };
}

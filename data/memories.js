/**
 * memories.js — Full memory data + simulated plays for strata visualization
 */

// Deterministic PRNG for reproducible simulations
function _m32(s){return function(){s|=0;s=s+0x6D2B79F5|0;var t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// ════════════════════════════════════════════
//  E-001: The Jacket on the Chair (314 layers)
// ════════════════════════════════════════════
const E001_SCENES = [
  {
    id:'s-001-0', scene_order:0,
    text:'My father left his jacket on the kitchen chair the morning he moved out. I kept eating cereal. I didn\'t look up.',
    original_emotion:{sadness:0.72,numbness:0.45,isolation:0.38,guilt:0.2},
    echo_words:['didn\'t look up','it\'s fine','just eat'],
    anchor_emotions:['sadness','numbness','isolation'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-001-0a',text:'I kept eating.',choice_order:0,next_scene_order:1},
      {id:'c-001-0b',text:'I should have looked up.',choice_order:1,next_scene_order:1},
    ]
  },
  {
    id:'s-001-1', scene_order:1,
    text:'For two weeks I didn\'t let anyone touch the chair. The jacket stayed exactly where he left it. It still smelled like him.',
    original_emotion:{longing:0.68,sadness:0.55,isolation:0.42},
    echo_words:['don\'t touch it','still there','smelled like him'],
    anchor_emotions:['longing','sadness','isolation'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-001-1a',text:'I guarded it.',choice_order:0,next_scene_order:2},
      {id:'c-001-1b',text:'I smelled it when no one was looking.',choice_order:1,next_scene_order:2},
    ]
  },
  {
    id:'s-001-2', scene_order:2,
    text:'Three weeks later my mother washed it without asking. I screamed at her for the first time in my life.',
    original_emotion:{anger:0.84,guilt:0.52,longing:0.35,shame:0.19},
    echo_words:['why did you touch it','was his','don\'t'],
    anchor_emotions:['anger','guilt','longing','shame'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-001-2a',text:'I screamed.',choice_order:0,next_scene_order:3},
      {id:'c-001-2b',text:'I said something I can\'t take back.',choice_order:1,next_scene_order:3},
    ]
  },
  {
    id:'s-001-3', scene_order:3,
    text:'That night she left it folded on my bed. I held it and didn\'t sleep.',
    original_emotion:{sadness:0.78,longing:0.65,guilt:0.40},
    echo_words:['folded','held it','no sleep'],
    anchor_emotions:['sadness','longing','guilt'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-001-3a',text:'I held it all night.',choice_order:0,next_scene_order:4},
      {id:'c-001-3b',text:'I cried into it.',choice_order:1,next_scene_order:4},
    ]
  },
  {
    id:'s-001-4', scene_order:4,
    text:'I wore it to school the next day. It was too big. Nobody said anything. I think that was worse.',
    original_emotion:{isolation:0.83,sadness:0.58,numbness:0.35},
    echo_words:['too big','nobody said','worse'],
    anchor_emotions:['isolation','sadness','numbness'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-001-4a',text:'Nobody noticed.',choice_order:0,next_scene_order:null},
      {id:'c-001-4b',text:'Or maybe they just didn\'t know what to say.',choice_order:1,next_scene_order:null},
    ]
  },
];

// ════════════════════════════════════════════
//  E-002: The Voicemail I Kept (70 layers)
// ════════════════════════════════════════════
const E002_SCENES = [
  {
    id:'s-002-0', scene_order:0,
    text:'My grandmother left me a voicemail the Tuesday before she died. "Did you eat? Call me back when you can." I never called back.',
    original_emotion:{guilt:0.82,longing:0.60,sadness:0.55},
    echo_words:['did you eat','call me back','never called'],
    anchor_emotions:['guilt','longing','sadness'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-002-0a',text:'I was busy.',choice_order:0,next_scene_order:1},
      {id:'c-002-0b',text:'I meant to call tomorrow.',choice_order:1,next_scene_order:1},
    ]
  },
  {
    id:'s-002-1', scene_order:1,
    text:'After the hospital called, I played the voicemail seventeen times. Her voice sounded the same as always. That\'s what broke me.',
    original_emotion:{sadness:0.88,longing:0.72,guilt:0.35,fear:0.15},
    echo_words:['seventeen times','same as always','broke me'],
    anchor_emotions:['sadness','longing','guilt'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-002-1a',text:'I kept pressing replay.',choice_order:0,next_scene_order:2},
      {id:'c-002-1b',text:'I couldn\'t stop listening.',choice_order:1,next_scene_order:2},
    ]
  },
  {
    id:'s-002-2', scene_order:2,
    text:'Everyone at the funeral talked about who she was. I sat in the back row holding my phone. The voicemail was 8 seconds long. That\'s all I have.',
    original_emotion:{isolation:0.65,longing:0.70,sadness:0.50,numbness:0.30},
    echo_words:['8 seconds','all I have','back row'],
    anchor_emotions:['isolation','longing','sadness','numbness'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-002-2a',text:'8 seconds.',choice_order:0,next_scene_order:3},
      {id:'c-002-2b',text:'That\'s not enough.',choice_order:1,next_scene_order:3},
    ]
  },
  {
    id:'s-002-3', scene_order:3,
    text:'Three months later I almost deleted it by accident. My hands shook for an hour. I backed it up to three different places.',
    original_emotion:{fear:0.78,guilt:0.45,longing:0.55,sadness:0.30},
    echo_words:['almost deleted','hands shook','three places'],
    anchor_emotions:['fear','guilt','longing'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-002-3a',text:'I can\'t lose this too.',choice_order:0,next_scene_order:4},
      {id:'c-002-3b',text:'What if I forget her voice?',choice_order:1,next_scene_order:4},
    ]
  },
  {
    id:'s-002-4', scene_order:4,
    text:'It\'s been two years. I still play it sometimes. But now her voice sounds like a stranger\'s. I don\'t know if that\'s the recording degrading, or my memory.',
    original_emotion:{longing:0.60,sadness:0.55,numbness:0.48,isolation:0.30,fear:0.25},
    echo_words:['stranger\'s voice','degrading','or my memory'],
    anchor_emotions:['longing','sadness','numbness','fear'],
    void_info:{scene_void:false,emotion_void:false,reason_void:true},
    choices:[
      {id:'c-002-4a',text:'The voice is fading.',choice_order:0,next_scene_order:null},
      {id:'c-002-4b',text:'Or maybe I am.',choice_order:1,next_scene_order:null},
    ]
  },
];

// ════════════════════════════════════════════
//  E-003: What I Said at the Funeral (30 layers)
// ════════════════════════════════════════════
const E003_SCENES = [
  {
    id:'s-003-0', scene_order:0,
    text:'They asked me to speak at Jake\'s funeral because I was his best friend. I said yes before I understood what that meant.',
    original_emotion:{fear:0.65,guilt:0.40,sadness:0.50},
    echo_words:['best friend','said yes','what that meant'],
    anchor_emotions:['fear','guilt','sadness'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-003-0a',text:'I couldn\'t say no.',choice_order:0,next_scene_order:1},
      {id:'c-003-0b',text:'Who else was going to do it?',choice_order:1,next_scene_order:1},
    ]
  },
  {
    id:'s-003-1', scene_order:1,
    text:'I wrote the eulogy the night before. I tried to make it funny because that\'s what Jake would have wanted. I practiced in front of the mirror and laughed at my own jokes.',
    original_emotion:{guilt:0.55,fear:0.50,sadness:0.35,shame:0.20},
    echo_words:['make it funny','would have wanted','laughed alone'],
    anchor_emotions:['guilt','fear','sadness','shame'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-003-1a',text:'He would have laughed.',choice_order:0,next_scene_order:2},
      {id:'c-003-1b',text:'I needed to believe that.',choice_order:1,next_scene_order:2},
    ]
  },
  {
    id:'s-003-2', scene_order:2,
    text:'I got to the part about the road trip. I said "Jake would\'ve hated this speech." Three people laughed. His mother wasn\'t one of them.',
    original_emotion:{shame:0.78,guilt:0.72,sadness:0.50,fear:0.35},
    echo_words:['three people laughed','his mother','hated this speech'],
    anchor_emotions:['shame','guilt','sadness','fear'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-003-2a',text:'I saw her face.',choice_order:0,next_scene_order:3},
      {id:'c-003-2b',text:'I kept going anyway.',choice_order:1,next_scene_order:3},
    ]
  },
  {
    id:'s-003-3', scene_order:3,
    text:'I went off-script. I talked about the last time I saw him. I said "I should have known." The room went silent. I couldn\'t tell if they were moved or horrified.',
    original_emotion:{guilt:0.85,shame:0.60,sadness:0.70,isolation:0.40},
    echo_words:['should have known','off-script','silent room'],
    anchor_emotions:['guilt','shame','sadness','isolation'],
    void_info:{scene_void:false,emotion_void:false,reason_void:false},
    choices:[
      {id:'c-003-3a',text:'The silence swallowed me.',choice_order:0,next_scene_order:4},
      {id:'c-003-3b',text:'I made his death about me.',choice_order:1,next_scene_order:4},
    ]
  },
  {
    id:'s-003-4', scene_order:4,
    text:'His mother found me outside after. She hugged me and said "He loved you." I still don\'t know if she meant it or if she was just that kind.',
    original_emotion:{guilt:0.60,longing:0.55,sadness:0.65,shame:0.30,numbness:0.20},
    echo_words:['he loved you','meant it','that kind'],
    anchor_emotions:['guilt','longing','sadness','shame'],
    void_info:{scene_void:false,emotion_void:false,reason_void:true},
    choices:[
      {id:'c-003-4a',text:'I wanted to believe her.',choice_order:0,next_scene_order:null},
      {id:'c-003-4b',text:'I still can\'t.',choice_order:1,next_scene_order:null},
    ]
  },
];

// ════════════════════════════════════════════
//  Simulated Plays Generator
// ════════════════════════════════════════════

const PERSONA_ARCHETYPES = [
  {name:'empathizer',   bias:{sadness:0.3,longing:0.2},         attr:'situation'},
  {name:'projector',    bias:{guilt:0.3,sadness:0.2,fear:0.1},  attr:'self'},
  {name:'rationalizer', bias:{numbness:0.3,isolation:0.1},      attr:'situation'},
  {name:'avoider',      bias:{numbness:0.5,isolation:0.2},      attr:null,        isVoid:true},
  {name:'anger-carrier',bias:{anger:0.4,guilt:0.1},             attr:'other'},
  {name:'guilt-carrier',bias:{guilt:0.5,shame:0.2},             attr:'self'},
  {name:'nostalgic',    bias:{longing:0.5,sadness:0.2},         attr:'situation'},
  {name:'fearful',      bias:{fear:0.4,sadness:0.2,numbness:0.1},attr:'self'},
  {name:'shamed',       bias:{shame:0.4,guilt:0.3},             attr:'self'},
  {name:'dissociator',  bias:{numbness:0.6},                    attr:null,        isVoid:true},
  {name:'comforter',    bias:{sadness:0.2,longing:0.1,hope:0.1},attr:'situation'},
  {name:'identifier',   bias:{sadness:0.4,guilt:0.3,longing:0.2},attr:'self'},
];

function generatePlays(scenes, count, seed) {
  var rng = _m32(seed);
  var plays = [];
  var emotions = ['fear','sadness','anger','guilt','shame','longing','numbness','isolation','moral_pain','hope','relief','joy'];

  for (var i = 0; i < count; i++) {
    var persona = PERSONA_ARCHETYPES[Math.floor(rng() * PERSONA_ARCHETYPES.length)];
    var scene = scenes[Math.floor(rng() * scenes.length)];
    var origEm = scene.original_emotion || {};

    var userEmo = {};
    for (var j = 0; j < emotions.length; j++) {
      var e = emotions[j];
      var orig = origEm[e] || 0;
      var personaBias = (persona.bias && persona.bias[e]) || 0;
      var noise = (rng() - 0.5) * 0.3;
      var val = orig * (0.3 + rng() * 0.7) + personaBias + noise;
      val = Math.max(0, Math.min(1, val));
      if (val > 0.05) userEmo[e] = parseFloat(val.toFixed(3));
    }

    var dot = 0, m1 = 0, m2 = 0;
    for (var k in origEm) {
      var a = userEmo[k] || 0, b = origEm[k] || 0;
      dot += a * b; m1 += a * a; m2 += b * b;
    }
    m1 = Math.sqrt(m1); m2 = Math.sqrt(m2);
    var emotionSim = (m1 > 0 && m2 > 0) ? Math.max(0, dot / (m1 * m2)) : 0;
    var reasonSim = persona.attr ? (rng() > 0.5 ? 0.6 : 0.2) : emotionSim * 0.3;
    var attSim = persona.isVoid ? 0.2 : 0.5 + rng() * 0.3;
    var alignment = parseFloat((emotionSim * 0.4 + reasonSim * 0.4 + attSim * 0.2).toFixed(3));

    var mismatch = null;
    if (emotionSim < 0.4) mismatch = 'emotion_mismatch';
    else if (persona.attr === 'other' && rng() > 0.5) mismatch = 'attribution_mismatch';
    else if (persona.isVoid && rng() > 0.4) mismatch = 'void_mismatch';

    var daysAgo = Math.floor(rng() * 365);
    var ts = new Date(Date.now() - daysAgo * 86400000).toISOString();

    plays.push({
      scene_id: scene.id,
      user_emotion: userEmo,
      alignment: alignment,
      mismatch_type: mismatch,
      created_at: ts,
    });
  }

  plays.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  return plays;
}

// ════════════════════════════════════════════
//  Assemble memoriesData
// ════════════════════════════════════════════

const MEM_ID_001 = '8fe034ef-6db0-4ba1-b291-66954fea2e08';
const MEM_ID_002 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const MEM_ID_003 = 'f9e8d7c6-b5a4-3210-fedc-ba9876543210';

const memoriesData = [
  {
    id: MEM_ID_001,
    code: 'E-001',
    title: 'The Jacket on the Chair',
    memory_words: ['jacket','chair','morning','cereal','father'],
    completed_sentence: 'The jacket on the chair was the last thing he left behind.',
    layers: 314,
    dilution: 50,
    recentRank: 3,
    category: 'archive',
    scenes: E001_SCENES,
    live_session_id: null,
    is_live: false,
  },
  {
    id: MEM_ID_002,
    code: 'E-002',
    title: 'The Voicemail I Kept',
    memory_words: ['voicemail','grandmother','8 seconds','call back','voice'],
    completed_sentence: 'Her voice on the voicemail is all I have left.',
    layers: 70,
    dilution: 42,
    recentRank: 1,
    category: 'archive',
    scenes: E002_SCENES,
    live_session_id: null,
    is_live: false,
  },
  {
    id: MEM_ID_003,
    code: 'E-003',
    title: 'What I Said at the Funeral',
    memory_words: ['funeral','eulogy','laughed','silent','mother'],
    completed_sentence: 'I tried to make his funeral funny. His mother didn\'t laugh.',
    layers: 30,
    dilution: 65,
    recentRank: 2,
    category: 'archive',
    scenes: E003_SCENES,
    live_session_id: null,
    is_live: false,
  },
];

// Expose for index.js (module) and loadMemoriesFromSupabase fallback
window.memoriesData = memoriesData;

// Generate and attach simulated plays
window._simulatedPlaysMap = {};
window._simulatedPlaysMap[MEM_ID_001] = generatePlays(E001_SCENES, 314, 42001);
window._simulatedPlaysMap[MEM_ID_002] = generatePlays(E002_SCENES, 70,  42002);
window._simulatedPlaysMap[MEM_ID_003] = generatePlays(E003_SCENES, 30,  42003);

// Also attach simulated scenes for strata view fallback
window._simulatedScenesMap = {};
window._simulatedScenesMap[MEM_ID_001] = E001_SCENES;
window._simulatedScenesMap[MEM_ID_002] = E002_SCENES;
window._simulatedScenesMap[MEM_ID_003] = E003_SCENES;

const MemoryUtils = {
  findById(id) { return memoriesData.find(m => m.id === id) || null; },
  findByCode(code) { return memoriesData.find(m => m.code === code) || null; },
  sortByPopular(memories = memoriesData) { return [...memories].sort((a,b) => b.layers - a.layers); },
  sortByRecent(memories = memoriesData) { return [...memories].sort((a,b) => a.recentRank - b.recentRank); },
  search(query) {
    const q = query.toUpperCase().trim();
    if (!q) return memoriesData;
    return memoriesData.filter(m => m.code.includes(q) || m.title.toUpperCase().includes(q));
  },
  getAll() { return memoriesData; },
};

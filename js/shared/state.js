// /js/shared/state.js
// global state manage

// global state object
export const AppState = {
 // Supabase client
  supabaseClient: null,
  
 // 스토리 data
  storyData: null,
  
 // auth
  isLoggedIn: false,
  currentUser: null,
  
 // 현재 mode
  currentMode: null,  // 'archive', 'beginner', 'ritual', 'live'
  currentRole: null,  // 'A' (화자), 'B' (체험자)
  
 // session
  sessionCode: null,
  currentSessionId: null,
  
 // memory/scene
  allMemoriesData: [],
  currentMemory: null,
  currentScene: 0,
  currentSceneOrder: 1,
  
 // user input
  userChoices: [],
  userReasons: [],
  
 // alignment
  currentAlignment: 0,
  currentBucket: null,
  emotionHistory: [],
  
 // Live mode
  liveSceneNum: 1,
  liveFragments: 0,
  liveMatches: 0,
  
 // 애니메 션
  waveAnimationId: null,
  liveWaveAnimationId: null,
  
 // filter/정렬
  currentSort: 'all',
  currentCategory: 'all'
};

// state init
export function resetState() {
  AppState.currentMode = null;
  AppState.currentRole = null;
  AppState.sessionCode = null;
  AppState.currentSessionId = null;
  AppState.currentMemory = null;
  AppState.currentScene = 0;
  AppState.currentSceneOrder = 1;
  AppState.userChoices = [];
  AppState.userReasons = [];
  AppState.currentAlignment = 0;
  AppState.currentBucket = null;
  AppState.emotionHistory = [];
  AppState.liveSceneNum = 1;
  AppState.liveFragments = 0;
  AppState.liveMatches = 0;
  AppState.waveAnimationId = null;
  AppState.liveWaveAnimationId = null;
}

// state 업데 트 ( 깅 )
export function updateState(key, value) {
  if (key in AppState) {
    AppState[key] = value;
    console.log(`[State] ${key}:`, value);
  } else {
    console.warn(`[State] Unknown key: ${key}`);
  }
}

// 여러 state 번 업데 트
export function updateStates(updates) {
  Object.keys(updates).forEach(key => {
    updateState(key, updates[key]);
  });
}




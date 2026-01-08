// /js/shared/state.js
// 전역 상태 관리

// 전역 상태 객체
export const AppState = {
  // Supabase 클라이언트
  supabaseClient: null,
  
  // 스토리 데이터
  storyData: null,
  
  // 인증
  isLoggedIn: false,
  currentUser: null,
  
  // 현재 모드
  currentMode: null,  // 'archive', 'beginner', 'ritual', 'live'
  currentRole: null,  // 'A' (화자), 'B' (체험자)
  
  // 세션
  sessionCode: null,
  currentSessionId: null,
  
  // 기억/장면
  allMemoriesData: [],
  currentMemory: null,
  currentScene: 0,
  currentSceneOrder: 1,
  
  // 사용자 입력
  userChoices: [],
  userReasons: [],
  
  // 정렬도
  currentAlignment: 0,
  currentBucket: null,
  emotionHistory: [],
  
  // Live 모드
  liveSceneNum: 1,
  liveFragments: 0,
  liveMatches: 0,
  
  // 애니메이션
  waveAnimationId: null,
  liveWaveAnimationId: null,
  
  // 필터/정렬
  currentSort: 'all',
  currentCategory: 'all'
};

// 상태 초기화
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

// 상태 업데이트 (로깅 포함)
export function updateState(key, value) {
  if (key in AppState) {
    AppState[key] = value;
    console.log(`[State] ${key}:`, value);
  } else {
    console.warn(`[State] Unknown key: ${key}`);
  }
}

// 여러 상태 한번에 업데이트
export function updateStates(updates) {
  Object.keys(updates).forEach(key => {
    updateState(key, updates[key]);
  });
}


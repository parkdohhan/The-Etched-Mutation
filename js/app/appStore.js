import { createStore } from '../core/store.js';

export const appStore = createStore({
    // Mode/Session
    currentMode: null,
    currentRole: null,
    sessionCode: null,
    currentSessionId: null,

    // Memory/Scene
    allMemoriesData: [],
    currentMemory: null,
    currentScene: 0,
    currentSceneOrder: 1,

    // Archive demo flow tracking
    visitedScenes: [],
    fixationCounts: {},
    totalScenesPlayed: 0,
    contaminationLevel: 0,
    lastTransitionPattern: null,

    // User input
    userChoices: [],
    userReasons: [],

    // Alignment/Bucket
    currentAlignment: 0,
    currentBucket: null,
    emotionHistory: [],
    userEmotionTrajectory: [],
    originalEmotionTrajectory: [],
    sceneScores: [],

    // Live mode
    liveSceneNum: 1,
    liveFragments: 0,
    liveMatches: 0,

    // Animation ID
    waveAnimationId: null,
    liveWaveAnimationId: null,

    // Authentication
    isLoggedIn: false,
    currentUser: null,

    // Filter/Sort
    currentSort: 'all',
    currentCategory: 'all',

    // Intermediate state
    pendingSceneText: '',
    expPendingEmotion: '',

    // Current story data (set when memory is loaded)
    currentStoryData: null,

    // Last ByeoriEngine output (set in applyEngineResult, used by SceneNavigator + ContaminationTracker)
    lastEngineResult: null
});

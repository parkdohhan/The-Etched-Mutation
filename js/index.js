import { getSupabaseClient, onAuthStateChange, getSession, getAccessToken } from './lib/supabaseClient.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_FUNCTION_URL } from './lib/config.js';
import { detectCrisis, getRandomDialogue, CRISIS_DIALOGUES, SAFETY_RESOURCES } from './safety.js';
import { NPC_DIALOGUES } from './npc-dialogues.js';

// Shared modules
import { fetchMemories, fetchScenes, savePlay, saveNote, fetchNotes, activateMemoryIfFetus } from './shared/api.js';
import { playSound, stopSound, setVolume, SOUNDS } from './shared/audio.js';
import { cosineSimilarity, normalizeVector, addVectors, getBucket, checkFixated, getDominantEmotion, normalizeAnchor, projectEmotionToVAD, emotionVectorToWaveStyle } from './shared/math.js';
import { AppState, resetState, updateState, updateStates } from './shared/state.js';
import { ByeoriEngine, byeoriEngine } from './core/ByeoriEngine.js';
// Expose to window for expInterview.js access
window.byeoriEngine = byeoriEngine;
import { createStore } from './core/store.js';
import { networkService } from './services/NetworkService.js';
import { realtimeService } from './services/RealtimeService.js';
import { AIService } from './services/AIService.js';
import { MemoryService } from './services/MemoryService.js';
import { uiManager } from './ui/UIManager.js';
import { visualizer } from './ui/Visualizer.js';
import { bindEvents } from './app/bindEvents.js';
import {
    selectRole, generateSessionCode, copySessionCode, joinSession,
    createLiveSession, subscribeToSessionJoin, checkExperiencerJoin,
    subscribeToLiveScenes, subscribeToLiveInterpretations,
    subscribeToExperiencerChoices, subscribeToScenes, subscribeToNarratorEmotion,
    displayExperiencerEmotionForNarrator, onExperiencerChoiceReceived,
    checkAlignment, updateAlignmentWave, updateExperiencerAlignment,
    saveLiveScene, saveSceneToLiveSession,
    endLiveSession, stopAllLiveSubscriptions, exitLive,
    // Phase 2
    startLiveSession, sendNarratorInput, handleUnifiedSubmit,
    generateSceneAI, analyzeEmotionWithVector,
    sendChatMessage, sendChatMessageWithDeps,
    sendExpChatMessage, sendExpChatMessageWithDeps,
    addChatMessage, addChatMessageWithConfirm, removeConfirmButtons,
    addExpChatMessage, addExpChatMessageWithConfirm, removeExpConfirmButtons,
    switchGeneratedTab, switchExpGeneratedTab,
    extractGeneratedText, parseEmotionInput, formatEmotionVector,
    parseEmotionAnalysisResult, parseSceneGenerationResult,
    handleConfirm, handleExpConfirm,
    simulateNarratorInput, renderLiveEchoLayer, makeLiveChoice,
    submitExperiencerFeeling, submitScene,
    updateLiveAlignment, updateNarratorWave, renderExperiencerWave,
    computeArchiveWaveData, updateExperiencerStatus,
    toggleEditMode, saveEditedScene,
    startVoiceMode, switchToTextMode, switchToTextInput, switchToVoiceInput,
    switchExpToTextInput, switchExpToVoiceInput,
    toggleRecording, toggleExpRecording,
    startLiveVoiceInput, stopLiveVoiceInput,
    startVoiceWaveLiveAnimation, stopVoiceWaveLiveAnimation,
    resetLiveState,
} from './app/live.js';
import {
    fadeInSound, fadeOutSound, setupLoopWithCrossfade,
    startOpeningSequence, startOpeningWaveAnimation,
    skipToIntro, handleOpeningKeydown, playNpcIntro,
} from './app/opening.js';

console.log('=== Shared Modules Loaded ===');
console.log('API:', typeof fetchMemories);
console.log('Audio:', typeof playSound);
console.log('Math:', typeof cosineSimilarity);
console.log('State:', AppState);

// Expose global functions for opening and event binding (must be guaranteed before initApp)
window.startOpeningWaveAnimation = startOpeningWaveAnimation;
window.startOpeningSequence = startOpeningSequence;
window.handleOpeningKeydown = handleOpeningKeydown;
window.skipToIntro = skipToIntro;
window.setupLoopWithCrossfade = setupLoopWithCrossfade;
window.fadeInSound = fadeInSound;
window.startMemoryRegistration = startMemoryRegistration;

// Emotion anchor system moved to /js/shared/math.js

// Store initialization (global variables moved to store)
let supabaseClient; // Supabase client kept outside store (managed by lib)
let storyData; // storyData kept outside store (temporary)

const appStore = createStore({
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
    fixationCounts: {},    // sceneIndex -> visits beyond first
    totalScenesPlayed: 0,  // number of scene transitions executed
    contaminationLevel: 0, // local running total based on alignment
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
    expPendingEmotion: ''
});
// Expose to window for expInterview.js access
window.appStore = appStore;

// AppState and store sync helper (backward compatibility)
function syncToAppState() {
    const state = appStore.getState();
    AppState.supabaseClient = supabaseClient;
    AppState.storyData = storyData;
    AppState.allMemoriesData = state.allMemoriesData;
    AppState.currentMode = state.currentMode;
    AppState.currentRole = state.currentRole;
    AppState.sessionCode = state.sessionCode;
    AppState.currentMemory = state.currentMemory;
    AppState.currentScene = state.currentScene;
    AppState.currentSceneOrder = state.currentSceneOrder;
    AppState.userChoices = state.userChoices;
    AppState.userReasons = state.userReasons;
    AppState.currentAlignment = state.currentAlignment;
    AppState.waveAnimationId = state.waveAnimationId;
    AppState.liveWaveAnimationId = state.liveWaveAnimationId;
    AppState.liveSceneNum = state.liveSceneNum;
    AppState.liveFragments = state.liveFragments;
    AppState.liveMatches = state.liveMatches;
    AppState.isLoggedIn = state.isLoggedIn;
    AppState.currentUser = state.currentUser;
    AppState.currentSessionId = state.currentSessionId;
    AppState.currentSort = state.currentSort;
    AppState.currentCategory = state.currentCategory;
    AppState.currentBucket = state.currentBucket;
    AppState.emotionHistory = state.emotionHistory;
    AppState.userEmotionTrajectory = state.userEmotionTrajectory;
    AppState.originalEmotionTrajectory = state.originalEmotionTrajectory;
    AppState.sceneScores = state.sceneScores;
    AppState.visitedScenes = state.visitedScenes;
    AppState.fixationCounts = state.fixationCounts;
    AppState.totalScenesPlayed = state.totalScenesPlayed;
    AppState.contaminationLevel = state.contaminationLevel;
    AppState.lastTransitionPattern = state.lastTransitionPattern;
}
const USE_LIVE_INTERPRETATIONS_TABLE = false;

// Initialize on DOMContentLoaded
// (Moved to bottom)

async function initApp() {
    var fromDemo = false;
    var demoMemoryId = null;
    try {
        if (sessionStorage.getItem('skipOpening')) { sessionStorage.removeItem('skipOpening'); fromDemo = true; }
        if (sessionStorage.getItem('demoMemoryId')) { demoMemoryId = sessionStorage.getItem('demoMemoryId'); sessionStorage.removeItem('demoMemoryId'); fromDemo = true; }
    } catch (_) {}
    var urlParams = new URLSearchParams(window.location.search || '');
    if (urlParams.get('strata') === '1' && urlParams.get('memory')) {
        const strataMemoryId = urlParams.get('memory');
        let playTraces = [];
        try {
            const raw = localStorage.getItem('tem_play_traces');
            if (raw) playTraces = JSON.parse(raw);
        } catch (_e) {}
        const avgAlignment = playTraces.length > 0
            ? playTraces.reduce((s, t) => s + (t.alignment || 0), 0) / playTraces.length
            : 0.5;
        const alignmentResult = {
            alignment_score: avgAlignment,
            alignment_bucket: avgAlignment >= 0.55 ? 'HIGH' : avgAlignment < 0.35 ? 'LOW' : 'MID',
        };
        function _hideAllUI() {
            ['openingScreen', 'introScreen', 'archiveContainer', 'modeSelection', 'endScreen', 'liveContainer', 'sceneViewer'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) { el.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important'; }
            });
        }
        function _waitForStrata() {
            if (typeof window.showStrataView === 'function') {
                _hideAllUI();
                window.showStrataView(strataMemoryId, alignmentResult, function() {
                    try {
                        localStorage.removeItem('tem_play_traces');
                        localStorage.removeItem('tem_play_memory_id');
                        localStorage.removeItem('tem_play_memory_title');
                        sessionStorage.setItem('skipOpening', '1');
                    } catch (_e) {}
                    window.location.href = '/index.html';
                });
            } else {
                setTimeout(_waitForStrata, 200);
            }
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _waitForStrata);
        } else {
            _waitForStrata();
        }
        return;
    }
    if (urlParams.get('demo') === '1' && urlParams.get('memory')) {
        demoMemoryId = urlParams.get('memory');
        fromDemo = true;
        if (window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }

    // memoriesData may not exist (e.g. test environment)
    const memoriesDataArray = window.memoriesData || (typeof memoriesData !== 'undefined' ? memoriesData : []) || [];
    storyData = memoriesDataArray[0] || null;
    window.currentStoryData = storyData;
    appStore.setState({ allMemoriesData: [...memoriesDataArray.map(m => ({ ...m, live_session_id: null, is_live: false }))] });
    if (document.getElementById('memoryList')) {
        const state = appStore.getState();
        uiManager.renderMemoryCards(
            state.allMemoriesData,
            state.currentCategory,
            state.currentSort,
            selectMemory,
            filterMemories
        );
    }

    // Detect OAuth redirect (just before registering onAuthStateChange)
    (function checkOAuthRedirect() {
        const hash = window.location.hash || '';
        const params = new URLSearchParams(window.location.search || '');

        // Supabase OAuth: hash contains access_token/refresh_token, or search contains code
        if (hash.includes('access_token') || hash.includes('refresh_token') || params.has('code')) {
            const openingScreen = document.getElementById('openingScreen');
            if (openingScreen) {
                openingScreen.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important';
                openingScreen.classList.add('hidden');
            }

            const introScreen = document.getElementById('introScreen');
            if (introScreen) {
                introScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2000 !important';
                introScreen.classList.add('visible');
                introScreen.classList.remove('hidden');
            }

            // Auto-skip opening sequence (referenced in startOpeningSequence)
            window.__oauthRedirectSkipOpening = true;
            // 세션 확정 후 마이페이지로 이동 (이메일 로그인과 동일한 UX)
            window.__oauthPendingMypage = true;

            // DO NOT clear URL here — Supabase needs the tokens in the hash/query
            // to establish the session. URL will be cleaned after session is confirmed.
            window.__oauthNeedUrlCleanup = true;

            console.log('[Auth] OAuth redirect detected — skipping opening');
        }
    })();

    // Register auth state change listener
    onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            if (session?.user) {
                const user = session.user;
                appStore.setState({
                    isLoggedIn: true,
                    currentUser: {
                        id: user.id,
                        username: user.user_metadata?.username || user.email?.split('@')[0] || 'Anonymous',
                        email: user.email,
                        joinDate: new Date(user.created_at).toLocaleDateString('en-US'),
                        liveSessions: 0,
                        memories: 0,
                        interpretations: 0,
                        visitedMemories: [],
                        sessionHistory: []
                    }
                });
                syncToAppState();
                console.log('[Auth] User state restored:', user.email);

                // Now that Supabase has processed the tokens, clean the URL
                if (window.__oauthNeedUrlCleanup) {
                    window.__oauthNeedUrlCleanup = false;
                    if (window.history && window.history.replaceState) {
                        window.history.replaceState(null, '', window.location.pathname);
                    }
                    console.log('[Auth] OAuth URL cleaned after session confirmed');
                }
                tryOAuthPostLoginNavigation();
            }
        } else if (event === 'SIGNED_OUT') {
            appStore.setState({ isLoggedIn: false, currentUser: null });
            syncToAppState();
            console.log('[Auth] Signed out');
        }
    });

    // Restore existing session (on page refresh)
    try {
        const { data: { session }, error } = await getSession();
        if (session?.user && !error) {
            const user = session.user;
            appStore.setState({
                isLoggedIn: true,
                currentUser: {
                    id: user.id,
                    username: user.user_metadata?.username || user.email?.split('@')[0] || 'Anonymous',
                    email: user.email,
                    joinDate: new Date(user.created_at).toLocaleDateString('en-US'),
                    liveSessions: 0,
                    memories: 0,
                    interpretations: 0,
                    visitedMemories: [],
                    sessionHistory: []
                }
            });
            syncToAppState();
            console.log('[Auth] Existing session restored:', user.email);
            tryOAuthPostLoginNavigation();
        }
    } catch (e) {
        console.warn('[Auth] Session restore failed (ignorable):', e.message);
    }

    // 3D Carousel initialization
    setTimeout(() => {
        init3DCarousel();
    }, 100);

    // All event bindings
    bindEvents({
        store: appStore,
        engine: byeoriEngine,
        ui: uiManager,
        visualizer: visualizer,
        network: networkService,
        realtime: realtimeService,
        flow: null, // TODO: FlowController implementation needed
        memory: MemoryService,
        ai: AIService
    });
    if (fromDemo) {
        openingSkipped = true;
        if (openingWaveAnimationId) { cancelAnimationFrame(openingWaveAnimationId); openingWaveAnimationId = null; }
        var op = document.getElementById('openingScreen');
        var intro = document.getElementById('introScreen');
        if (op) { op.removeEventListener('click', skipOpening); op.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important'; op.classList.add('hidden'); }
        document.removeEventListener('keydown', handleOpeningKeydown);
        if (demoMemoryId) {
            if (intro) { intro.classList.add('hidden'); intro.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important'; }
            enterArchive({ fromDemo: true }).then(function() {
                var archiveContainer = document.getElementById('archiveContainer');
                if (archiveContainer) { archiveContainer.style.visibility = ''; archiveContainer.style.opacity = ''; }
            });
        } else {
            if (intro) { intro.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2000 !important'; intro.classList.add('visible'); intro.classList.remove('hidden'); }
            if (typeof playNpcIntro === 'function') playNpcIntro();
        }
    }
}
const PORTFOLIO_BASE_URL = 'https://www.parkdohhan.com';

function openPortfolio() {
    const portfolioWindow = window.open(PORTFOLIO_BASE_URL, '_blank');
    if (portfolioWindow) {
        setTimeout(() => {
            try {
                if (portfolioWindow.closed) return;
                fetch(PORTFOLIO_BASE_URL).catch(() => {
                    alert('Portfolio server is not running.\n\nPlease run this in the terminal:\n\ncd portfolio-site\nnpm run dev\n\nOr run start-portfolio-server.sh');
                });
            } catch (e) {}
        }, 2000);
    }
}

function openAbout() {
    window.open(PORTFOLIO_BASE_URL + '/about', '_blank');
}

function openConcept() {
    window.open(PORTFOLIO_BASE_URL + '/concept', '_blank');
}
function openMypage() { const state = appStore.getState(); if (!state.isLoggedIn) { const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.add('active'); loginModal.style.cssText = 'display:flex !important;z-index:2100 !important' } document.getElementById('loginUsername').focus() } else { showMypage() } }
async function showMypage() {
    const state = appStore.getState();
    if (!state.isLoggedIn) return;
    if (pendingSaveAction === 'save') return;

    uiManager.showMypage(state.currentUser);
    await loadMypageDataFromDB();
}
function closeMypage() {
    uiManager.closeMypage();
}

/** Google OAuth 리다이렉트 복귀 후 한 번만: 모달 닫고 마이페이지로 (이메일 로그인과 동일) */
function tryOAuthPostLoginNavigation() {
    if (!window.__oauthPendingMypage) return;
    const state = appStore.getState();
    if (!state.isLoggedIn || !state.currentUser) return;
    window.__oauthPendingMypage = false;
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.classList.remove('active');
        loginModal.style.display = 'none';
    }
    const signupModal = document.getElementById('signupModal');
    if (signupModal) {
        signupModal.classList.remove('active');
        signupModal.style.display = 'none';
    }
    showNotification('Signed in successfully');
    if (pendingSaveAction === 'save') {
        pendingSaveAction = null;
        setTimeout(() => { saveMemory(); }, 300);
    } else {
        showMypage();
    }
}
async function handleLogin() { const email = document.getElementById('loginUsername').value.trim(); const password = document.getElementById('loginPassword').value.trim(); if (!email || !password) { showNotification('Please enter email and password'); return } supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password }); if (error) { showNotification('Sign in failed: ' + error.message); return } appStore.setState({ isLoggedIn: true, currentUser: { id: data.user.id, username: data.user.user_metadata?.username || email.split('@')[0], email: email, joinDate: new Date(data.user.created_at).toLocaleDateString('en-US'), liveSessions: 0, memories: 0, interpretations: 0, visitedMemories: [], sessionHistory: [] } }); const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = ''; showNotification('Signed in successfully'); if (pendingSaveAction === 'save') { pendingSaveAction = null; setTimeout(() => { saveMemory() }, 300) } else { showMypage() } }
function closeLogin() { const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = ''; pendingSaveAction = null }
function switchToSignup() { const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.add('active'); signupModal.style.cssText = 'display:flex !important;z-index:2100 !important' } document.getElementById('signupUsername').focus() }
function switchToLogin() { const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.add('active'); loginModal.style.cssText = 'display:flex !important;z-index:2100 !important' } document.getElementById('loginUsername').focus() }
async function handleSignup() { const username = document.getElementById('signupUsername').value.trim(); const email = document.getElementById('signupEmail').value.trim(); const password = document.getElementById('signupPassword').value.trim(); const passwordConfirm = document.getElementById('signupPasswordConfirm').value.trim(); if (!username || !email || !password || !passwordConfirm) { showNotification('Please fill in all fields'); return } if (password !== passwordConfirm) { showNotification('Passwords do not match'); return } if (password.length < 6) { showNotification('Password must be at least 6 characters'); return } supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } const { data, error } = await supabaseClient.auth.signUp({ email: email, password: password, options: { data: { username: username } } }); if (error) { showNotification('Sign up failed: ' + error.message); return } appStore.setState({ isLoggedIn: true, currentUser: { id: data.user.id, username: username, email: email, joinDate: new Date().toLocaleDateString('en-US'), liveSessions: 0, memories: 0, interpretations: 0, visitedMemories: [], sessionHistory: [] } }); const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } document.getElementById('signupUsername').value = ''; document.getElementById('signupEmail').value = ''; document.getElementById('signupPassword').value = ''; document.getElementById('signupPasswordConfirm').value = ''; showNotification('Sign up complete'); if (pendingSaveAction === 'save') { pendingSaveAction = null; setTimeout(() => { saveMemory() }, 300) } else { showMypage() } }
function closeSignup() { const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } document.getElementById('signupUsername').value = ''; document.getElementById('signupEmail').value = ''; document.getElementById('signupPassword').value = ''; document.getElementById('signupPasswordConfirm').value = '' }
async function handleSocialLogin(provider) { if (provider === 'google') { supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } const redirectTo = `${window.location.origin}${window.location.pathname || '/'}`; const { data, error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } }); if (error) { showNotification('Google sign in failed: ' + error.message) } } else { showNotification('Coming soon') } }
async function handleLogout() { if (confirm('Are you sure you want to sign out?')) { supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } await supabaseClient.auth.signOut(); appStore.setState({ isLoggedIn: false, currentUser: null }); closeMypage(); showNotification('Signed out successfully') } }
function updateUserStats(type, value = 1) { const state = appStore.getState(); if (!state.isLoggedIn || !state.currentUser) return; const currentUser = state.currentUser; if (type === 'liveSession') { currentUser.liveSessions = (currentUser.liveSessions || 0) + value } else if (type === 'memory') { if (!currentUser.visitedMemories) currentUser.visitedMemories = []; if (!currentUser.visitedMemories.includes(value)) { currentUser.visitedMemories.push(value); currentUser.memories = (currentUser.memories || 0) + 1 } } else if (type === 'interpretation') { currentUser.interpretations = (currentUser.interpretations || 0) + value } appStore.setState({ currentUser: currentUser }); if (document.getElementById('mypageScreen') && document.getElementById('mypageScreen').classList.contains('active')) { showMypage() } }
function showModeSelection() { const introScreen = document.getElementById('introScreen'); const matchingSelection = document.getElementById('matchingSelection'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } if (matchingSelection) { matchingSelection.classList.add('active'); matchingSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
function selectMatching(type) { if (type === 'session') { const matchingSelection = document.getElementById('matchingSelection'); const modeSelection = document.getElementById('modeSelection'); if (matchingSelection) { matchingSelection.classList.remove('active'); matchingSelection.style.display = 'none' } if (modeSelection) { modeSelection.classList.add('active'); modeSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } } else { showNotification('Coming soon') } }
function backToMatchingSelection() { const matchingSelection = document.getElementById('matchingSelection'); const modeSelection = document.getElementById('modeSelection'); if (modeSelection) { modeSelection.classList.remove('active'); modeSelection.style.display = 'none' } if (matchingSelection) { matchingSelection.classList.add('active'); matchingSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
function backToIntro() { if (window.soundscape) window.soundscape.stop(); const introScreen = document.getElementById('introScreen'); if (introScreen) { introScreen.classList.remove('hidden'); introScreen.classList.add('visible'); introScreen.style.cssText = 'display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important' } ['matchingSelection', 'modeSelection', 'sessionSetup', 'liveContainer', 'archiveContainer', 'endScreen', 'mypageScreen', 'loginModal', 'signupModal'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); const footer = document.querySelector('.footer'); if (footer) footer.classList.remove('visible'); stopAllAnimations() }
function backToModeSelection() { const sessionSetupEl = document.getElementById('sessionSetup'); if (sessionSetupEl) { sessionSetupEl.classList.remove('active'); sessionSetupEl.style.display = 'none' } const modeSelectionEl = document.getElementById('modeSelection'); if (modeSelectionEl) { modeSelectionEl.classList.add('active'); modeSelectionEl.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
async function enterPlayIntro(opts) { var fromDemo = opts && opts.fromDemo; const introScreen = document.getElementById('introScreen'); const archiveContainer = document.getElementById('archiveContainer'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } ['modeSelection', 'endScreen', 'liveContainer', 'sceneViewer'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); if (archiveContainer) { archiveContainer.classList.add('active'); archiveContainer.style.cssText = 'display:block !important;z-index:1900 !important' + (fromDemo ? ';visibility:hidden;opacity:0' : ''); }
  const entryEl = document.getElementById('archiveEntryContainer');
  const memoryListEl = document.getElementById('memoryList');
  const archiveControlsEl = document.getElementById('archiveControls');
  const archiveHeaderEl = document.querySelector('.archive-header');
  if (entryEl) entryEl.style.display = 'block';
  if (memoryListEl) memoryListEl.style.display = 'none';
  if (archiveControlsEl) archiveControlsEl.style.display = 'none';
  if (archiveHeaderEl) archiveHeaderEl.style.display = 'none';
  appStore.setState({ currentMode: 'play' });
  stopAllAnimations();
  try {
    const mod = await import('./app/archiveEntry.js');
    if (mod && mod.initArchiveEntry) await mod.initArchiveEntry(entryEl);
  } catch (e) {
    console.error('[enterPlayIntro] archiveEntry init failed:', e);
  }
  const footer = document.querySelector('.footer');
  if (footer) footer.classList.add('visible') }
async function enterArchive(opts) { var fromDemo = opts && opts.fromDemo; const introScreen = document.getElementById('introScreen'); const archiveContainer = document.getElementById('archiveContainer'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } ['modeSelection', 'endScreen', 'liveContainer', 'sceneViewer'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); if (archiveContainer) { archiveContainer.classList.add('active'); archiveContainer.style.cssText = 'display:block !important;z-index:1900 !important' + (fromDemo ? ';visibility:hidden;opacity:0' : ''); }
  const entryEl = document.getElementById('archiveEntryContainer');
  const memoryListEl = document.getElementById('memoryList');
  const archiveControlsEl = document.getElementById('archiveControls');
  const archiveHeaderEl = document.querySelector('.archive-header');
  if (entryEl) entryEl.style.display = 'none';
  if (memoryListEl) memoryListEl.style.display = 'grid';
  if (archiveControlsEl) archiveControlsEl.style.display = 'block';
  if (archiveHeaderEl) archiveHeaderEl.style.display = 'block';
  try {
    await loadMemoriesFromSupabase();
    sortMemories('all');
  } catch (e) {
    console.warn('[enterArchive] loadMemoriesFromSupabase failed:', e);
  }
  appStore.setState({ currentMode: 'archive' });
  stopAllAnimations();
  const footer = document.querySelector('.footer');
  if (footer) footer.classList.add('visible') }
function filterByCategory(category, btnElement) {
    if (!category) return;
    const state = appStore.getState();
    appStore.setState({ currentCategory: category });
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    const updatedState = appStore.getState();
    uiManager.renderMemoryCards(
        updatedState.allMemoriesData,
        updatedState.currentCategory,
        updatedState.currentSort,
        selectMemory,
        filterMemories
    );
}
async function loadMemoriesFromSupabase() {
  const localFallback = (window.memoriesData || (typeof memoriesData !== 'undefined' ? memoriesData : []) || []).map(m => ({ ...m, live_session_id: null, is_live: false }));
  const LOCAL_CODES = ['E-001', 'E-002', 'E-003'];
  try {
    console.log('[loadMemoriesFromSupabase] Starting to load memories from Supabase');
    const result = await networkService.fetchMemories();
    console.log('[loadMemoriesFromSupabase] fetchMemories result:', result);
    if (!result.ok) {
      console.error('[loadMemoriesFromSupabase] Query failed', result.error);
      appStore.setState({ allMemoriesData: localFallback.length ? localFallback : [] });
      if (localFallback.length) sortMemories(appStore.getState().currentSort);
      return;
    }
    if (!result.data || result.data.length === 0) {
      console.log('[loadMemoriesFromSupabase] No public memories in Supabase, using local data');
      appStore.setState({ allMemoriesData: localFallback });
      if (localFallback.length) sortMemories(appStore.getState().currentSort);
      return;
    }
    const fromSupabase = result.data;
    const localByCode = {};
    localFallback.forEach(m => { if (m.code) localByCode[m.code] = { ...m, live_session_id: null, is_live: false }; });
    const fromSupabaseOther = fromSupabase.filter(m => !LOCAL_CODES.includes(m.code));
    const merged = [
      ...LOCAL_CODES.map(code => localByCode[code]).filter(Boolean),
      ...fromSupabaseOther.map(m => ({ ...m, live_session_id: m.live_session_id || null, is_live: !!m.is_live }))
    ];
    console.log('[loadMemoriesFromSupabase] merged', merged.length, 'memories (local E-001/E-002/E-003 + Supabase others)');
    appStore.setState({ allMemoriesData: merged });
    const state = appStore.getState();
    sortMemories(state.currentSort);
  } catch (error) {
    console.error('[loadMemoriesFromSupabase] Error occurred', error);
    appStore.setState({ allMemoriesData: localFallback.length ? localFallback : [] });
    if (localFallback.length) sortMemories(appStore.getState().currentSort);
  }
}
function filterMemories() { const searchValue = document.getElementById('archiveSearch').value.toUpperCase().trim(); const cards = document.querySelectorAll('.memory-card'); const state = appStore.getState(); cards.forEach(card => { const code = card.getAttribute('data-code') || ''; const category = card.getAttribute('data-category') || 'archive'; let shouldShow = true; if (state.currentCategory === 'story' && category !== 'archive') shouldShow = false; else if (state.currentCategory === 'archive' && category !== 'archive') shouldShow = false; if (shouldShow && (searchValue === '' || code.includes(searchValue))) { card.classList.remove('hidden'); card.style.display = 'block'; if (searchValue !== '' && code === searchValue) { setTimeout(() => { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.style.transform = 'scale(1.05)'; setTimeout(() => card.style.transform = '', 500) }, 100) } } else { card.classList.add('hidden'); card.style.display = 'none' } }) }
function sortMemories(sortType, btnElement) {
    appStore.setState({ currentSort: sortType });
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    const state = appStore.getState();
    uiManager.renderMemoryCards(
        state.allMemoriesData,
        state.currentCategory,
        state.currentSort,
        selectMemory,
        filterMemories
    );
}
// selectRole, generateSessionCode, copySessionCode, joinSession → app/live.js

// cosineSimilarity is imported from /js/shared/math.js
function updateAlignmentDisplay() {
    const state = appStore.getState();
    uiManager.updateAlignmentDisplay(state.currentAlignment);
}
function renderArchiveEmotionWave(emotionVector) {
    console.log('[renderArchiveEmotionWave] called, emotionVector:', emotionVector);
    if (!emotionVector) {
        console.warn('[renderArchiveEmotionWave] no emotionVector');
        return;
    }
    const canvas = document.getElementById('waveCanvas');
    if (!canvas) {
        console.warn('[renderArchiveEmotionWave] waveCanvas not found');
        return;
    }
    console.log('[renderArchiveEmotionWave] waveCanvas found, before emotionVectorToWaveStyle');

    // Calculation done here (Visualizer receives numbers only)
    const waveData = emotionVectorToWaveStyle(emotionVector);
    console.log('[renderArchiveEmotionWave] emotionVectorToWaveStyle result:', waveData);
    const time = Date.now() * 0.001;

    // Pass calculated data to Visualizer
    console.log('[renderArchiveEmotionWave] before visualizer.renderArchiveEmotionWave');
    visualizer.renderArchiveEmotionWave(canvas, waveData, time);
    console.log('[renderArchiveEmotionWave] after visualizer.renderArchiveEmotionWave');
    console.log('Archive emotion wave rendered:', waveData);
}

// Archive wave animation management
let archiveWaveAnimationId = null;
let archiveWaveTime = 0;
let currentArchiveWaveStyle = null;
let currentArchiveEmotionVector = null;

/**
 * Archive wave animation start
 * @param {Object} emotionVector - user emotion 벡터
 */
function startArchiveWaveAnimation(emotionVector) {
    console.log('[startArchiveWaveAnimation] called, emotionVector:', emotionVector);
    if (!emotionVector) {
        console.warn('[startArchiveWaveAnimation] No emotionVector');
        return;
    }
    
 // existing animation 중지
    stopArchiveWaveAnimation();
    
    const canvas = document.getElementById('archiveWaveCanvas');
    if (!canvas) {
        console.warn('[startArchiveWaveAnimation] archiveWaveCanvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
    
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    const width = canvas.width / 2;
    const height = canvas.height / 2;
    const centerY = height / 2;
    
    const waveStyle = emotionVectorToWaveStyle(emotionVector);
    const maxAmplitude = Math.min(height * 0.4, 20);
    const amplitude = Math.min(waveStyle.amplitude || 18, maxAmplitude);
    const freq = 0.015;
    const speed = 0.02;
    
    currentArchiveWaveStyle = waveStyle;
    currentArchiveEmotionVector = emotionVector;
    archiveWaveTime = 0;
    
    function animate() {
        const ctx = canvas.getContext('2d');
        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const centerY = height / 2;
        const t = archiveWaveTime;
        
        ctx.clearRect(0, 0, width, height);
        const c = waveStyle.color || { r: 196, g: 168, b: 130 };
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.6)`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
            const phase = (x / width) * Math.PI * 2 + t * speed;
            const y = centerY + Math.sin(phase) * amplitude + Math.sin(phase * 2.3 + t * 0.5) * (amplitude * 0.4);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        archiveWaveTime += 0.016;
        archiveWaveAnimationId = requestAnimationFrame(animate);
    }
    animate();
}

/**
 * Archive wave animation 중지
 */
function stopArchiveWaveAnimation() {
    if (archiveWaveAnimationId) {
        cancelAnimationFrame(archiveWaveAnimationId);
        archiveWaveAnimationId = null;
    }
    archiveWaveTime = 0;
    currentArchiveWaveStyle = null;
    currentArchiveEmotionVector = null;
    console.log('[stopArchiveWaveAnimation] Wave animation stopped');
}

/**
 * Archive wave data screen rendering (animation 버전)
 * @param {Object} emotionVector - user emotion 벡터
 */
function renderArchiveWaveData(emotionVector) {
 // animation으 start
    startArchiveWaveAnimation(emotionVector);
}

/**
 * 첫 번째 scene용 회색 wave animation
 */
function renderDefaultGrayLine() {
    const canvas = document.getElementById('archiveWaveCanvas');
    if (!canvas) return;
    
    stopArchiveWaveAnimation();
    
    const state = appStore.getState();
    if (state.waveAnimationId) {
        cancelAnimationFrame(state.waveAnimationId);
        appStore.setState({ waveAnimationId: null });
    }
    if (typeof window._waveAnimationId !== 'undefined' && window._waveAnimationId) {
        cancelAnimationFrame(window._waveAnimationId);
        window._waveAnimationId = null;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
    
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    const width = canvas.width / 2;
    const height = canvas.height / 2;
    const centerY = height / 2;
    let t = 0;
    
    function animateGray() {
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(180, 180, 190, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
            const y = centerY
                + Math.sin(x * 0.008 + t * 0.4) * 3
                + Math.sin(x * 0.015 + t * 0.25) * 1.5;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        t += 0.016;
        archiveWaveAnimationId = requestAnimationFrame(animateGray);
    }
    animateGray();
}

async function saveArchiveEmotionToPlays(userEmotionVector, userReason, scene, currentData, sceneAlignment, reasonVector = null, mismatchType = null) {
    try {
        const state = appStore.getState();
        const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);
        if (!memoryId) {
            console.warn('memory_id를 찾을 수 없어 plays 테이블에 저장하지 않습니다');
            return;
        }
        const sceneId = scene.id;
        if (!sceneId) {
            console.warn('scene_id를 찾을 수 없어 plays 테이블에 저장하지 않습니다');
            return;
        }
        const sceneText = scene.text || '';
        const voidLevel = scene.voidInfo?.voidLevel || 'low';
        const waveData = computeArchiveWaveData(userEmotionVector, sceneText.length, voidLevel);
        
 // wave data save (next scene 서 display 위해)
        const currentSceneIndex = state.currentScene || 0;
        
 // window.archiveWaveData current scene wave data save
        if (!window.archiveWaveData) {
            window.archiveWaveData = [];
        }
        window.archiveWaveData[currentSceneIndex] = {
            emotionVector: userEmotionVector,
            waveStyle: emotionVectorToWaveStyle(userEmotionVector),
            timestamp: Date.now()
        };
        console.log('[saveArchiveEmotionToPlays] Wave data saved, sceneIndex:', currentSceneIndex, 'waveData:', window.archiveWaveData[currentSceneIndex]);
        
        const insertData = {
            memory_id: memoryId,
            scene_id: sceneId,
            user_emotion: userEmotionVector,
            user_reason: userReason,
            wave_data: waveData,
            layer_id: 0,
            alignment: sceneAlignment !== undefined ? sceneAlignment : null,
            reason_vector: reasonVector,
            mismatch_type: mismatchType,
            user_id: state.currentUser?.id || null
        };
        console.log('Archive plays Save attempt:', insertData);
 // void crack 사운드
        if (mismatchType === 'void_mismatch' && window.soundscape) {
            window.soundscape.onVoidCrack();
        }
        const result = await networkService.savePlay(insertData);
        if (!result.ok) {
            console.error('Archive plays Save failed:', result.error);
            return;
        }
        console.log('Archive plays Save success:', result.data);

 // 희석 시스템: play save 후 memory layers/dilution update
        try {
            const memId = insertData.memory_id;
            if (memId) {
                const countResult = await networkService.getContaminationLevel(memId);
                const playCount = countResult.ok ? (countResult.data || 0) : 0;
 // dilution = original 비중 (100% → experiencer 늘수록 감소)
 // 0명: 100, 10명: ~50, 30명: ~25, 100명: ~9
                const newDilution = Math.round(100 / (1 + playCount * 0.1));
                await networkService.updateMemoryDilution(memId, playCount, newDilution);
                console.log(`[Dilution] memory ${memId}: layers=${playCount}, dilution=${newDilution}%`);
            }
        } catch (dilutionError) {
            console.warn('[Dilution] Update failed (non-fatal):', dilutionError);
        }
    } catch (e) {
        console.error('saveArchiveEmotionToPlays error:', e);
    }
}
function selectMemory(index) { 
        const state = appStore.getState(); 
  const all = state.allMemoriesData || [];
  const memory = all[index];
  if (!memory || !memory.id) {
    console.warn('[Archive] memory not found for index:', index);
            return; 
        } 
  const titleSrc = String(memory.title || memory.completed_sentence || '');
  const lang = /[가-힣]/.test(titleSrc) ? 'ko' : 'en';
  try {
    sessionStorage.setItem('demoMemoryId', String(memory.id));
    sessionStorage.setItem('tem_archive_memory_id', String(memory.id));
    sessionStorage.setItem('tem_archive_lang', lang);
  } catch (_) {}
  const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const base = isLocal ? 'play-test.html' : '/play';
  window.location.href = `${base}?memory=${encodeURIComponent(memory.id)}&lang=${encodeURIComponent(lang)}`;
}
function showConsentSequence(memoryIndex) {}
function showWordSentenceSequence(memoryIndex) {}
function startArchivePlay(memoryIndex) {}
function backToList() { if (typeof destroyFloatingAnchor === 'function') destroyFloatingAnchor(); if (window.soundscape) window.soundscape.stop(); window._strataCompletedScenes = []; if (window.strataSection) window.strataSection.init(); stopWaveAnimation() }
async function loadStrataLayers(memoryId) {}

function deriveEffectType(alignment) {
    if (alignment >= 0.8) return 'smooth';
    if (alignment >= 0.6) return 'layer';
    if (alignment >= 0.4) return 'deposit';
    if (alignment >= 0.2) return 'erosion';
    return 'fade';
}

window._strataCompletedScenes = [];
function initProgressDots() { const currentData = window.currentStoryData || storyData; const dotsContainer = document.getElementById('progressDots'); if (!dotsContainer) return; dotsContainer.innerHTML = ''; if (!currentData || !currentData.scenes) return; for (let i = 0; i < currentData.scenes.length; i++) { const dot = document.createElement('div'); dot.className = 'progress-dot' + (i === 0 ? ' active' : ''); dot.onclick = function () { goToScene(i) }; dotsContainer.appendChild(dot) } }
function goToScene(index) { const state = appStore.getState(); if (index <= state.currentScene) { appStore.setState({ currentScene: index }); renderScene() } }

function getMemorySoundMap(memory) {
    const raw = memory?.sound_map || memory?.soundMap || null;
    return {
        HIGH: raw?.HIGH || SOUNDS.rain,
        MID: raw?.MID || SOUNDS.ambience,
        LOW: raw?.LOW || SOUNDS.drone,
        FIXATED: raw?.FIXATED || SOUNDS.drone,
        IDLE: raw?.opening || SOUNDS.opening
    };
}

function ensureSoundscapeReady(memory) {
    if (!window.soundscape || !memory) return;
    const memoryId = String(memory.id || '');
    if (!memoryId) return;
    if (window.__soundscapeMemoryId === memoryId) return;

    const map = getMemorySoundMap(memory);
    window.soundscape.stop();
    window.soundscape.init({ soundMap: map, volume: 0.35 });
    window.soundscape.start();
    window.__soundscapeMemoryId = memoryId;
}

// Archive demo: 3-scene transition map (used only when scenes.length === 3)
const SCENE_TRANSITION_MAP = {
    0: { echo_follow: 1, bridge: 1, contradiction: 2, displacement: 2, avoidance: 2, fixation: 0 },
    1: { echo_follow: 2, bridge: 2, contradiction: 0, displacement: 2, avoidance: 2, fixation: 1 },
    2: { _terminal: true }
};

function splitSentencesForScene(text) {
    return (text || '')
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean)
        .map(s => s.trim());
}

function buildArchiveSceneHTML(baseText, scene, visitCount) {
    const sentences = splitSentencesForScene(baseText);
    if (sentences.length === 0) return baseText || '';

    const rawEcho = scene.echoWords || scene.echo_words || [];
    const echoWords = Array.isArray(rawEcho)
        ? rawEcho.map(w => String(w).toLowerCase())
        : String(rawEcho).split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

    const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 3회차 이상(FIXATED): 핵심 단어 2–3개만 강조, 나머지 0.3
    if (visitCount >= 2) {
        const parts = [];
        for (let si = 0; si < sentences.length; si++) {
            const sent = sentences[si];
            const tokens = sent.split(/(\s+)/);
            let html = '';
            for (const token of tokens) {
                const clean = token.replace(/[.,!?…]+$/i, '').toLowerCase();
                const isFocus =
                    clean &&
                    echoWords.some(ew => clean === ew || clean.startsWith(ew) || ew.startsWith(clean));
                html += isFocus
                    ? `<span class="scene-text-word focus">${escape(token)}</span>`
                    : `<span class="scene-text-word fade">${escape(token)}</span>`;
            }
            parts.push(`<span class="scene-text-sentence">${html}</span>`);
        }
        return parts.join(' ');
    }

    // 2회차 방문: 마지막 문장만 선명, 나머지 0.6
    if (visitCount === 1) {
        return sentences.map((s, i) => {
            const isLast = i === sentences.length - 1;
            const cls = isLast ? 'scene-text-sentence focus' : 'scene-text-sentence fade';
            return `<span class="${cls}">${escape(s)}</span>`;
        }).join(' ');
    }

    // 첫 방문: 원문 그대로
    return escape(baseText || '');
}

function getArrivalTypingSpeed(pattern) {
    if (pattern === 'contradiction') return 50;
    if (pattern === 'avoidance') return 20;
    if (pattern === 'fixation') return 0;
    return 35;
}

function typeSceneText(el, text, speed, done) {
    if (!el) return;
    if (speed <= 0) {
        el.textContent = text || '';
        if (done) done();
        return;
    }
    let i = 0;
    el.textContent = '';
    function step() {
        if (i < text.length) {
            el.textContent += text[i++];
            setTimeout(step, speed);
        } else if (done) {
            done();
        }
    }
    step();
}

async function renderScene() { 
    console.log('[renderScene] start');
    try { 
        const currentData = window.currentStoryData || storyData; 
        const state = appStore.getState(); 
        if (state.currentMode === 'archive') {
            ensureSoundscapeReady(currentData);
        }
        console.log('[renderScene] currentData:', currentData ? { id: currentData.id, title: currentData.title, scenesCount: currentData.scenes?.length } : null);
        console.log('[renderScene] state.currentScene:', state.currentScene);
        if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) { 
            console.error('[renderScene] Unable to load scene:', { 
                hasCurrentData: !!currentData, 
                hasScenes: !!(currentData && currentData.scenes), 
                scenesLength: currentData?.scenes?.length, 
                currentScene: state.currentScene 
            });
            showNotification('Unable to load scene'); 
            return; 
        } 
        const scene = currentData.scenes[state.currentScene]; 
        console.log('[renderScene] scene:', scene ? { id: scene.id, text: scene.text?.substring(0, 50) + '...', originalVector: scene.originalVector, original_emotion: scene.original_emotion } : null);
        if (!scene || !scene.text) { 
            console.error('[renderScene] Unable to load scene text:', { hasScene: !!scene, hasText: !!(scene && scene.text) });
            showNotification('Unable to load scene text'); 
            return; 
        } 
        // Apply contamination: load stage-appropriate text based on play history
        let displayScene = scene;
        const currentData_ref = window.currentStoryData || storyData;
        if (state.currentMode === 'archive' && currentData_ref && currentData_ref.id) {
            try {
                displayScene = await loadSceneWithContamination(scene, currentData_ref.id);
            } catch (e) {
                console.warn('[renderScene] Contamination load failed, using original:', e);
            }
        }

        const sceneTextEl = document.getElementById('sceneText');
        const baseText = displayScene.displayText || displayScene.text || scene.text || '';
        const visitCount = state.fixationCounts && typeof state.currentScene === 'number'
            ? (state.fixationCounts[state.currentScene] || 0)
            : 0;
        const arrivalPattern = state.lastTransitionPattern || 'bridge';

        if (sceneTextEl) {
            sceneTextEl.setAttribute('data-arrival', arrivalPattern);
            const typingSpeed = getArrivalTypingSpeed(arrivalPattern);
            if (typingSpeed <= 0) {
                sceneTextEl.innerHTML = buildArchiveSceneHTML(baseText, scene, visitCount);
            } else {
                typeSceneText(sceneTextEl, baseText, typingSpeed, () => {
                    sceneTextEl.innerHTML = buildArchiveSceneHTML(baseText, scene, visitCount);
                });
            }
        }

        if (scene.echoWords) renderEchoLayer(scene.echoWords);
        const sceneMainEl = document.querySelector('.scene-main');
        if (sceneMainEl && typeof startFloatingAnchor === 'function') {
            const anchorKeyword = (scene.echoWords && scene.echoWords.length > 0) ? scene.echoWords[0] : null;
            const alignment = state.currentAlignment || 0.5;
            startFloatingAnchor(sceneMainEl, anchorKeyword, alignment);
        }

        if (state.currentMode === 'archive') {
            renderArchiveFreeInput(scene);
        } else if (scene.choices) {
            renderChoices(scene.choices);
        }

        const sceneCounterEl = document.getElementById('sceneCounter');
        if (sceneCounterEl) sceneCounterEl.textContent = (state.currentScene + 1) + '/' + currentData.scenes.length;
        const dots = document.querySelectorAll('#progressDots .progress-dot');
        dots.forEach((dot, i) => {
            dot.className = 'progress-dot';
            if (i < state.currentScene) dot.classList.add('visited');
            if (i === state.currentScene) dot.classList.add('active');
        });
        const alignmentValueEl = document.getElementById('alignmentValue');
        if (alignmentValueEl) alignmentValueEl.textContent = state.currentAlignment.toFixed(2);
        if (typeof updateFloatingAnchorAlignment === 'function') updateFloatingAnchorAlignment(state.currentAlignment);
        const alignmentFillEl = document.getElementById('alignmentFill');
        if (alignmentFillEl) alignmentFillEl.style.width = (state.currentAlignment * 100) + '%';
        
        // Wave display: only process in archive mode
        if (state.currentMode === 'archive') {
            if (state.currentScene === 0) {
 // 첫 번째 scene: 회색 직선 display
                console.log('[renderScene] First scene, showing gray line');
                setTimeout(() => {
                    renderDefaultGrayLine();
                }, 300);
            } else if (state.currentScene > 0 && window.archiveWaveData) {
 // 두 번째 scene 후: 전 scene emotion wave display
                const previousSceneIndex = state.currentScene - 1;
                const previousWaveData = window.archiveWaveData[previousSceneIndex];
                if (previousWaveData && previousWaveData.emotionVector) {
                    console.log('[renderScene] Showing previous scene wave, previousSceneIndex:', previousSceneIndex);
                    setTimeout(() => {
                        renderArchiveWaveData(previousWaveData.emotionVector);
                    }, 300);
                } else {
 // 전 wave data 없으면 회색 직선
                    console.log('[renderScene] No previous scene wave data, showing gray line');
                    setTimeout(() => {
                        renderDefaultGrayLine();
                    }, 300);
                }
            } else {
 // wave data 없으면 회색 직선
                console.log('[renderScene] No wave data, showing gray line');
                setTimeout(() => {
                    renderDefaultGrayLine();
                }, 300);
            }
        } else {
 // archive mode 아니면 default wave start
            console.log('[renderScene] Not archive mode, starting default wave');
            if (typeof startBucketWaveAnimation === 'function') {
                startBucketWaveAnimation();
            } else {
                startWaveAnimation();
            }
        }
        if (state.currentMode === 'archive' && window.strataSection) {
            const prevScene = state.currentScene > 0 ? state.currentScene - 1 : -1;
            if (prevScene >= 0 && window._strataCompletedScenes && !window._strataCompletedScenes.some(c => c.sceneIndex === prevScene)) {
                const prevAlign = state.currentAlignment ?? 0.5;
                window._strataCompletedScenes.push({
                    sceneIndex: prevScene,
                    effectType: deriveEffectType(prevAlign),
                    strength: 1 - prevAlign,
                    color: window.strataSection.emotionVectorToRGB(
                        (window.archiveUserEmotions && window.archiveUserEmotions[prevScene]) ? window.archiveUserEmotions[prevScene].emotion : null
                    )
                });
            }
            window.strataSection.setTraces(window._strataCompletedScenes || []);
            window.strataSection.setCurrentScene(state.currentScene);
            window.strataSection.render();
        }
    } catch (e) { console.error('renderScene error:', e); showNotification('Error rendering scene') } }
function renderEchoLayer(words) { const layer = document.getElementById('echoLayer'); if (!layer) return; layer.innerHTML = ''; if (!words || !Array.isArray(words)) return; words.forEach(word => { const span = document.createElement('span'); span.className = 'echo-word'; span.textContent = word; span.style.top = (10 + Math.random() * 80) + '%'; span.style.left = (-15 + Math.random() * 130) + '%'; layer.appendChild(span) }) }
function renderChoices(choices) { const container = document.getElementById('choicesContainer'); if (!container) return; container.innerHTML = ''; if (!choices || !Array.isArray(choices)) return; choices.forEach((choice, i) => { const btn = document.createElement('button'); btn.className = 'choice-btn'; btn.textContent = choice.text; btn.onclick = function () { makeChoice(i) }; container.appendChild(btn) }) }

const _LIVE_KW = {
  guilt: ['sorry','fault','my fault','self-blame','regret','should have','shouldn\'t have','blame','wrong','because of me','미안','죄책','내 탓','잘못했','후회'],
  longing: ['miss','long for','again','return','back then','remember','still','remains','think of','그립','그리워','보고 싶','다시','돌아가','기억나','여전'],
  sadness: ['sad','cry','tears','hard','hurt','broken','tired','lonely','sorrow','슬프','슬펐','눈물','울었','아프','무너','외롭','서럽'],
  fear: ['scared','afraid','trembled','fear','anxious','avoid','run','hated','dread','무섭','두려','불안','떨렸','겁','도망','피하'],
  anger: ['angry','annoyed','furious','unfair','why','betrayed','hate','rage','mad','화나','분노','짜증','열받','빡쳐','억울','배신'],
  shame: ['embarrassed','ashamed','humiliated','exposed','hiding','can\'t say','창피','수치','부끄','들키','말 못'],
  numbness: ['don\'t know','nothing','empty','just','whatever','numb','blank','no idea','모르겠','아무것도','공허','무감각','멍했'],
  isolation: ['alone','nobody','abandoned','left','forsaken','only me','혼자','아무도','버려','고립','나만'],
};
function quickAnalyze(text) {
  if (!text || text.trim().length < 2) return null;
  const normalized = String(text).toLowerCase();
  const base = {};
  for (const [em, kws] of Object.entries(_LIVE_KW)) {
    base[em] = 0;
    for (const kw of kws) { if (normalized.includes(String(kw).toLowerCase())) base[em] = Math.min(1, base[em] + 0.4); }
  }
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  return total > 0 ? { base } : null;
}

function renderArchiveFreeInput(scene) {
  const container = document.getElementById('choicesContainer');
  if (!container) return;
  container.innerHTML = '';
  container.style.display = 'none';
  const freeInput = document.getElementById('freeInput');
  if (freeInput) {
    freeInput.value = '';
    freeInput.disabled = false;
    freeInput.readOnly = false;
    freeInput.placeholder = 'What comes to mind in this scene...';
    freeInput.parentElement.style.display = '';
    freeInput.style.pointerEvents = 'auto';
    freeInput.style.position = 'relative';
    freeInput.style.zIndex = '10';
    freeInput.style.opacity = '1';

    const newInput = freeInput.cloneNode(true);
    freeInput.parentNode.replaceChild(newInput, freeInput);

    newInput.oninput = function () {
      const result = quickAnalyze(newInput.value.trim());
      if (result && result.base) {
        const ev = result.base;
        startArchiveWaveAnimation(ev);
        if (typeof updateWaveBucket === 'function') {
          const entries = Object.entries(ev).sort((a, b) => (b[1] || 0) - (a[1] || 0));
          const topKey = entries.length ? entries[0][0] : '';
          if (topKey === 'anger' || topKey === 'fear') updateWaveBucket('LOW');
          else if (topKey === 'numbness' || topKey === 'isolation') updateWaveBucket('FIXATED');
          else if (topKey === 'sadness' || topKey === 'longing' || topKey === 'guilt') updateWaveBucket('MID');
          else updateWaveBucket('HIGH');
        }
        window._archiveLiveVector = result;
      }
    };
    newInput.onkeydown = function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submitArchiveFreeInput();
      }
    };
    setTimeout(() => newInput.focus({ preventScroll: true }), 100);

    const inputWrapper = newInput.parentElement;
    inputWrapper.style.cssText = 'display:flex;align-items:flex-end;gap:0.5rem;';
    newInput.style.flex = '1';

    inputWrapper.querySelectorAll('.archive-send-btn').forEach(b => b.remove());

    const sendBtn = document.createElement('button');
    sendBtn.className = 'archive-send-btn';
    sendBtn.textContent = '→';
    sendBtn.onclick = function () { submitArchiveFreeInput(); };
    inputWrapper.appendChild(sendBtn);
  }

  function submitArchiveFreeInput() {
    const fi = document.getElementById('freeInput');
    if (!fi || !fi.value.trim()) return;
    fi.disabled = true;
    const btn = container.querySelector('.archive-send-btn');
    if (btn) btn.disabled = true;
    window._archiveFreeText = fi.value.trim();
    makeChoice(0);
  }
}

function makeChoice(choiceIndex) { 
    try { 
        const state = appStore.getState(); 
        appStore.setState({ userChoices: [...state.userChoices, choiceIndex] }); 
        const currentData = window.currentStoryData || storyData; 
        const updatedState = appStore.getState(); 
        if (!currentData || !currentData.scenes || !currentData.scenes[updatedState.currentScene]) { 
            showNotification('Unable to load scene data'); 
            return; 
        } 
        const scene = currentData.scenes[updatedState.currentScene]; 
        const sceneType = scene.sceneType || scene.scene_type || 'normal'; 
        
 // expInterview.js load됐으면 모든 scene 서 칩 인터view 
        console.log('[makeChoice] startExpInterview check:', typeof startExpInterview);
        if (typeof startExpInterview === 'function') {
            console.log('[makeChoice] startExpInterview called');
            startExpInterview(scene);
        } else {
 // expInterview 없으면 바 next scene으 
            proceedToNextScene();
        }
    } catch (e) { 
        console.error('makeChoice error:', e); 
        showNotification('An error occurred'); 
    } 
}
function proceedToNextScene() {
    try {
        const currentData = window.currentStoryData || storyData;
        const state = appStore.getState();
        if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) {
            showNotification('Unable to load scene data');
            return;
        }
            if (state.currentScene < currentData.scenes.length - 1) {
                appStore.setState({ currentScene: state.currentScene + 1 });
                if (window.soundscape) window.soundscape.onSceneTransition();
            renderScene();
        } else {
            showEndScreen();
        }
    } catch (e) {
        console.error('proceedToNextScene error:', e);
        showNotification('An error occurred');
    }
}
// Expose to window for expInterview.js access
window.proceedToNextScene = proceedToNextScene;
function proceedToNextSceneLive() { try { const currentData = window.currentStoryData || storyData; const state = appStore.getState(); if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) { showNotification('Unable to load scene data'); return } if (state.currentScene < currentData.scenes.length - 1) { appStore.setState({ currentScene: state.currentScene + 1 }); simulateNarratorInput() } else { showEndScreen() } } catch (e) { console.error('proceedToNextSceneLive error:', e); showNotification('An error occurred') } }
// ───── submitEmotion 리팩토링: 하위 function들 ─────

/**
 * emotion input collect 및 validation (UIManager )
 * @returns {Object} { reason, scene, currentData, anchorEmotions } 또 null (failed 시)
 */
function collectEmotionInput() {
 // UIManager 통 input collect
    const reason = uiManager.collectEmotionInput();
    const state = appStore.getState();

 // userReasons update
    appStore.setState({ userReasons: [...state.userReasons, reason] });
    updateUserStats('interpretation', 1);

 // modal Close 및 input 필드 initialization (UIManager )
    uiManager.closeEmotionModal();

 // scene data validation (store 서 읽기)
    const currentData = window.currentStoryData || storyData;
    if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) {
        showNotification('Unable to load scene data');
        return null;
    }

    const scene = currentData.scenes[state.currentScene];

 // anchor_emotions 파싱
    let anchorEmotions = scene.anchor_emotions || null;
    if (anchorEmotions && typeof anchorEmotions === 'string') {
        try {
            anchorEmotions = JSON.parse(anchorEmotions);
        } catch (e) {
            console.warn('anchor_emotions 파싱 Failed:', e);
            anchorEmotions = null;
        }
    }
    if (anchorEmotions && !Array.isArray(anchorEmotions)) {
        anchorEmotions = null;
    }

    return { reason, scene, currentData, anchorEmotions };
}

/**
 * emotion analysis 수행 (archive mode일 때 )
 * @param {string} reason - user input 유
 * @param {Array} anchorEmotions - anchor emotion list
 * @returns {Object} { userEmotionVector, reasonVector } 또 null
 */
/**
 * emotion analysis 수행 (archive mode일 때 )
 * @param {string} reason - user input 유
 * @param {Array} anchorEmotions - anchor emotion list
 * @param {Object} scene - current scene object
 * @returns {Object} { userEmotionVector, reasonVector } 또 null
 */
// analyzeEmotionForArchive function expInterview 모듈 대체됨

/**
 * ByeoriEngine.calculateStep() call 수행
 * @param {Object} input - { userVector, originalVector, anchorEmotions }
 * @param {Object} context - { previousBucket, emotionHistory }
 * @returns {Object} 엔진 calculation result
 */
function runEngineStep(input, context) {
    const state = appStore.getState();
    const nextInput = {
        ...input,
        userTrajectory: state.userEmotionTrajectory || [],
        originalTrajectory: state.originalEmotionTrajectory || [],
        sceneScores: state.sceneScores || []
    };
    return byeoriEngine.calculateStep(nextInput, context);
}

/**
 * 엔진 result store apply (state reflect )
 * @param {Object} engineResult - 엔진 calculation result
 * @param {Object} userEmotionVector - user emotion 벡터
 * @returns {Object} { sceneAlignment, newBucket, stateAfterUpdate }
 */
function applyEngineResult(engineResult, userEmotionVector) {
    const sceneAlignment = engineResult.alignment_score;
    const newBucket = engineResult.alignment_bucket;

 // emotion 히스토리 update
    const dominantEmotion = getDominantEmotion(userEmotionVector);
    const currentState = appStore.getState();
    const updatedHistory = [...currentState.emotionHistory, dominantEmotion];
    if (updatedHistory.length > 10) {
        updatedHistory.shift();
    }
    const currentData = storyData || window.currentStoryData;
    const currentSceneIndex = currentState.currentScene || 0;
    const currentScene = currentData?.scenes?.[currentSceneIndex] || null;
    const originalEmotion = currentScene?.originalEmotion || currentScene?.original_emotion || {};

    const updatedUserTrajectory = [...(currentState.userEmotionTrajectory || []), userEmotionVector || {}];
    const updatedOriginalTrajectory = [...(currentState.originalEmotionTrajectory || []), originalEmotion || {}];
    const updatedSceneScores = [...(currentState.sceneScores || []), engineResult.current_scene_score || 0];

    appStore.setState({
        emotionHistory: updatedHistory,
        userEmotionTrajectory: updatedUserTrajectory,
        originalEmotionTrajectory: updatedOriginalTrajectory,
        sceneScores: updatedSceneScores
    });

 // alignment 및 bucket update
    appStore.setState({
        currentAlignment: sceneAlignment,
        currentBucket: newBucket
    });

 // window.archiveSceneAlignments save (하위 호환성 maintain)
    if (!window.archiveSceneAlignments) {
        window.archiveSceneAlignments = [];
    }
    const stateAfterUpdate = appStore.getState();
    window.archiveSceneAlignments[stateAfterUpdate.currentScene] = sceneAlignment;

    return { sceneAlignment, newBucket, stateAfterUpdate };
}
window.applyEngineResult = applyEngineResult;

/**
 * UI update (UIManager/Visualizer call)
 * @param {Object} state - current store state
 * @param {Object} result - { sceneAlignment, newBucket, userEmotionVector }
 */
function updateUIAfterSubmit(state, result) {
    const { sceneAlignment, newBucket, userEmotionVector } = result;

 // alignment display update
    updateAlignmentDisplay();

 // wave rendering
    renderArchiveEmotionWave(userEmotionVector);

 // notification display
    showNotification(`Scene Alignment: ${(sceneAlignment * 100).toFixed(0)}%`);

 // bucket 피드백
    console.log('=== Bucket determination ===');
    console.log('Alignment:', sceneAlignment);
    console.log('이전 Bucket:', state.currentBucket);
    console.log('감정 히스토리:', state.emotionHistory);
    console.log('새 Bucket:', newBucket);

    if (newBucket !== state.currentBucket) {
        showBucketFeedback(newBucket, sceneAlignment);
 // 사운드스케 프 bucket transition
        if (window.soundscape) {
            window.soundscape.setBucket(newBucket);
        }
    }
}

/**
 * NetworkService 통 save
 * @param {Object} params - { userEmotionVector, reason, scene, currentData, sceneAlignment, reasonVector, mismatchType }
 */
async function persistAfterSubmit(params) {
    const { userEmotionVector, reason, scene, currentData, sceneAlignment, reasonVector, mismatchType } = params;

    if (!userEmotionVector) {
        return;
    }

    await saveArchiveEmotionToPlays(
        userEmotionVector,
        reason,
        scene,
        currentData,
        sceneAlignment,
        reasonVector,
        mismatchType
    );
}

/**
 * next scene으 move 또 ending screen display
 * @param {Object} currentData - current memory data
 * @param {Object} scene - current scene object
 */
async function proceedToNextSceneOrEnd(currentData, scene) {
    const finalState = appStore.getState();

 // NPC 대화 display
    showNpcDialogue(getRandomDialogue(NPC_DIALOGUES.archive.choiceMade), 3000);

 // 1.5초 후 next scene으 move 또 ending
    setTimeout(async () => {
        const nextState = appStore.getState();
        if (nextState.currentScene < currentData.scenes.length - 1) {
 // next scene으 move
            appStore.setState({ currentScene: nextState.currentScene + 1 });
            if (nextState.currentMode === 'archive') {
                renderScene();
            } else {
                simulateNarratorInput();
            }
        } else {
 // ending screen display
            if (nextState.currentMode === 'archive') {
                const alignmentResult = await calculateAverageAlignment();
                showEndScreen(alignmentResult);
            } else {
                showEndScreen();
            }
        }
    }, 1500);
}

// submitEmotion function expInterview 모듈 대체됨
function updateStrata() { const state = appStore.getState(); const originalPercent = 70 - (state.currentScene * 10), interpretPercent = 30 + (state.currentScene * 10); document.getElementById('strataOriginal').style.height = originalPercent + '%'; document.getElementById('strataInterpretation').style.height = interpretPercent + '%'; document.getElementById('strataInterpretation').style.bottom = originalPercent + '%' }
function getAlignmentLevel(alignment) { if (alignment >= 0.55) return 'HIGH'; if (alignment >= 0.35) return 'MID'; return 'LOW' } function startWaveAnimation() { const canvas = document.getElementById('waveCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2); let time = 0; const state = appStore.getState(); const alignmentLevel = getAlignmentLevel(state.currentAlignment); function animate() { const width = canvas.width / 2, height = canvas.height / 2, centerY = height / 2; ctx.fillStyle = 'rgba(18,18,26,0.1)'; ctx.fillRect(0, 0, width, height); if (alignmentLevel === 'HIGH') { ctx.beginPath(); ctx.strokeStyle = 'rgba(196,168,130,0.8)'; ctx.lineWidth = 2; const syncPhase = time * 0.05; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.02 + syncPhase) * 15 + Math.sin(x * 0.01 + syncPhase * 0.6) * 10; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = 'rgba(122,154,122,0.7)'; ctx.lineWidth = 2; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.02 + syncPhase + Math.PI * 0.1) * 15 + Math.sin(x * 0.01 + syncPhase * 0.6 + Math.PI * 0.1) * 10; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke() } else if (alignmentLevel === 'MID') { ctx.save(); ctx.filter = 'blur(1px)'; const irregularity = Math.sin(time * 0.1) * 0.3 + 0.7; ctx.beginPath(); ctx.strokeStyle = 'rgba(196,168,130,0.6)'; ctx.lineWidth = 1.5; for (let x = 0; x < width; x++) { const noise = Math.random() * 5 - 2.5; const y = centerY + Math.sin(x * 0.02 + time * 0.05 + noise * 0.1) * 15 * irregularity + Math.sin(x * 0.01 + time * 0.03 + noise * 0.05) * 10 * irregularity; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.restore(); ctx.beginPath(); ctx.strokeStyle = 'rgba(123,143,168,0.5)'; ctx.lineWidth = 1.5; const state = appStore.getState(); const offset = (1 - state.currentAlignment) * 30; for (let x = 0; x < width; x++) { const noise = Math.random() * 3 - 1.5; const y = centerY + Math.sin(x * 0.02 + time * 0.05 + offset + noise * 0.1) * 15 + Math.sin(x * 0.01 + time * 0.03 + offset * 0.5 + noise * 0.05) * 10; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke() } else if (alignmentLevel === 'LOW') { const glitch = Math.random() > 0.9; if (glitch) { ctx.save(); ctx.filter = 'invert(1)'; ctx.fillStyle = 'rgba(217,74,74,0.3)'; ctx.fillRect(0, 0, width, height); ctx.restore() } const noiseAmplitude = 10 + Math.random() * 10; ctx.beginPath(); ctx.strokeStyle = glitch ? 'rgba(217,74,74,0.8)' : 'rgba(196,168,130,0.4)'; ctx.lineWidth = 1.5; for (let x = 0; x < width; x++) { const noise = Math.random() * noiseAmplitude - noiseAmplitude / 2; const y = centerY + Math.sin(x * 0.02 + time * 0.05 + noise * 0.2) * 15 + Math.sin(x * 0.01 + time * 0.03 + noise * 0.1) * 10 + noise; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = glitch ? 'rgba(217,74,74,0.6)' : 'rgba(123,143,168,0.3)'; ctx.lineWidth = 1.5; const state = appStore.getState(); const offset = (1 - state.currentAlignment) * 30; for (let x = 0; x < width; x++) { const noise = Math.random() * noiseAmplitude - noiseAmplitude / 2; const y = centerY + Math.sin(x * 0.02 + time * 0.05 + offset + noise * 0.2) * 15 + Math.sin(x * 0.01 + time * 0.03 + offset * 0.5 + noise * 0.1) * 10 + noise; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke() } else if (alignmentLevel === 'FIXATED') { const slowTime = time * 0.02; const vignetteGradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height)); vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)'); vignetteGradient.addColorStop(1, 'rgba(0,0,0,0.4)'); ctx.beginPath(); ctx.strokeStyle = 'rgba(196,168,130,0.9)'; ctx.lineWidth = 2.5; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.015 + slowTime) * 12 + Math.sin(x * 0.008 + slowTime * 0.5) * 8; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = 'rgba(122,154,122,0.8)'; ctx.lineWidth = 2.5; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.015 + slowTime + Math.PI * 0.05) * 12 + Math.sin(x * 0.008 + slowTime * 0.5 + Math.PI * 0.05) * 8; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.fillStyle = vignetteGradient; ctx.fillRect(0, 0, width, height) } time++; const animId = requestAnimationFrame(animate); appStore.setState({ waveAnimationId: animId }) } animate() }
function startLiveWaveAnimation() { const canvas = document.getElementById('liveWaveCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2); let time = 0; function animate() { ctx.fillStyle = 'rgba(18,18,26,0.15)'; ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2); const width = canvas.width / 2, height = canvas.height / 2, centerY = height / 2; ctx.beginPath(); ctx.strokeStyle = 'rgba(196,168,130,0.7)'; ctx.lineWidth = 1.5; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.025 + time * 0.04) * 12 + Math.sin(x * 0.015 + time * 0.025) * 8; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = 'rgba(123,143,168,0.7)'; ctx.lineWidth = 1.5; const offset = (1 - currentAlignment) * 25; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.025 + time * 0.04 + offset) * 12 + Math.sin(x * 0.015 + time * 0.025 + offset * 0.6) * 8; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); time++; const animId = requestAnimationFrame(animate); appStore.setState({ liveWaveAnimationId: animId }) } animate() }
function stopWaveAnimation() { const state = appStore.getState(); if (state.waveAnimationId) { cancelAnimationFrame(state.waveAnimationId); appStore.setState({ waveAnimationId: null }) } }
function stopLiveWaveAnimation() { const state = appStore.getState(); if (state.liveWaveAnimationId) { cancelAnimationFrame(state.liveWaveAnimationId); appStore.setState({ liveWaveAnimationId: null }) } }
function stopAllAnimations() {
    stopWaveAnimation();
    stopLiveWaveAnimation();
    visualizer.stopAlignmentWaveAnimation();
    stopVoiceWaveLiveAnimation();
    stopLiveVoiceInput();
}
async function showEndScreen(alignmentResult, forceEndScreen = false) {
    if (window.soundscape) window.soundscape.stop();
    const state = appStore.getState();
    console.log('[Ending] showEndScreen called:', { alignmentResult, forceEndScreen, currentMode: state.currentMode });
    try {
        stopAllAnimations();
        const liveContainerEl = document.getElementById('liveContainer');
        if (liveContainerEl) { liveContainerEl.classList.remove('active'); liveContainerEl.style.display = 'none' }
        const archiveContainerEl = document.getElementById('archiveContainer');
        if (archiveContainerEl) { archiveContainerEl.classList.remove('active'); archiveContainerEl.style.display = 'none' }
        const sceneViewerEl = document.getElementById('sceneViewer');
        if (sceneViewerEl) { sceneViewerEl.classList.remove('active'); sceneViewerEl.style.display = 'none' }

        console.log('[Ending] Ending screen display start');
        let finalAlignment = state.currentAlignment;
        let isTrueEnding = false;
        if (alignmentResult) {
            finalAlignment = alignmentResult.averageAlignment;
            isTrueEnding = alignmentResult.isTrueEnding;
        }
        console.log('[Ending] Alignment 계산 complete:', { finalAlignment, isTrueEnding });

        const endScreenEl = document.getElementById('endScreen');
        if (endScreenEl) {
            endScreenEl.classList.add('active');
            endScreenEl.style.cssText = 'display:flex !important';
            console.log('[Ending] Ending screen elements displayed');
        } else {
            console.error('[Ending] endScreen element not found!');
        }

        const currentData = window.currentStoryData || storyData;
        const lastScene = currentData.scenes && currentData.scenes.length > 0 ? currentData.scenes[currentData.scenes.length - 1] : null;
        const lastChoiceIndex = state.userChoices.length > 0 ? state.userChoices[state.userChoices.length - 1] : 0;
        const lastReason = state.userReasons.length > 0 ? state.userReasons[state.userReasons.length - 1] : "—";

 // 안전하게 choices 접근
        const yourChoice = lastScene && lastScene.choices && lastScene.choices[lastChoiceIndex] ? lastScene.choices[lastChoiceIndex].text : "—";
        const theirChoice = lastScene && lastScene.choices && lastScene.originalChoice !== undefined && lastScene.choices[lastScene.originalChoice] 
            ? lastScene.choices[lastScene.originalChoice].text 
            : "—";
        const theirReason = lastScene && lastScene.originalReason ? lastScene.originalReason : "—";

        document.getElementById('finalAlignment').textContent = 'Emotional Structure Alignment: ' + finalAlignment.toFixed(2);

        if (isTrueEnding) {
            console.log('[Ending] 트루엔딩 표시');
            const trueBadge = document.getElementById('trueEndingBadge');
            const normalBadge = document.getElementById('normalEndingBadge');
            const subtitle = document.getElementById('endSubtitle');
            if (trueBadge) trueBadge.classList.add('active');
            if (normalBadge) normalBadge.classList.remove('active');
            if (subtitle) subtitle.style.display = 'none';
            document.getElementById('endTitle').textContent = 'Touching the Engraving';
            document.getElementById('finalMessage').innerHTML = '<strong>You reached the true ending.</strong><br><br>Your emotional structure nearly overlapped with theirs.<br>This alignment will be deeply etched into the original strata.';
            const state = appStore.getState();
            const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);
            const modeState = appStore.getState(); if (memoryId && modeState.currentMode === 'archive') {
                const endButtons = document.querySelector('.end-buttons');
                if (endButtons) {
                    const existingOriginalBtn = endButtons.querySelector('.original-view-btn');
                    if (existingOriginalBtn) existingOriginalBtn.remove();
                    const originalButton = document.createElement('button');
                    originalButton.className = 'original-view-btn';
                    originalButton.textContent = 'View Original Memory';
                    originalButton.onclick = () => showOriginalMemory(memoryId);
                    endButtons.appendChild(originalButton);
                }
                try {
                    supabaseClient = getSupabaseClient();
                    if (supabaseClient) {
                        const memoryResult = await networkService.getMemoryById(memoryId);
                        if (memoryResult.ok && memoryResult.data && memoryResult.data.source_session_id) {
                            const sessionResult = await networkService.getSessionNarratorId(memoryResult.data.source_session_id);
                            if (sessionResult.ok && sessionResult.data) {
                                const sessionData = sessionResult.data;
                                setTimeout(() => { showTrueEndingNoteUI(memoryResult.data.author_note, sessionData.narrator_id, memoryId) }, 3000);
                            }
                        }
                    }
                } catch (e) {
                    console.error('트루엔딩 쪽지 UI 로드 error:', e);
                }
            }
        } else {
            console.log('[Ending] 일반 엔딩 표시');
            const trueBadge = document.getElementById('trueEndingBadge');
            const normalBadge = document.getElementById('normalEndingBadge');
            const subtitle = document.getElementById('endSubtitle');
            if (trueBadge) trueBadge.classList.remove('active');
            if (normalBadge) normalBadge.classList.add('active');
            if (subtitle) {
                subtitle.style.display = 'block';
                subtitle.textContent = 'Felt in a Different Grain';
            }
            document.getElementById('endTitle').textContent = 'ENDING';
            document.getElementById('finalMessage').innerHTML = 'You experienced this memory in a different way.<br>Same scene, different emotions.<br>That, too, is an interpretation.';
        }

        const endContentEl = document.getElementById('endContent');
        if (endContentEl) endContentEl.style.opacity = '1';
        setTimeout(() => {
            const state = appStore.getState();
            if (state.currentMode === 'live') {
                showNpcDialogue(NPC_DIALOGUES.live.memoryTransition, 6000);
            } else {
                showNpcDialogue(NPC_DIALOGUES.archive.trueEnding, 6000);
            }
        }, 2000);
        const footer = document.querySelector('.footer');
        if (footer) footer.classList.add('visible');
        console.log('[Ending] showEndScreen complete');
    } catch (e) {
        console.error('[Ending] showEndScreen error:', e);
    }
}
function startEndStrataAnimation() {}
function getUserDominantEmotion() { const emotions = ['fear', 'sadness', 'guilt', 'anger', 'longing', 'isolation', 'numbness', 'moralPain']; const lastScene = window.currentStoryData?.scenes?.[window.currentStoryData.scenes.length - 1]; if (lastScene && lastScene.emotionDist) { const dist = lastScene.emotionDist; let max = 0, dominant = 'fear'; if ((dist.fear || 0) > max) { max = dist.fear; dominant = 'fear' } if ((dist.sadness || 0) > max) { max = dist.sadness; dominant = 'sadness' } if ((dist.guilt || 0) > max) { max = dist.guilt; dominant = 'guilt' } if ((dist.anger || 0) > max) { max = dist.anger; dominant = 'anger' } if ((dist.longing || 0) > max) { max = dist.longing; dominant = 'longing' } if ((dist.isolation || 0) > max) { max = dist.isolation; dominant = 'isolation' } if ((dist.numbness || 0) > max) { max = dist.numbness; dominant = 'numbness' } if ((dist.moralPain || 0) > max) { max = dist.moralPain; dominant = 'moralPain' } return dominant } return emotions[Math.floor(Math.random() * emotions.length)] }
function restart() { if (window.soundscape) window.soundscape.stop(); appStore.setState({ currentMode: null, currentRole: null, sessionCode: null, currentMemory: null, currentScene: 0, userChoices: [], userReasons: [], currentAlignment: 0, currentBucket: null, emotionHistory: [], userEmotionTrajectory: [], originalEmotionTrajectory: [], sceneScores: [], liveSceneNum: 1, liveFragments: 0, liveMatches: 0 }); const endScreenEl = document.getElementById('endScreen'); if (endScreenEl) { endScreenEl.classList.remove('active'); endScreenEl.style.display = 'none' } const liveContainerEl = document.getElementById('liveContainer'); if (liveContainerEl) { liveContainerEl.classList.remove('active'); liveContainerEl.style.display = 'none' } const archiveContainerEl = document.getElementById('archiveContainer'); if (archiveContainerEl) { archiveContainerEl.classList.remove('active'); archiveContainerEl.style.display = 'none' } const memoryListEl = document.getElementById('memoryList'); if (memoryListEl) memoryListEl.style.display = 'grid'; const sceneViewerEl = document.getElementById('sceneViewer'); if (sceneViewerEl) { sceneViewerEl.classList.remove('active'); sceneViewerEl.style.display = 'none' } const introScreen = document.getElementById('introScreen'); if (introScreen) { introScreen.classList.remove('hidden'); introScreen.classList.add('visible'); introScreen.style.cssText = 'display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important' } const narratorPanelEl = document.getElementById('narratorPanel'); if (narratorPanelEl) narratorPanelEl.classList.remove('active'); const experiencerPanelEl = document.getElementById('experiencerPanel'); if (experiencerPanelEl) experiencerPanelEl.classList.remove('active'); const interpretationTraceEl = document.getElementById('interpretationTrace'); if (interpretationTraceEl) interpretationTraceEl.style.display = 'none'; const liveSceneContentEl = document.getElementById('liveSceneContent'); if (liveSceneContentEl) liveSceneContentEl.textContent = '화자가 기억을 불러오고 있습니다...'; const feelingInput = document.getElementById('experiencerFeelingInput'); if (feelingInput) feelingInput.value = ''; const memoryTraceContent = document.getElementById('memoryTraceContent'); if (memoryTraceContent) memoryTraceContent.textContent = '—'; const liveAlignmentValueEl = document.getElementById('liveAlignmentValue'); if (liveAlignmentValueEl) { liveAlignmentValueEl.textContent = '0.00'; liveAlignmentValueEl.classList.remove('high') } const liveAlignmentFillEl = document.getElementById('liveAlignmentFill'); if (liveAlignmentFillEl) liveAlignmentFillEl.style.width = '0%'; const liveSceneNumEl = document.getElementById('liveSceneNum'); if (liveSceneNumEl) liveSceneNumEl.textContent = '1'; const liveFragmentsEl = document.getElementById('liveFragments'); if (liveFragmentsEl) liveFragmentsEl.textContent = '0'; const liveMatchesEl = document.getElementById('liveMatches'); if (liveMatchesEl) liveMatchesEl.textContent = '0'; const footer = document.querySelector('.footer'); if (footer) footer.classList.remove('visible') }
let pendingSaveAction = null;
function saveMemory() {
    console.log('saveMemory called:', { isLoggedIn, currentMode, currentRole, currentSessionId });
    if (!isLoggedIn) {
        if (confirm('Login required. Login now?')) {
            pendingSaveAction = 'save';
            const loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.classList.add('active');
                loginModal.style.cssText = 'display:flex !important;z-index:3000 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important';
                const usernameInput = document.getElementById('loginUsername');
                if (usernameInput) usernameInput.focus();
            }
            return;
        } else {
            return;
        }
    }
    console.log('saveMemory 조건 확인:', { currentMode, currentRole });
    const saveState = appStore.getState(); if (saveState.currentMode === 'live') {
        if (saveState.currentRole === 'A') {
            console.log('showMemoryFateModal called');
            showMemoryFateModal();
        } else {
            proceedSaveMemory();
        }
    } else {
        proceedSaveMemory();
    }
}
function proceedSaveMemory() { const state = appStore.getState(); if (state.currentMode === 'live') { saveSessionRecord() } enterArchive() }
function goToIntro() { if (confirm("If you don't save, the memory will be lost. Are you sure?")) { restart() } }
function showMemoryFateModal() {
    console.log('showMemoryFateModal called');
    const modalEl = document.getElementById('memoryFateModal');
    if (modalEl) {
        console.log('Modal element found, displaying');
        modalEl.classList.add('active');
        modalEl.style.cssText = 'display:flex !important;z-index:3000 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important';
        console.log('Modal display complete');
    } else {
        console.error('memoryFateModal element not found!');
    }
}
async function selectMemoryFate(fate) { const modalEl = document.getElementById('memoryFateModal'); if (modalEl) modalEl.classList.remove('active'); window.selectedMemoryFate = fate; const state = appStore.getState(); if (state.currentSessionId) { try { const result = await networkService.updateSessionMemoryFate(state.currentSessionId, fate); if (!result.ok) { console.error('Memory fate save error:', result.error) } else { console.log('Memory fate saved:', fate) } } catch (e) { console.error('Memory fate save error:', e) } } await saveLiveToArchive(fate); setTimeout(() => { proceedSaveMemory() }, 500) }
async function saveLiveToArchive(fate) { const state = appStore.getState(); if (!state.currentSessionId) { console.log('No session to save to archive'); return } try { const sessionResult = await networkService.getSessionById(state.currentSessionId); if (!sessionResult.ok || !sessionResult.data) { console.error('Session not found'); return } const sessionData = sessionResult.data; const scenesResult = await networkService.getLiveScenesBySessionId(state.currentSessionId); if (!scenesResult.ok || !scenesResult.data || scenesResult.data.length === 0) { console.log('No scenes to save'); return } const scenesData = scenesResult.data; const memoryCode = 'L-' + sessionData.session_code; const memoryTitle = 'Live Memory #' + sessionData.session_code; const dilutionValue = fate === 'preserve' ? 100 : fate === 'dilute' ? 50 : 0; const memoryResult = await networkService.saveMemory({ code: memoryCode, title: memoryTitle, layers: 1, dilution: dilutionValue, is_public: true, source_type: 'live', source_session_id: state.currentSessionId, memory_fate: fate, curator_id: state.currentUser?.id || null }); if (!memoryResult.ok || !memoryResult.data) { console.error('Memory insert error:', memoryResult.error); return } const newMemory = memoryResult.data; for (let i = 0; i < scenesData.length; i++) { const scene = scenesData[i]; const emotionVector = scene.emotion_vector || {}; const dominantEmotion = getDominantEmotion(emotionVector); const sceneResult = await networkService.saveScene({ memory_id: newMemory.id, scene_order: scene.scene_index || i + 1, text: scene.scene_text || '', scene_type: 'normal', echo_words: [], emotion_dist: emotionVector }); if (sceneResult.ok && sceneResult.data) { await networkService.saveChoice({ scene_id: sceneResult.data.id, choice_order: 0, text: scene.generated_emotion || 'Felt emotion', emotion: dominantEmotion, intensity: Math.round((scene.intensity || 0.5) * 10) }) } } console.log('Live session saved to archive'); showNotification('Memory saved to archive') } catch (e) { console.error('saveLiveToArchive error:', e) } }
// getDominantEmotion and getBucket are imported from /js/shared/math.js
const bucketDialogue = { HIGH: NPC_DIALOGUES.bucket.HIGH, MID: NPC_DIALOGUES.bucket.MID, LOW: NPC_DIALOGUES.bucket.LOW, FIXATED: NPC_DIALOGUES.bucket.FIXATED }; const bucketSystemMessage = { HIGH: "[ Synchronization stable ]", MID: "[ Signal unstable ]", LOW: "[ Distortion detected ]", FIXATED: "[ Loop detected ]" }; function showBucketFeedback(bucket, alignment) { if (bucket && bucketDialogue[bucket]) { showNpcDialogue(bucketDialogue[bucket], 4000) } if (bucket && bucketSystemMessage[bucket]) { showSystemMessage(bucketSystemMessage[bucket]) } } function showSystemMessage(message) { const systemMsgEl = document.getElementById('systemMessage'); if (systemMsgEl) { systemMsgEl.textContent = message; systemMsgEl.classList.add('visible'); setTimeout(() => { systemMsgEl.classList.remove('visible') }, 2000) } } async function getContaminationLevel(memoryId) { try { const result = await networkService.getContaminationLevel(memoryId); let playCount = 0; if (result.ok) { playCount = result.data || 0 } else { console.warn('DB contamination query failed, checking simulated data:', result.error) } if (playCount === 0 && window._simulatedPlaysMap && window._simulatedPlaysMap[memoryId]) { playCount = window._simulatedPlaysMap[memoryId].length; console.log('[Contamination] Using simulated plays count:', playCount) } const maxLayers = 100; const contamination = Math.min(playCount / maxLayers, 1.0); console.log('=== Contamination Calculation ==='); console.log('memory_id:', memoryId); console.log('plays 수:', playCount); console.log('Contamination:', contamination); return contamination } catch (e) { console.error('getContaminationLevel error:', e); return 0 } } function getContaminationStage(contamination) { if (contamination >= 0.9) return 3; if (contamination >= 0.6) return 2; if (contamination >= 0.3) return 1; return 0 } async function getContaminationDirection(memoryId) { try { const result = await networkService.getPlaysMismatchTypes(memoryId); let plays = []; if (result.ok) { plays = result.data || [] } if (plays.length === 0 && window._simulatedPlaysMap && window._simulatedPlaysMap[memoryId]) { plays = window._simulatedPlaysMap[memoryId]; console.log('[Contamination Direction] Using simulated plays:', plays.length) } if (plays.length === 0) { console.log('=== Contamination Direction ==='); console.log('No plays data, using default'); return 'default' } const counts = { emotion_mismatch: 0, target_displacement: 0, attribution_mismatch: 0, void_mismatch: 0 }; plays.forEach(p => { if (p.mismatch_type && counts[p.mismatch_type] !== undefined) { counts[p.mismatch_type]++ } }); const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]; console.log('=== Contamination Direction ==='); console.log('Mismatch stats:', counts); console.log('Dominant type:', dominant[0], `(${dominant[1]}회)`); return dominant[1] > 0 ? dominant[0] : 'default' } catch (e) { console.error('getContaminationDirection error:', e); return 'default' } } async function getContaminatedText(scene, stage, memoryId, direction = 'default') { if (stage === 0) return scene.text; if (stage === 3) { const style = scene.stage3_style || 'Glitch'; const baseText = scene.text_stage_2 || scene.text_stage_1 || scene.text; return (typeof window.TEM_Contamination !== 'undefined' && window.TEM_Contamination.applyStage3) ? window.TEM_Contamination.applyStage3(baseText, style) : baseText } const stageKey = `text_stage_${stage}_${direction}`; const baseStageKey = `text_stage_${stage}`; if (scene[stageKey]) { console.log(`Stage ${stage} (${direction}) 캐시 사용`); return scene[stageKey] } if (direction !== 'default' && scene[baseStageKey]) { console.log(`Stage ${stage} (base) 캐시 사용`); return scene[baseStageKey] } console.log(`Stage ${stage} (${direction}) AI 생성 중...`); const contaminatedText = await generateContaminatedText(scene.text, stage, direction); if (contaminatedText && scene.id && contaminatedText !== scene.text) { try { const result = await networkService.updateScene(scene.id, { [stageKey]: contaminatedText }); if (result.ok) { console.log(`Stage ${stage} (${direction}) 캐시 저장 완료`) } else { console.warn('Cache save failed (optional):', result.error) } } catch (e) { console.warn('Cache save error (ignored):', e) } } return contaminatedText || scene.text } async function generateContaminatedText(originalText, stage, direction = 'default') { try { const result = await networkService.invokeFunction('contaminate-text', { text: originalText, stage: stage, direction: direction }); if (!result.ok) { console.warn('Contamination text service unavailable, using original:', result.error?.message || result.error); return originalText } const stageField = `text_stage_${stage}`; if (result.data && (result.data[stageField] || result.data.contaminatedText)) { return result.data[stageField] || result.data.contaminatedText } return originalText } catch (e) { console.warn('Contamination text error, using original:', e?.message || e); return originalText } } async function loadSceneWithContamination(scene, memoryId) { const contamination = await getContaminationLevel(memoryId); const stage = getContaminationStage(contamination); const direction = await getContaminationDirection(memoryId); console.log('=== Applying Contamination ==='); console.log('Contamination:', contamination); console.log('Stage:', stage); console.log('Direction:', direction); const displayText = await getContaminatedText(scene, stage, memoryId, direction); return { ...scene, displayText, contaminationStage: stage, contaminationDirection: direction } }
function saveSessionRecord() { const state = appStore.getState(); if (!state.isLoggedIn || !state.currentUser) return; const user = state.currentUser; if (!user.sessionHistory) user.sessionHistory = []; const sessionRecord = { id: Date.now(), date: new Date().toLocaleString('en-US'), role: state.currentRole || '—', memoryFate: window.selectedMemoryFate || '—', alignment: state.currentAlignment.toFixed(2), scenes: state.liveSceneNum || state.currentScene + 1, fragments: state.liveFragments || 0, matches: state.liveMatches || 0 }; user.sessionHistory.unshift(sessionRecord); if (user.sessionHistory.length > 50) user.sessionHistory = user.sessionHistory.slice(0, 50); appStore.setState({ currentUser: user }) }
async function loadMypageDataFromDB() { const state = appStore.getState(); if (!state.currentUser?.id) { renderSessionHistoryEmpty(); renderMyMemoriesEmpty(); return } try { const [sessionsResult, memoriesResult, statsResult] = await Promise.all([loadSessionHistoryFromDB(), loadMyMemoriesFromDB(), loadUserStatsFromDB()]); renderSessionHistoryList(sessionsResult); renderMyMemoriesList(memoriesResult); updateMypageStats(statsResult); await renderReceivedNotes() } catch (e) { console.error('loadMypageDataFromDB error:', e); renderSessionHistoryEmpty(); renderMyMemoriesEmpty() } }
async function loadSessionHistoryFromDB() { const state = appStore.getState(); if (!state.currentUser?.id) return []; try { const result = await networkService.getUserSessionHistory(state.currentUser.id, 50); if (!result.ok) return []; return result.data || [] } catch (e) { console.error('loadSessionHistoryFromDB error:', e); return [] } }
async function loadMyMemoriesFromDB() {
    const state = appStore.getState();
    if (!state.currentUser?.id) return [];
    const userId = state.currentUser.id;
    try {
        const client = networkService._getClient ? networkService._getClient() : null;
        const results = await Promise.allSettled([
            // 1) live_sessions 경로 (라이브 기록)
            (async () => {
                const sessionIdsResult = await networkService.getUserSessionIds(userId);
                if (sessionIdsResult.ok && sessionIdsResult.data && sessionIdsResult.data.length > 0) {
                    const ids = sessionIdsResult.data.map(s => s.id);
                    const memoriesResult = await networkService.getMemoriesBySessionIds(ids, 50);
                    return (memoriesResult.ok && memoriesResult.data) ? memoriesResult.data : [];
                }
                return [];
            })(),
            // 2) curator_id 경로 (Record/고백으로 생성한 기억)
            (async () => {
                if (!client) return [];
                const { data, error } = await client
                    .from('memories')
                    .select('*')
                    .eq('curator_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(50);
                return (!error && data) ? data : [];
            })(),
        ]);
        const liveMemories = results[0].status === 'fulfilled' ? results[0].value : [];
        const curatedMemories = results[1].status === 'fulfilled' ? results[1].value : [];
        // 중복 제거 (id 기준)
        const seen = new Set();
        const merged = [];
        for (const m of [...liveMemories, ...curatedMemories]) {
            if (m?.id && !seen.has(m.id)) { seen.add(m.id); merged.push(m); }
        }
        return merged;
    } catch (e) {
        console.error('loadMyMemoriesFromDB error:', e);
        return [];
    }
}
async function loadUserStatsFromDB() {
    const state = appStore.getState();
    if (!state.currentUser?.id) return { sessions: 0, memories: 0, interpretations: 0 };
    const userId = state.currentUser.id;
    const client = networkService._getClient ? networkService._getClient() : null;
    try {
        const [sessionsResult, playsCountResult, curatedMemoriesResult] = await Promise.allSettled([
            networkService.getUserSessionIds(userId),
            // plays 테이블에서 user_id 기준 플레이 횟수
            (async () => {
                if (!client) return 0;
                const { count, error } = await client
                    .from('plays')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', userId);
                return (!error && count != null) ? count : 0;
            })(),
            // curator_id 기준 내가 만든 기억 수
            (async () => {
                if (!client) return 0;
                const { count, error } = await client
                    .from('memories')
                    .select('id', { count: 'exact', head: true })
                    .eq('curator_id', userId);
                return (!error && count != null) ? count : 0;
            })(),
        ]);
        const sessionIds = (sessionsResult.status === 'fulfilled' && sessionsResult.value.ok && sessionsResult.value.data)
            ? sessionsResult.value.data.map(s => s.id) : [];
        const playsCount = playsCountResult.status === 'fulfilled' ? playsCountResult.value : 0;
        const curatedCount = curatedMemoriesResult.status === 'fulfilled' ? curatedMemoriesResult.value : 0;
        let liveMemoriesCount = 0;
        if (sessionIds.length > 0) {
            const memoriesResult = await networkService.getMemoryIdsBySessionIds(sessionIds);
            liveMemoriesCount = (memoriesResult.ok && memoriesResult.data) ? memoriesResult.data.length : 0;
        }
        return {
            sessions: sessionIds.length,
            memories: Math.max(liveMemoriesCount, curatedCount),
            interpretations: playsCount,
        };
    } catch (e) {
        console.error('loadUserStatsFromDB error:', e);
        return { sessions: 0, memories: 0, interpretations: 0 };
    }
}
function renderSessionHistoryEmpty() { const listEl = document.getElementById('sessionHistoryList'); if (listEl) listEl.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">No saved sessions.</div>' }
function renderMyMemoriesEmpty() { const listEl = document.getElementById('myMemoriesList'); if (listEl) listEl.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">No shared memories yet.</div>' }
function renderSessionHistoryList(sessions) { const listEl = document.getElementById('sessionHistoryList'); if (!listEl) { return } if (!sessions || sessions.length === 0) { renderSessionHistoryEmpty(); return } listEl.innerHTML = ''; sessions.forEach(session => { const sessionItem = document.createElement('div'); sessionItem.style.padding = '.8rem'; sessionItem.style.marginBottom = '.5rem'; sessionItem.style.background = 'var(--bg-surface)'; sessionItem.style.border = '1px solid rgba(196,168,130,.1)'; sessionItem.style.borderRadius = '4px'; sessionItem.style.cursor = 'pointer'; sessionItem.style.transition = 'all .3s'; sessionItem.onmouseenter = () => { sessionItem.style.borderColor = 'var(--accent-memory)'; sessionItem.style.transform = 'translateX(4px)' }; sessionItem.onmouseleave = () => { sessionItem.style.borderColor = 'rgba(196,168,130,.1)'; sessionItem.style.transform = 'translateX(0)' }; const date = session.created_at ? new Date(session.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; const role = session.narrator_id === currentUser?.id ? '화자' : session.experiencer_id === currentUser?.id ? '체험자' : '—'; const status = session.ended_at ? 'Complete' : '진행중'; const alignment = session.alignment ? Math.round(session.alignment * 100) + '%' : '0%'; const fate = session.memory_fate === 'preserve' ? 'Preserve' : session.memory_fate === 'dilute' ? 'Natural Dissolution' : session.memory_fate === 'anonymous' ? 'Full Anonymity' : '—'; sessionItem.innerHTML = `<div style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${date}</strong> <span style="color:var(--accent-memory);font-size:.75rem">[${session.session_code || '—'}]</span></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">Role: ${role} | Status: ${status}<br>Alignment: ${alignment} | Fate: ${fate}</div>`; sessionItem.onclick = () => { showSessionDetail(session.id) }; listEl.appendChild(sessionItem) }) }
function renderMyMemoriesList(memories) { const listEl = document.getElementById('myMemoriesList'); if (!listEl) { return } if (!memories || memories.length === 0) { renderMyMemoriesEmpty(); return } listEl.innerHTML = ''; memories.forEach(memory => { const memoryItem = document.createElement('div'); memoryItem.style.padding = '.8rem'; memoryItem.style.marginBottom = '.5rem'; memoryItem.style.background = 'var(--bg-surface)'; memoryItem.style.border = '1px solid rgba(196,168,130,.1)'; memoryItem.style.borderRadius = '4px'; memoryItem.style.cursor = 'pointer'; const date = memory.created_at ? new Date(memory.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; const title = memory.title || memory.code || 'Untitled'; const dilution = memory.dilution !== undefined ? memory.dilution + '%' : '—'; const fate = memory.memory_fate === 'preserve' ? 'Preserve' : memory.memory_fate === 'dilute' ? 'Natural Dissolution' : memory.memory_fate === 'anonymous' ? 'Full Anonymity' : '—'; memoryItem.innerHTML = `<div style="font-size:.9rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${title}</strong></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">${date} | 희석도: ${dilution} | Fate: ${fate}</div>`; memoryItem.onclick = () => { closeMypage(); viewMemoryFromArchive(memory.id) }; listEl.appendChild(memoryItem) }) }
function updateMypageStats(stats) { document.getElementById('displayMemories').textContent = stats.memories || 0; document.getElementById('displayInterpretations').textContent = stats.interpretations || 0 }
// 트루ending note UI display
function showTrueEndingNoteUI(authorNote, authorId, memoryId) { const endContent = document.getElementById('endContent'); if (!endContent) return; const endButtons = endContent.querySelector('.end-buttons'); if (!endButtons) return; const existingNoteSection = endContent.querySelector('.note-section'); if (existingNoteSection) existingNoteSection.remove(); const noteSection = document.createElement('div'); noteSection.className = 'note-section'; noteSection.innerHTML = (authorNote ? `<div class="author-note-box"><p class="note-label">Note from the experiencer</p><p class="note-content">${authorNote}</p></div>` : '') + `<div class="reply-section"><p class="reply-label">You can leave a message for the memory author</p><textarea class="reply-input" id="replyInput" maxlength="100" placeholder="Please write within 100 characters..."></textarea><div class="reply-counter"><span id="replyCount">0</span>/100</div><div class="reply-buttons"><button class="reply-submit-btn" id="replySubmitBtn">Send Note</button><button class="reply-skip-btn" id="replySkipBtn">건너뛰기</button></div></div>`; endContent.insertBefore(noteSection, endButtons); const replyInput = document.getElementById('replyInput'); const replyCount = document.getElementById('replyCount'); if (replyInput && replyCount) { replyInput.addEventListener('input', () => { replyCount.textContent = replyInput.value.length }) } const replySubmitBtn = document.getElementById('replySubmitBtn'); if (replySubmitBtn) { replySubmitBtn.addEventListener('click', async () => { const message = replyInput.value.trim(); if (!message) { alert('메시지를 입력 please.'); return } const safetyResult = detectCrisis(message); if (safetyResult.level === 'high') { handleCrisis('high', replyInput); return } await sendNoteToAuthor(authorId, memoryId, message) }) } const replySkipBtn = document.getElementById('replySkipBtn'); if (replySkipBtn) { replySkipBtn.addEventListener('click', () => { noteSection.remove() }) } }
// memory 남긴 사람 게 note 전송
async function sendNoteToAuthor(authorId, memoryId, message) { try { const client = networkService.getClient(); if (!client) { alert('Supabase client not initialized.'); return } const { data: { user } } = await client.auth.getUser(); if (!user) { alert('Login required to send a note.'); return } const result = await networkService.sendNote({ memory_id: memoryId, sender_id: user.id, recipient_id: authorId, message: message, note_type: 'player_to_author' }); if (!result.ok) { console.error('쪽지 전송 error:', result.error); alert('Note send failed.'); return } const noteSection = document.querySelector('.note-section'); if (noteSection) { noteSection.innerHTML = '<div class="note-sent-message"><p>Delivered to the memory author.</p></div>' } console.log('=== Note sent ===') } catch (e) { console.error('sendNoteToAuthor error:', e); alert('An error occurred while sending the note.') } }
// 받 note load
async function loadReceivedNotes() { try { const client = networkService.getClient(); if (!client) return []; const { data: { user } } = await client.auth.getUser(); if (!user) return []; const result = await networkService.loadReceivedNotes(user.id); if (!result.ok) { console.error('쪽지 로드 error:', result.error); return [] } return result.data || [] } catch (e) { console.error('loadReceivedNotes error:', e); return [] } }
// 받 note rendering
async function renderReceivedNotes() { const notes = await loadReceivedNotes(); const container = document.getElementById('mypageNotesList'); if (!container) return; if (notes.length === 0) { container.innerHTML = '<p class="no-notes" style="color:var(--text-ghost);font-style:italic;text-align:center;padding:1rem">No notes received.</p>'; return } container.innerHTML = notes.map(note => { const memoryTitle = note.memories?.title || 'Unknown'; const date = new Date(note.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); const unreadClass = note.is_read ? 'read' : 'unread'; const unreadBadge = note.is_read ? '' : '<span class="unread-badge" style="display:inline-block;padding:.2rem .5rem;background:rgba(212,175,55,.2);border:1px solid rgba(212,175,55,.4);color:#d4af37;font-size:.7rem;letter-spacing:.1em;margin-left:.5rem">NEW</span>'; return `<div class="note-card ${unreadClass}" data-note-id="${note.id}" style="padding:.8rem;margin-bottom:.5rem;background:var(--bg-surface);border:1px solid rgba(196,168,130,.1);border-radius:4px;cursor:pointer;transition:all .3s"><p class="note-memory" style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>Memory: ${memoryTitle}</strong>${unreadBadge}</p><p class="note-message" style="font-size:.9rem;color:var(--text-primary);line-height:1.6;margin-bottom:.5rem">${note.message}</p><p class="note-date" style="font-size:.75rem;color:var(--text-muted)">${date}</p></div>` }).join(''); container.querySelectorAll('.note-card.unread').forEach(card => { card.addEventListener('click', async () => { const noteId = card.dataset.noteId; try { const result = await networkService.markNoteAsRead(noteId); if (result.ok) { card.classList.remove('unread'); card.classList.add('read'); const badge = card.querySelector('.unread-badge'); if (badge) badge.remove() } } catch (e) { console.error('쪽지 읽음 처리 error:', e) } }) }) }
function viewMemoryFromArchive(memoryId) {
    if (!memoryId) return;
    const lang = /[가-힣]/.test(String(memoryId)) ? 'ko' : 'en';
    const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const base = isLocal ? 'play-test.html' : '/play';
    window.location.href = `${base}?memory=${encodeURIComponent(memoryId)}&lang=${lang}`;
}
async function showSessionDetail(sessionId) { const modal = document.getElementById('sessionDetailModal'); const body = document.getElementById('sessionDetailBody'); if (!modal || !body) { return } modal.classList.add('active'); body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading...</div>'; try { const sessionResult = await networkService.getSessionById(sessionId); if (!sessionResult.ok) throw sessionResult.error; const sessionData = sessionResult.data; const scenesResult = await networkService.getLiveScenesBySessionId(sessionId); if (!scenesResult.ok) throw scenesResult.error; const scenesData = scenesResult.data; const date = sessionData.created_at ? new Date(sessionData.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; const endDate = sessionData.ended_at ? new Date(sessionData.ended_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; const role = sessionData.narrator_id === currentUser?.id ? '화자' : sessionData.experiencer_id === currentUser?.id ? '체험자' : '—'; const status = sessionData.ended_at ? 'Complete' : '진행중'; const alignment = sessionData.alignment ? Math.round(sessionData.alignment * 100) + '%' : '0%'; const fate = sessionData.memory_fate === 'preserve' ? 'Preserve' : sessionData.memory_fate === 'dilute' ? 'Natural Dissolution' : sessionData.memory_fate === 'anonymous' ? 'Full Anonymity' : '미정'; document.getElementById('sessionDetailTitle').textContent = sessionData.session_code || 'Session Info'; let scenesHtml = ''; if (scenesData && scenesData.length > 0) { scenesHtml = '<div class="session-detail-scenes"><h3 style="font-family:\'Cormorant Garamond\',serif;font-size:1.3rem;color:var(--accent-memory);margin-bottom:1rem;letter-spacing:.1em">Scene 목록</h3>'; scenesData.forEach((scene, index) => { const sceneText = scene.text || '[텍스트 없음]'; const sceneType = scene.scene_type || 'normal'; const voidInfo = scene.void_info; scenesHtml += `<div class="session-detail-scene-item"><div class="session-detail-scene-header">Scene ${index + 1}${sceneType === 'void' ? ' (void in memory)' : ''}</div><div class="session-detail-scene-text">${sceneText}</div>${voidInfo && voidInfo.reason ? `<div style="font-size:.85rem;color:var(--text-muted);font-style:italic;margin-top:.5rem">공백 이유: ${voidInfo.reason}</div>` : ''}</div>` }); scenesHtml += '</div>' } else { scenesHtml = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-style:italic">No saved scenes.</div>' } body.innerHTML = `<div class="session-detail-info-item"><div class="session-detail-info-label">Session Code</div><div class="session-detail-info-value">${sessionData.session_code || '—'}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">Started</div><div class="session-detail-info-value">${date}</div></div>${sessionData.ended_at ? `<div class="session-detail-info-item"><div class="session-detail-info-label">Ended</div><div class="session-detail-info-value">${endDate}</div></div>` : ''}<div class="session-detail-info-item"><div class="session-detail-info-label">Role</div><div class="session-detail-info-value">${role}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">Status</div><div class="session-detail-info-value">${status}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">Alignment</div><div class="session-detail-info-value">${alignment}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">Fate</div><div class="session-detail-info-value">${fate}</div></div>${scenesHtml}` } catch (e) { console.error('showSessionDetail error:', e); body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Error loading session info.</div>'; showNotification('세션 정보를 불러오는 중 An error occurred') } }
function closeSessionDetail() { const modal = document.getElementById('sessionDetailModal'); if (modal) { modal.classList.remove('active') } }
function renderSessionHistory_DEPRECATED() { const listEl = document.getElementById('sessionHistoryList'); if (!listEl || !currentUser || !currentUser.sessionHistory || currentUser.sessionHistory.length === 0) { if (listEl) listEl.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">No saved sessions.</div>'; return } listEl.innerHTML = ''; currentUser.sessionHistory.forEach(session => { const sessionItem = document.createElement('div'); sessionItem.style.padding = '.8rem'; sessionItem.style.marginBottom = '.5rem'; sessionItem.style.background = 'var(--bg-surface)'; sessionItem.style.border = '1px solid rgba(196,168,130,.1)'; sessionItem.innerHTML = `<div style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${session.date}</strong></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">Role: ${session.role} | Fate: ${session.memoryFate === 'preserve' ? 'Preserve' : session.memoryFate === 'dilute' ? 'Natural Dissolution' : session.memoryFate === 'anonymous' ? 'Full Anonymity' : '—'}<br>Alignment: ${session.alignment} | 장면: ${session.scenes} | 조각: ${session.fragments} | 일치: ${session.matches}</div>`; listEl.appendChild(sessionItem) }) }
function showNpcDialogue(text, duration = 4000) { const dialogue = document.getElementById('npcDialogue'); if (dialogue) { document.getElementById('npcText').textContent = text; dialogue.classList.add('visible'); setTimeout(() => { dialogue.classList.remove('visible') }, duration) } }
function escapeHtml(text) { if (!text) return '—'; const div = document.createElement('div'); div.textContent = text; return div.innerHTML } async function showOriginalMemory(memoryId) { try { console.log('=== Viewing Original ==='); console.log('Memory ID:', memoryId); const scenesResult = await networkService.getScenesByMemoryId(memoryId); if (!scenesResult.ok) { console.error('Error loading original memory:', scenesResult.error); alert('Error loading original memory.'); return } const scenes = scenesResult.data || []; console.log('Scenes:', scenes.length); const modal = document.createElement('div'); modal.className = 'original-memory-modal'; modal.innerHTML = `<div class="original-memory-content"><h2>Original Memory</h2><p class="original-note">This is the original memory left by the author.</p><div class="original-scenes">${scenes.map((scene, i) => `<div class="original-scene"><span class="scene-number">${i + 1}</span><p class="scene-text">${escapeHtml(scene.text)}</p></div>`).join('')}</div><button class="close-original-btn" onclick="this.closest('.original-memory-modal').remove()">Close</button></div>`; document.body.appendChild(modal); modal.addEventListener('click', (e) => { if (e.target === modal) { modal.remove() } }) } catch (e) { console.error('showOriginalMemory error:', e); alert('Error loading original memory.') } }
function showNotification(text) { const notification = document.getElementById('notification'); if (notification) { notification.textContent = text; notification.classList.add('visible'); setTimeout(() => { notification.classList.remove('visible') }, 3000) } }
// event 바인딩 bindEvents.js move됨
// opening screen event 바인딩 bindEvents.js move됨
async function checkSession() {
    supabaseClient = getSupabaseClient();
    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        appStore.setState({
            isLoggedIn: true,
            currentUser: {
                id: session.user.id,
                username: session.user.user_metadata?.username || session.user.email.split('@')[0],
                email: session.user.email,
                joinDate: new Date(session.user.created_at).toLocaleDateString('en-US'),
                liveSessions: 0,
                memories: 0,
                interpretations: 0,
                visitedMemories: [],
                sessionHistory: []
            }
        });
    }
}
(async function () { await checkSession() })();

// ───── 3D Carousel Navigation ─────
let carouselCurrentIndex = 0;
const carouselItems = [
    { action: 'enterPlayIntro', label: 'PLAY' },
    { action: 'enterArchive', label: 'ARCHIVE' },
    { action: 'showConfessionHub', label: 'RECORD' },
    { action: 'openMypage', label: 'MYPAGE' },
    { action: 'openPortfolio', label: 'PORTFOLIO' }
];

function init3DCarousel() {
    const wrapper = document.getElementById('carousel3DWrapper');
    const items = wrapper?.querySelectorAll('.carousel-item');
    const prevBtn = document.getElementById('carouselPrev');
    const nextBtn = document.getElementById('carouselNext');

    if (!wrapper || !items || items.length === 0) return;

 // 초기 position config
    updateCarouselPosition();

 // 네비게 션 button event
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateCarousel(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateCarousel(1));
    }

 // 키보드 네비게 션
    document.addEventListener('keydown', (e) => {
        const introScreen = document.getElementById('introScreen');
        if (!introScreen || introScreen.classList.contains('hidden')) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateCarousel(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateCarousel(1);
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateCurrentCarouselItem();
        }
    });

 // 아 템 클릭 event
    items.forEach((item, index) => {
        item.addEventListener('click', () => {
            if (index === carouselCurrentIndex) {
                activateCurrentCarouselItem();
            } else {
                const diff = index - carouselCurrentIndex;
                navigateCarousel(diff > 0 ? 1 : -1, Math.abs(diff));
            }
        });
    });

 // 양옆 아 템 클릭으 move possible
    items.forEach((item) => {
        item.addEventListener('click', (e) => {
            const index = parseInt(item.dataset.index);
            if (index !== carouselCurrentIndex) {
                const diff = index - carouselCurrentIndex;
                navigateCarousel(diff > 0 ? 1 : -1, Math.abs(diff));
            }
        });
    });
}

function navigateCarousel(direction, steps = 1) {
    const totalItems = carouselItems.length;
    carouselCurrentIndex = (carouselCurrentIndex + direction * steps + totalItems) % totalItems;
    updateCarouselPosition();
}

function updateCarouselPosition() {
    const wrapper = document.getElementById('carousel3DWrapper');
    const items = wrapper?.querySelectorAll('.carousel-item');
    if (!wrapper || !items) return;

    const totalItems = items.length;

    items.forEach((item, index) => {
        item.classList.remove('active', 'prev-1', 'prev-2', 'next-1', 'next-2', 'hidden');

        const diff = index - carouselCurrentIndex;
        const absDiff = Math.abs(diff);

        if (diff === 0) {
            item.classList.add('active');
        } else if (diff === -1 || (diff === -(totalItems - 1) && totalItems > 2)) {
            item.classList.add('prev-1');
        } else if (diff === -2 || (diff === -(totalItems - 2) && totalItems > 3)) {
            item.classList.add('prev-2');
        } else if (diff === 1 || (diff === (totalItems - 1) && totalItems > 2)) {
            item.classList.add('next-1');
        } else if (diff === 2 || (diff === (totalItems - 2) && totalItems > 3)) {
            item.classList.add('next-2');
        } else {
            item.classList.add('hidden');
        }
    });
}

function activateCurrentCarouselItem() {
    const currentItem = carouselItems[carouselCurrentIndex];
    if (!currentItem) return;

    const action = currentItem.action;

 // 액션 execute
    switch (action) {
        case 'enterArchive':
            if (typeof enterArchive === 'function') {
                enterArchive();
            }
            break;
        case 'enterPlayIntro':
            if (typeof enterPlayIntro === 'function') {
                enterPlayIntro();
            }
            break;
        case 'showConfessionHub':
            if (typeof showConfessionHub === 'function') {
                showConfessionHub();
            }
            break;
        case 'openMypage':
            if (typeof openMypage === 'function') {
                openMypage();
            }
            break;
        case 'openPortfolio':
            if (typeof openPortfolio === 'function') {
                openPortfolio();
            }
            break;
    }
}

// global 스코프 function 노출 (onclick property 서 위해)
window.openPortfolio = openPortfolio;
window.openAbout = openAbout;
window.openConcept = openConcept;
window.openMypage = openMypage;
window.enterPlayIntro = enterPlayIntro;
window.showModeSelection = showModeSelection;
window.enterArchive = enterArchive;
window.handleSocialLogin = handleSocialLogin;
window.handleLogin = handleLogin;
window.closeLogin = closeLogin;
window.switchToSignup = switchToSignup;
window.handleSignup = handleSignup;
window.closeSignup = closeSignup;
window.switchToLogin = switchToLogin;
window.handleLogout = handleLogout;
window.closeMypage = closeMypage;
window.selectMatching = selectMatching;
window.backToIntro = backToIntro;
window.selectRole = selectRole;
window.copySessionCode = copySessionCode;
window.joinSession = joinSession;
window.filterByCategory = filterByCategory;
window.sortMemories = sortMemories;
window.backToMatchingSelection = backToMatchingSelection;
window.backToModeSelection = backToModeSelection;
window.exitLive = exitLive;
// Expose shared functions for app/live.js (temporary, phase 3 cleanup)
window.showNotification = showNotification;
window.showEndScreen = showEndScreen;
window.restart = restart;
window.stopAllAnimations = stopAllAnimations;
window.showNpcDialogue = showNpcDialogue;
window.updateUserStats = updateUserStats;
window.startLiveSession = startLiveSession;
window.updateLiveAlignment = updateLiveAlignment;
window.updateAlignmentWave = updateAlignmentWave;
window.proceedToNextSceneLive = proceedToNextSceneLive;
window.saveRitualScene = saveRitualScene;
window.startAlignmentWaveAnimation = function() {
    const narratorCanvas = document.getElementById('alignmentWaveCanvas');
    const experiencerCanvas = document.getElementById('expAlignmentWaveCanvas');
    const state = appStore.getState();
    const narratorWaveStyle = window.narratorEmotionVector ? emotionVectorToWaveStyle(window.narratorEmotionVector) : null;
    const experiencerWaveStyle = window.experiencerEmotionVector ? emotionVectorToWaveStyle(window.experiencerEmotionVector) : null;
    visualizer.startAlignmentWaveAnimation(narratorCanvas, experiencerCanvas, {
        alignment: state.currentAlignment,
        narratorEmotionVector: window.narratorEmotionVector,
        experiencerEmotionVector: window.experiencerEmotionVector,
        narratorWaveStyle, experiencerWaveStyle,
        onUpdateAlignmentDisplay: (alignmentValue) => {
            const alignmentPercent = Math.round(alignmentValue * 100);
            const percentageEl = document.getElementById('alignmentPercentage');
            if (percentageEl) percentageEl.textContent = String(alignmentPercent).padStart(2, '0') + '%';
            const expPercentageEl = document.getElementById('expAlignmentPercentage');
            if (expPercentageEl) expPercentageEl.textContent = String(alignmentPercent).padStart(2, '0') + '%';
        }
    });
};
window.switchGeneratedTab = switchGeneratedTab;
window.toggleEditMode = toggleEditMode;
window.handleUnifiedSubmit = handleUnifiedSubmit;
window.addChatMessageWithConfirm = addChatMessageWithConfirm;
window.switchGeneratedTab = switchGeneratedTab;
window.toggleRecording = toggleRecording;
window.switchToTextInput = switchToTextInput;
window.sendExpChatMessage = sendExpChatMessage;
window.toggleExpRecording = toggleExpRecording;
window.switchExpToTextInput = switchExpToTextInput;
window.backToList = backToList;
window.saveMemory = saveMemory;
window.goToIntro = goToIntro;
// window.submitEmotion expInterview 모듈 대체됨
window.selectMemoryFate = selectMemoryFate;
window.closeSessionDetail = closeSessionDetail;
window.sendChatMessage = sendChatMessage;
window.selectMemory = selectMemory;
window.handleConfirm = handleConfirm;
window.handleExpConfirm = handleExpConfirm;
window.filterMemories = filterMemories;

function initMainMenu() {
  const wrap = document.querySelector('.main-menu-wrap');
  if (!wrap) return;
  const menuItems = wrap.querySelectorAll('.menu-item');
  const descriptionArea = document.getElementById('mainMenuDescription');
  const bokehFlare = document.getElementById('mainBokehFlare');
  let activeId = 'play';
  let hoveredId = null;

  function setActive(id) {
    activeId = id;
    menuItems.forEach((el) => {
      const mid = el.dataset.menuId;
      const isActive = mid === activeId;
      const isHovered = mid === hoveredId;
      el.classList.toggle('active', isActive || isHovered);
      el.classList.toggle('inactive', !isActive && !isHovered);
      el.classList.toggle('hovered', isHovered);
    });
    if (descriptionArea) {
      const showId = hoveredId || activeId;
      descriptionArea.querySelectorAll('.description-text').forEach((el) => {
        el.classList.toggle('active', el.dataset.for === showId);
      });
    }
    updateBokeh();
  }

  function updateBokeh() {
    if (!bokehFlare) return;
    const targetId = hoveredId || activeId;
    const target = wrap.querySelector(`.menu-item[data-menu-id="${targetId}"]`);
    if (target) {
      const rect = target.getBoundingClientRect();
      bokehFlare.style.top = (rect.top + rect.height / 2) + 'px';
      bokehFlare.classList.add('active');
    } else {
      bokehFlare.classList.remove('active');
    }
  }

  menuItems.forEach((el) => {
    const id = el.dataset.menuId;
    const actionName = el.dataset.action;
    el.addEventListener('mouseenter', () => {
      hoveredId = id;
      setActive(activeId);
    });
    el.addEventListener('mouseleave', () => {
      hoveredId = null;
      setActive(activeId);
    });
    el.addEventListener('click', () => {
      setActive(id);
      const fn = typeof window[actionName] === 'function' ? window[actionName] : null;
      if (fn) fn();
    });
  });

  updateBokeh();
  window.addEventListener('resize', updateBokeh);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMainMenu);
} else {
  initMainMenu();
}

let comparisonScenes = [];
let comparisonCurrentIndex = 0;
async function calculateAverageAlignment() { return { averageAlignment: appStore.getState().currentAlignment || 0, isTrueEnding: (appStore.getState().currentAlignment || 0) >= 0.65 }; }
async function showComparisonView() {
    try {
        const currentData = window.currentStoryData || storyData;
        if (!currentData || !currentData.scenes) {
            console.error('비교 화면: Scene 데이터가 not found');
            return;
        }
        const state = appStore.getState();
        const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);
        if (!memoryId) {
            console.error('비교 화면: memory_id를 not found');
            return;
        }
 // expInterview 시 모든 scene 서 wave 측정되므 , 모든 scene check
        const scenesWithEmotions = currentData.scenes.filter((scene, index) =>
            window.archiveUserEmotions && window.archiveUserEmotions[index]
        );
        if (scenesWithEmotions.length === 0) {
            console.log('비교 화면: 비교할 장면이 not found');
            const alignmentResult = await calculateAverageAlignment();
            showEndScreen(alignmentResult);
            return;
        }
        comparisonScenes = [];
        supabaseClient = getSupabaseClient();
        for (let i = 0; i < currentData.scenes.length; i++) {
            const scene = currentData.scenes[i];
 // expInterview 시 모든 scene 서 wave 측정되므 , 모든 scene check
            const userEmotionData = window.archiveUserEmotions && window.archiveUserEmotions[i] ? window.archiveUserEmotions[i] : null;
            if (userEmotionData) {
                let playData = null;
                let sceneAlignment = null;
                
 // expInterview collect 최신 alignment 우선 
                if (window.archiveSceneAlignments && window.archiveSceneAlignments[i] !== undefined) {
                    sceneAlignment = window.archiveSceneAlignments[i];
                    console.log(`[비교 화면] Scene ${i}: expInterview Alignment 사용:`, sceneAlignment);
                }
                
 // DB 서 plays data query (fallback용, expInterview data 없 때 )
                if (supabaseClient && scene.id) {
                    const { data: playsData, error: playsError } = await supabaseClient
                        .from('plays')
                        .select('user_emotion, user_reason, alignment')
                        .eq('scene_id', scene.id)
                        .eq('memory_id', memoryId)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                    if (playsError) {
                        console.warn(`[비교 화면] Scene ${scene.id} plays 조회 Failed:`, playsError);
                    }
                    if (playsData) {
                        playData = playsData;
 // expInterview alignment 없 때 DB alignment 
                        if (sceneAlignment === null) {
                            sceneAlignment = playsData.alignment;
                        }
                    }
                }
                
                if (!playData && !userEmotionData) {
                    console.log(`[비교 화면] Scene ${i} (${scene.id}): plays 데이터와 archiveUserEmotions 모두 없음, 스킵`);
                    continue;
                }
 // expInterview collect 최신 data 우선 
                let userEmotion = (userEmotionData ? userEmotionData.emotion : null) || playData?.user_emotion;
                let userReason = (userEmotionData ? userEmotionData.reason : null) || playData?.user_reason;
                let originalEmotion = scene.originalEmotion || scene.original_emotion;
                if (typeof userEmotion === 'string') {
                    try {
                        userEmotion = JSON.parse(userEmotion);
                    } catch (e) {
                        console.error(`[비교 화면] user_emotion 파싱 실패 (scene ${i}):`, e);
                    }
                }
                if (typeof originalEmotion === 'string') {
                    try {
                        originalEmotion = JSON.parse(originalEmotion);
                    } catch (e) {
                        console.error(`[비교 화면] originalEmotion 파싱 실패 (scene ${i}):`, e);
                    }
                }
                if (!userEmotion || !originalEmotion) {
                    console.warn(`[비교 화면] Scene ${i} (${scene.id}): 감정 벡터 누락`, {
                        hasUserEmotion: !!userEmotion,
                        hasOriginalEmotion: !!originalEmotion
                    });
                    continue;
                }
                console.log(`[비교 화면] Scene ${i} 데이터:`, {
                    sceneId: scene.id,
                    sceneType: scene.sceneType,
                    userEmotion: userEmotion,
                    originalEmotion: originalEmotion,
                    userEmotionType: typeof userEmotion,
                    originalEmotionType: typeof originalEmotion,
                    userEmotionKeys: userEmotion ? Object.keys(userEmotion) : null,
                    originalEmotionKeys: originalEmotion ? Object.keys(originalEmotion) : null
                });
                comparisonScenes.push({
                    scene: scene,
                    sceneIndex: i,
                    userEmotion: userEmotion,
                    userReason: userReason || '',
                    originalEmotion: originalEmotion,
                    originalReason: scene.originalReason || '',
                    alignment: sceneAlignment
                });
            }
        }
        if (comparisonScenes.length === 0) {
            console.log('비교 화면: 비교할 장면이 not found');
            const alignmentResult = await calculateAverageAlignment();
            showEndScreen(alignmentResult);
            return;
        }
        comparisonCurrentIndex = 0;
        const alignmentResult = await calculateAverageAlignment();
        window.archiveAlignmentResult = alignmentResult;
        const comparisonViewEl = document.getElementById('comparisonView');
        if (comparisonViewEl) {
            comparisonViewEl.style.display = 'flex';
            comparisonViewEl.style.zIndex = '2500';
        }
        renderComparisonView();
        setupComparisonSwipe();
 // sessionend button event listener add
        const endSessionBtn = comparisonViewEl.querySelector('.live-exit-btn');
        if (endSessionBtn) {
 // existing event remove 후 새 add
            endSessionBtn.replaceWith(endSessionBtn.cloneNode(true));
            const newEndSessionBtn = comparisonViewEl.querySelector('.live-exit-btn');
            newEndSessionBtn.addEventListener('click', async () => {
                console.log('[Ending] Session end button clicked');
                await endComparisonSession();
            });
            console.log('[Ending] Session end button event listener added');
        } else {
            console.warn('[Ending] Session end button not found');
        }
    } catch (e) {
        console.error('showComparisonView error:', e);
        showEndScreen();
    }
}
function renderComparisonView() {
    if (comparisonScenes.length === 0) return;
    const container = document.getElementById('comparisonScenesContainer');
    const dotsContainer = document.getElementById('comparisonDots');
    const counterEl = document.getElementById('comparisonSceneCounter');
    if (!container || !dotsContainer || !counterEl) return;
    container.innerHTML = '';
    dotsContainer.innerHTML = '';
    comparisonScenes.forEach((item, index) => {
        let alignment = item.alignment;
        if (alignment === null || alignment === undefined) {
            if (item.userEmotion && item.originalEmotion) {
                const er = byeoriEngine.calculateStep(
                    {
                        userVector: { base: item.userEmotion },
                        originalVector: { base: item.originalEmotion },
                        userTrajectory: [],
                        originalTrajectory: [],
                        sceneScores: []
                    }, {});
                alignment = er.alignment_score;
            } else { alignment = 0; }
        }
        let bucket = 'LOW';
        if (alignment >= 0.55) bucket = 'HIGH';
        else if (alignment >= 0.3) bucket = 'MID';
        item._bucket = bucket;
        item._alignment = alignment;

        const slide = document.createElement('div');
        slide.className = 'comparison-scene-slide';
        slide.innerHTML = `
            <div class="comparison-scene-text">${item.scene.text || ''}</div>
            <div class="comparison-waves-container">
                <div class="comparison-wave-item" style="width:100%">
                    <div class="comparison-wave-label user">Your Emotion</div>
                    <div class="comparison-wave-canvas-container">
                        <canvas class="comparison-wave-canvas" data-type="merged" data-index="${index}"></canvas>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(slide);
        const dot = document.createElement('div');
        dot.className = 'comparison-dot';
        if (index === 0) dot.classList.add('active');
        dot.onclick = () => navigateComparisonTo(index);
        dotsContainer.appendChild(dot);
    });
    counterEl.textContent = `${comparisonCurrentIndex + 1} / ${comparisonScenes.length}`;
    updateComparisonNavigation();

    const scenesWithWaveStyles = comparisonScenes.map(item => ({
        userEmotion: item.userEmotion,
        originalEmotion: item.originalEmotion,
        userWaveStyle: item.userEmotion ? emotionVectorToWaveStyle(item.userEmotion) : null,
        originalWaveStyle: item.originalEmotion ? emotionVectorToWaveStyle(item.originalEmotion) : null,
        bucket: item._bucket,
        alignment: item._alignment
    }));

    startBucketComparisonWaveAnimation(scenesWithWaveStyles);
    updateComparisonAlignment();
    updateComparisonAverageAlignment();
}
function updateComparisonAlignment() {
    if (comparisonScenes.length === 0 || comparisonCurrentIndex >= comparisonScenes.length) {
        console.warn('[updateComparisonAlignment] No comparison scenes');
        return;
    }
    const item = comparisonScenes[comparisonCurrentIndex];
    console.log(`[updateComparisonAlignment] Scene ${comparisonCurrentIndex}:`, {
        hasAlignment: item.alignment !== null && item.alignment !== undefined,
        alignment: item.alignment,
        hasUserEmotion: !!item.userEmotion,
        hasOriginalEmotion: !!item.originalEmotion,
        userEmotion: item.userEmotion,
        originalEmotion: item.originalEmotion
    });
    let alignment = null;
    if (item.alignment !== null && item.alignment !== undefined) {
        alignment = item.alignment;
        console.log(`[updateComparisonAlignment] 저장된 Alignment 사용: ${alignment}`);
    } else if (item.userEmotion && item.originalEmotion) {
        console.log(`[updateComparisonAlignment] Alignment 계산 시작...`);
        let anchorEmotions = item.scene?.anchor_emotions || null;
        if (anchorEmotions && typeof anchorEmotions === 'string') { try { anchorEmotions = JSON.parse(anchorEmotions) } catch (e) { anchorEmotions = null } } if (anchorEmotions && !Array.isArray(anchorEmotions)) { anchorEmotions = null }
        const engineResult = byeoriEngine.calculateStep({
            userVector: { base: item.userEmotion },
            originalVector: { base: item.originalEmotion },
            anchorEmotions: anchorEmotions,
            userTrajectory: [],
            originalTrajectory: [],
            sceneScores: []
        }, {});
        alignment = engineResult.alignment_score;
        console.log(`[updateComparisonAlignment] 계산된 Alignment: ${alignment}`);
    } else {
        console.warn(`[updateComparisonAlignment] Alignment를 계산할 수 not found:`, {
            hasUserEmotion: !!item.userEmotion,
            hasOriginalEmotion: !!item.originalEmotion
        });
    }
    if (alignment === null) {
        console.warn('[updateComparisonAlignment] Alignment가 null');
        return;
    }
    const alignmentValueEl = document.getElementById('comparisonAlignmentValue');
    const alignmentFillEl = document.getElementById('comparisonAlignmentFill');
    if (alignmentValueEl) {
        alignmentValueEl.textContent = alignment.toFixed(2);
        console.log(`[updateComparisonAlignment] Alignment 표시 update: ${alignment.toFixed(2)}`);
    }
    if (alignmentFillEl) {
        alignmentFillEl.style.width = (alignment * 100) + '%';
    }
}
function updateComparisonAverageAlignment() {
    const alignmentResult = window.archiveAlignmentResult;
    if (!alignmentResult) return;
    const averageValueEl = document.getElementById('comparisonAverageAlignmentValue');
    const averageFillEl = document.getElementById('comparisonAverageAlignmentFill');
    const trueEndingBadge = document.getElementById('comparisonTrueEndingBadge');
    if (averageValueEl) {
        averageValueEl.textContent = alignmentResult.averageAlignment.toFixed(2);
    }
    if (averageFillEl) {
        averageFillEl.style.width = (alignmentResult.averageAlignment * 100) + '%';
    }
    if (trueEndingBadge) {
        if (alignmentResult.isTrueEnding) {
            trueEndingBadge.style.display = 'inline-block';
        } else {
            trueEndingBadge.style.display = 'none';
        }
    }
}
function navigateComparison(direction) {
    const newIndex = comparisonCurrentIndex + direction;
    if (newIndex < 0 || newIndex >= comparisonScenes.length) return;
    comparisonCurrentIndex = newIndex;
    const container = document.getElementById('comparisonScenesContainer');
    if (container) {
        container.style.transform = `translateX(-${comparisonCurrentIndex * 100}%)`;
    }
    const dots = document.querySelectorAll('.comparison-dot');
    dots.forEach((dot, index) => {
        if (index === comparisonCurrentIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
    const counterEl = document.getElementById('comparisonSceneCounter');
    if (counterEl) {
        counterEl.textContent = `${comparisonCurrentIndex + 1} / ${comparisonScenes.length}`;
    }
    updateComparisonNavigation();
    updateComparisonAlignment();
}
function navigateComparisonTo(index) {
    if (index < 0 || index >= comparisonScenes.length) return;
    comparisonCurrentIndex = index;
    const container = document.getElementById('comparisonScenesContainer');
    if (container) {
        container.style.transform = `translateX(-${comparisonCurrentIndex * 100}%)`;
    }
    const dots = document.querySelectorAll('.comparison-dot');
    dots.forEach((dot, idx) => {
        if (idx === comparisonCurrentIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
    const counterEl = document.getElementById('comparisonSceneCounter');
    if (counterEl) {
        counterEl.textContent = `${comparisonCurrentIndex + 1} / ${comparisonScenes.length}`;
    }
    updateComparisonNavigation();
    updateComparisonAlignment();
}
function updateComparisonNavigation() {
    const prevBtn = document.getElementById('comparisonPrevBtn');
    const nextBtn = document.getElementById('comparisonNextBtn');
    if (prevBtn) {
        prevBtn.disabled = comparisonCurrentIndex === 0;
    }
    if (nextBtn) {
        nextBtn.disabled = comparisonCurrentIndex === comparisonScenes.length - 1;
    }
}
function setupComparisonSwipe() {
    const swiper = document.getElementById('comparisonSwiper');
    if (!swiper) return;
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    swiper.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
    });
    swiper.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
    });
    swiper.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        const diff = startX - currentX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                navigateComparison(1);
            } else {
                navigateComparison(-1);
            }
        }
    });
}
let _bucketCompAnimId = null;
let _bucketCompTime = 0;
function _pnoise(x, y, z) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + (z || 0) * 37.719) * 43758.5453;
    return n - Math.floor(n);
}
function stopBucketComparisonWaveAnimation() {
    if (_bucketCompAnimId) { cancelAnimationFrame(_bucketCompAnimId); _bucketCompAnimId = null; }
}
function startBucketComparisonWaveAnimation(scenesData) {
    stopBucketComparisonWaveAnimation();
    _bucketCompTime = 0;
    const initializedCanvases = new Map();
    function initCanvas(c) {
        if (!c || c.offsetWidth === 0 || c.offsetHeight === 0) return false;
        if (initializedCanvases.has(c)) return true;
        const ctx = c.getContext('2d');
        c.width = c.offsetWidth * 2;
        c.height = c.offsetHeight * 2;
        ctx.scale(2, 2);
        initializedCanvases.set(c, true);
        return true;
    }
    function drawWave(ctx, w, h, ws, tOff, alpha) {
        const cy = h / 2;
        const t = _bucketCompTime + tOff;
        const pts = [];
        const seg = 120;
        for (let i = 0; i <= seg; i++) {
            const x = (i / seg) * w;
            const nx = x / w;
            let y = Math.sin(x * ws.frequency + t * ws.speed) * ws.amplitude;
            y += Math.sin(x * ws.frequency * 2.3 + t * ws.speed * 0.7) * (ws.amplitude * 0.4);
            y += Math.sin(x * ws.frequency * 0.4 + t * ws.speed * 0.3) * (ws.amplitude * 0.6);
            y += (_pnoise(x * 0.01, t * 0.1, 0) - 0.5) * ws.chaos * 15;
            y *= Math.sin(nx * Math.PI);
            pts.push({ x, y: cy + y });
        }
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 2; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
        }
        const c = ws.color;
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha})`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }
    function drawNoise(ctx, w, h, intensity) {
        const t = _bucketCompTime;
        const cy = h / 2;
        ctx.save();
        for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            const a = 0.04 + intensity * 0.06;
            ctx.strokeStyle = `rgba(180,180,200,${a})`;
            ctx.lineWidth = 0.5;
            for (let x = 0; x < w; x += 2) {
                const n = (_pnoise(x * 0.05 + j * 11, t * 0.15, j * 7) - 0.5) * (8 + intensity * 20);
                const y = cy + n + Math.sin(x * 0.03 + t * 0.5 + j) * (2 + intensity * 4);
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.restore();
    }
    function animate() {
        scenesData.forEach((item, index) => {
            const canvas = document.querySelector(`canvas[data-type="merged"][data-index="${index}"]`);
            if (!canvas || !item.userWaveStyle) return;
            if (!initCanvas(canvas)) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width / 2;
            const h = canvas.height / 2;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(18, 18, 26, 1)';
            ctx.fillRect(0, 0, w, h);
            const bucket = item.bucket;
            drawWave(ctx, w, h, item.userWaveStyle, 0, 0.8);
            if (bucket === 'MID') {
                drawNoise(ctx, w, h, 0.3);
            } else if (bucket === 'HIGH' && item.originalWaveStyle) {
                drawWave(ctx, w, h, item.originalWaveStyle, 50, 0.2);
                drawNoise(ctx, w, h, 0.7);
            }
        });
        _bucketCompTime += 0.016;
        _bucketCompAnimId = requestAnimationFrame(animate);
    }
    animate();
}
function closeComparisonView() {
    stopBucketComparisonWaveAnimation();
    const comparisonViewEl = document.getElementById('comparisonView');
    if (comparisonViewEl) {
        comparisonViewEl.style.display = 'none';
    }
    const alignmentResult = window.archiveAlignmentResult || { averageAlignment: 0, isTrueEnding: false };
    showEndScreen(alignmentResult);
}
async function endComparisonSession() {
    console.log('[Ending] endComparisonSession called');
    try {
        stopBucketComparisonWaveAnimation();
        const comparisonViewEl = document.getElementById('comparisonView');
        if (comparisonViewEl) {
            comparisonViewEl.style.display = 'none';
            comparisonViewEl.style.zIndex = '-1';
        }
 // alignment result 없으면 calculation
        let alignmentResult = window.archiveAlignmentResult;
        if (!alignmentResult) {
            console.log('[Ending] Alignment 계산 중...');
            alignmentResult = await calculateAverageAlignment();
            window.archiveAlignmentResult = alignmentResult;
            console.log('[Ending] Alignment 계산 complete:', alignmentResult);
        } else {
            console.log('[Ending] 기존 Alignment 사용:', alignmentResult);
        }
        
 // Strata 3D strata view display
        const currentData = window.currentStoryData || storyData;
        const state = appStore.getState();
        const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);

        console.log('[Ending] Strata view check:', {
            memoryId: memoryId,
            hasShowStrataView: typeof window.showStrataView === 'function',
            currentData: currentData,
            currentMemory: state.currentMemory,
            allMemoriesDataLength: state.allMemoriesData.length
        });

        if (memoryId && typeof window.showStrataView === 'function') {
            console.log('[Ending] Strata view display start:', memoryId);
            try {
                await window.showStrataView(memoryId, alignmentResult, () => {
                    console.log('[Ending] Strata view closed, moving to ending screen');
                    showEndScreen(alignmentResult, true);
                });
                console.log('[Ending] Strata view display complete');
            } catch (strataError) {
                console.error('[Ending] Strata view display error:', strataError);
                await showEndScreen(alignmentResult, true);
            }
        } else {
            if (!memoryId) {
                console.warn('[Ending] memoryId not found. currentData:', currentData);
            }
            if (typeof window.showStrataView !== 'function') {
                console.warn('[Ending] window.showStrataView is not defined. Make sure strataView.js is loaded.');
            }
            console.log('[Ending] Strata view unavailable, going directly to ending screen');
            await showEndScreen(alignmentResult, true);
        }
    } catch (e) {
        console.error('[Ending] endComparisonSession error:', e);
        showEndScreen(null, true);
    }
}
window.navigateComparison = navigateComparison;
window.closeComparisonView = closeComparisonView;
window.endComparisonSession = endComparisonSession;

// ───── memory register 시스템 ─────
const memoryRegistrationState = {
    isActive: false,
    currentMemory: {
        title: '',
        scenes: []
    },
    currentScene: {
        text: '',
        choices: [],
        originalEmotion: {},
        originalReason: '',
        original_reason_vector: {}
    },
    conversationHistory: [],
    phase: 'collecting'  // 'collecting' | 'reviewing' | 'complete'
};

const memoryCollectionSystemPrompt = `You are "Another Me." Your role is to collect the user's memory.

Goal: Collect the following information about a single scene through natural conversation
- Scene text (what happened)
- Choices (what choices were available at the time)
- Emotion (what emotions were felt)
- Reason (why they felt that way)

Conversation rules:
1. Ask only one thing at a time
2. Be empathetic and gentle with your questions
3. When enough information is gathered, add [SCENE_COMPLETE] tag at the end of your response
4. If information is insufficient, ask follow-up questions

Conversation flow:
- "Tell me the memory of that day"
- (user responds)
- "What choices did you have at that moment?"
- (user responds)
- "What emotions did you feel in that moment?"
- (user responds)
- "Why do you think you felt that way?"
- (user responds)
- "I see. Let me organize this memory. [SCENE_COMPLETE]"

Collected information formatted as JSON:
{
  "text": "Scene description",
  "choices": ["Choice 1", "Choice 2"],
  "emotion": "Primary emotion",
  "reason": "Reason"
}`;

function startMemoryRegistration() {
    console.log('=== Memory registration start ===');
    memoryRegistrationState.isActive = true;
    memoryRegistrationState.phase = 'collecting';
    memoryRegistrationState.currentMemory = { title: '', scenes: [] };
    memoryRegistrationState.currentScene = { text: '', choices: [], originalEmotion: {}, originalReason: '', original_reason_vector: {} };
    memoryRegistrationState.conversationHistory = [];

    showRegistrationScreen();
    startConversation();
}

function showRegistrationScreen() {
    const screen = document.getElementById('memory-registration-screen');
    if (screen) {
        screen.classList.remove('hidden');
        updateSceneCount();
    }
}

function closeRegistrationScreen() {
    const screen = document.getElementById('memory-registration-screen');
    if (screen) {
        screen.classList.add('hidden');
    }
    memoryRegistrationState.isActive = false;
    memoryRegistrationState.phase = 'collecting';

 // Confession Hub 돌아 기
    showConfessionHub();
}

function startConversation() {
    addRegistrationNpcDialogue(NPC_DIALOGUES.registration.start);
    memoryRegistrationState.conversationHistory = [{
        role: 'assistant',
        content: NPC_DIALOGUES.registration.start
    }];
}

function addRegistrationNpcDialogue(text) {
    const dialogueEl = document.querySelector('.registration-npc-dialogue');
    if (dialogueEl) {
        dialogueEl.textContent = text;
    }
}

async function handleRegistrationInput(userInput) {
    if (!userInput || !userInput.trim()) return;

    console.log('=== Memory registration input ===');
    console.log('User input:', userInput);

    memoryRegistrationState.conversationHistory.push({
        role: 'user',
        content: userInput
    });

    try {
        supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
            showNotification('No Supabase client');
            return;
        }

 // Supabase URL anon key 져오기
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('./lib/config.js');
        const supabaseUrl = SUPABASE_URL;

 // session 토큰 져오기 (없어 anon key 동작)
        let authToken = '';
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            authToken = session?.access_token || '';
        } catch (e) {
            console.warn('세션 가져오기 실패, anon key만 사용:', e);
        }

        console.log('collect-memory 스트리밍 called start:', {
            conversationLength: memoryRegistrationState.conversationHistory.length,
            systemPrompt: memoryCollectionSystemPrompt.substring(0, 50) + '...',
            hasAuthToken: !!authToken
        });

 // 스트리밍 request (Authentication 토큰 없으면 anon key )
        const headers = {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY || ''
        };

        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(`${supabaseUrl}/functions/v1/collect-memory`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                conversation: memoryRegistrationState.conversationHistory,
                systemPrompt: memoryCollectionSystemPrompt
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('collect-memory 함수 error:', errorData);

            if (response.status === 0 || errorData.error?.includes('CORS')) {
                showNotification('Edge Function not deployed or CORS misconfigured. Please deploy the collect-memory function.');
            } else {
                showNotification('Error processing conversation: ' + (errorData.error || 'Unknown error'));
            }
            return;
        }

 // 스트리밍 response 읽기
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            showNotification('Unable to read streaming response');
            return;
        }

        let accumulatedText = '';
        let buffer = '';
        let finalData = null;

 // NPC 대화 영역 initialization
        const dialogueEl = document.querySelector('.registration-npc-dialogue');
        if (dialogueEl) {
            dialogueEl.textContent = '';
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') continue;

                    try {
                        const data = JSON.parse(dataStr);

                        if (data.type === 'chunk' && data.text) {
 // text add
                            accumulatedText += data.text;

 // 실시간으 display (단어 단위 자연스럽게)
                            if (dialogueEl) {
                                dialogueEl.textContent = accumulatedText;

 // 스크롤 맨 아래 
                                const conversationContainer = dialogueEl.closest('.registration-conversation');
                                if (conversationContainer) {
                                    conversationContainer.scrollTop = conversationContainer.scrollHeight;
                                }
                            }
                        }

                        if (data.type === 'done') {
                            finalData = data;
                        }

                        if (data.type === 'error') {
                            console.error('스트리밍 error:', data.error);
                            showNotification('Streaming error: ' + (data.error || 'Unknown error'));
                            return;
                        }
                    } catch (e) {
 // JSON 파싱 error ignore
                    }
                }
            }
        }

 // 최종 response processing
        if (finalData && finalData.reply) {
 // 최종 text update (누락 부분 있 수 있음)
            if (dialogueEl) {
                dialogueEl.textContent = finalData.reply;
            }

            memoryRegistrationState.conversationHistory.push({
                role: 'assistant',
                content: finalData.reply
            });
        }

        if (finalData && finalData.sceneComplete && finalData.extractedScene) {
            console.log('Scene 완성:', finalData.extractedScene);
            memoryRegistrationState.currentScene = {
                text: finalData.extractedScene.text || '',
                choices: finalData.extractedScene.choices || [],
                originalEmotion: finalData.extractedScene.emotion ? parseEmotionFromText(finalData.extractedScene.emotion) : {},
                originalReason: finalData.extractedScene.reason || '',
                original_reason_vector: {}
            };
            showReviewPhase();
        }
    } catch (e) {
        console.error('handleRegistrationInput error:', e);
        showNotification('Error processing input: ' + (e.message || 'Unknown error'));
    }
}

function parseEmotionFromText(emotionText) {
    const emotionMap = {
        'fear': ['fear', 'scared', 'terror'],
        'sadness': ['sad', 'depressed', 'sorrow'],
        'anger': ['anger', 'rage', 'furious'],
        'joy': ['joy', 'happy', 'delight'],
        'longing': ['longing', 'miss', 'yearning'],
        'guilt': ['guilt', 'sorry', 'remorse']
    };

    const result = { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 };
    const lowerText = emotionText.toLowerCase();

    for (const [key, keywords] of Object.entries(emotionMap)) {
        if (keywords.some(kw => lowerText.includes(kw))) {
            result[key] = 0.7;
        }
    }

    return result;
}

function showReviewPhase() {
    console.log('=== Scene 확인 화면 표시 ===');
    memoryRegistrationState.phase = 'reviewing';

    const conversationEl = document.getElementById('registration-conversation');
    const reviewEl = document.getElementById('registration-review');

    if (conversationEl) conversationEl.classList.add('hidden');
    if (reviewEl) reviewEl.classList.remove('hidden');

    populateReviewForm(memoryRegistrationState.currentScene);
}

function populateReviewForm(scene) {
    const textEl = document.getElementById('reviewText');
    if (textEl) textEl.value = scene.text || '';

    const reasonEl = document.getElementById('reviewReason');
    if (reasonEl) reasonEl.value = scene.originalReason || '';

    const choicesContainer = document.getElementById('reviewChoices');
    if (choicesContainer) {
        choicesContainer.innerHTML = '';
        const choices = scene.choices || [];
        if (choices.length === 0) {
            choices.push('', '');
        }
        choices.forEach((choice, idx) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'choice-input';
            input.placeholder = `선택지 ${idx + 1}`;
            input.value = choice;
            choicesContainer.appendChild(input);
        });
    }

    const emotionSliders = document.querySelectorAll('#reviewEmotion .emotion-slider input[type="range"]');
    emotionSliders.forEach(slider => {
        const emotion = slider.dataset.emotion;
        const value = scene.originalEmotion && scene.originalEmotion[emotion] ? scene.originalEmotion[emotion] : 0;
        slider.value = value;
        const valueEl = slider.parentElement.querySelector('.emotion-value');
        if (valueEl) valueEl.textContent = value.toFixed(1);

        slider.removeEventListener('input', updateEmotionValue);
        slider.addEventListener('input', updateEmotionValue);
    });

    function updateEmotionValue() {
        const valueEl = this.parentElement.querySelector('.emotion-value');
        if (valueEl) valueEl.textContent = parseFloat(this.value).toFixed(1);
    }
}

function collectReviewFormData() {
    const textEl = document.getElementById('reviewText');
    const reasonEl = document.getElementById('reviewReason');
    const choicesInputs = document.querySelectorAll('#reviewChoices .choice-input');
    const attributionEl = document.getElementById('reviewAttribution');
    const coreFearEl = document.getElementById('reviewCoreFear');
    const isVoidEl = document.getElementById('reviewIsVoid');

    const choices = Array.from(choicesInputs)
        .map(input => input.value.trim())
        .filter(choice => choice.length > 0);

    const emotion = {};
    document.querySelectorAll('#reviewEmotion .emotion-slider input[type="range"]').forEach(slider => {
        emotion[slider.dataset.emotion] = parseFloat(slider.value);
    });

    const reasonVector = {
        attribution: attributionEl ? attributionEl.value : 'fate_blame',
        core_fear: coreFearEl ? coreFearEl.value : 'none',
        is_void: isVoidEl ? isVoidEl.checked : false
    };

    return {
        text: textEl ? textEl.value.trim() : '',
        choices: choices,
        originalEmotion: emotion,
        originalReason: reasonEl ? reasonEl.value.trim() : '',
        original_reason_vector: reasonVector
    };
}

function confirmScene() {
    console.log('=== Scene 확정 ===');
    const scene = collectReviewFormData();

    if (!scene.text || scene.text.length === 0) {
        showNotification('Scene 텍스트를 입력 please');
        return;
    }

    memoryRegistrationState.currentMemory.scenes.push(scene);

    updateSceneCount();

    memoryRegistrationState.phase = 'collecting';
    memoryRegistrationState.currentScene = { text: '', choices: [], originalEmotion: {}, originalReason: '', original_reason_vector: {} };

    const conversationEl = document.getElementById('registration-conversation');
    const reviewEl = document.getElementById('registration-review');

    if (reviewEl) reviewEl.classList.add('hidden');
    if (conversationEl) conversationEl.classList.remove('hidden');

    const textInput = document.getElementById('registrationTextInput');
    if (textInput) textInput.value = '';

    addRegistrationNpcDialogue(NPC_DIALOGUES.registration.sceneComplete);
    memoryRegistrationState.conversationHistory = [{
        role: 'assistant',
        content: NPC_DIALOGUES.registration.sceneComplete
    }];
}

function updateSceneCount() {
    const countEl = document.querySelector('.scene-count');
    const finishBtn = document.querySelector('.finish-registration-btn');

    if (countEl) {
        const count = memoryRegistrationState.currentMemory.scenes.length;
        countEl.textContent = `Scene ${count}개 수집됨`;
    }

    if (finishBtn) {
        if (memoryRegistrationState.currentMemory.scenes.length > 0) {
            finishBtn.classList.remove('hidden');
        } else {
            finishBtn.classList.add('hidden');
        }
    }
}

async function finishRegistration() {
    const memory = memoryRegistrationState.currentMemory;

    if (memory.scenes.length < 1) {
        showNotification('At least one scene is required.');
        return;
    }

    const title = prompt('Enter a title for this memory:');
    if (!title || !title.trim()) {
        return;
    }

    memory.title = title.trim();

    try {
        await saveMemoryToDB(memory);
        showNotification('Memory registered!');
        closeRegistrationScreen();

        const state = appStore.getState();
        if (state.currentMode === 'archive') {
            await loadMemoriesFromSupabase();
            sortMemories('all');
        }
    } catch (e) {
        console.error('finishRegistration error:', e);
        showNotification('Error during memory registration');
    }
}

/**
 * memory DB save (MemoryService 래퍼)
 * @param {Object} memory - memory object { title, scenes: [...] }
 * @throws {Error} save failed 시 러
 */
async function saveMemoryToDB(memory) {
    const state = appStore.getState();
    const curator_id = state.currentUser?.id || null;

    const result = await MemoryService.saveMemory({ memory, curator_id });

    if (!result.ok) {
        throw result.error || new Error('Memory save failed');
    }

    return result.data;
}

// memory register 및 The Confession event 바인딩 bindEvents.js move됨

window.startMemoryRegistration = startMemoryRegistration;
window.startOpeningWaveAnimation = startOpeningWaveAnimation;
window.handleOpeningKeydown = handleOpeningKeydown;

// ───── The Confession ─────

// The Confession state management
const confessionState = {
    currentStep: 0,
    ritualData: {
        sensory: { temperature: '', smell: '', sound: '' },
        anchorObject: '',
        action: '',
        conflict: '',
        emotionWord: ''
    },
    audioState: {
        base: null,
        ambience: null,
        tension: null
    },
    conversationHistory: [],
    scenes: [],
    generatedScene: null
};

// 감각 칩 data
// ===== Confession Flow V2: Chip Data =====
const CHIP_DATA = {
    smell: [
        { label: 'Metallic rain', key: 'rain_heavy' },
        { label: 'Acrid dust', key: 'dust' },
        { label: 'Antiseptic', key: 'hospital' },
        { label: 'Fresh grass', key: 'grass' },
        { label: 'Nothing', key: 'nothing', void: true },
    ],
    sound: [
        { label: 'Rainfall', key: 'rain' },
        { label: 'Silence', key: 'silence' },
        { label: 'Murmuring', key: 'crowd' },
        { label: 'Wind', key: 'wind' },
        { label: 'Nothing', key: 'nothing', void: true },
    ],
    touch: [
        { label: 'Cold air', key: 'cold_air' },
        { label: 'Clammy sweat', key: 'sweat' },
        { label: "Someone's hand", key: 'someones_hand' },
        { label: 'Hard floor', key: 'hard_floor' },
        { label: 'Nothing', key: 'nothing', void: true },
    ],
    anchor_context: [
        { label: 'It was always there', key: 'always_there' },
        { label: 'Someone placed it', key: 'someone_placed' },
        { label: "I don't know", key: 'unknown' },
        { label: "I don't want to say", key: 'void', void: true },
    ],
    action_attribution: [
        { label: 'It was my choice', key: 'my_choice' },
        { label: 'I had no choice', key: 'no_choice' },
        { label: "I don't know", key: 'unknown' },
    ],
    crash_body: [
        { label: 'My chest tightened', key: 'chest_tight' },
        { label: 'My breath stopped', key: 'breathless' },
        { label: 'My hands trembled', key: 'trembling' },
        { label: 'Tears came', key: 'tears' },
        { label: 'I felt nothing', key: 'nothing', void: true },
    ],
    crash_emotion: [
        { label: 'Guilt', key: 'guilt' },
        { label: 'Fear', key: 'fear' },
        { label: 'Anger', key: 'anger' },
        { label: 'Sadness', key: 'sadness' },
        { label: 'Shame', key: 'shame' },
        { label: 'Longing', key: 'longing' },
        { label: 'Relief', key: 'relief' },
        { label: 'Confusion', key: 'confusion' },
        { label: 'Emptiness', key: 'emptiness' },
        { label: 'Awe', key: 'awe' },
        { label: 'Strange joy', key: 'strange_joy' },
        { label: 'Numbness', key: 'numbness', void: true },
    ],
    crash_target: [
        { label: 'Myself', key: 'self' },
        { label: 'That person', key: 'other' },
        { label: 'The situation', key: 'situation' },
        { label: "I don't know", key: 'unknown' },
    ],
    seal_relation: [
        { label: 'Something that still hurts', key: 'still_hurts' },
        { label: "Something I'm okay with now", key: 'okay_now' },
        { label: "Something I still don't understand", key: 'dont_know' },
        { label: 'Something I never want to see again', key: 'never_again', void: true },
    ],
};

// ===== Label Maps =====
const BODY_LABELS = {
    chest_tight: 'Your chest tightened.',
    breathless: 'Your breath stopped.',
    trembling: 'Your hands trembled.',
    tears: 'Tears came.',
    nothing: 'You felt nothing.',
};

const EMOTION_LABELS = {
    guilt: 'Guilt', fear: 'Fear', anger: 'Anger',
    sadness: 'Sadness', shame: 'Shame', longing: 'Longing',
    relief: 'Relief', confusion: 'Confusion', emptiness: 'Emptiness',
    awe: 'Awe', strange_joy: 'Strange joy', numbness: 'Numbness',
};

// ===== Confession Flow V2: Flow Definition =====
const CONFESSION_FLOW = [
    // ── Step 1: Sensory Priming ──
    {
        id: 'smell', step: 1,
        question: 'Close your eyes.\nYou are standing in that place.\nWhat do you smell?',
        type: 'chips', chipsKey: 'smell', dataPath: 'sensory.smell',
    },
    {
        id: 'sound', step: 1,
        question: (d) => {
            const smellLabel = CHIP_DATA.smell.find(c => c.key === d.sensory.smell)?.label || '';
            return d.sensory.smell === 'nothing'
                ? 'No smell.\nWhat sounds do you hear instead?'
                : `Amidst the ${smellLabel},\nwhat sounds do you hear?`;
        },
        type: 'chips', chipsKey: 'sound', dataPath: 'sensory.sound',
    },
    {
        id: 'touch', step: 1,
        question: 'What touches your skin?',
        type: 'chips', chipsKey: 'touch', dataPath: 'sensory.touch',
    },
    // ── Step 2: Anchoring ──
    {
        id: 'anchor_object', step: 2,
        question: 'In that space, your eyes rest on something.\nWhat are you looking at?',
        type: 'text', placeholder: 'What you see', dataPath: 'anchor.object',
    },
    {
        id: 'anchor_context', step: 2,
        question: (d) => `${d.anchor.object}.\nWhy is it there?`,
        type: 'chips', chipsKey: 'anchor_context', dataPath: 'anchor.context',
    },
    // ── Step 3: The Action ──
    {
        id: 'action_what', step: 3,
        question: 'What did you do in that place?',
        type: 'text', placeholder: '...', dataPath: 'action.what',
    },
    {
        id: 'action_attribution', step: 3,
        question: (d) => `${d.action.what}.\nWas that your choice, or did you have no choice?`,
        type: 'chips', chipsKey: 'action_attribution', dataPath: 'action.attribution',
    },
    // ── Step 4: The Crash ──
    {
        id: 'crash_event', step: 4,
        question: 'And then what happened?',
        type: 'textarea', placeholder: 'Slowly, as it comes to you...', dataPath: 'crash.event',
    },
    {
        id: 'crash_body', step: 4,
        question: 'What happened in your body then?',
        type: 'chips', chipsKey: 'crash_body', dataPath: 'crash.bodyFeel',
    },
    {
        id: 'crash_emotion', step: 4,
        question: (d) => {
            const bodyText = BODY_LABELS[d.crash.bodyFeel] || '';
            return `${bodyText}\nWhat emotion was that?\n(You can choose up to two)`;
        },
        type: 'multi_chips', chipsKey: 'crash_emotion', dataPath: 'crash.emotion',
        maxSelect: 2,
    },
    {
        id: 'crash_target', step: 4,
        question: (d) => {
            const emotions = Array.isArray(d.crash.emotion) ? d.crash.emotion : [d.crash.emotion];
            const hasNumbness = emotions.includes('numbness');
            if (hasNumbness && emotions.length === 1) {
                return 'That numbness...\nWhat are you trying not to feel?';
            }
            const labels = emotions.map(e => EMOTION_LABELS[e] || e).join(' and ');
            return `That ${labels}...\nWho is it directed at?`;
        },
        type: 'chips', chipsKey: 'crash_target', dataPath: 'crash.target',
    },
    // ── Step 5: The Seal ──
    {
        id: 'seal_relation', step: 5,
        question: 'Step out of this memory.\nClose the door.\n\nLooking back, what is this memory to you now?',
        type: 'chips', chipsKey: 'seal_relation', dataPath: 'seal.relation',
    },
    {
        id: 'seal_word', step: 5,
        question: 'One last thing.\nThis memory, in one word.',
        type: 'text', placeholder: 'Just one word', dataPath: 'seal.word',
    },
];

// ===== Flow State =====
const flowState = {
    currentIndex: 0,
    lastStep: 0,
    data: {
        sensory: { smell: '', sound: '', touch: '' },
        anchor: { object: '', context: '' },
        action: { what: '', attribution: '' },
        crash: { event: '', bodyFeel: '', emotion: '', target: '' },
        seal: { relation: '', word: '' },
    },
};

// ===== V2 Flow Helpers =====
function setNested(obj, path, val) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
    cur[keys[keys.length - 1]] = val;
}

function typeWrite(el, text, speed = 40, cb) {
    if (!el) return;
    let i = 0;
    el.textContent = '';
    function tick() {
        if (i < text.length) {
            el.textContent += text.charAt(i);
            i++;
            const ch = text.charAt(i - 1);
            const d = (ch === '.' || ch === '?' || ch === ',') ? 250
                    : ch === '\n' ? 350
                    : speed;
            setTimeout(tick, d);
        } else if (cb) cb();
    }
    tick();
}

// ===== V2 Flow Rendering =====
function renderPrompt() {
    const flowEl = document.getElementById('confessionFlow');
    const prompt = CONFESSION_FLOW[flowState.currentIndex];

    if (!prompt) {
        onFlowComplete();
        return;
    }

    // Step divider
    if (prompt.step !== flowState.lastStep && flowState.lastStep !== 0) {
        const divider = document.createElement('div');
        divider.className = 'flow-divider';
        flowEl.appendChild(divider);
    }
    flowState.lastStep = prompt.step;

    // Step indicator
    const indicator = document.getElementById('stepIndicator');
    if (indicator) indicator.textContent = `${prompt.step} / 5`;

    // Prompt container
    const promptEl = document.createElement('div');
    promptEl.className = 'flow-prompt current';
    promptEl.id = `prompt-${prompt.id}`;

    // Question
    const questionEl = document.createElement('p');
    questionEl.className = 'flow-question';
    promptEl.appendChild(questionEl);

    // Input area
    const inputArea = document.createElement('div');
    inputArea.className = 'flow-input-area';
    inputArea.style.opacity = '0';

    if (prompt.type === 'chips') {
        const chipsEl = document.createElement('div');
        chipsEl.className = 'flow-chips';
        CHIP_DATA[prompt.chipsKey].forEach(chip => {
            const btn = document.createElement('button');
            btn.className = 'flow-chip' + (chip.void ? ' void-chip' : '');
            btn.textContent = chip.label;
            btn.addEventListener('click', () => answer(chip.key, chip.label));
            chipsEl.appendChild(btn);
        });
        inputArea.appendChild(chipsEl);
    } else if (prompt.type === 'multi_chips') {
        const maxSelect = prompt.maxSelect || 2;
        const selected = [];
        const chipsEl = document.createElement('div');
        chipsEl.className = 'flow-chips';
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'flow-multi-confirm';
        confirmBtn.textContent = 'Confirm';

        CHIP_DATA[prompt.chipsKey].forEach(chip => {
            const btn = document.createElement('button');
            btn.className = 'flow-chip' + (chip.void ? ' void-chip' : '');
            btn.textContent = chip.label;
            btn.addEventListener('click', () => {
                if (chip.void) {
                    selected.length = 0;
                    selected.push({ key: chip.key, label: chip.label });
                    answer([chip.key], chip.label);
                    return;
                }
                const idx = selected.findIndex(s => s.key === chip.key);
                if (idx >= 0) {
                    selected.splice(idx, 1);
                    btn.classList.remove('selected');
                } else if (selected.length < maxSelect) {
                    selected.push({ key: chip.key, label: chip.label });
                    btn.classList.add('selected');
                }
                if (selected.length > 0) {
                    confirmBtn.classList.add('visible');
                } else {
                    confirmBtn.classList.remove('visible');
                }
            });
            chipsEl.appendChild(btn);
        });

        confirmBtn.addEventListener('click', () => {
            if (selected.length > 0) {
                const keys = selected.map(s => s.key);
                const labels = selected.map(s => s.label).join(' + ');
                answer(keys, labels);
            }
        });

        inputArea.appendChild(chipsEl);
        inputArea.appendChild(confirmBtn);
    } else if (prompt.type === 'text') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'flow-text-input';
        input.placeholder = prompt.placeholder || '';
        input.autocomplete = 'off';
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                answer(input.value.trim(), input.value.trim());
            }
        });
        inputArea.appendChild(input);
    } else if (prompt.type === 'textarea') {
        const wrap = document.createElement('div');
        wrap.className = 'flow-textarea-wrap';
        const textarea = document.createElement('textarea');
        textarea.className = 'flow-textarea-input';
        textarea.placeholder = prompt.placeholder || '';
        const submitBtn = document.createElement('button');
        submitBtn.className = 'flow-submit-btn';
        submitBtn.textContent = '→';
        submitBtn.addEventListener('click', () => {
            if (textarea.value.trim()) answer(textarea.value.trim(), textarea.value.trim());
        });
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && textarea.value.trim()) {
                answer(textarea.value.trim(), textarea.value.trim());
            }
        });
        wrap.appendChild(textarea);
        wrap.appendChild(submitBtn);
        inputArea.appendChild(wrap);
    }

    promptEl.appendChild(inputArea);
    flowEl.appendChild(promptEl);

    setTimeout(() => {
        flowEl.scrollTop = flowEl.scrollHeight;
    }, 50);

    const questionText = typeof prompt.question === 'function'
        ? prompt.question(flowState.data)
        : prompt.question;

    typeWrite(questionEl, questionText, 35, () => {
        inputArea.style.opacity = '1';
        const focusable = inputArea.querySelector('input, textarea');
        if (focusable) setTimeout(() => focusable.focus(), 150);
        setTimeout(() => { flowEl.scrollTop = flowEl.scrollHeight; }, 200);
    });
}

function answer(value, displayText) {
    const prompt = CONFESSION_FLOW[flowState.currentIndex];
    if (!prompt) return;

    setNested(flowState.data, prompt.dataPath, value);

    const promptEl = document.getElementById(`prompt-${prompt.id}`);
    if (promptEl) {
        promptEl.classList.remove('current');
        promptEl.classList.add('answered');
        const inputArea = promptEl.querySelector('.flow-input-area');
        if (inputArea) {
            inputArea.innerHTML = '';
            const answerEl = document.createElement('div');
            answerEl.className = 'flow-answer';
            answerEl.textContent = displayText;
            inputArea.appendChild(answerEl);
            inputArea.style.opacity = '1';
        }
    }

    flowState.currentIndex++;
    setTimeout(() => renderPrompt(), 650);
}

function onFlowComplete() {
    const flowEl = document.getElementById('confessionFlow');
    const completeEl = document.createElement('div');
    completeEl.className = 'flow-complete';
    completeEl.innerHTML = `
        <p class="flow-complete-text">기억이 수집 complete.</p>
        <button class="flow-generate-btn" onclick="generateSceneFromRitual()">이 기억을 현상합니다</button>
    `;
    flowEl.appendChild(completeEl);

    setTimeout(() => {
        completeEl.classList.add('visible');
        flowEl.scrollTop = flowEl.scrollHeight;
    }, 300);
}

// ===== V3 Vector Extraction =====
function extractOriginalVector(data) {
    const emotionMap = {
        guilt:       { fear: 0.1, sadness: 0.3, anger: 0, joy: 0, longing: 0.1, guilt: 0.8 },
        fear:        { fear: 0.8, sadness: 0.2, anger: 0, joy: 0, longing: 0, guilt: 0.1 },
        anger:       { fear: 0.1, sadness: 0.1, anger: 0.8, joy: 0, longing: 0, guilt: 0 },
        sadness:     { fear: 0, sadness: 0.8, anger: 0, joy: 0, longing: 0.3, guilt: 0.1 },
        shame:       { fear: 0.2, sadness: 0.3, anger: 0, joy: 0, longing: 0, guilt: 0.6 },
        longing:     { fear: 0, sadness: 0.4, anger: 0, joy: 0.1, longing: 0.8, guilt: 0 },
        relief:      { fear: 0, sadness: 0.1, anger: 0, joy: 0.5, longing: 0, guilt: 0.3 },
        confusion:   { fear: 0.3, sadness: 0.2, anger: 0.1, joy: 0, longing: 0.1, guilt: 0.2 },
        emptiness:   { fear: 0, sadness: 0.4, anger: 0, joy: 0, longing: 0.2, guilt: 0.1 },
        awe:         { fear: 0.2, sadness: 0, anger: 0, joy: 0.3, longing: 0.3, guilt: 0 },
        strange_joy: { fear: 0.1, sadness: 0.1, anger: 0, joy: 0.6, longing: 0.1, guilt: 0.3 },
        numbness:    { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 },
    };

    const attributionMap = {
        my_choice: 'internal',
        no_choice: 'external',
        unknown:   'situational',
    };

    const fearMap = {
        guilt: 'worthlessness', fear: 'punishment', anger: 'powerlessness',
        sadness: 'loss', shame: 'worthlessness', longing: 'loss',
        relief: 'guilt_release', confusion: 'disorientation', emptiness: 'loss',
        awe: 'insignificance', strange_joy: 'guilt_release', numbness: 'powerlessness',
    };

    const targetMap = {
        self: 'self', other: 'other',
        situation: 'situation', unknown: 'unknown',
    };

    const emotions = Array.isArray(data.crash.emotion) ? data.crash.emotion : [data.crash.emotion];
    const keys = ['fear', 'sadness', 'anger', 'joy', 'longing', 'guilt'];
    const blended = {};
    keys.forEach(k => blended[k] = 0);

    emotions.forEach(emo => {
        const vec = emotionMap[emo] || emotionMap.sadness;
        keys.forEach(k => blended[k] += vec[k] / emotions.length);
    });

    const primaryEmotion = emotions[0];
    const is_void = emotions.includes('numbness') || data.crash.bodyFeel === 'nothing';
    const is_compound = emotions.length > 1;

    return {
        base: blended,
        reason_analysis: {
            attribution: attributionMap[data.action.attribution] || 'situational',
            core_fear: fearMap[primaryEmotion] || 'loss',
            target: targetMap[data.crash.target] || 'unknown',
            is_void,
            is_compound,
            emotions: emotions,
        },
        sensory: { ...data.sensory },
        vulnerability: data.seal.relation,
    };
}

function extractVoidFlags(data) {
    const sensoryVoid = data.sensory.smell === 'nothing'
        && data.sensory.sound === 'nothing'
        && data.sensory.touch === 'nothing';
    return {
        sensory_void: sensoryVoid,
        anchor_void: data.anchor.context === 'void',
        emotion_void: data.crash.emotion === 'numbness' || data.crash.bodyFeel === 'nothing',
        seal_void: data.seal.relation === 'never_again',
    };
}

// ===== Confession Start/End =====
function startFlow() {
    flowState.currentIndex = 0;
    flowState.lastStep = 0;
    flowState.data = {
        sensory: { smell: '', sound: '', touch: '' },
        anchor: { object: '', context: '' },
        action: { what: '', attribution: '' },
        crash: { event: '', bodyFeel: '', emotion: '', target: '' },
        seal: { relation: '', word: '' },
    };

    const flowEl = document.getElementById('confessionFlow');
    if (flowEl) flowEl.innerHTML = '';

    renderPrompt();
}

// Legacy stubs — replaced by Record Chat flow
function startConfession() {
    startBeginner();
}

function endConfession() {
    endRecordChat();
    showConfessionHub();
}

// 타 핑 엔진 ( 글자씩 output)
// 각 element별 timer 추적하여 중복 call 방지
const typeWriterTimers = new WeakMap();

function typeWriter(element, text, speed = 50, callback) {
    if (!element) return;

 // 전 timer 있으면 취소
    const existingTimer = typeWriterTimers.get(element);
    if (existingTimer) {
        clearTimeout(existingTimer);
        typeWriterTimers.delete(element);
    }

    let i = 0;
    element.textContent = '';

    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;

 // 문장 부호 뒤 딜레 
            const char = text.charAt(i - 1);
            const delay = (char === '.' || char === '?' || char === ',') ? 300 : speed;

            const timer = setTimeout(type, delay);
            typeWriterTimers.set(element, timer);
        } else {
            typeWriterTimers.delete(element);
            if (callback) {
                callback();
            }
        }
    }

    type();
}

// initStep1~5 function들 V2 flow 대체됨 (renderPrompt )

// 안전 리소스 팝업 display
function showSafetyResources() {
    const popup = document.createElement('div');
    popup.className = 'safety-popup';
    popup.innerHTML = `
        <div class="safety-popup-content">
            <p class="safety-message">누군가에게는, 솔직하게 말해도 괜찮아.</p>
            <div class="safety-resources">
                ${SAFETY_RESOURCES.map(r => `
                    <a href="${r.action}" class="safety-resource">
                        <span class="resource-name">${r.name}</span>
                        <span class="resource-number">${r.number}</span>
                        <span class="resource-desc">${r.desc}</span>
                    </a>
                `).join('')}
            </div>
            <button class="safety-close-btn">Close</button>
        </div>
    `;

    document.body.appendChild(popup);

    popup.querySelector('.safety-close-btn').addEventListener('click', () => {
        popup.remove();
    });
}

// NPC 대화 display (Confession용)
function showConfessionNPCDialogue(text) {
    const dialogueEl = document.querySelector('.confession-text');
    if (dialogueEl) {
        dialogueEl.textContent = text;
    }
}

// 위기 감지 시 processing
function handleCrisis(level, inputElement) {
    console.log('=== Safety system ===');
    console.log('감지 레벨:', level);

    if (level === 'high') {
 // input 마스킹
        if (inputElement) {
            inputElement.value = '■'.repeat(inputElement.value.length);
            inputElement.disabled = true;
        }

 // 위기 dialogue output
        const dialogue = getRandomDialogue(CRISIS_DIALOGUES);
        showConfessionNPCDialogue(dialogue);

 // 안전 리소스 display
        setTimeout(() => showSafetyResources(), 1500);

        return false; // AI 전송 차단
    }

    if (level === 'mid') {
 // 경고 dialogue output, 전송 허용
        const dialogue = getRandomDialogue(CRISIS_DIALOGUES);
        showConfessionNPCDialogue(dialogue);

        return true; // AI 전송 허용
    }

    return true;
}

// input 제출 시 안전 체크
function checkSafetyBeforeSubmit(inputValue, inputElement) {
    const result = detectCrisis(inputValue);

    console.log('=== Safety system ===');
    console.log('감지 레벨:', result.level);
    console.log('키워드:', result.keyword);

    if (result.level !== 'safe') {
        const canProceed = handleCrisis(result.level, inputElement);
        if (!canProceed) {
            return false; // 전송 차단
        }
    }

    return true; // 전송 허용
}

// setupConfessionListeners function bindEvents.js move됨

// 스트리밍 AI response function
// V2: 5scene create (JSON response)
async function generateScenesFromRitual(inputData) {
 // Authentication 토큰 져오기 (generate-scene-from-ritual login 필수)
    const { getAccessToken } = await import('./lib/supabaseClient.js');
    const accessToken = await getAccessToken();
    if (!accessToken) {
        throw new Error('기억을 생성하려면 로그인이 필요합니다.');
    }

 // V2: flowData 있으면 그대 , 없으면 inputData flowData 간주
    const requestBody = inputData.flowData ? { flowData: inputData.flowData } : { flowData: inputData };

    const response = await fetch(
        `${SUPABASE_URL}/functions/v1/generate-scene-from-ritual`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify(requestBody)
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[V2] API error response:', errorText);
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch (e) {
            errorData = { error: errorText };
        }
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    console.log('[V2] API response data:', responseData);
    
    if (responseData.error) {
        console.error('[V2] Response contains error:', responseData.error);
        throw new Error(responseData.error);
    }

 // V2 response 형식: { scenes: [...], originalVector: {...}, flowData: {...} }
    return responseData;
}

// 하위 호환: existing 스트리밍 방식 (레거시)
// streamAIResponse() delete됨 (V2 서 스트리밍 없음)

// ritualData flowData conversion (V2 구조)
function convertRitualDataToFlowData(ritualData) {
 // V2 flowData 구조 conversion
 // 누락 필드 defaultvalue 또 추론value 
    const flowData = {
        sensory: {
            smell: ritualData.sensory?.smell || '',
            sound: ritualData.sensory?.sound || '',
            touch: ritualData.sensory?.temperature || '' // temperature를 touch로 매핑
        },
        anchor: {
            object: ritualData.anchorObject || '',
            context: 'unknown' // 기본값 (V2에서는 anchor_context 질문이 있음)
        },
        action: {
            what: ritualData.action || '',
            attribution: 'unknown' // 기본값 (V2에서는 action_attribution 질문이 있음)
        },
        crash: {
            event: ritualData.conflict || '',
            bodyFeel: 'unknown', // 기본값 (V2에서는 crash_body 질문이 있음)
            emotion: ritualData.emotionWord || 'sadness', // emotionWord를 emotion으로 매핑
            target: 'unknown' // 기본값 (V2에서는 crash_target 질문이 있음)
        },
        seal: {
            relation: 'dont_know', // 기본값 (V2에서는 seal_relation 질문이 있음)
            word: ritualData.emotionWord || '' // emotionWord를 seal.word로 매핑
        }
    };
    
    console.log('[V2] ritualData → flowData conversion:', flowData);
    return flowData;
}

// AI scene create (V2: 5scene)
async function generateSceneFromRitual() {
    const flowData = flowState.data;
    
 // client 벡터 추출
    const clientVector = extractOriginalVector(flowData);
    const voidFlags = extractVoidFlags(flowData);
    
    console.log('[V2] generateSceneFromRitual start');
    console.log('[V2] flowData:', flowData);
    console.log('[V2] clientVector:', clientVector);
    console.log('[V2] voidFlags:', voidFlags);

    try {
        const { getAccessToken } = await import('./lib/supabaseClient.js');
        const accessToken = await getAccessToken();
        if (!accessToken) {
            throw new Error('로그인이 필요합니다.');
        }

 // flowData 유효성 검사
        if (!flowData || !flowData.sensory || !flowData.anchor || !flowData.action || !flowData.crash || !flowData.seal) {
            throw new Error('flowData가 완전하지 않습니다. 모든 질문에 답변 please.');
        }

        console.log('[V2] flowData to send:', JSON.stringify(flowData, null, 2));

        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/generate-scene-from-ritual`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': SUPABASE_ANON_KEY
                },
                body: JSON.stringify({ flowData })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[V2] Edge Function error response:', errorText);
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorJson.message || errorMessage;
            } catch (e) {
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }
        
        const result = await response.json();
        
        console.log('[V2] API response:', result);
        console.log('Client vector:', clientVector);
        console.log('Server vector:', result.originalVector);
        
 // confessionState save
        confessionState.generatedScenes = result.scenes;
        confessionState.originalVector = result.originalVector;
        confessionState.flowData = result.flowData;
        confessionState.sealWord = result.sealWord;
        confessionState.generatedScene = result; // 하위 호환
        
 // result screen rendering
        renderSceneResult(result);
    } catch (error) {
        console.error('[V2] Scene 생성 error:', error);
        const flowEl = document.getElementById('confessionFlow');
        if (flowEl) {
            const errorEl = document.createElement('div');
            errorEl.className = 'flow-complete';
            errorEl.innerHTML = `
                <p class="flow-complete-text" style="color: #ff6b6b;">기억 현상 failed: ${error.message || 'Unknown error'}</p>
            `;
            flowEl.appendChild(errorEl);
        }
    }
}

function renderSceneResult(result) {
    const flowEl = document.getElementById('confessionFlow');
    
    const resultEl = document.createElement('div');
    resultEl.className = 'flow-complete';
    resultEl.innerHTML = `
        <p class="flow-complete-text">기억이 현상 complete.</p>
        <div class="flow-answer" style="white-space:pre-line; margin:16px 0;">
            ${result.scenes.map((s, i) => 
                `<p style="margin-bottom:12px; opacity:${0.5 + i * 0.1};">${s.text}</p>`
            ).join('')}
        </div>
        <button class="flow-generate-btn" onclick="saveAndBury()">지층에 묻기</button>
    `;
    flowEl.appendChild(resultEl);
    setTimeout(() => {
        resultEl.classList.add('visible');
        flowEl.scrollTop = flowEl.scrollHeight;
    }, 300);
}

// strata 묻기 (DB save)
async function saveAndBury() {
    await saveConfessionToDB();
}

// DB save (V2: 5scene 구조)
async function saveConfessionToDB() {
    const title = prompt('Enter a title for this memory:');
    if (!title || !title.trim()) return;

    try {
 // V2: generatedScenes (없으면 하위 호환)
        const scenes = confessionState.generatedScenes || confessionState.scenes || [];
        
        if (scenes.length === 0) {
            throw new Error('저장할 장면이 not found. 먼저 기억을 현상 please.');
        }

        supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('No Supabase client');
        }

        const { saveMemoryGraph } = await import('./lib/repo.js');
        const state = appStore.getState();

 // V2: originalVector 함께 save
 // V3: confessionV3Data 
        const v3Meta = window.confessionV3Data || {};
        const memoryId = await saveMemoryGraph(supabaseClient, {
            memoryId: null,
            code: generateMemoryCode(),
            title: title.trim(),
            description: null,
            author_note: null,
            status: 'Fetus',
            source: 'confession',
            curator_id: state.currentUser?.id || null,
            sensory_anchor: v3Meta.sensory_anchor || null,
            body_response: v3Meta.body_response || null,
            self_questions: v3Meta.self_questions || null,
            scenes: scenes.map((scene, index) => ({
                text: scene.text || '',
                sceneType: scene.sceneType || scene.scene_type || (index === scenes.length - 1 ? 'ending' : 'branch'),
                echoWords: scene.echoWords || [],
                emotionDist: scene.emotionDist || {},
                voidInfo: scene.voidInfo || null,
                choices: scene.choices || [],
                originalChoice: scene.originalChoice || 0,
                originalReason: scene.originalReason || '',
 // V2: originalVector 내장
                originalEmotion: scene.originalVector?.base || confessionState.originalVector?.base || scene.originalEmotion || {},
                originalReasonVector: scene.originalVector?.reason_analysis || confessionState.originalVector?.reason_analysis || scene.originalReasonVector || null,
 // TEM contamination: scene create 시 또 Admin 재create으 채워짐
                text_stage_1: scene.text_stage_1 || null,
                text_stage_2: scene.text_stage_2 || null,
                text_stage_3: scene.text_stage_3 || null,
            }))
        });

        console.log('[Memory] V2 memory save complete:', memoryId);
        alert('기억이 지층에 묻혔습니다.');
        endConfession();

 // Archive mode면 list 새 고침
        if (state.currentMode === 'archive') {
            await loadMemoriesFromSupabase();
            sortMemories('all');
        }

    } catch (error) {
        console.error('Save error:', error);
        alert('저장 failed: ' + (error.message || 'Unknown error'));
    }
}

window.startConfession = startConfession;
window.endConfession = endConfession;
window.generateSceneFromRitual = generateSceneFromRitual;
window.saveAndBury = saveAndBury;

// ───── Confession Hub ─────

// Confession Hub display
function showConfessionHub() {
    console.log('=== Showing Confession Hub ===');
    const introScreen = document.getElementById('introScreen');
    if (introScreen) {
        introScreen.classList.add('hidden');
        introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important';
    }

    hideAllScreens();

    const confessionHub = document.getElementById('confessionHub');
    if (confessionHub) {
        confessionHub.classList.remove('hidden');
        confessionHub.style.display = 'flex';
        confessionHub.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important';
    }

 // ASCII Door initialization
    cancelAnimationFrame(doorRaf);
    setTimeout(() => initDoor(), 100);
}
window.showConfessionHub = showConfessionHub; // 인트로 메뉴 클릭용 — 모듈 후반(5830) 도달 전 에러 시에도 사용 가능하도록 여기서 한 번 할당

// ===== ASCII Door Engine =====
const DOOR_W = 80, DOOR_H = 45;
let doorPhase = -1;
let doorStart = 0;
let doorRaf = 0;

function doorEase3(t) { return 1 - Math.pow(1 - t, 3); }
function doorEase2(t) { return t * t; }

function buildDoor(ph, pr) {
  const g = Array.from({ length: DOOR_H }, () => Array(DOOR_W).fill(' '));
  const cx = DOOR_W >> 1, cy = DOOR_H >> 1, dw = 16, dh = 28;
  const dl = cx - (dw >> 1), dr = cx + (dw >> 1);
  const dt = cy - (dh >> 1), db = cy + (dh >> 1);

  if (ph === 0 || ph === 1) {
    const op = ph === 1 ? doorEase3(pr) : 0;
    for (let y = dt - 1; y <= db + 1; y++) {
      if (y >= 0 && y < DOOR_H) {
        if (dl - 1 >= 0) g[y][dl - 1] = '║';
        if (dr + 1 < DOOR_W) g[y][dr + 1] = '║';
      }
    }
    for (let x = dl - 1; x <= dr + 1; x++) {
      if (x >= 0 && x < DOOR_W) {
        if (dt - 1 >= 0) g[dt - 1][x] = '═';
        if (db + 1 < DOOR_H) g[db + 1][x] = '═';
      }
    }
    if (dt - 1 >= 0 && dl - 1 >= 0) g[dt - 1][dl - 1] = '╔';
    if (dt - 1 >= 0 && dr + 1 < DOOR_W) g[dt - 1][dr + 1] = '╗';
    if (db + 1 < DOOR_H && dl - 1 >= 0) g[db + 1][dl - 1] = '╚';
    if (db + 1 < DOOR_H && dr + 1 < DOOR_W) g[db + 1][dr + 1] = '╝';

    const vw = Math.max(1, Math.round(dw * (1 - op * 0.9)));
    for (let y = dt; y <= db; y++) {
      for (let i = 0; i < vw; i++) {
        const x = dl + i;
        if (x < 0 || x >= DOOR_W || y < 0 || y >= DOOR_H) continue;
        if (y === dt || y === db) { g[y][x] = '─'; }
        else if (i === 0 || i === vw - 1) { g[y][x] = '│'; }
        else {
          const py = y - dt, rh = db - dt;
          const p1t = Math.floor(rh * 0.12), p1b = Math.floor(rh * 0.42);
          const p2t = Math.floor(rh * 0.52), p2b = Math.floor(rh * 0.88);
          const pl = 3, pr2 = vw - 4;
          if (i >= pl && i <= pr2 && (py === p1t || py === p1b || py === p2t || py === p2b)) g[y][x] = '─';
          else if (i >= pl && i <= pr2 && ((py > p1t && py < p1b) || (py > p2t && py < p2b)) && (i === pl || i === pr2)) g[y][x] = '│';
          else g[y][x] = '░';
        }
      }
      const kx = dl + vw - 3;
      if (kx >= 0 && kx < DOOR_W && y === cy) g[y][kx] = '◉';
    }
  }

  if (ph === 2) {
    const t = doorEase2(pr), s = 1 + t * 7;
    for (let y = 0; y < DOOR_H; y++) {
      for (let x = 0; x < DOOR_W; x++) {
        const ox = cx + (x - cx) / s, oy = cy + (y - cy) / s;
        if (ox >= dl - 1 && ox <= dr + 1 && oy >= dt - 1 && oy <= db + 1) {
          const onEdge = Math.abs(ox - (dl - 1)) < 0.6 || Math.abs(ox - (dr + 1)) < 0.6 ||
            Math.abs(oy - (dt - 1)) < 0.6 || Math.abs(oy - (db + 1)) < 0.6;
          if (onEdge && (1 - t) > 0.15) g[y][x] = (1 - t) > 0.5 ? '║' : '│';
        }
      }
    }
  }

  return g;
}

function renderDoorFrame() {
  const pre = document.getElementById('doorPre');
  if (!pre) return;

  let ph = doorPhase, pr = 0;
  if (ph === -1 || ph === 0) { pr = 0; ph = 0; }
  else if (ph === 1) {
    pr = Math.min((performance.now() - doorStart) / 1200, 1);
    if (pr >= 1) { doorPhase = 2; doorStart = performance.now() + 300; }
  } else if (ph === 2) {
    const el = performance.now() - doorStart;
    if (el < 0) pr = 0;
    else {
      pr = Math.min(el / 1600, 1);
      if (pr >= 1) { doorPhase = 3; }
    }
  } else if (ph === 3) {
    doorPhase = 4; // prevent re-entry
    pre.textContent = Array(DOOR_H).fill(' '.repeat(DOOR_W)).join('\n');
    setTimeout(() => startBeginner(), 400);
    return;
  } else if (ph >= 4) {
    return; // already transitioned
  }

  const g = buildDoor(ph, pr);
  pre.textContent = g.map(r => r.join('')).join('\n');
  doorRaf = requestAnimationFrame(renderDoorFrame);
}

function initDoor() {
  doorPhase = -1;
  const pre = document.getElementById('doorPre');
  if (!pre) return;
  const g = buildDoor(0, 0);
  pre.textContent = g.map(r => r.join('')).join('\n');

  const title = document.getElementById('doorTitle');
  const subtitle = document.getElementById('doorSubtitle');
  const backBtn = document.getElementById('doorBackBtn');
  const screen = document.getElementById('doorScreen');

  if (title) { title.classList.remove('visible', 'hiding'); }
  if (subtitle) { subtitle.classList.remove('visible', 'hiding'); }
  if (backBtn) { backBtn.classList.remove('visible', 'hiding'); }
  if (screen) { screen.classList.remove('done'); screen.style.cursor = 'pointer'; }

  setTimeout(() => { if (title) title.classList.add('visible'); }, 300);
  setTimeout(() => { if (subtitle) subtitle.classList.add('visible'); }, 700);
  setTimeout(() => { if (backBtn) backBtn.classList.add('visible'); }, 1200);

  doorPhase = 0;
  doorRaf = requestAnimationFrame(renderDoorFrame);
}

function handleDoorClick() {
  if (doorPhase !== 0) return;
  doorPhase = 1;
  doorStart = performance.now();

  setTimeout(() => {
    const title = document.getElementById('doorTitle');
    const subtitle = document.getElementById('doorSubtitle');
    const backBtn = document.getElementById('doorBackBtn');
    if (title) title.classList.add('hiding');
    if (subtitle) subtitle.classList.add('hiding');
    if (backBtn) backBtn.classList.add('hiding');
  }, 600);

  const screen = document.getElementById('doorScreen');
  if (screen) screen.style.cursor = 'default';

  doorRaf = requestAnimationFrame(renderDoorFrame);
}

window.handleDoorClick = handleDoorClick;
window.initDoor = initDoor;

// Record Chat start (대화형 기억 수집)
async function startBeginner() {
    console.log('=== Record Chat Start ===');
    hideAllScreens();

    // introScreen도 명시적으로 숨김 (hideAllScreens가 처리하지 않는 경우)
    const introScreen = document.getElementById('introScreen');
    if (introScreen) {
        introScreen.classList.add('hidden');
        introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important';
    }

    // 로그인 없이 대화 허용 — 저장 시점에만 로그인 요구
    appStore.setState({ currentMode: 'record' });

    const container = document.getElementById('recordChatContainer');
    if (!container) return;
    container.classList.remove('hidden');
    container.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important';

    const lang = /[가-힣]/.test(document.documentElement.lang || '') ? 'ko' : 'ko';

    const { initRecordChat } = await import('./app/recordChat.js');
    initRecordChat(container, {
        lang,
        onComplete: async (extractedScene) => {
            await handleRecordComplete(extractedScene, lang);
        },
        onCancel: () => {
            endRecordChat();
            showConfessionHub();
        }
    });
}

async function handleRecordComplete(extractedScene, lang) {
    const { showLoadingScreen, showSceneReview, showBurialAnimation } = await import('./app/burialAnimation.js');
    const burialContainer = document.getElementById('burialContainer');
    if (!burialContainer) return;

    // Phase B: 로딩 화면
    const recordContainer = document.getElementById('recordChatContainer');
    if (recordContainer) { recordContainer.classList.add('hidden'); recordContainer.style.display = 'none'; }
    burialContainer.classList.remove('hidden');
    burialContainer.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important';
    showLoadingScreen(burialContainer, lang);

    // generate-scene-from-conversation 호출
    try {
        const token = await getAccessToken().catch(() => null) || SUPABASE_ANON_KEY;
        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-scene-from-conversation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ conversationData: extractedScene, lang }),
        });

        if (!response.ok) throw new Error('Scene generation failed');
        const sceneData = await response.json();

        // Phase C: 장면 확인
        showSceneReview(burialContainer, {
            scenes: sceneData.scenes,
            originalVector: sceneData.originalVector,
            lang,
            onConfirm: async () => {
                // Supabase에 저장
                const memoryId = await saveRecordMemory(extractedScene, sceneData, lang);

                // Phase D: 매장 연출
                showBurialAnimation(burialContainer, {
                    originalVector: sceneData.originalVector,
                    lang,
                    onArchive: () => {
                        burialContainer.classList.add('hidden');
                        burialContainer.style.display = 'none';
                        enterArchive();
                    }
                });
            },
            onRetry: () => {
                burialContainer.classList.add('hidden');
                burialContainer.style.display = 'none';
                startBeginner(); // 다시 대화 시작
            }
        });
    } catch (e) {
        console.error('[Record] Scene generation error:', e);
        showNotification(lang === 'en' ? 'Failed to create scenes. Please try again.' : '장면 생성에 실패했습니다. 다시 시도해주세요.');
        burialContainer.classList.add('hidden');
        burialContainer.style.display = 'none';
        startBeginner();
    }
}

async function saveRecordMemory(conversationData, sceneData, lang) {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Supabase not initialized');

        const state = appStore.getState();
        const userId = state.currentUser?.id;

        // memories 테이블에 저장
        const title = conversationData.situation
            ? (conversationData.situation.substring(0, 50) + (conversationData.situation.length > 50 ? '...' : ''))
            : (lang === 'en' ? 'Untitled Memory' : '제목 없는 기억');

        const { data: memory, error: memError } = await supabase
            .from('memories')
            .insert({
                title: title,
                completed_sentence: conversationData.situation || '',
                sensory_anchor: conversationData.sensory_anchor || null,
                status: 'Fetus',
                curator_id: userId || null,
                original_vector: sceneData.originalVector?.base || null,
                original_reason_vector: sceneData.originalVector?.reason_analysis || null,
                lang: lang,
            })
            .select('id')
            .single();

        if (memError) throw memError;

        // scenes 테이블에 5장면 저장
        const scenesToInsert = sceneData.scenes.map((s, i) => ({
            memory_id: memory.id,
            order_index: s.order || i + 1,
            scene_type: s.sceneType || 'normal',
            text: s.text,
            emotion_cue: s.emotionCue || '',
            original_vector: s.originalVector?.base || null,
            original_reason_vector: s.originalVector?.reason_analysis || null,
            vector_weight: s.vectorWeight || 0,
        }));

        const { error: sceneError } = await supabase
            .from('scenes')
            .insert(scenesToInsert);

        if (sceneError) throw sceneError;

        console.log('[Record] Memory saved:', memory.id);
        return memory.id;
    } catch (e) {
        console.error('[Record] Save error:', e);
        showNotification(lang === 'en' ? 'Failed to save memory.' : '기억 저장에 실패했습니다.');
        return null;
    }
}

function endRecordChat() {
    const container = document.getElementById('recordChatContainer');
    if (container) {
        container.classList.add('hidden');
        container.style.display = 'none';
        container.innerHTML = '';
    }
    const burial = document.getElementById('burialContainer');
    if (burial) {
        burial.classList.add('hidden');
        burial.style.display = 'none';
        burial.innerHTML = '';
    }
}

// Ritual mode start (existing Live narrator 플 우, 소켓 remove)
function startRitual() {
    console.log('=== Confession Hub ===');
    console.log('Mode: ritual');
    hideAllScreens();
    startRitualFlow();
}

// The Architect 잠금 message
function showArchitectLocked() {
    alert('준비 중. 곧 공개됩니다.');
}

// 메인 메뉴 돌아 기
function showMainMenu() {
    const introScreen = document.getElementById('introScreen');
    const confessionHub = document.getElementById('confessionHub');

    if (confessionHub) {
        confessionHub.classList.add('hidden');
        confessionHub.style.display = 'none';
    }

    if (introScreen) {
        introScreen.classList.remove('hidden');
        introScreen.classList.add('visible');
        introScreen.style.cssText = 'display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important';
    }
}

// 모든 screen hide 헬퍼 function
function hideAllScreens() {
    ['modeSelection', 'sessionSetup', 'liveContainer', 'archiveContainer', 'endScreen', 'mypageScreen', 'loginModal', 'signupModal', 'confessionHub', 'recordChatContainer', 'burialContainer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active');
            el.classList.add('hidden');
            el.style.display = 'none';
        }
    });
}

// Confession 플 우 start — redirects to Record Chat
function startConfessionFlow(mode) {
    appStore.setState({ currentMode: mode || 'record' });
    startBeginner();
}

// Ritual 플 우 start (소켓 remove 버전)
let currentSceneIndex = 0;
let ritualScenes = [];

async function startRitualFlow() {
    console.log('=== Starting Ritual Flow ===');
    appStore.setState({ currentMode: 'ritual', currentRole: 'A' });
    const state = appStore.getState();
    currentSceneIndex = 0;
    ritualScenes = [];

 // 모든 screen hide
    hideAllScreens();

 // Live narrator screen display (소켓 없 )
    try {
        window.currentStoryData = storyData;
        appStore.setState({ 
            currentSceneOrder: 1,
            currentScene: 0,
            userChoices: [],
            userReasons: [],
            currentAlignment: 0,
            pendingSceneText: ''
        });
        resetLiveState();

 // UI initialization
        const sceneContent = document.querySelector('#generatedSceneContent .generated-text');
        if (sceneContent) sceneContent.textContent = '';

        const emotionContent = document.querySelector('#generatedEmotionContent .generated-text');
        if (emotionContent) emotionContent.textContent = '';

        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '<div class="chat-message ai"><div class="chat-message-label">Another Me</div><div class="chat-message-content">기억을 이야기해줘. 천천히, 편하게.</div></div>';
        }

        const editBtn = document.querySelector('.edit-toggle-btn');
        if (editBtn) {
            editBtn.textContent = 'Edit';
            editBtn.classList.remove('active');
        }

        const sceneTextarea = document.getElementById('editSceneTextarea');
        if (sceneTextarea) {
            sceneTextarea.style.display = 'none';
            sceneTextarea.value = '';
        }

        const emotionTextarea = document.getElementById('editEmotionTextarea');
        if (emotionTextarea) {
            emotionTextarea.style.display = 'none';
            emotionTextarea.value = '';
        }

        const sceneTextEl = document.querySelector('#generatedSceneContent .generated-text');
        if (sceneTextEl) sceneTextEl.style.display = 'block';

        switchGeneratedTab('scene');

 // Live Container display
        const liveContainerEl = document.getElementById('liveContainer');
        if (liveContainerEl) {
            liveContainerEl.classList.add('active');
            liveContainerEl.style.cssText = 'display:block !important';
        }

        const liveContentEl = document.querySelector('.live-content');
        if (liveContentEl) {
            liveContentEl.classList.add('narrator-mode');
        }

 // Narrator Panel active화
        const narratorPanelEl = document.getElementById('narratorPanel');
        if (narratorPanelEl) {
            narratorPanelEl.classList.add('active');
        }

        const interpretationTrace = document.getElementById('interpretationTrace');
        const traceContent = document.getElementById('traceContent');
        if (interpretationTrace && traceContent) {
            interpretationTrace.style.display = 'block';
            traceContent.textContent = 'Create 5 scenes. Enter and save each scene to proceed to the next.';
        }

        showNpcDialogue("당신의 기억을 불러오세요. 5개의 장면을 직접 구성합니다.", 4000);

        const narratorCanvas = document.getElementById('alignmentWaveCanvas');
        const experiencerCanvas = document.getElementById('expAlignmentWaveCanvas');
        const state = appStore.getState();

 // calculation index.js 서 수행 (Visualizer 숫자 받음)
        const narratorWaveStyle = window.narratorEmotionVector ? emotionVectorToWaveStyle(window.narratorEmotionVector) : null;
        const experiencerWaveStyle = window.experiencerEmotionVector ? emotionVectorToWaveStyle(window.experiencerEmotionVector) : null;

        visualizer.startAlignmentWaveAnimation(narratorCanvas, experiencerCanvas, {
            alignment: state.currentAlignment,
            narratorEmotionVector: window.narratorEmotionVector,
            experiencerEmotionVector: window.experiencerEmotionVector,
            narratorWaveStyle: narratorWaveStyle,
            experiencerWaveStyle: experiencerWaveStyle,
            onUpdateAlignmentDisplay: (alignmentValue) => {
                const alignmentPercent = Math.round(alignmentValue * 100);
                const percentageEl = document.getElementById('alignmentPercentage');
                if (percentageEl) percentageEl.textContent = String(alignmentPercent).padStart(2, '0') + '%';
                const expPercentageEl = document.getElementById('expAlignmentPercentage');
                if (expPercentageEl) expPercentageEl.textContent = String(alignmentPercent).padStart(2, '0') + '%';
            }
        });
        setTimeout(() => {
            startVoiceWaveLiveAnimation();
        }, 300);

        const footer = document.querySelector('.footer');
        if (footer) footer.classList.add('visible');

        console.log('Ritual mode Live narrator screen display complete');
    } catch (e) {
        console.error('startRitualFlow error:', e);
        showNotification('Error starting Ritual mode: ' + e.message);
    }
}

// Ritual scene save (소켓 대신 local save)
async function saveRitualScene(sceneData) {
    console.log('=== Ritual Scene 저장 ===');
    console.log('sceneData:', JSON.stringify(sceneData));

    ritualScenes.push(sceneData);
    console.log(`Ritual Scene 저장됨: ${ritualScenes.length}/5`);

 // UI update
    const traceContent = document.getElementById('traceContent');
    if (traceContent) {
        traceContent.textContent = `Scene ${ritualScenes.length}/5 저장됨. ${ritualScenes.length < 5 ? '다음 장면을 입력하세요.' : '모든 장면이 저장 complete.'}`;
    }

 // next scene 위 initialization
    resetLiveState();
    appStore.setState({ pendingSceneText: '' });

    const sceneContent = document.querySelector('#generatedSceneContent .generated-text');
    if (sceneContent) sceneContent.textContent = '';

    const emotionContent = document.querySelector('#generatedEmotionContent .generated-text');
    if (emotionContent) emotionContent.textContent = '';

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '<div class="chat-message ai"><div class="chat-message-label">Another Me</div><div class="chat-message-content">기억을 이야기해줘. 천천히, 편하게.</div></div>';
    }

    if (ritualScenes.length >= 5) {
        showNotification('All 5 scenes saved. Saving memory...');
        await saveRitualToMemories();
    } else {
        currentSceneIndex = ritualScenes.length;
        showNotification(`Scene ${ritualScenes.length}/5 저장됨. 다음 장면을 입력하세요.`);
    }
}

// Ritual complete 시 memories/scenes 테 블 save
async function saveRitualToMemories() {
    console.log('=== Ritual complete, saving memory ===');

    const memoryData = {
        title: ritualScenes[0]?.coreObject || 'Untitled',
        source: 'ritual',
        status: 'Fetus'
    };

    console.log('Source:', memoryData.source);

    try {
        const { saveMemoryGraph } = await import('./lib/repo.js');
        supabaseClient = getSupabaseClient();

        if (!supabaseClient) {
            throw new Error('Supabase client not initialized.');
        }

        console.log('[Memory] New memory created with status: Fetus');
        const confessionState_ = appStore.getState();
        const memoryId = await saveMemoryGraph(supabaseClient, {
            memoryId: null,
            code: generateMemoryCode(),
            title: memoryData.title,
            description: null,
            author_note: null,
            status: memoryData.status,
            source: memoryData.source,
            curator_id: confessionState_.currentUser?.id || null,
            scenes: ritualScenes.map((scene, index) => ({
                text: scene.text || '',
                sceneType: scene.sceneType || 'normal',
                echoWords: scene.echoWords || [],
                emotionDist: scene.emotionDist || {},
                voidInfo: scene.voidInfo || null,
                choices: scene.choices || [],
                originalChoice: scene.originalChoice || 0,
                originalReason: scene.originalReason || '',
                originalEmotion: scene.originalEmotion || null,
                originalReasonVector: scene.originalReasonVector || null
            }))
        });

        showRitualComplete(memoryId);
    } catch (error) {
        console.error('Ritual Save error:', error);
        alert('저장 failed: ' + (error.message || 'Unknown error'));
    }
}

function showRitualComplete(memoryId) {
    alert(`Ritual 기억이 저장 complete. (ID: ${memoryId})`);
    showMainMenu();
}

function generateMemoryCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// global 스코프 노출
window.showConfessionHub = showConfessionHub;
window.startBeginner = startBeginner;
window.startRitual = startRitual;
window.showArchitectLocked = showArchitectLocked;
window.showMainMenu = showMainMenu;
window.saveArchiveEmotionToPlays = saveArchiveEmotionToPlays; // expInterview.js에서 사용

// test용 function export (test-chat-pipeline.js 서 )
window.sendExpChatMessageWithDeps = sendExpChatMessageWithDeps;
window.sendChatMessageWithDeps = sendChatMessageWithDeps;
window.parseEmotionAnalysisResult = parseEmotionAnalysisResult;
window.parseSceneGenerationResult = parseSceneGenerationResult;
window.AIService = AIService; // 테스트에서 모킹할 수 있도록 노출
window.MemoryService = MemoryService; // 테스트에서 사용할 수 있도록 노출
window.getSupabaseClient = getSupabaseClient; // Strata 뷰에서 사용
window.networkService = networkService; // Strata 뷰에서 사용

// 디버깅 헬퍼 function들 (콘솔 서 바 possible)
window.debug = {
 // archive move
    goToArchive: async () => {
        await enterArchive();
        console.log('✅ Go to archive했습니다');
    },
 // current state check
    showState: () => {
        const state = appStore.getState();
        console.log('📊 현재 Status:', {
            currentMode: state.currentMode,
            currentMemory: state.currentMemory,
            currentScene: state.currentScene,
            allMemoriesCount: state.allMemoriesData.length,
            currentMemoryData: state.allMemoriesData[state.currentMemory],
            currentAlignment: state.currentAlignment
        });
        return state;
    },
    
 // memory list check
    listMemories: () => {
        const state = appStore.getState();
        console.log('📚 메모리 목록:');
        state.allMemoriesData.forEach((m, i) => {
            console.log(`  [${i}] ${m.title || '제목 없음'} (ID: ${m.id}, Code: ${m.code})`);
        });
        return state.allMemoriesData;
    },
    
};

console.log('🔧 디버깅 헬퍼 함수가 로드 complete. window.debug를 사용하세요.');
console.log('📖 사용법:');
console.log('  - debug.goToArchive() - Go to archive');
console.log('  - debug.showState() - 현재 Status 확인');
console.log('  - debug.listMemories() - Check memory list');

// Initialize on DOMContentLoaded (모든 variable 선언 후 execute 보장)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
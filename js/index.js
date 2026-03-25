import { getSupabaseClient, onAuthStateChange, getSession } from './lib/supabaseClient.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './lib/config.js';
import { detectCrisis, getRandomDialogue, CRISIS_DIALOGUES, SAFETY_RESOURCES } from './safety.js';
import { NPC_DIALOGUES } from './npc-dialogues.js';

// Shared modules
import { fetchMemories, fetchScenes, savePlay, saveNote, fetchNotes, activateMemoryIfFetus } from './shared/api.js';
import { playSound, stopSound, setVolume, SOUNDS } from './shared/audio.js';
import { cosineSimilarity, normalizeVector, addVectors, calculateAlignment, getBucket, checkFixated, getDominantEmotion, normalizeAnchor, projectEmotionToVAD } from './shared/math.js';
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

            // Clean URL hash/query (remove exposed tokens)
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname);
            }

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
async function handleLogin() { const email = document.getElementById('loginUsername').value.trim(); const password = document.getElementById('loginPassword').value.trim(); if (!email || !password) { showNotification('Please enter email and password'); return } supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password }); if (error) { showNotification('Sign in failed: ' + error.message); return } appStore.setState({ isLoggedIn: true, currentUser: { id: data.user.id, username: data.user.user_metadata?.username || email.split('@')[0], email: email, joinDate: new Date(data.user.created_at).toLocaleDateString('en-US'), liveSessions: 0, memories: 0, interpretations: 0, visitedMemories: [], sessionHistory: [] } }); const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = ''; showNotification('Signed in successfully'); if (pendingSaveAction === 'save') { pendingSaveAction = null; setTimeout(() => { saveMemory() }, 300) } else { showMypage() } }
function closeLogin() { const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = ''; pendingSaveAction = null }
function switchToSignup() { const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.add('active'); signupModal.style.cssText = 'display:flex !important;z-index:2100 !important' } document.getElementById('signupUsername').focus() }
function switchToLogin() { const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.add('active'); loginModal.style.cssText = 'display:flex !important;z-index:2100 !important' } document.getElementById('loginUsername').focus() }
async function handleSignup() { const username = document.getElementById('signupUsername').value.trim(); const email = document.getElementById('signupEmail').value.trim(); const password = document.getElementById('signupPassword').value.trim(); const passwordConfirm = document.getElementById('signupPasswordConfirm').value.trim(); if (!username || !email || !password || !passwordConfirm) { showNotification('Please fill in all fields'); return } if (password !== passwordConfirm) { showNotification('Passwords do not match'); return } if (password.length < 6) { showNotification('Password must be at least 6 characters'); return } supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } const { data, error } = await supabaseClient.auth.signUp({ email: email, password: password, options: { data: { username: username } } }); if (error) { showNotification('Sign up failed: ' + error.message); return } appStore.setState({ isLoggedIn: true, currentUser: { id: data.user.id, username: username, email: email, joinDate: new Date().toLocaleDateString('en-US'), liveSessions: 0, memories: 0, interpretations: 0, visitedMemories: [], sessionHistory: [] } }); const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } document.getElementById('signupUsername').value = ''; document.getElementById('signupEmail').value = ''; document.getElementById('signupPassword').value = ''; document.getElementById('signupPasswordConfirm').value = ''; showNotification('Sign up complete'); if (pendingSaveAction === 'save') { pendingSaveAction = null; setTimeout(() => { saveMemory() }, 300) } else { showMypage() } }
function closeSignup() { const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } document.getElementById('signupUsername').value = ''; document.getElementById('signupEmail').value = ''; document.getElementById('signupPassword').value = ''; document.getElementById('signupPasswordConfirm').value = '' }
async function handleSocialLogin(provider) { if (provider === 'google') { supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } const { data, error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); if (error) { showNotification('Google sign in failed: ' + error.message) } } else { showNotification('Coming soon') } }
async function handleLogout() { if (confirm('Are you sure you want to sign out?')) { supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase client not initialized'); return } await supabaseClient.auth.signOut(); appStore.setState({ isLoggedIn: false, currentUser: null }); closeMypage(); showNotification('Signed out successfully') } }
function updateUserStats(type, value = 1) { const state = appStore.getState(); if (!state.isLoggedIn || !state.currentUser) return; const currentUser = state.currentUser; if (type === 'liveSession') { currentUser.liveSessions = (currentUser.liveSessions || 0) + value } else if (type === 'memory') { if (!currentUser.visitedMemories) currentUser.visitedMemories = []; if (!currentUser.visitedMemories.includes(value)) { currentUser.visitedMemories.push(value); currentUser.memories = (currentUser.memories || 0) + 1 } } else if (type === 'interpretation') { currentUser.interpretations = (currentUser.interpretations || 0) + value } appStore.setState({ currentUser: currentUser }); if (document.getElementById('mypageScreen') && document.getElementById('mypageScreen').classList.contains('active')) { showMypage() } }
function showModeSelection() { const introScreen = document.getElementById('introScreen'); const matchingSelection = document.getElementById('matchingSelection'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } if (matchingSelection) { matchingSelection.classList.add('active'); matchingSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
function selectMatching(type) { if (type === 'session') { const matchingSelection = document.getElementById('matchingSelection'); const modeSelection = document.getElementById('modeSelection'); if (matchingSelection) { matchingSelection.classList.remove('active'); matchingSelection.style.display = 'none' } if (modeSelection) { modeSelection.classList.add('active'); modeSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } } else { showNotification('Coming soon') } }
function backToMatchingSelection() { const matchingSelection = document.getElementById('matchingSelection'); const modeSelection = document.getElementById('modeSelection'); if (modeSelection) { modeSelection.classList.remove('active'); modeSelection.style.display = 'none' } if (matchingSelection) { matchingSelection.classList.add('active'); matchingSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
function backToIntro() { if (window.soundscape) window.soundscape.stop(); const introScreen = document.getElementById('introScreen'); if (introScreen) { introScreen.classList.remove('hidden'); introScreen.classList.add('visible'); introScreen.style.cssText = 'display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important' } ['matchingSelection', 'modeSelection', 'sessionSetup', 'liveContainer', 'archiveContainer', 'endScreen', 'mypageScreen', 'loginModal', 'signupModal'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); const footer = document.querySelector('.footer'); if (footer) footer.classList.remove('visible'); stopAllAnimations() }
function backToModeSelection() { const sessionSetupEl = document.getElementById('sessionSetup'); if (sessionSetupEl) { sessionSetupEl.classList.remove('active'); sessionSetupEl.style.display = 'none' } const modeSelectionEl = document.getElementById('modeSelection'); if (modeSelectionEl) { modeSelectionEl.classList.add('active'); modeSelectionEl.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
async function enterArchive(opts) { var fromDemo = opts && opts.fromDemo; const introScreen = document.getElementById('introScreen'); const archiveContainer = document.getElementById('archiveContainer'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } ['modeSelection', 'endScreen', 'liveContainer', 'sceneViewer'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); if (archiveContainer) { archiveContainer.classList.add('active'); archiveContainer.style.cssText = 'display:block !important;z-index:1900 !important' + (fromDemo ? ';visibility:hidden;opacity:0' : ''); }

  // Hub refactor: Archive 진입은 floating sentences → play-test로만.
  const entryEl = document.getElementById('archiveEntryContainer');
  const memoryListEl = document.getElementById('memoryList');
  const archiveControlsEl = document.getElementById('archiveControls');
  const archiveHeaderEl = document.querySelector('.archive-header');
  if (memoryListEl) memoryListEl.style.display = 'none';
  if (archiveControlsEl) archiveControlsEl.style.display = 'none';
  if (archiveHeaderEl) archiveHeaderEl.style.display = 'none';
  if (entryEl) entryEl.style.display = 'block';

  appStore.setState({ currentMode: 'archive' });
  stopAllAnimations();

  try {
    const mod = await import('./app/archiveEntry.js');
    if (mod && mod.initArchiveEntry) {
      await mod.initArchiveEntry(entryEl);
    }
  } catch (e) {
    console.error('[enterArchive] archiveEntry init failed:', e);
  }

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
function selectRole(role) { try { appStore.setState({ currentRole: role, currentMode: 'live' }); const modeSelectionEl = document.getElementById('modeSelection'); if (modeSelectionEl) { modeSelectionEl.classList.remove('active'); modeSelectionEl.style.display = 'none' } const sessionSetupEl = document.getElementById('sessionSetup'); if (sessionSetupEl) { sessionSetupEl.classList.add('active'); sessionSetupEl.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } if (role === 'A') { const narratorSetupEl = document.getElementById('narratorSetup'); const experiencerSetupEl = document.getElementById('experiencerSetup'); if (narratorSetupEl) narratorSetupEl.style.display = 'block'; if (experiencerSetupEl) experiencerSetupEl.style.display = 'none'; generateSessionCode() } else { const narratorSetupEl = document.getElementById('narratorSetup'); const experiencerSetupEl = document.getElementById('experiencerSetup'); if (narratorSetupEl) narratorSetupEl.style.display = 'none'; if (experiencerSetupEl) experiencerSetupEl.style.display = 'block' } } catch (e) { console.error('selectRole error:', e); showNotification('Role을 선택하는 중 An error occurred') } }
function generateSessionCode() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = ''; for (let i = 0; i < 5; i++)code += chars.charAt(Math.floor(Math.random() * chars.length)); sessionCode = code; document.getElementById('sessionCode').textContent = code; document.getElementById('waitingForB').classList.add('active'); createLiveSession() }
function copySessionCode() { navigator.clipboard.writeText(sessionCode); showNotification('Code copied') }
function joinSession() { joinLiveSession() }
async function createLiveSession() {
    console.log('=== createLiveSession start ===');
    console.log('sessionCode:', sessionCode);
    const state = appStore.getState();
    console.log('currentRole:', state.currentRole);

    // Wait for Supabase client initialization
    let retryCount = 0;
    const maxRetries = 20; // Max 10 second wait (20 * 500ms)

    while (retryCount < maxRetries) {
        supabaseClient = getSupabaseClient();
        if (supabaseClient) {
            console.log('Supabase client initialized');
            break;
        }
        console.log(`Supabase Waiting for client... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retryCount++;
    }

    if (!supabaseClient) {
        console.error('supabaseClient not initialized (max wait time exceeded)');
        console.error('window.supabase exists:', typeof window.supabase !== 'undefined');
        showNotification('Failed to connect to Supabase. Please check your network connection.');
        return null;
    }

    const roleCheckState = appStore.getState(); if (roleCheckState.currentRole !== 'A') {
        console.warn('Not the narrator');
        return null;
    }

    let userId;
    if (state.currentUser) { userId = state.currentUser.id } else {
        if (!window.anonymousUserId) {
            window.anonymousUserId = crypto.randomUUID();
        }
        userId = window.anonymousUserId;
    }

    console.log('userId:', userId);

    try {
        // Check network connection
        console.log('Checking network connection...');
        try {
            const testResponse = await fetch('https://bxmppaxpzbkwebfbgpsm.supabase.co/rest/v1/', {
                method: 'HEAD',
                mode: 'no-cors' // Check connection only, ignore CORS errors
            });
            console.log('Network connection verified');
        } catch (networkError) {
            console.warn('Network check failed (continuing):', networkError);
        }

        const sessionData = {
            session_code: sessionCode,
            narrator_id: userId,
            experiencer_id: null,
            alignment: 0
        };

        console.log('Attempting to insert session data:', sessionData);
        console.log('Supabase URL:', supabaseClient.supabaseUrl);

        const result = await networkService.createSession(sessionData);

        if (!result.ok) {
            console.error('Session creation failed:', result.error);
            if (result.error && result.error.message) {
                const errorMsg = result.error.message.includes('Failed to fetch') ||
                    result.error.message.includes('ERR_NAME_NOT_RESOLVED') ||
                    result.error.message.includes('ERR_INTERNET_DISCONNECTED')
                    ? 'Unable to verify internet connection.\n\n' +
                    'Please check:\n' +
                    '1. Internet connection\n' +
                    '2. Firewall/proxy settings\n' +
                    '3. DNS server settings\n' +
                    '4. Supabase service status'
                    : 'Session creation failed: ' + result.error.message;
                showNotification(errorMsg);
            } else {
                showNotification('Failed to create session');
            }
            return null;
        }

        const data = result.data;
        if (!data) {
            console.error('Session not created (data is null)');
            showNotification('Session creation failed: no data returned');
            return null;
        }

        console.log('Session created successfully:', data);
        console.log('Session ID:', data.id);
        console.log('Session Code:', data.session_code);

        appStore.setState({ currentSessionId: data.id });
        subscribeToSessionJoin();
        subscribeToExperiencerChoices();

        showNotification('Session created. Code: ' + sessionCode);

        return data.id;
    } catch (e) {
        console.error('createLiveSession error:', e);
        console.error('Error details:', JSON.stringify(e, null, 2));
        showNotification('Session creation failed: ' + (e.message || 'Unknown error'));
        return null;
    }
}
function subscribeToSessionJoin() {
    const state = appStore.getState();
    const sessionId = state.currentSessionId;
    if (!sessionId) {
        console.log('Subscription failed: no currentSessionId');
        return;
    }
    realtimeService.subscribeToSessionJoin(sessionId, {
        onExperiencerJoin: (sessionData) => {
            console.log('Experiencer joined!', sessionData.experiencer_id);
            showNotification('An experiencer has joined!');
            const sessionSetupEl = document.getElementById('sessionSetup');
            if (sessionSetupEl) {
                sessionSetupEl.classList.remove('active');
                sessionSetupEl.style.display = 'none';
            }
            setTimeout(() => startLiveSession(), 500);
        },
        onSubscribed: () => {
            checkExperiencerJoin();
        }
    });
}
async function checkExperiencerJoin() {
    const state = appStore.getState();
    if (!state.currentSessionId || state.currentRole !== 'A') return;

    // Clean up existing interval
    realtimeService.clearInterval('experiencerCheck');

    const intervalId = setInterval(async () => {
        try {
            const currentState = appStore.getState();
            const result = await networkService.getSessionExperiencerId(currentState.currentSessionId);
            if (!result.ok) {
                console.error('Session query error:', result.error);
                return;
            }
            if (result.data && result.data.experiencer_id) {
                console.log('Experiencer joined (detected via polling)!', result.data.experiencer_id);
                realtimeService.clearInterval('experiencerCheck');
                showNotification('An experiencer has joined!');
                const sessionSetupEl = document.getElementById('sessionSetup');
                if (sessionSetupEl) {
                    sessionSetupEl.classList.remove('active');
                    sessionSetupEl.style.display = 'none';
                }
                setTimeout(() => startLiveSession(), 500);
            }
        } catch (e) {
            console.error('checkExperiencerJoin error:', e);
        }
    }, 2000);

    realtimeService.registerInterval('experiencerCheck', intervalId);

    setTimeout(() => {
        realtimeService.clearInterval('experiencerCheck');
        console.log('Polling ended (30s elapsed)');
    }, 30000);
}
function subscribeToLiveScenes() {
    const state = appStore.getState();
    const sessionId = state.currentSessionId;
    if (!sessionId) return;

    realtimeService.subscribeToLiveScenes(sessionId, {
        onSceneInsert: (sceneData) => {
            const roleState = appStore.getState();
            if (roleState.currentRole === 'B') {
                const sceneText = sceneData.scene_text;
                if (sceneText) {
                    const expSceneText = document.getElementById('expSceneText');
                    if (expSceneText) {
                        expSceneText.textContent = sceneText;
                        switchExpGeneratedTab('scene');
                        expCurrentPhase = 'interpret';
                        const emotionCueMsg = window.lastSceneData?.emotionCue || NPC_DIALOGUES.live.emotionCue;
                        addExpChatMessage('ai', 'The narrator\'s memory has arrived. ' + emotionCueMsg);
                        const expTextInput = document.getElementById('expTextInput');
                        if (expTextInput) {
                            expTextInput.value = '';
                            expTextInput.focus();
                        }
                    }
                }
            }
        }
    });
}
function subscribeToLiveInterpretations() {
    // Fully disabled since live_interpretations table does not exist
    realtimeService.subscribeToLiveInterpretations();
}
function displayExperiencerEmotionForNarrator(interpretation) { console.log('displayExperiencerEmotionForNarrator called:', interpretation); if (!interpretation || !interpretation.emotion_vector) { console.error('No interpretation data or emotion vector'); return } const emotionVector = interpretation.emotion_vector; console.log('Displaying experiencer emotion on narrator screen:', emotionVector); window.experiencerEmotionVector = emotionVector; const experiencerWave = computeWaveFromEmotion({ base: emotionVector }); window.currentExperiencerWave = experiencerWave; updateAlignmentWave(); showNotification('The experiencer has entered an emotion'); console.log('Experiencer emotion wave update complete') }
function subscribeToExperiencerChoices() {
    const state = appStore.getState();
    const sessionId = state.currentSessionId;
    if (!sessionId) {
        console.error('subscribeToExperiencerChoices: no currentSessionId');
        return;
    }

    realtimeService.subscribeToExperiencerChoices(sessionId, {
        onChoiceInsert: (choiceData) => {
            onExperiencerChoiceReceived(choiceData);
        }
    });
}
function onExperiencerChoiceReceived(choice) { console.log('Experiencer emotion arrived (choices table):', choice); console.log('emotion_vector:', choice.emotion_vector); if (!choice || !choice.emotion_vector) { console.error('No choice or emotion_vector'); return } const emotionVector = choice.emotion_vector; console.log('Reflecting experiencer emotion on narrator screen:', emotionVector); window.experiencerEmotionVector = emotionVector; const experiencerWave = computeWaveFromEmotion({ base: emotionVector }); window.currentExperiencerWave = experiencerWave; updateAlignmentWave(); if (window.narratorEmotionVector) { const engineResult = byeoriEngine.calculateStep({ userVector: { base: emotionVector }, originalVector: { base: window.narratorEmotionVector } }, {}); const alignment = engineResult.alignment_score; appStore.setState({ currentAlignment: alignment }); updateLiveAlignment(0); console.log('Alignment calculation complete (choices):', alignment) } showNotification('The experiencer has entered their emotion다 (choices)'); console.log('체험자 감정 파동 update 완료 (choices)') }
function subscribeToScenes() {
    const state = appStore.getState();
    const sessionId = state.currentSessionId;
    if (!sessionId) {
        console.error('subscribeToScenes: no currentSessionId');
        return;
    }

    realtimeService.subscribeToScenes(sessionId, {
        onSceneInsert: (sceneData) => {
            expCurrentPhase = 'interpret';
            const emotionCueMsg = window.lastSceneData?.emotionCue || NPC_DIALOGUES.live.emotionCue;
            uiManager.displaySceneForExperiencer(sceneData, {
                onSwitchTab: switchExpGeneratedTab,
                onAddChatMessage: addExpChatMessage,
                onShowNotification: showNotification
            }, emotionCueMsg, NPC_DIALOGUES.live.sceneArrived);
        }
    });
}
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
    console.log('[renderArchiveEmotionWave] waveCanvas found, before computeWaveFromEmotion');

    // Calculation done here (Visualizer receives numbers only)
    const waveData = computeWaveFromEmotion({ base: emotionVector, intensity: 0.5, confidence: 0.8 });
    console.log('[renderArchiveEmotionWave] computeWaveFromEmotion result:', waveData);
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
function computeArchiveWaveData(emotionVector, sceneTextLength, voidLevel) { const totalEmotion = Object.values(emotionVector).reduce((sum, val) => sum + (val || 0), 0); const normalizedEmotion = totalEmotion > 0 ? Object.keys(emotionVector).reduce((acc, key) => { acc[key] = (emotionVector[key] || 0) / totalEmotion; return acc }, {}) : emotionVector; const intensity = Math.min(1, Math.max(0.3, totalEmotion / 8)); const wavePoints = []; const width = Math.max(100, Math.min(500, sceneTextLength * 10)); for (let i = 0; i < width; i++) { const x = i / width; const baseY = 0.5; const amplitude = voidLevel === 'high' ? 0.15 : 0.25; const frequency = 0.02 + intensity * 0.01; const y = baseY + Math.sin(x * Math.PI * 2 * frequency * 10) * amplitude; wavePoints.push({ x, y }) } const dominantEmotion = Object.keys(normalizedEmotion).reduce((a, b) => normalizedEmotion[a] > normalizedEmotion[b] ? a : b, 'fear'); const emotionColors = { 'fear': 'rgba(74,144,217,0.8)', 'sadness': 'rgba(90,122,154,0.8)', 'guilt': 'rgba(139,115,85,0.8)', 'anger': 'rgba(217,74,74,0.8)', 'longing': 'rgba(196,168,130,0.8)', 'isolation': 'rgba(74,74,90,0.8)', 'numbness': 'rgba(106,106,106,0.8)', 'shame': 'rgba(155,89,182,0.8)', 'moral_pain': 'rgba(155,89,182,0.8)' }; return { wavePoints, color: emotionColors[dominantEmotion] || 'rgba(196,168,130,0.8)', intensity, voidLevel } }
async function checkAlignment() {
    const state = appStore.getState();
    if (!state.currentSessionId) return;
    if (window.narratorEmotionVector && window.experiencerEmotionVector) {
        const engineResult = byeoriEngine.calculateStep({ userVector: { base: window.experiencerEmotionVector }, originalVector: { base: window.narratorEmotionVector } }, {});
        const alignment = engineResult.alignment_score;
        appStore.setState({ currentAlignment: alignment });
        updateLiveAlignment(0);
        updateAlignmentWave();
        console.log('Alignment 계산 complete:', alignment);
        return;
    }
    // Fully disabled since live_interpretations table does not exist
    return;
}
function updateAlignmentWave() { const canvas = document.getElementById('alignmentWaveCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); if (!window.narratorEmotionVector || !window.experiencerEmotionVector) return; const narratorWave = computeWaveFromEmotion({ base: window.narratorEmotionVector }); const experiencerWave = computeWaveFromEmotion({ base: window.experiencerEmotionVector }); currentNarratorWave = narratorWave; window.currentExperiencerWave = experiencerWave; console.log('파동 update:', { narrator: narratorWave, experiencer: experiencerWave }) }
async function joinLiveSession() {
    console.log('=== joinLiveSession start ===');

    // Wait for Supabase client initialization
    let retryCount = 0;
    const maxRetries = 20; // Max 10 second wait (20 * 500ms)

    while (retryCount < maxRetries) {
        supabaseClient = getSupabaseClient();
        if (supabaseClient) {
            console.log('Supabase client initialized');
            break;
        }
        console.log(`Supabase Waiting for client... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retryCount++;
    }

    if (!supabaseClient) {
        console.error('Supabase 클라이언트가 initialization되지 않음 (최대 대기 시간 초과)');
        console.error('window.supabase exists:', typeof window.supabase !== 'undefined');
        showNotification('Failed to connect to Supabase. Please check your network connection.');
        return;
    }

    const code = document.getElementById('sessionCodeInput').value.trim().toUpperCase();
    console.log('Entered code:', code);

    if (!code || code.length !== 5) {
        console.warn('코드 형식 error:', code);
        showNotification('Please enter a valid code (5 digits)');
        return;
    }

    let userId;
    const state = appStore.getState(); if (state.currentUser) { userId = state.currentUser.id } else {
        if (!window.anonymousUserId) {
            window.anonymousUserId = crypto.randomUUID();
        }
        userId = window.anonymousUserId;
    }

    console.log('userId:', userId);

    try {
        console.log('Session search start, code:', code);
        console.log('Supabase URL:', supabaseClient.supabaseUrl);

        const findResult = await networkService.findSessionsByCode(code);

        if (!findResult.ok) {
            console.error('joinLiveSession query error:', findResult.error);
            showNotification('Session not found. Please check the code.');
            return;
        }

        const sessions = findResult.data || [];
        console.log('Found sessions:', sessions);
        console.log('Found session count:', sessions.length);

        if (sessions.length === 0) {
            console.warn('세션을 찾을 수 없음 - 코드:', code);
            showNotification('Session not found. Please check the code.');
            return;
        }

 // client 측 서 filter링
        const session = sessions.find(s =>
            s.session_code === code &&
            !s.experiencer_id &&
            !s.ended_at
        );

        console.log('Filtered sessions:', session);

        if (!session) {
            console.warn('No available sessions');
            console.log('세션 Status:', sessions.map(s => ({
                code: s.session_code,
                has_experiencer: !!s.experiencer_id,
                ended: !!s.ended_at
            })));
            showNotification('No available sessions. The session may already have a participant or has ended.');
            return;
        }

        console.log('세션 참여 시도, Session ID:', session.id);

        const joinResult = await networkService.joinSession(session.id, userId);

        if (!joinResult.ok) {
            console.error('참여 Failed:', joinResult.error);
            showNotification('Session join failed: ' + (joinResult.error?.message || 'Unknown error'));
            return;
        }

        console.log('세션 참여 성공:', joinResult.data);

        sessionCode = code;
        appStore.setState({ currentSessionId: session.id });

        showNotification('Connected to session!');
        subscribeToNarratorEmotion();
        setTimeout(() => startLiveSession(), 500);
    } catch (e) {
        console.error('joinLiveSession error:', e);
        console.error('Error stack:', e.stack);
        showNotification('Error during session join: ' + (e.message || 'Unknown error'));
    }
}
function subscribeToNarratorEmotion() {
    const state = appStore.getState();
    const sessionId = state.currentSessionId;
    if (!sessionId) {
        console.error('subscribeToNarratorEmotion: currentSessionId 없음');
        return;
    }

    realtimeService.subscribeToNarratorEmotion(sessionId, {
        onNarratorEmotionInsert: (sceneData) => {
            window.narratorEmotionVector = sceneData.emotion_vector;
            console.log('화자 감정 벡터 저장:', window.narratorEmotionVector);
            updateExperiencerAlignment();
        }
    });
}
function updateExperiencerAlignment() {
    if (!window.narratorEmotionVector || !window.experiencerEmotionVector) {
        console.log('Alignment 계산 불가: 감정 벡터 없음', { narrator: !!window.narratorEmotionVector, experiencer: !!window.experiencerEmotionVector });
        return;
    }

 // calculation 엔진 서 수행
    const engineResult = byeoriEngine.calculateStep({
        userVector: { base: window.experiencerEmotionVector },
        originalVector: { base: window.narratorEmotionVector }
    }, {});
    const alignment = engineResult.alignment_score;
    appStore.setState({ currentAlignment: alignment });

 // UI update UIManager 위임
    uiManager.updateExperiencerAlignmentDisplay(alignment);
    updateAlignmentWave();
    console.log('체험자 화면 Alignment update:', alignment);
}
async function saveLiveScene(sceneData) { console.log('=== saveLiveScene called ==='); console.log('sceneData:', JSON.stringify(sceneData)); const state = appStore.getState(); console.log('currentSessionId:', state.currentSessionId); console.log('liveSceneNum:', state.liveSceneNum); console.log('currentGeneratedScene:', currentGeneratedScene); if (!state.currentSessionId) { console.error('currentSessionId가 not found!'); showNotification('Session not found'); return } const sceneText = sceneData.text || currentGeneratedScene || state.pendingSceneText || ''; if (!sceneText || sceneText === '(no scenes)') { console.error('Scene 텍스트가 not found!'); showNotification('No scene to save'); return } const insertData = { session_id: state.currentSessionId, scene_index: state.liveSceneNum, scene_text: sceneText, emotion_raw: sceneData.emotionRaw || '', reason_raw: sceneData.reasonRaw || '', generated_emotion: sceneData.generatedEmotion || '', emotion_vector: sceneData.emotionAnalysis?.base || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, intensity: sceneData.emotionAnalysis?.intensity || 0.5, confidence: sceneData.emotionAnalysis?.confidence || 0.5, void_scene: sceneData.voidInfo?.sceneVoid || false, void_emotion: sceneData.voidInfo?.emotionVoid || false, void_reason: sceneData.voidInfo?.reasonVoid || false }; console.log('insertData:', JSON.stringify(insertData)); try { const result = await networkService.saveLiveScene(insertData); if (!result.ok) { console.error('live_scenes INSERT error:', result.error); throw result.error } console.log('live_scenes Save success:', result.data); await saveSceneToLiveSession({ text: sceneText, emotion_vector: sceneData.emotionAnalysis?.base || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 } }); showNotification('Scene sent to experiencer') } catch (e) { console.error('saveLiveScene error:', e); showNotification('Scene Save failed: ' + e.message) } }
async function saveSceneToLiveSession(sceneData) { console.log('=== saveSceneToLiveSession called ==='); console.log('sceneData:', JSON.stringify(sceneData)); const state = appStore.getState(); console.log('currentSessionId:', state.currentSessionId); console.log('currentSceneOrder:', state.currentSceneOrder); if (!state.currentSessionId) { console.error('currentSessionId가 not found!'); showNotification('Session not found'); return } const sceneText = sceneData.text || ''; if (!sceneText) { console.error('Scene 텍스트가 not found!'); showNotification('No scene to save'); return } try { const insertData = { live_session_id: state.currentSessionId, scene_order: state.currentSceneOrder, text: sceneText, emotion_vector: sceneData.emotion_vector || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, created_at: new Date().toISOString() }; console.log('scenes INSERT 데이터:', JSON.stringify(insertData)); const result = await networkService.saveScene(insertData); if (!result.ok) { console.error('scenes INSERT error:', result.error); throw result.error } console.log('scenes 저장 complete:', result.data); appStore.setState({ currentSceneOrder: state.currentSceneOrder + 1 }); showNotification('장면이 scenes 테이블에 저장 complete') } catch (e) { console.error('saveSceneToLiveSession error:', e); showNotification('scenes 테이블 Save failed: ' + e.message) } }
async function endLiveSession() { const state = appStore.getState(); if (!state.currentSessionId) return; try { const result = await networkService.endSession(state.currentSessionId, state.currentAlignment); if (!result.ok) { console.error('endLiveSession error:', result.error); return } console.log('Session ended') } catch (e) { console.error('endLiveSession error:', e) } }
async function startLiveSession() { try { const state = appStore.getState(); if (!state.currentSessionId && state.currentRole === 'B') { console.warn('Experiencer session ID not found'); return } let sessionId = state.currentSessionId; if (!sessionId && state.currentRole === 'A') { sessionId = await createLiveSession(); if (!sessionId) { console.warn('Session creation failed, continuing') } else { appStore.setState({ currentSessionId: sessionId }) } } subscribeToLiveScenes(); subscribeToScenes(); appStore.setState({ currentSceneOrder: 1, currentScene: 0, userChoices: [], userReasons: [], currentAlignment: 0, pendingSceneText: '', expPendingEmotion: '' }); window.currentStoryData = storyData; conversationHistory = []; currentGeneratedSceneObj = null; currentGeneratedEmotion = null; currentPhase = 'scene'; pendingEmotionText = ''; currentGeneratedScene = ''; finalSceneObject = null; isEditMode = false; const sceneContent = document.querySelector('#generatedSceneContent .generated-text'); if (sceneContent) sceneContent.textContent = ''; const emotionContent = document.querySelector('#generatedEmotionContent .generated-text'); if (emotionContent) emotionContent.textContent = ''; const chatMessages = document.getElementById('chatMessages'); if (chatMessages) { chatMessages.innerHTML = '<div class="chat-message ai"><div class="chat-message-label">Another Me</div><div class="chat-message-content">기억을 이야기해줘. 천천히, 편하게.</div></div>' } const editBtn = document.querySelector('.edit-toggle-btn'); if (editBtn) { editBtn.textContent = 'Edit'; editBtn.classList.remove('active') } const sceneTextarea = document.getElementById('editSceneTextarea'); if (sceneTextarea) { sceneTextarea.style.display = 'none'; sceneTextarea.value = '' } const emotionTextarea = document.getElementById('editEmotionTextarea'); if (emotionTextarea) { emotionTextarea.style.display = 'none'; emotionTextarea.value = '' } const sceneTextEl = document.querySelector('#generatedSceneContent .generated-text'); if (sceneTextEl) sceneTextEl.style.display = 'block'; switchGeneratedTab('scene'); updateUserStats('liveSession', 1); const sessionSetupEl = document.getElementById('sessionSetup'); if (sessionSetupEl) { sessionSetupEl.classList.remove('active'); sessionSetupEl.style.display = 'none' } const liveContainerEl = document.getElementById('liveContainer'); if (liveContainerEl) { liveContainerEl.classList.add('active'); liveContainerEl.style.cssText = 'display:block !important' } const liveContentEl = document.querySelector('.live-content'); const roleState = appStore.getState(); if (liveContentEl) { if (roleState.currentRole === 'A') { liveContentEl.classList.add('narrator-mode') } else { liveContentEl.classList.remove('narrator-mode') } }; const narratorLastChoiceSection = document.getElementById('narratorLastChoiceSection'); if (narratorLastChoiceSection) narratorLastChoiceSection.style.display = 'none'; const liveProgressSection = document.getElementById('liveProgressSection'); if (liveProgressSection) liveProgressSection.style.display = roleState.currentRole === 'A' ? 'block' : 'none'; const traceLabel = document.getElementById('traceLabel'); if (traceLabel) traceLabel.textContent = roleState.currentRole === 'A' ? '해석의 흔적' : '기억의 흔적'; if (roleState.currentRole === 'A') { const narratorPanelEl = document.getElementById('narratorPanel'); if (narratorPanelEl) narratorPanelEl.classList.add('active'); const interpretationTrace = document.getElementById('interpretationTrace'); const traceContent = document.getElementById('traceContent'); if (interpretationTrace && traceContent) { interpretationTrace.style.display = 'block'; traceContent.textContent = '체험자가 장면을 기다리고있습니다...' } showNpcDialogue("당신의 기억을 불러오세요. 지금 입력하는 장면이 이 기억의 원본 음각이 됩니다.", 4000) } else { const experiencerPanelEl = document.getElementById('experiencerPanel'); if (experiencerPanelEl) { experiencerPanelEl.classList.add('active'); expCurrentPhase = 'waiting'; appStore.setState({ expPendingEmotion: '' }); expGeneratedEmotion = ''; expFinalObject = null; const expSceneText = document.getElementById('expSceneText'); if (expSceneText) expSceneText.innerHTML = '화자가 기억을 불러오고 있습니다<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>'; const expEmotionText = document.getElementById('expEmotionText'); if (expEmotionText) expEmotionText.textContent = ''; const sceneDisplay = document.getElementById('expGeneratedSceneContent'); if (sceneDisplay) sceneDisplay.style.display = 'block'; const emotionDisplay = document.getElementById('expGeneratedEmotionContent'); if (emotionDisplay) emotionDisplay.style.display = 'none'; showNpcDialogue("곧 누군가의 Original Memory이 열릴 거야. 그 안에서 네 감정을 솔직하게 남겨줘.", 4000) } else { showNotification('체험자 패널을 not found') } } startAlignmentWaveAnimation(); setTimeout(() => { startVoiceWaveLiveAnimation() }, 300); const footer = document.querySelector('.footer'); if (footer) footer.classList.add('visible') } catch (e) { console.error('startLiveSession error:', e); showNotification('세션을 시작하는 중 Error occurred: ' + e.message) } }
async function sendNarratorInput() { console.log('sendNarratorInput called'); const input = document.getElementById('narratorInput'); if (!input || !input.value.trim()) { showNotification('Please enter a memory'); return } const inputText = input.value.trim(); const sendBtn = document.querySelector('.narrator-send-btn'); if (sendBtn) sendBtn.disabled = true; if (sendBtn) sendBtn.textContent = 'AI is converting scene...'; showNotification('AI is converting scene...'); try { const convertedScene = await generateSceneAI(inputText); const liveSceneContent = document.getElementById('liveSceneContent'); if (liveSceneContent) { liveSceneContent.textContent = convertedScene } const experiencerPanel = document.getElementById('experiencerPanel'); if (experiencerPanel) { experiencerPanel.classList.add('active') } const traceContent = document.getElementById('traceContent'); if (traceContent) { traceContent.textContent = 'Scene sent to experiencer' } showNotification('Scene sent to experiencer'); input.value = ''; const reasonInput = document.getElementById('narratorReason'); if (reasonInput) reasonInput.value = ''; updateLiveAlignment(0.15); liveSceneNum++; const liveSceneNumEl = document.getElementById('liveSceneNum'); if (liveSceneNumEl) liveSceneNumEl.textContent = liveSceneNum } catch (error) { console.error('sendNarratorInput error:', error); showNotification('Scene 변환 중 Error occurred: ' + error.message); const liveSceneContent = document.getElementById('liveSceneContent'); if (liveSceneContent) { liveSceneContent.textContent = inputText } } finally { if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send' } } }
let inputPhase = 'scene'; let currentSceneText = ''; let isVoiceMode = false;
async function handleUnifiedSubmit(providedText) { console.log('handleUnifiedSubmit called'); console.log('=== handleUnifiedSubmit ==='); console.log('currentPhase:', currentPhase); let inputText = ''; if (providedText) { inputText = providedText.trim() } else { const input = document.getElementById('unifiedInput'); if (!input || !input.value.trim()) { showNotification('Please enter your input'); return } inputText = input.value.trim(); input.value = '' } console.log('inputText:', inputText); if (currentPhase === 'scene') { appStore.setState({ pendingSceneText: inputText }); addChatMessage('user', inputText); try { const aiScene = await generateSceneAI(inputText); currentGeneratedScene = aiScene; console.log('currentGeneratedScene (after AI):', currentGeneratedScene); const sceneContent = document.querySelector('#generatedSceneContent .generated-text'); if (sceneContent) sceneContent.textContent = aiScene; switchGeneratedTab('scene'); addChatMessageWithConfirm('ai', 'Does this memory feel right?'); } catch (error) { console.error('generateSceneAI error:', error); showNotification('An error occurred during scene generation'); currentGeneratedScene = inputText; const sceneContent = document.querySelector('#generatedSceneContent .generated-text'); if (sceneContent) sceneContent.textContent = inputText; switchGeneratedTab('scene'); addChatMessageWithConfirm('ai', 'Does this memory feel right?') } return } if (currentPhase === 'emotion') { console.log('=== EMOTION PHASE ==='); console.log('inputText:', inputText); addChatMessage('user', inputText); let emotionResult = null; try { showNotification('AI is analyzing and converting emotions...'); emotionResult = await analyzeEmotionWithVector(inputText, ''); console.log('emotionResult (raw):', JSON.stringify(emotionResult)) } catch (e) { console.error('Emotion analysis failed:', e); showNotification('감정 분석 Failed: ' + e.message) } if (!emotionResult || !emotionResult.generatedEmotion || emotionResult.generatedEmotion === inputText) { console.warn('AI emotion conversion failed, using original text'); emotionResult = { generatedEmotion: inputText, analysis: emotionResult?.analysis || { base: { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, detailed: [], intensity: 0.5, confidence: 0.3 } } } console.log('최종 emotionResult:', emotionResult); const emotionContent = document.querySelector('#generatedEmotionContent .generated-text'); if (emotionContent) { emotionContent.textContent = emotionResult.generatedEmotion; console.log('생성된 감정 표시:', emotionResult.generatedEmotion) } switchGeneratedTab('emotion'); const parsed = parseEmotionInput(inputText); const currentState = appStore.getState(); const sceneText = currentGeneratedScene || currentState.pendingSceneText || ''; console.log('sceneText for finalSceneObject:', sceneText); console.log('currentGeneratedScene:', currentGeneratedScene); console.log('pendingSceneText:', currentState.pendingSceneText); const voidInfo = { sceneVoid: !sceneText || sceneText.includes('기억 안 나'), emotionVoid: !parsed.emotion, reasonVoid: !parsed.reason }; finalSceneObject = { text: sceneText, emotionRaw: parsed.emotion || inputText, reasonRaw: parsed.reason || '', generatedEmotion: emotionResult.generatedEmotion, emotionAnalysis: emotionResult.analysis, voidInfo: voidInfo }; console.log('finalSceneObject 생성:', JSON.stringify(finalSceneObject)); addChatMessageWithConfirm('ai', 'Does this emotion feel right?'); return } }
let recognition = null; let audioContext = null; let analyser = null; let microphone = null; let voiceAnimationId = null; let recognizedText = '';
const SUPABASE_FUNCTION_URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co/functions/v1/claude-scene';
async function generateSceneAI(inputText) { try { const response = await fetch(SUPABASE_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ text: inputText }) }); if (!response.ok) { const error = await response.json(); throw new Error(error.error || error.details || 'API call failed') } const data = await response.json(); console.log('generateSceneAI response:', data); if (data.scene) { window.lastSceneData = { scene: data.scene, voidHint: data.voidHint || '', emotionCue: data.emotionCue || '' }; return data.scene } else { throw new Error(data.error || 'Scene 변환 실패') } } catch (error) { console.error('generateSceneAI error:', error); throw error } }
async function analyzeEmotionWithVector(emotionText, reasonText, anchorEmotions = null) { console.log('analyzeEmotionWithVector called:', { emotionText, reasonText, anchorEmotions }); try { const requestBody = { type: 'emotion_analysis', emotion: emotionText || '', reason: reasonText || '', anchorEmotions: anchorEmotions || [] }; console.log('API request body:', JSON.stringify(requestBody)); const response = await fetch(`${SUPABASE_URL}/functions/v1/claude-scene`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY }, body: JSON.stringify(requestBody) }); console.log('API response status:', response.status); if (!response.ok) { const errorText = await response.text(); console.error('API error response:', errorText); throw new Error('API call failed: ' + response.status) } const data = await response.json(); console.log('API response data:', JSON.stringify(data)); if (!data.generatedEmotion) { console.warn('generatedEmotion이 응답에 없음') } return data } catch (error) { console.error('analyzeEmotionWithVector error:', error); return { generatedEmotion: null, analysis: { base: { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, detailed: [], intensity: 0.5, confidence: 0.3 } } } }
function startVoiceMode() { document.getElementById('voiceStartPrompt').style.display = 'none'; document.getElementById('textInputContainer').style.display = 'none'; document.getElementById('voiceWaveContainer').style.display = 'flex'; isVoiceMode = true; startSpeechRecognition(); startVoiceVisualization() }
function switchToTextMode() { if (recognition) { recognition.stop() } stopVoiceVisualization(); document.getElementById('voiceStartPrompt').style.display = 'none'; document.getElementById('voiceWaveContainer').style.display = 'none'; document.getElementById('textInputContainer').style.display = 'block'; isVoiceMode = false; if (recognizedText) { document.getElementById('sceneTextInput').value = recognizedText } }
function startSpeechRecognition() { if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { showNotification('This browser does not support speech recognition'); switchToTextMode(); return } const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; recognition = new SpeechRecognition(); recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true; recognition.onresult = function (event) { let interim = ''; let final = ''; for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) { final += event.results[i][0].transcript } else { interim += event.results[i][0].transcript } } if (final) { recognizedText += final + ' ' } }; recognition.onerror = function (event) { console.error('Speech recognition error:', event.error); if (event.error === 'not-allowed') { showNotification('Microphone permission required') } }; recognition.onend = function () { if (isVoiceMode) { recognition.start() } }; recognition.start(); showNotification('음성 인식이 시작 complete') }
function startVoiceVisualization() { navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) { audioContext = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioContext.createAnalyser(); microphone = audioContext.createMediaStreamSource(stream); microphone.connect(analyser); analyser.fftSize = 256; const bufferLength = analyser.frequencyBinCount; const dataArray = new Uint8Array(bufferLength); const canvas = document.getElementById('voiceWaveCanvas'); const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; function draw() { voiceAnimationId = requestAnimationFrame(draw); analyser.getByteFrequencyData(dataArray); ctx.fillStyle = 'rgba(18,18,26,0.3)'; ctx.fillRect(0, 0, canvas.width, canvas.height); const barWidth = (canvas.width / bufferLength) * 2.5; let x = 0; for (let i = 0; i < bufferLength; i++) { const barHeight = (dataArray[i] / 255) * canvas.height * 0.8; const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height); gradient.addColorStop(0, 'rgba(196,168,130,0.8)'); gradient.addColorStop(1, 'rgba(196,168,130,0.4)'); ctx.fillStyle = gradient; ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight); x += barWidth } } draw() }).catch(function (err) { console.error('Microphone access denied:', err); showNotification('마이크 접근이 거부 complete') }) }
function stopVoiceVisualization() { if (voiceAnimationId) { cancelAnimationFrame(voiceAnimationId) } if (audioContext) { audioContext.close() } audioContext = null; analyser = null; microphone = null }
async function submitScene() { console.log('submitScene called'); const input = document.getElementById('sceneTextInput'); const submitBtn = document.querySelector('.scene-submit-btn'); if (!input.value.trim()) { showNotification('Please enter a scene'); return } currentSceneText = input.value.trim(); submitBtn.disabled = true; submitBtn.textContent = 'AI is converting scene...'; try { const aiScene = await generateSceneAI(currentSceneText); const liveSceneContent = document.getElementById('liveSceneContent'); if (liveSceneContent) { liveSceneContent.textContent = aiScene } const traceContent = document.getElementById('traceContent'); if (traceContent) { traceContent.textContent = 'Scene sent to experiencer' } showNotification('AI converted and sent the scene') } catch (err) { console.error('AI scene generation error:', err); showNotification('An error occurred during scene conversion'); const traceContent = document.getElementById('traceContent'); if (traceContent) { traceContent.textContent = currentSceneText } } input.value = ''; currentSceneText = ''; recognizedText = ''; submitBtn.disabled = false; submitBtn.textContent = '제출'; const voiceStartPrompt = document.getElementById('voiceStartPrompt'); if (voiceStartPrompt) voiceStartPrompt.style.display = 'flex'; const textInputContainer = document.getElementById('textInputContainer'); if (textInputContainer) textInputContainer.style.display = 'none'; updateLiveAlignment(0.15) }
function simulateNarratorInput(sceneText) {
    try {
        const experiencerPanelEl = document.getElementById('experiencerPanel');
        if (!experiencerPanelEl || !experiencerPanelEl.classList.contains('active')) {
            if (sceneText) {
                setTimeout(() => simulateNarratorInput(sceneText), 100);
                return;
            } else {
                setTimeout(() => simulateNarratorInput(), 100);
                return;
            }
        }
        let textToDisplay = '';
        if (sceneText) {
            textToDisplay = sceneText;
        } else {
            const state = appStore.getState();
            if (state.currentMode === 'live') {
                return;
            }
            const currentData = window.currentStoryData || storyData;
            if (!currentData || !currentData.scenes || currentScene >= currentData.scenes.length || !currentData.scenes[currentScene]) {
                showNotification('Unable to load scene data');
                return;
            }
            const scene = currentData.scenes[currentScene];
            if (!scene || !scene.text) {
                showNotification('Unable to load scene text');
                return;
            }
            textToDisplay = scene.text;
        }
        const expSceneText = document.getElementById('expSceneText');
        if (expSceneText) {
            expSceneText.textContent = textToDisplay;
        }
        switchExpGeneratedTab('scene');
        expCurrentPhase = 'interpret';
        const emotionCueMsg = window.lastSceneData?.emotionCue || NPC_DIALOGUES.live.emotionCue;
        addExpChatMessage('ai', 'The narrator\'s memory has arrived. ' + emotionCueMsg);
        const expTextInput = document.getElementById('expTextInput');
        if (expTextInput) {
            expTextInput.value = '';
            expTextInput.focus();
        }
    } catch (e) {
        console.error('simulateNarratorInput error:', e);
        showNotification('Error loading scene');
    }
}
function renderLiveEchoLayer(words) { const layer = document.getElementById('liveEchoLayer'); if (!layer) return; layer.innerHTML = ''; if (!words || !Array.isArray(words)) return; words.forEach(word => { const span = document.createElement('span'); span.className = 'echo-word'; span.textContent = word; span.style.top = (20 + Math.random() * 60) + '%'; span.style.left = (10 + Math.random() * 80) + '%'; layer.appendChild(span) }) }
function makeLiveChoice(choiceIndex) { try { const state = appStore.getState(); appStore.setState({ userChoices: [...state.userChoices, choiceIndex] }); const currentData = window.currentStoryData || storyData; const updatedState = appStore.getState(); if (!currentData || !currentData.scenes || !currentData.scenes[updatedState.currentScene]) { showNotification('Unable to load scene data'); return } const scene = currentData.scenes[updatedState.currentScene]; if (choiceIndex === scene.originalChoice) { appStore.setState({ liveMatches: updatedState.liveMatches + 1 }); const matchesEl = document.getElementById('liveMatches'); if (matchesEl) matchesEl.textContent = updatedState.liveMatches + 1 } appStore.setState({ liveFragments: updatedState.liveFragments + 1 }); const fragmentsEl = document.getElementById('liveFragments'); if (fragmentsEl) fragmentsEl.textContent = updatedState.liveFragments + 1; const sceneType = scene.sceneType || 'normal'; if (sceneType === 'branch' || sceneType === 'ending') { const questionEl = document.getElementById('emotionQuestion'); if (questionEl) questionEl.textContent = updatedState.currentScene === 0 ? "왜 그렇게 했어?" : "지금 어떤 감정이 들어?"; const modalEl = document.getElementById('emotionModal'); if (modalEl) modalEl.classList.add('active'); const inputEl = document.getElementById('emotionInputField'); if (inputEl) inputEl.focus() } else { proceedToNextSceneLive() } } catch (e) { console.error('makeLiveChoice error:', e); showNotification('An error occurred') } }
function submitExperiencerFeeling() { try { const feelingInput = document.getElementById('experiencerFeelingInput'); if (!feelingInput) { showNotification('Input field not found'); return } const feeling = feelingInput.value.trim(); if (!feeling) { showNotification('Please describe how the narrator might have felt'); return } const state = appStore.getState(); appStore.setState({ userReasons: [...state.userReasons, feeling], liveFragments: state.liveFragments + 1 }); const updatedState = appStore.getState(); const fragmentsEl = document.getElementById('liveFragments'); if (fragmentsEl) fragmentsEl.textContent = updatedState.liveFragments; updateLiveAlignment(0.1 + Math.random() * 0.15); showNotification('Emotion recorded'); feelingInput.value = ''; setTimeout(() => { proceedToNextSceneLive() }, 1000) } catch (e) { console.error('submitExperiencerFeeling error:', e); showNotification('An error occurred') } }
function updateLiveAlignment(delta) { const state = appStore.getState(); const newAlignment = Math.min(1, state.currentAlignment + delta); appStore.setState({ currentAlignment: newAlignment }); const updatedState = appStore.getState(); const liveAlignmentValue = document.getElementById('liveAlignmentValue'); if (liveAlignmentValue) { liveAlignmentValue.textContent = updatedState.currentAlignment.toFixed(2); if (updatedState.currentAlignment >= 0.8) liveAlignmentValue.classList.add('high') } const liveAlignmentFill = document.getElementById('liveAlignmentFill'); if (liveAlignmentFill) liveAlignmentFill.style.width = (updatedState.currentAlignment * 100) + '%'; const alignmentPercentage = document.getElementById('alignmentPercentage'); if (alignmentPercentage) alignmentPercentage.textContent = String(Math.round(updatedState.currentAlignment * 100)).padStart(2, '0') + '%'; const expAlignmentPercentage = document.getElementById('expAlignmentPercentage'); if (expAlignmentPercentage) expAlignmentPercentage.textContent = String(Math.round(updatedState.currentAlignment * 100)).padStart(2, '0') + '%' }
let currentNarratorWave = null;
// alignmentWaveTime, alignmentMouseX, alignmentMouseY, alignmentIsMouseDown Visualizer internal 서 management됨
function lerp(a, b, t) { return a + (b - a) * t }
function lerpColor(a, b, t) { return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) } }
function noise(x, y, z) { const n = Math.sin(x * 12.9898 + y * 78.233 + (z || 0) * 37.719) * 43758.5453; return n - Math.floor(n) }
function emotionVectorToWaveStyle(emotionVector) { if (!emotionVector) return { color: { r: 100, g: 140, b: 180 }, speed: 0.3, amplitude: 30, frequency: 0.008, chaos: 0.1, lineCount: 8, trailOpacity: 0.15 }; const intensity = Object.values(emotionVector).reduce((a, b) => a + b, 0) / 6; const dominant = Object.entries(emotionVector).sort((a, b) => b[1] - a[1])[0]; const colors = { fear: { r: 100, g: 80, b: 180 }, sadness: { r: 80, g: 100, b: 160 }, anger: { r: 200, g: 80, b: 80 }, joy: { r: 200, g: 180, b: 100 }, longing: { r: 80, g: 180, b: 180 }, guilt: { r: 150, g: 130, b: 100 } }; const baseColor = colors[dominant[0]] || colors.sadness; return { color: baseColor, speed: 0.3 + intensity * 0.9, amplitude: 30 + intensity * 50, frequency: 0.008 + intensity * 0.012, chaos: 0.1 + intensity * 0.7, lineCount: Math.max(4, Math.min(20, 6 + Math.floor(intensity * 14))), trailOpacity: 0.15 - intensity * 0.07 } }
function getDominantEmotionColor(base) { const entries = Object.entries(base || {}); if (entries.length === 0) return 'rgba(196,168,130,'; const dominant = entries.sort((a, b) => b[1] - a[1])[0]; const colorMap = { fear: 'rgba(100,80,180,', sadness: 'rgba(70,130,200,', anger: 'rgba(200,80,80,', joy: 'rgba(220,180,60,', longing: 'rgba(80,180,180,', guilt: 'rgba(150,130,100,' }; return colorMap[dominant[0]] || 'rgba(196,168,130,' }
function getEmotionComplexity(base) { if (!base) return 1; return Object.values(base).filter(v => v >= 0.2).length || 1 }
function computeWaveFromEmotion(emotionAnalysis) { if (!emotionAnalysis) { return { amplitude: 0.5, frequency: 0.015, color: 'rgba(196,168,130,' } } return { amplitude: emotionAnalysis.intensity || 0.5, frequency: 0.01 + getEmotionComplexity(emotionAnalysis.base) * 0.005, color: getDominantEmotionColor(emotionAnalysis.base) } }
function updateNarratorWave(emotionAnalysis) { currentNarratorWave = computeWaveFromEmotion(emotionAnalysis); console.log('화자 파동 update:', currentNarratorWave) }
function stopAllLiveSubscriptions() {
    realtimeService.cleanup();
}
async function exitLive() { if (confirm('End session?')) { const state = appStore.getState(); const wasRoleA = state.currentRole === 'A'; const wasFirstScene = state.liveSceneNum === 1; stopAllLiveSubscriptions(); stopAllAnimations(); await endLiveSession(); const liveContainerEl = document.getElementById('liveContainer'); if (liveContainerEl) { liveContainerEl.classList.remove('active'); liveContainerEl.style.display = 'none' } appStore.setState({ currentSessionId: null, currentRole: null, sessionCode: null }); if (wasRoleA && wasFirstScene) { restart() } else { showEndScreen() } } }
function switchGeneratedTab(tab) { document.querySelectorAll('.generated-tab').forEach(t => t.classList.remove('active')); document.querySelectorAll('.generated-tab-content').forEach(c => c.style.display = 'none'); if (tab === 'scene') { document.querySelectorAll('.generated-tab')[0].classList.add('active'); document.getElementById('generatedSceneContent').style.display = 'block' } else if (tab === 'emotion') { document.querySelectorAll('.generated-tab')[1].classList.add('active'); document.getElementById('generatedEmotionContent').style.display = 'block' } }
let expCurrentPhase = 'waiting'; let expGeneratedEmotion = ''; let expFinalObject = null; let expConversationHistory = [];
function switchExpGeneratedTab(tab) { const sceneDisplay = document.getElementById('expGeneratedSceneContent'); const emotionDisplay = document.getElementById('expGeneratedEmotionContent'); if (tab === 'scene') { if (sceneDisplay) sceneDisplay.style.display = 'block'; if (emotionDisplay) emotionDisplay.style.display = 'none' } else if (tab === 'emotion') { if (sceneDisplay) sceneDisplay.style.display = 'none'; if (emotionDisplay) emotionDisplay.style.display = 'block' } }
function addExpChatMessage(role, content) { const messagesContainer = document.getElementById('expChatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = 'chat-message ' + role; const label = role === 'user' ? 'me' : 'Another Me'; messageDiv.innerHTML = '<div class="chat-message-label">' + label + '</div><div class="chat-message-content">' + content.replace(/\n/g, '<br>') + '</div>'; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }
function addExpChatMessageWithConfirm(role, content) { const messagesContainer = document.getElementById('expChatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = 'chat-message ' + role; const label = role === 'user' ? 'me' : 'Another Me'; messageDiv.innerHTML = '<div class="chat-message-label">' + label + '</div><div class="chat-message-content">' + content.replace(/\n/g, '<br>') + '</div><div class="confirm-buttons"><button class="confirm-btn yes" onclick="handleExpConfirm(\'yes\')">Yes</button><button class="confirm-btn no" onclick="handleExpConfirm(\'no\')">No</button></div>'; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }
function removeExpConfirmButtons() { const panel = document.getElementById('experiencerPanel'); if (!panel) return; const buttons = panel.querySelectorAll('.confirm-buttons'); buttons.forEach(btn => btn.remove()) }
// ───── sendExpChatMessage / sendChatMessage 리팩토링: 하위 function들 ─────

/**
 * message input collect 및 validation
 * @param {string} inputId - input 필드 ID
 * @returns {string|null} user message 또 null (failed 시)
 */
function collectChatMessage(inputId) {
    const input = document.getElementById(inputId);
    if (!input || !input.value.trim()) {
        showNotification('Please enter a message');
        return null;
    }
    const userMessage = input.value.trim();
    input.value = '';
    return userMessage;
}

/**
 * UI message reflect (experiencer용)
 * @param {string} userMessage - user message
 */
function reflectExpChatMessageUI(userMessage) {
    addExpChatMessage('user', userMessage);
}

/**
 * UI message reflect (narrator용)
 * @param {string} userMessage - user message
 */
function reflectChatMessageUI(userMessage) {
    addChatMessage('user', userMessage);
    conversationHistory.push({ role: 'user', content: userMessage });
}

// callAI, validateEmotionAnalysisResult, validateSceneGenerationResult AIService move됨

/**
 * emotion analysis result 파싱 (validate 통 object 받음)
 * @param {Object} emotionResult - validation AI response result
 * @returns {Object} 파싱 emotion result
 */
function parseEmotionAnalysisResult(emotionResult) {
 // validate 통 object 받으므 add validation 불needed
 // 관대 파싱/추정 금지
    return emotionResult;
}

/**
 * scene create result 파싱 (validate 통 object 받음)
 * @param {Object} aiResponse - validation AI response result
 * @returns {string} create scene text
 */
function parseSceneGenerationResult(aiResponse) {
 // validate 통 object 받으므 response 필드 보장됨
 // 관대 파싱/추정 금지
    return aiResponse.response.trim();
}

/**
 * experiencer emotion result save 및 그
 * @param {Object} emotionResult - emotion analysis result
 * @param {string} userMessage - user message
 */
function persistExpEmotionResult(emotionResult, userMessage) {
    const parsed = parseEmotionInput(userMessage);
    const emotionText = document.getElementById('expEmotionText');
    if (emotionText) {
        emotionText.textContent = emotionResult.generatedEmotion;
    }
    switchExpGeneratedTab('emotion');

 // TODO: window.expFinalObject store move
    expFinalObject = {
        emotion: parsed.emotion,
        reason: parsed.reason,
        generatedEmotion: emotionResult.generatedEmotion,
        emotionAnalysis: emotionResult.analysis
    };

    const emotionDisplay = formatEmotionVector(emotionResult.analysis?.base || {});
    addExpChatMessage('ai', 'Your emotion: ' + emotionDisplay);

 // VAD 투영 및 terrain position calculation
    if (emotionResult.analysis?.base) {
        const baseVec = emotionResult.analysis.base;
        // TODO: Read window.currentStoryData from store instead
        const currentSceneData = window.currentStoryData?.scenes?.[currentScene] || null;
        const anchors = currentSceneData?.anchor_emotions || null;

        try {
            const vad = projectEmotionToVAD(baseVec, anchors);
            if (!expFinalObject._vad) {
                expFinalObject._vad = vad;
            }
            console.log('[VAD] Projected (Live):', vad);
        } catch (vadError) {
            console.error('[VAD] Projection error (Live):', vadError);
            console.error('[VAD] baseVec:', baseVec);
            console.error('[VAD] anchors:', anchors);
        }
    }
}

/**
 * scene create result save 및 그
 * @param {string} generatedText - create scene text
 */
function persistSceneGenerationResult(generatedText) {
    appStore.setState({ pendingSceneText: generatedText });
    const sceneContent = document.querySelector('#generatedSceneContent .generated-text');
    if (sceneContent) {
        sceneContent.textContent = generatedText;
    }
    switchGeneratedTab('scene');
}

/**
 * sendExpChatMessage test용 래퍼 ( 존성 주입 possible)
 * @param {Object} deps - 존성 { persistExpEmotionResult?, ... }
 * @returns {Promise<void>}
 */
async function sendExpChatMessageWithDeps(deps = {}) {
    const {
        persistExpEmotionResult: persistFn = persistExpEmotionResult,
        collectChatMessage: collectFn = collectChatMessage,
        reflectExpChatMessageUI: reflectFn = reflectExpChatMessageUI,
        addExpChatMessage: addMsgFn = addExpChatMessage,
        addExpChatMessageWithConfirm: addConfirmFn = addExpChatMessageWithConfirm,
        parseEmotionAnalysisResult: parseFn = parseEmotionAnalysisResult,
        getExpCurrentPhase = () => expCurrentPhase,
        setExpPendingEmotion = (msg) => { appStore.setState({ expPendingEmotion: msg }); }
    } = deps;

 // 1. input collect 및 validation
    const userMessage = collectFn('expTextInput');
    if (!userMessage) {
        return;
    }

 // 2. UI reflect
    reflectFn(userMessage);

 // 3. AI call 및 result processing
    if (getExpCurrentPhase() === 'interpret') {
        setExpPendingEmotion(userMessage);
        addMsgFn('ai', 'Analyzing emotions...');

        let emotionResult = null;
        try {
 // AI call (internal 서 validate 수행)
 // test 서 모킹 수 있 록 window.AIService 우선 
            const aiService = window.AIService || AIService;
            emotionResult = await aiService.call('emotion_analysis', userMessage, {
                reasonText: ''
            });
            console.log('Exp emotionResult (raw):', JSON.stringify(emotionResult));
        } catch (e) {
            console.error('Exp emotion analysis failed:', e);
 // validate failed 또 API call failed
            const errorMessage = e.message && e.message.includes('Response format error')
                ? 'Response format error, please try again.'
                : 'Emotion analysis failed. Please try again.';
            addMsgFn('ai', errorMessage);
 // DB save 및 주요 state update 않음
            return;
        }

 // 4. result 파싱 (validate callAI internal 서 미 통 )
        const parsedResult = parseFn(emotionResult);

 // 5. save 및 그
        persistFn(parsedResult, userMessage);

 // 6. check request
        addConfirmFn('ai', 'Does this emotion feel right?');
    } else {
        addMsgFn('ai', 'When the narrator\'s memory arrives, tell me what you feel inside it.');
    }
}

/**
 * sendExpChatMessage 메인 function (오케스트레 터)
 */
async function sendExpChatMessage() {
 // 1. input collect 및 validation
    const userMessage = collectChatMessage('expTextInput');
    if (!userMessage) {
        return;
    }

 // 2. UI reflect
    reflectExpChatMessageUI(userMessage);

 // 3. AI call 및 result processing
    if (expCurrentPhase === 'interpret') {
        appStore.setState({ expPendingEmotion: userMessage });
        addExpChatMessage('ai', 'Analyzing emotions...');

        let emotionResult = null;
        try {
 // AI call (internal 서 validate 수행)
 // test 서 모킹 수 있 록 window.AIService 우선 
            const aiService = window.AIService || AIService;
            emotionResult = await aiService.call('emotion_analysis', userMessage, {
                reasonText: ''
            });
            console.log('Exp emotionResult (raw):', JSON.stringify(emotionResult));
        } catch (e) {
            console.error('Exp emotion analysis failed:', e);
 // validate failed 또 API call failed
            const errorMessage = e.message && e.message.includes('Response format error')
                ? 'Response format error, please try again.'
                : 'Emotion analysis failed. Please try again.';
            addExpChatMessage('ai', errorMessage);
 // DB save 및 주요 state update 않음
            return;
        }

 // 4. result 파싱 (validate callAI internal 서 미 통 )
        const parsedResult = parseEmotionAnalysisResult(emotionResult);

 // 5. save 및 그
        persistExpEmotionResult(parsedResult, userMessage);

 // 6. check request
        addExpChatMessageWithConfirm('ai', 'Does this emotion feel right?');
    } else {
        addExpChatMessage('ai', 'When the narrator\'s memory arrives, tell me what you feel inside it.');
    }
}

/**
 * sendChatMessage test용 래퍼 ( 존성 주입 possible)
 * @param {Object} deps - 존성 { persistSceneGenerationResult?, ... }
 * @returns {Promise<void>}
 */
async function sendChatMessageWithDeps(deps = {}) {
    const {
        persistSceneGenerationResult: persistFn = persistSceneGenerationResult,
        collectChatMessage: collectFn = collectChatMessage,
        reflectChatMessageUI: reflectFn = reflectChatMessageUI,
        addChatMessage: addMsgFn = addChatMessage,
        addChatMessageWithConfirm: addConfirmFn = addChatMessageWithConfirm,
        updateExperiencerStatus: updateStatusFn = updateExperiencerStatus,
        parseSceneGenerationResult: parseFn = parseSceneGenerationResult,
        getCurrentPhase = () => currentPhase,
        getConversationHistory = () => conversationHistory,
        pushConversationHistory = (msg) => { conversationHistory.push(msg); },
        getAISystemPrompt = () => AI_SYSTEM_PROMPT,
        handleUnifiedSubmit: handleUnifiedSubmitFn = handleUnifiedSubmit
    } = deps;

    console.log('sendChatMessage called');
    console.log('sendChatMessage currentPhase:', getCurrentPhase());

 // 1. input collect 및 validation
    const userMessage = collectFn('liveTextInput');
    if (!userMessage) {
        return;
    }

 // 2. emotion phase processing
    if (getCurrentPhase() === 'emotion') {
        console.log('emotion phase detected, calling handleUnifiedSubmit');
        await handleUnifiedSubmitFn(userMessage);
        const input = document.getElementById('liveTextInput');
        if (input) input.value = '';
        const sendBtn = document.getElementById('chatSendBtn');
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
        return;
    }

 // 3. UI reflect
    reflectFn(userMessage);

 // 4. scene phase processing
    if (getCurrentPhase() === 'scene') {
        updateStatusFn('The experiencer is waiting for a scene...');

        try {
 // AI call (internal 서 validate 수행)
 // test 서 모킹 수 있 록 window.AIService 우선 
            const aiService = window.AIService || AIService;
            const aiResponse = await aiService.call('scene_generation', userMessage, {
                conversationHistory: getConversationHistory(),
                systemPrompt: getAISystemPrompt()
            });

 // 5. result 파싱 (validate callAI internal 서 미 통 )
            const generatedText = parseFn(aiResponse);

 // 6. save 및 그
            pushConversationHistory({ role: 'assistant', content: aiResponse.response });
            persistFn(generatedText);

 // 7. UI update
            addConfirmFn('ai', 'Does this memory feel right?');
            updateStatusFn('The experiencer is reading the scene...');
        } catch (error) {
            console.error('AI API error:', error);
 // validate failed 또 API call failed
            const errorMessage = error.message && error.message.includes('Response format error')
                ? 'Response format error, please try again.'
                : 'Sorry, something went wrong. Could you say that again?';
            addMsgFn('ai', errorMessage);
            showNotification('Error in AI response');
 // DB save 및 주요 state update 않음
        }
    }
}

/**
 * sendChatMessage 메인 function (오케스트레 터)
 */
async function sendChatMessage() {
    console.log('sendChatMessage called');
 // TODO: window.currentPhase store 서 읽 록 변경
    console.log('sendChatMessage currentPhase:', currentPhase);

 // 1. input collect 및 validation
    const userMessage = collectChatMessage('liveTextInput');
    if (!userMessage) {
        return;
    }

 // 2. emotion phase processing
    if (currentPhase === 'emotion') {
        console.log('emotion phase detected, calling handleUnifiedSubmit');
        await handleUnifiedSubmit(userMessage);
        const input = document.getElementById('liveTextInput');
        if (input) input.value = '';
        const sendBtn = document.getElementById('chatSendBtn');
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
        return;
    }

 // 3. UI reflect
    reflectChatMessageUI(userMessage);

 // 4. scene phase processing
    if (currentPhase === 'scene') {
        updateExperiencerStatus('The experiencer is waiting for a scene...');

        try {
 // AI call (internal 서 validate 수행)
 // test 서 모킹 수 있 록 window.AIService 우선 
            const aiService = window.AIService || AIService;
            const aiResponse = await aiService.call('scene_generation', userMessage, {
                conversationHistory: conversationHistory,
                systemPrompt: AI_SYSTEM_PROMPT
            });

 // 5. result 파싱 (validate callAI internal 서 미 통 )
            const generatedText = parseSceneGenerationResult(aiResponse);

 // 6. save 및 그
            conversationHistory.push({ role: 'assistant', content: aiResponse.response });
            persistSceneGenerationResult(generatedText);

 // 7. UI update
            addChatMessageWithConfirm('ai', 'Does this memory feel right?');
            updateExperiencerStatus('The experiencer is reading the scene...');
        } catch (error) {
            console.error('AI API error:', error);
 // validate failed 또 API call failed
            const errorMessage = error.message && error.message.includes('Response format error')
                ? 'Response format error, please try again.'
                : 'Sorry, something went wrong. Could you say that again?';
            addChatMessage('ai', errorMessage);
            showNotification('Error in AI response');
 // DB save 및 주요 state update 않음
        }
    }

 // 8. UI state restore
    const sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) sendBtn.disabled = false;
    const input = document.getElementById('liveTextInput');
    if (input) input.focus();
} function formatEmotionVector(emotionVector) { if (!emotionVector) return 'No emotion'; const emotions = []; if (emotionVector.fear > 0.1) emotions.push(`두려움 ${Math.round(emotionVector.fear * 100)}%`); if (emotionVector.sadness > 0.1) emotions.push(`슬픔 ${Math.round(emotionVector.sadness * 100)}%`); if (emotionVector.anger > 0.1) emotions.push(`분노 ${Math.round(emotionVector.anger * 100)}%`); if (emotionVector.joy > 0.1) emotions.push(`기쁨 ${Math.round(emotionVector.joy * 100)}%`); if (emotionVector.longing > 0.1) emotions.push(`그리움 ${Math.round(emotionVector.longing * 100)}%`); if (emotionVector.guilt > 0.1) emotions.push(`죄책감 ${Math.round(emotionVector.guilt * 100)}%`); return emotions.length > 0 ? emotions.join(', ') : 'No emotion' }
function renderExperiencerWave(emotionAnalysis) { console.log('체험자 파동 rendering:', emotionAnalysis); if (!emotionAnalysis || !emotionAnalysis.base) { console.error('emotionAnalysis 또는 base가 not found'); return } const emotionVector = emotionAnalysis.base; window.experiencerEmotionVector = emotionVector; const experiencerWave = computeWaveFromEmotion(emotionAnalysis); window.currentExperiencerWave = experiencerWave; updateAlignmentWave(); console.log('체험자 Wave rendering complete:', experiencerWave) }
async function handleExpConfirm(answer) { removeExpConfirmButtons(); if (answer === 'yes') { addExpChatMessage('user', 'Yes'); if (expFinalObject) { addExpChatMessage('ai', 'Converting emotion to wave...'); await saveExpInterpretation(expFinalObject); if (expFinalObject.emotionAnalysis && currentSessionId) { await saveExperiencerChoice(expFinalObject.emotionAnalysis.base) } if (expFinalObject.emotionAnalysis) { window.experiencerEmotionVector = expFinalObject.emotionAnalysis.base; const experiencerWave = computeWaveFromEmotion(expFinalObject.emotionAnalysis); window.currentExperiencerWave = experiencerWave; updateAlignmentWave(); renderExperiencerWave(expFinalObject.emotionAnalysis); updateExperiencerAlignment() } setTimeout(() => checkAlignment(), 1000) } addExpChatMessage('ai', 'Emotion sent.'); expCurrentPhase = 'waiting'; appStore.setState({ expPendingEmotion: '' }); expGeneratedEmotion = ''; expFinalObject = null; const emotionText = document.getElementById('expEmotionText'); if (emotionText) emotionText.textContent = ''; switchExpGeneratedTab('scene'); addExpChatMessage('ai', '다음 기억을 기다리고 있어.') } else { addExpChatMessage('user', 'No'); addExpChatMessage('ai', '다시 감정을 입력 please.'); const expTextInput = document.getElementById('expTextInput'); if (expTextInput) { expTextInput.focus() } } }
async function saveExpInterpretation(data) {
    // Fully disabled since live_interpretations table does not exist
    return;
}
async function saveExperiencerChoice(emotionVector) { console.log('=== saveExperiencerChoice called ==='); console.log('emotionVector:', JSON.stringify(emotionVector)); const state = appStore.getState(); console.log('currentSessionId:', state.currentSessionId); console.log('liveSceneNum:', state.liveSceneNum); if (!state.currentSessionId) { console.error('currentSessionId가 not found!'); return } let userId; if (state.currentUser) { userId = state.currentUser.id } else { if (!window.anonymousUserId) { window.anonymousUserId = crypto.randomUUID() } userId = window.anonymousUserId } const insertData = { live_session_id: state.currentSessionId, scene_id: null, user_id: userId, emotion_vector: emotionVector || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, created_at: new Date().toISOString() }; console.log('choices INSERT 데이터:', JSON.stringify(insertData)); try { const result = await networkService.saveChoice(insertData); if (!result.ok) { console.error('choices INSERT error:', result.error); throw result.error } console.log('체험자 감정 저장 complete:', result.data); showNotification('감정이 choices 테이블에 저장 complete') } catch (e) { console.error('saveExperiencerChoice error:', e); showNotification('choices 테이블 Save failed: ' + e.message) } }
function switchExpToTextInput() { if (isExpRecording) { if (expMediaRecorder && expMediaRecorder.state !== 'inactive') { expMediaRecorder.stop(); isExpRecording = false } } const waveSection = document.getElementById('expVoiceWaveSection'); const switchBtn = document.querySelector('.experiencer-panel .text-switch-btn'); if (waveSection && switchBtn) { waveSection.style.display = 'none'; const textInputContainer = document.createElement('div'); textInputContainer.className = 'text-input-container-live'; textInputContainer.style.width = '100%'; textInputContainer.innerHTML = `<div class="chat-input-wrapper"><textarea class="chat-input-textarea" id="expTextInput" placeholder="Enter your emotion..." rows="3"></textarea><button class="chat-send-btn" id="expChatSendBtn" onclick="sendExpChatMessage()">Send</button></div>`; switchBtn.parentElement.insertBefore(textInputContainer, switchBtn); switchBtn.textContent = 'Switch to Voice'; switchBtn.onclick = function () { switchExpToVoiceInput() }; const input = document.getElementById('expTextInput'); if (input) { input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendExpChatMessage() } }); input.focus() } } }
function switchExpToVoiceInput() { const textContainer = document.querySelector('.experiencer-panel .text-input-container-live'); const switchBtn = document.querySelector('.experiencer-panel .text-switch-btn'); const waveSection = document.getElementById('expVoiceWaveSection'); if (textContainer) { textContainer.remove() } if (waveSection) { waveSection.style.display = 'block' } if (switchBtn) { switchBtn.textContent = 'Switch to Text'; switchBtn.onclick = function () { switchExpToTextInput() } } }
let isEditMode = false;
function toggleEditMode() { const editBtn = document.querySelector('.edit-toggle-btn'); let textEl, textarea, confirmMsg; if (currentPhase === 'scene' || currentPhase === 'complete') { textEl = document.querySelector('#generatedSceneContent .generated-text'); textarea = document.getElementById('editSceneTextarea'); confirmMsg = 'Does this memory feel right?' } else if (currentPhase === 'emotion') { textEl = document.querySelector('#generatedEmotionContent .generated-text'); textarea = document.getElementById('editEmotionTextarea'); confirmMsg = 'Is this what you felt?' } if (!textEl || !textarea) return; isEditMode = !isEditMode; if (isEditMode) { textarea.value = textEl.textContent; textEl.style.display = 'none'; textarea.style.display = 'block'; editBtn.textContent = 'Save'; editBtn.classList.add('active') } else { textEl.textContent = textarea.value; textEl.style.display = 'block'; textarea.style.display = 'none'; editBtn.textContent = 'Edit'; editBtn.classList.remove('active'); showNotification('Edit complete'); if (currentPhase !== 'complete') { addChatMessageWithConfirm('ai', confirmMsg) } } }
let experiencerStatusPosition = 'left';
function updateExperiencerStatus(status) { const floatEl = document.getElementById('experiencerStatusFloat'); if (!floatEl) return; floatEl.style.display = 'block'; floatEl.textContent = status; experiencerStatusPosition = experiencerStatusPosition === 'left' ? 'right' : 'left'; floatEl.classList.remove('left', 'right'); floatEl.classList.add(experiencerStatusPosition) }
function saveEditedScene() { const textarea = document.getElementById('editSceneTextarea'); if (!textarea || !textarea.value.trim()) { showNotification('Please enter your edit'); return } if (currentGeneratedSceneObj) { currentGeneratedSceneObj.text = textarea.value.trim() } currentGeneratedScene = textarea.value.trim(); const sceneContent = document.getElementById('generatedSceneContent').querySelector('.generated-text'); if (sceneContent) sceneContent.textContent = textarea.value.trim(); showNotification('Scene edit complete') }
function switchToTextInput() { const waveSection = document.querySelector('.voice-wave-section'); const switchBtn = document.querySelector('.text-switch-btn'); if (waveSection && switchBtn) { waveSection.style.display = 'none'; const textInputContainer = document.createElement('div'); textInputContainer.className = 'text-input-container-live'; textInputContainer.style.width = '100%'; textInputContainer.innerHTML = `<div class="chat-input-wrapper"><textarea class="chat-input-textarea" id="liveTextInput" placeholder="Tell your memory..." rows="3"></textarea><button class="chat-send-btn" id="chatSendBtn" onclick="sendChatMessage()">Send</button></div>`; switchBtn.parentElement.insertBefore(textInputContainer, switchBtn); switchBtn.textContent = 'Switch to Voice'; switchBtn.onclick = function () { switchToVoiceInput() }; const input = document.getElementById('liveTextInput'); if (input) { input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChatMessage() } }); input.focus() } } }
function switchToVoiceInput() { const textContainer = document.querySelector('.text-input-container-live'); const switchBtn = document.querySelector('.text-switch-btn'); const waveSection = document.querySelector('.voice-wave-section'); if (textContainer) { textContainer.remove() } if (waveSection) { waveSection.style.display = 'block' } if (switchBtn) { switchBtn.textContent = 'Switch to Text'; switchBtn.onclick = function () { switchToTextInput() } } }
let conversationHistory = []; let currentGeneratedSceneObj = null; let currentGeneratedEmotion = null;
let currentPhase = 'scene'; let pendingEmotionText = '';
let currentGeneratedScene = ''; let finalSceneObject = null;
const AI_SYSTEM_PROMPT = `You are "Another Me." You exist to help the other person unearth their memory.

Personality:
- Short and calm tone
- Never judge
- Never use emotion words directly (no "sad," "lonely," etc.)
- No romanticizing. As it is.

Role:
- When they share a memory, ask about the situation and sensations
- Information needed: who, what, where it happened
- Ask questions like "Where was that?", "Who was there?", "What did you see then?", "How did your body feel?"
- No interpretation or analysis. Only ask about situations and sensations.
- When you've heard enough, request memory conversion

Emotion types: fear, sadness, anger, joy, longing, guilt

Response format:
- Normal conversation: ask briefly, focus on situation and sensation
- When the memory is sufficient: just say "I'll convert the memory."`;
function extractGeneratedText(aiResponse) { if (aiResponse.includes('[SCENE_READY]')) { try { const jsonStr = aiResponse.substring(aiResponse.indexOf('[SCENE_READY]') + '[SCENE_READY]'.length).trim(); const data = JSON.parse(jsonStr); if (currentPhase === 'scene' && data.scene) return data.scene.text || data.scene; if (currentPhase === 'emotion' && data.emotion) return data.emotion.text || data.emotion } catch (e) { } } return aiResponse.replace(/\[SCENE_READY\].*$/, '').trim() || aiResponse }
function parseEmotionInput(text) { const parts = text.split(/[,.]/).map(s => s.trim()).filter(Boolean); return { emotion: parts[0] || null, reason: parts[1] || null } }
function addChatMessageWithConfirm(role, content) { const messagesContainer = document.getElementById('chatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = `chat-message ${role}`; const label = role === 'user' ? 'me' : 'Another Me'; messageDiv.innerHTML = `<div class="chat-message-label">${label}</div><div class="chat-message-content">${content.replace(/\n/g, '<br>')}</div><div class="confirm-buttons"><button class="confirm-btn yes" onclick="handleConfirm('yes')">Yes</button><button class="confirm-btn no" onclick="handleConfirm('no')">No</button></div>`; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }
async function handleConfirm(answer) {
    removeConfirmButtons();
    if (currentPhase === 'scene') {
        if (answer === 'yes') {
            const currentState = appStore.getState();
            const sceneText = currentGeneratedScene || currentState.pendingSceneText || '';
            console.log('handleConfirm - scene yes clicked, sceneText:', sceneText);
            console.log('currentGeneratedScene:', currentGeneratedScene);
            console.log('pendingSceneText:', currentState.pendingSceneText);
            console.log('currentSessionId:', currentState.currentSessionId);
            if (!sceneText) {
                console.error('Scene 텍스트가 not found!');
                addChatMessage('ai', 'Scene not found. Please try again.');
                return;
            }
            if (currentState.currentSessionId) {
                console.log('saveLiveScene called 시작');
                await saveLiveScene({
                    text: sceneText,
                    emotionRaw: '',
                    reasonRaw: '',
                    generatedEmotion: '',
                    emotionAnalysis: { base: { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, intensity: 0, confidence: 0 },
                    voidInfo: { sceneVoid: false, emotionVoid: true, reasonVoid: true }
                });
                console.log('saveLiveScene called 완료');
            } else {
                console.warn('currentSessionId가 없어서 저장하지 않습니다');
            }
            currentPhase = 'emotion';
 // expInterview.js load됐으면 칩 인터view 
            if (typeof startExpInterview === 'function') {
                console.log('[handleConfirm] expInterview start (ritual flow)');
 // ritual flow용 scene object create
                const ritualScene = {
                    scene_order: appStore.getState().liveSceneNum || 1,
                    text: sceneText,
                    original_emotion: null, // ritual에서는 아직 없음
                    scene_type: 'branch'
                };
                startExpInterview(ritualScene);
            } else {
                addChatMessage('ai', 'What were you feeling then?');
            }
            return;
        } else {
            addChatMessage('ai', 'Tell me again.');
            return;
        }
    }
    if (currentPhase === 'emotion') {
        if (answer === 'yes') {
            console.log('=== EMOTION CONFIRM ===');
            console.log('finalSceneObject:', finalSceneObject);
            console.log('currentGeneratedScene:', currentGeneratedScene);
            const currentStateForLog = appStore.getState(); console.log('pendingSceneText:', currentStateForLog.pendingSceneText);
            if (!finalSceneObject) {
                console.error('finalSceneObject is null!');
                addChatMessage('ai', 'Enter your emotion again.');
                return;
            }
            if (!finalSceneObject.text && currentGeneratedScene) {
                finalSceneObject.text = currentGeneratedScene;
                console.log('finalSceneObject.text 복구:', currentGeneratedScene);
            }
            const currentState = appStore.getState();
            if (!finalSceneObject.text && currentState.pendingSceneText) {
                finalSceneObject.text = currentState.pendingSceneText;
                console.log('pendingSceneText로 복구:', currentState.pendingSceneText);
            }
            console.log('저장할 finalSceneObject:', JSON.stringify(finalSceneObject));

 // Ritual mode일 때 saveRitualScene call
            const state = appStore.getState();
            if (state.currentMode === 'ritual') {
                await saveRitualScene(finalSceneObject);
            } else {
                await saveLiveScene(finalSceneObject);
            }
            if (finalSceneObject?.emotionAnalysis) {
                updateNarratorWave(finalSceneObject.emotionAnalysis);
                window.narratorEmotionVector = finalSceneObject.emotionAnalysis?.base || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 };
                console.log('화자 감정 벡터 저장:', window.narratorEmotionVector);
                const checkState = appStore.getState();
                if (supabaseClient && checkState.currentSessionId) {
                    try {
                        // Fully disabled since live_interpretations table does not exist
                        // await supabaseClient.from('live_interpretations').insert({...});
                        console.log('화자 감정 해석 저장 완료 (live_interpretations 테이블 비활성화)');
                        setTimeout(() => checkAlignment(), 1000);
                    } catch (e) {
                        console.error('화자 감정 해석 Save failed:', e);
                    }
                }
            }
            simulateNarratorInput(finalSceneObject?.text || currentGeneratedScene);
            showNotification('Scene sent.');
            updateLiveAlignment(0.1 + Math.random() * 0.15);
            const updatedState = appStore.getState();
            appStore.setState({ liveSceneNum: updatedState.liveSceneNum + 1 });
            const newState = appStore.getState();
            const liveSceneNumEl = document.getElementById('liveSceneNum');
            if (liveSceneNumEl) liveSceneNumEl.textContent = newState.liveSceneNum;
            currentPhase = 'scene';
            appStore.setState({ pendingSceneText: '' });
            currentGeneratedScene = '';
            finalSceneObject = null;
            const sceneContent = document.querySelector('#generatedSceneContent .generated-text');
            if (sceneContent) sceneContent.textContent = '';
            const emotionContent = document.querySelector('#generatedEmotionContent .generated-text');
            if (emotionContent) emotionContent.textContent = '';
            switchGeneratedTab('scene');
            addChatMessage('ai', 'Tell me the next memory.');
            console.log('=== EMOTION CONFIRM DONE ===');
            return;
        } else {
            addChatMessage('ai', 'Tell me what you felt again.');
            return;
        }
    }
}
function removeConfirmButtons() { const buttons = document.querySelectorAll('.confirm-buttons'); buttons.forEach(btn => btn.remove()) }
function addChatMessage(role, content) { const messagesContainer = document.getElementById('chatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = `chat-message ${role}`; const label = role === 'user' ? 'me' : 'Another Me'; messageDiv.innerHTML = `<div class="chat-message-label">${label}</div><div class="chat-message-content">${content.replace(/\n/g, '<br>')}</div>`; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }
async function callClaudeAPI(userMessage) { try { const messages = conversationHistory.length > 0 ? conversationHistory : [{ role: 'user', content: userMessage }]; if (conversationHistory.length === 0 || conversationHistory[conversationHistory.length - 1].role !== 'user') { messages.push({ role: 'user', content: userMessage }) } const response = await fetch(SUPABASE_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ text: userMessage, conversationHistory: messages, systemPrompt: AI_SYSTEM_PROMPT }) }); if (!response.ok) { const error = await response.json(); throw new Error(error.error || error.details || 'API call failed') } const data = await response.json(); if (data.scene) { return data.scene } else if (data.response) { return data.response } else { throw new Error(data.error || 'No response received') } } catch (error) { console.error('callClaudeAPI error:', error); throw error } }
function parseAndGenerateScene(aiResponse) { try { const sceneReadyIndex = aiResponse.indexOf('[SCENE_READY]'); if (sceneReadyIndex === -1) return; const jsonStr = aiResponse.substring(sceneReadyIndex + '[SCENE_READY]'.length).trim(); const sceneData = JSON.parse(jsonStr); currentGeneratedSceneObj = sceneData.scene; currentGeneratedEmotion = sceneData.emotion; if (sceneData.scene && sceneData.scene.text) { currentGeneratedScene = sceneData.scene.text } updateGeneratedTabs(sceneData); updateAlignmentFromScene(sceneData); showNotification('Scene generated') } catch (error) { console.error('Scene parsing error:', error); showNotification('An error occurred during scene generation') } }
function updateGeneratedTabs(sceneData) { if (sceneData.scene && sceneData.scene.text) { const sceneContent = document.getElementById('generatedSceneContent').querySelector('.generated-text'); if (sceneContent) { sceneContent.textContent = sceneData.scene.text; sceneContent.classList.remove('void-scene') } const editTextarea = document.getElementById('editSceneTextarea'); if (editTextarea) editTextarea.value = sceneData.scene.text } if (sceneData.emotion && sceneData.emotion.text) { const emotionContent = document.getElementById('generatedEmotionContent').querySelector('.generated-text'); if (emotionContent) { emotionContent.textContent = sceneData.emotion.text; emotionContent.classList.remove('void-reason') } } if (sceneData.voidInfo) { const sceneContent = document.getElementById('generatedSceneContent').querySelector('.generated-text'); const emotionContent = document.getElementById('generatedEmotionContent').querySelector('.generated-text'); if (sceneData.voidInfo.sceneVoid && sceneContent) { sceneContent.classList.add('void-scene') } if (sceneData.voidInfo.reasonVoid && emotionContent) { emotionContent.classList.add('void-reason') } } }
// [V3 DEPRECATED] accumulation 방식 alignment calculation remove.
// alignment ByeoriEngine.calculateStep() 서 calculation됨.
function updateAlignmentFromScene(sceneData) { 
  console.log('[V3] updateAlignmentFromScene called — 무시 (ByeoriEngine SSOT)');
}
let liveVoiceRecognition = null; let liveVoiceContext = null; let liveVoiceAnalyser = null; let liveVoiceMicrophone = null; let liveVoiceAnimationId = null; let liveRecognizedText = '';
function startLiveVoiceInput() { if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { showNotification('This browser does not support speech recognition'); return } const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; liveVoiceRecognition = new SpeechRecognition(); liveVoiceRecognition.lang = 'en-US'; liveVoiceRecognition.continuous = true; liveVoiceRecognition.interimResults = true; liveRecognizedText = ''; liveVoiceRecognition.onresult = function (event) { let interim = ''; let final = ''; for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) { final += event.results[i][0].transcript } else { interim += event.results[i][0].transcript } } if (final) { liveRecognizedText += final + ' ' } }; liveVoiceRecognition.onerror = function (event) { console.error('Speech recognition error:', event.error); if (event.error === 'not-allowed') { showNotification('Microphone permission required'); stopLiveVoiceInput() } }; liveVoiceRecognition.onend = function () { if (isLiveVoiceRecording && liveVoiceRecognition) { liveVoiceRecognition.start() } }; liveVoiceRecognition.start(); navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) { liveVoiceContext = new (window.AudioContext || window.webkitAudioContext)(); liveVoiceAnalyser = liveVoiceContext.createAnalyser(); liveVoiceMicrophone = liveVoiceContext.createMediaStreamSource(stream); liveVoiceMicrophone.connect(liveVoiceAnalyser); liveVoiceAnalyser.fftSize = 256; const bufferLength = liveVoiceAnalyser.frequencyBinCount; const dataArray = new Uint8Array(bufferLength); const canvas = document.getElementById('voiceWaveCanvasLive'); const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2); function draw() { if (!isLiveVoiceRecording) return; liveVoiceAnimationId = requestAnimationFrame(draw); liveVoiceAnalyser.getByteFrequencyData(dataArray); ctx.fillStyle = 'rgba(10,10,12,0.9)'; ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2); const barWidth = (canvas.width / 2 / bufferLength) * 2.5; let x = 0; for (let i = 0; i < bufferLength; i++) { const barHeight = (dataArray[i] / 255) * canvas.height * 0.9; const gradient = ctx.createLinearGradient(0, canvas.height / 2 - barHeight, 0, canvas.height / 2); gradient.addColorStop(0, 'rgba(122,154,122,0.9)'); gradient.addColorStop(1, 'rgba(74,144,217,0.5)'); ctx.fillStyle = gradient; ctx.fillRect(x, canvas.height / 2 - barHeight, barWidth - 1, barHeight * 2); x += barWidth } } draw() }).catch(function (err) { console.error('Microphone access denied:', err); showNotification('마이크 접근이 거부 complete'); stopLiveVoiceInput() }); isLiveVoiceRecording = true; const waveSection = document.querySelector('.voice-wave-section'); if (waveSection) waveSection.style.border = '2px solid rgba(122,154,122,0.5)'; showNotification('음성 입력이 시작 complete. 말한 내용은 자동으로 전송됩니다.') }
function stopLiveVoiceInput() { if (!isLiveVoiceRecording && !liveVoiceRecognition) return; isLiveVoiceRecording = false; if (liveVoiceRecognition) { liveVoiceRecognition.stop(); liveVoiceRecognition = null } if (liveVoiceAnimationId) { cancelAnimationFrame(liveVoiceAnimationId); liveVoiceAnimationId = null } if (liveVoiceContext) { liveVoiceContext.close(); liveVoiceContext = null } liveVoiceAnalyser = null; liveVoiceMicrophone = null; if (liveRecognizedText.trim()) { const input = document.getElementById('liveTextInput'); if (input) { input.value = liveRecognizedText.trim(); sendChatMessage(); liveRecognizedText = '' } else { addChatMessage('user', liveRecognizedText.trim()); conversationHistory.push({ role: 'user', content: liveRecognizedText.trim() }); callClaudeAPI(liveRecognizedText.trim()).then(aiResponse => { addChatMessage('ai', aiResponse); conversationHistory.push({ role: 'assistant', content: aiResponse }); if (aiResponse.includes('[SCENE_READY]')) { parseAndGenerateScene(aiResponse) } }).catch(error => { console.error('AI API error:', error); addChatMessage('ai', 'Sorry, something went wrong. Could you say that again?') }); liveRecognizedText = '' } } const waveSection = document.querySelector('.voice-wave-section'); if (waveSection) waveSection.style.border = 'none'; startVoiceWaveLiveAnimation(); showNotification('음성 입력이 중지 complete') }
let isLiveVoiceRecording = false;
let mediaRecorder = null; let audioChunks = []; let isRecording = false;
let expMediaRecorder = null; let expAudioChunks = []; let isExpRecording = false;
async function toggleRecording(e) { if (e) e.stopPropagation(); const btn = document.getElementById('voiceBtn'); if (!btn) return; if (!isRecording) { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorder = new MediaRecorder(stream); audioChunks = []; mediaRecorder.ondataavailable = (e) => { audioChunks.push(e.data) }; mediaRecorder.onstop = async () => { if (audioChunks.length === 0) { btn.textContent = '🎤 Voice Input'; showNotification('No recording found'); mediaRecorder.stream.getTracks().forEach(track => track.stop()); return } const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); btn.textContent = '⏳ Converting...'; const text = await transcribeAudio(audioBlob); if (text) { const sceneInput = document.getElementById('liveTextInput'); if (sceneInput) { sceneInput.value = text; sceneInput.focus(); setTimeout(() => { sendChatMessage() }, 100) } else { const unifiedInput = document.getElementById('unifiedInput'); if (unifiedInput) { unifiedInput.value = text; unifiedInput.focus(); setTimeout(() => { handleUnifiedSubmit(text) }, 100) } else { showNotification('Input field not found') } } } else { showNotification('Voice conversion failed') } btn.textContent = '🎤 Voice Input'; mediaRecorder.stream.getTracks().forEach(track => track.stop()) }; mediaRecorder.start(); isRecording = true; btn.textContent = '⏹️ 녹음 중지'; showNotification('녹음이 시작 complete') } catch (err) { console.error('녹음 시작 error:', err); alert('마이크 권한이 필요합니다'); btn.textContent = '🎤 Voice Input' } } else { if (mediaRecorder && mediaRecorder.state !== 'inactive') { mediaRecorder.stop(); isRecording = false } } }
async function transcribeAudio(audioBlob) { try { supabaseClient = getSupabaseClient(); if (!supabaseClient) { throw new Error('Supabase client not initialized') } if (!audioBlob || audioBlob.size === 0) { throw new Error('No recording data found') } const formData = new FormData(); formData.append('audio', audioBlob, 'audio.webm'); const { data, error } = await supabaseClient.functions.invoke('transcribe-audio', { body: formData }); if (error) { console.error('Supabase Edge Function error:', error); throw error } if (!data || !data.text) { console.error('응답 데이터 형식 error:', data); throw new Error('Invalid response data format') } const text = data.text; let sceneInput = document.getElementById('liveTextInput'); if (!sceneInput) { const switchBtn = document.querySelector('.text-switch-btn'); if (switchBtn && typeof switchToTextInput === 'function') { switchToTextInput(); sceneInput = document.getElementById('liveTextInput') } } if (sceneInput) { sceneInput.value = text; sceneInput.focus() } return text } catch (err) { console.error('음성 변환 에러:', err); const errorMsg = err.message || 'Voice conversion failed'; showNotification(errorMsg); return null } }
async function transcribeExpAudio(audioBlob) { try { supabaseClient = getSupabaseClient(); if (!supabaseClient) { throw new Error('Supabase client not initialized') } if (!audioBlob || audioBlob.size === 0) { throw new Error('No recording data found') } const formData = new FormData(); formData.append('audio', audioBlob, 'audio.webm'); const { data, error } = await supabaseClient.functions.invoke('transcribe-audio', { body: formData }); if (error) { console.error('Supabase Edge Function error:', error); throw error } if (!data || !data.text) { console.error('응답 데이터 형식 error:', data); throw new Error('Invalid response data format') } const text = data.text; let expInput = document.getElementById('expTextInput'); if (!expInput) { showNotification('Input field not found'); return null } expInput.value = text; expInput.focus(); setTimeout(() => { sendExpChatMessage() }, 100); return text } catch (err) { console.error('음성 변환 에러:', err); const errorMsg = err.message || 'Voice conversion failed'; showNotification(errorMsg); return null } }
async function toggleExpRecording(e) { if (e) e.stopPropagation(); const btn = document.getElementById('expVoiceBtn'); if (!btn) return; if (!isExpRecording) { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); expMediaRecorder = new MediaRecorder(stream); expAudioChunks = []; expMediaRecorder.ondataavailable = (e) => { expAudioChunks.push(e.data) }; expMediaRecorder.onstop = async () => { if (expAudioChunks.length === 0) { btn.textContent = '🎤 Voice Input'; showNotification('No recording found'); expMediaRecorder.stream.getTracks().forEach(track => track.stop()); return } const audioBlob = new Blob(expAudioChunks, { type: 'audio/webm' }); btn.textContent = '⏳ Converting...'; const text = await transcribeExpAudio(audioBlob); if (text) { showNotification('Voice input complete') } else { showNotification('Voice conversion failed') } btn.textContent = '🎤 Voice Input'; expMediaRecorder.stream.getTracks().forEach(track => track.stop()) }; expMediaRecorder.start(); isExpRecording = true; btn.textContent = '⏹️ 녹음 중지'; showNotification('녹음이 시작 complete') } catch (err) { console.error('녹음 시작 error:', err); alert('마이크 권한이 필요합니다'); btn.textContent = '🎤 Voice Input' } } else { if (expMediaRecorder && expMediaRecorder.state !== 'inactive') { expMediaRecorder.stop(); isExpRecording = false } } }
function startVoiceWaveLiveAnimation() {
    let time = 0;
    let narratorInitialized = false;
    let experiencerInitialized = false;
    function initializeCanvas(canvas) {
        if (!canvas) return false;
        if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return false;
        try {
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth * 2;
            canvas.height = canvas.offsetHeight * 2;
            ctx.scale(2, 2);
            return true;
        } catch (e) {
            console.error('Canvas initialization error:', e);
            return false;
        }
    }
    function animateWave(canvas, isExperiencer) {
        if (!canvas) return;
        try {
            const ctx = canvas.getContext('2d');
            const width = canvas.width / 2;
            const height = canvas.height / 2;
            const centerY = height / 2;
            const baseAmplitude = isLiveVoiceRecording || isRecording ? 50 : 25;
            const amplitude = baseAmplitude + Math.sin(time * 0.1) * 8;
            ctx.fillStyle = 'rgba(10,10,12,0.9)';
            ctx.fillRect(0, 0, width, height);
            ctx.beginPath();
            ctx.strokeStyle = isLiveVoiceRecording || isRecording ? 'rgba(122,154,122,0.9)' : 'rgba(74,144,217,0.8)';
            ctx.lineWidth = 3;
            for (let x = 0; x < width; x++) {
                const y = centerY + Math.sin(x * 0.03 + time * 0.08) * amplitude + Math.sin(x * 0.015 + time * 0.05) * (amplitude * 0.6);
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        } catch (e) {
            console.error('Wave animation error:', e);
        }
    }
    function animate() {
        const narratorCanvas = document.getElementById('voiceWaveCanvasLive');
        const experiencerCanvas = document.getElementById('expVoiceWaveCanvas');
        if (narratorCanvas) {
            if (!narratorInitialized) {
                narratorInitialized = initializeCanvas(narratorCanvas);
            }
            if (narratorInitialized) {
                animateWave(narratorCanvas, false);
            }
        }
        if (experiencerCanvas) {
            if (experiencerCanvas.offsetWidth > 0 && experiencerCanvas.offsetHeight > 0) {
                if (!experiencerInitialized) {
                    experiencerInitialized = initializeCanvas(experiencerCanvas);
                }
                if (experiencerInitialized) {
                    animateWave(experiencerCanvas, true);
                }
            }
        }
        time++;
        voiceWaveLiveAnimationId = requestAnimationFrame(animate);
    }
    animate();
    const narratorWaveSection = document.querySelector('#voiceWaveSection');
    if (narratorWaveSection && !narratorWaveSection.hasAttribute('data-listener-added')) {
        narratorWaveSection.setAttribute('data-listener-added', 'true');
        narratorWaveSection.addEventListener('click', function (e) {
            if (e.target.id === 'voiceBtn' || e.target.closest('#voiceBtn')) { return }
            if (!isLiveVoiceRecording) { startLiveVoiceInput() } else { stopLiveVoiceInput() }
        });
    }
}
function stopVoiceWaveLiveAnimation() { if (voiceWaveLiveAnimationId) { cancelAnimationFrame(voiceWaveLiveAnimationId); voiceWaveLiveAnimationId = null } }
// alignmentWaveAnimationId, comparisonWaveAnimationId, comparisonWaveTime Visualizer internal 서 management됨
let voiceWaveLiveAnimationId = null;
function selectMemory(index) {}
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
        // TODO: Use this after adding originalVector column to scenes table
        // Currently uses fallbackAlignment() from expInterview.js
        let displayScene = scene;

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
  guilt: ['sorry','fault','my fault','self-blame','regret','should have','shouldn\'t have','blame','wrong','because of me'],
  longing: ['miss','long for','again','return','back then','remember','still','remains','think of'],
  sadness: ['sad','cry','tears','hard','hurt','broken','tired','lonely','sorrow'],
  fear: ['scared','afraid','trembled','fear','anxious','avoid','run','hated','dread'],
  anger: ['angry','annoyed','furious','unfair','why','betrayed','hate','rage','mad'],
  shame: ['embarrassed','ashamed','humiliated','exposed','hiding','can\'t say'],
  numbness: ['don\'t know','nothing','empty','just','whatever','numb','blank','no idea'],
  isolation: ['alone','nobody','abandoned','left','forsaken','only me'],
};
function quickAnalyze(text) {
  if (!text || text.trim().length < 2) return null;
  const base = {};
  for (const [em, kws] of Object.entries(_LIVE_KW)) {
    base[em] = 0;
    for (const kw of kws) { if (text.includes(kw)) base[em] = Math.min(1, base[em] + 0.4); }
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
    return byeoriEngine.calculateStep(input, context);
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
    appStore.setState({ emotionHistory: updatedHistory });

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
function restart() { if (window.soundscape) window.soundscape.stop(); appStore.setState({ currentMode: null, currentRole: null, sessionCode: null, currentMemory: null, currentScene: 0, userChoices: [], userReasons: [], currentAlignment: 0, currentBucket: null, emotionHistory: [], liveSceneNum: 1, liveFragments: 0, liveMatches: 0 }); const endScreenEl = document.getElementById('endScreen'); if (endScreenEl) { endScreenEl.classList.remove('active'); endScreenEl.style.display = 'none' } const liveContainerEl = document.getElementById('liveContainer'); if (liveContainerEl) { liveContainerEl.classList.remove('active'); liveContainerEl.style.display = 'none' } const archiveContainerEl = document.getElementById('archiveContainer'); if (archiveContainerEl) { archiveContainerEl.classList.remove('active'); archiveContainerEl.style.display = 'none' } const memoryListEl = document.getElementById('memoryList'); if (memoryListEl) memoryListEl.style.display = 'grid'; const sceneViewerEl = document.getElementById('sceneViewer'); if (sceneViewerEl) { sceneViewerEl.classList.remove('active'); sceneViewerEl.style.display = 'none' } const introScreen = document.getElementById('introScreen'); if (introScreen) { introScreen.classList.remove('hidden'); introScreen.classList.add('visible'); introScreen.style.cssText = 'display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important' } const narratorPanelEl = document.getElementById('narratorPanel'); if (narratorPanelEl) narratorPanelEl.classList.remove('active'); const experiencerPanelEl = document.getElementById('experiencerPanel'); if (experiencerPanelEl) experiencerPanelEl.classList.remove('active'); const interpretationTraceEl = document.getElementById('interpretationTrace'); if (interpretationTraceEl) interpretationTraceEl.style.display = 'none'; const liveSceneContentEl = document.getElementById('liveSceneContent'); if (liveSceneContentEl) liveSceneContentEl.textContent = '화자가 기억을 불러오고 있습니다...'; const feelingInput = document.getElementById('experiencerFeelingInput'); if (feelingInput) feelingInput.value = ''; const memoryTraceContent = document.getElementById('memoryTraceContent'); if (memoryTraceContent) memoryTraceContent.textContent = '—'; const liveAlignmentValueEl = document.getElementById('liveAlignmentValue'); if (liveAlignmentValueEl) { liveAlignmentValueEl.textContent = '0.00'; liveAlignmentValueEl.classList.remove('high') } const liveAlignmentFillEl = document.getElementById('liveAlignmentFill'); if (liveAlignmentFillEl) liveAlignmentFillEl.style.width = '0%'; const liveSceneNumEl = document.getElementById('liveSceneNum'); if (liveSceneNumEl) liveSceneNumEl.textContent = '1'; const liveFragmentsEl = document.getElementById('liveFragments'); if (liveFragmentsEl) liveFragmentsEl.textContent = '0'; const liveMatchesEl = document.getElementById('liveMatches'); if (liveMatchesEl) liveMatchesEl.textContent = '0'; const footer = document.querySelector('.footer'); if (footer) footer.classList.remove('visible') }
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
async function saveLiveToArchive(fate) { const state = appStore.getState(); if (!state.currentSessionId) { console.log('No session to save to archive'); return } try { const sessionResult = await networkService.getSessionById(state.currentSessionId); if (!sessionResult.ok || !sessionResult.data) { console.error('Session not found'); return } const sessionData = sessionResult.data; const scenesResult = await networkService.getLiveScenesBySessionId(state.currentSessionId); if (!scenesResult.ok || !scenesResult.data || scenesResult.data.length === 0) { console.log('No scenes to save'); return } const scenesData = scenesResult.data; const memoryCode = 'L-' + sessionData.session_code; const memoryTitle = 'Live Memory #' + sessionData.session_code; const dilutionValue = fate === 'preserve' ? 100 : fate === 'dilute' ? 50 : 0; const memoryResult = await networkService.saveMemory({ code: memoryCode, title: memoryTitle, layers: 1, dilution: dilutionValue, is_public: true, source_type: 'live', source_session_id: state.currentSessionId, memory_fate: fate }); if (!memoryResult.ok || !memoryResult.data) { console.error('Memory insert error:', memoryResult.error); return } const newMemory = memoryResult.data; for (let i = 0; i < scenesData.length; i++) { const scene = scenesData[i]; const emotionVector = scene.emotion_vector || {}; const dominantEmotion = getDominantEmotion(emotionVector); const sceneResult = await networkService.saveScene({ memory_id: newMemory.id, scene_order: scene.scene_index || i + 1, text: scene.scene_text || '', scene_type: 'normal', echo_words: [], emotion_dist: emotionVector }); if (sceneResult.ok && sceneResult.data) { await networkService.saveChoice({ scene_id: sceneResult.data.id, choice_order: 0, text: scene.generated_emotion || 'Felt emotion', emotion: dominantEmotion, intensity: Math.round((scene.intensity || 0.5) * 10) }) } } console.log('Live session saved to archive'); showNotification('Memory saved to archive') } catch (e) { console.error('saveLiveToArchive error:', e) } }
// getDominantEmotion and getBucket are imported from /js/shared/math.js
const bucketDialogue = { HIGH: NPC_DIALOGUES.bucket.HIGH, MID: NPC_DIALOGUES.bucket.MID, LOW: NPC_DIALOGUES.bucket.LOW, FIXATED: NPC_DIALOGUES.bucket.FIXATED }; const bucketSystemMessage = { HIGH: "[ Synchronization stable ]", MID: "[ Signal unstable ]", LOW: "[ Distortion detected ]", FIXATED: "[ Loop detected ]" }; function showBucketFeedback(bucket, alignment) { if (bucket && bucketDialogue[bucket]) { showNpcDialogue(bucketDialogue[bucket], 4000) } if (bucket && bucketSystemMessage[bucket]) { showSystemMessage(bucketSystemMessage[bucket]) } } function showSystemMessage(message) { const systemMsgEl = document.getElementById('systemMessage'); if (systemMsgEl) { systemMsgEl.textContent = message; systemMsgEl.classList.add('visible'); setTimeout(() => { systemMsgEl.classList.remove('visible') }, 2000) } } async function getContaminationLevel(memoryId) { try { const result = await networkService.getContaminationLevel(memoryId); if (!result.ok) { console.error('Contamination calculation error:', result.error); return 0 } const maxLayers = 100; const contamination = Math.min((result.data || 0) / maxLayers, 1.0); console.log('=== Contamination Calculation ==='); console.log('memory_id:', memoryId); console.log('plays 수:', result.data); console.log('Contamination:', contamination); return contamination } catch (e) { console.error('getContaminationLevel error:', e); return 0 } } function getContaminationStage(contamination) { if (contamination >= 0.9) return 3; if (contamination >= 0.6) return 2; if (contamination >= 0.3) return 1; return 0 } async function getContaminationDirection(memoryId) { try { const result = await networkService.getPlaysMismatchTypes(memoryId); if (!result.ok) { console.error('Contamination direction error:', result.error); return 'default' } const plays = result.data || []; if (plays.length === 0) { console.log('=== Contamination Direction ==='); console.log('No plays data, using default'); return 'default' } const counts = { emotion_mismatch: 0, target_displacement: 0, attribution_mismatch: 0, void_mismatch: 0 }; plays.forEach(p => { if (p.mismatch_type && counts[p.mismatch_type] !== undefined) { counts[p.mismatch_type]++ } }); const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]; console.log('=== Contamination Direction ==='); console.log('Mismatch stats:', counts); console.log('Dominant type:', dominant[0], `(${dominant[1]}회)`); return dominant[1] > 0 ? dominant[0] : 'default' } catch (e) { console.error('getContaminationDirection error:', e); return 'default' } } async function getContaminatedText(scene, stage, memoryId, direction = 'default') { if (stage === 0) return scene.text; const stageKey = `text_stage_${stage}_${direction}`; if (scene[stageKey]) { console.log(`Stage ${stage} (${direction}) 캐시 사용`); return scene[stageKey] } console.log(`Stage ${stage} (${direction}) AI 생성 중...`); const contaminatedText = await generateContaminatedText(scene.text, stage, direction); if (contaminatedText && scene.id && contaminatedText !== scene.text) { try { const result = await networkService.updateScene(scene.id, { [stageKey]: contaminatedText }); if (result.ok) { console.log(`Stage ${stage} (${direction}) 캐시 저장 완료`) } else { console.warn('Cache save failed (optional):', result.error) } } catch (e) { console.warn('Cache save error (ignored):', e) } } return contaminatedText || scene.text } async function generateContaminatedText(originalText, stage, direction = 'default') { try { const result = await networkService.invokeFunction('contaminate-text', { text: originalText, stage: stage, direction: direction }); if (!result.ok) { console.warn('Contamination text service unavailable, using original:', result.error?.message || result.error); return originalText } if (result.data && result.data.contaminatedText) { return result.data.contaminatedText } return originalText } catch (e) { console.warn('Contamination text error, using original:', e?.message || e); return originalText } } async function loadSceneWithContamination(scene, memoryId) { const contamination = await getContaminationLevel(memoryId); const stage = getContaminationStage(contamination); const direction = await getContaminationDirection(memoryId); console.log('=== Applying Contamination ==='); console.log('Contamination:', contamination); console.log('Stage:', stage); console.log('Direction:', direction); const displayText = await getContaminatedText(scene, stage, memoryId, direction); return { ...scene, displayText, contaminationStage: stage, contaminationDirection: direction } }
function saveSessionRecord() { const state = appStore.getState(); if (!state.isLoggedIn || !state.currentUser) return; const user = state.currentUser; if (!user.sessionHistory) user.sessionHistory = []; const sessionRecord = { id: Date.now(), date: new Date().toLocaleString('en-US'), role: state.currentRole || '—', memoryFate: window.selectedMemoryFate || '—', alignment: state.currentAlignment.toFixed(2), scenes: state.liveSceneNum || state.currentScene + 1, fragments: state.liveFragments || 0, matches: state.liveMatches || 0 }; user.sessionHistory.unshift(sessionRecord); if (user.sessionHistory.length > 50) user.sessionHistory = user.sessionHistory.slice(0, 50); appStore.setState({ currentUser: user }) }
async function loadMypageDataFromDB() { const state = appStore.getState(); if (!state.currentUser?.id) { renderSessionHistoryEmpty(); renderMyMemoriesEmpty(); return } try { const [sessionsResult, memoriesResult, statsResult] = await Promise.all([loadSessionHistoryFromDB(), loadMyMemoriesFromDB(), loadUserStatsFromDB()]); renderSessionHistoryList(sessionsResult); renderMyMemoriesList(memoriesResult); updateMypageStats(statsResult); await renderReceivedNotes() } catch (e) { console.error('loadMypageDataFromDB error:', e); renderSessionHistoryEmpty(); renderMyMemoriesEmpty() } }
async function loadSessionHistoryFromDB() { const state = appStore.getState(); if (!state.currentUser?.id) return []; try { const result = await networkService.getUserSessionHistory(state.currentUser.id, 50); if (!result.ok) return []; return result.data || [] } catch (e) { console.error('loadSessionHistoryFromDB error:', e); return [] } }
async function loadMyMemoriesFromDB() {
    const state = appStore.getState();
    if (!state.currentUser?.id) return [];
    try {
        const sessionIdsResult = await networkService.getUserSessionIds(state.currentUser.id);
        if (sessionIdsResult.ok && sessionIdsResult.data && sessionIdsResult.data.length > 0) {
            const ids = sessionIdsResult.data.map(s => s.id);
            const memoriesResult = await networkService.getMemoriesBySessionIds(ids, 50);
            if (memoriesResult.ok) return memoriesResult.data || [];
        }
        return [];
    } catch (e) {
        console.error('loadMyMemoriesFromDB error:', e);
        return [];
    }
}
async function loadUserStatsFromDB() {
    const state = appStore.getState();
    if (!state.currentUser?.id) return { sessions: 0, memories: 0, interpretations: 0 };
    try {
        const sessionsResult = await networkService.getUserSessionIds(state.currentUser.id);
        const sessionIds = (sessionsResult.ok && sessionsResult.data) ? sessionsResult.data.map(s => s.id) : [];
        let memoriesCount = 0;
        if (sessionIds.length > 0) {
            const memoriesResult = await networkService.getMemoryIdsBySessionIds(sessionIds);
            memoriesCount = (memoriesResult.ok && memoriesResult.data) ? memoriesResult.data.length : 0;
        }
 // live_interpretations 테 블 없으므 interpretationsCount 항상 0
        const interpretationsCount = 0;
        return { sessions: sessionIds.length, memories: memoriesCount, interpretations: interpretationsCount };
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
function typeText(element, text, callback) { let index = 0; element.textContent = ''; element.classList.add('typing'); function typeChar() { if (index < text.length) { element.textContent += text.charAt(index); index++; setTimeout(typeChar, 50) } else { element.classList.remove('typing'); if (callback) callback() } } typeChar() }
function typeTextAsync(element, text, speed = 80) { return new Promise(resolve => { element.classList.add('typing'); let i = 0; element.textContent = ''; const timer = setInterval(() => { if (i < text.length) { element.textContent += text.charAt(i); i++ } else { clearInterval(timer); element.classList.remove('typing'); resolve() } }, speed) }) }
function typeDots(element, callback) { element.textContent = '\n'; element.classList.add('typing'); let dotCount = 0; function addDot() { if (dotCount < 3) { element.textContent += '.'; dotCount++; setTimeout(addDot, 300) } else { element.classList.remove('typing'); if (callback) callback() } } addDot() }
async function playNpcIntro() { const centerWrapper = document.querySelector('.intro-center-wrapper'); const dialogue = document.getElementById('npcIntroDialogue'); if (!centerWrapper || !dialogue) return; await new Promise(r => setTimeout(r, 2000)); centerWrapper.classList.add('lifted'); await new Promise(r => setTimeout(r, 1000)); dialogue.classList.add('visible'); await typeTextAsync(dialogue, NPC_DIALOGUES.intro.firstVisit, 100); await new Promise(r => setTimeout(r, 1500)); dialogue.textContent = ''; await typeTextAsync(dialogue, NPC_DIALOGUES.intro.returning, 80); await new Promise(r => setTimeout(r, 2000)); dialogue.classList.remove('visible'); await new Promise(r => setTimeout(r, 500)); centerWrapper.classList.remove('lifted') }
let openingSkipped = false; let openingWaveAnimationId = null; let openingMouseX = -100; let openingMouseY = -100; let hasZoomedIn = false; let openingSequenceStarted = false; let openingSound = null; let fadeOutAnimationId = null; let fadeOutInterval = null; let crossfadeTimeUpdateHandler = null; let crossfadeEndedHandler = null;
function fadeInSound(audio, targetVolume = 0.6, duration = 4000) { if (!audio) { console.error('fadeInSound: audio 요소가 not found'); return } audio.volume = 0; const playPromise = audio.play(); if (playPromise !== undefined) { playPromise.then(() => { console.log('opening 사운드 재생 시작'); const steps = 60; const step = targetVolume / steps; const interval = duration / steps; let currentStep = 0; const fade = setInterval(() => { currentStep++; if (currentStep < steps) { audio.volume = Math.min(1, Math.max(0, Math.min(step * currentStep, targetVolume))) } else { audio.volume = Math.min(1, Math.max(0, targetVolume)); clearInterval(fade) } }, interval) }).catch(e => { console.error('opening 사운드 재생 Failed:', e); console.error('오디오 Status:', { readyState: audio.readyState, networkState: audio.networkState, error: audio.error }) }) } }
function fadeOutSound(audio, duration = 3000) { if (!audio) return; if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } if (crossfadeTimeUpdateHandler && audio) { audio.removeEventListener('timeupdate', crossfadeTimeUpdateHandler); crossfadeTimeUpdateHandler = null } if (crossfadeEndedHandler && audio) { audio.removeEventListener('ended', crossfadeEndedHandler); crossfadeEndedHandler = null } const startVolume = Math.max(audio.volume || 0, 0.01); if (startVolume <= 0) { audio.pause(); audio.currentTime = 0; return } if (audio.paused) { audio.play().catch(() => { }) } const startTime = performance.now(); let lastVolume = startVolume; let pauseCheckInterval = setInterval(() => { if (audio && audio.paused && lastVolume > 0.01) { audio.play().catch(() => { }) } }, 50); function animateFadeOut(currentTime) { if (!audio) { if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } if (pauseCheckInterval) { clearInterval(pauseCheckInterval); pauseCheckInterval = null } return } if (audio.paused && lastVolume > 0.01) { audio.play().catch(() => { }) } const elapsed = currentTime - startTime; const progress = Math.min(elapsed / duration, 1); const newVolume = Math.max(startVolume * (1 - progress), 0); lastVolume = newVolume; try { if (audio) { audio.volume = Math.min(1, Math.max(0.001, Math.max(newVolume, 0.001))) } } catch (e) { console.error('Volume update error:', e) } if (progress >= 1 || newVolume <= 0.01) { if (pauseCheckInterval) { clearInterval(pauseCheckInterval); pauseCheckInterval = null } setTimeout(() => { try { if (audio) { audio.volume = 0; audio.pause(); audio.currentTime = 0 } } catch (e) { console.error('Audio pause error:', e) } if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } }, 200) } else { fadeOutAnimationId = requestAnimationFrame(animateFadeOut) } } fadeOutAnimationId = requestAnimationFrame(animateFadeOut) }
function setupLoopWithCrossfade(audio, targetVolume = 0.6, fadeDuration = 2) { if (!audio) return; if (crossfadeTimeUpdateHandler) { audio.removeEventListener('timeupdate', crossfadeTimeUpdateHandler) } if (crossfadeEndedHandler) { audio.removeEventListener('ended', crossfadeEndedHandler) } crossfadeTimeUpdateHandler = function () { if (fadeOutInterval) return; const timeLeft = audio.duration - audio.currentTime; if (timeLeft <= fadeDuration && timeLeft > 0) { audio.volume = Math.min(1, Math.max(0, targetVolume * (timeLeft / fadeDuration))) } }; crossfadeEndedHandler = function () { if (fadeOutInterval) return; audio.currentTime = 0; fadeInSound(audio, targetVolume, fadeDuration * 1000) }; audio.addEventListener('timeupdate', crossfadeTimeUpdateHandler); audio.addEventListener('ended', crossfadeEndedHandler) }
function skipToIntro() { openingSequenceStarted = true; skipOpening() }
function showContinueButton() { if (openingSkipped) return; const startHint = document.getElementById('openingStartHint'); if (startHint) { startHint.style.opacity = ''; startHint.classList.add('visible') } }
function showFourthText(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nCome in.', function () { if (openingSkipped) return; setTimeout(showContinueButton, 500) }) }
function showThirdText(dialogue) { if (openingSkipped) return; typeDots(dialogue, function () { if (openingSkipped) return; setTimeout(function () { showFourthText(dialogue) }, 1200) }) }
function showSecondText(dialogue) { if (openingSkipped) return; typeText(dialogue, '\n...you came looking for a memory?', function () { if (openingSkipped) return; setTimeout(function () { showThirdText(dialogue) }, 1200) }) }
function showFirstTextPart1(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nHello.', function () { if (openingSkipped) return; setTimeout(function () { showFirstTextPart2(dialogue) }, 1500) }) }
function showFirstTextPart2(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nYou\'re here. It\'s been a while.', function () { if (openingSkipped) return; setTimeout(function () { showSecondText(dialogue) }, 1200) }) }
function startOpeningWaveAnimation(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

 // 커서 호버 effect 위 event listener
    canvas.addEventListener('mousemove', function (e) {
        const rect = canvas.getBoundingClientRect();
 // ctx.scale(2, 2) 스케일링되어 있으므 , 그리기 coordinates계 canvas.width/2 범위
 // 따라서 마우스 position 그 맞게 conversion (스케일링 coordinates계 기준)
        openingMouseX = (e.clientX - rect.left) * (canvas.width / 2 / rect.width);
        openingMouseY = (e.clientY - rect.top) * (canvas.height / 2 / rect.height);
    });
    canvas.addEventListener('mouseleave', function () {
        openingMouseX = -100;
        openingMouseY = -100;
    });

    const width = canvas.width / 2;
    const height = canvas.height / 2;
    
 // canvas height 비례하여 max 진폭 제 (잘림 방지)
    const maxAmplitude = height * 0.35;

    const waves = [
        { color: 'rgba(100,130,150,', baseOpacity: 0.10, speed: 0.010, amplitude: Math.min(80, maxAmplitude), phase: 0, freq: 0.020, noiseScale: 0.8 },
        { color: 'rgba(120,150,170,', baseOpacity: 0.15, speed: 0.014, amplitude: Math.min(70, maxAmplitude * 0.9), phase: 0.6, freq: 0.025, noiseScale: 0.7 },
        { color: 'rgba(130,155,175,', baseOpacity: 0.20, speed: 0.018, amplitude: Math.min(60, maxAmplitude * 0.8), phase: 1.2, freq: 0.030, noiseScale: 0.6 },
        { color: 'rgba(140,165,185,', baseOpacity: 0.26, speed: 0.022, amplitude: Math.min(55, maxAmplitude * 0.7), phase: 1.9, freq: 0.035, noiseScale: 0.5 },
        { color: 'rgba(155,175,195,', baseOpacity: 0.33, speed: 0.026, amplitude: Math.min(45, maxAmplitude * 0.6), phase: 2.6, freq: 0.040, noiseScale: 0.4 },
        { color: 'rgba(170,190,205,', baseOpacity: 0.42, speed: 0.030, amplitude: Math.min(35, maxAmplitude * 0.5), phase: 3.3, freq: 0.045, noiseScale: 0.3 },
        { color: 'rgba(190,205,215,', baseOpacity: 0.52, speed: 0.034, amplitude: Math.min(28, maxAmplitude * 0.4), phase: 4.0, freq: 0.050, noiseScale: 0.25 },
    ];

    let time = 0;

    function animate() {
 // 잔상 effect (screen background색 동일: #0a0a0c)
        ctx.fillStyle = 'rgba(10, 10, 12, 0.92)';
        ctx.fillRect(0, 0, width, height);

        const centerY = height / 2;

        waves.forEach((wave) => {
            ctx.beginPath();
            ctx.lineWidth = 1.2;

            for (let x = 0; x < width; x++) {
 // default wave calculation
                const baseY = centerY
                    + Math.sin(x * wave.freq + time * wave.speed + wave.phase) * wave.amplitude
                    + Math.sin(x * wave.freq * 0.5 + time * wave.speed * 0.6 + wave.phase * 1.4) * (wave.amplitude * 0.4)
                    + Math.sin(x * wave.freq * 2.3 + time * wave.speed * 1.3) * (wave.amplitude * 0.15)
                    + Math.sin(x * wave.freq * 0.3 + time * wave.speed * 0.4 + wave.phase * 2.1) * (wave.amplitude * 0.25)
                    + Math.sin(x * wave.freq * 3.7 + time * wave.speed * 1.8 + wave.phase * 0.7) * (wave.amplitude * 0.1);

 // 불규칙성 위 noise (position 시간 따라 변하 )
                const noise = Math.sin(x * 0.003 + time * 0.02) * Math.cos(x * 0.007 + time * 0.015) * wave.noiseScale;
                const irregularOffset = wave.amplitude * noise * 0.4;

 // 커서 호버 effect: 커서 position 서 wave 밀어내 느낌 (드라마틱하게)
                let hoverPush = 0;
                if (openingMouseX >= 0 && openingMouseY >= 0) {
                    const distX = Math.abs(x - openingMouseX);
                    const distY = Math.abs(baseY - openingMouseY);
                    const dist = Math.sqrt(distX * distX + distY * distY);
                    
 // 더 넓 영향력 반경 부드러운 감쇠 곡선
                    const influenceRadius = 200;
                    const normalizedDist = Math.min(dist / influenceRadius, 1);
 // 부드러운 easing function (ease-out cubic) 더 드라마틱 반응
                    const influence = Math.pow(1 - normalizedDist, 3);
                    
                    if (influence > 0) {
 // 커서 Y position 방향으 wave 강하게 밀어내기
                        const pushDirection = openingMouseY - baseY;
 // X 거리 따른 영향력 (더 부드러운 감쇠)
                        const xNormalized = Math.min(distX / influenceRadius, 1);
                        const xInfluence = Math.pow(1 - xNormalized, 2);
                        
 // 더 강 푸시 effect
                        hoverPush = pushDirection * influence * xInfluence * 1.8;
                        
 // 커서 주변 서 큰 진폭 증 (손 대 느낌 강조)
                        const amplitudeBoost = influence * 0.8;
                        hoverPush += (baseY - centerY) * amplitudeBoost;
                        
 // add: 커서 position 서 wave 더 크게 퍼지 effect
                        const rippleEffect = Math.sin(distX * 0.05) * influence * 15;
                        hoverPush += rippleEffect;
                    }
                }

                const y = baseY + irregularOffset + hoverPush;
                
 // Y coordinates canvas 범위 벗어나지 않 록 제 
                const clampedY = Math.max(2, Math.min(height - 2, y));

                x === 0 ? ctx.moveTo(x, clampedY) : ctx.lineTo(x, clampedY);
            }

            ctx.strokeStyle = wave.color + wave.baseOpacity + ')';
            ctx.stroke();
        });

        time += 0.5;
        if (!openingSkipped) {
            openingWaveAnimationId = requestAnimationFrame(animate);
        }
    }

    animate();
}
function startOpeningSequence() { if (openingSkipped || window.__oauthRedirectSkipOpening) return; const waveContainer = document.getElementById('openingWaveContainer'); if (waveContainer) { waveContainer.style.transform = 'scale(5, 1)'; waveContainer.style.opacity = '1'; waveContainer.classList.add('visible') } const canvas = document.getElementById('openingWaveCanvas'); if (canvas) startOpeningWaveAnimation(canvas); setTimeout(function () { if (openingSkipped) return; const dialogue = document.getElementById('openingDialogue'); if (dialogue) showFirstTextPart1(dialogue) }, 2500) }
function skipOpening() { if (openingSkipped) return; openingSkipped = true; if (openingWaveAnimationId) { cancelAnimationFrame(openingWaveAnimationId); openingWaveAnimationId = null } const sound = openingSound || document.getElementById('openingSound'); if (sound) { if (crossfadeTimeUpdateHandler && sound) { sound.removeEventListener('timeupdate', crossfadeTimeUpdateHandler); crossfadeTimeUpdateHandler = null } if (crossfadeEndedHandler && sound) { sound.removeEventListener('ended', crossfadeEndedHandler); crossfadeEndedHandler = null } fadeOutSound(sound, 500); setTimeout(() => { finishOpeningSequence() }, 600) } else { finishOpeningSequence() } }
function handleOpeningKeydown(e) { if (!openingSkipped) { const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : ''; if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return; e.preventDefault(); skipOpening() } }
function finishOpeningSequence() { const openingScreen = document.getElementById('openingScreen'); const introScreen = document.getElementById('introScreen'); if (openingScreen) { openingScreen.removeEventListener('click', skipOpening); openingScreen.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important'; openingScreen.classList.add('hidden') } document.removeEventListener('keydown', handleOpeningKeydown); if (introScreen) { introScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2000 !important'; introScreen.classList.add('visible'); introScreen.classList.remove('hidden') } playNpcIntro() }
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
  let activeId = 'archive';
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
                    { userVector: { base: item.userEmotion }, originalVector: { base: item.originalEmotion } }, {});
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
            anchorEmotions: anchorEmotions
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
        const supabaseUrl = SUPABASE_URL || 'https://bxmppaxpzbkwebfbgpsm.supabase.co';

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

function startConfession() {
    const overlay = document.getElementById('confession-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        document.body.classList.add('confession-active');
 // V3 플 우 (window.startV3Flow confessionV3.js 서 register)
        if (typeof window.startV3Flow === 'function') {
            window.startV3Flow();
        } else {
            startFlow(); // V3 미로드 시 기존 플로우 폴백
        }
    }
}

// V3 completeV3() 서 call scene create 브릿지
window._v3GenerateScene = function(flowData) {
 // flowState.data V3 든 data 교체
    flowState.data = flowData;
 // existing scene create 플 우 execute
    generateSceneFromRitual();
};

function endConfession() {
    const overlay = document.getElementById('confession-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        document.body.classList.remove('confession-active');
    }

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
    pre.textContent = Array(DOOR_H).fill(' '.repeat(DOOR_W)).join('\n');
    setTimeout(() => startBeginner(), 400);
    return;
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

// Beginner mode start (existing Create Memory 플 우)
function startBeginner() {
    console.log('=== Confession Hub ===');
    console.log('Mode: beginner');
    hideAllScreens();
    startConfessionFlow('beginner');
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
    ['modeSelection', 'sessionSetup', 'liveContainer', 'archiveContainer', 'endScreen', 'mypageScreen', 'loginModal', 'signupModal', 'confessionHub'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active');
            el.classList.add('hidden');
            el.style.display = 'none';
        }
    });
}

// Confession 플 우 start (Beginner mode용)
function startConfessionFlow(mode) {
    appStore.setState({ currentMode: mode });
    startConfession(); // 기존 startConfession 함수 called
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
        conversationHistory = [];
        currentGeneratedSceneObj = null;
        currentGeneratedEmotion = null;
        currentPhase = 'scene';
        pendingEmotionText = '';
        currentGeneratedScene = '';
        finalSceneObject = null;
        isEditMode = false;

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
    currentPhase = 'scene';
    currentGeneratedScene = '';
    appStore.setState({ pendingSceneText: '' });
    finalSceneObject = null;

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
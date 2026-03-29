import { getSupabaseClient, onAuthStateChange, getSession, getAccessToken } from './lib/supabaseClient.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_FUNCTION_URL } from './lib/config.js';
import { detectCrisis, getRandomDialogue, CRISIS_DIALOGUES, SAFETY_RESOURCES } from './safety.js';
import { NPC_DIALOGUES } from './npc-dialogues.js';

// Shared modules
import { fetchMemories, fetchScenes, savePlay, saveNote, fetchNotes, activateMemoryIfFetus } from './shared/api.js';
import { playSound, stopSound, setVolume, SOUNDS } from './shared/audio.js';
import { cosineSimilarity, normalizeVector, addVectors, getBucket, checkFixated, getDominantEmotion, normalizeAnchor, projectEmotionToVAD, emotionVectorToWaveStyle } from './shared/math.js';
import { ByeoriEngine, byeoriEngine } from './core/ByeoriEngine.js';
// Expose to window for expInterview.js access
window.byeoriEngine = byeoriEngine;
import { appStore } from './app/appStore.js';
import { networkService } from './services/NetworkService.js';
import { realtimeService } from './services/RealtimeService.js';
import { AIService } from './services/AIService.js';
import { MemoryService } from './services/MemoryService.js';
import { uiManager } from './ui/UIManager.js';
import { visualizer } from './ui/Visualizer.js';
import { bindEvents } from './app/bindEvents.js';
import { showNotification, showNpcDialogue } from './ui/notify.js';
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
import {
    getPendingSaveAction, setPendingSaveAction,
    openMypage, showMypage, closeMypage,
    tryOAuthPostLoginNavigation,
    handleLogin, closeLogin, switchToSignup, switchToLogin,
    handleSignup, closeSignup, handleSocialLogin, handleLogout,
    updateUserStats,
    loadMypageDataFromDB, showTrueEndingNoteUI, sendNoteToAuthor,
    loadReceivedNotes, renderReceivedNotes, viewMemoryFromArchive,
    showSessionDetail, closeSessionDetail,
    checkSession,
} from './app/auth.js';
import {
    startMemoryRegistration,
    handleRegistrationInput,
    showReviewPhase, confirmScene, finishRegistration,
} from './app/registration.js';
import {
    handleCrisis, checkSafetyBeforeSubmit, showSafetyResources,
    startFlow, startConfession, endConfession,
    generateScenesFromRitual, generateSceneFromRitual,
    renderSceneResult, saveAndBury, saveConfessionToDB,
    showConfessionHub, initDoor, handleDoorClick,
    startBeginner, handleRecordComplete, saveRecordMemory, endRecordChat,
    startRitual, startRitualFlow, saveRitualScene, saveRitualToMemories,
    hideAllScreens, showMainMenu, showArchitectLocked,
    startConfessionFlow, generateMemoryCode,
} from './app/confession.js';
import {
    calculateAverageAlignment, showComparisonView,
    renderComparisonView, navigateComparison,
    closeComparisonView, endComparisonSession,
    stopBucketComparisonWaveAnimation,
} from './app/comparison.js';
import {
    enterPlayIntro, enterArchive,
    loadMemoriesFromSupabase, filterByCategory, filterMemories, sortMemories,
    updateAlignmentDisplay, renderArchiveEmotionWave,
    startArchiveWaveAnimation, stopArchiveWaveAnimation,
    renderArchiveWaveData, renderDefaultGrayLine,
    saveArchiveEmotionToPlays,
    selectMemory, backToList, initProgressDots, goToScene,
    renderScene, renderEchoLayer, renderChoices, renderArchiveFreeInput,
    makeChoice, proceedToNextScene,
    collectEmotionInput, runEngineStep, applyEngineResult,
    updateUIAfterSubmit, persistAfterSubmit, proceedToNextSceneOrEnd,
} from './app/archive.js';

console.log('=== Shared Modules Loaded ===');
console.log('API:', typeof fetchMemories);
console.log('Audio:', typeof playSound);
console.log('Math:', typeof cosineSimilarity);
// Expose to window for non-module scripts (expInterview.js, contamination.js)
window.appStore = appStore;

// Expose opening functions for bindEvents.js (must be set before initApp)
window.startOpeningWaveAnimation = startOpeningWaveAnimation;
window.startOpeningSequence = startOpeningSequence;
window.handleOpeningKeydown = handleOpeningKeydown;
window.skipToIntro = skipToIntro;
window.setupLoopWithCrossfade = setupLoopWithCrossfade;
window.fadeInSound = fadeInSound;
window.startMemoryRegistration = startMemoryRegistration;

// Keep supabaseClient and storyData as module-level vars (managed outside store)
let supabaseClient;
let storyData;

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
        window.openingSkipped = true;
        if (window.openingWaveAnimationId) { cancelAnimationFrame(window.openingWaveAnimationId); window.openingWaveAnimationId = null; }
        var op = document.getElementById('openingScreen');
        var intro = document.getElementById('introScreen');
        if (op) { op.removeEventListener('click', window.skipOpening); op.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important'; op.classList.add('hidden'); }
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
function showModeSelection() { const introScreen = document.getElementById('introScreen'); const matchingSelection = document.getElementById('matchingSelection'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } if (matchingSelection) { matchingSelection.classList.add('active'); matchingSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
function selectMatching(type) { if (type === 'session') { const matchingSelection = document.getElementById('matchingSelection'); const modeSelection = document.getElementById('modeSelection'); if (matchingSelection) { matchingSelection.classList.remove('active'); matchingSelection.style.display = 'none' } if (modeSelection) { modeSelection.classList.add('active'); modeSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } } else { showNotification('Coming soon') } }
function backToMatchingSelection() { const matchingSelection = document.getElementById('matchingSelection'); const modeSelection = document.getElementById('modeSelection'); if (modeSelection) { modeSelection.classList.remove('active'); modeSelection.style.display = 'none' } if (matchingSelection) { matchingSelection.classList.add('active'); matchingSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
function backToIntro() { if (window.soundscape) window.soundscape.stop(); const introScreen = document.getElementById('introScreen'); if (introScreen) { introScreen.classList.remove('hidden'); introScreen.classList.add('visible'); introScreen.style.cssText = 'display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important' } ['matchingSelection', 'modeSelection', 'sessionSetup', 'liveContainer', 'archiveContainer', 'endScreen', 'mypageScreen', 'loginModal', 'signupModal'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); const footer = document.querySelector('.footer'); if (footer) footer.classList.remove('visible'); stopAllAnimations() }
function backToModeSelection() { const sessionSetupEl = document.getElementById('sessionSetup'); if (sessionSetupEl) { sessionSetupEl.classList.remove('active'); sessionSetupEl.style.display = 'none' } const modeSelectionEl = document.getElementById('modeSelection'); if (modeSelectionEl) { modeSelectionEl.classList.add('active'); modeSelectionEl.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
function proceedToNextSceneLive() { try { const currentData = window.currentStoryData || storyData; const state = appStore.getState(); if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) { showNotification('Unable to load scene data'); return } if (state.currentScene < currentData.scenes.length - 1) { appStore.setState({ currentScene: state.currentScene + 1 }); simulateNarratorInput() } else { showEndScreen() } } catch (e) { console.error('proceedToNextSceneLive error:', e); showNotification('An error occurred') } }
function updateStrata() { const state = appStore.getState(); const originalPercent = 70 - (state.currentScene * 10), interpretPercent = 30 + (state.currentScene * 10); document.getElementById('strataOriginal').style.height = originalPercent + '%'; document.getElementById('strataInterpretation').style.height = interpretPercent + '%'; document.getElementById('strataInterpretation').style.bottom = originalPercent + '%' }
function getAlignmentLevel(alignment) { if (alignment >= 0.55) return 'HIGH'; if (alignment >= 0.35) return 'MID'; return 'LOW' } function startWaveAnimation() { const canvas = document.getElementById('waveCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2); let time = 0; const state = appStore.getState(); const alignmentLevel = getAlignmentLevel(state.currentAlignment); function animate() { const width = canvas.width / 2, height = canvas.height / 2, centerY = height / 2; ctx.fillStyle = 'rgba(18,18,26,0.1)'; ctx.fillRect(0, 0, width, height); if (alignmentLevel === 'HIGH') { ctx.beginPath(); ctx.strokeStyle = 'rgba(196,168,130,0.8)'; ctx.lineWidth = 2; const syncPhase = time * 0.05; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.02 + syncPhase) * 15 + Math.sin(x * 0.01 + syncPhase * 0.6) * 10; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = 'rgba(122,154,122,0.7)'; ctx.lineWidth = 2; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.02 + syncPhase + Math.PI * 0.1) * 15 + Math.sin(x * 0.01 + syncPhase * 0.6 + Math.PI * 0.1) * 10; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke() } else if (alignmentLevel === 'MID') { ctx.save(); ctx.filter = 'blur(1px)'; const irregularity = Math.sin(time * 0.1) * 0.3 + 0.7; ctx.beginPath(); ctx.strokeStyle = 'rgba(196,168,130,0.6)'; ctx.lineWidth = 1.5; for (let x = 0; x < width; x++) { const noise = Math.random() * 5 - 2.5; const y = centerY + Math.sin(x * 0.02 + time * 0.05 + noise * 0.1) * 15 * irregularity + Math.sin(x * 0.01 + time * 0.03 + noise * 0.05) * 10 * irregularity; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.restore(); ctx.beginPath(); ctx.strokeStyle = 'rgba(123,143,168,0.5)'; ctx.lineWidth = 1.5; const state = appStore.getState(); const offset = (1 - state.currentAlignment) * 30; for (let x = 0; x < width; x++) { const noise = Math.random() * 3 - 1.5; const y = centerY + Math.sin(x * 0.02 + time * 0.05 + offset + noise * 0.1) * 15 + Math.sin(x * 0.01 + time * 0.03 + offset * 0.5 + noise * 0.05) * 10; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke() } else if (alignmentLevel === 'LOW') { const glitch = Math.random() > 0.9; if (glitch) { ctx.save(); ctx.filter = 'invert(1)'; ctx.fillStyle = 'rgba(217,74,74,0.3)'; ctx.fillRect(0, 0, width, height); ctx.restore() } const noiseAmplitude = 10 + Math.random() * 10; ctx.beginPath(); ctx.strokeStyle = glitch ? 'rgba(217,74,74,0.8)' : 'rgba(196,168,130,0.4)'; ctx.lineWidth = 1.5; for (let x = 0; x < width; x++) { const noise = Math.random() * noiseAmplitude - noiseAmplitude / 2; const y = centerY + Math.sin(x * 0.02 + time * 0.05 + noise * 0.2) * 15 + Math.sin(x * 0.01 + time * 0.03 + noise * 0.1) * 10 + noise; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = glitch ? 'rgba(217,74,74,0.6)' : 'rgba(123,143,168,0.3)'; ctx.lineWidth = 1.5; const state = appStore.getState(); const offset = (1 - state.currentAlignment) * 30; for (let x = 0; x < width; x++) { const noise = Math.random() * noiseAmplitude - noiseAmplitude / 2; const y = centerY + Math.sin(x * 0.02 + time * 0.05 + offset + noise * 0.2) * 15 + Math.sin(x * 0.01 + time * 0.03 + offset * 0.5 + noise * 0.1) * 10 + noise; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke() } else if (alignmentLevel === 'FIXATED') { const slowTime = time * 0.02; const vignetteGradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height)); vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)'); vignetteGradient.addColorStop(1, 'rgba(0,0,0,0.4)'); ctx.beginPath(); ctx.strokeStyle = 'rgba(196,168,130,0.9)'; ctx.lineWidth = 2.5; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.015 + slowTime) * 12 + Math.sin(x * 0.008 + slowTime * 0.5) * 8; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = 'rgba(122,154,122,0.8)'; ctx.lineWidth = 2.5; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.015 + slowTime + Math.PI * 0.05) * 12 + Math.sin(x * 0.008 + slowTime * 0.5 + Math.PI * 0.05) * 8; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.fillStyle = vignetteGradient; ctx.fillRect(0, 0, width, height) } time++; const animId = requestAnimationFrame(animate); appStore.setState({ waveAnimationId: animId }) } animate() }
function startLiveWaveAnimation() { const canvas = document.getElementById('liveWaveCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2); let time = 0; function animate() { ctx.fillStyle = 'rgba(18,18,26,0.15)'; ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2); const width = canvas.width / 2, height = canvas.height / 2, centerY = height / 2; ctx.beginPath(); ctx.strokeStyle = 'rgba(196,168,130,0.7)'; ctx.lineWidth = 1.5; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.025 + time * 0.04) * 12 + Math.sin(x * 0.015 + time * 0.025) * 8; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = 'rgba(123,143,168,0.7)'; ctx.lineWidth = 1.5; const offset = (1 - appStore.getState().currentAlignment) * 25; for (let x = 0; x < width; x++) { const y = centerY + Math.sin(x * 0.025 + time * 0.04 + offset) * 12 + Math.sin(x * 0.015 + time * 0.025 + offset * 0.6) * 8; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.stroke(); time++; const animId = requestAnimationFrame(animate); appStore.setState({ liveWaveAnimationId: animId }) } animate() }
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
function saveMemory() {
    const _s = appStore.getState();
    console.log('saveMemory called:', { isLoggedIn: _s.isLoggedIn, currentMode: _s.currentMode, currentRole: _s.currentRole, currentSessionId: _s.currentSessionId });
    if (!_s.isLoggedIn) {
        if (confirm('Login required. Login now?')) {
            setPendingSaveAction('save');
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
    console.log('saveMemory 조건 확인:', { currentMode: _s.currentMode, currentRole: _s.currentRole });
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
function escapeHtml(text) { if (!text) return '—'; const div = document.createElement('div'); div.textContent = text; return div.innerHTML } async function showOriginalMemory(memoryId) { try { console.log('=== Viewing Original ==='); console.log('Memory ID:', memoryId); const scenesResult = await networkService.getScenesByMemoryId(memoryId); if (!scenesResult.ok) { console.error('Error loading original memory:', scenesResult.error); alert('Error loading original memory.'); return } const scenes = scenesResult.data || []; console.log('Scenes:', scenes.length); const modal = document.createElement('div'); modal.className = 'original-memory-modal'; modal.innerHTML = `<div class="original-memory-content"><h2>Original Memory</h2><p class="original-note">This is the original memory left by the author.</p><div class="original-scenes">${scenes.map((scene, i) => `<div class="original-scene"><span class="scene-number">${i + 1}</span><p class="scene-text">${escapeHtml(scene.text)}</p></div>`).join('')}</div><button class="close-original-btn" onclick="this.closest('.original-memory-modal').remove()">Close</button></div>`; document.body.appendChild(modal); modal.addEventListener('click', (e) => { if (e.target === modal) { modal.remove() } }) } catch (e) { console.error('showOriginalMemory error:', e); alert('Error loading original memory.') } }
// event 바인딩 bindEvents.js move됨
// opening screen event 바인딩 bindEvents.js move됨

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
window.loadMemoriesFromSupabase = loadMemoriesFromSupabase;
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


window.startOpeningWaveAnimation = startOpeningWaveAnimation;
window.handleOpeningKeydown = handleOpeningKeydown;


// global 스코프 노출
window.showConfessionHub = showConfessionHub;
window.startBeginner = startBeginner;
window.startRitual = startRitual;
window.showArchitectLocked = showArchitectLocked;
window.showMainMenu = showMainMenu;
window.handleCrisis = handleCrisis;
window.saveArchiveEmotionToPlays = saveArchiveEmotionToPlays; // expInterview.js에서 사용
window.showBucketFeedback = showBucketFeedback;
window.showComparisonView = showComparisonView;
window.navigateComparison = navigateComparison;
window.closeComparisonView = closeComparisonView;
window.endComparisonSession = endComparisonSession;

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
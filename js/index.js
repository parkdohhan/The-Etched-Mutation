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
// expInterview.js에서 접근할 수 있도록 window에 노출
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

// 오프닝 및 이벤트 바인딩을 위한 전역 함수 노출 (initApp 실행 전에 보장되어야 함)
window.startOpeningWaveAnimation = startOpeningWaveAnimation;
window.startOpeningSequence = startOpeningSequence;
window.handleOpeningKeydown = handleOpeningKeydown;
window.skipToIntro = skipToIntro;
window.setupLoopWithCrossfade = setupLoopWithCrossfade;
window.fadeInSound = fadeInSound;
window.startMemoryRegistration = startMemoryRegistration;

// 감정 앵커 시스템은 /js/shared/math.js로 이동됨

// Store 초기화 (전역 변수를 store로 이동)
let supabaseClient; // Supabase 클라이언트는 store 외부 유지 (lib에서 관리)
let storyData; // storyData는 store 외부 유지 (임시)

const appStore = createStore({
    // 모드/세션
    currentMode: null,
    currentRole: null,
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

    // 정렬도/버킷
    currentAlignment: 0,
    currentBucket: null,
    emotionHistory: [],

    // Live 모드
    liveSceneNum: 1,
    liveFragments: 0,
    liveMatches: 0,

    // 애니메이션 ID
    waveAnimationId: null,
    liveWaveAnimationId: null,

    // 인증
    isLoggedIn: false,
    currentUser: null,

    // 필터/정렬
    currentSort: 'all',
    currentCategory: 'all',

    // 중간 상태
    pendingSceneText: '',
    expPendingEmotion: ''
});
// expInterview.js에서 접근할 수 있도록 window에 노출
window.appStore = appStore;

// AppState와 store 동기화 헬퍼 (하위 호환성 유지)
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
}
const USE_LIVE_INTERPRETATIONS_TABLE = false;

// DOMContentLoaded 시 초기화
// (Moved to bottom)

async function initApp() {
    // memoriesData가 없을 수 있음 (테스트 환경 등)
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

    // ★ OAuth 리다이렉트 감지 (onAuthStateChange 등록 직전에)
    (function checkOAuthRedirect() {
        const hash = window.location.hash || '';
        const params = new URLSearchParams(window.location.search || '');

        // Supabase OAuth: 해시에 access_token/refresh_token, 또는 search에 code 포함
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

            // 이후 오프닝 시퀀스 자동 스킵 (startOpeningSequence에서 참조)
            window.__oauthRedirectSkipOpening = true;

            // URL 해시/쿼리 정리 (토큰 노출 제거)
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname);
            }

            console.log('[Auth] OAuth 리다이렉트 감지 — 오프닝 스킵');
        }
    })();

    // Auth 상태 변경 리스너 등록
    onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            if (session?.user) {
                const user = session.user;
                appStore.setState({
                    isLoggedIn: true,
                    currentUser: {
                        id: user.id,
                        username: user.user_metadata?.username || user.email?.split('@')[0] || '익명',
                        email: user.email,
                        joinDate: new Date(user.created_at).toLocaleDateString('ko-KR'),
                        liveSessions: 0,
                        memories: 0,
                        interpretations: 0,
                        visitedMemories: [],
                        sessionHistory: []
                    }
                });
                syncToAppState();
                console.log('[Auth] 사용자 상태 복원:', user.email);
            }
        } else if (event === 'SIGNED_OUT') {
            appStore.setState({ isLoggedIn: false, currentUser: null });
            syncToAppState();
            console.log('[Auth] 로그아웃 처리됨');
        }
    });

    // 기존 세션 복원 (페이지 새로고침 시)
    try {
        const { data: { session }, error } = await getSession();
        if (session?.user && !error) {
            const user = session.user;
            appStore.setState({
                isLoggedIn: true,
                currentUser: {
                    id: user.id,
                    username: user.user_metadata?.username || user.email?.split('@')[0] || '익명',
                    email: user.email,
                    joinDate: new Date(user.created_at).toLocaleDateString('ko-KR'),
                    liveSessions: 0,
                    memories: 0,
                    interpretations: 0,
                    visitedMemories: [],
                    sessionHistory: []
                }
            });
            syncToAppState();
            console.log('[Auth] 기존 세션 복원:', user.email);
        }
    } catch (e) {
        console.warn('[Auth] 세션 복원 실패 (무시 가능):', e.message);
    }

    // 3D Carousel 초기화
    setTimeout(() => {
        init3DCarousel();
    }, 100);

    // 모든 이벤트 바인딩
    bindEvents({
        store: appStore,
        engine: byeoriEngine,
        ui: uiManager,
        visualizer: visualizer,
        network: networkService,
        realtime: realtimeService,
        flow: null, // TODO: FlowController 구현 필요
        memory: MemoryService,
        ai: AIService
    });
}
function openPortfolio() {
    // Next.js 개발 서버 사용 (포트 3000)
    const portfolioUrl = 'http://localhost:3000';
    const portfolioWindow = window.open(portfolioUrl, '_blank');

    // 서버가 실행 중이 아닐 경우를 대비
    if (portfolioWindow) {
        setTimeout(() => {
            try {
                // 새 창이 여전히 열려있는지 확인
                if (portfolioWindow.closed) {
                    return;
                }
                // 서버가 실행 중인지 확인하기 위해 fetch 시도
                fetch(portfolioUrl)
                    .catch(() => {
                        alert('포트폴리오 서버가 실행 중이 아닙니다.\n\n터미널에서 다음 명령어를 실행해주세요:\n\ncd portfolio-site\nnpm run dev\n\n또는 start-portfolio-server.sh 스크립트를 실행하세요.');
                    });
            } catch (e) {
                // CORS 등의 이유로 실패할 수 있지만 무시
            }
        }, 2000);
    }
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
async function handleLogin() { const email = document.getElementById('loginUsername').value.trim(); const password = document.getElementById('loginPassword').value.trim(); if (!email || !password) { showNotification('이메일과 비밀번호를 입력해주세요'); return } supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase 클라이언트가 초기화되지 않았습니다'); return } const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password }); if (error) { showNotification('로그인 실패: ' + error.message); return } appStore.setState({ isLoggedIn: true, currentUser: { id: data.user.id, username: data.user.user_metadata?.username || email.split('@')[0], email: email, joinDate: new Date(data.user.created_at).toLocaleDateString('ko-KR'), liveSessions: 0, memories: 0, interpretations: 0, visitedMemories: [], sessionHistory: [] } }); const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = ''; showNotification('로그인되었습니다'); if (pendingSaveAction === 'save') { pendingSaveAction = null; setTimeout(() => { saveMemory() }, 300) } else { showMypage() } }
function closeLogin() { const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = ''; pendingSaveAction = null }
function switchToSignup() { const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.remove('active'); loginModal.style.display = 'none' } const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.add('active'); signupModal.style.cssText = 'display:flex !important;z-index:2100 !important' } document.getElementById('signupUsername').focus() }
function switchToLogin() { const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } const loginModal = document.getElementById('loginModal'); if (loginModal) { loginModal.classList.add('active'); loginModal.style.cssText = 'display:flex !important;z-index:2100 !important' } document.getElementById('loginUsername').focus() }
async function handleSignup() { const username = document.getElementById('signupUsername').value.trim(); const email = document.getElementById('signupEmail').value.trim(); const password = document.getElementById('signupPassword').value.trim(); const passwordConfirm = document.getElementById('signupPasswordConfirm').value.trim(); if (!username || !email || !password || !passwordConfirm) { showNotification('모든 항목을 입력해주세요'); return } if (password !== passwordConfirm) { showNotification('비밀번호가 일치하지 않습니다'); return } if (password.length < 6) { showNotification('비밀번호는 최소 6자 이상이어야 합니다'); return } supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase 클라이언트가 초기화되지 않았습니다'); return } const { data, error } = await supabaseClient.auth.signUp({ email: email, password: password, options: { data: { username: username } } }); if (error) { showNotification('회원가입 실패: ' + error.message); return } appStore.setState({ isLoggedIn: true, currentUser: { id: data.user.id, username: username, email: email, joinDate: new Date().toLocaleDateString('ko-KR'), liveSessions: 0, memories: 0, interpretations: 0, visitedMemories: [], sessionHistory: [] } }); const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } document.getElementById('signupUsername').value = ''; document.getElementById('signupEmail').value = ''; document.getElementById('signupPassword').value = ''; document.getElementById('signupPasswordConfirm').value = ''; showNotification('회원가입이 완료되었습니다'); if (pendingSaveAction === 'save') { pendingSaveAction = null; setTimeout(() => { saveMemory() }, 300) } else { showMypage() } }
function closeSignup() { const signupModal = document.getElementById('signupModal'); if (signupModal) { signupModal.classList.remove('active'); signupModal.style.display = 'none' } document.getElementById('signupUsername').value = ''; document.getElementById('signupEmail').value = ''; document.getElementById('signupPassword').value = ''; document.getElementById('signupPasswordConfirm').value = '' }
async function handleSocialLogin(provider) { if (provider === 'google') { supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase 클라이언트가 초기화되지 않았습니다'); return } const { data, error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); if (error) { showNotification('구글 로그인 실패: ' + error.message) } } else { showNotification('준비 중입니다') } }
async function handleLogout() { if (confirm('로그아웃하시겠습니까?')) { supabaseClient = getSupabaseClient(); if (!supabaseClient) { showNotification('Supabase 클라이언트가 초기화되지 않았습니다'); return } await supabaseClient.auth.signOut(); appStore.setState({ isLoggedIn: false, currentUser: null }); closeMypage(); showNotification('로그아웃되었습니다') } }
function updateUserStats(type, value = 1) { const state = appStore.getState(); if (!state.isLoggedIn || !state.currentUser) return; const currentUser = state.currentUser; if (type === 'liveSession') { currentUser.liveSessions = (currentUser.liveSessions || 0) + value } else if (type === 'memory') { if (!currentUser.visitedMemories) currentUser.visitedMemories = []; if (!currentUser.visitedMemories.includes(value)) { currentUser.visitedMemories.push(value); currentUser.memories = (currentUser.memories || 0) + 1 } } else if (type === 'interpretation') { currentUser.interpretations = (currentUser.interpretations || 0) + value } appStore.setState({ currentUser: currentUser }); if (document.getElementById('mypageScreen') && document.getElementById('mypageScreen').classList.contains('active')) { showMypage() } }
function showModeSelection() { const introScreen = document.getElementById('introScreen'); const matchingSelection = document.getElementById('matchingSelection'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } if (matchingSelection) { matchingSelection.classList.add('active'); matchingSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
function selectMatching(type) { if (type === 'session') { const matchingSelection = document.getElementById('matchingSelection'); const modeSelection = document.getElementById('modeSelection'); if (matchingSelection) { matchingSelection.classList.remove('active'); matchingSelection.style.display = 'none' } if (modeSelection) { modeSelection.classList.add('active'); modeSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } } else { showNotification('곧 만나요') } }
function backToMatchingSelection() { const matchingSelection = document.getElementById('matchingSelection'); const modeSelection = document.getElementById('modeSelection'); if (modeSelection) { modeSelection.classList.remove('active'); modeSelection.style.display = 'none' } if (matchingSelection) { matchingSelection.classList.add('active'); matchingSelection.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
function backToIntro() { if (window.soundscape) window.soundscape.stop(); const introScreen = document.getElementById('introScreen'); if (introScreen) { introScreen.classList.remove('hidden'); introScreen.classList.add('visible'); introScreen.style.cssText = 'display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important' } ['matchingSelection', 'modeSelection', 'sessionSetup', 'liveContainer', 'archiveContainer', 'endScreen', 'mypageScreen', 'loginModal', 'signupModal'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); const footer = document.querySelector('.footer'); if (footer) footer.classList.remove('visible'); stopAllAnimations() }
function backToModeSelection() { const sessionSetupEl = document.getElementById('sessionSetup'); if (sessionSetupEl) { sessionSetupEl.classList.remove('active'); sessionSetupEl.style.display = 'none' } const modeSelectionEl = document.getElementById('modeSelection'); if (modeSelectionEl) { modeSelectionEl.classList.add('active'); modeSelectionEl.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } }
async function enterArchive() { const introScreen = document.getElementById('introScreen'); const archiveContainer = document.getElementById('archiveContainer'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } ['modeSelection', 'endScreen', 'liveContainer', 'sceneViewer'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); if (archiveContainer) { archiveContainer.classList.add('active'); archiveContainer.style.cssText = 'display:block !important;z-index:1900 !important' } const memoryListEl = document.getElementById('memoryList'); if (memoryListEl) memoryListEl.style.display = 'grid'; const archiveControlsEl = document.getElementById('archiveControls'); if (archiveControlsEl) archiveControlsEl.style.display = 'flex'; const archiveHeaderEl = document.querySelector('.archive-header'); if (archiveHeaderEl) archiveHeaderEl.style.display = 'block'; appStore.setState({ currentMode: 'archive' }); stopAllAnimations(); await loadMemoriesFromSupabase(); setTimeout(() => showNpcDialogue("여기는 아카이브야. 한 번 상연된 기억 위에, 다른 사람들의 해석이 지층처럼 쌓여 있어.", 5000), 1000); const archiveSearchEl = document.getElementById('archiveSearch'); if (archiveSearchEl) archiveSearchEl.value = ''; const state = appStore.getState(); console.log('[enterArchive] 로드된 메모리 수:', state.allMemoriesData.length); console.log('[enterArchive] 메모리 데이터:', state.allMemoriesData); sortMemories('all'); const footer = document.querySelector('.footer'); if (footer) footer.classList.add('visible') }
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
async function loadMemoriesFromSupabase() { try { console.log('[loadMemoriesFromSupabase] Supabase에서 기억 불러오기 시작'); const result = await networkService.fetchMemories(); console.log('[loadMemoriesFromSupabase] fetchMemories 결과:', result); if (!result.ok) { console.error('[loadMemoriesFromSupabase] 조회 실패', result.error); appStore.setState({ allMemoriesData: [] }); return } if (!result.data || result.data.length === 0) { console.log('[loadMemoriesFromSupabase] Supabase에 공개된 기억이 없습니다'); appStore.setState({ allMemoriesData: [] }); return } console.log(`[loadMemoriesFromSupabase] ${result.data.length}개의 메모리 발견`); console.log('[loadMemoriesFromSupabase] 메모리 데이터 샘플:', result.data[0]); appStore.setState({ allMemoriesData: result.data }); const state = appStore.getState(); console.log(`[loadMemoriesFromSupabase] Supabase에서 ${state.allMemoriesData.length}개의 기억을 로드했습니다`); console.log('[loadMemoriesFromSupabase] State 업데이트 후:', state.allMemoriesData); } catch (error) { console.error('[loadMemoriesFromSupabase] 에러 발생', error); appStore.setState({ allMemoriesData: [] }) } }
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
function selectRole(role) { try { appStore.setState({ currentRole: role, currentMode: 'live' }); const modeSelectionEl = document.getElementById('modeSelection'); if (modeSelectionEl) { modeSelectionEl.classList.remove('active'); modeSelectionEl.style.display = 'none' } const sessionSetupEl = document.getElementById('sessionSetup'); if (sessionSetupEl) { sessionSetupEl.classList.add('active'); sessionSetupEl.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important' } if (role === 'A') { const narratorSetupEl = document.getElementById('narratorSetup'); const experiencerSetupEl = document.getElementById('experiencerSetup'); if (narratorSetupEl) narratorSetupEl.style.display = 'block'; if (experiencerSetupEl) experiencerSetupEl.style.display = 'none'; generateSessionCode() } else { const narratorSetupEl = document.getElementById('narratorSetup'); const experiencerSetupEl = document.getElementById('experiencerSetup'); if (narratorSetupEl) narratorSetupEl.style.display = 'none'; if (experiencerSetupEl) experiencerSetupEl.style.display = 'block' } } catch (e) { console.error('selectRole error:', e); showNotification('역할을 선택하는 중 오류가 발생했습니다') } }
function generateSessionCode() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = ''; for (let i = 0; i < 5; i++)code += chars.charAt(Math.floor(Math.random() * chars.length)); sessionCode = code; document.getElementById('sessionCode').textContent = code; document.getElementById('waitingForB').classList.add('active'); createLiveSession() }
function copySessionCode() { navigator.clipboard.writeText(sessionCode); showNotification('코드가 복사되었습니다') }
function joinSession() { joinLiveSession() }
async function createLiveSession() {
    console.log('=== createLiveSession 시작 ===');
    console.log('sessionCode:', sessionCode);
    const state = appStore.getState();
    console.log('currentRole:', state.currentRole);

    // Supabase 클라이언트 초기화 대기
    let retryCount = 0;
    const maxRetries = 20; // 최대 10초 대기 (20 * 500ms)

    while (retryCount < maxRetries) {
        supabaseClient = getSupabaseClient();
        if (supabaseClient) {
            console.log('Supabase 클라이언트 초기화 완료');
            break;
        }
        console.log(`Supabase 클라이언트 대기 중... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retryCount++;
    }

    if (!supabaseClient) {
        console.error('supabaseClient가 초기화되지 않음 (최대 대기 시간 초과)');
        console.error('window.supabase 존재 여부:', typeof window.supabase !== 'undefined');
        showNotification('Supabase 연결에 실패했습니다. 네트워크 연결을 확인해주세요.');
        return null;
    }

    const roleCheckState = appStore.getState(); if (roleCheckState.currentRole !== 'A') {
        console.warn('화자가 아닙니다');
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
        // 네트워크 연결 확인
        console.log('네트워크 연결 확인 중...');
        try {
            const testResponse = await fetch('https://bxmppaxpzbkwebfbgpsm.supabase.co/rest/v1/', {
                method: 'HEAD',
                mode: 'no-cors' // CORS 오류 무시하고 연결만 확인
            });
            console.log('네트워크 연결 확인 완료');
        } catch (networkError) {
            console.warn('네트워크 연결 확인 실패 (계속 진행):', networkError);
        }

        const sessionData = {
            session_code: sessionCode,
            narrator_id: userId,
            experiencer_id: null,
            alignment: 0
        };

        console.log('세션 데이터 삽입 시도:', sessionData);
        console.log('Supabase URL:', supabaseClient.supabaseUrl);

        const result = await networkService.createSession(sessionData);

        if (!result.ok) {
            console.error('세션 생성 실패:', result.error);
            if (result.error && result.error.message) {
                const errorMsg = result.error.message.includes('Failed to fetch') ||
                    result.error.message.includes('ERR_NAME_NOT_RESOLVED') ||
                    result.error.message.includes('ERR_INTERNET_DISCONNECTED')
                    ? '인터넷 연결을 확인할 수 없습니다.\n\n' +
                    '확인 사항:\n' +
                    '1. 인터넷 연결 상태 확인\n' +
                    '2. 방화벽/프록시 설정 확인\n' +
                    '3. DNS 서버 설정 확인\n' +
                    '4. Supabase 서비스 상태 확인'
                    : '세션 생성에 실패했습니다: ' + result.error.message;
                showNotification(errorMsg);
            } else {
                showNotification('세션 생성에 실패했습니다');
            }
            return null;
        }

        const data = result.data;
        if (!data) {
            console.error('세션이 생성되지 않았습니다 (data가 null)');
            showNotification('세션 생성에 실패했습니다: 데이터가 반환되지 않았습니다');
            return null;
        }

        console.log('Session created successfully:', data);
        console.log('Session ID:', data.id);
        console.log('Session Code:', data.session_code);

        appStore.setState({ currentSessionId: data.id });
        subscribeToSessionJoin();
        subscribeToExperiencerChoices();

        showNotification('세션이 생성되었습니다. 코드: ' + sessionCode);

        return data.id;
    } catch (e) {
        console.error('createLiveSession error:', e);
        console.error('Error details:', JSON.stringify(e, null, 2));
        showNotification('세션 생성에 실패했습니다: ' + (e.message || '알 수 없는 오류'));
        return null;
    }
}
function subscribeToSessionJoin() {
    const state = appStore.getState();
    const sessionId = state.currentSessionId;
    if (!sessionId) {
        console.log('구독 실패: currentSessionId 없음');
        return;
    }
    realtimeService.subscribeToSessionJoin(sessionId, {
        onExperiencerJoin: (sessionData) => {
            console.log('체험자 참여 감지!', sessionData.experiencer_id);
            showNotification('체험자가 참여했습니다!');
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

    // 기존 인터벌이 있으면 정리
    realtimeService.clearInterval('experiencerCheck');

    const intervalId = setInterval(async () => {
        try {
            const currentState = appStore.getState();
            const result = await networkService.getSessionExperiencerId(currentState.currentSessionId);
            if (!result.ok) {
                console.error('세션 조회 오류:', result.error);
                return;
            }
            if (result.data && result.data.experiencer_id) {
                console.log('폴링으로 체험자 참여 감지!', result.data.experiencer_id);
                realtimeService.clearInterval('experiencerCheck');
                showNotification('체험자가 참여했습니다!');
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
        console.log('폴링 종료 (30초 경과)');
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
                        addExpChatMessage('ai', '화자의 기억이 도착했어. ' + emotionCueMsg);
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
    // live_interpretations 테이블이 없으므로 완전히 비활성화
    realtimeService.subscribeToLiveInterpretations();
}
function displayExperiencerEmotionForNarrator(interpretation) { console.log('displayExperiencerEmotionForNarrator 호출:', interpretation); if (!interpretation || !interpretation.emotion_vector) { console.error('해석 데이터 또는 감정 벡터가 없습니다'); return } const emotionVector = interpretation.emotion_vector; console.log('화자 화면에 체험자 감정 표시:', emotionVector); window.experiencerEmotionVector = emotionVector; const experiencerWave = computeWaveFromEmotion({ base: emotionVector }); window.currentExperiencerWave = experiencerWave; updateAlignmentWave(); showNotification('체험자가 감정을 입력했습니다'); console.log('체험자 감정 파동 업데이트 완료') }
function subscribeToExperiencerChoices() {
    const state = appStore.getState();
    const sessionId = state.currentSessionId;
    if (!sessionId) {
        console.error('subscribeToExperiencerChoices: currentSessionId 없음');
        return;
    }

    realtimeService.subscribeToExperiencerChoices(sessionId, {
        onChoiceInsert: (choiceData) => {
            onExperiencerChoiceReceived(choiceData);
        }
    });
}
function onExperiencerChoiceReceived(choice) { console.log('체험자 감정 도착 (choices 테이블):', choice); console.log('emotion_vector:', choice.emotion_vector); if (!choice || !choice.emotion_vector) { console.error('choice 또는 emotion_vector가 없습니다'); return } const emotionVector = choice.emotion_vector; console.log('화자 화면에 체험자 감정 반영 시작:', emotionVector); window.experiencerEmotionVector = emotionVector; const experiencerWave = computeWaveFromEmotion({ base: emotionVector }); window.currentExperiencerWave = experiencerWave; updateAlignmentWave(); if (window.narratorEmotionVector) { const engineResult = byeoriEngine.calculateStep({ userVector: { base: emotionVector }, originalVector: { base: window.narratorEmotionVector } }, {}); const alignment = engineResult.alignment_score; appStore.setState({ currentAlignment: alignment }); updateLiveAlignment(0); console.log('정렬도 계산 완료 (choices):', alignment) } showNotification('체험자가 감정을 입력했습니다 (choices)'); console.log('체험자 감정 파동 업데이트 완료 (choices)') }
function subscribeToScenes() {
    const state = appStore.getState();
    const sessionId = state.currentSessionId;
    if (!sessionId) {
        console.error('subscribeToScenes: currentSessionId 없음');
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
// cosineSimilarity는 /js/shared/math.js에서 import됨
function updateAlignmentDisplay() {
    const state = appStore.getState();
    uiManager.updateAlignmentDisplay(state.currentAlignment);
}
function renderArchiveEmotionWave(emotionVector) {
    if (!emotionVector) return;
    const canvas = document.getElementById('waveCanvas');
    if (!canvas) return;

    // 계산은 여기서 수행 (Visualizer는 숫자만 받음)
    const waveData = computeWaveFromEmotion({ base: emotionVector, intensity: 0.5, confidence: 0.8 });
    const time = Date.now() * 0.001;

    // Visualizer에 계산된 데이터 전달
    visualizer.renderArchiveEmotionWave(canvas, waveData, time);
    console.log('Archive emotion wave rendered:', waveData);
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
        console.log('Archive plays 저장 시도:', insertData);
        // void crack 사운드
        if (mismatchType === 'void_mismatch' && window.soundscape) {
            window.soundscape.onVoidCrack();
        }
        const result = await networkService.savePlay(insertData);
        if (!result.ok) {
            console.error('Archive plays 저장 실패:', result.error);
            return;
        }
        console.log('Archive plays 저장 성공:', result.data);

        // 희석 시스템: play 저장 후 memory의 layers/dilution 업데이트
        try {
            const memId = insertData.memory_id;
            if (memId) {
                const countResult = await networkService.getContaminationLevel(memId);
                const playCount = countResult.ok ? (countResult.data || 0) : 0;
                // dilution = 원본 비중 (100% → 체험자 늘수록 감소)
                // 0명: 100, 10명: ~50, 30명: ~25, 100명: ~9
                const newDilution = Math.round(100 / (1 + playCount * 0.1));
                await networkService.updateMemoryDilution(memId, playCount, newDilution);
                console.log(`[Dilution] memory ${memId}: layers=${playCount}, dilution=${newDilution}%`);
            }
        } catch (dilutionError) {
            console.warn('[Dilution] 업데이트 실패 (치명적 아님):', dilutionError);
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
        console.log('정렬도 계산 완료:', alignment);
        return;
    }
    // live_interpretations 테이블이 없으므로 완전히 비활성화
    return;
}
function updateAlignmentWave() { const canvas = document.getElementById('alignmentWaveCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); if (!window.narratorEmotionVector || !window.experiencerEmotionVector) return; const narratorWave = computeWaveFromEmotion({ base: window.narratorEmotionVector }); const experiencerWave = computeWaveFromEmotion({ base: window.experiencerEmotionVector }); currentNarratorWave = narratorWave; window.currentExperiencerWave = experiencerWave; console.log('파동 업데이트:', { narrator: narratorWave, experiencer: experiencerWave }) }
async function joinLiveSession() {
    console.log('=== joinLiveSession 시작 ===');

    // Supabase 클라이언트 초기화 대기
    let retryCount = 0;
    const maxRetries = 20; // 최대 10초 대기 (20 * 500ms)

    while (retryCount < maxRetries) {
        supabaseClient = getSupabaseClient();
        if (supabaseClient) {
            console.log('Supabase 클라이언트 초기화 완료');
            break;
        }
        console.log(`Supabase 클라이언트 대기 중... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retryCount++;
    }

    if (!supabaseClient) {
        console.error('Supabase 클라이언트가 초기화되지 않음 (최대 대기 시간 초과)');
        console.error('window.supabase 존재 여부:', typeof window.supabase !== 'undefined');
        showNotification('Supabase 연결에 실패했습니다. 네트워크 연결을 확인해주세요.');
        return;
    }

    const code = document.getElementById('sessionCodeInput').value.trim().toUpperCase();
    console.log('입력된 코드:', code);

    if (!code || code.length !== 5) {
        console.warn('코드 형식 오류:', code);
        showNotification('올바른 코드를 입력하세요 (5자리)');
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
        console.log('세션 검색 시작, 코드:', code);
        console.log('Supabase URL:', supabaseClient.supabaseUrl);

        const findResult = await networkService.findSessionsByCode(code);

        if (!findResult.ok) {
            console.error('joinLiveSession query error:', findResult.error);
            showNotification('세션을 찾을 수 없습니다. 코드를 확인해주세요.');
            return;
        }

        const sessions = findResult.data || [];
        console.log('검색된 세션들:', sessions);
        console.log('검색된 세션 수:', sessions.length);

        if (sessions.length === 0) {
            console.warn('세션을 찾을 수 없음 - 코드:', code);
            showNotification('세션을 찾을 수 없습니다. 코드를 확인해주세요.');
            return;
        }

        // 클라이언트 측에서 필터링
        const session = sessions.find(s =>
            s.session_code === code &&
            !s.experiencer_id &&
            !s.ended_at
        );

        console.log('필터링된 세션:', session);

        if (!session) {
            console.warn('접속 가능한 세션 없음');
            console.log('세션 상태:', sessions.map(s => ({
                code: s.session_code,
                has_experiencer: !!s.experiencer_id,
                ended: !!s.ended_at
            })));
            showNotification('접속 가능한 세션이 없습니다. 이미 참여자가 있거나 종료된 세션일 수 있습니다.');
            return;
        }

        console.log('세션 참여 시도, 세션 ID:', session.id);

        const joinResult = await networkService.joinSession(session.id, userId);

        if (!joinResult.ok) {
            console.error('참여 실패:', joinResult.error);
            showNotification('세션 참여에 실패했습니다: ' + (joinResult.error?.message || '알 수 없는 오류'));
            return;
        }

        console.log('세션 참여 성공:', joinResult.data);

        sessionCode = code;
        appStore.setState({ currentSessionId: session.id });

        showNotification('세션에 접속했습니다!');
        subscribeToNarratorEmotion();
        setTimeout(() => startLiveSession(), 500);
    } catch (e) {
        console.error('joinLiveSession error:', e);
        console.error('Error stack:', e.stack);
        showNotification('세션 참여 중 오류가 발생했습니다: ' + (e.message || '알 수 없는 오류'));
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
        console.log('정렬도 계산 불가: 감정 벡터 없음', { narrator: !!window.narratorEmotionVector, experiencer: !!window.experiencerEmotionVector });
        return;
    }

    // 계산은 엔진에서 수행
    const engineResult = byeoriEngine.calculateStep({
        userVector: { base: window.experiencerEmotionVector },
        originalVector: { base: window.narratorEmotionVector }
    }, {});
    const alignment = engineResult.alignment_score;
    appStore.setState({ currentAlignment: alignment });

    // UI 업데이트는 UIManager에 위임
    uiManager.updateExperiencerAlignmentDisplay(alignment);
    updateAlignmentWave();
    console.log('체험자 화면 정렬도 업데이트:', alignment);
}
async function saveLiveScene(sceneData) { console.log('=== saveLiveScene 호출 ==='); console.log('sceneData:', JSON.stringify(sceneData)); const state = appStore.getState(); console.log('currentSessionId:', state.currentSessionId); console.log('liveSceneNum:', state.liveSceneNum); console.log('currentGeneratedScene:', currentGeneratedScene); if (!state.currentSessionId) { console.error('currentSessionId가 없습니다!'); showNotification('세션이 없습니다'); return } const sceneText = sceneData.text || currentGeneratedScene || state.pendingSceneText || ''; if (!sceneText || sceneText === '(장면 없음)') { console.error('장면 텍스트가 없습니다!'); showNotification('저장할 장면이 없습니다'); return } const insertData = { session_id: state.currentSessionId, scene_index: state.liveSceneNum, scene_text: sceneText, emotion_raw: sceneData.emotionRaw || '', reason_raw: sceneData.reasonRaw || '', generated_emotion: sceneData.generatedEmotion || '', emotion_vector: sceneData.emotionAnalysis?.base || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, intensity: sceneData.emotionAnalysis?.intensity || 0.5, confidence: sceneData.emotionAnalysis?.confidence || 0.5, void_scene: sceneData.voidInfo?.sceneVoid || false, void_emotion: sceneData.voidInfo?.emotionVoid || false, void_reason: sceneData.voidInfo?.reasonVoid || false }; console.log('insertData:', JSON.stringify(insertData)); try { const result = await networkService.saveLiveScene(insertData); if (!result.ok) { console.error('live_scenes INSERT error:', result.error); throw result.error } console.log('live_scenes 저장 성공:', result.data); await saveSceneToLiveSession({ text: sceneText, emotion_vector: sceneData.emotionAnalysis?.base || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 } }); showNotification('장면이 체험자에게 전송되었습니다') } catch (e) { console.error('saveLiveScene error:', e); showNotification('장면 저장 실패: ' + e.message) } }
async function saveSceneToLiveSession(sceneData) { console.log('=== saveSceneToLiveSession 호출 ==='); console.log('sceneData:', JSON.stringify(sceneData)); const state = appStore.getState(); console.log('currentSessionId:', state.currentSessionId); console.log('currentSceneOrder:', state.currentSceneOrder); if (!state.currentSessionId) { console.error('currentSessionId가 없습니다!'); showNotification('세션이 없습니다'); return } const sceneText = sceneData.text || ''; if (!sceneText) { console.error('장면 텍스트가 없습니다!'); showNotification('저장할 장면이 없습니다'); return } try { const insertData = { live_session_id: state.currentSessionId, scene_order: state.currentSceneOrder, text: sceneText, emotion_vector: sceneData.emotion_vector || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, created_at: new Date().toISOString() }; console.log('scenes INSERT 데이터:', JSON.stringify(insertData)); const result = await networkService.saveScene(insertData); if (!result.ok) { console.error('scenes INSERT error:', result.error); throw result.error } console.log('scenes 저장 완료:', result.data); appStore.setState({ currentSceneOrder: state.currentSceneOrder + 1 }); showNotification('장면이 scenes 테이블에 저장되었습니다') } catch (e) { console.error('saveSceneToLiveSession error:', e); showNotification('scenes 테이블 저장 실패: ' + e.message) } }
async function endLiveSession() { const state = appStore.getState(); if (!state.currentSessionId) return; try { const result = await networkService.endSession(state.currentSessionId, state.currentAlignment); if (!result.ok) { console.error('endLiveSession error:', result.error); return } console.log('Session ended') } catch (e) { console.error('endLiveSession error:', e) } }
async function startLiveSession() { try { const state = appStore.getState(); if (!state.currentSessionId && state.currentRole === 'B') { console.warn('체험자 세션 ID가 없습니다'); return } let sessionId = state.currentSessionId; if (!sessionId && state.currentRole === 'A') { sessionId = await createLiveSession(); if (!sessionId) { console.warn('세션 생성 실패, 계속 진행합니다') } else { appStore.setState({ currentSessionId: sessionId }) } } subscribeToLiveScenes(); subscribeToScenes(); appStore.setState({ currentSceneOrder: 1, currentScene: 0, userChoices: [], userReasons: [], currentAlignment: 0, pendingSceneText: '', expPendingEmotion: '' }); window.currentStoryData = storyData; conversationHistory = []; currentGeneratedSceneObj = null; currentGeneratedEmotion = null; currentPhase = 'scene'; pendingEmotionText = ''; currentGeneratedScene = ''; finalSceneObject = null; isEditMode = false; const sceneContent = document.querySelector('#generatedSceneContent .generated-text'); if (sceneContent) sceneContent.textContent = ''; const emotionContent = document.querySelector('#generatedEmotionContent .generated-text'); if (emotionContent) emotionContent.textContent = ''; const chatMessages = document.getElementById('chatMessages'); if (chatMessages) { chatMessages.innerHTML = '<div class="chat-message ai"><div class="chat-message-label">또다른 나</div><div class="chat-message-content">기억을 이야기해줘. 천천히, 편하게.</div></div>' } const editBtn = document.querySelector('.edit-toggle-btn'); if (editBtn) { editBtn.textContent = '수정'; editBtn.classList.remove('active') } const sceneTextarea = document.getElementById('editSceneTextarea'); if (sceneTextarea) { sceneTextarea.style.display = 'none'; sceneTextarea.value = '' } const emotionTextarea = document.getElementById('editEmotionTextarea'); if (emotionTextarea) { emotionTextarea.style.display = 'none'; emotionTextarea.value = '' } const sceneTextEl = document.querySelector('#generatedSceneContent .generated-text'); if (sceneTextEl) sceneTextEl.style.display = 'block'; switchGeneratedTab('scene'); updateUserStats('liveSession', 1); const sessionSetupEl = document.getElementById('sessionSetup'); if (sessionSetupEl) { sessionSetupEl.classList.remove('active'); sessionSetupEl.style.display = 'none' } const liveContainerEl = document.getElementById('liveContainer'); if (liveContainerEl) { liveContainerEl.classList.add('active'); liveContainerEl.style.cssText = 'display:block !important' } const liveContentEl = document.querySelector('.live-content'); const roleState = appStore.getState(); if (liveContentEl) { if (roleState.currentRole === 'A') { liveContentEl.classList.add('narrator-mode') } else { liveContentEl.classList.remove('narrator-mode') } }; const narratorLastChoiceSection = document.getElementById('narratorLastChoiceSection'); if (narratorLastChoiceSection) narratorLastChoiceSection.style.display = 'none'; const liveProgressSection = document.getElementById('liveProgressSection'); if (liveProgressSection) liveProgressSection.style.display = roleState.currentRole === 'A' ? 'block' : 'none'; const traceLabel = document.getElementById('traceLabel'); if (traceLabel) traceLabel.textContent = roleState.currentRole === 'A' ? '해석의 흔적' : '기억의 흔적'; if (roleState.currentRole === 'A') { const narratorPanelEl = document.getElementById('narratorPanel'); if (narratorPanelEl) narratorPanelEl.classList.add('active'); const interpretationTrace = document.getElementById('interpretationTrace'); const traceContent = document.getElementById('traceContent'); if (interpretationTrace && traceContent) { interpretationTrace.style.display = 'block'; traceContent.textContent = '체험자가 장면을 기다리고있습니다...' } showNpcDialogue("당신의 기억을 불러오세요. 지금 입력하는 장면이 이 기억의 원본 음각이 됩니다.", 4000) } else { const experiencerPanelEl = document.getElementById('experiencerPanel'); if (experiencerPanelEl) { experiencerPanelEl.classList.add('active'); expCurrentPhase = 'waiting'; appStore.setState({ expPendingEmotion: '' }); expGeneratedEmotion = ''; expFinalObject = null; const expSceneText = document.getElementById('expSceneText'); if (expSceneText) expSceneText.innerHTML = '화자가 기억을 불러오고 있습니다<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>'; const expEmotionText = document.getElementById('expEmotionText'); if (expEmotionText) expEmotionText.textContent = ''; const sceneDisplay = document.getElementById('expGeneratedSceneContent'); if (sceneDisplay) sceneDisplay.style.display = 'block'; const emotionDisplay = document.getElementById('expGeneratedEmotionContent'); if (emotionDisplay) emotionDisplay.style.display = 'none'; showNpcDialogue("곧 누군가의 원본 기억이 열릴 거야. 그 안에서 네 감정을 솔직하게 남겨줘.", 4000) } else { showNotification('체험자 패널을 찾을 수 없습니다') } } startAlignmentWaveAnimation(); setTimeout(() => { startVoiceWaveLiveAnimation() }, 300); const footer = document.querySelector('.footer'); if (footer) footer.classList.add('visible') } catch (e) { console.error('startLiveSession error:', e); showNotification('세션을 시작하는 중 오류가 발생했습니다: ' + e.message) } }
async function sendNarratorInput() { console.log('sendNarratorInput called'); const input = document.getElementById('narratorInput'); if (!input || !input.value.trim()) { showNotification('기억을 입력해주세요'); return } const inputText = input.value.trim(); const sendBtn = document.querySelector('.narrator-send-btn'); if (sendBtn) sendBtn.disabled = true; if (sendBtn) sendBtn.textContent = 'AI가 장면을 변환 중...'; showNotification('AI가 장면을 변환하고 있습니다...'); try { const convertedScene = await generateSceneAI(inputText); const liveSceneContent = document.getElementById('liveSceneContent'); if (liveSceneContent) { liveSceneContent.textContent = convertedScene } const experiencerPanel = document.getElementById('experiencerPanel'); if (experiencerPanel) { experiencerPanel.classList.add('active') } const traceContent = document.getElementById('traceContent'); if (traceContent) { traceContent.textContent = '장면이 체험자에게 전송되었습니다' } showNotification('장면이 체험자에게 전송되었습니다'); input.value = ''; const reasonInput = document.getElementById('narratorReason'); if (reasonInput) reasonInput.value = ''; updateLiveAlignment(0.15); liveSceneNum++; const liveSceneNumEl = document.getElementById('liveSceneNum'); if (liveSceneNumEl) liveSceneNumEl.textContent = liveSceneNum } catch (error) { console.error('sendNarratorInput error:', error); showNotification('장면 변환 중 오류가 발생했습니다: ' + error.message); const liveSceneContent = document.getElementById('liveSceneContent'); if (liveSceneContent) { liveSceneContent.textContent = inputText } } finally { if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '전송' } } }
let inputPhase = 'scene'; let currentSceneText = ''; let isVoiceMode = false;
async function handleUnifiedSubmit(providedText) { console.log('handleUnifiedSubmit called'); console.log('=== handleUnifiedSubmit ==='); console.log('currentPhase:', currentPhase); let inputText = ''; if (providedText) { inputText = providedText.trim() } else { const input = document.getElementById('unifiedInput'); if (!input || !input.value.trim()) { showNotification('입력을 입력해주세요'); return } inputText = input.value.trim(); input.value = '' } console.log('inputText:', inputText); if (currentPhase === 'scene') { appStore.setState({ pendingSceneText: inputText }); addChatMessage('user', inputText); try { const aiScene = await generateSceneAI(inputText); currentGeneratedScene = aiScene; console.log('currentGeneratedScene (after AI):', currentGeneratedScene); const sceneContent = document.querySelector('#generatedSceneContent .generated-text'); if (sceneContent) sceneContent.textContent = aiScene; switchGeneratedTab('scene'); addChatMessageWithConfirm('ai', '이 기억이 맞아?'); } catch (error) { console.error('generateSceneAI error:', error); showNotification('장면 생성 중 오류가 발생했습니다'); currentGeneratedScene = inputText; const sceneContent = document.querySelector('#generatedSceneContent .generated-text'); if (sceneContent) sceneContent.textContent = inputText; switchGeneratedTab('scene'); addChatMessageWithConfirm('ai', '이 기억이 맞아?') } return } if (currentPhase === 'emotion') { console.log('=== EMOTION PHASE ==='); console.log('inputText:', inputText); addChatMessage('user', inputText); let emotionResult = null; try { showNotification('AI가 감정을 분석하고 변환하고 있습니다...'); emotionResult = await analyzeEmotionWithVector(inputText, ''); console.log('emotionResult (raw):', JSON.stringify(emotionResult)) } catch (e) { console.error('Emotion analysis failed:', e); showNotification('감정 분석 실패: ' + e.message) } if (!emotionResult || !emotionResult.generatedEmotion || emotionResult.generatedEmotion === inputText) { console.warn('AI 감정 변환 실패, 원본 텍스트 사용'); emotionResult = { generatedEmotion: inputText, analysis: emotionResult?.analysis || { base: { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, detailed: [], intensity: 0.5, confidence: 0.3 } } } console.log('최종 emotionResult:', emotionResult); const emotionContent = document.querySelector('#generatedEmotionContent .generated-text'); if (emotionContent) { emotionContent.textContent = emotionResult.generatedEmotion; console.log('생성된 감정 표시:', emotionResult.generatedEmotion) } switchGeneratedTab('emotion'); const parsed = parseEmotionInput(inputText); const currentState = appStore.getState(); const sceneText = currentGeneratedScene || currentState.pendingSceneText || ''; console.log('sceneText for finalSceneObject:', sceneText); console.log('currentGeneratedScene:', currentGeneratedScene); console.log('pendingSceneText:', currentState.pendingSceneText); const voidInfo = { sceneVoid: !sceneText || sceneText.includes('기억 안 나'), emotionVoid: !parsed.emotion, reasonVoid: !parsed.reason }; finalSceneObject = { text: sceneText, emotionRaw: parsed.emotion || inputText, reasonRaw: parsed.reason || '', generatedEmotion: emotionResult.generatedEmotion, emotionAnalysis: emotionResult.analysis, voidInfo: voidInfo }; console.log('finalSceneObject 생성:', JSON.stringify(finalSceneObject)); addChatMessageWithConfirm('ai', '이 감정이 맞아?'); return } }
let recognition = null; let audioContext = null; let analyser = null; let microphone = null; let voiceAnimationId = null; let recognizedText = '';
const SUPABASE_FUNCTION_URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co/functions/v1/claude-scene';
async function generateSceneAI(inputText) { try { const response = await fetch(SUPABASE_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ text: inputText }) }); if (!response.ok) { const error = await response.json(); throw new Error(error.error || error.details || 'API 호출 실패') } const data = await response.json(); console.log('generateSceneAI response:', data); if (data.scene) { window.lastSceneData = { scene: data.scene, voidHint: data.voidHint || '', emotionCue: data.emotionCue || '' }; return data.scene } else { throw new Error(data.error || '장면 변환 실패') } } catch (error) { console.error('generateSceneAI error:', error); throw error } }
async function analyzeEmotionWithVector(emotionText, reasonText, anchorEmotions = null) { console.log('analyzeEmotionWithVector 호출:', { emotionText, reasonText, anchorEmotions }); try { const requestBody = { type: 'emotion_analysis', emotion: emotionText || '', reason: reasonText || '', anchorEmotions: anchorEmotions || [] }; console.log('API 요청 body:', JSON.stringify(requestBody)); const response = await fetch(`${SUPABASE_URL}/functions/v1/claude-scene`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY }, body: JSON.stringify(requestBody) }); console.log('API 응답 status:', response.status); if (!response.ok) { const errorText = await response.text(); console.error('API 오류 응답:', errorText); throw new Error('API 호출 실패: ' + response.status) } const data = await response.json(); console.log('API 응답 data:', JSON.stringify(data)); if (!data.generatedEmotion) { console.warn('generatedEmotion이 응답에 없음') } return data } catch (error) { console.error('analyzeEmotionWithVector error:', error); return { generatedEmotion: null, analysis: { base: { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, detailed: [], intensity: 0.5, confidence: 0.3 } } } }
function startVoiceMode() { document.getElementById('voiceStartPrompt').style.display = 'none'; document.getElementById('textInputContainer').style.display = 'none'; document.getElementById('voiceWaveContainer').style.display = 'flex'; isVoiceMode = true; startSpeechRecognition(); startVoiceVisualization() }
function switchToTextMode() { if (recognition) { recognition.stop() } stopVoiceVisualization(); document.getElementById('voiceStartPrompt').style.display = 'none'; document.getElementById('voiceWaveContainer').style.display = 'none'; document.getElementById('textInputContainer').style.display = 'block'; isVoiceMode = false; if (recognizedText) { document.getElementById('sceneTextInput').value = recognizedText } }
function startSpeechRecognition() { if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { showNotification('이 브라우저는 음성 인식을 지원하지 않습니다'); switchToTextMode(); return } const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; recognition = new SpeechRecognition(); recognition.lang = 'ko-KR'; recognition.continuous = true; recognition.interimResults = true; recognition.onresult = function (event) { let interim = ''; let final = ''; for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) { final += event.results[i][0].transcript } else { interim += event.results[i][0].transcript } } if (final) { recognizedText += final + ' ' } }; recognition.onerror = function (event) { console.error('Speech recognition error:', event.error); if (event.error === 'not-allowed') { showNotification('마이크 권한이 필요합니다') } }; recognition.onend = function () { if (isVoiceMode) { recognition.start() } }; recognition.start(); showNotification('음성 인식이 시작되었습니다') }
function startVoiceVisualization() { navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) { audioContext = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioContext.createAnalyser(); microphone = audioContext.createMediaStreamSource(stream); microphone.connect(analyser); analyser.fftSize = 256; const bufferLength = analyser.frequencyBinCount; const dataArray = new Uint8Array(bufferLength); const canvas = document.getElementById('voiceWaveCanvas'); const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; function draw() { voiceAnimationId = requestAnimationFrame(draw); analyser.getByteFrequencyData(dataArray); ctx.fillStyle = 'rgba(18,18,26,0.3)'; ctx.fillRect(0, 0, canvas.width, canvas.height); const barWidth = (canvas.width / bufferLength) * 2.5; let x = 0; for (let i = 0; i < bufferLength; i++) { const barHeight = (dataArray[i] / 255) * canvas.height * 0.8; const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height); gradient.addColorStop(0, 'rgba(196,168,130,0.8)'); gradient.addColorStop(1, 'rgba(196,168,130,0.4)'); ctx.fillStyle = gradient; ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight); x += barWidth } } draw() }).catch(function (err) { console.error('Microphone access denied:', err); showNotification('마이크 접근이 거부되었습니다') }) }
function stopVoiceVisualization() { if (voiceAnimationId) { cancelAnimationFrame(voiceAnimationId) } if (audioContext) { audioContext.close() } audioContext = null; analyser = null; microphone = null }
async function submitScene() { console.log('submitScene called'); const input = document.getElementById('sceneTextInput'); const submitBtn = document.querySelector('.scene-submit-btn'); if (!input.value.trim()) { showNotification('장면을 입력해주세요'); return } currentSceneText = input.value.trim(); submitBtn.disabled = true; submitBtn.textContent = 'AI가 장면을 변환 중...'; try { const aiScene = await generateSceneAI(currentSceneText); const liveSceneContent = document.getElementById('liveSceneContent'); if (liveSceneContent) { liveSceneContent.textContent = aiScene } const traceContent = document.getElementById('traceContent'); if (traceContent) { traceContent.textContent = '장면이 체험자에게 전송되었습니다' } showNotification('AI가 장면을 변환하여 전송했습니다') } catch (err) { console.error('AI scene generation error:', err); showNotification('장면 변환 중 오류가 발생했습니다'); const traceContent = document.getElementById('traceContent'); if (traceContent) { traceContent.textContent = currentSceneText } } input.value = ''; currentSceneText = ''; recognizedText = ''; submitBtn.disabled = false; submitBtn.textContent = '제출'; const voiceStartPrompt = document.getElementById('voiceStartPrompt'); if (voiceStartPrompt) voiceStartPrompt.style.display = 'flex'; const textInputContainer = document.getElementById('textInputContainer'); if (textInputContainer) textInputContainer.style.display = 'none'; updateLiveAlignment(0.15) }
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
                showNotification('장면 데이터를 불러올 수 없습니다');
                return;
            }
            const scene = currentData.scenes[currentScene];
            if (!scene || !scene.text) {
                showNotification('장면 텍스트를 불러올 수 없습니다');
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
        addExpChatMessage('ai', '화자의 기억이 도착했어. ' + emotionCueMsg);
        const expTextInput = document.getElementById('expTextInput');
        if (expTextInput) {
            expTextInput.value = '';
            expTextInput.focus();
        }
    } catch (e) {
        console.error('simulateNarratorInput error:', e);
        showNotification('장면을 불러오는 중 오류가 발생했습니다');
    }
}
function renderLiveEchoLayer(words) { const layer = document.getElementById('liveEchoLayer'); if (!layer) return; layer.innerHTML = ''; if (!words || !Array.isArray(words)) return; words.forEach(word => { const span = document.createElement('span'); span.className = 'echo-word'; span.textContent = word; span.style.top = (20 + Math.random() * 60) + '%'; span.style.left = (10 + Math.random() * 80) + '%'; layer.appendChild(span) }) }
function makeLiveChoice(choiceIndex) { try { const state = appStore.getState(); appStore.setState({ userChoices: [...state.userChoices, choiceIndex] }); const currentData = window.currentStoryData || storyData; const updatedState = appStore.getState(); if (!currentData || !currentData.scenes || !currentData.scenes[updatedState.currentScene]) { showNotification('장면 데이터를 불러올 수 없습니다'); return } const scene = currentData.scenes[updatedState.currentScene]; if (choiceIndex === scene.originalChoice) { appStore.setState({ liveMatches: updatedState.liveMatches + 1 }); const matchesEl = document.getElementById('liveMatches'); if (matchesEl) matchesEl.textContent = updatedState.liveMatches + 1 } appStore.setState({ liveFragments: updatedState.liveFragments + 1 }); const fragmentsEl = document.getElementById('liveFragments'); if (fragmentsEl) fragmentsEl.textContent = updatedState.liveFragments + 1; const sceneType = scene.sceneType || 'normal'; if (sceneType === 'branch' || sceneType === 'ending') { const questionEl = document.getElementById('emotionQuestion'); if (questionEl) questionEl.textContent = updatedState.currentScene === 0 ? "왜 그렇게 했어?" : "지금 어떤 감정이 들어?"; const modalEl = document.getElementById('emotionModal'); if (modalEl) modalEl.classList.add('active'); const inputEl = document.getElementById('emotionInputField'); if (inputEl) inputEl.focus() } else { proceedToNextSceneLive() } } catch (e) { console.error('makeLiveChoice error:', e); showNotification('오류가 발생했습니다') } }
function submitExperiencerFeeling() { try { const feelingInput = document.getElementById('experiencerFeelingInput'); if (!feelingInput) { showNotification('입력 필드를 찾을 수 없습니다'); return } const feeling = feelingInput.value.trim(); if (!feeling) { showNotification('화자가 어떻게 느꼈을지 적어주세요'); return } const state = appStore.getState(); appStore.setState({ userReasons: [...state.userReasons, feeling], liveFragments: state.liveFragments + 1 }); const updatedState = appStore.getState(); const fragmentsEl = document.getElementById('liveFragments'); if (fragmentsEl) fragmentsEl.textContent = updatedState.liveFragments; updateLiveAlignment(0.1 + Math.random() * 0.15); showNotification('감정이 기록되었습니다'); feelingInput.value = ''; setTimeout(() => { proceedToNextSceneLive() }, 1000) } catch (e) { console.error('submitExperiencerFeeling error:', e); showNotification('오류가 발생했습니다') } }
function updateLiveAlignment(delta) { const state = appStore.getState(); const newAlignment = Math.min(1, state.currentAlignment + delta); appStore.setState({ currentAlignment: newAlignment }); const updatedState = appStore.getState(); const liveAlignmentValue = document.getElementById('liveAlignmentValue'); if (liveAlignmentValue) { liveAlignmentValue.textContent = updatedState.currentAlignment.toFixed(2); if (updatedState.currentAlignment >= 0.8) liveAlignmentValue.classList.add('high') } const liveAlignmentFill = document.getElementById('liveAlignmentFill'); if (liveAlignmentFill) liveAlignmentFill.style.width = (updatedState.currentAlignment * 100) + '%'; const alignmentPercentage = document.getElementById('alignmentPercentage'); if (alignmentPercentage) alignmentPercentage.textContent = String(Math.round(updatedState.currentAlignment * 100)).padStart(2, '0') + '%'; const expAlignmentPercentage = document.getElementById('expAlignmentPercentage'); if (expAlignmentPercentage) expAlignmentPercentage.textContent = String(Math.round(updatedState.currentAlignment * 100)).padStart(2, '0') + '%' }
let currentNarratorWave = null;
// alignmentWaveTime, alignmentMouseX, alignmentMouseY, alignmentIsMouseDown는 Visualizer 내부에서 관리됨
function lerp(a, b, t) { return a + (b - a) * t }
function lerpColor(a, b, t) { return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) } }
function noise(x, y, z) { const n = Math.sin(x * 12.9898 + y * 78.233 + (z || 0) * 37.719) * 43758.5453; return n - Math.floor(n) }
function emotionVectorToWaveStyle(emotionVector) { if (!emotionVector) return { color: { r: 100, g: 140, b: 180 }, speed: 0.3, amplitude: 30, frequency: 0.008, chaos: 0.1, lineCount: 8, trailOpacity: 0.15 }; const intensity = Object.values(emotionVector).reduce((a, b) => a + b, 0) / 6; const dominant = Object.entries(emotionVector).sort((a, b) => b[1] - a[1])[0]; const colors = { fear: { r: 100, g: 80, b: 180 }, sadness: { r: 80, g: 100, b: 160 }, anger: { r: 200, g: 80, b: 80 }, joy: { r: 200, g: 180, b: 100 }, longing: { r: 80, g: 180, b: 180 }, guilt: { r: 150, g: 130, b: 100 } }; const baseColor = colors[dominant[0]] || colors.sadness; return { color: baseColor, speed: 0.3 + intensity * 0.9, amplitude: 30 + intensity * 50, frequency: 0.008 + intensity * 0.012, chaos: 0.1 + intensity * 0.7, lineCount: Math.max(4, Math.min(20, 6 + Math.floor(intensity * 14))), trailOpacity: 0.15 - intensity * 0.07 } }
function getDominantEmotionColor(base) { const entries = Object.entries(base || {}); if (entries.length === 0) return 'rgba(196,168,130,'; const dominant = entries.sort((a, b) => b[1] - a[1])[0]; const colorMap = { fear: 'rgba(100,80,180,', sadness: 'rgba(70,130,200,', anger: 'rgba(200,80,80,', joy: 'rgba(220,180,60,', longing: 'rgba(80,180,180,', guilt: 'rgba(150,130,100,' }; return colorMap[dominant[0]] || 'rgba(196,168,130,' }
function getEmotionComplexity(base) { if (!base) return 1; return Object.values(base).filter(v => v >= 0.2).length || 1 }
function computeWaveFromEmotion(emotionAnalysis) { if (!emotionAnalysis) { return { amplitude: 0.5, frequency: 0.015, color: 'rgba(196,168,130,' } } return { amplitude: emotionAnalysis.intensity || 0.5, frequency: 0.01 + getEmotionComplexity(emotionAnalysis.base) * 0.005, color: getDominantEmotionColor(emotionAnalysis.base) } }
function updateNarratorWave(emotionAnalysis) { currentNarratorWave = computeWaveFromEmotion(emotionAnalysis); console.log('화자 파동 업데이트:', currentNarratorWave) }
function stopAllLiveSubscriptions() {
    realtimeService.cleanup();
}
async function exitLive() { if (confirm('세션을 종료하시겠습니까?')) { const state = appStore.getState(); const wasRoleA = state.currentRole === 'A'; const wasFirstScene = state.liveSceneNum === 1; stopAllLiveSubscriptions(); stopAllAnimations(); await endLiveSession(); const liveContainerEl = document.getElementById('liveContainer'); if (liveContainerEl) { liveContainerEl.classList.remove('active'); liveContainerEl.style.display = 'none' } appStore.setState({ currentSessionId: null, currentRole: null, sessionCode: null }); if (wasRoleA && wasFirstScene) { restart() } else { showEndScreen() } } }
function switchGeneratedTab(tab) { document.querySelectorAll('.generated-tab').forEach(t => t.classList.remove('active')); document.querySelectorAll('.generated-tab-content').forEach(c => c.style.display = 'none'); if (tab === 'scene') { document.querySelectorAll('.generated-tab')[0].classList.add('active'); document.getElementById('generatedSceneContent').style.display = 'block' } else if (tab === 'emotion') { document.querySelectorAll('.generated-tab')[1].classList.add('active'); document.getElementById('generatedEmotionContent').style.display = 'block' } }
let expCurrentPhase = 'waiting'; let expGeneratedEmotion = ''; let expFinalObject = null; let expConversationHistory = [];
function switchExpGeneratedTab(tab) { const sceneDisplay = document.getElementById('expGeneratedSceneContent'); const emotionDisplay = document.getElementById('expGeneratedEmotionContent'); if (tab === 'scene') { if (sceneDisplay) sceneDisplay.style.display = 'block'; if (emotionDisplay) emotionDisplay.style.display = 'none' } else if (tab === 'emotion') { if (sceneDisplay) sceneDisplay.style.display = 'none'; if (emotionDisplay) emotionDisplay.style.display = 'block' } }
function addExpChatMessage(role, content) { const messagesContainer = document.getElementById('expChatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = 'chat-message ' + role; const label = role === 'user' ? '나' : '또다른 나'; messageDiv.innerHTML = '<div class="chat-message-label">' + label + '</div><div class="chat-message-content">' + content.replace(/\n/g, '<br>') + '</div>'; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }
function addExpChatMessageWithConfirm(role, content) { const messagesContainer = document.getElementById('expChatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = 'chat-message ' + role; const label = role === 'user' ? '나' : '또다른 나'; messageDiv.innerHTML = '<div class="chat-message-label">' + label + '</div><div class="chat-message-content">' + content.replace(/\n/g, '<br>') + '</div><div class="confirm-buttons"><button class="confirm-btn yes" onclick="handleExpConfirm(\'yes\')">예</button><button class="confirm-btn no" onclick="handleExpConfirm(\'no\')">아니오</button></div>'; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }
function removeExpConfirmButtons() { const panel = document.getElementById('experiencerPanel'); if (!panel) return; const buttons = panel.querySelectorAll('.confirm-buttons'); buttons.forEach(btn => btn.remove()) }
// ───── sendExpChatMessage / sendChatMessage 리팩토링: 하위 함수들 ─────

/**
 * 메시지 입력 수집 및 검증
 * @param {string} inputId - 입력 필드 ID
 * @returns {string|null} 사용자 메시지 또는 null (실패 시)
 */
function collectChatMessage(inputId) {
    const input = document.getElementById(inputId);
    if (!input || !input.value.trim()) {
        showNotification('메시지를 입력해주세요');
        return null;
    }
    const userMessage = input.value.trim();
    input.value = '';
    return userMessage;
}

/**
 * UI에 메시지 반영 (체험자용)
 * @param {string} userMessage - 사용자 메시지
 */
function reflectExpChatMessageUI(userMessage) {
    addExpChatMessage('user', userMessage);
}

/**
 * UI에 메시지 반영 (화자용)
 * @param {string} userMessage - 사용자 메시지
 */
function reflectChatMessageUI(userMessage) {
    addChatMessage('user', userMessage);
    conversationHistory.push({ role: 'user', content: userMessage });
}

// callAI, validateEmotionAnalysisResult, validateSceneGenerationResult는 AIService로 이동됨

/**
 * 감정 분석 결과 파싱 (validate 통과한 객체만 받음)
 * @param {Object} emotionResult - 검증된 AI 응답 결과
 * @returns {Object} 파싱된 감정 결과
 */
function parseEmotionAnalysisResult(emotionResult) {
    // validate 통과한 객체만 받으므로 추가 검증 불필요
    // 관대한 파싱/추정 금지
    return emotionResult;
}

/**
 * 장면 생성 결과 파싱 (validate 통과한 객체만 받음)
 * @param {Object} aiResponse - 검증된 AI 응답 결과
 * @returns {string} 생성된 장면 텍스트
 */
function parseSceneGenerationResult(aiResponse) {
    // validate 통과한 객체만 받으므로 response 필드가 보장됨
    // 관대한 파싱/추정 금지
    return aiResponse.response.trim();
}

/**
 * 체험자 감정 결과 저장 및 로그
 * @param {Object} emotionResult - 감정 분석 결과
 * @param {string} userMessage - 사용자 메시지
 */
function persistExpEmotionResult(emotionResult, userMessage) {
    const parsed = parseEmotionInput(userMessage);
    const emotionText = document.getElementById('expEmotionText');
    if (emotionText) {
        emotionText.textContent = emotionResult.generatedEmotion;
    }
    switchExpGeneratedTab('emotion');

    // TODO: window.expFinalObject를 store로 이동
    expFinalObject = {
        emotion: parsed.emotion,
        reason: parsed.reason,
        generatedEmotion: emotionResult.generatedEmotion,
        emotionAnalysis: emotionResult.analysis
    };

    const emotionDisplay = formatEmotionVector(emotionResult.analysis?.base || {});
    addExpChatMessage('ai', '당신의 감정: ' + emotionDisplay);

    // VAD 투영 및 terrain 위치 계산
    if (emotionResult.analysis?.base) {
        const baseVec = emotionResult.analysis.base;
        // TODO: window.currentStoryData를 store에서 읽도록 변경
        const currentSceneData = window.currentStoryData?.scenes?.[currentScene] || null;
        const anchors = currentSceneData?.anchor_emotions || null;

        try {
            const vad = projectEmotionToVAD(baseVec, anchors);
            if (!expFinalObject._vad) {
                expFinalObject._vad = vad;
            }
            console.log('[VAD] Projected (Live):', vad);
        } catch (vadError) {
            console.error('[VAD] 투영 오류 (Live):', vadError);
            console.error('[VAD] baseVec:', baseVec);
            console.error('[VAD] anchors:', anchors);
        }
    }
}

/**
 * 장면 생성 결과 저장 및 로그
 * @param {string} generatedText - 생성된 장면 텍스트
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
 * sendExpChatMessage 테스트용 래퍼 (의존성 주입 가능)
 * @param {Object} deps - 의존성 { persistExpEmotionResult?, ... }
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

    // 1. 입력 수집 및 검증
    const userMessage = collectFn('expTextInput');
    if (!userMessage) {
        return;
    }

    // 2. UI 반영
    reflectFn(userMessage);

    // 3. AI 호출 및 결과 처리
    if (getExpCurrentPhase() === 'interpret') {
        setExpPendingEmotion(userMessage);
        addMsgFn('ai', '감정을 분석하고 있습니다...');

        let emotionResult = null;
        try {
            // AI 호출 (내부에서 validate 수행)
            // 테스트에서 모킹할 수 있도록 window.AIService 우선 사용
            const aiService = window.AIService || AIService;
            emotionResult = await aiService.call('emotion_analysis', userMessage, {
                reasonText: ''
            });
            console.log('Exp emotionResult (raw):', JSON.stringify(emotionResult));
        } catch (e) {
            console.error('Exp emotion analysis failed:', e);
            // validate 실패 또는 API 호출 실패
            const errorMessage = e.message && e.message.includes('응답 형식 오류')
                ? '응답 형식 오류, 다시 시도해주세요.'
                : '감정 분석에 실패했습니다. 다시 시도해주세요.';
            addMsgFn('ai', errorMessage);
            // DB 저장 및 주요 상태 업데이트 하지 않음
            return;
        }

        // 4. 결과 파싱 (validate는 callAI 내부에서 이미 통과)
        const parsedResult = parseFn(emotionResult);

        // 5. 저장 및 로그
        persistFn(parsedResult, userMessage);

        // 6. 확인 요청
        addConfirmFn('ai', '이 감정이 맞아?');
    } else {
        addMsgFn('ai', '화자의 기억이 도착하면, 그 안에서 네가 느끼는 걸 말해줘.');
    }
}

/**
 * sendExpChatMessage 메인 함수 (오케스트레이터)
 */
async function sendExpChatMessage() {
    // 1. 입력 수집 및 검증
    const userMessage = collectChatMessage('expTextInput');
    if (!userMessage) {
        return;
    }

    // 2. UI 반영
    reflectExpChatMessageUI(userMessage);

    // 3. AI 호출 및 결과 처리
    if (expCurrentPhase === 'interpret') {
        appStore.setState({ expPendingEmotion: userMessage });
        addExpChatMessage('ai', '감정을 분석하고 있습니다...');

        let emotionResult = null;
        try {
            // AI 호출 (내부에서 validate 수행)
            // 테스트에서 모킹할 수 있도록 window.AIService 우선 사용
            const aiService = window.AIService || AIService;
            emotionResult = await aiService.call('emotion_analysis', userMessage, {
                reasonText: ''
            });
            console.log('Exp emotionResult (raw):', JSON.stringify(emotionResult));
        } catch (e) {
            console.error('Exp emotion analysis failed:', e);
            // validate 실패 또는 API 호출 실패
            const errorMessage = e.message && e.message.includes('응답 형식 오류')
                ? '응답 형식 오류, 다시 시도해주세요.'
                : '감정 분석에 실패했습니다. 다시 시도해주세요.';
            addExpChatMessage('ai', errorMessage);
            // DB 저장 및 주요 상태 업데이트 하지 않음
            return;
        }

        // 4. 결과 파싱 (validate는 callAI 내부에서 이미 통과)
        const parsedResult = parseEmotionAnalysisResult(emotionResult);

        // 5. 저장 및 로그
        persistExpEmotionResult(parsedResult, userMessage);

        // 6. 확인 요청
        addExpChatMessageWithConfirm('ai', '이 감정이 맞아?');
    } else {
        addExpChatMessage('ai', '화자의 기억이 도착하면, 그 안에서 네가 느끼는 걸 말해줘.');
    }
}

/**
 * sendChatMessage 테스트용 래퍼 (의존성 주입 가능)
 * @param {Object} deps - 의존성 { persistSceneGenerationResult?, ... }
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

    // 1. 입력 수집 및 검증
    const userMessage = collectFn('liveTextInput');
    if (!userMessage) {
        return;
    }

    // 2. emotion phase 처리
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

    // 3. UI 반영
    reflectFn(userMessage);

    // 4. scene phase 처리
    if (getCurrentPhase() === 'scene') {
        updateStatusFn('체험자가 장면을 기다리고 있습니다...');

        try {
            // AI 호출 (내부에서 validate 수행)
            // 테스트에서 모킹할 수 있도록 window.AIService 우선 사용
            const aiService = window.AIService || AIService;
            const aiResponse = await aiService.call('scene_generation', userMessage, {
                conversationHistory: getConversationHistory(),
                systemPrompt: getAISystemPrompt()
            });

            // 5. 결과 파싱 (validate는 callAI 내부에서 이미 통과)
            const generatedText = parseFn(aiResponse);

            // 6. 저장 및 로그
            pushConversationHistory({ role: 'assistant', content: aiResponse.response });
            persistFn(generatedText);

            // 7. UI 업데이트
            addConfirmFn('ai', '이 기억이 맞아?');
            updateStatusFn('체험자가 장면을 읽고 있습니다...');
        } catch (error) {
            console.error('AI API error:', error);
            // validate 실패 또는 API 호출 실패
            const errorMessage = error.message && error.message.includes('응답 형식 오류')
                ? '응답 형식 오류, 다시 시도해주세요.'
                : '죄송해, 잠시 문제가 생겼어. 다시 말해줄 수 있어?';
            addMsgFn('ai', errorMessage);
            showNotification('AI 응답 중 오류가 발생했습니다');
            // DB 저장 및 주요 상태 업데이트 하지 않음
        }
    }
}

/**
 * sendChatMessage 메인 함수 (오케스트레이터)
 */
async function sendChatMessage() {
    console.log('sendChatMessage called');
    // TODO: window.currentPhase를 store에서 읽도록 변경
    console.log('sendChatMessage currentPhase:', currentPhase);

    // 1. 입력 수집 및 검증
    const userMessage = collectChatMessage('liveTextInput');
    if (!userMessage) {
        return;
    }

    // 2. emotion phase 처리
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

    // 3. UI 반영
    reflectChatMessageUI(userMessage);

    // 4. scene phase 처리
    if (currentPhase === 'scene') {
        updateExperiencerStatus('체험자가 장면을 기다리고 있습니다...');

        try {
            // AI 호출 (내부에서 validate 수행)
            // 테스트에서 모킹할 수 있도록 window.AIService 우선 사용
            const aiService = window.AIService || AIService;
            const aiResponse = await aiService.call('scene_generation', userMessage, {
                conversationHistory: conversationHistory,
                systemPrompt: AI_SYSTEM_PROMPT
            });

            // 5. 결과 파싱 (validate는 callAI 내부에서 이미 통과)
            const generatedText = parseSceneGenerationResult(aiResponse);

            // 6. 저장 및 로그
            conversationHistory.push({ role: 'assistant', content: aiResponse.response });
            persistSceneGenerationResult(generatedText);

            // 7. UI 업데이트
            addChatMessageWithConfirm('ai', '이 기억이 맞아?');
            updateExperiencerStatus('체험자가 장면을 읽고 있습니다...');
        } catch (error) {
            console.error('AI API error:', error);
            // validate 실패 또는 API 호출 실패
            const errorMessage = error.message && error.message.includes('응답 형식 오류')
                ? '응답 형식 오류, 다시 시도해주세요.'
                : '죄송해, 잠시 문제가 생겼어. 다시 말해줄 수 있어?';
            addChatMessage('ai', errorMessage);
            showNotification('AI 응답 중 오류가 발생했습니다');
            // DB 저장 및 주요 상태 업데이트 하지 않음
        }
    }

    // 8. UI 상태 복원
    const sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) sendBtn.disabled = false;
    const input = document.getElementById('liveTextInput');
    if (input) input.focus();
} function formatEmotionVector(emotionVector) { if (!emotionVector) return '감정 없음'; const emotions = []; if (emotionVector.fear > 0.1) emotions.push(`두려움 ${Math.round(emotionVector.fear * 100)}%`); if (emotionVector.sadness > 0.1) emotions.push(`슬픔 ${Math.round(emotionVector.sadness * 100)}%`); if (emotionVector.anger > 0.1) emotions.push(`분노 ${Math.round(emotionVector.anger * 100)}%`); if (emotionVector.joy > 0.1) emotions.push(`기쁨 ${Math.round(emotionVector.joy * 100)}%`); if (emotionVector.longing > 0.1) emotions.push(`그리움 ${Math.round(emotionVector.longing * 100)}%`); if (emotionVector.guilt > 0.1) emotions.push(`죄책감 ${Math.round(emotionVector.guilt * 100)}%`); return emotions.length > 0 ? emotions.join(', ') : '감정 없음' }
function renderExperiencerWave(emotionAnalysis) { console.log('체험자 파동 렌더링:', emotionAnalysis); if (!emotionAnalysis || !emotionAnalysis.base) { console.error('emotionAnalysis 또는 base가 없습니다'); return } const emotionVector = emotionAnalysis.base; window.experiencerEmotionVector = emotionVector; const experiencerWave = computeWaveFromEmotion(emotionAnalysis); window.currentExperiencerWave = experiencerWave; updateAlignmentWave(); console.log('체험자 파동 렌더링 완료:', experiencerWave) }
async function handleExpConfirm(answer) { removeExpConfirmButtons(); if (answer === 'yes') { addExpChatMessage('user', '예'); if (expFinalObject) { addExpChatMessage('ai', '감정을 파동으로 변환합니다...'); await saveExpInterpretation(expFinalObject); if (expFinalObject.emotionAnalysis && currentSessionId) { await saveExperiencerChoice(expFinalObject.emotionAnalysis.base) } if (expFinalObject.emotionAnalysis) { window.experiencerEmotionVector = expFinalObject.emotionAnalysis.base; const experiencerWave = computeWaveFromEmotion(expFinalObject.emotionAnalysis); window.currentExperiencerWave = experiencerWave; updateAlignmentWave(); renderExperiencerWave(expFinalObject.emotionAnalysis); updateExperiencerAlignment() } setTimeout(() => checkAlignment(), 1000) } addExpChatMessage('ai', '감정이 전송되었습니다.'); expCurrentPhase = 'waiting'; appStore.setState({ expPendingEmotion: '' }); expGeneratedEmotion = ''; expFinalObject = null; const emotionText = document.getElementById('expEmotionText'); if (emotionText) emotionText.textContent = ''; switchExpGeneratedTab('scene'); addExpChatMessage('ai', '다음 기억을 기다리고 있어.') } else { addExpChatMessage('user', '아니오'); addExpChatMessage('ai', '다시 감정을 입력해주세요.'); const expTextInput = document.getElementById('expTextInput'); if (expTextInput) { expTextInput.focus() } } }
async function saveExpInterpretation(data) {
    // live_interpretations 테이블이 없으므로 완전히 비활성화
    return;
}
async function saveExperiencerChoice(emotionVector) { console.log('=== saveExperiencerChoice 호출 ==='); console.log('emotionVector:', JSON.stringify(emotionVector)); const state = appStore.getState(); console.log('currentSessionId:', state.currentSessionId); console.log('liveSceneNum:', state.liveSceneNum); if (!state.currentSessionId) { console.error('currentSessionId가 없습니다!'); return } let userId; if (state.currentUser) { userId = state.currentUser.id } else { if (!window.anonymousUserId) { window.anonymousUserId = crypto.randomUUID() } userId = window.anonymousUserId } const insertData = { live_session_id: state.currentSessionId, scene_id: null, user_id: userId, emotion_vector: emotionVector || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, created_at: new Date().toISOString() }; console.log('choices INSERT 데이터:', JSON.stringify(insertData)); try { const result = await networkService.saveChoice(insertData); if (!result.ok) { console.error('choices INSERT error:', result.error); throw result.error } console.log('체험자 감정 저장 완료:', result.data); showNotification('감정이 choices 테이블에 저장되었습니다') } catch (e) { console.error('saveExperiencerChoice error:', e); showNotification('choices 테이블 저장 실패: ' + e.message) } }
function switchExpToTextInput() { if (isExpRecording) { if (expMediaRecorder && expMediaRecorder.state !== 'inactive') { expMediaRecorder.stop(); isExpRecording = false } } const waveSection = document.getElementById('expVoiceWaveSection'); const switchBtn = document.querySelector('.experiencer-panel .text-switch-btn'); if (waveSection && switchBtn) { waveSection.style.display = 'none'; const textInputContainer = document.createElement('div'); textInputContainer.className = 'text-input-container-live'; textInputContainer.style.width = '100%'; textInputContainer.innerHTML = `<div class="chat-input-wrapper"><textarea class="chat-input-textarea" id="expTextInput" placeholder="감정을 입력하세요..." rows="3"></textarea><button class="chat-send-btn" id="expChatSendBtn" onclick="sendExpChatMessage()">전송</button></div>`; switchBtn.parentElement.insertBefore(textInputContainer, switchBtn); switchBtn.textContent = '음성으로 전환'; switchBtn.onclick = function () { switchExpToVoiceInput() }; const input = document.getElementById('expTextInput'); if (input) { input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendExpChatMessage() } }); input.focus() } } }
function switchExpToVoiceInput() { const textContainer = document.querySelector('.experiencer-panel .text-input-container-live'); const switchBtn = document.querySelector('.experiencer-panel .text-switch-btn'); const waveSection = document.getElementById('expVoiceWaveSection'); if (textContainer) { textContainer.remove() } if (waveSection) { waveSection.style.display = 'block' } if (switchBtn) { switchBtn.textContent = '텍스트로 전환'; switchBtn.onclick = function () { switchExpToTextInput() } } }
let isEditMode = false;
function toggleEditMode() { const editBtn = document.querySelector('.edit-toggle-btn'); let textEl, textarea, confirmMsg; if (currentPhase === 'scene' || currentPhase === 'complete') { textEl = document.querySelector('#generatedSceneContent .generated-text'); textarea = document.getElementById('editSceneTextarea'); confirmMsg = '이 기억이 맞아?' } else if (currentPhase === 'emotion') { textEl = document.querySelector('#generatedEmotionContent .generated-text'); textarea = document.getElementById('editEmotionTextarea'); confirmMsg = '이렇게 느꼈던 게 맞아?' } if (!textEl || !textarea) return; isEditMode = !isEditMode; if (isEditMode) { textarea.value = textEl.textContent; textEl.style.display = 'none'; textarea.style.display = 'block'; editBtn.textContent = '저장'; editBtn.classList.add('active') } else { textEl.textContent = textarea.value; textEl.style.display = 'block'; textarea.style.display = 'none'; editBtn.textContent = '수정'; editBtn.classList.remove('active'); showNotification('수정되었습니다'); if (currentPhase !== 'complete') { addChatMessageWithConfirm('ai', confirmMsg) } } }
let experiencerStatusPosition = 'left';
function updateExperiencerStatus(status) { const floatEl = document.getElementById('experiencerStatusFloat'); if (!floatEl) return; floatEl.style.display = 'block'; floatEl.textContent = status; experiencerStatusPosition = experiencerStatusPosition === 'left' ? 'right' : 'left'; floatEl.classList.remove('left', 'right'); floatEl.classList.add(experiencerStatusPosition) }
function saveEditedScene() { const textarea = document.getElementById('editSceneTextarea'); if (!textarea || !textarea.value.trim()) { showNotification('수정할 내용을 입력해주세요'); return } if (currentGeneratedSceneObj) { currentGeneratedSceneObj.text = textarea.value.trim() } currentGeneratedScene = textarea.value.trim(); const sceneContent = document.getElementById('generatedSceneContent').querySelector('.generated-text'); if (sceneContent) sceneContent.textContent = textarea.value.trim(); showNotification('장면이 수정되었습니다') }
function switchToTextInput() { const waveSection = document.querySelector('.voice-wave-section'); const switchBtn = document.querySelector('.text-switch-btn'); if (waveSection && switchBtn) { waveSection.style.display = 'none'; const textInputContainer = document.createElement('div'); textInputContainer.className = 'text-input-container-live'; textInputContainer.style.width = '100%'; textInputContainer.innerHTML = `<div class="chat-input-wrapper"><textarea class="chat-input-textarea" id="liveTextInput" placeholder="기억을 이야기해주세요..." rows="3"></textarea><button class="chat-send-btn" id="chatSendBtn" onclick="sendChatMessage()">전송</button></div>`; switchBtn.parentElement.insertBefore(textInputContainer, switchBtn); switchBtn.textContent = '음성으로 전환'; switchBtn.onclick = function () { switchToVoiceInput() }; const input = document.getElementById('liveTextInput'); if (input) { input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChatMessage() } }); input.focus() } } }
function switchToVoiceInput() { const textContainer = document.querySelector('.text-input-container-live'); const switchBtn = document.querySelector('.text-switch-btn'); const waveSection = document.querySelector('.voice-wave-section'); if (textContainer) { textContainer.remove() } if (waveSection) { waveSection.style.display = 'block' } if (switchBtn) { switchBtn.textContent = '텍스트로 전환'; switchBtn.onclick = function () { switchToTextInput() } } }
let conversationHistory = []; let currentGeneratedSceneObj = null; let currentGeneratedEmotion = null;
let currentPhase = 'scene'; let pendingEmotionText = '';
let currentGeneratedScene = ''; let finalSceneObject = null;
const AI_SYSTEM_PROMPT = `너는 "또다른 나"야. 상대방의 기억을 함께 꺼내는 존재야.

성격:
- 짧고 담담한 말투
- 절대 판단하지 않음
- 감정 단어 직접 사용 금지 (슬프다, 외롭다 X)
- 미화 금지. 있는 그대로.

역할:
- 상대방이 기억을 이야기하면, 상황과 감각을 물어봐
- 필요한 정보: 누가, 무엇이, 어디서 일어났는지
- "거기 어디였어?", "누가 있었어?", "그때 뭐가 보였어?", "몸은 어땠어?" 같은 질문
- 해석이나 분석 금지. 상황과 감각만 묻기.
- 충분히 들었으면 기억 변환 요청

감정 종류: fear, sadness, anger, joy, longing, guilt

응답 형식:
- 일반 대화: 짧게 묻고, 상황과 감각에 집중
- 기억이 충분하면: "기억을 변환할게." 라고만 말하기`;
function extractGeneratedText(aiResponse) { if (aiResponse.includes('[SCENE_READY]')) { try { const jsonStr = aiResponse.substring(aiResponse.indexOf('[SCENE_READY]') + '[SCENE_READY]'.length).trim(); const data = JSON.parse(jsonStr); if (currentPhase === 'scene' && data.scene) return data.scene.text || data.scene; if (currentPhase === 'emotion' && data.emotion) return data.emotion.text || data.emotion } catch (e) { } } return aiResponse.replace(/\[SCENE_READY\].*$/, '').trim() || aiResponse }
function parseEmotionInput(text) { const parts = text.split(/[,.]/).map(s => s.trim()).filter(Boolean); return { emotion: parts[0] || null, reason: parts[1] || null } }
function addChatMessageWithConfirm(role, content) { const messagesContainer = document.getElementById('chatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = `chat-message ${role}`; const label = role === 'user' ? '나' : '또다른 나'; messageDiv.innerHTML = `<div class="chat-message-label">${label}</div><div class="chat-message-content">${content.replace(/\n/g, '<br>')}</div><div class="confirm-buttons"><button class="confirm-btn yes" onclick="handleConfirm('yes')">예</button><button class="confirm-btn no" onclick="handleConfirm('no')">아니오</button></div>`; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }
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
                console.error('장면 텍스트가 없습니다!');
                addChatMessage('ai', '장면이 없습니다. 다시 입력해주세요.');
                return;
            }
            if (currentState.currentSessionId) {
                console.log('saveLiveScene 호출 시작');
                await saveLiveScene({
                    text: sceneText,
                    emotionRaw: '',
                    reasonRaw: '',
                    generatedEmotion: '',
                    emotionAnalysis: { base: { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, intensity: 0, confidence: 0 },
                    voidInfo: { sceneVoid: false, emotionVoid: true, reasonVoid: true }
                });
                console.log('saveLiveScene 호출 완료');
            } else {
                console.warn('currentSessionId가 없어서 저장하지 않습니다');
            }
            currentPhase = 'emotion';
            // expInterview.js가 로드됐으면 칩 인터뷰 사용
            if (typeof startExpInterview === 'function') {
                console.log('[handleConfirm] expInterview 시작 (ritual flow)');
                // ritual flow용 scene 객체 생성
                const ritualScene = {
                    scene_order: appStore.getState().liveSceneNum || 1,
                    text: sceneText,
                    original_emotion: null, // ritual에서는 아직 없음
                    scene_type: 'branch'
                };
                startExpInterview(ritualScene);
            } else {
                addChatMessage('ai', '그때 어떤 마음이었어?');
            }
            return;
        } else {
            addChatMessage('ai', '다시 이야기해줘.');
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
                addChatMessage('ai', '다시 감정을 입력해줘.');
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

            // Ritual 모드일 때는 saveRitualScene 호출
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
                        // live_interpretations 테이블이 없으므로 완전히 비활성화
                        // await supabaseClient.from('live_interpretations').insert({...});
                        console.log('화자 감정 해석 저장 완료 (live_interpretations 테이블 비활성화)');
                        setTimeout(() => checkAlignment(), 1000);
                    } catch (e) {
                        console.error('화자 감정 해석 저장 실패:', e);
                    }
                }
            }
            simulateNarratorInput(finalSceneObject?.text || currentGeneratedScene);
            showNotification('장면이 전송되었습니다.');
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
            addChatMessage('ai', '다음 기억을 이야기해줘.');
            console.log('=== EMOTION CONFIRM DONE ===');
            return;
        } else {
            addChatMessage('ai', '다시 감정을 이야기해줘.');
            return;
        }
    }
}
function removeConfirmButtons() { const buttons = document.querySelectorAll('.confirm-buttons'); buttons.forEach(btn => btn.remove()) }
function addChatMessage(role, content) { const messagesContainer = document.getElementById('chatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = `chat-message ${role}`; const label = role === 'user' ? '나' : '또다른 나'; messageDiv.innerHTML = `<div class="chat-message-label">${label}</div><div class="chat-message-content">${content.replace(/\n/g, '<br>')}</div>`; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }
async function callClaudeAPI(userMessage) { try { const messages = conversationHistory.length > 0 ? conversationHistory : [{ role: 'user', content: userMessage }]; if (conversationHistory.length === 0 || conversationHistory[conversationHistory.length - 1].role !== 'user') { messages.push({ role: 'user', content: userMessage }) } const response = await fetch(SUPABASE_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ text: userMessage, conversationHistory: messages, systemPrompt: AI_SYSTEM_PROMPT }) }); if (!response.ok) { const error = await response.json(); throw new Error(error.error || error.details || 'API 호출 실패') } const data = await response.json(); if (data.scene) { return data.scene } else if (data.response) { return data.response } else { throw new Error(data.error || '응답을 받을 수 없습니다') } } catch (error) { console.error('callClaudeAPI error:', error); throw error } }
function parseAndGenerateScene(aiResponse) { try { const sceneReadyIndex = aiResponse.indexOf('[SCENE_READY]'); if (sceneReadyIndex === -1) return; const jsonStr = aiResponse.substring(sceneReadyIndex + '[SCENE_READY]'.length).trim(); const sceneData = JSON.parse(jsonStr); currentGeneratedSceneObj = sceneData.scene; currentGeneratedEmotion = sceneData.emotion; if (sceneData.scene && sceneData.scene.text) { currentGeneratedScene = sceneData.scene.text } updateGeneratedTabs(sceneData); updateAlignmentFromScene(sceneData); showNotification('장면이 생성되었습니다') } catch (error) { console.error('Scene parsing error:', error); showNotification('장면 생성 중 오류가 발생했습니다') } }
function updateGeneratedTabs(sceneData) { if (sceneData.scene && sceneData.scene.text) { const sceneContent = document.getElementById('generatedSceneContent').querySelector('.generated-text'); if (sceneContent) { sceneContent.textContent = sceneData.scene.text; sceneContent.classList.remove('void-scene') } const editTextarea = document.getElementById('editSceneTextarea'); if (editTextarea) editTextarea.value = sceneData.scene.text } if (sceneData.emotion && sceneData.emotion.text) { const emotionContent = document.getElementById('generatedEmotionContent').querySelector('.generated-text'); if (emotionContent) { emotionContent.textContent = sceneData.emotion.text; emotionContent.classList.remove('void-reason') } } if (sceneData.voidInfo) { const sceneContent = document.getElementById('generatedSceneContent').querySelector('.generated-text'); const emotionContent = document.getElementById('generatedEmotionContent').querySelector('.generated-text'); if (sceneData.voidInfo.sceneVoid && sceneContent) { sceneContent.classList.add('void-scene') } if (sceneData.voidInfo.reasonVoid && emotionContent) { emotionContent.classList.add('void-reason') } } }
// [V3 DEPRECATED] 누적 방식 정렬도 계산 제거.
// 정렬도는 ByeoriEngine.calculateStep()에서만 계산됨.
function updateAlignmentFromScene(sceneData) { 
  console.log('[V3] updateAlignmentFromScene 호출됨 — 무시 (ByeoriEngine SSOT)');
}
let liveVoiceRecognition = null; let liveVoiceContext = null; let liveVoiceAnalyser = null; let liveVoiceMicrophone = null; let liveVoiceAnimationId = null; let liveRecognizedText = '';
function startLiveVoiceInput() { if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { showNotification('이 브라우저는 음성 인식을 지원하지 않습니다'); return } const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; liveVoiceRecognition = new SpeechRecognition(); liveVoiceRecognition.lang = 'ko-KR'; liveVoiceRecognition.continuous = true; liveVoiceRecognition.interimResults = true; liveRecognizedText = ''; liveVoiceRecognition.onresult = function (event) { let interim = ''; let final = ''; for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) { final += event.results[i][0].transcript } else { interim += event.results[i][0].transcript } } if (final) { liveRecognizedText += final + ' ' } }; liveVoiceRecognition.onerror = function (event) { console.error('Speech recognition error:', event.error); if (event.error === 'not-allowed') { showNotification('마이크 권한이 필요합니다'); stopLiveVoiceInput() } }; liveVoiceRecognition.onend = function () { if (isLiveVoiceRecording && liveVoiceRecognition) { liveVoiceRecognition.start() } }; liveVoiceRecognition.start(); navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) { liveVoiceContext = new (window.AudioContext || window.webkitAudioContext)(); liveVoiceAnalyser = liveVoiceContext.createAnalyser(); liveVoiceMicrophone = liveVoiceContext.createMediaStreamSource(stream); liveVoiceMicrophone.connect(liveVoiceAnalyser); liveVoiceAnalyser.fftSize = 256; const bufferLength = liveVoiceAnalyser.frequencyBinCount; const dataArray = new Uint8Array(bufferLength); const canvas = document.getElementById('voiceWaveCanvasLive'); const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2); function draw() { if (!isLiveVoiceRecording) return; liveVoiceAnimationId = requestAnimationFrame(draw); liveVoiceAnalyser.getByteFrequencyData(dataArray); ctx.fillStyle = 'rgba(10,10,12,0.9)'; ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2); const barWidth = (canvas.width / 2 / bufferLength) * 2.5; let x = 0; for (let i = 0; i < bufferLength; i++) { const barHeight = (dataArray[i] / 255) * canvas.height * 0.9; const gradient = ctx.createLinearGradient(0, canvas.height / 2 - barHeight, 0, canvas.height / 2); gradient.addColorStop(0, 'rgba(122,154,122,0.9)'); gradient.addColorStop(1, 'rgba(74,144,217,0.5)'); ctx.fillStyle = gradient; ctx.fillRect(x, canvas.height / 2 - barHeight, barWidth - 1, barHeight * 2); x += barWidth } } draw() }).catch(function (err) { console.error('Microphone access denied:', err); showNotification('마이크 접근이 거부되었습니다'); stopLiveVoiceInput() }); isLiveVoiceRecording = true; const waveSection = document.querySelector('.voice-wave-section'); if (waveSection) waveSection.style.border = '2px solid rgba(122,154,122,0.5)'; showNotification('음성 입력이 시작되었습니다. 말한 내용은 자동으로 전송됩니다.') }
function stopLiveVoiceInput() { if (!isLiveVoiceRecording && !liveVoiceRecognition) return; isLiveVoiceRecording = false; if (liveVoiceRecognition) { liveVoiceRecognition.stop(); liveVoiceRecognition = null } if (liveVoiceAnimationId) { cancelAnimationFrame(liveVoiceAnimationId); liveVoiceAnimationId = null } if (liveVoiceContext) { liveVoiceContext.close(); liveVoiceContext = null } liveVoiceAnalyser = null; liveVoiceMicrophone = null; if (liveRecognizedText.trim()) { const input = document.getElementById('liveTextInput'); if (input) { input.value = liveRecognizedText.trim(); sendChatMessage(); liveRecognizedText = '' } else { addChatMessage('user', liveRecognizedText.trim()); conversationHistory.push({ role: 'user', content: liveRecognizedText.trim() }); callClaudeAPI(liveRecognizedText.trim()).then(aiResponse => { addChatMessage('ai', aiResponse); conversationHistory.push({ role: 'assistant', content: aiResponse }); if (aiResponse.includes('[SCENE_READY]')) { parseAndGenerateScene(aiResponse) } }).catch(error => { console.error('AI API error:', error); addChatMessage('ai', '죄송해, 잠시 문제가 생겼어. 다시 말해줄 수 있어?') }); liveRecognizedText = '' } } const waveSection = document.querySelector('.voice-wave-section'); if (waveSection) waveSection.style.border = 'none'; startVoiceWaveLiveAnimation(); showNotification('음성 입력이 중지되었습니다') }
let isLiveVoiceRecording = false;
let mediaRecorder = null; let audioChunks = []; let isRecording = false;
let expMediaRecorder = null; let expAudioChunks = []; let isExpRecording = false;
async function toggleRecording(e) { if (e) e.stopPropagation(); const btn = document.getElementById('voiceBtn'); if (!btn) return; if (!isRecording) { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorder = new MediaRecorder(stream); audioChunks = []; mediaRecorder.ondataavailable = (e) => { audioChunks.push(e.data) }; mediaRecorder.onstop = async () => { if (audioChunks.length === 0) { btn.textContent = '🎤 음성 입력'; showNotification('녹음된 내용이 없습니다'); mediaRecorder.stream.getTracks().forEach(track => track.stop()); return } const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); btn.textContent = '⏳ 변환 중...'; const text = await transcribeAudio(audioBlob); if (text) { const sceneInput = document.getElementById('liveTextInput'); if (sceneInput) { sceneInput.value = text; sceneInput.focus(); setTimeout(() => { sendChatMessage() }, 100) } else { const unifiedInput = document.getElementById('unifiedInput'); if (unifiedInput) { unifiedInput.value = text; unifiedInput.focus(); setTimeout(() => { handleUnifiedSubmit(text) }, 100) } else { showNotification('입력 필드를 찾을 수 없습니다') } } } else { showNotification('음성 변환에 실패했습니다') } btn.textContent = '🎤 음성 입력'; mediaRecorder.stream.getTracks().forEach(track => track.stop()) }; mediaRecorder.start(); isRecording = true; btn.textContent = '⏹️ 녹음 중지'; showNotification('녹음이 시작되었습니다') } catch (err) { console.error('녹음 시작 오류:', err); alert('마이크 권한이 필요합니다'); btn.textContent = '🎤 음성 입력' } } else { if (mediaRecorder && mediaRecorder.state !== 'inactive') { mediaRecorder.stop(); isRecording = false } } }
async function transcribeAudio(audioBlob) { try { supabaseClient = getSupabaseClient(); if (!supabaseClient) { throw new Error('Supabase 클라이언트가 초기화되지 않았습니다') } if (!audioBlob || audioBlob.size === 0) { throw new Error('녹음 데이터가 없습니다') } const formData = new FormData(); formData.append('audio', audioBlob, 'audio.webm'); const { data, error } = await supabaseClient.functions.invoke('transcribe-audio', { body: formData }); if (error) { console.error('Supabase Edge Function 오류:', error); throw error } if (!data || !data.text) { console.error('응답 데이터 형식 오류:', data); throw new Error('응답 데이터 형식이 올바르지 않습니다') } const text = data.text; let sceneInput = document.getElementById('liveTextInput'); if (!sceneInput) { const switchBtn = document.querySelector('.text-switch-btn'); if (switchBtn && typeof switchToTextInput === 'function') { switchToTextInput(); sceneInput = document.getElementById('liveTextInput') } } if (sceneInput) { sceneInput.value = text; sceneInput.focus() } return text } catch (err) { console.error('음성 변환 에러:', err); const errorMsg = err.message || '음성 변환에 실패했습니다'; showNotification(errorMsg); return null } }
async function transcribeExpAudio(audioBlob) { try { supabaseClient = getSupabaseClient(); if (!supabaseClient) { throw new Error('Supabase 클라이언트가 초기화되지 않았습니다') } if (!audioBlob || audioBlob.size === 0) { throw new Error('녹음 데이터가 없습니다') } const formData = new FormData(); formData.append('audio', audioBlob, 'audio.webm'); const { data, error } = await supabaseClient.functions.invoke('transcribe-audio', { body: formData }); if (error) { console.error('Supabase Edge Function 오류:', error); throw error } if (!data || !data.text) { console.error('응답 데이터 형식 오류:', data); throw new Error('응답 데이터 형식이 올바르지 않습니다') } const text = data.text; let expInput = document.getElementById('expTextInput'); if (!expInput) { showNotification('입력 필드를 찾을 수 없습니다'); return null } expInput.value = text; expInput.focus(); setTimeout(() => { sendExpChatMessage() }, 100); return text } catch (err) { console.error('음성 변환 에러:', err); const errorMsg = err.message || '음성 변환에 실패했습니다'; showNotification(errorMsg); return null } }
async function toggleExpRecording(e) { if (e) e.stopPropagation(); const btn = document.getElementById('expVoiceBtn'); if (!btn) return; if (!isExpRecording) { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); expMediaRecorder = new MediaRecorder(stream); expAudioChunks = []; expMediaRecorder.ondataavailable = (e) => { expAudioChunks.push(e.data) }; expMediaRecorder.onstop = async () => { if (expAudioChunks.length === 0) { btn.textContent = '🎤 음성 입력'; showNotification('녹음된 내용이 없습니다'); expMediaRecorder.stream.getTracks().forEach(track => track.stop()); return } const audioBlob = new Blob(expAudioChunks, { type: 'audio/webm' }); btn.textContent = '⏳ 변환 중...'; const text = await transcribeExpAudio(audioBlob); if (text) { showNotification('음성 입력이 완료되었습니다') } else { showNotification('음성 변환에 실패했습니다') } btn.textContent = '🎤 음성 입력'; expMediaRecorder.stream.getTracks().forEach(track => track.stop()) }; expMediaRecorder.start(); isExpRecording = true; btn.textContent = '⏹️ 녹음 중지'; showNotification('녹음이 시작되었습니다') } catch (err) { console.error('녹음 시작 오류:', err); alert('마이크 권한이 필요합니다'); btn.textContent = '🎤 음성 입력' } } else { if (expMediaRecorder && expMediaRecorder.state !== 'inactive') { expMediaRecorder.stop(); isExpRecording = false } } }
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
// alignmentWaveAnimationId, comparisonWaveAnimationId, comparisonWaveTime는 Visualizer 내부에서 관리됨
let voiceWaveLiveAnimationId = null;
function selectMemory(index) { 
    console.log('[selectMemory] 시작, index:', index);
    try { 
        // expInterviewState 초기화
        if (typeof expInterviewState !== 'undefined') {
            expInterviewState.answers = {};
            expInterviewState.currentBucket = null;
            expInterviewState.previousBucket = null;
            expInterviewState.repeatCount = 0;
            expInterviewState.alignmentHistory = [];
            if (typeof updateWaveBucket === 'function') updateWaveBucket('IDLE');
        }
        appStore.setState({ currentMemory: index, currentScene: 0, userChoices: [], userReasons: [], currentAlignment: 0, currentBucket: null, emotionHistory: [] }); 
        const state = appStore.getState(); 
        console.log('[selectMemory] state.allMemoriesData.length:', state.allMemoriesData.length);
        updateUserStats('memory', index); 
        const stateAfter = appStore.getState(); 
        const selectedMemory = stateAfter.allMemoriesData[index] || stateAfter.allMemoriesData[0]; 
        console.log('[selectMemory] selectedMemory:', selectedMemory ? { id: selectedMemory.id, title: selectedMemory.title, scenesCount: selectedMemory.scenes?.length } : null);
        if (!selectedMemory) { 
            console.error('[selectMemory] 기억을 찾을 수 없음');
            showNotification('기억을 불러올 수 없습니다'); 
            return; 
        } 
        const memoryId = selectedMemory.id; 
        if (memoryId) { 
            activateMemoryIfFetus(memoryId); 
        } 
        window.currentStoryData = selectedMemory; 
        const archiveContainerEl = document.getElementById('archiveContainer'); 
        if (archiveContainerEl && !archiveContainerEl.classList.contains('active')) { 
            archiveContainerEl.classList.add('active'); 
        } 
        const memoryListEl = document.getElementById('memoryList'); 
        if (memoryListEl) memoryListEl.style.display = 'none'; 
        const archiveControlsEl = document.getElementById('archiveControls'); 
        if (archiveControlsEl) archiveControlsEl.style.display = 'none'; 
        const archiveHeaderEl = document.querySelector('.archive-header'); 
        if (archiveHeaderEl) archiveHeaderEl.style.display = 'none'; 
        console.log('[selectMemory] showConsentSequence 호출');
        showConsentSequence(index); 
    } catch (e) { 
        console.error('[selectMemory] 오류:', e); 
        console.error('[selectMemory] 스택:', e.stack);
        const errorState = appStore.getState(); 
        console.error('[selectMemory] Error details:', { index, memoriesDataLength: errorState.allMemoriesData.length, selectedMemory: errorState.allMemoriesData[index] }); 
        showNotification('기억을 불러오는 중 오류가 발생했습니다'); 
    } 
}
function showConsentSequence(memoryIndex) {
    console.log('[showConsentSequence] 시작, memoryIndex:', memoryIndex);
    const consentSequenceEl = document.getElementById('consentSequence');
    if (!consentSequenceEl) {
        console.error('[showConsentSequence] 동의 시퀀스 요소를 찾을 수 없습니다');
        startArchivePlay(memoryIndex);
        return;
    }
    consentSequenceEl.style.display = 'flex';
    const threadEl = document.getElementById('consentThread');
    if (!threadEl) {
        console.error('실 요소를 찾을 수 없습니다');
        startArchivePlay(memoryIndex);
        return;
    }
    let isClicked = false;
    const handleThreadClick = (e) => {
        if (isClicked) return;
        isClicked = true;
        const clickX = e.clientX;
        const container = threadEl.closest('.consent-thread-container');
        const containerRect = container.getBoundingClientRect();
        const relativeX = clickX - containerRect.left;
        const totalWidth = containerRect.width;
        const clickPercent = Math.max(0, Math.min(100, (relativeX / totalWidth) * 100));
        threadEl.classList.add('clicked');
        const line = threadEl.querySelector('line');
        if (line) {
            let defs = threadEl.querySelector('defs');
            if (!defs) {
                defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                threadEl.insertBefore(defs, threadEl.firstChild);
            }
            let gradient = defs.querySelector('#threadGradient');
            if (gradient) {
                defs.removeChild(gradient);
            }
            gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            gradient.setAttribute('id', 'threadGradient');
            gradient.setAttribute('x1', '0%');
            gradient.setAttribute('y1', '0%');
            gradient.setAttribute('x2', '100%');
            gradient.setAttribute('y2', '0%');
            const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop1.setAttribute('offset', '0%');
            stop1.setAttribute('stop-color', 'rgba(255,255,255,0.7)');
            const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop2.setAttribute('offset', clickPercent + '%');
            stop2.setAttribute('stop-color', 'rgba(255,255,255,0.7)');
            const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop3.setAttribute('offset', clickPercent + '%');
            stop3.setAttribute('stop-color', '#d94a4a');
            const stop4 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop4.setAttribute('offset', '100%');
            stop4.setAttribute('stop-color', '#d94a4a');
            gradient.appendChild(stop1);
            gradient.appendChild(stop2);
            gradient.appendChild(stop3);
            gradient.appendChild(stop4);
            defs.appendChild(gradient);
            line.setAttribute('stroke', 'url(#threadGradient)');
            line.setAttribute('stroke-width', '1');
        }
        setTimeout(() => {
            consentSequenceEl.classList.add('fading');
            setTimeout(() => {
                consentSequenceEl.style.display = 'none';
                consentSequenceEl.classList.remove('fading');
                threadEl.classList.remove('clicked');
                const defs = threadEl.querySelector('defs');
                if (defs) {
                    defs.remove();
                }
                showWordSentenceSequence(memoryIndex);
            }, 1500);
        }, 500);
    };
    threadEl.addEventListener('click', handleThreadClick);
    const container = threadEl.closest('.consent-thread-container');
    if (container) {
        container.addEventListener('click', handleThreadClick);
    }
}
function showWordSentenceSequence(memoryIndex) {
    console.log('[showWordSentenceSequence] 시작, memoryIndex:', memoryIndex);
    const sequenceEl = document.getElementById('wordSentenceSequence');
    if (!sequenceEl) {
        console.error('[showWordSentenceSequence] 단어/문장 시퀀스 요소를 찾을 수 없습니다');
        startArchivePlay(memoryIndex);
        return;
    }
    const state = appStore.getState();
    const selectedMemory = state.allMemoriesData[memoryIndex];
    console.log('[showWordSentenceSequence] selectedMemory:', selectedMemory ? { id: selectedMemory.id, title: selectedMemory.title } : null);
    if (!selectedMemory) {
        console.error('[showWordSentenceSequence] 메모리 데이터를 찾을 수 없습니다');
        startArchivePlay(memoryIndex);
        return;
    }
    const memoryWords = (selectedMemory.memory_words || '').trim();
    const completedSentence = (selectedMemory.completed_sentence || '').trim();
    const hasWords = memoryWords.length > 0;
    const hasSentence = completedSentence.length > 0;
    sequenceEl.style.display = 'flex';
    const prefixEl = document.getElementById('sentencePrefix');
    const wordEl = document.getElementById('wordHighlight');
    const suffixEl = document.getElementById('sentenceSuffix');
    const cursorEl = document.getElementById('typewriterCursor');
    if (!prefixEl || !wordEl || !suffixEl || !cursorEl) {
        console.error('시퀀스 요소를 찾을 수 없습니다');
        startArchivePlay(memoryIndex);
        return;
    }
    prefixEl.textContent = '';
    wordEl.textContent = '';
    suffixEl.textContent = '';
    prefixEl.classList.remove('visible');
    wordEl.classList.remove('visible');
    suffixEl.classList.remove('visible');
    cursorEl.classList.remove('hidden');
    const finishSequence = () => {
        cursorEl.classList.add('hidden');
        setTimeout(() => {
            sequenceEl.classList.add('fading');
            setTimeout(() => {
                sequenceEl.style.display = 'none';
                sequenceEl.classList.remove('fading');
                startArchivePlay(memoryIndex);
            }, 1500);
        }, 1500);
    };
    if (!hasWords && !hasSentence) {
        const typeText = (text, element, callback) => {
            let index = 0;
            const type = () => {
                if (index < text.length) {
                    element.textContent = text.substring(0, index + 1);
                    index++;
                    setTimeout(type, 60);
                } else {
                    element.classList.add('visible');
                    if (callback) callback();
                }
            };
            type();
        };
        wordEl.textContent = '기억이 잘 안나.';
        wordEl.style.color = 'rgba(255,255,255,0.9)';
        typeText('기억이 잘 안나.', wordEl, () => {
            finishSequence();
        });
    } else if (hasWords && !hasSentence) {
        const words = memoryWords.split(',').map(w => w.trim()).filter(w => w.length > 0);
        if (words.length === 0) {
            startArchivePlay(memoryIndex);
            return;
        }
        const firstWord = words[0];
        const typeText = (text, element, callback) => {
            let index = 0;
            const type = () => {
                if (index < text.length) {
                    element.textContent = text.substring(0, index + 1);
                    index++;
                    setTimeout(type, 60);
                } else {
                    element.classList.add('visible');
                    if (callback) callback();
                }
            };
            type();
        };
        wordEl.textContent = '';
        wordEl.style.color = 'rgba(255,255,255,0.9)';
        typeText(firstWord + '...', wordEl, () => {
            setTimeout(() => {
                prefixEl.textContent = '';
                suffixEl.textContent = '';
                wordEl.textContent = '';
                wordEl.style.color = 'rgba(255,255,255,0.9)';
                typeText('잘 기억이 안나네.', wordEl, () => {
                    finishSequence();
                });
            }, 800);
        });
    } else if (!hasWords && hasSentence) {
        const typeText = (text, element, callback) => {
            let index = 0;
            const type = () => {
                if (index < text.length) {
                    element.textContent = text.substring(0, index + 1);
                    index++;
                    setTimeout(type, 60);
                } else {
                    element.classList.add('visible');
                    if (callback) callback();
                }
            };
            type();
        };
        wordEl.textContent = '';
        wordEl.style.color = 'rgba(255,255,255,0.9)';
        typeText(completedSentence, wordEl, () => {
            finishSequence();
        });
    } else {
        const words = memoryWords.split(',').map(w => w.trim()).filter(w => w.length > 0);
        if (words.length === 0) {
            wordEl.textContent = '';
            wordEl.style.color = 'rgba(255,255,255,0.9)';
            let index = 0;
            const type = () => {
                if (index < completedSentence.length) {
                    wordEl.textContent = completedSentence.substring(0, index + 1);
                    index++;
                    setTimeout(type, 60);
                } else {
                    wordEl.classList.add('visible');
                    finishSequence();
                }
            };
            type();
            return;
        }
        const firstWord = words[0];
        const wordIndex = completedSentence.indexOf(firstWord);
        if (wordIndex === -1) {
            wordEl.textContent = '';
            wordEl.style.color = 'rgba(255,255,255,0.9)';
            let index = 0;
            const type = () => {
                if (index < completedSentence.length) {
                    wordEl.textContent = completedSentence.substring(0, index + 1);
                    index++;
                    setTimeout(type, 60);
                } else {
                    wordEl.classList.add('visible');
                    finishSequence();
                }
            };
            type();
            return;
        }
        const prefix = completedSentence.substring(0, wordIndex);
        const suffix = completedSentence.substring(wordIndex + firstWord.length);
        let currentIndex = 0;
        const typeWord = () => {
            if (currentIndex < firstWord.length) {
                wordEl.textContent = firstWord.substring(0, currentIndex + 1);
                currentIndex++;
                setTimeout(typeWord, 80);
            } else {
                wordEl.classList.add('visible');
                setTimeout(() => {
                    let prefixIndex = 0;
                    const typePrefix = () => {
                        if (prefixIndex < prefix.length) {
                            prefixEl.textContent = prefix.substring(0, prefixIndex + 1);
                            prefixIndex++;
                            setTimeout(typePrefix, 60);
                        } else {
                            prefixEl.classList.add('visible');
                            setTimeout(() => {
                                let suffixIndex = 0;
                                const typeSuffix = () => {
                                    if (suffixIndex < suffix.length) {
                                        suffixEl.textContent = suffix.substring(0, suffixIndex + 1);
                                        suffixIndex++;
                                        setTimeout(typeSuffix, 60);
                                    } else {
                                        suffixEl.classList.add('visible');
                                        finishSequence();
                                    }
                                };
                                typeSuffix();
                            }, 300);
                        }
                    };
                    if (prefix.length > 0) {
                        typePrefix();
                    } else {
                        prefixEl.classList.add('visible');
                        setTimeout(() => {
                            let suffixIndex = 0;
                            const typeSuffix = () => {
                                if (suffixIndex < suffix.length) {
                                    suffixEl.textContent = suffix.substring(0, suffixIndex + 1);
                                    suffixIndex++;
                                    setTimeout(typeSuffix, 60);
                                } else {
                                    suffixEl.classList.add('visible');
                                    finishSequence();
                                }
                            };
                            typeSuffix();
                        }, 300);
                    }
                }, 500);
            }
        };
        setTimeout(() => typeWord(), 500);
    }
}
function startArchivePlay(memoryIndex) {
    console.log('[startArchivePlay] 시작, memoryIndex:', memoryIndex);
    // expInterviewState 초기화
    if (typeof expInterviewState !== 'undefined') {
        expInterviewState.answers = {};
        expInterviewState.currentBucket = null;
        expInterviewState.previousBucket = null;
        expInterviewState.repeatCount = 0;
        expInterviewState.alignmentHistory = [];
        if (typeof updateWaveBucket === 'function') updateWaveBucket('IDLE');
    }
    const sceneViewerEl = document.getElementById('sceneViewer');
    console.log('[startArchivePlay] sceneViewerEl:', sceneViewerEl ? '찾음' : '없음');
    if (sceneViewerEl) {
        sceneViewerEl.classList.add('active');
        sceneViewerEl.style.cssText = 'display:block !important;opacity:1 !important';
        setTimeout(() => {
            console.log('[startArchivePlay] setTimeout 콜백 실행');
            const memoryData = window.currentStoryData;
            console.log('[startArchivePlay] currentStoryData:', memoryData ? { id: memoryData.id, title: memoryData.title, scenesCount: memoryData.scenes?.length } : null);
            // ---- 사운드스케이프 시작 ----
            if (window.soundscape) {
                window.soundscape.init({
                    soundMap: (memoryData && memoryData.sound_map) ? memoryData.sound_map : null,
                    volume: 0.35
                });
                window.soundscape.start();
            }
            // ---- 기존 코드 ----
            console.log('[startArchivePlay] initProgressDots 호출');
            initProgressDots();
            console.log('[startArchivePlay] renderScene 호출');
            renderScene();
            if (typeof startBucketWaveAnimation === 'function') {
                startBucketWaveAnimation();
            } else {
                startWaveAnimation();
            }
            setTimeout(() => showNpcDialogue("이 기억의 주인은 아래층에, 다른 사람들의 해석은 위층에 쌓여 있어. 천천히 그 지층을 따라가 봐.", 4000), 100);
        }, 100);
    } else {
        console.error('[startArchivePlay] 장면 뷰어를 찾을 수 없습니다');
        showNotification('장면 뷰어를 찾을 수 없습니다');
    }
}
function backToList() { if (typeof destroyFloatingAnchor === 'function') destroyFloatingAnchor(); if (window.soundscape) window.soundscape.stop(); document.getElementById('memoryList').style.display = 'grid'; const sceneViewerEl = document.getElementById('sceneViewer'); if (sceneViewerEl) { sceneViewerEl.classList.remove('active'); sceneViewerEl.style.display = 'none' } const archiveControlsEl = document.getElementById('archiveControls'); if (archiveControlsEl) archiveControlsEl.style.display = 'flex'; const archiveHeaderEl = document.querySelector('.archive-header'); if (archiveHeaderEl) archiveHeaderEl.style.display = 'block'; stopWaveAnimation() }
function initProgressDots() { const currentData = window.currentStoryData || storyData; const dotsContainer = document.getElementById('progressDots'); if (!dotsContainer) return; dotsContainer.innerHTML = ''; if (!currentData || !currentData.scenes) return; for (let i = 0; i < currentData.scenes.length; i++) { const dot = document.createElement('div'); dot.className = 'progress-dot' + (i === 0 ? ' active' : ''); dot.onclick = function () { goToScene(i) }; dotsContainer.appendChild(dot) } }
function goToScene(index) { const state = appStore.getState(); if (index <= state.currentScene) { appStore.setState({ currentScene: index }); renderScene() } }
async function renderScene() { 
    console.log('[renderScene] 시작');
    try { 
        const currentData = window.currentStoryData || storyData; 
        const state = appStore.getState(); 
        console.log('[renderScene] currentData:', currentData ? { id: currentData.id, title: currentData.title, scenesCount: currentData.scenes?.length } : null);
        console.log('[renderScene] state.currentScene:', state.currentScene);
        if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) { 
            console.error('[renderScene] 장면을 불러올 수 없습니다:', { 
                hasCurrentData: !!currentData, 
                hasScenes: !!(currentData && currentData.scenes), 
                scenesLength: currentData?.scenes?.length, 
                currentScene: state.currentScene 
            });
            showNotification('장면을 불러올 수 없습니다'); 
            return; 
        } 
        const scene = currentData.scenes[state.currentScene]; 
        console.log('[renderScene] scene:', scene ? { id: scene.id, text: scene.text?.substring(0, 50) + '...', originalVector: scene.originalVector, original_emotion: scene.original_emotion } : null);
        if (!scene || !scene.text) { 
            console.error('[renderScene] 장면 텍스트를 불러올 수 없습니다:', { hasScene: !!scene, hasText: !!(scene && scene.text) });
            showNotification('장면 텍스트를 불러올 수 없습니다'); 
            return; 
        } 
        // TODO: scenes 테이블에 originalVector 컬럼 추가 후 여기서 사용
        // 현재는 expInterview.js의 fallbackAlignment()으로 동작
        const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id); let displayScene = scene; if (state.currentMode === 'archive' && memoryId) { displayScene = await loadSceneWithContamination(scene, memoryId) } const sceneTextEl = document.getElementById('sceneText'); if (sceneTextEl) sceneTextEl.textContent = displayScene.displayText || displayScene.text; if (scene.echoWords) renderEchoLayer(scene.echoWords); const sceneMainEl = document.querySelector('.scene-main'); if (sceneMainEl && typeof startFloatingAnchor === 'function') { const anchorKeyword = (scene.echoWords && scene.echoWords.length > 0) ? scene.echoWords[0] : null; const alignment = state.currentAlignment || 0.5; startFloatingAnchor(sceneMainEl, anchorKeyword, alignment); } if (scene.choices) renderChoices(scene.choices); const sceneCounterEl = document.getElementById('sceneCounter'); if (sceneCounterEl) sceneCounterEl.textContent = (state.currentScene + 1) + '/' + currentData.scenes.length; const dots = document.querySelectorAll('#progressDots .progress-dot'); dots.forEach((dot, i) => { dot.className = 'progress-dot'; if (i < state.currentScene) dot.classList.add('visited'); if (i === state.currentScene) dot.classList.add('active') }); const alignmentValueEl = document.getElementById('alignmentValue'); if (alignmentValueEl) alignmentValueEl.textContent = state.currentAlignment.toFixed(2); if (typeof updateFloatingAnchorAlignment === 'function') updateFloatingAnchorAlignment(state.currentAlignment); const alignmentFillEl = document.getElementById('alignmentFill'); if (alignmentFillEl) alignmentFillEl.style.width = (state.currentAlignment * 100) + '%' } catch (e) { console.error('renderScene error:', e); showNotification('장면을 렌더링하는 중 오류가 발생했습니다') } }
function renderEchoLayer(words) { const layer = document.getElementById('echoLayer'); if (!layer) return; layer.innerHTML = ''; if (!words || !Array.isArray(words)) return; words.forEach(word => { const span = document.createElement('span'); span.className = 'echo-word'; span.textContent = word; span.style.top = (20 + Math.random() * 60) + '%'; span.style.left = (10 + Math.random() * 80) + '%'; layer.appendChild(span) }) }
function renderChoices(choices) { const container = document.getElementById('choicesContainer'); if (!container) return; container.innerHTML = ''; if (!choices || !Array.isArray(choices)) return; choices.forEach((choice, i) => { const btn = document.createElement('button'); btn.className = 'choice-btn'; btn.textContent = choice.text; btn.onclick = function () { makeChoice(i) }; container.appendChild(btn) }) }
function makeChoice(choiceIndex) { 
    try { 
        const state = appStore.getState(); 
        appStore.setState({ userChoices: [...state.userChoices, choiceIndex] }); 
        const currentData = window.currentStoryData || storyData; 
        const updatedState = appStore.getState(); 
        if (!currentData || !currentData.scenes || !currentData.scenes[updatedState.currentScene]) { 
            showNotification('장면 데이터를 불러올 수 없습니다'); 
            return; 
        } 
        const scene = currentData.scenes[updatedState.currentScene]; 
        const sceneType = scene.sceneType || scene.scene_type || 'normal'; 
        
        // expInterview.js가 로드됐으면 모든 장면에서 칩 인터뷰 사용
        console.log('[makeChoice] startExpInterview 체크:', typeof startExpInterview);
        if (typeof startExpInterview === 'function') {
            console.log('[makeChoice] startExpInterview 호출');
            startExpInterview(scene);
        } else {
            // expInterview가 없으면 바로 다음 장면으로
            proceedToNextScene();
        }
    } catch (e) { 
        console.error('makeChoice error:', e); 
        showNotification('오류가 발생했습니다'); 
    } 
}
function proceedToNextScene() { try { const currentData = window.currentStoryData || storyData; const state = appStore.getState(); if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) { showNotification('장면 데이터를 불러올 수 없습니다'); return } if (state.currentScene < currentData.scenes.length - 1) { appStore.setState({ currentScene: state.currentScene + 1 }); if (window.soundscape) window.soundscape.onSceneTransition(); renderScene() } else { showEndScreen() } } catch (e) { console.error('proceedToNextScene error:', e); showNotification('오류가 발생했습니다') } }
// expInterview.js에서 접근할 수 있도록 window에 노출
window.proceedToNextScene = proceedToNextScene;
function proceedToNextSceneLive() { try { const currentData = window.currentStoryData || storyData; const state = appStore.getState(); if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) { showNotification('장면 데이터를 불러올 수 없습니다'); return } if (state.currentScene < currentData.scenes.length - 1) { appStore.setState({ currentScene: state.currentScene + 1 }); simulateNarratorInput() } else { showEndScreen() } } catch (e) { console.error('proceedToNextSceneLive error:', e); showNotification('오류가 발생했습니다') } }
// ───── submitEmotion 리팩토링: 하위 함수들 ─────

/**
 * 감정 입력 수집 및 검증 (UIManager 사용)
 * @returns {Object} { reason, scene, currentData, anchorEmotions } 또는 null (실패 시)
 */
function collectEmotionInput() {
    // UIManager를 통한 입력 수집
    const reason = uiManager.collectEmotionInput();
    const state = appStore.getState();

    // userReasons 업데이트
    appStore.setState({ userReasons: [...state.userReasons, reason] });
    updateUserStats('interpretation', 1);

    // 모달 닫기 및 입력 필드 초기화 (UIManager 사용)
    uiManager.closeEmotionModal();

    // 장면 데이터 검증 (store에서 읽기)
    const currentData = window.currentStoryData || storyData;
    if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) {
        showNotification('장면 데이터를 불러올 수 없습니다');
        return null;
    }

    const scene = currentData.scenes[state.currentScene];

    // anchor_emotions 파싱
    let anchorEmotions = scene.anchor_emotions || null;
    if (anchorEmotions && typeof anchorEmotions === 'string') {
        try {
            anchorEmotions = JSON.parse(anchorEmotions);
        } catch (e) {
            console.warn('anchor_emotions 파싱 실패:', e);
            anchorEmotions = null;
        }
    }
    if (anchorEmotions && !Array.isArray(anchorEmotions)) {
        anchorEmotions = null;
    }

    return { reason, scene, currentData, anchorEmotions };
}

/**
 * 감정 분석 수행 (archive 모드일 때만)
 * @param {string} reason - 사용자 입력 이유
 * @param {Array} anchorEmotions - 앵커 감정 목록
 * @returns {Object} { userEmotionVector, reasonVector } 또는 null
 */
/**
 * 감정 분석 수행 (archive 모드일 때만)
 * @param {string} reason - 사용자 입력 이유
 * @param {Array} anchorEmotions - 앵커 감정 목록
 * @param {Object} scene - 현재 장면 객체
 * @returns {Object} { userEmotionVector, reasonVector } 또는 null
 */
// analyzeEmotionForArchive 함수는 expInterview 모듈로 대체됨

/**
 * ByeoriEngine.calculateStep() 호출만 수행
 * @param {Object} input - { userVector, originalVector, anchorEmotions }
 * @param {Object} context - { previousBucket, emotionHistory }
 * @returns {Object} 엔진 계산 결과
 */
function runEngineStep(input, context) {
    return byeoriEngine.calculateStep(input, context);
}

/**
 * 엔진 결과를 store에 적용 (상태 반영만)
 * @param {Object} engineResult - 엔진 계산 결과
 * @param {Object} userEmotionVector - 사용자 감정 벡터
 * @returns {Object} { sceneAlignment, newBucket, stateAfterUpdate }
 */
function applyEngineResult(engineResult, userEmotionVector) {
    const sceneAlignment = engineResult.alignment_score;
    const newBucket = engineResult.alignment_bucket;

    // 감정 히스토리 업데이트
    const dominantEmotion = getDominantEmotion(userEmotionVector);
    const currentState = appStore.getState();
    const updatedHistory = [...currentState.emotionHistory, dominantEmotion];
    if (updatedHistory.length > 10) {
        updatedHistory.shift();
    }
    appStore.setState({ emotionHistory: updatedHistory });

    // 정렬도 및 버킷 업데이트
    appStore.setState({
        currentAlignment: sceneAlignment,
        currentBucket: newBucket
    });

    // window.archiveSceneAlignments에 저장 (하위 호환성 유지)
    if (!window.archiveSceneAlignments) {
        window.archiveSceneAlignments = [];
    }
    const stateAfterUpdate = appStore.getState();
    window.archiveSceneAlignments[stateAfterUpdate.currentScene] = sceneAlignment;

    return { sceneAlignment, newBucket, stateAfterUpdate };
}

/**
 * UI 업데이트 (UIManager/Visualizer 호출)
 * @param {Object} state - 현재 store 상태
 * @param {Object} result - { sceneAlignment, newBucket, userEmotionVector }
 */
function updateUIAfterSubmit(state, result) {
    const { sceneAlignment, newBucket, userEmotionVector } = result;

    // 정렬도 표시 업데이트
    updateAlignmentDisplay();

    // 파동 렌더링
    renderArchiveEmotionWave(userEmotionVector);

    // 알림 표시
    showNotification(`장면 정렬도: ${(sceneAlignment * 100).toFixed(0)}%`);

    // 버킷 피드백
    console.log('=== 버킷 판정 ===');
    console.log('정렬도:', sceneAlignment);
    console.log('이전 버킷:', state.currentBucket);
    console.log('감정 히스토리:', state.emotionHistory);
    console.log('새 버킷:', newBucket);

    if (newBucket !== state.currentBucket) {
        showBucketFeedback(newBucket, sceneAlignment);
        // 사운드스케이프 버킷 전환
        if (window.soundscape) {
            window.soundscape.setBucket(newBucket);
        }
    }
}

/**
 * NetworkService를 통한 저장
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
 * 다음 장면으로 이동 또는 엔딩 화면 표시
 * @param {Object} currentData - 현재 메모리 데이터
 * @param {Object} scene - 현재 장면 객체
 */
async function proceedToNextSceneOrEnd(currentData, scene) {
    const finalState = appStore.getState();

    // NPC 대화 표시
    showNpcDialogue(getRandomDialogue(NPC_DIALOGUES.archive.choiceMade), 3000);

    // 1.5초 후 다음 장면으로 이동 또는 엔딩
    setTimeout(async () => {
        const nextState = appStore.getState();
        if (nextState.currentScene < currentData.scenes.length - 1) {
            // 다음 장면으로 이동
            appStore.setState({ currentScene: nextState.currentScene + 1 });
            if (nextState.currentMode === 'archive') {
                renderScene();
            } else {
                simulateNarratorInput();
            }
        } else {
            // 엔딩 화면 표시
            if (nextState.currentMode === 'archive') {
                const alignmentResult = await calculateAverageAlignment();
                showEndScreen(alignmentResult);
            } else {
                showEndScreen();
            }
        }
    }, 1500);
}

// submitEmotion 함수는 expInterview 모듈로 대체됨
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
    console.log('[엔딩] showEndScreen 호출:', { alignmentResult, forceEndScreen, currentMode: state.currentMode });
    try {
        stopAllAnimations();
        const liveContainerEl = document.getElementById('liveContainer');
        if (liveContainerEl) { liveContainerEl.classList.remove('active'); liveContainerEl.style.display = 'none' }
        const archiveContainerEl = document.getElementById('archiveContainer');
        if (archiveContainerEl) { archiveContainerEl.classList.remove('active'); archiveContainerEl.style.display = 'none' }
        const sceneViewerEl = document.getElementById('sceneViewer');
        if (sceneViewerEl) { sceneViewerEl.classList.remove('active'); sceneViewerEl.style.display = 'none' }

        // 아카이브 모드이고 forceEndScreen이 false면 비교 화면으로 이동
        const state = appStore.getState(); if (state.currentMode === 'archive' && !forceEndScreen) {
            console.log('[엔딩] 아카이브 모드 - 비교 화면으로 이동');
            if (!alignmentResult) {
                alignmentResult = await calculateAverageAlignment();
            }
            window.archiveAlignmentResult = alignmentResult;
            showComparisonView();
            return;
        }

        console.log('[엔딩] 엔딩 화면 표시 시작');
        let finalAlignment = state.currentAlignment;
        let isTrueEnding = false;
        if (alignmentResult) {
            finalAlignment = alignmentResult.averageAlignment;
            isTrueEnding = alignmentResult.isTrueEnding;
        } else if (state.currentMode === 'archive') {
            const calculated = await calculateAverageAlignment();
            finalAlignment = calculated.averageAlignment;
            isTrueEnding = calculated.isTrueEnding;
        }
        console.log('[엔딩] 정렬도 계산 완료:', { finalAlignment, isTrueEnding });

        const endScreenEl = document.getElementById('endScreen');
        if (endScreenEl) {
            endScreenEl.classList.add('active');
            endScreenEl.style.cssText = 'display:flex !important';
            console.log('[엔딩] 엔딩 화면 요소 표시됨');
        } else {
            console.error('[엔딩] endScreen 요소를 찾을 수 없습니다!');
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

        document.getElementById('yourChoice').textContent = yourChoice;
        document.getElementById('yourReason').textContent = '"' + lastReason + '"';
        document.getElementById('theirChoice').textContent = theirChoice;
        document.getElementById('theirReason').textContent = '"' + theirReason + '"';
        document.getElementById('finalAlignment').textContent = '감정 구조 정렬도: ' + finalAlignment.toFixed(2);

        if (isTrueEnding) {
            console.log('[엔딩] 트루엔딩 표시');
            const trueBadge = document.getElementById('trueEndingBadge');
            const normalBadge = document.getElementById('normalEndingBadge');
            const subtitle = document.getElementById('endSubtitle');
            if (trueBadge) trueBadge.classList.add('active');
            if (normalBadge) normalBadge.classList.remove('active');
            if (subtitle) subtitle.style.display = 'none';
            document.getElementById('endTitle').textContent = '음각에 닿다';
            document.getElementById('finalMessage').innerHTML = '<strong>트루엔딩에 도달했습니다.</strong><br><br>당신은 그 사람의 감정 구조에 거의 겹쳐졌습니다.<br>이 일치는 원본 지층에 깊게 새겨질 거예요.';
            const state = appStore.getState();
            const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);
            const modeState = appStore.getState(); if (memoryId && modeState.currentMode === 'archive') {
                const endButtons = document.querySelector('.end-buttons');
                if (endButtons) {
                    const existingOriginalBtn = endButtons.querySelector('.original-view-btn');
                    if (existingOriginalBtn) existingOriginalBtn.remove();
                    const originalButton = document.createElement('button');
                    originalButton.className = 'original-view-btn';
                    originalButton.textContent = '원본 기억 열람하기';
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
                    console.error('트루엔딩 쪽지 UI 로드 오류:', e);
                }
            }
        } else {
            console.log('[엔딩] 일반 엔딩 표시');
            const trueBadge = document.getElementById('trueEndingBadge');
            const normalBadge = document.getElementById('normalEndingBadge');
            const subtitle = document.getElementById('endSubtitle');
            if (trueBadge) trueBadge.classList.remove('active');
            if (normalBadge) normalBadge.classList.add('active');
            if (subtitle) {
                subtitle.style.display = 'block';
                subtitle.textContent = '다른 결로 느끼다';
            }
            document.getElementById('endTitle').textContent = 'ENDING';
            document.getElementById('finalMessage').innerHTML = '당신은 이 기억을 다른 방식으로 체험했습니다.<br>같은 장면, 다른 감정.<br>그것도 하나의 해석입니다.';
        }

        console.log('[엔딩] 지층 애니메이션 시작');
        startEndStrataAnimation();
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
        console.log('[엔딩] showEndScreen 완료');
    } catch (e) {
        console.error('[엔딩] showEndScreen 오류:', e);
    }
}
function startEndStrataAnimation() { const container = document.getElementById('endStrataContainer'); const messageEl = document.getElementById('endStrataMessage'); const contentEl = document.getElementById('endContent'); const animationEl = document.getElementById('endStrataAnimation'); if (!container || !messageEl || !contentEl || !animationEl) return; container.innerHTML = ''; const totalHeight = 400; const layerHeight = totalHeight / 6; const previousLayers = [{ emotion: 'fear', height: layerHeight }, { emotion: 'anger', height: layerHeight }, { emotion: 'shame', height: layerHeight }, { emotion: 'joy', height: layerHeight }]; let currentBottom = totalHeight; const originalLayer = document.createElement('div'); originalLayer.className = 'end-strata-layer end-strata-layer-original'; originalLayer.style.height = layerHeight * 2 + 'px'; originalLayer.style.bottom = (currentBottom - layerHeight * 2) + 'px'; container.appendChild(originalLayer); currentBottom -= layerHeight * 2; previousLayers.forEach((layer, idx) => { const layerEl = document.createElement('div'); layerEl.className = 'end-strata-layer end-strata-layer-interpretation ' + layer.emotion; layerEl.style.height = layer.height + 'px'; layerEl.style.bottom = (currentBottom - layer.height) + 'px'; layerEl.style.opacity = '0'; container.appendChild(layerEl); setTimeout(() => { layerEl.style.opacity = '1' }, 100 * idx); currentBottom -= layer.height }); const userEmotion = getUserDominantEmotion(); const newLayer = document.createElement('div'); newLayer.className = 'end-strata-layer end-strata-layer-new ' + userEmotion; newLayer.style.height = layerHeight + 'px'; newLayer.style.bottom = totalHeight + 'px'; container.appendChild(newLayer); setTimeout(() => { newLayer.style.transform = 'translateY(0)'; newLayer.style.opacity = '1'; messageEl.classList.add('visible') }, 500); setTimeout(() => { animationEl.style.transform = 'translate(-50%,-50%) scale(0.3)'; animationEl.style.top = '10%'; animationEl.style.transition = 'all 1s ease-out'; contentEl.style.opacity = '1' }, 1500) }
function getUserDominantEmotion() { const emotions = ['fear', 'sadness', 'guilt', 'anger', 'longing', 'isolation', 'numbness', 'moralPain']; const lastScene = window.currentStoryData?.scenes?.[window.currentStoryData.scenes.length - 1]; if (lastScene && lastScene.emotionDist) { const dist = lastScene.emotionDist; let max = 0, dominant = 'fear'; if ((dist.fear || 0) > max) { max = dist.fear; dominant = 'fear' } if ((dist.sadness || 0) > max) { max = dist.sadness; dominant = 'sadness' } if ((dist.guilt || 0) > max) { max = dist.guilt; dominant = 'guilt' } if ((dist.anger || 0) > max) { max = dist.anger; dominant = 'anger' } if ((dist.longing || 0) > max) { max = dist.longing; dominant = 'longing' } if ((dist.isolation || 0) > max) { max = dist.isolation; dominant = 'isolation' } if ((dist.numbness || 0) > max) { max = dist.numbness; dominant = 'numbness' } if ((dist.moralPain || 0) > max) { max = dist.moralPain; dominant = 'moralPain' } return dominant } return emotions[Math.floor(Math.random() * emotions.length)] }
function restart() { if (window.soundscape) window.soundscape.stop(); appStore.setState({ currentMode: null, currentRole: null, sessionCode: null, currentMemory: null, currentScene: 0, userChoices: [], userReasons: [], currentAlignment: 0, currentBucket: null, emotionHistory: [], liveSceneNum: 1, liveFragments: 0, liveMatches: 0 }); const endScreenEl = document.getElementById('endScreen'); if (endScreenEl) { endScreenEl.classList.remove('active'); endScreenEl.style.display = 'none' } const liveContainerEl = document.getElementById('liveContainer'); if (liveContainerEl) { liveContainerEl.classList.remove('active'); liveContainerEl.style.display = 'none' } const archiveContainerEl = document.getElementById('archiveContainer'); if (archiveContainerEl) { archiveContainerEl.classList.remove('active'); archiveContainerEl.style.display = 'none' } const memoryListEl = document.getElementById('memoryList'); if (memoryListEl) memoryListEl.style.display = 'grid'; const sceneViewerEl = document.getElementById('sceneViewer'); if (sceneViewerEl) { sceneViewerEl.classList.remove('active'); sceneViewerEl.style.display = 'none' } const introScreen = document.getElementById('introScreen'); if (introScreen) { introScreen.classList.remove('hidden'); introScreen.classList.add('visible'); introScreen.style.cssText = 'display:flex !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;z-index:2000 !important' } const narratorPanelEl = document.getElementById('narratorPanel'); if (narratorPanelEl) narratorPanelEl.classList.remove('active'); const experiencerPanelEl = document.getElementById('experiencerPanel'); if (experiencerPanelEl) experiencerPanelEl.classList.remove('active'); const interpretationTraceEl = document.getElementById('interpretationTrace'); if (interpretationTraceEl) interpretationTraceEl.style.display = 'none'; const liveSceneContentEl = document.getElementById('liveSceneContent'); if (liveSceneContentEl) liveSceneContentEl.textContent = '화자가 기억을 불러오고 있습니다...'; const feelingInput = document.getElementById('experiencerFeelingInput'); if (feelingInput) feelingInput.value = ''; const memoryTraceContent = document.getElementById('memoryTraceContent'); if (memoryTraceContent) memoryTraceContent.textContent = '—'; const liveAlignmentValueEl = document.getElementById('liveAlignmentValue'); if (liveAlignmentValueEl) { liveAlignmentValueEl.textContent = '0.00'; liveAlignmentValueEl.classList.remove('high') } const liveAlignmentFillEl = document.getElementById('liveAlignmentFill'); if (liveAlignmentFillEl) liveAlignmentFillEl.style.width = '0%'; const liveSceneNumEl = document.getElementById('liveSceneNum'); if (liveSceneNumEl) liveSceneNumEl.textContent = '1'; const liveFragmentsEl = document.getElementById('liveFragments'); if (liveFragmentsEl) liveFragmentsEl.textContent = '0'; const liveMatchesEl = document.getElementById('liveMatches'); if (liveMatchesEl) liveMatchesEl.textContent = '0'; const footer = document.querySelector('.footer'); if (footer) footer.classList.remove('visible') }
let pendingSaveAction = null;
function saveMemory() {
    console.log('saveMemory 호출:', { isLoggedIn, currentMode, currentRole, currentSessionId });
    if (!isLoggedIn) {
        if (confirm('로그인이 필요합니다. 로그인하시겠습니까?')) {
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
            console.log('showMemoryFateModal 호출');
            showMemoryFateModal();
        } else {
            proceedSaveMemory();
        }
    } else {
        proceedSaveMemory();
    }
}
function proceedSaveMemory() { const state = appStore.getState(); if (state.currentMode === 'live') { saveSessionRecord() } enterArchive() }
function goToIntro() { if (confirm('기억을 저장하지 않으면 기억이 사라집니다. 괜찮으신가요?')) { restart() } }
function showMemoryFateModal() {
    console.log('showMemoryFateModal 호출');
    const modalEl = document.getElementById('memoryFateModal');
    if (modalEl) {
        console.log('모달 요소 찾음, 표시 중');
        modalEl.classList.add('active');
        modalEl.style.cssText = 'display:flex !important;z-index:3000 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important';
        console.log('모달 표시 완료');
    } else {
        console.error('memoryFateModal 요소를 찾을 수 없습니다!');
    }
}
async function selectMemoryFate(fate) { const modalEl = document.getElementById('memoryFateModal'); if (modalEl) modalEl.classList.remove('active'); window.selectedMemoryFate = fate; const state = appStore.getState(); if (state.currentSessionId) { try { const result = await networkService.updateSessionMemoryFate(state.currentSessionId, fate); if (!result.ok) { console.error('Memory fate save error:', result.error) } else { console.log('Memory fate saved:', fate) } } catch (e) { console.error('Memory fate save error:', e) } } await saveLiveToArchive(fate); setTimeout(() => { proceedSaveMemory() }, 500) }
async function saveLiveToArchive(fate) { const state = appStore.getState(); if (!state.currentSessionId) { console.log('No session to save to archive'); return } try { const sessionResult = await networkService.getSessionById(state.currentSessionId); if (!sessionResult.ok || !sessionResult.data) { console.error('Session not found'); return } const sessionData = sessionResult.data; const scenesResult = await networkService.getLiveScenesBySessionId(state.currentSessionId); if (!scenesResult.ok || !scenesResult.data || scenesResult.data.length === 0) { console.log('No scenes to save'); return } const scenesData = scenesResult.data; const memoryCode = 'L-' + sessionData.session_code; const memoryTitle = '라이브 기억 #' + sessionData.session_code; const dilutionValue = fate === 'preserve' ? 100 : fate === 'dilute' ? 50 : 0; const memoryResult = await networkService.saveMemory({ code: memoryCode, title: memoryTitle, layers: 1, dilution: dilutionValue, is_public: true, source_type: 'live', source_session_id: state.currentSessionId, memory_fate: fate }); if (!memoryResult.ok || !memoryResult.data) { console.error('Memory insert error:', memoryResult.error); return } const newMemory = memoryResult.data; for (let i = 0; i < scenesData.length; i++) { const scene = scenesData[i]; const emotionVector = scene.emotion_vector || {}; const dominantEmotion = getDominantEmotion(emotionVector); const sceneResult = await networkService.saveScene({ memory_id: newMemory.id, scene_order: scene.scene_index || i + 1, text: scene.scene_text || '', scene_type: 'normal', echo_words: [], emotion_dist: emotionVector }); if (sceneResult.ok && sceneResult.data) { await networkService.saveChoice({ scene_id: sceneResult.data.id, choice_order: 0, text: scene.generated_emotion || '느껴진 감정', emotion: dominantEmotion, intensity: Math.round((scene.intensity || 0.5) * 10) }) } } console.log('Live session saved to archive'); showNotification('기억이 아카이브에 저장되었습니다') } catch (e) { console.error('saveLiveToArchive error:', e) } }
// getDominantEmotion과 getBucket은 /js/shared/math.js에서 import됨
const bucketDialogue = { HIGH: NPC_DIALOGUES.bucket.HIGH, MID: NPC_DIALOGUES.bucket.MID, LOW: NPC_DIALOGUES.bucket.LOW, FIXATED: NPC_DIALOGUES.bucket.FIXATED }; const bucketSystemMessage = { HIGH: "[ 동기화 안정 ]", MID: "[ 신호 불안정 ]", LOW: "[ 왜곡 감지 ]", FIXATED: "[ 루프 감지 ]" }; function showBucketFeedback(bucket, alignment) { if (bucket && bucketDialogue[bucket]) { showNpcDialogue(bucketDialogue[bucket], 4000) } if (bucket && bucketSystemMessage[bucket]) { showSystemMessage(bucketSystemMessage[bucket]) } } function showSystemMessage(message) { const systemMsgEl = document.getElementById('systemMessage'); if (systemMsgEl) { systemMsgEl.textContent = message; systemMsgEl.classList.add('visible'); setTimeout(() => { systemMsgEl.classList.remove('visible') }, 2000) } } async function getContaminationLevel(memoryId) { try { const result = await networkService.getContaminationLevel(memoryId); if (!result.ok) { console.error('오염도 계산 오류:', result.error); return 0 } const maxLayers = 100; const contamination = Math.min((result.data || 0) / maxLayers, 1.0); console.log('=== 오염도 계산 ==='); console.log('memory_id:', memoryId); console.log('plays 수:', result.data); console.log('오염도:', contamination); return contamination } catch (e) { console.error('getContaminationLevel error:', e); return 0 } } function getContaminationStage(contamination) { if (contamination >= 0.9) return 3; if (contamination >= 0.6) return 2; if (contamination >= 0.3) return 1; return 0 } async function getContaminationDirection(memoryId) { try { const result = await networkService.getPlaysMismatchTypes(memoryId); if (!result.ok) { console.error('오염 방향 결정 오류:', result.error); return 'default' } const plays = result.data || []; if (plays.length === 0) { console.log('=== 오염 방향 ==='); console.log('plays 데이터 없음, 기본값 사용'); return 'default' } const counts = { emotion_mismatch: 0, target_displacement: 0, attribution_mismatch: 0, void_mismatch: 0 }; plays.forEach(p => { if (p.mismatch_type && counts[p.mismatch_type] !== undefined) { counts[p.mismatch_type]++ } }); const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]; console.log('=== 오염 방향 ==='); console.log('미스매치 통계:', counts); console.log('지배적 타입:', dominant[0], `(${dominant[1]}회)`); return dominant[1] > 0 ? dominant[0] : 'default' } catch (e) { console.error('getContaminationDirection error:', e); return 'default' } } async function getContaminatedText(scene, stage, memoryId, direction = 'default') { if (stage === 0) return scene.text; const stageKey = `text_stage_${stage}_${direction}`; if (scene[stageKey]) { console.log(`Stage ${stage} (${direction}) 캐시 사용`); return scene[stageKey] } console.log(`Stage ${stage} (${direction}) AI 생성 중...`); const contaminatedText = await generateContaminatedText(scene.text, stage, direction); if (contaminatedText && scene.id) { try { const result = await networkService.updateScene(scene.id, { [stageKey]: contaminatedText }); if (result.ok) { console.log(`Stage ${stage} (${direction}) 캐시 저장 완료`) } else { console.warn('캐시 저장 실패:', result.error) } } catch (e) { console.error('캐시 저장 오류:', e) } } return contaminatedText || scene.text } async function generateContaminatedText(originalText, stage, direction = 'default') { try { const result = await networkService.invokeFunction('contaminate-text', { text: originalText, stage: stage, direction: direction }); if (!result.ok) { console.error('contaminate-text 함수 오류:', result.error); return originalText } if (result.data && result.data.contaminatedText) { return result.data.contaminatedText } return originalText } catch (e) { console.error('generateContaminatedText error:', e); return originalText } } async function loadSceneWithContamination(scene, memoryId) { const contamination = await getContaminationLevel(memoryId); const stage = getContaminationStage(contamination); const direction = await getContaminationDirection(memoryId); console.log('=== 오염 적용 ==='); console.log('오염도:', contamination); console.log('Stage:', stage); console.log('방향:', direction); const displayText = await getContaminatedText(scene, stage, memoryId, direction); return { ...scene, displayText, contaminationStage: stage, contaminationDirection: direction } }
function saveSessionRecord() { const state = appStore.getState(); if (!state.isLoggedIn || !state.currentUser) return; const user = state.currentUser; if (!user.sessionHistory) user.sessionHistory = []; const sessionRecord = { id: Date.now(), date: new Date().toLocaleString('ko-KR'), role: state.currentRole || '—', memoryFate: window.selectedMemoryFate || '—', alignment: state.currentAlignment.toFixed(2), scenes: state.liveSceneNum || state.currentScene + 1, fragments: state.liveFragments || 0, matches: state.liveMatches || 0 }; user.sessionHistory.unshift(sessionRecord); if (user.sessionHistory.length > 50) user.sessionHistory = user.sessionHistory.slice(0, 50); appStore.setState({ currentUser: user }) }
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
        // live_interpretations 테이블이 없으므로 interpretationsCount는 항상 0
        const interpretationsCount = 0;
        return { sessions: sessionIds.length, memories: memoriesCount, interpretations: interpretationsCount };
    } catch (e) {
        console.error('loadUserStatsFromDB error:', e);
        return { sessions: 0, memories: 0, interpretations: 0 };
    }
}
function renderSessionHistoryEmpty() { const listEl = document.getElementById('sessionHistoryList'); if (listEl) listEl.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">저장된 세션이 없습니다.</div>' }
function renderMyMemoriesEmpty() { const listEl = document.getElementById('myMemoriesList'); if (listEl) listEl.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">아직 공유한 기억이 없습니다.</div>' }
function renderSessionHistoryList(sessions) { const listEl = document.getElementById('sessionHistoryList'); if (!listEl) { return } if (!sessions || sessions.length === 0) { renderSessionHistoryEmpty(); return } listEl.innerHTML = ''; sessions.forEach(session => { const sessionItem = document.createElement('div'); sessionItem.style.padding = '.8rem'; sessionItem.style.marginBottom = '.5rem'; sessionItem.style.background = 'var(--bg-surface)'; sessionItem.style.border = '1px solid rgba(196,168,130,.1)'; sessionItem.style.borderRadius = '4px'; sessionItem.style.cursor = 'pointer'; sessionItem.style.transition = 'all .3s'; sessionItem.onmouseenter = () => { sessionItem.style.borderColor = 'var(--accent-memory)'; sessionItem.style.transform = 'translateX(4px)' }; sessionItem.onmouseleave = () => { sessionItem.style.borderColor = 'rgba(196,168,130,.1)'; sessionItem.style.transform = 'translateX(0)' }; const date = session.created_at ? new Date(session.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; const role = session.narrator_id === currentUser?.id ? '화자' : session.experiencer_id === currentUser?.id ? '체험자' : '—'; const status = session.ended_at ? '완료' : '진행중'; const alignment = session.alignment ? Math.round(session.alignment * 100) + '%' : '0%'; const fate = session.memory_fate === 'preserve' ? '보존' : session.memory_fate === 'dilute' ? '자연 소멸' : session.memory_fate === 'anonymous' ? '완전 익명' : '—'; sessionItem.innerHTML = `<div style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${date}</strong> <span style="color:var(--accent-memory);font-size:.75rem">[${session.session_code || '—'}]</span></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">역할: ${role} | 상태: ${status}<br>정렬도: ${alignment} | 운명: ${fate}</div>`; sessionItem.onclick = () => { showSessionDetail(session.id) }; listEl.appendChild(sessionItem) }) }
function renderMyMemoriesList(memories) { const listEl = document.getElementById('myMemoriesList'); if (!listEl) { return } if (!memories || memories.length === 0) { renderMyMemoriesEmpty(); return } listEl.innerHTML = ''; memories.forEach(memory => { const memoryItem = document.createElement('div'); memoryItem.style.padding = '.8rem'; memoryItem.style.marginBottom = '.5rem'; memoryItem.style.background = 'var(--bg-surface)'; memoryItem.style.border = '1px solid rgba(196,168,130,.1)'; memoryItem.style.borderRadius = '4px'; memoryItem.style.cursor = 'pointer'; const date = memory.created_at ? new Date(memory.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; const title = memory.title || memory.code || '무제'; const dilution = memory.dilution !== undefined ? memory.dilution + '%' : '—'; const fate = memory.memory_fate === 'preserve' ? '보존' : memory.memory_fate === 'dilute' ? '자연 소멸' : memory.memory_fate === 'anonymous' ? '완전 익명' : '—'; memoryItem.innerHTML = `<div style="font-size:.9rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${title}</strong></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">${date} | 희석도: ${dilution} | 운명: ${fate}</div>`; memoryItem.onclick = () => { closeMypage(); viewMemoryFromArchive(memory.id) }; listEl.appendChild(memoryItem) }) }
function updateMypageStats(stats) { document.getElementById('displayMemories').textContent = stats.memories || 0; document.getElementById('displayInterpretations').textContent = stats.interpretations || 0 }
// 트루엔딩 쪽지 UI 표시
function showTrueEndingNoteUI(authorNote, authorId, memoryId) { const endContent = document.getElementById('endContent'); if (!endContent) return; const endButtons = endContent.querySelector('.end-buttons'); if (!endButtons) return; const existingNoteSection = endContent.querySelector('.note-section'); if (existingNoteSection) existingNoteSection.remove(); const noteSection = document.createElement('div'); noteSection.className = 'note-section'; noteSection.innerHTML = (authorNote ? `<div class="author-note-box"><p class="note-label">체험자가 남긴 쪽지</p><p class="note-content">${authorNote}</p></div>` : '') + `<div class="reply-section"><p class="reply-label">기억을 남긴 사람에게 한 마디를 남길 수 있습니다</p><textarea class="reply-input" id="replyInput" maxlength="100" placeholder="100자 이내로 작성해주세요..."></textarea><div class="reply-counter"><span id="replyCount">0</span>/100</div><div class="reply-buttons"><button class="reply-submit-btn" id="replySubmitBtn">쪽지 보내기</button><button class="reply-skip-btn" id="replySkipBtn">건너뛰기</button></div></div>`; endContent.insertBefore(noteSection, endButtons); const replyInput = document.getElementById('replyInput'); const replyCount = document.getElementById('replyCount'); if (replyInput && replyCount) { replyInput.addEventListener('input', () => { replyCount.textContent = replyInput.value.length }) } const replySubmitBtn = document.getElementById('replySubmitBtn'); if (replySubmitBtn) { replySubmitBtn.addEventListener('click', async () => { const message = replyInput.value.trim(); if (!message) { alert('메시지를 입력해주세요.'); return } const safetyResult = detectCrisis(message); if (safetyResult.level === 'high') { handleCrisis('high', replyInput); return } await sendNoteToAuthor(authorId, memoryId, message) }) } const replySkipBtn = document.getElementById('replySkipBtn'); if (replySkipBtn) { replySkipBtn.addEventListener('click', () => { noteSection.remove() }) } }
// 기억을 남긴 사람에게 쪽지 전송
async function sendNoteToAuthor(authorId, memoryId, message) { try { const client = networkService.getClient(); if (!client) { alert('Supabase 클라이언트가 초기화되지 않았습니다.'); return } const { data: { user } } = await client.auth.getUser(); if (!user) { alert('쪽지를 보내려면 로그인이 필요합니다.'); return } const result = await networkService.sendNote({ memory_id: memoryId, sender_id: user.id, recipient_id: authorId, message: message, note_type: 'player_to_author' }); if (!result.ok) { console.error('쪽지 전송 오류:', result.error); alert('쪽지 전송에 실패했습니다.'); return } const noteSection = document.querySelector('.note-section'); if (noteSection) { noteSection.innerHTML = '<div class="note-sent-message"><p>기억을 남긴 사람에게 전달되었습니다.</p></div>' } console.log('=== 쪽지 전송 완료 ===') } catch (e) { console.error('sendNoteToAuthor error:', e); alert('쪽지 전송 중 오류가 발생했습니다.') } }
// 받은 쪽지 로드
async function loadReceivedNotes() { try { const client = networkService.getClient(); if (!client) return []; const { data: { user } } = await client.auth.getUser(); if (!user) return []; const result = await networkService.loadReceivedNotes(user.id); if (!result.ok) { console.error('쪽지 로드 오류:', result.error); return [] } return result.data || [] } catch (e) { console.error('loadReceivedNotes error:', e); return [] } }
// 받은 쪽지 렌더링
async function renderReceivedNotes() { const notes = await loadReceivedNotes(); const container = document.getElementById('mypageNotesList'); if (!container) return; if (notes.length === 0) { container.innerHTML = '<p class="no-notes" style="color:var(--text-ghost);font-style:italic;text-align:center;padding:1rem">받은 쪽지가 없습니다.</p>'; return } container.innerHTML = notes.map(note => { const memoryTitle = note.memories?.title || '알 수 없음'; const date = new Date(note.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }); const unreadClass = note.is_read ? 'read' : 'unread'; const unreadBadge = note.is_read ? '' : '<span class="unread-badge" style="display:inline-block;padding:.2rem .5rem;background:rgba(212,175,55,.2);border:1px solid rgba(212,175,55,.4);color:#d4af37;font-size:.7rem;letter-spacing:.1em;margin-left:.5rem">NEW</span>'; return `<div class="note-card ${unreadClass}" data-note-id="${note.id}" style="padding:.8rem;margin-bottom:.5rem;background:var(--bg-surface);border:1px solid rgba(196,168,130,.1);border-radius:4px;cursor:pointer;transition:all .3s"><p class="note-memory" style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>기억: ${memoryTitle}</strong>${unreadBadge}</p><p class="note-message" style="font-size:.9rem;color:var(--text-primary);line-height:1.6;margin-bottom:.5rem">${note.message}</p><p class="note-date" style="font-size:.75rem;color:var(--text-muted)">${date}</p></div>` }).join(''); container.querySelectorAll('.note-card.unread').forEach(card => { card.addEventListener('click', async () => { const noteId = card.dataset.noteId; try { const result = await networkService.markNoteAsRead(noteId); if (result.ok) { card.classList.remove('unread'); card.classList.add('read'); const badge = card.querySelector('.unread-badge'); if (badge) badge.remove() } } catch (e) { console.error('쪽지 읽음 처리 오류:', e) } }) }) }
function viewMemoryFromArchive(memoryId) { enterArchive(); setTimeout(() => { const state = appStore.getState(); const memoryIndex = state.allMemoriesData.findIndex(m => m.id === memoryId); if (memoryIndex >= 0) { selectMemory(memoryIndex) } }, 500) }
async function showSessionDetail(sessionId) { const modal = document.getElementById('sessionDetailModal'); const body = document.getElementById('sessionDetailBody'); if (!modal || !body) { return } modal.classList.add('active'); body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">불러오는 중...</div>'; try { const sessionResult = await networkService.getSessionById(sessionId); if (!sessionResult.ok) throw sessionResult.error; const sessionData = sessionResult.data; const scenesResult = await networkService.getLiveScenesBySessionId(sessionId); if (!scenesResult.ok) throw scenesResult.error; const scenesData = scenesResult.data; const date = sessionData.created_at ? new Date(sessionData.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; const endDate = sessionData.ended_at ? new Date(sessionData.ended_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; const role = sessionData.narrator_id === currentUser?.id ? '화자' : sessionData.experiencer_id === currentUser?.id ? '체험자' : '—'; const status = sessionData.ended_at ? '완료' : '진행중'; const alignment = sessionData.alignment ? Math.round(sessionData.alignment * 100) + '%' : '0%'; const fate = sessionData.memory_fate === 'preserve' ? '보존' : sessionData.memory_fate === 'dilute' ? '자연 소멸' : sessionData.memory_fate === 'anonymous' ? '완전 익명' : '미정'; document.getElementById('sessionDetailTitle').textContent = sessionData.session_code || '세션 정보'; let scenesHtml = ''; if (scenesData && scenesData.length > 0) { scenesHtml = '<div class="session-detail-scenes"><h3 style="font-family:\'Cormorant Garamond\',serif;font-size:1.3rem;color:var(--accent-memory);margin-bottom:1rem;letter-spacing:.1em">장면 목록</h3>'; scenesData.forEach((scene, index) => { const sceneText = scene.text || '[텍스트 없음]'; const sceneType = scene.scene_type || 'normal'; const voidInfo = scene.void_info; scenesHtml += `<div class="session-detail-scene-item"><div class="session-detail-scene-header">장면 ${index + 1}${sceneType === 'void' ? ' (기억의 공백)' : ''}</div><div class="session-detail-scene-text">${sceneText}</div>${voidInfo && voidInfo.reason ? `<div style="font-size:.85rem;color:var(--text-muted);font-style:italic;margin-top:.5rem">공백 이유: ${voidInfo.reason}</div>` : ''}</div>` }); scenesHtml += '</div>' } else { scenesHtml = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-style:italic">저장된 장면이 없습니다.</div>' } body.innerHTML = `<div class="session-detail-info-item"><div class="session-detail-info-label">세션 코드</div><div class="session-detail-info-value">${sessionData.session_code || '—'}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">시작일시</div><div class="session-detail-info-value">${date}</div></div>${sessionData.ended_at ? `<div class="session-detail-info-item"><div class="session-detail-info-label">종료일시</div><div class="session-detail-info-value">${endDate}</div></div>` : ''}<div class="session-detail-info-item"><div class="session-detail-info-label">역할</div><div class="session-detail-info-value">${role}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">상태</div><div class="session-detail-info-value">${status}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">정렬도</div><div class="session-detail-info-value">${alignment}</div></div><div class="session-detail-info-item"><div class="session-detail-info-label">운명</div><div class="session-detail-info-value">${fate}</div></div>${scenesHtml}` } catch (e) { console.error('showSessionDetail error:', e); body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">세션 정보를 불러오는 중 오류가 발생했습니다.</div>'; showNotification('세션 정보를 불러오는 중 오류가 발생했습니다') } }
function closeSessionDetail() { const modal = document.getElementById('sessionDetailModal'); if (modal) { modal.classList.remove('active') } }
function renderSessionHistory_DEPRECATED() { const listEl = document.getElementById('sessionHistoryList'); if (!listEl || !currentUser || !currentUser.sessionHistory || currentUser.sessionHistory.length === 0) { if (listEl) listEl.innerHTML = '<div class="mypage-info" style="color:var(--text-ghost);font-style:italic">저장된 세션이 없습니다.</div>'; return } listEl.innerHTML = ''; currentUser.sessionHistory.forEach(session => { const sessionItem = document.createElement('div'); sessionItem.style.padding = '.8rem'; sessionItem.style.marginBottom = '.5rem'; sessionItem.style.background = 'var(--bg-surface)'; sessionItem.style.border = '1px solid rgba(196,168,130,.1)'; sessionItem.innerHTML = `<div style="font-size:.85rem;color:var(--text-primary);margin-bottom:.3rem"><strong>${session.date}</strong></div><div style="font-size:.75rem;color:var(--text-muted);line-height:1.6">역할: ${session.role} | 운명: ${session.memoryFate === 'preserve' ? '보존' : session.memoryFate === 'dilute' ? '자연 소멸' : session.memoryFate === 'anonymous' ? '완전 익명' : '—'}<br>정렬도: ${session.alignment} | 장면: ${session.scenes} | 조각: ${session.fragments} | 일치: ${session.matches}</div>`; listEl.appendChild(sessionItem) }) }
function showNpcDialogue(text, duration = 4000) { const dialogue = document.getElementById('npcDialogue'); if (dialogue) { document.getElementById('npcText').textContent = text; dialogue.classList.add('visible'); setTimeout(() => { dialogue.classList.remove('visible') }, duration) } }
function escapeHtml(text) { if (!text) return '—'; const div = document.createElement('div'); div.textContent = text; return div.innerHTML } async function showOriginalMemory(memoryId) { try { console.log('=== 원본 열람 ==='); console.log('Memory ID:', memoryId); const scenesResult = await networkService.getScenesByMemoryId(memoryId); if (!scenesResult.ok) { console.error('원본 기억 로드 오류:', scenesResult.error); alert('원본 기억을 불러오는 중 오류가 발생했습니다.'); return } const scenes = scenesResult.data || []; console.log('Scenes:', scenes.length); const modal = document.createElement('div'); modal.className = 'original-memory-modal'; modal.innerHTML = `<div class="original-memory-content"><h2>원본 기억</h2><p class="original-note">이것이 기록자가 남긴 원래의 기억입니다.</p><div class="original-scenes">${scenes.map((scene, i) => `<div class="original-scene"><span class="scene-number">${i + 1}</span><p class="scene-text">${escapeHtml(scene.text)}</p></div>`).join('')}</div><button class="close-original-btn" onclick="this.closest('.original-memory-modal').remove()">닫기</button></div>`; document.body.appendChild(modal); modal.addEventListener('click', (e) => { if (e.target === modal) { modal.remove() } }) } catch (e) { console.error('showOriginalMemory error:', e); alert('원본 기억을 불러오는 중 오류가 발생했습니다.') } }
function showNotification(text) { const notification = document.getElementById('notification'); if (notification) { notification.textContent = text; notification.classList.add('visible'); setTimeout(() => { notification.classList.remove('visible') }, 3000) } }
// 이벤트 바인딩은 bindEvents.js로 이동됨
function typeText(element, text, callback) { let index = 0; element.textContent = ''; element.classList.add('typing'); function typeChar() { if (index < text.length) { element.textContent += text.charAt(index); index++; setTimeout(typeChar, 50) } else { element.classList.remove('typing'); if (callback) callback() } } typeChar() }
function typeTextAsync(element, text, speed = 80) { return new Promise(resolve => { element.classList.add('typing'); let i = 0; element.textContent = ''; const timer = setInterval(() => { if (i < text.length) { element.textContent += text.charAt(i); i++ } else { clearInterval(timer); element.classList.remove('typing'); resolve() } }, speed) }) }
function typeDots(element, callback) { element.textContent = '\n'; element.classList.add('typing'); let dotCount = 0; function addDot() { if (dotCount < 3) { element.textContent += '.'; dotCount++; setTimeout(addDot, 300) } else { element.classList.remove('typing'); if (callback) callback() } } addDot() }
async function playNpcIntro() { const centerWrapper = document.querySelector('.intro-center-wrapper'); const dialogue = document.getElementById('npcIntroDialogue'); if (!centerWrapper || !dialogue) return; await new Promise(r => setTimeout(r, 2000)); centerWrapper.classList.add('lifted'); await new Promise(r => setTimeout(r, 1000)); dialogue.classList.add('visible'); await typeTextAsync(dialogue, NPC_DIALOGUES.intro.firstVisit, 100); await new Promise(r => setTimeout(r, 1500)); dialogue.textContent = ''; await typeTextAsync(dialogue, NPC_DIALOGUES.intro.returning, 80); await new Promise(r => setTimeout(r, 2000)); dialogue.classList.remove('visible'); await new Promise(r => setTimeout(r, 500)); centerWrapper.classList.remove('lifted') }
let openingSkipped = false; let openingWaveAnimationId = null; let openingMouseX = -100; let openingMouseY = -100; let hasZoomedIn = false; let openingSequenceStarted = false; let openingSound = null; let fadeOutAnimationId = null; let fadeOutInterval = null; let crossfadeTimeUpdateHandler = null; let crossfadeEndedHandler = null;
function fadeInSound(audio, targetVolume = 0.6, duration = 4000) { if (!audio) { console.error('fadeInSound: audio 요소가 없습니다'); return } audio.volume = 0; const playPromise = audio.play(); if (playPromise !== undefined) { playPromise.then(() => { console.log('오프닝 사운드 재생 시작'); const steps = 60; const step = targetVolume / steps; const interval = duration / steps; let currentStep = 0; const fade = setInterval(() => { currentStep++; if (currentStep < steps) { audio.volume = Math.min(1, Math.max(0, Math.min(step * currentStep, targetVolume))) } else { audio.volume = Math.min(1, Math.max(0, targetVolume)); clearInterval(fade) } }, interval) }).catch(e => { console.error('오프닝 사운드 재생 실패:', e); console.error('오디오 상태:', { readyState: audio.readyState, networkState: audio.networkState, error: audio.error }) }) } }
function fadeOutSound(audio, duration = 3000) { if (!audio) return; if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } if (crossfadeTimeUpdateHandler && audio) { audio.removeEventListener('timeupdate', crossfadeTimeUpdateHandler); crossfadeTimeUpdateHandler = null } if (crossfadeEndedHandler && audio) { audio.removeEventListener('ended', crossfadeEndedHandler); crossfadeEndedHandler = null } const startVolume = Math.max(audio.volume || 0, 0.01); if (startVolume <= 0) { audio.pause(); audio.currentTime = 0; return } if (audio.paused) { audio.play().catch(() => { }) } const startTime = performance.now(); let lastVolume = startVolume; let pauseCheckInterval = setInterval(() => { if (audio && audio.paused && lastVolume > 0.01) { audio.play().catch(() => { }) } }, 50); function animateFadeOut(currentTime) { if (!audio) { if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } if (pauseCheckInterval) { clearInterval(pauseCheckInterval); pauseCheckInterval = null } return } if (audio.paused && lastVolume > 0.01) { audio.play().catch(() => { }) } const elapsed = currentTime - startTime; const progress = Math.min(elapsed / duration, 1); const newVolume = Math.max(startVolume * (1 - progress), 0); lastVolume = newVolume; try { if (audio) { audio.volume = Math.min(1, Math.max(0.001, Math.max(newVolume, 0.001))) } } catch (e) { console.error('Volume update error:', e) } if (progress >= 1 || newVolume <= 0.01) { if (pauseCheckInterval) { clearInterval(pauseCheckInterval); pauseCheckInterval = null } setTimeout(() => { try { if (audio) { audio.volume = 0; audio.pause(); audio.currentTime = 0 } } catch (e) { console.error('Audio pause error:', e) } if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } }, 200) } else { fadeOutAnimationId = requestAnimationFrame(animateFadeOut) } } fadeOutAnimationId = requestAnimationFrame(animateFadeOut) }
function setupLoopWithCrossfade(audio, targetVolume = 0.6, fadeDuration = 2) { if (!audio) return; if (crossfadeTimeUpdateHandler) { audio.removeEventListener('timeupdate', crossfadeTimeUpdateHandler) } if (crossfadeEndedHandler) { audio.removeEventListener('ended', crossfadeEndedHandler) } crossfadeTimeUpdateHandler = function () { if (fadeOutInterval) return; const timeLeft = audio.duration - audio.currentTime; if (timeLeft <= fadeDuration && timeLeft > 0) { audio.volume = Math.min(1, Math.max(0, targetVolume * (timeLeft / fadeDuration))) } }; crossfadeEndedHandler = function () { if (fadeOutInterval) return; audio.currentTime = 0; fadeInSound(audio, targetVolume, fadeDuration * 1000) }; audio.addEventListener('timeupdate', crossfadeTimeUpdateHandler); audio.addEventListener('ended', crossfadeEndedHandler) }
function skipToIntro() { openingSequenceStarted = true; skipOpening() }
function showContinueButton() { if (openingSkipped) return; const startHint = document.getElementById('openingStartHint'); if (startHint) { startHint.style.opacity = ''; startHint.classList.add('visible') } }
function showFourthText(dialogue) { if (openingSkipped) return; typeText(dialogue, '\n들어와.', function () { if (openingSkipped) return; setTimeout(showContinueButton, 500) }) }
function showThirdText(dialogue) { if (openingSkipped) return; typeDots(dialogue, function () { if (openingSkipped) return; setTimeout(function () { showFourthText(dialogue) }, 1200) }) }
function showSecondText(dialogue) { if (openingSkipped) return; typeText(dialogue, '\n...기억을 찾으러 왔다고?', function () { if (openingSkipped) return; setTimeout(function () { showThirdText(dialogue) }, 1200) }) }
function showFirstTextPart1(dialogue) { if (openingSkipped) return; typeText(dialogue, '\n안녕.', function () { if (openingSkipped) return; setTimeout(function () { showFirstTextPart2(dialogue) }, 1500) }) }
function showFirstTextPart2(dialogue) { if (openingSkipped) return; typeText(dialogue, '\n왔구나. 오랜만이야.', function () { if (openingSkipped) return; setTimeout(function () { showSecondText(dialogue) }, 1200) }) }
function startOpeningWaveAnimation(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    // 커서 호버 효과를 위한 이벤트 리스너
    canvas.addEventListener('mousemove', function (e) {
        const rect = canvas.getBoundingClientRect();
        // ctx.scale(2, 2)로 스케일링되어 있으므로, 그리기 좌표계는 canvas.width/2 범위
        // 따라서 마우스 위치도 그에 맞게 변환 (스케일링된 좌표계 기준)
        openingMouseX = (e.clientX - rect.left) * (canvas.width / 2 / rect.width);
        openingMouseY = (e.clientY - rect.top) * (canvas.height / 2 / rect.height);
    });
    canvas.addEventListener('mouseleave', function () {
        openingMouseX = -100;
        openingMouseY = -100;
    });

    const width = canvas.width / 2;
    const height = canvas.height / 2;
    
    // 캔버스 높이에 비례하여 최대 진폭 제한 (잘림 방지)
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
        // 잔상 효과 (화면 배경색과 동일: #0a0a0c)
        ctx.fillStyle = 'rgba(10, 10, 12, 0.92)';
        ctx.fillRect(0, 0, width, height);

        const centerY = height / 2;

        waves.forEach((wave) => {
            ctx.beginPath();
            ctx.lineWidth = 1.2;

            for (let x = 0; x < width; x++) {
                // 기본 파동 계산
                const baseY = centerY
                    + Math.sin(x * wave.freq + time * wave.speed + wave.phase) * wave.amplitude
                    + Math.sin(x * wave.freq * 0.5 + time * wave.speed * 0.6 + wave.phase * 1.4) * (wave.amplitude * 0.4)
                    + Math.sin(x * wave.freq * 2.3 + time * wave.speed * 1.3) * (wave.amplitude * 0.15)
                    + Math.sin(x * wave.freq * 0.3 + time * wave.speed * 0.4 + wave.phase * 2.1) * (wave.amplitude * 0.25)
                    + Math.sin(x * wave.freq * 3.7 + time * wave.speed * 1.8 + wave.phase * 0.7) * (wave.amplitude * 0.1);

                // 불규칙성을 위한 노이즈 (위치와 시간에 따라 변하는)
                const noise = Math.sin(x * 0.003 + time * 0.02) * Math.cos(x * 0.007 + time * 0.015) * wave.noiseScale;
                const irregularOffset = wave.amplitude * noise * 0.4;

                // 커서 호버 효과: 커서 위치에서 파동을 밀어내는 느낌 (드라마틱하게)
                let hoverPush = 0;
                if (openingMouseX >= 0 && openingMouseY >= 0) {
                    const distX = Math.abs(x - openingMouseX);
                    const distY = Math.abs(baseY - openingMouseY);
                    const dist = Math.sqrt(distX * distX + distY * distY);
                    
                    // 더 넓은 영향력 반경과 부드러운 감쇠 곡선
                    const influenceRadius = 200;
                    const normalizedDist = Math.min(dist / influenceRadius, 1);
                    // 부드러운 easing 함수 (ease-out cubic)로 더 드라마틱한 반응
                    const influence = Math.pow(1 - normalizedDist, 3);
                    
                    if (influence > 0) {
                        // 커서 Y 위치 방향으로 파동을 강하게 밀어내기
                        const pushDirection = openingMouseY - baseY;
                        // X 거리에 따른 영향력 (더 부드러운 감쇠)
                        const xNormalized = Math.min(distX / influenceRadius, 1);
                        const xInfluence = Math.pow(1 - xNormalized, 2);
                        
                        // 더 강한 푸시 효과
                        hoverPush = pushDirection * influence * xInfluence * 1.8;
                        
                        // 커서 주변에서 큰 진폭 증가 (손을 대는 느낌을 강조)
                        const amplitudeBoost = influence * 0.8;
                        hoverPush += (baseY - centerY) * amplitudeBoost;
                        
                        // 추가: 커서 위치에서 파동이 더 크게 퍼지는 효과
                        const rippleEffect = Math.sin(distX * 0.05) * influence * 15;
                        hoverPush += rippleEffect;
                    }
                }

                const y = baseY + irregularOffset + hoverPush;
                
                // Y 좌표가 캔버스 범위를 벗어나지 않도록 제한
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
function handleOpeningKeydown(e) { if (!openingSkipped) { e.preventDefault(); skipOpening() } }
function finishOpeningSequence() { const openingScreen = document.getElementById('openingScreen'); const introScreen = document.getElementById('introScreen'); if (openingScreen) { openingScreen.removeEventListener('click', skipOpening); openingScreen.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important'; openingScreen.classList.add('hidden') } document.removeEventListener('keydown', handleOpeningKeydown); if (introScreen) { introScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2000 !important'; introScreen.classList.add('visible'); introScreen.classList.remove('hidden') } playNpcIntro() }
// 오프닝 화면 이벤트 바인딩은 bindEvents.js로 이동됨
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
                joinDate: new Date(session.user.created_at).toLocaleDateString('ko-KR'),
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

    // 초기 위치 설정
    updateCarouselPosition();

    // 네비게이션 버튼 이벤트
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateCarousel(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateCarousel(1));
    }

    // 키보드 네비게이션
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

    // 아이템 클릭 이벤트
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

    // 양옆 아이템 클릭으로도 이동 가능
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

    // 액션 실행
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

// 전역 스코프에 함수 노출 (onclick 속성에서 사용하기 위해)
window.openPortfolio = openPortfolio;
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
// window.submitEmotion은 expInterview 모듈로 대체됨
window.selectMemoryFate = selectMemoryFate;
window.closeSessionDetail = closeSessionDetail;
window.sendChatMessage = sendChatMessage;
window.selectMemory = selectMemory;
window.handleConfirm = handleConfirm;
window.handleExpConfirm = handleExpConfirm;
window.filterMemories = filterMemories;
let comparisonScenes = [];
let comparisonCurrentIndex = 0;
async function calculateAverageAlignment() {
    try {
        const currentData = window.currentStoryData || storyData;
        if (!currentData || !currentData.scenes) {
            return { averageAlignment: 0, isTrueEnding: false };
        }
        const state = appStore.getState();
        const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);
        if (!memoryId) {
            return { averageAlignment: 0, isTrueEnding: false };
        }
        const sceneAlignments = [];
        supabaseClient = getSupabaseClient();
        for (let i = 0; i < currentData.scenes.length; i++) {
            const scene = currentData.scenes[i];
            if (scene.sceneType === 'branch' || scene.sceneType === 'ending') {
                let alignment = null;
                if (window.archiveSceneAlignments && window.archiveSceneAlignments[i] !== undefined) {
                    alignment = window.archiveSceneAlignments[i];
                } else if (scene.id) {
                    const playResult = await networkService.getPlayBySceneAndMemory(scene.id, memoryId);
                    if (playResult.ok && playResult.data) {
                        const playData = playResult.data;
                        if (playData.alignment !== null && playData.alignment !== undefined) {
                            alignment = playData.alignment;
                        } else if (playData.user_emotion && scene.originalEmotion) {
                            const anchorEmotions = scene.anchor_emotions || null;
                            const engineResult = byeoriEngine.calculateStep({
                                userVector: { base: playData.user_emotion },
                                originalVector: { base: scene.originalEmotion },
                                anchorEmotions: anchorEmotions
                            }, {});
                            alignment = engineResult.alignment_score;
                        }
                    } else if (window.archiveUserEmotions && window.archiveUserEmotions[i] && scene.originalEmotion) {
                        const anchorEmotions = scene.anchor_emotions || null;
                        const engineResult = byeoriEngine.calculateStep({
                            userVector: { base: window.archiveUserEmotions[i].emotion },
                            originalVector: { base: scene.originalEmotion },
                            anchorEmotions: anchorEmotions
                        }, {});
                        alignment = engineResult.alignment_score;
                    }
                } else if (window.archiveUserEmotions && window.archiveUserEmotions[i] && scene.originalEmotion) {
                    const anchorEmotions = scene.anchor_emotions || null;
                    const engineResult = byeoriEngine.calculateStep({
                        userVector: { base: window.archiveUserEmotions[i].emotion },
                        originalVector: { base: scene.originalEmotion },
                        anchorEmotions: anchorEmotions
                    }, {});
                    alignment = engineResult.alignment_score;
                }
                if (alignment !== null && alignment !== undefined) {
                    sceneAlignments.push(alignment);
                }
            }
        }
        if (sceneAlignments.length === 0) {
            return { averageAlignment: 0, isTrueEnding: false };
        }
        const averageAlignment = sceneAlignments.reduce((sum, val) => sum + val, 0) / sceneAlignments.length;
        const isTrueEnding = averageAlignment >= 0.65;
        console.log('평균 정렬도 계산:', { sceneAlignments, averageAlignment, isTrueEnding });
        return { averageAlignment, isTrueEnding };
    } catch (e) {
        console.error('calculateAverageAlignment error:', e);
        return { averageAlignment: 0, isTrueEnding: false };
    }
}
async function showComparisonView() {
    try {
        const currentData = window.currentStoryData || storyData;
        if (!currentData || !currentData.scenes) {
            console.error('비교 화면: 장면 데이터가 없습니다');
            return;
        }
        const state = appStore.getState();
        const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);
        if (!memoryId) {
            console.error('비교 화면: memory_id를 찾을 수 없습니다');
            return;
        }
        // expInterview 사용 시 모든 장면에서 파동 측정되므로, 모든 장면 확인
        const scenesWithEmotions = currentData.scenes.filter((scene, index) =>
            window.archiveUserEmotions && window.archiveUserEmotions[index]
        );
        if (scenesWithEmotions.length === 0) {
            console.log('비교 화면: 비교할 장면이 없습니다');
            const alignmentResult = await calculateAverageAlignment();
            showEndScreen(alignmentResult);
            return;
        }
        comparisonScenes = [];
        supabaseClient = getSupabaseClient();
        for (let i = 0; i < currentData.scenes.length; i++) {
            const scene = currentData.scenes[i];
            // expInterview 사용 시 모든 장면에서 파동 측정되므로, 모든 장면 확인
            const userEmotionData = window.archiveUserEmotions && window.archiveUserEmotions[i] ? window.archiveUserEmotions[i] : null;
            if (userEmotionData) {
                let playData = null;
                let sceneAlignment = null;
                
                // expInterview로 수집한 최신 정렬도 우선 사용
                if (window.archiveSceneAlignments && window.archiveSceneAlignments[i] !== undefined) {
                    sceneAlignment = window.archiveSceneAlignments[i];
                    console.log(`[비교 화면] Scene ${i}: expInterview 정렬도 사용:`, sceneAlignment);
                }
                
                // DB에서 plays 데이터 조회 (fallback용, expInterview 데이터가 없을 때만)
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
                        console.warn(`[비교 화면] Scene ${scene.id} plays 조회 실패:`, playsError);
                    }
                    if (playsData) {
                        playData = playsData;
                        // expInterview 정렬도가 없을 때만 DB 정렬도 사용
                        if (sceneAlignment === null) {
                            sceneAlignment = playsData.alignment;
                        }
                    }
                }
                
                if (!playData && !userEmotionData) {
                    console.log(`[비교 화면] Scene ${i} (${scene.id}): plays 데이터와 archiveUserEmotions 모두 없음, 스킵`);
                    continue;
                }
                // expInterview로 수집한 최신 데이터 우선 사용
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
            console.log('비교 화면: 비교할 장면이 없습니다');
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
        // 세션종료 버튼에 이벤트 리스너 추가
        const endSessionBtn = comparisonViewEl.querySelector('.live-exit-btn');
        if (endSessionBtn) {
            // 기존 이벤트 제거 후 새로 추가
            endSessionBtn.replaceWith(endSessionBtn.cloneNode(true));
            const newEndSessionBtn = comparisonViewEl.querySelector('.live-exit-btn');
            newEndSessionBtn.addEventListener('click', async () => {
                console.log('[엔딩] 세션종료 버튼 클릭됨');
                await endComparisonSession();
            });
            console.log('[엔딩] 세션종료 버튼 이벤트 리스너 추가됨');
        } else {
            console.warn('[엔딩] 세션종료 버튼을 찾을 수 없습니다');
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
        const slide = document.createElement('div');
        slide.className = 'comparison-scene-slide';
        slide.innerHTML = `
            <div class="comparison-scene-text">${item.scene.text || ''}</div>
            <div class="comparison-waves-container">
                <div class="comparison-wave-item">
                    <div class="comparison-wave-label user">체험자 (B)의 감정</div>
                    <div class="comparison-wave-canvas-container">
                        <canvas class="comparison-wave-canvas" data-type="user" data-index="${index}"></canvas>
                        <div class="comparison-tooltip">${item.userReason || '이유 없음'}</div>
                    </div>
                </div>
                <div class="comparison-wave-item comparison-wave-item-original">
                    <div class="comparison-wave-label original">원본 (A)의 감정</div>
                    <div class="comparison-wave-canvas-container">
                        <canvas class="comparison-wave-canvas" data-type="original" data-index="${index}"></canvas>
                        <div class="comparison-tooltip">${item.originalReason || '이유 없음'}</div>
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
    console.log('[renderComparisonWaves] 시작, comparisonScenes:', comparisonScenes);

    // 계산은 index.js에서 수행 (Visualizer는 숫자만 받음)
    const scenesWithWaveStyles = comparisonScenes.map(item => ({
        userEmotion: item.userEmotion,
        originalEmotion: item.originalEmotion,
        userWaveStyle: item.userEmotion ? emotionVectorToWaveStyle(item.userEmotion) : null,
        originalWaveStyle: item.originalEmotion ? emotionVectorToWaveStyle(item.originalEmotion) : null
    }));

    visualizer.renderComparisonWaves(scenesWithWaveStyles);
    updateComparisonAlignment();
    updateComparisonAverageAlignment();
}
function updateComparisonAlignment() {
    if (comparisonScenes.length === 0 || comparisonCurrentIndex >= comparisonScenes.length) {
        console.warn('[updateComparisonAlignment] 비교 장면이 없습니다');
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
        console.log(`[updateComparisonAlignment] 저장된 정렬도 사용: ${alignment}`);
    } else if (item.userEmotion && item.originalEmotion) {
        console.log(`[updateComparisonAlignment] 정렬도 계산 시작...`);
        let anchorEmotions = item.scene?.anchor_emotions || null;
        if (anchorEmotions && typeof anchorEmotions === 'string') { try { anchorEmotions = JSON.parse(anchorEmotions) } catch (e) { anchorEmotions = null } } if (anchorEmotions && !Array.isArray(anchorEmotions)) { anchorEmotions = null }
        const engineResult = byeoriEngine.calculateStep({
            userVector: { base: item.userEmotion },
            originalVector: { base: item.originalEmotion },
            anchorEmotions: anchorEmotions
        }, {});
        alignment = engineResult.alignment_score;
        console.log(`[updateComparisonAlignment] 계산된 정렬도: ${alignment}`);
    } else {
        console.warn(`[updateComparisonAlignment] 정렬도를 계산할 수 없습니다:`, {
            hasUserEmotion: !!item.userEmotion,
            hasOriginalEmotion: !!item.originalEmotion
        });
    }
    if (alignment === null) {
        console.warn('[updateComparisonAlignment] 정렬도가 null입니다');
        return;
    }
    const alignmentValueEl = document.getElementById('comparisonAlignmentValue');
    const alignmentFillEl = document.getElementById('comparisonAlignmentFill');
    if (alignmentValueEl) {
        alignmentValueEl.textContent = alignment.toFixed(2);
        console.log(`[updateComparisonAlignment] 정렬도 표시 업데이트: ${alignment.toFixed(2)}`);
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
function closeComparisonView() {
    visualizer.stopComparisonWaveAnimation();
    const comparisonViewEl = document.getElementById('comparisonView');
    if (comparisonViewEl) {
        comparisonViewEl.style.display = 'none';
    }
    const alignmentResult = window.archiveAlignmentResult || { averageAlignment: 0, isTrueEnding: false };
    showEndScreen(alignmentResult);
}
async function endComparisonSession() {
    console.log('[엔딩] endComparisonSession 호출됨');
    try {
        visualizer.stopComparisonWaveAnimation();
        const comparisonViewEl = document.getElementById('comparisonView');
        if (comparisonViewEl) {
            comparisonViewEl.style.display = 'none';
            comparisonViewEl.style.zIndex = '-1';
        }
        // 정렬도 결과가 없으면 계산
        let alignmentResult = window.archiveAlignmentResult;
        if (!alignmentResult) {
            console.log('[엔딩] 정렬도 계산 중...');
            alignmentResult = await calculateAverageAlignment();
            window.archiveAlignmentResult = alignmentResult;
            console.log('[엔딩] 정렬도 계산 완료:', alignmentResult);
        } else {
            console.log('[엔딩] 기존 정렬도 사용:', alignmentResult);
        }
        
        // Strata 3D 지층 뷰 표시
        const currentData = window.currentStoryData || storyData;
        const state = appStore.getState();
        const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);

        console.log('[엔딩] Strata 뷰 체크:', {
            memoryId: memoryId,
            hasShowStrataView: typeof window.showStrataView === 'function',
            currentData: currentData,
            currentMemory: state.currentMemory,
            allMemoriesDataLength: state.allMemoriesData.length
        });

        if (memoryId && typeof window.showStrataView === 'function') {
            console.log('[엔딩] Strata 뷰 표시 시작:', memoryId);
            try {
                await window.showStrataView(memoryId, alignmentResult, () => {
                    console.log('[엔딩] Strata 뷰 닫힘, 엔딩 화면으로 이동');
                    showEndScreen(alignmentResult, true);
                });
                console.log('[엔딩] Strata 뷰 표시 완료');
            } catch (strataError) {
                console.error('[엔딩] Strata 뷰 표시 중 오류:', strataError);
                await showEndScreen(alignmentResult, true);
            }
        } else {
            if (!memoryId) {
                console.warn('[엔딩] memoryId를 찾을 수 없습니다. currentData:', currentData);
            }
            if (typeof window.showStrataView !== 'function') {
                console.warn('[엔딩] window.showStrataView가 정의되지 않았습니다. strataView.js가 로드되었는지 확인하세요.');
            }
            console.log('[엔딩] Strata 뷰 사용 불가, 바로 엔딩 화면으로 이동');
            await showEndScreen(alignmentResult, true);
        }
    } catch (e) {
        console.error('[엔딩] endComparisonSession 오류:', e);
        showEndScreen(null, true);
    }
}
window.navigateComparison = navigateComparison;
window.closeComparisonView = closeComparisonView;
window.endComparisonSession = endComparisonSession;

// ───── 기억 등록 시스템 ─────
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

const memoryCollectionSystemPrompt = `당신은 "또다른 나"입니다. 사용자의 기억을 수집하는 역할입니다.

목표: 한 장면에 대해 다음 정보를 자연스러운 대화로 수집
- 장면 텍스트 (무슨 일이 있었는지)
- 선택지 (그때 할 수 있었던 선택들)
- 감정 (어떤 감정을 느꼈는지)
- 이유 (왜 그렇게 느꼈는지)

대화 규칙:
1. 한 번에 하나만 물어보세요
2. 공감하면서 부드럽게 질문하세요
3. 충분한 정보가 모이면 [SCENE_COMPLETE] 태그를 응답 끝에 추가하세요
4. 정보가 부족하면 추가 질문하세요

예시 흐름:
- "그날의 기억을 말해줘"
- (사용자 응답)
- "그때 어떤 선택을 할 수 있었어?"
- (사용자 응답)
- "그 순간 어떤 감정이 들었어?"
- (사용자 응답)
- "왜 그렇게 느꼈던 것 같아?"
- (사용자 응답)
- "알겠어. 이 기억을 정리해볼게. [SCENE_COMPLETE]"

수집된 정보는 JSON으로 정리:
{
  "text": "장면 설명",
  "choices": ["선택지1", "선택지2"],
  "emotion": "주요 감정",
  "reason": "이유"
}`;

function startMemoryRegistration() {
    console.log('=== 기억 등록 시작 ===');
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

    // Confession Hub로 돌아가기
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

    console.log('=== 기억 등록 입력 ===');
    console.log('사용자 입력:', userInput);

    memoryRegistrationState.conversationHistory.push({
        role: 'user',
        content: userInput
    });

    try {
        supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
            showNotification('Supabase 클라이언트가 없습니다');
            return;
        }

        // Supabase URL과 anon key 가져오기
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('./lib/config.js');
        const supabaseUrl = SUPABASE_URL || 'https://bxmppaxpzbkwebfbgpsm.supabase.co';

        // 세션 토큰 가져오기 (없어도 anon key로 동작)
        let authToken = '';
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            authToken = session?.access_token || '';
        } catch (e) {
            console.warn('세션 가져오기 실패, anon key만 사용:', e);
        }

        console.log('collect-memory 스트리밍 호출 시작:', {
            conversationLength: memoryRegistrationState.conversationHistory.length,
            systemPrompt: memoryCollectionSystemPrompt.substring(0, 50) + '...',
            hasAuthToken: !!authToken
        });

        // 스트리밍 요청 (인증 토큰이 없으면 anon key만 사용)
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
            console.error('collect-memory 함수 오류:', errorData);

            if (response.status === 0 || errorData.error?.includes('CORS')) {
                showNotification('Edge Function이 배포되지 않았거나 CORS 설정에 문제가 있습니다. collect-memory 함수를 배포해주세요.');
            } else {
                showNotification('대화 처리 중 오류가 발생했습니다: ' + (errorData.error || '알 수 없는 오류'));
            }
            return;
        }

        // 스트리밍 응답 읽기
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            showNotification('스트리밍 응답을 읽을 수 없습니다');
            return;
        }

        let accumulatedText = '';
        let buffer = '';
        let finalData = null;

        // NPC 대화 영역 초기화
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
                            // 텍스트 추가
                            accumulatedText += data.text;

                            // 실시간으로 표시 (단어 단위로 자연스럽게)
                            if (dialogueEl) {
                                dialogueEl.textContent = accumulatedText;

                                // 스크롤을 맨 아래로
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
                            console.error('스트리밍 오류:', data.error);
                            showNotification('스트리밍 중 오류가 발생했습니다: ' + (data.error || '알 수 없는 오류'));
                            return;
                        }
                    } catch (e) {
                        // JSON 파싱 오류 무시
                    }
                }
            }
        }

        // 최종 응답 처리
        if (finalData && finalData.reply) {
            // 최종 텍스트로 업데이트 (누락된 부분이 있을 수 있음)
            if (dialogueEl) {
                dialogueEl.textContent = finalData.reply;
            }

            memoryRegistrationState.conversationHistory.push({
                role: 'assistant',
                content: finalData.reply
            });
        }

        if (finalData && finalData.sceneComplete && finalData.extractedScene) {
            console.log('장면 완성:', finalData.extractedScene);
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
        showNotification('입력 처리 중 오류가 발생했습니다: ' + (e.message || '알 수 없는 오류'));
    }
}

function parseEmotionFromText(emotionText) {
    const emotionMap = {
        'fear': ['무서움', '두려움', '공포'],
        'sadness': ['슬픔', '우울', '비애'],
        'anger': ['분노', '화', '열받음'],
        'joy': ['기쁨', '행복', '즐거움'],
        'longing': ['그리움', '그리워', '보고싶음'],
        'guilt': ['죄책감', '미안', '죄송']
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
    console.log('=== 장면 확인 화면 표시 ===');
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
    console.log('=== 장면 확정 ===');
    const scene = collectReviewFormData();

    if (!scene.text || scene.text.length === 0) {
        showNotification('장면 텍스트를 입력해주세요');
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
        countEl.textContent = `장면 ${count}개 수집됨`;
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
        showNotification('최소 1개 이상의 장면이 필요합니다.');
        return;
    }

    const title = prompt('이 기억의 제목을 입력하세요:');
    if (!title || !title.trim()) {
        return;
    }

    memory.title = title.trim();

    try {
        await saveMemoryToDB(memory);
        showNotification('기억이 등록되었습니다!');
        closeRegistrationScreen();

        const state = appStore.getState();
        if (state.currentMode === 'archive') {
            await loadMemoriesFromSupabase();
            sortMemories('all');
        }
    } catch (e) {
        console.error('finishRegistration error:', e);
        showNotification('기억 등록 중 오류가 발생했습니다');
    }
}

/**
 * 메모리를 DB에 저장 (MemoryService 래퍼)
 * @param {Object} memory - 메모리 객체 { title, scenes: [...] }
 * @throws {Error} 저장 실패 시 에러
 */
async function saveMemoryToDB(memory) {
    const state = appStore.getState();
    const curator_id = state.currentUser?.id || null;

    const result = await MemoryService.saveMemory({ memory, curator_id });

    if (!result.ok) {
        throw result.error || new Error('메모리 저장 실패');
    }

    return result.data;
}

// 메모리 등록 및 The Confession 이벤트 바인딩은 bindEvents.js로 이동됨

window.startMemoryRegistration = startMemoryRegistration;
window.startOpeningWaveAnimation = startOpeningWaveAnimation;
window.handleOpeningKeydown = handleOpeningKeydown;

// ───── The Confession ─────

// The Confession 상태 관리
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

// 감각 칩 데이터
// ===== Confession Flow V2: Chip Data =====
const CHIP_DATA = {
    smell: [
        { label: '비릿한 물 냄새', key: 'rain_heavy' },
        { label: '매캐한 먼지', key: 'dust' },
        { label: '소독약 냄새', key: 'hospital' },
        { label: '풀 냄새', key: 'grass' },
        { label: '아무것도', key: 'nothing', void: true },
    ],
    sound: [
        { label: '빗소리', key: 'rain' },
        { label: '적막', key: 'silence' },
        { label: '웅성거림', key: 'crowd' },
        { label: '바람 소리', key: 'wind' },
        { label: '아무것도', key: 'nothing', void: true },
    ],
    touch: [
        { label: '차가운 공기', key: 'cold_air' },
        { label: '축축한 땀', key: 'sweat' },
        { label: '누군가의 손', key: 'someones_hand' },
        { label: '단단한 바닥', key: 'hard_floor' },
        { label: '아무것도', key: 'nothing', void: true },
    ],
    anchor_context: [
        { label: '원래 있었어', key: 'always_there' },
        { label: '누가 놓았어', key: 'someone_placed' },
        { label: '모르겠어', key: 'unknown' },
        { label: '말하고 싶지 않아', key: 'void', void: true },
    ],
    action_attribution: [
        { label: '내가 선택했어', key: 'my_choice' },
        { label: '어쩔 수 없었어', key: 'no_choice' },
        { label: '모르겠어', key: 'unknown' },
    ],
    crash_body: [
        { label: '가슴이 조였다', key: 'chest_tight' },
        { label: '숨이 멎었다', key: 'breathless' },
        { label: '손이 떨렸다', key: 'trembling' },
        { label: '눈물이 났다', key: 'tears' },
        { label: '아무것도 느끼지 못했다', key: 'nothing', void: true },
    ],
    crash_emotion: [
        { label: '죄책감', key: 'guilt' },
        { label: '두려움', key: 'fear' },
        { label: '분노', key: 'anger' },
        { label: '슬픔', key: 'sadness' },
        { label: '수치심', key: 'shame' },
        { label: '그리움', key: 'longing' },
        { label: '안도', key: 'relief' },
        { label: '혼란', key: 'confusion' },
        { label: '허탈', key: 'emptiness' },
        { label: '경외', key: 'awe' },
        { label: '이상한 기쁨', key: 'strange_joy' },
        { label: '무감각', key: 'numbness', void: true },
    ],
    crash_target: [
        { label: '나 자신', key: 'self' },
        { label: '그 사람', key: 'other' },
        { label: '그 상황', key: 'situation' },
        { label: '모르겠어', key: 'unknown' },
    ],
    seal_relation: [
        { label: '아직 아픈 것', key: 'still_hurts' },
        { label: '이제 괜찮은 것', key: 'okay_now' },
        { label: '아직 모르는 것', key: 'dont_know' },
        { label: '다시 보고 싶지 않은 것', key: 'never_again', void: true },
    ],
};

// ===== Label Maps =====
const BODY_LABELS = {
    chest_tight: '가슴이 조였구나',
    breathless: '숨이 멎었구나',
    trembling: '손이 떨렸구나',
    tears: '눈물이 났구나',
    nothing: '아무것도 느끼지 못했구나',
};

const EMOTION_LABELS = {
    guilt: '죄책감', fear: '두려움', anger: '분노',
    sadness: '슬픔', shame: '수치심', longing: '그리움',
    relief: '안도', confusion: '혼란', emptiness: '허탈',
    awe: '경외', strange_joy: '이상한 기쁨', numbness: '무감각',
};

// ===== Confession Flow V2: Flow Definition =====
const CONFESSION_FLOW = [
    // ── Step 1: Sensory Priming ──
    {
        id: 'smell', step: 1,
        question: '눈을 감아.\n그 장소에 서 있어.\n무슨 냄새가 나?',
        type: 'chips', chipsKey: 'smell', dataPath: 'sensory.smell',
    },
    {
        id: 'sound', step: 1,
        question: (d) => {
            const smellLabel = CHIP_DATA.smell.find(c => c.key === d.sensory.smell)?.label || '';
            return d.sensory.smell === 'nothing'
                ? '냄새는 없어.\n대신 무슨 소리가 들려?'
                : `${smellLabel} 속에\n무슨 소리가 들려?`;
        },
        type: 'chips', chipsKey: 'sound', dataPath: 'sensory.sound',
    },
    {
        id: 'touch', step: 1,
        question: '피부에 뭐가 닿아?',
        type: 'chips', chipsKey: 'touch', dataPath: 'sensory.touch',
    },
    // ── Step 2: Anchoring ──
    {
        id: 'anchor_object', step: 2,
        question: '그 공간에서 네 시선이 머무는 곳이 있어.\n뭘 보고 있어?',
        type: 'text', placeholder: '보이는 것', dataPath: 'anchor.object',
    },
    {
        id: 'anchor_context', step: 2,
        question: (d) => `${d.anchor.object}.\n그게 왜 거기 있어?`,
        type: 'chips', chipsKey: 'anchor_context', dataPath: 'anchor.context',
    },
    // ── Step 3: The Action ──
    {
        id: 'action_what', step: 3,
        question: '그 장소에서 넌 뭘 했어?',
        type: 'text', placeholder: '...', dataPath: 'action.what',
    },
    {
        id: 'action_attribution', step: 3,
        question: (d) => `${d.action.what}.\n그건 네 선택이었어, 아니면 어쩔 수 없었어?`,
        type: 'chips', chipsKey: 'action_attribution', dataPath: 'action.attribution',
    },
    // ── Step 4: The Crash ──
    {
        id: 'crash_event', step: 4,
        question: '그리고 무슨 일이 일어났어?',
        type: 'textarea', placeholder: '천천히, 생각나는 대로...', dataPath: 'crash.event',
    },
    {
        id: 'crash_body', step: 4,
        question: '그때 네 몸에서 뭐가 일어났어?',
        type: 'chips', chipsKey: 'crash_body', dataPath: 'crash.bodyFeel',
    },
    {
        id: 'crash_emotion', step: 4,
        question: (d) => {
            const bodyText = BODY_LABELS[d.crash.bodyFeel] || '';
            return `${bodyText}.\n그건 어떤 감정이었을까?\n(두 개까지 고를 수 있어)`;
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
                return '그 무감각은...\n뭘 느끼지 않으려는 거야?';
            }
            const labels = emotions.map(e => EMOTION_LABELS[e] || e).join('과 ');
            return `그 ${labels}은...\n누구를 향한 거야?`;
        },
        type: 'chips', chipsKey: 'crash_target', dataPath: 'crash.target',
    },
    // ── Step 5: The Seal ──
    {
        id: 'seal_relation', step: 5,
        question: '이 기억에서 나와.\n문을 닫아.\n\n돌아보면, 이 기억은 지금 너한테 뭐야?',
        type: 'chips', chipsKey: 'seal_relation', dataPath: 'seal.relation',
    },
    {
        id: 'seal_word', step: 5,
        question: '마지막으로.\n이 기억을 한 단어로.',
        type: 'text', placeholder: '단 하나의 단어', dataPath: 'seal.word',
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
        confirmBtn.textContent = '확인';

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
        <p class="flow-complete-text">기억이 수집되었습니다.</p>
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
        // V3 플로우 사용 (window.startV3Flow는 confessionV3.js에서 등록)
        if (typeof window.startV3Flow === 'function') {
            window.startV3Flow();
        } else {
            startFlow(); // V3 미로드 시 기존 플로우 폴백
        }
    }
}

// V3 completeV3()에서 호출할 장면 생성 브릿지
window._v3GenerateScene = function(flowData) {
    // flowState.data를 V3가 만든 데이터로 교체
    flowState.data = flowData;
    // 기존 장면 생성 플로우 실행
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

// 타이핑 엔진 (한 글자씩 출력)
// 각 element별로 타이머를 추적하여 중복 호출 방지
const typeWriterTimers = new WeakMap();

function typeWriter(element, text, speed = 50, callback) {
    if (!element) return;

    // 이전 타이머가 있으면 취소
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

            // 문장 부호 뒤에는 딜레이
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

// initStep1~5 함수들은 V2 flow로 대체됨 (renderPrompt 사용)

// 안전 리소스 팝업 표시
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
            <button class="safety-close-btn">닫기</button>
        </div>
    `;

    document.body.appendChild(popup);

    popup.querySelector('.safety-close-btn').addEventListener('click', () => {
        popup.remove();
    });
}

// NPC 대화 표시 (Confession용)
function showConfessionNPCDialogue(text) {
    const dialogueEl = document.querySelector('.confession-text');
    if (dialogueEl) {
        dialogueEl.textContent = text;
    }
}

// 위기 감지 시 처리
function handleCrisis(level, inputElement) {
    console.log('=== 안전 시스템 ===');
    console.log('감지 레벨:', level);

    if (level === 'high') {
        // 입력 마스킹
        if (inputElement) {
            inputElement.value = '■'.repeat(inputElement.value.length);
            inputElement.disabled = true;
        }

        // 위기 대사 출력
        const dialogue = getRandomDialogue(CRISIS_DIALOGUES);
        showConfessionNPCDialogue(dialogue);

        // 안전 리소스 표시
        setTimeout(() => showSafetyResources(), 1500);

        return false; // AI 전송 차단
    }

    if (level === 'mid') {
        // 경고 대사만 출력, 전송은 허용
        const dialogue = getRandomDialogue(CRISIS_DIALOGUES);
        showConfessionNPCDialogue(dialogue);

        return true; // AI 전송 허용
    }

    return true;
}

// 입력 제출 시 안전 체크
function checkSafetyBeforeSubmit(inputValue, inputElement) {
    const result = detectCrisis(inputValue);

    console.log('=== 안전 시스템 ===');
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

// setupConfessionListeners 함수는 bindEvents.js로 이동됨

// 스트리밍 AI 응답 함수
// V2: 5장면 생성 (JSON 응답)
async function generateScenesFromRitual(inputData) {
    // 인증 토큰 가져오기 (generate-scene-from-ritual은 로그인 필수)
    const { getAccessToken } = await import('./lib/supabaseClient.js');
    const accessToken = await getAccessToken();
    if (!accessToken) {
        throw new Error('기억을 생성하려면 로그인이 필요합니다.');
    }

    // V2: flowData가 있으면 그대로 사용, 없으면 inputData를 flowData로 간주
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
        console.error('[V2] API 오류 응답:', errorText);
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch (e) {
            errorData = { error: errorText };
        }
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    console.log('[V2] API 응답 데이터:', responseData);
    
    if (responseData.error) {
        console.error('[V2] 응답에 에러 포함:', responseData.error);
        throw new Error(responseData.error);
    }

    // V2 응답 형식: { scenes: [...], originalVector: {...}, flowData: {...} }
    return responseData;
}

// 하위 호환: 기존 스트리밍 방식 (레거시)
// streamAIResponse() 삭제됨 (V2에서는 스트리밍 없음)

// ritualData를 flowData로 변환 (V2 구조)
function convertRitualDataToFlowData(ritualData) {
    // V2 flowData 구조로 변환
    // 누락된 필드는 기본값 또는 추론값 사용
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
    
    console.log('[V2] ritualData → flowData 변환:', flowData);
    return flowData;
}

// AI 장면 생성 (V2: 5장면)
async function generateSceneFromRitual() {
    const flowData = flowState.data;
    
    // 클라이언트 벡터 추출
    const clientVector = extractOriginalVector(flowData);
    const voidFlags = extractVoidFlags(flowData);
    
    console.log('[V2] generateSceneFromRitual 시작');
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
            throw new Error('flowData가 완전하지 않습니다. 모든 질문에 답변해주세요.');
        }

        console.log('[V2] 전송할 flowData:', JSON.stringify(flowData, null, 2));

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
            console.error('[V2] Edge Function 오류 응답:', errorText);
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
        
        console.log('[V2] API 응답:', result);
        console.log('Client vector:', clientVector);
        console.log('Server vector:', result.originalVector);
        
        // confessionState에 저장
        confessionState.generatedScenes = result.scenes;
        confessionState.originalVector = result.originalVector;
        confessionState.flowData = result.flowData;
        confessionState.sealWord = result.sealWord;
        confessionState.generatedScene = result; // 하위 호환
        
        // 결과 화면 렌더링
        renderSceneResult(result);
    } catch (error) {
        console.error('[V2] 장면 생성 오류:', error);
        const flowEl = document.getElementById('confessionFlow');
        if (flowEl) {
            const errorEl = document.createElement('div');
            errorEl.className = 'flow-complete';
            errorEl.innerHTML = `
                <p class="flow-complete-text" style="color: #ff6b6b;">기억 현상에 실패했습니다: ${error.message || '알 수 없는 오류'}</p>
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
        <p class="flow-complete-text">기억이 현상되었습니다.</p>
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

// 지층에 묻기 (DB 저장)
async function saveAndBury() {
    await saveConfessionToDB();
}

// DB 저장 (V2: 5장면 구조)
async function saveConfessionToDB() {
    const title = prompt('이 기억의 제목을 입력하세요:');
    if (!title || !title.trim()) return;

    try {
        // V2: generatedScenes 사용 (없으면 하위 호환)
        const scenes = confessionState.generatedScenes || confessionState.scenes || [];
        
        if (scenes.length === 0) {
            throw new Error('저장할 장면이 없습니다. 먼저 기억을 현상해주세요.');
        }

        supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
            throw new Error('Supabase 클라이언트가 없습니다');
        }

        const { saveMemoryGraph } = await import('./lib/repo.js');
        const state = appStore.getState();

        // V2: originalVector와 함께 저장
        // V3: confessionV3Data 포함
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
                // TEM 오염: 장면 생성 시 또는 Admin 재생성으로 채워짐
                text_stage_1: scene.text_stage_1 || null,
                text_stage_2: scene.text_stage_2 || null,
                text_stage_3: scene.text_stage_3 || null,
            }))
        });

        console.log('[Memory] V2 기억 저장 완료:', memoryId);
        alert('기억이 지층에 묻혔습니다.');
        endConfession();

        // Archive 모드면 목록 새로고침
        if (state.currentMode === 'archive') {
            await loadMemoriesFromSupabase();
            sortMemories('all');
        }

    } catch (error) {
        console.error('저장 오류:', error);
        alert('저장에 실패했습니다: ' + (error.message || '알 수 없는 오류'));
    }
}

window.startConfession = startConfession;
window.endConfession = endConfession;
window.generateSceneFromRitual = generateSceneFromRitual;
window.saveAndBury = saveAndBury;

// ───── Confession Hub ─────

// Confession Hub 표시
function showConfessionHub() {
    console.log('=== Confession Hub 표시 ===');
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

    // ASCII Door 초기화
    cancelAnimationFrame(doorRaf);
    setTimeout(() => initDoor(), 100);
}

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
  const hint = document.getElementById('doorHint');
  const screen = document.getElementById('doorScreen');

  if (title) { title.classList.remove('visible', 'hiding'); }
  if (subtitle) { subtitle.classList.remove('visible', 'hiding'); }
  if (backBtn) { backBtn.classList.remove('visible', 'hiding'); }
  if (hint) { hint.classList.remove('hiding'); }
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

  const hint = document.getElementById('doorHint');
  if (hint) hint.classList.add('hiding');

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

// Beginner 모드 시작 (기존 Create Memory 플로우)
function startBeginner() {
    console.log('=== Confession Hub ===');
    console.log('Mode: beginner');
    hideAllScreens();
    startConfessionFlow('beginner');
}

// Ritual 모드 시작 (기존 Live 화자 플로우, 소켓 제거)
function startRitual() {
    console.log('=== Confession Hub ===');
    console.log('Mode: ritual');
    hideAllScreens();
    startRitualFlow();
}

// The Architect 잠금 메시지
function showArchitectLocked() {
    alert('준비 중입니다. 곧 공개됩니다.');
}

// 메인 메뉴로 돌아가기
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

// 모든 화면 숨기기 헬퍼 함수
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

// Confession 플로우 시작 (Beginner 모드용)
function startConfessionFlow(mode) {
    appStore.setState({ currentMode: mode });
    startConfession(); // 기존 startConfession 함수 호출
}

// Ritual 플로우 시작 (소켓 제거 버전)
let currentSceneIndex = 0;
let ritualScenes = [];

async function startRitualFlow() {
    console.log('=== Ritual Flow 시작 ===');
    appStore.setState({ currentMode: 'ritual', currentRole: 'A' });
    const state = appStore.getState();
    currentSceneIndex = 0;
    ritualScenes = [];

    // 모든 화면 숨기기
    hideAllScreens();

    // Live 화자 화면 표시 (소켓 없이)
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

        // UI 초기화
        const sceneContent = document.querySelector('#generatedSceneContent .generated-text');
        if (sceneContent) sceneContent.textContent = '';

        const emotionContent = document.querySelector('#generatedEmotionContent .generated-text');
        if (emotionContent) emotionContent.textContent = '';

        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '<div class="chat-message ai"><div class="chat-message-label">또다른 나</div><div class="chat-message-content">기억을 이야기해줘. 천천히, 편하게.</div></div>';
        }

        const editBtn = document.querySelector('.edit-toggle-btn');
        if (editBtn) {
            editBtn.textContent = '수정';
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

        // Live Container 표시
        const liveContainerEl = document.getElementById('liveContainer');
        if (liveContainerEl) {
            liveContainerEl.classList.add('active');
            liveContainerEl.style.cssText = 'display:block !important';
        }

        const liveContentEl = document.querySelector('.live-content');
        if (liveContentEl) {
            liveContentEl.classList.add('narrator-mode');
        }

        // Narrator Panel 활성화
        const narratorPanelEl = document.getElementById('narratorPanel');
        if (narratorPanelEl) {
            narratorPanelEl.classList.add('active');
        }

        const interpretationTrace = document.getElementById('interpretationTrace');
        const traceContent = document.getElementById('traceContent');
        if (interpretationTrace && traceContent) {
            interpretationTrace.style.display = 'block';
            traceContent.textContent = '5개의 장면을 생성하세요. 각 장면을 입력하고 저장하면 다음 장면으로 넘어갑니다.';
        }

        showNpcDialogue("당신의 기억을 불러오세요. 5개의 장면을 직접 구성합니다.", 4000);

        const narratorCanvas = document.getElementById('alignmentWaveCanvas');
        const experiencerCanvas = document.getElementById('expAlignmentWaveCanvas');
        const state = appStore.getState();

        // 계산은 index.js에서 수행 (Visualizer는 숫자만 받음)
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

        console.log('Ritual 모드 Live 화자 화면 표시 완료');
    } catch (e) {
        console.error('startRitualFlow error:', e);
        showNotification('Ritual 모드를 시작하는 중 오류가 발생했습니다: ' + e.message);
    }
}

// Ritual 장면 저장 (소켓 대신 로컬 저장)
async function saveRitualScene(sceneData) {
    console.log('=== Ritual 장면 저장 ===');
    console.log('sceneData:', JSON.stringify(sceneData));

    ritualScenes.push(sceneData);
    console.log(`Ritual 장면 저장됨: ${ritualScenes.length}/5`);

    // UI 업데이트
    const traceContent = document.getElementById('traceContent');
    if (traceContent) {
        traceContent.textContent = `장면 ${ritualScenes.length}/5 저장됨. ${ritualScenes.length < 5 ? '다음 장면을 입력하세요.' : '모든 장면이 저장되었습니다.'}`;
    }

    // 다음 장면을 위한 초기화
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
        chatMessages.innerHTML = '<div class="chat-message ai"><div class="chat-message-label">또다른 나</div><div class="chat-message-content">기억을 이야기해줘. 천천히, 편하게.</div></div>';
    }

    if (ritualScenes.length >= 5) {
        showNotification('5개의 장면이 모두 저장되었습니다. 메모리를 저장합니다...');
        await saveRitualToMemories();
    } else {
        currentSceneIndex = ritualScenes.length;
        showNotification(`장면 ${ritualScenes.length}/5 저장됨. 다음 장면을 입력하세요.`);
    }
}

// Ritual 완료 시 memories/scenes 테이블에 저장
async function saveRitualToMemories() {
    console.log('=== Ritual 완료, 메모리 저장 ===');

    const memoryData = {
        title: ritualScenes[0]?.coreObject || '무제',
        source: 'ritual',
        status: 'Fetus'
    };

    console.log('Source:', memoryData.source);

    try {
        const { saveMemoryGraph } = await import('./lib/repo.js');
        supabaseClient = getSupabaseClient();

        if (!supabaseClient) {
            throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
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
        console.error('Ritual 저장 오류:', error);
        alert('저장에 실패했습니다: ' + (error.message || '알 수 없는 오류'));
    }
}

function showRitualComplete(memoryId) {
    alert(`Ritual 기억이 저장되었습니다. (ID: ${memoryId})`);
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

// 전역 스코프 노출
window.showConfessionHub = showConfessionHub;
window.startBeginner = startBeginner;
window.startRitual = startRitual;
window.showArchitectLocked = showArchitectLocked;
window.showMainMenu = showMainMenu;

// 테스트용 함수 export (test-chat-pipeline.js에서 사용)
window.sendExpChatMessageWithDeps = sendExpChatMessageWithDeps;
window.sendChatMessageWithDeps = sendChatMessageWithDeps;
window.parseEmotionAnalysisResult = parseEmotionAnalysisResult;
window.parseSceneGenerationResult = parseSceneGenerationResult;
window.AIService = AIService; // 테스트에서 모킹할 수 있도록 노출
window.MemoryService = MemoryService; // 테스트에서 사용할 수 있도록 노출
window.getSupabaseClient = getSupabaseClient; // Strata 뷰에서 사용
window.networkService = networkService; // Strata 뷰에서 사용

// 디버깅 헬퍼 함수들 (콘솔에서 바로 사용 가능)
window.debug = {
    // 아카이브로 이동
    goToArchive: async () => {
        await enterArchive();
        console.log('✅ 아카이브로 이동했습니다');
    },
    
    // 메모리 선택 (인덱스 또는 ID)
    selectMemory: async (indexOrId) => {
        const state = appStore.getState();
        let index;
        if (typeof indexOrId === 'number') {
            index = indexOrId;
        } else {
            index = state.allMemoriesData.findIndex(m => m.id === indexOrId);
            if (index === -1) {
                console.error('❌ 메모리를 찾을 수 없습니다:', indexOrId);
                return;
            }
        }
        if (index >= state.allMemoriesData.length) {
            console.error('❌ 인덱스가 범위를 벗어났습니다:', index);
            return;
        }
        selectMemory(index);
        console.log(`✅ 메모리 ${index} 선택했습니다:`, state.allMemoriesData[index]?.title);
    },
    
    // 시퀀스 건너뛰고 바로 플레이 시작
    skipToPlay: (memoryIndex = 0) => {
        const state = appStore.getState();
        if (memoryIndex >= state.allMemoriesData.length) {
            console.error('❌ 인덱스가 범위를 벗어났습니다:', memoryIndex);
            return;
        }
        const memory = state.allMemoriesData[memoryIndex];
        if (!memory) {
            console.error('❌ 메모리를 찾을 수 없습니다:', memoryIndex);
            return;
        }
        appStore.setState({ currentMemory: memoryIndex, currentScene: 0 });
        window.currentStoryData = memory;
        startArchivePlay(memoryIndex);
        console.log(`✅ 플레이 시작:`, memory.title);
    },
    
    // 특정 장면으로 이동
    goToScene: (sceneIndex = 0) => {
        const state = appStore.getState();
        appStore.setState({ currentScene: sceneIndex });
        renderScene();
        console.log(`✅ 장면 ${sceneIndex}로 이동했습니다`);
    },
    
    // 엔딩 화면으로 바로 이동
    skipToEnd: async (alignment = 0.85) => {
        const alignmentResult = {
            averageAlignment: alignment,
            isTrueEnding: alignment >= 0.8
        };
        await showEndScreen(alignmentResult, true);
        console.log(`✅ 엔딩 화면으로 이동했습니다 (정렬도: ${alignment})`);
    },
    
    // 현재 상태 확인
    showState: () => {
        const state = appStore.getState();
        console.log('📊 현재 상태:', {
            currentMode: state.currentMode,
            currentMemory: state.currentMemory,
            currentScene: state.currentScene,
            allMemoriesCount: state.allMemoriesData.length,
            currentMemoryData: state.allMemoriesData[state.currentMemory],
            currentAlignment: state.currentAlignment
        });
        return state;
    },
    
    // 메모리 목록 확인
    listMemories: () => {
        const state = appStore.getState();
        console.log('📚 메모리 목록:');
        state.allMemoriesData.forEach((m, i) => {
            console.log(`  [${i}] ${m.title || '제목 없음'} (ID: ${m.id}, Code: ${m.code})`);
        });
        return state.allMemoriesData;
    },
    
    // 비교 화면으로 이동
    showComparison: async () => {
        const alignmentResult = await calculateAverageAlignment();
        showComparisonView();
        console.log('✅ 비교 화면으로 이동했습니다');
    }
};

console.log('🔧 디버깅 헬퍼 함수가 로드되었습니다. window.debug를 사용하세요.');
console.log('📖 사용법:');
console.log('  - debug.goToArchive() - 아카이브로 이동');
console.log('  - debug.selectMemory(0) - 첫 번째 메모리 선택');
console.log('  - debug.skipToPlay(0) - 시퀀스 건너뛰고 바로 플레이');
console.log('  - debug.goToScene(0) - 첫 번째 장면으로 이동');
console.log('  - debug.skipToEnd(0.85) - 엔딩 화면으로 이동');
console.log('  - debug.showState() - 현재 상태 확인');
console.log('  - debug.listMemories() - 메모리 목록 확인');

// DOMContentLoaded 시 초기화 (모든 변수 선언 후 실행 보장)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
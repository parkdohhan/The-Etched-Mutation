/**
 * Live Session Module — session creation, subscriptions, alignment, and lifecycle.
 *
 * Phase 1 extraction: session management only.
 * Chat/voice/confirm code remains in index.js (phase 2).
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   window.appStore, window.showNotification, window.showEndScreen,
 *   window.restart, window.stopAllAnimations, window.startLiveSession,
 *   window.updateLiveAlignment, window.switchExpGeneratedTab,
 *   window.addExpChatMessage, window.updateAlignmentWave (self-ref after move)
 */

import { getSupabaseClient } from '../lib/supabaseClient.js';
import { SUPABASE_URL } from '../lib/config.js';
import { emotionVectorToWaveStyle, projectEmotionToVAD } from '../shared/math.js';
import { networkService } from '../services/NetworkService.js';
import { realtimeService } from '../services/RealtimeService.js';
import { byeoriEngine } from '../core/ByeoriEngine.js';
import { uiManager } from '../ui/UIManager.js';
import { NPC_DIALOGUES } from '../npc-dialogues.js';

// === Module State ===
let sessionCode = null;
let currentNarratorWave = null;

// ─────────────────────────────────────
// === Session Setup ===
// ─────────────────────────────────────

function selectRole(role) {
    try {
        const appStore = window.appStore;
        appStore.setState({ currentRole: role, currentMode: 'live' });
        const modeSelectionEl = document.getElementById('modeSelection');
        if (modeSelectionEl) { modeSelectionEl.classList.remove('active'); modeSelectionEl.style.display = 'none' }
        const sessionSetupEl = document.getElementById('sessionSetup');
        if (sessionSetupEl) {
            sessionSetupEl.classList.add('active');
            sessionSetupEl.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important';
        }
        if (role === 'A') {
            const narratorSetupEl = document.getElementById('narratorSetup');
            const experiencerSetupEl = document.getElementById('experiencerSetup');
            if (narratorSetupEl) narratorSetupEl.style.display = 'block';
            if (experiencerSetupEl) experiencerSetupEl.style.display = 'none';
            generateSessionCode();
        } else {
            const narratorSetupEl = document.getElementById('narratorSetup');
            const experiencerSetupEl = document.getElementById('experiencerSetup');
            if (narratorSetupEl) narratorSetupEl.style.display = 'none';
            if (experiencerSetupEl) experiencerSetupEl.style.display = 'block';
        }
    } catch (e) {
        console.error('selectRole error:', e);
        window.showNotification('Role을 선택하는 중 An error occurred');
    }
}

function generateSessionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    sessionCode = code;
    document.getElementById('sessionCode').textContent = code;
    document.getElementById('waitingForB').classList.add('active');
    createLiveSession();
}

function copySessionCode() {
    navigator.clipboard.writeText(sessionCode);
    window.showNotification('Code copied');
}

function joinSession() {
    joinLiveSession();
}

// ─────────────────────────────────────
// === Session Creation ===
// ─────────────────────────────────────

async function createLiveSession() {
    console.log('=== createLiveSession start ===');
    console.log('sessionCode:', sessionCode);
    const appStore = window.appStore;
    const state = appStore.getState();
    console.log('currentRole:', state.currentRole);

    let supabaseClient = null;
    let retryCount = 0;
    const maxRetries = 20;

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
        window.showNotification('Failed to connect to Supabase. Please check your network connection.');
        return null;
    }

    const roleCheckState = appStore.getState();
    if (roleCheckState.currentRole !== 'A') {
        console.warn('Not the narrator');
        return null;
    }

    let userId;
    if (state.currentUser) {
        userId = state.currentUser.id;
    } else {
        if (!window.anonymousUserId) {
            window.anonymousUserId = crypto.randomUUID();
        }
        userId = window.anonymousUserId;
    }

    console.log('userId:', userId);

    try {
        console.log('Checking network connection...');
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/`, { method: 'HEAD', mode: 'no-cors' });
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
                window.showNotification(errorMsg);
            } else {
                window.showNotification('Failed to create session');
            }
            return null;
        }

        const data = result.data;
        if (!data) {
            console.error('Session not created (data is null)');
            window.showNotification('Session creation failed: no data returned');
            return null;
        }

        console.log('Session created successfully:', data);
        appStore.setState({ currentSessionId: data.id });
        subscribeToSessionJoin();
        subscribeToExperiencerChoices();
        window.showNotification('Session created. Code: ' + sessionCode);
        return data.id;
    } catch (e) {
        console.error('createLiveSession error:', e);
        window.showNotification('Session creation failed: ' + (e.message || 'Unknown error'));
        return null;
    }
}

// ─────────────────────────────────────
// === Realtime Subscriptions ===
// ─────────────────────────────────────

function subscribeToSessionJoin() {
    const appStore = window.appStore;
    const state = appStore.getState();
    const sessionId = state.currentSessionId;
    if (!sessionId) {
        console.log('Subscription failed: no currentSessionId');
        return;
    }
    realtimeService.subscribeToSessionJoin(sessionId, {
        onExperiencerJoin: (sessionData) => {
            console.log('Experiencer joined!', sessionData.experiencer_id);
            window.showNotification('An experiencer has joined!');
            const sessionSetupEl = document.getElementById('sessionSetup');
            if (sessionSetupEl) {
                sessionSetupEl.classList.remove('active');
                sessionSetupEl.style.display = 'none';
            }
            setTimeout(() => window.startLiveSession(), 500);
        },
        onSubscribed: () => {
            checkExperiencerJoin();
        }
    });
}

async function checkExperiencerJoin() {
    const appStore = window.appStore;
    const state = appStore.getState();
    if (!state.currentSessionId || state.currentRole !== 'A') return;

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
                window.showNotification('An experiencer has joined!');
                const sessionSetupEl = document.getElementById('sessionSetup');
                if (sessionSetupEl) {
                    sessionSetupEl.classList.remove('active');
                    sessionSetupEl.style.display = 'none';
                }
                setTimeout(() => window.startLiveSession(), 500);
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
    const appStore = window.appStore;
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
                        window.switchExpGeneratedTab('scene');
                        window.expCurrentPhase = 'interpret';
                        const emotionCueMsg = window.lastSceneData?.emotionCue || NPC_DIALOGUES.live.emotionCue;
                        window.addExpChatMessage('ai', 'The narrator\'s memory has arrived. ' + emotionCueMsg);
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

function displayExperiencerEmotionForNarrator(interpretation) {
    console.log('displayExperiencerEmotionForNarrator called:', interpretation);
    if (!interpretation || !interpretation.emotion_vector) {
        console.error('No interpretation data or emotion vector');
        return;
    }
    const emotionVector = interpretation.emotion_vector;
    window.experiencerEmotionVector = emotionVector;
    const experiencerWave = emotionVectorToWaveStyle(emotionVector);
    window.currentExperiencerWave = experiencerWave;
    updateAlignmentWave();
    window.showNotification('The experiencer has entered an emotion');
}

function subscribeToExperiencerChoices() {
    const appStore = window.appStore;
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

function onExperiencerChoiceReceived(choice) {
    console.log('Experiencer emotion arrived (choices table):', choice);
    if (!choice || !choice.emotion_vector) {
        console.error('No choice or emotion_vector');
        return;
    }
    const appStore = window.appStore;
    const emotionVector = choice.emotion_vector;
    window.experiencerEmotionVector = emotionVector;
    const experiencerWave = emotionVectorToWaveStyle(emotionVector);
    window.currentExperiencerWave = experiencerWave;
    updateAlignmentWave();
    if (window.narratorEmotionVector) {
        const stateForEngine = appStore.getState();
        const engineResult = byeoriEngine.calculateStep({
            userVector: { base: emotionVector },
            originalVector: { base: window.narratorEmotionVector },
            userTrajectory: stateForEngine.userEmotionTrajectory || [],
            originalTrajectory: stateForEngine.originalEmotionTrajectory || [],
            sceneScores: stateForEngine.sceneScores || []
        }, {});
        const alignment = engineResult.alignment_score;
        appStore.setState({ currentAlignment: alignment });
        window.updateLiveAlignment(0);
        console.log('Alignment calculation complete (choices):', alignment);
    }
    window.showNotification('The experiencer has entered their emotion (choices)');
}

function subscribeToScenes() {
    const appStore = window.appStore;
    const state = appStore.getState();
    const sessionId = state.currentSessionId;
    if (!sessionId) {
        console.error('subscribeToScenes: no currentSessionId');
        return;
    }

    realtimeService.subscribeToScenes(sessionId, {
        onSceneInsert: (sceneData) => {
            window.expCurrentPhase = 'interpret';
            const emotionCueMsg = window.lastSceneData?.emotionCue || NPC_DIALOGUES.live.emotionCue;
            uiManager.displaySceneForExperiencer(sceneData, {
                onSwitchTab: window.switchExpGeneratedTab,
                onAddChatMessage: window.addExpChatMessage,
                onShowNotification: window.showNotification
            }, emotionCueMsg, NPC_DIALOGUES.live.sceneArrived);
        }
    });
}

// ─────────────────────────────────────
// === Alignment & Wave ===
// ─────────────────────────────────────

async function checkAlignment() {
    const appStore = window.appStore;
    const state = appStore.getState();
    if (!state.currentSessionId) return;
    if (window.narratorEmotionVector && window.experiencerEmotionVector) {
        const stateForEngine = appStore.getState();
        const engineResult = byeoriEngine.calculateStep({
            userVector: { base: window.experiencerEmotionVector },
            originalVector: { base: window.narratorEmotionVector },
            userTrajectory: stateForEngine.userEmotionTrajectory || [],
            originalTrajectory: stateForEngine.originalEmotionTrajectory || [],
            sceneScores: stateForEngine.sceneScores || []
        }, {});
        const alignment = engineResult.alignment_score;
        appStore.setState({ currentAlignment: alignment });
        window.updateLiveAlignment(0);
        updateAlignmentWave();
        console.log('Alignment 계산 complete:', alignment);
        return;
    }
    // Fully disabled since live_interpretations table does not exist
    return;
}

function updateAlignmentWave() {
    const canvas = document.getElementById('alignmentWaveCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!window.narratorEmotionVector || !window.experiencerEmotionVector) return;
    const narratorWave = emotionVectorToWaveStyle(window.narratorEmotionVector);
    const experiencerWave = emotionVectorToWaveStyle(window.experiencerEmotionVector);
    currentNarratorWave = narratorWave;
    window.currentExperiencerWave = experiencerWave;
    console.log('파동 update:', { narrator: narratorWave, experiencer: experiencerWave });
}

// ─────────────────────────────────────
// === Session Join (Experiencer) ===
// ─────────────────────────────────────

async function joinLiveSession() {
    console.log('=== joinLiveSession start ===');

    let supabaseClient = null;
    let retryCount = 0;
    const maxRetries = 20;

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
        window.showNotification('Failed to connect to Supabase. Please check your network connection.');
        return;
    }

    const code = document.getElementById('sessionCodeInput').value.trim().toUpperCase();
    if (!code || code.length !== 5) {
        window.showNotification('Please enter a valid code (5 digits)');
        return;
    }

    const appStore = window.appStore;
    let userId;
    const state = appStore.getState();
    if (state.currentUser) {
        userId = state.currentUser.id;
    } else {
        if (!window.anonymousUserId) {
            window.anonymousUserId = crypto.randomUUID();
        }
        userId = window.anonymousUserId;
    }

    try {
        const findResult = await networkService.findSessionsByCode(code);

        if (!findResult.ok) {
            console.error('joinLiveSession query error:', findResult.error);
            window.showNotification('Session not found. Please check the code.');
            return;
        }

        const sessions = findResult.data || [];
        if (sessions.length === 0) {
            window.showNotification('Session not found. Please check the code.');
            return;
        }

        const session = sessions.find(s =>
            s.session_code === code &&
            !s.experiencer_id &&
            !s.ended_at
        );

        if (!session) {
            window.showNotification('No available sessions. The session may already have a participant or has ended.');
            return;
        }

        const joinResult = await networkService.joinSession(session.id, userId);

        if (!joinResult.ok) {
            window.showNotification('Session join failed: ' + (joinResult.error?.message || 'Unknown error'));
            return;
        }

        sessionCode = code;
        appStore.setState({ currentSessionId: session.id });

        window.showNotification('Connected to session!');
        subscribeToNarratorEmotion();
        setTimeout(() => window.startLiveSession(), 500);
    } catch (e) {
        console.error('joinLiveSession error:', e);
        window.showNotification('Error during session join: ' + (e.message || 'Unknown error'));
    }
}

function subscribeToNarratorEmotion() {
    const appStore = window.appStore;
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
        console.log('Alignment 계산 불가: 감정 벡터 없음');
        return;
    }

    const appStore = window.appStore;
    const stateForEngine = appStore.getState();
    const engineResult = byeoriEngine.calculateStep({
        userVector: { base: window.experiencerEmotionVector },
        originalVector: { base: window.narratorEmotionVector },
        userTrajectory: stateForEngine.userEmotionTrajectory || [],
        originalTrajectory: stateForEngine.originalEmotionTrajectory || [],
        sceneScores: stateForEngine.sceneScores || []
    }, {});
    const alignment = engineResult.alignment_score;
    appStore.setState({ currentAlignment: alignment });

    uiManager.updateExperiencerAlignmentDisplay(alignment);
    updateAlignmentWave();
    console.log('체험자 화면 Alignment update:', alignment);
}

// ─────────────────────────────────────
// === Scene Save ===
// ─────────────────────────────────────

async function saveLiveScene(sceneData) {
    console.log('=== saveLiveScene called ===');
    const appStore = window.appStore;
    const state = appStore.getState();
    if (!state.currentSessionId) {
        console.error('currentSessionId가 not found!');
        window.showNotification('Session not found');
        return;
    }
    const sceneText = sceneData.text || window.currentGeneratedScene || state.pendingSceneText || '';
    if (!sceneText || sceneText === '(no scenes)') {
        console.error('Scene 텍스트가 not found!');
        window.showNotification('No scene to save');
        return;
    }
    const insertData = {
        session_id: state.currentSessionId,
        scene_index: state.liveSceneNum,
        scene_text: sceneText,
        emotion_raw: sceneData.emotionRaw || '',
        reason_raw: sceneData.reasonRaw || '',
        generated_emotion: sceneData.generatedEmotion || '',
        emotion_vector: sceneData.emotionAnalysis?.base || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 },
        intensity: sceneData.emotionAnalysis?.intensity || 0.5,
        confidence: sceneData.emotionAnalysis?.confidence || 0.5,
        void_scene: sceneData.voidInfo?.sceneVoid || false,
        void_emotion: sceneData.voidInfo?.emotionVoid || false,
        void_reason: sceneData.voidInfo?.reasonVoid || false
    };
    try {
        const result = await networkService.saveLiveScene(insertData);
        if (!result.ok) {
            console.error('live_scenes INSERT error:', result.error);
            throw result.error;
        }
        console.log('live_scenes Save success:', result.data);
        await saveSceneToLiveSession({
            text: sceneText,
            emotion_vector: sceneData.emotionAnalysis?.base || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }
        });
        window.showNotification('Scene sent to experiencer');
    } catch (e) {
        console.error('saveLiveScene error:', e);
        window.showNotification('Scene Save failed: ' + e.message);
    }
}

async function saveSceneToLiveSession(sceneData) {
    console.log('=== saveSceneToLiveSession called ===');
    const appStore = window.appStore;
    const state = appStore.getState();
    if (!state.currentSessionId) {
        window.showNotification('Session not found');
        return;
    }
    const sceneText = sceneData.text || '';
    if (!sceneText) {
        window.showNotification('No scene to save');
        return;
    }
    try {
        const insertData = {
            live_session_id: state.currentSessionId,
            scene_order: state.currentSceneOrder,
            text: sceneText,
            emotion_vector: sceneData.emotion_vector || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 },
            created_at: new Date().toISOString()
        };
        const result = await networkService.saveScene(insertData);
        if (!result.ok) {
            console.error('scenes INSERT error:', result.error);
            throw result.error;
        }
        appStore.setState({ currentSceneOrder: state.currentSceneOrder + 1 });
        window.showNotification('장면이 scenes 테이블에 저장 complete');
    } catch (e) {
        console.error('saveSceneToLiveSession error:', e);
        window.showNotification('scenes 테이블 Save failed: ' + e.message);
    }
}

// ─────────────────────────────────────
// === Session Lifecycle ===
// ─────────────────────────────────────

async function endLiveSession() {
    const appStore = window.appStore;
    const state = appStore.getState();
    if (!state.currentSessionId) return;
    try {
        const result = await networkService.endSession(state.currentSessionId, state.currentAlignment);
        if (!result.ok) {
            console.error('endLiveSession error:', result.error);
            return;
        }
        console.log('Session ended');
    } catch (e) {
        console.error('endLiveSession error:', e);
    }
}

function stopAllLiveSubscriptions() {
    realtimeService.cleanup();
}

async function exitLive() {
    if (confirm('End session?')) {
        const appStore = window.appStore;
        const state = appStore.getState();
        const wasRoleA = state.currentRole === 'A';
        const wasFirstScene = state.liveSceneNum === 1;
        stopAllLiveSubscriptions();
        window.stopAllAnimations();
        await endLiveSession();
        const liveContainerEl = document.getElementById('liveContainer');
        if (liveContainerEl) {
            liveContainerEl.classList.remove('active');
            liveContainerEl.style.display = 'none';
        }
        appStore.setState({ currentSessionId: null, currentRole: null, sessionCode: null });
        if (wasRoleA && wasFirstScene) {
            window.restart();
        } else {
            window.showEndScreen();
        }
    }
}

// ─────────────────────────────────────
// === Exports ===
// ─────────────────────────────────────

export {
    // Session setup
    selectRole,
    generateSessionCode,
    copySessionCode,
    joinSession,

    // Session creation
    createLiveSession,

    // Subscriptions
    subscribeToSessionJoin,
    checkExperiencerJoin,
    subscribeToLiveScenes,
    subscribeToLiveInterpretations,
    subscribeToExperiencerChoices,
    subscribeToScenes,
    subscribeToNarratorEmotion,

    // Display / alignment
    displayExperiencerEmotionForNarrator,
    onExperiencerChoiceReceived,
    checkAlignment,
    updateAlignmentWave,
    updateExperiencerAlignment,

    // Scene save
    saveLiveScene,
    saveSceneToLiveSession,

    // Lifecycle
    endLiveSession,
    stopAllLiveSubscriptions,
    exitLive,
};

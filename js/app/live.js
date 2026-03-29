import { appStore } from './appStore.js';
import { showNotification, showNpcDialogue } from '../ui/notify.js';
/**
 * Live Session Module — session creation, subscriptions, alignment, lifecycle,
 * chat, voice, confirm, and all live mode UI logic.
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   appStore, showNotification, window.showEndScreen,
 *   window.restart, window.stopAllAnimations, showNpcDialogue,
 *   window.updateUserStats, window.startAlignmentWaveAnimation,
 *   window.proceedToNextSceneLive, window.saveRitualScene,
 *   window.startExpInterview
 */

import { getSupabaseClient } from '../lib/supabaseClient.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_FUNCTION_URL } from '../lib/config.js';
import { emotionVectorToWaveStyle, projectEmotionToVAD } from '../shared/math.js';
import { networkService } from '../services/NetworkService.js';
import { realtimeService } from '../services/RealtimeService.js';
import { byeoriEngine } from '../core/ByeoriEngine.js';
import { AIService } from '../services/AIService.js';
import { uiManager } from '../ui/UIManager.js';
import { NPC_DIALOGUES } from '../npc-dialogues.js';

// === Module State (session) ===
let sessionCode = null;
let currentNarratorWave = null;

// === Module State (chat/phase) ===
let conversationHistory = [];
let currentGeneratedSceneObj = null;
let currentGeneratedEmotion = null;
let currentPhase = 'scene';
let pendingEmotionText = '';
let currentGeneratedScene = '';
let finalSceneObject = null;
let isEditMode = false;
let inputPhase = 'scene';
let currentSceneText = '';
let isVoiceMode = false;

// === Module State (experiencer) ===
let expCurrentPhase = 'waiting';
let expGeneratedEmotion = '';
let expFinalObject = null;
let expConversationHistory = [];

// === Module State (voice/recording) ===
let recognition = null;
let audioContext = null;
let analyser = null;
let microphone = null;
let voiceAnimationId = null;
let recognizedText = '';
let liveVoiceRecognition = null;
let liveVoiceContext = null;
let liveVoiceAnalyser = null;
let liveVoiceMicrophone = null;
let liveVoiceAnimationId = null;
let liveRecognizedText = '';
let isLiveVoiceRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let expMediaRecorder = null;
let expAudioChunks = [];
let isExpRecording = false;
let voiceWaveLiveAnimationId = null;
let experiencerStatusPosition = 'left';

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


// ─────────────────────────────────────
// === Session Setup ===
// ─────────────────────────────────────

function selectRole(role) {
    try {
        
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
        showNotification('Role을 선택하는 중 An error occurred');
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
    showNotification('Code copied');
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
        showNotification('Failed to connect to Supabase. Please check your network connection.');
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
        appStore.setState({ currentSessionId: data.id });
        subscribeToSessionJoin();
        subscribeToExperiencerChoices();
        showNotification('Session created. Code: ' + sessionCode);
        return data.id;
    } catch (e) {
        console.error('createLiveSession error:', e);
        showNotification('Session creation failed: ' + (e.message || 'Unknown error'));
        return null;
    }
}

// ─────────────────────────────────────
// === Realtime Subscriptions ===
// ─────────────────────────────────────

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
            setTimeout(() => window.startLiveSession(), 500);
        },
        onSubscribed: () => {
            checkExperiencerJoin();
        }
    });
}

async function checkExperiencerJoin() {
    
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
                showNotification('An experiencer has joined!');
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
    showNotification('The experiencer has entered an emotion');
}

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

function onExperiencerChoiceReceived(choice) {
    console.log('Experiencer emotion arrived (choices table):', choice);
    if (!choice || !choice.emotion_vector) {
        console.error('No choice or emotion_vector');
        return;
    }
    
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
    showNotification('The experiencer has entered their emotion (choices)');
}

function subscribeToScenes() {
    
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
                onShowNotification: showNotification
            }, emotionCueMsg, NPC_DIALOGUES.live.sceneArrived);
        }
    });
}

// ─────────────────────────────────────
// === Alignment & Wave ===
// ─────────────────────────────────────

async function checkAlignment() {
    
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
        showNotification('Failed to connect to Supabase. Please check your network connection.');
        return;
    }

    const code = document.getElementById('sessionCodeInput').value.trim().toUpperCase();
    if (!code || code.length !== 5) {
        showNotification('Please enter a valid code (5 digits)');
        return;
    }

    
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
            showNotification('Session not found. Please check the code.');
            return;
        }

        const sessions = findResult.data || [];
        if (sessions.length === 0) {
            showNotification('Session not found. Please check the code.');
            return;
        }

        const session = sessions.find(s =>
            s.session_code === code &&
            !s.experiencer_id &&
            !s.ended_at
        );

        if (!session) {
            showNotification('No available sessions. The session may already have a participant or has ended.');
            return;
        }

        const joinResult = await networkService.joinSession(session.id, userId);

        if (!joinResult.ok) {
            showNotification('Session join failed: ' + (joinResult.error?.message || 'Unknown error'));
            return;
        }

        sessionCode = code;
        appStore.setState({ currentSessionId: session.id });

        showNotification('Connected to session!');
        subscribeToNarratorEmotion();
        setTimeout(() => window.startLiveSession(), 500);
    } catch (e) {
        console.error('joinLiveSession error:', e);
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
        console.log('Alignment 계산 불가: 감정 벡터 없음');
        return;
    }

    
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
    
    const state = appStore.getState();
    if (!state.currentSessionId) {
        console.error('currentSessionId가 not found!');
        showNotification('Session not found');
        return;
    }
    const sceneText = sceneData.text || window.currentGeneratedScene || state.pendingSceneText || '';
    if (!sceneText || sceneText === '(no scenes)') {
        console.error('Scene 텍스트가 not found!');
        showNotification('No scene to save');
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
        showNotification('Scene sent to experiencer');
    } catch (e) {
        console.error('saveLiveScene error:', e);
        showNotification('Scene Save failed: ' + e.message);
    }
}

async function saveSceneToLiveSession(sceneData) {
    console.log('=== saveSceneToLiveSession called ===');
    
    const state = appStore.getState();
    if (!state.currentSessionId) {
        showNotification('Session not found');
        return;
    }
    const sceneText = sceneData.text || '';
    if (!sceneText) {
        showNotification('No scene to save');
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
        showNotification('장면이 scenes 테이블에 저장 complete');
    } catch (e) {
        console.error('saveSceneToLiveSession error:', e);
        showNotification('scenes 테이블 Save failed: ' + e.message);
    }
}

// ─────────────────────────────────────
// === Session Lifecycle ===
// ─────────────────────────────────────

async function endLiveSession() {
    
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
// === Live Session Start ===
// ─────────────────────────────────────

async function startLiveSession() { try { const state = appStore.getState(); if (!state.currentSessionId && state.currentRole === 'B') { console.warn('Experiencer session ID not found'); return } let sessionId = state.currentSessionId; if (!sessionId && state.currentRole === 'A') { sessionId = await createLiveSession(); if (!sessionId) { console.warn('Session creation failed, continuing') } else { appStore.setState({ currentSessionId: sessionId }) } } subscribeToLiveScenes(); subscribeToScenes(); appStore.setState({ currentSceneOrder: 1, currentScene: 0, userChoices: [], userReasons: [], currentAlignment: 0, userEmotionTrajectory: [], originalEmotionTrajectory: [], sceneScores: [], pendingSceneText: '', expPendingEmotion: '' }); const storyData = window.currentStoryData; conversationHistory = []; currentGeneratedSceneObj = null; currentGeneratedEmotion = null; currentPhase = 'scene'; pendingEmotionText = ''; currentGeneratedScene = ''; finalSceneObject = null; isEditMode = false; const sceneContent = document.querySelector('#generatedSceneContent .generated-text'); if (sceneContent) sceneContent.textContent = ''; const emotionContent = document.querySelector('#generatedEmotionContent .generated-text'); if (emotionContent) emotionContent.textContent = ''; const chatMessages = document.getElementById('chatMessages'); if (chatMessages) { chatMessages.innerHTML = '<div class="chat-message ai"><div class="chat-message-label">Another Me</div><div class="chat-message-content">기억을 이야기해줘. 천천히, 편하게.</div></div>' } const editBtn = document.querySelector('.edit-toggle-btn'); if (editBtn) { editBtn.textContent = 'Edit'; editBtn.classList.remove('active') } const sceneTextarea = document.getElementById('editSceneTextarea'); if (sceneTextarea) { sceneTextarea.style.display = 'none'; sceneTextarea.value = '' } const emotionTextarea = document.getElementById('editEmotionTextarea'); if (emotionTextarea) { emotionTextarea.style.display = 'none'; emotionTextarea.value = '' } const sceneTextEl = document.querySelector('#generatedSceneContent .generated-text'); if (sceneTextEl) sceneTextEl.style.display = 'block'; switchGeneratedTab('scene'); window.updateUserStats('liveSession', 1); const sessionSetupEl = document.getElementById('sessionSetup'); if (sessionSetupEl) { sessionSetupEl.classList.remove('active'); sessionSetupEl.style.display = 'none' } const liveContainerEl = document.getElementById('liveContainer'); if (liveContainerEl) { liveContainerEl.classList.add('active'); liveContainerEl.style.cssText = 'display:block !important' } const liveContentEl = document.querySelector('.live-content'); const roleState = appStore.getState(); if (liveContentEl) { if (roleState.currentRole === 'A') { liveContentEl.classList.add('narrator-mode') } else { liveContentEl.classList.remove('narrator-mode') } }; const narratorLastChoiceSection = document.getElementById('narratorLastChoiceSection'); if (narratorLastChoiceSection) narratorLastChoiceSection.style.display = 'none'; const liveProgressSection = document.getElementById('liveProgressSection'); if (liveProgressSection) liveProgressSection.style.display = roleState.currentRole === 'A' ? 'block' : 'none'; const traceLabel = document.getElementById('traceLabel'); if (traceLabel) traceLabel.textContent = roleState.currentRole === 'A' ? '해석의 흔적' : '기억의 흔적'; if (roleState.currentRole === 'A') { const narratorPanelEl = document.getElementById('narratorPanel'); if (narratorPanelEl) narratorPanelEl.classList.add('active'); const interpretationTrace = document.getElementById('interpretationTrace'); const traceContent = document.getElementById('traceContent'); if (interpretationTrace && traceContent) { interpretationTrace.style.display = 'block'; traceContent.textContent = '체험자가 장면을 기다리고있습니다...' } showNpcDialogue("당신의 기억을 불러오세요. 지금 입력하는 장면이 이 기억의 원본 음각이 됩니다.", 4000) } else { const experiencerPanelEl = document.getElementById('experiencerPanel'); if (experiencerPanelEl) { experiencerPanelEl.classList.add('active'); expCurrentPhase = 'waiting'; appStore.setState({ expPendingEmotion: '' }); expGeneratedEmotion = ''; expFinalObject = null; const expSceneText = document.getElementById('expSceneText'); if (expSceneText) expSceneText.innerHTML = '화자가 기억을 불러오고 있습니다<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>'; const expEmotionText = document.getElementById('expEmotionText'); if (expEmotionText) expEmotionText.textContent = ''; const sceneDisplay = document.getElementById('expGeneratedSceneContent'); if (sceneDisplay) sceneDisplay.style.display = 'block'; const emotionDisplay = document.getElementById('expGeneratedEmotionContent'); if (emotionDisplay) emotionDisplay.style.display = 'none'; showNpcDialogue("곧 누군가의 Original Memory이 열릴 거야. 그 안에서 네 감정을 솔직하게 남겨줘.", 4000) } else { showNotification('체험자 패널을 not found') } } window.startAlignmentWaveAnimation(); setTimeout(() => { startVoiceWaveLiveAnimation() }, 300); const footer = document.querySelector('.footer'); if (footer) footer.classList.add('visible') } catch (e) { console.error('startLiveSession error:', e); showNotification('세션을 시작하는 중 Error occurred: ' + e.message) } }

// ─────────────────────────────────────
// === Narrator Input & Scene Generation ===
// ─────────────────────────────────────

async function sendNarratorInput() { console.log('sendNarratorInput called'); const input = document.getElementById('narratorInput'); if (!input || !input.value.trim()) { showNotification('Please enter a memory'); return } const inputText = input.value.trim(); const sendBtn = document.querySelector('.narrator-send-btn'); if (sendBtn) sendBtn.disabled = true; if (sendBtn) sendBtn.textContent = 'AI is converting scene...'; showNotification('AI is converting scene...'); try { const convertedScene = await generateSceneAI(inputText); const liveSceneContent = document.getElementById('liveSceneContent'); if (liveSceneContent) { liveSceneContent.textContent = convertedScene } const experiencerPanel = document.getElementById('experiencerPanel'); if (experiencerPanel) { experiencerPanel.classList.add('active') } const traceContent = document.getElementById('traceContent'); if (traceContent) { traceContent.textContent = 'Scene sent to experiencer' } showNotification('Scene sent to experiencer'); input.value = ''; const reasonInput = document.getElementById('narratorReason'); if (reasonInput) reasonInput.value = ''; updateLiveAlignment(0.15); const liveState = appStore.getState(); appStore.setState({ liveSceneNum: (liveState.liveSceneNum || 0) + 1 }); const liveSceneNumEl = document.getElementById('liveSceneNum'); if (liveSceneNumEl) liveSceneNumEl.textContent = appStore.getState().liveSceneNum } catch (error) { console.error('sendNarratorInput error:', error); showNotification('Scene 변환 중 Error occurred: ' + error.message); const liveSceneContent = document.getElementById('liveSceneContent'); if (liveSceneContent) { liveSceneContent.textContent = inputText } } finally { if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send' } } }

async function handleUnifiedSubmit(providedText) { console.log('handleUnifiedSubmit called'); console.log('=== handleUnifiedSubmit ==='); console.log('currentPhase:', currentPhase); let inputText = ''; if (providedText) { inputText = providedText.trim() } else { const input = document.getElementById('unifiedInput'); if (!input || !input.value.trim()) { showNotification('Please enter your input'); return } inputText = input.value.trim(); input.value = '' } console.log('inputText:', inputText); if (currentPhase === 'scene') { appStore.setState({ pendingSceneText: inputText }); addChatMessage('user', inputText); try { const aiScene = await generateSceneAI(inputText); currentGeneratedScene = aiScene; console.log('currentGeneratedScene (after AI):', currentGeneratedScene); const sceneContent = document.querySelector('#generatedSceneContent .generated-text'); if (sceneContent) sceneContent.textContent = aiScene; switchGeneratedTab('scene'); addChatMessageWithConfirm('ai', 'Does this memory feel right?'); } catch (error) { console.error('generateSceneAI error:', error); showNotification('An error occurred during scene generation'); currentGeneratedScene = inputText; const sceneContent = document.querySelector('#generatedSceneContent .generated-text'); if (sceneContent) sceneContent.textContent = inputText; switchGeneratedTab('scene'); addChatMessageWithConfirm('ai', 'Does this memory feel right?') } return } if (currentPhase === 'emotion') { console.log('=== EMOTION PHASE ==='); console.log('inputText:', inputText); addChatMessage('user', inputText); let emotionResult = null; try { showNotification('AI is analyzing and converting emotions...'); emotionResult = await analyzeEmotionWithVector(inputText, ''); console.log('emotionResult (raw):', JSON.stringify(emotionResult)) } catch (e) { console.error('Emotion analysis failed:', e); showNotification('감정 분석 Failed: ' + e.message) } if (!emotionResult || !emotionResult.generatedEmotion || emotionResult.generatedEmotion === inputText) { console.warn('AI emotion conversion failed, using original text'); emotionResult = { generatedEmotion: inputText, analysis: emotionResult?.analysis || { base: { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, detailed: [], intensity: 0.5, confidence: 0.3 } } } console.log('최종 emotionResult:', emotionResult); const emotionContent = document.querySelector('#generatedEmotionContent .generated-text'); if (emotionContent) { emotionContent.textContent = emotionResult.generatedEmotion; console.log('생성된 감정 표시:', emotionResult.generatedEmotion) } switchGeneratedTab('emotion'); const parsed = parseEmotionInput(inputText); const currentState = appStore.getState(); const sceneText = currentGeneratedScene || currentState.pendingSceneText || ''; console.log('sceneText for finalSceneObject:', sceneText); console.log('currentGeneratedScene:', currentGeneratedScene); console.log('pendingSceneText:', currentState.pendingSceneText); const voidInfo = { sceneVoid: !sceneText || sceneText.includes('기억 안 나'), emotionVoid: !parsed.emotion, reasonVoid: !parsed.reason }; finalSceneObject = { text: sceneText, emotionRaw: parsed.emotion || inputText, reasonRaw: parsed.reason || '', generatedEmotion: emotionResult.generatedEmotion, emotionAnalysis: emotionResult.analysis, voidInfo: voidInfo }; console.log('finalSceneObject 생성:', JSON.stringify(finalSceneObject)); addChatMessageWithConfirm('ai', 'Does this emotion feel right?'); return } }

async function generateSceneAI(inputText) { try { const response = await fetch(SUPABASE_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ text: inputText }) }); if (!response.ok) { const error = await response.json(); throw new Error(error.error || error.details || 'API call failed') } const data = await response.json(); console.log('generateSceneAI response:', data); if (data.scene) { window.lastSceneData = { scene: data.scene, voidHint: data.voidHint || '', emotionCue: data.emotionCue || '' }; return data.scene } else { throw new Error(data.error || 'Scene 변환 실패') } } catch (error) { console.error('generateSceneAI error:', error); throw error } }

async function analyzeEmotionWithVector(emotionText, reasonText, anchorEmotions = null) { console.log('analyzeEmotionWithVector called:', { emotionText, reasonText, anchorEmotions }); try { const requestBody = { type: 'emotion_analysis', emotion: emotionText || '', reason: reasonText || '', anchorEmotions: anchorEmotions || [] }; console.log('API request body:', JSON.stringify(requestBody)); const response = await fetch(`${SUPABASE_URL}/functions/v1/claude-scene`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY }, body: JSON.stringify(requestBody) }); console.log('API response status:', response.status); if (!response.ok) { const errorText = await response.text(); console.error('API error response:', errorText); throw new Error('API call failed: ' + response.status) } const data = await response.json(); console.log('API response data:', JSON.stringify(data)); if (!data.generatedEmotion) { console.warn('generatedEmotion이 응답에 없음') } return data } catch (error) { console.error('analyzeEmotionWithVector error:', error); return { generatedEmotion: null, analysis: { base: { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, detailed: [], intensity: 0.5, confidence: 0.3 } } } }

// ─────────────────────────────────────
// === Chat UI ===
// ─────────────────────────────────────

function addChatMessage(role, content) { const messagesContainer = document.getElementById('chatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = `chat-message ${role}`; const label = role === 'user' ? 'me' : 'Another Me'; messageDiv.innerHTML = `<div class="chat-message-label">${label}</div><div class="chat-message-content">${content.replace(/\n/g, '<br>')}</div>`; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }

function addChatMessageWithConfirm(role, content) { const messagesContainer = document.getElementById('chatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = `chat-message ${role}`; const label = role === 'user' ? 'me' : 'Another Me'; messageDiv.innerHTML = `<div class="chat-message-label">${label}</div><div class="chat-message-content">${content.replace(/\n/g, '<br>')}</div><div class="confirm-buttons"><button class="confirm-btn yes" onclick="handleConfirm('yes')">Yes</button><button class="confirm-btn no" onclick="handleConfirm('no')">No</button></div>`; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }

function removeConfirmButtons() { const buttons = document.querySelectorAll('.confirm-buttons'); buttons.forEach(btn => btn.remove()) }

function addExpChatMessage(role, content) { const messagesContainer = document.getElementById('expChatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = 'chat-message ' + role; const label = role === 'user' ? 'me' : 'Another Me'; messageDiv.innerHTML = '<div class="chat-message-label">' + label + '</div><div class="chat-message-content">' + content.replace(/\n/g, '<br>') + '</div>'; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }

function addExpChatMessageWithConfirm(role, content) { const messagesContainer = document.getElementById('expChatMessages'); if (!messagesContainer) return; const messageDiv = document.createElement('div'); messageDiv.className = 'chat-message ' + role; const label = role === 'user' ? 'me' : 'Another Me'; messageDiv.innerHTML = '<div class="chat-message-label">' + label + '</div><div class="chat-message-content">' + content.replace(/\n/g, '<br>') + '</div><div class="confirm-buttons"><button class="confirm-btn yes" onclick="handleExpConfirm(\'yes\')">Yes</button><button class="confirm-btn no" onclick="handleExpConfirm(\'no\')">No</button></div>'; messagesContainer.appendChild(messageDiv); messagesContainer.scrollTop = messagesContainer.scrollHeight }

function removeExpConfirmButtons() { const panel = document.getElementById('experiencerPanel'); if (!panel) return; const buttons = panel.querySelectorAll('.confirm-buttons'); buttons.forEach(btn => btn.remove()) }

// ─────────────────────────────────────
// === Tab Switching ===
// ─────────────────────────────────────

function switchGeneratedTab(tab) { document.querySelectorAll('.generated-tab').forEach(t => t.classList.remove('active')); document.querySelectorAll('.generated-tab-content').forEach(c => c.style.display = 'none'); if (tab === 'scene') { document.querySelectorAll('.generated-tab')[0].classList.add('active'); document.getElementById('generatedSceneContent').style.display = 'block' } else if (tab === 'emotion') { document.querySelectorAll('.generated-tab')[1].classList.add('active'); document.getElementById('generatedEmotionContent').style.display = 'block' } }

function switchExpGeneratedTab(tab) { const sceneDisplay = document.getElementById('expGeneratedSceneContent'); const emotionDisplay = document.getElementById('expGeneratedEmotionContent'); if (tab === 'scene') { if (sceneDisplay) sceneDisplay.style.display = 'block'; if (emotionDisplay) emotionDisplay.style.display = 'none' } else if (tab === 'emotion') { if (sceneDisplay) sceneDisplay.style.display = 'none'; if (emotionDisplay) emotionDisplay.style.display = 'block' } }

// ─────────────────────────────────────
// === Parsing & Formatting ===
// ─────────────────────────────────────

function extractGeneratedText(aiResponse) { if (aiResponse.includes('[SCENE_READY]')) { try { const jsonStr = aiResponse.substring(aiResponse.indexOf('[SCENE_READY]') + '[SCENE_READY]'.length).trim(); const data = JSON.parse(jsonStr); if (currentPhase === 'scene' && data.scene) return data.scene.text || data.scene; if (currentPhase === 'emotion' && data.emotion) return data.emotion.text || data.emotion } catch (e) { } } return aiResponse.replace(/\[SCENE_READY\].*$/, '').trim() || aiResponse }

function parseEmotionInput(text) { const parts = text.split(/[,.]/).map(s => s.trim()).filter(Boolean); return { emotion: parts[0] || null, reason: parts[1] || null } }

function formatEmotionVector(emotionVector) { if (!emotionVector) return 'No emotion'; const emotions = []; if (emotionVector.fear > 0.1) emotions.push(`두려움 ${Math.round(emotionVector.fear * 100)}%`); if (emotionVector.sadness > 0.1) emotions.push(`슬픔 ${Math.round(emotionVector.sadness * 100)}%`); if (emotionVector.anger > 0.1) emotions.push(`분노 ${Math.round(emotionVector.anger * 100)}%`); if (emotionVector.joy > 0.1) emotions.push(`기쁨 ${Math.round(emotionVector.joy * 100)}%`); if (emotionVector.longing > 0.1) emotions.push(`그리움 ${Math.round(emotionVector.longing * 100)}%`); if (emotionVector.guilt > 0.1) emotions.push(`죄책감 ${Math.round(emotionVector.guilt * 100)}%`); return emotions.length > 0 ? emotions.join(', ') : 'No emotion' }

// ─────────────────────────────────────
// === Chat Message Refactoring Helpers ===
// ─────────────────────────────────────

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

function reflectExpChatMessageUI(userMessage) {
    addExpChatMessage('user', userMessage);
}

function reflectChatMessageUI(userMessage) {
    addChatMessage('user', userMessage);
    conversationHistory.push({ role: 'user', content: userMessage });
}

function parseEmotionAnalysisResult(emotionResult) {
    return emotionResult;
}

function parseSceneGenerationResult(aiResponse) {
    return aiResponse.response.trim();
}

function persistExpEmotionResult(emotionResult, userMessage) {
    const parsed = parseEmotionInput(userMessage);
    const emotionText = document.getElementById('expEmotionText');
    if (emotionText) {
        emotionText.textContent = emotionResult.generatedEmotion;
    }
    switchExpGeneratedTab('emotion');

    expFinalObject = {
        emotion: parsed.emotion,
        reason: parsed.reason,
        generatedEmotion: emotionResult.generatedEmotion,
        emotionAnalysis: emotionResult.analysis
    };

    const emotionDisplay = formatEmotionVector(emotionResult.analysis?.base || {});
    addExpChatMessage('ai', 'Your emotion: ' + emotionDisplay);

    if (emotionResult.analysis?.base) {
        const baseVec = emotionResult.analysis.base;
        
        const currentScene = appStore.getState().currentScene;
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

function persistSceneGenerationResult(generatedText) {
    
    appStore.setState({ pendingSceneText: generatedText });
    const sceneContent = document.querySelector('#generatedSceneContent .generated-text');
    if (sceneContent) {
        sceneContent.textContent = generatedText;
    }
    switchGeneratedTab('scene');
}

// ─────────────────────────────────────
// === Send Chat Messages ===
// ─────────────────────────────────────

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

    const userMessage = collectFn('expTextInput');
    if (!userMessage) {
        return;
    }

    reflectFn(userMessage);

    if (getExpCurrentPhase() === 'interpret') {
        setExpPendingEmotion(userMessage);
        addMsgFn('ai', 'Analyzing emotions...');

        let emotionResult = null;
        try {
            const aiService = window.AIService || AIService;
            emotionResult = await aiService.call('emotion_analysis', userMessage, {
                reasonText: ''
            });
            console.log('Exp emotionResult (raw):', JSON.stringify(emotionResult));
        } catch (e) {
            console.error('Exp emotion analysis failed:', e);
            const errorMessage = e.message && e.message.includes('Response format error')
                ? 'Response format error, please try again.'
                : 'Emotion analysis failed. Please try again.';
            addMsgFn('ai', errorMessage);
            return;
        }

        const parsedResult = parseFn(emotionResult);
        persistFn(parsedResult, userMessage);
        addConfirmFn('ai', 'Does this emotion feel right?');
    } else {
        addMsgFn('ai', 'When the narrator\'s memory arrives, tell me what you feel inside it.');
    }
}

async function sendExpChatMessage() {
    const userMessage = collectChatMessage('expTextInput');
    if (!userMessage) {
        return;
    }

    reflectExpChatMessageUI(userMessage);

    if (expCurrentPhase === 'interpret') {
        
        appStore.setState({ expPendingEmotion: userMessage });
        addExpChatMessage('ai', 'Analyzing emotions...');

        let emotionResult = null;
        try {
            const aiService = window.AIService || AIService;
            emotionResult = await aiService.call('emotion_analysis', userMessage, {
                reasonText: ''
            });
            console.log('Exp emotionResult (raw):', JSON.stringify(emotionResult));
        } catch (e) {
            console.error('Exp emotion analysis failed:', e);
            const errorMessage = e.message && e.message.includes('Response format error')
                ? 'Response format error, please try again.'
                : 'Emotion analysis failed. Please try again.';
            addExpChatMessage('ai', errorMessage);
            return;
        }

        const parsedResult = parseEmotionAnalysisResult(emotionResult);
        persistExpEmotionResult(parsedResult, userMessage);
        addExpChatMessageWithConfirm('ai', 'Does this emotion feel right?');
    } else {
        addExpChatMessage('ai', 'When the narrator\'s memory arrives, tell me what you feel inside it.');
    }
}

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

    const userMessage = collectFn('liveTextInput');
    if (!userMessage) {
        return;
    }

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

    reflectFn(userMessage);

    if (getCurrentPhase() === 'scene') {
        updateStatusFn('The experiencer is waiting for a scene...');

        try {
            const aiService = window.AIService || AIService;
            const aiResponse = await aiService.call('scene_generation', userMessage, {
                conversationHistory: getConversationHistory(),
                systemPrompt: getAISystemPrompt()
            });

            const generatedText = parseFn(aiResponse);
            pushConversationHistory({ role: 'assistant', content: aiResponse.response });
            persistFn(generatedText);
            addConfirmFn('ai', 'Does this memory feel right?');
            updateStatusFn('The experiencer is reading the scene...');
        } catch (error) {
            console.error('AI API error:', error);
            const errorMessage = error.message && error.message.includes('Response format error')
                ? 'Response format error, please try again.'
                : 'Sorry, something went wrong. Could you say that again?';
            addMsgFn('ai', errorMessage);
            showNotification('Error in AI response');
        }
    }
}

async function sendChatMessage() {
    console.log('sendChatMessage called');
    console.log('sendChatMessage currentPhase:', currentPhase);

    const userMessage = collectChatMessage('liveTextInput');
    if (!userMessage) {
        return;
    }

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

    reflectChatMessageUI(userMessage);

    if (currentPhase === 'scene') {
        updateExperiencerStatus('The experiencer is waiting for a scene...');

        try {
            const aiService = window.AIService || AIService;
            const aiResponse = await aiService.call('scene_generation', userMessage, {
                conversationHistory: conversationHistory,
                systemPrompt: AI_SYSTEM_PROMPT
            });

            const generatedText = parseSceneGenerationResult(aiResponse);
            conversationHistory.push({ role: 'assistant', content: aiResponse.response });
            persistSceneGenerationResult(generatedText);
            addChatMessageWithConfirm('ai', 'Does this memory feel right?');
            updateExperiencerStatus('The experiencer is reading the scene...');
        } catch (error) {
            console.error('AI API error:', error);
            const errorMessage = error.message && error.message.includes('Response format error')
                ? 'Response format error, please try again.'
                : 'Sorry, something went wrong. Could you say that again?';
            addChatMessage('ai', errorMessage);
            showNotification('Error in AI response');
        }
    }

    const sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) sendBtn.disabled = false;
    const input = document.getElementById('liveTextInput');
    if (input) input.focus();
}

// ─────────────────────────────────────
// === Confirm Handlers ===
// ─────────────────────────────────────

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
            if (typeof window.startExpInterview === 'function') {
                console.log('[handleConfirm] expInterview start (ritual flow)');
                const ritualScene = {
                    scene_order: appStore.getState().liveSceneNum || 1,
                    text: sceneText,
                    original_emotion: null,
                    scene_type: 'branch'
                };
                window.startExpInterview(ritualScene);
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

            const state = appStore.getState();
            if (state.currentMode === 'ritual') {
                await window.saveRitualScene(finalSceneObject);
            } else {
                await saveLiveScene(finalSceneObject);
            }
            if (finalSceneObject?.emotionAnalysis) {
                updateNarratorWave(finalSceneObject.emotionAnalysis);
                window.narratorEmotionVector = finalSceneObject.emotionAnalysis?.base || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 };
                console.log('화자 감정 벡터 저장:', window.narratorEmotionVector);
                const supabaseClient = getSupabaseClient();
                const checkState = appStore.getState();
                if (supabaseClient && checkState.currentSessionId) {
                    try {
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

async function handleExpConfirm(answer) { removeExpConfirmButtons(); const currentScene = appStore.getState().currentScene; if (answer === 'yes') { addExpChatMessage('user', 'Yes'); if (expFinalObject) { addExpChatMessage('ai', 'Converting emotion to wave...'); await saveExpInterpretation(expFinalObject); if (expFinalObject.emotionAnalysis && appStore.getState().currentSessionId) { await saveExperiencerChoice(expFinalObject.emotionAnalysis.base) } if (expFinalObject.emotionAnalysis) { window.experiencerEmotionVector = expFinalObject.emotionAnalysis.base; const experiencerWave = emotionVectorToWaveStyle(expFinalObject.emotionAnalysis.base); window.currentExperiencerWave = experiencerWave; updateAlignmentWave(); renderExperiencerWave(expFinalObject.emotionAnalysis); updateExperiencerAlignment() } setTimeout(() => checkAlignment(), 1000) } addExpChatMessage('ai', 'Emotion sent.'); expCurrentPhase = 'waiting'; appStore.setState({ expPendingEmotion: '' }); expGeneratedEmotion = ''; expFinalObject = null; const emotionText = document.getElementById('expEmotionText'); if (emotionText) emotionText.textContent = ''; switchExpGeneratedTab('scene'); addExpChatMessage('ai', '다음 기억을 기다리고 있어.') } else { addExpChatMessage('user', 'No'); addExpChatMessage('ai', '다시 감정을 입력 please.'); const expTextInput = document.getElementById('expTextInput'); if (expTextInput) { expTextInput.focus() } } }

async function saveExpInterpretation(data) {
    // Fully disabled since live_interpretations table does not exist
    return;
}

async function saveExperiencerChoice(emotionVector) { console.log('=== saveExperiencerChoice called ==='); console.log('emotionVector:', JSON.stringify(emotionVector)); const state = appStore.getState(); console.log('currentSessionId:', state.currentSessionId); console.log('liveSceneNum:', state.liveSceneNum); if (!state.currentSessionId) { console.error('currentSessionId가 not found!'); return } let userId; if (state.currentUser) { userId = state.currentUser.id } else { if (!window.anonymousUserId) { window.anonymousUserId = crypto.randomUUID() } userId = window.anonymousUserId } const insertData = { live_session_id: state.currentSessionId, scene_id: null, user_id: userId, emotion_vector: emotionVector || { fear: 0, sadness: 0, anger: 0, joy: 0, longing: 0, guilt: 0 }, created_at: new Date().toISOString() }; console.log('choices INSERT 데이터:', JSON.stringify(insertData)); try { const result = await networkService.saveChoice(insertData); if (!result.ok) { console.error('choices INSERT error:', result.error); throw result.error } console.log('체험자 감정 저장 complete:', result.data); showNotification('감정이 choices 테이블에 저장 complete') } catch (e) { console.error('saveExperiencerChoice error:', e); showNotification('choices 테이블 Save failed: ' + e.message) } }

// ─────────────────────────────────────
// === Scene Navigation (Live) ===
// ─────────────────────────────────────

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
            const currentData = window.currentStoryData;
            const currentScene = state.currentScene;
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

function makeLiveChoice(choiceIndex) { try { const state = appStore.getState(); appStore.setState({ userChoices: [...state.userChoices, choiceIndex] }); const currentData = window.currentStoryData; const updatedState = appStore.getState(); if (!currentData || !currentData.scenes || !currentData.scenes[updatedState.currentScene]) { showNotification('Unable to load scene data'); return } const scene = currentData.scenes[updatedState.currentScene]; if (choiceIndex === scene.originalChoice) { appStore.setState({ liveMatches: updatedState.liveMatches + 1 }); const matchesEl = document.getElementById('liveMatches'); if (matchesEl) matchesEl.textContent = updatedState.liveMatches + 1 } appStore.setState({ liveFragments: updatedState.liveFragments + 1 }); const fragmentsEl = document.getElementById('liveFragments'); if (fragmentsEl) fragmentsEl.textContent = updatedState.liveFragments + 1; const sceneType = scene.sceneType || 'normal'; if (sceneType === 'branch' || sceneType === 'ending') { const questionEl = document.getElementById('emotionQuestion'); if (questionEl) questionEl.textContent = updatedState.currentScene === 0 ? "왜 그렇게 했어?" : "지금 어떤 감정이 들어?"; const modalEl = document.getElementById('emotionModal'); if (modalEl) modalEl.classList.add('active'); const inputEl = document.getElementById('emotionInputField'); if (inputEl) inputEl.focus() } else { window.proceedToNextSceneLive() } } catch (e) { console.error('makeLiveChoice error:', e); showNotification('An error occurred') } }

function submitExperiencerFeeling() { try { const feelingInput = document.getElementById('experiencerFeelingInput'); if (!feelingInput) { showNotification('Input field not found'); return } const feeling = feelingInput.value.trim(); if (!feeling) { showNotification('Please describe how the narrator might have felt'); return } const state = appStore.getState(); appStore.setState({ userReasons: [...state.userReasons, feeling], liveFragments: state.liveFragments + 1 }); const updatedState = appStore.getState(); const fragmentsEl = document.getElementById('liveFragments'); if (fragmentsEl) fragmentsEl.textContent = updatedState.liveFragments; updateLiveAlignment(0.1 + Math.random() * 0.15); showNotification('Emotion recorded'); feelingInput.value = ''; setTimeout(() => { window.proceedToNextSceneLive() }, 1000) } catch (e) { console.error('submitExperiencerFeeling error:', e); showNotification('An error occurred') } }

function submitScene() { console.log('submitScene called'); const input = document.getElementById('sceneTextInput'); const submitBtn = document.querySelector('.scene-submit-btn'); if (!input.value.trim()) { showNotification('Please enter a scene'); return } currentSceneText = input.value.trim(); submitBtn.disabled = true; submitBtn.textContent = 'AI is converting scene...'; generateSceneAI(currentSceneText).then(aiScene => { const liveSceneContent = document.getElementById('liveSceneContent'); if (liveSceneContent) { liveSceneContent.textContent = aiScene } const traceContent = document.getElementById('traceContent'); if (traceContent) { traceContent.textContent = 'Scene sent to experiencer' } showNotification('AI converted and sent the scene') }).catch(err => { console.error('AI scene generation error:', err); showNotification('An error occurred during scene conversion'); const traceContent = document.getElementById('traceContent'); if (traceContent) { traceContent.textContent = currentSceneText } }).finally(() => { input.value = ''; currentSceneText = ''; recognizedText = ''; submitBtn.disabled = false; submitBtn.textContent = '제출'; const voiceStartPrompt = document.getElementById('voiceStartPrompt'); if (voiceStartPrompt) voiceStartPrompt.style.display = 'flex'; const textInputContainer = document.getElementById('textInputContainer'); if (textInputContainer) textInputContainer.style.display = 'none'; updateLiveAlignment(0.15); }) }

// ─────────────────────────────────────
// === Wave & Alignment Display ===
// ─────────────────────────────────────

function updateLiveAlignment(delta) { const state = appStore.getState(); const newAlignment = Math.min(1, state.currentAlignment + delta); appStore.setState({ currentAlignment: newAlignment }); const updatedState = appStore.getState(); const liveAlignmentValue = document.getElementById('liveAlignmentValue'); if (liveAlignmentValue) { liveAlignmentValue.textContent = updatedState.currentAlignment.toFixed(2); if (updatedState.currentAlignment >= 0.8) liveAlignmentValue.classList.add('high') } const liveAlignmentFill = document.getElementById('liveAlignmentFill'); if (liveAlignmentFill) liveAlignmentFill.style.width = (updatedState.currentAlignment * 100) + '%'; const alignmentPercentage = document.getElementById('alignmentPercentage'); if (alignmentPercentage) alignmentPercentage.textContent = String(Math.round(updatedState.currentAlignment * 100)).padStart(2, '0') + '%'; const expAlignmentPercentage = document.getElementById('expAlignmentPercentage'); if (expAlignmentPercentage) expAlignmentPercentage.textContent = String(Math.round(updatedState.currentAlignment * 100)).padStart(2, '0') + '%' }

function lerp(a, b, t) { return a + (b - a) * t }
function lerpColor(a, b, t) { return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) } }
function noise(x, y, z) { const n = Math.sin(x * 12.9898 + y * 78.233 + (z || 0) * 37.719) * 43758.5453; return n - Math.floor(n) }

function updateNarratorWave(emotionAnalysis) { currentNarratorWave = emotionVectorToWaveStyle(emotionAnalysis?.base); console.log('화자 파동 update:', currentNarratorWave) }

function renderExperiencerWave(emotionAnalysis) { console.log('체험자 파동 rendering:', emotionAnalysis); if (!emotionAnalysis || !emotionAnalysis.base) { console.error('emotionAnalysis 또는 base가 not found'); return } const emotionVector = emotionAnalysis.base; window.experiencerEmotionVector = emotionVector; const experiencerWave = emotionVectorToWaveStyle(emotionAnalysis.base); window.currentExperiencerWave = experiencerWave; updateAlignmentWave(); console.log('체험자 Wave rendering complete:', experiencerWave) }

function computeArchiveWaveData(emotionVector, sceneTextLength, voidLevel) { const totalEmotion = Object.values(emotionVector).reduce((sum, val) => sum + (val || 0), 0); const intensity = Math.min(1, Math.max(0.3, totalEmotion / 8)); const waveStyle = emotionVectorToWaveStyle(emotionVector); const wavePoints = []; const width = Math.max(100, Math.min(500, sceneTextLength * 10)); for (let i = 0; i < width; i++) { const x = i / width; const baseY = 0.5; const amplitude = voidLevel === 'high' ? 0.15 : 0.25; const frequency = 0.02 + intensity * 0.01; const y = baseY + Math.sin(x * Math.PI * 2 * frequency * 10) * amplitude; wavePoints.push({ x, y }) } const c = waveStyle.color; return { wavePoints, color: `rgba(${c.r},${c.g},${c.b},0.8)`, intensity, voidLevel } }

function updateExperiencerStatus(status) { const floatEl = document.getElementById('experiencerStatusFloat'); if (!floatEl) return; floatEl.style.display = 'block'; floatEl.textContent = status; experiencerStatusPosition = experiencerStatusPosition === 'left' ? 'right' : 'left'; floatEl.classList.remove('left', 'right'); floatEl.classList.add(experiencerStatusPosition) }

// ─────────────────────────────────────
// === Edit Mode ===
// ─────────────────────────────────────

function toggleEditMode() { const editBtn = document.querySelector('.edit-toggle-btn'); let textEl, textarea, confirmMsg; if (currentPhase === 'scene' || currentPhase === 'complete') { textEl = document.querySelector('#generatedSceneContent .generated-text'); textarea = document.getElementById('editSceneTextarea'); confirmMsg = 'Does this memory feel right?' } else if (currentPhase === 'emotion') { textEl = document.querySelector('#generatedEmotionContent .generated-text'); textarea = document.getElementById('editEmotionTextarea'); confirmMsg = 'Is this what you felt?' } if (!textEl || !textarea) return; isEditMode = !isEditMode; if (isEditMode) { textarea.value = textEl.textContent; textEl.style.display = 'none'; textarea.style.display = 'block'; editBtn.textContent = 'Save'; editBtn.classList.add('active') } else { textEl.textContent = textarea.value; textEl.style.display = 'block'; textarea.style.display = 'none'; editBtn.textContent = 'Edit'; editBtn.classList.remove('active'); showNotification('Edit complete'); if (currentPhase !== 'complete') { addChatMessageWithConfirm('ai', confirmMsg) } } }

function saveEditedScene() { const textarea = document.getElementById('editSceneTextarea'); if (!textarea || !textarea.value.trim()) { showNotification('Please enter your edit'); return } if (currentGeneratedSceneObj) { currentGeneratedSceneObj.text = textarea.value.trim() } currentGeneratedScene = textarea.value.trim(); const sceneContent = document.getElementById('generatedSceneContent').querySelector('.generated-text'); if (sceneContent) sceneContent.textContent = textarea.value.trim(); showNotification('Scene edit complete') }

// ─────────────────────────────────────
// === Voice Input ===
// ─────────────────────────────────────

function startVoiceMode() { document.getElementById('voiceStartPrompt').style.display = 'none'; document.getElementById('textInputContainer').style.display = 'none'; document.getElementById('voiceWaveContainer').style.display = 'flex'; isVoiceMode = true; startSpeechRecognition(); startVoiceVisualization() }
function switchToTextMode() { if (recognition) { recognition.stop() } stopVoiceVisualization(); document.getElementById('voiceStartPrompt').style.display = 'none'; document.getElementById('voiceWaveContainer').style.display = 'none'; document.getElementById('textInputContainer').style.display = 'block'; isVoiceMode = false; if (recognizedText) { document.getElementById('sceneTextInput').value = recognizedText } }
function startSpeechRecognition() { if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { showNotification('This browser does not support speech recognition'); switchToTextMode(); return } const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; recognition = new SpeechRecognition(); recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true; recognition.onresult = function (event) { let interim = ''; let final = ''; for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) { final += event.results[i][0].transcript } else { interim += event.results[i][0].transcript } } if (final) { recognizedText += final + ' ' } }; recognition.onerror = function (event) { console.error('Speech recognition error:', event.error); if (event.error === 'not-allowed') { showNotification('Microphone permission required') } }; recognition.onend = function () { if (isVoiceMode) { recognition.start() } }; recognition.start(); showNotification('음성 인식이 시작 complete') }
function startVoiceVisualization() { navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) { audioContext = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioContext.createAnalyser(); microphone = audioContext.createMediaStreamSource(stream); microphone.connect(analyser); analyser.fftSize = 256; const bufferLength = analyser.frequencyBinCount; const dataArray = new Uint8Array(bufferLength); const canvas = document.getElementById('voiceWaveCanvas'); const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; function draw() { voiceAnimationId = requestAnimationFrame(draw); analyser.getByteFrequencyData(dataArray); ctx.fillStyle = 'rgba(18,18,26,0.3)'; ctx.fillRect(0, 0, canvas.width, canvas.height); const barWidth = (canvas.width / bufferLength) * 2.5; let x = 0; for (let i = 0; i < bufferLength; i++) { const barHeight = (dataArray[i] / 255) * canvas.height * 0.8; const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height); gradient.addColorStop(0, 'rgba(196,168,130,0.8)'); gradient.addColorStop(1, 'rgba(196,168,130,0.4)'); ctx.fillStyle = gradient; ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight); x += barWidth } } draw() }).catch(function (err) { console.error('Microphone access denied:', err); showNotification('마이크 접근이 거부 complete') }) }
function stopVoiceVisualization() { if (voiceAnimationId) { cancelAnimationFrame(voiceAnimationId) } if (audioContext) { audioContext.close() } audioContext = null; analyser = null; microphone = null }

function switchToTextInput() { const waveSection = document.querySelector('.voice-wave-section'); const switchBtn = document.querySelector('.text-switch-btn'); if (waveSection && switchBtn) { waveSection.style.display = 'none'; const textInputContainer = document.createElement('div'); textInputContainer.className = 'text-input-container-live'; textInputContainer.style.width = '100%'; textInputContainer.innerHTML = `<div class="chat-input-wrapper"><textarea class="chat-input-textarea" id="liveTextInput" placeholder="Tell your memory..." rows="3"></textarea><button class="chat-send-btn" id="chatSendBtn" onclick="sendChatMessage()">Send</button></div>`; switchBtn.parentElement.insertBefore(textInputContainer, switchBtn); switchBtn.textContent = 'Switch to Voice'; switchBtn.onclick = function () { switchToVoiceInput() }; const input = document.getElementById('liveTextInput'); if (input) { input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChatMessage() } }); input.focus() } } }
function switchToVoiceInput() { const textContainer = document.querySelector('.text-input-container-live'); const switchBtn = document.querySelector('.text-switch-btn'); const waveSection = document.querySelector('.voice-wave-section'); if (textContainer) { textContainer.remove() } if (waveSection) { waveSection.style.display = 'block' } if (switchBtn) { switchBtn.textContent = 'Switch to Text'; switchBtn.onclick = function () { switchToTextInput() } } }
function switchExpToTextInput() { if (isExpRecording) { if (expMediaRecorder && expMediaRecorder.state !== 'inactive') { expMediaRecorder.stop(); isExpRecording = false } } const waveSection = document.getElementById('expVoiceWaveSection'); const switchBtn = document.querySelector('.experiencer-panel .text-switch-btn'); if (waveSection && switchBtn) { waveSection.style.display = 'none'; const textInputContainer = document.createElement('div'); textInputContainer.className = 'text-input-container-live'; textInputContainer.style.width = '100%'; textInputContainer.innerHTML = `<div class="chat-input-wrapper"><textarea class="chat-input-textarea" id="expTextInput" placeholder="Enter your emotion..." rows="3"></textarea><button class="chat-send-btn" id="expChatSendBtn" onclick="sendExpChatMessage()">Send</button></div>`; switchBtn.parentElement.insertBefore(textInputContainer, switchBtn); switchBtn.textContent = 'Switch to Voice'; switchBtn.onclick = function () { switchExpToVoiceInput() }; const input = document.getElementById('expTextInput'); if (input) { input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendExpChatMessage() } }); input.focus() } } }
function switchExpToVoiceInput() { const textContainer = document.querySelector('.experiencer-panel .text-input-container-live'); const switchBtn = document.querySelector('.experiencer-panel .text-switch-btn'); const waveSection = document.getElementById('expVoiceWaveSection'); if (textContainer) { textContainer.remove() } if (waveSection) { waveSection.style.display = 'block' } if (switchBtn) { switchBtn.textContent = 'Switch to Text'; switchBtn.onclick = function () { switchExpToTextInput() } } }

// ─────────────────────────────────────
// === Recording & Transcription ===
// ─────────────────────────────────────

async function toggleRecording(e) { if (e) e.stopPropagation(); const btn = document.getElementById('voiceBtn'); if (!btn) return; if (!isRecording) { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorder = new MediaRecorder(stream); audioChunks = []; mediaRecorder.ondataavailable = (e) => { audioChunks.push(e.data) }; mediaRecorder.onstop = async () => { if (audioChunks.length === 0) { btn.textContent = '🎤 Voice Input'; showNotification('No recording found'); mediaRecorder.stream.getTracks().forEach(track => track.stop()); return } const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); btn.textContent = '⏳ Converting...'; const text = await transcribeAudio(audioBlob); if (text) { const sceneInput = document.getElementById('liveTextInput'); if (sceneInput) { sceneInput.value = text; sceneInput.focus(); setTimeout(() => { sendChatMessage() }, 100) } else { const unifiedInput = document.getElementById('unifiedInput'); if (unifiedInput) { unifiedInput.value = text; unifiedInput.focus(); setTimeout(() => { handleUnifiedSubmit(text) }, 100) } else { showNotification('Input field not found') } } } else { showNotification('Voice conversion failed') } btn.textContent = '🎤 Voice Input'; mediaRecorder.stream.getTracks().forEach(track => track.stop()) }; mediaRecorder.start(); isRecording = true; btn.textContent = '⏹️ 녹음 중지'; showNotification('녹음이 시작 complete') } catch (err) { console.error('녹음 시작 error:', err); alert('마이크 권한이 필요합니다'); btn.textContent = '🎤 Voice Input' } } else { if (mediaRecorder && mediaRecorder.state !== 'inactive') { mediaRecorder.stop(); isRecording = false } } }

async function transcribeAudio(audioBlob) { try { const supabaseClient = getSupabaseClient(); if (!supabaseClient) { throw new Error('Supabase client not initialized') } if (!audioBlob || audioBlob.size === 0) { throw new Error('No recording data found') } const formData = new FormData(); formData.append('audio', audioBlob, 'audio.webm'); const { data, error } = await supabaseClient.functions.invoke('transcribe-audio', { body: formData }); if (error) { console.error('Supabase Edge Function error:', error); throw error } if (!data || !data.text) { console.error('응답 데이터 형식 error:', data); throw new Error('Invalid response data format') } const text = data.text; let sceneInput = document.getElementById('liveTextInput'); if (!sceneInput) { const switchBtn = document.querySelector('.text-switch-btn'); if (switchBtn && typeof switchToTextInput === 'function') { switchToTextInput(); sceneInput = document.getElementById('liveTextInput') } } if (sceneInput) { sceneInput.value = text; sceneInput.focus() } return text } catch (err) { console.error('음성 변환 에러:', err); const errorMsg = err.message || 'Voice conversion failed'; showNotification(errorMsg); return null } }

async function transcribeExpAudio(audioBlob) { try { const supabaseClient = getSupabaseClient(); if (!supabaseClient) { throw new Error('Supabase client not initialized') } if (!audioBlob || audioBlob.size === 0) { throw new Error('No recording data found') } const formData = new FormData(); formData.append('audio', audioBlob, 'audio.webm'); const { data, error } = await supabaseClient.functions.invoke('transcribe-audio', { body: formData }); if (error) { console.error('Supabase Edge Function error:', error); throw error } if (!data || !data.text) { console.error('응답 데이터 형식 error:', data); throw new Error('Invalid response data format') } const text = data.text; let expInput = document.getElementById('expTextInput'); if (!expInput) { showNotification('Input field not found'); return null } expInput.value = text; expInput.focus(); setTimeout(() => { sendExpChatMessage() }, 100); return text } catch (err) { console.error('음성 변환 에러:', err); const errorMsg = err.message || 'Voice conversion failed'; showNotification(errorMsg); return null } }

async function toggleExpRecording(e) { if (e) e.stopPropagation(); const btn = document.getElementById('expVoiceBtn'); if (!btn) return; if (!isExpRecording) { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); expMediaRecorder = new MediaRecorder(stream); expAudioChunks = []; expMediaRecorder.ondataavailable = (e) => { expAudioChunks.push(e.data) }; expMediaRecorder.onstop = async () => { if (expAudioChunks.length === 0) { btn.textContent = '🎤 Voice Input'; showNotification('No recording found'); expMediaRecorder.stream.getTracks().forEach(track => track.stop()); return } const audioBlob = new Blob(expAudioChunks, { type: 'audio/webm' }); btn.textContent = '⏳ Converting...'; const text = await transcribeExpAudio(audioBlob); if (text) { showNotification('Voice input complete') } else { showNotification('Voice conversion failed') } btn.textContent = '🎤 Voice Input'; expMediaRecorder.stream.getTracks().forEach(track => track.stop()) }; expMediaRecorder.start(); isExpRecording = true; btn.textContent = '⏹️ 녹음 중지'; showNotification('녹음이 시작 complete') } catch (err) { console.error('녹음 시작 error:', err); alert('마이크 권한이 필요합니다'); btn.textContent = '🎤 Voice Input' } } else { if (expMediaRecorder && expMediaRecorder.state !== 'inactive') { expMediaRecorder.stop(); isExpRecording = false } } }

// ─────────────────────────────────────
// === Live Voice Wave Animation ===
// ─────────────────────────────────────

function startLiveVoiceInput() { if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { showNotification('This browser does not support speech recognition'); return } const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; liveVoiceRecognition = new SpeechRecognition(); liveVoiceRecognition.lang = 'en-US'; liveVoiceRecognition.continuous = true; liveVoiceRecognition.interimResults = true; liveRecognizedText = ''; liveVoiceRecognition.onresult = function (event) { let interim = ''; let final = ''; for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) { final += event.results[i][0].transcript } else { interim += event.results[i][0].transcript } } if (final) { liveRecognizedText += final + ' ' } }; liveVoiceRecognition.onerror = function (event) { console.error('Speech recognition error:', event.error); if (event.error === 'not-allowed') { showNotification('Microphone permission required'); stopLiveVoiceInput() } }; liveVoiceRecognition.onend = function () { if (isLiveVoiceRecording && liveVoiceRecognition) { liveVoiceRecognition.start() } }; liveVoiceRecognition.start(); navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) { liveVoiceContext = new (window.AudioContext || window.webkitAudioContext)(); liveVoiceAnalyser = liveVoiceContext.createAnalyser(); liveVoiceMicrophone = liveVoiceContext.createMediaStreamSource(stream); liveVoiceMicrophone.connect(liveVoiceAnalyser); liveVoiceAnalyser.fftSize = 256; const bufferLength = liveVoiceAnalyser.frequencyBinCount; const dataArray = new Uint8Array(bufferLength); const canvas = document.getElementById('voiceWaveCanvasLive'); const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2); function draw() { if (!isLiveVoiceRecording) return; liveVoiceAnimationId = requestAnimationFrame(draw); liveVoiceAnalyser.getByteFrequencyData(dataArray); ctx.fillStyle = 'rgba(10,10,12,0.9)'; ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2); const barWidth = (canvas.width / 2 / bufferLength) * 2.5; let x = 0; for (let i = 0; i < bufferLength; i++) { const barHeight = (dataArray[i] / 255) * canvas.height * 0.9; const gradient = ctx.createLinearGradient(0, canvas.height / 2 - barHeight, 0, canvas.height / 2); gradient.addColorStop(0, 'rgba(122,154,122,0.9)'); gradient.addColorStop(1, 'rgba(74,144,217,0.5)'); ctx.fillStyle = gradient; ctx.fillRect(x, canvas.height / 2 - barHeight, barWidth - 1, barHeight * 2); x += barWidth } } draw() }).catch(function (err) { console.error('Microphone access denied:', err); showNotification('마이크 접근이 거부 complete'); stopLiveVoiceInput() }); isLiveVoiceRecording = true; const waveSection = document.querySelector('.voice-wave-section'); if (waveSection) waveSection.style.border = '2px solid rgba(122,154,122,0.5)'; showNotification('음성 입력이 시작 complete. 말한 내용은 자동으로 전송됩니다.') }

function stopLiveVoiceInput() { if (!isLiveVoiceRecording && !liveVoiceRecognition) return; isLiveVoiceRecording = false; if (liveVoiceRecognition) { liveVoiceRecognition.stop(); liveVoiceRecognition = null } if (liveVoiceAnimationId) { cancelAnimationFrame(liveVoiceAnimationId); liveVoiceAnimationId = null } if (liveVoiceContext) { liveVoiceContext.close(); liveVoiceContext = null } liveVoiceAnalyser = null; liveVoiceMicrophone = null; if (liveRecognizedText.trim()) { const input = document.getElementById('liveTextInput'); if (input) { input.value = liveRecognizedText.trim(); sendChatMessage(); liveRecognizedText = '' } else { addChatMessage('user', liveRecognizedText.trim()); conversationHistory.push({ role: 'user', content: liveRecognizedText.trim() }); callClaudeAPI(liveRecognizedText.trim()).then(aiResponse => { addChatMessage('ai', aiResponse); conversationHistory.push({ role: 'assistant', content: aiResponse }); if (aiResponse.includes('[SCENE_READY]')) { parseAndGenerateScene(aiResponse) } }).catch(error => { console.error('AI API error:', error); addChatMessage('ai', 'Sorry, something went wrong. Could you say that again?') }); liveRecognizedText = '' } } const waveSection = document.querySelector('.voice-wave-section'); if (waveSection) waveSection.style.border = 'none'; startVoiceWaveLiveAnimation(); showNotification('음성 입력이 중지 complete') }

async function callClaudeAPI(userMessage) { try { const messages = conversationHistory.length > 0 ? conversationHistory : [{ role: 'user', content: userMessage }]; if (conversationHistory.length === 0 || conversationHistory[conversationHistory.length - 1].role !== 'user') { messages.push({ role: 'user', content: userMessage }) } const response = await fetch(SUPABASE_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify({ text: userMessage, conversationHistory: messages, systemPrompt: AI_SYSTEM_PROMPT }) }); if (!response.ok) { const error = await response.json(); throw new Error(error.error || error.details || 'API call failed') } const data = await response.json(); if (data.scene) { return data.scene } else if (data.response) { return data.response } else { throw new Error(data.error || 'No response received') } } catch (error) { console.error('callClaudeAPI error:', error); throw error } }

function parseAndGenerateScene(aiResponse) { try { const sceneReadyIndex = aiResponse.indexOf('[SCENE_READY]'); if (sceneReadyIndex === -1) return; const jsonStr = aiResponse.substring(sceneReadyIndex + '[SCENE_READY]'.length).trim(); const sceneData = JSON.parse(jsonStr); currentGeneratedSceneObj = sceneData.scene; currentGeneratedEmotion = sceneData.emotion; if (sceneData.scene && sceneData.scene.text) { currentGeneratedScene = sceneData.scene.text } updateGeneratedTabs(sceneData); updateAlignmentFromScene(sceneData); showNotification('Scene generated') } catch (error) { console.error('Scene parsing error:', error); showNotification('An error occurred during scene generation') } }

function updateGeneratedTabs(sceneData) { if (sceneData.scene && sceneData.scene.text) { const sceneContent = document.getElementById('generatedSceneContent').querySelector('.generated-text'); if (sceneContent) { sceneContent.textContent = sceneData.scene.text; sceneContent.classList.remove('void-scene') } const editTextarea = document.getElementById('editSceneTextarea'); if (editTextarea) editTextarea.value = sceneData.scene.text } if (sceneData.emotion && sceneData.emotion.text) { const emotionContent = document.getElementById('generatedEmotionContent').querySelector('.generated-text'); if (emotionContent) { emotionContent.textContent = sceneData.emotion.text; emotionContent.classList.remove('void-reason') } } if (sceneData.voidInfo) { const sceneContent = document.getElementById('generatedSceneContent').querySelector('.generated-text'); const emotionContent = document.getElementById('generatedEmotionContent').querySelector('.generated-text'); if (sceneData.voidInfo.sceneVoid && sceneContent) { sceneContent.classList.add('void-scene') } if (sceneData.voidInfo.reasonVoid && emotionContent) { emotionContent.classList.add('void-reason') } } }

// [V3 DEPRECATED] accumulation 방식 alignment calculation remove.
function updateAlignmentFromScene(sceneData) {
  console.log('[V3] updateAlignmentFromScene called — 무시 (ByeoriEngine SSOT)');
}

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

// ─────────────────────────────────────
// === State Reset (for ritual/external callers) ===
// ─────────────────────────────────────

function resetLiveState() {
    conversationHistory = [];
    currentGeneratedSceneObj = null;
    currentGeneratedEmotion = null;
    currentPhase = 'scene';
    pendingEmotionText = '';
    currentGeneratedScene = '';
    finalSceneObject = null;
    isEditMode = false;
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

    // Phase 2: Live session start
    startLiveSession,

    // Phase 2: Chat & scene generation
    sendNarratorInput,
    handleUnifiedSubmit,
    generateSceneAI,
    analyzeEmotionWithVector,
    sendChatMessage,
    sendChatMessageWithDeps,
    sendExpChatMessage,
    sendExpChatMessageWithDeps,

    // Phase 2: Chat UI
    addChatMessage,
    addChatMessageWithConfirm,
    removeConfirmButtons,
    addExpChatMessage,
    addExpChatMessageWithConfirm,
    removeExpConfirmButtons,

    // Phase 2: Tab switching
    switchGeneratedTab,
    switchExpGeneratedTab,

    // Phase 2: Parsing & formatting
    extractGeneratedText,
    parseEmotionInput,
    formatEmotionVector,
    parseEmotionAnalysisResult,
    parseSceneGenerationResult,

    // Phase 2: Confirm handlers
    handleConfirm,
    handleExpConfirm,

    // Phase 2: Scene navigation
    simulateNarratorInput,
    renderLiveEchoLayer,
    makeLiveChoice,
    submitExperiencerFeeling,
    submitScene,

    // Phase 2: Wave & alignment
    updateLiveAlignment,
    updateNarratorWave,
    renderExperiencerWave,
    computeArchiveWaveData,
    updateExperiencerStatus,

    // Phase 2: Edit mode
    toggleEditMode,
    saveEditedScene,

    // Phase 2: Voice input
    startVoiceMode,
    switchToTextMode,
    switchToTextInput,
    switchToVoiceInput,
    switchExpToTextInput,
    switchExpToVoiceInput,

    // Phase 2: Recording
    toggleRecording,
    toggleExpRecording,

    // Phase 2: Live voice
    startLiveVoiceInput,
    stopLiveVoiceInput,
    startVoiceWaveLiveAnimation,
    stopVoiceWaveLiveAnimation,

    // Phase 2: State reset
    resetLiveState,
};

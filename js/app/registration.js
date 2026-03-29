import { appStore } from './appStore.js';
/**
 * Memory Registration Module — conversation-driven memory collection flow.
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   appStore, window.showNotification, window.showConfessionHub,
 *   window.loadMemoriesFromSupabase, window.sortMemories
 */

import { getSupabaseClient } from '../lib/supabaseClient.js';
import { MemoryService } from '../services/MemoryService.js';
import { NPC_DIALOGUES } from '../npc-dialogues.js';

// === Module State ===
let supabaseClient = null;

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

// ─────────────────────────────────────
// === UI Functions ===
// ─────────────────────────────────────

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

    // Return to Confession Hub
    window.showConfessionHub();
}

// ─────────────────────────────────────
// === Conversation ===
// ─────────────────────────────────────

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
            window.showNotification('No Supabase client');
            return;
        }

        const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../lib/config.js');
        const supabaseUrl = SUPABASE_URL;

        let authToken = '';
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            authToken = session?.access_token || '';
        } catch (e) {
            console.warn('세션 가져오기 실패, anon key만 사용:', e);
        }

        console.log('collect-memory streaming call start:', {
            conversationLength: memoryRegistrationState.conversationHistory.length,
            systemPrompt: memoryCollectionSystemPrompt.substring(0, 50) + '...',
            hasAuthToken: !!authToken
        });

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
            console.error('collect-memory function error:', errorData);

            if (response.status === 0 || errorData.error?.includes('CORS')) {
                window.showNotification('Edge Function not deployed or CORS misconfigured. Please deploy the collect-memory function.');
            } else {
                window.showNotification('Error processing conversation: ' + (errorData.error || 'Unknown error'));
            }
            return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            window.showNotification('Unable to read streaming response');
            return;
        }

        let accumulatedText = '';
        let buffer = '';
        let finalData = null;

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
                            accumulatedText += data.text;

                            if (dialogueEl) {
                                dialogueEl.textContent = accumulatedText;

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
                            console.error('Streaming error:', data.error);
                            window.showNotification('Streaming error: ' + (data.error || 'Unknown error'));
                            return;
                        }
                    } catch (e) {
                        // JSON parse error ignore
                    }
                }
            }
        }

        if (finalData && finalData.reply) {
            if (dialogueEl) {
                dialogueEl.textContent = finalData.reply;
            }

            memoryRegistrationState.conversationHistory.push({
                role: 'assistant',
                content: finalData.reply
            });
        }

        if (finalData && finalData.sceneComplete && finalData.extractedScene) {
            console.log('Scene complete:', finalData.extractedScene);
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
        window.showNotification('Error processing input: ' + (e.message || 'Unknown error'));
    }
}

// ─────────────────────────────────────
// === Parsing ===
// ─────────────────────────────────────

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

// ─────────────────────────────────────
// === Review Phase ===
// ─────────────────────────────────────

function showReviewPhase() {
    console.log('=== Scene review display ===');
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
    console.log('=== Scene confirmed ===');
    const scene = collectReviewFormData();

    if (!scene.text || scene.text.length === 0) {
        window.showNotification('Scene 텍스트를 입력 please');
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

// ─────────────────────────────────────
// === Save ===
// ─────────────────────────────────────

async function finishRegistration() {
    const memory = memoryRegistrationState.currentMemory;

    if (memory.scenes.length < 1) {
        window.showNotification('At least one scene is required.');
        return;
    }

    const title = prompt('Enter a title for this memory:');
    if (!title || !title.trim()) {
        return;
    }

    memory.title = title.trim();

    try {
        await saveMemoryToDB(memory);
        window.showNotification('Memory registered!');
        closeRegistrationScreen();

        const state = appStore.getState();
        if (state.currentMode === 'archive') {
            await window.loadMemoriesFromSupabase();
            window.sortMemories('all');
        }
    } catch (e) {
        console.error('finishRegistration error:', e);
        window.showNotification('Error during memory registration');
    }
}

async function saveMemoryToDB(memory) {
    const state = appStore.getState();
    const curator_id = state.currentUser?.id || null;

    const result = await MemoryService.saveMemory({ memory, curator_id });

    if (!result.ok) {
        throw result.error || new Error('Memory save failed');
    }

    return result.data;
}

// ─────────────────────────────────────
// === Exports ===
// ─────────────────────────────────────

export {
    startMemoryRegistration,
    showRegistrationScreen,
    closeRegistrationScreen,
    handleRegistrationInput,
    showReviewPhase,
    confirmScene,
    finishRegistration,
};

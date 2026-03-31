import { appStore } from './appStore.js';
import { showNotification, showNpcDialogue } from '../ui/notify.js';
/**
 * Confession Module — V2 flow, vector extraction, scene generation, Hub/Door,
 * record chat wrapper, ritual flow, safety system.
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   appStore, showNotification, showNpcDialogue,
 *   window.showEndScreen, window.loadMemoriesFromSupabase, window.sortMemories,
 *   window.enterArchive
 */

import { getSupabaseClient, getAccessToken } from '../lib/supabaseClient.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config.js';
import { detectCrisis, getRandomDialogue, CRISIS_DIALOGUES, SAFETY_RESOURCES } from '../safety.js';
import { emotionVectorToWaveStyle } from '../shared/math.js';
import { visualizer } from '../ui/Visualizer.js';
import { resetLiveState, switchGeneratedTab, startVoiceWaveLiveAnimation } from './live.js';

let supabaseClient = null;

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
            <button class="safety-return-btn" style="opacity:0;margin-top:1.5rem;background:none;border:1px solid rgba(196,168,130,0.3);color:rgba(196,168,130,0.7);font-family:'Cormorant Garamond',serif;font-size:0.9rem;padding:0.6rem 1.5rem;cursor:pointer;transition:opacity 1s ease;display:block;margin-left:auto;margin-right:auto;">돌아가기</button>
        </div>
    `;

    document.body.appendChild(popup);

    popup.querySelector('.safety-close-btn').addEventListener('click', () => {
        popup.remove();
    });

    // 5초 후 복귀 버튼 fade-in
    setTimeout(() => {
        const returnBtn = popup.querySelector('.safety-return-btn');
        if (returnBtn) {
            returnBtn.style.opacity = '1';
            returnBtn.addEventListener('click', () => {
                popup.remove();
                if (typeof window.showMainMenu === 'function') window.showMainMenu();
            });
        }
    }, 5000);
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

        const { saveMemoryGraph } = await import('../lib/repo.js');
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
            await window.loadMemoriesFromSupabase();
            window.sortMemories('all');
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

  if (title) { title.classList.remove('visible', 'hiding'); title.textContent = 'RECORD'; }
  if (subtitle) { subtitle.classList.remove('visible', 'hiding'); subtitle.textContent = ''; }
  if (backBtn) { backBtn.classList.remove('visible', 'hiding'); }
  if (screen) { screen.classList.remove('done'); screen.style.cursor = 'pointer'; }

  // 1단계: 문 먼저 (ASCII art는 이미 렌더됨)
  // 2단계: +800ms 제목 등장
  setTimeout(() => { if (title) title.classList.add('visible'); }, 800);

  // 3단계: +1800ms 타이핑 모션으로 안내 텍스트
  const _isKo = /[가-힣]/.test(document.documentElement.lang || document.title || '');
  const _doorMsg = _isKo
    ? '너의 기억을 묻어두려면, 이 문 안으로 들어가봐.'
    : 'To bury your memory, step through this door.';
  setTimeout(() => {
    if (!subtitle) return;
    subtitle.classList.add('visible');
    let _ci = 0;
    const _typeTimer = setInterval(() => {
      if (_ci < _doorMsg.length) {
        subtitle.textContent += _doorMsg[_ci];
        _ci++;
      } else {
        clearInterval(_typeTimer);
      }
    }, 40);
  }, 1800);

  // 4단계: +4000ms back 버튼 (타이핑 완료 후)
  setTimeout(() => { if (backBtn) backBtn.classList.add('visible'); }, 4000);

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

    const { initRecordChat } = await import('./recordChat.js');
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
    const { showLoadingScreen, showSceneReview, showBurialAnimation } = await import('./burialAnimation.js');
    const burialContainer = document.getElementById('burialContainer');
    if (!burialContainer) return;

    const recordContainer = document.getElementById('recordChatContainer');
    if (recordContainer) { recordContainer.classList.add('hidden'); recordContainer.style.display = 'none'; }
    burialContainer.classList.remove('hidden');
    burialContainer.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;top:0 !important;left:0 !important;width:100% !important;height:100% !important';

    // ─── Phase B path: user cut scenes manually → AI reconstructs all ───
    if (extractedScene._isPhaseB && extractedScene.rawScenes) {
        showLoadingScreen(burialContainer, lang);

        try {
            const token = await getAccessToken().catch(() => null) || SUPABASE_ANON_KEY;
            const rawScenes = extractedScene.rawScenes;

            // Build situation from all fragments for the AI prompt
            const allFragments = rawScenes.flatMap(s => s.fragments || []);
            const situation = allFragments.join('. ');

            // Build conversationData in the format generate-scene-from-conversation expects
            // Extract a rough emotion from conversation context
            const conversationData = {
                sensory_anchor: { modality: 'visual', content: allFragments[0] || '' },
                situation: situation,
                emotion: { primary: 'sadness', intensity: 0.5 },
                reason: { attribution: 'fate_blame', core_fear: 'loss', target: 'situation', is_void: false },
            };

            // Tell the Edge Function how many scenes the user wants
            // by providing the scene structure in the request
            const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-scene-from-conversation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    conversationData: conversationData,
                    lang,
                    sceneCount: rawScenes.length,
                }),
            });

            if (!response.ok) throw new Error('Scene reconstruction failed');
            const sceneData = await response.json();

            // Show scene review with edit button
            _showPhaseBReview(burialContainer, sceneData, conversationData, lang);

        } catch (e) {
            console.error('[Record] Phase B scene reconstruction error:', e);
            // Fallback: use raw fragments as scene text
            const rawScenes = extractedScene.rawScenes;
            const allFragments = rawScenes.flatMap(s => s.fragments || []);
            const sceneData = {
                scenes: rawScenes.map((s, i) => ({
                    order: i + 1,
                    sceneType: s.sceneType || 'branch',
                    text: (s.fragments || []).join('. '),
                    emotionCue: '',
                    vectorWeight: 0,
                })),
                originalVector: null,
            };
            const conversationData = { situation: allFragments.slice(0, 3).join('. '), sensory_anchor: null };
            _showPhaseBReview(burialContainer, sceneData, conversationData, lang);
        }
        return;
    }

    // ─── Original path: AI generates scenes from conversation data ───
    showLoadingScreen(burialContainer, lang);

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

        showSceneReview(burialContainer, {
            scenes: sceneData.scenes,
            originalVector: sceneData.originalVector,
            lang,
            onConfirm: async () => {
                const memoryId = await saveRecordMemory(extractedScene, sceneData, lang);
                showBurialAnimation(burialContainer, {
                    originalVector: sceneData.originalVector,
                    lang,
                    onArchive: () => {
                        burialContainer.classList.add('hidden');
                        burialContainer.style.display = 'none';
                        _showRecordStrata(memoryId, lang);
                    }
                });
            },
            onRetry: () => {
                burialContainer.classList.add('hidden');
                burialContainer.style.display = 'none';
                startBeginner();
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

// Pending save data for anonymous users (saved after login)
let _pendingSave = null;

async function _resolveUserId() {
    const state = appStore.getState();
    if (state.currentUser?.id) return state.currentUser.id;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) return session.user.id;
    } catch (_) {}
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) return user.id;
    } catch (_) {}
    return null;
}

async function saveRecordMemory(conversationData, sceneData, lang) {
    const userId = await _resolveUserId();

    if (!userId) {
        // 비로그인 — 데이터 임시 보관, 나중에 로그인 후 저장
        console.log('[Record] No login — deferring save');
        _pendingSave = { conversationData, sceneData, lang };
        return null; // memoryId 없이 진행 (strata 스킵, 매장 연출은 진행)
    }

    try {
        const supabase = getSupabaseClient();

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
                curator_id: userId,
                original_vector: sceneData.originalVector?.base || null,
                original_reason_vector: sceneData.originalVector?.reason_analysis || null,
                lang: lang,
            })
            .select('id')
            .single();

        if (memError) throw memError;

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
        _pendingSave = null;
        return memory.id;
    } catch (e) {
        console.error('[Record] Save error:', e);
        // 저장 실패 시에도 임시 보관
        _pendingSave = { conversationData, sceneData, lang };
        return null;
    }
}

/**
 * 로그인 후 보류 중인 기억 저장 시도
 */
export async function savePendingRecordMemory() {
    if (!_pendingSave) return null;
    const { conversationData, sceneData, lang } = _pendingSave;
    const memoryId = await saveRecordMemory(conversationData, sceneData, lang);
    return memoryId;
}

/**
 * Phase B scene review — with edit button (placeholder)
 */
async function _showPhaseBReview(container, sceneData, conversationData, lang) {
    const { showSceneReview, showBurialAnimation } = await import('./burialAnimation.js');

    showSceneReview(container, {
        scenes: sceneData.scenes,
        originalVector: sceneData.originalVector,
        lang,
        showEditButton: true,
        onConfirm: async () => {
            const memoryId = await saveRecordMemory(conversationData, sceneData, lang);
            showBurialAnimation(container, {
                originalVector: sceneData.originalVector,
                lang,
                onArchive: () => {
                    container.classList.add('hidden');
                    container.style.display = 'none';
                    _showRecordStrata(memoryId, lang);
                }
            });
        },
        onEdit: (sceneIndex) => {
            // Placeholder — edit functionality TBD
            console.log('[Record] Edit scene requested:', sceneIndex);
            showNotification(lang === 'en' ? 'Scene editing coming soon.' : '장면 고치기 기능 준비 중.');
        },
        onRetry: () => {
            container.classList.add('hidden');
            container.style.display = 'none';
            startBeginner();
        }
    });
}

/**
 * Record 완료 후 strata 표시 — "첫 번째 기억이 여기 묻혔다"
 * strata 데이터가 없거나 실패 시 archive로 fallback
 */
/**
 * 비로그인 Record 완료 후 — 로그인 유도 화면
 */
function _showLoginPromptAfterRecord(lang) {
    const container = document.getElementById('burialContainer');
    if (!container) { window.enterArchive(); return; }

    container.classList.remove('hidden');
    container.style.cssText = 'display:flex !important;z-index:1900 !important;position:fixed !important;inset:0 !important;align-items:center;justify-content:center;background:#0a0a0e;';
    container.innerHTML = `
        <div style="text-align:center;max-width:320px;padding:2rem;">
            <div style="font-family:'Cormorant Garamond',serif;font-size:16px;color:rgba(196,168,130,0.8);letter-spacing:3px;margin-bottom:16px;">
                ${lang === 'en' ? 'Your memory is shaped.' : '기억이 형태를 갖췄다.'}
            </div>
            <div style="font-family:'Cormorant Garamond',serif;font-size:12px;color:rgba(196,168,130,0.4);letter-spacing:2px;line-height:1.8;margin-bottom:32px;">
                ${lang === 'en'
                    ? 'To bury it in the strata, you need to leave a trace of yourself.'
                    : '지층에 묻으려면, 당신의 흔적을 남겨야 한다.'}
            </div>
            <button id="recordLoginBtn" style="margin:0 8px;background:none;border:1px solid rgba(196,168,130,0.4);color:rgba(196,168,130,0.8);font-family:'Cormorant Garamond',serif;font-size:13px;letter-spacing:2px;padding:10px 28px;cursor:pointer;transition:all 0.3s;">
                ${lang === 'en' ? 'Sign in' : '로그인'}
            </button>
            <button id="recordSkipBtn" style="margin:0 8px;background:none;border:none;color:rgba(196,168,130,0.3);font-family:'Cormorant Garamond',serif;font-size:11px;letter-spacing:2px;padding:10px 16px;cursor:pointer;">
                ${lang === 'en' ? 'Leave without saving' : '저장하지 않고 나가기'}
            </button>
        </div>
    `;

    container.querySelector('#recordLoginBtn').addEventListener('click', async () => {
        container.classList.add('hidden');
        container.style.display = 'none';
        // 로그인 모달 표시
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            loginModal.classList.add('active');
            // 로그인 성공 후 pending save 실행
            const handler = async () => {
                document.removeEventListener('tem:login-success', handler);
                const memoryId = await savePendingRecordMemory();
                if (memoryId) {
                    _showRecordStrata(memoryId, lang);
                } else {
                    window.enterArchive();
                }
            };
            document.addEventListener('tem:login-success', handler);
        } else {
            window.enterArchive();
        }
    });

    container.querySelector('#recordSkipBtn').addEventListener('click', () => {
        _pendingSave = null;
        container.classList.add('hidden');
        container.style.display = 'none';
        window.enterArchive();
    });
}

function _showRecordStrata(memoryId, lang) {
    // 비로그인 (memoryId null) — 로그인 유도 화면
    if (!memoryId) {
        _showLoginPromptAfterRecord(lang);
        return;
    }

    if (typeof window.showStrataView !== 'function') {
        window.enterArchive();
        return;
    }

    // strata close 시 archive로 이동하도록 onClose 설정
    window.showStrataView(memoryId, null, () => {
        window.enterArchive();
    });

    // strata HUD에 봉인 메시지 오버레이
    setTimeout(() => {
        const viewEl = document.getElementById('strataView');
        if (!viewEl || viewEl.style.display === 'none') {
            window.enterArchive();
            return;
        }

        const narrative = document.createElement('div');
        narrative.id = 'recordStrataOverlay';
        narrative.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2800;text-align:center;pointer-events:none;opacity:0;transition:opacity 2s ease;';
        narrative.innerHTML = `
            <div style="font-family:'Cormorant Garamond',serif;font-size:16px;color:rgba(196,168,130,0.8);letter-spacing:3px;margin-bottom:12px;">
                ${lang === 'en' ? 'The memory is buried here.' : '기억이 여기 묻혔다.'}
            </div>
            <div style="font-family:'Cormorant Garamond',serif;font-size:11px;color:rgba(196,168,130,0.4);letter-spacing:2px;">
                ${lang === 'en' ? 'Your first stratum.' : '당신이 남긴 첫 번째 지층.'}
            </div>
        `;
        viewEl.appendChild(narrative);

        // Fade in
        requestAnimationFrame(() => { narrative.style.opacity = '1'; });

        // Fade out after 4 seconds
        setTimeout(() => {
            narrative.style.opacity = '0';
            setTimeout(() => narrative.remove(), 2000);
        }, 4000);
    }, 1500);
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
        // storyData now accessed via window.currentStoryData
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
        const { saveMemoryGraph } = await import('../lib/repo.js');
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

// ─────────────────────────────────────
// === Exports ===
// ─────────────────────────────────────

export {
    // Safety
    handleCrisis,
    checkSafetyBeforeSubmit,
    showSafetyResources,

    // V2 Flow
    startFlow,
    startConfession,
    endConfession,

    // Scene generation
    generateScenesFromRitual,
    generateSceneFromRitual,
    renderSceneResult,
    saveAndBury,
    saveConfessionToDB,

    // Hub / Door
    showConfessionHub,
    initDoor,
    handleDoorClick,

    // Record Chat
    startBeginner,
    handleRecordComplete,
    saveRecordMemory,
    endRecordChat,

    // Ritual
    startRitual,
    startRitualFlow,
    saveRitualScene,
    saveRitualToMemories,

    // Utilities
    hideAllScreens,
    showMainMenu,
    showArchitectLocked,
    startConfessionFlow,
    generateMemoryCode,
};

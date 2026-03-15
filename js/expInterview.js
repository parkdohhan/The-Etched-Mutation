// ═══════════════════════════════════════════════════
//  expInterview.js — Module that plugs into existing sceneViewer
//  emotionModal replacement + sidebar wave bucketing
// ═══════════════════════════════════════════════════

// ===== Chip Data =====
const EXP_CHIPS = {
  body: [
    { label: 'chest tightened', key: 'chest_tight' },
    { label: 'breath stopped', key: 'breathless' },
    { label: 'hands trembled', key: 'trembling' },
    { label: 'tears came', key: 'tears' },
    { label: 'felt nothing', key: 'nothing', void: true },
  ],
  emotion: [
    { label: 'guilt', key: 'guilt' },
    { label: 'fear', key: 'fear' },
    { label: 'anger', key: 'anger' },
    { label: 'sadness', key: 'sadness' },
    { label: 'shame', key: 'shame' },
    { label: 'longing', key: 'longing' },
    { label: 'relief', key: 'relief' },
    { label: 'confusion', key: 'confusion' },
    { label: 'emptiness', key: 'emptiness' },
    { label: 'awe', key: 'awe' },
    { label: 'strange joy', key: 'strange_joy' },
    { label: 'numbness', key: 'numbness', void: true },
  ],
  reason: [
    { label: 'because it felt like my fault', key: 'self_blame' },
    { label: 'because it was unavoidable', key: 'helpless' },
    { label: 'because someone betrayed', key: 'betrayal' },
    { label: 'I don\'t want to say', key: 'void', void: true },
  ],
  target: [
    { label: 'the narrator', key: 'narrator_self' },
    { label: 'the narrator\'s other', key: 'narrator_other' },
    { label: 'myself', key: 'experiencer_self' },
    { label: 'no one', key: 'nobody' },
  ],
};

const EXP_BODY_LABEL = {
  chest_tight: 'Your chest tightened',
  breathless: 'Your breath stopped',
  trembling: 'Your hands trembled',
  tears: 'Tears came',
  nothing: 'You felt nothing',
};

const EXP_EMOTION_LABEL = {
  guilt: 'guilt', fear: 'fear', anger: 'anger',
  sadness: 'sadness', shame: 'shame', longing: 'longing',
  relief: 'relief', confusion: 'confusion', emptiness: 'emptiness',
  awe: 'awe', strange_joy: 'strange joy', numbness: 'numbness',
};

function _hasBatchim(str) {
  if (!str) return false;
  const last = str.charCodeAt(str.length - 1);
  if (last < 0xAC00 || last > 0xD7A3) return false;
  return (last - 0xAC00) % 28 !== 0;
}
function _josa(word, withBatchim, withoutBatchim) {
  return word + (_hasBatchim(word) ? withBatchim : withoutBatchim);
}


// ===== Interview State =====
const expInterviewState = {
  answers: {},
  currentBucket: null,
  previousBucket: null,
  repeatCount: 0,
  alignmentHistory: [],
};


// ===== Question Depth by Bucket =====
function getExpQuestionDepth(bucket) {
  switch (bucket) {
    case 'HIGH':    return ['emotion'];
    case 'MID':     return ['emotion', 'reason'];
    case 'LOW':     return ['emotion', 'reason', 'target'];
    case 'FIXATED': return ['emotion', 'reason', 'target'];
    default:        return ['emotion', 'reason'];
  }
}


// ===== Build Questions =====
function buildExpInterviewQuestions(bucket, sceneOrder) {
  const depth = getExpQuestionDepth(bucket);
  const isFixated = bucket === 'FIXATED';
  const questions = [];

  if (depth.includes('emotion')) {
    questions.push({
      id: 'body',
      question: isFixated
        ? 'Try to feel it differently this time.\nWhat happened in your body?'
        : 'As you read this scene,\nwhat did you feel in your body?',
      type: 'chips',
      chipsKey: 'body',
    });

    questions.push({
      id: 'emotion',
      question: (data) => {
        const bodyText = EXP_BODY_LABEL[data.body] || '';
        return isFixated
          ? `${bodyText}.\nIs it the same feeling as last time?\n(You can choose up to two)`
          : `${bodyText}.\nWhat emotion was that?\n(You can choose up to two)`;
      },
      type: 'multi_chips',
      chipsKey: 'emotion',
      maxSelect: 2,
    });
  }

  if (depth.includes('reason')) {
    questions.push({
      id: 'reason',
      question: (data) => {
        const emotions = Array.isArray(data.emotion) ? data.emotion : [data.emotion];
        if (emotions.includes('numbness') && emotions.length === 1) return 'Why couldn\'t you feel anything?';
        const labels = emotions.map(e => EXP_EMOTION_LABEL[e] || e);
        let joined;
        if (labels.length === 1) {
          joined = labels[0];
        } else {
          joined = labels[0] + ' and ' + labels[1];
        }
        return `Why did you feel ${joined}?`;
      },
      type: 'chips',
      chipsKey: 'reason',
    });
  }

  if (depth.includes('target')) {
    questions.push({
      id: 'target',
      question: (data) => {
        const emotions = Array.isArray(data.emotion) ? data.emotion : [data.emotion];
        const labels = emotions.map(e => EXP_EMOTION_LABEL[e] || e);
        let joined;
        if (labels.length === 1) {
          joined = labels[0];
        } else {
          joined = labels[0] + ' and ' + labels[1];
        }
        return `Who was that ${joined} directed at?`;
      },
      type: 'chips',
      chipsKey: 'target',
    });
  }

  return questions;
}


// ===== Vector Extraction (no LLM) =====
function extractExpVector(answers) {
  const emotionVectors = {
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

  const attrMap = {
    self_blame: 'internal', helpless: 'external',
    betrayal: 'external', void: 'void',
  };
  const fearMap = {
    guilt: 'worthlessness', fear: 'punishment', anger: 'powerlessness',
    sadness: 'loss', shame: 'worthlessness', longing: 'loss',
    relief: 'guilt_release', confusion: 'disorientation', emptiness: 'loss',
    awe: 'insignificance', strange_joy: 'guilt_release', numbness: 'powerlessness',
  };
  const targetMap = {
    narrator_self: 'narrator', narrator_other: 'other',
    experiencer_self: 'self', nobody: 'none',
  };

  const emotions = Array.isArray(answers.emotion) ? answers.emotion : [answers.emotion];
  const keys = ['fear', 'sadness', 'anger', 'joy', 'longing', 'guilt'];
  const blended = {};
  keys.forEach(k => blended[k] = 0);
  emotions.forEach(emo => {
    const vec = emotionVectors[emo] || emotionVectors.sadness;
    keys.forEach(k => blended[k] += vec[k] / emotions.length);
  });

  const primary = emotions[0];
  const is_void = emotions.includes('numbness') || answers.body === 'nothing' || answers.reason === 'void';

  return {
    base: blended,
    reason_analysis: {
      attribution: attrMap[answers.reason] || 'unknown',
      core_fear: fearMap[primary] || 'loss',
      target: targetMap[answers.target] || 'unknown',
      is_void,
      is_compound: emotions.length > 1,
      emotions,
    },
    attitude: {
      is_void,
      is_displaced: answers.target === 'experiencer_self',
    },
  };
}


// ═══════════════════════════════════════════
//  Render — inject below choicesContainer
// ═══════════════════════════════════════════

/**
 * Called instead of emotionModal.
 * Called in place of makeChoice() → emotionModal.
 * Hides choicesContainer and renders chip interview in its place.
 */
function startExpInterview(scene) {
  console.log('[expInterview] startExpInterview called, scene:', scene);
  // Hide choices
  const choicesEl = document.getElementById('choicesContainer');
  if (choicesEl) {
    choicesEl.style.display = 'none';
    console.log('[expInterview] choicesContainer hidden');
  } else {
    console.warn('[expInterview] choicesContainer not found');
  }

  // Hide free input
  const freeInput = document.querySelector('.free-input-container');
  if (freeInput) {
    freeInput.style.display = 'none';
    console.log('[expInterview] free-input-container hidden');
  }

  // Create interview container (if not present)
  let container = document.getElementById('expInterviewZone');
  if (!container) {
    container = document.createElement('div');
    container.id = 'expInterviewZone';
    container.className = 'exp-interview-zone';
    // Insert inside scene-main, after choicesContainer
    const sceneMain = document.querySelector('.scene-main');
    if (sceneMain) {
      sceneMain.appendChild(container);
      console.log('[expInterview] expInterviewZone created and appended');
    } else {
      console.error('[expInterview] .scene-main not found');
      // Try adding directly inside sceneViewer
      const sceneViewer = document.getElementById('sceneViewer');
      if (sceneViewer) {
        const sceneContent = sceneViewer.querySelector('.scene-content');
        if (sceneContent) {
          const sceneMain = sceneContent.querySelector('.scene-main');
          if (sceneMain) {
            sceneMain.appendChild(container);
            console.log('[expInterview] expInterviewZone appended inside sceneViewer');
          } else {
            console.error('[expInterview] .scene-main not found inside sceneViewer either');
            return;
          }
        } else {
          console.error('[expInterview] .scene-content not found');
          return;
        }
      } else {
        console.error('[expInterview] sceneViewer not found');
        return;
      }
    }
  }
  container.innerHTML = '';
  container.style.display = 'block';
  console.log('[expInterview] interview container ready');

  // Reset state
  expInterviewState.answers = {};

  const bucket = expInterviewState.currentBucket || 'MID';
  const sceneOrder = scene.scene_order || scene.order || ((typeof appStore !== 'undefined' && appStore.getState) ? appStore.getState().currentScene + 1 : 1);
  const questions = buildExpInterviewQuestions(bucket, sceneOrder);

  // Bucket message
  const bucketMsg = getExpBucketMessage(bucket);
  if (bucketMsg) {
    const msgEl = document.createElement('p');
    msgEl.className = 'exp-iv-bucket-msg';
    msgEl.textContent = bucketMsg;
    container.appendChild(msgEl);
  }

  renderExpIvQuestion(container, questions, 0, scene);
}

function getExpBucketMessage(bucket) {
  switch (bucket) {
    case 'MID':     return 'Let me listen a little more.';
    case 'LOW':     return 'Let\'s find where things diverged.';
    case 'FIXATED': return 'You keep circling the same place.';
    default:        return null;
  }
}


function renderExpIvQuestion(container, questions, index, scene) {
  if (index >= questions.length) {
    onExpInterviewDone(container, scene);
    return;
  }

  const q = questions[index];

  const promptEl = document.createElement('div');
  promptEl.className = 'exp-iv-prompt';

  // Question text
  const questionEl = document.createElement('p');
  questionEl.className = 'exp-iv-question';
  promptEl.appendChild(questionEl);

  // Input area (chips)
  const inputArea = document.createElement('div');
  inputArea.className = 'exp-iv-input';
  inputArea.style.opacity = '0';
  inputArea.style.transition = 'opacity 0.4s';

  const chipsEl = document.createElement('div');
  chipsEl.className = 'exp-iv-chips';

  if (q.type === 'multi_chips') {
    // ── Multi-select (emotion) ──
    const maxSelect = q.maxSelect || 2;
    const selected = [];
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'exp-iv-confirm';
    confirmBtn.textContent = 'Confirm';

    EXP_CHIPS[q.chipsKey].forEach(chip => {
      const btn = document.createElement('button');
      btn.className = 'exp-iv-chip' + (chip.void ? ' void' : '');
      btn.textContent = chip.label;
      btn.addEventListener('click', () => {
        if (chip.void) {
          finishQuestion([chip.key], chip.label);
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
        confirmBtn.classList.toggle('visible', selected.length > 0);
      });
      chipsEl.appendChild(btn);
    });

    confirmBtn.addEventListener('click', () => {
      if (selected.length > 0) {
        finishQuestion(
          selected.map(s => s.key),
          selected.map(s => s.label).join(' + ')
        );
      }
    });

    inputArea.appendChild(chipsEl);
    inputArea.appendChild(confirmBtn);

  } else {
    // ── Single-select ──
    EXP_CHIPS[q.chipsKey].forEach(chip => {
      const btn = document.createElement('button');
      btn.className = 'exp-iv-chip' + (chip.void ? ' void' : '');
      btn.textContent = chip.label;
      btn.addEventListener('click', () => finishQuestion(chip.key, chip.label));
      chipsEl.appendChild(btn);
    });
    inputArea.appendChild(chipsEl);
  }

  promptEl.appendChild(inputArea);
  container.appendChild(promptEl);

  // Scroll scene-main
  const sceneMain = document.querySelector('.scene-main');
  if (sceneMain) setTimeout(() => sceneMain.scrollTop = sceneMain.scrollHeight, 50);

  // Typewrite question
  const qText = typeof q.question === 'function' ? q.question(expInterviewState.answers) : q.question;
  expTypeWrite(questionEl, qText, 28, () => {
    inputArea.style.opacity = '1';
    if (sceneMain) setTimeout(() => sceneMain.scrollTop = sceneMain.scrollHeight, 100);
  });

  // ── Answer handler ──
  function finishQuestion(value, displayLabel) {
    expInterviewState.answers[q.id] = value;

    // Fade prompt
    promptEl.classList.add('answered');
    inputArea.innerHTML = '';
    const answerEl = document.createElement('span');
    answerEl.className = 'exp-iv-answer';
    answerEl.textContent = displayLabel;
    inputArea.appendChild(answerEl);
    inputArea.style.opacity = '1';

    setTimeout(() => renderExpIvQuestion(container, questions, index + 1, scene), 450);
  }
}


// ===== Interview Complete → Engine =====
function onExpInterviewDone(container, scene) {
  // Extract vector (NO LLM)
  const userVector = extractExpVector(expInterviewState.answers);

  // V3 Engine
  let engineResult = null;
  const originalVector = scene.originalVector || scene.original_emotion;

  if (originalVector && typeof window.byeoriEngine !== 'undefined' && window.byeoriEngine) {
    engineResult = window.byeoriEngine.calculateStep(
      { userVector, originalVector: { base: originalVector.base || originalVector } },
      {
        previousBucket: expInterviewState.previousBucket,
        emotionHistory: (typeof appStore !== 'undefined' && appStore.getState) ? appStore.getState().emotionHistory || [] : [],
        skipCount: 0
      }
    );
  } else if (originalVector) {
    // Fallback: simple cosine
    engineResult = fallbackAlignment(userVector, originalVector);
  }

  const sceneAlignment = engineResult ? engineResult.alignment_score : null;
  const userReason = expInterviewState.answers.reason || '';
  
  if (engineResult) {
    // Update bucket state
    expInterviewState.previousBucket = expInterviewState.currentBucket;
    if (expInterviewState.currentBucket === engineResult.alignment_bucket) {
      expInterviewState.repeatCount++;
    } else {
      expInterviewState.repeatCount = 0;
    }
    expInterviewState.currentBucket = engineResult.alignment_bucket;
    expInterviewState.alignmentHistory.push(engineResult.alignment_score);

    // Update sidebar wave
    updateWaveBucket(engineResult.alignment_bucket);

    // Update store
    if (typeof appStore !== 'undefined' && appStore.setState) {
      appStore.setState({
        currentAlignment: engineResult.alignment_score,
        currentBucket: engineResult.alignment_bucket,
      });
    }
  }

  // Archive flow: save to window.archiveUserEmotions and DB
  if (typeof window.appStore !== 'undefined' && window.appStore.getState) {
    const state = window.appStore.getState();
    if (state.currentMode === 'archive') {
      console.log('[expInterview] Archive flow: saving data');
      
      // Save to window.archiveUserEmotions
      if (!window.archiveUserEmotions) {
        window.archiveUserEmotions = [];
      }
      const currentScene = state.currentScene || 0;
      window.archiveUserEmotions[currentScene] = {
        emotion: userVector.base,
        reason: userReason,
        sceneId: scene.id || currentScene
      };
      
      // Save to window.archiveSceneAlignments
      if (!window.archiveSceneAlignments) {
        window.archiveSceneAlignments = [];
      }
      if (sceneAlignment !== null) {
        window.archiveSceneAlignments[currentScene] = sceneAlignment;
      }
      
      // Call saveArchiveEmotionToPlays
      const currentData = window.currentStoryData;
      if (currentData && typeof window.saveArchiveEmotionToPlays === 'function') {
        const reasonVector = userVector.reason_analysis || null;
        const mismatchType = engineResult ? engineResult.mismatch_type : null;
        window.saveArchiveEmotionToPlays(
          userVector.base,
          userReason,
          scene,
          currentData,
          sceneAlignment,
          reasonVector,
          mismatchType
        );
      }
      
      console.log('[expInterview] Archive flow: data saved', {
        sceneIndex: currentScene,
        alignment: sceneAlignment,
        hasEmotion: !!window.archiveUserEmotions[currentScene]
      });
    }
  }

  // Clean up interview zone
  container.innerHTML = '';
  container.style.display = 'none';

  // Restore choices visibility for next scene
  const choicesEl = document.getElementById('choicesContainer');
  if (choicesEl) choicesEl.style.display = '';
  const freeInput = document.querySelector('.free-input-container');
  if (freeInput) freeInput.style.display = '';

  // Check if ritual flow (if currentMode is 'ritual', create finalSceneObject and request confirmation)
  if (typeof window.appStore !== 'undefined' && window.appStore.getState) {
    const state = window.appStore.getState();
    if (state.currentMode === 'ritual') {
      console.log('[expInterview] Ritual flow detected, creating finalSceneObject and requesting confirmation');
      
      // Convert userVector to emotionAnalysis format
      const emotionAnalysis = {
        base: userVector.base,
        intensity: 0.5,
        confidence: 0.5
      };
      
      // Update finalSceneObject (global variable)
      const sceneText = scene.text || window.currentGeneratedScene || state.pendingSceneText || '';
      window.finalSceneObject = {
        text: sceneText,
        emotionAnalysis: emotionAnalysis,
        reason_analysis: userVector.reason_analysis,
        attitude: userVector.attitude,
        emotionRaw: expInterviewState.answers.emotion || '',
        reasonRaw: expInterviewState.answers.reason || '',
        generatedEmotion: expInterviewState.answers.emotion ? 
          (Array.isArray(expInterviewState.answers.emotion) ? 
            expInterviewState.answers.emotion.map(e => EXP_EMOTION_LABEL[e] || e).join(', ') : 
            EXP_EMOTION_LABEL[expInterviewState.answers.emotion] || expInterviewState.answers.emotion) : '',
        voidInfo: {
          sceneVoid: false,
          emotionVoid: expInterviewState.answers.emotion === 'numbness' || expInterviewState.answers.body === 'nothing',
          reasonVoid: expInterviewState.answers.reason === 'void'
        }
      };
      
      console.log('[expInterview] finalSceneObject created:', window.finalSceneObject);
      
      // UI update: display generated emotion
      const emotionContent = document.querySelector('#generatedEmotionContent .generated-text');
      if (emotionContent) {
        emotionContent.textContent = window.finalSceneObject.generatedEmotion || 'Emotions have been collected';
      }
      
      // Switch to emotion tab
      if (typeof window.switchGeneratedTab === 'function') {
        window.switchGeneratedTab('emotion');
      }
      
      // Request confirmation (go directly to handleConfirm)
      if (typeof window.addChatMessageWithConfirm === 'function') {
        window.addChatMessageWithConfirm('ai', 'Does this emotion feel right?');
      } else {
        // fallback: call handleConfirm directly
        console.log('[expInterview] addChatMessageWithConfirm not found, calling handleConfirm directly');
        setTimeout(() => {
          if (typeof window.handleConfirm === 'function') {
            console.log('[expInterview] Waiting for user to click confirm button');
          }
        }, 100);
      }
      
      return;
    }
  }
  
  // Archive flow
  if (typeof window.proceedToNextScene === 'function') {
    window.proceedToNextScene();
  }
}

// Fallback alignment (no byeoriEngine)
function fallbackAlignment(userVector, originalVector) {
  const u = userVector.base;
  const o = originalVector.base || originalVector;
  let dot = 0, mu = 0, mo = 0;
  for (const k of Object.keys(o)) {
    dot += (u[k] || 0) * (o[k] || 0);
    mu += (u[k] || 0) ** 2;
    mo += (o[k] || 0) ** 2;
  }
  mu = Math.sqrt(mu); mo = Math.sqrt(mo);
  const sim = (mu > 0 && mo > 0) ? dot / (mu * mo) : 0;
  const clamped = Math.max(0, Math.min(1, sim));
  let bucket = 'MID';
  if (clamped >= 0.55) bucket = 'HIGH';
  else if (clamped < 0.3) bucket = 'LOW';
  return { alignment_score: clamped, alignment_bucket: bucket };
}


// ═══════════════════════════════════════════
//  Sidebar Wave — bucket-specific replacement
//  Overrides existing startWaveAnimation()
// ═══════════════════════════════════════════

let _waveBucket = 'IDLE';
let _waveTime = 0;
let _waveAnimId = null;

function updateWaveBucket(bucket) {
  _waveBucket = bucket;
}

/**
 * Replaces existing startWaveAnimation() with this function.
 * Draws on existing waveCanvas (#waveCanvas).
 */
function startBucketWaveAnimation() {
  const canvas = document.getElementById('waveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);

  _waveTime = 0;

  function animate() {
    const w = canvas.width / 2;
    const h = canvas.height / 2;
    const cy = h / 2;

    ctx.fillStyle = 'rgba(18, 18, 26, 0.12)';
    ctx.fillRect(0, 0, w, h);

    const bucket = _waveBucket;

    if (bucket === 'IDLE') {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(196, 168, 130, 0.08)'; // weaker (0.15 -> 0.08)
      ctx.lineWidth = 0.8; // thinner (1 -> 0.8)
      for (let x = 0; x < w; x++) {
        const y = cy + Math.sin(x * 0.015 + _waveTime * 0.02) * 4; // smaller amplitude (6 -> 4)
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

    } else if (bucket === 'HIGH') {
      const p = _waveTime * 0.04;
      // Wave 1 — gold
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(196, 168, 130, 0.7)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < w; x++) {
        const y = cy + Math.sin(x * 0.018 + p) * 12 + Math.sin(x * 0.009 + p * 0.6) * 7;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Wave 2 — green, nearly overlapping
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(122, 154, 122, 0.6)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < w; x++) {
        const y = cy + Math.sin(x * 0.018 + p + 0.15) * 12 + Math.sin(x * 0.009 + p * 0.6 + 0.1) * 7;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

    } else if (bucket === 'MID') {
      const p = _waveTime * 0.04;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(196, 168, 130, 0.55)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < w; x++) {
        const n = Math.sin(_waveTime * 0.1 + x * 0.1) * 2;
        const y = cy + Math.sin(x * 0.018 + p + n * 0.05) * 12 + Math.sin(x * 0.009 + p * 0.5) * 7;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(123, 143, 168, 0.45)';
      ctx.lineWidth = 1.5;
      const off = 8;
      for (let x = 0; x < w; x++) {
        const n = Math.sin(_waveTime * 0.12 + x * 0.08) * 2;
        const y = cy + Math.sin(x * 0.018 + p + off * 0.1 + n * 0.05) * 12 + Math.sin(x * 0.009 + p * 0.5 + off * 0.05) * 7;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

    } else if (bucket === 'LOW') {
      const glitch = Math.random() > 0.93;
      if (glitch) {
        ctx.fillStyle = 'rgba(217, 74, 74, 0.08)';
        ctx.fillRect(0, 0, w, h);
      }
      const na = 6 + Math.random() * 6;
      const p = _waveTime * 0.04;
      ctx.beginPath();
      ctx.strokeStyle = glitch ? 'rgba(217, 74, 74, 0.6)' : 'rgba(196, 168, 130, 0.35)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < w; x++) {
        const noise = (Math.random() - 0.5) * na;
        const y = cy + Math.sin(x * 0.02 + p + noise * 0.1) * 12 + noise;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = glitch ? 'rgba(217, 74, 74, 0.4)' : 'rgba(123, 143, 168, 0.25)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < w; x++) {
        const noise = (Math.random() - 0.5) * na;
        const y = cy + Math.sin(x * 0.02 + p + 2 + noise * 0.1) * 12 + noise;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

    } else if (bucket === 'FIXATED') {
      const s = _waveTime * 0.015;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(138, 90, 138, 0.6)';
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x++) {
        const y = cy + Math.sin(x * 0.012 + s) * 10 + Math.sin(x * 0.006 + s * 0.4) * 6;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(138, 90, 138, 0.4)';
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x++) {
        const y = cy + Math.sin(x * 0.012 + s + 0.08) * 10 + Math.sin(x * 0.006 + s * 0.4 + 0.05) * 6;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      const vg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    _waveTime++;
    _waveAnimId = requestAnimationFrame(animate);
  }

  animate();
}


// ===== Typewriter =====
function expTypeWrite(el, text, speed, cb) {
  let i = 0;
  el.textContent = '';
  function tick() {
    if (i < text.length) {
      el.textContent += text.charAt(i);
      i++;
      const ch = text.charAt(i - 1);
      const d = (ch === '.' || ch === '?') ? 180 : ch === '\n' ? 240 : speed;
      setTimeout(tick, d);
    } else if (cb) cb();
  }
  tick();
}

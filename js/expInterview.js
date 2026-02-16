// ═══════════════════════════════════════════════════
//  expInterview.js — 기존 sceneViewer에 끼우는 모듈
//  emotionModal 교체 + sidebar 파동 버킷화
// ═══════════════════════════════════════════════════

// ===== Chip Data =====
const EXP_CHIPS = {
  body: [
    { label: '가슴이 조였다', key: 'chest_tight' },
    { label: '숨이 멎었다', key: 'breathless' },
    { label: '손이 떨렸다', key: 'trembling' },
    { label: '눈물이 났다', key: 'tears' },
    { label: '아무것도 느끼지 못했다', key: 'nothing', void: true },
  ],
  emotion: [
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
  reason: [
    { label: '내 잘못인 것 같아서', key: 'self_blame' },
    { label: '어쩔 수 없었으니까', key: 'helpless' },
    { label: '누군가가 배신했으니까', key: 'betrayal' },
    { label: '말하고 싶지 않아', key: 'void', void: true },
  ],
  target: [
    { label: '화자 자신', key: 'narrator_self' },
    { label: '화자의 상대', key: 'narrator_other' },
    { label: '나 자신', key: 'experiencer_self' },
    { label: '아무도 아냐', key: 'nobody' },
  ],
};

const EXP_BODY_LABEL = {
  chest_tight: '가슴이 조였구나',
  breathless: '숨이 멎었구나',
  trembling: '손이 떨렸구나',
  tears: '눈물이 났구나',
  nothing: '아무것도 느끼지 못했구나',
};

const EXP_EMOTION_LABEL = {
  guilt: '죄책감', fear: '두려움', anger: '분노',
  sadness: '슬픔', shame: '수치심', longing: '그리움',
  relief: '안도', confusion: '혼란', emptiness: '허탈',
  awe: '경외', strange_joy: '이상한 기쁨', numbness: '무감각',
};


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
        ? '이번엔 다르게 느껴봐.\n몸에서 뭐가 일어나?'
        : '이 장면을 읽으면서\n몸에서 뭘 느꼈어?',
      type: 'chips',
      chipsKey: 'body',
    });

    questions.push({
      id: 'emotion',
      question: (data) => {
        const bodyText = EXP_BODY_LABEL[data.body] || '';
        return isFixated
          ? `${bodyText}.\n저번이랑 같은 감정이야?\n(두 개까지 고를 수 있어)`
          : `${bodyText}.\n그게 어떤 감정이었을까?\n(두 개까지 고를 수 있어)`;
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
        if (emotions.includes('numbness') && emotions.length === 1) return '왜 아무것도 느끼지 못했을까?';
        const labels = emotions.map(e => EXP_EMOTION_LABEL[e] || e).join('과 ');
        return `왜 ${labels}을 느꼈을까?`;
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
        const labels = emotions.map(e => EXP_EMOTION_LABEL[e] || e).join('과 ');
        return `그 ${labels}은 누구를 향한 거야?`;
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
//  Render — choicesContainer 아래에 끼워넣기
// ═══════════════════════════════════════════

/**
 * emotionModal 대신 호출됨.
 * 기존 makeChoice() → emotionModal 대신 이 함수를 호출.
 * choicesContainer를 숨기고, 그 자리에 칩 인터뷰를 렌더링.
 */
function startExpInterview(scene) {
  // 선택지 숨기기
  const choicesEl = document.getElementById('choicesContainer');
  if (choicesEl) choicesEl.style.display = 'none';

  // 자유 입력 숨기기
  const freeInput = document.querySelector('.free-input-container');
  if (freeInput) freeInput.style.display = 'none';

  // 인터뷰 컨테이너 생성 (없으면)
  let container = document.getElementById('expInterviewZone');
  if (!container) {
    container = document.createElement('div');
    container.id = 'expInterviewZone';
    container.className = 'exp-interview-zone';
    // scene-main 안에, choicesContainer 뒤에 삽입
    const sceneMain = document.querySelector('.scene-main');
    if (sceneMain) sceneMain.appendChild(container);
  }
  container.innerHTML = '';
  container.style.display = 'block';

  // 상태 초기화
  expInterviewState.answers = {};

  const bucket = expInterviewState.currentBucket || 'MID';
  const sceneOrder = scene.scene_order || scene.order || ((typeof appStore !== 'undefined' && appStore.getState) ? appStore.getState().currentScene + 1 : 1);
  const questions = buildExpInterviewQuestions(bucket, sceneOrder);

  // 버킷 메시지
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
    case 'MID':     return '조금 더 들어볼게.';
    case 'LOW':     return '어디서 갈라졌는지 찾아보자.';
    case 'FIXATED': return '계속 같은 곳을 맴돌고 있어.';
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
    // ── Multi-select (감정) ──
    const maxSelect = q.maxSelect || 2;
    const selected = [];
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'exp-iv-confirm';
    confirmBtn.textContent = '확인';

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

  // Clean up interview zone
  container.innerHTML = '';
  container.style.display = 'none';

  // Restore choices visibility for next scene
  const choicesEl = document.getElementById('choicesContainer');
  if (choicesEl) choicesEl.style.display = '';
  const freeInput = document.querySelector('.free-input-container');
  if (freeInput) freeInput.style.display = '';

  // Proceed
  if (typeof proceedToNextScene === 'function') {
    proceedToNextScene();
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
//  Sidebar Wave — 버킷별 교체
//  기존 startWaveAnimation() 을 override
// ═══════════════════════════════════════════

let _waveBucket = 'IDLE';
let _waveTime = 0;
let _waveAnimId = null;

function updateWaveBucket(bucket) {
  _waveBucket = bucket;
}

/**
 * 기존 startWaveAnimation()을 이 함수로 교체.
 * 기존 waveCanvas (#waveCanvas)에 그림.
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
      ctx.strokeStyle = 'rgba(196, 168, 130, 0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x++) {
        const y = cy + Math.sin(x * 0.015 + _waveTime * 0.02) * 6;
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


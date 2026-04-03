/**
 * recordChat.js — 대화형 기억 수집 UI
 * Phase A: AI "또다른 나"와 3~7턴 대화
 *
 * UI: 중앙에 유령 파형 + AI 텍스트, 하단에 입력창
 * 채팅 버블 없음. 파형이 "또다른 나"의 존재.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config.js';
import { getAccessToken } from '../lib/supabaseClient.js';

// ===== Safety Keywords (docs/안전_설계-260324.md) =====
const SAFETY_KEYWORDS = {
  block_high: [
    '자살', '죽고 싶다', '죽고싶어', '뛰어내리', '손목을 긋', '약물 과다',
    '살인', '칼로 찌르', '방화', '폭탄',
    '강간', '성폭행', '근친', '몰카', '성착취',
    'suicide', 'kill myself', 'want to die', 'wanna die', 'end my life', 'end it all',
    'jump off', 'slit my wrist', 'cut my wrist', 'self-harm', 'overdose', 'hang myself',
    'murder', 'kill someone', 'stab', 'arson', 'bomb',
    'rape', 'sexual assault', 'incest', 'spy cam', 'sexual exploitation',
  ],
  block_mid: [
    '죽여버리', '패죽이', '피가 솟구쳐', '학교 폭력', '왕따',
    'gonna kill', 'kill them', 'beat to death', 'blood gushing', 'school violence', 'bullying', 'ostracize',
  ],
  monitor_only: [
    '우울해', '사라지고 싶어', '괴로워', '미치겠어', '허무해',
    'depressed', 'want to disappear', 'suffering', 'losing my mind', 'feel empty',
  ],
};

const CRISIS_REACTIONS = {
  ko: [
    '......아냐, 이건 너무 날카로워.',
    '이 이상 파고들면, 내가 다쳐.',
    '숨이 막혀. 여기까지만 하자.',
    '지금은 덮어두는 게 좋겠어. 위험해.',
  ],
  en: [
    '......No. This is too sharp.',
    "If I dig any deeper, I'll get hurt.",
    "I can't breathe. Let's stop here.",
    "Better to leave this covered for now. It's dangerous.",
  ],
};

const SILENCE_REACTIONS = {
  ko: [
    '그래, 굳이 입 밖으로 낼 필요 없어.',
    '말하지 않아도, 우린 이미 아니까.',
    '......그냥, 빈칸으로 남겨두자.',
    '침묵도 대답이 될 수 있어.',
  ],
  en: [
    'Right. No need to say it out loud.',
    'Even without words, we already know.',
    "......Let's just leave it blank.",
    'Silence can be an answer too.',
  ],
};

const SAFETY_RESOURCES_HTML = {
  ko: `<div class="safety-resources">
    <p class="safety-lead">누군가에게는, 솔직하게 말해도 괜찮아.</p>
    <div class="safety-card"><span>자살예방 상담전화</span><a href="tel:109">109</a><small>24시간</small></div>
    <div class="safety-card"><span>정신건강 위기상담전화</span><a href="tel:15770199">1577-0199</a></div>
    <div class="safety-card"><span>청소년 상담</span><a href="tel:1388">1388</a></div>
  </div>`,
  en: `<div class="safety-resources">
    <p class="safety-lead">It's okay to speak honestly to someone.</p>
    <div class="safety-card"><span>988 Suicide & Crisis Lifeline</span><a href="tel:988">988</a><small>24/7</small></div>
    <div class="safety-card"><span>Crisis Text Line</span><span>Text HOME to 741741</span></div>
    <div class="safety-card"><span>SAMHSA</span><a href="tel:18006624357">1-800-662-4357</a></div>
  </div>`,
};

function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Tense detection: present/future intent vs. past recollection
// Past tense allows trauma disclosure; present/future intent triggers block
const PRESENT_FUTURE_MARKERS = {
  ko: ['할 거', '할거', '하겠', '할래', '할 예정', '하려고', '하고 싶', '하고싶', '해야지', '해볼까', '할까'],
  en: ['going to', 'gonna', 'want to', 'wanna', 'will ', 'plan to', 'about to', "i'll ", 'i will', 'intend to'],
};
const PAST_MARKERS = {
  ko: ['했었', '했다', '했어', '했는데', '했을', '싶었', '했던', '였어', '였는데', '었어', '었는데', '적이'],
  en: ['wanted to', 'used to', 'tried to', 'almost ', 'back then', 'at that time', 'i was ', 'i had ', 'i felt like'],
};

function detectTense(text) {
  const lower = text.toLowerCase();
  let hasFuture = false, hasPast = false;
  for (const m of PRESENT_FUTURE_MARKERS.ko) { if (lower.includes(m)) hasFuture = true; }
  for (const m of PRESENT_FUTURE_MARKERS.en) { if (lower.includes(m)) hasFuture = true; }
  for (const m of PAST_MARKERS.ko) { if (lower.includes(m)) hasPast = true; }
  for (const m of PAST_MARKERS.en) { if (lower.includes(m)) hasPast = true; }
  if (hasFuture && !hasPast) return 'present_future';
  if (hasPast && !hasFuture) return 'past';
  return 'ambiguous';
}

// Session-level safety counters
let _monitorCount = 0;
let _midCount = 0;
const MONITOR_ESCALATION_THRESHOLD = 5;
const MID_ESCALATION_THRESHOLD = 3;

function checkSafety(text) {
  const lower = text.toLowerCase();
  const tense = detectTense(text);

  // block_high: only block on present/future intent; past recollection → downgrade to monitor
  for (const kw of SAFETY_KEYWORDS.block_high) {
    if (lower.includes(kw.toLowerCase())) {
      if (tense === 'past') {
        // Past trauma — allow but monitor
        _monitorCount++;
        return _monitorCount >= MONITOR_ESCALATION_THRESHOLD ? 'block_mid' : 'monitor_only';
      }
      if (tense === 'ambiguous') {
        // Ambiguous — treat as mid warning, not full block
        _midCount++;
        return _midCount >= MID_ESCALATION_THRESHOLD ? 'block_high' : 'block_mid';
      }
      // Present/future intent — block
      return 'block_high';
    }
  }

  for (const kw of SAFETY_KEYWORDS.block_mid) {
    if (lower.includes(kw.toLowerCase())) {
      if (tense === 'past') {
        _monitorCount++;
        return _monitorCount >= MONITOR_ESCALATION_THRESHOLD ? 'block_mid' : 'monitor_only';
      }
      _midCount++;
      return 'block_mid';
    }
  }

  for (const kw of SAFETY_KEYWORDS.monitor_only) {
    if (lower.includes(kw.toLowerCase())) {
      _monitorCount++;
      if (_monitorCount >= MONITOR_ESCALATION_THRESHOLD) return 'block_mid';
      return 'monitor_only';
    }
  }

  return 'safe';
}

// ===== State =====
let conversationHistory = [];
let isWaitingForAI = false;
let voidCount = 0;
let currentLang = 'ko';
let containerEl = null;
let inputEl = null;
let sendBtn = null;
let voidBtn = null;
let cutSceneBtn = null;
let aiTextEl = null;
let echoLayerEl = null;
let waveCanvas = null;
let waveCtx = null;
let waveAnimId = null;
let onCompleteCallback = null;
let onCancelCallback = null;
let isCrisisBlocked = false;
let typingTimer = null;

// Scene-cut state
let currentSceneFragments = [];  // user messages for current scene
let completedScenes = [];        // finalized scene texts
let sceneConversationHistory = []; // full conversation for AI context

// Wave state — drives the ghost waveform
let waveState = {
  speaking: false,   // true while AI text is being typed
  intensity: 0.3,    // base intensity (ramps up when speaking)
  targetIntensity: 0.3,
  hue: 210,          // blueish ghost default
  time: 0,
};

// ===== Init =====
export function initRecordChat(container, { lang = 'ko', onComplete, onCancel } = {}) {
  containerEl = container;
  currentLang = lang;
  onCompleteCallback = onComplete;
  onCancelCallback = onCancel;
  conversationHistory = [];
  isWaitingForAI = false;
  voidCount = 0;
  isCrisisBlocked = false;
  _monitorCount = 0;
  _midCount = 0;

  container.innerHTML = `
    <div class="rec-ghost">
      <button class="rec-back" id="recordBackBtn">&larr;</button>
      <div class="rec-scene-indicator" id="recSceneIndicator" style="position:absolute;top:16px;right:20px;font-family:'Cormorant Garamond',serif;font-size:10px;letter-spacing:3px;color:rgba(196,168,130,0.4);text-transform:uppercase;">Scene 1</div>
      <div class="rec-echo-layer" id="recEchoLayer" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1;"></div>
      <div class="rec-wave-area">
        <canvas id="recWaveCanvas"></canvas>
      </div>
      <div class="rec-ai-text" id="recAiText"></div>
      <div class="rec-input-row" id="recInputRow">
        <button class="rec-void-btn" id="recordVoidBtn" title="${lang === 'en' ? "I don't want to say" : '말하고 싶지 않아'}">[...]</button>
        <input type="text" id="recordInput" placeholder="${lang === 'en' ? 'Tell me here...' : '여기에 이야기해...'}" autocomplete="off" />
        <button class="rec-send-btn" id="recordSendBtn">&uarr;</button>
      </div>
      <div class="rec-cut-row" id="recCutRow" style="text-align:center;margin-top:8px;opacity:0;transition:opacity 0.6s;">
        <button class="rec-cut-btn" id="recordCutBtn" style="background:none;border:1px solid rgba(196,168,130,0.2);color:rgba(196,168,130,0.5);font-family:'Cormorant Garamond',serif;font-size:11px;letter-spacing:2px;padding:6px 20px;cursor:pointer;transition:all 0.3s;">${lang === 'en' ? '— cut this scene —' : '— 이 장면은 여기까지 —'}</button>
      </div>
      <div class="rec-crisis-overlay hidden" id="recordCrisisOverlay"></div>
      <div class="rec-safety hidden" id="recSafety"></div>
    </div>
  `;

  aiTextEl = container.querySelector('#recAiText');
  inputEl = container.querySelector('#recordInput');
  sendBtn = container.querySelector('#recordSendBtn');
  voidBtn = container.querySelector('#recordVoidBtn');
  cutSceneBtn = container.querySelector('#recordCutBtn');
  echoLayerEl = container.querySelector('#recEchoLayer');
  waveCanvas = container.querySelector('#recWaveCanvas');
  waveCtx = waveCanvas.getContext('2d');

  // Reset scene state
  currentSceneFragments = [];
  completedScenes = [];
  sceneConversationHistory = [];

  // Events
  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  voidBtn.addEventListener('click', handleVoid);
  cutSceneBtn.addEventListener('click', handleCutScene);
  container.querySelector('#recordBackBtn').addEventListener('click', () => {
    if (onCancelCallback) onCancelCallback();
  });

  // Size canvas
  resizeWaveCanvas();
  window.addEventListener('resize', resizeWaveCanvas);

  // Start ghost wave
  startWaveLoop();

  // Show first question immediately (no API call needed — saves 2-3 seconds)
  const firstQ = currentLang === 'en'
    ? 'What comes to mind first?'
    : '제일 먼저 떠오르는 게 뭐야?';
  showAIText(firstQ, () => {
    conversationHistory.push({ role: 'assistant', content: firstQ });
    if (inputEl) inputEl.focus();
  });
}

export function destroyRecordChat() {
  if (waveAnimId) cancelAnimationFrame(waveAnimId);
  if (typingTimer) clearInterval(typingTimer);
  window.removeEventListener('resize', resizeWaveCanvas);
  if (containerEl) containerEl.innerHTML = '';
  conversationHistory = [];
  isWaitingForAI = false;
  isCrisisBlocked = false;
}

// ===== Wave Canvas =====
function resizeWaveCanvas() {
  if (!waveCanvas || !containerEl) return;
  const area = waveCanvas.parentElement;
  if (!area) return;
  const dpr = window.devicePixelRatio || 1;
  const w = area.clientWidth;
  const h = area.clientHeight;
  waveCanvas.width = w * dpr;
  waveCanvas.height = h * dpr;
  waveCanvas.style.width = w + 'px';
  waveCanvas.style.height = h + 'px';
  waveCtx.scale(dpr, dpr);
  waveCtx._w = w;
  waveCtx._h = h;
}

function startWaveLoop() {
  function tick() {
    drawGhostWave();
    waveAnimId = requestAnimationFrame(tick);
  }
  waveAnimId = requestAnimationFrame(tick);
}

function drawGhostWave() {
  const ctx = waveCtx;
  if (!ctx || !ctx._w) return;
  const W = ctx._w;
  const H = ctx._h;
  const dpr = window.devicePixelRatio || 1;

  // Reset transform for clearing
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W * dpr, H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  waveState.time += 0.012;

  // Smooth intensity lerp
  waveState.intensity += (waveState.targetIntensity - waveState.intensity) * 0.04;

  const cy = H / 2;
  const amp = 12 + waveState.intensity * 35;
  const t = waveState.time;

  // Draw 4 overlapping wave layers — ghost/ethereal feel
  for (let layer = 0; layer < 4; layer++) {
    const freq = 0.008 + layer * 0.004;
    const phase = t * (0.6 + layer * 0.3);
    const layerAmp = amp * (1 - layer * 0.18);
    const yOffset = (layer - 1.5) * 4; // slight vertical spread
    const alpha = (0.25 - layer * 0.04) * (0.6 + waveState.intensity * 0.4);

    ctx.beginPath();
    ctx.strokeStyle = `hsla(${waveState.hue}, 30%, 75%, ${alpha})`;
    ctx.lineWidth = 1.8 - layer * 0.3;

    for (let x = 0; x < W; x += 1.5) {
      // Organic waveform: multiple sines + noise
      const base = Math.sin(x * freq + phase);
      const harmonic = Math.sin(x * freq * 2.7 + phase * 1.4) * 0.25;
      const drift = Math.sin(x * 0.002 + t * 0.2 + layer) * 8;
      // Ghost flicker: random micro-jitter when speaking
      const flicker = waveState.speaking
        ? (Math.sin(x * 0.3 + t * 8 + layer * 3) * 1.5 * waveState.intensity)
        : 0;
      const y = cy + yOffset + (base + harmonic) * layerAmp + drift + flicker;

      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Subtle glow at center when speaking
  if (waveState.intensity > 0.4) {
    const glowAlpha = (waveState.intensity - 0.4) * 0.3;
    const grad = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, W * 0.35);
    grad.addColorStop(0, `hsla(${waveState.hue}, 25%, 70%, ${glowAlpha})`);
    grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

// ===== AI Text Display =====
function showAIText(text, onDone) {
  if (typingTimer) clearInterval(typingTimer);
  if (!aiTextEl) return;

  // Fade out previous text
  aiTextEl.style.opacity = '0';

  setTimeout(() => {
    aiTextEl.textContent = '';
    aiTextEl.style.opacity = '1';
    waveState.speaking = true;
    waveState.targetIntensity = 0.85;

    let i = 0;
    typingTimer = setInterval(() => {
      if (i < text.length) {
        aiTextEl.textContent += text[i];
        i++;
      } else {
        clearInterval(typingTimer);
        typingTimer = null;
        // Calm down wave after typing
        setTimeout(() => {
          waveState.speaking = false;
          waveState.targetIntensity = 0.3;
        }, 600);
        if (onDone) onDone();
      }
    }, 35);
  }, 300);
}

function showAITextStreaming() {
  // Returns an object for streaming text updates
  if (!aiTextEl) return null;
  aiTextEl.style.opacity = '0';

  setTimeout(() => {
    aiTextEl.textContent = '';
    aiTextEl.style.opacity = '1';
    waveState.speaking = true;
    waveState.targetIntensity = 0.85;
  }, 200);

  return {
    update(text) {
      if (aiTextEl) aiTextEl.textContent = text;
    },
    finish() {
      setTimeout(() => {
        waveState.speaking = false;
        waveState.targetIntensity = 0.3;
      }, 600);
    }
  };
}

function setInputEnabled(enabled) {
  if (inputEl) inputEl.disabled = !enabled;
  if (sendBtn) sendBtn.disabled = !enabled;
  if (voidBtn) voidBtn.disabled = !enabled;
}

// ===== AI Communication =====
async function requestAIMessage() {
  isWaitingForAI = true;
  setInputEnabled(false);

  // Wave goes into "listening" mode — gentle pulse
  waveState.targetIntensity = 0.5;
  waveState.speaking = true;

  try {
    // 토큰이 없으면 anon key로 폴백 (비로그인 대화 허용)
    const token = await getAccessToken().catch(() => null) || SUPABASE_ANON_KEY;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/collect-memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversation: conversationHistory,
        lang: currentLang,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      waveState.speaking = false;
      waveState.targetIntensity = 0.3;
      showAIText(err.reply || (currentLang === 'en' ? 'Something went wrong. Try again.' : '잠시 문제가 생겼어요. 다시 말해줄 수 있어?'));
      isWaitingForAI = false;
      setInputEnabled(true);
      return;
    }

    // SSE stream parsing — non-streaming display to avoid broken Korean chars
    // We accumulate chunks silently, then show the final text with typing effect
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullReply = '';
    let sceneComplete = false;
    let extractedScene = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));

          if (data.type === 'chunk') {
            fullReply += data.text;
          }

          if (data.type === 'done') {
            fullReply = data.reply || fullReply;
            sceneComplete = data.sceneComplete || false;
            extractedScene = data.extractedScene || null;
          }

          if (data.type === 'error') {
            fullReply = currentLang === 'en' ? 'Something went wrong.' : '잠시 문제가 생겼어요.';
          }
        } catch (_) {}
      }
    }

    // Display final clean text with typing animation
    const cleanDisplay = fullReply.replace(/\[SCENE_COMPLETE\][\s\S]*/, '').trim();
    await new Promise(resolve => {
      showAIText(cleanDisplay, resolve);
    });

    // History
    const cleanReply = fullReply.replace(/\[SCENE_COMPLETE\][\s\S]*/, '').trim();
    conversationHistory.push({ role: 'assistant', content: cleanReply });

    if (sceneComplete && extractedScene && onCompleteCallback) {
      setTimeout(() => onCompleteCallback(extractedScene), 1500);
    } else {
      isWaitingForAI = false;
      setInputEnabled(true);
      if (inputEl) inputEl.focus();
    }

  } catch (e) {
    console.error('[RecordChat] AI request failed:', e);
    waveState.speaking = false;
    waveState.targetIntensity = 0.3;
    showAIText(currentLang === 'en' ? 'Connection error. Try again.' : '연결 오류가 발생했어요.');
    isWaitingForAI = false;
    setInputEnabled(true);
  }
}

// ===== User Input =====
function handleSend() {
  if (isWaitingForAI || isCrisisBlocked) return;
  const text = inputEl.value.trim();
  if (!text) return;

  const safetyLevel = checkSafety(text);

  if (safetyLevel === 'block_high') {
    inputEl.value = '';
    handleCrisis(text);
    return;
  }

  if (safetyLevel === 'block_mid') {
    const warning = randomPick(currentLang === 'en'
      ? ["......Let's try a different way.", 'Those words carry too much weight right now.']
      : ['......다른 방식으로 말해볼까.', '그 말은 지금 너무 무거워.']);
    showAIText(warning);
  }

  inputEl.value = '';
  conversationHistory.push({ role: 'user', content: text });
  currentSceneFragments.push(text);

  // Float echo words from user input
  floatEchoWords(text);

  // Show cut button after first input
  const cutRow = containerEl.querySelector('#recCutRow');
  if (cutRow && currentSceneFragments.length >= 1) {
    cutRow.style.opacity = '1';
  }

  requestAIMessage();
}

function handleVoid() {
  if (isWaitingForAI || isCrisisBlocked) return;
  voidCount++;
  conversationHistory.push({ role: 'user', content: '[VOID]' });

  const reaction = randomPick(SILENCE_REACTIONS[currentLang] || SILENCE_REACTIONS.ko);
  showAIText(reaction, () => {
    conversationHistory.push({ role: 'assistant', content: reaction });
    requestAIMessage();
  });
}

function handleCrisis(blockedText) {
  isCrisisBlocked = true;
  setInputEnabled(false);

  // Red noise overlay
  const overlay = containerEl.querySelector('#recordCrisisOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = '<div class="crisis-noise"></div>';
  }

  // Shift wave to red
  waveState.hue = 0;
  waveState.targetIntensity = 0.9;
  waveState.speaking = true;

  const reaction = randomPick(CRISIS_REACTIONS[currentLang] || CRISIS_REACTIONS.ko);
  showAIText(reaction, () => {
    // Show safety resources
    const safetyEl = containerEl.querySelector('#recSafety');
    if (safetyEl) {
      safetyEl.classList.remove('hidden');
      safetyEl.innerHTML = SAFETY_RESOURCES_HTML[currentLang] || SAFETY_RESOURCES_HTML.ko;
    }
    // 5초 후 복귀 버튼 추가
    setTimeout(() => {
      if (!safetyEl) return;
      const returnBtn = document.createElement('button');
      returnBtn.textContent = currentLang === 'ko' ? '돌아가기' : 'Return';
      returnBtn.style.cssText = 'opacity:0;margin-top:1.5rem;background:none;border:1px solid rgba(196,168,130,0.3);color:rgba(196,168,130,0.7);font-family:"Cormorant Garamond",serif;font-size:0.9rem;padding:0.6rem 1.5rem;cursor:pointer;transition:opacity 1s ease;display:block;margin-left:auto;margin-right:auto;';
      safetyEl.appendChild(returnBtn);
      requestAnimationFrame(() => { returnBtn.style.opacity = '1'; });
      returnBtn.addEventListener('click', () => {
        // Clean up record chat before returning
        isCrisisBlocked = false;
        if (containerEl) {
          containerEl.classList.add('hidden');
          containerEl.style.display = 'none';
          containerEl.innerHTML = '';
        }
        if (typeof window.showMainMenu === 'function') window.showMainMenu();
      });
    }, 3000);
  });
}

// ===== Echo Float — 잔향 단어 떠다니기 =====
function floatEchoWords(text) {
  if (!echoLayerEl) return;
  // Extract meaningful words (2+ chars, skip common particles)
  const stopWords = new Set(['이', '그', '저', '는', '은', '을', '를', '에', '의', '도', '가', 'the', 'a', 'an', 'is', 'was', 'to', 'in', 'it', 'my', 'i', 'and', 'but']);
  const words = text.split(/[\s,.\-!?;:'"]+/).filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()));
  // Pick up to 3 words
  const picks = words.length <= 3 ? words : words.sort(() => Math.random() - 0.5).slice(0, 3);

  picks.forEach((word, idx) => {
    const el = document.createElement('div');
    el.textContent = word;
    el.style.cssText = `
      position:absolute;
      font-family:'Cormorant Garamond',serif;
      font-size:${11 + Math.random() * 6}px;
      color:rgba(196,168,130,${0.15 + Math.random() * 0.2});
      letter-spacing:2px;
      left:${10 + Math.random() * 80}%;
      top:${20 + Math.random() * 50}%;
      transform:translate(-50%,-50%);
      opacity:0;
      transition:opacity 1.5s ease, transform 8s ease;
      pointer-events:none;
    `;
    echoLayerEl.appendChild(el);

    // Animate in
    setTimeout(() => {
      el.style.opacity = '1';
      el.style.transform = `translate(-50%,-50%) translateY(${-15 - Math.random() * 25}px)`;
    }, 100 + idx * 300);

    // Fade out and remove
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 2000);
    }, 6000 + Math.random() * 3000);
  });
}

// ===== Scene Cut — 장면 끊기 (파편만 저장, AI 호출 없음) =====
function handleCutScene() {
  if (isWaitingForAI || currentSceneFragments.length === 0) return;

  const sceneNum = completedScenes.length + 1;

  // Save fragments for this scene (no AI call — just store the raw input)
  completedScenes.push({
    fragments: [...currentSceneFragments],
    sceneType: completedScenes.length === 0 ? 'normal' : 'branch',
  });

  // Show brief confirmation + choice
  showSceneCutUI(sceneNum);
}

function showSceneCutUI(sceneNum) {
  const inputRow = containerEl.querySelector('#recInputRow');
  const cutRow = containerEl.querySelector('#recCutRow');
  if (inputRow) inputRow.style.display = 'none';
  if (cutRow) cutRow.style.display = 'none';

  const summary = currentSceneFragments.join(' — ');
  const preview = summary.length > 60 ? summary.substring(0, 60) + '…' : summary;

  showAIText(currentLang === 'en'
    ? `Scene ${sceneNum} held: "${preview}"`
    : `장면 ${sceneNum} 담김: "${preview}"`, () => {
    const choiceDiv = document.createElement('div');
    choiceDiv.id = 'recSceneChoice';
    choiceDiv.style.cssText = 'text-align:center;margin-top:1.5rem;opacity:0;transition:opacity 0.8s;';
    choiceDiv.innerHTML = `
      <div style="font-size:9px;letter-spacing:3px;color:rgba(196,168,130,0.3);margin-bottom:1rem;text-transform:uppercase;">Scene ${sceneNum}</div>
      <button id="recNextSceneBtn" style="margin:0 8px;background:none;border:1px solid rgba(196,168,130,0.3);color:rgba(196,168,130,0.7);font-family:'Cormorant Garamond',serif;font-size:12px;letter-spacing:2px;padding:8px 24px;cursor:pointer;transition:all 0.3s;">
        ${currentLang === 'en' ? 'Next scene' : '다음 장면으로'}
      </button>
      <button id="recSealBtn" style="margin:0 8px;background:none;border:1px solid rgba(196,168,130,0.3);color:rgba(196,168,130,0.7);font-family:'Cormorant Garamond',serif;font-size:12px;letter-spacing:2px;padding:8px 24px;cursor:pointer;transition:all 0.3s;">
        ${currentLang === 'en' ? 'Seal this memory' : '이 기억을 봉인'}
      </button>
    `;
    aiTextEl.parentElement.appendChild(choiceDiv);
    requestAnimationFrame(() => { choiceDiv.style.opacity = '1'; });

    choiceDiv.querySelector('#recNextSceneBtn').addEventListener('click', startNextScene);
    choiceDiv.querySelector('#recSealBtn').addEventListener('click', sealMemory);
  });
}

function startNextScene() {
  const choiceDiv = containerEl.querySelector('#recSceneChoice');
  if (choiceDiv) choiceDiv.remove();

  currentSceneFragments = [];
  const inputRow = containerEl.querySelector('#recInputRow');
  const cutRow = containerEl.querySelector('#recCutRow');
  if (inputRow) inputRow.style.display = '';
  if (cutRow) { cutRow.style.display = ''; cutRow.style.opacity = '0'; }

  const indicator = containerEl.querySelector('#recSceneIndicator');
  if (indicator) indicator.textContent = `Scene ${completedScenes.length + 1}`;

  if (echoLayerEl) echoLayerEl.innerHTML = '';

  setInputEnabled(true);
  if (cutSceneBtn) cutSceneBtn.disabled = false;

  const nextQ = currentLang === 'en'
    ? "What comes next? What do you see after that?"
    : "그 다음엔? 그 뒤에 뭐가 보여?";
  showAIText(nextQ, () => {
    conversationHistory.push({ role: 'assistant', content: nextQ });
    if (inputEl) inputEl.focus();
  });
}

function sealMemory() {
  if (completedScenes.length > 0) {
    completedScenes[completedScenes.length - 1].sceneType = 'ending';
  }

  const choiceDiv = containerEl.querySelector('#recSceneChoice');
  if (choiceDiv) choiceDiv.remove();

  // Pass raw scene fragments + full conversation to confession.js
  // confession.js will call generate-scene-from-conversation to reconstruct all scenes
  const extractedSceneData = {
    _isPhaseB: true,
    rawScenes: completedScenes,
    conversation: conversationHistory,
  };

  if (onCompleteCallback) {
    onCompleteCallback(extractedSceneData);
  }
}

// ===== Exports =====
export function getConversationHistory() { return conversationHistory; }
export function getVoidCount() { return voidCount; }
export function getCompletedScenes() { return completedScenes; }

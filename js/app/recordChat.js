/**
 * recordChat.js — 대화형 기억 수집 UI
 * Phase A: AI "또다른 나"와 3~7턴 대화
 *
 * UI: 중앙에 유령 파형 + AI 텍스트, 하단에 입력창
 * 채팅 버블 없음. 파형이 "또다른 나"의 존재.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config.js';
import { getAccessToken, getSupabaseClient } from '../lib/supabaseClient.js';
import { emotionVectorToWaveStyle } from '../shared/math.js';

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

// Conversation turn counter (for seal button visibility)
let _turnCount = 0;
const SEAL_BUTTON_THRESHOLD = 3;

// End-of-conversation detection phrases
const SEAL_PHRASES = {
  ko: ['여기까지', '이제 됐어', '더 없어', '끝이야', '그게 다야', '다 말했어', '이만', '봉인'],
  en: ["that's all", 'enough', "i'm done", 'nothing more', "that's it", 'seal it', 'end here'],
};

// Wave state — drives the ghost waveform
// Emotion detected from AI → emotionVectorToWaveStyle() drives color/speed/amplitude
let waveState = {
  speaking: false,   // true while AI text is being typed
  intensity: 0.3,    // base intensity (ramps up when speaking)
  targetIntensity: 0.3,
  hue: 210,          // blueish ghost default
  time: 0,
  // Emotion-driven wave style (from emotionVectorToWaveStyle)
  emotionStyle: null, // { color, speed, amplitude, frequency, chaos, lineCount }
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
      <div class="rec-seal-row" id="recSealRow" style="text-align:center;margin-top:8px;opacity:0;pointer-events:none;transition:opacity 1.2s ease;">
        <button class="rec-seal-btn" id="recordSealBtn" style="background:none;border:1px solid rgba(196,168,130,0.25);color:rgba(196,168,130,0.5);font-family:'Cormorant Garamond',serif;font-size:11px;letter-spacing:2px;padding:6px 20px;cursor:pointer;transition:all 0.3s;">${lang === 'en' ? '— seal this memory —' : '— 이 기억을 봉인 —'}</button>
      </div>
      <div class="rec-crisis-overlay hidden" id="recordCrisisOverlay"></div>
      <div class="rec-safety hidden" id="recSafety"></div>
    </div>
  `;

  aiTextEl = container.querySelector('#recAiText');
  inputEl = container.querySelector('#recordInput');
  sendBtn = container.querySelector('#recordSendBtn');
  voidBtn = container.querySelector('#recordVoidBtn');
  echoLayerEl = container.querySelector('#recEchoLayer');
  waveCanvas = container.querySelector('#recWaveCanvas');
  waveCtx = waveCanvas.getContext('2d');

  // Reset state
  _turnCount = 0;

  // Events
  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  voidBtn.addEventListener('click', handleVoid);
  container.querySelector('#recordSealBtn').addEventListener('click', handleSealRequest);
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
  if (typeof window.destroyFloatingAnchor === 'function') window.destroyFloatingAnchor();
  if (containerEl) containerEl.innerHTML = '';
  conversationHistory = [];
  isWaitingForAI = false;
  isCrisisBlocked = false;
  _anchorCache = null;
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

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W * dpr, H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const es = waveState.emotionStyle; // from emotionVectorToWaveStyle
  const speedMul = es ? es.speed / 0.3 : 1.0; // normalize (default speed=0.3)
  waveState.time += 0.012 * speedMul;

  waveState.intensity += (waveState.targetIntensity - waveState.intensity) * 0.04;

  const cy = H / 2;
  const baseAmp = es ? Math.min(es.amplitude, 60) : 30;
  const amp = baseAmp * (0.4 + waveState.intensity * 0.6);
  const t = waveState.time;
  const chaos = es ? es.chaos : 0.1;
  const layerCount = es ? Math.min(es.lineCount, 8) : 4;

  // Color from emotion or default hue
  const cr = es ? es.color.r : 0;
  const cg = es ? es.color.g : 0;
  const cb = es ? es.color.b : 0;
  const useRgb = !!es;

  for (let layer = 0; layer < layerCount; layer++) {
    const freq = (es ? es.frequency : 0.008) + layer * 0.003;
    const phase = t * (0.6 + layer * 0.25);
    const layerAmp = amp * (1 - layer * (0.12 / Math.max(layerCount - 1, 1)));
    const yOffset = (layer - (layerCount - 1) / 2) * 3;
    const alpha = (0.25 - layer * (0.03 / Math.max(layerCount - 1, 1))) * (0.6 + waveState.intensity * 0.4);

    ctx.beginPath();
    if (useRgb) {
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
    } else {
      ctx.strokeStyle = `hsla(${waveState.hue}, 30%, 75%, ${alpha})`;
    }
    ctx.lineWidth = 1.8 - layer * (0.4 / Math.max(layerCount - 1, 1));

    for (let x = 0; x < W; x += 1.5) {
      const base = Math.sin(x * freq + phase);
      const harmonic = Math.sin(x * freq * 2.7 + phase * 1.4) * 0.25;
      const drift = Math.sin(x * 0.002 + t * 0.2 + layer) * (5 + chaos * 8);
      const flicker = waveState.speaking
        ? (Math.sin(x * 0.3 + t * 8 + layer * 3) * (1 + chaos * 3) * waveState.intensity)
        : 0;
      const y = cy + yOffset + (base + harmonic) * layerAmp + drift + flicker;

      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Glow at center
  if (waveState.intensity > 0.4) {
    const glowAlpha = (waveState.intensity - 0.4) * 0.3;
    const grad = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, W * 0.35);
    if (useRgb) {
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${glowAlpha})`);
    } else {
      grad.addColorStop(0, `hsla(${waveState.hue}, 25%, 70%, ${glowAlpha})`);
    }
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

    // Float echo words from AI response (cleaner than user input — no typos)
    floatEchoWords(cleanReply, true);

    // Detect emotion from conversation → update wave style
    _updateWaveFromConversation();

    // Try to match floating anchors (objects only, not emotions)
    _tryFloatingAnchor(cleanReply);

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

  // Check for seal phrases — user wants to end the conversation
  const lowerText = text.toLowerCase();
  const isSealPhrase = SEAL_PHRASES.ko.some(p => lowerText.includes(p))
    || SEAL_PHRASES.en.some(p => lowerText.includes(p));

  if (isSealPhrase) {
    // Inject seal request into conversation so AI knows to wrap up
    conversationHistory.push({ role: 'user', content: text });
    conversationHistory.push({ role: 'user', content: '[USER_SEAL_REQUEST]' });
    floatEchoWords(text);
    requestAIMessage();
    return;
  }

  conversationHistory.push({ role: 'user', content: text });
  _turnCount++;

  // Float echo words from user input
  floatEchoWords(text);

  // Show seal button after enough turns
  const sealRow = containerEl.querySelector('#recSealRow');
  if (sealRow && _turnCount >= SEAL_BUTTON_THRESHOLD) {
    sealRow.style.opacity = '1';
    sealRow.style.pointerEvents = 'auto';
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
function floatEchoWords(text, isAIResponse = false) {
  if (!echoLayerEl) return;
  // Extended stopwords — filter particles, connectors, common verbs
  const stopWords = new Set([
    '이', '그', '저', '는', '은', '을', '를', '에', '의', '도', '가', '와', '과', '로', '으로',
    '하고', '해서', '그래서', '그런데', '근데', '있어', '없어', '했어', '거야', '건가',
    '네가', '내가', '우리', '너는', '나는', '거기', '여기', '이건', '그건', '뭐', '좀',
    'the', 'a', 'an', 'is', 'was', 'to', 'in', 'it', 'my', 'i', 'and', 'but', 'so',
    'that', 'this', 'you', 'your', 'we', 'do', 'did', 'have', 'had', 'be', 'been',
    'what', 'how', 'when', 'where', 'why', 'can', 'could', 'would', 'should',
  ]);
  const words = text.split(/[\s,.\-!?;:'"…·~()]+/).filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()));

  // AI responses: pick more selectively (emotion/noun words only)
  // User input: pick fewer to reduce typo exposure
  const maxPicks = isAIResponse ? 2 : 1;
  const picks = words.length <= maxPicks ? words : words.sort(() => Math.random() - 0.5).slice(0, maxPicks);

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

// ===== Emotion Detection → Wave Style Update =====
// Scans recent conversation for emotion keywords, builds rough emotion vector,
// then applies emotionVectorToWaveStyle to drive the wave animation.

const EMOTION_KEYWORDS = {
  fear:     ['무서', '두려', '공포', 'fear', 'afraid', 'scared', 'terrif'],
  sadness:  ['슬', '울', '눈물', '아프', 'sad', 'cry', 'tear', 'hurt', 'pain'],
  anger:    ['화', '분노', '짜증', '열받', 'angry', 'rage', 'furious', 'mad'],
  longing:  ['그리', '보고싶', '그립', 'miss', 'long for', 'yearn'],
  guilt:    ['미안', '죄책', '잘못', 'sorry', 'guilt', 'fault', 'blame'],
  joy:      ['기쁘', '행복', '웃', '좋', 'happy', 'joy', 'glad', 'smile'],
  numbness: ['무감각', '아무것도', '공허', 'numb', 'empty', 'nothing', 'void'],
};

function _updateWaveFromConversation() {
  // Build rough emotion vector from recent user messages
  const userMsgs = conversationHistory
    .filter(m => m.role === 'user' && m.content !== '[VOID]' && m.content !== '[USER_SEAL_REQUEST]')
    .slice(-5) // last 5 user messages
    .map(m => m.content.toLowerCase())
    .join(' ');

  if (!userMsgs) return;

  const vec = {};
  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (userMsgs.includes(kw)) score += 0.3;
    }
    vec[emotion] = Math.min(score, 1.0);
  }

  // Only update if any emotion detected
  const total = Object.values(vec).reduce((a, b) => a + b, 0);
  if (total > 0) {
    waveState.emotionStyle = emotionVectorToWaveStyle(vec);
  }
}

// ===== Floating Anchor — AI 응답에서 사물 키워드 매칭 (감정은 파동으로) =====
let _anchorCache = null; // cache anchor_images table once per session

async function _tryFloatingAnchor(aiText) {
  if (!containerEl || typeof window.startFloatingAnchor !== 'function') return;

  try {
    // Load anchor_images once
    if (!_anchorCache) {
      const client = getSupabaseClient();
      if (!client) return;
      const { data, error } = await client.from('anchor_images').select('*');
      _anchorCache = (!error && data) ? data : [];
    }
    if (_anchorCache.length === 0) return;

    // Extract nouns/keywords from AI text — skip emotion words (those drive the wave)
    const allEmotionKw = Object.values(EMOTION_KEYWORDS).flat();
    const words = aiText.split(/[\s,.\-!?;:'"…·~()]+/).filter(w =>
      w.length >= 2 && !allEmotionKw.some(ek => w.toLowerCase().includes(ek))
    );

    // Find matching anchor (objects only — emotions go to wave)
    for (const word of words) {
      const lower = word.toLowerCase();
      const match = _anchorCache.find(a =>
        a.keyword && lower.includes(a.keyword.toLowerCase()) && a.emotion === null
      ) || _anchorCache.find(a =>
        a.keyword && lower.includes(a.keyword.toLowerCase())
      );
      if (match) {
        // Determine vividness from conversation depth
        const vividness = Math.min(_turnCount / 7, 1.0);

        // Filter by vividness range
        if (vividness >= (match.vividness_min || 0) && vividness <= (match.vividness_max || 1)) {
          const ghostEl = containerEl.querySelector('.rec-ghost');
          if (ghostEl) {
            window.startFloatingAnchor(ghostEl, match.keyword, 0.5, {
              image_type: match.image_type,
              content: match.content,
              storage_path: match.storage_path,
              vividness,
            });
          }
          break; // One anchor per AI response
        }
      }
    }
  } catch (e) {
    // Non-fatal — anchor matching is enhancement only
    console.warn('[RecordChat] anchor matching error:', e.message);
  }
}

// ===== Seal Request — 사용자가 봉인 버튼을 눌렀을 때 =====
function handleSealRequest() {
  if (isWaitingForAI) return;

  // Inject seal signal into conversation → AI will wrap up with one final question
  conversationHistory.push({ role: 'user', content: '[USER_SEAL_REQUEST]' });

  // Hide seal button
  const sealRow = containerEl.querySelector('#recSealRow');
  if (sealRow) { sealRow.style.opacity = '0'; sealRow.style.pointerEvents = 'none'; }

  requestAIMessage();
}

// ===== Exports =====
export function getConversationHistory() { return conversationHistory; }
export function getVoidCount() { return voidCount; }

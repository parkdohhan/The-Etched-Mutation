// js/demo/demoFlow.js — 데모 플 우 전면 구현 (index.html / index.js edit 없음)

import { ByeoriEngine } from '../core/ByeoriEngine.js';
import { Visualizer } from '../ui/Visualizer.js';
import { demoState, setPhase, recordScene, PHASES } from './demoState.js';
import { localAnalyze } from './demoEmotionLocal.js';
import { aiAnalyze } from './demoAIAnalyze.js';
import { waitForSupabaseClient } from '../lib/supabaseClient.js';
import { networkService } from '../services/NetworkService.js';

const engine = new ByeoriEngine();
const visualizer = new Visualizer();

// ——— 인라인: index.js emotionVectorToWaveStyle (math.js edit 금지) ———
function emotionVectorToWaveStyle(emotionVector) {
  if (!emotionVector) return { color: { r: 100, g: 140, b: 180 }, speed: 0.3, amplitude: 30, frequency: 0.008, chaos: 0.1, lineCount: 8, trailOpacity: 0.15 };
  const values = Object.values(emotionVector);
  const intensity = values.reduce((a, b) => a + b, 0) / Math.max(6, values.length);
  const entries = Object.entries(emotionVector);
  const dominant = entries.length ? entries.sort((a, b) => b[1] - a[1])[0] : ['sadness', 0];
  const colors = {
    fear: { r: 100, g: 80, b: 180 },
    sadness: { r: 80, g: 100, b: 160 },
    anger: { r: 200, g: 80, b: 80 },
    joy: { r: 200, g: 180, b: 100 },
    longing: { r: 80, g: 180, b: 180 },
    guilt: { r: 150, g: 130, b: 100 },
    shame: { r: 140, g: 100, b: 120 },
    numbness: { r: 100, g: 100, b: 110 },
    isolation: { r: 80, g: 90, b: 130 },
    moral_pain: { r: 130, g: 100, b: 90 },
  };
  const baseColor = colors[dominant[0]] || colors.sadness;
  return {
    color: baseColor,
    speed: 0.3 + intensity * 0.9,
    amplitude: 30 + intensity * 50,
    frequency: 0.008 + intensity * 0.012,
    chaos: 0.1 + intensity * 0.7,
    lineCount: Math.max(4, Math.min(20, 6 + Math.floor(intensity * 14))),
    trailOpacity: 0.15 - intensity * 0.07,
  };
}

const MONOLOGUES = [
  { text: 'I shouldn\'t have done that', entryLine: 'I thought that was the right thing at the time.', vad: { v: -0.5, a: 0.2, d: -0.6 }, x: 0.3, y: 0.35 },
  { text: 'I just wanted to run away', entryLine: 'That was the only thing I could do.', vad: { v: -0.6, a: 0.7, d: -0.4 }, x: 0.65, y: 0.45 },
  { text: 'I don\'t know why I did that', entryLine: 'Maybe I actually knew all along.', vad: { v: -0.4, a: 0.3, d: -0.3 }, x: 0.45, y: 0.6 },
  { text: 'I wish it never happened', entryLine: 'But it\'s still there, isn\'t it.', vad: { v: -0.3, a: -0.4, d: -0.2 }, x: 0.2, y: 0.55 },
];

const DEMO_MEMORY_ID = '8fe034ef-6db0-4ba1-b291-66954fea2e08';

const SCENE_INPUT_CONFIG = [
  { mode: 'free', prompt: 'In that moment, write the first words that come to mind.' },
  { mode: 'free', prompt: 'What was happening inside you at that moment?' },
  { mode: 'short', prompt: 'Right now, this memory is ___ to me.' },
];

const SEED_GHOST_VECTORS = [
  { base: { anger: 0.7, guilt: 0.3, shame: 0.1 } },
  { base: { fear: 0.6, isolation: 0.4, sadness: 0.2 } },
  { base: { guilt: 0.8, sadness: 0.3, numbness: 0.1 } },
  { base: { numbness: 0.5, isolation: 0.3, sadness: 0.4 } },
  { base: { anger: 0.5, shame: 0.4, guilt: 0.2 } },
];

// 시드 scene (Supabase failure 시)
const SEED_SCENES = [
  { scene_order: 0, text: 'Mom came in and started yelling...', original_emotion: { anger: 0.84, guilt: 0.4, shame: 0.19 } },
  { scene_order: 1, text: 'So I ran and kept running...', original_emotion: { fear: 0.79, isolation: 0.56 } },
  { scene_order: 2, text: 'Somehow I made it back home...', original_emotion: { isolation: 0.83, sadness: 0.69 } },
];

let openingWaveId = null;
let monologueFrameId = null;
let playWaveFrameId = null;

function setPhaseActive(phaseId) {
  document.querySelectorAll('.demo-phase').forEach((el) => el.classList.remove('active'));
  const el = document.getElementById(phaseId);
  if (el) el.classList.add('active');
}

function init() {
  (async () => {
    try {
      await waitForSupabaseClient(5000);
      demoState.supabaseReady = true;
      const res = await networkService.getScenesByMemoryId(DEMO_MEMORY_ID);
      if (res.ok && res.data && res.data.length > 0) {
        demoState.scenes = res.data;
      } else {
        console.warn('[demoFlow] Supabase 장면 로드 실패 또는 빈 데이터, 시드 사용');
        demoState.scenes = SEED_SCENES;
      }
    } catch (e) {
      console.warn('[demoFlow] Supabase 대기/로드 실패:', e.message);
      demoState.scenes = SEED_SCENES;
    }
    startOpening();
  })();
}

function startOpening() {
  setPhase(PHASES.OPENING);
  setPhaseActive('phaseOpening');

  const canvas = document.getElementById('openingWaveCanvas');
  const textEl = document.getElementById('openingText');
  if (!canvas || !textEl) return;

 // index 오프닝 동일: container 기준 크기 확정 후 wave start
  requestAnimationFrame(() => {
    if (!canvas.parentElement || canvas.offsetWidth === 0) return;
    startOpeningWaveLoop(canvas, textEl);
  });
}

function startOpeningWaveLoop(canvas, textEl) {
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);

  const width = canvas.width / 2;
  const height = canvas.height / 2;
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

  let openingTime = 0;
  let demoMouseX = -100;
  let demoMouseY = -100;
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    demoMouseX = (e.clientX - rect.left) * (canvas.width / 2 / rect.width);
    demoMouseY = (e.clientY - rect.top) * (canvas.height / 2 / rect.height);
  });
  canvas.addEventListener('mouseleave', () => { demoMouseX = -100; demoMouseY = -100; });

  function tick() {
    ctx.fillStyle = 'rgba(10, 10, 12, 0.92)';
    ctx.fillRect(0, 0, width, height);
    const centerY = height / 2;

    waves.forEach((wave) => {
      ctx.beginPath();
      ctx.lineWidth = 1.2;
      for (let x = 0; x < width; x++) {
        const baseY = centerY
          + Math.sin(x * wave.freq + openingTime * wave.speed + wave.phase) * wave.amplitude
          + Math.sin(x * wave.freq * 0.5 + openingTime * wave.speed * 0.6 + wave.phase * 1.4) * (wave.amplitude * 0.4)
          + Math.sin(x * wave.freq * 2.3 + openingTime * wave.speed * 1.3) * (wave.amplitude * 0.15)
          + Math.sin(x * wave.freq * 0.3 + openingTime * wave.speed * 0.4 + wave.phase * 2.1) * (wave.amplitude * 0.25)
          + Math.sin(x * wave.freq * 3.7 + openingTime * wave.speed * 1.8 + wave.phase * 0.7) * (wave.amplitude * 0.1);
        const noise = Math.sin(x * 0.003 + openingTime * 0.02) * Math.cos(x * 0.007 + openingTime * 0.015) * wave.noiseScale;
        const irregularOffset = wave.amplitude * noise * 0.4;
        let hoverPush = 0;
        if (demoMouseX >= 0 && demoMouseY >= 0) {
          const distX = Math.abs(x - demoMouseX);
          const distY = Math.abs(baseY - demoMouseY);
          const dist = Math.sqrt(distX * distX + distY * distY);
          const influenceRadius = 200;
          const normalizedDist = Math.min(dist / influenceRadius, 1);
          const influence = Math.pow(1 - normalizedDist, 3);
          if (influence > 0) {
            const pushDirection = demoMouseY - baseY;
            const xNormalized = Math.min(distX / influenceRadius, 1);
            const xInfluence = Math.pow(1 - xNormalized, 2);
            hoverPush = pushDirection * influence * xInfluence * 1.8;
            const amplitudeBoost = influence * 0.8;
            hoverPush += (baseY - centerY) * amplitudeBoost;
            hoverPush += Math.sin(distX * 0.05) * influence * 15;
          }
        }
        const y = baseY + irregularOffset + hoverPush;
        const clampedY = Math.max(2, Math.min(height - 2, y));
        x === 0 ? ctx.moveTo(x, clampedY) : ctx.lineTo(x, clampedY);
      }
      ctx.strokeStyle = wave.color + wave.baseOpacity + ')';
      ctx.stroke();
    });
    openingTime += 0.5;
    openingWaveId = requestAnimationFrame(tick);
  }
  tick();

  let step = 0;
  textEl.textContent = '';
  setTimeout(() => {
    typeTo(textEl, 'Are you ready to look into your memories?', 50, () => {
      step = 1;
      setTimeout(() => {
        typeTo(textEl, 'Are you ready to look into your memories?\nOkay...', 40, () => {
          textEl.classList.add('ready');
        });
      }, 1000);
    });
  }, 1000);

  function goNext() {
    if (openingWaveId) cancelAnimationFrame(openingWaveId);
    openingWaveId = null;
    startMonologue();
  }
  textEl.addEventListener('click', goNext, { once: true });
  setTimeout(goNext, 4000);
}

function typeTo(el, fullText, speed, done) {
  let i = 0;
  el.textContent = '';
  function run() {
    if (i < fullText.length) {
      el.textContent += fullText[i++];
      setTimeout(run, speed);
    } else if (done) done();
  }
  run();
}

function startMonologue() {
  setPhase(PHASES.MONOLOGUE);
  setPhaseActive('phaseMonologue');

  const container = document.getElementById('monologueParticles');
  const previewCanvas = document.getElementById('monologuePreviewCanvas');
  if (!container) return;
  container.innerHTML = '';

  const monologueWords = MONOLOGUES.map((m) => {
    const div = document.createElement('div');
    div.className = 'monologue-word';
    div.textContent = m.text;
    div.dataset.text = m.text;
    div.dataset.entryLine = m.entryLine;
    div.dataset.vadA = String(m.vad.a);
    return { ...m, el: div };
  });

  monologueWords.forEach(({ el, x, y }) => {
    el.style.left = `${x * 100}%`;
    el.style.top = `${y * 100}%`;
    el.style.transform = 'translate(-50%, -50%)';
    container.appendChild(el);
  });

  let t = 0;
  function animate() {
    t += 0.02;
    monologueWords.forEach((m, i) => {
      const freq = 0.3 + Math.abs(m.vad.a) * 0.8;
      const dy = Math.sin(t + i * 1.5) * 8 * freq;
      m.el.style.transform = `translate(-50%, calc(-50% + ${dy}px))`;
    });
    monologueFrameId = requestAnimationFrame(animate);
  }
  animate();

  monologueWords.forEach((m) => {
    m.el.addEventListener('mouseenter', () => {
      demoState.hoverLog.push({ text: m.text, enterTime: Date.now() });
      if (previewCanvas) {
        previewCanvas.classList.add('visible');
        const rough = localAnalyze(m.text);
        if (rough && rough.base) {
          const style = emotionVectorToWaveStyle(rough.base);
          initCanvas2x(previewCanvas);
          const ctx = previewCanvas.getContext('2d');
          const w = previewCanvas.offsetWidth;
          const h = previewCanvas.offsetHeight;
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(10,10,14,1)';
          ctx.fillRect(0, 0, w, h);
          visualizer.comparisonWaveTime = (visualizer.comparisonWaveTime || 0) + 0;
          visualizer.drawComparisonWave(previewCanvas, rough.base, 0, style);
        }
      }
    });
    m.el.addEventListener('mouseleave', () => {
      const last = demoState.hoverLog[demoState.hoverLog.length - 1];
      if (last && !last.exitTime) {
        last.exitTime = Date.now();
        last.duration = last.exitTime - last.enterTime;
      }
      if (previewCanvas) previewCanvas.classList.remove('visible');
    });
    m.el.addEventListener('click', () => {
      if (monologueFrameId) cancelAnimationFrame(monologueFrameId);
      selectMonologue(m);
    });
  });
}

function selectMonologue(monologue) {
  demoState.selectedMonologueText = monologue.text;
  demoState.selectedMonologueEntryLine = monologue.entryLine;
  demoState.memoryId = DEMO_MEMORY_ID;
  setPhase(PHASES.MEMORY_ENTRY);
  startMemoryEntry(monologue);
}

function startMemoryEntry(monologue) {
  setPhaseActive('phaseEntry');

  const hintEl = document.getElementById('entryTerrainHint');
  const firstLineEl = document.getElementById('entryFirstLine');
  if (firstLineEl) {
    firstLineEl.textContent = '';
    firstLineEl.style.opacity = '0';
    setTimeout(() => {
      firstLineEl.textContent = monologue.entryLine;
      firstLineEl.style.transition = 'opacity 0.6s';
      firstLineEl.style.opacity = '1';
    }, 300);
  }

  if (hintEl && demoState.scenes.length > 0) {
    const scene = demoState.scenes[0];
    const em = scene.original_emotion || {};
    const vals = Object.values(em);
    const sum = vals.reduce((a, b) => a + b, 0);
    const baseY = 0.5 - (sum > 0 ? (em.anger || 0) * 0.1 : 0);
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 60;
    c.style.width = '100%';
    c.style.height = '100%';
    hintEl.innerHTML = '';
    hintEl.appendChild(c);
    const ctx = c.getContext('2d');
    const dpr = Math.min(devicePixelRatio, 2);
    c.width = 320 * dpr;
    c.height = 60 * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = 'rgba(196,168,130,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= 320; x += 10) {
      const y = 30 + Math.sin(x * 0.02) * 8;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    let flash = 0;
    const flashInterval = setInterval(() => {
      flash++;
      ctx.clearRect(0, 0, 320, 60);
      ctx.strokeStyle = 'rgba(196,168,130,0.5)';
      ctx.beginPath();
      for (let x = 0; x <= 320; x += 10) {
        const y = 30 + Math.sin(x * 0.02) * 8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (flash % 6 === 0) {
        ctx.strokeStyle = 'rgba(196,168,130,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(80, 30);
        ctx.lineTo(240, 30);
        ctx.stroke();
        ctx.lineWidth = 1.5;
      }
      if (flash > 30) clearInterval(flashInterval);
    }, 100);
  }

  setTimeout(startPlay, 1500);
}

function startPlay() {
  setPhase(PHASES.PLAYING);
  setPhaseActive('phasePlay');
  demoState.sceneIndex = 0;

  const playCanvas = document.getElementById('playWaveCanvas');
  const terrainCanvas = document.getElementById('terrainCanvas2D');
  if (playCanvas) {
    initCanvas2x(playCanvas);
    const neutralStyle = { color: { r: 100, g: 140, b: 180 }, speed: 0.3, amplitude: 20, frequency: 0.006, chaos: 0.05 };
    function tick() {
      visualizer.alignmentWaveTime = (visualizer.alignmentWaveTime || 0) + 0.016;
      const ctx = playCanvas.getContext('2d');
      const w = playCanvas.offsetWidth;
      const h = playCanvas.offsetHeight;
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(10,10,14,1)';
        ctx.fillRect(0, 0, w, h);
        visualizer.drawAlignmentWave(playCanvas, h / 2, 0.7, 0, demoState.liveVector ? emotionVectorToWaveStyle(demoState.liveVector.base) : neutralStyle, null);
      }
      playWaveFrameId = requestAnimationFrame(tick);
    }
    tick();
  }

  draw2DTerrain(terrainCanvas, []);

  window.scrollTo(0, 0);
  const phaseEl = document.getElementById('phasePlay');
  if (phaseEl) phaseEl.scrollTop = 0;
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;

  if (demoState.scenes.length > 0) renderScene(demoState.scenes[0]);
  else startReveal();
}

function initCanvas2x(canvas) {
  if (!canvas || canvas.offsetWidth === 0) return;
  const dpr = Math.min(devicePixelRatio, 2) || 2;
  canvas.width = canvas.offsetWidth * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.scale(dpr, dpr);
}

function renderScene(scene) {
  const sceneTextEl = document.getElementById('demoSceneText');
  const inputPromptEl = document.getElementById('inputPrompt');
  const inputEl = document.getElementById('sceneTextInput');
  const submitBtn = document.getElementById('sceneSubmitBtn');
  if (!sceneTextEl || !inputEl) return;

  sceneTextEl.textContent = '';
  typeTo(sceneTextEl, scene.text, 35, () => {});

  const idx = demoState.sceneIndex;
  const config = SCENE_INPUT_CONFIG[idx] || SCENE_INPUT_CONFIG[0];
  if (inputPromptEl) inputPromptEl.textContent = config.prompt;
  inputEl.value = '';
  inputEl.disabled = false;
  if (submitBtn) submitBtn.disabled = false;
  inputEl.focus({ preventScroll: true });

  inputEl.oninput = () => {
    const raw = localAnalyze(inputEl.value.trim());
    demoState.liveVector = raw;
    if (raw) updateLiveWave(raw);
  };

  submitBtn.onclick = () => submitScene();
}

function updateLiveWave(liveVector) {
  if (!liveVector || !liveVector.base) return;
  const style = emotionVectorToWaveStyle(liveVector.base);
  const statusEl = document.getElementById('waveStatus');
  const entries = Object.entries(liveVector.base).filter(([, v]) => v > 0.2);
  const dominant = entries.sort((a, b) => b[1] - a[1])[0];
  if (statusEl && dominant) statusEl.textContent = dominant[0];
  visualizer.alignmentWaveTime = (visualizer.alignmentWaveTime || 0) + 0.016;
}

function submitScene() {
  const inputEl = document.getElementById('sceneTextInput');
  const resolveOverlay = document.getElementById('resolveOverlay');
  if (!inputEl) return;

  const userText = inputEl.value.trim();
  const scene = demoState.scenes[demoState.sceneIndex];
  if (!scene) return;

  setPhase(PHASES.INPUT_RESOLVE);
  if (resolveOverlay) resolveOverlay.classList.remove('hidden');

  const liveVector = demoState.liveVector || localAnalyze(userText);

  let resolved = false;
  function finishResolve(aiResult) {
    if (resolved) return;
    resolved = true;
    if (resolveOverlay) resolveOverlay.classList.add('hidden');
    demoState.resolvedVector = aiResult || (liveVector ? { ...liveVector, isRough: !aiResult } : null);
    if (!demoState.resolvedVector && liveVector) demoState.resolvedVector = { ...liveVector, isRough: true };
    demoState.flags.aiAnalysisFailed = !aiResult;
    processScene();
  }

  const timeout = setTimeout(() => finishResolve(null), 1000);
  aiAnalyze(userText, scene.text).then((aiResult) => {
    clearTimeout(timeout);
    finishResolve(aiResult);
  }).catch(() => {
    clearTimeout(timeout);
    finishResolve(null);
  });
}

function processScene() {
  const scene = demoState.scenes[demoState.sceneIndex];
  const resolved = demoState.resolvedVector;
  if (!scene || !resolved) {
    nextOrReveal();
    return;
  }

  const userVector = {
    base: resolved.base,
    reason_analysis: resolved.attribution ? { attribution: resolved.attribution } : {},
  };
  const originalVector = {
    base: scene.original_emotion || {},
    reason_analysis: {},
  };
  const prev = demoState.sceneHistory[demoState.sceneHistory.length - 1];
  const context = {
    previousBucket: prev ? prev.alignmentBucket : null,
    emotionHistory: demoState.sceneHistory.map((h) => h.resolvedVector?.base).filter(Boolean),
  };

  const engineResult = engine.calculateStep({ userVector, originalVector }, context);

  recordScene({
    sceneIndex: demoState.sceneIndex,
    sceneText: scene.text,
    userText: document.getElementById('sceneTextInput')?.value?.trim() || '',
    rawInputMode: (SCENE_INPUT_CONFIG[demoState.sceneIndex] || {}).mode || 'free',
    liveVector: demoState.liveVector,
    resolvedVector: resolved,
    originalVector: { base: scene.original_emotion },
    engineResult,
  });

  setPhase(PHASES.TRANSITION);
  const pattern = engineResult.transition_pattern || 'bridge';
  applyTransition(pattern);
}

function applyTransition(pattern) {
  const duration = 600;
  setTimeout(() => {
    demoState.sceneIndex += 1;
    updateTerrain();
    if (demoState.sceneIndex < demoState.scenes.length) {
      setPhase(PHASES.PLAYING);
      renderScene(demoState.scenes[demoState.sceneIndex]);
    } else {
      startReveal();
    }
  }, duration);
}

function updateTerrain() {
  const terrainCanvas = document.getElementById('terrainCanvas2D');
  const contaminations = demoState.sceneHistory.map((h) => ({
    sceneIndex: h.sceneIndex,
    terrainEffectType: h.terrainEffectType,
  }));
  draw2DTerrain(terrainCanvas, contaminations);
}

function nextOrReveal() {
  demoState.sceneIndex += 1;
  updateTerrain();
  if (demoState.sceneIndex < demoState.scenes.length) {
    setPhase(PHASES.PLAYING);
    renderScene(demoState.scenes[demoState.sceneIndex]);
  } else {
    startReveal();
  }
}

/* ═══════════════════════════════════════════════════════
   TERRAIN PROFILE RENDERER
   3D terrain 계통의 대표 고저선 + underlayer + trace + marker
   ═══════════════════════════════════════════════════════ */

function _hs(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function _sn(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return _hs(i, j) + (_hs(i + 1, j) - _hs(i, j)) * sx + (_hs(i, j + 1) - _hs(i, j)) * sy + (_hs(i, j) - _hs(i + 1, j) - _hs(i, j + 1) + _hs(i + 1, j + 1)) * sx * sy;
}
function _fm(x, y, o) {
  o = o || 4; let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { v += a * _sn(x * f, y * f); a *= 0.5; f *= 2.1; }
  return v;
}

const ANCHOR_COLORS = {
  anger: [140, 20, 20], fear: [60, 20, 80], shame: [100, 30, 60],
  sadness: [30, 50, 100], guilt: [80, 50, 30], isolation: [20, 20, 40],
  numbness: [60, 60, 65], longing: [80, 60, 100], joy: [180, 140, 60],
};

function buildProfileFromScenes(scenes, sampleCount) {
  const n = scenes.length;
  if (n === 0) {
    const pts = [];
    for (let i = 0; i < sampleCount; i++) pts.push({ h: 0.3, r: 0.10, g: 0.10, b: 0.13 });
    return pts;
  }

  const raw = [];
  for (let si = 0; si < n; si++) {
    const em = scenes[si].original_emotion || {};
    let totalW = 0, wH = 0;
    let cr = 0.10, cg = 0.10, cb = 0.13;
    for (const [name, val] of Object.entries(em)) {
      if (!val || val <= 0) continue;
      const anc = ANCHOR_COLORS[name];
      wH += val * 15 * val;
      if (anc) { cr += (anc[0] / 255) * val * 0.6; cg += (anc[1] / 255) * val * 0.6; cb += (anc[2] / 255) * val * 0.6; }
      totalW += val;
    }
    const h = totalW > 0 ? wH / totalW : 2;
    raw.push({ h: Math.max(0.5, Math.min(12, h)), r: Math.min(1, cr), g: Math.min(1, cg), b: Math.min(1, cb) });
  }

  const pts = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = (i / (sampleCount - 1)) * (n - 1);
    const lo = Math.floor(t), hi = Math.min(lo + 1, n - 1);
    const frac = t - lo;
    const a = raw[lo], b = raw[hi];
    const noise = (_fm(i * 0.15, 0.5, 4) - 0.35) * 1.5;
    pts.push({
      h: a.h * (1 - frac) + b.h * frac + noise,
      r: a.r * (1 - frac) + b.r * frac,
      g: a.g * (1 - frac) + b.g * frac,
      b: a.b * (1 - frac) + b.b * frac,
    });
  }
  return pts;
}

function draw2DTerrain(canvas, contaminations) {
  if (!canvas) return;
  const dpr = Math.min(devicePixelRatio, 2) || 2;
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (w <= 0 || h <= 0) return;
  const needW = Math.round(w * dpr), needH = Math.round(h * dpr);
  if (canvas.width !== needW || canvas.height !== needH) {
    canvas.width = needW;
    canvas.height = needH;
    const c = canvas.getContext('2d');
    if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a0a0e';
  ctx.fillRect(0, 0, w, h);

  const scenes = demoState.scenes || [];
  const n = Math.max(1, scenes.length);
  const sampleCount = Math.max(n * 8, 60);
  const profile = buildProfileFromScenes(scenes, sampleCount);

  const profileTop = h * 0.12;
  const profileBottom = h * 0.40;
  const profileRange = profileBottom - profileTop;

  let maxH = 0;
  profile.forEach(p => { if (p.h > maxH) maxH = p.h; });
  if (maxH < 1) maxH = 1;

  const profileY = [];
  for (let i = 0; i < sampleCount; i++) {
    profileY.push(profileBottom - (profile[i].h / maxH) * profileRange);
  }

  const UNDER_LAYERS = 4;
  const underStart = profileBottom;
  const underEnd = h * 0.92;
  const layerGap = (underEnd - underStart) / UNDER_LAYERS;

  for (let li = UNDER_LAYERS - 1; li >= 0; li--) {
    const layerTopBase = underStart + li * layerGap;
    const layerBotBase = underStart + (li + 1) * layerGap;
    const dampening = 1 - (li / UNDER_LAYERS) * 0.8;
    const darkness = 0.08 + (li / UNDER_LAYERS) * 0.06;

    ctx.beginPath();
    for (let i = 0; i < sampleCount; i++) {
      const x = (i / (sampleCount - 1)) * w;
      const baseOffset = (profileY[i] - profileBottom) * dampening * 0.2;
      const noise = (_fm(i * 0.12 + li * 2.7, li * 1.3, 3) - 0.35) * layerGap * 0.15 * dampening;
      const y = layerTopBase + baseOffset + noise;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    for (let i = sampleCount - 1; i >= 0; i--) {
      const x = (i / (sampleCount - 1)) * w;
      const baseOffset = (profileY[i] - profileBottom) * dampening * 0.1;
      const noise = (_fm(i * 0.09 + li * 3.1 + 5, li * 1.7 + 2, 3) - 0.35) * layerGap * 0.08 * dampening;
      const y = layerBotBase + baseOffset + noise;
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    const avgR = Math.round(profile[Math.floor(sampleCount / 2)].r * 255 * darkness);
    const avgG = Math.round(profile[Math.floor(sampleCount / 2)].g * 255 * darkness);
    const avgB = Math.round(profile[Math.floor(sampleCount / 2)].b * 255 * darkness);
    ctx.fillStyle = `rgba(${avgR},${avgG},${avgB},${0.35 - li * 0.06})`;
    ctx.fill();
  }

  const botGrad = ctx.createLinearGradient(0, underEnd - layerGap, 0, h);
  botGrad.addColorStop(0, 'rgba(10,10,14,0)');
  botGrad.addColorStop(0.6, 'rgba(10,10,14,0.85)');
  botGrad.addColorStop(1, 'rgba(10,10,14,1)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, underEnd - layerGap, w, h - underEnd + layerGap);

  /* ── fill under profile line (primary layer) ── */
  ctx.beginPath();
  ctx.moveTo(0, profileY[0]);
  for (let i = 1; i < sampleCount; i++) {
    const x = (i / (sampleCount - 1)) * w;
    const px = ((i - 1) / (sampleCount - 1)) * w;
    ctx.quadraticCurveTo(px, profileY[i - 1], (px + x) / 2, (profileY[i - 1] + profileY[i]) / 2);
  }
  ctx.lineTo(w, profileBottom + 4);
  ctx.lineTo(0, profileBottom + 4);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(0, profileTop, 0, profileBottom + 4);
  const midP = profile[Math.floor(sampleCount / 2)];
  const pR = Math.round(midP.r * 255 * 0.4 + 10);
  const pG = Math.round(midP.g * 255 * 0.4 + 10);
  const pB = Math.round(midP.b * 255 * 0.4 + 10);
  fillGrad.addColorStop(0, `rgba(${pR},${pG},${pB},0.35)`);
  fillGrad.addColorStop(1, `rgba(${pR},${pG},${pB},0.08)`);
  ctx.fillStyle = fillGrad;
  ctx.fill();

  /* ── effectType traces on completed scenes ── */
  const segW = w / n;
  contaminations.forEach((c) => {
    const si = c.sceneIndex;
    if (si < 0 || si >= n) return;
    const x0 = si * segW, x1 = (si + 1) * segW;
    const midX = (x0 + x1) / 2;
    const sampleMid = Math.round(((si + 0.5) / n) * (sampleCount - 1));
    const midY = profileY[Math.min(sampleMid, sampleCount - 1)];
    const effect = c.terrainEffectType || 'mark';

    ctx.save();
    switch (effect) {
      case 'erosion':
        ctx.strokeStyle = 'rgba(200,80,80,0.35)';
        ctx.lineWidth = 1.5;
        for (let j = 0; j < 3; j++) {
          ctx.beginPath();
          ctx.moveTo(x0 + 4, midY + 2 + j * 3);
          ctx.lineTo(x1 - 4, midY + 4 + j * 3);
          ctx.stroke();
        }
        break;
      case 'deposit':
        ctx.fillStyle = 'rgba(100,160,200,0.25)';
        ctx.beginPath();
        ctx.moveTo(x0, midY);
        ctx.quadraticCurveTo(midX, midY - 8, x1, midY);
        ctx.quadraticCurveTo(midX, midY + 2, x0, midY);
        ctx.closePath();
        ctx.fill();
        break;
      case 'spread': {
        const grad = ctx.createRadialGradient(midX, midY, 0, midX, midY, segW * 0.6);
        grad.addColorStop(0, 'rgba(160,120,200,0.3)');
        grad.addColorStop(1, 'rgba(160,120,200,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x0, midY - 15, segW, 30);
        break;
      }
      case 'fade':
        ctx.fillStyle = 'rgba(10,10,14,0.3)';
        ctx.fillRect(x0, profileTop, segW, profileBottom - profileTop);
        break;
      case 'smooth':
        ctx.strokeStyle = 'rgba(196,168,130,0.2)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x0, midY);
        ctx.lineTo(x1, midY);
        ctx.stroke();
        break;
      case 'layer':
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(150,140,120,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, midY - 2);
        ctx.lineTo(x1, midY - 2);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      default:
        ctx.fillStyle = 'rgba(196,168,130,0.4)';
        ctx.beginPath();
        ctx.arc(midX, midY, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  });

  /* ── main profile line ── */
  ctx.beginPath();
  ctx.moveTo(0, profileY[0]);
  for (let i = 1; i < sampleCount; i++) {
    const x = (i / (sampleCount - 1)) * w;
    const px = ((i - 1) / (sampleCount - 1)) * w;
    ctx.quadraticCurveTo(px, profileY[i - 1], (px + x) / 2, (profileY[i - 1] + profileY[i]) / 2);
  }
  ctx.strokeStyle = 'rgba(196,168,130,0.65)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  /* ── player marker ── */
  const markerSampleIdx = Math.round(((demoState.sceneIndex + 0.5) / n) * (sampleCount - 1));
  const markerX = (demoState.sceneIndex + 0.5) / n * w;
  const markerY = profileY[Math.min(markerSampleIdx, sampleCount - 1)] - 2;

  ctx.shadowColor = 'rgba(196,168,130,0.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(196,168,130,0.95)';
  ctx.beginPath();
  ctx.arc(markerX, markerY, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(196,168,130,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(markerX, markerY + 4.5);
  ctx.lineTo(markerX, h * 0.85);
  ctx.stroke();
}

function startReveal() {
  if (playWaveFrameId) {
    cancelAnimationFrame(playWaveFrameId);
    playWaveFrameId = null;
  }
  setPhase(PHASES.REVEAL);
  setPhaseActive('phaseReveal');

  const headerEl = document.getElementById('revealHeader');
  const scenesEl = document.getElementById('revealScenes');
  const nextBtn = document.getElementById('revealNextBtn');
  if (!scenesEl) return;
  if (headerEl) headerEl.textContent = 'Core Scenes — Original Waveform vs Your Waveform';

  scenesEl.innerHTML = '';
  const coreFirst = demoState.sceneHistory.filter((h) => h.isCoreMoment);
  const rest = demoState.sceneHistory.filter((h) => !h.isCoreMoment);
  const order = [...coreFirst, ...rest];

  order.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'reveal-scene-item';
    const origStyle = emotionVectorToWaveStyle(item.originalVector?.base || {});
    const userStyle = emotionVectorToWaveStyle(item.resolvedVector?.base || {});
    const noise = Math.pow(1 - item.alignmentScore, 1.5);
    userStyle.chaos = (userStyle.chaos || 0.1) + noise * 0.5;

    div.innerHTML = `
      <div>
        <div class="reveal-label">Original</div>
        <div class="reveal-wave-original"><canvas data-type="original" data-index="${idx}" width="200" height="60"></canvas></div>
        <div class="reveal-alignment">Alignment ${(item.alignmentScore * 100).toFixed(0)}% — ${item.alignmentBucket}</div>
      </div>
      <div>
        <div class="reveal-label">You</div>
        <div class="reveal-wave-user"><canvas data-type="user" data-index="${idx}" width="200" height="60"></canvas></div>
      </div>
      <div class="reveal-detail-panel" style="grid-column:1/-1">
        Emotion: ${dominantEmotion(item.resolvedVector?.base)}<br>
        Interpretation bias: ${item.distortionTag || '—'}<br>
        Attribution: ${item.resolvedVector?.attribution || '—'}<br>
        Contamination type: ${item.terrainEffectType}
      </div>
    `;
    scenesEl.appendChild(div);

    requestAnimationFrame(() => {
      const origCanvas = div.querySelector('canvas[data-type="original"]');
      const userCanvas = div.querySelector('canvas[data-type="user"]');
      if (origCanvas) {
        initCanvas2x(origCanvas);
        const ctx = origCanvas.getContext('2d');
        ctx.fillStyle = 'rgba(10,10,14,1)';
        ctx.fillRect(0, 0, origCanvas.offsetWidth, origCanvas.offsetHeight);
        visualizer.drawComparisonWave(origCanvas, item.originalVector?.base || {}, 50, origStyle);
      }
      if (userCanvas) {
        initCanvas2x(userCanvas);
        const ctx = userCanvas.getContext('2d');
        ctx.fillStyle = 'rgba(10,10,14,1)';
        ctx.fillRect(0, 0, userCanvas.offsetWidth, userCanvas.offsetHeight);
        visualizer.drawComparisonWave(userCanvas, item.resolvedVector?.base || {}, 0, userStyle);
      }
    });

    div.addEventListener('click', () => div.classList.toggle('expanded'));
  });

  if (nextBtn) nextBtn.onclick = () => startTerrain();
}

function dominantEmotion(base) {
  if (!base) return '—';
  const e = Object.entries(base).sort((a, b) => b[1] - a[1])[0];
  return e && e[1] > 0 ? e[0] : '—';
}

function startTerrain() {
  setPhase(PHASES.TERRAIN);
  setPhaseActive('phaseTerrain');

  const container = document.getElementById('strataViewContainer');
  const captionEl = document.getElementById('terrainCaption');
  if (captionEl) captionEl.textContent = 'The traces you left have accumulated in this terrain.';

  if (container) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.id = 'strataView';
    wrap.style.cssText = 'display:block;position:relative;width:100%;height:100%;background:#0a0a0f;';
    wrap.innerHTML = '<canvas id="strataCanvas" style="width:100%;height:100%;"></canvas>';
    container.appendChild(wrap);

    if (typeof window.showStrataView === 'function') {
      window.showStrataView(demoState.memoryId, null, () => {});
    }
  }

  const cta = document.getElementById('demoCta');
  if (cta) {
    cta.href = 'index.html';
    cta.addEventListener('click', (e) => {
      try { sessionStorage.setItem('skipOpening', '1'); } catch (_) {}
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

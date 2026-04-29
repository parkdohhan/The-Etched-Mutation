/**
 * Opening Sequence Module — wave animation, NPC dialogue, audio fade, and skip logic.
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   (none — this module is self-contained)
 */

import { NPC_DIALOGUES } from '../npc-dialogues.js';
import { setLanguage } from '../lib/i18n.js';
import { buildDoor } from './confession.js';
import { _pickTopMemoryForLumen } from './archive.js';

// === Module State ===
let openingSkipped = false;
let openingWaveAnimationId = null;
let openingMouseX = -100;
let openingMouseY = -100;
let hasZoomedIn = false;
let openingSequenceStarted = false;
let openingSound = null;
let fadeOutAnimationId = null;
let fadeOutInterval = null;
let crossfadeTimeUpdateHandler = null;
let crossfadeEndedHandler = null;

// Lumen 흡수 연출: animate loop이 참조하는 파동 속도·탈채도 상태.
let _openingWaveSpeedMul = 1;
let _openingWaveDesat = 0; // 0..1

// ─────────────────────────────────────
// === Text Utilities ===
// ─────────────────────────────────────

function typeText(element, text, callback) { let index = 0; element.textContent = ''; element.classList.add('typing'); function typeChar() { if (index < text.length) { element.textContent += text.charAt(index); index++; setTimeout(typeChar, 50) } else { element.classList.remove('typing'); if (callback) callback() } } typeChar() }
function typeTextAsync(element, text, speed = 80) { return new Promise(resolve => { element.classList.add('typing'); let i = 0; element.textContent = ''; const timer = setInterval(() => { if (i < text.length) { element.textContent += text.charAt(i); i++ } else { clearInterval(timer); element.classList.remove('typing'); resolve() } }, speed) }) }
function typeDots(element, callback) { element.textContent = '\n'; element.classList.add('typing'); let dotCount = 0; function addDot() { if (dotCount < 3) { element.textContent += '.'; dotCount++; setTimeout(addDot, 300) } else { element.classList.remove('typing'); if (callback) callback() } } addDot() }

// ─────────────────────────────────────
// === NPC Intro ===
// ─────────────────────────────────────

async function playNpcIntro() { const centerWrapper = document.querySelector('.intro-center-wrapper'); const dialogue = document.getElementById('npcIntroDialogue'); if (!centerWrapper || !dialogue) return; await new Promise(r => setTimeout(r, 2000)); centerWrapper.classList.add('lifted'); await new Promise(r => setTimeout(r, 1000)); dialogue.classList.add('visible'); await typeTextAsync(dialogue, NPC_DIALOGUES.intro.firstVisit, 100); await new Promise(r => setTimeout(r, 1500)); dialogue.textContent = ''; await typeTextAsync(dialogue, NPC_DIALOGUES.intro.returning, 80); await new Promise(r => setTimeout(r, 2000)); dialogue.classList.remove('visible'); await new Promise(r => setTimeout(r, 500)); centerWrapper.classList.remove('lifted') }

// ─────────────────────────────────────
// === Audio ===
// ─────────────────────────────────────

function fadeInSound(audio, targetVolume = 0.6, duration = 4000) { if (!audio) { console.error('fadeInSound: audio 요소가 not found'); return } audio.volume = 0; const playPromise = audio.play(); if (playPromise !== undefined) { playPromise.then(() => { console.log('opening 사운드 재생 시작'); const steps = 60; const step = targetVolume / steps; const interval = duration / steps; let currentStep = 0; const fade = setInterval(() => { currentStep++; if (currentStep < steps) { audio.volume = Math.min(1, Math.max(0, Math.min(step * currentStep, targetVolume))) } else { audio.volume = Math.min(1, Math.max(0, targetVolume)); clearInterval(fade) } }, interval) }).catch(e => { console.error('opening 사운드 재생 Failed:', e); console.error('오디오 Status:', { readyState: audio.readyState, networkState: audio.networkState, error: audio.error }) }) } }

function fadeOutSound(audio, duration = 3000) { if (!audio) return; if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } if (crossfadeTimeUpdateHandler && audio) { audio.removeEventListener('timeupdate', crossfadeTimeUpdateHandler); crossfadeTimeUpdateHandler = null } if (crossfadeEndedHandler && audio) { audio.removeEventListener('ended', crossfadeEndedHandler); crossfadeEndedHandler = null } const startVolume = Math.max(audio.volume || 0, 0.01); if (startVolume <= 0) { audio.pause(); audio.currentTime = 0; return } if (audio.paused) { audio.play().catch(() => { }) } const startTime = performance.now(); let lastVolume = startVolume; let pauseCheckInterval = setInterval(() => { if (audio && audio.paused && lastVolume > 0.01) { audio.play().catch(() => { }) } }, 50); function animateFadeOut(currentTime) { if (!audio) { if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } if (pauseCheckInterval) { clearInterval(pauseCheckInterval); pauseCheckInterval = null } return } if (audio.paused && lastVolume > 0.01) { audio.play().catch(() => { }) } const elapsed = currentTime - startTime; const progress = Math.min(elapsed / duration, 1); const newVolume = Math.max(startVolume * (1 - progress), 0); lastVolume = newVolume; try { if (audio) { audio.volume = Math.min(1, Math.max(0.001, Math.max(newVolume, 0.001))) } } catch (e) { console.error('Volume update error:', e) } if (progress >= 1 || newVolume <= 0.01) { if (pauseCheckInterval) { clearInterval(pauseCheckInterval); pauseCheckInterval = null } setTimeout(() => { try { if (audio) { audio.volume = 0; audio.pause(); audio.currentTime = 0 } } catch (e) { console.error('Audio pause error:', e) } if (fadeOutAnimationId) { cancelAnimationFrame(fadeOutAnimationId); fadeOutAnimationId = null } }, 200) } else { fadeOutAnimationId = requestAnimationFrame(animateFadeOut) } } fadeOutAnimationId = requestAnimationFrame(animateFadeOut) }

function setupLoopWithCrossfade(audio, targetVolume = 0.6, fadeDuration = 2) { if (!audio) return; if (crossfadeTimeUpdateHandler) { audio.removeEventListener('timeupdate', crossfadeTimeUpdateHandler) } if (crossfadeEndedHandler) { audio.removeEventListener('ended', crossfadeEndedHandler) } crossfadeTimeUpdateHandler = function () { if (fadeOutInterval) return; const timeLeft = audio.duration - audio.currentTime; if (timeLeft <= fadeDuration && timeLeft > 0) { audio.volume = Math.min(1, Math.max(0, targetVolume * (timeLeft / fadeDuration))) } }; crossfadeEndedHandler = function () { if (fadeOutInterval) return; audio.currentTime = 0; fadeInSound(audio, targetVolume, fadeDuration * 1000) }; audio.addEventListener('timeupdate', crossfadeTimeUpdateHandler); audio.addEventListener('ended', crossfadeEndedHandler) }

// ─────────────────────────────────────
// === Dialogue Sequence ===
// ─────────────────────────────────────

// v2: 기존 오프닝 대사(Hello / You're here / ... / Come in)는 유지. 끝에 "Press any key" 대신 언어 게이트 + Start.
// Start 클릭 후 v2 3단 대사 → 입력 → 최종 대사 → 180° 회전 → 문.
function showContinueButton() {
    if (openingSkipped) return;
    // v2: 기존 "Press any key" 힌트 대체 → 언어 게이트 + Start 버튼
    _initOpeningLangGate();
}
function showFourthText(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nCome in.', function () { if (openingSkipped) return; setTimeout(showContinueButton, 500) }) }
function showThirdText(dialogue) { if (openingSkipped) return; typeDots(dialogue, function () { if (openingSkipped) return; setTimeout(function () { showFourthText(dialogue) }, 1200) }) }
function showSecondText(dialogue) { if (openingSkipped) return; typeText(dialogue, '\n...you came looking for a memory?', function () { if (openingSkipped) return; setTimeout(function () { showThirdText(dialogue) }, 1200) }) }
function showFirstTextPart1(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nHello.', function () { if (openingSkipped) return; setTimeout(function () { showFirstTextPart2(dialogue) }, 1500) }) }
function showFirstTextPart2(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nYou\'re here. It\'s been a while.', function () { if (openingSkipped) return; setTimeout(function () { showSecondText(dialogue) }, 1200) }) }
const V2_DIALOGUES = {
  ko: {
    intro: ['어떤 기억을 찾고있어?'],
    transition: '...저기로 가봐.',
    placeholder: '단어 하나, 감정 하나...',
    chips: [
      { label: '슬픔', emotion: 'sadness' },
      { label: '그리움', emotion: 'longing' },
      { label: '분노', emotion: 'anger' },
      { label: '두려움', emotion: 'fear' },
      { label: '죄책감', emotion: 'guilt' },
      { label: '기쁨', emotion: 'joy' },
    ],
  },
  en: {
    intro: ['what are you looking for?'],
    transition: '...you can go there.',
    placeholder: 'A word, a feeling...',
    chips: [
      { label: 'sadness', emotion: 'sadness' },
      { label: 'longing', emotion: 'longing' },
      { label: 'anger', emotion: 'anger' },
      { label: 'fear', emotion: 'fear' },
      { label: 'guilt', emotion: 'guilt' },
      { label: 'joy', emotion: 'joy' },
    ],
  },
};

let _openingLang = 'en';

function _typeLinesSequential(element, lines, charDelay = 55, lineDelay = 900) {
  return new Promise(async (resolve) => {
    element.classList.add('visible');
    element.innerHTML = '';
    for (let i = 0; i < lines.length; i++) {
      const p = document.createElement('p');
      p.style.cssText = 'margin:0 0 0.55em 0;font-family:inherit;opacity:0;transition:opacity 0.5s ease;';
      element.appendChild(p);
      await new Promise(r => requestAnimationFrame(r));
      p.style.opacity = '1';
      const text = lines[i];
      for (let ci = 1; ci <= text.length; ci++) {
        p.textContent = text.slice(0, ci);
        await new Promise(r => setTimeout(r, charDelay));
      }
      if (i < lines.length - 1) await new Promise(r => setTimeout(r, lineDelay));
    }
    resolve();
  });
}

function _fadeOutDialogue(element, duration = 800) {
  return new Promise((resolve) => {
    element.style.transition = `opacity ${duration}ms ease`;
    element.style.opacity = '0';
    setTimeout(() => {
      element.innerHTML = '';
      element.style.opacity = '';
      resolve();
    }, duration);
  });
}

async function _runV2Sequence() {
  const dialogue = document.getElementById('openingDialogue');
  const inputPhase = document.getElementById('openingInputPhase');
  const langGate = document.getElementById('openingLangGate');
  if (!dialogue || !inputPhase) return;

  const D = V2_DIALOGUES[_openingLang] || V2_DIALOGUES.en;

  // 언어 게이트 페이드아웃
  if (langGate) {
    langGate.style.opacity = '0';
    langGate.style.pointerEvents = 'none';
  }
  await new Promise(r => setTimeout(r, 900));

  // 기존 "...Come in." 대사 부드럽게 페이드아웃 (갑자기 지워지지 않도록)
  await _fadeOutDialogue(dialogue, 1100);
  await new Promise(r => setTimeout(r, 900)); // 정적 여백

  // v2 인트로 3단 대사 타이핑
  await _typeLinesSequential(dialogue, D.intro);
  await new Promise(r => setTimeout(r, 1200));

  // 인트로 질문은 입력 단계와 함께 화면에 유지 (페이드아웃하지 않음)

  // 입력 + 칩 페이드인
  const input = document.getElementById('openingFinderInput');
  const chipsEl = document.getElementById('openingFinderChips');
  const submitBtn = document.getElementById('openingFinderSubmitBtn');
  if (input) input.placeholder = D.placeholder;

  // 칩 populate
  if (chipsEl) {
    chipsEl.innerHTML = '';
    D.chips.forEach(chip => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = chip.label;
      btn.dataset.emotion = chip.emotion;
      btn.style.cssText = 'background:none;border:1px solid rgba(196,168,130,0.25);color:rgba(196,168,130,0.6);font-family:"Cormorant Garamond",serif;font-size:13px;letter-spacing:1px;padding:6px 16px;cursor:pointer;transition:all 0.3s;border-radius:2px;';
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'rgba(196,168,130,0.6)'; btn.style.color = 'rgba(196,168,130,0.9)'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'rgba(196,168,130,0.25)'; btn.style.color = 'rgba(196,168,130,0.6)'; });
      btn.addEventListener('click', () => _handleOpeningSubmit(chip.emotion, null));
      chipsEl.appendChild(btn);
    });
  }

  inputPhase.style.pointerEvents = 'auto';
  inputPhase.style.opacity = '1';
  setTimeout(() => { if (input) input.focus(); }, 400);

  // 엔터/버튼 제출
  if (input) {
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        _handleOpeningSubmit(null, input.value.trim());
      }
    };
  }
  if (submitBtn) {
    submitBtn.onclick = () => {
      if (input && input.value.trim()) _handleOpeningSubmit(null, input.value.trim());
    };
  }
}

// Lumen 오프닝: 파동 freeze + 탈채도. animate 루프가 참조하는 모듈 변수만 ease-out 갱신.
function _collapseOpeningWave(durationMs = 1800) {
  return new Promise((resolve) => {
    const start = performance.now();
    function tick() {
      const el = performance.now() - start;
      const p = Math.min(1, el / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      _openingWaveSpeedMul = 1 - eased;
      _openingWaveDesat = eased;
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
}

// Lumen 오프닝: confession.js의 ASCII 문(buildDoor) 재사용.
// phase 1(열림 1200ms) → 300ms 정적 → phase 2(빨려들어감 1600ms) → 블랙아웃.
function _runLumenDoorSequence() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'lumenDoorOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:3000;background:#050505;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.7s ease;pointer-events:none;';
    const pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;font-family:"SFMono-Regular",Menlo,"Courier New",monospace;font-size:14px;line-height:1;color:rgba(196,168,130,0.9);white-space:pre;user-select:none;text-shadow:0 0 10px rgba(196,168,130,0.18);';
    const g0 = buildDoor(0, 0);
    pre.textContent = g0.map(r => r.join('')).join('\n');
    overlay.appendChild(pre);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    const OPEN_MS = 1200;
    const SUCK_MS = 1600;
    const STATIC_MS = 300;
    const FADE_IN_MS = 700;

    setTimeout(() => {
      const openStart = performance.now();
      function openTick() {
        const el = performance.now() - openStart;
        const pr = Math.min(el / OPEN_MS, 1);
        const g = buildDoor(1, pr);
        pre.textContent = g.map(r => r.join('')).join('\n');
        if (pr < 1) { requestAnimationFrame(openTick); return; }

        setTimeout(() => {
          const suckStart = performance.now();
          function suckTick() {
            const el2 = performance.now() - suckStart;
            const pr2 = Math.min(el2 / SUCK_MS, 1);
            const g2 = buildDoor(2, pr2);
            pre.textContent = g2.map(r => r.join('')).join('\n');
            if (pr2 < 1) { requestAnimationFrame(suckTick); return; }
            pre.textContent = '';
            setTimeout(resolve, 350);
          }
          requestAnimationFrame(suckTick);
        }, STATIC_MS);
      }
      requestAnimationFrame(openTick);
    }, FADE_IN_MS);
  });
}

async function _handleOpeningSubmit(emotion, text) {
  const inputPhase = document.getElementById('openingInputPhase');
  const dialogue = document.getElementById('openingDialogue');
  const D = V2_DIALOGUES[_openingLang] || V2_DIALOGUES.en;

  // 1) 입력 페이드아웃
  if (inputPhase) {
    inputPhase.style.pointerEvents = 'none';
    inputPhase.style.opacity = '0';
  }
  await new Promise(r => setTimeout(r, 800));

  // 2) 전환 대사 타이핑
  await _typeLinesSequential(dialogue, [D.transition]);
  await new Promise(r => setTimeout(r, 1000));
  await _fadeOutDialogue(dialogue, 900);

  // 3) lang · 선행 입력 저장
  try {
    sessionStorage.setItem('tem_lang', _openingLang);
    sessionStorage.setItem('tem_opening_prefilled', emotion ? `chip:${emotion}` : `text:${text || ''}`);
  } catch (_) {}
  try { setLanguage(_openingLang); } catch (_) {}

  // 4) 메모리 로드 트리거 + 대기 (최대 8초 폴링)
  if (typeof window.loadMemoriesFromSupabase === 'function') {
    try { window.loadMemoriesFromSupabase(); } catch (_) {}
  }
  const waitStart = Date.now();
  const MAX_WAIT = 8000;
  while (Date.now() - waitStart < MAX_WAIT) {
    const all = (window.appStore && window.appStore.getState && window.appStore.getState().allMemoriesData) || [];
    if (all.length > 0) break;
    await new Promise(r => setTimeout(r, 150));
  }

  // 5) 파동 흡수 (freeze + 탈채도)
  await _collapseOpeningWave(1800);

  // 6) top-1 기억 선정
  const memory = _pickTopMemoryForLumen(emotion, text, _openingLang);
  if (!memory) {
    console.warn('[opening:lumen] 매칭 가능한 기억이 없음 — 메인 메뉴로 폴백');
    openingSkipped = true;
    if (openingWaveAnimationId) { cancelAnimationFrame(openingWaveAnimationId); openingWaveAnimationId = null; }
    finishOpeningSequence();
    return;
  }

  // 7) ASCII 문 열림 + 빨려들어감
  await _runLumenDoorSequence();

  // 8) wave anim 정지 (overlay가 이미 전면 블랙이므로 시각 전환은 매끄러움)
  openingSkipped = true;
  if (openingWaveAnimationId) { cancelAnimationFrame(openingWaveAnimationId); openingWaveAnimationId = null; }

  // 9) play-test로 직접 이동 → initFpPlay → rt.enterFirstPerson()
  const isLocal = location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ||
    location.hostname.endsWith('.local');
  const base = isLocal ? 'play-test.html' : '/play';
  try {
    sessionStorage.setItem('demoMemoryId', String(memory.id || ''));
    sessionStorage.setItem('tem_archive_memory_id', String(memory.id || ''));
    sessionStorage.setItem('tem_archive_lang', _openingLang);
  } catch (_) {}
  window.location.href = `${base}?memory=${encodeURIComponent(memory.id)}&lang=${encodeURIComponent(_openingLang)}`;
}

function _initOpeningLangGate() {
  const gate = document.getElementById('openingLangGate');
  if (!gate) return;
  const btns = gate.querySelectorAll('.opening-lang-btn');
  const startBtn = document.getElementById('openingStartBtn');

  // 기본: localStorage > 'en'
  let initialLang = 'en';
  try {
    const stored = localStorage.getItem('tem_language');
    if (stored === 'ko' || stored === 'en') initialLang = stored;
  } catch (_) {}

  function _markSelected(lang) {
    btns.forEach(b => {
      const on = b.dataset.lang === lang;
      b.classList.toggle('selected', on);
      b.style.background = on ? 'rgba(196,168,130,0.18)' : 'none';
      b.style.color = on ? 'rgba(240,216,170,1)' : 'rgba(196,168,130,0.75)';
      b.style.borderColor = on ? 'rgba(240,216,170,0.9)' : 'rgba(196,168,130,0.35)';
    });
  }
  _markSelected(initialLang);

  btns.forEach(btn => {
    btn.addEventListener('click', () => _markSelected(btn.dataset.lang));
  });

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      // Start 시점에 DOM의 selected 클래스에서 언어 직접 읽기 (closure 변수 불신)
      const selected = gate.querySelector('.opening-lang-btn.selected');
      const lang = selected ? selected.dataset.lang : 'en';
      _openingLang = lang;
      // i18n 캐시 + localStorage 동시 갱신 (getCurrentLanguage stale 방지)
      try { setLanguage(lang); } catch (_) { try { localStorage.setItem('tem_language', lang); } catch (__) {} }
      console.log('[opening] Start clicked. lang =', lang);
      _runV2Sequence();
    });
  }

  setTimeout(() => {
    gate.style.opacity = '1';
    gate.style.pointerEvents = 'auto';
  }, 400);
}

// ─────────────────────────────────────
// === Wave Animation ===
// ─────────────────────────────────────

function startOpeningWaveAnimation(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    // 인식 영역: window 전체. 캔버스 좁은 영역으로 마우스 진입할 때 좌표가 -100→실값으로 점프 안 하도록.
    // 작용 영역(아래 hoverPush)에서 거리 falloff로 자연스럽게 약해짐.
    window.addEventListener('mousemove', function (e) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        openingMouseX = (e.clientX - rect.left) * (canvas.width / 2 / rect.width);
        openingMouseY = (e.clientY - rect.top) * (canvas.height / 2 / rect.height);
    });

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

    let time = 0;

    function animate() {
        ctx.fillStyle = 'rgba(10, 10, 12, 0.92)';
        ctx.fillRect(0, 0, width, height);

        // Lumen 흡수 연출: 탈채도 filter를 파동 stroke에만 적용
        if (_openingWaveDesat > 0) {
            const satPct = Math.max(0, Math.round((1 - _openingWaveDesat) * 100));
            ctx.filter = `saturate(${satPct}%)`;
        }

        const centerY = height / 2;

        waves.forEach((wave) => {
            ctx.beginPath();
            ctx.lineWidth = 1.2;

            for (let x = 0; x < width; x++) {
                const baseY = centerY
                    + Math.sin(x * wave.freq + time * wave.speed + wave.phase) * wave.amplitude
                    + Math.sin(x * wave.freq * 0.5 + time * wave.speed * 0.6 + wave.phase * 1.4) * (wave.amplitude * 0.4)
                    + Math.sin(x * wave.freq * 2.3 + time * wave.speed * 1.3) * (wave.amplitude * 0.15)
                    + Math.sin(x * wave.freq * 0.3 + time * wave.speed * 0.4 + wave.phase * 2.1) * (wave.amplitude * 0.25)
                    + Math.sin(x * wave.freq * 3.7 + time * wave.speed * 1.8 + wave.phase * 0.7) * (wave.amplitude * 0.1);

                const noise = Math.sin(x * 0.003 + time * 0.02) * Math.cos(x * 0.007 + time * 0.015) * wave.noiseScale;
                const irregularOffset = wave.amplitude * noise * 0.4;

                let hoverPush = 0;
                if (openingMouseX >= 0 && openingMouseY >= 0) {
                    // (1) 진폭 부스트: 마우스 x 좌표 근방의 좁은 가로 띠(distX 350px)에만 적용.
                    // dist(원형) 대신 distX(가로) → 마우스 위/아래 영역은 영향 안 받음.
                    const distX = Math.abs(x - openingMouseX);
                    const ampReach = 350;
                    if (distX < ampReach) {
                        const u = distX / ampReach;
                        const sm = 1 - u * u * (3 - 2 * u);
                        hoverPush += (baseY - centerY) * sm * 0.18;
                    }

                    // (2) ripple: 좁은 반경(300px), 마우스 = 점원, sin(kr - ωt) 동심원 파.
                    const dx = x - openingMouseX;
                    const dy = baseY - openingMouseY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const influence = Math.max(0, 1 - dist / 300);
                    if (influence > 0) {
                        const rippleAmp = (wave.amplitude / 80) * 60;
                        hoverPush += Math.sin(dist * 0.02 - time * 0.064) * influence * rippleAmp;
                    }
                }

                const y = baseY + irregularOffset + hoverPush;
                const clampedY = Math.max(2, Math.min(height - 2, y));

                x === 0 ? ctx.moveTo(x, clampedY) : ctx.lineTo(x, clampedY);
            }

            ctx.strokeStyle = wave.color + wave.baseOpacity + ')';
            ctx.stroke();
        });

        if (_openingWaveDesat > 0) ctx.filter = 'none';

        time += 0.5 * _openingWaveSpeedMul;
        if (!openingSkipped) {
            openingWaveAnimationId = requestAnimationFrame(animate);
        }
    }

    animate();
}

// ─────────────────────────────────────
// === Sequence Orchestration ===
// ─────────────────────────────────────

function startOpeningSequence() {
    if (openingSkipped || window.__oauthRedirectSkipOpening) return;
    const waveContainer = document.getElementById('openingWaveContainer');
    if (waveContainer) {
        waveContainer.style.transform = 'scale(5, 1)';
        waveContainer.style.opacity = '1';
        waveContainer.classList.add('visible');
    }
    const canvas = document.getElementById('openingWaveCanvas');
    if (canvas) startOpeningWaveAnimation(canvas);

    // 최초 진입: 원래 오프닝 체인 재개 — Hello → ... → Come in → 언어 게이트
    // (온보딩 완료된 유저는 bindEvents.js에서 이미 메인 메뉴로 라우팅됨)
    setTimeout(function () {
        if (openingSkipped) return;
        const dialogue = document.getElementById('openingDialogue');
        if (dialogue) showFirstTextPart1(dialogue);
    }, 2500);
}

function skipOpening() { if (openingSkipped) return; openingSkipped = true; if (openingWaveAnimationId) { cancelAnimationFrame(openingWaveAnimationId); openingWaveAnimationId = null } const sound = openingSound || document.getElementById('openingSound'); if (sound) { if (crossfadeTimeUpdateHandler && sound) { sound.removeEventListener('timeupdate', crossfadeTimeUpdateHandler); crossfadeTimeUpdateHandler = null } if (crossfadeEndedHandler && sound) { sound.removeEventListener('ended', crossfadeEndedHandler); crossfadeEndedHandler = null } fadeOutSound(sound, 500); setTimeout(() => { finishOpeningSequence() }, 600) } else { finishOpeningSequence() } }

function skipToIntro() { openingSequenceStarted = true; skipOpening() }

function handleOpeningKeydown(e) { if (!openingSkipped) { const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : ''; if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return; e.preventDefault(); skipOpening() } }

function finishOpeningSequence() { const openingScreen = document.getElementById('openingScreen'); const introScreen = document.getElementById('introScreen'); if (openingScreen) { openingScreen.removeEventListener('click', skipOpening); openingScreen.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important'; openingScreen.classList.add('hidden') } document.removeEventListener('keydown', handleOpeningKeydown); if (introScreen) { introScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2000 !important'; introScreen.classList.add('visible'); introScreen.classList.remove('hidden') } playNpcIntro() }

// ─────────────────────────────────────
// === Exports ===
// ─────────────────────────────────────

export {
    // Audio
    fadeInSound,
    fadeOutSound,
    setupLoopWithCrossfade,

    // Sequence control
    startOpeningSequence,
    startOpeningWaveAnimation,
    skipToIntro,
    handleOpeningKeydown,

    // NPC
    playNpcIntro,
};

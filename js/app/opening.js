/**
 * Opening Sequence Module — wave animation, NPC dialogue, audio fade, and skip logic.
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   (none — this module is self-contained)
 */

import { NPC_DIALOGUES } from '../npc-dialogues.js';

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

  // 대사 사라지기
  await _fadeOutDialogue(dialogue, 900);

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

async function _handleOpeningSubmit(emotion, text) {
  const inputPhase = document.getElementById('openingInputPhase');
  const dialogue = document.getElementById('openingDialogue');
  const D = V2_DIALOGUES[_openingLang] || V2_DIALOGUES.en;

  // 입력 페이드아웃
  if (inputPhase) {
    inputPhase.style.pointerEvents = 'none';
    inputPhase.style.opacity = '0';
  }
  await new Promise(r => setTimeout(r, 800));

  // 최종 한 줄 타이핑
  await _typeLinesSequential(dialogue, [D.transition]);
  await new Promise(r => setTimeout(r, 1400));
  await _fadeOutDialogue(dialogue, 900);

  // 180° 회전 후 문으로 전환 → archive.js 핑거 결과 재활용
  try {
    sessionStorage.setItem('tem_lang', _openingLang);
    localStorage.setItem('tem_language', _openingLang);
    sessionStorage.setItem('tem_opening_prefilled', emotion ? `chip:${emotion}` : `text:${text || ''}`);
  } catch (_) {}

  // openingScreen 180° rotateY + 페이드아웃. intro screen(메뉴)은 건너뜀.
  const openingScreen = document.getElementById('openingScreen');
  if (openingScreen) {
    openingScreen.style.transition = 'transform 1.4s ease-in-out, opacity 1.4s ease-in-out';
    openingScreen.style.transformOrigin = '50% 50%';
    openingScreen.style.transform = 'rotateY(180deg)';
    openingScreen.style.opacity = '0';
  }

  // 수동 정리: wave anim만 정지. BGM은 crossfade 루프 그대로 유지 (기억선택 단계까지 이어짐).
  openingSkipped = true;
  if (openingWaveAnimationId) { cancelAnimationFrame(openingWaveAnimationId); openingWaveAnimationId = null; }

  setTimeout(async () => {
    if (openingScreen) {
      openingScreen.style.cssText = 'display:none!important;visibility:hidden!important;pointer-events:none!important;z-index:-1!important;opacity:0!important';
    }
    // archive + finder 컨테이너 노출 + 메모리 로드
    if (typeof window.enterPlayIntro === 'function') {
      await window.enterPlayIntro();
    }
    // v2: finder 자체 대사 phase(실 + 화살표) 노출 플래시 방지 — 즉시 숨기고 result phase 띄움
    const qPhase = document.getElementById('finderQuestionPhase');
    if (qPhase) qPhase.style.display = 'none';
    const rPhase = document.getElementById('finderResultPhase');
    if (rPhase) { rPhase.style.display = 'block'; rPhase.style.opacity = '1'; }
    // finder가 마운트한 실 캔버스 RAF 정리
    const threadCv = document.getElementById('finderThreadCanvas');
    if (threadCv && typeof threadCv._cleanup === 'function') threadCv._cleanup();

    // 메모리 로드 정착 대기
    await new Promise(r => setTimeout(r, 1500));

    // 매칭 트리거 → 문 렌더
    if (emotion && typeof window._finderMatch === 'function') {
      window._finderMatch(emotion, _openingLang);
    } else if (text && typeof window._finderMatchByText === 'function') {
      window._finderMatchByText(text, _openingLang);
    }
  }, 1400);
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
      try { localStorage.setItem('tem_language', lang); } catch (_) {}
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

    canvas.addEventListener('mousemove', function (e) {
        const rect = canvas.getBoundingClientRect();
        openingMouseX = (e.clientX - rect.left) * (canvas.width / 2 / rect.width);
        openingMouseY = (e.clientY - rect.top) * (canvas.height / 2 / rect.height);
    });
    canvas.addEventListener('mouseleave', function () {
        openingMouseX = -100;
        openingMouseY = -100;
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
                    const distX = Math.abs(x - openingMouseX);
                    const distY = Math.abs(baseY - openingMouseY);
                    const dist = Math.sqrt(distX * distX + distY * distY);

                    const influenceRadius = 200;
                    const normalizedDist = Math.min(dist / influenceRadius, 1);
                    const influence = Math.pow(1 - normalizedDist, 3);

                    if (influence > 0) {
                        const pushDirection = openingMouseY - baseY;
                        const xNormalized = Math.min(distX / influenceRadius, 1);
                        const xInfluence = Math.pow(1 - xNormalized, 2);

                        hoverPush = pushDirection * influence * xInfluence * 1.35;

                        const amplitudeBoost = influence * 0.8;
                        hoverPush += (baseY - centerY) * amplitudeBoost;

                        const rippleEffect = Math.sin(distX * 0.05) * influence * 15;
                        hoverPush += rippleEffect;
                    }
                }

                const y = baseY + irregularOffset + hoverPush;
                const clampedY = Math.max(2, Math.min(height - 2, y));

                x === 0 ? ctx.moveTo(x, clampedY) : ctx.lineTo(x, clampedY);
            }

            ctx.strokeStyle = wave.color + wave.baseOpacity + ')';
            ctx.stroke();
        });

        time += 0.5;
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

/**
 * Opening Sequence Module — wave animation, NPC dialogue, audio fade, and skip logic.
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   (none — this module is self-contained)
 */

import { NPC_DIALOGUES } from '../npc-dialogues.js';
import { setLanguage } from '../lib/i18n.js';
import { setUserName, getUserName } from './userIdentity.js';
import { isTesterMode, TESTER_MEMORY_CODE, TESTER_MEMORY_ID } from './testerMode.js';
import { buildDoor } from './confession.js';
import { _pickTopMemoryForLumen } from './archive.js';
import { pickTopMemory, pickGhostVariant } from '../core/SeekerMatchEngine.js';
import { decideBranch, buildSpeciationRow } from '../core/GhostBranchTrigger.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import {
  EMOTION_KEYS,
  QUESTION_BANK,
  CHIP_EMOTION_SEED,
  TOTAL_TURNS,
  initFingerprint as _initFingerprint,
  mergeTurn as _mergeTurn,
  extractMotifWords as _extractMotifWords,
  pickNextQuestion as _pickNextQuestion,
} from '../core/SeekerFingerprint.js';

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

// "어떤 기억을 찾고있어?" finder 화면 세션 카운터.
// 메뉴 복귀(← 버튼) 시 +1 → 진행 중이던 _handleOpeningSubmit 흐름이
// 자기 세션과 어긋남을 보고 파동 흡수·도어·play-test 점프를 중단.
let _finderSessionSeq = 0;

// ─────────────────────────────────────
// === 테스터 모드 (2026-08-02) ===
// ─────────────────────────────────────
// 데모 테스터에게 finder 인터뷰(닉네임 + 질문 3턴)는 의미 없는 문턱이다.
// 대답으로 기억을 고를 근거가 없으므로 대표 기억 하나로 고정하고,
// 대사 한 줄 → "저기로 가봐" → 문 으로 직행한다.
//
// **풀버전 흐름은 한 줄도 지우지 않았다.** 아래 두 함수의 `if (isTesterMode())`
// 분기 바깥(else 쪽)이 원본 그대로다. 되돌리기 = 스위치 끄기(?tester=0).
// 테스터 모드 자체를 걷어내는 방법은 docs/오프닝_테스터모드-260802.md 참조.
//
// 스위치 본체는 ./testerMode.js (bindEvents.js 도 같은 스위치를 본다).

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
    // 2026-05-08: 자료 critic 개입 3-a — 작품 컨셉(이본론 = 다음 사람의
    // 메아리로 흘러간다) 신호를 *진입 자리*에 박음. plays.user_reason 자리
    // random pick → 작은 골드 이탤릭 한 줄 페이드인 (게이트 위, 비동기).
    _maybeShowOpeningEcho();
}

// 메아리로 띄울 가치가 있는 '의미 있는' 입력인지 휴리스틱 검사.
// 자판 난타(ㅇㄴㄴㄹㄴㅇ)·같은 글자 도배(ㅋㅋㅋㅋ)·기호 범벅을 걸러
// 시적인 오프닝 화면에 쓰레기 문구가 뜨지 않도록 한다.
function _isMeaningfulEcho(s) {
  if (!s) return false;
  // 완성형 한글 음절(가-힣) + 영문 = 실제 '말'에 해당하는 글자
  const real = (s.match(/[가-힣a-zA-Z]/g) || []).length;
  if (real < 3) return false;                 // 의미 글자가 거의 없음 = 기호/숫자 범벅
  // 단독 한글 자모(ㄱ-ㅣ) = 조합 안 된 자판 난타 신호
  const jamo = (s.match(/[㄰-㆏]/g) || []).length;
  if (jamo >= real) return false;             // 난타 자모가 실제 글자만큼 많으면 탈락
  // 같은 글자 4회 이상 연속 도배(ㅋㅋㅋㅋ, ㅏㅏㅏㅏ, aaaa)
  if (/(.)\1{3,}/.test(s)) return false;
  return true;
}

async function _fetchRandomEcho() {
  try {
    const sb = getSupabaseClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from('plays')
      .select('user_reason')
      .not('user_reason', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const candidates = data
      .map(r => (r && r.user_reason ? String(r.user_reason).trim() : ''))
      .filter(s => s.length >= 5 && s.length <= 90 && _isMeaningfulEcho(s));
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  } catch (_) { return null; }
}

async function _maybeShowOpeningEcho() {
  if (openingSkipped) return;
  const echo = await _fetchRandomEcho();
  if (!echo || openingSkipped) return;
  const wave = document.getElementById('openingScreen');
  if (!wave) return;
  const echoEl = document.createElement('div');
  echoEl.style.cssText = [
    'position:absolute',
    'left:50%',
    'top:18%',
    'transform:translateX(-50%)',
    'pointer-events:none',
    'z-index:6',
    'max-width:520px',
    'padding:0 1rem',
    'text-align:center',
    'font-family:"Cormorant Garamond",serif',
    'font-style:italic',
    'font-size:14px',
    'color:rgba(220,196,160,0.6)',
    'letter-spacing:0.04em',
    'line-height:1.7',
    'opacity:0',
    'transition:opacity 1.8s ease',
  ].join(';');
  echoEl.textContent = '— ' + echo;
  wave.appendChild(echoEl);
  requestAnimationFrame(() => { echoEl.style.opacity = '1'; });
  setTimeout(() => { echoEl.style.opacity = '0'; }, 5500);
  setTimeout(() => {
    if (echoEl.parentNode) echoEl.parentNode.removeChild(echoEl);
  }, 7500);
}
function showFourthText(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nCome in.', function () { if (openingSkipped) return; setTimeout(showContinueButton, 500) }) }
function showThirdText(dialogue) { if (openingSkipped) return; typeDots(dialogue, function () { if (openingSkipped) return; setTimeout(function () { showFourthText(dialogue) }, 1200) }) }
function showSecondText(dialogue) { if (openingSkipped) return; typeText(dialogue, '\n...you came looking for a memory?', function () { if (openingSkipped) return; setTimeout(function () { showThirdText(dialogue) }, 1200) }) }
function showFirstTextPart1(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nHello.', function () { if (openingSkipped) return; setTimeout(function () { showFirstTextPart2(dialogue) }, 1500) }) }
function showFirstTextPart2(dialogue) { if (openingSkipped) return; typeText(dialogue, '\nYou\'re here. It\'s been a while.', function () { if (openingSkipped) return; setTimeout(function () { showSecondText(dialogue) }, 1200) }) }
const V2_DIALOGUES = {
  ko: {
    intro: ['어떤 기억을 찾고있어?'],
    namePrompt: '너가 찾는 기억은 누구의 것이지?',
    namePlaceholder: '...이름 하나',
    replayIntro: '...다른 걸 찾고있어?',
    transition: '...저기로 가봐.',
    testerIntro: '지금부터 너는 한 기억을 떠올리게될거야',   // 테스터 모드 전용 (260802)
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
    namePrompt: 'whose memory are you looking for?',
    namePlaceholder: '...a name',
    replayIntro: '...looking for something else?',
    transition: '...you can go there.',
    testerIntro: 'you are about to remember something',   // 테스터 모드 전용 (260802)
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

// ─────────────────────────────────────
// V2.1 V2-3 멀티턴 fingerprint 파이프라인
// ─────────────────────────────────────
// 순수 로직 (DOM·supabase 무관) 은 js/core/SeekerFingerprint.js 에 분리.
// 본 모듈은 supabase·DOM 의존 wrapper 만 담당.

// claude-scene 의 emotion_extract 응답에는 modality/role 이 없음 (스키마 누락).
// edge fn 재배포 전까지 클라 측 키워드 휴리스틱으로 보강 — 첫 매칭 우선, 못 잡으면 null.
// _askedSlots 추적과 합쳐 무한 반복은 무조건 차단.
function _inferModality(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (/들렸|소리|음악|목소리|sound|voice|heard|noise/.test(t)) return 'auditory';
  if (/냄새|향기|smell|scent|odor/.test(t)) return 'olfactory';
  if (/표정|얼굴|눈빛|장면|보였|봤|face|saw|look|scene|sight/.test(t)) return 'visual';
  if (/촉감|닿|손길|체온|몸|touch|felt|warm|cold|body/.test(t)) return 'somatic';
  return null;
}
function _inferRole(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (/지켜봤|멀리서|바라봤|구경|watched|from afar|witnessed/.test(t)) return 'observer';
  if (/당했|겪었|상처|harmed|hurt me|done to me/.test(t)) return 'victim';
  if (/내가|나는|i was|i did|i went/.test(t)) return 'actor';
  return null;
}

// 텍스트 → claude-scene emotion_extract → turnResult.
// 빈 텍스트면 LLM 호출 안 하고 빈 결과 반환 (네트워크 절약).
async function _analyzeTurnText(rawText, sceneText) {
  if (!rawText || !rawText.trim()) {
    return { base: {}, reason_analysis: {}, _raw_text: '' };
  }
  const sb = getSupabaseClient();
  if (!sb) {
    console.warn('[opening:dialog] supabase client unavailable — skip analysis');
    return { base: {}, reason_analysis: {}, _raw_text: rawText };
  }
  try {
    const { data, error } = await sb.functions.invoke('claude-scene', {
      body: { type: 'emotion_extract', user_text: rawText, scene_text: sceneText || '' },
    });
    if (error) throw error;
    const reason = (data && data.reason_analysis) || {};
    // 클라 휴리스틱으로 modality/role 보강. edge fn 이 직접 반환하면 그쪽 우선.
    const inferredRole = _inferRole(rawText);
    const inferredModality = (data && data.modality) || _inferModality(rawText);
    if (inferredRole && !reason.role) reason.role = inferredRole;
    return {
      base: (data && data.base) || {},
      reason_analysis: reason,
      modality: inferredModality,
      prompt_version: (data && data.prompt_version) || null,
      _raw_text: rawText,
    };
  } catch (e) {
    console.warn('[opening:dialog] emotion_extract failed:', e);
    return {
      base: {}, reason_analysis: {},
      modality: _inferModality(rawText),
      _raw_text: rawText,
    };
  }
}

// 메모리의 ghost_variants 풀 로드 (V2-1 신규 테이블).
async function _loadGhostVariantsForMemory(memoryId) {
  if (!memoryId) return [];
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('ghost_variants')
    .select('*')
    .eq('memory_id', memoryId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[opening:dialog] ghost_variants load failed:', error);
    return [];
  }
  return data || [];
}

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

// V2-13 (γ-full): opening 자리 닉네임 input 박음. dialogue 자리에 namePrompt 한 줄 박은
// 후 input element 박음 → Enter 박으면 setUserName + resolve.
function _promptNickname(dialogue, D) {
  return new Promise((resolve) => {
    dialogue.style.opacity = '';
    dialogue.textContent = '';
    typeText(dialogue, D.namePrompt, () => {
      const wrap = document.createElement('div');
      wrap.id = 'openingNamePromptWrap';
      wrap.style.cssText = 'position:absolute;left:50%;top:60%;transform:translateX(-50%);z-index:6;display:flex;flex-direction:column;align-items:center;gap:0.6rem;opacity:0;transition:opacity 0.6s ease;pointer-events:auto;';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 32;
      input.autocomplete = 'off';
      input.placeholder = D.namePlaceholder;
      input.style.cssText = 'background:transparent;border:none;border-bottom:1px solid rgba(196,168,130,0.5);color:rgba(220,196,160,0.9);font-family:"Cormorant Garamond",serif;font-size:18px;text-align:center;outline:none;padding:0.4em 0.4em;width:240px;letter-spacing:0.05em;';
      input.addEventListener('focus', () => { input.style.borderBottomColor = 'rgba(220,196,160,0.95)'; });
      input.addEventListener('blur', () => { input.style.borderBottomColor = 'rgba(196,168,130,0.5)'; });
      const onSubmit = () => {
        const v = (input.value || '').trim();
        if (!v) return;
        setUserName(v);
        wrap.style.opacity = '0';
        setTimeout(() => {
          if (wrap.parentNode) wrap.remove();
          dialogue.textContent = '';
          resolve();
        }, 700);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
      });
      wrap.appendChild(input);
      const openingScreen = document.getElementById('openingScreen');
      (openingScreen || document.body).appendChild(wrap);
      requestAnimationFrame(() => { wrap.style.opacity = '1'; });
      setTimeout(() => input.focus(), 200);
    });
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

  // ─── 테스터 모드 (260802): 인터뷰 통째로 건너뛰고 대사 한 줄 → 문 ───
  // 닉네임 · intro 질문 · 감정 칩 · 멀티턴 질문 전부 미표시.
  // 아래 원본 흐름(else 이하)은 손대지 않았다 — 스위치 끄면 그대로 돌아온다.
  if (isTesterMode()) {
    console.info('[opening] 테스터 모드 — finder 인터뷰 생략, 대표 기억 직행');
    await _typeLinesSequential(dialogue, [D.testerIntro]);
    await new Promise(r => setTimeout(r, 2200));
    // 입력 단계는 아예 띄우지 않는다 (inputPhase 는 기본 opacity 0 / pointerEvents none).
    await _handleOpeningSubmit(null, '');
    return;
  }

  // Returning user gets the same intro prompt as first-time — V2-13's separate
  // replayIntro branch retired (sound-first pivot, 2026-05-15). Nickname prompt
  // still gated on fresh users only.
  const isReturning = !!getUserName();
  if (isReturning) {
    await _typeLinesSequential(dialogue, D.intro);
    await new Promise(r => setTimeout(r, 1200));
  } else {
    await _promptNickname(dialogue, D);
    await new Promise(r => setTimeout(r, 600));
    await _typeLinesSequential(dialogue, D.intro);
    await new Promise(r => setTimeout(r, 1200));
  }

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

// V2-3 헬퍼: NPC 질문 한 줄 타이핑.
async function _showNpcQuestion(question) {
  const dialogue = document.getElementById('openingDialogue');
  if (!dialogue) return;
  await _typeLinesSequential(dialogue, [question]);
  await new Promise(r => setTimeout(r, 600));
}

// V2-3 헬퍼: 입력 필드 활성화 후 Enter / 제출 버튼 / 타임아웃 중 하나로 종료.
// 빈 입력 + Enter = 빈 문자열 반환 (호출자가 턴 skip 결정).
function _waitForUserInput(timeoutMs) {
  const inputPhase = document.getElementById('openingInputPhase');
  const input = document.getElementById('openingFinderInput');
  const submitBtn = document.getElementById('openingFinderSubmitBtn');
  if (!input) return Promise.resolve('');

  input.value = '';
  if (inputPhase) {
    inputPhase.style.pointerEvents = 'auto';
    inputPhase.style.opacity = '1';
  }
  setTimeout(() => { try { input.focus(); } catch (_) {} }, 200);

  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      input.removeEventListener('keydown', onKeydown);
      if (submitBtn) submitBtn.removeEventListener('click', onClick);
      if (inputPhase) {
        inputPhase.style.pointerEvents = 'none';
        inputPhase.style.opacity = '0';
      }
      resolve(value);
    };
    const onKeydown = (e) => { if (e.key === 'Enter') finish((input.value || '').trim()); };
    const onClick = () => finish((input.value || '').trim());
    input.addEventListener('keydown', onKeydown);
    if (submitBtn) submitBtn.addEventListener('click', onClick);
    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      setTimeout(() => finish(''), timeoutMs);
    }
  });
}

async function _handleOpeningSubmit(emotion, text) {
  // 이 제출 흐름이 속한 finder 세션 — 메뉴 ← 버튼이 눌리면 _finderSessionSeq 가
  // 증가해 아래 abort 체크에서 흐름이 끊긴다.
  const mySession = _finderSessionSeq;
  const inputPhase = document.getElementById('openingInputPhase');
  const dialogue = document.getElementById('openingDialogue');
  const input = document.getElementById('openingFinderInput');
  const submitBtn = document.getElementById('openingFinderSubmitBtn');
  const D = V2_DIALOGUES[_openingLang] || V2_DIALOGUES.en;

  // 턴 1 트리거 핸들러 정리 (이후 _waitForUserInput 의 addEventListener 만 활성).
  if (input) input.onkeydown = null;
  if (submitBtn) submitBtn.onclick = null;

  // 1) 턴 1 진행 동안 입력 페이드아웃
  if (inputPhase) {
    inputPhase.style.pointerEvents = 'none';
    inputPhase.style.opacity = '0';
  }
  await new Promise(r => setTimeout(r, 600));

  // ─── V2-3 멀티턴 fingerprint 누적 ───
  const fp = _initFingerprint();

  // 턴 1: 칩 또는 텍스트
  const turn1Text = (text || '').trim();
  if (emotion && CHIP_EMOTION_SEED[emotion]) {
    fp._turnsRaw.push({ turn: 1, raw_text: `(chip:${emotion})`, ts: new Date().toISOString() });
    _mergeTurn(fp, { base: CHIP_EMOTION_SEED[emotion], reason_analysis: {}, _raw_text: '' }, 1.0);
  } else if (turn1Text) {
    const turn1Result = await _analyzeTurnText(turn1Text, '');
    fp._turnsRaw.push({ turn: 1, raw_text: turn1Text, ts: new Date().toISOString() });
    _mergeTurn(fp, turn1Result);
  }

  // 턴 2 + 3: NPC 질문 → 입력 → 분석. 빈 입력은 그 턴 skip.
  // 260802 테스터 모드 — 질문 루프 자체를 건너뛴다 (fp 는 빈 채로 남고,
  // 아래 매칭에서 대표 기억 고정 경로가 이를 대신한다).
  const _testerSkipTurns = isTesterMode();
  for (let turnNum = 2; !_testerSkipTurns && turnNum <= TOTAL_TURNS; turnNum++) {
    await _fadeOutDialogue(dialogue, 600);
    const question = _pickNextQuestion(fp, _openingLang);
    await _showNpcQuestion(question);
    const turnText = await _waitForUserInput(60000);
    if (turnText) {
      const turnResult = await _analyzeTurnText(turnText, question);
      fp._turnsRaw.push({ turn: turnNum, raw_text: turnText, ts: new Date().toISOString() });
      _mergeTurn(fp, turnResult);
    }
  }

  // 2) 전환 대사
  await new Promise(r => setTimeout(r, 400));
  await _fadeOutDialogue(dialogue, 700);
  await _typeLinesSequential(dialogue, [D.transition]);
  await new Promise(r => setTimeout(r, 1000));
  await _fadeOutDialogue(dialogue, 900);

  // 3) lang · 선행 입력 · fingerprint 저장
  try {
    sessionStorage.setItem('tem_lang', _openingLang);
    sessionStorage.setItem('tem_opening_prefilled', emotion ? `chip:${emotion}` : `text:${text || ''}`);
    sessionStorage.setItem('tem_seeker_fp', JSON.stringify(fp));
  } catch (_) {}
  try { setLanguage(_openingLang); } catch (_) {}

  // 4) 메모리 로드 트리거 + 대기 (최대 15초 폴링)
  // 2026-05-08: 자료 §6.1 자리 fix.
  // 진짜 자리 = 페이지 로드 시점에 index.js 가 *로컬 mock 영어 시드 3개* 를 appStore 에 박음.
  // 이전 break 조건 `all.length > 0` 은 즉시 true → 폴링 0초 → 매칭 시도 → ko 사용자
  // 한국어 필터 0개 → 메인 메뉴 폴백 트리거.
  // 정정: 사용자 lang 의 메모리가 풀에 *1개 이상* 박힐 때까지 폴링 (Supabase fetch 끝).
  if (typeof window.loadMemoriesFromSupabase === 'function') {
    try { window.loadMemoriesFromSupabase(); } catch (_) {}
  }
  const _preferKoForPoll = _openingLang === 'ko';
  const waitStart = Date.now();
  const MAX_WAIT = 15000;
  while (Date.now() - waitStart < MAX_WAIT) {
    const all = (window.appStore && window.appStore.getState && window.appStore.getState().allMemoriesData) || [];
    const langCount = all.filter(m => {
      const t = (m.title || '') + (m.completed_sentence || '');
      return /[가-힣]/.test(t) === _preferKoForPoll;
    }).length;
    if (langCount > 0) break;
    await new Promise(r => setTimeout(r, 150));
  }

  // 메뉴 ← 버튼이 눌렸으면 여기서 중단 — 이후 파동 흡수·ASCII 도어·play-test 점프 모두 skip.
  if (_finderSessionSeq !== mySession) {
    console.info('[opening:dialog] finder 세션 무효화(메뉴 복귀) — 시퀀스 중단');
    return;
  }

  // 5) 파동 흡수 (freeze + 탈채도)
  await _collapseOpeningWave(1800);

  // 6) top-1 기억 + 유령 변주 매칭 (V2.1 SeekerMatchEngine)
  const allMemories = (window.appStore && window.appStore.getState && window.appStore.getState().allMemoriesData) || [];
  const preferKo = _openingLang === 'ko';
  let langFiltered = allMemories.filter(m => {
    const t = (m.title || '') + (m.completed_sentence || '');
    return /[가-힣]/.test(t) === preferKo;
  });
  // V2-13 (γ-full): 박은 메모리 제외 — 처음 보는 메모리는 인터뷰 박혀야 만남.
  // 풀 비면 (사용자가 다 박음) 디폴트 풀 박음 + console.info 박음 (재진입 자리 fallback).
  try {
    const playedIds = new Set(
      Object.keys(localStorage)
        .filter(k => k.startsWith('tem_first_play:'))
        .map(k => k.slice('tem_first_play:'.length))
    );
    if (playedIds.size > 0) {
      const filtered = langFiltered.filter(m => !playedIds.has(m.id));
      if (filtered.length > 0) {
        langFiltered = filtered;
      } else {
        console.info('[opening:dialog] 모든 메모리 박음 — 디폴트 풀 박음 (재만남 자리)');
      }
    }
  } catch (_) {}

  let memory = null;
  let variant = null;
  let memDelta = 0;
  let variantDelta = 0;
  let variants = [];   // V2-4 decideBranch 풀 입력 (memory 못 찾으면 빈 배열 → empty_pool)

  // ─── 테스터 모드 (260802): 대표 기억 고정 ───
  // 인터뷰를 건너뛰어 fp 가 비었으므로 매칭 근거가 없다. 누가 하든 같은 기억을
  // 보게 해서 반응을 비교할 수 있도록 코드로 지정한다 (code 우선, 없으면 id).
  if (isTesterMode()) {
    const pool = (window.appStore && window.appStore.getState && window.appStore.getState().allMemoriesData) || [];
    memory = pool.find(m => m && m.code === TESTER_MEMORY_CODE)
          || pool.find(m => m && String(m.id) === TESTER_MEMORY_ID)
          || null;
    if (memory) {
      variants = await _loadGhostVariantsForMemory(memory.id);
      console.info('[opening] 테스터 모드 — 대표 기억 고정:', memory.code || memory.id);
    } else {
      console.warn('[opening] 테스터 모드 — 대표 기억(' + TESTER_MEMORY_CODE + ') 못 찾음, 기본 매칭으로 폴백');
    }
  }

  const memMatch = memory ? null : pickTopMemory(fp, langFiltered);
  if (memMatch && memMatch.memory) {
    memory = memMatch.memory;
    memDelta = memMatch.runnerUpDelta;
    variants = await _loadGhostVariantsForMemory(memory.id);
    if (variants.length > 0) {
      const vMatch = pickGhostVariant(fp, variants);
      if (vMatch && vMatch.variant) {
        variant = vMatch.variant;
        variantDelta = vMatch.runnerUpDelta;
      }
    }
  }

  // V2-3 매칭 풀 비었거나 점수 0 → V1 fallback (키워드 + emotion vec).
  // 정상 흐름의 일부라 info 톤 (warn 박으면 콘솔에서 진짜 실패와 분간 안 됨).
  if (!memory) {
    console.info('[opening:dialog] SeekerMatchEngine 점수 0 — V1 키워드 fallback 진입 (정상 흐름)');
    memory = _pickTopMemoryForLumen(emotion, text, _openingLang);
  }

  // 진짜 실패 자리 — 메모리 풀 0건 = 데이터/네트워크 문제. error 로 명확히.
  if (!memory) {
    console.error('[opening:lumen] 매칭 가능한 메모리 0건 — 메인 메뉴로 복귀 (메모리 풀 비어있음)');
    openingSkipped = true;
    if (openingWaveAnimationId) { cancelAnimationFrame(openingWaveAnimationId); openingWaveAnimationId = null; }
    finishOpeningSequence();
    return;
  }

  // V2-4 분기 분류 — drift / speciation (LLM 금지, 결정론적, 유령 단위).
  const branch = decideBranch(fp, variants);

  // V2-4 후반: speciation 시 ghost_variants 에 새 변주 자동 INSERT.
  // anon 플레이어 → insert-ghost-variant Edge function (service_role 우회).
  // 마지막 turn raw_text 를 utterance 로 사용.
  let speciationVariantId = null;
  if (branch.kind === 'speciation' && memory && memory.id) {
    const lastTurn = (fp._turnsRaw && fp._turnsRaw.length > 0)
      ? fp._turnsRaw[fp._turnsRaw.length - 1]
      : null;
    const lastUtterance = lastTurn ? String(lastTurn.raw_text || '').trim() : '';
    if (lastUtterance) {
      const row = buildSpeciationRow({
        memoryId: memory.id,
        parentVariantId: branch.topVariant?.id || null,
        fingerprint: fp,
        utterance: lastUtterance,
      });
      try {
        const sb = getSupabaseClient();
        if (sb) {
          const { data: insertResult, error: insertErr } = await sb.functions.invoke(
            'insert-ghost-variant', { body: row }
          );
          if (insertErr) {
            console.warn('[opening:dialog] speciation INSERT failed:', insertErr);
          } else if (insertResult && insertResult.variant) {
            speciationVariantId = insertResult.variant.id;
            console.log('[opening:dialog] speciation 새 유령 시드 생성:', {
              id: speciationVariantId,
              parent: row.parent_variant_id,
              extractor: row.extractor_version,
            });
          }
        }
      } catch (e) {
        // INSERT 실패해도 회차 진행 막지 X — 사용자 경험 보호.
        console.warn('[opening:dialog] speciation INSERT exception:', e);
      }
    } else {
      console.warn('[opening:dialog] speciation 인데 마지막 turn raw_text 없음 — INSERT 스킵');
    }
  }

  try {
    sessionStorage.setItem('tem_picked_memory_id', String(memory.id || ''));
    sessionStorage.setItem('tem_picked_memory_delta', String(memDelta));
    sessionStorage.setItem('tem_ghost_variant_id', variant ? String(variant.id) : '');
    sessionStorage.setItem('tem_ghost_variant_delta', String(variantDelta));
    sessionStorage.setItem('tem_branch_kind', branch.kind);
    sessionStorage.setItem('tem_branch_reason', branch.reason);
    sessionStorage.setItem('tem_branch_top_score', String(branch.topScore));
    sessionStorage.setItem('tem_branch_runner_up_delta', String(branch.runnerUpDelta));
    sessionStorage.setItem('tem_speciation_variant_id', speciationVariantId || '');
  } catch (_) {}
  console.log('[opening:dialog] matched', {
    memoryId: memory.id,
    memDelta,
    variantId: variant?.id,
    variantDelta,
    branchKind: branch.kind,
    branchReason: branch.reason,
    speciationVariantId,
    fp,
  });

  // 매칭 도중 메뉴 복귀를 눌렀다면 ASCII 도어 오버레이가 메뉴 위에 뜨지 않도록 중단.
  if (_finderSessionSeq !== mySession) {
    console.info('[opening:dialog] finder 세션 무효화(메뉴 복귀) — 도어 연출 취소');
    return;
  }

  // 7) ASCII 문 열림 + 빨려들어감
  await _runLumenDoorSequence();

  // 8) wave anim 정지
  openingSkipped = true;
  if (openingWaveAnimationId) { cancelAnimationFrame(openingWaveAnimationId); openingWaveAnimationId = null; }

  // 9) play-test 점프
  const isLocal = location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ||
    location.hostname.endsWith('.local');
  const base = isLocal ? 'play-test.html' : '/play';
  try {
    sessionStorage.setItem('demoMemoryId', String(memory.id || ''));
    sessionStorage.setItem('tem_archive_memory_id', String(memory.id || ''));
    sessionStorage.setItem('tem_archive_lang', _openingLang);
  } catch (_) {}
  // 도어 연출 도중 메뉴 복귀를 눌렀다면 페이지 강제 이동 금지.
  if (_finderSessionSeq !== mySession) {
    console.info('[opening:dialog] finder 세션 무효화(메뉴 복귀) — play-test 점프 취소');
    return;
  }
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

// V2-13 (γ-full, 5-13): PLAY 재진입 화면 전용 — 멘트 위쪽에 옛 finder식 진한 호박색 7겹 합성파.
// 오프닝 기본 wave (openingWaveCanvas) 는 transform scale(5,1) 푸른 톤이라 viewport 에선 캔버스 가운데
// 1/10 만 보여 거의 안 보임. PLAY 재진입엔 그 위에 작은 영역(높이 ~150px) 진한 합성파를 박음.
// waves 배열·tick 로직은 archive.js _mountFinderThread 와 동일 — 톤 바꾸려면 두 자리 동기화.
let _openingWarmThreadCanvas = null;
function _mountOpeningWarmThread() {
    if (_openingWarmThreadCanvas) {
        if (_openingWarmThreadCanvas._cleanup) _openingWarmThreadCanvas._cleanup();
        if (_openingWarmThreadCanvas.parentNode) _openingWarmThreadCanvas.remove();
        _openingWarmThreadCanvas = null;
    }
    const openingScreen = document.getElementById('openingScreen');
    if (!openingScreen) return null;

    if (!document.getElementById('openingWarmThreadStyle')) {
        const st = document.createElement('style');
        st.id = 'openingWarmThreadStyle';
        st.textContent = `
          #openingWarmThreadCanvas {
            position:absolute;
            left:50%;
            top:38%;
            transform:translate(-50%, -50%);
            width:min(820px, 88vw);
            height:150px;
            opacity:0;
            transition:opacity 1.8s ease;
            pointer-events:none;
            z-index:3;
          }
        `;
        document.head.appendChild(st);
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'openingWarmThreadCanvas';
    canvas.setAttribute('aria-hidden', 'true');
    openingScreen.appendChild(canvas);

    const DPR = window.devicePixelRatio || 1;
    let width = 0, height = 0;
    const ctx = canvas.getContext('2d');
    function sizeCanvas() {
        const w = canvas.offsetWidth || 600;
        const h = canvas.offsetHeight || 150;
        canvas.width = Math.round(w * DPR);
        canvas.height = Math.round(h * DPR);
        width = w; height = h;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    sizeCanvas();

    const maxAmp = height * 0.36;
    const waves = [
        { color: 'rgba(150,140,120,', baseOpacity: 0.09, speed: 0.010, amplitude: Math.min(54, maxAmp),        phase: 0.0, freq: 0.019, noiseScale: 0.8 },
        { color: 'rgba(170,155,128,', baseOpacity: 0.13, speed: 0.014, amplitude: Math.min(46, maxAmp * 0.9),  phase: 0.8, freq: 0.024, noiseScale: 0.7 },
        { color: 'rgba(185,168,138,', baseOpacity: 0.18, speed: 0.018, amplitude: Math.min(40, maxAmp * 0.82), phase: 1.5, freq: 0.029, noiseScale: 0.6 },
        { color: 'rgba(200,180,150,', baseOpacity: 0.23, speed: 0.022, amplitude: Math.min(34, maxAmp * 0.72), phase: 2.3, freq: 0.034, noiseScale: 0.5 },
        { color: 'rgba(215,192,158,', baseOpacity: 0.30, speed: 0.026, amplitude: Math.min(28, maxAmp * 0.6),  phase: 3.1, freq: 0.040, noiseScale: 0.4 },
        { color: 'rgba(225,202,168,', baseOpacity: 0.38, speed: 0.030, amplitude: Math.min(22, maxAmp * 0.5),  phase: 3.9, freq: 0.045, noiseScale: 0.32 },
        { color: 'rgba(240,218,180,', baseOpacity: 0.48, speed: 0.034, amplitude: Math.min(16, maxAmp * 0.4),  phase: 4.7, freq: 0.050, noiseScale: 0.25 },
    ];

    let t = 0;
    let rafId = 0;
    function tick() {
        ctx.clearRect(0, 0, width, height);
        const cy = height / 2;
        for (let wi = 0; wi < waves.length; wi++) {
            const w = waves[wi];
            ctx.beginPath();
            ctx.lineWidth = 1.1;
            for (let x = 0; x < width; x++) {
                const baseY = cy
                    + Math.sin(x * w.freq + t * w.speed + w.phase) * w.amplitude
                    + Math.sin(x * w.freq * 0.5 + t * w.speed * 0.6 + w.phase * 1.4) * (w.amplitude * 0.4)
                    + Math.sin(x * w.freq * 2.3 + t * w.speed * 1.3) * (w.amplitude * 0.15)
                    + Math.sin(x * w.freq * 0.3 + t * w.speed * 0.4 + w.phase * 2.1) * (w.amplitude * 0.25)
                    + Math.sin(x * w.freq * 3.7 + t * w.speed * 1.8 + w.phase * 0.7) * (w.amplitude * 0.1);
                const noise = Math.sin(x * 0.003 + t * 0.02) * Math.cos(x * 0.007 + t * 0.015) * w.noiseScale;
                const y = baseY + w.amplitude * noise * 0.4;
                const clamped = Math.max(2, Math.min(height - 2, y));
                if (x === 0) ctx.moveTo(x, clamped);
                else ctx.lineTo(x, clamped);
            }
            ctx.strokeStyle = w.color + w.baseOpacity + ')';
            ctx.stroke();
        }
        t += 0.5;
        rafId = requestAnimationFrame(tick);
    }
    tick();

    const onResize = () => { sizeCanvas(); };
    window.addEventListener('resize', onResize);
    canvas._cleanup = () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onResize);
    };

    requestAnimationFrame(() => { canvas.style.opacity = '1'; });
    _openingWarmThreadCanvas = canvas;
    return canvas;
}

// finder 화면(어떤 기억을 찾고있어?) 좌상단 ← 버튼 핸들러.
// 메뉴(introScreen)에서 PLAY로 진입한 사용자가 인터뷰에 답하지 않고 메뉴로 되돌아갈 때.
// 진행 중이던 _handleOpeningSubmit 비동기 흐름은 _finderSessionSeq 증가로 무효화된다.
function _exitFinderToMenu() {
    // in-flight 흐름 무효화 + 파동 RAF 정지.
    _finderSessionSeq++;
    openingSkipped = true;
    if (openingWaveAnimationId) {
        cancelAnimationFrame(openingWaveAnimationId);
        openingWaveAnimationId = null;
    }

    // finder 입력/대사 자리 초기화 — 다음 재진입 시 깨끗한 상태.
    const dialogue = document.getElementById('openingDialogue');
    if (dialogue) {
        dialogue.textContent = '';
        dialogue.style.removeProperty('opacity');
        dialogue.style.removeProperty('transition');
    }
    const inputPhase = document.getElementById('openingInputPhase');
    if (inputPhase) {
        inputPhase.style.opacity = '0';
        inputPhase.style.pointerEvents = 'none';
    }
    const finderInput = document.getElementById('openingFinderInput');
    if (finderInput) {
        finderInput.value = '';
        finderInput.onkeydown = null;
    }
    const backBtn = document.getElementById('openingBackBtn');
    if (backBtn) backBtn.style.display = 'none';

    // openingScreen 숨김.
    const openingScreen = document.getElementById('openingScreen');
    if (openingScreen) {
        openingScreen.classList.add('hidden');
        openingScreen.classList.remove('visible');
        openingScreen.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;z-index:-1 !important;';
    }

    // 메뉴(introScreen) 복귀 — backToIntro 가 메뉴 노출 + 사운드/애니메이션 정리까지 담당.
    if (typeof window.backToIntro === 'function') {
        window.backToIntro();
    } else {
        const introScreen = document.getElementById('introScreen');
        if (introScreen) {
            introScreen.classList.remove('hidden');
            introScreen.classList.add('visible');
            introScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2000 !important;';
        }
    }
}

// V2-13 (γ-full, 5-11): 메뉴 → "다른 기억을 찾아서" 진입 자리.
// archive.js _initMemoryFinder (두 줄 멘트 + 6개 도어 늘어선 결과) 폐기 →
// 오프닝 흐름 그대로 재호출 (한 줄 replayIntro + 멀티턴 인터뷰 + ASCII 도어 한 짝 → play-test 점프).
// 작품 정체성 §6.5 #5 "Player sees fog" 정합 — 사용자 선택권 사라지고 시스템이 끌어당김.
async function enterPlayReplaySequence() {
    // 1) 다른 화면 자리 숨김
    ['introScreen', 'archiveContainer', 'endScreen', 'modeSelection', 'liveContainer', 'sceneViewer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active', 'visible');
            el.classList.add('hidden');
            el.style.cssText = 'display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;';
        }
    });

    // 2) openingScreen 다시 보이게 박음
    const openingScreen = document.getElementById('openingScreen');
    if (openingScreen) {
        openingScreen.classList.remove('hidden');
        openingScreen.classList.add('visible');
        openingScreen.style.cssText = 'display:flex !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;z-index:2500 !important;';
    }

    // 3) langGate 자리 숨김 (이미 언어 박혀 있는 사용자)
    const langGate = document.getElementById('openingLangGate');
    if (langGate) {
        langGate.style.display = 'none';
        langGate.style.opacity = '0';
        langGate.style.pointerEvents = 'none';
    }

    // 4) opening dialogue / input 자리 초기화 (Hello/Come in 잔여 정리)
    const dialogue = document.getElementById('openingDialogue');
    if (dialogue) {
        dialogue.textContent = '';
        dialogue.style.removeProperty('opacity');
        dialogue.style.removeProperty('transition');
    }
    const inputPhase = document.getElementById('openingInputPhase');
    if (inputPhase) {
        inputPhase.style.opacity = '0';
        inputPhase.style.pointerEvents = 'none';
    }
    const finderInput = document.getElementById('openingFinderInput');
    if (finderInput) {
        finderInput.value = '';
        finderInput.onkeydown = null;
    }

    // 5) wave — sound-first pivot: keep first-entry visual (default white wave).
    //    V2-13's warm amber thread + container hide retired so menu re-entry matches the opening tone.
    //    Mirror startOpeningSequence's wave setup (transform scale + visible class) so the
    //    container fills the viewport, and clear openingSkipped so the RAF loop can run.
    openingSkipped = false;
    _openingWaveSpeedMul = 1;
    _openingWaveDesat = 0;
    const waveContainer = document.getElementById('openingWaveContainer');
    if (waveContainer) {
        waveContainer.style.display = '';
        waveContainer.style.transform = 'scale(5, 1)';
        waveContainer.style.opacity = '1';
        waveContainer.classList.add('visible');
    }
    // Wait two animation frames so layout/reflow settles after openingScreen + waveContainer
    // were just re-shown — otherwise canvas.offsetWidth reads 0 and the wave canvas ends up
    // sized 0×0 (one rAF alone is sometimes not enough on Safari).
    const waveCanvas = document.getElementById('openingWaveCanvas');
    if (waveCanvas && typeof startOpeningWaveAnimation === 'function') {
        if (openingWaveAnimationId) {
            cancelAnimationFrame(openingWaveAnimationId);
            openingWaveAnimationId = null;
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (waveCanvas.offsetWidth > 0 && waveCanvas.offsetHeight > 0) {
                    startOpeningWaveAnimation(waveCanvas);
                } else {
                    console.warn('[opening] wave canvas still 0-sized after 2 rAFs', {
                        offsetWidth: waveCanvas.offsetWidth,
                        offsetHeight: waveCanvas.offsetHeight,
                        containerDisplay: waveCanvas.parentElement && getComputedStyle(waveCanvas.parentElement).display,
                    });
                }
            });
        });
    }

    // 6) 현재 언어 박음
    let curLang = 'en';
    try {
        const stored = localStorage.getItem('tem_language');
        if (stored === 'ko' || stored === 'en') curLang = stored;
    } catch (_) {}
    _openingLang = curLang;

    // 6b) 좌상단 ← 버튼 노출 + 클릭 핸들러 — 메뉴에서 진입한 사용자만 이 경로를 탄다.
    //     onclick 으로 박아 재진입 시 핸들러 중복 등록 방지.
    const backBtn = document.getElementById('openingBackBtn');
    if (backBtn) {
        backBtn.style.display = 'flex';
        backBtn.onclick = (e) => {
            if (e) e.stopPropagation();
            _exitFinderToMenu();
        };
    }

    // 7) _runV2Sequence 호출 (replayIntro 분기 → 입력 → 멀티턴 → 도어 → play-test 점프)
    await _runV2Sequence();
}

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
    enterPlayReplaySequence,

    // NPC
    playNpcIntro,
};

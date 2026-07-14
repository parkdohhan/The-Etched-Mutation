import { appStore } from './appStore.js';
import { showNotification, showNpcDialogue } from '../ui/notify.js';
// showEndScreen import removed (R5-5) — its callers lived in the scene-play region.
import { getSoundscape } from '../audio/getSoundscape.js';
/**
 * Archive Module — memory list, filtering/sorting, scene rendering,
 * emotion input, engine integration, play tracking, wave animation.
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   window.showComparisonView
 */

import { getSupabaseClient, waitForSupabaseClient, getAccessToken } from '../lib/supabaseClient.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config.js';
// npc-dialogues import removed (R5-5) — only the scene-play region used it.
import { t, getCurrentLanguage } from '../lib/i18n.js';
import {
    fetchMemories, fetchScenes, savePlay, saveNote, fetchNotes, activateMemoryIfFetus
} from '../shared/api.js';
import { playSound, stopSound, setVolume, SOUNDS } from '../shared/audio.js';
import {
    cosineSimilarity, normalizeVector, addVectors, getBucket, checkFixated,
    getDominantEmotion, normalizeAnchor, projectEmotionToVAD,
    emotionVectorToWaveStyle
} from '../shared/math.js';
// ByeoriEngine / SceneNavigator imports removed (R5-5) — the engine step ran in the
// scene-play region; play-test.html drives the engine now.
import { updateContamination, getPresentationState } from '../core/ContaminationTracker.js';
// contaminationPresenter import removed (R5-5) — its only consumer was renderScene(),
// which lived in the scene-play region deleted below. The module itself is left on disk:
// contamination is R2's active lane, and this is the shell's reference implementation of
// stage-text selection. R2 decides whether to port it to play-test.html or retire it.
import { getMonologue } from '../ui/contaminationMonologue.js';
import { networkService } from '../services/NetworkService.js';
import { uiManager } from '../ui/UIManager.js';
import { visualizer } from '../ui/Visualizer.js';
import { computeArchiveWaveData } from '../shared/math.js';
import { enterPlayReplaySequence } from './opening.js';

// V2-13 (γ-full, 5-11): 메뉴 → "다른 기억을 찾아서" 자리.
// 옛 자리 = _initMemoryFinder (memoryFinderContainer DOM + 두 줄 멘트 + 결과 도어 6개 늘어선 자리).
// 새 자리 = 오프닝 시퀀스 그대로 재호출 (한 줄 replayIntro + 멀티턴 인터뷰 + ASCII 도어 한 짝 빨림 → play-test 점프).
// archive.js 의 finder 자리 (_initMemoryFinder / _finderMatch / _showFinderResults) 는 코드 살려둠 — 롤백 자리.
async function enterPlayIntro(opts) {
  // archiveContainer 활성화 X. archive 자체의 finder 자리 호출 X.
  // 메모리 풀은 백그라운드에서 로드 (오프닝 _handleOpeningSubmit 폴링 자리에서 박힘).
  if (typeof window.loadMemoriesFromSupabase === 'function') {
    try { window.loadMemoriesFromSupabase(); } catch (_) {}
  }
  appStore.setState({ currentMode: 'play' });
  stopArchiveWaveAnimation();

  // archiveContainer 의 sub-views 자리 한 번 정리 (다른 자리에서 박혀 있을 수 있음)
  const archiveContainer = document.getElementById('archiveContainer');
  if (archiveContainer) {
    archiveContainer.classList.remove('active');
    archiveContainer.style.cssText = 'display:none !important;';
  }
  const finderEl = document.getElementById('memoryFinderContainer');
  if (finderEl) finderEl.style.display = 'none';

  // 오프닝 흐름 그대로 진입
  await enterPlayReplaySequence();
}

// ─── Memory Finder: personalized memory matching sequence ─────────

const FINDER_CHIPS = {
  ko: [
    { label: '슬픔', emotion: 'sadness' },
    { label: '그리움', emotion: 'longing' },
    { label: '분노', emotion: 'anger' },
    { label: '두려움', emotion: 'fear' },
    { label: '죄책감', emotion: 'guilt' },
    { label: '기쁨', emotion: 'joy' },
  ],
  en: [
    { label: 'sadness', emotion: 'sadness' },
    { label: 'longing', emotion: 'longing' },
    { label: 'anger', emotion: 'anger' },
    { label: 'fear', emotion: 'fear' },
    { label: 'guilt', emotion: 'guilt' },
    { label: 'joy', emotion: 'joy' },
  ],
};

// v2 확정 대사 (docs/play_entry_redesign_v2-260419.md).
// V2-13 (γ-full, 5-10): PLAY 메뉴 자리 박힌 자리 — 닉네임 박힌 사용자 자리. *replay 톤*.
const PLAY_ENTRY_DIALOGUES = {
  ko: [
    '...다른 걸 찾고있어?',
    '어떤 기억을 찾고있어?',
  ],
  en: [
    '...looking for something else?',
    'what are you looking for?',
  ],
};

// v2 Phase 2: 인트로 멀티웨이브 실 — 오프닝 스크린(openingWaveCanvas)의 7-레이어 합성 재활용.
// (원본: js/demo/demoFlow.js startOpeningWaveLoop)
function _mountFinderThread(questionPhaseEl) {
  if (!questionPhaseEl) return null;
  const old = document.getElementById('finderThreadCanvas');
  if (old) {
    if (old._cleanup) old._cleanup();
    old.remove();
  }

  if (!document.getElementById('finderThreadStyle')) {
    const st = document.createElement('style');
    st.id = 'finderThreadStyle';
    st.textContent = `
      #finderThreadCanvas {
        display:block;
        width:min(820px, 88vw);
        height:140px;
        margin:0 auto 32px;
        opacity:0;
        transition:opacity 1.8s ease;
        pointer-events:none;
      }
    `;
    document.head.appendChild(st);
  }

  const canvas = document.createElement('canvas');
  canvas.id = 'finderThreadCanvas';
  canvas.setAttribute('aria-hidden', 'true');

  const questionEl = document.getElementById('finderQuestion');
  if (questionEl && questionEl.parentNode === questionPhaseEl) {
    questionPhaseEl.insertBefore(canvas, questionEl);
  } else {
    questionPhaseEl.insertBefore(canvas, questionPhaseEl.firstChild);
  }

  // Size (DPR 반영)
  const DPR = window.devicePixelRatio || 1;
  let width = 0, height = 0;
  const ctx = canvas.getContext('2d');
  function sizeCanvas() {
    const w = canvas.offsetWidth || 600;
    const h = canvas.offsetHeight || 140;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    width = w; height = h;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  sizeCanvas();

  // 오프닝 웨이브와 동일한 7-레이어. 색 톤만 TEM archive 팔레트(warm amber)로 이동.
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
  return canvas;
}

async function _typeDialogueLines(containerEl, lines, opts) {
  opts = opts || {};
  const charDelay = opts.charDelay != null ? opts.charDelay : 55;
  const lineDelay = opts.lineDelay != null ? opts.lineDelay : 900;
  containerEl.innerHTML = '';
  for (let li = 0; li < lines.length; li++) {
    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 0.55em 0;font-family:inherit;opacity:0;transition:opacity 0.5s ease;';
    containerEl.appendChild(p);
    await new Promise(r => requestAnimationFrame(r));
    p.style.opacity = '1';
    const text = lines[li];
    for (let ci = 1; ci <= text.length; ci++) {
      p.textContent = text.slice(0, ci);
      await new Promise(r => setTimeout(r, charDelay));
    }
    if (li < lines.length - 1) await new Promise(r => setTimeout(r, lineDelay));
  }
}

async function _initMemoryFinder() {
  const lang = getCurrentLanguage();
  const questionEl = document.getElementById('finderQuestion');
  const inputEl = document.getElementById('finderInput');
  const chipsEl = document.getElementById('finderChips');
  const browseBtn = document.getElementById('finderBrowseBtn');
  const questionPhase = document.getElementById('finderQuestionPhase');
  const resultPhase = document.getElementById('finderResultPhase');

  if (!questionEl || !inputEl || !chipsEl) return;

  // Reset
  if (questionPhase) questionPhase.style.display = 'block';
  if (resultPhase) { resultPhase.style.display = 'none'; resultPhase.innerHTML = ''; }

  // v2 Phase 2: 순차 등장 — 실 → 대사 → 입력/칩/링크
  // DOM 준비는 모두 숨긴 상태로 await 전에 완료 (flash 방지).

  // 대사 자리 비움, 아래 요소 모두 hide
  questionEl.innerHTML = '';
  inputEl.style.opacity = '0';
  inputEl.style.transition = 'opacity 0.6s ease';
  chipsEl.style.opacity = '0';
  chipsEl.style.transition = 'opacity 0.6s ease';
  if (browseBtn) { browseBtn.style.opacity = '0'; browseBtn.style.transition = 'opacity 0.6s ease'; }

  // 입력 placeholder
  inputEl.placeholder = lang === 'en' ? 'A word, a feeling...' : '단어 하나, 감정 하나...';
  inputEl.value = '';

  // 칩 미리 populate
  chipsEl.innerHTML = '';
  const chips = FINDER_CHIPS[lang] || FINDER_CHIPS.en;
  chips.forEach(chip => {
    const btn = document.createElement('button');
    btn.textContent = chip.label;
    btn.style.cssText = 'background:none;border:1px solid rgba(196,168,130,0.25);color:rgba(196,168,130,0.6);font-family:"Cormorant Garamond",serif;font-size:12px;letter-spacing:1px;padding:6px 14px;cursor:pointer;transition:all 0.3s;border-radius:2px;';
    btn.addEventListener('click', () => _finderMatch(chip.emotion, lang));
    btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'rgba(196,168,130,0.6)'; btn.style.color = 'rgba(196,168,130,0.9)'; });
    btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'rgba(196,168,130,0.25)'; btn.style.color = 'rgba(196,168,130,0.6)'; });
    chipsEl.appendChild(btn);
  });

  // 입력 submit 핸들러
  inputEl.onkeydown = (e) => {
    if (e.key === 'Enter' && inputEl.value.trim()) {
      _finderMatchByText(inputEl.value.trim(), lang);
    }
  };
  const submitBtn = document.getElementById('finderSubmitBtn');
  if (submitBtn) {
    submitBtn.onclick = () => {
      if (inputEl.value.trim()) _finderMatchByText(inputEl.value.trim(), lang);
    };
  }

  // V2-13 (γ-full, 5-10): finder 우회 자리 폐기. 처음 보는 메모리는 인터뷰 박혀야 만남.
  // 작가 자리 *전체 풀* 자리는 admin URL 자리 박음.
  if (browseBtn) {
    browseBtn.style.display = 'none';
  }

  // 1) 실 마운트 (페이드인 1.8s)
  _mountFinderThread(questionPhase);

  // 2) 실 안착 후 대사 타이핑
  const THREAD_SETTLE_MS = 1800;
  const DIALOGUE_DELAY_MS = 400;
  const dialogues = PLAY_ENTRY_DIALOGUES[lang] || PLAY_ENTRY_DIALOGUES.en;
  await new Promise(r => setTimeout(r, THREAD_SETTLE_MS + DIALOGUE_DELAY_MS));
  await _typeDialogueLines(questionEl, dialogues);

  // 3) 대사 완료 후 입력/칩/링크 페이드인
  inputEl.style.opacity = '1';
  chipsEl.style.opacity = '1';
  if (browseBtn) browseBtn.style.opacity = '1';
  setTimeout(() => inputEl.focus(), 400);
}

/**
 * 기억의 감정 벡터를 가져옴 (original_vector 우선, 없으면 씬에서 유도)
 */
function _getMemoryEmotionVector(m) {
  if (m.original_vector && typeof m.original_vector === 'object') return m.original_vector;
  // 씬의 original_emotion에서 평균 벡터 유도
  if (m.scenes && m.scenes.length > 0) {
    const avg = {};
    let count = 0;
    for (const s of m.scenes) {
      let emo = s.original_emotion || s.originalVector;
      if (!emo) continue;
      if (typeof emo === 'string') { try { emo = JSON.parse(emo); } catch (_) { continue; } }
      if (typeof emo !== 'object') continue;
      count++;
      for (const [k, v] of Object.entries(emo)) {
        avg[k] = (avg[k] || 0) + (Number(v) || 0);
      }
    }
    if (count > 0) {
      for (const k in avg) avg[k] /= count;
      return avg;
    }
  }
  return null;
}

// v2: 플레이 진입 시 baseline_emotion 저장 (정렬도 reference point)
// Phase 1은 sessionStorage만, DB 연동은 Phase 3에서.
function _saveBaselineEmotion(vec) {
  try {
    sessionStorage.setItem('tem_baseline_emotion', JSON.stringify(vec || {}));
  } catch (_) {}
}

// 텍스트에서 baseline 벡터 추출 — 현재 키워드 기반. LLM 전환 시 대체됨(Phase 2).
function _extractBaselineFromText(query) {
  const lower = (query || '').toLowerCase();
  const emotionWords = {
    sadness: ['슬', '울', 'sad', 'cry', '아프', '힘들'],
    anger: ['화', '분노', 'angry', 'rage', '짜증'],
    fear: ['무서', '두려', 'fear', 'afraid', '불안'],
    longing: ['그리', '보고싶', 'miss', 'long', '그립'],
    guilt: ['미안', '죄책', 'sorry', 'guilt', '후회'],
    joy: ['기쁨', '행복', 'happy', 'joy', '좋'],
  };
  const vec = {};
  let total = 0;
  for (const [emo, keywords] of Object.entries(emotionWords)) {
    const hits = keywords.filter(kw => lower.includes(kw)).length;
    if (hits > 0) { vec[emo] = hits; total += hits; }
  }
  if (total > 0) for (const k in vec) vec[k] /= total;
  return vec;
}

// 작업 13: motif_tags를 Play entry 매칭 시그널로 활성화 (SCOPE §4)
// motif는 scene 레벨에 있음 (meta.motif_tags). 메모리 레벨 메타에도 있으면 합산.
// α 초기값 0.15. SCOPE 표기: cosine(emotion) + α × |motif ∩ userKeywords|
const _MOTIF_ALPHA = 0.15;

function _collectMotifTags(memory) {
  const set = new Set();
  const addArr = (arr) => {
    if (Array.isArray(arr)) {
      arr.forEach(t => {
        if (typeof t === 'string' && t.trim()) set.add(t.trim().toLowerCase());
      });
    }
  };
  // memory 레벨 (미래 확장 대비)
  addArr(memory && memory.meta && memory.meta.motif_tags);
  // scene 레벨 (Lumen 저작 템플릿에서 실제 사용 위치)
  const scenes = (memory && memory.scenes) || [];
  for (const sc of scenes) {
    addArr(sc && sc.meta && sc.meta.motif_tags);
  }
  return set;
}

function _motifBonus(queryLower, memory) {
  if (!queryLower) return 0;
  const motifs = _collectMotifTags(memory);
  if (motifs.size === 0) return 0;
  // Korean은 agglutinative라 토큰 분리 대신 substring 매칭.
  // "엄마가 보고싶어" ⊃ motif "엄마" → hit.
  let hits = 0;
  for (const m of motifs) {
    if (queryLower.includes(m)) hits++;
  }
  return _MOTIF_ALPHA * hits;
}

function _finderMatch(emotion, lang) {
  _saveBaselineEmotion({ [emotion]: 1.0 });
  const all = appStore.getState().allMemoriesData || [];
  const preferKo = lang === 'ko';
  // v2: 하드 필터 — 선택 언어의 기억만 매칭 대상
  let memories = all.filter(m => _isMemoryKorean(m) === preferKo);
  memories = _excludePlayedMemories(memories);
  console.log('[_finderMatch] lang=', lang, 'preferKo=', preferKo, 'total=', all.length, 'filtered=', memories.length, 'titles=', memories.map(m => m.title));
  const scored = memories.map(m => {
    let score = 0;
    const vec = _getMemoryEmotionVector(m);
    if (vec) {
      score = vec[emotion] || 0;
      if (emotion === 'sadness') score = Math.max(score, vec.grief || 0, vec.numbness || 0);
      if (emotion === 'fear') score = Math.max(score, vec.anxiety || 0);
      if (emotion === 'guilt') score = Math.max(score, vec.shame || 0);
    }
    const text = (m.title || '') + ' ' + (m.completed_sentence || '');
    if (text.toLowerCase().includes(emotion)) score += 0.3;
    return { memory: m, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  const matched = scored.slice(0, 3).map(s => s.memory);
  if (matched.length === 0 && memories.length > 0) {
    // 언어 풀 안의 점수 0 기억에서 랜덤. 풀이 비면 그대로 비움(교차언어 폴백 금지).
    const shuffled = memories.slice().sort(() => Math.random() - 0.5);
    matched.push(...shuffled.slice(0, Math.min(3, memories.length)));
  }
  _showFinderResults(matched, lang);
}

function _isKoreanInput(text) {
  return /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(text);
}

function _isMemoryKorean(m) {
  const text = (m.title || '') + (m.completed_sentence || '');
  return /[가-힣]/.test(text);
}

// V2-13 (γ-full): 매칭 풀 자리에 *박은 메모리 제외*. 풀 비면 (다 박음) 디폴트 풀 박음.
function _excludePlayedMemories(memories) {
  try {
    const playedIds = new Set(
      Object.keys(localStorage)
        .filter(k => k.startsWith('tem_first_play:'))
        .map(k => k.slice('tem_first_play:'.length))
    );
    if (playedIds.size === 0) return memories;
    const filtered = memories.filter(m => !playedIds.has(m.id));
    if (filtered.length > 0) return filtered;
    console.info('[archive:finder] 모든 메모리 박음 — 디폴트 풀 박음 (재만남 자리)');
    return memories;
  } catch (_) {
    return memories;
  }
}

function _finderMatchByText(query, lang) {
  _saveBaselineEmotion(_extractBaselineFromText(query));
  const all = appStore.getState().allMemoriesData || [];
  const lower = query.toLowerCase();
  // v2: 하드 필터 — 선택 언어(opening에서 전달)의 기억만. query의 한글 여부 무시.
  const preferKo = lang === 'ko';
  let memories = all.filter(m => _isMemoryKorean(m) === preferKo);
  memories = _excludePlayedMemories(memories);

  const emotionWords = {
    sadness: ['슬', '울', 'sad', 'cry', '아프', '힘들'],
    anger: ['화', '분노', 'angry', 'rage', '짜증'],
    fear: ['무서', '두려', 'fear', 'afraid', '불안'],
    longing: ['그리', '보고싶', 'miss', 'long', '그립'],
    guilt: ['미안', '죄책', 'sorry', 'guilt', '후회'],
    joy: ['기쁨', '행복', 'happy', 'joy', '좋'],
  };
  const scored = memories.map(m => {
    const text = ((m.title || '') + ' ' + (m.completed_sentence || '')).toLowerCase();
    let score = 0;
    lower.split(/\s+/).forEach(word => {
      if (word.length >= 2 && text.includes(word)) score += 1;
    });
    const vec = _getMemoryEmotionVector(m);
    for (const [emo, keywords] of Object.entries(emotionWords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        if (vec && vec[emo]) score += vec[emo];
        if (emo === 'sadness' && vec) score += (vec.grief || 0) * 0.8;
        if (emo === 'guilt' && vec) score += (vec.shame || 0) * 0.6;
      }
    }
    score += _motifBonus(lower, m);   // 작업 13: motif_tags 교차 보너스
    return { memory: m, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  const matched = scored.slice(0, 3).map(s => s.memory);
  if (matched.length === 0) {
    const pool = memories.length ? memories : all;
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    matched.push(...shuffled.slice(0, Math.min(3, shuffled.length)));
  }
  _showFinderResults(matched, lang);
}

// Lumen 오프닝 전용: finder UI 우회, top 1 기억만 선정. 점수 공식은 _finderMatch/_finderMatchByText와 동일.
function _pickTopMemoryForLumen(emotion, text, lang) {
  const all = appStore.getState().allMemoriesData || [];
  const preferKo = lang === 'ko';
  const memories = all.filter(m => _isMemoryKorean(m) === preferKo);
  if (memories.length === 0) return null;

  let scored;
  if (emotion) {
    _saveBaselineEmotion({ [emotion]: 1.0 });
    scored = memories.map(m => {
      let score = 0;
      const vec = _getMemoryEmotionVector(m);
      if (vec) {
        score = vec[emotion] || 0;
        if (emotion === 'sadness') score = Math.max(score, vec.grief || 0, vec.numbness || 0);
        if (emotion === 'fear') score = Math.max(score, vec.anxiety || 0);
        if (emotion === 'guilt') score = Math.max(score, vec.shame || 0);
      }
      const t = (m.title || '') + ' ' + (m.completed_sentence || '');
      if (t.toLowerCase().includes(emotion)) score += 0.3;
      return { memory: m, score };
    });
  } else {
    const query = text || '';
    _saveBaselineEmotion(_extractBaselineFromText(query));
    const lower = query.toLowerCase();
    const emotionWords = {
      sadness: ['슬', '울', 'sad', 'cry', '아프', '힘들'],
      anger: ['화', '분노', 'angry', 'rage', '짜증'],
      fear: ['무서', '두려', 'fear', 'afraid', '불안'],
      longing: ['그리', '보고싶', 'miss', 'long', '그립'],
      guilt: ['미안', '죄책', 'sorry', 'guilt', '후회'],
      joy: ['기쁨', '행복', 'happy', 'joy', '좋'],
    };
    scored = memories.map(m => {
      const t = ((m.title || '') + ' ' + (m.completed_sentence || '')).toLowerCase();
      let score = 0;
      lower.split(/\s+/).forEach(word => {
        if (word.length >= 2 && t.includes(word)) score += 1;
      });
      const vec = _getMemoryEmotionVector(m);
      for (const [emo, keywords] of Object.entries(emotionWords)) {
        if (keywords.some(kw => lower.includes(kw))) {
          if (vec && vec[emo]) score += vec[emo];
          if (emo === 'sadness' && vec) score += (vec.grief || 0) * 0.8;
          if (emo === 'guilt' && vec) score += (vec.shame || 0) * 0.6;
        }
      }
      score += _motifBonus(lower, m);   // 작업 13: motif_tags 교차 보너스
      return { memory: m, score };
    });
  }

  const positive = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  if (positive.length > 0) return positive[0].memory;
  // fallback: 언어풀 랜덤 1
  return memories[Math.floor(Math.random() * memories.length)];
}

let _finderFloatId = null;
let _finderWords = [];

// v2: ASCII door (closed, doorPhase 0 스타일). confession.js buildDoor 로직 축소.
// 18 cols × 24 rows. 내부 문 패널 12×20 중앙 배치.
function _buildAsciiDoorClosed() {
  const W = 18, H = 24;
  const cx = W >> 1, cy = H >> 1, dw = 12, dh = 20;
  const dl = cx - (dw >> 1), dr = cx + (dw >> 1);
  const dt = cy - (dh >> 1), db = cy + (dh >> 1);
  const g = Array.from({ length: H }, () => Array(W).fill(' '));

  // 프레임 세로
  for (let y = dt - 1; y <= db + 1; y++) {
    if (y >= 0 && y < H) {
      if (dl - 1 >= 0) g[y][dl - 1] = '║';
      if (dr + 1 < W) g[y][dr + 1] = '║';
    }
  }
  // 프레임 가로
  for (let x = dl - 1; x <= dr + 1; x++) {
    if (x >= 0 && x < W) {
      if (dt - 1 >= 0) g[dt - 1][x] = '═';
      if (db + 1 < H) g[db + 1][x] = '═';
    }
  }
  // 모서리
  if (dt - 1 >= 0 && dl - 1 >= 0) g[dt - 1][dl - 1] = '╔';
  if (dt - 1 >= 0 && dr + 1 < W) g[dt - 1][dr + 1] = '╗';
  if (db + 1 < H && dl - 1 >= 0) g[db + 1][dl - 1] = '╚';
  if (db + 1 < H && dr + 1 < W) g[db + 1][dr + 1] = '╝';

  // 문 페이스 (closed → vw = dw)
  const vw = dw;
  for (let y = dt; y <= db; y++) {
    for (let i = 0; i < vw; i++) {
      const x = dl + i;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
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
    // 손잡이
    const kx = dl + vw - 3;
    if (kx >= 0 && kx < W && y === cy) g[y][kx] = '◉';
  }

  return g.map(row => row.join('')).join('\n');
}

function _showFinderResults(matched, lang) {
  const questionPhase = document.getElementById('finderQuestionPhase');
  const resultPhase = document.getElementById('finderResultPhase');
  if (!resultPhase) return;

  // Stop any previous float animation
  if (_finderFloatId) { cancelAnimationFrame(_finderFloatId); _finderFloatId = null; }
  _finderWords = [];

  // Fade out question
  if (questionPhase) {
    questionPhase.style.transition = 'opacity 0.8s ease';
    questionPhase.style.opacity = '0';
    setTimeout(() => {
      questionPhase.style.display = 'none';
      // 스레드 캔버스 RAF 정리 (페이드 완료 후)
      const threadCv = document.getElementById('finderThreadCanvas');
      if (threadCv && typeof threadCv._cleanup === 'function') threadCv._cleanup();
    }, 800);
  }

  // Build floating monologue results
  setTimeout(() => {
    resultPhase.style.display = 'block';
    resultPhase.style.opacity = '0';
    resultPhase.style.transition = 'opacity 1s ease';
    resultPhase.style.position = 'relative';
    resultPhase.style.width = '100%';
    resultPhase.style.height = '100%';
    resultPhase.style.minHeight = '60vh';

    const leadText = lang === 'en' ? 'The memories that surface...' : '떠오르는 기억들...';
    // v2 Phase 1: 3 문 (정적 박스). 회전/ASCII 애니는 Phase 2.
    resultPhase.innerHTML = `
      <div style="position:absolute;top:8%;left:50%;transform:translateX(-50%);font-family:'Cormorant Garamond',serif;font-size:13px;color:rgba(196,168,130,0.35);letter-spacing:3px;pointer-events:none;z-index:1;">${leadText}</div>
      <div id="finderDoorsRow" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;gap:72px;align-items:flex-end;"></div>
    `;
    const doorsRow = resultPhase.querySelector('#finderDoorsRow');

    matched.forEach((m, i) => {
      const sentence = m.completed_sentence || m.title || '...';

      const doorWrap = document.createElement('div');
      doorWrap.style.cssText = `
        position:relative;
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:18px;
        cursor:pointer;
        opacity:0;
        transition:opacity 1.2s ease;
      `;

      const monologueEl = document.createElement('div');
      monologueEl.style.cssText = `
        font-family:'Cormorant Garamond',serif;
        font-style:italic;
        font-size:14px;
        color:rgba(196,168,130,0.92);
        max-width:220px;
        min-height:3.2em;
        text-align:center;
        line-height:1.7;
        letter-spacing:0.5px;
        opacity:0;
        transform:translateY(6px);
        transition:opacity 0.5s ease, transform 0.5s ease;
        pointer-events:none;
      `;
      monologueEl.textContent = sentence;
      doorWrap.appendChild(monologueEl);

      const doorEl = document.createElement('pre');
      doorEl.textContent = _buildAsciiDoorClosed();
      doorEl.style.cssText = `
        margin:0;
        font-family: 'SFMono-Regular', Menlo, 'Courier New', monospace;
        font-size:13px;
        line-height:1.1;
        color:rgba(196,168,130,0.48);
        white-space:pre;
        user-select:none;
        transition:color 0.5s ease, text-shadow 0.5s ease, transform 0.5s ease;
      `;
      doorWrap.appendChild(doorEl);

      doorWrap.addEventListener('mouseenter', () => {
        monologueEl.style.opacity = '1';
        monologueEl.style.transform = 'translateY(0)';
        doorEl.style.color = 'rgba(230,200,150,0.95)';
        doorEl.style.textShadow = '0 0 16px rgba(196,168,130,0.35)';
      });
      doorWrap.addEventListener('mouseleave', () => {
        monologueEl.style.opacity = '0';
        monologueEl.style.transform = 'translateY(6px)';
        doorEl.style.color = 'rgba(196,168,130,0.48)';
        doorEl.style.textShadow = 'none';
      });
      doorWrap.addEventListener('click', () => _navigateToPlayFromFinder(m));

      doorsRow.appendChild(doorWrap);

      // Staggered fade-in
      setTimeout(() => { doorWrap.style.opacity = '1'; }, 400 + i * 700);
    });

    requestAnimationFrame(() => { resultPhase.style.opacity = '1'; });
  }, 900);
}

function _navigateToPlayFromFinder(memory) {
  const lang = getCurrentLanguage();
  const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.hostname.endsWith('.local');
  const base = isLocal ? 'play-test.html' : '/play';
  try {
    sessionStorage.setItem('demoMemoryId', String(memory.id || ''));
    sessionStorage.setItem('tem_archive_memory_id', String(memory.id || ''));
    sessionStorage.setItem('tem_archive_lang', lang);
  } catch (_) {}
  window.location.href = `${base}?memory=${encodeURIComponent(memory.id)}&lang=${encodeURIComponent(lang)}`;
}
async function enterArchive(opts) { var fromDemo = opts && opts.fromDemo; const introScreen = document.getElementById('introScreen'); const archiveContainer = document.getElementById('archiveContainer'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } ['modeSelection', 'endScreen', 'liveContainer', 'sceneViewer'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); if (archiveContainer) { archiveContainer.classList.add('active'); archiveContainer.style.cssText = 'display:block !important;z-index:1900 !important' + (fromDemo ? ';visibility:hidden;opacity:0' : ''); }
  const entryEl = document.getElementById('archiveEntryContainer');
  const finderEl = document.getElementById('memoryFinderContainer');
  const memoryListEl = document.getElementById('memoryList');
  const archiveControlsEl = document.getElementById('archiveControls');
  const archiveHeaderEl = document.querySelector('.archive-header');
  if (entryEl) entryEl.style.display = 'none';
  if (finderEl) finderEl.style.display = 'none';
  if (memoryListEl) memoryListEl.style.display = 'grid';
  if (archiveControlsEl) archiveControlsEl.style.display = 'block';
  if (archiveHeaderEl) archiveHeaderEl.style.display = 'block';
  try {
    await loadMemoriesFromSupabase();
    sortMemories('all');
  } catch (e) {
    console.warn('[enterArchive] loadMemoriesFromSupabase failed:', e);
  }
  appStore.setState({ currentMode: 'archive' });
  stopArchiveWaveAnimation();
  const footer = document.querySelector('.footer');
  if (footer) footer.classList.add('visible');
  setTimeout(() => { showNpcDialogue(t('archive.enterNotice'), 6000, t('anotherme.label')); }, 600);
}
function filterByCategory(category, btnElement) {
    if (!category) return;
    const state = appStore.getState();
    appStore.setState({ currentCategory: category });
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    const updatedState = appStore.getState();
    uiManager.renderMemoryCards(
        updatedState.allMemoriesData,
        updatedState.currentCategory,
        updatedState.currentSort,
        selectMemory,
        filterMemories
    );
}
async function loadMemoriesFromSupabase() {
  const localFallback = (window.memoriesData || (typeof memoriesData !== 'undefined' ? memoriesData : []) || []).map(m => ({ ...m, live_session_id: null, is_live: false }));
  const LOCAL_CODES = ['E-001', 'E-002', 'E-003'];
  try {
    console.log('[loadMemoriesFromSupabase] Starting to load memories from Supabase');
    await waitForSupabaseClient(8000);
    const result = await networkService.fetchMemories();
    console.log('[loadMemoriesFromSupabase] fetchMemories result:', result);
    if (!result.ok) {
      console.error('[loadMemoriesFromSupabase] Query failed', result.error);
      appStore.setState({ allMemoriesData: localFallback.length ? localFallback : [] });
      if (localFallback.length) sortMemories(appStore.getState().currentSort);
      return;
    }
    if (!result.data || result.data.length === 0) {
      console.log('[loadMemoriesFromSupabase] No public memories in Supabase, using local data');
      appStore.setState({ allMemoriesData: localFallback });
      if (localFallback.length) sortMemories(appStore.getState().currentSort);
      return;
    }
    const fromSupabase = result.data;
    const localByCode = {};
    localFallback.forEach(m => { if (m.code) localByCode[m.code] = { ...m, live_session_id: null, is_live: false }; });
    const fromSupabaseOther = fromSupabase.filter(m => !LOCAL_CODES.includes(m.code));
    const merged = [
      ...LOCAL_CODES.map(code => localByCode[code]).filter(Boolean),
      ...fromSupabaseOther.map(m => ({ ...m, live_session_id: m.live_session_id || null, is_live: !!m.is_live }))
    ];
    console.log('[loadMemoriesFromSupabase] merged', merged.length, 'memories (local E-001/E-002/E-003 + Supabase others)');
    appStore.setState({ allMemoriesData: merged });
    const state = appStore.getState();
    sortMemories(state.currentSort);
  } catch (error) {
    console.error('[loadMemoriesFromSupabase] Error occurred', error);
    appStore.setState({ allMemoriesData: localFallback.length ? localFallback : [] });
    if (localFallback.length) sortMemories(appStore.getState().currentSort);
  }
}
function filterMemories() { const searchValue = document.getElementById('archiveSearch').value.trim(); const searchUpper = searchValue.toUpperCase(); const searchLower = searchValue.toLowerCase(); const cards = document.querySelectorAll('.memory-card'); const state = appStore.getState(); cards.forEach(card => { const code = (card.getAttribute('data-code') || '').toUpperCase(); const title = card.getAttribute('data-title') || ''; const category = card.getAttribute('data-category') || 'archive'; let shouldShow = true; if (state.currentCategory === 'story' && category !== 'archive') shouldShow = false; else if (state.currentCategory === 'archive' && category !== 'archive') shouldShow = false; const matchesSearch = searchValue === '' || title.toLowerCase().includes(searchLower) || code.includes(searchUpper); if (shouldShow && matchesSearch) { card.classList.remove('hidden'); card.style.display = 'block'; if (searchValue !== '' && (code === searchUpper || title.toLowerCase() === searchLower)) { setTimeout(() => { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.style.transform = 'scale(1.05)'; setTimeout(() => card.style.transform = '', 500) }, 100) } } else { card.classList.add('hidden'); card.style.display = 'none' } }) }
function sortMemories(sortType, btnElement) {
    appStore.setState({ currentSort: sortType });
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    const state = appStore.getState();
    uiManager.renderMemoryCards(
        state.allMemoriesData,
        state.currentCategory,
        state.currentSort,
        selectMemory,
        filterMemories
    );
}
// selectRole, generateSessionCode, copySessionCode, joinSession → app/live.js

// cosineSimilarity is imported from /js/shared/math.js
function updateAlignmentDisplay() {
    const state = appStore.getState();
    uiManager.updateAlignmentDisplay(state.currentAlignment);
}
function renderArchiveEmotionWave(emotionVector) {
    console.log('[renderArchiveEmotionWave] called, emotionVector:', emotionVector);
    if (!emotionVector) {
        console.warn('[renderArchiveEmotionWave] no emotionVector');
        return;
    }
    const canvas = document.getElementById('waveCanvas');
    if (!canvas) {
        console.warn('[renderArchiveEmotionWave] waveCanvas not found');
        return;
    }
    console.log('[renderArchiveEmotionWave] waveCanvas found, before emotionVectorToWaveStyle');

    // Calculation done here (Visualizer receives numbers only)
    const waveData = emotionVectorToWaveStyle(emotionVector);
    console.log('[renderArchiveEmotionWave] emotionVectorToWaveStyle result:', waveData);
    const time = Date.now() * 0.001;

    // Pass calculated data to Visualizer
    console.log('[renderArchiveEmotionWave] before visualizer.renderArchiveEmotionWave');
    visualizer.renderArchiveEmotionWave(canvas, waveData, time);
    console.log('[renderArchiveEmotionWave] after visualizer.renderArchiveEmotionWave');
    console.log('Archive emotion wave rendered:', waveData);
}

// Archive wave animation management
let archiveWaveAnimationId = null;
let archiveWaveTime = 0;
let currentArchiveWaveStyle = null;
let currentArchiveEmotionVector = null;

// ── 파동 전환 (transition) 상태 ──
let _waveTx = null; // { from: waveStyle, to: waveStyle, progress: 0, duration: 1.8 }

function _lerpColor(a, b, t) {
    return {
        r: Math.round(a.r + (b.r - a.r) * t),
        g: Math.round(a.g + (b.g - a.g) * t),
        b: Math.round(a.b + (b.b - a.b) * t),
    };
}
function _lerpWaveStyle(from, to, t) {
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    return {
        color: _lerpColor(from.color, to.color, ease),
        speed: from.speed + (to.speed - from.speed) * ease,
        amplitude: from.amplitude + (to.amplitude - from.amplitude) * ease,
        frequency: from.frequency + (to.frequency - from.frequency) * ease,
        chaos: from.chaos + (to.chaos - from.chaos) * ease,
    };
}

/**
 * 유령 요동 (ghost tremor) — 전환 구간에서 파동이 위아래로 요동치는 효과
 * progress 0→1 동안: 초반에 크게 흔들리고 점차 잦아듦
 */
function _ghostTremor(x, t, progress) {
    const intensity = Math.pow(1 - progress, 2.5);        // 전환 끝으로 갈수록 감쇠
    const tremAmp = intensity * 14;                        // 최대 ±14px 진폭
    const fast = Math.sin(x * 0.06 + t * 8) * tremAmp;   // 빠른 고주파 요동
    const slow = Math.sin(x * 0.02 - t * 3.5) * tremAmp * 0.6; // 느린 저주파 흔들림
    return fast + slow;
}

/**
 * Archive wave animation start — 전환 보간 + 유령 요동 지원
 * @param {Object} emotionVector - user emotion 벡터
 */
function startArchiveWaveAnimation(emotionVector) {
    console.log('[startArchiveWaveAnimation] called, emotionVector:', emotionVector);
    if (!emotionVector) {
        console.warn('[startArchiveWaveAnimation] No emotionVector');
        return;
    }

    const canvas = document.getElementById('archiveWaveCanvas');
    if (!canvas) {
        console.warn('[startArchiveWaveAnimation] archiveWaveCanvas not found');
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;

    const newWaveStyle = emotionVectorToWaveStyle(emotionVector);

    // ── 전환 설정: 이전 스타일이 있으면 보간, 없으면 즉시 ──
    const prevStyle = currentArchiveWaveStyle;
    if (prevStyle && archiveWaveAnimationId) {
        // 전환 중 재호출: 현재 보간 중간값을 from으로 사용 → 점프 방지
        let fromStyle;
        if (_waveTx && _waveTx.progress < 1) {
            fromStyle = _lerpWaveStyle(_waveTx.from, _waveTx.to, _waveTx.progress);
        } else {
            fromStyle = { ...prevStyle };
        }
        // 타이핑(빠른 연속 호출) vs 씬 전환(느린 호출) 구분
        const isFastInput = _waveTx && _waveTx.progress < 0.3;
        const duration = isFastInput ? 0.6 : 1.8;
        _waveTx = { from: fromStyle, to: newWaveStyle, progress: 0, duration };
        currentArchiveWaveStyle = newWaveStyle;
        currentArchiveEmotionVector = emotionVector;
        return; // 기존 rAF 루프가 _waveTx를 읽어서 보간 처리
    }

    // ── 최초 시작 (이전 파동 없음) ──
    stopArchiveWaveAnimation();

    currentArchiveWaveStyle = newWaveStyle;
    currentArchiveEmotionVector = emotionVector;
    archiveWaveTime = 0;
    _waveTx = null;

    _startUnifiedWaveLoop();
}

/**
 * 통합 파동 rAF 루프 — 모든 파동 상태(회색/감정/전환)를 하나의 루프에서 처리
 */
function _startUnifiedWaveLoop() {
    const canvas = document.getElementById('archiveWaveCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;

    // 캔버스 초기화 (아직 안 된 경우)
    if (canvas.width !== canvas.offsetWidth * 2) {
        canvas.width = canvas.offsetWidth * 2;
        canvas.height = canvas.offsetHeight * 2;
        ctx.scale(2, 2);
    }

    function animate() {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const centerY = height / 2;
        const maxAmplitude = Math.min(height * 0.4, 20);
        const t = archiveWaveTime;

        // ── 전환 보간 처리 ──
        let ws = currentArchiveWaveStyle || _GRAY_WAVE_STYLE;
        let txProgress = -1; // -1 = 전환 아님
        let txFrom = null;   // 유령 잔상용
        if (_waveTx) {
            _waveTx.progress = Math.min(1, _waveTx.progress + 0.016 / _waveTx.duration);
            txProgress = _waveTx.progress;
            txFrom = _waveTx.from;
            ws = _lerpWaveStyle(_waveTx.from, _waveTx.to, txProgress);
            if (_waveTx.progress >= 1) _waveTx = null; // 전환 완료
        }

        const amplitude = Math.min(ws.amplitude || 18, maxAmplitude);
        const speed = 0.02 + (ws.speed - 0.3) * 0.015;

        ctx.clearRect(0, 0, width, height);

        // ── 유령 잔상 (전환 중에만): 이전 파동이 흐릿하게 남아 사라짐 ──
        if (txProgress >= 0 && txProgress < 1 && txFrom) {
            const ghostOpacity = 0.35 * Math.pow(1 - txProgress, 2);
            const gc = txFrom.color || { r: 180, g: 180, b: 190 };
            const ghostAmp = Math.min(txFrom.amplitude || 12, maxAmplitude);
            ctx.strokeStyle = `rgba(${gc.r},${gc.g},${gc.b},${ghostOpacity.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 0; x <= width; x += 2) {
                const phase = (x / width) * Math.PI * 2 + t * 0.02;
                const y = centerY
                    + Math.sin(phase) * ghostAmp
                    + Math.sin(phase * 2.3 + t * 0.5) * (ghostAmp * 0.4)
                    + _ghostTremor(x, t, txProgress) * 0.5;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // ── 메인 파동 ──
        const c = ws.color || { r: 196, g: 168, b: 130 };
        const mainOpacity = txProgress >= 0 ? 0.3 + 0.3 * txProgress : 0.6;
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${mainOpacity.toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
            const phase = (x / width) * Math.PI * 2 + t * speed;
            let y = centerY
                + Math.sin(phase) * amplitude
                + Math.sin(phase * 2.3 + t * 0.5) * (amplitude * 0.4);
            if (txProgress >= 0 && txProgress < 1) {
                y += _ghostTremor(x, t, txProgress);
            }
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        archiveWaveTime += 0.016;
        archiveWaveAnimationId = requestAnimationFrame(animate);
    }
    animate();
}

/**
 * Archive wave animation 중지
 */
function stopArchiveWaveAnimation() {
    if (archiveWaveAnimationId) {
        cancelAnimationFrame(archiveWaveAnimationId);
        archiveWaveAnimationId = null;
    }
    archiveWaveTime = 0;
    currentArchiveWaveStyle = null;
    currentArchiveEmotionVector = null;
    _waveTx = null;
    console.log('[stopArchiveWaveAnimation] Wave animation stopped');
}

/**
 * Archive wave data screen rendering (animation 버전)
 * @param {Object} emotionVector - user emotion 벡터
 */
function renderArchiveWaveData(emotionVector) {
 // animation으 start
    startArchiveWaveAnimation(emotionVector);
}

/** 회색 기본 감정 벡터 (파동 없는 정적 상태) */
const _GRAY_EMOTION = { fear: 0, sadness: 0.05, anger: 0, joy: 0, longing: 0, guilt: 0 };
const _GRAY_WAVE_STYLE = {
    color: { r: 180, g: 180, b: 190 },
    speed: 0.3,
    amplitude: 3,
    frequency: 0.008,
    chaos: 0,
};

/**
 * 첫 번째 scene용 회색 wave animation
 * 통합 animate 루프를 사용해서 → 감정 파동 전환 시 보간 자동 적용
 */
function renderDefaultGrayLine() {
    const state = appStore.getState();
    if (state.waveAnimationId) {
        cancelAnimationFrame(state.waveAnimationId);
        appStore.setState({ waveAnimationId: null });
    }
    if (typeof window._waveAnimationId !== 'undefined' && window._waveAnimationId) {
        cancelAnimationFrame(window._waveAnimationId);
        window._waveAnimationId = null;
    }

    // 기존 감정 파동이 돌고 있으면 회색으로 전환 (보간 적용됨)
    if (currentArchiveWaveStyle && archiveWaveAnimationId) {
        _waveTx = { from: { ...currentArchiveWaveStyle }, to: _GRAY_WAVE_STYLE, progress: 0, duration: 1.2 };
        currentArchiveWaveStyle = _GRAY_WAVE_STYLE;
        currentArchiveEmotionVector = _GRAY_EMOTION;
        return;
    }

    // 최초 시작: 통합 루프로 회색 파동 시작
    stopArchiveWaveAnimation();
    currentArchiveWaveStyle = _GRAY_WAVE_STYLE;
    currentArchiveEmotionVector = _GRAY_EMOTION;
    _startUnifiedWaveLoop();
}

async function saveArchiveEmotionToPlays(userEmotionVector, userReason, scene, currentData, sceneAlignment, reasonVector = null, mismatchType = null) {
    try {
        const state = appStore.getState();
        const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);
        if (!memoryId) {
            console.warn('memory_id를 찾을 수 없어 plays 테이블에 저장하지 않습니다');
            return;
        }
        const sceneId = scene.id;
        if (!sceneId) {
            console.warn('scene_id를 찾을 수 없어 plays 테이블에 저장하지 않습니다');
            return;
        }
        const sceneText = scene.text || '';
        const voidLevel = scene.voidInfo?.voidLevel || 'low';
        const waveData = computeArchiveWaveData(userEmotionVector, sceneText.length, voidLevel);
        
 // wave data save (next scene 서 display 위해)
        const currentSceneIndex = state.currentScene || 0;
        
 // window.archiveWaveData current scene wave data save
        if (!window.archiveWaveData) {
            window.archiveWaveData = [];
        }
        window.archiveWaveData[currentSceneIndex] = {
            emotionVector: userEmotionVector,
            waveStyle: emotionVectorToWaveStyle(userEmotionVector),
            timestamp: Date.now()
        };
        console.log('[saveArchiveEmotionToPlays] Wave data saved, sceneIndex:', currentSceneIndex, 'waveData:', window.archiveWaveData[currentSceneIndex]);
        
        const insertData = {
            memory_id: memoryId,
            scene_id: sceneId,
            user_emotion: userEmotionVector,
            user_reason: userReason,
            wave_data: waveData,
            layer_id: 0,
            alignment: sceneAlignment !== undefined ? sceneAlignment : null,
            reason_vector: reasonVector,
            mismatch_type: mismatchType,
            user_id: state.currentUser?.id || null
        };
        console.log('Archive plays Save attempt:', insertData);
 // void crack 사운드
        const soundscape = getSoundscape();
        if (mismatchType === 'void_mismatch' && soundscape) {
            soundscape.onVoidCrack();
        }
        const result = await networkService.savePlay(insertData);
        if (!result.ok) {
            console.error('Archive plays Save failed:', result.error);
            return;
        }
        console.log('Archive plays Save success:', result.data);

 // 희석 시스템: play save 후 memory layers/dilution update
        try {
            const memId = insertData.memory_id;
            if (memId) {
                const countResult = await networkService.getPlayCount(memId);
                const playCount = countResult.ok ? (countResult.data || 0) : 0;
 // dilution = original 비중 (100% → experiencer 늘수록 감소)
 // 0명: 100, 10명: ~50, 30명: ~25, 100명: ~9
                const newDilution = Math.round(100 / (1 + playCount * 0.1));
                await networkService.updateMemoryDilution(memId, playCount, newDilution);
                console.log(`[Dilution] memory ${memId}: layers=${playCount}, dilution=${newDilution}%`);
            }
        } catch (dilutionError) {
            console.warn('[Dilution] Update failed (non-fatal):', dilutionError);
        }
    } catch (e) {
        console.error('saveArchiveEmotionToPlays error:', e);
    }
}
function selectMemory(index) {
        const state = appStore.getState();
  const all = state.allMemoriesData || [];
  const memory = all[index];
  if (!memory || !memory.id) {
    console.warn('[Archive] memory not found for index:', index);
            return;
        }
  const lang = getCurrentLanguage();

  // V2-13 re-entry detection. localStorage row exists → second play.
  let _isReplay = false;
  try {
    _isReplay = !!localStorage.getItem('tem_first_play:' + memory.id);
  } catch (_) {}

  try {
    sessionStorage.setItem('demoMemoryId', String(memory.id));
    sessionStorage.setItem('tem_archive_memory_id', String(memory.id));
    sessionStorage.setItem('tem_archive_lang', lang);
    if (_isReplay) sessionStorage.setItem('tem_replay', '1');
    else sessionStorage.removeItem('tem_replay');
  } catch (_) {}

  const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const base = isLocal ? 'play-test.html' : '/play';
  const url = `${base}?memory=${encodeURIComponent(memory.id)}&lang=${encodeURIComponent(lang)}${_isReplay ? '&replay=1' : ''}`;

  if (_isReplay) {
    const msg = (lang === 'ko') ? '뭔가 달라졌어.' : 'Something has shifted.';
    try { showNpcDialogue(msg, 2200); } catch (_) {}
    setTimeout(() => { window.location.href = url; }, 1800);
    return;
  }
  window.location.href = url;
}
function showConsentSequence(memoryIndex) {}
function showWordSentenceSequence(memoryIndex) {}
function startArchivePlay(memoryIndex) {}
function backToList() { if (typeof destroyFloatingAnchor === 'function') destroyFloatingAnchor(); const _sc = getSoundscape(); if (_sc) _sc.stop(); window._strataCompletedScenes = []; if (window.strataSection) window.strataSection.init(); stopWaveAnimation() }
async function loadStrataLayers(memoryId) {}

function deriveEffectType(alignment) {
    if (alignment >= 0.8) return 'smooth';
    if (alignment >= 0.6) return 'layer';
    if (alignment >= 0.4) return 'deposit';
    if (alignment >= 0.2) return 'erosion';
    return 'fade';
}

// ─────────────────────────────────────────────────────────────
// Scene-play region removed (R5-5, 2026-07-14).
// Playing a memory now happens in play-test.html — selectMemory() redirects there.
// The 700 lines that used to live here (initProgressDots / goToScene / renderScene /
// renderChoices / renderArchiveFreeInput / makeChoice / proceedToNextScene /
// collectEmotionInput / runEngineStep / applyEngineResult / updateUIAfterSubmit /
// persistAfterSubmit / proceedToNextSceneOrEnd and their helpers) rendered into DOM
// that no longer exists in index.html (#sceneViewer / #sceneText / #choicesContainer /
// #emotionInput / #waveCanvas — all 0 occurrences), and nothing outside this file
// called into them. See docs/점검/R5_수리보고-260714.md.
// ─────────────────────────────────────────────────────────────
/**
 * Applies the contamination delta at the end of a run and persists cont_* columns.
 *
 * NOTE (R5-5): its callers lived in the scene-play region removed above, so this and
 * _generateStageTextsInBackground below are currently caller-less. They are the only
 * implementation of the stage-text auto-generation pipeline, which is R2's (contamination)
 * territory — deliberately left in place rather than deleted. R2 decides: port to
 * play-test.html or retire.
 */
async function _applyContaminationAtEnd(state) {
    const engineResult = state.lastEngineResult;
    // currentMemory is an index; get the actual memory object
    const memoryObj = state.allMemoriesData?.[state.currentMemory]
        || state.currentStoryData;
    const memoryId = memoryObj?.id || state.currentStoryData?.id;
    if (!engineResult || !memoryId) return;

    // ContaminationTracker expects flat fields (MVP v3 format)
    const userEmotion = state.userEmotionTrajectory?.slice(-1)[0] || {};
    let uV = 0, uA = 0, uD = 0;
    if (userEmotion && Object.values(userEmotion).some(v => v > 0)) {
        try {
            const vad = projectEmotionToVAD(userEmotion);
            uV = vad?.v || 0; uA = vad?.a || 0; uD = vad?.d || 0;
        } catch (_) {}
    }

    const contInput = {
        alignment:          engineResult.alignment_score ?? 0,
        level:              engineResult.debug?.level    ?? 0,
        shape:              engineResult.debug?.shape    ?? 0,
        shape_active:       engineResult.debug?.shape_active ?? false,
        transition_pattern: engineResult.transition_pattern ?? 'bridge',
        mismatch_type:      engineResult.mismatch_type  ?? 'none',
        fixation_level:     engineResult.debug?.fixation_level ?? 0,
        user_valence:       uV,
        user_arousal:       uA,
        user_dominance:     uD,
    };

    // Seed existing state from DB record (falls back to zeros if columns don't exist yet)
    const existingContState = {
        cont_drift:          memoryObj?.cont_drift          || 0,
        cont_fixation:       memoryObj?.cont_fixation       || 0,
        cont_stage:          memoryObj?.cont_stage          || 'stable',
        cont_depth:          memoryObj?.cont_depth          || 0,
        lifetime_drift_sum:  memoryObj?.lifetime_drift_sum  || 0,
        lifetime_fix_sum:    memoryObj?.lifetime_fix_sum    || 0,
        drift_dir_v:         memoryObj?.drift_dir_v         || 0,
        drift_dir_a:         memoryObj?.drift_dir_a         || 0,
        drift_dir_d:         memoryObj?.drift_dir_d         || 0,
        lifetime_dir_v_sum:  memoryObj?.lifetime_dir_v_sum  || 0,
        lifetime_dir_a_sum:  memoryObj?.lifetime_dir_a_sum  || 0,
        lifetime_dir_d_sum:  memoryObj?.lifetime_dir_d_sum  || 0,
        cont_last_alignment: memoryObj?.cont_last_alignment || 0,
        cont_last_level:     memoryObj?.cont_last_level     || 0,
        cont_last_shape:     memoryObj?.cont_last_shape     || 1,
        cont_last_pattern:   memoryObj?.cont_last_pattern   || 'bridge',
        cont_last_mismatch:  memoryObj?.cont_last_mismatch  || 'none',
        cont_last_updated:   memoryObj?.cont_last_updated   || null,
        // 3-axis vector
        cont_divergence:     memoryObj?.cont_divergence     || 0,
        cont_convergence:    memoryObj?.cont_convergence    || 0,
        cont_heterogeneity:  memoryObj?.cont_heterogeneity  || 0,
        _cont_align_mean:    memoryObj?._cont_align_mean    || 0,
        _cont_align_m2:      memoryObj?._cont_align_m2      || 0,
        cont_stage_1:        memoryObj?.cont_stage_1        || 0,
        cont_stage_2:        memoryObj?.cont_stage_2        || 0,
        cont_stage_3:        memoryObj?.cont_stage_3        || 0,
    };

    const nextContState = updateContamination(existingContState, contInput);
    console.log('[ContaminationTracker] session end →', nextContState);

    const result = await networkService.updateMemoryContamination(memoryId, nextContState);
    if (!result.ok) {
        console.warn('[ContaminationTracker] persist 실패:', result.error);
    } else {
        console.log('[ContaminationTracker] persisted to memory', memoryId);
    }

    // Generate contaminated stage texts for next players (fire-and-forget)
    _generateStageTextsInBackground(memoryId, nextContState);
}

/**
 * After contamination update, regenerate stage texts for all scenes of this memory.
 * Calls the contaminate-text Edge Function and stores results in DB.
 * Runs in background — does not block the player's flow.
 */
async function _generateStageTextsInBackground(memoryId, contState) {
    try {
        const pres = getPresentationState(contState);

        // Only generate if contamination is active
        if (pres.stage === 'stable' || pres.intensity < 0.01) return;

        const client = getSupabaseClient();
        if (!client) return;

        // Fetch scenes for this memory
        const { data: scenes, error: sceneErr } = await client
            .from('scenes')
            .select('id, text, text_stage_1, text_stage_2, text_stage_3')
            .eq('memory_id', memoryId)
            .order('scene_order');

        if (sceneErr || !scenes?.length) return;

        const token = await getAccessToken().catch(() => null) || SUPABASE_ANON_KEY;

        for (const scene of scenes) {
            if (!scene.text) continue;

            // Skip if this stage text already exists
            if (pres.stage === 'biased_inclination' && pres.band !== 'strong' && scene.text_stage_1) continue;
            if (pres.stage === 'biased_inclination' && pres.band === 'strong' && scene.text_stage_2) continue;
            if (pres.stage === 'hypercompletion' && pres.band !== 'strong' && scene.text_stage_2) continue;
            if (pres.stage === 'hypercompletion' && pres.band === 'strong' && scene.text_stage_3) continue;

            try {
                const res = await fetch(`${SUPABASE_URL}/functions/v1/contaminate-text`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        text: scene.text,
                        contamination: {
                            cont_stage: contState.cont_stage,
                            cont_drift: contState.cont_drift,
                            cont_fixation: contState.cont_fixation,
                            drift_dir_v: contState.drift_dir_v,
                            drift_dir_a: contState.drift_dir_a,
                            drift_dir_d: contState.drift_dir_d,
                            band: pres.band,
                        },
                    }),
                });

                if (!res.ok) {
                    console.warn('[StageText] Edge Function error for scene', scene.id, res.status);
                    continue;
                }

                const result = await res.json();
                const updateFields = {};
                if (result.text_stage_1 && !scene.text_stage_1) updateFields.text_stage_1 = result.text_stage_1;
                if (result.text_stage_2 && !scene.text_stage_2) updateFields.text_stage_2 = result.text_stage_2;
                if (result.text_stage_3 && !scene.text_stage_3) updateFields.text_stage_3 = result.text_stage_3;

                if (Object.keys(updateFields).length > 0) {
                    await client.from('scenes').update(updateFields).eq('id', scene.id);
                    console.log('[StageText] generated for scene', scene.id, Object.keys(updateFields));
                }
            } catch (e) {
                console.warn('[StageText] generation failed for scene', scene.id, e.message);
            }
        }
        console.log('[StageText] background generation complete for memory', memoryId);
    } catch (e) {
        console.warn('[StageText] background generation error:', e.message);
    }
}

// ─────────────────────────────────────
// === Exports ===
// ─────────────────────────────────────

export {
    // Entry
    enterPlayIntro,
    enterArchive,

    // Loading / Filtering / Sorting
    loadMemoriesFromSupabase,
    filterByCategory,
    filterMemories,
    sortMemories,

    // Display
    updateAlignmentDisplay,
    renderArchiveEmotionWave,
    startArchiveWaveAnimation,
    stopArchiveWaveAnimation,
    renderArchiveWaveData,
    renderDefaultGrayLine,

    // Play tracking
    saveArchiveEmotionToPlays,

    // Memory selection & navigation
    selectMemory,
    backToList,

    // (Scene rendering / submitEmotion exports removed with the scene-play region — R5-5)

    // v2: 오프닝 시퀀스에서 호출
    _finderMatch,
    _finderMatchByText,
    _pickTopMemoryForLumen,
};

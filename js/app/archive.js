import { appStore } from './appStore.js';
import { showNotification, showNpcDialogue } from '../ui/notify.js';
import { showEndScreen } from './endScreen.js';
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
import { NPC_DIALOGUES, getRandomDialogue } from '../npc-dialogues.js';
import { t } from '../lib/i18n.js';
import {
    fetchMemories, fetchScenes, savePlay, saveNote, fetchNotes, activateMemoryIfFetus
} from '../shared/api.js';
import { playSound, stopSound, setVolume, SOUNDS } from '../shared/audio.js';
import {
    cosineSimilarity, normalizeVector, addVectors, getBucket, checkFixated,
    getDominantEmotion, normalizeAnchor, projectEmotionToVAD,
    emotionVectorToWaveStyle
} from '../shared/math.js';
import { ByeoriEngine, byeoriEngine } from '../core/ByeoriEngine.js';
import { sceneNavigator } from '../core/SceneNavigator.js';
import { updateContamination, createEmptyState, getPresentationState } from '../core/ContaminationTracker.js';
import { getContaminatedSceneText } from './contaminationPresenter.js';
import { getMonologue } from '../ui/contaminationMonologue.js';
import { networkService } from '../services/NetworkService.js';
import { uiManager } from '../ui/UIManager.js';
import { visualizer } from '../ui/Visualizer.js';
import { computeArchiveWaveData } from './live.js';

async function enterPlayIntro(opts) { var fromDemo = opts && opts.fromDemo; const introScreen = document.getElementById('introScreen'); const archiveContainer = document.getElementById('archiveContainer'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } ['modeSelection', 'endScreen', 'liveContainer', 'sceneViewer'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); if (archiveContainer) { archiveContainer.classList.add('active'); archiveContainer.style.cssText = 'display:block !important;z-index:1900 !important' + (fromDemo ? ';visibility:hidden;opacity:0' : ''); }
  const entryEl = document.getElementById('archiveEntryContainer');
  const memoryListEl = document.getElementById('memoryList');
  const archiveControlsEl = document.getElementById('archiveControls');
  const archiveHeaderEl = document.querySelector('.archive-header');
  if (entryEl) entryEl.style.display = 'block';
  if (memoryListEl) memoryListEl.style.display = 'none';
  if (archiveControlsEl) archiveControlsEl.style.display = 'none';
  if (archiveHeaderEl) archiveHeaderEl.style.display = 'none';
  appStore.setState({ currentMode: 'play' });
  stopArchiveWaveAnimation();
  try {
    const mod = await import('./archiveEntry.js');
    if (mod && mod.initArchiveEntry) await mod.initArchiveEntry(entryEl);
  } catch (e) {
    console.error('[enterPlayIntro] archiveEntry init failed:', e);
  }
  const footer = document.querySelector('.footer');
  if (footer) footer.classList.add('visible') }
async function enterArchive(opts) { var fromDemo = opts && opts.fromDemo; const introScreen = document.getElementById('introScreen'); const archiveContainer = document.getElementById('archiveContainer'); if (introScreen) { introScreen.classList.add('hidden'); introScreen.style.cssText = 'display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;z-index:-1 !important' } ['modeSelection', 'endScreen', 'liveContainer', 'sceneViewer'].forEach(id => { const el = document.getElementById(id); if (el) { el.classList.remove('active'); el.style.display = 'none' } }); if (archiveContainer) { archiveContainer.classList.add('active'); archiveContainer.style.cssText = 'display:block !important;z-index:1900 !important' + (fromDemo ? ';visibility:hidden;opacity:0' : ''); }
  const entryEl = document.getElementById('archiveEntryContainer');
  const memoryListEl = document.getElementById('memoryList');
  const archiveControlsEl = document.getElementById('archiveControls');
  const archiveHeaderEl = document.querySelector('.archive-header');
  if (entryEl) entryEl.style.display = 'none';
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
  if (footer) footer.classList.add('visible') }
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

/**
 * Archive wave animation start
 * @param {Object} emotionVector - user emotion 벡터
 */
function startArchiveWaveAnimation(emotionVector) {
    console.log('[startArchiveWaveAnimation] called, emotionVector:', emotionVector);
    if (!emotionVector) {
        console.warn('[startArchiveWaveAnimation] No emotionVector');
        return;
    }
    
 // existing animation 중지
    stopArchiveWaveAnimation();
    
    const canvas = document.getElementById('archiveWaveCanvas');
    if (!canvas) {
        console.warn('[startArchiveWaveAnimation] archiveWaveCanvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
    
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    const width = canvas.width / 2;
    const height = canvas.height / 2;
    const centerY = height / 2;
    
    const waveStyle = emotionVectorToWaveStyle(emotionVector);
    const maxAmplitude = Math.min(height * 0.4, 20);
    const amplitude = Math.min(waveStyle.amplitude || 18, maxAmplitude);
    const freq = 0.015;
    const speed = 0.02;
    
    currentArchiveWaveStyle = waveStyle;
    currentArchiveEmotionVector = emotionVector;
    archiveWaveTime = 0;
    
    function animate() {
        const ctx = canvas.getContext('2d');
        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const centerY = height / 2;
        const t = archiveWaveTime;
        
        ctx.clearRect(0, 0, width, height);
        const c = waveStyle.color || { r: 196, g: 168, b: 130 };
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.6)`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
            const phase = (x / width) * Math.PI * 2 + t * speed;
            const y = centerY + Math.sin(phase) * amplitude + Math.sin(phase * 2.3 + t * 0.5) * (amplitude * 0.4);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
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

/**
 * 첫 번째 scene용 회색 wave animation
 */
function renderDefaultGrayLine() {
    const canvas = document.getElementById('archiveWaveCanvas');
    if (!canvas) return;
    
    stopArchiveWaveAnimation();
    
    const state = appStore.getState();
    if (state.waveAnimationId) {
        cancelAnimationFrame(state.waveAnimationId);
        appStore.setState({ waveAnimationId: null });
    }
    if (typeof window._waveAnimationId !== 'undefined' && window._waveAnimationId) {
        cancelAnimationFrame(window._waveAnimationId);
        window._waveAnimationId = null;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
    
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    const width = canvas.width / 2;
    const height = canvas.height / 2;
    const centerY = height / 2;
    let t = 0;
    
    function animateGray() {
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(180, 180, 190, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
            const y = centerY
                + Math.sin(x * 0.008 + t * 0.4) * 3
                + Math.sin(x * 0.015 + t * 0.25) * 1.5;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        t += 0.016;
        archiveWaveAnimationId = requestAnimationFrame(animateGray);
    }
    animateGray();
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
  const titleSrc = String(memory.title || memory.completed_sentence || '');
  const lang = /[가-힣]/.test(titleSrc) ? 'ko' : 'en';
  try {
    sessionStorage.setItem('demoMemoryId', String(memory.id));
    sessionStorage.setItem('tem_archive_memory_id', String(memory.id));
    sessionStorage.setItem('tem_archive_lang', lang);
  } catch (_) {}
  const isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const base = isLocal ? 'play-test.html' : '/play';
  window.location.href = `${base}?memory=${encodeURIComponent(memory.id)}&lang=${encodeURIComponent(lang)}`;
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

window._strataCompletedScenes = [];
function initProgressDots() { const currentData = appStore.getState().currentStoryData; const dotsContainer = document.getElementById('progressDots'); if (!dotsContainer) return; dotsContainer.innerHTML = ''; if (!currentData || !currentData.scenes) return; for (let i = 0; i < currentData.scenes.length; i++) { const dot = document.createElement('div'); dot.className = 'progress-dot' + (i === 0 ? ' active' : ''); dot.onclick = function () { goToScene(i) }; dotsContainer.appendChild(dot) } }
function goToScene(index) { const state = appStore.getState(); if (index <= state.currentScene) { appStore.setState({ currentScene: index }); renderScene() } }

function getMemorySoundMap(memory) {
    const raw = memory?.sound_map || memory?.soundMap || null;
    return {
        HIGH: raw?.HIGH || SOUNDS.rain,
        MID: raw?.MID || SOUNDS.ambience,
        LOW: raw?.LOW || SOUNDS.drone,
        FIXATED: raw?.FIXATED || SOUNDS.drone,
        IDLE: raw?.opening || SOUNDS.opening
    };
}

function ensureSoundscapeReady(memory) {
    const soundscape = getSoundscape();
    if (!soundscape || !memory) return;
    const memoryId = String(memory.id || '');
    if (!memoryId) return;
    if (window.__soundscapeMemoryId === memoryId) return;

    const map = getMemorySoundMap(memory);
    soundscape.stop();
    soundscape.init({ soundMap: map, volume: 0.35 });
    soundscape.start();
    window.__soundscapeMemoryId = memoryId;
}

// Archive demo: 3-scene transition map (used only when scenes.length === 3)
const SCENE_TRANSITION_MAP = {
    0: { echo_follow: 1, bridge: 1, contradiction: 2, displacement: 2, avoidance: 2, fixation: 0 },
    1: { echo_follow: 2, bridge: 2, contradiction: 0, displacement: 2, avoidance: 2, fixation: 1 },
    2: { _terminal: true }
};

function splitSentencesForScene(text) {
    return (text || '')
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean)
        .map(s => s.trim());
}

function buildArchiveSceneHTML(baseText, scene, visitCount) {
    const sentences = splitSentencesForScene(baseText);
    if (sentences.length === 0) return baseText || '';

    const rawEcho = scene.echoWords || scene.echo_words || [];
    const echoWords = Array.isArray(rawEcho)
        ? rawEcho.map(w => String(w).toLowerCase())
        : String(rawEcho).split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

    const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 3회차 이상(FIXATED): 핵심 단어 2–3개만 강조, 나머지 0.3
    if (visitCount >= 2) {
        const parts = [];
        for (let si = 0; si < sentences.length; si++) {
            const sent = sentences[si];
            const tokens = sent.split(/(\s+)/);
            let html = '';
            for (const token of tokens) {
                const clean = token.replace(/[.,!?…]+$/i, '').toLowerCase();
                const isFocus =
                    clean &&
                    echoWords.some(ew => clean === ew || clean.startsWith(ew) || ew.startsWith(clean));
                html += isFocus
                    ? `<span class="scene-text-word focus">${escape(token)}</span>`
                    : `<span class="scene-text-word fade">${escape(token)}</span>`;
            }
            parts.push(`<span class="scene-text-sentence">${html}</span>`);
        }
        return parts.join(' ');
    }

    // 2회차 방문: 마지막 문장만 선명, 나머지 0.6
    if (visitCount === 1) {
        return sentences.map((s, i) => {
            const isLast = i === sentences.length - 1;
            const cls = isLast ? 'scene-text-sentence focus' : 'scene-text-sentence fade';
            return `<span class="${cls}">${escape(s)}</span>`;
        }).join(' ');
    }

    // 첫 방문: 원문 그대로
    return escape(baseText || '');
}

function getArrivalTypingSpeed(pattern) {
    if (pattern === 'contradiction') return 50;
    if (pattern === 'avoidance') return 20;
    if (pattern === 'fixation') return 0;
    return 35;
}

function typeSceneText(el, text, speed, done) {
    if (!el) return;
    if (speed <= 0) {
        el.textContent = text || '';
        if (done) done();
        return;
    }
    let i = 0;
    el.textContent = '';
    function step() {
        if (i < text.length) {
            el.textContent += text[i++];
            setTimeout(step, speed);
        } else if (done) {
            done();
        }
    }
    step();
}

async function renderScene() { 
    console.log('[renderScene] start');
    try { 
        const currentData = appStore.getState().currentStoryData; 
        const state = appStore.getState(); 
        if (state.currentMode === 'archive') {
            ensureSoundscapeReady(currentData);
        }
        console.log('[renderScene] currentData:', currentData ? { id: currentData.id, title: currentData.title, scenesCount: currentData.scenes?.length } : null);
        console.log('[renderScene] state.currentScene:', state.currentScene);
        if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) { 
            console.error('[renderScene] Unable to load scene:', { 
                hasCurrentData: !!currentData, 
                hasScenes: !!(currentData && currentData.scenes), 
                scenesLength: currentData?.scenes?.length, 
                currentScene: state.currentScene 
            });
            showNotification(t('notify.scene.error')); 
            return; 
        } 
        const scene = currentData.scenes[state.currentScene]; 
        console.log('[renderScene] scene:', scene ? { id: scene.id, text: scene.text?.substring(0, 50) + '...', originalVector: scene.originalVector, original_emotion: scene.original_emotion } : null);
        if (!scene || !scene.text) { 
            console.error('[renderScene] Unable to load scene text:', { hasScene: !!scene, hasText: !!(scene && scene.text) });
            showNotification(t('notify.scene.text.error')); 
            return; 
        } 
        // Apply contamination: ContaminationTracker-driven text transformation (synchronous)
        const memoryObj = state.allMemoriesData?.[state.currentMemory] || state.currentStoryData;
        const { displayText: contaminatedText, pres: contPres } = getContaminatedSceneText(scene, memoryObj);

        const sceneTextEl = document.getElementById('sceneText');
        const baseText = contaminatedText || scene.text || '';
        const visitCount = state.fixationCounts && typeof state.currentScene === 'number'
            ? (state.fixationCounts[state.currentScene] || 0)
            : 0;
        const arrivalPattern = state.lastTransitionPattern || 'bridge';

        if (sceneTextEl) {
            // Contamination CSS class for visual styling
            sceneTextEl.dataset.contStage = contPres.stage;
            sceneTextEl.dataset.contBand  = contPres.band || 'none';
            sceneTextEl.setAttribute('data-arrival', arrivalPattern);
            const typingSpeed = getArrivalTypingSpeed(arrivalPattern);
            if (typingSpeed <= 0) {
                sceneTextEl.innerHTML = buildArchiveSceneHTML(baseText, scene, visitCount);
            } else {
                typeSceneText(sceneTextEl, baseText, typingSpeed, () => {
                    sceneTextEl.innerHTML = buildArchiveSceneHTML(baseText, scene, visitCount);
                });
            }
        }

        if (scene.echoWords) renderEchoLayer(scene.echoWords);
        const sceneMainEl = document.querySelector('.scene-main');
        if (sceneMainEl && typeof startFloatingAnchor === 'function') {
            const anchorKeyword = (scene.echoWords && scene.echoWords.length > 0) ? scene.echoWords[0] : null;
            const alignment = state.currentAlignment || 0.5;
            startFloatingAnchor(sceneMainEl, anchorKeyword, alignment);
        }

        if (state.currentMode === 'archive') {
            renderArchiveFreeInput(scene);
        } else if (scene.choices) {
            renderChoices(scene.choices);
        }

        const sceneCounterEl = document.getElementById('sceneCounter');
        if (sceneCounterEl) sceneCounterEl.textContent = (state.currentScene + 1) + '/' + currentData.scenes.length;
        const dots = document.querySelectorAll('#progressDots .progress-dot');
        dots.forEach((dot, i) => {
            dot.className = 'progress-dot';
            if (i < state.currentScene) dot.classList.add('visited');
            if (i === state.currentScene) dot.classList.add('active');
        });
        const alignmentValueEl = document.getElementById('alignmentValue');
        if (alignmentValueEl) alignmentValueEl.textContent = state.currentAlignment.toFixed(2);
        if (typeof updateFloatingAnchorAlignment === 'function') updateFloatingAnchorAlignment(state.currentAlignment);
        const alignmentFillEl = document.getElementById('alignmentFill');
        if (alignmentFillEl) alignmentFillEl.style.width = (state.currentAlignment * 100) + '%';

        // Contamination monologue layer (Presentation Spec §5 — 기억의 독백)
        // Seeded PRNG: same scene + same cont_depth = same trigger decision
        const lastMismatch = memoryObj?.cont_last_mismatch || 'none';
        const contDepth = memoryObj?.cont_depth || 0;
        const monologueText = getMonologue(contPres, lastMismatch, state.currentScene, contDepth);
        if (monologueText) {
            setTimeout(() => showNpcDialogue(monologueText, 5000), 1500);
        }

        // Contamination sound reaction
        if (contPres.stage !== 'stable') {
            getSoundscape()?.setContaminationStage(contPres.stage, contPres.band);
        }

        // Wave display: only process in archive mode
        if (state.currentMode === 'archive') {
            if (state.currentScene === 0) {
 // 첫 번째 scene: 회색 직선 display
                console.log('[renderScene] First scene, showing gray line');
                setTimeout(() => {
                    renderDefaultGrayLine();
                }, 300);
            } else if (state.currentScene > 0 && window.archiveWaveData) {
 // 두 번째 scene 후: 전 scene emotion wave display
                const previousSceneIndex = state.currentScene - 1;
                const previousWaveData = window.archiveWaveData[previousSceneIndex];
                if (previousWaveData && previousWaveData.emotionVector) {
                    console.log('[renderScene] Showing previous scene wave, previousSceneIndex:', previousSceneIndex);
                    setTimeout(() => {
                        renderArchiveWaveData(previousWaveData.emotionVector);
                    }, 300);
                } else {
 // 전 wave data 없으면 회색 직선
                    console.log('[renderScene] No previous scene wave data, showing gray line');
                    setTimeout(() => {
                        renderDefaultGrayLine();
                    }, 300);
                }
            } else {
 // wave data 없으면 회색 직선
                console.log('[renderScene] No wave data, showing gray line');
                setTimeout(() => {
                    renderDefaultGrayLine();
                }, 300);
            }
        } else {
 // archive mode 아니면 default wave start
            console.log('[renderScene] Not archive mode, starting default wave');
            if (typeof startBucketWaveAnimation === 'function') {
                startBucketWaveAnimation();
            } else {
                startWaveAnimation();
            }
        }
        if (state.currentMode === 'archive' && window.strataSection) {
            const prevScene = state.currentScene > 0 ? state.currentScene - 1 : -1;
            if (prevScene >= 0 && window._strataCompletedScenes && !window._strataCompletedScenes.some(c => c.sceneIndex === prevScene)) {
                const prevAlign = state.currentAlignment ?? 0.5;
                window._strataCompletedScenes.push({
                    sceneIndex: prevScene,
                    effectType: deriveEffectType(prevAlign),
                    strength: 1 - prevAlign,
                    color: window.strataSection.emotionVectorToRGB(
                        (window.archiveUserEmotions && window.archiveUserEmotions[prevScene]) ? window.archiveUserEmotions[prevScene].emotion : null
                    )
                });
            }
            window.strataSection.setTraces(window._strataCompletedScenes || []);
            window.strataSection.setCurrentScene(state.currentScene);
            window.strataSection.render();
        }
    } catch (e) { console.error('renderScene error:', e); showNotification(t('notify.render.error')) } }
function renderEchoLayer(words) { const layer = document.getElementById('echoLayer'); if (!layer) return; layer.innerHTML = ''; if (!words || !Array.isArray(words)) return; words.forEach(word => { const span = document.createElement('span'); span.className = 'echo-word'; span.textContent = word; span.style.top = (10 + Math.random() * 80) + '%'; span.style.left = (-15 + Math.random() * 130) + '%'; layer.appendChild(span) }) }
function renderChoices(choices) { const container = document.getElementById('choicesContainer'); if (!container) return; container.innerHTML = ''; if (!choices || !Array.isArray(choices)) return; choices.forEach((choice, i) => { const btn = document.createElement('button'); btn.className = 'choice-btn'; btn.textContent = choice.text; btn.onclick = function () { makeChoice(i) }; container.appendChild(btn) }) }

const _LIVE_KW = {
  guilt: ['sorry','fault','my fault','self-blame','regret','should have','shouldn\'t have','blame','wrong','because of me','미안','죄책','내 탓','잘못했','후회'],
  longing: ['miss','long for','again','return','back then','remember','still','remains','think of','그립','그리워','보고 싶','다시','돌아가','기억나','여전'],
  sadness: ['sad','cry','tears','hard','hurt','broken','tired','lonely','sorrow','슬프','슬펐','눈물','울었','아프','무너','외롭','서럽'],
  fear: ['scared','afraid','trembled','fear','anxious','avoid','run','hated','dread','무섭','두려','불안','떨렸','겁','도망','피하'],
  anger: ['angry','annoyed','furious','unfair','why','betrayed','hate','rage','mad','화나','분노','짜증','열받','빡쳐','억울','배신'],
  shame: ['embarrassed','ashamed','humiliated','exposed','hiding','can\'t say','창피','수치','부끄','들키','말 못'],
  numbness: ['don\'t know','nothing','empty','just','whatever','numb','blank','no idea','모르겠','아무것도','공허','무감각','멍했'],
  isolation: ['alone','nobody','abandoned','left','forsaken','only me','혼자','아무도','버려','고립','나만'],
};
function quickAnalyze(text) {
  if (!text || text.trim().length < 2) return null;
  const normalized = String(text).toLowerCase();
  const base = {};
  for (const [em, kws] of Object.entries(_LIVE_KW)) {
    base[em] = 0;
    for (const kw of kws) { if (normalized.includes(String(kw).toLowerCase())) base[em] = Math.min(1, base[em] + 0.4); }
  }
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  return total > 0 ? { base } : null;
}

function renderArchiveFreeInput(scene) {
  const container = document.getElementById('choicesContainer');
  if (!container) return;
  container.innerHTML = '';
  container.style.display = 'none';
  const freeInput = document.getElementById('freeInput');
  if (freeInput) {
    freeInput.value = '';
    freeInput.disabled = false;
    freeInput.readOnly = false;
    freeInput.placeholder = 'What comes to mind in this scene...';
    freeInput.parentElement.style.display = '';
    freeInput.style.pointerEvents = 'auto';
    freeInput.style.position = 'relative';
    freeInput.style.zIndex = '10';
    freeInput.style.opacity = '1';

    const newInput = freeInput.cloneNode(true);
    freeInput.parentNode.replaceChild(newInput, freeInput);

    newInput.oninput = function () {
      const result = quickAnalyze(newInput.value.trim());
      if (result && result.base) {
        const ev = result.base;
        startArchiveWaveAnimation(ev);
        if (typeof updateWaveBucket === 'function') {
          const entries = Object.entries(ev).sort((a, b) => (b[1] || 0) - (a[1] || 0));
          const topKey = entries.length ? entries[0][0] : '';
          if (topKey === 'anger' || topKey === 'fear') updateWaveBucket('LOW');
          else if (topKey === 'numbness' || topKey === 'isolation') updateWaveBucket('FIXATED');
          else if (topKey === 'sadness' || topKey === 'longing' || topKey === 'guilt') updateWaveBucket('MID');
          else updateWaveBucket('HIGH');
        }
        window._archiveLiveVector = result;
      }
    };
    newInput.onkeydown = function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submitArchiveFreeInput();
      }
    };
    setTimeout(() => newInput.focus({ preventScroll: true }), 100);

    const inputWrapper = newInput.parentElement;
    inputWrapper.style.cssText = 'display:flex;align-items:flex-end;gap:0.5rem;';
    newInput.style.flex = '1';

    inputWrapper.querySelectorAll('.archive-send-btn').forEach(b => b.remove());

    const sendBtn = document.createElement('button');
    sendBtn.className = 'archive-send-btn';
    sendBtn.textContent = '→';
    sendBtn.onclick = function () { submitArchiveFreeInput(); };
    inputWrapper.appendChild(sendBtn);
  }

  function submitArchiveFreeInput() {
    const fi = document.getElementById('freeInput');
    if (!fi || !fi.value.trim()) return;
    fi.disabled = true;
    const btn = container.querySelector('.archive-send-btn');
    if (btn) btn.disabled = true;
    window._archiveFreeText = fi.value.trim();
    makeChoice(0);
  }
}

function makeChoice(choiceIndex) { 
    try { 
        const state = appStore.getState(); 
        appStore.setState({ userChoices: [...state.userChoices, choiceIndex] }); 
        const currentData = appStore.getState().currentStoryData; 
        const updatedState = appStore.getState(); 
        if (!currentData || !currentData.scenes || !currentData.scenes[updatedState.currentScene]) { 
            showNotification(t('notify.scene.data.error')); 
            return; 
        } 
        const scene = currentData.scenes[updatedState.currentScene]; 
        const sceneType = scene.sceneType || scene.scene_type || 'normal'; 
        
 // expInterview.js load됐으면 모든 scene 서 칩 인터view 
        console.log('[makeChoice] startExpInterview check:', typeof startExpInterview);
        if (typeof startExpInterview === 'function') {
            console.log('[makeChoice] startExpInterview called');
            startExpInterview(scene);
        } else {
 // expInterview 없으면 바 next scene으 
            proceedToNextScene();
        }
    } catch (e) { 
        console.error('makeChoice error:', e); 
        showNotification(t('notify.error')); 
    } 
}
function proceedToNextScene() {
    try {
        const state = appStore.getState();
        const currentData = state.currentStoryData;
        if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) {
            showNotification(t('notify.scene.data.error'));
            return;
        }

        // Mark current scene as visited
        const visited = [...(state.visitedScenes || []), state.currentScene];
        appStore.setState({ visitedScenes: visited });

        const userEmotion = state.userEmotionTrajectory?.slice(-1)[0] || {};
        const originalEmotion = currentData.scenes[state.currentScene]?.original_emotion
            || currentData.scenes[state.currentScene]?.originalEmotion || {};

        const navResult = sceneNavigator.navigate({
            scenes: currentData.scenes,
            currentSceneIndex: state.currentScene,
            visitedScenes: visited,
            transitionPattern: state.lastTransitionPattern || 'bridge',
            userEmotion,
            originalEmotion,
        });

        if (navResult === null) {
            // All scenes visited — fire contamination persist then show end screen
            _applyContaminationAtEnd(state).catch(e => console.warn('[ContaminationTracker] persist error:', e));
            showEndScreen();
            return;
        }

        if (navResult.isFallback) {
            showNpcDialogue(navResult.fallbackNarrative, 3000);
        }

        appStore.setState({ currentScene: navResult.index });
        getSoundscape()?.onSceneTransition();
        renderScene();
    } catch (e) {
        console.error('proceedToNextScene error:', e);
        showNotification(t('notify.error'));
    }
}
// Expose to window for expInterview.js access
window.proceedToNextScene = proceedToNextScene;
// ───── submitEmotion 리팩토링: 하위 function들 ─────

/**
 * emotion input collect 및 validation (UIManager )
 * @returns {Object} { reason, scene, currentData, anchorEmotions } 또 null (failed 시)
 */
function collectEmotionInput() {
 // UIManager 통 input collect
    const reason = uiManager.collectEmotionInput();
    const state = appStore.getState();

 // userReasons update
    appStore.setState({ userReasons: [...state.userReasons, reason] });
    updateUserStats('interpretation', 1);

 // modal Close 및 input 필드 initialization (UIManager )
    uiManager.closeEmotionModal();

 // scene data validation (store 서 읽기)
    const currentData = appStore.getState().currentStoryData;
    if (!currentData || !currentData.scenes || !currentData.scenes[state.currentScene]) {
        showNotification(t('notify.scene.data.error'));
        return null;
    }

    const scene = currentData.scenes[state.currentScene];

 // anchor_emotions 파싱
    let anchorEmotions = scene.anchor_emotions || null;
    if (anchorEmotions && typeof anchorEmotions === 'string') {
        try {
            anchorEmotions = JSON.parse(anchorEmotions);
        } catch (e) {
            console.warn('anchor_emotions 파싱 Failed:', e);
            anchorEmotions = null;
        }
    }
    if (anchorEmotions && !Array.isArray(anchorEmotions)) {
        anchorEmotions = null;
    }

    return { reason, scene, currentData, anchorEmotions };
}

/**
 * emotion analysis 수행 (archive mode일 때 )
 * @param {string} reason - user input 유
 * @param {Array} anchorEmotions - anchor emotion list
 * @returns {Object} { userEmotionVector, reasonVector } 또 null
 */
/**
 * emotion analysis 수행 (archive mode일 때 )
 * @param {string} reason - user input 유
 * @param {Array} anchorEmotions - anchor emotion list
 * @param {Object} scene - current scene object
 * @returns {Object} { userEmotionVector, reasonVector } 또 null
 */
// analyzeEmotionForArchive function expInterview 모듈 대체됨

/**
 * ByeoriEngine.calculateStep() call 수행
 * @param {Object} input - { userVector, originalVector, anchorEmotions }
 * @param {Object} context - { previousBucket, emotionHistory }
 * @returns {Object} 엔진 calculation result
 */
function runEngineStep(input, context) {
    const state = appStore.getState();
    const nextInput = {
        ...input,
        userTrajectory: state.userEmotionTrajectory || [],
        originalTrajectory: state.originalEmotionTrajectory || [],
        sceneScores: state.sceneScores || []
    };
    return byeoriEngine.calculateStep(nextInput, context);
}

/**
 * 엔진 result store apply (state reflect )
 * @param {Object} engineResult - 엔진 calculation result
 * @param {Object} userEmotionVector - user emotion 벡터
 * @returns {Object} { sceneAlignment, newBucket, stateAfterUpdate }
 */
function applyEngineResult(engineResult, userEmotionVector) {
    const sceneAlignment = engineResult.alignment_score;
    const newBucket = engineResult.alignment_bucket;

 // emotion 히스토리 update
    const dominantEmotion = getDominantEmotion(userEmotionVector);
    const currentState = appStore.getState();
    const updatedHistory = [...currentState.emotionHistory, dominantEmotion];
    if (updatedHistory.length > 10) {
        updatedHistory.shift();
    }
    const currentData = storyData || appStore.getState().currentStoryData;
    const currentSceneIndex = currentState.currentScene || 0;
    const currentScene = currentData?.scenes?.[currentSceneIndex] || null;
    const originalEmotion = currentScene?.originalEmotion || currentScene?.original_emotion || {};

    const updatedUserTrajectory = [...(currentState.userEmotionTrajectory || []), userEmotionVector || {}];
    const updatedOriginalTrajectory = [...(currentState.originalEmotionTrajectory || []), originalEmotion || {}];
    const updatedSceneScores = [...(currentState.sceneScores || []), engineResult.current_scene_score || 0];

    appStore.setState({
        emotionHistory: updatedHistory,
        userEmotionTrajectory: updatedUserTrajectory,
        originalEmotionTrajectory: updatedOriginalTrajectory,
        sceneScores: updatedSceneScores
    });

 // alignment 및 bucket update
    appStore.setState({
        currentAlignment: sceneAlignment,
        currentBucket: newBucket,
        lastTransitionPattern: engineResult.transition_pattern || null,
        lastEngineResult: engineResult,
    });

 // window.archiveSceneAlignments save (하위 호환성 maintain)
    if (!window.archiveSceneAlignments) {
        window.archiveSceneAlignments = [];
    }
    const stateAfterUpdate = appStore.getState();
    window.archiveSceneAlignments[stateAfterUpdate.currentScene] = sceneAlignment;

    return { sceneAlignment, newBucket, stateAfterUpdate };
}
window.applyEngineResult = applyEngineResult;

/**
 * UI update (UIManager/Visualizer call)
 * @param {Object} state - current store state
 * @param {Object} result - { sceneAlignment, newBucket, userEmotionVector }
 */
function updateUIAfterSubmit(state, result) {
    const { sceneAlignment, newBucket, userEmotionVector } = result;

 // alignment display update
    updateAlignmentDisplay();

 // wave rendering
    renderArchiveEmotionWave(userEmotionVector);

 // notification display
    showNotification(`Scene Alignment: ${(sceneAlignment * 100).toFixed(0)}%`);

 // bucket 피드백
    console.log('=== Bucket determination ===');
    console.log('Alignment:', sceneAlignment);
    console.log('이전 Bucket:', state.currentBucket);
    console.log('감정 히스토리:', state.emotionHistory);
    console.log('새 Bucket:', newBucket);

    if (newBucket !== state.currentBucket) {
        window.showBucketFeedback(newBucket, sceneAlignment);
 // 사운드스케 프 bucket transition
        getSoundscape()?.setBucket(newBucket);
    }
}

/**
 * NetworkService 통 save
 * @param {Object} params - { userEmotionVector, reason, scene, currentData, sceneAlignment, reasonVector, mismatchType }
 */
async function persistAfterSubmit(params) {
    const { userEmotionVector, reason, scene, currentData, sceneAlignment, reasonVector, mismatchType } = params;

    if (!userEmotionVector) {
        return;
    }

    await saveArchiveEmotionToPlays(
        userEmotionVector,
        reason,
        scene,
        currentData,
        sceneAlignment,
        reasonVector,
        mismatchType
    );
}

/**
 * next scene으 move 또 ending screen display
 * @param {Object} currentData - current memory data
 * @param {Object} scene - current scene object
 */
async function proceedToNextSceneOrEnd(currentData, scene) {
    const finalState = appStore.getState();

 // NPC 대화 display
    showNpcDialogue(getRandomDialogue(NPC_DIALOGUES.archive.choiceMade), 3000);

 // 1.5초 후 next scene으 move 또 ending
    setTimeout(async () => {
        const nextState = appStore.getState();

        // Mark current scene as visited
        const visited = [...(nextState.visitedScenes || []), nextState.currentScene];
        appStore.setState({ visitedScenes: visited });

        const userEmotion = nextState.userEmotionTrajectory?.slice(-1)[0] || {};
        const originalEmotion = currentData.scenes[nextState.currentScene]?.original_emotion
            || currentData.scenes[nextState.currentScene]?.originalEmotion || {};

        const navResult = sceneNavigator.navigate({
            scenes: currentData.scenes,
            currentSceneIndex: nextState.currentScene,
            visitedScenes: visited,
            transitionPattern: nextState.lastTransitionPattern || 'bridge',
            userEmotion,
            originalEmotion,
        });

        if (navResult === null) {
            // All scenes visited — show end screen
            if (nextState.currentMode === 'archive') {
                const alignmentResult = await calculateAverageAlignment();
                await _applyContaminationAtEnd(nextState);
                showEndScreen(alignmentResult);
            } else {
                showEndScreen();
            }
            return;
        }

        if (navResult.isFallback) {
            showNpcDialogue(navResult.fallbackNarrative, 3000);
        }

        appStore.setState({ currentScene: navResult.index });
        if (nextState.currentMode === 'archive') {
            renderScene();
        } else {
            simulateNarratorInput();
        }
    }, 1500);
}

// submitEmotion function expInterview 모듈 대체됨

// ─── ContaminationTracker session-end hook ────────────────────────────────────
/**
 * Called once when an archive session ends.
 * Reads the last engine result from store, runs ContaminationTracker update,
 * and persists cont_* columns to the memories table.
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
    initProgressDots,
    goToScene,

    // Scene rendering
    renderScene,
    renderEchoLayer,
    renderChoices,
    renderArchiveFreeInput,
    makeChoice,
    proceedToNextScene,

    // submitEmotion refactoring
    collectEmotionInput,
    runEngineStep,
    applyEngineResult,
    updateUIAfterSubmit,
    persistAfterSubmit,
    proceedToNextSceneOrEnd,
};

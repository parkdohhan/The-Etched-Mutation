// admin-trajectory.js — 다궤적 시각화 UI Phase 1
// dagre + 바닐라 SVG + d3-zoom

import { getSupabaseClient } from './lib/supabaseClient.js';
import { byeoriEngine } from './core/ByeoriEngine.js';
import { sceneNavigator } from './core/SceneNavigator.js';
import LumenAdminStageView from './ui/lumen_admin_stage_view.js';
import { DEFAULT_EMOTION_ANCHORS } from './shared/math.js';

// ─── 감정 팔레트 (8 keys) ──────────────────────────────────
const EMOTIONS = [
  { key: 'longing',   label: '그리움',   color: '#c4a882' },
  { key: 'sadness',   label: '슬픔',     color: '#6a8caf' },
  { key: 'fear',      label: '공포',     color: '#8b5e3c' },
  { key: 'shame',     label: '수치',     color: '#a06b8a' },
  { key: 'anger',     label: '분노',     color: '#b85540' },
  { key: 'guilt',     label: '죄책감',   color: '#7a6f5d' },
  { key: 'isolation', label: '고립',     color: '#5a6a78' },
  { key: 'numbness',  label: '무감',     color: '#4a4a52' },
];

// ─── 상태 ──────────────────────────────────────────────────
const state = {
  memory: null,       // memory row (with meta)
  scenes: [],         // scenes (with meta)
  choices: [],        // flat choices
  trajectoryBridges: [], // from trajectory_bridges table
  selectedEmotions: new Set(),
  showAllBridges: false,
  selectedSceneId: null,
  nodePositions: {}, // {sceneId: {x, y}} — 사용자가 드래그한 위치 오버라이드
  zoomScale: 1,      // 현재 줌 배율 (드래그 델타 변환용)
  terrainMode: false, // 감정 지형 모드 (VA 투영)
  spatialMode: false, // 핀 모드 — meta.trajectory_targets 로 분기 정의 (런타임이 따름)
};

// 핀 모드 기본값
// 100 = 노드 너비(160) 보다 약간 작아 인접 노드 1~2개만 자연스럽게 들어옴.
// 이전 220 은 dagre 자동 레이아웃에서 모든 원이 다 겹쳐 화면 클러터.
const SPATIAL_DEFAULT_RADIUS = 100;

// ─── VAD projection (tem_af_strata_terrain.js와 동일) ──
const VAD_FULL = {
  fear:{v:-0.9,a:0.9}, sadness:{v:-0.8,a:-0.4}, anger:{v:-0.7,a:0.8},
  guilt:{v:-0.8,a:0.2}, shame:{v:-0.9,a:-0.2}, isolation:{v:-0.7,a:-0.5},
  numbness:{v:-0.6,a:-0.8}, longing:{v:-0.3,a:0.2}, resentment:{v:-0.5,a:0.6},
  resignation:{v:-0.4,a:-0.6}, joy:{v:0.9,a:0.6}, hope:{v:0.7,a:0.4},
  relief:{v:0.6,a:-0.3}, gratitude:{v:0.8,a:-0.2}, love:{v:1.0,a:0.5},
  peace:{v:0.8,a:-0.6}, confusion:{v:-0.4,a:0.3},
};
function projectToVAD(emoVec) {
  let V = 0, A = 0, wSum = 0;
  for (const k in emoVec) {
    const w = Number(emoVec[k] || 0);
    const m = VAD_FULL[k];
    if (!w || !m) continue;
    V += w * m.v; A += w * m.a; wSum += w;
  }
  if (wSum <= 0) return { v: 0, a: 0 };
  return { v: Math.max(-1, Math.min(1, V / wSum)), a: Math.max(-1, Math.min(1, A / wSum)) };
}

function lsKey() {
  return state.memory ? `tv_positions_${state.memory.id}` : null;
}
function loadNodePositions() {
  const k = lsKey(); if (!k) return;
  try {
    const raw = localStorage.getItem(k);
    state.nodePositions = raw ? JSON.parse(raw) : {};
  } catch (e) { state.nodePositions = {}; }
}
function saveNodePositions() {
  const k = lsKey(); if (!k) return;
  try { localStorage.setItem(k, JSON.stringify(state.nodePositions)); } catch (e) {}
}

// ─── 부트 ──────────────────────────────────────────────────
async function initTrajectoryViewer(memoryId) {
  // tv* DOM 없으면 (이 페이지에 뷰어가 없음) 중단
  if (!document.getElementById('tvSvg')) return;

  // 이미 같은 memory로 init됐으면 skip
  if (state.memory && memoryId && state.memory.id === memoryId) return;

  setStatus('Supabase 연결 중…');
  const sb = await getSupabaseClient();
  if (!sb) { setStatus('❌ Supabase 클라이언트 실패'); return; }

  setStatus('데이터 로딩 중…');
  try {
    if (memoryId) {
      await loadByMemoryId(sb, memoryId);
    } else {
      await loadFirstAvailable(sb);
    }
  } catch (e) {
    console.error(e);
    setStatus('❌ ' + e.message);
    return;
  }

  setStatus('');
  loadNodePositions();
  document.getElementById('tvMemoryLabel').textContent =
    `${state.memory.code} — ${state.memory.title}`;

  renderEmotionList();
  renderStats();
  renderMemoryMeta();
  bindToggles();
  renderGraph();
  loadPersonasForMemory();
  resetSim();          // 메모리 전환 시 시뮬 상태 클리어
  initSimPanel();      // 슬라이더·프리셋·버튼 바인딩 (idempotent)

  // 작업 15 — 위치 레이어 mount + 동기화 (idempotent)
  if (!state._stageMounted) {
    LumenAdminStageView.mount('tvStageRoot');
    // 장면 유령(핀) 클릭(드래그 X) → 우측 씬 편집 패널
    if (typeof LumenAdminStageView.setSceneClickHandler === 'function') {
      LumenAdminStageView.setSceneClickHandler((sceneId) => {
        const sc = state.scenes.find(s => s.id === sceneId);
        if (sc) selectScene(sc);
      });
    }
    // 잔상 유령 마커 클릭(드래그 X) → 우측 잔상 편집 패널
    if (typeof LumenAdminStageView.setGhostClickHandler === 'function') {
      LumenAdminStageView.setGhostClickHandler((ghostIdx) => {
        renderGhostDetail(ghostIdx);
      });
    }
    bindLayerToggle();
    state._stageMounted = true;
  }
  // terrain mesh 는 메모리 단위로 로드 (idempotent — 같은 id 재호출 시 재로드 안 함)
  if (state.memory && state.memory.id) {
    LumenAdminStageView.setMemoryId(state.memory.id);
  }
  syncStageView();
}

// 작업 15 (개정) — 상하분할 폐기. 상단 탭으로 trajectory/position 단독 전환.
// 활성 레이어는 localStorage 영속, 디폴트 'trajectory'.
function bindLayerToggle() {
  const wrap = document.getElementById('tvCanvasWrap');
  const tabs = document.getElementById('tvLayerTabs');
  if (!wrap || !tabs || tabs._bound) return;
  tabs._bound = true;

  const LS_KEY = 'tv_active_layer'; // 'trajectory' | 'position'
  const apply = (layer) => {
    const v = layer === 'position' ? 'position' : 'trajectory';
    wrap.setAttribute('data-active-layer', v);
    tabs.querySelectorAll('.tv-layer-tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.layer === v);
    });
    try { localStorage.setItem(LS_KEY, v); } catch (e) {}
  };
  // 초기 복원
  let initial = 'trajectory';
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === 'trajectory' || saved === 'position') initial = saved;
  } catch (e) {}
  apply(initial);

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tv-layer-tab');
    if (!btn) return;
    apply(btn.dataset.layer);
  });
}

// 작업 15 — 위치 레이어로 현 상태 push. scene/시뮬 변동 시점에 호출.
function syncStageView() {
  if (!state._stageMounted) return;
  LumenAdminStageView.setScenes(state.scenes);
  LumenAdminStageView.setSimState({
    active: simState.active,
    runners: simState.runners,
    compareMode: simState.compareMode,
  });
}

// ─── 메모리 기본 설정 패널 (우측 하단) ─────────────────────
function renderMemoryMeta() {
  const el = document.getElementById('tvMemoryMeta');
  if (!el) return;
  const m = state.memory;
  if (!m) { el.innerHTML = '<div class="tv-detail-empty">메모리 없음</div>'; return; }

  const keywords = Array.isArray(m.memory_words) ? m.memory_words.join(', ') : '';

  el.innerHTML = `
    <div style="font-family:'Cormorant Garamond',serif;font-size:1.2rem;color:#c4a882;margin-bottom:2px;">${escapeHtml(m.code || '')}</div>
    <div style="font-size:0.7rem;color:#7c7466;margin-bottom:14px;">id: ${m.id?.slice(0,8) || '—'}…</div>

    <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">제목</div>
    <input type="text" id="metaTitle" value="${escapeHtml(m.title || '')}" style="width:100%;padding:6px 8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.85rem;border-radius:2px;margin-bottom:12px;" />

    <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">설명</div>
    <textarea id="metaDescription" rows="3" style="width:100%;padding:6px 8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.8rem;border-radius:2px;margin-bottom:12px;resize:vertical;">${escapeHtml(m.description || '')}</textarea>

    <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">키워드 (쉼표 구분)</div>
    <input type="text" id="metaKeywords" value="${escapeHtml(keywords)}" style="width:100%;padding:6px 8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.8rem;border-radius:2px;margin-bottom:12px;" />

    <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">완성 문장</div>
    <textarea id="metaCompletedSentence" rows="2" style="width:100%;padding:6px 8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.8rem;border-radius:2px;margin-bottom:12px;resize:vertical;">${escapeHtml(m.completed_sentence || '')}</textarea>

    <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">페르소나 컨텍스트 <span style="color:#5c544a;text-transform:none;letter-spacing:0;">— 시뮬레이션용 주제 요약 (1-2단락)</span></div>
    <textarea id="metaPersonaContext" rows="4" placeholder="이 작품의 핵심 테마, 상징, 관계 구도를 시뮬 독자가 알아야 할 만큼 요약. 예: '편지로 끝내지 못한 말, 침묵, 부모와 연인 사이의 미완성된 대화.'" style="width:100%;padding:6px 8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.8rem;border-radius:2px;margin-bottom:14px;resize:vertical;">${escapeHtml(m.meta?.persona_context || '')}</textarea>

    <button class="tv-toggle" id="metaSaveBtn" style="padding:6px 12px;font-size:0.75rem;">저장</button>
    <span id="metaSaveStatus" style="margin-left:10px;font-size:0.7rem;color:#7c7466;"></span>
  `;

  document.getElementById('metaSaveBtn').addEventListener('click', saveMemoryMeta);
}

async function saveMemoryMeta() {
  const statusEl = document.getElementById('metaSaveStatus');
  const title = document.getElementById('metaTitle').value.trim();
  const desc = document.getElementById('metaDescription').value.trim();
  const keywords = document.getElementById('metaKeywords').value.split(',').map(s => s.trim()).filter(Boolean);
  const completed = document.getElementById('metaCompletedSentence').value.trim();
  const personaCtx = document.getElementById('metaPersonaContext').value.trim();

  statusEl.textContent = '저장 중…';
  statusEl.style.color = '#7c7466';
  try {
    const sb = await getSupabaseClient();
    const nextMeta = { ...(state.memory.meta || {}) };
    if (personaCtx) nextMeta.persona_context = personaCtx;
    else delete nextMeta.persona_context;

    const { error } = await sb.from('memories').update({
      title, description: desc || null,
      memory_words: keywords.length ? keywords : null,
      completed_sentence: completed || null,
      meta: nextMeta,
    }).eq('id', state.memory.id);
    if (error) throw error;
    state.memory.title = title;
    state.memory.description = desc || null;
    state.memory.memory_words = keywords;
    state.memory.completed_sentence = completed || null;
    state.memory.meta = nextMeta;
    document.getElementById('tvMemoryLabel').textContent = `${state.memory.code} — ${state.memory.title}`;
    statusEl.textContent = '✓ 저장됨';
    statusEl.style.color = '#6aa383';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  } catch (e) {
    statusEl.textContent = '❌ ' + e.message;
    statusEl.style.color = '#b85540';
  }
}

// admin.html에서 호출
window.initTrajectoryViewer = initTrajectoryViewer;

// ─── 데이터 ────────────────────────────────────────────────
async function loadByMemoryId(sb, memoryId) {
  const { data: mem, error: e1 } = await sb.from('memories').select('*').eq('id', memoryId).single();
  if (e1) throw e1;
  state.memory = mem;
  await loadScenesAndChoices(sb, mem.id);
  await loadTrajectoryBridges(sb, mem.id);
}

async function loadFirstAvailable(sb) {
  // memory 파라미터 없을 때 — meta.emotion_entries 있는 것 우선
  const { data: list, error } = await sb.from('memories').select('*').order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  const withMeta = list.find(m => m.meta && m.meta.emotion_entries) || list[0];
  if (!withMeta) throw new Error('등록된 메모리가 없음');
  state.memory = withMeta;
  await loadScenesAndChoices(sb, withMeta.id);
  await loadTrajectoryBridges(sb, withMeta.id);
}

async function loadScenesAndChoices(sb, memoryId) {
  const { data: scenes, error: se } = await sb.from('scenes').select('*').eq('memory_id', memoryId).order('scene_order', { ascending: true });
  if (se) throw se;
  state.scenes = scenes || [];
  if (state.scenes.length === 0) return;

  const sceneIds = state.scenes.map(s => s.id);
  const { data: choices, error: ce } = await sb.from('choices').select('*').in('scene_id', sceneIds).order('choice_order', { ascending: true });
  if (ce) throw ce;
  state.choices = choices || [];
}

async function loadTrajectoryBridges(sb, memoryId) {
  const { data, error } = await sb.from('trajectory_bridges').select('*').eq('memory_id', memoryId).eq('status', 'live');
  if (error) {
    console.warn('trajectory_bridges 로드 실패 (테이블 없음 가능):', error.message);
    state.trajectoryBridges = [];
    return;
  }
  state.trajectoryBridges = data || [];
}

// ─── 사이드바 ──────────────────────────────────────────────
function renderEmotionList() {
  const entries = (state.memory.meta && state.memory.meta.emotion_entries) || {};
  const hasEntries = Object.keys(entries).length > 0;
  const container = document.getElementById('tvEmotionList');
  container.innerHTML = '';

  if (!hasEntries) {
    // emotion_entries 없는 기억 — 선형 모드 안내
    container.innerHTML = `
      <div style="padding:10px 0;color:#5a5446;font-size:0.72rem;line-height:1.6;">
        감정 진입점 미설정<br>
        <span style="color:#7c7466;">전체 씬 선형 표시 중</span><br><br>
        기본 설정에서<br>emotion_entries를<br>등록하면 궤적별 필터가 활성화됩니다.
      </div>`;
    return;
  }

  EMOTIONS.forEach(e => {
    const entryCode = entries[e.key];
    if (!entryCode) return; // 작품에 없는 감정은 숨김
    const row = document.createElement('label');
    row.className = 'tv-emo-row';
    row.innerHTML = `
      <input type="checkbox" data-emotion="${e.key}" />
      <span class="tv-emo-swatch" style="background:${e.color}"></span>
      <span class="tv-emo-name">${e.label}</span>
      <span class="tv-emo-meta">→ ${entryCode}</span>
    `;
    row.querySelector('input').addEventListener('change', (ev) => {
      if (ev.target.checked) state.selectedEmotions.add(e.key);
      else state.selectedEmotions.delete(e.key);
      document.getElementById('tvToggleAll').classList.remove('active');
      renderGraph();
      renderStats();
    });
    container.appendChild(row);
  });
}

function renderStats() {
  const sceneCount = state.scenes.length;
  const choiceCount = state.choices.length;
  const authorBridgeCount = state.scenes.reduce((n, s) =>
    n + (s.meta && Array.isArray(s.meta.author_bridges) ? s.meta.author_bridges.length : 0), 0);
  const trajBridgeCount = state.trajectoryBridges.length;
  const selected = state.selectedEmotions.size;
  document.getElementById('tvStats').innerHTML =
    `씬: ${sceneCount}<br>선택지: ${choiceCount}<br>작가 브릿지: ${authorBridgeCount}<br>궤적 브릿지: ${trajBridgeCount}<br>활성 궤적: ${selected}`;
}

// ─── 모달 ───────────────────────────────────────────────────
function openModal(html) {
  const modal = document.getElementById('tvModal');
  const body = document.getElementById('tvModalBody');
  if (!modal || !body) return;
  body.innerHTML = html;
  modal.style.display = 'flex';
  // ESC / 배경 클릭으로 닫기
  modal.onclick = (ev) => { if (ev.target === modal) closeModal(); };
}
function closeModal() {
  const modal = document.getElementById('tvModal');
  if (modal) modal.style.display = 'none';
}
window.tvCloseModal = closeModal;

// ─── 새 기억 추가 ───────────────────────────────────────────
function openNewMemoryModal() {
  openModal(`
    <h3 style="margin:0 0 14px;font-family:'Cormorant Garamond',serif;color:#c4a882;font-weight:300;">새 기억 만들기</h3>
    <p style="color:#7c7466;font-size:0.78rem;margin:0 0 16px;line-height:1.6;">제목과 코드를 입력하세요. 이후 Canvas에서 씬을 추가합니다.</p>

    <label style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;">제목</label>
    <input id="nmTitle" type="text" placeholder="편지" style="width:100%;margin-top:4px;margin-bottom:10px;padding:8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.88rem;border-radius:2px;" />

    <label style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;">코드 (E-NNN)</label>
    <input id="nmCode" type="text" placeholder="E-005" style="width:100%;margin-top:4px;margin-bottom:10px;padding:8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.88rem;border-radius:2px;" />

    <label style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;">첫 씬 본문 (선택)</label>
    <textarea id="nmFirstText" rows="3" placeholder="(비워두면 빈 씬 하나로 시작)" style="width:100%;margin-top:4px;margin-bottom:14px;padding:8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.82rem;border-radius:2px;resize:vertical;"></textarea>

    <div id="nmStatus" style="font-size:0.72rem;color:#7c7466;margin-bottom:10px;min-height:1em;"></div>

    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="tv-toggle" onclick="tvCloseModal()" style="padding:6px 14px;font-size:0.78rem;">취소</button>
      <button class="tv-toggle" id="nmCreateBtn" style="padding:6px 14px;font-size:0.78rem;background:rgba(106,163,131,0.12);border-color:rgba(106,163,131,0.4);">생성</button>
    </div>
  `);
  document.getElementById('nmCreateBtn').addEventListener('click', createNewMemory);
  document.getElementById('nmTitle').focus();
}

async function createNewMemory() {
  const title = document.getElementById('nmTitle').value.trim();
  const code = document.getElementById('nmCode').value.trim();
  const firstText = document.getElementById('nmFirstText').value.trim();
  const statusEl = document.getElementById('nmStatus');

  if (!title) { statusEl.textContent = '제목을 입력하세요.'; statusEl.style.color = '#b85540'; return; }
  if (!code)  { statusEl.textContent = '코드를 입력하세요.'; statusEl.style.color = '#b85540'; return; }

  statusEl.textContent = '생성 중…';
  statusEl.style.color = '#7c7466';

  try {
    const sb = await getSupabaseClient();
    // 1) memories insert
    const { data: mem, error: me } = await sb.from('memories').insert({
      code, title,
      status: 'Fetus', source: 'curated',
      layers: 0, dilution: 100, is_public: true,
      meta: { emotion_entries: {}, key_scenes: [] }
    }).select().single();
    if (me) throw me;

    // 2) 첫 씬 insert
    const { data: sc, error: se } = await sb.from('scenes').insert({
      memory_id: mem.id, scene_order: 0,
      text: firstText || '',
      emotion_dist: {}, emotion_vector: {},
      scene_type: 'normal',
      meta: { scene_code: 'A', motif_tags: [], author_bridges: [] }
    }).select().single();
    if (se) throw se;

    statusEl.textContent = '✓ 생성됨. 로딩…';
    statusEl.style.color = '#6aa383';

    // 3) 해당 메모리로 Canvas 전환
    setTimeout(async () => {
      closeModal();
      window.currentMemoryId = mem.id;
      state.memory = null; // 강제 리로드
      await initTrajectoryViewer(mem.id);
    }, 600);
  } catch (e) {
    console.error(e);
    statusEl.textContent = '❌ ' + e.message;
    statusEl.style.color = '#b85540';
  }
}

// ─── 씬 삭제 ────────────────────────────────────────────────
async function deleteScene(s) {
  if (!confirm(`씬 "${s.meta?.scene_code || s.scene_order}" 을(를) 삭제할까요?\n(복구 불가)`)) return;
  try {
    const sb = await getSupabaseClient();
    // choices 먼저 삭제 (FK)
    await sb.from('choices').delete().eq('scene_id', s.id);
    const { error } = await sb.from('scenes').delete().eq('id', s.id);
    if (error) throw error;
    // 로컬 state에서 제거
    state.scenes = state.scenes.filter(x => x.id !== s.id);
    state.selectedSceneId = null;
    document.getElementById('tvDetail').innerHTML = '<div class="tv-detail-empty">씬이 삭제되었습니다.</div>';
    renderGraph();
    renderStats();
  } catch (e) {
    console.error(e);
    alert('삭제 실패: ' + e.message);
  }
}

// ─── 사운드 미리듣기 (Web Audio API) ────────────────────────
let _audioCtx = null;
let _currentPreview = null;
async function previewSound(url, volume) {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_currentPreview) { try { _currentPreview.stop(); } catch(e){} _currentPreview = null; }

    const res = await fetch(url);
    if (!res.ok) throw new Error('파일 로드 실패: ' + res.status);
    const buf = await res.arrayBuffer();
    const audioBuf = await _audioCtx.decodeAudioData(buf);

    const src = _audioCtx.createBufferSource();
    src.buffer = audioBuf;
    const gain = _audioCtx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    src.connect(gain).connect(_audioCtx.destination);
    src.start();
    _currentPreview = src;
    // 최대 10초 미리듣기
    setTimeout(() => { try { src.stop(); } catch(e){} }, 10000);
  } catch (e) {
    alert('재생 실패: ' + e.message);
  }
}

// ─── 새 씬 추가 ─────────────────────────────────────────────
async function addNewScene() {
  return _insertScene({ role: 'anchor' });
}

// addNewBridgeScene (scene_role='residual') 폐기 — 2026-05-16. 잔상은 잔상 유령으로 통합.

async function _insertScene({ role }) {
  if (!state.memory) { alert('먼저 메모리를 선택하세요.'); return; }
  const existingCodes = new Set(state.scenes.map(s => s.meta?.scene_code).filter(Boolean));
  let nextCode = '';
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!existingCodes.has(c)) { nextCode = c; break; }
  }
  const nextOrder = Math.max(-1, ...state.scenes.map(s => s.scene_order ?? -1)) + 1;
  const isBridge = role === 'residual';

  try {
    const sb = await getSupabaseClient();
    const { data: sc, error: se } = await sb.from('scenes').insert({
      memory_id: state.memory.id,
      scene_order: nextOrder,
      text: '',
      emotion_dist: {}, emotion_vector: {},
      scene_type: isBridge ? 'branch' : 'normal',
      scene_role: isBridge ? 'residual' : 'anchor',
      meta: { scene_code: nextCode || String(nextOrder), motif_tags: [], author_bridges: [] }
    }).select().single();
    if (se) throw se;
    state.scenes.push(sc);
    renderGraph();
    renderStats();
    selectScene(sc);
  } catch (e) {
    console.error(e);
    alert((isBridge ? '잔상 씬' : '씬') + ' 추가 실패: ' + e.message);
  }
}

function bindToggles() {
  document.getElementById('tvToggleAll').addEventListener('click', (ev) => {
    const allOn = ev.target.classList.toggle('active');
    state.selectedEmotions = new Set(allOn ? EMOTIONS.map(e => e.key).filter(k =>
      state.memory.meta && state.memory.meta.emotion_entries && state.memory.meta.emotion_entries[k]
    ) : []);
    document.querySelectorAll('#tvEmotionList input').forEach(cb => {
      cb.checked = state.selectedEmotions.has(cb.dataset.emotion);
    });
    renderGraph();
    renderStats();
  });
  document.getElementById('tvToggleBridges').addEventListener('click', (ev) => {
    state.showAllBridges = ev.target.classList.toggle('active');
    renderGraph();
  });
  document.getElementById('tvResetLayout').addEventListener('click', () => {
    if (!confirm('드래그로 옮긴 위치를 모두 초기화할까요?')) return;
    state.nodePositions = {};
    saveNodePositions();
    _pan = { scale: 1, tx: 0, ty: 0 };
    renderGraph();
  });
  document.getElementById('tvToggleTerrain').addEventListener('click', (ev) => {
    state.terrainMode = ev.target.classList.toggle('active');
    // 모드 전환 시 드래그 저장 초기화 여부 물음 (노드가 튈 수 있으니)
    renderGraph();
  });
  const spatBtn = document.getElementById('tvToggleSpatial');
  if (spatBtn) {
    try {
      if (localStorage.getItem('tv_spatial_mode') === '1') {
        state.spatialMode = true;
        spatBtn.classList.add('active');
      }
    } catch (e) {}
    spatBtn.addEventListener('click', (ev) => {
      state.spatialMode = ev.target.classList.toggle('active');
      try { localStorage.setItem('tv_spatial_mode', state.spatialMode ? '1' : '0'); } catch (e) {}
      renderGraph();
      // 디테일 패널 다시 그려서 핀 모드 전용 UI 토글
      const sid = state.selectedSceneId;
      const sc = sid && state.scenes.find(s => s.id === sid);
      if (sc) renderDetail(sc, state.detailTab || 'detail');
    });
  }
  const addMemBtn = document.getElementById('tvAddMemoryBtn');
  if (addMemBtn) addMemBtn.addEventListener('click', openNewMemoryModal);
  const addSceneBtn = document.getElementById('tvAddSceneBtn');
  if (addSceneBtn) addSceneBtn.addEventListener('click', addNewScene);
  // 2026-05-16 — "+ 잔상 유령": 위치 stage 탭 회색 마커 추가. ("+ 잔상 씬" 폐기 대체)
  const addGhostBtn = document.getElementById('tvAddGhostBtn');
  if (addGhostBtn) addGhostBtn.addEventListener('click', () => {
    if (!state.memory || !state.memory.id) { alert('기억이 선택되지 않았습니다.'); return; }
    if (typeof LumenAdminStageView.addGhostPoint === 'function') {
      LumenAdminStageView.addGhostPoint();
    }
  });

  const strataBtn = document.getElementById('tvStrataPreviewBtn');
  if (strataBtn) strataBtn.addEventListener('click', () => {
    const mid = (state.memory && state.memory.id) || window.currentMemoryId;
    if (!mid) { alert('기억이 선택되지 않았습니다.'); return; }
    if (typeof window.showStrataView !== 'function') { alert('strataView.js 로딩 실패'); return; }
    window.showStrataView(mid, null, () => {
      const sv = document.getElementById('strataView');
      if (sv) sv.style.display = 'none';
    });
  });

  const prevBtn = document.getElementById('tvPersonaPrevBtn');
  const nextBtn = document.getElementById('tvPersonaNextBtn');
  const personaSel = document.getElementById('tvPersonaSelect');
  if (prevBtn) prevBtn.addEventListener('click', personaStepPrev);
  if (nextBtn) nextBtn.addEventListener('click', personaStepNext);
  if (personaSel) personaSel.addEventListener('change', onPersonaSelectChange);
}

// ─── 페르소나 수동 step ────────────────────────────────────
// 자동재생 폐기 — 선택 시 첫 step 표시, ◀ 이전 / 다음 ▶ 으로 직접 진행.
const personaState = {
  personas: [],      // [{ persona_id, persona_name, strata_label, plays: [...] }]
  plays: [],
  currentIdx: 0,
  orderedPlays: [],
  currentPersona: null,
};

async function loadPersonasForMemory() {
  const sel = document.getElementById('tvPersonaSelect');
  if (!sel || !state.memory) return;
  // 메모리 전환 시 step 상태 초기화
  personaState.orderedPlays = [];
  personaState.currentPersona = null;
  personaState.currentIdx = 0;
  clearSceneHighlight();
  const infoEl = document.getElementById('tvPersonaInfo');
  if (infoEl) infoEl.innerHTML = '';
  updatePersonaStepButtons();
  sel.innerHTML = '<option value="">— 로딩 중 —</option>';
  try {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from('plays')
      .select('id, scene_id, persona_id, persona_name, strata_label, visit, user_emotion, alignment, mismatch_type, created_at')
      .eq('memory_id', state.memory.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    personaState.plays = data || [];
    const byPersona = new Map();
    for (const p of personaState.plays) {
      if (!p.persona_id) continue;
      if (!byPersona.has(p.persona_id)) {
        byPersona.set(p.persona_id, {
          persona_id: p.persona_id,
          persona_name: p.persona_name || p.persona_id,
          strata_label: p.strata_label || '',
          plays: []
        });
      }
      byPersona.get(p.persona_id).plays.push(p);
    }
    personaState.personas = Array.from(byPersona.values());
    sel.innerHTML = personaState.personas.length
      ? ['<option value="">— 선택 —</option>'].concat(
          personaState.personas.map(p =>
            `<option value="${p.persona_id}">${escapeHtml(p.persona_name)} ${p.strata_label ? '· ' + escapeHtml(p.strata_label) : ''} (${p.plays.length})</option>`
          )
        ).join('')
      : '<option value="">— 시뮬 데이터 없음 —</option>';
  } catch (e) {
    console.warn('[persona] load fail:', e.message);
    sel.innerHTML = '<option value="">— 로드 실패 —</option>';
  }
}

function onPersonaSelectChange() {
  const sel = document.getElementById('tvPersonaSelect');
  const id = sel && sel.value;
  if (!id) {
    personaState.orderedPlays = [];
    personaState.currentPersona = null;
    personaState.currentIdx = 0;
    clearSceneHighlight();
    const infoEl = document.getElementById('tvPersonaInfo');
    if (infoEl) infoEl.innerHTML = '';
    updatePersonaStepButtons();
    return;
  }
  const persona = personaState.personas.find(p => p.persona_id === id);
  if (!persona || !persona.plays.length) {
    personaState.orderedPlays = [];
    personaState.currentPersona = null;
    personaState.currentIdx = 0;
    updatePersonaStepButtons();
    return;
  }
  // Order plays by scene order so step 진행이 궤적 순서를 따라감
  const sceneOrderMap = new Map();
  state.scenes.forEach((s, i) => sceneOrderMap.set(s.id, s.scene_order != null ? s.scene_order : i));
  personaState.orderedPlays = persona.plays.slice().sort((a, b) => {
    const oa = sceneOrderMap.get(a.scene_id); const ob = sceneOrderMap.get(b.scene_id);
    return (oa != null ? oa : 999) - (ob != null ? ob : 999);
  });
  personaState.currentPersona = persona;
  personaState.currentIdx = 0;
  renderPersonaStep();
}

function renderPersonaStep() {
  const plays = personaState.orderedPlays;
  const persona = personaState.currentPersona;
  if (!plays.length || !persona) {
    clearSceneHighlight();
    updatePersonaStepButtons();
    return;
  }
  const idx = Math.max(0, Math.min(personaState.currentIdx, plays.length - 1));
  personaState.currentIdx = idx;
  const play = plays[idx];
  highlightSceneNode(play.scene_id);
  updatePersonaPanel(persona, play);
  updatePersonaStepButtons();
}

function personaStepPrev() {
  if (!personaState.orderedPlays.length) return;
  if (personaState.currentIdx <= 0) return;
  personaState.currentIdx--;
  renderPersonaStep();
}

function personaStepNext() {
  if (!personaState.orderedPlays.length) return;
  if (personaState.currentIdx >= personaState.orderedPlays.length - 1) return;
  personaState.currentIdx++;
  renderPersonaStep();
}

function updatePersonaStepButtons() {
  const prevBtn = document.getElementById('tvPersonaPrevBtn');
  const nextBtn = document.getElementById('tvPersonaNextBtn');
  const total = personaState.orderedPlays.length;
  const idx = personaState.currentIdx;
  if (prevBtn) prevBtn.disabled = !total || idx <= 0;
  if (nextBtn) nextBtn.disabled = !total || idx >= total - 1;
}

function highlightSceneNode(sceneId) {
  document.querySelectorAll('#tvSvg .scene-node .scene-node-rect').forEach(r => {
    r.setAttribute('stroke', 'rgba(196,168,130,0.3)');
    r.setAttribute('stroke-width', '1.2');
  });
  const node = document.querySelector(`#tvSvg .scene-node[data-scene-id="${sceneId}"] .scene-node-rect`);
  if (node) {
    node.setAttribute('stroke', '#c4a882');
    node.setAttribute('stroke-width', '3');
  }
}

function clearSceneHighlight() {
  document.querySelectorAll('#tvSvg .scene-node .scene-node-rect').forEach(r => {
    r.setAttribute('stroke', 'rgba(196,168,130,0.3)');
    r.setAttribute('stroke-width', '1.2');
  });
}

function updatePersonaPanel(persona, play) {
  const infoEl = document.getElementById('tvPersonaInfo');
  const detailEl = document.getElementById('tvDetail');
  const scene = state.scenes.find(s => s.id === play.scene_id);
  const ue = play.user_emotion || {};
  const top3 = Object.entries(typeof ue === 'string' ? JSON.parse(ue) : ue)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, v]) => `${k}:${Number(v).toFixed(2)}`).join(' · ');
  if (infoEl) {
    const total = personaState.orderedPlays.length;
    const stepLabel = total ? `step ${personaState.currentIdx + 1} / ${total}` : '';
    infoEl.innerHTML = `<b style="color:#c4a882;">${escapeHtml(persona.persona_name)}</b> <span style="color:#7c7466;">· ${stepLabel}</span><br>씬 ${scene ? (scene.scene_order + 1) : '?'} · 정렬도 ${(play.alignment != null ? (play.alignment * 100).toFixed(0) + '%' : '—')}`;
  }
  if (detailEl) {
    detailEl.innerHTML = `
      <div style="font-family:'Cormorant Garamond',serif;font-size:1rem;color:#c4a882;margin-bottom:8px;">▶ ${escapeHtml(persona.persona_name)}</div>
      <div style="font-size:0.75rem;color:#7c7466;margin-bottom:10px;">${escapeHtml(persona.strata_label || '')}</div>
      <div style="font-size:0.8rem;color:#e0d8c4;margin-bottom:6px;"><b>씬 ${scene ? (scene.scene_order + 1) : '?'}</b> ${scene ? escapeHtml((scene.text || '').slice(0, 60)) : ''}…</div>
      <div style="font-size:0.75rem;color:#c0b8a4;line-height:1.7;margin-top:10px;">
        <div>🎯 정렬도: <b>${play.alignment != null ? (play.alignment * 100).toFixed(0) + '%' : '—'}</b></div>
        <div>⚠️ mismatch: <b>${escapeHtml(play.mismatch_type || '—')}</b></div>
        <div style="margin-top:6px;color:#7c7466;">감정 top3: ${top3 || '—'}</div>
      </div>`;
  }
}

// ─── 분기 시뮬 (작업 12-4) ────────────────────────────────
// 가상 관객 감정을 주입해 ByeoriEngine + SceneNavigator 로 다음 씬 후보를 미리 본다.
// 최대 2명(A/B) side-by-side 비교.
const SIM_DIMS = ['fear', 'sadness', 'anger', 'joy', 'longing', 'guilt'];
const SIM_DIM_LABELS = { fear:'공포', sadness:'슬픔', anger:'분노', joy:'기쁨', longing:'그리움', guilt:'죄책감' };
const SIM_PRESETS = [
  { key:'echo_seeker', label:'공명 추구 (그리움+슬픔)',   vec:{ longing:0.8, sadness:0.5, joy:0.2 } },
  { key:'grief',       label:'애도 (슬픔+그리움)',         vec:{ sadness:0.8, longing:0.4, guilt:0.2 } },
  { key:'anger_avoid', label:'분노 회피 (분노+공포)',       vec:{ anger:0.7, fear:0.4, sadness:0.2 } },
  { key:'numb',        label:'무감 (모두 낮음)',            vec:{ fear:0.1, sadness:0.1, anger:0.1, joy:0.1, longing:0.1, guilt:0.1 } },
  { key:'guilt',       label:'죄책 (죄책감+공포)',           vec:{ guilt:0.8, fear:0.4, sadness:0.3 } },
  { key:'joyful',      label:'치유 지향 (기쁨+그리움)',      vec:{ joy:0.7, longing:0.4, sadness:0.1 } },
];
const SIM_COLORS = { A: '#c4a882', B: '#6aa383' };

const simState = {
  compareMode: false,
  active: false,
  runners: {
    A: null,
    B: null,
  },
};

// 작업 X — step 컨트롤 (이전/다음/되돌리기). 자동 재생은 폐기.
function _allRunnersDone() {
  const a = simState.runners.A;
  const b = simState.runners.B;
  const aDone = !a || a.done;
  const bDone = !b || b.done;
  return aDone && bDone;
}

function _hasPrev(r) { return r && r.visited && r.visited.length > 1; }
function _anyHasPrev() {
  return _hasPrev(simState.runners.A) || _hasPrev(simState.runners.B);
}

// 버튼 활성 상태 갱신 — sim 진행 상황에 맞춰 매번 호출.
function _updateSimButtons() {
  const prevBtn = document.getElementById('tvSimStartBtn');  // ◀ 이전
  const stepBtn = document.getElementById('tvSimStepBtn');    // 다음 ▶
  if (prevBtn) prevBtn.disabled = !simState.active || !_anyHasPrev();
  // 다음 — sim 미시작 시 활성(시작 트리거), 시작 후엔 모든 runner done 일 때 비활성
  if (stepBtn) stepBtn.disabled = simState.active && _allRunnersDone();
}

// 이전 step — visited 한 칸 pop, currentIdx 복원, 트래젝트리 pop, 후보 재계산
function prevStepSim() {
  if (!simState.active) return;
  let moved = false;
  ['A', 'B'].forEach(k => {
    const r = simState.runners[k];
    if (!_hasPrev(r)) return;
    r.visited.pop();
    r.currentIdx = r.visited[r.visited.length - 1];
    if (r.userTraj.length)    r.userTraj.pop();
    if (r.origTraj.length)    r.origTraj.pop();
    if (r.sceneScores.length) r.sceneScores.pop();
    r.done = false;
    computeRunnerStep(r); // 후보 재계산
    moved = true;
  });
  if (!moved) return;
  redrawSimOverlay();
  updateSimReadout();
  syncStageView();
  _updateSimButtons();
}

function _mkRunner(label) {
  return {
    label,
    emotion: {},
    currentIdx: 0,          // state.scenes 내 인덱스
    visited: [],            // 이미 방문한 인덱스
    userTraj: [],
    origTraj: [],
    sceneScores: [],
    candidateIdx: null,     // navigator 가 제안한 다음 씬 (시각화용)
    candidateIsFallback: false,
    fallbackNarrative: null,
    lastResult: null,       // { alignment, level, shape, transition_pattern, mismatch_type }
    done: false,
  };
}

function _sceneEmotionVec(scene) {
  return scene?.original_emotion || scene?.originalVector || scene?.emotion_dist || scene?.emotion_vector || {};
}
function _sceneReason(scene) {
  return scene?.original_reason_vector || scene?.originalReasonVector || {};
}

function _pickStartIdx(emotion) {
  if (!state.scenes.length) return -1;
  const entries = (state.memory?.meta && state.memory.meta.emotion_entries) || {};
  if (entries && Object.keys(entries).length) {
    // 가장 큰 차원을 진입점 감정으로 사용
    const top = Object.entries(emotion || {}).sort((a,b) => (b[1]||0) - (a[1]||0))[0];
    const topKey = top && top[1] > 0 ? top[0] : null;
    const entryCode = topKey ? entries[topKey] : null;
    if (entryCode) {
      const idx = state.scenes.findIndex(s => (s.meta && s.meta.scene_code) === entryCode);
      if (idx >= 0) return idx;
    }
  }
  // fallback — 첫 씬
  return 0;
}

function initSimPanel() {
  // 프리셋 채우기
  const preset = document.getElementById('tvSimPreset');
  if (preset) {
    preset.innerHTML = ['<option value="">— 프리셋 —</option>']
      .concat(SIM_PRESETS.map(p => `<option value="${p.key}">${escapeHtml(p.label)}</option>`))
      .join('');
    preset.onchange = () => applyPreset(preset.value);
  }

  // A/B 슬라이더 생성
  buildSimSliders('A', document.getElementById('tvSimSliders'));
  buildSimSliders('B', document.getElementById('tvSimSlidersB'));

  const compare = document.getElementById('tvSimCompareToggle');
  if (compare) {
    compare.checked = false;
    compare.onchange = () => {
      simState.compareMode = !!compare.checked;
      const panelB = document.getElementById('tvSimSlidersB');
      if (panelB) panelB.style.display = simState.compareMode ? '' : 'none';
      if (simState.active) { resetSim(); }
    };
  }

  const prevBtn  = document.getElementById('tvSimStartBtn');  // ID 유지 (smoke 호환), 의미는 "◀ 이전"
  const stepBtn  = document.getElementById('tvSimStepBtn');
  const resetBtn = document.getElementById('tvSimResetBtn');
  if (prevBtn)  prevBtn.onclick  = prevStepSim;
  if (stepBtn)  stepBtn.onclick  = () => { if (!simState.active) startSim(); else stepSim(); };
  if (resetBtn) resetBtn.onclick = resetSim;

  const loadBtn = document.getElementById('tvSimLoadFromPersona');
  if (loadBtn) loadBtn.onclick = loadFromSelectedPersona;

  updateSimReadout();
  _updateSimButtons();
}

function buildSimSliders(runnerKey, root) {
  if (!root) return;
  const html = SIM_DIMS.map(dim => `
    <div style="display:flex;align-items:center;gap:6px;margin:2px 0;">
      <span style="min-width:44px;font-size:0.68rem;color:#7c7466;">${SIM_DIM_LABELS[dim]}</span>
      <input type="range" data-sim-runner="${runnerKey}" data-sim-dim="${dim}" min="0" max="1" step="0.05" value="0" style="flex:1;height:14px;">
      <span class="sim-val" data-sim-runner="${runnerKey}" data-sim-dim="${dim}" style="min-width:28px;text-align:right;font-size:0.66rem;color:${SIM_COLORS[runnerKey]};font-variant-numeric:tabular-nums;">0.00</span>
    </div>
  `).join('');
  root.innerHTML = `<div style="font-size:0.62rem;color:#7c7466;margin-bottom:4px;letter-spacing:0.08em;">RUNNER ${runnerKey}</div>${html}`;
  root.querySelectorAll('input[type=range]').forEach(inp => {
    inp.addEventListener('input', () => {
      const span = root.querySelector(`.sim-val[data-sim-runner="${runnerKey}"][data-sim-dim="${inp.dataset.simDim}"]`);
      if (span) span.textContent = Number(inp.value).toFixed(2);
    });
  });
}

function getRunnerEmotion(runnerKey) {
  const root = runnerKey === 'A' ? document.getElementById('tvSimSliders') : document.getElementById('tvSimSlidersB');
  const vec = {};
  if (!root) return vec;
  root.querySelectorAll('input[type=range]').forEach(inp => {
    const v = Number(inp.value);
    if (v > 0) vec[inp.dataset.simDim] = v;
  });
  return vec;
}

function setRunnerEmotion(runnerKey, vec) {
  const root = runnerKey === 'A' ? document.getElementById('tvSimSliders') : document.getElementById('tvSimSlidersB');
  if (!root) return;
  SIM_DIMS.forEach(dim => {
    const inp = root.querySelector(`input[data-sim-runner="${runnerKey}"][data-sim-dim="${dim}"]`);
    const span = root.querySelector(`.sim-val[data-sim-runner="${runnerKey}"][data-sim-dim="${dim}"]`);
    const v = Number(vec && vec[dim] || 0);
    if (inp)  inp.value = v;
    if (span) span.textContent = v.toFixed(2);
  });
}

function applyPreset(key) {
  const p = SIM_PRESETS.find(x => x.key === key);
  if (!p) return;
  setRunnerEmotion('A', p.vec);
}

function loadFromSelectedPersona() {
  const sel = document.getElementById('tvPersonaSelect');
  const id = sel && sel.value;
  if (!id) { alert('페르소나를 먼저 선택하세요.'); return; }
  const persona = personaState.personas.find(p => p.persona_id === id);
  if (!persona || !persona.plays.length) { alert('해당 페르소나에 plays 데이터 없음.'); return; }
  const agg = {};
  let n = 0;
  persona.plays.forEach(pl => {
    const ue = pl.user_emotion;
    const parsed = typeof ue === 'string' ? (ue ? JSON.parse(ue) : {}) : (ue || {});
    Object.entries(parsed).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + Number(v || 0); });
    n++;
  });
  Object.keys(agg).forEach(k => { agg[k] = agg[k] / Math.max(1, n); });
  setRunnerEmotion('A', agg);
}

function startSim() {
  if (!state.scenes.length) { alert('씬이 없습니다.'); return; }
  simState.active = true;
  const aEmo = getRunnerEmotion('A');
  simState.runners.A = _mkRunner('A');
  simState.runners.A.emotion = aEmo;
  simState.runners.A.currentIdx = _pickStartIdx(aEmo);
  simState.runners.A.visited = [simState.runners.A.currentIdx];

  if (simState.compareMode) {
    const bEmo = getRunnerEmotion('B');
    simState.runners.B = _mkRunner('B');
    simState.runners.B.emotion = bEmo;
    simState.runners.B.currentIdx = _pickStartIdx(bEmo);
    simState.runners.B.visited = [simState.runners.B.currentIdx];
  } else {
    simState.runners.B = null;
  }

  // 첫 씬에서 엔진 + 네비게이터 실행 → 후보 계산
  computeRunnerStep(simState.runners.A);
  if (simState.runners.B) computeRunnerStep(simState.runners.B);

  redrawSimOverlay();
  updateSimReadout();
  syncStageView();
  _updateSimButtons();
}

function stepSim() {
  if (!simState.active) { alert('먼저 시작 누르세요.'); return; }
  ['A', 'B'].forEach(k => {
    const r = simState.runners[k];
    if (!r || r.done) return;
    // 후보로 커밋
    if (r.candidateIdx == null) { r.done = true; return; }
    r.currentIdx = r.candidateIdx;
    r.visited.push(r.currentIdx);
    // 이전 씬 기준의 lastResult 의 궤적을 누적: engine 이 이미 [...userTraj, current] 계산했으니,
    // 우리는 커밋된 current 를 userTraj 에 push
    const prevScene = state.scenes[r.visited[r.visited.length - 2]];
    if (prevScene) {
      r.userTraj.push(r.emotion);
      r.origTraj.push(_sceneEmotionVec(prevScene));
      if (r.lastResult) r.sceneScores.push(r.lastResult.current_scene_score);
    }
    computeRunnerStep(r);
  });
  redrawSimOverlay();
  updateSimReadout();
  syncStageView();
  _updateSimButtons();
}

function computeRunnerStep(r) {
  if (!r || r.currentIdx < 0 || r.currentIdx >= state.scenes.length) { r.done = true; return; }
  const scene = state.scenes[r.currentIdx];
  const origEmo = _sceneEmotionVec(scene);
  const origReason = _sceneReason(scene);

  const engineResult = byeoriEngine.calculateStep({
    userVector: { base: r.emotion },
    originalVector: { base: origEmo, reason_analysis: origReason },
    userTrajectory: r.userTraj,
    originalTrajectory: r.origTraj,
    sceneScores: r.sceneScores,
  }, {});
  r.lastResult = engineResult;

  const navResult = sceneNavigator.navigate({
    scenes: state.scenes,
    currentSceneIndex: r.currentIdx,
    visitedScenes: r.visited,
    transitionPattern: engineResult.transition_pattern,
    userEmotion: r.emotion,
    originalEmotion: origEmo,
    playerState: { userEmotion: r.emotion, visitedScenes: r.visited },
  });
  if (navResult) {
    r.candidateIdx = navResult.index;
    r.candidateIsFallback = !!navResult.isFallback;
    r.fallbackNarrative = navResult.fallbackNarrative || null;
  } else {
    r.candidateIdx = null;
    r.candidateIsFallback = false;
    r.fallbackNarrative = null;
    r.done = true;
  }
}

function resetSim() {
  simState.active = false;
  simState.runners.A = null;
  simState.runners.B = null;
  redrawSimOverlay();
  updateSimReadout();
  syncStageView();
  _updateSimButtons();
}

// 디버그 / smoke 용 — window 에 runners 상태 노출
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__tvSimDebug', {
    get() { return simState.runners; },
    configurable: true,
  });
}

function updateSimReadout() {
  const el = document.getElementById('tvSimReadout');
  if (!el) return;
  if (!simState.active) {
    el.innerHTML = '<div style="color:#5c544a;font-size:0.7rem;padding:4px 0;">감정 슬라이더 → 다음 ▶ 으로 시작</div>';
    return;
  }
  el.innerHTML = ['A', 'B'].filter(k => simState.runners[k]).map(k => {
    const r = simState.runners[k];
    const color = SIM_COLORS[k];
    const scene = state.scenes[r.currentIdx];
    const code = scene?.meta?.scene_code || String(scene?.scene_order ?? '?');
    const cand = (r.candidateIdx != null) ? state.scenes[r.candidateIdx] : null;
    const candCode = cand ? (cand.meta?.scene_code || String(cand.scene_order)) : (r.done ? '종료' : '—');
    const res = r.lastResult || {};
    const dbg = res.debug || {};
    const fmt = (x) => (x == null ? '—' : Number(x).toFixed(2));
    const fbTag = r.candidateIsFallback ? ' <span style="color:#b85540;">(fallback)</span>' : '';
    return `
      <div style="border-left:3px solid ${color};padding:4px 8px;margin-bottom:5px;background:rgba(196,168,130,0.03);">
        <div style="color:${color};font-size:0.72rem;margin-bottom:2px;">
          <b>${k}</b> · 씬 <b>${escapeHtml(code)}</b> → <b>${escapeHtml(candCode)}</b>${fbTag}
        </div>
        <div style="color:#a09886;font-size:0.66rem;line-height:1.5;">
          pattern: <b style="color:#e0d8c4;">${escapeHtml(res.transition_pattern || '—')}</b> ·
          bucket ${escapeHtml(res.alignment_bucket || '—')}<br>
          align ${fmt(res.alignment_score)} · level ${fmt(dbg.level)} · shape ${fmt(dbg.shape)}<br>
          ${res.mismatch_type ? `mismatch: <span style="color:#c4a882;">${escapeHtml(res.mismatch_type)}</span>` : ''}
          ${r.candidateIsFallback && r.fallbackNarrative ? `<br><i style="color:#7c7466;">${escapeHtml(r.fallbackNarrative)}</i>` : ''}
        </div>
      </div>`;
  }).join('');
}

function redrawSimOverlay() {
  const svg = document.getElementById('tvSvg');
  if (!svg) return;
  // 기존 overlay 제거
  const prev = svg.querySelector('#simOverlay');
  if (prev) prev.remove();
  if (!simState.active) return;

  const zoomG = svg.querySelector('#zoomG');
  if (!zoomG) return;
  const layer = svgEl('g', { id: 'simOverlay', 'pointer-events': 'none' });

  ['A', 'B'].forEach((k, runnerIdx) => {
    const r = simState.runners[k];
    if (!r) return;
    const color = SIM_COLORS[k];
    const offset = (runnerIdx - 0.5) * 8; // A 위, B 아래 살짝

    // 방문 경로 라인
    if (r.visited.length >= 2) {
      const pts = r.visited.map(i => _sceneNodeCenter(state.scenes[i]?.id)).filter(Boolean);
      if (pts.length >= 2) {
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x + offset},${p.y + offset}`).join(' ');
        layer.appendChild(svgEl('path', { d, stroke: color, 'stroke-width': 2, 'stroke-dasharray': '6,4', fill: 'none', opacity: 0.7 }));
      }
    }
    // 현재 위치: 꽉 찬 링
    const cur = _sceneNodeCenter(state.scenes[r.currentIdx]?.id);
    if (cur) {
      layer.appendChild(svgEl('circle', { cx: cur.x + offset, cy: cur.y + offset, r: 14, stroke: color, 'stroke-width': 3, fill: 'none', opacity: 0.95 }));
    }
    // 후보 위치: 점선 링
    if (r.candidateIdx != null && r.candidateIdx !== r.currentIdx) {
      const cand = _sceneNodeCenter(state.scenes[r.candidateIdx]?.id);
      if (cand) {
        layer.appendChild(svgEl('circle', { cx: cand.x + offset, cy: cand.y + offset, r: 18, stroke: color, 'stroke-width': 2, 'stroke-dasharray': '5,4', fill: 'none', opacity: 0.85 }));
        // 연결 화살 (현재 → 후보)
        if (cur) {
          layer.appendChild(svgEl('line', { x1: cur.x + offset, y1: cur.y + offset, x2: cand.x + offset, y2: cand.y + offset, stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '3,3', opacity: 0.6 }));
        }
      }
    }
  });

  zoomG.appendChild(layer);
}

function _sceneNodeCenter(sceneId) {
  if (!sceneId || !_renderCtx) return null;
  const n = _renderCtx.g.node(sceneId);
  if (!n) return null;
  return { x: n.x, y: n.y };
}

// ─── 그래프 ────────────────────────────────────────────────
function renderGraph() {
  const svg = document.getElementById('tvSvg');
  svg.innerHTML = '';

  const entries = (state.memory.meta && state.memory.meta.emotion_entries) || {};
  const hasEntries = Object.keys(entries).length > 0;
  const codeToScene = {};
  state.scenes.forEach(s => {
    const code = s.meta && s.meta.scene_code ? s.meta.scene_code : String(s.scene_order);
    codeToScene[code] = s;
  });

  // 어떤 씬을 그릴지 결정
  let visibleScenes;
  const linearMode = !hasEntries; // emotion_entries 없는 기억: 선형 전체 표시
  // 핀 모드는 분기 토폴로지를 보여주는 게 목적 → 감정 필터 무시하고 전체 씬 표시
  if (linearMode || state.spatialMode) {
    // 선형 모드 또는 핀 모드: 전체 씬을 표시
    visibleScenes = state.scenes;
  } else if (state.selectedEmotions.size === 0) {
    // emotion_entries 있지만 아무것도 선택 안 됨: 빈 캔버스
    return;
  } else {
    // 선택된 감정의 진입 씬부터 scene_order 끝까지 통과
    const visibleIds = new Set();
    state.selectedEmotions.forEach(emoKey => {
      const entryCode = entries[emoKey];
      const entryScene = codeToScene[entryCode];
      if (!entryScene) return;
      state.scenes.forEach(s => {
        if (s.scene_order >= entryScene.scene_order) visibleIds.add(s.id);
      });
    });
    visibleScenes = state.scenes.filter(s => visibleIds.has(s.id));
  }

  if (visibleScenes.length === 0) return;

  // 통과 카운터: 각 씬을 몇 개의 활성 감정 궤적이 지나가는가
  // 선형 모드에서는 모든 씬 passCount = 1 (단순 표시)
  const passCount = {};
  if (linearMode) {
    visibleScenes.forEach(s => { passCount[s.id] = 1; });
  } else {
    visibleScenes.forEach(s => {
      let count = 0;
      state.selectedEmotions.forEach(emoKey => {
        const entryCode = entries[emoKey];
        const entryScene = codeToScene[entryCode];
        if (entryScene && s.scene_order >= entryScene.scene_order) count++;
      });
      passCount[s.id] = count;
    });
  }

  // dagre 레이아웃
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 140, marginx: 60, marginy: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  visibleScenes.forEach(s => {
    g.setNode(s.id, { width: 160, height: 80, scene: s });
  });

  // choice edge:
  //  - 핀 모드(spatialMode): scene.meta.trajectory_targets (씬 ID 목록) 으로 연결.
  //    런타임 [SceneNavigator.js] 가 보는 데이터와 동일 → 시각화 = 게임 규칙.
  //  - 기본(선형) 모드: 인접 scene_order 자동 연결 (TEM 선형 모델, 시각화 전용).
  if (state.spatialMode) {
    const idSet = new Set(visibleScenes.map(s => s.id));
    visibleScenes.forEach(s => {
      const targets = (s.meta && Array.isArray(s.meta.trajectory_targets)) ? s.meta.trajectory_targets : [];
      targets.forEach(targetId => {
        if (idSet.has(targetId) && targetId !== s.id) {
          g.setEdge(s.id, targetId, { type: 'choice' });
        }
      });
    });
  } else {
    const orderToScene = {};
    visibleScenes.forEach(s => orderToScene[s.scene_order] = s);
    visibleScenes.forEach(s => {
      const next = orderToScene[s.scene_order + 1];
      if (next) g.setEdge(s.id, next.id, { type: 'choice' });
    });
  }

  dagre.layout(g);

  // 감정 지형 모드: VA 투영으로 위치 오버라이드
  if (state.terrainMode) {
    const TERRAIN_W = 1400, TERRAIN_H = 900;
    visibleScenes.forEach(s => {
      // pin_override 있으면 VAD 대신 그 좌표 사용 (admin 명시 지정)
      let v, a;
      const po = s.meta && s.meta.pin_override;
      if (po && typeof po.v === 'number' && typeof po.a === 'number') {
        v = po.v; a = po.a;
      } else {
        const emoVec = s.emotion_dist || {};
        const vad = projectToVAD(emoVec);
        v = vad.v; a = vad.a;
      }
      const n = g.node(s.id);
      if (n) {
        // v: -1 왼쪽(부정), +1 오른쪽(긍정); a: -1 아래(저각성), +1 위(고각성) — 화면 y 반전
        n.x = ((v + 1) / 2) * TERRAIN_W + 80;
        n.y = ((1 - a) / 2) * TERRAIN_H + 80;
      }
    });
  }

  // 사용자 저장 위치 오버라이드 (가장 우선)
  // 핀 모드: scene.meta.trajectory_pin (DB 영속) > nodePositions (localStorage)
  // 기본 모드: nodePositions 만 사용
  visibleScenes.forEach(s => {
    const n = g.node(s.id);
    if (!n) return;
    if (state.spatialMode) {
      const pin = s.meta && s.meta.trajectory_pin;
      if (pin && typeof pin.x === 'number' && typeof pin.y === 'number') {
        n.x = pin.x; n.y = pin.y;
        return;
      }
    }
    const pos = state.nodePositions[s.id];
    if (pos) { n.x = pos.x; n.y = pos.y; }
  });

  const graphInfo = g.graph();
  const W = Math.max(graphInfo.width || 800, 1200);
  const H = Math.max(graphInfo.height || 400, 600);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // ── 줌/팬 그룹 ──
  const zoomG = svgEl('g', { id: 'zoomG' });
  svg.appendChild(zoomG);

  // 감정 지형 배경 (터레인 모드일 때만)
  if (state.terrainMode) {
    drawVaTerrain(zoomG);
  }

  // 핀 모드: 영향권 원을 가장 뒤에 깔기 (edge·node 보다 아래)
  let radiusLayer = null;
  if (state.spatialMode) {
    radiusLayer = svgEl('g', { id: 'spatialRadiusLayer' });
    zoomG.appendChild(radiusLayer);
  }

  // 모든 edge/overlay는 한 레이어에 — 노드보다 먼저 (뒤에 렌더)
  const edgeLayer = svgEl('g', { id: 'edgeLayer' });
  zoomG.appendChild(edgeLayer);

  // 재그리기 가능하도록 현재 그래프 컨텍스트 저장
  _renderCtx = { g, visibleScenes, entries, codeToScene, edgeLayer, radiusLayer };

  // 최초 그리기
  redrawEdges();
  if (state.spatialMode) redrawSpatialRadii();

  // ── 진입 감정 매핑 (씬 → 진입 감정, 있을 경우) ──
  const sceneEntryEmotion = {};
  Object.entries(entries).forEach(([emoKey, code]) => {
    const sc = codeToScene[code];
    if (sc) sceneEntryEmotion[sc.id] = emoKey;
  });

  // ── nodes ──
  g.nodes().forEach(id => {
    const n = g.node(id);
    if (!n) return;
    const s = n.scene;
    const code = s.meta && s.meta.scene_code ? s.meta.scene_code : String(s.scene_order);
    const text = (s.text || '').slice(0, 28) + (s.text && s.text.length > 28 ? '…' : '');

    const authorBridges = (s.meta && Array.isArray(s.meta.author_bridges)) ? s.meta.author_bridges : [];
    const trajBridges = state.trajectoryBridges.filter(b => b.scene_id === s.id);

    const group = svgEl('g', {
      class: 'scene-node',
      'data-scene-id': s.id,
      transform: `translate(${n.x - n.width / 2},${n.y - n.height / 2})`
    });
    group.dataset.sceneId = s.id;
    group.style.cursor = 'grab';
    group.addEventListener('click', () => selectScene(s));

    // 진입점 씬이면 해당 감정 색으로 테두리
    const entryEmo = sceneEntryEmotion[s.id];
    const entryEmoObj = entryEmo ? EMOTIONS.find(e => e.key === entryEmo) : null;
    const isActiveEntry = entryEmo && state.selectedEmotions.has(entryEmo);
    const rectAttrs = {
      class: 'scene-node-rect',
      width: n.width, height: n.height, rx: 4, ry: 4
    };
    if (isActiveEntry && entryEmoObj) {
      rectAttrs.stroke = entryEmoObj.color;
      rectAttrs['stroke-width'] = 2.5;
    }
    group.appendChild(svgEl('rect', rectAttrs));
    // code (좌상단)
    group.appendChild(svgEl('text', {
      class: 'scene-node-code', x: 8, y: 18
    }, code));
    // counter (우상단)
    group.appendChild(svgEl('text', {
      class: 'scene-node-counter', x: n.width - 8, y: 16, 'text-anchor': 'end'
    }, `×${passCount[s.id] || 0}`));
    // text snippet
    group.appendChild(svgEl('text', {
      class: 'scene-node-text', x: 8, y: 38
    }, text));

    // bridge badges (하단)
    let bx = 8;
    const by = n.height - 8;
    authorBridges.forEach((b, i) => {
      if (i >= 3) return;
      const w = 20;
      group.appendChild(svgEl('rect', { x: bx, y: by - 10, width: w, height: 12, rx: 2, ry: 2, class: 'badge-author' }));
      group.appendChild(svgEl('text', { x: bx + 4, y: by, class: 'badge-text' }, '🔗'));
      bx += w + 3;
    });
    trajBridges.forEach((b, i) => {
      if (i >= 3) return;
      const w = 20;
      group.appendChild(svgEl('rect', { x: bx, y: by - 10, width: w, height: 12, rx: 2, ry: 2, class: 'badge-trajectory' }));
      group.appendChild(svgEl('text', { x: bx + 4, y: by, class: 'badge-text' }, '🌊'));
      bx += w + 3;
    });

    zoomG.appendChild(group);
  });

  // ── 줌/팬 (한 번만 붙임) ──
  attachZoomPan(svg, zoomG);

  // ── 노드 드래그 ──
  attachNodeDrag(svg, g);

  // ── 시뮬 overlay 재적용 (그래프 재렌더 이후 좌표 기준으로 다시 그리기)
  redrawSimOverlay();
  // 작업 15 — 위치 레이어도 같은 scene 갱신을 받음
  if (state._stageMounted) syncStageView();
}

let _zoomPanAttached = false;
let _pan = { scale: 1, tx: 0, ty: 0 };

function attachZoomPan(svg, zoomG) {
  const apply = () => {
    state.zoomScale = _pan.scale;
    zoomG.setAttribute('transform', `translate(${_pan.tx},${_pan.ty}) scale(${_pan.scale})`);
  };
  apply(); // 재렌더 시에도 현재 팬 상태 유지

  if (_zoomPanAttached) return;
  _zoomPanAttached = true;

  let dragging = false, lastX = 0, lastY = 0;

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    const factor = ev.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(4, _pan.scale * factor));
    _pan.tx = mx - (mx - _pan.tx) * (newScale / _pan.scale);
    _pan.ty = my - (my - _pan.ty) * (newScale / _pan.scale);
    _pan.scale = newScale;
    const zg = document.getElementById('zoomG');
    if (zg) { state.zoomScale = _pan.scale; zg.setAttribute('transform', `translate(${_pan.tx},${_pan.ty}) scale(${_pan.scale})`); }
  }, { passive: false });

  svg.addEventListener('mousedown', (ev) => {
    if (ev.target.closest('.scene-node')) return; // 노드는 드래그 핸들러가 처리
    dragging = true; lastX = ev.clientX; lastY = ev.clientY;
    svg.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (ev) => {
    if (!dragging) return;
    _pan.tx += ev.clientX - lastX;
    _pan.ty += ev.clientY - lastY;
    lastX = ev.clientX; lastY = ev.clientY;
    const zg = document.getElementById('zoomG');
    if (zg) zg.setAttribute('transform', `translate(${_pan.tx},${_pan.ty}) scale(${_pan.scale})`);
  });
  window.addEventListener('mouseup', () => {
    dragging = false; svg.style.cursor = '';
  });
}

// ─── 노드 드래그 ──────────────────────────────────────────
let _nodeDrag = { active: null, suppressClick: false, currentGraph: null };

function attachNodeDrag(svg, g) {
  _nodeDrag.currentGraph = g;

  svg.querySelectorAll('.scene-node').forEach(group => {
    group.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      const sceneId = group.dataset.sceneId;
      if (!sceneId) return;
      const gg = _nodeDrag.currentGraph;
      const node = gg && gg.node(sceneId);
      if (!node) return;
      _nodeDrag.active = {
        sceneId, node, group,
        startMouseX: ev.clientX, startMouseY: ev.clientY,
        origX: node.x, origY: node.y,
        moved: false,
      };
      group.style.cursor = 'grabbing';
    });
    group.addEventListener('click', (ev) => {
      if (_nodeDrag.suppressClick) { ev.stopPropagation(); _nodeDrag.suppressClick = false; }
    });
  });

  if (!attachNodeDrag._bound) {
    attachNodeDrag._bound = true;
    window.addEventListener('mousemove', (ev) => {
      const d = _nodeDrag.active;
      if (!d) return;
      const dx = (ev.clientX - d.startMouseX) / state.zoomScale;
      const dy = (ev.clientY - d.startMouseY) / state.zoomScale;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      d.node.x = d.origX + dx;
      d.node.y = d.origY + dy;
      d.group.setAttribute('transform', `translate(${d.node.x - d.node.width / 2},${d.node.y - d.node.height / 2})`);
      updateEdgesForNode(_nodeDrag.currentGraph, d.sceneId);
    });
    window.addEventListener('mouseup', () => {
      const d = _nodeDrag.active;
      if (!d) return;
      if (d.moved) {
        state.nodePositions[d.sceneId] = { x: d.node.x, y: d.node.y };
        saveNodePositions();
        _nodeDrag.suppressClick = true;
        // 터레인 모드 드래그 → scene.meta.pin_override 에 VAD 좌표로 저장
        if (state.terrainMode) savePinOverride(d.sceneId, d.node.x, d.node.y);
        // 핀 모드 드래그 → scene.meta.trajectory_pin + 자동 targets 갱신
        if (state.spatialMode) {
          saveSpatialPin(d.sceneId, d.node.x, d.node.y).then(() => {
            // 다른 씬들도 이 씬을 자기 원 안에 포함시켰는지 재계산
            return recomputeTargetsForOthers(d.sceneId);
          });
        }
      }
      d.group.style.cursor = 'grab';
      _nodeDrag.active = null;
    });
  }
}

function updateEdgesForNode(g, sceneId) {
  // 통합 레이어 전체 재그리기 — 노드 수가 적으니 충분히 빠름
  redrawEdges();
  if (state.spatialMode) redrawSpatialRadii();
}

// 터레인 모드 드래그 시 호출 — VA 좌표(v, a)를 scene.meta.pin_override 에 저장.
// 좌표계: TERRAIN_W=1400, TERRAIN_H=900, margin=80.
async function savePinOverride(sceneId, nodeX, nodeY) {
  const v = Math.max(-1, Math.min(1, (nodeX - 80) / 700 - 1));
  const a = Math.max(-1, Math.min(1, 1 - (nodeY - 80) / 450));
  try {
    const sb = await getSupabaseClient();
    const sc = state.scenes.find(s => s.id === sceneId);
    if (!sc) return;
    const newMeta = Object.assign({}, sc.meta || {}, { pin_override: { v, a } });
    const { error } = await sb.from('scenes').update({ meta: newMeta }).eq('id', sceneId);
    if (error) { console.error('[pin_override] save failed', error); return; }
    sc.meta = newMeta;
    console.log('[Admin] pin_override saved', sceneId, { v, a });
  } catch (e) {
    console.error('[pin_override] error', e);
  }
}

// ─── 디테일 패널 ───────────────────────────────────────────
function selectScene(s) {
  state.selectedSceneId = s.id;
  renderDetail(s, state.detailTab || 'detail');
  // 핀 모드: 선택 변경 시 edge/원 focus 갱신 (선택된 씬만 진하게)
  if (state.spatialMode) {
    redrawEdges();
    redrawSpatialRadii();
  }
}

function renderDetail(s, tab) {
  state.detailTab = tab;
  const container = document.getElementById('tvDetail');
  const code = s.meta && s.meta.scene_code ? s.meta.scene_code : String(s.scene_order);

  // 헤더 + 탭
  const headerHtml = `
    <div style="font-family:'Cormorant Garamond';font-size:1.4rem;color:#c4a882;margin-bottom:4px;">${code}</div>
    <div style="font-size:0.7rem;color:#7c7466;margin-bottom:14px;">scene_order ${s.scene_order}</div>
    <div style="display:flex;gap:0;border-bottom:1px solid rgba(196,168,130,0.15);margin-bottom:14px;">
      <button class="tv-tab" data-tab="detail" style="flex:1;padding:8px;background:none;border:none;color:${tab==='detail'?'#c4a882':'#7c7466'};border-bottom:2px solid ${tab==='detail'?'#c4a882':'transparent'};font-size:0.8rem;cursor:pointer;font-family:inherit;">씬 디테일</button>
      <button class="tv-tab" data-tab="compare" style="flex:1;padding:8px;background:none;border:none;color:${tab==='compare'?'#c4a882':'#7c7466'};border-bottom:2px solid ${tab==='compare'?'#c4a882':'transparent'};font-size:0.8rem;cursor:pointer;font-family:inherit;">경로 비교</button>
    </div>
  `;

  const bodyHtml = tab === 'compare' ? renderCompareTab(s) : renderDetailTab(s);
  container.innerHTML = headerHtml + bodyHtml;

  // 탭 핸들러
  container.querySelectorAll('.tv-tab').forEach(btn => {
    btn.addEventListener('click', () => renderDetail(s, btn.dataset.tab));
  });

  // 편집 모드 이벤트 바인딩
  if (tab === 'detail') bindDetailFormEvents(s);
}

// 잔상 유령 편집 패널 — 씬 편집기와 같은 자리(#tvDetail), 잔상 전용 UI (2026-05-16).
// 잔상 유령은 scene row 가 아니라 memories.ghost_condensation_points 의 한 점.
// 편집 필드: text(잔상 텍스트) / pollution_threshold(등장 임계) / 삭제. 위치는 지형 드래그.
function renderGhostDetail(ghostIdx) {
  const container = document.getElementById('tvDetail');
  if (!container) return;
  const gp = (typeof LumenAdminStageView.getGhostPoint === 'function')
    ? LumenAdminStageView.getGhostPoint(ghostIdx) : null;
  if (!gp) {
    container.innerHTML = '<div class="tv-detail-empty">잔상 유령을 찾을 수 없습니다.</div>';
    return;
  }
  const thr = gp.pollution_threshold != null ? gp.pollution_threshold : 0;

  container.innerHTML = `
    <div style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;color:#c8c8d0;margin-bottom:4px;">잔상 유령 P${ghostIdx}</div>
    <div style="font-size:0.7rem;color:#7c7466;margin-bottom:16px;">좌표 (${gp.x.toFixed(1)}, ${gp.z.toFixed(1)}) · 위치는 지형에서 마커를 드래그</div>

    <label style="display:block;font-size:0.75rem;color:#c4a882;margin-bottom:6px;">잔상 텍스트 <span style="color:#7c7466;">— 떠도는 소문 한 조각</span></label>
    <textarea id="ghostTextInput" rows="3" placeholder="비워두면 메모리 echo_words 풀에서 빌려옴" style="width:100%;box-sizing:border-box;padding:8px;background:rgba(20,20,28,0.8);border:1px solid rgba(200,200,208,0.3);color:#e0d8c4;font-family:inherit;font-size:0.85rem;border-radius:3px;margin-bottom:16px;resize:vertical;">${escapeHtml(gp.text || '')}</textarea>

    <label style="display:block;font-size:0.75rem;color:#c4a882;margin-bottom:4px;">등장 임계 (pollution_threshold)</label>
    <div style="font-size:0.7rem;color:#7c7466;margin-bottom:8px;line-height:1.5;">메모리가 이만큼 오염돼야 이 잔상이 play 화면에 나타남. 0 = 처음부터.</div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:18px;">
      <input type="range" id="ghostThrInput" min="0" max="1" step="0.05" value="${thr}" style="flex:1;">
      <span id="ghostThrVal" style="font-size:0.8rem;color:#c8c8d0;min-width:34px;text-align:right;">${thr.toFixed(2)}</span>
    </div>

    <button id="ghostDeleteBtn" style="width:100%;padding:8px;background:rgba(201,122,106,0.12);border:1px solid rgba(201,122,106,0.4);color:#c97a6a;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.8rem;">이 잔상 유령 삭제</button>
  `;

  const textInput = document.getElementById('ghostTextInput');
  if (textInput) {
    textInput.addEventListener('change', () => {
      LumenAdminStageView.updateGhostPoint(ghostIdx, { text: textInput.value });
    });
  }
  const thrInput = document.getElementById('ghostThrInput');
  const thrVal = document.getElementById('ghostThrVal');
  if (thrInput) {
    thrInput.addEventListener('input', () => {
      if (thrVal) thrVal.textContent = Number(thrInput.value).toFixed(2);
    });
    thrInput.addEventListener('change', () => {
      LumenAdminStageView.updateGhostPoint(ghostIdx, { pollution_threshold: Number(thrInput.value) });
    });
  }
  const delBtn = document.getElementById('ghostDeleteBtn');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      if (!confirm('이 잔상 유령을 삭제할까요?')) return;
      LumenAdminStageView.removeGhostPoint(ghostIdx);
      container.innerHTML = '<div class="tv-detail-empty">잔상 유령이 삭제되었습니다.</div>';
    });
  }
}

// 핀 모드 패널 이벤트 — 반경 변경 / 수동 add / 수동 del.
// 변경 즉시 DB 저장하고 그래프 재렌더.
function bindSpatialPanelEvents(s) {
  const radiusInput = document.getElementById('spatialRadius');
  const radiusVal = document.getElementById('spatialRadiusVal');
  if (radiusInput) {
    // 슬라이더 움직이는 동안에는 라벨만 갱신, 놓으면 저장
    radiusInput.addEventListener('input', () => {
      if (radiusVal) radiusVal.textContent = radiusInput.value;
    });
    radiusInput.addEventListener('change', async () => {
      const newR = Number(radiusInput.value);
      if (!s.meta) s.meta = {};
      s.meta.trajectory_radius = newR;
      // 새 반경 기준 자동 targets 재계산
      try {
        const sb = await getSupabaseClient();
        const newTargets = _renderCtx ? computeAutoTargets(s, _renderCtx.visibleScenes, _renderCtx.g) : (s.meta.trajectory_targets || []);
        const newMeta = Object.assign({}, s.meta, {
          trajectory_radius: newR,
          trajectory_targets: newTargets,
        });
        const { error } = await sb.from('scenes').update({ meta: newMeta }).eq('id', s.id);
        if (error) { console.error('[spatialPin] radius save failed', error); return; }
        s.meta = newMeta;
        redrawSpatialRadii();
        redrawEdges();
        renderDetail(s, state.detailTab || 'detail');
      } catch (e) { console.error(e); }
    });
  }

  // 수동 추가
  const addBtn = document.getElementById('spatialTargetAddBtn');
  const addSel = document.getElementById('spatialTargetAddSel');
  if (addBtn && addSel) {
    addBtn.addEventListener('click', async () => {
      const tid = addSel.value;
      if (!tid) return;
      if (!s.meta) s.meta = {};
      const cur = Array.isArray(s.meta.trajectory_targets) ? s.meta.trajectory_targets.slice() : [];
      if (cur.includes(tid)) return;
      cur.push(tid);
      try {
        const sb = await getSupabaseClient();
        const newMeta = Object.assign({}, s.meta, { trajectory_targets: cur });
        const { error } = await sb.from('scenes').update({ meta: newMeta }).eq('id', s.id);
        if (error) { console.error('[spatialPin] manual add failed', error); return; }
        s.meta = newMeta;
        redrawEdges();
        renderDetail(s, state.detailTab || 'detail');
      } catch (e) { console.error(e); }
    });
  }

  // 수동 삭제
  document.querySelectorAll('.spatialTargetDel').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tid = btn.dataset.tid;
      if (!tid || !s.meta) return;
      const cur = Array.isArray(s.meta.trajectory_targets) ? s.meta.trajectory_targets.filter(t => t !== tid) : [];
      try {
        const sb = await getSupabaseClient();
        const newMeta = Object.assign({}, s.meta, { trajectory_targets: cur });
        const { error } = await sb.from('scenes').update({ meta: newMeta }).eq('id', s.id);
        if (error) { console.error('[spatialPin] manual del failed', error); return; }
        s.meta = newMeta;
        redrawEdges();
        renderDetail(s, state.detailTab || 'detail');
      } catch (e) { console.error(e); }
    });
  });
}

function bindDetailFormEvents(s) {
  // 핀 모드 패널 이벤트 (spatialMode 일 때만 DOM에 존재)
  if (state.spatialMode) bindSpatialPanelEvents(s);

  // 저장 버튼
  const saveBtn = document.getElementById('sceneSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveScene(s));

  // 삭제 버튼
  const delBtn = document.getElementById('sceneDeleteBtn');
  if (delBtn) delBtn.addEventListener('click', () => deleteScene(s));

  // 사운드 드롭다운 → URL 입력칸 연동
  const soundSelect = document.getElementById('sceneSoundSelect');
  const soundUrlInput = document.getElementById('sceneSoundUrl');
  if (soundSelect && soundUrlInput) {
    soundSelect.addEventListener('change', () => {
      if (soundSelect.value === '__custom__') {
        soundUrlInput.style.display = 'block';
        soundUrlInput.focus();
      } else {
        soundUrlInput.style.display = 'none';
        soundUrlInput.value = soundSelect.value;
      }
    });
  }

  // 사운드 미리듣기
  const testBtn = document.getElementById('sceneSoundTestBtn');
  if (testBtn) testBtn.addEventListener('click', () => {
    const sel = document.getElementById('sceneSoundSelect');
    const inp = document.getElementById('sceneSoundUrl');
    const url = (sel && sel.value && sel.value !== '__custom__') ? sel.value : (inp?.value.trim() || '');
    const vol = parseFloat(document.getElementById('sceneSoundVolume').value) || 1;
    if (!url) { alert('사운드를 선택하세요.'); return; }
    previewSound(url, vol);
  });

  // AI 음향 — 프롬프트 초안 (씬 본문 → Claude)
  const soundDraftBtn = document.getElementById('sceneSoundDraftBtn');
  if (soundDraftBtn) soundDraftBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('sceneSoundGenStatus');
    const promptEl = document.getElementById('sceneSoundPrompt');
    const sceneText = (document.getElementById('sceneText')?.value || '').trim();
    if (!sceneText) { alert('씬 본문을 먼저 채우세요.'); return; }
    const motifs = (document.getElementById('sceneMotifs')?.value || '')
      .split(',').map(x => x.trim()).filter(Boolean);
    statusEl.textContent = '초안 받는 중…'; statusEl.style.color = '#7c7466';
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb.functions.invoke('generate-scene-sound', {
        body: { mode: 'draft', sceneText, motifs }
      });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      promptEl.value = (data && data.prompt) || '';
      statusEl.textContent = '✓ 초안 — 다듬고 [생성]';
      statusEl.style.color = '#6aa383';
    } catch (e) {
      console.error(e);
      statusEl.textContent = '❌ ' + (e.message || '초안 실패');
      statusEl.style.color = '#b85540';
    }
  });

  // AI 음향 — 생성 (프롬프트 → ElevenLabs → Storage)
  const soundGenBtn = document.getElementById('sceneSoundGenBtn');
  if (soundGenBtn) soundGenBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('sceneSoundGenStatus');
    const promptEl = document.getElementById('sceneSoundPrompt');
    const prompt = (promptEl?.value || '').trim();
    if (!prompt) { alert('사운드 프롬프트를 채우세요 ([초안] 버튼 또는 직접 입력).'); return; }
    statusEl.textContent = '생성 중… (10~20초)'; statusEl.style.color = '#7c7466';
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb.functions.invoke('generate-scene-sound', {
        body: { mode: 'generate', prompt, sceneId: s.id }
      });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);
      const url = data && data.soundUrl;
      if (!url) throw new Error('soundUrl 없음');
      // 결과 URL 을 custom URL 칸 + 드롭다운에 반영
      const sel = document.getElementById('sceneSoundSelect');
      const inp = document.getElementById('sceneSoundUrl');
      if (sel) sel.value = '__custom__';
      if (inp) { inp.value = url; inp.style.display = 'block'; }
      statusEl.textContent = '✓ 생성됨 — ▶ 미리듣기로 확인 후 저장';
      statusEl.style.color = '#6aa383';
    } catch (e) {
      console.error(e);
      statusEl.textContent = '❌ ' + (e.message || '생성 실패');
      statusEl.style.color = '#b85540';
    }
  });

  // 브릿지 추가
  const addBtn = document.getElementById('bridgeAddBtn');
  if (addBtn) addBtn.addEventListener('click', () => {
    if (!s.meta) s.meta = {};
    if (!Array.isArray(s.meta.author_bridges)) s.meta.author_bridges = [];
    s.meta.author_bridges.push({ id: `ab-${Date.now()}`, text: '', reveal_hint: '' });
    renderDetail(s, 'detail'); // 재렌더
  });

  // 브릿지 삭제
  document.querySelectorAll('.bridgeDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (s.meta?.author_bridges) {
        s.meta.author_bridges.splice(idx, 1);
        renderDetail(s, 'detail');
      }
    });
  });

  // 부정 제약 추가
  document.querySelectorAll('.exclusion-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!s.meta) s.meta = {};
      if (!Array.isArray(s.meta.exclusions)) s.meta.exclusions = [];
      // DOM 상태 먼저 수거 (다른 row 편집 유지)
      const current = collectExclusionsFromDOM() || [];
      const type = btn.dataset.type;
      if (type === 'emotion_threshold') current.push({ condition: { type, emotion: 'fear', min: 0.6 } });
      else if (type === 'contamination_stage') current.push({ condition: { type, stage: 'hypercompletion' } });
      else if (type === 'visited_scene') {
        const firstOrder = state.scenes?.[0]?.scene_order ?? 0;
        current.push({ condition: { type, sceneIndex: firstOrder } });
      }
      s.meta.exclusions = current;
      renderDetail(s, 'detail');
    });
  });

  // 부정 제약 삭제
  document.querySelectorAll('#sceneExclusionsList .exRow-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = collectExclusionsFromDOM() || [];
      const idx = parseInt(btn.dataset.idx, 10);
      current.splice(idx, 1);
      if (!s.meta) s.meta = {};
      s.meta.exclusions = current;
      renderDetail(s, 'detail');
    });
  });
}

async function saveScene(s) {
  const statusEl = document.getElementById('sceneSaveStatus');
  const text = document.getElementById('sceneText').value;
  const emo = {};
  document.querySelectorAll('.sceneEmoInput').forEach(inp => {
    const v = parseFloat(inp.value);
    if (!isNaN(v) && v > 0) emo[inp.dataset.emo] = Math.min(1, Math.max(0, v));
  });
  const motifsStr = document.getElementById('sceneMotifs').value;
  const motifs = motifsStr.split(',').map(x => x.trim()).filter(Boolean);
  const sceneCode = document.getElementById('sceneCode').value.trim();
  const soundSelectEl = document.getElementById('sceneSoundSelect');
  const soundUrlInputEl = document.getElementById('sceneSoundUrl');
  const soundSelectVal = soundSelectEl?.value || '';
  const soundUrl = (soundSelectVal && soundSelectVal !== '__custom__')
    ? soundSelectVal
    : (soundUrlInputEl?.value.trim() || '');
  const soundVolume = parseFloat(document.getElementById('sceneSoundVolume')?.value) || 1;
  const soundRadius = parseFloat(document.getElementById('sceneSoundRadius')?.value) || 15;
  const soundPrompt = (document.getElementById('sceneSoundPrompt')?.value || '').trim();

  // 부정 제약 (DOM row에서 수거)
  const exclusions = collectExclusionsFromDOM();

  // 브릿지 입력 수집
  const bridges = [];
  document.querySelectorAll('.bridgeText').forEach((ta, i) => {
    const hintEl = document.querySelectorAll('.bridgeHint')[i];
    const txt = ta.value.trim();
    if (!txt) return;
    const existing = s.meta?.author_bridges?.[i] || {};
    bridges.push({
      id: existing.id || `ab-${Date.now()}-${i}`,
      text: txt,
      reveal_hint: hintEl ? hintEl.value.trim() : ''
    });
  });

  statusEl.textContent = '저장 중…';
  statusEl.style.color = '#7c7466';

  try {
    const sb = await getSupabaseClient();
    const newMeta = { ...(s.meta || {}) };
    newMeta.motif_tags = motifs;
    newMeta.author_bridges = bridges;
    if (sceneCode) newMeta.scene_code = sceneCode;
    if (soundUrl) {
      newMeta.sound_url = soundUrl;
      newMeta.sound_volume = soundVolume;
      newMeta.sound_radius = soundRadius;
    } else {
      delete newMeta.sound_url;
      delete newMeta.sound_volume;
      delete newMeta.sound_radius;
    }
    // 사운드 프롬프트는 URL 유무와 무관하게 보존 — 나중에 재생성용
    if (soundPrompt) newMeta.sound_prompt = soundPrompt;
    else delete newMeta.sound_prompt;
    if (exclusions) {
      newMeta.exclusions = exclusions;
    } else {
      delete newMeta.exclusions;
    }

    const { error } = await sb.from('scenes').update({
      text,
      emotion_dist: emo,
      emotion_vector: emo,
      // R1-5: jsonb 컬럼에 JSON.stringify 로 문자열을 넣던 버그 — 객체 그대로 저장.
      // (문자열로 들어가면 소비자마다 typeof 검사 + JSON.parse 이중화가 강제됨)
      original_emotion: emo,
      meta: newMeta,
    }).eq('id', s.id);
    if (error) throw error;

    // 로컬 state 업데이트
    s.text = text;
    s.emotion_dist = emo;
    s.original_emotion = emo;
    s.meta = newMeta;

    statusEl.textContent = '✓ 저장됨';
    statusEl.style.color = '#6aa383';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);

    // 그래프 재렌더 (모티프/코드 바뀌면 뱃지/브릿지선 변화)
    renderGraph();
  } catch (e) {
    console.error(e);
    statusEl.textContent = '❌ ' + e.message;
    statusEl.style.color = '#b85540';
  }
}

// 핀 모드 패널 — 우측 디테일 상단에 표시.
// 반경 슬라이더 (저장하면 자동 targets 재계산) + 현재 targets 목록 + 수동 추가/삭제.
function renderSpatialPanel(s) {
  const radius = (s.meta && Number(s.meta.trajectory_radius)) || SPATIAL_DEFAULT_RADIUS;
  const targets = (s.meta && Array.isArray(s.meta.trajectory_targets)) ? s.meta.trajectory_targets : [];
  const pin = s.meta && s.meta.trajectory_pin;
  const idToScene = {};
  state.scenes.forEach(sc => { idToScene[sc.id] = sc; });

  const targetsHtml = targets.length === 0
    ? '<div style="font-size:0.72rem;color:#5c544a;padding:6px 0;font-style:italic;line-height:1.5;">비어있음 — 게임은 이 씬 다음에 <b>안 본 씬 전부</b>를 후보로 봄 (기본 동작 fallback). 핀 기반 분기를 쓰려면 노드를 드래그해서 다른 씬을 원 안에 넣거나 아래에서 수동 추가.</div>'
    : targets.map(tid => {
        const sc = idToScene[tid];
        const code = sc ? (sc.meta?.scene_code || `씬 ${sc.scene_order}`) : `(삭제됨 ${tid.slice(0,6)}…)`;
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 6px;background:rgba(20,20,28,0.5);border:1px solid rgba(196,168,130,0.1);border-radius:2px;margin-bottom:3px;font-size:0.75rem;">
          <span style="flex:1;color:#c0b8a4;">${escapeHtml(code)}</span>
          <button class="spatialTargetDel" data-tid="${tid}" style="padding:2px 6px;font-size:0.65rem;background:transparent;border:1px solid rgba(184,85,64,0.3);color:#b85540;cursor:pointer;border-radius:2px;">✕</button>
        </div>`;
      }).join('');

  // 수동 추가용 셀렉트 — 아직 targets에 없는 씬만
  const addableScenes = state.scenes.filter(sc => sc.id !== s.id && !targets.includes(sc.id));
  const addOptions = addableScenes.map(sc => {
    const code = sc.meta?.scene_code || `씬 ${sc.scene_order}`;
    return `<option value="${sc.id}">${escapeHtml(code)}</option>`;
  }).join('');

  return `
    <div style="background:rgba(196,168,130,0.04);border:1px solid rgba(196,168,130,0.2);border-radius:3px;padding:10px 12px;margin-bottom:14px;">
      <div style="font-size:0.7rem;color:#c4a882;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">📍 핀 모드 (이 씬에서 다음에 갈 수 있는 씬)</div>

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:0.72rem;color:#7c7466;width:60px;">반경</span>
        <input type="range" id="spatialRadius" min="60" max="600" step="10" value="${radius}" style="flex:1;" />
        <span id="spatialRadiusVal" style="font-size:0.72rem;color:#c0b8a4;width:40px;text-align:right;">${radius}</span>
      </div>
      <div style="font-size:0.65rem;color:#5c544a;margin-bottom:10px;line-height:1.4;">
        반경 안에 들어온 씬이 자동으로 아래 목록에 추가됨. ${pin ? `핀 위치: (${Math.round(pin.x)}, ${Math.round(pin.y)})` : '아직 위치 저장 안 됨 — 노드를 한 번 드래그하세요.'}
      </div>

      <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">다음 갈 수 있는 씬 (${targets.length})</div>
      <div id="spatialTargetsList">${targetsHtml}</div>

      ${addableScenes.length > 0 ? `
      <div style="display:flex;gap:4px;margin-top:6px;">
        <select id="spatialTargetAddSel" style="flex:1;padding:3px 6px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-size:0.72rem;border-radius:2px;font-family:inherit;">
          ${addOptions}
        </select>
        <button class="tv-toggle" id="spatialTargetAddBtn" style="padding:3px 10px;font-size:0.7rem;">+ 수동 추가</button>
      </div>
      ` : ''}
    </div>
  `;
}

function renderDetailTab(s) {
  const authorBridges = (s.meta && Array.isArray(s.meta.author_bridges)) ? s.meta.author_bridges : [];
  const trajBridges = state.trajectoryBridges.filter(b => b.scene_id === s.id);
  const motifs = (s.meta && Array.isArray(s.meta.motif_tags)) ? s.meta.motif_tags : [];
  const emo = s.original_emotion ? (typeof s.original_emotion === 'string' ? safeJsonParse(s.original_emotion) : s.original_emotion) : (s.emotion_dist || {});

  // 편집 폼
  const inputStyle = `width:100%;padding:6px 8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.8rem;border-radius:2px;`;
  const labelStyle = `font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;display:block;margin-top:14px;`;
  // R1-5 (2026-07-14): 8축 하드코딩 → 17축 (엔진 판단 축과 동일 목록). 8축만 그리면
  // saveScene 이 화면에 없는 축을 조용히 잘라먹었다 (아래 emo 수집이 입력칸 기준이라).
  // 씬에 이미 있는 비표준 축(longing 등 레거시)은 뒤에 붙여 편집 가능하게 유지.
  const EMO_KEYS = [...DEFAULT_EMOTION_ANCHORS];
  Object.keys(emo || {}).forEach(k => { if (!EMO_KEYS.includes(k)) EMO_KEYS.push(k); });
  const isResidual = s.scene_role === 'residual';
  const roleLabel = isResidual ? '잔상 (Residual / Bridge)' : '원본 (Anchor)';
  const roleColor = isResidual ? '#6aa383' : '#c4a882';
  const hasVoid = s.void_info && s.void_info.sceneVoid;

  // 핀 모드 패널 (spatialMode일 때만)
  const spatialPanel = state.spatialMode ? renderSpatialPanel(s) : '';

  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:0.72rem;">
      <span style="color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;">역할</span>
      <span style="color:${roleColor};font-weight:500;">${roleLabel}</span>
      ${hasVoid ? '<span style="color:#8a7c6a;border:1px dotted #8a7c6a;padding:0 6px;border-radius:2px;font-size:0.68rem;">void</span>' : ''}
    </div>

    ${spatialPanel}

    <label style="${labelStyle}margin-top:0;">본문</label>
    <textarea id="sceneText" rows="6" style="${inputStyle}resize:vertical;line-height:1.5;">${escapeHtml(s.text || '')}</textarea>

    <label style="${labelStyle}">감정 분포 (0~1)</label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
      ${EMO_KEYS.map(k => `
        <label style="display:flex;align-items:center;gap:6px;font-size:0.75rem;color:#a09886;">
          <span style="width:54px;flex-shrink:0;">${k}</span>
          <input type="number" class="sceneEmoInput" data-emo="${k}" min="0" max="1" step="0.05" value="${(emo[k] != null ? emo[k] : 0).toFixed(2)}" style="flex:1;padding:3px 6px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.12);color:#e0d8c4;font-family:inherit;font-size:0.75rem;border-radius:2px;" />
        </label>
      `).join('')}
    </div>

    <label style="${labelStyle}">모티프 태그 (쉼표 구분)</label>
    <input type="text" id="sceneMotifs" value="${escapeHtml(motifs.join(', '))}" style="${inputStyle}" />

    <label style="${labelStyle}">씬 코드 (A, B, C…)</label>
    <input type="text" id="sceneCode" value="${escapeHtml(s.meta?.scene_code || '')}" maxlength="4" style="${inputStyle}width:80px;" />

    <label style="${labelStyle}">사운드 (공간음향)</label>
    <select id="sceneSoundSelect" style="${inputStyle}">
      <option value="">— 없음 —</option>
      ${window.TEM_SOUND_LIBRARY ? window.TEM_SOUND_LIBRARY.map(f => `<option value="${escapeHtml(f)}" ${s.meta?.sound_url === f ? 'selected' : ''}>${escapeHtml(f.replace(/^sounds\//, ''))}</option>`).join('') : ''}
      <option value="__custom__" ${s.meta?.sound_url && !(window.TEM_SOUND_LIBRARY || []).includes(s.meta.sound_url) ? 'selected' : ''}>⚙ 직접 입력…</option>
    </select>
    <input type="text" id="sceneSoundUrl" placeholder="경로 또는 https://..." value="${escapeHtml(s.meta?.sound_url || '')}" style="${inputStyle}margin-top:4px;display:${s.meta?.sound_url && !(window.TEM_SOUND_LIBRARY || []).includes(s.meta.sound_url) ? 'block' : 'none'};" />
    <div style="display:flex;gap:6px;margin-top:4px;align-items:center;">
      <label style="font-size:0.7rem;color:#7c7466;">볼륨</label>
      <input type="number" id="sceneSoundVolume" min="0" max="1" step="0.1" value="${s.meta?.sound_volume ?? 1}" style="width:60px;padding:3px 6px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.12);color:#e0d8c4;font-size:0.75rem;border-radius:2px;" />
      <label style="font-size:0.7rem;color:#7c7466;">반경</label>
      <input type="number" id="sceneSoundRadius" min="1" max="100" step="1" value="${s.meta?.sound_radius ?? 15}" style="width:60px;padding:3px 6px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.12);color:#e0d8c4;font-size:0.75rem;border-radius:2px;" title="이 반경 안에 플레이어가 오면 최대 볼륨" />
      <button class="tv-toggle" id="sceneSoundTestBtn" style="padding:3px 10px;font-size:0.7rem;">▶ 미리듣기</button>
    </div>
    <div style="margin-top:6px;padding:8px;background:rgba(196,168,130,0.04);border:1px solid rgba(196,168,130,0.12);border-radius:2px;">
      <div style="font-size:0.66rem;color:#7c7466;margin-bottom:4px;line-height:1.4;">
        AI 음향 생성 — 씬 본문에서 소리 프롬프트 초안을 받아 다듬은 뒤 생성. 결과는 위 URL 칸에 들어감.
      </div>
      <textarea id="sceneSoundPrompt" rows="2" placeholder="사운드 프롬프트 (영어) — [초안] 버튼으로 채우거나 직접 입력" style="${inputStyle}resize:vertical;font-size:0.72rem;">${escapeHtml(s.meta?.sound_prompt || '')}</textarea>
      <div style="display:flex;gap:6px;margin-top:4px;align-items:center;">
        <button class="tv-toggle" id="sceneSoundDraftBtn" style="padding:3px 10px;font-size:0.7rem;">✎ 초안</button>
        <button class="tv-toggle" id="sceneSoundGenBtn" style="padding:3px 10px;font-size:0.7rem;">🎵 생성</button>
        <span id="sceneSoundGenStatus" style="font-size:0.68rem;color:#7c7466;"></span>
      </div>
    </div>

    <label style="${labelStyle}">이 씬이 뜨지 않을 조건</label>
    <div style="font-size:0.68rem;color:#7c7466;margin-bottom:6px;line-height:1.4;">
      아래 조건 중 하나라도 맞으면 이 씬은 궤적 후보에서 빠짐. 플레이어에겐 이유가 안 보임.
    </div>
    <div id="sceneExclusionsList">
      ${renderExclusionRows(s, EMO_KEYS)}
    </div>
    <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">
      <button class="tv-toggle exclusion-add-btn" data-type="emotion_threshold" style="padding:3px 8px;font-size:0.7rem;">+ 감정 강도</button>
      <button class="tv-toggle exclusion-add-btn" data-type="contamination_stage" style="padding:3px 8px;font-size:0.7rem;">+ 오염 단계</button>
      <button class="tv-toggle exclusion-add-btn" data-type="visited_scene" style="padding:3px 8px;font-size:0.7rem;">+ 씬 방문</button>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px;align-items:center;">
      <button class="tv-toggle" id="sceneSaveBtn" style="padding:6px 14px;font-size:0.78rem;">저장</button>
      <button class="tv-toggle" id="sceneDeleteBtn" style="padding:6px 14px;font-size:0.78rem;color:#b85540;border-color:rgba(184,85,64,0.3);">씬 삭제</button>
      <span id="sceneSaveStatus" style="font-size:0.7rem;color:#7c7466;"></span>
    </div>

    <div style="margin-top:20px;padding-top:14px;border-top:1px solid rgba(196,168,130,0.08);">
      <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">🔗 작가 브릿지 (${authorBridges.length})</div>
      <div id="authorBridgesList">
        ${authorBridges.map((b, i) => `
          <div style="font-size:0.75rem;color:#c0b8a4;padding:8px 10px;border-left:2px solid #6a655a;background:rgba(106,101,90,0.08);margin-bottom:6px;position:relative;">
            <textarea class="bridgeText" data-idx="${i}" rows="2" style="width:100%;padding:4px 6px;background:rgba(20,20,28,0.5);border:1px solid rgba(196,168,130,0.1);color:#c0b8a4;font-family:inherit;font-size:0.75rem;border-radius:2px;resize:vertical;">${escapeHtml(b.text || '')}</textarea>
            <input class="bridgeHint" data-idx="${i}" placeholder="reveal_hint (선택)" value="${escapeHtml(b.reveal_hint || '')}" style="width:calc(100% - 60px);margin-top:4px;padding:3px 6px;background:rgba(20,20,28,0.5);border:1px solid rgba(196,168,130,0.08);color:#c0b8a4;font-family:inherit;font-size:0.7rem;border-radius:2px;" />
            <button class="bridgeDel" data-idx="${i}" style="position:absolute;top:6px;right:6px;padding:2px 6px;font-size:0.65rem;background:transparent;border:1px solid rgba(184,85,64,0.3);color:#b85540;cursor:pointer;border-radius:2px;">삭제</button>
          </div>
        `).join('')}
      </div>
      <button class="tv-toggle" id="bridgeAddBtn" style="padding:4px 10px;font-size:0.7rem;margin-top:4px;">+ 작가 브릿지 추가</button>
    </div>

    ${trajBridges.length ? `
    <div style="margin-top:20px;padding-top:14px;border-top:1px solid rgba(196,168,130,0.08);">
      <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">🌊 궤적 브릿지 (${trajBridges.length}) — 읽기 전용</div>
      ${trajBridges.map(b => `
        <div style="font-size:0.75rem;color:#a8c4d8;padding:8px 10px;border-left:2px solid #4a7c9d;background:rgba(74,124,157,0.08);margin-bottom:6px;">
          ${escapeHtml(b.source_completed_sentence || '(본문 없음)')}
          <div style="font-size:0.65rem;color:#7c7466;margin-top:4px;">진입: ${b.entry_emotion}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}
  `;
}

function safeJsonParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

const EMOTION_LABELS_KO = {
  fear: '두려움', sadness: '슬픔', anger: '분노', guilt: '죄책감',
  shame: '수치', longing: '갈망', numbness: '무감각', isolation: '고립'
};
const STAGE_OPTIONS = [
  { v: 'biased_inclination', l: '편향 (biased_inclination)' },
  { v: 'hypercompletion', l: '과잉 완결 (hypercompletion)' },
  { v: 'stable', l: '안정 (stable)' },
];

function renderExclusionRows(s, emoKeys) {
  const list = Array.isArray(s.meta?.exclusions) ? s.meta.exclusions : [];
  if (list.length === 0) {
    return `<div style="font-size:0.72rem;color:#5c544a;padding:6px 0;font-style:italic;">조건 없음 — 항상 후보에 포함됨</div>`;
  }
  const rowStyle = `background:rgba(20,20,28,0.5);border:1px solid rgba(196,168,130,0.1);border-radius:3px;padding:6px 8px;margin-bottom:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;`;
  const selStyle = `padding:2px 4px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-size:0.72rem;border-radius:2px;font-family:inherit;`;
  const reasonStyle = `flex:1;min-width:80px;padding:2px 4px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.1);color:#a09886;font-size:0.7rem;border-radius:2px;font-family:inherit;`;
  const delStyle = `padding:2px 6px;font-size:0.65rem;background:transparent;border:1px solid rgba(184,85,64,0.3);color:#b85540;cursor:pointer;border-radius:2px;`;

  return list.map((entry, i) => {
    const c = entry.condition || {};
    const reason = escapeHtml(entry.reason || '');
    if (c.type === 'emotion_threshold') {
      const emoOpts = emoKeys.map(k => `<option value="${k}" ${c.emotion === k ? 'selected' : ''}>${EMOTION_LABELS_KO[k] || k}</option>`).join('');
      return `<div class="exclusion-row" data-idx="${i}" data-type="emotion_threshold" style="${rowStyle}">
        <span style="font-size:0.72rem;color:#7c7466;">플레이어</span>
        <select class="exRow-emo" style="${selStyle}">${emoOpts}</select>
        <span style="font-size:0.72rem;color:#7c7466;">가</span>
        <input type="number" class="exRow-min" min="0" max="1" step="0.05" value="${Number(c.min ?? 0.6).toFixed(2)}" style="${selStyle}width:50px;" />
        <span style="font-size:0.72rem;color:#7c7466;">이상일 때</span>
        <input type="text" class="exRow-reason" placeholder="메모 (선택)" value="${reason}" style="${reasonStyle}" />
        <button class="exRow-del" data-idx="${i}" style="${delStyle}">✕</button>
      </div>`;
    }
    if (c.type === 'contamination_stage') {
      const opts = STAGE_OPTIONS.map(o => `<option value="${o.v}" ${c.stage === o.v ? 'selected' : ''}>${o.l}</option>`).join('');
      return `<div class="exclusion-row" data-idx="${i}" data-type="contamination_stage" style="${rowStyle}">
        <span style="font-size:0.72rem;color:#7c7466;">오염 단계가</span>
        <select class="exRow-stage" style="${selStyle}">${opts}</select>
        <span style="font-size:0.72rem;color:#7c7466;">일 때</span>
        <input type="text" class="exRow-reason" placeholder="메모 (선택)" value="${reason}" style="${reasonStyle}" />
        <button class="exRow-del" data-idx="${i}" style="${delStyle}">✕</button>
      </div>`;
    }
    if (c.type === 'visited_scene') {
      const sceneOpts = (state.scenes || []).map(sc => {
        const lbl = sc.meta?.scene_code || `씬 ${sc.scene_order}`;
        return `<option value="${sc.scene_order}" ${Number(c.sceneIndex) === sc.scene_order ? 'selected' : ''}>${escapeHtml(lbl)}</option>`;
      }).join('');
      return `<div class="exclusion-row" data-idx="${i}" data-type="visited_scene" style="${rowStyle}">
        <select class="exRow-scene" style="${selStyle}">${sceneOpts}</select>
        <span style="font-size:0.72rem;color:#7c7466;">을/를 이미 본 뒤</span>
        <input type="text" class="exRow-reason" placeholder="메모 (선택)" value="${reason}" style="${reasonStyle}" />
        <button class="exRow-del" data-idx="${i}" style="${delStyle}">✕</button>
      </div>`;
    }
    return '';
  }).join('');
}

function collectExclusionsFromDOM() {
  const rows = document.querySelectorAll('#sceneExclusionsList .exclusion-row');
  const result = [];
  rows.forEach(row => {
    const type = row.dataset.type;
    const reason = row.querySelector('.exRow-reason')?.value.trim() || '';
    let condition = null;
    if (type === 'emotion_threshold') {
      const emotion = row.querySelector('.exRow-emo')?.value;
      const min = parseFloat(row.querySelector('.exRow-min')?.value);
      if (emotion && !isNaN(min)) condition = { type, emotion, min };
    } else if (type === 'contamination_stage') {
      const stage = row.querySelector('.exRow-stage')?.value;
      if (stage) condition = { type, stage };
    } else if (type === 'visited_scene') {
      const sceneIndex = parseInt(row.querySelector('.exRow-scene')?.value, 10);
      if (!isNaN(sceneIndex)) condition = { type, sceneIndex };
    }
    if (condition) result.push(reason ? { condition, reason } : { condition });
  });
  return result.length > 0 ? result : null;
}

function renderCompareTab(s) {
  const entries = (state.memory.meta && state.memory.meta.emotion_entries) || {};
  const codeToScene = {};
  state.scenes.forEach(sc => {
    const c = sc.meta && sc.meta.scene_code ? sc.meta.scene_code : String(sc.scene_order);
    codeToScene[c] = sc;
  });

  // 선택된 감정 중, 이 씬에 도달하는 궤적만
  const reaching = [];
  state.selectedEmotions.forEach(emoKey => {
    const entryCode = entries[emoKey];
    const entryScene = codeToScene[entryCode];
    if (!entryScene) return;
    if (entryScene.scene_order > s.scene_order) return; // 못 도달
    const path = state.scenes
      .filter(sc => sc.scene_order >= entryScene.scene_order && sc.scene_order <= s.scene_order)
      .sort((a, b) => a.scene_order - b.scene_order);
    reaching.push({ emoKey, emo: EMOTIONS.find(e => e.key === emoKey), path });
  });

  if (reaching.length === 0) {
    return `<div style="color:#5c544a;font-size:0.85rem;padding:30px 0;text-align:center;">활성 궤적 없음.<br>좌측에서 감정을 선택하세요.</div>`;
  }

  const trajBridges = state.trajectoryBridges.filter(b => b.scene_id === s.id);

  return reaching.map(r => {
    const pathCodes = r.path.map(sc => sc.meta && sc.meta.scene_code ? sc.meta.scene_code : String(sc.scene_order));
    // 경로 상 누적 echo_words
    const echoSet = new Set();
    r.path.forEach(sc => {
      (sc.echo_words || []).forEach(w => echoSet.add(w));
    });
    // 경로 상 누적 모티프
    const motifSet = new Set();
    r.path.forEach(sc => {
      const m = (sc.meta && sc.meta.motif_tags) || [];
      m.forEach(x => motifSet.add(x));
    });
    // 해당 궤적의 궤적 브릿지 (entry_emotion 매칭)
    const matchingTrajBridges = trajBridges.filter(b => b.entry_emotion === r.emoKey);

    return `
      <div style="border:1px solid rgba(196,168,130,0.12);border-left:3px solid ${r.emo.color};border-radius:3px;padding:10px 12px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${r.emo.color};"></span>
          <span style="color:#c4a882;font-size:0.85rem;font-weight:600;">${r.emo.label}</span>
        </div>
        <div style="font-size:0.7rem;color:#7c7466;margin-bottom:4px;">경로</div>
        <div style="font-size:0.82rem;color:#d0c8b4;margin-bottom:8px;font-family:'Cormorant Garamond',serif;letter-spacing:0.05em;">
          ${pathCodes.join(' <span style="color:#5c544a">→</span> ')}
        </div>
        ${motifSet.size ? `
        <div style="font-size:0.7rem;color:#7c7466;margin-bottom:4px;">누적 모티프</div>
        <div style="margin-bottom:8px;">${[...motifSet].map(m => `<span style="display:inline-block;padding:1px 6px;margin:2px 3px 2px 0;font-size:0.65rem;background:rgba(196,168,130,0.08);border-radius:2px;color:#c0b8a4;">${m}</span>`).join('')}</div>
        ` : ''}
        ${echoSet.size ? `
        <div style="font-size:0.7rem;color:#7c7466;margin-bottom:4px;">echo_words</div>
        <div style="margin-bottom:8px;">${[...echoSet].slice(0,8).map(w => `<span style="display:inline-block;padding:1px 6px;margin:2px 3px 2px 0;font-size:0.65rem;background:rgba(196,168,130,0.04);color:#a09886;border-radius:2px;">${escapeHtml(w)}</span>`).join('')}</div>
        ` : ''}
        ${matchingTrajBridges.length ? `
        <div style="font-size:0.7rem;color:#7c7466;margin-bottom:4px;">🌊 이 궤적의 브릿지</div>
        ${matchingTrajBridges.map(b => `
          <div style="font-size:0.75rem;color:#a8c4d8;padding:6px 8px;border-left:2px solid #4a7c9d;background:rgba(74,124,157,0.06);margin-bottom:4px;">
            ${escapeHtml(b.source_completed_sentence || '(본문 없음)')}
          </div>
        `).join('')}
        ` : ''}
      </div>
    `;
  }).join('');
}

// ─── VA 지형 배경 (간단 2D) ─────────────────────────────────
function drawVaTerrain(zoomG) {
  const W = 1400, H = 900, OX = 80, OY = 80;
  const terrainG = svgEl('g', { id: 'terrainG' });
  // 외곽 박스
  terrainG.appendChild(svgEl('rect', {
    x: OX, y: OY, width: W, height: H,
    fill: 'rgba(20,20,28,0.4)', stroke: 'rgba(196,168,130,0.1)', 'stroke-width': 1
  }));
  // 격자 (0.2 단위)
  for (let i = 1; i < 10; i++) {
    const f = i / 10;
    terrainG.appendChild(svgEl('line', {
      x1: OX + W * f, y1: OY, x2: OX + W * f, y2: OY + H,
      stroke: 'rgba(196,168,130,0.04)', 'stroke-width': 1
    }));
    terrainG.appendChild(svgEl('line', {
      x1: OX, y1: OY + H * f, x2: OX + W, y2: OY + H * f,
      stroke: 'rgba(196,168,130,0.04)', 'stroke-width': 1
    }));
  }
  // 중심 축 (v=0, a=0)
  terrainG.appendChild(svgEl('line', {
    x1: OX + W / 2, y1: OY, x2: OX + W / 2, y2: OY + H,
    stroke: 'rgba(196,168,130,0.18)', 'stroke-width': 1, 'stroke-dasharray': '3,4'
  }));
  terrainG.appendChild(svgEl('line', {
    x1: OX, y1: OY + H / 2, x2: OX + W, y2: OY + H / 2,
    stroke: 'rgba(196,168,130,0.18)', 'stroke-width': 1, 'stroke-dasharray': '3,4'
  }));
  // 축 라벨
  const labelStyle = { fill: 'rgba(196,168,130,0.5)', 'font-size': 13, 'font-family': 'Noto Serif KR' };
  terrainG.appendChild(svgEl('text', { ...labelStyle, x: OX + W + 10, y: OY + H / 2 + 4 }, '쾌 →'));
  terrainG.appendChild(svgEl('text', { ...labelStyle, x: OX - 30, y: OY + H / 2 + 4 }, '← 불쾌'));
  terrainG.appendChild(svgEl('text', { ...labelStyle, x: OX + W / 2 - 14, y: OY - 10 }, '↑ 각성'));
  terrainG.appendChild(svgEl('text', { ...labelStyle, x: OX + W / 2 - 14, y: OY + H + 22 }, '↓ 이완'));
  // 사분면 의미 힌트
  const quadStyle = { fill: 'rgba(196,168,130,0.18)', 'font-size': 11, 'font-family': 'Noto Serif KR' };
  terrainG.appendChild(svgEl('text', { ...quadStyle, x: OX + 20, y: OY + 30 }, '공포·분노·수치 영역'));
  terrainG.appendChild(svgEl('text', { ...quadStyle, x: OX + W - 180, y: OY + 30 }, '기쁨·희망 영역'));
  terrainG.appendChild(svgEl('text', { ...quadStyle, x: OX + 20, y: OY + H - 18 }, '슬픔·무감·고립 영역'));
  terrainG.appendChild(svgEl('text', { ...quadStyle, x: OX + W - 160, y: OY + H - 18 }, '안도·평화 영역'));

  zoomG.appendChild(terrainG);
}

// ─── 통합 edge/overlay 렌더 ─────────────────────────────────
let _renderCtx = null; // { g, visibleScenes, entries, codeToScene, edgeLayer }

function redrawEdges() {
  if (!_renderCtx) return;
  const { g, visibleScenes, entries, codeToScene, edgeLayer } = _renderCtx;
  // 레이어 비우기
  while (edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);

  // ── choice edges (실선 cable) ──
  // 핀 모드 + 선택된 씬 있으면 focus mode — selected 의 in/out edge 만 진하게,
  // 나머지는 거의 안 보임. 핀 모드 아니거나 선택 없으면 균일.
  const focusEdges = state.spatialMode && !!state.selectedSceneId;
  g.edges().forEach(e => {
    const n1 = g.node(e.v);
    const n2 = g.node(e.w);
    if (!n1 || !n2) return;

    let stroke, strokeWidth;
    if (focusEdges) {
      const touchesSelected = e.v === state.selectedSceneId || e.w === state.selectedSceneId;
      if (touchesSelected) {
        stroke = '#c4a882';
        strokeWidth = 2;
      } else {
        stroke = 'rgba(196,168,130,0.08)';
        strokeWidth = 0.8;
      }
    } else {
      stroke = 'rgba(196,168,130,0.35)';
      strokeWidth = 1.5;
    }

    edgeLayer.appendChild(svgEl('path', {
      class: 'choice-edge',
      'data-edge-from': e.v, 'data-edge-to': e.w,
      d: cableChoice(n1, n2),
      fill: 'none',
      stroke,
      'stroke-width': strokeWidth,
      'vector-effect': 'non-scaling-stroke',
    }));
  });

  // ── trajectory overlay (각 감정마다 색 있는 cable) ──
  const selectedList = Array.from(state.selectedEmotions);
  selectedList.forEach((emoKey, idx) => {
    const emo = EMOTIONS.find(e => e.key === emoKey);
    const entryCode = entries[emoKey];
    const entryScene = codeToScene[entryCode];
    if (!entryScene) return;
    const path = visibleScenes
      .filter(s => s.scene_order >= entryScene.scene_order)
      .sort((a, b) => a.scene_order - b.scene_order);
    // 궤적별 sag 오프셋
    const sagOffset = (idx - (selectedList.length - 1) / 2) * 6;
    for (let i = 0; i < path.length - 1; i++) {
      const n1 = g.node(path[i].id);
      const n2 = g.node(path[i + 1].id);
      if (!n1 || !n2) continue;
      edgeLayer.appendChild(svgEl('path', {
        class: 'traj-edge',
        d: cablePath(rightPort(n1), leftPort(n2), sagOffset),
        fill: 'none',
        stroke: emo.color,
        'stroke-width': 2.5,
        opacity: 0.75,
      }));
    }
  });

  // ── bridge edges (점선 cable, 노드 하단에서 하단) ──
  const bridgePairs = computeBridgePairs(visibleScenes);
  bridgePairs.forEach(pair => {
    let shouldShow = state.showAllBridges;
    if (!shouldShow) {
      for (const emoKey of state.selectedEmotions) {
        const entryCode = entries[emoKey];
        const entryScene = codeToScene[entryCode];
        if (!entryScene) continue;
        if (entryScene.scene_order <= pair.from.scene_order) {
          shouldShow = true; break;
        }
      }
    }
    if (!shouldShow) return;
    const n1 = g.node(pair.from.id);
    const n2 = g.node(pair.to.id);
    if (!n1 || !n2) return;
    edgeLayer.appendChild(svgEl('path', {
      class: 'bridge-edge',
      d: cableBridge(n1, n2),
      fill: 'none',
      stroke: '#6aa383',
      'stroke-width': 1.2,
      'stroke-dasharray': '5,4',
      opacity: 0.7,
    }));
    // 라벨
    const p1 = bottomPort(n1), p2 = bottomPort(n2);
    const midX = (p1.x + p2.x) / 2;
    const midY = Math.max(p1.y, p2.y) + Math.min(120, Math.abs(p2.x - p1.x) * 0.35) + 8;
    edgeLayer.appendChild(svgEl('text', {
      x: midX, y: midY, 'text-anchor': 'middle',
      fill: '#6aa383', 'font-size': 10, 'font-family': 'Noto Serif KR'
    }, `🔗 ${pair.motif}`));
  });
}

// ─── 핀 모드: 영향권 원 + 자동 trajectory_targets ───────────
function redrawSpatialRadii() {
  if (!_renderCtx) return;
  const { g, visibleScenes, radiusLayer } = _renderCtx;
  if (!radiusLayer) {
    console.warn('[spatialPin] radiusLayer 없음 — renderGraph 시 spatialMode 가 false 였을 가능성');
    return;
  }
  while (radiusLayer.firstChild) radiusLayer.removeChild(radiusLayer.firstChild);

  // Focus + context: 선택된 씬 있으면 그 원만 진하게, 나머지는 거의 안 보임.
  // 선택 없으면 모든 원 중간 농도 — "여기 핀 모드 활성화돼 있다" 만 알리는 정도.
  const hasFocus = !!state.selectedSceneId;
  let drawn = 0;
  visibleScenes.forEach(s => {
    const n = g.node(s.id);
    if (!n) return;
    const r = (s.meta && Number(s.meta.trajectory_radius)) || SPATIAL_DEFAULT_RADIUS;
    const isSelected = state.selectedSceneId === s.id;

    let fill, stroke, strokeWidth, dash;
    if (hasFocus) {
      if (isSelected) {
        fill = 'rgba(196,168,130,0.12)';
        stroke = '#c4a882';
        strokeWidth = 2.5;
        dash = '6,4';
      } else {
        // 클러터 방지 — 거의 안 보임
        fill = 'rgba(196,168,130,0.015)';
        stroke = 'rgba(196,168,130,0.10)';
        strokeWidth = 0.8;
        dash = '3,5';
      }
    } else {
      // 선택 없음 — 모든 원이 약하게
      fill = 'rgba(196,168,130,0.025)';
      stroke = 'rgba(196,168,130,0.30)';
      strokeWidth = 1.2;
      dash = '5,5';
    }

    const circle = svgEl('circle', {
      cx: n.x, cy: n.y, r,
      fill, stroke,
      'stroke-width': strokeWidth,
      'stroke-dasharray': dash,
      'vector-effect': 'non-scaling-stroke',
      'data-radius-for': s.id,
      'pointer-events': 'none',
    });
    radiusLayer.appendChild(circle);
    drawn++;
  });
}

// 두 노드 간 중심 거리.
function nodeDistance(n1, n2) {
  const dx = n1.x - n2.x, dy = n1.y - n2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// scene.meta.trajectory_radius 안에 들어온 다른 씬들을 자동으로 targets 로 계산.
// 반환: 새 targets 배열 (씬 ID 목록).
function computeAutoTargets(scene, visibleScenes, g) {
  const n = g.node(scene.id);
  if (!n) return [];
  const r = (scene.meta && Number(scene.meta.trajectory_radius)) || SPATIAL_DEFAULT_RADIUS;
  const targets = [];
  visibleScenes.forEach(other => {
    if (other.id === scene.id) return;
    const on = g.node(other.id);
    if (!on) return;
    if (nodeDistance(n, on) <= r) targets.push(other.id);
  });
  return targets;
}

// 핀 위치 + targets 자동 갱신을 DB 저장. 드래그 mouseup 시 호출.
async function saveSpatialPin(sceneId, x, y) {
  if (!_renderCtx) return;
  try {
    const sb = await getSupabaseClient();
    const sc = state.scenes.find(s => s.id === sceneId);
    if (!sc) return;
    const newMeta = Object.assign({}, sc.meta || {}, {
      trajectory_pin: { x, y },
    });
    // 자동 targets 갱신 — 이 씬을 기점으로 한 후보 집합
    const autoTargets = computeAutoTargets(sc, _renderCtx.visibleScenes, _renderCtx.g);
    newMeta.trajectory_targets = autoTargets;

    const { error } = await sb.from('scenes').update({ meta: newMeta }).eq('id', sceneId);
    if (error) { console.error('[spatialPin] save failed', error); return; }
    sc.meta = newMeta;
    console.log('[Admin] spatial pin + targets saved', sceneId, { x, y, targets: autoTargets.length });
    // edge 다시 그리기 (이 씬이 가리키는 후보들 화살표)
    redrawEdges();
    redrawSpatialRadii();
    // 우측 패널 갱신 (선택된 씬이면)
    if (state.selectedSceneId === sceneId) {
      renderDetail(sc, state.detailTab || 'detail');
    }
  } catch (e) {
    console.error('[spatialPin] error', e);
  }
}

// 다른 씬의 원 안에 들어왔는지에 따라, 그 씬들의 targets 도 갱신해야 함.
// 즉 드래그된 씬이 다른 씬 A 의 영향권 안으로 들어가면 A 의 targets 에 추가됨.
async function recomputeTargetsForOthers(movedSceneId) {
  if (!_renderCtx) return;
  const { visibleScenes, g } = _renderCtx;
  const moved = state.scenes.find(s => s.id === movedSceneId);
  if (!moved) return;
  const sb = await getSupabaseClient();
  for (const other of visibleScenes) {
    if (other.id === movedSceneId) continue;
    const newTargets = computeAutoTargets(other, visibleScenes, g);
    const oldTargets = (other.meta && other.meta.trajectory_targets) || [];
    // 변경 있으면만 저장
    const changed = newTargets.length !== oldTargets.length ||
      newTargets.some(t => !oldTargets.includes(t)) ||
      oldTargets.some(t => !newTargets.includes(t));
    if (!changed) continue;
    const newMeta = Object.assign({}, other.meta || {}, { trajectory_targets: newTargets });
    const { error } = await sb.from('scenes').update({ meta: newMeta }).eq('id', other.id);
    if (error) { console.error('[spatialPin] cascade save failed', other.id, error); continue; }
    other.meta = newMeta;
  }
  redrawEdges();
}

// ─── Cable 경로 (ComfyUI 대롱대롱) ──────────────────────────
// 노드 중심 간 연결 시 "포트"가 양옆(LR 레이아웃)에 있고, 중력으로 아래로 쳐짐
function cablePath(p1, p2, sag = 0) {
  const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
  const dx = Math.abs(x2 - x1);
  const cx = Math.max(40, dx * 0.5);
  // 양 control point를 중력으로 처지게
  const gravity = Math.min(80, dx * 0.25) + sag;
  return `M${x1},${y1} C${x1 + cx},${y1 + gravity} ${x2 - cx},${y2 + gravity} ${x2},${y2}`;
}
function rightPort(n)  { return { x: n.x + n.width / 2, y: n.y }; }
function leftPort(n)   { return { x: n.x - n.width / 2, y: n.y }; }
function bottomPort(n) { return { x: n.x, y: n.y + n.height / 2 }; }

// 경로 선택을 좀 더 유연하게 — 브릿지는 bottom→bottom, choice는 right→left
function cableChoice(n1, n2) {
  return cablePath(rightPort(n1), leftPort(n2), 0);
}
function cableBridge(n1, n2) {
  const p1 = bottomPort(n1), p2 = bottomPort(n2);
  const dx = Math.abs(p2.x - p1.x);
  const midY = Math.max(p1.y, p2.y) + Math.min(120, dx * 0.35);
  return `M${p1.x},${p1.y} Q${(p1.x + p2.x) / 2},${midY} ${p2.x},${p2.y}`;
}

// ─── 브릿지 쌍 계산 ────────────────────────────────────────
// 같은 모티프를 가진 두 씬 중 scene_order 인접하지 않은 쌍만 추출
// (인접한 것은 choice edge로 이미 표현됨)
function computeBridgePairs(scenes) {
  const pairs = [];
  const byMotif = {};
  scenes.forEach(s => {
    const motifs = (s.meta && Array.isArray(s.meta.motif_tags)) ? s.meta.motif_tags : [];
    motifs.forEach(m => {
      if (!byMotif[m]) byMotif[m] = [];
      byMotif[m].push(s);
    });
  });
  Object.entries(byMotif).forEach(([motif, list]) => {
    if (list.length < 2) return;
    list.sort((a, b) => a.scene_order - b.scene_order);
    // 연속 쌍만 (n개 있으면 n-1개 쌍)
    for (let i = 0; i < list.length - 1; i++) {
      const from = list[i], to = list[i + 1];
      // scene_order 차이가 1이면 choice edge랑 겹치므로 제외
      if (to.scene_order - from.scene_order <= 1) continue;
      pairs.push({ from, to, motif });
    }
  });
  return pairs;
}

// ─── 유틸 ──────────────────────────────────────────────────
function svgEl(tag, attrs = {}, textContent) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (textContent !== undefined) el.textContent = textContent;
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setStatus(msg) {
  document.getElementById('tvStatus').textContent = msg;
}

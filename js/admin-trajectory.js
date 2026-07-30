// admin-trajectory.js — Canvas (궤적 큐레이터)
// 260730 검수 B안: 궤적 2D 탭(dagre + SVG 그래프 엔진) 은퇴 — 위치 stage 3D 뷰 단독,
// 페르소나 STEP 하이라이트는 LumenAdminStageView 3D 핀으로 이식.

import { getSupabaseClient } from './lib/supabaseClient.js';
import LumenAdminStageView from './ui/lumen_admin_stage_view.js?v=260730f'; // 캐시버스터 — 260730f 사물 클릭=씬 편집 열기
import { DEFAULT_EMOTION_ANCHORS } from './shared/math.js';

// ─── 상태 ──────────────────────────────────────────────────
const state = {
  memory: null,       // memory row (with meta)
  scenes: [],         // scenes (with meta)
  choices: [],        // flat choices
  trajectoryBridges: [], // from trajectory_bridges table
  selectedSceneId: null,
};

// ─── 부트 ──────────────────────────────────────────────────
async function initTrajectoryViewer(memoryId) {
  // tv* DOM 없으면 (이 페이지에 뷰어가 없음) 중단
  if (!document.getElementById('tvStageRoot')) return;

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
  document.getElementById('tvMemoryLabel').textContent =
    `${state.memory.code} — ${state.memory.title}`;

  renderStats();
  renderMemoryMeta();
  bindToggles();
  loadPersonasForMemory();

  // 260730 B안 — 위치 stage 뷰 상시 마운트 (레이어 탭 은퇴, 단독 표시). idempotent.
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
    state._stageMounted = true;
  }
  // terrain mesh 는 메모리 단위로 로드 (idempotent — 같은 id 재호출 시 재로드 안 함)
  if (state.memory && state.memory.id) {
    LumenAdminStageView.setMemoryId(state.memory.id);
  }
  syncStageView();
  populateMemorySelect(); // W2-D: 사이드바 기억 선택기 채우기(현재 기억 selected)
}

// W2-D (F3): Canvas 기억 선택기 — 전체 memories 드롭다운, 선택 시 해당 기억 로드.
function _escHtmlTv(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function populateMemorySelect() {
  const sel = document.getElementById('tvMemorySelect');
  if (!sel) return;
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    const { data: list, error } = await sb.from('memories').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    // W3 휴지통 제외 — deleted_at 컬럼 없으면 undefined 라 전부 통과(마이그레이션 전 안전).
    const visible = (list || []).filter(m => !m.deleted_at);
    const curId = state.memory && state.memory.id;
    if (visible.length === 0) { sel.innerHTML = '<option value="">— 기억 없음 —</option>'; return; }
    sel.innerHTML = visible.map(m =>
      `<option value="${m.id}"${String(m.id) === String(curId) ? ' selected' : ''}>${_escHtmlTv(m.title || '(제목 없음)')} — ${_escHtmlTv(m.code || '')}</option>`
    ).join('');
  } catch (e) {
    console.warn('[tv] populateMemorySelect 실패:', e.message);
  }
}
window.tvSwitchMemory = async function tvSwitchMemory(id) {
  if (!id) return;
  const curId = state.memory && state.memory.id;
  if (String(id) === String(curId)) return; // 같은 기억이면 무시
  window.currentMemoryId = id;
  await initTrajectoryViewer(id);
};
// 같은 기억이라도 DB 에서 강제로 다시 읽는다 (판본 복원 뒤처럼 내용이 통째로 바뀐 경우).
window.tvReloadMemory = async function tvReloadMemory(id) {
  const target = id || (state.memory && state.memory.id) || window.currentMemoryId;
  if (!target) return;
  state.memory = null;         // 같은 id 로도 다시 읽히도록 초기화
  state.selectedSceneId = null;
  const detail = document.getElementById('tvDetail');
  if (detail) detail.innerHTML = '<div class="tv-detail-empty">노드를 클릭하세요</div>';
  window.currentMemoryId = target;
  await initTrajectoryViewer(target);
};

// 260730 검수 B안: 궤적/위치 레이어 전환 장치(bindLayerToggle · localStorage 'tv_active_layer') 은퇴
// — 위치 stage 뷰 상시 표시.

// 작업 15 — 위치 레이어로 현 상태 push. scene/시뮬 변동 시점에 호출.
function syncStageView() {
  if (!state._stageMounted) return;
  LumenAdminStageView.setScenes(state.scenes);
  // 분기 시뮬(B runner) 은퇴 (2026-07-30) — 무대 뷰 API 계약 유지를 위한 고정 인자.
  LumenAdminStageView.setSimState({ active: false, runners: { A: null, B: null }, compareMode: false });
}

// ─── 접이식 섹션 공용 토글 (사이드바·씬 패널 공통) ─────────
// 라벨을 누르면 바로 아래 상자를 접었다 폈다 한다. ▶ = 접힘 / ▼ = 펼침.
window.tvToggleSection = function tvToggleSection(bodyId, labelEl) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (labelEl) {
    const caret = labelEl.querySelector('.tv-caret');
    if (caret) caret.textContent = open ? '▶' : '▼';
  }
  try { localStorage.setItem('tv_sec_' + bodyId, open ? '0' : '1'); } catch (e) {}
};
function tvSectionOpen(bodyId, dflt) {
  try {
    const v = localStorage.getItem('tv_sec_' + bodyId);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch (e) {}
  return !!dflt;
}

// ─── 메모리 기본 설정 패널 (좌측 사이드바 "기억 설정") ─────
function renderMemoryMeta() {
  const el = document.getElementById('tvMemoryMeta');
  if (!el) return;
  const m = state.memory;
  if (!m) { el.innerHTML = '<div class="tv-detail-empty">메모리 없음</div>'; return; }

  // 옛 폼은 이 칸을 문자열로 저장했다 — 배열만 받으면 빈칸으로 보였다가 저장 시 값이 날아간다.
  // 문자열도 그대로 받아 보여주고, 저장은 배열로 통일한다.
  const keywords = Array.isArray(m.memory_words) ? m.memory_words.join(', ') : String(m.memory_words || '');
  const inputStyle = `width:100%;box-sizing:border-box;padding:6px 8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.8rem;border-radius:2px;`;
  const labelStyle = `font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;display:block;margin-top:12px;`;
  const helpStyle = `font-size:0.66rem;color:#5c544a;line-height:1.5;margin-top:3px;`;
  const numStyle = `width:62px;box-sizing:border-box;padding:3px 5px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.12);color:#e0d8c4;font-family:inherit;font-size:0.74rem;border-radius:2px;`;

  // 감각 앵커 — jsonb {modality, content, weight}. 문자열로만 저장된 옛 값도 흡수.
  const sa = (m.sensory_anchor && typeof m.sensory_anchor === 'object' && !Array.isArray(m.sensory_anchor))
    ? m.sensory_anchor
    : { modality: '', content: (typeof m.sensory_anchor === 'string' ? m.sensory_anchor : ''), weight: 0.7 };
  const saMod = sa.modality || '';
  const saWeight = sa.weight != null ? sa.weight : 0.7;
  const modOpts = [['', '없음'], ['smell', '냄새 (smell)'], ['sound', '소리 (sound)'], ['touch', '촉감 (touch)']]
    .map(([v, l]) => `<option value="${v}"${saMod === v ? ' selected' : ''}>${l}</option>`).join('');

  const num = (v, d) => (v != null ? v : d);
  const contOpen = tvSectionOpen('metaContBody', false);
  const saOpen = tvSectionOpen('metaSensoryBody', false);

  el.innerHTML = `
    <div style="font-size:0.66rem;color:#5c544a;margin-bottom:6px;">id: ${m.id?.slice(0,8) || '—'}…</div>

    <label style="${labelStyle}margin-top:0;">코드 <span style="color:#5c544a;text-transform:none;letter-spacing:0;">— 기억 고유 번호 (code)</span></label>
    <input type="text" id="metaCode" value="${escapeHtml(m.code || '')}" style="${inputStyle}" />
    <div style="${helpStyle}">기억마다 겹치지 않아야 함. 예: E-005</div>

    <label style="${labelStyle}">제목</label>
    <input type="text" id="metaTitle" value="${escapeHtml(m.title || '')}" style="${inputStyle}" />

    <label style="${labelStyle}">설명</label>
    <textarea id="metaDescription" rows="3" style="${inputStyle}resize:vertical;">${escapeHtml(m.description || '')}</textarea>

    <label style="${labelStyle}">키워드 (쉼표 구분)</label>
    <input type="text" id="metaKeywords" value="${escapeHtml(keywords)}" style="${inputStyle}" />

    <label style="${labelStyle}">완성 문장</label>
    <textarea id="metaCompletedSentence" rows="2" style="${inputStyle}resize:vertical;">${escapeHtml(m.completed_sentence || '')}</textarea>

    <label style="${labelStyle}">페르소나 컨텍스트 <span style="color:#5c544a;text-transform:none;letter-spacing:0;">— 시뮬용 주제 요약</span></label>
    <textarea id="metaPersonaContext" rows="4" placeholder="이 작품의 핵심 테마, 상징, 관계 구도를 시뮬 독자가 알아야 할 만큼 요약." style="${inputStyle}resize:vertical;">${escapeHtml(m.meta?.persona_context || '')}</textarea>

    <div class="tv-section-label" style="cursor:pointer;margin:14px 0 6px;" onclick="tvToggleSection('metaSensoryBody', this)"><span class="tv-caret">${saOpen ? '▼' : '▶'}</span> 감각 앵커</div>
    <div id="metaSensoryBody" style="display:${saOpen ? '' : 'none'};">
      <div style="${helpStyle}margin-bottom:6px;">기억 전체를 관통하는 단일 감각. 실제 반영 = 3D 지형 첫 씬 주변 입자의 색·크기(양태만 소비).</div>
      <label style="${labelStyle}margin-top:0;">양태</label>
      <select id="metaSensoryModality" style="${inputStyle}">${modOpts}</select>
      <label style="${labelStyle}">내용 (단어)</label>
      <input type="text" id="metaSensoryContent" value="${escapeHtml(sa.content || '')}" placeholder="예: 발소리, 소독약, 차가운 대리석" style="${inputStyle}" />
      <label style="${labelStyle}">강도 (0~1)</label>
      <input type="number" id="metaSensoryWeight" min="0" max="1" step="0.05" value="${saWeight}" style="${numStyle}" />
    </div>

    <div class="tv-section-label" style="cursor:pointer;margin:14px 0 6px;" onclick="tvToggleSection('metaContBody', this)"><span class="tv-caret">${contOpen ? '▼' : '▶'}</span> 오염 초기 상태</div>
    <div id="metaContBody" style="display:${contOpen ? '' : 'none'};">
      <div style="${helpStyle}margin-bottom:6px;">관객 첫 진입 시 상태. 봉인되면 런타임 값으로 덮임(1회성 씨앗).</div>
      <label style="${labelStyle}margin-top:0;">누적 깊이 (cont_depth, 0~30)</label>
      <input type="number" id="metaContDepth" min="0" max="30" step="1" value="${num(m.cont_depth, 0)}" style="${numStyle}" />
      <div style="${helpStyle}">0 = 신선 / 5~10 = 누적 / 15+ = 과숙</div>
      <label style="${labelStyle}">3축 (0~1)</label>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">divergence</span><input type="number" id="metaContDivergence" min="0" max="1" step="0.05" value="${num(m.cont_divergence, 0)}" style="${numStyle}" /></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">convergence</span><input type="number" id="metaContConvergence" min="0" max="1" step="0.05" value="${num(m.cont_convergence, 0)}" style="${numStyle}" /></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">heterogeneity</span><input type="number" id="metaContHeterogeneity" min="0" max="1" step="0.05" value="${num(m.cont_heterogeneity, 0)}" style="${numStyle}" /></label>
      </div>
      <label style="${labelStyle}">단계 혼합 (0~1, 합 1)</label>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">stage_1 편향</span><input type="number" id="metaContStage1" min="0" max="1" step="0.01" value="${num(m.cont_stage_1, 0.33)}" style="${numStyle}" /></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">stage_2 병치</span><input type="number" id="metaContStage2" min="0" max="1" step="0.01" value="${num(m.cont_stage_2, 0.33)}" style="${numStyle}" /></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.72rem;color:#a09886;"><span style="width:92px;flex-shrink:0;">stage_3 과완결</span><input type="number" id="metaContStage3" min="0" max="1" step="0.01" value="${num(m.cont_stage_3, 0.34)}" style="${numStyle}" /></label>
      </div>
      <button class="tv-toggle" id="metaContNormBtn" style="padding:3px 8px;font-size:0.68rem;margin-top:5px;">합 = 1 로 맞추기</button>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px;align-items:center;">
      <button class="tv-toggle" id="metaSaveBtn" style="padding:6px 12px;font-size:0.75rem;">저장</button>
      <span id="metaSaveStatus" style="font-size:0.7rem;color:#7c7466;"></span>
    </div>
  `;

  document.getElementById('metaSaveBtn').addEventListener('click', saveMemoryMeta);
  const normBtn = document.getElementById('metaContNormBtn');
  if (normBtn) normBtn.addEventListener('click', () => {
    const ids = ['metaContStage1', 'metaContStage2', 'metaContStage3'];
    const vals = ids.map(id => Math.max(0, parseFloat(document.getElementById(id)?.value) || 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum <= 0) { ids.forEach((id, i) => { document.getElementById(id).value = (i === 2 ? 0.34 : 0.33); }); return; }
    ids.forEach((id, i) => { document.getElementById(id).value = (vals[i] / sum).toFixed(2); });
  });

  // 유령 변주 풀 — Canvas 사이드바로 이사한 실사용 편집기. 기억 바뀔 때마다 다시 읽는다.
  if (typeof window.loadGhostVariants === 'function') {
    try { window.loadGhostVariants(m.id); } catch (e) { console.warn('[tv] loadGhostVariants 실패:', e.message); }
  }
  // 판본 이력 — admin.js 구현. 모듈 내부 currentMemoryId 를 먼저 맞춰야 새 기억 것을 그린다.
  if (typeof window.adminSetCurrentMemory === 'function') window.adminSetCurrentMemory(m.id);
  if (typeof window.renderVersions === 'function') {
    try { window.renderVersions(); } catch (e) { console.warn('[tv] renderVersions 실패:', e.message); }
  }
}

async function saveMemoryMeta() {
  const statusEl = document.getElementById('metaSaveStatus');
  const code = document.getElementById('metaCode').value.trim();
  const title = document.getElementById('metaTitle').value.trim();
  const desc = document.getElementById('metaDescription').value.trim();
  const keywords = document.getElementById('metaKeywords').value.split(',').map(s => s.trim()).filter(Boolean);
  const completed = document.getElementById('metaCompletedSentence').value.trim();
  const personaCtx = document.getElementById('metaPersonaContext').value.trim();

  // 감각 앵커 — 양태 비면 통째로 없음(null) 처리
  const saMod = document.getElementById('metaSensoryModality')?.value || '';
  const saContent = (document.getElementById('metaSensoryContent')?.value || '').trim();
  const saWeightRaw = parseFloat(document.getElementById('metaSensoryWeight')?.value);
  const sensoryAnchor = saMod
    ? { modality: saMod, content: saContent, weight: isNaN(saWeightRaw) ? 0.7 : Math.min(1, Math.max(0, saWeightRaw)) }
    : null;

  const numOr = (id, dflt, lo, hi) => {
    const v = parseFloat(document.getElementById(id)?.value);
    if (isNaN(v)) return dflt;
    return Math.min(hi, Math.max(lo, v));
  };
  const contDepth = Math.round(numOr('metaContDepth', 0, 0, 30));

  statusEl.textContent = '저장 중…';
  statusEl.style.color = '#7c7466';
  try {
    const sb = await getSupabaseClient();
    const nextMeta = { ...(state.memory.meta || {}) };
    if (personaCtx) nextMeta.persona_context = personaCtx;
    else delete nextMeta.persona_context;

    const patch = {
      title, description: desc || null,
      memory_words: keywords.length ? keywords : null,
      completed_sentence: completed || null,
      sensory_anchor: sensoryAnchor,
      cont_depth: contDepth,
      cont_divergence: numOr('metaContDivergence', 0, 0, 1),
      cont_convergence: numOr('metaContConvergence', 0, 0, 1),
      cont_heterogeneity: numOr('metaContHeterogeneity', 0, 0, 1),
      cont_stage_1: numOr('metaContStage1', 0.33, 0, 1),
      cont_stage_2: numOr('metaContStage2', 0.33, 0, 1),
      cont_stage_3: numOr('metaContStage3', 0.34, 0, 1),
      meta: nextMeta,
    };
    if (code) patch.code = code; // 빈 값으로 코드를 지우지는 않음 (UNIQUE 컬럼)

    const { error } = await sb.from('memories').update(patch).eq('id', state.memory.id);
    if (error) throw error;
    Object.assign(state.memory, patch);
    state.memory.memory_words = keywords;
    document.getElementById('tvMemoryLabel').textContent = `${state.memory.code} — ${state.memory.title}`;
    statusEl.textContent = '✓ 저장됨';
    statusEl.style.color = '#6aa383';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
    populateMemorySelect(); // 제목·코드 바뀌면 드롭다운 라벨도 갱신
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
// 감정 진입점 필터 UI 은퇴 (2026-07-30) — 강제 선형화.
// meta.emotion_entries 데이터 자체는 보존 (UI 필터만 은퇴).

function renderStats() {
  const sceneCount = state.scenes.length;
  const choiceCount = state.choices.length;
  const authorBridgeCount = state.scenes.reduce((n, s) =>
    n + (s.meta && Array.isArray(s.meta.author_bridges) ? s.meta.author_bridges.length : 0), 0);
  const trajBridgeCount = state.trajectoryBridges.length;
  document.getElementById('tvStats').innerHTML =
    `씬: ${sceneCount}<br>선택지: ${choiceCount}<br>작가 브릿지: ${authorBridgeCount}<br>궤적 브릿지: ${trajBridgeCount}`;
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
// 260730 통합: 대시보드 [+ 새 메모리 추가] 도 이 모달을 쓴다 (옛 폼 대신).
// Canvas 탭이 아직 안 열렸어도 모달은 body 직속 #tvModal 이라 그대로 뜬다.
window.tvOpenNewMemory = openNewMemoryModal;

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

    // 3) 해당 메모리로 Canvas 전환 (목록 탭에서 만들었을 수도 있으니 화면부터 Canvas 로)
    setTimeout(async () => {
      closeModal();
      window.currentMemoryId = mem.id;
      state.memory = null; // 강제 리로드
      await initTrajectoryViewer(mem.id);
      // 화면 전환은 로딩 끝난 뒤 — 여기서 다시 불리는 init 은 같은 기억이라 그냥 빠져나간다.
      if (typeof window.switchAdminSection === 'function') window.switchAdminSection('canvas');
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
    syncStageView();
    renderStats();
  } catch (e) {
    console.error(e);
    alert('삭제 실패: ' + e.message);
  }
}

// ─── 씬 순서 이동 (▲ ▼) ────────────────────────────────────
// 바로 위/아래 씬과 scene_order 를 맞바꾼다. UPDATE 2회 후 로컬 정렬·무대·패널 갱신.
async function moveSceneOrder(s, dir) {
  const sorted = state.scenes.slice().sort((a, b) => (a.scene_order ?? 0) - (b.scene_order ?? 0));
  const i = sorted.findIndex(x => x.id === s.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  const other = sorted[j];
  let mine = s.scene_order ?? i;
  let theirs = other.scene_order ?? j;
  // 두 씬 순서 값이 같으면(옛 데이터 사고) 맞바꿔도 자리가 안 바뀐다 — 한 칸 벌려준다.
  if (mine === theirs) theirs = mine + dir;
  try {
    const sb = await getSupabaseClient();
    const { error: e1 } = await sb.from('scenes').update({ scene_order: theirs }).eq('id', s.id);
    if (e1) throw e1;
    const { error: e2 } = await sb.from('scenes').update({ scene_order: mine }).eq('id', other.id);
    if (e2) throw e2;
    s.scene_order = theirs;
    other.scene_order = mine;
    state.scenes.sort((a, b) => (a.scene_order ?? 0) - (b.scene_order ?? 0));
    syncStageView();
    renderDetail(s);
  } catch (e) {
    console.error(e);
    alert('순서 이동 실패: ' + e.message);
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
    syncStageView();
    renderStats();
    selectScene(sc);
  } catch (e) {
    console.error(e);
    alert((isBridge ? '잔상 씬' : '씬') + ' 추가 실패: ' + e.message);
  }
}

function bindToggles() {
  // 260730 검수 B안: 표시 옵션 토글(전체 표시/모든 브릿지/감정 지형 모드/레이아웃 초기화)
  // 은퇴 — 전부 2D SVG 그래프 전용이었음.
  // ⚠️ 이 함수는 기억을 바꿀 때마다 다시 불린다. 한 번만 묶지 않으면 같은 버튼에 처리기가
  //    겹겹이 쌓여 "+ 원본 씬" 한 번 눌렀는데 씬이 두세 개 생기는 사고가 난다.
  if (state._togglesBound) return;
  state._togglesBound = true;

  // 사이드바 접이식 섹션 — 지난번에 접어둔 상태 복원
  ['tvMemoryMeta', 'ghostVariantsSection', 'tvVersionsBox', 'tvSeedBox'].forEach(id => {
    const box = document.getElementById(id);
    if (!box) return;
    const dflt = box.style.display !== 'none';
    const open = tvSectionOpen(id, dflt);
    box.style.display = open ? '' : 'none';
    const label = box.previousElementSibling;
    const caret = label && label.querySelector ? label.querySelector('.tv-caret') : null;
    if (caret) caret.textContent = open ? '▼' : '▶';
  });

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
      if (p.persona_id === 'author-seed') continue; // 작가 시딩 — 페르소나 아님 (인구 격리)
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

// 260730 검수 B안: 2D SVG 노드 테두리 강조 → 위치 stage 3D 핀 강조로 이식.
function highlightSceneNode(sceneId) {
  if (typeof LumenAdminStageView.highlightPersonaScene === 'function') {
    LumenAdminStageView.highlightPersonaScene(sceneId);
  }
}

function clearSceneHighlight() {
  if (typeof LumenAdminStageView.clearPersonaHighlight === 'function') {
    LumenAdminStageView.clearPersonaHighlight();
  }
}

// ⚠️ 260730: 이 함수는 예전에 #tvDetail(씬 편집 폼)을 통째로 덮어썼다 — 씬을 고치다가
// 페르소나 step 을 누르면 저장 안 한 입력이 전부 사라졌다. 이제 사이드바의 페르소나 칸
// (#tvPersonaInfo) 안에만 그린다. #tvDetail 은 씬 편집 전용으로 고정.
function updatePersonaPanel(persona, play) {
  const infoEl = document.getElementById('tvPersonaInfo');
  if (!infoEl) return;
  const scene = state.scenes.find(s => s.id === play.scene_id);
  const ue = play.user_emotion || {};
  const top3 = Object.entries(typeof ue === 'string' ? JSON.parse(ue) : ue)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, v]) => `${k}:${Number(v).toFixed(2)}`).join(' · ');
  const total = personaState.orderedPlays.length;
  const stepLabel = total ? `step ${personaState.currentIdx + 1} / ${total}` : '';
  infoEl.innerHTML = `
    <b style="color:#c4a882;">${escapeHtml(persona.persona_name)}</b> <span style="color:#7c7466;">· ${stepLabel}</span>
    ${persona.strata_label ? `<div style="color:#5c544a;">${escapeHtml(persona.strata_label)}</div>` : ''}
    <div style="color:#c0b8a4;margin-top:3px;">씬 ${scene ? (scene.scene_order + 1) : '?'} · 정렬도 <b>${play.alignment != null ? (play.alignment * 100).toFixed(0) + '%' : '—'}</b></div>
    <div>어긋남: ${escapeHtml(play.mismatch_type || '—')}</div>
    <div style="color:#7c7466;">감정 top3: ${top3 || '—'}</div>
    ${scene ? `<div style="color:#5c544a;margin-top:3px;">${escapeHtml((scene.text || '').slice(0, 50))}…</div>` : ''}`;
}

// 260730 검수 B안: 2D SVG 그래프 엔진 전체 은퇴 — dagre 레이아웃 렌더·노드 드래그·줌팬·
// 케이블/브릿지 엣지 그리기·VA 지형 배경 모드·노드 위치 localStorage 저장. 위치 stage 3D 뷰 단독.

// ─── 디테일 패널 ───────────────────────────────────────────
function selectScene(s) {
  state.selectedSceneId = s.id;
  renderDetail(s);
}

// 260730 검수 B안: 경로 비교 탭 은퇴 — 씬 편집 단일 패널.
function renderDetail(s) {
  const container = document.getElementById('tvDetail');
  const code = s.meta && s.meta.scene_code ? s.meta.scene_code : String(s.scene_order);

  const headerHtml = `
    <div style="font-family:'Cormorant Garamond';font-size:1.4rem;color:#c4a882;margin-bottom:4px;">${code}</div>
    <div style="font-size:0.7rem;color:#7c7466;margin-bottom:14px;">scene_order ${s.scene_order}</div>
  `;

  container.innerHTML = headerHtml + renderDetailTab(s);

  // 편집 모드 이벤트 바인딩
  bindDetailFormEvents(s);
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

function bindDetailFormEvents(s) {
  // 저장 버튼
  const saveBtn = document.getElementById('sceneSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveScene(s));

  // 삭제 버튼
  const delBtn = document.getElementById('sceneDeleteBtn');
  if (delBtn) delBtn.addEventListener('click', () => deleteScene(s));

  // 씬 순서 이동 (▲ 앞으로 / ▼ 뒤로)
  const upBtn = document.getElementById('sceneMoveUpBtn');
  if (upBtn) upBtn.addEventListener('click', () => moveSceneOrder(s, -1));
  const downBtn = document.getElementById('sceneMoveDownBtn');
  if (downBtn) downBtn.addEventListener('click', () => moveSceneOrder(s, 1));

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
    renderDetail(s); // 재렌더
  });

  // 브릿지 삭제
  document.querySelectorAll('.bridgeDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (s.meta?.author_bridges) {
        s.meta.author_bridges.splice(idx, 1);
        renderDetail(s);
      }
    });
  });

  // 부정 제약 추가
  // 260730: 예전엔 s.meta.exclusions 에 넣었는데 화면은 s.exclusions 를 먼저 읽어서,
  // 조건이 이미 있는 씬에서는 [+ …] 을 눌러도 아무 일도 안 일어나는 것처럼 보였다. 정본 자리로 통일.
  document.querySelectorAll('.exclusion-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // DOM 상태 먼저 수거 (다른 row 편집 유지). 못 그린 조건은 뒤에 딸려 온다.
      const current = collectExclusionsFromDOM(s.id) || [];
      const type = btn.dataset.type;
      const added = [];
      if (type === 'emotion_threshold') added.push({ condition: { type, emotion: 'fear', min: 0.6 } });
      else if (type === 'contamination_stage') added.push({ condition: { type, stage: 'hypercompletion' } });
      else if (type === 'visited_scene') {
        const firstOrder = state.scenes?.[0]?.scene_order ?? 0;
        added.push({ condition: { type, sceneIndex: firstOrder } });
      }
      // 그릴 수 있는 조건은 앞쪽, 못 그리는 보관분은 뒤쪽 — 새 행은 그릴 수 있는 것들 끝에 붙인다.
      const keepCount = (state._unrenderedExclusions && state._unrenderedExclusions.sceneId === s.id)
        ? state._unrenderedExclusions.items.length : 0;
      const head = keepCount ? current.slice(0, current.length - keepCount) : current;
      const tail = keepCount ? current.slice(current.length - keepCount) : [];
      s.exclusions = head.concat(added, tail);
      if (s.meta) delete s.meta.exclusions; // 레거시 자리 청소
      renderDetail(s);
    });
  });

  // 부정 제약 삭제
  document.querySelectorAll('#sceneExclusionsList .exRow-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const current = collectExclusionsFromDOM(s.id) || [];
      const idx = parseInt(btn.dataset.idx, 10);
      current.splice(idx, 1); // data-idx = 화면에 그려진 행 순서 = current 앞쪽 순서와 일치
      s.exclusions = current;
      if (s.meta) delete s.meta.exclusions;
      renderDetail(s);
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
  // 260730 사물 전용 목록 — 3상태 (키 없음 / 빈 배열 / 목록). null = 키를 지운다는 뜻.
  const objNone = !!document.getElementById('sceneObjectNone')?.checked;
  const objTagsRaw = (document.getElementById('sceneObjectTags')?.value || '')
    .split(',').map(x => x.trim()).filter(Boolean);
  const objectTags = objNone ? [] : (objTagsRaw.length ? objTagsRaw : null);
  // 사물 문장 지정 — "단어: 문장" 한 줄씩. 콜론 첫 개만 구분자로 쓴다 (문장 안 콜론 보존).
  const objectLines = {};
  (document.getElementById('sceneObjectLines')?.value || '').split(/\r?\n/).forEach(line => {
    const t = line.trim();
    if (!t) return;
    const i = t.indexOf(':');
    if (i <= 0) return;
    const w = t.slice(0, i).trim();
    const sentence = t.slice(i + 1).trim();
    if (w && sentence) objectLines[w] = sentence;
  });
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

  // 260730 Canvas 통합 — 옛 전체 폼에만 있던 칸들
  const roleVal = document.getElementById('sceneRole')?.value || '';
  const ghostName = (document.getElementById('sceneGhostName')?.value || '').trim();
  const echoWords = (document.getElementById('sceneEchoWords')?.value || '')
    .split(',').map(x => x.trim()).filter(Boolean);
  const anchorEmotions = (document.getElementById('sceneAnchorEmotions')?.value || '')
    .split(',').map(x => x.trim()).filter(Boolean);
  const vScene = !!document.getElementById('sceneVoidScene')?.checked;
  const vEmotion = !!document.getElementById('sceneVoidEmotion')?.checked;
  const vReason = !!document.getElementById('sceneVoidReason')?.checked;
  const voidCount = (vScene ? 1 : 0) + (vEmotion ? 1 : 0) + (vReason ? 1 : 0);
  // 옛 규칙 그대로: 두 개 이상 체크면 high, 아니면 low. 하나도 없으면 통째로 없음(null).
  const voidInfo = voidCount > 0
    ? { sceneVoid: vScene, emotionVoid: vEmotion, reasonVoid: vReason, voidLevel: voidCount > 1 ? 'high' : 'low' }
    : null;
  const stage1 = (document.getElementById('sceneStage1')?.value || '').trim();
  const stage2 = (document.getElementById('sceneStage2')?.value || '').trim();
  const stage3 = (document.getElementById('sceneStage3')?.value || '').trim();
  const originalReason = (document.getElementById('sceneOriginalReason')?.value || '').trim();

  // 부정 제약 (DOM row에서 수거 + 화면에 못 그린 조건 보존)
  const exclusions = collectExclusionsFromDOM(s.id);

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
    // 260730 사물 전용 목록·문장. null 이면 키 자체를 지워 모티프 태그 폴백으로 되돌린다.
    if (objectTags === null) delete newMeta.object_tags;
    else newMeta.object_tags = objectTags;
    if (Object.keys(objectLines).length) newMeta.object_lines = objectLines;
    else delete newMeta.object_lines;
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
    // 유령 이름 — meta 안에 산다. 비우면 키 자체를 지운다.
    if (ghostName) newMeta.ghost_name = ghostName;
    else delete newMeta.ghost_name;
    // 260730: 잠금은 scenes.exclusions 컬럼에 저장 (상영이 읽는 정본).
    // meta.exclusions 에 쓰던 결함 경로 폐기 — 남은 레거시 키는 저장 시 청소.
    delete newMeta.exclusions;

    const patch = {
      text,
      emotion_dist: emo,
      emotion_vector: emo,
      // R1-5: jsonb 컬럼에 JSON.stringify 로 문자열을 넣던 버그 — 객체 그대로 저장.
      // (문자열로 들어가면 소비자마다 typeof 검사 + JSON.parse 이중화가 강제됨)
      original_emotion: emo,
      exclusions: exclusions,
      // 260730 Canvas 통합 — 아래 7개는 예전엔 옛 폼에서만 저장되던 컬럼
      scene_role: roleVal || null,
      echo_words: echoWords,
      anchor_emotions: anchorEmotions.length ? anchorEmotions : null,
      void_info: voidInfo,
      text_stage_1: stage1 || null,
      text_stage_2: stage2 || null,
      text_stage_3: stage3 || null,
      original_reason: originalReason || null,
      meta: newMeta,
    };
    const { error } = await sb.from('scenes').update(patch).eq('id', s.id);
    if (error) throw error;

    // 로컬 state 업데이트 — DB 로 보낸 값과 화면이 어긋나지 않게 전부 반영
    Object.assign(s, patch);

    statusEl.textContent = '✓ 저장됨';
    statusEl.style.color = '#6aa383';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);

    // 위치 stage 뷰 재동기화 (코드/감정 바뀌면 핀 라벨·위치 갱신)
    syncStageView();
  } catch (e) {
    console.error(e);
    statusEl.textContent = '❌ ' + e.message;
    statusEl.style.color = '#b85540';
  }
}

function renderDetailTab(s) {
  const authorBridges = (s.meta && Array.isArray(s.meta.author_bridges)) ? s.meta.author_bridges : [];
  const trajBridges = state.trajectoryBridges.filter(b => b.scene_id === s.id);
  const motifs = (s.meta && Array.isArray(s.meta.motif_tags)) ? s.meta.motif_tags : [];
  const emo = s.original_emotion ? (typeof s.original_emotion === 'string' ? safeJsonParse(s.original_emotion) : s.original_emotion) : (s.emotion_dist || {});

  // 편집 폼
  const inputStyle = `width:100%;box-sizing:border-box;padding:6px 8px;background:rgba(20,20,28,0.8);border:1px solid rgba(196,168,130,0.15);color:#e0d8c4;font-family:inherit;font-size:0.8rem;border-radius:2px;`;
  const labelStyle = `font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;display:block;margin-top:14px;`;
  // R1-5 (2026-07-14): 8축 하드코딩 → 17축 (엔진 판단 축과 동일 목록). 8축만 그리면
  // saveScene 이 화면에 없는 축을 조용히 잘라먹었다 (아래 emo 수집이 입력칸 기준이라).
  // 씬에 이미 있는 비표준 축(longing 등 레거시)은 뒤에 붙여 편집 가능하게 유지.
  const EMO_KEYS = [...DEFAULT_EMOTION_ANCHORS];
  Object.keys(emo || {}).forEach(k => { if (!EMO_KEYS.includes(k)) EMO_KEYS.push(k); });
  const helpStyle = `font-size:0.66rem;color:#5c544a;line-height:1.5;margin-top:3px;`;
  const roleVal = s.scene_role || '';
  const vi = s.void_info || {};
  // 앵커 감정·잔향 단어 — 배열/문자열 두 형태 모두 들어온 이력이 있다. 둘 다 받아준다.
  const anchorStr = Array.isArray(s.anchor_emotions) ? s.anchor_emotions.join(', ') : String(s.anchor_emotions || '');
  const echoStr = Array.isArray(s.echo_words) ? s.echo_words.join(', ') : String(s.echo_words || '');
  // 260730 사물 전용 칸 — 3상태: 키 없음(모티프 태그 따름) / 빈 배열(사물 없음) / 목록
  const hasObjTagsKey = !!(s.meta && Array.isArray(s.meta.object_tags));
  const objTagStr = hasObjTagsKey ? s.meta.object_tags.join(', ') : '';
  const objLines = (s.meta && s.meta.object_lines && typeof s.meta.object_lines === 'object') ? s.meta.object_lines : {};
  const objLinesStr = Object.keys(objLines).map(k => `${k}: ${objLines[k]}`).join('\n');
  const stageOpen = tvSectionOpen('sceneStageBody', false);
  // 씬 순서 이동 — 경계에서는 못 누르게
  const ordered = state.scenes.slice().sort((a, b) => (a.scene_order ?? 0) - (b.scene_order ?? 0));
  const myIdx = ordered.findIndex(x => x.id === s.id);
  const canUp = myIdx > 0;
  const canDown = myIdx >= 0 && myIdx < ordered.length - 1;
  // 이 편집기가 못 그리는 조건이 몇 개인지 (저장 시 보존됨 — 안내만).
  // splitExclusions 가 state._unrenderedExclusions 에 보관까지 해준다 (아래 renderExclusionRows 와 같은 계산).
  splitExclusions(s);
  const unrenderedCount = state._unrenderedExclusions.items.length;

  return `
    <label style="${labelStyle}margin-top:0;">역할 <span style="color:#5c544a;text-transform:none;letter-spacing:0;">— 이 씬이 원본인지 잔상인지 (scene_role)</span></label>
    <select id="sceneRole" style="${inputStyle}">
      <option value=""${roleVal === '' ? ' selected' : ''}>역할 없음</option>
      <option value="anchor"${roleVal === 'anchor' ? ' selected' : ''}>원본 (anchor)</option>
      <option value="residual"${roleVal === 'residual' ? ' selected' : ''}>잔상 (residual)</option>
    </select>

    <label style="${labelStyle}">유령 이름 (접촉 시 드러남)</label>
    <input type="text" id="sceneGhostName" value="${escapeHtml(s.meta?.ghost_name || '')}" placeholder="예: 준호, 엄마, 그 사람" style="${inputStyle}" />
    <div style="${helpStyle}">비워도 됨.</div>

    <label style="${labelStyle}">본문</label>
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

    <label style="${labelStyle}">잔향 단어 (쉼표 구분)</label>
    <input type="text" id="sceneEchoWords" value="${escapeHtml(echoStr)}" placeholder="무서웠어, 미안해, 후회했어" style="${inputStyle}" />
    <div style="${helpStyle}">이 씬 주변에 떠오르는 낱말 (echo_words).</div>

    <label style="${labelStyle}">앵커 감정 (쉼표 구분)</label>
    <input type="text" id="sceneAnchorEmotions" value="${escapeHtml(anchorStr)}" placeholder="fear, guilt, longing" style="${inputStyle}" />
    <div style="${helpStyle}">이 씬에서 측정할 감정. 비우면 기본 17축. 엔진 판정 축이 여기서 좁혀짐 (anchor_emotions).</div>

    <label style="${labelStyle}">침묵 (VOID)</label>
    <div style="display:flex;flex-direction:column;gap:3px;font-size:0.74rem;color:#a09886;">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="sceneVoidScene"${vi.sceneVoid ? ' checked' : ''} /> 장면이 비어 있음 (sceneVoid)</label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="sceneVoidEmotion"${vi.emotionVoid ? ' checked' : ''} /> 감정이 비어 있음 (emotionVoid)</label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="sceneVoidReason"${vi.reasonVoid ? ' checked' : ''} /> 이유가 비어 있음 (reasonVoid)</label>
    </div>
    <div style="${helpStyle}">체크한 축은 관객이 비워둔 자리로 취급 — 회피 판정·지형 구덩이에 쓰임. 두 개 이상 체크하면 자동으로 '깊음(high)'.</div>

    <label style="${labelStyle}">원본 이유</label>
    <input type="text" id="sceneOriginalReason" value="${escapeHtml(s.original_reason || '')}" placeholder="예: 내가 살릴 수 있었는데…" style="${inputStyle}" />
    <div style="${helpStyle}">작가가 기록한 이유 문장. 귀인 대조에 쓰임 (original_reason).</div>

    <div class="tv-section-label" style="cursor:pointer;margin:14px 0 6px;" onclick="tvToggleSection('sceneStageBody', this)"><span class="tv-caret">${stageOpen ? '▼' : '▶'}</span> 오염 버전 텍스트 (stage 1/2/3)</div>
    <div id="sceneStageBody" style="display:${stageOpen ? '' : 'none'};">
      <div style="${helpStyle}margin-bottom:6px;">관객 오염도가 오르면 본문 대신 이 문장이 뜬다. 비우면 원문 유지. 재생성은 풀버전 편집기(백업)에서.</div>
      <label style="${labelStyle}margin-top:0;">1단계 — 편향</label>
      <textarea id="sceneStage1" rows="3" style="${inputStyle}resize:vertical;">${escapeHtml(s.text_stage_1 || '')}</textarea>
      <label style="${labelStyle}">2단계 — 해석 병치</label>
      <textarea id="sceneStage2" rows="3" style="${inputStyle}resize:vertical;">${escapeHtml(s.text_stage_2 || '')}</textarea>
      <label style="${labelStyle}">3단계 — 과완결</label>
      <textarea id="sceneStage3" rows="3" style="${inputStyle}resize:vertical;">${escapeHtml(s.text_stage_3 || '')}</textarea>
    </div>

    <label style="${labelStyle}">모티프 태그 (쉼표 구분)</label>
    <input type="text" id="sceneMotifs" value="${escapeHtml(motifs.join(', '))}" style="${inputStyle}" />
    <div style="${helpStyle}">되새김 판정·대화 재료·아카이브 검색이 함께 쓰는 목록. 지형에 세울 물건만 따로 정하려면 아래 칸을 쓸 것.</div>

    <label style="${labelStyle}">사물 태그 — 지형에 세울 물건만 (쉼표 구분)</label>
    <input type="text" id="sceneObjectTags" value="${escapeHtml(objTagStr)}" style="${inputStyle}" ${hasObjTagsKey && !objTagStr ? 'disabled' : ''} />
    <label style="display:flex;align-items:center;gap:6px;margin-top:5px;font-size:0.72rem;color:#9a9080;cursor:pointer;">
      <input type="checkbox" id="sceneObjectNone" ${hasObjTagsKey && !objTagStr ? 'checked' : ''}
             onchange="document.getElementById('sceneObjectTags').disabled = this.checked;" />
      이 씬엔 사물 없음 (일부러 아무것도 안 세움)
    </label>
    <div style="${helpStyle}">비워두면 위의 모티프 태그를 그대로 사용. 여기에 적으면 지형 사물은 이 목록만 따르고, 모티프 태그는 되새김·대화·검색에만 쓰인다.</div>

    <label style="${labelStyle}">사물 문장 지정 (한 줄에 <b>단어: 문장</b>)</label>
    <textarea id="sceneObjectLines" rows="3" style="${inputStyle}resize:vertical;" placeholder="팬티: 레이스가 허벅지를 긁었고, 뛰면 비즈가 살을 눌렀다.">${escapeHtml(objLinesStr)}</textarea>
    <div style="${helpStyle}">사물을 길게 눌러 들여다볼 때 뜨는 문장. 안 적으면 씬 본문에서 그 단어가 든 문장을 자동으로 골라 쓴다. 반전급 문장을 콕 집을 때만 사용.</div>

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
    ${unrenderedCount ? `<div style="font-size:0.68rem;color:#9d8a4a;background:rgba(157,138,74,0.08);border:1px solid rgba(157,138,74,0.25);border-radius:2px;padding:5px 7px;margin-top:5px;line-height:1.5;">이 씬에는 이 편집기가 못 그리는 조건 ${unrenderedCount}개가 있음 — 저장해도 <b>보존됨</b>. 편집은 풀버전 편집기에서.</div>` : ''}
    <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">
      <button class="tv-toggle exclusion-add-btn" data-type="emotion_threshold" style="padding:3px 8px;font-size:0.7rem;">+ 감정 강도</button>
      <button class="tv-toggle exclusion-add-btn" data-type="contamination_stage" style="padding:3px 8px;font-size:0.7rem;">+ 오염 단계</button>
      <button class="tv-toggle exclusion-add-btn" data-type="visited_scene" style="padding:3px 8px;font-size:0.7rem;">+ 씬 방문</button>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px;align-items:center;flex-wrap:wrap;">
      <button class="tv-toggle" id="sceneSaveBtn" style="padding:6px 14px;font-size:0.78rem;">저장</button>
      <button class="tv-toggle" id="sceneDeleteBtn" style="padding:6px 14px;font-size:0.78rem;color:#b85540;border-color:rgba(184,85,64,0.3);">씬 삭제</button>
      <button class="tv-toggle" id="sceneMoveUpBtn" style="padding:6px 10px;font-size:0.78rem;" title="한 칸 앞으로"${canUp ? '' : ' disabled'}>▲</button>
      <button class="tv-toggle" id="sceneMoveDownBtn" style="padding:6px 10px;font-size:0.78rem;" title="한 칸 뒤로"${canDown ? '' : ' disabled'}>▼</button>
      <span id="sceneSaveStatus" style="font-size:0.7rem;color:#7c7466;"></span>
    </div>
    <div style="font-size:0.66rem;color:#5c544a;line-height:1.6;margin-top:10px;padding-top:8px;border-top:1px solid rgba(196,168,130,0.06);">
      이 외 레거시 칸(선택지·유령 대사·이유 벡터·씬 타입)은 네비바 [풀버전 편집기] 백업에서 편집.
      원본 파동·3D 모양 미리보기는 가운데 3D 무대와 겹쳐 옮기지 않음.
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

// 이 패널이 그릴 줄 아는 조건 종류. 이 밖의 것(옛 폼에서 자유 JSON 으로 넣은 조건 등)은
// 화면에 못 그리므로 따로 보관했다가 저장할 때 그대로 되돌려 붙인다 — 안 그러면 조용히 지워진다.
const RENDERABLE_EXCLUSION_TYPES = ['emotion_threshold', 'contamination_stage', 'visited_scene'];

function exclusionListOf(s) {
  // 260730: 정본 = scenes.exclusions 컬럼 (상영 play-test 가 읽는 유일한 자리).
  // meta.exclusions 는 이 패널이 잘못 쓰던 레거시 — 표시 폴백으로만 남김.
  return Array.isArray(s.exclusions) ? s.exclusions
    : (Array.isArray(s.meta?.exclusions) ? s.meta.exclusions : []);
}

// 못 그리는 조건을 state 에 챙겨두고, 그릴 수 있는 것만 돌려준다.
function splitExclusions(s) {
  const list = exclusionListOf(s);
  const drawable = [];
  const kept = [];
  list.forEach(entry => {
    const t = entry && entry.condition && entry.condition.type;
    if (RENDERABLE_EXCLUSION_TYPES.includes(t)) drawable.push(entry);
    else kept.push(entry);
  });
  state._unrenderedExclusions = { sceneId: s.id, items: kept };
  return drawable;
}

function renderExclusionRows(s, emoKeys) {
  const list = splitExclusions(s);
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

function collectExclusionsFromDOM(sceneId) {
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
  // 화면에 못 그린 조건을 뒤에 그대로 붙여 되살린다 (조용한 유실 방지).
  const stash = state._unrenderedExclusions;
  const keep = (stash && (!sceneId || stash.sceneId === sceneId)) ? stash.items : [];
  const merged = keep.length ? result.concat(keep) : result;
  return merged.length > 0 ? merged : null;
}

// 260730 검수 B안: renderCompareTab(경로 비교 탭) 은퇴 — 감정 궤적 선택 UI 선행 은퇴로 항상 빈 상태였음.

// ─── 유틸 ──────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setStatus(msg) {
  const el = document.getElementById('tvStatus');
  if (el) el.textContent = msg;
}

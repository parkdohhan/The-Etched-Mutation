// admin-trajectory.js — 다궤적 시각화 UI Phase 1
// dagre + 바닐라 SVG + d3-zoom

import { getSupabaseClient } from './lib/supabaseClient.js';

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
};

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
(async function init() {
  const params = new URLSearchParams(location.search);
  const memoryId = params.get('memory');

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
  bindToggles();
  renderGraph();
})();

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
  const container = document.getElementById('tvEmotionList');
  container.innerHTML = '';
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
}

// ─── 그래프 ────────────────────────────────────────────────
function renderGraph() {
  const svg = document.getElementById('tvSvg');
  svg.innerHTML = '';

  const entries = (state.memory.meta && state.memory.meta.emotion_entries) || {};
  const codeToScene = {};
  state.scenes.forEach(s => {
    const code = s.meta && s.meta.scene_code ? s.meta.scene_code : String(s.scene_order);
    codeToScene[code] = s;
  });

  // 어떤 씬을 그릴지 결정
  let visibleScenes;
  if (state.selectedEmotions.size === 0) {
    // 빈 캔버스
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
  const passCount = {};
  visibleScenes.forEach(s => {
    let count = 0;
    state.selectedEmotions.forEach(emoKey => {
      const entryCode = entries[emoKey];
      const entryScene = codeToScene[entryCode];
      if (entryScene && s.scene_order >= entryScene.scene_order) count++;
    });
    passCount[s.id] = count;
  });

  // dagre 레이아웃
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 140, marginx: 60, marginy: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  visibleScenes.forEach(s => {
    g.setNode(s.id, { width: 160, height: 80, scene: s });
  });

  // choice edge: 같은 memory의 인접 scene_order로 연결 (TEM 선형 모델)
  const orderToScene = {};
  visibleScenes.forEach(s => orderToScene[s.scene_order] = s);
  visibleScenes.forEach(s => {
    const next = orderToScene[s.scene_order + 1];
    if (next) g.setEdge(s.id, next.id, { type: 'choice' });
  });

  dagre.layout(g);

  // 감정 지형 모드: VA 투영으로 위치 오버라이드
  if (state.terrainMode) {
    const TERRAIN_W = 1400, TERRAIN_H = 900;
    visibleScenes.forEach(s => {
      const emoVec = s.emotion_dist || {};
      const { v, a } = projectToVAD(emoVec);
      const n = g.node(s.id);
      if (n) {
        // v: -1 왼쪽(부정), +1 오른쪽(긍정); a: -1 아래(저각성), +1 위(고각성) — 화면 y 반전
        n.x = ((v + 1) / 2) * TERRAIN_W + 80;
        n.y = ((1 - a) / 2) * TERRAIN_H + 80;
      }
    });
  }

  // 사용자 저장 위치 오버라이드 (가장 우선)
  visibleScenes.forEach(s => {
    const pos = state.nodePositions[s.id];
    if (pos) {
      const n = g.node(s.id);
      if (n) { n.x = pos.x; n.y = pos.y; }
    }
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

  // 모든 edge/overlay는 한 레이어에 — 노드보다 먼저 (뒤에 렌더)
  const edgeLayer = svgEl('g', { id: 'edgeLayer' });
  zoomG.appendChild(edgeLayer);

  // 재그리기 가능하도록 현재 그래프 컨텍스트 저장
  _renderCtx = { g, visibleScenes, entries, codeToScene, edgeLayer };

  // 최초 그리기
  redrawEdges();

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
      }
      d.group.style.cursor = 'grab';
      _nodeDrag.active = null;
    });
  }
}

function updateEdgesForNode(g, sceneId) {
  // 통합 레이어 전체 재그리기 — 노드 수가 적으니 충분히 빠름
  redrawEdges();
}

// ─── 디테일 패널 ───────────────────────────────────────────
function selectScene(s) {
  state.selectedSceneId = s.id;
  renderDetail(s, state.detailTab || 'detail');
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
}

function renderDetailTab(s) {
  const authorBridges = (s.meta && Array.isArray(s.meta.author_bridges)) ? s.meta.author_bridges : [];
  const trajBridges = state.trajectoryBridges.filter(b => b.scene_id === s.id);
  const motifs = (s.meta && Array.isArray(s.meta.motif_tags)) ? s.meta.motif_tags : [];

  return `
    <div style="font-size:0.85rem;line-height:1.6;color:#d0c8b4;margin-bottom:18px;">${escapeHtml(s.text || '')}</div>

    ${motifs.length ? `
    <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">모티프</div>
    <div style="margin-bottom:14px;">${motifs.map(m => `<span style="display:inline-block;padding:2px 8px;margin:2px 4px 2px 0;font-size:0.7rem;background:rgba(196,168,130,0.1);border-radius:2px;">${m}</span>`).join('')}</div>
    ` : ''}

    ${authorBridges.length ? `
    <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">🔗 작가 브릿지 (${authorBridges.length})</div>
    ${authorBridges.map(b => `
      <div style="font-size:0.78rem;color:#c0b8a4;padding:8px 10px;border-left:2px solid #6a655a;background:rgba(106,101,90,0.08);margin-bottom:6px;">
        ${escapeHtml(b.text || '')}
        ${b.reveal_hint ? `<div style="font-size:0.65rem;color:#7c7466;margin-top:4px;">↳ ${escapeHtml(b.reveal_hint)}</div>` : ''}
      </div>
    `).join('')}
    ` : ''}

    ${trajBridges.length ? `
    <div style="font-size:0.7rem;color:#7c7466;text-transform:uppercase;letter-spacing:0.1em;margin:14px 0 6px;">🌊 궤적 브릿지 (${trajBridges.length})</div>
    ${trajBridges.map(b => `
      <div style="font-size:0.78rem;color:#a8c4d8;padding:8px 10px;border-left:2px solid #4a7c9d;background:rgba(74,124,157,0.08);margin-bottom:6px;">
        ${escapeHtml(b.source_completed_sentence || '(본문 없음)')}
        <div style="font-size:0.65rem;color:#7c7466;margin-top:4px;">진입: ${b.entry_emotion}</div>
      </div>
    `).join('')}
    ` : ''}
  `;
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
  g.edges().forEach(e => {
    const n1 = g.node(e.v);
    const n2 = g.node(e.w);
    if (!n1 || !n2) return;
    edgeLayer.appendChild(svgEl('path', {
      class: 'choice-edge',
      'data-edge-from': e.v, 'data-edge-to': e.w,
      d: cableChoice(n1, n2),
      fill: 'none',
      stroke: 'rgba(196,168,130,0.35)',
      'stroke-width': 1.5,
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

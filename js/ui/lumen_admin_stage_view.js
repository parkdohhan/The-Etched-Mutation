// lumen_admin_stage_view.js — 작업 15 위치 레이어 (admin Canvas 탭 하단)
//
// 책임 (한 줄): scene 별 stage_position 을 strata 좌표계 탑다운 SVG 위에서
//                드래그로 편집하고, 시뮬 재생 시 가시성/하이라이트를 동기화한다.
//
// 분리 원칙 (작업 15 §발견):
//   - 궤적 레이어(상단 SVG, scene.meta.pin_override) ≠ 위치 레이어(하단, scene.meta.stage_position)
//   - 본 모듈 드래그는 stage_position 만 갱신. _diagAccessMatrix / sceneVA / originalReasonVector
//     무엇도 건드리지 않음.
//
// 좌표:
//   world (x, z) ∈ [-TERRAIN_R, TERRAIN_R], TERRAIN_R = 56 (응결점 / strata 와 동일)
//   SVG viewBox: -60 -60 120 120 (양쪽 4 단위 여유)
//
// 시뮬 동기화 규칙 (스코프 작업 15 가시성 (b) + 패턴 색 (ii)):
//   유령 표시 = 현재 씬 ∪ candidate ∪ visited (그 외는 sim active 시 숨김)
//   현재 씬 = 강조 (큰 원, 고채도)
//   candidate = transition_pattern 색 펄스 링
//   visited = dimmed
//   idle (sim active=false) = 모든 stage_position 보유 씬 표시 (base opacity)

import { getSupabaseClient } from '../lib/supabaseClient.js';

const TERRAIN_R = 56;
const VIEW_PAD = 4;            // viewBox padding in world units
const VB_MIN = -(TERRAIN_R + VIEW_PAD);
const VB_SIZE = (TERRAIN_R + VIEW_PAD) * 2;
const VOID_R = 5.6;            // 중심 void 표시용 (R=56 의 0.1)

const PATTERN_COLOR = {
  echo_follow:   '#c4a882',
  bridge:        '#6aa383',
  displacement:  '#a88aa3',
  contradiction: '#c97a6a',
  avoidance:     '#7c7466',
  fixation:      '#9d8a4a',
};
const RUNNER_BASE_COLOR = { A: '#c4a882', B: '#6aa383' };

// ─── 모듈 상태 ─────────────────────────────────────────────
const state = {
  rootEl: null,
  svg: null,
  ghostLayer: null,
  edgeLayer: null,
  scenes: [],            // 외부에서 setScenes 로 주입
  sim: { active: false, runners: { A: null, B: null }, compareMode: false },
  drag: { sceneId: null, moved: false },
};

// ─── 좌표 변환 ─────────────────────────────────────────────
// stage_position 비어 있으면 originalReasonVector 자동 투영 — admin.js renderScenePinsRef 와 동일 공식.
function autoProjectFromAF(scene) {
  const arv = scene.originalReasonVector || (scene.meta && scene.meta.original_reason_vector) || {};
  const attr = arv.attribution || {};
  const cf = arv.core_fear || {};
  const axX = -1 * (attr.self || 0) + 0 * (attr.other || 0) + 1 * (attr.fate || 0);
  const axZ = -1 * (cf.abandonment || 0) + (-0.33) * (cf.rejection || 0) + 0.33 * (cf.powerlessness || 0) + 1 * (cf.loss || 0);
  if (axX === 0 && axZ === 0) return null;
  return { x: axX * TERRAIN_R * 0.7, z: axZ * TERRAIN_R * 0.7 };
}

function getStagePosition(scene) {
  const sp = scene.meta && scene.meta.stage_position;
  if (sp && Number.isFinite(sp.x) && Number.isFinite(sp.z)) {
    return { x: sp.x, z: sp.z, isManual: true };
  }
  const auto = autoProjectFromAF(scene);
  if (auto) return { x: auto.x, z: auto.z, isManual: false };
  return null;
}

function clampToTerrain(x, z) {
  const r = Math.sqrt(x * x + z * z);
  if (r > TERRAIN_R - 1) {
    const s = (TERRAIN_R - 1) / r;
    return { x: x * s, z: z * s };
  }
  if (r < VOID_R + 0.5) {
    const s = (VOID_R + 0.5) / Math.max(r, 0.01);
    return { x: x * s, z: z * s };
  }
  return { x, z };
}

// 화면 픽셀 → world 좌표
function clientToWorld(clientX, clientY) {
  const svg = state.svg;
  if (!svg) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const wp = pt.matrixTransform(ctm.inverse());
  return { x: wp.x, z: wp.y };
}

// ─── DOM 빌드 ──────────────────────────────────────────────
function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
  return el;
}

function buildSvgScaffold() {
  const svg = svgEl('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `${VB_MIN} ${VB_MIN} ${VB_SIZE} ${VB_SIZE}`,
    preserveAspectRatio: 'xMidYMid meet',
  });

  // 배경 — 외곽 원 + void + 십자 가이드 + AF anchor 힌트
  const bg = svgEl('g', { id: 'tvStageBg', 'pointer-events': 'none' });
  bg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: TERRAIN_R, fill: 'rgba(196,168,130,0.025)', stroke: 'rgba(196,168,130,0.35)', 'stroke-width': 0.4 }));
  bg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: VOID_R, fill: 'rgba(168,140,196,0.06)', stroke: 'rgba(168,140,196,0.4)', 'stroke-width': 0.3, 'stroke-dasharray': '1,1' }));
  bg.appendChild(svgEl('line', { x1: -TERRAIN_R, y1: 0, x2: TERRAIN_R, y2: 0, stroke: 'rgba(196,168,130,0.06)', 'stroke-width': 0.2 }));
  bg.appendChild(svgEl('line', { x1: 0, y1: -TERRAIN_R, x2: 0, y2: TERRAIN_R, stroke: 'rgba(196,168,130,0.06)', 'stroke-width': 0.2 }));

  // AF anchor 힌트 — 4축 (attribution: self/fate, core_fear: abandonment/loss)
  const labels = [
    { x: -TERRAIN_R * 0.7, y: 0, txt: 'self' },
    { x:  TERRAIN_R * 0.7, y: 0, txt: 'fate' },
    { x: 0, y: -TERRAIN_R * 0.7, txt: 'abandonment' },
    { x: 0, y:  TERRAIN_R * 0.7, txt: 'loss' },
  ];
  labels.forEach(l => {
    bg.appendChild(svgEl('text', {
      x: l.x, y: l.y, fill: 'rgba(196,168,130,0.28)', 'font-size': 2.6, 'text-anchor': 'middle',
      'font-family': 'Cormorant Garamond, serif', 'font-style': 'italic',
    })).textContent = l.txt;
  });
  svg.appendChild(bg);

  // 시뮬 edge layer (visited path / candidate arrow)
  const edges = svgEl('g', { id: 'tvStageEdges', 'pointer-events': 'none' });
  svg.appendChild(edges);
  state.edgeLayer = edges;

  // ghost layer
  const ghosts = svgEl('g', { id: 'tvStageGhosts' });
  svg.appendChild(ghosts);
  state.ghostLayer = ghosts;

  return svg;
}

// ─── 렌더 ──────────────────────────────────────────────────
function _simHighlight(sceneId) {
  // 반환: { role: 'current'|'candidate'|'visited'|'idle', runnerKey, pattern }
  // sim active 가 아니면 idle.
  if (!state.sim.active) return { role: 'idle' };
  const out = { role: 'idle' };
  ['A', 'B'].forEach(k => {
    const r = state.sim.runners[k];
    if (!r) return;
    const curScene = state.scenes[r.currentIdx];
    if (curScene && curScene.id === sceneId) {
      // current 우선 (A 가 더 우선)
      if (out.role !== 'current') out.role = 'current', out.runnerKey = k;
    } else if (r.candidateIdx != null) {
      const candScene = state.scenes[r.candidateIdx];
      if (candScene && candScene.id === sceneId && out.role === 'idle') {
        out.role = 'candidate';
        out.runnerKey = k;
        out.pattern = (r.lastResult && r.lastResult.transition_pattern) || null;
      }
    }
    if (out.role === 'idle' && r.visited && r.visited.length > 1) {
      const visitedSceneIds = r.visited.slice(0, -1).map(i => state.scenes[i] && state.scenes[i].id);
      if (visitedSceneIds.includes(sceneId)) { out.role = 'visited'; out.runnerKey = k; }
    }
  });
  return out;
}

function renderGhosts() {
  const layer = state.ghostLayer;
  if (!layer) return;
  layer.innerHTML = '';

  const simActive = state.sim.active;

  state.scenes.forEach((scene, i) => {
    const pos = getStagePosition(scene);
    if (!pos) return;
    const hi = _simHighlight(scene.id);

    // sim active 일 때 idle role 인 씬은 숨김 (가시성 규칙 b)
    if (simActive && hi.role === 'idle') return;

    const code = (scene.meta && scene.meta.scene_code) || String(scene.scene_order != null ? scene.scene_order : i);
    const baseColor = '#c4a882';
    let strokeColor = baseColor;
    let fillColor = 'rgba(15,15,20,0.85)';
    let strokeDash = pos.isManual ? null : '0.6,0.4';   // 자동=점선, 수동=실선
    let strokeW = 0.3;
    let r = 1.6;
    let opacity = 0.85;

    if (hi.role === 'current') {
      r = 2.4;
      strokeW = 0.6;
      strokeColor = RUNNER_BASE_COLOR[hi.runnerKey] || baseColor;
      fillColor = strokeColor;
      opacity = 1;
    } else if (hi.role === 'candidate') {
      r = 2.0;
      strokeW = 0.5;
      strokeColor = PATTERN_COLOR[hi.pattern] || RUNNER_BASE_COLOR[hi.runnerKey] || baseColor;
      strokeDash = '1.2,0.6';
      opacity = 0.95;
    } else if (hi.role === 'visited') {
      r = 1.4;
      opacity = 0.45;
      strokeColor = RUNNER_BASE_COLOR[hi.runnerKey] || baseColor;
    }

    const g = svgEl('g', {
      class: 'tv-stage-ghost',
      'data-scene-id': scene.id,
      style: 'cursor:grab;',
    });

    // halo (자동/수동 구분 + current 강조)
    if (hi.role === 'current') {
      g.appendChild(svgEl('circle', {
        cx: pos.x, cy: pos.z, r: r + 1.2, fill: 'none',
        stroke: strokeColor, 'stroke-width': 0.25, opacity: 0.5,
      }));
    } else if (!pos.isManual) {
      g.appendChild(svgEl('circle', {
        cx: pos.x, cy: pos.z, r: r + 0.8, fill: 'none',
        stroke: 'rgba(196,168,130,0.3)', 'stroke-width': 0.2, 'stroke-dasharray': '0.4,0.4',
      }));
    }

    // body
    const dot = svgEl('circle', {
      cx: pos.x, cy: pos.z, r,
      fill: fillColor, stroke: strokeColor,
      'stroke-width': strokeW, opacity,
    });
    if (strokeDash) dot.setAttribute('stroke-dasharray', strokeDash);
    g.appendChild(dot);

    // candidate 펄스 링
    if (hi.role === 'candidate') {
      const pulse = svgEl('circle', {
        cx: pos.x, cy: pos.z, r: r + 1.5, fill: 'none',
        stroke: strokeColor, 'stroke-width': 0.3, opacity: 0.7,
      });
      const anim = svgEl('animate', { attributeName: 'r', values: `${r + 1.5};${r + 3};${r + 1.5}`, dur: '1.4s', repeatCount: 'indefinite' });
      const animO = svgEl('animate', { attributeName: 'opacity', values: '0.7;0.15;0.7', dur: '1.4s', repeatCount: 'indefinite' });
      pulse.appendChild(anim); pulse.appendChild(animO);
      g.appendChild(pulse);
    }

    // 라벨
    const label = svgEl('text', {
      x: pos.x, y: pos.z - r - 0.8,
      fill: hi.role === 'current' ? strokeColor : 'rgba(196,168,130,0.55)',
      'font-size': 1.7, 'text-anchor': 'middle',
      'font-family': 'Cormorant Garamond, serif',
      'pointer-events': 'none',
    });
    label.textContent = code;
    g.appendChild(label);

    layer.appendChild(g);
  });
}

function renderEdges() {
  const layer = state.edgeLayer;
  if (!layer) return;
  layer.innerHTML = '';
  if (!state.sim.active) return;

  ['A', 'B'].forEach(k => {
    const r = state.sim.runners[k];
    if (!r) return;
    const color = RUNNER_BASE_COLOR[k];

    // visited path
    const visitedPos = (r.visited || []).map(i => {
      const s = state.scenes[i];
      return s ? getStagePosition(s) : null;
    }).filter(Boolean);
    if (visitedPos.length >= 2) {
      const d = visitedPos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(' ');
      layer.appendChild(svgEl('path', { d, stroke: color, 'stroke-width': 0.4, 'stroke-dasharray': '1.2,0.8', fill: 'none', opacity: 0.55 }));
    }

    // current → candidate 화살
    if (r.candidateIdx != null && r.candidateIdx !== r.currentIdx) {
      const cur = state.scenes[r.currentIdx];
      const cand = state.scenes[r.candidateIdx];
      if (cur && cand) {
        const pc = getStagePosition(cur);
        const pn = getStagePosition(cand);
        if (pc && pn) {
          const pattern = r.lastResult && r.lastResult.transition_pattern;
          const ec = PATTERN_COLOR[pattern] || color;
          layer.appendChild(svgEl('line', {
            x1: pc.x, y1: pc.z, x2: pn.x, y2: pn.z,
            stroke: ec, 'stroke-width': 0.35, 'stroke-dasharray': '0.8,0.6', opacity: 0.7,
          }));
        }
      }
    }
  });
}

function render() { renderEdges(); renderGhosts(); }

// ─── 드래그 ────────────────────────────────────────────────
async function persistStagePosition(sceneId, x, z) {
  // savePinOverride 패턴과 동일 — meta JSONB 만 직접 update.
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    const sc = state.scenes.find(s => s.id === sceneId);
    if (!sc) return;
    const newMeta = Object.assign({}, sc.meta || {}, { stage_position: { x: +x.toFixed(3), z: +z.toFixed(3) } });
    const { error } = await sb.from('scenes').update({ meta: newMeta }).eq('id', sceneId);
    if (error) { console.error('[stage_position] save failed', error); return; }
    sc.meta = newMeta;
    console.log('[Admin/stage] saved', sceneId, newMeta.stage_position);
  } catch (e) {
    console.error('[stage_position] error', e);
  }
}

function bindDragHandlers() {
  const svg = state.svg;
  if (!svg) return;

  svg.addEventListener('mousedown', (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    const ghostG = target.closest('g.tv-stage-ghost');
    if (!ghostG) return;
    state.drag.sceneId = ghostG.getAttribute('data-scene-id');
    state.drag.moved = false;
    ghostG.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.drag.sceneId) return;
    const w = clientToWorld(e.clientX, e.clientY);
    if (!w) return;
    const c = clampToTerrain(w.x, w.z);
    const sc = state.scenes.find(s => s.id === state.drag.sceneId);
    if (!sc) return;
    if (!sc.meta) sc.meta = {};
    sc.meta.stage_position = { x: c.x, z: c.z };
    state.drag.moved = true;
    render();
  });

  window.addEventListener('mouseup', () => {
    if (!state.drag.sceneId) return;
    const sceneId = state.drag.sceneId;
    const moved = state.drag.moved;
    state.drag.sceneId = null;
    state.drag.moved = false;
    if (moved) {
      const sc = state.scenes.find(s => s.id === sceneId);
      if (sc && sc.meta && sc.meta.stage_position) {
        persistStagePosition(sceneId, sc.meta.stage_position.x, sc.meta.stage_position.z);
      }
    }
  });
}

// ─── 외부 API ───────────────────────────────────────────────
function mount(rootSelector) {
  const root = typeof rootSelector === 'string' ? document.getElementById(rootSelector) : rootSelector;
  if (!root) return null;
  state.rootEl = root;
  root.innerHTML = '';
  state.svg = buildSvgScaffold();
  root.appendChild(state.svg);
  bindDragHandlers();
  return api;
}

function setScenes(scenes) {
  state.scenes = Array.isArray(scenes) ? scenes : [];
  render();
  _updateStatus();
}

function setSimState(simSnapshot) {
  // simSnapshot: { active, runners: { A, B }, compareMode }
  state.sim = simSnapshot || { active: false, runners: { A: null, B: null }, compareMode: false };
  render();
}

function _updateStatus() {
  const status = document.getElementById('tvStageStatus');
  if (!status) return;
  const total = state.scenes.length;
  const placed = state.scenes.filter(s => getStagePosition(s)).length;
  const manual = state.scenes.filter(s => s.meta && s.meta.stage_position).length;
  status.textContent = `씬 ${placed}/${total} · 수동 ${manual} · 자동 ${placed - manual}`;
}

const api = { mount, setScenes, setSimState };

// ─── 글로벌 노출 ────────────────────────────────────────────
window.LumenAdminStageView = api;

export default api;

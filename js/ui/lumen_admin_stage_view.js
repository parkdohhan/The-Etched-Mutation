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
  // ── Terrain mesh layer (THREE.js, ortho top-down) — v2
  terrain: {
    canvas: null,
    renderer: null,
    scene3: null,
    camera: null,
    mesh: null,
    memoryId: null,        // 마지막으로 로드한 memory id (idempotent guard)
    loading: false,
    rafId: null,
  },
};

// terrain mesh 생성 격자 — admin 경량 (full play-test 의 절반)
const TERRAIN_G = 80;
const TERRAIN_SZ = 112;

// ─── 좌표 변환 ─────────────────────────────────────────────
// VAD 매핑 (admin-trajectory.js VAD_FULL 와 동일)
const VAD_FULL = {
  fear:{v:-0.9,a:0.9}, sadness:{v:-0.8,a:-0.4}, anger:{v:-0.7,a:0.8},
  guilt:{v:-0.8,a:0.2}, shame:{v:-0.9,a:-0.2}, isolation:{v:-0.7,a:-0.5},
  numbness:{v:-0.6,a:-0.8}, longing:{v:-0.3,a:0.2}, resentment:{v:-0.5,a:0.6},
  resignation:{v:-0.4,a:-0.6}, joy:{v:0.9,a:0.6}, hope:{v:0.7,a:0.4},
  relief:{v:0.6,a:-0.3}, gratitude:{v:0.8,a:-0.2}, love:{v:1.0,a:0.5},
  peace:{v:0.8,a:-0.6}, confusion:{v:-0.4,a:0.3},
};

// 1차 fallback — originalReasonVector AF 투영 (admin.js renderScenePinsRef 와 동일)
function autoProjectFromAF(scene) {
  const arv = scene.originalReasonVector || (scene.meta && scene.meta.original_reason_vector) || {};
  const attr = arv.attribution || {};
  const cf = arv.core_fear || {};
  const axX = -1 * (attr.self || 0) + 0 * (attr.other || 0) + 1 * (attr.fate || 0);
  const axZ = -1 * (cf.abandonment || 0) + (-0.33) * (cf.rejection || 0) + 0.33 * (cf.powerlessness || 0) + 1 * (cf.loss || 0);
  if (axX === 0 && axZ === 0) return null;
  return { x: axX * TERRAIN_R * 0.7, z: axZ * TERRAIN_R * 0.7 };
}

// 2차 fallback — original_emotion / emotion_dist 의 V·A 투영
function autoProjectFromEmotion(scene) {
  const emo = scene.originalEmotion || scene.original_emotion || scene.emotionDist || scene.emotion_dist;
  if (!emo || typeof emo !== 'object') return null;
  let V = 0, A = 0, w = 0;
  for (const k in emo) {
    const m = VAD_FULL[k];
    if (!m) continue;
    const wt = Number(emo[k] || 0);
    if (wt <= 0) continue;
    V += wt * m.v; A += wt * m.a; w += wt;
  }
  if (w <= 0) return null;
  V = Math.max(-1, Math.min(1, V / w));
  A = Math.max(-1, Math.min(1, A / w));
  // V→x, +A(각성↑)→화면 위(=z 음수). admin VA picker 관행.
  return { x: V * TERRAIN_R * 0.6, z: -A * TERRAIN_R * 0.6 };
}

// 3차 fallback (마지막 보장) — scene_order 기반 균등 원 분포. 빈 메모리에서도 모든 씬이 어딘가에 보임.
function autoProjectFromOrder(scene, total) {
  const order = scene.scene_order != null ? scene.scene_order : 0;
  const N = Math.max(total || 1, 1);
  const angle = (order / N) * Math.PI * 2 - Math.PI / 2; // 12시부터 시계방향
  const r = TERRAIN_R * 0.55;
  return { x: r * Math.cos(angle), z: r * Math.sin(angle) };
}

function getStagePosition(scene, total) {
  const sp = scene.meta && scene.meta.stage_position;
  if (sp && Number.isFinite(sp.x) && Number.isFinite(sp.z)) {
    return { x: sp.x, z: sp.z, source: 'manual' };
  }
  const af = autoProjectFromAF(scene);
  if (af) return { x: af.x, z: af.z, source: 'af' };
  const em = autoProjectFromEmotion(scene);
  if (em) return { x: em.x, z: em.z, source: 'emotion' };
  // 마지막 단계 — 무조건 좌표 반환 (사용자가 어디든 보고 드래그로 옮길 수 있게)
  const ord = autoProjectFromOrder(scene, total);
  return { x: ord.x, z: ord.z, source: 'order' };
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

  const total = state.scenes.length;
  state.scenes.forEach((scene, i) => {
    const pos = getStagePosition(scene, total);
    if (!pos) return;
    const hi = _simHighlight(scene.id);

    // sim active 일 때 idle role 인 씬은 숨김 (가시성 규칙 b)
    if (simActive && hi.role === 'idle') return;

    const code = (scene.meta && scene.meta.scene_code) || String(scene.scene_order != null ? scene.scene_order : i);
    const baseColor = '#c4a882';
    let strokeColor = baseColor;
    let fillColor = 'rgba(15,15,20,0.85)';
    // source 별 시각 구분: manual=실선 / af=점선 / emotion=점선(좀 더 흐림) / order=균등 분포 표시(faintest)
    const isManual = pos.source === 'manual';
    let strokeDash = isManual ? null : (pos.source === 'order' ? '0.3,0.5' : '0.6,0.4');
    let strokeW = 0.3;
    let r = 1.6;
    let opacity = isManual ? 0.85 : (pos.source === 'order' ? 0.55 : 0.75);

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
    } else if (!isManual) {
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
      return s ? getStagePosition(s, state.scenes.length) : null;
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
        const pc = getStagePosition(cur, state.scenes.length);
        const pn = getStagePosition(cand, state.scenes.length);
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

// ─── Terrain mesh layer (THREE.js, ortho top-down) ──────────────
// SVG viewBox 와 정확히 동일한 좌표 frustum. SVG 와 같은 inset:0 absolute 로 깔린 canvas.
function _initTerrainLayer() {
  if (!state.rootEl || state.terrain.canvas) return;
  if (typeof THREE === 'undefined') {
    console.warn('[StageView] THREE 미로딩 — terrain mesh 비활성');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.id = 'tvStageTerrainCanvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;';
  state.rootEl.insertBefore(canvas, state.rootEl.firstChild); // SVG 보다 뒤에

  // preserveDrawingBuffer: smoke 검증에서 canvas pixel 캡처 가능하게 (성능 영향은 admin 한정 무시 가능)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0a0a10, 1);

  const scene3 = new THREE.Scene();
  // 단조 색평면: 약한 hemisphere 라이트 + ambient (vertex color 가 주역이라 light 는 약하게)
  scene3.add(new THREE.AmbientLight(0xffffff, 0.85));
  const hemi = new THREE.HemisphereLight(0xffffff, 0x202028, 0.4);
  scene3.add(hemi);

  // 직교 카메라 — frustum 은 _resizeTerrain 에서 설정
  const cam = new THREE.OrthographicCamera(-60, 60, 60, -60, 0.1, 1000);
  cam.position.set(0, 200, 0);
  cam.up.set(0, 0, -1); // SVG 의 +y(아래) 가 world +z 와 일치하도록
  cam.lookAt(0, 0, 0);

  state.terrain.canvas = canvas;
  state.terrain.renderer = renderer;
  state.terrain.scene3 = scene3;
  state.terrain.camera = cam;

  _resizeTerrain();
  window.addEventListener('resize', _resizeTerrain);
  // Layer resizer 도 영향 — 부모 크기 변하면 재계산. ResizeObserver 가 가장 안전.
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => _resizeTerrain());
    ro.observe(state.rootEl);
    state.terrain._ro = ro;
  }
  _renderTerrainOnce();
}

function _resizeTerrain() {
  const t = state.terrain;
  if (!t.renderer || !t.camera || !state.rootEl) return;
  const w = state.rootEl.clientWidth || 1;
  const h = state.rootEl.clientHeight || 1;
  t.renderer.setSize(w, h, false);
  // SVG meet 처럼 — 짧은 축에 viewBox 를 fit, 긴 축은 여백
  const half = (TERRAIN_R + VIEW_PAD); // = 60
  const aspect = w / h;
  if (aspect >= 1) {
    t.camera.top = half; t.camera.bottom = -half;
    t.camera.left = -half * aspect; t.camera.right = half * aspect;
  } else {
    t.camera.left = -half; t.camera.right = half;
    t.camera.top = half / aspect; t.camera.bottom = -half / aspect;
  }
  t.camera.updateProjectionMatrix();
  _renderTerrainOnce();
}

function _renderTerrainOnce() {
  const t = state.terrain;
  if (!t.renderer || !t.scene3 || !t.camera) return;
  t.renderer.render(t.scene3, t.camera);
}

async function _fetchTerrainP(memoryId) {
  // strataView 의 fetchStrataAfInput 와 동일 의도의 미니 버전.
  // memories + scenes + plays 를 supabase 로 가져와 buildMemoryItems 호출.
  const T = window.TemAfStrataTerrain;
  if (!T || !T.buildMemoryItems) return null;
  let sb;
  try { sb = await getSupabaseClient(); } catch (e) { return null; }
  if (!sb) return null;

  const [memRes, scnRes, playRes] = await Promise.all([
    sb.from('memories').select('*').eq('id', memoryId).maybeSingle(),
    sb.from('scenes').select('*').eq('memory_id', memoryId).order('scene_order', { ascending: true }),
    sb.from('plays').select('id, memory_id, scene_id, user_emotion, alignment, mismatch_type, created_at, user_id').eq('memory_id', memoryId),
  ]);
  const memRow = memRes && memRes.data;
  if (!memRow) return null;
  const sceneRows = (scnRes && scnRes.data) || [];
  const plays = (playRes && playRes.data) || [];

  const playsByMem = {}; playsByMem[memoryId] = plays;
  const scenesByMem = {}; scenesByMem[memoryId] = sceneRows;
  return T.buildMemoryItems([memRow], playsByMem, scenesByMem);
}

async function _loadTerrainForMemory(memoryId) {
  const t = state.terrain;
  if (!t.renderer || !memoryId) return;
  if (t.memoryId === memoryId || t.loading) return;
  t.loading = true;
  try {
    const T = window.TemAfStrataTerrain;
    if (!T || !T.computeAfTerrainFields) { t.loading = false; return; }
    const P = await _fetchTerrainP(memoryId);
    if (!P || !P.length) { t.loading = false; return; }
    const field = T.computeAfTerrainFields(P, 0, { G: TERRAIN_G, SZ: TERRAIN_SZ });
    if (!field || !field.hts) { t.loading = false; return; }

    // 기존 mesh 정리
    if (t.mesh) {
      t.scene3.remove(t.mesh);
      if (t.mesh.geometry) t.mesh.geometry.dispose();
      if (t.mesh.material) t.mesh.material.dispose();
      t.mesh = null;
    }

    const geo = new THREE.PlaneGeometry(TERRAIN_SZ, TERRAIN_SZ, TERRAIN_G - 1, TERRAIN_G - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position.array;
    const colors = new Float32Array(pos.length);
    for (let i = 0; i < TERRAIN_G * TERRAIN_G; i++) {
      // PlaneGeometry rotateX 후 vertex 순서: i = iz * G + ix
      pos[i * 3 + 1] = field.hts[i] * 0.18; // ortho top-down 이라 height 자체는 안 보이지만 미세 그림자용
      colors[i * 3]     = field.cls[i * 3];
      colors[i * 3 + 1] = field.cls[i * 3 + 1];
      colors[i * 3 + 2] = field.cls[i * 3 + 2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    t.scene3.add(mesh);
    t.mesh = mesh;
    t.memoryId = memoryId;
    _renderTerrainOnce();
    console.log('[StageView] terrain loaded for', memoryId);
  } catch (e) {
    console.warn('[StageView] terrain load failed', e);
  } finally {
    t.loading = false;
  }
}

// ─── 외부 API ───────────────────────────────────────────────
function mount(rootSelector) {
  const root = typeof rootSelector === 'string' ? document.getElementById(rootSelector) : rootSelector;
  if (!root) return null;
  state.rootEl = root;
  root.innerHTML = '';
  // SVG 가 오버레이로 위에, terrain canvas 가 배경으로 아래에 — _initTerrainLayer 가 prepend.
  state.svg = buildSvgScaffold();
  state.svg.style.position = 'absolute';
  state.svg.style.inset = '0';
  state.svg.style.zIndex = '1';
  root.appendChild(state.svg);
  _initTerrainLayer();
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
  const counts = { manual: 0, af: 0, emotion: 0, order: 0 };
  state.scenes.forEach(s => {
    const p = getStagePosition(s, total);
    if (p && counts[p.source] != null) counts[p.source]++;
  });
  status.textContent = `씬 ${total} · 수동 ${counts.manual} · AF ${counts.af} · 감정 ${counts.emotion} · 순서 ${counts.order}`;
}

function setMemoryId(memoryId) {
  if (!memoryId) return;
  // mount 후 호출 가능. terrain 레이어가 init 안 됐으면 일찍 리턴.
  if (!state.terrain.canvas) _initTerrainLayer();
  _loadTerrainForMemory(memoryId);
}

// 디버그 / smoke 용 — mesh 존재 / vertex 수 노출
function _debugTerrain() {
  const t = state.terrain;
  return {
    hasCanvas: !!t.canvas,
    hasMesh: !!t.mesh,
    meshChildren: t.scene3 ? t.scene3.children.length : 0,
    meshVertexCount: t.mesh && t.mesh.geometry ? t.mesh.geometry.attributes.position.count : 0,
    memoryId: t.memoryId,
    canvasSize: t.canvas ? { w: t.canvas.width, h: t.canvas.height } : null,
  };
}

const api = { mount, setScenes, setSimState, setMemoryId, _debugTerrain };

// ─── 글로벌 노출 ────────────────────────────────────────────
window.LumenAdminStageView = api;

export default api;

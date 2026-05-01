// lumen_admin_stage_view.js — 위치 레이어 v2 (작업 X — 풀 3D strata 전환)
//
// 책임 (한 줄): scene 별 stage_position 을 풀 3D strata terrain 위에서
//                회전·줌·드래그(raycast) 로 편집하고, 시뮬 동기 시 가시성/하이라이트를 갱신한다.
//
// v1 (SVG 탑다운) → v2 (THREE.js perspective + OrbitControls + 3D pin + 실 연결).
// 공개 API 유지: mount / setMemoryId / setScenes / setSimState / _debugTerrain.
//
// 좌표:
//   world (x, z) ∈ [-TERRAIN_R, TERRAIN_R], TERRAIN_R = 56 (응결점·strata 와 동일).
//   terrain mesh: PlaneGeometry rotateX → +y up, x·z 가 horizontal.
//
// 시뮬 동기화 규칙 (v1 과 동일 의도):
//   유령(=장면 핀) 표시 = 현재 ∪ candidate ∪ visited (sim active 시 그 외 숨김)
//   현재 = 강조 (큰 핀, 고채도) / candidate = 패턴색 펄스 / visited = dim
//   idle = 모든 stage_position 보유 씬 표시.
//
// 실(thread) 연결:
//   기본 — scene_order 순서대로 점선 (저채도, 항상). 시각적 narrative 흐름.
//   시뮬 active — visited path 굵은 실, current→candidate 패턴색 화살.

import { getSupabaseClient } from '../lib/supabaseClient.js';

// ─── 상수 ──────────────────────────────────────────────────
const TERRAIN_R = 56;
const VOID_R = 5.6;
const TERRAIN_G = 96;            // 격자 (이전 80 → 96 — 부드러운 등고)
const TERRAIN_SZ = 112;          // = TERRAIN_R * 2
const HALF = TERRAIN_SZ / 2;
const HEIGHT_SCALE = 12;         // 정규화 후 곱하는 입체감 (이전 0.18 → 12)
const PIN_SHAFT_H = 5.5;         // 핀 막대 높이 (terrain 위로)
const PIN_HEAD_R = 1.1;          // 핀 머리 반경
const LABEL_LIFT = 1.6;          // 라벨이 핀 머리 위로 띄우는 거리

const PATTERN_COLOR = {
  echo_follow:   0xc4a882,
  bridge:        0x6aa383,
  displacement:  0xa88aa3,
  contradiction: 0xc97a6a,
  avoidance:     0x7c7466,
  fixation:      0x9d8a4a,
};
const RUNNER_BASE_COLOR = { A: 0xc4a882, B: 0x6aa383 };
const BASE_PIN_COLOR = 0xc4a882;

// ─── VAD 매핑 (v1 과 동일) ─────────────────────────────────
const VAD_FULL = {
  fear:{v:-0.9,a:0.9}, sadness:{v:-0.8,a:-0.4}, anger:{v:-0.7,a:0.8},
  guilt:{v:-0.8,a:0.2}, shame:{v:-0.9,a:-0.2}, isolation:{v:-0.7,a:-0.5},
  numbness:{v:-0.6,a:-0.8}, longing:{v:-0.3,a:0.2}, resentment:{v:-0.5,a:0.6},
  resignation:{v:-0.4,a:-0.6}, joy:{v:0.9,a:0.6}, hope:{v:0.7,a:0.4},
  relief:{v:0.6,a:-0.3}, gratitude:{v:0.8,a:-0.2}, love:{v:1.0,a:0.5},
  peace:{v:0.8,a:-0.6}, confusion:{v:-0.4,a:0.3},
};

// ─── 좌표 fallback (v1 그대로 — 작가 데이터 의도 보존) ─────
function autoProjectFromAF(scene) {
  const arv = scene.originalReasonVector || (scene.meta && scene.meta.original_reason_vector) || {};
  const attr = arv.attribution || {};
  const cf = arv.core_fear || {};
  const axX = -1 * (attr.self || 0) + 0 * (attr.other || 0) + 1 * (attr.fate || 0);
  const axZ = -1 * (cf.abandonment || 0) + (-0.33) * (cf.rejection || 0) + 0.33 * (cf.powerlessness || 0) + 1 * (cf.loss || 0);
  if (axX === 0 && axZ === 0) return null;
  return { x: axX * TERRAIN_R * 0.7, z: axZ * TERRAIN_R * 0.7 };
}
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
  return { x: V * TERRAIN_R * 0.6, z: -A * TERRAIN_R * 0.6 };
}
function autoProjectFromOrder(scene, total) {
  const order = scene.scene_order != null ? scene.scene_order : 0;
  const N = Math.max(total || 1, 1);
  const angle = (order / N) * Math.PI * 2 - Math.PI / 2;
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

// ─── 모듈 상태 ─────────────────────────────────────────────
const state = {
  rootEl: null,
  canvas: null,
  hudEl: null,
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  raycaster: null,
  mouseNDC: null,
  terrain: {
    mesh: null,
    hts: null,                 // 정규화된 vertex Y(=mesh 높이) 격자
    memoryId: null,
    loading: false,
  },
  pinsGroup: null,             // 모든 핀(shaft+head+label) 컨테이너
  threadsGroup: null,          // scene_order 점선
  edgesGroup: null,            // 시뮬 visited / candidate 화살
  voidMarker: null,            // 중앙 void 표시 디스크
  outerRing: null,             // 외곽 R 표시 링
  pinByScene: new Map(),       // sceneId → { group, head, shaft, label, baseColor, pos }
  scenes: [],
  sim: { active: false, runners: { A: null, B: null }, compareMode: false },
  drag: { sceneId: null, moved: false, pointerId: null },
  rafId: null,
  resizeObserver: null,
  onSceneClick: null,          // 핀 클릭(드래그 X) 시 (sceneId) => void 호출
};

// ─── THREE 라벨 sprite ────────────────────────────────────
function _makeLabelSprite(text, color) {
  const cvs = document.createElement('canvas');
  const sz = 256;
  cvs.width = sz; cvs.height = sz;
  const ctx = cvs.getContext('2d');
  // glow
  const grad = ctx.createRadialGradient(sz/2, sz/2, 0, sz/2, sz/2, sz*0.42);
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  grad.addColorStop(0, `rgba(${r},${g},${b},0.45)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.10)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, sz, sz);
  // text
  const label = String(text || '').slice(0, 14);
  ctx.fillStyle = `rgba(${Math.min(255, r+90)},${Math.min(255, g+90)},${Math.min(255, b+90)},0.95)`;
  ctx.font = 'bold 56px "Cormorant Garamond", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, sz/2, sz/2);
  const tex = new THREE.CanvasTexture(cvs);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(8, 8, 1);
  spr.renderOrder = 999;
  return spr;
}

// ─── 핀 빌드 ───────────────────────────────────────────────
function _buildPin(label, color) {
  const group = new THREE.Group();
  // shaft (cylinder, terrain → head 사이)
  const shaftGeo = new THREE.CylinderGeometry(0.18, 0.18, PIN_SHAFT_H, 8);
  shaftGeo.translate(0, PIN_SHAFT_H / 2, 0);
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xc4a882, transparent: true, opacity: 0.7 });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.userData._pinPart = 'shaft';
  group.add(shaft);
  // head (sphere)
  const headGeo = new THREE.SphereGeometry(PIN_HEAD_R, 16, 12);
  const headMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, emissive: color, emissiveIntensity: 0.25 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = PIN_SHAFT_H;
  head.userData._pinPart = 'head';
  group.add(head);
  // label
  const labelSprite = _makeLabelSprite(label, color);
  labelSprite.position.y = PIN_SHAFT_H + LABEL_LIFT + 1.5;
  group.add(labelSprite);
  return { group, shaft, head, label: labelSprite, baseColor: color };
}

function _disposePin(pin) {
  if (!pin) return;
  if (pin.shaft) {
    pin.shaft.geometry.dispose();
    pin.shaft.material.dispose();
  }
  if (pin.head) {
    pin.head.geometry.dispose();
    pin.head.material.dispose();
  }
  if (pin.label) {
    if (pin.label.material.map) pin.label.material.map.dispose();
    pin.label.material.dispose();
  }
}

// ─── 시뮬 highlight 판정 (v1 _simHighlight 로직 동일) ─────
function _simHighlight(sceneId) {
  if (!state.sim.active) return { role: 'idle' };
  const out = { role: 'idle' };
  ['A', 'B'].forEach(k => {
    const r = state.sim.runners[k];
    if (!r) return;
    const curScene = state.scenes[r.currentIdx];
    if (curScene && curScene.id === sceneId) {
      if (out.role !== 'current') { out.role = 'current'; out.runnerKey = k; }
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

// ─── 핀 갱신 ───────────────────────────────────────────────
function renderPins() {
  if (!state.scene || !state.pinsGroup) return;
  const total = state.scenes.length;
  const seenIds = new Set();

  state.scenes.forEach((scene, i) => {
    seenIds.add(scene.id);
    const pos = getStagePosition(scene, total);
    if (!pos) return;
    const hi = _simHighlight(scene.id);

    // sim active 일 때 idle role 인 씬은 숨김
    const visible = !(state.sim.active && hi.role === 'idle');

    const code = (scene.meta && scene.meta.scene_code) || String(scene.scene_order != null ? scene.scene_order : i);

    let pin = state.pinByScene.get(scene.id);
    if (!pin) {
      pin = _buildPin(code, BASE_PIN_COLOR);
      state.pinsGroup.add(pin.group);
      state.pinByScene.set(scene.id, pin);
    }
    pin.scene = scene;

    // 위치
    const wy = _terrainHeightAt(pos.x, pos.z);
    pin.group.position.set(pos.x, wy, pos.z);
    pin.group.visible = visible;
    pin.pos = { x: pos.x, z: pos.z, source: pos.source };

    // 색·스케일·투명도
    let color = BASE_PIN_COLOR;
    let opacity = pos.source === 'manual' ? 0.95 : (pos.source === 'order' ? 0.55 : 0.78);
    let scale = 1;
    if (hi.role === 'current') {
      color = RUNNER_BASE_COLOR[hi.runnerKey] || BASE_PIN_COLOR;
      opacity = 1; scale = 1.45;
    } else if (hi.role === 'candidate') {
      color = PATTERN_COLOR[hi.pattern] || RUNNER_BASE_COLOR[hi.runnerKey] || BASE_PIN_COLOR;
      opacity = 0.95; scale = 1.2;
    } else if (hi.role === 'visited') {
      color = RUNNER_BASE_COLOR[hi.runnerKey] || BASE_PIN_COLOR;
      opacity = 0.5; scale = 0.85;
    }

    pin.head.material.color.setHex(color);
    pin.head.material.emissive.setHex(color);
    pin.head.material.opacity = opacity;
    pin.head.material.transparent = opacity < 1;
    pin.head.scale.setScalar(scale);
    pin.shaft.material.opacity = Math.max(0.35, opacity * 0.75);
    pin.shaft.material.transparent = true;

    // 라벨 색 갱신 (필요 시)
    const wantedHex = color;
    if (pin._lastLabelColor !== wantedHex) {
      pin.label.material.map.dispose();
      const newLabel = _makeLabelSprite(code, color);
      pin.group.remove(pin.label);
      newLabel.position.y = pin.label.position.y;
      pin.group.add(newLabel);
      pin.label.material.dispose();
      pin.label = newLabel;
      pin._lastLabelColor = wantedHex;
    }
  });

  // 사라진 씬 핀 정리
  state.pinByScene.forEach((pin, sceneId) => {
    if (!seenIds.has(sceneId)) {
      state.pinsGroup.remove(pin.group);
      _disposePin(pin);
      state.pinByScene.delete(sceneId);
    }
  });
}

// ─── 실(thread) 연결 ──────────────────────────────────────
function _disposeGroupChildren(group) {
  if (!group) return;
  for (let i = group.children.length - 1; i >= 0; i--) {
    const c = group.children[i];
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
      else c.material.dispose();
    }
    group.remove(c);
  }
}

function renderThreads() {
  // scene_order 순서 점선 (idle 시에도 항상 보이게).
  if (!state.threadsGroup) return;
  _disposeGroupChildren(state.threadsGroup);

  const ordered = state.scenes
    .slice()
    .sort((a, b) => (a.scene_order || 0) - (b.scene_order || 0))
    .map(s => state.pinByScene.get(s.id))
    .filter(p => p && p.group.visible);
  if (ordered.length < 2) return;

  const positions = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i].group.position;
    const b = ordered[i + 1].group.position;
    positions.push(a.x, a.y + PIN_SHAFT_H, a.z);
    positions.push(b.x, b.y + PIN_SHAFT_H, b.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineDashedMaterial({
    color: 0xc4a882, transparent: true, opacity: 0.32,
    dashSize: 0.9, gapSize: 0.7, linewidth: 1,
  });
  const segs = new THREE.LineSegments(geo, mat);
  segs.computeLineDistances();
  state.threadsGroup.add(segs);
}

function renderEdges() {
  if (!state.edgesGroup) return;
  _disposeGroupChildren(state.edgesGroup);
  if (!state.sim.active) return;

  ['A', 'B'].forEach(k => {
    const r = state.sim.runners[k];
    if (!r) return;
    const baseHex = RUNNER_BASE_COLOR[k];

    // visited path
    if (r.visited && r.visited.length >= 2) {
      const pts = r.visited.map(idx => {
        const s = state.scenes[idx];
        if (!s) return null;
        const pin = state.pinByScene.get(s.id);
        if (!pin) return null;
        return new THREE.Vector3(pin.group.position.x, pin.group.position.y + PIN_SHAFT_H, pin.group.position.z);
      }).filter(Boolean);
      if (pts.length >= 2) {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: baseHex, transparent: true, opacity: 0.6, linewidth: 2 });
        state.edgesGroup.add(new THREE.Line(geo, mat));
      }
    }

    // current → candidate 화살
    if (r.candidateIdx != null && r.candidateIdx !== r.currentIdx) {
      const cur = state.scenes[r.currentIdx];
      const cand = state.scenes[r.candidateIdx];
      if (cur && cand) {
        const pc = state.pinByScene.get(cur.id);
        const pn = state.pinByScene.get(cand.id);
        if (pc && pn) {
          const pattern = r.lastResult && r.lastResult.transition_pattern;
          const ec = (pattern && PATTERN_COLOR[pattern]) || baseHex;
          const a = new THREE.Vector3(pc.group.position.x, pc.group.position.y + PIN_SHAFT_H, pc.group.position.z);
          const b = new THREE.Vector3(pn.group.position.x, pn.group.position.y + PIN_SHAFT_H, pn.group.position.z);
          const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
          const mat = new THREE.LineDashedMaterial({ color: ec, transparent: true, opacity: 0.85, dashSize: 1.2, gapSize: 0.5 });
          const ln = new THREE.LineSegments(geo, mat);
          ln.computeLineDistances();
          state.edgesGroup.add(ln);
        }
      }
    }
  });
}

function render() {
  renderPins();
  renderThreads();
  renderEdges();
  _updateStatus();
}

// ─── terrain 높이 보간 ────────────────────────────────────
function _terrainHeightAt(x, z) {
  const hts = state.terrain.hts;
  if (!hts) return 0;
  const G = TERRAIN_G;
  const fx = (x + HALF) / TERRAIN_SZ * (G - 1);
  const fz = (z + HALF) / TERRAIN_SZ * (G - 1);
  if (fx < 0 || fz < 0 || fx > G - 1 || fz > G - 1) return 0;
  const ix = Math.min(G - 2, Math.floor(fx));
  const iz = Math.min(G - 2, Math.floor(fz));
  const tx = fx - ix, tz = fz - iz;
  const h00 = hts[iz * G + ix];
  const h10 = hts[iz * G + ix + 1];
  const h01 = hts[(iz + 1) * G + ix];
  const h11 = hts[(iz + 1) * G + ix + 1];
  return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
}

// ─── 3D 초기화 ────────────────────────────────────────────
function _initScene() {
  if (!state.rootEl) return;
  if (typeof THREE === 'undefined') {
    console.warn('[StageView v2] THREE 미로딩 — 위치 레이어 비활성');
    state.rootEl.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#7c7466;font-size:0.85rem;">THREE.js 미로딩</div>';
    return;
  }
  if (state.canvas) return; // idempotent

  const canvas = document.createElement('canvas');
  // smoke_task_15_v2 호환 위해 v1 ID 유지
  canvas.id = 'tvStageTerrainCanvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;';
  state.rootEl.appendChild(canvas);
  state.canvas = canvas;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x14141e, 1);
  state.renderer = renderer;

  const scene = new THREE.Scene();
  // 안개는 외곽 cutoff 용으로만 약하게 — terrain 본체가 보이게
  scene.fog = new THREE.FogExp2(0x14141e, 0.0035);
  state.scene = scene;

  const w = state.rootEl.clientWidth || 1;
  const h = state.rootEl.clientHeight || 1;
  const cam = new THREE.PerspectiveCamera(45, w / h, 0.5, 500);
  cam.position.set(45, 42, 55);
  cam.lookAt(0, 0, 0);
  state.camera = cam;

  // OrbitControls (admin.html에서 글로벌 로드)
  if (typeof THREE.OrbitControls === 'function') {
    const controls = new THREE.OrbitControls(cam, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 30;
    controls.maxDistance = 140;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0, 0);
    state.controls = controls;
  } else {
    console.warn('[StageView v2] OrbitControls 미로딩 — 회전 비활성');
  }

  // 라이트 — terrain vertex color 가 보이도록 충분히 밝게
  scene.add(new THREE.AmbientLight(0x4a4858, 1.6));
  const dl = new THREE.DirectionalLight(0xffe6c0, 1.1);
  dl.position.set(40, 60, 30);
  scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0x6a7ab0, 0.55);
  dl2.position.set(-30, 40, -20);
  scene.add(dl2);
  // 위에서 약한 fill — terrain top face 가 너무 어둡지 않게
  const hemi = new THREE.HemisphereLight(0xc4a882, 0x202028, 0.5);
  scene.add(hemi);

  // 외곽 R 링 + 중앙 void 표시 — fog 영향 안 받게
  {
    const ringGeo = new THREE.RingGeometry(TERRAIN_R - 0.4, TERRAIN_R + 0.2, 96);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xc4a882, transparent: true, opacity: 0.7, side: THREE.DoubleSide, fog: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = HEIGHT_SCALE * 0.55; // terrain 위 살짝 띄움
    scene.add(ring);
    state.outerRing = ring;
  }
  {
    const voidGeo = new THREE.RingGeometry(VOID_R - 0.25, VOID_R + 0.2, 64);
    voidGeo.rotateX(-Math.PI / 2);
    const voidMat = new THREE.MeshBasicMaterial({ color: 0xa88aa3, transparent: true, opacity: 0.65, side: THREE.DoubleSide, fog: false });
    const v = new THREE.Mesh(voidGeo, voidMat);
    v.position.y = HEIGHT_SCALE * 0.55;
    scene.add(v);
    state.voidMarker = v;
  }

  // 그룹들
  state.threadsGroup = new THREE.Group();
  state.threadsGroup.name = 'tvStageThreads';
  scene.add(state.threadsGroup);

  state.edgesGroup = new THREE.Group();
  state.edgesGroup.name = 'tvStageSimEdges';
  scene.add(state.edgesGroup);

  state.pinsGroup = new THREE.Group();
  state.pinsGroup.name = 'tvStagePins';
  scene.add(state.pinsGroup);

  state.raycaster = new THREE.Raycaster();
  state.mouseNDC = new THREE.Vector2();

  _bindPointerEvents();

  // resize
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => _resize());
    ro.observe(state.rootEl);
    state.resizeObserver = ro;
  } else {
    window.addEventListener('resize', _resize);
  }
  _resize();

  _startRaf();
}

function _resize() {
  if (!state.renderer || !state.camera || !state.rootEl) return;
  const w = state.rootEl.clientWidth || 1;
  const h = state.rootEl.clientHeight || 1;
  state.renderer.setSize(w, h, false);
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
}

function _startRaf() {
  if (state.rafId) return;
  const tick = () => {
    if (state.controls) state.controls.update();
    if (state.renderer && state.scene && state.camera) {
      state.renderer.render(state.scene, state.camera);
    }
    state.rafId = requestAnimationFrame(tick);
  };
  state.rafId = requestAnimationFrame(tick);
}

// ─── 드래그 (raycast) ────────────────────────────────────
function _setNDC(evt) {
  const rect = state.canvas.getBoundingClientRect();
  state.mouseNDC.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
  state.mouseNDC.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
}

function _pickPin(evt) {
  if (!state.raycaster || !state.pinsGroup) return null;
  _setNDC(evt);
  state.raycaster.setFromCamera(state.mouseNDC, state.camera);
  const hits = state.raycaster.intersectObjects(state.pinsGroup.children, true);
  if (!hits.length) return null;
  // 첫 번째 hit 의 부모 중 sceneId 보유 그룹 찾기
  let obj = hits[0].object;
  while (obj && obj !== state.pinsGroup) {
    // pinByScene 의 group 과 일치?
    const ent = [...state.pinByScene.entries()].find(([_, p]) => p.group === obj);
    if (ent) return { sceneId: ent[0], pin: ent[1] };
    obj = obj.parent;
  }
  return null;
}

function _pickTerrain(evt) {
  if (!state.raycaster || !state.terrain.mesh) return null;
  _setNDC(evt);
  state.raycaster.setFromCamera(state.mouseNDC, state.camera);
  const hits = state.raycaster.intersectObject(state.terrain.mesh, false);
  if (!hits.length) return null;
  return hits[0].point.clone();
}

function _bindPointerEvents() {
  if (!state.canvas) return;

  state.canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const picked = _pickPin(e);
    if (!picked) return;
    state.drag.sceneId = picked.sceneId;
    state.drag.moved = false;
    state.drag.pointerId = e.pointerId;
    if (state.controls) state.controls.enabled = false;
    state.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  state.canvas.addEventListener('pointermove', (e) => {
    if (!state.drag.sceneId || e.pointerId !== state.drag.pointerId) return;
    const hit = _pickTerrain(e);
    if (!hit) return;
    const c = clampToTerrain(hit.x, hit.z);
    const sc = state.scenes.find(s => s.id === state.drag.sceneId);
    if (!sc) return;
    if (!sc.meta) sc.meta = {};
    sc.meta.stage_position = { x: c.x, z: c.z };
    state.drag.moved = true;
    // 즉시 반영 (full render — pin 위치 + thread 갱신)
    render();
  });

  const endDrag = (e) => {
    if (!state.drag.sceneId) return;
    if (e && e.pointerId !== state.drag.pointerId) return;
    const sceneId = state.drag.sceneId;
    const moved = state.drag.moved;
    state.drag.sceneId = null;
    state.drag.moved = false;
    state.drag.pointerId = null;
    if (state.controls) state.controls.enabled = true;
    if (e && state.canvas.hasPointerCapture && state.canvas.hasPointerCapture(e.pointerId)) {
      try { state.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    if (moved) {
      const sc = state.scenes.find(s => s.id === sceneId);
      if (sc && sc.meta && sc.meta.stage_position) {
        persistStagePosition(sceneId, sc.meta.stage_position.x, sc.meta.stage_position.z);
      }
    } else {
      // 드래그가 아니라 클릭으로 간주 — 외부 콜백(씬 편집 패널 띄우기 등) 호출
      if (typeof state.onSceneClick === 'function') {
        try { state.onSceneClick(sceneId); } catch (err) { console.error('[StageView] onSceneClick error', err); }
      }
    }
  };
  state.canvas.addEventListener('pointerup', endDrag);
  state.canvas.addEventListener('pointercancel', endDrag);
}

async function persistStagePosition(sceneId, x, z) {
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    const sc = state.scenes.find(s => s.id === sceneId);
    if (!sc) return;
    const newMeta = Object.assign({}, sc.meta || {}, { stage_position: { x: +x.toFixed(3), z: +z.toFixed(3) } });
    const { error } = await sb.from('scenes').update({ meta: newMeta }).eq('id', sceneId);
    if (error) { console.error('[stage_position] save failed', error); return; }
    sc.meta = newMeta;
    console.log('[Admin/stage v2] saved', sceneId, newMeta.stage_position);
  } catch (e) {
    console.error('[stage_position] error', e);
  }
}

// ─── terrain mesh 로드 ────────────────────────────────────
async function _fetchTerrainP(memoryId) {
  const T = window.TemAfStrataTerrain;
  if (!T || !T.buildMemoryItems) return null;
  let sb;
  try { sb = await getSupabaseClient(); } catch (_) { return null; }
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
  if (!state.renderer || !memoryId) return;
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
      state.scene.remove(t.mesh);
      if (t.mesh.geometry) t.mesh.geometry.dispose();
      if (t.mesh.material) t.mesh.material.dispose();
      t.mesh = null;
    }

    const geo = new THREE.PlaneGeometry(TERRAIN_SZ, TERRAIN_SZ, TERRAIN_G - 1, TERRAIN_G - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position.array;
    const colors = new Float32Array(pos.length);
    const mn = field.minH, mx = field.maxH;
    const rg = (mx - mn) || 1;

    // 정규화된 vertex Y 격자 (raycast / pin 높이 보간 양쪽에 사용)
    const ytable = new Float32Array(TERRAIN_G * TERRAIN_G);
    for (let j = 0; j < TERRAIN_G * TERRAIN_G; j++) {
      const y = ((field.hts[j] - mn) / rg - 0.5) * HEIGHT_SCALE;
      ytable[j] = y;
      pos[j * 3 + 1] = y;
      colors[j * 3]     = field.cls[j * 3];
      colors[j * 3 + 1] = field.cls[j * 3 + 1];
      colors[j * 3 + 2] = field.cls[j * 3 + 2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'tvStageTerrain';
    state.scene.add(mesh);
    t.mesh = mesh;
    t.hts = ytable;
    t.memoryId = memoryId;

    // terrain 갱신 후 핀 높이 다시 갱신
    render();
    // smoke_task_15_v2 가 잡는 콘솔 로그 — 메시지 prefix 유지
    console.log('[StageView] terrain loaded for', memoryId);
  } catch (e) {
    console.warn('[StageView] terrain load failed', e);
  } finally {
    t.loading = false;
  }
}

// ─── 상태 HUD ──────────────────────────────────────────────
function _updateStatus() {
  const status = document.getElementById('tvStageStatus');
  if (!status) return;
  const total = state.scenes.length;
  const counts = { manual: 0, af: 0, emotion: 0, order: 0 };
  state.scenes.forEach(s => {
    const p = getStagePosition(s, total);
    if (p && counts[p.source] != null) counts[p.source]++;
  });
  status.textContent = `씬 ${total} · 수동 ${counts.manual} · AF ${counts.af} · 감정 ${counts.emotion} · 순서 ${counts.order}  ·  드래그=좌표 편집  ·  마우스=회전·줌`;
}

// ─── 외부 API ──────────────────────────────────────────────
function mount(rootSelector) {
  const root = typeof rootSelector === 'string' ? document.getElementById(rootSelector) : rootSelector;
  if (!root) return null;
  state.rootEl = root;
  root.innerHTML = '';
  _initScene();
  return api;
}

function setScenes(scenes) {
  state.scenes = Array.isArray(scenes) ? scenes : [];
  render();
}

function setSimState(simSnapshot) {
  state.sim = simSnapshot || { active: false, runners: { A: null, B: null }, compareMode: false };
  render();
}

function setMemoryId(memoryId) {
  if (!memoryId) return;
  if (!state.canvas) _initScene();
  _loadTerrainForMemory(memoryId);
}

function setSceneClickHandler(fn) {
  state.onSceneClick = (typeof fn === 'function') ? fn : null;
}

function _debugTerrain() {
  const t = state.terrain;
  return {
    hasCanvas: !!state.canvas,
    hasMesh: !!t.mesh,
    meshChildren: state.scene ? state.scene.children.length : 0,
    meshVertexCount: t.mesh && t.mesh.geometry ? t.mesh.geometry.attributes.position.count : 0,
    pinCount: state.pinByScene.size,
    memoryId: t.memoryId,
    canvasSize: state.canvas ? { w: state.canvas.width, h: state.canvas.height } : null,
  };
}

const api = { mount, setScenes, setSimState, setMemoryId, setSceneClickHandler, _debugTerrain };

// ─── 글로벌 노출 ───────────────────────────────────────────
window.LumenAdminStageView = api;

export default api;

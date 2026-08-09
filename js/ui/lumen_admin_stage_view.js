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

// 2026-05-16 — 두 종류 유령을 같은 지형에 색으로 구분 (사용자 결정).
//   장면 유령 = 파란 핀 (scenes.meta.stage_position)
//   잔상 유령 = 밝은 회색 마커 (memories.ghost_condensation_points)
const SCENE_PIN_COLOR = 0x6a9fd8;        // 파랑 — 장면 유령
const RESIDUAL_GHOST_COLOR = 0xc8c8d0;   // 밝은 회색 — 잔상 유령
const GHOST_MARKER_R = 1.3;              // 잔상 유령 마커 반경

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
  // 260730: 자리 규칙을 **플레이와 공유**한다 (js/shared/tem_object_anchors.js).
  //   그전까지 admin 은 stage_position 없는 씬을 AF/VAD/원형 공식으로 그렸고 플레이는
  //   감정 투영(H2=23 + 기억 해시)을 썼다 → 같은 씬이 두 화면에서 다른 자리.
  //   사물을 admin 에서 배치하려면 기준틀부터 같아야 하므로 관객이 걷는 쪽으로 통일.
  const OA = window.TemObjectAnchors;
  if (OA && typeof OA.resolvePinPos === 'function') {
    const r = OA.resolvePinPos(scene, state.terrain.memoryId);
    if (r) return r;
  }
  // 이하 최후 폴백 — 감정도 없는 씬 (플레이는 이 경우 핀을 아예 안 세운다.
  //   admin 은 편집 대상을 잃지 않도록 계속 보여준다.)
  const af = autoProjectFromAF(scene);
  if (af) return { x: af.x, z: af.z, source: 'af' };
  const em = autoProjectFromEmotion(scene);
  if (em) return { x: em.x, z: em.z, source: 'emotion-legacy' };
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
  pinsGroup: null,             // 모든 핀(shaft+head+label) 컨테이너 — 장면 유령
  ghostsGroup: null,           // 잔상 유령 마커 컨테이너 (2026-05-16)
  objectsGroup: null,          // 사물 앵커 마커 컨테이너 (260730)
  doorGroup: null,             // 출구문 마커 컨테이너 (260730)
  doorMarker: null,            // 빌드된 문 마커
  doorAnchor: null,            // { x, z, faceX, faceZ, source } — 공용 계산기 결과
                               // (door_pos 는 아래 memoryMeta 에 산다 — 260731 rep_anchors 와 같은 그릇)
  memoryMeta: null,            // 260731 기억 meta (rep_anchors 대표 앵커 읽기/쓰기용)
  objectAnchors: [],           // 공용 계산기 결과 [{scene, sceneId, word, x, z, rotY, pinned}]
  objectMarkers: [],           // 빌드된 사물 마커 (objectAnchors 와 같은 인덱스)
  threadsGroup: null,          // scene_order 점선
  edgesGroup: null,            // 시뮬 visited / candidate 화살
  voidMarker: null,            // 중앙 void 표시 디스크
  outerRing: null,             // 외곽 R 표시 링
  pinByScene: new Map(),       // sceneId → { group, head, shaft, label, baseColor, pos }
  scenes: [],
  ghostPoints: [],             // 잔상 유령 [{x, z, pollution_threshold}] — memories.ghost_condensation_points
  ghostMarkers: [],            // 빌드된 잔상 유령 마커 메쉬 (ghostPoints 와 같은 인덱스)
  sim: { active: false, runners: { A: null, B: null }, compareMode: false },
  personaHighlight: null,      // 260730 B안 — 페르소나 STEP 강조 sceneId (궤적 2D 탭 은퇴, 3D 핀 이식)
  // 260809: armed/holdTimer 추가 — 꾹 잡아야(DRAG_HOLD_MS) 끌리기 시작한다.
  //   종전엔 누른 즉시 끌려서, 편집창만 열려던 클릭이 손떨림 1px 로 "이동+저장"이 됐다.
  drag: { sceneId: null, ghostIdx: -1, objIdx: -1, moved: false, pointerId: null, armed: false, holdTimer: null },
  rafId: null,
  resizeObserver: null,
  onSceneClick: null,          // 장면 유령(핀) 클릭(드래그 X) 시 (sceneId) => void 호출
  onGhostClick: null,          // 잔상 유령 마커 클릭(드래그 X) 시 (ghostIdx) => void 호출
  tooltipContainer: null,      // 시뮬 핀 텍스트 overlay 컨테이너 (rootEl 자식)
  tooltips: new Map(),         // sceneId → div
};

// 툴팁 텍스트 길이 컷
const SIM_TOOLTIP_MAX_CHARS = 80;

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

// ─── 잔상 유령 마커 (2026-05-16) ──────────────────────────
// 장면 유령(핀, 막대+머리)과 시각적으로 구분 — 막대 없이 떠 있는 회색 옥타헤드론.
// "상호작용 불가, 떠도는 소문" 톤 → 부유감.
function _buildGhostMarker() {
  const group = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(GHOST_MARKER_R, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: RESIDUAL_GHOST_COLOR, emissive: RESIDUAL_GHOST_COLOR,
    emissiveIntensity: 0.35, roughness: 0.7, metalness: 0.05,
    transparent: true, opacity: 0.82,
  });
  const body = new THREE.Mesh(geo, mat);
  body.userData._ghostPart = 'body';
  group.add(body);
  // 바닥 그림자 디스크 — 지형 위 어느 위치인지 읽히게
  const discGeo = new THREE.CircleGeometry(GHOST_MARKER_R * 1.5, 24);
  discGeo.rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({
    color: RESIDUAL_GHOST_COLOR, transparent: true, opacity: 0.18,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.userData._ghostPart = 'disc';
  group.add(disc);
  return { group, body, disc };
}

function _disposeGhostMarker(m) {
  if (!m) return;
  if (m.body) { m.body.geometry.dispose(); m.body.material.dispose(); }
  if (m.disc) { m.disc.geometry.dispose(); m.disc.material.dispose(); }
}

// state.ghostPoints → 마커 메쉬 동기화. ghostPoints 와 ghostMarkers 는 같은 인덱스.
function renderGhostMarkers() {
  if (!state.scene || !state.ghostsGroup) return;
  const pts = state.ghostPoints;

  // 개수 초과 마커 제거
  while (state.ghostMarkers.length > pts.length) {
    const m = state.ghostMarkers.pop();
    state.ghostsGroup.remove(m.group);
    _disposeGhostMarker(m);
  }
  // 부족분 생성
  while (state.ghostMarkers.length < pts.length) {
    const m = _buildGhostMarker();
    state.ghostsGroup.add(m.group);
    state.ghostMarkers.push(m);
  }
  // 위치 갱신
  pts.forEach((p, i) => {
    const m = state.ghostMarkers[i];
    if (!m) return;
    const wy = _terrainHeightAt(p.x, p.z);
    m.group.position.set(p.x, wy, p.z);
    // 마커 본체는 지형 위로 살짝 띄움 (부유감)
    m.body.position.y = GHOST_MARKER_R + 1.2;
    m.disc.position.y = 0.05;
    m.group.userData._ghostIdx = i;
  });
}

// ─── 사물 앵커 마커 (260730) ──────────────────────────────
// 유령(파란 핀)·잔상(회색 옥타헤드론)과 구분 — 땅에 붙은 흙빛 상자 + 이름표.
// 자리는 공용 계산기(TemObjectAnchors)가 정하고, 끌면 scenes.meta.object_pos 에 저장.
// 작가 지정 좌표를 가진 사물은 테두리가 밝다 (자동 자리와 구별).
const OBJ_COLOR = 0xb99a6b;          // 마른 흙 (지형 사물 톤)
const OBJ_PINNED_COLOR = 0xe0cEaa;   // 작가 지정 = 밝은 금빛
const OBJ_REP_COLOR = 0xcbb8e8;      // 260731 대표 앵커 = 유령 보랏빛 (기억의 얼굴)
const OBJ_BOX = 1.6;

// 260731 대표 앵커 목록 — memories.meta.rep_anchors (없으면 빈 배열)
function _repAnchors() {
  const r = state.memoryMeta && state.memoryMeta.rep_anchors;
  return Array.isArray(r) ? r : [];
}

function _buildObjectMarker(word, rep) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(OBJ_BOX, OBJ_BOX * 0.7, OBJ_BOX);
  const mat = new THREE.MeshStandardMaterial({
    color: OBJ_COLOR, emissive: OBJ_COLOR, emissiveIntensity: 0.25,
    roughness: 0.75, metalness: 0.05, transparent: true, opacity: 0.9,
  });
  const body = new THREE.Mesh(geo, mat);
  body.position.y = OBJ_BOX * 0.35;
  body.userData._objPart = 'body';
  group.add(body);
  // 바닥 디스크 — 지형 위 어느 자리인지 읽히게
  const discGeo = new THREE.CircleGeometry(OBJ_BOX * 1.1, 20);
  discGeo.rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({
    color: OBJ_COLOR, transparent: true, opacity: 0.2,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.y = 0.05;
  disc.userData._objPart = 'disc';
  group.add(disc);
  // 260731: 대표 앵커 — 바닥에 보랏빛 링 하나 (멀리서도 대표가 읽히게)
  if (rep) {
    const ringGeo = new THREE.RingGeometry(OBJ_BOX * 1.3, OBJ_BOX * 1.5, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: OBJ_REP_COLOR, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.08;
    ring.raycast = function () {};   // 링은 장식 — 조준 대상 아님
    group.add(ring);
  }
  // 260731: 대표 앵커는 이름표에 ★ + 보랏빛 — "이 기억의 얼굴" 표시
  const label = _makeLabelSprite(rep ? '★ ' + word : word, rep ? OBJ_REP_COLOR : OBJ_PINNED_COLOR);
  label.position.y = OBJ_BOX + 1.6;
  label.scale.set(6, 6, 1);
  // 260730 실측: 이름표 스프라이트는 6유닛 사각형 + depthTest 없음이라, 옆 사물의 이름표가
  //   내가 겨눈 몸통보다 카메라에 가까워 raycast 를 가로챘다 ("피" 를 집었는데 "눈" 이 잡힘).
  //   이름표는 읽기용이므로 조준 대상에서 제외 — 집는 것은 몸통·바닥 디스크뿐.
  label.raycast = function () {};
  group.add(label);
  return { group, body, disc, label, word, _rep: !!rep };
}

function _disposeObjectMarker(m) {
  if (!m) return;
  // 260731: ring 등 파생 mesh까지 — group 순회로 일괄 dispose (개별 ref 누락 방지)
  if (m.group) {
    m.group.traverse(o => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      if (o.material) {
        if (o.material.map && o.material.map.dispose) o.material.map.dispose();
        if (o.material.dispose) o.material.dispose();
      }
    });
  }
}

// 공용 계산기로 현 씬 목록의 사물 자리를 구한다 (작가 지정 우선은 계산기 안에서 처리).
function _computeObjectAnchors() {
  const OA = window.TemObjectAnchors;
  if (!OA || typeof OA.layout !== 'function') return [];
  const total = state.scenes.length;
  const items = state.scenes.map(sc => {
    const pos = getStagePosition(sc, total);
    return pos ? { scene: sc, wx: pos.x, wz: pos.z } : null;
  }).filter(Boolean);
  return OA.layout(items);
}

function renderObjectMarkers() {
  if (!state.scene || !state.objectsGroup) return;
  state.objectAnchors = _computeObjectAnchors();
  const list = state.objectAnchors;

  // 개수 초과 마커 제거 / 부족분 생성 (라벨 텍스트가 달라지면 새로 만든다)
  while (state.objectMarkers.length > list.length) {
    const m = state.objectMarkers.pop();
    state.objectsGroup.remove(m.group);
    _disposeObjectMarker(m);
  }
  const reps = _repAnchors();
  list.forEach((a, i) => {
    const isRep = reps.indexOf(a.word) !== -1;
    let m = state.objectMarkers[i];
    // 260731: 대표 여부가 바뀌면 마커를 새로 만든다 (이름표 텍스처·링이 빌드 시점 고정이라)
    if (!m || m.word !== a.word || m._rep !== isRep) {
      if (m) { state.objectsGroup.remove(m.group); _disposeObjectMarker(m); }
      m = _buildObjectMarker(a.word, isRep);
      state.objectsGroup.add(m.group);
      state.objectMarkers[i] = m;
    }
    const wy = _terrainHeightAt(a.x, a.z);
    m.group.position.set(a.x, wy, a.z);
    m.group.rotation.y = a.rotY || 0;
    m.group.userData._objIdx = i;
    // 260731: 대표 > 작가 지정 > 자동 순으로 색 우선
    const col = isRep ? OBJ_REP_COLOR : (a.pinned ? OBJ_PINNED_COLOR : OBJ_COLOR);
    m.body.material.color.setHex(col);
    m.body.material.emissive.setHex(col);
    m.body.material.emissiveIntensity = isRep ? 0.6 : (a.pinned ? 0.5 : 0.22);
    m.disc.material.color.setHex(col);
    m.disc.material.opacity = isRep ? 0.35 : (a.pinned ? 0.3 : 0.18);
  });
}

// ─── 출구문 마커 (260730) ─────────────────────────────────
// 사물과 같은 조작: 끌면 memories.meta.door_pos 저장, 두 번 클릭이면 자동 자리 복귀.
// 자동 자리 = 씬 무리의 반대편 (공용 계산기 resolveDoorPos).
const DOOR_COLOR = 0x8a7a65;
const DOOR_PINNED_COLOR = 0xd8c49a;

function _buildDoorMarker() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: DOOR_COLOR, emissive: DOOR_COLOR, emissiveIntensity: 0.3,
    roughness: 0.85, metalness: 0.05, transparent: true, opacity: 0.9,
  });
  // 문틀 — 기둥 둘 + 인방 (플레이의 대역 문과 같은 실루엣, 3.2m 를 무대 축척에 맞춰 확대)
  const S = 2.2;
  const pillarGeo = new THREE.BoxGeometry(0.35 * S, 3.2 * S, 0.35 * S);
  const pL = new THREE.Mesh(pillarGeo, mat);
  pL.position.set(-0.7 * S, 1.6 * S, 0);
  const pR = new THREE.Mesh(pillarGeo, mat);
  pR.position.set(0.7 * S, 1.6 * S, 0);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.75 * S, 0.35 * S, 0.35 * S), mat);
  lintel.position.set(0, 3.3 * S, 0);
  group.add(pL); group.add(pR); group.add(lintel);
  const discGeo = new THREE.CircleGeometry(2.6, 22);
  discGeo.rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
    color: DOOR_COLOR, transparent: true, opacity: 0.22,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  disc.position.y = 0.05;
  group.add(disc);
  const label = _makeLabelSprite('출구', DOOR_PINNED_COLOR);
  label.position.y = 3.9 * S;
  label.scale.set(9, 9, 1);
  label.raycast = function () {};      // 이름표가 조준을 가로채지 않게 (사물과 같은 규약)
  group.add(label);
  return { group, parts: [pL, pR, lintel], disc, label, mat };
}

function renderDoorMarker() {
  if (!state.scene || !state.doorGroup) return;
  const OA = window.TemObjectAnchors;
  if (!OA || typeof OA.resolveDoorPos !== 'function') return;
  const total = state.scenes.length;
  const items = state.scenes.map(sc => {
    const p = getStagePosition(sc, total);
    return p ? { wx: p.x, wz: p.z } : null;
  }).filter(Boolean);
  const d = OA.resolveDoorPos(items, state.memoryMeta || {});
  state.doorAnchor = d;
  if (!state.doorMarker) {
    state.doorMarker = _buildDoorMarker();
    state.doorGroup.add(state.doorMarker.group);
  }
  const m = state.doorMarker;
  const wy = _terrainHeightAt(d.x, d.z);
  m.group.position.set(d.x, wy, d.z);
  // 문이 씬 무리를 마주 보게 — 플레이와 같은 규칙
  if (Math.abs(d.faceX - d.x) > 0.01 || Math.abs(d.faceZ - d.z) > 0.01) {
    m.group.lookAt(d.faceX, wy, d.faceZ);
  }
  m.group.userData._doorMarker = true;
  const col = d.source === 'manual' ? DOOR_PINNED_COLOR : DOOR_COLOR;
  m.mat.color.setHex(col);
  m.mat.emissive.setHex(col);
  m.mat.emissiveIntensity = d.source === 'manual' ? 0.5 : 0.28;
  m.disc.material.color.setHex(col);
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
      pin = _buildPin(code, SCENE_PIN_COLOR);
      state.pinsGroup.add(pin.group);
      state.pinByScene.set(scene.id, pin);
    }
    pin.scene = scene;

    // 위치
    const wy = _terrainHeightAt(pos.x, pos.z);
    pin.group.position.set(pos.x, wy, pos.z);
    pin.group.visible = visible;
    pin.pos = { x: pos.x, z: pos.z, source: pos.source };

    // 색·스케일·투명도 — idle 은 장면 유령 파랑, 시뮬 시에만 runner/pattern 색
    let color = SCENE_PIN_COLOR;
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

    // 260730 B안 — 페르소나 STEP 강조: sim 'current' 와 동일 문법 (강조색 + emissive 증폭 + 확대).
    // renderPins 는 매 render() 마다 전 핀을 다시 칠하므로, 여기서 덮어써야 강조가 재렌더에도 살아남는다.
    const isPersona = state.personaHighlight != null && scene.id === state.personaHighlight;
    if (isPersona) {
      color = BASE_PIN_COLOR; // #c4a882 계열 강조
      opacity = 1; scale = 1.45;
    }

    pin.head.material.color.setHex(color);
    pin.head.material.emissive.setHex(color);
    pin.head.material.emissiveIntensity = isPersona ? 0.85 : 0.25; // 비강조 핀은 빌드 기본값으로 복원
    pin.head.material.opacity = opacity;
    pin.head.material.transparent = opacity < 1;
    pin.head.scale.setScalar(scale);
    pin.shaft.material.opacity = isPersona ? 0.95 : Math.max(0.35, opacity * 0.75);
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
  renderGhostMarkers();
  renderObjectMarkers();   // 260730 사물 앵커 — 핀 자리에 의존하므로 핀 다음
  renderDoorMarker();      // 260730 출구문 — 씬 무리 중심에 의존
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

  state.ghostsGroup = new THREE.Group();
  state.ghostsGroup.name = 'tvStageGhosts';
  scene.add(state.ghostsGroup);

  state.objectsGroup = new THREE.Group();   // 260730 사물 앵커
  state.objectsGroup.name = 'tvStageObjects';
  scene.add(state.objectsGroup);

  state.doorGroup = new THREE.Group();      // 260730 출구문
  state.doorGroup.name = 'tvStageDoor';
  scene.add(state.doorGroup);

  state.raycaster = new THREE.Raycaster();
  state.mouseNDC = new THREE.Vector2();

  _bindPointerEvents();

  // 툴팁 overlay (canvas 위에 absolute, pointer-events 차단)
  const tipC = document.createElement('div');
  tipC.id = 'tvStageTooltips';
  tipC.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5;';
  state.rootEl.appendChild(tipC);
  state.tooltipContainer = tipC;

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
    _updateSimTooltips();
    state.rafId = requestAnimationFrame(tick);
  };
  state.rafId = requestAnimationFrame(tick);
}

// ─── 시뮬 툴팁 (current / candidate 핀에 장면 텍스트) ──────
// raf tick 마다 — 시뮬 활성 시 해당 핀 위에 본문 일부 띄움.
// 카메라 회전·줌 따라 자동 추적.
const _ttVec = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
function _updateSimTooltips() {
  if (!state.tooltipContainer || !state.camera || !state.canvas || !_ttVec) return;

  // 어떤 씬에 표시할지: current + candidate (둘 다)
  const visibleByScene = new Map();
  if (state.sim.active) {
    state.scenes.forEach(scene => {
      const hi = _simHighlight(scene.id);
      if (hi.role !== 'current' && hi.role !== 'candidate') return;
      const raw = (scene.text || '').trim();
      if (!raw) return;
      const txt = raw.length > SIM_TOOLTIP_MAX_CHARS
        ? raw.slice(0, SIM_TOOLTIP_MAX_CHARS) + '…'
        : raw;
      const code = (scene.meta && scene.meta.scene_code) || (scene.scene_order != null ? String(scene.scene_order) : '');
      const colorHex = (hi.role === 'current')
        ? (RUNNER_BASE_COLOR[hi.runnerKey] || BASE_PIN_COLOR)
        : (PATTERN_COLOR[hi.pattern] || RUNNER_BASE_COLOR[hi.runnerKey] || BASE_PIN_COLOR);
      visibleByScene.set(scene.id, {
        text: txt, code, colorHex, role: hi.role, runnerKey: hi.runnerKey,
      });
    });
  }

  // 사라진 툴팁 정리
  state.tooltips.forEach((div, sceneId) => {
    if (!visibleByScene.has(sceneId)) {
      div.remove();
      state.tooltips.delete(sceneId);
    }
  });

  // 위치 + 내용 갱신
  const w = state.canvas.clientWidth;
  const h = state.canvas.clientHeight;
  visibleByScene.forEach((info, sceneId) => {
    const pin = state.pinByScene.get(sceneId);
    if (!pin || !pin.head) return;

    // 핀 머리 world 좌표 → NDC → screen
    pin.head.getWorldPosition(_ttVec);
    _ttVec.project(state.camera);
    // frustum 밖이면 숨김
    const inFrustum = _ttVec.x >= -1.1 && _ttVec.x <= 1.1
      && _ttVec.y >= -1.1 && _ttVec.y <= 1.1
      && _ttVec.z >= -1 && _ttVec.z <= 1;

    let div = state.tooltips.get(sceneId);
    if (!div) {
      div = document.createElement('div');
      div.className = 'tv-stage-sim-tooltip';
      div.style.cssText = [
        'position:absolute',
        'max-width:240px',
        'padding:7px 10px',
        'background:rgba(15,15,22,0.92)',
        'border:1px solid rgba(196,168,130,0.4)',
        'border-radius:3px',
        'color:#e0d8c4',
        'font-family:"Noto Serif KR",serif',
        'font-size:0.74rem',
        'line-height:1.5',
        'backdrop-filter:blur(4px)',
        'word-break:keep-all',
        'pointer-events:none',
        'transform:translate(-50%,-100%) translateY(-18px)',
        'transition:opacity .12s',
      ].join(';') + ';';
      state.tooltipContainer.appendChild(div);
      state.tooltips.set(sceneId, div);
    }

    if (!inFrustum) {
      div.style.opacity = '0';
      return;
    }
    div.style.opacity = '1';

    const x = (_ttVec.x * 0.5 + 0.5) * w;
    const y = (-_ttVec.y * 0.5 + 0.5) * h;
    div.style.left = x + 'px';
    div.style.top  = y + 'px';

    // role-aware 색
    const c = info.colorHex;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    div.style.borderColor = `rgba(${r},${g},${b},0.65)`;

    // 내용 (변경 시만 — DOM 갱신 비용 최소화)
    const sigil = info.role === 'current' ? '◉' : '○';
    const head = `<div style="font-family:'Cormorant Garamond',serif;font-size:0.72rem;color:rgb(${r},${g},${b});letter-spacing:0.06em;margin-bottom:3px;">${sigil} ${info.runnerKey || ''} · ${info.code || ''} · ${info.role}</div>`;
    const body = `<div>${_escapeHtml(info.text)}</div>`;
    const html = head + body;
    if (div._lastHtml !== html) {
      div.innerHTML = html;
      div._lastHtml = html;
    }
  });
}

function _escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
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

// 출구문 마커 raycast → true/false
function _pickDoorMarker(evt) {
  if (!state.raycaster || !state.doorGroup || !state.doorMarker) return false;
  _setNDC(evt);
  state.raycaster.setFromCamera(state.mouseNDC, state.camera);
  return state.raycaster.intersectObjects(state.doorGroup.children, true).length > 0;
}

// 사물 마커 raycast → objectAnchors 인덱스 (없으면 -1)
function _pickObjectMarker(evt) {
  if (!state.raycaster || !state.objectsGroup) return -1;
  _setNDC(evt);
  state.raycaster.setFromCamera(state.mouseNDC, state.camera);
  const hits = state.raycaster.intersectObjects(state.objectsGroup.children, true);
  if (!hits.length) return -1;
  let obj = hits[0].object;
  while (obj && obj !== state.objectsGroup) {
    if (obj.userData && typeof obj.userData._objIdx === 'number') return obj.userData._objIdx;
    obj = obj.parent;
  }
  return -1;
}

// 잔상 유령 마커 raycast → ghostPoints 인덱스 (없으면 -1)
function _pickGhostMarker(evt) {
  if (!state.raycaster || !state.ghostsGroup) return -1;
  _setNDC(evt);
  state.raycaster.setFromCamera(state.mouseNDC, state.camera);
  const hits = state.raycaster.intersectObjects(state.ghostsGroup.children, true);
  if (!hits.length) return -1;
  let obj = hits[0].object;
  while (obj && obj !== state.ghostsGroup) {
    if (obj.userData && typeof obj.userData._ghostIdx === 'number') return obj.userData._ghostIdx;
    obj = obj.parent;
  }
  return -1;
}

// 260809 사용자 지시: "핀 움직이려면 좀 꾹 잡고있어야" — 편집창만 보려고 누른 클릭이
//   손떨림으로 좌표를 바꿔버리던 문제. 이 시간만큼 누르고 있어야 끌기가 시작된다.
//   그 전의 움직임은 무시(취소 아님) — 누른 채 바로 끄는 자연스러운 동작도 0.35초 뒤 이어진다.
//   짧게 누르면 armed 가 안 되므로 언제나 클릭(편집창 열기)으로 떨어진다.
const DRAG_HOLD_MS = 350;

function _clearHoldTimer() {
  if (state.drag.holdTimer) { clearTimeout(state.drag.holdTimer); state.drag.holdTimer = null; }
}
// 잡혔다는 유일한 신호 — 커서. (핀 강조는 render() 가 매 프레임 덮어써서 못 쓴다)
function _setGrabCursor(on) {
  if (!state.canvas) return;
  state.canvas.style.cursor = on ? 'grabbing' : '';
}

function _bindPointerEvents() {
  if (!state.canvas) return;

  state.canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // 우선순위: 장면 유령(핀) → 사물 마커 → 잔상 유령 마커
    const picked = _pickPin(e);
    state.drag.sceneId = null;
    state.drag.ghostIdx = -1;
    state.drag.objIdx = -1;
    state.drag.door = false;
    if (picked) {
      state.drag.sceneId = picked.sceneId;
    } else {
      const oi = _pickObjectMarker(e);
      if (oi >= 0) {
        state.drag.objIdx = oi;
      } else if (_pickDoorMarker(e)) {
        state.drag.door = true;
      } else {
        const gi = _pickGhostMarker(e);
        if (gi < 0) return;
        state.drag.ghostIdx = gi;
      }
    }
    state.drag.moved = false;
    state.drag.pointerId = e.pointerId;
    // 260809: 아직 안 잡힘 — DRAG_HOLD_MS 지나야 끌기 시작 (그 전 움직임은 무시)
    state.drag.armed = false;
    _clearHoldTimer();
    state.drag.holdTimer = setTimeout(() => {
      state.drag.holdTimer = null;
      if (state.drag.pointerId == null) return;   // 이미 손 뗌
      state.drag.armed = true;
      _setGrabCursor(true);
    }, DRAG_HOLD_MS);
    if (state.controls) state.controls.enabled = false;
    try { state.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    // 260730: 사물 마커를 집었을 때는 preventDefault 를 하지 않는다.
    //   Chrome 은 pointerdown 의 기본동작을 막으면 뒤따르는 click/dblclick 을 아예 안 만든다
    //   → "두 번 클릭 = 자동 자리 복귀" 가 영영 발동하지 않았다 (260730 실측).
    //   드래그 자체는 pointercapture 로 처리되므로 기본동작을 살려도 문제 없다.
    if (state.drag.objIdx < 0) e.preventDefault();
  });

  state.canvas.addEventListener('pointermove', (e) => {
    const dragging = (state.drag.sceneId != null) || (state.drag.ghostIdx >= 0)
      || (state.drag.objIdx >= 0) || state.drag.door;
    if (!dragging || e.pointerId !== state.drag.pointerId) return;
    if (!state.drag.armed) return;   // 260809: 아직 꾹 안 잡았다 — 좌표 안 건드림 (클릭 보호)
    const hit = _pickTerrain(e);
    if (!hit) return;
    const c = clampToTerrain(hit.x, hit.z);
    if (state.drag.door) {
      // 출구문 — memories.meta.door_pos. 로컬 meta 에 먼저 써야 다음 render 가 읽는다.
      if (!state.memoryMeta) state.memoryMeta = {};
      state.memoryMeta.door_pos = { x: c.x, z: c.z };
    } else if (state.drag.objIdx >= 0) {
      // 사물 — scenes.meta.object_pos[단어]. 로컬 meta 에 먼저 써야 다음 render 에서
      // 공용 계산기가 이 좌표를 읽는다 (안 그러면 손을 놓기 전에 제자리로 튄다).
      const a = state.objectAnchors[state.drag.objIdx];
      if (!a || !a.scene) return;
      const sc = a.scene;
      if (!sc.meta) sc.meta = {};
      if (!sc.meta.object_pos || typeof sc.meta.object_pos !== 'object') sc.meta.object_pos = {};
      sc.meta.object_pos[a.word] = { x: c.x, z: c.z };
    } else if (state.drag.sceneId != null) {
      // 장면 유령 — scenes.meta.stage_position
      const sc = state.scenes.find(s => s.id === state.drag.sceneId);
      if (!sc) return;
      if (!sc.meta) sc.meta = {};
      sc.meta.stage_position = { x: c.x, z: c.z };
    } else {
      // 잔상 유령 — state.ghostPoints[idx]
      const gp = state.ghostPoints[state.drag.ghostIdx];
      if (!gp) return;
      gp.x = c.x;
      gp.z = c.z;
    }
    state.drag.moved = true;
    // 즉시 반영 (full render — pin·ghost 위치 + thread 갱신)
    render();
  });

  const endDrag = (e) => {
    const wasScene = state.drag.sceneId != null;
    const wasGhost = state.drag.ghostIdx >= 0;
    const wasObj = state.drag.objIdx >= 0;
    const wasDoor = state.drag.door;
    if (!wasScene && !wasGhost && !wasObj && !wasDoor) return;
    if (e && e.pointerId !== state.drag.pointerId) return;
    const sceneId = state.drag.sceneId;
    const ghostIdx = state.drag.ghostIdx;
    const objIdx = state.drag.objIdx;
    const moved = state.drag.moved;
    state.drag.sceneId = null;
    state.drag.ghostIdx = -1;
    state.drag.objIdx = -1;
    state.drag.door = false;
    state.drag.moved = false;
    state.drag.pointerId = null;
    state.drag.armed = false;      // 260809 꾹 잡기 해제
    _clearHoldTimer();
    _setGrabCursor(false);
    if (state.controls) state.controls.enabled = true;
    if (e && state.canvas.hasPointerCapture && state.canvas.hasPointerCapture(e.pointerId)) {
      try { state.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    if (wasDoor) {
      if (moved) persistDoorPos();
      return;
    }
    if (wasObj) {
      const a = state.objectAnchors[objIdx];
      if (moved) {
        if (a && a.scene) persistObjectPos(a.scene, a.word);
      } else if (a && e && e.altKey) {
        // 260731: Alt+클릭 = 대표 앵커 토글 — "이 기억의 얼굴" 지정 (최대 3개)
        toggleRepAnchor(a.word);
      } else if (a && a.sceneId && typeof state.onSceneClick === 'function') {
        // 260730: 사물을 한 번 클릭 = 그 사물이 속한 씬 편집 열기.
        //   사물 태그·문장 지정 칸으로 가는 통로 (핀을 따로 찾을 필요 없게).
        try { state.onSceneClick(a.sceneId); } catch (err) { console.error('[StageView] onSceneClick error', err); }
      }
      return;
    }
    if (wasGhost) {
      // 잔상 유령 — 이동 시 저장, 클릭(미이동) 시 편집 패널 콜백
      if (moved) {
        persistGhostPoints();
      } else if (typeof state.onGhostClick === 'function') {
        try { state.onGhostClick(ghostIdx); } catch (err) { console.error('[StageView] onGhostClick error', err); }
      }
      return;
    }
    // 장면 유령 (핀)
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

  // 사물·출구문 두 번 클릭 = 작가 지정 취소 → 자동 자리로 복귀 (260730)
  state.canvas.addEventListener('dblclick', (e) => {
    if (_pickDoorMarker(e)) {
      if (state.memoryMeta && state.memoryMeta.door_pos) {
        delete state.memoryMeta.door_pos;
        render();
        persistDoorPos();
      } else {
        console.log('[Admin/stage v2] 두 번 클릭 — 출구문은 이미 자동 자리');
      }
      e.preventDefault();
      return;
    }
    const oi = _pickObjectMarker(e);
    if (oi < 0) { console.log('[Admin/stage v2] 두 번 클릭 — 사물 마커 아님 (무시)'); return; }
    const a = state.objectAnchors[oi];
    if (!a || !a.scene) return;
    if (!a.pinned) { console.log('[Admin/stage v2] 두 번 클릭 —', a.word, '은 이미 자동 자리'); return; }
    const sc = a.scene;
    if (sc.meta && sc.meta.object_pos) {
      delete sc.meta.object_pos[a.word];
      if (!Object.keys(sc.meta.object_pos).length) delete sc.meta.object_pos;
    }
    render();
    persistObjectPos(sc, a.word);
    e.preventDefault();
  });
}

// 출구문 좌표 저장 — memories.meta.door_pos. 없으면 키 삭제(자동 자리 복귀).
// meta 를 통째로 덮으면 Edge Function 이 같은 시각에 쓴 object_models 를 지울 수 있어
// **최신 meta 를 다시 읽어 그 위에 병합**한다 (사물 자동 생성과 같은 그릇을 쓰므로).
async function persistDoorPos() {
  const memoryId = state.terrain.memoryId;
  if (!memoryId) { console.warn('[door_pos] memoryId 없음 — 저장 스킵'); return; }
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    const { data: fresh, error: readErr } = await sb.from('memories')
      .select('meta').eq('id', memoryId).maybeSingle();
    if (readErr) { console.error('[door_pos] 읽기 실패', readErr); return; }
    const newMeta = Object.assign({}, (fresh && fresh.meta) || {});
    const dp = state.memoryMeta && state.memoryMeta.door_pos;
    if (dp && Number.isFinite(+dp.x) && Number.isFinite(+dp.z)) {
      newMeta.door_pos = { x: +(+dp.x).toFixed(3), z: +(+dp.z).toFixed(3) };
    } else {
      delete newMeta.door_pos;
    }
    const { error } = await sb.from('memories').update({ meta: newMeta }).eq('id', memoryId);
    if (error) { console.error('[door_pos] save failed', error); return; }
    state.memoryMeta = newMeta;
    console.log('[Admin/stage v2] door_pos saved', newMeta.door_pos || '(자동 복귀)');
  } catch (e) {
    console.error('[door_pos] error', e);
  }
}

// 사물 좌표 저장 — 해당 씬의 object_pos 전체를 통째로 UPDATE.
// 지정이 하나도 안 남으면 키 자체를 지운다 (죽은 키가 쌓이지 않게).
async function persistObjectPos(scene, word) {
  if (!scene || !scene.id) return;
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    const newMeta = Object.assign({}, scene.meta || {});
    const src = (scene.meta && scene.meta.object_pos) || null;
    if (src && Object.keys(src).length) {
      const rounded = {};
      Object.keys(src).forEach(k => {
        const p = src[k];
        if (p && Number.isFinite(+p.x) && Number.isFinite(+p.z)) {
          rounded[k] = { x: +(+p.x).toFixed(3), z: +(+p.z).toFixed(3) };
        }
      });
      if (Object.keys(rounded).length) newMeta.object_pos = rounded;
      else delete newMeta.object_pos;
    } else {
      delete newMeta.object_pos;
    }
    const { error } = await sb.from('scenes').update({ meta: newMeta }).eq('id', scene.id);
    if (error) { console.error('[object_pos] save failed', error); return; }
    scene.meta = newMeta;
    console.log('[Admin/stage v2] object_pos saved', word,
      newMeta.object_pos ? newMeta.object_pos[word] || '(자동 복귀)' : '(자동 복귀)');
  } catch (e) {
    console.error('[object_pos] error', e);
  }
}

// ─── 260731 대표 앵커 (rep_anchors) ─────────────────────────
// Alt+클릭 토글 → memories.meta.rep_anchors 저장. 최대 3개.
// 관객 흐름(261차 연출)의 연료: 문에서 나온 관객이 처음 보는 사물 = 이 목록.
function toggleRepAnchor(word) {
  if (!word) return;
  if (!state.memoryMeta) state.memoryMeta = {};
  const cur = _repAnchors().slice();
  const at = cur.indexOf(word);
  if (at !== -1) {
    cur.splice(at, 1);
    console.log('[Admin/stage v2] 대표 앵커 해제:', word, '→', cur.join(', ') || '(없음)');
  } else {
    if (cur.length >= 3) {
      console.warn('[Admin/stage v2] 대표 앵커는 최대 3개 — 먼저 하나를 해제하세요:', cur.join(', '));
      return;
    }
    cur.push(word);
    console.log('[Admin/stage v2] 대표 앵커 지정:', word, '→', cur.join(', '));
  }
  state.memoryMeta.rep_anchors = cur;
  render();
  persistRepAnchors(cur);
}

// 저장은 fetch→merge→update — meta 를 통째로 덮으면 Edge Function 이 동시에 쓰는
// object_models/object_model_jobs 를 지울 수 있어서, 최신 meta 를 다시 읽고 얹는다.
async function persistRepAnchors(list) {
  const memoryId = state.terrain.memoryId;
  if (!memoryId) { console.warn('[rep_anchors] memoryId 없음 — 저장 스킵'); return; }
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    const { data: fresh, error: readErr } = await sb.from('memories')
      .select('meta').eq('id', memoryId).maybeSingle();
    if (readErr) { console.error('[rep_anchors] meta 재조회 실패', readErr); return; }
    const newMeta = Object.assign({}, (fresh && fresh.meta) || {});
    if (list && list.length) newMeta.rep_anchors = list.slice(0, 3);
    else delete newMeta.rep_anchors;
    const { error } = await sb.from('memories').update({ meta: newMeta }).eq('id', memoryId);
    if (error) { console.error('[rep_anchors] save failed', error); return; }
    state.memoryMeta = newMeta;
    console.log('[Admin/stage v2] rep_anchors saved:', newMeta.rep_anchors || '(없음)');
  } catch (e) {
    console.error('[rep_anchors] error', e);
  }
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

// ─── 잔상 유령 저장·로드·추가 (2026-05-16) ────────────────
// 잔상 유령 전체 배열을 memories.ghost_condensation_points 에 통째로 UPDATE.
// (admin.js 의 옛 SVG UI 폐기 — 이 자리가 유일한 저장 경로)
async function persistGhostPoints() {
  const memoryId = state.terrain.memoryId;
  if (!memoryId) { console.warn('[ghost_points] memoryId 없음 — 저장 스킵'); return; }
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    const payload = state.ghostPoints.map(p => ({
      x: +(+p.x).toFixed(3),
      z: +(+p.z).toFixed(3),
      pollution_threshold: +(p.pollution_threshold != null ? p.pollution_threshold : 0).toFixed(2),
      text: typeof p.text === 'string' ? p.text : '',
    }));
    const { error } = await sb.from('memories')
      .update({ ghost_condensation_points: payload }).eq('id', memoryId);
    if (error) { console.error('[ghost_points] save failed', error); return; }
    console.log('[Admin/stage v2] ghost points saved', memoryId, payload.length + '개');
  } catch (e) {
    console.error('[ghost_points] error', e);
  }
}

// 현 메모리의 ghost_condensation_points → state.ghostPoints. 같은 메모리 재호출은 스킵.
async function _loadGhostPoints(memoryId) {
  if (!memoryId || state._ghostLoadedFor === memoryId) return;
  try {
    const sb = await getSupabaseClient();
    if (!sb) return;
    const { data, error } = await sb.from('memories')
      .select('ghost_condensation_points').eq('id', memoryId).maybeSingle();
    if (error) { console.error('[ghost_points] load failed', error); return; }
    const pts = (data && Array.isArray(data.ghost_condensation_points)) ? data.ghost_condensation_points : [];
    state.ghostPoints = pts.map(p => ({
      x: Number(p.x) || 0,
      z: Number(p.z) || 0,
      pollution_threshold: p.pollution_threshold != null ? Number(p.pollution_threshold) : 0,
      text: typeof p.text === 'string' ? p.text : '',
    }));
    state._ghostLoadedFor = memoryId;
    render();
    console.log('[StageView] ghost points loaded for', memoryId, state.ghostPoints.length + '개');
  } catch (e) {
    console.error('[ghost_points] error', e);
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
  // 260731 대표 앵커 — 기억 meta 를 잡아둔다 (rep_anchors 토글·표시용)
  state.memoryMeta = memRow.meta || {};
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
  status.textContent = `장면 유령 ${total} · 수동 ${counts.manual} · AF ${counts.af} · 감정 ${counts.emotion} · 순서 ${counts.order}  ·  잔상 유령 ${state.ghostPoints.length}  ·  클릭=편집창  ·  꾹 눌러 끌기=좌표 이동  ·  마우스=회전·줌`;
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
  _loadGhostPoints(memoryId);
}

// ─── 잔상 유령 추가·삭제 외부 API (2026-05-16) ────────────
// "+ 잔상 유령" 버튼 → addGhostPoint(). terrain 빈 자리에 하나 박고 즉시 저장.
function addGhostPoint() {
  if (!state.terrain.memoryId) { console.warn('[StageView] addGhostPoint — 메모리 미선택'); return; }
  const n = state.ghostPoints.length;
  // 황금각으로 흩뿌려 기존 점과 안 겹치게
  const angle = (n * 2.39996) % (Math.PI * 2);
  const r = VOID_R + 10 + (n % 4) * 8;
  const c = clampToTerrain(r * Math.cos(angle), r * Math.sin(angle));
  state.ghostPoints.push({ x: c.x, z: c.z, pollution_threshold: 0, text: '' });
  render();
  persistGhostPoints();
  // 추가 직후 편집 패널 자동 오픈 — 작가가 바로 텍스트 박게
  const newIdx = state.ghostPoints.length - 1;
  if (typeof state.onGhostClick === 'function') {
    try { state.onGhostClick(newIdx); } catch (err) { console.error('[StageView] onGhostClick error', err); }
  }
}

function removeGhostPoint(idx) {
  if (idx == null || idx < 0 || idx >= state.ghostPoints.length) return;
  state.ghostPoints.splice(idx, 1);
  render();
  persistGhostPoints();
}

function getGhostPointCount() {
  return state.ghostPoints.length;
}

// 잔상 유령 1개 현재 값 (편집 패널 렌더용) — 복사본 반환
function getGhostPoint(idx) {
  const gp = state.ghostPoints[idx];
  if (!gp) return null;
  return { idx: idx, x: gp.x, z: gp.z,
    pollution_threshold: gp.pollution_threshold, text: gp.text || '' };
}

// 잔상 유령 1개 필드 갱신 (text / pollution_threshold) + 즉시 저장
function updateGhostPoint(idx, patch) {
  const gp = state.ghostPoints[idx];
  if (!gp || !patch) return;
  if (patch.text != null) gp.text = String(patch.text);
  if (patch.pollution_threshold != null) {
    let t = Number(patch.pollution_threshold);
    if (!isFinite(t)) t = 0;
    gp.pollution_threshold = Math.max(0, Math.min(1, t));
  }
  render();
  persistGhostPoints();
}

// ─── 페르소나 STEP 하이라이트 (260730 B안 — 궤적 2D 탭 은퇴, 3D 핀 이식) ──
// 강조 상태는 state 에 저장되고 renderPins 가 매 렌더마다 적용 — setScenes/드래그/지형 로드 후에도 유지.
// 핀이 없는 sceneId 는 조용히 무시 (강조만 이 sceneId 로 이동 — 시각 변화 없음, 이전 강조는 해제).
function highlightPersonaScene(sceneId) {
  state.personaHighlight = sceneId != null ? sceneId : null;
  render();
}

function clearPersonaHighlight() {
  state.personaHighlight = null;
  render();
}

function setSceneClickHandler(fn) {
  state.onSceneClick = (typeof fn === 'function') ? fn : null;
}

function setGhostClickHandler(fn) {
  state.onGhostClick = (typeof fn === 'function') ? fn : null;
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

// 사물 앵커 점검·자동화용 (260730). 화면 좌표까지 주므로 드래그 e2e 에도 쓴다.
function _debugObjects() {
  const rect = state.canvas ? state.canvas.getBoundingClientRect() : null;
  return state.objectAnchors.map((a, i) => {
    let screen = null;
    const m = state.objectMarkers[i];
    if (m && state.camera && rect) {
      const v = m.group.position.clone();
      v.y += OBJ_BOX * 0.35;
      v.project(state.camera);
      screen = {
        x: Math.round(rect.left + (v.x + 1) / 2 * rect.width),
        y: Math.round(rect.top + (1 - v.y) / 2 * rect.height),
      };
    }
    return {
      i, word: a.word, sceneId: a.sceneId,
      order: a.scene && a.scene.scene_order,
      x: +a.x.toFixed(2), z: +a.z.toFixed(2), pinned: !!a.pinned, screen,
    };
  });
}

const api = {
  mount, setScenes, setSimState, setMemoryId, setSceneClickHandler, _debugTerrain, _debugObjects,
  addGhostPoint, removeGhostPoint, getGhostPointCount,
  setGhostClickHandler, getGhostPoint, updateGhostPoint,
  highlightPersonaScene, clearPersonaHighlight,
};

// ─── 글로벌 노출 ───────────────────────────────────────────
window.LumenAdminStageView = api;

export default api;

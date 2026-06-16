/**
 * 퀼트 시뮬레이터 — 지형 순차 생성 검증용 독립 페이지
 * ----------------------------------------------------------------------------
 * 문서: docs/통합빌드계획_전이+지형quilt_병렬세션-260614.md
 *
 * 목적: play-test.html / admin.js 를 한 글자도 안 건드리고, 퀼트 기하(quilt_geometry.js)가
 *       매 전이마다 장면 plate 의 거리·크기를 제대로 굴리는지 *육안*으로 본다.
 *
 * 구성:
 *   - 가짜 장면 5개 (감정만 다름) → tem_af_strata_terrain 의 per-scene plate 로 렌더.
 *   - 버튼이 전이 1번을 quilt_geometry 에 먹임(recordTransition).
 *   - quilt_geometry 의 getPairDistance / getSceneScale 을 읽어 plate.group 의 position/scale 에 적용.
 *     (tem_af_strata_terrain.js:834 "caller may override later" 자리 — 의도된 외부 배선.)
 *
 * 이 배선이 나중에 Q3(strataView 실제 배치) / W(play-test) 배선의 청사진이 된다.
 * 여기서 *유일하게* 시뮬레이터 고유인 것 = 거리→x축 체인 배치(검증 가독용). 실제는 VA 좌표 배치.
 */

import { QuiltGeometry } from './core/quilt_geometry.js';

const THREE = window.THREE;
const T = window.TemAfStrataTerrain;

// ─── 가짜 장면: dominant emotion 만 다르게 (색/모양/위치 자동 분화) ──────────
const SCENES = [
  { id: 's1', scene_order: 0, original_emotion: { joy: 0.85, hope: 0.15 } },
  { id: 's2', scene_order: 1, original_emotion: { fear: 0.8, isolation: 0.2 } },
  { id: 's3', scene_order: 2, original_emotion: { anger: 0.75, resentment: 0.25 } },
  { id: 's4', scene_order: 3, original_emotion: { sadness: 0.7, longing: 0.3 } },
  { id: 's5', scene_order: 4, original_emotion: { love: 0.7, gratitude: 0.3 } },
];
const MEM = { id: 'mock', title: '시험 기억' };
const ORDER = SCENES.map((s) => s.id);
const EMO_LABEL = { s1: '기쁨', s2: '두려움', s3: '분노', s4: '슬픔', s5: '사랑' };
const PAT_LABEL = {
  echo_follow: '따라감(가까워짐)', bridge: '이음(가까워짐)',
  contradiction: '거스름(가까워짐)', displacement: '옮김(가까워짐)',
  avoidance: '피함(멀어짐)', fixation: '붙박임(혼자 커짐)',
};
// quilt_geometry 의 seam 종류(★D / PATTERN_MAP) → 한국어 라벨.
const SEAM_LABEL = {
  ridge: '능선', valley: '골짜기', offset: '어긋남(미정)', break: '끊김', isolate: '고립',
};

// 퀼트 거리(0~6 단위)를 화면 월드 거리로 펼치는 배율. plate 로컬 폭(SZk=24)과 균형.
const WORLD_PER_UNIT = 26;

let rt = null;       // strata 런타임
let geo = null;      // 퀼트 기하 계산기
let plates = [];     // per-scene plate 배열 [{ sceneId, group, ... }]
let cur = 0;         // 현재 플레이어가 선 장면 인덱스
let lastPattern = null;
let seamGroup = null; // 사이 생김새(능선/골짜기/끊김/어긋남) 메쉬 묶음

// ─── 부팅 ────────────────────────────────────────────────────────────────
function boot() {
  const canvas = document.getElementById('c');
  if (!THREE || !THREE.OrbitControls) { alert('THREE 로드 실패'); return; }
  if (!T) { alert('TemAfStrataTerrain 로드 실패'); return; }

  rt = T.createStrataTerrain(THREE, canvas, {
    clearColor: 0x0a0a10, fogColor: 0x0a0a10, fogDensity: 0.0035,
  });
  rt.init();

  // 가짜 장면 → plate. plays 없음(빈 {}) → 오염/궤적 없는 깨끗한 원형 지형.
  const items = T.buildMemoryItems([MEM], {}, { mock: SCENES });
  rt.setP(items);
  rt.setPerScenePlates(true);
  rt.buildTerrain(null);
  plates = rt.getPlates() || [];

  const orderMap = {};
  ORDER.forEach((id, i) => { orderMap[id] = i; });
  geo = new QuiltGeometry({ sceneOrder: orderMap });

  applyQuilt();
  fitCamera();
  wireUI();
  loop();
  window.addEventListener('resize', () => rt.resize());
}

// ─── 퀼트 값 → plate 의 위치/크기 ─────────────────────────────────────────
function applyQuilt() {
  // 거리 → x축 체인 배치: 첫 장면 0, 다음은 인접 쌍 거리만큼 누적.
  const px = {};
  px[ORDER[0]] = 0;
  for (let i = 1; i < ORDER.length; i++) {
    const d = geo.getPairDistance(ORDER[i - 1], ORDER[i]);
    px[ORDER[i]] = px[ORDER[i - 1]] + d * WORLD_PER_UNIT;
  }
  // 가운데 정렬 (펼침의 중앙을 원점으로).
  const xs = ORDER.map((id) => px[id]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;

  plates.forEach((p) => {
    if (px[p.sceneId] == null) return;
    p.group.position.set(px[p.sceneId] - mid, 0, 0);
    const s = geo.getSceneScale(p.sceneId);
    p.group.scale.setScalar(s);
  });

  renderSeams();
  updateHUD();
}

// ─── 사이 생김새: 두 땅 사이에 능선/골짜기/끊김/어긋남 (★D / Q4) ────────────
// quilt_geometry.getSeam 이 내놓는 { seam, strength } 를 3D 띠로 번역.
// 이 시각화가 나중에 Q4(js/ui/quilt_seams.js) 의 시드가 된다.
function plateById(id) {
  for (let i = 0; i < plates.length; i++) if (plates[i].sceneId === id) return plates[i];
  return null;
}

function disposeObj3D(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

function renderSeams() {
  const scene = rt.getScene();
  if (!scene) return;
  if (seamGroup) { scene.remove(seamGroup); disposeObj3D(seamGroup); seamGroup = null; }
  seamGroup = new THREE.Group();

  // 체인 배치라 인접 쌍(i, i+1) 의 사이 공간 = 두 plate 중점.
  for (let i = 0; i < ORDER.length - 1; i++) {
    const s = geo.getSeam(ORDER[i], ORDER[i + 1]);
    if (!s) continue; // 안 거친 쌍 = 원형(생김새 없음)
    const pa = plateById(ORDER[i]);
    const pb = plateById(ORDER[i + 1]);
    if (!pa || !pb) continue;
    const mesh = buildSeamMesh(s);
    if (!mesh) continue; // 끊김(break) 등 = 안 그림
    mesh.position.x = (pa.group.position.x + pb.group.position.x) / 2;
    seamGroup.add(mesh);
  }
  scene.add(seamGroup);
}

function buildSeamMesh(s) {
  const k = Math.max(0, Math.min(1, s.strength)); // 0~1
  const depth = 22; // z 길이 (땅 깊이 방향)
  const g = new THREE.Group();

  if (s.seam === 'ridge') {
    // 따라감/이음 → 솟은 능선. 강도 = 높이.
    const h = 1.5 + k * 9;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(3, h, depth),
      new THREE.MeshStandardMaterial({ color: 0xb88a4a, roughness: 0.8, metalness: 0.05 })
    );
    m.position.y = h / 2 - 1;
    g.add(m);
  } else if (s.seam === 'valley') {
    // 거스름 → 파인 골 + 가운데 검은 틈. 강도 = 깊이.
    const d = 1.5 + k * 7;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(5, d, depth),
      new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 1 })
    );
    floor.position.y = -d / 2 - 1;
    g.add(floor);
    const gap = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, d + 2, depth),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    gap.position.y = -d / 2;
    g.add(gap);
  } else if (s.seam === 'offset') {
    // 옮김 → 어긋남. ※ 시각 어휘 미정(§8) — 임시: 반투명 띠를 z로 밀고 비틀어 "어긋남" 암시.
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.5 + k * 4, depth * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x6a6a90, roughness: 0.7, transparent: true, opacity: 0.55 })
    );
    m.position.set(0, 1, k * 8);
    m.rotation.y = k * 0.5;
    g.add(m);
  } else {
    return null; // break(끊김) / isolate(고립) = 사이 생김새 없음
  }
  return g;
}

// ─── 전이 1번 먹이기 ───────────────────────────────────────────────────────
function feed(pattern) {
  const align = parseFloat(document.getElementById('align').value) || 0;
  if (pattern === 'fixation') {
    // 제자리 붙박임 — 그 장면만 커지며 고립 (다음으로 안 이동).
    geo.recordTransition(ORDER[cur], ORDER[cur], 'fixation', align);
  } else {
    const next = (cur + 1) % ORDER.length;
    geo.recordTransition(ORDER[cur], ORDER[next], pattern, align);
    cur = next;
  }
  lastPattern = pattern;
  applyQuilt();
}

function reset() {
  geo.reset();
  cur = 0;
  lastPattern = null;
  applyQuilt();
}

// ─── HUD 숫자판 ────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('hud-now').textContent =
    `장면 ${cur + 1} (${EMO_LABEL[ORDER[cur]] || ''})`;
  document.getElementById('hud-last').textContent =
    lastPattern ? (PAT_LABEL[lastPattern] || lastPattern) : '—';

  // 인접 쌍 거리
  let dh = '';
  for (let i = 1; i < ORDER.length; i++) {
    const d = geo.getPairDistance(ORDER[i - 1], ORDER[i]);
    dh += `<div class="row"><span class="k">${i}↔${i + 1}</span><span class="v">${d.toFixed(2)}</span></div>`;
  }
  document.getElementById('hud-dist').innerHTML = dh;

  // 장면 크기
  let sh = '';
  ORDER.forEach((id, i) => {
    const s = geo.getSceneScale(id);
    sh += `<div class="row"><span class="k">장면 ${i + 1}</span><span class="v">${s.toFixed(2)}</span></div>`;
  });
  document.getElementById('hud-scale').innerHTML = sh;

  // 사이 생김새 (인접 쌍)
  let mh = '';
  for (let i = 1; i < ORDER.length; i++) {
    const sm = geo.getSeam(ORDER[i - 1], ORDER[i]);
    const txt = sm ? `${SEAM_LABEL[sm.seam] || sm.seam} ${sm.strength.toFixed(2)}` : '—';
    mh += `<div class="row"><span class="k">${i}↔${i + 1}</span><span class="v">${txt}</span></div>`;
  }
  document.getElementById('hud-seam').innerHTML = mh;
}

// ─── 카메라: 현재 펼침 폭에 맞춰 ──────────────────────────────────────────
function fitCamera() {
  const cam = rt.getCamera();
  const ctrl = rt.getControls();
  if (!cam || !ctrl) return;
  let minX = Infinity; let maxX = -Infinity;
  plates.forEach((p) => {
    minX = Math.min(minX, p.group.position.x);
    maxX = Math.max(maxX, p.group.position.x);
  });
  if (!isFinite(minX)) { minX = -40; maxX = 40; }
  const span = Math.max(60, (maxX - minX) + 50);
  cam.position.set(0, span * 0.45, span * 0.62);
  ctrl.target.set(0, -1, 0);
  ctrl.update();
}

// ─── UI 배선 ───────────────────────────────────────────────────────────────
function wireUI() {
  document.querySelectorAll('#ctrl button[data-pat]').forEach((b) => {
    b.addEventListener('click', () => feed(b.dataset.pat));
  });
  document.getElementById('reset').addEventListener('click', reset);
  document.getElementById('fit').addEventListener('click', fitCamera);
  const sld = document.getElementById('align');
  const val = document.getElementById('align-val');
  sld.addEventListener('input', () => { val.textContent = parseFloat(sld.value).toFixed(2); });
}

// ─── 렌더 루프 ─────────────────────────────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);
  if (rt) rt.tick();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

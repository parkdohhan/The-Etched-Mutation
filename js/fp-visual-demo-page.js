/**
 * 1인칭 비주얼 천장 데모 — 웹(Three.js)에서 어디까지 예뻐지나
 * ----------------------------------------------------------------------------
 * 목적: play-test.html(모놀리스) 을 안 건드리고, 1인칭 세계에 "빠진 기본기"를 얹어
 *       지금 검은 화면이 웹에서 어디까지 가는지 before/after 로 본다.
 *       그 천장을 보고 "웹으로 충분 vs 언리얼 분기"를 근거 갖고 판단한다.
 *
 * 1인칭 걷기는 tem_af_strata_terrain.js 의 enterFirstPerson() 을 그대로 재사용.
 * (tick 이 _fpActive 면 _fpTick 자동 호출 — WASD/마우스/높이추적/점프 내장.)
 *
 * 기본기 단계 (이 파일은 1단계까지 — 에셋 0, 즉시 점프):
 *   ① 색감 보정(ACESFilmic 톤매핑 + 노출) + 환경 조명 보강(Hemisphere/Directional) + 안개 깊이
 *   ② 절차적 하늘 + 환경광(IBL)        ← 다음
 *   ③ 빛 번짐(bloom) 후처리             ← 다음 (composer + onRender 훅)
 */

const THREE = window.THREE;
const T = window.TemAfStrataTerrain;

// 가짜 기억 5장면 — 감정만 다름 (색/모양/위치 자동 분화). quilt-sim 과 동일.
const SCENES = [
  { id: 's1', scene_order: 0, original_emotion: { joy: 0.85, hope: 0.15 } },
  { id: 's2', scene_order: 1, original_emotion: { fear: 0.8, isolation: 0.2 } },
  { id: 's3', scene_order: 2, original_emotion: { anger: 0.75, resentment: 0.25 } },
  { id: 's4', scene_order: 3, original_emotion: { sadness: 0.7, longing: 0.3 } },
  { id: 's5', scene_order: 4, original_emotion: { love: 0.7, gratitude: 0.3 } },
];
const MEM = { id: 'mock', title: '시험 기억' };

const DARK_FOG = 0x0a0a10; // 기본기 OFF — 지금 play-test 와 같은 어두운 톤
const WARM_FOG = 0x161622; // 기본기 ON  — 약간 들어올린 대기색(깊이감)

let rt = null;
let basicsOn = false;
let extraLights = [];

function boot() {
  const canvas = document.getElementById('c');
  if (!THREE || !THREE.OrbitControls) { alert('THREE 로드 실패'); return; }
  if (!T) { alert('TemAfStrataTerrain 로드 실패'); return; }

  rt = T.createStrataTerrain(THREE, canvas, {
    clearColor: DARK_FOG, fogColor: DARK_FOG, fogDensity: 0.0035,
  });
  rt.init();

  const items = T.buildMemoryItems([MEM], {}, { mock: SCENES });
  rt.setP(items);
  rt.setPerScenePlates(true);
  rt.buildTerrain(null);

  prepareExtraLights();
  wireUI();
  loop();
  window.addEventListener('resize', () => rt.resize());
  updateState();
}

// 기본기 ON 일 때만 scene 에 추가될 보강 조명 (달빛 + 하늘반사 + 채움).
function prepareExtraLights() {
  const hemi = new THREE.HemisphereLight(0x8090c0, 0x201810, 0.55); // 하늘→땅 부드러운 환경광
  const moon = new THREE.DirectionalLight(0xc8d4ff, 0.5);           // 차가운 달빛 키라이트
  moon.position.set(-40, 55, -25);
  const fill = new THREE.DirectionalLight(0xffc890, 0.22);          // 따뜻한 채움 (반대편)
  fill.position.set(35, 30, 40);
  extraLights = [hemi, moon, fill];
}

// ─── 기본기 ① ON/OFF — 색감 보정 + 환경 조명 + 안개 깊이 ──────────────────
function applyBasics(on) {
  const r = rt.getRenderer();
  const sc = rt.getScene();
  if (on) {
    r.toneMapping = THREE.ACESFilmicToneMapping; // 영화식 색감 곡선 (날것 → 보정)
    r.toneMappingExposure = 1.15;
    r.outputEncoding = THREE.sRGBEncoding;        // 올바른 색 공간
    extraLights.forEach((l) => sc.add(l));
    if (sc.fog) { sc.fog.color.setHex(WARM_FOG); sc.fog.density = 0.0055; }
    if (sc.background) sc.background.setHex(WARM_FOG);
  } else {
    r.toneMapping = THREE.NoToneMapping;
    r.toneMappingExposure = 1;
    r.outputEncoding = THREE.LinearEncoding;
    extraLights.forEach((l) => sc.remove(l));
    if (sc.fog) { sc.fog.color.setHex(DARK_FOG); sc.fog.density = 0.0035; }
    if (sc.background) sc.background.setHex(DARK_FOG);
  }
  // outputEncoding 이 바뀌면 재질 셰이더 재컴파일 필요.
  sc.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  basicsOn = on;
  updateState();
}

// ─── UI ────────────────────────────────────────────────────────────────────
function wireUI() {
  document.getElementById('toggle').addEventListener('click', () => {
    applyBasics(!basicsOn);
    document.getElementById('toggle').textContent = basicsOn ? '기본기 OFF' : '기본기 ON';
  });
  document.getElementById('enter').addEventListener('click', () => { rt.enterFirstPerson(); updateState(); });
  document.getElementById('exit').addEventListener('click', () => { rt.exitFirstPerson(); updateState(); });
}

function updateState() {
  const b = document.getElementById('st-basics');
  b.textContent = basicsOn ? 'ON' : 'OFF';
  b.className = basicsOn ? 'on' : 'off';
  document.getElementById('st-view').textContent = rt && rt.isFirstPerson() ? '1인칭' : '부감';
}

function loop() {
  requestAnimationFrame(loop);
  if (rt) rt.tick();
  // 1인칭 진입/이탈은 tick 안에서 처리되지만, 상태 라벨은 가끔 갱신.
  if (rt) {
    const v = rt.isFirstPerson() ? '1인칭' : '부감';
    const el = document.getElementById('st-view');
    if (el && el.textContent !== v) el.textContent = v;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

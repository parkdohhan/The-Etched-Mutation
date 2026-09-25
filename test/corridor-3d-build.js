/**
 * 통로 3D (T1′) — 재료 세트·공간·문·통로 몸통 빌더 (실험 전용, 본 코드 미반영) (2026-09-25)
 *
 * 목적: test/corridor-3d-test.html 이 쓰는 순수 빌더. 전역 THREE(r128) 를 받아 Mesh/Group 을 만든다.
 *       난수 없음 — 모든 배치·노이즈·눈 입자는 해시(결정론). 같은 입력 = 같은 통로.
 * 선례: test/glb-room-test.html buildSyntheticRoomGlb(바닥·벽·사물·점광·캔버스 텍스처, 방 6×2.8×6, 감쇠 2),
 *       test/corridor-t1-rules.js(중심선은 저쪽이 정한다 — 이 파일은 그 선을 따라 단면을 민다),
 *       test/life-t2-test.html(지형 위에 홀로 선 창문 — 벽 없이 문틀만 세우는 발상의 출처),
 *       docs/통로_T1_실험-260923.md §5 #8 ("골+안개 벽"으로 읽힘 → 천장까지 닫힌 관 + 실물 크기 참조물).
 * 본 코드(js/**, play-test.html) 미반영. 소비자: test/corridor-3d-test.html 만.
 *
 * ─── 260925 오후 재설계 — 기억별 공간(열림/닫힘/무), 통로가 닫힘 정도를 섞음 ───────────────────────
 *   사용자 정정(9-25 오후): "굳이 방과 방일 필요가 있나? 첫눈의 마당이면 그냥 개방된 공간으로 해도 되잖아.
 *   왜 이 시스템 자체가 정해진 분위기가 있어야 돼? 기억에 따라서 다른 게 있으면 되잖아."
 *   → 오전판은 다섯 기억을 전부 6×2.8×6 닫힌 방에 넣고 통로를 어두운 닫힌 관 하나(Among the Sleep 결)로 통일했다.
 *     이건 TEM 원칙 "기억 하나 = 고유 좌표계"를 공간에 적용하지 않은 것. 이제:
 *   · 재료 세트마다 space 를 붙인다 — enclosure(closed 닫힌 방 / open 하늘 있는 열린 땅 / void 경계 없는 어둠) ·
 *     치수(W·H·D, 열린/무 공간은 바닥 원판 반지름 groundR) · 하늘색 bg · 안개 기본 밀도 fogBase · ambient · 태양광 sun ·
 *     관객 국소광 배율 localLight · 입자 밀도 particles · 작은 문 여부 smallDoors. 열림·닫힘·날씨는 프리셋(기억)이 직접 정한다 —
 *     감정 → 분위기 자동 변환은 없다(라벨 단독 함정). 감정 델타·오염은 종전대로 결(벽 거칠기·빛 흔들림·걸음)에만.
 *   · 공간 빌더는 종류별로 갈린다: closed = 방(치수는 프리셋 값, 창·전구·형광등 중 하나가 빛) / open = 하늘·바닥 원판·눈 입자·홀로 선 문
 *     / void = 작은 바닥 원판·전등 하나·홀로 선 문. 문은 벽이 없어도 문틀+문짝으로 서서 문턱 역할을 한다.
 *   · 통로 몸통은 링마다 e(t) = lerp(e_A, e_B, t) (closed 1 · open 0 · void 0) 를 받아 벽 높이 = H·e(t).
 *     e(t) < 0.08 인 링 사이에는 벽·천장 면을 만들지 않는다(바닥만). 천장은 e 0.75 → 1 에서 양쪽 벽 꼭대기의 선반이
 *     가운데로 뻗어 닫힌다(그 사이는 하늘 틈). 즉 마당 → 복도는 걸을수록 벽이 솟고 하늘 틈이 좁아지며, 복도 → 마당은 반대.
 *   · Among the Sleep 결(작은 문·손잡이가 눈보다 위·낮은 천장)은 "들킨 거짓말" 프리셋 안으로 옮겼다. 다른 프리셋엔 작은 문 없음.
 *
 * 재료 세트(프리셋 5, corridor-t1-rules SCENES 의 id 와 같은 키):
 *   palette {wall, floor, trim}  · symbol(상징 사물, 단순 기하)  · light {color, intensity}
 *   · sound(합성 소리 종류)  · step(발소리 바닥재)  · space(공간 — 위 절)  · audio {drone, hum, thump} (기억별 도착·뒤쪽 소리 양, 260925 저녁)
 *
 * ─── 260925 저녁 — 검토 반영 ────────────────────────────────────────────────────────────────
 *   · audio 필드(위) — 오전판은 도착 저음·허밍·9 초 둔탁음이 다섯 기억 공통이었다(오후 재설계가 공간에는 "기억별"을 적용하고 소리엔 안 옮긴 불일치).
 *   · 공간 그룹 userData.symbol — 사건 소리(전화벨·삐)가 그 사물 자리에서 나게 페이지가 세계 좌표를 읽는다.
 *   · buildSnowTrace(amount) — 지나온 기억이 도착 공간에 남기는 첫 흔적(눈 한 줌 + 녹은 자국). 여정·감쇠 규칙은 페이지가 갖는다.
 */

// 260925 검토 반영: 벽·바닥 명도 +30 % (선형 출력에서 0.10 이 화면 26/255 로 눌려 바닥이 안 보였다).
//                  trim 은 원색 그대로 두고, 문틀·작은 문·상징 사물 쪽에서 ×0.55 로 낮춘다(흰 트림이 전구보다 밝던 결함).
// 260925 오후: 첫눈의 마당 바닥은 밟힌 눈(0xb8babe) — 눈밭 원판(0xc4c6ca)보다 살짝 어두워 "길"로 읽히게.
const MAT = {
  // audio (260925 저녁, 검토 반영): 도착 저음(drone)·허밍(hum)·뒤쪽 저음(thump)은 기억마다 얼마나 쓸지 정한다 — 오전판은 다섯 기억 전부에
  //   같은 값(0.22 / 0.16 / 0.3)이 깔려 열린 눈밭에도 음산한 결이 들어갔다. 눈밭·빈 방은 0, 병실은 형광등 허밍만, 거짓말은 Among the Sleep 결 그대로.
  window: { name: '빈 방의 창',      palette: { wall: 0x4d5568, floor: 0x313745, trim: 0x8b95a8 }, light: { color: 0x8fa3c4, intensity: 0.95 }, sound: 'rain', step: 'wood',   symbol: 'window', audio: { drone: 0.08, hum: 0,    thump: 0 } },
  lie:    { name: '들킨 거짓말',     palette: { wall: 0x603d40, floor: 0x382a2a, trim: 0x8a5a4a }, light: { color: 0xc27a56, intensity: 0.75 }, sound: 'hum',  step: 'wood',   symbol: 'chair',  audio: { drone: 0.22, hum: 0.16, thump: 0.3 } },
  snow:   { name: '첫눈의 마당',     palette: { wall: 0x9f9fa6, floor: 0xb8babe, trim: 0xd8dce4 }, light: { color: 0xe4ecf6, intensity: 1.05 }, sound: 'wind', step: 'snow',   symbol: 'tree',   audio: { drone: 0,    hum: 0,    thump: 0 } },
  ward:   { name: '병실 복도',       palette: { wall: 0x647c72, floor: 0x4b5753, trim: 0xb9c8c0 }, light: { color: 0xd8e6ea, intensity: 0.85 }, sound: 'beep', step: 'tile',   symbol: 'iv',     audio: { drone: 0.05, hum: 0.18, thump: 0 } },
  call:   { name: '다시 걸려온 전화', palette: { wall: 0x755c46, floor: 0x46392f, trim: 0xc9a06a }, light: { color: 0xe6b874, intensity: 0.90 }, sound: 'ring', step: 'carpet', symbol: 'phone',  audio: { drone: 0.16, hum: 0,    thump: 0.18 } },
};

// ─── 공간 (기억마다 다르다 — 260925 오후) ─────────────────────────────────
// enclosure: closed 닫힌 방(e=1) · open 하늘 있는 열린 땅(e=0) · void 경계 없는 어둠(e=0)
// W/H/D: 닫힌 방 치수. open/void 는 W·D 를 "문이 서는 자리"(중심에서 D/2 앞)와 fixation 옆문 자리(±W/2)로만 쓴다. H 는 없음(통로 높이를 안 누른다).
// bg: 하늘색(= scene.background = 안개색). fogBase: 안개 기본 밀도(페이지가 정렬도 배율을 곱한다). ambient/sun/localLight: 빛.
// startBack: 시작 자리가 문에서 얼마나 떨어지나(기본 2.2 m — 무 공간은 2.8, 탁자·전등이 문과 함께 시야에 들게).
// particles: 입자 밀도 0..1(눈). smallDoors: Among the Sleep 결의 작은 문(방 벽 + 통로 이쪽 절반).
const SPACE = {
  window: { enclosure: 'closed', W: 6,   H: 2.8, D: 6,   door: { w: 0.9, h: 2.1 },  lightFrom: 'window',      bg: 0x0b0b12, fogBase: 0.05, ambient: { color: 0x2a2838, intensity: 1.2 }, sun: 0,    localLight: 1,    particles: 0, smallDoors: false, note: '닫힌 방 6×2.8×6 · 창에서만 빛 · 하늘 없음' },
  lie:    { enclosure: 'closed', W: 3.5, H: 1.9, D: 4.5, door: { w: 0.8, h: 1.75 }, lightFrom: 'bulb',        bg: 0x0b0b12, fogBase: 0.05, ambient: { color: 0x2a2838, intensity: 1.2 }, sun: 0,    localLight: 1,    particles: 0, smallDoors: true,  note: '낮고 좁은 방 3.5×1.9×4.5 · 작은 문 · 손잡이가 눈보다 위' },
  snow:   { enclosure: 'open',   W: 6,   H: null, D: 6,  door: { w: 0.9, h: 2.1 },  groundR: 30, ground: 0xc4c6ca, bg: 0xc9ced6, fogBase: 0.06, ambient: { color: 0xb9c2cf, intensity: 1.0 }, sun: 0.45, localLight: 0.15, particles: 1, smallDoors: false, note: '열린 눈밭(반경 30) · 회백 하늘 · 눈 · 홀로 선 문' },
  ward:   { enclosure: 'closed', W: 2.4, H: 2.6, D: 12,  door: { w: 0.9, h: 2.1 },  lightFrom: 'fluorescent', wallDoors: true, bg: 0x0b0b12, fogBase: 0.05, ambient: { color: 0x2a2838, intensity: 1.2 }, sun: 0, localLight: 1, particles: 0, smallDoors: false, note: '긴 복도 2.4×2.6×12 · 형광등 · 열리지 않는 문들' },
  call:   { enclosure: 'void',   W: 6,   H: null, D: 6,  door: { w: 0.9, h: 2.1 },  groundR: 3,  ground: 0x2a2420, bg: 0x000000, fogBase: 0.14, ambient: { color: 0x0a0a10, intensity: 0.8 }, sun: 0, localLight: 0.5, particles: 0, smallDoors: false, startBack: 2.8, note: '경계 없는 어둠 · 바닥 원판 3 m · 탁자와 전등 하나' },
};
for (const k in MAT) MAT[k].space = Object.freeze(SPACE[k]);
export const ENCLOSURE_E = Object.freeze({ closed: 1, open: 0, void: 0 });
export const ENCLOSURE_KO = Object.freeze({ closed: '닫힘', open: '열림', void: '무' });
export const TRIM_K = 0.55;   // 문틀·작은 문·상징 사물의 trim 알베도 배율 (260925 검토: 흰 트림 255/255/255 클리핑)
function dim(THREE, hex, k) { return new THREE.Color(hex).multiplyScalar(k).getHex(); }
export const MATERIAL_SETS = Object.freeze(MAT);

// 옛 잠금값 — 오전판 호환용. 이제 치수는 프리셋 space 가 정한다(빈 방의 창이 이 값과 같다).
export const ROOM = Object.freeze({ W: 6, H: 2.8, D: 6, doorW: 0.9, doorH: 2.1 });

// ─── 결정론 해시·노이즈 ───────────────────────────────────────────
export function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm2(x, y) { let v = 0, a = 0.5; for (let i = 0; i < 4; i++) { v += a * noise2(x, y); x *= 2.1; y *= 2.1; a *= 0.5; } return v; }
export function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/** 벽 결 텍스처 — 진폭 amp(0..1) 가 발산 d 로 커진다. 회색 노이즈(곱 텍스처). */
export function makeGrainTexture(THREE, amp, seed) {
  const N = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const cx = cv.getContext('2d');
  const img = cx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = fbm2(x * 0.045 + seed, y * 0.045 + seed * 0.7) - 0.5;      // −0.5..0.5
    const v = Math.round(255 * Math.max(0, Math.min(1, 0.72 + n * amp * 1.6)));
    const i = (y * N + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function col(THREE, hex) { return new THREE.Color(hex); }
export function lerpHex(THREE, a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))); }

// ─── 상징 사물 (실물 크기, 단순 기하) ─────────────────────────────
function std(THREE, color, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0.05 }, extra || {})); }
function box(THREE, w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function cyl(THREE, rt, rb, h, mat, x, y, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 14), mat); m.position.set(x, y, z); return m; }
function dark(THREE) { return std(THREE, 0x1d1a20); }

/** 상징 사물 — 바닥 y=0, 원점 중심, 정면 = +z */
export function buildSymbol(THREE, key) {
  const g = new THREE.Group(); g.name = 'symbol_' + key;
  const p = MAT[key].palette;
  const trim = std(THREE, dim(THREE, p.trim, TRIM_K)), darkM = dark(THREE);
  switch (MAT[key].symbol) {
    case 'window': {   // 창틀 하나 (1.0 × 1.2) — 벽에 기대 선 창
      const fw = 1.0, fh = 1.2, y0 = 0.9;
      g.add(box(THREE, fw + 0.1, 0.06, 0.08, trim, 0, y0, 0), box(THREE, fw + 0.1, 0.06, 0.08, trim, 0, y0 + fh, 0));
      g.add(box(THREE, 0.06, fh, 0.08, trim, -fw / 2, y0 + fh / 2, 0), box(THREE, 0.06, fh, 0.08, trim, fw / 2, y0 + fh / 2, 0), box(THREE, 0.04, fh, 0.05, trim, 0, y0 + fh / 2, 0));
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshStandardMaterial({ color: 0x9fb0c8, emissive: 0x161d29, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.2 }));   // emissive 절반 (260925)
      pane.position.set(0, y0 + fh / 2, 0); g.add(pane);
      g.add(box(THREE, 0.08, y0, 0.08, darkM, -fw / 2 + 0.05, y0 / 2, 0), box(THREE, 0.08, y0, 0.08, darkM, fw / 2 - 0.05, y0 / 2, 0));   // 받침
      break;
    }
    case 'chair': {    // 넘어진 의자
      const c = new THREE.Group();
      const wood = std(THREE, 0x5a3f36);
      c.add(box(THREE, 0.42, 0.04, 0.42, wood, 0, 0.45, 0));
      for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) c.add(box(THREE, 0.035, 0.45, 0.035, wood, x, 0.225, z));
      c.add(box(THREE, 0.42, 0.45, 0.035, wood, 0, 0.69, -0.2));
      c.rotation.z = Math.PI / 2; c.position.set(0, 0.21, 0);   // 옆으로 넘어짐 (좌석 폭 0.42 → 바닥에 눕는다)
      g.add(c);
      break;
    }
    case 'tree': {     // 잎 없는 나무 + 눈 무더기
      const bark = std(THREE, 0x3a3230);
      g.add(cyl(THREE, 0.05, 0.08, 1.9, bark, 0, 0.95, 0));
      const b1 = cyl(THREE, 0.02, 0.035, 0.9, bark, 0.28, 1.55, 0); b1.rotation.z = -0.75; g.add(b1);
      const b2 = cyl(THREE, 0.02, 0.035, 0.8, bark, -0.24, 1.35, 0.1); b2.rotation.z = 0.8; b2.rotation.x = 0.3; g.add(b2);
      const b3 = cyl(THREE, 0.015, 0.03, 0.6, bark, 0.05, 1.85, -0.2); b3.rotation.x = -0.9; g.add(b3);
      const snow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 10), std(THREE, 0xb0b4bc, { roughness: 1 }));
      snow.scale.set(1, 0.28, 1); snow.position.y = 0.02; g.add(snow);
      break;
    }
    case 'iv': {       // 링거 걸이
      const steel = std(THREE, 0xb9c0c4, { metalness: 0.6, roughness: 0.35 });
      g.add(cyl(THREE, 0.015, 0.015, 1.75, steel, 0, 0.875, 0));
      const base = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 8, 24), steel); base.rotation.x = Math.PI / 2; base.position.y = 0.02; g.add(base);
      g.add(box(THREE, 0.3, 0.015, 0.015, steel, 0, 1.75, 0));
      g.add(box(THREE, 0.12, 0.2, 0.05, new THREE.MeshStandardMaterial({ color: 0xdfe8ea, transparent: true, opacity: 0.7, roughness: 0.3 }), 0.13, 1.63, 0));
      g.add(cyl(THREE, 0.003, 0.003, 1.2, std(THREE, 0xe8ecee), 0.13, 0.95, 0));
      break;
    }
    case 'phone': {    // 복도 탁자(0.74 m — 실물 높이, 260925 오후: 0.48 은 눈높이 1.6 에서 2 m 안이면 화면 아래로 빠졌다) 위 전화기
      const wood = std(THREE, 0x4a3a2c), TH = 0.74;
      g.add(box(THREE, 0.38, TH, 0.38, wood, 0, TH / 2, 0));
      g.add(box(THREE, 0.22, 0.08, 0.16, darkM, 0, TH + 0.04, 0));
      g.add(box(THREE, 0.24, 0.035, 0.05, darkM, 0, TH + 0.12, -0.02));
      g.add(cyl(THREE, 0.03, 0.035, 0.05, darkM, -0.1, TH + 0.105, -0.02), cyl(THREE, 0.03, 0.035, 0.05, darkM, 0.1, TH + 0.105, -0.02));
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), std(THREE, p.trim)); dial.rotation.x = -Math.PI / 2 + 0.35; dial.position.set(0, TH + 0.085, 0.05); g.add(dial);
      break;
    }
  }
  return g;
}

// ─── 문 (틀 + 경첩 + 문짝 + 손잡이) — 로컬: 문 중심 x=0, 바닥 y=0, 벽면 z=0, 여는 쪽 = +z ───
export function buildDoor(THREE, trimHex, opts) {
  const w = (opts && opts.w) || ROOM.doorW, h = (opts && opts.h) || ROOM.doorH;
  const g = new THREE.Group(); g.name = 'door';
  // 문틀 ×0.55 (260925: 트림 원색은 반사율 0.85 로 전구보다 밝아 문 앞 1 m 에서 순백으로 잘렸다). 문짝은 ×0.72 유지 — 통로에서 뒤돌아봤을 때 국소광에 잡혀야 한다.
  const frameMat = std(THREE, dim(THREE, trimHex, TRIM_K), { roughness: 0.7 });
  const leafMat = std(THREE, new THREE.Color(trimHex).multiplyScalar(0.72).getHex(), { roughness: 0.8 });
  const fd = 0.16, ft = 0.07;
  g.add(box(THREE, ft, h + ft, fd, frameMat, -w / 2 - ft / 2, (h + ft) / 2, 0), box(THREE, ft, h + ft, fd, frameMat, w / 2 + ft / 2, (h + ft) / 2, 0));
  g.add(box(THREE, w + ft * 2, ft, fd, frameMat, 0, h + ft / 2, 0));
  const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, 0); g.add(hinge);
  const leaf = box(THREE, w - 0.02, h - 0.02, 0.045, leafMat, w / 2, h / 2, 0.03);
  hinge.add(leaf);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), std(THREE, 0xc9b27a, { metalness: 0.7, roughness: 0.3 }));
  knob.position.set(w - 0.09, 1.0, 0.075); hinge.add(knob);
  const knob2 = knob.clone(); knob2.position.z = -0.02; hinge.add(knob2);
  g.userData = { hinge, leaf, w, h, open: 0, target: 0 };
  return g;
}
/** 열림 0..1 → 경첩 각(최대 100°, +z 쪽으로) */
export function setDoorOpen(door, open) {
  door.userData.open = open;
  door.userData.hinge.rotation.y = -open * (100 * Math.PI / 180);
}

/** 벽 없이 홀로 선 문 (열린 땅·어둠용) — 문 + 발밑 문지방 판. 로컬 좌표계는 buildDoor 와 같다(+z = 바깥/통로 쪽). */
export function buildStandaloneDoor(THREE, trimHex, doorOpts) {
  const g = buildDoor(THREE, trimHex, doorOpts); g.name = 'door_standalone';
  const w = g.userData.w;
  const sill = box(THREE, w + 0.6, 0.06, 0.5, std(THREE, dim(THREE, trimHex, 0.45), { roughness: 0.9 }), 0, 0.03, 0); sill.name = 'sill'; g.add(sill);
  return g;
}

/** 벽에 붙는 "열리지 않는 작은 문" (0.6 × 1.4) — 로컬: 벽면 z=0, 방 쪽 −z 로 살짝 파임 */
export function buildSmallDoor(THREE, trimHex) {
  const g = new THREE.Group(); g.name = 'small_door';
  const frameMat = std(THREE, dim(THREE, trimHex, TRIM_K), { roughness: 0.75 });
  const leafMat = std(THREE, new THREE.Color(trimHex).multiplyScalar(0.45).getHex(), { roughness: 0.9 });
  const w = 0.6, h = 1.4, ft = 0.05;
  g.add(box(THREE, ft, h + ft, 0.06, frameMat, -w / 2 - ft / 2, (h + ft) / 2, 0.01), box(THREE, ft, h + ft, 0.06, frameMat, w / 2 + ft / 2, (h + ft) / 2, 0.01));
  g.add(box(THREE, w + ft * 2, ft, 0.06, frameMat, 0, h + ft / 2, 0.01));
  g.add(box(THREE, w, h, 0.03, leafMat, 0, h / 2, -0.02));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), std(THREE, 0xc9b27a, { metalness: 0.7, roughness: 0.3 }));
  knob.position.set(w / 2 - 0.08, 0.9, 0.02); g.add(knob);
  return g;
}

// ─── 공간 — 종류별 분기 (260925 오후) ───────────────────────────────
/**
 * @param opts { sideDoor: { wall: 'left'|'right', z: number } }  옆벽에 둘째 문 (fixation 고리의 끝 문 — 문 둘 = 같은 공간)
 * 반환 그룹의 userData = { key, kind, door, doors, light(그룹), set, space, dims:{W,H,D}, footprint:{hx,hz} }
 *   로컬: 중심 x/z=0, 바닥 y=0, 문 = +z 쪽(z = D/2) 가운데, 문 바깥 = +z. 문 그룹의 로컬 +z 는 언제나 공간 바깥.
 */
export function buildSpace(THREE, key, grainTex, opts) {
  const sp = MAT[key].space;
  if (sp.enclosure === 'closed') return buildClosedRoom(THREE, key, grainTex, opts);
  if (sp.enclosure === 'open') return buildOpenSpace(THREE, key, opts);
  return buildVoidSpace(THREE, key, opts);
}
/** 오전판 호환 별칭 */
export const buildRoom = buildSpace;

// 닫힌 방 (치수 = 프리셋) — 로컬: 중심 x/z=0, 바닥 y=0, 문 = +z 벽(z=D/2) 가운데
function buildClosedRoom(THREE, key, grainTex, opts) {
  const set = MAT[key], p = set.palette, sp = set.space;
  const { W, H, D } = sp, doorW = sp.door.w, doorH = sp.door.h;
  const g = new THREE.Group(); g.name = 'room_' + key;
  const wallMat = std(THREE, p.wall, { side: THREE.DoubleSide, map: grainTex || null });
  const floorMat = std(THREE, p.floor, { side: THREE.DoubleSide, roughness: 0.95 });
  const ceilMat = std(THREE, new THREE.Color(p.wall).multiplyScalar(0.8).getHex(), { side: THREE.DoubleSide });
  const mk = (geo, mat, x, y, z, ry, rx) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; if (rx) m.rotation.x = rx; g.add(m); return m; };
  // 벽 한 장 = (너비 ww) 사각형, 문 구멍(가운데 hx 자리)을 낼 수 있다 (shape x → 벽 가로, shape y → 세계 y)
  const wallShape = (ww, hx) => {
    const sh = new THREE.Shape();
    sh.moveTo(-ww / 2, 0); sh.lineTo(ww / 2, 0); sh.lineTo(ww / 2, H); sh.lineTo(-ww / 2, H); sh.closePath();
    if (hx != null) {
      const hole = new THREE.Path();
      hole.moveTo(hx - doorW / 2, 0); hole.lineTo(hx + doorW / 2, 0); hole.lineTo(hx + doorW / 2, doorH); hole.lineTo(hx - doorW / 2, doorH); hole.closePath();
      sh.holes.push(hole);
    }
    return new THREE.ShapeGeometry(sh);
  };
  const sd = opts && opts.sideDoor;
  mk(new THREE.PlaneGeometry(W, D), floorMat, 0, 0, 0, 0, -Math.PI / 2).name = 'floor';
  mk(new THREE.PlaneGeometry(W, D), ceilMat, 0, H, 0, 0, Math.PI / 2).name = 'ceil';
  mk(wallShape(W, null), wallMat, 0, 0, -D / 2, 0).name = 'wall_back';
  // 왼벽: rotation.y = +π/2 → shape +x 가 로컬 −z 로 간다. 오른벽: −π/2 → shape +x 가 로컬 +z.
  mk(wallShape(D, sd && sd.wall === 'left' ? -sd.z : null), wallMat, -W / 2, 0, 0, Math.PI / 2).name = 'wall_left';
  mk(wallShape(D, sd && sd.wall === 'right' ? sd.z : null), wallMat, W / 2, 0, 0, -Math.PI / 2).name = 'wall_right';
  mk(wallShape(W, 0), wallMat, 0, 0, D / 2, 0).name = 'wall_front';
  // 굽도리 (실물 크기 참조물 — 벽이 "높다"로 읽히게)
  const skirt = std(THREE, dim(THREE, p.trim, 0.6), { roughness: 0.8 });
  mk(new THREE.BoxGeometry(W, 0.1, 0.03), skirt, 0, 0.05, -D / 2 + 0.015, 0);
  mk(new THREE.BoxGeometry(0.03, 0.1, D), skirt, -W / 2 + 0.015, 0.05, 0, 0);
  mk(new THREE.BoxGeometry(0.03, 0.1, D), skirt, W / 2 - 0.015, 0.05, 0, 0);
  // 상징 사물 — 창은 뒷벽 가운데(빛이 거기서 온다), 나머지는 뒷벽 왼쪽 앞
  const sym = buildSymbol(THREE, key);
  if (sp.lightFrom === 'window') { sym.position.set(0, 0, -D / 2 + 0.12); }
  else { sym.position.set(-W / 2 + 0.9, 0, -D / 2 + 1.3); sym.rotation.y = 0.35; }
  g.add(sym);
  // 의자 하나 더 (참조물) — 오른쪽 벽가
  const seat = new THREE.Group(); const wood = std(THREE, new THREE.Color(p.trim).multiplyScalar(0.6).getHex());
  seat.add(box(THREE, 0.42, 0.04, 0.42, wood, 0, 0.45, 0), box(THREE, 0.42, 0.45, 0.035, wood, 0, 0.69, -0.2));
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) seat.add(box(THREE, 0.035, 0.45, 0.035, wood, x, 0.225, z));
  seat.position.set(W / 2 - 0.8, 0, 0.6); seat.rotation.y = -0.9; g.add(seat);
  // 방 조명 — 260925 검토: 1.6×/9 m 는 어두운 관 끝에 "사무실처럼 고른" 방을 냈다 → 0.7×/5 m. 도착 뒤에도 관객 국소광이 주광.
  // 260925 오후: 빛의 출처를 프리셋이 정한다 — 창(뒷벽의 창에서만 차가운 빛) / 전구(가운데 하나) / 형광등(3 m 마다 띠)
  const lights = new THREE.Group(); lights.name = 'room_lights'; g.add(lights);
  if (sp.lightFrom === 'window') {
    const light = new THREE.PointLight(set.light.color, 0.7 * set.light.intensity, 5, 2); light.position.set(0, 1.5, -D / 2 + 0.45); lights.add(light);
  } else if (sp.lightFrom === 'fluorescent') {
    const tubeMat = new THREE.MeshBasicMaterial({ color: set.light.color });
    for (let z = -D / 2 + 1.5; z < D / 2 - 0.5; z += 3) {
      const light = new THREE.PointLight(set.light.color, 0.7 * set.light.intensity, 4, 2); light.position.set(0, H - 0.2, z); lights.add(light);
      const strip = box(THREE, 0.12, 0.04, 1.2, tubeMat, 0, H - 0.03, z); g.add(strip);
    }
  } else {
    const light = new THREE.PointLight(set.light.color, 0.7 * set.light.intensity, 5, 2); light.position.set(0, H - 0.35, 0); lights.add(light);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: set.light.color })); bulb.position.copy(light.position); g.add(bulb);
    g.add(cyl(THREE, 0.006, 0.006, 0.3, dark(THREE), 0, H - 0.17, 0));
  }
  // 작은 문 (Among the Sleep 결 — 들킨 거짓말만): 양 옆벽에 하나씩, 열리지 않는다
  if (sp.smallDoors) {
    const L = buildSmallDoor(THREE, p.trim); L.position.set(-W / 2 + 0.04, 0, -0.6); L.rotation.y = Math.PI / 2; g.add(L);
    const R = buildSmallDoor(THREE, p.trim); R.position.set(W / 2 - 0.04, 0, 0.9); R.rotation.y = -Math.PI / 2; g.add(R);
  }
  // 벽의 문들 (병실 복도) — 실물 크기, 열리지 않는다. 문턱이 아니므로 doors 에 넣지 않는다
  if (sp.wallDoors) {
    const spots = [['left', -D / 2 + 2.4], ['right', -D / 2 + 3.9], ['left', -D / 2 + 5.4], ['right', -D / 2 + 6.9], ['left', -D / 2 + 8.4]];
    for (const [wall, z] of spots) {
      if (z > D / 2 - 1.2) continue;
      const d = buildDoor(THREE, p.trim, { w: 0.8, h: 2.0 }); d.name = 'door_deco';
      d.position.set(wall === 'left' ? -W / 2 + 0.02 : W / 2 - 0.02, 0, z); d.rotation.y = wall === 'left' ? Math.PI / 2 : -Math.PI / 2;
      g.add(d);
    }
  }
  // 문 (앞벽) — 문 그룹 로컬 +z = 방 바깥
  const door = buildDoor(THREE, p.trim, sp.door); door.position.set(0, 0, D / 2); g.add(door);
  const doors = [door];
  if (sd) {   // 옆문 — 문 그룹을 그 벽에 세우고 로컬 +z 가 바깥을 보게 돌린다
    const side = buildDoor(THREE, p.trim, sp.door); side.name = 'door_side';
    side.position.set(sd.wall === 'left' ? -W / 2 : W / 2, 0, sd.z);
    side.rotation.y = sd.wall === 'left' ? -Math.PI / 2 : Math.PI / 2;
    g.add(side); doors.push(side);
    g.userData.sideDoor = side;
  }
  g.userData = Object.assign(g.userData || {}, { key, kind: 'closed', door, doors, light: lights, set, space: sp, dims: { W, H, D }, footprint: { hx: W / 2, hz: D / 2 }, symbol: sym });
  return g;
}

// 열린 땅 (첫눈의 마당) — 하늘은 페이지(scene.background)가, 여기는 바닥 원판·나무·눈 무더기·홀로 선 문
function buildOpenSpace(THREE, key, opts) {
  const set = MAT[key], p = set.palette, sp = set.space;
  const { W, D } = sp;
  const g = new THREE.Group(); g.name = 'space_' + key;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(sp.groundR, 64), std(THREE, sp.ground, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.name = 'ground'; g.add(ground);
  // 상징(나무) 하나 가까이 + 멀리 둘 (거리감 참조물) + 눈 무더기 셋 — 전부 고정 자리
  const sym = buildSymbol(THREE, key); sym.position.set(-2.2, 0, -1.6); sym.rotation.y = 0.35; g.add(sym);
  const t2 = buildSymbol(THREE, key); t2.position.set(4.6, 0, -7.5); t2.scale.setScalar(1.25); t2.rotation.y = -1.1; g.add(t2);
  const t3 = buildSymbol(THREE, key); t3.position.set(-7.5, 0, 3.2); t3.scale.setScalar(0.9); t3.rotation.y = 2.2; g.add(t3);
  const moundMat = std(THREE, 0xb4b7bd, { roughness: 1 });
  for (const [x, z, r] of [[2.4, 1.2, 0.7], [-4.2, -5.0, 1.1], [6.5, 2.8, 0.9]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10), moundMat); m.scale.set(1, 0.22, 1); m.position.set(x, 0.0, z); g.add(m);
  }
  // 홀로 선 문 — 눈밭 위 문틀+문짝(T2 의 "지형 위 창문"처럼). 문턱 역할은 그대로
  const door = buildStandaloneDoor(THREE, p.trim, sp.door); door.position.set(0, 0, D / 2); g.add(door);
  const doors = [door];
  const sd = opts && opts.sideDoor;
  if (sd) {
    const side = buildStandaloneDoor(THREE, p.trim, sp.door); side.name = 'door_side';
    side.position.set(sd.wall === 'left' ? -W / 2 : W / 2, 0, sd.z);
    side.rotation.y = sd.wall === 'left' ? -Math.PI / 2 : Math.PI / 2;
    g.add(side); doors.push(side); g.userData.sideDoor = side;
  }
  const lights = new THREE.Group(); lights.name = 'room_lights'; g.add(lights);   // 빛은 하늘(ambient+sun) — 국소 광원 없음
  g.userData = Object.assign(g.userData || {}, { key, kind: 'open', door, doors, light: lights, set, space: sp, dims: { W, H: sp.H, D }, footprint: { hx: 4, hz: 4 }, symbol: sym });
  return g;
}

// 무 (다시 걸려온 전화) — 경계 없는 어둠 속 작은 바닥 원판 + 탁자·전화기 + 전등 하나 + 홀로 선 문
function buildVoidSpace(THREE, key, opts) {
  const set = MAT[key], p = set.palette, sp = set.space;
  const { W, D } = sp;
  const g = new THREE.Group(); g.name = 'space_' + key;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(sp.groundR, 48), std(THREE, sp.ground, { roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.name = 'ground'; g.add(ground);
  // 탁자·의자는 시작 자리(문에서 2.2 m, 로컬 z 0.8)에서 문을 볼 때 좌우 가장자리에 들어오는 자리 — 어둠 속에서 문과 함께 읽히게
  const sym = buildSymbol(THREE, key); sym.position.set(-0.8, 0, 2.4); sym.rotation.y = 0.5; g.add(sym);
  const seat = new THREE.Group(); const wood = std(THREE, new THREE.Color(p.trim).multiplyScalar(0.6).getHex());
  seat.add(box(THREE, 0.42, 0.04, 0.42, wood, 0, 0.45, 0), box(THREE, 0.42, 0.45, 0.035, wood, 0, 0.69, -0.2));
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) seat.add(box(THREE, 0.035, 0.45, 0.035, wood, x, 0.225, z));
  seat.position.set(0.9, 0, 2.3); seat.rotation.y = -0.6; g.add(seat);
  // 전등 하나 — 어둠 위에서 내려온 줄 끝의 전구 (탁자 위). 검은 안개 속이라 세기 1.3·거리 7
  const lights = new THREE.Group(); lights.name = 'room_lights'; g.add(lights);
  const light = new THREE.PointLight(set.light.color, 1.3, 7, 2); light.position.set(-0.7, 2.0, 2.3); lights.add(light);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: set.light.color })); bulb.position.copy(light.position); g.add(bulb);
  g.add(cyl(THREE, 0.006, 0.006, 1.8, dark(THREE), -0.7, 2.9, 2.3));
  const door = buildStandaloneDoor(THREE, p.trim, sp.door); door.position.set(0, 0, D / 2); g.add(door);
  const doors = [door];
  const sd = opts && opts.sideDoor;
  if (sd) {
    const side = buildStandaloneDoor(THREE, p.trim, sp.door); side.name = 'door_side';
    side.position.set(sd.wall === 'left' ? -W / 2 : W / 2, 0, sd.z);
    side.rotation.y = sd.wall === 'left' ? -Math.PI / 2 : Math.PI / 2;
    g.add(side); doors.push(side); g.userData.sideDoor = side;
  }
  g.userData = Object.assign(g.userData || {}, { key, kind: 'void', door, doors, light: lights, set, space: sp, dims: { W, H: sp.H, D }, footprint: { hx: sp.groundR + 0.5, hz: sp.groundR + 0.5 }, symbol: sym });
  return g;
}

// ─── 흔적 (260925 저녁, 검토 반영 #1) — 지나온 기억이 도착 공간에 남기는 것. 첫 흔적 = 눈 한 줌 ────
/**
 * 눈 흔적 — 바닥 y=0, 원점 중심. amount 0..1 이 크기·덩이 수를 정한다(0.5 = 한 칸 건넌 뒤 절반).
 * 납작한 무더기 1 + 작은 덩이 round(2·amount) + 아래 녹은 자국(어두운 원판). 해시로만 흩뿌린다(난수 0).
 * @param opts { wet: bool (녹은 자국, 기본 true), seed: number }
 */
export function buildSnowTrace(THREE, amount, opts) {
  const a = Math.max(0, Math.min(1, amount || 0));
  const seed = (opts && opts.seed) || 1, wet = !(opts && opts.wet === false);
  const g = new THREE.Group(); g.name = 'snow_trace'; g.userData = { amount: a };
  if (a <= 0.02) return g;
  const snowMat = std(THREE, 0xaeb2ba, { roughness: 1 });
  const r = 0.16 + 0.34 * a;
  const main = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 9), snowMat); main.scale.set(1, 0.2, 0.85); main.position.y = 0.005; g.add(main);
  const n = Math.round(2 * a);
  for (let i = 0; i < n; i++) {
    const k = seed * 5.1 + i * 2.9, rr = 0.06 + 0.08 * hash1(k);
    const m = new THREE.Mesh(new THREE.SphereGeometry(rr, 10, 6), snowMat); m.scale.set(1, 0.3, 1);
    m.position.set((hash1(k + 0.7) - 0.5) * 2 * (r + 0.25), 0.004, (hash1(k + 1.9) - 0.5) * 2 * (r + 0.2)); g.add(m);
  }
  if (wet) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(r * 1.7, 20), new THREE.MeshStandardMaterial({ color: 0x1a1c22, transparent: true, opacity: 0.32 + 0.2 * a, roughness: 0.25, depthWrite: false }));
    patch.rotation.x = -Math.PI / 2; patch.position.y = 0.002; g.add(patch);
  }
  return g;
}

// ─── 눈 입자 (결정론) ────────────────────────────────────────────
/** 상자 안에 n 개 자리 — {x,y,z,v(낙하 속도 m/s),ph(흔들림 위상)}. 해시 씨앗으로만 흩뿌린다(난수 0). */
export function snowPositions(n, b, seed) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = seed * 7.3 + i * 3.17;
    out.push({ x: b.x0 + (b.x1 - b.x0) * hash1(k), y: b.y0 + (b.y1 - b.y0) * hash1(k + 1.31), z: b.z0 + (b.z1 - b.z0) * hash1(k + 2.71), v: 0.45 + 0.35 * hash1(k + 0.53), ph: hash1(k + 4.13) * 6.2832 });
  }
  return out;
}
/** 자리 목록 → Points. userData.base 에 원자리, y0/y1 사이를 되감으며 내린다 */
export function makeSnowPoints(THREE, pts, opts) {
  const pos = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) { pos[i * 3] = pts[i].x; pos[i * 3 + 1] = pts[i].y; pos[i * 3 + 2] = pts[i].z; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: (opts && opts.color) || 0xf2f4f8, size: (opts && opts.size) || 0.045, sizeAttenuation: true, transparent: true, opacity: 0.85, fog: true, depthWrite: false });
  const m = new THREE.Points(geo, mat); m.name = 'snow'; m.frustumCulled = false;
  m.userData = { base: pts, y0: (opts && opts.y0) || 0, y1: (opts && opts.y1) || 7 };
  return m;
}
/** 경과 시간(초)으로 자리를 다시 쓴다 — 느리게 내리고(0.45~0.8 m/s) 옆으로 넓게 흔들린다(주기 ~25 s, 폭 0.35 m).
 *  avoid {x, z, r}: 관객 코앞(반지름 r) 입자는 바닥 아래로 숨긴다 — 렌즈 바로 앞 점이 큰 흰 사각형으로 뜨던 결함 */
export function tickSnow(points, time, avoid) {
  const { base, y0, y1 } = points.userData, h = y1 - y0;
  const a = points.geometry.getAttribute('position'), arr = a.array;
  const r2 = avoid ? avoid.r * avoid.r : 0;
  for (let i = 0; i < base.length; i++) {
    const b = base[i];
    let y = (b.y - y0 + b.v * time) % h; if (y < 0) y += h;
    const x = b.x + Math.sin(time * 0.25 + b.ph) * 0.35, z = b.z + Math.cos(time * 0.19 + b.ph * 1.7) * 0.2;
    arr[i * 3] = x; arr[i * 3 + 2] = z;
    arr[i * 3 + 1] = (avoid && (x - avoid.x) ** 2 + (z - avoid.z) ** 2 < r2) ? -5 : y1 - y;
  }
  a.needsUpdate = true;
}

// ─── 통로 몸통 — 중심선 샘플을 따라 단면(폭 W·높이 H, 닫힘 e)을 민다 ─────
/**
 * @param samples [{x, z, tx, tz, w, h, e, t, seg}]  (tx,tz 단위 접선 · w 폭 · h 벽 높이(이미 e 가 곱해진 값) · e 닫힘 0..1 · t 0..1 · seg 규칙 마디 번호)
 * @param colorAt (t, seg, face, i) → THREE.Color   face: 0 바닥 · 1 오른벽 · 2 천장 오른 선반 · 4 천장 왼 선반 · 3 왼벽
 * @param opts { floorOnly:bool, quadFilter:(i, face) => bool }
 *        quadFilter — 링 i−1→i 사이의 그 면 사각형을 이 지오메트리에 넣을지 (재료를 둘로 나눠 조각보·줄무늬를 거칠기까지 다르게, 260925)
 * 260925 오후: 링마다 e 가 다르다 — 벽 높이는 h(=H·e), 천장은 e 0.75→1 에서 양쪽 선반이 가운데로 닫힌다(그 사이 = 하늘 틈).
 *        e < 0.08 인 링이 끼는 사각형은 벽·천장을 만들지 않는다(바닥만). 정점 수는 링마다 같아 인덱스 규칙은 그대로.
 * @returns THREE.BufferGeometry (안쪽 면이 보이게 — DoubleSide + computeVertexNormals)
 */
export function buildTubeGeometry(THREE, samples, colorAt, opts) {
  const floorOnly = !!(opts && opts.floorOnly);
  const quadFilter = (opts && opts.quadFilter) || null;
  const pos = [], nrm = [], uv = [], colr = [], idx = [];
  let ringSize = 0;
  const eOf = (i) => (samples[i].e == null ? 1 : samples[i].e);
  const profile = (w, h, e) => {
    const hw = w / 2, r = Math.min(0.14, w / 6, h * 0.45);
    const P = [];
    // 바닥 (face 0)
    P.push([-hw, 0, 0], [hw, 0, 0]);
    if (!floorOnly) {
      const c = smoothstep(0.75, 1, e);         // 천장 덮임 0..1
      const L = (hw - r) * c;                    // 선반이 안쪽으로 뻗는 길이 (c=1 이면 가운데서 만난다)
      P.push([hw, 0, 1], [hw, h - r, 1]);                                   // 오른벽 (face 1)
      P.push([hw, h - r, 2], [hw - r, h, 2], [hw - r - L, h, 2]);           // 천장 오른 선반 (face 2) — 모서리 깎음 + 선반
      P.push([-hw + r + L, h, 4], [-hw + r, h, 4], [-hw, h - r, 4]);        // 천장 왼 선반 (face 4)
      P.push([-hw, h - r, 3], [-hw, 0, 3]);                                 // 왼벽 (face 3)
    }
    return P;
  };
  let arc = 0, prev = null;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (prev) arc += Math.hypot(s.x - prev.x, s.z - prev.z);
    prev = s;
    const P = profile(s.w, s.h, eOf(i));
    ringSize = P.length;
    const nx = -s.tz, nz = s.tx;   // 왼쪽 수직 (x2d 양수 = 진행 방향의 왼쪽… 오른벽 라벨은 색 구분용)
    let per = 0;
    for (let j = 0; j < P.length; j++) {
      const [x2, y2, face] = P[j];
      if (j > 0) per += Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]);
      pos.push(s.x + nx * x2, y2, s.z + nz * x2);
      nrm.push(0, 1, 0);
      uv.push(arc / 2.2, per / 2.2);
      const c = colorAt(s.t, s.seg, face, i);
      colr.push(c.r, c.g, c.b);
    }
    if (i > 0) {
      const a0 = (i - 1) * ringSize, a1 = i * ringSize;
      const wallsOk = eOf(i) >= 0.08 && eOf(i - 1) >= 0.08;
      for (let j = 0; j < ringSize - 1; j++) {
        const face = P[j][2];
        if (face !== P[j + 1][2]) continue;   // 면 경계(복제 정점) 사이는 건너뜀 — 천장 두 선반 사이가 하늘 틈
        if (face !== 0 && !wallsOk) continue; // 벽 없는 구간: 바닥만
        if (quadFilter && !quadFilter(i, face)) continue;
        idx.push(a0 + j, a1 + j, a0 + j + 1, a0 + j + 1, a1 + j, a1 + j + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.userData.arcLength = arc;
  return geo;
}

// ─── 중심선 — 규칙 점(꺾은 선)을 Catmull-Rom 으로 매끈히 잇고 등간격으로 다시 샘플 ─────
export function densify(points, spacing) {
  const P = [points[0]].concat(points, [points[points.length - 1]]);
  const segs = points.length - 1;
  const raw = [];
  const SUB = 16;
  for (let k = 0; k < segs; k++) {
    const p0 = P[k], p1 = P[k + 1], p2 = P[k + 2], p3 = P[k + 3];
    for (let s = 0; s < SUB; s++) {
      const t = s / SUB, t2 = t * t, t3 = t2 * t;
      const c = (a, b, cc, d) => 0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      raw.push({ x: c(p0.x, p1.x, p2.x, p3.x), z: c(p0.z, p1.z, p2.z, p3.z), seg: k });
    }
  }
  raw.push({ x: points[segs].x, z: points[segs].z, seg: segs - 1 });
  // 누적 길이
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
  const total = cum[cum.length - 1];
  const n = Math.max(8, Math.round(total / spacing));
  const out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const d = (i / n) * total;
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const f = cum[j + 1] > cum[j] ? (d - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    out.push({ x: raw[j].x + (raw[j + 1].x - raw[j].x) * f, z: raw[j].z + (raw[j + 1].z - raw[j].z) * f, t: i / n, s: d, seg: raw[j].seg });
  }
  // 접선 (중앙 차분)
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const L = Math.hypot(tx, tz) || 1;
    out[i].tx = tx / L; out[i].tz = tz / L;
  }
  return { samples: out, total };
}

/**
 * 통로 3D (T1′) — 재료 세트·방·문·통로 몸통 빌더 (실험 전용, 본 코드 미반영) (2026-09-25)
 *
 * 목적: test/corridor-3d-test.html 이 쓰는 순수 빌더. 전역 THREE(r128) 를 받아 Mesh/Group 을 만든다.
 *       난수 없음 — 모든 배치·노이즈는 해시(결정론). 같은 입력 = 같은 통로.
 * 선례: test/glb-room-test.html buildSyntheticRoomGlb(바닥·벽·사물·점광·캔버스 텍스처, 방 6×2.8×6, 감쇠 2),
 *       test/corridor-t1-rules.js(중심선은 저쪽이 정한다 — 이 파일은 그 선을 따라 단면을 민다),
 *       docs/통로_T1_실험-260923.md §5 #8 ("골+안개 벽"으로 읽힘 → 천장까지 닫힌 관 + 실물 크기 참조물).
 * 본 코드(js/**, play-test.html) 미반영. 소비자: test/corridor-3d-test.html 만.
 *
 * 재료 세트(프리셋 5, corridor-t1-rules SCENES 의 id 와 같은 키):
 *   palette {wall, floor, trim}  · symbol(상징 사물, 단순 기하)  · light {color, intensity}
 *   · sound(합성 소리 종류)  · step(발소리 바닥재)
 */

// 260925 검토 반영: 벽·바닥 명도 +30 % (선형 출력에서 0.10 이 화면 26/255 로 눌려 바닥이 안 보였다).
//                  trim 은 원색 그대로 두고, 문틀·작은 문·상징 사물 쪽에서 ×0.55 로 낮춘다(흰 트림이 전구보다 밝던 결함).
const MAT = {
  window: { name: '빈 방의 창',      palette: { wall: 0x4d5568, floor: 0x313745, trim: 0x8b95a8 }, light: { color: 0x8fa3c4, intensity: 0.95 }, sound: 'rain', step: 'wood',   symbol: 'window' },
  lie:    { name: '들킨 거짓말',     palette: { wall: 0x603d40, floor: 0x382a2a, trim: 0x8a5a4a }, light: { color: 0xc27a56, intensity: 0.75 }, sound: 'hum',  step: 'wood',   symbol: 'chair' },
  snow:   { name: '첫눈의 마당',     palette: { wall: 0x9f9fa6, floor: 0x7a7875, trim: 0xd8dce4 }, light: { color: 0xe4ecf6, intensity: 1.05 }, sound: 'bell', step: 'snow',   symbol: 'tree' },
  ward:   { name: '병실 복도',       palette: { wall: 0x647c72, floor: 0x4b5753, trim: 0xb9c8c0 }, light: { color: 0xc9dccd, intensity: 0.85 }, sound: 'beep', step: 'tile',   symbol: 'iv' },
  call:   { name: '다시 걸려온 전화', palette: { wall: 0x755c46, floor: 0x46392f, trim: 0xc9a06a }, light: { color: 0xe6b874, intensity: 0.90 }, sound: 'ring', step: 'carpet', symbol: 'phone' },
};
export const TRIM_K = 0.55;   // 문틀·작은 문·상징 사물의 trim 알베도 배율 (260925 검토: 흰 트림 255/255/255 클리핑)
function dim(THREE, hex, k) { return new THREE.Color(hex).multiplyScalar(k).getHex(); }
export const MATERIAL_SETS = Object.freeze(MAT);

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

/** 상징 사물 — 바닥 y=0, 원점 중심, 정면 = +z */
export function buildSymbol(THREE, key) {
  const g = new THREE.Group(); g.name = 'symbol_' + key;
  const p = MAT[key].palette;
  const trim = std(THREE, dim(THREE, p.trim, TRIM_K)), dark = std(THREE, 0x1d1a20);
  switch (MAT[key].symbol) {
    case 'window': {   // 창틀 하나 (1.0 × 1.2) — 벽에 기대 선 창
      const fw = 1.0, fh = 1.2, y0 = 0.9;
      g.add(box(THREE, fw + 0.1, 0.06, 0.08, trim, 0, y0, 0), box(THREE, fw + 0.1, 0.06, 0.08, trim, 0, y0 + fh, 0));
      g.add(box(THREE, 0.06, fh, 0.08, trim, -fw / 2, y0 + fh / 2, 0), box(THREE, 0.06, fh, 0.08, trim, fw / 2, y0 + fh / 2, 0), box(THREE, 0.04, fh, 0.05, trim, 0, y0 + fh / 2, 0));
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshStandardMaterial({ color: 0x9fb0c8, emissive: 0x161d29, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.2 }));   // emissive 절반 (260925)
      pane.position.set(0, y0 + fh / 2, 0); g.add(pane);
      g.add(box(THREE, 0.08, y0, 0.08, dark, -fw / 2 + 0.05, y0 / 2, 0), box(THREE, 0.08, y0, 0.08, dark, fw / 2 - 0.05, y0 / 2, 0));   // 받침
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
    case 'phone': {    // 작은 탁자 위 전화기
      const wood = std(THREE, 0x4a3a2c);
      g.add(box(THREE, 0.38, 0.48, 0.38, wood, 0, 0.24, 0));
      g.add(box(THREE, 0.22, 0.08, 0.16, dark, 0, 0.52, 0));
      g.add(box(THREE, 0.24, 0.035, 0.05, dark, 0, 0.6, -0.02));
      g.add(cyl(THREE, 0.03, 0.035, 0.05, dark, -0.1, 0.585, -0.02), cyl(THREE, 0.03, 0.035, 0.05, dark, 0.1, 0.585, -0.02));
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), std(THREE, p.trim)); dial.rotation.x = -Math.PI / 2 + 0.35; dial.position.set(0, 0.565, 0.05); g.add(dial);
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

// ─── 방 (6 × 2.8 × 6) — 로컬: 중심 x/z=0, 바닥 y=0, 문 = +z 벽(z=D/2) 가운데, 문 바깥 = +z ───
/**
 * @param opts { sideDoor: { wall: 'left'|'right', z: number } }  옆벽에 둘째 문 (fixation 고리의 끝 문 — 문 둘 = 같은 방, 260925 검토 반영)
 *        left = 로컬 −x 벽, right = 로컬 +x 벽. z = 그 벽 위의 로컬 z 자리(|z| ≤ 2.4). 문 그룹의 로컬 +z 는 언제나 방 바깥.
 * 반환 그룹의 userData.doors = [앞문, (옆문)] — 페이지는 각 문 그룹의 자기 좌표계로 문턱 규칙을 건다.
 */
export function buildRoom(THREE, key, grainTex, opts) {
  const { W, H, D, doorW, doorH } = ROOM;
  const set = MAT[key], p = set.palette;
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
  // 상징 사물 — 뒷벽 왼쪽 앞
  const sym = buildSymbol(THREE, key); sym.position.set(-1.6, 0, -1.7); sym.rotation.y = 0.35; g.add(sym);
  // 의자 하나 더 (참조물) — 오른쪽 벽가
  const seat = new THREE.Group(); const wood = std(THREE, new THREE.Color(p.trim).multiplyScalar(0.6).getHex());
  seat.add(box(THREE, 0.42, 0.04, 0.42, wood, 0, 0.45, 0), box(THREE, 0.42, 0.45, 0.035, wood, 0, 0.69, -0.2));
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) seat.add(box(THREE, 0.035, 0.45, 0.035, wood, x, 0.225, z));
  seat.position.set(2.2, 0, 0.6); seat.rotation.y = -0.9; g.add(seat);
  // 방 조명 — 260925 검토: 1.6×/9 m 는 어두운 관 끝에 "사무실처럼 고른" 방을 냈다 → 0.7×/5 m. 도착 뒤에도 관객 국소광이 주광.
  const light = new THREE.PointLight(set.light.color, 0.7 * set.light.intensity, 5, 2); light.position.set(0, H - 0.35, 0); light.name = 'room_light'; g.add(light);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: set.light.color })); bulb.position.copy(light.position); g.add(bulb);
  const cord = cyl(THREE, 0.006, 0.006, 0.3, dark(THREE), 0, H - 0.17, 0); g.add(cord);
  // 문 (앞벽) — 문 그룹 로컬 +z = 방 바깥
  const door = buildDoor(THREE, p.trim); door.position.set(0, 0, D / 2); g.add(door);
  const doors = [door];
  if (sd) {   // 옆문 — 문 그룹을 그 벽에 세우고 로컬 +z 가 바깥을 보게 돌린다
    const side = buildDoor(THREE, p.trim); side.name = 'door_side';
    side.position.set(sd.wall === 'left' ? -W / 2 : W / 2, 0, sd.z);
    side.rotation.y = sd.wall === 'left' ? -Math.PI / 2 : Math.PI / 2;
    g.add(side); doors.push(side);
    g.userData.sideDoor = side;
  }
  g.userData = Object.assign(g.userData || {}, { key, door, doors, light, set });
  return g;
}
function dark(THREE) { return std(THREE, 0x1d1a20); }

// ─── 통로 몸통 — 중심선 샘플을 따라 단면(폭 W·높이 H, 위 모서리 둥글게)을 민다 ─────
/**
 * @param samples [{x, z, tx, tz, w, h, t, seg}]  (tx,tz 단위 접선 · w 폭 · h 높이 · t 0..1 · seg 규칙 마디 번호)
 * @param colorAt (t, seg, face, i) → THREE.Color   face: 0 바닥 · 1 오른벽 · 2 천장 · 3 왼벽
 * @param opts { floorOnly:bool, quadFilter:(i, face) => bool }
 *        quadFilter — 링 i−1→i 사이의 그 면 사각형을 이 지오메트리에 넣을지 (재료를 둘로 나눠 조각보·줄무늬를 거칠기까지 다르게, 260925)
 * @returns THREE.BufferGeometry (안쪽 면이 보이게 — DoubleSide + computeVertexNormals)
 */
export function buildTubeGeometry(THREE, samples, colorAt, opts) {
  const floorOnly = !!(opts && opts.floorOnly);
  const quadFilter = (opts && opts.quadFilter) || null;
  const pos = [], nrm = [], uv = [], colr = [], idx = [];
  const ringDef = []; // 한 링의 (x2d, y2d, face, v) 목록 — 면 경계에서 정점 복제
  let ringSize = 0;
  const profile = (w, h) => {
    const hw = w / 2, r = Math.min(0.14, w / 6);
    const P = [];
    // 바닥 (face 0)
    P.push([-hw, 0, 0], [hw, 0, 0]);
    if (!floorOnly) {
      // 오른벽 (face 1)
      P.push([hw, 0, 1], [hw, h - r, 1]);
      // 천장 (face 2) — 둥근 모서리 3점씩
      for (let k = 1; k <= 3; k++) { const a = (k / 3) * Math.PI / 2; P.push([hw - r + r * Math.cos(a), h - r + r * Math.sin(a), 2]); }
      for (let k = 0; k <= 3; k++) { const a = Math.PI / 2 + (k / 3) * Math.PI / 2; P.push([-hw + r + r * Math.cos(a), h - r + r * Math.sin(a), 2]); }
      // 왼벽 (face 3)
      P.push([-hw, h - r, 3], [-hw, 0, 3]);
    }
    return P;
  };
  let arc = 0, prev = null;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (prev) arc += Math.hypot(s.x - prev.x, s.z - prev.z);
    prev = s;
    const P = profile(s.w, s.h);
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
      for (let j = 0; j < ringSize - 1; j++) {
        if (P[j][2] !== P[j + 1][2]) continue;   // 면 경계(복제 정점) 사이는 건너뜀
        if (quadFilter && !quadFilter(i, P[j][2])) continue;
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

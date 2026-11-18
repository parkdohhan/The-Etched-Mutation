/**
 * Corridor looks per scene — what the corridor borrows from the room it leaves and the room it reaches
 * (wall / floor / trim colours, light, footstep material, how closed it is).
 *
 * DRAFT (2026-11-17). Rule kept from the September experiment: a look comes only from what the
 * scene text itself says about the place (iron door, alley, asphalt/dirt fork, yellow tape, shop,
 * bus stop, wet mud, a closed door at home, a power plant in fog). Emotion never picks a look.
 * Scenes whose text names no place use the neutral default.
 * The author adjusts these on the page with ?tune=1 (saved in the browser, exportable as JSON)
 * and the exported values are pasted back here.
 *
 * enclosure: 1 = walls + ceiling · below 0.75 = walls only, open sky (alley) · 0 = no walls (open ground / void)
 * step: wood | tile | snow | carpet (footstep timbre — carpet is the soft, low one used for dirt)
 */
const NIGHT = { bg: 0x0b0e16, ambient: 0x222838, ambientI: 1.1, sun: 0.16, local: 0.9, smallDoors: false };   // outdoors at night: a little sky light so the ground reads

export const LOOKS = {
  // (임시 제목) 당신입니까 — 전부 실내. 단서: 철문·복도 계단 / 셋방 / 전화 받은 방 / 영안실 / 대리석 현관 바닥 / 새벽의 껌껌한 현관 / 백색 전등의 화장실 타일
  'DANG-001': {
    A: { wall: 0x464a52, floor: 0x2e3036, trim: 0x6f7680, light: 0x98a4b4, lightI: 0.85, step: 'tile', enclosure: 1, ceiling: 2.4, smallDoors: true },                  // 철문 한 장, 복도 계단
    B: { wall: 0x54493c, floor: 0x3a3128, trim: 0x8a7458, light: 0xc8a878, lightI: 0.8, step: 'wood', enclosure: 1, ceiling: 2.3, smallDoors: false },                   // 하루 종일 있던 방
    C: { wall: 0x56544e, floor: 0x3a3936, trim: 0x8c8a82, light: 0xc8c4b8, lightI: 0.9, step: 'wood', enclosure: 1, ceiling: 2.4, smallDoors: false },                   // 오후 두 시, 전화를 끊고 앉아 있던 자리
    D: { wall: 0x60706a, floor: 0x4a5450, trim: 0xb4c0ba, light: 0xdce8e4, lightI: 0.95, step: 'tile', enclosure: 1, hum: 0.14, drone: 0.05, smallDoors: false },        // 영안실
    E: { wall: 0x3c3c42, floor: 0x6a6a70, trim: 0x8e8e96, light: 0xa8b0c0, lightI: 0.75, step: 'tile', enclosure: 1, ceiling: 2.4, smallDoors: false },                  // 대리석 현관 바닥, 열어 둔 문
    F: { wall: 0x26262c, floor: 0x1e1e22, trim: 0x55555e, light: 0x7c88a4, lightI: 0.55, step: 'wood', enclosure: 1, ceiling: 2.4, fog: 0.07, thump: 0.2, smallDoors: true },  // 새벽, 껌껌한 어둠으로 채워진 현관
    G: { wall: 0x8a8e8c, floor: 0x6e7270, trim: 0xc8ccca, light: 0xeef2f0, lightI: 1.1, step: 'tile', enclosure: 1, ceiling: 2.2, hum: 0.2, smallDoors: false },         // 백색 전등, 바랜 타일
    H: { wall: 0x8a8e8c, floor: 0x6e7270, trim: 0xc8ccca, light: 0xf2ece0, lightI: 1.0, step: 'tile', enclosure: 1, ceiling: 2.2, hum: 0.1, drone: 0.1, smallDoors: false },  // 같은 화장실 바닥 — 모든 게 선명하다
  },
  'GWON-001': {
    A: { wall: 0x4a4a50, floor: 0x2c2c30, trim: 0x7a5a48, light: 0xa8a090, lightI: 0.85, step: 'tile', enclosure: 1, ceiling: 2.2, smallDoors: false },                 // 반지하, 철문
    B: Object.assign({}, NIGHT, { wall: 0x3c4048, floor: 0x35363a, trim: 0x8a8f98, light: 0x9aa6b8, lightI: 0.9, step: 'carpet', enclosure: 0, fog: 0.07 }),          // 문 앞, 이슬비에 마른 길
    C: Object.assign({}, NIGHT, { wall: 0x45423f, floor: 0x33312f, trim: 0x8a8378, light: 0xa39c90, lightI: 0.9, step: 'tile', enclosure: 0.74 }),                      // 골목 (벽은 서고 하늘은 열림)
    D: Object.assign({}, NIGHT, { wall: 0x3f3a33, floor: 0x3a332a, trim: 0x8c8474, light: 0xa8a08e, lightI: 0.95, step: 'carpet', enclosure: 0, fog: 0.06 }),          // 갈림길 — 아스팔트 / 흙
    E: Object.assign({}, NIGHT, { wall: 0x3d3a34, floor: 0x37322b, trim: 0xb99a2e, light: 0xb4a878, lightI: 0.9, step: 'carpet', enclosure: 0, fog: 0.07 }),           // 노란 띠
    F: { wall: 0x6c7470, floor: 0x55595a, trim: 0xc2c8c4, light: 0xdfe8e2, lightI: 1.0, step: 'tile', enclosure: 1, hum: 0.12, drone: 0.03, smallDoors: false },         // 슈퍼, 콘크리트 계단, 계산대
    G: Object.assign({}, NIGHT, { wall: 0x2e2c2a, floor: 0x2a2826, trim: 0x8a6f4a, light: 0xb89868, lightI: 0.8, step: 'carpet', enclosure: 0, fog: 0.1, thump: 0.22 }), // 발자국이 끊긴 자리
    H: Object.assign({}, NIGHT, { wall: 0x40444c, floor: 0x393b40, trim: 0x9097a2, light: 0xa4b0c2, lightI: 0.95, step: 'tile', enclosure: 0, fog: 0.06 }),            // 정류장, 마르는 바퀴 자국
    I: Object.assign({}, NIGHT, { wall: 0x3a342c, floor: 0x3b3228, trim: 0x2a2a2c, light: 0xb0a488, lightI: 0.95, step: 'snow', enclosure: 0, fog: 0.06 }),            // 현장, 젖은 진흙
    J: { wall: 0x54453a, floor: 0x3a2f28, trim: 0x9a7a58, light: 0xd0a070, lightI: 0.7, step: 'wood', enclosure: 1, ceiling: 2.4, thump: 0.18 },                         // 닫힌 문 너머, 새벽의 집
    K: { wall: 0x101014, floor: 0x16161a, trim: 0x3a3a40, light: 0x8088a0, lightI: 0.6, step: 'carpet', enclosure: 0, bg: 0x000000, fog: 0.14, ambient: 0x0a0a10, ambientI: 0.8, local: 0.5, smallDoors: false }, // …
    M: Object.assign({}, NIGHT, { wall: 0x3a3c44, floor: 0x33353a, trim: 0xa04a40, light: 0xc87868, lightI: 0.85, step: 'carpet', enclosure: 0, fog: 0.11, bg: 0x0c0d12 }), // 수평선의 발전소, 안개, 빨간 불빛
    N: { wall: 0x3e3636, floor: 0x2c2626, trim: 0x7a6a5a, light: 0xa89888, lightI: 0.7, step: 'wood', enclosure: 1, ceiling: 2.3, drone: 0.16 },                         // 새벽, 칼
    O: { wall: 0x4c4640, floor: 0x35302b, trim: 0x8f8272, light: 0xc0b49c, lightI: 0.85, step: 'wood', enclosure: 1, ceiling: 2.4 },                                    // 열려 있던 문
  },
};

export function storedLooks(memoryId) {
  try { return JSON.parse(localStorage.getItem('tem_room_looks:' + memoryId) || '{}') || {}; } catch (_) { return {}; }
}
export function saveLook(memoryId, sceneCode, look) {
  const all = storedLooks(memoryId); all[sceneCode] = look;
  try { localStorage.setItem('tem_room_looks:' + memoryId, JSON.stringify(all)); } catch (_) { /* private mode */ }
  return all;
}
/** Look for a scene: the author's browser-saved tuning > scenes.meta.corridor_look > this file > neutral default. */
export function lookFor(memory, scene) {
  const code = (scene.meta && scene.meta.scene_code) || String(scene.scene_order);
  const base = (LOOKS[memory.code] && LOOKS[memory.code][code]) || {};
  const tuned = storedLooks(memory.id)[code] || {};
  const authored = (scene.meta && scene.meta.corridor_look) || {};
  return Object.assign({}, base, authored, tuned);
}

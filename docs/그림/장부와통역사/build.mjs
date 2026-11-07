// 장부와 통역사 — 고리를 돌면 왜 틈이 생기나 (anatomy 스킬, Figure 급)
// 실측: UNDW-001 기본 고리 4>6>8 (정의 v1 §4). 높이 투영 u 기준 통역: 4→6 −0.088, 6→8 −1.569, 8→4 −0.613, 합 −2.270.
// 장부 높이 hz: 방4 +0.460, 방6 +0.096, 방8 +0.387 (tools/topo-piece/undw_piece-261105.json)
// 빌드: node build.mjs [--light]  → 장부와통역사-261108(-light).html
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
const KIT = join(homedir(), ".claude/skills/anatomy");
const k = await import(join(KIT, "kit/iso-kit.mjs"));
const { kitScript } = await import(join(KIT, "scripts/inline-kit.mjs"));

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 640, HEIGHT = 400;

// ── 진실(모델) ──
const ROOMS = [
  { id: 4, name: "매달림", hz: 0.460 },
  { id: 6, name: "제물의 얼굴", hz: 0.096 },
  { id: 8, name: "서랍", hz: 0.387 },
  { id: 4, name: "매달림(다시)", hz: 0.460 },
];
const TRANS = [-0.088, -1.569, -0.613]; // 통역사 셋: 4→6, 6→8, 8→4
const PER_TURN = 4; // 바늘 한 바퀴 = 투영 통역 4단위
const H_SCALE = 16, H_BASE = 7; // 받침대 높이 = H_BASE + hz × H_SCALE

// ── 세계 ──
const PLATE = { x: -140, y: -70, w: 284, d: 140, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const RAIL_FROM = -124, RAIL_TO = 124;
const CARRIAGE = { x: -70, y: -24, w: 140, d: 48, r: 3 };
const CARRIAGE_Z = 3, CARRIAGE_TOP = 8;
const PITCH = 32, PED_W = 20, PED_D = 22;
const PED_CX = [-48, -16, 16, 48];
const COLLAR_CX = [-32, 0, 32];
const DIAL = [0, 0], DIAL_R = 20, DIAL_Z = 84, DIAL_H = 10, DIAL_TOP = DIAL_Z + DIAL_H;
const MAG = { x: -22, y: -66, w: 44, d: 30, r: 3 }, MAG_H = 24;
const POST = [0, -51], POST_TOP = 124, CLAMP_Z = 102;
const TIP_R = 2.6;
const heightOf = (room) => H_BASE + room.hz * H_SCALE;
const STOPS = PED_CX.map((c) => -c); // 손수레 x: 받침대 i 가 게이지 밑에 오는 자리
const REACH = [STOPS[STOPS.length - 1] - 4, STOPS[0] + 4];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [POST[0], POST[1], POST_TOP + 2], [DIAL[0] + DIAL_R, DIAL[1] + DIAL_R, DIAL_TOP], [RAIL_TO + 6, 30, 10]],
  WIDTH, HEIGHT, { pad: 28, azimuth: 40, elevation: 31 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // 앞쪽 눈금 띠: 방 간격(32)마다 큰 눈금
  const strip = { x: -124, y: PLATE.y + PLATE.d - 15, w: 248, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 8, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // 이름판 (글자 대신 괘선 셋)
  const label = { x: 84, y: PLATE.y + 8, w: 44, d: 16, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P), { tone: "faint" }));
  [[30, 3.5], [22, 7.5], [36, 11.5]].forEach(([w, dy]) => out.push(L(k.lineOnTop([label.x + 4, label.y + dy], [label.x + 4 + w, label.y + dy], 0.8, P), { tone: "lo", free: true })));
  out.push(D([at([label.x + 2.2, label.y + 2.2, 0.8]), at([label.x + label.w - 2.2, label.y + label.d - 2.2, 0.8])], { size: 0.4 }));
  return out.join("");
}

function rails() {
  const out = [];
  for (const y of [-20, 15]) {
    out.push(S(k.slabOf({ x: RAIL_FROM, y, w: RAIL_TO - RAIL_FROM, d: 5, r: 1 }, 0, 3, P, 3, 0.4), { tone: "mid" }));
    out.push(D([RAIL_FROM + 6, 0, RAIL_TO - 6].map((x) => at([x, y + 2.5, 3])), { size: 0.4 }));
  }
  for (const x of [RAIL_FROM - 5, RAIL_TO]) {
    out.push(S(k.slabOf({ x, y: -23, w: 5, d: 46, r: 1.2 }, 0, 7, P, 3, 0.5), { tone: "mid" }));
    out.push(D([at([x + 2.5, -18, 7]), at([x + 2.5, 18, 7])], { size: 0.45 }));
  }
  return out.join("");
}

function fixture() {
  const out = [];
  out.push(S(k.slabOf(MAG, 0, 11, P, 6, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(MAG, 0.8), 11, MAG_H - 11, P, 6, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(MAG, 3), MAG_H, P), { tone: "faint" }));
  out.push(D([at([MAG.x + 5, MAG.y + 5, MAG_H]), at([MAG.x + MAG.w - 5, MAG.y + 5, MAG_H]), at([MAG.x + MAG.w - 5, MAG.y + MAG.d - 5, MAG_H])], { size: 0.45 }));
  const knob = [MAG.x + 8, MAG.y + 8];
  out.push(S(k.cylinder(knob[0], knob[1], 4.5, MAG_H, 3.5, P, 28), { tone: "mid" }));
  out.push(L(k.knurl(knob[0], knob[1], 4.5, MAG_H, MAG_H + 3.5, 30, P), { tone: "lo" }));
  out.push(L(k.lineOnTop([knob[0], knob[1]], [knob[0], knob[1] + 4.5], MAG_H + 3.5, P), { tone: "hi" }));
  out.push(D([at([knob[0], knob[1], MAG_H + 3.5])], { size: 0.5, tone: "hi" }));
  // 기둥
  out.push(S(k.cylinder(POST[0], POST[1], 5, MAG_H, 4, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(POST[0], POST[1], 3.2, MAG_H + 4, CLAMP_Z - 4 - MAG_H - 4, P, 28), { tone: "mid", crease: "none" }));
  out.push(L([56, 76].map((z) => k.sideArc(POST[0], POST[1], 3.2, z, P, 16)).join(""), { tone: "faint" }));
  const clamp = { x: POST[0] - 7, y: POST[1] - 7, w: 14, d: 14, r: 2.5 };
  out.push(S(k.slabOf(clamp, CLAMP_Z - 4, 12, P, 4, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(POST[0], POST[1], 3.2, CLAMP_Z + 8, POST_TOP - CLAMP_Z - 8, P, 28), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(POST[0], POST[1], 3.8, POST_TOP, 2, P, 28), { tone: "mid" }));
  // 팔: 기둥에서 앞으로(+y) 다이얼까지
  const arm = { x: -3, y: POST[1] + 7, w: 6, d: DIAL[1] - DIAL_R - POST[1] - 7 + 2, r: 2 };
  out.push(S(k.slabOf(arm, CLAMP_Z, 4, P, 4, 0.5), { tone: "mid" }));
  out.push(D([at([0, arm.y + 4, CLAMP_Z + 4]), at([0, arm.y + arm.d - 5, CLAMP_Z + 4])], { size: 0.45 }));
  const thumb = [clamp.x + clamp.w + 3, clamp.y + 7];
  out.push(S(k.slabOf({ x: clamp.x + clamp.w, y: thumb[1] - 1.4, w: 3, d: 2.8, r: 0.8 }, CLAMP_Z + 1, 4, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(thumb[0] + 1.4, thumb[1], 2.6, CLAMP_Z, 6, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(thumb[0] + 1.4, thumb[1], 2.6, CLAMP_Z, CLAMP_Z + 6, 18, P), { tone: "lo" }));
  return out.join("");
}

function carriage() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(CARRIAGE, 3), CARRIAGE_Z, 0.1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(CARRIAGE, CARRIAGE_Z, CARRIAGE_TOP - CARRIAGE_Z, P, 5, 0.6), { tone: "mid" }));
  // 부싱 넷
  for (const [x, y] of byDepth([[-66, -22], [60, -22], [-66, 16], [60, 16]])) {
    out.push(S(k.slabOf({ x, y, w: 6, d: 6, r: 1 }, CARRIAGE_Z - 1, CARRIAGE_TOP - CARRIAGE_Z + 2, P, 2, 0.3), { tone: "mid", crease: "none" }));
    out.push(D([at([x + 3, y + 3, CARRIAGE_TOP + 1])], { size: 0.4 }));
  }
  out.push(D([-56, -40, -24, -8, 8, 24, 40, 56].map((x) => at([x, CARRIAGE.y + CARRIAGE.d - 2.6, CARRIAGE_TOP])), { size: 0.4, tone: "lo" }));
  out.push(L(k.lineOnTop([CARRIAGE.x, -15.5], [CARRIAGE.x + CARRIAGE.w, -15.5], CARRIAGE_TOP, P), { tone: "faint" }));
  out.push(L(k.lineOnTop([CARRIAGE.x, 15.5], [CARRIAGE.x + CARRIAGE.w, 15.5], CARRIAGE_TOP, P), { tone: "faint" }));
  // 받침대 넷 = 방 (장부 높이)
  ROOMS.forEach((room, i) => {
    const plan = { x: PED_CX[i] - PED_W / 2, y: -PED_D / 2 - 4, w: PED_W, d: PED_D, r: 1.2 };
    const h = heightOf(room);
    out.push(S(k.slabOf(plan, CARRIAGE_TOP, h, P, 3, 0.5), { tone: i === 0 || i === 3 ? "hi" : "mid", crease: "lo" }));
    out.push(L(k.planOutline(k.insetPlan(plan, 2.2), CARRIAGE_TOP + h, P, 3), { tone: "faint" }));
    out.push(D([at([plan.x + 2.4, plan.y + 2.4, CARRIAGE_TOP + h]), at([plan.x + plan.w - 2.4, plan.y + plan.d - 2.4, CARRIAGE_TOP + h])], { size: 0.4, tone: "lo" }));
  });
  // 통역사 손잡이 셋: 받침대 사이, 앞쪽. 꼭대기 눈금선 각도 = 통역량
  COLLAR_CX.forEach((cx, i) => {
    const cy = 16; const z0 = CARRIAGE_TOP;
    out.push(S(k.cylinder(cx, cy, 4.2, z0, 2, P, 24), { tone: "mid" }));
    out.push(S(k.cylinder(cx, cy, 3.4, z0 + 2, 5, P, 24), { tone: "mid" }));
    out.push(L(k.knurl(cx, cy, 3.4, z0 + 2, z0 + 7, 24, P), { tone: "lo" }));
    out.push(L(k.ring(cx, cy, 2.2, z0 + 7, P, 16), { tone: "faint" }));
    const a = (TRANS[i] / PER_TURN) * Math.PI * 2;
    out.push(L(k.lineOnTop([cx, cy], [cx + Math.sin(a) * 3, cy - Math.cos(a) * 3], z0 + 7, P), { tone: "hi" }));
    out.push(D([at([cx, cy, z0 + 7])], { size: 0.5, tone: "hi" }));
  });
  // 손잡이
  const handle = [CARRIAGE.x + CARRIAGE.w - 10, CARRIAGE.y + CARRIAGE.d + 3];
  out.push(S(k.slabOf({ x: handle[0] - 2, y: CARRIAGE.y + CARRIAGE.d - 1, w: 4, d: 4, r: 1 }, CARRIAGE_Z + 1, 3, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(handle[0], handle[1] + 1, 3, CARRIAGE_Z, 5, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(handle[0], handle[1] + 1, 3, CARRIAGE_Z, CARRIAGE_Z + 5, 18, P), { tone: "lo" }));
  return out.join("");
}

function plunger() {
  return [
    S(k.cylinder(DIAL[0], DIAL[1], TIP_R, 0, 2.4, P, 20), { tone: "hi", lit: true }),
    S(k.cylinder(DIAL[0], DIAL[1], 1.4, 2.4, 50, P, 16), { tone: "hi", crease: "none", lit: true }),
  ].join("");
}

function dial() {
  const out = []; const [x, y] = DIAL;
  out.push(S(k.cylinder(x, y, 2.9, 54, DIAL_Z - 54, P, 20), { tone: "mid" }));
  out.push(L(k.sideArc(x, y, 2.9, 62, P, 12), { tone: "lo" }));
  // 팔 끝 → 다이얼 뒤쪽 러그
  out.push(S(k.slabOf({ x: -4, y: y - DIAL_R - 6, w: 8, d: 8, r: 1.5 }, DIAL_Z + 2, CLAMP_Z - DIAL_Z - 2, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, DIAL_R, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, DIAL_R, DIAL_TOP - 3.4, DIAL_TOP, 84, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, DIAL_R, DIAL_TOP - 3.4, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, DIAL_R - 2.2, DIAL_TOP, P, 64), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, DIAL_R - 3, 40, 5, DIAL_TOP, [1.3, 2.8], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  // 영점 표시(출발 자리): 12시 방향 굵은 눈금
  out.push(L(k.lineOnTop([x, y - DIAL_R + 2.2], [x, y - DIAL_R + 6.2], DIAL_TOP + 0.1, P), { tone: "hi" }));
  out.push(S(k.slabOf({ x: x + DIAL_R - 1, y: y - 2.4, w: 5, d: 4.8, r: 1.2 }, DIAL_Z + 2, 5, P, 3), { tone: "mid" }));
  out.push(S(k.slabOf({ x: x + DIAL_R + 3.6, y: y - 3.2, w: 2.6, d: 6.4, r: 1.2 }, DIAL_Z + 1.2, 6.6, P, 3), { tone: "mid" }));
  out.push(L(k.ring(x, y, 1.6, DIAL_TOP, P, 16), { tone: "mid" }));
  return out.join("");
}

const needleAt = (turn) => {
  const a = turn * Math.PI * 2; const [x, y] = DIAL;
  return k.lineOnTop([x - Math.sin(a) * 3.4, y + Math.cos(a) * 3.4], [x + Math.sin(a) * (DIAL_R - 4), y - Math.cos(a) * (DIAL_R - 4)], DIAL_TOP + 0.2, P);
};
// 틈 호: 영점에서 바늘까지 다이얼 위 호 (붉은색 = 갈라진 틈)
const gapArc = (turn) => {
  const [x, y] = DIAL; const r = DIAL_R - 6.5; const n = Math.max(2, Math.ceil(Math.abs(turn) * 40));
  const pts = []; for (let i = 0; i <= n; i++) { const a = (turn * i / n) * Math.PI * 2; pts.push([x + Math.sin(a) * r, y - Math.cos(a) * r]); }
  return k.onTop(pts, DIAL_TOP + 0.25, P);
};

const startX = STOPS[0];
const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: "다이얼 게이지 벤치. 손수레 위에 방 네 개(매달림, 제물의 얼굴, 서랍, 다시 매달림)가 받침대로 놓여 있고 받침대 사이에 통역사 손잡이 셋이 있다. 손수레가 게이지 밑을 지나면 플런저는 받침대의 실제 높이를 짚고, 바늘은 손잡이가 정한 만큼만 돈다. 같은 방으로 돌아와도 바늘은 영점으로 돌아오지 못한다.",
  body: [
    plate(), rails(), fixture(),
    `<g data-part="carriage" transform="${k.translateAlong(P, [startX, 0, 0])}">${carriage()}</g>`,
    `<g data-part="plunger" transform="${k.translateAlong(P, [0, 0, CARRIAGE_TOP + heightOf(ROOMS[0])])}">${plunger()}</g>`,
    dial(),
    `<path data-part="gap" class="iso-line" data-tone="red" data-free="both" d="" style="stroke-width:1.4;opacity:0"/>`,
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(0)}" style="stroke-width:1.1"/>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const ROOMS = ${JSON.stringify(ROOMS)}, TRANS = ${JSON.stringify(TRANS)}, PER_TURN = ${PER_TURN};
const PED_CX = ${JSON.stringify(PED_CX)}, COLLAR_CX = ${JSON.stringify(COLLAR_CX)}, PED_W = ${PED_W}, BASE = ${CARRIAGE_TOP}, H_BASE = ${H_BASE}, H_SCALE = ${H_SCALE};
const DIAL = ${JSON.stringify(DIAL)}, DIAL_R = ${DIAL_R}, DIAL_TOP = ${DIAL_TOP}, TIP_R = ${TIP_R};
const STOPS = ${JSON.stringify(STOPS)}, REACH = ${JSON.stringify(REACH)};
const stage = document.querySelector(".iso-stage"); const svg = stage.querySelector("svg");
const carriage = svg.querySelector('[data-part="carriage"]'), plunger = svg.querySelector('[data-part="plunger"]');
const needle = svg.querySelector('[data-part="needle"]'), gap = svg.querySelector('[data-part="gap"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const heightOf = (room) => H_BASE + room.hz * H_SCALE;
const needleAt = ${needleAt.toString().replace("k.lineOnTop", "lineOnTop")};
const gapArc = ${gapArc.toString().replace("k.onTop", "onTop")};
// 게이지 밑(세계 x=0)에 어느 받침대가 있나, 어느 손잡이를 지났나
const heightUnder = (cx) => { let top = BASE; ROOMS.forEach((room, i) => { const from = cx + PED_CX[i] - PED_W / 2, to = from + PED_W; if (to > -TIP_R && from < TIP_R) top = Math.max(top, BASE + heightOf(room)); }); return top; };
const roomUnder = (cx) => ROOMS.findIndex((_, i) => { const from = cx + PED_CX[i] - PED_W / 2; return 0 >= from && 0 <= from + PED_W; });
const sumPassed = (cx) => TRANS.reduce((s, t, i) => s + (cx + COLLAR_CX[i] < 0 ? t : 0), 0); // 손잡이가 게이지를 지나 왼쪽으로 가면 더함
let x = ${startX}, target = x, tip = { at: BASE + heightOf(ROOMS[0]), rate: 0 }, turn = 0;
let frame = 0, last = 0, clock = 0, touring = true, visible = false, idleTimer = 0;
const tourAt = (t) => STOPS[Math.floor(t / 2.6) % STOPS.length];
function draw() {
  carriage.setAttribute("transform", translateAlong(P, [x, 0, 0]));
  plunger.setAttribute("transform", translateAlong(P, [0, 0, tip.at]));
  needle.setAttribute("d", needleAt(turn));
  const showGap = Math.abs(turn) > 0.002; gap.setAttribute("d", showGap ? gapArc(turn) : ""); gap.style.opacity = showGap ? "0.9" : "0";
  const i = roomUnder(x); const sum = sumPassed(x);
  let text;
  if (i < 0) text = "받침대 사이 · 통역 합 " + sum.toFixed(2);
  else if (i === 0) text = "방 4 매달림 · 장부 +0.46 · 바늘 영점";
  else if (i === 3) text = "다시 방 4 · 장부 +0.46 · 통역 합 " + sum.toFixed(2) + " · 틈 " + Math.abs(sum).toFixed(2);
  else text = "방 " + ROOMS[i].id + " · 장부 " + (ROOMS[i].hz >= 0 ? "+" : "") + ROOMS[i].hz.toFixed(2) + " · 통역 합 " + sum.toFixed(2);
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(sum * 100)));
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60; last = now;
  const calm = still.matches;
  if (touring) { clock += dt; target = tourAt(clock); }
  x = calm ? target : x + (target - x) * (1 - Math.exp(-dt / 0.32));
  if (Math.abs(target - x) < 0.01) x = target;
  const want = heightUnder(x);
  const stiff = 420, drag = calm ? 2 * Math.sqrt(420) : 26;
  for (let i = 0; i < 4; i++) { tip.rate += ((want - tip.at) * stiff - tip.rate * drag) * dt / 4; tip.at += tip.rate * dt / 4; }
  if (Math.abs(want - tip.at) < 0.005 && Math.abs(tip.rate) < 0.005) { tip.at = want; tip.rate = 0; }
  const wantTurn = sumPassed(x) / PER_TURN;
  turn = calm ? wantTurn : turn + (wantTurn - turn) * (1 - Math.exp(-dt / 0.22));
  if (Math.abs(wantTurn - turn) < 0.0005) turn = wantTurn;
  draw();
  const settled = !touring && x === target && tip.rate === 0 && tip.at === want && turn === wantTurn;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => { touring = false; target = clamp(next, REACH[0], REACH[1]); clearTimeout(idleTimer); idleTimer = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 4000); run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const share = clamp(((event.clientX - box.left) / box.width - 0.2) / 0.6, 0, 1);
  steer(REACH[1] - share * (REACH[1] - REACH[0]));
});
stage.addEventListener("pointerleave", () => steer(target));
stage.addEventListener("keydown", (event) => {
  const here = STOPS.reduce((best, s, i) => (Math.abs(s - target) < Math.abs(STOPS[best] - target) ? i : best), 0);
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = Math.min(STOPS.length - 1, here + 1);
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = Math.max(0, here - 1);
  if (event.key === "Home") to = 0; if (event.key === "End") to = STOPS.length - 1;
  if (to === null) return; event.preventDefault(); steer(STOPS[to]);
});
draw();
`;

const body = k.plateHtml({
  fig: "Fig 3",
  title: "장부와 통역사",
  hint: "마우스를 옆으로 움직여 손수레 밀기 · 방향키",
  readout: "방 4 매달림 · 장부 +0.46 · 바늘 영점",
  keys: [
    { mark: "lit", label: "플런저와 바늘: 플런저는 받침대의 실제 높이(장부)를 짚고, 바늘은 통역사가 정한 만큼만 돈다" },
    { mark: "raised", label: "받침대 넷 = 방 4 · 6 · 8 · 다시 4. 높이 = 그 방의 장부 값(+0.46, +0.10, +0.39, +0.46)" },
    { mark: "edge", label: "통역사 손잡이 셋 = 실의 통역: 4→6 −0.09, 6→8 −1.57, 8→4 −0.61" },
    { mark: "red", label: "갈라진 틈: 같은 방으로 돌아왔는데 바늘이 영점에서 2.27만큼 떨어져 있음" },
  ],
  caption:
    "UNDW-001 실관객 37회차의 고리 4→6→8→4 실측. 실마다 '지나면 감정이 이만큼 바뀐다'는 통역이 붙어 있고, 방마다 하나의 장부 높이를 주려 해도 세 통역을 다 만족하는 높이는 없다. 한 바퀴 돌아 같은 방에 서면 통역 합이 0이어야 하는데 −2.27이 남는다. 이 남는 각도가 갈라진 틈이고, 이본이 사는 자리다. 숫자는 높이 투영(u, 설명 비율 36%) 기준.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="장부와 통역사: 방향키로 방을 넘긴다" aria-valuemin="-227" aria-valuemax="0" aria-valuenow="0">${svg}</div>`,
});

const name = theme === "light" ? "장부와통역사-261108-light.html" : "장부와통역사-261108.html";
writeFileSync(join(HERE, "..", name), k.pageHtml({ title: "장부와 통역사", theme, body, script: kitScript() + live }));
console.log("wrote", name);

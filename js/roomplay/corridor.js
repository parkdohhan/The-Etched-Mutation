/**
 * Room-play corridor stage — first-person 3D corridor between two text rooms.
 *
 * Adapted from the September experiment (test/corridor-3d-test.html, T1b). The builders and the
 * centreline rules are imported unchanged; what is rewritten here is the page-level glue:
 * no room geometry (rooms are text now), a stand-alone door at each end, arrival = walking
 * through door B. Pattern → geometry (design principle #1) stays exactly as in the experiment.
 *
 * Requires the three.js r128 global build (window.THREE).
 */
import { buildPath } from '../../test/corridor-t1-rules.js';
import {
  buildStandaloneDoor, buildSmallDoor, setDoorOpen, buildTubeGeometry, densify,
  makeGrainTexture, lerpHex, smoothstep, snowPositions, makeSnowPoints, tickSnow,
} from '../../test/corridor-3d-build.js';
import { CorridorAudio } from '../../test/corridor-3d-audio.js';

// ── locked values (same as the experiment unless noted) ─────────────────────
const RULE_L = 58, DIRECT_M = 14, SCALE = DIRECT_M / RULE_L, SEED_R = 6;
const PIN_A = { x: 0, z: 0 }, PIN_B = { x: RULE_L, z: 0 };
const SIZE = { HIGH: [2.4, 2.7], MID: [1.5, 2.5], LOW: [1.1, 2.1], FIXATED: [0.85, 1.9] };
const WIDER = { HIGH: 'HIGH', MID: 'HIGH', LOW: 'MID', FIXATED: 'LOW' };
const LIGHT_K = 2.4;               // experiment: 1.8 (it had room bulbs as well; here the walker's light is alone)
const TRANS_S = 2.5;
const DOOR_NEAR = 0.8, DOOR_FAR = 1.7;
const WALK = 1.15;                 // m/s, fixed — no running
const STEP_M = 0.72;
const CLEAR = 0x0b0b12;
const SAMPLE_M = 0.3;
const E_WALL = 0.08;
const SNOW_RING_N = 10;
const LOOP_ROOM = 6;               // fixation loop: footprint of the (absent) room it returns to
const ARRIVE_PAST = 0.7;           // metres past door B that count as "arrived"
// sight changes first, sound later (experiment default "eyeFirst")
const LAG = { vis: [0.1, 0.7], amb: [0.3, 0.9], step: [0.75, 1], arrive: [0.5, 1] };
function ramp(t, ab) { const a = ab[0], b = ab[1]; return b <= a ? (t >= b ? 1 : 0) : Math.max(0, Math.min(1, (t - a) / (b - a))); }

/** Neutral look used when a scene has no authored corridor look. */
export const DEFAULT_LOOK = Object.freeze({
  wall: 0x4d5568, floor: 0x313745, trim: 0x8b95a8,
  light: 0x8fa3c4, lightI: 0.95,
  step: 'wood',            // wood | tile | snow | carpet
  enclosure: 1,            // 1 closed tube · 0 no walls (open ground / void)
  ceiling: null,           // ceiling height cap in metres (null = bucket height)
  bg: 0x0b0b12, fog: 0.05,
  ambient: 0x2a2838, ambientI: 1.2, sun: 0, local: 1,
  particles: 0,            // snow 0..1
  smallDoors: true,
  drone: 0.08, hum: 0, thump: 0,
});
export function normLook(look) { return Object.assign({}, DEFAULT_LOOK, look || {}); }

export function createCorridor(opts) {
  const THREE = window.THREE;
  const STRIDE = opts.stride || STEP_M;   // metres per footstep (piece rooms pass the terrain's stride)
  const SPEED = opts.speed || 1;   // 1 for every walker; only test runs may pass more
  // 261118: walking speed may be given in absolute units/s (piece rooms pass 0.75 x the terrain's
  // walking speed). Default = the corridor's own 1.15 m/s.
  const WALK_MPS = opts.walkSpeed || WALK;
  // 261118: footsteps are the terrain's footsteps (same sample: sounds/footstep_on_dirt.mp3, three
  // steps in one file) and each step leaves a footprint (img/footprint.png) that fades.
  const step2 = (function () {
    let ctx = null, buf = null, segs = [], idx = 0, left = false;
    const prints = []; let tex = null;
    function ensure() {
      if (ctx) { if (ctx.state !== 'running') { try { ctx.resume(); } catch (_) {} } return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        fetch('sounds/footstep_on_dirt.mp3').then((r) => r.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab)).then((b) => {
          buf = b;
          // split on silence: a step starts where the level rises after a quiet stretch
          const d = b.getChannelData(0), sr = b.sampleRate, win = Math.floor(sr * 0.01);
          let quiet = win * 20, inStep = false, start = 0;
          for (let i = 0; i + win < d.length; i += win) {
            let e = 0; for (let k = 0; k < win; k++) e += Math.abs(d[i + k]); e /= win;
            if (!inStep && e > 0.02 && quiet >= win * 6) { inStep = true; start = i; }
            if (e < 0.008) { quiet += win; if (inStep && quiet >= win * 8) { segs.push([start / sr, Math.max(0.08, (i - start) / sr)]); inStep = false; } } else quiet = 0;
          }
          if (inStep) segs.push([start / sr, Math.max(0.08, (d.length - start) / sr)]);
          if (!segs.length) { const third = b.duration / 3; segs = [[0, third], [third, third], [2 * third, third]]; }
        }).catch(() => {});
      } catch (_) {}
    }
    function sound() {
      if (!ctx || !buf || !segs.length) return;
      const seg = segs[idx % segs.length], rate = [0.95, 1.02, 0.98, 1.05, 1.0][idx % 5]; idx++;
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
      const g = ctx.createGain(), now = ctx.currentTime, dur = Math.max(0.05, seg[1] / rate);
      g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.5, now + 0.005); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(g); g.connect(ctx.destination); src.start(now, seg[0], dur + 0.02);
    }
    function print(x, z, yaw) {
      if (!tex) tex = new THREE.TextureLoader().load('img/footprint.png');
      left = !left;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.56),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.0, depthWrite: false, color: 0xd8cfc0 }));
      const side = left ? -0.15 : 0.15;
      m.rotation.set(-Math.PI / 2, 0, -yaw + Math.PI);
      if (left) m.scale.x = -1;
      m.position.set(x + Math.cos(yaw) * side, 0.012, z - Math.sin(yaw) * side);
      m.userData.t0 = performance.now();
      scene.add(m); prints.push(m);
    }
    function fade() {
      const now = performance.now();
      for (let i = prints.length - 1; i >= 0; i--) {
        const m = prints[i], a = (now - m.userData.t0) / 1000;
        m.material.opacity = a < 0.6 ? 0.42 * (a / 0.6) : Math.max(0, 0.42 * (1 - (a - 0.6) / 14));
        if (a > 14.6) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); prints.splice(i, 1); }
      }
    }
    function clear() { while (prints.length) { const m = prints.pop(); scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }
    return { ensure, sound, print, fade, clear };
  })();
  if (!THREE) throw new Error('three.js r128 global build is required');
  const canvas = opts.canvas;
  const onProgress = opts.onProgress || function () {};

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(CLEAR);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CLEAR);
  scene.fog = new THREE.FogExp2(CLEAR, 0.06);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 120);
  const ambient = new THREE.AmbientLight(0x2a2838, 1.2); scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xdde4ee, 0); sun.position.set(6, 14, 4); scene.add(sun);
  const playerLight = new THREE.PointLight(0xffffff, 1.2, 9, 2); scene.add(playerLight);
  const world = new THREE.Group(); scene.add(world);
  const audio = new CorridorAudio();

  const SM = { fog: 0.06, lightR: 1, lightG: 1, lightB: 1, lightI: 1, lightY: 1.6, eye: 1.6, bob: 0, dist: 9, bgR: 0.043, bgG: 0.043, bgB: 0.07, ambR: 0.165, ambG: 0.157, ambB: 0.22, ambI: 1.2, sun: 0, local: 1 };
  const SM_T = Object.assign({}, SM);
  const fp = { x: 0, z: 0, yaw: 0, pitch: -0.03, keys: {}, t: 0, idx: 0, moving: false, bobPhase: 0, stepAcc: 0, forward: false, walkUntil: 0 };

  let W = null;            // built world
  let spec = null;         // current spec
  let active = false;
  let resolveArrive = null;
  let raf = 0;
  const clock = new THREE.Clock();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }

  function disposeWorld() {
    world.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
    while (world.children.length) world.remove(world.children[0]);
  }

  function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }

  /** A wall around a door at one end of the tube, so the end is a doorway and not an open mouth. */
  function endCap(s, facing, w, h, doorW, doorH, colorHex) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.92, metalness: 0.02 });
    const sideW = Math.max(0, (w - doorW) / 2 - 0.07);
    if (sideW > 0.02) {
      g.add(box(sideW, h, 0.08, mat, -(doorW / 2 + 0.07 + sideW / 2), h / 2, 0));
      g.add(box(sideW, h, 0.08, mat, (doorW / 2 + 0.07 + sideW / 2), h / 2, 0));
    }
    if (h - doorH - 0.07 > 0.02) g.add(box(doorW + 0.14, h - doorH - 0.07, 0.08, mat, 0, doorH + 0.07 + (h - doorH - 0.07) / 2, 0));
    g.position.set(s.x, 0, s.z); g.rotation.y = facing;
    return g;
  }

  function build(sp) {
    disposeWorld();
    const pat = sp.pattern, a = sp.alignment, cont = sp.cont;
    const LA = normLook(sp.lookA), LB = normLook(sp.lookB);
    const path = buildPath({ A: PIN_A, B: PIN_B, pattern: pat, from: sp.fromVec, to: sp.toVec, alignment: a, bucket: sp.bucket, cont, gridMargin: 200, seedR: SEED_R, softSide: true });
    const side = path.info.side, p = { x: 0, z: 1 };
    let pts = path.points.map((q) => ({ x: q.x * SCALE, z: q.z * SCALE }));
    if (pat === 'fixation') {
      // The loop comes back beside its own start; it ends at a second door there (same room).
      const WA = LOOP_ROOM, DA = LOOP_ROOM, LEAD = 0.8;
      const loop = pts.slice(1).map((q) => ({ x: q.x + LEAD, z: q.z }));
      const kept = []; let xMin = 0;
      for (let i = 0; i < loop.length; i++) {
        const q = loop[i]; xMin = Math.min(xMin, q.x);
        if (i > loop.length / 2 && side * q.z < WA / 2 + 1.8) break;
        kept.push(q);
      }
      const xE = Math.max(-(DA - 0.8), Math.min(-1.0, xMin));
      pts = [{ x: 0, z: 0 }, { x: LEAD * 0.5, z: 0 }].concat(kept, [{ x: xE, z: side * (WA / 2 + 1.5) }, { x: xE, z: side * WA / 2 }]);
    }
    if (pat === 'displacement') {
      const Bp = pts[pts.length - 1];
      pts.splice(pts.length - 1, 0, { x: Bp.x + p.x * side * 1.0, z: Bp.z + p.z * side * 1.0 });
    }
    const { samples, total } = densify(pts, SAMPLE_M);
    const sizeKey = pat === 'echo_follow' ? WIDER[sp.bucket] : sp.bucket;
    const wB = SIZE[sizeKey][0], hB = SIZE[sizeKey][1];
    const HA = LA.ceiling || hB, HB = LB.ceiling || hB;
    let neckEnd = -1;
    if (pat === 'displacement') { const k = samples.findIndex((s) => s.seg >= 1); neckEnd = k > 0 ? samples[k].t : 0.3; }
    let tBack = 0;
    if (pat === 'contradiction') { const k = samples.findIndex((s, i) => i > 2 && s.tx > 0.2); tBack = k > 0 ? samples[k].t : 0.35; }
    for (const s of samples) {
      let w = wB * (1 - 0.35 * cont.c * s.t) * (1 - 0.25 * (1 - a) * s.t);
      if (neckEnd >= 0) w *= 0.55 + 0.45 * smoothstep(neckEnd - 0.06, neckEnd + 0.06, s.t);
      s.w = Math.max(0.7, w);
      s.e = LA.enclosure + (LB.enclosure - LA.enclosure) * s.t;
      const hCap = Math.min(hB, HA + (HB - HA) * s.t);
      s.h = pat === 'avoidance' ? 0 : hCap * s.e;
    }
    const inStripe = (i) => pat === 'bridge' && samples[i].t > 0.3 && samples[i].t < 0.7;
    const cls = (i, face) => {
      if (cont.h >= 0.5) return ((samples[i].seg + face) % 2 === 0) ? 0 : 1;
      if (inStripe(i)) return Math.floor(samples[i].s / 1.2) % 2;
      return -1;
    };
    const colorAt = (t, seg, face, i) => {
      let m = ramp(t, LAG.vis), lum = 1;
      if (inStripe(i)) { const stripe = Math.floor(samples[i].s / 1.2) % 2; m = m * 0.35 + (stripe ? 0.85 : 0.15) * 0.65; lum = stripe ? 1.35 : 0.65; }
      if (cont.h > 0) { const quilt = ((seg + face) % 2 === 0) ? 0 : 1; m += (quilt - m) * cont.h * 0.85; lum = 1 + (quilt ? 0.35 : -0.35) * cont.h; }
      const c = face === 0 ? lerpHex(THREE, LA.floor, LB.floor, m) : lerpHex(THREE, LA.wall, LB.wall, m);
      c.multiplyScalar(lum);
      if (face === 2 || face === 4) c.multiplyScalar(0.8);
      return c;
    };
    const seedA = sp.seedA || 0, seedB = sp.seedB || 0;
    const ampBase = (pat === 'echo_follow' ? 0 : 0.15) + 0.6 * cont.d;
    const grain = makeGrainTexture(THREE, ampBase, 3.1 + seedA);
    const split = cont.h >= 0.5 || pat === 'bridge';
    const tubeMats = { '-1': new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, side: THREE.DoubleSide, roughness: 0.92, metalness: 0.02 }) };
    if (split) {
      tubeMats['0'] = new THREE.MeshStandardMaterial({ vertexColors: true, map: makeGrainTexture(THREE, 0.6, 5.3 + seedB), side: THREE.DoubleSide, roughness: 0.92, metalness: 0.02 });
      tubeMats['1'] = new THREE.MeshStandardMaterial({ vertexColors: true, map: makeGrainTexture(THREE, 0.15, 7.7 + seedA), side: THREE.DoubleSide, roughness: 0.5, metalness: 0.02 });
    }
    const half = Math.floor(samples.length / 2);
    for (const range of [[0, half], [half, samples.length - 1]]) {
      const lo = range[0], hi = range[1];
      for (const c of (split ? [-1, 0, 1] : [-1])) {
        const geo = buildTubeGeometry(THREE, samples.slice(lo, hi + 1), (t, seg, face, i) => colorAt(t, seg, face, lo + i), { floorOnly: pat === 'avoidance', quadFilter: split ? (i, face) => cls(lo + i, face) === c : null });
        if (!geo.index || geo.index.count === 0) { geo.dispose(); continue; }
        world.add(new THREE.Mesh(geo, tubeMats[String(c)]));
      }
    }
    // open ground: where the tube has no walls the path lies on a wide dark ground, not in a void
    if (LA.enclosure < 0.5 || LB.enclosure < 0.5) {
      let cx = 0, cz = 0; for (const s of samples) { cx += s.x; cz += s.z; } cx /= samples.length; cz /= samples.length;
      const gcol = lerpHex(THREE, LA.enclosure < 0.5 ? LA.floor : LB.floor, LB.enclosure < 0.5 ? LB.floor : LA.floor, 0.5).multiplyScalar(0.62);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), new THREE.MeshStandardMaterial({ color: gcol, map: makeGrainTexture(THREE, 0.5, 9.1 + seedA), roughness: 1, metalness: 0 }));
      ground.material.map.repeat.set(24, 24);
      ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.03, cz); world.add(ground);
    }
    // doors — local +z of a door faces the corridor
    const s0 = samples[0], sN = samples[samples.length - 1];
    const doorH = (s) => (s.h > 0.5 ? Math.min(2.1, s.h - 0.12) : 2.1);
    const doorA = buildStandaloneDoor(THREE, LA.trim, { w: 0.9, h: doorH(s0) });
    doorA.position.set(s0.x, 0, s0.z); doorA.rotation.y = Math.atan2(s0.tx, s0.tz); world.add(doorA);
    const doorB = buildStandaloneDoor(THREE, LB.trim, { w: 0.9, h: doorH(sN) });
    doorB.position.set(sN.x, 0, sN.z); doorB.rotation.y = Math.atan2(-sN.tx, -sN.tz); world.add(doorB);
    setDoorOpen(doorA, 0); setDoorOpen(doorB, 0);
    doorB.userData.target = 0;
    doorB.userData.tc = (TRANS_S * (1.6 - 0.6 * a)) / 3;
    if (s0.h > 0.5) world.add(endCap(s0, doorA.rotation.y, s0.w, s0.h, 0.9, doorH(s0), lerpHex(THREE, LA.wall, LA.wall, 0).getHex()));
    if (sN.h > 0.5) world.add(endCap(sN, doorB.rotation.y, sN.w, sN.h, 0.9, doorH(sN), new THREE.Color(LB.wall).getHex()));
    // light leaking from the far door + the slit under it
    const nB = { x: -sN.tx, z: -sN.tz };
    const endI = pat === 'avoidance' ? 0.2 : 0.45;
    const endD = pat === 'avoidance' ? 5 : pat === 'echo_follow' ? 14 : 11;
    const endLight = new THREE.PointLight(LB.light, endI, endD, 2); endLight.position.set(sN.x - nB.x * 0.9, 2.25, sN.z - nB.z * 0.9); world.add(endLight);
    endLight.userData.base = endI;
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.05), new THREE.MeshBasicMaterial({ color: LB.light, transparent: true, opacity: pat === 'avoidance' ? 0.35 : 0.95, side: THREE.DoubleSide }));
    slit.position.set(sN.x + nB.x * 0.09, 0.03, sN.z + nB.z * 0.09); slit.rotation.y = Math.atan2(nB.x, nB.z); world.add(slit);
    // small doors that never open, along the walls
    const at = (sArc) => { let best = 0, bd = Infinity; for (let i = 0; i < samples.length; i++) { const d = Math.abs(samples[i].s - sArc); if (d < bd) { bd = d; best = i; } } return samples[best]; };
    const crowded = (sm) => samples.some((o) => Math.abs(o.s - sm.s) > 3 && Math.hypot(o.x - sm.x, o.z - sm.z) < (sm.w + o.w) / 2 + 0.3);
    if (pat !== 'avoidance') {
      let k = 0;
      for (let sArc = 2.4; sArc < total - 1.6; sArc += 2.2, k++) {
        const sm = at(sArc);
        const near = sm.t < 0.5 ? LA : LB;
        if (crowded(sm) || !near.smallDoors || sm.e < 0.6) continue;
        const trim = lerpHex(THREE, LA.trim, LB.trim, sm.t).getHex();
        const sideSign = pat === 'fixation' ? side : (k % 2 === 0 ? -1 : 1);
        const sd = buildSmallDoor(THREE, trim);
        const nx = -sm.tz, nz = sm.tx;
        sd.position.set(sm.x + nx * sideSign * (sm.w / 2 - 0.02), 0, sm.z + nz * sideSign * (sm.w / 2 - 0.02));
        sd.rotation.y = Math.atan2(-nx * sideSign, -nz * sideSign);
        world.add(sd);
      }
    }
    // snow where the walls are low
    const snow = [];
    if (LA.particles > 0 || LB.particles > 0) {
      const list = [];
      samples.forEach((s, i) => {
        const pd = (LA.particles + (LB.particles - LA.particles) * ramp(s.t, LAG.vis)) * (1 - s.e);
        const n = Math.round(SNOW_RING_N * pd); if (n <= 0) return;
        const nx = -s.tz, nz = s.tx, hw = s.w / 2 + 1.2;
        for (const q of snowPositions(n, { x0: -hw, x1: hw, y0: 0, y1: hB + 1.5, z0: -0.15, z1: 0.15 }, 101 + i * 7)) {
          list.push({ x: s.x + nx * q.x + s.tx * q.z, y: q.y, z: s.z + nz * q.x + s.tz * q.z, v: q.v, ph: q.ph });
        }
      });
      if (list.length) { const m = makeSnowPoints(THREE, list, { y0: 0, y1: hB + 1.5 }); world.add(m); snow.push(m); }
    }
    audio.setPresets(
      { sound: null, step: LA.step, audio: { drone: LA.drone, hum: LA.hum, thump: LA.thump } },
      { sound: null, step: LB.step, audio: { drone: LB.drone, hum: LB.hum, thump: LB.thump } });
    W = { path, samples, total, doorA, doorB, endLight, LA, LB, tBack, snow, lightDist: 9 * (0.7 + 0.3 * a), arrived: false };
    return W;
  }

  function envAt(t) {
    const A = W.LA, B = W.LB, v = ramp(t, LAG.vis), L = (x, y) => x + (y - x) * v;
    const fogK = spec.pattern === 'avoidance' ? 4.8 : 1 + 2 * (1 - spec.alignment);
    const bg = lerpHex(THREE, A.bg, B.bg, v), am = lerpHex(THREE, A.ambient, B.ambient, v);
    return { fog: L(A.fog, B.fog) * fogK, bgR: bg.r, bgG: bg.g, bgB: bg.b, ambR: am.r, ambG: am.g, ambB: am.b, ambI: L(A.ambientI, B.ambientI), sun: L(A.sun, B.sun), local: L(A.local, B.local) };
  }

  function placeAt(t) {
    const sm = W.samples;
    const i = Math.max(0, Math.min(sm.length - 1, Math.round(t * (sm.length - 1))));
    // one step inside door A when t = 0
    const s = sm[i], back = i === 0 ? 0.9 : 0;
    const j = Math.min(sm.length - 1, i + Math.round(back / SAMPLE_M));
    fp.x = sm[j].x; fp.z = sm[j].z; fp.idx = j; fp.t = sm[j].t;
    fp.yaw = Math.atan2(s.tx, s.tz); fp.pitch = -0.03; fp.moving = false; fp.bobPhase = 0; fp.stepAcc = 0;
    Object.assign(SM_T, { dist: W.lightDist, eye: spec.eye || 1.6, lightY: spec.eye || 1.6 }, envAt(fp.t));
    Object.assign(SM, SM_T);   // no easing on the first frame of a corridor
  }

  function nearest(x, z, near) {
    const sm = W.samples; let best = 0, bd = Infinity;
    let lo = 0, hi = sm.length - 1;
    if (near != null) { lo = Math.max(0, near - 12); hi = Math.min(sm.length - 1, near + 12); }
    for (let i = lo; i <= hi; i++) { const d = (sm[i].x - x) * (sm[i].x - x) + (sm[i].z - z) * (sm[i].z - z); if (d < bd) { bd = d; best = i; } }
    if (near != null && Math.sqrt(bd) > sm[best].w + 1.5) return nearest(x, z, null);
    const s = sm[best], nx = -s.tz, nz = s.tx;
    return { i: best, s, lat: (x - s.x) * nx + (z - s.z) * nz, along: (x - s.x) * s.tx + (z - s.z) * s.tz, nx, nz };
  }
  function canStand(x, z) {
    const q = nearest(x, z, fp.idx), last = W.samples.length - 1;
    if (q.i === 0 && q.along < -0.05) return false;                       // door A never reopens
    if (q.i === last && q.along > 0.05) {                                  // past the far end = through door B only
      return W.doorB.userData.open >= 0.6 && Math.abs(q.lat) <= 0.36 && q.along < ARRIVE_PAST + 0.6;
    }
    return Math.abs(q.lat) <= q.s.w / 2 - 0.2;
  }
  function moveTo(tx, tz) {
    const ox = fp.x, oz = fp.z;
    if (canStand(tx, tz)) { fp.x = tx; fp.z = tz; return; }
    // 261119: the open door B takes the walker in even when they come at it off-centre — the doorway
    // funnels them (before, a walker beside the centreline stood against the frame and never arrived).
    {
      const qe = nearest(tx, tz, fp.idx), lastE = W.samples.length - 1;
      if (qe.i === lastE && qe.along > 0.05 && qe.along < ARRIVE_PAST + 0.6 && W.doorB.userData.open >= 0.6 && Math.abs(qe.lat) <= qe.s.w / 2) {
        const lt = Math.max(-0.3, Math.min(0.3, qe.lat));
        fp.x = qe.s.x + qe.nx * lt + qe.s.tx * qe.along; fp.z = qe.s.z + qe.nz * lt + qe.s.tz * qe.along; return;
      }
    }
    const q = nearest(ox, oz, fp.idx);
    const mv = (tx - ox) * q.s.tx + (tz - oz) * q.s.tz;
    const sx = ox + q.s.tx * mv, sz = oz + q.s.tz * mv;                    // slide along the wall
    if (canStand(sx, sz)) { fp.x = sx; fp.z = sz; return; }
    const q2 = nearest(sx, sz, fp.idx);
    const lim = Math.max(0, q2.s.w / 2 - 0.24), lat = Math.max(-lim, Math.min(lim, q2.lat));   // 261119: a hair inside the wall line, so the clamped spot always stands (a walker pushing into a bend slides on instead of stopping)
    const al = Math.max(-0.05, Math.min(0.05, q2.along));
    const cx = q2.s.x + q2.nx * lat + q2.s.tx * al, cz = q2.s.z + q2.nz * lat + q2.s.tz * al;
    if (canStand(cx, cz) && Math.hypot(cx - ox, cz - oz) < 0.6) { fp.x = cx; fp.z = cz; }
  }

  function step(dt) {
    let f = 0, s = 0;
    const auto = performance.now() < fp.walkUntil;
    if (auto) {   // automation / "walk for me": turn slowly toward the tangent ahead
      const q = nearest(fp.x, fp.z, fp.idx), last = W.samples.length - 1;
      const sa = W.samples[Math.min(last, fp.idx + 3)];
      let wantYaw = Math.atan2(sa.tx, sa.tz);
      if (fp.idx >= last - 4) wantYaw = Math.atan2(W.samples[last].x + W.samples[last].tx * 2 - fp.x, W.samples[last].z + W.samples[last].tz * 2 - fp.z);
      else if (Math.abs(q.lat) > 0.05) wantYaw += Math.max(-0.6, Math.min(0.6, q.lat * 1.2));  // steer back to the centreline (left of it → turn right)
      let dy = wantYaw - fp.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      fp.yaw += dy * (1 - Math.exp(-dt * SPEED / 0.8));
    }
    if (fp.keys.w || fp.keys.arrowup || fp.forward || auto) f += 1;
    if (fp.keys.s || fp.keys.arrowdown) f -= 1;
    if (fp.keys.a || fp.keys.arrowleft) s -= 1;
    if (fp.keys.d || fp.keys.arrowright) s += 1;
    fp.moving = !!(f || s);
    if (!fp.moving) return;
    const sy = Math.sin(fp.yaw), cy = Math.cos(fp.yaw);
    const ox = fp.x, oz = fp.z;
    moveTo(fp.x + (sy * f - cy * s) * WALK_MPS * SPEED * dt, fp.z + (cy * f + sy * s) * WALK_MPS * SPEED * dt);
    const moved = Math.hypot(fp.x - ox, fp.z - oz);
    fp.stepAcc += moved;
    if (fp.stepAcc >= STRIDE) { fp.stepAcc -= STRIDE; step2.ensure(); step2.sound(); step2.print(fp.x, fp.z, fp.yaw); }   // was audio.step(W.LA.step, W.LB.step) — synthesized per-surface step, replaced 261118
    if (moved < 1e-4) fp.moving = false;
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1), time = clock.elapsedTime;
    if (!W || !active) return;
    step(dt);
    const q = nearest(fp.x, fp.z, fp.idx), last = W.samples.length - 1;
    fp.idx = q.i; fp.t = q.i === last && q.along > 0 ? 1 : q.s.t;
    // door B answers when the walker is near, on the far half only
    const dB = Math.hypot(fp.x - W.samples[last].x, fp.z - W.samples[last].z);
    const door = W.doorB;
    if (dB < DOOR_NEAR && fp.t >= 0.5) door.userData.target = 1; else if (dB > DOOR_FAR) door.userData.target = 0;
    setDoorOpen(door, door.userData.open + (door.userData.target - door.userData.open) * (1 - Math.exp(-dt / door.userData.tc)));
    // targets
    const t = fp.t, vis = ramp(t, LAG.vis);
    const lc = lerpHex(THREE, W.LA.light, W.LB.light, vis);
    SM_T.lightR = lc.r; SM_T.lightG = lc.g; SM_T.lightB = lc.b;
    let floorK = 0;   // contradiction: the light comes from the floor on the way back
    if (spec.pattern === 'contradiction') floorK = t < W.tBack ? 1 : 1 - smoothstep(W.tBack, 0.6, t);
    SM_T.lightI = (W.LA.lightI * (1 - vis) + W.LB.lightI * vis) * LIGHT_K * (1 + 0.8 * floorK);
    SM_T.lightY = 0.12 * floorK + SM.eye * (1 - floorK);
    SM_T.bob = fp.moving ? 1 : 0;
    Object.assign(SM_T, envAt(t));
    const k = 1 - Math.exp(-dt / (TRANS_S / 3));
    for (const key in SM_T) SM[key] += (SM_T[key] - SM[key]) * k;
    scene.fog.density = SM.fog;
    scene.background.setRGB(SM.bgR, SM.bgG, SM.bgB); scene.fog.color.setRGB(SM.bgR, SM.bgG, SM.bgB);
    ambient.color.setRGB(SM.ambR, SM.ambG, SM.ambB); ambient.intensity = SM.ambI; sun.intensity = SM.sun;
    const d = spec.cont.d;
    const flick = 1 + 0.35 * d * Math.sin(2 * Math.PI * (0.3 + 0.3 * d) * time);
    playerLight.color.setRGB(SM.lightR, SM.lightG, SM.lightB);
    playerLight.intensity = SM.lightI * flick * SM.local; playerLight.distance = SM.dist;
    playerLight.position.set(fp.x, SM.lightY, fp.z);
    W.endLight.intensity = W.endLight.userData.base * Math.max(0.15, Math.min(1, dB / 1.5)) * (1 + 0.25 * d * Math.sin(2 * Math.PI * 0.4 * time + 1.7));
    for (const m of W.snow) tickSnow(m, time, { x: fp.x, z: fp.z, r: 0.8 });
    audio.setMix(ramp(t, LAG.amb), ramp(t, LAG.step), ramp(t, LAG.arrive));
    audio.update(time);
    // camera — wide, slow sway (no jitter)
    const mN = W.path.info.mN, bobAmp = 0.012 + 0.02 * mN, bobPeriod = 3.2 + 1.5 * mN;
    if (fp.moving) fp.bobPhase += dt / bobPeriod;
    const roll = SM.bob * bobAmp * Math.sin(2 * Math.PI * fp.bobPhase);
    cam.position.set(fp.x, SM.eye + SM.bob * 0.02 * Math.sin(4 * Math.PI * fp.bobPhase), fp.z);
    const cp = Math.cos(fp.pitch);
    cam.up.set(Math.sin(roll), Math.cos(roll), 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), fp.yaw);
    cam.lookAt(fp.x + Math.sin(fp.yaw) * cp, cam.position.y + Math.sin(fp.pitch), fp.z + Math.cos(fp.yaw) * cp);
    { const f = new THREE.Vector3(); cam.getWorldDirection(f); audio.setListener(cam.position, f, cam.up); }
    renderer.render(scene, cam);
    step2.fade();
    onProgress({ t, amb: ramp(t, LAG.amb), doorOpen: door.userData.open, nearEnd: dB });
    if (!W.arrived && q.i === last && q.along > ARRIVE_PAST) {
      W.arrived = true;
      const r = resolveArrive; resolveArrive = null;
      if (r) r({ length: W.total, pattern: spec.pattern });
    }
  }

  const keyOf = (e) => (/^Key[A-Z]$/.test(e.code || '') ? e.code.slice(3).toLowerCase() : String(e.key).toLowerCase());
  // input — drag to look, WASD / arrows to walk
  // 261119 opts.lockLook (piece rooms): look the way the terrain does — the pointer is held, moving the
  // mouse turns the view, no cursor. A click takes the pointer back if it was let go (Esc).
  if (opts.lockLook) {
    document.addEventListener('mousemove', (e) => {
      if (!active || !document.pointerLockElement) return;
      fp.yaw -= (e.movementX || 0) * 0.0022; fp.pitch = Math.max(-0.8, Math.min(0.6, fp.pitch - (e.movementY || 0) * 0.0018));
    });
    canvas.addEventListener('click', () => { if (active && !document.pointerLockElement && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (_) {} } });
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (!active) return; drag = { x: e.clientX, y: e.clientY }; audio.ensure(); });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('pointermove', (e) => {
    if (!drag || !active || (opts.lockLook && document.pointerLockElement)) return;
    fp.yaw -= (e.clientX - drag.x) * 0.004; fp.pitch = Math.max(-0.8, Math.min(0.6, fp.pitch - (e.clientY - drag.y) * 0.003));
    drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('keydown', (e) => { if (!active) return; if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return; fp.keys[keyOf(e)] = true; audio.ensure(); });
  window.addEventListener('keyup', (e) => { fp.keys[keyOf(e)] = false; fp.keys[String(e.key).toLowerCase()] = false; });
  window.addEventListener('resize', resize);

  return {
    /** Build a corridor and hand control to the walker. Resolves when they pass door B. */
    start(sp) {
      spec = Object.assign({ bucket: 'MID', alignment: 0.7, cont: { d: 0, c: 0, h: 0 }, eye: 1.6 }, sp);
      resize();
      build(spec);
      placeAt(0);
      active = true;
      fp.keys = {}; fp.forward = false; fp.walkUntil = 0;
      clock.getDelta();
      if (!raf) frame();
      return new Promise((res) => { resolveArrive = res; });
    },
    /** Rebuild with a changed look, keeping the walker where they are (look tuner). */
    relook(lookA, lookB) {
      if (!W || !spec) return;
      const t = fp.t, yaw = fp.yaw, pitch = fp.pitch;
      if (lookA) spec.lookA = lookA; if (lookB) spec.lookB = lookB;
      build(spec); placeAt(Math.max(0.02, t)); fp.yaw = yaw; fp.pitch = pitch;
    },
    stop() { step2.clear(); active = false; fp.keys = {}; fp.forward = false; audio.setMix(0, 0, 0); audio.setMuted(true); },
    resume() { audio.setMuted(false); },
    setForward(on) { fp.forward = !!on; if (on) audio.ensure(); },
    /** Walk forward along the tube for `seconds` (automation, and the "walk for me" control). */
    walk(seconds) { fp.walkUntil = performance.now() + seconds * 1000; },
    ensureAudio() { audio.ensure(); step2.ensure(); },
    resize,
    state() {
      return W ? { active, t: +fp.t.toFixed(3), x: +fp.x.toFixed(2), z: +fp.z.toFixed(2), length: +W.total.toFixed(2), pattern: spec.pattern, doorOpen: +W.doorB.userData.open.toFixed(2), arrived: W.arrived, mN: W.path.info.mN } : { active };
    },
  };
}

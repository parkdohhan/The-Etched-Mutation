/**
 * Room-play ending — the walk becomes a 3D piece, the piece is laid flat, the flat map becomes
 * ground, and the walker goes down onto it (the existing terrain renderer) to see what the
 * others left.
 *
 * Drawing grammar of the piece follows 「기억의 위상 조각」: position has no meaning, only
 * connection; tube thickness = how many walked that way. This run's thread is the warm one.
 * The terrain renderer is the live one (js/shared/tem_af_strata_terrain.js); only its height
 * source is replaced, through the TemReplayTerrain provider slot it already has.
 */
import { buildNet, layout3D, principalFrame, bake, toWorld, BAKE } from './net.js';

const WARM = 0xe2b272, COOL = 0x6f7482, DOT = 0x9aa0ae;
const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function labelSprite(THREE, text, color, px) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), size = px || 44;
  g.font = '300 ' + size + 'px "Noto Serif KR", serif';
  const w = Math.ceil(g.measureText(text).width) + 24; c.width = w; c.height = size + 24;
  g.font = '300 ' + size + 'px "Noto Serif KR", serif'; g.fillStyle = color || '#d8d4dc'; g.textBaseline = 'middle'; g.fillText(text, 12, c.height / 2);
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }));
  sp.userData.aspect = c.width / c.height;
  return sp;
}

/**
 * @param o { THREE, pieceCanvas, terrainCanvas, ui:{ text(line, sub), buttons([{label, id}]) → Promise<id>, veil(on) → Promise, trace(word, line, src) },
 *            scenes, others:[{run_id, scene_id, created_at}], myPath:[scene_id…], myRunId, labelOf(scene) , linesFor(scene_id) → [{text, mine}] }
 */
export async function runEnding(o) {
  const THREE = o.THREE, ui = o.ui;
  const order = new Map(o.scenes.map((s) => [s.id, s.scene_order]));
  const sceneOf = new Map(o.scenes.map((s) => [s.id, s]));
  const now = new Date().toISOString();
  const mineVisits = o.myPath.map((id, i) => ({ run_id: '__mine__', scene_id: id, created_at: now + String(i).padStart(4, '0') }));
  const net = buildNet(o.others.filter((v) => v.run_id !== o.myRunId).concat(mineVisits));
  const myEdges = new Set();
  for (let i = 1; i < o.myPath.length; i++) { const a = o.myPath[i - 1], b = o.myPath[i]; if (a !== b) myEdges.add(a < b ? a + '|' + b : b + '|' + a); }
  const frame = principalFrame(layout3D(net.nodes, net.edges, order), order);
  const pos = frame.pos;
  const others = Array.from(net.runs.entries()).filter(([rid]) => rid !== '__mine__').map(([, seq]) => seq);
  const walkers = net.runs.size;

  // ── 1. the piece ─────────────────────────────────────────────────────────
  const canvas = o.pieceCanvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x050507);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050507, 0.16);
  const cam = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xfff0dc, 0.8); key.position.set(2, 4, 3); scene.add(key);
  const piece = new THREE.Group(); scene.add(piece);
  const resize = () => { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  resize(); window.addEventListener('resize', resize);

  let flat = 0;                                   // 0 = the piece as it settled · 1 = laid flat
  const P = (id) => { const p = pos.get(id); return new THREE.Vector3(p[0], p[1] * (1 - flat), p[2]); };
  const up = new THREE.Vector3(0, 1, 0);
  const setTube = (m, a, b) => { const d = new THREE.Vector3().subVectors(b, a), L = d.length() || 1e-6; m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, L, 1); m.quaternion.setFromUnitVectors(up, d.multiplyScalar(1 / L)); };

  const maxW = Math.max(1, ...Array.from(net.edges.values()).map((e) => e.w));
  const tubes = [];
  for (const [k, e] of net.edges) {
    const onlyMine = myEdges.has(k) && e.w === countMine(o.myPath, e.a, e.b);
    if (onlyMine) continue;                                              // drawn as this run's thread below
    const r = 0.006 + 0.022 * Math.sqrt(e.w / maxW);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10, 1, true), new THREE.MeshStandardMaterial({ color: COOL, roughness: 0.8, transparent: true, opacity: 0.62 }));
    piece.add(m); tubes.push({ m, a: e.a, b: e.b });
  }
  const mineSegs = [];
  for (let i = 1; i < o.myPath.length; i++) {
    const a = o.myPath[i - 1], b = o.myPath[i]; if (a === b) continue;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 10, 1, true), new THREE.MeshStandardMaterial({ color: WARM, emissive: WARM, emissiveIntensity: 0.35, roughness: 0.5, transparent: true, opacity: 0 }));
    piece.add(m); mineSegs.push({ m, a, b });
  }
  const dots = [], labels = [];
  const mineSet = new Set(o.myPath);
  for (const id of net.nodes) {
    const mine = mineSet.has(id);
    const d = new THREE.Mesh(new THREE.SphereGeometry(mine ? 0.03 : 0.022, 16, 12), new THREE.MeshStandardMaterial({ color: mine ? WARM : DOT, emissive: mine ? WARM : 0x000000, emissiveIntensity: mine ? 0.5 : 0, roughness: 0.6 }));
    piece.add(d); dots.push({ d, id });
    if (mine) { const sp = labelSprite(THREE, o.labelOf(sceneOf.get(id)), '#d9c6a4'); sp.scale.set(0.085 * sp.userData.aspect, 0.085, 1); piece.add(sp); labels.push({ sp, id }); }
  }
  // the count map that appears under the flat piece
  const fields = bake(pos, others, o.myPath);
  const mapTex = (() => {
    const G = fields.G, c = document.createElement('canvas'); c.width = c.height = G;
    const g = c.getContext('2d'), img = g.createImageData(G, G);
    for (let i = 0; i < G * G; i++) { const v = fields.maxCount > 0 ? Math.sqrt(fields.count[i] / fields.maxCount) : 0; img.data[i * 4] = 226; img.data[i * 4 + 1] = 200; img.data[i * 4 + 2] = 160; img.data[i * 4 + 3] = Math.round(190 * v); }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t;
  })();
  const side = BAKE.SZ / BAKE.SPAN;                                      // the bake grid, in piece units
  const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(side, side), new THREE.MeshBasicMaterial({ map: mapTex, transparent: true, opacity: 0, depthWrite: false }));
  mapPlane.rotation.x = -Math.PI / 2; mapPlane.position.y = -0.004; piece.add(mapPlane);

  let spin = 0, spinRate = (2 * Math.PI) / 80, camT = 0, reveal = 0, alive = true;
  const clock = new THREE.Clock();
  (function loop() {
    if (!alive) return;
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    spin += spinRate * dt * (1 - ease(flat));
    piece.rotation.y = spin * (1 - ease(flat)) + 0;                      // settles to a fixed orientation as it flattens
    for (const t of tubes) setTube(t.m, P(t.a), P(t.b));
    mineSegs.forEach((s, i) => { setTube(s.m, P(s.a), P(s.b)); s.m.material.opacity = Math.max(0, Math.min(0.95, reveal - i)); });
    for (const d of dots) d.d.position.copy(P(d.id));
    for (const l of labels) { l.sp.position.copy(P(l.id)); l.sp.position.y += 0.075; }
    // camera: three-quarter view → straight down
    const k = ease(camT), dist = 3.6 + 0.5 * k;                         // steps back as it flattens so the whole map fits under the caption
    const el = (28 + 61.5 * k) * Math.PI / 180;
    cam.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
  })();
  const tween = (ms, fn) => new Promise((res) => { const t0 = performance.now(); (function step() { const t = Math.min(1, (performance.now() - t0) / ms); fn(t); if (t < 1 && alive) requestAnimationFrame(step); else res(); })(); });

  canvas.classList.add('on');
  await ui.veil(false);
  ui.text('당신이 걸은 길', walkers > 1 ? '따뜻한 선이 당신, 나머지는 먼저 걸은 사람들입니다 · 굵을수록 여러 번 지나간 길' : '아직 이 기억을 걸은 사람은 당신뿐입니다');
  await tween(Math.max(2400, mineSegs.length * 900), (t) => { reveal = t * (mineSegs.length + 1); });
  await ui.buttons([{ id: 'flat', label: '눕힌다' }]);

  // ── 2. laid flat ─────────────────────────────────────────────────────────
  ui.text('', '');
  await tween(7000, (t) => { flat = ease(t); camT = t; });
  ui.text('눕히면 지도가 됩니다', '겹쳐 밟힌 자리는 닳습니다');
  await tween(4200, (t) => { mapPlane.material.opacity = 0.9 * ease(t); for (const x of tubes) x.m.material.opacity = 0.62 - 0.42 * ease(t); });
  await ui.buttons([{ id: 'down', label: '내려간다' }]);

  // ── 3. the ground ────────────────────────────────────────────────────────
  ui.text('', '');
  await ui.veil(true);
  alive = false; canvas.classList.remove('on'); window.removeEventListener('resize', resize);
  renderer.dispose();

  const T = window.TemAfStrataTerrain;
  const plain = { G: fields.G, SZ: fields.SZ, H2: fields.H2, hts: Array.from(fields.hts), cls: Array.from(fields.cls), minH: fields.minH, maxH: fields.maxH };
  window.TemReplayTerrain = { isEnabled: () => true, computeFields: () => ({ G: plain.G, SZ: plain.SZ, H2: plain.H2, hts: plain.hts.slice(), cls: plain.cls.slice(), minH: plain.minH, maxH: plain.maxH }) };
  const rt = T.createStrataTerrain(THREE, o.terrainCanvas, { clearColor: 0x08080c, fogColor: 0x08080c, fogDensity: 0.0075 });
  rt.init(); rt.setP([]); rt.buildTerrain(null);
  const ts = rt.getScene();
  ts.add(new THREE.HemisphereLight(0x8090c0, 0x201810, 0.5));
  const moon = new THREE.DirectionalLight(0xc8d4ff, 0.45); moon.position.set(-40, 55, -25); ts.add(moon);
  const gH = (x, z) => rt.gH(x, z);
  // threads lying on the ground: the others (pale), this run (warm)
  const groundLine = (a, b, color, opacity, lift) => {
    const A = toWorld(pos.get(a)), B = toWorld(pos.get(b)), pts = [];
    for (let i = 0; i <= 28; i++) { const t = i / 28, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t; pts.push(new THREE.Vector3(x, gH(x, z) + lift, z)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity, fog: true }));
    ts.add(l); return l;
  };
  for (const [k, e] of net.edges) if (!myEdges.has(k) || e.w > countMine(o.myPath, e.a, e.b)) groundLine(e.a, e.b, 0xaab0c0, 0.16 + 0.34 * Math.sqrt(e.w / maxW), 0.12);
  for (const s of mineSegs) groundLine(s.a, s.b, WARM, 0.85, 0.2);
  // a small light and a word where each room was
  const pins = [];
  for (const id of net.nodes) {
    const w = toWorld(pos.get(id)), y = gH(w.x, w.z), mine = mineSet.has(id);
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(mine ? 0.42 : 0.3), new THREE.MeshBasicMaterial({ color: mine ? WARM : 0xb8bfd0, transparent: true, opacity: mine ? 0.95 : 0.6 }));
    m.position.set(w.x, y + 1.5, w.z); ts.add(m);
    const lamp = new THREE.PointLight(mine ? WARM : 0x8fa0c8, mine ? 0.9 : 0.45, 14, 2); lamp.position.set(w.x, y + 1.8, w.z); ts.add(lamp);
    const sp = labelSprite(THREE, o.labelOf(sceneOf.get(id)), mine ? '#e6d2ae' : '#aeb4c2', 40); sp.scale.set(1.25 * sp.userData.aspect, 1.25, 1); sp.position.set(w.x, y + 3.0, w.z); ts.add(sp);
    pins.push({ id, x: w.x, z: w.z, m, baseY: y + 1.5 });
  }
  // first from above, the whole ground; "걷는다" puts the walker down at the last room
  const last = toWorld(pos.get(o.myPath[o.myPath.length - 1]));
  const ctl = rt.getControls(), tcam = rt.getCamera();
  const overview = () => { ctl.target.set(0, gH(0, 0), 0); tcam.position.set(0, gH(0, 0) + 58, 66); tcam.lookAt(ctl.target); ctl.update && ctl.update(); };
  overview();
  o.terrainCanvas.classList.add('on');
  window._fpPlayActive = true;
  let near = null, nearIdx = 0, nearAt = 0, tAlive = true;
  const tclock = new THREE.Clock();
  (function tloop() {
    if (!tAlive) return;
    requestAnimationFrame(tloop);
    rt.tick();
    const time = tclock.getElapsedTime(), c = rt.getCamera().position;
    for (const p of pins) { p.m.position.y = p.baseY + 0.18 * Math.sin(time * 0.5 + p.x); p.m.rotation.y = time * 0.15; }
    // near a room: one line someone left there (changes slowly)
    let best = null, bd = 7.5;
    for (const p of pins) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = p; } }
    if ((best && best.id) !== (near && near.id)) { near = best; nearIdx = 0; nearAt = 0; }
    if (near && time - nearAt > 9) {
      const lines = o.linesFor(near.id);
      if (lines.length) { const L = lines[nearIdx % lines.length]; ui.trace(o.labelOf(sceneOf.get(near.id)), L.text, L.mine ? '당신이 둔 말' : '누군가 여기 두고 간 말'); nearIdx++; }
      else ui.trace(o.labelOf(sceneOf.get(near.id)), '', '');
      nearAt = time;
    }
    if (!near) ui.trace('', '', '');
  })();
  const onResize = () => rt.resize(); window.addEventListener('resize', onResize);
  await ui.veil(false);
  ui.text('닳은 자리가 사람들이 지나간 길입니다', walkers > 1 ? '불빛 가까이 가면 누군가 두고 간 말이 떠오릅니다' : '다음 사람이 걸으면 이 땅은 달라집니다');
  await wait(600);
  for (;;) {
    const id = await ui.buttons([{ id: 'walk', label: '걷는다' }, { id: 'leave', label: '나간다' }]);
    if (id === 'leave') break;
    ui.text('', 'W A S D 로 걷고 마우스로 둘러봅니다 · Esc 를 누르면 멈춥니다');
    ctl.target.set(last.x, gH(last.x, last.z), last.z);
    try { rt.enterFirstPerson(); o.terrainCanvas.requestPointerLock && o.terrainCanvas.requestPointerLock(); } catch (_) { /* the next click locks */ }
    await new Promise((res) => { const iv = setInterval(() => { if (!rt.isFirstPerson()) { clearInterval(iv); res(); } }, 300); });
    overview();
    ui.text('', '');
  }
  await ui.veil(true);
  tAlive = false; window.removeEventListener('resize', onResize);
  return { nodes: net.nodes.length, edges: net.edges.size, walks: net.walks, walkers, flatness: +frame.flatness.toFixed(3) };
}

function countMine(path, a, b) { let n = 0; for (let i = 1; i < path.length; i++) if ((path[i - 1] === a && path[i] === b) || (path[i - 1] === b && path[i] === a)) n++; return n; }

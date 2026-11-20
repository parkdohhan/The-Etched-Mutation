/**
 * Room-play "way" (길, 2026-11-20) — the short stretch between the text room and the door.
 *
 * Not the corridor. The way is what the scene leaves behind. The door stands where it appeared in
 * the room and is never moved: the way is drawn to it as it is — a curve in perspective, wide at the
 * reader's feet and thin at the door, climbing or sinking if the door stands high or low. It is
 * drawn in the door's own letters (═ for its edges, ░ for its floor). On the walker's first step
 * the picture becomes a place. Forward only. Beside the way stand the things of the scene that was
 * just read; some answer a click, some do not. The door is the ASCII door of the opening. Past it
 * the corridor (pattern -> geometry) goes on as before.
 *
 * Decision record: docs/글방_통로_무대_결정-261117.md §8.  Switch: room-play.html?way=1
 * Requires the three.js r128 global build (window.THREE). GLTFLoader is optional (models only).
 */
import { drawAsciiDoor, DOOR_ASPECT } from './asciidoor.js';

// staging values (free parameters — not definitions; tuned on screen)
const FOV = 50, EYE = 1.6;
const WALK = 1.9, STRIDE = 1.0;        // 261120: brisker than the corridor (1.15 / 0.72) — the way is short; the door is not moved, so the same picture is crossed sooner
const DOOR_H = 2.3;                    // the drawn door, frame included
const END_HALF = 0.62;                 // half width of the way where it meets the door
const SWING = 0.46;                    // how far the curve's handles reach (share of the straight distance)
const EDGE_W = 0.15, FLOOR_TILE = 0.21;
const SEG = 64;
const DRAW_S = 3.0, FLOOR_S = [1.6, 4.4], COME_S = 1.6;   // edges, floor, the turn into a place
const BG = 0x050507;                   // = --rp-bg, so the canvas has no edge against the page
const AMBER = 'rgba(196,168,130,0.95)';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const h01 = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

export function createWay(opts) {
  const THREE = window.THREE;
  if (!THREE) throw new Error('three.js r128 global build is required');
  const canvas = opts.canvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(BG);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.05, 80);
  cam.rotation.order = 'YXZ';
  const ambient = new THREE.AmbientLight(0xa4a4b0, 0); scene.add(ambient);
  const walkerLight = new THREE.PointLight(0xffffff, 0, 11, 2); scene.add(walkerLight);
  const world = new THREE.Group(); scene.add(world);
  const ray = new THREE.Raycaster();

  let W = null, spec = null, cb = {}, active = false, raf = 0, last = 0, resolveArrive = null;
  const fp = { s: 0, yaw: 0, tilt: 0, yawOff: 0, pitch: 0, keys: {}, forward: false, walkUntil: 0, stepAcc: 0, bob: 0 };

  // one letter as a repeating tile (the way is written in the door's letters)
  const tiles = {};
  function tile(ch, color) {
    const key = ch + color;
    if (tiles[key]) return tiles[key];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.font = '64px "SFMono-Regular", Menlo, Consolas, "Courier New", monospace';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color;
    x.translate(32, 32); x.scale(1 / 0.6, 1); x.fillText(ch, 0, 2);      // a cell is 0.6 wide: stretched to the square so neighbours join
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return (tiles[key] = t);
  }

  // footsteps: the same sample the corridor uses (three steps in one file)
  const steps = (() => {
    let ctx = null, buf = null, n = 0;
    function ensure() {
      if (ctx) { if (ctx.state !== 'running') { try { ctx.resume(); } catch (_) {} } return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        fetch('sounds/footstep_on_dirt.mp3').then((r) => r.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab)).then((b) => { buf = b; }).catch(() => {});
      } catch (_) {}
    }
    function play() {
      if (!ctx || !buf) return;
      const third = buf.duration / 3, k = n % 3, rate = [0.95, 1.02, 0.98, 1.05, 1.0][n % 5]; n++;
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
      const g = ctx.createGain(), now = ctx.currentTime, dur = Math.max(0.08, third / rate * 0.95);
      g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.42, now + 0.008); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(g); g.connect(ctx.destination); src.start(now, k * third, dur + 0.02);
    }
    return { ensure, play };
  })();

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  /** The ray from the reader's seat through a screen point. */
  function rayAt(px, py) {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    return new THREE.Vector3((px / w) * 2 - 1, -(py / h) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
  }
  function ground(px, py) {
    const d = rayAt(px, py);
    if (d.y > -1e-3) return null;
    const t = -cam.position.y / d.y;
    return new THREE.Vector3(cam.position.x + d.x * t, 0, cam.position.z + d.z * t);
  }
  /**
   * A strip between two rows of points (a[i] .. b[i]), textured: u runs along, v across (va .. vb).
   * Drawn progressively with setDrawRange.
   */
  function strip(a, b, mat, lift, uv, shade) {
    const n = a.length, pos = new Float32Array(n * 6), tex = new Float32Array(n * 4), col = shade ? new Float32Array(n * 6) : null, idx = [];
    for (let i = 0; i < n; i++) {
      pos.set([a[i].x, a[i].y + lift, a[i].z, b[i].x, b[i].y + lift, b[i].z], i * 6);
      const q = uv(i); tex.set([q.u, q.va, q.u, q.vb], i * 4);
      if (col) { const k = shade(i / (n - 1)); col.set([k, k, k, k, k, k], i * 6); }
      if (i < n - 1) { const p = i * 2; idx.push(p, p + 1, p + 3, p, p + 3, p + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(tex, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
    return m;
  }
  function textPlane(text, size) {
    const c = document.createElement('canvas'), x = c.getContext('2d'), px = 72;
    const font = '300 ' + px + 'px "Noto Serif KR", serif';
    x.font = font;
    const tw = Math.ceil(x.measureText(text).width) + 24;
    c.width = Math.min(2048, tw); c.height = px * 1.5;
    x.font = font; x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'center';
    x.fillText(text, c.width / 2, c.height / 2, c.width - 12);
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    const hM = size, wM = hM * (c.width / c.height);
    return new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  }
  function setOpacity(obj, o, tint) {
    obj.traverse((n) => {
      if (!n.material || n.userData.pickOnly) return;
      const ms = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of ms) { m.transparent = true; m.opacity = o; if (tint != null && m.userData.base) m.color.copy(m.userData.base).multiplyScalar(tint); }
    });
  }

  function build(sp) {
    while (world.children.length) world.remove(world.children[0]);
    resize();
    cam.position.set(0, EYE, 0); cam.rotation.set(0, 0, 0); cam.updateMatrixWorld(true);
    const h = canvas.clientHeight || innerHeight, w = canvas.clientWidth || innerWidth, half = Math.tan(FOV * Math.PI / 360);
    // the near end of the way = the bottom corners of the text frame (the column's faded edges are left out)
    const fr = sp.frame, inset = (fr.right - fr.left) * 0.09, py = Math.min(fr.bottom, h) - 1;
    const NL = ground(fr.left + inset, py) || new THREE.Vector3(-1, 0, -3.4), NR = ground(fr.right - inset, py) || new THREE.Vector3(1, 0, -3.4);
    const zN = -NL.z, wN = (NR.x - NL.x) / 2, N = new THREE.Vector3((NL.x + NR.x) / 2, 0, -zN);
    // the far end = the door exactly where it stands on the page: as far away as its size says, as high as it stands
    const dr = sp.door || { cx: w * 0.76, bottom: h * 0.68, h: h * 0.25 };
    const depth = Math.max(5.5, Math.min(18, DOOR_H / (2 * half) * (h / Math.max(40, dr.h))));
    const rv = rayAt(dr.cx, dr.bottom), D = cam.position.clone().addScaledVector(rv, depth / Math.max(0.2, -rv.z));
    const e = new THREE.Vector3(D.x, 0, D.z).normalize();                     // the door faces the reader's seat, as it did on the page
    // the centre line: straight out from under the frame, swinging to the side, rising or sinking, straightening into the door
    const L = D.clone().sub(N).length();
    const curve = new THREE.CubicBezierCurve3(N, N.clone().add(new THREE.Vector3(0, 0, -L * SWING)), D.clone().addScaledVector(e, -L * SWING * 0.62), D);
    const pts = curve.getSpacedPoints(SEG), tan = [], slopes = [], along = [0], left = [], right = [], eL = [], eR = [], hws = [];
    for (let i = 0; i <= SEG; i++) {
      const t3 = curve.getTangentAt(i / SEG), t = new THREE.Vector3(t3.x, 0, t3.z).normalize();
      tan.push(t); slopes.push(t3.y / Math.max(1e-3, Math.hypot(t3.x, t3.z)));
      if (i > 0) along.push(along[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const r = new THREE.Vector3(-t.z, 0, t.x), hw = wN + (END_HALF - wN) * smooth(0, 1, i / SEG); hws.push(hw);
      left.push(pts[i].clone().addScaledVector(r, -hw)); right.push(pts[i].clone().addScaledVector(r, hw));
      eL.push(pts[i].clone().addScaledVector(r, -hw - EDGE_W)); eR.push(pts[i].clone().addScaledVector(r, hw + EDGE_W));
    }
    // the floor (░) and its two edges (═), in the door's letters and the door's colour
    const floorMat = new THREE.MeshBasicMaterial({ map: tile('░', 'rgba(226,214,196,1)'), vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const edgeMat = new THREE.MeshBasicMaterial({ map: tile('═', AMBER), transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    const floor = strip(left, right, floorMat, 0, (i) => ({ u: along[i] / FLOOR_TILE, va: 0.5 - hws[i] / FLOOR_TILE, vb: 0.5 + hws[i] / FLOOR_TILE }), (u) => 1 - 0.45 * u);
    const edges = [strip(eL, left, edgeMat, 0.012, (i) => ({ u: along[i] / EDGE_W, va: 0, vb: 1 })), strip(right, eR, edgeMat, 0.012, (i) => ({ u: along[i] / EDGE_W, va: 0, vb: 1 }))];
    floor.geometry.setDrawRange(0, 0); edges.forEach((m) => m.geometry.setDrawRange(0, 0));
    world.add(floor, edges[0], edges[1]);
    // behind the frame's edge (under the reader's feet): off screen until they look down
    const B = (x, z) => new THREE.Vector3(x, 0, z), bz = [1.6, -zN], bu = (i) => (i ? 0 : -(zN + 1.6));
    world.add(strip([B(NL.x, bz[0]), B(NL.x, bz[1])], [B(NR.x, bz[0]), B(NR.x, bz[1])], floorMat, 0, (i) => ({ u: bu(i) / FLOOR_TILE, va: 0.5 - wN / FLOOR_TILE, vb: 0.5 + wN / FLOOR_TILE }), () => 1));
    world.add(strip([B(NL.x - EDGE_W, bz[0]), B(NL.x - EDGE_W, bz[1])], [B(NL.x, bz[0]), B(NL.x, bz[1])], edgeMat, 0.012, (i) => ({ u: bu(i) / EDGE_W, va: 0, vb: 1 })));
    world.add(strip([B(NR.x, bz[0]), B(NR.x, bz[1])], [B(NR.x + EDGE_W, bz[0]), B(NR.x + EDGE_W, bz[1])], edgeMat, 0.012, (i) => ({ u: bu(i) / EDGE_W, va: 0, vb: 1 })));

    // the door: the ASCII door of the opening, where it has stood since it appeared
    const dc = document.createElement('canvas'); drawAsciiDoor(dc, 0, { px: 30, tone: true });
    const dtex = new THREE.CanvasTexture(dc); dtex.minFilter = THREE.LinearMipmapLinearFilter; dtex.generateMipmaps = true; dtex.anisotropy = 4;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_H * DOOR_ASPECT, DOOR_H), new THREE.MeshBasicMaterial({ map: dtex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    door.position.set(D.x, D.y + DOOR_H / 2, D.z); door.rotation.y = Math.atan2(-e.x, -e.z);
    door.userData = { open: 0, target: 0, drawn: 0, canvas: dc, tex: dtex };
    world.add(door);

    // the rail the walker goes along: straight to the frame's edge, then the curve
    const rail = [{ p: new THREE.Vector3(0, 0, 0), t: new THREE.Vector3(0, 0, -1), slope: 0, s: 0 }];
    for (let i = 0; i <= SEG; i++) rail.push({ p: pts[i], t: tan[i], slope: slopes[i], s: zN + along[i] });
    W = { N, D, e, rail, total: zN + along[SEG], floor, floorMat, edges, door, things: [], t0: performance.now(), k3d: 0, ready: false, arrived: false, clicked: [], started: 0 };

    // the things of the scene, on both sides of the way
    const at = (u) => { const i = Math.max(0, Math.min(SEG, Math.round(u * SEG))); return { p: pts[i], r: new THREE.Vector3(-tan[i].z, 0, tan[i].x), hw: hws[i] }; };
    const side0 = D.x < 0 ? -1 : 1;
    const objs = (sp.things || []).filter((t) => t.kind === 'object').slice(0, 7), words = (sp.things || []).filter((t) => t.kind === 'word').slice(0, 5);
    objs.forEach((t, i) => {
      const q = at(0.16 + 0.7 * ((i + 0.5) / objs.length)), side = (i % 2 ? 1 : -1) * side0;
      const pos = q.p.clone().addScaledVector(q.r, side * (q.hw + 1.25 + 0.8 * h01(t.id + 'l')));
      const g = new THREE.Group(); g.position.copy(pos); world.add(g);
      const th = { t, group: g, pick: null, billboard: false, phase: h01(t.id) * 6.28 };
      const label = () => { const m = textPlane(t.name, 0.34); m.position.y = 1.32; g.add(m); th.pick = m; th.billboard = true; };
      if (t.image) {
        new THREE.TextureLoader().load(t.image, (tex) => {
          const hM = 1.3, wM = hM * (tex.image.width / tex.image.height);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
          m.material.userData.base = new THREE.Color(0xffffff); m.position.y = 1.05; g.add(m); th.pick = m; th.billboard = true;
        }, undefined, label);
      } else if (t.model && THREE.GLTFLoader) {
        new THREE.GLTFLoader().load(t.model, (gl) => {
          const o = gl.scene, box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3());
          o.scale.setScalar(1.05 / Math.max(sz.x, sz.y, sz.z, 1e-3));
          const b2 = new THREE.Box3().setFromObject(o), c = b2.getCenter(new THREE.Vector3()), s2 = b2.getSize(new THREE.Vector3());
          o.position.set(-c.x, -b2.min.y, -c.z);
          o.traverse((n) => { if (n.material) { n.material = n.material.clone(); n.material.userData.base = n.material.color ? n.material.color.clone() : new THREE.Color(0xffffff); } });
          g.rotation.y = Math.atan2(-side * q.r.x, -side * q.r.z);              // turned toward the way
          g.add(o);
          const pick = new THREE.Mesh(new THREE.BoxGeometry(s2.x + 0.2, s2.y + 0.2, s2.z + 0.2), new THREE.MeshBasicMaterial({ visible: false }));
          pick.userData.pickOnly = true; pick.position.y = s2.y / 2; g.add(pick); th.pick = pick;
        }, undefined, label);
      } else label();
      W.things.push(th);
    });
    words.forEach((t, i) => {
      const q = at(0.08 + 0.84 * ((i + 0.5) / words.length)), side = (i % 2 ? -1 : 1) * side0;
      const pos = q.p.clone().addScaledVector(q.r, side * (q.hw + 3.1 + 2.2 * h01(t.id + 'w')));
      const m = textPlane(t.name, 0.24); m.position.set(pos.x, pos.y + 1.15 + 1.3 * h01(t.id + 'y'), pos.z); world.add(m);
      W.things.push({ t, group: m, pick: null, billboard: true, phase: 0, scenery: true });
    });
    return W;
  }

  function place(dt) {
    const s = Math.max(0, fp.s), r = W.rail;
    let i = 1; while (i < r.length - 1 && r[i].s < s) i++;
    const a = r[i - 1], b = r[i], k = b.s > a.s ? Math.max(0, (s - a.s) / (b.s - a.s)) : 0, kc = Math.min(1, k);   // past the door: on along its tangent
    const x = a.p.x + (b.p.x - a.p.x) * k, z = a.p.z + (b.p.z - a.p.z) * k, y = a.p.y + (b.p.y - a.p.y) * kc;
    const tx = a.t.x + (b.t.x - a.t.x) * kc, tz = a.t.z + (b.t.z - a.t.z) * kc, slope = a.slope + (b.slope - a.slope) * kc;
    const ease = 1 - Math.exp(-dt / 0.7);                                     // the head follows the way, late and heavy
    let d = Math.atan2(-tx, -tz) - fp.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    fp.yaw += d * ease; fp.tilt += (Math.atan(slope) * 0.55 - fp.tilt) * ease;
    cam.position.set(x, y + EYE + Math.sin(fp.bob) * 0.022, z);
    cam.rotation.set(fp.pitch + fp.tilt, fp.yaw + fp.yawOff, 0);
    walkerLight.position.copy(cam.position);
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!active || !W) return;
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const speed = spec.speed || 1, age = (now - W.t0) / 1000 * speed;
    // the edges are written out toward the door, the floor follows them
    W.edges.forEach((m) => m.geometry.setDrawRange(0, Math.floor(smooth(0, DRAW_S, age) * SEG) * 6));
    W.floor.geometry.setDrawRange(0, Math.floor(smooth(FLOOR_S[0], FLOOR_S[1], age) * SEG) * 6);
    W.floorMat.opacity = 0.78 * smooth(FLOOR_S[0], FLOOR_S[0] + 1.2, age);
    if (!W.ready && age >= DRAW_S) { W.ready = true; if (cb.onReady) cb.onReady(); }
    // walking: forward only
    const want = W.ready && (fp.keys.w || fp.keys.arrowup || fp.forward || now < fp.walkUntil);
    let moved = 0;
    if (want) {
      if (!W.started) { W.started = now; steps.ensure(); if (cb.on3d) cb.on3d(); }
      const limit = W.door.userData.open >= 0.6 ? W.total + 0.7 : W.total - 0.6;
      const ns = Math.min(limit, fp.s + WALK * speed * dt);
      moved = Math.max(0, ns - fp.s); fp.s = Math.max(fp.s, ns);
    }
    if (moved > 1e-5) { fp.bob += moved * (2 * Math.PI / STRIDE); fp.stepAcc += moved; if (fp.stepAcc >= STRIDE) { fp.stepAcc -= STRIDE; steps.play(); } }
    // the first step turns the drawing into a place
    if (W.started) W.k3d = smooth(0, COME_S, (now - W.started) / 1000 * speed);
    ambient.intensity = 0.85 * W.k3d; walkerLight.intensity = 1.0 * W.k3d;
    // the door stands in the picture once the walker moves (until then the page's own door is shown, in the same place), and opens when they are near
    const d = W.door, du = d.userData;
    d.material.opacity = W.k3d;
    if (W.total - fp.s < 2.2) du.target = 1;
    du.open += (du.target - du.open) * (1 - Math.exp(-dt * speed / 0.9));
    const q = Math.round(du.open * 24) / 24;
    if (q !== du.drawn) { du.drawn = q; drawAsciiDoor(du.canvas, q, { px: 30, tone: true }); du.tex.needsUpdate = true; }
    place(dt * speed);
    // things: the ones the talk reached stand lit, the others stay dim and silent
    for (const th of W.things) {
      const lit = th.scenery ? 0.3 : th.t.unlocked ? 1 : 0.24;
      const breath = (!th.scenery && th.t.unlocked) ? 0.9 + 0.1 * Math.sin(now / 2600 + th.phase) : 1;
      setOpacity(th.group, lit * breath * W.k3d, th.t.unlocked || th.scenery ? 1 : 0.4);
      if (th.billboard) {
        const o = th.scenery ? th.group : th.pick, c = th.group.position;
        if (o) o.rotation.y = Math.atan2(cam.position.x - c.x, cam.position.z - c.z);
      }
    }
    renderer.render(scene, cam);
    if (!W.arrived && fp.s >= W.total + 0.6) {
      W.arrived = true;
      const r = resolveArrive; resolveArrive = null;
      if (r) r({ length: +W.total.toFixed(2), rise: +W.D.y.toFixed(2), seconds: +((now - (W.started || now)) / 1000).toFixed(1), clicked: W.clicked.slice(), things: W.things.filter((t) => !t.scenery).length, unlocked: W.things.filter((t) => !t.scenery && t.t.unlocked).length });
    }
  }

  function thingAt(e) {
    if (!W || W.k3d < 0.5) return null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, cam);
    let best = null, bd = Infinity;
    for (const th of W.things) {
      if (th.scenery || !th.pick || !th.t.unlocked) continue;
      const hit = ray.intersectObject(th.pick, false)[0];
      if (hit && hit.distance < bd) { bd = hit.distance; best = th; }
    }
    return best;
  }
  function touch(th) {
    if (!th) return;
    if (!W.clicked.includes(th.t.name)) W.clicked.push(th.t.name);
    if (cb.onLine) cb.onLine(th.t);
  }

  const keyOf = (e) => (/^Key[A-Z]$/.test(e.code || '') ? e.code.slice(3).toLowerCase() : String(e.key).toLowerCase());
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (!active) return; drag = { x: e.clientX, y: e.clientY, moved: 0 }; steps.ensure(); });
  window.addEventListener('pointerup', (e) => { if (active && drag && drag.moved < 6) touch(thingAt(e)); drag = null; });
  window.addEventListener('pointermove', (e) => {
    if (!active) return;
    if (!drag) { canvas.style.cursor = thingAt(e) ? 'pointer' : ''; return; }
    const mx = e.clientX - drag.x, my = e.clientY - drag.y;
    drag.moved += Math.abs(mx) + Math.abs(my);
    fp.yawOff = Math.max(-2.7, Math.min(2.7, fp.yawOff - mx * 0.004)); fp.pitch = Math.max(-0.8, Math.min(0.6, fp.pitch - my * 0.003));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  window.addEventListener('keydown', (e) => { if (!active) return; if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return; fp.keys[keyOf(e)] = true; steps.ensure(); });
  window.addEventListener('keyup', (e) => { fp.keys[keyOf(e)] = false; fp.keys[String(e.key).toLowerCase()] = false; });
  window.addEventListener('resize', () => { if (active) resize(); });

  return {
    /**
     * Draw the way and hand it to the walker. Resolves when they have gone through the door.
     * @param sp { door: { cx, bottom, h } (the door on the page, in pixels — it is not moved), frame: {left,right,bottom}, floor, speed,
     *             things: [{ id, name, kind:'object'|'word', line, unlocked, model, image }] }
     * @param handlers { onReady(), on3d(), onLine(thing) }
     */
    start(sp, handlers) {
      spec = Object.assign({ speed: 1, things: [] }, sp); cb = handlers || {};
      Object.assign(fp, { s: 0, yaw: 0, tilt: 0, yawOff: 0, pitch: 0, keys: {}, forward: false, walkUntil: 0, stepAcc: 0, bob: 0 });
      ambient.intensity = walkerLight.intensity = 0;
      build(spec);
      active = true; last = performance.now();
      renderer.render(scene, cam);
      if (!raf) frame();
      return new Promise((res) => { resolveArrive = res; });
    },
    stop() { active = false; fp.keys = {}; fp.forward = false; canvas.style.cursor = ''; },
    setForward(on) { if (!active) return; fp.forward = !!on; if (on) steps.ensure(); },
    /** Automation: walk forward for `seconds`. */
    walk(seconds) { fp.walkUntil = performance.now() + seconds * 1000; },
    /** Automation: answer as if the named thing had been clicked. */
    click(name) { const th = W && W.things.find((x) => !x.scenery && x.t.name === name && x.t.unlocked); touch(th); return !!th; },
    look(yaw, pitch) { fp.yawOff = yaw || 0; fp.pitch = pitch || 0; },
    state() { return W ? { active, ready: W.ready, s: +fp.s.toFixed(2), total: +W.total.toFixed(2), rise: +W.D.y.toFixed(2), k3d: +W.k3d.toFixed(2), doorOpen: +W.door.userData.open.toFixed(2), arrived: W.arrived, things: W.things.map((t) => ({ name: t.t.name, kind: t.t.kind, unlocked: !!t.t.unlocked, loaded: !!(t.pick || t.scenery) })) } : { active }; },
  };
}

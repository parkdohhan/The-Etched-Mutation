/**
 * Space-play things (2026-11-21) — one line sculpture for each scene of a memory.
 *
 * The grammar is the one made for one-walk.html: dark faces, bright edges, amber for what the walker
 * brings, a dimmer line for what recedes. Nothing here is a 3D asset; every thing is drawn in code.
 * No sentence of a manuscript is stored in this file, and the notes beside each thing say only what is drawn.
 *
 * makeThing(memoryCode, scene) -> { g, h, tick(time, dt), setAsked(on) }
 *   g     the group, standing on y = 0 (the stage lifts it so it floats around its own middle)
 *   h     how tall it stands
 *   tick  its own slow movement (a shimmer, a ring, drifting sheets)
 *   setAsked(true) redraws every line as a dashed one: the walker put a question to this scene
 *
 * Requires the three.js r128 global build (window.THREE).
 */
const THREE = window.THREE;

export const C = { line: 0xcdd6e0, dimline: 0x6f7a87, amber: 0xffb057, blue: 0x6f9bd1, rust: 0xa9764a, fill: 0x030406 };
const lineMat = (color) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 });
export const M = {
  line: lineMat(C.line), dim: lineMat(C.dimline), amber: lineMat(C.amber), blue: lineMat(C.blue), rust: lineMat(C.rust),
  fill: new THREE.MeshBasicMaterial({ color: C.fill, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide }),
};
// the same lines, broken: a scene the walker asked a question of (see setAsked)
const dashedOf = new Map();
function dashed(mat) {
  if (!dashedOf.has(mat)) dashedOf.set(mat, new THREE.LineDashedMaterial({ color: mat.color.getHex(), dashSize: 0.11, gapSize: 0.085, transparent: true, opacity: 1 }));
  return dashedOf.get(mat);
}

function solid(geom, mat, thr) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geom, M.fill));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, thr === undefined ? 20 : thr), mat || M.line));
  return g;
}
const box = (w, h, d, mat) => solid(new THREE.BoxGeometry(w, h, d), mat);
const put = (o, x, y, z) => { o.position.set(x, y, z); return o; };
/** A polyline. A closed one repeats its first point (no LineLoop: a dashed loop would smear on its last side). */
function stroke(pts, mat, closed) {
  const v = pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  if (closed) v.push(v[0].clone());
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(v), mat || M.line);
}
function oval(rx, rz, mat, n) {
  const pts = [], k = n || 40;
  for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; pts.push([Math.cos(a) * rx, 0, Math.sin(a) * rz]); }
  return stroke(pts, mat, true);
}
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (_glowTex = new THREE.CanvasTexture(cv));
}
function glow(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: opacity === undefined ? 0.7 : opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
  s.scale.set(size, size, 1); s.userData.keep = true; return s;
}
// a ring that comes and goes (the same beat as one-walk.html)
const ringing = (t) => (t % 3.4) < 1.3;

// a face in profile drawn as one continuous line (the path of one-walk.html, stood upright)
const PROFILE = [[-0.32, 0.90], [-0.06, 1.01], [0.22, 0.97], [0.40, 0.84], [0.46, 0.68], [0.425, 0.565], [0.50, 0.50], [0.59, 0.40], [0.70, 0.285], [0.545, 0.235],
  [0.51, 0.18], [0.57, 0.125], [0.49, 0.085], [0.555, 0.03], [0.48, -0.04], [0.52, -0.15], [0.40, -0.26], [0.16, -0.22], [-0.10, -0.06], [-0.19, 0.16], [-0.12, 0.36], [0.06, 0.42], [0.22, 0.385], [0.31, 0.31]];
function profile(scale, mirror, mat) {
  const s = mirror ? -1 : 1, g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(PROFILE.map((p) => new THREE.Vector3((p[0] - 0.24) * scale * s, (p[1] + 0.26) * scale, 0)), false, 'centripetal');
  const pts = curve.getPoints(180), cut = Math.floor(pts.length * 0.9);
  g.add(stroke(pts.slice(0, cut + 1), mat || M.line), stroke(pts.slice(cut), M.amber));   // its last stretch in amber
  return g;
}
const GARMENT = [[-0.42, 0.57], [0.42, 0.57], [0.36, 0.32], [0.12, 0.12], [0.07, 0], [-0.07, 0], [-0.12, 0.12], [-0.36, 0.32]];
const garment = (mat, y) => stroke(GARMENT.map((p) => [p[0], p[1] + y, 0]), mat, true);

// ── a thing drawn from a recipe (2026-11-23) ────────────────────────────────
// A memory made in record-space.html has no hand-drawn set here: its scene carries a recipe in scenes.meta.space.thing,
// written by the generate-scene-thing function in this file's own grammar (decision: docs/우주무대_기억만들기_결정-261123.md).
// Recipe v1 = { v:1, h, note, parts:[…], motion:[…] }. Every number is clamped here as well as on the server, so a
// broken recipe gives a plain thing and never a broken stage. The same rules live in the function (sanitizeRecipe).
const R_MATS = new Set(['line', 'dim', 'amber', 'blue', 'rust']);
const R_GLOW = { amber: C.amber, blue: C.blue, line: C.line, rust: C.rust, white: 0xffffff, dim: C.dimline };
const R_MAX_PARTS = 28, R_MAX_PTS = 64, R_MAX_MOTION = 12;
const rNum = (x, lo, hi, d) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const rVec = (x, lo, hi, yLo) => { const a = Array.isArray(x) ? x : []; return [rNum(a[0], lo, hi, 0), rNum(a[1], yLo === undefined ? lo : yLo, hi, 0), rNum(a[2], lo, hi, 0)]; };
const rMat = (x) => (typeof x === 'string' && R_MATS.has(x) ? x : 'line');
/** The recipe with every value inside its bounds, or null when nothing in it can be drawn. */
export function sanitizeRecipe(r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.parts)) return null;
  const parts = [];
  for (const p of r.parts.slice(0, R_MAX_PARTS)) {
    if (!p || typeof p !== 'object' || typeof p.k !== 'string') continue;
    const at = rVec(p.at, -5, 5, -0.5), rot = rVec(p.rot, -7, 7), m = rMat(p.m);
    switch (p.k) {
      case 'box': { const s = Array.isArray(p.size) ? p.size : []; parts.push({ k: 'box', size: [rNum(s[0], 0.03, 4.5, 0.5), rNum(s[1], 0.03, 4.5, 0.5), rNum(s[2], 0.03, 4.5, 0.5)], at, rot, m }); break; }
      case 'cyl': { const rr = Array.isArray(p.r) ? p.r : [p.r, p.r]; parts.push({ k: 'cyl', r: [rNum(rr[0], 0, 2.5, 0.2), rNum(rr[1], 0, 2.5, 0.3)], h: rNum(p.h, 0.05, 4.5, 1), n: Math.round(rNum(p.n, 3, 24, 8)), at, rot, m }); break; }
      case 'ico': { const sc = Array.isArray(p.scale) ? p.scale : [1, 1, 1]; parts.push({ k: 'ico', r: rNum(p.r, 0.03, 2.5, 0.3), detail: rNum(p.detail, 0, 1, 0) >= 0.5 ? 1 : 0, scale: [rNum(sc[0], 0.05, 4, 1), rNum(sc[1], 0.05, 4, 1), rNum(sc[2], 0.05, 4, 1)], at, rot, m }); break; }
      case 'cone': parts.push({ k: 'cone', r: rNum(p.r, 0.03, 2.5, 0.2), h: rNum(p.h, 0.05, 4.5, 0.5), n: Math.round(rNum(p.n, 3, 24, 6)), at, rot, m }); break;
      case 'stroke': { const pts = (Array.isArray(p.pts) ? p.pts : []).slice(0, R_MAX_PTS).map((q) => rVec(q, -5, 5, -0.5)); if (pts.length >= 2) parts.push({ k: 'stroke', pts, closed: !!p.closed, m }); break; }
      case 'oval': { const rr = Array.isArray(p.r) ? p.r : [p.r, p.r]; parts.push({ k: 'oval', r: [rNum(rr[0], 0.03, 3, 0.5), rNum(rr[1], 0.03, 3, 0.5)], n: Math.round(rNum(p.n, 8, 80, 40)), at, rot, m }); break; }
      case 'glow': parts.push({ k: 'glow', c: typeof p.c === 'string' && p.c in R_GLOW ? p.c : 'amber', size: rNum(p.size, 0.2, 3.5, 1.2), o: rNum(p.o, 0.05, 0.9, 0.5), at }); break;
      case 'profile': parts.push({ k: 'profile', s: rNum(p.s, 0.5, 3.5, 2), mirror: !!p.mirror, at, m }); break;
      case 'garment': parts.push({ k: 'garment', y: rNum(p.y, -0.5, 4, 1), m }); break;
      default: break;
    }
  }
  if (!parts.length) return null;
  const motion = [];
  for (const mo of (Array.isArray(r.motion) ? r.motion : []).slice(0, R_MAX_MOTION)) {
    if (!mo || typeof mo !== 'object') continue;
    const i = Math.round(rNum(mo.i, 0, parts.length - 1, -1));
    if (i < 0 || i >= parts.length || !['spin', 'bob', 'sway', 'ring', 'pulse', 'drift'].includes(mo.k)) continue;
    motion.push({ i, k: mo.k, v: rNum(mo.v, 0.01, 3, 0.4), amp: rNum(mo.amp, 0.005, 0.6, 0.08), axis: ['x', 'y', 'z'].includes(mo.axis) ? mo.axis : 'y', lo: rNum(mo.lo, 0, 1, 0.25), hi: rNum(mo.hi, 0, 1, 0.6) });
  }
  let top = 0;
  for (const p of parts) {
    if (p.k === 'stroke') for (const q of p.pts) top = Math.max(top, q[1]);
    else if (p.k === 'box') top = Math.max(top, p.at[1] + p.size[1] / 2);
    else if (p.k === 'cyl' || p.k === 'cone') top = Math.max(top, p.at[1] + p.h / 2);
    else if (p.k === 'ico') top = Math.max(top, p.at[1] + p.r * p.scale[1]);
    else if (p.k === 'profile') top = Math.max(top, p.at[1] + 1.3 * p.s);
    else if (p.k === 'garment') top = Math.max(top, p.y + 0.6);
    else top = Math.max(top, p.at[1]);
  }
  return { v: 1, h: rNum(r.h, 0.5, 4.5, Math.max(0.6, Math.min(4.5, top || 2.2))), note: String(r.note || '').slice(0, 120), parts, motion };
}
/** The thing a sanitized recipe describes: { g, h, tick? } — the same shape the hand-drawn makers return. */
export function fromRecipe(r) {
  const g = new THREE.Group(), objs = [], motions = [];
  const matOf = (m) => M[m] || M.line;
  for (const p of r.parts) {
    let o = null;
    switch (p.k) {
      case 'box': o = box(p.size[0], p.size[1], p.size[2], matOf(p.m)); break;
      case 'cyl': o = solid(new THREE.CylinderGeometry(p.r[0], p.r[1], p.h, p.n), matOf(p.m)); break;
      case 'ico': o = solid(new THREE.IcosahedronGeometry(p.r, p.detail), matOf(p.m), 1); o.scale.set(p.scale[0], p.scale[1], p.scale[2]); break;
      case 'cone': o = solid(new THREE.ConeGeometry(p.r, p.h, p.n), matOf(p.m), 1); break;
      case 'stroke': o = stroke(p.pts, matOf(p.m), p.closed); break;
      case 'oval': o = oval(p.r[0], p.r[1], matOf(p.m), p.n); break;
      case 'glow': o = glow(R_GLOW[p.c] === undefined ? C.amber : R_GLOW[p.c], p.size, p.o); break;
      case 'profile': o = profile(p.s, p.mirror, matOf(p.m)); break;
      case 'garment': o = garment(matOf(p.m), p.y); break;
      default: break;
    }
    objs.push(o);
    if (!o) continue;
    if (p.k !== 'stroke' && p.k !== 'garment') { put(o, p.at[0], p.at[1], p.at[2]); if (p.k !== 'glow') o.rotation.set(p.rot[0], p.rot[1], p.rot[2]); }
    g.add(o);
  }
  for (const mo of r.motion) {
    const o = objs[mo.i]; if (!o) continue;
    const m = { mo, o, p0: o.position.clone(), r0: o.rotation.clone(), ph: mo.i * 1.3, rad: Math.hypot(o.position.x, o.position.z), ang: Math.atan2(o.position.z, o.position.x), mats: [] };
    // a pulse brightens and dims this part only: its materials are its own copies (the M.* materials are shared by every thing)
    if (mo.k === 'pulse') o.traverse((c) => { if ((c.isSprite || c.isLine) && c.material) { c.material = c.material.clone(); c.material.transparent = true; m.mats.push(c.material); } });
    motions.push(m);
  }
  const tick = motions.length ? (t, dt) => {
    for (const m of motions) {
      const mo = m.mo, o = m.o;
      if (mo.k === 'spin') o.rotation[mo.axis] += dt * mo.v;
      else if (mo.k === 'bob') o.position.y = m.p0.y + Math.sin(t * mo.v + m.ph) * mo.amp;
      else if (mo.k === 'sway') o.rotation[mo.axis] = m.r0[mo.axis] + Math.sin(t * mo.v + m.ph) * mo.amp;
      else if (mo.k === 'ring') o.rotation.z = m.r0.z + (ringing(t) ? Math.sin(t * 70) * mo.amp : 0);
      else if (mo.k === 'pulse') { const v = ringing(t) ? mo.hi : mo.lo; for (const mt of m.mats) mt.opacity += (v - mt.opacity) * Math.min(1, dt * 3); }
      else if (mo.k === 'drift') { m.ang += dt * mo.v; o.position.x = Math.cos(m.ang) * m.rad; o.position.z = Math.sin(m.ang) * m.rad; }
    }
  } : undefined;
  return { g, h: r.h, tick };
}

// ── UNDW-001 ────────────────────────────────────────────────────────────────
// keyed by scene_order. Each returns { g, h, tick? }.
const UNDW = {
  1() {   // a tub; on its water two faint ovals that waver
    const g = new THREE.Group();
    g.add(put(box(3.3, 1.1, 1.6), 0, 0.55, 0));
    g.add(put(stroke([[-1.5, 0, -0.65], [1.5, 0, -0.65], [1.5, 0, 0.65], [-1.5, 0, 0.65]], M.dim, true), 0, 1.1, 0));
    const N = 44, rings = [0, 1].map((k) => { const l = oval(0.5, 0.36, M.dim, N); put(l, 0.55, 1.115 + k * 0.004, 0); g.add(l); return l; });
    const base = rings.map((l) => Float32Array.from(l.geometry.attributes.position.array));
    g.add(put(glow(0x9fb6cc, 1.5, 0.16), 0.55, 1.15, 0));
    return { g, h: 1.15, tick(t) {
      rings.forEach((l, k) => {
        const a = l.geometry.attributes.position.array, b = base[k];
        for (let i = 0; i <= N; i++) { const w = 1 + 0.07 * Math.sin(t * 0.9 + i * 0.55 + k * 2.1) + 0.04 * Math.sin(t * 0.37 + i * 1.3 + k); a[i * 3] = b[i * 3] * w + (k ? 0.03 : -0.02) * Math.sin(t * 0.5 + k); a[i * 3 + 2] = b[i * 3 + 2] * w; }
        l.geometry.attributes.position.needsUpdate = true;
      });
    } };
  },
  2() {   // a gate under a blue roof
    const g = new THREE.Group();
    g.add(put(box(0.28, 3, 0.28), -1.25, 1.5, 0), put(box(0.28, 3, 0.28), 1.25, 1.5, 0), put(box(2.2, 2.7, 0.08), 0, 1.35, 0));
    for (const y of [0.55, 1.35, 2.15]) g.add(stroke([[-1.1, y, 0.06], [1.1, y, 0.06]], M.dim));
    g.add(stroke([[0, 0, 0.06], [0, 2.7, 0.06]], M.dim));
    const roof = box(4.2, 0.12, 2.6, M.blue); roof.rotation.x = 0.16; g.add(put(roof, 0, 3.25, 0.2));
    return { g, h: 3.3 };
  },
  3() {   // a telephone on a stand, sheets adrift round it
    const g = new THREE.Group();
    const body = put(box(0.55, 0.2, 0.42), 0, 0.9, 0), handset = put(box(0.78, 0.1, 0.14), 0, 1.07, 0);
    g.add(put(box(1.1, 0.8, 0.8), 0, 0.4, 0), body, handset);
    g.add(put(oval(0.13, 0.13, M.dim, 16), 0, 1.005, 0.0));
    const cord = []; for (let i = 0; i <= 30; i++) { const t = i / 30; cord.push([0.4 + t * 0.5, 1.02 - t * 1.0 + Math.sin(t * 22) * 0.03, 0.2 + Math.cos(t * 22) * 0.04]); }
    g.add(stroke(cord, M.dim));
    const sheets = [];
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Group(), a = i * 1.07 + 0.4, r = 1.7 + (i % 3) * 0.75;
      f.add(stroke([[-0.3, 0, -0.4], [0.3, 0, -0.4], [0.3, 0, 0.4], [-0.3, 0, 0.4]], M.amber, true));
      f.add(put(oval(0.12, 0.15, M.amber, 14), 0, 0, -0.1));
      f.add(stroke([[-0.18, 0, 0.18], [0.18, 0, 0.18]], M.amber), stroke([[-0.18, 0, 0.27], [0.1, 0, 0.27]], M.amber));
      f.rotation.set(-1.1 + (i % 2) * 0.5, a, 0.3 * Math.sin(i));
      put(f, Math.cos(a) * r, 0.9 + (i % 4) * 0.42, Math.sin(a) * r); g.add(f); sheets.push({ o: f, y: f.position.y, ph: i * 1.3 });
    }
    return { g, h: 1.9, tick(t, dt) {
      const sh = ringing(t) ? Math.sin(t * 70) * 0.035 : 0; body.rotation.z = sh; handset.rotation.z = sh;
      for (const d of sheets) { d.o.position.y = d.y + Math.sin(t * 0.5 + d.ph) * 0.12; d.o.rotation.y += dt * 0.12; }
    } };
  },
  4() {   // two standing figures, a ring round the taller one's middle
    const g = new THREE.Group();
    g.add(put(solid(new THREE.CylinderGeometry(0.2, 0.52, 2.5, 6), M.line), 0, 1.25, 0));
    g.add(put(solid(new THREE.IcosahedronGeometry(0.24, 0), M.line, 1), 0, 2.78, 0));
    g.add(put(solid(new THREE.CylinderGeometry(0.14, 0.3, 1.15, 6), M.line), 0.55, 0.575, 0.12));
    g.add(put(solid(new THREE.IcosahedronGeometry(0.17, 0), M.line, 1), 0.5, 1.33, 0.1));
    g.add(stroke(Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return [0.14 + Math.cos(a) * 0.5, 1.05, Math.sin(a) * 0.42]; }), M.line, true));
    return { g, h: 3.0 };
  },
  5() {   // a lying animal, a loose line, a post
    const g = new THREE.Group();
    const body = solid(new THREE.IcosahedronGeometry(1, 1), M.line, 1); body.scale.set(1.25, 0.36, 0.5); g.add(put(body, 0, 0.36, 0));
    const head = solid(new THREE.IcosahedronGeometry(1, 0), M.line, 1); head.scale.set(0.38, 0.26, 0.3); g.add(put(head, 1.45, 0.26, 0.12));
    for (const z of [-0.02, 0.26]) { const ear = solid(new THREE.ConeGeometry(0.09, 0.22, 4), M.line, 1); ear.rotation.z = -0.5; g.add(put(ear, 1.3, 0.56, z)); }
    for (const x of [-0.7, 0.75]) g.add(stroke([[x, 0.25, 0.4], [x + 0.25, 0.06, 0.95], [x + 0.55, 0.05, 0.98]], M.line));
    const leash = []; for (let i = 0; i <= 40; i++) { const t = i / 40; leash.push([1.3 + t * 2.3, 0.04 + Math.sin(t * Math.PI) * 0.05, -0.2 - Math.sin(t * 7) * 0.45 * (1 - t) - t * 1.3]); }
    g.add(stroke(leash, M.dim)); g.add(put(box(0.1, 0.7, 0.1), 3.6, 0.35, -1.5));
    g.add(put(glow(C.amber, 1.1, 0.5), 1.15, 0.12, 0.98));
    return { g, h: 0.8 };
  },
  6() {   // the tub again: one clear oval on its water, a short amber stroke in it
    const g = new THREE.Group();
    g.add(put(box(3.3, 1.1, 1.6), 0, 0.55, 0));
    g.add(put(stroke([[-1.5, 0, -0.65], [1.5, 0, -0.65], [1.5, 0, 0.65], [-1.5, 0, 0.65]], M.dim, true), 0, 1.1, 0));
    const face = new THREE.Group();
    face.add(oval(0.5, 0.36, M.line));
    face.add(stroke([[0.02, 0, -0.2], [0.2, 0, -0.14], [0.27, 0, -0.02]], M.amber));
    g.add(put(face, 0.55, 1.12, 0)); g.add(put(glow(0x9fb6cc, 1.6, 0.25), 0.55, 1.15, 0));
    return { g, h: 1.15 };
  },
  7() {   // two profiles turned to each other, the same amber stroke in both
    const g = new THREE.Group();
    g.add(put(profile(2.3, false, M.line), -1.25, 0, 0), put(profile(2.3, true, M.dim), 1.25, 0, 0));
    return { g, h: 2.95 };
  },
  8() {   // a chest with one drawer open, a folded cloth beside it
    const g = new THREE.Group();
    g.add(put(box(1.9, 2.3, 0.95), 0, 1.15, 0));
    for (const [y, out] of [[0.45, 0], [1.15, 0.55], [1.85, 0]]) g.add(put(box(1.7, 0.56, 0.9 + (out ? 0.1 : 0.04)), 0, y, out + 0.03));
    g.add(put(glow(C.amber, 1.5, 0.55), 0, 1.5, 0.75));
    const fold = solid(new THREE.IcosahedronGeometry(1, 1), M.dim, 1); fold.scale.set(1.0, 0.2, 0.62); g.add(put(fold, 1.9, 0.2, 1.1));
    return { g, h: 2.35 };
  },
  9() {   // a line between two posts, one garment on it
    const g = new THREE.Group();
    g.add(put(box(0.1, 2.3, 0.1), -1.9, 1.15, 0), put(box(0.1, 2.3, 0.1), 1.9, 1.15, 0));
    const sag = []; for (let i = 0; i <= 24; i++) { const t = i / 24; sag.push([-1.9 + t * 3.8, 2.25 - Math.sin(t * Math.PI) * 0.22, 0]); }
    g.add(stroke(sag, M.dim));
    g.add(garment(M.line, 1.46), stroke([[-0.42, 1.97, 0], [0.42, 1.97, 0]], M.dim));
    return { g, h: 2.3 };
  },
  11() {  // an empty frame on a stand
    const g = new THREE.Group();
    g.add(stroke([[-0.8, 0.9, 0], [0.8, 0.9, 0], [0.8, 3.0, 0], [-0.8, 3.0, 0]], M.line, true));
    g.add(stroke([[-0.68, 1.02, 0], [0.68, 1.02, 0], [0.68, 2.88, 0], [-0.68, 2.88, 0]], M.dim, true));
    g.add(stroke([[-0.8, 0.9, 0], [-0.95, 0, 0.3]], M.dim), stroke([[0.8, 0.9, 0], [0.95, 0, 0.3]], M.dim), stroke([[0, 0.9, 0], [0, 0, -0.5]], M.dim));
    return { g, h: 3.0 };
  },
  12() {  // a drying rack, one garment in a rust line
    const g = new THREE.Group(), W = 0.85, D = 0.5, H = 1.35;
    for (const x of [-W, W]) g.add(stroke([[x, 0, -D], [x, H, D]], M.line), stroke([[x, 0, D], [x, H, -D]], M.line));
    for (let i = 0; i < 5; i++) { const z = -D + (i / 4) * 2 * D; g.add(stroke([[-W, H, z], [W, H, z]], i === 2 ? M.line : M.dim)); }
    g.add(stroke([[-W, 0, -D], [W, 0, -D]], M.dim), stroke([[-W, 0, D], [W, 0, D]], M.dim));
    g.add(garment(M.rust, H - 0.57), stroke([[-0.42, H - 0.06, 0], [0.42, H - 0.06, 0]], M.rust));
    g.add(put(glow(C.rust, 0.9, 0.3), 0, H - 0.42, 0));
    return { g, h: 1.4 };
  },
  13() {  // a small table, a lit screen lying on it
    const g = new THREE.Group();
    g.add(put(box(0.9, 0.75, 0.9), 0, 0.375, 0));
    const ph = box(0.42, 0.04, 0.82); ph.rotation.y = 0.35; g.add(put(ph, 0, 0.78, 0));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.74), new THREE.MeshBasicMaterial({ color: 0xbfd4ea, transparent: true, opacity: 0.8 }));
    scr.rotation.x = -Math.PI / 2; scr.rotation.z = 0.35; scr.userData.keep = true; g.add(put(scr, 0, 0.805, 0));
    const gl = glow(0xbfd4ea, 2.0, 0.4); g.add(put(gl, 0, 1.0, 0));
    return { g, h: 0.85, tick(t) { const v = ringing(t) ? 0.55 + 0.45 * Math.sin(t * 30) : 0.25; scr.material.opacity = v; gl.material.opacity = v * 0.5; } };
  },
};
const COMMON = {
  silent() {   // a scene without words: a ring with nothing in it
    const g = new THREE.Group();
    g.add(put(oval(2.2, 2.2, M.dim, 72), 0, 1.2, 0));
    const inner = put(oval(1.5, 1.5, M.dim, 56), 0, 1.2, 0); inner.rotation.x = 0.5; g.add(inner);
    return { g, h: 2.4, tick(t, dt) { inner.rotation.z += dt * 0.05; } };
  },
  other() { const g = new THREE.Group(); g.add(put(box(0.3, 2.2, 0.3), 0, 1.1, 0)); return { g, h: 2.2 }; },
};
const SETS = { 'UNDW-001': UNDW, 'UNDW-001-EN': UNDW };

export function isSilent(scene) { return !!(scene.void_info && scene.void_info.sceneVoid) || /^[…\s.]*$/.test(scene.text || ''); }

/** @returns { g, h, tick(time, dt), setAsked(on), asked } */
export function makeThing(memoryCode, scene) {
  const set = SETS[memoryCode] || {};
  const own = sanitizeRecipe(scene.meta && scene.meta.space && scene.meta.space.thing);   // a memory made in record-space.html: its thing is a recipe
  const make = isSilent(scene) ? COMMON.silent : (set[scene.scene_order] || (own ? () => fromRecipe(own) : COMMON.other));
  const th = make();
  const lines = [];
  th.g.traverse((o) => { if (o.isLine) { o.userData.solid = o.material; lines.push(o); } });
  const out = {
    g: th.g, h: th.h, asked: false,
    tick: th.tick || (() => {}),
    /** The walker asked a question here: every line of the thing is broken into dashes (and whole again if not). */
    setAsked(on) {
      on = !!on; if (on === out.asked) return; out.asked = on;
      for (const o of lines) {
        if (on && !o.userData.dist) { o.computeLineDistances(); o.userData.dist = true; }
        o.material = on ? dashed(o.userData.solid) : o.userData.solid;
      }
    },
  };
  return out;
}

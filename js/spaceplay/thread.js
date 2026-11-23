/**
 * Space-play thread (2026-11-23) — a walked line drawn the way the ending draws it: the opening's seven threads
 * along it, six pale and loose like fluff, the seventh amber. Made for the prologue, so that the line seen on the
 * way in (the one who walked before) and the line seen at the end (one's own) are of one kind and can be felt
 * against each other.
 *
 * The drawing is the finale's (js/spaceplay/finale.js runFinale: strands, ribbon, the frame along the line).
 * finale.js keeps its own copy for now — approved on 261123, it is not touched here beyond the hand that turns it.
 * Also here: how a walk's line is packed into the run journal (packTrack) and read back (unpackTrack), and a curve
 * through the places a walk's scenes stood (splineThrough) for walks whose line was not kept.
 *
 * Requires the three.js r128 global build (window.THREE).
 */

// the opening's seven threads (js/app/opening.js startOpeningWaveAnimation): colour, opacity, speed, amplitude, phase, frequency
export const WAVES = [
  { c: [100, 130, 150], o: 0.10, sp: 0.010, a: 80, ph: 0.0, f: 0.020 },
  { c: [120, 150, 170], o: 0.15, sp: 0.014, a: 70, ph: 0.6, f: 0.025 },
  { c: [130, 155, 175], o: 0.20, sp: 0.018, a: 60, ph: 1.2, f: 0.030 },
  { c: [140, 165, 185], o: 0.26, sp: 0.022, a: 55, ph: 1.9, f: 0.035 },
  { c: [155, 175, 195], o: 0.33, sp: 0.026, a: 45, ph: 2.6, f: 0.040 },
  { c: [170, 190, 205], o: 0.42, sp: 0.030, a: 35, ph: 3.3, f: 0.045 },
  { c: [190, 205, 215], o: 0.52, sp: 0.034, a: 28, ph: 4.0, f: 0.050 },
];
export const MINE = 6, AMBER = 0xffb057;
const X_SPAN = 2100;           // how many of the opening's "pixels" the whole thread is long (free: sets how often it undulates)
const TICK = 30;               // the opening advances its time by 0.5 a frame: 30 a second

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** The walked line, evened out: n points along it. A carry through a door counts for less length than it spans (it was not walked). */
export function resample(track, n) {
  const cum = [0];
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i]; let L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (a.k === 2 && b.k === 2) L *= 0.22;
    cum.push(cum[i - 1] + L);
  }
  const total = cum[cum.length - 1] || 1, out = new Float32Array(n * 3);
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * total;
    while (j < track.length - 1 && cum[j] < s) j++;
    const a = track[j - 1], b = track[j], k = cum[j] > cum[j - 1] ? (s - cum[j - 1]) / (cum[j] - cum[j - 1]) : 0;
    out[i * 3] = a.x + (b.x - a.x) * k; out[i * 3 + 1] = a.y + (b.y - a.y) * k; out[i * 3 + 2] = a.z + (b.z - a.z) * k;
  }
  for (let pass = 0; pass < 3; pass++) {                                    // the hand's small shakes are taken out; the turns stay
    let px = out[0], py = out[1], pz = out[2];
    for (let i = 1; i < n - 1; i++) {
      const x = out[i * 3], y = out[i * 3 + 1], z = out[i * 3 + 2];
      out[i * 3] = (px + 2 * x + out[i * 3 + 3]) / 4; out[i * 3 + 1] = (py + 2 * y + out[i * 3 + 4]) / 4; out[i * 3 + 2] = (pz + 2 * z + out[i * 3 + 5]) / 4;
      px = x; py = y; pz = z;
    }
  }
  return { pts: out, uOf: (idx) => cum[clamp(Math.round(idx), 0, cum.length - 1)] / total };
}

/**
 * A walk's line, packed for the journal: at most `n` points, one decimal, flat [x, y, z, k, x, y, z, k, …].
 * k as in cosmos.track (0 flying · 1 on a way · 2 carried through a door).
 */
export function packTrack(track, n) {
  n = n || 220;
  const src = (track || []).filter((p) => p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z));
  if (src.length < 2) return null;
  const out = [], step = Math.max(1, (src.length - 1) / (n - 1));
  for (let i = 0; i < n; i++) {
    const p = src[Math.min(src.length - 1, Math.round(i * step))];
    out.push(+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1), p.k || 0);
    if (Math.round(i * step) >= src.length - 1) break;
  }
  return { n: out.length / 4, pts: out };
}

/** The journal's packed line back as cosmos.track points. */
export function unpackTrack(packed) {
  const a = packed && Array.isArray(packed.pts) ? packed.pts : (Array.isArray(packed) ? packed : null);
  if (!a || a.length < 8) return null;
  const out = [];
  for (let i = 0; i + 3 < a.length; i += 4) out.push({ x: +a[i], y: +a[i + 1], z: +a[i + 2], t: i / 4, k: a[i + 3] | 0 });
  return out;
}

/**
 * A curve through the places a walk's scenes stood, in the order they were reached — for a walk whose own line
 * was not kept. Catmull-Rom, `per` points a span. One place: a small turn round it (as the ending does with no line).
 * @param pts [[x,y,z], …]   @returns cosmos.track points (k = 0)
 */
export function splineThrough(pts, per) {
  per = per || 28;
  const P = (pts || []).filter((p) => p && p.length >= 3 && p.every(isFinite));
  if (!P.length) return [{ x: 0, y: 0, z: 0, t: 0, k: 0 }, { x: 60, y: 0, z: 0, t: 1, k: 0 }];
  if (P.length === 1) {
    const c = P[0], out = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * 5.5; out.push({ x: c[0] + Math.cos(a) * (6 + i * 0.25), y: c[1] - 1.5 + Math.sin(a * 1.3), z: c[2] + Math.sin(a) * (6 + i * 0.25), t: i, k: 0 }); }
    return out;
  }
  const out = [], at = (i) => P[clamp(i, 0, P.length - 1)];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t, q = [0, 0, 0];
      for (let d = 0; d < 3; d++) q[d] = 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
      out.push({ x: q[0], y: q[1], z: q[2], t: out.length, k: 0 });
    }
  }
  const e = P[P.length - 1]; out.push({ x: e[0], y: e[1], z: e[2], t: out.length, k: 0 });
  return out;
}

/**
 * The line as the ending draws it. The group stands in the track's own coordinates (add it to the world, or to a
 * pivot that moves it): `center` and `radius` say where the line's middle is in those coordinates and how far it reaches.
 * tick(T, camD, k): T seconds · camD = the eye's distance from the line's middle (the fluff is sized by it) ·
 *                   k = { open: 0..1 the six loose threads risen off the line, draw: 0..1 how much of the line is drawn, fade: 0..1 }
 */
export function createThread(THREE, track, o) {
  o = o || {};
  if (!track || track.length < 2) track = splineThrough([[0, 0, 0]]);
  const N = clamp(Math.round(track.length * 0.9), 240, 1200);
  const rs = resample(track, N), Wp = rs.pts;
  const C = new THREE.Vector3(); let Rm = 1;
  for (let i = 0; i < N; i++) C.add(new THREE.Vector3(Wp[i * 3], Wp[i * 3 + 1], Wp[i * 3 + 2]).multiplyScalar(1 / N));
  for (let i = 0; i < N; i++) Rm = Math.max(Rm, Math.hypot(Wp[i * 3] - C.x, Wp[i * 3 + 1] - C.y, Wp[i * 3 + 2] - C.z));

  const group = new THREE.Group();
  const P = Wp, Nn = new Float32Array(N * 3), Bn = new Float32Array(N * 3);
  // a frame along the line, once (the line does not change): across it (n), and outward from the middle (b)
  { let lx = 1, ly = 0, lz = 0;
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(N - 1, i + 1) * 3, j = i * 3;
      let tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let rx = P[j] - C.x, ry = P[j + 1] - C.y, rz = P[j + 2] - C.z; const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
      let nx = ty * rz - tz * ry, ny = tz * rx - tx * rz, nz = tx * ry - ty * rx; const nl = Math.hypot(nx, ny, nz);
      if (nl < 0.05) { nx = lx; ny = ly; nz = lz; } else { nx /= nl; ny /= nl; nz /= nl; if (nx * lx + ny * ly + nz * lz < 0 && i > 0) { nx = -nx; ny = -ny; nz = -nz; } }
      lx = nx; ly = ny; lz = nz;
      Nn[j] = nx; Nn[j + 1] = ny; Nn[j + 2] = nz;
      Bn[j] = ny * tz - nz * ty; Bn[j + 1] = nz * tx - nx * tz; Bn[j + 2] = nx * ty - ny * tx;
    } }
  const strands = WAVES.map((w, j) => {
    const pos = new Float32Array(N * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: j === MINE ? AMBER : new THREE.Color(w.c[0] / 255, w.c[1] / 255, w.c[2] / 255), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
    const l = new THREE.Line(g, mat); l.frustumCulled = false; l.renderOrder = 20 + j; group.add(l);
    return { w, pos, g, mat, l };
  });
  // the amber thread is a ribbon: a second edge and a thin band between
  const rib = (() => {
    const pos = new Float32Array(N * 6), idx = []; for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.setDrawRange(0, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }));
    m.frustumCulled = false; m.renderOrder = 19; group.add(m);
    const e2 = new Float32Array(N * 3), g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(e2, 3)); g2.setDrawRange(0, 0);
    const l2 = new THREE.Line(g2, new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false })); l2.frustumCulled = false; l2.renderOrder = 27; group.add(l2);
    return { pos, g, m, e2, g2, l2 };
  })();

  function tick(T, camD, k) {
    const open = k.open == null ? 1 : k.open, fade = k.fade == null ? 1 : k.fade, drawn = Math.floor((k.draw == null ? 1 : k.draw) * N);
    const amp = open * camD * 0.026 * (0.82 + 0.18 * Math.sin(T * 0.045 * TICK * 0.33)), tt = T * TICK;
    strands.forEach((s, sj) => {
      const w = s.w, A = (w.a / 80) * amp, pos = s.pos;
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1), x = u * X_SPAN, j = i * 3, end = Math.min(1, u / 0.04, (1 - u) / 0.04);
        const a = (Math.sin(x * w.f + tt * w.sp + w.ph) + Math.sin(x * w.f * 0.5 + tt * w.sp * 0.6 + w.ph * 1.4) * 0.4 + Math.sin(x * w.f * 2.3 + tt * w.sp * 1.3) * 0.15
                 + Math.sin(x * w.f * 0.3 + tt * w.sp * 0.4 + w.ph * 2.1) * 0.25 + Math.sin(x * w.f * 3.7 + tt * w.sp * 1.8 + w.ph * 0.7) * 0.1) * A * end;
        const b = (Math.sin(x * w.f * 0.8 + tt * w.sp * 0.7 + w.ph * 1.9) + 0.3 * Math.sin(x * w.f * 1.9 + tt * w.sp * 1.1 + w.ph)) * A * 0.55 * end;
        pos[j] = P[j] + Nn[j] * a + Bn[j] * b; pos[j + 1] = P[j + 1] + Nn[j + 1] * a + Bn[j + 1] * b; pos[j + 2] = P[j + 2] + Nn[j + 2] * a + Bn[j + 2] * b;
      }
      s.g.attributes.position.needsUpdate = true; s.g.setDrawRange(0, drawn);
      s.mat.opacity = (sj === MINE ? 0.95 : Math.min(0.85, w.o * 1.55) * open) * fade;
    });
    const mine = strands[MINE].pos, wr = camD * 0.0042;
    for (let i = 0; i < N; i++) {
      const j = i * 3, q = i * 6, x = mine[j] + Nn[j] * wr, y = mine[j + 1] + Nn[j + 1] * wr, z = mine[j + 2] + Nn[j + 2] * wr;
      rib.pos[q] = mine[j]; rib.pos[q + 1] = mine[j + 1]; rib.pos[q + 2] = mine[j + 2]; rib.pos[q + 3] = x; rib.pos[q + 4] = y; rib.pos[q + 5] = z;
      rib.e2[j] = x; rib.e2[j + 1] = y; rib.e2[j + 2] = z;
    }
    rib.g.attributes.position.needsUpdate = true; rib.g.setDrawRange(0, Math.max(0, drawn - 1) * 6); rib.m.material.opacity = 0.2 * fade;
    rib.g2.attributes.position.needsUpdate = true; rib.g2.setDrawRange(0, drawn); rib.l2.material.opacity = 0.55 * fade;
  }
  function dispose() {
    if (group.parent) group.parent.remove(group);
    group.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
  }
  return { group, center: C, radius: Rm, N, tick, dispose, uOf: rs.uOf };
}

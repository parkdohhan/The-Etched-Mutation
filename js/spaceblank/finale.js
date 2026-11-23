/**
 * Space-blank finale — js/spaceplay/finale.js copied (2026-11-23), with one addition: in the version that goes up, a word the
 * walker took out of the memory, and the word that came into its place, are shown in the colour of whose they are (l.segs).
 *
 * Space-play finale (2026-11-21; 2026-11-23 the ball taken out, and the last scene's figure) — the walked line and its
 * loose threads, then the version that was read.
 *
 * It happens in the place itself, without a cut:
 *   1. the eye is taken up and back until the whole line the walker left is in view — every drift, every walked
 *      way, every carry through a door — and it is drawn again from its beginning, in amber. (In the walk it went
 *      out behind them; here all of it is seen once.) The scenes stand where they stood, small figures along it —
 *      except the one the walker stood at when it ended, which goes out at once (it filled the view).
 *   2. the one line opens into seven: the seven threads of the opening, with the opening's own movement
 *      (the same sum of slow sines, the same colours). Six are the opening's, pale, rising off the line like
 *      fluff; the seventh, the one that keeps closest to the path, is the walker's and stays amber.
 *   3. it stays like that, in the shape it was walked. (Author, 261123: no winding into a ball.)
 *   4. the version of the memory this walker read goes up by itself (no typing), each line in the colour of
 *      whose it was; a light moves along the amber thread to the place each part was read.
 *
 * Nothing is scored or named. Staging only.
 * Requires the three.js r128 global build.
 */
// the opening's seven threads (js/app/opening.js startOpeningWaveAnimation): colour, opacity, speed, amplitude, phase, frequency
const WAVES = [
  { c: [100, 130, 150], o: 0.10, sp: 0.010, a: 80, ph: 0.0, f: 0.020 },
  { c: [120, 150, 170], o: 0.15, sp: 0.014, a: 70, ph: 0.6, f: 0.025 },
  { c: [130, 155, 175], o: 0.20, sp: 0.018, a: 60, ph: 1.2, f: 0.030 },
  { c: [140, 165, 185], o: 0.26, sp: 0.022, a: 55, ph: 1.9, f: 0.035 },
  { c: [155, 175, 195], o: 0.33, sp: 0.026, a: 45, ph: 2.6, f: 0.040 },
  { c: [170, 190, 205], o: 0.42, sp: 0.030, a: 35, ph: 3.3, f: 0.045 },
  { c: [190, 205, 215], o: 0.52, sp: 0.034, a: 28, ph: 4.0, f: 0.050 },
];
const MINE = 6, AMBER = 0xffb057;
const X_SPAN = 2100;           // how many of the opening's "pixels" the whole thread is long (free: sets how often it undulates)
const TICK = 30;               // the opening advances its time by 0.5 a frame: 30 a second

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const seg = (T, a, b) => clamp((T - a) / (b - a), 0, 1);
const h01 = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/** The walked line, evened out: n points along it. A carry through a door counts for less length than it spans (it was not walked). */
function resample(track, n) {
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

export async function runFinale(o) {
  const cosmos = o.cosmos, run = o.run, THREE = cosmos.THREE, FAST = o.fast || 1, ko = o.lang !== 'en';
  const pl = cosmos.pl, scene = cosmos.scene;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms / FAST));
  cosmos.setMode('cine');
  if (cosmos.unlock) cosmos.unlock();

  // ── the material ──────────────────────────────────────────────────────────
  let track = cosmos.track.slice();
  const things = Array.from(cosmos.things.values());
  if (track.length < 12) {                                                  // hardly a line was left: a small turn round where the walker is
    const c = things.length ? things[things.length - 1].pos : pl.pos; track = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * 5.5; track.push({ x: c.x + Math.cos(a) * (6 + i * 0.25), y: c.y - 1.5 + Math.sin(a * 1.3), z: c.z + Math.sin(a) * (6 + i * 0.25), t: i, k: 0 }); }
  }
  const N = clamp(Math.round(track.length * 0.9), 360, 1500);
  const rs = resample(track, N), Wp = rs.pts;
  const C = new THREE.Vector3(); let Rm = 1;
  for (let i = 0; i < N; i++) C.add(new THREE.Vector3(Wp[i * 3], Wp[i * 3 + 1], Wp[i * 3 + 2]).multiplyScalar(1 / N));
  for (let i = 0; i < N; i++) Rm = Math.max(Rm, Math.hypot(Wp[i * 3] - C.x, Wp[i * 3 + 1] - C.y, Wp[i * 3 + 2] - C.z));
  for (const r of things) Rm = Math.max(Rm, r.pos.distanceTo(C) + 6);
  // the scene the walker stood at when it ended (the nearest thing): it goes out of the ending
  let last = null; { let bd = Infinity; for (const r of things) { const d = r.pos.distanceTo(pl.pos); if (d < bd) { bd = d; last = r; } } }
  const tanHalf = Math.tan((cosmos.FOV * Math.PI) / 360), aspect = cosmos.cam.aspect, fit = 1 / Math.min(tanHalf, tanHalf * aspect);
  const distReveal = Rm * fit * 1.18 + 20;

  // ── what is drawn ─────────────────────────────────────────────────────────
  const group = new THREE.Group(); scene.add(group);
  const P = new Float32Array(N * 3), Nn = new Float32Array(N * 3), Bn = new Float32Array(N * 3);
  const strands = WAVES.map((w, j) => {
    const pos = new Float32Array(N * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: j === MINE ? AMBER : new THREE.Color(w.c[0] / 255, w.c[1] / 255, w.c[2] / 255), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
    const l = new THREE.Line(g, mat); l.frustumCulled = false; l.renderOrder = 20 + j; group.add(l);
    return { w, pos, g, mat, l };
  });
  // the walker's own thread is a ribbon: a second edge and a thin band between
  const rib = (() => {
    const pos = new Float32Array(N * 6), idx = []; for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.setDrawRange(0, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }));
    m.frustumCulled = false; m.renderOrder = 19; group.add(m);
    const e2 = new Float32Array(N * 3), g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(e2, 3)); g2.setDrawRange(0, 0);
    const l2 = new THREE.Line(g2, new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false })); l2.frustumCulled = false; l2.renderOrder = 27; group.add(l2);
    return { pos, g, m, e2, g2, l2 };
  })();
  // the light that goes where the text is being read
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const reader = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe2bd, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, sizeAttenuation: false }));
  reader.scale.set(0.05, 0.05, 1); reader.renderOrder = 40; group.add(reader);
  // what belonged to the walk goes: ways, doors, words, the model's own threads
  for (const w of cosmos.ways.slice()) cosmos.removeWay(w);
  const wordsFade = things.flatMap((r) => r.words);
  const thread0 = cosmos.threadMat.opacity, fog0 = scene.fog.density;

  // ── the frame ─────────────────────────────────────────────────────────────
  let T = 0, readU = 1, readOn = 0, side = 0, sideTo = 0, dim = 1, dimTo = 1, out = 0, alive = true, hurry = false;
  const hand = { az: 0, el: 0, on: null };                                 // 261124: the hand turns the line (a drag; the eye goes round it) — as in spaceplay/finale.js
  const S0 = pl.pos.clone(), F0 = cosmos.forward(), az0 = Math.atan2(S0.x - C.x, S0.z - C.z);
  const tmp = new THREE.Vector3(), look = new THREE.Vector3(), cpos = new THREE.Vector3();
  const TL = { gone: [0, 0.8], pull: [1.2, 12.5], draw: [2.6, 12.2], open: [12.2, 18.5], hold: [18.5, 23] };

  function tick(dt) {
    if (!alive) return;
    T += dt * FAST;
    const kPull = ease(seg(T, TL.pull[0], TL.pull[1])), kDraw = seg(T, TL.draw[0], TL.draw[1]), kOpen = ease(seg(T, TL.open[0], TL.open[1]));
    side += (sideTo - side) * (1 - Math.exp(-dt * FAST / 1.6)); dim += (dimTo - dim) * (1 - Math.exp(-dt * FAST / 1.6));

    // the eye: far enough for the whole line; a little further while the text is up beside it
    const dist = distReveal * (1 + 0.36 * side);
    const az = az0 + 0.03 * T + hand.az, el = clamp(0.46 + hand.el, -0.3, 1.25);
    cpos.set(C.x + dist * Math.sin(az) * Math.cos(el), C.y + dist * Math.sin(el), C.z + dist * Math.cos(az) * Math.cos(el));
    pl.pos.lerpVectors(S0, cpos, kPull);
    // the line stands to one side while the text goes up (side = share of the half-screen); the eye looks past it
    tmp.set(Math.cos(az), 0, -Math.sin(az));                                // the eye's right
    look.copy(C).addScaledVector(tmp, -side * dist * tanHalf * aspect);
    const kl = ease(seg(T, 0.4, 6.5)); tmp.copy(S0).addScaledVector(F0, 24); look.lerpVectors(tmp, look, kl);
    const dx = look.x - pl.pos.x, dy = look.y - pl.pos.y, dz = look.z - pl.pos.z;
    pl.yaw = pl.tyaw = Math.atan2(-dx, -dz); pl.pitch = pl.tpitch = Math.atan2(dy, Math.hypot(dx, dz));
    scene.fog.density = fog0 + (0.00025 - fog0) * kPull;
    cosmos.threadMat.opacity = thread0 * (1 - ease(seg(T, 10, 16)));
    for (const w of wordsFade) w.o *= Math.exp(-dt * FAST / 0.8);

    // the thread lies where it was walked
    const camD = pl.pos.distanceTo(C);
    P.set(Wp);
    // a frame along it: across the thread (n), and outward from the middle (b)
    let lx = 1, ly = 0, lz = 0;
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(N - 1, i + 1) * 3, j = i * 3;
      let tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let rx = P[j] - C.x, ry = P[j + 1] - C.y, rz = P[j + 2] - C.z; const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
      let nx = ty * rz - tz * ry, ny = tz * rx - tx * rz, nz = tx * ry - ty * rx; const nl = Math.hypot(nx, ny, nz);
      if (nl < 0.05) { nx = lx; ny = ly; nz = lz; } else { nx /= nl; ny /= nl; nz /= nl; if (nx * lx + ny * ly + nz * lz < 0 && i > 0) { nx = -nx; ny = -ny; nz = -nz; } }
      lx = nx; ly = ny; lz = nz;
      Nn[j] = nx; Nn[j + 1] = ny; Nn[j + 2] = nz;
      Bn[j] = ny * tz - nz * ty; Bn[j + 1] = nz * tx - nx * tz; Bn[j + 2] = nx * ty - ny * tx;
    }
    // seven threads, moving as the opening's do
    const amp = kOpen * camD * 0.026 * (0.82 + 0.18 * Math.sin(T * 0.045 * TICK * 0.33)), tt = T * TICK;
    const drawn = Math.floor(kDraw * N), fade = (1 - out) * dim;
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
      s.mat.opacity = (sj === MINE ? 0.95 : Math.min(0.85, w.o * 1.55) * kOpen) * fade;
    });
    // the ribbon: the walker's thread and a second edge beside it
    const mine = strands[MINE].pos, wr = camD * 0.0042;
    for (let i = 0; i < N; i++) {
      const j = i * 3, k = i * 6, x = mine[j] + Nn[j] * wr, y = mine[j + 1] + Nn[j + 1] * wr, z = mine[j + 2] + Nn[j + 2] * wr;
      rib.pos[k] = mine[j]; rib.pos[k + 1] = mine[j + 1]; rib.pos[k + 2] = mine[j + 2]; rib.pos[k + 3] = x; rib.pos[k + 4] = y; rib.pos[k + 5] = z;
      rib.e2[j] = x; rib.e2[j + 1] = y; rib.e2[j + 2] = z;
    }
    rib.g.attributes.position.needsUpdate = true; rib.g.setDrawRange(0, Math.max(0, drawn - 1) * 6); rib.m.material.opacity = 0.2 * fade;
    rib.g2.attributes.position.needsUpdate = true; rib.g2.setDrawRange(0, drawn); rib.l2.material.opacity = 0.55 * fade;

    // the scenes stay where they stand (the eye is far: each is shown larger than it is — a figure, not a speck).
    // Only the one the walker stood at when it ended goes out: it filled the view and stood in front of the line
    // (author, 261123 — "the face out, the scenes' figures back").
    const far = 1 + (clamp(camD / 80, 1, 15) - 1) * kPull, left = 1 - ease(seg(T, TL.gone[0], TL.gone[1]));
    for (const r of things) {
      if (r === last) { r.wrap.scale.setScalar(Math.max(left, 1e-4)); r.glint.scale.setScalar(0.02 * left); if (left <= 0) { r.wrap.visible = false; r.glint.visible = false; } }
      else r.wrap.scale.setScalar(far * (1 - 0.6 * out));
      r.armed = false;
    }
    // the light on the thread
    const ri = clamp(Math.round(readU * (N - 1)), 0, N - 1) * 3;
    reader.position.set(mine[ri], mine[ri + 1], mine[ri + 2]); reader.material.opacity = 0.9 * readOn * fade;
  }
  cosmos.setCine(tick);
  const hDown = (e) => { hand.on = { x: e.clientX, y: e.clientY, moved: false }; };
  const hMove = (e) => { if (!hand.on) return; const dx = e.clientX - hand.on.x, dy = e.clientY - hand.on.y; if (!hand.on.moved && Math.hypot(dx, dy) < 6) return; hand.on.moved = true; hand.az += dx * 0.0045; hand.el = clamp(hand.el + dy * 0.0032, -0.7, 0.7); hand.on.x = e.clientX; hand.on.y = e.clientY; hurry = false; };
  const hUp = () => { hand.on = null; };
  window.addEventListener('pointerdown', hDown); window.addEventListener('pointermove', hMove); window.addEventListener('pointerup', hUp); window.addEventListener('pointercancel', hUp);

  await new Promise((res) => { const iv = setInterval(() => { if (T >= TL.hold[1]) { clearInterval(iv); res(); } }, 120); });

  // ── the version that was read, going up by itself ─────────────────────────
  const n = { total: 0, mine: 0, other: 0, changed: 0 }, inner = o.scrollInner, box = o.scroll;
  inner.innerHTML = '';
  // space-blank: a line whose words were changed in this walk shows whose each word is (l.segs, from blank.js segsOf)
  const add = (cls, text, segs) => {
    const p = document.createElement('p'); if (cls) p.className = cls;
    if (segs) for (const sg of segs) { const sp = document.createElement('span'); if (sg.who) sp.className = 'sb-' + sg.who; sp.textContent = sg.t; p.appendChild(sp); }
    else p.textContent = String(text == null ? '' : text).replace(/[⁠﻿]/g, '');   // a changed word's no-width mark is not a letter to show
    inner.appendChild(p); return p;
  };
  add('title', ko ? '당신이 읽은 「' + o.title + '」' : 'The "' + o.title + '" you read');
  const blocks = [];
  for (const room of run.script) {
    const lines = (room.lines || []).filter((l) => l && String(l.t).trim());
    lines.forEach((l, i) => {
      const p = add(((l.who && l.who !== 'text') ? l.who : '') + (i === 0 ? ' gap' : ''), l.t, l.segs);
      if (i === 0) blocks.push({ el: p, u: rs.uOf(room.at == null ? 0 : room.at) });
      n.total++; if (n[l.who] != null) n[l.who]++;
    });
  }
  const swaps = o.swaps || [], nOut = swaps.length, nIn = swaps.filter((w) => w.neu != null).length, nMine = swaps.filter((w) => w.neu != null && w.owner === 'mine').length, nOth = nIn - nMine;
  let sum;
  if (ko) {
    const parts = [];
    if (n.mine) parts.push(n.mine + '줄은 당신이 썼' + (n.other ? '고' : '습니다'));
    if (n.other) parts.push(n.other + '줄은 먼저 걸은 사람이 썼습니다');
    sum = n.total + '줄 가운데 ' + (parts.length ? parts.join(', ') : '당신이 쓴 줄은 없습니다') + '.' + (n.changed ? ' ' + n.changed + '줄은 여러 번 읽히는 사이에 달라진 문장입니다.' : '');
    if (nOut) sum += ' 낱말 ' + nOut + '개가 빠졌고, ' + (!nIn ? '그 자리는 비어 있습니다.' : [nMine ? nMine + '개 자리에 당신이 한 말이' : '', nOth ? nOth + '개 자리에 먼저 걸은 사람의 말이' : ''].filter(Boolean).join(', ') + ' 들어갔습니다.');
    if (o.inherited) sum += ' 먼저 걸은 사람이 바꾼 낱말 ' + o.inherited + '개는 바뀐 채로 읽혔습니다.';
  } else {
    sum = 'Of ' + n.total + ' lines, ' + (n.mine ? n.mine + ' are yours' : 'none are yours') + (n.other ? ', ' + n.other + ' were left by someone who walked before you' : '') + '.' + (n.changed ? ' ' + n.changed + ' changed while being read again and again.' : '');
    if (nOut) sum += ' ' + nOut + (nOut === 1 ? ' word went out' : ' words went out') + (!nIn ? '; the places stay empty.' : '; ' + [nMine ? 'what you had said came into ' + nMine + (nMine === 1 ? ' place' : ' places') : '', nOth ? 'what someone before you said came into ' + nOth + (nOth === 1 ? ' place' : ' places') : ''].filter(Boolean).join(', ') + '.');
    if (o.inherited) sum += ' ' + o.inherited + (o.inherited === 1 ? ' word someone before you changed was read as changed.' : ' words people before you changed were read as changed.');
  }
  add('sum', sum);
  const key = add('key', '');
  [['', ko ? '처음 쓰인 대로' : 'as first written'], ['mine', ko ? '당신' : 'you'], ['other', ko ? '먼저 걸은 사람' : 'someone before you'], ['changed', ko ? '달라진 문장' : 'changed']]
    .forEach(([cls, t]) => { if (cls && !n[cls]) return; const sp = document.createElement('span'); if (cls) sp.className = cls; sp.textContent = t; key.appendChild(sp); });
  if (nOut) { const sp = document.createElement('span'); sp.className = 'sb-hole'; sp.textContent = (ko ? '빠진 자리 ' : 'a place emptied ') + '[   ]'; key.appendChild(sp); }
  key.querySelectorAll('span.mine').forEach((s) => { s.style.color = 'var(--rp-accent)'; });
  key.querySelectorAll('span.other').forEach((s) => { s.style.cssText = 'color:#8f8b99;font-style:italic'; });
  key.querySelectorAll('span.changed').forEach((s) => { s.style.cssText = 'color:#b9b4c6;text-decoration:underline dotted rgba(185,180,198,0.45);text-underline-offset:0.35em'; });

  if (innerWidth < 900) dimTo = 0.4; else sideTo = 0.5;                     // the text goes up on the left, the line stands on the right; on a narrow screen it stays behind the text, dimmer
  box.classList.add('on');
  await wait(900);
  const H = innerHeight, full = inner.scrollHeight, endY = H * 0.42 - full;   // it stops with its last lines near the middle
  let y = H * 0.86, lastT = performance.now(), done = false; hurry = false;
  const onDown = () => { hurry = true; }, onUp = () => { hurry = false; };
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter') hurry = e.type === 'keydown'; };
  window.addEventListener('pointerdown', onDown); window.addEventListener('pointerup', onUp); window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
  readOn = 1;
  await new Promise((res) => {
    (function step(now) {
      const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      y -= dt * 48 * FAST * (hurry ? 6 : 1);                               // a reading pace; held down, it runs
      if (y <= endY) { y = endY; done = true; }
      inner.style.transform = 'translate(-50%,' + y.toFixed(1) + 'px)';
      // the light goes to where the part now at the middle of the screen was read
      let cur = blocks[0]; const mid = H * 0.5 - y;
      for (const b of blocks) { if (b.el.offsetTop <= mid) cur = b; else break; }
      if (cur) readU += (cur.u - readU) * Math.min(1, dt * 1.6);
      if (done) return res();
      requestAnimationFrame(step);
    })(performance.now());
  });
  window.removeEventListener('pointerdown', onDown); window.removeEventListener('pointerup', onUp); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
  await wait(7000);

  // ── it goes out ───────────────────────────────────────────────────────────
  if (o.air) o.air.fade();
  box.style.transition = 'opacity 2600ms ease'; box.style.opacity = '0';
  await new Promise((res) => { const t0 = performance.now(), dur = 4200 / FAST; (function step() { out = ease((performance.now() - t0) / dur); if (out < 1) requestAnimationFrame(step); else res(); })(); });
  alive = false; cosmos.setCine(null);
  window.removeEventListener('pointerdown', hDown); window.removeEventListener('pointermove', hMove); window.removeEventListener('pointerup', hUp); window.removeEventListener('pointercancel', hUp);
  return { points: N, lines: n, scenes: things.length };
}

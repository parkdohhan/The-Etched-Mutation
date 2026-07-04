// Terrain Replay Simulator — implements §9 of docs/생성형_지형모델_v2-260619.md
// Standalone page (terrain-replay-sim.html). Does NOT touch play-test/admin.
//
// Pipeline per bake (one "experience"):
//   base simplex fBm  →  per-beat lobe uplift (un-collapsed 17-axis distribution)
//   → per-transition droplet erosion (spawned ALONG the movement path, initial
//     velocity = movement direction, applied in replay order)  →  thermal pass.
// Mass conservation is structural (eroded soil = carried soil = deposited soil);
// the HUD logs the drift so a violation is visible immediately.
// Litmus test (§9.6): shuffling scene order must produce a different terrain.

/* global THREE */

(function () {
  'use strict';

  // ───────────────────────── grid ─────────────────────────
  const N = 160;                // heightmap resolution (matches strata terrain)
  const SZ = 100;               // world size
  const CELL = SZ / (N - 1);

  // ──────────────── emotion space (17 axes) ────────────────
  // Same list/coords as VAD_FULL in js/shared/tem_af_strata_terrain.js.
  // Duplicated on purpose: this page must stay dependency-free / disposable.
  const VAD = {
    fear:        { v: -0.9, a:  0.9, d: -0.8 },
    sadness:     { v: -0.8, a: -0.4, d: -0.7 },
    anger:       { v: -0.7, a:  0.8, d:  0.3 },
    guilt:       { v: -0.8, a:  0.2, d: -0.6 },
    shame:       { v: -0.9, a: -0.2, d: -0.9 },
    isolation:   { v: -0.7, a: -0.5, d: -0.6 },
    numbness:    { v: -0.6, a: -0.8, d: -0.4 },
    longing:     { v: -0.3, a:  0.2, d: -0.2 },
    resentment:  { v: -0.5, a:  0.6, d:  0.1 },
    resignation: { v: -0.4, a: -0.6, d: -0.5 },
    joy:         { v:  0.9, a:  0.6, d:  0.5 },
    hope:        { v:  0.7, a:  0.4, d:  0.6 },
    relief:      { v:  0.6, a: -0.3, d:  0.4 },
    gratitude:   { v:  0.8, a: -0.2, d:  0.7 },
    love:        { v:  1.0, a:  0.5, d:  0.6 },
    peace:       { v:  0.8, a: -0.6, d:  0.7 },
    confusion:   { v: -0.4, a:  0.3, d: -0.5 },
  };
  const KO = {
    fear: '공포', sadness: '슬픔', anger: '분노', guilt: '죄책감', shame: '수치심',
    isolation: '고립', numbness: '무감각', longing: '그리움', resentment: '원망',
    resignation: '체념', joy: '기쁨', hope: '희망', relief: '안도', gratitude: '감사',
    love: '사랑', peace: '평화', confusion: '혼란',
  };

  // Lobe layout (§9.3): each emotion's fixed spot INSIDE the piece-local space,
  // kinship-preserving (derived from its own v/a). The distribution is never
  // collapsed — every axis keeps its own lobe and pushes land there itself.
  const MARGIN = 16; // cells
  const LOBE = {};
  Object.keys(VAD).forEach(function (k) {
    LOBE[k] = {
      x: MARGIN + (VAD[k].v + 1) / 2 * (N - 1 - MARGIN * 2),
      z: MARGIN + (VAD[k].a + 1) / 2 * (N - 1 - MARGIN * 2),
    };
  });

  // ───────────────── seeded randomness ─────────────────
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Simplex 2D (Gustavson) with seeded permutation — the "grid-scar-free clay".
  function makeSimplex(rand) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const G = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    return function (xin, yin) {
      let n0 = 0, n1 = 0, n2 = 0;
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) { t0 *= t0; const g = G[perm[ii + perm[jj]] & 7]; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) { t1 *= t1; const g = G[perm[ii + i1 + perm[jj + j1]] & 7]; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) { t2 *= t2; const g = G[perm[ii + 1 + perm[jj + 1]] & 7]; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
      return 70 * (n0 + n1 + n2);
    };
  }

  // ─────────── physics constants (§9.5 — world softness, NOT per-emotion) ───────────
  const PHYS = {
    inertia: 0.08,      // journey-direction vs terrain-pull blend
    capacity: 6,        // sediment carry capacity factor
    minSlope: 0.01,
    erode: 0.35,
    deposit: 0.3,
    evaporate: 0.02,
    gravity: 4,
    maxSteps: 64,
    radius: 3,          // erosion kernel radius (anti-spike)
  };

  // Erosion brush kernel (precomputed, weights renormalized at borders).
  const BRUSH = (function () {
    const r = PHYS.radius, arr = [];
    let tw = 0;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > r) continue;
        const w = 1 - d / r;
        arr.push({ dx: dx, dz: dz, w: w });
        tw += w;
      }
    }
    arr.forEach(function (b) { b.w /= tw; });
    return arr;
  })();

  // ───────────────────── journey presets ─────────────────────
  const PRESETS = {
    '완만한 여정 (침잠)': [
      { emo: { sadness: 0.7, isolation: 0.2 } },
      { emo: { isolation: 0.6, sadness: 0.3 } },
      { emo: { numbness: 0.6, isolation: 0.3 } },
      { emo: { resignation: 0.5, numbness: 0.4 } },
      { emo: { longing: 0.5, resignation: 0.3 } },
    ],
    '거스른 여정 (널뛰기)': [
      { emo: { fear: 0.7, confusion: 0.2 } },
      { emo: { peace: 0.6, relief: 0.3 } },
      { emo: { anger: 0.6, resentment: 0.3 } },
      { emo: { relief: 0.6, gratitude: 0.2 } },
      { emo: { resentment: 0.5, anger: 0.3 } },
    ],
    '고착 (한 자리 맴돎)': [
      { emo: { guilt: 0.7, shame: 0.2 } },
      { emo: { guilt: 0.6, shame: 0.3 } },
      { emo: { guilt: 0.65, shame: 0.25 } },
      { emo: { shame: 0.35, guilt: 0.6 } },
      { emo: { guilt: 0.7, shame: 0.2 } },
    ],
    '회피 섞인 여정': [
      { emo: { fear: 0.6, confusion: 0.3 } },
      { void: true },
      { emo: { sadness: 0.6, guilt: 0.3 } },
      { void: true },
      { emo: { confusion: 0.5, longing: 0.4 } },
    ],
    '격정 → 침잠': [
      { emo: { fear: 0.6, anger: 0.3 } },
      { emo: { anger: 0.6, resentment: 0.2 } },
      { emo: { sadness: 0.6, guilt: 0.2 } },
      { emo: { numbness: 0.6, isolation: 0.3 } },
      { emo: { peace: 0.5, relief: 0.3 } },
    ],
  };

  // ───────────────────── state ─────────────────────
  let seed = 20260702;
  let SIM = makeSimplex(mulberry32(seed));
  let gen = 1;                 // relay generation
  let genBase = null;          // heightmap inherited at generation start (null = fresh base)
  let journey = clone(PRESETS[Object.keys(PRESETS)[0]]);
  let steps = [];              // [{label, h}]
  let stepIdx = 0;
  let finalNormal = null;      // final heightmap of normal-order bake (shuffle reference)
  let currentOrder = null;     // scene array actually baked (for path overlay)
  let viewMode = '순서대로';
  let lastErr = 0;             // accumulated |mass drift| across water+thermal batches
  let lastShuffleMsg = '—';

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function sliders() {
    return {
      water: parseFloat(document.getElementById('sl-water').value),
      drops: parseFloat(document.getElementById('sl-drops').value),
      uplift: parseFloat(document.getElementById('sl-uplift').value),
    };
  }

  // ───────────────────── heightmap ops ─────────────────────
  function sum(h) { let s = 0; for (let i = 0; i < h.length; i++) s += h[i]; return s; }

  function makeBase() {
    const h = new Float32Array(N * N);
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        let a = 1, f = 0.045, s = 0, norm = 0;
        for (let o = 0; o < 4; o++) { s += a * SIM(x * f, z * f); norm += a; a *= 0.5; f *= 2; }
        h[z * N + x] = 1.4 * (s / norm);
      }
    }
    return h;
  }

  // Per-beat uplift: every present axis pushes land at ITS OWN lobe (no collapsing).
  // Lobe sharpness/roughness come from that emotion's own arousal — per-axis, not
  // from a projected mixture.
  function upliftScene(h, scene, upliftMul) {
    if (scene.void) return;
    for (const k in scene.emo) {
      const w = scene.emo[k];
      if (!w || !LOBE[k]) continue;
      const lb = LOBE[k];
      const a01 = (VAD[k].a + 1) / 2;          // 0 calm … 1 aroused
      const sig = 5 + 4 * (1 - a01);           // aroused → tight/sharp, calm → wide/soft
      const amp = 9 * w * upliftMul;
      const R = Math.ceil(sig * 3.2);
      const x0 = Math.max(0, Math.floor(lb.x - R)), x1 = Math.min(N - 1, Math.ceil(lb.x + R));
      const z0 = Math.max(0, Math.floor(lb.z - R)), z1 = Math.min(N - 1, Math.ceil(lb.z + R));
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - lb.x, dz = z - lb.z;
          const env = Math.exp(-(dx * dx + dz * dz) / (2 * sig * sig));
          if (env < 0.004) continue;
          let v = amp * env;
          if (a01 > 0.05) v += env * a01 * w * 2.4 * SIM(x * 0.16 + 31.7, z * 0.16 - 11.3);
          h[z * N + x] += v;
        }
      }
    }
  }

  // Waypoint (§9.3): center of mass of the lobes — used ONLY as the water path
  // anchor, never for judgment. null for void scenes (path breaks → 복류).
  function waypoint(scene) {
    if (scene.void) return null;
    let sx = 0, sz = 0, sw = 0;
    for (const k in scene.emo) {
      const w = scene.emo[k];
      if (!w || !LOBE[k]) continue;
      sx += LOBE[k].x * w; sz += LOBE[k].z * w; sw += w;
    }
    if (sw <= 0) return null;
    return { x: sx / sw, z: sz / sw };
  }

  function heightAndGrad(h, x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const fx = x - xi, fz = z - zi;
    const i00 = zi * N + xi;
    const h00 = h[i00], h10 = h[i00 + 1], h01 = h[i00 + N], h11 = h[i00 + N + 1];
    return {
      h: h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz,
      gx: (h10 - h00) * (1 - fz) + (h11 - h01) * fz,
      gz: (h01 - h00) * (1 - fx) + (h11 - h10) * fx,
    };
  }

  function depositAt(h, x, z, amt) {
    if (amt <= 0) return;
    const xi = Math.floor(x), zi = Math.floor(z);
    const fx = x - xi, fz = z - zi;
    h[zi * N + xi] += amt * (1 - fx) * (1 - fz);
    h[zi * N + xi + 1] += amt * fx * (1 - fz);
    h[(zi + 1) * N + xi] += amt * (1 - fx) * fz;
    h[(zi + 1) * N + xi + 1] += amt * fx * fz;
  }

  function erodeAt(h, x, z, amt) {
    if (amt <= 0) return;
    const cx = Math.round(x), cz = Math.round(z);
    let ws = 0;
    for (let i = 0; i < BRUSH.length; i++) {
      const xx = cx + BRUSH[i].dx, zz = cz + BRUSH[i].dz;
      if (xx < 0 || xx >= N || zz < 0 || zz >= N) continue;
      ws += BRUSH[i].w;
    }
    if (ws <= 0) return;
    for (let i = 0; i < BRUSH.length; i++) {
      const xx = cx + BRUSH[i].dx, zz = cz + BRUSH[i].dz;
      if (xx < 0 || xx >= N || zz < 0 || zz >= N) continue;
      h[zz * N + xx] -= amt * BRUSH[i].w / ws;
    }
  }

  // One droplet's life (§9.4): born on the transition path, thrown along the
  // journey direction, then the terrain takes over. Carries a soil pouch —
  // whatever it digs it must drop (mass conservation is structural).
  function dropOne(h, x, z, dx, dz, waterMul, rng) {
    let speed = 1, water = 1, sediment = 0;
    for (let life = 0; life < PHYS.maxSteps; life++) {
      if (x < 1 || x > N - 3 || z < 1 || z > N - 3) break;
      const g = heightAndGrad(h, x, z);
      dx = dx * PHYS.inertia - g.gx * (1 - PHYS.inertia);
      dz = dz * PHYS.inertia - g.gz * (1 - PHYS.inertia);
      let l = Math.hypot(dx, dz);
      if (l < 1e-8) { const ang = rng() * Math.PI * 2; dx = Math.cos(ang); dz = Math.sin(ang); l = 1; }
      dx /= l; dz /= l;
      const nx = x + dx, nz = z + dz;
      if (nx < 1 || nx > N - 3 || nz < 1 || nz > N - 3) { depositAt(h, x, z, sediment); return; }
      const gn = heightAndGrad(h, nx, nz);
      const dh = gn.h - g.h;
      const cap = Math.max(-dh, PHYS.minSlope) * speed * water * PHYS.capacity * waterMul;
      if (dh > 0) {
        const dep = Math.min(dh, sediment);
        depositAt(h, x, z, dep); sediment -= dep;
      } else if (sediment > cap) {
        const dep = (sediment - cap) * PHYS.deposit;
        depositAt(h, x, z, dep); sediment -= dep;
      } else {
        const ero = Math.min((cap - sediment) * PHYS.erode, -dh);
        erodeAt(h, x, z, ero); sediment += ero;
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * PHYS.gravity));
      water *= (1 - PHYS.evaporate);
      x = nx; z = nz;
      if (water < 0.02) break;
    }
    if (x >= 1 && x <= N - 3 && z >= 1 && z <= N - 3) depositAt(h, x, z, sediment);
  }

  // Thermal pass: too-steep slopes crumble to rest angle (mass conserving).
  function thermal(h, iters) {
    const TAL = 0.5, RATE = 0.125;
    for (let it = 0; it < iters; it++) {
      for (let z = 1; z < N - 1; z++) {
        for (let x = 1; x < N - 1; x++) {
          const i = z * N + x;
          relax(i, i - 1); relax(i, i + 1); relax(i, i - N); relax(i, i + N);
        }
      }
    }
    function relax(i, j) {
      const d = h[i] - h[j];
      if (d > TAL) { const m = (d - TAL) * RATE; h[i] -= m; h[j] += m; }
    }
  }

  // One transition's water batch: droplets spawned along the segment A→B,
  // count/energy ∝ |delta|, initial velocity = movement direction.
  function waterTransition(h, A, B, rng, s, errRef) {
    const ddx = B.x - A.x, ddz = B.z - A.z;
    const dist = Math.hypot(ddx, ddz);
    const ndx = dist > 1e-6 ? ddx / dist : 0;
    const ndz = dist > 1e-6 ? ddz / dist : 0;
    const count = Math.round((50 + 250 * Math.min(1, dist / (N * 0.5))) * s.drops);
    const before = sum(h);
    for (let i = 0; i < count; i++) {
      const t = rng();
      const px = A.x + ddx * t + (rng() * 2 - 1) * 2.5;
      const pz = A.z + ddz * t + (rng() * 2 - 1) * 2.5;
      let dx = ndx, dz = ndz;
      if (dist <= 1e-6) { const ang = rng() * Math.PI * 2; dx = Math.cos(ang); dz = Math.sin(ang); }
      dropOne(h, Math.min(Math.max(px, 1), N - 3), Math.min(Math.max(pz, 1), N - 3), dx, dz, s.water, rng);
    }
    thermal(h, 2);
    errRef.acc += Math.abs(sum(h) - before);
    return count;
  }

  // ───────────────────── bake (replay, §9.1) ─────────────────────
  // Order inside the loop: the MOVE into scene i carves first, then scene i's
  // emotion rises. Early uplift keeps weathering under every later batch —
  // that is how order becomes strata (non-commutative).
  function bake(order) {
    const rng = mulberry32((seed ^ Math.imul(gen, 2654435761)) >>> 0);
    const s = sliders();
    const errRef = { acc: 0 };
    const out = [];
    let h;
    if (genBase) {
      h = Float32Array.from(genBase);
      out.push({ label: '세대 ' + gen + ' — 물려받은 땅', h: Float32Array.from(h) });
    } else {
      h = makeBase();
      out.push({ label: '바탕 (Simplex fBm)', h: Float32Array.from(h) });
    }
    let prevWp = null, prevIdx = -1;
    order.forEach(function (sc, i) {
      const wp = waypoint(sc);
      if (i > 0 && prevWp && wp) {
        const cnt = waterTransition(h, prevWp, wp, rng, s, errRef);
        out.push({ label: '전이 ' + (prevIdx + 1) + '→' + (i + 1) + ' 물길 (' + cnt + '방울)', h: Float32Array.from(h) });
      }
      if (!sc.void) {
        upliftScene(h, sc, s.uplift);
        out.push({ label: '박자 ' + (i + 1) + ' 융기: ' + sceneName(sc), h: Float32Array.from(h) });
        prevWp = wp; prevIdx = i;
      } else {
        out.push({ label: '박자 ' + (i + 1) + ' 침묵(void) — 물도 융기도 없음', h: Float32Array.from(h) });
        prevWp = null; // path breaks: water goes underground across the void
      }
    });
    return { steps: out, err: errRef.acc, final: out[out.length - 1].h };
  }

  function sceneName(sc) {
    if (sc.void) return '침묵';
    return Object.keys(sc.emo)
      .sort(function (a, b) { return sc.emo[b] - sc.emo[a]; })
      .map(function (k) { return KO[k] || k; })
      .join('·');
  }

  function rmsDiff(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s / a.length);
  }

  function stddev(a) {
    let m = 0;
    for (let i = 0; i < a.length; i++) m += a[i];
    m /= a.length;
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - m; s += d * d; }
    return Math.sqrt(s / a.length);
  }

  // ───────────────────── bake orchestration ─────────────────────
  function fullBake() {
    const res = bake(journey);
    steps = res.steps;
    lastErr = res.err;
    finalNormal = res.final;
    currentOrder = journey;
    viewMode = '순서대로';
    lastShuffleMsg = '—';
    stepIdx = steps.length - 1;
    applyStep();
  }

  // Litmus (§9.6): same scenes, same droplet random stream — ONLY the order
  // differs. If the land doesn't change, the trajectory is not being terrained.
  function shuffleBake() {
    if (!finalNormal) return;
    const rng = mulberry32((seed * 31 + gen * 7 + 13) >>> 0);
    const idx = journey.map(function (_, i) { return i; });
    for (let i = idx.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    const shuffled = idx.map(function (i) { return journey[i]; });
    const res = bake(shuffled);
    const r = rmsDiff(res.final, finalNormal);
    const rel = r / Math.max(1e-9, stddev(finalNormal));
    lastShuffleMsg = 'RMS ' + r.toFixed(3) + ' (지형 표준편차 대비 ' + (rel * 100).toFixed(1) + '%) ' +
      (rel > 0.1 ? '→ 순서가 땅에 새겨짐 ✓' : '→ 순서 효과 미미 ✗');
    steps = res.steps;
    lastErr = res.err;
    currentOrder = shuffled;
    viewMode = '셔플 (순서: ' + idx.map(function (i) { return i + 1; }).join('→') + ')';
    stepIdx = steps.length - 1;
    applyStep();
  }

  // Relay (§9.1): next experiencer inherits the previous person's finished land.
  function relayBake() {
    if (!finalNormal) return;
    genBase = Float32Array.from(finalNormal);
    gen += 1;
    const rng = mulberry32((seed + gen * 104729) >>> 0);
    const keys = Object.keys(PRESETS);
    const pick = clone(PRESETS[keys[(rng() * keys.length) | 0]]);
    pick.forEach(function (sc) {
      if (sc.void) return;
      for (const k in sc.emo) {
        sc.emo[k] = Math.min(1, Math.max(0.05, sc.emo[k] + (rng() * 2 - 1) * 0.15));
      }
    });
    journey = pick;
    fullBake();
  }

  function resetAll() {
    gen = 1;
    genBase = null;
    journey = clone(PRESETS[document.getElementById('preset').value]);
    fullBake();
  }

  function reseed() {
    seed = (Math.random() * 2147483647) | 0;
    SIM = makeSimplex(mulberry32(seed));
    resetAll();
  }

  // ───────────────────── three.js scene ─────────────────────
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 85, 105);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a10);
  scene.fog = new THREE.Fog(0x0a0a10, 160, 360);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x8890aa, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2dd, 0.9);
  sun.position.set(60, 120, 40);
  scene.add(sun);

  const geo = new THREE.PlaneGeometry(SZ, SZ, N - 1, N - 1);
  geo.rotateX(-Math.PI / 2);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * N * 3), 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const terrain = new THREE.Mesh(geo, mat);
  scene.add(terrain);

  const pathGroup = new THREE.Group();
  scene.add(pathGroup);
  const labelGroup = new THREE.Group();
  scene.add(labelGroup);

  // Height → color ramp (dark valley → tan ridge).
  const RAMP = [
    [0.00, 0x101018], [0.35, 0x2e2e3e], [0.60, 0x6b5f4d], [0.80, 0xa08a63], [1.00, 0xe0cba2],
  ].map(function (s) { return [s[0], new THREE.Color(s[1])]; });
  function rampColor(t) {
    for (let i = 1; i < RAMP.length; i++) {
      if (t <= RAMP[i][0]) {
        const t0 = RAMP[i - 1][0], t1 = RAMP[i][0];
        return RAMP[i - 1][1].clone().lerp(RAMP[i][1], (t - t0) / (t1 - t0));
      }
    }
    return RAMP[RAMP.length - 1][1].clone();
  }

  function gridToWorld(x, z) {
    return { x: (x / (N - 1) - 0.5) * SZ, z: (z / (N - 1) - 0.5) * SZ };
  }

  function sampleH(h, x, z) {
    const xi = Math.min(N - 2, Math.max(0, Math.floor(x)));
    const zi = Math.min(N - 2, Math.max(0, Math.floor(z)));
    const fx = x - xi, fz = z - zi;
    return h[zi * N + xi] * (1 - fx) * (1 - fz) + h[zi * N + xi + 1] * fx * (1 - fz) +
      h[(zi + 1) * N + xi] * (1 - fx) * fz + h[(zi + 1) * N + xi + 1] * fx * fz;
  }

  function makeLabel(text, size, color) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 48;
    const ctx = c.getContext('2d');
    ctx.font = '22px sans-serif';
    ctx.fillStyle = color || 'rgba(196,168,130,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(text, 64, 32);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthTest: false,
    }));
    sp.scale.set(size, size * 0.375, 1);
    return sp;
  }

  // Emotion lobe labels (built once, y updated per step).
  const lobeSprites = {};
  Object.keys(LOBE).forEach(function (k) {
    const sp = makeLabel(KO[k], 9, 'rgba(140,150,180,0.75)');
    lobeSprites[k] = sp;
    labelGroup.add(sp);
  });

  function disposeGroup(grp) {
    while (grp.children.length) {
      const o = grp.children.pop();
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
      grp.remove(o);
    }
  }

  function applyStep() {
    const h = steps[stepIdx].h;
    const pos = geo.attributes.position, col = geo.attributes.color;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < h.length; i++) { if (h[i] < mn) mn = h[i]; if (h[i] > mx) mx = h[i]; }
    const span = Math.max(1e-6, mx - mn);
    for (let i = 0; i < h.length; i++) {
      pos.setY(i, h[i]);
      const c = rampColor((h[i] - mn) / span);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();

    // journey overlay: segments only where water actually flowed (void breaks path)
    disposeGroup(pathGroup);
    if (document.getElementById('cb-path').checked && currentOrder) {
      let prev = null, prevI = -1;
      currentOrder.forEach(function (sc, i) {
        const wp = waypoint(sc);
        if (wp) {
          const w = gridToWorld(wp.x, wp.z);
          const y = sampleH(h, wp.x, wp.z);
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.9, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0xe0c8a0 })
          );
          sphere.position.set(w.x, y + 1.2, w.z);
          pathGroup.add(sphere);
          const num = makeLabel(String(i + 1), 6, 'rgba(224,200,160,0.95)');
          num.position.set(w.x, y + 4.5, w.z);
          pathGroup.add(num);
          if (prev) {
            const w0 = gridToWorld(prev.x, prev.z);
            const y0 = sampleH(h, prev.x, prev.z);
            const lineGeo = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(w0.x, y0 + 1.2, w0.z),
              new THREE.Vector3(w.x, y + 1.2, w.z),
            ]);
            pathGroup.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x88aacc })));
          }
          prev = wp; prevI = i;
        } else {
          prev = null; // void: the line breaks — water went underground
        }
      });
    }

    // lobe labels
    const showLb = document.getElementById('cb-lobes').checked;
    Object.keys(LOBE).forEach(function (k) {
      const sp = lobeSprites[k];
      sp.visible = showLb;
      if (!showLb) return;
      const w = gridToWorld(LOBE[k].x, LOBE[k].z);
      sp.position.set(w.x, sampleH(h, LOBE[k].x, LOBE[k].z) + 3, w.z);
    });

    updateHud(h);
  }

  // ───────────────────── HUD ─────────────────────
  function updateHud(h) {
    const el = function (id) { return document.getElementById(id); };
    el('hud-gen').textContent = gen + '세대';
    el('hud-view').textContent = viewMode;
    el('hud-step').textContent = steps[stepIdx].label + '  (' + (stepIdx + 1) + '/' + steps.length + ')';
    el('hud-mass').textContent = (sum(h) * CELL * CELL).toFixed(0);
    el('hud-err').textContent = lastErr.toExponential(2) + ' (0에 가까워야 함)';
    el('hud-shuffle').textContent = lastShuffleMsg;
    el('hud-journey').innerHTML = currentOrder
      ? currentOrder.map(function (sc, i) {
          return '<div class="row"><span class="k">' + (i + 1) + '</span><span class="v">' + sceneName(sc) + '</span></div>';
        }).join('')
      : '';
  }

  // ───────────────────── UI wiring ─────────────────────
  const presetSel = document.getElementById('preset');
  Object.keys(PRESETS).forEach(function (k) {
    const o = document.createElement('option');
    o.value = k; o.textContent = k;
    presetSel.appendChild(o);
  });
  presetSel.addEventListener('change', resetAll);

  document.getElementById('btn-bake').addEventListener('click', fullBake);
  document.getElementById('btn-prev').addEventListener('click', function () {
    if (stepIdx > 0) { stepIdx--; applyStep(); }
  });
  document.getElementById('btn-next').addEventListener('click', function () {
    if (stepIdx < steps.length - 1) { stepIdx++; applyStep(); }
  });
  document.getElementById('btn-shuffle').addEventListener('click', shuffleBake);
  document.getElementById('btn-relay').addEventListener('click', relayBake);
  document.getElementById('btn-seed').addEventListener('click', reseed);
  document.getElementById('btn-reset').addEventListener('click', resetAll);
  document.getElementById('cb-path').addEventListener('change', applyStep);
  document.getElementById('cb-lobes').addEventListener('change', applyStep);

  ['sl-water', 'sl-drops', 'sl-uplift'].forEach(function (id) {
    const inp = document.getElementById(id);
    const lab = document.getElementById(id + '-val');
    inp.addEventListener('input', function () { lab.textContent = parseFloat(inp.value).toFixed(2); });
    inp.addEventListener('change', fullBake);
    lab.textContent = parseFloat(inp.value).toFixed(2);
  });

  // ───────────────────── loop ─────────────────────
  function fit() {
    const w = window.innerWidth, hh = window.innerHeight;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', fit);
  fit();

  fullBake();

  (function loop() {
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  })();
})();

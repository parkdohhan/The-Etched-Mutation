/**
 * TEM Replay Terrain — §9 재생 굽기 모델 provider (v0.3 QUILT)
 * docs/생성형_지형모델_v2-260619.md §9 (재생 굽기 + 젖은 땅 + 퀼트)
 *
 * ADDITIVE & FLAG-GATED (default OFF).
 *   enable:  localStorage.tem_replay_terrain = '1'   or URL ?replay_terrain=1
 *            or console: TemReplayTerrain.setEnabled(true)
 *   disable: TemReplayTerrain.setEnabled(false)  or ?replay_terrain=0
 *   rollback: delete this file + the guarded block at the top of
 *             computeAfTerrainFields (js/shared/tem_af_strata_terrain.js)
 *             + the ADDITIVE blocks in play-test.html.
 *
 * QUILT (v0.3): the memory is NOT one landmass. Each scene gets its own
 * terrain PIECE (island) floating on a dark void floor, chained in journey
 * order. Emotion coordinates live ONLY INSIDE a piece (17 local lobes,
 * kinship layout) — piece placement is a seeded chain, not an emotion plane
 * ("좌표 두 집 살림" 청산). Transition water crosses the void between pieces,
 * carving channels and depositing the SEAM (이음새 = mass-conserving bridge).
 *
 * Replay order (§9.1, non-commutative): a piece rises at its beat; every
 * later beat's water keeps weathering earlier pieces (젖은 땅 — nothing is
 * fossilized mid-run). Same log + same seed → same land (deterministic).
 *
 * Piece positions are exposed via getPiecePos(memoryId, sceneId) so pins /
 * ghosts / sounds stand on their own piece (wired in play-test).
 */
(function (global) {
  'use strict';

  var FLAG_KEY = 'tem_replay_terrain';

  // ───────────────────────── flag ─────────────────────────
  var _enabled = null;
  function isEnabled() {
    if (_enabled != null) return _enabled;
    // URL flag is STICKY (the app rewrites the URL on internal navigation).
    var q = '';
    try { q = (global.location && global.location.search) || ''; } catch (_) {}
    var on = null;
    if (/[?&]replay_terrain=1/.test(q)) on = true;
    else if (/[?&]replay_terrain=0/.test(q)) on = false;
    if (on != null) {
      try { global.localStorage.setItem(FLAG_KEY, on ? '1' : '0'); } catch (_) {}
    } else {
      try { on = global.localStorage && global.localStorage.getItem(FLAG_KEY) === '1'; }
      catch (_) { on = false; }
    }
    _enabled = !!on;
    if (_enabled) {
      console.log('[replay-terrain] ON — §9 재생 지형(퀼트) 경로 활성. 끄기: TemReplayTerrain.setEnabled(false) 또는 ?replay_terrain=0');
    }
    return _enabled;
  }
  function setEnabled(v) {
    _enabled = !!v;
    try { global.localStorage.setItem(FLAG_KEY, v ? '1' : '0'); } catch (_) {}
    console.log('[replay-terrain] ' + (v ? 'ON — 다음 buildTerrain부터 §9 퀼트 지형' : 'OFF — 원본 지형 경로'));
  }

  // ─────────────────── seeded randomness ───────────────────
  function seedFromString(s) {
    var h = 5381;
    s = String(s || 'tem');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Simplex 2D (Gustavson), seeded permutation — grid-scar-free base noise.
  function makeSimplex(rand) {
    var p = new Uint8Array(256), i, j, tmp;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) {
      j = (rand() * (i + 1)) | 0;
      tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    var perm = new Uint8Array(512);
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
    var GR = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    var F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    return function (xin, yin) {
      var n0 = 0, n1 = 0, n2 = 0;
      var s = (xin + yin) * F2;
      var ii = Math.floor(xin + s), jj = Math.floor(yin + s);
      var t = (ii + jj) * G2;
      var x0 = xin - (ii - t), y0 = yin - (jj - t);
      var i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      var x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      var ia = ii & 255, ja = jj & 255, g;
      var t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) { t0 *= t0; g = GR[perm[ia + perm[ja]] & 7]; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
      var t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) { t1 *= t1; g = GR[perm[ia + i1 + perm[ja + j1]] & 7]; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
      var t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) { t2 *= t2; g = GR[perm[ia + 1 + perm[ja + 1]] & 7]; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
      return 70 * (n0 + n1 + n2);
    };
  }

  // ─── physics constants (§9.5 — world softness, shared by ALL emotions) ───
  var PHYS = {
    inertia: 0.08, capacity: 6, minSlope: 0.01,
    erode: 0.35, deposit: 0.3, evaporate: 0.02,
    gravity: 4, maxSteps: 80, radius: 3,
  };
  var FLOOR = -5;          // void floor between pieces (dark sea of un-experienced space)
  var BRUSH = (function () {
    var r = PHYS.radius, arr = [], tw = 0, dx, dz, d, w;
    for (dz = -r; dz <= r; dz++) for (dx = -r; dx <= r; dx++) {
      d = Math.sqrt(dx * dx + dz * dz);
      if (d > r) continue;
      w = 1 - d / r;
      arr.push({ dx: dx, dz: dz, w: w });
      tw += w;
    }
    for (var i = 0; i < arr.length; i++) arr[i].w /= tw;
    return arr;
  })();

  // ─────────────────── run state (current play) ───────────────────
  // beginRun = "체험 시작": from this moment the memory's land is EMPTY —
  // panels are BORN one by one as scenes are completed (beats). Without an
  // active run (admin/archive view) the full initial-telling quilt is baked.
  var run = { memoryId: null, beats: [], active: false };
  function beginRun(memoryId) {
    if (!memoryId) return;
    run.memoryId = memoryId;
    run.beats = [];
    run.active = true;
    console.log('[replay-terrain] run 시작 — 공허에서 출발, 조각은 체험 순간에 태어난다');
  }
  function beat(memoryId, b) {
    if (!memoryId) return;
    if (run.memoryId !== memoryId) { run.memoryId = memoryId; run.beats = []; run.active = true; }
    run.beats.push({
      sceneId: (b && b.sceneId) || null,
      sceneEmo: (b && b.sceneEmo) || null,
      userEmo: (b && b.userEmo) || null,
      isVoid: !!(b && b.isVoid),
    });
  }
  function reset() { run.memoryId = null; run.beats = []; run.active = false; }
  function getRun() { return { memoryId: run.memoryId, beats: run.beats.slice(), active: run.active }; }

  // Piece positions of the last bake, per memory: { memoryId: { sceneKey: {x,z} } }
  var _pieces = {};
  function getPiecePos(memoryId, sceneId) {
    var m = _pieces[memoryId];
    if (!m) return null;
    return m[String(sceneId)] || null;
  }

  // 접근 가능(열린) 장면들 — 그 판은 맨땅으로 미리 솟는다 (체험해야 감정이 새겨짐).
  var _accessible = {};
  function setAccessibleScenes(memoryId, sceneIds) {
    if (!memoryId) return;
    var map = {};
    (sceneIds || []).forEach(function (id) { if (id != null) map[String(id)] = true; });
    _accessible[memoryId] = map;
  }

  // ─────────────────── heightfield helpers ───────────────────
  function heightAndGrad(h, G, x, z) {
    var xi = Math.floor(x), zi = Math.floor(z);
    var fx = x - xi, fz = z - zi;
    var i00 = zi * G + xi;
    var h00 = h[i00], h10 = h[i00 + 1], h01 = h[i00 + G], h11 = h[i00 + G + 1];
    return {
      h: h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz,
      gx: (h10 - h00) * (1 - fz) + (h11 - h01) * fz,
      gz: (h01 - h00) * (1 - fx) + (h11 - h10) * fx,
    };
  }
  function depositAt(h, G, x, z, amt) {
    if (amt <= 0) return;
    var xi = Math.floor(x), zi = Math.floor(z);
    var fx = x - xi, fz = z - zi;
    h[zi * G + xi] += amt * (1 - fx) * (1 - fz);
    h[zi * G + xi + 1] += amt * fx * (1 - fz);
    h[(zi + 1) * G + xi] += amt * (1 - fx) * fz;
    h[(zi + 1) * G + xi + 1] += amt * fx * fz;
  }
  function erodeAt(h, G, x, z, amt) {
    if (amt <= 0) return;
    var cx = Math.round(x), cz = Math.round(z), ws = 0, i, xx, zz;
    for (i = 0; i < BRUSH.length; i++) {
      xx = cx + BRUSH[i].dx; zz = cz + BRUSH[i].dz;
      if (xx < 0 || xx >= G || zz < 0 || zz >= G) continue;
      ws += BRUSH[i].w;
    }
    if (ws <= 0) return;
    for (i = 0; i < BRUSH.length; i++) {
      xx = cx + BRUSH[i].dx; zz = cz + BRUSH[i].dz;
      if (xx < 0 || xx >= G || zz < 0 || zz >= G) continue;
      h[zz * G + xx] -= amt * BRUSH[i].w / ws;
    }
  }
  // One droplet: born on the transition path (piece → piece), thrown along
  // the journey direction. Its soil pouch conserves mass — what it digs on
  // the pieces it drops in the void gap = the SEAM grows from the journey.
  function dropOne(h, G, x, z, dx, dz, rng) {
    var speed = 1, water = 1, sediment = 0, life, g, l, nx, nz, gn, dh, cap, dep, ero, ang;
    for (life = 0; life < PHYS.maxSteps; life++) {
      if (x < 1 || x > G - 3 || z < 1 || z > G - 3) break;
      g = heightAndGrad(h, G, x, z);
      dx = dx * PHYS.inertia - g.gx * (1 - PHYS.inertia);
      dz = dz * PHYS.inertia - g.gz * (1 - PHYS.inertia);
      l = Math.sqrt(dx * dx + dz * dz);
      if (l < 1e-8) { ang = rng() * Math.PI * 2; dx = Math.cos(ang); dz = Math.sin(ang); l = 1; }
      dx /= l; dz /= l;
      nx = x + dx; nz = z + dz;
      if (nx < 1 || nx > G - 3 || nz < 1 || nz > G - 3) { depositAt(h, G, x, z, sediment); return; }
      gn = heightAndGrad(h, G, nx, nz);
      dh = gn.h - g.h;
      cap = Math.max(-dh, PHYS.minSlope) * speed * water * PHYS.capacity;
      if (dh > 0) {
        dep = Math.min(dh, sediment);
        depositAt(h, G, x, z, dep); sediment -= dep;
      } else if (sediment > cap) {
        dep = (sediment - cap) * PHYS.deposit;
        depositAt(h, G, x, z, dep); sediment -= dep;
      } else {
        ero = Math.min((cap - sediment) * PHYS.erode, -dh);
        erodeAt(h, G, x, z, ero); sediment += ero;
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * PHYS.gravity));
      water *= (1 - PHYS.evaporate);
      x = nx; z = nz;
      if (water < 0.02) break;
    }
    if (x >= 1 && x <= G - 3 && z >= 1 && z <= G - 3) depositAt(h, G, x, z, sediment);
  }
  // Too-steep slopes crumble to rest angle (mass conserving).
  function thermal(h, G, iters) {
    var TAL = 0.5, RATE = 0.125, it, z, x, i, d, mv;
    for (it = 0; it < iters; it++) {
      for (z = 1; z < G - 1; z++) {
        for (x = 1; x < G - 1; x++) {
          i = z * G + x;
          d = h[i] - h[i - 1]; if (d > TAL) { mv = (d - TAL) * RATE; h[i] -= mv; h[i - 1] += mv; }
          d = h[i] - h[i + 1]; if (d > TAL) { mv = (d - TAL) * RATE; h[i] -= mv; h[i + 1] += mv; }
          d = h[i] - h[i - G]; if (d > TAL) { mv = (d - TAL) * RATE; h[i] -= mv; h[i - G] += mv; }
          d = h[i] - h[i + G]; if (d > TAL) { mv = (d - TAL) * RATE; h[i] -= mv; h[i + G] += mv; }
        }
      }
    }
  }

  // ─────────────────── quilt piece layout ───────────────────
  // TRUE PATCHWORK: square panels on a lattice, each new panel sewn EDGE-TO-
  // EDGE to the previous one (seeded self-avoiding walk — journey order, NOT
  // an emotion plane; emotion coords live only inside a panel).
  // Computed in WORLD units so every bake resolution agrees on positions.
  function layoutPiecesWorld(n, SZ, rng) {
    if (n <= 0) return [];
    var R = n <= 12 ? 10 : 8;                 // half panel size (world units)
    var step = 2 * R;                         // pitch: panels touch edge-to-edge
    var maxIdx = Math.max(1, Math.floor((SZ / 2 - R - 2) / step));
    var occupied = {}, cells = [{ i: 0, j: 0 }];
    occupied['0,0'] = true;
    var ci = 0, cj = 0;
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    function shuffledDirs() {
      var d = DIRS.slice();
      for (var x = d.length - 1; x > 0; x--) {
        var y = (rng() * (x + 1)) | 0;
        var t = d[x]; d[x] = d[y]; d[y] = t;
      }
      return d;
    }
    function tryFrom(bi, bj) {
      var ds = shuffledDirs();
      for (var d = 0; d < 4; d++) {
        var ni = bi + ds[d][0], nj = bj + ds[d][1];
        if (Math.abs(ni) > maxIdx || Math.abs(nj) > maxIdx) continue;
        if (occupied[ni + ',' + nj]) continue;
        occupied[ni + ',' + nj] = true;
        cells.push({ i: ni, j: nj });
        ci = ni; cj = nj;
        return true;
      }
      return false;
    }
    for (var k = 1; k < n; k++) {
      var placed = tryFrom(ci, cj);
      // walk stuck → branch from a random earlier panel (still edge-sewn)
      var guard = 0;
      while (!placed && guard < cells.length * 4) {
        var base = cells[(rng() * cells.length) | 0];
        placed = tryFrom(base.i, base.j);
        guard++;
      }
      if (!placed) cells.push({ i: ci, j: cj }); // give up gracefully (overlap)
    }
    return cells.map(function (c) { return { wx: c.i * step, wz: c.j * step, R: R }; });
  }

  // ─────────────────── drop-in field computer ───────────────────
  // Same contract as computeAfTerrainFields: {G, SZ, H2, hts, cls, minH, maxH}
  function computeFields(P, filterIdx, opt, helpers) {
    if (!helpers || !helpers.VA_ANCHORS || !helpers.hashWorldOffset) return null;
    var ANCH = helpers.VA_ANCHORS;
    var VADF = helpers.VAD_FULL || {};

    opt = opt || {};
    var G = opt.G != null ? opt.G : 160;
    var SZ = opt.SZ != null ? opt.SZ : 112;
    var H2 = SZ / 2;
    var hts = new Float32Array(G * G);
    var cls = new Float32Array(G * G * 3);

    var layers = filterIdx == null
      ? P.map(function (m, mi) { return { m: m, mi: mi }; })
      : (P[filterIdx] ? [{ m: P[filterIdx], mi: filterIdx }] : []);

    function gridToWorld(x, z) {
      return { x: (x / (G - 1) - 0.5) * SZ, z: (z / (G - 1) - 0.5) * SZ };
    }

    var simplex = makeSimplex(mulberry32(seedFromString(layers.length ? layers[0].m.id : 'tem')));

    // ── void floor: the dark sea of un-experienced space ──
    var iz, ix;
    for (iz = 0; iz < G; iz++) {
      for (ix = 0; ix < G; ix++) {
        hts[iz * G + ix] = FLOOR + 0.7 * simplex(ix * 0.05, iz * 0.05);
      }
    }

    var totalBeats = 0;

    layers.forEach(function (layer) {
      var m = layer.m;
      var rng = mulberry32(seedFromString(m.id) ^ 0x9E3779B9);
      var sceneAF = m.sceneAF || [];
      if (!sceneAF.length) return;

      // ── pieces: one per scene, journey-order chain (world units) ──
      var cellsPerWorld = (G - 1) / SZ;
      var piecesW = layoutPiecesWorld(sceneAF.length, SZ, rng);
      // convert to THIS bake's grid cells
      var pieces = piecesW.map(function (p) {
        return {
          cx: (p.wx / SZ + 0.5) * (G - 1),
          cz: (p.wz / SZ + 0.5) * (G - 1),
          R: p.R * cellsPerWorld,
        };
      });
      var bySceneId = {};
      var rec = {};
      sceneAF.forEach(function (sc, i) {
        bySceneId[String(sc.id)] = i;
        rec[String(sc.id)] = { x: piecesW[i].wx, z: piecesW[i].wz };
      });
      _pieces[m.id] = rec;

      // ── beats ──
      // 체험 중(run active): 오직 이번 run의 박자만 — 완료한 장면의 판만 태어난다.
      // run 없음(admin/archive): 작가 첫 서술 여정 전체를 굽는다 (보존 전시).
      var isLiveRun = run.active && run.memoryId === m.id;
      var beats;
      if (isLiveRun) {
        beats = run.beats.map(function (b) {
          var pi = b.sceneId != null && bySceneId[String(b.sceneId)] != null
            ? bySceneId[String(b.sceneId)] : null;
          var mat = b.sceneEmo || b.userEmo || {};
          var empty = !b.isVoid && Object.keys(mat).length === 0;
          return { pieceIdx: pi, mat: mat, userEmo: b.userEmo || null, isVoid: b.isVoid || empty || pi == null };
        });
      } else {
        beats = sceneAF.map(function (sc, i) {
          return { pieceIdx: i, mat: sc.emo || {}, isVoid: (sc.voidScore || 0) > 0.5 };
        });
      }
      totalBeats += beats.length;

      var pieceRisen = {};

      // panel mask: quilt panel = rounded SQUARE (superellipse), flat plateau
      // with a steep rim — reads as a sewn patch, not a hill blob.
      function panelMask(dx, dz, Rr) {
        var t = Math.pow(Math.abs(dx) / Rr, 4) + Math.pow(Math.abs(dz) / Rr, 4);
        if (t >= 1.08) return 0;
        if (t <= 0.72) return 1;
        return Math.max(0, 1 - (t - 0.72) / 0.36);
      }

      // panel plateau: the patch rises out of the void floor
      function risePiece(pc) {
        var Rr = pc.R;
        var x0 = Math.max(0, Math.floor(pc.cx - Rr - 2)), x1 = Math.min(G - 1, Math.ceil(pc.cx + Rr + 2));
        var z0 = Math.max(0, Math.floor(pc.cz - Rr - 2)), z1 = Math.min(G - 1, Math.ceil(pc.cz + Rr + 2));
        for (var zz = z0; zz <= z1; zz++) {
          for (var xx = x0; xx <= x1; xx++) {
            var s = panelMask(xx - pc.cx, zz - pc.cz, Rr);
            if (s <= 0) continue;
            var lift = (0 - FLOOR) * s + 0.8 * s * simplex(xx * 0.09 + 7.7, zz * 0.09 - 3.1);
            var idx = zz * G + xx;
            // lift the floor toward plateau (only up, so re-rising is idempotent)
            var target = FLOOR + lift;
            if (hts[idx] < target) hts[idx] = target;
          }
        }
      }

      // local lobes INSIDE the piece — kinship layout scaled into the patch
      function upliftBeat(bt) {
        if (bt.isVoid || bt.pieceIdx == null) return;
        var pc = pieces[bt.pieceIdx];
        if (!pieceRisen[bt.pieceIdx]) { risePiece(pc); pieceRisen[bt.pieceIdx] = true; }
        var Rr = pc.R;
        for (var k in bt.mat) {
          var w = Number(bt.mat[k] || 0);
          if (!w || !ANCH[k]) continue;
          var a01 = VADF[k] ? (VADF[k].a + 1) / 2 : 0.5;
          var lx = pc.cx + ANCH[k].v * Rr * 0.55;
          var lz = pc.cz + ANCH[k].a * Rr * 0.55;
          var sig = Rr * (0.16 + 0.16 * (1 - a01));   // aroused → tight/sharp
          var amp = 8.5 * w;
          var ec = ANCH[k].color || [0.5, 0.5, 0.5];
          var Rb = Math.ceil(sig * 3);
          var x0 = Math.max(0, Math.floor(lx - Rb)), x1 = Math.min(G - 1, Math.ceil(lx + Rb));
          var z0 = Math.max(0, Math.floor(lz - Rb)), z1 = Math.min(G - 1, Math.ceil(lz + Rb));
          for (var zz = z0; zz <= z1; zz++) {
            for (var xx = x0; xx <= x1; xx++) {
              var ddx = xx - lx, ddz = zz - lz;
              var env = Math.exp(-(ddx * ddx + ddz * ddz) / (2 * sig * sig));
              if (env < 0.004) continue;
              // panel mask: emotion never leaks outside its patch
              var mask = panelMask(xx - pc.cx, zz - pc.cz, Rr);
              if (mask <= 0) continue;
              var v = amp * env * mask;
              if (a01 > 0.05) v += env * mask * a01 * w * 2.0 * simplex(xx * 0.18 + 31.7, zz * 0.18 - 11.3);
              var idx = zz * G + xx;
              hts[idx] += v;
              var ci = idx * 3;
              cls[ci] += ec[0] * env * mask * w * 0.16;
              cls[ci + 1] += ec[1] * env * mask * w * 0.16;
              cls[ci + 2] += ec[2] * env * mask * w * 0.16;
            }
          }
        }
      }

      // waypoint: piece center nudged toward the beat's felt lobes
      function waypointOf(bt) {
        if (bt.isVoid || bt.pieceIdx == null) return null;
        var pc = pieces[bt.pieceIdx];
        var src = bt.userEmo || bt.mat || {};
        var sx = 0, sz = 0, sw = 0;
        for (var k in src) {
          var w = Number(src[k] || 0);
          if (!w || !ANCH[k]) continue;
          sx += (pc.cx + ANCH[k].v * pc.R * 0.45) * w;
          sz += (pc.cz + ANCH[k].a * pc.R * 0.45) * w;
          sw += w;
        }
        if (sw <= 0) return { x: pc.cx, z: pc.cz };
        return { x: sx / sw, z: sz / sw };
      }

      // transition water: crosses the void gap between pieces → carves the
      // pieces' flanks and DEPOSITS the seam bridge in between (이음새)
      function waterTransition(A, B) {
        var ddx = B.x - A.x, ddz = B.z - A.z;
        var dist = Math.sqrt(ddx * ddx + ddz * ddz);
        var ndx = dist > 1e-6 ? ddx / dist : 0;
        var ndz = dist > 1e-6 ? ddz / dist : 0;
        var count = Math.round(60 + 240 * Math.min(1, dist / (G * 0.4)));
        for (var i = 0; i < count; i++) {
          var t = rng();
          var px = A.x + ddx * t + (rng() * 2 - 1) * 2.2;
          var pz = A.z + ddz * t + (rng() * 2 - 1) * 2.2;
          var dx = ndx, dz = ndz;
          if (dist <= 1e-6) { var ang = rng() * Math.PI * 2; dx = Math.cos(ang); dz = Math.sin(ang); }
          dropOne(hts, G,
            Math.min(G - 3, Math.max(1, px)),
            Math.min(G - 3, Math.max(1, pz)),
            dx, dz, rng);
        }
        thermal(hts, G, 2);
      }

      // ── 열린 장면의 판: 맨땅(빈 터)으로 먼저 솟는다 — 유령이 설 자리.
      // 체험 전엔(박자 0) 아무것도 없다: 첫 대화가 끝나야 세상이 생기기 시작.
      if (isLiveRun && run.beats.length > 0) {
        var acc = _accessible[m.id] || {};
        sceneAF.forEach(function (sc, i) {
          if (acc[String(sc.id)] && !pieceRisen[i]) {
            risePiece(pieces[i]);
            pieceRisen[i] = true;
          }
        });
      }

      // ── replay: move-then-rise per beat (§9.1, non-commutative) ──
      var prevWp = null;
      beats.forEach(function (bt) {
        var wp = waypointOf(bt);
        if (prevWp && wp) waterTransition(prevWp, wp);
        if (!bt.isVoid && bt.pieceIdx != null) {
          upliftBeat(bt);
          prevWp = wp;
        } else {
          prevWp = null; // void: the path breaks — no seam across this gap
        }
      });
    });

    // ── color floor + clamp ──
    // "아무것도 없음": 공허 바닥은 순흑에 가깝게 — 배경과 구분되지 않아야 한다.
    // 판(FLOOR 위로 솟은 곳)만 바닥 밝기를 받는다.
    var i3, ci3, av, tq;
    for (i3 = 0; i3 < G * G; i3++) {
      ci3 = i3 * 3;
      tq = Math.max(0, Math.min(1, (hts[i3] - FLOOR) / 3.5));
      av = (cls[ci3] + cls[ci3 + 1] + cls[ci3 + 2]) / 3;
      cls[ci3] = Math.min(1, Math.max(0, cls[ci3] * 0.85 + av * 0.15 + 0.04 * tq + 0.003));
      cls[ci3 + 1] = Math.min(1, Math.max(0, cls[ci3 + 1] * 0.85 + av * 0.15 + 0.04 * tq + 0.003));
      cls[ci3 + 2] = Math.min(1, Math.max(0, cls[ci3 + 2] * 0.85 + av * 0.15 + 0.055 * tq + 0.005));
    }

    var minH = Infinity, maxH = -Infinity, i;
    for (i = 0; i < G * G; i++) {
      if (hts[i] < minH) minH = hts[i];
      if (hts[i] > maxH) maxH = hts[i];
    }
    // buildTerrain normalizes (minH..maxH) into a FIXED 20-unit vertical span —
    // an empty void (tiny range) would get stretched into fake mountains.
    // Declare a stable reference range instead: empty run = low flat floor,
    // panels rise proportionally as they are born.
    minH = Math.min(minH, FLOOR);
    maxH = Math.max(maxH, FLOOR + 18);
    console.log('[replay-terrain] 퀼트 굽기 완료 — 기억 ' + layers.length + '개, 이번 run 박자 ' + run.beats.length + '개');
    return { G: G, SZ: SZ, H2: H2, hts: hts, cls: cls, minH: minH, maxH: maxH };
  }

  global.TemReplayTerrain = {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    beginRun: beginRun,
    beat: beat,
    reset: reset,
    getRun: getRun,
    getPiecePos: getPiecePos,
    setAccessibleScenes: setAccessibleScenes,
    computeFields: computeFields,
    _version: '0.4-patchwork',
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.TemReplayTerrain;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

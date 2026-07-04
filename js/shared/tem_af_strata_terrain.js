/**
 * TEM AF Strata Terrain — shared core (Attribution × Core Fear plane + play bumps)
 * Used by strataView.js and af-terrain-test-page.js
 */
(function (global) {
  'use strict';

  var AX = { self_blame: -1, other_blame: 0, fate_blame: 1 };
  var FZ = { abandonment: -1, rejection: -0.33, powerlessness: 0.33, loss: 1 };
  var E2A = {
    fear: { s: 0.2, o: 0.1, f: 0.7 }, sadness: { s: 0.3, o: 0.1, f: 0.6 }, anger: { s: 0.1, o: 0.7, f: 0.2 },
    guilt: { s: 0.8, o: 0.05, f: 0.15 }, shame: { s: 0.75, o: 0.15, f: 0.1 }, joy: { s: 0.3, o: 0.3, f: 0.4 },
    numbness: { s: 0.15, o: 0.05, f: 0.8 }, isolation: { s: 0.3, o: 0.3, f: 0.4 }, longing: { s: 0.2, o: 0.2, f: 0.6 },
    resentment: { s: 0.1, o: 0.8, f: 0.1 }, resignation: { s: 0.1, o: 0.05, f: 0.85 }, hope: { s: 0.2, o: 0.2, f: 0.6 },
    relief: { s: 0.2, o: 0.1, f: 0.7 }, love: { s: 0.15, o: 0.3, f: 0.55 }, gratitude: { s: 0.15, o: 0.35, f: 0.5 },
    peace: { s: 0.15, o: 0.15, f: 0.7 }, confusion: { s: 0.3, o: 0.2, f: 0.5 },
  };
  var E2F = {
    fear: { a: 0.15, r: 0.1, p: 0.55, l: 0.2 }, sadness: { a: 0.3, r: 0.1, p: 0.1, l: 0.5 },
    anger: { a: 0.1, r: 0.3, p: 0.5, l: 0.1 }, guilt: { a: 0.2, r: 0.25, p: 0.15, l: 0.4 },
    shame: { a: 0.15, r: 0.6, p: 0.1, l: 0.15 }, joy: { a: 0.15, r: 0.15, p: 0.15, l: 0.55 },
    numbness: { a: 0.3, r: 0.1, p: 0.4, l: 0.2 }, isolation: { a: 0.6, r: 0.25, p: 0.1, l: 0.05 },
    longing: { a: 0.55, r: 0.15, p: 0.05, l: 0.25 }, resentment: { a: 0.15, r: 0.35, p: 0.4, l: 0.1 },
    resignation: { a: 0.2, r: 0.05, p: 0.6, l: 0.15 }, hope: { a: 0.2, r: 0.15, p: 0.15, l: 0.5 },
    relief: { a: 0.1, r: 0.1, p: 0.3, l: 0.5 }, love: { a: 0.4, r: 0.2, p: 0.1, l: 0.3 },
    gratitude: { a: 0.2, r: 0.15, p: 0.1, l: 0.55 }, peace: { a: 0.15, r: 0.1, p: 0.15, l: 0.6 },
    confusion: { a: 0.2, r: 0.2, p: 0.4, l: 0.2 },
  };
  var EC = {
    fear: [0.4, 0.28, 0.7], sadness: [0.25, 0.38, 0.65], anger: [0.8, 0.25, 0.22], guilt: [0.6, 0.48, 0.35],
    longing: [0.28, 0.62, 0.65], numbness: [0.32, 0.32, 0.38], shame: [0.58, 0.35, 0.48], isolation: [0.14, 0.14, 0.24],
    joy: [0.82, 0.72, 0.38], resentment: [0.6, 0.2, 0.15], resignation: [0.4, 0.38, 0.35], hope: [0.55, 0.65, 0.45],
    relief: [0.48, 0.68, 0.48], love: [0.7, 0.4, 0.5], gratitude: [0.65, 0.58, 0.4], peace: [0.45, 0.58, 0.52],
    confusion: [0.48, 0.38, 0.55],
  };

  function pX(d) {
    var x = 0; var w = 0;
    for (var k in d) {
      if (Object.prototype.hasOwnProperty.call(d, k) && AX[k] !== undefined && d[k] > 0) { x += d[k] * AX[k]; w += d[k]; }
    }
    return w > 0 ? Math.max(-1, Math.min(1, x / w)) : 0;
  }
  function pZ(d) {
    var z = 0; var w = 0;
    for (var k in d) {
      if (Object.prototype.hasOwnProperty.call(d, k) && FZ[k] !== undefined && d[k] > 0) { z += d[k] * FZ[k]; w += d[k]; }
    }
    return w > 0 ? Math.max(-1, Math.min(1, z / w)) : 0;
  }
  function eA(ev) {
    var r = { self_blame: 0, other_blame: 0, fate_blame: 0 }; var t = 0;
    for (var e in ev) {
      if (!Object.prototype.hasOwnProperty.call(ev, e)) continue;
      var m = E2A[e]; var i = ev[e];
      if (!m || i <= 0) continue;
      r.self_blame += i * m.s; r.other_blame += i * m.o; r.fate_blame += i * m.f; t += i;
    }
    if (t <= 0) return { self_blame: 0.33, other_blame: 0.33, fate_blame: 0.34 };
    r.self_blame /= t; r.other_blame /= t; r.fate_blame /= t;
    return r;
  }
  function eF(ev) {
    var r = { abandonment: 0, rejection: 0, powerlessness: 0, loss: 0 }; var t = 0;
    for (var e in ev) {
      if (!Object.prototype.hasOwnProperty.call(ev, e)) continue;
      var m = E2F[e]; var i = ev[e];
      if (!m || i <= 0) continue;
      r.abandonment += i * m.a; r.rejection += i * m.r; r.powerlessness += i * m.p; r.loss += i * m.l; t += i;
    }
    if (t <= 0) return { abandonment: 0.25, rejection: 0.25, powerlessness: 0.25, loss: 0.25 };
    r.abandonment /= t; r.rejection /= t; r.powerlessness /= t; r.loss /= t;
    return r;
  }
  function getDom(ev) {
    var mk = 'numbness'; var mv = 0;
    for (var k in ev) {
      if (!Object.prototype.hasOwnProperty.call(ev, k)) continue;
      var v = ev[k];
      if (v > mv && EC[k]) { mk = k; mv = v; }
    }
    return mk;
  }

  // ─── VAD projection (contour-test 동일) ─────────────────────
  var VAD_FULL = {
    fear:{v:-0.9,a:0.9,d:-0.8}, sadness:{v:-0.8,a:-0.4,d:-0.7}, anger:{v:-0.7,a:0.8,d:0.3},
    guilt:{v:-0.8,a:0.2,d:-0.6}, shame:{v:-0.9,a:-0.2,d:-0.9}, isolation:{v:-0.7,a:-0.5,d:-0.6},
    numbness:{v:-0.6,a:-0.8,d:-0.4}, longing:{v:-0.3,a:0.2,d:-0.2}, resentment:{v:-0.5,a:0.6,d:0.1},
    resignation:{v:-0.4,a:-0.6,d:-0.5}, joy:{v:0.9,a:0.6,d:0.5}, hope:{v:0.7,a:0.4,d:0.6},
    relief:{v:0.6,a:-0.3,d:0.4}, gratitude:{v:0.8,a:-0.2,d:0.7}, love:{v:1.0,a:0.5,d:0.6},
    peace:{v:0.8,a:-0.6,d:0.7}, confusion:{v:-0.4,a:0.3,d:-0.5},
  };

  // VA-space anchors: emotion → {v, a} position + EC color
  var VA_ANCHORS = {};
  (function () {
    for (var ek in EC) {
      var vad = VAD_FULL[ek];
      if (!vad) continue;
      VA_ANCHORS[ek] = { v: vad.v, a: vad.a, color: EC[ek] };
    }
  })();

  function projectToVAD(emoVec) {
    var V = 0, A = 0, wSum = 0;
    for (var k in emoVec) {
      if (!Object.prototype.hasOwnProperty.call(emoVec, k)) continue;
      var w = Number(emoVec[k] || 0);
      var m = VAD_FULL[k];
      if (!w || !m) continue;
      V += w * m.v; A += w * m.a; wSum += w;
    }
    if (wSum <= 0) return { v: 0, a: 0 };
    return { v: Math.max(-1, Math.min(1, V / wSum)), a: Math.max(-1, Math.min(1, A / wSum)) };
  }

  function computeVAWeights(vad, anchors) {
    var weights = {}; var totalW = 0;
    for (var name in anchors) {
      var anc = anchors[name];
      var dv = vad.v - anc.v; var da = vad.a - anc.a;
      var dist2 = dv * dv + da * da;
      var w = Math.exp(-dist2 / 0.5);
      if (w > 0.01) { weights[name] = w; totalW += w; }
    }
    if (totalW > 0) { for (var k in weights) weights[k] /= totalW; }
    return weights;
  }

  function playAlignment(play) {
    if (play.alignment != null) return Number(play.alignment);
    if (play.alignment_score != null) return Number(play.alignment_score);
    return 0.5;
  }

  function hashWorldOffset(id) {
    var h = 5381;
    var s = String(id);
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = Math.abs(h);
    var ang = (h % 628) / 100;
    var mag = 1.4 + (h % 700) / 180;
    return { ox: Math.cos(ang) * mag, oz: Math.sin(ang * 1.07) * mag };
  }

  function hs(x, y) { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
  function sN(x, y) {
    var ix = Math.floor(x); var iy = Math.floor(y); var fx = x - ix; var fy = y - iy;
    var sx = fx * fx * (3 - 2 * fx); var sy = fy * fy * (3 - 2 * fy);
    return hs(ix, iy) * (1 - sx) * (1 - sy) + hs(ix + 1, iy) * sx * (1 - sy) + hs(ix, iy + 1) * (1 - sx) * sy + hs(ix + 1, iy + 1) * sx * sy;
  }
  function fb(x, y, o) {
    var v = 0; var a = 0.5; var f = 1;
    for (var i = 0; i < (o || 4); i++) { v += a * sN(x * f, y * f); a *= 0.5; f *= 2.1; }
    return v;
  }
  function sR(s) {
    var v = s;
    return function () { v = (v * 16807) % 2147483647; return v / 2147483647; };
  }

  /**
   * @param {Array<{id:string,title?:string,memory_words?:string,completed_sentence?:string}>} mems
   * @param {Record<string, Array>} playsByMem memory_id -> plays
   */
  function buildMemoryItems(mems, playsByMem, scenesByMem) {
    var H2 = 56;
    return mems.map(function (m) {
      var plays = playsByMem[m.id] || [];
      var scenes = (scenesByMem && scenesByMem[m.id]) || [];
      var merged = {};
      plays.forEach(function (p) {
        if (!p.user_emotion) return;
        var ue = p.user_emotion;
        if (typeof ue === 'string') {
          try { ue = JSON.parse(ue); } catch (_) { return; }
        }
        for (var k in ue) {
          if (!Object.prototype.hasOwnProperty.call(ue, k)) continue;
          var val = ue[k];
          merged[k] = (merged[k] || 0) + (typeof val === 'number' ? val : 0);
        }
      });
      var n = plays.length || 1;
      for (var kk in merged) merged[kk] /= n;

      var attr = eA(Object.keys(merged).length ? merged : { numbness: 1 });
      var fear = eF(Object.keys(merged).length ? merged : { numbness: 1 });
      var af = { x: pX(attr), z: pZ(fear) };
      var off = hashWorldOffset(m.id);

      // VA 좌표: pillar 위치를 Valence × Arousal 공간에 배치
      var mergedVad = projectToVAD(Object.keys(merged).length ? merged : { numbness: 1 });
      var pillarVx = mergedVad.v * H2 + off.ox;
      var pillarVz = mergedVad.a * H2 + off.oz;

      // 장면별 VA 좌표 (original_emotion 궤적)
      var sceneAF = [];
      scenes.forEach(function (sc, si) {
        var emo = sc.original_emotion;
        if (!emo) return;
        if (typeof emo === 'string') { try { emo = JSON.parse(emo); } catch (_) { return; } }
        var scVad = projectToVAD(emo);
        // emotion magnitude (벡터 크기)
        var eMag = 0;
        for (var ek in emo) { if (typeof emo[ek] === 'number') eMag += emo[ek] * emo[ek]; }
        eMag = Math.sqrt(eMag);
        // dominant emotion category for noise pattern
        var domK = ''; var domV = 0;
        for (var dk in emo) { if (emo[dk] > domV) { domV = emo[dk]; domK = dk; } }
        // void score (0~1 continuous)
        var vi = sc.void_info;
        if (typeof vi === 'string') { try { vi = JSON.parse(vi); } catch (_) { vi = null; } }
        var voidScore = 0;
        if (vi) {
          if (vi.sceneVoid) voidScore += 0.33;
          if (vi.emotionVoid) voidScore += 0.33;
          if (vi.reasonVoid) voidScore += 0.34;
        }
        sceneAF.push({
          id: sc.id,
          order: sc.scene_order != null ? sc.scene_order : si,
          wx: scVad.v * H2 + off.ox,
          wz: scVad.a * H2 + off.oz,
          emo: emo,
          eMag: eMag,
          domEmo: domK,
          voidScore: voidScore,
          echoWords: sc.echo_words || [],
        });
      });

      // contamination data from memory row
      var cont = {
        drift: Number(m.cont_drift) || 0,
        fixation: Number(m.cont_fixation) || 0,
        divergence: Number(m.cont_divergence) || 0,
        convergence: Number(m.cont_convergence) || 0,
        heterogeneity: Number(m.cont_heterogeneity) || 0,
        depth: Number(m.cont_depth) || 0,
        stage: m.cont_stage || 'stable',
        stage1: Number(m.cont_stage_1) || 0,
        stage2: Number(m.cont_stage_2) || 0,
        stage3: Number(m.cont_stage_3) || 0,
        dilution: m.dilution != null ? Number(m.dilution) : 100,
        driftDir: { v: Number(m.drift_dir_v) || 0, a: Number(m.drift_dir_a) || 0, d: Number(m.drift_dir_d) || 0 },
        sensoryAnchor: m.sensory_anchor || null,
        alignMean: Number(m._cont_align_mean) || 0.5,
      };

      // mismatch type distribution from plays
      var mismatchDist = { emotion: 0, attribution: 0, target: 0, void_m: 0, none: 0 };
      plays.forEach(function (p) {
        var mt = p.mismatch_type || 'none';
        if (mt === 'emotion_mismatch') mismatchDist.emotion++;
        else if (mt === 'attribution_mismatch') mismatchDist.attribution++;
        else if (mt === 'target_displacement') mismatchDist.target++;
        else if (mt === 'void_mismatch') mismatchDist.void_m++;
        else mismatchDist.none++;
      });
      var mtTotal = plays.length || 1;
      cont.mismatch = {
        emotion: mismatchDist.emotion / mtTotal,
        attribution: mismatchDist.attribution / mtTotal,
        target: mismatchDist.target / mtTotal,
        void_m: mismatchDist.void_m / mtTotal,
        none: mismatchDist.none / mtTotal,
      };

      return {
        id: m.id,
        t: m.title || m.completed_sentence || m.memory_words || '(untitled)',
        plays: plays,
        pc: plays.length,
        emo: Object.keys(merged).length ? merged : { numbness: 0.5 },
        attr: attr,
        fear: fear,
        af: af,
        pillarWx: pillarVx,
        pillarWz: pillarVz,
        sceneAF: sceneAF,
        cont: cont,
      };
    });
  }

  /**
   * AF 높이·색 필드 (3D 메시 / 2D 등고선 공통). `createStrataTerrain().buildTerrain`과 동일 수식.
   * @param {Array} P `buildMemoryItems` 결과
   * @param {number|null} filterIdx null = 전체 기억 합산
   * @param {{ G?: number, SZ?: number }} opt 기본 G=72, SZ=46 (Three 쪽과 동일)
   * @returns {{ G:number, SZ:number, H2:number, hts:Float32Array, cls:Float32Array, minH:number, maxH:number }}
   */
  // ─── Emotion category → noise parameters ──────────────────
  var EMO_NOISE = {
    // high arousal + negative → sharp ridges
    fear:       { freq: 0.25, lac: 2.4, oct: 5, amp: 1.0 },
    anger:      { freq: 0.22, lac: 2.5, oct: 5, amp: 1.1 },
    resentment: { freq: 0.20, lac: 2.3, oct: 4, amp: 0.9 },
    // low arousal + negative → deep gentle basin
    sadness:    { freq: 0.08, lac: 2.0, oct: 4, amp: 0.7 },
    numbness:   { freq: 0.06, lac: 1.8, oct: 3, amp: 0.5 },
    resignation:{ freq: 0.07, lac: 1.9, oct: 3, amp: 0.6 },
    isolation:  { freq: 0.09, lac: 2.0, oct: 4, amp: 0.65 },
    // positive → soft rolling hills
    joy:        { freq: 0.12, lac: 2.0, oct: 4, amp: 0.8 },
    hope:       { freq: 0.11, lac: 2.0, oct: 4, amp: 0.75 },
    love:       { freq: 0.10, lac: 1.9, oct: 4, amp: 0.85 },
    relief:     { freq: 0.10, lac: 2.0, oct: 3, amp: 0.7 },
    gratitude:  { freq: 0.11, lac: 2.0, oct: 3, amp: 0.7 },
    peace:      { freq: 0.09, lac: 1.8, oct: 3, amp: 0.65 },
    // ambivalent → irregular, asymmetric
    guilt:      { freq: 0.15, lac: 2.6, oct: 5, amp: 0.8 },
    shame:      { freq: 0.16, lac: 2.7, oct: 5, amp: 0.75 },
    confusion:  { freq: 0.18, lac: 2.8, oct: 5, amp: 0.7 },
    longing:    { freq: 0.13, lac: 2.2, oct: 4, amp: 0.8 },
  };
  var EMO_NOISE_DEFAULT = { freq: 0.12, lac: 2.0, oct: 4, amp: 0.7 };

  function fbCustom(x, y, freq, lac, oct, amp) {
    var v = 0; var a = amp * 0.5; var f = freq;
    for (var i = 0; i < oct; i++) { v += a * sN(x * f, y * f); a *= 0.5; f *= lac; }
    return v;
  }

  function computeAfTerrainFields(P, filterIdx, opt) {
    // ── ADDITIVE §9 replay-terrain provider (default OFF) ──
    // docs/생성형_지형모델_v2-260619.md §9. flag: localStorage.tem_replay_terrain='1' or ?replay_terrain=1
    // Rollback: delete this block (provider lives in js/shared/tem_replay_terrain.js).
    var _RT = global.TemReplayTerrain;
    if (_RT && _RT.isEnabled && _RT.isEnabled()) {
      try {
        var _rf = _RT.computeFields(P, filterIdx, opt, {
          VA_ANCHORS: VA_ANCHORS,
          VAD_FULL: VAD_FULL,
          hashWorldOffset: hashWorldOffset,
        });
        if (_rf) return _rf;
      } catch (_rtErr) {
        console.warn('[strata] replay terrain provider failed — falling back to original', _rtErr);
      }
    }
    opt = opt || {};
    var G = opt.G != null ? opt.G : 160;
    var SZ = opt.SZ != null ? opt.SZ : 112;
    var H2 = SZ / 2;
    var hts = new Float32Array(G * G);
    var cls = new Float32Array(G * G * 3);

    var layers = filterIdx == null
      ? P.map(function (m, mi) { return { m: m, mi: mi }; })
      : (P[filterIdx] ? [{ m: P[filterIdx], mi: filterIdx }] : []);

    // ─── Pass 1: Bedrock — scene-based height from original_emotion ──
    layers.forEach(function (layer) {
      var m = layer.m; var mi = layer.mi;
      var scenes = m.sceneAF || [];
      var cont = m.cont || {};
      var drift = cont.drift || 0;
      var driftDir = cont.driftDir || { v: 0, a: 0, d: 0 };
      var divergence = cont.divergence || 0;
      var convergence = cont.convergence || 0;
      var heterogeneity = cont.heterogeneity || 0;
      var dilutionRaw = cont.dilution != null ? cont.dilution : 100;
      var erosionStrength = 1 - dilutionRaw / 100; // 0=pristine, 1=fully eroded

      if (!scenes.length) return;

      // Compute domain warp offset field (drift → terrain distortion)
      var warpStrength = drift * 8; // max 8 world units displacement
      var warpDirX = driftDir.v || 0.5;
      var warpDirZ = driftDir.a || 0.5;
      var warpDirLen = Math.sqrt(warpDirX * warpDirX + warpDirZ * warpDirZ) || 1;
      warpDirX /= warpDirLen; warpDirZ /= warpDirLen;

      for (var iz = 0; iz < G; iz++) {
        for (var ix = 0; ix < G; ix++) {
          var idx = iz * G + ix;
          var gx = (ix / (G - 1) - 0.5) * SZ;
          var gz = (iz / (G - 1) - 0.5) * SZ;

          // Domain warping: displace sample coordinates
          var warpN = fb(gx * 0.04 + mi * 7, gz * 0.04, 3);
          var wx = gx + warpN * warpStrength * warpDirX;
          var wz = gz + warpN * warpStrength * warpDirZ;

          var totalH = 0;
          var ci = idx * 3;

          // Each scene distributes bumps across VA_ANCHORS (like old play system)
          for (var si = 0; si < scenes.length; si++) {
            var sc = scenes[si];
            var scVad = projectToVAD(sc.emo);
            var scWeights = computeVAWeights(scVad, VA_ANCHORS);
            var np = EMO_NOISE[sc.domEmo] || EMO_NOISE_DEFAULT;

            for (var ancName in scWeights) {
              var aw = scWeights[ancName];
              if (!aw || !VA_ANCHORS[ancName]) continue;
              var anc = VA_ANCHORS[ancName];
              var off2 = hashWorldOffset(m.id);
              var ax = anc.v * H2 + off2.ox;
              var az = anc.a * H2 + off2.oz;
              var ddx = wx - ax; var ddz = wz - az;
              var dist = Math.sqrt(ddx * ddx + ddz * ddz);
              var radius = 10 + aw * 22;
              if (dist >= radius * 1.8) continue;

              var sig = radius * 0.55;
              var inf = Math.exp(-(dist * dist) / (2 * sig * sig)) * aw;

              // Emotion-specific noise pattern
              var emoNoise = fbCustom(wx * np.freq * 0.7 + si * 5, wz * np.freq * 0.7 + si * 3, np.freq * 0.7, np.lac, np.oct, np.amp);

              // Height = magnitude × anchor weight × gaussian × emotion noise
              var dh = sc.eMag * 22 * inf * (0.4 + emoNoise * 0.6);

              // Surface roughness from heterogeneity
              dh += heterogeneity * (hs(wx * 0.25 + si + ancName.length, wz * 0.25) - 0.5) * 2.5 * inf;

              totalH += dh;

              // Vertex color from anchor emotion color
              var ec2 = anc.color || [0.5, 0.5, 0.5];
              var cI = inf * 0.12;
              cls[ci] += ec2[0] * cI; cls[ci + 1] += ec2[1] * cI; cls[ci + 2] += ec2[2] * cI;
            }

            // Void: force deep hole at scene's own VA position
            if (sc.voidScore > 0.3) {
              var vddx = wx - sc.wx; var vddz = wz - sc.wz;
              var vdist = Math.sqrt(vddx * vddx + vddz * vddz);
              var vSig = 8;
              var voidInf = Math.exp(-(vdist * vdist) / (2 * vSig * vSig));
              totalH -= sc.voidScore * 14 * voidInf;
            }
          }

          // Domain warping erosion (1-dilution → grotesque distortion)
          if (erosionStrength > 0.05) {
            var erN = fb(wx * 0.06 + 100, wz * 0.06, 4);
            totalH += (erN - 0.4) * erosionStrength * 6;
          }

          hts[idx] += totalH;
        }
      }

      // ─── Pass 2: Tectonic — divergence fissures + per-scene convergence terracing ──
      if (divergence > 0.05 || convergence > 0.05) {
        // Pre-compute per-scene convergence: scenes with high play alignment → high local convergence
        var sceneConvData = [];
        if (convergence > 0.05 && scenes.length > 0) {
          var playsByScene = {};
          m.plays.forEach(function (p) {
            if (!p.scene_id) return;
            if (!playsByScene[p.scene_id]) playsByScene[p.scene_id] = [];
            playsByScene[p.scene_id].push(p);
          });
          scenes.forEach(function (sc) {
            var sPlays = playsByScene[sc.id] || [];
            if (sPlays.length < 2) return; // need multiple plays to converge
            // Scene convergence = how similar the plays are (low alignment variance = high convergence)
            var alSum = 0; var alSum2 = 0;
            sPlays.forEach(function (p) {
              var al = playAlignment(p);
              alSum += al; alSum2 += al * al;
            });
            var mean = alSum / sPlays.length;
            var variance = alSum2 / sPlays.length - mean * mean;
            // Low variance + high mean = strong convergence at this scene
            var localConv = convergence * Math.max(0, 1 - variance * 8) * Math.min(1, sPlays.length / 10);
            if (localConv > 0.05) {
              sceneConvData.push({ wx: sc.wx, wz: sc.wz, conv: localConv, radius: 12 + localConv * 10 });
            }
          });
        }

        for (var iz2 = 0; iz2 < G; iz2++) {
          for (var ix2 = 0; ix2 < G; ix2++) {
            var idx2 = iz2 * G + ix2;
            var gx2 = (ix2 / (G - 1) - 0.5) * SZ;
            var gz2 = (iz2 / (G - 1) - 0.5) * SZ;

            // Fissures: noise-based cracks, depth controlled by divergence
            if (divergence > 0.05) {
              var fissN = fb(gx2 * 0.12 + mi * 13, gz2 * 0.12, 4);
              var fissThresh = 1.0 - divergence * 0.5;
              if (fissN > fissThresh) {
                var fissDepth = (fissN - fissThresh) / (1 - fissThresh);
                hts[idx2] -= fissDepth * divergence * 15;
              }
            }

            // Per-scene terracing: only near scenes with converged plays
            if (sceneConvData.length > 0) {
              var maxLocalConv = 0;
              for (var sci = 0; sci < sceneConvData.length; sci++) {
                var scd = sceneConvData[sci];
                var sdx = gx2 - scd.wx; var sdz = gz2 - scd.wz;
                var sDist = Math.sqrt(sdx * sdx + sdz * sdz);
                if (sDist < scd.radius) {
                  var falloff = 1 - (sDist / scd.radius);
                  falloff = falloff * falloff; // quadratic falloff
                  var lc = scd.conv * falloff;
                  if (lc > maxLocalConv) maxLocalConv = lc;
                }
              }
              if (maxLocalConv > 0.08) {
                var steps = 3 + Math.round(maxLocalConv * 8);
                var h = hts[idx2];
                hts[idx2] = Math.round(h * steps / 10) * 10 / steps;
              }
            }
          }
        }
      }
    });

    // ─── Pass 3: Global base noise + color finalization ──────
    var cont0 = (layers.length && layers[0].m.cont) ? layers[0].m.cont : {};
    var dilNorm = cont0.dilution != null ? cont0.dilution / 100 : 1; // 1=pristine, 0=fully diluted

    for (var iz3 = 0; iz3 < G; iz3++) for (var ix3 = 0; ix3 < G; ix3++) {
      var idx3 = iz3 * G + ix3;
      // Base terrain noise (always present, gives texture even with no scenes)
      hts[idx3] += (fb(ix3 * 0.025, iz3 * 0.025, 5) - 0.4) * 2.0;

      var ci3 = idx3 * 3;
      // Ensure minimum color (not pure black)
      var av = (cls[ci3] + cls[ci3 + 1] + cls[ci3 + 2]) / 3;
      cls[ci3] = cls[ci3] * 0.85 + av * 0.15 + 0.04;
      cls[ci3 + 1] = cls[ci3 + 1] * 0.85 + av * 0.15 + 0.04;
      cls[ci3 + 2] = cls[ci3 + 2] * 0.85 + av * 0.15 + 0.055;

      // Dilution desaturation: lower dilution → greyer
      if (dilNorm < 0.95) {
        var grey3 = (cls[ci3] + cls[ci3 + 1] + cls[ci3 + 2]) / 3;
        var desat = 1 - dilNorm;
        cls[ci3]     = cls[ci3]     * (1 - desat * 0.7) + grey3 * desat * 0.7;
        cls[ci3 + 1] = cls[ci3 + 1] * (1 - desat * 0.7) + grey3 * desat * 0.7;
        cls[ci3 + 2] = cls[ci3 + 2] * (1 - desat * 0.7) + grey3 * desat * 0.7;
      }

      // _cont_align_mean → color temperature
      // high alignment (>0.5) = warm amber tint, low (<0.5) = cold blue tint
      var alMean = cont0.alignMean != null ? cont0.alignMean : 0.5;
      var tempShift = (alMean - 0.5) * 2; // -1 to +1
      if (tempShift > 0.05) {
        // warm: boost R, slight G, reduce B
        cls[ci3]     += tempShift * 0.06;
        cls[ci3 + 1] += tempShift * 0.025;
        cls[ci3 + 2] -= tempShift * 0.03;
      } else if (tempShift < -0.05) {
        // cold: reduce R, boost B
        cls[ci3]     += tempShift * 0.04;
        cls[ci3 + 1] += tempShift * 0.01;
        cls[ci3 + 2] -= tempShift * 0.06;
      }

      // mismatch_type distribution → color staining
      var mm = cont0.mismatch || {};
      // emotion_mismatch → red-violet stain (감정 불일치 = 붉은 얼룩)
      if (mm.emotion > 0.1) {
        var emN = fb(ix3 * 0.08 + 50, iz3 * 0.08, 3);
        if (emN > (1 - mm.emotion * 0.6)) {
          var emStr = mm.emotion * 0.15;
          cls[ci3]     += emStr * 0.8;
          cls[ci3 + 1] -= emStr * 0.3;
          cls[ci3 + 2] += emStr * 0.4;
        }
      }
      // attribution_mismatch → sickly yellow-green (귀인 불일치 = 탁한 황록)
      if (mm.attribution > 0.1) {
        var atN = fb(ix3 * 0.09 + 80, iz3 * 0.09, 3);
        if (atN > (1 - mm.attribution * 0.6)) {
          var atStr = mm.attribution * 0.12;
          cls[ci3]     += atStr * 0.3;
          cls[ci3 + 1] += atStr * 0.5;
          cls[ci3 + 2] -= atStr * 0.3;
        }
      }
      // target_displacement → dark teal stain (대상 전이 = 어두운 틸)
      if (mm.target > 0.1) {
        var tgN = fb(ix3 * 0.07 + 120, iz3 * 0.07, 3);
        if (tgN > (1 - mm.target * 0.5)) {
          var tgStr = mm.target * 0.12;
          cls[ci3]     -= tgStr * 0.2;
          cls[ci3 + 1] += tgStr * 0.3;
          cls[ci3 + 2] += tgStr * 0.5;
        }
      }
      // void_mismatch → dark desaturation patches (공백 불일치 = 검은 반점)
      if (mm.void_m > 0.1) {
        var vmN = fb(ix3 * 0.1 + 160, iz3 * 0.1, 3);
        if (vmN > (1 - mm.void_m * 0.5)) {
          var vmStr = mm.void_m * 0.2;
          cls[ci3]     *= (1 - vmStr);
          cls[ci3 + 1] *= (1 - vmStr);
          cls[ci3 + 2] *= (1 - vmStr);
        }
      }

      // Clamp colors
      cls[ci3] = Math.min(1, Math.max(0, cls[ci3]));
      cls[ci3 + 1] = Math.min(1, Math.max(0, cls[ci3 + 1]));
      cls[ci3 + 2] = Math.min(1, Math.max(0, cls[ci3 + 2]));
    }

    var minH = Infinity; var maxH = -Infinity;
    for (var i = 0; i < G * G; i++) {
      if (hts[i] < minH) minH = hts[i];
      if (hts[i] > maxH) maxH = hts[i];
    }
    return { G: G, SZ: SZ, H2: H2, hts: hts, cls: cls, minH: minH, maxH: maxH };
  }

  /**
   * @param {typeof THREE} THREE
   * @param {HTMLCanvasElement} canvas
   * @param {{ fogColor?: number, fogDensity?: number, clearColor?: number, onTerrainBuilt?: function(filterIdx:number|null, P:Array, totalPlays:number):void }} opts
   */
  function createStrataTerrain(THREE, canvas, opts) {
    opts = opts || {};
    var G = 160; var SZ = 112; var H2 = SZ / 2;
    var scene3; var camera; var renderer; var controls;
    var terrain; var terrainWire; var seedGrp;
    var sD = []; var P = [];
    var terrainMemFilter = null;
    var hts; var cls; var pos;
    // ─── Per-scene plate registry (ADDITIVE — only populated when buildTerrain({perScenePlates:true})). ──
    // 비어 있으면(_plates.length===0) gH 는 기존 단일-메쉬 경로(_gHBase)로만 동작한다. 롤백 = 이 배열을 안 채우면 끝.
    // 각 항목: { sceneId, group(THREE.Group), worldAABB:{minX,maxX,minZ,maxZ}, G_k, SZ_k, hts_k(Float32Array), pos_k, posY, sclX, sclZ, sclY }
    var _plates = [];
    var _perScenePlatesFlag = false; // runtime toggle; default false = 기존 단일-메쉬 경로만.
    var time = 0;
    var parts; var pVl; var oP1; var oP2; var pc2 = 800;

    function disposeTerrainLayer() {
      if (terrain) {
        scene3.remove(terrain);
        if (terrain.geometry) terrain.geometry.dispose();
        if (terrain.material) terrain.material.dispose();
        terrain = null;
      }
      if (terrainWire) {
        scene3.remove(terrainWire);
        if (terrainWire.geometry) terrainWire.geometry.dispose();
        if (terrainWire.material) terrainWire.material.dispose();
        terrainWire = null;
      }
      if (seedGrp) {
        scene3.remove(seedGrp);
        seedGrp.traverse(function (obj) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(function (mm) { mm.dispose(); });
            else obj.material.dispose();
          }
        });
        seedGrp = null;
      }
      _disposePlates();
    }

    // ─── Plate teardown — same seedGrp dispose pattern, ADDITIVE. ─────────
    function _disposePlates() {
      if (!_plates || !_plates.length) { _plates = []; return; }
      for (var pi = 0; pi < _plates.length; pi++) {
        var grp = _plates[pi].group;
        if (!grp) continue;
        if (scene3) scene3.remove(grp);
        grp.traverse(function (obj) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(function (mm) { mm.dispose(); });
            else obj.material.dispose();
          }
        });
      }
      _plates = [];
    }

    // ─── Shared bilinear height sampler ────────────────────────────────
    // posArr = packed XYZ vertex array (PlaneGeometry.attributes.position.array, Y = height).
    // (lx,lz) = LOCAL plane-space coords in [-SZk/2, +SZk/2]. 기존 단일-메쉬 gH 의 정확한 식 그대로.
    function _sampleHeight(posArr, gRes, szLocal, lx, lz) {
      var gx = ((lx / szLocal) + 0.5) * (gRes - 1); var gz = ((lz / szLocal) + 0.5) * (gRes - 1);
      var ix = Math.min(gRes - 2, Math.max(0, Math.floor(gx))); var iz = Math.min(gRes - 2, Math.max(0, Math.floor(gz)));
      var fx = gx - ix; var fz = gz - iz;
      return posArr[(iz * gRes + ix) * 3 + 1] * (1 - fx) * (1 - fz)
        + posArr[(iz * gRes + ix + 1) * 3 + 1] * fx * (1 - fz)
        + posArr[((iz + 1) * gRes + ix) * 3 + 1] * (1 - fx) * fz
        + posArr[((iz + 1) * gRes + ix + 1) * 3 + 1] * fx * fz;
    }

    // Existing single-mesh path — UNCHANGED behavior (was the body of gH). Used as fallback + when no plates.
    function _gHBase(wx, wz) {
      if (!pos) return 0;
      return _sampleHeight(pos, G, SZ, wx, wz);
    }

    // plate-aware dispatcher. 2-arg signature unchanged (호출처 0줄 수정).
    // _plates 비어 있으면 기존 단일-메쉬 경로(_gHBase)로 그대로 떨어진다.
    function gH(wx, wz) {
      if (_plates && _plates.length) {
        // Find the plate whose worldAABB contains (wx,wz).
        for (var pi = 0; pi < _plates.length; pi++) {
          var pl = _plates[pi];
          var ab = pl.worldAABB;
          if (wx >= ab.minX && wx <= ab.maxX && wz >= ab.minZ && wz <= ab.maxZ) {
            // Inverse transform world→local: undo position, then undo scale.
            var lx = (wx - pl.posX) / (pl.sclX || 1);
            var lz = (wz - pl.posZ) / (pl.sclZ || 1);
            var localY = _sampleHeight(pl.pos_k, pl.G_k, pl.SZ_k, lx, lz);
            return localY * (pl.sclY || 1) + pl.posY;
          }
        }
        // Not over any plate → base noise floor (gaps between plates).
        return _gHBase(wx, wz);
      }
      return _gHBase(wx, wz);
    }

    // ─── 3D anchor sprite factory ─────────────────────────────────
    function _makeAnchorSprite(text, color, playCount) {
      var cvs = document.createElement('canvas');
      var sz = 256;
      cvs.width = sz; cvs.height = sz;
      var ctx = cvs.getContext('2d');

      // Truncate long titles
      var label = text.length > 12 ? text.substring(0, 11) + '…' : text;

      // Glow background circle
      var grad = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz * 0.45);
      var r = Math.round(color.r * 255); var g2 = Math.round(color.g * 255); var b = Math.round(color.b * 255);
      grad.addColorStop(0, 'rgba(' + r + ',' + g2 + ',' + b + ',0.35)');
      grad.addColorStop(0.6, 'rgba(' + r + ',' + g2 + ',' + b + ',0.08)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, sz, sz);

      // Text
      ctx.fillStyle = 'rgba(' + Math.min(255, r + 80) + ',' + Math.min(255, g2 + 80) + ',' + Math.min(255, b + 80) + ',0.9)';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, sz / 2, sz / 2);

      // Play count indicator (small dots below)
      var dots = Math.min(playCount, 8);
      for (var d = 0; d < dots; d++) {
        var dx = sz / 2 + (d - dots / 2 + 0.5) * 8;
        ctx.fillStyle = 'rgba(' + r + ',' + g2 + ',' + b + ',0.6)';
        ctx.beginPath(); ctx.arc(dx, sz / 2 + 24, 2, 0, Math.PI * 2); ctx.fill();
      }

      var tex = new THREE.CanvasTexture(cvs);
      tex.needsUpdate = true;
      var mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        sizeAttenuation: true,
        fog: true,
      });
      var sprite = new THREE.Sprite(mat);
      sprite.scale.set(6, 6, 1);
      sprite.userData._isAnchorSprite = true;
      return sprite;
    }

    // ───────────────────────────────────────────────────────────────────
    // ADDITIVE: per-scene plate construction.
    // 각 장면 → 자기 PlaneGeometry(작은 격자) + 그 장면 emotion field(기존 노이즈 식 재활용,
    // 모양 distinctness 불필요 — 객체가 정체성 짐) → THREE.Group(scale/position 설정 가능).
    // 등록부 _plates 에 { sceneId, group, worldAABB, G_k, SZ_k, pos_k, posX/Z/Y, sclX/Z/Y } 적재.
    // 단일-메쉬 경로는 건드리지 않는다 — 이 함수가 안 불리면 _plates 는 빈 채로 남는다.
    // ───────────────────────────────────────────────────────────────────
    function _buildPlateLocalField(sc, Gk, SZk) {
      // Local plane: scene sits at local origin (0,0); field = emotion bump + noise, centered.
      var hts_k = new Float32Array(Gk * Gk);
      var np = EMO_NOISE[sc.domEmo] || EMO_NOISE_DEFAULT;
      var eMag = sc.eMag || 0.5;
      var voidScore = sc.voidScore || 0;
      var H2k = SZk / 2;
      for (var iz = 0; iz < Gk; iz++) {
        for (var ix = 0; ix < Gk; ix++) {
          var idx = iz * Gk + ix;
          var lx = (ix / (Gk - 1) - 0.5) * SZk;
          var lz = (iz / (Gk - 1) - 0.5) * SZk;
          var dist = Math.sqrt(lx * lx + lz * lz);
          var radius = H2k;
          var sig = radius * 0.55;
          var inf = Math.exp(-(dist * dist) / (2 * sig * sig));
          var emoNoise = fbCustom(lx * np.freq * 0.7, lz * np.freq * 0.7, np.freq * 0.7, np.lac, np.oct, np.amp);
          var h = eMag * 22 * inf * (0.4 + emoNoise * 0.6);
          // base texture even at edges (matches Pass 3 idea)
          h += (fb(ix * 0.05, iz * 0.05, 4) - 0.4) * 1.2;
          if (voidScore > 0.3) {
            var vSig = SZk * 0.12;
            var voidInf = Math.exp(-(dist * dist) / (2 * vSig * vSig));
            h -= voidScore * 14 * voidInf;
          }
          hts_k[idx] = h;
        }
      }
      return hts_k;
    }

    function _buildScenePlates(filterIdx) {
      _disposePlates();
      var memList = filterIdx == null
        ? P.map(function (mm, i) { return { m: mm, i: i }; })
        : (P[filterIdx] ? [{ m: P[filterIdx], i: filterIdx }] : []);

      var Gk = 32;      // per-plate grid resolution (cheap; scenes are small)
      var SZk = 24;     // per-plate local world size before scaling

      memList.forEach(function (sg) {
        var m = sg.m;
        var scenes = m.sceneAF || [];
        scenes.forEach(function (sc) {
          var hts_k = _buildPlateLocalField(sc, Gk, SZk);
          // Normalize to a modest local Y range, like single-mesh does (±10).
          var mn = Infinity, mx = -Infinity;
          for (var q = 0; q < hts_k.length; q++) { if (hts_k[q] < mn) mn = hts_k[q]; if (hts_k[q] > mx) mx = hts_k[q]; }
          var rg = (mx - mn) || 1;

          var geo = new THREE.PlaneGeometry(SZk, SZk, Gk - 1, Gk - 1); geo.rotateX(-Math.PI / 2);
          var pos_k = geo.attributes.position.array;
          for (var j = 0; j < Gk * Gk; j++) {
            pos_k[j * 3 + 1] = ((hts_k[j] - mn) / rg - 0.5) * 20;
          }
          geo.computeVertexNormals();
          var ec = EC[sc.domEmo] || [0.5, 0.5, 0.5];
          var mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(ec[0], ec[1], ec[2]),
            roughness: 0.82, metalness: 0.06, side: THREE.DoubleSide,
          });
          var mesh = new THREE.Mesh(geo, mat);
          var group = new THREE.Group();
          group.add(mesh);

          // Placement: plate centered at the scene's world VA position.
          var posX = sc.wx, posZ = sc.wz, posY = 0;
          var sclX = 1, sclZ = 1, sclY = 1; // identity scale; caller may override later via plate registry.
          group.position.set(posX, posY, posZ);
          group.scale.set(sclX, sclY, sclZ);

          var halfX = (SZk / 2) * sclX;
          var halfZ = (SZk / 2) * sclZ;
          _plates.push({
            sceneId: sc.id,
            group: group,
            worldAABB: { minX: posX - halfX, maxX: posX + halfX, minZ: posZ - halfZ, maxZ: posZ + halfZ },
            G_k: Gk, SZ_k: SZk, hts_k: hts_k, pos_k: pos_k,
            posX: posX, posZ: posZ, posY: posY,
            sclX: sclX, sclZ: sclZ, sclY: sclY,
          });
          if (scene3) scene3.add(group);
        });
      });
    }

    function buildTerrain(filterIdx, buildOpts) {
      // Accept buildTerrain(idx) OR buildTerrain({...}) OR buildTerrain(idx, {...}).
      if (filterIdx != null && typeof filterIdx === 'object') { buildOpts = filterIdx; filterIdx = (buildOpts.filterIdx != null ? buildOpts.filterIdx : null); }
      buildOpts = buildOpts || {};
      var usePlates = !!buildOpts.perScenePlates || !!_perScenePlatesFlag;
      terrainMemFilter = filterIdx;
      disposeTerrainLayer();
      var field = computeAfTerrainFields(P, filterIdx, { G: G, SZ: SZ });
      hts = field.hts;
      cls = field.cls;

      var geo = new THREE.PlaneGeometry(SZ, SZ, G - 1, G - 1); geo.rotateX(-Math.PI / 2);
      pos = geo.attributes.position.array; var colA = new Float32Array(pos.length);
      var mn = field.minH; var mx = field.maxH;
      var rg = mx - mn || 1;
      for (var j = 0; j < G * G; j++) {
        pos[j * 3 + 1] = ((hts[j] - mn) / rg - 0.5) * 20;
        var cj = j * 3;
        colA[cj] = Math.min(1, Math.max(0, cls[cj]));
        colA[cj + 1] = Math.min(1, Math.max(0, cls[cj + 1]));
        colA[cj + 2] = Math.min(1, Math.max(0, cls[cj + 2]));
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colA, 3)); geo.computeVertexNormals();
      var terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.06, side: THREE.DoubleSide });

      // ─── Shader patch: rock texture + strata layers ────────────
      var cont0 = P.length > 0 && P[0].cont ? P[0].cont : {};
      terrainMat.onBeforeCompile = function (shader) {
        // Uniforms for strata
        shader.uniforms._stage1 = { value: cont0.stage1 || 0 };
        shader.uniforms._stage2 = { value: cont0.stage2 || 0 };
        shader.uniforms._stage3 = { value: cont0.stage3 || 0 };
        shader.uniforms._contDepth = { value: Math.min(cont0.depth || 0, 50) };

        // Inject noise + varying + uniforms into fragment shader
        shader.fragmentShader = shader.fragmentShader.replace(
          'void main() {',
          [
            'varying vec3 vWPos;',
            'uniform float _stage1;',
            'uniform float _stage2;',
            'uniform float _stage3;',
            'uniform float _contDepth;',
            'float _h31(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}',
            'float _n31(vec3 p){',
            '  vec3 i=floor(p),f=fract(p);',
            '  f=f*f*(3.0-2.0*f);',
            '  return mix(mix(mix(_h31(i),_h31(i+vec3(1,0,0)),f.x),',
            '    mix(_h31(i+vec3(0,1,0)),_h31(i+vec3(1,1,0)),f.x),f.y),',
            '    mix(mix(_h31(i+vec3(0,0,1)),_h31(i+vec3(1,0,1)),f.x),',
            '    mix(_h31(i+vec3(0,1,1)),_h31(i+vec3(1,1,1)),f.x),f.y),f.z);',
            '}',
            'float _fbm3(vec3 p){',
            '  float v=0.0,a=0.5;',
            '  for(int i=0;i<4;i++){v+=a*_n31(p);p*=2.1;a*=0.5;}',
            '  return v;',
            '}',
            'void main() {',
          ].join('\n')
        );

        // Apply rock texture + strata layers before output
        shader.fragmentShader = shader.fragmentShader.replace(
          'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
          [
            'vec3 _wp = vWPos;',
            'float _grain = _fbm3(_wp * 8.0) * 0.12 - 0.06;',
            'float _slope = 1.0 - abs(dot(normal, vec3(0.0, 1.0, 0.0)));',
            'float _crevice = _slope * _slope * 0.15;',
            '',
            '// Strata layers visible on steep slopes (cliff faces)',
            'if (_slope > 0.3 && _contDepth > 0.5) {',
            '  float _strataY = _wp.y * (1.0 + _contDepth * 0.1);',
            '  float _band = fract(_strataY * 0.8 + _fbm3(_wp * 0.5) * 0.3);',
            '  vec3 _s1col = vec3(0.45, 0.32, 0.22);', // stage1: warm brown (biased tilt)
            '  vec3 _s2col = vec3(0.35, 0.22, 0.42);', // stage2: contrasting purple (juxtaposition)
            '  vec3 _s3col = vec3(0.55, 0.58, 0.62);', // stage3: cold geometric grey (hypercompletion)
            '  vec3 _strataTint = _s1col * _stage1 + _s2col * _stage2 + _s3col * _stage3;',
            '  float _strataStr = _slope * min(_contDepth / 10.0, 1.0) * 0.4;',
            '  float _bandEdge = smoothstep(0.45, 0.55, _band);',
            '  outgoingLight = mix(outgoingLight, _strataTint * (0.6 + _bandEdge * 0.4), _strataStr);',
            '}',
            '',
            'outgoingLight += _grain;',
            'outgoingLight -= _crevice;',
            'outgoingLight = max(outgoingLight, vec3(0.02));',
            'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
          ].join('\n')
        );

        // Vertex shader: pass world position
        shader.vertexShader = shader.vertexShader.replace(
          'void main() {',
          'varying vec3 vWPos;\nvoid main() {'
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <fog_vertex>',
          '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;'
        );
      };

      terrain = new THREE.Mesh(geo, terrainMat);
      scene3.add(terrain);
      terrainWire = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ wireframe: true, color: 0x221833, opacity: 0.02, transparent: true }));
      scene3.add(terrainWire);

      seedGrp = new THREE.Group(); sD = [];
      var memList = filterIdx == null
        ? P.map(function (mm, i) { return { m: mm, i: i }; })
        : (P[filterIdx] ? [{ m: P[filterIdx], i: filterIdx }] : []);

      // Place lights at scene positions
      memList.forEach(function (sg) {
        var m = sg.m; var mi = sg.i;
        var scenes = m.sceneAF || [];
        scenes.forEach(function (sc) {
          var wx = sc.wx; var wz = sc.wz; var h = gH(wx, wz);
          sD.push({ wx: wx, wz: wz, h: h, t: m.t, c: m.pc, idx: mi });
          var ec = EC[sc.domEmo] || [0.5, 0.5, 0.5];
          var col = new THREE.Color(ec[0], ec[1], ec[2]);
          var pl2 = new THREE.PointLight(col, 0.25, 15, 2);
          pl2.position.set(wx, h + 2, wz);
          seedGrp.add(pl2);
        });

        // Fixation crystals
        var cont = m.cont || {};
        if (cont.fixation > 0.3 && scenes.length > 0) {
          var fixScene = scenes[0];
          var fwx = fixScene.wx; var fwz = fixScene.wz; var fh = gH(fwx, fwz);
          var crystalH = 0.5 + cont.fixation * 3;
          var crystalGeo = new THREE.ConeGeometry(0.15 + cont.fixation * 0.3, crystalH, 5);
          var crystalMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a2a, emissive: 0x0a0a15, emissiveIntensity: 0.3,
            roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.85
          });
          var crystal = new THREE.Mesh(crystalGeo, crystalMat);
          crystal.position.set(fwx, fh + crystalH / 2, fwz);
          seedGrp.add(crystal);
          // Secondary tilted crystal
          if (cont.fixation > 0.6) {
            var c2 = new THREE.Mesh(crystalGeo.clone(), crystalMat.clone());
            c2.position.set(fwx + 0.5, fh + crystalH * 0.3, fwz + 0.3);
            c2.rotation.set(0.3, 0, -0.4);
            seedGrp.add(c2);
          }
        }
        // Echo words → floating text sprites
        scenes.forEach(function (sc) {
          var words = sc.echoWords;
          if (!words || !words.length) return;
          var ec3 = EC[sc.domEmo] || [0.5, 0.5, 0.5];
          var count = Math.min(2, words.length);
          for (var wi = 0; wi < count; wi++) {
            var word = words[wi];
            if (!word) continue;
            var angle = sc.order * 2.39 + wi * 1.8;
            var r2 = 2 + wi * 1.5;
            var ewx = sc.wx + Math.cos(angle) * r2;
            var ewz = sc.wz + Math.sin(angle) * r2;
            var ewh = gH(ewx, ewz);
            var cvs2 = document.createElement('canvas');
            var ctx2 = cvs2.getContext('2d');
            ctx2.font = '36px "Courier New", monospace';
            var tw = ctx2.measureText(word).width + 16;
            cvs2.width = Math.min(256, Math.max(64, Math.pow(2, Math.ceil(Math.log2(tw)))));
            cvs2.height = 48;
            ctx2.font = '36px "Courier New", monospace';
            ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
            ctx2.fillStyle = 'rgba(' + Math.round(ec3[0] * 255) + ',' + Math.round(ec3[1] * 255) + ',' + Math.round(ec3[2] * 255) + ',0.7)';
            ctx2.shadowColor = 'rgba(0,0,0,0.5)'; ctx2.shadowBlur = 4;
            ctx2.fillText(word, cvs2.width / 2, cvs2.height / 2);
            var tex2 = new THREE.CanvasTexture(cvs2);
            tex2.minFilter = THREE.LinearFilter;
            var spMat = new THREE.SpriteMaterial({ map: tex2, transparent: true, opacity: 0.55, fog: true, depthWrite: false });
            var sp = new THREE.Sprite(spMat);
            sp.scale.set(cvs2.width / 48, 1, 1);
            sp.position.set(ewx, ewh + 2 + wi * 1, ewz);
            sp.userData._floatingAnchor = { baseY: ewh + 2 + wi * 1, phase: sc.order * 1.3 + wi * 2.1, speed: 0.3 + Math.random() * 0.2 };
            seedGrp.add(sp);
          }
        });

        // Heterogeneity → debris (small rocks scattered on terrain)
        if (cont.heterogeneity > 0.15 && scenes.length > 0) {
          var debrisCount = Math.round(cont.heterogeneity * 40);
          var debrisGeo = new THREE.TetrahedronGeometry(0.12, 0);
          var debrisMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.9, metalness: 0.1 });
          var rng = sR(hashWorldOffset(m.id).ox * 1000 | 0);
          for (var di = 0; di < debrisCount; di++) {
            var dsc = scenes[di % scenes.length];
            var dAngle = rng() * Math.PI * 2;
            var dRad = 2 + rng() * 8;
            var dwx = dsc.wx + Math.cos(dAngle) * dRad;
            var dwz = dsc.wz + Math.sin(dAngle) * dRad;
            var dwh = gH(dwx, dwz);
            var debris = new THREE.Mesh(debrisGeo, debrisMat);
            debris.position.set(dwx, dwh + 0.06, dwz);
            debris.rotation.set(rng() * 3, rng() * 3, rng() * 3);
            var dScale = 0.5 + rng() * 1.5;
            debris.scale.set(dScale, dScale, dScale);
            seedGrp.add(debris);
          }
        }

        // Sensory anchor → particle type near first scene
        if (cont.sensoryAnchor && scenes.length > 0) {
          var sa = cont.sensoryAnchor;
          if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch (_) { sa = null; } }
          if (sa && sa.modality) {
            var saScene = scenes[0];
            var saCount = 60;
            var saGeo = new THREE.BufferGeometry();
            var saPos = new Float32Array(saCount * 3);
            var saVel = new Float32Array(saCount);
            for (var sai = 0; sai < saCount; sai++) {
              saPos[sai * 3]     = saScene.wx + (Math.random() - 0.5) * 12;
              saPos[sai * 3 + 1] = gH(saScene.wx, saScene.wz) + Math.random() * 8;
              saPos[sai * 3 + 2] = saScene.wz + (Math.random() - 0.5) * 12;
              saVel[sai] = 0.002 + Math.random() * 0.005;
            }
            saGeo.setAttribute('position', new THREE.BufferAttribute(saPos, 3));
            // modality → particle color+size
            var saColor = 0x8888aa; var saSize = 0.08;
            if (sa.modality === 'visual') { saColor = 0xc4a882; saSize = 0.12; }
            else if (sa.modality === 'auditory') { saColor = 0x6a9fd8; saSize = 0.15; }
            else if (sa.modality === 'tactile') { saColor = 0xd88a6a; saSize = 0.1; }
            else if (sa.modality === 'olfactory') { saColor = 0x7aaa6a; saSize = 0.1; }
            var saMat = new THREE.PointsMaterial({ color: saColor, size: saSize, transparent: true, opacity: 0.5, sizeAttenuation: true, fog: true });
            var saPts = new THREE.Points(saGeo, saMat);
            saPts.userData._sensoryParticle = { cx: saScene.wx, cz: saScene.wz, baseH: gH(saScene.wx, saScene.wz), vel: saVel, count: saCount };
            seedGrp.add(saPts);
          }
        }
      });
      scene3.add(seedGrp);

      // ADDITIVE: build per-scene plates only when explicitly opted in.
      // gH 가 _plates 를 보고 자동으로 plate-aware 로 전환됨 (호출처 수정 0).
      if (usePlates) {
        try {
          _buildScenePlates(filterIdx);
          // Q2: plate 가 실제로 만들어졌을 때만 단일-메쉬(terrain + terrainWire)를 숨겨
          // 이중표면(단일메쉬 + plate 동시 렌더)을 막는다. 메쉬는 그대로 두고 visible 만 끔
          // → gH/디스포즈 등 단일-메쉬 참조 코드는 손대지 않음.
          if (_plates && _plates.length > 0) {
            if (terrain) terrain.visible = false;
            if (terrainWire) terrainWire.visible = false;
          }
        }
        catch (e) {
          _disposePlates();
          // 실패 시 fallback: 단일-메쉬가 계속 보이도록 visible 복구.
          if (terrain) terrain.visible = true;
          if (terrainWire) terrainWire.visible = true;
          if (global.console) console.warn('[strata] perScenePlates build failed, fell back to single-mesh gH:', e);
        }
      }

      var totalPlays = 0;
      for (var pi = 0; pi < P.length; pi++) totalPlays += P[pi].pc;
      if (opts.onTerrainBuilt) opts.onTerrainBuilt(filterIdx, P, totalPlays);
    }

    function getViewportSize() {
      if (!canvas) return { w: global.innerWidth, h: global.innerHeight };
      var r = canvas.getBoundingClientRect();
      var w = r.width > 2 ? r.width : global.innerWidth;
      var h = r.height > 2 ? r.height : global.innerHeight;
      return { w: w, h: h };
    }

    function init() {
      if (!canvas || !THREE) return null;
      var vp0 = getViewportSize();
      scene3 = new THREE.Scene();
      scene3.background = new THREE.Color(opts.clearColor != null ? opts.clearColor : 0x12121a);
      scene3.fog = new THREE.FogExp2(opts.fogColor != null ? opts.fogColor : 0x12121a, opts.fogDensity != null ? opts.fogDensity : 0.008);

      camera = new THREE.PerspectiveCamera(50, vp0.w / vp0.h, 0.1, 500);
      camera.position.set(50, 35, 60);

      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setSize(vp0.w, vp0.h);
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;

      controls = new THREE.OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance = 8;
      controls.maxDistance = 160;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.target.set(0, -1, 0);

      scene3.add(new THREE.AmbientLight(0x1a1828, 1.3));
      var dl = new THREE.DirectionalLight(0xc4a882, 0.7);
      dl.position.set(40, 60, 30); dl.castShadow = true;
      dl.shadow.mapSize.set(1024, 1024);
      dl.shadow.camera.left = -50; dl.shadow.camera.right = 50; dl.shadow.camera.top = 50; dl.shadow.camera.bottom = -50;
      scene3.add(dl);
      var dl2 = new THREE.DirectionalLight(0x3a4a80, 0.3); dl2.position.set(-30, 40, -20); scene3.add(dl2);
      oP1 = new THREE.PointLight(0x7a3020, 0.4, 70); scene3.add(oP1);
      oP2 = new THREE.PointLight(0x203a7a, 0.25, 55); scene3.add(oP2);

      var bp = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x050509, roughness: 1 }));
      bp.rotation.x = -Math.PI / 2; bp.position.y = -10; scene3.add(bp);

      var pg2 = new THREE.BufferGeometry(); var pp2 = new Float32Array(pc2 * 3);
      pVl = new Float32Array(pc2);
      for (var i = 0; i < pc2; i++) {
        pp2[i * 3] = (Math.random() - 0.5) * SZ * 2;
        pp2[i * 3 + 1] = Math.random() * 30 - 8;
        pp2[i * 3 + 2] = (Math.random() - 0.5) * SZ * 2;
        pVl[i] = 0.002 + Math.random() * 0.006;
      }
      pg2.setAttribute('position', new THREE.BufferAttribute(pp2, 3));
      parts = new THREE.Points(pg2, new THREE.PointsMaterial({ color: 0x3a3a50, size: 0.1, transparent: true, opacity: 0.3, sizeAttenuation: true }));
      scene3.add(parts);

      // Axis markers removed — fog hides terrain edges instead

      return { scene: scene3, camera: camera, renderer: renderer, controls: controls };
    }

    function setP(newP) {
      P = newP || [];
    }

    function getP() { return P; }
    function getSeedData() { return sD; }

    function resize() {
      if (!camera || !renderer || !canvas) return;
      var vp = getViewportSize();
      camera.aspect = vp.w / vp.h;
      camera.updateProjectionMatrix();
      renderer.setSize(vp.w, vp.h);
    }

    function tick() {
      time += 0.004;
      if (controls) controls.update();
      if (oP1 && oP2) {
        oP1.position.set(Math.sin(time * 0.6) * 35, 8 + Math.sin(time * 0.3) * 4, Math.cos(time * 0.4) * 35);
        oP2.position.set(Math.cos(time * 0.5) * 28, 10, Math.sin(time * 0.7) * 28);
      }
      _tickSeedGrp();
      _tickParticles();
      if (renderer && scene3 && camera) renderer.render(scene3, camera);
    }

    var _baseFogColor = new THREE.Color(opts.fogColor != null ? opts.fogColor : 0x12121a);
    var _baseClearColor = new THREE.Color(opts.clearColor != null ? opts.clearColor : 0x12121a);

    function _tickSeedGrp() {
      if (!seedGrp) return;

      // ─── Fog color: stage-based tint + proximity emotion tint ──
      if (camera && scene3.fog && P.length > 0) {
        var cont = P[0].cont || {};
        var stageFogCol = _baseFogColor.clone();
        // Stage tints the base fog color
        if (cont.stage === 'biased_inclination') stageFogCol.offsetHSL(0.05, 0.05, 0.02); // warm shift
        else if (cont.stage === 'hypercompletion') stageFogCol.offsetHSL(-0.08, 0.03, -0.02); // cold shift

        if (sD.length > 0) {
          var camX = camera.position.x; var camZ = camera.position.z;
          var nearDist = Infinity; var nearIdx = -1;
          for (var si = 0; si < sD.length; si++) {
            var dx2 = camX - sD[si].wx; var dz2 = camZ - sD[si].wz;
            var d2 = dx2 * dx2 + dz2 * dz2;
            if (d2 < nearDist) { nearDist = d2; nearIdx = si; }
          }
          var nd = Math.sqrt(nearDist);
          var fogMix = Math.max(0, 1 - nd / 30);
          if (nearIdx >= 0 && fogMix > 0 && P[sD[nearIdx].idx]) {
            var nm = P[sD[nearIdx].idx];
            var nde = getDom(nm.emo); var nec = EC[nde] || [0.3, 0.3, 0.3];
            var tintCol = new THREE.Color(nec[0] * 0.25, nec[1] * 0.25, nec[2] * 0.25);
            scene3.fog.color.copy(stageFogCol).lerp(tintCol, fogMix * 0.5);
            scene3.background.copy(stageFogCol).lerp(tintCol, fogMix * 0.35);
          } else {
            scene3.fog.color.lerp(stageFogCol, 0.05);
            scene3.background.lerp(stageFogCol, 0.05);
          }
        } else {
          scene3.fog.color.lerp(stageFogCol, 0.05);
          scene3.background.lerp(stageFogCol, 0.05);
        }
      }

      seedGrp.children.forEach(function (c, i) {
        // Floating echo word sprites
        if (c.isSprite && c.userData._floatingAnchor) {
          var fa = c.userData._floatingAnchor;
          c.position.y = fa.baseY + Math.sin(time * fa.speed + fa.phase) * 0.6;
          if (c.material) c.material.opacity = 0.4 + Math.sin(time * 0.5 + fa.phase) * 0.15;
        }
        // Sensory particles
        if (c.isPoints && c.userData._sensoryParticle) {
          var sp = c.userData._sensoryParticle;
          var spArr = c.geometry.attributes.position;
          for (var ri = 0; ri < sp.count; ri++) {
            var ry = spArr.getY(ri) + sp.vel[ri];
            if (ry > sp.baseH + 10) ry = sp.baseH - 1;
            spArr.setY(ri, ry);
            spArr.setX(ri, spArr.getX(ri) + Math.sin(time * 0.4 + ri * 0.5) * 0.004);
            spArr.setZ(ri, spArr.getZ(ri) + Math.cos(time * 0.3 + ri * 0.7) * 0.004);
          }
          spArr.needsUpdate = true;
        }
        // Crystal pulse
        if (c.isMesh && c.geometry && c.geometry.type === 'ConeGeometry') {
          if (c.material && c.material.emissiveIntensity !== undefined) {
            c.material.emissiveIntensity = 0.2 + Math.sin(time * 1.5 + i * 0.9) * 0.15;
          }
        }
      });
    }

    function _tickParticles() {
      if (!parts || !parts.geometry || !parts.geometry.attributes.position) return;
      var pp = parts.geometry.attributes.position;
      for (var i = 0; i < pc2; i++) {
        var y = pp.getY(i) + pVl[i];
        if (y > 28) y = -8;
        pp.setY(i, y);
        pp.setX(i, pp.getX(i) + Math.sin(time + i * 0.3) * 0.0015);
      }
      pp.needsUpdate = true;
    }

    function focusCameraOnSeed() {
      if (!camera || !controls || !sD.length) return;
      var d = sD[0];
      var hh = gH(d.wx, d.wz);
      camera.position.set(d.wx + 22, hh + 14, d.wz + 22);
      controls.target.set(d.wx, hh, d.wz);
      controls.update();
    }

    function dispose() {
      disposeTerrainLayer();
      if (renderer) renderer.dispose();
    }

    // ─── First-person walk mode ──────────────────────────────────
    var _fpActive = false;
    var _fpSceneTransition = false; // true while entering scene overlay
    var _fpKeys = {};
    var _fpEuler = { yaw: 0, pitch: 0 };
    var _fpEyeHeight = 1.6;
    var _fpSpeed = 4.5;
    var _fpPos = { x: 0, z: 0 };
    var _fpVelocityY = 0;
    var _fpJumpHeight = 0;
    var _fpLastTime = 0;
    var _fpSavedCamPos = null;
    var _fpSavedTarget = null;

    function _fpOnKeyDown(e) {
      // Don't intercept keys when scene UI / ESC menu / lumen dialog is open (allow typing)
      var _scO = document.getElementById('sceneMode');
      var _esO = document.getElementById('escMenu');
      var _ldp = document.getElementById('lumenDialogPhase1');  // V2.1 Phase 1 multi-turn dialog
      if ((_scO && _scO.classList.contains('active')) ||
          (_esO && _esO.classList.contains('active')) ||
          _ldp) return;
      _fpKeys[e.code] = true;
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].indexOf(e.code) >= 0) e.preventDefault();
    }
    function _fpOnKeyUp(e) { _fpKeys[e.code] = false; }
    function _fpOnMouseMove(e) {
      if (!_fpActive) return;
      var _scM = document.getElementById('sceneMode');
      var _ldpM = document.getElementById('lumenDialogPhase1');  // V2.1 Phase 1
      if ((_scM && _scM.classList.contains('active')) || _ldpM) return;
      _fpEuler.yaw -= e.movementX * 0.002;
      _fpEuler.pitch -= e.movementY * 0.002;
      _fpEuler.pitch = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, _fpEuler.pitch));
    }

    function enterFirstPerson() {
      if (_fpActive || !camera || !canvas) return;
      _fpActive = true;
      _fpSavedCamPos = camera.position.clone();
      _fpSavedTarget = controls ? controls.target.clone() : new THREE.Vector3();
      if (controls) controls.enabled = false;
      camera.fov = 90;
      camera.updateProjectionMatrix();
      var target = _fpSavedTarget;
      _fpPos.x = target.x;
      _fpPos.z = target.z;
      var h0 = gH(_fpPos.x, _fpPos.z);
      camera.position.set(_fpPos.x, h0 + _fpEyeHeight, _fpPos.z);
      _fpEuler.yaw = 0;
      _fpEuler.pitch = 0;
      _fpLastTime = performance.now();
      // Pointer lock requires user gesture — defer to next click
      var _plRetry = function () {
        if (_fpActive && !document.pointerLockElement) {
          canvas.requestPointerLock().catch(function () {});
        }
        canvas.removeEventListener('click', _plRetry);
      };
      canvas.addEventListener('click', _plRetry);
      document.addEventListener('keydown', _fpOnKeyDown);
      document.addEventListener('keyup', _fpOnKeyUp);
      document.addEventListener('mousemove', _fpOnMouseMove);
    }

    function exitFirstPerson() {
      if (!_fpActive) return;
      _fpActive = false;
      document.removeEventListener('keydown', _fpOnKeyDown);
      document.removeEventListener('keyup', _fpOnKeyUp);
      document.removeEventListener('mousemove', _fpOnMouseMove);
      if (document.pointerLockElement) document.exitPointerLock();
      _fpKeys = {};
      camera.fov = 50;
      camera.updateProjectionMatrix();
      if (controls) controls.enabled = true;
      if (_fpSavedCamPos) camera.position.copy(_fpSavedCamPos);
      if (_fpSavedTarget && controls) { controls.target.copy(_fpSavedTarget); controls.update(); }
    }

    function _fpTick() {
      if (!_fpActive) return;
      var now = performance.now();
      var dt = Math.min((now - _fpLastTime) / 1000, 0.1);
      _fpLastTime = now;
      // Freeze movement while scene UI / lumen dialog (V2.1 Phase 1) is open. Terrain keeps rendering.
      var _sceneOpen = document.getElementById('sceneMode');
      var _ldpOpen = document.getElementById('lumenDialogPhase1');
      if ((_sceneOpen && _sceneOpen.classList.contains('active')) || _ldpOpen) {
        _fpLastTime = now;
        // walk_effects는 매 프레임 camera.position.y가 논리 baseline으로 리셋된다고 가정한다.
        // 씬/대화 모드에서 position을 리셋하지 않으면 breath/bob 오프셋이 누적되어 자이로드롭 발생.
        var _frozenH = gH(_fpPos.x, _fpPos.z);
        if (_frozenH < -10) _frozenH = -10;
        camera.position.set(_fpPos.x, _frozenH + _fpEyeHeight + _fpJumpHeight, _fpPos.z);
        camera.rotation.set(_fpEuler.pitch, _fpEuler.yaw, 0, 'YXZ');
        return;
      }
      var forward = { x: -Math.sin(_fpEuler.yaw), z: -Math.cos(_fpEuler.yaw) };
      var right   = { x:  Math.cos(_fpEuler.yaw), z: -Math.sin(_fpEuler.yaw) };
      var mx = 0, mz = 0;
      if (_fpKeys['KeyW'] || _fpKeys['ArrowUp'])    { mx += forward.x; mz += forward.z; }
      if (_fpKeys['KeyS'] || _fpKeys['ArrowDown'])   { mx -= forward.x; mz -= forward.z; }
      if (_fpKeys['KeyA'] || _fpKeys['ArrowLeft'])    { mx -= right.x;   mz -= right.z;   }
      if (_fpKeys['KeyD'] || _fpKeys['ArrowRight'])   { mx += right.x;   mz += right.z;   }
      var len = Math.sqrt(mx * mx + mz * mz);
      if (len > 0) { mx /= len; mz /= len; }

      _fpPos.x += mx * _fpSpeed * dt;
      _fpPos.z += mz * _fpSpeed * dt;

      var half = SZ / 2 + 3;
      _fpPos.x = Math.max(-half, Math.min(half, _fpPos.x));
      _fpPos.z = Math.max(-half, Math.min(half, _fpPos.z));
      var terrainH = gH(_fpPos.x, _fpPos.z);
      if (terrainH < -10) terrainH = -10;

      // Jump (Space)
      var onGround = _fpJumpHeight <= 0;
      if (onGround && (_fpKeys['Space'])) {
        _fpVelocityY = 7;
      }
      _fpVelocityY -= 18 * dt; // gravity
      _fpJumpHeight += _fpVelocityY * dt;
      if (_fpJumpHeight < 0) { _fpJumpHeight = 0; _fpVelocityY = 0; }

      camera.position.set(_fpPos.x, terrainH + _fpEyeHeight + _fpJumpHeight, _fpPos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(_fpEuler.pitch, _fpEuler.yaw, 0);
    }

    var _origTick = tick;
    tick = function () {
      if (_fpActive) {
        _fpTick();
        time += 0.004;
        if (oP1 && oP2) {
          oP1.position.set(Math.sin(time * 0.6) * 35, 8 + Math.sin(time * 0.3) * 4, Math.cos(time * 0.4) * 35);
          oP2.position.set(Math.cos(time * 0.5) * 28, 10, Math.sin(time * 0.7) * 28);
        }
        _tickSeedGrp();
        _tickParticles();
        if (renderer && scene3 && camera) renderer.render(scene3, camera);
      } else {
        _origTick();
      }
    };

    document.addEventListener('pointerlockchange', function () {
      if (!_fpActive) return;
      if (document.pointerLockElement) return; // lock acquired, nothing to do

      // Pointer lock was released while in 1st person
      if (_fpSceneTransition) return;

      var scM = document.getElementById('sceneMode');
      var escM = document.getElementById('escMenu');
      var isOverlay = (scM && scM.classList.contains('active')) || (escM && escM.classList.contains('active'));
      var isFpPlay = typeof window._fpPlay !== 'undefined' && window._fpPlay && window._fpPlay.isActive && window._fpPlay.isActive();

      if (isOverlay || isFpPlay) {
        // Don't exit, but re-acquire pointer lock on next click
        if (canvas) {
          var _relock = function () {
            if (_fpActive && !document.pointerLockElement) {
              try { canvas.requestPointerLock(); } catch (_) {}
            }
            canvas.removeEventListener('click', _relock);
          };
          canvas.addEventListener('click', _relock);
        }
        return;
      }

      exitFirstPerson();
    });

    return {
      init: init,
      setP: setP,
      getP: getP,
      buildTerrain: buildTerrain,
      resize: resize,
      tick: tick,
      getCamera: function () { return camera; },
      getScene: function () { return scene3; },
      getRenderer: function () { return renderer; },
      getControls: function () { return controls; },
      getSeedData: getSeedData,
      gH: gH,
      // ADDITIVE per-scene plate controls (default off). 켜면 다음 buildTerrain 부터 plate 경로.
      setPerScenePlates: function (v) { _perScenePlatesFlag = !!v; },
      getPerScenePlates: function () { return _perScenePlatesFlag; },
      getPlates: function () { return _plates; },
      focusCameraOnSeed: focusCameraOnSeed,
      dispose: dispose,
      enterFirstPerson: enterFirstPerson,
      exitFirstPerson: exitFirstPerson,
      isFirstPerson: function () { return _fpActive; },
      setSceneTransition: function (v) { _fpSceneTransition = !!v; },
      setYaw: function (y) { _fpEuler.yaw = y; },
      getYaw: function () { return _fpEuler.yaw; },
    };
  }

  global.TemAfStrataTerrain = {
    buildMemoryItems: buildMemoryItems,
    computeAfTerrainFields: computeAfTerrainFields,
    createStrataTerrain: function (THREE, canvas, opts) {
      var rt = createStrataTerrain(THREE, canvas, opts);
      global.TemAfStrataTerrain._lastRuntime = rt;
      return rt;
    },
    playAlignment: playAlignment,
    _lastRuntime: null,
    _eA: eA, _eF: eF, _pX: pX, _pZ: pZ, _hashWorldOffset: hashWorldOffset,
    _E2A: E2A, _E2F: E2F,
  };
})(typeof window !== 'undefined' ? window : this);

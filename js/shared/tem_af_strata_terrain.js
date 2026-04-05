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
    var H2 = 23;
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

      // C방식: 장면별 AF 좌표 (original_emotion 궤적)
      var sceneAF = [];
      scenes.forEach(function (sc, si) {
        var emo = sc.original_emotion;
        if (!emo) return;
        if (typeof emo === 'string') { try { emo = JSON.parse(emo); } catch (_) { return; } }
        sceneAF.push({
          id: sc.id,
          order: sc.scene_order != null ? sc.scene_order : si,
          wx: pX(eA(emo)) * H2 + off.ox,
          wz: pZ(eF(emo)) * H2 + off.oz,
          emo: emo
        });
      });

      return {
        id: m.id,
        t: m.title || m.completed_sentence || m.memory_words || '(untitled)',
        plays: plays,
        pc: plays.length,
        emo: Object.keys(merged).length ? merged : { numbness: 0.5 },
        attr: attr,
        fear: fear,
        af: af,
        pillarWx: af.x * H2 + off.ox,
        pillarWz: af.z * H2 + off.oz,
        sceneAF: sceneAF,
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
  function computeAfTerrainFields(P, filterIdx, opt) {
    opt = opt || {};
    var G = opt.G != null ? opt.G : 72;
    var SZ = opt.SZ != null ? opt.SZ : 46;
    var H2 = SZ / 2;
    var hts = new Float32Array(G * G);
    var cls = new Float32Array(G * G * 3);

    var layers = filterIdx == null
      ? P.map(function (m, mi) { return { m: m, mi: mi }; })
      : (P[filterIdx] ? [{ m: P[filterIdx], mi: filterIdx }] : []);

    var pollField = new Float32Array(G * G);

    layers.forEach(function (layer) {
      var m = layer.m; var mi = layer.mi;
      var cx = m.pillarWx; var cz = m.pillarWz;
      var scenes = m.sceneAF || [];
      var r = sR(mi * 777);

      // ─── Base terrain: memory center (기존 유지, 전체 기반 지형) ───
      var eT = 0;
      for (var ek in m.emo) { if (Object.prototype.hasOwnProperty.call(m.emo, ek)) eT += m.emo[ek]; }
      if (!eT) eT = 1;

      for (var iz = 0; iz < G; iz++) for (var ix = 0; ix < G; ix++) {
        var wx = (ix / (G - 1) - 0.5) * SZ; var wz = (iz / (G - 1) - 0.5) * SZ;
        var inf = Math.exp(-((wx - cx) * (wx - cx) + (wz - cz) * (wz - cz)) / 40.5);
        hts[iz * G + ix] += inf * Math.min(eT, 3) * 0.15;  // reduced base (was 0.25)
        var ci = (iz * G + ix) * 3;
        for (var e in m.emo) {
          if (!Object.prototype.hasOwnProperty.call(m.emo, e)) continue;
          var v = m.emo[e];
          var c = EC[e] || [0.3, 0.3, 0.3];
          cls[ci] += c[0] * v * inf * 0.08; cls[ci + 1] += c[1] * v * inf * 0.08; cls[ci + 2] += c[2] * v * inf * 0.08;
        }
      }

      // ─── Scene bumps: 장면별 봉우리 (C방식) ────────────────────
      if (scenes.length > 0) {
        scenes.forEach(function (sc, si) {
          var scx = sc.wx; var scz = sc.wz;
          var scEmo = sc.emo;
          var scET = 0;
          for (var ek2 in scEmo) { if (Object.prototype.hasOwnProperty.call(scEmo, ek2)) scET += scEmo[ek2]; }
          if (!scET) scET = 1;

          for (var iz = 0; iz < G; iz++) for (var ix = 0; ix < G; ix++) {
            var wx = (ix / (G - 1) - 0.5) * SZ; var wz = (iz / (G - 1) - 0.5) * SZ;
            var inf = Math.exp(-((wx - scx) * (wx - scx) + (wz - scz) * (wz - scz)) / 18);
            hts[iz * G + ix] += inf * Math.min(scET, 3) * 0.2;
            var ci = (iz * G + ix) * 3;
            for (var e in scEmo) {
              if (!Object.prototype.hasOwnProperty.call(scEmo, e)) continue;
              var v = scEmo[e];
              var c = EC[e] || [0.3, 0.3, 0.3];
              cls[ci] += c[0] * v * inf * 0.1; cls[ci + 1] += c[1] * v * inf * 0.1; cls[ci + 2] += c[2] * v * inf * 0.1;
            }
          }
        });

        // ─── Scene connections: 장면 간 능선 (D방식 — transition_pattern) ─
        // Group plays by scene_id to get per-scene dominant pattern
        var patternByScene = {};
        m.plays.forEach(function (p) {
          if (!p.scene_id) return;
          var al = playAlignment(p);
          // Infer pattern from alignment (simplified — full engine not available here)
          var pat = al >= 0.5 ? 'echo_follow' : al >= 0.1 ? 'bridge' : 'contradiction';
          if (al < 0.15) pat = 'avoidance';
          if (!patternByScene[p.scene_id]) patternByScene[p.scene_id] = [];
          patternByScene[p.scene_id].push(pat);
        });

        for (var si2 = 0; si2 < scenes.length - 1; si2++) {
          var sA = scenes[si2]; var sB = scenes[si2 + 1];
          // Determine dominant pattern for the connection
          var pats = patternByScene[sA.id] || [];
          var domPat = 'bridge'; // default
          if (pats.length > 0) {
            var patCount = {};
            pats.forEach(function (p) { patCount[p] = (patCount[p] || 0) + 1; });
            domPat = Object.keys(patCount).sort(function (a, b) { return patCount[b] - patCount[a]; })[0];
          }

          // Ridge/valley between consecutive scenes based on pattern
          var ridgeH, ridgeW;
          if (domPat === 'echo_follow')   { ridgeH = 0.15; ridgeW = 12; }  // gentle ridge
          else if (domPat === 'bridge')    { ridgeH = 0.08; ridgeW = 16; }  // subtle connection
          else if (domPat === 'contradiction') { ridgeH = -0.12; ridgeW = 8; }  // valley between
          else if (domPat === 'avoidance') { ridgeH = -0.18; ridgeW = 6; }  // deep cut
          else if (domPat === 'displacement') { ridgeH = 0.05; ridgeW = 10; }
          else if (domPat === 'fixation')  { ridgeH = 0.20; ridgeW = 6; }   // sharp ridge
          else { ridgeH = 0.05; ridgeW = 14; }

          // Draw ridge/valley along line from sA to sB
          var dx = sB.wx - sA.wx; var dz = sB.wz - sA.wz;
          var segLen = Math.sqrt(dx * dx + dz * dz);
          if (segLen < 0.5) continue;
          var nx = -dz / segLen; var nz = dx / segLen; // normal to line

          for (var iz = 0; iz < G; iz++) for (var ix = 0; ix < G; ix++) {
            var wx = (ix / (G - 1) - 0.5) * SZ; var wz = (iz / (G - 1) - 0.5) * SZ;
            // Project point onto line segment
            var t = ((wx - sA.wx) * dx + (wz - sA.wz) * dz) / (segLen * segLen);
            if (t < -0.05 || t > 1.05) continue;
            t = Math.max(0, Math.min(1, t));
            var projX = sA.wx + t * dx; var projZ = sA.wz + t * dz;
            var perpDist = Math.abs((wx - projX) * nx + (wz - projZ) * nz);
            if (perpDist > ridgeW) continue;
            var falloff = Math.exp(-(perpDist * perpDist) / (ridgeW * 0.4 * ridgeW * 0.4));
            // Taper at endpoints
            var endTaper = 1 - Math.pow(2 * t - 1, 4);
            hts[iz * G + ix] += ridgeH * falloff * endTaper;
          }
        }
      }

      // ─── Play effects: 각 play가 자기 AF 좌표에 흔적 + 오염 ────
      m.plays.forEach(function (play) {
        var ue = play.user_emotion;
        if (!ue) return;
        if (typeof ue === 'string') { try { ue = JSON.parse(ue); } catch (_) { return; } }
        var pAttr = eA(ue); var pFear = eF(ue);
        var jt = 0.12;
        var px2 = pX({
          self_blame: Math.max(0, (pAttr.self_blame || 0) + (r() - 0.5) * jt),
          other_blame: Math.max(0, (pAttr.other_blame || 0) + (r() - 0.5) * jt),
          fate_blame: Math.max(0, (pAttr.fate_blame || 0) + (r() - 0.5) * jt),
        }) * H2;
        var pz2 = pZ({
          abandonment: Math.max(0, (pFear.abandonment || 0) + (r() - 0.5) * jt),
          rejection: Math.max(0, (pFear.rejection || 0) + (r() - 0.5) * jt),
          powerlessness: Math.max(0, (pFear.powerlessness || 0) + (r() - 0.5) * jt),
          loss: Math.max(0, (pFear.loss || 0) + (r() - 0.5) * jt),
        }) * H2;

        var al = playAlignment(play);
        var isV = al < 0.15;
        var dm = Object.keys(pAttr).sort(function (a, b) { return pAttr[b] - pAttr[a]; })[0];
        var sX = 5; var sZ2 = 5;
        if (dm === 'self_blame') { sX = 2.5; sZ2 = 2.5; } else if (dm === 'other_blame') { sX = 4; sZ2 = 3; }
        var ds = al > 0.4 ? 1 : -0.6;
        var inten = isV ? 0.12 : 0.4 + al * 0.5;

        for (var iz2 = 0; iz2 < G; iz2++) for (var ix2 = 0; ix2 < G; ix2++) {
          var wx2 = (ix2 / (G - 1) - 0.5) * SZ; var wz2 = (iz2 / (G - 1) - 0.5) * SZ;
          var inf2 = Math.exp(-((wx2 - px2) * (wx2 - px2) / (sX * sX) + (wz2 - pz2) * (wz2 - pz2) / (sZ2 * sZ2)) / 2);
          var idx = iz2 * G + ix2;
          if (isV) hts[idx] -= inf2 * fb(ix2 * 0.15, iz2 * 0.15, 3) * 0.21;
          else hts[idx] += inf2 * inten * ds * (0.5 + (fb(ix2 * 0.1 + mi, iz2 * 0.1, 4) - 0.35) * 0.7);
          var ci2 = idx * 3;
          for (var e2 in ue) {
            if (!Object.prototype.hasOwnProperty.call(ue, e2)) continue;
            var vv = ue[e2];
            var c2 = EC[e2] || [0.3, 0.3, 0.3];
            var cI = inf2 * (typeof vv === 'number' ? vv : 0) * 0.025 * (isV ? 0.3 : 1);
            cls[ci2] += c2[0] * cI; cls[ci2 + 1] += c2[1] * cI; cls[ci2 + 2] += c2[2] * cI;
          }
          // Pollution: low alignment → bone tint at play's AF location
          var evPoll = 1 - al;
          if (evPoll > 0.1) pollField[idx] += evPoll * inf2 * 0.3;
        }
      });
    });

    if (!layers.length) {
      for (var z0 = 0; z0 < G; z0++) for (var x0 = 0; x0 < G; x0++) {
        hts[z0 * G + x0] = 0;
      }
    }

    // Clamp pollution field
    for (var pi = 0; pi < G * G; pi++) pollField[pi] = Math.min(1, pollField[pi]);

    // Color normalization: prevent brightening from play accumulation
    var totalPlaysAll = 0;
    layers.forEach(function (layer) { totalPlaysAll += layer.m.plays.length; });
    var colorNorm = totalPlaysAll > 1 ? 1.0 / (1.0 + totalPlaysAll * 0.08) : 1.0;

    for (var iz3 = 0; iz3 < G; iz3++) for (var ix3 = 0; ix3 < G; ix3++) {
      var idx3 = iz3 * G + ix3;
      hts[idx3] += (fb(ix3 * 0.07, iz3 * 0.07, 5) - 0.4) * 1.8;
      var ci3 = idx3 * 3;
      cls[ci3] *= colorNorm; cls[ci3 + 1] *= colorNorm; cls[ci3 + 2] *= colorNorm;
      var av = (cls[ci3] + cls[ci3 + 1] + cls[ci3 + 2]) / 3;
      cls[ci3] = cls[ci3] * 0.85 + av * 0.15 + 0.035;
      cls[ci3 + 1] = cls[ci3 + 1] * 0.85 + av * 0.15 + 0.035;
      cls[ci3 + 2] = cls[ci3 + 2] * 0.85 + av * 0.15 + 0.05;

      // Contamination bone-tint overlay
      var lp = pollField[idx3];
      if (lp > 0.01) {
        var grey = (cls[ci3] + cls[ci3 + 1] + cls[ci3 + 2]) / 3;
        var boneTint = 0.12;
        var mix = Math.min(0.85, lp * 0.8);
        cls[ci3]     = cls[ci3]     * (1 - mix) + (grey * 0.55 + boneTint) * mix;
        cls[ci3 + 1] = cls[ci3 + 1] * (1 - mix) + (grey * 0.45 + boneTint * 0.7) * mix;
        cls[ci3 + 2] = cls[ci3 + 2] * (1 - mix) + (grey * 0.35 + boneTint * 0.4) * mix;
      }
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
    var G = 72; var SZ = 46; var H2 = SZ / 2;
    var scene3; var camera; var renderer; var controls;
    var terrain; var terrainWire; var seedGrp;
    var sD = []; var P = [];
    var terrainMemFilter = null;
    var hts; var cls; var pos;
    var time = 0;
    var parts; var pVl; var oP1; var oP2;

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
    }

    function gH(wx, wz) {
      if (!pos) return 0;
      var gx = ((wx / SZ) + 0.5) * (G - 1); var gz = ((wz / SZ) + 0.5) * (G - 1);
      var ix = Math.min(G - 2, Math.max(0, Math.floor(gx))); var iz = Math.min(G - 2, Math.max(0, Math.floor(gz)));
      var fx = gx - ix; var fz = gz - iz;
      return pos[(iz * G + ix) * 3 + 1] * (1 - fx) * (1 - fz)
        + pos[(iz * G + ix + 1) * 3 + 1] * fx * (1 - fz)
        + pos[((iz + 1) * G + ix) * 3 + 1] * (1 - fx) * fz
        + pos[((iz + 1) * G + ix + 1) * 3 + 1] * fx * fz;
    }

    function buildTerrain(filterIdx) {
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
        pos[j * 3 + 1] = ((hts[j] - mn) / rg - 0.5) * 15;
        var cj = j * 3;
        colA[cj] = Math.min(1, Math.max(0, cls[cj]));
        colA[cj + 1] = Math.min(1, Math.max(0, cls[cj + 1]));
        colA[cj + 2] = Math.min(1, Math.max(0, cls[cj + 2]));
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colA, 3)); geo.computeVertexNormals();
      var terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.06, side: THREE.DoubleSide });

      // ─── Shader patch: procedural rock texture ─────────────────
      terrainMat.onBeforeCompile = function (shader) {
        // Inject noise + varying into fragment shader
        shader.fragmentShader = shader.fragmentShader.replace(
          'void main() {',
          [
            'varying vec3 vWPos;',
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

        // Apply rock texture just before output
        shader.fragmentShader = shader.fragmentShader.replace(
          'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
          [
            'vec3 _wp = vWPos;',
            'float _grain = _fbm3(_wp * 8.0) * 0.12 - 0.06;',
            'float _slope = 1.0 - abs(dot(normal, vec3(0.0, 1.0, 0.0)));',
            'float _crevice = _slope * _slope * 0.15;',
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
      terrainWire = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ wireframe: true, color: 0x221833, opacity: 0.04, transparent: true }));
      scene3.add(terrainWire);

      seedGrp = new THREE.Group(); sD = [];
      var seedList = filterIdx == null
        ? P.map(function (mm, i) { return { m: mm, i: i }; })
        : (P[filterIdx] ? [{ m: P[filterIdx], i: filterIdx }] : []);
      seedList.forEach(function (sg) {
        var m = sg.m; var i = sg.i;
        var wx = m.pillarWx; var wz = m.pillarWz; var h = gH(wx, wz);
        sD.push({ wx: wx, wz: wz, h: h, t: m.t, c: m.pc, idx: i });
        var de = getDom(m.emo); var ec = EC[de] || [0.5, 0.5, 0.5]; var col = new THREE.Color(ec[0], ec[1], ec[2]);
        var pH = 1.2 + Math.min(m.pc, 60) * 0.03;
        var pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, pH, 6), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.3 }));
        pillar.position.set(wx, h + pH / 2 + 0.2, wz); seedGrp.add(pillar);
        var pl2 = new THREE.PointLight(col, 0.3, 10, 2); pl2.position.set(wx, h + 2.5, wz); seedGrp.add(pl2);
      });
      scene3.add(seedGrp);

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
      scene3.fog = new THREE.FogExp2(opts.fogColor != null ? opts.fogColor : 0x12121a, opts.fogDensity != null ? opts.fogDensity : 0.004);

      camera = new THREE.PerspectiveCamera(50, vp0.w / vp0.h, 0.1, 500);
      camera.position.set(35, 28, 45);

      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setSize(vp0.w, vp0.h);
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;

      controls = new THREE.OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance = 8;
      controls.maxDistance = 120;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.target.set(0, -1, 0);

      scene3.add(new THREE.AmbientLight(0x1a1828, 1.3));
      var dl = new THREE.DirectionalLight(0xc4a882, 0.7);
      dl.position.set(25, 45, 18); dl.castShadow = true;
      dl.shadow.mapSize.set(1024, 1024);
      dl.shadow.camera.left = -30; dl.shadow.camera.right = 30; dl.shadow.camera.top = 30; dl.shadow.camera.bottom = -30;
      scene3.add(dl);
      var dl2 = new THREE.DirectionalLight(0x3a4a80, 0.3); dl2.position.set(-18, 25, -12); scene3.add(dl2);
      oP1 = new THREE.PointLight(0x7a3020, 0.4, 55); scene3.add(oP1);
      oP2 = new THREE.PointLight(0x203a7a, 0.25, 45); scene3.add(oP2);

      var bp = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), new THREE.MeshStandardMaterial({ color: 0x050509, roughness: 1 }));
      bp.rotation.x = -Math.PI / 2; bp.position.y = -8; scene3.add(bp);

      var pc2 = 400; var pg2 = new THREE.BufferGeometry(); var pp2 = new Float32Array(pc2 * 3);
      pVl = new Float32Array(pc2);
      for (var i = 0; i < pc2; i++) {
        pp2[i * 3] = (Math.random() - 0.5) * SZ * 2;
        pp2[i * 3 + 1] = Math.random() * 20 - 4;
        pp2[i * 3 + 2] = (Math.random() - 0.5) * SZ * 2;
        pVl[i] = 0.002 + Math.random() * 0.006;
      }
      pg2.setAttribute('position', new THREE.BufferAttribute(pp2, 3));
      parts = new THREE.Points(pg2, new THREE.PointsMaterial({ color: 0x3a3a50, size: 0.1, transparent: true, opacity: 0.3, sizeAttenuation: true }));
      scene3.add(parts);

      function mkD(x, y, z, c, s2) {
        var m = new THREE.Mesh(new THREE.SphereGeometry(s2 || 0.2, 8, 8), new THREE.MeshBasicMaterial({ color: c }));
        m.position.set(x, y, z); scene3.add(m);
      }
      function mkL(a, b, c) {
        scene3.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2])]), new THREE.LineBasicMaterial({ color: c, opacity: 0.2, transparent: true })));
      }
      mkD(-H2 * 0.9, -6, H2 + 3, 0xc44040, 0.3); mkD(0, -6, H2 + 3, 0x555555, 0.2); mkD(H2 * 0.9, -6, H2 + 3, 0x4050c4, 0.3);
      mkL([-H2 * 0.95, -5.8, H2 + 3], [H2 * 0.95, -5.8, H2 + 3], 0x332233);
      mkD(-H2 - 3, -6, -H2 * 0.9, 0xc4a040, 0.3); mkD(-H2 - 3, -6, 0, 0x555555, 0.2); mkD(-H2 - 3, -6, H2 * 0.9, 0x40c4a0, 0.3);
      mkL([-H2 - 3, -5.8, -H2 * 0.95], [-H2 - 3, -5.8, H2 * 0.95], 0x223333);

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
        oP1.position.set(Math.sin(time * 0.6) * 22, 6 + Math.sin(time * 0.3) * 3, Math.cos(time * 0.4) * 22);
        oP2.position.set(Math.cos(time * 0.5) * 18, 8, Math.sin(time * 0.7) * 18);
      }
      if (seedGrp) {
        seedGrp.children.forEach(function (c, i) {
          if (c.isMesh && c.geometry && c.geometry.type === 'CylinderGeometry') {
            var p = 1 + Math.sin(time * 2.5 + i * 1.2) * 0.08;
            c.scale.set(p, 1, p);
            if (c.material && c.material.emissiveIntensity !== undefined) c.material.emissiveIntensity = 0.35 + Math.sin(time * 3 + i * 0.8) * 0.2;
          }
        });
      }
      if (parts && parts.geometry && parts.geometry.attributes.position) {
        var pp = parts.geometry.attributes.position;
        for (var i = 0; i < 400; i++) {
          var y = pp.getY(i) + pVl[i];
          if (y > 18) y = -5;
          pp.setY(i, y);
          pp.setX(i, pp.getX(i) + Math.sin(time + i * 0.3) * 0.0015);
        }
        pp.needsUpdate = true;
      }
      if (renderer && scene3 && camera) renderer.render(scene3, camera);
    }

    function focusCameraOnSeed() {
      if (!camera || !controls || !sD.length) return;
      var d = sD[0];
      var hh = gH(d.wx, d.wz);
      camera.position.set(d.wx + 16, hh + 10, d.wz + 16);
      controls.target.set(d.wx, hh, d.wz);
      controls.update();
    }

    function dispose() {
      disposeTerrainLayer();
      if (renderer) renderer.dispose();
    }

    // ─── First-person walk mode ──────────────────────────────────
    var _fpActive = false;
    var _fpKeys = {};
    var _fpEuler = { yaw: 0, pitch: 0 };
    var _fpEyeHeight = 1.6;
    var _fpSpeed = 8;
    var _fpPos = { x: 0, z: 0 };
    var _fpLastTime = 0;
    var _fpSavedCamPos = null;
    var _fpSavedTarget = null;

    function _fpOnKeyDown(e) {
      _fpKeys[e.code] = true;
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
    }
    function _fpOnKeyUp(e) { _fpKeys[e.code] = false; }
    function _fpOnMouseMove(e) {
      if (!_fpActive) return;
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
      canvas.requestPointerLock();
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
      var half = SZ / 2 - 1;
      _fpPos.x = Math.max(-half, Math.min(half, _fpPos.x));
      _fpPos.z = Math.max(-half, Math.min(half, _fpPos.z));
      var terrainH = gH(_fpPos.x, _fpPos.z);
      if (terrainH < -6) terrainH = -6;
      camera.position.set(_fpPos.x, terrainH + _fpEyeHeight, _fpPos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(_fpEuler.pitch, _fpEuler.yaw, 0);
    }

    var _origTick = tick;
    tick = function () {
      if (_fpActive) {
        _fpTick();
        time += 0.004;
        if (oP1 && oP2) {
          oP1.position.set(Math.sin(time * 0.6) * 22, 6 + Math.sin(time * 0.3) * 3, Math.cos(time * 0.4) * 22);
          oP2.position.set(Math.cos(time * 0.5) * 18, 8, Math.sin(time * 0.7) * 18);
        }
        if (seedGrp) {
          seedGrp.children.forEach(function (c, i) {
            if (c.isMesh && c.geometry && c.geometry.type === 'CylinderGeometry') {
              var p = 1 + Math.sin(time * 2.5 + i * 1.2) * 0.08;
              c.scale.set(p, 1, p);
              if (c.material && c.material.emissiveIntensity !== undefined) c.material.emissiveIntensity = 0.35 + Math.sin(time * 3 + i * 0.8) * 0.2;
            }
          });
        }
        if (parts && parts.geometry && parts.geometry.attributes.position) {
          var pp = parts.geometry.attributes.position;
          for (var i = 0; i < 400; i++) {
            var y = pp.getY(i) + pVl[i]; if (y > 18) y = -5;
            pp.setY(i, y); pp.setX(i, pp.getX(i) + Math.sin(time + i * 0.3) * 0.0015);
          }
          pp.needsUpdate = true;
        }
        if (renderer && scene3 && camera) renderer.render(scene3, camera);
      } else {
        _origTick();
      }
    };

    document.addEventListener('pointerlockchange', function () {
      if (_fpActive && !document.pointerLockElement) exitFirstPerson();
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
      focusCameraOnSeed: focusCameraOnSeed,
      dispose: dispose,
      enterFirstPerson: enterFirstPerson,
      exitFirstPerson: exitFirstPerson,
      isFirstPerson: function () { return _fpActive; },
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

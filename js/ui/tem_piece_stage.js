/**
 * tem_piece_stage.js — piece rooms (2026-11-18, on top of the drift switch: play-test.html?drift=1)
 * Decision record: docs/표류무대_실험-261118.md §10.   Off: add &piece=0 (falls back to the shared-ground drift).
 *
 * One scene = one piece of land, and only the current scene's piece exists.
 *   land     — the ORIGINAL terrain metric (computeAfTerrainFields), fed with this one scene only,
 *              so it moves with the ledger exactly as the old terrain did (contamination columns,
 *              plays). Outline = a closed curve seeded by the scene id (same scene → same outline).
 *   door     — after the walker has written, ONE door stands at a random spot on the piece.
 *              Random is the spot only; the destination is the engine's pick (updateAccess).
 *   corridor — the text-room corridor, unchanged (js/roomplay/corridor.js + test/corridor-*).
 *   map      — not a plan of a plate: a 3D net of the scenes walked so far and the walks between
 *              them, grown by this run. Pressing a point returns to that piece; the return is
 *              written to the ledger (plays row, persona_id 'piece-move').
 *
 * Not changed: engine, dialog/continuation flow, measurement. The engine never reads these pieces.
 * Variant strata (erosion on the one shared continent) is switched off in this mode — there is
 * no shared continent to erode.
 */
(function (global) {
  'use strict';
  var D = global.TemDrift;
  var ON = false;
  try { ON = !!(D && D.on) && !/[?&]piece=0(&|$)/.test(global.location.search || ''); } catch (_) {}

  var P = {
    R0: 42,            // mean radius of a piece (plate half-size is 56, walk limit 54)
    AMP: [0.09, 0.07, 0.05],   // outline harmonics 2,3,5 — sum < 0.22 keeps the rim inside the plate
    EDGE: 8,           // width of the rim slope
    FLOOR: -16,        // void floor outside the piece
    WALK_MARGIN: 1.6,
    DOOR_R: [0.55, 0.78],      // door stands at this fraction of the rim radius
    DOOR_NEAR: 2.4,
    GHOST_R: 0.2,
    SPAWN_R: 0.55,
    FOG_DENSITY: 0.05,
  };

  function game() { return global._temGame || {}; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hash(s) {
    var h = 2166136261 >>> 0; s = String(s || '');
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function rnd01(s) { return (hash(s) % 100000) / 100000; }

  // ── outline: R(theta) for a scene (deterministic) ─────────────────────────
  // size of a piece: author value scenes.meta.piece.size (0.5 ~ 1.2, default 1). The editor
  // previews with setSize() before saving.
  var _sizeOverride = {}, _sceneSrc = null;
  function _scenes() { return _sceneSrc || game().scenes || []; }
  function pieceMeta(sceneId) {
    var sc = _scenes().find(function (x) { return x.id === sceneId; });
    var m = sc && sc.meta; if (typeof m === 'string') { try { m = JSON.parse(m); } catch (_) { m = null; } }
    return (m && m.piece) || {};
  }
  function sizeOf(sceneId) {
    var v = _sizeOverride[sceneId]; if (v == null) v = pieceMeta(sceneId).size;
    v = Number(v); if (!isFinite(v) || v <= 0) v = 1;
    return Math.max(0.5, Math.min(1.2, v));
  }
  function rim(sceneId, th) {
    var r = 1, ks = [2, 3, 5];
    for (var i = 0; i < ks.length; i++) {
      var amp = P.AMP[i] * (0.55 + 0.45 * rnd01(sceneId + '|a' + i));
      r += amp * Math.cos(ks[i] * th + rnd01(sceneId + '|p' + i) * Math.PI * 2);
    }
    return P.R0 * sizeOf(sceneId) * r;
  }
  function inside(sceneId, x, z, margin) {
    var r = Math.sqrt(x * x + z * z);
    return r < rim(sceneId, Math.atan2(z, x)) - (margin || 0);
  }
  function polar(sceneId, ang, frac) {
    var R = rim(sceneId, ang) * frac;
    return { x: Math.cos(ang) * R, z: Math.sin(ang) * R };
  }

  // ── state ────────────────────────────────────────────────────────────────
  var cur = null;            // scene id of the piece that exists now
  var rt = null;
  var busy = false;
  var teleport = null;
  var route = [];            // [{ from, to, via: 'start'|'door'|'map', pattern, at }]
  var nodes = [];            // scene ids in order of first arrival
  var edges = {};            // 'a|b' -> count
  var doorObj = null;        // { group, x, z, to }
  var memoryCode = null;

  function firstScene() {
    var g = game(), best = null, bo = Infinity;
    // author's "walk this piece" link: ?start=<scene id>
    try {
      var sm = /[?&]start=([0-9a-f-]{36})/i.exec(global.location.search || '');
      if (sm && (g.scenes || []).some(function (x) { return x.id === sm[1]; })) return sm[1];
    } catch (_) {}
    (g.pins || []).forEach(function (p) {
      if (p.type !== 'core' && p.type !== 'bridge') return;
      var o = p.sceneOrder != null ? p.sceneOrder : 1e9;
      if (o < bo) { bo = o; best = p.sceneId; }
    });
    return best;
  }
  function current() { if (!cur) cur = firstScene(); return cur; }
  function sceneOf(id) { return (game().scenes || []).find(function (s) { return s.id === id; }) || null; }
  // 261119 방 한 칸을 몇 숫자로 짓는다: meta.piece.room = { w, d, cx, cz, door: 's0', floor, wall, lamp }
  //   w·d = 가로·세로(1.2 의 배수), cx·cz = 방 한가운데, door = 문틀이 설 면(n|s|e|w) + 그 면의 몇 번째 벽 조각,
  //   floor·wall = 색, lamp = 천장 전등 빛 세기(0 = 전등 없음). 벽·바닥 조각(kind 'build')으로 풀어 준다.
  var ROOM_U = 2.4;
  function roomProps(sceneId) {
    var r = pieceMeta(sceneId).room;
    if (!r || !(Number(r.w) > 0) || !(Number(r.d) > 0)) return [];
    var W = Number(r.w), Dp = Number(r.d), X0 = (Number(r.cx) || 0) - W / 2, Z0 = (Number(r.cz) || 0) - Dp / 2, X1 = X0 + W, Z1 = Z0 + Dp;
    var out = [], n = 0, H = Math.PI / 2, U = ROOM_U, door = String(r.door || 's0');
    var add = function (model, x, z, rot, extra) {
      var p = { id: 'room' + (n++), kind: 'build', role: 'scenery', name: model, model: model, x: +x.toFixed(3), z: +z.toFixed(3), rot: rot, _room: true };
      if (extra) for (var k in extra) p[k] = extra[k];
      out.push(p);
    };
    var x, z;
    for (x = 0; x < W - 0.01; x += U) for (z = 0; z < Dp - 0.01; z += U) {
      var wx = Math.min(U, W - x), wz = Math.min(U, Dp - z), fx = wx > U - 0.01, fz = wz > U - 0.01, t = { tint: r.floor || null };
      if (fx && fz) add('바닥', X0 + x, Z0 + z + U, 0, t);
      else if (!fx && fz) add('바닥 반', X0 + x, Z0 + z + U, 0, t);
      else if (fx && !fz) add('바닥 반', X0 + x + U, Z0 + z + U / 2, H, t);
      else add('바닥', X0 + x, Z0 + z + U / 2, 0, { tint: r.floor || null, scale: 0.5 });
    }
    var run = function (side, L) {
      var u = 0, i = 0;
      while (u < L - 0.01) {
        var len = Math.min(U, L - u), full = len > U - 0.01;
        var model = !full ? '벽 반' : (door === side + i ? '벽 문틀' : '벽'), tw = { tint: r.wall || null };
        if (side === 'n') add(model, X0 + u, Z0, 0, tw);
        else if (side === 's') add(model, X0 + u + len, Z1, Math.PI, tw);
        else if (side === 'w') add(model, X0, Z0 + u + len, H, tw);
        else add(model, X1, Z0 + u, -H, tw);
        u += len; i++;
      }
    };
    run('n', W); run('s', W); run('w', Dp); run('e', Dp);
    if (Number(r.lamp) > 0) add('백색 전등', (X0 + X1) / 2 - 0.15, (Z0 + Z1) / 2 + 0.15, 0, { lift: 2.55, light: Number(r.lamp), tint: '#d8dcdc' });
    return out;
  }
  function isRoom(sceneId) { var m = pieceMeta(sceneId); return !!(m.flat || m.room); }
  // 261119 방을 지은 조각: 작가가 유령 자리(meta.piece.ghost)와 출발 자리(meta.piece.spawn)를 정할 수 있다.
  function _spot(v) { return (v && isFinite(Number(v.x)) && isFinite(Number(v.z))) ? { x: Number(v.x), z: Number(v.z) } : null; }
  function ghostPos(sceneId) { var gs = _spot(pieceMeta(sceneId).ghost); if (gs) return gs; return polar(sceneId, rnd01(sceneId + '|g') * Math.PI * 2, P.GHOST_R); }
  function spawnPos(sceneId, fromId) {
    var ss = _spot(pieceMeta(sceneId).spawn); if (ss) return ss;
    var ga = rnd01(sceneId + '|g') * Math.PI * 2;
    return polar(sceneId, ga + Math.PI + (rnd01(sceneId + '|s' + (fromId || '')) - 0.5) * 1.2, P.SPAWN_R);
  }
  // the scene the engine has opened and the walker has not met yet (≠ this piece)
  function pending() {
    var g = game();
    var pin = (g.pins || []).find(function (p) {
      return (p.type === 'core' || p.type === 'bridge') && g.accessiblePinIds && g.accessiblePinIds.has(p.id)
        && !(g.visitedCore && g.visitedCore[p.sceneId]) && p.sceneId !== cur;
    });
    return pin ? pin.sceneId : null;
  }

  // ── land: original metric on this one scene, cut to the outline ───────────
  var _reent = false;
  function computeFields(Pm, filterIdx, opt) {
    if (_reent || !cur) return null;
    return fieldsFor(Pm, cur, filterIdx, opt);
  }
  /** The land of one scene (used by the play and by the admin editor alike). */
  function fieldsFor(Pm, cur, filterIdx, opt) {
    var T = global.TemAfStrataTerrain;
    if (!T || typeof T.computeAfTerrainFields !== 'function') return null;
    var one = (Pm || []).map(function (m) {
      var sc = (m.sceneAF || []).filter(function (s) { return s.id === cur; });
      return sc.length ? Object.assign({}, m, { sceneAF: sc }) : m;
    });
    var f;
    _reent = true;
    try { f = T.computeAfTerrainFields(one, filterIdx, opt); } finally { _reent = false; }
    if (!f || !f.hts) return f;
    var G = f.G, SZ = f.SZ, minH = Infinity, maxH = -Infinity;
    // 261119 방을 지은 조각(meta.piece.flat): 땅을 한 높이로 편다 — 벽·바닥이 땅에 묻히거나 뜨지 않게.
    if (isRoom(cur)) {
      var sum = 0, cnt = 0, R1 = rim(cur, 0) * 0.5;
      for (var jz = 0; jz < G; jz++) for (var jx = 0; jx < G; jx++) {
        var qx = (jx / (G - 1) - 0.5) * SZ, qz = (jz / (G - 1) - 0.5) * SZ;
        if (qx * qx + qz * qz < R1 * R1) { sum += f.hts[jz * G + jx]; cnt++; }
      }
      var level = cnt ? sum / cnt : 0;
      for (var q = 0; q < G * G; q++) f.hts[q] = level;
    }
    for (var iz = 0; iz < G; iz++) {
      for (var ix = 0; ix < G; ix++) {
        var i = iz * G + ix;
        var gx = (ix / (G - 1) - 0.5) * SZ, gz = (iz / (G - 1) - 0.5) * SZ;
        var d = rim(cur, Math.atan2(gz, gx)) - Math.sqrt(gx * gx + gz * gz);   // > 0 inside
        var t = d <= 0 ? 0 : (d >= P.EDGE ? 1 : (d / P.EDGE));
        t = t * t * (3 - 2 * t);
        var h = P.FLOOR + (f.hts[i] - P.FLOOR) * t;
        f.hts[i] = h;
        var k = 0.18 + 0.82 * t, c = i * 3;
        f.cls[c] *= k; f.cls[c + 1] *= k; f.cls[c + 2] *= k;
        if (h < minH) minH = h; if (h > maxH) maxH = h;
      }
    }
    f.minH = minH; f.maxH = maxH;
    return f;
  }

  // ── door ─────────────────────────────────────────────────────────────────
  function removeDoor() {
    if (!doorObj) return;
    try { if (doorObj.group.parent) doorObj.group.parent.remove(doorObj.group); } catch (_) {}
    try { if (doorObj.beacon && doorObj.beacon.parent) doorObj.beacon.parent.remove(doorObj.beacon); } catch (_) {}
    doorObj = null;
  }
  function ensureDoor() {
    var to = pending();
    if (!to) { removeDoor(); return; }
    if (doorObj && doorObj.to === to && doorObj.on === cur) return;
    if (doorObj && doorObj.on === cur) { doorObj.to = to; return; }   // same door, the engine re-read: only the destination moves
    removeDoor();
    var THREE = global.THREE, scene3 = rt.getScene();
    // the only random part: where on the piece the door stands (not near the walker, not on the ghost)
    var cam = rt.getCamera(), gp = ghostPos(cur), pos = null;
    for (var n = 0; n < 24; n++) {
      var a = Math.random() * Math.PI * 2;
      var p = polar(cur, a, P.DOOR_R[0] + Math.random() * (P.DOOR_R[1] - P.DOOR_R[0]));
      var dc = Math.hypot(p.x - cam.position.x, p.z - cam.position.z), dg = Math.hypot(p.x - gp.x, p.z - gp.z);
      if (dc > 12 && dg > 8) { pos = p; break; }
      if (!pos) pos = p;
    }
    var y = rt.gH(pos.x, pos.z);
    var grp = new THREE.Group();
    var dark = new THREE.MeshStandardMaterial({ color: 0x15131a, roughness: 0.9 });
    var post = new THREE.BoxGeometry(0.2, 2.9, 0.2);
    var l = new THREE.Mesh(post, dark); l.position.set(-0.78, 1.45, 0);
    var r = new THREE.Mesh(post, dark); r.position.set(0.78, 1.45, 0);
    var top = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.2, 0.2), dark); top.position.set(0, 2.9, 0);
    var leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 2.8),
      new THREE.MeshBasicMaterial({ color: 0xffe6c2, transparent: true, opacity: 0.0, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    leaf.position.set(0, 1.4, 0);
    grp.add(l); grp.add(r); grp.add(top); grp.add(leaf);
    grp.position.set(pos.x, y - 0.05, pos.z);
    grp.rotation.y = Math.atan2(-pos.x, -pos.z);          // faces the middle of the piece
    grp.userData._pieceDoor = true;
    scene3.add(grp);
    var beacon = null;
    // no light column on the door: the white light marks who can be talked to (user decision 261118)
    doorObj = { group: grp, leaf: leaf, x: pos.x, z: pos.z, to: to, on: cur, beacon: beacon, born: performance.now() };
    whisper(ko() ? '……문이 하나 생겼다.' : '……a door has appeared.');
    console.log('[piece] 문 —', (sceneOf(cur) || {}).scene_order, '→', (sceneOf(to) || {}).scene_order, '자리', pos.x.toFixed(1), pos.z.toFixed(1));
  }

  // ── small UI helpers ─────────────────────────────────────────────────────
  function ko() { return (document.documentElement.lang || 'en').slice(0, 2) === 'ko'; }
  var _veil = null;
  function veil(on) {
    if (!_veil) {
      _veil = document.createElement('div');
      _veil.style.cssText = 'position:fixed;inset:0;z-index:3950;background:#050508;opacity:0;pointer-events:none;transition:opacity 1100ms ease;';
      document.body.appendChild(_veil);
    }
    _veil.style.pointerEvents = on ? 'auto' : 'none';
    _veil.style.opacity = on ? '1' : '0';
    return sleep(1150);
  }
  var _wh = null;
  function whisper(text, ms) {
    if (!_wh) {
      _wh = document.createElement('div');
      _wh.style.cssText = 'position:fixed;bottom:23%;left:50%;transform:translateX(-50%);z-index:3960;pointer-events:none;'
        + 'color:rgba(214,196,168,0.9);font-size:19px;letter-spacing:3px;font-family:"Gowun Batang","Noto Serif KR",serif;'
        + 'text-align:center;max-width:80vw;text-shadow:0 0 16px rgba(0,0,0,0.8);opacity:0;transition:opacity 1.4s ease;';
      document.body.appendChild(_wh);
    }
    _wh.textContent = text;
    _wh.style.opacity = '1';
    clearTimeout(_wh._t);
    _wh._t = setTimeout(function () { _wh.style.opacity = '0'; }, ms || 4200);
  }

  // ── corridor (text-room corridor, unchanged) ─────────────────────────────
  var _cor = null, _corCanvas = null, _mods = null;
  function loadMods() {
    if (_mods) return _mods;
    _mods = Promise.all([
      import('/js/roomplay/corridor.js?v=261119c'), import('/js/roomplay/looks.js'), import('/js/roomplay/engine.js'),
    ]).then(function (m) { return { corridor: m[0], looks: m[1], engine: m[2] }; });
    return _mods;
  }
  function c01(v) { v = Number(v) || 0; return Math.max(0, Math.min(1, v)); }
  var _corDot = null;
  async function runCorridor(fromId, toId) {
    var m = await loadMods();
    if (!_corCanvas) {
      _corCanvas = document.createElement('canvas');
      _corCanvas.id = 'temPieceCorridor';
      _corCanvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:3900;display:none;background:#050508;touch-action:none;';
      document.body.appendChild(_corCanvas);
      // 261119 (user): the 0.75 slow-down is taken out — the corridor is walked like the terrain:
      // same speed (_fpSpeed = 5.175), same stride (0.85 m per footstep), same look (pointer held, crosshair).
      _cor = m.corridor.createCorridor({ canvas: _corCanvas, onProgress: function () {}, speed: api.corridorSpeed || 1, walkSpeed: 5.175, stride: 0.85, lockLook: true });
      _corDot = document.createElement('div');
      _corDot.style.cssText = 'position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:rgba(255,246,228,0.85);box-shadow:0 0 0 1.5px rgba(40,34,26,0.7);z-index:3901;pointer-events:none;display:none;';
      document.body.appendChild(_corDot);
    }
    var g = game(), from = sceneOf(fromId), to = sceneOf(toId);
    var al = (g.inFlightAlignments && g.inFlightAlignments.length) ? Number(g.inFlightAlignments[g.inFlightAlignments.length - 1]) : 0.5;
    var cs = g.contState || {};
    var mem = { id: g.memoryId, code: memoryCode };
    var spec = {
      pattern: (g._lastAccessGeom && g._lastAccessGeom.pattern) || 'bridge',
      alignment: c01(al),
      bucket: al >= 0.7 ? 'HIGH' : (al >= 0.4 ? 'MID' : 'LOW'),
      cont: { d: c01(cs.cont_divergence), c: c01(cs.cont_convergence), h: c01(cs.cont_heterogeneity) },
      fromVec: m.engine.foldTo17(from.original_emotion), toVec: m.engine.foldTo17(to.original_emotion),
      lookA: m.looks.lookFor(mem, from), lookB: m.looks.lookFor(mem, to),
      seedA: from.scene_order, seedB: to.scene_order,
    };
    // keep the pointer held (the terrain already holds it): the corridor reads the same mouse
    _corCanvas.style.display = 'block'; _corCanvas.style.cursor = 'none';
    if (_corDot) _corDot.style.display = 'block';
    try { if (!document.pointerLockElement && _corCanvas.requestPointerLock) _corCanvas.requestPointerLock(); } catch (_) {}
    try { _cor.resize(); } catch (_) {}
    try { _cor.ensureAudio(); } catch (_) {}
    _cor.resume();
    var arrived = _cor.start(spec);
    await veil(false);
    whisper(ko() ? 'W 또는 ↑ 로 걷습니다 · 마우스로 둘러봅니다' : 'W or ↑ to walk · mouse to look', 8000);
    var st = {}; try { st = _cor.state() || {}; } catch (_) {}
    await arrived;
    await veil(true);
    _cor.stop();
    _corCanvas.style.display = 'none';
    if (_corDot) _corDot.style.display = 'none';
    return { pattern: spec.pattern, length: st.length };
  }

  // ── ledger: a return through the map is a walk too ───────────────────────
  function ledgerMove(fromId, toId) {
    try {
      var g = game();
      var sb = (typeof global.getSupabaseClient === 'function') ? global.getSupabaseClient() : null;
      if (!sb || !g.memoryId) return;
      sb.from('plays').insert({
        memory_id: g.memoryId, scene_id: toId, run_id: g._runId || null,
        user_emotion: null, user_reason: '', alignment: null, wave_data: null, layer_id: 0,
        persona_id: 'piece-move',
        dialog_turns: [{ stage: 'piece_v1', move: 'map_return', from_scene_id: fromId, to_scene_id: toId, at: new Date().toISOString() }],
      }).then(function (r) { if (r && r.error) console.warn('[piece] 이동 기록 실패', r.error); });
    } catch (e) { console.warn('[piece] 이동 기록 예외', e); }
  }

  // ── moving between pieces ────────────────────────────────────────────────
  function arrive(toId, fromId) {
    cur = toId;
    removeDoor();
    try { D.clearDressing(rt); } catch (_) {}
    rt.buildTerrain(null);
    var sp = spawnPos(toId, fromId);
    teleport = { x: sp.x, z: sp.z };
    placeExit();
    if (typeof global._temRebuildScenePins === 'function') global._temRebuildScenePins();
    try { if (global.TemPieceProps) global.TemPieceProps.build(rt, toId); } catch (eP) { console.warn('[piece] 꾸밈 세우기 실패', eP); }
    var gp = ghostPos(toId);
    rt.setYaw(Math.atan2(-(gp.x - sp.x), -(gp.z - sp.z)));
    if (nodes.indexOf(toId) === -1) nodes.push(toId);
    map.refresh();
  }
  async function go(toId, via) {
    if (busy || !toId || toId === cur) return false;
    busy = true;
    var fromId = cur, info = {};
    try {
      await veil(true);
      if (via === 'door') {
        try { info = await runCorridor(fromId, toId); }
        catch (e) { console.warn('[piece] 통로 실패 — 바로 건너감', e); if (_corCanvas) _corCanvas.style.display = 'none'; }
      }
      var key = fromId + '|' + toId;
      edges[key] = (edges[key] || 0) + 1;
      route.push({ from: fromId, to: toId, via: via, pattern: info.pattern || null, length: info.length || null, at: Date.now() });
      if (via === 'map') ledgerMove(fromId, toId);
      arrive(toId, fromId);
      await sleep(350);
      await veil(false);
    } finally { busy = false; }
    return true;
  }

  // the way out stands on every piece (it must always be reachable)
  function placeExit() {
    try {
      var d = global._temExitDoor;
      if (!d || !d.group) return;
      var p = polar(cur, rnd01(cur + '|x') * Math.PI * 2, 0.7);
      d.x = p.x; d.z = p.z;
      d.group.position.set(p.x, rt.gH(p.x, p.z), p.z);
    } catch (_) {}
  }

  // ── the map: a 3D net grown by this run ──────────────────────────────────
  var map = (function () {
    var box = null, ren = null, sc = null, cam = null, grp = null, meshes = {}, open = false, raf = 0, hint = null;
    function label(text) {
      var THREE = global.THREE, c = document.createElement('canvas'), g = c.getContext('2d');
      var font = '500 40px "Gowun Batang","Noto Serif KR",serif';
      g.font = font; var w = Math.ceil(g.measureText(text).width) + 30; c.width = w; c.height = 60;
      g = c.getContext('2d'); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(232,220,200,0.95)'; g.fillText(text, w / 2, 32);
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.8, depthWrite: false }));
      s.scale.set(0.2 * w / 60, 0.2, 1);
      return s;
    }
    // deterministic spring layout in 3D: position carries no meaning, only who is tied to whom
    function layout() {
      var pos = {}, n = nodes.length;
      nodes.forEach(function (id) {
        var a = rnd01(id + '|la') * Math.PI * 2, b = Math.acos(2 * rnd01(id + '|lb') - 1);
        pos[id] = [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)];
      });
      if (n < 2) { if (n === 1) pos[nodes[0]] = [0, 0, 0]; return pos; }
      var E = Object.keys(edges).map(function (k) { return k.split('|'); });
      var K = 1.0;
      for (var it = 0; it < 220; it++) {
        var temp = 0.12 * (1 - it / 220) + 0.004, disp = {};
        nodes.forEach(function (id) { disp[id] = [0, 0, 0]; });
        for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
          var A = pos[nodes[i]], B = pos[nodes[j]];
          var dx = A[0] - B[0], dy = A[1] - B[1], dz = A[2] - B[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
          var f = K * K / d;
          disp[nodes[i]][0] += dx / d * f; disp[nodes[i]][1] += dy / d * f; disp[nodes[i]][2] += dz / d * f;
          disp[nodes[j]][0] -= dx / d * f; disp[nodes[j]][1] -= dy / d * f; disp[nodes[j]][2] -= dz / d * f;
        }
        E.forEach(function (e) {
          var A = pos[e[0]], B = pos[e[1]]; if (!A || !B) return;
          var dx = A[0] - B[0], dy = A[1] - B[1], dz = A[2] - B[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
          var f = d * d / K;
          disp[e[0]][0] -= dx / d * f; disp[e[0]][1] -= dy / d * f; disp[e[0]][2] -= dz / d * f;
          disp[e[1]][0] += dx / d * f; disp[e[1]][1] += dy / d * f; disp[e[1]][2] += dz / d * f;
        });
        nodes.forEach(function (id) {
          var v = disp[id], l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 0.01, s = Math.min(l, temp) / l;
          pos[id][0] += v[0] * s; pos[id][1] += v[1] * s; pos[id][2] += v[2] * s;
        });
      }
      var cx = 0, cy = 0, cz = 0, rmax = 0.01;
      nodes.forEach(function (id) { cx += pos[id][0]; cy += pos[id][1]; cz += pos[id][2]; });
      cx /= n; cy /= n; cz /= n;
      nodes.forEach(function (id) {
        pos[id][0] -= cx; pos[id][1] -= cy; pos[id][2] -= cz;
        rmax = Math.max(rmax, Math.sqrt(pos[id][0] * pos[id][0] + pos[id][1] * pos[id][1] + pos[id][2] * pos[id][2]));
      });
      nodes.forEach(function (id) { pos[id][0] /= rmax; pos[id][1] /= rmax; pos[id][2] /= rmax; });
      return pos;
    }
    function init() {
      if (box) return;
      var THREE = global.THREE;
      var st = document.createElement('style');
      st.textContent = '#fpMinimap{display:none!important}'
        + '#temPieceMap{position:fixed;top:20px;left:20px;width:300px;height:300px;z-index:2750;border:1px solid rgba(196,168,130,0.22);'
        + 'background:rgba(8,8,13,0.5);border-radius:3px;cursor:pointer;transition:all 700ms ease;overflow:hidden;}'
        + '#temPieceMap.open{top:50%;left:50%;width:min(620px,86vw);height:min(620px,78vh);transform:translate(-50%,-50%);z-index:3600;background:rgba(6,6,10,0.9);}'
        + '#temPieceMap canvas{width:100%;height:100%;display:block}'
        + '#temPieceMapHint{position:absolute;left:0;right:0;bottom:12px;text-align:center;font:14px "Gowun Batang",serif;letter-spacing:2px;color:rgba(214,196,168,0.75);pointer-events:none;opacity:0;transition:opacity 600ms}'
        + '#temPieceMap.open #temPieceMapHint{opacity:1}';
      document.head.appendChild(st);
      box = document.createElement('div'); box.id = 'temPieceMap';
      hint = document.createElement('div'); hint.id = 'temPieceMapHint';
      hint.textContent = ko() ? '점을 누르면 그 장면으로 돌아갑니다 · M 닫기' : 'press a point to return there · M to close';
      document.body.appendChild(box);
      ren = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      ren.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
      box.appendChild(ren.domElement); box.appendChild(hint);
      sc = new THREE.Scene();
      cam = new THREE.PerspectiveCamera(42, 1, 0.1, 50); cam.position.set(0, 0.35, 3.6); cam.lookAt(0, 0, 0);
      grp = new THREE.Group(); sc.add(grp);
      box.addEventListener('click', onClick);
      global.addEventListener('keydown', function (e) {
        if (/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) return;
        if (e.key === 'm' || e.key === 'M' || e.key === 'ㅡ') { e.preventDefault(); toggle(); }
        else if (e.key === 'Escape' && open) toggle(false);
      });
      tick();
    }
    function size() {
      var w = box.clientWidth, h = box.clientHeight;
      if (ren.domElement.width !== Math.round(w * ren.getPixelRatio())) { ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    }
    function tick() {
      raf = requestAnimationFrame(tick);
      if (!box) return;
      size();
      grp.rotation.y = performance.now() / 1000 * (2 * Math.PI / 80);   // slow, one turn in 80 s
      var t = performance.now() / 1000;
      if (meshes[cur]) meshes[cur].scale.setScalar(1 + 0.16 * Math.sin(t * 2 * Math.PI / 4.5));
      ren.render(sc, cam);
    }
    function refresh() {
      init();
      var THREE = global.THREE;
      while (grp.children.length) { var o = grp.children.pop(); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
      meshes = {};
      var pos = layout(), S = 1.15;
      Object.keys(edges).forEach(function (k) {
        var e = k.split('|'), A = pos[e[0]], B = pos[e[1]]; if (!A || !B) return;
        var back = edges[e[1] + '|' + e[0]] || 0, cnt = edges[k] + back;
        var geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(A[0] * S, A[1] * S, A[2] * S), new THREE.Vector3(B[0] * S, B[1] * S, B[2] * S)]);
        grp.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: back ? 0x8fd0a0 : 0xd8c4a0, transparent: true, opacity: Math.min(0.95, 0.4 + 0.2 * cnt) })));
      });
      nodes.forEach(function (id) {
        var p = pos[id], here = id === cur;
        var m = new THREE.Mesh(new THREE.SphereGeometry(here ? 0.085 : 0.06, 18, 14),
          new THREE.MeshBasicMaterial({ color: here ? 0xfff0d2 : 0xc8b08a }));
        m.position.set(p[0] * S, p[1] * S, p[2] * S);
        m.userData.sceneId = id;
        grp.add(m); meshes[id] = m;
        var s = sceneOf(id), ew = s && s.echo_words, name = '';
        if (typeof ew === 'string') { try { ew = JSON.parse(ew); } catch (_) { ew = []; } }
        if (Array.isArray(ew) && ew.length) name = String(ew[0]);
        if (name) { var lb = label(name); lb.position.set(p[0] * S, p[1] * S + 0.17, p[2] * S); grp.add(lb); }
      });
    }
    function toggle(force) {
      init();
      open = force != null ? !!force : !open;
      box.classList.toggle('open', open);
      if (open) { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) {} }
    }
    function onClick(ev) {
      if (!open) { toggle(true); return; }
      var THREE = global.THREE, r = ren.domElement.getBoundingClientRect();
      var ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      var rc = new THREE.Raycaster(); rc.setFromCamera(ndc, cam);
      // generous pick: nearest node to the ray within a small angle
      var best = null, bd = 0.16;
      Object.keys(meshes).forEach(function (id) {
        var wp = new THREE.Vector3(); meshes[id].getWorldPosition(wp);
        var d = rc.ray.distanceToPoint(wp);
        if (d < bd) { bd = d; best = id; }
      });
      if (!best) { toggle(false); return; }
      if (best === cur) return;
      if (document.getElementById('lumenDialogPhase1')) return;
      toggle(false);
      go(best, 'map');
    }
    return { refresh: refresh, toggle: toggle, isOpen: function () { return open; }, pick: function (id) { if (id !== cur) return go(id, 'map'); } };
  })();

  // ── start / per-frame ────────────────────────────────────────────────────
  function start(runtime) {
    if (!ON || rt) return;
    rt = runtime;
    current();
    // a piece has to read as a shape: thinner fog than the shared-ground drift, so the rim and the
    // void beyond it are visible from the middle (free staging value).
    try { D.P.FOG_DENSITY = P.FOG_DENSITY; } catch (_) {}
    // the one shared continent is not used here: nothing to erode, nothing to inherit
    global.TemReplayTerrain = {
      isEnabled: function () { return true; },
      computeFields: computeFields,
      getRun: function () { return { beats: [1] }; },
      setAccessibleScenes: function () {},
      getPiecePos: function () { return null; },
    };
    // walking: stay on the piece; a pending arrival is applied here (the runtime owns the position)
    global.__temSpatialFogConstrain = function (x, z, nx, nz) {
      if (teleport) { var t = teleport; teleport = null; return t; }
      if (busy || map.isOpen()) return { x: x, z: z };
      if (inside(cur, nx, nz, P.WALK_MARGIN)) {
        var PP = global.TemPieceProps;
        if (PP && PP.blocked && PP.blocked(nx, nz)) {          // a wall: slide along it if one axis is free
          if (!PP.blocked(nx, z)) return { x: nx, z: z };
          if (!PP.blocked(x, nz)) return { x: x, z: nz };
          return { x: x, z: z };
        }
        return { x: nx, z: nz };
      }
      if (!inside(cur, x, z, 0)) { var s = spawnPos(cur); return { x: s.x, z: s.z }; }   // somehow off the piece
      return { x: x, z: z };
    };
    try {
      var sb = (typeof global.getSupabaseClient === 'function') ? global.getSupabaseClient() : null;
      if (sb && game().memoryId) sb.from('memories').select('code').eq('id', game().memoryId).maybeSingle()
        .then(function (r) { memoryCode = (r && r.data && r.data.code) || null; });
    } catch (_) {}
    route.push({ from: null, to: cur, via: 'start', at: Date.now() });
    arrive(cur, null);
    loadMods().catch(function () {});
    (function loop() {
      requestAnimationFrame(loop);
      if (!rt || busy || !doorObj) return;
      var k = Math.min(1, (performance.now() - doorObj.born) / 5000);
      doorObj.leaf.material.opacity = 0.5 * k * (0.85 + 0.15 * Math.sin(performance.now() / 1000 * (2 * Math.PI / 6)));
      if (document.getElementById('lumenDialogPhase1') || map.isOpen()) return;
      var c = rt.getCamera();
      if (Math.hypot(c.position.x - doorObj.x, c.position.z - doorObj.z) < P.DOOR_NEAR) go(doorObj.to, 'door');
    })();
    console.log('[piece] 조각 방 ON — 첫 조각', (sceneOf(cur) || {}).scene_order);
  }

  if (ON && global.TemVariantStrata) {
    try { global.TemVariantStrata.isEnabled = function () { return false; }; } catch (_) {}
  }

  // 261119 끝 장면(meta.piece.cue.end): 천천히 어두워진 뒤 걸음을 닫는다 (출구문과 같은 끝맺음).
  var finished = false;
  function finish() {
    if (finished) return; finished = true; busy = true;
    try { map.isOpen() && map.toggle(); } catch (_) {}
    var veil = document.createElement('div');
    veil.id = 'temPieceEndVeil';
    veil.style.cssText = 'position:fixed;inset:0;z-index:2795;background:#050509;opacity:0;transition:opacity 4200ms ease;pointer-events:none;';
    document.body.appendChild(veil);
    requestAnimationFrame(function () { veil.style.opacity = '1'; });
    setTimeout(function () {
      try { if (typeof global._temEndRun === 'function') global._temEndRun(); } catch (e) { console.warn('[piece] 끝맺음 실패', e && e.message); }
      veil.style.transition = 'opacity 2600ms ease'; veil.style.opacity = '0';
      setTimeout(function () { if (veil.parentNode) veil.parentNode.removeChild(veil); }, 2800);
    }, 4600);
  }

  var api = {
    on: ON, P: P, roomProps: roomProps, isRoom: isRoom, finish: finish, finished: function () { return finished; },
    fieldsFor: fieldsFor, sizeOf: sizeOf, pieceMeta: pieceMeta, polar: polar,
    setSize: function (id, v) { _sizeOverride[id] = v; }, setScenes: function (list) { _sceneSrc = list; },
    runtime: function () { return rt; }, busy: function () { return busy; }, whisper: whisper,
    current: current, ghostPos: ghostPos, spawnPos: spawnPos, inside: inside, rim: rim, pending: pending,
    start: start, afterPins: function () { if (rt) ensureDoor(); },
    go: go, map: map,
    route: function () { return route.slice(); }, nodes: function () { return nodes.slice(); }, edges: function () { return Object.assign({}, edges); },
    door: function () { return doorObj ? { x: doorObj.x, z: doorObj.z, to: doorObj.to } : null; },
    corridor: function () { return _cor; },
    corridorSpeed: 1,
  };
  try { var _mf = /[?&]fast=(d+)/.exec(global.location.search || ''); if (_mf && /[?&]dry=1/.test(global.location.search)) api.corridorSpeed = Number(_mf[1]) || 1; } catch (_) {}
  global.TemPiece = api;
  if (ON) console.log('[piece] 조각 방 방식 — 씬 하나가 땅 하나');
})(typeof window !== 'undefined' ? window : globalThis);

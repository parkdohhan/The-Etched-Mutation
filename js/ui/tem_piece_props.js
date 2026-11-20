/**
 * tem_piece_props.js — what the author stands on a piece, its sounds, and coming back (2026-11-18)
 * Decision record: docs/표류무대_실험-261118.md §11–12.   Editor: piece-editor.html
 *
 * Data (author, per scene):  scenes.meta.piece = {
 *   size: 0.5 ~ 1.2,
 *   cut: 'end' | 'stem',        // where the scene's text breaks for the walker: 'end' (default) =
 *                               // the whole body is shown and only its last sentence is left hanging;
 *                               // 'stem' = the derived cut (js/shared/tem_stem_cuts.js)
 *   see_line: '',               // the "… 가 보인다" line under the text ('' = from the scene's object word)
 *   props: [{ id, kind: 'object' | 'figure' | 'sound', role: 'speaking' | 'scenery',
 *             name, model, x, z, rot, scale, text, text_again,
 *             sound_url, sound_volume, sound_radius,     // spatial: loops from this spot
 *             click_sound_url, click_sound_volume }]     // one shot, only when the walker interacts
 * }
 *   object + speaking  = a thing with words in it: hold near it (or E) to read `text`
 *   object + scenery   = a thing that only makes the place
 *   figure + speaking  = a mannequin you can talk to: `text` is its line, the walker continues it
 *   figure + scenery   = a mannequin that only stands there
 *   sound              = nothing to see: a spot the sound comes from
 *   word               = words hanging in the air at that spot (`text`)
 *   buried             = words under the ground: a low mound; hold / E three times digs them up,
 *                        and they rise and stay in the air for the rest of the walk
 *   build              = a piece of a room (wall, floor, doorway, furniture of the building kit): stood at the
 *                        kit's own proportions (x KIT), origin at its corner, turned in quarter turns; `lift` raises
 *                        it (ceiling lamp), `light` puts a lamp's light there. Models whose key starts with
 *                        "벽" stop the walker (a "벽 문틀" leaves its opening free).  meta.piece.flat = level ground.
 *   A thing (object) with no 3D model is NOT stood at all — no stand-in blocks (author's rule, 261119).
 *
 * meta.piece.cue = { line, sound_url, volume, end }   (261119)
 *   When the scene's own text reaches `line`, `sound_url` plays once. With end:true nothing is
 *   written there: the walk closes when the sound has finished.
 *   The white column of light stands over what can be talked to, and over nothing else.
 *
 * Sound: spatial sounds are WebAudio panners at the prop's spot (direction + distance are heard).
 * A one-shot sound plays only on interaction — talking to that mannequin, reading that thing,
 * or (for things/mannequins with no words) holding / pressing E next to them.
 *
 * Coming back: the piece's own ghost is still there. Talking again shows the next edition of the
 * text (text_stage_1 → 2 → 3) with what the walker wrote there before woven in, last line hanging.
 */
(function (global) {
  'use strict';
  var TP = global.TemPiece;
  if (!TP) return;

  var rt = null, sceneId = null;
  var built = [];            // { prop, group|null, x, y, z, loop }
  var talks = {};            // key -> times the walker has written there (key = sceneId | sceneId#propId)
  var saidBy = {};           // key -> [what the walker wrote there]
  var target = null;         // the prop being talked to (null = the piece's own ghost)
  var activeKey = null, saidNow = 0;
  var reading = null;
  var dug = {};              // sceneId#propId -> digs so far (3 = out of the ground)
  var cuePlayed = {};
  var DIGS = 3;
  var KIT = 2.4;             // building-kit unit -> world (a wall: 2.4 wide, 3.1 high)
  var walls = [];            // solid segments of the current piece [{ ax, az, bx, bz }]

  function ko() { return (document.documentElement.lang || 'en').slice(0, 2) === 'ko'; }
  function propsOf(id) {
    var list = TP.pieceMeta(id).props;
    var own = Array.isArray(list) ? list.filter(function (p) { return p && p.id; }) : [];
    return (TP.roomProps ? TP.roomProps(id) : []).concat(own);          // the room's walls and floor first, then what stands in it
  }
  function models() { var mm = global.__temMemoryMeta; return (mm && mm.object_models) || {}; }
  function clampIn(id, x, z) {
    if (TP.inside(id, x, z, 2.5)) return { x: x, z: z };
    return TP.polar(id, Math.atan2(z, x), 0.9);
  }
  function sentences(t) { return String(t == null ? '' : t).split(/\n|(?<=[.!?。…])\s+/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function hang(s) { return String(s).replace(/[.!?…\s]+["”’']?$/, '') + '…'; }
  function closed(s) { s = String(s).trim(); return /[.!?…]["”’']?$/.test(s) ? s : s + '.'; }
  function has(v) { return !!String(v == null ? '' : v).trim(); }

  // ── spatial audio ────────────────────────────────────────────────────────
  var actx = null, bufs = {};
  function ctx() {
    if (!actx) { try { actx = new (global.AudioContext || global.webkitAudioContext)(); } catch (_) { actx = null; } }
    if (actx && actx.state !== 'running') { try { actx.resume(); } catch (_) {} }
    return actx;
  }
  function buffer(url) {
    var c = ctx(); if (!c) return Promise.reject(new Error('no audio'));
    if (!bufs[url]) bufs[url] = fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (ab) { return c.decodeAudioData(ab); });
    return bufs[url];
  }
  function panner(x, y, z, radius) {
    var c = ctx(), p = c.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'linear';
    p.refDistance = 1.5; p.maxDistance = Math.max(4, Number(radius) || 22); p.rolloffFactor = 1;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    return p;
  }
  function vol01(v, d) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(1, v)) : d; }
  /** A sound that keeps coming from one spot. Returns a handle with stop(). */
  function loopAt(url, x, y, z, volume, radius) {
    var h = { stopped: false, src: null, gain: null };
    h.stop = function () { h.stopped = true; try { if (h.gain) h.gain.gain.linearRampToValueAtTime(0, actx.currentTime + 0.6); if (h.src) h.src.stop(actx.currentTime + 0.7); } catch (_) {} };
    buffer(url).then(function (b) {
      if (h.stopped) return;
      var c = ctx(), src = c.createBufferSource(), g = c.createGain(), p = panner(x, y, z, radius);
      src.buffer = b; src.loop = true;
      g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(vol01(volume, 0.7), c.currentTime + 1.5);
      src.connect(g); g.connect(p); p.connect(c.destination); src.start();
      h.src = src; h.gain = g;
    }).catch(function (e) { console.warn('[piece] 공간 소리 실패', url, e && e.message); });
    return h;
  }
  /** One shot from a spot — interaction only. */
  function shotAt(url, x, y, z, volume) {
    if (!has(url)) return;
    buffer(url).then(function (b) {
      var c = ctx(), src = c.createBufferSource(), g = c.createGain(), p = panner(x, y, z, 30);
      src.buffer = b; g.gain.value = vol01(volume, 0.85);
      src.connect(g); g.connect(p); p.connect(c.destination); src.start();
    }).catch(function (e) { console.warn('[piece] 한 번 소리 실패', url, e && e.message); });
  }
  function listen(cam) {
    if (!actx) return;
    var L = actx.listener, p = cam.position, f = cam.getWorldDirection(_fwd);
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }
  var _fwd = global.THREE ? new global.THREE.Vector3() : null;
  // the browser needs one gesture before any sound: wake the context on the first key / press
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { global.addEventListener(ev, function () { if (built.length || actx) ctx(); }, { passive: true }); });

  // ── things ───────────────────────────────────────────────────────────────
  var _glb = {};
  function loadModel(path) {
    if (!_glb[path]) _glb[path] = new Promise(function (res, rej) { new global.THREE.GLTFLoader().load(path, function (g) { res(g.scene); }, undefined, rej); });
    return _glb[path];
  }
  function hashN(s) { var h = 2166136261 >>> 0; s = String(s); for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  // ── words in the air / under the ground ─────────────────────────────────
  var _dot = null;
  function dotTex() {
    if (_dot) return _dot;
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(236,224,200,1)'); g.addColorStop(0.35, 'rgba(236,224,200,0.35)'); g.addColorStop(1, 'rgba(236,224,200,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return (_dot = new global.THREE.CanvasTexture(c));
  }
  function wordSprite(text, scale) {
    var THREE = global.THREE, c = document.createElement('canvas'), x = c.getContext('2d');
    var font = '500 46px "Gowun Batang","Noto Serif KR",serif';
    x.font = font;
    var w = Math.ceil(x.measureText(text).width) + 56;
    c.width = w; c.height = 84;
    x = c.getContext('2d'); x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(8,8,14,0.9)'; x.shadowBlur = 12;
    x.fillStyle = 'rgba(236,228,250,0.96)';
    x.fillText(text, w / 2, 44);
    var tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.86, depthWrite: false, fog: false }));
    var h = 1.25 * (scale || 1);
    sp.scale.set(h * w / 84, h, 1);
    sp.userData.sx = h * w / 84; sp.userData.sy = h;
    return sp;
  }
  function settle(rec) {                                   // how far the mound has been dug away
    var n = dug[rec.key] || 0, m = rec.group && rec.group.getObjectByName('mound');
    if (m) { m.scale.set(1 + n * 0.22, 0.22 * (1 - n / DIGS * 0.8), 1 + n * 0.22); }
  }
  function raise(rec, already) {                           // the words come out of the ground
    var scene3 = rt.getScene();
    if (rec.group && rec.group.parent) rec.group.parent.remove(rec.group);
    rec.group = wordSprite(rec.prop.text, (Number(rec.prop.scale) || 1) * 0.3);   // read from 2-3 m away: smaller than words in the air
    rec.baseY = rec.gy + 1.55;
    rec.group.position.set(rec.x, already ? rec.baseY : rec.gy - 0.2, rec.z);
    rec.riseT = already ? null : performance.now();
    scene3.add(rec.group);
  }
  function dig(rec) {
    var n = (dug[rec.key] || 0) + 1; dug[rec.key] = n;
    if (n >= DIGS) { raise(rec, false); clickSound(rec.prop); }
    else settle(rec);
  }
  function blocked(x, z) {
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i], dx = w.bx - w.ax, dz = w.bz - w.az, L2 = dx * dx + dz * dz;
      var t = L2 ? Math.max(0, Math.min(1, ((x - w.ax) * dx + (z - w.az) * dz) / L2)) : 0;
      var px = w.ax + dx * t - x, pz = w.az + dz * t - z;
      if (px * px + pz * pz < 0.1) return true;             // 0.32 from the wall line
    }
    return false;
  }
  function unburied(p, key) { return p.kind === 'buried' && has(p.text) && (dug[key] || 0) < DIGS; }

  function clear() {
    built.forEach(function (b) {
      try { if (b.group && b.group.parent) b.group.parent.remove(b.group); } catch (_) {}
      try { if (b.loop) b.loop.stop(); } catch (_) {}
    });
    built = []; walls = [];
    closeReading();
  }

  function build(runtime, id) {
    rt = runtime; sceneId = id;
    clear();
    var THREE = global.THREE, scene3 = rt.getScene();
    propsOf(id).forEach(function (prop) {
      var p = clampIn(id, Number(prop.x) || 0, Number(prop.z) || 0);
      if (prop.kind !== 'build' && TP.intoRoom) p = TP.intoRoom(id, p.x, p.z);     // a closed room keeps its things inside
      var y = rt.gH(p.x, p.z);
      var rec = { prop: prop, group: null, x: p.x, y: y + 1.2, z: p.z, loop: null };
      if (prop.kind === 'object') {                        // figures are stood by the mannequin module (see entries())
        var group = new THREE.Group();
        group.position.set(p.x, y, p.z);
        group.rotation.y = Number(prop.rot) || 0;
        var sc = Number(prop.scale) || 1;
        var entry = prop.model ? models()[prop.model] : null;
        if (entry && entry.path) {
          loadModel(entry.path).then(function (tpl) {
            var o = tpl.clone(true);
            var box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
            o.scale.setScalar((Number(entry.scale) || 1) * sc * (1.4 / Math.max(0.001, Math.max(size.x, size.y, size.z))));
            var b2 = new THREE.Box3().setFromObject(o); o.position.y = -b2.min.y;
            group.add(o);
          }).catch(function () { try { scene3.remove(group); } catch (_) {} rec.group = null; });
          group.userData._pieceProp = true;
          scene3.add(group);
          rec.group = group;
        }
        // no model = not stood (no stand-in blocks). A sound set on it still comes from the spot.
      } else if (prop.kind === 'build') {
        var be = TP.roomsOn ? models()[prop.model] : null;       // rooms are off: walls, floors and room furniture are not stood
        if (be && be.path) {
          var bx = Number(prop.x) || 0, bz = Number(prop.z) || 0, th = Number(prop.rot) || 0;
          var bg = new THREE.Group();
          bg.position.set(bx, rt.gH(bx, bz) + (Number(prop.lift) || 0), bz);
          bg.rotation.y = th;
          rec.x = bx; rec.z = bz;
          (function (grp, entry, scl, tint) {
            loadModel(entry.path).then(function (tpl) {
              var o = tpl.clone(true); o.scale.setScalar(KIT * scl);
              o.traverse(function (m) {                      // the kit is toy-bright: bring it down into the fog's tone
                if (!m.isMesh || !m.material) return;
                var dim = function (mt) { var c = mt.clone(); if (c.color) { if (tint) c.color.set(tint); else c.color.multiplyScalar(0.5); } c.fog = true; if ('roughness' in c) c.roughness = 0.95; if ('metalness' in c) c.metalness = 0; return c; };
                m.material = Array.isArray(m.material) ? m.material.map(dim) : dim(m.material);
              });
              grp.add(o);
            }).catch(function () {});
          })(bg, be, Number(prop.scale) || 1, prop.tint || null);
          if (Number(prop.light) > 0) {
            var pl = new THREE.PointLight(0xe9eef4, Number(prop.light), 13, 1.8);
            pl.position.set(0.15, -0.3, -0.15); bg.add(pl);
          }
          bg.userData._pieceProp = true;
          scene3.add(bg); rec.group = bg;
          if (/^벽/.test(prop.model)) {                       // what stops the walker
            var cx = Math.cos(th), sx = -Math.sin(th);
            var seg = function (a, b) { walls.push({ ax: bx + cx * KIT * a, az: bz + sx * KIT * a, bx: bx + cx * KIT * b, bz: bz + sx * KIT * b }); };
            if (/문틀/.test(prop.model)) { seg(0, 0.24); seg(0.76, 1); } else if (/반/.test(prop.model)) seg(0, 0.5); else seg(0, 1);
          }
        }
      } else if (prop.kind === 'word' && has(prop.text)) {
        rec.group = wordSprite(prop.text, Number(prop.scale) || 1);
        rec.baseY = y + 1.5 + (hashN(prop.id) % 17) / 10;
        rec.phase = (hashN(prop.id) % 628) / 100;
        rec.group.position.set(p.x, rec.baseY, p.z);
        scene3.add(rec.group);
      } else if (prop.kind === 'buried' && has(prop.text)) {
        rec.key = id + '#' + prop.id; rec.gy = y;
        rec.phase = (hashN(prop.id) % 628) / 100;
        if ((dug[rec.key] || 0) >= DIGS) raise(rec, true);
        else {
          var g2 = new THREE.Group();
          var mound = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 14), new THREE.MeshStandardMaterial({ color: 0x0b1030, roughness: 1 }));
          mound.scale.set(1, 0.22, 1); mound.name = 'mound';
          var glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), transparent: true, opacity: 0.4, depthWrite: false, fog: true }));
          glint.scale.set(0.5, 0.5, 1); glint.position.y = 0.42; glint.name = 'glint';
          g2.add(mound); g2.add(glint);
          g2.position.set(p.x, y, p.z);
          scene3.add(g2); rec.group = g2;
          settle(rec);
        }
      }
      if (has(prop.sound_url)) rec.loop = loopAt(prop.sound_url, rec.x, rec.y, rec.z, prop.sound_volume, prop.sound_radius);
      built.push(rec);
    });
  }

  /** Extra figures for the mannequin module: entries shaped like _fpScenePins items. */
  function entries(runtime, scene, pin, add) {
    rt = runtime;
    var THREE = global.THREE, scene3 = rt.getScene(), out = [];
    propsOf(scene.id).forEach(function (prop) {
      if (prop.kind !== 'figure') return;
      var p = clampIn(scene.id, Number(prop.x) || 0, Number(prop.z) || 0);
      var y = rt.gH(p.x, p.z);
      var mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0 }));
      mesh.position.set(p.x, y + 0.6, p.z);
      mesh.userData._fpPin = true;
      scene3.add(mesh);
      var speaking = prop.role === 'speaking' && has(prop.text);
      out.push({
        mesh: mesh, pin: pin, scene: scene, wx: p.x, wz: p.z, _baseY: y + 0.6,
        accessible: true,                 // stood by the mannequin module either way
        visited: !speaking,               // "visited" = cannot be aimed at, no light column
        _prop: prop, _speaking: speaking,
      });
      if (speaking && typeof add === 'function') add(p.x, y, p.z);
    });
    return out;
  }
  function bodyFor(prop) {
    var e = prop && prop.model ? models()[prop.model] : null;
    return (e && e.path) ? { word: prop.model, path: e.path, scale: (Number(e.scale) || 1) * (Number(prop.scale) || 1) } : null;
  }
  /** The scene's own ghost can stand as a thing of the room (meta.piece.ghost_body = model key). */
  function ghostBody(id) {
    var k = TP.pieceMeta(id).ghost_body, e = k ? models()[k] : null;
    return (e && e.path) ? { word: k, path: e.path, scale: (Number(e.scale) || 1) * (Number(TP.pieceMeta(id).ghost_scale) || 1) } : null;
  }
  function recOf(prop) { for (var i = 0; i < built.length; i++) if (built[i].prop.id === prop.id) return built[i]; return null; }
  function clickSound(prop) {
    if (!prop || !has(prop.click_sound_url)) return;
    var r = recOf(prop), c = rt && rt.getCamera();
    if (r) shotAt(prop.click_sound_url, r.x, r.y, r.z, prop.click_sound_volume);
    else if (c) shotAt(prop.click_sound_url, c.position.x, c.position.y, c.position.z, prop.click_sound_volume);
  }

  // ── talking ──────────────────────────────────────────────────────────────
  function setTalkTarget(prop) { target = prop || null; }
  function passageFor(id, sceneData) {
    var key, text, n, main = !target, pm = TP.pieceMeta(id), sd = sceneData || {};
    saidNow = 0;
    if (target) {
      key = id + '#' + target.id; n = talks[key] || 0;
      text = (n > 0 && has(target.text_again)) ? target.text_again : target.text;
      clickSound(target);                                  // one shot: only because the walker spoke to it
      activeKey = key;
      if (!has(text)) return null;
    } else {
      key = id; n = talks[key] || 0;
      activeKey = key;
      if (n === 0) {
        var cue = cueOf(id), body = String(sd.text || ''), at = cue ? body.indexOf(cue.line) : -1;
        if (at > 0 && has(body.slice(0, at))) {              // the text up to the line; the line itself comes with its sound
          return { passage: sentences(body.slice(0, at)).join(' '), cueText: sentences(body.slice(at)).join(' '),
            cue: true, cueEnd: cue.end !== false, again: 0, main: true, seeLine: '' };
        }
        if (pm.cut === 'stem') return null;                // author chose the derived cut for this scene
        text = sd.text || '';                              // the whole body; only its last sentence hangs
      } else {
        text = (n >= 3 && sd.text_stage_3) || (n >= 2 && sd.text_stage_2) || sd.text_stage_1 || sd.text || '';
      }
    }
    var lines = sentences(text), prior = saidBy[key] || [];
    if (!lines.length) return null;
    // weave in what the walker wrote here before — except when the author wrote a separate
    // "again" line for this figure: that line is used as written.
    var authoredAgain = !!(target && n > 0 && has(target.text_again));
    if (prior.length && !authoredAgain) lines = lines.concat(prior.map(closed));
    lines.push(hang(lines.pop()));
    return { passage: lines.join(' '), again: n, main: main, seeLine: main && n === 0 ? String(pm.see_line || '').trim() : '' };
  }
  function cueOf(id) { var c = TP.pieceMeta(id).cue; return (c && has(c.line) && has(c.sound_url)) ? c : null; }
  /** Plays the scene's cue sound once (not from a spot — it is the scene's own). Resolves when it has finished. */
  function playCue(id) {
    var c = cueOf(id);
    return new Promise(function (res) {
      var over = false; function fin() { if (!over) { over = true; res(); } }
      if (!c || cuePlayed[id]) { setTimeout(fin, 3000); return; }
      cuePlayed[id] = true;
      buffer(c.sound_url).then(function (b) {
        var cx = ctx(), src = cx.createBufferSource(), g = cx.createGain();
        src.buffer = b; g.gain.value = vol01(c.volume, 0.9);
        src.connect(g); g.connect(cx.destination); src.onended = fin; src.start();
        setTimeout(fin, (b.duration + 1.5) * 1000);
      }).catch(function (e) { console.warn('[piece] 끝 소리 실패', c.sound_url, e && e.message); setTimeout(fin, 6000); });
    });
  }
  function noteSaid(text) {
    if (!activeKey) return;
    (saidBy[activeKey] = saidBy[activeKey] || []).push(String(text).replace(/\s*\n\s*/g, ' ').trim());
    saidNow++;
  }
  function talkEnded() {
    if (activeKey && saidNow > 0) talks[activeKey] = (talks[activeKey] || 0) + 1;
    activeKey = null; target = null; saidNow = 0;
  }

  // ── near a thing: read it, or touch it for its sound ─────────────────────
  var hintEl = null, nearRec = null, pressT = null;
  function hint(text) {
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.style.cssText = 'position:fixed;bottom:17%;left:50%;transform:translateX(-50%);z-index:2760;pointer-events:none;'
        + 'color:rgba(206,180,144,0.86);font:19px "Gowun Batang","Noto Serif KR",serif;letter-spacing:2px;text-shadow:0 0 10px rgba(0,0,0,0.8);opacity:0;transition:opacity 0.6s;';
      document.body.appendChild(hintEl);
    }
    if (text) { hintEl.textContent = text; hintEl.style.opacity = '1'; } else hintEl.style.opacity = '0';
  }
  function closeReading() { if (reading && reading.parentNode) reading.parentNode.removeChild(reading); reading = null; }
  function openReading(rec) {
    closeReading();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) {}
    reading = document.createElement('div');
    reading.style.cssText = 'position:fixed;inset:0;z-index:2790;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity 1200ms ease;'
      + 'background:linear-gradient(90deg, rgba(5,5,9,0) 0%, rgba(5,5,9,0.62) 24%, rgba(5,5,9,0.84) 38%, rgba(5,5,9,0.84) 62%, rgba(5,5,9,0.62) 76%, rgba(5,5,9,0) 100%);';
    var col = document.createElement('div');
    col.style.cssText = 'width:min(640px,90vw);font:1.28rem/2.05 "Gowun Batang","Noto Serif KR",serif;color:rgba(240,232,254,0.96);white-space:pre-wrap;';
    var name = document.createElement('div');
    name.textContent = rec.prop.name || '';
    name.style.cssText = 'font-size:0.8rem;letter-spacing:0.3em;opacity:0.55;margin-bottom:0.6em;';
    var body = document.createElement('div');
    body.textContent = sentences(rec.prop.text).join('\n');
    col.appendChild(name); col.appendChild(body);
    try {
      var left = (typeof global.__temObjectVariantLine === 'function') ? global.__temObjectVariantLine(rec.prop.name || '') : null;
      if (left) {
        var lv = document.createElement('div');
        lv.textContent = (ko() ? '…누군가 여기 두고 간 말 — ' : '…words someone left here — ') + '“' + left + '”';
        lv.style.cssText = 'margin-top:1.4em;font-size:1.02rem;font-style:italic;color:rgba(206,180,144,0.86);';
        col.appendChild(lv);
      }
    } catch (_) {}
    reading.appendChild(col);
    reading.addEventListener('click', closeReading);
    document.body.appendChild(reading);
    requestAnimationFrame(function () { if (reading) reading.style.opacity = '1'; });
  }
  function readable(p) { return p.kind === 'object' && p.role === 'speaking' && has(p.text); }
  function canTouch(b) {
    var p = b.prop;
    if (p.kind === 'word' || p.kind === 'build') return false;
    if (p.kind === 'buried') return unburied(p, b.key);
    if (p.kind === 'object' && !b.group) return false;     // not stood (no model)
    return touchable(p);
  }
  // can the walker do something to it directly? (talkable mannequins go through the long press on the figure)
  function touchable(p) {
    if (p.kind === 'sound') return false;
    if (p.kind === 'figure' && p.role === 'speaking' && has(p.text)) return false;
    return readable(p) || has(p.click_sound_url);
  }
  function interact() {
    if (!nearRec || reading || TP.busy() || document.getElementById('lumenDialogPhase1') || global.__temGhostAimed) return;
    if (nearRec.prop.kind === 'buried') { dig(nearRec); nearRec = null; hint(''); return; }   // the loop re-reads what is near
    clickSound(nearRec.prop);                              // one shot: only because the walker touched it
    if (readable(nearRec.prop)) openReading(nearRec);
  }
  global.addEventListener('keydown', function (e) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) return;
    if (e.key === 'e' || e.key === 'E' || e.key === 'ㄷ') interact();
    else if (e.key === 'Escape') closeReading();
  });
  // holding keeps digging (one dig per beat); for everything else the first beat is the whole act
  var holding = false, holdRec = null;
  function holdBeat() {
    if (!holding) return;                                  // only while the press lasts
    if (!nearRec && holdRec && unburied(holdRec.prop, holdRec.key)) nearRec = holdRec;   // same spot, next beat
    if (!nearRec || (holdRec && nearRec !== holdRec)) return;
    var wasDig = nearRec.prop.kind === 'buried'; holdRec = nearRec;
    interact();
    if (wasDig) pressT = setTimeout(holdBeat, 700);
  }
  function release() { holding = false; holdRec = null; clearTimeout(pressT); }
  global.addEventListener('pointerdown', function () { clearTimeout(pressT); holdRec = null; holding = true; if (nearRec && !reading) pressT = setTimeout(holdBeat, 750); });
  global.addEventListener('pointercancel', release); global.addEventListener('blur', release);
  global.addEventListener('pointerup', release);

  (function loop() {
    requestAnimationFrame(loop);
    if (!rt) return;
    var c = rt.getCamera();
    if (actx && c && _fwd) listen(c);
    if (!built.length) { if (nearRec) { nearRec = null; hint(''); } return; }
    var now = performance.now();
    for (var j = 0; j < built.length; j++) {               // words drift a little; dug words rise
      var w = built[j]; if (!w.group) continue;
      if (w.prop.kind === 'word' || (w.prop.kind === 'buried' && w.baseY != null)) {
        var bob = Math.sin(now / 2600 + (w.phase || 0)) * 0.13, yy = w.baseY + bob;
        if (w.riseT != null) {
          var k = Math.min(1, (now - w.riseT) / 3800), e = 1 - Math.pow(1 - k, 3);
          yy = (w.gy - 0.2) + (w.baseY - (w.gy - 0.2)) * e + bob * e;
          w.group.material.opacity = 0.86 * Math.min(1, k * 2.2);
          if (k >= 1) w.riseT = null;
        }
        w.group.position.y = yy;
        if (w.riseT == null) {                               // near = clear, far = a trace in the fog
          var dd = Math.hypot(c.position.x - w.x, c.position.z - w.z);
          w.group.material.opacity = 0.9 - 0.68 * Math.max(0, Math.min(1, (dd - 9) / 26));
          if (w.prop.kind === 'word') { var nf = Math.max(0.32, Math.min(1, dd / 10)); w.group.scale.set(w.group.userData.sx * nf, w.group.userData.sy * nf, 1); }
        }
      } else if (w.prop.kind === 'buried') {
        var gl = w.group.getObjectByName('glint');
        if (gl) gl.material.opacity = 0.3 + 0.22 * Math.sin(now / 1500 + (w.phase || 0));
      }
    }
    var best = null, bd = 3.6;
    for (var i = 0; i < built.length; i++) {
      var b = built[i];
      if (!canTouch(b)) continue;
      var d = Math.hypot(c.position.x - b.x, c.position.z - b.z);
      if (d < bd) { bd = d; best = b; }
    }
    var quiet = !!document.getElementById('lumenDialogPhase1') || !!reading || TP.busy();
    if (best !== nearRec || quiet) {
      nearRec = quiet ? null : best;
      hint(nearRec ? (nearRec.prop.kind === 'buried' ? (ko() ? '길게 누르거나 E — 파내기' : 'hold, or E — dig')
        : readable(nearRec.prop) ? (ko() ? '길게 누르거나 E — 들여다보기' : 'hold, or E — look closer') : (ko() ? '길게 누르거나 E' : 'hold, or E')) : '');
    }
  })();

  global.TemPieceProps = {
    build: build, clear: clear, entries: entries, bodyFor: bodyFor, propsOf: propsOf,
    blocked: blocked, KIT: KIT, ghostBody: ghostBody, setTalkTarget: setTalkTarget, passageFor: passageFor, playCue: playCue, dug: function () { return Object.assign({}, dug); }, noteSaid: noteSaid, talkEnded: talkEnded,
    talks: function () { return Object.assign({}, talks); },
    _audio: { loopAt: loopAt, shotAt: shotAt },
  };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * tem_drift_stage.js — drift stage (2026-11-18, experiment switch: play-test.html?drift=1)
 *
 * What it changes, only while the switch is on:
 *   1. Placement. Scene ghosts/objects are no longer pinned to authored coordinates.
 *      A scene has no place until the engine opens it; it then appears at a spot derived
 *      from the engine's access center (updateAccess → game._lastAccessGeom), measured
 *      from where the previous ghost stood. Once it has appeared it stays there.
 *   2. Atmosphere. Thick distance fog (ground readable only a few steps out, far terrain
 *      collapses into a flat silhouette) under a lighter sky, plus one faint light column
 *      over the scene that is currently open.
 *
 * What it does not change: the engine (ByeoriEngine, pattern center shift, which scene
 * opens), the dialog/continuation flow, the terrain itself, the database.
 *
 * Supersedes for this mode only: W4 "pins are the anchors of edition 0" (pins fixed,
 * ground erodes). Direction source: 2026-11-07 correction "distance is the result of
 * interaction". Rollback = drop the switch from the address.
 *
 * Definition / measure / staging kept apart:
 *   definition — offset of a newly opened scene = (access center − origin scene) on the
 *                emotion map, in units of this memory's pin spread.
 *   measure    — both points come from the engine's own map projection; no new metric.
 *   staging    — WORLD_PER_SPREAD, MIN/MAX distance, jitter, fog numbers below are free
 *                staging parameters, not part of the definition.
 */
(function (global) {
  'use strict';

  var ON = false;
  try { ON = /[?&]drift=1(&|$)/.test(global.location.search || ''); } catch (_) {}

  // ── dry run (?drift=1&dry=1): a rehearsal walk leaves nothing in the ledger.
  //   Table writes and record-*/insert-* functions are answered locally; reads and the
  //   classifier/dialog functions go through. Only active together with the drift switch.
  var DRY = false;
  try { DRY = ON && /[?&]dry=1(&|$)/.test(global.location.search || ''); } catch (_) {}
  if (DRY && typeof global.fetch === 'function') {
    var _fetch = global.fetch.bind(global);
    var _json = function (body, status) {
      return Promise.resolve(new Response(body, { status: status, headers: { 'Content-Type': 'application/json' } }));
    };
    global.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (/\/rest\/v1\//.test(url) && method !== 'GET' && method !== 'HEAD') {
          console.log('[drift:dry] 기록 생략', method, url.split('/rest/v1/')[1].split('?')[0]);
          return _json('[]', 201);
        }
        var fn = /\/functions\/v1\/([a-z0-9_-]+)/.exec(url);
        if (fn && /^(record-|insert-|collect-|generate-object-model|generate-scene-sound)/.test(fn[1])) {
          console.log('[drift:dry] 기록 생략', fn[1]);
          return _json('{"ok":true,"dry":true}', 200);
        }
      } catch (_) {}
      return _fetch(input, init);
    };
    console.log('[drift:dry] 연습 걸음 — 장부에 남기지 않는다');
  }

  var P = {
    WORLD_PER_SPREAD: 80,   // world units per one "pin spread" on the emotion map (261118 first walk: offsets came out 0.15~0.17 spreads; 26 pinned every ghost to MIN_DIST)
    MIN_DIST: 10,           // a new ghost never appears closer than this to the previous one
    MAX_DIST: 46,
    JITTER: 2.5,            // the only random part: a small wobble around the computed spot
    BOUND: 50,              // keep inside the walkable square (walk limit is ±54)
    KEEP_APART: 7,          // from other already-placed scenes
    KEEP_FROM_WALKER: 8,
    FOG_DENSITY: 0.125,
    FOG_COLOR: 0x3b4558,
    SKY_COLOR: 0x5d6a85,
    BEACON_H: 20,
    LIGHT_INTENSITY: 1.5,   // scene-colour ground light at an appeared scene
    LIGHT_REACH: 17,
    HUD_WORDS: 8,
    HUD_PER_LINE: 3,        // weighty words taken from one thing the walker wrote
  };

  var _pos = {};            // sceneId -> { x, z, dist, pattern }
  var _order = [];          // sceneIds in order of appearance
  var _log = [];

  function _hashAngle(s) {
    var h = 2166136261 >>> 0;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return ((h >>> 0) % 6283) / 1000;
  }

  // Reflect a coordinate back inside ±BOUND instead of clamping (clamping piles ghosts on the rim).
  function _fold(v) {
    var B = P.BOUND;
    for (var i = 0; i < 4 && (v > B || v < -B); i++) {
      if (v > B) v = 2 * B - v;
      if (v < -B) v = -2 * B - v;
    }
    return Math.max(-B, Math.min(B, v));
  }

  function _separate(x, z, ux, uz, selfId, cam) {
    for (var pass = 0; pass < 6; pass++) {
      var moved = false;
      for (var i = 0; i < _order.length; i++) {
        var id = _order[i];
        if (id === selfId) continue;
        var q = _pos[id];
        var dx = x - q.x, dz = z - q.z;
        if (dx * dx + dz * dz < P.KEEP_APART * P.KEEP_APART) {
          x += ux * P.KEEP_APART; z += uz * P.KEEP_APART; moved = true;
        }
      }
      if (cam) {
        var cx = x - cam.x, cz = z - cam.z;
        if (cx * cx + cz * cz < P.KEEP_FROM_WALKER * P.KEEP_FROM_WALKER) {
          x += ux * P.KEEP_FROM_WALKER; z += uz * P.KEEP_FROM_WALKER; moved = true;
        }
      }
      if (!moved) break;
    }
    return { x: _fold(x), z: _fold(z) };
  }

  /**
   * Where does this scene stand? Returns the stored spot, or computes and stores one.
   * ctx: { geom: game._lastAccessGeom | null, cam: {x, z}, towardX, towardZ }
   */
  function place(sceneId, ctx) {
    if (_pos[sceneId]) return _pos[sceneId];
    ctx = ctx || {};
    var cam = ctx.cam || { x: 22, z: 22 };
    var geom = ctx.geom;
    var origin = geom && geom.originSceneId ? _pos[geom.originSceneId] : null;
    var out, dist, pattern = (geom && geom.pattern) || 'initial';

    if (!geom || !origin || !geom.center || !geom.originMap) {
      // Opening of the run (no engine reading yet): just ahead of the walker, toward the middle.
      var n = _order.length;
      var tx = (ctx.towardX != null ? ctx.towardX : 0) - cam.x;
      var tz = (ctx.towardZ != null ? ctx.towardZ : 0) - cam.z;
      var tl = Math.sqrt(tx * tx + tz * tz) || 1;
      var a = Math.atan2(tz, tx) + (n % 2 === 0 ? -0.28 : 0.42) * (1 + Math.floor(n / 2) * 0.6);
      dist = 13 + n * 8;
      out = _separate(cam.x + Math.cos(a) * dist, cam.z + Math.sin(a) * dist, Math.cos(a), Math.sin(a), sceneId, null);
      pattern = 'initial';
    } else {
      var spread = Math.max(0.02, Number(geom.spread) || 0.12);
      var dx = (geom.center.x - geom.originMap.x) / spread;
      var dz = (geom.center.y - geom.originMap.y) / spread;
      var mag = Math.sqrt(dx * dx + dz * dz);
      var ux, uz;
      if (mag < 1e-3) {
        // center sits on the origin scene (fixation): direction is undefined on the map —
        // take a fixed per-scene direction so the spot is still reproducible.
        var ha = _hashAngle(sceneId);
        ux = Math.cos(ha); uz = Math.sin(ha);
      } else { ux = dx / mag; uz = dz / mag; }
      dist = Math.max(P.MIN_DIST, Math.min(P.MAX_DIST, mag * P.WORLD_PER_SPREAD));
      var jx = (Math.random() * 2 - 1) * P.JITTER, jz = (Math.random() * 2 - 1) * P.JITTER;
      out = _separate(origin.x + ux * dist + jx, origin.z + uz * dist + jz, ux, uz, sceneId, cam);
    }
    _pos[sceneId] = { x: out.x, z: out.z, dist: +dist.toFixed(1), pattern: pattern };
    _order.push(sceneId);
    _log.push({ sceneId: sceneId, pattern: pattern, dist: +dist.toFixed(1), x: +out.x.toFixed(1), z: +out.z.toFixed(1) });
    try { console.log('[drift] 등장', pattern, '거리', dist.toFixed(1), '→ (' + out.x.toFixed(1) + ', ' + out.z.toFixed(1) + ')'); } catch (_) {}
    return _pos[sceneId];
  }

  function has(sceneId) { return !!_pos[sceneId]; }

  // ── atmosphere ────────────────────────────────────────────────────────────
  var _beacons = [];        // { sprite, x, z }
  var _atmoInstalled = false;
  var _mmHidden = false;

  function _beaconTexture() {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    var g = c.getContext('2d');
    var v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255,236,204,0)');
    v.addColorStop(0.55, 'rgba(255,236,204,0.55)');
    v.addColorStop(1, 'rgba(255,236,204,0.95)');
    g.fillStyle = v; g.fillRect(0, 0, 64, 256);
    // horizontal falloff
    var img = g.getImageData(0, 0, 64, 256), d = img.data;
    for (var y = 0; y < 256; y++) {
      for (var x = 0; x < 64; x++) {
        var k = 1 - Math.abs(x - 31.5) / 32;
        d[(y * 64 + x) * 4 + 3] = Math.round(d[(y * 64 + x) * 4 + 3] * k * k);
      }
    }
    g.putImageData(img, 0, 0);
    var t = new global.THREE.CanvasTexture(c);
    return t;
  }
  var _beaconTex = null;

  /** A faint column of light over the open scene; removed with the pins (userData._fpPin). */
  function addBeacon(scene3, x, groundY, z) {
    var THREE = global.THREE;
    if (!THREE || !scene3) return null;
    if (!_beaconTex) _beaconTex = _beaconTexture();
    var mat = new THREE.SpriteMaterial({
      map: _beaconTex, transparent: true, opacity: 0, fog: false,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    var sp = new THREE.Sprite(mat);
    sp.scale.set(3.4, P.BEACON_H, 1);
    sp.position.set(x, groundY + P.BEACON_H / 2, z);
    sp.userData._fpPin = true;
    sp.userData._driftBeacon = true;
    scene3.add(sp);
    _beacons.push({ sprite: sp, x: x, z: z, born: performance.now() });
    return sp;
  }

  function installAtmosphere(rt) {
    if (_atmoInstalled || !rt) return;
    var THREE = global.THREE;
    var renderer = rt.getRenderer && rt.getRenderer();
    var scene3 = rt.getScene && rt.getScene();
    if (!renderer || !scene3 || !THREE) return;
    var fogCol = new THREE.Color(P.FOG_COLOR);
    var skyCol = new THREE.Color(P.SKY_COLOR);
    var skyMat = null;
    scene3.traverse(function (o) {
      if (!skyMat && o.isMesh && o.material && o.material.uniforms && o.material.uniforms.uBase) skyMat = o.material;
    });
    // LumenVisualEffects rewrites scene.fog.density every frame inside its own render wrap
    // (inner to ours), so writing the number here loses. Pin the property instead: in this
    // mode the fog thickness has one owner. Other modules' writes become no-ops.
    if (scene3.fog) {
      try {
        Object.defineProperty(scene3.fog, 'density', {
          configurable: true,
          get: function () { return P.FOG_DENSITY; },
          set: function () {},
        });
      } catch (_) {}
    }
    // minimap stays (user decision 261118) — it only shows scenes that have appeared.
    // the emotion wave lines along the bottom are off in this stage (user decision 261118)
    try { var stW = document.createElement('style'); stW.textContent = '#fpAmbientWaveWrap,#fpAmbientWaveCanvas{display:none!important}'; document.head.appendChild(stW); } catch (_) {}
    var orig = renderer.render.bind(renderer);
    renderer.render = function (s, c) {
      if (s === scene3) {
        fogCol.setHex(P.FOG_COLOR); skyCol.setHex(P.SKY_COLOR);   // live-tunable from the console
        if (s.fog) s.fog.color.copy(fogCol);
        // fog walls (unopened ground) take the fog colour, darker than the horizon, so the
        // unopened ridges stay as silhouettes instead of melting into the sky.
        var sfU = global.__temSpatialFogUniforms;
        if (sfU && sfU.uSky) sfU.uSky.value.copy(fogCol);
        if (s.background && s.background.isColor) s.background.copy(fogCol);
        if (skyMat) skyMat.uniforms.uBase.value.copy(skyCol);
        // beacons: slow breath, brighter as the walker closes in; drop the ones the pin sweep removed
        var now = performance.now();
        for (var i = _beacons.length - 1; i >= 0; i--) {
          var b = _beacons[i];
          if (!b.sprite.parent) { _beacons.splice(i, 1); continue; }
          var dx = c.position.x - b.x, dz = c.position.z - b.z;
          var d = Math.sqrt(dx * dx + dz * dz);
          var near = Math.max(0, Math.min(1, 1 - d / 70));
          var rise = Math.min(1, (now - b.born) / 4000);
          var breath = 0.85 + 0.15 * Math.sin(now / 1000 * (2 * Math.PI / 5.5));
          b.sprite.material.opacity = (0.10 + 0.34 * near) * rise * breath;
        }
        // words hanging around appeared scenes: slow bob, visible through the fog but only nearby
        for (var w = 0; w < _words3d.length; w++) {
          var q = _words3d[w];
          var wx = c.position.x - q.x, wz = c.position.z - q.z;
          var wd = Math.sqrt(wx * wx + wz * wz);
          var wn = Math.max(0, Math.min(1, 1 - (wd - 6) / 30));
          var wrise = Math.min(1, (now - q.born) / 5000);
          q.sprite.position.y = q.y + Math.sin(now / 1000 * (2 * Math.PI / q.period) + q.phase) * 0.35;
          q.sprite.material.opacity = 0.62 * wn * wrise;
        }
      }
      orig(s, c);
    };
    _atmoInstalled = true;
    console.log('[drift] 안개·하늘 설치 — 밀도', P.FOG_DENSITY);
  }

  // ── dressing of an appeared scene: its colour on the ground + its words in the air ──
  //   The old stage showed these only inside the area the fog had opened. Here nothing
  //   "opens", so each scene carries them to wherever it appears. Created once per scene
  //   and kept (not swept with the pins) — light count changes only when a scene appears.
  var EMO_COLOR = {
    fear: 0x5a6ed8, sadness: 0x4f86c6, anger: 0xd8584a, guilt: 0x9a6ad0, shame: 0xc86a9a,
    isolation: 0x5f7fa8, loneliness: 0x5f7fa8, numbness: 0x8a93a3, moral_pain: 0xa85f8a,
    helplessness: 0x6f7fb0, despair: 0x4a4f8a, disgust: 0x8aa85a, envy: 0x6aa878,
    longing: 0xd0a060, tenderness: 0xe0a890, love: 0xe08a8a, hope: 0xe6c86a, joy: 0xf0d070,
    relief: 0x8ad0c0, gratitude: 0xd8c08a, peace: 0x9ac8d8, comfort: 0xd8b89a, surprise: 0xd8d0a0,
  };
  function _domColor(emo) {
    if (typeof emo === 'string') { try { emo = JSON.parse(emo); } catch (_) { emo = null; } }
    var best = null, bv = 0;
    if (emo && typeof emo === 'object') {
      for (var k in emo) { var v = Number(emo[k]) || 0; if (v > bv && EMO_COLOR[k]) { bv = v; best = k; } }
    }
    return best ? EMO_COLOR[best] : 0xd0b890;
  }
  function _wordSprite(text) {
    var THREE = global.THREE;
    var c = document.createElement('canvas');
    var g = c.getContext('2d');
    var font = '500 44px "Gowun Batang","Noto Serif KR",serif';
    g.font = font;
    var wpx = Math.ceil(g.measureText(text).width) + 40;
    c.width = wpx; c.height = 72;
    g = c.getContext('2d');
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 10;
    g.fillStyle = 'rgba(236,224,204,1)';
    g.fillText(text, wpx / 2, 38);
    var tex = new THREE.CanvasTexture(c);
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, fog: false, depthWrite: false });
    var sp = new THREE.Sprite(mat);
    var hWorld = 0.62;
    sp.scale.set(hWorld * wpx / 72, hWorld, 1);
    return sp;
  }
  var _dressed = {};
  var _words3d = [];
  var _hudWords = [];       // words for the on-screen drifters, newest scene first

  function dress(rt, scene, x, z) {
    var THREE = global.THREE;
    if (!THREE || !rt || !scene || _dressed[scene.id]) return;
    var scene3 = rt.getScene && rt.getScene();
    if (!scene3) return;
    _dressed[scene.id] = true;
    var gy = (typeof rt.gH === 'function') ? rt.gH(x, z) : 0;
    try {
      var light = new THREE.PointLight(_domColor(scene.original_emotion), P.LIGHT_INTENSITY, P.LIGHT_REACH, 1.6);
      light.position.set(x, gy + 2.6, z);
      light.userData._driftLight = true;
      scene3.add(light);
    } catch (_) {}
    var words = [];
    var ew = scene.echo_words;
    if (typeof ew === 'string') { try { ew = JSON.parse(ew); } catch (_) { ew = []; } }
    if (Array.isArray(ew)) ew.forEach(function (w) { w = String(w || '').trim(); if (w && /[가-힣A-Za-z0-9]/.test(w)) words.push(w); });
    var a0 = _hashAngle(scene.id);
    words.slice(0, 4).forEach(function (w, i) {
      var a = a0 + i * 1.7, r = 3.2 + (i % 2) * 1.8;
      var sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
      var sy = ((typeof rt.gH === 'function') ? rt.gH(sx, sz) : gy) + 1.5 + (i % 3) * 0.55;
      var sp = _wordSprite(w);
      sp.position.set(sx, sy, sz);
      sp.userData._driftWord = true;
      scene3.add(sp);
      _words3d.push({ sprite: sp, x: sx, z: sz, y: sy, born: performance.now(), period: 9 + i * 2.3, phase: i * 1.3 });
    });
  }

  /**
   * The walker's own words go up on the screen (user decision 261118): the on-screen
   * drifters are what the walker said — not the scene's echo words, and not whole
   * sentences either: only the few words that carry weight (things, qualities, feelings,
   * a strong act). Echo words belong to the ground (the 3D words above).
   *
   * pickWords is a surface heuristic, not grammar analysis (no morphological analyser in
   * the browser): strip particles, drop function words and connective verb forms, score
   * what is left. Free staging rule — the lists below are tunable, not a definition.
   */
  var STOP = ('나 내 저 제 너 네 우리 그 이 저것 그것 이것 것 거 수 때 곳 데 쪽 중 뿐 듯 줄 채 더 덜 안 못 좀 꼭 참 잘 또 다 막 딱 '
    + '그냥 한참 아무 아무도 아무것 이제 드디어 다시 계속 정말 너무 아주 매우 조금 많이 그리 이리 저리 거기 여기 저기 '
    + '그런데 하지만 그리고 그래서 그러다가 그러자 그럼에도 불구하고 순간 그때 '
    + '있다 있었다 없다 없었다 않다 않는다 않았다 못했다 했다 한다 된다 됐다 같다 같았다 싶다 싶었다 '
    + '보고 서 있고 하고 되고 생각 생각했다 말 말했다').split(' ');
  var JOSA = ['에게서', '으로써', '으로서', '이라고', '에서는', '에게는', '한테는', '처럼', '까지', '부터', '에서', '에게', '한테',
    '으로', '이라', '라고', '이나', '보다', '마다', '조차', '마저', '밖에', '이랑', '하고',
    '은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '와', '과', '로', '랑', '께', '나', '야'];
  // feeling / sensation stems — a hit keeps even a one-syllable word
  var FEEL = ['화', '분노', '슬프', '슬픔', '기쁘', '기쁨', '무섭', '무서', '두렵', '두려', '외롭', '외로', '그립', '그리', '미안', '죄',
    '부끄', '수치', '아프', '아픔', '차갑', '차가', '따뜻', '뜨거', '싫', '밉', '미움', '사랑', '죽', '울', '웃', '눈물', '피',
    '떨', '숨', '비명', '후회', '원망', '용서', '공포', '절망', '허무', '쓸쓸', '서럽', '서러', '답답', '억울', '지겹', '역겹'];
  function _stripJosa(w) {
    for (var i = 0; i < JOSA.length; i++) {
      var j = JOSA[i];
      if (w.length - j.length >= 1 && w.slice(-j.length) === j) return w.slice(0, -j.length);
    }
    return w;
  }
  // one-syllable stems are too greedy as prefixes ("떨" would catch "떨어져"): a noun stem must
  // be the whole word, a verb stem must be followed by a tense/ending syllable.
  var FEEL_NOUN1 = ['화', '죄', '피', '숨'];
  var FEEL_VERB1 = ['울', '웃', '죽', '떨', '싫', '밉'];
  function _isFeel(raw, bare) {
    if (FEEL_NOUN1.indexOf(bare) !== -1) return true;
    for (var v = 0; v < FEEL_VERB1.length; v++) {
      if (raw.indexOf(FEEL_VERB1[v]) === 0 && /^.(었|렸|었었|는|고|며|음|다|어서|었다|렸다)/.test(raw)) return true;
    }
    return FEEL.some(function (f) { return f.length >= 2 && raw.indexOf(f) === 0; });
  }
  function pickWords(text, max) {
    var toks = String(text == null ? '' : text).replace(/["'“”‘’()\[\]…·,.!?~\-—:;]/g, ' ').split(/\s+/).filter(Boolean);
    var cand = [];
    for (var i = 0; i < toks.length; i++) {
      var raw = toks[i];
      if (!/[가-힣A-Za-z]/.test(raw)) continue;
      raw = raw.replace(/다고$/, '다');                       // quoted predicate ("미안하다고" → "미안하다")
      var bare = _stripJosa(raw);
      if (STOP.indexOf(raw) !== -1 || STOP.indexOf(bare) !== -1) continue;
      var feel = _isFeel(raw, bare);
      var w = raw, score = 0;
      var isPred = /(다|요|죠|네|까)$/.test(raw) && raw.length >= 3;          // sentence-final predicate
      var isConn = /(지|고|서|며|면|아|어|여|져|려|혀|워|와|게|니|는데|지만|도록|려고|다가)$/.test(raw) && !isPred;  // connective verb form
      var isMod = /[가-힣](운|은|한|던|인|된|진|는)$/.test(raw) && raw.length >= 3;  // modifier ("차가운", "낡은")
      if (isPred) { score = raw.length >= 4 ? 2.5 : 1; }
      else if (isMod && !isConn) { score = 3.2; }
      else if (isConn) { score = 0; }
      else { w = bare; score = w.length >= 2 ? 2 + Math.min(3, w.length) * 0.5 : 0; }  // thing-word (one syllable = too light)
      if (feel) { score += 4; if (!isPred && !isMod) w = bare; }
      if (STOP.indexOf(w) !== -1) continue;
      if (score <= 0) continue;
      cand.push({ w: w, score: score, i: i });
    }
    cand.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    var out = [];
    for (var k = 0; k < cand.length && out.length < (max || 3); k++) {
      if (out.indexOf(cand[k].w) === -1) out.push(cand[k].w);
    }
    return out;
  }
  function said(text) {
    var parts = pickWords(text, P.HUD_PER_LINE);
    if (!parts.length) return;
    _hudWords = parts.concat(_hudWords.filter(function (w) { return parts.indexOf(w) === -1; })).slice(0, P.HUD_WORDS);
    _syncHud();
  }

  // ── on-screen drifters: echo words wander the side margins while walking and during text ──
  //   Same grammar as the text room's side floaters (slow, wide, never bouncing).
  var _hudLayer = null, _hudItems = [], _hudRaf = 0;
  function _syncHud() {
    if (typeof document === 'undefined') return;
    if (!_hudLayer) {
      _hudLayer = document.createElement('div');
      _hudLayer.id = 'temDriftWords';
      _hudLayer.style.cssText = 'position:fixed;inset:0;z-index:2850;pointer-events:none;overflow:hidden;';
      document.body.appendChild(_hudLayer);
    }
    var keep = {};
    _hudWords.forEach(function (w, i) {
      keep[w] = true;
      if (_hudItems.some(function (it) { return it.word === w; })) return;
      var el = document.createElement('div');
      el.textContent = w;
      el.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;font-family:"Gowun Batang","Noto Serif KR",serif;'
        + 'font-size:19px;letter-spacing:3px;color:rgba(226,212,188,0.9);text-shadow:0 0 14px rgba(0,0,0,0.75),0 0 22px rgba(196,168,130,0.25);'
        + 'opacity:0;transition:opacity 4s ease;will-change:transform;';
      _hudLayer.appendChild(el);
      var n = _hudItems.length;
      var left = n % 2 === 0;
      _hudItems.push({
        word: w, el: el,
        cx: left ? 0.11 : 0.89, ax: 0.075,
        cy: left ? (0.50 + ((n * 0.37) % 1) * 0.16) : (0.14 + ((n * 0.37) % 1) * 0.5), ay: left ? 0.07 : 0.11,   // left band stays below the minimap
        tx: 47 + (n * 13) % 31, ty: 61 + (n * 17) % 37,
        px: n * 2.1, py: n * 1.3,
        base: 0.34 + (n % 3) * 0.07,
      });
      setTimeout(function () { el.style.opacity = String(0.34 + (n % 3) * 0.07); }, 60);
    });
    for (var i = _hudItems.length - 1; i >= 0; i--) {
      if (keep[_hudItems[i].word]) continue;
      (function (it) {
        it.el.style.opacity = '0';
        setTimeout(function () { if (it.el.parentNode) it.el.parentNode.removeChild(it.el); }, 4200);
      })(_hudItems[i]);
      _hudItems.splice(i, 1);
    }
    if (!_hudRaf) _hudRaf = requestAnimationFrame(_hudTick);
  }
  function _hudTick() {
    _hudRaf = requestAnimationFrame(_hudTick);
    var t = performance.now() / 1000, W = global.innerWidth, H = global.innerHeight;
    for (var i = 0; i < _hudItems.length; i++) {
      var it = _hudItems[i];
      var x = (it.cx + it.ax * Math.sin(t * 2 * Math.PI / it.tx + it.px)) * W;
      var y = (it.cy + it.ay * Math.sin(t * 2 * Math.PI / it.ty + it.py)) * H;
      // long phrases must not slide off the edge: keep the whole word on screen
      var ew = it.el.offsetWidth;
      var lx = Math.max(14, Math.min(W - ew - 14, x - ew / 2));
      it.el.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    }
  }

  /** Piece rooms: the dressing belongs to one piece — clear it when the walker leaves. */
  function clearDressing(rt) {
    try {
      var scene3 = rt && rt.getScene && rt.getScene();
      if (scene3) {
        var rm = [];
        scene3.traverse(function (o) { if (o.userData && (o.userData._driftLight || o.userData._driftWord)) rm.push(o); });
        rm.forEach(function (o) { scene3.remove(o); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      }
    } catch (_) {}
    _dressed = {}; _words3d.length = 0;
  }

  function reset() { _pos = {}; _order = []; _log = []; }

  global.TemDrift = {
    on: ON,
    P: P,
    place: place,
    has: has,
    addBeacon: addBeacon,
    dress: dress,
    clearDressing: clearDressing,
    said: said,
    pickWords: pickWords,
    installAtmosphere: installAtmosphere,
    reset: reset,
    positions: function () { return _pos; },
    log: function () { return _log.slice(); },
  };
  if (ON) console.log('[drift] 표류 무대 ON — 유령·사물 자리는 엔진 중심에서 나온다');
})(typeof window !== 'undefined' ? window : globalThis);

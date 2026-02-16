// ================================================================
//  STRATA — ACCUMULATION RENDERER v3.0
//  Project Integration Version
// ================================================================

(function () {
  'use strict';

  // ================================================================
  //  DETERMINISTIC RNG
  // ================================================================
  function mulberry32(seed) {
    var s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return h >>> 0;
  }
  function rngFrom() {
    var key = '';
    for (var i = 0; i < arguments.length; i++) key += ':' + arguments[i];
    return mulberry32(hashStr(key));
  }

  // ================================================================
  //  DETERMINISTIC NOISE
  // ================================================================
  function hs(x, y) { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
  function sn(x, y) {
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return hs(i, j) + (hs(i + 1, j) - hs(i, j)) * sx + (hs(i, j + 1) - hs(i, j)) * sy + (hs(i, j) - hs(i + 1, j) - hs(i, j + 1) + hs(i + 1, j + 1)) * sx * sy;
  }
  function fm(x, y, o) {
    o = o || 4; var v = 0, a = 0.5, f = 1;
    for (var i = 0; i < o; i++) { v += a * sn(x * f, y * f); a *= 0.5; f *= 2.1; }
    return v;
  }

  var GRID = 80, SIZE = 50, HALF = SIZE / 2;

  // ================================================================
  //  [3] BYEORI ENGINE MAPPER
  // ================================================================

  function computeWeightsFromVAD(vad, anchors) {
    var weights = {};
    var totalW = 0;
    for (var name in anchors) {
      var anc = anchors[name];
      var dv = vad.v - anc.v, da = vad.a - anc.a;
      var dist = Math.sqrt(dv * dv + da * da);
      var w = Math.exp(-(dist * dist) / (2 * 0.25));
      if (w > 0.01) { weights[name] = w; totalW += w; }
    }
    if (totalW > 0) { for (var k in weights) weights[k] /= totalW; }
    return weights;
  }

  function mapEventToRender(raw, anchors) {
    var vad = raw.vad || { v: 0, a: 0, d: 0 };
    var align = raw.alignment_score !== undefined ? raw.alignment_score : 0.5;
    var voidM = raw.void_mismatch || false;

    var weights = computeWeightsFromVAD(vad, anchors);
    var dominance = vad.d || 0;
    var deviation = Math.max(0, 1 - align);
    var void_rupture = voidM ? Math.max(0.3, deviation) : 0;
    var erosion = deviation * 0.6 + (1 - (raw.emb_score_raw || 0.5)) * 0.4;
    var intensity = 0.5 + align * 0.5;

    return {
      scene_id: raw.scene_id || 'unknown',
      timestamp: raw.timestamp || Date.now(),
      weights: weights,
      dominance: dominance,
      deviation: deviation,
      void_rupture: void_rupture,
      erosion: Math.min(1, erosion),
      intensity: intensity,
      _alignment: align,
      _voidMismatch: voidM,
    };
  }

  // ================================================================
  //  [1] GLOBAL EVENTS + LAYER DEFS + ROLLOVER
  // ================================================================

  var DEFAULT_LAYER_DEFS = [
    { id: 'surface', label: '표층', sub: '최근 7일',   windowDays: [0, 7],       thickness: 3.5, opacity: 1.0,  compaction: 1.0 },
    { id: 'near',    label: '근층', sub: '7–30일',     windowDays: [7, 30],      thickness: 2.8, opacity: 0.90, compaction: 0.82 },
    { id: 'mid',     label: '중층', sub: '30–90일',    windowDays: [30, 90],     thickness: 2.2, opacity: 0.75, compaction: 0.60 },
    { id: 'deep',    label: '심층', sub: '90–180일',   windowDays: [90, 180],    thickness: 1.6, opacity: 0.55, compaction: 0.35 },
    { id: 'bedrock', label: '기반암', sub: '원본 봉인', windowDays: [180, Infinity], thickness: 1.0, opacity: 0.30, compaction: 0.15 },
  ];

  var _config = {
    anchors: {},
    layerDefs: DEFAULT_LAYER_DEFS,
    title: '',
    sealed: '',
    sealedAt: null,
    bedrockEvents: [],
  };

  var _globalEvents = [];
  var _computedLayers = [];
  var _prevEventCounts = [];
  var _layerCache = [];
  var _layerGroups = [];
  var _anchorLabels = [];
  var _layerLabels = [];

  var canvas, renderer, threeScene, camera, group, pointLight;
  var animId = null, drag = false, pm = { x: 0, y: 0 };
  var oa = { t: 0.5, p: 0.75 }, oR = 60;
  var lookAt = new THREE.Vector3(0, 0, 0);
  var at = 0, lc;

  function recomputeLayers(now) {
    now = now || Date.now();
    var DAY_MS = 86400000;

    var newLayers = _config.layerDefs.map(function (def, i) {
      var layer = Object.assign({}, def);
      layer.seed = def.id + '-' + Math.floor(now / DAY_MS);

      if (def.id === 'bedrock') {
        layer.events = _config.bedrockEvents.slice();
      } else {
        var minAge = def.windowDays[0] * DAY_MS;
        var maxAge = def.windowDays[1] * DAY_MS;
        layer.events = _globalEvents.filter(function (ev) {
          var age = now - ev.timestamp;
          return age >= minAge && age < maxAge;
        });
      }

      var totalPoll = 0;
      layer.events.forEach(function (ev) {
        totalPoll += (1 - (ev._alignment || 0.5));
      });
      layer.pollution = layer.events.length > 0 ? totalPoll / layer.events.length : 0;

      return layer;
    });

    var changed = [];
    for (var i = 0; i < newLayers.length; i++) {
      var oldCount = _prevEventCounts[i] || -1;
      var newCount = newLayers[i].events.length;
      var oldPoll = _computedLayers[i] ? _computedLayers[i].pollution : -1;
      if (newCount !== oldCount || Math.abs(newLayers[i].pollution - oldPoll) > 0.02) {
        changed.push(i);
      }
      _prevEventCounts[i] = newCount;
    }

    _computedLayers = newLayers;
    return changed;
  }

  // ================================================================
  //  [C] BAKE (with pollution field)
  // ================================================================

  function bakeLayer(li) {
    var layer = _computedLayers[li];
    var anchors = _config.anchors;
    var comp = layer.compaction;
    var opa = layer.opacity;
    var events = layer.events || [];
    var layerPollution = layer.pollution || 0;

    var total = GRID * GRID;
    var heights = new Float32Array(total);
    var colors = new Float32Array(total * 3);
    var pollField = new Float32Array(total);

    for (var ei = 0; ei < events.length; ei++) {
      var ev = events[ei];
      var evPoll = 1 - (ev._alignment || 0.5);
      if (evPoll < 0.1) continue;

      for (var eName in ev.weights) {
        var ew = ev.weights[eName];
        if (!ew || !anchors[eName]) continue;
        var anc = anchors[eName];
        var ancIx = Math.round(((anc.v * HALF) / SIZE + 0.5) * (GRID - 1));
        var ancIz = Math.round(((anc.a * HALF) / SIZE + 0.5) * (GRID - 1));
        var radius = Math.ceil(2 + ew * 6);

        for (var dz = -radius; dz <= radius; dz++) {
          for (var dx = -radius; dx <= radius; dx++) {
            var gix = ancIx + dx, giz = ancIz + dz;
            if (gix < 0 || gix >= GRID || giz < 0 || giz >= GRID) continue;
            var d = Math.sqrt(dx * dx + dz * dz);
            if (d > radius) continue;
            var falloff = Math.exp(-(d * d) / (2 * (radius * 0.4) * (radius * 0.4)));
            pollField[giz * GRID + gix] += evPoll * ew * falloff * 0.3;
          }
        }
      }
    }
    for (var i = 0; i < total; i++) pollField[i] = Math.min(1, pollField[i]);

    for (var iz = 0; iz < GRID; iz++) {
      for (var ix = 0; ix < GRID; ix++) {
        var idx = iz * GRID + ix;
        var gx = (ix / (GRID - 1) - 0.5) * SIZE;
        var gz = (iz / (GRID - 1) - 0.5) * SIZE;
        var localPoll = pollField[idx];

        var h = 0, cr = 0.10, cg = 0.10, cb = 0.13;

        for (var ei = 0; ei < events.length; ei++) {
          var ev = events[ei];
          var evInt = ev.intensity !== undefined ? ev.intensity : 1.0;
          var weights = ev.weights || {};

          for (var eName in weights) {
            var ew = weights[eName];
            if (!ew || !anchors[eName]) continue;
            var anc = anchors[eName];
            var ax = anc.v * HALF, az = anc.a * HALF;
            var ddx = gx - ax, ddz = gz - az;
            var dist = Math.sqrt(ddx * ddx + ddz * ddz);
            var radius = 3 + ew * 9;
            if (dist >= radius * 1.5) continue;
            var sig = radius * 0.4;
            var inf = Math.exp(-(dist * dist) / (2 * sig * sig)) * ew * evInt * comp;

            var aroAmp = 0.5 + Math.abs(anc.a) * 0.8;
            var dh = ev.dominance * 6 * inf * aroAmp;
            dh += ev.deviation * fm(gx * 0.15 + ei * 3 + li, gz * 0.15 + ei * 2, 4) * 2.5 * inf;
            dh += ev.erosion * (hs(gx * 0.3 + ei + li, gz * 0.3) - 0.5) * 1.5 * inf;

            var vrEff = ev.void_rupture + localPoll * 0.15;
            if (vrEff > 0.15) {
              var vn = fm(gx * 0.2 + ei * 5 + li, gz * 0.2, 3);
              if (vn > (1 - vrEff * 0.6)) dh -= 4 * vrEff * inf;
            }
            h += dh;

            cr += (anc.color[0] / 255) * (0.3 + ew * 0.7) * inf;
            cg += (anc.color[1] / 255) * (0.3 + ew * 0.7) * inf;
            cb += (anc.color[2] / 255) * (0.3 + ew * 0.7) * inf;
          }
        }

        h += fm(gx * 0.05 + li * 0.5, gz * 0.05 + li * 0.3, 5) * 2.5 - 1.2;
        h *= comp;
        heights[idx] = h;

        var cn = fm(gx * 0.08 + li, gz * 0.08 + li, 3);
        var hBr = 1 + Math.abs(h) * 0.03;
        var pr = (cr + cn * 0.05) * hBr * opa;
        var pg = (cg + cn * 0.03) * hBr * opa;
        var pb = (cb + cn * 0.06) * hBr * opa;

        if (localPoll > 0.01) {
          var grey = (pr + pg + pb) / 3;
          var boneTint = 0.08;
          var mix = localPoll * 0.6;
          pr = pr * (1 - mix) + (grey * 0.7 + boneTint) * mix;
          pg = pg * (1 - mix) + (grey * 0.6 + boneTint * 0.8) * mix;
          pb = pb * (1 - mix) + (grey * 0.5 + boneTint * 0.6) * mix;
        }

        if (comp < 0.3) {
          var fossil = (0.3 - comp) / 0.3;
          var avg = (pr + pg + pb) / 3;
          pr = pr * (1 - fossil * 0.5) + (avg + 0.04) * fossil * 0.5;
          pg = pg * (1 - fossil * 0.5) + (avg + 0.03) * fossil * 0.5;
          pb = pb * (1 - fossil * 0.5) + (avg + 0.02) * fossil * 0.5;
        }

        colors[idx * 3] = Math.min(1, pr);
        colors[idx * 3 + 1] = Math.min(1, pg);
        colors[idx * 3 + 2] = Math.min(1, pb);
      }
    }

    return { heights: heights, colors: colors, pollutionField: pollField };
  }

  function sampleCachedHeight(li, gx, gz) {
    var cache = _layerCache[li]; if (!cache) return 0;
    var fx = ((gx / SIZE) + 0.5) * (GRID - 1);
    var fz = ((gz / SIZE) + 0.5) * (GRID - 1);
    var ix0 = Math.max(0, Math.min(GRID - 2, Math.floor(fx)));
    var iz0 = Math.max(0, Math.min(GRID - 2, Math.floor(fz)));
    var tx = fx - ix0, tz = fz - iz0;
    var h = cache.heights;
    return h[iz0 * GRID + ix0] * (1 - tx) * (1 - tz) + h[iz0 * GRID + ix0 + 1] * tx * (1 - tz) +
      h[(iz0 + 1) * GRID + ix0] * (1 - tx) * tz + h[(iz0 + 1) * GRID + ix0 + 1] * tx * tz;
  }
  function sampleCachedColor(li, gx, gz) {
    var cache = _layerCache[li]; if (!cache) return { r: 0.06, g: 0.06, b: 0.08 };
    var fx = ((gx / SIZE) + 0.5) * (GRID - 1), fz = ((gz / SIZE) + 0.5) * (GRID - 1);
    var ix = Math.max(0, Math.min(GRID - 1, Math.round(fx)));
    var iz = Math.max(0, Math.min(GRID - 1, Math.round(fz)));
    var ci = (iz * GRID + ix) * 3;
    return { r: cache.colors[ci], g: cache.colors[ci + 1], b: cache.colors[ci + 2] };
  }

  function computeYBase(li) {
    var y = 0;
    for (var i = 0; i < li; i++) y -= _computedLayers[i].thickness;
    return y;
  }

  function buildSlab(li) {
    var layer = _computedLayers[li];
    var cache = _layerCache[li];
    var slabGroup = new THREE.Group();
    var yBase = computeYBase(li);
    var comp = layer.compaction;
    var actualThickness = layer.thickness * (0.4 + comp * 0.6);
    var botY = yBase - actualThickness;
    cache.yBase = yBase; cache.botY = botY;

    var topGeo = new THREE.PlaneGeometry(SIZE, SIZE, GRID - 1, GRID - 1);
    var topPos = topGeo.attributes.position.array;
    var topColors = new Float32Array(topPos.length);
    for (var iz = 0; iz < GRID; iz++) {
      for (var ix = 0; ix < GRID; ix++) {
        var vi = (iz * GRID + ix) * 3, ci = iz * GRID + ix;
        topPos[vi + 2] = cache.heights[ci];
        topColors[vi] = cache.colors[ci * 3];
        topColors[vi + 1] = cache.colors[ci * 3 + 1];
        topColors[vi + 2] = cache.colors[ci * 3 + 2];
      }
    }
    topGeo.setAttribute('color', new THREE.BufferAttribute(topColors, 3));
    topGeo.computeVertexNormals();
    var topMesh = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide
    }));
    topMesh.rotation.x = -Math.PI / 2; topMesh.position.y = yBase;
    slabGroup.add(topMesh);

    var botGeo = new THREE.PlaneGeometry(SIZE, SIZE, GRID - 1, GRID - 1);
    var botPos = botGeo.attributes.position.array;
    var botColors = new Float32Array(botPos.length);
    for (var iz = 0; iz < GRID; iz++) {
      for (var ix = 0; ix < GRID; ix++) {
        var vi = (iz * GRID + ix) * 3;
        var gx = (ix / (GRID - 1) - 0.5) * SIZE;
        var gz = (iz / (GRID - 1) - 0.5) * SIZE;
        
        var nextLi = li + 1;
        var botH;
        if (nextLi < _computedLayers.length && _layerCache[nextLi]) {
          botH = sampleCachedHeight(nextLi, gx, gz) + computeYBase(nextLi) - botY;
        } else {
          var comp = layer.compaction;
          var actualThickness = layer.thickness * (0.4 + comp * 0.6);
          botH = cache.heights[iz * GRID + ix] - actualThickness + fm(gx * 0.1 + li, gz * 0.1, 3) * 0.5;
        }
        botPos[vi + 2] = botH;
        
        var col = sampleCachedColor(li, gx, gz);
        botColors[vi] = col.r * 0.4;
        botColors[vi + 1] = col.g * 0.4;
        botColors[vi + 2] = col.b * 0.4;
      }
    }
    botGeo.setAttribute('color', new THREE.BufferAttribute(botColors, 3));
    botGeo.computeVertexNormals();
    var botMesh = new THREE.Mesh(botGeo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide
    }));
    botMesh.rotation.x = -Math.PI / 2; botMesh.position.y = botY;
    slabGroup.add(botMesh);

    var sides = [
      { axis: 'x', val: -HALF }, { axis: 'x', val: +HALF },
      { axis: 'z', val: -HALF }, { axis: 'z', val: +HALF },
    ];
    sides.forEach(function (side) {
      var segs = GRID - 1, wV = [], wC = [], wI = [];
      for (var s = 0; s <= segs; s++) {
        var t = s / segs, pos1 = (t - 0.5) * SIZE;
        var gx, gz;
        if (side.axis === 'x') { gx = side.val; gz = pos1; } else { gx = pos1; gz = side.val; }
        var topH = sampleCachedHeight(li, gx, gz);
        var col = sampleCachedColor(li, gx, gz);
        if (side.axis === 'x') { wV.push(side.val, yBase + topH, pos1); } else { wV.push(pos1, yBase + topH, side.val); }
        wC.push(col.r, col.g, col.b);
        
        var nextLi = li + 1;
        var botH;
        if (nextLi < _computedLayers.length && _layerCache[nextLi]) {
          botH = sampleCachedHeight(nextLi, gx, gz) + computeYBase(nextLi) - botY;
        } else {
          var botIdx = Math.round((gx / SIZE + 0.5) * (GRID - 1)) + Math.round((gz / SIZE + 0.5) * (GRID - 1)) * GRID;
          var comp = layer.compaction;
          var actualThickness = layer.thickness * (0.4 + comp * 0.6);
          botH = (botIdx >= 0 && botIdx < cache.heights.length) ? (cache.heights[botIdx] - actualThickness + fm(gx * 0.1 + li, gz * 0.1, 3) * 0.5) : 0;
        }
        if (side.axis === 'x') { wV.push(side.val, botY + botH, pos1); } else { wV.push(pos1, botY + botH, side.val); }
        wC.push(col.r * 0.4, col.g * 0.4, col.b * 0.4);
        if (s < segs) { var b = s * 2; wI.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      var wG = new THREE.BufferGeometry();
      wG.setAttribute('position', new THREE.Float32BufferAttribute(wV, 3));
      wG.setAttribute('color', new THREE.Float32BufferAttribute(wC, 3));
      wG.setIndex(wI); wG.computeVertexNormals();
      slabGroup.add(new THREE.Mesh(wG, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.85, metalness: 0.03, side: THREE.DoubleSide
      })));
    });

    var wireGeo = topGeo.clone();
    var wireOpacity = 0.02 + (1 - comp) * 0.06;
    var wireMesh = new THREE.Mesh(wireGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.15 + li * 0.02, 0.12 + li * 0.02, 0.18 + li * 0.02),
      wireframe: true, transparent: true, opacity: wireOpacity
    }));
    wireMesh.rotation.x = -Math.PI / 2; wireMesh.position.y = yBase + 0.05;
    slabGroup.add(wireMesh);

    var pCount = Math.floor(30 * layer.compaction);
    if (pCount > 5) {
      var prng = rngFrom(layer.seed || layer.id, 'particles');
      var pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(pCount * 3);
      for (var p = 0; p < pCount; p++) {
        var px = (prng() - 0.5) * SIZE * 0.9, pz = (prng() - 0.5) * SIZE * 0.9;
        pPos[p * 3] = px; pPos[p * 3 + 1] = yBase + sampleCachedHeight(li, px, pz) + (prng() - 0.5); pPos[p * 3 + 2] = pz;
      }
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      slabGroup.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
        color: 0xc4a882, size: 0.15, transparent: true, opacity: 0.15 * layer.opacity, sizeAttenuation: true
      })));
    }

    return slabGroup;
  }

  function clearLabels() {
    _anchorLabels.forEach(function (l) { if (l.el.parentNode) l.el.parentNode.removeChild(l.el); });
    _layerLabels.forEach(function (l) { if (l.el.parentNode) l.el.parentNode.removeChild(l.el); });
    _anchorLabels = []; _layerLabels = [];
  }
  function buildLabels() {
    clearLabels(); if (!lc) return;
    var anchors = _config.anchors;
    ['anger', 'fear', 'sadness', 'numbness', 'longing', 'peace', 'joy', 'shame'].forEach(function (name) {
      if (!anchors[name]) return;
      var anc = anchors[name], el = document.createElement('div'); el.className = 'strata-fl';
      el.innerHTML = '<div class="strata-fl-n">' + name + '</div>';
      lc.appendChild(el);
      var wx = anc.v * HALF, wz = anc.a * HALF;
      _anchorLabels.push({ el: el, pos: new THREE.Vector3(wx, (_layerCache[0] ? sampleCachedHeight(0, wx, wz) : 0) + 2, wz) });
    });
    _computedLayers.forEach(function (layer, i) {
      var el = document.createElement('div'); el.className = 'strata-fl';
      var pollStr = layer.pollution > 0.01 ? ' · 오염 ' + (layer.pollution * 100).toFixed(0) + '%' : '';
      var evCount = layer.events.length;
      el.innerHTML = '<div class="strata-fl-n" style="letter-spacing:1px">' + layer.label + '</div>' +
        '<div class="strata-fl-e" style="font-size:9px;color:var(--ghost)">' + (layer.sub || '') + ' (' + evCount + '건' + pollStr + ')</div>';
      lc.appendChild(el);
      _layerLabels.push({ el: el, pos: new THREE.Vector3(-HALF - 3, computeYBase(i) - layer.thickness / 2, 0) });
    });
  }
  function updLabels() {
    _anchorLabels.forEach(function (l) {
      var sp = l.pos.clone().project(camera);
      l.el.style.left = (sp.x * 0.5 + 0.5) * innerWidth + 'px';
      l.el.style.top = (-sp.y * 0.5 + 0.5) * innerHeight + 'px';
      l.el.style.transform = 'translate(-50%,-50%)';
      l.el.classList.toggle('strata-vis', camera.position.distanceTo(l.pos) < 70 && sp.z < 1 && sp.z > 0);
    });
    _layerLabels.forEach(function (l) {
      var sp = l.pos.clone().project(camera);
      l.el.style.left = (sp.x * 0.5 + 0.5) * innerWidth + 'px';
      l.el.style.top = (-sp.y * 0.5 + 0.5) * innerHeight + 'px';
      l.el.style.transform = 'translate(-50%,-50%)';
      var d = camera.position.distanceTo(l.pos);
      var camDir = camera.position.clone().normalize();
      l.el.classList.toggle('strata-vis', d < 80 && sp.z < 1 && sp.z > 0 && (Math.abs(camDir.x) + Math.abs(camDir.z)) > 0.5);
    });
  }

  function updateHUD() {
    var totalEvents = _globalEvents.length + _config.bedrockEvents.length;
    var trEl = document.getElementById('strataHudTR');
    if (trEl) {
      trEl.innerHTML = (_config.title || '기억: —') + '<br>' +
        totalEvents + '개의 해석 · ' + _computedLayers.length + '개 지층<br>' +
        (_config.sealed || '—');
    }
    var totalPoll = 0, totalW = 0;
    _computedLayers.forEach(function (l) {
      var w = l.events.length || 1;
      totalPoll += l.pollution * w; totalW += w;
    });
    var globalContam = totalW > 0 ? totalPoll / totalW : 0;
    var ctFl = document.getElementById('strataCtFl');
    var ctVal = document.getElementById('strataCtVal');
    if (ctFl) ctFl.style.width = (globalContam * 100) + '%';
    if (ctVal) ctVal.textContent = globalContam.toFixed(2);
  }

  function initThree() {
    console.log('[Strata] initThree() 시작');
    canvas = document.getElementById('strataCanvas');
    if (!canvas) { 
      console.error('[Strata] Canvas not found (id: strataCanvas)');
      return; 
    }
    console.log('[Strata] Canvas 찾음, renderer 생성');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x12121a, 1);
    threeScene = new THREE.Scene();
    threeScene.fog = new THREE.FogExp2(0x12121a, 0.004);
    camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
    threeScene.add(new THREE.AmbientLight(0x2a2535, 1.2));
    var dl = new THREE.DirectionalLight(0xc4a882, 0.8); dl.position.set(30, 50, 20); threeScene.add(dl);
    var dl2 = new THREE.DirectionalLight(0x6080a0, 0.35); dl2.position.set(-20, 30, -15); threeScene.add(dl2);
    pointLight = new THREE.PointLight(0x8c3c28, 0.7, 100); pointLight.position.set(-15, 20, -10); threeScene.add(pointLight);
    group = new THREE.Group(); 
    threeScene.add(group);
    console.log('[Strata] group 생성 완료:', group);
    var alm = new THREE.LineBasicMaterial({ color: 0xc4a882, transparent: true, opacity: 0.05 });
    threeScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-HALF, 0.2, 0), new THREE.Vector3(HALF, 0.2, 0)]), alm));
    threeScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.2, -HALF), new THREE.Vector3(0, 0.2, HALF)]), alm));
    lc = document.getElementById('strataLc');
    console.log('[Strata] initThree() 완료');
  }
  function initControls() {
    if (!canvas) return;
    canvas.addEventListener('mousedown', function (e) { drag = true; pm = { x: e.clientX, y: e.clientY }; });
    addEventListener('mouseup', function () { drag = false; });
    addEventListener('mousemove', function (e) {
      if (!drag) return;
      oa.t += (e.clientX - pm.x) * 0.005;
      oa.p = Math.max(0.15, Math.min(Math.PI * 0.48, oa.p - (e.clientY - pm.y) * 0.005));
      pm = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', function (e) { oR = Math.max(20, Math.min(120, oR + e.deltaY * 0.06)); }, { passive: true });
    var td = 0;
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) { drag = true; pm = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
      else if (e.touches.length === 2) td = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    });
    canvas.addEventListener('touchmove', function (e) {
      if (e.touches.length === 1 && drag) {
        oa.t += (e.touches[0].clientX - pm.x) * 0.005;
        oa.p = Math.max(0.15, Math.min(Math.PI * 0.48, oa.p - (e.touches[0].clientY - pm.y) * 0.005));
        pm = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        oR = Math.max(20, Math.min(120, oR - (d - td) * 0.12)); td = d;
      }
    }, { passive: true });
    canvas.addEventListener('touchend', function () { drag = false; });
  }
  function updCam() {
    var x = oR * Math.sin(oa.p) * Math.sin(oa.t), y = oR * Math.cos(oa.p), z = oR * Math.sin(oa.p) * Math.cos(oa.t);
    camera.position.set(x + lookAt.x, y + lookAt.y, z + lookAt.z);
    camera.lookAt(lookAt);
    var topness = Math.cos(oa.p), dvEl = document.getElementById('strataDv');
    if (dvEl) {
      if (topness > 0.7) dvEl.innerHTML = '위에서: 감정 지형<br><span style="color:var(--ghost);font-size:11px">옆으로 돌려서 단층을 보세요</span>';
      else if (topness < 0.3) dvEl.innerHTML = '측면: 시간 단층<br><span style="color:var(--ghost);font-size:11px">원본이 아래에 묻혀 있습니다</span>';
      else dvEl.innerHTML = '사이: 지형 + 단층';
    }
  }
  function animate() {
    at += 0.002;
    if (!drag) oa.t += 0.0004;
    if (pointLight) { pointLight.position.x = Math.sin(at * 2) * 20; pointLight.position.z = Math.cos(at * 1.5) * 15; }
    updCam(); updLabels();
    renderer.render(threeScene, camera);
    animId = requestAnimationFrame(animate);
  }
  function disposeGroup(g) {
    g.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) { if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); }); else obj.material.dispose(); }
    });
  }

  function rebuildLayers(indices) {
    indices.forEach(function (li) {
      _layerCache[li] = bakeLayer(li);
      if (_layerGroups[li]) { group.remove(_layerGroups[li]); disposeGroup(_layerGroups[li]); }
      var slab = buildSlab(li); group.add(slab); _layerGroups[li] = slab;
    });
    var totalH = 0;
    _computedLayers.forEach(function (l) { totalH += l.thickness; });
    lookAt.set(0, -totalH / 2, 0);
    buildLabels();
    updateHUD();
  }

  function fullBuild() {
    if (!group) {
      console.error('[Strata] group이 초기화되지 않았습니다. Strata.start()를 먼저 호출하세요.');
      return;
    }
    _layerGroups.forEach(function (g) { if (g) { group.remove(g); disposeGroup(g); } });
    _layerGroups = []; _layerCache = [];
    for (var i = _computedLayers.length - 1; i >= 0; i--) {
      _layerCache[i] = bakeLayer(i);
      var slab = buildSlab(i); group.add(slab); _layerGroups[i] = slab;
    }
    var totalH = 0;
    _computedLayers.forEach(function (l) { totalH += l.thickness; });
    lookAt.set(0, -totalH / 2, 0);
    buildLabels();
    updateHUD();
  }

  // ================================================================
  //  PROJECT INTEGRATION API
  // ================================================================

  var _onCloseCallback = null;

  function projectEmotionToVADLocal(emotionVec) {
    if (!emotionVec) return { v: 0, a: 0, d: 0 };
    var VAD_FULL = {
      fear:{v:-0.9,a:0.9,d:-0.8}, sadness:{v:-0.8,a:-0.4,d:-0.7},
      anger:{v:-0.7,a:0.8,d:0.3}, guilt:{v:-0.8,a:0.2,d:-0.6},
      shame:{v:-0.9,a:-0.2,d:-0.9}, isolation:{v:-0.7,a:-0.5,d:-0.6},
      numbness:{v:-0.6,a:-0.8,d:-0.4}, moral_pain:{v:-0.8,a:0.3,d:-0.7},
      helplessness:{v:-0.9,a:-0.4,d:-1.0}, despair:{v:-1.0,a:-0.6,d:-0.9},
      joy:{v:0.9,a:0.6,d:0.5}, hope:{v:0.7,a:0.4,d:0.6},
      relief:{v:0.6,a:-0.3,d:0.4}, gratitude:{v:0.8,a:-0.2,d:0.7},
      love:{v:1.0,a:0.5,d:0.6}, peace:{v:0.8,a:-0.6,d:0.7},
      comfort:{v:0.7,a:-0.4,d:0.6},
      longing:{v:-0.3,a:0.2,d:-0.2}, nostalgia:{v:0.1,a:-0.3,d:-0.1},
      acceptance:{v:0.4,a:-0.4,d:0.5}, confusion:{v:-0.4,a:0.3,d:-0.5},
    };
    var V=0, A=0, D=0, wSum=0;
    for (var k in emotionVec) {
      var w = emotionVec[k];
      if (!w || !VAD_FULL[k]) continue;
      V += w * VAD_FULL[k].v;
      A += w * VAD_FULL[k].a;
      D += w * VAD_FULL[k].d;
      wSum += w;
    }
    if (wSum <= 0) return { v: 0, a: 0, d: 0 };
    return {
      v: Math.max(-1, Math.min(1, V / wSum)),
      a: Math.max(-1, Math.min(1, A / wSum)),
      d: Math.max(-1, Math.min(1, D / wSum)),
    };
  }

  function buildAnchors() {
    return {
      anger:        { v: -0.70, a: +0.80, color: [140, 20, 20] },
      fear:         { v: -0.90, a: +0.90, color: [60, 20, 80] },
      shame:        { v: -0.90, a: -0.20, color: [100, 30, 60] },
      moral_pain:   { v: -0.80, a: +0.30, color: [70, 30, 50] },
      confusion:    { v: -0.40, a: +0.30, color: [80, 70, 90] },
      sadness:      { v: -0.80, a: -0.40, color: [30, 50, 100] },
      guilt:        { v: -0.80, a: +0.20, color: [80, 50, 30] },
      isolation:    { v: -0.70, a: -0.50, color: [20, 20, 40] },
      numbness:     { v: -0.60, a: -0.80, color: [60, 60, 65] },
      despair:      { v: -1.00, a: -0.60, color: [20, 15, 30] },
      helplessness: { v: -0.90, a: -0.40, color: [40, 25, 50] },
      longing:      { v: -0.30, a: +0.20, color: [80, 60, 100] },
      joy:          { v: +0.90, a: +0.60, color: [180, 140, 60] },
      hope:         { v: +0.70, a: +0.40, color: [140, 160, 80] },
      love:         { v: +1.00, a: +0.50, color: [140, 60, 80] },
      relief:       { v: +0.60, a: -0.30, color: [100, 140, 120] },
      peace:        { v: +0.80, a: -0.60, color: [60, 90, 100] },
      acceptance:   { v: +0.40, a: -0.40, color: [90, 80, 70] },
      gratitude:    { v: +0.80, a: -0.20, color: [120, 110, 60] },
      comfort:      { v: +0.70, a: -0.40, color: [100, 100, 80] },
      nostalgia:    { v: +0.10, a: -0.30, color: [70, 60, 80] },
    };
  }

  async function fetchStrataInput(memoryId) {
    console.log('[Strata] fetchStrataInput 시작:', memoryId);
    try {
      var client = null;
      if (window.getSupabaseClient) {
        client = window.getSupabaseClient();
        console.log('[Strata] getSupabaseClient 사용');
      } else if (window.networkService && window.networkService.getClient) {
        client = window.networkService.getClient();
        console.log('[Strata] networkService.getClient 사용');
      }
      if (!client) {
        console.error('[Strata] Supabase client not available');
        return null;
      }

      console.log('[Strata] scenes 조회 중...');
      var scenesRes = await client
        .from('scenes')
        .select('id, scene_order, text, scene_type, original_emotion, void_info, anchor_emotions')
        .eq('memory_id', memoryId)
        .order('scene_order', { ascending: true });
      
      if (scenesRes.error) {
        console.error('[Strata] scenes 조회 오류:', scenesRes.error);
        return null;
      }
      var scenes = scenesRes.data || [];
      console.log('[Strata] scenes 조회 완료:', scenes.length, '개');

      console.log('[Strata] plays 조회 중...');
      var playsRes = await client
        .from('plays')
        .select('scene_id, user_emotion, alignment, mismatch_type, created_at')
        .eq('memory_id', memoryId)
        .order('created_at', { ascending: false });
      
      if (playsRes.error) {
        console.error('[Strata] plays 조회 오류:', playsRes.error);
        return null;
      }
      var plays = playsRes.data || [];
      console.log('[Strata] plays 조회 완료:', plays.length, '개');

    var anchors = buildAnchors();

    var bedrockEvents = scenes.map(function(scene) {
      var origEm = scene.original_emotion;
      if (!origEm || typeof origEm === 'string') {
        try { origEm = JSON.parse(origEm); } catch(e) { origEm = {}; }
      }
      var vad = projectEmotionToVADLocal(origEm);
      return {
        scene_id: scene.id,
        timestamp: 0,
        vad: vad,
        alignment_score: 1.0,
        void_mismatch: !!(scene.void_info && scene.void_info.sceneVoid),
      };
    });

    var globalEvents = plays.map(function(play) {
      var userEm = play.user_emotion;
      if (typeof userEm === 'string') {
        try { userEm = JSON.parse(userEm); } catch(e) { userEm = {}; }
      }
      var vad = projectEmotionToVADLocal(userEm);
      return {
        scene_id: play.scene_id,
        timestamp: new Date(play.created_at).getTime(),
        vad: vad,
        alignment_score: play.alignment || 0.5,
        void_mismatch: play.mismatch_type === 'void_mismatch',
      };
    });

    var title = '기억: ' + memoryId.toString().slice(0, 8);

    var result = {
      anchors: anchors,
      title: title,
      sealed: plays.length + '개의 해석',
      bedrockEvents: bedrockEvents,
      globalEvents: globalEvents,
    };
    
    console.log('[Strata] fetchStrataInput 완료:', {
      anchorsCount: Object.keys(anchors).length,
      bedrockEventsCount: bedrockEvents.length,
      globalEventsCount: globalEvents.length
    });
    
    return result;
    } catch (error) {
      console.error('[Strata] fetchStrataInput 오류:', error);
      return null;
    }
  }

  function closeStrataView() {
    Strata.stop();
    var viewEl = document.getElementById('strataView');
    if (viewEl) viewEl.style.display = 'none';
    if (_onCloseCallback) _onCloseCallback();
  }

  window.showStrataView = async function(memoryId, alignmentResult, onClose) {
    console.log('[Strata] showStrataView 호출됨:', { memoryId, alignmentResult });
    _onCloseCallback = onClose;

    try {
      var strataInput = await fetchStrataInput(memoryId);
      if (!strataInput) {
        console.error('[Strata] Failed to fetch data');
        if (onClose) onClose();
        return;
      }

      console.log('[Strata] 데이터 로드 완료:', {
        anchorsCount: Object.keys(strataInput.anchors || {}).length,
        bedrockEventsCount: strataInput.bedrockEvents.length,
        globalEventsCount: strataInput.globalEvents.length
      });

      // Three.js 초기화를 먼저 수행
      if (!group || !canvas) {
        console.log('[Strata] Three.js 초기화 시작');
        Strata.start();
        // group이 생성되었는지 확인
        if (!group) {
          console.error('[Strata] group 초기화 실패, Strata.init() 건너뜀');
          if (onClose) onClose();
          return;
        }
        console.log('[Strata] group 초기화 완료');
      }
      
      // 데이터 초기화 및 렌더링
      console.log('[Strata] Strata.init() 호출');
      Strata.init(strataInput);

      var viewEl = document.getElementById('strataView');
      if (viewEl) {
        viewEl.style.display = 'block';
        console.log('[Strata] 뷰 표시됨');
      } else {
        console.error('[Strata] strataView 요소를 찾을 수 없습니다');
      }
      var closeBtn = document.getElementById('strataCloseBtn');
      if (closeBtn) {
        closeBtn.onclick = closeStrataView;
      } else {
        console.warn('[Strata] strataCloseBtn 요소를 찾을 수 없습니다');
      }
    } catch (error) {
      console.error('[Strata] showStrataView 오류:', error);
      if (onClose) onClose();
    }
  };

  window.Strata = {
    init: function(config) {
      _config.anchors = config.anchors || {};
      _config.title = config.title || '';
      _config.sealed = config.sealed || '';
      _config.sealedAt = config.sealedAt || null;
      if (config.layerDefs) _config.layerDefs = config.layerDefs;

      _config.bedrockEvents = (config.bedrockEvents || []).map(function (ev) {
        return ev.weights ? ev : mapEventToRender(ev, _config.anchors);
      });

      _globalEvents = (config.globalEvents || []).map(function (ev) {
        return ev.weights ? ev : mapEventToRender(ev, _config.anchors);
      });

      _globalEvents.sort(function (a, b) { return b.timestamp - a.timestamp; });

      var changed = recomputeLayers();
      fullBuild();
    },
    appendEvent: function(rawEvent) {
      var mapped = rawEvent.weights ? rawEvent : mapEventToRender(rawEvent, _config.anchors);
      _globalEvents.unshift(mapped);
      var changed = recomputeLayers();
      if (changed.length > 0) rebuildLayers(changed);
    },
    appendEvents: function(rawEvents) {
      rawEvents.forEach(function (ev) {
        var mapped = ev.weights ? ev : mapEventToRender(ev, _config.anchors);
        _globalEvents.unshift(mapped);
      });
      _globalEvents.sort(function (a, b) { return b.timestamp - a.timestamp; });
      var changed = recomputeLayers();
      if (changed.length > 0) rebuildLayers(changed);
    },
    recompute: function(now) {
      var changed = recomputeLayers(now);
      if (changed.length > 0) rebuildLayers(changed);
    },
    mapEventToRender: mapEventToRender,
    start: function () {
      console.log('[Strata] start() 호출됨');
      if (!canvas || !group) {
        console.log('[Strata] Three.js 초기화 필요, initThree() 호출');
        initThree();
      }
      if (!canvas) {
        console.error('[Strata] canvas 초기화 실패');
        return;
      }
      if (!group) {
        console.error('[Strata] group 초기화 실패');
        return;
      }
      console.log('[Strata] initControls() 호출');
      initControls();
      if (!animId) {
        console.log('[Strata] animate() 시작');
        animate();
      } else {
        console.log('[Strata] animate() 이미 실행 중');
      }
    },
    stop: function () {
      if (animId) { cancelAnimationFrame(animId); animId = null; }
    },
    getData: function () {
      return { config: _config, globalEvents: _globalEvents, computedLayers: _computedLayers };
    },
  };

  addEventListener('resize', function () {
    if (!camera || !renderer) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

})();


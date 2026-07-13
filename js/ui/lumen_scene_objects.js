/**
 * Lumen Scene Objects — 사물 모티프 지형 조형 (1단계 슬라이스)
 *
 * docs/사물모티프_지형조형_설계-260712.md v1.1
 * "시계는 처음부터 거기 있었지만, 그대로 있는 건 아니다."
 * 유령(사람의 잔상)만 서 있던 지형에 장소의 잔상 — 그 장면의 사물 — 을 세운다.
 *
 * 1단계 범위 (이 파일):
 *   - 절차적 블록 클러스터: 단어 해시 → 항상 같은 형체 (§2.1)
 *   - 처음부터 무대에 있음 + 거리 안개만, 오염/접근성 게이팅 없음 (§2.2)
 *   - 배치 = scene_order 사슬 길목, 접근성과 무관한 고정 좌표 (§2.5 — 순간이동 함정 회피)
 *   - 근접 시 단어 + 원문 문장 배어남 (§2.4 문장 운반자 — 저작 비용 0 자동 추출)
 * 2단계(되새김 stage 동기·붕괴)는 룩 승인 후 별도 슬라이스.
 *
 * 원칙: tem_af_strata_terrain.js 한 글자도 안 건드림 (마네킹 모듈과 동일).
 * render wrap 은 조형 페이드/라벨만 — 카메라 안 건드림.
 *
 * 사용 (play-test.html):
 *   LumenSceneObjects.attach(rt, { getScenePins: function () { return _fpScenePins; } });
 *   rt.__lumenSceneObjects.rebuild();   // 핀 빌드 직후 (마네킹 rebuild 옆)
 *   rt.__lumenSceneObjects.clear();     // 회차 종료 (되새김 clear 옆)
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    getScenePins: null,          // () => Array<_fpScenePins 원소> (전 장면 — accessible 무관)
    maxPerScene: 2,              // 씬당 사물 상한 (설계 §3.1)
    // 거리 안개 — 유령 검증값 차용 (설계 §2.2)
    fadeNear: 6,
    fadeFar: 26,
    baseOpacity: 0.14,
    nearOpacity: 0.72,
    // 근접 라벨 (단어 + 원문 문장)
    labelNear: 4.5,              // 이 안쪽에서 라벨 페이드인
    labelOpacity: 0.92,
    // 길목 배치 (설계 §2.5)
    segT: [0.35, 0.65],          // 사슬 선분 위 위치 범위
    perpMin: 1.0, perpMax: 3.0,  // 선분에서 수직 이탈 (마네킹·동선과 겹침 방지)
    // 2단계 — 되새김 동기 (설계 §3.2): 입에 담을수록 또렷, 3회+ 붕괴
    recallSync: true,
    recallPollMs: 1000,          // 되새김 내부 dimTimer 와 같은 저비용 폴링
    stageFloor: [0, 0.30, 0.48], // stage 1·2 의 최소 밝기 (멀리서도 "밝아진" 게 보이게)
    stageGlow: [0, 0.35, 0.75],  // stage 1·2 의 발광(emissive) 강도
    collapseKeepRatio: 0.55,     // 붕괴 시 잔해로 남는 블록 비율 ("무너진 기억"도 기억)
    collapseMs: 1400,
    collapsedDim: 0.55,          // 잔해 밝기 배율
  };

  // ─── 결정적 PRNG (lumen_recalled_anchors / mannequins 와 동일 문법) ───
  function _hash(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function _rng(seed) {
    var a = _hash(seed);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 씬 본문에서 그 단어가 든 문장 자동 추출 (§2.4). 여러 개면 해시 픽, 없으면 null.
  // 작가 오버라이드: scene.meta.object_lines[word]
  function _pickSentence(word, scene) {
    var meta = (scene && scene.meta) || {};
    if (meta.object_lines && typeof meta.object_lines[word] === 'string') {
      return meta.object_lines[word];
    }
    var text = (scene && scene.text) || '';
    if (!text) return null;
    var parts = text.split(/(?<=[.!?。])\s+/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 4 && s.indexOf(word) !== -1; });
    if (!parts.length) return null;
    var r = _rng('line|' + word);
    return parts[Math.floor(r() * parts.length)];
  }

  function attach(runtime, opts) {
    if (!runtime) { console.error('[lumen-scene-objects] runtime required'); return null; }
    if (runtime.__lumenSceneObjects) return runtime.__lumenSceneObjects;
    opts = Object.assign({}, DEFAULTS, opts || {});

    var THREE = global.THREE;
    var scene3 = runtime.getScene && runtime.getScene();
    var renderer = runtime.getRenderer && runtime.getRenderer();
    if (!THREE || !scene3 || !renderer || typeof renderer.render !== 'function') {
      console.warn('[lumen-scene-objects] THREE/scene/renderer 없음 — 비활성');
      return null;
    }

    var _objects = [];  // [{ group, mats:[], label, labelMat, cx, cz, word }]

    // ─── 조형: 단어 해시 → 블록 클러스터 (같은 단어 = 항상 같은 형체) ───
    function _buildCluster(word) {
      var r = _rng('obj|' + word);
      var group = new THREE.Group();
      var mats = [];
      var n = 6 + Math.floor(r() * 9);              // 블록 6~14개
      // 색: 유령 보라와 구분되는 마른 흙·돌 톤. 단어마다 미세 변주.
      var hue = 0.07 + r() * 0.06;                  // 25°~47° (황토)
      var sat = 0.10 + r() * 0.14;
      var lig = 0.52 + r() * 0.16;
      var col = new THREE.Color().setHSL(hue, sat, lig);
      var accum = 0;                                 // 세로 응집형 스택
      var blocks = [];
      for (var i = 0; i < n; i++) {
        var w = 0.07 + r() * 0.26;
        var h = 0.05 + r() * 0.22;
        var d = 0.07 + r() * 0.26;
        var geo = new THREE.BoxGeometry(w, h, d);
        var mat = new THREE.MeshLambertMaterial({
          color: col,
          transparent: true,
          opacity: opts.baseOpacity,
          fog: true,
          depthWrite: false,
        });
        var m = new THREE.Mesh(geo, mat);
        // 수직 스택 + 수평 산포(위로 갈수록 좁게) — "쌓인 것"의 실루엣
        var spread = 0.30 * (1 - accum / 1.4);
        m.position.set((r() * 2 - 1) * spread, accum + h / 2, (r() * 2 - 1) * spread);
        m.rotation.y = (r() * 2 - 1) * 0.5;
        accum += h * (0.55 + r() * 0.4);              // 살짝 겹치며 쌓임
        group.add(m);
        mats.push(mat);
        blocks.push({ mesh: m, mat: mat, h: h });
        if (accum > 1.25) break;
      }
      return { group: group, mats: mats, blocks: blocks };
    }

    // ─── 라벨: 단어(크게) + 원문 문장(작게, 줄바꿈) 캔버스 스프라이트 ───
    function _wrap(ctx, text, maxW) {
      var lines = [];
      var cur = '';
      for (var i = 0; i < text.length; i++) {
        var next = cur + text[i];
        if (ctx.measureText(next).width > maxW && cur.length) {
          lines.push(cur); cur = text[i];
        } else cur = next;
        if (lines.length >= 3) break;                 // 문장 최대 3줄
      }
      if (cur.length && lines.length < 4) lines.push(cur);
      return lines;
    }
    function _buildLabel(word, sentence) {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var wordFont = '30px "Gowun Batang", "Noto Serif KR", serif';
      var lineFont = '19px "Gowun Batang", "Noto Serif KR", serif';
      canvas.width = 512;
      ctx.font = lineFont;
      var lines = sentence ? _wrap(ctx, sentence, 460) : [];
      canvas.height = 56 + lines.length * 27 + 14;
      var cx = canvas.width / 2;
      // 단어 — 마른 금빛 (유령 보라와 구분)
      ctx.font = wordFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(214,188,150,0.5)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(224,206,170,0.96)';
      ctx.fillText(word, cx, 30);
      // 문장 — 옅게, 증거물의 목소리
      ctx.shadowBlur = 6;
      ctx.font = lineFont;
      ctx.fillStyle = 'rgba(216,204,186,0.88)';
      for (var i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], cx, 64 + i * 27);
      }
      var tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      var mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, fog: false,
        depthWrite: false, depthTest: false,
      });
      var sp = new THREE.Sprite(mat);
      sp.renderOrder = 998;
      sp.scale.set(canvas.width / 320, canvas.height / 320, 1);  // ~1.6m 폭, 근접 열람용
      return { sprite: sp, mat: mat };
    }

    function _clear() {
      _objects.forEach(function (o) {
        if (o.group && o.group.parent) o.group.parent.remove(o.group);
        o.group.traverse(function (m) {
          if (m.isMesh) { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }
        });
        if (o.label) {
          if (o.label.parent) o.label.parent.remove(o.label);
          if (o.labelMat) { if (o.labelMat.map) o.labelMat.map.dispose(); o.labelMat.dispose(); }
        }
      });
      _objects.length = 0;
    }

    // ─── 배치: scene_order 사슬 길목 (§2.5) — 접근성 무관, 결정적 고정 좌표 ───
    function _rebuild() {
      _clear();
      if (typeof opts.getScenePins !== 'function') return;
      var pins = (opts.getScenePins() || []).filter(function (p) {
        return p && typeof p.wx === 'number' && typeof p.wz === 'number' && p.scene;
      });
      if (pins.length < 1) return;
      pins.sort(function (a, b) {
        var ao = (a.scene.scene_order != null) ? a.scene.scene_order : ((a.pin && a.pin.sceneOrder) || 0);
        var bo = (b.scene.scene_order != null) ? b.scene.scene_order : ((b.pin && b.pin.sceneOrder) || 0);
        return ao - bo;
      });

      var placed = 0;
      for (var k = 0; k < pins.length; k++) {
        var p = pins[k];
        var sMeta = (p.scene && p.scene.meta) || {};
        // 사물 단어: 작가 선별(object_tags) 우선, 없으면 motif_tags 폴백 (Record 기억 대비)
        var words = Array.isArray(sMeta.object_tags) && sMeta.object_tags.length
          ? sMeta.object_tags : (Array.isArray(sMeta.motif_tags) ? sMeta.motif_tags : []);
        words = words.slice(0, opts.maxPerScene);
        if (!words.length) continue;

        // 이 씬의 길목 선분: 내 핀 → 다음 핀 (마지막 씬은 이전 핀 방향)
        var q = pins[k + 1] || pins[k - 1] || p;
        var dx = q.wx - p.wx, dz = q.wz - p.wz;
        var len = Math.sqrt(dx * dx + dz * dz) || 1;
        var ux = dx / len, uz = dz / len;             // 선분 방향
        var px = -uz, pz = ux;                        // 수직 방향

        for (var w = 0; w < words.length; w++) {
          var word = String(words[w] || '').trim();
          if (!word) continue;
          var r = _rng('place|' + word + '|' + k);
          var t = opts.segT[0] + r() * (opts.segT[1] - opts.segT[0]);
          var side = (r() < 0.5 ? -1 : 1);
          var perp = opts.perpMin + r() * (opts.perpMax - opts.perpMin);
          var cx = p.wx + dx * t + px * perp * side;
          var cz = p.wz + dz * t + pz * perp * side;
          var gy = (typeof runtime.gH === 'function') ? runtime.gH(cx, cz) : 0;
          if (gy < -10) gy = -10;

          var cluster = _buildCluster(word);
          cluster.group.position.set(cx, gy, cz);
          cluster.group.rotation.y = r() * Math.PI * 2;
          scene3.add(cluster.group);

          var sentence = _pickSentence(word, p.scene);
          var label = _buildLabel(word, sentence);
          label.sprite.position.set(cx, gy + 1.55, cz);
          scene3.add(label.sprite);

          _objects.push({
            group: cluster.group, mats: cluster.mats, blocks: cluster.blocks,
            label: label.sprite, labelMat: label.mat,
            cx: cx, cz: cz, word: word,
            stage: 0, glowBoost: 1, everSynced: false,
            collapsing: null, collapsed: false,
          });
          placed++;
        }
      }
      console.log('[lumen-scene-objects] placed:', placed, '/ scenes:', pins.length);
    }

    // ─── 2단계: 되새김 stage → 발광/붕괴 (설계 §3.2, 곡선은 260709 확정본) ───
    function _applyStageGlow(o) {
      var g = Math.min(2, Math.max(0, o.stage));
      var k = opts.stageGlow[g] || 0;
      for (var m = 0; m < o.blocks.length; m++) {
        var mat = o.blocks[m].mat;
        if (mat.emissive) mat.emissive.copy(mat.color).multiplyScalar(k * 0.45);
      }
      o.glowBoost = 1 + k * 0.6;
    }

    // 붕괴: 블록 일부 소멸 + 나머지 흩어져 잔해로. instant=true 면 애니 없이 완성형
    // (턴 전환 rebuild 직후 이미 stage 3 인 사물 — "무너진 채 발견").
    function _startCollapse(o, instant) {
      var r = _rng('collapse|' + o.word);
      var parts = [];
      for (var i = 0; i < o.blocks.length; i++) {
        var b = o.blocks[i];
        var keep = r() < opts.collapseKeepRatio;
        var ang = r() * Math.PI * 2;
        var d = 0.35 + r() * 0.95;
        parts.push({
          b: b, keep: keep,
          from: b.mesh.position.clone(),
          to: new THREE.Vector3(Math.cos(ang) * d, b.h / 2, Math.sin(ang) * d),
          rotFrom: b.mesh.rotation.y,
          rotTo: b.mesh.rotation.y + (r() * 2 - 1) * 1.8,
        });
        if (!keep) b.mat._dying = true;
      }
      if (instant) {
        for (var j = 0; j < parts.length; j++) {
          var p = parts[j];
          if (p.keep) {
            p.b.mesh.position.copy(p.to);
            p.b.mesh.rotation.y = p.rotTo;
          } else {
            p.b.mesh.visible = false;
          }
        }
        o.collapsed = true;
        o.glowBoost = 1;
        _applyStageGlow(o);
        return;
      }
      o.collapsing = { t0: performance.now(), parts: parts };
    }

    function _advanceCollapse(o) {
      var col = o.collapsing;
      var k = Math.min(1, (performance.now() - col.t0) / opts.collapseMs);
      var e = 1 - Math.pow(1 - k, 3);  // easeOutCubic — 무너져 내림
      for (var i = 0; i < col.parts.length; i++) {
        var p = col.parts[i];
        p.b.mesh.position.lerpVectors(p.from, p.to, e);
        p.b.mesh.rotation.y = p.rotFrom + (p.rotTo - p.rotFrom) * e;
      }
      if (k >= 1) {
        for (var j = 0; j < col.parts.length; j++) {
          if (!col.parts[j].keep) col.parts[j].b.mesh.visible = false;
        }
        o.collapsing = null;
        o.collapsed = true;
        o.glowBoost = 1;
        _applyStageGlow(o);
      }
    }

    function _pollRecall() {
      if (!opts.recallSync || !_objects.length) return;
      var RA = global.LumenRecalledAnchors;
      if (!RA || typeof RA.getState !== 'function') return;
      var st;
      try { st = RA.getState(); } catch (_) { return; }
      var words = (st && st.words) || {};
      for (var i = 0; i < _objects.length; i++) {
        var o = _objects[i];
        var s = words[o.word] | 0;
        if (s === o.stage) { o.everSynced = true; continue; }
        var fresh = !o.everSynced;   // rebuild 직후 첫 동기 — 애니 없이 상태만
        o.stage = s;
        o.everSynced = true;
        if (s >= 3 && !o.collapsed && !o.collapsing) {
          _startCollapse(o, fresh);
        } else if (s < 3) {
          _applyStageGlow(o);        // 붕괴는 안 되돌림 (잔해는 잔해로)
        }
      }
    }
    setInterval(_pollRecall, opts.recallPollMs);

    // ─── render wrap: 거리 페이드 + 근접 라벨 + 붕괴 진행 (카메라 안 건드림) ───
    var _origRender = renderer.render.bind(renderer);
    var fadeRange = Math.max(0.01, opts.fadeFar - opts.fadeNear);
    renderer.render = function (s, c) {
      if (_objects.length && c && c.position) {
        for (var i = 0; i < _objects.length; i++) {
          var o = _objects[i];
          if (o.collapsing) _advanceCollapse(o);
          var ddx = o.cx - c.position.x, ddz = o.cz - c.position.z;
          var dist = Math.sqrt(ddx * ddx + ddz * ddz);
          var tt = 1 - Math.min(1, Math.max(0, (dist - opts.fadeNear) / fadeRange));
          var op = opts.baseOpacity + (opts.nearOpacity - opts.baseOpacity) * tt;
          // 되새김 stage: 최소 밝기 바닥 + 발광 배율. 잔해는 어둡게.
          var floor = opts.stageFloor[Math.min(2, o.stage)] || 0;
          op = Math.max(op, floor) * (o.glowBoost || 1);
          if (o.collapsed) op *= opts.collapsedDim;
          if (op > 0.96) op = 0.96;
          for (var m = 0; m < o.blocks.length; m++) {
            var mat = o.blocks[m].mat;
            var tgt = mat._dying ? 0 : op;
            mat.opacity = mat.opacity + (tgt - mat.opacity) * 0.08;   // 부드럽게
          }
          var lt = dist <= opts.labelNear
            ? (1 - dist / opts.labelNear) * 0.5 + 0.5      // 근접할수록 또렷
            : 0;
          var lcur = o.labelMat.opacity;
          o.labelMat.opacity = lcur + (lt * opts.labelOpacity - lcur) * 0.08;
        }
      }
      _origRender(s, c);
    };

    var adapter = runtime.__lumenAdapter;
    if (adapter && typeof adapter.on === 'function') {
      adapter.on('enter', function () { setTimeout(_rebuild, 80); });
      adapter.on('exit', _clear);
    }
    setTimeout(_rebuild, 80);  // attach 시점이 이미 enter 이후일 수 있음

    var api = {
      rebuild: _rebuild,
      clear: _clear,
      getDebug: function () {
        return _objects.map(function (o) {
          return {
            word: o.word, x: +o.cx.toFixed(1), z: +o.cz.toFixed(1),
            stage: o.stage, collapsed: o.collapsed, collapsing: !!o.collapsing,
          };
        });
      },
    };
    runtime.__lumenSceneObjects = api;
    return api;
  }

  global.LumenSceneObjects = { attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);

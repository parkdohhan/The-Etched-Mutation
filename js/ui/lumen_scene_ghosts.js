/**
 * Lumen Scene Ghosts
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260421.md §4 작업 4
 *
 * 유령 응결 좌표(memories.ghost_condensation_points)에 "잔상 텍스트" sprite 를 배치.
 * 기존 echo word floater (js/ui/strataView.js:981~) 의 FP 버전.
 *
 * - 좌표: 점의 (x, z) 를 월드 좌표로 그대로 사용. 높이는 runtime.gH(x,z) + baseY.
 * - 단어: memory 전역 echo_words 풀에서 점 index 로 결정적으로 픽(같은 점 → 같은 단어).
 * - 연출: strata 의 chromatic(red/cyan) + white glow 패턴 재사용 + 약한 bob.
 * - 가시성: 기본 매우 흐림(baseOpacity 0.15). 가까워질수록 진해짐. 응시로 "seen" 된
 *   인덱스는 추가 boost(옵션).
 *
 * 원본 함수 한 글자도 수정 안 함. renderer.render wrap 만 사용 (visual_effects 와 같은 체인).
 *
 * 사용:
 *   LumenSceneGhosts.attach(rt, {
 *     getGhostPoints: function () { return _fpGhostPoints; },
 *     getEchoWords:   function () { return (game.scenes||[]).flatMap(s => s.echo_words||[]); },
 *     isSeenIndex:    function (i) { return _fpSeenGhosts.has(i); }
 *   });
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    getGhostPoints: null,      // () => [{x, z, pollution_threshold?}]
    getEchoWords:   null,      // () => string[]  (memory-wide pool)
    getTerrainHeight: null,    // (x, z) => y   (fallback: runtime.gH)
    isSeenIndex: null,         // (i) => bool  (optional gaze boost)
    baseY:        2.8,         // 지면 위 기본 높이
    proximityNear: 6,          // 거리 이하면 최대 opacity
    proximityFar:  26,         // 거리 이상이면 baseOpacity
    baseOpacity:  0.14,
    nearOpacity:  0.72,
    seenBoost:    0.18,
    bobAmp:       0.22,        // m
    bobFreq:      0.32,        // Hz
    colorCss:     'rgba(232,216,252,0.92)', // pale violet — 유령 톤
    fontPx:       44
  };

  function attach(runtime, opts) {
    if (!runtime) { console.error('[lumen-scene-ghosts] runtime is required'); return null; }
    if (runtime.__lumenSceneGhosts) return runtime.__lumenSceneGhosts;
    opts = Object.assign({}, DEFAULTS, opts || {});

    var THREE = global.THREE;
    var scene = runtime.getScene && runtime.getScene();
    var renderer = runtime.getRenderer && runtime.getRenderer();
    if (!THREE || !scene || !renderer || typeof renderer.render !== 'function') {
      console.warn('[lumen-scene-ghosts] THREE/scene/renderer 없음 — 비활성');
      return null;
    }

    var _sprites = [];  // { sprite, idx, baseY, phase, word }
    var _builtAt = 0;

    function _gH(x, z) {
      if (typeof opts.getTerrainHeight === 'function') {
        try { return Number(opts.getTerrainHeight(x, z)) || 0; } catch (_) {}
      }
      if (typeof runtime.gH === 'function') {
        try { return Number(runtime.gH(x, z)) || 0; } catch (_) {}
      }
      return 0;
    }

    function _makeTextSprite(text) {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var font = opts.fontPx + 'px "Gowun Batang", "Noto Serif KR", serif';
      ctx.font = font;
      var pad = 32;
      var wMeasure = ctx.measureText(text).width + pad * 2;
      canvas.width = Math.min(512, Math.max(128, Math.pow(2, Math.ceil(Math.log2(wMeasure)))));
      canvas.height = 96;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var cx = canvas.width / 2, cy = canvas.height / 2;

      // Chromatic red/cyan afterimage
      ctx.save();
      ctx.filter = 'blur(5px)';
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255,70,70,0.72)';
      ctx.fillText(text, cx - 7, cy);
      ctx.fillStyle = 'rgba(70,220,255,0.72)';
      ctx.fillText(text, cx + 7, cy);
      ctx.restore();

      // Main body with soft violet-white glow
      ctx.save();
      ctx.shadowColor = 'rgba(232,216,252,0.55)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = opts.colorCss;
      ctx.fillText(text, cx, cy);
      ctx.restore();

      var tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      var mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: opts.baseOpacity,
        fog: true,
        depthWrite: false
      });
      var sp = new THREE.Sprite(mat);
      sp.scale.set(canvas.width / 64, canvas.height / 64, 1);
      sp.userData._lumenSceneGhost = true;
      sp._lumenTex = tex;
      sp._lumenMat = mat;
      return sp;
    }

    function _collectWords() {
      var arr = [];
      if (typeof opts.getEchoWords === 'function') {
        try {
          var got = opts.getEchoWords();
          if (Array.isArray(got)) {
            for (var i = 0; i < got.length; i++) {
              if (typeof got[i] === 'string' && got[i].trim()) arr.push(got[i].trim());
            }
          }
        } catch (_) {}
      }
      var seen = {}, out = [];
      for (var k = 0; k < arr.length; k++) {
        if (!seen[arr[k]]) { seen[arr[k]] = true; out.push(arr[k]); }
      }
      return out;
    }

    function clear() {
      for (var i = 0; i < _sprites.length; i++) {
        var s = _sprites[i].sprite;
        if (s.parent) s.parent.remove(s);
        if (s._lumenMat && s._lumenMat.dispose) s._lumenMat.dispose();
        if (s._lumenTex && s._lumenTex.dispose) s._lumenTex.dispose();
      }
      _sprites = [];
    }

    function build() {
      clear();
      var pts = [];
      if (typeof opts.getGhostPoints === 'function') {
        try {
          var got = opts.getGhostPoints();
          if (Array.isArray(got)) pts = got;
        } catch (_) {}
      }
      var words = _collectWords();
      if (!pts.length || !words.length) {
        console.log('[lumen-scene-ghosts] build skipped — pts=' + pts.length + ' words=' + words.length);
        return 0;
      }
      var added = 0;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
        var word = words[i % words.length];
        if (!word) continue;
        var y = _gH(p.x, p.z) + opts.baseY;
        var sprite = _makeTextSprite(word);
        sprite.position.set(p.x, y, p.z);
        scene.add(sprite);
        _sprites.push({ sprite: sprite, idx: i, baseY: y, phase: i * 1.37, word: word });
        added++;
      }
      _builtAt = performance.now();
      console.log('[lumen-scene-ghosts] built sprites=' + added + ' / pts=' + pts.length + ' / words=' + words.length);
      return added;
    }

    // Render wrap — positions + opacity per frame
    var _origRender = renderer.render.bind(renderer);
    renderer.render = function lumenSceneGhostsRender(sceneArg, cameraArg) {
      try {
        var fpActive = runtime.isFirstPerson && runtime.isFirstPerson();
        if (_sprites.length) {
          if (fpActive && cameraArg) {
            var tSec = (performance.now() - _builtAt) / 1000;
            var cam = cameraArg;
            var pNear = opts.proximityNear, pFar = opts.proximityFar;
            var pRange = Math.max(0.01, pFar - pNear);
            for (var i = 0; i < _sprites.length; i++) {
              var rec = _sprites[i];
              var sp = rec.sprite;
              var bob = Math.sin(tSec * 2 * Math.PI * opts.bobFreq + rec.phase) * opts.bobAmp;
              sp.position.y = rec.baseY + bob;
              var dx = sp.position.x - cam.position.x;
              var dz = sp.position.z - cam.position.z;
              var d = Math.sqrt(dx * dx + dz * dz);
              var tProx = 1 - Math.min(1, Math.max(0, (d - pNear) / pRange));
              var op = opts.baseOpacity + (opts.nearOpacity - opts.baseOpacity) * tProx;
              if (typeof opts.isSeenIndex === 'function') {
                try { if (opts.isSeenIndex(rec.idx)) op += opts.seenBoost; } catch (_) {}
              }
              if (op > 1) op = 1;
              sp._lumenMat.opacity = op;
            }
          } else {
            // FP 밖 — 전부 숨김 (sprite 는 유지, exit 이벤트가 clear)
            for (var j = 0; j < _sprites.length; j++) _sprites[j].sprite._lumenMat.opacity = 0;
          }
        }
      } catch (_) { /* render 막지 않음 */ }
      return _origRender(sceneArg, cameraArg);
    };

    // Lifecycle hook via adapter (enter: build / exit: clear).
    // adapter 가 없거나 이미 FP 라면 즉시 build.
    var adapter = runtime.__lumenAdapter;
    if (adapter && typeof adapter.on === 'function') {
      adapter.on('enter', function () { build(); });
      adapter.on('exit',  function () { clear(); });
    }
    if (runtime.isFirstPerson && runtime.isFirstPerson()) {
      build();
    }

    var api = {
      build: build,
      clear: clear,
      rebuild: function () { return build(); },
      setOptions: function (patch) { Object.assign(opts, patch || {}); },
      getOptions: function () { return Object.assign({}, opts); },
      getDebug: function () {
        return {
          sprites: _sprites.length,
          samples: _sprites.slice(0, 3).map(function (r) { return { idx: r.idx, word: r.word, x: r.sprite.position.x, z: r.sprite.position.z }; }),
          words: _collectWords().slice(0, 10),
          builtAt: _builtAt
        };
      },
      _runtime: runtime
    };
    runtime.__lumenSceneGhosts = api;
    return api;
  }

  global.LumenSceneGhosts = { attach: attach };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenSceneGhosts;
  }
})(typeof window !== 'undefined' ? window : this);

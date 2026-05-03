/**
 * Lumen Scene Ghosts
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260427.md §4 작업 4
 *
 * 유령 응결 좌표(memories.ghost_condensation_points)에 "잔상 텍스트" sprite 배치.
 *
 * 게이팅 모델 (admin 사용설명서:277 의 의도 복원):
 *   - 점별 활성 여부 = getPollutionAt(x, z) >= pollution_threshold
 *   - pollutionAt 은 외부 책임 — "장면 응답"이 누적된 오염도(0~1).
 *     단순 구현: plays.alignment 평균 역수.
 *     공간 분포 구현(V3): admin 설계서대로 anchor (v, a) 가우시안 누적 + (x, z) sample.
 *
 * 사용:
 *   LumenSceneGhosts.attach(rt, {
 *     getGhostPoints:  () => game.ghost_condensation_points,
 *     getEchoWords:    () => echo_words_pool,
 *     getPollutionAt:  (x, z) => 0~1,           // 응답 누적 오염도 sample
 *     isSeenIndex:     (i) => _seen.has(i)      // optional gaze boost
 *   });
 *
 *   // 응답 추가 후 즉시 반영:
 *   runtime.__lumenSceneGhosts.refresh();
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    getGhostPoints:   null,    // () => [{x, z, pollution_threshold?}]
    getEchoWords:     null,    // () => string[]  (memory-wide pool)
    getPollutionAt:   null,    // (x, z) => 0~1   응답 누적 오염도 sample
    getTerrainHeight: null,    // (x, z) => y   (fallback: runtime.gH)
    isSeenIndex:      null,    // (i) => bool   (optional gaze boost)
    baseY:            2.8,
    proximityNear:    6,
    proximityFar:     26,
    baseOpacity:      0.14,
    nearOpacity:      0.72,
    seenBoost:        0.18,
    bobAmp:           0.22,
    bobFreq:          0.32,
    colorCss:         'rgba(232,216,252,0.92)',
    fontPx:           44,
    revealFadeSec:    1.6      // 발현 페이드인
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

    var _sprites = [];     // { sprite, idx, baseY, phase, word, threshold, active, revealedAt }
    var _builtAt = 0;

    function _samplePollution(x, z) {
      if (typeof opts.getPollutionAt !== 'function') return 0;
      try {
        var v = Number(opts.getPollutionAt(x, z));
        if (!isFinite(v)) return 0;
        if (v < 0) return 0; if (v > 1) return 1;
        return v;
      } catch (_) { return 0; }
    }

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
      var nowSec = performance.now() / 1000;
      var added = 0, activeCount = 0;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
        var word = words[i % words.length];
        if (!word) continue;
        var y = _gH(p.x, p.z) + opts.baseY;
        var sprite = _makeTextSprite(word);
        sprite.position.set(p.x, y, p.z);
        sprite._lumenMat.opacity = 0; // 게이팅 결과 따라 채워짐
        scene.add(sprite);
        var thr = (typeof p.pollution_threshold === 'number') ? p.pollution_threshold : 0.3;
        if (thr < 0) thr = 0; if (thr > 1) thr = 1;
        var samp = _samplePollution(p.x, p.z);
        var active = samp >= thr;
        if (active) activeCount++;
        _sprites.push({
          sprite: sprite, idx: i, baseY: y, phase: i * 1.37, word: word,
          threshold: thr, active: active,
          revealedAt: active ? nowSec : 0
        });
        added++;
      }
      _builtAt = performance.now();
      console.log('[lumen-scene-ghosts] built sprites=' + added + ' / pts=' + pts.length +
                  ' / active=' + activeCount + ' / words=' + words.length);
      return added;
    }

    // 외부에서 응답 추가/변경 후 호출 — pollField 다시 빌드 + 점별 active 재평가.
    // 새로 active 가 된 점은 revealedAt 갱신 → 페이드인 시작.
    function refresh() {
      if (!_sprites.length) return 0;
      var nowSec = performance.now() / 1000;
      var newlyRevealed = 0;
      for (var i = 0; i < _sprites.length; i++) {
        var rec = _sprites[i];
        var samp = _samplePollution(rec.sprite.position.x, rec.sprite.position.z);
        var nowActive = samp >= rec.threshold;
        if (nowActive && !rec.active) {
          rec.active = true;
          rec.revealedAt = nowSec;
          newlyRevealed++;
        } else if (!nowActive && rec.active) {
          // 보통 응답 누적이라 active → inactive 는 안 일어나지만 안전 처리
          rec.active = false;
        }
      }
      if (newlyRevealed > 0) {
        console.log('[lumen-scene-ghosts] refresh — newly revealed=' + newlyRevealed);
      }
      return newlyRevealed;
    }

    // Render wrap — bob + active 게이팅 + 거리 opacity + 페이드인
    var _origRender = renderer.render.bind(renderer);
    renderer.render = function lumenSceneGhostsRender(sceneArg, cameraArg) {
      try {
        var fpActive = runtime.isFirstPerson && runtime.isFirstPerson();
        if (_sprites.length) {
          if (fpActive && cameraArg) {
            var nowMs = performance.now();
            var nowSec = nowMs / 1000;
            var tSec = (nowMs - _builtAt) / 1000;
            var cam = cameraArg;
            var pNear = opts.proximityNear, pFar = opts.proximityFar;
            var pRange = Math.max(0.01, pFar - pNear);
            var fadeSec = Math.max(0.01, opts.revealFadeSec);
            for (var i = 0; i < _sprites.length; i++) {
              var rec = _sprites[i];
              var sp = rec.sprite;
              var bob = Math.sin(tSec * 2 * Math.PI * opts.bobFreq + rec.phase) * opts.bobAmp;
              sp.position.y = rec.baseY + bob;
              if (!rec.active) { sp._lumenMat.opacity = 0; continue; }
              var dx = sp.position.x - cam.position.x;
              var dz = sp.position.z - cam.position.z;
              var d = Math.sqrt(dx * dx + dz * dz);
              var tProx = 1 - Math.min(1, Math.max(0, (d - pNear) / pRange));
              var op = opts.baseOpacity + (opts.nearOpacity - opts.baseOpacity) * tProx;
              if (typeof opts.isSeenIndex === 'function') {
                try { if (opts.isSeenIndex(rec.idx)) op += opts.seenBoost; } catch (_) {}
              }
              if (op > 1) op = 1;
              var fade = Math.min(1, (nowSec - rec.revealedAt) / fadeSec);
              sp._lumenMat.opacity = op * fade;
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
      refresh: refresh,
      setOptions: function (patch) { Object.assign(opts, patch || {}); },
      getOptions: function () { return Object.assign({}, opts); },
      getDebug: function () {
        return {
          sprites: _sprites.length,
          active: _sprites.filter(function (r) { return r.active; }).length,
          samples: _sprites.slice(0, 5).map(function (r) {
            return {
              idx: r.idx, word: r.word, active: r.active, thr: r.threshold,
              x: +r.sprite.position.x.toFixed(1),
              z: +r.sprite.position.z.toFixed(1),
              poll: +_samplePollution(r.sprite.position.x, r.sprite.position.z).toFixed(3)
            };
          }),
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

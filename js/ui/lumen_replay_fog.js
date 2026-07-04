/**
 * Lumen Replay Fog — §9.9 안개 해제 v0.2 (docs/생성형_지형모델_v2-260619.md)
 *
 * ADDITIVE & FLAG-GATED. Only attached when TemReplayTerrain flag is ON
 * (play-test wiring checks the flag). Rollback: delete this file + the
 * attach/reveal lines inside the ADDITIVE blocks in play-test.html.
 *
 * What it does:
 *   - Run start (0 beats): DENSE billowing sky-white fog — the player sees
 *     only their immediate surroundings (themselves + the nearest ghost).
 *     "기억은 체험되기 전엔 보이지 않는다."
 *   - Each completed scene (beat): fog steps back one layer with an eased
 *     animation, revealing the freshly re-baked land and the next scene's
 *     ghost. density(beats) = clear + (start-clear)·decay^beats
 *   - 뭉게뭉게: density breathes with two slow sine waves, and fog/背景 color
 *     blends toward a pale sky-white while fog is thick, returning to the
 *     moody dark palette as it clears.
 *
 * v0 honesty note (§9.9): global density staging, not per-piece spatial fog.
 * True "생성된 조각까지만" fog needs a terrain-shader mask — documented 미정.
 *
 * Integration notes:
 *   - LumenVisualEffects rewrites scene.fog.density EVERY frame from its
 *     fogBaseDensity option → we drive density through vfx.setOptions()
 *     per frame (fallback: write scene.fog.density directly).
 *   - Fog/background COLOR is written by the runtime's _tickSeedGrp earlier
 *     in the same tick; our render-wrap runs after it, so our blend sticks.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    startDensity: 0.05,    // 0 beats — only a few world units visible
    clearDensity: null,    // null = adopt current fogBaseDensity at attach
    decayPerBeat: 0.65,    // each beat lifts one layer of fog
    animMs: 3000,
    skyColor: 0xcfdde8,    // 뭉게 안개의 하늘하양 색
    colorBlendMax: 0.85,   // 안개 최대일 때 색이 하늘하양으로 물드는 정도
    wobbleAmp: 0.10,       // 뭉게뭉게 — 밀도 숨쉬기 (느린 파도)
    wobbleAmp2: 0.06,      //             + 잔결
    getBeats: null,        // required: () => current run beat count
  };

  function _now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function _hexToRGB(hex) {
    return { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
  }
  // THREE 의존 없이 THREE.Color 인스턴스를 제자리 lerp
  function _lerpColor(c, target, k) {
    c.r += (target.r - c.r) * k;
    c.g += (target.g - c.g) * k;
    c.b += (target.b - c.b) * k;
  }

  function attach(runtime, opts) {
    if (!runtime || runtime.__lumenReplayFog) return runtime && runtime.__lumenReplayFog;
    opts = Object.assign({}, DEFAULTS, opts || {});
    if (typeof opts.getBeats !== 'function') {
      console.warn('[replay-fog] getBeats provider missing — not attached');
      return null;
    }
    var scene = runtime.getScene && runtime.getScene();
    if (!scene) { console.warn('[replay-fog] scene not ready — not attached'); return null; }

    var SKY = _hexToRGB(opts.skyColor);
    var BLACK = { r: 0, g: 0, b: 0 };
    var _detached = false;

    function vfx() { return runtime.__lumenVisualFx || null; }

    // "걷힌 상태"의 기준 밀도 — vfx 옵션 > 현재 fog > 폴백
    var clear = opts.clearDensity;
    if (clear == null) {
      var fx0 = vfx();
      if (fx0 && fx0.getOptions) clear = fx0.getOptions().fogBaseDensity;
      else if (scene.fog && typeof scene.fog.density === 'number') clear = scene.fog.density;
      else clear = 0.006;
    }

    function densityFor(beats) {
      var b = Math.max(0, Number(beats) || 0);
      return clear + (opts.startDensity - clear) * Math.pow(opts.decayPerBeat, b);
    }

    var _current = densityFor(opts.getBeats());

    function _applyDensity(v) {
      var fx = vfx();
      if (fx && fx.setOptions) fx.setOptions({ fogBaseDensity: v });
      else if (scene.fog) scene.fog.density = v;
    }
    _applyDensity(_current); // run start: dense immediately (no animation)
    console.log('[replay-fog] attached — 시작 안개 밀도', _current.toFixed(4), '(박자', opts.getBeats(), '개)');

    // ── 매 프레임: 뭉게 숨쉬기 + 하늘하양 블렌드 ──
    // _tickSeedGrp(색 쓰기) 이후·vfx(밀도 쓰기) 이전에 실행되는 wrap 지점.
    function _frame() {
      if (_detached) return;
      var span = opts.startDensity - clear;
      var amt = span > 1e-9 ? Math.max(0, Math.min(1, (_current - clear) / span)) : 0;

      var t = _now() / 1000;
      var wob = 1 + amt * (opts.wobbleAmp * Math.sin(t * 0.37) + opts.wobbleAmp2 * Math.sin(t * 1.31 + 2.2));
      _applyDensity(_current * wob);

      // 박자 0 = 완전한 무(無): 안개·배경 모두 순검정 (유령 실루엣만 남는다).
      // 첫 판이 태어난 뒤부터 하늘하양 뭉게로.
      var beats = 0;
      try { beats = opts.getBeats() || 0; } catch (_) {}
      if (beats === 0) {
        if (scene.fog && scene.fog.color) _lerpColor(scene.fog.color, BLACK, 0.6);
        if (scene.background && scene.background.isColor) _lerpColor(scene.background, BLACK, 0.6);
        return;
      }
      var k = amt * opts.colorBlendMax;
      if (k > 0.001) {
        if (scene.fog && scene.fog.color) _lerpColor(scene.fog.color, SKY, k);
        if (scene.background && scene.background.isColor) _lerpColor(scene.background, SKY, k * 0.9);
      }
    }
    var renderer = runtime.getRenderer && runtime.getRenderer();
    if (renderer && typeof renderer.render === 'function') {
      var _origRender = renderer.render.bind(renderer);
      renderer.render = function replayFogRender(sceneArg, cameraArg) {
        try { _frame(); } catch (_) { /* 연출 실패가 render 막지 않게 */ }
        return _origRender(sceneArg, cameraArg);
      };
    } else {
      console.warn('[replay-fog] renderer 없음 — 숨쉬기/색 블렌드 생략, 밀도 단계만 동작');
    }

    var _animRaf = 0;
    var _lifted = false;   // 막다른 자리에서 전부 걷힌 뒤엔 다시 안 낀다
    function _animTo(target, doneMsg) {
      if (Math.abs(target - _current) < 1e-6) return;
      if (_animRaf) cancelAnimationFrame(_animRaf);
      var from = _current;
      var t0 = _now();
      function step() {
        var t = Math.min(1, (_now() - t0) / opts.animMs);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
        _current = from + (target - from) * e;
        if (t < 1) _animRaf = requestAnimationFrame(step);
        else { _animRaf = 0; console.log(doneMsg + ' — 밀도', target.toFixed(4)); }
      }
      _animRaf = requestAnimationFrame(step);
    }
    function reveal() {
      if (_lifted) return;
      _animTo(densityFor(opts.getBeats()), '[replay-fog] 안개 한 겹 걷힘');
    }
    // 막다른 장면 도달: 안개를 전부 걷는다 — 지나온 길(발자국)이 드러난다
    function liftAll() {
      _lifted = true;
      _animTo(clear, '[replay-fog] 안개 전부 걷힘 — 지나온 길이 드러난다');
    }

    var api = {
      reveal: reveal,
      liftAll: liftAll,
      getDensity: function () { return _current; },
      detach: function () {
        if (_animRaf) cancelAnimationFrame(_animRaf);
        _detached = true;
        _current = clear;
        _applyDensity(clear);
        runtime.__lumenReplayFog = null;
      },
    };
    runtime.__lumenReplayFog = api;
    return api;
  }

  global.LumenReplayFog = { attach: attach };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenReplayFog;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

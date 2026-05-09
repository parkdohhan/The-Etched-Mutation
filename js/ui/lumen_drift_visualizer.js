/**
 * Lumen Drift Visualizer — V2.1 Phase 1
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260506.md §4 V2.1 Phase 1
 *
 * 자유대화 매 턴 반응 결정 직후 변형 즉시 가시화. 결마다 다른 강도 펄스 → duration
 * 후 자동 복원. lumen_return_mode.js (작업 2-B) 어휘 재활용 — canvas filter + scene_ghosts
 * options + sprite material.rotation 셋 동시 갱신.
 *
 * 결 → 강도 단계 (V2-12 본인 한 바퀴 튜닝 예정, 현 단계는 시드값):
 *   - resonance:  미세 amber, 유령 안정, 300ms
 *   - vague:      중간 흔들, bobAmp +0.10, 700ms
 *   - dissonance: 강 cool tint, bobAmp +0.20 + rotation 0.12, 1200ms
 *
 * 원본 수정 안 함. canvas style + scene_ghosts options 만 갱신. tem_af_strata_terrain 다섯
 * 함수 무관 (어댑터 외부 layer).
 *
 * 사용:
 *   var dv = LumenDriftVisualizer.attach(rt);
 *   dv.pulse({ resonance: 'dissonance' });   // 1200ms 후 자동 복원
 *   dv.detach();                              // 전부 복원
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    canvasId: 'strataCanvas',
    canvasFilterTransition: 'filter 0.3s ease',

    // 결마다 강도 시드 (V2-12 튜닝 대상)
    intensity: {
      resonance: {
        canvasFilter: 'saturate(1.05) brightness(1.02)',
        ghostBobAmpDelta:    0.0,
        ghostBobFreqDelta:   0.0,
        spriteRotation:      0.0,
        durationMs:          300,
      },
      vague: {
        canvasFilter: 'saturate(0.85) brightness(0.95)',
        ghostBobAmpDelta:    0.10,
        ghostBobFreqDelta:   0.10,
        spriteRotation:      0.06,
        durationMs:          700,
      },
      dissonance: {
        canvasFilter: 'hue-rotate(15deg) saturate(0.75) brightness(0.92)',
        ghostBobAmpDelta:    0.20,
        ghostBobFreqDelta:   0.20,
        spriteRotation:      0.12,
        durationMs:          1200,
      },
    },
  };

  function attach(runtime, opts) {
    if (!runtime) { console.error('[lumen-drift-vis] runtime required'); return null; }
    if (runtime.__lumenDriftVisualizer) return runtime.__lumenDriftVisualizer;

    opts = Object.assign({}, DEFAULTS, opts || {});
    // intensity 깊은 복사 (DEFAULTS 보호)
    opts.intensity = JSON.parse(JSON.stringify(opts.intensity));

    var canvas = (typeof document !== 'undefined')
      ? document.getElementById(opts.canvasId)
      : null;

    // 원복 스냅샷
    var _savedCanvasFilter     = canvas ? canvas.style.filter : null;
    var _savedCanvasTransition = canvas ? canvas.style.transition : null;
    var _savedGhostOpts = null;
    var _activeTimer = null;
    var _activeRotationSprites = [];

    if (canvas) {
      canvas.style.transition = opts.canvasFilterTransition;
    }

    function _getGhostsApi() { return runtime.__lumenSceneGhosts || null; }
    function _getScene()     { return (runtime.getScene && runtime.getScene()) || null; }

    function _forEachGhostSprite(fn) {
      var scene = _getScene();
      if (!scene) return;
      scene.traverse(function (o) {
        if (o && o.userData && o.userData._lumenSceneGhost) fn(o);
      });
    }

    function _restore() {
      if (canvas) canvas.style.filter = _savedCanvasFilter || '';

      if (_savedGhostOpts) {
        var ghosts = _getGhostsApi();
        if (ghosts && typeof ghosts.setOptions === 'function') {
          ghosts.setOptions(_savedGhostOpts);
          if (typeof ghosts.rebuild === 'function') ghosts.rebuild();
        }
        _savedGhostOpts = null;
      }

      // sprite rotation 복원
      _activeRotationSprites.forEach(function (s) {
        if (s && s.material && typeof s.material.rotation === 'number') {
          s.material.rotation = 0;
        }
      });
      _activeRotationSprites = [];

      _activeTimer = null;
    }

    function pulse(input) {
      input = input || {};
      var resonance = input.resonance || 'vague';
      var spec = opts.intensity[resonance] || opts.intensity.vague;

      // 진행 중인 펄스 있으면 즉시 복원 후 새 펄스 시작
      if (_activeTimer) {
        clearTimeout(_activeTimer);
        _restore();
      }

      // 1. canvas filter 적용
      if (canvas) canvas.style.filter = spec.canvasFilter;

      // 2. 유령 옵션 적용 (스냅샷 후 delta)
      var ghosts = _getGhostsApi();
      if (ghosts && typeof ghosts.getOptions === 'function' && typeof ghosts.setOptions === 'function') {
        var cur = ghosts.getOptions() || {};
        _savedGhostOpts = {
          bobAmp:  cur.bobAmp,
          bobFreq: cur.bobFreq,
        };
        ghosts.setOptions({
          bobAmp:  (cur.bobAmp || 0)  + spec.ghostBobAmpDelta,
          bobFreq: (cur.bobFreq || 0) + spec.ghostBobFreqDelta,
        });
        if (typeof ghosts.rebuild === 'function') ghosts.rebuild();
      }

      // 3. sprite rotation
      if (spec.spriteRotation) {
        _forEachGhostSprite(function (s) {
          if (s && s.material) {
            s.material.rotation = spec.spriteRotation;
            _activeRotationSprites.push(s);
          }
        });
      }

      // duration 후 자동 복원
      var duration = input.duration || spec.durationMs;
      _activeTimer = setTimeout(_restore, duration);
    }

    function isActive() { return !!_activeTimer; }

    function detach() {
      if (_activeTimer) clearTimeout(_activeTimer);
      _restore();
      if (canvas && _savedCanvasTransition !== null) {
        canvas.style.transition = _savedCanvasTransition || '';
      }
      runtime.__lumenDriftVisualizer = null;
    }

    function setIntensity(resonance, spec) {
      if (opts.intensity[resonance]) {
        Object.assign(opts.intensity[resonance], spec || {});
      }
    }

    function getDebug() {
      return {
        opts: JSON.parse(JSON.stringify(opts)),
        active: isActive(),
        savedGhostOpts: _savedGhostOpts,
        rotatedSprites: _activeRotationSprites.length,
      };
    }

    var api = {
      pulse: pulse,
      detach: detach,
      isActive: isActive,
      setIntensity: setIntensity,
      getDebug: getDebug,
    };

    runtime.__lumenDriftVisualizer = api;
    return api;
  }

  global.LumenDriftVisualizer = { attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);

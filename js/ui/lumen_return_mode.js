/**
 * Lumen Return Mode
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260427.md §4 작업 2-B
 *
 * 귀환 모드(= rewind 활성) 진입 시 3종 변화 신호를 동시에 전환. rewind 모듈·scene_ghosts 모듈
 * 원본 한 글자도 수정 안 함 — `rt.__lumenRewind.on('rewindStart' | 'rewindEnd')` 구독만.
 *
 *   1. 색감 shift   — strataCanvas CSS filter(hue-rotate + saturate + brightness) 전환.
 *                     새 shader 금지(SCOPE §0 후속 원칙) 준수. transition: 0.4s.
 *   2. 속도 ×1.5    — rewind.setOptions({ playbackSpeed: 1.5 }). 2-A 기본치 1.0 → 1.5.
 *                     attach 시점에 미리 세팅하므로 rewindStart 이후 첫 frame 부터 가속 적용.
 *   3. 유령 자세    — scene_ghosts `colorCss`/`bobAmp`/`bobFreq` 전환 + rebuild 로 sprite 텍스처
 *                     재생성 + 현 sprite `material.rotation` 기울임. "유령이 불안정해진다" 신호.
 *
 * rewindEnd 시 세 신호 모두 원복. forceStart/forceStop 수동 테스트 허용.
 *
 * 사용:
 *   var rm = LumenReturnMode.attach(rt, { canvasId: 'strataCanvas' });
 *   // rewind 트리거되면 자동 전환. 수동: rt.__lumenRewind.forceStart()
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    canvasId: 'strataCanvas',
    // 1. 색감 — 약한 하늘색 shift + 탈채도 + 어두움. 귀환 중인 것을 인지 가능하되 지나치게 튀지 않게.
    canvasFilter: 'hue-rotate(-22deg) saturate(0.68) brightness(0.88)',
    canvasFilterTransition: 'filter 0.4s ease',
    // 2. 속도 — rewind playbackSpeed 교체
    rewindSpeed: 1.5,
    // 3. 유령 자세
    ghostColorCss: 'rgba(252,232,180,0.92)', // pale violet → 병든 amber 로 전환 (jaundiced)
    ghostBobFreq:  0.55,                      // 0.32 → 0.55 (불안정)
    ghostBobAmp:   0.34,                      // 0.22 → 0.34 (큰 흔들림)
    spriteRotation: 0.18                      // rad ≈ 10° 기울어진 자세
  };

  function attach(runtime, opts) {
    if (!runtime) { console.error('[lumen-return] runtime is required'); return null; }
    if (runtime.__lumenReturnMode) return runtime.__lumenReturnMode;

    opts = Object.assign({}, DEFAULTS, opts || {});

    var rewind = runtime.__lumenRewind || null;
    if (!rewind || typeof rewind.on !== 'function') {
      console.warn('[lumen-return] rt.__lumenRewind 없음 — 모듈 비활성. rewind attach 이후 재시도.');
      return null;
    }

    var canvas = (typeof document !== 'undefined')
      ? document.getElementById(opts.canvasId)
      : null;
    if (!canvas) console.warn('[lumen-return] canvas#' + opts.canvasId + ' 없음 — 색감 shift 건너뜀.');

    // 원복용 스냅샷
    var _savedCanvasFilter     = canvas ? canvas.style.filter     : null;
    var _savedCanvasTransition = canvas ? canvas.style.transition : null;
    var _savedGhostOpts = null;     // { colorCss, bobFreq, bobAmp }

    var _active = false;

    function _getGhostsApi() { return runtime.__lumenSceneGhosts || null; }
    function _getScene()     { return (runtime.getScene && runtime.getScene()) || null; }

    // canvas transition 은 attach 시점에 한 번 설정 (filter 값만 바뀌어도 자연스럽게 이행)
    if (canvas) {
      canvas.style.transition = opts.canvasFilterTransition;
    }

    // 2. rewind playbackSpeed 미리 주입 — rewindStart 이후 첫 frame 부터 가속 적용
    if (typeof rewind.setOptions === 'function') {
      rewind.setOptions({ playbackSpeed: opts.rewindSpeed });
    }

    function _forEachGhostSprite(fn) {
      var scene = _getScene();
      if (!scene) return;
      scene.traverse(function (o) {
        if (o && o.userData && o.userData._lumenSceneGhost) fn(o);
      });
    }

    function _enter() {
      if (_active) return;
      _active = true;

      // 1. 색감 shift
      if (canvas) canvas.style.filter = opts.canvasFilter;

      // 3. 유령 자세 — scene_ghosts 옵션 교체 + rebuild + sprite rotation
      var ghosts = _getGhostsApi();
      if (ghosts && typeof ghosts.getOptions === 'function' && typeof ghosts.setOptions === 'function') {
        var cur = ghosts.getOptions() || {};
        _savedGhostOpts = {
          colorCss: cur.colorCss,
          bobFreq:  cur.bobFreq,
          bobAmp:   cur.bobAmp
        };
        ghosts.setOptions({
          colorCss: opts.ghostColorCss,
          bobFreq:  opts.ghostBobFreq,
          bobAmp:   opts.ghostBobAmp
        });
        if (typeof ghosts.rebuild === 'function') {
          try { ghosts.rebuild(); } catch (e) { console.warn('[lumen-return] ghosts.rebuild 실패', e); }
        }
      }

      _forEachGhostSprite(function (sp) {
        if (sp.material && typeof sp.material.rotation === 'number') {
          sp.userData._lumenReturnPrevRotation = sp.material.rotation;
          sp.material.rotation = opts.spriteRotation;
        }
      });
    }

    function _exit() {
      if (!_active) return;
      _active = false;

      // 1. 색감 복원
      if (canvas) canvas.style.filter = _savedCanvasFilter || '';

      // 3. 유령 자세 복원
      var ghosts = _getGhostsApi();
      if (ghosts && _savedGhostOpts && typeof ghosts.setOptions === 'function') {
        ghosts.setOptions(_savedGhostOpts);
        if (typeof ghosts.rebuild === 'function') {
          try { ghosts.rebuild(); } catch (e) { console.warn('[lumen-return] ghosts.rebuild 실패', e); }
        }
        _savedGhostOpts = null;
      }
      _forEachGhostSprite(function (sp) {
        if (sp.material && typeof sp.userData._lumenReturnPrevRotation === 'number') {
          sp.material.rotation = sp.userData._lumenReturnPrevRotation;
          delete sp.userData._lumenReturnPrevRotation;
        } else if (sp.material) {
          sp.material.rotation = 0;
        }
      });
    }

    rewind.on('rewindStart', function (/* payload */) { _enter(); });
    rewind.on('rewindEnd',   function (/* payload */) { _exit(); });

    var api = {
      _runtime: runtime,
      isReturning: function () { return _active; },
      forceEnter:  function () { _enter(); },
      forceExit:   function () { _exit(); },
      setOptions:  function (patch) {
        if (!patch) return;
        Object.keys(patch).forEach(function (k) {
          if (k in DEFAULTS) opts[k] = patch[k];
        });
        // rewindSpeed 바뀌면 rewind 모듈에도 즉시 반영
        if (patch.rewindSpeed != null && typeof rewind.setOptions === 'function') {
          rewind.setOptions({ playbackSpeed: opts.rewindSpeed });
        }
        // canvasFilter 가 바뀌었고 현재 귀환 중이면 즉시 재적용
        if (_active && patch.canvasFilter != null && canvas) {
          canvas.style.filter = opts.canvasFilter;
        }
      },
      getOptions:  function () { return Object.assign({}, opts); },
      getDebug:    function () {
        return {
          active: _active,
          canvasFilter:   canvas ? canvas.style.filter : null,
          rewindSpeed:    rewind.getOptions ? rewind.getOptions().playbackSpeed : null,
          savedGhostOpts: _savedGhostOpts && Object.assign({}, _savedGhostOpts)
        };
      }
    };
    runtime.__lumenReturnMode = api;
    return api;
  }

  global.LumenReturnMode = { attach: attach };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenReturnMode;
  }
})(typeof window !== 'undefined' ? window : this);

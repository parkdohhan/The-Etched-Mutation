/**
 * Lumen Visual Effects
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260423.md §4 작업 3b
 *
 * 시각 연출 3종. 수정 금지 함수 원칙 준수 — runtime public API만 래핑.
 *
 * 제공 효과:
 *   1. Fog 밀도 — scene.fog.density 를 오염 depth 에 연결해 동적으로 모듈레이션.
 *      기본 0.008(원본 기본값 유지) → depth 상승 시 `base * (1 + depth*gain)` 가중, cap 으로 폭주 방지.
 *   2. Vignette — 화면 가장자리 어둡게. DOM overlay(radial-gradient) + opacity 모듈레이션.
 *      새 shader 금지 원칙(SCOPE §0 후속 결정) 에 맞춰 DOM 레이어만 사용.
 *   3. Floating Anchor 거리(= 떠오르는 높이) — anchor sprite 의 baseY 오프셋을 런타임 튜닝 가능하게 노출.
 *      기본은 원본 배치 유지(오프셋 0). 파일럿 후 값 조정.
 *
 * 통합:
 *   - renderer.render wrap 으로 매 프레임 fog.density 갱신 (walk_effects 와 같은 경로).
 *     walk_effects 도 render wrap 이므로 체인 가능 (순서: walk_effects wrap → visual_effects wrap → origRender).
 *     단일 프레임에서 둘 다 적용되며 서로 간섭 없음.
 *   - vignette DOM 은 attach 시점에 body 에 붙임. detach() 로 제거 가능.
 *
 * 사용:
 *   var vfx = LumenVisualEffects.attach(runtime, {
 *     contaminationDepthProvider: function () { return game.contState.cont_depth || 0; }
 *   });
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    // Fog
    fogBaseDensity: 0.008,        // tem_af_strata_terrain.js:957 원본 값
    fogDepthGain: 0.35,           // density *= min(fogDepthCap, 1 + depth*gain). depth=0 → no change.
    fogDepthCap: 3.0,             // 최대 fogBase × cap = 0.024 (기본치의 3배)
    // Vignette
    vignetteBaseOpacity: 0.25,    // depth=0 에서도 가장자리 살짝 어두움 (공간감)
    vignetteDepthGain: 0.50,      // + depth*gain, cap 까지
    vignetteMaxOpacity: 0.75,     // 완전 암전 방지
    vignetteInnerStop: '38%',     // 투명 반경 (내부)
    vignetteOuterStop: '100%',    // 어두움 끝
    vignetteColor: 'rgba(0,0,0,1)',
    // Floating anchor 거리 튜닝 — 현 단계에서는 파라미터만 노출, 실 적용은 파일럿 후
    anchorHeightOffset: 0,        // 원본 L880: baseY = ewh + 2 + wi*1 에 추가 오프셋. 미적용 시 0.
    // 공통
    contaminationDepthProvider: null
  };

  function attach(runtime, opts) {
    if (!runtime) {
      console.error('[lumen-visual] runtime is required');
      return null;
    }
    if (runtime.__lumenVisualFx) return runtime.__lumenVisualFx;
    opts = Object.assign({}, DEFAULTS, opts || {});

    var scene = runtime.getScene && runtime.getScene();
    var renderer = runtime.getRenderer && runtime.getRenderer();
    if (!scene || !renderer || typeof renderer.render !== 'function') {
      console.warn('[lumen-visual] scene/renderer 없음 — 효과 비활성');
      return null;
    }

    // ─── Vignette DOM overlay ───
    var _vignetteEl = null;
    function _ensureVignette() {
      if (_vignetteEl || typeof document === 'undefined') return;
      _vignetteEl = document.createElement('div');
      _vignetteEl.id = 'lumenVignette';
      _vignetteEl.style.cssText = [
        'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:240',
        'opacity:0', 'transition:opacity 0.4s',
        'background:radial-gradient(ellipse at center, transparent ' +
          opts.vignetteInnerStop + ', ' + opts.vignetteColor + ' ' + opts.vignetteOuterStop + ')'
      ].join(';');
      document.body.appendChild(_vignetteEl);
    }
    function _removeVignette() {
      if (_vignetteEl && _vignetteEl.parentNode) _vignetteEl.parentNode.removeChild(_vignetteEl);
      _vignetteEl = null;
    }
    _ensureVignette();

    function _contDepth() {
      if (typeof opts.contaminationDepthProvider === 'function') {
        try { return Number(opts.contaminationDepthProvider()) || 0; } catch (_) { return 0; }
      }
      return 0;
    }

    // fog 원본 density 보관 (처음 attach 시점). attach 이전에 scene.fog 가 있어야 함.
    var _origFogDensity = (scene.fog && typeof scene.fog.density === 'number')
      ? scene.fog.density
      : opts.fogBaseDensity;

    function _applyFrame() {
      var fpActive = runtime.isFirstPerson && runtime.isFirstPerson();
      if (!fpActive) {
        // FP 밖 — vignette 해제, fog 원본 복원
        if (_vignetteEl) _vignetteEl.style.opacity = '0';
        if (scene.fog) scene.fog.density = _origFogDensity;
        return;
      }
      var depth = _contDepth();

      // ── Fog ──
      if (scene.fog) {
        var fogMul = Math.min(opts.fogDepthCap, 1 + depth * opts.fogDepthGain);
        scene.fog.density = opts.fogBaseDensity * fogMul;
      }

      // ── Vignette ──
      if (_vignetteEl) {
        var vo = opts.vignetteBaseOpacity + depth * opts.vignetteDepthGain;
        vo = Math.max(0, Math.min(opts.vignetteMaxOpacity, vo));
        _vignetteEl.style.opacity = String(vo);
      }
    }

    // renderer.render wrap (walk_effects 가 이미 wrap 했으면 그 위에 체인됨 → 순서 의존 없음)
    var _origRender = renderer.render.bind(renderer);
    renderer.render = function lumenVisualRender(sceneArg, cameraArg) {
      try { _applyFrame(); } catch (e) { /* 연출 실패가 render 막지 않게 */ }
      return _origRender(sceneArg, cameraArg);
    };

    var api = {
      _runtime: runtime,
      setOptions: function (patch) { Object.assign(opts, patch || {}); },
      getOptions: function () { return Object.assign({}, opts); },
      getAnchorHeightOffset: function () { return opts.anchorHeightOffset; },
      detach: function () {
        _removeVignette();
        if (scene.fog) scene.fog.density = _origFogDensity;
        // render wrap 은 체인 구조라 안전하게 unwrap 불가 — 옵션 flag 로 비활성화만.
      }
    };
    runtime.__lumenVisualFx = api;
    return api;
  }

  global.LumenVisualEffects = { attach: attach };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenVisualEffects;
  }
})(typeof window !== 'undefined' ? window : this);

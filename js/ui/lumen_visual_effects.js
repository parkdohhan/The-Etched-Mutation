/**
 * Lumen Visual Effects
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260427.md §4 작업 3b
 *        + V2-5 오염 카메라 연출 잔불 — docs/V2-6_병렬세션_핸드아웃-260513.md §H8
 *
 * 시각 연출. 수정 금지 함수 원칙 준수 — runtime public API만 래핑, camera 는 render 직전 가시 오프셋만 가산.
 *
 * 제공 효과:
 *   1. Fog 밀도 — scene.fog.density 를 오염 depth 에 연결해 동적으로 모듈레이션.
 *      기본 0.008(원본 기본값 유지) → depth 상승 시 `base * (1 + depth*gain)` 가중, cap 으로 폭주 방지.
 *   2. Vignette — 화면 가장자리 어둡게. DOM overlay(radial-gradient) + opacity 모듈레이션.
 *      새 shader 금지 원칙(SCOPE §0 후속 결정) 에 맞춰 DOM 레이어만 사용.
 *   3. Floating Anchor 거리(= 떠오르는 높이) — anchor sprite 의 baseY 오프셋을 런타임 튜닝 가능하게 노출.
 *      기본은 원본 배치 유지(오프셋 0). 파일럿 후 값 조정.
 *   4. Drift 카메라 미세 진동 (§H8) — 오염 depth 에 비례하는 상시 미세 떨림(camera.rotation 만, sin 합성으로
 *      유기적, depth 작을 땐 무감) + applyDriftCameraShake(intensity, durationMs) 펄스 호출 자리. 또한
 *      __lumenDriftVisualizer 펄스가 켜지는 순간을 자체 폴 → 결 어긋나는 턴에 짧은 burst (dialog_phase1.js
 *      안 건드림). play-test.html 은 이미 contaminationDepthProvider 와 함께 attach 하므로 추가 wiring 없이 작동.
 *   5. Drift 조명 색조 (§H8, 옵션) — 오염 depth 에 비례하는 매우 옅은 cool tint DOM overlay (vignette 바로 아래 층).
 *
 * 통합:
 *   - renderer.render wrap 으로 매 프레임 fog.density / vignette / camera shake / tint 갱신.
 *     walk_effects 도 render wrap — 본 wrap 이 더 바깥(나중 attach)이라 본 wrap 의 camera 가산이 walk_effects
 *     보다 먼저 찍힘. walk_effects 는 rotation.y 에 *가산*, position.x/z 는 *덮어씀*, _fpTick 은 매 프레임
 *     rotation.set(pitch, yaw, 0) 으로 리셋 — 따라서 drift shake 는 camera.rotation(x/z/y) 에만 가산하면
 *     walk_effects 가 덮지 않고 다음 프레임에 _fpTick 이 깨끗이 리셋 (누적 없음).
 *   - vignette / tint DOM 은 attach 시점에 body 에 붙임. detach() 로 제거 가능.
 *
 * 사용:
 *   var vfx = LumenVisualEffects.attach(runtime, {
 *     contaminationDepthProvider: function () { return game.contState.cont_depth || 0; }
 *   });
 *   vfx.applyDriftCameraShake(0.6);                // 0~1, 기본 durationMs 동안 선형 감쇠
 *   vfx.setOptions({ driftShakeEnabled: false });  // 끄기 (tint 는 driftTintEnabled)
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

    // ── Drift 카메라 미세 진동 (V2-5 잔불 / §H8) — 강도 시드, V2-12 튜닝 대상 ──
    driftShakeEnabled: true,
    // 상시 ambient: amp(rad) = min(driftShakeDepthCap, max(0,depth) * driftShakeDepthGain). depth 작을 땐 무감.
    driftShakeDepthGain: 0.0006,   // depth 3 → ≈0.0018 rad ≈ 0.10°, depth 5 → ≈0.17°
    driftShakeDepthCap: 0.004,     // 최대 ≈0.23° (depth 6.7+)
    driftShakeFreqHz: 1.6,         // 떨림 기본 주파수 (sin 합성 — 단일톤 회피)
    driftShakeRollRatio: 0.45,     // rotation.z(roll) = pitch amp × 이 비율 (Dutch wobble 약하게)
    driftShakeYawRatio: 0.5,       // rotation.y(yaw) 가산분 비율 (walk sway 와 별개, 작게)
    // 펄스: applyDriftCameraShake(intensity) → peak amp = intensity × driftShakePulseMaxAmp, durationMs 선형 감쇠
    driftShakePulseMaxAmp: 0.012,  // intensity=1 → ≈0.69° peak
    driftShakePulseDurationMs: 600,
    // __lumenDriftVisualizer 펄스 켜지는 순간(rising edge) 자체 폴 → 이 강도로 burst (dialog_phase1.js 무수정)
    driftShakeFollowVisualizer: true,
    driftShakeFollowIntensity: 0.45,

    // ── Drift 조명 색조 (V2-5 잔불 / §H8, 옵션) ──
    driftTintEnabled: true,
    driftTintColor: 'rgb(126,136,156)',   // cool 한 회청색 (기억이 식는 결)
    driftTintDepthGain: 0.012,             // opacity = min(driftTintMaxOpacity, max(0,depth) * gain)
    driftTintMaxOpacity: 0.06,             // 매우 옅음 — vignette 와 누적돼도 화면 안 죽게

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

    // ─── Drift 조명 색조 DOM overlay (vignette 바로 아래 층) ───
    var _tintEl = null;
    function _ensureTint() {
      if (_tintEl || typeof document === 'undefined') return;
      _tintEl = document.createElement('div');
      _tintEl.id = 'lumenDriftTint';
      _tintEl.style.cssText = [
        'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:238',
        'opacity:0', 'transition:opacity 0.5s',
        'background:' + opts.driftTintColor
      ].join(';');
      document.body.appendChild(_tintEl);
    }
    function _removeTint() {
      if (_tintEl && _tintEl.parentNode) _tintEl.parentNode.removeChild(_tintEl);
      _tintEl = null;
    }
    if (opts.driftTintEnabled) _ensureTint();

    // ─── Drift 카메라 미세 진동 상태 ───
    function _now() {
      return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }
    var _shakePhase = 0;
    var _shakeTPrev = _now();
    var _shakePulsePeak = 0;       // 현재 펄스 peak amp (rad)
    var _shakePulseStart = 0;      // 펄스 시작 시각 (선형 감쇠 분모)
    var _shakePulseUntil = 0;      // 펄스 종료 시각 (performance.now 기준)
    var _prevDriftVisActive = false;

    // intensity 0~1 → 짧은 burst. 진행 중 펄스보다 약하면 무시 (큰 결 어긋남이 작은 것에 안 덮이게).
    function applyDriftCameraShake(intensity, durationMs) {
      if (!opts.driftShakeEnabled) return;
      var i = Math.max(0, Math.min(1, Number(intensity) || 0));
      if (!(i > 0)) return;
      var peak = i * opts.driftShakePulseMaxAmp;
      var dur = (durationMs && durationMs > 0) ? durationMs : opts.driftShakePulseDurationMs;
      var now = _now();
      if (now < _shakePulseUntil) {
        var span = Math.max(1, _shakePulseUntil - _shakePulseStart);
        var curPeakNow = _shakePulsePeak * ((_shakePulseUntil - now) / span);
        if (peak <= curPeakNow) return;
      }
      _shakePulsePeak = peak;
      _shakePulseStart = now;
      _shakePulseUntil = now + dur;
    }

    // camera.rotation 에만 가산 (position 무수정 — walk_effects 가 position.x/z 를 덮으므로).
    // _fpTick 이 매 프레임 rotation.set(pitch,yaw,0) 으로 리셋 → 누적 없음. walk_effects 의 rotation.y 가산도 보존.
    function _applyDriftShake(cam, depth) {
      if (!opts.driftShakeEnabled || !cam || !cam.rotation) return;
      var now = _now();
      var dt = Math.max(0.001, Math.min(0.1, (now - _shakeTPrev) / 1000));
      _shakeTPrev = now;

      // __lumenDriftVisualizer 펄스 rising edge 자체 폴 → burst
      if (opts.driftShakeFollowVisualizer) {
        var dv = runtime.__lumenDriftVisualizer;
        var dvActive = !!(dv && typeof dv.isActive === 'function' && dv.isActive());
        if (dvActive && !_prevDriftVisActive) applyDriftCameraShake(opts.driftShakeFollowIntensity);
        _prevDriftVisActive = dvActive;
      }

      var ambAmp = Math.min(opts.driftShakeDepthCap, Math.max(0, depth) * opts.driftShakeDepthGain);
      var pulseAmp = 0;
      if (now < _shakePulseUntil) {
        pulseAmp = _shakePulsePeak * ((_shakePulseUntil - now) / Math.max(1, _shakePulseUntil - _shakePulseStart));
      }
      var amp = ambAmp + pulseAmp;
      if (amp <= 1e-6) return;

      _shakePhase += opts.driftShakeFreqHz * 2 * Math.PI * dt;
      if (_shakePhase > Math.PI * 1e4) _shakePhase -= Math.PI * 1e4;
      var p = _shakePhase;
      // 비정수배 주파수 2개 합성 — bob/sway 와 같은 결, 단조 떨림 회피
      var pitch = amp * (Math.sin(p) * 0.62 + Math.sin(p * 1.73 + 0.9) * 0.38);
      var roll  = amp * opts.driftShakeRollRatio * (Math.sin(p * 0.91 + 2.1) * 0.6 + Math.sin(p * 1.57 + 0.3) * 0.4);
      var yaw   = amp * opts.driftShakeYawRatio  * (Math.sin(p * 1.21 + 4.0) * 0.7 + Math.sin(p * 0.67 + 1.4) * 0.3);
      cam.rotation.x = (cam.rotation.x || 0) + pitch;
      cam.rotation.z = (cam.rotation.z || 0) + roll;
      cam.rotation.y = (cam.rotation.y || 0) + yaw;
    }

    function _applyFrame(cam) {
      var fpActive = runtime.isFirstPerson && runtime.isFirstPerson();
      if (!fpActive) {
        // FP 밖 — vignette/tint 해제, fog 원본 복원, shake 위상 리셋
        if (_vignetteEl) _vignetteEl.style.opacity = '0';
        if (_tintEl) _tintEl.style.opacity = '0';
        if (scene.fog) scene.fog.density = _origFogDensity;
        _shakePhase = 0;
        _shakeTPrev = _now();
        _prevDriftVisActive = false;
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

      // ── Drift 조명 색조 (§H8) ──
      if (_tintEl && opts.driftTintEnabled) {
        var to = Math.max(0, Math.min(opts.driftTintMaxOpacity, Math.max(0, depth) * opts.driftTintDepthGain));
        _tintEl.style.opacity = String(to);
      } else if (_tintEl) {
        _tintEl.style.opacity = '0';
      }

      // ── Drift 카메라 미세 진동 (§H8) — 마지막에 (walk_effects 가 이후 rotation.y 가산) ──
      _applyDriftShake(cam, depth);
    }

    // renderer.render wrap (walk_effects 가 이미 wrap 했으면 그 위에 체인됨 → 순서 의존 없음)
    var _origRender = renderer.render.bind(renderer);
    renderer.render = function lumenVisualRender(sceneArg, cameraArg) {
      try { _applyFrame(cameraArg); } catch (e) { /* 연출 실패가 render 막지 않게 */ }
      return _origRender(sceneArg, cameraArg);
    };

    var api = {
      _runtime: runtime,
      setOptions: function (patch) {
        Object.assign(opts, patch || {});
        if (opts.driftTintEnabled) _ensureTint();
      },
      getOptions: function () { return Object.assign({}, opts); },
      getAnchorHeightOffset: function () { return opts.anchorHeightOffset; },
      applyDriftCameraShake: applyDriftCameraShake,
      detach: function () {
        _removeVignette();
        _removeTint();
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

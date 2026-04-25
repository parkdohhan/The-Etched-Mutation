/**
 * Lumen Walk Effects
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260424.md §4 작업 3
 *
 * 1인칭 걸음 연출 5종. 수정 금지 함수(`_fpTick` 외) 원칙 준수:
 *   runtime.tick 을 wrap, _fpTick 실행 **후** camera.position / camera.rotation.y 에 시각 오프셋만 가산.
 *   논리 위치(_fpPos)는 건드리지 않으므로 입력·충돌·지형 높이 계산은 원본 그대로.
 *
 * 제공 효과:
 *   1. Bob            — 보행 중 y-축 sin(진폭은 오염 depth 가산)
 *   2. Headsway       — 보행 중 yaw ±1° sin
 *   3. Breathing      — 정지 시 y-축 1cm, 주기 3~4초 sin
 *   4. Inertia        — 시각 x,z가 논리 위치를 가속 0.3s / 감속 0.2s feel 로 따라감 (지수 smoothing)
 *   5. Step sound     — bob sin 양→음 zero-cross 시 footstep.mp3 재생, playbackRate 5-variant 로테이션
 *
 * 스텝 사운드 "오염 층별 3~5 샘플 로테이션": 현재 단일 샘플(sounds/footstep.mp3) 만 존재.
 *   playbackRate 0.92~1.08 5-variant + gain을 오염 depth 로 감쇠하여 층감 대체 (V2 에서 실 샘플 분리).
 *
 * 사용:
 *   var fx = LumenWalkEffects.attach(runtime, {
 *     contaminationDepthProvider: function () { return game.contState.cont_depth || 0; }
 *   });
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    bobFreqHz: 1.2,              // 보행 진동 1.2 Hz (느린 보행 ≈ 72 발자국/분)
    bobAmp: 0.008,               // 기본 8 mm
    bobDepthGain: 0.10,          // amp *= min(bobDepthCap, 1 + depth * gain)
    bobDepthCap: 2.0,            // depth 폭주 방지 (최대 amp = bobAmp * cap)
    swayFreqHz: 0.6,             // yaw 진동은 bob 의 절반
    swayAmpRad: 0.01745,         // ±1° ≈ 0.01745 rad
    breathFreqHz: 0.3,           // ~3.3초 주기
    breathAmp: 0.01,             // 1 cm
    inertiaTauAccel: 0.10,
    inertiaTauDecel: 0.07,
    moveSpeedThreshold: 0.3,
    contaminationDepthProvider: null,
    // 스텝 합성: sounds/footstep.mp3는 15초짜리 ambient 라 샘플 재생 시 30개 겹침 버그.
    // WebAudio로 thud(sine ramp) + click(filtered noise)를 매 스텝마다 단발 합성.
    stepBaseGain: 0.5,
    stepDepthAttenuation: 0.08,
    stepVariants: 5,             // 주파수 variant 개수 — 로테이션으로 층감
    enableAudio: true
  };

  function attach(runtime, opts) {
    if (!runtime) {
      console.error('[lumen-walk] runtime is required');
      return null;
    }
    if (runtime.__lumenWalkFx) return runtime.__lumenWalkFx;
    opts = Object.assign({}, DEFAULTS, opts || {});

    var _lastPos = { x: 0, z: 0 };
    var _visualPos = { x: 0, z: 0 };
    var _hasInit = false;

    var _bobPhase = 0;
    var _swayPhase = 0;
    var _breathPhase = 0;
    var _prevBobSin = 0;
    var _variantIdx = 0;
    var _tPrev = performance.now();

    // WebAudio: 매 스텝마다 단발 합성 (thud + filtered noise click). 샘플 파일 없음 → 겹침 없음.
    var _audioCtx = null;
    var _audioReady = false;
    var _noiseBuf = null;

    function _ensureAudio() {
      if (!opts.enableAudio || _audioReady) return;
      if (typeof window === 'undefined') return;
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        _audioCtx = _audioCtx || new Ctx();
        // 한 번 평평한 white noise buffer 생성 (300ms) — decay는 gain envelope으로 처리 (loop시 클릭 없음)
        var dur = 0.3;
        var sr = _audioCtx.sampleRate;
        var len = Math.floor(sr * dur);
        _noiseBuf = _audioCtx.createBuffer(1, len, sr);
        var ch = _noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) {
          ch[i] = Math.random() * 2 - 1;
        }
        _audioReady = true;
      } catch (_) {}
    }

    // 흙바닥 발소리 합성: 저역 중심 lowpass noise 한 레이어만.
    //  - highpass grit 제거 (드럼 하이햇처럼 들림)
    //  - lowpass cutoff 를 variant로 약간씩 흔들어 자연스러움
    //  - 짧은 soft 어택 + 80ms decay
    function _playStep(depth) {
      if (!_audioReady || !_audioCtx) return;
      try {
        if (_audioCtx.state === 'suspended') {
          try { _audioCtx.resume(); } catch (_) {}
        }
        var now = _audioCtx.currentTime;
        var g = opts.stepBaseGain - Math.min(0.35, (depth || 0) * opts.stepDepthAttenuation);
        g = Math.max(0.04, g);

        // variant: lowpass cutoff 로테이션 (~320~440 Hz). cutoff 흔들어 동일한 반복 티 제거.
        var cutoffs = [380, 420, 340, 460, 400];
        var cutoff = cutoffs[_variantIdx % opts.stepVariants];
        _variantIdx++;

        var src = _audioCtx.createBufferSource();
        src.buffer = _noiseBuf;
        // 미세한 playback rate 변화로 같은 샘플 재활용 시 반복 티 추가 감소
        var rates = [0.95, 1.02, 0.98, 1.05, 1.00];
        src.playbackRate.value = rates[(_variantIdx + 2) % 5];

        var lp = _audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = cutoff;
        lp.Q.value = 0.4;

        // 아주 낮은 쉘빙으로 바닥감 살짝 보강
        var lowShelf = _audioCtx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 180;
        lowShelf.gain.value = 3;

        var gain = _audioCtx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(g, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);

        src.connect(lp).connect(lowShelf).connect(gain).connect(_audioCtx.destination);
        src.start(now);
        // 300ms buffer → 240ms 재생 (gain envelope이 감쇠 담당)
        src.stop(now + 0.24);
      } catch (_) {}
    }

    function _contDepth() {
      if (typeof opts.contaminationDepthProvider === 'function') {
        try { return Number(opts.contaminationDepthProvider()) || 0; } catch (_) { return 0; }
      }
      return 0;
    }

    // renderer.render 를 wrap — _fpTick 이 원본 tick 안에서 render까지 호출하므로
    // 효과는 render 직전에 찍어야 그 프레임에 반영된다.
    var renderer = runtime.getRenderer && runtime.getRenderer();
    if (!renderer || typeof renderer.render !== 'function') {
      console.warn('[lumen-walk] renderer.render not found — effects disabled');
      return null;
    }

    function _applyEffectsToCamera(cam) {
      if (!cam) return;
      if (!runtime.isFirstPerson || !runtime.isFirstPerson()) {
        _hasInit = false;
        _bobPhase = 0;
        _prevBobSin = 0;
        return;
      }

      var now = performance.now();
      var dt = Math.max(0.001, Math.min(0.1, (now - _tPrev) / 1000));
      _tPrev = now;

      // _fpTick이 직전에 camera.position 을 논리 위치로 세팅함
      var lx = cam.position.x;
      var ly = cam.position.y;
      var lz = cam.position.z;

      if (!_hasInit) {
        _lastPos.x = lx; _lastPos.z = lz;
        _visualPos.x = lx; _visualPos.z = lz;
        _hasInit = true;
        return;
      }

      var dx = lx - _lastPos.x;
      var dz = lz - _lastPos.z;
      var speed = Math.sqrt(dx * dx + dz * dz) / dt;
      var moving = speed > opts.moveSpeedThreshold;
      var depth = _contDepth();

      // ── Inertia (비대칭 smoothing) ─────────────────────────
      var vdx = lx - _visualPos.x;
      var vdz = lz - _visualPos.z;
      var visualSpeed = Math.sqrt(vdx * vdx + vdz * vdz) / dt;
      var tau = (speed >= visualSpeed) ? opts.inertiaTauAccel : opts.inertiaTauDecel;
      var k = 1 - Math.exp(-dt / tau);
      _visualPos.x += (lx - _visualPos.x) * k;
      _visualPos.z += (lz - _visualPos.z) * k;

      // ── Bob (moving) ──────────────────────────────────────
      var bobY = 0;
      var bobSin = 0;
      if (moving) {
        _bobPhase += opts.bobFreqHz * 2 * Math.PI * dt;
        if (_bobPhase > Math.PI * 1e4) _bobPhase -= Math.PI * 1e4;
        bobSin = Math.sin(_bobPhase);
        var depthMul = Math.min(opts.bobDepthCap || 2.0, 1 + depth * opts.bobDepthGain);
        bobY = bobSin * opts.bobAmp * depthMul;
      } else {
        _bobPhase = 0;
      }

      // ── Headsway (moving) ─────────────────────────────────
      var swayYaw = 0;
      if (moving) {
        _swayPhase += opts.swayFreqHz * 2 * Math.PI * dt;
        if (_swayPhase > Math.PI * 1e4) _swayPhase -= Math.PI * 1e4;
        swayYaw = Math.sin(_swayPhase) * opts.swayAmpRad;
      }

      // ── Breathing (idle) ──────────────────────────────────
      var breathY = 0;
      if (!moving) {
        _breathPhase += opts.breathFreqHz * 2 * Math.PI * dt;
        if (_breathPhase > Math.PI * 1e4) _breathPhase -= Math.PI * 1e4;
        breathY = Math.sin(_breathPhase) * opts.breathAmp;
      }

      // ── Step sound: bob sin +→- zero cross ──
      if (moving && _prevBobSin > 0 && bobSin <= 0) {
        _playStep(depth);
      }
      _prevBobSin = bobSin;

      // ── 적용 (camera 가시 오프셋만 수정 — 다음 _fpTick이 reset) ──
      cam.position.x = _visualPos.x;
      cam.position.z = _visualPos.z;
      cam.position.y = ly + bobY + breathY;
      cam.rotation.y = (cam.rotation.y || 0) + swayYaw;

      _lastPos.x = lx;
      _lastPos.z = lz;
    }

    var _origRender = renderer.render.bind(renderer);
    renderer.render = function wrappedRender(scene, camera) {
      try { _applyEffectsToCamera(camera); } catch (e) { /* 연출 실패가 render 막지 않게 */ }
      return _origRender(scene, camera);
    };

    _ensureAudio();

    var api = {
      _runtime: runtime,
      setOptions: function (patch) { Object.assign(opts, patch || {}); },
      getOptions: function () { return Object.assign({}, opts); },
      isReady: function () { return _stepReady; }
    };
    runtime.__lumenWalkFx = api;
    return api;
  }

  global.LumenWalkEffects = { attach: attach };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenWalkEffects;
  }
})(typeof window !== 'undefined' ? window : this);

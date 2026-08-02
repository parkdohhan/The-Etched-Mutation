/**
 * Lumen Walk Effects
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260427.md §4 작업 3
 *
 * 1인칭 걸음 연출 5종. 수정 금지 함수(`_fpTick` 외) 원칙 준수:
 *   runtime.tick 을 wrap, _fpTick 실행 **후** camera.position / camera.rotation.y 에 시각 오프셋만 가산.
 *   논리 위치(_fpPos)는 건드리지 않으므로 입력·충돌·지형 높이 계산은 원본 그대로.
 *
 * 제공 효과:
 *   1. Bob            — 보행 중 y-축 sin(진폭은 오염 depth 가산)
 *   2. Headsway       — 보행 중 yaw ±1° sin
 *   3. Inertia        — 시각 x,z가 논리 위치를 가속 0.3s / 감속 0.2s feel 로 따라감 (지수 smoothing)
 *   4. Step sound     — bob sin 양→음 zero-cross 시 footstep_on_dirt.mp3 (3 segment 자동 분할) 재생.
 *
 * 260731 폐기: Breathing (정지 중 y-축 1cm 호흡). 사용자 결정 — 자이로드롭 재발원.
 *   정지 상태에서만 도는 효과라 render 가 한 프레임에 두 번 불릴 때(= wrap 이중 체인)
 *   moving 판정에 안 걸리고 계속 누적돼 카메라가 크게 출렁였다. 걸음 흔들림은 유지.
 *
 * 스텝 사운드: sounds/footstep_on_dirt.mp3 한 파일에 3개 발자국이 무음 사이로 들어있음.
 *   AudioBuffer 로드 후 amplitude threshold 로 segment 경계 자동 detect → 매 스텝 1 segment 재생.
 *   segment 3-rotation × playback rate 5-variant = 15 조합으로 반복 티 제거.
 *   gain 은 오염 depth 로 감쇠 (층감).
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
    // breathFreqHz / breathAmp — 260731 폐기 (호흡 연출 제거). 재도입 금지.
    inertiaTauAccel: 0.10,
    inertiaTauDecel: 0.07,
    moveSpeedThreshold: 0.3,
    contaminationDepthProvider: null,
    // 스텝: sounds/footstep_on_dirt.mp3 한 샘플에 3개 발이 무음 사이로 들어있음.
    // 로드 후 segment 자동 detect → BufferSource 재생 (segment 3-rotation × playback rate 5-variant).
    stepBaseGain: 0.85,          // 기본 음량 (0.5 였을 땐 depth 감쇠 누적으로 cap 0.15 까지 떨어져 못 들림)
    stepDepthAttenuation: 0.015, // depth 30 → -0.35 (cap), 30 시점 게인 = 0.50. depth 영향 살리되 들리는 영역 유지
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
    var _prevBobSin = 0;
    var _tPrev = performance.now();

    // ── 누적 방지 (260731) ───────────────────────────────────────────
    // 이 모듈은 "_fpTick 이 매 프레임 카메라를 논리 baseline 으로 리셋한다"를 전제로
    // 오프셋만 가산한다. 그 전제가 깨지는 프레임(render 가 한 프레임에 두 번 불리거나
    // _fpTick 없이 render 만 도는 경로)에서는 우리가 쓴 값을 baseline 으로 다시 읽어
    // 오프셋이 무한 누적된다 → 카메라 자이로드롭.
    // 방어: 직전에 써넣은 값과 카메라 현재값이 같으면 그때의 baseline 을 되쓴다.
    var _lastWrittenY = null, _lastBaseY = 0;
    var _lastWrittenRotY = null, _lastBaseRotY = 0;
    function _resetAccumGuard() { _lastWrittenY = null; _lastWrittenRotY = null; }

    // WebAudio: footstep_on_dirt.mp3 (3 발 segment) 로드 후 segment 자동 분할 → 매 스텝 1개 BufferSource 재생.
    var _audioCtx = null;
    var _audioReady = false;
    var _stepBuf = null;
    var _segments = [];          // [{offset:sec, duration:sec}, ...]
    var _segIdx = 0;

    // 무음 detect — amplitude < threshold 가 minSilenceMs 이상 연속이면 segment 경계.
    // 한 발자국 안 작은 spike 가 따로 잘리지 않도록 threshold/minSilence 보수적.
    // 시작/끝 silence 자동 trim, 중간 무음으로 sample 분할, 너무 짧은 segment 필터.
    function _detectSegments(buffer) {
      var ch = buffer.getChannelData(0);
      var sr = buffer.sampleRate;
      var threshold = 0.04;                            // 작은 spike 무시
      var minSilenceSamples = Math.floor(sr * 0.15);   // 150ms 무음 = 경계 (한 발 안 짧은 갭 무시)
      var minSegmentDuration = 0.07;                   // 70ms 미만 segment 폐기 (decay tail 등)
      var segs = [];
      var inSound = false;
      var segStart = 0;
      var silenceCount = 0;
      function _commit(segEnd) {
        var dur = (segEnd - segStart) / sr;
        if (dur >= minSegmentDuration) {
          segs.push({ offset: segStart / sr, duration: dur });
        }
      }
      for (var i = 0; i < ch.length; i++) {
        var loud = Math.abs(ch[i]) > threshold;
        if (loud) {
          if (!inSound) { segStart = i; inSound = true; }
          silenceCount = 0;
        } else {
          silenceCount++;
          if (inSound && silenceCount >= minSilenceSamples) {
            _commit(i - silenceCount);
            inSound = false;
          }
        }
      }
      if (inSound) _commit(ch.length);
      return segs;
    }

    // setInterval / RAF 안에서 만든 AudioContext 는 suspended 상태로 시작 (브라우저 user gesture 정책).
    // 첫 user gesture (click / keydown / touch) 시 resume — _playStep 의 자체 resume() 은 그 후에 효과.
    var _gestureBound = false;
    function _bindResumeOnUserGesture() {
      if (_gestureBound) return;
      _gestureBound = true;
      var resumed = false;
      function _tryResume() {
        if (resumed || !_audioCtx) return;
        if (_audioCtx.state === 'running') { resumed = true; return; }
        try {
          var p = _audioCtx.resume();
          if (p && p.then) p.then(function () {
            resumed = true;
            console.log('[lumen-walk] AudioContext resumed by user gesture, state:', _audioCtx.state);
          });
        } catch (_) {}
      }
      ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(function (ev) {
        window.addEventListener(ev, _tryResume, { passive: true });
      });
    }

    function _ensureAudio() {
      if (!opts.enableAudio || _audioReady) return;
      if (typeof window === 'undefined') return;
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        _audioCtx = _audioCtx || new Ctx();
        _bindResumeOnUserGesture();
        // mp3 fetch + decode (비동기). 로드 전엔 _audioReady=false → _playStep silent skip.
        fetch('sounds/footstep_on_dirt.mp3')
          .then(function (r) { return r.arrayBuffer(); })
          .then(function (ab) { return _audioCtx.decodeAudioData(ab); })
          .then(function (buf) {
            _stepBuf = buf;
            _segments = _detectSegments(buf);
            if (_segments.length === 0) {
              console.warn('[lumen-walk] footstep segment detect 실패 — 전체 1 segment fallback');
              _segments = [{ offset: 0, duration: buf.duration }];
            }
            console.log('[lumen-walk] footstep segments:', _segments.length, 'detected',
              _segments.map(function (s) { return '[' + s.offset.toFixed(3) + 's +' + s.duration.toFixed(3) + 's]'; }).join(' '));
            _audioReady = true;
          })
          .catch(function (err) {
            console.warn('[lumen-walk] footstep mp3 로드 실패:', err);
          });
      } catch (_) {}
    }

    // 흙 발소리: detect 된 segment 중 1개 BufferSource 재생.
    // bob sin 양→음 zero-cross 시 호출 — 재생 latency 거의 0 (Web Audio currentTime 직접).
    // segment 3-rotation × playback rate 5-variant = 15 조합으로 반복 티 제거.
    function _playStep(depth) {
      if (!_audioReady || !_audioCtx || !_stepBuf || _segments.length === 0) return;
      try {
        // 매 호출 resume — 일부 브라우저가 background 진입 시 suspend 함
        if (_audioCtx.state !== 'running') {
          try { _audioCtx.resume(); } catch (_) {}
        }
        var now = _audioCtx.currentTime;
        var g = opts.stepBaseGain - Math.min(0.35, (depth || 0) * opts.stepDepthAttenuation);
        g = Math.max(0.20, g);  // 절대 못 들림 방지 (이전 0.04 는 너무 낮음)

        var seg = _segments[_segIdx % _segments.length];
        var rates = [0.95, 1.02, 0.98, 1.05, 1.00];
        var rate = rates[_segIdx % rates.length];
        _segIdx++;

        var src = _audioCtx.createBufferSource();
        src.buffer = _stepBuf;
        src.playbackRate.value = rate;

        // envelope — 단순화: 0 → g (5ms) → 0.001 (segment 끝)
        // setValueAtTime hold 라인 제거 (자동화 체인 충돌 의심).
        // playDur 최소 50ms 보장 (너무 짧으면 exp ramp 무효).
        var playDur = Math.max(0.05, seg.duration / rate);
        var gain = _audioCtx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(g, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, now + playDur);

        src.connect(gain).connect(_audioCtx.destination);
        // start(when, offset, duration) — silence 영역 무관, segment 만 재생
        src.start(now, seg.offset, seg.duration);
        src.stop(now + playDur + 0.05);
      } catch (e) {
        console.warn('[lumen-walk] _playStep 실패:', e, 'state:', _audioCtx && _audioCtx.state);
      }
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
        _resetAccumGuard();
        return;
      }

      // 씬/대화 오버레이가 떠 있으면 _fpTick 이 freeze 상태로 카메라를 논리 위치에 고정한다
      // (tem_af_strata_terrain.js _fpTick 1215~1224). 이때 효과를 계속 얹으면 _fpTick reset 과
      // 어긋나는 프레임에서 bob y 오프셋이 누적 → 카메라가 위아래로 진동(자이로드롭).
      // _fpTick 과 동일 조건으로 freeze — 읽는 동안 카메라 완전 정지.
      var _sceneOpen = document.getElementById('sceneMode');
      if ((_sceneOpen && _sceneOpen.classList.contains('active')) ||
          document.getElementById('lumenDialogPhase1')) {
        _hasInit = false;
        _bobPhase = 0;
        _prevBobSin = 0;
        _resetAccumGuard();
        return;
      }

      var now = performance.now();
      var dt = Math.max(0.001, Math.min(0.1, (now - _tPrev) / 1000));
      _tPrev = now;

      // _fpTick이 직전에 camera.position 을 논리 위치로 세팅함
      var lx = cam.position.x;
      var ly = cam.position.y;
      var lz = cam.position.z;

      // 누적 가드 — _fpTick 이 y 를 리셋하지 않은 프레임이면(= 카메라 y 가 우리가 쓴 값 그대로)
      // 그때의 baseline 을 되쓴다. 안 그러면 오프셋 위에 오프셋이 얹혀 카메라가 크게 출렁인다.
      if (_lastWrittenY !== null && Math.abs(ly - _lastWrittenY) < 1e-9) ly = _lastBaseY;

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

      // ── Breathing — 260731 폐기 (정지 중 카메라 상하 이동 없음) ──

      // ── Step sound: bob sin +→- zero cross ──
      if (moving && _prevBobSin > 0 && bobSin <= 0) {
        _playStep(depth);
      }
      _prevBobSin = bobSin;

      // ── 적용 (camera 가시 오프셋만 수정 — 다음 _fpTick이 reset) ──
      var baseRotY = cam.rotation.y || 0;
      if (_lastWrittenRotY !== null && Math.abs(baseRotY - _lastWrittenRotY) < 1e-9) baseRotY = _lastBaseRotY;

      cam.position.x = _visualPos.x;
      cam.position.z = _visualPos.z;
      cam.position.y = ly + bobY;
      cam.rotation.y = baseRotY + swayYaw;

      // 누적 가드 기록 — 다음 프레임에 "리셋됐는지" 판별하는 기준
      _lastBaseY = ly;
      _lastWrittenY = cam.position.y;
      _lastBaseRotY = baseRotY;
      _lastWrittenRotY = cam.rotation.y;

      _lastPos.x = lx;
      _lastPos.z = lz;
    }

    // 이중 wrap 차단 (260731) — FP 재진입으로 runtime 이 새로 생기면 __lumenWalkFx 가드가
    // 안 걸려 같은 renderer 에 wrap 이 두 겹 쌓인다. 그러면 render 1회당 효과가 2회 적용돼
    // 오프셋이 누적된다(자이로드롭 재발원). renderer 에 도장을 찍어 한 겹만 유지.
    // wrap 은 한 겹만 만들고, 실제 호출 대상은 renderer 에 얹어 매 attach 마다 최신으로 갈아끼운다
    // (겹만 막으면 재진입 후 걸음 연출이 옛 runtime 을 보고 죽는다).
    renderer.__lumenWalkApply = _applyEffectsToCamera;
    if (!renderer.__lumenWalkWrapped) {
      renderer.__lumenWalkWrapped = true;
      var _origRender = renderer.render.bind(renderer);
      renderer.render = function wrappedRender(scene, camera) {
        try {
          var fn = renderer.__lumenWalkApply;
          if (fn) fn(camera);
        } catch (e) { /* 연출 실패가 render 막지 않게 */ }
        return _origRender(scene, camera);
      };
    } else {
      console.log('[lumen-walk] 기존 render wrap 재사용 — 효과 함수만 교체 (이중 부착 차단)');
    }

    _ensureAudio();

    var api = {
      _runtime: runtime,
      setOptions: function (patch) { Object.assign(opts, patch || {}); },
      getOptions: function () { return Object.assign({}, opts); },
      isReady: function () { return _audioReady; }
    };
    runtime.__lumenWalkFx = api;
    return api;
  }

  global.LumenWalkEffects = { attach: attach };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenWalkEffects;
  }
})(typeof window !== 'undefined' ? window : this);

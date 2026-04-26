/**
 * Lumen Audio Space
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260426.md §4 작업 3c
 *
 * 1인칭 진입 시 3-레이어 공간 음향 합성:
 *   1. Positional whisper — 유령 위치마다 PannerNode(HRTF) + sfx_resonance 루프
 *   2. Noise floor       — Base_white 전역 루프, gain ∝ 오염 depth
 *   3. Depth drone       — Base_Void 전역 루프, gain ∝ 중심 근접도 (1 - r / (R·outerRatio))
 *
 * 구조 원칙:
 *   - _fpTick / _fpPos / _fpEuler 수정 금지. runtime.tick wrap 만.
 *   - walk effects 는 renderer.render 를 wrap → 이 모듈은 runtime.tick 을 wrap (중복 없음).
 *   - THREE는 전역(CDN r128).
 *
 * 제한:
 *   - Whisper 소스는 현재 _fpScenePins accessible pin 위치. memories.ghost_condensation_points 는
 *     DB에 컬럼만 존재하고 play-test 의 memories select 에 미포함. 작업 12-3 Admin UI 완성 후
 *     condensation_points 경로로 확장.
 *
 * 사용:
 *   var audio = LumenAudioSpace.attach(rt, {
 *     contaminationDepthProvider: () => game.contState?.cont_depth || 0,
 *     fallbackPinsProvider: () => _fpScenePins.filter(p => p.accessible).map(p => ({x: p.wx, z: p.wz}))
 *   });
 *   // 기억/핀 변경 시 재구축:
 *   audio.rebuildWhispers();
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    // Positional whisper
    whisperUrl: 'sounds/sfx_resonance.mp3',
    whisperGain: 0.28,
    whisperRefDistance: 2,
    whisperMaxDistance: 20,
    whisperRolloff: 1.6,
    maxWhispers: 6,
    // Noise floor
    noiseUrl: 'sounds/Base_white.mp3',
    noiseDepthSlope: 0.06,     // gain = min(noiseMaxGain, slope × depth)
    noiseMaxGain: 0.25,
    noiseBaseGain: 0.02,       // depth 0 에서도 아주 옅게
    // Depth drone
    droneUrl: 'sounds/Base_Void.mp3',
    droneMaxGain: 0.45,
    droneOuterRatio: 0.55,     // r < R·ratio 에서만 drone 들림
    terrainR: 56,
    // Providers
    contaminationDepthProvider: null,
    ghostPointsProvider: null,
    fallbackPinsProvider: null,
    // Smoothing
    gainLerp: 0.05
  };

  function attach(runtime, opts) {
    if (!runtime) { console.error('[lumen-audio] runtime required'); return null; }
    if (runtime.__lumenAudioSpace) return runtime.__lumenAudioSpace;
    opts = Object.assign({}, DEFAULTS, opts || {});

    var ctx = null;
    var _whisperBuf = null, _noiseBuf = null, _droneBuf = null;
    var _whispers = [];     // [{panner, gain, src, x, z}]
    var _noise = null;      // {src, gain}
    var _drone = null;

    // Three vectors for listener orientation (avoid GC churn)
    var _fwd = null, _up = null;
    if (typeof THREE !== 'undefined') {
      _fwd = new THREE.Vector3();
      _up = new THREE.Vector3();
    }

    function _ensureCtx() {
      if (ctx) return ctx;
      var C = global.AudioContext || global.webkitAudioContext;
      if (!C) return null;
      try { ctx = new C(); } catch (_) { ctx = null; }
      return ctx;
    }

    function _loadBuf(url) {
      return fetch(url)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) { return ctx.decodeAudioData(ab); });
    }

    function _initAmbient() {
      if (_noiseBuf) {
        var nGain = ctx.createGain();
        nGain.gain.value = 0;
        var nSrc = ctx.createBufferSource();
        nSrc.buffer = _noiseBuf;
        nSrc.loop = true;
        nSrc.connect(nGain).connect(ctx.destination);
        try { nSrc.start(); } catch (_) {}
        _noise = { src: nSrc, gain: nGain };
      }
      if (_droneBuf) {
        var dGain = ctx.createGain();
        dGain.gain.value = 0;
        var dSrc = ctx.createBufferSource();
        dSrc.buffer = _droneBuf;
        dSrc.loop = true;
        dSrc.connect(dGain).connect(ctx.destination);
        try { dSrc.start(); } catch (_) {}
        _drone = { src: dSrc, gain: dGain };
      }
    }

    function _teardownWhispers() {
      _whispers.forEach(function (w) {
        try { w.src.stop(); } catch (_) {}
        try { w.src.disconnect(); } catch (_) {}
        try { w.gain.disconnect(); } catch (_) {}
        try { w.panner.disconnect(); } catch (_) {}
      });
      _whispers = [];
    }

    function _rebuildWhispers() {
      if (!ctx || !_whisperBuf) return;
      _teardownWhispers();

      var pts = [];
      if (typeof opts.ghostPointsProvider === 'function') {
        try { pts = opts.ghostPointsProvider() || []; } catch (_) {}
      }
      if ((!pts || pts.length === 0) && typeof opts.fallbackPinsProvider === 'function') {
        try { pts = opts.fallbackPinsProvider() || []; } catch (_) {}
      }
      if (!Array.isArray(pts)) pts = [];
      pts = pts.slice(0, opts.maxWhispers);

      pts.forEach(function (p, i) {
        var panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = opts.whisperRefDistance;
        panner.maxDistance = opts.whisperMaxDistance;
        panner.rolloffFactor = opts.whisperRolloff;
        var px = p.x || 0, pz = p.z || 0;
        if (panner.positionX) {
          panner.positionX.value = px;
          panner.positionY.value = 1.2;
          panner.positionZ.value = pz;
        } else if (panner.setPosition) {
          panner.setPosition(px, 1.2, pz);
        }

        var gain = ctx.createGain();
        gain.gain.value = opts.whisperGain;

        var src = ctx.createBufferSource();
        src.buffer = _whisperBuf;
        src.loop = true;
        // 주파수 미세 변화로 같은 샘플 반복감 줄임
        src.playbackRate.value = 0.85 + (i * 0.04);
        src.connect(gain).connect(panner).connect(ctx.destination);
        // 시작 offset을 분산시켜 모든 유령이 동기 발화하지 않도록
        var offset = (i * 0.73) % Math.max(0.1, _whisperBuf.duration - 0.1);
        try { src.start(0, offset); } catch (_) {}

        _whispers.push({ panner: panner, gain: gain, src: src, x: px, z: pz });
      });
    }

    function _contDepth() {
      if (typeof opts.contaminationDepthProvider === 'function') {
        try { return Number(opts.contaminationDepthProvider()) || 0; } catch (_) { return 0; }
      }
      return 0;
    }

    function _setListenerFromCamera(cam) {
      if (!ctx || !cam) return;
      var L = ctx.listener;
      if (L.positionX) {
        L.positionX.value = cam.position.x;
        L.positionY.value = cam.position.y;
        L.positionZ.value = cam.position.z;
      } else if (L.setPosition) {
        L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      }
      if (_fwd && _up && cam.quaternion) {
        _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
        _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
        if (L.forwardX) {
          L.forwardX.value = _fwd.x; L.forwardY.value = _fwd.y; L.forwardZ.value = _fwd.z;
          L.upX.value = _up.x; L.upY.value = _up.y; L.upZ.value = _up.z;
        } else if (L.setOrientation) {
          L.setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z);
        }
      }
    }

    function _tickFrame() {
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        try { ctx.resume(); } catch (_) {}
      }

      var fpActive = runtime.isFirstPerson && runtime.isFirstPerson();
      if (!fpActive) {
        if (_noise) _noise.gain.gain.value += (0 - _noise.gain.gain.value) * opts.gainLerp;
        if (_drone) _drone.gain.gain.value += (0 - _drone.gain.gain.value) * opts.gainLerp;
        return;
      }

      var cam = runtime.getCamera && runtime.getCamera();
      if (!cam) return;
      _setListenerFromCamera(cam);

      var depth = _contDepth();

      // Noise floor — depth 에 비례, 상한 있음
      if (_noise && !_noise._muted) {
        var tN = Math.min(opts.noiseMaxGain, opts.noiseBaseGain + opts.noiseDepthSlope * depth);
        _noise.gain.gain.value += (tN - _noise.gain.gain.value) * opts.gainLerp;
      }

      // Depth drone — 중심에 가까울수록 크게
      if (_drone && !_drone._muted) {
        var r = Math.sqrt(cam.position.x * cam.position.x + cam.position.z * cam.position.z);
        var outer = opts.terrainR * opts.droneOuterRatio;
        var prox = (r < outer) ? (1 - r / outer) : 0;
        var tD = prox * opts.droneMaxGain;
        _drone.gain.gain.value += (tD - _drone.gain.gain.value) * opts.gainLerp;
      }
    }

    var _origTick = runtime.tick;
    if (typeof _origTick !== 'function') {
      console.warn('[lumen-audio] runtime.tick not found');
      return null;
    }
    runtime.tick = function wrappedTickAudio() {
      var ret = _origTick.apply(runtime, arguments);
      try { _tickFrame(); } catch (_) {}
      return ret;
    };

    // Buffer 병렬 로드 + ambient 시동 + whisper 구축
    _ensureCtx();
    if (ctx) {
      Promise.all([
        _loadBuf(opts.whisperUrl).catch(function () { return null; }),
        _loadBuf(opts.noiseUrl).catch(function () { return null; }),
        _loadBuf(opts.droneUrl).catch(function () { return null; })
      ]).then(function (bufs) {
        _whisperBuf = bufs[0];
        _noiseBuf = bufs[1];
        _droneBuf = bufs[2];
        _initAmbient();
        _rebuildWhispers();
      }).catch(function (e) {
        console.warn('[lumen-audio] buffer load failed', e);
      });
    }

    var api = {
      rebuildWhispers: _rebuildWhispers,
      setOptions: function (patch) { Object.assign(opts, patch || {}); },
      isReady: function () { return !!ctx; },
      _ctx: function () { return ctx; },
      getDebug: function () {
        var cam = runtime.getCamera && runtime.getCamera();
        return {
          ctxState: ctx ? ctx.state : null,
          buffersLoaded: {
            whisper: !!_whisperBuf,
            noise: !!_noiseBuf,
            drone: !!_droneBuf
          },
          whisperCount: _whispers.length,
          whisperPositions: _whispers.map(function (w) { return { x: w.x, z: w.z }; }),
          whisperGain: _whispers[0] ? _whispers[0].gain.gain.value : 0,
          noiseGain: _noise ? _noise.gain.gain.value : 0,
          droneGain: _drone ? _drone.gain.gain.value : 0,
          contDepth: _contDepth(),
          cam: cam ? { x: +cam.position.x.toFixed(2), z: +cam.position.z.toFixed(2), r: +Math.sqrt(cam.position.x * cam.position.x + cam.position.z * cam.position.z).toFixed(2) } : null,
          fpActive: !!(runtime.isFirstPerson && runtime.isFirstPerson())
        };
      },
      muteLayer: function (name, on) {
        var mute = !!on;
        if (name === 'whisper') {
          _whispers.forEach(function (w) { w.gain.gain.value = mute ? 0 : opts.whisperGain; });
        } else if (name === 'noise' && _noise) {
          _noise.gain.gain.setValueAtTime(mute ? 0 : _noise.gain.gain.value, ctx.currentTime);
          if (mute) _noise._muted = true; else _noise._muted = false;
        } else if (name === 'drone' && _drone) {
          _drone.gain.gain.setValueAtTime(mute ? 0 : _drone.gain.gain.value, ctx.currentTime);
          if (mute) _drone._muted = true; else _drone._muted = false;
        }
      }
    };
    runtime.__lumenAudioSpace = api;
    return api;
  }

  global.LumenAudioSpace = { attach: attach };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenAudioSpace;
  }
})(typeof window !== 'undefined' ? window : this);

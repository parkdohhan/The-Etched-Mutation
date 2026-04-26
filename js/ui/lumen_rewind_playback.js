/**
 * Lumen Rewind Playback
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260425.md §4 작업 2-A 후반
 *        + docs/LUMEN_return_components-260421.md §2 (rewind 재생)
 *
 * 어댑터(`runtime.__lumenAdapter`)의 `on('enterVoid')` + `getTrajectory()` 만 사용.
 * 어댑터 코드 자체는 한 글자도 수정하지 않는다.
 *
 * 동작:
 *   1. void 진입 이벤트 수신 → 그 순간의 trajectory snapshot.
 *   2. renderer.render wrap — 매 frame 보간된 카메라 pose(x,h,z,yaw)를 강제 적용.
 *      walk_effects 가 더한 bob/breathing offset 위에 우리 pose 가 덮어쓴다 (호출 순서: render→
 *      rewindWrap → visualWrap → walkWrap → origRender. 우리는 origRender 호출 직전에 pose set
 *      하므로 inner wrapper 들이 그 위에 sub-cm 떨림만 가미).
 *   3. keydown / keyup / mousemove capture phase 차단 — 사용자 입력이 _fpKeys/_fpEuler 에 닿기
 *      전에 stopPropagation. 원본 함수(`_fpTick`, `_fpOnKeyDown`, `_fpOnMouseMove`) 수정 없이
 *      입력 잠금.
 *   4. trajectory[0] 도달 → rewind 종료, on('rewindEnd') emit.
 *
 * 한계:
 *   - playbackSpeed 기본 1.0 (작업 2-A 스코프). 작업 2-B 가 setOptions({playbackSpeed:1.5}) 로 가속.
 *   - rewind 종료 후 자동 exitFirstPerson / fade-to-black 등은 호출자(작업 2-D) 영역.
 *   - pitch 는 trajectory 에 없음 — 마지막 사용자 pitch 유지(mousemove 차단으로 변경 안됨).
 *
 * 사용:
 *   var rw = LumenRewindPlayback.attach(rt, { playbackSpeed: 1.0 });
 *   rw.on('rewindStart', function(p){ ... });
 *   rw.on('rewindEnd',   function(p){ ... });
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    playbackSpeed: 1.0,        // 작업 2-A: 1.0. 작업 2-B 에서 1.5 로 외부 setOptions.
    triggerEvent: 'enterVoid', // null 이면 자동 트리거 안함 (forceStart 만)
    triggerOnce: true,         // 한 세션 1회만
    lockInput: true,           // keydown/keyup/mousemove capture 차단
    minTrajectoryPoints: 2     // 너무 짧은 궤적은 rewind 시작 안함
  };

  function attach(runtime, opts) {
    if (!runtime) {
      console.error('[lumen-rewind] runtime is required');
      return null;
    }
    if (runtime.__lumenRewind) return runtime.__lumenRewind;

    opts = Object.assign({}, DEFAULTS, opts || {});

    var adapter = runtime.__lumenAdapter || null;
    if (!adapter) {
      console.warn('[lumen-rewind] runtime.__lumenAdapter not found — auto-trigger disabled (forceStart 만 사용 가능)');
    }

    var renderer = runtime.getRenderer && runtime.getRenderer();
    if (!renderer || typeof renderer.render !== 'function') {
      console.warn('[lumen-rewind] renderer.render not found — module disabled');
      return null;
    }

    var _rewinding = false;
    var _everTriggered = false;
    var _trajectory = null;
    var _idx = 0;            // backward-walking 인덱스 (현재 segment 의 위쪽 = 시간 큰 쪽)
    var _t0 = 0;             // rewind 시작 시각 (performance.now)
    var _lastT = 0;          // trajectory 마지막 점의 t
    var _firstT = 0;         // trajectory 첫 점의 t
    var _listeners = { rewindStart: [], rewindEnd: [] };

    function on(ev, fn) {
      if (!_listeners[ev] || typeof fn !== 'function') return function () {};
      _listeners[ev].push(fn);
      return function off() {
        var i = _listeners[ev].indexOf(fn);
        if (i >= 0) _listeners[ev].splice(i, 1);
      };
    }
    function emit(ev, payload) {
      var arr = _listeners[ev] || [];
      for (var i = 0; i < arr.length; i++) {
        try { arr[i](payload); } catch (e) { console.error('[lumen-rewind]', ev, e); }
      }
    }

    // ─── input capture (keydown/keyup/mousemove) ───
    function _swallow(e) {
      // FP 모드 + rewinding 일 때만 차단. 그 외엔 통과.
      if (!_rewinding) return;
      e.stopPropagation();
      // keydown 의 경우 preventDefault 까지: 페이지 스크롤·기본 동작 방지.
      if (e.type === 'keydown') { try { e.preventDefault(); } catch (_) {} }
    }
    function _bindLock() {
      if (!opts.lockInput) return;
      document.addEventListener('keydown', _swallow, true);
      document.addEventListener('keyup', _swallow, true);
      document.addEventListener('mousemove', _swallow, true);
    }
    function _unbindLock() {
      document.removeEventListener('keydown', _swallow, true);
      document.removeEventListener('keyup', _swallow, true);
      document.removeEventListener('mousemove', _swallow, true);
    }

    // ─── core: rewind 보간 적용 ───
    function _applyRewindPose() {
      if (!_rewinding || !_trajectory) return;
      var cam = runtime.getCamera && runtime.getCamera();
      if (!cam) return;

      var elapsed = performance.now() - _t0;
      var targetT = _lastT - elapsed * opts.playbackSpeed;

      if (targetT <= _firstT) {
        // 첫 점에 도달 — 마지막 한 번 적용 후 종료
        var p0 = _trajectory[0];
        cam.position.set(p0.x, p0.h, p0.z);
        if (typeof runtime.setYaw === 'function') runtime.setYaw(p0.yaw);
        _stopRewind('reached_start');
        return;
      }

      // _idx 는 현재 segment 의 큰 쪽(b). targetT < trajectory[_idx-1].t 이면 한 칸 내림.
      while (_idx > 1 && _trajectory[_idx - 1].t > targetT) {
        _idx--;
      }
      var b = _trajectory[_idx];
      var a = _trajectory[_idx - 1];
      if (!a || !b) return;

      var dt = b.t - a.t;
      var alpha = dt > 0 ? (targetT - a.t) / dt : 0;
      if (alpha < 0) alpha = 0; else if (alpha > 1) alpha = 1;

      var x = a.x + (b.x - a.x) * alpha;
      var z = a.z + (b.z - a.z) * alpha;
      var h = a.h + (b.h - a.h) * alpha;

      // yaw shortest-path lerp
      var dy = b.yaw - a.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      var yaw = a.yaw + dy * alpha;

      cam.position.set(x, h, z);
      if (typeof runtime.setYaw === 'function') runtime.setYaw(yaw);
    }

    // ─── render wrap ───
    // chain 끝(가장 바깥)에 추가. 호출 순서:
    //   renderer.render() → rewindWrap → (visualWrap → walkWrap → origRender)
    // rewindWrap 은 inner.call 직전에 cam pose set → inner wrapper 들이 그 위에 미세 offset 가미.
    var _origRender = renderer.render.bind(renderer);
    renderer.render = function wrappedRender() {
      if (_rewinding) _applyRewindPose();
      return _origRender.apply(renderer, arguments);
    };

    // ─── trigger ───
    function _startRewind(reason) {
      if (_rewinding) return false;
      if (opts.triggerOnce && _everTriggered) return false;
      if (!runtime.isFirstPerson || !runtime.isFirstPerson()) return false;

      var traj = (adapter && typeof adapter.getTrajectory === 'function')
        ? adapter.getTrajectory() : null;
      if (!traj || traj.length < opts.minTrajectoryPoints) {
        console.warn('[lumen-rewind] trajectory too short — skip', traj && traj.length);
        return false;
      }

      _trajectory = traj;
      _idx = traj.length - 1;
      _lastT = traj[traj.length - 1].t;
      _firstT = traj[0].t;
      _t0 = performance.now();
      _rewinding = true;
      _everTriggered = true;
      _bindLock();
      emit('rewindStart', {
        reason: reason || 'manual',
        trajectoryLength: traj.length,
        durationEstimate: Math.round((_lastT - _firstT) / opts.playbackSpeed)
      });
      return true;
    }

    function _stopRewind(reason) {
      if (!_rewinding) return;
      _rewinding = false;
      _unbindLock();
      emit('rewindEnd', {
        reason: reason || 'manual',
        elapsed: Math.round(performance.now() - _t0)
      });
    }

    // adapter enterVoid 자동 구독
    if (adapter && opts.triggerEvent && typeof adapter.on === 'function') {
      adapter.on(opts.triggerEvent, function (p) {
        _startRewind(opts.triggerEvent);
      });
    }

    // FP 종료 시 강제 정리 (사용자가 esc 등으로 일찍 끝낼 경우)
    if (adapter && typeof adapter.on === 'function') {
      adapter.on('exit', function () {
        if (_rewinding) _stopRewind('fp_exit');
      });
    }

    var api = {
      on: on,
      isRewinding: function () { return _rewinding; },
      forceStart: function () { return _startRewind('force'); },
      forceStop: function () { _stopRewind('force'); },
      setOptions: function (next) {
        if (!next) return;
        Object.keys(next).forEach(function (k) {
          if (k in DEFAULTS) opts[k] = next[k];
        });
      },
      getOptions: function () { return Object.assign({}, opts); },
      _runtime: runtime
    };
    runtime.__lumenRewind = api;
    return api;
  }

  global.LumenRewindPlayback = { attach: attach };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenRewindPlayback;
  }
})(typeof window !== 'undefined' ? window : this);

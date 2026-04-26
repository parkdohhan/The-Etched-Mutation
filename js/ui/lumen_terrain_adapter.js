/**
 * Lumen Terrain Adapter
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260426.md §4 작업 0
 *
 * 기존 TemAfStrataTerrain 런타임(js/shared/tem_af_strata_terrain.js)을 감싸는 어댑터.
 * - 원본 함수(enterFirstPerson, exitFirstPerson, _fpTick, gH, buildMemoryItems, computeAfTerrainFields)
 *   한 글자도 수정하지 않는다. runtime의 public API만 import / wrap.
 * - 제공 기능:
 *   1. 궤적 기록 (기본 150ms 간격, {t,x,z,h,yaw} push)
 *   2. onEnterVoid / onExitVoid 이벤트 (반경 < 0.1R 경계 통과 시)
 *   3. exitFirstPerson 오버라이드 — 종료 시 궤적·void 도달 여부·세션 길이 payload로 on('exit')에 emit.
 *   호출자(PLAY 흐름)는 payload를 받아 plays.spatial_trajectory / unreturned_flag로 저장.
 *
 * SCOPE §1 준수:
 *   오염 → 이동 커플링은 수행하지 않는다. 샘플 라벨링 용으로만 getContamination 콜백 옵션 제공.
 *
 * 사용:
 *   var rt = TemAfStrataTerrain.createStrataTerrain(THREE, canvas, opts);
 *   rt.init();
 *   var lumen = LumenTerrainAdapter.attach(rt, {
 *     sampleMs: 150,
 *     terrainR: 56,
 *     voidFactor: 0.1,
 *     getContamination: function(){ return contaminationTracker.snapshot(); }
 *   });
 *   lumen.on('enterVoid', function(p){ console.log('void dwell start at', p); });
 *   lumen.on('exit', function(r){
 *     supabase.from('plays').update({
 *       spatial_trajectory: r.trajectory,
 *       unreturned_flag: r.voidEntered && !r.returned
 *     });
 *   });
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    terrainR: 56,         // SZ/2 (tem_af_strata_terrain.js:610 SZ=112과 일치해야 함)
    voidFactor: 0.1,      // 0.1 × R = 5.6 유닛 이내 = void
    sampleMs: 150,
    includeContamination: false,
    getContamination: null
  };

  function attach(runtime, opts) {
    if (!runtime) {
      console.error('[lumen-adapter] runtime is required');
      return null;
    }
    if (runtime.__lumenAdapter) return runtime.__lumenAdapter;

    opts = Object.assign({}, DEFAULTS, opts || {});
    var terrainR = opts.terrainR;
    var voidRadius = terrainR * opts.voidFactor;
    var sampleMs = opts.sampleMs;

    var _trajectory = [];
    var _lastSampleAt = 0;
    var _enterTimestamp = 0;
    var _inVoid = false;
    var _voidEverEntered = false;
    var _listeners = { enterVoid: [], exitVoid: [], sample: [], enter: [], exit: [] };

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
        try { arr[i](payload); } catch (e) { console.error('[lumen-adapter]', ev, e); }
      }
    }

    function reset() {
      _trajectory = [];
      _lastSampleAt = 0;
      _enterTimestamp = 0;
      _inVoid = false;
      _voidEverEntered = false;
    }

    function radiusOf(x, z) { return Math.sqrt(x * x + z * z); }

    function sampleOnce() {
      if (!runtime.isFirstPerson || !runtime.isFirstPerson()) return;
      var cam = runtime.getCamera && runtime.getCamera();
      if (!cam) return;

      var now = performance.now();
      if (_lastSampleAt && now - _lastSampleAt < sampleMs) return;
      _lastSampleAt = now;

      var x = cam.position.x;
      var z = cam.position.z;
      var yaw = (runtime.getYaw && runtime.getYaw()) || 0;
      var t = Math.round(now - _enterTimestamp);
      var r = radiusOf(x, z);

      var point = {
        t: t,
        x: +x.toFixed(3),
        z: +z.toFixed(3),
        h: +cam.position.y.toFixed(3),
        yaw: +yaw.toFixed(4)
      };
      if (opts.includeContamination && typeof opts.getContamination === 'function') {
        try { point.cont = opts.getContamination(); } catch (_) {}
      }
      _trajectory.push(point);
      emit('sample', point);

      // void radius 경계 통과만 이벤트
      if (r < voidRadius && !_inVoid) {
        _inVoid = true;
        _voidEverEntered = true;
        emit('enterVoid', { t: t, x: x, z: z, radius: r });
      } else if (r >= voidRadius && _inVoid) {
        _inVoid = false;
        emit('exitVoid', { t: t, x: x, z: z, radius: r });
      }
    }

    // ─── wrap: runtime.tick ───
    // 원본 tick은 FP 모드일 때 _fpTick을 호출한 뒤 렌더까지 수행. 뒤에 샘플 한 번 추가.
    var _origTick = runtime.tick;
    if (typeof _origTick !== 'function') {
      console.warn('[lumen-adapter] runtime.tick not found — sampling disabled');
    } else {
      runtime.tick = function wrappedTick() {
        var r = _origTick.apply(runtime, arguments);
        sampleOnce();
        return r;
      };
    }

    // ─── wrap: enterFirstPerson ───
    // 새 세션 시작 시 궤적 리셋 + 타임스탬프 기록.
    var _origEnter = runtime.enterFirstPerson;
    if (typeof _origEnter === 'function') {
      runtime.enterFirstPerson = function wrappedEnter() {
        reset();
        _enterTimestamp = performance.now();
        var ret = _origEnter.apply(runtime, arguments);
        emit('enter', { at: _enterTimestamp });
        return ret;
      };
    }

    // ─── wrap: exitFirstPerson ───
    // 종료 전 궤적 flush. 원본은 뒤에 호출(카메라 복원 등이 원본 로직).
    var _origExit = runtime.exitFirstPerson;
    if (typeof _origExit === 'function') {
      runtime.exitFirstPerson = function wrappedExit() {
        // FP 비활성 상태에서 중복 호출되면 원본만 실행
        if (!runtime.isFirstPerson || !runtime.isFirstPerson()) {
          return _origExit.apply(runtime, arguments);
        }
        // 종료 직전 마지막 샘플 한 번 강제 (sampleMs 간격 무시)
        _lastSampleAt = 0;
        sampleOnce();

        var payload = {
          trajectory: _trajectory.slice(),
          voidEntered: _voidEverEntered,
          duration: Math.round(performance.now() - _enterTimestamp),
          samples: _trajectory.length
        };
        emit('exit', payload);

        return _origExit.apply(runtime, arguments);
      };
    }

    var api = {
      on: on,
      reset: reset,
      getTrajectory: function () { return _trajectory.slice(); },
      isInVoid: function () { return _inVoid; },
      voidEverEntered: function () { return _voidEverEntered; },
      terrainR: terrainR,
      voidRadius: voidRadius,
      _runtime: runtime
    };
    runtime.__lumenAdapter = api;
    return api;
  }

  global.LumenTerrainAdapter = { attach: attach };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenTerrainAdapter;
  }
})(typeof window !== 'undefined' ? window : this);

/**
 * Lumen Footprints — Quilt 데모용 발자국 시각화
 *
 * 두 모드:
 *   explore — 사용자 신장 절반 이상 떨어진 자리마다 발자국 (왼/오른 교대), 3초 fade-out
 *   return  — accessiblePinIds.size === 0 시 quilt.startReturn() 자동 호출 후,
 *             trajectory 역순 점들을 차곡차곡 출현 (1초당 ~1.4개), fade 없음 (영구)
 *
 * 모양: Canvas로 그린 발바닥 outline texture (etched/음각 톤)
 *
 * 사용:
 *   var fp = LumenFootprints.attach(runtime, {
 *     quilt: function () { return runtime.__quiltDemo; },
 *     getAccessibleCount: function () { return game.accessiblePinIds && game.accessiblePinIds.size; },
 *     onDoorReached: function () { ... ending ... },
 *   });
 *
 * 의존: runtime.getScene/getCamera/getYaw/isFirstPerson/tick wrap, runtime.__lumenAdapter, THREE
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    strideDistance: 0.85,        // 신장 절반 (1.7m / 2)
    footWidth: 0.10,             // 발 모양 가로 10cm
    footLength: 0.22,            // 발 모양 세로 22cm
    footSideOffset: 0.12,        // 진행 방향 직각 좌우 offset (왼/오른발 거리/2)
    footprintOpacity: 0.75,
    groundY: 0.02,               // z-fighting 회피용 살짝 위
    exploreFadeMs: 3000,
    returnInitialCount: 7,
    returnAppearIntervalMs: 700,
    doorRadius: 2.0,
    quilt: null,                 // 필수 (함수)
    getAccessibleCount: null,
    onDoorReached: null,
  };

  // ─── 발자국 texture (한 번만 생성, 좌/우 두 장) ───
  function _makeFootCanvas(side /* 'L'|'R' */) {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 128);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    // 발바닥 (큰 타원)
    ctx.beginPath();
    ctx.ellipse(32, 76, 14, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    // 발가락 자리 살짝 잘록 (어두운 그림자 효과)
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    // 5개 발가락 (작은 점) — 방향(side)에 따라 엄지 위치 좌/우
    var thumbSide = (side === 'L') ? -1 : 1; // 왼발은 엄지 안쪽(오른쪽), 오른발 반대
    var toes = [
      { dx: thumbSide * 9,  dy: 36, r: 5 }, // 엄지
      { dx: thumbSide * 4,  dy: 30, r: 3 },
      { dx: 0,              dy: 28, r: 3 },
      { dx: -thumbSide * 4, dy: 30, r: 3 },
      { dx: -thumbSide * 8, dy: 32, r: 3 },
    ];
    for (var i = 0; i < toes.length; i++) {
      var t = toes[i];
      ctx.beginPath();
      ctx.ellipse(32 + t.dx, 76 - t.dy, t.r, t.r * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }

  function attach(runtime, opts) {
    if (!runtime) { console.error('[lumen-footprints] runtime required'); return null; }
    if (runtime.__lumenFootprints) return runtime.__lumenFootprints;

    var THREE = global.THREE;
    if (!THREE) { console.error('[lumen-footprints] THREE not loaded'); return null; }

    opts = Object.assign({}, DEFAULTS, opts || {});
    if (typeof opts.quilt !== 'function') {
      console.error('[lumen-footprints] opts.quilt must be a function');
      return null;
    }
    var getQuilt = opts.quilt;
    var getAccessibleCount = typeof opts.getAccessibleCount === 'function'
      ? opts.getAccessibleCount : function () { return 1; };

    var scene = runtime.getScene && runtime.getScene();
    if (!scene) { console.error('[lumen-footprints] runtime.getScene returned null'); return null; }

    // ─── 모양 — 발 texture 두 장 (L, R) + plane geometry 공유 ───
    var texL = new THREE.CanvasTexture(_makeFootCanvas('L'));
    var texR = new THREE.CanvasTexture(_makeFootCanvas('R'));
    texL.needsUpdate = true; texR.needsUpdate = true;
    var geometry = new THREE.PlaneGeometry(opts.footWidth, opts.footLength);
    geometry.rotateX(-Math.PI / 2); // 지면 평평

    function _makeMaterial(side) {
      return new THREE.MeshBasicMaterial({
        map: (side === 'L') ? texL : texR,
        transparent: true,
        opacity: opts.footprintOpacity,
        depthWrite: false,
        side: THREE.DoubleSide,        // 위/아래 어느 쪽에서 봐도 보이게 (backface cull 방지)
        polygonOffset: true,           // 지형 표면과 z-fighting/가림 방지 — 카메라 쪽으로 살짝 당김
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
    }

    // 지형 표면 높이 — 형제 모듈(scene_ghosts/_gH, mannequins)과 같은 runtime.gH 사용.
    // gH 가 봉우리/구덩이로 출렁이므로 발자국 Y 를 지면에 스냅해야 묻히거나 뜨지 않는다.
    function _groundY(x, z) {
      if (typeof runtime.gH === 'function') {
        try {
          var gy = Number(runtime.gH(x, z));
          if (!isFinite(gy)) gy = 0;
          if (gy < -10) gy = -10;       // terrain 1인칭 카메라와 동일 clamp (tem_af_strata_terrain)
          return gy;
        } catch (_) { return 0; }
      }
      return 0;
    }

    // ─── 상태 ───
    var _lastStampPos = null;
    var _activeStamps = [];      // {mesh, material, createdAt, permanent}
    var _returnQueue = null;
    var _returnLastAppearAt = 0;
    var _doorTriggered = false;
    var _footSide = 'L';         // 다음 박을 발 (시작은 왼발)
    var _prevMode = 'explore';   // 세션 재진입(return/done→explore) 감지용

    function _stampAt(x, z, yaw, permanent) {
      var side = _footSide;
      var mat = _makeMaterial(side);
      var mesh = new THREE.Mesh(geometry, mat);
      // 진행 방향 직각 좌우 offset (왼발 -, 오른발 +)
      var sideSign = (side === 'L') ? -1 : 1;
      var off = opts.footSideOffset * sideSign;
      var sideAngle = yaw + Math.PI / 2;
      var ox = Math.sin(sideAngle) * off;
      var oz = Math.cos(sideAngle) * off;
      // Y 를 지형 표면에 스냅 (+groundY 오프셋으로 살짝 위) — 상수 고정 시 봉우리에 묻히고 골짜기엔 떴음
      var py = _groundY(x + ox, z + oz) + opts.groundY;
      mesh.position.set(x + ox, py, z + oz);
      // PlaneGeometry는 xy 평면 기본, rotateX(-π/2)로 xz로 눕힘. yaw로 진행 방향 회전.
      mesh.rotation.y = yaw;
      mesh.renderOrder = 2;            // 지형(0) 위에 그려 가림 최소화
      scene.add(mesh);
      _activeStamps.push({
        mesh: mesh, material: mat,
        createdAt: performance.now(),
        permanent: !!permanent,
      });
      _footSide = (side === 'L') ? 'R' : 'L';
    }

    // ─── 거리 thinning (return queue 초기화용 — 단위 테스트 시 같은 로직 사용) ───
    function _thinTrajectory(traj, stride) {
      if (!traj || !traj.length) return [];
      var picked = [traj[0]];
      for (var i = 1; i < traj.length; i++) {
        var last = picked[picked.length - 1];
        var dx = traj[i].x - last.x, dz = traj[i].z - last.z;
        if (Math.sqrt(dx * dx + dz * dz) >= stride) picked.push(traj[i]);
      }
      return picked;
    }

    function _initReturnQueue() {
      var adapter = runtime.__lumenAdapter;
      var traj = (adapter && typeof adapter.getTrajectory === 'function') ? adapter.getTrajectory() : [];
      var picked = _thinTrajectory(traj, opts.strideDistance);
      if (!picked.length) {
        console.warn('[lumen-footprints] trajectory empty — return queue not initialized');
        return;
      }
      // 역순 — 가장 최근부터 시작점 방향
      var reversed = picked.slice().reverse();
      // 초기 N개 즉시 출현
      var initial = Math.min(opts.returnInitialCount, reversed.length);
      // return 모드 발자국은 좌우 toggle 유지 (탐색 중과 같은 양식)
      for (var k = 0; k < initial; k++) {
        var p = reversed.shift();
        _stampAt(p.x, p.z, p.yaw || 0, true);
      }
      _returnQueue = reversed;
      _returnLastAppearAt = performance.now();
      console.log('[lumen-footprints] return queue init — picked=' + picked.length + ', initial=' + initial + ', remaining=' + reversed.length);
    }

    // ─── 매 tick ───
    var _origTick = runtime.tick;
    if (typeof _origTick === 'function') {
      runtime.tick = function () {
        var r = _origTick.apply(runtime, arguments);
        try { _step(); } catch (e) { console.warn('[lumen-footprints] tick err', e); }
        return r;
      };
    } else {
      console.warn('[lumen-footprints] runtime.tick not found — disabled');
    }

    function _step() {
      var quilt = getQuilt();
      if (!quilt) return;
      if (!runtime.isFirstPerson || !runtime.isFirstPerson()) return;
      var cam = runtime.getCamera && runtime.getCamera();
      if (!cam) return;

      var now = performance.now();
      var mode = quilt.getSnapshot().mode;
      var yaw = (runtime.getYaw && runtime.getYaw()) || 0;

      // 세션 재진입 감지 — 이전이 return/done 인데 지금 explore 면 새 세션 → 상태/발자국 정리
      // (데모를 닫지 않고 메모리 바꿔 재진입하면 quilt 인스턴스는 새로 생기지만 footprints 는 살아남음)
      if (mode === 'explore' && (_prevMode === 'return' || _prevMode === 'done')) {
        _resetState();
      }
      _prevMode = mode;

      // explore 중 accessiblePinIds 0 검사 → 자동 startReturn + return queue 초기화
      if (mode === 'explore') {
        var n = 0;
        try { n = getAccessibleCount(); } catch (_) { n = 1; }
        if (typeof n === 'number' && n === 0) {
          quilt.startReturn();
          _initReturnQueue();
          mode = quilt.getSnapshot().mode;
          console.log('[lumen-footprints] accessiblePinIds=0 → return mode');
        }
      }

      // 발자국 박기
      if (mode === 'explore') {
        if (!_lastStampPos) {
          // 첫 발자국 — 시작점에 즉시 박음 (출발 자리 표시)
          _stampAt(cam.position.x, cam.position.z, yaw, false);
          _lastStampPos = { x: cam.position.x, z: cam.position.z };
        } else {
          var dx = cam.position.x - _lastStampPos.x;
          var dz = cam.position.z - _lastStampPos.z;
          if (Math.sqrt(dx * dx + dz * dz) >= opts.strideDistance) {
            _stampAt(cam.position.x, cam.position.z, yaw, false);
            _lastStampPos = { x: cam.position.x, z: cam.position.z };
          }
        }
      } else if (mode === 'return') {
        // 시간 기반 출현
        if (_returnQueue && _returnQueue.length > 0 && (now - _returnLastAppearAt) >= opts.returnAppearIntervalMs) {
          var p = _returnQueue.shift();
          _stampAt(p.x, p.z, p.yaw || 0, true);
          _returnLastAppearAt = now;
        }
        // 문 도달 검사 (큐 비고 시작점 근접)
        if (!_doorTriggered && _returnQueue && _returnQueue.length === 0) {
          var adapter = runtime.__lumenAdapter;
          var traj = (adapter && typeof adapter.getTrajectory === 'function') ? adapter.getTrajectory() : [];
          if (traj.length) {
            var start = traj[0];
            var ddx = cam.position.x - start.x;
            var ddz = cam.position.z - start.z;
            if (Math.sqrt(ddx * ddx + ddz * ddz) <= opts.doorRadius) {
              _doorTriggered = true;
              console.log('[lumen-footprints] door reached');
              if (typeof opts.onDoorReached === 'function') {
                try { opts.onDoorReached(); } catch (e) { console.warn('[lumen-footprints] onDoorReached err', e); }
              }
            }
          }
        }
      }

      // fade-out (explore 비영구 발자국만)
      for (var i = _activeStamps.length - 1; i >= 0; i--) {
        var s = _activeStamps[i];
        if (s.permanent) continue;
        var age = now - s.createdAt;
        if (age >= opts.exploreFadeMs) {
          scene.remove(s.mesh);
          s.material.dispose();
          _activeStamps.splice(i, 1);
        } else {
          s.material.opacity = opts.footprintOpacity * (1 - age / opts.exploreFadeMs);
        }
      }
    }

    // 세션 상태 + 화면 발자국 초기화 (인스턴스/리소스는 유지 — dispose 와 다름)
    function _resetState() {
      _activeStamps.forEach(function (s) {
        scene.remove(s.mesh);
        s.material.dispose();
      });
      _activeStamps = [];
      _lastStampPos = null;
      _returnQueue = null;
      _returnLastAppearAt = 0;
      _doorTriggered = false;
      _footSide = 'L';
      console.log('[lumen-footprints] state reset (재진입)');
    }

    function dispose() {
      _activeStamps.forEach(function (s) {
        scene.remove(s.mesh);
        s.material.dispose();
      });
      _activeStamps = [];
      geometry.dispose();
      texL.dispose(); texR.dispose();
      delete runtime.__lumenFootprints;
    }

    var api = {
      dispose: dispose,
      reset: _resetState,
      getActiveCount: function () { return _activeStamps.length; },
      getReturnRemaining: function () { return _returnQueue ? _returnQueue.length : -1; },
      _thinTrajectory: _thinTrajectory,    // 단위 테스트용
      _forceReturn: function () {
        var quilt = getQuilt();
        if (!quilt) return false;
        quilt.startReturn();
        _initReturnQueue();
        return true;
      },
    };
    runtime.__lumenFootprints = api;
    console.log('[lumen-footprints] attached');
    return api;
  }

  global.LumenFootprints = { attach: attach };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenFootprints;
  }
})(typeof window !== 'undefined' ? window : this);

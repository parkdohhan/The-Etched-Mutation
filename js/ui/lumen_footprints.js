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
    footWidth: 0.30,             // 가로 30cm — 큰 사람 발 크기
    footLength: 0.75,            // 세로 75cm — 시각 강조 위해 실 발(28cm)의 ~2.7배
    footSideOffset: 0.18,        // 좌우 발 간격 36cm
    footprintOpacity: 1.0,
    eyeHeight: 1.6,              // 1인칭 카메라(머리)에서 발까지 빼는 값. strata 카메라가 지면 + 1.6m 자리라고 가정.
    groundY: 0.04,               // 발 위로 살짝 띄움 (z-fighting 회피, depthTest=false 와 짝)
    exploreFadeMs: 3000,
    returnInitialCount: 7,
    returnAppearIntervalMs: 700,
    doorRadius: 2.0,
    quilt: null,                 // 필수 (함수)
    getAccessibleCount: null,
    onDoorReached: null,
    texturePath: 'img/footprint.png', // 사용자 발자국 이미지 (한 장, 좌발은 가로 mirror)
  };

  // 발자국 texture는 사용자가 그린 PNG (img/footprint.png) 로드.
  // 좌발은 mesh.scale.x = -1 로 가로 mirror 처리 → texture 한 장만 필요.

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

    // ─── 모양 — 사용자 발자국 시트 (4쌍=8칸) 비동기 로드 → 좌/우 4개씩 array ───
    var FP_PAIRS = 4;                 // 가로 4쌍
    var FP_TINT = '#888';             // 발자국 회색 톤 (검정 원본 → source-in 으로 회색화)
    var texturesL = [];               // 좌발 4개 변주 (CanvasTexture)
    var texturesR = [];               // 오른발 4개 변주
    var _texReady = false;
    (function _loadSheet() {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var cellW = img.width / (FP_PAIRS * 2);  // 8칸 균등 분할
        var cellH = img.height;
        for (var i = 0; i < FP_PAIRS * 2; i++) {
          var c = document.createElement('canvas');
          c.width = cellW; c.height = cellH;
          var cx = c.getContext('2d');
          // 1) 원본 칸 그리기
          cx.drawImage(img, i * cellW, 0, cellW, cellH, 0, 0, cellW, cellH);
          // 2) 회색 톤으로 갈음 — 발자국 alpha 영역만 남기고 회색으로 fill
          cx.globalCompositeOperation = 'source-in';
          cx.fillStyle = FP_TINT;
          cx.fillRect(0, 0, cellW, cellH);
          cx.globalCompositeOperation = 'source-over';
          var tex = new THREE.CanvasTexture(c);
          tex.needsUpdate = true;
          // 시트의 각 쌍 = [왼발, 오른발]. 8칸으로 나누면 짝수칸(0,2,4,6)=왼발, 홀수칸(1,3,5,7)=오른발.
          // (이전엔 rotation.y 의 +π 가 텍스처를 좌우 거울시켜 분류를 뒤집어야 했으나,
          //  +π 제거(2026-06-13)로 거울이 사라져 시트 그대로 직접 매핑한다.)
          if (i % 2 === 0) texturesL.push(tex);
          else texturesR.push(tex);
        }
        _texReady = true;
        console.log('[lumen-footprints] sheet loaded — L=' + texturesL.length + ', R=' + texturesR.length);
      };
      img.onerror = function () {
        console.error('[lumen-footprints] failed to load ' + opts.texturePath);
      };
      img.src = opts.texturePath;
    })();

    var geometry = new THREE.PlaneGeometry(opts.footWidth, opts.footLength);
    geometry.rotateX(-Math.PI / 2); // 지면 평평

    function _pickTexture(side) {
      var set = (side === 'L') ? texturesL : texturesR;
      if (!set.length) return null; // 시트 아직 로드 전
      return set[Math.floor(Math.random() * set.length)];
    }

    function _makeMaterial(side) {
      // polygonOffset: 발자국을 카메라 쪽으로 살짝 당겨 굴곡 지형 표면에 밀착 (z-fighting/가림 방지)
      // depthWrite=false: 뒤따라오는 투명 오브젝트와 깊이 충돌 안 함
      // DoubleSide: 1인칭 카메라가 발자국 plane 어느 쪽에서 보든 보이게
      return new THREE.MeshBasicMaterial({
        map: _pickTexture(side),
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

    // 진단 패널 — 화면 좌상단에 모듈 상태 실시간 표시. 관객용 화면에 노출되지 않도록
    // 2026-07-08부터 URL 플래그(?debug=1)가 있을 때만 생성한다. 패널이 null 이면 하단의
    // 갱신 블록(if (_debugPanel))도 자동으로 건너뛴다. 개발 시 ?debug=1 로 복구.
    var _debugPanel = null;
    var _fpDebugOn = false;
    try { _fpDebugOn = typeof location !== 'undefined' && /[?&]debug=1\b/.test(location.search); } catch (_) {}
    try {
      if (_fpDebugOn && typeof document !== 'undefined' && document.body) {
        _debugPanel = document.createElement('div');
        _debugPanel.id = 'fp-debug-panel';
        _debugPanel.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;'
          + 'background:rgba(0,0,0,0.82);color:#fff;font:11px/1.4 monospace;'
          + 'padding:6px 10px;border:1px solid #ff5555;pointer-events:none;'
          + 'min-width:240px;border-radius:3px';
        _debugPanel.textContent = '[FP] attached, waiting for first tick';
        document.body.appendChild(_debugPanel);
      }
    } catch (e) { console.warn('[lumen-footprints] debug panel fail', e); }

    // y 파라미터: 박는 자리의 절대 높이. null/undefined 면 opts.groundY (절대값) 사용.
    // 1인칭 굴곡 지형 위에선 호출처에서 cam.position.y - 눈높이 + opts.groundY 를 던진다.
    // moveDir: {x,z} 정규화 이동 방향. 정지/첫 발자국이면 null.
    function _stampAt(x, z, yaw, permanent, y, moveDir) {
      var side = _footSide;
      var mat = _makeMaterial(side);
      var mesh = new THREE.Mesh(geometry, mat);
      // 발끝(yaw)에 대한 직각 좌우 offset (왼발 -, 오른발 +)
      var sideSign = (side === 'L') ? -1 : 1;
      var off = opts.footSideOffset * sideSign;
      var sideAngle = yaw + Math.PI / 2;
      var ox = Math.sin(sideAngle) * off;
      var oz = Math.cos(sideAngle) * off;
      // 전후 디딤 offset — 실제 사람은 디딤발이 '가는 방향'으로 보폭 절반 나가 착지한다.
      // 뒷걸음질이면 moveDir 이 몸 뒤를 가리키므로 발자국이 몸 뒤에 디뎌져 직진과 구분된다.
      // 발끝(rotation.y)은 건드리지 않음 → 뒤로 가도 발끝은 몸 보는 쪽(앞) 유지 (실제 사람).
      var fx = 0, fz = 0;
      if (moveDir) {
        var lead = opts.strideDistance * 0.5;
        fx = moveDir.x * lead;
        fz = moveDir.z * lead;
      }
      // 좌우 offset + 전후 디딤을 반영한 최종 착지 좌표
      var sx = x + ox + fx;
      var sz = z + oz + fz;
      // Y 를 지형 표면에 스냅 (+groundY 오프셋으로 살짝 위) — 상수 고정 시 봉우리에 묻히고 골짜기엔 떴음 (6b802c8 버그수정)
      var py = _groundY(sx, sz) + opts.groundY;
      mesh.position.set(sx, py, sz);
      // PlaneGeometry(xy평면) → rotateX(-π/2) 후 텍스처 발끝(+y)이 local -z 로 눕는다.
      // rotation.y = yaw 이면 local -z 가 월드 forward(몸이 보는 방향)를 향함 = 발끝이 몸 정면.
      // 뒷걸음질 시 발끝은 몸 정면(가던 방향 반대) → 뒤꿈치가 플레이어 쪽으로 온다.
      // (이전엔 +π 가 붙어 발끝이 정반대=카메라 쪽을 향하는 버그였음. 2026-06-13 수정)
      mesh.rotation.y = yaw;
      mesh.renderOrder = 2;            // 지형(0) 위에 그려 가림 최소화 (polygonOffset 와 짝)
      // [TEMP 2026-05-29] frustum culling 우회 — 작은 plane 이 카메라 시야 가장자리에서 잘려나가는 걸 방지
      mesh.frustumCulled = false;
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
      // 초기 출현 자리의 발 높이 — 현재 카메라 발 기준 (큐의 점에 y 있으면 거기 우선)
      var cam = runtime.getCamera && runtime.getCamera();
      var camFootY = cam ? (cam.position.y - opts.eyeHeight + opts.groundY) : opts.groundY;
      // return 모드 발자국은 좌우 toggle 유지 (탐색 중과 같은 양식)
      for (var k = 0; k < initial; k++) {
        var p = reversed.shift();
        var py = (typeof p.y === 'number') ? (p.y + opts.groundY) : camFootY;
        _stampAt(p.x, p.z, p.yaw || 0, true, py);
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

      // 발 높이 = 카메라(머리) y - 눈높이 + 살짝 위. 굴곡 위 걸을 때마다 매번 다름.
      var footY = cam.position.y - opts.eyeHeight + opts.groundY;

      // 발자국 박기
      if (mode === 'explore') {
        if (!_lastStampPos) {
          // 첫 발자국 — 시작점에 즉시 박음 (정지 상태 → 전후 offset 없음)
          _stampAt(cam.position.x, cam.position.z, yaw, false, footY, null);
          _lastStampPos = { x: cam.position.x, z: cam.position.z };
        } else {
          var dx = cam.position.x - _lastStampPos.x;
          var dz = cam.position.z - _lastStampPos.z;
          var dist = Math.sqrt(dx * dx + dz * dz);
          if (dist >= opts.strideDistance) {
            // 직전 발자국 → 현재 위치 방향 = 실제 걸어간 방향 (앞/뒤/옆 모두)
            var moveDir = { x: dx / dist, z: dz / dist };
            _stampAt(cam.position.x, cam.position.z, yaw, false, footY, moveDir);
            _lastStampPos = { x: cam.position.x, z: cam.position.z };
          }
        }
      } else if (mode === 'return') {
        // 시간 기반 출현 — 큐의 점에 y가 있으면 그 자리, 없으면 현재 발 높이
        if (_returnQueue && _returnQueue.length > 0 && (now - _returnLastAppearAt) >= opts.returnAppearIntervalMs) {
          var p = _returnQueue.shift();
          var py = (typeof p.y === 'number') ? (p.y + opts.groundY) : footY;
          _stampAt(p.x, p.z, p.yaw || 0, true, py);
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

      // [TEMP 2026-05-29] 디버그 패널 갱신 — 평가 끝나면 제거
      if (_debugPanel) {
        var q = getQuilt();
        var camPos = cam ? ('(' + cam.position.x.toFixed(1) + ', ' + cam.position.y.toFixed(2) + ', ' + cam.position.z.toFixed(1) + ')') : '?';
        var lastFp = _activeStamps.length ? _activeStamps[_activeStamps.length - 1].mesh.position : null;
        var lastPos = lastFp ? ('(' + lastFp.x.toFixed(1) + ', ' + lastFp.y.toFixed(2) + ', ' + lastFp.z.toFixed(1) + ')') : '-';
        _debugPanel.innerHTML =
          '[FP] mode=' + (q ? q.getSnapshot().mode : 'no-quilt')
          + ' fp=' + (runtime.isFirstPerson && runtime.isFirstPerson() ? 'on' : 'off')
          + ' active=' + _activeStamps.length
          + ' queue=' + (_returnQueue ? _returnQueue.length : '-')
          + '<br>cam=' + camPos
          + '<br>lastFp=' + lastPos
          + ' pins=' + (function () { try { return getAccessibleCount(); } catch (_) { return '?'; } })();
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
      texturesL.forEach(function (t) { t.dispose(); });
      texturesR.forEach(function (t) { t.dispose(); });
      texturesL = []; texturesR = [];
      // [TEMP 2026-05-29] 디버그 패널 정리
      if (_debugPanel && _debugPanel.parentNode) {
        _debugPanel.parentNode.removeChild(_debugPanel);
      }
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

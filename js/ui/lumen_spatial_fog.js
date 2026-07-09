/**
 * Lumen Spatial Fog — 공간 안개 해제 B안 (지점별 마스크 + 회랑)
 *
 * ADDITIVE & FLAG-GATED. flag: ?spatial_fog=1 또는 localStorage.tem_spatial_fog='1'
 * test/fog-reveal-test.html 검증분 이식.
 *
 * 역할 분담:
 *   - 셰이더(그리기 규칙)는 tem_af_strata_terrain.js 의 _sfPatchShader 가 담당.
 *     전역 공유 uniform(__temSpatialFogUniforms)을 모든 지형 재질이 바인딩.
 *   - 이 모듈은 "걷힌 자리 목록"(원=지역, 선분=회랑)과 애니메이션을 관리해
 *     매 프레임 uniform 에 숫자를 흘려보낸다 (render wrap — 프로젝트 표준 패턴).
 *
 * 연출 타이밍 (테스트 페이지와 동일):
 *   - 지역 개화: 반경 0→R 을 3000ms easeInOut (lumen_replay_fog animMs 와 동일)
 *   - 회랑: 끝점이 1600ms 동안 전진하며 안개를 가른 뒤, 목적지 지역이 개화
 *   - 뭉게 숨쉬기: heavy 밀도가 두 사인파로 호흡 (replay fog 와 동일 상수)
 *
 * API (attach 반환):
 *   seed(x, z[, r])            — 즉시 열린 지역 (런 시작 지점용, 애니메이션 없음)
 *   open(fx, fz, tx, tz[, r])  — 회랑 파임 → 지역 개화 (unlock 연출)
 *   openAt(x, z[, r])          — 회랑 없이 지역만 개화
 *   revealAt(x, z) → 0..1      — 그 좌표의 걷힘 정도 (유령/핀 투명도 게이팅용, 3단계 소비)
 *   liftAll()                  — 안개 전부 걷기 (막다른 자리 fallback — 원칙 4)
 *   clear() / detach()
 *
 * v0 정직 노트: 목록이 MAX(24)를 넘으면 가장 오래된 자리부터 잘려 다시 안개에
 * 덮인다. 씬 12개쯤의 런까지는 안 잘림. 넘는 런이 실제로 나오면 그때 병합 전략.
 *
 * Rollback: 이 파일 + play-test.html attach 블록 + terrain 파일 _sf 블록 삭제.
 */
(function (global) {
  'use strict';

  var FLAG_KEY = 'tem_spatial_fog';

  // ───────────────────────── flag (tem_replay_terrain.js 와 동일 방식) ──
  var _enabled = null;
  function isEnabled() {
    if (_enabled != null) return _enabled;
    var q = '';
    try { q = (global.location && global.location.search) || ''; } catch (_) {}
    var on = null;
    if (/[?&]spatial_fog=1/.test(q)) on = true;
    else if (/[?&]spatial_fog=0/.test(q)) on = false;
    if (on != null) {
      try { global.localStorage.setItem(FLAG_KEY, on ? '1' : '0'); } catch (_) {}
    } else {
      try { on = global.localStorage && global.localStorage.getItem(FLAG_KEY) === '1'; }
      catch (_) { on = false; }
    }
    _enabled = !!on;
    if (_enabled) {
      console.log('[spatial-fog] ON — 공간 안개 B안 활성. 끄기: LumenSpatialFog.setEnabled(false) 또는 ?spatial_fog=0');
    }
    return _enabled;
  }
  function setEnabled(v) {
    _enabled = !!v;
    try { global.localStorage.setItem(FLAG_KEY, v ? '1' : '0'); } catch (_) {}
  }

  var DEFAULTS = {
    regionRadius: 16,     // 열린 지역 원 반경 (world units)
    corridorRadius: 5,    // 회랑 반폭
    regionMs: 3000,       // 지역 개화 시간
    corridorMs: 1600,     // 회랑 파임 시간 (이후 지역 개화 시작)
    heavyDensity: 0.055,  // 안 열린 곳의 안개 밀도 (벽 수준)
    liftMs: 3000,         // liftAll 소요 시간
    wobbleAmp: 0.10,      // 뭉게 숨쉬기 (replay fog 와 동일한 두 사인파)
    wobbleAmp2: 0.06,
    bloomTriggerDist: 7,  // openOnArrive: 플레이어가 이 거리 안에 오면 지역 개화
    moveSlowBelow: 0.35,  // 걷힘 정도가 이 아래인 곳부터 걸음이 느려짐 (0 = 정지)
  };

  function _now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function _ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function attach(runtime, opts) {
    if (!runtime || runtime.__lumenSpatialFog) return runtime && runtime.__lumenSpatialFog;
    opts = Object.assign({}, DEFAULTS, opts || {});

    var U = global.__temSpatialFogUniforms;
    if (!U) { console.warn('[spatial-fog] 공유 uniform 없음 — tem_af_strata_terrain.js 로드/버전 확인'); return null; }
    var scene = runtime.getScene && runtime.getScene();
    var renderer = runtime.getRenderer && runtime.getRenderer();
    if (!scene || !renderer || typeof renderer.render !== 'function') {
      console.warn('[spatial-fog] runtime 준비 안 됨 — not attached');
      return null;
    }

    // reveal 항목: { ax, az, bx, bz, kind: 'circle'|'corridor', t0, target }
    // circle 은 a==b (점), corridor 는 a→b 선분. t0 이 미래면 아직 대기(회랑 뒤 개화).
    var _reveals = [];
    var _lift = 0;          // 0 = 안개 정상, 1 = 전부 걷힘
    var _lifting = false;
    var _liftT0 = 0;
    var _detached = false;
    var _overflowWarned = false;

    U.uOn.value = 1;
    U.uHeavyD.value = opts.heavyDensity;

    // 시각(now) 기준 실제 적용값 — 회랑은 끝점 전진, 원은 반경 성장
    function _effective(rp, now) {
      var e = now - rp.t0;
      if (e < 0) return null; // 아직 시작 전
      if (rp.kind === 'corridor') {
        var p = _ease(Math.min(1, e / opts.corridorMs));
        return { ax: rp.ax, az: rp.az, bx: rp.ax + (rp.bx - rp.ax) * p, bz: rp.az + (rp.bz - rp.az) * p, r: rp.target };
      }
      var k = _ease(Math.min(1, e / opts.regionMs));
      return { ax: rp.ax, az: rp.az, bx: rp.bx, bz: rp.bz, r: rp.target * k };
    }

    function seed(x, z, r) {
      _reveals.push({ ax: x, az: z, bx: x, bz: z, kind: 'circle', t0: _now() - opts.regionMs, target: r || opts.regionRadius });
      console.log('[spatial-fog] seed — 즉시 열린 지역 (' + Math.round(x) + ',' + Math.round(z) + ')');
    }
    function openAt(x, z, r) {
      _reveals.push({ ax: x, az: z, bx: x, bz: z, kind: 'circle', t0: _now(), target: r || opts.regionRadius });
      console.log('[spatial-fog] openAt — 지역 개화 시작 (' + Math.round(x) + ',' + Math.round(z) + ')');
    }
    function open(fromX, fromZ, toX, toZ, r) {
      var now = _now();
      _reveals.push({ ax: fromX, az: fromZ, bx: toX, bz: toZ, kind: 'corridor', t0: now, target: opts.corridorRadius });
      _reveals.push({ ax: toX, az: toZ, bx: toX, bz: toZ, kind: 'circle', t0: now + opts.corridorMs, target: r || opts.regionRadius });
      console.log('[spatial-fog] open — 회랑 파임, ' + opts.corridorMs + 'ms 후 지역 개화 (' + Math.round(toX) + ',' + Math.round(toZ) + ')');
    }
    // 회랑만 파기 (지역 개화 없음) — openOnArrive 와 짝
    function carve(fromX, fromZ, toX, toZ) {
      _reveals.push({ ax: fromX, az: fromZ, bx: toX, bz: toZ, kind: 'corridor', t0: _now(), target: opts.corridorRadius });
      console.log('[spatial-fog] carve — 회랑 (' + Math.round(fromX) + ',' + Math.round(fromZ) + ')→(' + Math.round(toX) + ',' + Math.round(toZ) + ')');
    }
    // 도착 개화: 플레이어가 (x,z) 근처에 오면 그 지역이 개화한다
    var _pending = [];   // { x, z, r, trigger }
    function openOnArrive(x, z, r, triggerDist) {
      _pending.push({ x: x, z: z, r: r || opts.regionRadius, trigger: triggerDist || opts.bloomTriggerDist });
    }
    function liftAll() {
      if (_lifting || _lift >= 1) return;
      _lifting = true;
      _liftT0 = _now();
      console.log('[spatial-fog] 안개 전부 걷힘 시작 — 지나온 길이 드러난다');
    }

    // 그 좌표의 걷힘 정도 0..1 — 셰이더와 같은 식 (edge noise 제외).
    // 유령/핀/소리 게이팅이 이 하나를 공유해야 시각과 상호작용이 안 어긋난다.
    function revealAt(x, z) {
      if (_lift >= 1) return 1;
      var now = _now();
      var rv = 0;
      for (var i = 0; i < _reveals.length; i++) {
        var ef = _effective(_reveals[i], now);
        if (!ef || ef.r < 0.01) continue;
        var pax = x - ef.ax, paz = z - ef.az;
        var bax = ef.bx - ef.ax, baz = ef.bz - ef.az;
        var dd = Math.max(bax * bax + baz * baz, 1e-6);
        var h = Math.min(1, Math.max(0, (pax * bax + paz * baz) / dd));
        var dx = pax - bax * h, dz = paz - baz * h;
        var d = Math.sqrt(dx * dx + dz * dz);
        var e = (d - ef.r * 0.55) / (ef.r * 0.45);
        rv = Math.max(rv, 1 - Math.min(1, Math.max(0, e)));
      }
      return Math.max(rv, _lift);
    }

    // ── 소프트 이동 차단: 안개 경계에서 몇 걸음 헤치다 멈춘다 ─────────
    // tem_af_strata_terrain 의 _fpTick 이 global.__temSpatialFogConstrain 을
    // 매 걸음 호출 (없으면 무동작). null 반환 = 자유 이동.
    // 갇힘 방지: 더 맑은 쪽으로 가는 걸음은 항상 통과시킨다.
    function constrainMove(fx, fz, tx, tz) {
      if (_lift >= 1) return null;
      var SLOW = opts.moveSlowBelow;
      var rvTo = revealAt(tx, tz);
      if (rvTo >= SLOW) return null;
      var rvFrom = revealAt(fx, fz);
      var k = Math.max(0, rvTo / SLOW);           // 0(정지) .. 1(자유)
      if (rvTo >= rvFrom - 1e-6) k = Math.max(k, 0.6);
      return { x: fx + (tx - fx) * k, z: fz + (tz - fz) * k };
    }
    global.__temSpatialFogConstrain = constrainMove;

    // ── 게이트: 안개 속 물체(유령·말풍선 등) 숨김/페이드 ─────────────
    // 등록 조건: visible 을 다른 시스템이 안 만지는 물체만 (마네킨 root 등).
    // entry: { x, z, object, fade } — fade=false 면 visible 만 조절 (opacity 는
    // 다른 모듈이 매 프레임 쓰는 물체용, 예: 혼잣말 sprite).
    var _gateProvider = null;
    var _gated = [];   // 게이트가 만진 물체 (detach 시 복원용)
    function _gateMats(obj) {
      var mats = obj.userData.__sfGateMats;
      if (mats) return mats;
      mats = [];
      obj.traverse(function (o) {
        if (o.isSprite) return;               // sprite opacity 는 남이 씀
        var m = o.material;
        if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach(function (mm) {
          if (mm.transparent && typeof mm.opacity === 'number') mats.push({ m: mm, base: mm.opacity });
        });
      });
      obj.userData.__sfGateMats = mats;
      return mats;
    }
    function _gateFrame() {
      if (!_gateProvider) return;
      var list = null;
      try { list = _gateProvider() || []; } catch (_) { return; }
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var obj = it && it.object;
        if (!obj) continue;
        if (!obj.userData.__sfGateTracked) { obj.userData.__sfGateTracked = true; _gated.push(obj); }
        var rv = revealAt(it.x, it.z);
        if (rv <= 0.05) { obj.visible = false; continue; }
        obj.visible = true;
        if (it.fade === false) continue;
        var k = Math.min(1, (rv - 0.05) / 0.65);
        var mats = _gateMats(obj);
        for (var j = 0; j < mats.length; j++) mats[j].m.opacity = mats[j].base * k;
      }
    }
    function _gateRestore() {
      for (var i = 0; i < _gated.length; i++) {
        var obj = _gated[i];
        obj.visible = true;
        var mats = obj.userData.__sfGateMats;
        if (mats) { for (var j = 0; j < mats.length; j++) mats[j].m.opacity = mats[j].base; }
        delete obj.userData.__sfGateTracked;
        delete obj.userData.__sfGateMats;
      }
      _gated.length = 0;
    }

    // ── 매 프레임: 목록 → uniform (render wrap) ──
    function _frame() {
      var now = _now();
      var t = now / 1000;
      var MAX = U.MAX;
      var startIdx = Math.max(0, _reveals.length - MAX);
      if (startIdx > 0 && !_overflowWarned) {
        _overflowWarned = true;
        console.warn('[spatial-fog] 열린 자리 ' + _reveals.length + '개 > MAX ' + MAX + ' — 가장 오래된 자리부터 다시 안개에 덮임');
      }
      var n = 0;
      for (var i = startIdx; i < _reveals.length; i++) {
        var ef = _effective(_reveals[i], now);
        if (!ef) continue;
        U.uSeg.value[n].set(ef.ax, ef.az, ef.bx, ef.bz);
        U.uRad.value[n] = ef.r;
        n++;
      }
      U.uCount.value = n;
      U.uTime.value = t;

      if (_lifting) {
        _lift = Math.min(1, (now - _liftT0) / opts.liftMs);
        if (_lift >= 1) { _lifting = false; console.log('[spatial-fog] 안개 전부 걷힘'); }
      }
      // heavy 밀도 = 숨쉬기, lift 진행 시 현재 clear 밀도(오염 모듈레이션 포함)로 수렴
      var breathe = 1 + opts.wobbleAmp * Math.sin(t * 0.37) + opts.wobbleAmp2 * Math.sin(t * 1.31 + 2.2);
      var clearD = (scene.fog && typeof scene.fog.density === 'number') ? scene.fog.density : 0.006;
      var eased = _ease(_lift);
      U.uHeavyD.value = (opts.heavyDensity * breathe) * (1 - eased) + clearD * eased;

      // 도착 개화 검사 — FP 카메라 위치 = 플레이어 위치
      if (_pending.length) {
        var cam = runtime.getCamera && runtime.getCamera();
        if (cam) {
          for (var p = _pending.length - 1; p >= 0; p--) {
            var pd = _pending[p];
            var pdx = cam.position.x - pd.x, pdz = cam.position.z - pd.z;
            if (pdx * pdx + pdz * pdz < pd.trigger * pd.trigger) {
              _pending.splice(p, 1);
              openAt(pd.x, pd.z, pd.r);
              console.log('[spatial-fog] 도착 개화 — (' + Math.round(pd.x) + ',' + Math.round(pd.z) + ')');
            }
          }
        }
      }

      _gateFrame();
    }

    var _origRender = renderer.render.bind(renderer);
    renderer.render = function spatialFogRender(sceneArg, cameraArg) {
      if (!_detached) {
        try { _frame(); } catch (_) { /* 연출 실패가 render 막지 않게 */ }
      }
      return _origRender(sceneArg, cameraArg);
    };

    console.log('[spatial-fog] attached — 공간 안개 ON (열린 자리 0개 = 전부 안개). seed()/open() 으로 걷기');

    var api = {
      seed: seed,
      open: open,
      openAt: openAt,
      carve: carve,
      openOnArrive: openOnArrive,
      liftAll: liftAll,
      revealAt: revealAt,
      count: function () { return _reveals.length; },
      isLifted: function () { return _lift >= 1; },
      setGateProvider: function (fn) { _gateProvider = (typeof fn === 'function') ? fn : null; },
      clear: function () { _reveals.length = 0; _pending.length = 0; _lift = 0; _lifting = false; _overflowWarned = false; U.uCount.value = 0; },
      detach: function () {
        _detached = true;
        U.uOn.value = 0;
        U.uCount.value = 0;
        _gateRestore();
        _gateProvider = null;
        if (global.__temSpatialFogConstrain === constrainMove) global.__temSpatialFogConstrain = null;
        runtime.__lumenSpatialFog = null;
      },
    };
    runtime.__lumenSpatialFog = api;
    return api;
  }

  global.LumenSpatialFog = { attach: attach, isEnabled: isEnabled, setEnabled: setEnabled };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenSpatialFog;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

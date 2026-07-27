/**
 * Lumen Spatial Fog — 공간 안개 해제 B안 (지점별 마스크 + 회랑)
 *
 * 기본 ON (260713 — 깃발 뒤에 숨은 핵심 연출 해방). 끄기는 디버그 전용:
 * ?spatial_fog=0 또는 localStorage.tem_spatial_fog='0'.
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

  // ───────────────────────── flag ──────────────────────────────────────
  // 260713: 기본 ON. 안개=벽은 작품의 지각 조건이라 관객 설정에 기대면 안 됨.
  // 끄기는 디버그 전용 opt-out (?spatial_fog=0 / localStorage '0').
  var _enabled = null;
  function isEnabled() {
    if (_enabled != null) return _enabled;
    var q = '';
    try { q = (global.location && global.location.search) || ''; } catch (_) {}
    var off = null;
    if (/[?&]spatial_fog=0/.test(q)) off = true;
    else if (/[?&]spatial_fog=1/.test(q)) off = false;
    if (off != null) {
      try { global.localStorage.setItem(FLAG_KEY, off ? '0' : '1'); } catch (_) {}
    } else {
      try { off = global.localStorage && global.localStorage.getItem(FLAG_KEY) === '0'; }
      catch (_) { off = false; }
    }
    _enabled = !off;
    if (!_enabled) {
      console.log('[spatial-fog] OFF (디버그 opt-out) — 켜기: ?spatial_fog=1 또는 LumenSpatialFog.setEnabled(true)');
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
    liftMs: 3000,         // liftAll 소요 시간
    bloomTriggerDist: 7,  // openOnArrive: 플레이어가 이 거리 안에 오면 지역 개화
    // ── 안개 벽 (260712 사용자 요구: "벽처럼 못 보는 영역을 확실히 가리게") ──
    wallStrength: 0.985,  // 안 열린 곳이 가려지는 정도. 1 = 완전히 안 보임. 거리 무관.
    wallBreathe: 0.012,   // 벽 세기의 아주 옅은 숨쉬기
    moveBlockBelow: 0.15, // 걷힘이 이 아래인 자리로는 못 간다 (벽). 벽면 슬라이드는 허용.
    // ── 하늘 돔 ──
    // 260712: 눈앞을 가리는 볼륨 안개 판 7겹은 삭제("디지털 풍화처럼 보인다"). 돔만 남김.
    airFog: true,         // false 면 하늘 돔도 끔 (지형 안개 벽만)
    skyBlendMax: 0.92,    // 지평선이 안개색으로 녹는 최대 정도 (머리 위 감정 하늘은 보존)
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
    U.uWall.value = opts.wallStrength;

    // ── 하늘 돔 ──
    // 260712: "눈앞을 가리는 볼륨 안개 판" 7겹은 **삭제**됨. 사용자 판정 —
    //   "안개가 아니라 디지털 풍화처럼 생겼다". 안개의 역할은 눈앞을 뿌옇게 하는 게 아니라
    //   **못 가는 영역을 벽처럼 확실히 가리는 것**(지형 셰이더의 _sfWall 이 담당).
    //   여기 남는 건 하늘 돔 하나 — 지평선을 안개색으로 녹여 벽이 하늘까지 이어져 보이게 한다.
    //   (돔이 없으면 안개 벽 위로 검은 하늘이 칼같이 잘려 벽이 "땅에 칠한 물감"이 된다.)
    var THREE = global.THREE;
    var _skyDome = null, _skyDomeMat = null;
    var _skyC = null, _origBgHex = null, _origFogHex = null;
    // try/catch — 하늘 돔이 터져도 지형 벽(본체)은 살아야 한다.
    if (opts.airFog && THREE) try {
      _skyC = new THREE.Color(U.uSky.value.getHex());
      if (scene.background && scene.background.isColor) _origBgHex = scene.background.getHex();
      if (scene.fog && scene.fog.color) _origFogHex = scene.fog.color.getHex();

      // 하늘 돔 — 지평선은 안개색, 머리 위는 원래 하늘(감정색). 진짜 안개의 수직 그라데이션.
      // 배경색을 통째로 물들이면 밤하늘·별이 죽는다 (260712 검증).
      _skyDomeMat = new THREE.ShaderMaterial({
        uniforms: {
          uZenith: { value: new THREE.Color(_origBgHex != null ? _origBgHex : 0x12121a) },
          uHorizon: { value: _skyC.clone() },
          uAmt: { value: 0 },
        },
        vertexShader: [
          'varying vec3 vDir;',
          'void main() {',
          '  vDir = normalize(position);',
          '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uZenith;',
          'uniform vec3 uHorizon;',
          'uniform float uAmt;',
          'varying vec3 vDir;',
          'void main() {',
          '  float t = smoothstep(-0.03, 0.40, vDir.y);',   // 지평선 0 → 위 1
          '  vec3 fogged = mix(uHorizon, uZenith, t);',
          '  gl_FragColor = vec4(mix(uZenith, fogged, uAmt), 1.0);',
          '}',
        ].join('\n'),
        side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      });
      _skyDome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), _skyDomeMat);
      _skyDome.renderOrder = -10000;   // 배경 대신 맨 먼저 화면을 채운다
      _skyDome.frustumCulled = false;
      scene.add(_skyDome);

      console.log('[spatial-fog] 하늘 돔 ON — 지평선이 안개색으로 녹는다 (눈앞 볼륨 판은 260712 삭제)');
    } catch (eAir) {
      console.warn('[spatial-fog] 하늘 돔 실패 — 지형 안개 벽만 동작 (무해)', eAir);
      if (_skyDome) { scene.remove(_skyDome); _skyDome = null; _skyDomeMat = null; }
    }

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
        var e = Math.min(1, Math.max(0, (d - ef.r * 0.55) / (ef.r * 0.45)));
        // 셰이더와 같은 smoothstep 곡선 — 보이는 안개 경계와 막히는 벽이 어긋나지 않게.
        rv = Math.max(rv, 1 - e * e * (3 - 2 * e));
      }
      return Math.max(rv, _lift);
    }

    // ── 안개 벽: 이동 차단 (260712 — "안개로 다가갔을 때 못 가게") ─────
    // tem_af_strata_terrain 의 _fpTick 이 global.__temSpatialFogConstrain 을
    // 매 걸음 호출 (없으면 무동작). null 반환 = 자유 이동.
    //
    // 예전(소프트 감속)은 벽으로 안 읽혔다 — 느려질 뿐 계속 들어가졌음.
    // 지금: 걷힘이 blockBelow 아래인 자리로는 **못 간다**. 대신 벽에 끼이지 않게
    //   (1) 벽면을 따라 미끄러지고(슬라이드)  (2) 더 맑은 쪽 걸음은 언제나 통과.
    var _wallEps = 0.7;   // 걷힘 기울기 측정 간격
    // 벽에 닿은 순간(이동이 실제로 막히거나 꺾인 순간) 외부에 알림 —
    // play-test 가 안개 자막("아직 떠오르지 않은 기억이다" 등)을 띄우는 데 쓴다.
    // 쿨다운·문구 선택은 받는 쪽 책임. 미등록이면 무동작.
    function _notifyWallTouch() {
      var cb = global.__temSpatialFogOnWallTouch;
      if (typeof cb === 'function') { try { cb(); } catch (_) {} }
    }
    function constrainMove(fx, fz, tx, tz) {
      if (_lift >= 1) return null;
      var BLOCK = opts.moveBlockBelow;
      var rvTo = revealAt(tx, tz);
      if (rvTo >= BLOCK) return null;                       // 열린 자리 — 자유
      var rvFrom = revealAt(fx, fz);
      if (rvTo > rvFrom + 1e-4) return null;                // 맑은 쪽으로 = 항상 허용 (갇힘 방지)

      // 걷힘의 기울기 = 맑은 쪽을 가리키는 방향 = 벽의 법선
      var nx = revealAt(fx + _wallEps, fz) - revealAt(fx - _wallEps, fz);
      var nz = revealAt(fx, fz + _wallEps) - revealAt(fx, fz - _wallEps);
      var nl = Math.sqrt(nx * nx + nz * nz);
      var mx = tx - fx, mz = tz - fz;
      if (nl < 1e-5) { _notifyWallTouch(); return { x: fx, z: fz }; }  // 기울기 없음(벽 한복판) — 정지

      nx /= nl; nz /= nl;
      var into = mx * nx + mz * nz;                          // <0 이면 벽 쪽으로 밀고 있음
      if (into < 0) { mx -= nx * into; mz -= nz * into; }    // 벽 성분 제거 → 벽면 따라 미끄러짐
      var sx = fx + mx, sz = fz + mz;
      _notifyWallTouch();
      if (revealAt(sx, sz) < BLOCK * 0.75) return { x: fx, z: fz };  // 미끄러져도 벽 속 — 정지
      return { x: sx, z: sz };
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
      // 안개 벽의 세기 — 아주 옅게 숨쉬고, liftAll 진행 시 0 으로 사라진다.
      var eased = _ease(_lift);
      var breathe = 1 + opts.wallBreathe * Math.sin(t * 0.37) + opts.wallBreathe * 0.6 * Math.sin(t * 1.31 + 2.2);
      U.uWall.value = Math.max(0, Math.min(1, opts.wallStrength * breathe)) * (1 - eased);

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

      // ── 하늘 돔 갱신 ──
      // distFog = 내 주위 "멀리"가 얼마나 안개인가 (링 샘플). 걷힌 자리에 서서 안개 벽을
      // 바라볼 때도 지평선은 뿌예야 하므로, 카메라가 선 자리만 봐서는 안 된다.
      if (_skyDomeMat) {
        var camA = runtime.getCamera && runtime.getCamera();
        if (camA) {
          var camFog = (1 - revealAt(camA.position.x, camA.position.z)) * (1 - eased);
          var distFog = 0;
          for (var rq = 0; rq < 8; rq++) {                   // 8방위 × 2거리 = 16점 (비용 미미)
            var ang = rq * Math.PI / 4;
            var cA = Math.cos(ang), sA = Math.sin(ang);
            distFog += 1 - revealAt(camA.position.x + cA * 34, camA.position.z + sA * 34);
            distFog += 1 - revealAt(camA.position.x + cA * 64, camA.position.z + sA * 64);
          }
          distFog = (distFog / 16) * (1 - eased);

          // 지평선만 안개색으로 녹이고 머리 위 감정 하늘은 살린다.
          // zenith 는 _tickSeedGrp(감정 하늘)이 매 프레임 쓴 scene.background 를 그대로 따라감.
          var kSky = Math.max(distFog, camFog) * opts.skyBlendMax;
          _skyDome.position.copy(camA.position);
          if (scene.background && scene.background.isColor) _skyDomeMat.uniforms.uZenith.value.copy(scene.background);
          _skyDomeMat.uniforms.uAmt.value = kSky;

          // scene.fog(스프라이트·유령용 거리 안개) 색도 같이 — 안 그러면 유령만 딴 색으로 뜬다.
          // _tickSeedGrp 이 먼저 쓰므로 제자리 lerp (누적 X, 감정색 보존).
          if (_skyC && scene.fog && scene.fog.color && kSky > 0.002) {
            scene.fog.color.lerp(_skyC, kSky);
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
      setOptions: function (o) { Object.assign(opts, o || {}); },
      getOptions: function () { return Object.assign({}, opts); },
      detach: function () {
        _detached = true;
        U.uOn.value = 0;
        U.uCount.value = 0;
        _gateRestore();
        _gateProvider = null;
        if (global.__temSpatialFogConstrain === constrainMove) global.__temSpatialFogConstrain = null;
        U.uWall.value = 0;
        // 하늘 돔 제거 + 하늘·안개색 원복
        if (_skyDome) {
          scene.remove(_skyDome);
          if (_skyDome.geometry) _skyDome.geometry.dispose();
          if (_skyDomeMat) _skyDomeMat.dispose();
          _skyDome = null; _skyDomeMat = null;
        }
        if (scene.background && scene.background.isColor && _origBgHex != null) scene.background.setHex(_origBgHex);
        if (scene.fog && scene.fog.color && _origFogHex != null) scene.fog.color.setHex(_origFogHex);
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

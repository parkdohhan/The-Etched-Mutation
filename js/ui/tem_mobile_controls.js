/**
 * tem_mobile_controls.js — 모바일 1인칭 터치 조작 (2026-08-06)
 *
 * 배경: 1인칭 지형 걷기는 방향키(WASD) + 포인터 잠금 마우스에만 의존했다. 휴대폰엔 둘 다
 * 없으므로 play-test.html 이 모바일을 감지하면 1인칭을 통째로 건너뛰고 2D 등고선 지도로
 * 빠졌다. 이 모듈은 그 두 입력을 손가락으로 대체해 모바일에서도 같은 무대에 서게 한다.
 *
 *   왼쪽 아래 십자 패드   → rt.setTouchMove(x, y)   (기울기 = 걷는 속도)
 *   화면 쓸기             → rt.addLook(dx, dy)      (마우스 movement 와 같은 단위)
 *   오른쪽 아래 원형 버튼 → window.__temFpPress     (데스크톱 "꾹 누르기"와 같은 자리)
 *   점프 버튼             → rt.touchJump()
 *
 * 자기 배선 원칙: play-test.html 에 호출을 심지 않고 window._fpPlayActive 를 폴링해
 * 스스로 붙고 뗀다. 1인칭이 아닐 때(선택 화면·2D 지도·큐레이터 모드)는 아무것도 안 만든다.
 *
 * 세로로 들면 "가로로 돌려주세요" 장막이 덮는다 — 가로 화면이 이 작품의 시야각 전제다.
 */
(function (global) {
  'use strict';

  var doc = global.document;

  // ── 상수 ─────────────────────────────────────────────────────
  var PAD_SIZE = 148;        // 십자 패드 지름(px)
  var KNOB_SIZE = 56;        // 가운데 노브 지름
  var PAD_DEADZONE = 0.16;   // 이보다 덜 밀면 안 걷는다 (엄지 떨림 흡수)
  var LOOK_GAIN = 1.6;       // 화면 쓸기 → 시선 감도 배율 (마우스 대비)
  var LOOK_CANCEL_PX = 12;   // 이만큼 움직이면 "둘러보기"로 보고 꾹 누르기 취소
  var POLL_MS = 300;

  // ── 상태 ─────────────────────────────────────────────────────
  var _attached = false;
  var _root = null;          // 조작 UI 컨테이너
  var _rotateEl = null;      // 세로 안내 장막
  var _pad = null, _knob = null;
  var _enterBtn = null, _enterRing = null;   // 짚은 자리에 뜨는 게이지 링
  var _jumpBtn = null;
  var _padTouchId = null;
  var _padCenter = { x: 0, y: 0 };
  var _lookTouchId = null;
  var _lookLast = { x: 0, y: 0 };
  var _lookStart = { x: 0, y: 0 };
  var _lookMoved = 0;
  var _pollTimer = null;
  var _uiTimer = null;
  var _canvas = null;

  function _lang() {
    var l = (doc.documentElement.lang || 'ko').substring(0, 2);
    return l === 'en' ? 'en' : 'ko';
  }

  function isMobile() {
    // ?touch=1 강제 스위치 — 노트북에서 모바일 조작을 그대로 확인할 때
    if (global.__temForceTouch !== null && global.__temForceTouch !== undefined) return global.__temForceTouch;
    if (typeof global._temIsMobileDevice === 'function') return global._temIsMobileDevice();
    var hasTouch = 'ontouchstart' in global || navigator.maxTouchPoints > 0;
    var iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    var coarse = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
    return /Mobi|Android|iPhone|iPod|iPad/i.test(navigator.userAgent)
      || iPadOS || (hasTouch && coarse) || (hasTouch && global.innerWidth < 768);
  }

  function _rt() {
    return global.TemAfStrataTerrain && global.TemAfStrataTerrain._lastRuntime;
  }

  // 대화창·씬 오버레이가 떠 있으면 걷기가 얼어 있다 — 조작 UI 도 같이 숨긴다.
  function _overlayOpen() {
    if (doc.getElementById('lumenDialogPhase1')) return true;
    var sc = doc.getElementById('sceneMode');
    if (sc && sc.classList.contains('active')) return true;
    var esc = doc.getElementById('escMenu');
    if (esc && esc.classList.contains('active')) return true;
    return false;
  }

  // ── 전체화면 + 가로 고정 시도 ────────────────────────────────
  // 주소창이 화면 높이를 갉아먹으면 가로 모드에서 지형이 띠처럼 눌린다.
  // 안드로이드 크롬은 전체화면 상태에서만 회전 고정이 먹고, iOS 사파리는 둘 다 없다
  // (그쪽은 세로 안내 장막이 대신 받는다).
  function requestImmersive() {
    try {
      var el = doc.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
      if (req && !doc.fullscreenElement) {
        var p = req.call(el, { navigationUI: 'hide' });
        if (p && p.then) p.then(_lockLandscape).catch(function () {});
        else _lockLandscape();
      } else {
        _lockLandscape();
      }
    } catch (_) {}
  }

  function _lockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(function () {});
      }
    } catch (_) {}
  }

  // ── 세로 안내 장막 ───────────────────────────────────────────
  function _ensureRotateVeil() {
    if (_rotateEl) return;
    _rotateEl = doc.createElement('div');
    _rotateEl.id = 'temMobRotate';
    _rotateEl.style.cssText = 'position:fixed;inset:0;z-index:99990;display:none;'
      + 'flex-direction:column;align-items:center;justify-content:center;gap:1.4rem;'
      + 'background:#050505;color:rgba(226,220,208,0.9);text-align:center;padding:2rem;'
      + "font-family:'Cormorant Garamond','Noto Serif KR',serif;letter-spacing:0.08em;";

    var icon = doc.createElement('div');
    // 세로 직사각형이 가로로 눕는 애니메이션 — 문장을 안 읽어도 뜻이 전해지게
    icon.style.cssText = 'width:54px;height:88px;border:2px solid rgba(196,168,130,0.75);'
      + 'border-radius:8px;animation:temMobRot 2.4s ease-in-out infinite;';
    _rotateEl.appendChild(icon);

    var t1 = doc.createElement('div');
    t1.style.cssText = 'font-size:1.25rem;color:rgba(232,228,220,0.92);line-height:1.7;';
    t1.textContent = _lang() === 'ko' ? '화면을 가로로 돌려주세요' : 'Please rotate your screen';
    _rotateEl.appendChild(t1);

    var t2 = doc.createElement('div');
    t2.style.cssText = 'font-size:0.95rem;color:rgba(196,168,130,0.7);line-height:1.8;';
    t2.textContent = _lang() === 'ko' ? '이 기억은 가로 시야로 새겨져 있습니다' : 'This memory is etched in a wide field of view';
    _rotateEl.appendChild(t2);

    var st = doc.createElement('style');
    st.textContent = '@keyframes temMobRot{0%,32%{transform:rotate(0)}58%,100%{transform:rotate(-90deg)}}';
    doc.head.appendChild(st);

    doc.body.appendChild(_rotateEl);
  }

  function _isPortrait() {
    return global.innerHeight > global.innerWidth;
  }

  function _syncOrientation() {
    if (!_rotateEl) return;
    var show = _attached && _isPortrait();
    _rotateEl.style.display = show ? 'flex' : 'none';
  }

  // ── 십자 패드 ────────────────────────────────────────────────
  function _buildPad() {
    _pad = doc.createElement('div');
    _pad.id = 'temMobPad';
    _pad.style.cssText = 'position:absolute;left:18px;bottom:18px;'
      + 'width:' + PAD_SIZE + 'px;height:' + PAD_SIZE + 'px;border-radius:50%;'
      + 'background:radial-gradient(circle,rgba(20,18,26,0.42) 0%,rgba(12,10,16,0.26) 70%,rgba(12,10,16,0.08) 100%);'
      + 'border:1px solid rgba(196,168,130,0.28);pointer-events:auto;touch-action:none;'
      + 'box-shadow:0 0 24px rgba(0,0,0,0.35);';

    // 십자 화살표 4개 — 어디로 밀면 되는지 손이 알아보게
    var dirs = [
      { rot: 0,   top: '10px',  left: '50%',   tx: '-50%', ty: '0' },
      { rot: 180, bottom: '10px', left: '50%', tx: '-50%', ty: '0' },
      { rot: -90, left: '10px', top: '50%',    tx: '0',    ty: '-50%' },
      { rot: 90,  right: '10px', top: '50%',   tx: '0',    ty: '-50%' }
    ];
    dirs.forEach(function (d) {
      var a = doc.createElement('div');
      var pos = 'position:absolute;';
      if (d.top) pos += 'top:' + d.top + ';';
      if (d.bottom) pos += 'bottom:' + d.bottom + ';';
      if (d.left) pos += 'left:' + d.left + ';';
      if (d.right) pos += 'right:' + d.right + ';';
      a.style.cssText = pos
        + 'width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;'
        + 'border-bottom:11px solid rgba(196,168,130,0.5);pointer-events:none;'
        + 'transform:translate(' + d.tx + ',' + d.ty + ') rotate(' + d.rot + 'deg);';
      _pad.appendChild(a);
    });

    _knob = doc.createElement('div');
    _knob.style.cssText = 'position:absolute;left:50%;top:50%;'
      + 'width:' + KNOB_SIZE + 'px;height:' + KNOB_SIZE + 'px;margin:'
      + (-KNOB_SIZE / 2) + 'px 0 0 ' + (-KNOB_SIZE / 2) + 'px;border-radius:50%;'
      + 'background:radial-gradient(circle,rgba(214,186,142,0.34) 0%,rgba(196,168,130,0.16) 100%);'
      + 'border:1px solid rgba(214,186,142,0.55);pointer-events:none;'
      + 'transition:transform 0.12s ease-out;box-shadow:0 0 14px rgba(196,168,130,0.25);';
    _pad.appendChild(_knob);

    _pad.addEventListener('touchstart', _onPadStart, { passive: false });
    _pad.addEventListener('touchmove', _onPadMove, { passive: false });
    _pad.addEventListener('touchend', _onPadEnd, { passive: false });
    _pad.addEventListener('touchcancel', _onPadEnd, { passive: false });
    return _pad;
  }

  function _padRectCenter() {
    var r = _pad.getBoundingClientRect();
    _padCenter.x = r.left + r.width / 2;
    _padCenter.y = r.top + r.height / 2;
  }

  function _onPadStart(e) {
    e.preventDefault();
    if (_padTouchId !== null) return;
    var t = e.changedTouches[0];
    _padTouchId = t.identifier;
    _padRectCenter();
    _applyPad(t.clientX, t.clientY);
  }

  function _onPadMove(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === _padTouchId) { _applyPad(t.clientX, t.clientY); return; }
    }
  }

  function _onPadEnd(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === _padTouchId) {
        _padTouchId = null;
        _knob.style.transform = 'translate(0,0)';
        var rt = _rt();
        if (rt && rt.setTouchMove) rt.setTouchMove(0, 0);
        return;
      }
    }
  }

  function _applyPad(cx, cy) {
    var maxR = PAD_SIZE / 2 - 8;
    var dx = cx - _padCenter.x;
    var dy = cy - _padCenter.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > maxR) { dx = dx / d * maxR; dy = dy / d * maxR; d = maxR; }
    _knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';

    var nx = dx / maxR;
    var ny = dy / maxR;
    var mag = Math.sqrt(nx * nx + ny * ny);
    var rt = _rt();
    if (!rt || !rt.setTouchMove) return;
    if (mag < PAD_DEADZONE) { rt.setTouchMove(0, 0); return; }
    // 데드존 바깥 구간을 0..1 로 다시 펴서, 살짝 민 순간부터 아주 느린 걸음이 나오게
    var k = (mag - PAD_DEADZONE) / (1 - PAD_DEADZONE) / mag;
    // 화면 위쪽으로 밀면 전진 → y 부호 뒤집기
    rt.setTouchMove(nx * k, -ny * k);
  }

  // ── 짚은 자리에 차오르는 링 ──────────────────────────────────
  // 260806 사용자 결정: 화면 한가운데 조준점에 맞추는 대신 유령을 손가락으로 직접 짚는다.
  //   그래서 "들어가기 버튼"은 없앴다 — 대신 짚은 그 자리에 게이지가 차오른다.
  //   진입 판정 자체는 play-test.html 의 _fpPressStart 가 짚은 좌표로 다시 계산한다.
  var RING_SIZE = 74;

  function _ensurePressRing() {
    if (_enterRing) return;
    var ns = 'http://www.w3.org/2000/svg';
    _enterBtn = doc.createElement('div');
    _enterBtn.id = 'temMobPressRing';
    _enterBtn.style.cssText = 'position:fixed;width:' + RING_SIZE + 'px;height:' + RING_SIZE + 'px;'
      + 'margin:' + (-RING_SIZE / 2) + 'px 0 0 ' + (-RING_SIZE / 2) + 'px;'
      + 'pointer-events:none;z-index:2970;opacity:0;transition:opacity 0.18s ease;display:none;';

    var svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(RING_SIZE));
    svg.setAttribute('height', String(RING_SIZE));
    svg.style.cssText = 'transform:rotate(-90deg);';
    var r = RING_SIZE / 2 - 5;
    var circ = 2 * Math.PI * r;

    var bg = doc.createElementNS(ns, 'circle');
    bg.setAttribute('cx', String(RING_SIZE / 2));
    bg.setAttribute('cy', String(RING_SIZE / 2));
    bg.setAttribute('r', String(r));
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', 'rgba(196,168,130,0.22)');
    bg.setAttribute('stroke-width', '2');
    svg.appendChild(bg);

    _enterRing = doc.createElementNS(ns, 'circle');
    _enterRing.setAttribute('cx', String(RING_SIZE / 2));
    _enterRing.setAttribute('cy', String(RING_SIZE / 2));
    _enterRing.setAttribute('r', String(r));
    _enterRing.setAttribute('fill', 'none');
    _enterRing.setAttribute('stroke', 'rgba(224,200,158,0.95)');
    _enterRing.setAttribute('stroke-width', '2.5');
    _enterRing.setAttribute('stroke-linecap', 'round');
    _enterRing.setAttribute('stroke-dasharray', String(circ));
    _enterRing.setAttribute('stroke-dashoffset', String(circ));
    _enterRing.style.filter = 'drop-shadow(0 0 6px rgba(196,168,130,0.55))';
    _enterRing._circ = circ;
    svg.appendChild(_enterRing);
    _enterBtn.appendChild(svg);
    doc.body.appendChild(_enterBtn);
  }

  // 짚은 좌표에서 게이지를 채우기 시작한다. 진입 조건을 통과한 누르기에서만 불린다.
  function showPressRing(x, y) {
    _ensurePressRing();
    _enterBtn.style.left = x + 'px';
    _enterBtn.style.top = y + 'px';
    _enterBtn.style.display = 'block';
    _enterBtn.style.opacity = '1';
    var ms = global.__temLongPressMs || 800;
    _enterRing.style.transition = 'none';
    _enterRing.setAttribute('stroke-dashoffset', String(_enterRing._circ));
    requestAnimationFrame(function () {
      if (!_enterRing) return;
      _enterRing.style.transition = 'stroke-dashoffset ' + ms + 'ms linear';
      _enterRing.setAttribute('stroke-dashoffset', '0');
    });
  }

  function hidePressRing() {
    if (!_enterBtn) return;
    _enterBtn.style.opacity = '0';
    if (_enterRing) {
      _enterRing.style.transition = 'none';
      _enterRing.setAttribute('stroke-dashoffset', String(_enterRing._circ));
    }
    var el = _enterBtn;
    setTimeout(function () { if (el && el.style.opacity === '0') el.style.display = 'none'; }, 200);
  }

  // ── 점프 버튼 ────────────────────────────────────────────────
  function _buildJumpBtn() {
    _jumpBtn = doc.createElement('div');
    _jumpBtn.style.cssText = 'position:absolute;right:126px;bottom:34px;'
      + 'width:56px;height:56px;border-radius:50%;pointer-events:auto;touch-action:none;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'background:rgba(16,14,22,0.34);border:1px solid rgba(196,168,130,0.22);'
      + 'color:rgba(196,168,130,0.6);font-size:20px;';
    _jumpBtn.textContent = '↑';
    _jumpBtn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var rt = _rt();
      if (rt && rt.touchJump) rt.touchJump();
      _jumpBtn.style.borderColor = 'rgba(214,186,142,0.6)';
      setTimeout(function () { if (_jumpBtn) _jumpBtn.style.borderColor = 'rgba(196,168,130,0.22)'; }, 180);
    }, { passive: false });
    return _jumpBtn;
  }

  // ── 화면 쓸기 → 시선 ─────────────────────────────────────────
  // 캔버스에 직접 건다. 패드·버튼은 자기 영역에서 preventDefault 하므로 여기까지 안 온다.
  function _onCanvasTouchStart(e) {
    if (_lookTouchId !== null) return;
    if (_overlayOpen()) return;
    var t = e.changedTouches[0];
    _lookTouchId = t.identifier;
    _lookLast.x = t.clientX; _lookLast.y = t.clientY;
    _lookStart.x = t.clientX; _lookStart.y = t.clientY;
    _lookMoved = 0;
  }

  function _onCanvasTouchMove(e) {
    if (_lookTouchId === null) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier !== _lookTouchId) continue;
      if (e.cancelable) e.preventDefault();  // 화면 스크롤·당겨서 새로고침 차단
      var dx = t.clientX - _lookLast.x;
      var dy = t.clientY - _lookLast.y;
      _lookLast.x = t.clientX; _lookLast.y = t.clientY;
      _lookMoved = Math.max(_lookMoved,
        Math.abs(t.clientX - _lookStart.x) + Math.abs(t.clientY - _lookStart.y));
      var rt = _rt();
      if (rt && rt.addLook) rt.addLook(dx * LOOK_GAIN, dy * LOOK_GAIN);
      return;
    }
  }

  function _onCanvasTouchEnd(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === _lookTouchId) { _lookTouchId = null; return; }
    }
  }

  // ── 붙이기 / 떼기 ────────────────────────────────────────────
  function attach() {
    if (_attached || !isMobile()) return;
    _attached = true;

    _root = doc.createElement('div');
    _root.id = 'temMobileUI';
    // 하단 파동(z 2950)·대화 오버레이(2800) 위. 컨테이너는 터치를 통과시키고 자식만 받는다.
    _root.style.cssText = 'position:fixed;inset:0;z-index:2960;pointer-events:none;'
      + '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;';
    _root.appendChild(_buildPad());
    _root.appendChild(_buildJumpBtn());
    doc.body.appendChild(_root);
    _ensurePressRing();

    _canvas = doc.getElementById('strataCanvas');
    if (_canvas) {
      _canvas.style.touchAction = 'none';
      _canvas.addEventListener('touchstart', _onCanvasTouchStart, { passive: false });
      _canvas.addEventListener('touchmove', _onCanvasTouchMove, { passive: false });
      _canvas.addEventListener('touchend', _onCanvasTouchEnd, { passive: false });
      _canvas.addEventListener('touchcancel', _onCanvasTouchEnd, { passive: false });
    }

    _ensureRotateVeil();
    _syncOrientation();
    global.addEventListener('resize', _syncOrientation);
    global.addEventListener('orientationchange', _syncOrientation);

    // 대화창이 열리면 조작 UI 를 숨기고(걷기가 얼어 있으므로), 닫히면 되살린다.
    _uiTimer = setInterval(function () {
      if (!_root) return;
      var hide = _overlayOpen();
      _root.style.opacity = hide ? '0' : '1';
      _root.style.pointerEvents = 'none';       // 컨테이너는 항상 통과
      if (_pad) _pad.style.pointerEvents = hide ? 'none' : 'auto';
      if (_jumpBtn) _jumpBtn.style.pointerEvents = hide ? 'none' : 'auto';
      // 좁은 화면에서는 대화 박스가 미니맵 자리까지 올라온다 — 대화 중엔 지도도 접어둔다.
      var mini = doc.getElementById('fpMinimap');
      if (mini) {
        mini.style.transition = 'opacity 0.35s ease';
        mini.style.opacity = hide ? '0' : '1';
      }
      if (hide) {
        hidePressRing();
        if (_padTouchId !== null) {
          _padTouchId = null;
          var rt = _rt();
          if (rt && rt.setTouchMove) rt.setTouchMove(0, 0);
          if (_knob) _knob.style.transform = 'translate(0,0)';
        }
      }
    }, 120);
    _root.style.transition = 'opacity 0.35s ease';

    console.log('[MobileControls] 터치 조작 부착 — 십자 패드 + 화면 쓸기 + 길게 누르기');
  }

  function detach() {
    if (!_attached) return;
    _attached = false;
    if (_uiTimer) { clearInterval(_uiTimer); _uiTimer = null; }
    var rt = _rt();
    if (rt && rt.setTouchMove) rt.setTouchMove(0, 0);
    if (_canvas) {
      _canvas.removeEventListener('touchstart', _onCanvasTouchStart);
      _canvas.removeEventListener('touchmove', _onCanvasTouchMove);
      _canvas.removeEventListener('touchend', _onCanvasTouchEnd);
      _canvas.removeEventListener('touchcancel', _onCanvasTouchEnd);
      _canvas = null;
    }
    global.removeEventListener('resize', _syncOrientation);
    global.removeEventListener('orientationchange', _syncOrientation);
    if (_root && _root.parentNode) _root.parentNode.removeChild(_root);
    if (_enterBtn && _enterBtn.parentNode) _enterBtn.parentNode.removeChild(_enterBtn);
    var miniD = doc.getElementById('fpMinimap');
    if (miniD) miniD.style.opacity = '1';   // 접어둔 지도 원복
    _root = null; _pad = null; _knob = null;
    _enterBtn = null; _enterRing = null; _jumpBtn = null;
    _padTouchId = null; _lookTouchId = null;
    _syncOrientation();
  }

  // 1인칭이 켜지고 캔버스가 준비되면 스스로 붙는다 — play-test.html 쪽 호출 배선 없음.
  function _startAutoWire() {
    if (_pollTimer) return;
    _pollTimer = setInterval(function () {
      if (!isMobile()) return;
      var live = !!global._fpPlayActive && !global.__temCuratorMode;
      if (live && !_attached && doc.getElementById('strataCanvas')) attach();
      else if (!live && _attached) detach();
    }, POLL_MS);
  }

  global.TemMobileControls = {
    attach: attach,
    detach: detach,
    isMobile: isMobile,
    isAttached: function () { return _attached; },
    requestImmersive: requestImmersive,
    showPressRing: showPressRing,
    hidePressRing: hidePressRing
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', _startAutoWire);
  else _startAutoWire();

})(typeof window !== 'undefined' ? window : this);

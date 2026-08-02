// 정체불명 본문 상자 추적기 (2026-08-02)
//
// 증상: FP 상영 중 지형 위에 씬 본문이 담긴 검은 상자가 떠 있다.
//       대화창도 아니고 사물 열람창도 아닌 "제3의 상자".
//       260802g 커밋이 구 씬 UI 폴백 한 경로를 막았는데도 재발.
//
// 쓰는 법 (play 화면 콘솔에 통째로 붙여넣기):
//   1. 붙여넣으면 감시가 켜진다.
//   2. 상자가 떠 있는 상태에서  __temWhatIsThat()   ← 그 상자의 정체
//   3. 상자를 재현한 뒤          __temBoxTable()     ← 언제 무엇이 켜졌는지 표
//   끄기 = 페이지 새로고침 (전역 후킹이라 되돌리지 않는다)

(function () {
  if (window.__temBoxSpy) { console.warn('[상자추적] 이미 켜져 있습니다'); return; }

  var T0 = performance.now();
  function ts() { return '+' + ((performance.now() - T0) / 1000).toFixed(2) + 's'; }

  function stack() {
    var s = (new Error()).stack || '';
    return s.split('\n').slice(2, 9).map(function (l) { return '   ' + l.trim(); }).join('\n');
  }

  function state() {
    var fp = false, sm = document.getElementById('sceneMode');
    try { fp = !!(window._fpPlay && window._fpPlay.isActive && window._fpPlay.isActive()); } catch (_) {}
    return {
      FP상영중: fp,
      대화창있음: !!document.getElementById('lumenDialogPhase1'),
      sceneMode활성: !!(sm && sm.classList.contains('active')),
      포인터잠김: !!document.pointerLockElement,
      현재씬: (window.game && game.currentSceneIndex != null) ? game.currentSceneIndex : '?',
    };
  }

  var log = [];
  window.__temBoxLog = log;

  function rec(what, withStack) {
    var e = Object.assign({ 시각: ts(), 사건: what }, state());
    log.push(e);
    console.warn('[상자추적] ' + what, e);
    if (withStack) console.log(stack());
  }

  // ── 1) 씬 본문(#sceneText)이 채워지는 순간 — 누가 채웠는지 스택까지 ──
  var st = document.getElementById('sceneText');
  if (st) {
    ['textContent', 'innerHTML', 'innerText'].forEach(function (prop) {
      var d = Object.getOwnPropertyDescriptor(Node.prototype, prop)
           || Object.getOwnPropertyDescriptor(Element.prototype, prop)
           || Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
      if (!d || !d.set) return;
      try {
        Object.defineProperty(st, prop, {
          configurable: true,
          get: function () { return d.get.call(this); },
          set: function (v) {
            var head = String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim().slice(0, 26);
            if (head) rec('#sceneText 채움 (' + prop + ') "' + head + '…"', true);
            d.set.call(this, v);
          },
        });
      } catch (_) {}
    });
    console.log('[상자추적] #sceneText 감시 ON');
  } else {
    console.warn('[상자추적] #sceneText 요소가 없음 — 다른 상자일 가능성');
  }

  // ── 2) #sceneMode 가 보이거나 숨는 순간 ──
  var sm = document.getElementById('sceneMode');
  if (sm && window.MutationObserver) {
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        rec('#sceneMode ' + m.attributeName + ' 변경 → '
          + (sm.classList.contains('active') ? '★보임' : '숨김'));
      });
    }).observe(sm, { attributes: true, attributeFilter: ['class', 'style'] });
    console.log('[상자추적] #sceneMode 감시 ON');
  }

  // ── 3) 화면(body)에 새 오버레이가 붙는 순간 ──
  var origAppend = Node.prototype.appendChild;
  Node.prototype.appendChild = function (child) {
    try {
      if (this === document.body && child && child.nodeType === 1) {
        var id = child.id || '';
        var txt = (child.textContent || '').trim().slice(0, 22);
        if (id || txt) rec('body 에 추가: #' + (id || '(id없음)') + ' "' + txt + '…"', true);
      }
    } catch (_) {}
    return origAppend.apply(this, arguments);
  };

  // ── 조회 도구 ──
  // 지금 화면에 실제로 보이는 텍스트 상자를 전부 훑는다 (상자가 떠 있을 때 호출).
  window.__temWhatIsThat = function () {
    var out = [];
    document.querySelectorAll('div,section,article,p,aside').forEach(function (el) {
      var t = (el.textContent || '').trim();
      if (t.length < 15 || t.length > 800) return;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || 1) < 0.05) return;
      var r = el.getBoundingClientRect();
      if (r.width < 110 || r.height < 34) return;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      out.push({
        id: el.id || '(없음)',
        class: (typeof el.className === 'string' ? el.className : '') || '(없음)',
        위치: Math.round(r.left) + ',' + Math.round(r.top),
        크기: Math.round(r.width) + 'x' + Math.round(r.height),
        z: cs.zIndex,
        배경: cs.backgroundColor,
        부모: (el.parentElement && (el.parentElement.id || el.parentElement.className || el.parentElement.tagName)) || '',
        글: t.slice(0, 34) + '…',
      });
    });
    // 안쪽 요소가 바깥 요소보다 먼저 보이게 — 작은 것부터
    out.sort(function (a, b) { return parseInt(a.크기) - parseInt(b.크기); });
    console.table(out);
    console.log('%c위 목록에서 문제의 상자와 위치·크기가 맞는 줄을 찾으세요. id 를 알려주면 원인을 좁힙니다.',
      'color:#c4a882');
    return out;
  };

  window.__temBoxTable = function () { console.table(log); return log; };

  window.__temBoxSpy = true;
  console.log('%c[상자추적] 켜짐. 상자 뜨면 __temWhatIsThat() / 재현 후 __temBoxTable()',
    'color:#c4a882;font-weight:bold;font-size:13px');
})();

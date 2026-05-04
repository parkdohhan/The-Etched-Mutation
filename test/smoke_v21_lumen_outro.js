// test/smoke_v21_lumen_outro.js
// V2.1 LumenRunOutro 회귀 가드 — DevTools Console 붙여넣기.
//
// 사전:
//   1. play-test.html 열기 (V1 모드도 가능 — 모듈 자체만 검증)
//   2. DevTools Console에 본 파일 전체 붙여넣기
//
// 검증:
//   1. 모듈 노출 (window.LumenRunOutro)
//   2. OUTRO_TEXT 3 kinds × 2 langs 완비
//   3. tem_branch_kind 미설정 시 skip
//   4. tem_branch_kind 설정 시 텍스트 오버레이 + dwell + 페이드아웃 + onComplete
//   5. 잘못된 kind 값 거부
//   6. lang 폴백 동작

(async function smokeV21LumenOutro() {
  console.log('=== smoke_v21_lumen_outro ===');
  var pass = 0, fail = 0;
  function check(label, ok, detail) {
    if (ok) { pass++; console.log('  PASS', label); }
    else { fail++; console.warn('  FAIL', label, detail || ''); }
  }

  // 1. 모듈 노출
  check('1.1 window.LumenRunOutro present', !!window.LumenRunOutro);
  check('1.2 LumenRunOutro.run is function', typeof (window.LumenRunOutro && window.LumenRunOutro.run) === 'function');
  check('1.3 LumenRunOutro.OUTRO_TEXT is object', typeof (window.LumenRunOutro && window.LumenRunOutro.OUTRO_TEXT) === 'object');

  // 2. OUTRO_TEXT 완비
  var T = window.LumenRunOutro && window.LumenRunOutro.OUTRO_TEXT;
  ['drift', 'speciation', 'none'].forEach(function (k) {
    check('2.1 OUTRO_TEXT.' + k + ' present', !!(T && T[k]));
    check('2.2 OUTRO_TEXT.' + k + '.ko non-empty', !!(T && T[k] && typeof T[k].ko === 'string' && T[k].ko.length > 0));
    check('2.3 OUTRO_TEXT.' + k + '.en non-empty', !!(T && T[k] && typeof T[k].en === 'string' && T[k].en.length > 0));
  });

  // 3. tem_branch_kind 미설정 시 skip
  var prevKind = sessionStorage.getItem('tem_branch_kind');
  var prevLang = sessionStorage.getItem('tem_lang');
  sessionStorage.removeItem('tem_branch_kind');
  var skipResult = await window.LumenRunOutro.run({ rewind: false, fadeInMs: 10, textDwellMs: 10, fadeOutMs: 10 });
  check('3.1 missing branch_kind → ok=false', skipResult && skipResult.ok === false, skipResult);
  check('3.2 missing branch_kind → reason no_branch_kind', skipResult && skipResult.reason === 'no_branch_kind');
  check('3.3 no overlay element after skip', !document.getElementById('lumenOutroText'));

  // 4. tem_branch_kind 설정 시 풀 사이클
  sessionStorage.setItem('tem_branch_kind', 'speciation');
  sessionStorage.setItem('tem_lang', 'ko');
  var completeCalled = false;
  var completePayload = null;
  var beforeCalled = false;
  var runPromise = window.LumenRunOutro.run({
    rewind: false,
    fadeInMs: 50, textDwellMs: 100, fadeOutMs: 50,
    beforeText: function () { beforeCalled = true; },
    onComplete: function (p) { completeCalled = true; completePayload = p; }
  });
  // overlay 가 fadeIn 동안 보여야 함
  await new Promise(function (r) { setTimeout(r, 80); });
  var overlay = document.getElementById('lumenOutroText');
  check('4.1 overlay element 존재 (dwell 중)', !!overlay);
  if (overlay) {
    var p = overlay.querySelector('p');
    check('4.2 overlay text = speciation.ko', p && p.textContent === T.speciation.ko, p && p.textContent);
  }
  var runResult = await runPromise;
  check('4.3 runResult.ok = true', runResult && runResult.ok === true);
  check('4.4 runResult.kind = speciation', runResult && runResult.kind === 'speciation');
  check('4.5 beforeText 호출됨', beforeCalled);
  check('4.6 onComplete 호출됨', completeCalled);
  check('4.7 onComplete payload kind = speciation', completePayload && completePayload.kind === 'speciation');
  check('4.8 overlay 제거됨', !document.getElementById('lumenOutroText'));

  // 5. 잘못된 kind
  sessionStorage.setItem('tem_branch_kind', 'invalid_kind');
  var bogusResult = await window.LumenRunOutro.run({ rewind: false, fadeInMs: 10, textDwellMs: 10, fadeOutMs: 10 });
  check('5.1 invalid kind → ok=false', bogusResult && bogusResult.ok === false);
  check('5.2 invalid kind → reason no_branch_kind', bogusResult && bogusResult.reason === 'no_branch_kind');

  // 6. en 폴백 (lang 키 미설정)
  sessionStorage.setItem('tem_branch_kind', 'drift');
  sessionStorage.removeItem('tem_lang');
  var langFallbackPromise = window.LumenRunOutro.run({ rewind: false, fadeInMs: 30, textDwellMs: 30, fadeOutMs: 30 });
  await new Promise(function (r) { setTimeout(r, 40); });
  var ovLang = document.getElementById('lumenOutroText');
  if (ovLang) {
    var pLang = ovLang.querySelector('p');
    var expectedLang = /^en/i.test(navigator.language || '') ? 'en' : 'ko';
    check('6.1 lang 폴백 텍스트 = drift.' + expectedLang,
      pLang && pLang.textContent === T.drift[expectedLang],
      pLang && pLang.textContent);
  }
  await langFallbackPromise;

  // 복원
  if (prevKind) sessionStorage.setItem('tem_branch_kind', prevKind);
  else sessionStorage.removeItem('tem_branch_kind');
  if (prevLang) sessionStorage.setItem('tem_lang', prevLang);
  else sessionStorage.removeItem('tem_lang');

  console.log('=== smoke_v21_lumen_outro: ' + pass + ' PASS / ' + fail + ' FAIL ===');
})();

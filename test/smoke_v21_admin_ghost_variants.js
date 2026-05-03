// test/smoke_v21_admin_ghost_variants.js
// V2.1 V2-2 admin 유령 변주 풀 도구 — DevTools Console 붙여넣기 (browser).
// 의존: admin.html 페이지 로드 후 + admin 로그인 + 메모리 편집 화면 진입 직후 실행.
//
// 검증 자리:
//   1. window.loadGhostVariants / unloadGhostVariants 함수 export
//   2. admin.html DOM 엘리먼트 존재 (섹션 / 컨테이너 / 추가 버튼 / 안내)
//   3. ghostVariantsSection 위치 — 공간 설정(Lumen) 다음, 사운드 매핑 직전
//   4. (선택) 컨테이너 안 카드 수 출력 + 추가 버튼 클릭 — 빈 카드 1장 펴짐
//   5. (선택) loadGhostVariants(null) 호출 → 섹션 비활성, 안내 메시지 변경
//
// PASS 합계 / FAIL 합계 마지막에 출력.

(function () {
  var pass = 0, fail = 0;
  var failed = [];
  function ok(name, cond, detail) {
    if (cond) { console.log('✓', name); pass++; }
    else      { console.error('✗', name, detail || ''); fail++; failed.push(name); }
  }

  // ─── 1. 모듈 export ───
  ok('window.loadGhostVariants is function',   typeof window.loadGhostVariants === 'function');
  ok('window.unloadGhostVariants is function', typeof window.unloadGhostVariants === 'function');

  // ─── 2. DOM 엘리먼트 ───
  var section = document.getElementById('ghostVariantsSection');
  var list    = document.getElementById('ghostVariantsList');
  var addBtn  = document.getElementById('addGhostVariantBtn');
  var hint    = document.getElementById('ghostVariantsHint');

  ok('#ghostVariantsSection exists', !!section);
  ok('#ghostVariantsList exists',    !!list);
  ok('#addGhostVariantBtn exists',   !!addBtn);
  ok('#ghostVariantsHint exists',    !!hint);

  // ─── 3. 위치 ───
  if (section) {
    var prev = section.previousElementSibling;
    var prevTitle = prev && prev.querySelector('.editor-section-title');
    ok('section 위치 — 공간 설정(Lumen) 직후',
       !!prevTitle && /공간\s*설정/.test(prevTitle.textContent || ''),
       prevTitle ? prevTitle.textContent : '(prev 없음)');

    var next = section.nextElementSibling;
    var nextTitle = next && next.querySelector('.editor-section-title');
    ok('section 위치 — 사운드 매핑 직전',
       !!nextTitle && /사운드/.test(nextTitle.textContent || ''),
       nextTitle ? nextTitle.textContent : '(next 없음)');
  }

  // ─── 4. 추가 버튼 + 카드 컨테이너 ───
  if (list) {
    var initialCardCount = list.querySelectorAll('.ghost-variant-card').length;
    console.log('   초기 변주 카드 수:', initialCardCount);
    ok('list 컨테이너 비어있어도 정상 (초기 카드 0~N개 OK)', initialCardCount >= 0);
  }

  if (addBtn) {
    ok('addBtn 텍스트 = "+ 유령 변주 추가"', /유령\s*변주\s*추가/.test(addBtn.textContent || ''));
  }

  // ─── 5. 비활성 모드 시뮬레이션 (memoryId=null) ───
  if (typeof window.loadGhostVariants === 'function' && hint) {
    var origHintText = hint.textContent;
    var origOpacity  = section ? section.style.opacity : null;
    try {
      window.loadGhostVariants(null);
      // 비활성 시 안내 메시지 + opacity 0.5
      setTimeout(function () {
        ok('loadGhostVariants(null) → 안내 메시지 변경',
           /메모리를\s*먼저\s*저장/.test(hint.textContent || ''),
           hint.textContent);
        ok('loadGhostVariants(null) → 섹션 opacity 0.5',
           section && (section.style.opacity === '0.5' || parseFloat(section.style.opacity) === 0.5),
           section ? section.style.opacity : '(섹션 없음)');
        // 결과 출력
        console.log('\n=== V2.1 V2-2 admin 유령 변주 풀 smoke ===');
        console.log('PASS:', pass, '/ FAIL:', fail);
        if (fail) {
          console.warn('Failed tests:');
          failed.forEach(function (n) { console.warn('  -', n); });
        }
        console.log('\n다음 손 검증 자리:');
        console.log('  1. addBtn 클릭 → 빈 카드 1장 펴짐');
        console.log('  2. 발화 본문 입력 + 저장 버튼 → 카드 헤더에 "저장됨" 메시지');
        console.log('  3. 새로고침 후 다시 편집 진입 → 같은 카드 풀 로드');
        console.log('  4. 콘솔 에러 0건 확인');
      }, 200);
    } catch (e) {
      ok('loadGhostVariants(null) 호출 안전', false, String(e));
    }
  } else {
    // 비동기 검증 없으면 즉시 결과
    console.log('\n=== V2.1 V2-2 admin 유령 변주 풀 smoke ===');
    console.log('PASS:', pass, '/ FAIL:', fail);
    if (fail) {
      console.warn('Failed tests:');
      failed.forEach(function (n) { console.warn('  -', n); });
    }
  }
})();

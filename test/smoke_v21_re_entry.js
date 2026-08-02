// test/smoke_v21_re_entry.js
// V2-13 재진입 유도 시퀀스 — 회귀 가드 (DevTools Console 붙여넣기형, vitest 아님).
//
// 사전:
//   1. `npm run dev` 로 띄운 play-test.html (또는 index.html) 을 연다.
//      — file:// 로 직접 열면 동적 import 가 CORS 로 막힘. dev 서버 필수.
//   2. DevTools Console 에 본 파일 전체를 붙여넣으면 자동 실행된다.
//      (재실행하려면 `smokeReEntry()` 호출 — window 에 노출됨.)
//
// 검증 자리 (docs/세션핸드아웃_v213_재진입유도-260510.md §3-1 시나리오 자동화):
//   1. 운영 헬퍼 — window.temClearUserIdentity / temGetUserName 노출 + 초기화 동작
//   2. js/app/userIdentity.js — 닉네임 set/get/has (trim·32자 cap·빈값 거부),
//      첫-플레이 데이터 save/get/has/clear (payload 모양), clearUserIdentity 가 tem_first_play:* 전부 비움
//   3. js/app/firstPlayScenification.js — "your engraving" 화면 + 씬 수만큼 파동 칸 +
//      Continue → "너의 이름을 알려줘" input → 빈값 Enter 무시 → 진짜 Enter → 닉네임+첫플레이 저장 + onContinue + 화면 제거
//   4. js/app/playReplayCompare.js — 첫-플레이 데이터 박힌 상태에서 "re-engraving" 화면
//      (greeting 에 닉네임 / legend first·now / 파동 칸 = max(첫째, 둘째 씬 수)) + Continue → onContinue + 제거 + 닉네임 없을 때 greeting 폴백
//   5. 데이터 계약 가드 — play-test.html:4496 의 handoff probe traces→scenes 변환 모양을
//      firstPlayScenification 이 그대로 받아 파동을 그리는지 (회차 진행 자체는 메인 세션 playwright 가 담당)
//
// localStorage(닉네임 + tem_first_play:*) 는 시작 시 스냅샷 → 끝에 복원. 샌드박스 memoryId 만 사용.
// 끝에 `=== smoke_v21_re_entry: N PASS / M FAIL ===` 출력.

(function () {
  async function smokeReEntry() {
    console.log('=== smoke_v21_re_entry (V2-13) ===');
    var pass = 0, fail = 0;
    var failed = [];
    function ok(label, cond, detail) {
      if (cond) { pass++; console.log('  ✓', label); }
      else { fail++; failed.push(label); console.warn('  ✗', label, detail !== undefined ? detail : ''); }
    }
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    // ── localStorage 스냅샷 (복원용) ──
    var SNAP = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k === 'tem_user_name' || (k && k.indexOf('tem_first_play:') === 0)) SNAP[k] = localStorage.getItem(k);
      }
    } catch (_) {}
    var SANDBOX_MEM = '__smoke_reentry_mem__';

    function restoreLocalStorage() {
      try {
        var toDel = [];
        for (var j = 0; j < localStorage.length; j++) {
          var kk = localStorage.key(j);
          if (kk === 'tem_user_name' || (kk && kk.indexOf('tem_first_play:') === 0)) toDel.push(kk);
        }
        toDel.forEach(function (key) { localStorage.removeItem(key); });
        Object.keys(SNAP).forEach(function (key) { localStorage.setItem(key, SNAP[key]); });
      } catch (_) {}
    }

    // ── 모듈 import ──
    var UI, FPS, PRC;
    try {
      UI = await import('./js/app/userIdentity.js');
      FPS = await import('./js/app/firstPlayScenification.js');
      PRC = await import('./js/app/playReplayCompare.js');
    } catch (e) {
      console.error('  ✗ 모듈 import 실패 — `npm run dev` 로 띄운 play-test.html / index.html 콘솔에서 실행해야 함 (file:// 금지).', e);
      console.log('=== smoke_v21_re_entry: 0 PASS / 1 FAIL (import) ===');
      return;
    }

    try {
      // ─────────────────────────────────────────────
      // 1. 운영 헬퍼 + 초기화
      // ─────────────────────────────────────────────
      ok('1.1 window.temClearUserIdentity 함수', typeof window.temClearUserIdentity === 'function');
      ok('1.2 window.temGetUserName 함수', typeof window.temGetUserName === 'function');

      UI.setUserName('스모크초기화테스트');
      UI.saveFirstPlayData(SANDBOX_MEM, { scenes: [{ sceneIndex: 0, userEmotion: { sadness: 0.5 } }] });
      window.temClearUserIdentity();
      ok('1.3 temClearUserIdentity 후 닉네임 비움', UI.getUserName() === null, UI.getUserName());
      ok('1.4 temClearUserIdentity 후 첫-플레이 row 비움', UI.getFirstPlayData(SANDBOX_MEM) === null);

      // ─────────────────────────────────────────────
      // 2. userIdentity.js
      // ─────────────────────────────────────────────
      ok('2.1 setUserName 정상 → true', UI.setUserName('도한') === true);
      ok('2.2 getUserName === "도한"', UI.getUserName() === '도한');
      ok('2.3 hasUserName true', UI.hasUserName() === true);
      ok('2.4 setUserName 앞뒤 공백 trim', (UI.setUserName('  여백  '), UI.getUserName() === '여백'));
      ok('2.5 setUserName 32자 cap', (UI.setUserName(new Array(51).join('가')), UI.getUserName().length === 32));
      ok('2.6 setUserName 공백뿐 → false + 기존 유지', UI.setUserName('   ') === false && UI.getUserName().length === 32);
      ok('2.7 setUserName 비문자열 → false', UI.setUserName(123) === false);

      UI.setUserName('도한');
      var saved = UI.saveFirstPlayData(SANDBOX_MEM, {
        scenes: [
          { sceneIndex: 0, sceneId: 's1', userEmotion: { sadness: 0.7, longing: 0.3 }, userReason: '밑줄' },
          { sceneIndex: 1, sceneId: 's2', userEmotion: { anger: 0.5, fear: 0.4 }, userReason: '' },
        ],
        alignment_score: 0.62,
        alignment_bucket: 'MID',
        transition_pattern: 'bridge',
        completed_sentence: '— 당신의 음각 —',
      });
      ok('2.8 saveFirstPlayData → true', saved === true);
      var fp = UI.getFirstPlayData(SANDBOX_MEM);
      ok('2.9 getFirstPlayData 객체 반환', !!fp && typeof fp === 'object');
      ok('2.10 payload.memoryId 박힘', !!fp && fp.memoryId === SANDBOX_MEM);
      ok('2.11 payload.userName = 현재 닉네임', !!fp && fp.userName === '도한');
      ok('2.12 payload.timestamp 숫자', !!fp && typeof fp.timestamp === 'number' && fp.timestamp > 0);
      ok('2.13 payload.scenes 2개 보존', !!fp && Array.isArray(fp.scenes) && fp.scenes.length === 2);
      ok('2.14 payload.scenes[0].userEmotion 보존', !!fp && fp.scenes[0] && fp.scenes[0].userEmotion && fp.scenes[0].userEmotion.sadness === 0.7);
      ok('2.15 payload.scenes[0].userReason 보존', !!fp && fp.scenes[0] && fp.scenes[0].userReason === '밑줄');
      ok('2.16 payload.completed_sentence 보존', !!fp && fp.completed_sentence === '— 당신의 음각 —');
      ok('2.17 payload.alignment_score / bucket / pattern 보존',
        !!fp && fp.alignment_score === 0.62 && fp.alignment_bucket === 'MID' && fp.transition_pattern === 'bridge');
      ok('2.18 hasFirstPlayData true', UI.hasFirstPlayData(SANDBOX_MEM) === true);
      ok('2.19 saveFirstPlayData(빈 memoryId) → false', UI.saveFirstPlayData('', {}) === false);
      ok('2.20 getFirstPlayData(빈) → null', UI.getFirstPlayData('') === null);

      UI.clearFirstPlayData(SANDBOX_MEM);
      ok('2.21 clearFirstPlayData 후 null', UI.getFirstPlayData(SANDBOX_MEM) === null);

      // clearUserIdentity 가 tem_first_play:* 전부 비우나 (여러 메모리 키)
      UI.setUserName('도한');
      UI.saveFirstPlayData('__smoke_mem_A__', { scenes: [] });
      UI.saveFirstPlayData('__smoke_mem_B__', { scenes: [] });
      UI.clearUserIdentity();
      ok('2.22 clearUserIdentity → 닉네임 null', UI.getUserName() === null);
      ok('2.23 clearUserIdentity → 모든 첫-플레이 row null',
        UI.getFirstPlayData('__smoke_mem_A__') === null && UI.getFirstPlayData('__smoke_mem_B__') === null);

      // ─────────────────────────────────────────────
      // 3. firstPlayScenification.js
      // ─────────────────────────────────────────────
      var fpsContinued = false;
      var fpsScenes = [
        { sceneIndex: 0, sceneId: 's1', userEmotion: { sadness: 0.7, longing: 0.3 }, userReason: '밑줄' },
        { sceneIndex: 1, sceneId: 's2', userEmotion: { anger: 0.5, fear: 0.4 } },
        { sceneIndex: 2, sceneId: 's3', userEmotion: { joy: 0.4 } },
      ];
      await FPS.showFirstPlayScenification({
        memoryId: SANDBOX_MEM,
        completedSentence: '— 스모크: 당신의 음각은 어디에 새겨져 있는가? —',
        scenes: fpsScenes,
        alignment: 0.5, bucket: 'MID', transitionPattern: 'bridge',
        onContinue: function () { fpsContinued = true; },
      });
      await sleep(140);
      var fpsEl = document.getElementById('firstPlayScenification');
      ok('3.1 #firstPlayScenification 박힘', !!fpsEl);
      ok('3.2 .visible 클래스 (페이드인)', !!fpsEl && fpsEl.classList.contains('visible'));
      ok('3.3 .fps-title === "your engraving"',
        !!fpsEl && fpsEl.querySelector('.fps-title') && fpsEl.querySelector('.fps-title').textContent === 'your engraving');
      ok('3.4 .fps-sentence 완성 문장 박힘',
        !!fpsEl && /당신의 음각/.test((fpsEl.querySelector('.fps-sentence') || {}).textContent || ''));
      // 260802 알파1 피드백 5: 파동 스택 삭제 — 있으면 실패 (회귀 감시 방향 반전)
      ok('3.5 파동 캔버스 없음 (260802 삭제)', !!fpsEl && fpsEl.querySelectorAll('.fps-wave-canvas').length === 0);
      var fpsCta = fpsEl && fpsEl.querySelector('[data-fps-action="continue"]');
      ok('3.6 Continue 버튼 박힘', !!fpsCta);

      if (fpsCta) fpsCta.click();
      await sleep(100);
      var namePrompt = fpsEl && fpsEl.querySelector('.fps-name-prompt');
      ok('3.7 Continue 클릭 → 닉네임 prompt 박힘', !!namePrompt);
      ok('3.8 prompt 안내 = "너의 이름을 알려줘."',
        !!namePrompt && /너의 이름을 알려줘/.test(((namePrompt.querySelector('.fps-name-line') || {}).textContent) || ''));
      var nameInput = namePrompt && namePrompt.querySelector('.fps-name-input');
      ok('3.9 닉네임 input 박힘', !!nameInput);
      ok('3.10 Continue 클릭 → 원래 CTA 제거됨', !(fpsEl && fpsEl.querySelector('[data-fps-action="continue"]')));

      // 빈 입력 Enter → submit 안 됨 (early return)
      if (nameInput) {
        nameInput.value = '   ';
        nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }
      await sleep(80);
      ok('3.11 빈 입력 Enter → 화면 유지 (submit X)',
        !!document.getElementById('firstPlayScenification') && fpsContinued === false);

      // 진짜 입력 Enter → 저장 + onContinue + 제거 (opacity 0 → 800ms 제거 타이머)
      if (nameInput) {
        nameInput.value = '스모크닉네임';
        nameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }
      await sleep(1000);
      ok('3.12 Enter → 닉네임 저장됨', UI.getUserName() === '스모크닉네임', UI.getUserName());
      var fpAfter = UI.getFirstPlayData(SANDBOX_MEM);
      ok('3.13 Enter → 첫-플레이 데이터 저장됨 (scenes 3)',
        !!fpAfter && Array.isArray(fpAfter.scenes) && fpAfter.scenes.length === 3);
      ok('3.14 Enter → completed_sentence 저장됨',
        !!fpAfter && /당신의 음각/.test(fpAfter.completed_sentence || ''));
      ok('3.15 Enter → userName 도장됨 (payload)', !!fpAfter && fpAfter.userName === '스모크닉네임');
      ok('3.16 Enter → onContinue 호출됨', fpsContinued === true);
      ok('3.17 Enter → #firstPlayScenification 제거됨', !document.getElementById('firstPlayScenification'));
      try { FPS.dismissFirstPlayScenification(); } catch (_) {}

      // ─────────────────────────────────────────────
      // 4. playReplayCompare.js
      // ─────────────────────────────────────────────
      // 첫-플레이 데이터 = §3 에서 박힘 (scenes 3 + completed_sentence). 닉네임 = '스모크닉네임'.
      var prcContinued = false;
      var secondScenes = [
        { sceneIndex: 0, sceneId: 's1', userEmotion: { joy: 0.5, anger: 0.2 } },
        { sceneIndex: 1, sceneId: 's2', userEmotion: { fear: 0.6 } },
      ];
      await PRC.showPlayReplayCompare({
        memoryId: SANDBOX_MEM,
        completedSentence: '— 스모크: 두 번째 새김 —',
        secondScenes: secondScenes,
        onContinue: function () { prcContinued = true; },
      });
      await sleep(140);
      var prcEl = document.getElementById('playReplayCompare');
      ok('4.1 #playReplayCompare 박힘', !!prcEl);
      ok('4.2 .visible 클래스', !!prcEl && prcEl.classList.contains('visible'));
      ok('4.3 .prc-title === "re-engraving"',
        !!prcEl && ((prcEl.querySelector('.prc-title') || {}).textContent) === 're-engraving');
      ok('4.4 greeting 에 닉네임 박힘',
        !!prcEl && /스모크닉네임/.test(((prcEl.querySelector('.prc-greeting') || {}).textContent) || ''));
      ok('4.5 .prc-sentence 두 번째 완성 문장',
        !!prcEl && /두 번째 새김/.test(((prcEl.querySelector('.prc-sentence') || {}).textContent) || ''));
      ok('4.6 legend first / now 박힘',
        !!prcEl && !!prcEl.querySelector('.prc-legend .first') && !!prcEl.querySelector('.prc-legend .second'));
      // sceneCount = max(secondScenes 2, firstPlay.scenes 3) = 3
      ok('4.7 파동 캔버스 = max(둘째 2, 첫째 3) = 3', !!prcEl && prcEl.querySelectorAll('.prc-wave-canvas').length === 3);
      var prcCta = prcEl && prcEl.querySelector('[data-prc-action="continue"]');
      ok('4.8 Continue 버튼 박힘', !!prcCta);
      if (prcCta) prcCta.click();
      await sleep(1000);
      ok('4.9 Continue → onContinue 호출됨', prcContinued === true);
      ok('4.10 Continue → #playReplayCompare 제거됨', !document.getElementById('playReplayCompare'));
      try { PRC.dismissPlayReplayCompare(); } catch (_) {}

      // 닉네임 없을 때 greeting / 빈 completedSentence placeholder 폴백
      UI.clearUserIdentity();
      UI.saveFirstPlayData(SANDBOX_MEM, { scenes: [{ sceneIndex: 0, userEmotion: { sadness: 0.5 } }] });
      await PRC.showPlayReplayCompare({
        memoryId: SANDBOX_MEM,
        completedSentence: '',
        secondScenes: [{ sceneIndex: 0, userEmotion: { joy: 0.5 } }],
        onContinue: function () {},
      });
      await sleep(100);
      var prcEl2 = document.getElementById('playReplayCompare');
      ok('4.11 닉네임 없음 → greeting 폴백 "너의 두 번째 새김."',
        !!prcEl2 && /^너의 두 번째 새김\.$/.test((((prcEl2.querySelector('.prc-greeting') || {}).textContent) || '').trim()));
      ok('4.12 completedSentence 빈 → placeholder 문장 박힘',
        !!prcEl2 && /second engraving/i.test(((prcEl2.querySelector('.prc-sentence') || {}).textContent) || ''));
      try { PRC.dismissPlayReplayCompare(); } catch (_) {}

      // ─────────────────────────────────────────────
      // 5. 데이터 계약 가드 — play-test.html:4496 handoff probe traces→scenes
      // ─────────────────────────────────────────────
      // play-test.html 의 transform 이 만드는 scene 레코드를 흉내내서 firstPlayScenification 이 그대로 받는지.
      // (회차 진행 흐름 자체 — ARCHIVE → 멀티턴 → reveal → Continue — 는 메인 세션 playwright 사이클이 담당.)
      var fakeTraces = [
        { sceneId: 'sc-a', sceneIndex: 0, sceneText: '발자국이 남은 자리', userVector: { base: { sadness: 0.6 } }, userEmotion: { sadness: 0.6 }, sceneLinkInput: '왜인지 멈췄다' },
        { sceneId: 'sc-b', sceneIndex: 1, sceneText: '비가 왔다', userEmotion: { fear: 0.4, anger: 0.3 } },
        { sceneId: 'sc-c', sceneIndex: 2, sceneText: '본문 없음', userVector: { base: null } }, // userEmotion 없음 → 걸러져야
      ];
      var probeScenes = fakeTraces
        .map(function (t, i) {
          var vec = (t && (t.userEmotion || (t.userVector && t.userVector.base))) || null;
          if (!vec) return null;
          return {
            sceneIndex: typeof t.sceneIndex === 'number' ? t.sceneIndex : i,
            sceneId: t.sceneId || null,
            sceneText: t.sceneText || '',
            userEmotion: vec,
            userReason: t.sceneLinkInput || t.userReason || '',
          };
        })
        .filter(Boolean);
      ok('5.1 traces→scenes transform → 2 레코드 (vec 없는 1개 걸러짐)', probeScenes.length === 2);
      ok('5.2 transform — userEmotion 추출 (직접 우선)', probeScenes[0].userEmotion && probeScenes[0].userEmotion.sadness === 0.6);
      ok('5.3 transform — sceneLinkInput → userReason 매핑', probeScenes[0].userReason === '왜인지 멈췄다');

      UI.clearUserIdentity();
      await FPS.showFirstPlayScenification({
        memoryId: SANDBOX_MEM,
        completedSentence: '— 계약 가드 —',
        scenes: probeScenes,
        onContinue: function () {},
      });
      await sleep(120);
      var fpsEl5 = document.getElementById('firstPlayScenification');
      ok('5.4 probe scenes → firstPlayScenification 박힘', !!fpsEl5);
      ok('5.5 probe scenes(2) → 파동 캔버스 2행', !!fpsEl5 && fpsEl5.querySelectorAll('.fps-wave-canvas').length === 2);
      try { FPS.dismissFirstPlayScenification(); } catch (_) {}

    } catch (e) {
      fail++; failed.push('예외: ' + (e && e.message));
      console.error('  ✗ 예외 발생:', e);
    } finally {
      try { FPS && FPS.dismissFirstPlayScenification(); } catch (_) {}
      try { PRC && PRC.dismissPlayReplayCompare(); } catch (_) {}
      var leftover1 = document.getElementById('firstPlayScenification'); if (leftover1) leftover1.remove();
      var leftover2 = document.getElementById('playReplayCompare'); if (leftover2) leftover2.remove();
      restoreLocalStorage();
    }

    console.log('=== smoke_v21_re_entry: ' + pass + ' PASS / ' + fail + ' FAIL ===');
    if (fail) {
      console.warn('Failed tests:');
      failed.forEach(function (n) { console.warn('  -', n); });
    }
    console.assert(fail === 0, 'smoke_v21_re_entry 에 실패 항목 있음');
    return { pass: pass, fail: fail };
  }

  if (typeof window !== 'undefined') window.smokeReEntry = smokeReEntry;
  smokeReEntry();
})();

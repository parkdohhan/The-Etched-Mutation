// test/smoke_v21_phase1.js
// V2.1 Phase 1 smoke — DevTools Console 붙여넣기 (browser).
// 의존: 페이지 로드 후 window.LumenGhostResponse / LumenDriftVisualizer / LumenDialogPhase1 가용.
//
// 검증 자리:
//   1. 모듈 3개 로드
//   2. ghost_response classifyResonance 임계 (0.55/0.35)
//   3. ghost_response pickResponse 결정론 (같은 시드 → 같은 reply)
//   4. ghost_response pickResponse dissonance quoting (`'____'` 마커 처리)
//   5. ghost_response pickUrge 결정론
//   6. ghost_response pickSceneLinkPrompt 결마다 다름
//   7. dialog_phase1 _utils.cosineSim
//   8. dialog_phase1 _utils.hasCrisis
//   9. dialog_phase1 _utils.isEndPhrase
//   10. drift_visualizer attach API 존재
//
// PASS 합계 / FAIL 합계 마지막에 출력.

(function () {
  var pass = 0, fail = 0;
  var failed = [];
  function ok(name, cond) {
    if (cond) { console.log('✓', name); pass++; }
    else      { console.error('✗', name); fail++; failed.push(name); }
  }

  var GR = window.LumenGhostResponse;
  var DV = window.LumenDriftVisualizer;
  var DP = window.LumenDialogPhase1;

  // ─── 1. 모듈 로드 ───
  ok('LumenGhostResponse module loaded', !!GR);
  ok('LumenDriftVisualizer module loaded', !!DV);
  ok('LumenDialogPhase1 module loaded', !!DP);

  // ─── 2. classifyResonance 임계 ───
  if (GR) {
    ok('classifyResonance(0.7) === resonance',  GR.classifyResonance(0.7)  === 'resonance');
    ok('classifyResonance(0.55) === resonance', GR.classifyResonance(0.55) === 'resonance');
    ok('classifyResonance(0.50) === vague',     GR.classifyResonance(0.50) === 'vague');
    ok('classifyResonance(0.35) === vague',     GR.classifyResonance(0.35) === 'vague');
    ok('classifyResonance(0.30) === dissonance',GR.classifyResonance(0.30) === 'dissonance');
    ok('classifyResonance(0.0) === dissonance', GR.classifyResonance(0.0)  === 'dissonance');
  }

  // ─── 3. pickResponse 결정론 ───
  if (GR) {
    var r1 = GR.pickResponse({ memoryId: 'mA', sceneId: 's1', turn: 1, alignment: 0.7, playerInput: '안녕' });
    var r2 = GR.pickResponse({ memoryId: 'mA', sceneId: 's1', turn: 1, alignment: 0.7, playerInput: '안녕' });
    ok('pickResponse 결정론 — 같은 (memId, sceneId, turn, align) → 같은 reply', r1.reply === r2.reply);
    ok('pickResponse 결정론 — resonance 분류 0.7', r1.resonance === 'resonance');

    // 다른 sceneId → 다른 시드
    var r3 = GR.pickResponse({ memoryId: 'mA', sceneId: 's2', turn: 1, alignment: 0.7 });
    ok('pickResponse — 다른 sceneId 시드 reply 형식', typeof r3.reply === 'string' && r3.reply.length > 0);

    // vague 분류
    var rV = GR.pickResponse({ memoryId: 'mA', sceneId: 's1', turn: 1, alignment: 0.45 });
    ok('pickResponse — vague 분류 0.45', rV.resonance === 'vague');
  }

  // ─── 4. dissonance quoting ───
  if (GR) {
    var rD = GR.pickResponse({
      memoryId: 'mB', sceneId: 's1', turn: 1,
      alignment: 0.20,
      playerInput: '엄마는 늘 그랬어 정말로',
    });
    ok('pickResponse — dissonance 분류 0.20', rD.resonance === 'dissonance');
    // quoting 마커 처리 — `'____'` 자리에 quote 또는 '...' 삽입돼야
    ok('pickResponse — `\'____\'` 마커 미잔존', rD.reply.indexOf("'____'") === -1);

    // 빈 입력일 때도 안전
    var rDempty = GR.pickResponse({ memoryId: 'mC', sceneId: 's1', turn: 1, alignment: 0.20, playerInput: '' });
    ok('pickResponse — 빈 입력 안전', typeof rDempty.reply === 'string' && rDempty.reply.indexOf("'____'") === -1);
  }

  // ─── 5. pickUrge 결정론 ───
  if (GR) {
    var u1 = GR.pickUrge({ memoryId: 'mA', sceneId: 's1', alignment: 0.7 });
    var u2 = GR.pickUrge({ memoryId: 'mA', sceneId: 's1', alignment: 0.7 });
    ok('pickUrge 결정론', u1.urge === u2.urge);
    ok('pickUrge resonance 분류', u1.resonance === 'resonance');
    var uD = GR.pickUrge({ memoryId: 'mA', sceneId: 's1', alignment: 0.20 });
    ok('pickUrge dissonance 분류', uD.resonance === 'dissonance');
  }

  // ─── 6. pickSceneLinkPrompt 결마다 다름 ───
  if (GR) {
    var pHigh = GR.pickSceneLinkPrompt(0.7);
    var pMid  = GR.pickSceneLinkPrompt(0.45);
    var pLow  = GR.pickSceneLinkPrompt(0.20);
    ok('pickSceneLinkPrompt — 결마다 다른 prompt', pHigh !== pMid && pMid !== pLow && pHigh !== pLow);
    ok('pickSceneLinkPrompt — 모두 string', typeof pHigh === 'string' && typeof pMid === 'string' && typeof pLow === 'string');
  }

  // ─── 7. dialog_phase1 _utils.cosineSim ───
  if (DP && DP._utils) {
    var sim1 = DP._utils.cosineSim({ fear: 1 }, { fear: 1 });
    ok('cosineSim — same vec → ~1', Math.abs(sim1 - 1) < 0.001);
    var sim2 = DP._utils.cosineSim({ fear: 1 }, { joy: 1 });
    ok('cosineSim — orthogonal → ~0', Math.abs(sim2) < 0.001);
    var sim3 = DP._utils.cosineSim(
      { fear: 0.5, sadness: 0.5 },
      { fear: 0.5, sadness: 0.5 }
    );
    ok('cosineSim — same dist 2D → ~1', Math.abs(sim3 - 1) < 0.001);
    var sim4 = DP._utils.cosineSim({}, { fear: 1 });
    ok('cosineSim — empty vec → 0', sim4 === 0);
  }

  // ─── 8. hasCrisis ───
  if (DP && DP._utils) {
    ok('hasCrisis — 자살 키워드',  DP._utils.hasCrisis('나 자살하고 싶어', ['자살', '죽고싶']));
    ok('hasCrisis — 죽고싶 키워드', DP._utils.hasCrisis('너무 죽고싶어', ['자살', '죽고싶']));
    ok('hasCrisis — 무관 입력',    !DP._utils.hasCrisis('엄마는 늘 그랬어', ['자살', '죽고싶']));
    ok('hasCrisis — 빈 입력',      !DP._utils.hasCrisis('', ['자살']));
  }

  // ─── 9. isEndPhrase ───
  if (DP && DP._utils) {
    ok('isEndPhrase — 여기까지',  DP._utils.isEndPhrase('여기까지', ['여기까지', '봉인']));
    ok('isEndPhrase — 봉인',      DP._utils.isEndPhrase('봉인', ['여기까지', '봉인']));
    ok('isEndPhrase — 무관 입력',!DP._utils.isEndPhrase('계속 말해줘', ['여기까지', '봉인']));
    ok('isEndPhrase — 부분 매칭', DP._utils.isEndPhrase('이만 여기까지 할게', ['여기까지']));
  }

  // ─── 10. drift_visualizer API ───
  if (DV) {
    ok('LumenDriftVisualizer.attach is function', typeof DV.attach === 'function');
  }

  // ─── 결과 ───
  console.log('\n=== V2.1 Phase 1 smoke ===');
  console.log('PASS:', pass, '/ FAIL:', fail);
  if (fail) {
    console.warn('Failed tests:');
    failed.forEach(function (n) { console.warn('  -', n); });
  }
})();

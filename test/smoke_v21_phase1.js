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
//   11. dialog_phase1 _config.maxFreeDialogTurns === 3 (2026-05-04 ego-state turn-taking 차용)
//   12. dialog_phase1 _utils.pickAuthored — string passthrough / array seeded / 빈 배열 / null
//   13. dialog_phase1 _config.sceneCycleWarnMs 자리 박힘 (결정 (d) — 9분 임계 콘솔 경고)
//   14. _utils.loadAndInjectGhostPools — fallback 5종 + 정상 분류 (2026-05-05)
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

  // ─── 11. maxFreeDialogTurns 3턴 박힘 (2026-05-04 ego-state 차용) ───
  if (DP && DP._config) {
    ok('maxFreeDialogTurns === 3 (ego-state turn-taking 차용)',
      DP._config.maxFreeDialogTurns === 3);
  } else {
    ok('DP._config 노출됨', false);
  }

  // ─── 12. _pickAuthored string-or-array seeded pick ───
  if (DP && DP._utils && typeof DP._utils.pickAuthored === 'function') {
    var pa = DP._utils.pickAuthored;
    // string passthrough
    ok('pickAuthored — string 그대로', pa('한 줄', 'seed-1') === '한 줄');
    ok('pickAuthored — 빈 string → null', pa('', 'seed-1') === null);
    // null/undefined
    ok('pickAuthored — null → null', pa(null, 'seed-1') === null);
    ok('pickAuthored — undefined → null', pa(undefined, 'seed-1') === null);
    // array seeded
    var arr = ['가', '나', '다', '라', '마'];
    var p1 = pa(arr, 'mA|s1');
    var p2 = pa(arr, 'mA|s1');
    ok('pickAuthored — 같은 시드 같은 픽', p1 === p2);
    ok('pickAuthored — 픽 결과 풀에 속함', arr.indexOf(p1) >= 0);
    var p3 = pa(arr, 'mA|s2');
    ok('pickAuthored — 다른 시드 string 형식', typeof p3 === 'string' && p3.length > 0);
    // 빈 배열 / 무효치 배열
    ok('pickAuthored — 빈 배열 → null', pa([], 'seed-2') === null);
    ok('pickAuthored — 무효치만 배열 → null', pa([null, '', undefined], 'seed-3') === null);
    // 시드 분포 — 5종 풀에 8개 시드 박으면 유일치 ≥ 2 (시드 다양성 sanity)
    var seen = {};
    for (var i = 0; i < 8; i++) seen[pa(arr, 'sd-' + i)] = 1;
    ok('pickAuthored — 시드 다양성 (8 시드 → 유일치 ≥ 2)', Object.keys(seen).length >= 2);
  } else {
    ok('DP._utils.pickAuthored 노출됨', false);
  }

  // ─── 13. sceneCycleWarnMs 임계 박힘 (결정 (d) 9분 콘솔 경고) ───
  if (DP && DP._config) {
    ok('sceneCycleWarnMs 박힘 (number)',
      typeof DP._config.sceneCycleWarnMs === 'number' && DP._config.sceneCycleWarnMs > 0);
    ok('sceneCycleWarnMs === 540000 (9분)',
      DP._config.sceneCycleWarnMs === 540000);
  }

  // ─── 14. loadAndInjectGhostPools — fallback 5종 + 정상 분류 (2026-05-05) ───
  // mock supabase chain: from(table).select(cols).eq(col,val).eq(col,val) → Promise<{data, error}>
  // 5 fallback: missing_deps / select_failed / no_anchor (rows 0) / no_anchor (anchor.vec 빈) / too_few (변주<3)
  // 정상: anchor 1 + 변주 4 → resonance/vague/dissonance 분류 + setOptions 호출
  if (DP && DP._utils && typeof DP._utils.loadAndInjectGhostPools === 'function') {
    var loadFn = DP._utils.loadAndInjectGhostPools;

    function makeMockSupabase(rows, error) {
      return {
        from: function () {
          return {
            select: function () {
              return {
                eq: function () {
                  return {
                    eq: function () {
                      return Promise.resolve({ data: rows, error: error || null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    }
    function makeMockGhosts() {
      var lastSet = null;
      var defaults = {
        resonancePool: ['그래.'], vaguePool: ['글쎄.'], dissonancePool: ['아니야.'],
      };
      return {
        setOptions: function (o) { lastSet = o; },
        getOptions: function () { return JSON.parse(JSON.stringify(defaults)); },
        _peek: function () { return lastSet; },
      };
    }

    // 14a. missing_deps — supabase null
    (async function () {
      var g14a = makeMockGhosts();
      var r = await loadFn(null, 'mem-1', g14a);
      ok('14a loadAndInjectGhostPools — supabase null → missing_deps',
        r.injected === false && r.reason === 'missing_deps');

      // 14b. missing_deps — memoryId 빈
      var g14b = makeMockGhosts();
      var r14b = await loadFn(makeMockSupabase([]), '', g14b);
      ok('14b — memoryId 빈 → missing_deps',
        r14b.injected === false && r14b.reason === 'missing_deps');

      // 14c. select_failed — error 발생
      var g14c = makeMockGhosts();
      var r14c = await loadFn(makeMockSupabase(null, { message: 'mock err' }), 'mem-c', g14c);
      ok('14c — SELECT error → select_failed',
        r14c.injected === false && r14c.reason === 'select_failed');
      ok('14c — setOptions 호출 X (디폴트 유지)', g14c._peek() === null);

      // 14d. no_anchor — rows 0
      var g14d = makeMockGhosts();
      var r14d = await loadFn(makeMockSupabase([]), 'mem-d', g14d);
      ok('14d — rows 0 → no_anchor',
        r14d.injected === false && r14d.reason === 'no_anchor');

      // 14e. no_anchor — anchor.emotion_vec 빈
      var g14e = makeMockGhosts();
      var r14e = await loadFn(makeMockSupabase([
        { id: 'a1', kind: 'drift', is_seed: true, parent_variant_id: null, utterance: 'x', emotion_vec: {} },
      ]), 'mem-e', g14e);
      ok('14e — anchor emotion_vec 빈 → no_anchor',
        r14e.injected === false && r14e.reason === 'no_anchor');

      // 14f. too_few — 변주 0 (anchor 만 있음, 분류 가능 변주 0)
      var g14f = makeMockGhosts();
      var r14f = await loadFn(makeMockSupabase([
        { id: 'a1', kind: 'drift', is_seed: true, parent_variant_id: null, utterance: 'anchor', emotion_vec: { fear: 1 } },
        { id: 'v1', kind: 'drift', is_seed: false, parent_variant_id: null, utterance: 'v1', emotion_vec: { fear: 1 } },
        { id: 'v2', kind: 'drift', is_seed: false, parent_variant_id: null, utterance: 'v2', emotion_vec: { fear: 0.95 } },
      ]), 'mem-f', g14f);
      ok('14f — 분류 변주 2 < 3 → too_few',
        r14f.injected === false && r14f.reason === 'too_few');

      // 14g. 정상 — anchor 1 + 변주 4 (resonance 2 + vague 1 + dissonance 1)
      var g14g = makeMockGhosts();
      var r14g = await loadFn(makeMockSupabase([
        // anchor: fear 1
        { id: 'a1', kind: 'drift', is_seed: true, parent_variant_id: null, utterance: 'anchor', emotion_vec: { fear: 1 } },
        // resonance: cosine ≥ 0.85 — 같은 축
        { id: 'r1', kind: 'drift', is_seed: false, parent_variant_id: null, utterance: 'r1', emotion_vec: { fear: 0.95 } },
        { id: 'r2', kind: 'drift', is_seed: false, parent_variant_id: null, utterance: 'r2', emotion_vec: { fear: 0.9 } },
        // vague: 0.5 ~ 0.85 — fear+sadness 섞음 → cos ≈ 0.71
        { id: 'v1', kind: 'drift', is_seed: false, parent_variant_id: null, utterance: 'v1', emotion_vec: { fear: 0.5, sadness: 0.5 } },
        // dissonance: < 0.5 — orthogonal joy
        { id: 'd1', kind: 'drift', is_seed: false, parent_variant_id: null, utterance: 'd1', emotion_vec: { joy: 1 } },
      ]), 'mem-g-aaaaaaaa', g14g);
      ok('14g — 정상 분류 → injected: true',
        r14g.injected === true);
      ok('14g — counts.resonance === 2', r14g.counts && r14g.counts.resonance === 2);
      ok('14g — counts.vague === 1', r14g.counts && r14g.counts.vague === 1);
      ok('14g — counts.dissonance === 1', r14g.counts && r14g.counts.dissonance === 1);
      ok('14g — anchorId === a1', r14g.anchorId === 'a1');
      // setOptions 호출 결과 풀 검증
      var setOpts = g14g._peek();
      ok('14g — setOptions resonancePool 2', setOpts && setOpts.resonancePool && setOpts.resonancePool.length === 2);
      ok('14g — setOptions vaguePool 1',     setOpts && setOpts.vaguePool && setOpts.vaguePool.length === 1);
      ok('14g — setOptions dissonancePool 1',setOpts && setOpts.dissonancePool && setOpts.dissonancePool.length === 1);
      ok('14g — resonance utterance 포함', setOpts && setOpts.resonancePool.indexOf('r1') >= 0 && setOpts.resonancePool.indexOf('r2') >= 0);
      ok('14g — dissonance utterance 포함', setOpts && setOpts.dissonancePool.indexOf('d1') >= 0);

      // 14h. 빈 결 디폴트 fallback — anchor 1 + 변주 3 모두 resonance (vague/dissonance 풀 빔)
      var g14h = makeMockGhosts();
      var r14h = await loadFn(makeMockSupabase([
        { id: 'a1', kind: 'drift', is_seed: true, parent_variant_id: null, utterance: 'anchor', emotion_vec: { fear: 1 } },
        { id: 'r1', kind: 'drift', is_seed: false, parent_variant_id: null, utterance: 'r1', emotion_vec: { fear: 0.95 } },
        { id: 'r2', kind: 'drift', is_seed: false, parent_variant_id: null, utterance: 'r2', emotion_vec: { fear: 0.9 } },
        { id: 'r3', kind: 'drift', is_seed: false, parent_variant_id: null, utterance: 'r3', emotion_vec: { fear: 0.95 } },
      ]), 'mem-h', g14h);
      var setH = g14h._peek();
      ok('14h — vague 빔 → 디폴트 fallback ([\'글쎄.\'])',
        setH && setH.vaguePool && setH.vaguePool.length === 1 && setH.vaguePool[0] === '글쎄.');
      ok('14h — dissonance 빔 → 디폴트 fallback ([\'아니야.\'])',
        setH && setH.dissonancePool && setH.dissonancePool.length === 1 && setH.dissonancePool[0] === '아니야.');

      // 결과 — 전체 비동기라 마지막에 출력
      console.log('\n=== V2.1 Phase 1 smoke ===');
      console.log('PASS:', pass, '/ FAIL:', fail);
      if (fail) {
        console.warn('Failed tests:');
        failed.forEach(function (n) { console.warn('  -', n); });
      }
    })();
  } else {
    ok('DP._utils.loadAndInjectGhostPools 노출됨', false);
    // 14 SKIP — 동기 결과 즉시 출력
    console.log('\n=== V2.1 Phase 1 smoke ===');
    console.log('PASS:', pass, '/ FAIL:', fail);
    if (fail) {
      console.warn('Failed tests:');
      failed.forEach(function (n) { console.warn('  -', n); });
    }
  }
  // 결과 출력 — 14 분기 안에서 1회 (정상 비동기 끝 / SKIP 동기 즉시).
})();

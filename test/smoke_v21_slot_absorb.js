// test/smoke_v21_slot_absorb.js
// V2.1.2 슬롯 흡수 smoke — DevTools Console 붙여넣기 (browser).
// 의존: 페이지 로드 후 window.LumenSlotAbsorber / LumenGhostResponse 가용.
//
// 관련: docs/슬롯흡수_차용-260505.md
//       js/core/SlotAbsorber.js
//       js/ui/lumen_ghost_response.js (resonanceSlotPool / vagueSlotPool)
//
// 검증 자리:
//   1. SlotAbsorber 모듈 로드
//   2. extractNoun — 어미 패턴 ("엄마를", "아빠가", "노란 우산")
//   3. extractNoun — BLOCK_NOUNS 차단 (욕설·금기)
//   4. extractNoun — TOO_GENERIC_NOUNS 차단 ("거", "것", "수")
//   5. fillTemplate — 받침 처리 (을/를, 이/가, 은/는)
//   6. classifyResonance 임계 (0.55/0.35)
//   7. tryAbsorb — resonance 결 흡수 성공
//   8. tryAbsorb — dissonance 결 흡수 X (null)
//   9. tryAbsorb — 빈 풀 흡수 X (null)
//  10. tryAbsorb — 빈 입력 흡수 X (null)
//  11. tryAbsorb — 결정론적 (같은 시드 → 같은 결과)
//  12. LumenGhostResponse.getSlotPool — 풀 옵션 접근자
//  13. LumenGhostResponse.setOptions 슬롯 풀 주입 → getSlotPool 반영
//  14. _utils.applyJosa — 받침 케이스
//
// PASS 합계 / FAIL 합계 마지막에 출력.

(function () {
  var pass = 0, fail = 0;
  var failed = [];
  function ok(name, cond) {
    if (cond) { console.log('✓', name); pass++; }
    else      { console.error('✗', name); fail++; failed.push(name); }
  }

  var SA = window.LumenSlotAbsorber;
  var GR = window.LumenGhostResponse;

  // ─── 1. 모듈 로드 ───
  ok('LumenSlotAbsorber module loaded', !!SA);
  ok('LumenGhostResponse module loaded', !!GR);

  if (!SA) { console.error('SlotAbsorber 없음 — 나머지 검증 skip'); return; }

  // ─── 2. extractNoun 어미 패턴 ───
  var n1 = SA.extractNoun('엄마를 기다렸어');
  ok('extractNoun 엄마를 → noun=엄마', n1 && n1.noun === '엄마' && n1.type === 'object');

  var n2 = SA.extractNoun('아빠가 거기 있었어');
  ok('extractNoun 아빠가 → noun=아빠', n2 && n2.noun === '아빠' && n2.type === 'object');

  var n3 = SA.extractNoun('노란 우산을 들고 있었어');
  ok('extractNoun 노란 우산 → color', n3 && n3.noun === '노란 우산' && n3.type === 'color');

  var n4 = SA.extractNoun('아무 말도 없었어');
  // 첫 명사구 = "말도" → "말" + "도"는 어미 패턴에 없음. NOUN_RX 매치 없음 — null 또는 다른 매치
  // 패턴 정합 — 일반 케이스. "말도"는 매치 X. 결과 type 검사 안 함, null 가능.
  ok('extractNoun "말도" 어미 매치 없음 → null 또는 fallback', n4 === null || (n4 && n4.noun));

  // ─── 3. BLOCK_NOUNS 차단 ───
  var n5 = SA.extractNoun('시발이 거기 있었어');
  ok('extractNoun 시발 차단 → null', n5 === null);

  var n6 = SA.extractNoun('자살을 생각했어');
  ok('extractNoun 자살 차단 → null', n6 === null);

  // ─── 4. TOO_GENERIC_NOUNS 차단 ───
  var n7 = SA.extractNoun('거를 봤어');
  ok('extractNoun "거" generic 차단 → null', n7 === null);

  var n8 = SA.extractNoun('나는 거기 있었어');
  // "나" + "는" → BLOCK. "거기" 는 어미 매치 X. 결과 null.
  ok('extractNoun "나는" generic 차단 → null', n8 === null);

  // ─── 5. fillTemplate 받침 처리 ───
  ok('fillTemplate {대상:을/를} 엄마(받침X) → 엄마를',
    SA.fillTemplate('{대상:을/를} 기다렸어', '엄마') === '엄마를 기다렸어');
  ok('fillTemplate {대상:을/를} 동생(받침O) → 동생을',
    SA.fillTemplate('{대상:을/를} 기다렸어', '동생') === '동생을 기다렸어');
  ok('fillTemplate {대상:이/가} 엄마(받침X) → 엄마가',
    SA.fillTemplate('{대상:이/가} 거기', '엄마') === '엄마가 거기');
  ok('fillTemplate {대상:이/가} 동생(받침O) → 동생이',
    SA.fillTemplate('{대상:이/가} 거기', '동생') === '동생이 거기');
  ok('fillTemplate {대상:은/는} 엄마 → 엄마는',
    SA.fillTemplate('{대상:은/는}', '엄마') === '엄마는');
  ok('fillTemplate {대상:은/는} 동생 → 동생은',
    SA.fillTemplate('{대상:은/는}', '동생') === '동생은');
  ok('fillTemplate {대상} 그대로',
    SA.fillTemplate('나는 {대상}', '엄마') === '나는 엄마');

  // ─── 6. classifyResonance 임계 ───
  ok('classifyResonance(0.7) === resonance',  SA.classifyResonance(0.7)  === 'resonance');
  ok('classifyResonance(0.55) === resonance', SA.classifyResonance(0.55) === 'resonance');
  ok('classifyResonance(0.50) === vague',     SA.classifyResonance(0.50) === 'vague');
  ok('classifyResonance(0.35) === vague',     SA.classifyResonance(0.35) === 'vague');
  ok('classifyResonance(0.30) === dissonance',SA.classifyResonance(0.30) === 'dissonance');

  // ─── 7. tryAbsorb resonance 흡수 성공 ───
  var slotPool = {
    resonance: [
      { template: '...그래. {대상:이/가} 거기 있었구나.', motifTags: ['함께'] },
    ],
    vague: [
      { template: '...{대상}? 그랬을지도.', motifTags: ['흔들림'] },
    ],
  };
  var a1 = SA.tryAbsorb({
    memoryId: 'mem1', sceneId: 'scn1', turn: 1,
    alignment: 0.7, playerInput: '엄마를 기다렸잖아',
    slotPool: slotPool,
  });
  ok('tryAbsorb resonance success', a1 && a1.absorbed === true && a1.resonance === 'resonance');
  ok('tryAbsorb resonance reply contains 엄마', a1 && a1.reply && a1.reply.indexOf('엄마') !== -1);
  ok('tryAbsorb resonance josa 엄마가', a1 && a1.reply && a1.reply.indexOf('엄마가') !== -1);

  // ─── 8. tryAbsorb dissonance 흡수 X ───
  var a2 = SA.tryAbsorb({
    memoryId: 'mem1', sceneId: 'scn1', turn: 1,
    alignment: 0.2, playerInput: '엄마를 기다렸잖아',
    slotPool: slotPool,
  });
  ok('tryAbsorb dissonance → null', a2 === null);

  // ─── 9. tryAbsorb 빈 풀 → null ───
  var a3 = SA.tryAbsorb({
    memoryId: 'mem1', sceneId: 'scn1', turn: 1,
    alignment: 0.7, playerInput: '엄마를 기다렸잖아',
    slotPool: { resonance: [], vague: [] },
  });
  ok('tryAbsorb empty pool → null', a3 === null);

  // ─── 10. tryAbsorb 빈 입력 → null ───
  var a4 = SA.tryAbsorb({
    memoryId: 'mem1', sceneId: 'scn1', turn: 1,
    alignment: 0.7, playerInput: '',
    slotPool: slotPool,
  });
  ok('tryAbsorb empty input → null', a4 === null);

  // ─── 11. tryAbsorb 결정론 (같은 시드 → 같은 결과) ───
  var a5a = SA.tryAbsorb({
    memoryId: 'mem1', sceneId: 'scn1', turn: 2,
    alignment: 0.7, playerInput: '동생이 거기 있었어',
    slotPool: slotPool,
  });
  var a5b = SA.tryAbsorb({
    memoryId: 'mem1', sceneId: 'scn1', turn: 2,
    alignment: 0.7, playerInput: '동생이 거기 있었어',
    slotPool: slotPool,
  });
  ok('tryAbsorb deterministic same seed → same reply',
    a5a && a5b && a5a.reply === a5b.reply);

  // ─── 12. GhostResponse.getSlotPool ───
  if (GR) {
    ok('LumenGhostResponse.getSlotPool exists', typeof GR.getSlotPool === 'function');
    var pool = GR.getSlotPool();
    ok('getSlotPool returns {resonance, vague}',
      pool && Array.isArray(pool.resonance) && Array.isArray(pool.vague));

    // ─── 13. setOptions 슬롯 풀 주입 ───
    GR.setOptions({
      resonanceSlotPool: [{ template: '...{대상}이 있었어.', motifTags: [] }],
      vagueSlotPool: [],
    });
    var pool2 = GR.getSlotPool();
    ok('setOptions resonanceSlotPool injected → 1', pool2.resonance.length === 1);
    ok('setOptions vagueSlotPool injected → 0', pool2.vague.length === 0);
    // 원복 (다른 검증 영향 X)
    GR.setOptions({ resonanceSlotPool: [], vagueSlotPool: [] });
  }

  // ─── 14. _utils.applyJosa ───
  if (SA._utils && typeof SA._utils.applyJosa === 'function') {
    ok('applyJosa 엄마 + 을/를 → 를', SA._utils.applyJosa('엄마', '을/를') === '를');
    ok('applyJosa 동생 + 을/를 → 을', SA._utils.applyJosa('동생', '을/를') === '을');
    ok('applyJosa 엄마 + 이/가 → 가', SA._utils.applyJosa('엄마', '이/가') === '가');
    ok('applyJosa 동생 + 이/가 → 이', SA._utils.applyJosa('동생', '이/가') === '이');
  }

  // ─── 결과 ───
  console.log('═══════════════════════════════════════════');
  console.log('[v21.2 slot absorb smoke] PASS=' + pass + ' FAIL=' + fail);
  if (fail > 0) console.error('FAILED:', failed);
  console.log('═══════════════════════════════════════════');
})();

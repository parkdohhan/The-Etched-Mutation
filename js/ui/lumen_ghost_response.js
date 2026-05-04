/**
 * Lumen Ghost Response — V2.1 Phase 1
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260429.md §4 V2.1 Phase 1
 *
 * 자유대화 매 턴 반응 + 유령 권유 + 장면 잇기 prompt — 셋 모두 결정론적 pick.
 * alignment 임계 0.55/0.35 → 공명/흐릿/불일치 결 분류 (math.js getBucket 동일).
 *
 * 풀 어휘 출처:
 *   - resonance: bridge 유령 어휘 (lumen_return_speech.js) + Record Chat 톤 + 신규 1
 *   - vague:     core 유령 + SILENCE_REACTIONS (recordChat.js) 1 + 신규 3
 *   - dissonance: 신규 7개 시드
 *   - urge: 결마다 3개씩
 *   - scene_link_prompt: 결마다 1개
 *
 * 시드 = `lgr|${memoryId}|${sceneId}|${turn}` (response)
 *      / `lgu|${memoryId}|${sceneId}` (urge)
 *      / scene_link 은 결만 보고 고정 (시드 X)
 *
 * 같은 (memoryId, sceneId, turn, 결) → 같은 reply.
 *
 * dissonance quoting: 풀 중 `'____'` 마커 있는 어휘는 placeholder 자리에 입력에서 추출한
 * 2~5단어 짧은 구절 삽입. 단순 첫 N단어 추출 (motif 추출은 V3).
 *
 * 원본 수정 안 함. 단독 모듈, 다른 모듈 의존 0.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    resonancePool: [
      '그래, 그렇단 말이지.',
      '맞아. 너도 그랬구나.',
      '분명 그랬지.',
      '...그래. 그게 그거였어.',
      '너도 같은 자리에 서 있었구나.',
    ],
    vaguePool: [
      '그랬었나... 확신이 안 서.',
      '...글쎄. 그랬을 수도.',
      '그게 그런 거였나.',
      '...어쩌면.',
      '...너의 말이 흔들리네.',
      '침묵도 대답이 될 수 있어.',
    ],
    dissonancePool: [
      "'____'라고? ... 내 기억과는 다른데.",
      '잠깐. 그건 그게 아니야.',
      '그랬을 리가 없는데.',
      '넌 그렇게 봤구나. 난 다르게 봤어.',
      '...아니야. 내가 기억하는 건 그게 아니야.',
      '그게 정말 그랬을까. 확실해?',
      '...너는 그렇게 기억하고 있는 거야?',
    ],
    urgeResonance: [
      '더 따라가봐. 그 다음으로.',
      '더 깊이 가보자.',
      '여기서 다음 자리로.',
    ],
    urgeVague: [
      '여기 더 머물래?',
      '잠깐, 천천히 가자.',
      '조금 더 풀어볼까.',
    ],
    urgeDissonance: [
      '다른 길로 가볼래?',
      '그럼 다른 자리에서 다시 만나자.',
      '...너의 자리로 가야겠다.',
    ],
    sceneLinkPrompt: {
      resonance: '이 자리에 남길 한 마디?',
      vague: '흐려지기 전에 한 줄?',
      dissonance: '너의 길에 한 줄 남겨.',
    },
    // V2.1.2 슬롯 흡수 풀 — 비어 있으면 흡수 X. 메모리 진입 시 setOptions 로 주입.
    // 각 변주 = { template: '...{대상}을(를)...', motifTags?: [...] }
    // 실제 흡수는 LumenSlotAbsorber.tryAbsorb 가 담당. 본 모듈은 풀 보관 자리만.
    resonanceSlotPool: [],
    vagueSlotPool: [],
    // 임계 — math.js getBucket HIGH/MID/LOW 와 동일
    alignmentResonance: 0.55,
    alignmentVague: 0.35,
    // dissonance quoting
    quoteWordMin: 2,
    quoteWordMax: 5,
    quoteMarker: "'____'",
  };

  var _opts = Object.assign({}, DEFAULTS);

  function setOptions(o) {
    Object.assign(_opts, o || {});
    return _opts;
  }
  function getOptions() { return JSON.parse(JSON.stringify(_opts)); }

  // ─── PRNG (FNV-1a + mulberry32) — lumen_return_speech.js 와 동일 패턴 ───
  function _hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }
  function _mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _seededPick(arr, seedStr) {
    if (!arr || !arr.length) return null;
    var rng = _mulberry32(_hashString(seedStr));
    return arr[Math.floor(rng() * arr.length)];
  }

  // ─── 결 분류 ───
  function classifyResonance(alignment) {
    var a = Number(alignment);
    if (!isFinite(a)) return 'vague';
    if (a >= _opts.alignmentResonance) return 'resonance';
    if (a >= _opts.alignmentVague) return 'vague';
    return 'dissonance';
  }

  // ─── dissonance quoting ───
  function _extractQuote(playerInput) {
    if (!playerInput || typeof playerInput !== 'string') return null;
    // 공백·구두점 토큰화 (한국어 마침표·쉼표 포함)
    var tokens = playerInput.trim().split(/[\s\.,\?!、。…]+/).filter(Boolean);
    if (!tokens.length) return null;
    var n = Math.min(tokens.length, _opts.quoteWordMax);
    n = Math.max(_opts.quoteWordMin, Math.min(tokens.length, n));
    return tokens.slice(0, n).join(' ');
  }

  function _applyQuote(reply, playerInput) {
    if (!reply || reply.indexOf(_opts.quoteMarker) === -1) return reply;
    var quote = _extractQuote(playerInput);
    if (!quote) return reply.replace(_opts.quoteMarker, '...');
    return reply.replace(_opts.quoteMarker, "'" + quote + "'");
  }

  // ─── API ───
  /**
   * 자유대화 매 턴 반응 결정.
   * @param {{memoryId:string, sceneId:string, turn:number, alignment:number, playerInput?:string}} input
   * @returns {{resonance:'resonance'|'vague'|'dissonance', reply:string}}
   */
  function pickResponse(input) {
    input = input || {};
    var resonance = classifyResonance(input.alignment);
    var pool =
      resonance === 'resonance' ? _opts.resonancePool :
      resonance === 'vague'      ? _opts.vaguePool :
                                   _opts.dissonancePool;
    var seed = 'lgr|' + (input.memoryId || '') + '|' + (input.sceneId || '') + '|' + (input.turn || 0);
    var picked = _seededPick(pool, seed);
    var reply = _applyQuote(picked, input.playerInput);
    return { resonance: resonance, reply: reply };
  }

  /**
   * 자유대화 종료 후 다음 장면 권유 어휘.
   * @param {{memoryId:string, sceneId:string, alignment:number}} input
   * @returns {{resonance:'resonance'|'vague'|'dissonance', urge:string}}
   */
  function pickUrge(input) {
    input = input || {};
    var resonance = classifyResonance(input.alignment);
    var pool =
      resonance === 'resonance' ? _opts.urgeResonance :
      resonance === 'vague'      ? _opts.urgeVague :
                                   _opts.urgeDissonance;
    var seed = 'lgu|' + (input.memoryId || '') + '|' + (input.sceneId || '');
    var picked = _seededPick(pool, seed);
    return { resonance: resonance, urge: picked };
  }

  /**
   * 장면 잇기 한 줄 입력 프롬프트.
   * @param {number} alignment
   * @returns {string}
   */
  function pickSceneLinkPrompt(alignment) {
    var resonance = classifyResonance(alignment);
    return _opts.sceneLinkPrompt[resonance] || _opts.sceneLinkPrompt.vague;
  }

  // ─── debug ───
  function getDebug() {
    return {
      opts: getOptions(),
      counts: {
        resonance: _opts.resonancePool.length,
        vague: _opts.vaguePool.length,
        dissonance: _opts.dissonancePool.length,
        urgeResonance: _opts.urgeResonance.length,
        urgeVague: _opts.urgeVague.length,
        urgeDissonance: _opts.urgeDissonance.length,
        resonanceSlot: _opts.resonanceSlotPool.length,
        vagueSlot: _opts.vagueSlotPool.length,
      },
    };
  }

  // V2.1.2 슬롯 풀 접근자 — LumenDialogPhase1 가 LumenSlotAbsorber 에 주입할 때 사용.
  function getSlotPool() {
    return {
      resonance: _opts.resonanceSlotPool || [],
      vague: _opts.vagueSlotPool || [],
    };
  }

  global.LumenGhostResponse = {
    setOptions: setOptions,
    getOptions: getOptions,
    classifyResonance: classifyResonance,
    pickResponse: pickResponse,
    pickUrge: pickUrge,
    pickSceneLinkPrompt: pickSceneLinkPrompt,
    getSlotPool: getSlotPool,
    getDebug: getDebug,
  };
})(typeof window !== 'undefined' ? window : globalThis);

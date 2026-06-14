/**
 * Lumen Ghost Response — V2.1 Phase 1
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260506.md §4 V2.1 Phase 1
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
 * 입력 인용 (input quoting, 2026-05-06 모호 결까지 확장):
 *   풀 중 `'____'` 마커 있는 어휘는 placeholder 자리에 입력에서 추출한 2~5단어 짧은 구절 삽입.
 *   `_applyQuote` 는 결 무관하게 작동 — 마커 박힌 변주는 어느 풀(공명/모호/충돌)에 박혀도 동일 동작.
 *   공명 결은 부드러운 받아침이라 인용 어색 (의도적 미박). 모호·충돌 결만 마커 박음.
 *   단순 첫 N단어 추출 (motif 추출은 V3).
 *
 * 원본 수정 안 함. 단독 모듈, 다른 모듈 의존 0.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    resonancePool: {
      ko: [
        '그래, 그렇단 말이지.',
        '맞아. 너도 그랬구나.',
        '분명 그랬지.',
        '...그래. 그게 그거였어.',
        '너도 같은 자리에 서 있었구나.',
      ],
      en: [
        'So — that is what it was.',
        'Yes. You knew it too.',
        'It was so, surely.',
        '...yes. It came to the same thing.',
        'You stood in the same place.',
      ],
    },
    vaguePool: {
      ko: [
        '그랬었나... 확신이 안 서.',
        '...글쎄. 그랬을 수도.',
        '그게 그런 거였나.',
        '...어쩌면.',
        '...너의 말이 흔들리네.',
        '침묵도 대답이 될 수 있어.',
        // `'____'` 마커는 _applyQuote 에서 입력 일부로 치환 (모호·충돌 결만).
        "'____'라... 그게 그랬던가, 잘 모르겠어.",
        "'____'... 흐릿하게 떠오르긴 하는데.",
      ],
      en: [
        'Was it so... I am not certain.',
        '...well. It may have been.',
        'Was it that kind of thing.',
        '...perhaps.',
        '...your words waver.',
        'Silence can be an answer too.',
        "'____', was it... I do not quite know if it was so.",
        "'____'... it surfaces, but faintly.",
      ],
    },
    dissonancePool: {
      ko: [
        "'____'라고? ... 내 기억과는 다른데.",
        '잠깐. 그건 그게 아니야.',
        '그랬을 리가 없는데.',
        '넌 그렇게 봤구나. 난 다르게 봤어.',
        '...아니야. 내가 기억하는 건 그게 아니야.',
        '그게 정말 그랬을까. 확실해?',
        '...너는 그렇게 기억하고 있는 거야?',
      ],
      en: [
        "'____'? ... that is not how I remember it.",
        'Wait. That is not what it was.',
        'It could not have been so.',
        'You saw it that way. I saw it otherwise.',
        '...no. What I remember is not that.',
        'Was it really so. Are you certain?',
        '...is that how you remember it?',
      ],
    },
    urgeResonance: {
      ko: ['더 따라가봐. 그 다음으로.', '더 깊이 가보자.', '여기서 다음 자리로.'],
      en: ['Follow it further. To the next.', 'Let us go deeper.', 'From here, to the next place.'],
    },
    urgeVague: {
      ko: ['여기 더 머물래?', '잠깐, 천천히 가자.', '조금 더 풀어볼까.'],
      en: ['Stay here a little longer?', 'Wait — let us go slowly.', 'Shall we unfold it a little more.'],
    },
    urgeDissonance: {
      ko: ['다른 길로 가볼래?', '그럼 다른 자리에서 다시 만나자.', '...너의 자리로 가야겠다.'],
      en: ['Take another way?', 'Then let us meet again elsewhere.', '...I should go to your place.'],
    },
    sceneLinkPrompt: {
      ko: {
        resonance: '이 자리에 남길 한 마디?',
        vague: '흐려지기 전에 한 줄?',
        dissonance: '너의 길에 한 줄 남겨.',
      },
      en: {
        resonance: 'A word to leave in this place?',
        vague: 'One line, before it blurs?',
        dissonance: 'Leave one line on your way.',
      },
    },
    // V2.1.2 슬롯 흡수 풀 — 메모리 진입 시 setOptions 로 작가 손 풀 주입. 풀 X 메모리는
    // 본 글로벌 디폴트 사용 (resetSlotPools()). 각 변주 = { template, motifTags?: [...] }.
    // 실제 흡수는 LumenSlotAbsorber.tryAbsorb 가 담당. 본 모듈은 풀 보관 자리만.
    //
    // V2.1.2 콘텐츠 fallback (2026-05-05) — 발자국 외 8 메모리 absorption_slots 비어 있음.
    // 본 디폴트 박혀 있어 모든 메모리에서 슬롯 흡수 발동. 균일 톤. 작가 손 풀 주입 시 덮임.
    // 핸드아웃: docs/세션핸드아웃_v21_콘텐츠_fallback-260505.md
    resonanceSlotPool: {
      ko: [
        { template: '그래. {대상:이/가} 거기 있었구나.', motifTags: [] },
        { template: '{대상} 말이지. 그랬어.', motifTags: [] },
      ],
      en: [
        { template: 'Yes. {대상} was there.', motifTags: [] },
        { template: '{대상}, then. It was so.', motifTags: [] },
      ],
    },
    vagueSlotPool: {
      ko: [
        { template: '{대상}? 그랬을지도.', motifTags: [] },
        { template: '...{대상}. 흐릿한데.', motifTags: [] },
      ],
      en: [
        { template: '{대상}? It may have been.', motifTags: [] },
        { template: '...{대상}. It is faint.', motifTags: [] },
      ],
    },
    // 임계 — math.js getBucket HIGH/MID/LOW 와 동일
    alignmentResonance: 0.55,
    alignmentVague: 0.35,
    // 2026-05-06: 결마다 파동 펄스 깜빡임 방지 (V2-5 보강 — 파동 부활).
    // 진입/이탈 분리 buffer + 결 잡힌 후 최소 holdMs 유지. V2-12 튜닝 대상.
    hysteresisBuffer: 0.04,
    hysteresisHoldMs: 250,
    // dissonance quoting
    quoteWordMin: 2,
    quoteWordMax: 5,
    quoteMarker: "'____'",
  };

  var _opts = Object.assign({}, DEFAULTS);

  // 현재 플레이 언어 — play-test.html 이 document.documentElement.lang 에 LANG 박음.
  function _lang() {
    try { return (document.documentElement.lang || 'en').slice(0, 2) === 'ko' ? 'ko' : 'en'; }
    catch (_) { return 'en'; }
  }
  // 풀 해소 — {ko,en} 객체면 현재 언어 배열, flat 배열이면(주입된 ghost_variants) 그대로 통과.
  function _resolvePool(p) {
    if (Array.isArray(p)) return p;
    if (p && typeof p === 'object') return p[_lang()] || p.en || p.ko || [];
    return [];
  }

  function setOptions(o) {
    Object.assign(_opts, o || {});
    return _opts;
  }
  function getOptions() { return JSON.parse(JSON.stringify(_opts)); }

  // V2.1.2 (2026-05-05) — loadMemoryData 가 absorption_slots 비어 있을 때 호출.
  // 메모리 간 stale 방지: 이전 메모리 setOptions 로 덮은 풀을 글로벌 디폴트로 회복.
  function resetSlotPools() {
    _opts.resonanceSlotPool = DEFAULTS.resonanceSlotPool;
    _opts.vagueSlotPool = DEFAULTS.vagueSlotPool;
  }

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

  // ─── 결 분류 (히스테리시스 적용) ───
  // 2026-05-06: 진입/이탈 buffer + 시간 hold 로 결 깜빡임 방지.
  // alignment 0.54↔0.56 식으로 떨려도 결이 한번 잡히면 안정 유지.
  // 시각/펄스 호출은 안정 결을 받음. resetHysteresis() 로 회차 시작 시 초기화.
  //
  // 비대칭 임계 — 결 유지 zone:
  //   resonance 유지: a >= rExit (=alignmentResonance-buf)
  //   dissonance 유지: a < vExit (=alignmentVague+buf)
  // 결 이탈 시 다음 결 결정은 *진입 임계*(rEnter/vEnter)로 — 두 결이 *맞물리지* 않게.
  var _resState = { kind: 'vague', since: -Infinity };

  function _now() {
    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function classifyResonance(alignment) {
    var a = Number(alignment);
    if (!isFinite(a)) return _resState.kind;

    var buf = _opts.hysteresisBuffer || 0;
    var hold = _opts.hysteresisHoldMs || 0;
    var t = _now();

    // 시간 바닥: 결 잡힌 후 holdMs 이내면 같은 결 유지
    if (hold > 0 && (t - _resState.since) < hold) {
      return _resState.kind;
    }

    // 진입/이탈 임계
    var rEnter = _opts.alignmentResonance;          // 0.55
    var rExit  = _opts.alignmentResonance - buf;    // 0.51
    var vEnter = _opts.alignmentVague;              // 0.35
    var vExit  = _opts.alignmentVague + buf;        // 0.39

    var nextKind;
    if (_resState.kind === 'resonance') {
      // 공명 유지 zone: a >= rExit. 이탈 시 vEnter 로 vague/dissonance 갈림.
      if (a >= rExit) nextKind = 'resonance';
      else if (a < vEnter) nextKind = 'dissonance';
      else nextKind = 'vague';
    } else if (_resState.kind === 'dissonance') {
      // 충돌 유지 zone: a < vExit. 이탈 시 rEnter 로 vague/resonance 갈림.
      if (a < vExit) nextKind = 'dissonance';
      else if (a >= rEnter) nextKind = 'resonance';
      else nextKind = 'vague';
    } else {
      // vague — 일반 임계로 전환 시도
      if (a >= rEnter) nextKind = 'resonance';
      else if (a < vEnter) nextKind = 'dissonance';
      else nextKind = 'vague';
    }

    if (nextKind !== _resState.kind) {
      _resState.kind = nextKind;
      _resState.since = t;
    }
    return _resState.kind;
  }

  function resetHysteresis() {
    _resState = { kind: 'vague', since: -Infinity };
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
    var pool = _resolvePool(
      resonance === 'resonance' ? _opts.resonancePool :
      resonance === 'vague'      ? _opts.vaguePool :
                                   _opts.dissonancePool);
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
    var pool = _resolvePool(
      resonance === 'resonance' ? _opts.urgeResonance :
      resonance === 'vague'      ? _opts.urgeVague :
                                   _opts.urgeDissonance);
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
    var slp = _opts.sceneLinkPrompt || {};
    var map = (slp.ko || slp.en) ? (slp[_lang()] || slp.en || slp.ko || {}) : slp;
    return map[resonance] || map.vague || '';
  }

  // ─── debug ───
  function getDebug() {
    return {
      opts: getOptions(),
      counts: {
        resonance: _resolvePool(_opts.resonancePool).length,
        vague: _resolvePool(_opts.vaguePool).length,
        dissonance: _resolvePool(_opts.dissonancePool).length,
        urgeResonance: _resolvePool(_opts.urgeResonance).length,
        urgeVague: _resolvePool(_opts.urgeVague).length,
        urgeDissonance: _resolvePool(_opts.urgeDissonance).length,
        resonanceSlot: _resolvePool(_opts.resonanceSlotPool).length,
        vagueSlot: _resolvePool(_opts.vagueSlotPool).length,
      },
    };
  }

  // V2.1.2 슬롯 풀 접근자 — LumenDialogPhase1 가 LumenSlotAbsorber 에 주입할 때 사용.
  function getSlotPool() {
    return {
      resonance: _resolvePool(_opts.resonanceSlotPool),
      vague: _resolvePool(_opts.vagueSlotPool),
    };
  }

  global.LumenGhostResponse = {
    setOptions: setOptions,
    getOptions: getOptions,
    resetSlotPools: resetSlotPools,  // V2.1.2 콘텐츠 fallback (2026-05-05)
    resetHysteresis: resetHysteresis, // 2026-05-06: 회차 시작 시 결 상태 초기화 (V2-5 보강)
    classifyResonance: classifyResonance,
    pickResponse: pickResponse,
    pickUrge: pickUrge,
    pickSceneLinkPrompt: pickSceneLinkPrompt,
    getSlotPool: getSlotPool,
    getDebug: getDebug,
  };
})(typeof window !== 'undefined' ? window : globalThis);

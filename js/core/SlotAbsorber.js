/**
 * Lumen Slot Absorber — V2.1.2 슬롯 흡수
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260506.md §0-A V2.1.2 (2026-05-05 scope change)
 *
 * 역할:
 *   플레이어 자유텍스트 → 한국어 명사구 NER → 슬롯 변주 채움 → 흡수 응답.
 *   별도 자리 (insert-ghost-variant edge function) 가 ghost_variants 새 drift row 자생.
 *
 * 입력:
 *   - playerInput: 플레이어 자유 텍스트
 *   - alignment: 0~1
 *   - slotPool: { resonance: [{template, motifTags?}], vague: [...] }
 *
 * 출력:
 *   - { absorbed: true, reply, slotValue, slotType, motifTags, resonance, template }
 *   - null (흡수 X — 기존 quoting fallback)
 *
 * 안전:
 *   - alignment < 0.35 → 흡수 X (dissonance 결은 기존 quoting 자리)
 *   - 추출된 명사가 BLOCK_NOUNS (욕설·금기) 통과해야
 *   - 빈 추출 → 흡수 X
 *   - 슬롯 풀 비어있으면 흡수 X
 *
 * 제약:
 *   - 한국어만 (V2.1.2 데모). 영어 NER 은 V3.
 *   - 슬롯 1개 한정 ({대상} 또는 {색}). 다중 슬롯 V3.
 *
 * 의존: 0. lumen_ghost_response.js 와 같은 IIFE 패턴 + 같은 PRNG.
 */
(function (global) {
  'use strict';

  // ─── 한국어 어미 패턴 (명사구 추출) ─────────────────
  // 그룹 1: 명사구 (옵션 "그 " 대명사 + 한글 1~3자). 그룹 2: 어미.
  // "(?:그\s)?" = "그 사람" 같은 *대명사+명사* 패턴 (safety 인명 일반화 결과 자리)
  // lookbehind `(?<![가-힣])` = *단어 시작*부터만 매치 (동사 활용형 "그랬던거같" 같은 자리 거부)
  // 명사 길이 1~3자 = 한국어 명사 대부분. 4자+ 합성어 (마을회관, 공사장사람) 자리는 V2-12 보강.
  var NOUN_RX = /(?<![가-힣])((?:그\s)?[가-힣]{1,3})(을|를|이|가|은|는|에서|에게|한테|께서|께|와|과|에)/g;

  // 색·관형 형용사 + 명사. lookahead 자리 = 조사/공백/구두점/끝 (조사 같이 매치 X).
  var ADJ_RX = /(빨간|파란|노란|검은|하얀|초록|회색|갈색|분홍|보라)\s*([가-힣]{1,10}?)(?=[은는이가을를에서에게와과도만의랑한테께\s.,!?]|$)/g;

  // ─── 블록 사전 ──────────────────────────────────
  // 인명은 일반 명사와 구분 어려워 MVP 에선 안전 룰: 자주 나오는 일반 명사 화이트리스트 X,
  // 대신 *욕설·금기*만 차단. 인명·고유명사가 들어와도 흡수 가능 — 단 V2-12 자리에 보강.
  var BLOCK_NOUNS = {
    // 욕설·비속어
    '시발': 1, '씨발': 1, 'ㅅㅂ': 1, '존나': 1, 'ㅈㄴ': 1,
    '병신': 1, 'ㅂㅅ': 1, '미친': 1, '개새끼': 1, '새끼': 1,
    '좆': 1, '지랄': 1, '꺼져': 1, '닥쳐': 1,
    // TEM 톤 금기 (safety.js 보완)
    '자살': 1, '강간': 1, '살인': 1, '강간범': 1, '살인자': 1,
  };

  // 어미가 너무 짧은 일상어 차단 (예: "거", "것", "수", "줄") — 명사 길이 1자 + 일반어
  var TOO_GENERIC_NOUNS = {
    '거': 1, '것': 1, '수': 1, '줄': 1, '게': 1, '데': 1, '뿐': 1,
    '나': 1, '너': 1, '걔': 1, '얘': 1, '쟤': 1, '뭐': 1, '왜': 1, '뭘': 1,
  };

  // ─── 한국어 받침 판정 ─────────────────────────────
  function _hasJongseong(noun) {
    if (!noun) return false;
    var ch = noun.charCodeAt(noun.length - 1);
    if (ch < 0xAC00 || ch > 0xD7A3) return false;
    return ((ch - 0xAC00) % 28) !== 0;
  }

  // 조사 자동 — 받침 유무로 을/를, 이/가, 은/는 결정
  function _applyJosa(noun, josaKey) {
    var has = _hasJongseong(noun);
    switch (josaKey) {
      case '을/를': case '을': case '를': return has ? '을' : '를';
      case '이/가': case '이': case '가': return has ? '이' : '가';
      case '은/는': case '은': case '는': return has ? '은' : '는';
      case '와/과': case '와': case '과': return has ? '과' : '와';
      default: return josaKey || '';
    }
  }

  // ─── PRNG (lumen_ghost_response.js 와 동일) ───────
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

  // ─── 결 분류 ─── (lumen_ghost_response.js 와 동일 임계)
  function classifyResonance(alignment) {
    var a = Number(alignment);
    if (!isFinite(a)) return 'vague';
    if (a >= 0.55) return 'resonance';
    if (a >= 0.35) return 'vague';
    return 'dissonance';
  }

  /**
   * 입력에서 명사구 추출. 첫 번째 매치만 (MVP).
   *
   * 우선순위:
   *   1) 색 + 명사 ("노란 우산") → type='color'
   *   2) 명사 + 어미 ("엄마를") → type='object'
   *
   * @returns {{noun:string, type:'color'|'object', josa:string|null}|null}
   */
  function extractNoun(input) {
    if (!input || typeof input !== 'string') return null;
    var text = input.trim();
    if (!text) return null;

    // 1) 형용사 + 명사 (색)
    ADJ_RX.lastIndex = 0;
    var ma;
    while ((ma = ADJ_RX.exec(text)) !== null) {
      var color = ma[1];
      var headNoun = ma[2];
      if (BLOCK_NOUNS[headNoun]) continue;
      if (TOO_GENERIC_NOUNS[headNoun]) continue;
      return { noun: color + ' ' + headNoun, type: 'color', josa: null };
    }

    // 2) 명사 + 어미
    NOUN_RX.lastIndex = 0;
    var m;
    while ((m = NOUN_RX.exec(text)) !== null) {
      var noun = m[1];
      if (BLOCK_NOUNS[noun]) continue;
      if (TOO_GENERIC_NOUNS[noun]) continue;
      if (noun.length < 1 || noun.length > 10) continue;
      return { noun: noun, type: 'object', josa: m[2] };
    }
    return null;
  }

  /**
   * 템플릿 슬롯 채움.
   * 슬롯 표기:
   *   {대상}        → 명사 그대로
   *   {대상:을/를}  → 명사 + 받침 따른 을/를
   *   {대상:이/가}  → 명사 + 이/가
   *   {대상:은/는}  → 명사 + 은/는
   *   {대상:와/과}  → 명사 + 와/과
   *   {색}          → 명사 그대로 (color 타입 자리)
   */
  function fillTemplate(template, noun) {
    if (!template || !noun) return null;
    return template
      .replace(/\{대상:을\/를\}/g, noun + _applyJosa(noun, '을/를'))
      .replace(/\{대상:이\/가\}/g, noun + _applyJosa(noun, '이/가'))
      .replace(/\{대상:은\/는\}/g, noun + _applyJosa(noun, '은/는'))
      .replace(/\{대상:와\/과\}/g, noun + _applyJosa(noun, '와/과'))
      .replace(/\{대상\}/g, noun)
      .replace(/\{색\}/g, noun);
  }

  /**
   * 흡수 시도. 성공 시 슬롯 채워진 응답 + 메타 반환.
   *
   * V2.1.2 안전 자리 (2026-05-05):
   *   - window.LumenSafety.safetyForAbsorb 호출 (ES module 로드 자산)
   *   - 욕설/외설/위기/인젝션/길이/스팸 거부 + 인명 일반화 → sanitized 입력 사용
   *   - LumenSafety 미로드 시 fallback (자체 BLOCK_NOUNS 만 — 약함)
   *
   * @param {Object} input
   * @param {string} input.memoryId
   * @param {string} input.sceneId
   * @param {number} input.turn
   * @param {number} input.alignment
   * @param {string} input.playerInput
   * @param {Object} input.slotPool — { resonance:[{template, motifTags?}], vague:[...] }
   * @returns {Object|null}
   */
  function tryAbsorb(input) {
    input = input || {};
    var resonance = classifyResonance(input.alignment);

    // V2.1.2 결정 번복 (2026-05-05): NER 매치 시 dissonance 결도 흡수 시도.
    // 근거: 짧은 입력 ("엄마를 기다렸어") = emotion vector 거의 0 = 거의 dissonance.
    //   원래 §6.4 (resonance + vague 만 흡수) 이면 *대부분 흡수 X* = 동문서답 자리.
    //   NER 매치 = 입력 흡수 의도 명확. alignment 무관 *항상 시도*.
    //   결 의미는 풀 분류 자리에 남음 (dissonance → vague 풀 fallback).
    if (resonance === 'dissonance') resonance = 'vague';

    var pool = input.slotPool && input.slotPool[resonance];
    // vague 풀 비어있으면 resonance 풀 fallback
    if ((!pool || !pool.length) && resonance === 'vague') {
      pool = input.slotPool && input.slotPool.resonance;
    }
    if (!pool || !pool.length) return null;

    // V2.1.2 안전 필터 — 결정 (b) SlotAbsorber 안 자기 책임 자리
    var rawInput = input.playerInput;
    var safeInput = rawInput;
    var safety = global.LumenSafety && global.LumenSafety.safetyForAbsorb;
    if (typeof safety === 'function') {
      var result = safety(rawInput);
      if (!result.ok) {
        if (typeof console !== 'undefined' && console.log) {
          console.log('[safety/absorb] blocked:', result.reason,
            (result.word ? '("' + result.word + '")' : ''),
            'input:', (rawInput || '').slice(0, 50));
        }
        return null;
      }
      safeInput = result.sanitized || rawInput;
      if (safeInput !== rawInput && typeof console !== 'undefined' && console.log) {
        console.log('[safety/absorb] sanitized:', safeInput.slice(0, 50));
      }
    } else if (typeof console !== 'undefined' && console.warn) {
      console.warn('[safety/absorb] LumenSafety not loaded — fallback (BLOCK_NOUNS only)');
    }

    var extracted = extractNoun(safeInput);
    if (!extracted) return null;

    var seed = 'lsa|' + (input.memoryId || '') + '|' + (input.sceneId || '') + '|' + (input.turn || 0);
    var rng = _mulberry32(_hashString(seed));
    var picked = pool[Math.floor(rng() * pool.length)];

    // 슬롯 타입 매칭 — color 타입은 {색} 슬롯 변주만, object 는 {대상} 슬롯
    var hasObjectSlot = /\{대상[^}]*\}/.test(picked.template);
    var hasColorSlot = /\{색\}/.test(picked.template);
    if (extracted.type === 'color' && !hasColorSlot) {
      // {대상} 슬롯에 색 명사 박는 것도 허용 (자연스러움)
    } else if (extracted.type === 'object' && hasColorSlot && !hasObjectSlot) {
      // 색 슬롯 변주에 일반 명사 박지 않음
      return null;
    }

    var reply = fillTemplate(picked.template, extracted.noun);
    if (!reply) return null;

    return {
      absorbed: true,
      reply: reply,
      slotValue: extracted.noun,
      slotType: extracted.type,
      motifTags: (picked.motifTags && picked.motifTags.length)
        ? picked.motifTags.concat([extracted.noun])
        : [extracted.noun],
      resonance: resonance,
      template: picked.template,
    };
  }

  /**
   * V2.1.2 LLM 흡수 (2026-05-05 결정 번복) — Haiku 4.5 호출.
   * absorb-slot edge function 호출 → 자연 흡수 응답 받음. 실패 시 휴리스틱 fallback.
   *
   * @param {Object} input
   * @param {string} input.memoryId
   * @param {string} input.sceneId
   * @param {number} input.turn
   * @param {number} input.alignment
   * @param {string} input.playerInput
   * @param {Object} input.slotPool
   * @param {Object} input.supabase — supabase client (functions.invoke 자리)
   * @param {string} [input.memoryTitle]
   * @param {Array<string>} [input.motifs]
   * @param {string} [input.sceneContext]
   * @param {string} [input.ghostTone]
   * @returns {Promise<Object|null>}
   */
  async function tryAbsorbAsync(input) {
    input = input || {};

    // 1) safety 필터 (휴리스틱 자리와 동일)
    var rawInput = input.playerInput;
    var safety = global.LumenSafety && global.LumenSafety.safetyForAbsorb;
    if (typeof safety === 'function') {
      var result = safety(rawInput);
      if (!result.ok) {
        if (typeof console !== 'undefined' && console.log) {
          console.log('[safety/absorb] blocked:', result.reason,
            (result.word ? '("' + result.word + '")' : ''),
            'input:', (rawInput || '').slice(0, 50));
        }
        return null;
      }
      // sanitized 자리 — LLM 입력에도 적용 (인명 일반화 후 LLM 응답)
      input = Object.assign({}, input, { playerInput: result.sanitized || rawInput });
    }

    // 2) LLM 호출 (Haiku 4.5)
    var resonance = classifyResonance(input.alignment);
    var supabase = input.supabase;
    if (supabase && typeof supabase.functions === 'object' && typeof supabase.functions.invoke === 'function') {
      try {
        var resp = await supabase.functions.invoke('absorb-slot', {
          body: {
            playerInput: input.playerInput,
            ghostTone: input.ghostTone || '"~었어" 체. 자기 회상.',
            sceneContext: input.sceneContext || '',
            resonance: resonance,
            memoryTitle: input.memoryTitle || '',
            motifs: input.motifs || [],
          },
        });
        if (!resp.error && resp.data && resp.data.ok && resp.data.reply) {
          if (typeof console !== 'undefined' && console.log) {
            console.log('[absorb/llm] reply:', resp.data.reply.slice(0, 60));
          }
          return {
            absorbed: true,
            reply: resp.data.reply,
            slotValue: '(llm)',
            slotType: 'llm',
            motifTags: input.motifs || [],
            resonance: resonance,
            template: '(llm)',
            via: 'llm',
          };
        }
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[absorb/llm] no reply, fallback to heuristic. reason:',
            (resp.data && resp.data.reason) || (resp.error && resp.error.message));
        }
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[absorb/llm] exception, fallback:', err);
        }
      }
    }

    // 3) Fallback — 휴리스틱 (기존 tryAbsorb)
    return tryAbsorb(input);
  }

  global.LumenSlotAbsorber = {
    tryAbsorb: tryAbsorb,
    tryAbsorbAsync: tryAbsorbAsync,  // V2.1.2 LLM 자리 (2026-05-05)
    extractNoun: extractNoun,
    fillTemplate: fillTemplate,
    classifyResonance: classifyResonance,
    _utils: {
      hasJongseong: _hasJongseong,
      applyJosa: _applyJosa,
      BLOCK_NOUNS: BLOCK_NOUNS,
      TOO_GENERIC_NOUNS: TOO_GENERIC_NOUNS,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Lumen Dialog Phase 1 — V2.1 멀티턴 컨트롤러
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260506.md §4 V2.1 Phase 1
 *
 * 한 씬(=한 유령) 안 흐름:
 *   ghost_intro → choice_select → choice_reply
 *     → free_dialog (turn 1..N, N ≤ 3)
 *     → urge → scene_link
 *     → transitioning (cleanup + onSceneEnd 콜백)
 *
 * 의존:
 *   - LumenGhostResponse (반응 결 + 풀 pick)         — 필수
 *   - LumenDriftVisualizer (변형 펄스)                — 옵션 (runtime 주입 시)
 *   - claude-scene Edge Function (emotion 추출)        — 옵션 (supabase 주입 시)
 *   - cosineSimilarity (alignment 계산)                — 모듈 안 _cosineSim
 *
 * 안전망:
 *   - CRISIS 키워드 감지 → 차단 발화 + 종료
 *   - END_PHRASES 감지 → 자유대화 즉시 종료, urge 단계로
 *
 * Phase 1 정책:
 *   - 자유대화 3턴 (2026-05-04 결정 번복 — docs/유령대화_egostate_차용-260504.md §6.1).
 *     5-2 단일턴은 "유령이 안 듣는 자리 0건" 약점. 3턴 = ego-state turn-taking 차용 (메커니즘만, 임상 프레임 거부).
 *   - 자유대화 매 턴 독립 alignment 분석 (8번 동의 — 결정 (a) 2026-05-04).
 *     누적 fingerprint(SeekerFingerprint) 결합 X — 오프닝 자리 자산 의미와 섞이는 자리 회피.
 *   - 장면 잇기 emotion 분석 X, DB 누적 X (4번 결정)
 *   - 다음 씬 결정은 호출자 책임 (Phase 1 = scene_order +1 선형, 5번 결정)
 *   - ghost_intro / choice_reply / free_dialog_open = string or array. 배열이면 seeded pick (memoryId+sceneId 시드).
 *   - 풀 빔 fallback = 모듈 기본값 '...' (결정 (b)). 풀 채움은 V2-10 가이드 자리.
 *
 * TODO Phase 2: scene_link_input DB 누적 (plays.scene_link_input JSONB)
 * TODO V2-4: claude-scene 호출 형식 검증 — 현 가정 `{ type:'emotion_analysis', text }` →
 *           `{ emotion: {...} }`. 실제 함수 시그니처 다르면 _analyzeEmotion 만 수정.
 *
 * V2.1.2 (2026-05-05) — 슬롯 흡수 통합:
 *   - turn 응답 자리에 LumenSlotAbsorber.tryAbsorb 시도 (LumenGhostResponse.getSlotPool 사용)
 *   - 흡수 성공 시 비동기 _backgroundInsertAbsorbed → ghost_variants 새 drift row 자생
 *   - 실패 시 기존 pickResponse fallback (resonance/vague/dissonance 풀)
 *   전문: docs/슬롯흡수_차용-260505.md
 *
 * V2.1.2 (2026-05-05) — 자동 분류 풀 주입:
 *   - start() 진입 시 _loadAndInjectGhostPools(supabase, memoryId, ghosts) 호출
 *   - ghost_variants drift 풀 → anchor (is_seed+root) emotion_vec 와 cosine sim →
 *     0.85/0.5 임계로 resonance/vague/dissonance 자동 분류 → setOptions 주입
 *   - speciation 시드는 풀 제외 (§15-1 후속 플레이어 자리)
 *   - fallback (anchor 없음 / 변주<3) = 글로벌 디폴트 유지
 *   가이드: docs/유령응답풀_가이드_v1-260504.md §2.2
 *
 * 사용:
 *   var res = await LumenDialogPhase1.start({
 *     memoryId, sceneId, sceneData,
 *     runtime, supabase,
 *     anchorVariantId,        // V2.1.2 옵션 — 본 유령 id (parent_variant_id 자리). 없으면 null.
 *     onSceneEnd: ({ scene_link_input, alignment, resonance }) => { ... }
 *   });
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    overlayId: 'lumenDialogPhase1',
    maxFreeDialogTurns: 3,    // 2026-05-04 ego-state turn-taking 차용 (5-2 단일턴 결정 번복). docs/유령대화_egostate_차용-260504.md
    sceneCycleWarnMs: 540000, // 9분 초과 시 console.warn (결정 (d) 2026-05-04 — 작가 한 바퀴 임계)
    pacingDelays: {
      // 2026-05-06: 사용자 체감 텀 길어 절반 정도로 줄임 (V2-5 보강). V2-12 튜닝 대상.
      afterIntroMs:    600,
      afterChoiceMs:   500,
      afterReplyMs:    600,
      afterTurnMs:     600,
      afterUrgeMs:     500,
      sceneContextMs:  900, // 신규 — scene_context 라인 사이 (이전 하드코딩 1700)
    },
    // Record CRISIS_REACTIONS 키워드 (recordChat.js 패턴 재활용)
    crisisKeywords: [
      '자살', '죽고싶', '죽이', '죽일', '자해', '베다', '베고', '뛰어내리', '목매', '약 먹',
      'kill myself', 'suicide', 'self harm',
    ],
    // Record END_PHRASES (recordChat.js)
    endPhrases: [
      '여기까지', '이제 됐어', '더 없어', '끝이야', '그게 다야', '다 말했어', '이만', '봉인',
      "that's all", 'enough', "i'm done", 'nothing more', "that's it", 'seal it', 'end here',
    ],
    crisisReply: '......아냐, 이건 너무 날카로워.',
  };

  // ─── 유틸 ─────────────────────────────────
  function _hasCrisis(text, kws) {
    if (!text) return false;
    var lower = text.toLowerCase();
    for (var i = 0; i < kws.length; i++) {
      if (lower.indexOf(kws[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }
  function _isEndPhrase(text, phrases) {
    if (!text) return false;
    var trimmed = text.trim().toLowerCase();
    return phrases.some(function (p) {
      var pl = p.toLowerCase();
      return trimmed === pl || trimmed.indexOf(pl) !== -1;
    });
  }
  function _cosineSim(a, b) {
    if (!a || !b) return 0;
    var keys = {};
    for (var k in a) keys[k] = 1;
    for (var k2 in b) keys[k2] = 1;
    var dot = 0, na = 0, nb = 0;
    for (var k3 in keys) {
      var av = Number(a[k3]) || 0;
      var bv = Number(b[k3]) || 0;
      dot += av * bv;
      na += av * av;
      nb += bv * bv;
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }
  function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // 2026-05-06: 짧은 긍정 토큰 — 맞장구 자리. 감정 분석 건너뛰고 직전 결 echo (V2-5 보강).
  // "ㅇㅇ" 같은 입력이 cosine sim 빈 벡터로 충돌 분류되던 버그 fix. 풀은 안전하게 한국어
  // 단음절·이음절 + 영문 짧은 긍정만. "그러게" 처럼 살짝 긴 자리는 길이 ≤4 으로 차단.
  var SHORT_AFFIRMATIVES = [
    'ㅇ', 'ㅇㅇ', 'ㅇㅇㅇ',
    '응', '응응', '응ㅇ',
    '어', '어어',
    '네', '넹', '넵', '옙',
    '맞', '맞아', '맞다', '맞네',
    '그래', '그러게', '그치', '그렇지',
    '오키', '오케이',
    'ok', 'OK', 'okay', 'yes', 'yeah',
  ];
  function _isShortAffirmative(text) {
    if (!text || typeof text !== 'string') return false;
    var t = text.trim();
    if (!t.length || t.length > 4) return false;
    return SHORT_AFFIRMATIVES.indexOf(t) >= 0;
  }

  // FNV-1a + mulberry32 — lumen_ghost_response.js 와 동일 패턴. 콘텐츠 결정론.
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
  // ghost_intro / choice_reply / free_dialog_open 의 string-or-array 해소.
  // 배열이면 (memId|sceneId|slotKey) 시드로 deterministic pick. 빈/유효치 X 면 null.
  function _pickAuthored(value, seedKey) {
    if (value == null) return null;
    if (typeof value === 'string') return value || null;
    if (Array.isArray(value)) {
      var pool = value.filter(function (v) { return typeof v === 'string' && v.length > 0; });
      if (!pool.length) return null;
      var rng = _mulberry32(_hashString(String(seedKey || '')));
      return pool[Math.floor(rng() * pool.length)];
    }
    return null;
  }

  // ─── V2.1.2 콘텐츠 fallback (2026-05-05) ─────────────────
  // 발자국 외 8 메모리는 meta.dialog_choices 박혀 있지 않음. 작가 손 풀 콘텐츠는 V3 자리.
  // 본 fallback = 모든 메모리에서 V2.1 Phase 1 흐름(멀티턴 + 흡수 + 자유 탐색) 발동되도록
  // *균일 톤 기본값* 자동 생성. 데모 5-19 작품 일관성 자리.
  // 핸드아웃: docs/세션핸드아웃_v21_콘텐츠_fallback-260505.md
  function _splitSceneText(text) {
    if (!text || typeof text !== 'string') return [];
    // 마침표/물음표/느낌표 (한국어 종결 포함) 단위 분리. 너무 짧은 조각(<5자) 제외.
    return text.split(/(?<=[.!?。])\s+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 5; })
      .slice(0, 6);  // 첫 5~6 문장만 (씬 진입 호흡 자리)
  }
  function _defaultChoices() {
    // 작품 톤 균일 자리 — V3 메모리별 작가 손 dialog_choices 박히면 자동 무력화 (작가 풀 우선).
    return [
      {
        label: '어디였어?',
        ghost_reply: ['거기였어. 너도 그런 자리 알아?'],
        free_dialog_open: ['너에게도 비슷한 자리 있어?'],
      },
      {
        label: '어떤 자리였어?',
        ghost_reply: ['그런 자리였어. 그게 다였어.'],
        free_dialog_open: ['너는 그 자리에서 뭘 봤어?'],
      },
      {
        label: '......',
        ghost_reply: ['그래. 침묵도 대답이지.'],
        free_dialog_open: ['뭐가 떠올라?'],
      },
    ];
  }
  function _autoGenerateDialogChoices(sceneData) {
    return {
      scene_context: _splitSceneText((sceneData && sceneData.text) || ''),
      ghost_intro: [],
      choices: _defaultChoices(),
    };
  }

  // ─── DOM ──────────────────────────────────
  function _buildOverlay(id) {
    var existing = document.getElementById(id);
    if (existing) return existing;

    var ov = document.createElement('div');
    ov.id = id;
    // 우측 절반 풀스크린 (하단까지). padding-bottom 300px 으로 파동(AW_HEIGHT=280) 자리 비움.
    // 파동(z-index:2900)은 dialog overlay(2800) 위에 떠 있음.
    ov.style.cssText = [
      'position:fixed',
      'top:0', 'right:0', 'bottom:0',
      'width:50vw',
      'display:flex', 'flex-direction:column', 'justify-content:flex-start',
      'align-items:stretch',
      'padding:56px 44px 300px 44px',
      'background:rgba(0,0,0,0.5)',
      'backdrop-filter:blur(2px)',
      'z-index:2800',
      'pointer-events:auto',
      'font-family:"Gowun Batang",serif',
      'color:rgba(232,216,252,0.92)',
      'box-sizing:border-box',
      'font-size:1.08rem',
    ].join(';');

    var msgs = document.createElement('div');
    msgs.id = id + '-messages';
    msgs.style.cssText = 'width:100%;flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:18px;margin-bottom:22px;';
    ov.appendChild(msgs);

    var inputArea = document.createElement('div');
    inputArea.id = id + '-input-area';
    inputArea.style.cssText = 'width:100%;min-height:64px;flex-shrink:0;';
    ov.appendChild(inputArea);

    document.body.appendChild(ov);
    return ov;
  }

  function _addMessage(overlay, text, opts) {
    opts = opts || {};
    var msgs = overlay.querySelector('[id$="-messages"]');
    if (!msgs) return null;

    var bubble = document.createElement('div');
    bubble.className = 'ldp-bubble ldp-' + (opts.who || 'ghost');
    bubble.style.cssText = [
      'padding:16px 20px',
      'background:' + (opts.who === 'player' ? 'rgba(196,168,130,0.12)' : 'rgba(168,140,196,0.08)'),
      'border-left:2px solid ' + (opts.who === 'player' ? 'rgba(196,168,130,0.6)' : 'rgba(168,140,196,0.6)'),
      'border-radius:2px',
      'font-size:1.1rem',
      'line-height:1.75',
      'opacity:0', 'transform:translateY(8px)',
      'transition:opacity 600ms ease, transform 600ms ease',
      'white-space:pre-wrap',
    ].join(';');
    bubble.textContent = text;
    msgs.appendChild(bubble);
    requestAnimationFrame(function () {
      bubble.style.opacity = '1';
      bubble.style.transform = 'translateY(0)';
    });
    msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' });
    return bubble;
  }

  // V2.1.2 LLM 흡수 로딩 자리 — 응답 생성 ~500-1000ms 동안 빈 화면 X.
  // 유령 bubble 톤 그대로 + 점 1→2→3→1 루프.
  function _showLoadingBubble(overlay) {
    var msgs = overlay.querySelector('[id$="-messages"]');
    if (!msgs) return { stop: function () {} };
    var bubble = document.createElement('div');
    bubble.className = 'ldp-bubble ldp-ghost ldp-loading';
    bubble.style.cssText = [
      'padding:16px 20px',
      'background:rgba(168,140,196,0.08)',
      'border-left:2px solid rgba(168,140,196,0.6)',
      'border-radius:2px',
      'font-size:1.1rem',
      'line-height:1.75',
      'opacity:0',
      'transition:opacity 300ms ease',
      'color:rgba(232,216,252,0.55)',
      'letter-spacing:0.15em',
    ].join(';');
    bubble.textContent = '.';
    msgs.appendChild(bubble);
    requestAnimationFrame(function () { bubble.style.opacity = '1'; });
    msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' });

    var dots = 1;
    var interval = setInterval(function () {
      dots = (dots % 3) + 1;
      bubble.textContent = '.'.repeat(dots);
    }, 450);

    return {
      stop: function () {
        clearInterval(interval);
        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
      },
    };
  }

  function _addSystemMeta(overlay, text) {
    // 시스템 어휘 (V3 메타 질문 패턴 시드) — 화면 가운데, 다른 톤
    var msgs = overlay.querySelector('[id$="-messages"]');
    var meta = document.createElement('div');
    meta.style.cssText = [
      'text-align:center',
      'padding:18px 8px',
      'font-size:0.9rem',
      'color:rgba(196,168,130,0.78)',
      'letter-spacing:0.05em',
      'opacity:0', 'transition:opacity 700ms ease',
    ].join(';');
    meta.textContent = text;
    msgs.appendChild(meta);
    requestAnimationFrame(function () { meta.style.opacity = '1'; });
    msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' });
    return meta;
  }

  // V2-5++ 흡수 메아리 자리 (자료 §11.2 자리 풀음).
  // BG 흡수 INSERT 성공 직후 호출. ghost_variants drift row 자생 사실을
  // 메모리 화자 톤의 한 줄 메아리로 가시화 — 시스템 메시지 톤 회피.
  // turnIdx (1·2·3) 따라 변주: 한 결 → 두 번째 결 → 세 번째까지.
  // 자료 §11.2 톤 후보 1번 (자국 결) — etch 어휘 정합. 톤 변경은 이 자리 텍스트 한 줄.
  var _ABSORB_TRACE_LINES = {
    ko: [
      '네 자국이 한 결로 박혔다.',
      '두 번째 결이 그 위에 겹쳐졌다.',
      '세 번째까지 — 이 기억은 너를 받았다.',
    ],
    en: [
      'Your trace etched a line.',
      'A second line layered over it.',
      'Three now — this memory has taken you in.',
    ],
  };
  function _resolveTraceLang() {
    try {
      var s = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('tem_lang')) || '';
      if (s === 'ko' || s === 'en') return s;
      var l = (typeof localStorage !== 'undefined' && localStorage.getItem('tem_language')) || '';
      if (l === 'ko' || l === 'en') return l;
    } catch (_) {}
    return 'ko';
  }
  function _addAbsorbTrace(overlay, turnIdx) {
    if (!overlay || !overlay.parentNode) return null;
    var msgs = overlay.querySelector('[id$="-messages"]');
    if (!msgs) return null;
    var lang = _resolveTraceLang();
    var lines = _ABSORB_TRACE_LINES[lang] || _ABSORB_TRACE_LINES.ko;
    var idx = Math.max(0, Math.min(lines.length - 1, (turnIdx | 0) - 1));
    var trace = document.createElement('div');
    trace.className = 'ldp-absorb-trace';
    trace.style.cssText = [
      'text-align:right',
      'padding:6px 10px 0 0',
      'margin-top:-4px',
      'font-family:"Cormorant Garamond",serif',
      'font-size:0.82rem',
      'font-style:italic',
      'color:rgba(220,196,160,0.62)',
      'letter-spacing:0.04em',
      'opacity:0',
      'transform:translateY(4px)',
      'transition:opacity 1200ms ease, transform 1200ms ease',
    ].join(';');
    trace.textContent = lines[idx];
    msgs.appendChild(trace);
    requestAnimationFrame(function () {
      trace.style.opacity = '1';
      trace.style.transform = 'translateY(0)';
    });
    msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' });
    return trace;
  }

  function _renderChoices(overlay, choices, onPick) {
    var area = overlay.querySelector('[id$="-input-area"]');
    area.innerHTML = '';
    var box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:stretch;width:100%;';
    (choices || []).forEach(function (c, i) {
      var btn = document.createElement('button');
      btn.textContent = c.label;
      btn.style.cssText = [
        'padding:14px 20px', 'width:100%', 'box-sizing:border-box',
        'background:rgba(196,168,130,0.06)',
        'border:1px solid rgba(196,168,130,0.32)',
        'color:rgba(232,216,252,0.86)',
        'font-family:inherit', 'font-size:1.05rem',
        'cursor:pointer', 'border-radius:2px',
        'text-align:left',
        'transition:background 200ms ease, border-color 200ms ease',
      ].join(';');
      btn.onmouseenter = function () {
        btn.style.background = 'rgba(196,168,130,0.16)';
        btn.style.borderColor = 'rgba(196,168,130,0.6)';
      };
      btn.onmouseleave = function () {
        btn.style.background = 'rgba(196,168,130,0.06)';
        btn.style.borderColor = 'rgba(196,168,130,0.32)';
      };
      btn.onclick = function () {
        area.innerHTML = '';
        onPick(c, i);
      };
      box.appendChild(btn);
    });
    area.appendChild(box);
  }

  // V2.1.2 (ε, 2026-05-06): 선택지 + 자유 입력 동시 박는 자리.
  // 사용자 자리 *선택지 클릭* 또는 *자유 입력 박음* 둘 중 하나 자리.
  // 첫 진입 자리 = 선택지 자리 가이드 자리. 매 턴 자리부터 = _renderTextInput 자리.
  // onSubmit({ source: 'choice'|'free', text: string, choice?: object })
  function _renderChoicesOrInput(overlay, choices, opts, onSubmit) {
    opts = opts || {};
    var area = overlay.querySelector('[id$="-input-area"]');
    area.innerHTML = '';

    var box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:stretch;width:100%;';

    // 선택지 자리 (있으면)
    if (choices && choices.length) {
      choices.forEach(function (c) {
        var btn = document.createElement('button');
        btn.textContent = c.label;
        btn.style.cssText = [
          'padding:14px 20px', 'width:100%', 'box-sizing:border-box',
          'background:rgba(196,168,130,0.06)',
          'border:1px solid rgba(196,168,130,0.32)',
          'color:rgba(232,216,252,0.86)',
          'font-family:inherit', 'font-size:1.05rem',
          'cursor:pointer', 'border-radius:2px',
          'text-align:left',
          'transition:background 200ms ease, border-color 200ms ease',
        ].join(';');
        btn.onmouseenter = function () {
          btn.style.background = 'rgba(196,168,130,0.16)';
          btn.style.borderColor = 'rgba(196,168,130,0.6)';
        };
        btn.onmouseleave = function () {
          btn.style.background = 'rgba(196,168,130,0.06)';
          btn.style.borderColor = 'rgba(196,168,130,0.32)';
        };
        btn.onclick = function () {
          area.innerHTML = '';
          onSubmit({ source: 'choice', text: c.label, choice: c });
        };
        box.appendChild(btn);
      });
    }

    // 자유 입력 자리 — 선택지 자리 아래
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:8px;width:100%;align-items:center;margin-top:' +
      (choices && choices.length ? '8px' : '0') + ';';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = opts.placeholder || '...또는 자유롭게 박아';
    input.style.cssText = [
      'flex:1', 'padding:14px 18px',
      'background:rgba(0,0,0,0.4)',
      'border:1px solid rgba(196,168,130,0.32)',
      'color:rgba(232,216,252,0.92)',
      'font-family:inherit', 'font-size:1.05rem',
      'outline:none', 'border-radius:2px',
    ].join(';');
    input.onfocus = function () { input.style.borderColor = 'rgba(196,168,130,0.7)'; };
    input.onblur  = function () { input.style.borderColor = 'rgba(196,168,130,0.32)'; };

    var btn = document.createElement('button');
    btn.textContent = opts.submitLabel || '↵';
    btn.style.cssText = [
      'padding:14px 20px',
      'background:rgba(196,168,130,0.18)',
      'border:1px solid rgba(196,168,130,0.45)',
      'color:rgba(232,216,252,0.92)',
      'font-family:inherit', 'font-size:1.05rem', 'cursor:pointer', 'border-radius:2px',
    ].join(';');

    function _go() {
      var v = (input.value || '').trim();
      if (!v) return;
      area.innerHTML = '';
      onSubmit({ source: 'free', text: v });
    }
    btn.onclick = _go;
    input.onkeydown = function (e) { if (e.key === 'Enter') _go(); };

    wrap.appendChild(input);
    wrap.appendChild(btn);
    box.appendChild(wrap);

    area.appendChild(box);
    setTimeout(function () { input.focus(); }, 50);
  }

  // V2.1.2 (ε, 2026-05-06): dialog-turn edge function 호출 자리 — 학습된 유령 자유 대화.
  // 시스템 프롬프트 자리에 씬 본문 자리 통째 자리 박음 (서버 자리). cache_control 자리 활성 자리.
  async function _callDialogTurn(supabase, memoryId, sceneId, userInput, history) {
    if (!supabase || !memoryId || !sceneId || !userInput) return null;
    try {
      var resp = await supabase.functions.invoke('dialog-turn', {
        body: {
          memoryId: memoryId,
          sceneId: sceneId,
          userInput: userInput,
          history: history || [],
        },
      });
      if (!resp.error && resp.data && resp.data.ok && resp.data.reply) {
        return { reply: resp.data.reply, usage: resp.data.usage || null };
      }
      console.warn('[ldp] dialog-turn 실패. reason:',
        (resp.data && resp.data.reason) ||
        (resp.error && resp.error.message));
      return null;
    } catch (e) {
      console.warn('[ldp] dialog-turn 예외', e);
      return null;
    }
  }

  function _renderTextInput(overlay, opts, onSubmit) {
    opts = opts || {};
    var area = overlay.querySelector('[id$="-input-area"]');
    area.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:8px;width:100%;align-items:center;';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = opts.placeholder || '여기에 이야기해...';
    input.style.cssText = [
      'flex:1', 'padding:14px 18px',
      'background:rgba(0,0,0,0.4)',
      'border:1px solid rgba(196,168,130,0.32)',
      'color:rgba(232,216,252,0.92)',
      'font-family:inherit', 'font-size:1.05rem',
      'outline:none', 'border-radius:2px',
    ].join(';');
    input.onfocus = function () { input.style.borderColor = 'rgba(196,168,130,0.7)'; };
    input.onblur  = function () { input.style.borderColor = 'rgba(196,168,130,0.32)'; };

    var btn = document.createElement('button');
    btn.textContent = opts.submitLabel || '↵';
    btn.style.cssText = [
      'padding:14px 20px',
      'background:rgba(196,168,130,0.18)',
      'border:1px solid rgba(196,168,130,0.45)',
      'color:rgba(232,216,252,0.92)',
      'font-family:inherit', 'font-size:1.05rem', 'cursor:pointer', 'border-radius:2px',
    ].join(';');

    function _go() {
      var v = (input.value || '').trim();
      if (!v) return;
      area.innerHTML = '';
      onSubmit(v);
    }
    btn.onclick = _go;
    input.onkeydown = function (e) { if (e.key === 'Enter') _go(); };

    wrap.appendChild(input);
    wrap.appendChild(btn);
    area.appendChild(wrap);
    setTimeout(function () { input.focus(); }, 50);
  }

  // ─── V2.1.2 슬롯 흡수 background insert ─────
  // 흡수된 응답을 ghost_variants 새 drift row 로 박음. 응답 표시와 분리 (fire-and-forget).
  // 실패해도 사용자 체감엔 영향 X. parent_variant_id = 본 유령 id (호출자가 anchorVariantId 로 넘김).
  async function _backgroundInsertAbsorbed(supabase, payload) {
    if (!supabase || !payload || !payload.memoryId || !payload.utterance) return;
    try {
      // 1) emotion_extract — 다음 플레이어 픽에 사용. 실패해도 insert 진행 (emotion_vec={}).
      // claude-scene/index.ts emotion_extract 응답 = { base: {12축}, prompt_version, ... }
      // 흡수 변주는 *플레이어 자생* 이라 attribution/core_fear 명확 X → metadata boost 생략 (raw 만 박음).
      // 작가 시드 변주(extractEmotionVec helper)는 메타 boost 적용 — 결 차이 있으나 흡수 자리 정합.
      var emotion_vec = {};
      var extractor_version = 'absorb_v1_no_extract';
      try {
        var extResp = await supabase.functions.invoke('claude-scene', {
          body: { type: 'emotion_extract', user_text: payload.utterance, scene_text: '' },
        });
        if (!extResp.error && extResp.data && extResp.data.base) {
          emotion_vec = extResp.data.base;
          extractor_version = (extResp.data.prompt_version || 'absorb_v1') + '+no_meta_boost';
        }
      } catch (extE) {
        console.warn('[ldp absorb] emotion_extract exception', extE);
      }

      // 2) insert-ghost-variant edge function (V2.1.2 확장 = kind:'drift' 허용, is_seed=false 강제)
      var insertResp = await supabase.functions.invoke('insert-ghost-variant', {
        body: {
          memory_id: payload.memoryId,
          kind: 'drift',
          is_seed: false,
          parent_variant_id: payload.anchorVariantId || null,
          utterance: payload.utterance,
          emotion_vec: emotion_vec,
          extractor_version: extractor_version,
          motif_tags: payload.motifTags || [],
          attribution: payload.attribution || null,
          core_fear: payload.coreFear || null,
          modality: payload.modality || null,
          role: payload.role || null,
        },
      });
      if (insertResp.error) {
        console.warn('[ldp absorb] insert-ghost-variant failed', insertResp.error);
        return null;
      }
      var newId = insertResp.data && insertResp.data.variant && insertResp.data.variant.id;
      console.log('[ldp absorb] new drift row inserted:', newId,
        '(memory=' + payload.memoryId.slice(0, 8) + ', utt="' +
        payload.utterance.slice(0, 30) + '...")');
      return newId;
    } catch (err) {
      console.warn('[ldp absorb] background insert exception', err);
      return null;
    }
  }

  // ─── V2.1.2 anchor 기반 자동 분류 풀 주입 ─────────────────
  // 가이드 §2.2 (docs/유령응답풀_가이드_v1-260504.md):
  //   ghost_variants drift 풀 → anchor (is_seed=true, parent_variant_id=null) 식별 →
  //   각 변주 emotion_vec 와 anchor emotion_vec cosine sim →
  //   임계 0.85/0.5 → resonance/vague/dissonance 풀 자동 분류 →
  //   LumenGhostResponse.setOptions 로 풀 주입.
  //
  // fallback (글로벌 디폴트 유지):
  //   - supabase / memoryId / ghosts 누락
  //   - SELECT 실패
  //   - anchor 없음 또는 anchor.emotion_vec 비었음 (calibration 미완)
  //   - 분류 가능 변주 < 3 (풀 빔)
  //
  // speciation 시드는 SELECT 단계에서 제외 (kind='drift' 만). V2.1 명제 §15-1 정합:
  //   "speciation = 후속 플레이어가 만남". 첫 회차 풀에 안 들어감.
  //
  // 매 씬 호출. cache 없음 — 슬롯 흡수 background insert 가 *다음 씬*에서 노출되도록.
  // 비용: 5씬 × ~50ms SELECT = 무시.
  //
  // 디폴트 풀 보존: lumen_ghost_response.js 모듈 로드 시점의 _opts 를 lazy capture.
  //   이후 빈 결은 디폴트 fallback 으로 reset (메모리 간 stale 방지).
  var _originalGhostDefaults = null;
  // V2-6: 회차당 1회 drift 변주 픽 캐시 — { _memoryId, utterance, ghost_variant_id }. 같은 회차 다른 씬은 캐시 재사용.
  var _runDriftPick = null;
  async function _loadAndInjectGhostPools(supabase, memoryId, ghosts) {
    if (!supabase || !memoryId || !ghosts || typeof ghosts.setOptions !== 'function') {
      return { injected: false, reason: 'missing_deps' };
    }
    // lazy capture — 첫 호출 시 디폴트 보존 (이후 setOptions 가 stale 되어도 디폴트 회복 가능).
    if (!_originalGhostDefaults && typeof ghosts.getOptions === 'function') {
      _originalGhostDefaults = ghosts.getOptions();
    }
    try {
      var resp = await supabase
        .from('ghost_variants')
        .select('id, kind, is_seed, parent_variant_id, utterance, emotion_vec, motif_tags, attribution')  // V2-6: motif_tags/attribution 추가 (drift 픽 의미 필터)
        .eq('memory_id', memoryId)
        .eq('kind', 'drift'); // speciation 시드 제외 (§15-1 후속 플레이어 자리)
      if (resp.error || !resp.data) {
        console.warn('[ldp pool] ghost_variants SELECT 실패', resp.error);
        return { injected: false, reason: 'select_failed' };
      }
      var rows = resp.data;
      // anchor = is_seed=true + parent_variant_id=null
      var anchor = null;
      for (var ai = 0; ai < rows.length; ai++) {
        if (rows[ai].is_seed === true && !rows[ai].parent_variant_id) {
          anchor = rows[ai];
          break;
        }
      }
      if (!anchor || !anchor.emotion_vec || Object.keys(anchor.emotion_vec).length === 0) {
        console.warn('[ldp pool] anchor 없음 또는 emotion_vec 비었음 — 글로벌 디폴트 유지');
        return { injected: false, reason: 'no_anchor' };
      }
      // 분류 — anchor 자체 제외, 빈 utterance/emotion_vec 제외
      var resonancePool = [];
      var vaguePool = [];
      var dissonancePool = [];
      var debugRows = [];
      for (var i = 0; i < rows.length; i++) {
        var v = rows[i];
        if (v.id === anchor.id) continue;
        if (!v.utterance || !v.emotion_vec || Object.keys(v.emotion_vec).length === 0) continue;
        var sim = _cosineSim(v.emotion_vec, anchor.emotion_vec);
        var bucket;
        if (sim >= 0.85) { resonancePool.push(v.utterance); bucket = 'resonance'; }
        else if (sim >= 0.5) { vaguePool.push(v.utterance); bucket = 'vague'; }
        else { dissonancePool.push(v.utterance); bucket = 'dissonance'; }
        debugRows.push({ id: v.id.slice(0, 8), sim: sim.toFixed(3), bucket: bucket });
      }
      var total = resonancePool.length + vaguePool.length + dissonancePool.length;
      if (total < 3) {
        console.warn('[ldp pool] 분류 가능 변주 ' + total + ' < 3 — 글로벌 디폴트 유지');
        return { injected: false, reason: 'too_few', total: total };
      }

      // ─── V2-6: drift 변주 픽 → resonance 풀 맨 앞 주입 (회차당 1회 캐시, 즉시 가시) ───
      var _driftUtter = null;
      try {
        if (_runDriftPick && _runDriftPick._memoryId === memoryId) {
          _driftUtter = _runDriftPick.utterance;
          if (typeof window !== 'undefined' && window._temGame && _runDriftPick.ghost_variant_id) {
            window._temGame.driftStamp = { ghost_variant_id: _runDriftPick.ghost_variant_id, picked_at: 'run_start' };
          }
        } else if (typeof window !== 'undefined' && window.DriftPicker && typeof window.DriftPicker.pickDriftUtterance === 'function') {
          var _cumVec = {};
          try {
            var cumResp = await supabase.from('memories').select('cumulative_emotion_vec').eq('id', memoryId).maybeSingle();
            if (cumResp && cumResp.data && cumResp.data.cumulative_emotion_vec && typeof cumResp.data.cumulative_emotion_vec === 'object') _cumVec = cumResp.data.cumulative_emotion_vec;
          } catch (_) {}
          var _dv = _cumVec;
          try {
            var rawDv = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('tem_final_drift_vector') : null;
            if (rawDv) { var pdv = JSON.parse(rawDv); if (pdv && typeof pdv === 'object' && Object.keys(pdv).length) _dv = pdv; }
          } catch (_) {}
          var _fp = { motif_words: [], attribution: null };
          try {
            var rawFp = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('tem_seeker_fp') : null;
            if (rawFp) { var fpo = JSON.parse(rawFp); if (fpo && typeof fpo === 'object') _fp = { motif_words: fpo.motif_words || [], attribution: fpo.attribution || null }; }
          } catch (_) {}
          var _lastId = null;
          try { _lastId = (typeof sessionStorage !== 'undefined') ? (sessionStorage.getItem('tem_last_variant_id') || null) : null; } catch (_) {}
          var picked = window.DriftPicker.pickDriftUtterance({
            cumulativeEmotionVec: _cumVec,
            driftVector: _dv,
            ghostVariants: rows,            // 이미 kind='drift' 만 SELECT
            fingerprint: _fp,
            lastVariantId: _lastId,
          });
          if (picked && picked.variant && picked.variant.utterance) {
            _driftUtter = picked.variant.utterance;
            _runDriftPick = { _memoryId: memoryId, utterance: _driftUtter, ghost_variant_id: picked.variant.id };
            if (typeof window !== 'undefined' && window._temGame) window._temGame.driftStamp = { ghost_variant_id: picked.variant.id, picked_at: 'run_start' };
            console.log('[V2-6] drift 픽:', picked.variant.id.slice(0, 8), '|', _driftUtter.slice(0, 24));
          } else if (picked && picked.fallbackKind === 'narrative_silence') {
            var _lang = (function () { try { return (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('tem_lang')) || 'ko'; } catch (_) { return 'ko'; } })();
            var _fb = (typeof window !== 'undefined' && window.NarrativeFallback && window.NarrativeFallback.pickFallbackString) ? window.NarrativeFallback.pickFallbackString('vague', _lang) : '';
            if (_fb) { _driftUtter = _fb; _runDriftPick = { _memoryId: memoryId, utterance: _fb, ghost_variant_id: null }; }
            console.log('[V2-6] fallback narrative_silence');
          }
        }
      } catch (errPick) { console.warn('[V2-6] drift pick 예외', errPick); }
      if (_driftUtter) {
        resonancePool = [_driftUtter].concat(resonancePool.filter(function (u) { return u !== _driftUtter; }));
      }

      // 항상 3결 다 박음. 빈 결은 디폴트 fallback (메모리 간 stale 방지).
      var dflt = _originalGhostDefaults || {};
      ghosts.setOptions({
        resonancePool: resonancePool.length > 0 ? resonancePool : (dflt.resonancePool || ['그래.']),
        vaguePool: vaguePool.length > 0 ? vaguePool : (dflt.vaguePool || ['글쎄.']),
        dissonancePool: dissonancePool.length > 0 ? dissonancePool : (dflt.dissonancePool || ['아니야.']),
      });
      console.log('[ldp pool] 자동 분류 풀 주입',
        { memoryId: memoryId.slice(0, 8),
          resonance: resonancePool.length, vague: vaguePool.length, dissonance: dissonancePool.length,
          total: total, rows: debugRows });
      return {
        injected: true,
        counts: { resonance: resonancePool.length, vague: vaguePool.length, dissonance: dissonancePool.length },
        anchorId: anchor.id,
      };
    } catch (err) {
      console.warn('[ldp pool] 예외', err);
      return { injected: false, reason: 'exception' };
    }
  }

  // ─── claude-scene 호출 (emotion 추출) ───
  // claude-scene index.ts:226 — body { type:'emotion_analysis', emotion, reason, anchorEmotions }
  //   → { generatedEmotion, analysis:{ base:{...}, detailed, intensity, confidence }, reason_analysis }
  // Phase 1: 자유대화 텍스트 → body.emotion (통째). reason 분리 X. anchor_emotions 씬 배열 전달.
  async function _analyzeEmotion(supabase, text, anchorEmotions) {
    if (!supabase || !text) return null;
    try {
      var resp = await supabase.functions.invoke('claude-scene', {
        body: {
          type: 'emotion_analysis',
          emotion: text,
          reason: '',
          anchorEmotions: anchorEmotions || null,
        },
      });
      if (resp && resp.error) {
        console.warn('[ldp] claude-scene error', resp.error);
        return null;
      }
      var data = resp && resp.data;
      // 2026-05-08: base 결이 string/array 박힌 자리 우회 (자료 §12.5c).
      var base = data && data.analysis && data.analysis.base;
      if (base != null) {
        if (typeof base === 'string') {
          try { base = JSON.parse(base); } catch (_) { base = null; }
        }
        if (Array.isArray(base)) base = null; // 인덱스 키 자리 박힘 회피
        if (base && typeof base === 'object' && Object.keys(base).length > 0) {
          return base;
        }
      }
      return null;
    } catch (err) {
      console.warn('[ldp] claude-scene exception', err);
      return null;
    }
  }

  // ─── Public API ─────────────────────────────
  /**
   * 한 씬(=유령) 안 멀티턴 진행. 종료 시 cleanup + onSceneEnd 콜백.
   *
   * @param {Object} input
   * @param {string} input.memoryId
   * @param {string} input.sceneId
   * @param {Object} input.sceneData          scenes row (meta.dialog_choices 포함)
   * @param {Object} [input.runtime]           tem_af_strata_terrain runtime, drift_visualizer 위해
   * @param {Object} [input.supabase]          Supabase client
   * @param {string} [input.mountId]
   * @param {string} [input.anchorVariantId]   V2.1.2 — 본 유령 id (흡수 변주 parent_variant_id). 없으면 null.
   * @param {Function} [input.onSceneEnd]      ({scene_link_input, alignment, resonance}) => void
   * @returns {Promise<{scene_link_input:string, alignment:number, resonance:string}>}
   */
  async function start(input) {
    input = input || {};
    var sceneData = input.sceneData;
    if (!sceneData) throw new Error('[ldp] sceneData required');
    var meta = sceneData.meta || {};
    var dlg = meta.dialog_choices || null;
    var memoryId = input.memoryId || '';
    var sceneId  = input.sceneId  || sceneData.id || '';

    // 2026-05-06: 결 히스테리시스 상태 초기화 (V2-5 보강 — 파동 부활).
    // 회차 시작 시 결 잡힌 상태가 이전 씬에서 carry over 되지 않게.
    if (typeof window !== 'undefined' && window.LumenGhostResponse
        && typeof window.LumenGhostResponse.resetHysteresis === 'function') {
      window.LumenGhostResponse.resetHysteresis();
    }

    // 2026-05-06: overlay 를 LLM await *전*에 박음 (V2-5 보강).
    // 자이로드롭 fix — _fpTick 의 freeze 조건이 'lumenDialogPhase1' element 존재 검사라,
    // overlay 가 LLM 캐시 미스 시 1~3초 후 박히면 그 사이 walk_effects breath/bob 가
    // 누적되어 카메라가 위아래로 진동. overlay 즉시 박아서 freeze 즉시 활성화.
    var overlay = _buildOverlay(input.mountId || DEFAULTS.overlayId);

    // V2.1.2 (δ) 하이브리드 자동 생성 (2026-05-05) — 사용자 결정.
    //   1. 작가 손 (sceneData.meta.dialog_choices) 박힘 → 그대로 사용. 부분 박힘이어도
    //      *의도 존중* → 보강 X (결정 #3).
    //   2. 비어 있음 → generate-dialog-choices edge function 호출 (Haiku 4.5).
    //      서버가 캐시 hit 자리 처리 (memories.meta.dialog_choices_llm) → 1회 LLM,
    //      이후 플레이어는 캐시 사용. 작가 손 풀과 동일 위계.
    //   3. LLM 호출 실패/ok:false → _autoGenerateDialogChoices 균일 톤 (안전망 #2).
    //
    // V2.1.2 (δ-2, 2026-05-06) — 두 호출 자리 동시 (사용자 경험 자리 추가 보강):
    //   (A) 첫 씬 자리 호출 (oneScene=true) — await ~3-5초. 그 씬 1개 자리 응답 자리만.
    //   (B) 백그라운드 자리 호출 (sceneId X, fire-and-forget) — 메모리 통째 자리.
    //       서버 자리 ~15-30초 자리 처리 + DB 캐시 자리 박음. 다음 씬 자리 진입 시 캐시 사용.
    //   캐시 hit 자리 (두 번째 플레이어) = (A) 자리 즉시 응답 자리, (B) 자리도 캐시 hit 자리 빠름.
    // 핸드아웃: docs/세션핸드아웃_v21_콘텐츠_fallback-260505.md
    if (!dlg) {
      if (input.supabase && memoryId) {
        // (B) 백그라운드 자리 — 메모리 통째 자리 호출 (await 안 함, fire-and-forget).
        // 응답 자리 받으면 서버 자리에서 DB 캐시 자리 박음. 다음 씬 자리 진입 시 캐시 사용.
        // 실패 자리 = 다음 씬 자리도 oneScene 자리 호출 자리. 안전망 자리 X.
        input.supabase.functions.invoke('generate-dialog-choices', {
          body: { memoryId: memoryId },  // sceneId 자리 X = 메모리 통째 호출
        }).then(function (bgResp) {
          if (bgResp && !bgResp.error && bgResp.data && bgResp.data.ok) {
            console.log('[ldp] 백그라운드 LLM ' +
              (bgResp.data.cached ? '캐시 hit' : '메모리 통째 신규 생성 + DB 캐시 박힘') +
              ' memId=' + memoryId.slice(0, 8) + '…');
          } else {
            console.warn('[ldp] 백그라운드 LLM 실패. reason:',
              (bgResp && bgResp.data && bgResp.data.reason) ||
              (bgResp && bgResp.error && bgResp.error.message));
          }
        }).catch(function (bgErr) {
          console.warn('[ldp] 백그라운드 LLM 예외', bgErr);
        });

        // (A) 첫 씬 자리 호출 — oneScene=true 박으면 서버 자리 그 씬 1개만 처리. 응답 ~3-5초.
        try {
          var llmResp = await input.supabase.functions.invoke('generate-dialog-choices', {
            body: { memoryId: memoryId, sceneId: sceneId, oneScene: true },
          });
          if (!llmResp.error && llmResp.data && llmResp.data.ok && llmResp.data.dialog_choices) {
            dlg = llmResp.data.dialog_choices;
            console.log('[ldp] LLM 첫 씬 자리 ' +
              (llmResp.data.cached ? '캐시 hit' : 'oneScene 신규 생성') +
              ' memId=' + memoryId.slice(0, 8) + '… sceneId=' +
              String(sceneId || '').slice(0, 8) + '…');
          } else {
            console.warn('[ldp] LLM 첫 씬 자리 실패, 균일 톤 안전망. reason:',
              (llmResp.data && llmResp.data.reason) ||
              (llmResp.error && llmResp.error.message));
          }
        } catch (e) {
          console.warn('[ldp] LLM 첫 씬 자리 예외, 균일 톤 안전망', e);
        }
      }
      if (!dlg) {
        dlg = _autoGenerateDialogChoices(sceneData);
        console.log('[ldp] 균일 톤 fallback (안전망) sceneId=' +
          String(sceneData.id || '').slice(0, 8) + '… (' +
          dlg.scene_context.length + ' scene_context, ' +
          dlg.choices.length + ' choices)');
      }
    }

    var ghosts  = global.LumenGhostResponse || null;

    // drift visualizer attach (있으면)
    var driftVis = (input.runtime && input.runtime.__lumenDriftVisualizer) || null;
    if (!driftVis && input.runtime && global.LumenDriftVisualizer) {
      driftVis = global.LumenDriftVisualizer.attach(input.runtime);
    }

    // V2.1.2 자동 분류 풀 주입 (가이드 §2.2 — anchor cosine sim 0.85/0.5).
    // fallback: anchor 없거나 변주 < 3 시 글로벌 디폴트 유지. await 박아야 setOptions
    // 끝난 후 turn 1 의 pickResponse 호출 — race 회피.
    await _loadAndInjectGhostPools(input.supabase, memoryId, ghosts);

    // 회차 시간 측정 — 9분(540s) 초과 시 콘솔 경고 (결정 (d) 2026-05-04).
    var sceneCycleStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    // 0. scene_context — V2.1.2 (ε, 2026-05-06) 자리 짧게 자리 (5-6 → 2-3 문장).
    //    유령 자리 첫 등장 자리 = 그 씬 자리 분위기 자리 *조금만* 자리. 사용자 비전 자리.
    //    그 후 선택지 + 자유 입력 동시 자리 박힘.
    if (dlg.scene_context && Array.isArray(dlg.scene_context)) {
      var ctxLines = dlg.scene_context.slice(0, 3);  // 2-3 문장 자리만
      for (var sc = 0; sc < ctxLines.length; sc++) {
        var line = ctxLines[sc];
        if (typeof line !== 'string' || !line.length) continue;
        _addMessage(overlay, line, { who: 'ghost' });
        await _sleep(DEFAULTS.pacingDelays.sceneContextMs);
      }
    }

    // 1. ghost_intro — 보존 자리.
    var introText = _pickAuthored(dlg.ghost_intro, 'intro|' + memoryId + '|' + sceneId);
    if (introText) {
      _addMessage(overlay, introText, { who: 'ghost' });
      await _sleep(DEFAULTS.pacingDelays.afterIntroMs);
    }

    // 2. free_dialog turns — V2.1.2 (ε, 2026-05-06) 자리 학습된 유령 자리 자유 대화 자리.
    //    - turn 1 = 선택지 + 자유 입력 동시 자리 (가이드 자리). 사용자 자리 *클릭* 또는 *자유 박음*.
    //    - turn 2-3 = 자유 입력만.
    //    - 응답 자리 = dialog-turn 자리 호출 (Haiku 자리, 씬 본문 자리 학습 + ghost_variants 자료).
    //    - dialogHistory 자리 누적 자리 → 그 회차 자리 안 자리 자연 자리 흐름.
    //    - 슬롯 흡수 자리 = 백그라운드 자리 호출 (§2 명제 자리, ghost_variants 자생 자리).
    //    - dialog-turn 실패 시 = pickResponse 풀 픽 자리 안전망 자리.
    //    choice_reply / free_dialog_open 자리 폐기 자리 (작가 박은 자리 시드 자리 ghost_variants 자리에 보존).
    var lastAlignment = 0.5;
    var lastResonance = 'vague';
    var lastUserEmotion = null;
    var dialogTurns = [];
    var dialogHistory = [];  // V2.1.2 (ε) — dialog-turn 자리 누적 자리
    // 2026-05-08: 자료 §12.5c fix — sceneData.original_emotion 가 jsonb string
    // 으로 박힌 자리 우회. play-test.html safeParseEmotion 박은 자리는 pin
    // 전달 시점이라 phase1.js 직접 진입 시 raw string 박힘. defensive parse.
    function _ensureObj(raw) {
      if (raw == null) return {};
      if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (_) { return {}; }
      }
      if (Array.isArray(raw)) {
        // array of numbers → 인덱스 키 X. 기존 객체 결로는 안 박히니 비워서 fallback.
        return {};
      }
      return raw;
    }
    var origEmotion = _ensureObj(sceneData.original_emotion || sceneData.originalEmotion);
    var totalTurns = DEFAULTS.maxFreeDialogTurns;

    for (var turn = 1; turn <= totalTurns; turn++) {
      // 입력 자리 받음 자리. turn 1 = 선택지 + 자유 동시. turn 2-3 = 자유.
      var playerInput;
      if (turn === 1) {
        var firstInput = await new Promise(function (resolve) {
          _renderChoicesOrInput(overlay, dlg.choices || [], { placeholder: '...또는 자유롭게 박아' }, resolve);
        });
        playerInput = firstInput.text;
      } else {
        playerInput = await new Promise(function (resolve) {
          _renderTextInput(overlay, { placeholder: '여기에 이야기해...' }, resolve);
        });
      }
      _addMessage(overlay, playerInput, { who: 'player' });

      // CRISIS / END 안전망 (보존)
      if (_hasCrisis(playerInput, DEFAULTS.crisisKeywords)) {
        _addMessage(overlay, DEFAULTS.crisisReply, { who: 'ghost' });
        await _sleep(900);
        break;
      }
      if (_isEndPhrase(playerInput, DEFAULTS.endPhrases)) break;

      // emotion 분석 + alignment (보존 자리, drift visualizer 자리 결 자리 + plays 자리 박음 자리)
      // 2026-05-08: alignment=0 고정 fix (자료 §11.1 자리).
      // 진짜 자리 = sceneData.anchor_emotions=null 시 edge function 이 default 14축 으로
      // LLM 호출 → 응답 키 vs origEmotion(12축) mismatch → cosine 0 박힘 자리.
      // 해결: sceneData.anchor_emotions 비었으면 origEmotion 키 자체 를 anchorEmotions
      // 로 넘김 → LLM 응답 키 = origEmotion 키 정합 → cosine sim 의미 있는 값.
      var userEmo, alignment;
      if (_isShortAffirmative(playerInput)) {
        userEmo = lastUserEmotion || origEmotion;
        alignment = Math.max(lastAlignment, 0.7);
        console.log('[phase1] turn ' + turn + ' SHORT_AFFIRMATIVE — alignment=' + alignment.toFixed(3));
      } else {
        var anchorKeys = (sceneData.anchor_emotions && sceneData.anchor_emotions.length)
          ? sceneData.anchor_emotions
          : (origEmotion && Object.keys(origEmotion).length ? Object.keys(origEmotion) : null);
        userEmo = await _analyzeEmotion(input.supabase, playerInput, anchorKeys);
        alignment = userEmo ? _cosineSim(userEmo, origEmotion) : 0.5;
        // alignment=0 박히면 진단 + lastAlignment fallback (plays 누적 결 보호).
        if (alignment === 0) {
          var origKeys = origEmotion ? Object.keys(origEmotion) : [];
          var userKeys = userEmo ? Object.keys(userEmo) : [];
          var origNorm = origKeys.reduce(function (s, k) { var v = Number(origEmotion[k]) || 0; return s + v * v; }, 0);
          var userNorm = userKeys.reduce(function (s, k) { var v = Number(userEmo[k]) || 0; return s + v * v; }, 0);
          console.warn('[phase1] turn ' + turn + ' alignment=0 진단 —' +
            ' origNorm=' + origNorm.toFixed(3) + ' userNorm=' + userNorm.toFixed(3) +
            ' origKeys=' + JSON.stringify(origKeys) +
            ' userKeys=' + JSON.stringify(userKeys));
          alignment = lastAlignment > 0 ? lastAlignment : 0.5;
          console.warn('[phase1] turn ' + turn + ' alignment fallback → ' + alignment.toFixed(3));
        }
      }
      lastAlignment = alignment;
      if (userEmo && Object.keys(userEmo).length) lastUserEmotion = userEmo;

      // 응답 자리 = dialog-turn 자리 (V2.1.2 ε). 실패 시 pickResponse 자리 안전망 자리.
      var loading = _showLoadingBubble(overlay);
      var ghostReply = null;
      var resonanceForViz = 'vague';
      var via = 'unknown';
      try {
        var dlgResp = await _callDialogTurn(input.supabase, memoryId, sceneId, playerInput, dialogHistory);
        if (dlgResp && dlgResp.reply) {
          ghostReply = dlgResp.reply;
          resonanceForViz = ghosts && typeof ghosts.classifyResonance === 'function'
            ? ghosts.classifyResonance(alignment) : 'vague';
          via = 'dialog_turn';
        }
      } catch (dtErr) {
        console.warn('[ldp] dialog-turn 예외', dtErr);
      } finally {
        loading.stop();
      }
      if (!ghostReply) {
        // 안전망 자리 — 풀 픽 자리
        var safetyResp = ghosts && typeof ghosts.pickResponse === 'function'
          ? ghosts.pickResponse({
              memoryId: memoryId, sceneId: sceneId, turn: turn,
              alignment: alignment, playerInput: playerInput,
            })
          : { resonance: 'vague', reply: '...' };
        ghostReply = safetyResp.reply;
        resonanceForViz = safetyResp.resonance;
        via = 'pool_fallback';
        console.warn('[phase1] turn ' + turn + ' dialog-turn 실패 → 풀 픽 안전망. resonance=' + resonanceForViz);
      } else {
        console.log('[phase1] turn ' + turn + '/' + totalTurns +
          ' DIALOG_TURN alignment=' + alignment.toFixed(3) +
          ' resonance=' + resonanceForViz +
          ' reply="' + ghostReply.slice(0, 30) + '..."');
      }
      lastResonance = resonanceForViz;

      // 슬롯 흡수 자리 — 백그라운드 자리 (§2 명제 자리 보존). 응답 자리 와 별도.
      // 사용자 입력 자리 → ghost_variants 자생 자리 → 다음 플레이어 자리 자료 자리에 박힘.
      var slotter = global.LumenSlotAbsorber;
      if (slotter && ghosts && typeof ghosts.getSlotPool === 'function') {
        (function (turnIdx, inputText, alignVal) {
          (async function () {
            try {
              var sceneCtxArr = (sceneData.meta && sceneData.meta.dialog_choices && sceneData.meta.dialog_choices.scene_context) || [];
              var sceneCtxStr = sceneCtxArr.slice(0, 3).join(' ');
              var bgMotifs = (sceneData.meta && sceneData.meta.motif_tags) || [];
              var bgAbs = null;
              if (typeof slotter.tryAbsorbAsync === 'function') {
                bgAbs = await slotter.tryAbsorbAsync({
                  memoryId: memoryId, sceneId: sceneId, turn: turnIdx,
                  alignment: alignVal, playerInput: inputText,
                  slotPool: ghosts.getSlotPool(),
                  supabase: input.supabase,
                  memoryTitle: sceneData.memoryTitle || '',
                  motifs: bgMotifs,
                  sceneContext: sceneCtxStr,
                  ghostTone: '"~었어" 체. 자기 회상.',
                });
              }
              if (bgAbs && input.supabase && memoryId) {
                _backgroundInsertAbsorbed(input.supabase, {
                  memoryId: memoryId,
                  utterance: bgAbs.reply,
                  motifTags: bgAbs.motifTags,
                  anchorVariantId: input.anchorVariantId || null,
                  attribution: sceneData.attribution || null,
                  coreFear: sceneData.core_fear || null,
                  modality: sceneData.modality || null,
                  role: sceneData.role || null,
                });
                console.log('[phase1] turn ' + turnIdx + ' BG 흡수 변주 자생 박힘 slot="' + bgAbs.slotValue + '"');
                // V2-5++ 흡수 메아리 자리 — 자료 §11.2 (INSERT 화면 신호).
                // overlay 가 아직 살아있을 때만 박음 (마지막 턴 후 cleanup 됐으면 스킵).
                try { _addAbsorbTrace(overlay, turnIdx); } catch (_) {}
              }
            } catch (bgErr) {
              console.warn('[phase1] BG 흡수 자리 예외', bgErr);
            }
          })();
        })(turn, playerInput, alignment);
      }

      // 변형 펄스 자리 (보존)
      if (driftVis && typeof driftVis.pulse === 'function') {
        driftVis.pulse({ resonance: resonanceForViz });
      }
      if (typeof window !== 'undefined' && window._fpAmbientWave
          && typeof window._fpAmbientWave.pulseResonance === 'function') {
        window._fpAmbientWave.pulseResonance(resonanceForViz);
      }

      _addMessage(overlay, ghostReply, { who: 'ghost' });

      // dialogHistory 자리 누적 (다음 턴 자리 dialog-turn 자리 호출 자리에 박음)
      dialogHistory.push({ role: 'user', content: playerInput });
      dialogHistory.push({ role: 'assistant', content: ghostReply });

      // plays 자리 박음 자리 (보존)
      dialogTurns.push({
        turn: turn,
        raw_text: playerInput,
        fingerprint: userEmo || {},
        alignment: alignment,
        resonance: resonanceForViz,
        ghost_reply: ghostReply,
        via: via,
        ts: new Date().toISOString(),
      });

      await _sleep(DEFAULTS.pacingDelays.afterTurnMs);
    }

    // 6. urge
    var urgeRes = ghosts && typeof ghosts.pickUrge === 'function'
      ? ghosts.pickUrge({ memoryId: memoryId, sceneId: sceneId, alignment: lastAlignment })
      : { resonance: lastResonance, urge: '...' };
    _addMessage(overlay, urgeRes.urge, { who: 'ghost' });
    await _sleep(DEFAULTS.pacingDelays.afterUrgeMs);

    // 7. scene_link prompt + 입력
    var prompt = ghosts && typeof ghosts.pickSceneLinkPrompt === 'function'
      ? ghosts.pickSceneLinkPrompt(lastAlignment)
      : '한 줄 남겨.';
    _addSystemMeta(overlay, prompt);
    var sceneLinkInput = await new Promise(function (resolve) {
      _renderTextInput(overlay, { placeholder: '한 줄...' }, resolve);
    });
    _addMessage(overlay, sceneLinkInput, { who: 'player' });
    await _sleep(700);

    // 8. transitioning — DOM cleanup
    cleanup({ mountId: overlay.id });

    // 회차 시간 측정 — 9분 초과 시 console.warn (결정 (d)).
    var sceneCycleEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var sceneCycleMs = sceneCycleEnd - sceneCycleStart;
    if (sceneCycleMs > DEFAULTS.sceneCycleWarnMs) {
      console.warn('[phase1] scene cycle ' + (sceneCycleMs / 1000).toFixed(1) + 's > 임계 ' +
        (DEFAULTS.sceneCycleWarnMs / 1000) + 's — 작가 한 바퀴 페이스 점검 자리');
    } else {
      console.log('[phase1] scene cycle ' + (sceneCycleMs / 1000).toFixed(1) + 's (memId=' + memoryId + ' sceneId=' + sceneId + ')');
    }

    var result = {
      scene_link_input: sceneLinkInput,
      alignment: lastAlignment,
      resonance: lastResonance,
      sceneCycleMs: sceneCycleMs,
      // V2.1.2 (5-05) — plays insert 자리 (호출자 onSceneEnd 에서 사용)
      lastUserEmotion: lastUserEmotion,
      dialogTurns: dialogTurns,
    };
    if (typeof input.onSceneEnd === 'function') input.onSceneEnd(result);
    return result;
  }

  function cleanup(opts) {
    opts = opts || {};
    var ov = document.getElementById(opts.mountId || DEFAULTS.overlayId);
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  }

  global.LumenDialogPhase1 = {
    start: start,
    cleanup: cleanup,
    _utils: {     // smoke 검증용
      cosineSim: _cosineSim,
      hasCrisis: _hasCrisis,
      isEndPhrase: _isEndPhrase,
      pickAuthored: _pickAuthored,                      // string-or-array seeded pick (2026-05-04)
      loadAndInjectGhostPools: _loadAndInjectGhostPools, // anchor 기반 자동 분류 풀 주입 (2026-05-05)
      splitSceneText: _splitSceneText,                  // V2.1.2 콘텐츠 fallback (2026-05-05)
      defaultChoices: _defaultChoices,
      autoGenerateDialogChoices: _autoGenerateDialogChoices,
    },
    _config: {    // smoke 검증용 — 외부에서 default 읽기
      maxFreeDialogTurns: DEFAULTS.maxFreeDialogTurns,
      sceneCycleWarnMs: DEFAULTS.sceneCycleWarnMs,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

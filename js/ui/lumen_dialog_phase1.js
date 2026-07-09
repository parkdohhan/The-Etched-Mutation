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
  // 현재 플레이 언어 — play-test.html 이 document.documentElement.lang 에 LANG 박음.
  function _dialogLang() {
    try { return (document.documentElement.lang || 'en').slice(0, 2) === 'ko' ? 'ko' : 'en'; }
    catch (_) { return 'en'; }
  }
  function _inputPlaceholder() {
    return _dialogLang() === 'ko' ? '...또는 자유롭게 적어 주세요' : '...or write freely';
  }
  // i18n — 이 파일의 사용자 노출 문자열. play-test 의 I18N 은 별도 스코프라 자체 테이블 유지.
  var _STR = {
    ko: {
      crisisReply: '......아냐, 이건 너무 날카로워.',
      freeInputPlaceholder: '여기에 이야기해...',
      sceneLinkPlaceholder: '한 줄...',
      sceneLinkPromptFallback: '한 줄 남겨.',
      poolResonance: '그래.',
      poolVague: '글쎄.',
      poolDissonance: '아니야.',
      ghostTone: '"~었어" 체. 자기 회상. 조용한 톤.',
    },
    en: {
      crisisReply: '......no. this one cuts too sharp.',
      freeInputPlaceholder: 'tell me, here...',
      sceneLinkPlaceholder: 'one line...',
      sceneLinkPromptFallback: 'Leave one line.',
      poolResonance: 'Yes.',
      poolVague: 'I don\'t know.',
      poolDissonance: 'No.',
      ghostTone: 'Quiet past-tense recollection, first person.',
    },
  };
  function _t(key) {
    var L = _STR[_dialogLang()] || _STR.en;
    return (key in L) ? L[key] : (_STR.en[key] || '');
  }
  function _defaultChoices() {
    // 작품 톤 균일 자리 — V3 메모리별 작가 손 dialog_choices 박히면 자동 무력화 (작가 풀 우선).
    if (_dialogLang() === 'ko') {
      return [
        { label: '어디였어?', ghost_reply: ['거기였어. 너도 그런 자리 알아?'], free_dialog_open: ['너에게도 비슷한 자리 있어?'] },
        { label: '어떤 자리였어?', ghost_reply: ['그런 자리였어. 그게 다였어.'], free_dialog_open: ['너는 그 자리에서 뭘 봤어?'] },
        { label: '......', ghost_reply: ['그래. 침묵도 대답이지.'], free_dialog_open: ['뭐가 떠올라?'] },
      ];
    }
    return [
      { label: 'Where was it?', ghost_reply: ['It was there. Do you know a place like that?'], free_dialog_open: ['Do you have a place like it too?'] },
      { label: 'What kind of place was it?', ghost_reply: ['It was that kind of place. That was all.'], free_dialog_open: ['What did you see, in that place?'] },
      { label: '......', ghost_reply: ['Yes. Silence is an answer too.'], free_dialog_open: ['What comes back to you?'] },
    ];
  }
  function _autoGenerateDialogChoices(sceneData) {
    return {
      scene_context: _splitSceneText((sceneData && sceneData.text) || ''),
      ghost_intro: [],
      choices: _defaultChoices(),
    };
  }

  // ─── 얼굴+자막 연출 (260708) ─────────────────
  // docs/유령대화_얼굴자막_연출_v1-260708.md
  // 채팅 버블 스크롤 폐지 → 빈 얼굴 윤곽 + 자막 한 줄 + "다 듣고 대답".
  // 흐름 로직(멀티턴/흡수/풀)은 불변 — 표시층만 이 블록이 담당.

  // 자막 큐 — 유령/플레이어 라인이 순서대로 한 줄씩 자막 자리를 교체.
  // 입력 렌더러는 _subtitleIdle() 대기 후에만 나타남 ("듣기" 강제 게이트).
  // 260709: RPG식 수동 넘김 — 유령 대사는 자동으로 안 넘어간다. 클릭/Space/Enter 로
  // (출력 중이면) 즉시 완성 → (완성 후면) 다음 줄. 첫조우 스킵불가 규칙은 이걸로 대체·폐기.
  var _sub = {
    chain: Promise.resolve(), advance: null, ff: false,
    ghostLabel: '',      // 이름표 현재 표시값 (기본 '유령')
    ghostTrueName: '',   // 작가 지정 진짜 이름 (scenes.meta.ghost_name) — 공명 시 드러남
    nameRevealed: false, // 이번 대화에서 드러났는가
    justRevealed: false, // 방금 드러남 → 다음 유령 라인에서 이름표 글로우
    skipMode: 'ff',      // 'ff'=대사 빨리감기 / 'exit'=입력 차례 — 누르면 대화 나가기
    exit: null,          // 입력 대기 중 나가기 resolver (턴 루프가 등록)
  };

  function _ensureLdpStyle() {
    if (document.getElementById('ldp-style')) return;
    var st = document.createElement('style');
    st.id = 'ldp-style';
    st.textContent = '@keyframes ldpBlink { 0%,100% { opacity:0.12; } 50% { opacity:0.85; } }';
    document.head.appendChild(st);
  }

  function _subtitleZone(overlay) { return overlay.querySelector('[id$="-subtitle"]'); }
  function _metaZone(overlay) { return overlay.querySelector('[id$="-meta"]'); }
  function _subtitleIdle() { return _sub.chain; }

  function _playLine(overlay, text, who) {
    return new Promise(function (resolve) {
      var zone = _subtitleZone(overlay);
      if (!zone || !overlay.parentNode) { resolve(); return; }

      if (who === 'ghost') _setFaceActivity(overlay, false); // 말할 땐 얼굴 속 고요

      // 260709 v2.2: RPG 대화창 — 또렷한 테두리 박스 + 좌상단 이름표 (사용자 레퍼런스, 초상화 X).
      // 박스/이름표/텍스트/▾/SKIP 은 _buildOverlay 가 만든 고정 요소 — 여기선 내용만 교체.
      var box = zone.querySelector('.ldp-box');
      var nameTag = zone.querySelector('.ldp-nametag');
      var textEl = zone.querySelector('.ldp-text');
      var indEl = zone.querySelector('.ldp-ind');
      if (!box || !textEl) { resolve(); return; }

      box.style.opacity = '1';
      if (nameTag) {
        nameTag.textContent = who === 'player'
          ? (_dialogLang() === 'ko' ? '나' : 'me')
          : (_sub.ghostLabel || (_dialogLang() === 'ko' ? '유령' : 'ghost'));
        nameTag.style.color = who === 'player' ? 'rgba(214,188,150,0.95)' : 'rgba(224,210,250,0.95)';
        // 260709 D안: 공명으로 이름이 방금 드러난 첫 유령 라인 — 이름표가 잠깐 빛남.
        if (who === 'ghost' && _sub.justRevealed) {
          _sub.justRevealed = false;
          nameTag.style.transition = 'text-shadow 500ms ease, border-color 500ms ease';
          nameTag.style.textShadow = '0 0 16px rgba(224,210,250,0.95)';
          nameTag.style.borderColor = 'rgba(224,210,250,0.85)';
          setTimeout(function () {
            nameTag.style.transition = 'text-shadow 1800ms ease, border-color 1800ms ease';
            nameTag.style.textShadow = 'none';
            nameTag.style.borderColor = 'rgba(196,168,130,0.5)';
          }, 1900);
        }
      }
      textEl.style.color = who === 'player' ? 'rgba(214,188,150,0.92)' : 'rgba(240,232,254,0.96)';
      textEl.innerHTML = '';
      if (indEl) indEl.style.display = 'none';
      // 대사 재생 중엔 스킵 버튼 = 빨리감기 모드
      var skipEl = zone.querySelector('.ldp-skip');
      if (skipEl) { skipEl.textContent = 'SKIP ▸'; }
      _sub.skipMode = 'ff';
      var line = textEl; // 아래 캐스케이드 코드의 타깃

      // 단어 단위 페이드 캐스케이드 (타자기 X — 안개 응결 결).
      var tokens = String(text == null ? '' : text).split(/(\s+)/);
      var words = tokens.filter(function (t) { return t.trim().length; });
      var stepMs = who === 'player' ? 40 : 90;
      if (words.length * stepMs > 2700) stepMs = Math.max(24, Math.floor(2700 / words.length));
      var fadeMs = 480;
      var holdMs = who === 'player' ? 260 : 420;
      var spans = [];
      var wi = 0;
      for (var ti = 0; ti < tokens.length; ti++) {
        var token = tokens[ti];
        if (!token.trim().length) {
          line.appendChild(document.createTextNode(token));
          continue;
        }
        var span = document.createElement('span');
        span.textContent = token;
        span.style.opacity = '0';
        span.style.transition = 'opacity ' + fadeMs + 'ms ease ' + (wi * stepMs) + 'ms';
        line.appendChild(span);
        spans.push(span);
        wi++;
      }
      requestAnimationFrame(function () {
        for (var si = 0; si < spans.length; si++) spans[si].style.opacity = '1';
      });

      var revealMs = words.length * stepMs + fadeMs;
      var done = false;
      var revealed = false;
      var timer = null;
      function _finish() {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (_sub.advance === advanceFn) _sub.advance = null;
        resolve();
      }
      function _completeReveal() {
        if (revealed) return;
        revealed = true;
        for (var si = 0; si < spans.length; si++) {
          spans[si].style.transition = 'none';
          spans[si].style.opacity = '1';
        }
        if (who === 'ghost' && indEl && !_sub.ff) indEl.style.display = '';
      }
      // 260709 RPG식: 넘김 입력 1회 = 출력 즉시 완성, 2회 = 다음으로.
      function advanceFn() {
        if (!revealed) { _completeReveal(); return; }
        _finish();
      }
      if (_sub.ff) {
        // SKIP 빨리감기 — 남은 대사를 즉시 완성하고 바로 다음으로.
        _completeReveal();
        timer = setTimeout(_finish, 90);
      } else if (who === 'ghost') {
        _sub.advance = advanceFn;
        timer = setTimeout(_completeReveal, revealMs); // 캐스케이드 끝나면 ▾ 로 대기 — 진행은 수동
      } else {
        // 플레이어 발화는 본인이 쓴 말 — 짧게 보여주고 자동 진행
        timer = setTimeout(_finish, revealMs + holdMs);
      }
    });
  }

  function _enqueueLine(overlay, text, who) {
    _sub.chain = _sub.chain
      .then(function () { return _playLine(overlay, text, who); })
      .catch(function () {});
    return _sub.chain;
  }

  // ─── 유령 얼굴 FX 디스패처 (260708 v2) ─────────
  // v1 의 2D 얼굴 오버레이 폐기 — 유령의 몸은 지형에 이미 서 있는 3D 마네킹
  // (lumen_scene_mannequins.js). 이 모듈은 텍스트 표시만 하고, 얼굴 속 글자·기분
  // 변화는 play-test 가 window.LumenGhostFaceFX 로 주입한 어댑터에 위임한다.
  // 어댑터 없으면 전부 무해한 no-op (테스트 하네스 등).
  function _faceFx() {
    return (typeof window !== 'undefined' && window.LumenGhostFaceFX) || null;
  }

  // 자막 나가는 동안 얼굴 속 글자 가라앉음 / 플레이어 차례에 일렁임.
  function _setFaceActivity(overlay, listening) {
    var fx = _faceFx();
    if (fx && typeof fx.activity === 'function') {
      try { fx.activity(!!listening); } catch (_) {}
    }
  }

  // 매 턴 결 → 얼굴 속 글자 선명도/일렁임.
  function _updateFaceMood(alignment, resonance) {
    var fx = _faceFx();
    if (fx && typeof fx.mood === 'function') {
      try { fx.mood(alignment, resonance); } catch (_) {}
    }
  }

  // 흡수 성공 → 플레이어의 단어가 유령 얼굴 속으로 들어가 떠다님.
  function _addFaceFragment(word) {
    var fx = _faceFx();
    if (fx && typeof fx.absorb === 'function') {
      try { fx.absorb(String(word || '').trim()); } catch (_) {}
    }
  }

  // ─── DOM ──────────────────────────────────
  function _buildOverlay(id) {
    // 대화 오버레이가 뜨면 씬 본문 패널(#sceneMode, z-index 2700)을 숨긴다.
    // 안 숨기면 이전 씬 본문이 대화창 뒤로 비쳐 글자가 겹친다 — 대화의 scene_context
    // 버블이 본문 역할을 하므로 #sceneMode 는 이 동안 불필요.
    var _sm = document.getElementById('sceneMode');
    if (_sm) _sm.classList.remove('active');

    var existing = document.getElementById(id);
    if (existing) return existing;

    _ensureLdpStyle();

    var ov = document.createElement('div');
    ov.id = id;
    // 260708 v2: 검은 반투명 박스 폐기 — 배경/블러 없이 화면 전체를 덮는 투명 레이어.
    // 자막은 하단 중앙(마네킹 아래), 하단 300px 은 파동(AW_HEIGHT=280) 자리로 비움.
    // 260709: RPG식 수동 넘김 — 화면 어디를 눌러도 넘어가도록 오버레이가 클릭을 받는다
    // (대화 중 FP 이동은 어차피 freeze). 입력 영역 안의 클릭은 넘김으로 안 침.
    ov.style.cssText = [
      'position:fixed',
      'top:0', 'left:0', 'right:0', 'bottom:0',
      'display:flex', 'flex-direction:column', 'justify-content:flex-end',
      'align-items:center',
      'padding:0 24px 300px 24px',
      'background:transparent',
      'z-index:2800',
      'pointer-events:auto',
      'cursor:default',
      'font-family:"Gowun Batang",serif',
      'color:rgba(232,216,252,0.92)',
      'box-sizing:border-box',
      'font-size:1.08rem',
    ].join(';');
    ov.onclick = function (ev) {
      var t = ev.target;
      if (t && t.closest && t.closest('[id$="-input-area"]')) return;
      if (typeof _sub.advance === 'function') _sub.advance();
    };
    // 키보드 넘김 (Space/Enter) — 입력창 포커스 중엔 무시
    ov._ldpKeyHandler = function (ev) {
      if (ev.code !== 'Space' && ev.key !== 'Enter') return;
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (typeof _sub.advance === 'function') { ev.preventDefault(); _sub.advance(); }
    };
    document.addEventListener('keydown', ov._ldpKeyHandler);

    // 260709 v2.2: RPG 대화창 박스 — 또렷한 테두리 + 좌상단 이름표 + 우상단 SKIP + 우하단 ▾.
    var sub = document.createElement('div');
    sub.id = id + '-subtitle';
    sub.style.cssText = 'width:min(820px,94vw);flex-shrink:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;cursor:default;';

    var box = document.createElement('div');
    box.className = 'ldp-box';
    box.style.cssText = [
      'position:relative', 'width:100%', 'box-sizing:border-box',
      'background:rgba(8,6,14,0.85)',
      'border:1.5px solid rgba(196,168,130,0.5)',
      'border-radius:6px',
      'padding:20px 26px 24px 26px',
      'min-height:5.4em',
      'box-shadow:0 4px 34px rgba(0,0,0,0.55)',
      'opacity:0', 'transition:opacity 400ms ease',
    ].join(';');

    var nameTag = document.createElement('div');
    nameTag.className = 'ldp-nametag';
    nameTag.style.cssText = [
      'position:absolute', 'top:-0.95em', 'left:16px',
      'padding:3px 16px',
      'background:rgba(8,6,14,0.95)',
      'border:1.5px solid rgba(196,168,130,0.5)',
      'border-radius:4px',
      'font-size:0.92rem', 'letter-spacing:0.08em',
      'color:rgba(224,210,250,0.95)',
    ].join(';');
    box.appendChild(nameTag);

    // SKIP — 남은 대사 전부 빨리감기 (입력창 나올 때 자동 해제)
    var skipBtn = document.createElement('button');
    skipBtn.className = 'ldp-skip';
    skipBtn.textContent = 'SKIP ▸';
    skipBtn.style.cssText = [
      'position:absolute', 'top:-0.95em', 'right:16px',
      'padding:3px 14px',
      'background:rgba(8,6,14,0.95)',
      'border:1.5px solid rgba(196,168,130,0.4)',
      'border-radius:4px',
      'font-family:inherit', 'font-size:0.8rem', 'letter-spacing:0.12em',
      'color:rgba(196,168,130,0.8)',
      'cursor:pointer',
      'transition:color 200ms ease, border-color 200ms ease',
    ].join(';');
    skipBtn.onmouseenter = function () {
      skipBtn.style.color = 'rgba(232,216,252,0.95)';
      skipBtn.style.borderColor = 'rgba(196,168,130,0.8)';
    };
    skipBtn.onmouseleave = function () {
      skipBtn.style.color = 'rgba(196,168,130,0.8)';
      skipBtn.style.borderColor = 'rgba(196,168,130,0.4)';
    };
    skipBtn.onclick = function (ev) {
      ev.stopPropagation(); // 오버레이 넘김 클릭과 중복 방지
      // 260709: 입력 차례('나가기 ▸')면 대화 종료, 대사 중('SKIP ▸')이면 빨리감기.
      if (_sub.skipMode === 'exit') {
        if (typeof _sub.exit === 'function') _sub.exit();
        return;
      }
      _sub.ff = true;
      if (typeof _sub.advance === 'function') { _sub.advance(); }
      if (typeof _sub.advance === 'function') { _sub.advance(); }
    };
    box.appendChild(skipBtn);

    var textEl = document.createElement('div');
    textEl.className = 'ldp-text';
    textEl.style.cssText = [
      'font-size:1.3rem', 'line-height:1.85',
      'letter-spacing:0.01em',
      'white-space:pre-wrap',
      'text-shadow:0 0 18px rgba(168,140,196,0.18)',
    ].join(';');
    box.appendChild(textEl);

    var ind = document.createElement('div');
    ind.className = 'ldp-ind';
    ind.textContent = '▾';
    ind.style.cssText = [
      'position:absolute', 'right:16px', 'bottom:8px',
      'font-size:0.95rem', 'color:rgba(196,168,130,0.9)',
      'animation:ldpBlink 1.1s ease-in-out infinite',
      'display:none',
    ].join(';');
    box.appendChild(ind);

    sub.appendChild(box);
    ov.appendChild(sub);

    var metaZone = document.createElement('div');
    metaZone.id = id + '-meta';
    metaZone.style.cssText = 'width:min(820px,94vw);flex-shrink:0;min-height:2em;text-align:center;margin-top:2px;pointer-events:none;';
    ov.appendChild(metaZone);

    var inputArea = document.createElement('div');
    inputArea.id = id + '-input-area';
    inputArea.style.cssText = 'width:min(820px,94vw);min-height:64px;flex-shrink:0;margin-top:10px;pointer-events:auto;';
    ov.appendChild(inputArea);

    document.body.appendChild(ov);
    return ov;
  }

  // 260708: 버블 누적 대신 자막 큐로 위임. 시그니처/호출 자리 불변.
  function _addMessage(overlay, text, opts) {
    opts = opts || {};
    return _enqueueLine(overlay, text, opts.who || 'ghost');
  }

  // V2.1.2 LLM 흡수 로딩 자리 — 응답 생성 ~500-1000ms 동안 빈 화면 X.
  // 260708: 메타 존의 점 1→2→3→1 루프 (자막 자리는 플레이어 라인이 유지).
  function _showLoadingBubble(overlay) {
    var zone = _metaZone(overlay);
    if (!zone) return { stop: function () {} };
    var el = document.createElement('div');
    el.className = 'ldp-loading';
    el.style.cssText = [
      'font-size:1rem',
      'color:rgba(232,216,252,0.5)',
      'letter-spacing:0.3em',
      'opacity:0',
      'transition:opacity 300ms ease',
    ].join(';');
    el.textContent = '.';
    zone.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; });

    var dots = 1;
    var interval = setInterval(function () {
      dots = (dots % 3) + 1;
      el.textContent = '.'.repeat(dots);
    }, 450);

    return {
      stop: function () {
        clearInterval(interval);
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  }

  function _addSystemMeta(overlay, text) {
    // 시스템 어휘 (V3 메타 질문 패턴 시드) — 260708: 자막 큐 뒤에 메타 존 페이드.
    _sub.chain = _sub.chain.then(function () {
      var zone = _metaZone(overlay);
      if (!zone || !overlay.parentNode) return;
      var meta = document.createElement('div');
      meta.className = 'ldp-system-meta';
      meta.style.cssText = [
        'text-align:center',
        'padding:10px 8px 0 8px',
        'font-size:0.9rem',
        'color:rgba(196,168,130,0.78)',
        'letter-spacing:0.05em',
        'opacity:0', 'transition:opacity 700ms ease',
      ].join(';');
      meta.textContent = text;
      zone.appendChild(meta);
      requestAnimationFrame(function () { meta.style.opacity = '1'; });
    }).catch(function () {});
    return null;
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
    // 260708: 메타 존에 잠깐 떴다 스스로 사라짐 (비동기 도착이라 자막 큐에 안 태움).
    var zone = _metaZone(overlay);
    if (!zone) return null;
    var lang = _resolveTraceLang();
    var lines = _ABSORB_TRACE_LINES[lang] || _ABSORB_TRACE_LINES.ko;
    var idx = Math.max(0, Math.min(lines.length - 1, (turnIdx | 0) - 1));
    var trace = document.createElement('div');
    trace.className = 'ldp-absorb-trace';
    trace.style.cssText = [
      'text-align:center',
      'padding:6px 0 0 0',
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
    zone.appendChild(trace);
    requestAnimationFrame(function () {
      trace.style.opacity = '1';
      trace.style.transform = 'translateY(0)';
    });
    setTimeout(function () { trace.style.opacity = '0'; }, 4200);
    setTimeout(function () { if (trace.parentNode) trace.parentNode.removeChild(trace); }, 5600);
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
        'padding:11px 18px', 'width:100%', 'box-sizing:border-box',
        'background:rgba(0,0,0,0.34)',
        'border:none',
        'border-bottom:1px solid rgba(196,168,130,0.26)',
        'color:rgba(232,216,252,0.9)',
        'font-family:inherit', 'font-size:1.08rem',
        'cursor:pointer', 'border-radius:0',
        'text-align:center',
        'text-shadow:0 1px 9px rgba(0,0,0,0.9)',
        'transition:background 200ms ease, border-color 200ms ease',
      ].join(';');
      btn.onmouseenter = function () {
        btn.style.background = 'rgba(30,24,14,0.55)';
        btn.style.borderBottomColor = 'rgba(196,168,130,0.6)';
      };
      btn.onmouseleave = function () {
        btn.style.background = 'rgba(0,0,0,0.34)';
        btn.style.borderBottomColor = 'rgba(196,168,130,0.26)';
      };
      btn.onclick = function () {
        area.innerHTML = '';
        onPick(c, i);
      };
      box.appendChild(btn);
    });
    // 260708: 자막 다 끝나야 등장 ("듣기" 게이트)
    box.style.opacity = '0';
    box.style.transition = 'opacity 400ms ease';
    _subtitleIdle().then(function () {
      if (!area.isConnected) return;
      _sub.ff = false; // SKIP 빨리감기는 입력 차례가 오면 해제
      _sub.skipMode = 'exit'; // 입력 차례 — 스킵 버튼이 '나가기'가 됨
      var _skipEl = overlay.querySelector('.ldp-skip');
      if (_skipEl) _skipEl.textContent = _dialogLang() === 'ko' ? '나가기 ▸' : 'LEAVE ▸';
      area.appendChild(box);
      _setFaceActivity(overlay, true);
      requestAnimationFrame(function () { box.style.opacity = '1'; });
    });
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
    input.placeholder = opts.placeholder || _inputPlaceholder();
    input.style.cssText = [
      'flex:1', 'padding:12px 14px',
      'background:rgba(0,0,0,0.38)',
      'border:none',
      'border-bottom:1px solid rgba(196,168,130,0.32)',
      'color:rgba(232,216,252,0.92)',
      'font-family:inherit', 'font-size:1.08rem',
      'text-align:center',
      'outline:none', 'border-radius:0',
      'text-shadow:0 1px 8px rgba(0,0,0,0.8)',
    ].join(';');
    input.onfocus = function () { input.style.borderBottomColor = 'rgba(196,168,130,0.7)'; };
    input.onblur  = function () { input.style.borderBottomColor = 'rgba(196,168,130,0.32)'; };
    // 타이핑 즉시 감정색 프리뷰 → 하단 파동·하늘 실시간 반영
    input.oninput = function () { _previewWaveColorFromText(input.value || ''); };

    var btn = document.createElement('button');
    btn.textContent = opts.submitLabel || '↵';
    btn.style.cssText = [
      'padding:12px 18px',
      'background:transparent',
      'border:none',
      'border-bottom:1px solid rgba(196,168,130,0.45)',
      'color:rgba(232,216,252,0.92)',
      'font-family:inherit', 'font-size:1.02rem', 'cursor:pointer', 'border-radius:0',
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

    // 260708: 자막 다 끝나야 등장 ("듣기" 게이트)
    box.style.opacity = '0';
    box.style.transition = 'opacity 400ms ease';
    _subtitleIdle().then(function () {
      if (!area.isConnected) return;
      _sub.ff = false; // SKIP 빨리감기는 입력 차례가 오면 해제
      _sub.skipMode = 'exit'; // 입력 차례 — 스킵 버튼이 '나가기'가 됨
      var _skipEl = overlay.querySelector('.ldp-skip');
      if (_skipEl) _skipEl.textContent = _dialogLang() === 'ko' ? '나가기 ▸' : 'LEAVE ▸';
      area.appendChild(box);
      _setFaceActivity(overlay, true);
      requestAnimationFrame(function () { box.style.opacity = '1'; });
      setTimeout(function () { input.focus(); }, 80);
    });
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
          lang: _dialogLang(),
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

  // 실시간 감정 파동색 프리뷰 — 대화 입력 텍스트의 키워드로 즉석 감정 추정 → 하단 파동색(currentExperiencerWave) 갱신.
  // 정확한 감정은 제출 후 _analyzeEmotion(API)가 뽑지만 그건 느리고 색을 안 먹인다. 이건 타이핑 즉시 반응용.
  function _previewWaveColorFromText(text) {
    if (typeof window === 'undefined' || typeof window.sharedEmotionVectorToWaveStyle !== 'function') return;
    var t = (text || '');
    if (!t) return;
    var vec = null;
    if (/화가?\s*[나난났날]|화가?\s*치|분노|성\s*[나난났]|성질|열\s*받|짜증|격분|빡치|빡쳐|빡침|욱해|욱했|미치겠|돌아버|열불|억울|분해|분하/.test(t)) vec = { anger: 0.94, fear: 0.16 };
    else if (/슬프|슬퍼|슬펐|슬픔|우울|눈물|울었|울고|비통|서글|애처|참담|먹먹|서러/.test(t)) vec = { sadness: 0.92, longing: 0.34 };
    else if (/무섭|무서|두렵|두려|공포|불안|조마|오싹|겁나|겁이|겁났|떨려|떨렸|초조/.test(t)) vec = { fear: 0.9, confusion: 0.28 };
    else if (/기뻐|기쁘|기뻤|기쁨|행복|즐거|즐겁|신나|신났|설레|설렜|벅차|후련|홀가분/.test(t)) vec = { joy: 0.9, relief: 0.3 };
    else if (/그립|그리워|그리웠|보고\s*싶|사무치|아른거/.test(t)) vec = { longing: 0.88, sadness: 0.42 };
    else if (/미안|죄책|죄스|내\s*탓|자책|부끄/.test(t)) vec = { guilt: 0.9, sadness: 0.26 };
    else if (/\bangry\b|\bmad\b|furious|\brage\b|pissed/i.test(t)) vec = { anger: 0.94, fear: 0.16 };
    else if (/\bsad\b|sorrow|grief|depressed|unhappy|crying/i.test(t)) vec = { sadness: 0.9, longing: 0.22 };
    else if (/afraid|scared|\bfear\b|anxious|nervous/i.test(t)) vec = { fear: 0.9, confusion: 0.28 };
    else if (/happy|\bjoy\b|glad|excited/i.test(t)) vec = { joy: 0.9, relief: 0.3 };
    if (!vec) return;
    try {
      window.experiencerEmotionVector = vec;
      window.currentExperiencerWave = window.sharedEmotionVectorToWaveStyle(vec);
    } catch (_) {}
  }

  // API가 뽑은 정확한 감정(userEmo)을 하단 파동색에 반영 — 제출 후 갱신.
  function _applyWaveColorFromEmotion(emo) {
    if (typeof window === 'undefined' || typeof window.sharedEmotionVectorToWaveStyle !== 'function') return;
    if (!emo || typeof emo !== 'object' || !Object.keys(emo).length) return;
    try {
      window.experiencerEmotionVector = emo;
      window.currentExperiencerWave = window.sharedEmotionVectorToWaveStyle(emo);
    } catch (_) {}
  }

  function _renderTextInput(overlay, opts, onSubmit) {
    opts = opts || {};
    var area = overlay.querySelector('[id$="-input-area"]');
    area.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:8px;width:100%;align-items:center;';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = opts.placeholder || _t('freeInputPlaceholder');
    input.style.cssText = [
      'flex:1', 'padding:12px 14px',
      'background:rgba(0,0,0,0.38)',
      'border:none',
      'border-bottom:1px solid rgba(196,168,130,0.32)',
      'color:rgba(232,216,252,0.92)',
      'font-family:inherit', 'font-size:1.08rem',
      'text-align:center',
      'outline:none', 'border-radius:0',
      'text-shadow:0 1px 8px rgba(0,0,0,0.8)',
    ].join(';');
    input.onfocus = function () { input.style.borderBottomColor = 'rgba(196,168,130,0.7)'; };
    input.onblur  = function () { input.style.borderBottomColor = 'rgba(196,168,130,0.32)'; };
    // 타이핑 즉시 감정색 프리뷰 → 하단 파동·하늘 실시간 반영
    input.oninput = function () { _previewWaveColorFromText(input.value || ''); };

    var btn = document.createElement('button');
    btn.textContent = opts.submitLabel || '↵';
    btn.style.cssText = [
      'padding:12px 18px',
      'background:transparent',
      'border:none',
      'border-bottom:1px solid rgba(196,168,130,0.45)',
      'color:rgba(232,216,252,0.92)',
      'font-family:inherit', 'font-size:1.02rem', 'cursor:pointer', 'border-radius:0',
    ].join(';');

    function _go() {
      var v = (input.value || '').trim();
      if (!v) return;
      area.innerHTML = '';
      onSubmit(v);
    }
    btn.onclick = _go;
    input.onkeydown = function (e) { if (e.key === 'Enter') _go(); };

    // 260708: 자막 다 끝나야 등장 ("듣기" 게이트)
    wrap.appendChild(input);
    wrap.appendChild(btn);
    wrap.style.opacity = '0';
    wrap.style.transition = 'opacity 400ms ease';
    _subtitleIdle().then(function () {
      if (!area.isConnected) return;
      _sub.ff = false; // SKIP 빨리감기는 입력 차례가 오면 해제
      _sub.skipMode = 'exit'; // 입력 차례 — 스킵 버튼이 '나가기'가 됨
      var _skipEl = overlay.querySelector('.ldp-skip');
      if (_skipEl) _skipEl.textContent = _dialogLang() === 'ko' ? '나가기 ▸' : 'LEAVE ▸';
      area.appendChild(wrap);
      _setFaceActivity(overlay, true);
      requestAnimationFrame(function () { wrap.style.opacity = '1'; });
      setTimeout(function () { input.focus(); }, 80);
    });
  }

  // ─── V2.1.2 슬롯 흡수 background insert ─────
  // 흡수된 응답을 ghost_variants 새 drift row 로 박음. 응답 표시와 분리 (fire-and-forget).
  // 실패해도 사용자 체감엔 영향 X. parent_variant_id = 본 유령 id (호출자가 anchorVariantId 로 넘김).
  async function _backgroundInsertAbsorbed(supabase, payload) {
    if (!supabase || !payload || !payload.memoryId || !payload.utterance) return;
    // V2.1.2 (β) cap 도달 또는 일시 에러 캐시 — 같은 세션 안에서 재시도 X (콘솔 빨간 줄 회피).
    // sessionStorage 라 회차 끝나면 자동 비워짐 → 새 회차에 다시 시도 가능 (혹시 admin 에서 풀 비웠을 수도).
    // insert-ghost-variant 가 ABSORB_DRIFT_CAP=50 도달 시 429 반환 (의도된 가드, rate limit 아님).
    var capKey = 'tem_absorb_cap_reached:' + payload.memoryId;
    try {
      if (sessionStorage.getItem(capKey) === '1') return null;
    } catch (_) {}
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
        // 429 cap 도달 또는 일시 에러 — 캐시해서 같은 세션 안 재시도 X. info 톤 (빨간 줄 X).
        var status = null;
        try { status = insertResp.error.context && insertResp.error.context.status; } catch (_) {}
        try { sessionStorage.setItem(capKey, '1'); } catch (_) {}
        console.info('[ldp absorb] insert skipped (status=' + (status || '?') + ') — cached for session, won\'t retry this memory');
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

  // ─── T3 (전이·층층이=나) 모듈 상태 ──────────────────────────────────
  // docs/통합빌드계획_전이+지형quilt_병렬세션-260614.md §S1·T3.
  // 물든 유령에 *다시* 말 걸수록 더 오래된 층이 떠오름(구멍2=나). T1(drift_lines) 이 층을 고르고,
  // 여기서는 "유령별 재대화 횟수(layerIndex)" 만 세고 layers 를 공급한다. T1·QuiltDemoState 내부는 안 만짐.
  //
  // _retalkCounts: sceneId(=이 흐름에서 유령 정체) → 그 유령에 말 건 누적 횟수. 첫 대화=0(층0=현재 사람),
  //   재대화마다 ++ (층1,2,… = 풀의 더 오래된 변주). 세션 메모리(새로고침 시 초기화).
  // _loadedGhostRows: 직전 _loadAndInjectGhostPools 가 SELECT 한 ghost_variants 풀 캐시.
  //   { memoryId, rows }. 새 DB 호출 없이 그걸 정렬해 layers 로 재활용(약속 §1-4).
  var _retalkCounts = {};
  var _loadedGhostRows = null;
  var _retalkActiveMemoryId = null;

  // 캐시된 풀 → T1 이 받는 layers 배열. 약속: created_at 내림차순(최신→오래된).
  //   anchor(is_seed=true, parent 없음) 와 빈 utterance 제외. created_at 없으면(시드 coeval / 목 데이터)
  //   삽입순 tie-break (§1-2 한계2 — 데모는 "층이 바뀐다"까지). T1 은 [0]=최신 층으로 읽는다.
  function _buildDriftLayers(rows) {
    if (!Array.isArray(rows)) return [];
    var pool = [];
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i];
      if (!v) continue;
      if (v.is_seed === true && !v.parent_variant_id) continue;  // anchor 제외
      if (typeof v.utterance !== 'string' || v.utterance.trim().length === 0) continue;
      pool.push({ utterance: v.utterance, created_at: v.created_at || null, _seq: i });
    }
    pool.sort(function (a, b) {
      var ta = a.created_at ? Date.parse(a.created_at) : NaN;
      var tb = b.created_at ? Date.parse(b.created_at) : NaN;
      var va = isNaN(ta) ? null : ta;
      var vb = isNaN(tb) ? null : tb;
      if (va !== null && vb !== null && va !== vb) return vb - va;  // 최신 → 오래된
      return a._seq - b._seq;  // created_at 동일/부재 → 삽입순(공짜 나이순)
    });
    return pool;
  }

  // 물든 유령의 재대화 오프닝 라인 한 줄. 안 물들거나 재료 없으면 null(=기존 동작 유지).
  //   runtime.__quiltDemo.getGhostDrift(sceneId) 로 물듦 여부 읽고(읽기만), window.DriftLines 로 층 선택.
  //   호출 후 그 유령 retalkCount++ (다음 재대화는 더 오래된 층).
  function _pickRedialogOpening(runtime, memoryId, sceneId) {
    try {
      if (!runtime || !sceneId) return null;
      var quilt = runtime.__quiltDemo;
      if (!quilt || typeof quilt.getGhostDrift !== 'function') return null;
      var drift = quilt.getGhostDrift(sceneId);
      if (!drift) return null;  // 안 물듦 → 기존 동작
      if (typeof window === 'undefined' || !window.DriftLines
          || typeof window.DriftLines.pickDriftedLine !== 'function') return null;  // T1 없음 안전 가드

      var layers = (_loadedGhostRows && _loadedGhostRows.memoryId === memoryId)
        ? _buildDriftLayers(_loadedGhostRows.rows)
        : [];
      var retalkCount = _retalkCounts[sceneId] || 0;
      var line = window.DriftLines.pickDriftedLine({
        drift: drift,
        layers: layers,
        mode: 'redialog',
        layerIndex: retalkCount,
      });
      // 다음 재대화는 더 오래된 층. (null=원본 복귀여도 한 번 말 건 것이므로 카운트는 올린다.)
      _retalkCounts[sceneId] = retalkCount + 1;
      return (typeof line === 'string' && line.length > 0) ? line : null;
    } catch (err) {
      console.warn('[ldp redialog] 예외 — 기존 오프닝 유지', err);
      return null;
    }
  }

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
        .select('id, kind, is_seed, parent_variant_id, utterance, emotion_vec, motif_tags, attribution, created_at')  // V2-6: motif_tags/attribution / T3: created_at(층 나이순 정렬용)
        .eq('memory_id', memoryId)
        .eq('kind', 'drift'); // speciation 시드 제외 (§15-1 후속 플레이어 자리)
      if (resp.error || !resp.data) {
        console.warn('[ldp pool] ghost_variants SELECT 실패', resp.error);
        return { injected: false, reason: 'select_failed' };
      }
      var rows = resp.data;
      // T3 재활용: 같은 풀을 재대화 층(layers)으로 쓴다(새 DB 호출 X). 분류 로직·반환값은 안 건드림.
      _loadedGhostRows = { memoryId: memoryId, rows: rows };
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
        resonancePool: resonancePool.length > 0 ? resonancePool : (dflt.resonancePool || [_t('poolResonance')]),
        vaguePool: vaguePool.length > 0 ? vaguePool : (dflt.vaguePool || [_t('poolVague')]),
        dissonancePool: dissonancePool.length > 0 ? dissonancePool : (dflt.dissonancePool || [_t('poolDissonance')]),
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

    // T3: 다른 기억으로 갈아타면 유령별 재대화 카운트(층 진행)·풀 캐시 초기화 (stale 방지).
    //   같은 기억 안에서는 유지 → 같은 물든 유령에 다시 말 걸수록 더 오래된 층.
    if (_retalkActiveMemoryId !== memoryId) {
      _retalkCounts = {};
      _loadedGhostRows = null;
      _retalkActiveMemoryId = memoryId;
    }

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

    // 260709: RPG식 수동 넘김 (첫조우 스킵불가 규칙 폐기 — 넘김이 곧 읽기 페이스).
    // 얼굴(3D 마네킹 줌·글자)은 play-test 가 window.LumenGhostFaceFX 로 처리.
    _sub.chain = Promise.resolve();
    _sub.advance = null;
    _sub.ff = false;
    // 이름표 (260709 사용자 결정 D안): 기본 '유령'. 작가가 scenes.meta.ghost_name 을
    // 지정해뒀으면 그 이름은 숨어 있다가 — 대화에서 공명(resonance) 결이 나오는 순간
    // 드러난다. 한 번 드러난 이름은 같은 세션 안에서 유지 (sessionStorage).
    _sub.ghostLabel = _dialogLang() === 'ko' ? '유령' : 'ghost';
    _sub.ghostTrueName = '';
    _sub.nameRevealed = false;
    _sub.justRevealed = false;
    try {
      _sub.ghostTrueName = (meta && typeof meta.ghost_name === 'string' && meta.ghost_name.trim()) || '';
      if (_sub.ghostTrueName) {
        var _nk = 'ldp_name:' + memoryId + '|' + sceneId;
        if (sessionStorage.getItem(_nk) === '1') {
          _sub.ghostLabel = _sub.ghostTrueName;
          _sub.nameRevealed = true;
        }
      }
    } catch (_) {}

    // V2.1.2 (δ) 하이브리드: 작가 손 / LLM / 균일 톤 fallback (2026-05-05).
    // (ζ, 2026-05-24) 병렬화 — LLM 은 즉시 kick off 만, scene_context 는 LLM 안 기다리고
    // 본문 split 으로 *즉시* 렌더. 사용자 체감 = 길게 클릭하자마자 유령 대사 나옴.
    // LLM 은 백그라운드에서 *선택지* 만 채움; scene_context 렌더 동안 (~2.7s) 거의 완료.
    var _preRenderedCtx = false;
    if (!dlg) {
      var llmPromise = null;
      if (input.supabase && memoryId) {
        // (B) 백그라운드 — 메모리 통째 호출 (fire-and-forget). DB 캐시 박음 — 다음 씬은 즉시.
        input.supabase.functions.invoke('generate-dialog-choices', {
          body: { memoryId: memoryId, lang: _dialogLang() },
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
        // (A) 그 씬 — promise 만 잡고, await 는 scene_context 렌더 후. 그 사이 병렬 실행.
        llmPromise = input.supabase.functions.invoke('generate-dialog-choices', {
          body: { memoryId: memoryId, sceneId: sceneId, oneScene: true, lang: _dialogLang() },
        });
      }

      // (ζ) scene_context *즉시* 렌더 — LLM 대기 동안 빈 화면 X. 본문 문장 split 은
      //   LLM 의 scene_context 와 거의 같음. LLM 은 병렬로 선택지 생성 중.
      try {
        var _ctxFallback = _splitSceneText(sceneData.text || '').slice(0, 3);
        if (_ctxFallback.length) {
          for (var _pi = 0; _pi < _ctxFallback.length; _pi++) {
            _addMessage(overlay, _ctxFallback[_pi], { who: 'ghost' });
            await _sleep(DEFAULTS.pacingDelays.sceneContextMs);
          }
          _preRenderedCtx = true;
        }
      } catch (_) {}

      // LLM 결과 수확 — scene_context 렌더 동안 대부분 완료됨.
      if (llmPromise) {
        try {
          var llmResp = await llmPromise;
          if (!llmResp.error && llmResp.data && llmResp.data.ok && llmResp.data.dialog_choices) {
            dlg = llmResp.data.dialog_choices;
            console.log('[ldp] LLM 그 씬 ' +
              (llmResp.data.cached ? '캐시 hit' : 'oneScene 신규 생성') +
              ' memId=' + memoryId.slice(0, 8) + '… sceneId=' +
              String(sceneId || '').slice(0, 8) + '…');
          } else {
            console.warn('[ldp] LLM 그 씬 실패, 균일 톤 안전망. reason:',
              (llmResp.data && llmResp.data.reason) ||
              (llmResp.error && llmResp.error.message));
          }
        } catch (e) {
          console.warn('[ldp] LLM 그 씬 예외, 균일 톤 안전망', e);
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
    // fallback: anchor 없거나 변주 < 3 시 글로벌 디폴트 유지.
    // 260709: await 를 여기서 안 함 — DB 왕복이 첫 대사를 막아서 "진입하자마자
    // 유령이 말 거는" 체감이 죽음. 병렬 kick off 하고 턴 루프 직전에 await
    // (pickResponse 는 턴 응답에서만 필요 — 그동안 플레이어는 인트로를 넘기며 읽는 중).
    var _poolsPromise = _loadAndInjectGhostPools(input.supabase, memoryId, ghosts);

    // 회차 시간 측정 — 9분(540s) 초과 시 콘솔 경고 (결정 (d) 2026-05-04).
    var sceneCycleStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    // 0. scene_context — V2.1.2 (ε, 2026-05-06) 자리 짧게 자리 (5-6 → 2-3 문장).
    //    유령 자리 첫 등장 자리 = 그 씬 자리 분위기 자리 *조금만* 자리. 사용자 비전 자리.
    //    그 후 선택지 + 자유 입력 동시 자리 박힘.
    if (!_preRenderedCtx && dlg.scene_context && Array.isArray(dlg.scene_context)) {
      var ctxLines = dlg.scene_context.slice(0, 3);  // 2-3 문장 자리만
      for (var sc = 0; sc < ctxLines.length; sc++) {
        var line = ctxLines[sc];
        if (typeof line !== 'string' || !line.length) continue;
        _addMessage(overlay, line, { who: 'ghost' });
        await _sleep(DEFAULTS.pacingDelays.sceneContextMs);
      }
    }

    // 1. ghost_intro — 보존 자리.
    //    T3 (전이·층층이=나): 이 유령이 물들었으면 첫 라인을 "변형된 대사"로 교체.
    //      재대화 반복할수록 더 오래된 층(layerIndex=retalkCount). 안 물들거나 재료 없으면 기존 동작.
    var introText = _pickRedialogOpening(input.runtime, memoryId, sceneId);
    if (!introText) {
      introText = _pickAuthored(dlg.ghost_intro, 'intro|' + memoryId + '|' + sceneId);
    }
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

    // 260709: 대화 시작 = 두 번째 파동(이 유령의 원본 감정) 등장. 걸을 땐 하나, 대화 땐 유령+플레이어.
    // 대상은 "가장 가까운 핀"이 아니라 지금 말 거는 이 유령(sceneData.original_emotion).
    try {
      if (typeof window !== 'undefined' && window._fpAmbientWave
          && typeof window._fpAmbientWave.enterSceneWave === 'function') {
        window._fpAmbientWave.enterSceneWave(origEmotion);
      }
    } catch (_) {}

    // 260709: 병렬 로딩한 응답 풀 수확 — 인트로 읽는 동안 대부분 완료됨 (race 회피 유지).
    await _poolsPromise;

    for (var turn = 1; turn <= totalTurns; turn++) {
      // 입력 자리 받음 자리. turn 1 = 선택지 + 자유 동시. turn 2-3 = 자유.
      var playerInput;
      var _left = false;  // 260709 '나가기 ▸' 로 대화를 뜬 경우
      if (turn === 1) {
        // 260709 선택지 폐기 (사용자 결정) — 자유 입력만. dlg.choices 데이터는 유지(미표시).
        var firstInput = await new Promise(function (resolve) {
          _sub.exit = function () { resolve(null); }; // '나가기 ▸' 클릭 → 대화 종료
          _renderChoicesOrInput(overlay, [], { placeholder: _inputPlaceholder() }, resolve);
        });
        _sub.exit = null;
        if (firstInput === null) { _left = true; } else { playerInput = firstInput.text; }
      } else {
        playerInput = await new Promise(function (resolve) {
          _sub.exit = function () { resolve(null); }; // '나가기 ▸' 클릭 → 대화 종료
          _renderTextInput(overlay, { placeholder: _t('freeInputPlaceholder') }, resolve);
        });
        _sub.exit = null;
        if (playerInput === null) { _left = true; }
      }
      // 나가기: 입력창 치우고 턴 루프 종료 → urge(작별 한마디)로. scene_link 은 이미 폐기됨.
      if (_left) {
        var _ia = overlay.querySelector('[id$="-input-area"]');
        if (_ia) _ia.innerHTML = '';
        console.log('[phase1] 나가기 ▸ — turn ' + turn + ' 에서 대화 종료');
        break;
      }
      _addMessage(overlay, playerInput, { who: 'player' });

      // CRISIS / END 안전망 (보존)
      if (_hasCrisis(playerInput, DEFAULTS.crisisKeywords)) {
        _addMessage(overlay, _t('crisisReply'), { who: 'ghost' });
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
      // API가 뽑은 정확한 감정으로 하단 파동색 갱신 (키워드 프리뷰보다 정확) — 실패 시 프리뷰색 유지
      _applyWaveColorFromEmotion(userEmo);

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

      // 260709 D안: 공명이 일어난 순간 유령의 진짜 이름이 드러난다 (작가 지정 있을 때만).
      if (resonanceForViz === 'resonance' && _sub.ghostTrueName && !_sub.nameRevealed) {
        _sub.nameRevealed = true;
        _sub.justRevealed = true;
        _sub.ghostLabel = _sub.ghostTrueName;
        try { sessionStorage.setItem('ldp_name:' + memoryId + '|' + sceneId, '1'); } catch (_) {}
        console.log('[phase1] 공명 — 유령 이름 드러남: ' + _sub.ghostTrueName);
      }

      // 260708: 턴 결 → 얼굴 파편 선명도/흐림 + 윤곽 펄스 (설계 §4)
      try { _updateFaceMood(alignment, resonanceForViz); } catch (_) {}

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
                  ghostTone: _t('ghostTone'),
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
                // 260708: 흡수된 단어가 얼굴 안으로 들어가 떠다님 (설계 §4 파편 소스 ③)
                try { _addFaceFragment(bgAbs.slotValue); } catch (_) {}
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

    // 6. urge — 유령의 작별 한마디. 플레이어가 넘기면 바로 종료.
    var urgeRes = ghosts && typeof ghosts.pickUrge === 'function'
      ? ghosts.pickUrge({ memoryId: memoryId, sceneId: sceneId, alignment: lastAlignment })
      : { resonance: lastResonance, urge: '...' };
    _addMessage(overlay, urgeRes.urge, { who: 'ghost' });

    // 7. scene_link "한 줄 남기기" — 260709 전면 삭제 (사용자 결정).
    //    onSceneEnd 계약 유지를 위해 scene_link_input 은 빈 문자열 고정
    //    (play-test 의 traces/plays/quilt 는 '' 허용 — `|| ''` 가드 확인됨).
    //    복원 시: pickSceneLinkPrompt + _renderTextInput 자리, 커밋 3bc3868 이전 참조.
    var sceneLinkInput = '';
    await _subtitleIdle(); // urge 라인을 플레이어가 넘길 때까지 대기 (RPG 넘김)

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
    // 260709: 대화 종료 = 두 번째 파동(유령) 내리고 다시 파동 하나(플레이어)로.
    try {
      if (typeof window !== 'undefined' && window._fpAmbientWave
          && typeof window._fpAmbientWave.exitSceneMode === 'function') {
        window._fpAmbientWave.exitSceneMode();
      }
    } catch (_) {}
    // 260708: 자막 큐 리셋 (다음 씬 잔류 방지) + 260709: 넘김 키 리스너 해제
    _sub.chain = Promise.resolve();
    _sub.advance = null;
    var ov = document.getElementById(opts.mountId || DEFAULTS.overlayId);
    if (ov) {
      if (ov._ldpKeyHandler) document.removeEventListener('keydown', ov._ldpKeyHandler);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }
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
      buildDriftLayers: _buildDriftLayers,              // T3 — 풀 → created_at 내림차순 layers (2026-06-14)
      pickRedialogOpening: _pickRedialogOpening,        // T3 — 물든 유령 재대화 오프닝(층층이=나) (2026-06-14)
    },
    _config: {    // smoke 검증용 — 외부에서 default 읽기
      maxFreeDialogTurns: DEFAULTS.maxFreeDialogTurns,
      sceneCycleWarnMs: DEFAULTS.sceneCycleWarnMs,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

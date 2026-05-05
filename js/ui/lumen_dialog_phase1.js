/**
 * Lumen Dialog Phase 1 — V2.1 멀티턴 컨트롤러
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260429.md §4 V2.1 Phase 1
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
      afterIntroMs:   1000,
      afterChoiceMs:  900,
      afterReplyMs:   1100,
      afterTurnMs:    1100,
      afterUrgeMs:    900,
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
        .select('id, kind, is_seed, parent_variant_id, utterance, emotion_vec')
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
      if (data && data.analysis && data.analysis.base && typeof data.analysis.base === 'object') {
        return data.analysis.base;
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
    if (!dlg) {
      console.warn('[ldp] sceneData.meta.dialog_choices 없음 — Phase 1 skip');
      return { scene_link_input: null, alignment: 0.5, resonance: 'vague' };
    }
    var memoryId = input.memoryId || '';
    var sceneId  = input.sceneId  || sceneData.id || '';

    var overlay = _buildOverlay(input.mountId || DEFAULTS.overlayId);
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

    // 0. scene_context — 풀 씬 본문 문장 단위 순차 토출 (V2.1.2 추가, 2026-05-05).
    //    스즈미야 재구성 (비순차 견디게 다시 박은 풀 컨텍스트) 한 문장씩 유령 대사로.
    //    이후 ghost_intro (짧은 회상 닻) 가 자연스럽게 이어짐.
    if (dlg.scene_context && Array.isArray(dlg.scene_context)) {
      for (var sc = 0; sc < dlg.scene_context.length; sc++) {
        var line = dlg.scene_context[sc];
        if (typeof line !== 'string' || !line.length) continue;
        _addMessage(overlay, line, { who: 'ghost' });
        await _sleep(1700); // 문장 간 호흡
      }
    }

    // 1. ghost_intro — string or array 모두 지원. 배열이면 (memId|sceneId|intro) 시드로 deterministic pick.
    var introText = _pickAuthored(dlg.ghost_intro, 'intro|' + memoryId + '|' + sceneId);
    if (introText) {
      _addMessage(overlay, introText, { who: 'ghost' });
      await _sleep(DEFAULTS.pacingDelays.afterIntroMs);
    }

    // 2. choice_select
    var choice = await new Promise(function (resolve) {
      _renderChoices(overlay, dlg.choices || [], resolve);
    });
    _addMessage(overlay, choice.label, { who: 'player' });
    await _sleep(300);

    // 3. choice_reply — string or array. 시드는 choice.label 까지 포함 (다른 choice → 다른 풀 자리).
    var replyText = _pickAuthored(choice.ghost_reply, 'reply|' + memoryId + '|' + sceneId + '|' + (choice.label || ''));
    if (replyText) {
      _addMessage(overlay, replyText, { who: 'ghost' });
      await _sleep(DEFAULTS.pacingDelays.afterReplyMs);
    }

    // 4. free_dialog 첫 질문 — string or array.
    var openText = _pickAuthored(choice.free_dialog_open, 'open|' + memoryId + '|' + sceneId + '|' + (choice.label || ''));
    if (openText) {
      _addMessage(overlay, openText, { who: 'ghost' });
      await _sleep(700);
    }

    // 5. free_dialog turns — 1턴 → 3턴 (2026-05-04 ego-state turn-taking 차용).
    //    매 턴 _analyzeEmotion 단독 호출 (결정 (a) — 누적 fingerprint X).
    //    END_PHRASES 시 조기 종료. CRISIS 시 즉시 차단.
    var lastAlignment = 0.5;
    var lastResonance = 'vague';
    var lastUserEmotion = null;       // V2.1.2 (5-05) — plays.user_emotion 박음 자리
    var dialogTurns = [];              // V2.1.2 (5-05) — plays.dialog_turns 박음 자리
    var origEmotion = sceneData.original_emotion || sceneData.originalEmotion || {};
    var totalTurns = DEFAULTS.maxFreeDialogTurns;

    for (var turn = 1; turn <= totalTurns; turn++) {
      var playerInput = await new Promise(function (resolve) {
        _renderTextInput(overlay, { placeholder: '여기에 이야기해...' }, resolve);
      });
      _addMessage(overlay, playerInput, { who: 'player' });

      // CRISIS 안전망
      if (_hasCrisis(playerInput, DEFAULTS.crisisKeywords)) {
        _addMessage(overlay, DEFAULTS.crisisReply, { who: 'ghost' });
        await _sleep(900);
        break;
      }
      // END_PHRASES 조기 종료 → urge 단계로
      if (_isEndPhrase(playerInput, DEFAULTS.endPhrases)) break;

      // emotion 분석 + alignment (매 턴 단독 — 결정 (a))
      var userEmo = await _analyzeEmotion(input.supabase, playerInput, sceneData.anchor_emotions);
      var alignment = userEmo ? _cosineSim(userEmo, origEmotion) : 0.5;
      lastAlignment = alignment;
      if (userEmo && Object.keys(userEmo).length) lastUserEmotion = userEmo;

      // V2.1.2 슬롯 흡수 시도 — LLM (Haiku) 우선 → 휴리스틱 fallback.
      // 실패 시 기존 pickResponse fallback (resonance/vague 풀 또는 dissonance quoting).
      var resp = null;
      var absorbed = null;
      var slotter = global.LumenSlotAbsorber;
      // 응답 생성 중 로딩 인디케이터 (LLM ~500-1000ms 자리). LLM 호출 전 시작.
      var loading = _showLoadingBubble(overlay);
      try {
        if (slotter && ghosts && typeof ghosts.getSlotPool === 'function') {
          // 씬 context 자리 (LLM 톤 가이드)
          var sceneCtxArr = (sceneData.meta && sceneData.meta.dialog_choices && sceneData.meta.dialog_choices.scene_context) || [];
          var sceneCtxStr = sceneCtxArr.slice(0, 3).join(' ');  // 첫 3 문장만 (token 절약)
          var motifs = (sceneData.meta && sceneData.meta.motif_tags) || [];

          if (typeof slotter.tryAbsorbAsync === 'function') {
            absorbed = await slotter.tryAbsorbAsync({
              memoryId: memoryId, sceneId: sceneId, turn: turn,
              alignment: alignment, playerInput: playerInput,
              slotPool: ghosts.getSlotPool(),
              supabase: input.supabase,
              memoryTitle: sceneData.memoryTitle || '',
              motifs: motifs,
              sceneContext: sceneCtxStr,
              ghostTone: '"~었어" 체. 자기 회상. 슬리퍼 신은 아이의 톤.',
            });
          } else if (typeof slotter.tryAbsorb === 'function') {
            absorbed = slotter.tryAbsorb({
              memoryId: memoryId, sceneId: sceneId, turn: turn,
              alignment: alignment, playerInput: playerInput,
              slotPool: ghosts.getSlotPool(),
            });
          }
        }
      } finally {
        loading.stop();
      }
      if (absorbed) {
        resp = { resonance: absorbed.resonance, reply: absorbed.reply };
        // background insert (fire-and-forget, await 안 함)
        if (input.supabase && memoryId) {
          _backgroundInsertAbsorbed(input.supabase, {
            memoryId: memoryId,
            utterance: absorbed.reply,
            motifTags: absorbed.motifTags,
            anchorVariantId: input.anchorVariantId || null,
            attribution: sceneData.attribution || null,
            coreFear: sceneData.core_fear || null,
            modality: sceneData.modality || null,
            role: sceneData.role || null,
          });
        }
        console.log('[phase1] turn ' + turn + '/' + totalTurns +
          ' ABSORBED slotValue="' + absorbed.slotValue + '"' +
          ' resonance=' + absorbed.resonance);
      } else {
        // 반응 풀 pick — turn 인자가 시드에 들어가서 매 턴 다른 변주 (호명 자리는 V2-10 가이드 풀).
        resp = ghosts && typeof ghosts.pickResponse === 'function'
          ? ghosts.pickResponse({
              memoryId: memoryId, sceneId: sceneId, turn: turn,
              alignment: alignment, playerInput: playerInput,
            })
          : { resonance: 'vague', reply: '...' };
        console.log('[phase1] turn ' + turn + '/' + totalTurns +
          ' alignment=' + alignment.toFixed(3) +
          ' resonance=' + resp.resonance +
          ' reply="' + (resp.reply || '').slice(0, 30) + '..."');
      }
      lastResonance = resp.resonance;

      // 변형 펄스
      if (driftVis && typeof driftVis.pulse === 'function') {
        driftVis.pulse({ resonance: resp.resonance });
      }

      _addMessage(overlay, resp.reply, { who: 'ghost' });

      // V2.1.2 dialog_turns 누적 (plays 박음 자리)
      dialogTurns.push({
        turn: turn,
        raw_text: playerInput,
        fingerprint: userEmo || {},
        alignment: alignment,
        resonance: resp.resonance || lastResonance,
        ghost_reply: resp.reply || '',
        absorbed: !!absorbed,
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
    },
    _config: {    // smoke 검증용 — 외부에서 default 읽기
      maxFreeDialogTurns: DEFAULTS.maxFreeDialogTurns,
      sceneCycleWarnMs: DEFAULTS.sceneCycleWarnMs,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

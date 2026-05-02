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
 *   - 자유대화 1턴 (5-2 결정 — 멀티턴 별로, 단일턴이 작품 톤에 더 맞음)
 *   - 자유대화 매 턴 독립 분석 (8번 동의)
 *   - 장면 잇기 emotion 분석 X, DB 누적 X (4번 결정)
 *   - 다음 씬 결정은 호출자 책임 (Phase 1 = scene_order +1 선형, 5번 결정)
 *
 * TODO Phase 2: scene_link_input DB 누적 (plays.scene_link_input JSONB)
 * TODO V2-4: claude-scene 호출 형식 검증 — 현 가정 `{ type:'emotion_analysis', text }` →
 *           `{ emotion: {...} }`. 실제 함수 시그니처 다르면 _analyzeEmotion 만 수정.
 *
 * 사용:
 *   var res = await LumenDialogPhase1.start({
 *     memoryId, sceneId, sceneData,
 *     runtime, supabase,
 *     onSceneEnd: ({ scene_link_input, alignment, resonance }) => { ... }
 *   });
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    overlayId: 'lumenDialogPhase1',
    maxFreeDialogTurns: 1,    // 5-2: 멀티턴 폐기. 자유대화 1턴 + 장면 잇기 1턴 (둘 다 자유 텍스트, 다른 자리)
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

  // ─── DOM ──────────────────────────────────
  function _buildOverlay(id) {
    var existing = document.getElementById(id);
    if (existing) return existing;

    var ov = document.createElement('div');
    ov.id = id;
    ov.style.cssText = [
      'position:fixed', 'inset:0',
      'display:flex', 'flex-direction:column', 'justify-content:flex-end',
      'align-items:center',
      'padding:24px',
      'background:rgba(0,0,0,0.55)',
      'backdrop-filter:blur(2px)',
      'z-index:240',
      'pointer-events:auto',
      'font-family:"Gowun Batang",serif',
      'color:rgba(232,216,252,0.92)',
    ].join(';');

    var msgs = document.createElement('div');
    msgs.id = id + '-messages';
    msgs.style.cssText = 'width:min(620px,90vw);max-height:55vh;overflow-y:auto;display:flex;flex-direction:column;gap:14px;margin-bottom:18px;';
    ov.appendChild(msgs);

    var inputArea = document.createElement('div');
    inputArea.id = id + '-input-area';
    inputArea.style.cssText = 'width:min(620px,90vw);min-height:60px;';
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
      'padding:12px 16px',
      'background:' + (opts.who === 'player' ? 'rgba(196,168,130,0.12)' : 'rgba(168,140,196,0.08)'),
      'border-left:2px solid ' + (opts.who === 'player' ? 'rgba(196,168,130,0.6)' : 'rgba(168,140,196,0.6)'),
      'border-radius:2px',
      'font-size:0.95rem',
      'line-height:1.65',
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
    box.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:center;';
    (choices || []).forEach(function (c, i) {
      var btn = document.createElement('button');
      btn.textContent = c.label;
      btn.style.cssText = [
        'padding:10px 18px', 'min-width:280px', 'max-width:90vw',
        'background:rgba(196,168,130,0.06)',
        'border:1px solid rgba(196,168,130,0.32)',
        'color:rgba(232,216,252,0.86)',
        'font-family:inherit', 'font-size:0.92rem',
        'cursor:pointer', 'border-radius:2px',
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
      'flex:1', 'padding:10px 14px',
      'background:rgba(0,0,0,0.4)',
      'border:1px solid rgba(196,168,130,0.32)',
      'color:rgba(232,216,252,0.92)',
      'font-family:inherit', 'font-size:0.95rem',
      'outline:none', 'border-radius:2px',
    ].join(';');
    input.onfocus = function () { input.style.borderColor = 'rgba(196,168,130,0.7)'; };
    input.onblur  = function () { input.style.borderColor = 'rgba(196,168,130,0.32)'; };

    var btn = document.createElement('button');
    btn.textContent = opts.submitLabel || '↵';
    btn.style.cssText = [
      'padding:10px 16px',
      'background:rgba(196,168,130,0.18)',
      'border:1px solid rgba(196,168,130,0.45)',
      'color:rgba(232,216,252,0.92)',
      'font-family:inherit', 'cursor:pointer', 'border-radius:2px',
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

    // 1. ghost_intro
    if (dlg.ghost_intro) {
      _addMessage(overlay, dlg.ghost_intro, { who: 'ghost' });
      await _sleep(DEFAULTS.pacingDelays.afterIntroMs);
    }

    // 2. choice_select
    var choice = await new Promise(function (resolve) {
      _renderChoices(overlay, dlg.choices || [], resolve);
    });
    _addMessage(overlay, choice.label, { who: 'player' });
    await _sleep(300);

    // 3. choice_reply
    if (choice.ghost_reply) {
      _addMessage(overlay, choice.ghost_reply, { who: 'ghost' });
      await _sleep(DEFAULTS.pacingDelays.afterReplyMs);
    }

    // 4. free_dialog 첫 질문
    if (choice.free_dialog_open) {
      _addMessage(overlay, choice.free_dialog_open, { who: 'ghost' });
      await _sleep(700);
    }

    // 5. free_dialog turns (max N, END_PHRASES 시 조기 종료)
    var lastAlignment = 0.5;
    var lastResonance = 'vague';
    var origEmotion = sceneData.original_emotion || sceneData.originalEmotion || {};

    for (var turn = 1; turn <= DEFAULTS.maxFreeDialogTurns; turn++) {
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

      // emotion 분석 + alignment
      var userEmo = await _analyzeEmotion(input.supabase, playerInput, sceneData.anchor_emotions);
      var alignment = userEmo ? _cosineSim(userEmo, origEmotion) : 0.5;
      lastAlignment = alignment;

      // 반응 풀 pick
      var resp = ghosts && typeof ghosts.pickResponse === 'function'
        ? ghosts.pickResponse({
            memoryId: memoryId, sceneId: sceneId, turn: turn,
            alignment: alignment, playerInput: playerInput,
          })
        : { resonance: 'vague', reply: '...' };
      lastResonance = resp.resonance;

      // 변형 펄스
      if (driftVis && typeof driftVis.pulse === 'function') {
        driftVis.pulse({ resonance: resp.resonance });
      }

      _addMessage(overlay, resp.reply, { who: 'ghost' });
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

    var result = {
      scene_link_input: sceneLinkInput,
      alignment: lastAlignment,
      resonance: lastResonance,
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
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

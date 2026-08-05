/**
 * Lumen Recalled Anchors — 되새겨진 기억 (2026-07-09)
 *
 * 설계: docs/되새김_앵커_설계-260709.md
 *
 * 무엇인가:
 *   플레이어가 자유 대화에서 *그 장면에 실제로 있는 사물/모티프*를 입에 담으면,
 *   그 단어는 "되새겨진 기억"이 되어 화면에 떠오른다. 스크린세이버처럼 화면 벽에
 *   튕기며 떠다니고, 유령 대화를 나가 지형을 걸어도 회차 내내 남는다.
 *
 * 왜 이 판정인가:
 *   기존 얼굴 속 글자는 그 장면 모티프를 *무작위로* 띄웠다 — 플레이어가 뭘 하든
 *   똑같아서 의미가 없었다. 되새김은 *플레이어의 행위가 만든 것*만 띄운다.
 *
 * 3단계 (사용자 결정 2026-07-09 — 오염 stage 곡선과 동형):
 *   1회 언급 → 흐릿한 글자 (느리게 떠다님)
 *   2회 언급 → 또렷한 글자 (빛남)
 *   3회+     → 아스키/블록으로 붕괴 ("너무 선명하게 기억하려 하면 오히려 무너진다")
 *   = 기억유전학 Destructive Replication + 오염 Stage 3(과완결)의 시각적 대응물.
 *
 * 의존:
 *   - window.FloatingAnchor (js/ui/floatingAnchor.js) — 스크린세이버 물리·3형태 렌더
 *   - 없으면 전부 무해한 no-op.
 *
 * 사용:
 *   LumenRecalledAnchors.check(playerInput, sceneData);  // 대화 매 턴
 *   LumenRecalledAnchors.clear();                        // 회차 끝
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    layerId: 'lumenRecalledAnchorLayer',
    maxAnchors: 7,          // 동시 표시 상한 — 넘으면 가장 낮은 단계·오래된 것부터 소멸
    decayStage: 3,          // 이 단계부터 붕괴(아스키) 표현
    dialogDimOpacity: 0.3,  // 대화창 떠 있을 때 — 자막 가림 방지
    exploreOpacity: 1.0,    // 지형 탐색 중
    minWordLen: 2,          // 1글자 모티프는 오탐 위험 → 제외
  };

  // 한글 초성 (붕괴 표현용)
  var CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  var BLOCKS = ['░', '▒', '▓'];

  // 결정적 PRNG — 같은 단어는 항상 같은 붕괴 모양 (재현성)
  function _hash(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
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

  // 붕괴 문자열 — 한글을 초성만 남기거나 블록으로 침식. 과완결의 시각적 대응물.
  function _decayText(word) {
    var rng = _mulberry32(_hash(word));
    var out = [];
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      var code = ch.charCodeAt(0) - 0xAC00;
      var r = rng();
      if (code >= 0 && code < 11172) {
        if (r < 0.45)      out.push(CHO[Math.floor(code / 588)]);   // 초성만 남음
        else if (r < 0.75) out.push(BLOCKS[Math.floor(rng() * 3)]); // 침식
        else               out.push(ch);                            // 버팀
      } else {
        out.push(ch);
      }
    }
    return out.join(' ');
  }

  // 그 장면의 모티프 — 작가가 심은 사물/공명 단어
  function _sceneMotifs(sceneData) {
    if (!sceneData) return [];
    var meta = sceneData.meta || {};
    var raw = []
      .concat(Array.isArray(meta.motif_tags) ? meta.motif_tags : [])
      .concat(Array.isArray(sceneData.echo_words) ? sceneData.echo_words : [])
      .concat(Array.isArray(meta.echo_words) ? meta.echo_words : []);
    var seen = {};
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var w = String(raw[i] || '').trim();
      if (w.length < DEFAULTS.minWordLen || seen[w]) continue;
      seen[w] = 1;
      out.push(w);
    }
    return out;
  }

  var _state = {
    layer: null,
    memoryId: null,
    words: {},   // word → { stage, anchor, seq }
    seq: 0,
    dimTimer: null,
  };

  // 대화창이 떠 있으면 옅게 — 자막을 가리지 않도록. (커플링 없이 DOM 존재만 본다)
  // 대화창 열림/닫힘은 자주 안 바뀌므로 400ms 폴링으로 충분 (rAF 낭비 회피).
  //
  // 레이어 생성에서 떼어냈다 (R2-7). 옛 구조는 타이머를 레이어 만들 때만 켰으므로,
  // clear() 에서 끄면 _ensureLayer 가 조기 반환(레이어 생존)해 다시는 안 켜졌다.
  function _ensureDimTimer() {
    if (_state.dimTimer) return;
    _state.dimTimer = setInterval(function () {
      if (!_state.layer || !_state.layer.parentNode) return;
      var dlgUp = !!document.getElementById('lumenDialogPhase1');
      var want = dlgUp ? DEFAULTS.dialogDimOpacity : DEFAULTS.exploreOpacity;
      if (_state.layer._lraOpacity !== want) {
        _state.layer._lraOpacity = want;
        _state.layer.style.opacity = String(want);
      }
    }, 400);
  }

  function _ensureLayer() {
    if (_state.layer && _state.layer.parentNode) { _ensureDimTimer(); return _state.layer; }
    if (typeof document === 'undefined') return null;

    // 스타일 — css/index.css 없는 페이지에서도 자립. .lra-layer 스코프.
    if (!document.getElementById('lra-style')) {
      var st = document.createElement('style');
      st.id = 'lra-style';
      st.textContent = [
        '.lra-layer .floating-anchor-layer { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; }',
        '.lra-layer .floating-anchor { position:absolute; top:0; left:0; will-change:transform; pointer-events:none; white-space:nowrap; font-family:"Cormorant Garamond","Gowun Batang",serif; }',
        // 1단계 — 흐릿하게 막 떠오른 기억
        '.lra-layer .floating-anchor.anchor-faded { font-size:1.35rem; color:rgba(214,196,236,0.5); opacity:0.42; letter-spacing:0.18em; filter:blur(0.6px); text-shadow:0 0 16px rgba(0,0,0,0.9); }',
        // 2단계 — 또렷하게 되새겨진 기억
        '.lra-layer .floating-anchor.anchor-clear { font-size:1.55rem; color:rgba(236,224,252,0.9); opacity:0.8; letter-spacing:0.1em; text-shadow:0 0 22px rgba(168,140,196,0.55), 0 0 10px rgba(0,0,0,0.95); }',
        // 3단계 — 과완결로 무너진 기억 (아스키/블록)
        '.lra-layer .floating-anchor.anchor-ghost { font-size:1.5rem; color:rgba(214,180,180,0.62); opacity:0.55; letter-spacing:0.34em; filter:blur(0.4px); text-shadow:0 0 18px rgba(0,0,0,0.95); }',
      ].join('\n');
      document.head.appendChild(st);
    }

    var layer = document.createElement('div');
    layer.id = DEFAULTS.layerId;
    layer.className = 'lra-layer';
    // 대화 오버레이(2800) 아래, 지형 위. 클릭 통과.
    layer.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100vw', 'height:100vh',
      'pointer-events:none',
      'z-index:2750',
      'opacity:1', 'transition:opacity 700ms ease',
      'overflow:hidden',
    ].join(';');
    document.body.appendChild(layer);
    _state.layer = layer;

    _ensureDimTimer();
    return layer;
  }

  // 단계 → FloatingAnchor 옵션. imageType 이 바뀌므로 승급 시엔 재생성한다.
  // 260806 — 중앙 낭독 띠(씬 본문·대사 구역) 회피. EN 데모 겹침 결함 수리 (floatingAnchor avoidBandY).
  var READ_BAND = [0.32, 0.66];
  function _optsForStage(word, stage) {
    if (stage >= DEFAULTS.decayStage) {
      // 붕괴 — 아스키/블록. anchor_images 에 작가가 ascii 를 등록해두면 그걸 우선 쓰도록 열어둔 자리.
      return { keyword: word, alignment: 0.15, clarity: 0, imageType: 'ascii', content: _decayText(word), avoidBandY: READ_BAND };
    }
    if (stage === 2) return { keyword: word, alignment: 0.75, clarity: 0, imageType: 'text', avoidBandY: READ_BAND }; // 또렷
    return { keyword: word, alignment: 0.35, clarity: 0.25, imageType: 'text', avoidBandY: READ_BAND };               // 흐릿
  }

  function _spawn(word, stage) {
    var layer = _ensureLayer();
    if (!layer || typeof global.FloatingAnchor !== 'function') return null;
    try {
      return new global.FloatingAnchor(layer, _optsForStage(word, stage));
    } catch (e) {
      console.warn('[recalled] anchor 생성 실패', e);
      return null;
    }
  }

  function _destroyWord(word) {
    var rec = _state.words[word];
    if (!rec) return;
    if (rec.anchor && typeof rec.anchor.destroy === 'function') {
      try { rec.anchor.destroy(); } catch (_) {}
    }
    delete _state.words[word];
  }

  // 상한 초과 시 — 가장 낮은 단계 중 가장 오래된 것부터 보낸다.
  function _enforceCap() {
    var keys = Object.keys(_state.words);
    while (keys.length > DEFAULTS.maxAnchors) {
      var victim = null;
      for (var i = 0; i < keys.length; i++) {
        var r = _state.words[keys[i]];
        if (!victim || r.stage < victim.rec.stage ||
            (r.stage === victim.rec.stage && r.seq < victim.rec.seq)) {
          victim = { word: keys[i], rec: r };
        }
      }
      if (!victim) break;
      _destroyWord(victim.word);
      keys = Object.keys(_state.words);
    }
  }

  /**
   * 되새김 판정 — 플레이어가 이 장면의 모티프를 입에 담았는가.
   * @param {string} playerInput 플레이어 자유 입력 원문
   * @param {Object} sceneData   scenes row (meta.motif_tags / echo_words)
   * @returns {Array<{word:string, stage:number}>} 이번 턴에 되새겨진 것들
   */
  function check(playerInput, sceneData) {
    var text = String(playerInput == null ? '' : playerInput);
    if (!text.trim()) return [];

    // 다른 기억으로 옮겨가면 이전 회차의 되새김은 지운다.
    var memId = (sceneData && (sceneData.memory_id || sceneData.memoryId)) || null;
    if (memId && _state.memoryId && memId !== _state.memoryId) clear();
    if (memId) _state.memoryId = memId;

    var motifs = _sceneMotifs(sceneData);
    var hits = [];
    for (var i = 0; i < motifs.length; i++) {
      var w = motifs[i];
      // 포함 매칭 — 조사가 붙어도("핫초코를") 잡힌다. NER 실패 위험 없음.
      if (text.indexOf(w) === -1) continue;

      var rec = _state.words[w];
      if (!rec) {
        // 처음 되새김 — 흐릿하게 떠오른다
        var a1 = _spawn(w, 1);
        if (!a1) continue;
        _state.words[w] = { stage: 1, anchor: a1, seq: ++_state.seq };
        hits.push({ word: w, stage: 1 });
      } else {
        // 또 되새김 — 단계 상승.
        var next = rec.stage + 1;
        var opt = _optsForStage(w, next);
        // 1→2 는 둘 다 text — 제자리에서 밝아진다 (updateAlignment/Clarity, 순간이동 X).
        // 2→3(붕괴, text→ascii)만 재생성 — "무너져 흩어진다"라 재배치가 오히려 맞음.
        if (opt.imageType === 'text' && rec.anchor &&
            typeof rec.anchor.updateAlignment === 'function') {
          rec.anchor.updateAlignment(opt.alignment);
          if (typeof rec.anchor.updateClarity === 'function') rec.anchor.updateClarity(opt.clarity);
        } else {
          if (rec.anchor && typeof rec.anchor.destroy === 'function') {
            try { rec.anchor.destroy(); } catch (_) {}
          }
          rec.anchor = _spawn(w, next);
        }
        rec.stage = next;
        rec.seq = ++_state.seq;
        hits.push({ word: w, stage: next });
      }
    }

    if (hits.length) {
      _enforceCap();
      console.log('[recalled] 되새김: ' + hits.map(function (h) {
        return h.word + '(' + h.stage + (h.stage >= DEFAULTS.decayStage ? ' 붕괴' : '') + ')';
      }).join(', '));
    }
    return hits;
  }

  function clear() {
    var keys = Object.keys(_state.words);
    for (var i = 0; i < keys.length; i++) _destroyWord(keys[i]);
    _state.words = {};
    _state.seq = 0;
    _state.memoryId = null;
    // 회차/기억 전환 — 띄울 단어가 없으니 감광 폴링도 멈춘다 (R2-7).
    // 다음 단어가 뜰 때 _ensureLayer → _ensureDimTimer 가 다시 켠다 (레이어가 살아 있어도).
    if (_state.dimTimer) { clearInterval(_state.dimTimer); _state.dimTimer = null; }
  }

  function destroy() {
    clear();
    if (_state.dimTimer) { clearInterval(_state.dimTimer); _state.dimTimer = null; }
    if (_state.layer && _state.layer.parentNode) _state.layer.parentNode.removeChild(_state.layer);
    _state.layer = null;
  }

  function getState() {
    var out = {};
    var keys = Object.keys(_state.words);
    for (var i = 0; i < keys.length; i++) out[keys[i]] = _state.words[keys[i]].stage;
    return { memoryId: _state.memoryId, words: out, count: keys.length };
  }

  global.LumenRecalledAnchors = {
    check: check,
    clear: clear,
    destroy: destroy,
    getState: getState,
    setOptions: function (o) { Object.assign(DEFAULTS, o || {}); },
    _decayText: _decayText,  // 테스트용
  };
})(typeof window !== 'undefined' ? window : globalThis);

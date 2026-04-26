/**
 * Lumen Return Speech
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260426.md §4 작업 2-C
 *        + docs/LUMEN_return_components-260421.md §6, §7
 *
 * 귀환 모드(= rewind 활성) 동안 두 종류의 텍스트 이벤트를 스케줄:
 *
 *   1. 유령 말투 미세 변화 (§6) — 2-A 때 기본 echo word 만 떠다니던 유령 sprite 자리에
 *      rewind 전용 monologue 한두 줄을 겹쳐 띄움. 2 유령 타입(core/bridge) 변주 포함.
 *
 *   2. 입력 파편 재셔플 (§7) — sessionStorage 의 오프닝 입력(`tem_opening_prefilled`) 을
 *      공백·구두점 단위로 쪼갠 뒤, 결정적 시드(memoryId + openingText) 로 셔플. 같은 입력 →
 *      같은 순서. rewind 중 1~3 개를 페이드 인/아웃 으로 화면에 띄움.
 *
 * 원본 수정 안 함. `rt.__lumenRewind.on('rewindStart' | 'rewindEnd')` 구독만.
 * `rt.__lumenReturnMode` 가 있어도 별개로 구독 — return_speech 는 말/파편 담당, return_mode 는
 * 색감·속도·자세 담당 (서로 간섭 없음).
 *
 * DOM: body 에 단일 overlay `#lumenReturnSpeech` 붙여 그 안에 fragment 조각 삽입. 3D 투영 없이
 * 화면 좌표만 사용 (MVP; 3D 연계는 V2).
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    overlayId: 'lumenReturnSpeech',
    // 파편 추출
    minFragments: 1,
    maxFragments: 3,
    fragmentWordMin: 1,
    fragmentWordMax: 2,
    // 파편 DOM
    fragmentFadeInMs:  500,
    fragmentHoldMs:    1300,
    fragmentFadeOutMs: 700,
    fragmentGapMs:     1400,   // 파편 간 간격
    // Monologue
    monologueCount: 2,          // 최대 독백 개수
    monologueDelayMs: 800,      // 첫 독백까지 대기
    monologueGapMs: 2600,
    monologueHoldMs: 2200,
    // 시드 소스 providers — overridable for testing
    openingTextProvider: null,  // () => string. null 이면 sessionStorage.getItem('tem_opening_prefilled')
    memoryIdProvider:    null,  // () => string. null 이면 window._temGame.memoryId
    // 말투 variants — 유령 타입별 rewind 전용 라인 풀
    monologueVariants: {
      core: [
        '…그건 그냥 그런 거였어.',
        '…이제 와 생각하면 별거 아니었어.',
        '…그랬었나. 확신이 안 서.'
      ],
      bridge: [
        '맞아. 분명 그랬어.',
        '왜 이제야 알겠지.',
        '그게 그거였던 거야.'
      ]
    }
  };

  // ─── 결정적 PRNG: mulberry32 + FNV-1a 문자열 해시 ───
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
  function _seededShuffle(arr, seedStr) {
    var rng = _mulberry32(_hashString(seedStr));
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  // ─── 파편 추출 ───
  // text → 공백·구두점 토크나이즈 → 빈 토큰 제거 → 연속 단어 n-gram(1~wordMax) 생성
  function _tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text.replace(/^(chip:|text:)/, '').split(/[\s,.!?;:·—\-"'`()\[\]{}]+/).filter(Boolean);
  }
  function _buildFragmentPool(words, wordMin, wordMax) {
    var out = [];
    if (!words.length) return out;
    var lo = Math.max(1, wordMin | 0);
    var hi = Math.max(lo, wordMax | 0);
    for (var n = lo; n <= hi; n++) {
      for (var i = 0; i + n <= words.length; i++) {
        out.push(words.slice(i, i + n).join(' '));
      }
    }
    // 중복 제거
    var seen = {}, dedup = [];
    for (var k = 0; k < out.length; k++) {
      if (!seen[out[k]]) { seen[out[k]] = 1; dedup.push(out[k]); }
    }
    return dedup;
  }

  function attach(runtime, opts) {
    if (!runtime) { console.error('[lumen-return-speech] runtime is required'); return null; }
    if (runtime.__lumenReturnSpeech) return runtime.__lumenReturnSpeech;
    opts = Object.assign({}, DEFAULTS, opts || {});

    var rewind = runtime.__lumenRewind || null;
    if (!rewind || typeof rewind.on !== 'function') {
      console.warn('[lumen-return-speech] rt.__lumenRewind 없음 — 비활성');
      return null;
    }

    // ─── overlay DOM ───
    var _overlay = null;
    function _ensureOverlay() {
      if (_overlay || typeof document === 'undefined') return;
      _overlay = document.createElement('div');
      _overlay.id = opts.overlayId;
      _overlay.style.cssText = [
        'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:260',
        'font-family:"Gowun Batang","Noto Serif KR",serif',
        'color:rgba(232,216,252,0.92)'
      ].join(';');
      document.body.appendChild(_overlay);
    }
    function _clearOverlay() {
      if (_overlay) {
        // 스케줄된 모든 timer 취소
        for (var i = 0; i < _pendingTimers.length; i++) clearTimeout(_pendingTimers[i]);
        _pendingTimers = [];
        while (_overlay.firstChild) _overlay.removeChild(_overlay.firstChild);
      }
    }
    function _removeOverlay() {
      _clearOverlay();
      if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
      _overlay = null;
    }

    var _pendingTimers = [];
    function _schedule(ms, fn) {
      var id = setTimeout(function () {
        // remove self from pending
        var idx = _pendingTimers.indexOf(id);
        if (idx >= 0) _pendingTimers.splice(idx, 1);
        try { fn(); } catch (e) { console.warn('[lumen-return-speech] schedule fn error', e); }
      }, ms);
      _pendingTimers.push(id);
      return id;
    }

    // ─── 파편 DOM spawn ───
    // kind: 'fragment' | 'monologue'
    // pos:  { top: '40%', left: '50%', translate: '-50%, -50%' } — CSS % 좌표
    function _spawnText(text, kind, pos, holdMs) {
      if (!_overlay || typeof document === 'undefined') return null;
      var el = document.createElement('div');
      var size = kind === 'monologue' ? 26 : 22;
      var letterSpacing = kind === 'monologue' ? '3px' : '2px';
      el.style.cssText = [
        'position:absolute',
        'top:' + pos.top,
        'left:' + pos.left,
        'transform:translate(' + (pos.translate || '-50%, -50%') + ')',
        'font-size:' + size + 'px',
        'letter-spacing:' + letterSpacing,
        'text-align:center',
        'opacity:0',
        'transition:opacity ' + opts.fragmentFadeInMs + 'ms ease',
        'text-shadow:0 0 12px rgba(232,216,252,0.5),0 0 2px rgba(0,0,0,0.6)',
        'max-width:70vw'
      ].join(';');
      el.textContent = text;
      el.dataset.lumenKind = kind;
      _overlay.appendChild(el);
      // fade in next frame
      requestAnimationFrame(function () { el.style.opacity = '1'; });
      // fade out + remove
      _schedule(holdMs, function () {
        el.style.transition = 'opacity ' + opts.fragmentFadeOutMs + 'ms ease';
        el.style.opacity = '0';
        _schedule(opts.fragmentFadeOutMs + 30, function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        });
      });
      return el;
    }

    // ─── 시드 조립 ───
    function _getOpeningText() {
      if (typeof opts.openingTextProvider === 'function') {
        try { return String(opts.openingTextProvider() || ''); } catch (_) { return ''; }
      }
      try { return String((typeof sessionStorage !== 'undefined' && sessionStorage.getItem('tem_opening_prefilled')) || ''); } catch (_) { return ''; }
    }
    function _getMemoryId() {
      if (typeof opts.memoryIdProvider === 'function') {
        try { return String(opts.memoryIdProvider() || ''); } catch (_) { return ''; }
      }
      try { return String((global._temGame && global._temGame.memoryId) || ''); } catch (_) { return ''; }
    }

    // ─── 재현성 확인용 마지막 스케줄 기록 ───
    var _lastSchedule = null;

    function _buildSchedule() {
      var openingText = _getOpeningText();
      var memoryId = _getMemoryId();
      var seed = 'lrs|' + memoryId + '|' + openingText;
      var words = _tokenize(openingText);
      var pool = _buildFragmentPool(words, opts.fragmentWordMin, opts.fragmentWordMax);

      var shuffled = _seededShuffle(pool, seed);
      // 개수: min..max 사이에서 seed 결정. 입력 짧으면 풀 크기까지.
      var sizeRng = _mulberry32(_hashString(seed + '|size'));
      var target = opts.minFragments + Math.floor(sizeRng() * (opts.maxFragments - opts.minFragments + 1));
      target = Math.min(target, shuffled.length);
      var fragments = shuffled.slice(0, target);

      // Monologue 셔플 — 각 타입에서 1개씩 시드에 따라 뽑음
      var monRng = _mulberry32(_hashString(seed + '|mono'));
      var monologues = [];
      var types = Object.keys(opts.monologueVariants || {});
      for (var ti = 0; ti < types.length && monologues.length < opts.monologueCount; ti++) {
        var pool2 = opts.monologueVariants[types[ti]] || [];
        if (!pool2.length) continue;
        var pick = pool2[Math.floor(monRng() * pool2.length)];
        monologues.push({ type: types[ti], line: pick });
      }

      return { seed: seed, openingText: openingText, memoryId: memoryId, pool: pool, fragments: fragments, monologues: monologues };
    }

    // ─── rewind 시작/종료 구독 ───
    var _active = false;

    function _onStart() {
      if (_active) return;
      _active = true;
      _ensureOverlay();
      var sched = _buildSchedule();
      _lastSchedule = sched;

      // 파편 — 일정 간격으로 순차 등장
      var delay = 400;
      sched.fragments.forEach(function (text, i) {
        var myDelay = delay + i * (opts.fragmentFadeInMs + opts.fragmentHoldMs + opts.fragmentGapMs);
        _schedule(myDelay, function () {
          if (!_active) return;
          // seed 로부터 결정된 위치 (가로 30~70% / 세로 25~65%)
          var posRng = _mulberry32(_hashString(sched.seed + '|pos|' + i));
          var leftPct = 30 + Math.floor(posRng() * 41);
          var topPct  = 25 + Math.floor(posRng() * 41);
          _spawnText(text, 'fragment', { top: topPct + '%', left: leftPct + '%' }, opts.fragmentHoldMs);
        });
      });

      // Monologue — 약간 늦게, 화면 상단 중앙 고정
      sched.monologues.forEach(function (m, i) {
        _schedule(opts.monologueDelayMs + i * opts.monologueGapMs, function () {
          if (!_active) return;
          _spawnText(m.line, 'monologue', { top: '36%', left: '50%' }, opts.monologueHoldMs);
        });
      });
    }

    function _onEnd() {
      if (!_active) return;
      _active = false;
      _clearOverlay();
    }

    rewind.on('rewindStart', _onStart);
    rewind.on('rewindEnd',   _onEnd);

    var api = {
      _runtime: runtime,
      isActive:        function () { return _active; },
      forceStart:      function () { _onStart(); },
      forceEnd:        function () { _onEnd(); },
      buildSchedule:   function () { return _buildSchedule(); },
      getLastSchedule: function () { return _lastSchedule; },
      setOptions:      function (patch) {
        if (!patch) return;
        Object.keys(patch).forEach(function (k) { if (k in DEFAULTS) opts[k] = patch[k]; });
      },
      getOptions:      function () { return Object.assign({}, opts); },
      destroy:         function () { _onEnd(); _removeOverlay(); delete runtime.__lumenReturnSpeech; }
    };
    runtime.__lumenReturnSpeech = api;
    return api;
  }

  global.LumenReturnSpeech = { attach: attach };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenReturnSpeech;
  }
})(typeof window !== 'undefined' ? window : this);

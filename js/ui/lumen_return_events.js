/**
 * Lumen Return Events
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260423.md §4 작업 2-D
 *        + docs/LUMEN_return_components-260421.md §8
 *
 * rewind(= 귀환) 중에만 발화되는 전용 사건 3종. 일반 진입 세션엔 한 개도 발화 안 됨.
 *
 *   1. fragment_rain — 오프닝 입력(sessionStorage `tem_opening_prefilled`) 또는 echo_words 풀에서
 *                       단어 N개를 화면 상단에서 낙하시키며 fade-out.
 *   2. ghost_flash   — 현재 scene_ghosts sprite 1개를 골라 opacity 를 순간 1.0 펄스 후 0 drop →
 *                       다음 프레임부터 기존 proximity 공식으로 자연 복귀.
 *   3. echo_burst    — 화면 좌우 곳곳에 단어 3개 펑 하고 나타났다가 빠르게 사라짐.
 *
 * 타이밍: rewind 추정 duration 의 20% / 50% / 80% 시점.
 *
 * 통합(§"+ 통합" 스코프): rewind 자연 종료(reason='reached_start') 시 짧은 dim 오버레이 페이드로
 *   착지 신호. force stop / fp_exit 에서는 dim 안 뜸.
 *
 * 원본 수정 안 함. `rt.__lumenRewind.on('rewindStart' | 'rewindEnd')` + `rt.__lumenSceneGhosts`
 * public API 만 사용. 일반 세션에는 attach 되어 있어도 rewind 없이 자발적 발화 경로 없음.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    overlayId: 'lumenReturnEvents',
    // 스케줄 — rewind 추정 duration 대비 비율
    eventFractions: [0.20, 0.50, 0.80],
    minGapMs: 1200,          // 이웃 이벤트 최소 간격 (timing 겹침 방지)
    // 1. fragment_rain
    rainCount: 5,
    rainDurationMs: 2200,
    rainStagger: 180,
    // 2. ghost_flash
    flashPeakMs: 180,
    flashDropMs: 1400,
    // 3. echo_burst
    burstCount: 3,
    burstHoldMs: 900,
    burstFadeMs: 600,
    // 통합: 착지 dim
    landingDimMs: 900,
    landingDimAlpha: 0.35,
    // providers
    openingTextProvider: null,   // () => string
    echoWordsProvider:   null,   // () => string[]
    rewindReasonForLanding: 'reached_start'
  };

  function _tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text.replace(/^(chip:|text:)/, '').split(/[\s,.!?;:·—\-"'`()\[\]{}]+/).filter(Boolean);
  }

  function _fnv1a(s) {
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

  function attach(runtime, opts) {
    if (!runtime) { console.error('[lumen-return-events] runtime is required'); return null; }
    if (runtime.__lumenReturnEvents) return runtime.__lumenReturnEvents;
    opts = Object.assign({}, DEFAULTS, opts || {});

    var rewind = runtime.__lumenRewind || null;
    if (!rewind || typeof rewind.on !== 'function') {
      console.warn('[lumen-return-events] rt.__lumenRewind 없음 — 비활성');
      return null;
    }

    var _overlay = null;
    function _ensureOverlay() {
      if (_overlay || typeof document === 'undefined') return;
      _overlay = document.createElement('div');
      _overlay.id = opts.overlayId;
      _overlay.style.cssText = [
        'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:265',
        'font-family:"Gowun Batang","Noto Serif KR",serif',
        'color:rgba(232,216,252,0.92)'
      ].join(';');
      document.body.appendChild(_overlay);
    }

    var _timers = [];
    function _schedule(ms, fn) {
      var id = setTimeout(function () {
        var idx = _timers.indexOf(id);
        if (idx >= 0) _timers.splice(idx, 1);
        try { fn(); } catch (e) { console.warn('[lumen-return-events] schedule fn error', e); }
      }, ms);
      _timers.push(id);
      return id;
    }
    function _cancelAll() {
      for (var i = 0; i < _timers.length; i++) clearTimeout(_timers[i]);
      _timers = [];
    }

    function _pickWords(seed, count) {
      var opening = '';
      try {
        opening = typeof opts.openingTextProvider === 'function'
          ? (opts.openingTextProvider() || '')
          : ((typeof sessionStorage !== 'undefined' && sessionStorage.getItem('tem_opening_prefilled')) || '');
      } catch (_) {}
      var echoPool = [];
      try {
        if (typeof opts.echoWordsProvider === 'function') {
          var got = opts.echoWordsProvider();
          if (Array.isArray(got)) echoPool = got.filter(function (w) { return typeof w === 'string' && w.trim(); });
        }
      } catch (_) {}
      var combined = _tokenize(opening).concat(echoPool);
      if (!combined.length) combined = ['…', '잔상', '흔적', '숨결', '기억'];
      var rng = _mulberry32(_fnv1a(seed));
      var out = [];
      for (var i = 0; i < count; i++) {
        out.push(combined[Math.floor(rng() * combined.length)]);
      }
      return out;
    }

    // ─── Event 1: fragment_rain ───
    function _fireFragmentRain(seed) {
      _ensureOverlay();
      if (!_overlay) return;
      var words = _pickWords(seed + '|rain', opts.rainCount);
      var rng = _mulberry32(_fnv1a(seed + '|rain|pos'));
      for (var i = 0; i < words.length; i++) {
        (function (word, idx) {
          _schedule(idx * opts.rainStagger, function () {
            if (!_active) return;
            var el = document.createElement('div');
            var leftPct = 10 + Math.floor(rng() * 81);
            el.style.cssText = [
              'position:absolute',
              'left:' + leftPct + '%',
              'top:-10%',
              'transform:translate(-50%, 0)',
              'font-size:20px',
              'letter-spacing:2px',
              'opacity:0.85',
              'transition:transform ' + opts.rainDurationMs + 'ms linear, opacity ' + opts.rainDurationMs + 'ms ease',
              'text-shadow:0 0 12px rgba(232,216,252,0.55)'
            ].join(';');
            el.textContent = word;
            el.dataset.lumenEvent = 'rain';
            _overlay.appendChild(el);
            requestAnimationFrame(function () {
              el.style.transform = 'translate(-50%, 110vh)';
              el.style.opacity = '0';
            });
            _schedule(opts.rainDurationMs + 80, function () {
              if (el.parentNode) el.parentNode.removeChild(el);
            });
          });
        })(words[i], i);
      }
    }

    // ─── Event 2: ghost_flash ───
    function _fireGhostFlash(seed) {
      var sg = runtime.__lumenSceneGhosts;
      var scene = runtime.getScene && runtime.getScene();
      if (!scene) return;
      var candidates = [];
      scene.traverse(function (o) {
        if (o && o.userData && o.userData._lumenSceneGhost && o.material) candidates.push(o);
      });
      if (!candidates.length) return;
      var rng = _mulberry32(_fnv1a(seed + '|flash'));
      var target = candidates[Math.floor(rng() * candidates.length)];
      // 원래 opacity 는 render wrap 이 매 frame 덮어쓰므로, userData 에 일시 override 기록 대신
      // 짧은 시간 window 동안 material.opacity 를 직접 pulse. render wrap 이 다음 frame 에 복귀.
      target.material.opacity = 1.0;
      target.userData._lumenFlashPeak = performance.now();
      _schedule(opts.flashPeakMs, function () {
        if (target && target.material) target.material.opacity = 0.0;
      });
      // flashDropMs 뒤에는 render wrap 이 정상 복귀. 별도 복원 로직 불필요.
    }

    // ─── Event 3: echo_burst ───
    function _fireEchoBurst(seed) {
      _ensureOverlay();
      if (!_overlay) return;
      var words = _pickWords(seed + '|burst', opts.burstCount);
      var rng = _mulberry32(_fnv1a(seed + '|burst|pos'));
      words.forEach(function (word, i) {
        var leftPct = 15 + Math.floor(rng() * 71);
        var topPct  = 20 + Math.floor(rng() * 51);
        var el = document.createElement('div');
        el.style.cssText = [
          'position:absolute',
          'left:' + leftPct + '%',
          'top:' + topPct + '%',
          'transform:translate(-50%, -50%) scale(0.6)',
          'font-size:28px',
          'letter-spacing:3px',
          'opacity:0',
          'transition:transform 360ms cubic-bezier(.2,.9,.3,1.2), opacity 260ms ease',
          'text-shadow:0 0 18px rgba(252,232,180,0.7)',
          'color:rgba(252,232,180,0.95)'
        ].join(';');
        el.textContent = word;
        el.dataset.lumenEvent = 'burst';
        _overlay.appendChild(el);
        requestAnimationFrame(function () {
          el.style.opacity = '1';
          el.style.transform = 'translate(-50%, -50%) scale(1.0)';
        });
        _schedule(opts.burstHoldMs, function () {
          el.style.transition = 'opacity ' + opts.burstFadeMs + 'ms ease';
          el.style.opacity = '0';
          _schedule(opts.burstFadeMs + 30, function () {
            if (el.parentNode) el.parentNode.removeChild(el);
          });
        });
      });
    }

    // ─── 통합: 착지 dim ───
    function _fireLandingDim() {
      _ensureOverlay();
      if (!_overlay) return;
      var dim = document.createElement('div');
      dim.style.cssText = [
        'position:absolute', 'inset:0',
        'background:rgba(0,0,0,' + opts.landingDimAlpha + ')',
        'opacity:0',
        'transition:opacity ' + opts.landingDimMs + 'ms ease'
      ].join(';');
      dim.dataset.lumenEvent = 'landingDim';
      _overlay.appendChild(dim);
      requestAnimationFrame(function () { dim.style.opacity = '1'; });
      _schedule(opts.landingDimMs + 800, function () {
        dim.style.opacity = '0';
        _schedule(opts.landingDimMs + 100, function () {
          if (dim.parentNode) dim.parentNode.removeChild(dim);
        });
      });
    }

    // ─── rewind 사이클 ───
    var _active = false;
    var _lastPlan = null;  // 디버그/smoke 용

    function _onStart(payload) {
      if (_active) return;
      _active = true;
      _cancelAll();
      var duration = (payload && typeof payload.durationEstimate === 'number' && payload.durationEstimate > 0)
        ? payload.durationEstimate
        : 8000; // fallback
      var seed = 'lre|' + duration + '|' + (runtime.__lumenRewind && runtime.__lumenRewind.getOptions ? runtime.__lumenRewind.getOptions().playbackSpeed : 1.0);
      var planned = [];
      var fns = [_fireFragmentRain, _fireGhostFlash, _fireEchoBurst];
      var fracs = opts.eventFractions.slice();

      // timing 겹침 방지 — minGapMs 보장
      var computed = fracs.map(function (f) { return Math.max(0, Math.floor(duration * f)); });
      for (var i = 1; i < computed.length; i++) {
        if (computed[i] - computed[i - 1] < opts.minGapMs) {
          computed[i] = computed[i - 1] + opts.minGapMs;
        }
      }

      for (var k = 0; k < Math.min(fns.length, fracs.length); k++) {
        (function (when, fn, name) {
          planned.push({ name: name, atMs: when });
          _schedule(when, function () {
            if (!_active) return;
            // 반드시 rewind 중이어야 발화 (이중 가드 — 외부가 force stop 후 pending timer 가 남은 edge case)
            if (!rewind.isRewinding || !rewind.isRewinding()) return;
            fn(seed);
          });
        })(computed[k], fns[k], ['fragment_rain', 'ghost_flash', 'echo_burst'][k]);
      }
      _lastPlan = { seed: seed, duration: duration, planned: planned };
    }

    function _onEnd(payload) {
      if (!_active) return;
      _active = false;
      _cancelAll();
      // overlay 안의 event 엘리먼트 잔재 제거 (rain 도중 stop 대비)
      if (_overlay) {
        var nodes = _overlay.querySelectorAll('[data-lumen-event]:not([data-lumen-event="landingDim"])');
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
        }
      }
      // 통합 — 자연 종료에만 착지 dim
      var reason = payload && payload.reason;
      if (reason === opts.rewindReasonForLanding) {
        _fireLandingDim();
      }
    }

    rewind.on('rewindStart', _onStart);
    rewind.on('rewindEnd',   _onEnd);

    var api = {
      _runtime: runtime,
      isActive: function () { return _active; },
      getLastPlan: function () { return _lastPlan; },
      // 테스트 편의 — rewind 없이 특정 이벤트만 개별 트리거 (gate 우회)
      forceEvent: function (name, seed) {
        seed = seed || 'manual';
        if (name === 'fragment_rain') return _fireFragmentRain(seed);
        if (name === 'ghost_flash')   return _fireGhostFlash(seed);
        if (name === 'echo_burst')    return _fireEchoBurst(seed);
        if (name === 'landing_dim')   return _fireLandingDim();
        return null;
      },
      setOptions: function (patch) {
        if (!patch) return;
        Object.keys(patch).forEach(function (k) { if (k in DEFAULTS) opts[k] = patch[k]; });
      },
      getOptions: function () { return Object.assign({}, opts); },
      _overlayEl: function () { return _overlay; }
    };
    runtime.__lumenReturnEvents = api;
    return api;
  }

  global.LumenReturnEvents = { attach: attach };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenReturnEvents;
  }
})(typeof window !== 'undefined' ? window : this);

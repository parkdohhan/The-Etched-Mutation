// ================================================================
//  STRATA — AF TERRAIN (Attribution × Core Fear + plays)
//  Replaces legacy multi-slab accumulation; uses js/shared/tem_af_strata_terrain.js
// ================================================================

(function () {
  'use strict';

  var g = typeof window !== 'undefined' ? window : this;

  var _onCloseCallback = null;
  var terrainRuntime = null;
  var animId = null;
  var canvas = null;
  var _lastConfig = null;
  var STRATA_BRIGHTNESS_KEY = 'tem_strata_default_brightness';
  var STRATA_BRIGHTNESS_MIN = 0.8;
  var STRATA_BRIGHTNESS_MAX = 2.4;
  var STRATA_BRIGHTNESS_FALLBACK = 1.35;

  function readStoredBrightness() {
    try {
      var raw = localStorage.getItem(STRATA_BRIGHTNESS_KEY);
      if (raw == null || raw === '') return STRATA_BRIGHTNESS_FALLBACK;
      var v = parseFloat(raw);
      if (!isFinite(v)) return STRATA_BRIGHTNESS_FALLBACK;
      return Math.max(STRATA_BRIGHTNESS_MIN, Math.min(STRATA_BRIGHTNESS_MAX, v));
    } catch (e) {
      return STRATA_BRIGHTNESS_FALLBACK;
    }
  }

  function writeStoredBrightness(v) {
    try {
      localStorage.setItem(STRATA_BRIGHTNESS_KEY, String(v));
    } catch (e) {}
  }

  var _brightness = readStoredBrightness();

  function getCanvasViewportSize() {
    if (!canvas) return { w: innerWidth, h: innerHeight };
    var r = canvas.getBoundingClientRect();
    var w = r.width > 2 ? r.width : innerWidth;
    var h = r.height > 2 ? r.height : innerHeight;
    return { w: w, h: h };
  }

  function ensureRuntime() {
    if (terrainRuntime) return;
    if (!g.TemAfStrataTerrain) {
      console.error('[Strata] TemAfStrataTerrain not loaded (include js/shared/tem_af_strata_terrain.js)');
      return;
    }
    canvas = document.getElementById('strataCanvas');
    if (!canvas) {
      console.error('[Strata] #strataCanvas not found');
      return;
    }
    terrainRuntime = g.TemAfStrataTerrain.createStrataTerrain(THREE, canvas, {
      clearColor: 0x12121a,
      fogColor: 0x12121a,
      fogDensity: 0.004,
    });
    terrainRuntime.init();
    applyRendererBrightness();
    bindBrightnessControl();
  }

  function applyRendererBrightness() {
    if (!terrainRuntime || !terrainRuntime.getRenderer) return;
    var renderer = terrainRuntime.getRenderer();
    if (!renderer) return;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = _brightness;
  }

  function bindBrightnessControl() {
    var input = document.getElementById('strataBrightness');
    var valEl = document.getElementById('strataBrightnessVal');
    if (!input) return;
    _brightness = readStoredBrightness();
    input.min = String(STRATA_BRIGHTNESS_MIN);
    input.max = String(STRATA_BRIGHTNESS_MAX);
    input.value = String(_brightness);
    if (valEl) valEl.textContent = _brightness.toFixed(2) + 'x';
    applyRendererBrightness();
    if (input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      if (!isFinite(v)) return;
      _brightness = Math.max(STRATA_BRIGHTNESS_MIN, Math.min(STRATA_BRIGHTNESS_MAX, v));
      applyRendererBrightness();
      if (valEl) valEl.textContent = _brightness.toFixed(2) + 'x';
      writeStoredBrightness(_brightness);
    });
  }

  function updateHUD(cfg) {
    var trEl = document.getElementById('strataHudTR');
    if (trEl && cfg) {
      var p0 = cfg.P && cfg.P[0];
      var afStr = p0 && p0.af ? 'AF (' + p0.af.x.toFixed(2) + ', ' + p0.af.z.toFixed(2) + ')' : '—';
      trEl.innerHTML =
        (cfg.title || 'Memory') + '<br>' +
        (cfg.playCount != null ? cfg.playCount : 0) + ' interpretations · ' + afStr + '<br>' +
        '<span style="opacity:0.85">' + (cfg.subtitle || '') + '</span>';
    }
    var ctFl = document.getElementById('strataCtFl');
    var ctVal = document.getElementById('strataCtVal');
    var c = cfg && cfg.contamination != null ? cfg.contamination : 0;
    if (ctFl) ctFl.style.width = Math.min(100, c * 100) + '%';
    if (ctVal) ctVal.textContent = c.toFixed(2);
    var dvEl = document.getElementById('strataDv');
    if (dvEl) {
      dvEl.innerHTML =
        'Attribution × core fear plane<br><span style="color:var(--ghost);font-size:11px">Drag to orbit · pillars = memory seeds</span>';
    }
  }

  function computeContamination(plays) {
    if (!plays || !plays.length) return 0;
    var T = g.TemAfStrataTerrain;
    var s = 0;
    for (var i = 0; i < plays.length; i++) {
      var al = T.playAlignment(plays[i]);
      s += 1 - al;
    }
    return s / plays.length;
  }

  function getMemoryRowFallback(memoryId) {
    if (g.memoriesData && g.memoriesData.length) {
      for (var i = 0; i < g.memoriesData.length; i++) {
        var m = g.memoriesData[i];
        if (m.id === memoryId) {
          return {
            id: m.id,
            title: m.title || m.code || 'Memory',
            memory_words: m.memory_words || '',
            completed_sentence: m.completed_sentence || '',
          };
        }
      }
    }
    return {
      id: memoryId,
      title: 'Memory',
      memory_words: '',
      completed_sentence: '',
    };
  }

  function getLocalFallbackData(memoryId) {
    var plays = (g._simulatedPlaysMap && g._simulatedPlaysMap[memoryId]) || [];
    if (plays.length > 0) {
      console.log('[Strata] 로컬 시뮬 plays 사용:', plays.length);
      return { memRow: getMemoryRowFallback(memoryId), plays: plays };
    }
    return null;
  }

  async function fetchStrataAfInput(memoryId) {
    var T = g.TemAfStrataTerrain;
    if (!T) return null;

    try {
      var client = null;
      if (g.getSupabaseClient) client = g.getSupabaseClient();
      else if (g.networkService && g.networkService.getClient) client = g.networkService.getClient();

      if (!client) {
        var loc = getLocalFallbackData(memoryId);
        if (!loc) return null;
        var P0 = T.buildMemoryItems([loc.memRow], (function () { var o = {}; o[memoryId] = loc.plays; return o; })());
        return {
          P: P0,
          title: loc.memRow.title,
          playCount: loc.plays.length,
          contamination: computeContamination(loc.plays),
          subtitle: 'local simulation',
        };
      }

      var memRes = await client
        .from('memories')
        .select('id, title, memory_words, completed_sentence')
        .eq('id', memoryId)
        .maybeSingle();

      if (memRes && memRes.error) console.warn('[Strata] memories:', memRes.error.message);
      var memRow = memRes && memRes.data ? memRes.data : null;
      if (!memRow) {
        var loc2 = getLocalFallbackData(memoryId);
        if (loc2) memRow = loc2.memRow;
        else memRow = getMemoryRowFallback(memoryId);
      }

      var playsRes = await client
        .from('plays')
        .select('id, memory_id, scene_id, user_emotion, alignment, mismatch_type, created_at, alignment_score')
        .eq('memory_id', memoryId)
        .order('created_at', { ascending: false });

      var plays = [];
      if (playsRes && playsRes.error) {
        console.warn('[Strata] plays:', playsRes.error.message);
        plays = (g._simulatedPlaysMap && g._simulatedPlaysMap[memoryId]) || [];
      } else {
        plays = (playsRes && playsRes.data) || [];
      }
      if (plays.length === 0) {
        var lp = (g._simulatedPlaysMap && g._simulatedPlaysMap[memoryId]) || [];
        if (lp.length) {
          plays = lp;
          console.log('[Strata] plays Supabase 비어있어 로컬 사용:', lp.length);
        }
      }

      var playsByMem = {};
      playsByMem[memoryId] = plays;
      var P = T.buildMemoryItems([memRow], playsByMem);

      return {
        P: P,
        title: memRow.title || memRow.completed_sentence || memRow.memory_words || 'Memory',
        playCount: plays.length,
        contamination: computeContamination(plays),
        subtitle: '',
      };
    } catch (err) {
      console.error('[Strata] fetchStrataAfInput:', err);
      var loc3 = getLocalFallbackData(memoryId);
      if (!loc3) return null;
      var P1 = T.buildMemoryItems([loc3.memRow], (function () { var o = {}; o[memoryId] = loc3.plays; return o; })());
      return {
        P: P1,
        title: loc3.memRow.title,
        playCount: loc3.plays.length,
        contamination: computeContamination(loc3.plays),
        subtitle: 'fallback',
      };
    }
  }

  function animateLoop() {
    if (terrainRuntime) terrainRuntime.tick();
    animId = requestAnimationFrame(animateLoop);
  }

  function closeStrataView() {
    g.Strata.stop();
    var viewEl = document.getElementById('strataView');
    if (viewEl) viewEl.style.display = 'none';
    if (_onCloseCallback) _onCloseCallback();
  }

  g.showStrataView = async function (memoryId, alignmentResult, onClose) {
    console.log('[Strata] showStrataView:', { memoryId: memoryId, alignmentResult: alignmentResult });
    _onCloseCallback = onClose;

    try {
      var strataInput = await fetchStrataAfInput(memoryId);
      if (!strataInput || !strataInput.P || !strataInput.P.length) {
        console.error('[Strata] No terrain data');
        if (onClose) onClose();
        return;
      }

      ensureRuntime();
      if (!terrainRuntime) {
        if (onClose) onClose();
        return;
      }

      g.Strata.start();
      g.Strata.init(strataInput);

      var viewEl = document.getElementById('strataView');
      if (viewEl) viewEl.style.display = 'block';

      var closeBtn = document.getElementById('strataCloseBtn');
      if (closeBtn) closeBtn.onclick = closeStrataView;
      bindBrightnessControl();
      applyRendererBrightness();
    } catch (error) {
      console.error('[Strata] showStrataView:', error);
      if (onClose) onClose();
    }
  };

  g.Strata = {
    init: function (config) {
      _lastConfig = config;
      ensureRuntime();
      if (!terrainRuntime) return;
      terrainRuntime.setP(config.P);
      terrainRuntime.buildTerrain(null);
      terrainRuntime.focusCameraOnSeed();
      updateHUD(config);
    },
    appendEvent: function () {
      console.warn('[Strata] appendEvent is not implemented for AF terrain');
    },
    appendEvents: function () {
      console.warn('[Strata] appendEvents is not implemented for AF terrain');
    },
    recompute: function () {
      console.warn('[Strata] recompute is not implemented for AF terrain');
    },
    mapEventToRender: function () {
      return null;
    },
    start: function () {
      ensureRuntime();
      if (!terrainRuntime) return;
      if (!animId) animateLoop();
      terrainRuntime.resize();
    },
    stop: function () {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    },
    resizeToCanvas: function () {
      if (terrainRuntime) terrainRuntime.resize();
    },
    getData: function () {
      return { config: _lastConfig, P: terrainRuntime ? terrainRuntime.getP() : [] };
    },
  };

  addEventListener('resize', function () {
    if (terrainRuntime) terrainRuntime.resize();
  });

  g.debugStrata = function (memoryId) {
    var id = memoryId;
    if (!id && g.memoriesData && g.memoriesData.length > 0) {
      id = g.memoriesData[0].id;
      console.log('[Strata] memoryId 생략 → 첫 기억:', id);
    }
    if (!id) {
      id = '8fe034ef-6db0-4ba1-b291-66954fea2e08';
      console.warn('[Strata] 기본 memoryId 사용:', id);
    }
    return g.showStrataView(id, null, function () {
      var viewEl = document.getElementById('strataView');
      if (viewEl) viewEl.style.display = 'none';
    });
  };
  g.debugStrataHelp = function () {
    var list = (g.memoriesData || [])
      .map(function (m, i) {
        return i + 1 + '. ' + (m.code || '') + ' ' + (m.id || '').slice(0, 8) + '…';
      })
      .join('\n');
    console.log(
      '[Strata] debugStrata() / debugStrata(memoryId)\n' + (list ? '  ' + list : '')
    );
  };
  console.log('[Strata] AF terrain · debugStrata()');
})();

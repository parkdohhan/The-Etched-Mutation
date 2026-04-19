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
  var _audioEngine = null;
  var _audioUnlocked = false;
  function _strataLang() { return (document.documentElement.lang || 'en').substring(0, 2) === 'ko' ? 'ko' : 'en'; }
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
      fogDensity: 0.006,
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
        .select('id, title, memory_words, completed_sentence, cont_drift, cont_fixation, cont_divergence, cont_convergence, cont_heterogeneity, cont_depth, cont_stage, cont_stage_1, cont_stage_2, cont_stage_3, dilution, drift_dir_v, drift_dir_a, drift_dir_d, sensory_anchor, _cont_align_mean')
        .eq('id', memoryId)
        .maybeSingle();

      if (memRes && memRes.error) console.warn('[Strata] memories:', memRes.error.message);
      var memRow = memRes && memRes.data ? memRes.data : null;
      if (!memRow) {
        var loc2 = getLocalFallbackData(memoryId);
        if (loc2) memRow = loc2.memRow;
        else memRow = getMemoryRowFallback(memoryId);
      }

      // Fetch scenes for scene pins (admin mode)
      var scenesRes = await client
        .from('scenes')
        .select('id, memory_id, scene_order, text, original_emotion, echo_words, void_info, meta')
        .eq('memory_id', memoryId)
        .order('scene_order', { ascending: true });
      var sceneRows = (scenesRes && !scenesRes.error && scenesRes.data) ? scenesRes.data : [];

      var playsRes = await client
        .from('plays')
        .select('id, memory_id, scene_id, user_emotion, alignment, mismatch_type, created_at, user_id')
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

      // Identify current user's plays
      var currentUserId = null;
      try {
        var authRes = await client.auth.getUser();
        currentUserId = authRes && authRes.data && authRes.data.user ? authRes.data.user.id : null;
      } catch (_) {}

      var playsByMem = {};
      playsByMem[memoryId] = plays;
      var scenesByMem = {};
      scenesByMem[memoryId] = sceneRows;
      var P = T.buildMemoryItems([memRow], playsByMem, scenesByMem);

      // Mark which plays belong to the current user
      var userPlayCount = 0;
      if (currentUserId) {
        userPlayCount = plays.filter(function (p) { return p.user_id === currentUserId; }).length;
      }

      // Collect current user's plays with emotion data for markers
      var userPlays = [];
      if (currentUserId) {
        userPlays = plays.filter(function (p) { return p.user_id === currentUserId; });
      }

      return {
        P: P,
        title: memRow.title || memRow.completed_sentence || memRow.memory_words || 'Memory',
        playCount: plays.length,
        userPlayCount: userPlayCount,
        userPlays: userPlays,
        scenes: sceneRows,
        currentUserId: currentUserId,
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

  // ─── Proximity monologue generation ──────────────────────────
  var EMOTION_LABELS = {
    ko: {
      fear:'공포', sadness:'슬픔', anger:'분노', guilt:'죄책감', shame:'수치심',
      isolation:'고립', numbness:'무감각', moral_pain:'도덕적 고통', helplessness:'무력감',
      despair:'절망', joy:'기쁨', hope:'희망', relief:'안도', gratitude:'감사',
      love:'사랑', peace:'평화', comfort:'위로', longing:'그리움', nostalgia:'향수',
      confusion:'혼란', emptiness:'공허'
    },
    en: {
      fear:'Fear', sadness:'Sadness', anger:'Anger', guilt:'Guilt', shame:'Shame',
      isolation:'Isolation', numbness:'Numbness', moral_pain:'Moral pain', helplessness:'Helplessness',
      despair:'Despair', joy:'Joy', hope:'Hope', relief:'Relief', gratitude:'Gratitude',
      love:'Love', peace:'Peace', comfort:'Comfort', longing:'Longing', nostalgia:'Nostalgia',
      confusion:'Confusion', emptiness:'Emptiness'
    }
  };
  function _emoLabel(key) { var m = EMOTION_LABELS[_strataLang()]; return (m && m[key]) || key; }

  function _generateProximityMonologue(origDom, playDom, avgAlignment, playCount) {
    var ko = _strataLang() === 'ko';
    if (playCount === 0) return ko ? '…아무도 여기 오지 않았다.' : '…no one has been here.';

    // Same emotion
    if (origDom === playDom) {
      if (avgAlignment > 0.6) return ko ? '…여기는 익숙해. 누군가 같은 걸 느꼈나 봐.' : '…this feels familiar. someone felt the same.';
      return ko ? '…같은 감정인데, 무게가 다르다.' : '…the same emotion, but it weighs differently.';
    }

    // Categorize emotions
    var neg = ['fear','sadness','anger','guilt','shame','isolation','numbness','moral_pain','helplessness','despair','emptiness'];
    var pos = ['joy','hope','relief','gratitude','love','peace','comfort'];
    var origNeg = neg.indexOf(origDom) >= 0;
    var playNeg = neg.indexOf(playDom) >= 0;

    // Negative original + positive play overlay
    if (origNeg && !playNeg) return ko ? '…여긴 원래 어두웠는데. 누가 빛을 가져다 놨어.' : '…this was dark before. someone brought light.';
    // Positive original + negative play overlay
    if (!origNeg && playNeg) return ko ? '…밝았던 곳인데. 무거운 게 얹어져 있다.' : '…it was bright here. something heavy has settled.';
    // Different negative emotions
    if (origNeg && playNeg) {
      if (origDom === 'sadness' && playDom === 'anger') return ko ? '…슬픔이었는데, 누가 여기서 화를 냈다.' : '…it was sadness, but someone left anger here.';
      if (origDom === 'anger' && playDom === 'sadness') return ko ? '…분노의 자리에 슬픔이 스며들었어.' : '…sadness seeped into where anger once stood.';
      if (origDom === 'fear') return ko ? '…두려움 위에 다른 그림자가 겹쳐 있다.' : '…another shadow overlaps the fear.';
      return ko ? '…여긴 어디지. 원래 이런 곳이 아니었는데.' : '…where is this. it wasn\'t like this before.';
    }
    // Different positive emotions
    if (!origNeg && !playNeg) return ko ? '…같은 빛인데 색이 다르다.' : '…the same light, but a different color.';

    return ko ? '…뭔가 달라졌다. 원래 이랬나.' : '…something changed. was it always like this?';
  }

  // ─── Proximity system (first-person, admin only) ────────────
  var _proxState = { nearPin: null, el: null, hintEl: null, panelEl: null, longPressTimer: null, shakeTimer: null };

  function _ensureProximityUI() {
    if (_proxState.el) return;

    // Find the best parent — fullscreen container or strataView or body
    var parent = document.getElementById('adminStrataContainer') || document.getElementById('strataView') || document.body;

    // Monologue text (bottom center)
    var el = document.createElement('div');
    el.id = 'strataProximityText';
    el.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);color:#c4a882;font-size:14px;letter-spacing:2px;text-align:center;pointer-events:none;opacity:0;transition:opacity 0.8s;z-index:200;text-shadow:0 0 10px rgba(196,168,130,0.4);max-width:400px;';
    parent.appendChild(el);
    _proxState.el = el;

    // Long-press hint (below monologue)
    var hint = document.createElement('div');
    hint.id = 'strataProximityHint';
    hint.style.cssText = 'position:absolute;bottom:50px;left:50%;transform:translateX(-50%);color:rgba(196,168,130,0.4);font-size:11px;letter-spacing:1px;text-align:center;pointer-events:none;opacity:0;transition:opacity 0.6s;z-index:200;';
    parent.appendChild(hint);
    _proxState.hintEl = hint;

    // Detail panel (translucent overlay — terrain stays visible behind)
    var panel = document.createElement('div');
    panel.id = 'strataScenePanel';
    panel.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(6,6,10,0.82);color:#c4a882;border:1px solid rgba(196,168,130,0.12);border-radius:4px;padding:28px 36px;max-width:400px;width:85%;z-index:300;display:none;font-size:13px;line-height:1.8;max-height:60vh;overflow-y:auto;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
    parent.appendChild(panel);
    _proxState.panelEl = panel;
  }

  function _showProximityMonologue(pin) {
    var sd = pin.userData._sceneData;
    if (!sd) return;
    _ensureProximityUI();
    _proxState.el.textContent = sd.monologue;
    _proxState.el.style.opacity = '1';
    _proxState.hintEl.textContent = _strataLang() === 'ko' ? '클릭을 길게 눌러 들여다 보세요' : 'Hold click to look inside';
    _proxState.hintEl.style.opacity = '1';
    _proxState.nearPin = pin;
  }

  function _hideProximityMonologue() {
    if (_proxState.el) _proxState.el.style.opacity = '0';
    if (_proxState.hintEl) _proxState.hintEl.style.opacity = '0';
    _proxState.nearPin = null;
  }

  // Emotion chip definitions for terrain interaction
  var TERRAIN_EMOTIONS = [
    { key: 'fear', ko: '공포', en: 'Fear' },
    { key: 'sadness', ko: '슬픔', en: 'Sadness' },
    { key: 'anger', ko: '분노', en: 'Anger' },
    { key: 'longing', ko: '그리움', en: 'Longing' },
    { key: 'guilt', ko: '죄책감', en: 'Guilt' },
    { key: 'shame', ko: '수치심', en: 'Shame' },
    { key: 'numbness', ko: '무감각', en: 'Numbness' },
    { key: 'isolation', ko: '고립', en: 'Isolation' },
    { key: 'joy', ko: '기쁨', en: 'Joy' },
    { key: 'hope', ko: '희망', en: 'Hope' },
    { key: 'peace', ko: '평화', en: 'Peace' },
  ];

  var _frozenTick = false;

  function _openScenePanel(pin) {
    var sd = pin.userData._sceneData;
    if (!sd) return;
    _ensureProximityUI();

    // Freeze terrain animation (camera stays, world pauses)
    _frozenTick = true;

    var isAdmin = !!document.getElementById('adminDashboard');
    var ko = _strataLang() === 'ko';
    var origDomLabel = _emoLabel(sd.originalDominant);
    var playDomLabel = _emoLabel(sd.playDominant) || '—';

    var html = '';

    if (isAdmin) {
      // ─── Admin: detailed info panel ──
      html += '<div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(196,168,130,0.4);margin-bottom:8px;">Scene ' + (sd.sceneOrder + 1) + '</div>';
      html += '<div style="font-size:14px;line-height:1.8;margin-bottom:16px;color:rgba(196,168,130,0.8);">' + sd.text + '</div>';
      html += '<div style="border-top:1px solid rgba(196,168,130,0.1);padding-top:12px;font-size:12px;">';
      html += '<div style="margin-bottom:4px;">' + (ko ? '원본 감정' : 'Original') + ': <span style="color:#6a9fd8;">' + origDomLabel + '</span></div>';
      if (sd.playCount > 0) {
        html += '<div style="margin-bottom:4px;">' + (ko ? '체험자 감정' : 'Player') + ': <span style="color:#c4a882;">' + playDomLabel + '</span> (' + sd.playCount + (ko ? '회 체험' : ' plays') + ')</div>';
        html += '<div style="margin-bottom:4px;">' + (ko ? '평균 정렬도' : 'Avg alignment') + ': ' + (sd.avgAlignment * 100).toFixed(0) + '%</div>';
      } else {
        html += '<div style="color:rgba(196,168,130,0.3);">' + (ko ? '아직 아무도 이 장면을 체험하지 않았다' : 'No one has experienced this scene yet') + '</div>';
      }
      if (sd.plays && sd.plays.length > 0) {
        html += '<div style="margin-top:12px;border-top:1px solid rgba(196,168,130,0.1);padding-top:8px;font-size:11px;color:rgba(196,168,130,0.5);">';
        sd.plays.forEach(function (p, pi) {
          var ue = p.user_emotion;
          if (typeof ue === 'string') { try { ue = JSON.parse(ue); } catch (_) { ue = {}; } }
          var dk = ''; var dv = 0;
          for (var k in ue) { if (ue[k] > dv) { dv = ue[k]; dk = k; } }
          html += '<div>' + (pi + 1) + '. ' + _emoLabel(dk) + ' — ' + (p.alignment ? (p.alignment * 100).toFixed(0) + '%' : '—') + '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    } else {
      // ─── Play: emotion chip interaction ──
      html += '<div style="font-size:11px;letter-spacing:2px;text-align:center;color:rgba(196,168,130,0.4);margin-bottom:12px;">'
        + (ko ? '이 흔적에서 무엇을 느끼시나요?' : 'What do you feel from this trace?') + '</div>';
      html += '<div style="font-size:13px;line-height:1.8;margin-bottom:16px;color:rgba(196,168,130,0.6);text-align:center;font-style:italic;">"' + (sd.text || '').substring(0, 80) + (sd.text && sd.text.length > 80 ? '…' : '') + '"</div>';
      html += '<div id="strataEmotionChips" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:16px;">';
      TERRAIN_EMOTIONS.forEach(function (em) {
        html += '<button type="button" class="strata-emo-chip" data-emo="' + em.key + '" style="'
          + 'padding:6px 14px;border:1px solid rgba(196,168,130,0.25);border-radius:16px;'
          + 'background:transparent;color:rgba(196,168,130,0.7);font-size:12px;cursor:pointer;'
          + 'transition:all 0.3s;letter-spacing:1px;">'
          + (ko ? em.ko : em.en) + '</button>';
      });
      html += '</div>';
      html += '<div style="text-align:center;">';
      html += '<button type="button" id="strataEmoSubmit" disabled style="'
        + 'padding:8px 24px;border:1px solid rgba(196,168,130,0.3);border-radius:4px;'
        + 'background:rgba(196,168,130,0.08);color:rgba(196,168,130,0.5);font-size:12px;'
        + 'cursor:not-allowed;transition:all 0.3s;letter-spacing:2px;">'
        + (ko ? '남기다' : 'Leave a mark') + '</button>';
      html += '</div>';
    }

    html += '<div style="margin-top:16px;text-align:center;font-size:11px;color:rgba(196,168,130,0.3);cursor:pointer;" id="strataScenePanelClose">' + (ko ? '클릭하여 닫기' : 'Click to close') + '</div>';

    _proxState.panelEl.innerHTML = html;
    _proxState.panelEl.style.display = 'block';
    _proxState.panelEl.style.pointerEvents = 'auto';

    if (document.pointerLockElement) document.exitPointerLock();

    function _closePanel() {
      _proxState.panelEl.style.display = 'none';
      _frozenTick = false; // unfreeze terrain
      document.removeEventListener('keydown', _panelKeyHandler);
    }

    // ─── Emotion chip interaction (play mode) ──
    if (!isAdmin) {
      var selectedEmotions = {};
      var chips = _proxState.panelEl.querySelectorAll('.strata-emo-chip');
      var submitBtn = document.getElementById('strataEmoSubmit');

      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          var key = chip.dataset.emo;
          if (selectedEmotions[key]) {
            delete selectedEmotions[key];
            chip.style.borderColor = 'rgba(196,168,130,0.25)';
            chip.style.color = 'rgba(196,168,130,0.7)';
            chip.style.background = 'transparent';
          } else {
            selectedEmotions[key] = 1;
            chip.style.borderColor = '#c4a882';
            chip.style.color = '#c4a882';
            chip.style.background = 'rgba(196,168,130,0.12)';
          }
          var hasSelection = Object.keys(selectedEmotions).length > 0;
          submitBtn.disabled = !hasSelection;
          submitBtn.style.cursor = hasSelection ? 'pointer' : 'not-allowed';
          submitBtn.style.color = hasSelection ? '#c4a882' : 'rgba(196,168,130,0.5)';
          submitBtn.style.borderColor = hasSelection ? 'rgba(196,168,130,0.5)' : 'rgba(196,168,130,0.3)';
        });
      });

      submitBtn.addEventListener('click', function () {
        if (submitBtn.disabled) return;
        // Build emotion vector (equal weight for selected emotions)
        var emoVec = {};
        var keys = Object.keys(selectedEmotions);
        var w = 1.0 / keys.length;
        keys.forEach(function (k) { emoVec[k] = w; });

        // Compute alignment with original emotion
        var origEmo = sd.originalEmotion || {};
        var dot = 0; var magA = 0; var magB = 0;
        for (var ek in emoVec) { dot += (emoVec[ek] || 0) * (origEmo[ek] || 0); magA += emoVec[ek] * emoVec[ek]; }
        for (var ok in origEmo) { magB += origEmo[ok] * origEmo[ok]; }
        var alignment = (magA > 0 && magB > 0) ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0.5;

        // Save play to Supabase
        _saveTerrainPlay(sd.sceneId, emoVec, alignment);

        // Push emotion to heartbeat waveform
        _pushHeartbeatEmotion(emoVec);

        // Visual feedback
        submitBtn.textContent = ko ? '새겨졌다' : 'Etched';
        submitBtn.disabled = true;
        submitBtn.style.color = 'rgba(196,168,130,0.3)';
        setTimeout(_closePanel, 1200);
      });
    }

    var closeEl = document.getElementById('strataScenePanelClose');
    if (closeEl) closeEl.onclick = _closePanel;
    _proxState.panelEl.onclick = function (e) {
      if (e.target === _proxState.panelEl || e.target === closeEl) _closePanel();
    };

    function _panelKeyHandler(e) {
      if (e.code === 'Escape') { _closePanel(); e.preventDefault(); }
    }
    document.addEventListener('keydown', _panelKeyHandler);
  }

  // Save terrain play and rebuild terrain
  async function _saveTerrainPlay(sceneId, emoVec, alignment) {
    try {
      var client = null;
      if (g.getSupabaseClient) client = g.getSupabaseClient();
      else if (g.networkService && g.networkService.getClient) client = g.networkService.getClient();
      if (!client) { console.warn('[Strata] No Supabase client for terrain play'); return; }

      var memoryId = _lastConfig && _lastConfig.P && _lastConfig.P[0] ? _lastConfig.P[0].id : null;
      if (!memoryId) return;

      var userId = null;
      try {
        var authRes = await client.auth.getUser();
        userId = authRes && authRes.data && authRes.data.user ? authRes.data.user.id : null;
      } catch (_) {}

      var playRow = {
        memory_id: memoryId,
        scene_id: sceneId,
        user_id: userId,
        user_emotion: emoVec,
        alignment: alignment,
        mismatch_type: alignment < 0.3 ? 'emotion_mismatch' : 'none',
      };

      var res = await client.from('plays').insert(playRow);
      if (res.error) { console.warn('[Strata] Play insert error:', res.error.message); return; }

      console.log('[Strata] Terrain play saved, rebuilding terrain...');

      // Rebuild terrain with new data
      if (memoryId && g.showStrataView) {
        g.showStrataView(memoryId, null, null);
      }
    } catch (e) {
      console.warn('[Strata] saveTerrainPlay error:', e.message);
    }
  }

  function _screenShakeThenOpen(pin) {
    if (!canvas) { _openScenePanel(pin); return; }
    var orig = canvas.style.transform || '';
    var count = 0;
    var interval = setInterval(function () {
      var dx = (Math.random() - 0.5) * 4;
      var dy = (Math.random() - 0.5) * 4;
      canvas.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      count++;
      if (count > 8) {
        clearInterval(interval);
        canvas.style.transform = orig;
        _openScenePanel(pin);
      }
    }, 40);
  }

  function _setupProximitySystem(scenePins, runtime, cvs) {
    var PROXIMITY_DIST = 6;
    var LONG_PRESS_MS = 800;

    // Check proximity every frame — works in both orbit and first-person
    var _proxInterval = setInterval(function () {
      if (!runtime) return;
      var cam = runtime.getCamera();
      if (!cam) return;

      var closest = null; var closestDist = Infinity;
      scenePins.forEach(function (pin) {
        var dx = cam.position.x - pin.position.x;
        var dz = cam.position.z - pin.position.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < closestDist) { closestDist = dist; closest = pin; }
      });

      if (closest && closestDist < PROXIMITY_DIST) {
        if (_proxState.nearPin !== closest) {
          console.log('[Strata Proximity] Near pin, dist=' + closestDist.toFixed(1), closest.userData._sceneData?.monologue);
          _showProximityMonologue(closest);
        }
        // Pulse the pin
        closest.material.emissiveIntensity = 0.5 + Math.sin(performance.now() * 0.004) * 0.3;
      } else {
        if (_proxState.nearPin) _hideProximityMonologue();
      }
    }, 100);

    // Long-press to open panel
    var _pressStart = 0;
    var _pressTimer = null;
    var _onMouseDown = function () {
      if (!_proxState.nearPin) return;
      _pressStart = Date.now();
      _pressTimer = setTimeout(function () {
        if (_proxState.nearPin) _screenShakeThenOpen(_proxState.nearPin);
      }, LONG_PRESS_MS);
    };
    var _onMouseUp = function () {
      if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; }
    };
    cvs.addEventListener('mousedown', _onMouseDown);
    cvs.addEventListener('mouseup', _onMouseUp);

    // Store cleanup refs
    cvs._proxInterval = _proxInterval;
    cvs._proxMouseDown = _onMouseDown;
    cvs._proxMouseUp = _onMouseUp;
  }

  // ─── Heartbeat emotion waveform ──────────────────────────────
  var _heartbeat = {
    buffer: new Float32Array(200),
    writeIdx: 0,
    color: [196, 168, 130], // default amber
    targetColor: [196, 168, 130],
    intensity: 0.3,
    targetIntensity: 0.3,
    lastBeatTime: 0,
  };

  function _pushHeartbeatEmotion(emoVec) {
    if (!emoVec) return;
    // Find dominant emotion for color
    var domK = ''; var domV = 0;
    for (var k in emoVec) { if (emoVec[k] > domV) { domV = emoVec[k]; domK = k; } }
    var EC_HB = {
      fear: [102,71,179], sadness: [64,97,166], anger: [204,64,56], guilt: [153,122,89],
      longing: [71,158,166], numbness: [82,82,97], shame: [148,89,122], isolation: [36,36,61],
      joy: [209,184,97], hope: [140,166,115], love: [179,102,128], peace: [115,148,133],
      gratitude: [166,148,102], relief: [122,173,122], confusion: [122,97,140],
      resentment: [153,51,38], resignation: [102,97,89],
    };
    _heartbeat.targetColor = EC_HB[domK] || [196, 168, 130];
    // Intensity spike
    _heartbeat.targetIntensity = Math.min(1, 0.5 + domV * 0.5);
  }

  function _drawHeartbeat() {
    var cvs = document.getElementById('strataHeartbeat');
    if (!cvs) return;
    var ctx = cvs.getContext('2d');
    var w = cvs.width; var h = cvs.height;
    ctx.clearRect(0, 0, w, h);

    var buf = _heartbeat.buffer;
    var idx = _heartbeat.writeIdx;

    // Lerp color
    for (var ci = 0; ci < 3; ci++) {
      _heartbeat.color[ci] += (_heartbeat.targetColor[ci] - _heartbeat.color[ci]) * 0.03;
    }
    _heartbeat.intensity += (_heartbeat.targetIntensity - _heartbeat.intensity) * 0.02;
    // Decay intensity slowly
    _heartbeat.targetIntensity = Math.max(0.15, _heartbeat.targetIntensity - 0.001);

    // Generate heartbeat-like signal
    var now = performance.now();
    var beatInterval = 800 + (1 - _heartbeat.intensity) * 600; // faster when intense
    var timeSinceBeat = (now - _heartbeat.lastBeatTime) % beatInterval;
    var beatPhase = timeSinceBeat / beatInterval;

    var sample = 0;
    if (beatPhase < 0.08) {
      sample = Math.sin(beatPhase / 0.08 * Math.PI) * 0.3 * _heartbeat.intensity;
    } else if (beatPhase < 0.15) {
      sample = -Math.sin((beatPhase - 0.08) / 0.07 * Math.PI) * 0.15 * _heartbeat.intensity;
    } else if (beatPhase < 0.25) {
      sample = Math.sin((beatPhase - 0.15) / 0.1 * Math.PI) * _heartbeat.intensity;
    } else if (beatPhase < 0.35) {
      sample = -Math.sin((beatPhase - 0.25) / 0.1 * Math.PI) * 0.4 * _heartbeat.intensity;
    } else {
      sample = Math.sin(beatPhase * Math.PI * 2) * 0.02 * _heartbeat.intensity;
    }
    if (timeSinceBeat < 16) _heartbeat.lastBeatTime = now - timeSinceBeat;

    buf[idx] = sample;
    _heartbeat.writeIdx = (idx + 1) % buf.length;

    // Draw
    var r = Math.round(_heartbeat.color[0]);
    var g2 = Math.round(_heartbeat.color[1]);
    var b = Math.round(_heartbeat.color[2]);
    ctx.strokeStyle = 'rgba(' + r + ',' + g2 + ',' + b + ',0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (var i = 0; i < buf.length; i++) {
      var si = (idx + 1 + i) % buf.length;
      var x = (i / buf.length) * w;
      var y = h / 2 - buf[si] * h * 0.45;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Faint glow line
    ctx.strokeStyle = 'rgba(' + r + ',' + g2 + ',' + b + ',0.15)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  g._pushHeartbeatEmotion = _pushHeartbeatEmotion;

  function animateLoop() {
    if (terrainRuntime && !_frozenTick) terrainRuntime.tick();
    else if (terrainRuntime && _frozenTick) {
      var r = terrainRuntime.getRenderer();
      var s = terrainRuntime.getScene();
      var c = terrainRuntime.getCamera();
      if (r && s && c) r.render(s, c);
    }
    if (_audioEngine && terrainRuntime) {
      var cam = terrainRuntime.getCamera();
      if (cam && cam.position) _audioEngine.setListener(cam.position.x, cam.position.y, cam.position.z);
    }
    _drawHeartbeat();
    animId = requestAnimationFrame(animateLoop);
  }

  function closeStrataView() {
    // Exit first-person mode if active
    if (terrainRuntime && terrainRuntime.isFirstPerson && terrainRuntime.isFirstPerson()) {
      terrainRuntime.exitFirstPerson();
    }
    g.Strata.stop();
    var viewEl = document.getElementById('strataView');
    if (viewEl) viewEl.style.display = 'none';
    // Cleanup hover tooltip and listener
    var tip = document.getElementById('strataTooltip');
    if (tip) tip.style.display = 'none';
    if (canvas && canvas._strataMouseMove) {
      canvas.removeEventListener('mousemove', canvas._strataMouseMove);
      canvas._strataMouseMove = null;
    }
    // Cleanup proximity system
    if (canvas && canvas._proxInterval) { clearInterval(canvas._proxInterval); canvas._proxInterval = null; }
    if (canvas && canvas._proxMouseDown) { canvas.removeEventListener('mousedown', canvas._proxMouseDown); canvas._proxMouseDown = null; }
    if (canvas && canvas._proxMouseUp) { canvas.removeEventListener('mouseup', canvas._proxMouseUp); canvas._proxMouseUp = null; }
    _hideProximityMonologue();
    if (_proxState.panelEl) _proxState.panelEl.style.display = 'none';
    // Cleanup floating anchors
    if (canvas && canvas._faAnimId) { cancelAnimationFrame(canvas._faAnimId); canvas._faAnimId = null; }
    if (canvas && canvas._faSprites) {
      var scene3 = terrainRuntime ? terrainRuntime.getScene() : null;
      if (scene3) {
        canvas._faSprites.forEach(function (s) {
          scene3.remove(s);
          if (s.material) { if (s.material.map) s.material.map.dispose(); s.material.dispose(); }
        });
      }
      canvas._faSprites = null;
    }
    if (_audioEngine) {
      try { _audioEngine.dispose(); } catch(_){}
      _audioEngine = null;
    }
    _audioUnlocked = false;
    if (canvas && canvas._audioUnlockHandler) {
      canvas.removeEventListener('pointerdown', canvas._audioUnlockHandler);
      canvas._audioUnlockHandler = null;
    }
    if (_onCloseCallback) {
      _onCloseCallback();
    } else if (typeof g.enterArchive === 'function') {
      g.enterArchive();
    } else if (typeof g.showMainMenu === 'function') {
      g.showMainMenu();
    }
  }
  g.closeStrataView = closeStrataView;

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

      if (!_audioEngine && typeof g.createSpatialAudioEngine === 'function') {
        try { _audioEngine = g.createSpatialAudioEngine(); }
        catch (e) { console.warn('[Strata] audio engine init fail:', e && e.message); _audioEngine = null; }
      }
      _audioUnlocked = false;
      if (_audioEngine && canvas) {
        var _unlock = function () {
          if (!_audioUnlocked && _audioEngine) { try { _audioEngine.resume(); } catch(_){} _audioUnlocked = true; }
        };
        canvas.addEventListener('pointerdown', _unlock, { once: true });
        canvas._audioUnlockHandler = _unlock;
      }

      g.Strata.start();
      g.Strata.init(strataInput);

      // Clean up previous user markers
      if (terrainRuntime) {
        var scene3 = terrainRuntime.getScene();
        if (scene3) {
          var toRemove = [];
          scene3.traverse(function (obj) { if (obj.userData._userMarker) toRemove.push(obj); });
          toRemove.forEach(function (obj) {
            scene3.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
          });
        }
      }

      var _userMarkerMeshes = [];

      // ─── Scene pins (admin only — all scenes visible) ───────────
      var _scenePinMeshes = [];
      var isAdmin = !!document.getElementById('adminDashboard');

      // Collect plays grouped by scene_id for proximity monologue
      var _playsByScene = {};
      if (strataInput.P && strataInput.P[0] && strataInput.P[0].plays) {
        strataInput.P[0].plays.forEach(function (p) {
          if (p.scene_id) {
            if (!_playsByScene[p.scene_id]) _playsByScene[p.scene_id] = [];
            _playsByScene[p.scene_id].push(p);
          }
        });
      }

      if (isAdmin && strataInput.scenes && strataInput.scenes.length > 0 && terrainRuntime) {
        try {
          var scene3 = terrainRuntime.getScene();
          var T = g.TemAfStrataTerrain;
          // Use sceneAF coordinates from buildMemoryItems (VA projection)
          var sceneAFList = (strataInput.P && strataInput.P[0]) ? strataInput.P[0].sceneAF : [];

          var _ghostTexCache = {};
          function _getGhostTexture(type) {
            if (_ghostTexCache[type]) return _ghostTexCache[type];
            var PRESETS = {
              core:   { blur: 1.8, opacity: 0.82, tone: '#d4b890', mask: false },
              bridge: { blur: 1.1, opacity: 0.93, tone: '#c49668', mask: false },
              voidP:  { blur: 2.4, opacity: 0.58, tone: '#6a6055', mask: true  }
            };
            var GHOST_PATH = 'M 20 2 Q 26 2 26 10 Q 25 14 22 14 L 30 17 Q 32 18 32 19 L 31 40 Q 30 42 29 40 L 28 20 L 27 32 L 28 45 L 27 70 L 29 74 L 22 74 L 22 47 Q 20 44 19 45 L 18 47 L 18 74 L 11 74 L 13 70 L 12 45 L 13 32 L 12 20 L 11 40 Q 10 42 9 40 L 8 19 Q 8 18 10 17 L 18 14 Q 15 14 14 10 Q 14 2 20 2 Z';
            var p = PRESETS[type] || PRESETS.core;
            var w = 256, h = 512;
            var stdDev = p.blur * 0.45;
            var defs = '<filter id="blur" x="-30%" y="-30%" width="160%" height="160%">' +
                       '<feGaussianBlur stdDeviation="' + stdDev + '"/></filter>';
            if (p.mask) {
              defs += '<linearGradient id="fade" x1="0" y1="0" x2="0" y2="82" gradientUnits="userSpaceOnUse">' +
                      '<stop offset="0.4" stop-color="white" stop-opacity="1"/>' +
                      '<stop offset="0.8" stop-color="white" stop-opacity="0.5"/>' +
                      '<stop offset="1.0" stop-color="white" stop-opacity="0"/>' +
                      '</linearGradient>' +
                      '<mask id="fademask"><rect x="-4" y="-2" width="48" height="82" fill="url(#fade)"/></mask>';
            }
            var maskAttr = p.mask ? ' mask="url(#fademask)"' : '';
            var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -2 48 82" width="' + w + '" height="' + h + '">' +
              '<defs>' + defs + '</defs>' +
              '<g filter="url(#blur)"' + maskAttr + '>' +
                '<path fill="' + p.tone + '" opacity="' + p.opacity + '" d="' + GHOST_PATH + '"/>' +
              '</g></svg>';
            var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            var tex = new THREE.Texture();
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter;
            var img = new Image();
            img.onload = function () {
              var cvs = document.createElement('canvas');
              cvs.width = w; cvs.height = h;
              cvs.getContext('2d').drawImage(img, 0, 0);
              tex.image = cvs;
              tex.needsUpdate = true;
            };
            img.src = url;
            _ghostTexCache[type] = tex;
            return tex;
          }

          strataInput.scenes.forEach(function (sc, si) {
            var emo = sc.original_emotion;
            if (!emo) return;
            if (typeof emo === 'string') { try { emo = JSON.parse(emo); } catch (_) { return; } }

            // Find matching sceneAF entry for this scene's coordinates
            var saf = null;
            for (var sai = 0; sai < sceneAFList.length; sai++) {
              if (sceneAFList[sai].id === sc.id) { saf = sceneAFList[sai]; break; }
            }
            // pin_override 있으면 VAD 자동 좌표 대신 그걸로 (admin 명시 지정)
            var po = sc.meta && sc.meta.pin_override;
            if (typeof po === 'string') { try { po = JSON.parse(po); } catch (_) { po = null; } }
            var sx, sz;
            if (po && typeof po.v === 'number' && typeof po.a === 'number') {
              var _H2 = 56;
              var _memId = (strataInput.P && strataInput.P[0]) ? strataInput.P[0].id : null;
              var _off = (_memId && T._hashWorldOffset) ? T._hashWorldOffset(_memId) : { ox: 0, oz: 0 };
              sx = po.v * _H2 + _off.ox;
              sz = po.a * _H2 + _off.oz;
            } else {
              if (!saf) return; // no VA coordinates computed
              sx = saf.wx;
              sz = saf.wz;
            }
            var sh = terrainRuntime.gH(sx, sz);

            // Ghost sprite replaces diamond pin (visual only).
            // userData / 이벤트 / 연결선 / 오디오 / long-press 진입은 기존 로직 그대로 유지.
            var _ghostType = 'core';
            var _vi = sc.void_info;
            if (typeof _vi === 'string') { try { _vi = JSON.parse(_vi); } catch (_) { _vi = null; } }
            if (_vi && _vi.sceneVoid) _ghostType = 'voidP';
            else if (sc.scene_role === 'residual') _ghostType = 'bridge';
            var pinCol = 0x6a9fd8;
            var pinMat = new THREE.SpriteMaterial({
              map: _getGhostTexture(_ghostType),
              transparent: true, depthWrite: false, fog: true
            });
            var pin = new THREE.Sprite(pinMat);
            pin.scale.set(1.75, 3.0, 1);
            pin.position.set(sx, sh + 1.6, sz);
            pin.userData._userMarker = true;
            pin.userData._isScenePin = true;
            pin.userData._ghostType = _ghostType;

            // Find dominant original emotion
            var origDom = ''; var origDomVal = 0;
            for (var ek in emo) { if (emo[ek] > origDomVal) { origDomVal = emo[ek]; origDom = ek; } }

            // Find dominant play emotion for this scene (if any plays exist)
            var scenePlays = _playsByScene[sc.id] || [];
            var playDom = ''; var playDomVal = 0;
            var avgAlignment = 0;
            scenePlays.forEach(function (sp) {
              if (sp.alignment) avgAlignment += sp.alignment;
              var ue = sp.user_emotion;
              if (!ue) return;
              if (typeof ue === 'string') { try { ue = JSON.parse(ue); } catch (_) { return; } }
              for (var pk in ue) { if (ue[pk] > playDomVal) { playDomVal = ue[pk]; playDom = pk; } }
            });
            if (scenePlays.length > 0) avgAlignment /= scenePlays.length;

            // Generate proximity monologue based on emotional comparison
            var monologue = _generateProximityMonologue(origDom, playDom, avgAlignment, scenePlays.length);

            pin.userData._sceneData = {
              sceneOrder: sc.scene_order != null ? sc.scene_order : si,
              text: sc.text || '',
              originalEmotion: emo,
              originalDominant: origDom,
              playDominant: playDom,
              playCount: scenePlays.length,
              avgAlignment: avgAlignment,
              monologue: monologue,
              plays: scenePlays
            };

            pin.userData._playInfo = {
              alignment: scenePlays.length > 0 ? avgAlignment : null,
              dominantEmotion: 'Scene ' + ((sc.scene_order != null ? sc.scene_order : si) + 1),
              dominantValue: null,
              mismatch: (sc.text || '').substring(0, 50) + (sc.text && sc.text.length > 50 ? '…' : ''),
              date: scenePlays.length > 0 ? scenePlays.length + ' plays' : 'no plays'
            };

            scene3.add(pin);
            _scenePinMeshes.push(pin);

            // Spatial audio: register scene sound if meta.sound_url exists
            if (_audioEngine && sc.meta && sc.meta.sound_url) {
              try {
                _audioEngine.register(sc.id, {
                  url: sc.meta.sound_url,
                  x: sx, y: sh + 0.5, z: sz,
                  volume: sc.meta.sound_volume != null ? sc.meta.sound_volume : 1,
                  radius: sc.meta.sound_radius != null ? sc.meta.sound_radius : 15,
                  loop: true
                });
              } catch (ae) { console.warn('[Strata] audio register fail:', ae && ae.message); }
            }

            // Thin vertical line from terrain to pin
            var lineGeo = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(sx, sh, sz),
              new THREE.Vector3(sx, sh + 0.5, sz)
            ]);
            var line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: pinCol, opacity: 0.4, transparent: true }));
            line.userData._userMarker = true;
            scene3.add(line);
          });
          console.log('[Strata] Added scene pins (admin):', _scenePinMeshes.length);
        } catch (e) {
          console.warn('[Strata] Scene pin error:', e.message);
        }
      }

      // ─── 3D Floating Anchors (echo_words as floating text sprites) ──
      var _floatingAnchorSprites = [];
      if (strataInput.scenes && strataInput.scenes.length > 0 && terrainRuntime) {
        try {
          var scene3 = terrainRuntime.getScene();
          var T = g.TemAfStrataTerrain;

          function _makeTextSprite(text, color, opacity) {
            var canvas2 = document.createElement('canvas');
            var ctx = canvas2.getContext('2d');
            var fontSize = 48;
            ctx.font = fontSize + 'px "Courier New", monospace';
            var w = ctx.measureText(text).width + 24;
            canvas2.width = Math.min(512, Math.max(128, Math.pow(2, Math.ceil(Math.log2(w)))));
            canvas2.height = 64;
            ctx.font = fontSize + 'px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = color || 'rgba(196,168,130,0.7)';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 6;
            ctx.fillText(text, canvas2.width / 2, canvas2.height / 2);
            var tex = new THREE.CanvasTexture(canvas2);
            tex.minFilter = THREE.LinearFilter;
            var mat = new THREE.SpriteMaterial({
              map: tex,
              transparent: true,
              opacity: opacity != null ? opacity : 0.7,
              fog: true,
              depthWrite: false
            });
            var sprite = new THREE.Sprite(mat);
            sprite.scale.set(canvas2.width / 64, 1, 1);
            return sprite;
          }

          strataInput.scenes.forEach(function (sc, si) {
            var words = sc.echo_words;
            if (!words || !words.length) return;
            // 스폰 확률 대폭 낮춤 — 씬당 ~22%만 echo 단어 표시
            if (Math.random() > 0.22) return;
            var emo = sc.original_emotion;
            if (!emo) return;
            if (typeof emo === 'string') { try { emo = JSON.parse(emo); } catch (_) { return; } }

            var sA = T._eA(emo);
            var sF = T._eF(emo);
            var H2 = 56;
            var sx = T._pX(sA) * H2;
            var sz = T._pZ(sF) * H2;
            var off = T._hashWorldOffset(strataInput.P[0] ? strataInput.P[0].id : '');
            sx += off.ox; sz += off.oz;
            var sh = terrainRuntime.gH(sx, sz);

            // Determine color from dominant emotion
            var EC = { fear:[0.4,0.28,0.7], sadness:[0.25,0.38,0.65], anger:[0.8,0.25,0.22], guilt:[0.6,0.48,0.35],
              longing:[0.28,0.62,0.65], numbness:[0.32,0.32,0.38], shame:[0.58,0.35,0.48], isolation:[0.14,0.14,0.24],
              joy:[0.82,0.72,0.38], resentment:[0.6,0.2,0.15], resignation:[0.4,0.38,0.35], hope:[0.55,0.65,0.45],
              relief:[0.48,0.68,0.48], love:[0.7,0.4,0.5], gratitude:[0.65,0.58,0.4], peace:[0.45,0.58,0.52],
              confusion:[0.48,0.38,0.55] };
            var domK = ''; var domV = 0;
            for (var ek in emo) { if (emo[ek] > domV) { domV = emo[ek]; domK = ek; } }
            var ec = EC[domK] || [0.76, 0.66, 0.51];
            var cssCol = 'rgba(' + Math.round(ec[0]*255) + ',' + Math.round(ec[1]*255) + ',' + Math.round(ec[2]*255) + ',0.7)';

            // 씬당 최대 1 단어만 표시 (이전 2)
            var count = 1;
            for (var wi = 0; wi < count; wi++) {
              var word = words[wi];
              if (!word) continue;
              var angle = (si * 2.39 + wi * 1.8);
              var radius = 2.5 + wi * 1.5;
              var wx = sx + Math.cos(angle) * radius;
              var wz = sz + Math.sin(angle) * radius;
              var wh = terrainRuntime.gH(wx, wz);

              var sprite = _makeTextSprite(word, cssCol, 0.6);
              sprite.position.set(wx, wh + 2.5 + wi * 1.2, wz);
              sprite.userData._floatingAnchor = {
                baseY: wh + 2.5 + wi * 1.2,
                phase: si * 1.3 + wi * 2.1,
                speed: 0.3 + Math.random() * 0.2,
                driftX: (Math.random() - 0.5) * 0.003,
                driftZ: (Math.random() - 0.5) * 0.003
              };
              // Attach scene data for proximity interaction
              sprite.userData._sceneData = {
                sceneId: sc.id,
                sceneOrder: sc.scene_order != null ? sc.scene_order : si,
                text: sc.text || '',
                originalEmotion: emo,
                originalDominant: domK,
                playDominant: '',
                playCount: 0,
                avgAlignment: 0,
                monologue: _strataLang() === 'ko' ? '…이 단어가 떠돈다.' : '…this word lingers.',
              };
              sprite.userData._isScenePin = true;
              scene3.add(sprite);
              _floatingAnchorSprites.push(sprite);
            }
          });
          console.log('[Strata] Added 3D floating anchors:', _floatingAnchorSprites.length);
        } catch (e) {
          console.warn('[Strata] Floating anchor error:', e.message);
        }
      }

      // Animate floating anchors in tick
      if (_floatingAnchorSprites.length > 0) {
        var _faAnimId = null;
        var _faTime = 0;
        function _faAnimate() {
          _faTime += 0.016;
          for (var i = 0; i < _floatingAnchorSprites.length; i++) {
            var s = _floatingAnchorSprites[i];
            var fa = s.userData._floatingAnchor;
            if (!fa) continue;
            s.position.y = fa.baseY + Math.sin(_faTime * fa.speed + fa.phase) * 0.8;
            s.position.x += fa.driftX;
            s.position.z += fa.driftZ;
            // Gentle opacity pulse
            if (s.material) s.material.opacity = 0.45 + Math.sin(_faTime * 0.5 + fa.phase) * 0.15;
          }
          _faAnimId = requestAnimationFrame(_faAnimate);
        }
        _faAnimate();
        // Store cleanup ref
        canvas._faAnimId = _faAnimId;
        canvas._faSprites = _floatingAnchorSprites;
      }

      // ─── Proximity system (admin: scene pins, play: floating anchors) ──
      var _allProximityTargets = _scenePinMeshes.concat(
        _floatingAnchorSprites.filter(function (s) { return s.userData._sceneData; })
      );
      console.log('[Strata] isAdmin:', isAdmin, 'proximityTargets:', _allProximityTargets.length);
      if (_allProximityTargets.length > 0) {
        _setupProximitySystem(_allProximityTargets, terrainRuntime, canvas);
        console.log('[Strata] Proximity system initialized with', _allProximityTargets.length, 'targets');
      }

      // ─── Hover tooltip for markers + scene pins ─────────────────
      var _allHoverTargets = _userMarkerMeshes.concat(_scenePinMeshes);
      if (_allHoverTargets.length > 0 && terrainRuntime && canvas) {
        var raycaster = new THREE.Raycaster();
        var mouse = new THREE.Vector2();
        var tooltip = document.getElementById('strataTooltip');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.id = 'strataTooltip';
          tooltip.style.cssText = 'position:fixed;pointer-events:none;background:rgba(10,10,15,0.92);color:#c4a882;font-size:12px;padding:6px 10px;border:1px solid rgba(196,168,130,0.3);border-radius:4px;display:none;z-index:9999;max-width:220px;line-height:1.5;';
          document.body.appendChild(tooltip);
        }
        var _hoveredMarker = null;

        var _onStrataMouseMove = function (e) {
          var rect = canvas.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, terrainRuntime.getCamera());
          var hits = raycaster.intersectObjects(_allHoverTargets);
          if (hits.length > 0) {
            var info = hits[0].object.userData._playInfo;
            if (info) {
              var lines = [];
              if (info.dominantValue != null) {
                lines.push(info.dominantEmotion + ' ' + ((info.dominantValue) * 100).toFixed(0) + '%');
              } else {
                lines.push('<b>' + info.dominantEmotion + '</b>');
              }
              if (info.alignment != null) lines.push('alignment ' + ((info.alignment) * 100).toFixed(0) + '%');
              if (info.mismatch) lines.push(info.mismatch);
              if (info.date) lines.push(info.date);
              tooltip.innerHTML = lines.join('<br>');
              tooltip.style.display = 'block';
              tooltip.style.left = (e.clientX + 12) + 'px';
              tooltip.style.top = (e.clientY - 10) + 'px';
              if (_hoveredMarker !== hits[0].object) {
                if (_hoveredMarker) _hoveredMarker.material.emissiveIntensity = _hoveredMarker.userData._baseEmissive || 0.4;
                _hoveredMarker = hits[0].object;
                _hoveredMarker.userData._baseEmissive = _hoveredMarker.material.emissiveIntensity;
                _hoveredMarker.material.emissiveIntensity = 1.0;
              }
            }
          } else {
            tooltip.style.display = 'none';
            if (_hoveredMarker) { _hoveredMarker.material.emissiveIntensity = _hoveredMarker.userData._baseEmissive || 0.4; _hoveredMarker = null; }
          }
        };
        canvas.addEventListener('mousemove', _onStrataMouseMove);
        canvas._strataMouseMove = _onStrataMouseMove;
      }

      var viewEl = document.getElementById('strataView');
      if (viewEl) viewEl.style.display = 'block';

      var closeBtn = document.getElementById('strataCloseBtn');
      // onclick 바인딩은 play-test.html에서 관리 (로그인 안내 플로우)
      // 다른 호스트에서 사용 시 폴백
      if (closeBtn && !closeBtn._strataExitBound) closeBtn.onclick = closeStrataView;
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

/**
 * TEM 오염 시스템 — Stage 3 코드 생성 + Admin 재생성 (Stage 1/2)
 * - Stage 3: Glitch, Redact, Dissolve (코드로 생성)
 * - Admin 재생성: contaminate-text Edge Function (Gemini Flash) 호출
 */
(function () {
  'use strict';

  // admin.js(module) 로드 전에 실행될 수 있으므로 fallback 사용 (상대 경로면 127.0.0.1으로 요청 가는 것 방지)
  var SUPABASE_URL_FALLBACK = 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
  var SUPABASE_ANON_KEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bXBwYXhwemJrd2ViZmJncHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMTcyMTEsImV4cCI6MjA4MDU5MzIxMX0.vv6Bmi2rZdx_HzLcxuw1wxfN_fvQYiigQz11KPNxH2M';

  function getSupabaseUrl() {
    var u = window.SUPABASE_URL || SUPABASE_URL_FALLBACK;
    return u.replace(/\/$/, '');
  }
  function getSupabaseAnonKey() {
    return window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_FALLBACK;
  }

  var STAGE3_CHARS_GLITCH = '\u2591\u2592\u2593\u2588\u25AA\u25AB'; // ░▒▓█▪▫
  var STAGE3_REDACT = '\u2588\u2588\u2588\u2588'; // ████

  /**
   * Stage 3 스타일: Glitch — 유니코드 블록 문자로 일부 대체
   */
  function applyStage3Glitch(text) {
    if (!text || typeof text !== 'string') return '';
    var out = '';
    for (var i = 0; i < text.length; i++) {
      if (text[i] === ' ') {
        out += ' ';
        continue;
      }
      if (Math.random() < 0.35) {
        out += STAGE3_CHARS_GLITCH[Math.floor(Math.random() * STAGE3_CHARS_GLITCH.length)];
      } else {
        out += text[i];
      }
    }
    return out;
  }

  /**
   * Stage 3 스타일: Redact — 단어/구를 ████ 로 소거
   */
  function applyStage3Redact(text) {
    if (!text || typeof text !== 'string') return '';
    var words = text.split(/(\s+)/);
    var out = '';
    for (var i = 0; i < words.length; i++) {
      if (/^\s+$/.test(words[i])) {
        out += words[i];
        continue;
      }
      if (Math.random() < 0.4) {
        out += STAGE3_REDACT;
      } else {
        out += words[i];
      }
    }
    return out;
  }

  /**
   * Stage 3 스타일: Dissolve — 글자가 공백으로 소멸
   */
  function applyStage3Dissolve(text) {
    if (!text || typeof text !== 'string') return '';
    var out = '';
    for (var i = 0; i < text.length; i++) {
      if (text[i] === ' ' || Math.random() < 0.55) {
        out += ' ';
      } else {
        out += text[i];
      }
    }
    return out;
  }

  var STAGE3_STYLES = {
    Glitch: applyStage3Glitch,
    Redact: applyStage3Redact,
    Dissolve: applyStage3Dissolve,
  };

  /**
   * Stage 3 텍스트 생성 (스타일 키: 'Glitch' | 'Redact' | 'Dissolve')
   */
  function applyStage3(text, styleKey) {
    var fn = STAGE3_STYLES[styleKey] || STAGE3_STYLES.Glitch;
    return fn(text);
  }

  /**
   * Admin: Stage 1 재생성 — contaminate-text Edge Function 호출
   */
  async function regenerateStage1(sceneIndex) {
    var baseEl = document.querySelector('.scene-text-input[data-scene-index="' + sceneIndex + '"]');
    var stage1El = document.querySelector('.scene-text-stage-1[data-scene-index="' + sceneIndex + '"]');
    var direction = (document.querySelector('.contamination-direction[data-scene-index="' + sceneIndex + '"]') || {}).value || 'default';
    if (!baseEl || !stage1El) {
      console.warn('[contamination] Stage 1 요소를 찾을 수 없음:', sceneIndex);
      return;
    }
    var text = (baseEl.value || '').trim();
    if (!text) {
      alert('본문을 먼저 입력해주세요.');
      return;
    }
    stage1El.disabled = true;
    stage1El.placeholder = '생성 중...';
    try {
      var url = getSupabaseUrl() + '/functions/v1/contaminate-text';
      var res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getSupabaseAnonKey(),
          'apikey': getSupabaseAnonKey(),
        },
        body: JSON.stringify({ text: text, stage: 1, direction: direction }),
      });
      var raw = await res.text();
      var data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (parseErr) {
        console.error('[contamination] Stage1 응답 파싱 실패', raw);
        alert('응답 오류 (HTTP ' + res.status + '): ' + (raw ? raw.substring(0, 200) : '빈 응답'));
        return;
      }
      if (res.ok && data.text_stage_1 != null) {
        stage1El.value = data.text_stage_1;
        stage1El.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        var errMsg = data.error || data.details || data.message || ('HTTP ' + res.status);
        console.error('[contamination] Stage1 실패', res.status, data);
        alert('Stage 1 생성 실패: ' + errMsg);
      }
    } catch (e) {
      console.error('[contamination] regenerateStage1', e);
      alert('오류: ' + (e.message || '네트워크 오류'));
    } finally {
      stage1El.disabled = false;
      stage1El.placeholder = '감정이 객체화되기 시작...';
    }
  }

  /**
   * Admin: Stage 2 재생성
   */
  async function regenerateStage2(sceneIndex) {
    var baseEl = document.querySelector('.scene-text-input[data-scene-index="' + sceneIndex + '"]');
    var stage2El = document.querySelector('.scene-text-stage-2[data-scene-index="' + sceneIndex + '"]');
    var direction = (document.querySelector('.contamination-direction[data-scene-index="' + sceneIndex + '"]') || {}).value || 'default';
    if (!baseEl || !stage2El) {
      console.warn('[contamination] Stage 2 요소를 찾을 수 없음:', sceneIndex);
      return;
    }
    var text = (baseEl.value || '').trim();
    if (!text) {
      alert('본문을 먼저 입력해주세요.');
      return;
    }
    stage2El.disabled = true;
    stage2El.placeholder = '생성 중...';
    try {
      var url = getSupabaseUrl() + '/functions/v1/contaminate-text';
      var res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getSupabaseAnonKey(),
          'apikey': getSupabaseAnonKey(),
        },
        body: JSON.stringify({ text: text, stage: 2, direction: direction }),
      });
      var raw = await res.text();
      var data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (parseErr) {
        console.error('[contamination] Stage2 응답 파싱 실패', raw);
        alert('응답 오류 (HTTP ' + res.status + '): ' + (raw ? raw.substring(0, 200) : '빈 응답'));
        return;
      }
      if (res.ok && data.text_stage_2 != null) {
        stage2El.value = data.text_stage_2;
        stage2El.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        var errMsg = data.error || data.details || data.message || ('HTTP ' + res.status);
        console.error('[contamination] Stage2 실패', res.status, data);
        alert('Stage 2 생성 실패: ' + errMsg);
      }
    } catch (e) {
      console.error('[contamination] regenerateStage2', e);
      alert('오류: ' + (e.message || '네트워크 오류'));
    } finally {
      stage2El.disabled = false;
      stage2El.placeholder = '디테일이 사라지고 추상화...';
    }
  }

  /**
   * Admin: Stage 3 생성 (코드 스타일 적용)
   */
  function generateStage3(sceneIndex) {
    var baseEl = document.querySelector('.scene-text-input[data-scene-index="' + sceneIndex + '"]');
    var stage3El = document.querySelector('.scene-text-stage-3[data-scene-index="' + sceneIndex + '"]');
    var styleSelect = document.querySelector('.stage3-style-select[data-scene-index="' + sceneIndex + '"]');
    if (!baseEl || !stage3El) return;
    var text = (baseEl.value || '').trim();
    var styleKey = (styleSelect && styleSelect.value) ? styleSelect.value : 'Glitch';
    if (!text) {
      alert('본문을 먼저 입력해주세요.');
      return;
    }
    stage3El.value = applyStage3(text, styleKey);
    stage3El.dispatchEvent(new Event('input', { bubbles: true }));
  }

  window.TEM_Contamination = {
    applyStage3: applyStage3,
    STAGE3_STYLES: Object.keys(STAGE3_STYLES),
    regenerateStage1: regenerateStage1,
    regenerateStage2: regenerateStage2,
    generateStage3: generateStage3,
  };
  window.regenerateStage1 = regenerateStage1;
  window.regenerateStage2 = regenerateStage2;
  window.generateStage3 = generateStage3;
})();

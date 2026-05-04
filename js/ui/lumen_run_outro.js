/**
 * Lumen Run Outro — V2.1 회차 끝 미니멀 엔딩 (drift / speciation / none).
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260429.md §15-3 — speciation 귀환 후 텍스트 알림 한 줄.
 *        2026-05-04 결정 (드리프트/none 도 한 줄씩 추가, GPT 안 출처. 본인 손 거치기).
 *
 * 호출 시점: play-test.html 1인칭 종료 직전 (sealBtn V1 흐름 우회).
 * 의존:
 *   - sessionStorage.tem_branch_kind ('drift' | 'speciation' | 'none') — opening.js V2.1 멀티턴이 박음
 *   - sessionStorage.tem_lang ('ko' | 'en')
 *   - window.TemAfStrataTerrain._lastRuntime.__lumenRewind (있으면 forceStart)
 *
 * 동작:
 *   1. (옵션) rewind forceStart → rewindEnd 대기 (FP 활성 상태에서 호출 필수)
 *   2. beforeText hook — 호출자가 exitFirstPerson + UI 정리
 *   3. 텍스트 오버레이 페이드인 + dwell + 페이드아웃
 *   4. onComplete — 호출자가 다음 화면 (오프닝 복귀 등) 처리
 *
 * 사용:
 *   LumenRunOutro.run({
 *     rewind: true,
 *     beforeText: () => { rt.exitFirstPerson(); hideUI(); },
 *     onComplete: () => { window.location.href = 'index.html'; }
 *   });
 */
(function (global) {
  'use strict';

  // 문장 템플릿 — V2.1 데모 직전 본인 손 거치기. SCOPE §15-3 + GPT 안 (2026-05-04).
  var OUTRO_TEXT = {
    drift: {
      ko: '당신의 해석은 이 기억의 표면에 얇은 흔들림으로 남았다.',
      en: 'Your reading left a thin tremor on the surface of this memory.'
    },
    speciation: {
      ko: '당신이 만든 새 유령이 이 메모리에 머물고 있다.',
      en: 'A new ghost you have made now lingers in this memory.'
    },
    none: {
      ko: '기억은 거의 변하지 않은 채 당신을 통과시켰다.',
      en: 'The memory let you pass through, nearly unchanged.'
    }
  };

  var DEFAULTS = {
    rewind: true,
    rewindTimeoutMs: 12000,
    fadeInMs: 1200,
    textDwellMs: 6000,
    fadeOutMs: 1500,
    beforeText: null,
    onComplete: null
  };

  function _getLang() {
    try {
      var l = sessionStorage.getItem('tem_lang');
      if (l === 'ko' || l === 'en') return l;
    } catch (_) {}
    return /^en/i.test((typeof navigator !== 'undefined' && navigator.language) || '') ? 'en' : 'ko';
  }

  function _getBranchKind() {
    try {
      var k = sessionStorage.getItem('tem_branch_kind');
      if (k === 'drift' || k === 'speciation' || k === 'none') return k;
    } catch (_) {}
    return null;
  }

  function _wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function _showTextOverlay(text, opts) {
    var overlay = document.createElement('div');
    overlay.id = 'lumenOutroText';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:3500',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:radial-gradient(ellipse at center, rgba(8,8,10,0.85) 0%, rgba(0,0,0,0.95) 70%)',
      'opacity:0', 'transition:opacity ' + opts.fadeInMs + 'ms ease',
      'pointer-events:none'
    ].join(';');
    var p = document.createElement('p');
    p.textContent = text;
    p.style.cssText = [
      'margin:0', 'padding:0 32px',
      'font-family:"Cormorant Garamond",serif',
      'font-size:22px', 'line-height:1.6',
      'color:rgba(196,168,130,0.92)',
      'letter-spacing:0.6px', 'text-align:center',
      'max-width:680px', 'text-shadow:0 0 18px rgba(0,0,0,0.6)'
    ].join(';');
    overlay.appendChild(p);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.style.opacity = '1'; });
    return overlay;
  }

  function _fadeOutAndRemove(el, ms) {
    return new Promise(function (resolve) {
      el.style.transition = 'opacity ' + ms + 'ms ease';
      el.style.opacity = '0';
      setTimeout(function () {
        try { el.parentNode && el.parentNode.removeChild(el); } catch (_) {}
        resolve();
      }, ms + 50);
    });
  }

  function _tryRewind(runtime, timeoutMs) {
    return new Promise(function (resolve) {
      if (!runtime) return resolve(false);
      var rw = runtime.__lumenRewind;
      if (!rw || typeof rw.forceStart !== 'function') return resolve(false);

      var done = false;
      var off = rw.on('rewindEnd', function () {
        if (done) return;
        done = true;
        try { off && off(); } catch (_) {}
        resolve(true);
      });
      var started = rw.forceStart();
      if (!started) {
        if (!done) {
          done = true;
          try { off && off(); } catch (_) {}
          resolve(false);
        }
        return;
      }
      // Safety timeout — rewindEnd 못 받아도 강제 진행
      setTimeout(function () {
        if (!done) {
          done = true;
          try { off && off(); } catch (_) {}
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  async function runLumenOutro(opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var kind = _getBranchKind();
    if (!kind) {
      console.warn('[lumen-outro] tem_branch_kind not found — V2.1 mode 미감지, skip');
      if (typeof opts.onComplete === 'function') {
        opts.onComplete({ skipped: true, reason: 'no_branch_kind' });
      }
      return { ok: false, reason: 'no_branch_kind' };
    }
    var lang = _getLang();
    var text = (OUTRO_TEXT[kind] && OUTRO_TEXT[kind][lang]) || OUTRO_TEXT[kind].en;
    console.log('[lumen-outro] start', { kind: kind, lang: lang });

    var runtime = (global.TemAfStrataTerrain && global.TemAfStrataTerrain._lastRuntime) || null;

    // 1) rewind (FP 활성 상태에서 호출)
    if (opts.rewind) {
      try { await _tryRewind(runtime, opts.rewindTimeoutMs); }
      catch (e) { console.warn('[lumen-outro] rewind error:', e); }
    }

    // 2) beforeText hook — 호출자가 exitFP + UI 정리
    if (typeof opts.beforeText === 'function') {
      try { await opts.beforeText(); } catch (e) { console.warn('[lumen-outro] beforeText error:', e); }
    }

    // 3) 텍스트 오버레이
    var overlay = _showTextOverlay(text, opts);
    await _wait(opts.fadeInMs + opts.textDwellMs);
    await _fadeOutAndRemove(overlay, opts.fadeOutMs);

    console.log('[lumen-outro] complete', { kind: kind });
    if (typeof opts.onComplete === 'function') {
      opts.onComplete({ skipped: false, kind: kind });
    }
    return { ok: true, kind: kind };
  }

  global.LumenRunOutro = { run: runLumenOutro, OUTRO_TEXT: OUTRO_TEXT };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LumenRunOutro;
  }
})(typeof window !== 'undefined' ? window : this);

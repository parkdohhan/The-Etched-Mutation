// js/ui/afterimage.js
// Afterimage (잔상) UI component.
// See docs/잔상_시스템_설계-260409.md §7
//
// One utterance rises into the viewer's field of view after a scene closes.
// On click: a single line whispers "…네가 한 말이야." (only the first 1-2 times).
// Otherwise it fades out on its own after ~10s.

import { matchAfterimage, logAfterimageShow, markAfterimageReaction } from '../lib/afterimage.js';

const STYLE_ID = 'afterimage-styles';
const REVEAL_COUNT_KEY = 'tem_afterimage_reveal_count';
const MAX_REVEAL_HINTS = 2; // show the "네가 한 말이야" line for the first N afterimages only

const REVEAL_LINES_KO = [
  '…네가 한 말이야.',
  '기억 안 나? 네가 쓴 문장이야.',
  '…너였잖아.',
];
const REVEAL_LINES_EN = [
  '…you said this.',
  'don\'t remember? you wrote it.',
  '…it was you.',
];

function _ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
.afterimage-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 9000;
  opacity: 0;
  transition: opacity 1.6s ease;
}
.afterimage-overlay.visible { opacity: 1; }

.afterimage-text {
  pointer-events: auto;
  cursor: default;
  max-width: min(560px, 84vw);
  text-align: center;
  font-family: 'Nanum Myeongjo', 'IBM Plex Serif', Georgia, serif;
  font-weight: 300;
  font-size: clamp(20px, 2.4vw, 30px);
  line-height: 1.55;
  color: rgba(245, 240, 232, 0.92);
  letter-spacing: 0.01em;
  text-shadow: 0 0 24px rgba(0, 0, 0, 0.6);
  transform: translateY(24px);
  transition: transform 2.2s cubic-bezier(0.2, 0.6, 0.1, 1), opacity 1.6s ease, color 0.8s ease;
  opacity: 0;
}
.afterimage-overlay.visible .afterimage-text {
  transform: translateY(0);
  opacity: 1;
}
.afterimage-text:hover {
  color: rgba(255, 252, 245, 1);
}

.afterimage-reveal {
  position: absolute;
  bottom: 22%;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Nanum Myeongjo', 'IBM Plex Serif', Georgia, serif;
  font-size: clamp(13px, 1.2vw, 16px);
  font-style: italic;
  color: rgba(220, 210, 190, 0.55);
  letter-spacing: 0.04em;
  opacity: 0;
  transition: opacity 1.4s ease 0.2s;
  pointer-events: none;
  white-space: nowrap;
}
.afterimage-reveal.visible { opacity: 1; }
`;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

function _typewriter(el, text, msPerChar = 90) {
  return new Promise((resolve) => {
    el.textContent = '';
    let i = 0;
    const chars = [...text];
    const tick = () => {
      if (i >= chars.length) return resolve();
      el.textContent += chars[i];
      i += 1;
      setTimeout(tick, msPerChar);
    };
    tick();
  });
}

function _getRevealCount() {
  try { return parseInt(localStorage.getItem(REVEAL_COUNT_KEY) || '0', 10) || 0; }
  catch { return 0; }
}
function _bumpRevealCount() {
  try { localStorage.setItem(REVEAL_COUNT_KEY, String(_getRevealCount() + 1)); }
  catch {}
}

/**
 * Show one afterimage. Resolves when it's gone.
 * No-op if matching returns nothing.
 *
 * @param {Object} ctx     same shape as matchAfterimage ctx
 * @param {Object} [opts]
 * @param {string} [opts.playId]
 * @param {string} [opts.sceneId]
 * @param {number} [opts.dwellMs]   time before auto-fade. default 10000
 */
export async function showAfterimage(ctx = {}, opts = {}) {
  // 50% chance gate (§6.3)
  if (Math.random() > 0.5) {
    return { shown: false, reason: 'rng_skip' };
  }

  const candidate = await matchAfterimage(ctx);
  if (!candidate) {
    return { shown: false, reason: 'no_candidate' };
  }

  _ensureStyles();

  const lang = ctx.lang || 'ko';
  const dwellMs = opts.dwellMs ?? 10000;

  // Mount overlay
  const overlay = document.createElement('div');
  overlay.className = 'afterimage-overlay';
  const textEl = document.createElement('div');
  textEl.className = 'afterimage-text';
  const revealEl = document.createElement('div');
  revealEl.className = 'afterimage-reveal';
  overlay.appendChild(textEl);
  overlay.appendChild(revealEl);
  document.body.appendChild(overlay);

  // Log show event
  const eventId = await logAfterimageShow({
    utteranceId: candidate.id,
    playId: opts.playId || null,
    sceneId: opts.sceneId || null,
  });

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('visible'));
  await _typewriter(textEl, candidate.text, 95);

  // State
  let dismissed = false;
  let reactionKind = null;
  const revealHintAllowed = _getRevealCount() < MAX_REVEAL_HINTS;

  const cleanup = (kind) => {
    if (dismissed) return;
    dismissed = true;
    reactionKind = reactionKind || kind || 'dismiss';
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 1700);
    if (eventId) markAfterimageReaction(eventId, reactionKind);
  };

  textEl.addEventListener('click', () => {
    if (dismissed) return;
    reactionKind = 'click';
    if (revealHintAllowed) {
      const lines = lang === 'en' ? REVEAL_LINES_EN : REVEAL_LINES_KO;
      revealEl.textContent = lines[Math.floor(Math.random() * lines.length)];
      revealEl.classList.add('visible');
      _bumpRevealCount();
      // give the reveal a moment, then fade
      setTimeout(() => cleanup('click'), 4200);
    } else {
      // silent dismiss after click — no hint, no explanation
      setTimeout(() => cleanup('click'), 800);
    }
  }, { once: true });

  textEl.addEventListener('mouseenter', () => {
    if (!reactionKind) reactionKind = 'hover';
  }, { once: true });

  // auto-fade
  setTimeout(() => cleanup(reactionKind || 'dismiss'), dwellMs);

  return { shown: true, id: candidate.id };
}

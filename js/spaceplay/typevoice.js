/**
 * Space-play type voice (2026-11-24) — a small, low tap for each letter of a text as it is typed.
 * No sample: a short burst of filtered noise with a soft body under it, a little different each time
 * (pitch and loudness wander), quieter for punctuation, nothing for spaces. Slow and soft, never a clatter:
 * taps closer than MIN_GAP are let go.
 *
 * Hooked into roomplay/room.js typeText through setTypeVoice(); only texts typed with { voice: true } sound.
 * The space stage registers it (main.js); the room stage does not, so nothing changes there.
 */
const GAIN = 0.11, MIN_GAP = 0.034;          // loudness at volume 1 (a footstep is 0.30~0.36); taps closer than this (seconds) are dropped

export function createTypeVoice() {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, noise = null, master = 1, last = 0;
  const ensure = () => {
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch (_) { return null; } }
    if (ctx.state === 'suspended' && !document.hidden) { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    if (!noise) {
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  };
  // a browser gives no sound before a touch: the first one wakes it
  const wake = () => { ensure(); window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); };
  window.addEventListener('pointerdown', wake); window.addEventListener('keydown', wake);
  document.addEventListener('visibilitychange', () => { if (!ctx) return; const p = document.hidden ? ctx.suspend() : ctx.resume(); if (p && p.catch) p.catch(() => {}); });

  function tap(ch) {
    if (!ch || /\s/.test(ch) || master <= 0) return;
    const c = ensure(); if (!c || c.state !== 'running') return;
    const now = c.currentTime; if (now - last < MIN_GAP) return; last = now;
    const soft = /[.,?!…·—\-'"「」()]/.test(ch) ? 0.45 : 1, g0 = GAIN * master * soft * (0.75 + Math.random() * 0.4);
    // the click: noise through a band, gone in ~40 ms
    const src = c.createBufferSource(); src.buffer = noise; src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500 + Math.random() * 700; bp.Q.value = 1.1;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(g0, now + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    src.connect(bp).connect(g).connect(c.destination); src.start(now); src.stop(now + 0.06);
    // the body: a low, short knock under it
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(150 + Math.random() * 40, now); o.frequency.exponentialRampToValueAtTime(90, now + 0.05);
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, now); og.gain.linearRampToValueAtTime(g0 * 0.7, now + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    o.connect(og).connect(c.destination); o.start(now); o.stop(now + 0.07);
  }
  return {
    tap,
    /** The pause sheet's volume (0..1). */
    setVolume(v) { master = Math.max(0, Math.min(1, Number(v))); if (isNaN(master)) master = 1; },
  };
}

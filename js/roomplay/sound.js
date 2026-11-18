/**
 * Room-play sound — each room plays its scene sound (scenes.meta.sound_url) as a slow loop.
 * In the corridor the room behind fades out and the room ahead fades in with the walker's
 * progress. Two channels, eased volumes (no hard cuts).
 */
export function createSound() {
  const ch = [mk(), mk()];
  let cur = 0, raf = 0, last = performance.now(), master = 1;
  function mk() { const el = new Audio(); el.loop = true; el.preload = 'auto'; el.volume = 0; return { el, url: null, target: 0, level: 0, base: 0.5 }; }
  function load(c, url, base) {
    c.base = base == null ? 0.5 : base;
    if (c.url === url) return;
    c.url = url; c.level = 0; c.el.volume = 0;
    if (!url) { c.el.pause(); c.el.removeAttribute('src'); return; }
    c.el.src = url;
    const p = c.el.play(); if (p && p.catch) p.catch(() => { /* needs a gesture; retried on unlock() */ });
  }
  function tick() {
    raf = requestAnimationFrame(tick);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    const k = 1 - Math.exp(-dt / 1.3);
    for (const c of ch) {
      c.level += (c.target - c.level) * k;
      const v = Math.max(0, Math.min(1, c.level * c.base * master));
      if (Math.abs(c.el.volume - v) > 0.002) c.el.volume = v;
      if (c.level < 0.004 && c.target === 0 && c.url && !c.el.paused && c !== ch[cur]) c.el.pause();
    }
  }
  tick();
  return {
    /** Call from a user gesture once so playback is allowed. */
    unlock() { for (const c of ch) if (c.url && c.el.paused) { const p = c.el.play(); if (p && p.catch) p.catch(() => {}); } },
    /** The room's sound, fading in (the other channel fades out). */
    room(url, base) { const o = ch[1 - cur]; o.target = 0; load(ch[cur], url, base); ch[cur].target = url ? 1 : 0; },
    /** Get the next room's sound ready, silent. */
    prepare(url, base) { const n = ch[1 - cur]; load(n, url, base); n.target = 0; if (url && n.el.paused) { const p = n.el.play(); if (p && p.catch) p.catch(() => {}); } },
    /** Corridor progress 0..1: behind fades out, ahead fades in. Both a little lower than in a room. */
    mix(t) { ch[cur].target = (1 - t) * 0.8; ch[1 - cur].target = t * 0.8; },
    /** Arrived: the prepared channel becomes the room. */
    arrive() { ch[cur].target = 0; cur = 1 - cur; ch[cur].target = ch[cur].url ? 1 : 0; },
    fadeOut() { for (const c of ch) c.target = 0; },
    setMaster(v) { master = v; },
    state() { return ch.map((c) => ({ url: c.url ? c.url.split('/').pop() : null, target: +c.target.toFixed(2), level: +c.level.toFixed(2), paused: c.el.paused })); },
  };
}

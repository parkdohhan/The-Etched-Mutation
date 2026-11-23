/**
 * Space-blank — paper (2026-11-23, the second form of the experiment; the first, word holes, is blank.js, retired).
 * Decision record: docs/우주무대_빈칸_실험-261123.md §C
 *
 * The text stands on a black scroll. Back at a scene, where a line is not the one the walker read there, the black
 * paper over that line has lifted at its end and hangs (the author's torn strip, swaying slowly). Pressed, the black
 * strip comes off the line — and goes into the walker's hand, the line's words still on it — and under it a band of
 * yellow parchment is bare. The walker writes on the parchment (author's choice (나), 261123: typing, the ink taking
 * as the letters are typed). Enter seals it. A strip in hand can be laid over any line of any other scene: that line
 * is covered, and the strip's sentence stands there instead.
 *
 * Everything here is staging and bookkeeping. Nothing measures or judges. What was written and what was moved is kept
 * per (scene, original line) so a later reading of the scene — this walk's, or a later walker's — shows it.
 */
import { typeText } from '../roomplay/room.js';

const h01 = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
export const normLine = (l) => String(l == null ? '' : l).replace(/[\s.!?…"“”'’]+$/g, '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the edits: what stands in place of a line ───────────────────────────────
/**
 * An edit: { scene (id), key (normLine of the line as the manuscript has it), kind: 'typed' | 'pasted', text,
 *            owner: 'mine' | 'other', from (scene id the pasted sentence came from, or null), inherited?: true, run?: id }
 * kind 'typed' with text '' = the line was torn out and nothing was written: the parchment stays bare.
 */
export function createEdits(initial) {
  const m = new Map();                                                 // scene id → Map(key → edit)
  const put = (e) => { if (!m.has(e.scene)) m.set(e.scene, new Map()); m.get(e.scene).set(e.key, e); };
  (initial || []).forEach(put);
  const words = (l) => new Set(normLine(l).split(' ').filter(Boolean));
  const overlap = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.min(A.size, B.size)); };
  return {
    get(sceneId, line) { const s = m.get(sceneId); return (s && s.get(normLine(line))) || null; },
    /**
     * The edits that stand on these lines, one per line (or null). A line is matched by its exact text first; an edit whose
     * line is not among them (the scene's later layer rewrote the sentence) goes to the unmatched line that shares most of
     * its words, if more than half — so what was written on a line stays on that line when the layer changes under it.
     */
    match(sceneId, lines) {
      const s = m.get(sceneId), out = lines.map(() => null); if (!s) return out;
      const left = new Set(s.values());
      lines.forEach((l, i) => { const e = s.get(normLine(l)); if (e) { out[i] = e; left.delete(e); } });
      for (const e of left) {
        let best = -1, bs = 0.5;
        lines.forEach((l, i) => { if (out[i]) return; const o = overlap(e.key, l); if (o > bs) { bs = o; best = i; } });
        if (best >= 0) out[best] = e;
      }
      return out;
    },
    set(e) { put(e); return e; },
    own() { const out = []; for (const s of m.values()) for (const e of s.values()) if (!e.inherited) out.push(e); return out; },
    all() { const out = []; for (const s of m.values()) for (const e of s.values()) out.push(e); return out; },
  };
}
export const KEEP = 2 / 3;   // of each earlier run's own edits, this share reaches the next walker (free parameter — author 261123 "three changed → two arrive")
/**
 * What earlier walkers wrote and moved, as the next walker reads it: ceil(n·KEEP) of each run's own edits, by a fixed
 * lottery on the run id; the latest run wins a line. Returns edits with owner 'other'.
 * @param journals [{ run_id, edits: [{ scene (id), line, kind, text, from (id|null) }] }] oldest first
 */
export function inheritEdits(journals) {
  const out = new Map();
  for (const j of journals || []) {
    const own = (j.edits || []).filter((e) => e && e.scene && typeof e.line === 'string');
    const n = Math.ceil(own.length * KEEP);
    const kept = own.map((e, i) => ({ e, h: h01(j.run_id + ':' + i) })).sort((a, b) => a.h - b.h).slice(0, n).map((x) => x.e);
    for (const e of kept) out.set(e.scene + '|' + e.line, { scene: e.scene, key: e.line, kind: e.kind === 'pasted' ? 'pasted' : 'typed', text: String(e.text || ''), owner: 'other', from: e.from || null, inherited: true, run: j.run_id });
  }
  return Array.from(out.values());
}

// ── a line on the scroll ────────────────────────────────────────────────────
/** The line's text holder (<p class="rp-line"><span>…</span></p>, the room stage's). */
const holderOf = (p) => p.querySelector(':scope > span') || p.firstElementChild;

/** A line that stands as an edit already (this walk's, or an earlier walker's): shown as parchment with ink, or as a laid strip. */
export function dressEdit(p, edit) {
  const s = holderOf(p); if (!s) return;
  p.classList.add(edit.kind === 'pasted' ? 'sb-pasted' : 'sb-typed', 'sb-dressed', edit.owner === 'mine' ? 'sb-mine' : 'sb-other');
  if (edit.kind === 'typed' && !edit.text) { p.classList.add('sb-bare'); s.textContent = ' '; }
}

/**
 * The black paper over this line has lifted: a torn end hangs off it and sways. Pressing it tears the strip off.
 * @returns the tab element
 */
export function hangTab(p, o) {
  if (p.querySelector('.sb-tab')) return null;
  p.classList.add('sb-loose');
  const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'sb-tab'; tab.setAttribute('aria-label', (o && o.ko === false) ? 'tear the paper off this line' : '이 줄의 종이를 떼어낸다');
  tab.style.setProperty('--sway', (6.5 + h01(p.textContent) * 3).toFixed(2) + 's');
  tab.style.setProperty('--ph', (-h01(p.textContent + 'p') * 6).toFixed(2) + 's');
  p.appendChild(tab);
  const tear = (e) => { e.preventDefault(); e.stopPropagation(); if (p.classList.contains('sb-torn')) return; if (o && o.onTear) o.onTear(p); };
  tab.addEventListener('click', tear);
  p.addEventListener('click', (e) => { if (p.classList.contains('sb-loose') && !p.classList.contains('sb-torn')) tear(e); });
  return tab;
}

/**
 * The strip comes off the line (it goes toward `toward`, a screen point — the hand), and the parchment under it is bare,
 * with the writer's caret on it. Resolves when the writing is sealed (Enter) → the text; or '' if the stay closes first.
 * @param o { ko, guard(text) → { ok, help }, sendable(text) → bool, onRefused(kind), onSeal(text) }
 * @returns { sealed: Promise<string>, seal(), band }
 */
export function tearLine(p, o) {
  const ko = !(o && o.ko === false);
  const s = holderOf(p), tab = p.querySelector('.sb-tab'); if (tab) tab.remove();
  p.classList.remove('sb-loose'); p.classList.add('sb-torn');
  // the black strip, carrying the line's words, slides off
  const strip = document.createElement('span'); strip.className = 'sb-off'; strip.textContent = s.textContent;
  const r = s.getBoundingClientRect(), pr = p.getBoundingClientRect();
  strip.style.left = (r.left - pr.left) + 'px'; strip.style.top = (r.top - pr.top) + 'px'; strip.style.width = Math.max(40, r.width) + 'px';
  p.appendChild(strip);
  requestAnimationFrame(() => requestAnimationFrame(() => strip.classList.add('go')));
  setTimeout(() => strip.remove(), 1900);
  // the parchment, bare
  s.textContent = ''; p.classList.add('sb-parch');
  const band = document.createElement('span'); band.className = 'sb-band';
  const ink = document.createElement('input'); ink.type = 'text'; ink.className = 'sb-ink'; ink.maxLength = 90; ink.autocomplete = 'off'; ink.spellcheck = false;
  ink.setAttribute('aria-label', ko ? '양피지에 쓰기' : 'write on the parchment'); ink.placeholder = '';
  band.appendChild(ink); s.appendChild(band);
  let done = false, resolve;
  const sealed = new Promise((res) => { resolve = res; });
  const finish = (text) => {
    if (done) return; done = true;
    ink.remove();
    const written = document.createElement('span'); written.className = 'sb-written'; written.textContent = text || ' '; band.appendChild(written);
    p.classList.add('sb-typed', 'sb-mine'); if (!text) p.classList.add('sb-bare');
    if (o && o.onSeal) o.onSeal(text);
    resolve(text);
  };
  const refuse = async (kind) => {
    ink.classList.add('sb-refused');
    if (o && o.onRefused) o.onRefused(kind);
    await sleep(900);
    for (let n = ink.value.length; n > 0; n--) { ink.value = ink.value.slice(0, -1); await sleep(28); }   // the ink does not take: the letters go
    ink.classList.remove('sb-refused'); ink.focus();
  };
  ink.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const text = ink.value.trim(); if (!text) return;
    const g = o && o.guard ? o.guard(text) : { ok: true };
    if (!g.ok) return refuse(g.help ? 'help' : 'crisis');
    if (o && o.sendable && !o.sendable(text)) return refuse('unsendable');
    finish(text);
  });
  setTimeout(() => { if (!done && !('ontouchstart' in window)) ink.focus(); }, 1700);
  return { sealed, seal: () => finish(''), band, ink, isDone: () => done };
}

/** A strip in hand is laid over this line: the line's words are covered, the strip's sentence stands there. */
export async function layStrip(p, strip) {
  const s = holderOf(p); if (!s) return;
  p.classList.remove('sb-target');
  p.classList.add('sb-laying');
  await sleep(1300);
  s.textContent = strip.text; p.classList.remove('sb-laying'); p.classList.add('sb-pasted', 'sb-mine');
  await sleep(300);
}

// ── the strips in hand ──────────────────────────────────────────────────────
/**
 * The torn strips the walker carries — each a piece of black paper with the line's words on it, one under another,
 * the oldest on top and laid down first. They keep beside the cursor (under the aim point while the walker looks
 * round). Slow, wide, heavy.
 * @param o { locked: () => boolean }
 */
export function createStrips(o) {
  const wrap = document.createElement('div'); wrap.id = 'sbStrips'; wrap.setAttribute('aria-hidden', 'true'); document.body.appendChild(wrap);
  const held = [];                                                    // [{ info, el }] oldest first
  let x = innerWidth / 2, y = innerHeight / 2, mx = null, my = null, last = performance.now(), t = 0;
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  (function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now; t += dt;
    if (!held.length && !wrap.classList.contains('on')) return;
    const free = !(o && o.locked && o.locked()) && mx != null && !('ontouchstart' in window && matchMedia('(pointer: coarse)').matches);
    const tx = free ? mx + 26 : innerWidth / 2 + 30, ty = free ? my + 30 : innerHeight / 2 + 40;
    const k = 1 - Math.exp(-dt / 0.46);
    x += (tx - x) * k; y += (ty - y) * k;
    wrap.style.transform = 'translate3d(' + (x + 3 * Math.sin(t * 0.8)).toFixed(1) + 'px,' + (y + 2.4 * Math.sin(t * 0.57 + 1.3)).toFixed(1) + 'px,0) rotate(' + (1.6 * Math.sin(t * 0.31)).toFixed(2) + 'deg)';
  })(performance.now());
  return {
    el: wrap,
    held: () => (held.length ? held[0].info : null),
    count: () => held.length,
    /** @param info { from, order, text }  @param from a rect it comes from (the line it was torn off) */
    give(info, from) {
      const el = document.createElement('div'); el.className = 'sb-strip';
      el.style.setProperty('--tilt', ((h01(info.text + held.length) - 0.5) * 7).toFixed(1) + 'deg');
      const tx = document.createElement('span'); tx.textContent = info.text; el.appendChild(tx);
      wrap.appendChild(el); held.push({ info, el });
      if (from && held.length === 1) { x = from.left; y = from.top; wrap.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'; }
      wrap.classList.add('on'); document.body.classList.add('sb-carrying');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    },
    /** The oldest strip is laid down. Returns what it carried. */
    take() {
      const h = held.shift(); if (!h) return null;
      h.el.classList.add('out'); setTimeout(() => h.el.remove(), 1400);
      if (!held.length) { document.body.classList.remove('sb-carrying'); setTimeout(() => { if (!held.length) wrap.classList.remove('on'); }, 900); }
      return h.info;
    },
    /** The walk ends: every strip goes. */
    drop() {
      const all = held.splice(0); document.body.classList.remove('sb-carrying');
      for (const h of all) { h.el.classList.add('out'); setTimeout(() => h.el.remove(), 1400); }
      setTimeout(() => wrap.classList.remove('on'), 900);
    },
  };
}

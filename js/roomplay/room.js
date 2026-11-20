/**
 * Room-play text room — a black screen, one column of text from top to bottom, empty sides
 * where words, earlier walkers' lines and doors drift.
 *
 * Motion rule (260809): slow, wide, heavy. Floaters follow long sine paths inside their band and
 * never bounce off an edge.
 */

// ── text helpers ────────────────────────────────────────────────────────────
export function sentences(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const m = t.match(/[^.!?…]+[.!?…]+["”’']?|[^.!?…]+$/g);
  return (m || [t]).map((s) => s.trim()).filter(Boolean);
}
/** Drop the last sentence and leave the one before it hanging on "…" (the way the authored stems end). */
export function cutLast(text) {
  const s = sentences(text);
  if (s.length <= 1) return s.map(hang);
  const kept = s.slice(0, -1);
  kept[kept.length - 1] = hang(kept[kept.length - 1]);
  return kept;
}
export function hang(sentence) { return String(sentence).replace(/[.!?…\s]+["”’']?$/, '') + '…'; }
export function closed(sentence) { const t = String(sentence).trim(); return /[.!?…]["”’']?$/.test(t) ? t : t + '.'; }
/** Korean subject particle by final consonant: 열쇠가 / 자연퐁이. Non-Hangul endings take 이(가). */
export function subjectParticle(word) {
  const ch = String(word).trim().slice(-1), code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '이(가)';
  return (code - 0xac00) % 28 === 0 ? '가' : '이';
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── floaters ────────────────────────────────────────────────────────────────
export function createFloaters(layer, columnEl, seed) {
  const items = [];
  let raf = 0, t0 = performance.now(), running = false;

  function bands() {
    const W = layer.clientWidth, H = layer.clientHeight, col = columnEl.getBoundingClientRect();
    if (W < 760 || col.left < 120) return [{ x0: 10, x1: W - 10, y0: H * 0.03, y1: H * 0.38 }];           // narrow screens: the upper part, above the text
    return [{ x0: 20, x1: col.left - 10, y0: H * 0.07, y1: H * 0.93 }, { x0: col.right + 10, x1: W - 20, y0: H * 0.07, y1: H * 0.93 }];
  }
  function relayout() {
    const bs = bands();
    for (let b = 0; b < bs.length; b++) {
      const mine = items.filter((it) => !it.still && it.band % bs.length === b);
      mine.forEach((it, i) => { it.slot = (i + 0.5) / mine.length; it.n = mine.length; });
    }
  }
  function add(el, o) {
    const key = (o && o.key) || ('f' + items.length);
    layer.appendChild(el);
    el.classList.add('rp-f');
    const bs = bands();
    const counts = bs.map((_, b) => items.filter((it) => !it.still && it.band % bs.length === b).length);
    let band = o && o.band != null ? o.band : (counts.length > 1 && counts[1] < counts[0] ? 1 : counts.length > 1 && counts[0] < counts[1] ? 0 : Math.floor(hash(seed + key) * bs.length));
    const it = {
      el, key, band, slot: 0.5, n: 1, y: null,
      px: hash(seed + key + 'px') * Math.PI * 2, py: hash(seed + key + 'py') * Math.PI * 2,
      tx: 58 + hash(seed + key + 'tx') * 46,          // seconds per horizontal sweep
      ty: 74 + hash(seed + key + 'ty') * 52,
      o: (o && o.opacity) || 0.5,
    };
    el.style.setProperty('--o', String(it.o));
    if (o && o.at) {                                   // 261120: stands still at a fraction of the layer (x, y = its top-left); never moved again
      it.still = true;
      el.style.transform = 'translate3d(' + (o.at.x * layer.clientWidth).toFixed(1) + 'px,' + (o.at.y * layer.clientHeight).toFixed(1) + 'px,0)';
    }
    items.push(it);
    relayout();
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    if (!running) { running = true; tick(); }
    return it;
  }
  function remove(key, fadeMs) {
    const i = items.findIndex((it) => it.key === key);
    if (i < 0) return;
    const it = items[i]; items.splice(i, 1);
    it.el.classList.remove('in');
    setTimeout(() => { if (it.el.parentNode) it.el.parentNode.removeChild(it.el); }, fadeMs == null ? 3200 : fadeMs);
    relayout();
  }
  function clear(fadeMs) { items.slice().forEach((it) => remove(it.key, fadeMs)); }
  function setOpacity(key, o) { const it = items.find((x) => x.key === key); if (it) { it.o = o; it.el.style.setProperty('--o', String(o)); } }
  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const t = (performance.now() - t0) / 1000, bs = bands();
    for (const it of items) {
      if (it.still) continue;
      const b = bs[it.band % bs.length], w = it.el.offsetWidth, h = it.el.offsetHeight;
      const bw = Math.max(0, b.x1 - b.x0 - w), bh = Math.max(0, b.y1 - b.y0 - h);
      const cy = b.y0 + it.slot * bh;
      it.y = it.y == null ? cy : it.y + (cy - it.y) * 0.03;                    // slots re-settle while a newcomer is still fading in
      const ay = Math.min(bh / (2 * it.n) * 0.85, 70);
      const x = b.x0 + bw / 2 + (bw / 2) * Math.sin((2 * Math.PI * t) / it.tx + it.px);
      const y = it.y + ay * Math.sin((2 * Math.PI * t) / it.ty + it.py);
      it.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + Math.max(b.y0, Math.min(b.y1 - h, y)).toFixed(1) + 'px,0)';
    }
  }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function start() { if (!running && items.length) { running = true; tick(); } }
  return { add, remove, clear, setOpacity, stop, start, items, bands };
}

export function wordEl(text) { const d = document.createElement('div'); d.className = 'rp-f-word'; d.textContent = text; return d; }
export function ghostEl(text) { const d = document.createElement('div'); d.className = 'rp-f-ghost'; d.textContent = text; return d; }
export function doorEl(label, isNew) {
  const d = document.createElement('div'); d.className = 'rp-door' + (isNew ? ' new' : '');
  d.setAttribute('role', 'button'); d.tabIndex = 0;
  const leaf = document.createElement('div'); leaf.className = 'rp-leaf'; d.appendChild(leaf);
  if (label) { const tag = document.createElement('div'); tag.className = 'rp-tag'; tag.textContent = label; d.appendChild(tag); }
  return d;
}

// ── the column ──────────────────────────────────────────────────────────────
export function createRoom(root, lang, pace) {
  const PACE = pace || 1;                       // 1 for every walker; test runs may shorten the pauses
  const body = root.querySelector('.rp-body'), inputBox = root.querySelector('.rp-input');
  const ko = lang !== 'en';
  let hurry = false;
  root.querySelector('.rp-column').addEventListener('pointerdown', (e) => { if (!e.target.closest('.rp-input')) hurry = true; });
  window.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) hurry = true; });

  function clear() { body.innerHTML = ''; inputBox.innerHTML = ''; inputBox.classList.remove('on'); }
  function scrollDown() { body.scrollTop = body.scrollHeight; }

  /** One line, word by word. Resolves when the last word has started to appear. */
  async function say(text, cls, o) {
    text = String(text);
    // a cut can leave a quotation open ("누구 있어요…) — close it so the line does not look broken
    if ((text.match(/"/g) || []).length % 2 === 1) text += '"';
    if ((text.match(/“/g) || []).length > (text.match(/”/g) || []).length) text += '”';
    const p = document.createElement('p');
    p.className = 'rp-line' + (cls ? ' ' + cls : '') + (o && o.gap ? ' rp-gap' : '');
    const words = String(text).split(/(\s+)/);
    const spans = [];
    for (const w of words) {
      if (/^\s+$/.test(w)) { p.appendChild(document.createTextNode(' ')); continue; }
      const s = document.createElement('span'); s.className = 'w'; s.textContent = w; p.appendChild(s); spans.push(s);
    }
    if (o && o.src) { const s = document.createElement('span'); s.className = 'rp-src w'; s.textContent = o.src; p.appendChild(s); spans.push(s); }
    body.appendChild(p); scrollDown();
    hurry = false;
    const per = ((o && o.per) || 150) * PACE;
    for (const s of spans) { s.classList.add('in'); if (!hurry) await wait(per); }
    if (!hurry) await wait(((o && o.hold) || 900) * PACE);
    scrollDown();
    return p;
  }
  async function sayAll(lines, cls, o) { for (let i = 0; i < lines.length; i++) await say(lines[i], cls, Object.assign({}, o, { gap: i === 0 && o && o.gap })); }

  function waiting(on) {
    let el = body.querySelector('.rp-wait-line');
    if (on && !el) { el = document.createElement('p'); el.className = 'rp-line rp-wait-line'; el.innerHTML = '<span class="rp-wait">···</span>'; body.appendChild(el); scrollDown(); }
    if (!on && el) el.remove();
  }

  /**
   * Connective + continuation, as in the live dialog (CONT_CONNECTIVES, free connective, one line).
   * @returns Promise<{ connective, text } | { silent: true }>
   */
  function ask(o) {
    const conns = o.connectives;
    inputBox.innerHTML = '';
    const guide = document.createElement('div'); guide.className = 'rp-guide';
    guide.textContent = o.guide ? o.guide : o.voidScene ? (ko ? '아무 말도 없습니다 — 무엇이든 적거나, 말없이 있을 수 있습니다.' : 'Nothing is said — write anything, or stay silent.')
                                    : (ko ? '문장이 끊겼습니다 — 연결사를 고르고, 뒤를 이어서 써 주세요.' : 'The sentence broke off — pick a connective and continue it.');
    const row = document.createElement('div'); row.className = 'rp-conns';
    let chosen = '';
    const free = document.createElement('input'); free.className = 'rp-conn-free'; free.maxLength = 14; free.placeholder = ko ? '직접 입력' : 'your own';
    const write = document.createElement('div'); write.className = 'rp-write';
    const chosenEl = document.createElement('span'); chosenEl.className = 'rp-chosen';
    const field = document.createElement('input'); field.type = 'text'; field.maxLength = 90; field.autocomplete = 'off'; field.spellcheck = false;
    const send = document.createElement('button'); send.className = 'rp-send'; send.type = 'button'; send.textContent = '↵'; send.setAttribute('aria-label', ko ? '보내기' : 'send');
    write.append(chosenEl, field, send);
    const setChosen = (c) => { chosen = c; chosenEl.textContent = c; row.querySelectorAll('.rp-conn').forEach((b) => b.classList.toggle('on', b.dataset.c === c)); };
    for (const c of conns) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rp-conn'; b.dataset.c = c; b.textContent = c;
      b.addEventListener('click', () => { free.classList.remove('on'); setChosen(c); field.focus(); });
      row.appendChild(b);
    }
    const own = document.createElement('button'); own.type = 'button'; own.className = 'rp-conn'; own.dataset.c = '\u0000'; own.textContent = ko ? '직접…' : 'own…';
    own.addEventListener('click', () => { free.classList.add('on'); setChosen(free.value.trim()); own.classList.add('on'); free.focus(); });
    free.addEventListener('input', () => { chosen = free.value.trim(); chosenEl.textContent = chosen; });
    free.addEventListener('keydown', (e) => { if (e.key === 'Enter') field.focus(); });
    row.append(own, free);
    inputBox.append(guide, row, write);
    let silentBtn = null;
    if (o.allowSilence) { silentBtn = document.createElement('button'); silentBtn.type = 'button'; silentBtn.className = 'rp-silent'; silentBtn.textContent = ko ? '말없이 있는다' : 'stay silent'; inputBox.appendChild(silentBtn); }
    inputBox.classList.add('on');
    setTimeout(() => { if (!('ontouchstart' in window)) field.focus(); }, 300);
    return new Promise((resolve) => {
      const done = (v) => { inputBox.classList.remove('on'); setTimeout(() => { inputBox.innerHTML = ''; }, 900); resolve(v); };
      const submit = () => {
        const text = field.value.trim();
        if (!text) { field.focus(); return; }
        if (!chosen && !o.voidScene && !o.optionalConn) { guide.classList.add('warn'); setTimeout(() => guide.classList.remove('warn'), 1400); return; }
        done({ connective: chosen, text });
      };
      send.addEventListener('click', submit);
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) submit(); });
      if (silentBtn) silentBtn.addEventListener('click', () => done({ silent: true }));
    });
  }

  return { clear, say, sayAll, ask, waiting, show() { root.classList.add('on'); }, hide() { root.classList.remove('on'); }, body };
}

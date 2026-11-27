/**
 * Words that remain — the ending, and the outside (2026-11-28, branch space-remain). Screen only; the rules are in remain.js.
 * Record: docs/우주무대_남는말_실험-261128.md §연출
 *
 * The ending, in the place itself (the cosmos stays behind, dimmed):
 *   1. the walk as one text — every scene's lines in the order they were read, the walker's own lines among them
 *   2. the text goes dim; only what the walker said is lit (yellow)
 *   3. the three blanks filled in before entering come up beside it
 *   4. the lines that do not remain go out, one after another (most do: three remain at most, one a blank)
 *   5. each line that remains goes to the sentence it displaces: that sentence goes out, the line stands there —
 *      and beside it the blank it turned back on is lit, alone: what the walker said of another, next to what they wrote of themselves
 *   6. the pieces (the walker's own model, the map) open; the changed ones move to where they now stand. A piece
 *      pressed shows what the next person will read there. Nothing can be changed. One button: leave.
 * Everything was already kept before any of this is shown (main.js persist): leaving at any moment leaves it as it is.
 *
 * Motion: slow, wide, heavy (260809). Nothing bounces, nothing flickers.
 * The sentences said on this screen are drafts — the author's to rewrite.
 */
const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };

export async function runEnding(o) {
  const ko = o.lang !== 'en', FAST = o.fast || 1;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms / FAST));
  document.body.classList.add('sr-ending');

  // ── 1. the walk as one text ────────────────────────────────────────────────
  const root = el('div'); root.id = 'srEnd';
  const col = el('div', 'sr-col'); root.appendChild(col);
  col.appendChild(el('p', 'sr-title', o.title));
  const mineEls = new Map(), textEls = new Map();                         // line index → <p> · 'order|si' → <p>
  for (const entry of o.story) {
    const sec = el('section', 'sr-scene');
    for (const it of entry.items) {
      if (it.kind === 'mine') { const p = el('p', 'm', it.t); mineEls.set(it.li, p); sec.appendChild(p); }
      else { const p = el('p', 't' + (it.part === 'b' ? ' b' : ''), it.t); if (it.si >= 0) textEls.set(entry.order + '|' + it.si, p); sec.appendChild(p); }
    }
    col.appendChild(sec);
  }
  const say = el('div'); say.id = 'srSay';
  const before = el('div'); before.id = 'srBefore';
  const piece = el('div'); piece.id = 'srPiece';
  const out = el('button', 'rp-btn', ko ? '나간다' : 'leave'); out.id = 'srLeave'; out.type = 'button';
  document.body.append(root, say, before, piece, out);
  out.addEventListener('click', () => o.leave());
  const tell = async (text, hold) => { say.classList.add('on'); await o.typeText(say, text, { per: 70, pace: 1 / FAST, voice: true }); await wait(hold || 2600); };
  const toward = (node) => { try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {} };

  await wait(600);
  root.classList.add('on');
  await wait(5200);

  // ── 2. only what the walker said is lit ────────────────────────────────────
  root.classList.add('lit');
  await tell(ko ? '네가 한 말이야.' : 'You said these.', 3400);
  const mineList = Array.from(mineEls.values());
  if (mineList.length > 1) { toward(mineList[mineList.length - 1]); await wait(Math.min(9000, 2600 + mineList.length * 420)); toward(mineList[0]); await wait(2600); }

  // ── 3. what was written before entering ────────────────────────────────────
  before.appendChild(el('p', 'k', ko ? '네가 적은 것' : 'what you wrote'));
  const blankEls = [];
  for (const b of o.blanks) {
    const [a, c] = b.line.split('___'), p = el('p', 'b'); blankEls.push(p);
    p.append(document.createTextNode(a || ''), el('span', 'a', b.answer), document.createTextNode(c || ''));
    before.appendChild(p);
  }
  before.classList.add('on');
  await wait(4200);
  await tell(ko ? '네가 고르는 게 아니야.' : 'You do not choose.', 3000);

  // ── 4. what does not remain goes out ───────────────────────────────────────
  const settled = await o.weave();                                          // already kept in this browser when this resolves
  out.classList.add('on');                                                  // from here on: leave whenever; it is all there already
  for (const [li, p] of mineEls) {
    if (settled.keep.has(li)) continue;
    toward(p); await wait(700);
    p.classList.add('gone');
    await wait(1500);
  }
  await wait(1400);

  // ── 5. what remains takes a sentence's place ───────────────────────────────
  if (settled.changes.length) await tell(ko ? '남는 건 이거야.' : 'This is what stays.', 2600);
  else await tell(ko ? '남은 말이 없어.' : 'Nothing stayed.', 2600);
  for (const c of settled.changes) {
    const was = textEls.get(c.order + '|' + c.index), mine = mineEls.get(c.li);
    if (!was || !mine) continue;
    blankEls.forEach((p, i) => p.classList.toggle('hit', i === c.blank)); before.classList.toggle('one', c.blank >= 0 && c.blank < blankEls.length);   // the blank this line turned back on
    toward(was); await wait(1500);
    was.classList.add('out');                                               // the sentence that stood there goes out…
    await wait(2400);
    was.textContent = c.now; was.classList.remove('out'); was.classList.add('in');   // …and the walker's line stands in its place
    mine.classList.add('moved');
    await wait(4200);                                                       // the two stand side by side a while
  }
  await wait(1200);
  before.classList.remove('one'); blankEls.forEach((p) => p.classList.remove('hit'));
  root.classList.remove('lit'); root.classList.add('after');                // read once as the next person reads it
  if (settled.changes.length) { await tell(ko ? '다음 사람이 이걸 읽어.' : 'The next person reads this.', 4200); await tell(ko ? '못 고쳐.' : 'It cannot be changed.', 3400); }
  else await tell(ko ? '이 기억은 그대로야.' : 'The memory is as it was.', 4200);

  // ── 6. the pieces ──────────────────────────────────────────────────────────
  root.classList.add('aside'); before.classList.remove('on');
  await wait(1800);
  const show = (t) => {
    if (!t) return;
    piece.innerHTML = '';
    piece.appendChild(el('p', 'k', ko ? '다음 사람이 읽을 글' : 'what the next person reads'));
    for (const l of t.lines) piece.appendChild(el('p', l.who === 'mine' ? 'mine' : l.who === 'other' ? 'other' : '', l.t));
    piece.classList.add('on');
  };
  o.pieces.onPick(show);
  o.pieces.open();
  await wait(1600);
  say.classList.remove('on');
  await o.pieces.shift(9000 / FAST);
  show(o.pieces.first());
  await tell(ko ? '조각을 눌러 봐.' : 'Press a piece.', 9000);
  say.classList.remove('on');
  return new Promise(() => {});                                             // it ends when the walker leaves
}

/**
 * The outside: the door is shut. Only what the piece now is — its introduction and what happens in it, written from
 * the text as it stands (the server's "outside"). If the text has changed since that was written, it is written again.
 */
export async function showOutside(o) {
  const ko = o.lang !== 'en';
  document.body.classList.add('sr-outside');
  const root = el('div'); root.id = 'srOutside';
  root.appendChild(el('p', 'sr-title', o.title));
  root.appendChild(el('p', 'shut', ko ? '다녀간 기억이야. 다시는 못 들어가.' : 'You have been here. You cannot go in again.'));
  root.appendChild(el('p', 'k', ko ? '지금 이 기억은' : 'what this memory is now'));
  const intro = el('p', 'intro', (o.state.outside && o.state.outside.intro) || o.fallbackIntro || ''), syn = el('p', 'syn', (o.state.outside && o.state.outside.synopsis) || '');
  const waiting = el('p', 'wait', '···');
  root.append(intro, syn, waiting);
  if (o.real) {                                                             // the real walk: nothing to do here but go back
    const tools = el('div', 'tools'), back = el('button', '', ko ? '메뉴로' : 'to the menu');
    back.type = 'button'; back.addEventListener('click', () => { try { sessionStorage.setItem('tem_menu_after_ending', '1'); } catch (_) {} location.href = location.protocol === 'file:' ? 'index.html' : './'; });
    tools.append(back); root.appendChild(tools);
  } else {                                                                  // preview tools — not part of the piece
    const tools = el('div', 'tools');
    tools.appendChild(el('span', '', ko ? '미리보기 도구' : 'preview tools'));
    const a = el('button', '', ko ? '다음 사람으로 걷기' : 'walk as the next person'), b = el('button', '', ko ? '처음으로 되돌리기' : 'forget everything');
    a.type = b.type = 'button'; a.addEventListener('click', o.asNext); b.addEventListener('click', o.reset);
    tools.append(a, b); root.appendChild(tools);
  }
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('on'));
  try {
    const now = await o.refresh();
    if (now && now.intro) {
      if (intro.textContent !== now.intro || syn.textContent !== now.synopsis) { intro.classList.add('turn'); syn.classList.add('turn'); await new Promise((r) => setTimeout(r, 1800)); intro.textContent = now.intro; syn.textContent = now.synopsis; intro.classList.remove('turn'); syn.classList.remove('turn'); }
    }
  } catch (e) { console.warn('[remain] outside', e); }
  waiting.remove();
}

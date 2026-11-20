/**
 * Room-play ending, first two beats (2026-11-21) — the walker's own version of the memory, then whose lines they were.
 *
 * Beat 1: the memory as this walker read it, typed as one text in the order walked — the scenes' sentences and the
 *         walker's own continuations, with nothing to tell them apart.
 * Beat 2: the lines take their colours: as first written / the walker's / left by someone who walked before /
 *         changed by being read many times. One sentence says how many of each. Nothing is scored or named:
 *         the stage reports what was read and who wrote it, it does not judge the walker (design principle: the
 *         engine observes).
 *
 * Why (decision record §9, docs/글방_통로_무대_결정-261117.md): the ending showed where the walker went and nothing
 * of what they wrote; and "there is no original" is the thing the work claims — here the walker finds that what
 * they took for the manuscript already carried other people's words.
 *
 * @param o { el, title, lang, rooms:[{ lines:[{ t, who:'text'|'mine'|'other'|'changed' }] }], typeText, wait, buttons, pace }
 * @returns { total, mine, other, changed }
 */
export async function showVariant(o) {
  const ko = o.lang !== 'en', pace = o.pace || 1, box = o.el, wait = o.wait, type = o.typeText;
  box.innerHTML = '';
  const inner = document.createElement('div'); inner.className = 'rp-variant-inner'; box.appendChild(inner);
  const add = (cls) => { const p = document.createElement('p'); p.className = cls; inner.appendChild(p); return p; };
  let hurry = false;
  const onDown = () => { hurry = true; }, onKey = (e) => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') hurry = true; };
  box.addEventListener('pointerdown', onDown); window.addEventListener('keydown', onKey);
  const skip = () => hurry, down = () => { box.scrollTop = box.scrollHeight; };
  box.classList.add('on');
  await type(add('rp-variant-title'), ko ? '당신이 읽은 「' + o.title + '」' : 'The "' + o.title + '" you read', { per: 80, pace, skip });
  if (!hurry) await wait(700 * pace);
  const els = [], n = { total: 0, mine: 0, other: 0, changed: 0 };
  for (let r = 0; r < o.rooms.length; r++) {
    const lines = o.rooms[r].lines.filter((l) => l && String(l.t).trim());
    for (let i = 0; i < lines.length; i++) {
      const p = add('rp-line' + (i === 0 ? ' rp-gap' : ''));
      down();
      await type(p, lines[i].t, { per: 22, rest: 110, pace, skip }); down();   // a long text: quicker letters, shorter breaths than a room's
      els.push({ p, who: lines[i].who }); n.total++; if (n[lines[i].who] != null) n[lines[i].who]++;
      if (!hurry) await wait(140 * pace);
    }
  }
  await wait((hurry ? 500 : 1800) * pace);
  // beat 2 — whose lines they were. A colour is set, at once, line after line: nothing fades.
  for (const e of els) { if (e.who !== 'text') { e.p.classList.add('v-' + e.who); await wait(70 * pace); } }
  const parts = [];
  if (ko) {
    if (n.mine) parts.push(n.mine + '줄은 당신이 썼' + (n.other ? '고' : '습니다'));
    if (n.other) parts.push(n.other + '줄은 먼저 걸은 사람이 썼습니다');
    let s = n.total + '줄 가운데 ' + (parts.length ? parts.join(', ') : '당신이 쓴 줄은 없습니다') + '.';
    if (n.changed) s += ' ' + n.changed + '줄은 여러 번 읽히는 사이에 달라진 문장입니다.';
    await wait(500 * pace); await type(add('rp-variant-sum'), s, { per: 45, pace }); down();
  } else {
    let s = 'Of ' + n.total + ' lines, ' + (n.mine ? n.mine + ' are yours' : 'none are yours') + (n.other ? ', ' + n.other + ' were left by someone who walked before you' : '') + '.';
    if (n.changed) s += ' ' + n.changed + ' changed while being read again and again.';
    await wait(500 * pace); await type(add('rp-variant-sum'), s, { per: 45, pace }); down();
  }
  box.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey);
  await o.buttons([{ id: 'go', label: ko ? '계속' : 'go on' }]);
  return n;
}

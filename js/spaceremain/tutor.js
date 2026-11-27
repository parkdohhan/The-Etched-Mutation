/**
 * The practice walk (2026-11-28 night, author: "the one reached from the opening becomes a tutorial — about three scenes,
 * told by 'another me': how to go back by the map, how to ask, and so on. The real one is in the archive.")
 *
 * space-remain.html?as=tutorial — three scenes of the memory, nothing kept anywhere (no ledger row, no journal, nothing in
 * the memory's text, no lock). Between the things the stage does, "another me" (the opening's voice: plain, close, 반말)
 * says what can be done. It says each thing once, at the moment it becomes possible, and never while a text is being typed.
 * The sentences are drafts — the author's to rewrite.
 */
const SAY = {
  ko: {
    // 261128 (author: "isn't this too much like an AI?" — the first draft explained: a dash, a list of three, "ask and it answers what it knows").
    // The opening's voice is short and thrown out ("…저기로 가봐."): one thing at a time, nothing explained.
    begin: ['연습이야.', '여기서 한 말은 안 남아.'],
    ask: ['말을 걸어 봐.', '물어봐. 아는 건 말해 줄 거야.'],
    more: ['네 생각을 말해도 돼.', '다 했으면 넘어가.'],
    eyes: ['방금 그 장면이야.', '걸어서 둘러봐.'],
    door: ['문이 생겼어.', '길을 따라 걸어가.'],
    doorTouch: ['문이 생겼어.', '동그라미를 누르고 있어.'],
    next: ['저게 다음 장면이야.', '가까이 가 봐.'],
    map: ['M 을 눌러 봐.', '지나온 장면을 누르면 거기로 돌아가.'],
    back: ['옆에 문이 하나 더 있어.', '지나온 장면으로 나 있어.'],
    again: ['네가 한 말이 그대로 있어.', '더 말할 수는 있어.'],
    mapTouch: ['왼쪽 위 지도를 눌러 봐.', '지나온 장면을 누르면 거기로 돌아가.'],
    end: ['연습은 여기까지야.', '아무것도 안 남았어.', '진짜는 아카이브에 있어.', '거기서는 네 말이 남아.', '한 번뿐이야.'],
  },
  en: {
    begin: ['This is practice.', 'Nothing you say here is kept anywhere.'],
    ask: ['Speak to it.', 'Ask. It will tell you what it knows.'],
    more: ['You need not only ask. You can say what you think.', 'When you are done, press "move on".'],
    eyes: ['That is the scene you just read.', 'Walk round it.'],
    door: ['A door has stood up.', 'Walk along the way, through the door.'],
    doorTouch: ['A door has stood up.', 'Hold the circle to walk.'],
    next: ['That is the next scene.', 'Come near and its text comes up.'],
    map: ['Open the map. M, or the right mouse button.', 'Press a scene you have passed and you are back at it. The door stays where it stood.'],
    back: ['There is one more door beside it.', 'It gives onto a scene you have passed.'],
    again: ['What you said is still here.', 'You can say more.'],
    mapTouch: ['Press the map, top left.', 'Press a scene you have passed and you are back at it. The door stays where it stood.'],
    end: ['Practice ends here.', 'Nothing you said here was kept.', 'The real one is in the ARCHIVE.', 'What you say there stays in the text. And there is only the once.'],
  },
};

export function createTutor(o) {
  const L = SAY[o.lang === 'en' ? 'en' : 'ko'], fast = o.fast || 1, touch = !!o.touch;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms / fast));
  const el = document.createElement('div'); el.id = 'srOther'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el);
  const said = new Set(); let token = 0, chain = Promise.resolve();
  /**
   * Say a thing once. 261128 night (testers: "the line about the door is hard to see"): a later thing no longer takes the place of
   * one still being said (it cut the first off after a second and a half) — it waits its turn. hush() ends everything said or waiting.
   */
  function say(key) {
    const k = touch && L[key + 'Touch'] ? key + 'Touch' : key;
    if (said.has(key) || !L[k]) return chain; said.add(key);
    const t = token;
    chain = chain.then(async () => {
      if (t !== token) return;
      el.classList.add('on');
      for (const line of L[k]) {
        if (t !== token) return;
        await o.typeText(el, line, { per: 55, pace: 1 / fast });
        await wait(2600 + line.length * 55);
      }
      if (t === token) { el.classList.remove('on'); await wait(500); }
    });
    return chain;
  }
  function hush() { token++; chain = Promise.resolve(); el.classList.remove('on'); }
  return { say, hush, end: L.end, has: (key) => said.has(key) };
}

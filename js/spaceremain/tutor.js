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
    begin: ['연습이야.', '여기서 한 말은 어디에도 남지 않아.'],
    ask: ['장면한테 말을 걸어 봐.', '이 기억에 있는 건 전부 알고 있어. 누가, 왜, 무슨 일이었는지 — 물으면 아는 대로 답해.'],
    more: ['묻기만 하지 않아도 돼. 네 생각을 말해도 돼.', '다 했으면 「넘어간다」를 눌러.'],
    eyes: ['방금 읽은 장면이 저기 떠 있어.', '날아서 둘러봐.'],
    door: ['문이 섰어.', '길에 닿으면 발이 붙어. 앞으로 걸어서 문을 지나.'],
    doorTouch: ['문이 섰어.', '길에 닿으면 발이 붙어. 동그라미를 누르고 있으면 걸어.'],
    next: ['저게 다음 장면이야.', '가까이 가면 글이 떠.'],
    map: ['지도를 열어 봐. M 이나 마우스 오른쪽이야.', '지나온 장면을 누르면 거기로 돌아가. 문은 그대로 서 있어.'],
    mapTouch: ['왼쪽 위 지도를 눌러 봐.', '지나온 장면을 누르면 거기로 돌아가. 문은 그대로 서 있어.'],
    end: ['연습은 여기까지야.', '여기서 한 말은 아무것도 남지 않았어.', '진짜는 아카이브에 있어.', '거기서 한 말은 글에 남아. 그리고 한 번뿐이야.'],
  },
  en: {
    begin: ['This is practice.', 'Nothing you say here is kept anywhere.'],
    ask: ['Speak to the scene.', 'It knows everything that is in this memory. Who, why, what happened — ask, and it answers what it knows.'],
    more: ['You need not only ask. You can say what you think.', 'When you are done, press "move on".'],
    eyes: ['The scene you just read is afloat over there.', 'Fly round it.'],
    door: ['A door has stood up.', 'Touch the way and your feet hold. Walk forward, through the door.'],
    doorTouch: ['A door has stood up.', 'Touch the way and your feet hold. Hold the circle to walk.'],
    next: ['That is the next scene.', 'Come near and its text comes up.'],
    map: ['Open the map. M, or the right mouse button.', 'Press a scene you have passed and you are back at it. The door stays where it stood.'],
    mapTouch: ['Press the map, top left.', 'Press a scene you have passed and you are back at it. The door stays where it stood.'],
    end: ['Practice ends here.', 'Nothing you said here was kept.', 'The real one is in the ARCHIVE.', 'What you say there stays in the text. And there is only the once.'],
  },
};

export function createTutor(o) {
  const L = SAY[o.lang === 'en' ? 'en' : 'ko'], fast = o.fast || 1, touch = !!o.touch;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms / fast));
  const el = document.createElement('div'); el.id = 'srOther'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el);
  const said = new Set(); let token = 0;
  /** Say a thing once. A later thing takes the place of one still being said. */
  async function say(key) {
    const k = touch && L[key + 'Touch'] ? key + 'Touch' : key;
    if (said.has(key) || !L[k]) return; said.add(key);
    const t = ++token;
    el.classList.add('on');
    for (const line of L[k]) {
      if (t !== token) return;
      await o.typeText(el, line, { per: 55, pace: 1 / fast });
      await wait(2600 + line.length * 55);
    }
    if (t === token) el.classList.remove('on');
  }
  function hush() { token++; el.classList.remove('on'); }
  return { say, hush, end: L.end, has: (key) => said.has(key) };
}

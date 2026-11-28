/**
 * Record-space — making a memory for the space stage (2026-11-23).
 * Decision record: docs/우주무대_기억만들기_결정-261123.md
 *
 *   title, one line → scenes (each in four parts: the first part · the second part · words afloat · words buried)
 *   → for each scene: its emotion (a short talk with "another me" about that scene; every answer measured on the 17 axes,
 *     the mean shown as bars the author may move) · its thing (a drawing recipe from generate-scene-thing, shown turning)
 *     · its sound (generate-scene-sound: a draft sentence, then the sound)
 *   → the order (↑ ↓ on the cards; the first card is the first scene)
 *   → before it goes up, one sheet asks for everything at once (public · others' walks change the text · "니 순서대로 플레이
 *     안 됨 ㅋ 첫 번째 실일 뿐임" · the order is written as the first thread) → record-space-seal → space-blank.html (261124: the same stage every walker gets)
 *
 * Not on the menu (author, 261123: too early) — opened by its address. ?lang=ko|en · ?test=1 = nothing is saved (the payload
 * goes to the console; the talks, things and sounds are still asked of the server).
 * What the server is asked here is what the stage and the admin already use: claude-scene (emotion_analysis),
 * dialog-turn-record, generate-scene-sound, and the two new functions generate-scene-thing / record-space-seal.
 */
import * as data from '../roomplay/data.js';
import { typeText, sentences } from '../roomplay/room.js';
import { DEFAULT_EMOTION_ANCHORS } from '../shared/math.js';
import { detectCrisis } from '../safety.js';
import { createPreview } from './preview.js?v=261123c';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const LANG = (qs.get('lang') || sessionStorage.getItem('tem_archive_lang') || 'ko').slice(0, 2) === 'en' ? 'en' : 'ko';
const ko = LANG !== 'en';
const TEST = qs.get('test') === '1';
const MAX_SCENES = 12, MIN_CHARS = 30, MAX_CHARS = 100, MIN_SENT = 2, MAX_SENT = 4;   // the scene excerpt rule (author, 260915)
const TALK_MIN = 2, TALK_MAX = 5;                                                       // answers before "됐어" is offered · before the talk closes by itself
const AXES = DEFAULT_EMOTION_ANCHORS;
const AXIS_KO = { fear: '두려움', sadness: '슬픔', anger: '분노', guilt: '죄책감', shame: '수치', isolation: '고립', numbness: '무감각', moral_pain: '도덕적 고통', helplessness: '무력감', despair: '절망',
  joy: '기쁨', hope: '희망', relief: '안도', gratitude: '감사', love: '사랑', peace: '평온', comfort: '편안함', flutter: '설렘', excitement: '흥분' };
const AXIS_EN = { fear: 'fear', sadness: 'sadness', anger: 'anger', guilt: 'guilt', shame: 'shame', isolation: 'isolation', numbness: 'numbness', moral_pain: 'moral pain', helplessness: 'helplessness', despair: 'despair',
  joy: 'joy', hope: 'hope', relief: 'relief', gratitude: 'gratitude', love: 'love', peace: 'peace', comfort: 'comfort', flutter: 'flutter', excitement: 'excitement' };
const AXIS = ko ? AXIS_KO : AXIS_EN;

const L = {
  ko: {
    kicker: '한 기억을 놓아 두는 자리', title: '기억 만들기',
    lead: '장면을 쓰고, 그 장면의 감정을 뽑고, 조형물과 소리를 붙인다. 올리면 곧 그 기억의 우주로 들어간다.',
    gate: '기억을 만들려면 먼저 들어와야 해. 아이디 하나면 돼.', gateGo: '들어가기 · 가입하기', needLogin: '들어온 상태가 풀렸어. 다시 들어와 줘.',
    leave: '나가기', draftSave: '임시저장', draftSaved: '임시저장했어.', draftSaveFail: '임시저장이 안 됐어. 잠시 뒤에 다시 해 줘.', draftLocalOnly: '이 브라우저에만 임시저장했어. 서버에 닿지 않았어.',
    leaveAsk: '쓰던 걸 임시저장할까?', leaveSave: '임시저장하고 나가기', leaveNoSave: '그냥 나가기', leaveStay: '계속 쓰기',
    draftAsk: (t, d) => '임시저장한 기억이 있어' + (t ? ' — 「' + t + '」' : '') + '. ' + d + '에 저장했어. 이어서 쓸까?', draftResume: '이어서 쓰기', draftNew: '새로 쓰기',
    memTitle: '제목', memDesc: '한 줄 설명', phTitle: '이 기억의 이름', phDesc: '한 줄로',
    scene: '장면', first: '첫 장면', up: '위로', down: '아래로', del: '지우기',
    a: '앞 토막', aPh: '장면이 열리는 글. 두세 문장.', b: '뒷 토막', bPh: '말 한 번 뒤에 읽히는 글. 다섯 줄 안팎. 비우면 떠 있는 말로 엮는다.',
    words: '떠 있는 말', wordsPh: '쉼표로 나눠서. 장면 둘레에 떠 있는 낱말들.', deep: '묻힌 말', deepPh: '쉼표로 나눠서. 파내면 올라오는 말.',
    chars: (n) => `${n}자`, sents: (n) => `문장 ${n}`, rule: `자: ${MIN_CHARS}~${MAX_CHARS}자 · ${MIN_SENT}~${MAX_SENT}문장`,
    emotion: '감정', thing: '조형물', sound: '소리',
    talk: '감정 뽑기', manual: '직접 정하기', again: '다시', done: '됐어', send: '말하기', answerPh: '여기에 답해……', anotherMe: '또다른 나',
    talkNeedText: '앞 토막을 먼저 써.', talkFail: '지금은 묻지 못해. 직접 정하거나, 잠시 뒤에 다시.', talkClosing: '……그래. 여기까지로 재자.',
    crisis: '……아냐, 이건 너무 날카로워. 여기까지만 하자.',
    emotionDone: (n) => `대화 ${n}번으로 잼`, emotionManual: '직접 정함', emotionNone: '아직 없음', emotionEmpty: '어느 축도 0이야. 하나는 올려.',
    emotionAuto: '글에서 읽은 감정 — 대화하거나 직접 고칠 수 있어',
    wayHand: '직접 적는다', wayStory: '소설을 넣는다', storyPh: '단편소설 본문을 여기에 붙여.', storyGo: '초안 받기',
    storyNote: '본문의 문장만으로 장면을 뽑아 둔다. 받은 뒤에 고치면 돼. 본문은 너만 볼 수 있는 자리에 따로 둔다.',
    storyShort: '너무 짧아. 400자는 넘어야 해.', storyLong: '너무 길어. 6만 자까지야.', storyWait: '읽는 중…… 1분쯤 걸려.', storyReading: '장면마다 감정을 읽는 중……',
    storyDone: (n) => `장면 ${n}개를 뽑았어. 고쳐 봐.`, storyFail: '지금은 못 뽑겠어. 잠시 뒤에 다시.',
    storyReplaceAsk: '적어 둔 장면이 있어. 지우고 초안으로 바꿀까?', storyReplaceYes: '바꾼다', storyReplaceNo: '그만둔다', storyChars: (n) => `${n}자`,
    thingMake: '조형물 만들기', thingWait: '그리는 중…', thingFail: '그리지 못했어. 다시 눌러.', thingNone: '없으면 기둥 하나로 선다', thingDrop: '빼기',
    soundDraft: '소리 초안', soundGen: '소리 만들기', soundClear: '빼기', soundWait: '초안 받는 중…', soundGenWait: '만드는 중… 10~20초', soundFail: '소리를 못 만들었어.', soundPh: '소리를 글로. 초안을 고쳐도 된다.', soundDone: '이 장면에서만 난다',
    addScene: '장면 더하기', sceneMax: `장면은 ${MAX_SCENES}개까지`, publish: '올리기',
    needTitle: '제목이 없어', needScene: '장면이 없어', needText: (ns) => `글이 없는 장면: ${ns.join(', ')}`, needEmotion: (ns) => `감정이 없는 장면: ${ns.join(', ')}`,
    orderLine: (n) => `장면 ${n}개 · 이 순서가 첫 실이 된다`,
    consentTitle: '올리기 전에',
    consent: ['이 기억은 공개돼. 누구나 걸을 수 있어.', '남의 걸음이 쌓이면 장면의 글이 바뀌어. 그 사람들 말이 들어와.', '니 순서대로 플레이 안 됨 ㅋ 첫 번째 실일 뿐임. 문은 엔진이 열어.', '네가 정한 순서는 첫 걸음으로 장부에 남아.', '네 기억들은 아래 이름으로 한데 모여 보여. 누르면 올린 순서대로 이어서 걷게 돼.'],
    penLabel: '이 이름 아래 둔다', penPh: '가명. 아이디나 진짜 이름은 쓰지 마.', penIsId: '그건 아이디야. 다른 이름으로.', penNeed: '이름이 없어',
    consentCheck: '다 읽었고, 그래도 올린다.', consentGo: '올린다', consentNo: '아직',
    sealing: '묻는 중……', sealed: '묻었어. 이제, 들어가 봐.', sealFail: '지금은 묻히지 않아. 잠시 뒤에 다시.', testNote: '연습: 서버에 저장하지 않았다. 내용은 콘솔에.',
    thread: '첫 실까지 놓였다', noThread: '첫 실은 놓이지 않았다 (기억은 올라갔다)',
  },
  en: {
    kicker: 'a place to set one memory down', title: 'make a memory',
    lead: 'Write the scenes, draw out each one\'s emotion, give it a thing and a sound. When it goes up you step into its space.',
    gate: 'To make a memory, sign in first. An ID is enough.', gateGo: 'sign in · sign up', needLogin: 'You were signed out. Please sign in again.',
    leave: 'leave', draftSave: 'save draft', draftSaved: 'draft saved.', draftSaveFail: 'could not save the draft. try again in a moment.', draftLocalOnly: 'saved in this browser only — the server could not be reached.',
    leaveAsk: 'save what you wrote as a draft?', leaveSave: 'save and leave', leaveNoSave: 'leave without saving', leaveStay: 'keep writing',
    draftAsk: (t, d) => 'there is a saved draft' + (t ? ' — "' + t + '"' : '') + ', saved ' + d + '. continue it?', draftResume: 'continue', draftNew: 'start new',
    memTitle: 'title', memDesc: 'one line', phTitle: 'the name of this memory', phDesc: 'in one line',
    scene: 'scene', first: 'first scene', up: 'up', down: 'down', del: 'remove',
    a: 'first part', aPh: 'the text the scene opens with. two or three sentences.', b: 'second part', bPh: 'read after the first exchange. about five lines. left empty, the words afloat are read instead.',
    words: 'words afloat', wordsPh: 'comma-separated. the words that float round the scene.', deep: 'words buried', deepPh: 'comma-separated. what comes up when dug.',
    chars: (n) => `${n} chars`, sents: (n) => `${n} sentences`, rule: `rule: ${MIN_CHARS}–${MAX_CHARS} chars · ${MIN_SENT}–${MAX_SENT} sentences`,
    emotion: 'emotion', thing: 'thing', sound: 'sound',
    talk: 'draw out the emotion', manual: 'set it by hand', again: 'again', done: 'enough', send: 'say', answerPh: 'answer here……', anotherMe: 'another me',
    talkNeedText: 'write the first part first.', talkFail: 'it cannot ask right now. set it by hand, or try again in a while.', talkClosing: '……right. we measure from here.',
    crisis: '……no, this is too sharp. let\'s stop here.',
    emotionDone: (n) => `measured from ${n} exchanges`, emotionManual: 'set by hand', emotionNone: 'none yet', emotionEmpty: 'every axis is 0. raise one.',
    emotionAuto: 'read from the text — talk, or set it by hand',
    wayHand: 'type it', wayStory: 'put a story in', storyPh: 'paste the short story here.', storyGo: 'draft it',
    storyNote: 'scenes are taken from the story\'s own sentences. correct them after. the story is kept where only you can read it.',
    storyShort: 'too short. 400 letters at least.', storyLong: 'too long. 60,000 letters at most.', storyWait: 'reading…… about a minute.', storyReading: 'reading each scene……',
    storyDone: (n) => `${n} scenes taken. correct them.`, storyFail: 'it cannot be drafted right now. try again in a while.',
    storyReplaceAsk: 'there are scenes written already. clear them and take the draft?', storyReplaceYes: 'take the draft', storyReplaceNo: 'leave it', storyChars: (n) => `${n} letters`,
    thingMake: 'make the thing', thingWait: 'drawing…', thingFail: 'it could not be drawn. press again.', thingNone: 'without one, a single post stands', thingDrop: 'drop',
    soundDraft: 'sound draft', soundGen: 'make the sound', soundClear: 'drop', soundWait: 'getting a draft…', soundGenWait: 'making… 10–20 s', soundFail: 'the sound could not be made.', soundPh: 'the sound, in words. edit the draft if you like.', soundDone: 'heard in this scene only',
    addScene: 'add a scene', sceneMax: `up to ${MAX_SCENES} scenes`, publish: 'put it up',
    needTitle: 'no title', needScene: 'no scene', needText: (ns) => `scenes without text: ${ns.join(', ')}`, needEmotion: (ns) => `scenes without an emotion: ${ns.join(', ')}`,
    orderLine: (n) => `${n} scenes · this order becomes the first thread`,
    consentTitle: 'before it goes up',
    consent: ['This memory is public. Anyone can walk it.', 'As others walk it, the scenes\' texts change. Their words come in.', 'It will not play in your order lol. Your order is only the first thread. The engine opens the doors.', 'The order you set is written into the ledger as the first walk.', 'Your memories are shown together under the name below. Opened, they are walked one after another, in the order they went up.'],
    penLabel: 'kept under this name', penPh: 'a pen name. not your ID, not your real name.', penIsId: 'that is your ID. another name, please.', penNeed: 'no name',
    consentCheck: 'I read it all, and I put it up anyway.', consentGo: 'put it up', consentNo: 'not yet',
    sealing: 'burying……', sealed: 'buried. now, go in.', sealFail: 'it will not bury right now. try again in a while.', testNote: 'practice: nothing was saved. the payload is in the console.',
    thread: 'the first thread is laid', noThread: 'the first thread was not laid (the memory is up)',
  },
};
const T = L[LANG];

const S = { title: '', desc: '', scenes: [], startedAt: new Date().toISOString(), busy: false, source: '' };   // source = the short story the first draft was taken from (261128), kept privately with the memory
let uid = 0;
const sb = () => data.client();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s == null ? '' : s);
const splitList = (s) => String(s || '').split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);
const lines = (s) => String(s || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
function toast(msg, ms) { const t = $('rsToast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms || 5000); }
function status(el, text, kind) { el.textContent = text || ''; el.classList.remove('ok', 'warn', 'wait'); if (kind) el.classList.add(kind); }

// ── the 17-axis reading (the same call RECORD v4 makes for every turn; no context: the author speaks of their own scene) ──
async function measure(text) {
  try {
    const resp = await sb().functions.invoke('claude-scene', { body: { type: 'emotion_analysis', emotion: text, reason: text, anchorEmotions: AXES, context: null } });
    if (!resp || resp.error) { console.warn('[record-space] measure', resp && resp.error); return null; }
    let base = resp.data && resp.data.analysis && resp.data.analysis.base;
    if (typeof base === 'string') { try { base = JSON.parse(base); } catch (_) { base = null; } }
    if (!base || typeof base !== 'object' || Array.isArray(base)) return null;
    const vec = {}; let any = false;
    for (const k of AXES) { const n = Number(base[k]); if (Number.isFinite(n) && n > 0) { vec[k] = Math.max(0, Math.min(1, n)); any = true; } }
    return any ? vec : null;
  } catch (e) { console.warn('[record-space] measure failed', e); return null; }
}
function meanVec(list) {
  const vs = list.filter((v) => v && Object.keys(v).length); const out = {};
  if (!vs.length) return out;
  for (const k of AXES) { let s = 0, n = 0; for (const v of vs) { if (v[k] != null) { s += v[k]; } n++; } const m = n ? s / n : 0; if (m > 0.001) out[k] = +m.toFixed(4); }
  return out;
}

// ── one scene card ──────────────────────────────────────────────────────────
function addScene(init) {
  if (S.scenes.length >= MAX_SCENES) { toast(T.sceneMax); return null; }
  const tpl = $('rsSceneTpl').content.firstElementChild.cloneNode(true);
  const sc = { id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random()), el: tpl, text: '', b: '', words: '', deep: '',
    emotion: null, emotionHow: null, measured: [], dialog: [], talk: { history: [], answers: 0, open: false, busy: false }, thing: null, thingNote: '', sound: { url: null, prompt: '', volume: 0.5 }, preview: null };
  S.scenes.push(sc);
  const q = (sel) => tpl.querySelector(sel);
  // labels
  q('.l-a').textContent = T.a; q('.l-b').textContent = T.b; q('.l-words').textContent = T.words; q('.l-deep').textContent = T.deep;
  q('.f-text').placeholder = T.aPh; q('.f-b').placeholder = T.bPh; q('.f-words').placeholder = T.wordsPh; q('.f-deep').placeholder = T.deepPh;
  q('.rule').textContent = T.rule;
  q('.t-emotion').textContent = T.emotion; q('.t-thing').textContent = T.thing; q('.t-sound').textContent = T.sound;
  q('.b-talk').textContent = T.talk; q('.b-manual').textContent = T.manual; q('.t-send').textContent = T.send; q('.t-done').textContent = T.done; q('.f-answer').placeholder = T.answerPh;
  q('.b-thing').textContent = T.thingMake; q('.b-thing-again').textContent = T.again; q('.b-thing-drop').textContent = T.thingDrop;
  q('.b-sound-draft').textContent = T.soundDraft; q('.b-sound-gen').textContent = T.soundGen; q('.b-sound-clear').textContent = T.soundClear; q('.f-sound-prompt').placeholder = T.soundPh;
  q('.up').title = T.up; q('.down').title = T.down; q('.del').title = T.del; q('.first-tag').textContent = T.first;
  status(q('.s-emotion'), T.emotionNone); status(q('.s-thing'), T.thingNone); status(q('.s-sound'), '');

  // the four parts
  const meter = () => {
    const t = sc.text.trim(), n = t.replace(/\s+/g, ' ').length, sn = sentences(t).length;
    q('.chars').textContent = T.chars(n); q('.sents').textContent = T.sents(sn);
    const off = t.length > 0 && (n < MIN_CHARS || n > MAX_CHARS || sn < MIN_SENT || sn > MAX_SENT);
    q('.rs-meter').classList.toggle('off', off);
  };
  q('.f-text').addEventListener('input', (e) => { sc.text = e.target.value; meter(); check(); });
  q('.f-b').addEventListener('input', (e) => { sc.b = e.target.value; q('.chars-b').textContent = T.chars(e.target.value.trim().replace(/\s+/g, ' ').length); });
  q('.f-words').addEventListener('input', (e) => { sc.words = e.target.value; });
  q('.f-deep').addEventListener('input', (e) => { sc.deep = e.target.value; });
  meter();

  // order
  q('.up').addEventListener('click', () => move(sc, -1));
  q('.down').addEventListener('click', () => move(sc, 1));
  q('.del').addEventListener('click', () => remove(sc));

  // emotion: the talk
  const talkBox = q('.rs-talk'), talkLines = q('.rs-talk-lines'), answer = q('.f-answer'), sendBtn = q('.t-send'), doneBtn = q('.t-done'), axesBox = q('.rs-axes'), sEmotion = q('.s-emotion');
  async function say(text, cls) {
    const p = document.createElement('p'); p.className = 'rs-line ' + cls;
    const who = document.createElement('span'); who.className = 'who'; who.textContent = cls === 'other' ? T.anotherMe : '';
    const body = document.createElement('span'); p.appendChild(who); p.appendChild(body); talkLines.appendChild(p);
    if (cls === 'other') await typeText(body, text, { per: 34 }); else body.textContent = text;
    talkLines.scrollTop = talkLines.scrollHeight;
    return p;
  }
  function rhythm() { const n = sc.talk.answers; return n <= 0 ? 'open' : n === 1 ? 'surge' : n === 2 ? 'lull' : 'closing'; }
  async function ask(userInput) {
    try {
      const resp = await sb().functions.invoke('dialog-turn-record', { body: { userInput, history: sc.talk.history.slice(-12), lang: LANG, rhythm: rhythm(), turn: sc.talk.answers + 1 } });
      const reply = resp && !resp.error && resp.data && resp.data.ok !== false && String(resp.data.reply || '').trim();
      return reply || null;
    } catch (e) { console.warn('[record-space] talk', e); return null; }
  }
  function showAxes() {
    axesBox.innerHTML = ''; axesBox.hidden = false;
    const v = sc.emotion || {};
    const order = AXES.slice().sort((a, b) => (v[b] || 0) - (v[a] || 0));
    for (const k of order) {
      const row = document.createElement('label'); row.className = 'rs-axis' + ((v[k] || 0) > 0 ? ' on' : '');
      const name = document.createElement('span'); name.className = 'name'; name.textContent = AXIS[k] || k;
      const range = document.createElement('input'); range.type = 'range'; range.min = 0; range.max = 100; range.step = 1; range.value = Math.round((v[k] || 0) * 100);
      const val = document.createElement('span'); val.className = 'val'; val.textContent = ((v[k] || 0)).toFixed(2);
      range.addEventListener('input', () => {
        const x = Number(range.value) / 100; sc.emotion = sc.emotion || {}; if (x > 0) sc.emotion[k] = +x.toFixed(2); else delete sc.emotion[k];
        val.textContent = x.toFixed(2); row.classList.toggle('on', x > 0);
        if (sc.emotionHow !== 'manual') sc.emotionHow = 'talk+hand';
        const any = Object.keys(sc.emotion).length > 0;
        status(sEmotion, !any ? T.emotionEmpty : sc.emotionHow === 'manual' ? T.emotionManual : T.emotionDone(sc.talk.answers) + ' · ' + T.emotionManual, any ? 'ok' : 'warn');
        check();
      });
      row.appendChild(name); row.appendChild(range); row.appendChild(val); axesBox.appendChild(row);
    }
  }
  async function openTalk() {
    if (sc.talk.busy) return;
    if (sc.text.trim().length < 8) { status(sEmotion, T.talkNeedText, 'warn'); return; }
    sc.talk = { history: [], answers: 0, open: true, busy: true }; sc.measured = []; sc.dialog = [];
    talkLines.innerHTML = ''; talkBox.hidden = false; axesBox.hidden = true; doneBtn.hidden = true; q('.rs-row-btns.e').hidden = true;
    status(sEmotion, '……', 'wait');
    const text = sc.text.trim();
    const [m, reply] = await Promise.all([measure(text), ask(text)]);
    if (m) sc.measured.push(m);
    sc.talk.history.push({ role: 'user', content: text }); sc.dialog.push({ role: 'user', content: text });
    if (!reply) { sc.talk.busy = false; status(sEmotion, T.talkFail, 'warn'); talkBox.hidden = true; q('.rs-row-btns.e').hidden = false; if (m) { sc.emotion = meanVec(sc.measured); sc.emotionHow = 'text'; showAxes(); status(sEmotion, T.emotionDone(0), 'ok'); check(); } return; }
    sc.talk.history.push({ role: 'assistant', content: reply }); sc.dialog.push({ role: 'assistant', content: reply });
    await say(reply, 'other');
    sc.talk.busy = false; answer.disabled = false; answer.focus();
  }
  async function send() {
    const a = answer.value.trim(); if (!a || sc.talk.busy) return;
    const c = detectCrisis(a);
    if (c && (c.level === 'high' || c.level === 'mid')) { answer.value = ''; await say(T.crisis, 'other'); return; }
    sc.talk.busy = true; answer.value = ''; answer.disabled = true;
    await say(a, 'me');
    sc.talk.answers++; sc.talk.history.push({ role: 'user', content: a }); sc.dialog.push({ role: 'user', content: a });
    const closing = sc.talk.answers >= TALK_MAX;
    const [m, reply] = await Promise.all([measure(a), closing ? Promise.resolve(T.talkClosing) : ask(a)]);
    if (m) sc.measured.push(m);
    if (reply) { sc.talk.history.push({ role: 'assistant', content: reply }); sc.dialog.push({ role: 'assistant', content: reply }); await say(reply, 'other'); }
    sc.talk.busy = false;
    if (sc.talk.answers >= TALK_MIN) doneBtn.hidden = false;
    if (closing) return done();
    answer.disabled = false; answer.focus();
  }
  function done() {
    if (sc.talk.busy) return;
    sc.talk.open = false; answer.disabled = true; talkBox.hidden = true; q('.rs-row-btns.e').hidden = false;
    sc.emotion = meanVec(sc.measured); sc.emotionHow = 'talk';
    if (!Object.keys(sc.emotion).length) status(sEmotion, T.emotionEmpty, 'warn'); else status(sEmotion, T.emotionDone(sc.talk.answers), 'ok');
    q('.b-talk').textContent = T.again;
    showAxes(); check();
  }
  q('.b-talk').addEventListener('click', openTalk);
  q('.b-manual').addEventListener('click', () => { sc.emotion = sc.emotion || {}; sc.emotionHow = sc.emotionHow || 'manual'; talkBox.hidden = true; showAxes(); status(sEmotion, Object.keys(sc.emotion).length ? (sc.emotionHow === 'manual' ? T.emotionManual : T.emotionDone(sc.talk.answers) + ' · ' + T.emotionManual) : T.emotionEmpty, Object.keys(sc.emotion).length ? 'ok' : 'warn'); check(); });
  sendBtn.addEventListener('click', send);
  answer.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  doneBtn.addEventListener('click', done);

  // the thing
  const canvas = q('.rs-preview'), note = q('.rs-thing-note'), sThing = q('.s-thing'), bThing = q('.b-thing'), bAgain = q('.b-thing-again'), bDrop = q('.b-thing-drop');
  async function makeThing(avoid) {
    if (sc.text.trim().length < 8) { status(sThing, T.talkNeedText, 'warn'); return; }
    bThing.disabled = true; bAgain.disabled = true; status(sThing, T.thingWait, 'wait');
    try {
      const resp = await sb().functions.invoke('generate-scene-thing', { body: { sceneText: sc.text.trim(), b: lines(sc.b), words: splitList(sc.words), deep: splitList(sc.deep), lang: LANG, avoid: avoid || '' } });
      const recipe = resp && !resp.error && resp.data && resp.data.ok && resp.data.recipe;
      if (!recipe) throw new Error((resp && resp.data && resp.data.error) || (resp && resp.error && resp.error.message) || 'no recipe');
      sc.preview = sc.preview || createPreview(canvas);
      canvas.hidden = false;
      if (!sc.preview.show(recipe)) throw new Error('nothing drawable');
      sc.thing = recipe; sc.thingNote = recipe.note || '';
      note.textContent = sc.thingNote; status(sThing, `${recipe.parts.length}`, 'ok');
      bAgain.hidden = false; bDrop.hidden = false; bThing.hidden = true;
    } catch (e) { console.warn('[record-space] thing', e); status(sThing, T.thingFail, 'warn'); }
    bThing.disabled = false; bAgain.disabled = false;
  }
  bThing.addEventListener('click', () => makeThing(''));
  bAgain.addEventListener('click', () => makeThing(sc.thingNote));
  bDrop.addEventListener('click', () => { sc.thing = null; sc.thingNote = ''; if (sc.preview) sc.preview.clear(); canvas.hidden = true; note.textContent = ''; status(sThing, T.thingNone); bAgain.hidden = true; bDrop.hidden = true; bThing.hidden = false; });

  // the sound (the admin's two steps: a draft sentence from the text, then the sound from the sentence)
  const prompt = q('.f-sound-prompt'), audio = q('.rs-audio'), sSound = q('.s-sound'), bDraft = q('.b-sound-draft'), bGen = q('.b-sound-gen'), bClear = q('.b-sound-clear');
  prompt.addEventListener('input', () => { sc.sound.prompt = prompt.value; });
  bDraft.addEventListener('click', async () => {
    if (sc.text.trim().length < 8) { status(sSound, T.talkNeedText, 'warn'); return; }
    bDraft.disabled = true; status(sSound, T.soundWait, 'wait');
    try {
      const resp = await sb().functions.invoke('generate-scene-sound', { body: { mode: 'draft', sceneText: sc.text.trim(), motifs: splitList(sc.words).slice(0, 6) } });
      if (!resp || resp.error || !resp.data || resp.data.error || !resp.data.prompt) throw new Error((resp && resp.data && resp.data.error) || 'draft');
      sc.sound.prompt = resp.data.prompt; prompt.value = sc.sound.prompt; prompt.hidden = false; bGen.hidden = false; status(sSound, '', null);
    } catch (e) { console.warn('[record-space] sound draft', e); status(sSound, T.soundFail, 'warn'); prompt.hidden = false; bGen.hidden = false; }
    bDraft.disabled = false;
  });
  bGen.addEventListener('click', async () => {
    const p = prompt.value.trim(); if (!p) { prompt.focus(); return; }
    bGen.disabled = true; bDraft.disabled = true; status(sSound, T.soundGenWait, 'wait');
    try {
      const resp = await sb().functions.invoke('generate-scene-sound', { body: { mode: 'generate', prompt: p, sceneId: 'record-space-' + sc.id } });
      const url = resp && !resp.error && resp.data && resp.data.soundUrl;
      if (!url) throw new Error((resp && resp.data && resp.data.error) || 'generate');
      sc.sound.url = url; sc.sound.prompt = p; audio.src = url; audio.hidden = false; bClear.hidden = false; status(sSound, T.soundDone, 'ok');
    } catch (e) { console.warn('[record-space] sound', e); status(sSound, T.soundFail, 'warn'); }
    bGen.disabled = false; bDraft.disabled = false;
  });
  bClear.addEventListener('click', () => { sc.sound.url = null; audio.pause(); audio.removeAttribute('src'); audio.hidden = true; bClear.hidden = true; status(sSound, '', null); });

  $('rsScenes').appendChild(tpl);
  if (init) restoreInto(init);
  renumber(); check();
  tpl.classList.add('in'); requestAnimationFrame(() => tpl.classList.add('on'));
  return sc;

  // a draft scene back into this card (261124 — the talk itself is not reopened: its lines and readings are kept)
  function restoreInto(d) {
    sc.text = d.text || ''; sc.b = d.b || ''; sc.words = d.words || ''; sc.deep = d.deep || '';
    q('.f-text').value = sc.text; q('.f-b').value = sc.b; q('.f-words').value = sc.words; q('.f-deep').value = sc.deep;
    q('.chars-b').textContent = T.chars(sc.b.trim().replace(/\s+/g, ' ').length);
    meter();
    sc.measured = Array.isArray(d.measured) ? d.measured : []; sc.dialog = Array.isArray(d.dialog) ? d.dialog : [];
    sc.talk.answers = Number(d.talkAnswers) || 0;
    if (d.emotion && Object.keys(d.emotion).length) {
      sc.emotion = d.emotion; sc.emotionHow = d.emotionHow || 'manual';
      showAxes();
      status(sEmotion, sc.emotionHow === 'manual' ? T.emotionManual : sc.emotionHow === 'auto' ? T.emotionAuto : T.emotionDone(sc.talk.answers), 'ok');
      if (sc.talk.answers) q('.b-talk').textContent = T.again;
    }
    if (d.thing) {
      try {
        sc.preview = sc.preview || createPreview(canvas); canvas.hidden = false;
        if (sc.preview.show(d.thing)) {
          sc.thing = d.thing; sc.thingNote = d.thingNote || ''; note.textContent = sc.thingNote;
          status(sThing, `${(d.thing.parts || []).length}`, 'ok'); bAgain.hidden = false; bDrop.hidden = false; bThing.hidden = true;
        } else canvas.hidden = true;
      } catch (e) { console.warn('[record-space] draft thing', e); canvas.hidden = true; }
    }
    if (d.sound) {
      sc.sound.volume = d.sound.volume != null ? d.sound.volume : 0.5;
      if (d.sound.prompt) { sc.sound.prompt = d.sound.prompt; prompt.value = d.sound.prompt; prompt.hidden = false; bGen.hidden = false; }
      if (d.sound.url) { sc.sound.url = d.sound.url; audio.src = d.sound.url; audio.hidden = false; bClear.hidden = false; status(sSound, T.soundDone, 'ok'); }
    }
  }
}
function move(sc, d) {
  const i = S.scenes.indexOf(sc), j = i + d; if (i < 0 || j < 0 || j >= S.scenes.length) return;
  S.scenes.splice(i, 1); S.scenes.splice(j, 0, sc);
  const host = $('rsScenes'); host.insertBefore(sc.el, d < 0 ? S.scenes[j + 1].el : S.scenes[j - 1].el.nextSibling);
  renumber(); sc.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function remove(sc) {
  const i = S.scenes.indexOf(sc); if (i < 0) return;
  sc.el.classList.remove('on'); setTimeout(() => { sc.el.remove(); }, 900);
  S.scenes.splice(i, 1); renumber(); check();
}
function renumber() {
  S.scenes.forEach((sc, i) => { sc.el.querySelector('.n').textContent = String(i + 1); sc.el.classList.toggle('first', i === 0); sc.el.querySelector('.up').disabled = i === 0; sc.el.querySelector('.down').disabled = i === S.scenes.length - 1; });
  $('rsOrderLine').textContent = S.scenes.length ? T.orderLine(S.scenes.length) : '';
  $('rsAddScene').disabled = S.scenes.length >= MAX_SCENES;
}
/** May it go up? The note under the button says what is still missing. */
function check() {
  const btn = $('rsPublish'), note = $('rsPublishNote');
  const missing = [];
  if (!S.title.trim()) missing.push(T.needTitle);
  if (!S.scenes.length) missing.push(T.needScene);
  const noText = S.scenes.map((s, i) => (s.text.trim() ? null : i + 1)).filter(Boolean);
  if (noText.length) missing.push(T.needText(noText));
  const noEmo = S.scenes.map((s, i) => (s.text.trim() && (!s.emotion || !Object.keys(s.emotion).length) ? i + 1 : null)).filter(Boolean);
  if (noEmo.length) missing.push(T.needEmotion(noEmo));
  btn.disabled = missing.length > 0 || S.busy;
  note.textContent = missing.join(' · ');
}

// ── two ways to make it (261128, author) ─────────────────────────────────────
// By hand, as before — or a short story put in, and a first draft taken from it (draft-memory-from-story): the scenes'
// first and second parts, the words afloat and the lines buried, all of them the story's own sentences, and each scene's
// emotion read from its text so that the draft can go up once it has been corrected. The author corrects everything after.
function setWay(way) {
  $('rsWayHand').classList.toggle('on', way !== 'story'); $('rsWayStory').classList.toggle('on', way === 'story');
  $('rsStoryBox').hidden = way !== 'story';
}
function storyChars() { $('rsStoryChars').textContent = T.storyChars($('rsStoryText').value.trim().length); }
async function storyDraft() {
  const story = $('rsStoryText').value.trim(), st = $('rsStoryStatus'), btn = $('rsStoryGo');
  if (story.length < 400) { status(st, T.storyShort, 'warn'); return; }
  if (story.length > 60000) { status(st, T.storyLong, 'warn'); return; }
  if (S.scenes.some((s) => (s.text + s.b + s.words + s.deep).trim())) {
    const c = await askSheet(T.storyReplaceAsk, [{ id: 'yes', label: T.storyReplaceYes, primary: true }, { id: 'no', label: T.storyReplaceNo }]);
    if (c !== 'yes') return;
  }
  btn.disabled = true; status(st, T.storyWait, 'wait');
  try {
    const resp = await sb().functions.invoke('draft-memory-from-story', { body: { story, lang: LANG, max: MAX_SCENES } });
    const d = resp && resp.data;
    if (!resp || resp.error || !d || !d.ok || !Array.isArray(d.scenes) || !d.scenes.length) throw new Error((d && d.error) || (resp && resp.error && resp.error.message) || 'draft');
    status(st, T.storyReading, 'wait');
    const emos = await Promise.all(d.scenes.map((s) => measure(String(s.text) + ' ' + (s.b || []).join(' ')).catch(() => null)));
    for (const sc of S.scenes.slice()) sc.el.remove();
    S.scenes.length = 0;
    if (!S.title.trim() && d.title) { S.title = String(d.title).slice(0, 60); $('rsMemTitle').value = S.title; }
    if (!S.desc.trim() && d.line) { S.desc = String(d.line).slice(0, 120); $('rsMemDesc').value = S.desc; }
    d.scenes.slice(0, MAX_SCENES).forEach((s, i) => addScene({ text: String(s.text || ''), b: (s.b || []).join('\n'), words: (s.words || []).join(', '), deep: (s.deep || []).join(', '), emotion: emos[i] || null, emotionHow: 'auto' }));
    S.source = story;
    renumber(); check();
    status(st, T.storyDone(S.scenes.length), 'ok');
    console.info('[record-space] story draft', { scenes: S.scenes.length, taken_out: d.taken_out });
    if (S.scenes[0]) S.scenes[0].el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { console.warn('[record-space] story draft', e); status(st, T.storyFail, 'warn'); }
  btn.disabled = false;
}

// ── the sheet before it goes up, and the sealing ─────────────────────────────
function payload() {
  return {
    lang: LANG, title: S.title.trim(), description: S.desc.trim(),
    scenes: S.scenes.filter((s) => s.text.trim()).map((s) => ({
      text: s.text.trim(), b: lines(s.b), words: splitList(s.words), deep: splitList(s.deep),
      emotion: s.emotion || {}, thing: s.thing || null, sound_url: s.sound.url || null, sound_volume: s.sound.volume,
      dialog: s.dialog.slice(0, 40), measured: s.measured.slice(0, 12),
    })),
    consent: { public: true, walks: true, order: true, thread: true, at: new Date().toISOString() },
    pen_name: penName(),
    client: { startedAt: S.startedAt, test: TEST },
  };
}
function openConsent() {
  const sh = $('rsConsent'); sh.hidden = false; requestAnimationFrame(() => sh.classList.add('on'));
  $('rsConsentCheck').checked = false; $('rsPenNote').textContent = ''; goable();
  if (!$('rsPen').value.trim()) lastPenName().then((n) => { if (n && !$('rsPen').value.trim()) { $('rsPen').value = n; goable(); } });
}
// 261124 (docs/아카이브_사람칸_결정-261124.md): the pen name the ARCHIVE shelf shows. Last one used is offered again.
const penName = () => $('rsPen').value.replace(/\s+/g, ' ').trim().slice(0, 20);
function goable() { $('rsConsentGo').disabled = !($('rsConsentCheck').checked && penName()); }
async function lastPenName() {
  try { const n = localStorage.getItem('tem_pen_name:' + (ME || 'anon')); if (n) return n; } catch (_) {}
  if (!ME || TEST) return '';
  try {
    const { data: rows } = await sb().from('memories').select('meta, created_at').eq('curator_id', ME).order('created_at', { ascending: false }).limit(10);
    for (const r of rows || []) { const n = r && r.meta && r.meta.space_record && r.meta.space_record.pen_name; if (n) return String(n); }
  } catch (_) {}
  return '';
}
function closeConsent() { const sh = $('rsConsent'); sh.classList.remove('on'); setTimeout(() => { sh.hidden = true; }, 900); }
async function seal() {
  if (S.busy) return; S.busy = true; check();
  closeConsent();
  const veil = $('rsVeil'), line = $('rsVeilLine');
  veil.classList.add('on'); await wait(1400);
  await typeText(line, T.sealing, { per: 60 });
  const body = payload();
  if (TEST) { console.info('[record-space] test payload', body); await wait(900); await typeText(line, T.testNote, { per: 30 }); await wait(2600); veil.classList.remove('on'); S.busy = false; check(); return; }
  try {
    const resp = await sb().functions.invoke('record-space-seal', { body });
    const d = resp && resp.data;
    if (!resp || resp.error || !d || !d.ok) throw new Error((d && d.error) || (resp && resp.error && resp.error.message) || 'seal');
    try { localStorage.setItem('tem_first_play:' + d.memoryId, String(Date.now())); localStorage.setItem('tem_space_record:' + d.memoryId, S.title.trim()); localStorage.setItem('tem_pen_name:' + (ME || 'anon'), body.pen_name); } catch (_) {}
    console.info('[record-space] sealed', d);
    if (S.source && ME) {                                                    // the story the draft was taken from: kept in memory_sources (only the owner reads it), for the editing tool
      try { const r = await sb().from('memory_sources').insert({ memory_id: d.memoryId, owner_id: ME, text: S.source }); if (r.error) console.warn('[record-space] source', r.error.message); } catch (e) { console.warn('[record-space] source', e); }
    }
    dropDraft();
    await typeText(line, T.sealed, { per: 60 });
    $('rsVeilNote').textContent = d.thread ? T.thread : T.noThread;
    await wait(2800);
    location.href = `space-blank.html?memory=${encodeURIComponent(d.memoryId)}&lang=${encodeURIComponent(LANG)}&from=record`;   // 261124 작가: 만든 사람도 다른 관객과 같은 판(빈 자리) — 원래 우주 화면이 아님
  } catch (e) {
    console.error('[record-space] seal failed', e);
    const isId = /pen name is login id/.test(String(e && e.message));
    await typeText(line, /login required/.test(String(e && e.message)) ? T.needLogin : isId ? T.penIsId : T.sealFail, { per: 40 }); await wait(2600);
    veil.classList.remove('on'); S.busy = false; check();
    if (isId) { openConsent(); $('rsPenNote').textContent = T.penIsId; $('rsPen').focus(); }
  }
}

// ── draft and leaving (261124, author: "임시저장 하시겠습니까? 물어봐 주고, 실제로 임시저장 기능도") ──────────────
// The draft lives on the server (public.record_drafts — one row per account, only that account can read or write it;
// supabase/migrations/20261124000200_record_drafts.sql) and, as a fallback, in this browser (localStorage). The newer
// of the two is the one offered back. Practice mode (?test=1) keeps it in the browser only.
// What is kept: title, line, and every card as written — its four parts, the emotion bars and how they were set, the
// talk's lines and readings (the talk is not reopened), the sculpture recipe, the sound sentence and the made sound's address.
let ME = null;                                   // the signed-in account id (null in practice mode)
let leaving = false;
const draftKey = () => 'tem_record_draft:' + (ME || (TEST ? 'practice' : 'anon'));
const hasWriting = () => !!(S.title.trim() || S.desc.trim() || S.scenes.some((s) => (s.text + s.b + s.words + s.deep).trim()));
const isDraft = (d) => !!(d && d.v === 1 && Array.isArray(d.scenes));
function draftNow() {
  return { v: 1, savedAt: new Date().toISOString(), lang: LANG, title: S.title, desc: S.desc, source: S.source || '',
    scenes: S.scenes.map((s) => ({ text: s.text, b: s.b, words: s.words, deep: s.deep, emotion: s.emotion, emotionHow: s.emotionHow,
      measured: s.measured.slice(0, 12), dialog: s.dialog.slice(0, 40), talkAnswers: s.talk.answers, thing: s.thing, thingNote: s.thingNote,
      sound: { url: s.sound.url, prompt: s.sound.prompt, volume: s.sound.volume } })) };
}
/** @returns 'server' (saved there, and here) | 'local' (here only) | null (nowhere) */
async function saveDraft() {
  const d = draftNow();
  let local = false;
  try { localStorage.setItem(draftKey(), JSON.stringify(d)); local = true; } catch (e) { console.warn('[record-space] draft local', e); }
  if (!ME) return local ? 'local' : null;
  try {
    const { error } = await sb().from('record_drafts').upsert({ user_id: ME, payload: d, updated_at: d.savedAt }, { onConflict: 'user_id' });
    if (error) throw error;
    return 'server';
  } catch (e) { console.warn('[record-space] draft server', e); return local ? 'local' : null; }
}
async function readDraft() {
  let local = null, server = null;
  try { const d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); if (isDraft(d)) local = d; } catch (_) { /* none */ }
  if (ME) {
    try { const { data, error } = await sb().from('record_drafts').select('payload').eq('user_id', ME).maybeSingle(); if (!error && data && isDraft(data.payload)) server = data.payload; } catch (e) { console.warn('[record-space] draft read', e); }
  }
  if (local && server) return String(local.savedAt) > String(server.savedAt) ? local : server;
  return server || local;
}
async function dropDraft() {
  try { localStorage.removeItem(draftKey()); } catch (_) { /* none */ }
  if (ME) { try { await sb().from('record_drafts').delete().eq('user_id', ME); } catch (e) { console.warn('[record-space] draft drop', e); } }
}
const savedNote = (r) => (r === 'server' ? T.draftSaved : r === 'local' ? T.draftLocalOnly : T.draftSaveFail);
/** A small sheet with a typed question and buttons. Resolves with the chosen id (null if closed by Escape). */
function askSheet(question, buttons) {
  return new Promise((resolve) => {
    const sh = document.createElement('div'); sh.className = 'rs-sheet rs-ask';
    const box = document.createElement('div'); box.className = 'rs-sheet-box';
    const qEl = document.createElement('p'); qEl.className = 'rs-ask-q';
    const row = document.createElement('div'); row.className = 'rs-sheet-btns';
    const finish = (v) => { document.removeEventListener('keydown', onKey); sh.classList.remove('on'); setTimeout(() => sh.remove(), 700); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') finish(null); };
    for (const b of buttons) { const el = document.createElement('button'); el.type = 'button'; el.className = b.primary ? 'rp-btn rs-primary' : 'rs-small'; el.textContent = b.label; el.addEventListener('click', () => finish(b.id)); row.appendChild(el); }
    box.appendChild(qEl); box.appendChild(row); sh.appendChild(box); document.body.appendChild(sh);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => sh.classList.add('on'));
    typeText(qEl, question, { per: 30 });
  });
}
/** Back to the main menu, past the opening (the flag js/app/bindEvents.js reads once). */
function goMenu() {
  leaving = true;
  try { sessionStorage.setItem('tem_menu_after_ending', '1'); } catch (_) { /* none */ }
  location.href = './';
}
async function leave() {
  if (S.busy) return;
  if (!hasWriting()) return goMenu();
  const c = await askSheet(T.leaveAsk, [{ id: 'save', label: T.leaveSave, primary: true }, { id: 'drop', label: T.leaveNoSave }, { id: 'stay', label: T.leaveStay }]);
  if (c === 'save') { const r = await saveDraft(); if (!r) { toast(T.draftSaveFail); return; } if (r === 'local') { toast(T.draftLocalOnly); await wait(1600); } return goMenu(); }
  if (c === 'drop') return goMenu();
}
function draftDate(iso) {
  try { return new Date(iso).toLocaleString(ko ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; }
}

// ── the login gate (261124) ─────────────────────────────────────────────────
async function signedIn() {
  try { const { data } = await sb().auth.getSession(); return !!(data && data.session); } catch (_) { return false; }
}
async function showGate() {
  for (const el of $('rs').children) if (!el.classList.contains('rs-head')) el.hidden = true;
  const back = 'record-space.html' + location.search;
  const go = document.createElement('a');
  go.className = 'rp-btn rs-primary rs-gate-go';
  go.href = './?action=login&next=' + encodeURIComponent(back);   // the site root, not index.html (some servers answer /index.html empty)
  go.textContent = T.gateGo;
  // the main page reads its language from tem_language (js/lib/i18n.js) and falls back to English: carry this page's
  // language over only when none was ever chosen, so the sign-in form speaks the same language as this gate
  go.addEventListener('click', () => { try { if (!localStorage.getItem('tem_language')) localStorage.setItem('tem_language', LANG); sessionStorage.setItem('tem_menu_after_ending', '1'); } catch (_) { /* none */ } });   // 261124: the sign-in form over the menu, not over the opening (the opening's threads flashed behind it)
  const row = document.createElement('div'); row.className = 'rs-actions rs-gate'; row.appendChild(go);
  $('rs').appendChild(row);
  $('rsVeil').classList.remove('on');
  await wait(600);
  await typeText($('rsKicker'), T.kicker, { per: 34 });
  await typeText($('rsTitle'), T.title, { per: 70 });
  await typeText($('rsLead'), T.gate, { per: 22 });
  $('rs').classList.add('on');
}

// ── boot ────────────────────────────────────────────────────────────────────
async function boot() {
  document.documentElement.lang = LANG;
  document.title = ko ? 'TEM — 기억 만들기' : 'TEM — make a memory';
  $('rsLabelTitle').textContent = T.memTitle; $('rsLabelDesc').textContent = T.memDesc;
  $('rsMemTitle').placeholder = T.phTitle; $('rsMemDesc').placeholder = T.phDesc;
  $('rsAddScene').textContent = T.addScene; $('rsPublish').textContent = T.publish;
  $('rsLeave').textContent = T.leave; $('rsLeave').addEventListener('click', leave);
  $('rsDraft').textContent = T.draftSave; $('rsDraft').addEventListener('click', async () => { const btn = $('rsDraft'); btn.disabled = true; toast(savedNote(await saveDraft())); btn.disabled = false; });
  $('rsConsentTitle').textContent = T.consentTitle;
  const ul = $('rsConsentList'); ul.innerHTML = ''; for (const c of T.consent) { const li = document.createElement('li'); li.textContent = c; ul.appendChild(li); }
  $('rsConsentCheckLabel').textContent = T.consentCheck; $('rsConsentGo').textContent = T.consentGo; $('rsConsentNo').textContent = T.consentNo;
  if (TEST) $('rsTestTag').textContent = ko ? '연습 — 저장하지 않음' : 'practice — nothing is saved';

  $('rsWayHand').textContent = T.wayHand; $('rsWayStory').textContent = T.wayStory; $('rsStoryText').placeholder = T.storyPh; $('rsStoryGo').textContent = T.storyGo; $('rsStoryNote').textContent = T.storyNote;
  $('rsWayHand').addEventListener('click', () => setWay('hand')); $('rsWayStory').addEventListener('click', () => { setWay('story'); $('rsStoryText').focus(); });
  $('rsStoryText').addEventListener('input', storyChars); $('rsStoryGo').addEventListener('click', storyDraft); storyChars();
  $('rsMemTitle').addEventListener('input', (e) => { S.title = e.target.value; check(); });
  $('rsMemDesc').addEventListener('input', (e) => { S.desc = e.target.value; });
  $('rsAddScene').addEventListener('click', () => { const sc = addScene(); if (sc) { sc.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); sc.el.querySelector('.f-text').focus(); } });
  $('rsPublish').addEventListener('click', () => { check(); if (!$('rsPublish').disabled) openConsent(); });
  $('rsConsentCheck').addEventListener('change', goable);
  $('rsPen').addEventListener('input', () => { $('rsPenNote').textContent = ''; goable(); });
  $('rsPenLabel').textContent = T.penLabel; $('rsPen').placeholder = T.penPh;
  $('rsConsentGo').addEventListener('click', seal);
  $('rsConsentNo').addEventListener('click', closeConsent);
  window.addEventListener('beforeunload', (e) => { if (!leaving && !S.busy && (S.title.trim() || S.scenes.some((s) => s.text.trim()))) { e.preventDefault(); e.returnValue = ''; } });

  // 261124: making a memory needs a login (the seal refuses without one). Practice mode (?test=1) saves nothing and skips it.
  if (!TEST && !(await signedIn())) { $('rsDraft').hidden = true; await showGate(); return; }
  try { const { data } = await sb().auth.getSession(); ME = (data && data.session && data.session.user && data.session.user.id) || null; } catch (_) { ME = null; }

  $('rsVeil').classList.remove('on');
  await wait(600);
  await typeText($('rsKicker'), T.kicker, { per: 34 });
  await typeText($('rsTitle'), T.title, { per: 70 });
  await typeText($('rsLead'), T.lead, { per: 18 });
  $('rs').classList.add('on');
  const draft = await readDraft();
  let resumed = false;
  if (draft && (draft.title || draft.scenes.length)) {
    const c = await askSheet(T.draftAsk((draft.title || '').trim(), draftDate(draft.savedAt)), [{ id: 'resume', label: T.draftResume, primary: true }, { id: 'new', label: T.draftNew }]);
    if (c === 'resume') {
      S.title = draft.title || ''; S.desc = draft.desc || ''; $('rsMemTitle').value = S.title; $('rsMemDesc').value = S.desc;
      if (draft.source) { S.source = String(draft.source); $('rsStoryText').value = S.source; storyChars(); setWay('story'); }
      for (const d of draft.scenes.slice(0, MAX_SCENES)) addScene(d);
      resumed = S.scenes.length > 0;
    } else if (c === 'new') await dropDraft();
  }
  if (!resumed) addScene();
  check();
  window.__recordSpace = { S, addScene, payload, saveDraft, readDraft, dropDraft, storyDraft };           // automation / inspection hook
}
boot();

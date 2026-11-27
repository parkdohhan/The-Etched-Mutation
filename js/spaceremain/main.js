/**
 * Words that remain — orchestrator (2026-11-28, branch space-remain). A PREVIEW of a changed play, on the space stage.
 * Record: docs/우주무대_남는말_실험-261128.md.   The space stage's own files (js/spaceplay/) are imported, not edited.
 *
 *   a consent sheet + one line of notice + three blanks → [ a scene's two parts, and after each as many exchanges as the
 *   walker wants; the scene answers short of the facts, stops halfway, and asks back once at most → a way and a door ]* → the ending: everything the walker said
 *   lights up; the walker-before-entering (the blanks) chooses which lines remain; each takes the place of one sentence
 *   of the text; the pieces can be looked at, with what the next person will read → the door is shut for good; from
 *   outside only the piece's description is seen, as it now is.
 *
 * Nothing is written to the database — no ledger row, no journal, no absorbed line, no contact. What a walk leaves is
 * kept in this browser (remain.js). The memory in the archive is not altered.
 *
 * URL: ?memory=<uuid|code> (default UNDW-001) · ?lang=ko|en · ?rig=0
 *      ?next=1   walk as the next person (reads what the walks before left; the lock does not hold them)
 *      ?reset=1  forget everything this browser kept for this memory
 *      ?pick=random  which lines remain is left to chance (the author's first idea) instead of to the blanks
 *      ?told=0   without the stage's one line at the door (the consent sheet stays)
 *      ?ask=0    the scene never asks back (as it is, it asks once a scene at most)
 *      ?prologue=1  the fall before the first scene (off here: it is not what this preview is about)
 *      trying it out: ?fast=4 · ?dry=1 (the server is not asked: made-up readings, a fixed answer) · ?at=end (a made-up walk, the ending only)
 */
import * as data from '../roomplay/data.js';
import { createEngine, parseEmotion, resonanceOf } from '../roomplay/engine.js';
import { createRoom, typeText, sentences, closed, setTypeVoice } from '../roomplay/room.js?v=261124a';
import { rigOf, riggedDoor } from '../roomplay/rig.js';
import { createCosmos } from '../spaceplay/cosmos.js?v=261123d';
import { isSilent } from '../spaceplay/things.js?v=261123c';
import { accumulate, placeNext, TOPO } from '../spaceplay/topo.js';
import { lazyStarMap } from '../spaceplay/starmap.js?v=261124b';
import { runPrologue } from '../spaceplay/prologue.js?v=261124c';
import { createEscMenu } from '../spaceplay/escmenu.js?v=261126a';
import { createTypeVoice } from '../spaceplay/typevoice.js?v=261124a';
import * as remain from './remain.js?v=261128c';
import { runEnding, showOutside } from './ending.js?v=261128c';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const FAST = Math.max(1, Math.min(8, Number(qs.get('fast')) || 1));
const DRY = qs.get('dry') === '1';
const AT = qs.get('at') || '';
const NEXT = qs.get('next') === '1';
const PICK_RANDOM = qs.get('pick') === 'random';
const TOLD = qs.get('told') !== '0';
const LANG = (qs.get('lang') || sessionStorage.getItem('tem_archive_lang') || 'ko').slice(0, 2) === 'en' ? 'en' : 'ko';
const ko = LANG !== 'en';
const DEFAULT_MEMORY = 'UNDW-001';
// staging values (free parameters)
const DOOR_DIST = 26, ARRIVE_DIST = 24, FOOT_DROP = 1.15;
const ASK_BACK = qs.get('ask') !== '0';        // ?ask=0 = the scene never asks back at all
const MAX_TURNS = 4;                        // exchanges a walker may have after each part of a scene (the first is asked for, the rest are theirs)

const wait = (ms) => new Promise((r) => setTimeout(r, ms / FAST));
const veilEl = $('rpVeil');
function veil(on) { veilEl.classList.toggle('clear', !on); return new Promise((r) => setTimeout(r, 2300 / Math.min(FAST, 3))); }
function toast(msg) { const t = $('rpToast'); typeText(t, msg, { per: 30 }); t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 6000); }
function hint(msg, ms) { const h = $('rpHint'); clearTimeout(hint._t); if (!msg) { h.classList.remove('on'); return; } typeText(h, msg, { per: 30 }); h.classList.add('on'); hint._t = setTimeout(() => h.classList.remove('on'), ms || 9000); }
function guide(rows, ms) {
  let g = $('spGuide'); if (!g) { g = document.createElement('div'); g.id = 'spGuide'; g.setAttribute('aria-live', 'polite'); document.body.appendChild(g); }
  g.innerHTML = ''; for (const [k, t] of rows) { const r = document.createElement('div'); r.className = 'row'; const a = document.createElement('span'); a.className = 'k'; a.textContent = k; const b = document.createElement('span'); b.className = 't'; b.textContent = t; r.appendChild(a); r.appendChild(b); g.appendChild(r); }
  requestAnimationFrame(() => g.classList.add('on'));
  clearTimeout(guide._t); guide._t = setTimeout(() => g.classList.remove('on'), ms || 12000);
}
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function seeded(seed) { let a = Math.floor(hashStr(seed) * 4294967296) >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const run = {
  id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
  memory: null, scenes: [], engine: null, acc: null,
  visited: new Set(), arrived: new Set(),
  said: new Map(), asked: new Map(), readings: new Map(), returns: new Map(),
  Q: new Map(), place: new Map(), doors: new Map(),
  path: [], legs: [],
  // this preview's own
  lines: [],                                // everything the walker said: { order, sceneId, raw, emo, question, silentScene, whom, back } (whom · back come a little later: remain-turn "judge")
  story: [],                                // the walk as one text: [{ sceneId, order, items: [{ kind: 'text', part, si, t } | { kind: 'mine', li, t }] }]
  read: new Map(),                          // scene id → the sentences of its text as this walker read them
  placed: new Map(),                        // line index → the server's seam for it
  known: new Map(),                         // scene id → all of the scene the walker was given (both parts), for the reading of their lines
  judging: [],                              // readings on their way
  consent: null,
  shift: new Map(),                         // scene id → [x,y,z] a changed piece's move
  blanks: [], beforeP: null, before: null,
  here: null, pending: null, last: null, contact: false, ghosts: [], rows: [], crossing: false, busy: false, ended: false,
  startedAt: Date.now(),
};
let state = null, baseTexts = {}, walkSlot = 0;
window.__remain = { run, get state() { return state; } };       // automation / inspection hook

let cosmos, talk, map, air, pause, typeVoice, letGo = false, endPick = null;
const letGoMark = () => { letGo = true; };
const V3 = (a) => new window.THREE.Vector3(a[0], a[1], a[2]);
const sceneById = (id) => run.scenes.find((s) => s.id === id);
const sceneByOrder = (n) => run.scenes.find((s) => s.scene_order === n);
const textRead = (scene) => remain.textOf({ texts: baseTexts }, scene);      // what THIS walker reads: the text as the walks before left it

// ── sound: a scene's sound belongs to that scene alone (the space stage's rule, unchanged) ──
const SOUND_FULL = 13, SOUND_REACH = 42;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const soundOf = (scene) => { const m = scene.meta || {}; return { url: m.sound_url || null, vol: m.sound_volume != null ? Number(m.sound_volume) : 0.5 }; };
function createAir() {
  const chans = new Map();
  let focusId = null, hushed = false, master = 1, last = performance.now();
  function make(scene) {
    const s = soundOf(scene); if (!s.url) return null;
    const el = new Audio(); el.loop = true; el.preload = 'auto'; el.volume = 0; el.src = s.url;
    const c = { o: scene.scene_order, el, url: s.url, base: s.vol, level: 0, target: 0, retry: 0 };
    chans.set(scene.id, c);
    return c;
  }
  const play = (c, now) => { if (now < c.retry) return; c.retry = now + 600; const p = c.el.play(); if (p && p.catch) p.catch(() => {}); };
  (function tick() {
    requestAnimationFrame(tick);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    for (const c of chans.values()) {
      if (hushed) c.target = 0;
      c.level += (c.target - c.level) * (1 - Math.exp(-dt / (c.target > c.level ? 1.4 : hushed ? 0.22 : 0.6)));
      if (c.target < 0.002 && c.level < 0.004) c.level = 0;
      const v = Math.max(0, Math.min(1, c.level * c.base * master)); if (Math.abs(c.el.volume - v) > 0.002) c.el.volume = v;
      if (c.level > 0 && c.el.paused) play(c, now);
      else if (c.level === 0 && !c.el.paused) c.el.pause();
    }
  })();
  const kick = () => { const now = performance.now(); for (const c of chans.values()) if (c.level > 0 && c.el.paused) play(c, now); };
  window.addEventListener('pointerdown', kick); window.addEventListener('keydown', kick);
  return {
    hear(scene, d) {
      let t;
      if (hushed) t = 0;
      else if (focusId === scene.id) t = 1;
      else { const rad = Number(scene.meta && scene.meta.sound_radius) || 15, reach = SOUND_REACH * Math.max(0.6, Math.min(1.4, rad / 15)), k = 1 - smooth(SOUND_FULL, reach, d); t = k * k; }
      const c = chans.get(scene.id) || (t > 0.001 ? make(scene) : null);
      if (c) c.target = t;
    },
    focus(scene) { focusId = scene ? scene.id : null; if (!scene) return false; const c = chans.get(scene.id) || make(scene); if (c) c.target = 1; return !!c; },
    hush(on) { hushed = !!on; },
    fade() { hushed = true; },
    setMaster(v) { master = Math.max(0, Math.min(1, Number(v))); if (isNaN(master)) master = 1; },
  };
}

// ── the second part of a scene (the space stage's rule, unchanged) ──────────────
function pieceLines(scene) {
  const sp = scene.meta && scene.meta.space;
  if (sp && (Array.isArray(sp.words) || Array.isArray(sp.deep))) return { words: (sp.words || []).map((t) => String(t).trim()).filter(Boolean), deep: (sp.deep || []).map((t) => String(t).trim()).filter(Boolean) };
  const props = (scene.meta && scene.meta.piece && Array.isArray(scene.meta.piece.props)) ? scene.meta.piece.props : [];
  const words = props.filter((p) => p && p.kind === 'word' && p.text).map((p) => String(p.text).trim());
  const deep = props.filter((p) => p && (p.kind === 'buried' || (p.kind === 'object' && p.role === 'speaking')) && p.text).map((p) => String(p.text).trim());
  return { words, deep };
}
function partB(scene) {
  const own = scene.meta && scene.meta.space && scene.meta.space.b;
  if (Array.isArray(own) && own.length) return { lines: own.map(String).filter((l) => l.trim()), left: null };
  if (typeof own === 'string' && own.trim()) return { lines: sentences(own), left: null };
  const { words, deep } = pieceLines(scene), n = Math.max(0, 5 - deep.length);
  return { lines: words.slice(0, n).concat(deep).slice(0, 5), left: words.slice(n) };
}

// ── the form of what was said (the space stage's surface rule) ─────────────────
const Q_INDEF = /(누군가|누구든|어딘가|어디선가|어디든|언젠가|무언가|뭔가|왠지|어쩐지|아무)/g;
const Q_WORD = /(누구|누가|누굴|왜|어디|언제|무엇|무얼|뭐|뭘|뭔|어떻게|어째서|무슨|얼마|몇|어느)/;
const Q_END = /[까니냐나가지죠요어아야데래대]$/;
function isQuestion(text) {
  const s = String(text || '').trim();
  if (/[?？]/.test(s)) return true;
  if (!ko) return /^(who|whom|whose|what|when|where|why|how|which|did|do|does|was|were|is|are|am|can|could|would|will|should|have|has|had)\b/i.test(s);
  const core = s.replace(/[.!…~\s]+$/g, '').replace(Q_INDEF, '');
  return Q_WORD.test(core) && Q_END.test(core);
}
const WEAK = new Set(['나는', '내가', '나도', '나를', '그냥', '그건', '그게', '그때', '이건', '이게', '정말', '너무', '아주', '조금', '있다', '있었다', '없다', '없었다', '했다', '한다', '같다', '같았다', '그리고', '그런데', '하지만', '그래서', '것', '것이', '것을', '거야', '그', '이', '저', '왜', '뭐', '어디', '누가', '누구', '언제', 'the', 'and', 'that', 'this', 'was', 'were', 'have', 'with', 'what', 'who', 'why', 'how']);
function strongWords(text) {
  const ws = String(text || '').split(/[\s.,!?…"'“”‘’·\-—()]+/).filter((w) => w.length >= 2 && !WEAK.has(w.toLowerCase()));
  return ws.map((w, i) => ({ w, i })).sort((a, b) => (b.w.length - a.w.length) || (a.i - b.i)).slice(0, 2).sort((a, b) => a.i - b.i).map((x) => x.w);
}

// ── the lines that are not crossed (the space stage's, unchanged) ───────────────
const CRISIS = ['자살', '죽고싶', '죽고 싶', '죽이', '죽일', '자해', '베다', '베고', '뛰어내리', '목매', '약 먹',
  'kill myself', 'suicide', 'self harm', 'self-harm', 'want to die', 'wanna die', 'end my life', 'end it all',
  'hurt myself', 'cut myself', "don't want to live", 'dont want to live', 'don’t want to live', 'no reason to live', 'overdose', 'jump off'];
const hasCrisis = (t) => { const l = String(t || '').toLowerCase(); return CRISIS.some((k) => l.includes(k)); };
function guard(raw) {
  const S = window.LumenSafety, c = S && S.detectCrisis ? S.detectCrisis(raw) : { level: 'safe' };
  if (c.level === 'high') return { ok: false, help: true };
  if (hasCrisis(raw)) return { ok: false, help: false };
  return { ok: true };
}
function sendable(raw) {
  const S = window.LumenSafety;
  if (!S || typeof S.safetyForAbsorb !== 'function') return false;      // without the filter nothing is sent
  const v = S.safetyForAbsorb(String(raw).slice(0, 100));
  return !!(v && v.ok);
}
const helpLine = () => { const S = window.LumenSafety; return (S && S.getSafetyResources ? S.getSafetyResources(LANG) : []).map((r) => r.name + ' ' + r.number).join(' · '); };
const SHARP = ko ? '……아냐, 이건 너무 날카로워.' : '……no. this one cuts too sharp.';

/** The server's three jobs (supabase/functions/remain-turn). It keeps nothing. */
async function remainCall(body) {
  try {
    const r = await data.client().functions.invoke('remain-turn', { body: Object.assign({ lang: LANG }, body) });
    if (r.error || !r.data || !r.data.ok) { console.warn('[remain] ' + body.mode, (r.data && (r.data.reason || r.data.error)) || (r.error && r.error.message)); return null; }
    return r.data;
  } catch (e) { console.warn('[remain] ' + body.mode, e); return null; }
}
/**
 * The scene's answer: from inside its text, short of the facts, stopped halfway. It asks nothing back — except when `ask` is
 * set, which the stage does once a scene at most (author, 261128 night: "asking the walker every single time is not it").
 */
async function replyOf(sceneText, raw, history, ask) {
  if (DRY) return ko ? (ask ? '기억이 흐릿해. 너는 그게 누구 때문이었다고 봐?' : '기억이 흐릿해. 거기까지는 아직 들여다보지 못했어.') : (ask ? 'It is hazy. Whose doing do you think it was?' : 'It is hazy. I have not looked that far yet.');
  const r = await remainCall({ mode: 'turn', title: run.memory.title || '', sceneText, userInput: String(raw).slice(0, 500), history, ask: !!ask });
  const text = r && typeof r.reply === 'string' ? r.reply.trim() : '';
  if (!text) return '';
  if (hasCrisis(text) || /https?:\/\//i.test(text)) { console.warn('[remain] a reply was held back'); return ''; }
  let out = '';                                                           // whole sentences while they fit; what runs past is not shown
  for (const sn of sentences(text.replace(/\s+/g, ' '))) { if (out && out.length + 1 + sn.length > 150) break; out = out ? out + ' ' + sn : sn; }
  return out.slice(0, 190);
}
/** A text read on the memory's axes (the stage's own classifier call). */
async function measure(raw, context) {
  if (DRY) {
    const o = {}; run.engine.axes.forEach((k, i) => { o[k] = +(0.15 + 0.7 * hashStr(raw + k + i)).toFixed(3); });
    return { base: o, reason_analysis: { is_void: false } };
  }
  return data.analyzeEmotion(raw, run.engine.axes, context);
}

// ── the text column ────────────────────────────────────────────────────────────
function createTalk() {
  const root = $('rpRoom'), room = createRoom(root, LANG, 1 / FAST), box = root.querySelector('.rp-input');
  /** @param o { more?: the walker has already spoken here — they may go on, or move on · allowSilence? } → { text } | { silent } | { on } */
  function ask(o) {
    box.innerHTML = '';
    const g = document.createElement('div'); g.className = 'rp-guide';
    typeText(g, o && o.more ? (ko ? '더 말하거나, 더 물을 수 있습니다.' : 'You may say more, or ask more.') : (ko ? '떠오르는 것을 말하거나, 물을 수 있습니다.' : 'Say what comes back to you, or ask.'), { per: 30 });
    const write = document.createElement('div'); write.className = 'sp-write';
    const field = document.createElement('input'); field.type = 'text'; field.maxLength = 90; field.autocomplete = 'off'; field.spellcheck = false; field.setAttribute('aria-label', ko ? '하는 말' : 'your line');
    const send = document.createElement('button'); send.className = 'rp-send'; send.type = 'button'; send.textContent = '↵'; send.setAttribute('aria-label', ko ? '보내기' : 'send');
    write.append(field, send); box.append(g, write);
    let side = null;
    if (o && (o.more || o.allowSilence)) { side = document.createElement('button'); side.type = 'button'; side.className = 'rp-silent'; side.textContent = o.more ? (ko ? '넘어간다' : 'move on') : (ko ? '말없이 있는다' : 'stay silent'); box.appendChild(side); }
    box.classList.add('on');
    setTimeout(() => { if (!('ontouchstart' in window)) field.focus(); }, 300);
    return new Promise((resolve) => {
      const done = (v) => { box.classList.remove('on'); setTimeout(() => { if (!box.classList.contains('on')) box.innerHTML = ''; }, 900); resolve(v); };
      const submit = () => { const text = field.value.trim(); if (!text) { field.focus(); return; } done({ text }); };
      send.addEventListener('click', submit);
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) submit(); });
      if (side) side.addEventListener('click', () => done(o.more ? { on: true } : { silent: true }));
    });
  }
  return Object.assign({}, room, { ask });
}

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  document.documentElement.lang = LANG;
  const ref = qs.get('memory') || DEFAULT_MEMORY;
  const line = $('spEntryLine');
  let loaded;
  try { loaded = await data.loadMemory(ref); } catch (e) { line.textContent = ko ? '기억을 불러오지 못했습니다.' : 'The memory could not be loaded.'; veil(false); console.error(e); return; }
  run.memory = loaded.memory; run.scenes = loaded.scenes;
  if (!run.scenes.length) { line.textContent = ko ? '이 기억에는 장면이 없습니다.' : 'This memory has no scenes.'; veil(false); return; }
  document.title = 'TEM — ' + (run.memory.title || '') + (ko ? ' (남는 말 · 미리보기)' : ' (words that remain · preview)');

  if (qs.get('reset') === '1') { remain.clear(run.memory.code); qs.delete('reset'); history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '')); }
  state = remain.load(run.memory.code) || remain.fresh(run.memory.code);
  if (state.locked && !NEXT && !AT) return outside();                     // the door is shut: only what the piece now is, from outside

  baseTexts = Object.assign({}, state.texts); walkSlot = state.walks.length;
  run.engine = createEngine(run.scenes, { frame: qs.get('frame') });
  [run.ghosts, run.rows] = await Promise.all([data.loadGhostLines(run.memory.id), loadLedger(run.memory.id)]);
  { const rg = rigOf(run.memory, qs), n = rg && Number(rg.ghost_min_len); if (n > 0) run.ghosts = run.ghosts.filter((g) => String(g.utterance).trim().length >= n); }
  run.acc = accumulate(run.scenes, run.rows, run.engine.axes, [data.TEST_PERSONA]);
  try { await Promise.race([document.fonts.load('300 64px "Noto Serif KR"', '기억'), new Promise((r) => setTimeout(r, 2500))]); } catch (_) {}

  air = createAir();
  typeVoice = createTypeVoice(); setTypeVoice(typeVoice.tap);
  talk = createTalk();
  cosmos = createCosmos({ canvas: $('spCosmos'), memoryCode: run.memory.code, speed: FAST, on: { onNear, onFrame, onLand, onRelease: () => { $('rpWalk').textContent = ko ? '날기' : 'fly'; }, onLock: (l) => $('spAim').classList.toggle('on', l), onEscape: () => { if (pause && !run.ended) { letGoMark(); pause.open(); } } } });
  map = lazyStarMap({ wrap: $('spMapWrap'), canvas: $('spMap'), memoryCode: run.memory.code, onPick: (id) => (run.ended ? (endPick && endPick(id)) : returnBy(id)), onOpen: () => cosmos.unlock(), onClose: () => { if (cosmos.mode() === 'fly') cosmos.relock(); } });
  $('rpWalk').textContent = ko ? '날기' : 'fly';
  pause = createEscMenu({ ko, setVolume: (v) => { air.setMaster(v); cosmos.setVolume(v); typeVoice.setVolume(v); }, busy: () => map.isOpen(),
    onOpen: () => { if (cosmos.locked()) cosmos.unlock(); else cosmos.hold(letGo); },
    onClose: (byHand) => { letGo = false; if (byHand && (cosmos.mode() === 'fly' || cosmos.mode() === 'walk') && !map.isOpen()) cosmos.relock(); },
    onLeave: leave });
  Object.assign(window.__remain, { cosmos, talk, map, air, finish, pause, skip });
  setupFlyButton();
  window.addEventListener('contextmenu', (e) => { if (pause && pause.isOpen()) return; e.preventDefault(); if (run.ended || run.busy || run.crossing) return; if (map.isOpen()) map.close(); else if (cosmos.mode() === 'fly') map.open(); });
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !/^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '') && cosmos.mode() === 'fly') map.toggle(); });

  const first = firstScene();
  const begin = async () => {
    $('spEntry').classList.add('gone');
    cosmos.ensureAudio();
    if (!AT && qs.get('prologue') === '1') {
      try { run.prologue = await runPrologue({ cosmos, run, data, lang: LANG, fast: FAST, hint, auto: false, onDark: () => map.make() }); }
      catch (e) { console.error('[remain] prologue', e); cosmos.setCine(null); cosmos.setMode('held'); $('spCosmos').classList.remove('on'); }
    }
    map.make();
    const has = air.focus(first);
    await wait(has ? 2600 : 900);
    if (AT === 'end') return fakeWalk().then(finish);
    try { const res = await stay(first, { dark: true }); run.firstRes = res; run.firstLeft = res.left; }
    catch (e) { console.error('[remain] first stay', e); run.busy = false; talk.hide(); toast(ko ? '첫 장면을 읽지 못했습니다' : 'The first scene could not be read'); return; }
    await openEyes(first);
  };

  veil(false);
  if (AT) { run.blanks = remain.blanksFor(run.memory.code, LANG).map((l, i) => ({ line: l, answer: ko ? ['내가 겁이 나서', '불을 켜 두고 잤다', '엄마'][i] : ['I was afraid', 'slept with the light on', 'my mother'][i] })); readBefore(); return begin(); }
  await entry();
  begin();
}
async function loadLedger(memoryId) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await data.client().from('plays').select('run_id, scene_id, created_at, persona_id, alignment, user_emotion').eq('memory_id', memoryId).not('run_id', 'is', null).order('created_at').range(from, from + 999);
    if (r.error) { console.warn('[remain] ledger', r.error); break; }
    out.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) break;
  }
  return out;
}
function firstScene() {
  const rig = rigOf(run.memory, qs);
  return (rig && run.scenes.find((s) => s.scene_order === rig.spine[0])) || run.scenes[0];
}

// ── before entering: one notice, three blanks ──────────────────────────────
async function entry() {
  const line = $('spEntryLine'), box = $('srBlanks'), btn = $('spEnter'), note = $('spEntryNote');
  await wait(900);
  await consent();
  if (TOLD) { await typeText(line, ko ? '여기서 한 말은 남는다.\n한 번뿐이다.' : 'What you say here stays.\nThere is only this once.', { per: 80, pace: 1 / FAST }); await wait(2200); }
  typeText(note, NEXT ? (ko ? '미리보기 — 다음 사람으로 걷습니다' : 'preview — walking as the next person') : (ko ? '미리보기 — 이 브라우저에만 남습니다' : 'preview — kept in this browser only'), { per: 30 });
  const blanks = remain.blanksFor(run.memory.code, LANG);
  box.classList.add('on');
  for (let i = 0; i < blanks.length; i++) {
    const [a, b] = blanks[i].split(remain.HOLE);
    const row = document.createElement('p'); row.className = 'sr-blank';
    const sa = document.createElement('span'), inp = document.createElement('input'), sb = document.createElement('span');
    inp.type = 'text'; inp.maxLength = 40; inp.autocomplete = 'off'; inp.spellcheck = false; inp.className = 'sr-hole'; inp.setAttribute('aria-label', ko ? '빈 자리' : 'the blank');
    row.append(sa, inp, sb); box.appendChild(row);
    requestAnimationFrame(() => row.classList.add('on'));
    await typeText(sa, a || '', { per: 55, pace: 1 / FAST });
    sb.textContent = b || '';
    if (!('ontouchstart' in window)) inp.focus();
    const answer = await new Promise((resolve) => {
      inp.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        const v = inp.value.trim(); if (!v) return;
        const g = guard(v);
        if (!g.ok) { inp.value = ''; note.textContent = SHARP + (g.help && helpLine() ? '  ' + helpLine() : ''); return; }
        resolve(v);
      });
    });
    inp.readOnly = true; inp.blur(); row.classList.add('done'); inp.style.width = Math.max(3, answer.length * 1.05 + 1) + 'em';
    run.blanks.push({ line: blanks[i], answer });
    await wait(700);
  }
  readBefore();
  btn.textContent = ko ? '들어간다' : 'go in'; btn.disabled = false; btn.focus();
  await new Promise((resolve) => btn.addEventListener('click', () => { if (btn.disabled) return; btn.disabled = true; resolve(); }, { once: true }));
}
/**
 * One sheet before anything is written (author, 261128: "consent — go"). Plain, in the page's own voice, not the stage's.
 * What it says is what the piece does to what the walker says. Agreeing is recorded with the walk; going back leaves nothing.
 * (The sentences are drafts — the author's to rewrite. ?told=0 takes away the stage's one line after this, never this sheet.)
 */
function consent() {
  const sheet = document.createElement('div'); sheet.id = 'srConsent';
  const h = document.createElement('p'); h.className = 'h'; h.textContent = ko ? '들어가기 전에' : 'before you go in';
  const ul = document.createElement('ul');
  const items = ko
    ? ['여기서 장면에게 한 말 가운데 몇 줄이 이 기억의 글에 남을 수 있습니다. 남은 말은 다음 사람이 읽습니다.',
       '어느 말이 남을지는 고를 수 없습니다. 남은 뒤에는 고치거나 지울 수 없습니다.',
       '이 기억에는 한 번만 들어갈 수 있습니다. 도중에 나가도 그렇습니다.',
       '들어가기 전에 적는 세 문장은 다른 사람에게 보이지 않습니다.',
       '본명·연락처처럼 누구인지 알 수 있는 것은 적지 마세요. "엄마", "그 사람"처럼 적으면 됩니다.',
       '하는 말은 대답을 만들고 읽기 위해 AI 모델에 보내집니다.']
    : ['A few of the things you say to the scenes may stay in this memory\'s text. The next person reads what stays.',
       'You cannot choose which. Once it stays, it cannot be changed or taken out.',
       'You can go into this memory once. That holds even if you leave partway.',
       'The three sentences you write before going in are shown to no one else.',
       'Do not write a real name, a number, or anything that tells who someone is. "my mother", "that person" will do.',
       'What you say is sent to an AI model, to be answered and to be read.'];
  for (const t of items) { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }
  const row = document.createElement('div'); row.className = 'row';
  const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'rp-btn'; yes.textContent = ko ? '동의하고 들어간다' : 'I agree — go in';
  const no = document.createElement('button'); no.type = 'button'; no.className = 'rp-silent'; no.textContent = ko ? '돌아간다' : 'go back';
  row.append(yes, no); sheet.append(h, ul, row);
  $('spEntry').insertBefore(sheet, $('spEntryLine'));
  requestAnimationFrame(() => sheet.classList.add('on'));
  return new Promise((resolve) => {
    no.addEventListener('click', () => { try { sessionStorage.setItem('tem_menu_after_ending', '1'); } catch (_) {} location.href = qs.get('back') || (location.protocol === 'file:' ? 'index.html' : './'); });
    yes.addEventListener('click', () => {
      run.consent = { v: 'remain_consent_v1', at: new Date().toISOString() };
      sheet.classList.remove('on');
      setTimeout(() => { sheet.remove(); resolve(); }, 1500 / FAST);
    }, { once: true });
  });
}
/** The three blanks, read with the stage's own classifier (each whole sentence, with what was written in it). Not awaited at the door. */
function readBefore() {
  run.beforeP = Promise.all(run.blanks.map((b) => {
    const whole = b.line.replace(remain.HOLE, b.answer);
    return sendable(b.answer) ? measure(whole, null).catch(() => null) : Promise.resolve(null);
  })).then((rs) => {
    run.before = remain.beforeOf(rs.map((r) => (r ? { base: parseEmotion(r.base) } : null)));
    return run.before;
  }).catch(() => (run.before = remain.beforeOf([])));
}

// ── a stay: the scene's two parts, and after each as many exchanges as the walker wants ──
async function stay(scene, o) {
  run.busy = true;
  const dark = !!(o && o.dark);
  if (!dark) {
    cosmos.setMode('held'); map.close(); hint(''); $('rpWalk').classList.remove('on');
    const r = cosmos.things.get(scene.id);
    if (r) cosmos.settle(r.pos, { dist: 10.5, side: innerWidth < 760 ? 0 : (hashStr(scene.id + 'side') < 0.5 ? -1 : 1), ms: 2200 });
  }
  run.visited.add(scene.id);
  if (run.path[run.path.length - 1] !== scene.id) run.path.push(scene.id);
  const silent = isSilent(scene), text = textRead(scene);
  const A = silent ? [] : sentences(text).map(closed), pb = silent ? { lines: [], left: [] } : partB(scene);
  const parts = [A, pb.lines].filter((p) => p.length), known = A.concat(pb.lines).join(' ');
  run.read.set(scene.id, A); run.known.set(scene.id, known);
  const firstLine = run.lines.length;
  const entry = { sceneId: scene.id, order: scene.scene_order, items: [] }; run.story.push(entry);
  const shown = [], emos = [], history = [];
  let anyVoid = 0, lastAlign = run.last ? run.last.turnAlignment : 0.5, lastReply = '', turnsHere = 0;
  talk.clear(); talk.show();
  if (!dark) await wait(1500);

  /** One exchange. Returns false when the walker moved on (or stayed silent). */
  const exchange = async (opts) => {
    let answer;
    for (;;) {
      answer = await talk.ask(opts);
      if (answer.silent || answer.on) return false;
      const g = guard(answer.text);
      if (g.ok) break;
      await talk.say(SHARP, 'rp-narr', { gap: true });
      if (g.help && helpLine()) await talk.say(helpLine(), 'rp-narr', {});
    }
    const raw = answer.text, question = isQuestion(raw), ok = sendable(raw);
    await talk.say(raw, 'rp-mine', { gap: true, hold: 400 });
    talk.waiting(true);
    const [an, rep] = await Promise.all([
      measure(raw, { scene_text: shown.join(' ').slice(-400), ghost_line: (lastReply || shown[shown.length - 1] || '').slice(0, 200) }),
      (ok && !silent) ? replyOf(known, raw, history.slice(), !!(opts && opts.ask)) : Promise.resolve(''),
    ]);
    talk.waiting(false);
    let emo = null, ra = null;
    if (an) {
      emo = parseEmotion(an.base); ra = an.reason_analysis || null;
      const a = run.engine.alignmentTo(scene, emo);
      if (a > 0) lastAlign = a;
      emos.push(emo); if (ra && ra.is_void) anyVoid++;
    }
    if (rep) { await talk.say(rep, 'rp-ghost', { gap: true, hold: 900 }); history.push({ role: 'user', content: raw }, { role: 'assistant', content: rep }); lastReply = rep; }
    if (!run.said.has(scene.id)) run.said.set(scene.id, []);
    run.said.get(scene.id).push(raw);
    if (question) { if (!run.asked.has(scene.id)) run.asked.set(scene.id, []); run.asked.get(scene.id).push(raw); }
    // a line that was not sent (abuse, an instruction to the model) is not kept either: it cannot remain
    if (ok) { run.lines.push({ order: scene.scene_order, sceneId: scene.id, raw, emo, question, silentScene: silent }); entry.items.push({ kind: 'mine', li: run.lines.length - 1, t: raw }); }
    turnsHere++;
    return true;
  };

  if (silent) {
    shown.push('…'); entry.items.push({ kind: 'text', part: 'a', si: -1, t: '…' });
    await talk.say('…', 'rp-void', { hold: 2600 });
    await exchange({ allowSilence: true });
  } else {
    for (let i = 0; i < parts.length; i++) {
      await talk.sayAll(parts[i], '', { gap: i > 0 });
      shown.push(...parts[i]);
      parts[i].forEach((l, k) => entry.items.push({ kind: 'text', part: parts[i] === A ? 'a' : 'b', si: parts[i] === A ? k : -1, t: l }));
      // the scene asks back once at most: at the walker's first line after the whole of it has been read
      for (let t = 0; t < MAX_TURNS; t++) { if (!(await exchange({ more: t > 0, ask: ASK_BACK && i === parts.length - 1 && t === 0 }))) break; }
    }
  }

  // the whole stay, read once: the mean of its lines, one engine step (the space stage's rule)
  const mean = remain.meanObj(emos), userVoid = emos.length > 0 && anyVoid === emos.length;
  let alignment = lastAlign, eng = null;
  if (emos.length) { const a = run.engine.alignmentTo(scene, mean); alignment = a > 0 ? a : lastAlign; eng = run.engine.step(scene, mean, userVoid); run.readings.set(scene.id, mean); }
  else if (turnsHere) toast(ko ? '감정 측정에 실패했습니다 — 이 걸음은 직전 결로 이어집니다' : 'The reading failed — this step follows the last one');
  const resonance = resonanceOf(alignment);
  const pattern = eng ? eng.transition_pattern : (!turnsHere ? (silent ? 'echo_follow' : 'avoidance') : ((run.last && run.last.pattern) || 'bridge'));
  run.last = { pattern, alignment: eng ? eng.alignment_score : (!turnsHere && silent ? 0.7 : 0.4), bucket: eng ? eng.alignment_bucket : 'MID', turnAlignment: alignment };

  // contact — a rare event, once per run: a line someone left is heard (shown only; nothing is recorded here)
  if (turnsHere && resonance === 'resonance' && !run.contact && !silent) {
    run.contact = true;
    const g = nearestGhost(mean, run.ghosts), name = scene.meta && scene.meta.ghost_name;
    if (g) await talk.say(g.utterance, 'rp-ghost', { gap: true, src: name ? '— ' + name : (ko ? '— 누군가 여기 두고 간 말' : '— something someone left here'), hold: 1800 });
  }

  const rig = rigOf(run.memory, qs);
  let next = rig ? riggedDoor({ rig, engine: run.engine, scenes: run.scenes, origin: scene, pattern, userEmotion: mean, isVoid: userVoid, visited: run.visited })
                 : run.engine.pickNext({ origin: scene, pattern, userEmotion: mean, isVoid: userVoid, visited: run.visited });
  if (next.mode === 'same') next = Object.assign(run.engine.pickNext({ origin: scene, pattern: 'bridge', userEmotion: mean, isVoid: userVoid, visited: run.visited }), { was: 'same' });

  persist(false);                                                          // from the first line said, the door is shut — whether or not the walk is finished
  { const mine = []; for (let i = firstLine; i < run.lines.length; i++) mine.push(i); judge(mine).then(() => persist(false)); }   // this stay's lines are read while the walker goes on; what remains is kept again when they are
  await wait(900);
  talk.hide();
  run.busy = false;
  return { scene, next, pattern, mean, left: pb.left || [] };
}
function nearestGhost(userEmotion, pool) {
  let best = null, bs = -Infinity;
  for (const g of pool) { const s = remain.cosObj(userEmotion, parseEmotion(g.emotion_vec)); if (s > bs) { bs = s; best = g; } }
  return best;
}

// ── the reading of the walker's lines (remain-turn "judge") ─────────────────────
/** Whom each line holds to account, and which blank it is about the same matter as. Never rejects; a line left unread cannot remain. */
function judge(indices) {
  if (!indices.length) return Promise.resolve();
  if (DRY) { for (const li of indices) { const l = run.lines[li]; l.whom = remain.WHOM[Math.floor(hashStr(l.raw + 'w') * 4)]; l.back = Math.floor(hashStr(l.raw + 'k') * 4) - 1; } return Promise.resolve(); }
  const blanks = run.blanks.map((b) => (sendable(b.answer) ? b.line.replace(remain.HOLE, b.answer) : ''));
  const p = remainCall({ mode: 'judge', blanks, items: indices.map((li) => ({ id: String(li), scene: run.known.get(run.lines[li].sceneId) || '', line: run.lines[li].raw })) })
    .then((r) => { for (const x of (r && r.items) || []) { const l = run.lines[Number(x.id)]; if (l) { l.whom = x.whom; l.back = x.back; } } });
  run.judging.push(p);
  return p;
}

// ── what remains (kept in this browser as the walk goes; the ending only adds the server's seam) ──
function settle(before) {
  const usable = run.lines.map((l) => (l.silentScene || l.whom === undefined || !run.read.get(l.sceneId) || !run.read.get(l.sceneId).length ? null : l));   // a line not yet read cannot remain yet
  const keep = remain.remaining(usable, before, PICK_RANDOM ? { random: seeded(run.id) } : null);
  const changes = [];
  for (const li of Array.from(keep).sort((a, b) => a - b)) {
    const l = run.lines[li], sents = run.read.get(l.sceneId);
    const p = run.placed.get(li) || remain.placeLocal(sents, l.raw);
    changes.push({ li, order: l.order, sceneId: l.sceneId, index: p.index, was: sents[p.index], now: p.text, raw: l.raw, by: p.by, blank: PICK_RANDOM ? -1 : l.back });
  }
  return { keep, changes };
}
async function persist(done) {
  if (!run.lines.length || !state) return null;
  const before = run.before || (run.beforeP ? await run.beforeP : remain.beforeOf([]));
  const s = settle(before);
  state.texts = Object.assign({}, baseTexts);
  for (const c of s.changes) state.texts[c.order] = remain.withChange(run.read.get(c.sceneId), c.index, c.now);
  state.walks[walkSlot] = { id: run.id, at: new Date().toISOString(), next: NEXT, pick: PICK_RANDOM ? 'random' : 'blanks', consent: run.consent, blanks: run.blanks, before: { read: before.read },
    lines: run.lines.map((l, i) => ({ order: l.order, raw: l.raw, kept: s.keep.has(i), whom: l.whom || null, back: l.back == null ? null : l.back })),
    changes: s.changes.map((c) => ({ order: c.order, index: c.index, was: c.was, now: c.now, raw: c.raw, by: c.by, blank: c.blank })), done: !!done };
  state.locked = true;
  remain.save(run.memory.code, state);
  return s;
}
/** The ending's call: the server names the sentence each remaining line displaces and fits the seam; then it is kept. */
async function weave() {
  const before = run.before || (run.beforeP ? await run.beforeP : remain.beforeOf([]));
  await Promise.all(run.judging);
  { const unread = []; run.lines.forEach((l, i) => { if (l.whom === undefined) unread.push(i); }); if (unread.length) await judge(unread); }   // a reading that did not come back is asked for once more
  const first = settle(before);
  if (!DRY && first.changes.length) {
    const r = await remainCall({ mode: 'weave', items: first.changes.map((c) => ({ id: String(c.li), sentences: run.read.get(c.sceneId), line: c.raw })) });
    const byId = new Map(((r && r.items) || []).map((x) => [String(x.id), x]));
    for (const c of first.changes) run.placed.set(c.li, remain.placeServer(run.read.get(c.sceneId), c.raw, byId.get(String(c.li))));
  }
  const s = await persist(true);
  run.shift = new Map();
  for (const c of (s ? s.changes : [])) run.shift.set(c.sceneId, remain.pieceShift(run.acc, c.sceneId, run.lines[c.li].emo, run.read.get(c.sceneId).length, TOPO));
  writeOutside();                                                          // what the piece now is, from outside (not waited for)
  return s || { keep: new Set(), changes: [] };
}
async function writeOutside() {
  if (DRY || !state) return;
  const of = remain.stamp(state);
  const r = await remainCall({ mode: 'outside', title: run.memory.title || '', scenes: run.scenes.filter((s) => !isSilent(s)).map((s) => ({ order: s.scene_order, text: remain.textOf(state, s) })) });
  if (r && r.intro) { state.outside = { intro: r.intro, synopsis: r.synopsis, of, at: new Date().toISOString() }; remain.save(run.memory.code, state); }
}
function leave() {
  // the walk is already kept. Out = this same page, which now shows only the outside of the piece.
  if (run.lines.length || (state && state.locked)) { const q = new URLSearchParams(); if (qs.get('memory')) q.set('memory', qs.get('memory')); if (qs.get('lang')) q.set('lang', qs.get('lang')); location.href = location.pathname + (q.toString() ? '?' + q : ''); return; }
  try { sessionStorage.setItem('tem_menu_after_ending', '1'); } catch (_) {}
  location.href = qs.get('back') || (location.protocol === 'file:' ? 'index.html' : './');
}
function outside() {
  $('spEntry').classList.add('gone'); veil(false);
  showOutside({ lang: LANG, title: run.memory.title || '', state, fallbackIntro: (run.memory.meta && run.memory.meta.gate && run.memory.meta.gate.intro) || '',
    refresh: async () => {
      if (state.outside && state.outside.of === remain.stamp(state)) return state.outside;
      const of = remain.stamp(state);
      const r = await remainCall({ mode: 'outside', title: run.memory.title || '', scenes: run.scenes.filter((s) => !isSilent(s)).map((s) => ({ order: s.scene_order, text: remain.textOf(state, s) })) });
      if (r && r.intro) { state.outside = { intro: r.intro, synopsis: r.synopsis, of, at: new Date().toISOString() }; remain.save(run.memory.code, state); }
      return state.outside;
    },
    asNext: () => { const q = new URLSearchParams(location.search); q.set('next', '1'); location.href = location.pathname + '?' + q; },
    reset: () => { const q = new URLSearchParams(location.search); q.set('reset', '1'); q.delete('next'); location.href = location.pathname + '?' + q; } });
}

// ── what floats round a thing (the space stage's, unchanged) ────────────────────
function ghostsFor(scene, n) {
  const tags = new Set(((scene.meta && scene.meta.motif_tags) || []).concat((scene.meta && scene.meta.object_tags) || []));
  const scored = run.ghosts.map((g) => ({ g, s: (Array.isArray(g.motif_tags) ? g.motif_tags : []).filter((t) => tags.has(t)).length, h: hashStr(run.id + g.id) }));
  scored.sort((a, b) => (b.s - a.s) || (a.h - b.h));
  return scored.slice(0, n).map((x) => x.g);
}
function dress(scene, left) {
  const echo = Array.isArray(scene.echo_words) ? scene.echo_words.filter((w) => w && w !== '…') : [];
  const items = echo.slice(0, 2).map((w, i) => ({ key: 'e' + i, text: w, kind: 'echo' }));
  (left || []).slice(0, 3).forEach((w, i) => items.push({ key: 'w' + i, text: w, kind: 'echo' }));
  if (!isSilent(scene)) ghostsFor(scene, 3).forEach((g) => items.push({ key: 'g' + g.id, text: g.utterance, kind: 'ghost' }));
  cosmos.addWords(scene.id, items);
}
function afterSpeech(scene, res) {
  const mine = [];
  (run.said.get(scene.id) || []).forEach((t, i) => strongWords(t).forEach((w, j) => mine.push({ key: 'm' + i + '_' + j, text: w, kind: 'mine' })));
  cosmos.addWords(scene.id, mine.slice(0, 4));
  if (res.mean && Object.keys(res.mean).length) {
    const sim = new Map(run.ghosts.map((g) => ['g' + g.id, remain.cosObj(res.mean, parseEmotion(g.emotion_vec))]));
    cosmos.leanWords(scene.id, (key) => (sim.has(key) ? Math.max(0, sim.get(key)) : 0.5));
  }
  cosmos.setAsked(scene.id, (run.asked.get(scene.id) || []).length > 0);
}

// ── eyes open ───────────────────────────────────────────────────────────────
async function openEyes(first) {
  const T = window.THREE;
  run.Q.set(first.id, [0, 0, 0]); run.arrived.add(first.id); run.here = first.id;
  const at = new T.Vector3(0, 2.6, 9.5);
  cosmos.placeThing(first, V3(run.Q.get(first.id)), at);
  cosmos.teleport(at, 0, 0); cosmos.face(V3(run.Q.get(first.id)));
  air.focus(null);
  cosmos.setMode('held'); cosmos.start();
  dress(first, run.firstLeft);
  if (run.firstRes) afterSpeech(first, run.firstRes);
  $('spCosmos').classList.add('on');
  await veil(false);
  $('spMapWrap').classList.add('on'); syncMap();
  await wait(1400);
  cosmos.setMode('fly');
  guide(cosmos.isTouch()
    ? (ko ? [['동그라미', '누르고 있으면 나아갑니다'], ['화면', '끌어서 둘러봅니다'], ['왼쪽 위 지도', '누르면 지나온 장면으로 갑니다']]
          : [['the circle', 'hold it to move'], ['the screen', 'drag to look around'], ['the map, top left', 'press it to go back to a scene']])
    : (ko ? [['W A S D', '나아갑니다'], ['화면을 누르면', '마우스로 둘러봅니다'], ['M · 마우스 오른쪽', '지도 — 지나온 장면으로 갑니다'], ['ESC', '멈춤 · 밝기 · 소리']]
          : [['W A S D', 'move'], ['click', 'then look with the mouse'], ['M · right mouse button', 'the map — go back to a scene'], ['ESC', 'pause · brightness · volume']]), 13000);
  if (cosmos.isTouch()) $('rpWalk').classList.add('on');
  if (run.firstRes) await afterStay(run.firstRes);
}

// ── after a stay: the door ──────────────────────────────────────────────────
async function afterStay(res) {
  const scene = res.scene, next = res.next;
  if (run.here === scene.id && cosmos.things.has(scene.id)) afterSpeech(scene, res);
  if (next.mode === 'end' || !next.scene) { run.busy = true; await wait(next.mode === 'end' ? 3200 : 1800); return finish(); }
  if (next.mode === 'fallback') hint(ko ? '기억의 빈틈이 다른 장면을 끌어당긴다.' : 'A gap in the memory pulls another scene toward you.', 7000);
  await wait(1500);
  raiseDoor(scene, next.scene);
}
function horiz(v, key) {
  const T = window.THREE, d = new T.Vector3(v.x, 0, v.z);
  if (d.lengthSq() < 1e-4) { const a = hashStr(key) * Math.PI * 2; d.set(Math.cos(a), 0, Math.sin(a)); }
  return d.normalize();
}
function raiseDoor(from, to) {
  if (!run.Q.has(to.id)) {
    const p = placeNext(run.acc, run.Q, from.id, to.id, run.readings.get(from.id) || null);
    run.Q.set(to.id, p.pos); run.place.set(to.id, Object.assign({ from: from.id }, p));
  }
  const Qf = V3(run.Q.get(from.id)), Qt = V3(run.Q.get(to.id)), dir = horiz(Qt.clone().sub(Qf), run.id + from.id + to.id);
  const door = Qf.clone().addScaledVector(dir, DOOR_DIST); door.y = Qf.y - FOOT_DROP;
  const old = run.doors.get(from.id); if (old && old.way.live) cosmos.removeWay(old.way);
  const way = cosmos.openWay({ door, dir, key: run.id + from.id + '>' + to.id, from: from.id, to: to.id, onPass: (w) => cross(from, to, w, null) });
  run.doors.set(from.id, { way, to: to.id });
  syncMap();
  cosmos.lookToward(way.N.clone().lerp(door, 0.5).setY(door.y + 1.2), 2800);
  return way;
}

// ── through a door ──────────────────────────────────────────────────────────
const PASS = ko
  ? { echo_follow: '따라간다.', bridge: '건너간다.', contradiction: '거슬러 간다.', displacement: '비켜 간다.', avoidance: '피해 간다.', fixation: '맴돈다.', old: '되돌아간다.' }
  : { echo_follow: 'It follows.', bridge: 'It crosses over.', contradiction: 'It turns against.', displacement: 'It slips aside.', avoidance: 'It goes around.', fixation: 'It circles.', old: 'It goes back.' };
function passWord(kind, pattern) {
  const own = (run.memory.meta && run.memory.meta.pass_words) || {};
  const key = kind === 'new' ? (pattern === 'fixation' ? 'bridge' : pattern) : 'old';
  return own[key] || PASS[key] || PASS.bridge;
}
async function cross(from, to, way, kind) {
  if (run.crossing || run.ended) return;
  run.crossing = true;
  const T = window.THREE, first = !run.arrived.has(to.id);
  kind = kind || (first ? 'new' : 'old');
  const said = kind === 'map' ? '' : passWord(kind, run.last ? run.last.pattern : 'bridge');
  hint(''); nearLine(null); map.close(); $('rpWalk').classList.remove('on');
  air.hush(true);
  const fromPos = cosmos.pl.pos.clone();
  await veil(true);
  if (kind === 'map') await wait(350);
  else {
    const pass = $('rpPass');
    await wait(400);
    await typeText(pass, said, { per: 110, pace: 1 / FAST, voice: true });
    await wait(1700);
    pass.textContent = '';
  }
  if (run.ended) return;

  const Qf = V3(run.Q.get(from.id)), Qt = V3(run.Q.get(to.id));
  const dir = from.id === to.id && way ? way.e.clone() : horiz(Qt.clone().sub(Qf), run.id + from.id + to.id);
  const X = Qt.clone().addScaledVector(dir, -ARRIVE_DIST); X.y = Qt.y - FOOT_DROP;
  cosmos.placeThing(to, Qt, X);
  cosmos.link(from.id, to.id);
  if (run.stub && run.stub.live) cosmos.removeWay(run.stub);
  if (way && way.kind === 'back' && way.live) cosmos.removeWay(way);
  run.stub = kind === 'map' ? null : cosmos.openStub({ at: X, dir, key: run.id + 'stub' + run.legs.length });
  const start = X.clone().addScaledVector(dir, 0.5).add(new T.Vector3(0, cosmos.EYE, 0));
  cosmos.carry(fromPos, start);
  cosmos.teleport(start, Math.atan2(-dir.x, -dir.z), 0);
  if (run.stub) cosmos.land(run.stub, 0.5);
  run.here = to.id; run.arrived.add(to.id); run.path.push(to.id); run.legs.push({ from: from.scene_order, to: to.scene_order, kind });
  if (first) { run.pending = to.id; dress(to, partB(to).left); }
  else if (run.visited.has(to.id)) { run.returns.set(to.id, (run.returns.get(to.id) || 0) + 1); run.returnDue = to.id; }
  syncMap();
  await veil(false);
  air.hush(false);
  if (cosmos.isTouch()) $('rpWalk').classList.add('on');
  if (run.stub && !run.walkHinted) { run.walkHinted = true; hint(cosmos.isTouch() ? (ko ? '동그라미를 누르고 있으면 걷습니다' : 'hold the circle to walk') : (ko ? 'W 로 걷습니다' : 'W to walk'), 6000); }
  run.crossing = false;
}

// ── near a thing ────────────────────────────────────────────────────────────
function onNear(id) {
  if (run.busy || run.crossing || run.ended) { const r = cosmos.things.get(id); if (r) r.armed = true; return; }
  const scene = sceneById(id); if (!scene) return;
  if (id !== run.here) {
    const from = sceneById(run.here);
    run.legs.push({ from: from ? from.scene_order : null, to: scene.scene_order, kind: 'flight' });
    run.path.push(id);
    run.here = id; if (run.visited.has(id)) { run.returns.set(id, (run.returns.get(id) || 0) + 1); run.returnDue = id; } syncMap();
  }
  if (run.pending === id) { run.pending = null; if (run.returnDue === id) run.returnDue = null; stay(scene).then((res) => { cosmos.setMode('fly'); cosmos.relock(); if (cosmos.isTouch()) $('rpWalk').classList.add('on'); return afterStay(res); })
      .catch((e) => { console.error('[remain] stay', e); run.busy = false; talk.hide(); if (!run.ended) { cosmos.setMode('fly'); run.pending = id; toast(ko ? '장면을 읽지 못했습니다 — 다시 다가가 주세요' : 'The scene could not be read — come near it again'); } });
    return; }
  if (run.returnDue === id && run.visited.has(id)) { run.returnDue = null; comeBack(scene); }
}
/** Back at a scene already read: nothing of it has changed yet (it changes when the walk is over). What the walker said there still stands by it. */
async function comeBack(scene) {
  const qsHere = run.asked.get(scene.id) || [], mineHere = run.said.get(scene.id) || [];
  const t = qsHere.length ? qsHere[qsHere.length - 1] : mineHere[mineHere.length - 1];
  if (t) await nearLine([{ t, who: 'mine' }]);
}
let nearToken = 0;
async function nearLine(lines) {
  const box = $('spNear'), token = ++nearToken;
  box.innerHTML = ''; box.classList.toggle('on', !!lines);
  if (!lines) return;
  for (const l of lines) {
    if (token !== nearToken) return;
    const p = document.createElement('p'); if (l.who !== 'text') p.className = l.who; box.appendChild(p);
    await typeText(p, l.t, { pace: 1 / FAST, voice: true });
    await wait(700);
  }
  await wait(9000);
  if (token === nearToken) { box.classList.remove('on'); box.innerHTML = ''; }
}

// ── the frame: sound by distance, the map ───────────────────────────────────
let mapTick = 0;
function onFrame(dt) {
  if (air) {
    if (run.ended) air.fade();
    else for (const r of cosmos.things.values()) air.hear(r.scene, r.pos.distanceTo(cosmos.pl.pos));
  }
  mapTick += dt;
  if (map && !run.ended && mapTick > 0.08) { mapTick = 0; map.walker(cosmos.pl.pos, cosmos.pl.yaw); }
}
function onLand() { $('rpWalk').textContent = ko ? '걷기' : 'walk'; if (run.landHinted) return; run.landHinted = true; hint(cosmos.isTouch() ? (ko ? '동그라미를 누르고 있으면 걷습니다' : 'hold the circle to walk') : (ko ? 'W 로 걷습니다' : 'W to walk'), 5000); }
function mapEdges() { const edges = []; for (let i = 1; i < run.path.length; i++) if (run.path[i] !== run.path[i - 1]) edges.push([run.path[i - 1], run.path[i]]); return edges; }
function syncMap() {
  if (!map) return;
  const nodes = Array.from(run.arrived).map((id) => ({ id, scene: sceneById(id), pos: run.Q.get(id), here: id === run.here, asked: (run.asked.get(id) || []).length > 0, stayed: run.visited.has(id) }));
  const d = run.here && run.doors.get(run.here);
  map.set(nodes, mapEdges(), d && d.way.live ? { pos: [d.way.D.x, d.way.D.y, d.way.D.z] } : null);
}
function returnBy(id) {
  if (run.busy || run.crossing || run.ended || cosmos.mode() !== 'fly') return;
  const to = sceneById(id), from = sceneById(run.here);
  if (!to || !from || id === run.here) { map.close(); return; }
  map.close();
  cross(from, to, null, 'map');
}
function setupFlyButton() {
  const b = $('rpWalk');
  const down = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} b.classList.add('down'); cosmos.setForward(true); };
  const up = () => { b.classList.remove('down'); cosmos.setForward(false); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
}

// ── the end ────────────────────────────────────────────────────────────────
/** The pieces as the ending shows them: the walker's own model, each changed piece moved by `k` (0…1) of its shift. Changed pieces glisten. */
function endMap(k) {
  const nodes = Array.from(run.arrived).map((id) => { const q = run.Q.get(id), s = run.shift.get(id) || [0, 0, 0]; return { id, scene: sceneById(id), pos: [q[0] + s[0] * k, q[1] + s[1] * k, q[2] + s[2] * k], here: run.shift.has(id), asked: false, stayed: true }; });
  map.set(nodes, mapEdges(), null);
}
/** A scene as the next person will read it: its sentences, each marked whose it is. */
function nextTextOf(sceneId) {
  const scene = sceneById(sceneId); if (!scene || isSilent(scene)) return { order: scene ? scene.scene_order : 0, lines: [{ t: '…', who: 'text' }] };
  // (a line of two sentences is read back as two sentences: each is marked)
  const mineNow = new Set(); (state.walks[walkSlot] ? state.walks[walkSlot].changes : []).forEach((c) => { if (c.order === scene.scene_order) sentences(c.now).forEach((t) => mineNow.add(t)); });
  const earlier = new Set(); state.walks.forEach((w, i) => { if (i !== walkSlot) (w.changes || []).forEach((c) => { if (c.order === scene.scene_order) sentences(c.now).forEach((t) => earlier.add(t)); }); });
  return { order: scene.scene_order, lines: sentences(remain.textOf(state, scene)).map((t) => ({ t, who: mineNow.has(t) ? 'mine' : earlier.has(t) ? 'other' : 'text' })) };
}
async function finish() {
  if (run.ended) return; run.ended = true;
  hint(''); nearLine(null); map.close(); $('spMapWrap').classList.remove('on'); $('rpWalk').classList.remove('on'); talk.hide();
  cosmos.setMode('held'); if (cosmos.unlock) cosmos.unlock();
  const weaving = weave().catch((e) => { console.error('[remain] weave', e); return persist(true).then((s) => s || { keep: new Set(), changes: [] }); });
  try {
    await runEnding({ lang: LANG, fast: FAST, title: run.memory.title || '', story: run.story, lines: run.lines, blanks: run.blanks, random: PICK_RANDOM, typeText,
      weave: () => weaving,
      pieces: {
        open() { endMap(0); $('spMapWrap').classList.add('on'); map.open(); },
        /** the changed pieces move to where they now stand — slowly */
        shift(ms) { return new Promise((res) => { const t0 = performance.now(); (function tick(now) { const k = Math.min(1, (now - t0) / ms), e = k * k * (3 - 2 * k); endMap(e); if (k < 1) requestAnimationFrame(tick); else res(); })(t0); }); },
        onPick(fn) { endPick = (id) => fn(nextTextOf(id)); },
        first: () => { const c = Array.from(run.shift.keys())[0] || run.here; return c ? nextTextOf(c) : null; },
      },
      leave });
  } catch (e) { console.error('[remain] ending', e); toast(ko ? '끝 화면을 그리지 못했습니다' : 'The ending could not be drawn'); await weaving; await wait(2500); leave(); }
}

// ── trying it out ───────────────────────────────────────────────────────────
/** ?at=end — a walk is made up (the rigged route, a few made-up lines at each scene) so the ending can be looked at. */
async function fakeWalk() {
  const rig = rigOf(run.memory, qs);
  const order = rig ? rig.spine.slice() : run.scenes.slice(0, 7).map((s) => s.scene_order);
  const seq = order.map(sceneByOrder).filter(Boolean);
  const SAY = ko ? ['왜 고개를 돌렸어?', '네 잘못은 아니잖아.', '문을 더 세게 두드렸어야지.', '누가 건 전화였어?', '받았어야지. 한 번은.', '엄마가 먼저 버린 거잖아.', '나라도 도망쳤을 거야.', '닮았다는 게 무서웠던 거지.', '알면서 안 본 거면 네가 한 거야.', '그 한 달은 누구 몫이야?', '이제 와서 무슨 소용이야.', '미안하다고는 했어?', '어쩔 수 없었던 거야.', '나도 안 받은 적 있어.']
                 : ['Why did you look away?', 'It was not your fault.', 'You should have knocked harder.', 'Who was calling?', 'You should have answered. Once.', 'She left you first.', 'I would have run too.', 'It was the likeness that frightened you.', 'If you knew and did not look, you did it.', 'Whose month was that?', 'What use is it now.', 'Did you say sorry?', 'It could not be helped.', 'I have not answered a call either.'];
  cosmos.start(); cosmos.setMode('held');
  let prev = null, n = 0;
  for (const sc of seq) {
    if (!prev) run.Q.set(sc.id, [0, 0, 0]);
    else if (!run.Q.has(sc.id)) run.Q.set(sc.id, placeNext(run.acc, run.Q, prev.id, sc.id, null).pos);
    cosmos.placeThing(sc, V3(run.Q.get(sc.id)), null); if (prev) cosmos.link(prev.id, sc.id);
    run.arrived.add(sc.id); run.visited.add(sc.id); run.path.push(sc.id);
    const silent = isSilent(sc), A = silent ? [] : sentences(textRead(sc)).map(closed), pb = silent ? { lines: [] } : partB(sc);
    run.read.set(sc.id, A); run.known.set(sc.id, A.concat(pb.lines).join(' '));
    const entry = { sceneId: sc.id, order: sc.scene_order, items: A.map((t, si) => ({ kind: 'text', part: 'a', si, t })) }; run.story.push(entry);
    const say = async (part) => { const raw = SAY[n++ % SAY.length], an = await measure(raw, { scene_text: A.join(' ') });
      run.lines.push({ order: sc.scene_order, sceneId: sc.id, raw, emo: an ? parseEmotion(an.base) : null, question: isQuestion(raw), silentScene: silent }); entry.items.push({ kind: 'mine', li: run.lines.length - 1, t: raw }); };
    if (!silent) { await say('a'); pb.lines.forEach((t) => entry.items.push({ kind: 'text', part: 'b', si: -1, t })); await say('b'); }
    prev = sc;
  }
  run.here = prev.id;
  const q = V3(run.Q.get(prev.id)); cosmos.teleport(q.clone().add(new window.THREE.Vector3(0, 0.4, 9)), 0, 0);
  $('spCosmos').classList.add('on');
  await veil(false); await wait(1200);
}
/** Automation: through the door that stands, and up to the next scene's thing. */
async function skip() {
  const d = run.here && run.doors.get(run.here); if (!d || run.busy || run.crossing) return false;
  const from = sceneById(run.here), to = sceneById(d.to);
  await cross(from, to, d.way, null);
  const r = cosmos.things.get(to.id); if (r) { cosmos.setMode('fly'); cosmos.teleport(r.pos.clone().add(new window.THREE.Vector3(0, 0.6, 4)), null, null); }   // off the short floor behind the door (a walker is held to it), then by the thing
  return true;
}

boot();

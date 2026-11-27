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
import { createCosmos } from '../spaceplay/cosmos.js?v=261128a';
import { isSilent } from '../spaceplay/things.js?v=261123c';
import { accumulate, placeNext, TOPO } from '../spaceplay/topo.js';
import { lazyStarMap } from '../spaceplay/starmap.js?v=261124b';
import { runPrologue } from '../spaceplay/prologue.js?v=261128c';
import { createEscMenu } from '../spaceplay/escmenu.js?v=261126a';
import { createTypeVoice } from '../spaceplay/typevoice.js?v=261124a';
import { packTrack } from '../spaceplay/thread.js?v=261123d';
import { isLocked } from '../roomplay/engine.js';
import { markWalked, takeGateAnswer } from '../shared/person_shelf.js?v=261128b';
import { leavesNoTrace } from '../shared/no_trace.js?v=261128a';
import { createBackDoors } from '../spaceblank/backdoor.js?v=261123b3';   // 261128 night: the back door, as the blank stage has it
import { tidyLine } from '../shared/tidy_line.js?v=261128a';   // 261128 (author: "slips of the hand like this — sift them out"): what is typed is tidied before anything is done with it
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config.js';
import * as remain from './remain.js?v=261128d';
import { runEnding, showOutside } from './ending.js?v=261128g';
import { createTutor } from './tutor.js?v=261128f';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const FAST = Math.max(1, Math.min(8, Number(qs.get('fast')) || 1));
const DRY = qs.get('dry') === '1';
const AT = qs.get('at') || '';
// Three ways of walking (261128 night, author: "put it on the site" · "a practice link that leaves no footprints" · "the one from the opening is a tutorial"):
//   audience  the real walk: the ledger is written as the space stage writes it, and what remains is kept on the server —
//             the next person, on another machine, reads it. Once.
//   tutorial  (?as=tutorial) three scenes, nothing kept anywhere, "another me" tells how it is done (tutor.js)
//   test      (?as=test) the preview as it was: nothing goes to the server; what a walk leaves is kept in this browser only
const MODE = qs.get('as') === 'test' ? 'test' : qs.get('as') === 'tutorial' ? 'tutorial' : 'audience';
const TUTOR = MODE === 'tutorial';
let KEPT = MODE === 'audience' && !AT && !DRY;
const STORE = KEPT ? remain.STORE.kept : remain.STORE.test;
// 261128 (author: "I'll make the ID june — let nothing be recorded for it"): the real walk taken under a no-trace ID.
// Walked as the real one is — the door, the blanks, the text as the server holds it, the ending — and written nowhere,
// not in this browser either, so the door never shuts. Asked once, at boot (js/shared/no_trace.js).
let FREE = false;
const NEXT = MODE === 'test' && qs.get('next') === '1';
const PLACE_TAG = 'space_v1', MOVE_PERSONA = 'piece-move', KIND = 'remain_v1';   // the ledger's marks: the space stage's place (the prologue and the models read these walks as its own), and this stage's own kind
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
  rooms: [], gate: null, opened: false, committed: null,   // the journal's stays · the archive's blank and the first scene it named · on record at the server · what the server placed
  earlier: new Map(),                       // scene order → Set(sentences of that scene's text that were walkers' words before this walk)
  blanks: [], beforeP: null, before: null,
  backs: new Map(), backLog: [],            // scene id → its back door (a door onto a scene already read); where each stood and where it gave onto
  heard: new Map(),                         // scene id → all that has passed between the walker and that scene's person (it goes with every line said on coming back)
  here: null, pending: null, last: null, contact: false, ghosts: [], rows: [], crossing: false, busy: false, ended: false,
  startedAt: Date.now(),
};
let state = null, baseTexts = {}, walkSlot = 0;
window.__remain = { run, get state() { return state; } };       // automation / inspection hook

let cosmos, talk, map, air, pause, typeVoice, tutor = null, letGo = false, endPick = null, backs = null;
const BACK_DIST = 17;                                       // the back door stands this far from the scene (staging, the blank stage's value)
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
async function replyOf(sceneText, raw, history, ask, memoryText, back) {
  if (DRY) return ko ? (ask ? '기억이 흐릿해. 너는 그게 누구 때문이었다고 봐?' : '기억이 흐릿해. 거기까지는 아직 들여다보지 못했어.') : (ask ? 'It is hazy. Whose doing do you think it was?' : 'It is hazy. I have not looked that far yet.');
  const r = await remainCall({ mode: 'turn', title: run.memory.title || '', sceneText, userInput: String(raw).slice(0, 500), history, ask: !!ask, back: !!back, memoryText: (memoryText && memoryText.light) || '' });   // what is still ahead is not sent at all: told only by rule, the answer let a later scene's clue slip (measured 261128) — it cannot tell what it does not hold
  const text = r && typeof r.reply === 'string' ? r.reply.trim() : '';
  if (!text) return '';
  if (hasCrisis(text) || /https?:\/\//i.test(text)) { console.warn('[remain] a reply was held back'); return ''; }
  let out = '';                                                           // whole sentences while they fit; what runs past is not shown
  for (const sn of sentences(text.replace(/\s+/g, ' '))) { if (out && out.length + 1 + sn.length > 150) break; out = out ? out + ' ' + sn : sn; }
  return out.slice(0, 190);
}
/**
 * Every other scene of the memory as this walker's world has it (the text the walks before left, and each scene's second
 * part) — the scene's person knows all of it (author, 261128 night: "as one who knows everything in this memory").
 */
function restOf(scene) {
  // come to light = a scene the walker has been through, or a room of the past (off the fixed route; without a route: a scene before this one).
  // Still ahead = the rest: its plain circumstances may be used, its turn is not told before its time (the server's rule).
  const rig = rigOf(run.memory, qs), spine = rig ? new Set(rig.spine) : null;
  let light = '', later = '';
  for (const sc of run.scenes) {
    if (sc.id === scene.id || isSilent(sc)) continue;
    const piece = '#' + sc.scene_order + ': ' + sentences(textRead(sc)).join(' ') + ' ' + partB(sc).lines.join(' ') + String.fromCharCode(10);
    const seen = run.visited.has(sc.id) || (spine ? !spine.has(sc.scene_order) : sc.scene_order < scene.scene_order);
    if (seen) { if (light.length + piece.length <= 8500) light += piece; }
    else if (later.length + piece.length <= 8500) later += piece;
  }
  return { light: light.trim(), later: later.trim() };
}
/** The practice walk's three scenes: the first three of the memory's fixed route, or its first three scenes. */
function practiceRoute() {
  const rig = rigOf(run.memory, qs);
  const orders = rig ? rig.spine.slice(0, 3) : run.scenes.filter((x) => !isSilent(x)).slice(0, 3).map((x) => x.scene_order);
  return orders.map(sceneByOrder).filter(Boolean);
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
    typeText(g, o && o.guide ? o.guide : o && o.more ? (ko ? '더 말하거나, 더 물을 수 있습니다.' : 'You may say more, or ask more.') : (ko ? '떠오르는 것을 말하거나, 물을 수 있습니다.' : 'Say what comes back to you, or ask.'), { per: 30 });
    const write = document.createElement('div'); write.className = 'sp-write';
    const field = document.createElement('input'); field.type = 'text'; field.maxLength = 90; field.autocomplete = 'off'; field.spellcheck = false; field.setAttribute('aria-label', ko ? '하는 말' : 'your line');
    const send = document.createElement('button'); send.className = 'rp-send'; send.type = 'button'; send.textContent = '↵'; send.setAttribute('aria-label', ko ? '보내기' : 'send');
    write.append(field, send); box.append(g, write);
    let side = null;
    if (o && (o.more || o.allowSilence)) { side = document.createElement('button'); side.type = 'button'; side.className = 'rp-silent'; side.textContent = o.side ? o.side : o.more ? (ko ? '넘어간다' : 'move on') : (ko ? '말없이 있는다' : 'stay silent'); box.appendChild(side); }
    box.classList.add('on');
    setTimeout(() => { if (!('ontouchstart' in window)) field.focus(); }, 300);
    return new Promise((resolve) => {
      const done = (v) => { box.classList.remove('on'); setTimeout(() => { if (!box.classList.contains('on')) box.innerHTML = ''; }, 900); resolve(v); };
      const submit = () => { const text = tidyLine(field.value); if (!text) { field.value = ''; field.focus(); return; } done({ text }); };   // a line of loose letters only is no line: the field is emptied and waits
      send.addEventListener('click', submit);
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) submit(); });
      if (side) side.addEventListener('click', () => done(o.more ? { on: true } : { silent: true }));
    });
  }
  return Object.assign({}, room, { ask });
}

/** The archive's one blank was typed on another page: tidied here, where it is taken up. Nothing left of it = it was not written. */
function tidyGate(g) { if (!g) return g; const text = tidyLine(g.text); return text ? Object.assign({}, g, { text }) : null; }

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  document.documentElement.lang = LANG;
  if (KEPT && await leavesNoTrace(data.client())) { FREE = true; KEPT = false; }
  const ref = qs.get('memory') || DEFAULT_MEMORY;
  const line = $('spEntryLine');
  let loaded;
  try { loaded = await data.loadMemory(ref); } catch (e) { line.textContent = ko ? '기억을 불러오지 못했습니다.' : 'The memory could not be loaded.'; veil(false); console.error(e); return; }
  run.memory = loaded.memory; run.scenes = loaded.scenes;
  if (!run.scenes.length) { line.textContent = ko ? '이 기억에는 장면이 없습니다.' : 'This memory has no scenes.'; veil(false); return; }
  document.title = 'TEM — ' + (run.memory.title || '') + (TUTOR ? (ko ? ' (연습)' : ' (practice)') : MODE === 'test' ? (ko ? ' (남는 말 · 미리보기)' : ' (words that remain · preview)') : '');

  if (MODE === 'test' && qs.get('reset') === '1') { remain.clear(run.memory.code, STORE); qs.delete('reset'); history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '')); }
  state = (TUTOR || FREE) ? remain.fresh(run.memory.code) : (remain.load(run.memory.code, STORE) || remain.fresh(run.memory.code));
  if (KEPT || FREE || TUTOR) {
    // the real walk: the text is read as it stands on the server (what everyone before left), and the door is shut for a
    // browser — or an account — that has been in once
    const [tx, st] = await Promise.all([
      data.client().from('remain_texts').select('scene_order, text, walker_sentences').eq('memory_id', run.memory.id),
      KEPT ? remainCall({ mode: 'status', memoryId: run.memory.id, walker: data.walkerKey() }) : null,
    ]);
    if (tx.error) console.warn('[remain] texts', tx.error);
    for (const row of (tx.data || [])) { baseTexts[row.scene_order] = row.text; run.earlier.set(Number(row.scene_order), new Set(Array.isArray(row.walker_sentences) ? row.walker_sentences.map(String) : [])); }
    state.texts = Object.assign({}, baseTexts);
    if (KEPT && (state.locked || (st && st.walked))) return outside();
  } else if (!TUTOR) {
    if (state.locked && !NEXT && !AT) return outside();                   // the door is shut: only what the piece now is, from outside
    baseTexts = Object.assign({}, state.texts);
  }
  walkSlot = state.walks.length;
  const gateAnswer = TUTOR ? null : tidyGate(takeGateAnswer(run.memory.id));        // what was written in the archive's one blank, if the walker came that way (read once)
  run.engine = createEngine(run.scenes, { frame: qs.get('frame') });
  [run.ghosts, run.rows] = await Promise.all([data.loadGhostLines(run.memory.id), loadLedger(run.memory.id)]);
  run.ghosts = run.ghosts.map((g) => Object.assign({}, g, { utterance: tidyLine(g.utterance) })).filter((g) => g.utterance);   // 261128: lines kept before the tidying rule are tidied when read back (js/shared/tidy_line.js)
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
  backs = createBackDoors({ cosmos, ko, canEnter: () => !run.busy && !run.crossing && !run.ended && !map.isOpen() && !(pause && pause.isOpen()),
    onEnter: (d) => { const from = sceneById(d.from), to = sceneById(d.to); if (from && to && !run.crossing && !run.busy) { run.backLog.push({ entered: from.scene_order, to: to.scene_order }); cross(from, to, null, 'old'); } } });
  Object.assign(window.__remain, { cosmos, talk, map, air, finish, pause, skip, backs });
  setupFlyButton();
  window.addEventListener('contextmenu', (e) => { if (pause && pause.isOpen()) return; e.preventDefault(); if (run.ended || run.busy || run.crossing) return; if (map.isOpen()) map.close(); else if (cosmos.mode() === 'fly') map.open(); });
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !/^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '') && cosmos.mode() === 'fly') map.toggle(); });

  if (TUTOR) tutor = createTutor({ lang: LANG, fast: FAST, typeText, touch: cosmos.isTouch() });
  // the fall before the first scene: the real walk and the practice have it (it can be skipped by holding a key); the preview does not, unless asked
  const withPrologue = !AT && (MODE === 'test' ? qs.get('prologue') === '1' : qs.get('prologue') !== '0');
  let entryP = Promise.resolve({ scene: firstScene(), gate: null });
  const begin = async () => {
    $('spEntry').classList.add('gone');
    cosmos.ensureAudio();
    if (withPrologue) {
      try { run.prologue = await runPrologue({ cosmos, run, data, lang: LANG, fast: FAST, hint, auto: false, onDark: () => map.make() }); }
      catch (e) { console.error('[remain] prologue', e); cosmos.setCine(null); cosmos.setMode('held'); $('spCosmos').classList.remove('on'); }
    }
    map.make();
    const picked = await entryP.catch((e) => { console.warn('[remain] gate', e); return { scene: firstScene(), gate: null }; });
    const first = picked.scene; run.gate = picked.gate;
    if (KEPT) { markWalked(run.memory.id); if (run.gate) logGate(first, run.gate); }
    const has = air.focus(first);
    await wait(has ? 2600 : 900);
    if (AT === 'end') return fakeWalk().then(finish);
    try { const res = await stay(first, { dark: true, via: 'start' }); run.firstRes = res; run.firstLeft = res.left; }
    catch (e) { console.error('[remain] first stay', e); run.busy = false; talk.hide(); toast(ko ? '첫 장면을 읽지 못했습니다' : 'The first scene could not be read'); return; }
    await openEyes(first);
  };

  veil(false);
  if (AT) { run.blanks = remain.blanksFor(run.memory.code, LANG).map((l, i) => ({ line: l, answer: ko ? ['내가 겁이 나서', '불을 켜 두고 잤다', '엄마'][i] : ['I was afraid', 'slept with the light on', 'my mother'][i] })); readBefore(); return begin(); }
  if (TUTOR) { await entry(null); return begin(); }                        // the practice: the same door as the real walk (the introduction, the three blanks) — only the consent sheet is not there, for nothing is kept
  const gate = await entry(gateAnswer);
  entryP = pickEntry(gate);                                                // the first blank also names the first scene (read while the walker falls)
  begin();
}
/**
 * The first scene, named by what was written in the first blank (the archive's one sentence) — the gate's own rule
 * (js/spaceblank/main.js pickEntry · docs/아카이브_기억칸_질문_결정-261128.md §2), unchanged: the reading's nearest entry
 * candidate on the memory's axes. No answer · not taken in · a reading that failed or came back empty = the first scene as written.
 */
async function pickEntry(answer) {
  const base = firstScene();
  if (!answer) return { scene: base, gate: null };
  const g = { form: 'gate_v1', text: answer.text, line: answer.line, default: base.scene_order, picked: base.scene_order, analysed: false, via: 'default' };
  if (!guard(answer.text).ok || !sendable(answer.text)) { g.text = ''; g.via = 'not_sent'; return { scene: base, gate: g }; }
  const an = await measure(answer.text, { scene_text: String(answer.line || '').replace(remain.HOLE, '[   ]').slice(0, 400), ghost_line: '' });
  if (!an) return { scene: base, gate: g };
  const emo = parseEmotion(an.base);
  g.analysed = true; g.emotion = emo;
  if (an.reason_analysis && an.reason_analysis.is_void) { g.via = 'void'; return { scene: base, gate: g }; }
  const rig = rigOf(run.memory, qs), spine = rig ? new Set(rig.spine) : null, last = run.scenes[run.scenes.length - 1];
  const cand = run.scenes.filter((sc) => !isSilent(sc) && !isLocked(sc, { userEmotion: emo || {}, visitedIdx: [] }) && (spine ? !spine.has(sc.scene_order) : (run.scenes.length < 3 || sc.id !== last.id)));
  if (!cand.some((sc) => sc.id === base.id)) cand.push(base);
  const ranked = cand.map((sc) => ({ sc, a: run.engine.alignmentTo(sc, emo) })).sort((x, y) => (y.a - x.a) || (x.sc.scene_order - y.sc.scene_order));
  g.ranked = ranked.slice(0, 5).map((r) => ({ order: r.sc.scene_order, a: +r.a.toFixed(4) }));
  if (!ranked.length || !(ranked[0].a > 0)) return { scene: base, gate: g };
  g.picked = ranked[0].sc.scene_order; g.via = 'reading';
  return { scene: ranked[0].sc, gate: g };
}
/** The gate's answer is a walk too: one ledger row with the "move" mark (it was said to no scene — no reading column, no alignment). */
function logGate(scene, g) {
  data.insertPlay({ memory_id: run.memory.id, scene_id: scene.id, user_emotion: null, alignment: null, mismatch_type: null, run_id: run.id, ghost_variant_id: null, persona_id: MOVE_PERSONA,
    dialog_turns: [{ stage: 'piece_v1', place: PLACE_TAG, kind: KIND, move: 'gate', from_scene_id: null, to_scene_id: scene.id, at: new Date().toISOString(), gate: g }] });
}
/** A move that is not a stay is a walk all the same: it goes in the ledger (no emotion, no alignment). */
function logMove(from, to, how) {
  if (!KEPT) return;
  data.insertPlay({ memory_id: run.memory.id, scene_id: to.id, user_emotion: null, alignment: null, mismatch_type: null, run_id: run.id, ghost_variant_id: null, persona_id: MOVE_PERSONA,
    dialog_turns: [{ stage: 'piece_v1', place: PLACE_TAG, kind: KIND, move: how, from_scene_id: from.id, to_scene_id: to.id, at: new Date().toISOString() }] });
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
/**
 * @param gateAnswer { text, line } | null — what the walker wrote in the archive's one blank. It is the first of the three
 *   (author, 261128 night): it stands already filled, two more are asked at the door. It names the first scene (pickEntry)
 *   and, with the other two, which lines remain. Without it (the page opened on its own) all three are asked here.
 * @returns the gate answer that was taken as the first blank, or null
 */
async function entry(gateAnswer) {
  const line = $('spEntryLine'), box = $('srBlanks'), btn = $('spEnter'), note = $('spEntryNote');
  await wait(900);
  if (TUTOR) {
    // 261128 night (author: "the tutorial memory too, brought up to the latest — the same three scenes or so, the words changing the same,
    // and before it starts have them read what the piece is about and ask the three questions, the same"). What the archive shows
    // before a memory is entered (its title, its introduction) is read here; then the three blanks. No consent sheet: nothing is kept.
    await typeText(line, ko ? '연습이야.\n여기서 한 말은 안 남아.' : 'This is practice.\nNothing you say here is kept.', { per: 80, pace: 1 / FAST }); await wait(2200);
    const intro = String((run.memory.meta && run.memory.meta.gate && run.memory.meta.gate.intro) || '').trim();
    if (intro) { line.classList.add('intro'); await typeText(line, (run.memory.title ? run.memory.title + '\n' : '') + intro, { per: 45, pace: 1 / FAST }); await wait(Math.min(9000, 2600 + intro.length * 45)); }
  } else {
    await consent();
    if (TOLD) { await typeText(line, ko ? '여기서 한 말은 남아.\n한 번뿐이야.' : 'What you say here stays.\nOnly once.', { per: 80, pace: 1 / FAST }); await wait(2200); }
  }
  typeText(note, TUTOR ? (ko ? '연습 — 남지 않습니다' : 'practice — nothing is kept') : KEPT ? '' : FREE ? (ko ? '기록 없는 걸음 — 아무것도 남지 않습니다' : 'a walk off the record — nothing is kept') : NEXT ? (ko ? '미리보기 — 다음 사람으로 걷습니다' : 'preview — walking as the next person') : (ko ? '미리보기 — 이 브라우저에만 남습니다' : 'preview — kept in this browser only'), { per: 30 });
  let blanks = remain.blanksFor(run.memory.code, LANG).slice(), gate = null;
  if (gateAnswer && String(gateAnswer.line || '').includes(remain.HOLE) && guard(gateAnswer.text).ok) {
    gate = gateAnswer;
    blanks = [gate.line].concat(blanks.filter((l) => l !== gate.line)).slice(0, 3);      // the archive's sentence first; the other two of this memory after it
  }
  box.classList.add('on');
  for (let i = 0; i < blanks.length; i++) {
    const [a, b] = blanks[i].split(remain.HOLE);
    const row = document.createElement('p'); row.className = 'sr-blank';
    const sa = document.createElement('span'), inp = document.createElement('input'), sb = document.createElement('span');
    inp.type = 'text'; inp.maxLength = 40; inp.autocomplete = 'off'; inp.spellcheck = false; inp.className = 'sr-hole'; inp.setAttribute('aria-label', ko ? '빈 자리' : 'the blank');
    row.append(sa, inp, sb); box.appendChild(row);
    requestAnimationFrame(() => row.classList.add('on'));
    if (i === 0 && gate) {                                                   // already written, at the archive: it stands as it was written
      sa.textContent = a || ''; sb.textContent = b || ''; inp.value = gate.text; inp.readOnly = true; row.classList.add('done'); inp.style.width = Math.max(3, gate.text.length * 1.05 + 1) + 'em';
      run.blanks.push({ line: blanks[i], answer: gate.text });
      await wait(1600);
      continue;
    }
    await typeText(sa, a || '', { per: 55, pace: 1 / FAST });
    sb.textContent = b || '';
    if (!('ontouchstart' in window)) inp.focus();
    const answer = await new Promise((resolve) => {
      inp.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        const v = tidyLine(inp.value); if (!v) { inp.value = ''; return; }
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
  return gate;
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
    ? ['여기서 한 말 몇 줄은 이 기억의 글에 남을 수 있다. 다음 사람이 그걸 읽는다.',
       '어느 말이 남을지는 못 고른다. 남으면 못 고치고 못 지운다.',
       '한 번만 들어갈 수 있다. 중간에 나가도 한 번이다.',
       '들어가기 전에 적는 세 문장은 아무에게도 안 보인다.',
       '본명이나 연락처는 적지 않는다. "엄마", "그 사람"이면 된다.',
       '한 말은 AI에게 보내진다. AI가 읽고 대답한다.']
    : ['A few lines of what you say here may stay in this memory\'s text. The next person reads them.',
       'You do not choose which. What stays cannot be changed or removed.',
       'You go in once. Leaving partway still counts.',
       'The three sentences you write first are shown to no one.',
       'No real names, no numbers. "my mother", "that person" will do.',
       'What you say is sent to an AI. It reads it and answers.'];
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
  const shown = [], emos = [], history = [], turns = [], rest = restOf(scene);
  let anyVoid = 0, lastAlign = run.last ? run.last.turnAlignment : 0.5, lastReply = '', turnsHere = 0;
  talk.clear(); talk.show();
  if (!dark) await wait(1500);

  /** One exchange. Returns false when the walker moved on (or stayed silent). */
  const exchange = async (opts) => {
    let answer;
    if (tutor) tutor.say(turnsHere ? 'more' : 'ask');
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
      (ok && !silent) ? replyOf(known, raw, history.slice(), !!(opts && opts.ask), rest) : Promise.resolve(''),
    ]);
    talk.waiting(false);
    let emo = null, ra = null, align = lastAlign;
    if (an) {
      emo = parseEmotion(an.base); ra = an.reason_analysis || null;
      const a = run.engine.alignmentTo(scene, emo);
      if (a > 0) { lastAlign = a; align = a; }
      emos.push(emo); if (ra && ra.is_void) anyVoid++;
    }
    turns.push({ turn: turns.length + 1, raw_text: raw, alignment: align, resonance: resonanceOf(align), ghost_reply: rep || '', via: rep ? 'remain_turn' : (ok ? 'no_reply' : 'not_sent'), ts: Date.now(),
      input_form: 'talk_v1', stage: data.STAGE_TAG, place: PLACE_TAG, kind: KIND, form: 'talkn_v1', visit: 1, text_stage: 0, arrived: (o && o.via) || 'door', analysed: !!an, odd: !!(ra && ra.is_void), question });
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
    if (KEPT && turns.length) data.recordContact({ memoryId: run.memory.id, sceneId: scene.id, utterance: turns[turns.length - 1].raw_text.slice(0, 300), turn: turns.length, runId: run.id });
  }

  const rig = rigOf(run.memory, qs);
  let next;
  if (TUTOR) {                                                             // the practice: three scenes in the memory's own order, then it ends — the engine names no door here
    const route = practiceRoute(), at = route.findIndex((s) => s.id === scene.id), to = at >= 0 ? route[at + 1] : null;
    next = to ? { scene: to, mode: 'new', pattern, ranked: [], shadow: null, rig: true } : { scene: null, mode: 'end', pattern, ranked: [], shadow: null, rig: true };
  } else {
    next = rig ? riggedDoor({ rig, engine: run.engine, scenes: run.scenes, origin: scene, pattern, userEmotion: mean, isVoid: userVoid, visited: run.visited })
               : run.engine.pickNext({ origin: scene, pattern, userEmotion: mean, isVoid: userVoid, visited: run.visited });
    if (next.mode === 'same') next = Object.assign(run.engine.pickNext({ origin: scene, pattern: 'bridge', userEmotion: mean, isVoid: userVoid, visited: run.visited }), { was: 'same' });
  }

  // the ledger: one row a stay, as the space stage writes it (the real walk only)
  if (KEPT && turns.length) {
    await data.insertPlay({ memory_id: run.memory.id, scene_id: scene.id, user_emotion: mean, alignment, mismatch_type: resonance, run_id: run.id, ghost_variant_id: null, dialog_turns: turns, persona_id: null });
  }
  run.rooms.push({ order: run.rooms.length + 1, scene_id: scene.id, scene_order: scene.scene_order, visit: 1, text_stage: 0, kind: KIND, seen_text: shown.join(' '),
    silent: !turns.length, user_emotion: mean, turn_alignment: +alignment.toFixed(4), resonance,
    turns: turns.map((t) => ({ text: t.raw_text, alignment: +t.alignment.toFixed(4), resonance: t.resonance, reply: t.ghost_reply, via: t.via, question: t.question })),
    engine: eng ? { alignment: eng.alignment_score, bucket: eng.alignment_bucket, pattern: eng.transition_pattern, mismatch: eng.mismatch_type } : null,
    door: next.scene ? { to: next.scene.scene_order, mode: next.mode, pattern, rig: !!next.rig } : (next.mode === 'end' ? { to: null, mode: 'end', rig: true } : null) });

  {
    persist(false);                                                        // from the first line said, the door is shut — whether or not the walk is finished
    const mine = []; for (let i = firstLine; i < run.lines.length; i++) mine.push(i);
    judge(mine).then(() => persist(false));                                // this stay's lines are read while the walker goes on; what remains is kept again when they are
  }
  run.heard.set(scene.id, history);
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
  let keep = remain.remaining(usable, before, PICK_RANDOM ? { random: seeded(run.id) } : null);
  if (run.committed) keep = new Set(Array.from(keep).filter((li) => run.placed.has(li)));   // the real walk: only what the server placed remains (it may refuse a line, or the scene may have gone)
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
  if (KEPT && !run.opened) { run.opened = true; remainCall({ mode: 'open', memoryId: run.memory.id, runId: run.id, walker: data.walkerKey(), consent: run.consent }); }   // on record from the first line: the door is shut on the server too
  const before = run.before || (run.beforeP ? await run.beforeP : remain.beforeOf([]));
  const s = settle(before);
  state.texts = Object.assign({}, baseTexts);
  for (const c of s.changes) state.texts[c.order] = remain.withChange(run.read.get(c.sceneId), c.index, c.now);
  state.walks[walkSlot] = { id: run.id, at: new Date().toISOString(), next: NEXT, pick: PICK_RANDOM ? 'random' : 'blanks', consent: run.consent, blanks: run.blanks, before: { read: before.read },
    lines: run.lines.map((l, i) => ({ order: l.order, raw: l.raw, kept: s.keep.has(i), whom: l.whom || null, back: l.back == null ? null : l.back })),
    changes: s.changes.map((c) => ({ order: c.order, index: c.index, was: c.was, now: c.now, raw: c.raw, by: c.by, blank: c.blank })), done: !!done };
  state.locked = true;
  if (run.committed) { state.walks[walkSlot].committed = true; if (run.committed.texts) state.texts = Object.assign({}, baseTexts, run.committed.texts); }
  if (!FREE && !TUTOR) remain.save(run.memory.code, state, STORE);        // a walk off the record and the practice are settled in memory only
  return s;
}
/** The ending's call: the server names the sentence each remaining line displaces and fits the seam; then it is kept. */
async function weave() {
  const before = run.before || (run.beforeP ? await run.beforeP : remain.beforeOf([]));
  await Promise.all(run.judging);
  { const unread = []; run.lines.forEach((l, i) => { if (l.whom === undefined) unread.push(i); }); if (unread.length) await judge(unread); }   // a reading that did not come back is asked for once more
  const first = settle(before);
  if (KEPT) await commit(first);
  else if (!DRY && first.changes.length) {
    const r = await remainCall({ mode: 'weave', items: first.changes.map((c) => ({ id: String(c.li), sentences: run.read.get(c.sceneId), line: c.raw })) });
    const byId = new Map(((r && r.items) || []).map((x) => [String(x.id), x]));
    for (const c of first.changes) run.placed.set(c.li, remain.placeServer(run.read.get(c.sceneId), c.raw, byId.get(String(c.li))));
  }
  const s = await persist(true);
  run.shift = new Map();
  for (const c of (s ? s.changes : [])) run.shift.set(c.sceneId, remain.pieceShift(run.acc, c.sceneId, run.lines[c.li].emo, run.read.get(c.sceneId).length, TOPO));
  if (!KEPT && !FREE && !TUTOR) writeOutside();                                               // the preview: what the piece now is, from outside (not waited for). The real walk's is written by the server
  return s || { keep: new Set(), changes: [] };
}
/**
 * The real walk: what remains is handed to the server, which rewrites each line as a sentence of the text as it stands at
 * that moment and puts it there (remain-turn "commit"). What it answers is what happened; nothing else is shown as remaining.
 * If it does not answer, the walk stays unfinished in this browser and is handed over again the next time the page is opened.
 */
function commitBody(s) {
  return { mode: 'commit', lang: LANG, memoryId: run.memory.id, runId: run.id, walker: data.walkerKey(), consent: run.consent, blanks: run.blanks,
    lines: run.lines.map((l) => ({ order: l.order, raw: l.raw, whom: l.whom || null, back: l.back == null ? null : l.back })),
    keep: s.changes.map((c) => ({ li: c.li, order: c.order, raw: c.raw, blank: c.blank })) };
}
async function commit(first) {
  const r = await remainCall(commitBody(first));
  if (!r) return false;
  run.committed = { texts: r.texts || {} };
  run.placed = new Map();
  for (const c of (r.changes || [])) {
    const li = Number(c.li), l = run.lines[li]; if (!l) continue;
    run.placed.set(li, { index: Math.max(0, Math.min((run.read.get(l.sceneId) || [1]).length - 1, Number(c.index) || 0)), text: c.now, by: 'server' });
  }
  return true;
}
/** Leaving partway: the request is sent as the page goes (the browser lets such a request finish). Best effort — if it does not arrive, it is sent again on the next visit. */
function commitOnLeave() {
  if (!KEPT || run.ended || run.committed || !run.lines.length || !run.consent) return;
  try {
    const s = settle(run.before || remain.beforeOf([]));
    fetch(SUPABASE_URL + '/functions/v1/remain-turn', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }, body: JSON.stringify(commitBody(s)) });
  } catch (_) {}
}
window.addEventListener('pagehide', commitOnLeave);

async function writeOutside() {
  if (DRY || !state) return;
  const of = remain.stamp(state);
  const r = await remainCall({ mode: 'outside', title: run.memory.title || '', scenes: run.scenes.filter((s) => !isSilent(s)).map((s) => ({ order: s.scene_order, text: remain.textOf(state, s) })) });
  if (r && r.intro) { state.outside = { intro: r.intro, synopsis: r.synopsis, of, at: new Date().toISOString() }; remain.save(run.memory.code, state, STORE); }
}
function leave() {
  if (TUTOR || FREE) { try { sessionStorage.setItem('tem_menu_after_ending', '1'); } catch (_) {} location.href = qs.get('back') || (location.protocol === 'file:' ? 'index.html' : './'); return; }   // nothing was kept: out to the menu
  // the walk is already kept. Out = this same page, which now shows only the outside of the piece.
  if (run.lines.length || (state && state.locked)) { const q = new URLSearchParams(); if (qs.get('memory')) q.set('memory', qs.get('memory')); if (qs.get('lang')) q.set('lang', qs.get('lang')); if (MODE === 'test') q.set('as', 'test'); location.href = location.pathname + (q.toString() ? '?' + q : ''); return; }
  try { sessionStorage.setItem('tem_menu_after_ending', '1'); } catch (_) {}
  location.href = qs.get('back') || (location.protocol === 'file:' ? 'index.html' : './');
}
function outside() {
  $('spEntry').classList.add('gone'); veil(false);
  if (KEPT) return outsideKept();
  showOutside({ lang: LANG, title: run.memory.title || '', state, fallbackIntro: (run.memory.meta && run.memory.meta.gate && run.memory.meta.gate.intro) || '',
    refresh: async () => {
      if (state.outside && state.outside.of === remain.stamp(state)) return state.outside;
      const of = remain.stamp(state);
      const r = await remainCall({ mode: 'outside', title: run.memory.title || '', scenes: run.scenes.filter((s) => !isSilent(s)).map((s) => ({ order: s.scene_order, text: remain.textOf(state, s) })) });
      if (r && r.intro) { state.outside = { intro: r.intro, synopsis: r.synopsis, of, at: new Date().toISOString() }; remain.save(run.memory.code, state, STORE); }
      return state.outside;
    },
    asNext: () => { const q = new URLSearchParams(location.search); q.set('next', '1'); location.href = location.pathname + '?' + q; },
    reset: () => { const q = new URLSearchParams(location.search); q.set('reset', '1'); q.delete('next'); location.href = location.pathname + '?' + q; } });
}

/**
 * The real walk's outside: what the piece now is, as the server last wrote it (remain_outside — rewritten after every walk
 * that changed the text, whoever's). A walk this browser left unfinished is handed over first. If the piece's outside has
 * not been written since this browser's own walk, it is looked for again a few times (the server writes it after it answers).
 */
function outsideKept() {
  const mine = state.walks[state.walks.length - 1] || null;
  const read = async () => { const r = await data.client().from('remain_outside').select('intro, synopsis, updated_at').eq('memory_id', run.memory.id).maybeSingle(); return r.error ? null : r.data; };
  showOutside({ lang: LANG, title: run.memory.title || '', state: { outside: null }, real: true, fallbackIntro: (run.memory.meta && run.memory.meta.gate && run.memory.meta.gate.intro) || '',
    refresh: async () => {
      if (mine && !mine.committed && mine.consent && Array.isArray(mine.lines) && mine.lines.length) {      // left partway
        // the request sent on leaving may still be at work (it rewrites the lines, a few seconds): it is given time, and asked after, before the walk is handed over again
        await new Promise((r) => setTimeout(r, 12000));
        const st = await remainCall({ mode: 'status', memoryId: run.memory.id, walker: data.walkerKey() });
        if (st && st.applied) { mine.committed = true; remain.save(run.memory.code, state, STORE); }
      }
      if (mine && !mine.committed && mine.consent && Array.isArray(mine.lines) && mine.lines.length) {      // …and the leaving request did not arrive
        const keep = (mine.changes || []).map((c, i) => ({ li: i, order: c.order, raw: c.raw, blank: c.blank }));
        const r = await remainCall({ mode: 'commit', memoryId: run.memory.id, runId: mine.id, walker: data.walkerKey(), consent: mine.consent, blanks: mine.blanks || [], lines: mine.lines.map((l) => ({ order: l.order, raw: l.raw, whom: l.whom, back: l.back })), keep });
        if (r) { mine.committed = true; remain.save(run.memory.code, state, STORE); }
      }
      let row = await read();
      const since = mine && mine.at ? new Date(mine.at).getTime() : 0, changed = mine && (mine.changes || []).length > 0;
      for (let i = 0; i < 4 && changed && (!row || new Date(row.updated_at).getTime() < since); i++) { await new Promise((r) => setTimeout(r, 5000)); row = await read(); }
      return row;
    } });
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
  if (tutor) tutor.say('eyes');
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
  raiseBackDoor(scene, next.scene);
  if (tutor) { if (run.visited.size < 2) tutor.say('door'); else if (run.backs.has(scene.id)) tutor.say('back').then(() => tutor.say('map')); else tutor.say('map'); }             // the first door: how a door is gone through · after the second scene: how to go back
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

/**
 * The back door (the blank stage's, js/spaceblank/backdoor.js — brought here 261128 night; it had been left behind when
 * this stage was built on the earlier space stage, which nobody had decided). Beside the door forward, about a hundred
 * degrees round, a door standing open onto one of the scenes already read (a fixed lottery on the run — never a scene
 * not yet read). Through it that scene's figure is seen, and nothing else. One per scene; none at the first.
 */
function raiseBackDoor(scene, forward) {
  if (!backs || run.backs.has(scene.id)) return;
  const cands = Array.from(run.visited).filter((id) => id !== scene.id && (!forward || id !== forward.id) && cosmos.things.has(id)).sort();
  if (!cands.length) return;
  const to = sceneById(cands[Math.floor(hashStr(run.id + scene.id + 'back') * cands.length)]);
  const T = window.THREE, Qf = V3(run.Q.get(scene.id)), fd = run.doors.get(scene.id);
  const f = fd && fd.way.live ? fd.way.e.clone() : horiz(new T.Vector3(1, 0, 0), run.id + scene.id);
  const ang = (hashStr(run.id + scene.id + 'bs') < 0.5 ? -1 : 1) * Math.PI * 0.58;
  const dir = new T.Vector3(f.x * Math.cos(ang) - f.z * Math.sin(ang), 0, f.x * Math.sin(ang) + f.z * Math.cos(ang)).normalize();
  const at = Qf.clone().addScaledVector(dir, BACK_DIST); at.y = Qf.y - FOOT_DROP;
  const rec = backs.raise({ from: scene.id, to: to.id, at, dir, key: run.id + scene.id + 'back', thing: cosmos.things.get(to.id) });
  run.backs.set(scene.id, rec);
  run.backLog.push({ at: scene.scene_order, onto: to.scene_order });
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
  if (first) { run.pending = to.id; dress(to, partB(to).left); if (tutor) tutor.say('next'); }
  else {
    if (run.visited.has(to.id)) { run.returns.set(to.id, (run.returns.get(to.id) || 0) + 1); run.returnDue = to.id; }
    if (kind !== 'new') logMove(from, to, kind === 'map' ? 'map_return' : 'door_return');
  }
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
    run.path.push(id); if (from) logMove(from, scene, 'flight');
    run.here = id; if (run.visited.has(id)) { run.returns.set(id, (run.returns.get(id) || 0) + 1); run.returnDue = id; } syncMap();
  }
  if (run.pending === id) { run.pending = null; if (run.returnDue === id) run.returnDue = null; stay(scene).then((res) => { cosmos.setMode('fly'); cosmos.relock(); if (cosmos.isTouch()) $('rpWalk').classList.add('on'); return afterStay(res); })
      .catch((e) => { console.error('[remain] stay', e); run.busy = false; talk.hide(); if (!run.ended) { cosmos.setMode('fly'); run.pending = id; toast(ko ? '장면을 읽지 못했습니다 — 다시 다가가 주세요' : 'The scene could not be read — come near it again'); } });
    return; }
  if (run.returnDue === id && run.visited.has(id)) {
    run.returnDue = null;
    again(scene).catch((e) => { console.error('[remain] again', e); run.busy = false; talk.hide(); if (!run.ended) cosmos.setMode('fly'); });
  }
}
/**
 * Back at a scene already read (author, 261128 night — of what was proposed, "2, 3, 4"; the walker's line is NOT shown
 * through the door frame). The text is not read again. What the walker said there stands, as it was said: it cannot be
 * taken out or put right. They may say more. The scene's person answers as one who heard the earlier lines — the whole of
 * what passed between them goes with every new line, and the server is told this is a coming back (remain-turn "turn",
 * back). Which lines remain is the same rule as ever: a line said on coming back is a line like any other, so coming
 * back to take a line back does not take it back.
 * No engine step and no new door — the walk's door forward is where it was. By the back door or by the map, the same.
 */
async function again(scene) {
  run.busy = true;
  if (tutor) tutor.say('again');
  cosmos.setMode('held'); map.close(); hint(''); nearLine(null); $('rpWalk').classList.remove('on');
  const r = cosmos.things.get(scene.id);
  if (r) cosmos.settle(r.pos, { dist: 10.5, side: innerWidth < 760 ? 0 : (hashStr(scene.id + 'side') < 0.5 ? -1 : 1), ms: 2200 });
  const silent = isSilent(scene), known = run.known.get(scene.id) || '', stood = (run.said.get(scene.id) || []).slice();
  const history = (run.heard.get(scene.id) || []).slice(), rest = restOf(scene);
  const visitN = (run.returns.get(scene.id) || 1) + 1, firstLine = run.lines.length;
  let entry = null; for (const e of run.story) if (e.sceneId === scene.id) entry = e;      // what is said now is set down with what was said here before
  if (!entry) { entry = { sceneId: scene.id, order: scene.scene_order, items: [] }; run.story.push(entry); }
  const emos = [], turns = [];
  let anyVoid = 0, lastAlign = run.last ? run.last.turnAlignment : 0.5, lastReply = '';
  talk.clear(); talk.show();
  await wait(1500);
  if (stood.length) { for (let i = 0; i < stood.length; i++) await talk.say(stood[i], 'rp-mine', { gap: i === 0, hold: 500 }); }
  else await talk.say('…', 'rp-void', { hold: 1800 });                       // nothing was said here: that stands too

  for (let t = 0; t < MAX_TURNS; t++) {
    let answer;
    for (;;) {
      answer = await talk.ask({ more: true, guide: ko ? '더 말할 수 있습니다.' : 'You may say more.', side: ko ? '돌아선다' : 'turn away' });
      if (answer.silent || answer.on) break;
      const g = guard(answer.text);
      if (g.ok) break;
      await talk.say(SHARP, 'rp-narr', { gap: true });
      if (g.help && helpLine()) await talk.say(helpLine(), 'rp-narr', {});
    }
    if (answer.silent || answer.on) break;
    const raw = answer.text, question = isQuestion(raw), ok = sendable(raw);
    await talk.say(raw, 'rp-mine', { gap: true, hold: 400 });
    talk.waiting(true);
    const [an, rep] = await Promise.all([
      measure(raw, { scene_text: known.slice(-400), ghost_line: (lastReply || stood[stood.length - 1] || '').slice(0, 200) }),
      (ok && !silent) ? replyOf(known, raw, history.slice(), false, rest, true) : Promise.resolve(''),
    ]);
    talk.waiting(false);
    let emo = null, ra = null, align = lastAlign;
    if (an) {
      emo = parseEmotion(an.base); ra = an.reason_analysis || null;
      const a = run.engine.alignmentTo(scene, emo);
      if (a > 0) { lastAlign = a; align = a; }
      emos.push(emo); if (ra && ra.is_void) anyVoid++;
    }
    turns.push({ turn: turns.length + 1, raw_text: raw, alignment: align, resonance: resonanceOf(align), ghost_reply: rep || '', via: rep ? 'remain_turn' : (ok ? 'no_reply' : 'not_sent'), ts: Date.now(),
      input_form: 'talk_v1', stage: data.STAGE_TAG, place: PLACE_TAG, kind: KIND, form: 'again_v1', visit: visitN, text_stage: 0, arrived: 'return', analysed: !!an, odd: !!(ra && ra.is_void), question });
    if (rep) { await talk.say(rep, 'rp-ghost', { gap: true, hold: 900 }); history.push({ role: 'user', content: raw }, { role: 'assistant', content: rep }); lastReply = rep; }
    else history.push({ role: 'user', content: raw }, { role: 'assistant', content: '…' });      // unanswered, and heard all the same
    if (!run.said.has(scene.id)) run.said.set(scene.id, []);
    run.said.get(scene.id).push(raw);
    if (question) { if (!run.asked.has(scene.id)) run.asked.set(scene.id, []); run.asked.get(scene.id).push(raw); }
    if (ok) { run.lines.push({ order: scene.scene_order, sceneId: scene.id, raw, emo, question, silentScene: silent, again: visitN }); entry.items.push({ kind: 'mine', li: run.lines.length - 1, t: raw }); }
  }

  if (turns.length) {
    run.heard.set(scene.id, history);
    const mean = remain.meanObj(emos), a = emos.length ? run.engine.alignmentTo(scene, mean) : 0, alignment = a > 0 ? a : lastAlign, resonance = resonanceOf(alignment);
    if (KEPT) await data.insertPlay({ memory_id: run.memory.id, scene_id: scene.id, user_emotion: emos.length ? mean : null, alignment, mismatch_type: resonance, run_id: run.id, ghost_variant_id: null, dialog_turns: turns, persona_id: null });
    run.rooms.push({ order: run.rooms.length + 1, scene_id: scene.id, scene_order: scene.scene_order, visit: visitN, back: true, text_stage: 0, kind: KIND, seen_text: '',
      silent: false, user_emotion: emos.length ? mean : null, turn_alignment: +alignment.toFixed(4), resonance,
      turns: turns.map((t) => ({ text: t.raw_text, alignment: +t.alignment.toFixed(4), resonance: t.resonance, reply: t.ghost_reply, via: t.via, question: t.question })), engine: null, door: null });
    persist(false);
    { const mine = []; for (let i = firstLine; i < run.lines.length; i++) mine.push(i); judge(mine).then(() => persist(false)); }
    if (cosmos.things.has(scene.id)) afterSpeech(scene, { mean: emos.length ? mean : null });
  }
  await wait(900);
  talk.hide();
  run.busy = false;
  if (!run.ended) { cosmos.setMode('fly'); cosmos.relock(); if (cosmos.isTouch()) $('rpWalk').classList.add('on'); }
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
  if (backs) backs.tick(dt);
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
  (run.earlier.get(Number(scene.scene_order)) || new Set()).forEach((t) => earlier.add(t));
  return { order: scene.scene_order, lines: sentences(remain.textOf(state, scene)).map((t) => ({ t, who: mineNow.has(t) ? 'mine' : earlier.has(t) ? 'other' : 'text' })) };
}
async function finish() {
  if (run.ended) return;
  run.ended = true;
  hint(''); nearLine(null); map.close(); $('spMapWrap').classList.remove('on'); $('rpWalk').classList.remove('on'); talk.hide();
  cosmos.setMode('held'); if (cosmos.unlock) cosmos.unlock();
  if (backs) backs.hideAll();
  if (tutor) tutor.hush();
  if (KEPT) {                                                               // the journal, as the space stage writes it (the next walker's prologue reads it)
    data.writeJournal(run.memory.id, run.id, { stage: data.STAGE_TAG, place: PLACE_TAG, kind: KIND, mode: MODE, visit_order: run.path.map((id) => sceneById(id).scene_order),
      scenes: run.rooms, legs: run.legs, contact: run.contact, model: Array.from(run.place).map(([id, p]) => ({ scene: sceneById(id).scene_order, from: sceneById(p.from).scene_order, compared: p.compared, d: p.d, shift: p.shift, pos: run.Q.get(id) || null })),
      seconds: Math.round((Date.now() - run.startedAt) / 1000), track: packTrack(cosmos.track), prologue_of: run.prologue ? (run.prologue.from || 'ledger') : 'none', gate: run.gate, said: run.lines.length, back_doors: run.backLog });
  }
  const weaving = weave().catch((e) => { console.error('[remain] weave', e); return persist(true).then((s) => s || { keep: new Set(), changes: [] }); });
  try {
    await runEnding({ lang: LANG, fast: FAST, practice: TUTOR, title: run.memory.title || '', story: run.story, lines: run.lines, blanks: run.blanks, random: PICK_RANDOM, typeText,
      weave: () => weaving,
      pieces: {
        open() { endMap(0); $('spMapWrap').classList.add('on'); map.open(); },
        /** the changed pieces move to where they now stand — slowly */
        shift(ms) { return new Promise((res) => { const t0 = performance.now(); (function tick(now) { const k = Math.min(1, (now - t0) / ms), e = k * k * (3 - 2 * k); endMap(e); if (k < 1) requestAnimationFrame(tick); else res(); })(t0); }); },
        onPick(fn) { endPick = (id) => fn(nextTextOf(id)); },
        first: () => { const c = Array.from(run.shift.keys())[0] || run.here; return c ? nextTextOf(c) : null; },
      },
      leave: TUTOR ? practiceEnd : leave });
  } catch (e) { console.error('[remain] ending', e); toast(ko ? '끝 화면을 그리지 못했습니다' : 'The ending could not be drawn'); await weaving; await wait(2500); (TUTOR ? practiceEnd : leave)(); }
}

/** The practice ends (after its ending, when the walker leaves it): dark, a few lines from "another me", and out to the menu. Nothing was kept. */
async function practiceEnd() {
  if (run.leaving) return; run.leaving = true;
  run.ended = true;
  document.body.classList.remove('sr-ending'); for (const id of ['srEnd', 'srSay', 'srBefore', 'srPiece', 'srLeave']) { const n = $(id); if (n) n.remove(); }
  hint(''); nearLine(null); map.close(); $('spMapWrap').classList.remove('on'); $('rpWalk').classList.remove('on'); talk.hide();
  if (tutor) tutor.hush();
  cosmos.setMode('held'); if (cosmos.unlock) cosmos.unlock();
  air.hush(true);
  await veil(true);
  const pass = $('rpPass');
  for (const line of (tutor ? tutor.end : [])) { await wait(500); await typeText(pass, line, { per: 90, pace: 1 / FAST, voice: true }); await wait(2600); pass.textContent = ''; }
  await wait(900);
  leave();
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

/**
 * Space-blank — orchestrator (2026-11-23). A copy of js/spaceplay/main.js on its own branch, with one thing added:
 *
 *   · a scene come back to is read in full again (its text as it stands now, and two exchanges) — not only "what is different"
 *   · where a line stands that is not what the walker read there, the black paper over it has lifted: a torn end hangs and sways
 *   · pressed, the black strip comes off (into the walker's hand, the words still on it) and the parchment under it is bare: the walker writes on it (Enter seals)
 *   · a strip in hand can be laid over any line of any other scene: that line is covered and the strip's sentence stands there
 *   · what was written and what was moved stays for the walk, and two in three of it reach the next walker (paper.js)
 *   (the first form — word holes, [   ] — is js/spaceblank/blank.js, retired 261123 for this one)
 *
 * Decision record: docs/우주무대_빈칸_실험-261123.md (and docs/우주무대_결정-261121.md for everything else).
 * The place, the things, the map and the pause sheet are js/spaceplay/'s own files, unchanged.
 * test runs only: &strip=<a line> = start with a torn strip already in hand carrying that line.
 *
 * ── below: the space stage's own header ──
 * Space play — orchestrator (2026-11-21).
 *
 *   (the opening) → first scene: sound, then text on the dark → eyes open in a black place →
 *   [ fly to the scene's thing → its text and two exchanges → a way and a door → walk through ]* → the skein → the version read → home
 *
 * Decision record: docs/우주무대_결정-261121.md
 * URL: ?memory=<uuid|code> (default UNDW-001) · ?as=author|test · ?lang=ko|en · ?rig=0 · ?from=opening
 *      as=test = a practice walk: it is measured and answered for real, and nothing of it is written anywhere.
 *      test runs only: &fast=4 · &dry=1 (the server is not asked either: made-up readings, no reply) · &at=space|end · &peek=1
 *
 * A scene is read in two parts, and after each part the walker speaks once and is answered once (two exchanges).
 * The answer comes from the same regulated channel the terrain stage's ghost talk used (the dialog-turn function:
 * it answers only from inside the scene's text, invents nothing, one or two sentences, no advice or judgement),
 * behind the same crisis check. The reading (emotion → engine → where the door leads) is the room stage's, unchanged.
 */
import * as data from '../roomplay/data.js';
import { createEngine, parseEmotion, resonanceOf } from '../roomplay/engine.js';
import { createRoom, typeText, sentences, closed } from '../roomplay/room.js';
import { rigOf, riggedDoor, riggedStage } from '../roomplay/rig.js';
import { createCosmos } from '../spaceplay/cosmos.js?v=261123a';
import { isSilent } from '../spaceplay/things.js?v=261123c';
import { accumulate, placeNext, TOPO } from '../spaceplay/topo.js';
import { replayFromPlays, getPresentationState } from '../core/ContaminationTracker.js';
import { createStarMap } from '../spaceplay/starmap.js?v=261123a';
import { createEscMenu } from '../spaceplay/escmenu.js?v=261123a';
import { runFinale } from './finale.js?v=261123c1';
import { normLine, createEdits, inheritEdits, hangTab, tearLine, layStrip, dressEdit, createStrips } from './paper.js?v=261123c3';
import { createBackDoors } from './backdoor.js?v=261123c1';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const MODE = qs.get('as') === 'author' ? 'author' : qs.get('as') === 'test' ? 'test' : 'audience';
const FAST = MODE === 'test' ? Math.max(1, Math.min(8, Number(qs.get('fast')) || 1)) : 1;
const DRY = MODE === 'test' && qs.get('dry') === '1';
const AT = MODE === 'test' ? (qs.get('at') || '') : '';
const PEEK = MODE === 'test' && qs.get('peek') === '1';
const LANG = (qs.get('lang') || sessionStorage.getItem('tem_archive_lang') || 'ko').slice(0, 2) === 'en' ? 'en' : 'ko';
const ko = LANG !== 'en';
const DEFAULT_MEMORY = 'UNDW-001';
const DEPTH_STAGE_2 = 5, DEPTH_STAGE_3 = 15;                 // = play-test applyStageText
const PLACE_TAG = 'space_v1', MOVE_PERSONA = 'piece-move';   // rows of this stage: dialog_turns[0].place; a move without a stay = the piece stage's own mark
// staging values (free parameters)
const DOOR_DIST = 26, ARRIVE_DIST = 24, FOOT_DROP = 1.15;

const wait = (ms) => new Promise((r) => setTimeout(r, ms / FAST));
const veilEl = $('rpVeil');
function veil(on) { veilEl.classList.toggle('clear', !on); return new Promise((r) => setTimeout(r, 2300 / Math.min(FAST, 3))); }
function toast(msg) { const t = $('rpToast'); typeText(t, msg, { per: 30 }); t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 6000); }
function hint(msg, ms) { const h = $('rpHint'); clearTimeout(hint._t); if (!msg) { h.classList.remove('on'); return; } typeText(h, msg, { per: 30 }); h.classList.add('on'); hint._t = setTimeout(() => h.classList.remove('on'), ms || 9000); }
/** How to move, said once, large, in the middle (author, 261123: the small line at the bottom was not seen). */
function guide(rows, ms) {
  let g = $('spGuide'); if (!g) { g = document.createElement('div'); g.id = 'spGuide'; g.setAttribute('aria-live', 'polite'); document.body.appendChild(g); }
  g.innerHTML = ''; for (const [k, t] of rows) { const r = document.createElement('div'); r.className = 'row'; const a = document.createElement('span'); a.className = 'k'; a.textContent = k; const b = document.createElement('span'); b.className = 't'; b.textContent = t; r.appendChild(a); r.appendChild(b); g.appendChild(r); }
  requestAnimationFrame(() => g.classList.add('on'));
  clearTimeout(guide._t); guide._t = setTimeout(() => g.classList.remove('on'), ms || 12000);
}
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

const run = {
  id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
  memory: null, scenes: [], engine: null, acc: null,
  visited: new Set(),                       // scenes stayed in (read and spoken to)
  arrived: new Set(),                       // scenes that stand in the walker's model
  said: new Map(),                          // scene id → [text] the walker's lines there
  asked: new Map(),                         // scene id → [text] the ones that were questions
  readings: new Map(),                      // scene id → the walker's mean emotion there
  shown: new Map(),                         // scene id → Set(normalised lines already read there)
  returns: new Map(),                       // scene id → times come back to
  stays: new Map(),                         // scene id → times read (a return is read in full: the 2nd, 3rd reading)
  edits: null,                              // paper.js createEdits: what stands in place of a line — earlier walkers' (inherited) and this walker's
  inherited: [],                            // the earlier walkers' edits this walker reads (two in three of each run's)
  paper: [],                                // the journal of it: every strip torn, every line written, every strip laid
  torn: [],                                 // lines torn in the stay now up (sealed when it closes)
  backs: new Map(), backLog: [],            // scene id → its back door (a door onto a scene already read); where each stood and where it gave onto
  Q: new Map(), place: new Map(),           // the walker's model: scene id → [x,y,z]; how each place was reached (topo.placeNext)
  doors: new Map(),                         // scene id → { way, to }
  path: [], legs: [], rooms: [], script: [],
  here: null, pending: null, last: null, contact: false, ghosts: [], rows: [], crossing: false, busy: false, ended: false,
  startedAt: Date.now(),
};
window.__space = { run, mode: MODE };       // automation / inspection hook

let cosmos, talk, map, air, pause, letGo = false;
let strips, backs, laying = false, stayCtx = null;         // the paper: the strips in hand, the back doors, the stay now up
const BACK_DIST = 17;                                       // the back door stands this far from the scene (staging)
const letGoMark = () => { letGo = true; };
const V3 = (a) => new window.THREE.Vector3(a[0], a[1], a[2]);
const sceneById = (id) => run.scenes.find((s) => s.id === id);

// ── sound: a scene's sound belongs to that scene alone ─────────────────────
// A sound assigned to a scene (scenes.meta.sound_url) is heard only where that scene is: under its text, and near
// its thing — loudest there, gone at a distance. It is never a bed under the whole walk: between scenes, on the way,
// at another scene, in the black passage and in the ending there is none of it (author, 261121: "the bell keeps
// ringing"). One audio element per scene; nothing is shared. Nothing is played for the memory as a whole.
const SOUND_FULL = 13, SOUND_REACH = 42;          // staging (free values): full inside · gone beyond, in the place's units; the reach is scaled by the scene's own sound_radius (15 = as is)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const soundOf = (scene) => { const m = scene.meta || {}; return { url: m.sound_url || null, vol: m.sound_volume != null ? Number(m.sound_volume) : 0.5 }; };
function createAir() {
  const chans = new Map();                        // scene id → { o, el, url, base, level, target, retry }
  let focusId = null, hushed = false, master = 1, last = performance.now();
  function make(scene) {
    const s = soundOf(scene); if (!s.url) return null;
    const el = new Audio(); el.loop = true; el.preload = 'auto'; el.volume = 0; el.src = s.url;
    const c = { o: scene.scene_order, el, url: s.url, base: s.vol, level: 0, target: 0, retry: 0 };
    chans.set(scene.id, c);
    return c;
  }
  const play = (c, now) => { if (now < c.retry) return; c.retry = now + 600; const p = c.el.play(); if (p && p.catch) p.catch(() => {}); };   // a browser may hold sound back until the first touch
  (function tick() {
    requestAnimationFrame(tick);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    for (const c of chans.values()) {
      if (hushed) c.target = 0;
      c.level += (c.target - c.level) * (1 - Math.exp(-dt / (c.target > c.level ? 1.4 : hushed ? 0.22 : 0.6)));   // it comes in slowly, goes out quicker, and is cut short when a passage begins
      if (c.target < 0.002 && c.level < 0.004) c.level = 0;
      const v = Math.max(0, Math.min(1, c.level * c.base * master)); if (Math.abs(c.el.volume - v) > 0.002) c.el.volume = v;
      if (c.level > 0 && c.el.paused) play(c, now);
      else if (c.level === 0 && !c.el.paused) c.el.pause();                                  // out of hearing it does not run at all
    }
  })();
  const kick = () => { const now = performance.now(); for (const c of chans.values()) if (c.level > 0 && c.el.paused) play(c, now); };
  window.addEventListener('pointerdown', kick); window.addEventListener('keydown', kick);
  return {
    /** The walker is `d` from this scene's thing: its sound is that loud (and only its own). */
    hear(scene, d) {
      let t;
      if (hushed) t = 0;
      else if (focusId === scene.id) t = 1;
      else { const rad = Number(scene.meta && scene.meta.sound_radius) || 15, reach = SOUND_REACH * Math.max(0.6, Math.min(1.4, rad / 15)), k = 1 - smooth(SOUND_FULL, reach, d); t = k * k; }
      const c = chans.get(scene.id) || (t > 0.001 ? make(scene) : null);
      if (c) c.target = t;
    },
    /** Before its thing stands anywhere (the first text on the dark): this scene's sound at full, if it has one. Returns whether it has. */
    focus(scene) { focusId = scene ? scene.id : null; if (!scene) return false; const c = chans.get(scene.id) || make(scene); if (c) c.target = 1; return !!c; },
    /** A passage between scenes, and the ending: silence. */
    hush(on) { hushed = !!on; },
    fade() { hushed = true; },
    /** The pause sheet's volume: everything is that much quieter. */
    setMaster(v) { master = Math.max(0, Math.min(1, Number(v))); if (isNaN(master)) master = 1; },
    state: () => Array.from(chans.values()).map((c) => ({ o: c.o, url: c.url.split('/').pop(), level: +c.level.toFixed(2), target: +c.target.toFixed(2), volume: +c.el.volume.toFixed(2), paused: c.el.paused })),
  };
}

// ── which text does a visit read (the room stage's rules, js/roomplay/main.js) ─────────────
function layerOf(scene, n) {
  const own = scene.meta && scene.meta.room_text && scene.meta.room_text[String(n)];
  return (typeof own === 'string' && own.trim()) ? own : scene['text_stage_' + n];
}
function stageText(scene, visitN) {
  const depth = Number(run.memory.cont_depth) || 0;
  let st = depth <= 0 ? 0 : (depth >= DEPTH_STAGE_3 && layerOf(scene, 3)) ? 3 : (depth >= DEPTH_STAGE_2 && layerOf(scene, 2)) ? 2 : layerOf(scene, 1) ? 1 : 0;
  st = Math.min(3, st + (visitN - 1));
  // a memory made in record-space.html has no layer 1 of its own: a return visit climbs to the next layer that exists (2, then 3) instead of falling back to the text as written (261123)
  if (visitN > 1 && st > 0 && !layerOf(scene, st)) { let up = st; while (up < 3 && !layerOf(scene, up)) up++; if (layerOf(scene, up)) st = up; }
  const rs = riggedStage(rigOf(run.memory, qs), visitN, scene);
  if (rs != null) { st = rs; if (visitN === 1 && !layerOf(scene, st)) st = 0; }
  while (st > 0 && !layerOf(scene, st)) st--;
  return { stage: st, text: st ? layerOf(scene, st) : scene.text };
}
// normLine: blank.js's (the same rule, and it drops the no-width marks a changed word carries)
/** Whose line it is: the text's (as written) · the walker's · someone's who walked before (layer 2) · changed (layer 3). Read off the texts — no model, no judgement. */
function lineOwner(scene, stage) {
  const author = new Set(sentences(scene.text).concat(sentences(scene.text_stage_1 || '')).map(normLine));
  const mine = new Set((run.said.get(scene.id) || []).map(normLine));
  return (l) => { const n = normLine(l); if (!n) return 'text'; if (mine.has(n)) return 'mine'; if (author.has(n)) return 'text'; return stage === 2 ? 'other' : stage >= 3 ? 'changed' : 'text'; };
}
const asRead = (l) => (/^[…\s.]*$/.test(l) ? '…' : String(l).trim());

// ── the second part of a scene ──────────────────────────────────────────────
// A scene is read in two parts of about five short lines. The first is the scene's text. The second is the
// author's own (scenes.meta.space.b: lines, or one text) — and until it is written, the scene's other
// manuscript lines already stored with it (the words set afloat, the words buried, what its things say:
// scenes.meta.piece.props). Nothing is composed here.
function pieceLines(scene) {
  const sp = scene.meta && scene.meta.space;                                // written for this stage: { words:[…], deep:[…] } (the English copy — it has no piece-stage props)
  if (sp && (Array.isArray(sp.words) || Array.isArray(sp.deep))) return { words: (sp.words || []).map((t) => String(t).trim()).filter(Boolean), deep: (sp.deep || []).map((t) => String(t).trim()).filter(Boolean) };
  const props = (scene.meta && scene.meta.piece && Array.isArray(scene.meta.piece.props)) ? scene.meta.piece.props : [];
  const words = props.filter((p) => p && p.kind === 'word' && p.text).map((p) => String(p.text).trim());
  const deep = props.filter((p) => p && (p.kind === 'buried' || (p.kind === 'object' && p.role === 'speaking')) && p.text).map((p) => String(p.text).trim());
  return { words, deep };
}
function partB(scene) {
  const own = scene.meta && scene.meta.space && scene.meta.space.b;
  if (Array.isArray(own) && own.length) return { lines: own.map(String).filter((l) => l.trim()), authored: true, left: null };
  if (typeof own === 'string' && own.trim()) return { lines: sentences(own), authored: true, left: null };
  const { words, deep } = pieceLines(scene), n = Math.max(0, 5 - deep.length);
  return { lines: words.slice(0, n).concat(deep).slice(0, 5), authored: false, left: words.slice(n) };
}

/** Back at a scene: after its text, what the walker said here before stands in it, and the scene's lines not read yet. */
function partBack(scene) {
  const seen = run.shown.get(scene.id) || new Set(), pl = pieceLines(scene);
  const mine = (run.said.get(scene.id) || []).slice(-2).map((t) => ({ t, raw: t, who: 'mine', cls: 'rp-mine sb-old' }));
  const rest = pl.words.concat(pl.deep).filter((l) => !seen.has(normLine(l))).slice(0, 3).map((t) => ({ t, raw: t, who: 'text', cls: '' }));
  return mine.concat(rest);
}

// ── the form of what was said ───────────────────────────────────────────────
// A surface rule, not grammar and not a model: a line is a question when it carries a question mark, or a
// question word together with an ending a question can end on. (Indefinites — 누군가, 어딘가, 뭔가 — are not question words.)
const Q_INDEF = /(누군가|누구든|어딘가|어디선가|어디든|언젠가|무언가|뭔가|왠지|어쩐지|아무)/g;
const Q_WORD = /(누구|누가|누굴|왜|어디|언제|무엇|무얼|뭐|뭘|뭔|어떻게|어째서|무슨|얼마|몇|어느)/;
const Q_END = /[까니냐나가지죠요어아야데래대]$/;
export function isQuestion(text) {
  const s = String(text || '').trim();
  if (/[?？]/.test(s)) return true;
  if (!ko) return /^(who|whom|whose|what|when|where|why|how|which|did|do|does|was|were|is|are|am|can|could|would|will|should|have|has|had)\b/i.test(s);
  const core = s.replace(/[.!…~\s]+$/g, '').replace(Q_INDEF, '');
  return Q_WORD.test(core) && Q_END.test(core);
}
// the words of a line that carry it (set afloat by the thing it was said to): the longest two, function words left out
const WEAK = new Set(['나는', '내가', '나도', '나를', '그냥', '그건', '그게', '그때', '이건', '이게', '정말', '너무', '아주', '조금', '있다', '있었다', '없다', '없었다', '했다', '한다', '같다', '같았다', '그리고', '그런데', '하지만', '그래서', '것', '것이', '것을', '거야', '그', '이', '저', '왜', '뭐', '어디', '누가', '누구', '언제', 'the', 'and', 'that', 'this', 'was', 'were', 'have', 'with', 'what', 'who', 'why', 'how']);
function strongWords(text) {
  const ws = String(text || '').split(/[\s.,!?…"'“”‘’·\-—()]+/).filter((w) => w.length >= 2 && !WEAK.has(w.toLowerCase()));
  return ws.map((w, i) => ({ w, i })).sort((a, b) => (b.w.length - a.w.length) || (a.i - b.i)).slice(0, 2).sort((a, b) => a.i - b.i).map((x) => x.w);
}

// ── the regulated exchange ──────────────────────────────────────────────────
// Three lines that are not crossed (the same as the terrain stage's ghost talk, js/ui/lumen_dialog_phase1.js):
//   1. a line that carries a crisis is not taken in: it is not sent, not measured, not kept. Help is shown.
//   2. a line that is abuse, obscenity or an instruction to the model is not sent: the scene says nothing to it.
//   3. an answer that is empty, too long, or carries a crisis word is not shown.
const CRISIS = ['자살', '죽고싶', '죽고 싶', '죽이', '죽일', '자해', '베다', '베고', '뛰어내리', '목매', '약 먹',
  'kill myself', 'suicide', 'self harm', 'self-harm', 'want to die', 'wanna die', 'end my life', 'end it all',
  'hurt myself', 'cut myself', "don't want to live", 'dont want to live', 'don’t want to live', 'no reason to live', 'overdose', 'jump off'];   // = lumen_dialog_phase1 DEFAULTS.crisisKeywords (+ a spaced form)
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
async function replyOf(scene, raw, history) {
  if (DRY) return '';
  try {
    const r = await data.client().functions.invoke('dialog-turn', { body: { memoryId: run.memory.id, sceneId: scene.id, userInput: String(raw).slice(0, 500), history, lang: LANG } });
    const text = (!r.error && r.data && r.data.ok && typeof r.data.reply === 'string') ? r.data.reply.trim() : '';
    if (!text) { console.warn('[space] no reply', (r.data && r.data.reason) || (r.error && r.error.message)); return ''; }
    if (hasCrisis(text) || /https?:\/\//i.test(text)) { console.warn('[space] a reply was held back'); return ''; }
    // the rule is one or two sentences inside 120 letters: whole sentences are kept while they fit, what runs past is not shown
    let out = '';
    for (const sn of sentences(text.replace(/\s+/g, ' '))) { if (out && out.length + 1 + sn.length > 120) break; out = out ? out + ' ' + sn : sn; }
    return out.slice(0, 160);
  } catch (e) { console.warn('[space] dialog-turn', e); return ''; }
}
async function measure(raw, context) {
  if (DRY) {                                                                // practice without calls: a fixed made-up reading, so the rest can be walked
    const o = {}; run.engine.axes.forEach((k, i) => { o[k] = +(0.15 + 0.7 * hashStr(raw + k + i)).toFixed(3); });
    return { base: o, reason_analysis: { is_void: false } };
  }
  return data.analyzeEmotion(raw, run.engine.axes, context);
}

// ── the text column: the room stage's, with a plain line to write on (no connective) ───────
function createTalk() {
  const root = $('rpRoom'), room = createRoom(root, LANG, 1 / FAST), box = root.querySelector('.rp-input');
  function ask(o) {
    box.innerHTML = '';
    const guide = document.createElement('div'); guide.className = 'rp-guide';
    typeText(guide, (o && o.guide) || (ko ? '떠오르는 것을 말하거나, 물을 수 있습니다.' : 'Say what comes back to you, or ask.'), { per: 30 });
    const write = document.createElement('div'); write.className = 'sp-write';
    const field = document.createElement('input'); field.type = 'text'; field.maxLength = 90; field.autocomplete = 'off'; field.spellcheck = false; field.setAttribute('aria-label', ko ? '하는 말' : 'your line');
    const send = document.createElement('button'); send.className = 'rp-send'; send.type = 'button'; send.textContent = '↵'; send.setAttribute('aria-label', ko ? '보내기' : 'send');
    write.append(field, send); box.append(guide, write);
    let silentBtn = null;
    if (o && o.allowSilence) { silentBtn = document.createElement('button'); silentBtn.type = 'button'; silentBtn.className = 'rp-silent'; silentBtn.textContent = ko ? '말없이 있는다' : 'stay silent'; box.appendChild(silentBtn); }
    box.classList.add('on');
    setTimeout(() => { if (!('ontouchstart' in window)) field.focus(); }, 300);
    return new Promise((resolve) => {
      const done = (v) => { box.classList.remove('on'); setTimeout(() => { if (!box.classList.contains('on')) box.innerHTML = ''; }, 900); resolve(v); };
      const submit = () => { const text = field.value.trim(); if (!text) { field.focus(); return; } done({ text }); };
      send.addEventListener('click', submit);
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) submit(); });
      if (silentBtn) silentBtn.addEventListener('click', () => done({ silent: true }));
    });
  }
  return Object.assign({}, room, { ask });
}

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  document.documentElement.lang = LANG;
  if (!ko) { document.title = 'TEM — scenes afloat'; const mc = $('spMap'); if (mc) mc.setAttribute('aria-label', 'the scenes passed'); }
  const ref = qs.get('memory') || DEFAULT_MEMORY;
  const line = $('spEntryLine'), btn = $('spEnter'), note = $('spEntryNote');
  let loaded;
  try { loaded = await data.loadMemory(ref); } catch (e) { line.textContent = ko ? '기억을 불러오지 못했습니다.' : 'The memory could not be loaded.'; veil(false); console.error(e); return; }
  run.memory = loaded.memory; run.scenes = loaded.scenes;
  if (!run.scenes.length) { line.textContent = ko ? '이 기억에는 장면이 없습니다.' : 'This memory has no scenes.'; veil(false); return; }
  run.engine = createEngine(run.scenes, { frame: qs.get('frame') });
  [run.ghosts, run.rows] = await Promise.all([data.loadGhostLines(run.memory.id), loadLedger(run.memory.id)]);
  { const rg = rigOf(run.memory, qs), n = rg && Number(rg.ghost_min_len); if (n > 0) run.ghosts = run.ghosts.filter((g) => String(g.utterance).trim().length >= n); }
  run.acc = accumulate(run.scenes, run.rows, run.engine.axes, [data.TEST_PERSONA]);
  run.inherited = inheritEdits(await loadPaperJournals(run.memory.id)); run.edits = createEdits(run.inherited);   // what earlier walkers wrote and moved is read so (two in three)
  try { await Promise.race([document.fonts.load('300 64px "Noto Serif KR"', '기억'), new Promise((r) => setTimeout(r, 2500))]); } catch (_) {}   // letters drawn in the place use the page's serif, not a system fallback

  air = createAir();
  talk = createTalk();
  strips = createStrips({ locked: () => !!(cosmos && cosmos.locked()) });
  talk.body.addEventListener('click', (e) => { const p = e.target.closest && e.target.closest('p.rp-line.sb-can'); if (p && strips.held()) lay(p); });   // a strip in hand is laid on any line the walker chooses
  cosmos = createCosmos({ canvas: $('spCosmos'), memoryCode: run.memory.code, speed: FAST, on: { onNear, onFrame, onLand, onRelease: () => { $('rpWalk').textContent = ko ? '날기' : 'fly'; }, onLock: (l) => $('spAim').classList.toggle('on', l), onEscape: () => { if (pause && !run.ended) { letGoMark(); pause.open(); } } } });
  map = createStarMap({ wrap: $('spMapWrap'), canvas: $('spMap'), memoryCode: run.memory.code, onPick: returnBy, onOpen: () => cosmos.unlock(), onClose: () => { if (cosmos.mode() === 'fly') cosmos.relock(); } });
  $('rpWalk').textContent = ko ? '날기' : 'fly';
  // the back doors (a door onto a scene already read) live in the place, so they come after it
  backs = createBackDoors({ cosmos, ko, canEnter: () => !run.busy && !run.crossing && !run.ended && !map.isOpen() && !(pause && pause.isOpen()),
    onEnter: (d) => { const from = sceneById(d.from), to = sceneById(d.to); if (from && to && !run.crossing && !run.busy) { run.backLog.push({ entered: from.scene_order, to: to.scene_order }); cross(from, to, null, 'old'); } } });
  // Esc, at any time: the pause sheet (brightness · volume · leave). The browser keeps the Esc that lets the cursor go, so cosmos tells us (onEscape) too.
  pause = createEscMenu({ ko, setVolume: (v) => { air.setMaster(v); cosmos.setVolume(v); }, busy: () => map.isOpen(),
    onOpen: () => { if (cosmos.locked()) cosmos.unlock(); else cosmos.hold(letGo); },
    onClose: (byHand) => { letGo = false; if (byHand && (cosmos.mode() === 'fly' || cosmos.mode() === 'walk') && !map.isOpen()) cosmos.relock(); },
    onLeave: () => { try { sessionStorage.setItem('tem_menu_after_ending', '1'); } catch (_) {} location.href = qs.get('back') || (location.protocol === 'file:' ? 'index.html' : './'); } });
  Object.assign(window.__space, { cosmos, talk, map, air, finish, pause, strips, backs, tear, lay });
  setupFlyButton();
  // the map without first letting the cursor go: the right mouse button (author, 261123 — Esc, then a press, was one step too many)
  window.addEventListener('contextmenu', (e) => { if (pause && pause.isOpen()) return; e.preventDefault(); if (run.ended || run.busy || run.crossing) return; if (map.isOpen()) map.close(); else if (cosmos.mode() === 'fly') map.open(); });
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !/^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '') && cosmos.mode() === 'fly') map.toggle(); });

  if (PEEK) return peek();
  const first = firstScene();
  const begin = async () => {
    $('spEntry').classList.add('gone');
    cosmos.ensureAudio();
    const has = air.focus(first);                                           // the first scene's own sound (if it has one) comes in under its text
    await wait(has ? 2600 : 900);
    if (AT === 'end') return fakeWalk().then(finish);
    if (AT === 'space') { fakeStay(first); }
    else {
      try { const res = await stay(first, 'start', { dark: true }); run.firstRes = res; run.firstLeft = res.left; }
      catch (e) { console.error('[space] first stay', e); run.busy = false; talk.hide(); toast(ko ? '첫 장면을 읽지 못했습니다' : 'The first scene could not be read'); fakeStay(first); }   // the place still opens
    }
    await openEyes(first);
    if (MODE === 'test' && qs.get('strip')) strips.give({ from: first.id, order: first.scene_order, text: qs.get('strip') }, null);   // practice: a strip already in hand
  };
  if (qs.get('from') === 'opening' || AT) { $('spEntry').classList.add('gone'); veil(false); return begin(); }
  // opened on its own: the opening's one line, and a touch (a browser gives no sound before one)
  veil(false);
  await wait(900);
  await typeText(line, ko ? '지금부터 너는 한 기억을 떠올리게될거야' : 'you are about to remember something', { per: 70, pace: 1 / FAST });
  typeText(note, MODE === 'author' ? (ko ? '작가의 걸음으로 기록됩니다' : 'recorded as the author\'s walk') : MODE === 'test' ? (ko ? '연습 걸음 — 남지 않습니다' : 'practice — nothing is kept') : '', { per: 30 });
  btn.textContent = ko ? '떠올린다' : 'remember'; btn.disabled = false;
  btn.addEventListener('click', () => { if (btn.disabled) return; btn.disabled = true; begin(); });
}
/** Every row of the ledger for this memory (the accumulated model counts all of them, as the admin's does). */
async function loadLedger(memoryId) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await data.client().from('plays').select('run_id, scene_id, created_at, persona_id, alignment, user_emotion').eq('memory_id', memoryId).not('run_id', 'is', null).order('created_at').range(from, from + 999);
    if (r.error) { console.warn('[space] ledger', r.error); break; }
    out.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) break;
  }
  return out;
}
/** Earlier walks of this stage on this memory, oldest first, with what each wrote and moved (run_journals.run_traces.edits; scenes by order → id). */
async function loadPaperJournals(memoryId) {
  try {
    const r = await data.client().from('run_journals').select('run_id, created_at, run_traces').eq('memory_id', memoryId).eq('input_form', data.STAGE_TAG).order('created_at');
    if (r.error) { console.warn('[paper] journals', r.error); return []; }
    const idOf = (order) => { const sc = run.scenes.find((x) => x.scene_order === order); return sc ? sc.id : null; };
    return (r.data || []).filter((j) => j.run_traces && j.run_traces.blank_form === 'paper_v1' && Array.isArray(j.run_traces.edits))
      .map((j) => ({ run_id: j.run_id, edits: j.run_traces.edits.map((e) => ({ scene: idOf(e.scene), line: e.line, kind: e.kind, text: e.text, from: e.from ? idOf(e.from) : null })).filter((e) => e.scene) }));
  } catch (e) { console.warn('[paper] journals', e); return []; }
}
function firstScene() {
  const rig = rigOf(run.memory, qs);
  return (rig && run.scenes.find((s) => s.scene_order === rig.spine[0])) || run.scenes[0];
}

// ── a stay: the scene's two parts, an exchange after each ───────────────────
async function stay(scene, via, o) {
  run.busy = true;
  const dark = !!(o && o.dark);
  if (!dark) {
    cosmos.setMode('held'); map.close(); hint(''); $('rpWalk').classList.remove('on');
    const r = cosmos.things.get(scene.id);                                 // come to rest with the thing to one side of the text (above it on a narrow screen)
    if (r) cosmos.settle(r.pos, { dist: 10.5, side: innerWidth < 760 ? 0 : (hashStr(scene.id + 'side') < 0.5 ? -1 : 1), ms: 2200 });
  }
  run.visited.add(scene.id);
  if (run.path[run.path.length - 1] !== scene.id) run.path.push(scene.id);
  const visitN = (run.stays.get(scene.id) || 0) + 1, back = visitN > 1;      // a return is a reading too: the 2nd, the 3rd
  run.stays.set(scene.id, visitN);
  const silent = isSilent(scene), tv = stageText(scene, visitN), own = lineOwner(scene, tv.stage);
  const before = run.shown.get(scene.id) || new Set();
  // the lines as they stand now: the manuscript's, or what stands in their place (written on parchment, or a laid strip)
  const rawA = silent ? [] : sentences(tv.text).map(closed), matched = run.edits.match(scene.id, rawA);   // an edit stays on its line when a later layer rewrote the sentence (word overlap)
  const partA = rawA.map((raw, i) => {
    const e = matched[i];
    return e ? { t: e.text, raw: e.key, who: e.owner === 'mine' ? 'mine' : 'other', edit: e, cls: '' } : { t: raw, raw, who: own(raw), edit: null, cls: '' };
  });
  const pb = (silent || back) ? { lines: [], authored: false, left: [] } : partB(scene);
  const partTwo = back ? partBack(scene) : pb.lines.map((l) => ({ t: l, raw: l, who: 'text', edit: null, cls: '' }));
  const parts = [partA, partTwo].filter((p) => p.length);
  // the mismatch: the first line standing now that is not one the walker read here (no edit, not theirs) — its black paper has lifted
  const looseAt = (back && !silent) ? partA.findIndex((ln) => !ln.edit && ln.who !== 'mine' && !before.has(normLine(ln.t))) : -1;
  const shown = [], script = [], turns = [], emos = [], history = [], seen = new Set(before);
  let anyVoid = 0, lastAlign = run.last ? run.last.turnAlignment : 0.5, lastReply = '';
  stayCtx = { scene, laid: [], torn: [] };
  talk.clear(); talk.show();
  if (!dark) await wait(1500);

  const exchange = async (i, allowSilence) => {
    let answer;
    for (;;) {
      answer = await talk.ask({ allowSilence, guide: strips.count() ? (ko ? '말하거나 물을 수 있습니다 — 떼어낸 종이를 글의 아무 문장 위에나 대면, 그 문장을 덮습니다.' : 'Say something, or ask — or lay the strip you carry over any line of the text: it covers that line.') : null });
      if (answer.silent) return null;
      const g = guard(answer.text);
      if (g.ok) break;
      await talk.say(ko ? '……아냐, 이건 너무 날카로워.' : '……no. this one cuts too sharp.', 'rp-narr', { gap: true });
      if (g.help) { const S = window.LumenSafety, res = (S && S.getSafetyResources ? S.getSafetyResources(LANG) : []).map((r) => r.name + ' ' + r.number).join(' · '); if (res) await talk.say(res, 'rp-narr', {}); }
    }
    const raw = answer.text, question = isQuestion(raw), ok = sendable(raw);
    script.push({ t: raw, who: 'mine' });
    await talk.say(raw, 'rp-mine', { gap: true, hold: 400 });
    talk.waiting(true);
    const [an, rep] = await Promise.all([
      measure(raw, { scene_text: shown.join(' ').slice(-400), ghost_line: (lastReply || shown[shown.length - 1] || '').slice(0, 200) }),
      (ok && !silent) ? replyOf(scene, raw, history.slice()) : Promise.resolve(''),
    ]);
    talk.waiting(false);
    let align = lastAlign, res = 'vague', isVoid = false, emo = null;
    if (an) {
      emo = parseEmotion(an.base); isVoid = !!(an.reason_analysis && an.reason_analysis.is_void);
      const a = run.engine.alignmentTo(scene, emo);
      align = a > 0 ? a : lastAlign; res = resonanceOf(align); lastAlign = align;
      emos.push(emo); if (isVoid) anyVoid++;
    }
    if (rep) { await talk.say(rep, 'rp-ghost', { gap: true, hold: 900 }); history.push({ role: 'user', content: raw }, { role: 'assistant', content: rep }); lastReply = rep; }
    if (!run.said.has(scene.id)) run.said.set(scene.id, []);
    run.said.get(scene.id).push(raw);
    if (question) { if (!run.asked.has(scene.id)) run.asked.set(scene.id, []); run.asked.get(scene.id).push(raw); }
    turns.push({ turn: i + 1, raw_text: raw, alignment: align, resonance: res, ghost_reply: rep || '', via: rep ? 'dialog_turn' : (ok ? 'no_reply' : 'not_sent'), ts: Date.now(),
      input_form: 'talk_v1', stage: data.STAGE_TAG, place: PLACE_TAG, form: 'talk2_v1', visit: visitN, text_stage: tv.stage, arrived: via, analysed: !!an, odd: !!an && isVoid, question });
    if (MODE !== 'test' && !silent && ok) data.absorbLine({ memoryId: run.memory.id, utterance: raw, motifTags: ((scene.meta && scene.meta.motif_tags) || []).slice(0, 3) });
    return { raw, emo };
  };

  if (silent) {
    shown.push('…'); script.push({ t: '…', who: 'text' });
    await talk.say('…', 'rp-void', { hold: 2600 });
    await exchange(0, true);
  } else {
    for (let i = 0; i < parts.length; i++) {
      for (let k = 0; k < parts[i].length; k++) {
        const ln = parts[i][k], p = await talk.say(ln.t || '\u00a0', ln.cls, { gap: i > 0 && k === 0 });
        const entry = { t: asRead(ln.t || ''), who: ln.who }; if (ln.edit) entry.paper = ln.edit.kind; script.push(entry);
        shown.push(ln.t); seen.add(normLine(ln.raw)); if (ln.t) seen.add(normLine(ln.t));
        p._sb = { entry, scene, raw: ln.raw, edit: ln.edit, who: ln.who };
        if (ln.edit) dressEdit(p, ln.edit);
        else if (ln.who !== 'mine') p.classList.add('sb-can');            // a strip in hand can be laid on it
        if (i === 0 && k === looseAt) hangTab(p, { ko, onTear: () => tear(p) });   // the two tellings do not fit here: the paper has lifted
      }
      await exchange(i, back);                                                // back at a scene one may stay silent
    }
  }
  while (laying) await wait(120);                                             // a strip still being laid is let finish
  for (const p of stayCtx.torn) if (p._sb && p._sb.ctl && !p._sb.ctl.isDone()) p._sb.ctl.seal();   // torn and not written: the parchment stays bare
  run.shown.set(scene.id, seen);

  // the whole stay, read once (the room stage's rule: the mean of the turns, one engine step, one ledger row)
  const mean = {};
  for (const e of emos) for (const k in e) mean[k] = (mean[k] || 0) + (Number(e[k]) || 0) / emos.length;
  const userVoid = emos.length > 0 && anyVoid === emos.length;
  let alignment = lastAlign, eng = null;
  if (emos.length) { const a = run.engine.alignmentTo(scene, mean); alignment = a > 0 ? a : lastAlign; eng = run.engine.step(scene, mean, userVoid); run.readings.set(scene.id, mean); }
  else if (turns.length) toast(ko ? '감정 측정에 실패했습니다 — 이 걸음은 직전 결로 이어집니다' : 'The reading failed — this step follows the last one');
  const resonance = resonanceOf(alignment);
  const pattern = eng ? eng.transition_pattern : (!turns.length ? (silent ? 'echo_follow' : 'avoidance') : ((run.last && run.last.pattern) || 'bridge'));
  run.last = { pattern, alignment: eng ? eng.alignment_score : (!turns.length && silent ? 0.7 : 0.4), bucket: eng ? eng.alignment_bucket : 'MID', turnAlignment: alignment };
  run.script.push({ scene_id: scene.id, order: scene.scene_order, visit: visitN, stage: tv.stage, back, at: dark ? 0 : cosmos.track.length, lines: script });   // at = where on the walked line this was read (the ending follows it)

  // contact — a rare event, once per run: a line someone left is heard
  if (turns.length && resonance === 'resonance' && !run.contact && !silent) {
    run.contact = true;
    const g = nearestGhost(mean, run.ghosts), name = scene.meta && scene.meta.ghost_name;
    if (g) await talk.say(g.utterance, 'rp-ghost rp-left', { gap: true, src: name ? '— ' + name : (ko ? '— 누군가 여기 두고 간 말' : '— something someone left here'), hold: 1800 });   // italic + tag: a person's line, never the scene's answer
    if (MODE !== 'test') data.recordContact({ memoryId: run.memory.id, sceneId: scene.id, utterance: turns[turns.length - 1].raw_text.slice(0, 300), turn: turns.length, runId: run.id });
  }
  const paperHere = { torn: stayCtx.torn.length, laid: stayCtx.laid.slice() };
  if (turns.length && (paperHere.torn || paperHere.laid.length)) turns[0].paper = paperHere;

  // a return gives no new door: the scene's own door still stands where it was written (the walker goes on by it, or by the map)
  const rig = rigOf(run.memory, qs);
  let next = back ? { scene: null, mode: 'back', ranked: [] }
           : rig ? riggedDoor({ rig, engine: run.engine, scenes: run.scenes, origin: scene, pattern, userEmotion: mean, isVoid: userVoid, visited: run.visited })
                 : run.engine.pickNext({ origin: scene, pattern, userEmotion: mean, isVoid: userVoid, visited: run.visited });
  // a door back into the same scene is not given on this stage yet: the nearest scene not yet seen, as for a crossing
  if (next.mode === 'same') next = Object.assign(run.engine.pickNext({ origin: scene, pattern: 'bridge', userEmotion: mean, isVoid: userVoid, visited: run.visited }), { was: 'same' });

  if (turns.length && MODE !== 'test') {                                    // a practice walk leaves no row at all (261121: its rows were being counted by the admin's model)
    await data.insertPlay({ memory_id: run.memory.id, scene_id: scene.id, user_emotion: mean, alignment, mismatch_type: resonance, run_id: run.id, ghost_variant_id: null, dialog_turns: turns,
      persona_id: MODE === 'author' ? data.AUTHOR_PERSONA : null });
  }
  run.rooms.push({ order: run.rooms.length + 1, scene_id: scene.id, scene_order: scene.scene_order, visit: visitN, back, text_stage: tv.stage, part_b: back ? 'back' : pb.authored ? 'authored' : 'from_piece', seen_text: shown.join(' '),
    paper: paperHere,
    silent: !turns.length, user_emotion: mean, turn_alignment: +alignment.toFixed(4), resonance,
    turns: turns.map((t) => ({ text: t.raw_text, alignment: +t.alignment.toFixed(4), resonance: t.resonance, reply: t.ghost_reply, via: t.via, question: t.question })),
    engine: eng ? { alignment: eng.alignment_score, bucket: eng.alignment_bucket, pattern: eng.transition_pattern, mismatch: eng.mismatch_type } : null,
    door: next.scene ? { to: next.scene.scene_order, mode: next.mode, pattern, rig: !!next.rig } : (next.mode === 'end' ? { to: null, mode: 'end', rig: true } : null), ranked: (next.ranked || []).slice(0, 5), shadow: next.shadow || null });

  await wait(900);
  talk.hide();
  stayCtx = null;
  run.busy = false;
  return { scene, next, pattern, mean, left: pb.left || [], turns, back };
}

// ── the paper ───────────────────────────────────────────────────────────────
/** The black paper over a line is torn off: the strip (with the line's words) goes into the hand; the parchment under it is bare, to be written on. */
function tear(p) {
  if (!p || !p._sb || p.classList.contains('sb-torn') || run.ended) return;
  const { scene, raw } = p._sb, holder = p.querySelector(':scope > span');
  const text = holder ? holder.textContent : raw, rect = holder ? holder.getBoundingClientRect() : null;
  p.classList.remove('sb-can');
  const ctl = tearLine(p, { ko, guard, sendable,
    onRefused: (kind) => { talk.say(ko ? '……아냐, 이건 너무 날카로워.' : '……no. this one cuts too sharp.', 'rp-narr', { gap: true }); if (kind === 'help') { const S = window.LumenSafety, res = (S && S.getSafetyResources ? S.getSafetyResources(LANG) : []).map((r) => r.name + ' ' + r.number).join(' · '); if (res) talk.say(res, 'rp-narr', {}); } },
    onSeal: (written) => seal(p, written) });
  p._sb.ctl = ctl;
  if (stayCtx && stayCtx.scene.id === scene.id) stayCtx.torn.push(p); else run.torn.push(p);
  strips.give({ from: scene.id, order: scene.scene_order, text }, rect);
  run.paper.push({ torn_at: scene.scene_order, line: normLine(raw), text });
  if (!run.paperHinted) { run.paperHinted = true; hint(ko ? '검은 종이가 떨어져 나왔다. 양피지에 쓸 수 있다 — 떼어낸 종이는 따라온다.' : 'The black paper came off. You can write on the parchment — the strip follows you.', 11000); }
}
/** What was written on the parchment stands in place of the line, for this walk and (two in three) for the next walker. '' = nothing: the parchment stays bare. */
function seal(p, written) {
  const { scene, raw, entry } = p._sb;
  const e = run.edits.set({ scene: scene.id, key: normLine(raw), kind: 'typed', text: written || '', owner: 'mine', from: null });
  p._sb.edit = e; entry.t = written || ''; entry.who = 'mine'; entry.paper = 'typed';
  run.paper.push({ wrote_at: scene.scene_order, line: normLine(raw), text: written || '' });
  const seen = run.shown.get(scene.id); if (seen && written) seen.add(normLine(written));
  if (written && MODE !== 'test' && sendable(written)) data.absorbLine({ memoryId: run.memory.id, utterance: written, motifTags: ((scene.meta && scene.meta.motif_tags) || []).slice(0, 3) });
}
/** The oldest strip in hand is laid over this line: the line is covered, the strip's sentence stands there. */
async function lay(p) {
  const info = strips.held();
  if (!info || !p || !p._sb || laying || run.ended || p.classList.contains('sb-torn') || p.classList.contains('sb-loose')) return;
  laying = true;
  try {
    strips.take();
    await layStrip(p, info);
    const { scene, raw, entry } = p._sb;
    const e = run.edits.set({ scene: scene.id, key: normLine(raw), kind: 'pasted', text: info.text, owner: 'mine', from: info.from });
    p._sb.edit = e; entry.t = info.text; entry.who = 'mine'; entry.paper = 'pasted'; p.classList.remove('sb-can');
    const seen = run.shown.get(scene.id); if (seen) seen.add(normLine(info.text));
    const rec = { laid_at: scene.scene_order, line: normLine(raw), from: info.order, text: info.text };
    run.paper.push(rec); if (stayCtx && stayCtx.scene.id === scene.id) stayCtx.laid.push(rec);
    cosmos.addWords(scene.id, [{ key: 'laid' + run.paper.length, text: info.text, kind: 'mine' }]);
  } catch (e) { console.error('[paper] lay', e); }
  laying = false;
}

function nearestGhost(userEmotion, pool) {
  let best = null, bs = -Infinity;
  for (const g of pool) { const s = cosObj(userEmotion, parseEmotion(g.emotion_vec)); if (s > bs) { bs = s; best = g; } }
  return best;
}
function cosObj(a, b) { let d = 0, na = 0, nb = 0; const keys = new Set(Object.keys(a).concat(Object.keys(b))); for (const k of keys) { const x = Number(a[k]) || 0, y = Number(b[k]) || 0; d += x * y; na += x * x; nb += y * y; } return na && nb ? d / Math.sqrt(na * nb) : 0; }

// ── what floats round a thing ───────────────────────────────────────────────
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
/** After the walker has spoken: their strong words hang by the thing, and the earlier lines nearest to their reading come closer. */
function afterSpeech(scene, res) {
  const mine = [];
  (run.said.get(scene.id) || []).forEach((t, i) => strongWords(t).forEach((w, j) => mine.push({ key: 'm' + i + '_' + j, text: w, kind: 'mine' })));
  cosmos.addWords(scene.id, mine.slice(0, 4));
  if (res.mean && Object.keys(res.mean).length) {
    const sim = new Map(run.ghosts.map((g) => ['g' + g.id, cosObj(res.mean, parseEmotion(g.emotion_vec))]));
    cosmos.leanWords(scene.id, (key) => (sim.has(key) ? Math.max(0, sim.get(key)) : 0.5));
  }
  cosmos.setAsked(scene.id, (run.asked.get(scene.id) || []).length > 0);   // a scene that was asked a question stands in broken lines
}

// ── eyes open ───────────────────────────────────────────────────────────────
async function openEyes(first) {
  const T = window.THREE;
  run.Q.set(first.id, [0, 0, 0]); run.arrived.add(first.id); run.here = first.id;
  const at = new T.Vector3(0, 2.6, 9.5);                                  // a little above it: a thing is read from its top as much as its side
  cosmos.placeThing(first, V3(run.Q.get(first.id)), at);
  cosmos.teleport(at, 0, 0); cosmos.face(V3(run.Q.get(first.id)));
  air.focus(null);                                                        // from here on, the distance to a thing decides what is heard
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
  if (next.mode === 'end' || !next.scene) { run.busy = true; await wait(next.mode === 'end' ? 3200 : 1800); return finish(); }   // busy: nothing else is begun while the walk closes
  if (next.mode === 'fallback') hint(ko ? '기억의 빈틈이 다른 장면을 끌어당긴다.' : 'A gap in the memory pulls another scene toward you.', 7000);
  await wait(1500);
  raiseDoor(scene, next.scene);
  raiseBackDoor(scene, next.scene);
  if (run.visited.size === 2 && !run.backHinted) {                         // said once: there is a reason to go back
    run.backHinted = true;
    setTimeout(() => { if (!run.ended && !run.busy && !run.crossing) hint(cosmos.isTouch() ? (ko ? '지나온 장면은 읽은 그대로 있지 않습니다 — 왼쪽 위 지도로 돌아가 볼 수 있습니다.' : 'A scene you passed does not stay as you read it — the map, top left, takes you back.') : (ko ? '지나온 장면은 읽은 그대로 있지 않습니다 — 지도(M)로 돌아가 볼 수 있습니다.' : 'A scene you passed does not stay as you read it — the map (M) takes you back.'), 11000); }, 9000 / FAST);
  }
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
  cosmos.lookToward(way.N.clone().lerp(door, 0.5).setY(door.y + 1.2), 2800);   // the eyes are turned to where it is being written
  return way;
}

/**
 * The back door: beside the door forward, about a hundred degrees round, a door standing open onto one of the scenes
 * already read (a fixed lottery on the run — never a scene not yet read). Through it that scene's figure is seen.
 * One per scene, for the whole walk. None at the first scene (nothing to go back to).
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
  const leg = { from: from.scene_order, to: to.scene_order, kind, pattern: run.last ? run.last.pattern : null, said: kind === 'map' ? '' : passWord(kind, run.last ? run.last.pattern : 'bridge'), place: run.place.get(to.id) ? { d: run.place.get(to.id).d, shift: run.place.get(to.id).shift, compared: run.place.get(to.id).compared } : null };
  hint(''); nearLine(null); map.close(); $('rpWalk').classList.remove('on');
  air.hush(true);                                                         // the passage between two scenes has no sound of either
  const fromPos = cosmos.pl.pos.clone();
  await veil(true);
  if (kind === 'map') await wait(350);                                     // picked on the map: dark, then there — no door, no line said
  else {
    const pass = $('rpPass');
    await wait(400);
    await typeText(pass, leg.said, { per: 110, pace: 1 / FAST });
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
  run.stub = kind === 'map' ? null : cosmos.openStub({ at: X, dir, key: run.id + 'stub' + run.legs.length });   // a door's far side: a short floor. From the map there is no door, so none
  const start = X.clone().addScaledVector(dir, 0.5).add(new T.Vector3(0, cosmos.EYE, 0));
  cosmos.carry(fromPos, start);
  cosmos.teleport(start, Math.atan2(-dir.x, -dir.z), 0);
  if (run.stub) cosmos.land(run.stub, 0.5);
  run.here = to.id; run.arrived.add(to.id); run.path.push(to.id); run.legs.push(leg);
  if (first) { run.pending = to.id; dress(to, partB(to).left); }
  else {
    if (run.visited.has(to.id)) { run.returns.set(to.id, (run.returns.get(to.id) || 0) + 1); run.returnDue = to.id; }   // only a scene that was read can be found changed
    if (kind !== 'new') logMove(from, to, kind === 'map' ? 'map_return' : 'door_return');
  }
  syncMap();
  await veil(false);
  air.hush(false);                                                        // the new place sounds for itself, by distance
  if (cosmos.isTouch()) $('rpWalk').classList.add('on');
  if (run.stub && !run.walkHinted) { run.walkHinted = true; hint(cosmos.isTouch() ? (ko ? '동그라미를 누르고 있으면 걷습니다' : 'hold the circle to walk') : (ko ? 'W 로 걷습니다' : 'W to walk'), 6000); }
  run.crossing = false;
}
/** A move that is not a stay is a walk all the same: it goes in the ledger (the piece stage's mark; no emotion, no alignment). */
function logMove(from, to, how) {
  if (MODE === 'test') return;
  data.insertPlay({ memory_id: run.memory.id, scene_id: to.id, user_emotion: null, alignment: null, mismatch_type: null, run_id: run.id, ghost_variant_id: null, persona_id: MOVE_PERSONA,
    dialog_turns: [{ stage: 'piece_v1', place: PLACE_TAG, move: how, from_scene_id: from.id, to_scene_id: to.id, at: new Date().toISOString() }] });
}

// ── near a thing ────────────────────────────────────────────────────────────
function onNear(id) {
  if (run.busy || run.crossing || run.ended) { const r = cosmos.things.get(id); if (r) r.armed = true; return; }
  const scene = sceneById(id); if (!scene) return;
  if (id !== run.here) {                                                   // flown to on one's own: that too is a walk
    const from = sceneById(run.here);
    run.legs.push({ from: from ? from.scene_order : null, to: scene.scene_order, kind: 'flight', pattern: null, said: '' });
    run.path.push(id); if (from) logMove(from, scene, 'flight');
    run.here = id; if (run.visited.has(id)) { run.returns.set(id, (run.returns.get(id) || 0) + 1); run.returnDue = id; } syncMap();
  }
  if (run.pending === id) { run.pending = null; if (run.returnDue === id) run.returnDue = null; stay(scene, 'door').then((res) => { cosmos.setMode('fly'); cosmos.relock(); if (cosmos.isTouch()) $('rpWalk').classList.add('on'); return afterStay(res); })
      .catch((e) => { console.error('[space] stay', e); run.busy = false; talk.hide(); if (!run.ended) { cosmos.setMode('fly'); run.pending = id; toast(ko ? '장면을 읽지 못했습니다 — 다시 다가가 주세요' : 'The scene could not be read — come near it again'); } });
    return; }
  if (run.returnDue === id && run.visited.has(id)) {                       // back at a scene already read: it is read in full again, as it stands now
    run.returnDue = null;
    stay(scene, 'return').then((res) => { cosmos.setMode('fly'); cosmos.relock(); if (cosmos.isTouch()) $('rpWalk').classList.add('on'); if (run.here === scene.id) afterSpeech(scene, res); })
      .catch((e) => { console.error('[space] return stay', e); run.busy = false; pressing = false; talk.hide(); if (!run.ended) cosmos.setMode('fly'); });
  }
}
let nearToken = 0;
async function nearLine(lines) {
  const box = $('spNear'), token = ++nearToken;
  box.innerHTML = ''; box.classList.toggle('on', !!lines);
  if (!lines) return;
  for (const l of lines) {
    if (token !== nearToken) return;
    const p = document.createElement('p'); if (l.who !== 'text') p.className = l.who; box.appendChild(p);
    await typeText(p, l.t, { pace: 1 / FAST });
    await wait(700);
  }
  await wait(9000);
  if (token === nearToken) { box.classList.remove('on'); box.innerHTML = ''; }
}

// ── the frame: sound by distance, the map ───────────────────────────────────
let mapTick = 0;
function onFrame(dt, time) {
  if (air) {
    if (run.ended) air.fade();                                              // the ending is silent
    else for (const r of cosmos.things.values()) air.hear(r.scene, r.pos.distanceTo(cosmos.pl.pos));
  }
  mapTick += dt;
  if (map && mapTick > 0.08) { mapTick = 0; map.walker(cosmos.pl.pos, cosmos.pl.yaw); }
  if (backs) backs.tick(dt);
}
function onLand() { $('rpWalk').textContent = ko ? '걷기' : 'walk'; if (run.landHinted) return; run.landHinted = true; hint(cosmos.isTouch() ? (ko ? '동그라미를 누르고 있으면 걷습니다' : 'hold the circle to walk') : (ko ? 'W 로 걷습니다' : 'W to walk'), 5000); }
function syncMap() {
  if (!map) return;
  const nodes = Array.from(run.arrived).map((id) => ({ id, scene: sceneById(id), pos: run.Q.get(id), here: id === run.here, asked: (run.asked.get(id) || []).length > 0, stayed: run.visited.has(id) }));
  const edges = []; for (let i = 1; i < run.path.length; i++) if (run.path[i] !== run.path[i - 1]) edges.push([run.path[i - 1], run.path[i]]);
  const d = run.here && run.doors.get(run.here);
  map.set(nodes, edges, d && d.way.live ? { pos: [d.way.D.x, d.way.D.y, d.way.D.z] } : null);
}
/** From the map: the scene pressed. A door stands at the very place on the screen that was pressed. */
function returnBy(id) {
  if (run.busy || run.crossing || run.ended || cosmos.mode() !== 'fly') return;
  const to = sceneById(id), from = sceneById(run.here);
  if (!to || !from || id === run.here) { map.close(); return; }
  map.close();
  if (run.backWay && run.backWay.live) cosmos.removeWay(run.backWay);       // (a door left from before this change)
  cross(from, to, null, 'map');
}
function setupFlyButton() {
  const b = $('rpWalk');
  const down = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} b.classList.add('down'); cosmos.setForward(true); };
  const up = () => { b.classList.remove('down'); cosmos.setForward(false); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
}

// ── the end ────────────────────────────────────────────────────────────────
/** A memory made in record-space.html: after each finished walk the server bakes the next layers of every scene's text from
 *  the ledger (bake-room-layers = tools/room-sim/bake_stage.mjs's rule, run on the server; docs/우주무대_기억만들기_결정-261123.md §굽기). Nothing waits for it. */
async function bakeLayers() {
  if (MODE === 'test' || !run.memory || !run.memory.meta || !run.memory.meta.space_record) return;
  try {
    const rows = await data.loadRoomPlays(run.memory.id);
    const st = replayFromPlays(rows.map((x) => ({ alignment: x.alignment, mismatch_type: x.mismatch_type, user_emotion: x.user_emotion })));
    const pres = getPresentationState(st);
    const contState = { cont_drift: st.cont_drift || 0, cont_fixation: st.cont_fixation || 0, drift_dir_v: st.drift_dir_v || 0, drift_dir_a: st.drift_dir_a || 0, drift_dir_d: st.drift_dir_d || 0, band: pres.band === 'weak' ? 'medium' : pres.band, stage: pres.stage };
    const r = await data.client().functions.invoke('bake-room-layers', { body: { memoryId: run.memory.id, contState } });
    if (r.error) console.warn('[space] bake', r.error); else console.info('[space] bake', r.data);
  } catch (e) { console.warn('[space] bake failed', e); }
}
async function finish() {
  if (run.ended) return; run.ended = true;
  hint(''); nearLine(null); map.close(); $('spMapWrap').classList.remove('on'); $('rpWalk').classList.remove('on'); talk.hide();
  if (strips.count()) run.paper.push({ unused: strips.count() });
  strips.drop();                                                            // a strip never laid down goes out with the walk
  if (backs) backs.hideAll();
  if (MODE !== 'test') {
    data.writeJournal(run.memory.id, run.id, { stage: data.STAGE_TAG, place: PLACE_TAG, mode: MODE, visit_order: run.path.map((id) => sceneById(id).scene_order),
      scenes: run.rooms, legs: run.legs, contact: run.contact, blank_form: 'paper_v1', paper: run.paper, back_doors: run.backLog,
      inherited: run.inherited.map((e) => ({ scene: sceneById(e.scene).scene_order, line: e.key, kind: e.kind, run: e.run })),   // what this walker read already changed
      edits: run.edits.own().map((e) => ({ scene: sceneById(e.scene).scene_order, line: e.key, kind: e.kind, text: e.text, from: e.from ? sceneById(e.from).scene_order : null })), model: Array.from(run.place).map(([id, p]) => ({ scene: sceneById(id).scene_order, from: sceneById(p.from).scene_order, compared: p.compared, d: p.d, shift: p.shift })),
      seconds: Math.round((Date.now() - run.startedAt) / 1000) });
    bakeLayers();                                             // a memory made in record-space.html: the next layers of its texts, from the ledger (fire and forget)
  }
  try {
    window.__space.finale = await runFinale({ cosmos, run, lang: LANG, fast: FAST, air, typeText, wait, sceneById,
      others: othersWalks(), title: run.memory.title || '', scroll: $('spScroll'), scrollInner: $('spScrollInner'), edits: run.edits.own(), inherited: run.inherited.length });
  } catch (e) { console.error('[space] finale', e); toast(ko ? '끝 화면을 그리지 못했습니다' : 'The ending could not be drawn'); await wait(2500); }
  await veil(true);
  // after the ending: the main screen (the menu), not the opening (author, 261121). index.html reads this once and skips the opening (js/app/bindEvents.js)
  const back = qs.get('back');
  if (!back) { try { sessionStorage.setItem('tem_menu_after_ending', '1'); } catch (_) {} }
  location.href = back || (location.protocol === 'file:' ? 'index.html' : './');   // the site's front page (a dev server may answer '/index.html' with nothing; '/' is served everywhere)
}
/** The walks of everyone before, as scene sequences (for the ending's other threads). */
function othersWalks() {
  const byRun = new Map(), ord = new Map(run.scenes.map((s) => [s.id, s.scene_order]));
  for (const p of run.rows) { if (!p.run_id || p.run_id === run.id || p.persona_id === data.TEST_PERSONA || !ord.has(p.scene_id)) continue; if (!byRun.has(p.run_id)) byRun.set(p.run_id, []); byRun.get(p.run_id).push(p); }
  const out = [];
  for (const rows of byRun.values()) {
    rows.sort((a, b) => (new Date(a.created_at) - new Date(b.created_at)) || (ord.get(a.scene_id) - ord.get(b.scene_id)));
    const seq = []; for (const r of rows) if (seq[seq.length - 1] !== r.scene_id) seq.push(r.scene_id);
    if (seq.length > 1) out.push(seq);
  }
  return out;
}

// ── practice helpers (test runs only) ───────────────────────────────────────
/** ?at=space — the first scene is taken as read (nothing is written, nothing is measured). */
function fakeStay(scene) {
  run.visited.add(scene.id); if (run.path[run.path.length - 1] !== scene.id) run.path.push(scene.id);
  const tv = stageText(scene, 1), own = lineOwner(scene, tv.stage), pb = partB(scene), seen = new Set();
  const lines = sentences(tv.text).map((l) => ({ t: asRead(l), who: own(l) })).concat(pb.lines.map((l) => ({ t: l, who: 'text' })));
  lines.forEach((l) => seen.add(normLine(l.t))); run.shown.set(scene.id, seen);
  run.stays.set(scene.id, 1);
  run.script.push({ scene_id: scene.id, order: scene.scene_order, visit: 1, stage: tv.stage, lines });
  const rig = rigOf(run.memory, qs), mean = {};
  run.last = { pattern: 'bridge', alignment: 0.5, bucket: 'MID', turnAlignment: 0.5 };
  const next = rig ? riggedDoor({ rig, engine: run.engine, scenes: run.scenes, origin: scene, pattern: 'bridge', userEmotion: mean, isVoid: false, visited: run.visited })
                   : run.engine.pickNext({ origin: scene, pattern: 'bridge', userEmotion: mean, isVoid: false, visited: run.visited });
  run.firstRes = { scene, next, pattern: 'bridge', mean, left: pb.left || [], turns: [] }; run.firstLeft = pb.left || [];
}
/** ?at=end — a walk is made up (the rigged route, a wandering line round each thing) so the ending can be looked at. */
async function fakeWalk() {
  const T = window.THREE, rig = rigOf(run.memory, qs);
  const order = rig ? [1, 2, 8, 3, 4, 9, 5, 6, 11, 7] : run.scenes.slice(0, 8).map((s) => s.scene_order);
  const seq = order.map((n) => run.scenes.find((s) => s.scene_order === n)).filter(Boolean);
  cosmos.start(); cosmos.setMode('held');
  let prev = null, t = 0;
  for (const sc of seq) {
    if (!prev) run.Q.set(sc.id, [0, 0, 0]);
    else if (!run.Q.has(sc.id)) run.Q.set(sc.id, placeNext(run.acc, run.Q, prev.id, sc.id, null).pos);
    const q = V3(run.Q.get(sc.id)); cosmos.placeThing(sc, q, null); if (prev) cosmos.link(prev.id, sc.id);
    run.arrived.add(sc.id); run.visited.add(sc.id); run.path.push(sc.id);
    if (prev) { const a = cosmos.track[cosmos.track.length - 1]; cosmos.track.push({ x: a.x, y: a.y, z: a.z, t, k: 2 }, { x: q.x - 20, y: q.y - 2, z: q.z, t, k: 2 }); }
    const n = 46, ph = hashStr(sc.id) * 6.28;
    for (let i = 0; i < n; i++) { const a = ph + (i / n) * 5.2, r = 20 - 13 * Math.sin((i / n) * Math.PI); t += 0.3; cosmos.track.push({ x: q.x + Math.cos(a) * r, y: q.y - 2 + 3 * Math.sin(a * 1.7), z: q.z + Math.sin(a) * r, t, k: 0 }); }
    const tv = stageText(sc, 1), own = lineOwner(sc, tv.stage);
    run.script.push({ scene_id: sc.id, order: sc.scene_order, visit: 1, stage: tv.stage, at: cosmos.track.length - 20, lines: sentences(tv.text).map((l) => ({ t: asRead(l), who: own(l) })).concat([{ t: ko ? '(연습 걸음의 말)' : '(a practice line)', who: 'mine' }]) });
    prev = sc;
  }
  run.here = prev.id;
  const q = V3(run.Q.get(prev.id)); cosmos.teleport(q.clone().add(new T.Vector3(0, 0.4, 9)), 0, 0);
  $('spCosmos').classList.add('on');
  await veil(false); await wait(1200);
}
/** ?peek=1 — every thing of the memory stood where the ledger's model has it, to be flown round and looked at. */
async function peek() {
  $('spEntry').classList.add('gone');
  for (const s of run.scenes) { const p = run.acc.pos.get(s.id); run.Q.set(s.id, [p[0] * TOPO.L * 0.55, p[1] * TOPO.L * 0.55 * TOPO.Y, p[2] * TOPO.L * 0.55]); run.arrived.add(s.id); cosmos.placeThing(s, V3(run.Q.get(s.id)), null); dress(s, partB(s).left); }
  const f = firstScene(), q = V3(run.Q.get(f.id));
  run.here = f.id; run.path = run.scenes.map((s) => s.id);
  cosmos.teleport(q.clone().add(new window.THREE.Vector3(0, 2.6, 9.5)), 0, 0); cosmos.face(q); cosmos.start(); cosmos.setMode('fly');
  $('spCosmos').classList.add('on'); $('spMapWrap').classList.add('on'); syncMap();
  await veil(false);
  hint(ko ? 'W A S D · 화면을 누르면 마우스로 둘러봅니다 · M = 지도' : 'W A S D · click, then look with the mouse · M = map', 9000);
}

boot();

/**
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
import { createCosmos } from './cosmos.js';
import { isSilent } from './things.js';
import { accumulate, placeNext, TOPO } from './topo.js';
import { createStarMap } from './starmap.js';
import { runFinale } from './finale.js';

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
  Q: new Map(), place: new Map(),           // the walker's model: scene id → [x,y,z]; how each place was reached (topo.placeNext)
  doors: new Map(),                         // scene id → { way, to }
  path: [], legs: [], rooms: [], script: [],
  here: null, pending: null, last: null, contact: false, ghosts: [], rows: [], crossing: false, busy: false, ended: false,
  startedAt: Date.now(),
};
window.__space = { run, mode: MODE };       // automation / inspection hook

let cosmos, talk, map, air;
const V3 = (a) => new window.THREE.Vector3(a[0], a[1], a[2]);
const sceneById = (id) => run.scenes.find((s) => s.id === id);

// ── sound: the memory's own sound underneath, a scene's sound when near its thing ──────────
function createAir() {
  const mk = () => { const el = new Audio(); el.loop = true; el.preload = 'auto'; el.volume = 0; return { el, url: null, target: 0, level: 0, base: 0.5 }; };
  const bed = mk(), near = mk(); let last = performance.now();
  const load = (c, url, base) => { c.base = base == null ? 0.5 : base; if (c.url === url) return; c.url = url; c.level = 0; c.el.volume = 0; if (!url) { c.el.pause(); c.el.removeAttribute('src'); return; } c.el.src = url; const p = c.el.play(); if (p && p.catch) p.catch(() => {}); };
  (function tick() {
    requestAnimationFrame(tick);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; const k = 1 - Math.exp(-dt / 1.4);
    for (const c of [bed, near]) { c.level += (c.target - c.level) * k; const v = Math.max(0, Math.min(1, c.level * c.base)); if (Math.abs(c.el.volume - v) > 0.002) c.el.volume = v; }
  })();
  const kick = () => { for (const c of [bed, near]) if (c.url && c.el.paused) { const p = c.el.play(); if (p && p.catch) p.catch(() => {}); } };
  window.addEventListener('pointerdown', kick); window.addEventListener('keydown', kick);   // a browser may hold sound back until the first touch
  return {
    bed(url, base, level) { load(bed, url, base); bed.target = url ? (level == null ? 1 : level) : 0; },
    bedLevel(v) { bed.target = bed.url ? v : 0; },
    near(url, base) { load(near, url, base); },
    nearLevel(v) { near.target = near.url ? v : 0; },
    fade() { bed.target = 0; near.target = 0; },
    bedUrl: () => bed.url,
    state: () => [bed, near].map((c) => ({ url: c.url ? c.url.split('/').pop() : null, target: +c.target.toFixed(2), level: +c.level.toFixed(2), paused: c.el.paused })),
  };
}
const soundOf = (scene) => { const m = scene.meta || {}; return { url: m.sound_url || null, vol: m.sound_volume != null ? Number(m.sound_volume) : 0.5 }; };
/** The memory's own sound: named by the memory, else the sound of the scene that holds its closing sentence, else the first scene that has one. */
function repSound() {
  const mm = run.memory.meta || {};
  if (mm.rep_sound_url) return { url: mm.rep_sound_url, vol: mm.rep_sound_volume != null ? Number(mm.rep_sound_volume) : 0.6 };
  const key = String(run.memory.completed_sentence || '').replace(/\s+/g, '');
  const withSound = run.scenes.filter((s) => soundOf(s).url);
  const hit = key && withSound.find((s) => String(s.text || '').replace(/\s+/g, '').includes(key));
  const s = hit || withSound[0];
  return s ? soundOf(s) : { url: null, vol: 0 };
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
  const rs = riggedStage(rigOf(run.memory, qs), visitN, scene);
  if (rs != null) { st = rs; if (visitN === 1 && !layerOf(scene, st)) st = 0; }
  while (st > 0 && !layerOf(scene, st)) st--;
  return { stage: st, text: st ? layerOf(scene, st) : scene.text };
}
const normLine = (l) => String(l).replace(/[\s.!?…"“”'’]+$/g, '').replace(/\s+/g, ' ').trim();
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
  const ref = qs.get('memory') || DEFAULT_MEMORY;
  const line = $('spEntryLine'), btn = $('spEnter'), note = $('spEntryNote');
  let loaded;
  try { loaded = await data.loadMemory(ref); } catch (e) { line.textContent = ko ? '기억을 불러오지 못했습니다.' : 'The memory could not be loaded.'; veil(false); console.error(e); return; }
  run.memory = loaded.memory; run.scenes = loaded.scenes;
  try { const r = await data.client().from('memories').select('completed_sentence').eq('id', run.memory.id).maybeSingle(); if (r.data) run.memory.completed_sentence = r.data.completed_sentence; } catch (_) {}   // names the memory's own sound (repSound)
  if (!run.scenes.length) { line.textContent = ko ? '이 기억에는 장면이 없습니다.' : 'This memory has no scenes.'; veil(false); return; }
  run.engine = createEngine(run.scenes, { frame: qs.get('frame') });
  [run.ghosts, run.rows] = await Promise.all([data.loadGhostLines(run.memory.id), loadLedger(run.memory.id)]);
  { const rg = rigOf(run.memory, qs), n = rg && Number(rg.ghost_min_len); if (n > 0) run.ghosts = run.ghosts.filter((g) => String(g.utterance).trim().length >= n); }
  run.acc = accumulate(run.scenes, run.rows, run.engine.axes, [data.TEST_PERSONA]);
  try { await Promise.race([document.fonts.load('300 64px "Noto Serif KR"', '기억'), new Promise((r) => setTimeout(r, 2500))]); } catch (_) {}   // letters drawn in the place use the page's serif, not a system fallback

  air = createAir();
  talk = createTalk();
  cosmos = createCosmos({ canvas: $('spCosmos'), memoryCode: run.memory.code, speed: FAST, on: { onNear, onFrame, onLand, onRelease: () => { $('rpWalk').textContent = ko ? '날기' : 'fly'; }, onLock: (l) => $('spAim').classList.toggle('on', l) } });
  map = createStarMap({ wrap: $('spMapWrap'), canvas: $('spMap'), memoryCode: run.memory.code, onPick: returnBy, onOpen: () => cosmos.unlock(), onClose: () => { if (cosmos.mode() === 'fly') cosmos.relock(); } });
  $('rpWalk').textContent = ko ? '날기' : 'fly';
  Object.assign(window.__space, { cosmos, talk, map, air, finish });
  setupFlyButton();
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !/^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '') && cosmos.mode() === 'fly') map.toggle(); });

  if (PEEK) return peek();
  const first = firstScene();
  const begin = async () => {
    $('spEntry').classList.add('gone');
    cosmos.ensureAudio();
    const rep = repSound();
    air.bed(rep.url, rep.vol, 0.85);                                        // the memory's own sound comes first
    await wait(2600);
    if (AT === 'end') return fakeWalk().then(finish);
    if (AT === 'space') { fakeStay(first); }
    else {
      try { const res = await stay(first, 'start', { dark: true }); run.firstRes = res; run.firstLeft = res.left; }
      catch (e) { console.error('[space] first stay', e); run.busy = false; talk.hide(); toast(ko ? '첫 장면을 읽지 못했습니다' : 'The first scene could not be read'); fakeStay(first); }   // the place still opens
    }
    await openEyes(first);
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
  const silent = isSilent(scene), tv = stageText(scene, 1), own = lineOwner(scene, tv.stage);
  const A = silent ? [] : sentences(tv.text).map(closed), pb = silent ? { lines: [], authored: false, left: [] } : partB(scene);
  const parts = [A, pb.lines].filter((p) => p.length);
  const shown = [], script = [], turns = [], emos = [], history = [], seen = new Set();
  let anyVoid = 0, lastAlign = run.last ? run.last.turnAlignment : 0.5, lastReply = '';
  talk.clear(); talk.show();
  if (!dark) await wait(1500);

  const exchange = async (i, allowSilence) => {
    let answer;
    for (;;) {
      answer = await talk.ask({ allowSilence });
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
      input_form: 'talk_v1', stage: data.STAGE_TAG, place: PLACE_TAG, form: 'talk2_v1', visit: 1, text_stage: tv.stage, arrived: via, analysed: !!an, odd: !!an && isVoid, question });
    if (MODE !== 'test' && !silent && ok) data.absorbLine({ memoryId: run.memory.id, utterance: raw, motifTags: ((scene.meta && scene.meta.motif_tags) || []).slice(0, 3) });
    return { raw, emo };
  };

  if (silent) {
    shown.push('…'); script.push({ t: '…', who: 'text' });
    await talk.say('…', 'rp-void', { hold: 2600 });
    await exchange(0, true);
  } else {
    for (let i = 0; i < parts.length; i++) {
      await talk.sayAll(parts[i], '', { gap: i > 0 });
      shown.push(...parts[i]); parts[i].forEach((l) => { seen.add(normLine(l)); script.push({ t: asRead(l), who: i === 0 ? own(l) : 'text' }); });
      await exchange(i, false);
    }
  }
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
  run.script.push({ scene_id: scene.id, order: scene.scene_order, visit: 1, stage: tv.stage, at: dark ? 0 : cosmos.track.length, lines: script });   // at = where on the walked line this was read (the ending follows it)

  // contact — a rare event, once per run: a line someone left is heard
  if (turns.length && resonance === 'resonance' && !run.contact && !silent) {
    run.contact = true;
    const g = nearestGhost(mean, run.ghosts), name = scene.meta && scene.meta.ghost_name;
    if (g) await talk.say(g.utterance, 'rp-ghost', { gap: true, src: name ? '— ' + name : (ko ? '— 누군가 여기 두고 간 말' : '— something someone left here'), hold: 1800 });
    if (MODE !== 'test') data.recordContact({ memoryId: run.memory.id, sceneId: scene.id, utterance: turns[turns.length - 1].raw_text.slice(0, 300), turn: turns.length, runId: run.id });
  }

  const rig = rigOf(run.memory, qs);
  let next = rig ? riggedDoor({ rig, engine: run.engine, scenes: run.scenes, origin: scene, pattern, userEmotion: mean, isVoid: userVoid, visited: run.visited })
                 : run.engine.pickNext({ origin: scene, pattern, userEmotion: mean, isVoid: userVoid, visited: run.visited });
  // a door back into the same scene is not given on this stage yet: the nearest scene not yet seen, as for a crossing
  if (next.mode === 'same') next = Object.assign(run.engine.pickNext({ origin: scene, pattern: 'bridge', userEmotion: mean, isVoid: userVoid, visited: run.visited }), { was: 'same' });

  if (turns.length && MODE !== 'test') {                                    // a practice walk leaves no row at all (261121: its rows were being counted by the admin's model)
    await data.insertPlay({ memory_id: run.memory.id, scene_id: scene.id, user_emotion: mean, alignment, mismatch_type: resonance, run_id: run.id, ghost_variant_id: null, dialog_turns: turns,
      persona_id: MODE === 'author' ? data.AUTHOR_PERSONA : null });
  }
  run.rooms.push({ order: run.rooms.length + 1, scene_id: scene.id, scene_order: scene.scene_order, visit: 1, text_stage: tv.stage, part_b: pb.authored ? 'authored' : 'from_piece', seen_text: shown.join(' '),
    silent: !turns.length, user_emotion: mean, turn_alignment: +alignment.toFixed(4), resonance,
    turns: turns.map((t) => ({ text: t.raw_text, alignment: +t.alignment.toFixed(4), resonance: t.resonance, reply: t.ghost_reply, via: t.via, question: t.question })),
    engine: eng ? { alignment: eng.alignment_score, bucket: eng.alignment_bucket, pattern: eng.transition_pattern, mismatch: eng.mismatch_type } : null,
    door: next.scene ? { to: next.scene.scene_order, mode: next.mode, pattern, rig: !!next.rig } : (next.mode === 'end' ? { to: null, mode: 'end', rig: true } : null), ranked: (next.ranked || []).slice(0, 5), shadow: next.shadow || null });

  await wait(900);
  talk.hide();
  run.busy = false;
  return { scene, next, pattern, mean, left: pb.left || [], turns };
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
  cosmos.setMode('held'); cosmos.start();
  dress(first, run.firstLeft);
  if (run.firstRes) afterSpeech(first, run.firstRes);
  $('spCosmos').classList.add('on');
  await veil(false);
  $('spMapWrap').classList.add('on'); syncMap();
  await wait(1400);
  cosmos.setMode('fly');
  hint(cosmos.isTouch() ? (ko ? '동그라미를 누르고 있으면 나아갑니다 · 화면을 끌어 둘러봅니다' : 'hold the circle to move · drag to look')
                        : (ko ? 'W A S D 로 나아갑니다 · 화면을 누르면 마우스로 둘러봅니다' : 'W A S D to move · click, then look with the mouse'), 11000);
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
  const leg = { from: from.scene_order, to: to.scene_order, kind, pattern: run.last ? run.last.pattern : null, said: passWord(kind, run.last ? run.last.pattern : 'bridge'), place: run.place.get(to.id) ? { d: run.place.get(to.id).d, shift: run.place.get(to.id).shift, compared: run.place.get(to.id).compared } : null };
  hint(''); nearLine(null); map.close(); $('rpWalk').classList.remove('on');
  const fromPos = cosmos.pl.pos.clone();
  await veil(true);
  const pass = $('rpPass');
  await wait(400);
  await typeText(pass, leg.said, { per: 110, pace: 1 / FAST });
  await wait(1700);
  pass.textContent = '';
  if (run.ended) return;

  const Qf = V3(run.Q.get(from.id)), Qt = V3(run.Q.get(to.id));
  const dir = from.id === to.id ? way.e.clone() : horiz(Qt.clone().sub(Qf), run.id + from.id + to.id);
  const X = Qt.clone().addScaledVector(dir, -ARRIVE_DIST); X.y = Qt.y - FOOT_DROP;
  cosmos.placeThing(to, Qt, X);
  cosmos.link(from.id, to.id);
  if (run.stub && run.stub.live) cosmos.removeWay(run.stub);
  if (way.kind === 'back' && way.live) cosmos.removeWay(way);              // a door called from the map is there for one crossing
  run.stub = cosmos.openStub({ at: X, dir, key: run.id + 'stub' + run.legs.length });
  const start = X.clone().addScaledVector(dir, 0.5).add(new T.Vector3(0, cosmos.EYE, 0));
  cosmos.carry(fromPos, start);
  cosmos.teleport(start, Math.atan2(-dir.x, -dir.z), 0);
  cosmos.land(run.stub, 0.5);
  run.here = to.id; run.arrived.add(to.id); run.path.push(to.id); run.legs.push(leg);
  if (first) { run.pending = to.id; dress(to, partB(to).left); }
  else {
    if (run.visited.has(to.id)) { run.returns.set(to.id, (run.returns.get(to.id) || 0) + 1); run.returnDue = to.id; }   // only a scene that was read can be found changed
    if (kind !== 'new') logMove(from, to, kind === 'map' ? 'map_return' : 'door_return');
  }
  setNearSound(to);
  syncMap();
  await veil(false);
  if (cosmos.isTouch()) $('rpWalk').classList.add('on');
  if (!run.walkHinted) { run.walkHinted = true; hint(cosmos.isTouch() ? (ko ? '동그라미를 누르고 있으면 걷습니다' : 'hold the circle to walk') : (ko ? 'W 로 걷습니다' : 'W to walk'), 6000); }
  run.crossing = false;
}
/** A move that is not a stay is a walk all the same: it goes in the ledger (the piece stage's mark; no emotion, no alignment). */
function logMove(from, to, how) {
  if (MODE === 'test') return;
  data.insertPlay({ memory_id: run.memory.id, scene_id: to.id, user_emotion: null, alignment: null, mismatch_type: null, run_id: run.id, ghost_variant_id: null, persona_id: MOVE_PERSONA,
    dialog_turns: [{ stage: 'piece_v1', place: PLACE_TAG, move: how, from_scene_id: from.id, to_scene_id: to.id, at: new Date().toISOString() }] });
}
function setNearSound(scene) { const s = soundOf(scene); air.near(s.url && s.url !== air.bedUrl() ? s.url : null, s.vol); }

// ── near a thing ────────────────────────────────────────────────────────────
function onNear(id) {
  if (run.busy || run.crossing || run.ended) { const r = cosmos.things.get(id); if (r) r.armed = true; return; }
  const scene = sceneById(id); if (!scene) return;
  if (id !== run.here) {                                                   // flown to on one's own: that too is a walk
    const from = sceneById(run.here);
    run.legs.push({ from: from ? from.scene_order : null, to: scene.scene_order, kind: 'flight', pattern: null, said: '' });
    run.path.push(id); if (from) logMove(from, scene, 'flight');
    run.here = id; if (run.visited.has(id)) { run.returns.set(id, (run.returns.get(id) || 0) + 1); run.returnDue = id; } setNearSound(scene); syncMap();
  }
  if (run.pending === id) { run.pending = null; if (run.returnDue === id) run.returnDue = null; stay(scene, 'door').then((res) => { cosmos.setMode('fly'); cosmos.relock(); if (cosmos.isTouch()) $('rpWalk').classList.add('on'); return afterStay(res); })
      .catch((e) => { console.error('[space] stay', e); run.busy = false; talk.hide(); if (!run.ended) { cosmos.setMode('fly'); run.pending = id; toast(ko ? '장면을 읽지 못했습니다 — 다시 다가가 주세요' : 'The scene could not be read — come near it again'); } });
    return; }
  if (run.returnDue === id && run.visited.has(id)) { run.returnDue = null; comeBack(scene); }
}
/**
 * Back at a scene already read: it is not read again from the top. What is different is said at its thing —
 * a line the scene did not have when the walker read it (the next layer of its text), and, if the walker
 * asked something here, the question, still standing.
 */
async function comeBack(scene) {
  const n = run.returns.get(scene.id) || 1, tv = stageText(scene, 1 + n), own = lineOwner(scene, tv.stage), seen = run.shown.get(scene.id) || new Set();
  const fresh = sentences(tv.text).filter((l) => !seen.has(normLine(l))).slice(0, 2);
  const lines = fresh.map((l) => ({ t: asRead(l), who: own(l) }));
  fresh.forEach((l) => seen.add(normLine(l)));
  const qsHere = run.asked.get(scene.id) || [], mineHere = run.said.get(scene.id) || [];
  if (qsHere.length) lines.push({ t: qsHere[qsHere.length - 1], who: 'mine' });
  else if (!lines.length && mineHere.length) lines.push({ t: mineHere[mineHere.length - 1], who: 'mine' });
  if (!lines.length) return;
  run.script.push({ scene_id: scene.id, order: scene.scene_order, visit: 1 + n, stage: tv.stage, back: true, at: cosmos.track.length, lines });
  run.rooms.push({ order: run.rooms.length + 1, scene_id: scene.id, scene_order: scene.scene_order, visit: 1 + n, text_stage: tv.stage, back: true, seen_text: lines.map((l) => l.t).join(' '), owners: lines.map((l) => l.who) });
  await nearLine(lines);
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
  const r = run.here && cosmos.things.get(run.here);
  if (r && air) {
    const d = r.pos.distanceTo(cosmos.pl.pos), k = 1 - Math.max(0, Math.min(1, (d - 6) / 40));
    air.nearLevel(k * k);
    const s = soundOf(r.scene);
    air.bedLevel(run.ended ? 0 : (s.url && s.url === air.bedUrl() ? 0.35 + 0.65 * k : 0.34));
  }
  mapTick += dt;
  if (map && mapTick > 0.08) { mapTick = 0; map.walker(cosmos.pl.pos, cosmos.pl.yaw); }
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
function returnBy(id, sx, sy) {
  if (run.busy || run.crossing || run.ended || cosmos.mode() !== 'fly') return;
  const to = sceneById(id), from = sceneById(run.here);
  if (!to || !from || id === run.here) { map.close(); return; }
  map.close();
  const T = window.THREE, ray = cosmos.screenRay(sx, sy, 12.5), f = cosmos.forward();
  let dir = new T.Vector3(ray.dir.x, 0, ray.dir.z); if (dir.lengthSq() < 0.02) dir.set(f.x, 0, f.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); dir.normalize();
  const door = ray.at.clone(); door.y -= cosmos.DOOR_H / 2;                 // the door's middle is the pressed point
  const feet = cosmos.feet(), start = feet.clone().addScaledVector(dir, 1.3);
  if (run.backWay && run.backWay.live) cosmos.removeWay(run.backWay);
  run.backWay = cosmos.openWay({ door, dir, start, startDir: dir, key: run.id + 'back' + run.legs.length, kind: 'back', from: from.id, to: id, onPass: (w) => cross(sceneById(run.here) || from, to, w, 'map') });
}
function setupFlyButton() {
  const b = $('rpWalk');
  const down = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} b.classList.add('down'); cosmos.setForward(true); };
  const up = () => { b.classList.remove('down'); cosmos.setForward(false); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
}

// ── the end ────────────────────────────────────────────────────────────────
async function finish() {
  if (run.ended) return; run.ended = true;
  hint(''); nearLine(null); map.close(); $('spMapWrap').classList.remove('on'); $('rpWalk').classList.remove('on'); talk.hide();
  if (MODE !== 'test') {
    data.writeJournal(run.memory.id, run.id, { stage: data.STAGE_TAG, place: PLACE_TAG, mode: MODE, visit_order: run.path.map((id) => sceneById(id).scene_order),
      scenes: run.rooms, legs: run.legs, contact: run.contact, model: Array.from(run.place).map(([id, p]) => ({ scene: sceneById(id).scene_order, from: sceneById(p.from).scene_order, compared: p.compared, d: p.d, shift: p.shift })),
      seconds: Math.round((Date.now() - run.startedAt) / 1000) });
  }
  try {
    window.__space.finale = await runFinale({ cosmos, run, lang: LANG, fast: FAST, air, typeText, wait, sceneById,
      others: othersWalks(), title: run.memory.title || '', scroll: $('spScroll'), scrollInner: $('spScrollInner') });
  } catch (e) { console.error('[space] finale', e); toast(ko ? '끝 화면을 그리지 못했습니다' : 'The ending could not be drawn'); await wait(2500); }
  await veil(true);
  location.href = qs.get('back') || (location.protocol === 'file:' ? 'index.html' : './');   // the site's front page (a dev server may answer '/index.html' with nothing; '/' is served everywhere)
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
  hint('W A S D · 화면을 누르면 마우스로 둘러봅니다 · M = 지도', 9000);
}

boot();

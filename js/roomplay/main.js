/**
 * Room play — orchestrator.
 *
 *   entry → [ room (text + sound) → continuation → one door → 3D corridor ]* → the piece → flat → ground → leave
 *
 * Decision record: docs/글방_통로_무대_결정-261117.md
 * URL: ?memory=<uuid|code> (default DANG-001) · ?as=author|test · ?tune=1 · ?lang=ko|en · ?way=0 · ?rig=0
 *   way        on by default since 261120 (way=0 = the older single-continuation room). 261120 trial (decision record §8): several exchanges in a room (the scene answers with its own
 *              next lines, and with a plain word), then the way — two lines from the text frame to the door,
 *              walked in 3D, the scene's things beside it — and past the door the corridor as before.
 *   as=author  the author's first walk (the first thread). Counted in the ground, marked in the ledger.
 *   as=test    nothing is shared: no ghost-line absorption, no contact record, rows marked and excluded.
 */
import * as data from './data.js';
import { createEngine, parseEmotion, resonanceOf, foldTo17 } from './engine.js';
import { createRoom, createFloaters, typeText, wordEl, ghostEl, doorEl, sentences, cutLast, hang, closed, subjectParticle } from './room.js';
import { createCorridor, normLook, DEFAULT_LOOK } from './corridor.js';
import { createSound } from './sound.js';
import { createWay } from './way.js';
import { drawAsciiDoor, DOOR_ASPECT } from './asciidoor.js';
import { rigOf, riggedDoor, riggedStage } from './rig.js';
import { lookFor, saveLook, storedLooks } from './looks.js';
import { runEnding } from './ending.js';
import { replayFromPlays, getPresentationState } from '../core/ContaminationTracker.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qs = new URLSearchParams(location.search);
const MODE = qs.get('as') === 'author' ? 'author' : qs.get('as') === 'test' ? 'test' : 'audience';
const TUNE = qs.get('tune') === '1';
const FAST = MODE === 'test' ? Math.max(1, Math.min(8, Number(qs.get('fast')) || 1)) : 1;   // test runs only: shorter pauses, quicker feet
const LANG = (qs.get('lang') || 'ko').slice(0, 2) === 'en' ? 'en' : 'ko';
const CONNECTIVES = LANG === 'en'
  ? ['but then', 'but', 'and', 'even so', 'so', 'and then', 'at that', 'in that moment']
  : ['그런데', '하지만', '그리고', '그럼에도 불구하고', '그래서', '그러다가', '그러자', '그 순간'];   // = lumen_dialog_phase1 CONT_CONNECTIVES
const WAY = qs.get('way') !== '0';   // 261120 (author): the way is the stage — on unless ?way=0
// Plain words the room may say that are not in the manuscript (author, 261120: "really plain words are fine").
// Rare (at most one in a stay, in about half the stays), and only ever a nod: the room does not tell the
// walker their line was odd (author, 261120 later the same day) — its next part of the manuscript is its answer.
// A memory can bring its own: memories.meta.plain_words = { nod: [...] }.
const PLAIN = LANG === 'en'
  ? { nod: ['Yes.', 'I see.', '…yes.', 'Go on.'] }
  : { nod: ['네.', '그래요.', '…네.', '그랬군요.'] };
const DEFAULT_MEMORY = 'DANG-001';   // the flagship memory of this stage (2026-11-17). 권역 = ?memory=GWON-001
const DEPTH_STAGE_2 = 5, DEPTH_STAGE_3 = 15;                                                  // = play-test applyStageText

const veilEl = $('rpVeil');
function veil(on) { veilEl.classList.toggle('clear', !on); return wait(2300); }
function toast(msg) { const t = $('rpToast'); typeText(t, msg, { per: 30 }); t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 6000); }

const run = {
  id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
  memory: null, scenes: [], engine: null,
  visited: new Set(), said: new Map(),      // scene id → [{ connective, text }] this run
  touched: new Map(),                       // scene id → Set(prop id): the things the talk reached (way=1)
  doorAt: new Map(),                        // scene id → { x, y } (fractions of the screen): where the door to that scene stands. Never changes once given (way=1)
  path: [], legs: [], rooms: [],
  last: null,                               // last engine reading { pattern, alignment, bucket }
  contact: false, ghosts: [], others: [], cont: { d: 0, c: 0, h: 0 },
  preEntry: '', startedAt: Date.now(),
};
window.__room = { run, mode: MODE };       // automation / inspection hook

const sound = createSound();
let room, floaters, corridor, way = null;

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  document.documentElement.lang = LANG;
  const ref = qs.get('memory') || sessionStorage.getItem('tem_archive_memory_id') || DEFAULT_MEMORY;
  let loaded;
  try { loaded = await data.loadMemory(ref); } catch (e) { $('rpEntryLead').textContent = '기억을 불러오지 못했습니다.'; console.error(e); return; }
  run.memory = loaded.memory; run.scenes = loaded.scenes;
  if (!run.scenes.length) { $('rpEntryLead').textContent = '이 기억에는 장면이 없습니다.'; return; }
  run.engine = createEngine(run.scenes, { frame: qs.get('frame') });   // ?frame=memory = comparison only (see engine.js)
  [run.ghosts, run.others] = await Promise.all([data.loadGhostLines(run.memory.id), data.loadRoomPlays(run.memory.id)]);
  { const rg = rigOf(run.memory, qs), n = rg && Number(rg.ghost_min_len); if (n > 0) run.ghosts = run.ghosts.filter((g) => String(g.utterance).trim().length >= n); }   // a rigged showing floats no throwaway lines
  // corridor grain / narrowing / patchwork come from what earlier walkers did to this memory
  if (run.others.length) {
    const p = getPresentationState(replayFromPlays(run.others.map((x) => ({ alignment: x.alignment, mismatch_type: x.mismatch_type, user_emotion: x.user_emotion }))));
    const c01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
    run.cont = { d: c01(p.divergence), c: c01(p.convergence), h: c01(p.heterogeneity) };
  }
  room = createRoom($('rpRoom'), LANG, 1 / FAST);
  floaters = createFloaters($('rpFloat'), document.querySelector('.rp-column'), run.id);
  corridor = createCorridor({ canvas: $('rpCorridor'), onProgress: onCorridorProgress, speed: FAST });
  if (WAY) way = createWay({ canvas: $('rpWay') });
  Object.assign(window.__room, { corridor, sound, floaters, way, room });
  const entryLead = LANG === 'en'
    ? 'You are about to walk through someone else\'s memory.\nBefore you go in — what is on your mind right now?'
    : '지금부터 다른 사람의 기억 속을 걷습니다.\n들어가기 전에 — 지금 무엇이 마음에 걸려 있습니까.';
  const entryNote = MODE === 'author' ? '작가의 첫 걸음으로 기록됩니다' : MODE === 'test' ? '시험 걸음 — 다른 사람에게 남지 않습니다' : '';
  $('rpEntryTitle').textContent = ''; $('rpEntryLead').textContent = ''; $('rpEntryNote').textContent = '';
  const typeEntry = async () => { await wait(1200 / FAST); await typeText($('rpEntryTitle'), run.memory.title || '', { per: 90, pace: 1 / FAST }); await wait(400 / FAST); await typeText($('rpEntryLead'), entryLead, { pace: 1 / FAST }); typeText($('rpEntryNote'), entryNote, { per: 30 }); };
  const go = $('rpEnter'); go.disabled = false;
  const enter = async () => {
    if (go.disabled) return; go.disabled = true;
    run.preEntry = $('rpEntryInput').value.trim().slice(0, 200);
    sound.unlock(); corridor.ensureAudio();
    $('rpEntry').classList.add('gone');
    await wait(1500);
    await enterRoom(run.scenes[0], 'start');
  };
  go.addEventListener('click', enter);
  $('rpEntryInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) enter(); });
  $('rpLeave').addEventListener('click', () => { if (leaveResolver) leaveResolver({ kind: 'leave' }); });
  setupWalkButton();
  if (TUNE) setupTuner();
  // test runs only: ?path=1,15,8,1 skips the rooms and shows the ending for that walk
  if (MODE === 'test' && qs.get('path')) {
    run.path = qs.get('path').split(',').map((n) => run.scenes.find((s) => String(s.scene_order) === n.trim())).filter(Boolean).map((s) => s.id);
    if (run.path.length) { $('rpEntry').classList.add('gone'); return finish(); }
  }
  veil(false);
  typeEntry();
}

// ── which text does this visit read ─────────────────────────────────────────
// A layer of a scene's text. meta.room_text = { "2": …, "3": … } is the room stage's own copy of the later layers
// (261121: a memory that also lives on the terrain stage keeps its text_stage_N columns for that stage untouched).
function layerOf(scene, n) {
  const own = scene.meta && scene.meta.room_text && scene.meta.room_text[String(n)];
  return (typeof own === 'string' && own.trim()) ? own : scene['text_stage_' + n];
}
function stageText(scene, visitN) {
  const depth = Number(run.memory.cont_depth) || 0;
  let st = depth <= 0 ? 0 : (depth >= DEPTH_STAGE_3 && layerOf(scene, 3)) ? 3 : (depth >= DEPTH_STAGE_2 && layerOf(scene, 2)) ? 2 : layerOf(scene, 1) ? 1 : 0;
  st = Math.min(3, st + (visitN - 1));                       // every return reads one layer further from the first telling
  const rs = riggedStage(rigOf(run.memory, qs), visitN);     // a rigged showing names the layer per visit (rig.js)
  if (rs != null) st = rs;
  while (st > 0 && !layerOf(scene, st)) st--;
  return { stage: st, text: st ? layerOf(scene, st) : scene.text };
}
function sceneLabel(scene) {
  const e = Array.isArray(scene.echo_words) ? scene.echo_words : [];
  return String(e[0] || (scene.meta && scene.meta.scene_code) || scene.scene_order);
}
function objectWords(scene) {
  const m = scene.meta || {};
  const list = Array.isArray(m.object_tags) ? m.object_tags : (Array.isArray(m.motif_tags) ? m.motif_tags : []);
  return list.filter(Boolean);
}
function soundOf(scene) { const m = scene.meta || {}; return { url: m.sound_url || null, vol: m.sound_volume != null ? Number(m.sound_volume) : 0.5 }; }
function ghostsFor(scene, n) {
  const tags = new Set(((scene.meta && scene.meta.motif_tags) || []).concat(objectWords(scene)));
  const scored = run.ghosts.map((g) => ({ g, s: (Array.isArray(g.motif_tags) ? g.motif_tags : []).filter((t) => tags.has(t)).length, h: hashStr(run.id + g.id) }));
  scored.sort((a, b) => (b.s - a.s) || (a.h - b.h));
  return scored.slice(0, n).map((x) => x.g);
}
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

// ── a room ─────────────────────────────────────────────────────────────────
let leaveResolver = null;
async function enterRoom(scene, via) {
  const prior = (run.said.get(scene.id) || []).slice();
  const nthVisit = run.path.filter((id) => id === scene.id).length + 1;
  run.path.push(scene.id); run.visited.add(scene.id);
  const isVoid = !!(scene.void_info && scene.void_info.sceneVoid) || /^[…\s.]*$/.test(scene.text || '');
  const tv = stageText(scene, nthVisit);
  const snd = soundOf(scene);
  if (via === 'start') sound.room(snd.url, snd.vol); else sound.arrive();
  room.clear(); floaters.clear(0);
  room.show(); $('rpLeave').classList.remove('on');
  await veil(false);

  // floaters: this room's words, a few lines earlier walkers left, the doors of rooms already seen
  const echo = Array.isArray(scene.echo_words) ? scene.echo_words.filter((w) => w && w !== '…') : [];
  echo.slice(0, 2).forEach((w, i) => floaters.add(wordEl(w), { key: 'w' + i, opacity: 0.42 }));
  const ghostItems = ghostsFor(scene, isVoid ? 1 : innerWidth < 760 ? 2 : 3);
  ghostItems.forEach((g) => floaters.add(ghostEl(g.utterance), { key: 'g' + g.id, opacity: 0.34 }));
  const oldDoors = [];
  for (const s of run.scenes) {
    if (!run.visited.has(s.id) || s.id === scene.id) continue;
    const el = dressDoor(doorEl(sceneLabel(s), false)); el.classList.add('locked');
    floaters.add(el, { key: 'd' + s.id, opacity: 0.2, at: WAY ? doorPlace(s.id, false) : null }); oldDoors.push({ el, scene: s });
  }

  // the text
  let shown, objLine = null, answer, analysis = null, conv = null;
  if (WAY && !isVoid) {
    conv = await converse(scene, tv, prior, nthVisit, via);
    shown = conv.shown; answer = conv.answer;
  } else {
  if (isVoid) { shown = ['…']; await room.say('…', 'rp-void', { hold: 2600 }); }
  else if (nthVisit === 1 && tv.stage === 0 && window.TemStemCuts && window.TemStemCuts[scene.id] && window.TemStemCuts[scene.id].text) {
    shown = sentences(window.TemStemCuts[scene.id].text);                 // the authored cut (trigger-power-v1)
    await room.sayAll(shown, '', {});
  } else {
    shown = cutLast(tv.text);
    if (prior.length) {                                                    // what I said here before is part of the text now
      shown[shown.length - 1] = closed(shown[shown.length - 1].replace(/…$/, ''));
      prior.forEach((p, i) => shown.push(i === prior.length - 1 ? hang(lineOf(p)) : closed(lineOf(p))));
    }
    await room.sayAll(shown, '', {});
  }
  // what is seen
  const objs = objectWords(scene);
  if (objs.length && !isVoid) {
    const w = objs[(nthVisit - 1) % objs.length], authored = scene.meta && scene.meta.object_lines && scene.meta.object_lines[w];
    objLine = authored || (LANG === 'en' ? 'There is ' + w + '.' : w + subjectParticle(w) + ' 보인다.');
    await room.say(objLine, 'rp-object', { gap: true, hold: 1100 });
  }

  // the continuation
  answer = await askSafely({ connectives: CONNECTIVES, voidScene: isVoid, allowSilence: isVoid });
  }
  let userEmotion = {}, userVoid = false, alignment = 0.5, resonance = 'vague', eng = null;
  const raw = answer.silent ? '' : lineOf(answer);
  if (conv) {
    ({ userEmotion, userVoid, alignment, resonance, eng } = conv);
    analysis = conv.analysed ? {} : null;
    if (!conv.analysed) toast('감정 측정에 실패했습니다 — 이 걸음은 직전 결로 이어집니다');
  } else if (!answer.silent) {
    await room.say(closed(raw), 'rp-mine', { gap: !objLine, hold: 500 });
    room.waiting(true);
    analysis = await data.analyzeEmotion(raw, run.engine.axes, { scene_text: shown.join(' ').slice(0, 400), ghost_line: (objLine || shown[shown.length - 1] || '').slice(0, 200) });
    if (analysis) {
      userEmotion = parseEmotion(analysis.base); userVoid = !!(analysis.reason_analysis && analysis.reason_analysis.is_void);
      const a = run.engine.alignmentTo(scene, userEmotion);
      alignment = a > 0 ? a : (run.last ? run.last.turnAlignment : 0.5);
      resonance = resonanceOf(alignment);
      eng = run.engine.step(scene, userEmotion, userVoid);
    } else toast('감정 측정에 실패했습니다 — 이 걸음은 직전 결로 이어집니다');
    if (!run.said.has(scene.id)) run.said.set(scene.id, []);
    run.said.get(scene.id).push({ connective: answer.connective, text: answer.text });
  } else {
    room.waiting(true);
    await wait(2200);
  }
  // reading for the door and the corridor
  const pattern = eng ? eng.transition_pattern : answer.silent ? (isVoid ? 'echo_follow' : 'avoidance') : ((run.last && run.last.pattern) || 'bridge');
  run.last = { pattern, alignment: eng ? eng.alignment_score : (answer.silent && isVoid ? 0.7 : 0.4), bucket: eng ? eng.alignment_bucket : 'MID', turnAlignment: alignment };
  const rig = rigOf(run.memory, qs);
  const next = rig ? riggedDoor({ rig, engine: run.engine, scenes: run.scenes, origin: scene, pattern, userEmotion, isVoid: userVoid, visited: run.visited })
                   : run.engine.pickNext({ origin: scene, pattern, userEmotion, isVoid: userVoid, visited: run.visited });

  // the ledger row (a silent stay leaves no emotion — it goes to the journal, as on the terrain stage)
  const turn = { turn: 1, raw_text: raw, alignment, resonance, ghost_reply: '', via: 'cont_form', ts: Date.now(), input_form: 'cont_v1', connective: answer.connective || '',
                 stage: data.STAGE_TAG, visit: nthVisit, text_stage: tv.stage, object: objLine, arrived: via, analysed: !!analysis };
  if (!answer.silent) {
    await data.insertPlay({ memory_id: run.memory.id, scene_id: scene.id, user_emotion: userEmotion, alignment, mismatch_type: resonance, run_id: run.id,
      ghost_variant_id: null, dialog_turns: conv ? conv.turns : [turn], persona_id: MODE === 'test' ? data.TEST_PERSONA : MODE === 'author' ? data.AUTHOR_PERSONA : null });
  }
  run.rooms.push({ order: run.rooms.length + 1, scene_id: scene.id, scene_order: scene.scene_order, visit: nthVisit, text_stage: tv.stage, seen_text: shown.join(' '), object: objLine,
    silent: !!answer.silent, user_emotion: userEmotion, turn_alignment: +alignment.toFixed(4), resonance,
    turns: conv ? conv.turns.map((t) => ({ text: t.raw_text, alignment: +t.alignment.toFixed(4), resonance: t.resonance, reply: t.ghost_reply, touched: t.object })) : null,
    engine: eng ? { alignment: eng.alignment_score, bucket: eng.alignment_bucket, pattern: eng.transition_pattern, mismatch: eng.mismatch_type } : null,
    door: next.scene ? { to: next.scene.scene_order, mode: next.mode, pattern, rig: !!next.rig } : (next.mode === 'end' ? { to: null, mode: 'end', rig: true } : null), ranked: next.ranked.slice(0, 5), shadow: next.shadow });
  room.waiting(false);

  // contact — a rare event, once per run: a line someone left comes in from the side
  if (!answer.silent && resonance === 'resonance' && !run.contact) {
    run.contact = true;
    const g = nearestGhost(userEmotion, ghostItems.length ? ghostItems : run.ghosts);
    const name = scene.meta && scene.meta.ghost_name;
    if (g) {
      const it = floaters.items.find((x) => x.key === 'g' + g.id);
      if (it) { it.el.classList.add('to-center'); setTimeout(() => floaters.remove('g' + g.id, 0), 1700); await wait(1500); }
      await room.say(g.utterance, 'rp-ghost', { gap: true, src: name ? '— ' + name : (LANG === 'en' ? '— something someone left here' : '— 누군가 여기 두고 간 말'), hold: 1800 });
    } else if (name) await room.say('— ' + name, 'rp-ghost', { gap: true, hold: 1500 });
    if (MODE !== 'test') data.recordContact({ memoryId: run.memory.id, sceneId: scene.id, utterance: raw.slice(0, 300), turn: 1, runId: run.id });
  }
  if (!answer.silent && MODE !== 'test' && !isVoid) data.absorbLine({ memoryId: run.memory.id, utterance: raw, motifTags: ((scene.meta && scene.meta.motif_tags) || []).slice(0, 3) });

  // a rigged showing closes on its last room: no door, the ending
  if (next.mode === 'end') { await wait(3200); return finish(); }

  // the door
  let newDoor = null;
  if (next.mode === 'fallback') await room.say(LANG === 'en' ? 'A gap in the memory pulls another scene toward you.' : '기억의 빈틈이 다른 장면을 끌어당긴다.', 'rp-narr', { gap: true });
  if (next.scene) {
    await wait(1600);
    newDoor = dressDoor(doorEl('', true));
    floaters.add(newDoor, { key: 'new', opacity: 1, at: WAY ? doorPlace(next.scene.id, true) : null });
  } else await room.say(LANG === 'en' ? 'No new door opens. The closest echo is one you have already heard.' : '새 문은 열리지 않는다. 가장 가까운 잔향은 이미 들은 것이다.', 'rp-narr', { gap: true });
  oldDoors.forEach((d) => { d.el.classList.remove('locked'); floaters.setOpacity('d' + d.scene.id, 0.46); });
  $('rpLeave').classList.add('on');

  const choice = await new Promise((resolve) => {
    leaveResolver = resolve;
    const on = (el, v) => { el.addEventListener('click', () => resolve(v)); el.addEventListener('keydown', (e) => { if (e.key === 'Enter') resolve(v); }); };
    if (newDoor) on(newDoor, { kind: next.mode === 'same' ? 'same' : 'new', scene: next.scene, el: newDoor });
    oldDoors.forEach((d) => on(d.el, { kind: 'old', scene: d.scene, el: d.el }));
  });
  leaveResolver = null;
  $('rpLeave').classList.remove('on');
  if (choice.kind === 'leave') return finish();
  return walk(scene, choice.scene, choice.kind, answer.silent ? '' : answer.connective, choice.el);
}

/** way=1: the room's doors are the ASCII door of the opening (same drawing as the door at the end of the way). */
function dressDoor(el) {
  if (!WAY) return el;
  const leaf = el.querySelector('.rp-leaf');
  if (leaf) { leaf.classList.add('ascii'); leaf.appendChild(drawAsciiDoor(document.createElement('canvas'), 0, { px: 16, tone: true })); }
  return el;
}

/**
 * way=1: where the door to a scene stands on the screen. Chosen once ("random is only where the door appears"),
 * in the empty sides, clear of the doors already standing — and then it is that door's place for the whole walk:
 * it does not drift, it is not moved when the way is drawn, and the same door stands there in every later room.
 */
function doorPlace(sceneId, isNew) {
  if (run.doorAt.has(sceneId)) return run.doorAt.get(sceneId);
  const W = innerWidth, H = innerHeight, bs = floaters.bands(), dh = isNew ? 210 : 150, dw = dh * Math.max(0.4, DOOR_ASPECT) + 12, pad = 8;   // 261121: the door's real width, and 8 px kept clear of the screen's edge
  let best = null, bd = -1;
  for (let n = 0; n < 40; n++) {
    const b = bs[Math.floor(Math.random() * bs.length)];
    const x = Math.max(pad, Math.min(W - dw - pad, b.x0 + Math.random() * Math.max(1, b.x1 - b.x0 - dw))), y = Math.max(pad, b.y0 + Math.random() * Math.max(1, b.y1 - b.y0 - dh - 30));
    let d = Infinity; for (const p of run.doorAt.values()) d = Math.min(d, Math.hypot(p.x * W - x, p.y * H - y));
    if (d > bd) { bd = d; best = { x: x / W, y: y / H }; }
    if (d > 260) break;
  }
  run.doorAt.set(sceneId, best);
  return best;
}

/** One continuation, with the crisis check the room has always had. */
async function askSafely(o) {
  for (;;) {
    const answer = await room.ask(o);
    if (answer.silent) return answer;
    const S = window.LumenSafety;
    const crisis = S && S.detectCrisis ? S.detectCrisis(answer.connective + ' ' + answer.text) : { level: 'safe' };
    if (crisis.level !== 'high') return answer;
    // the scene does not take this in; help is shown
    await room.say(LANG === 'en' ? '……no. That is too sharp to carry in here.' : '……아냐, 이건 너무 날카로워.', 'rp-narr', { gap: true });
    const res = (S.getSafetyResources ? S.getSafetyResources(LANG) : []).map((r) => r.name + ' ' + r.number).join(' · ');
    if (res) await room.say(res, 'rp-narr', {});
  }
}

// ── several exchanges in one room (way=1) ───────────────────────────────────
// The scene's text comes in parts. After each part the walker continues it; the room goes on with its
// own next part (now and then a plain nod first) — nothing the room says about the scene is outside
// the manuscript. When the last part has been answered, the door appears (as before).
//   · the door and the corridor are read from the whole stay: the mean of the turns' emotions,
//     one engine step per room, one ledger row per room (its turns inside dialog_turns).
//   · a turn the classifier reads as empty of the scene (void) is marked in the ledger (odd) and gets
//     no word from the room. A contrary feeling is not "odd".
//   · a turn reaches at most one thing of the scene: of those not reached yet, the one that shares the
//     most words with the line (its name, or a word of its own line; ties = authored order). No shared
//     word = nothing is reached. Reached things answer a click on the way.
function speakingThings(scene) {
  const props = (scene.meta && scene.meta.piece && Array.isArray(scene.meta.piece.props)) ? scene.meta.piece.props : [];
  return props.filter((p) => p && p.kind === 'object' && p.role === 'speaking' && p.text);
}
// Words are compared by their heads: Korean puts the meaning at the front of a word and the grammar at its
// end, so whole-line letter pairs matched on endings alone ("…었다", "…습니다") and every line reached something.
//   a word of 3+ letters -> its first two; a 2-letter word -> itself, unless it is one letter + a particle
//   (나는, 그가: too common to mean anything); Latin words of 4+ letters -> the word.
const PARTICLES = '은는이가을를에의도로과와만';
// heads that carry grammar, not meaning (to be / to do / thing / like / linking words). A staging list, not a definition: add to it when a line reaches a thing it never named.
const EMPTY_HEADS = new Set(['있었', '있다', '있는', '있습', '있어', '없었', '없다', '없는', '없습', '없어', '했다', '했습', '했는', '하고', '하는', '한다', '합니', '되었', '됐다', '되는', '것이', '것은', '것을', '같았', '같다', '같은', '그런', '그리', '그래', '그러', '하지', '순간', 'that', 'this', 'there', 'were', 'have', 'with']);
function words(str) { return String(str || '').toLowerCase().split(/[\s.,!?…"'“”‘’·\-—()]+/).filter(Boolean); }
function stems(str) {
  const out = new Set();
  for (const w of words(str)) {
    if (/[가-힣]/.test(w)) { if (w.length >= 3 || (w.length === 2 && !PARTICLES.includes(w[1]))) out.add(w.slice(0, 2)); }
    else if (w.length >= 4) out.add(w);
  }
  for (const e of EMPTY_HEADS) out.delete(e);
  return out;
}
/** The thing's own name said in the line: as a word's beginning, or (one-letter names) as the word itself, with or without a particle. */
function namesIt(text, name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  return words(text).some((w) => (n.length >= 2 ? w.startsWith(n) : (w === n || (w.length === 2 && w[0] === n && PARTICLES.includes(w[1])))));
}
function nearestThing(text, things) {
  const a = stems(text); let best = null, bs = 0;
  for (const p of things) {
    const b = stems(p.name + ' ' + p.text); let n = namesIt(text, p.name) ? 2 : 0;   // its name counts double
    for (const g of a) if (b.has(g)) n++;
    if (n > bs) { bs = n; best = p; }
  }
  return best;                                                              // null = the line shares no word with any thing
}
function plainWord(key) {
  const own = run.memory.meta && run.memory.meta.plain_words && run.memory.meta.plain_words.nod;
  const list = Array.isArray(own) && own.length ? own : PLAIN.nod;
  return list[Math.floor(hashStr(run.id + key) * list.length) % list.length];
}
async function converse(scene, tv, prior, nthVisit, via) {
  const body = sentences(tv.text);
  const K = Math.max(1, Math.min(3, body.length)), base = Math.floor(body.length / K), rem = body.length % K;
  const parts = []; for (let i = 0, at = 0; i < K; i++) { const n = base + (i < rem ? 1 : 0); parts.push(body.slice(at, at + n)); at += n; }
  if (!run.touched.has(scene.id)) run.touched.set(scene.id, new Set());
  const touched = run.touched.get(scene.id), things = speakingThings(scene);
  const shown = [], turns = [], emos = [];
  let answer = null, anyVoid = 0, lastAlign = run.last ? run.last.turnAlignment : 0.5;
  // the nod: in about half the stays, after one of the turns (fixed by the run and the stay, so a replay reads the same)
  const stayKey = scene.id + '|' + nthVisit, nodAt = hashStr(run.id + stayKey + '|nod') < 0.5 ? Math.floor(hashStr(run.id + stayKey + '|at') * K) : -1;
  for (let i = 0; i < K; i++) {
    const lines = parts[i].slice();
    if (i === K - 1) prior.forEach((p) => lines.push(lineOf(p)));          // what I said here before is part of the text now
    // the last line of a part is left hanging — but a question or a cry in the manuscript keeps its own mark,
    // and the scene's own last part ends as the manuscript ends it (author, 261120: each scene must clearly end).
    const out = lines.map((l, j) => (j === lines.length - 1 && i < K - 1 && !/[?!]["”’']?$/.test(String(l).trim()) ? hang(l) : closed(l)));
    await room.sayAll(out, '', { gap: i > 0 });
    shown.push(...out);
    answer = await askSafely({ connectives: CONNECTIVES, optionalConn: i > 0,
      guide: i > 0 ? (LANG === 'en' ? 'Go on — a connective if you want one.' : '이어서 써 주세요 — 연결사는 골라도 되고 안 골라도 됩니다.') : null });
    const raw = lineOf(answer);
    await room.say(closed(raw), 'rp-mine', { gap: true, hold: 500 });
    room.waiting(true);
    const an = await data.analyzeEmotion(raw, run.engine.axes, { scene_text: shown.join(' ').slice(-400), ghost_line: out[out.length - 1].slice(0, 200) });
    let align = lastAlign, res = 'vague', isVoid = false, emo = null;
    if (an) {
      emo = parseEmotion(an.base); isVoid = !!(an.reason_analysis && an.reason_analysis.is_void);
      const a = run.engine.alignmentTo(scene, emo);
      align = a > 0 ? a : lastAlign; res = resonanceOf(align); lastAlign = align;
      emos.push(emo); if (isVoid) anyVoid++;
    }
    const left = things.filter((p) => !touched.has(p.id)), reach = left.length ? nearestThing(answer.text, left) : null;   // the walker's own words, without the connective they picked
    if (reach) { touched.add(reach.id); floaters.add(wordEl(reach.name), { key: 't' + reach.id, opacity: 0.62 }); }
    room.waiting(false);
    const odd = !!an && isVoid;                                            // off the scene altogether (ledger only; a contrary feeling is not odd). The room says nothing to it.
    const reply = (!odd && i === nodAt) ? plainWord(stayKey) : '';
    if (reply) await room.say(reply, 'rp-narr', { gap: true, hold: 700 });
    if (!run.said.has(scene.id)) run.said.set(scene.id, []);
    run.said.get(scene.id).push({ connective: answer.connective, text: answer.text });
    turns.push({ turn: i + 1, raw_text: raw, alignment: align, resonance: res, ghost_reply: reply, via: 'cont_form', ts: Date.now(), input_form: 'cont_v1', connective: answer.connective || '',
      stage: data.STAGE_TAG, form: 'turns_v1', visit: nthVisit, text_stage: tv.stage, object: reach ? reach.name : null, arrived: via, analysed: !!an, odd });
  }
  // the whole stay, read once
  const mean = {};
  for (const e of emos) for (const k in e) mean[k] = (mean[k] || 0) + (Number(e[k]) || 0) / emos.length;
  const userVoid = emos.length > 0 && anyVoid === emos.length;
  let alignment = lastAlign, eng = null;
  if (emos.length) {
    const a = run.engine.alignmentTo(scene, mean);
    alignment = a > 0 ? a : lastAlign;
    eng = run.engine.step(scene, mean, userVoid);
  }
  return { shown, answer, turns, userEmotion: mean, userVoid, alignment, resonance: resonanceOf(alignment), eng, analysed: emos.length > 0 };
}

// ── the way (way=1): from the text frame to the door ────────────────────────
function thingsOf(scene) {
  const props = (scene.meta && scene.meta.piece && Array.isArray(scene.meta.piece.props)) ? scene.meta.piece.props : [];
  const mm = run.memory.meta || {}, models = mm.object_models || {}, images = mm.object_images || {};
  const touched = run.touched.get(scene.id) || new Set(), out = [];
  for (const p of props) {
    if (!p) continue;
    if (p.kind === 'object') {
      const m = models[p.model || p.name], speaking = p.role === 'speaking' && !!p.text;
      const model = (m && m.path) || null, image = p.image || (images[p.name] && (images[p.name].path || images[p.name])) || null;
      if (!speaking && !model && !image) continue;                         // scenery with nothing to show is not stood
      out.push({ id: p.id, name: p.name, kind: 'object', line: speaking ? p.text : '', unlocked: speaking && touched.has(p.id), model, image });
    } else if (p.kind === 'word' && p.text) out.push({ id: p.id, name: p.text, kind: 'word' });
  }
  return out;
}
async function takeWay(from, el) {
  const roomEl = $('rpRoom'), hint = $('rpHint'), cap = $('rpCaption');
  floaters.stop();
  floaters.items.forEach((it) => { if (it.el !== el) it.el.classList.remove('in'); });
  roomEl.classList.add('way');                                             // the text goes; the door stays where it appeared
  const look = normLook(lookFor(run.memory, from));
  const col = document.querySelector('.rp-column').getBoundingClientRect();
  const lr = (el.querySelector('.rp-leaf') || el).getBoundingClientRect();   // the door, where it has stood since it appeared
  $('rpWay').classList.add('on');
  await wait(900 / FAST);
  const done = way.start({ door: { cx: lr.left + lr.width / 2, bottom: lr.bottom, h: lr.height }, frame: { left: col.left, right: col.right, bottom: col.bottom },
    floor: look.floor, speed: FAST, things: thingsOf(from) }, {
    onReady() {
      typeText(hint, isTouch() ? (LANG === 'en' ? 'hold the circle to walk · drag to look' : '동그라미를 누르고 있으면 걷습니다 · 화면을 끌어 둘러봅니다') : (LANG === 'en' ? 'W or ↑ to walk · drag to look' : 'W 또는 ↑ 로 걷습니다 · 마우스로 끌어 둘러봅니다'), { per: 30 });
      hint.classList.add('on'); if (isTouch()) $('rpWalk').classList.add('on');
    },
    on3d() { el.style.transition = 'none'; el.classList.remove('in'); setTimeout(() => hint.classList.remove('on'), 5000); },   // the page's door hands over to the place's door at once (letters do not fade)
    onLine(t) {
      $('rpCapSrc').textContent = ''; typeText($('rpCapLine'), t.line).then((ok) => { if (ok) typeText($('rpCapSrc'), t.name); });
      cap.classList.add('on', 'way'); clearTimeout(takeWay._t); takeWay._t = setTimeout(() => cap.classList.remove('on'), 9000);
    },
  });
  const res = await done;
  clearTimeout(takeWay._t); cap.classList.remove('on'); hint.classList.remove('on'); $('rpWalk').classList.remove('on');
  return res;
}
function lineOf(p) { return (p.connective ? p.connective + ' ' : '') + p.text; }
function nearestGhost(userEmotion, pool) {
  let best = null, bs = -Infinity;
  for (const g of pool) { const s = cosObj(userEmotion, parseEmotion(g.emotion_vec)); if (s > bs) { bs = s; best = g; } }
  return best;
}
function cosObj(a, b) { let d = 0, na = 0, nb = 0; const keys = new Set(Object.keys(a).concat(Object.keys(b))); for (const k of keys) { const x = Number(a[k]) || 0, y = Number(b[k]) || 0; d += x * y; na += x * x; nb += y * y; } return na && nb ? d / Math.sqrt(na * nb) : 0; }

// ── the corridor ───────────────────────────────────────────────────────────
// 261120 (author): the walked corridor is put away for now. Between the way and the next room there is only a word
// for what kind of passage it was ("맴돈다."), typed on the dark. The corridor itself is kept: ?corridor=1 (or ?tune=1).
// The word is a plain verb for the movement, never the engine's name for the pattern. A memory may bring its own:
// memories.meta.pass_words = { echo_follow, bridge, contradiction, displacement, avoidance, fixation, old }.
const CORRIDOR = qs.get('corridor') === '1' || TUNE;
const PASS = LANG === 'en'
  ? { echo_follow: 'It follows.', bridge: 'It crosses over.', contradiction: 'It turns against.', displacement: 'It slips aside.', avoidance: 'It goes around.', fixation: 'It circles.', old: 'It goes back.' }
  : { echo_follow: '따라간다.', bridge: '건너간다.', contradiction: '거슬러 간다.', displacement: '비켜 간다.', avoidance: '피해 간다.', fixation: '맴돈다.', old: '되돌아간다.' };
function passWord(kind, pattern) {
  const own = (run.memory.meta && run.memory.meta.pass_words) || {};
  const key = kind === 'old' ? 'old' : kind === 'same' ? 'fixation' : (pattern === 'fixation' ? 'bridge' : pattern);   // circling is said only when the door really leads back into the same room
  return own[key] || PASS[key] || PASS.bridge;
}
// ── the walk so far, shown between two rooms (261121) ──────────────────────
// Only on the dark between rooms, never over the text: a dot for each room the walker has been in, a line for each
// crossing, and the crossing just made drawn last. A room's dot sits where its door stands in the margins (doorPlace),
// so the map and the doors are one picture. Own walk only — the others' threads are the ending's to show. No names:
// a name on the room ahead would be a notice at the door.
function passMap(from, to) {
  const cv = $('rpPassMap'), dpr = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const at = (id) => { const p = doorPlace(id, false); return { x: p.x * W + 150 * DOOR_ASPECT / 2, y: p.y * H + 75 }; };
  const ids = run.path.slice(), seen = new Map();
  for (let i = 0; i < ids.length - 1; i++) { if (ids[i] === ids[i + 1]) continue; const k = [ids[i], ids[i + 1]].sort().join('|'); seen.set(k, (seen.get(k) || 0) + 1); }
  c.lineCap = 'round';
  for (const [k, n] of seen) {                                             // crossings already made: dim, thicker where walked again
    const [a, b] = k.split('|').map(at);
    c.strokeStyle = 'rgba(150,146,160,0.38)'; c.lineWidth = 0.8 + 0.7 * (n - 1);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }
  const dot = (p, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill(); };
  new Set(ids).forEach((id) => dot(at(id), id === from.id ? 3.4 : 2.6, id === from.id ? 'rgba(232,228,223,0.95)' : 'rgba(170,166,178,0.8)'));
  cv.classList.add('on');
  if (to.id === from.id) return wait(600 / FAST);                          // staying: nothing is crossed
  const A = at(from.id), B = at(to.id), dur = 1100 / FAST, t0 = performance.now(), known = ids.includes(to.id);
  return new Promise((resolve) => {
    let px = A.x, py = A.y;
    (function step() {
      const k = Math.min(1, (performance.now() - t0) / dur), e = k * k * (3 - 2 * k), x = A.x + (B.x - A.x) * e, y = A.y + (B.y - A.y) * e;
      c.strokeStyle = 'rgba(196,168,130,0.95)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke(); px = x; py = y;
      if (k < 1) return requestAnimationFrame(step);
      dot(B, known ? 3 : 3.4, 'rgba(196,168,130,1)');                      // the room arrived at: it is there the moment the line reaches it
      resolve();
    })();
  });
}
let tuneCtx = null;
async function walk(from, to, kind, connective, doorEl) {
  const leg = { from: from.scene_order, to: to.scene_order, kind, pattern: run.last.pattern, alignment: +run.last.alignment.toFixed(4), bucket: run.last.bucket, cont: run.cont };
  if (WAY && way && doorEl) leg.way = await takeWay(from, doorEl);
  await veil(true);
  if (WAY && way) { way.stop(); $('rpWay').classList.remove('on'); $('rpRoom').classList.remove('way'); $('rpCaption').classList.remove('way'); }
  room.hide(); floaters.clear(0); floaters.stop();
  const sB = soundOf(to);
  sound.prepare(sB.url, sB.vol);
  if (!CORRIDOR) {                                                          // 261120: no walked corridor for now — its kind is said in a word, typed on the dark
    leg.corridor = false; leg.said = passWord(kind, leg.pattern);
    const pass = $('rpPass');
    await wait(500 / FAST);
    await passMap(from, to);                                                // the walk so far, and the line just crossed (261121)
    await typeText(pass, leg.said, { per: 110, pace: 1 / FAST });
    await wait(2000 / FAST);
    pass.textContent = ''; $('rpPassMap').classList.remove('on');
    run.legs.push(leg);
    floaters.start();
    return enterRoom(to, kind);
  }
  const spec = {
    pattern: leg.pattern, alignment: Math.max(0, Math.min(1, run.last.alignment)), bucket: ['HIGH', 'MID', 'LOW', 'FIXATED'].includes(run.last.bucket) ? run.last.bucket : 'MID', cont: run.cont,
    fromVec: foldTo17(from.original_emotion), toVec: foldTo17(to.original_emotion),
    lookA: lookFor(run.memory, from), lookB: lookFor(run.memory, to), seedA: from.scene_order, seedB: to.scene_order,
  };
  tuneCtx = { from, to, spec };
  if (TUNE) fillTuner();
  $('rpCorridor').classList.add('on');
  corridor.resume();
  const arrived = corridor.start(spec);
  await veil(false);
  const st = corridor.state();
  leg.length = st.length;
  const cap = $('rpCaption');
  $('rpCapLine').textContent = connective || ''; $('rpCapSrc').textContent = leg.pattern === 'avoidance' ? (LANG === 'en' ? 'a way with only sound left' : '소리만 남은 길') : '';
  if (connective) { cap.classList.add('on'); setTimeout(() => cap.classList.remove('on'), 5200); }
  const hint = $('rpHint');
  hint.textContent = isTouch() ? (LANG === 'en' ? 'hold the circle to walk · drag to look' : '동그라미를 누르고 있으면 걷습니다 · 화면을 끌어 둘러봅니다') : (LANG === 'en' ? 'W or ↑ to walk · drag to look' : 'W 또는 ↑ 로 걷습니다 · 마우스로 끌어 둘러봅니다');
  hint.classList.add('on'); setTimeout(() => hint.classList.remove('on'), 9000);
  if (isTouch()) $('rpWalk').classList.add('on');
  const t0 = performance.now();
  await arrived;
  leg.seconds = +((performance.now() - t0) / 1000).toFixed(1);
  run.legs.push(leg);
  $('rpWalk').classList.remove('on'); cap.classList.remove('on'); hint.classList.remove('on');
  await veil(true);
  corridor.stop(); $('rpCorridor').classList.remove('on'); $('rpTune').classList.remove('on');
  floaters.start();
  return enterRoom(to, kind);
}
function onCorridorProgress(p) { sound.mix(p.amb); }
function isTouch() { return window.__temForceTouch === true || ((('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches); }   // 261121: touch points count too (a browser may report no ontouchstart)
function setupWalkButton() {
  const b = $('rpWalk');
  const down = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} b.classList.add('down'); corridor.setForward(true); if (way) way.setForward(true); };
  const up = () => { b.classList.remove('down'); corridor.setForward(false); if (way) way.setForward(false); };
  // 261121: the press is held even if the finger slides off the circle; it ends when the finger lifts
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
}

// ── the end ────────────────────────────────────────────────────────────────
async function finish() {
  await veil(true);
  room.hide(); floaters.clear(0); floaters.stop(); sound.fadeOut();
  if (MODE !== 'test') {
    data.writeJournal(run.memory.id, run.id, { stage: data.STAGE_TAG, mode: MODE, pre_entry: run.preEntry, visit_order: run.path.map((id) => run.scenes.find((s) => s.id === id).scene_order),
      scenes: run.rooms, legs: run.legs, contact: run.contact, seconds: Math.round((Date.now() - run.startedAt) / 1000) });
  }
  const endText = $('rpEndText'), btns = $('rpEndBtns'), trace = $('rpTrace');
  const ui = {
    veil,
    text(line, sub) { const on = !!(line || sub); $('rpEndLine').textContent = ''; $('rpEndSub').textContent = ''; endText.classList.toggle('on', on); if (on) typeText($('rpEndLine'), line || '', { per: 70 }).then((ok) => { if (ok) typeText($('rpEndSub'), sub || '', { per: 35 }); }); },
    buttons(list) {
      return new Promise((resolve) => {
        btns.innerHTML = '';
        for (const b of list) { const el = document.createElement('button'); el.className = 'rp-btn'; el.textContent = b.label; el.dataset.id = b.id; el.addEventListener('click', () => { btns.classList.remove('on'); resolve(b.id); }); btns.appendChild(el); }
        setTimeout(() => btns.classList.add('on'), 400);
      });
    },
    trace(word, line, src) {
      const key = word + '|' + line;
      if (trace.dataset.key === key) return; trace.dataset.key = key;
      trace.classList.remove('on');
      if (!word) return;
      $('rpTraceWord').textContent = ''; $('rpTraceLine').textContent = ''; $('rpTraceSrc').textContent = ''; trace.classList.add('on');
      typeText($('rpTraceWord'), word, { per: 60 }).then((ok) => ok && typeText($('rpTraceLine'), line)).then((ok) => ok && typeText($('rpTraceSrc'), src, { per: 30 }));
    },
  };
  const lines = new Map();
  const push = (id, text, mine) => { if (!lines.has(id)) lines.set(id, []); lines.get(id).push({ text, mine }); };
  for (const [id, arr] of run.said) arr.forEach((p) => push(id, lineOf(p), true));
  for (const s of run.scenes) ghostsFor(s, 4).filter((g) => (Array.isArray(g.motif_tags) ? g.motif_tags : []).some((t) => ((s.meta && s.meta.motif_tags) || []).includes(t))).forEach((g) => push(s.id, g.utterance, false));
  let summary = null;
  try {
    summary = await runEnding({ THREE: window.THREE, pieceCanvas: $('rpPiece'), terrainCanvas: $('strataCanvas'), ui, scenes: run.scenes,
      others: run.others.map((p) => ({ run_id: p.run_id, scene_id: p.scene_id, created_at: p.created_at })), myPath: run.path, myRunId: run.id,
      labelOf: sceneLabel, linesFor: (id) => lines.get(id) || [] });
  } catch (e) { console.error('[room] ending', e); toast('끝 화면을 그리지 못했습니다'); }
  window.__room.summary = summary;
  location.href = qs.get('back') || 'index.html';
}

// ── look tuner (?tune=1): the author adjusts the corridor's borrowings from each room ──
const TUNE_FIELDS = [['wall', 'color', '벽'], ['floor', 'color', '바닥'], ['trim', 'color', '문틀·띠'], ['light', 'color', '빛 색'], ['bg', 'color', '하늘·어둠'], ['lightI', 'range:0.3:1.4:0.05', '빛 세기'], ['fog', 'range:0.02:0.2:0.01', '안개'], ['enclosure', 'range:0:1:0.02', '닫힘'], ['step', 'select:wood,tile,snow,carpet', '발소리']];
function setupTuner() {
  const box = $('rpTune');
  box.innerHTML = '<h4></h4><div class="rp-tune-which"></div><div class="rp-tune-fields"></div><div class="rp-tune-row"><button data-a="save">저장</button><button data-a="export">내보내기</button><button data-a="reset">되돌림</button></div><textarea readonly></textarea>';
  box.querySelector('[data-a=save]').addEventListener('click', () => { const c = tuneCode(); saveLook(run.memory.id, c, tuneRead()); toast('저장됨 — ' + c + ' (이 브라우저)'); });
  box.querySelector('[data-a=export]').addEventListener('click', () => { const ta = box.querySelector('textarea'); ta.style.display = 'block'; ta.value = JSON.stringify(storedLooks(run.memory.id), null, 1); ta.select(); });
  box.querySelector('[data-a=reset]').addEventListener('click', () => { const all = storedLooks(run.memory.id); delete all[tuneCode()]; localStorage.setItem('tem_room_looks:' + run.memory.id, JSON.stringify(all)); fillTuner(); tuneApply(); });
}
let tuneSide = 'B';
function tuneScene() { return tuneSide === 'A' ? tuneCtx.from : tuneCtx.to; }
function tuneCode() { const s = tuneScene(); return (s.meta && s.meta.scene_code) || String(s.scene_order); }
function hex(n) { return '#' + ('000000' + (Number(n) >>> 0).toString(16)).slice(-6); }
function fillTuner() {
  const box = $('rpTune'); box.classList.add('on');
  box.querySelector('h4').textContent = '통로 조정 — ' + tuneCode() + ' · ' + sceneLabel(tuneScene());
  const which = box.querySelector('.rp-tune-which'); which.innerHTML = '';
  for (const side of ['A', 'B']) { const b = document.createElement('button'); b.textContent = side === 'A' ? '떠나온 방' : '가는 방'; b.style.cssText = 'margin:0 4px 6px 0;padding:3px 8px;background:' + (side === tuneSide ? '#3a3226' : '#1c1c24') + ';border:1px solid #3a3a46;color:inherit;font-size:11px;cursor:pointer'; b.addEventListener('click', () => { tuneSide = side; fillTuner(); }); which.appendChild(b); }
  const look = normLook(lookFor(run.memory, tuneScene())), f = box.querySelector('.rp-tune-fields'); f.innerHTML = '';
  for (const [key, type, label] of TUNE_FIELDS) {
    const l = document.createElement('label'); l.textContent = label; let inp;
    if (type === 'color') { inp = document.createElement('input'); inp.type = 'color'; inp.value = hex(look[key]); }
    else if (type.startsWith('range')) { const [, a, b, s] = type.split(':'); inp = document.createElement('input'); inp.type = 'range'; inp.min = a; inp.max = b; inp.step = s; inp.value = look[key]; }
    else { inp = document.createElement('select'); type.split(':')[1].split(',').forEach((v) => { const o = document.createElement('option'); o.value = o.textContent = v; inp.appendChild(o); }); inp.value = look[key]; }
    inp.dataset.key = key; inp.dataset.type = type.split(':')[0];
    inp.addEventListener('change', tuneApply);
    l.appendChild(inp); f.appendChild(l);
  }
}
function tuneRead() {
  const o = {};
  $('rpTune').querySelectorAll('.rp-tune-fields [data-key]').forEach((inp) => { o[inp.dataset.key] = inp.dataset.type === 'color' ? parseInt(inp.value.slice(1), 16) : inp.dataset.type === 'range' ? Number(inp.value) : inp.value; });
  return o;
}
function tuneApply() {
  const base = lookFor(run.memory, tuneScene()), look = Object.assign({}, base, tuneRead());
  if (tuneSide === 'A') corridor.relook(look, null); else corridor.relook(null, look);
}

boot();

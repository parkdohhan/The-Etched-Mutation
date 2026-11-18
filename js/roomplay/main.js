/**
 * Room play — orchestrator.
 *
 *   entry → [ room (text + sound) → continuation → one door → 3D corridor ]* → the piece → flat → ground → leave
 *
 * Decision record: docs/글방_통로_무대_결정-261117.md
 * URL: ?memory=<uuid|code> (default GWON-001) · ?as=author|test · ?tune=1 · ?lang=ko|en
 *   as=author  the author's first walk (the first thread). Counted in the ground, marked in the ledger.
 *   as=test    nothing is shared: no ghost-line absorption, no contact record, rows marked and excluded.
 */
import * as data from './data.js';
import { createEngine, parseEmotion, resonanceOf, foldTo17 } from './engine.js';
import { createRoom, createFloaters, wordEl, ghostEl, doorEl, sentences, cutLast, hang, closed, subjectParticle } from './room.js';
import { createCorridor, normLook, DEFAULT_LOOK } from './corridor.js';
import { createSound } from './sound.js';
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
const DEFAULT_MEMORY = 'DANG-001';   // the flagship memory of this stage (2026-11-17). 권역 = ?memory=GWON-001
const DEPTH_STAGE_2 = 5, DEPTH_STAGE_3 = 15;                                                  // = play-test applyStageText

const veilEl = $('rpVeil');
function veil(on) { veilEl.classList.toggle('clear', !on); return wait(2300); }
function toast(msg) { const t = $('rpToast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 6000); }

const run = {
  id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
  memory: null, scenes: [], engine: null,
  visited: new Set(), said: new Map(),      // scene id → [{ connective, text }] this run
  path: [], legs: [], rooms: [],
  last: null,                               // last engine reading { pattern, alignment, bucket }
  contact: false, ghosts: [], others: [], cont: { d: 0, c: 0, h: 0 },
  preEntry: '', startedAt: Date.now(),
};
window.__room = { run, mode: MODE };       // automation / inspection hook

const sound = createSound();
let room, floaters, corridor;

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
  // corridor grain / narrowing / patchwork come from what earlier walkers did to this memory
  if (run.others.length) {
    const p = getPresentationState(replayFromPlays(run.others.map((x) => ({ alignment: x.alignment, mismatch_type: x.mismatch_type, user_emotion: x.user_emotion }))));
    const c01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
    run.cont = { d: c01(p.divergence), c: c01(p.convergence), h: c01(p.heterogeneity) };
  }
  room = createRoom($('rpRoom'), LANG, 1 / FAST);
  floaters = createFloaters($('rpFloat'), document.querySelector('.rp-column'), run.id);
  corridor = createCorridor({ canvas: $('rpCorridor'), onProgress: onCorridorProgress, speed: FAST });
  Object.assign(window.__room, { corridor, sound, floaters });
  $('rpEntryTitle').textContent = run.memory.title || '';
  $('rpEntryLead').textContent = LANG === 'en'
    ? 'You are about to walk through someone else\'s memory.\nBefore you go in — what is on your mind right now?'
    : '지금부터 다른 사람의 기억 속을 걷습니다.\n들어가기 전에 — 지금 무엇이 마음에 걸려 있습니까.';
  $('rpEntryNote').textContent = MODE === 'author' ? '작가의 첫 걸음으로 기록됩니다' : MODE === 'test' ? '시험 걸음 — 다른 사람에게 남지 않습니다' : '';
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
}

// ── which text does this visit read ─────────────────────────────────────────
function stageText(scene, visitN) {
  const depth = Number(run.memory.cont_depth) || 0;
  let st = depth <= 0 ? 0 : (depth >= DEPTH_STAGE_3 && scene.text_stage_3) ? 3 : (depth >= DEPTH_STAGE_2 && scene.text_stage_2) ? 2 : scene.text_stage_1 ? 1 : 0;
  st = Math.min(3, st + (visitN - 1));                       // every return reads one layer further from the first telling
  while (st > 0 && !scene['text_stage_' + st]) st--;
  return { stage: st, text: st ? scene['text_stage_' + st] : scene.text };
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
    const el = doorEl(sceneLabel(s), false); el.classList.add('locked');
    floaters.add(el, { key: 'd' + s.id, opacity: 0.2 }); oldDoors.push({ el, scene: s });
  }

  // the text
  let shown;
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
  let objLine = null;
  if (objs.length && !isVoid) {
    const w = objs[(nthVisit - 1) % objs.length], authored = scene.meta && scene.meta.object_lines && scene.meta.object_lines[w];
    objLine = authored || (LANG === 'en' ? 'There is ' + w + '.' : w + subjectParticle(w) + ' 보인다.');
    await room.say(objLine, 'rp-object', { gap: true, hold: 1100 });
  }

  // the continuation
  let answer, analysis = null;
  for (;;) {
    answer = await room.ask({ connectives: CONNECTIVES, voidScene: isVoid, allowSilence: isVoid });
    if (answer.silent) break;
    const S = window.LumenSafety;
    const crisis = S && S.detectCrisis ? S.detectCrisis(answer.connective + ' ' + answer.text) : { level: 'safe' };
    if (crisis.level === 'high') {                                         // the scene does not take this in; help is shown
      await room.say(LANG === 'en' ? '……no. That is too sharp to carry in here.' : '……아냐, 이건 너무 날카로워.', 'rp-narr', { gap: true });
      const res = (S.getSafetyResources ? S.getSafetyResources(LANG) : []).map((r) => r.name + ' ' + r.number).join(' · ');
      if (res) await room.say(res, 'rp-narr', {});
      continue;
    }
    break;
  }
  let userEmotion = {}, userVoid = false, alignment = 0.5, resonance = 'vague', eng = null;
  const raw = answer.silent ? '' : lineOf(answer);
  if (!answer.silent) {
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
  const next = run.engine.pickNext({ origin: scene, pattern, userEmotion, isVoid: userVoid, visited: run.visited });

  // the ledger row (a silent stay leaves no emotion — it goes to the journal, as on the terrain stage)
  const turn = { turn: 1, raw_text: raw, alignment, resonance, ghost_reply: '', via: 'cont_form', ts: Date.now(), input_form: 'cont_v1', connective: answer.connective || '',
                 stage: data.STAGE_TAG, visit: nthVisit, text_stage: tv.stage, object: objLine, arrived: via, analysed: !!analysis };
  if (!answer.silent) {
    await data.insertPlay({ memory_id: run.memory.id, scene_id: scene.id, user_emotion: userEmotion, alignment, mismatch_type: resonance, run_id: run.id,
      ghost_variant_id: null, dialog_turns: [turn], persona_id: MODE === 'test' ? data.TEST_PERSONA : MODE === 'author' ? data.AUTHOR_PERSONA : null });
  }
  run.rooms.push({ order: run.rooms.length + 1, scene_id: scene.id, scene_order: scene.scene_order, visit: nthVisit, text_stage: tv.stage, seen_text: shown.join(' '), object: objLine,
    silent: !!answer.silent, user_emotion: userEmotion, turn_alignment: +alignment.toFixed(4), resonance,
    engine: eng ? { alignment: eng.alignment_score, bucket: eng.alignment_bucket, pattern: eng.transition_pattern, mismatch: eng.mismatch_type } : null,
    door: next.scene ? { to: next.scene.scene_order, mode: next.mode, pattern } : null, ranked: next.ranked.slice(0, 5), shadow: next.shadow });
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

  // the door
  let newDoor = null;
  if (next.mode === 'fallback') await room.say(LANG === 'en' ? 'A gap in the memory pulls another scene toward you.' : '기억의 빈틈이 다른 장면을 끌어당긴다.', 'rp-narr', { gap: true });
  if (next.scene) {
    await wait(1600);
    newDoor = doorEl('', true);
    floaters.add(newDoor, { key: 'new', opacity: 1 });
  } else await room.say(LANG === 'en' ? 'No new door opens. The closest echo is one you have already heard.' : '새 문은 열리지 않는다. 가장 가까운 잔향은 이미 들은 것이다.', 'rp-narr', { gap: true });
  oldDoors.forEach((d) => { d.el.classList.remove('locked'); floaters.setOpacity('d' + d.scene.id, 0.46); });
  $('rpLeave').classList.add('on');

  const choice = await new Promise((resolve) => {
    leaveResolver = resolve;
    const on = (el, v) => { el.addEventListener('click', () => resolve(v)); el.addEventListener('keydown', (e) => { if (e.key === 'Enter') resolve(v); }); };
    if (newDoor) on(newDoor, { kind: next.mode === 'same' ? 'same' : 'new', scene: next.scene });
    oldDoors.forEach((d) => on(d.el, { kind: 'old', scene: d.scene }));
  });
  leaveResolver = null;
  $('rpLeave').classList.remove('on');
  if (choice.kind === 'leave') return finish();
  return walk(scene, choice.scene, choice.kind, answer.silent ? '' : answer.connective);
}
function lineOf(p) { return (p.connective ? p.connective + ' ' : '') + p.text; }
function nearestGhost(userEmotion, pool) {
  let best = null, bs = -Infinity;
  for (const g of pool) { const s = cosObj(userEmotion, parseEmotion(g.emotion_vec)); if (s > bs) { bs = s; best = g; } }
  return best;
}
function cosObj(a, b) { let d = 0, na = 0, nb = 0; const keys = new Set(Object.keys(a).concat(Object.keys(b))); for (const k of keys) { const x = Number(a[k]) || 0, y = Number(b[k]) || 0; d += x * y; na += x * x; nb += y * y; } return na && nb ? d / Math.sqrt(na * nb) : 0; }

// ── the corridor ───────────────────────────────────────────────────────────
let tuneCtx = null;
async function walk(from, to, kind, connective) {
  const leg = { from: from.scene_order, to: to.scene_order, kind, pattern: run.last.pattern, alignment: +run.last.alignment.toFixed(4), bucket: run.last.bucket, cont: run.cont };
  await veil(true);
  room.hide(); floaters.clear(0); floaters.stop();
  const sB = soundOf(to);
  sound.prepare(sB.url, sB.vol);
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
function isTouch() { return window.__temForceTouch === true || (('ontouchstart' in window) && matchMedia('(pointer: coarse)').matches); }
function setupWalkButton() {
  const b = $('rpWalk');
  const down = (e) => { e.preventDefault(); b.classList.add('down'); corridor.setForward(true); };
  const up = () => { b.classList.remove('down'); corridor.setForward(false); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
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
    text(line, sub) { const on = !!(line || sub); endText.classList.toggle('on', false); setTimeout(() => { $('rpEndLine').textContent = line || ''; $('rpEndSub').textContent = sub || ''; endText.classList.toggle('on', on); }, on ? 500 : 0); },
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
      setTimeout(() => { $('rpTraceWord').textContent = word; $('rpTraceLine').textContent = line; $('rpTraceSrc').textContent = src; trace.classList.add('on'); }, 600);
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

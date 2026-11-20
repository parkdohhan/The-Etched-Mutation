// tools/room-sim/walk.mjs — simulated walkers for the text-room stage (room-play.html), 2026-11-20
//
// What it is: a headless walker that goes through a memory the way room-play does — reads the room's text,
// continues it with one line (written by an LLM in the voice of a persona from tools/persona-sim/data),
// has that line measured by the same edge function the stage uses (claude-scene emotion_analysis), lets the
// SAME engine (js/roomplay/engine.js) take one step and name the one door, and goes through it.
// Rows go to the ledger (plays) exactly as the stage writes them, marked persona_id = 'room-sim'.
//
// What it is not: people. A persona never writes a careless line unless told it may, never closes the tab out
// of boredom. Leaving is drawn from a table (below), not decided by the persona. Evidence grade = [예비] at most.
//
// Free staging values (not definitions):
//   LEAVE  — chance of leaving after the k-th room = the stop rate measured on UNDW-001's 37 audience walks
//            (terrain stage, 2026-07-30 … 09-30): stops at k / walks that reached k.
//   REVISIT — chance of taking an old door instead of the new one. No data (the terrain stage had no way back).
//   ABSORB  — share of lines that join the floating pool (the stage absorbs every line; here a share, so the
//            pool is not drowned in machine lines).
//
// Usage:  node tools/room-sim/walk.mjs --memory GWON-001 [--runs 30] [--dry] [--out file.json] [--concurrency 3]
// Undo:   delete from plays where persona_id = 'room-sim' and memory_id = …;
//         delete from run_journals where run_traces->>'mode' = 'sim' and memory_id = …;
//         delete from ghost_variants where extractor_version like '%room-sim%' and memory_id = …;
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createEngine, parseEmotion, resonanceOf } from '../../js/roomplay/engine.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const require = createRequire(path.join(ROOT, 'tools', 'persona-sim', 'package.json'));
require('dotenv').config({ path: path.join(ROOT, 'tools', 'persona-sim', '.env') });
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new (Anthropic.default || Anthropic)();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry');
const MEMORY = arg('memory', 'GWON-001');
const RUNS = Number(arg('runs', 30));
const CONC = Number(arg('concurrency', 3));
const OUT = arg('out', null);
const MODEL = arg('model', 'claude-sonnet-5-5');
// --lines a.json,b.json : lines written beforehand, { personaKey: { sceneOrder: { c, t, c2, t2 } | { silent: true } } }.
// Used when the API key has no credit (2026-11-20): the first-visit text of a room is fixed, so a line written
// for (persona, scene) ahead of time is the line that persona would have been asked for there. c2/t2 = a return visit.
// The engine, the emotion measurement and the ledger rows are the same either way; only who typed the line differs.
const BANK = (() => { const f = arg('lines', null); if (!f) return null; const o = {}; for (const x of f.split(',')) Object.assign(o, JSON.parse(fs.readFileSync(x.trim(), 'utf8'))); return o; })();
const SIM_PERSONA = 'room-sim', STAGE_TAG = 'room_v1';
const LEAVE = [0.216, 0.138, 0.04, 0.125, 0.143, 0.167, 0.2, 0.083, 0.18, 0.22, 0.29, 0.4];   // after room 1, 2, … (then 0.3)
const REVISIT = 0.1, ABSORB = 0.25;
const CONNECTIVES = ['그런데', '하지만', '그리고', '그럼에도 불구하고', '그래서', '그러다가', '그러자', '그 순간'];

const cfg = fs.readFileSync(path.join(ROOT, 'js', 'lib', 'config.js'), 'utf8');
const SB = cfg.match(/'(https:\/\/[a-z0-9]+\.supabase\.co)'/)[1], KEY = cfg.match(/'(eyJ[A-Za-z0-9_\-.]+)'/)[1];
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const rest = async (p, init) => { const r = await fetch(SB + '/rest/v1/' + p, Object.assign({ headers: H }, init)); if (!r.ok) throw new Error(p.split('?')[0] + ' ' + r.status + ' ' + (await r.text()).slice(0, 200)); return r.status === 204 || r.status === 201 ? null : r.json(); };
const fn = async (name, body) => { const r = await fetch(SB + '/functions/v1/' + name, { method: 'POST', headers: H, body: JSON.stringify(body) }); if (!r.ok) return null; return r.json().catch(() => null); };

// ── text helpers (= js/roomplay/room.js) ────────────────────────────────────
const sentences = (text) => { const t = String(text || '').trim(); if (!t) return []; const m = t.match(/[^.!?…]+[.!?…]+["”’']?|[^.!?…]+$/g); return (m || [t]).map((s) => s.trim()).filter(Boolean); };
const hang = (s) => String(s).replace(/[.!?…\s]+["”’']?$/, '') + '…';
const closed = (s) => { const t = String(s).trim(); return /[.!?…]["”’']?$/.test(t) ? t : t + '.'; };
const cutLast = (text) => { const s = sentences(text); if (s.length <= 1) return s.map(hang); const kept = s.slice(0, -1); kept[kept.length - 1] = hang(kept[kept.length - 1]); return kept; };
const subjectParticle = (w) => { const c = String(w).trim().slice(-1).charCodeAt(0); if (c < 0xac00 || c > 0xd7a3) return '이(가)'; return (c - 0xac00) % 28 === 0 ? '가' : '이'; };
const lineOf = (p) => (p.connective ? p.connective + ' ' : '') + p.text;

// the authored first-visit cuts (js/shared/tem_stem_cuts.js sets window.TemStemCuts)
function loadStems() {
  try { const w = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'js', 'shared', 'tem_stem_cuts.js'), 'utf8'))(w); return w.TemStemCuts || {}; } catch (e) { console.warn('stems not loaded:', e.message); return {}; }
}

function personas() {
  const dir = path.join(ROOT, 'tools', 'persona-sim', 'data'), out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /_personas\.json$/.test(x)).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const p of (Array.isArray(j) ? j : j.personas || [])) out.push({ key: f.replace('_personas.json', '') + ':' + p.persona_id, strata: p.strata_label, scores: p.scores, persona: p.persona });
  }
  return out;
}

async function analyze(text, axes, context) {
  for (let t = 0; t < 3; t++) {
    const d = await fn('claude-scene', { type: 'emotion_analysis', emotion: text, reason: text, anchorEmotions: axes, context });
    let base = d && d.analysis && d.analysis.base;
    if (typeof base === 'string') { try { base = JSON.parse(base); } catch (_) { base = null; } }
    if (base && typeof base === 'object' && !Array.isArray(base) && Object.keys(base).length && !Object.values(base).some((v) => Number(v) > 0)) throw new Error('MEASUREMENT_DOWN: claude-scene answered with an empty vector (its model call failed — check the API account credit). Nothing is written with a stand-in.');
    if (base && typeof base === 'object' && !Array.isArray(base) && Object.keys(base).length) return { base, reason_analysis: (d.reason_analysis && typeof d.reason_analysis === 'object') ? d.reason_analysis : null };
    await new Promise((r) => setTimeout(r, 1200 * (t + 1)));
  }
  return null;
}

let model = MODEL, noThink = true;
async function say(persona, shown, objLine, isVoid, seen, mine, scene, nthVisit) {
  if (BANK) {
    const e = (BANK[persona.key] || {})[String(scene.scene_order)];
    if (!e) throw new Error('no prepared line for ' + persona.key + ' scene ' + scene.scene_order);
    if (e.silent) return { silent: true };
    const again = nthVisit > 1 && e.t2;
    const text = String(again ? e.t2 : e.t || '').replace(/["“”]/g, '').trim().slice(0, 120), c = again ? e.c2 : e.c;
    if (!text) { if (isVoid) return { silent: true }; throw new Error('empty prepared line for ' + persona.key + ' scene ' + scene.scene_order); }
    return { connective: CONNECTIVES.includes(c) ? c : (isVoid ? '' : '그리고'), text };
  }
  const sys = '당신은 아래 사람입니다. 이 사람으로서만 말합니다. 성격 용어나 분석 말투를 쓰지 않습니다.\n' + JSON.stringify(persona.persona);
  const user = [
    '검은 화면에서 다른 사람의 기억 한 장면을 읽고 있습니다. 이번 걸음에서 ' + (seen + 1) + '번째 방입니다.',
    '화면의 글:', shown.map((l) => '  ' + l).join('\n'),
    objLine ? '그 아래 한 줄: ' + objLine : '',
    mine.length ? '당신이 앞 방들에서 쓴 말: ' + mine.slice(-2).join(' / ') : '',
    isVoid ? '이 방에는 아무 말도 없습니다. 무엇이든 한 줄 적거나, 말없이 있을 수 있습니다.' : '문장이 끊겼습니다. 연결사 하나를 고르고, 그 뒤를 한 줄로 이어 씁니다. 연결사: ' + CONNECTIVES.join(', '),
    '사람은 매번 성의 있게 쓰지 않습니다. 지금 이 장면이 당신에게 닿으면 길게, 안 닿으면 두세 낱말로 대충 씁니다. 5~45자. 설명·감상문·따옴표 금지, 이어지는 말 그 자체만.',
    '출력은 JSON 한 줄만: ' + (isVoid ? '{"silent": true} 또는 {"connective": "", "text": "..."}' : '{"connective": "...", "text": "..."}'),
  ].filter(Boolean).join('\n');
  for (let t = 0; t < 3; t++) {
    try {
      const res = await anthropic.messages.create(Object.assign({ model, max_tokens: noThink ? 400 : 4000, temperature: 1, system: sys, messages: [{ role: 'user', content: user }] }, noThink ? { thinking: { type: 'disabled' } } : {}));   // newer models think by default and spend a small budget before writing a word
      const raw = res.content.map((c) => c.text || '').join(''), m = raw.match(/\{[\s\S]*\}/);
      if (!m) { console.warn('say: no JSON in reply:', raw.slice(0, 160), '| stop', res.stop_reason, '| blocks', JSON.stringify(res.content).slice(0, 300), '| usage', JSON.stringify(res.usage)); continue; }
      const j = JSON.parse(m[0]);
      if (isVoid && j.silent) return { silent: true };
      const text = String(j.text || '').replace(/["“”]/g, '').trim().slice(0, 120);
      if (!text) continue;
      const connective = CONNECTIVES.includes(j.connective) ? j.connective : (isVoid ? '' : CONNECTIVES[Math.floor(Math.random() * CONNECTIVES.length)]);
      return { connective, text };
    } catch (e) {
      if (noThink && e.status === 400 && /thinking/i.test(String(e.message))) { noThink = false; continue; }
      if (/not_found|404|model/i.test(String(e.message)) && model !== 'claude-sonnet-4-6') { console.warn('model', model, 'unavailable → claude-sonnet-4-6'); model = 'claude-sonnet-4-6'; continue; }
      console.warn('say failed (' + (t + 1) + '/3):', e.status || '', String(e.message).slice(0, 200));
      await new Promise((r) => setTimeout(r, 1500 * (t + 1)));
    }
  }
  throw new Error('persona line could not be written (3 tries) — the run is stopped rather than filled with a stand-in line');
}

async function walk(mem, scenes, stems, ghosts, persona, n) {
  const engine = createEngine(scenes, {});
  const run = { id: crypto.randomUUID(), visited: new Set(), said: new Map(), path: [], rooms: [], last: null, contact: false, mine: [], absorbed: 0, t0: Date.now() };
  const depth = Number(mem.cont_depth) || 0;
  const stageText = (scene, visitN) => {
    let st = depth <= 0 ? 0 : (depth >= 15 && scene.text_stage_3) ? 3 : (depth >= 5 && scene.text_stage_2) ? 2 : scene.text_stage_1 ? 1 : 0;
    st = Math.min(3, st + (visitN - 1));
    while (st > 0 && !scene['text_stage_' + st]) st--;
    return { stage: st, text: st ? scene['text_stage_' + st] : scene.text };
  };
  let scene = scenes[0], via = 'start';
  for (let guard = 0; guard < 60 && scene; guard++) {
    const prior = (run.said.get(scene.id) || []).slice();
    const nthVisit = run.path.filter((id) => id === scene.id).length + 1;
    run.path.push(scene.id); run.visited.add(scene.id);
    const isVoid = !!(scene.void_info && scene.void_info.sceneVoid) || /^[…\s.]*$/.test(scene.text || '');
    const tv = stageText(scene, nthVisit);
    let shown;
    if (isVoid) shown = ['…'];
    else if (nthVisit === 1 && tv.stage === 0 && stems[scene.id] && stems[scene.id].text) shown = sentences(stems[scene.id].text);
    else {
      shown = cutLast(tv.text);
      if (prior.length) { shown[shown.length - 1] = closed(shown[shown.length - 1].replace(/…$/, '')); prior.forEach((p, i) => shown.push(i === prior.length - 1 ? hang(lineOf(p)) : closed(lineOf(p)))); }
    }
    const m = scene.meta || {}, objs = (Array.isArray(m.object_tags) ? m.object_tags : (Array.isArray(m.motif_tags) ? m.motif_tags : [])).filter(Boolean);
    let objLine = null;
    if (objs.length && !isVoid) { const w = objs[(nthVisit - 1) % objs.length]; objLine = (m.object_lines && m.object_lines[w]) || (w + subjectParticle(w) + ' 보인다.'); }

    const answer = await say(persona, shown, objLine, isVoid, run.rooms.length, run.mine, scene, nthVisit);
    let userEmotion = {}, userVoid = false, alignment = 0.5, resonance = 'vague', eng = null, analysis = null;
    const raw = answer.silent ? '' : lineOf(answer);
    if (!answer.silent) {
      analysis = await analyze(raw, engine.axes, { scene_text: shown.join(' ').slice(0, 400), ghost_line: (objLine || shown[shown.length - 1] || '').slice(0, 200) });
      if (analysis) {
        userEmotion = parseEmotion(analysis.base); userVoid = !!(analysis.reason_analysis && analysis.reason_analysis.is_void);
        const a = engine.alignmentTo(scene, userEmotion);
        alignment = a > 0 ? a : (run.last ? run.last.turnAlignment : 0.5);
        resonance = resonanceOf(alignment);
        eng = engine.step(scene, userEmotion, userVoid);
      }
      if (!run.said.has(scene.id)) run.said.set(scene.id, []);
      run.said.get(scene.id).push({ connective: answer.connective, text: answer.text });
      run.mine.push(raw);
    }
    const pattern = eng ? eng.transition_pattern : answer.silent ? (isVoid ? 'echo_follow' : 'avoidance') : ((run.last && run.last.pattern) || 'bridge');
    run.last = { pattern, alignment: eng ? eng.alignment_score : (answer.silent && isVoid ? 0.7 : 0.4), bucket: eng ? eng.alignment_bucket : 'MID', turnAlignment: alignment };
    const next = engine.pickNext({ origin: scene, pattern, userEmotion, isVoid: userVoid, visited: run.visited });

    const turn = { turn: 1, raw_text: raw, alignment, resonance, ghost_reply: '', via: 'cont_form', ts: Date.now(), input_form: 'cont_v1', connective: answer.connective || '',
      stage: STAGE_TAG, visit: nthVisit, text_stage: tv.stage, object: objLine, arrived: via, analysed: !!analysis, sim: { persona: persona.key, strata: persona.strata, lines: BANK ? 'prepared (Claude Code session, 261120)' : model } };
    if (!answer.silent && !DRY) {
      await rest('plays', { method: 'POST', body: JSON.stringify({ user_reason: '', wave_data: null, layer_id: 0, user_id: null, memory_id: mem.id, scene_id: scene.id, user_emotion: userEmotion, alignment, mismatch_type: resonance, run_id: run.id, ghost_variant_id: null, dialog_turns: [turn], persona_id: SIM_PERSONA }) });
    }
    if (!answer.silent && resonance === 'resonance' && !run.contact) run.contact = true;      // the stage shows a ghost line here; nothing to write for a simulated walker
    if (!answer.silent && !isVoid && !DRY && Math.random() < ABSORB && !/자살|자해|죽고 ?싶|죽이고/.test(raw)) {
      const ex = await fn('claude-scene', { type: 'emotion_extract', user_text: raw, scene_text: '' });
      const r = await fn('insert-ghost-variant', { memory_id: mem.id, kind: 'drift', is_seed: false, parent_variant_id: null, utterance: raw, emotion_vec: (ex && ex.base) || {}, extractor_version: ((ex && ex.prompt_version) || 'absorb_v1') + '+room-sim', motif_tags: (m.motif_tags || []).slice(0, 3) });
      if (r) run.absorbed++;
    }
    run.rooms.push({ order: run.rooms.length + 1, scene_id: scene.id, scene_order: scene.scene_order, visit: nthVisit, text_stage: tv.stage, seen_text: shown.join(' '), object: objLine,
      silent: !!answer.silent, said: raw, user_emotion: userEmotion, turn_alignment: +alignment.toFixed(4), resonance, analysed: !!analysis,
      engine: eng ? { alignment: eng.alignment_score, bucket: eng.alignment_bucket, pattern: eng.transition_pattern, mismatch: eng.mismatch_type } : null,
      door: next.scene ? { to: next.scene.scene_order, mode: next.mode, pattern } : null, ranked: next.ranked.slice(0, 5), shadow: next.shadow });

    // what the walker does at the door: leave / an old door / the new door
    const k = run.rooms.length, pLeave = k <= LEAVE.length ? LEAVE[k - 1] : 0.3;
    let choice;
    if (Math.random() < pLeave) choice = { kind: 'leave' };
    else {
      const olds = scenes.filter((s) => run.visited.has(s.id) && s.id !== scene.id);
      if (olds.length && (Math.random() < REVISIT || !next.scene)) choice = next.scene || Math.random() < 0.5 ? { kind: 'old', scene: olds[Math.floor(Math.random() * olds.length)] } : { kind: 'leave' };
      else if (next.scene) choice = { kind: next.mode === 'same' ? 'same' : 'new', scene: next.scene };
      else choice = { kind: 'leave' };
    }
    run.rooms[run.rooms.length - 1].took = choice.kind;
    if (choice.kind === 'leave') break;
    via = choice.kind; scene = choice.scene;
  }
  if (!DRY) {
    await rest('run_journals', { method: 'POST', body: JSON.stringify({ memory_id: mem.id, run_id: run.id, input_form: STAGE_TAG, run_traces: { stage: STAGE_TAG, mode: 'sim', persona: persona.key, pre_entry: '', visit_order: run.path.map((id) => scenes.find((s) => s.id === id).scene_order), scenes: run.rooms.map(({ seen_text, ...r }) => r), legs: [], contact: run.contact, seconds: Math.round((Date.now() - run.t0) / 1000) } }) }).catch((e) => console.warn('journal', e.message));
  }
  console.log('#' + n, persona.key, '(' + persona.strata + ')', run.rooms.map((r) => r.scene_order + (r.visit > 1 ? "'" : '')).join('→'), '| absorbed', run.absorbed);
  return { run_id: run.id, persona: persona.key, strata: persona.strata, rooms: run.rooms };
}

const mems = await rest('memories?' + (/^[0-9a-f]{8}-/.test(MEMORY) ? 'id' : 'code') + '=eq.' + MEMORY + '&select=id,code,title,cont_depth,meta');
if (!mems.length) throw new Error('memory not found: ' + MEMORY);
const mem = mems[0];
const scenes = await rest('scenes?memory_id=eq.' + mem.id + '&select=*&order=scene_order');
const ghosts = await rest('ghost_variants?memory_id=eq.' + mem.id + '&kind=eq.drift&select=id,utterance,motif_tags');
const stems = loadStems(), people = personas();
console.log(mem.code, '—', scenes.length, 'scenes, depth', mem.cont_depth, '· personas', people.length, '· runs', RUNS, DRY ? '· DRY (nothing written)' : '· WRITING as ' + SIM_PERSONA, BANK ? '· prepared lines' : '· model ' + model);
const results = [];
let cursor = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  for (;;) { const i = cursor++; if (i >= RUNS) return; try { results.push(await walk(mem, scenes, stems, ghosts, people[i % people.length], i + 1)); } catch (e) { console.error('run', i + 1, 'failed:', e.message); if (/MEASUREMENT_DOWN/.test(e.message)) { cursor = RUNS; return; } } }
}));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ memory: mem.code, at: new Date().toISOString(), model, dry: DRY, params: { LEAVE, REVISIT, ABSORB }, runs: results }, null, 1));
console.log('done:', results.length, 'runs,', results.reduce((a, r) => a + r.rooms.length, 0), 'rooms');

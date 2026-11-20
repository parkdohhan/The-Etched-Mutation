// tools/room-sim/bake_stage.mjs — turn the room ledger into the next layers of each scene's text (2026-11-20)
//
// room-play reads a later layer of a scene's text the deeper a memory has been walked (stageText: depth ≥ 5 →
// text_stage_2, depth ≥ 15 → text_stage_3, and every return visit one layer further). The room stage itself never
// writes those layers or the depth. This tool does, from the ledger, and can be run again whenever walks are added.
//
// Definitions (what)
//   domain        = one memory; its room rows = plays with dialog_turns[0].stage = 'room_v1', persona_id ≠ 'room-test'.
//   depth         = number of distinct runs among those rows (0 = nobody has walked it on the room stage).
//   layer 2 of a scene (juxtaposition, 해석 병치) = its layer-1 text with two walkers' lines set inside it, before
//                   its last sentence: the line that went most with the scene and the line that went most against it.
//                   The scene keeps its own first and last sentences.
//   layer 3 of a scene (hypercompletion, 과완결) = layer 2 passed once through the contaminate-text function in its
//                   hypercompletion mode, with the memory's replayed contamination state.
// Measurement (how)
//   "most with / most against" = highest / lowest alignment among that scene's rows (alignment = the value the stage
//   stored with the row; no new judgement, no model call). Different runs; a scene with one row gets one line, with
//   none it gets no layer 2. Lines matching the crisis words below are never used.
// Staging values (free): two lines per scene; thresholds 5 / 15 live in room-play (main.js), not here.
//
// Writes nothing to the scenes itself: prints SQL (scenes UPDATE is closed to the anon key). The memory's cont_* go
// through the record-contamination function (the stage's own path).
//   node tools/room-sim/bake_stage.mjs --memory GWON-001 --out bake.sql [--no-layer3] [--no-state]
// Undo: update scenes set text_stage_2 = null, text_stage_3 = null, meta = meta - 'stage_bake' where memory_id = …;
import fs from 'node:fs';
import path from 'node:path';
import { replayFromPlays, getPresentationState } from '../../js/core/ContaminationTracker.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const MEMORY = arg('memory', 'GWON-001'), OUT = arg('out', null);
const LAYER3 = !process.argv.includes('--no-layer3'), STATE = !process.argv.includes('--no-state');
// --apply : also write the layers to the scenes, with the service key in tools/persona-sim/.env (the key the persona
// tool already uses for its inserts). Without it the tool only prints SQL.
const APPLY = process.argv.includes('--apply');
// --min-len N : a line is used only if it has at least N letters after its connective (0 = any). Staging, not definition:
// the alignment value cannot tell a careless line from a meant one, so a showing may keep the short ones out.
const MIN_LEN = Number(arg('min-len', 0));
// --source room (default) | audience : whose lines. 'audience' = every row a person left on this memory on any stage
//   (persona_id empty), for a memory with real walks on the terrain stage and none yet on the room stage.
// --to columns (default) | meta : where the layers go. 'meta' = scenes.meta.room_text {"2","3"}, read only by the
//   room stage — the terrain stage keeps reading text_stage_N, so a memory shown on both is not changed there.
const SOURCE = arg('source', 'room'), TO = arg('to', 'columns');
globalThis.window = globalThis.window || {};
const Safety = await import('../../js/safety.js').then(() => globalThis.window.LumenSafety).catch(() => null);
/** A person's line may enter a scene's text only through the stage's own absorb filter, and never if it reads as a crisis. */
function cleared(text) {
  if (CRISIS.test(text)) return null;
  if (!Safety) return SOURCE === 'audience' ? null : text;                 // no filter, no real people's words
  const c = Safety.detectCrisis ? Safety.detectCrisis(text) : { level: 'safe' };
  if (c && (c.level === 'high' || c.level === 'mid')) return null;
  const v = Safety.safetyForAbsorb(text);
  if (!v || !v.ok) return null;
  if (v.sanitized && v.sanitized !== text) return null;                    // the filter had to replace a word: the line is left out rather than shown altered
  if (/[ㄱ-ㅎㅏ-ㅣ]/.test(text)) return null;                                  // a stray half-typed letter: not set into a scene's text
  return text.replace(/^(그런데|하지만|그리고|그럼에도 불구하고|그래서|그러다가|그러자|그 순간)\s+\1\s+/, '$1 ');
}
const applied = [];
const cfg = fs.readFileSync(path.join(ROOT, 'js', 'lib', 'config.js'), 'utf8');
const SB = cfg.match(/'(https:\/\/[a-z0-9]+\.supabase\.co)'/)[1], KEY = cfg.match(/'(eyJ[A-Za-z0-9_\-.]+)'/)[1];
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const get = async (p) => { const r = await fetch(SB + '/rest/v1/' + p, { headers: H }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
const fn = async (name, body) => { const r = await fetch(SB + '/functions/v1/' + name, { method: 'POST', headers: H, body: JSON.stringify(body) }); const j = await r.json().catch(() => null); return { ok: r.ok, status: r.status, data: j }; };
const sentences = (text) => { const t = String(text || '').trim(); if (!t) return []; const m = t.match(/[^.!?…]+[.!?…]+["”’']?|[^.!?…]+$/g); return (m || [t]).map((s) => s.trim()).filter(Boolean); };
const closed = (s) => { const t = String(s).trim(); return /[.!?…]["”’']?$/.test(t) ? t : t + '.'; };
const dq = (s) => { let tag = 'q'; while (String(s).includes('$' + tag + '$')) tag += 'q'; return '$' + tag + '$' + s + '$' + tag + '$'; };
const CRISIS = /자살|자해|죽고 ?싶|죽이고|목을 매/;

const mem = (await get('memories?' + (/^[0-9a-f]{8}-/.test(MEMORY) ? 'id' : 'code') + '=eq.' + MEMORY + '&select=id,code,cont_depth'))[0];
if (!mem) throw new Error('memory not found');
const scenes = await get('scenes?memory_id=eq.' + mem.id + '&select=id,scene_order,text,text_stage_1,void_info&order=scene_order');
const all = await get('plays?memory_id=eq.' + mem.id + '&select=run_id,scene_id,created_at,persona_id,alignment,mismatch_type,user_emotion,dialog_turns&run_id=not.is.null&order=created_at&limit=5000');
const rows = SOURCE === 'audience'
  ? all.filter((p) => !p.persona_id && Array.isArray(p.dialog_turns) && p.dialog_turns.length)
  : all.filter((p) => p.persona_id !== 'room-test' && Array.isArray(p.dialog_turns) && p.dialog_turns[0] && p.dialog_turns[0].stage === 'room_v1');
const runs = new Set(rows.map((r) => r.run_id));
const by = {}; for (const r of rows) (by[r.persona_id || '(audience)'] = by[r.persona_id || '(audience)'] || new Set()).add(r.run_id);
console.log(mem.code, '— room rows', rows.length, '· runs', runs.size, '·', Object.entries(by).map(([k, v]) => k + ' ' + v.size).join(', '));

const state = replayFromPlays(rows.map((x) => ({ alignment: x.alignment, mismatch_type: x.mismatch_type, user_emotion: x.user_emotion })));
const pres = getPresentationState(state);
console.log('state: stage', pres.stage, 'band', pres.band, 'div', (+pres.divergence).toFixed(3), 'conv', (+pres.convergence).toFixed(3), 'het', (+pres.heterogeneity).toFixed(3), 'drift', (+state.cont_drift).toFixed(3), 'fix', (+state.cont_fixation).toFixed(3));

const sql = ['-- generated by tools/room-sim/bake_stage.mjs — ' + mem.code + ' — ' + new Date().toISOString() + ' — runs ' + runs.size];
const report = [];
for (const s of scenes) {
  if ((s.void_info && s.void_info.sceneVoid) || /^[…\s.]*$/.test(s.text || '')) continue;
  const lines = [];
  for (const r of rows.filter((x) => x.scene_id === s.id)) for (const t of r.dialog_turns) {
    const text0 = String(t.raw_text || '').trim().replace(/\s+/g, ' '), text = text0 && text0.length <= 60 ? (cleared(text0) || '') : '';   // one line's length; through the safety filter
    if (text && !CRISIS.test(text) && text.replace(/^(그런데|하지만|그리고|그럼에도 불구하고|그래서|그러다가|그러자|그 순간)\s*/, '').length >= MIN_LEN) lines.push({ run: r.run_id, text, a: Number(t.alignment != null ? t.alignment : r.alignment) || 0, who: r.persona_id || 'audience' });
  }
  if (!lines.length) { report.push({ order: s.scene_order, rows: 0 }); continue; }
  lines.sort((x, y) => y.a - x.a);
  const hi = lines[0], lo = lines.slice().reverse().find((l) => l.run !== hi.run && l.text !== hi.text && l.a < hi.a) || null;
  const base = sentences(s.text_stage_1 || s.text), picked = [hi].concat(lo ? [lo] : []);
  // the scene's closing unit = its last sentence; a closing fragment of a few letters ("0.") stays with the sentence before it
  const tail = base.length > 1 && base[base.length - 1].replace(/[\s.!?…]/g, '').length < 4 ? 2 : 1;
  const layer2 = base.slice(0, -tail).concat(picked.map((l) => closed(l.text)), base.slice(-tail)).join(' ');
  let layer3 = null;
  if (LAYER3) {
    const r = await fn('contaminate-text', { text: layer2, contamination: { cont_stage: 'hypercompletion', cont_drift: state.cont_drift || 0, cont_fixation: state.cont_fixation || 0, drift_dir_v: state.drift_dir_v || 0, drift_dir_a: state.drift_dir_a || 0, drift_dir_d: state.drift_dir_d || 0, band: pres.band === 'weak' ? 'medium' : pres.band } });
    layer3 = r.ok && r.data && typeof r.data.text_stage_3 === 'string' && r.data.text_stage_3.trim() ? r.data.text_stage_3.trim() : null;
    if (!layer3) console.warn('  layer 3 failed for scene', s.scene_order, r.status, JSON.stringify(r.data).slice(0, 160));
  }
  const prov = { at: new Date().toISOString(), source: SOURCE, to: TO, rule: 'juxtaposition_v1: highest + lowest alignment line of the scene, before its last sentence', runs: runs.size, lines: picked.map((l) => ({ run_id: l.run, alignment: +l.a.toFixed(4), who: l.who })), layer3: layer3 ? 'contaminate-text hypercompletion' : null };
  if (TO === 'meta') sql.push(`update scenes set meta = meta || jsonb_build_object('room_text', ${dq(JSON.stringify(Object.assign({}, layer3 ? { 3: layer3 } : {}, { 2: layer2 })))}::jsonb, 'stage_bake', ${dq(JSON.stringify(prov))}::jsonb) where id = '${s.id}'; -- #${s.scene_order}`);
  else sql.push(`update scenes set text_stage_2 = ${dq(layer2)}, ${layer3 ? 'text_stage_3 = ' + dq(layer3) + ', ' : ''}meta = meta || jsonb_build_object('stage_bake', ${dq(JSON.stringify(prov))}::jsonb) where id = '${s.id}'; -- #${s.scene_order}`);
  applied.push({ id: s.id, order: s.scene_order, text_stage_2: layer2, text_stage_3: layer3, prov });
  report.push({ order: s.scene_order, rows: lines.length, hi: hi.a.toFixed(2) + ' ' + hi.text, lo: lo ? lo.a.toFixed(2) + ' ' + lo.text : null, layer2, layer3 });
}
if (STATE && runs.size) {
  const contState = Object.assign({}, state, { cont_depth: runs.size });
  const r = await fn('record-contamination', { memoryId: mem.id, contState });
  console.log('record-contamination:', r.status, JSON.stringify(r.data).slice(0, 300));
}
if (APPLY) {
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(ROOT, 'tools', 'persona-sim', 'package.json'));
  req('dotenv').config({ path: path.join(ROOT, 'tools', 'persona-sim', '.env') });
  const sb = req('@supabase/supabase-js').createClient(SB, process.env.SUPABASE_SERVICE_KEY);
  let ok = 0;
  for (const a of applied) {
    const cur = await sb.from('scenes').select('meta').eq('id', a.id).single();
    if (cur.error) { console.warn('  apply: read failed #' + a.order, cur.error.message); continue; }
    const patch = { text_stage_2: a.text_stage_2, meta: Object.assign({}, cur.data.meta, { stage_bake: a.prov }) };
    if (TO === 'meta') { delete patch.text_stage_2; patch.meta.room_text = Object.assign({}, a.text_stage_3 ? { 3: a.text_stage_3 } : {}, { 2: a.text_stage_2 }); }
    else if (a.text_stage_3) patch.text_stage_3 = a.text_stage_3;
    const u = await sb.from('scenes').update(patch).eq('id', a.id).select('id');
    if (u.error || !u.data || !u.data.length) console.warn('  apply: write failed #' + a.order, u.error ? u.error.message : '0 rows'); else ok++;
  }
  console.log('applied to scenes:', ok, '/', applied.length);
}
if (OUT) { fs.writeFileSync(OUT, sql.join('\n') + '\n'); fs.writeFileSync(OUT.replace(/\.sql$/, '') + '.report.json', JSON.stringify({ memory: mem.code, runs: runs.size, state, presentation: pres, scenes: report }, null, 1)); console.log('wrote', OUT); }
for (const r of report) console.log('#' + r.order, 'rows', r.rows, r.hi ? '| 맞는 말: ' + r.hi + ' | 어긋난 말: ' + (r.lo || '-') : '');

/**
 * Room-play data layer — Supabase reads/writes for the text-room stage.
 *
 * The ledger stays `plays` (one row per scene visit, run_id groups a run). Nothing new is stored
 * for the terrain: it is re-baked from the ledger every time (decision G10).
 * Room-stage rows carry dialog_turns[0].stage === 'room_v1' so they are never mixed with walks
 * recorded on the old terrain stage.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config.js';

export const STAGE_TAG = 'room_v1';
export const TEST_PERSONA = 'room-test';      // excluded everywhere
export const AUTHOR_PERSONA = 'room-author';  // the author's first walk — the first thread

let sb = null;
export function client() {
  if (!sb) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return sb;
}

export async function loadMemory(ref) {
  const c = client();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ref);
  let q = c.from('memories').select('id, code, title, cont_depth, meta');
  q = isUuid ? q.eq('id', ref) : q.eq('code', ref);
  const m = await q.limit(1).maybeSingle();
  if (m.error || !m.data) throw new Error('memory not found: ' + ref);
  const s = await c.from('scenes').select('*').eq('memory_id', m.data.id).order('scene_order');
  if (s.error) throw s.error;
  return { memory: m.data, scenes: s.data || [] };
}

/** Earlier walkers' lines (drift pool). Anchors (seed without parent) are the author's own voice — kept too. */
export async function loadGhostLines(memoryId) {
  const r = await client().from('ghost_variants').select('id, utterance, motif_tags, emotion_vec, is_seed, parent_variant_id').eq('memory_id', memoryId).eq('kind', 'drift');
  if (r.error) { console.warn('[room] ghost lines', r.error); return []; }
  return (r.data || []).filter((g) => g.utterance && String(g.utterance).trim());
}

/** Every room-stage visit of this memory, oldest first. Test runs dropped. */
export async function loadRoomPlays(memoryId) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await client().from('plays').select('run_id, scene_id, created_at, persona_id, alignment, mismatch_type, user_emotion, dialog_turns').eq('memory_id', memoryId).not('run_id', 'is', null).order('created_at').range(from, from + 999);
    if (r.error) { console.warn('[room] plays', r.error); break; }
    out.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) break;
  }
  return out.filter((p) => p.persona_id !== TEST_PERSONA && Array.isArray(p.dialog_turns) && p.dialog_turns[0] && p.dialog_turns[0].stage === STAGE_TAG);
}

export async function insertPlay(row) {
  const c = client();
  let userId = null;
  try { const u = await c.auth.getUser(); userId = (u && u.data && u.data.user && u.data.user.id) || null; } catch (_) { /* anonymous */ }
  const r = await c.from('plays').insert(Object.assign({ user_reason: '', wave_data: null, layer_id: 0, user_id: userId }, row));
  if (r.error) console.warn('[room] play insert failed', r.error);
  return !r.error;
}

/** Player text → emotion on the memory's axes. Same call as the live dialog (lumen_dialog_phase1 _analyzeEmotion). */
export async function analyzeEmotion(text, axes, context) {
  try {
    const resp = await client().functions.invoke('claude-scene', { body: { type: 'emotion_analysis', emotion: text, reason: text, anchorEmotions: axes || null, context: context || null } });
    if (resp && resp.error) { console.warn('[room] claude-scene', resp.error); return null; }
    const data = resp && resp.data;
    let base = data && data.analysis && data.analysis.base;
    if (typeof base === 'string') { try { base = JSON.parse(base); } catch (_) { base = null; } }
    if (!base || typeof base !== 'object' || Array.isArray(base) || !Object.keys(base).length) return null;
    const ra = (data.reason_analysis && typeof data.reason_analysis === 'object' && !Array.isArray(data.reason_analysis)) ? data.reason_analysis : null;
    return { base, reason_analysis: ra };
  } catch (e) { console.warn('[room] claude-scene exception', e); return null; }
}

export function recordContact(body) {
  return client().functions.invoke('record-contact', { body }).then((r) => { if (r && r.error) console.warn('[room] record-contact', r.error); }, (e) => console.warn('[room] record-contact', e));
}

/**
 * The walker's line joins the pool the next walker will see floating (same path the live dialog
 * uses: safety filter → emotion_extract → insert-ghost-variant). Fire-and-forget.
 */
export async function absorbLine(o) {
  try {
    const S = window.LumenSafety;
    let text = o.utterance;
    if (!S || typeof S.safetyForAbsorb !== 'function') return null;   // never absorb unfiltered text
    const v = S.safetyForAbsorb(text);
    if (!v || !v.ok) return null;
    text = v.sanitized || text;
    const c = client();
    let emotion_vec = {}, ver = 'absorb_v1_no_extract';
    try {
      const ex = await c.functions.invoke('claude-scene', { body: { type: 'emotion_extract', user_text: text, scene_text: '' } });
      if (!ex.error && ex.data && ex.data.base) { emotion_vec = ex.data.base; ver = (ex.data.prompt_version || 'absorb_v1') + '+no_meta_boost'; }
    } catch (_) { /* insert without a vector */ }
    const r = await c.functions.invoke('insert-ghost-variant', { body: { memory_id: o.memoryId, kind: 'drift', is_seed: false, parent_variant_id: null, utterance: text, emotion_vec, extractor_version: ver, motif_tags: o.motifTags || [] } });
    return r.error ? null : (r.data && r.data.variant && r.data.variant.id) || null;
  } catch (e) { console.warn('[room] absorb', e); return null; }
}

/** One journal row per run (visit order, what was shown, the engine's readings, shadow scores). */
export async function writeJournal(memoryId, runId, traces) {
  const c = client();
  const r = await c.from('run_journals').insert({ memory_id: memoryId, run_id: runId, input_form: STAGE_TAG, run_traces: traces });
  if (r.error) console.warn('[room] journal', r.error);
}

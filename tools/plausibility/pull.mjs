// tools/plausibility/pull.mjs — UNDW-001 자료를 DB 에서 읽기만 해서 저장 (사전 등록 v1 §2)
// 쓰기 0. 발화 원문(dialog_turns[].raw_text)은 여기서 즉시 버리고 공백 플래그만 남긴다.
// 열쇠: tools/persona-sim/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY). 경로는 이 파일 기준 상대 → 어느 컴퓨터든 동일.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
export const MEMORY_ID = '1835926d-5acc-4d43-afd7-273ed853bca4'; // UNDW-001
export const DATA_CUTOFF = '2026-11-07T00:00:00Z';               // 사전 등록 v1 §2 고정

function loadEnv() {
  const envPath = path.join(ROOT, 'tools', 'persona-sim', '.env');
  if (!fs.existsSync(envPath)) throw new Error('열쇠 파일 없음: tools/persona-sim/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY)');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('='); env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('.env 에 SUPABASE_URL / SUPABASE_SERVICE_KEY 없음');
  return env;
}

/** dialog_turns → 공백 플래그만. 원문은 절대 남기지 않는다. */
export function reduceDialogTurns(turns) {
  if (!Array.isArray(turns) || !turns.length) return { n_turns: 0, is_void: null };
  const last = turns[turns.length - 1] || {};
  const fp = last.fingerprint || last.reason_analysis || {};
  let v = null;
  if (typeof last.is_void === 'boolean') v = last.is_void;
  else if (fp && typeof fp.is_void === 'boolean') v = fp.is_void;
  else if (fp && fp.reason_analysis && typeof fp.reason_analysis.is_void === 'boolean') v = fp.reason_analysis.is_void;
  return { n_turns: turns.length, is_void: v };
}

export async function pull({ outDir = path.join(HERE, 'out') } = {}) {
  const env = loadEnv();
  const require = createRequire(path.join(ROOT, 'tools', 'persona-sim', 'package.json'));
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  const { data: scenesRaw, error: e1 } = await sb.from('scenes')
    .select('id,scene_order,original_emotion,anchor_emotions,original_reason,void_info,exclusions,scene_role,echo_words')
    .eq('memory_id', MEMORY_ID).order('scene_order');
  if (e1) throw e1;

  const { data: playsRaw, error: e2 } = await sb.from('plays')
    .select('run_id,scene_id,created_at,user_emotion,alignment,mismatch_type,user_id,dialog_turns')
    .eq('memory_id', MEMORY_ID).not('run_id', 'is', null).is('persona_id', null)
    .lt('created_at', DATA_CUTOFF).order('created_at', { ascending: true }).limit(5000);
  if (e2) throw e2;
  const plays = playsRaw.map((p) => {
    const red = reduceDialogTurns(p.dialog_turns);
    return { run_id: p.run_id, scene_id: p.scene_id, created_at: p.created_at, user_emotion: p.user_emotion, alignment: p.alignment, mismatch_type: p.mismatch_type, user_id: p.user_id || null, n_turns: red.n_turns, is_void: red.is_void };
  });

  let journals = null;
  try {
    const { data, error } = await sb.from('run_journals').select('run_id,run_traces').eq('memory_id', MEMORY_ID);
    if (!error && Array.isArray(data)) journals = data.map((j) => ({ run_id: j.run_id, run_traces: j.run_traces ? { visit_order: j.run_traces.visit_order || null, scenes: Array.isArray(j.run_traces.scenes) ? j.run_traces.scenes.map((s) => ({ order: s.order, scene_id: s.scene_id, pattern: s.pattern || null, bucket: s.bucket || null, alignment: s.alignment })) : null } : null }));
  } catch (e) { journals = null; }

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(2, 16).replace(/[-:T]/g, '').replace(/^(\d{6})(\d{4})$/, '$1-$2');
  const out = path.join(outDir, `raw-${stamp}.json`);
  const payload = { pulled_at: new Date().toISOString(), memory_id: MEMORY_ID, data_cutoff: DATA_CUTOFF, scenes: scenesRaw, plays, journals,
    counts: { scenes: scenesRaw.length, plays: plays.length, runs: new Set(plays.map((p) => p.run_id)).size, journals: journals ? journals.length : null } };
  fs.writeFileSync(out, JSON.stringify(payload));
  return { out, counts: payload.counts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  pull().then((r) => { console.log('pulled', JSON.stringify(r.counts), '->', r.out); })
    .catch((e) => { console.error('pull 실패:', e.message || e); process.exit(1); });
}

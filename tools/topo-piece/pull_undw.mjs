// pull_undw.mjs — UNDW-001 실관객 37회차 216점 + 씬 13개를 DB에서 읽기만 해서 JSON으로 저장.
// 열쇠: tools/persona-sim/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY). 쓰기 없음.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = 'D:/The Etched Mutation';
const require = createRequire(path.join(ROOT, 'tools/persona-sim/package.json'));
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync(path.join(ROOT, 'tools/persona-sim/.env'), 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line.includes('=') || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('env missing');

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const MEM = '1835926d-5acc-4d43-afd7-273ed853bca4'; // UNDW-001

const { data: scenes, error: e1 } = await sb
  .from('scenes')
  .select('id,scene_order,original_emotion,anchor_emotions,echo_words,text')
  .eq('memory_id', MEM)
  .order('scene_order');
if (e1) throw e1;

const { data: plays, error: e2 } = await sb
  .from('plays')
  .select('run_id,scene_id,created_at,user_emotion,alignment,mismatch_type')
  .eq('memory_id', MEM)
  .not('run_id', 'is', null)
  .is('persona_id', null)
  .order('created_at', { ascending: true })
  .limit(2000);
if (e2) throw e2;

const outDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const out = path.join(outDir, 'undw_raw.json');
fs.writeFileSync(out, JSON.stringify({ pulled_at: new Date().toISOString(), memory_id: MEM, scenes, plays }));
console.log('scenes', scenes.length, 'plays', plays.length, 'runs', new Set(plays.map((p) => p.run_id)).size, '->', out);

// pull_undw_mac.mjs — tools/topo-piece/pull_undw.mjs 의 Mac 경로판. DB 읽기만, 쓰기 없음.
// 출력: 스크래치패드 undw_raw.json (저장소에 안 씀)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// 출력은 이 스크립트가 있는 폴더의 undw_raw.json (저장소 안에 두고 싶지 않으면 OUT 환경변수로 바꿈)
// 경로에 공백이 있어 URL.pathname 은 %20 이 남는다 → fileURLToPath 사용
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TEM_ROOT || path.resolve(here, '../../..');
const OUT = process.env.OUT || path.join(here, 'undw_raw.json');
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
const MEM = '1835926d-5acc-4d43-afd7-273ed853bca4';

const { data: scenes, error: e1 } = await sb.from('scenes')
  .select('id,scene_order,original_emotion,anchor_emotions,echo_words')
  .eq('memory_id', MEM).order('scene_order');
if (e1) throw e1;
const { data: plays, error: e2 } = await sb.from('plays')
  .select('run_id,scene_id,created_at,user_emotion,alignment,mismatch_type')
  .eq('memory_id', MEM).not('run_id', 'is', null).is('persona_id', null)
  .order('created_at', { ascending: true }).limit(2000);
if (e2) throw e2;
fs.writeFileSync(OUT, JSON.stringify({ pulled: new Date().toISOString(), scenes, plays }));
console.log(JSON.stringify({ scenes: scenes.length, plays: plays.length, runs: new Set(plays.map((p) => p.run_id)).size }));

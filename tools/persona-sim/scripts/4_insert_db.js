// Insert simulated plays into Supabase.
// Optionally wipes existing plays for the target memory first.
//
// Usage:
//   node scripts/4_insert_db.js           # append
//   node scripts/4_insert_db.js --wipe    # delete existing first

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('[4/insert] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!process.env.TARGET_MEMORY_ID) {
  console.error('[4/insert] Missing TARGET_MEMORY_ID');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const MEM_ID = process.env.TARGET_MEMORY_ID;
const WIPE = process.argv.includes('--wipe');

// Fetch memory code (for file naming)
const { data: memory, error: memErr } = await supabase
  .from('memories')
  .select('code')
  .eq('id', MEM_ID)
  .single();
if (memErr || !memory) {
  console.error('[4/insert] Memory fetch failed:', memErr?.message);
  process.exit(1);
}
const MEMORY_CODE = memory.code;
const PLAYS_PATH = path.join(__dirname, '..', 'data', `${MEMORY_CODE}_plays.json`);
console.log(`[4/insert] Memory: ${MEMORY_CODE}`);

if (!fs.existsSync(PLAYS_PATH)) {
  console.error(`[4/insert] plays 파일 없음: ${PLAYS_PATH}\n먼저 npm run simulate-plays 를 실행하세요.`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(PLAYS_PATH, 'utf8'));
console.log(`[4/insert] Loaded ${raw.length} plays from JSON`);

// Strip metadata fields that don't exist in plays table
const rows = raw.map(p => ({
  memory_id: p.memory_id,
  scene_id: p.scene_id,
  user_emotion: p.user_emotion,
  user_reason: p.user_reason,
  alignment: p.alignment,
  mismatch_type: p.mismatch_type,
  persona_id: p.persona_id || null,
  persona_name: p.persona_name || null,
  strata_label: p.strata_label || null,
  visit: p.visit != null ? p.visit : null,
  wave_data: null,
  layer_id: 0,
  created_at: p.created_at,
}));

if (WIPE) {
  console.log('[4/insert] Wiping existing plays for', MEM_ID, '...');
  const { error } = await supabase.from('plays').delete().eq('memory_id', MEM_ID);
  if (error) { console.error('[4/insert] wipe failed:', error); process.exit(1); }
  console.log('[4/insert] ✓ Wiped');
}

// Batch insert
const BATCH = 25;
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const { error } = await supabase.from('plays').insert(batch);
  if (error) { console.error('[4/insert] batch error at', i, ':', error); process.exit(1); }
  inserted += batch.length;
  process.stdout.write(`\r[4/insert] ${inserted}/${rows.length}`);
}
console.log();

// Verification
const { count } = await supabase.from('plays').select('*', { count: 'exact', head: true }).eq('memory_id', MEM_ID);
console.log(`[4/insert] ✓ ${count} plays now in DB for memory ${MEM_ID}`);

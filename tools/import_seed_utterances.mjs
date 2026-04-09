// tools/import_seed_utterances.mjs
//
// One-shot import of seed utterances for the Afterimage (잔상) system.
// Reads data/seed_utterances.csv and inserts rows into the `utterances` table
// with source_type='seed', is_public=true, moderation_status='approved'.
//
// Requires service role key (only this can bypass the insert RLS that forces
// is_public=false). NEVER ship the service role key — keep it in env only.
//
// Usage:
//   SUPABASE_URL="https://xxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
//   node tools/import_seed_utterances.mjs
//
// Optional flags:
//   --dry             print what would be inserted, do nothing
//   --file=path.csv   override the default CSV path
//   --replace         delete existing seed rows before inserting (use with care)

import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.map((a) => {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    }
    return [a, true];
  })
);

const CSV_PATH = flags.file ? resolve(flags.file) : join(ROOT, 'data/seed_utterances.csv');
const DRY = !!flags.dry;
const REPLACE = !!flags.replace;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

// ─── CSV parser (simple, handles quoted fields with commas) ──────
function parseCSV(text) {
  const rows = [];
  let i = 0;
  let cur = [];
  let cell = '';
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { cur.push(cell); cell = ''; i++; continue; }
    if (ch === '\n' || ch === '\r') {
      if (cell.length || cur.length) { cur.push(cell); rows.push(cur); cur = []; cell = ''; }
      // swallow CRLF
      while (i < text.length && (text[i] === '\n' || text[i] === '\r')) i++;
      continue;
    }
    cell += ch; i++;
  }
  if (cell.length || cur.length) { cur.push(cell); rows.push(cur); }
  return rows;
}

function rowsToObjects(rows) {
  const [header, ...data] = rows;
  return data.filter((r) => r.length && r.some((c) => c && c.trim())).map((r) => {
    const o = {};
    header.forEach((key, idx) => { o[key.trim()] = (r[idx] ?? '').trim(); });
    return o;
  });
}

function splitList(s) {
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

async function main() {
  console.log(`Reading ${CSV_PATH}`);
  const raw = await readFile(CSV_PATH, 'utf8');
  const rows = parseCSV(raw);
  if (rows.length < 2) { console.log('No data rows.'); return; }
  const objs = rowsToObjects(rows);

  const records = objs.map((o) => ({
    text: o.text,
    lang: o.lang || 'ko',
    contributor_id: null,
    source_type: 'seed',
    emotion_tags: splitList(o.emotion_tags),
    keywords: splitList(o.keywords),
    axis_x: parseFloat(o.axis_x || '0') || 0,
    axis_z: parseFloat(o.axis_z || '0') || 0,
    is_public: true,
    moderation_status: 'approved',
  }));

  // length sanity per DB CHECK
  const valid = records.filter((r) => r.text && [...r.text].length >= 3 && [...r.text].length <= 280);
  const skipped = records.length - valid.length;
  console.log(`Parsed ${records.length} rows (${skipped} skipped for length).`);

  if (DRY) {
    console.log(JSON.stringify(valid, null, 2));
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  if (REPLACE) {
    console.log('Deleting existing seed utterances...');
    const { error: delErr } = await supabase
      .from('utterances')
      .delete()
      .eq('source_type', 'seed');
    if (delErr) { console.error('Delete failed:', delErr.message); process.exit(1); }
  }

  const { data, error } = await supabase.from('utterances').insert(valid).select('id');
  if (error) { console.error('Insert failed:', error.message); process.exit(1); }
  console.log(`Inserted ${data.length} seed utterances.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

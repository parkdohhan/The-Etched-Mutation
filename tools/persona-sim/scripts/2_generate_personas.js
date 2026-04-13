// Generate biographical personas from sampled Big Five scores.
// Uses Claude Opus 4.6 for narrative quality.
//
// Input:  data/sampled_scores.json + meta.persona_context from Supabase
// Output: data/{MEMORY_CODE}_personas.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCORES_PATH = path.join(__dirname, '..', 'data', 'sampled_scores.json');
const TEMPLATE_PATH = path.join(__dirname, '..', 'prompts', 'persona_template-260409.md');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[2/gen] Missing ANTHROPIC_API_KEY in .env');
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('[2/gen] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!process.env.TARGET_MEMORY_ID) {
  console.error('[2/gen] Missing TARGET_MEMORY_ID');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Fetch memory: code + persona_context
console.log('[2/gen] Fetching memory from Supabase...');
const { data: memory, error: memErr } = await supabase
  .from('memories')
  .select('code, meta')
  .eq('id', process.env.TARGET_MEMORY_ID)
  .single();
if (memErr || !memory) {
  console.error('[2/gen] Memory fetch failed:', memErr?.message);
  process.exit(1);
}

const MEMORY_CODE = memory.code;
const readingContext = memory.meta?.persona_context || '(읽기 맥락 미설정 — admin Canvas에서 persona_context를 먼저 작성하세요)';
const OUT_PATH = path.join(__dirname, '..', 'data', `${MEMORY_CODE}_personas.json`);

console.log(`[2/gen] Memory: ${MEMORY_CODE}`);
if (!memory.meta?.persona_context) {
  console.warn('[2/gen] ⚠ persona_context 없음. admin Canvas 기본설정에서 먼저 작성 권장.');
}

const client = new Anthropic();
const scores = JSON.parse(fs.readFileSync(SCORES_PATH, 'utf8'));
const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

function fill(tpl, p) {
  return tpl
    .replace('{{N}}', p.scores.N)
    .replace('{{E}}', p.scores.E)
    .replace('{{O}}', p.scores.O)
    .replace('{{A}}', p.scores.A)
    .replace('{{C}}', p.scores.C)
    .replace('{{country}}', p.source.country)
    .replace('{{age}}', p.source.age)
    .replace('{{sex}}', p.source.sex)
    .replace('{{reading_context}}', readingContext);
}

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
}

const results = [];
// Resume support: if output file exists, skip already-generated ids
let existing = [];
if (fs.existsSync(OUT_PATH)) {
  try { existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); } catch (_) {}
}
const doneIds = new Set(existing.map(p => p.persona_id));

for (const p of scores) {
  if (doneIds.has(p.persona_id)) {
    console.log(`[2/gen] ${p.persona_id} already done, skipping`);
    results.push(existing.find(e => e.persona_id === p.persona_id));
    continue;
  }

  const prompt = fill(template, p);
  console.log(`[2/gen] Generating ${p.persona_id} (${p.strata_label})...`);

  try {
    const res = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0].text;
    const persona = extractJson(text);
    const full = { ...p, memory_code: MEMORY_CODE, persona };
    results.push(full);

    fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
    console.log(`[2/gen]   ✓ ${persona.name}, ${persona.age}세`);

    await new Promise(r => setTimeout(r, 800));
  } catch (err) {
    console.error(`[2/gen]   ✗ ${p.persona_id}:`, err.message);
  }
}

console.log(`\n[2/gen] ✓ Wrote ${results.length} personas → ${OUT_PATH}`);

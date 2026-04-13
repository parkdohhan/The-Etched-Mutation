// Simulate TEM plays as each persona reading each scene.
// Uses Claude Sonnet 4.6 for cost efficiency at scale.
//
// Input:  data/{MEMORY_CODE}_personas.json + scenes fetched from Supabase
// Output: data/{MEMORY_CODE}_plays.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, '..', 'prompts', 'play_template-260409.md');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[3/sim] Missing ANTHROPIC_API_KEY');
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('[3/sim] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!process.env.TARGET_MEMORY_ID) {
  console.error('[3/sim] Missing TARGET_MEMORY_ID');
  process.exit(1);
}

const anthropic = new Anthropic();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const MEM_ID = process.env.TARGET_MEMORY_ID;

// Config
const VISITS_PER_PERSONA_MIN = 2;
const VISITS_PER_PERSONA_MAX = 4;
const SCENES_PER_VISIT_MIN = 4;
const SCENES_PER_VISIT_MAX = 7;

// Fetch memory code (for file naming)
console.log('[3/sim] Fetching memory...');
const { data: memory, error: memErr } = await supabase
  .from('memories')
  .select('code')
  .eq('id', MEM_ID)
  .single();
if (memErr || !memory) {
  console.error('[3/sim] Memory fetch failed:', memErr?.message);
  process.exit(1);
}
const MEMORY_CODE = memory.code;
const PERSONAS_PATH = path.join(__dirname, '..', 'data', `${MEMORY_CODE}_personas.json`);
const OUT_PATH = path.join(__dirname, '..', 'data', `${MEMORY_CODE}_plays.json`);
console.log(`[3/sim] Memory: ${MEMORY_CODE}`);

if (!fs.existsSync(PERSONAS_PATH)) {
  console.error(`[3/sim] 페르소나 파일 없음: ${PERSONAS_PATH}\n먼저 npm run generate-personas 를 실행하세요.`);
  process.exit(1);
}

const personas = JSON.parse(fs.readFileSync(PERSONAS_PATH, 'utf8'));
const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

// Fetch scenes
console.log('[3/sim] Fetching scenes...');
const { data: scenes, error } = await supabase
  .from('scenes')
  .select('id, scene_order, text, original_emotion')
  .eq('memory_id', MEM_ID)
  .order('scene_order');
if (error) { console.error('[3/sim] scenes fetch error:', error); process.exit(1); }
console.log(`[3/sim] ${scenes.length} scenes loaded`);

function formatEvents(arr) { return arr.map((e, i) => `${i + 1}. ${e}`).join('\n'); }
function formatHabits(arr) { return arr.map(h => `- ${h}`).join('\n'); }

function fill(tpl, persona, visit, scene) {
  return tpl
    .replace('{{name}}', persona.persona.name)
    .replace('{{age}}', persona.persona.age)
    .replace('{{gender}}', persona.persona.gender)
    .replace('{{background}}', persona.persona.background)
    .replace('{{formative_events}}', formatEvents(persona.persona.formative_events))
    .replace('{{emotional_habits}}', formatHabits(persona.persona.emotional_habits))
    .replace('{{reading_lens}}', persona.persona.reading_lens)
    .replace('{{contradiction}}', persona.persona.contradiction)
    .replace(/\{\{visit_number\}\}/g, visit)
    .replace('{{scene_order}}', scene.scene_order)
    .replace('{{scene_text}}', scene.text)
    .replace('{{original_emotion}}', JSON.stringify(scene.original_emotion));
}

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

// Deterministic RNG for reproducible simulation
let rng = 42;
function rand() { rng = (rng * 16807) % 2147483647; return rng / 2147483647; }
function randInt(lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Resume support
let existing = [];
if (fs.existsSync(OUT_PATH)) {
  try { existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); } catch (_) {}
}
const doneKeys = new Set(existing.map(p => `${p.persona_id}_${p.visit}_${p.scene_id}`));
const plays = existing.slice();

console.log(`[3/sim] Resuming with ${existing.length} existing plays`);

// Time spread: 90 days back, roughly ordered by visit index
const now = Date.now();
let globalPlayIdx = 0;

for (let pi = 0; pi < personas.length; pi++) {
  const persona = personas[pi];
  const visits = randInt(VISITS_PER_PERSONA_MIN, VISITS_PER_PERSONA_MAX);

  for (let visit = 1; visit <= visits; visit++) {
    const nScenes = randInt(SCENES_PER_VISIT_MIN, Math.min(SCENES_PER_VISIT_MAX, scenes.length));
    const sceneSubset = shuffle(scenes).slice(0, nScenes);

    for (const scene of sceneSubset) {
      const key = `${persona.persona_id}_${visit}_${scene.id}`;
      if (doneKeys.has(key)) continue;

      const prompt = fill(template, persona, visit, scene);
      try {
        const res = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }],
        });
        const out = extractJson(res.content[0].text);

        const daysAgo = 88 - globalPlayIdx * 0.25 + (rand() - 0.5) * 3;
        const createdAt = new Date(now - daysAgo * 86400000);

        plays.push({
          memory_id: MEM_ID,
          scene_id: scene.id,
          scene_order: scene.scene_order,
          persona_id: persona.persona_id,
          persona_name: persona.persona.name,
          strata_label: persona.strata_label,
          visit,
          user_emotion: out.user_emotion,
          user_reason: out.inner_reason,
          alignment: out.alignment,
          mismatch_type: out.mismatch_type,
          created_at: createdAt.toISOString(),
        });
        globalPlayIdx++;

        // Incremental save
        if (plays.length % 5 === 0) fs.writeFileSync(OUT_PATH, JSON.stringify(plays, null, 2));

        console.log(`[3/sim] ${persona.persona_id} v${visit} s${scene.scene_order} al=${out.alignment.toFixed(2)} mm=${out.mismatch_type || '-'}`);
        await new Promise(r => setTimeout(r, 400));
      } catch (err) {
        console.error(`[3/sim] ✗ ${key}:`, err.message);
      }
    }
  }
}

fs.writeFileSync(OUT_PATH, JSON.stringify(plays, null, 2));
console.log(`\n[3/sim] ✓ ${plays.length} plays written → ${OUT_PATH}`);

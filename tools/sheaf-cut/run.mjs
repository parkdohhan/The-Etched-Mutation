// sheaf-cut E1: cut-reversal experiment for the sheaf gluing model (Track B sibling).
// Each persona reads the SAME memory material under 5 cut conditions and reports
// a GLOBAL impression (global section proxy): emotion distribution + warmth + sentences.
//
// Conditions:
//   FULL  scenes 0..9            baseline
//   END5  scenes 0..5            endpoint before the return scene  (grandma case: cut at anger)
//   END8  scenes 0..8            endpoint at the return scene      (grandma case: include reconciliation)
//   CUT3  0..9 minus scene 3     excise the rupture scene (max emotional delta junction)
//   CUT4  0..9 minus scene 4     excise a plateau scene (smooth seam 3->5) — same amount removed as CUT3
//
// Reuses persona-sim assets: personas JSON, ANTHROPIC_API_KEY from ../persona-sim/.env,
// @anthropic-ai/sdk from ../persona-sim/node_modules (via createRequire). No new deps.
//
// Usage: node run.mjs            (resumable; incremental save every 3 rows)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIM_DIR = path.join(__dirname, '..', 'persona-sim');
const requireSim = createRequire(path.join(SIM_DIR, 'package.json'));
const Anthropic = requireSim('@anthropic-ai/sdk');

// --- env (manual parse; only need the API key) ---
const envPath = path.join(SIM_DIR, '.env');
if (!fs.existsSync(envPath)) { console.error('[cut] ../persona-sim/.env not found'); process.exit(1); }
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
if (!env.ANTHROPIC_API_KEY) { console.error('[cut] ANTHROPIC_API_KEY missing in .env'); process.exit(1); }

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const MODELS = ['claude-sonnet-4-6', 'claude-sonnet-5']; // fallback if first is retired
let modelIdx = 0;
const TEMPERATURE = 0.3;

// --- data ---
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'MM23L_scenes_snapshot-260722.json'), 'utf8'));
const personas = JSON.parse(fs.readFileSync(path.join(SIM_DIR, 'data', 'MM23L_personas.json'), 'utf8'));
const OUT_PATH = path.join(__dirname, 'data', 'E1_results.json');

const byOrder = new Map(snapshot.scenes.map(s => [s.scene_order, s]));
const pick = orders => orders.map(o => byOrder.get(o));

const CONDITIONS = {
  FULL: pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  END5: pick([0, 1, 2, 3, 4, 5]),
  END8: pick([0, 1, 2, 3, 4, 5, 6, 7, 8]),
  CUT3: pick([0, 1, 2, 4, 5, 6, 7, 8, 9]),
  CUT4: pick([0, 1, 2, 3, 5, 6, 7, 8, 9]),
};

// --- prompt ---
const fmtEvents = arr => arr.map((e, i) => `${i + 1}. ${e}`).join('\n');
const fmtHabits = arr => arr.map(h => `- ${h}`).join('\n');

function buildPrompt(p, scenes) {
  // Scenes renumbered contiguously so the reader cannot detect a gap from numbering.
  const body = scenes.map((s, i) => `[장면 ${i + 1}/${scenes.length}]\n${s.text}`).join('\n\n');
  return `You are roleplaying as the following person reading someone else's memory
from beginning to end, in order. Respond AS this person. Not about them,
not analyzing them.

=== PERSONA ===
이름: ${p.persona.name} (${p.persona.age}세, ${p.persona.gender})
배경: ${p.persona.background}

형성 사건:
${fmtEvents(p.persona.formative_events)}

감정 습관:
${fmtHabits(p.persona.emotional_habits)}

읽기 렌즈: ${p.persona.reading_lens}

자신의 패턴을 거스른 순간: ${p.persona.contradiction}

=== THE MEMORY (읽은 순서 그대로) ===
${body}

=== YOUR TASK ===
당신은 이 기억을 처음부터 끝까지 읽었다. 장면 하나하나가 아니라,
**기억 전체**가 당신 안에 어떤 것으로 남았는지 답하라.

1. **global_emotion** — 이 기억 전체가 남긴 감정. JSON weights, ONLY these
   keys: fear, sadness, anger, guilt, shame, isolation, numbness, longing,
   resentment, resignation, joy, hope, relief, gratitude, love, peace,
   confusion. Values 0-1, roughly sum to 1.0. Pick 3-6 emotions.

2. **warmth** — -1.00 ~ +1.00. 이 기억이 전체로서 당신에게 어떤 색으로
   남았는가. -1.00 = 어두운 기억으로 남았다, 0 = 중립/양가, +1.00 = 따뜻한
   기억으로 남았다.

3. **one_sentence** — 한국어 한 문장. "이 기억은 ___" 꼴로, 이 기억이
   전체로서 무엇에 관한 기억인지.

4. **ending_feel** — 마지막 장면이 닫힌 뒤 몸에 남는 잔감. 한국어 1문장.
   분석 말고 날것의 감각.

Output strict JSON only, no fences, no preamble:

{
  "global_emotion": { "...": 0.0 },
  "warmth": 0.00,
  "one_sentence": "...",
  "ending_feel": "..."
}`;
}

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in response');
  return JSON.parse(m[0]);
}

// --- resume ---
let results = [];
if (fs.existsSync(OUT_PATH)) { try { results = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); } catch (_) {} }
const done = new Set(results.map(r => `${r.persona_id}_${r.condition}`));
console.log(`[cut] Resuming with ${results.length} existing rows`);

async function callOnce(prompt) {
  for (;;) {
    try {
      const res = await anthropic.messages.create({
        model: MODELS[modelIdx],
        max_tokens: 500,
        temperature: TEMPERATURE,
        messages: [{ role: 'user', content: prompt }],
      });
      return extractJson(res.content[0].text);
    } catch (err) {
      if ((err.status === 404 || /model/i.test(err.message || '') && err.status === 400) && modelIdx < MODELS.length - 1) {
        console.warn(`[cut] model ${MODELS[modelIdx]} unavailable -> falling back to ${MODELS[modelIdx + 1]}`);
        modelIdx++;
        continue;
      }
      if (err.status === 429 || err.status === 529) {
        console.warn('[cut] rate limited, waiting 20s...');
        await new Promise(r => setTimeout(r, 20000));
        continue;
      }
      throw err;
    }
  }
}

for (const p of personas) {
  for (const [cond, scenes] of Object.entries(CONDITIONS)) {
    const key = `${p.persona_id}_${cond}`;
    if (done.has(key)) continue;
    try {
      const out = await callOnce(buildPrompt(p, scenes));
      results.push({
        persona_id: p.persona_id,
        persona_name: p.persona.name,
        condition: cond,
        n_scenes: scenes.length,
        model: MODELS[modelIdx],
        temperature: TEMPERATURE,
        global_emotion: out.global_emotion,
        warmth: out.warmth,
        one_sentence: out.one_sentence,
        ending_feel: out.ending_feel,
      });
      if (results.length % 3 === 0) fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
      console.log(`[cut] ${p.persona_id} ${cond} warmth=${Number(out.warmth).toFixed(2)} (${results.length}/75)`);
      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      console.error(`[cut] x ${key}:`, err.message);
    }
  }
}

fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
console.log(`\n[cut] done: ${results.length} rows -> ${OUT_PATH}`);

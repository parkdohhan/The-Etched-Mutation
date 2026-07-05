// Analyze persona-sim plays for the methods paper (§5 Results).
//
// Key design: alignment is computed OBJECTIVELY as cosine(user_emotion, original_emotion)
// — the LLM's self-reported alignment is kept only as a comparison signal
// (self-report circularity: the LLM sees the original emotion while scoring itself).
//
// Input:  data/{MEMORY_CODE}_plays.json + scenes from Supabase
// Output: ../../docs/paper/data/persona_sim_analysis-260705.json + console summary

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.TARGET_MEMORY_ID) {
  console.error('[5/analyze] Missing env');
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const MEM_ID = process.env.TARGET_MEMORY_ID;

const { data: memory } = await supabase.from('memories').select('code').eq('id', MEM_ID).single();
const MEMORY_CODE = memory.code;
const plays = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', `${MEMORY_CODE}_plays.json`), 'utf8'));
const scores = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sampled_scores.json'), 'utf8'));

const { data: scenes } = await supabase
  .from('scenes').select('id, scene_order, original_emotion').eq('memory_id', MEM_ID);
const origBySceneId = {};
for (const s of scenes) {
  origBySceneId[s.id] = typeof s.original_emotion === 'string'
    ? JSON.parse(s.original_emotion) : s.original_emotion;
}

// ── math ──────────────────────────────────────────────
function cosine(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    const x = a?.[k] || 0, y = b?.[k] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const std = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
function pearson(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i]-mx)*(ys[i]-my); dx += (xs[i]-mx)**2; dy += (ys[i]-my)**2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
const r3 = x => Math.round(x * 1000) / 1000;

// ── per-play objective alignment ──────────────────────
for (const p of plays) {
  p.objective = cosine(p.user_emotion, origBySceneId[p.scene_id]);
}

// ── V1: distribution characteristics ──────────────────
const obj = plays.map(p => p.objective);
const self = plays.map(p => p.alignment);
const mmRate = plays.filter(p => p.mismatch_type).length / plays.length;
const mmDist = {};
for (const p of plays) { const k = p.mismatch_type || 'null'; mmDist[k] = (mmDist[k] || 0) + 1; }

// self-report quantization: histogram of exact reported values (top 10)
const valCount = {};
for (const v of self) { const k = v.toFixed(2); valCount[k] = (valCount[k] || 0) + 1; }
const topVals = Object.entries(valCount).sort((a, b) => b[1] - a[1]).slice(0, 10)
  .map(([v, n]) => ({ value: v, n, pct: r3(n / self.length) }));

// ── per-persona aggregates ─────────────────────────────
const byPersona = {};
for (const p of plays) (byPersona[p.persona_id] ??= []).push(p);
const personas = Object.keys(byPersona).sort();
const personaStats = personas.map(pid => {
  const ps = byPersona[pid];
  const o = ps.map(p => p.objective), s = ps.map(p => p.alignment);
  const sc = scores.find(x => x.persona_id === pid);
  const mm = t => ps.filter(p => p.mismatch_type === t).length / ps.length;
  return {
    persona_id: pid, strata: sc.strata_label, n: ps.length,
    bigfive: sc.scores,
    obj_mean: r3(mean(o)), obj_std: r3(std(o)),
    self_mean: r3(mean(s)),
    gap_self_minus_obj: r3(mean(s) - mean(o)),
    mismatch_rate: r3(ps.filter(p => p.mismatch_type).length / ps.length),
    rate_target_displacement: r3(mm('target_displacement')),
    rate_attribution: r3(mm('attribution_mismatch')),
    rate_emotion: r3(mm('emotion_mismatch')),
    rate_void: r3(mm('void_mismatch')),
  };
});

// ── H1–H4: Big Five ↔ trajectory metrics (Pearson, n=15) ──
const traits = ['N', 'E', 'O', 'A', 'C'];
const metrics = {
  obj_mean: personaStats.map(p => p.obj_mean),
  obj_std: personaStats.map(p => p.obj_std),
  mismatch_rate: personaStats.map(p => p.mismatch_rate),
  rate_target_displacement: personaStats.map(p => p.rate_target_displacement),
  rate_attribution: personaStats.map(p => p.rate_attribution),
  gap_self_minus_obj: personaStats.map(p => p.gap_self_minus_obj),
};
const corr = {};
for (const t of traits) {
  const tv = personaStats.map(p => p.bigfive[t]);
  corr[t] = {};
  for (const [mk, mv] of Object.entries(metrics)) corr[t][mk] = r3(pearson(tv, mv));
}

// ── output ─────────────────────────────────────────────
const out = {
  generated: '2026-07-05',
  memory: MEMORY_CODE,
  n_plays: plays.length,
  n_personas: personas.length,
  note: 'objective = cosine(user_emotion, original_emotion); self = LLM self-reported alignment (circular, comparison only)',
  v1_distribution: {
    objective: { mean: r3(mean(obj)), std: r3(std(obj)), min: r3(Math.min(...obj)), max: r3(Math.max(...obj)) },
    self_report: { mean: r3(mean(self)), std: r3(std(self)), min: r3(Math.min(...self)), max: r3(Math.max(...self)) },
    mismatch_rate: r3(mmRate),
    mismatch_distribution: mmDist,
    self_report_top_values: topVals,
  },
  persona_stats: personaStats,
  bigfive_correlations: corr,
  ranking_by_obj: personaStats.slice().sort((a, b) => b.obj_mean - a.obj_mean)
    .map(p => ({ persona_id: p.persona_id, strata: p.strata, obj_mean: p.obj_mean })),
};

const OUT = path.join(__dirname, '..', '..', '..', 'docs', 'paper', 'data', 'persona_sim_analysis-260705.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.log(`\n[5/analyze] ✓ written → ${OUT}`);

// sheaf-cut E2 analysis (PIT-001 deconfound).
//
// E2-H1: L1(CUT3, FULL) > L1(CUT6, FULL) paired per persona
//        — rough-seam excision of an UNIMPORTANT scene (rabbit) shifts the global
//          section more than smooth-seam excision of the THEMATIC KEYSTONE (re-entry).
// E2-H1w: same with |Δwarmth| lens.
//
// PIT-001 original_emotion is not normalized -> normalize to sum 1 before seam math.
//
// Usage: node analyze_e2.mjs  -> data/E2_report.json + console summary

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'E2_results.json'), 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'PIT001_scenes_snapshot-260722.json'), 'utf8'));

const AXES = ['fear','sadness','anger','guilt','shame','isolation','numbness','longing','resentment','resignation','joy','hope','relief','gratitude','love','peace','confusion'];
const vec = d => AXES.map(a => Number(d?.[a]) || 0);
const norm = v => { const s = v.reduce((a, b) => a + b, 0) || 1; return v.map(x => x / s); };
const l1 = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);

// --- author-side seam structure (normalized) ---
const sc = snapshot.scenes;
const nv = sc.map(s => norm(vec(s.original_emotion)));
const consecutive = [];
for (let i = 1; i < sc.length; i++)
  consecutive.push({ seam: `${i - 1}->${i}`, l1: +l1(nv[i - 1], nv[i]).toFixed(3) });
const excisionSeams = [];
for (let i = 1; i < sc.length - 1; i++)
  excisionSeams.push({ removed_scene: i, bridged_seam: `${i - 1}->${i + 1}`, l1: +l1(nv[i - 1], nv[i + 1]).toFixed(3) });

// --- results indexing ---
const byKey = new Map(results.map(r => [`${r.persona_id}_${r.condition}`, r]));
const personaIds = [...new Set(results.map(r => r.persona_id))].sort();
const get = (pid, c) => byKey.get(`${pid}_${c}`);

function signTest(diffs) {
  const pos = diffs.filter(d => d > 0).length;
  const neg = diffs.filter(d => d < 0).length;
  const n = pos + neg;
  if (n === 0) return { pos, neg, ties: diffs.length, n, p: 1 };
  const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - i + 1) / i; return r; };
  let p = 0;
  for (let k = pos; k <= n; k++) p += choose(n, k) * Math.pow(0.5, n);
  return { pos, neg, ties: diffs.length - n, n, p: +p.toFixed(5) };
}
const stats = arr => {
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  return { mean: +m.toFixed(3), sd: +sd.toFixed(3), n: arr.length };
};

const conds = ['FULL', 'CUT3', 'CUT6'];
const warmthByCond = {};
for (const c of conds) warmthByCond[c] = stats(results.filter(r => r.condition === c).map(r => Number(r.warmth)));

const pairs = personaIds
  .filter(pid => conds.every(c => get(pid, c)))
  .map(pid => {
    const f = vec(get(pid, 'FULL').global_emotion);
    const d3 = +l1(vec(get(pid, 'CUT3').global_emotion), f).toFixed(3);
    const d6 = +l1(vec(get(pid, 'CUT6').global_emotion), f).toFixed(3);
    const fw = Number(get(pid, 'FULL').warmth);
    const w3 = Math.abs(Number(get(pid, 'CUT3').warmth) - fw);
    const w6 = Math.abs(Number(get(pid, 'CUT6').warmth) - fw);
    return { pid, d_cut3: d3, d_cut6: d6, diff: +(d3 - d6).toFixed(3), wdiff: +(w3 - w6).toFixed(3) };
  });

const H1 = { test: signTest(pairs.map(p => p.diff)), d_cut3: stats(pairs.map(p => p.d_cut3)), d_cut6: stats(pairs.map(p => p.d_cut6)), pairs };
const H1w = { test: signTest(pairs.map(p => p.wdiff)), diffStats: stats(pairs.map(p => p.wdiff)) };

const report = {
  generated_for: 'sheaf-cut E2 (deconfound), memory PIT-001 구덩이',
  design: 'CUT3 = rabbit (unimportant, roughest seam) vs CUT6 = pit re-entry (thematic keystone, smoothest seam)',
  n_rows: results.length,
  models_used: [...new Set(results.map(r => r.model))],
  consecutive_seam_deltas_L1_normalized: consecutive,
  excision_bridged_seams_L1_normalized: excisionSeams,
  warmth_by_condition: warmthByCond,
  E2H1_L1shift_CUT3_gt_CUT6: H1,
  E2H1w_warmthShift_CUT3_gt_CUT6: H1w,
  sentences: Object.fromEntries(conds.map(c => [c, results.filter(r => r.condition === c).map(r => `${r.persona_id}: ${r.one_sentence}`)])),
};

const OUT = path.join(__dirname, 'data', 'E2_report.json');
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log('=== sheaf-cut E2 (PIT-001) ===');
console.log('rows:', results.length, '| models:', report.models_used.join(', '));
console.log('\nconsecutive seams (normalized L1):', consecutive.map(d => `${d.seam}:${d.l1}`).join('  '));
console.log('excision bridged seams:', excisionSeams.map(d => `rm${d.removed_scene}:${d.l1}`).join('  '));
console.log('\nwarmth:', conds.map(c => `${c}=${warmthByCond[c].mean}±${warmthByCond[c].sd}`).join('  '));
console.log(`\nE2-H1 (L1: CUT3>CUT6): +${H1.test.pos}/-${H1.test.neg} ties=${H1.test.ties} p=${H1.test.p} dCUT3=${H1.d_cut3.mean} dCUT6=${H1.d_cut6.mean}`);
console.log(`E2-H1w (|warmth|: CUT3>CUT6): +${H1w.test.pos}/-${H1w.test.neg} ties=${H1w.test.ties} p=${H1w.test.p} meanDiff=${H1w.diffStats.mean}`);
console.log('\nreport ->', OUT);

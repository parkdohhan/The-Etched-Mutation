// sheaf-cut E1 analysis: sign tests on the cut-reversal results.
//
// H1 (endpoint / grandma case):   warmth(END8) > warmth(END5), paired per persona.
// H2 (junction vs plateau cut):   L1(CUT3, FULL) > L1(CUT4, FULL), paired per persona.
//     — the sheaf-specific claim: removing the rupture scene shifts the global
//       section more than removing a plateau scene, with equal content removed.
// S1 (secondary): warmth(END8) > warmth(FULL) — ending one scene earlier than the
//     door-slam flips the coloring back toward warm.
//
// Usage: node analyze.mjs   ->  data/E1_report.json + console summary

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'E1_results.json'), 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'MM23L_scenes_snapshot-260722.json'), 'utf8'));

const AXES = ['fear','sadness','anger','guilt','shame','isolation','numbness','longing','resentment','resignation','joy','hope','relief','gratitude','love','peace','confusion'];

const vec = d => AXES.map(a => Number(d?.[a]) || 0);
const l1 = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);

// --- author-side consecutive deltas (justifies cut-point selection) ---
const sc = snapshot.scenes;
const authorDeltas = [];
for (let i = 1; i < sc.length; i++) {
  authorDeltas.push({
    seam: `${sc[i - 1].scene_order}->${sc[i].scene_order}`,
    l1: +l1(vec(sc[i - 1].original_emotion), vec(sc[i].original_emotion)).toFixed(3),
  });
}
const bridged = (a, b) => +l1(vec(byOrder(a).original_emotion), vec(byOrder(b).original_emotion)).toFixed(3);
function byOrder(o) { return sc.find(s => s.scene_order === o); }

// --- index results ---
const byKey = new Map(results.map(r => [`${r.persona_id}_${r.condition}`, r]));
const personaIds = [...new Set(results.map(r => r.persona_id))].sort();
const get = (pid, cond) => byKey.get(`${pid}_${cond}`);

// --- exact one-sided binomial sign test (ties excluded) ---
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

// --- condition-level warmth ---
const conds = ['FULL', 'END5', 'END8', 'CUT3', 'CUT4'];
const warmthByCond = {};
for (const c of conds) warmthByCond[c] = stats(results.filter(r => r.condition === c).map(r => Number(r.warmth)));

// --- H1: END8 - END5 warmth, paired ---
const h1Pairs = personaIds
  .filter(pid => get(pid, 'END8') && get(pid, 'END5'))
  .map(pid => ({ pid, diff: +(Number(get(pid, 'END8').warmth) - Number(get(pid, 'END5').warmth)).toFixed(3) }));
const H1 = { pairs: h1Pairs, test: signTest(h1Pairs.map(p => p.diff)), diffStats: stats(h1Pairs.map(p => p.diff)) };

// --- H2: L1(CUT3,FULL) - L1(CUT4,FULL), paired ---
const h2Pairs = personaIds
  .filter(pid => get(pid, 'FULL') && get(pid, 'CUT3') && get(pid, 'CUT4'))
  .map(pid => {
    const f = vec(get(pid, 'FULL').global_emotion);
    const d3 = +l1(vec(get(pid, 'CUT3').global_emotion), f).toFixed(3);
    const d4 = +l1(vec(get(pid, 'CUT4').global_emotion), f).toFixed(3);
    return { pid, d_cut3: d3, d_cut4: d4, diff: +(d3 - d4).toFixed(3) };
  });
const H2 = {
  pairs: h2Pairs,
  test: signTest(h2Pairs.map(p => p.diff)),
  d_cut3: stats(h2Pairs.map(p => p.d_cut3)),
  d_cut4: stats(h2Pairs.map(p => p.d_cut4)),
};

// --- H2w: warmth shift magnitude |warmth(CUT)-warmth(FULL)| as second lens ---
const h2wPairs = personaIds
  .filter(pid => get(pid, 'FULL') && get(pid, 'CUT3') && get(pid, 'CUT4'))
  .map(pid => {
    const f = Number(get(pid, 'FULL').warmth);
    const a = Math.abs(Number(get(pid, 'CUT3').warmth) - f);
    const b = Math.abs(Number(get(pid, 'CUT4').warmth) - f);
    return { pid, diff: +(a - b).toFixed(3) };
  });
const H2w = { test: signTest(h2wPairs.map(p => p.diff)), diffStats: stats(h2wPairs.map(p => p.diff)) };

// --- S1: END8 - FULL warmth ---
const s1Pairs = personaIds
  .filter(pid => get(pid, 'END8') && get(pid, 'FULL'))
  .map(pid => ({ pid, diff: +(Number(get(pid, 'END8').warmth) - Number(get(pid, 'FULL').warmth)).toFixed(3) }));
const S1 = { test: signTest(s1Pairs.map(p => p.diff)), diffStats: stats(s1Pairs.map(p => p.diff)) };

const report = {
  generated_for: 'sheaf-cut E1 (cut-reversal), memory MM23L 당신에게',
  n_rows: results.length,
  models_used: [...new Set(results.map(r => r.model))],
  author_consecutive_deltas_L1: authorDeltas,
  bridged_seams: { 'CUT3 creates 2->4': bridged(2, 4), 'CUT4 creates 3->5': bridged(3, 5) },
  warmth_by_condition: warmthByCond,
  H1_endpoint_END8_gt_END5: H1,
  H2_L1shift_CUT3_gt_CUT4: H2,
  H2w_warmthShift_CUT3_gt_CUT4: H2w,
  S1_END8_gt_FULL: S1,
  sentences: Object.fromEntries(conds.map(c => [c, results.filter(r => r.condition === c).map(r => `${r.persona_id}: ${r.one_sentence}`)])),
};

const OUT = path.join(__dirname, 'data', 'E1_report.json');
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log('=== sheaf-cut E1 ===');
console.log('rows:', results.length, '| models:', report.models_used.join(', '));
console.log('\nauthor seam deltas (L1):', authorDeltas.map(d => `${d.seam}:${d.l1}`).join('  '));
console.log('bridged seams:', JSON.stringify(report.bridged_seams));
console.log('\nwarmth by condition:');
for (const c of conds) console.log(`  ${c}: mean=${warmthByCond[c].mean} sd=${warmthByCond[c].sd} n=${warmthByCond[c].n}`);
console.log(`\nH1 (END8>END5): +${H1.test.pos}/-${H1.test.neg} ties=${H1.test.ties} p=${H1.test.p} meanDiff=${H1.diffStats.mean}`);
console.log(`H2 (L1: CUT3>CUT4): +${H2.test.pos}/-${H2.test.neg} ties=${H2.test.ties} p=${H2.test.p} dCUT3=${H2.d_cut3.mean} dCUT4=${H2.d_cut4.mean}`);
console.log(`H2w (|warmth shift|: CUT3>CUT4): +${H2w.test.pos}/-${H2w.test.neg} ties=${H2w.test.ties} p=${H2w.test.p} meanDiff=${H2w.diffStats.mean}`);
console.log(`S1 (END8>FULL): +${S1.test.pos}/-${S1.test.neg} ties=${S1.test.ties} p=${S1.test.p} meanDiff=${S1.diffStats.mean}`);
console.log('\nreport ->', OUT);

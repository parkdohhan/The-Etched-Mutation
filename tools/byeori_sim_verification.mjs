// Byeori Engine V4 calibration simulation
// Imports the REAL engine (js/core/ByeoriEngine.js) — no formula copies.
// Deterministic: seeded PRNG (mulberry32), seed = 20260705.

// Run:  node tools/byeori_sim_calibration.mjs
// Writes: docs/paper/byeori_sim_results-260705.json

import fs from 'node:fs';

const { ByeoriEngine } = await import(new URL('../js/core/ByeoriEngine.js', import.meta.url).href);
const { DEFAULT_EMOTION_ANCHORS, calculateVADSimilarity, projectEmotionToVAD } =
  await import(new URL('../js/shared/math.js', import.meta.url).href);

// ---------- seeded RNG ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20260705;
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randInt = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)); // inclusive

const ANCHORS = DEFAULT_EMOTION_ANCHORS; // 17 anchors
const NEG = ['fear','sadness','anger','guilt','shame','isolation','numbness','moral_pain','helplessness','despair'];
const POS = ['joy','hope','relief','gratitude','love','peace','comfort'];
// crude polarity flip map for the contradiction archetype
const FLIP = {
  fear:'relief', sadness:'joy', anger:'peace', guilt:'comfort', shame:'love',
  isolation:'love', numbness:'joy', moral_pain:'gratitude', helplessness:'hope', despair:'hope',
  joy:'sadness', hope:'despair', relief:'fear', gratitude:'moral_pain', love:'isolation',
  peace:'anger', comfort:'guilt'
};

// ---------- vector helpers ----------
function normalize(vec) {
  const s = Object.values(vec).reduce((a, b) => a + b, 0);
  if (s <= 0) return vec;
  const out = {};
  for (const k in vec) out[k] = vec[k] / s;
  return out;
}
function sparseRandomVector(nActive) {
  const keys = [...ANCHORS].sort(() => rnd() - 0.5).slice(0, nActive);
  const vec = {};
  for (const k of keys) vec[k] = 0.2 + rnd() * 0.8;
  return normalize(vec);
}
function perturb(vec, sigma) {
  const out = {};
  for (const k of ANCHORS) {
    const v = (vec[k] || 0) + (rnd() * 2 - 1) * sigma;
    if (v > 0.01) out[k] = v;
  }
  if (Object.keys(out).length === 0) out[pick(ANCHORS)] = 1;
  return normalize(out);
}
function blend(a, b, wa) {
  const out = {};
  for (const k of ANCHORS) {
    const v = wa * (a[k] || 0) + (1 - wa) * (b[k] || 0);
    if (v > 0.005) out[k] = v;
  }
  return normalize(out);
}
function flip(vec) {
  const out = {};
  for (const k in vec) {
    const f = FLIP[k] || k;
    out[f] = (out[f] || 0) + vec[k];
  }
  return normalize(out);
}

// original (author) trajectory: sparse random walk over the 17-anchor simplex.
// TEM key scenes are emotionally distinct beats, so turns are frequent and strong.
function makeOriginalTrajectory(nScenes) {
  const traj = [sparseRandomVector(randInt(2, 4))];
  for (let i = 1; i < nScenes; i++) {
    let next = perturb(traj[i - 1], 0.15);
    if (rnd() < 0.4) next = blend(next, sparseRandomVector(2), 0.5); // emotional turn
    traj.push(next);
  }
  return traj;
}

function dominantOf(vec) {
  return Object.entries(vec).sort((a, b) => b[1] - a[1])[0][0];
}

// ---------- archetypes: how the simulated player answers each scene ----------
const ARCHETYPES = {
  // follows the author's emotions closely
  resonant: (orig) => orig.map(o => perturb(o, 0.06)),
  // half-overlap: personal bias mixed in
  partial: (orig) => {
    const bias = sparseRandomVector(3);
    return orig.map(o => perturb(blend(o, bias, 0.55), 0.08));
  },
  // similar per-scene emotion, diverging trajectory (displacement probe):
  // shares the author's dominant anchor each scene, but the REST of the mass
  // follows an independent fast-moving walk — per-scene cosine stays decent,
  // delta directions decorrelate.
  divergent: (orig) => {
    let walk = sparseRandomVector(3);
    return orig.map((o) => {
      walk = blend(perturb(walk, 0.2), sparseRandomVector(2), 0.5); // fast independent walk
      const domVec = { [dominantOf(o)]: 1 };
      return blend(domVec, walk, 0.6);
    });
  },
  // moves against the author's emotions
  contradiction: (orig) => orig.map(o => perturb(flip(o), 0.08)),
  // answers at random
  random: (orig) => orig.map(() => sparseRandomVector(randInt(2, 4))),
  // avoids: emotionally distant AND flags VOID on ~50% of scenes
  avoidant: (orig) => {
    const bias = sparseRandomVector(3);
    return orig.map(o => {
      const v = perturb(blend(o, bias, 0.25), 0.1);
      return { vec: v, isVoid: rnd() < 0.5 };
    });
  },
  // stuck on one emotion regardless of the scenes
  fixated: (orig) => {
    const stuck = sparseRandomVector(2);
    return orig.map(() => perturb(stuck, 0.02));
  }
};

// ---------- run one playthrough through the real engine, step by step ----------
function runPlaythrough(archetype) {
  const nScenes = randInt(3, 8);
  const orig = makeOriginalTrajectory(nScenes);
  const answersRaw = ARCHETYPES[archetype](orig);
  const engine = new ByeoriEngine();

  let sceneScores = [];
  let userTrajectory = [];
  let originalTrajectory = [];
  let emotionHistory = [];
  let previousBucket = null;
  let last = null;
  const patternsSeen = [];
  const vadSims = []; // V2 affective-channel baseline (VAD-distance similarity)

  for (let i = 0; i < nScenes; i++) {
    const raw = answersRaw[i];
    const userVec = raw.vec || raw;
    const isVoid = !!raw.isVoid;

    const input = {
      userVector: { base: userVec, reason_analysis: { is_void: isVoid } },
      originalVector: { base: orig[i], reason_analysis: { is_void: false } },
      userTrajectory: [...userTrajectory],
      originalTrajectory: [...originalTrajectory],
      sceneScores: [...sceneScores]
    };
    const res = engine.calculateStep(input, { previousBucket, emotionHistory: [...emotionHistory] });

    sceneScores.push(res.current_scene_score);
    userTrajectory.push(userVec);
    originalTrajectory.push(orig[i]);
    emotionHistory.push(userVec);
    previousBucket = res.alignment_bucket;
    patternsSeen.push(res.transition_pattern);
    vadSims.push(calculateVADSimilarity(projectEmotionToVAD(userVec), projectEmotionToVAD(orig[i])));
    last = res;
  }

  return {
    archetype,
    nScenes,
    alignment: last.alignment_score,
    bucket: last.alignment_bucket,
    finalPattern: last.transitionPattern || last.transition_pattern,
    patternsSeen,
    level: last.debug.level,
    shape: last.debug.shape,
    // baselines scored on the SAME playthrough:
    // V1 = mean per-scene 17-anchor cosine (== level, no shape, no void)
    v1: last.debug.level,
    // V2 affective channel = mean per-scene VAD-distance similarity (k=3).
    // V2's semantic channel needs text; synthetic playthroughs have none.
    v2aff: vadSims.reduce((a, b) => a + b, 0) / vadSims.length
  };
}

// ---------- simulate ----------
const RUNS_PER_ARCHETYPE = 1500;
const results = [];
for (const arch of Object.keys(ARCHETYPES)) {
  for (let r = 0; r < RUNS_PER_ARCHETYPE; r++) results.push(runPlaythrough(arch));
}

// ---------- aggregate ----------
function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p / 100 * (sorted.length - 1))));
  return sorted[idx];
}
function summarize(rows) {
  const a = rows.map(r => r.alignment).sort((x, y) => x - y);
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  const meanLevel = rows.reduce((s, r) => s + r.level, 0) / rows.length;
  const meanShape = rows.reduce((s, r) => s + r.shape, 0) / rows.length;
  const buckets = {};
  const patterns = {};
  for (const r of rows) {
    buckets[r.bucket] = (buckets[r.bucket] || 0) + 1;
    patterns[r.finalPattern] = (patterns[r.finalPattern] || 0) + 1;
  }
  const pct = (o) => Object.fromEntries(
    Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, +(100 * v / rows.length).toFixed(1)])
  );
  return {
    n: rows.length,
    mean: +mean.toFixed(3),
    meanLevel: +meanLevel.toFixed(3),
    meanShape: +meanShape.toFixed(3),
    p5: +percentile(a, 5).toFixed(3), p25: +percentile(a, 25).toFixed(3),
    median: +percentile(a, 50).toFixed(3),
    p75: +percentile(a, 75).toFixed(3), p95: +percentile(a, 95).toFixed(3),
    buckets: pct(buckets),
    finalPatterns: pct(patterns)
  };
}

const overall = summarize(results);
const byArch = {};
for (const arch of Object.keys(ARCHETYPES)) {
  byArch[arch] = summarize(results.filter(r => r.archetype === arch));
}

// pattern hit-rates: did the intended archetype trigger its matching pattern at any step?
const hitRate = (arch, pattern) => {
  const rows = results.filter(r => r.archetype === arch);
  const hits = rows.filter(r => r.patternsSeen.includes(pattern)).length;
  return +(100 * hits / rows.length).toFixed(1);
};
const detection = {
  'fixated → fixation': hitRate('fixated', 'fixation'),
  'divergent → displacement': hitRate('divergent', 'displacement'),
  'avoidant → avoidance': hitRate('avoidant', 'avoidance'),
  'contradiction → contradiction': hitRate('contradiction', 'contradiction'),
  'resonant → echo_follow': hitRate('resonant', 'echo_follow')
};

// pattern firing-rate matrix (any-step): % of runs per archetype in which each
// pattern fired at ANY step. Patterns are not mutually exclusive across steps,
// so rows exceed 100% — this is NOT a confusion matrix in the strict sense.
// Designed-for cell ~ recall; other cells in the column ~ false-positive rate.
const PATTERNS = ['echo_follow', 'bridge', 'contradiction', 'displacement', 'avoidance', 'fixation'];
const patternFiringRates = {};
for (const arch of Object.keys(ARCHETYPES)) {
  patternFiringRates[arch] = {};
  for (const p of PATTERNS) patternFiringRates[arch][p] = hitRate(arch, p);
}

// threshold-free separability: pairwise AUC = P(score_A > score_B) + 0.5·P(=),
// computed for each scorer over identical playthroughs (rank / Mann-Whitney).
function auc(posVals, negVals) {
  const all = posVals.map(v => [v, 1]).concat(negVals.map(v => [v, 0]))
    .sort((a, b) => a[0] - b[0]);
  // average ranks with ties
  let rankSumPos = 0;
  let i = 0;
  while (i < all.length) {
    let j = i;
    while (j < all.length && all[j][0] === all[i][0]) j++;
    const avgRank = (i + 1 + j) / 2; // ranks are 1-based: (i+1 + j) / 2
    for (let k = i; k < j; k++) if (all[k][1] === 1) rankSumPos += avgRank;
    i = j;
  }
  const nPos = posVals.length, nNeg = negVals.length;
  return (rankSumPos - nPos * (nPos + 1) / 2) / (nPos * nNeg);
}
const AUC_PAIRS = [
  ['resonant', 'random'],
  ['resonant', 'divergent'],
  ['partial', 'random'],
  ['divergent', 'partial'],
  ['contradiction', 'random']
];
const aucTable = {};
for (const [scorerName, key] of [['V1_scene_cosine_mean', 'v1'], ['V2_affective_VAD', 'v2aff'], ['V4_alignment', 'alignment']]) {
  aucTable[scorerName] = {};
  for (const [a, b] of AUC_PAIRS) {
    const va = results.filter(r => r.archetype === a).map(r => r[key]);
    const vb = results.filter(r => r.archetype === b).map(r => r[key]);
    aucTable[scorerName][`${a} vs ${b}`] = +auc(va, vb).toFixed(3);
  }
}

// baseline scorer comparison on identical playthroughs.
// HIGH% = share of runs whose final score ≥ 0.50 under that scorer.
function baselineSummary(key) {
  const out = {};
  for (const arch of Object.keys(ARCHETYPES)) {
    const rows = results.filter(r => r.archetype === arch);
    const vals = rows.map(r => r[key]).sort((x, y) => x - y);
    out[arch] = {
      mean: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(3),
      median: +percentile(vals, 50).toFixed(3),
      highPct: +(100 * vals.filter(v => v >= 0.50).length / vals.length).toFixed(1)
    };
  }
  return out;
}
const baselines = {
  'V1_scene_cosine_mean': baselineSummary('v1'),
  'V2_affective_VAD': baselineSummary('v2aff'),
  'V4_alignment': baselineSummary('alignment')
};

const report = {
  seed: SEED,
  engine: 'js/core/ByeoriEngine.js (V4, imported directly)',
  runs: results.length,
  runsPerArchetype: RUNS_PER_ARCHETYPE,
  scenesPerRun: '3–8 (uniform)',
  overall,
  byArchetype: byArch,
  patternDetection: detection,
  patternFiringRates,
  baselines,
  auc: aucTable
};

fs.mkdirSync(new URL('../docs/paper/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../docs/paper/byeori_sim_results-260705.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

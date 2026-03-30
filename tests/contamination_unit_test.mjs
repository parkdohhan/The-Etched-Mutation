/**
 * ContaminationTracker + contaminationPresenter — unit tests
 *
 * 실행: node tests/contamination_unit_test.mjs
 *
 * 의존성: Node v18+ (ES module native), 외부 패키지 없음
 * 테스트 대상:
 *   - updateContamination (EMA, stage transition)
 *   - getPresentationState (intensity band, emotion label)
 *   - applyStageText (text transformation, seeded PRNG)
 */

import {
  createEmptyState,
  updateContamination,
  getPresentationState,
  getDominantEmotionLabel,
  CONTAMINATION,
} from '../js/core/ContaminationTracker.js';

import {
  applyStageText,
  getContaminatedSceneText,
} from '../js/app/contaminationPresenter.js';

// ─── Minimal test harness ──────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    failures.push(label);
  }
}

function near(a, b, eps = 0.001) {
  return Math.abs(a - b) < eps;
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ─── Helpers ──────────────────────────────────────────────────────

function simulateN(n, engineOutputFn) {
  let state = createEmptyState();
  for (let i = 0; i < n; i++) {
    state = updateContamination(state, engineOutputFn(i));
  }
  return state;
}

const WORST_DRIFT = {
  alignment: 0,
  level: 0,
  shape: 0,
  shape_active: true,
  transition_pattern: 'bridge',
  mismatch_type: 'emotion_mismatch',
  fixation_level: 0,
  user_valence: -0.5,
  user_arousal: 0.5,
  user_dominance: 0,
};

const MAX_FIXATION = {
  alignment: 0.95,
  level: 0.97,
  shape: 0.97,
  shape_active: true,
  transition_pattern: 'fixation',
  mismatch_type: 'none',
  fixation_level: 1.0,
  user_valence: 0,
  user_arousal: 0,
  user_dominance: 0,
};

// ─── 1. createEmptyState ──────────────────────────────────────────

section('1. createEmptyState');

const empty = createEmptyState();
assert('stage is stable',    empty.cont_stage === 'stable');
assert('cont_drift = 0',     empty.cont_drift === 0);
assert('cont_fixation = 0',  empty.cont_fixation === 0);
assert('cont_depth = 0',     empty.cont_depth === 0);
assert('drift_dir_v = 0',    empty.drift_dir_v === 0);

// ─── 2. updateContamination — single play worst-case ──────────────

section('2. updateContamination — single play worst-case drift');

const worstDriftState = updateContamination(createEmptyState(), WORST_DRIFT);

// drift signal = 0.45*(1-0) + 0.35*(1-0) + 0.20*1.0 = 0.45+0.35+0.20 = 1.0
// EMA: 0.10*1.0 + 0.90*0 = 0.10
assert('depth increments',   worstDriftState.cont_depth === 1);
assert('cont_drift after 1 worst play = 0.10', near(worstDriftState.cont_drift, 0.10));
assert('cont_fixation stays near 0 (fixation_level=0)', worstDriftState.cont_fixation < 0.01);
assert('stage still stable after 1 play (drift 0.10 < 0.35)', worstDriftState.cont_stage === 'stable');

// drift_dir_v: signal=1.0, dir_v = 0.10 * (-0.5*1.0) + 0 = -0.05
assert('drift_dir_v negative (anger direction)', worstDriftState.drift_dir_v < 0);

// ─── 3. EMA convergence — how many plays to reach biased_inclination ──

section('3. EMA convergence — plays needed to reach biased_inclination');

// Drift threshold: 0.35
// EMA: x_n = 0.10*1.0 + 0.90*x_{n-1}
// Analytical: x_n = 1 - 0.9^n  (starting from 0, signal always 1.0)
// Solve: 1 - 0.9^n >= 0.35 → 0.9^n <= 0.65 → n >= log(0.65)/log(0.9) ≈ 4.16 → n=5

let driftState = createEmptyState();
let playsForBiased = 0;
for (let i = 0; i < 50; i++) {
  driftState = updateContamination(driftState, WORST_DRIFT);
  playsForBiased = i + 1;
  if (driftState.cont_stage === 'biased_inclination') break;
}
assert(`biased_inclination reached in ≤8 worst-case plays (got ${playsForBiased})`, playsForBiased <= 8);
console.log(`    drift after ${playsForBiased} plays: ${driftState.cont_drift.toFixed(4)}`);

// ─── 4. EMA convergence — hypercompletion ─────────────────────────

section('4. EMA convergence — plays needed to reach hypercompletion');

// fixation signal = 0.55*1.0 + 0.25*normalizeAlignmentBonus(0.95) + 0.20*1.0
// normalizeAlignmentBonus(0.95) = min((0.95-0.55)/0.45, 1) = min(0.889, 1) = 0.889
// = 0.55 + 0.25*0.889 + 0.20 = 0.55 + 0.222 + 0.20 = 0.972
// EMA toward 0.972 with α=0.10
// 1 - (1-0.10)^n * (1-0.972) ... solving 0.10*0.972/(1-0.90) threshold...
// More precisely: x_n = 0.972*(1-0.9^n)
// solve: 0.972*(1-0.9^n) >= 0.65 → 1-0.9^n >= 0.669 → 0.9^n <= 0.331 → n >= log(0.331)/log(0.9) ≈ 10.4

let fixState = createEmptyState();
let playsForHyper = 0;
for (let i = 0; i < 50; i++) {
  fixState = updateContamination(fixState, MAX_FIXATION);
  playsForHyper = i + 1;
  if (fixState.cont_stage === 'hypercompletion') break;
}
assert(`hypercompletion reached in ≤15 plays (got ${playsForHyper})`, playsForHyper <= 15);
console.log(`    fixation after ${playsForHyper} plays: ${fixState.cont_fixation.toFixed(4)}`);

// ─── 5. Stage transition: biased → hypercompletion ────────────────

section('5. Stage transition: biased_inclination → hypercompletion');

// Start with biased state, then switch to max-fixation plays
let transState = simulateN(5, () => WORST_DRIFT);
assert('starts as biased_inclination', transState.cont_stage === 'biased_inclination');

for (let i = 0; i < 20; i++) {
  transState = updateContamination(transState, MAX_FIXATION);
  if (transState.cont_stage === 'hypercompletion') break;
}
assert('transitions to hypercompletion after sustained fixation plays', transState.cont_stage === 'hypercompletion');

// ─── 6. getPresentationState — bands ──────────────────────────────

section('6. getPresentationState — intensity bands');

const stableState = { ...createEmptyState(), cont_stage: 'stable', cont_drift: 0 };
const presStable = getPresentationState(stableState);
assert('stable → intensity=0',     presStable.intensity === 0);
assert('stable → band=weak',       presStable.band === 'weak');
assert('stable → stage=stable',    presStable.stage === 'stable');

const biasedWeak = { ...createEmptyState(), cont_stage: 'biased_inclination', cont_drift: 0.20 };
const presWeak = getPresentationState(biasedWeak);
assert('drift=0.20 → band=weak',   presWeak.band === 'weak');
assert('drift=0.20 → intensity=0.20', near(presWeak.intensity, 0.20));

const biasedMed = { ...createEmptyState(), cont_stage: 'biased_inclination', cont_drift: 0.50 };
assert('drift=0.50 → band=medium', getPresentationState(biasedMed).band === 'medium');

const biasedStrong = { ...createEmptyState(), cont_stage: 'biased_inclination', cont_drift: 0.70 };
assert('drift=0.70 → band=strong', getPresentationState(biasedStrong).band === 'strong');

const hyperStrong = { ...createEmptyState(), cont_stage: 'hypercompletion', cont_fixation: 0.80 };
assert('hypercompletion fix=0.80 → band=strong', getPresentationState(hyperStrong).band === 'strong');

// ─── 7. getDominantEmotionLabel ───────────────────────────────────

section('7. getDominantEmotionLabel — VAD quadrants');

assert('anger  (v<-0.1, a>0.1)',   getDominantEmotionLabel({ drift_dir_v: -0.3, drift_dir_a: 0.5 }) === 'anger');
assert('sadness (v<-0.1, a≤0.1)',  getDominantEmotionLabel({ drift_dir_v: -0.3, drift_dir_a: 0.0 }) === 'sadness');
assert('excitement (v≥0.1, a>0.1)',getDominantEmotionLabel({ drift_dir_v: 0.3,  drift_dir_a: 0.5 }) === 'excitement');
assert('calm (v≥0.1, a≤0.1)',      getDominantEmotionLabel({ drift_dir_v: 0.3,  drift_dir_a: 0.0 }) === 'calm');
assert('neutral (v near 0)',        getDominantEmotionLabel({ drift_dir_v: 0.05, drift_dir_a: 0.05 }) === 'neutral');

// ─── 8. applyStageText — stable passthrough ───────────────────────

section('8. applyStageText — stable passthrough');

const dummyScene = {};
const presStableObj = { stage: 'stable', intensity: 0, band: 'weak' };
const original = 'The light was cold and distant.';

assert('stable → original text unchanged',
  applyStageText(original, dummyScene, presStableObj) === original);

assert('intensity<0.01 → original text unchanged',
  applyStageText(original, dummyScene, { stage: 'biased_inclination', intensity: 0.005, band: 'weak' }) === original);

// ─── 9. applyStageText — pre-generated AI text wins ──────────────

section('9. applyStageText — pre-generated AI text priority');

const sceneWithBiased = { text_biased: '기억은 이미 기울었다.' };
const sceneWithHyper  = { text_hyper:  '이것만이 사실이다.' };

const presBiased = { stage: 'biased_inclination', intensity: 0.50, band: 'medium' };
const presHyper  = { stage: 'hypercompletion',    intensity: 0.80, band: 'strong' };

assert('text_biased wins for biased_inclination',
  applyStageText('original', sceneWithBiased, presBiased) === sceneWithBiased.text_biased);
assert('text_hyper wins for hypercompletion',
  applyStageText('original', sceneWithHyper, presHyper) === sceneWithHyper.text_hyper);
assert('text_biased NOT used for hypercompletion stage',
  applyStageText('original', sceneWithBiased, presHyper) !== sceneWithBiased.text_biased);

// ─── 10. applyStageText — client-side fallback is deterministic ───

section('10. applyStageText — seeded PRNG determinism');

const longText = 'The cold morning. The wet grass. You were there when it happened. I remember your face.';
const presStrong = { stage: 'biased_inclination', intensity: 0.70, band: 'strong' };

const out1 = applyStageText(longText, {}, presStrong);
const out2 = applyStageText(longText, {}, presStrong);
const out3 = applyStageText(longText, {}, presStrong);

assert('same input → same output (deterministic)', out1 === out2 && out2 === out3);
assert('biased_inclination modifies text (not original)', out1 !== longText);
console.log(`    sample: "${out1.slice(0, 60)}..."`);

// ─── 11. applyStageText — biased erosion contains · chars ─────────

section('11. applyStageText — biased_inclination erosion pattern');

// Use strong band + known seed → some words should have · chars
// Run many short texts to increase chance of erosion
let foundDot = false;
for (let i = 0; i < 20; i++) {
  const t = `word${i} long_word_${i} another_longer_word_test_${i}`;
  const r = applyStageText(t, {}, { stage: 'biased_inclination', intensity: 0.70, band: 'strong' });
  if (r.includes('·')) { foundDot = true; break; }
}
assert('biased_inclination erosion produces · characters', foundDot);

// ─── 12. applyStageText — hypercompletion echo / glitch ───────────

section('12. applyStageText — hypercompletion echo and glitch chars');

const GLITCH_CHARS = '░▒▓█▪▫';
let foundEcho = false;
let foundGlitch = false;

for (let i = 0; i < 30; i++) {
  const t = `memory_${i} recollection_${i} certainty_absolute_${i} fixed_${i}`;
  const r = applyStageText(t, {}, { stage: 'hypercompletion', intensity: 0.80, band: 'strong' });
  if (!foundEcho && r.split(/\s+/).some((w, idx, arr) => idx > 0 && arr[idx-1] === w)) foundEcho = true;
  if (!foundGlitch && [...GLITCH_CHARS].some(c => r.includes(c))) foundGlitch = true;
  if (foundEcho && foundGlitch) break;
}
assert('hypercompletion produces word echo OR glitch chars', foundEcho || foundGlitch);

// ─── 13. getContaminatedSceneText — stable memory row ─────────────

section('13. getContaminatedSceneText — stable memory row');

const stableMemory = { cont_stage: 'stable', cont_drift: 0, cont_fixation: 0 };
const scene = { text: 'The original uncontaminated memory.' };
const { displayText, pres } = getContaminatedSceneText(scene, stableMemory);

assert('stable memory → original text', displayText === scene.text);
assert('stable memory → pres.stage=stable', pres.stage === 'stable');

// ─── 14. getContaminatedSceneText — missing memory fallback ───────

section('14. getContaminatedSceneText — missing/null memory');

const { displayText: dt2, pres: p2 } = getContaminatedSceneText(scene, null);
assert('null memory → original text (stable fallback)', dt2 === scene.text);
assert('null memory → pres.stage=stable', p2.stage === 'stable');

const { displayText: dt3 } = getContaminatedSceneText(scene, undefined);
assert('undefined memory → original text', dt3 === scene.text);

// ─── 15. getContaminatedSceneText — contaminated memory row ───────

section('15. getContaminatedSceneText — contaminated memory row');

const contMemory = {
  cont_stage: 'biased_inclination',
  cont_drift: 0.55,
  cont_fixation: 0.10,
  drift_dir_v: -0.3,
  drift_dir_a: 0.4,
};
const longScene = {
  text: 'The day she left, the kitchen smelled of burnt coffee and something else I cannot name. I stood there watching the door for a long time.',
};
const { displayText: contText, pres: contPres } = getContaminatedSceneText(longScene, contMemory);
assert('contaminated memory → pres.stage=biased_inclination', contPres.stage === 'biased_inclination');
assert('contaminated memory → pres.band=medium (drift=0.55)', contPres.band === 'medium');
assert('contaminated memory → dominant_emotion_label=anger (v<-0.1, a>0.1)', contPres.dominant_emotion_label === 'anger');
// Text may or may not be modified (prob=0.10 per word in medium band), so just check it's a string
assert('contaminated memory → displayText is string', typeof contText === 'string' && contText.length > 0);

// ─── Summary ──────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\n실패 목록:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log('모두 통과');
}

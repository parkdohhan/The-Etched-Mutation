// js/core/DriftPicker.js
//
// V2-6 drift 변주 픽 — 회차 끝 시점에 그 메모리의 drift 변주 풀에서 한 개 골라 유령 입에 박는다.
// 2단계: (1) 글로벌 좁힘 — 메모리 누적 감정 벡터에 가까운 N개 / (2) 회차 변위 softmax sampling.
// + 의미 필터 점진 풀기 (모티프 → 귀인만 → 무필터) + 직전 변주 패널티 + 폴백.
//
// 결정성 픽(argmax)이 아니라 확률 가중 sampling — 같은 사람이 두 번 들어와도 다른 변주 박힐 수 있다.
// 이게 V2-13 "재진입 시 발화 변화" 시연의 핵심 (random 픽이면 같은 변주 또 뽑힐 위험 — 변위가 다르니
// 결정적이지 않아도 다른 변주가 나옴).
//
// SeekerMatchEngine.pickGhostVariant(1등 결정성 픽)과 다른 알고리즘 — 같은 파일에 박지 않고 분리.
// pickGhostVariant 는 V2.1 매칭 진입 게이트로 그대로 유지.
//
// 결정 (2026-05-13, docs/세션핸드아웃_v26_drift픽_브레인스토밍-260512.md §6-X): temperature 0.8 /
// narrowN 8 / lastPenalty 0.3. V2-12 튜닝 자리: 위 셋 + transition_pattern 입력 여부.
//
// SCOPE §9-5 / docs/V2-6_병렬세션_핸드아웃-260513.md §H1.

import { emotionCosine } from './SeekerMatchEngine.js';

// 결정 1·2·4 (2026-05-13). V2-12 에서 0.05 단위 튜닝.
export const DRIFT_PICKER_DEFAULTS = Object.freeze({
  temperature: 0.8,   // softmax 온도 — 높을수록 무작위 (재진입 발화 변화에 유리). V2-12 에서 0.5~0.7 검토.
  narrowN: 8,         // Step 1 글로벌 좁힘 후보 수. 변주 풀 < 8 이면 풀 전체.
  lastPenalty: 0.3,   // Step 4 직전 변주 확률 ×0.3. 0.0 = 같은 변주 절대 X, 1.0 = 패널티 없음.
});

const FALLBACK_NARRATIVE_SILENCE = 'narrative_silence';

// ─── 헬퍼 ────────────────────────────────────────────────────────

/** 임의 키 벡터가 사실상 0인가 — 모든 성분 절대값이 eps 이하 (빈 객체 포함). */
function isZeroVector(vec, eps = 1e-9) {
  if (!vec || typeof vec !== 'object') return true;
  for (const k in vec) {
    if (!Object.prototype.hasOwnProperty.call(vec, k)) continue;
    if (Math.abs(Number(vec[k]) || 0) > eps) return false;
  }
  return true;
}

/** seeker motif_words 와 ghost_variants row 의 motif_tags 교집합 길이 (대소문자 무시). */
function motifIntersectCount(motifWords, motifTags) {
  if (!Array.isArray(motifWords) || !Array.isArray(motifTags)) return 0;
  const set = new Set(motifTags.filter(t => t != null).map(t => String(t).toLowerCase()));
  let n = 0;
  for (const w of motifWords) {
    if (w == null) continue;
    if (set.has(String(w).toLowerCase())) n++;
  }
  return n;
}

/** softmax — 유사도 배열 → 확률 배열. temperature 클수록 평탄(무작위), 작을수록 뾰족(결정적). */
function softmax(sims, temperature) {
  const T = (typeof temperature === 'number' && temperature > 0) ? temperature : DRIFT_PICKER_DEFAULTS.temperature;
  if (!Array.isArray(sims) || sims.length === 0) return [];
  const scaled = sims.map(s => (Number(s) || 0) / T);
  const m = Math.max.apply(null, scaled);
  const exps = scaled.map(s => Math.exp(s - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return sims.map(() => 1 / sims.length); // 이론상 도달 X — 균등 폴백
  return exps.map(e => e / sum);
}

/** 확률 배열 + rng(0~1) → 인덱스 sampling. */
function sampleIndex(probs, rng) {
  const r = (typeof rng === 'function') ? rng() : Math.random();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r < acc) return i;
  }
  return probs.length - 1; // 부동소수 잔차 안전
}

// ─── 메인 ────────────────────────────────────────────────────────

/**
 * V2-6 drift 변주 픽 — 2단계 (글로벌 좁힘 → 회차 변위 softmax) + 필터 점진 풀기 + 직전 패널티 + 폴백.
 *
 * @param {Object} opts
 * @param {Object}  opts.cumulativeEmotionVec  - memories.cumulative_emotion_vec (12축 부분 객체 또는 null/{}). Step 1 입력. 비었으면 Step 1 skip.
 * @param {Object}  opts.driftVector           - ContaminationTracker.computeDriftVector 결과 (12축, 음수 가능). Step 3 입력. 0 벡터면 균등 sampling.
 * @param {Array}   opts.ghostVariants         - 그 메모리의 ghost_variants row 중 kind==='drift' 만 (호출자가 필터. 방어적으로 한 번 더 거름).
 * @param {Object}  opts.fingerprint           - { motif_words: string[], attribution: string|null }. Step 2 의미 필터.
 * @param {String|null} opts.lastVariantId     - 직전 회차 사용 변주 id (sessionStorage). 없으면 null.
 * @param {Object}  [opts.tuning]              - { temperature, narrowN, lastPenalty }. 미지정/부분지정 시 DRIFT_PICKER_DEFAULTS.
 * @param {Function} [opts.rng]                - 0~1 난수 함수 (vitest 결정성용 fixed seed 주입). 기본 Math.random.
 * @returns {{ variant: Object|null, driftVectorAtPick: Object, fallbackKind: String|null }}
 *          variant = 박힌 ghost_variants row (폴백이면 null) / driftVectorAtPick = 픽 시점 driftVector 복사본 (도장용) /
 *          fallbackKind = null(정상) | 'narrative_silence'(풀 빔 — 호출자가 narrative_fallback_strings 호출, 조용히 1개 선택 X)
 */
export function pickDriftUtterance(opts) {
  const o = opts || {};
  const tuning = Object.assign({}, DRIFT_PICKER_DEFAULTS, o.tuning || {});
  const rng = (typeof o.rng === 'function') ? o.rng : Math.random;
  const driftVector = (o.driftVector && typeof o.driftVector === 'object') ? o.driftVector : {};
  const driftVectorAtPick = Object.assign({}, driftVector);
  const fp = o.fingerprint || {};
  const motifWords = Array.isArray(fp.motif_words) ? fp.motif_words : [];
  const attribution = (typeof fp.attribution === 'string' && fp.attribution) ? fp.attribution : null;
  const cumulative = (o.cumulativeEmotionVec && typeof o.cumulativeEmotionVec === 'object') ? o.cumulativeEmotionVec : {};
  const lastVariantId = (typeof o.lastVariantId === 'string' && o.lastVariantId) ? o.lastVariantId : null;

  // 입력 풀: kind==='drift' 만 들어온다고 약속 (호출자 필터). 방어적으로 한 번 더 — kind 없는 row 도 통과.
  let pool = Array.isArray(o.ghostVariants)
    ? o.ghostVariants.filter(v => v && (v.kind === 'drift' || v.kind == null))
    : [];

  if (pool.length === 0) {
    return { variant: null, driftVectorAtPick, fallbackKind: FALLBACK_NARRATIVE_SILENCE };
  }

  // ── Step 1: 글로벌 좁힘 — cumulative 와 가까운 N개 ──
  // cumulative 가 비었으면 skip (전부 통과). 풀 ≤ narrowN 이면 그대로 (정렬·자르기 불필요).
  if (!isZeroVector(cumulative) && pool.length > tuning.narrowN) {
    pool = pool
      .map(v => ({ v, sim: emotionCosine(cumulative, v.emotion_vec || {}) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, tuning.narrowN)
      .map(x => x.v);
  }

  // ── Step 2: 의미 필터 점진 풀기 — 모티프 교집합 → 귀인 일치 → 무필터 ──
  // 무필터 = Step 1 결과 풀 안만. 다른 메모리 침범 X (애초에 그 메모리 변주만 들어옴).
  let filtered = pool.filter(v => motifIntersectCount(motifWords, v.motif_tags || []) > 0);
  if (filtered.length === 0 && attribution) {
    filtered = pool.filter(v => v.attribution === attribution);
  }
  if (filtered.length === 0) {
    filtered = pool;
  }
  // 이후 filtered.length ≥ 1 (pool ≥ 1 이고 마지막 폴백 = pool).

  // ── Step 3: softmax 픽 — 회차 변위 vs 각 variant.emotion_vec cosine ──
  // driftVector 가 사실상 0 이면 cosine 다 0 → softmax 균등 → 균등 sampling.
  const sims = filtered.map(v => emotionCosine(driftVector, v.emotion_vec || {}));
  let probs = softmax(sims, tuning.temperature);
  let idx = sampleIndex(probs, rng);
  let picked = filtered[idx];

  // ── Step 4: 직전 변주 패널티 ──
  // 뽑힌 게 직전과 같고 풀에 2개 이상이면 → 그 확률 ×lastPenalty 후 재정규화 → 1회 재 sampling.
  // 풀에 1개뿐이면 패널티 무시 (어쩔 수 없음).
  if (lastVariantId && picked && picked.id === lastVariantId && filtered.length > 1) {
    const adj = probs.slice();
    adj[idx] = adj[idx] * tuning.lastPenalty;
    const s = adj.reduce((a, b) => a + b, 0);
    if (s > 0) {
      probs = adj.map(p => p / s);
      idx = sampleIndex(probs, rng);
      picked = filtered[idx];
    }
    // s === 0 (lastPenalty=0 + 변주 1개) → 위 length>1 가드에서 사실상 안 닿음. 닿아도 원래 picked 유지.
  }

  if (!picked) {
    // 이론상 도달 X (filtered ≥ 1). 방어.
    return { variant: null, driftVectorAtPick, fallbackKind: FALLBACK_NARRATIVE_SILENCE };
  }

  return { variant: picked, driftVectorAtPick, fallbackKind: null };
}

// 브라우저 콘솔 / wiring 코드 직접 접근용 self-attach.
if (typeof window !== 'undefined') {
  window.DriftPicker = { pickDriftUtterance, DRIFT_PICKER_DEFAULTS };
}

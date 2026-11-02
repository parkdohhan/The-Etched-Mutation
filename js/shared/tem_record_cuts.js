// js/shared/tem_record_cuts.js
// RECORD v4 §5-2 — 대화 → 씬 절단. 순수 함수 (DOM·네트워크 없음). ES module + window.TemRecordCuts.
//
// 이론 (docs/era이론_v1_동결-260722.md §2, docs/RECORD_v4_설계-260807.md §3-1):
//   era = 정렬도 n 에서 열려, 요동치며 몸통을 만들고, p 로 수렴(소강)하며 닫힌다.
//   소강 = 경계(자연 절단점). 요동 = 내부(자르면 변질). Δ = n_{k+1} − p_k = 상속 점프.
//   → 한 씬(era) = [열림 점프 → 요동 → 소강]. 절단은 "소강을 지난 뒤 다시 점프하는 이음매" 앞.
//
// 입력: 관객 발화 턴 배열 [{ text, vector|null, isVoid }] — vector = 17축 원시 측정 (뭉개지 않음).
// 규칙 'era-lull-v1':
//   1. 측정된 턴만으로 인접 델타 Δ_j = 1 − cos(v_j, v_{j+1}) 를 구한다.
//   2. 요동 문턱 hi = max(평균, 중앙값), 소강 문턱 lo = 하위 35% 분위 (평평하면 25%).
//   3. 시작은 '열림' 상태(침묵→첫 말이 첫 점프). 소강(Δ ≤ lo)을 한 번 지난 뒤 요동(Δ ≥ hi)이
//      다시 오면 그 이음매 앞에서 자른다. 씬 최소 길이 = 측정 턴 2.
//   4. 미측정 턴(침묵 [VOID]·측정 실패)은 직전 씬에 붙는다 (맨 앞이면 첫 씬).
//   5. 결과가 3씬 미만이고 측정 턴 ≥ 6 이면 촉발력 규칙(절단점도출-260730: Δ(j)×Σ_{i<j}Δ(i))
//      상위 이음매로 3씬을 만든다. 6 미만이면 그대로 돌려주고 needMore=true (호출자가 대화 연장).
//   6. 7씬 초과면 경계 델타가 가장 작은 이웃부터 합친다 (v3·v4 3~7씬 범위).
// 씬 감정 = 구성 턴 벡터의 평균 (키별, 원시값 유지).

export const RECORD_CUT_RULE = 'era-lull-v1';
export const MIN_SCENES = 3;
export const MAX_SCENES = 7;
export const MIN_SEG_LEN = 2; // 측정 턴 기준

export function cosineSim(a, b) {
  if (!a || !b) return 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, na = 0, nb = 0;
  keys.forEach((k) => {
    const x = Number(a[k]) || 0;
    const y = Number(b[k]) || 0;
    dot += x * y; na += x * x; nb += y * y;
  });
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function meanVector(vectors) {
  const out = {};
  const list = (vectors || []).filter((v) => v && typeof v === 'object');
  if (!list.length) return out;
  const keys = new Set();
  list.forEach((v) => Object.keys(v).forEach((k) => keys.add(k)));
  keys.forEach((k) => {
    let s = 0;
    list.forEach((v) => { s += Number(v[k]) || 0; });
    out[k] = s / list.length;
  });
  return out;
}

export function quantile(sortedAsc, q) {
  const a = sortedAsc;
  if (!a.length) return 0;
  if (a.length === 1) return a[0];
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

/** 인접 델타 Δ_j = 1 − cos(v_j, v_{j+1}). 길이 n−1. */
export function turnDeltas(vectors) {
  const d = [];
  for (let j = 0; j < vectors.length - 1; j++) {
    d.push(+(1 - cosineSim(vectors[j], vectors[j + 1])).toFixed(6));
  }
  return d;
}

function thresholdsOf(deltas) {
  if (!deltas.length) return { lo: 0, hi: 0 };
  const sorted = deltas.slice().sort((x, y) => x - y);
  const mean = deltas.reduce((s, x) => s + x, 0) / deltas.length;
  const median = quantile(sorted, 0.5);
  const hi = Math.max(mean, median);
  let lo = quantile(sorted, 0.35);
  if (lo >= hi) lo = quantile(sorted, 0.25);
  return { lo, hi };
}

/**
 * 측정 벡터 배열 → 경계 인덱스 목록. 경계 j = "턴 j 까지가 한 씬" (0-based, j ∈ [0, n−2]).
 * @returns {{ boundaries:number[], deltas:number[], thresholds:{lo:number,hi:number}, method:string }}
 */
export function findEraBoundaries(vectors, opts = {}) {
  const minLen = opts.minSegLen || MIN_SEG_LEN;
  const n = vectors.length;
  const deltas = turnDeltas(vectors);
  const th = thresholdsOf(deltas);
  const boundaries = [];
  if (n < 2) return { boundaries, deltas, thresholds: th, method: RECORD_CUT_RULE };

  // 3. 열림(charged) → 소강(settled) → 다음 점프 앞에서 절단
  let segStart = 0;
  let charged = true;   // 침묵 → 첫 발화 = 첫 점프
  let settled = false;
  for (let j = 0; j < deltas.length; j++) {
    const dj = deltas[j];
    const segLen = j - segStart + 1;      // 턴 segStart..j
    const remaining = n - 1 - j;          // 턴 j+1.. 의 개수
    if (dj >= th.hi && th.hi > 0) {
      if (settled && segLen >= minLen && remaining >= 1) {
        boundaries.push(j);
        segStart = j + 1;
        charged = true; settled = false;   // 새 era 는 이 점프로 열린다
      } else {
        charged = true;
      }
    } else if (dj <= th.lo && charged) {
      settled = true;
    }
  }

  let method = RECORD_CUT_RULE;

  // 5. 3씬 미만 + 측정 6턴 이상 → 촉발력 상위 이음매로 보강
  if (boundaries.length + 1 < MIN_SCENES && n >= 6) {
    const tp = deltas.map((d, j) => {
      let charge = 0;
      for (let i = 0; i < j; i++) charge += deltas[i];
      return { j, score: d * charge };
    }).sort((a, b) => b.score - a.score);
    const chosen = boundaries.slice();
    for (const cand of tp) {
      if (chosen.length + 1 >= MIN_SCENES) break;
      if (chosen.includes(cand.j)) continue;
      const trial = chosen.concat(cand.j).sort((a, b) => a - b);
      if (segmentLengths(trial, n).every((L) => L >= minLen)) chosen.splice(0, chosen.length, ...trial);
    }
    if (chosen.length > boundaries.length) {
      boundaries.splice(0, boundaries.length, ...chosen.sort((a, b) => a - b));
      method = 'trigger-power-fallback';
    }
  }

  // 6. 7씬 초과 → 경계 델타 최소부터 합침
  while (boundaries.length + 1 > MAX_SCENES) {
    let k = 0;
    for (let i = 1; i < boundaries.length; i++) if (deltas[boundaries[i]] < deltas[boundaries[k]]) k = i;
    boundaries.splice(k, 1);
  }

  return { boundaries, deltas, thresholds: th, method };
}

function segmentLengths(boundaries, n) {
  const out = [];
  let start = 0;
  for (const b of boundaries) { out.push(b - start + 1); start = b + 1; }
  out.push(n - start);
  return out;
}

/**
 * 턴 배열 → 씬 분할.
 * @param {Array<{text:string, vector?:object|null, isVoid?:boolean}>} turns
 * @returns {{ segments:Array<{turnIndices:number[], utterances:string[], vector:object, voidCount:number}>,
 *             boundaries:number[], deltas:number[], thresholds:object, method:string, needMore:boolean, measuredCount:number }}
 */
export function segmentTurns(turns, opts = {}) {
  const measured = [];   // { idx, vector }
  turns.forEach((t, idx) => {
    if (t && t.vector && typeof t.vector === 'object' && Object.keys(t.vector).length && !t.isVoid) {
      measured.push({ idx, vector: t.vector });
    }
  });
  const vectors = measured.map((m) => m.vector);
  const res = findEraBoundaries(vectors, opts);

  // 측정 턴 기준 경계 → 원 턴 인덱스 경계 (턴 idx 까지가 한 씬)
  const cutAfter = new Set(res.boundaries.map((j) => measured[j].idx));
  const segments = [];
  let cur = { turnIndices: [], utterances: [], vectors: [], voidCount: 0 };
  turns.forEach((t, idx) => {
    cur.turnIndices.push(idx);
    cur.utterances.push(String((t && t.text) || ''));
    if (t && t.isVoid) cur.voidCount += 1;
    if (t && t.vector && !t.isVoid) cur.vectors.push(t.vector);
    if (cutAfter.has(idx)) {
      segments.push(cur);
      cur = { turnIndices: [], utterances: [], vectors: [], voidCount: 0 };
    }
  });
  if (cur.turnIndices.length) {
    // 4. 꼬리가 미측정 턴뿐이면 직전 씬에 붙인다
    if (!cur.vectors.length && segments.length) {
      const last = segments[segments.length - 1];
      last.turnIndices.push(...cur.turnIndices);
      last.utterances.push(...cur.utterances);
      last.voidCount += cur.voidCount;
    } else {
      segments.push(cur);
    }
  }

  const out = segments.map((s) => ({
    turnIndices: s.turnIndices,
    utterances: s.utterances,
    vector: meanVector(s.vectors),
    voidCount: s.voidCount,
  }));

  return {
    segments: out,
    boundaries: res.boundaries,
    deltas: res.deltas,
    thresholds: res.thresholds,
    method: res.method,
    needMore: out.length < MIN_SCENES,
    measuredCount: vectors.length,
  };
}

/**
 * 최소 3씬 강제 (두 번째 거절 뒤 완화 저장 — v3 강제 완성 규칙 계승).
 * 측정 턴이 3 미만이면 있는 만큼(1~2씬) 그대로 돌려준다.
 */
export function segmentTurnsRelaxed(turns) {
  const first = segmentTurns(turns);
  if (!first.needMore) return first;
  const measuredIdx = turns.map((t, i) => (t && t.vector && !t.isVoid ? i : -1)).filter((i) => i >= 0);
  if (measuredIdx.length < MIN_SCENES) return { ...first, method: first.method + '+short' };
  // 측정 턴을 3등분 (가능하면 촉발력 규칙 우선 — findEraBoundaries 가 이미 시도했으므로 균등 분할)
  const k = MIN_SCENES;
  const per = Math.floor(measuredIdx.length / k);
  const cutAfter = new Set();
  for (let s = 1; s < k; s++) cutAfter.add(measuredIdx[s * per - 1]);
  const segments = [];
  let cur = { turnIndices: [], utterances: [], vectors: [], voidCount: 0 };
  turns.forEach((t, idx) => {
    cur.turnIndices.push(idx);
    cur.utterances.push(String((t && t.text) || ''));
    if (t && t.isVoid) cur.voidCount += 1;
    if (t && t.vector && !t.isVoid) cur.vectors.push(t.vector);
    if (cutAfter.has(idx)) { segments.push(cur); cur = { turnIndices: [], utterances: [], vectors: [], voidCount: 0 }; }
  });
  if (cur.turnIndices.length) segments.push(cur);
  return {
    ...first,
    segments: segments.map((s) => ({ turnIndices: s.turnIndices, utterances: s.utterances, vector: meanVector(s.vectors), voidCount: s.voidCount })),
    method: 'even-split-relaxed',
    needMore: false,
  };
}

if (typeof window !== 'undefined') {
  window.TemRecordCuts = { RECORD_CUT_RULE, MIN_SCENES, MAX_SCENES, cosineSim, meanVector, turnDeltas, findEraBoundaries, segmentTurns, segmentTurnsRelaxed };
}

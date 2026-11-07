// tools/plausibility/lib/metrics.mjs — 자(스케일) 무관 지표 (사전 등록 v1 §7)
// 순위 백분위 · 1등률(동점 분할) · 절반 안정성 · 같은 씬 안 말 바꿔 끼우기(N5)

import { mean, shuffleInPlace } from './vec.mjs';

const EPS = 1e-12;

/** Ω 안에서 실제 다음 씬 j 의 점수 백분위. 0=꼴찌, 1=1등, 동점은 반씩. |Ω|<2 → null */
export function rankPercentile(scores, cands, j) {
  const n = cands.length; if (n < 2 || !scores.has(j)) return null;
  const sj = scores.get(j); let below = 0, ties = 0;
  for (const k of cands) { if (k === j) continue; const s = scores.get(k); if (s < sj - EPS) below++; else if (Math.abs(s - sj) <= EPS) ties++; }
  return (below + 0.5 * ties) / (n - 1);
}

/** j 가 최고 점수면 1 (동점이면 1/동점 수). |cands|<2 → null */
export function top1(scores, cands, j) {
  if (cands.length < 2 || !scores.has(j)) return null;
  const sj = scores.get(j); let maxS = -Infinity; for (const k of cands) maxS = Math.max(maxS, scores.get(k));
  if (sj < maxS - EPS) return 0;
  let tied = 0; for (const k of cands) if (Math.abs(scores.get(k) - maxS) <= EPS) tied++;
  return 1 / tied;
}

/** 한 모형을 걸음 목록에 대해 구획별로 잰다. scoreFn(step, cands, ctx) */
export function evaluateModel(scoreFn, steps, ctx) {
  const B = { pct: [], top1: [] }, A = { top1: [] }, A2 = { pair: [] };
  let nBskip = 0;
  for (const st of steps) {
    // 구획 B: 미방문 전체
    if (st.omega.includes(st.j)) {
      const sc = scoreFn(st, st.omega, ctx);
      const p = rankPercentile(sc, st.omega, st.j); if (p != null) { B.pct.push(p); B.top1.push(top1(sc, st.omega, st.j)); }
    } else nBskip++;
    // 구획 A: 재생된 제시 집합(미방문) ≥2 이고 j 포함
    const O = st.replay && st.replay.offeredUnvisited ? [...st.replay.offeredUnvisited] : [];
    if (O.length >= 2 && O.includes(st.j)) {
      const sc = scoreFn(st, O, ctx); const t = top1(sc, O, st.j);
      A.top1.push(t); if (O.length === 2) A2.pair.push(t);
    }
  }
  return {
    B_pct: mean(B.pct), B_top1: mean(B.top1), nB: B.pct.length, nBskip,
    A_top1: mean(A.top1), nA: A.top1.length,
    A2_pair: mean(A2.pair), nA2: A2.pair.length,
  };
}

/** N5: 같은 씬 i 에 온 다른 회차 걸음의 (u, uRaw, isVoid) 로 교체한 걸음 목록 */
export function permuteUtterances(steps, rng) {
  const byScene = new Map();
  for (const st of steps) { if (!byScene.has(st.i)) byScene.set(st.i, []); byScene.get(st.i).push(st); }
  return steps.map((st) => {
    const pool = byScene.get(st.i).filter((o) => o.runId !== st.runId);
    if (!pool.length) return st;
    const src = pool[Math.floor(rng() * pool.length)];
    return Object.assign({}, st, { u: src.u, uRaw: src.uRaw, isVoid: src.isVoid });
  });
}

/** 교체 영모형 p값: 관측 통계 ≥ 가 되는 비율, (1+#)/(1+reps). stat(stepsLike) → number|null */
export function permutationP(steps, stat, rng, reps) {
  const obs = stat(steps); if (obs == null) return { obs, p: null, reps: 0, nullMean: null };
  let ge = 0, used = 0, acc = 0;
  for (let r = 0; r < reps; r++) {
    const v = stat(permuteUtterances(steps, rng)); if (v == null) continue;
    used++; acc += v; if (v >= obs - EPS) ge++;
  }
  return { obs, p: used ? (1 + ge) / (1 + used) : null, reps: used, nullMean: used ? acc / used : null };
}

/** 절반 안정성: 회차를 절반으로 splits 회 나눠, 각 절반에서 diffFn(stepsHalf) 의 부호가 full 과 같은 비율 */
export function splitHalfStability(steps, diffFn, rng, splits) {
  const runIds = [...new Set(steps.map((s) => s.runId))];
  const full = diffFn(steps); if (full == null || runIds.length < 4) return { full, keepRate: null, splits: 0 };
  const sign = Math.sign(full); let same = 0, total = 0;
  for (let r = 0; r < splits; r++) {
    const ids = shuffleInPlace(runIds.slice(), rng); const half = new Set(ids.slice(0, Math.floor(ids.length / 2)));
    for (const part of [steps.filter((s) => half.has(s.runId)), steps.filter((s) => !half.has(s.runId))]) {
      const d = diffFn(part); if (d == null) continue; total++; if (Math.sign(d) === sign) same++;
    }
  }
  return { full, keepRate: total ? same / total : null, splits: total };
}

// tools/plausibility/lib/vec.mjs — 기억 축 위의 벡터 산술 (사전 등록 v1 §3)
// 의존 0. 모든 P 계산은 여기 함수만 쓴다.

export function parseEmotion(v) {
  if (!v) return {};
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return {}; } }
  return {};
}

/** 기억 축 = 씬 original_emotion 에서 값>0 인 키 합집합, 사전순 (play-test memoryEmotionAxes 와 동일 규칙) */
export function memoryAxes(scenes) {
  const set = new Set();
  for (const s of scenes) {
    const e = parseEmotion(s.original_emotion);
    for (const k in e) if (Number(e[k]) > 0) set.add(k);
  }
  return [...set].sort();
}

export function toArray(vec, axes) { return axes.map((k) => { const n = Number(vec && vec[k]); return Number.isFinite(n) ? n : 0; }); }
export function norm(a) { let s = 0; for (const x of a) s += x * x; return Math.sqrt(s); }
export function isZero(a, eps = 1e-12) { return norm(a) < eps; }
export function unit(a) { const n = norm(a); return n > 0 ? a.map((x) => x / n) : a.map(() => 0); }
export function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
export function cos(a, b) { const na = norm(a), nb = norm(b); if (na === 0 || nb === 0) return 0; return dot(a, b) / (na * nb); }
export function add(a, b) { return a.map((x, i) => x + b[i]); }
export function sub(a, b) { return a.map((x, i) => x - b[i]); }
export function scale(a, s) { return a.map((x) => x * s); }
export function mean(xs) { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null; }

/** mulberry32 — sheaf.mjs 와 같은 생성기 (재현용). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

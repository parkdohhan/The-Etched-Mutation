/**
 * Room-play engine glue.
 *
 * The engine itself is untouched: ByeoriEngine.calculateStep gives pattern / alignment / bucket.
 * What lives here is the part play-test.html keeps inline (updateAccess), re-floored:
 *   pattern → centre moves (design principle #1, same PATTERN_CENTER weights)
 *   "nearest" is measured on the memory's own emotion axes (cosine), never on a 2D map.
 * One door only: the nearest scene to the centre. No radius gate, no cap, no locked list.
 *
 * Decision record: docs/글방_통로_무대_결정-261117.md (G3, G4).
 */
import { calculateStep } from '../core/ByeoriEngine.js';

// ── vectors on the memory's axes ───────────────────────────────────────────
export function parseEmotion(v) {
  if (!v) return {};
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { return {}; } }
  if (typeof v !== 'object' || Array.isArray(v)) return {};
  const o = {};
  for (const k in v) { const n = Number(v[k]); if (isFinite(n)) o[k] = n; }
  return o;
}
/** Memory-local axes = union of keys with a positive value across scenes' original_emotion, sorted. */
export function memoryAxes(scenes) {
  const set = new Set();
  for (const s of scenes) { const e = parseEmotion(s.original_emotion); for (const k in e) if (e[k] > 0) set.add(k); }
  return Array.from(set).sort();
}
export function toArr(obj, axes) { const o = obj || {}; return axes.map((k) => Number(o[k]) || 0); }
export function norm(a) { let s = 0; for (const x of a) s += x * x; return Math.sqrt(s); }
export function unit(a) { const n = norm(a); return n > 1e-12 ? a.map((x) => x / n) : a.map(() => 0); }
export function add(a, b) { return a.map((x, i) => x + b[i]); }
export function sub(a, b) { return a.map((x, i) => x - b[i]); }
export function scale(a, k) { return a.map((x) => x * k); }
export function cos(a, b) {
  const na = norm(a), nb = norm(b);
  if (na < 1e-12 || nb < 1e-12) return 0;
  let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d / (na * nb);
}

// ── pattern → centre (same weights as play-test PATTERN_CENTER) ─────────────
const PATTERN_CENTER = {
  echo_follow:   { wOrig: 0.7, wUser: 0.3 },
  bridge:        { wOrig: 0.5, wUser: 0.5 },
  contradiction: { mode: 'reflect_user' },   // opposite of the user's current emotion
  displacement:  { wOrig: 0.3, wUser: 0.7 },
  avoidance:     { mode: 'void' },
  fixation:      { mode: 'current_scene' },
};

/**
 * Centre of the approach space for this pattern, as a vector on the memory axes.
 * - contradiction: play-test reflects the user's map position through the centroid of the scene
 *   pins. The same construction on the emotion axes: c = 2·ō − û (ō = mean of unit scene vectors).
 *   (1 − v inversion is not used: it yields a near-uniform vector — see play-test.html:2025.)
 * - avoidance: the void. Unit vector on {emptiness, numbness} if the memory has those axes,
 *   otherwise the void scene's own vector, otherwise uniform (pre-registration §4.1 v_void).
 */
export function accessCenter(pattern, userArr, originArr, ctx) {
  const cfg = PATTERN_CENTER[pattern] || PATTERN_CENTER.bridge;
  if (cfg.mode === 'current_scene') return originArr.slice();
  if (cfg.mode === 'reflect_user') return sub(scale(ctx.meanUnit, 2), unit(userArr));
  if (cfg.mode === 'void') return ctx.voidVec.slice();
  if (norm(userArr) < 1e-12 && norm(originArr) < 1e-12) return ctx.meanUnit.slice();
  return add(scale(originArr, cfg.wOrig), scale(userArr, cfg.wUser));
}

function matchesExclusion(condition, st) {
  if (!condition || typeof condition !== 'object') return false;
  if (condition.type === 'emotion_threshold') return Number((st.userEmotion || {})[condition.emotion] || 0) >= Number(condition.min != null ? condition.min : 0.6);
  if (condition.type === 'emotion_below') return Number((st.userEmotion || {})[condition.emotion] || 0) < Number(condition.max != null ? condition.max : 0.5);
  if (condition.type === 'visited_scene') return (st.visitedIdx || []).includes(condition.sceneIndex);
  return false;
}
/**
 * Scene locks (scenes.exclusions) — read the way the authored reasons state them: the rule's
 * condition is what OPENS the scene ("칼을 쥔 손은 죄책감에 닿기 전엔 보이지 않는다" + guilt ≥ 0.4).
 * A lock is satisfied by the strongest value the walker has shown so far in this run.
 */
export function isLocked(scene, st) {
  const ex = scene.exclusions;
  if (!Array.isArray(ex) || !ex.length) return false;
  return !ex.every((r) => matchesExclusion(r && r.condition, st));
}

/**
 * @param opts.frame 'scene' (default) — the engine measures on each scene's anchor_emotions when it has them,
 *                   exactly like play-test (기억별_좌표계_결정-260727: scene anchor > memory axes).
 *                   'memory' — always the memory's own axes. For comparison only (?frame=memory): with two or
 *                   three anchors per scene the cosine is almost always high and every corridor reads echo_follow.
 */
export function createEngine(scenes, opts) {
  const frame = (opts && opts.frame) === 'memory' ? 'memory' : 'scene';
  const axes = memoryAxes(scenes);
  const arrOf = new Map(), unitOf = new Map();
  for (const s of scenes) { const a = toArr(parseEmotion(s.original_emotion), axes); arrOf.set(s.id, a); unitOf.set(s.id, unit(a)); }
  let meanUnit = axes.map(() => 0);
  for (const s of scenes) meanUnit = add(meanUnit, unitOf.get(s.id));
  meanUnit = scale(meanUnit, 1 / Math.max(1, scenes.length));
  const voidScenes = scenes.filter((s) => s.void_info && s.void_info.sceneVoid);
  let voidVec = axes.map((k) => (k === 'emptiness' || k === 'numbness' ? 1 : 0));
  if (norm(voidVec) < 1e-12) voidVec = voidScenes.length ? arrOf.get(voidScenes[0].id).slice() : axes.map(() => 1);
  voidVec = unit(voidVec);
  const ctx = { meanUnit, voidVec };

  const st = { prevBucket: null, emoHistory: [], userTraj: [], origTraj: [], sceneScores: [], peak: {}, steps: [] };

  /** One engine step after a scene (mirrors play-test.html onSceneEnd, lines 3760–3781). */
  function step(scene, userEmotion, isVoid) {
    const orig = parseEmotion(scene.original_emotion);
    const vi = scene.void_info || {};
    const out = calculateStep({
      userVector: { base: userEmotion, reason_analysis: { is_void: !!isVoid, attribution: null, target: null, core_fear: null } },
      originalVector: { base: orig, reason_analysis: { attribution: scene.original_reason || null, target: vi.target || null, core_fear: vi.coreFear || vi.core_fear || null, is_void: !!vi.sceneVoid } },
      anchorEmotions: frame === 'memory' ? null : parseAnchors(scene),
      userTrajectory: st.userTraj, originalTrajectory: st.origTraj, sceneScores: st.sceneScores,
      emotionKeys: axes.length ? axes : null,
    }, { previousBucket: st.prevBucket, emotionHistory: st.emoHistory });
    st.prevBucket = out.alignment_bucket;
    st.emoHistory.push(Object.assign({}, userEmotion));
    st.userTraj.push(Object.assign({}, userEmotion));
    st.origTraj.push(Object.assign({}, orig));
    st.sceneScores.push(out.current_scene_score || 0);
    for (const k in userEmotion) st.peak[k] = Math.max(st.peak[k] || 0, Number(userEmotion[k]) || 0);
    st.steps.push({ scene_id: scene.id, pattern: out.transition_pattern, alignment: out.alignment_score, bucket: out.alignment_bucket, mismatch: out.mismatch_type });
    return out;
  }

  /**
   * Which room does the one door lead to?
   * @returns {{ scene, mode:'new'|'same'|'fallback'|'none', pattern, ranked:[{id,d}], shadow }}
   */
  function pickNext(o) {
    const origin = o.origin, pattern = o.pattern, visited = o.visited;
    const uArr = toArr(o.userEmotion, axes), oArr = arrOf.get(origin.id);
    if (pattern === 'fixation') return { scene: origin, mode: 'same', pattern, ranked: [], shadow: null };
    const lockState = { userEmotion: st.peak, visitedIdx: scenes.map((s, i) => (visited.has(s.id) ? i : -1)).filter((i) => i >= 0) };
    const unvisited = scenes.filter((s) => !visited.has(s.id));
    if (!unvisited.length) return { scene: null, mode: 'none', pattern, ranked: [], shadow: null };
    let pool = unvisited.filter((s) => !isLocked(s, lockState));
    let mode = 'new';
    if (!pool.length) { pool = unvisited; mode = 'fallback'; }   // principle #4: the caller wraps this in narrative
    const center = accessCenter(pattern, uArr, oArr, ctx);
    const rank = (list) => list.map((s) => ({ s, d: 1 - cos(center, arrOf.get(s.id)) })).sort((a, b) => (a.d - b.d) || (a.s.scene_order - b.s.scene_order));
    let ranked = rank(pool);
    if (pattern === 'avoidance') {   // the void pin first, if it is still there
      const v = ranked.filter((r) => r.s.void_info && r.s.void_info.sceneVoid);
      if (v.length) ranked = v.concat(ranked.filter((r) => !(r.s.void_info && r.s.void_info.sceneVoid)));
    }
    const chosen = ranked[0].s;
    return {
      scene: chosen, mode, pattern,
      ranked: ranked.map((r) => ({ id: r.s.id, order: r.s.scene_order, d: +r.d.toFixed(4) })),
      shadow: shadowScores(origin, o.userEmotion, !!o.isVoid, pool, chosen),
    };
  }

  /**
   * Shadow mode (pre-registration 개연성_사전등록_v1 §4.1–4.2, formulas unchanged): computed and logged,
   * never used for the door. Reports where the engine's pick sits in each formula's ordering.
   */
  function shadowScores(origin, userEmotion, isVoid, pool, chosen) {
    const u = unit(toArr(userEmotion, axes)), oi = unitOf.get(origin.id);
    const uZero = norm(u) < 1e-12;
    const alpha = Math.max(0, cos(u, oi)), nu = isVoid ? 1 : 0;
    const c1 = uZero ? oi : add(scale(add(scale(oi, alpha), scale(u, 1 - alpha)), 1 - nu), scale(voidVec, nu));
    let mAll = axes.map(() => 0);
    for (const s of scenes) mAll = add(mAll, unitOf.get(s.id));
    const oBar = unit(mAll);
    const aT = (1 + cos(sub(u, oBar), sub(oi, oBar))) / 2;
    const r = add(scale(oi, 1 - aT), scale(oBar, aT));
    const dUser = sub(u, r);
    const p1 = (k) => cos(c1, unitOf.get(k.id));
    const p2 = (k) => { const dk = sub(unitOf.get(k.id), r); return (uZero || norm(dUser) < 1e-9 || norm(dk) < 1e-12) ? 0.5 : (1 + cos(dUser, dk)) / 2; };
    const n3 = (k) => cos(oi, unitOf.get(k.id));
    const rankOf = (fn) => 1 + pool.filter((k) => fn(k) > fn(chosen) + 1e-12).length;
    const top = (fn) => pool.slice().sort((a, b) => fn(b) - fn(a))[0].scene_order;
    return { n: pool.length, M1: { p: +p1(chosen).toFixed(4), rank: rankOf(p1), top: top(p1) }, M2: { p: +p2(chosen).toFixed(4), rank: rankOf(p2), top: top(p2) }, N3: { p: +n3(chosen).toFixed(4), rank: rankOf(n3), top: top(n3) } };
  }

  return { axes, step, pickNext, state: st, alignmentTo(scene, userEmotion) { return cos(toArr(userEmotion, axes), arrOf.get(scene.id)); }, arrOf, unitOf };
}

export function parseAnchors(scene) {
  let a = scene.anchor_emotions;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch (_) { a = null; } }
  return (Array.isArray(a) && a.length) ? a.map(String) : null;
}

/** Turn alignment → resonance label. Thresholds = lumen_ghost_response.js (0.55 / 0.35). */
export function resonanceOf(alignment) { return alignment >= 0.55 ? 'resonance' : alignment >= 0.35 ? 'vague' : 'dissonance'; }

// ── corridor shape input: memory-local keys → the 17 named axes the centreline rules read ──
// Staging only (not judgement): the corridor builder drops keys outside its 17 axes, so keys the
// authoring vocabulary adds are folded onto the nearest named axis. Free table — adjust freely.
const FOLD = {
  flutter: 'hope', excitement: 'joy',   // 261128: 설렘 · 흥분 (corridor shape only)
  longing: 'sadness', loneliness: 'isolation', obsession: 'fear', awe: 'peace', tenderness: 'love',
  envy: 'anger', disgust: 'anger', surprise: 'fear', emptiness: 'numbness', resentment: 'anger', nostalgia: 'sadness',
};
const NAMED = ['fear', 'sadness', 'anger', 'guilt', 'shame', 'isolation', 'numbness', 'moral_pain', 'helplessness', 'despair', 'joy', 'hope', 'relief', 'gratitude', 'love', 'peace', 'comfort'];
export function foldTo17(emotion) {
  const e = parseEmotion(emotion), o = {};
  for (const k in e) { const t = NAMED.includes(k) ? k : FOLD[k]; if (t) o[t] = Math.max(o[t] || 0, e[k]); }
  return o;
}

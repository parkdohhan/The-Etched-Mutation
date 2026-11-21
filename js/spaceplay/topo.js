/**
 * Space-play topology (2026-11-21) — the accumulated model, and a walker's own. Pure calculation.
 *
 * DEFINITIONS (decision record docs/우주무대_결정-261121.md §3; order = primitives → same → different → quantity → refutation)
 *   primitives   scene · run · ledger row (plays) · emotion reading (the classifier's vector on the memory's axes)
 *   walk         two consecutive rows of one run that lie in different scenes (docs/기억의_정의_v1-261105.md)
 *
 *   A — the accumulated model.   domain: the scenes of one memory
 *     A(s) ∈ R³  the layout the admin's model draws (js/admin/piece_editor.js layoutNet, same construction):
 *                one spring per pair of scenes, strength = walks between the pair ÷ the mean of that over the pairs.
 *                Rows of practice runs are left out (the admin counts every row; that is the one difference).
 *     meaning    only the difference A(t) − A(s). Turning or moving the whole model changes nothing that is used.
 *
 *   Q — a walker's model.        domain: the scenes one run has reached
 *     Q(first scene) = 0.   On first reaching t by a walk s → t:   Q(t) = Q(s) + L·(A(t) − A(s)) + L·δ
 *     A scene already reached is not moved again.
 *
 *   δ — the walker's singularity at s, as a displacement
 *     same       walker and ledger are the same at s when the walker's reading at s points where the ledger's mean
 *                reading at s points (their unit vectors are equal)
 *     different  not the same.  d = û_walker(s) − û_ledger(s)        |d| = 0 (the same) … 2 (opposite)
 *     δ          = g · Σₖ (d·ôₖ)(A(k) − A(t)) / Σₖ |d·ôₖ|    k over the memory's scenes, ôₖ = scene k's own emotion (unit)
 *                "this walker leaned, more than the ledger does, toward what scene k carries — so the scene they
 *                 went on to stands shifted toward where k stands"
 *     δ = 0      the same as the ledger at s — or nothing to compare with (no row at s, or no reading): `compared` says which
 *     refuted by a walker whose reading equals the ledger's mean at s and whose next scene is displaced all the same
 *
 *   Free parameters (staging, not definition): L, g, the clamp on a step, the flattening of height.
 *   The engine never reads A or Q: where a door leads is decided on the emotion axes alone (no loop back from place to judgement).
 */
export const TOPO = { L: 150, G: 0.42, STEP_MIN: 78, STEP_MAX: 235, Y: 0.7, CLEAR: 52 };

export function hash01(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 100000) / 100000; }   // = piece_editor.js
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const norm = (a) => Math.sqrt(a.reduce((t, x) => t + x * x, 0));
const unitOf = (a) => { const n = norm(a); return n > 1e-12 ? a.map((x) => x / n) : null; };
const dot = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
function parse(v) { if (!v) return {}; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { return {}; } } return (typeof v === 'object' && !Array.isArray(v)) ? v : {}; }

/**
 * @param scenes [{ id, scene_order, original_emotion }]
 * @param rows   every ledger row of the memory [{ run_id, scene_id, created_at, persona_id, user_emotion, alignment }]
 * @param axes   the memory's emotion axes (engine.axes)
 * @param skip   persona ids left out (practice runs)
 * @returns { pos: Map(id → [x,y,z]) radius ≤ 1, pull: Map(pair → strength), edges: Map('a|b' directed → n), visits: Map(id → n),
 *            emo: Map(id → unit mean reading | null), own: Map(id → unit own emotion | null), runs, rows }
 */
export function accumulate(scenes, rows, axes, skip) {
  const ids = scenes.map((s) => s.id), ordOf = new Map(scenes.map((s) => [s.id, Number(s.scene_order) || 0])), known = new Set(ids);
  const drop = new Set(skip || []);
  const byRun = new Map(); let used = 0;
  for (const p of rows) {
    if (!p.run_id || !p.scene_id || !known.has(p.scene_id) || drop.has(p.persona_id)) continue;
    if (!byRun.has(p.run_id)) byRun.set(p.run_id, []);
    byRun.get(p.run_id).push(p); used++;
  }
  const edges = new Map(), visits = new Map(), sum = new Map(), cnt = new Map();
  let runs = 0;
  for (const list of byRun.values()) {
    // rows stamped with the very same time carry no order of their own: lined up by scene order (as the admin does)
    list.sort((a, b) => (new Date(a.created_at) - new Date(b.created_at)) || ((ordOf.get(a.scene_id) || 0) - (ordOf.get(b.scene_id) || 0)));
    let prev = null, moved = false;
    for (const r of list) {
      if (r.persona_id !== 'piece-move') {
        visits.set(r.scene_id, (visits.get(r.scene_id) || 0) + 1);
        const e = parse(r.user_emotion), v = axes.map((k) => Number(e[k]) || 0), u = unitOf(v);
        if (u) { const s = sum.get(r.scene_id) || axes.map(() => 0); u.forEach((x, i) => { s[i] += x; }); sum.set(r.scene_id, s); cnt.set(r.scene_id, (cnt.get(r.scene_id) || 0) + 1); }
      }
      if (prev && prev !== r.scene_id) { const k = prev + '|' + r.scene_id; edges.set(k, (edges.get(k) || 0) + 1); moved = true; }
      prev = r.scene_id;
    }
    if (moved) runs++;
  }
  // the layout (piece_editor.js layoutNet)
  const n = ids.length, pos = {};
  ids.forEach((id) => { const a = hash01(id + '|la') * Math.PI * 2, b = Math.acos(2 * hash01(id + '|lb') - 1); pos[id] = [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)]; });
  const und = {};
  for (const [k, w] of edges) { const [a, b] = k.split('|'); und[pairKey(a, b)] = (und[pairKey(a, b)] || 0) + w; }
  const uk = Object.keys(und), meanW = uk.reduce((t, k) => t + und[k], 0) / (uk.length || 1), pull = new Map();
  uk.forEach((k) => pull.set(k, und[k] / meanW));
  const E = uk.map((k) => k.split('|')), soft = [];
  for (let i = 0; i + 1 < n; i++) soft.push([ids[i], ids[i + 1]]);     // the scene order holds the points loosely (nobody may have walked yet)
  const K = 1.0;
  for (let it = 0; it < 260; it++) {
    const temp = 0.12 * (1 - it / 260) + 0.004, disp = {}; ids.forEach((id) => { disp[id] = [0, 0, 0]; });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = pos[ids[i]], B = pos[ids[j]], dx = A[0] - B[0], dy = A[1] - B[1], dz = A[2] - B[2], d = Math.hypot(dx, dy, dz) || 0.01, f = K * K / d;
      disp[ids[i]][0] += dx / d * f; disp[ids[i]][1] += dy / d * f; disp[ids[i]][2] += dz / d * f;
      disp[ids[j]][0] -= dx / d * f; disp[ids[j]][1] -= dy / d * f; disp[ids[j]][2] -= dz / d * f;
    }
    const tug = (e, w) => {
      const A = pos[e[0]], B = pos[e[1]], dx = A[0] - B[0], dy = A[1] - B[1], dz = A[2] - B[2], d = Math.hypot(dx, dy, dz) || 0.01, f = w * d * d / K;
      disp[e[0]][0] -= dx / d * f; disp[e[0]][1] -= dy / d * f; disp[e[0]][2] -= dz / d * f;
      disp[e[1]][0] += dx / d * f; disp[e[1]][1] += dy / d * f; disp[e[1]][2] += dz / d * f;
    };
    E.forEach((e) => tug(e, pull.get(pairKey(e[0], e[1])))); soft.forEach((e) => tug(e, 0.18));
    ids.forEach((id) => { const v = disp[id], l = Math.hypot(v[0], v[1], v[2]) || 0.01, s = Math.min(l, temp) / l; pos[id][0] += v[0] * s; pos[id][1] += v[1] * s; pos[id][2] += v[2] * s; });
  }
  let cx = 0, cy = 0, cz = 0, r = 0.01;
  ids.forEach((id) => { cx += pos[id][0]; cy += pos[id][1]; cz += pos[id][2]; });
  ids.forEach((id) => { pos[id][0] -= cx / n; pos[id][1] -= cy / n; pos[id][2] -= cz / n; r = Math.max(r, Math.hypot(pos[id][0], pos[id][1], pos[id][2])); });
  const P = new Map(ids.map((id) => [id, pos[id].map((v) => v / r)]));
  const emo = new Map(), own = new Map();
  for (const s of scenes) {
    emo.set(s.id, cnt.get(s.id) ? unitOf(sum.get(s.id)) : null);
    const e = parse(s.original_emotion); own.set(s.id, unitOf(axes.map((k) => Number(e[k]) || 0)));
  }
  return { pos: P, pull, edges, visits, emo, own, runs, rows: used, axes };
}

/**
 * Where scene `toId` stands in this walker's model, on first reaching it from `fromId`.
 * @param acc      accumulate()
 * @param Q        Map(id → [x,y,z]) the walker's model so far (world units)
 * @param reading  the walker's emotion at `fromId` ({ axis: value }) or null
 * @returns { pos:[x,y,z], compared:boolean, d:number (0..2), shift:number (world units moved by the singularity), toward: id|null }
 */
export function placeNext(acc, Q, fromId, toId, reading) {
  const o = Q.get(fromId) || [0, 0, 0], a = acc.pos.get(fromId), b = acc.pos.get(toId);
  let step = (a && b) ? [b[0] - a[0], (b[1] - a[1]) * TOPO.Y, b[2] - a[2]] : [1, 0, 0];
  // the singularity
  let compared = false, d = 0, delta = [0, 0, 0], toward = null;
  const led = acc.emo.get(fromId), mine = reading ? unitOf(acc.axes.map((k) => Number(reading[k]) || 0)) : null;
  if (led && mine && b) {
    compared = true;
    const dv = mine.map((x, i) => x - led[i]); d = norm(dv);
    let wsum = 0, best = 0; const acc3 = [0, 0, 0];
    for (const [k, ok] of acc.own) {
      if (!ok || k === toId) continue;
      const w = dot(dv, ok), pk = acc.pos.get(k); if (!pk) continue;
      wsum += Math.abs(w);
      acc3[0] += w * (pk[0] - b[0]); acc3[1] += w * (pk[1] - b[1]) * TOPO.Y; acc3[2] += w * (pk[2] - b[2]);
      if (w > best) { best = w; toward = k; }
    }
    if (wsum > 1e-9) delta = acc3.map((x) => (x / wsum) * TOPO.G * Math.min(1, d));   // a small difference moves a scene a little; the gain is reached at |d| = 1
  }
  let v = [(step[0] + delta[0]) * TOPO.L, (step[1] + delta[1]) * TOPO.L, (step[2] + delta[2]) * TOPO.L];
  let len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-6) { v = [TOPO.STEP_MIN, 0, 0]; len = TOPO.STEP_MIN; }
  const want = Math.max(TOPO.STEP_MIN, Math.min(TOPO.STEP_MAX, len));
  v = v.map((x) => x * want / len);
  let p = [o[0] + v[0], o[1] + v[1], o[2] + v[2]];
  // two scenes do not stand in each other: pushed on along the step until clear of the ones already placed
  for (let guard = 0; guard < 12; guard++) {
    let hit = false;
    for (const [id, q] of Q) { if (id !== toId && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < TOPO.CLEAR) { hit = true; break; } }
    if (!hit) break;
    p = [p[0] + v[0] / want * 22, p[1] + v[1] / want * 22, p[2] + v[2] / want * 22];
  }
  return { pos: p, compared, d: +d.toFixed(4), shift: +(Math.hypot(delta[0], delta[1], delta[2]) * TOPO.L).toFixed(1), toward };
}

/** The same step with no singularity (what the ledger alone would give) — for showing the difference. */
export function ledgerStep(acc, fromId, toId) {
  const a = acc.pos.get(fromId), b = acc.pos.get(toId);
  return (a && b) ? [(b[0] - a[0]) * TOPO.L, (b[1] - a[1]) * TOPO.Y * TOPO.L, (b[2] - a[2]) * TOPO.L] : [TOPO.STEP_MIN, 0, 0];
}

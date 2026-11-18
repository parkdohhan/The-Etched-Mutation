/**
 * Room-play net — from the walk ledger to the map, and from the map to the ground.
 *
 * Definition side (docs/기억의_정의_v1-261105.md) is not touched: a walk is two consecutive visits
 * of different scenes inside one run; a thread is a run; thickness is the number of walks.
 * Everything below the net (layout, flattening, baking) is staging, and is recomputed from the
 * ledger every time (decision G10): same ledger → same picture.
 *
 * Free parameters (chosen, not defined — adjust by looking):
 *   BLUR_CELLS   how far a footprint spreads when the count map becomes ground
 *   GROOVE       how deep the most-walked path is, relative to the rim that frames the ground
 * The layout is a force layout: position carries no meaning, only connection does. The piece is
 * laid flat along its own thinnest direction (least-variance axis), which needs no choice of angle.
 */

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

/**
 * @param visits [{ run_id, scene_id, created_at }] oldest first (any order is fine — sorted here)
 * @returns { runs: Map(run_id → [scene_id…]), edges: Map('a|b' → { a, b, w, ab, ba }), nodes: [scene_id…], walks }
 */
export function buildNet(visits) {
  const byRun = new Map();
  for (const v of visits) { if (!v.run_id) continue; if (!byRun.has(v.run_id)) byRun.set(v.run_id, []); byRun.get(v.run_id).push(v); }
  const runs = new Map(), edges = new Map(), nodeSet = new Set();
  let walks = 0;
  for (const [rid, rows] of byRun) {
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const seq = rows.map((r) => r.scene_id);
    runs.set(rid, seq);
    seq.forEach((id) => nodeSet.add(id));
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1], b = seq[i];
      if (a === b) continue;                                  // staying is not a walk
      const key = a < b ? a + '|' + b : b + '|' + a;
      if (!edges.has(key)) edges.set(key, { a: a < b ? a : b, b: a < b ? b : a, w: 0, ab: 0, ba: 0 });
      const e = edges.get(key); e.w++; if (a === e.a) e.ab++; else e.ba++;
      walks++;
    }
  }
  return { runs, edges, nodes: Array.from(nodeSet), walks };
}

/**
 * Deterministic 3D force layout (Fruchterman–Reingold; same attraction weighting as
 * tools/topo-piece/analyze_undw.mjs). Start = golden-spiral sphere in `order`.
 * @returns Map(id → [x, y, z]) normalised to radius ≤ 1
 */
export function layout3D(nodes, edges, order) {
  const ids = nodes.slice().sort((a, b) => (order.get(a) || 0) - (order.get(b) || 0));
  const n = ids.length, P = new Map();
  if (!n) return P;
  if (n === 1) { P.set(ids[0], [0, 0, 0]); return P; }
  const ga = Math.PI * (3 - Math.sqrt(5));
  ids.forEach((id, i) => { const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), th = ga * i; P.set(id, [Math.cos(th) * r, y, Math.sin(th) * r]); });
  const K = 1.6 / Math.cbrt(n), IT = 500;
  const E = Array.from(edges.values());
  for (let it = 0; it < IT; it++) {
    const temp = 0.08 * (1 - it / IT) + 0.002, D = new Map(ids.map((id) => [id, [0, 0, 0]]));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = P.get(ids[i]), b = P.get(ids[j]);
      let dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2], d = Math.hypot(dx, dy, dz);
      if (d < 1e-6) { dx = (hash(ids[i] + ids[j]) - 0.5) * 1e-3; dy = 1e-3; dz = 0; d = Math.hypot(dx, dy, dz); }
      const f = (K * K) / d, da = D.get(ids[i]), db = D.get(ids[j]);
      da[0] += (dx / d) * f; da[1] += (dy / d) * f; da[2] += (dz / d) * f;
      db[0] -= (dx / d) * f; db[1] -= (dy / d) * f; db[2] -= (dz / d) * f;
    }
    for (const e of E) {
      const a = P.get(e.a), b = P.get(e.b); if (!a || !b) continue;
      const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2], d = Math.hypot(dx, dy, dz) || 1e-6;
      const f = ((d * d) / K) * Math.min(1, 0.25 + e.w / 6), da = D.get(e.a), db = D.get(e.b);
      da[0] -= (dx / d) * f; da[1] -= (dy / d) * f; da[2] -= (dz / d) * f;
      db[0] += (dx / d) * f; db[1] += (dy / d) * f; db[2] += (dz / d) * f;
    }
    for (const id of ids) {
      const p = P.get(id), d = D.get(id), m = Math.hypot(d[0], d[1], d[2]) || 1e-9, s = Math.min(m, temp) / m;
      p[0] += d[0] * s; p[1] += d[1] * s; p[2] += d[2] * s;
    }
  }
  // centre and normalise
  const c = [0, 0, 0]; for (const id of ids) { const p = P.get(id); c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= n; c[1] /= n; c[2] /= n;
  let R = 1e-9; for (const id of ids) { const p = P.get(id); p[0] -= c[0]; p[1] -= c[1]; p[2] -= c[2]; R = Math.max(R, Math.hypot(p[0], p[1], p[2])); }
  for (const id of ids) { const p = P.get(id); p[0] /= R; p[1] /= R; p[2] /= R; }
  return P;
}

// symmetric 3×3 eigen decomposition (Jacobi)
function eig3(A) {
  const a = A.map((r) => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 40; sweep++) {
    let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-18) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = cs * akp - sn * akq; a[k][q] = sn * akp + cs * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = cs * apk - sn * aqk; a[q][k] = sn * apk + cs * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = cs * vkp - sn * vkq; V[k][q] = sn * vkp + cs * vkq; }
    }
  }
  const vals = [a[0][0], a[1][1], a[2][2]];
  const idx = [0, 1, 2].sort((i, j) => vals[j] - vals[i]);
  return { vals: idx.map((i) => vals[i]), vecs: idx.map((i) => [V[0][i], V[1][i], V[2][i]]) };
}

/**
 * Rotate the piece so its thinnest direction is "up". Returns positions in that frame:
 * [u, thin, v] — u, v span the flat map; `thin` is what collapses to 0 when the piece is laid down.
 * Signs are fixed by the first node in `order` so the same net always lands the same way.
 */
export function principalFrame(P, order) {
  const ids = Array.from(P.keys()).sort((a, b) => (order.get(a) || 0) - (order.get(b) || 0));
  const out = new Map();
  if (ids.length < 3) { ids.forEach((id) => { const p = P.get(id); out.set(id, [p[0], p[1], p[2]]); }); return { pos: out, flatness: 1 }; }
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const id of ids) { const p = P.get(id); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += p[i] * p[j]; }
  const { vals, vecs } = eig3(C);
  const dot = (p, v) => p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
  const sg = vecs.map((v) => { for (const id of ids) { const d = dot(P.get(id), v); if (Math.abs(d) > 1e-6) return d < 0 ? -1 : 1; } return 1; });
  for (const id of ids) { const p = P.get(id); out.set(id, [dot(p, vecs[0]) * sg[0], dot(p, vecs[2]) * sg[2], dot(p, vecs[1]) * sg[1]]); }
  const tot = vals[0] + vals[1] + vals[2] || 1;
  return { pos: out, flatness: (vals[0] + vals[1]) / tot };   // share of the spread the flat map keeps
}

export const BAKE = { G: 160, SZ: 112, SPAN: 36, BLUR_CELLS: 2.7, GROOVE: 0.34, RIM: 1.0, RIM_FROM: 47, NOISE: 0.05 };

/** Map-frame [u, v] (radius ≤ 1) → terrain world x, z. */
export function toWorld(p) { return { x: p[0] * BAKE.SPAN, z: p[2] * BAKE.SPAN }; }

/**
 * Count how many walks cross each cell (one walk counts once per cell, like datashader line+count),
 * spread it, and turn it into ground: more walked = lower (a worn valley).
 * @param pos Map(id → [u, thin, v])   @param runs iterable of scene-id sequences
 * @param runs the other walkers' sequences (this run excluded)
 * @param mine scene-id sequence of this run (counted like the others, and tinted warmer), may be null
 * @returns { G, SZ, H2, hts, cls, minH, maxH, count, maxCount }
 */
export function bake(pos, runs, mine) {
  const { G, SZ, BLUR_CELLS, GROOVE, RIM, RIM_FROM, NOISE } = BAKE, H2 = SZ / 2, N = G * G;
  const cell = (x) => Math.max(0, Math.min(G - 1, Math.round((x / SZ + 0.5) * (G - 1))));
  const count = new Float32Array(N), own = new Float32Array(N);
  const stamp = new Int32Array(N).fill(-1);
  let walkNo = 0;
  const draw = (seq, into) => {
    for (let i = 1; i < seq.length; i++) {
      const A = pos.get(seq[i - 1]), B = pos.get(seq[i]);
      if (!A || !B || seq[i - 1] === seq[i]) continue;
      const a = toWorld(A), b = toWorld(B), steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (SZ / G) * 2));
      walkNo++;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, ix = cell(a.x + (b.x - a.x) * t), iz = cell(a.z + (b.z - a.z) * t), k = iz * G + ix;
        if (stamp[k] === walkNo) continue;
        stamp[k] = walkNo; into[k] += 1;
      }
    }
  };
  for (const seq of runs) draw(seq, count);
  if (mine) { draw(mine, count); draw(mine, own); }          // this run wears the ground too; `own` only tints it
  const blur = (src, sigma) => {
    const r = Math.ceil(sigma * 3), ker = []; let ks = 0;
    for (let i = -r; i <= r; i++) { const w = Math.exp(-(i * i) / (2 * sigma * sigma)); ker.push(w); ks += w; }
    const tmp = new Float32Array(N), dst = new Float32Array(N);
    for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) { let v = 0; for (let i = -r; i <= r; i++) { const xx = Math.max(0, Math.min(G - 1, x + i)); v += src[z * G + xx] * ker[i + r]; } tmp[z * G + x] = v / ks; }
    for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) { let v = 0; for (let i = -r; i <= r; i++) { const zz = Math.max(0, Math.min(G - 1, z + i)); v += tmp[zz * G + x] * ker[i + r]; } dst[z * G + x] = v / ks; }
    return dst;
  };
  const cB = blur(count, BLUR_CELLS), oB = blur(own, BLUR_CELLS);
  let maxC = 0, maxO = 0; for (let i = 0; i < N; i++) { if (cB[i] > maxC) maxC = cB[i]; if (oB[i] > maxO) maxO = oB[i]; }
  const hts = new Float32Array(N), cls = new Float32Array(N * 3);
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let minH = Infinity, maxH = -Infinity;
  for (let iz = 0; iz < G; iz++) for (let ix = 0; ix < G; ix++) {
    const k = iz * G + ix, x = (ix / (G - 1) - 0.5) * SZ, z = (iz / (G - 1) - 0.5) * SZ, rr = Math.hypot(x, z);
    const worn = maxC > 0 ? Math.sqrt(cB[k] / maxC) : 0;          // relative to this memory's own most-walked place
    const mineK = maxO > 0 ? Math.sqrt(oB[k] / maxO) : 0;
    const n = (Math.sin(ix * 0.21 + 1.3) * Math.cos(iz * 0.17 + 0.4) + Math.sin(ix * 0.057 + iz * 0.043)) * 0.5;
    const h = -GROOVE * worn + NOISE * n + RIM * sm(RIM_FROM, H2 + 2, rr);   // the rim frames the ground and fixes its scale
    hts[k] = h; if (h < minH) minH = h; if (h > maxH) maxH = h;
    // ground colour: dark slate, paler where worn, warm where this run walked
    const base = 0.105 + 0.02 * n, c = k * 3;
    cls[c] = base + 0.22 * worn + 0.20 * mineK;
    cls[c + 1] = base + 0.005 + 0.19 * worn + 0.12 * mineK;
    cls[c + 2] = base + 0.03 + 0.17 * worn + 0.02 * mineK;
  }
  return { G, SZ, H2, hts, cls, minH, maxH, count: cB, maxCount: maxC };
}

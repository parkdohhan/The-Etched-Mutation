/**
 * Words that remain (2026-11-28, branch space-remain) — the rules, with no screen in them.
 * Record: docs/우주무대_남는말_실험-261128.md
 *
 * A PREVIEW. Nothing here touches the database: what a walk leaves is kept in this browser (localStorage), so the
 * memory that stands in the archive is not altered. "The next person" is this same browser, opened with ?next=1.
 *
 * DEFINITIONS (order: primitives → same → different → quantity → refutation; CLAUDE.md §3.10)
 *   primitives   scene · sentence (a scene's text cut by room.js sentences) · line (one thing the walker said to a scene)
 *                · reading (the classifier's answer for a text: an emotion vector on the memory's axes, a blame
 *                direction, a core fear) · blank (one of the three sentences filled in before entering)
 *   before       the walker before entering = the three blanks' readings taken together:
 *                blame = the direction named most often among the three (a tie → the earlier blank's), fear likewise,
 *                emotion = the mean of the three vectors.
 *   same         a line is the same as "before" in blame when its blame direction equals before's (both known);
 *                the same in fear likewise. These are equalities of names — reflexive, symmetric, transitive.
 *   nearer       of two lines, the one that is the same in blame is nearer; if both or neither, the one that is the
 *                same in fear; if still level, the one whose emotion vector has the larger cosine with before's.
 *                (The cosine is the ruler doors are measured with. No threshold anywhere.)
 *   remains      in each scene the walker spoke in, its nearest line is that scene's candidate. The scenes are put in
 *                order by their candidates (nearer first); the first half of them (rounded up) keep their candidate.
 *                Every other line goes out. "Half" is a count, not a threshold — and it is a free choice of this
 *                preview (stated, not derived).
 *   changed      a scene whose candidate remains: the candidate stands where one of the scene's sentences stood.
 *                Which sentence, and the seam, come from the server (remain-turn "weave"); if it does not answer, the
 *                sentence sharing the most letter pairs with the line (none shared → the scene's last sentence).
 *   refuted by   a walker all of whose lines are the same as "before" in blame and of whom a line that is NOT the
 *                nearest of its scene remains.
 *
 * KNOWN LIMIT (the classifier's, supabase/functions/claude-scene — not built for this): its blame direction is defined
 * for the speaker ("my fault / someone else's / nobody's"), not for who in the story is held to account. Measured on one
 * real walk of UNDW-001 (33 lines, 261128): lines blaming the mother were read "someone else's" 4 of 4; lines blaming the
 * narrator were read "my fault" in some places and "someone else's" in others; and of 10 sentences said twice in the
 * same scene, 2 were read differently the second time. So "the same in blame" is a noisy sameness, and the cosine does
 * part of the work. A reading of who IN THE STORY a line blames (narrator / another / no one) does not exist yet.
 */

export const BLAME = ['self_blame', 'other_blame', 'fate_blame'];
export const FEAR = ['abandonment', 'death', 'rejection', 'failure'];

/** The three blanks, per memory (drafts — the author's to rewrite). `___` is the place to write in. */
export const BLANKS = {
  'UNDW-001': {
    ko: ['받지 않은 전화가 있다. 그건 ___ 때문이었다.', '엄마가 집에 안 오는 날이면 나는 ___.', '___한테는 끝내 말하지 못했다.'],
    en: ['There is a call I did not answer. It was because of ___.', 'On the nights my mother did not come home, I ___.', 'I never did tell ___.'],
  },
  default: {
    ko: ['아직도 누구 탓인지 모르겠는 일이 있다. 아마 ___ 탓이다.', '혼자 남는 밤이면 나는 ___.', '___한테는 끝내 말하지 못했다.'],
    en: ['There is something I still cannot lay at anyone\'s door. Probably ___.', 'On the nights I am left alone, I ___.', 'I never did tell ___.'],
  },
};
export const HOLE = '___';
export const blanksFor = (code, lang) => (BLANKS[code] || BLANKS.default)[lang === 'en' ? 'en' : 'ko'];

// ── small vector helpers (objects keyed by axis) ───────────────────────────────
const num = (x) => Number(x) || 0;
export function cosObj(a, b) {
  let d = 0, na = 0, nb = 0;
  for (const k of new Set(Object.keys(a || {}).concat(Object.keys(b || {})))) { const x = num(a && a[k]), y = num(b && b[k]); d += x * y; na += x * x; nb += y * y; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
export function meanObj(list) {
  const out = {}, n = list.length || 1;
  for (const e of list) for (const k in e) out[k] = (out[k] || 0) + num(e[k]) / n;
  return out;
}
const known = (name, set) => (set.includes(name) ? name : null);

// ── before entering ────────────────────────────────────────────────────────────
/** @param readings [{ base: {axis: value}, reason_analysis: { attribution, core_fear } } | null] in the blanks' order */
export function beforeOf(readings) {
  const got = (readings || []).filter(Boolean);
  const most = (names) => { const c = new Map(); let best = null, bn = 0; for (const n of names) { if (!n) continue; const v = (c.get(n) || 0) + 1; c.set(n, v); if (v > bn) { bn = v; best = n; } } return best; };   // a tie keeps the earlier one (it reached the count first)
  return {
    blame: most(got.map((r) => known(r.reason_analysis && r.reason_analysis.attribution, BLAME))),
    fear: most(got.map((r) => known(r.reason_analysis && r.reason_analysis.core_fear, FEAR))),
    emo: meanObj(got.map((r) => r.base || {})),
    read: got.length,
  };
}

// ── which lines remain ─────────────────────────────────────────────────────────
function rank(line, before) {
  return [before.blame && line.blame === before.blame ? 1 : 0, before.fear && line.fear === before.fear ? 1 : 0, line.emo ? cosObj(line.emo, before.emo) : -2];
}
const nearer = (a, b) => (b.r[0] - a.r[0]) || (b.r[1] - a.r[1]) || (b.r[2] - a.r[2]) || (a.i - b.i);

/**
 * @param lines  [{ order, raw, emo, blame, fear }] in the order they were said
 * @param before beforeOf()
 * @param o      { random?: () => number }  — given, the lines are chosen by chance instead (the author's first idea, kept for comparison)
 * @returns Set of indices into `lines` that remain
 */
export function remaining(lines, before, o) {
  const byScene = new Map();
  lines.forEach((l, i) => { if (!l || !String(l.raw || '').trim()) return; if (!byScene.has(l.order)) byScene.set(l.order, []); byScene.get(l.order).push({ i, r: rank(l, before) }); });
  const heads = [];
  for (const list of byScene.values()) {
    if (o && o.random) heads.push(Object.assign({}, list[Math.floor(o.random() * list.length)], { r: [0, 0, o.random()] }));
    else heads.push(list.slice().sort(nearer)[0]);
  }
  heads.sort(nearer);
  return new Set(heads.slice(0, Math.ceil(heads.length / 2)).map((h) => h.i));
}

// ── the seam ───────────────────────────────────────────────────────────────────
const bare = (s) => String(s || '').toLowerCase().replace(/[\s.,!?…"'“”‘’·\-—()~]+/g, '');
function pairs(s) { const t = bare(s), m = new Map(); for (let i = 0; i + 1 < t.length; i++) { const p = t.slice(i, i + 2); m.set(p, (m.get(p) || 0) + 1); } return m; }
/** How much two texts share, by letter pairs (0 nothing … 1 the same letters). */
export function alike(a, b) {
  const A = pairs(a), B = pairs(b); let both = 0, na = 0, nb = 0;
  for (const v of A.values()) na += v; for (const v of B.values()) nb += v;
  for (const [p, v] of A) both += Math.min(v, B.get(p) || 0);
  return na + nb ? (2 * both) / (na + nb) : 0;
}
export const closedLine = (s) => { const t = String(s || '').trim(); return /[.!?…]["”’']?$/.test(t) ? t : t + '.'; };

/** Without the server: the sentence that shares the most with the line; none shared → the last sentence. */
export function placeLocal(sentenceList, raw) {
  let best = sentenceList.length - 1, bs = 0;
  sentenceList.forEach((s, i) => { const a = alike(s, raw); if (a > bs) { bs = a; best = i; } });
  return { index: best, text: closedLine(raw), by: 'local' };
}
/**
 * The server's answer is taken only as a seam: if what it returns no longer shares most of its letters with what
 * the walker said, the walker's own words stand instead (closed with a mark). 0.6 is a guard, not a judgement —
 * it only decides whose spelling is shown; the sentence that is displaced is the server's either way.
 */
export function placeServer(sentenceList, raw, answer) {
  if (!answer || !(answer.index >= 0 && answer.index < sentenceList.length)) return placeLocal(sentenceList, raw);
  const fitted = String(answer.text || '').trim();
  return { index: answer.index, text: fitted && alike(fitted, raw) >= 0.6 ? closedLine(fitted) : closedLine(raw), by: 'server' };
}
export function withChange(sentenceList, index, text) { const s = sentenceList.slice(); s[index] = text; return s.join(' '); }

// ── a changed scene stands elsewhere ───────────────────────────────────────────
/**
 * A scene one of whose n sentences is now the walker's leans, by 1/n, toward what that line carried. The piece is moved
 * by the same form the walker's model uses for its singularity (topo.js δ): with d = the change of the scene's own
 * direction, it shifts toward the scenes whose own emotion d points at.
 * @returns [x,y,z] in world units (the same units as the walker's model)
 */
export function pieceShift(acc, sceneId, lineEmo, nSentences, TOPO) {
  const own = acc.own.get(sceneId), here = acc.pos.get(sceneId);
  if (!own || !here || !lineEmo) return [0, 0, 0];
  const v = acc.axes.map((k) => num(lineEmo[k])), vn = Math.hypot(...v); if (vn < 1e-9) return [0, 0, 0];
  const n = Math.max(1, nSentences), mix = own.map((x, i) => x * (n - 1) / n + (v[i] / vn) / n), mn = Math.hypot(...mix) || 1;
  const d = mix.map((x, i) => x / mn - own[i]), dl = Math.hypot(...d);
  let w = 0; const s = [0, 0, 0];
  for (const [k, ok] of acc.own) {
    if (!ok || k === sceneId) continue;
    const pk = acc.pos.get(k); if (!pk) continue;
    const c = d.reduce((t, x, i) => t + x * ok[i], 0);
    w += Math.abs(c); s[0] += c * (pk[0] - here[0]); s[1] += c * (pk[1] - here[1]) * TOPO.Y; s[2] += c * (pk[2] - here[2]);
  }
  if (w < 1e-9) return [0, 0, 0];
  const g = TOPO.G * Math.min(1, dl) * TOPO.L;
  return s.map((x) => (x / w) * g);
}

// ── what this browser keeps ────────────────────────────────────────────────────
const keyOf = (code) => 'tem_remain:' + code;
export function load(code) { try { const s = JSON.parse(localStorage.getItem(keyOf(code)) || 'null'); return s && s.v === 1 ? s : null; } catch (_) { return null; } }
export function save(code, state) { try { localStorage.setItem(keyOf(code), JSON.stringify(state)); return true; } catch (_) { return false; } }
export function clear(code) { try { localStorage.removeItem(keyOf(code)); } catch (_) {} }
export const fresh = (code) => ({ v: 1, code, texts: {}, walks: [], locked: false, outside: null });
/** The scene's text as the next person reads it: what the walks before left, or the text as written. */
export const textOf = (state, scene) => { const t = state && state.texts && state.texts[scene.scene_order]; return typeof t === 'string' && t.trim() ? t : scene.text; };
/** A mark of the texts as they stand (to know whether the outside view was written for this state). */
export function stamp(state) { let h = 2166136261; const s = JSON.stringify(state.texts || {}); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/**
 * Words that remain (2026-11-28, branch space-remain) — the rules, with no screen in them.
 * Record: docs/우주무대_남는말_실험-261128.md
 *
 * A PREVIEW. Nothing here touches the database: what a walk leaves is kept in this browser (localStorage), so the
 * memory that stands in the archive is not altered. "The next person" is this same browser, opened with ?next=1.
 *
 * DEFINITIONS, second version (author, 261128 evening: "only the worst ones, or only the ones that have to do with the
 * first three questions — two or three at most"). Order: primitives → same → different → quantity → refutation (CLAUDE.md §3.10).
 *   primitives   scene · sentence (a scene's text cut by room.js sentences) · line (one thing the walker said to a scene)
 *                · blank (one of the three sentences the walker filled in about themselves before entering)
 *                · the reading of a line (remain-turn "judge"; a model's reading, taken as given):
 *                    whom  who in the story the line holds to account: narrator · other · nobody (it speaks of fault and
 *                          lays it on no one) · none (it is not about fault at all)
 *                    back  the one blank whose matter the line shares, or none (−1)
 *                · the emotion reading of a text (the stage's classifier: a vector on the memory's axes)
 *   same         a line and a blank are the same matter when the line's `back` names that blank.
 *                (An equality read off one name per line: a line is the same matter as at most one blank.)
 *   different    not the same.
 *   speaks of fault   whom is narrator, other or nobody. (A question of plain fact does not.)
 *   turns back   a line turns back on a blank when it is the same matter as the blank AND speaks of fault:
 *                the walker said, of the person in the scene, something about fault in the very matter they wrote of in themselves.
 *   before       of two lines that turn back on the same blank, the one that holds the narrator to account comes before
 *                the one that holds another, and that before the one that lays it on nobody; if level, the one whose
 *                emotion vector has the larger cosine with that blank's own; if still level, the one said earlier.
 *                (The order narrator → other → nobody is a free choice of this preview: stated, not derived.)
 *   remains      for each blank in turn, the first line (in that order) that turns back on it and whose scene does not
 *                already hold a remaining line. So: at most one line a blank — at most three — and at most one a scene.
 *                A walker none of whose lines turns back on a blank leaves nothing.
 *                quantity: 0 … 3. 0 = nothing the walker said of the scenes was about fault in a matter they had written of themselves.
 *   changed      a scene that holds a remaining line: the line stands where one of the scene's sentences stood — whoever
 *                wrote that sentence, the author or an earlier walker (author, 261128: "walkers' sentences are displaced too").
 *                It does not stand as it was said: the server rewrites it as a sentence of that text (the narrator's voice and
 *                person, the text's manner — the same claim) and names the sentence it displaces (remain-turn "weave"). If the
 *                server does not answer, the line stands as said, in the place of the sentence sharing the most letter pairs
 *                with it (none shared → the scene's last sentence).
 *   refuted by   a line that remains although its `back` is −1 or its `whom` is none; or two remaining lines of one blank.
 *
 * THIRD VERSION (author, 261129: "take the second condition out"). On five real walks the second condition (the same matter
 * as a blank) threw out 7 of 8 lines that held the narrator to account. Now:
 *   remains      a line that speaks of fault. Of those: the one that holds the narrator to account before the one that holds
 *                another, that before the one that lays it on nobody; if level, the one said earlier. Taken in that order,
 *                at most one a scene, three at most (MOST: a free choice — it was the number of blanks).
 *                quantity: 0 … 3. 0 = nothing the walker said was about fault.
 *   refuted by   a line that remains although its `whom` is none; two remaining lines of one scene; a fourth.
 * `back` is still read and kept (the ending lights the blank a remaining line shares its matter with, when it has one) — it
 * no longer decides what remains. The second version is still here: remaining(lines, before, { byBlank: true }) — the stage's ?pick=blanks.
 *
 * The first version (the stage's own classifier: blame direction and core fear, half of the scenes kept) is in the
 * record, §이력. It kept 5 of 33 lines on a real walk; its blame direction is the speaker's, not the story's, and read
 * the same sentence two ways 2 times in 10.
 */

export const WHOM = ['narrator', 'other', 'nobody', 'none'];

/** The three blanks, per memory (drafts — the author's to rewrite). `___` is the place to write in. */
export const BLANKS = {
  'UNDW-001': {
    ko: ['받지 않은 전화가 있다. 그건 ___ 때문이었다.', '엄마가 집에 안 오는 날이면 나는 ___.', '___한테는 끝내 말하지 못했다.'],
    en: ['There is a call I did not answer. It was because of ___.', "On days Mom didn't come home, I ___.", 'I never did tell ___.'],   // the second = the archive's sentence for the English copy, word for word (the two are told apart by being the same string)
  },
  default: {
    ko: ['아직도 누구 탓인지 모르겠는 일이 있다. 아마 ___ 탓이다.', '혼자 남는 밤이면 나는 ___.', '___한테는 끝내 말하지 못했다.'],
    en: ['There is something I still cannot lay at anyone\'s door. Probably ___.', 'On the nights I am left alone, I ___.', 'I never did tell ___.'],
  },
};
BLANKS['UNDW-001-EN'] = BLANKS['UNDW-001'];   // 261129 (author: "make the English one the same as the Korean"): the English copy is walked on this stage too
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

// ── before entering ────────────────────────────────────────────────────────────
/** @param readings [{ base: {axis: value} } | null] the emotion reading of each blank, in the blanks' order (null = not read) */
export function beforeOf(readings) {
  const list = (readings || []).map((r) => ({ emo: r && r.base ? r.base : null }));
  return { blanks: list, read: list.filter((b) => b.emo).length };
}

// ── which lines remain ─────────────────────────────────────────────────────────
const FAULT = { narrator: 3, other: 2, nobody: 1 };                    // whom → its place in the order; `none` has none
export const speaksOfFault = (line) => !!(line && FAULT[line.whom]);
export const turnsBack = (line, b) => !!(line && line.back === b && FAULT[line.whom]);

/**
 * @param lines  [{ order, raw, whom, back, emo } | null] in the order they were said (null = a line that cannot remain)
 * @param before beforeOf()
 * @param o      { random?: () => number } — given, three lines of three scenes are taken by chance instead (the author's first idea, kept for comparison)
 * @returns Set of indices into `lines` that remain (0 … 3)
 */
export const MOST = 3;
export function remaining(lines, before, o) {
  const keep = new Set(), scenes = new Set(), nBlanks = (before && before.blanks ? before.blanks.length : 3);
  if (o && o.random) {
    const pool = lines.map((l, i) => ({ l, i, r: 0 })).filter((x) => x.l && String(x.l.raw || '').trim());
    pool.forEach((x) => { x.r = o.random(); }); pool.sort((a, b) => a.r - b.r);
    for (const x of pool) { if (keep.size >= nBlanks) break; if (scenes.has(x.l.order)) continue; keep.add(x.i); scenes.add(x.l.order); }
    return keep;
  }
  if (!(o && o.byBlank)) {                                             // third version: whatever speaks of fault
    const cand = [];
    lines.forEach((l, i) => { if (speaksOfFault(l) && String(l.raw || '').trim()) cand.push({ i, l, f: FAULT[l.whom] }); });
    cand.sort((x, y) => (y.f - x.f) || (x.i - y.i));
    for (const x of cand) { if (keep.size >= MOST) break; if (scenes.has(x.l.order)) continue; keep.add(x.i); scenes.add(x.l.order); }
    return keep;
  }
  for (let b = 0; b < nBlanks; b++) {
    const own = before && before.blanks && before.blanks[b] ? before.blanks[b].emo : null;
    const cand = [];
    lines.forEach((l, i) => { if (turnsBack(l, b) && String(l.raw || '').trim()) cand.push({ i, l, f: FAULT[l.whom], c: l.emo && own ? cosObj(l.emo, own) : 0 }); });
    cand.sort((x, y) => (y.f - x.f) || (y.c - x.c) || (x.i - y.i));
    const first = cand.find((x) => !scenes.has(x.l.order));
    if (first) { keep.add(first.i); scenes.add(first.l.order); }
  }
  return keep;
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
 * The server rewrites the line as a sentence of the scene's text — the narrator's voice and person, the text's manner,
 * spelling and particles made right (author, 261128 night: "it borrows the walker's words too literally"). What it returns
 * stands, unless it is empty or has run to more than twice the length of what the walker said plus a few letters — then
 * the walker's own words stand (closed with a mark). The bound is a guard against a runaway answer, not a judgement.
 * (First version: only a seam was allowed — the answer was dropped unless it shared six tenths of its letter pairs with the line.)
 */
export function placeServer(sentenceList, raw, answer) {
  if (!answer || !(answer.index >= 0 && answer.index < sentenceList.length)) return placeLocal(sentenceList, raw);
  const fitted = String(answer.text || '').trim(), ok = fitted && fitted.length <= String(raw).trim().length * 2 + 12;
  return { index: answer.index, text: ok ? closedLine(fitted) : closedLine(raw), by: ok ? 'server' : 'server-place' };
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
// Two shelves in this browser: the real walk's own record (and its lock), and the practice walks' (preview: ?as=test). They never touch.
export const STORE = { kept: 'tem_remained:', test: 'tem_remain_test:' };   // (the kept shelf is not 'tem_remain:' — the first preview used that name)
const keyOf = (code, prefix) => (prefix || STORE.kept) + code;
export function load(code, prefix) { try { const s = JSON.parse(localStorage.getItem(keyOf(code, prefix)) || 'null'); return s && s.v === 1 ? s : null; } catch (_) { return null; } }
export function save(code, state, prefix) { try { localStorage.setItem(keyOf(code, prefix), JSON.stringify(state)); return true; } catch (_) { return false; } }
export function clear(code, prefix) { try { localStorage.removeItem(keyOf(code, prefix)); } catch (_) {} }
export const fresh = (code) => ({ v: 1, code, texts: {}, walks: [], locked: false, outside: null });
/** The scene's text as the next person reads it: what the walks before left, or the text as written. */
export const textOf = (state, scene) => { const t = state && state.texts && state.texts[scene.scene_order]; return typeof t === 'string' && t.trim() ? t : scene.text; };
/** A mark of the texts as they stand (to know whether the outside view was written for this state). */
export function stamp(state) { let h = 2166136261; const s = JSON.stringify(state.texts || {}); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

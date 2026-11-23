/**
 * Space-blank — the hole a mismatch leaves, and what it does to a text (2026-11-23; an experiment on its own branch).
 * Decision record: docs/우주무대_빈칸_실험-261123.md
 *
 *   · Back at a scene, the text that stands now is laid against what the walker read there. Where a line is
 *     not the same, one word of it goes out and a hole stays: [   ]. Nobody says which telling was right.
 *   · Leaving, the hole comes loose and follows the walker. One at a time; it is not kept in any list.
 *   · Held against any word of another scene's text — the walker chooses which — that word goes out. The walker
 *     does not write in it: what they said back where the hole was made comes into the place by itself.
 *   · From then on, in this walk, that word stands changed wherever the memory has it.
 *
 * Everything here is letters laid against letters: no model, no judgement, no threshold. The grammar rules
 * (which token is a noun with a particle) are surface rules and will be wrong sometimes; a counter-example
 * goes into the lists below.
 */
import { typeText } from '../roomplay/room.js';

export const HOLE = '[   ]';            // unbroken spaces: it is one token and never wraps
// A word that came into a text in this walk is wrapped in a letter that has no width (word joiner = the walker's own,
// zero-width no-break space = an earlier walker's), so that it is known as a changed word wherever the text is read
// again — and a word the text had of its own, even the same word, is never taken for one.
const MK = { mine: '⁠', other: '﻿' };
const MK_RE = /[⁠﻿]/g;
export const mark = (owner, stem) => (MK[owner] || '') + stem + (MK[owner] || '');
export const plain = (t) => String(t == null ? '' : t).replace(MK_RE, '');
/** The word a token carries if it came in this walk: { stem, owner } | null */
function markedOf(core) {
  const m = String(core).match(/^([⁠﻿])(.+?)\1(.*)$/);
  return m ? { stem: m[2], owner: m[1] === MK.mine ? 'mine' : 'other', rest: m[3] } : null;
}

// ── letters ─────────────────────────────────────────────────────────────────
const h01 = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const isHangul = (ch) => { const c = (ch || '').charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3; };
const jong = (ch) => (isHangul(ch) ? (ch.charCodeAt(0) - 0xac00) % 28 : -1);   // 0 = open syllable · 8 = ㄹ
export const normLine = (l) => plain(l).replace(/[\s.!?…"“”'’]+$/g, '').replace(/\s+/g, ' ').trim();

/** A token of a line: what stands before the word, the word, what stands after it. */
export function splitToken(tok) {
  if (tok.indexOf(HOLE) >= 0) { const i = tok.indexOf(HOLE); return { lead: tok.slice(0, i), core: HOLE, tail: tok.slice(i + HOLE.length), hole: true }; }
  const m = String(tok).match(/^([“"'‘(]*)([\s\S]*?)([.,!?…"”'’)~]*)$/);
  return { lead: m[1], core: m[2], tail: m[3], hole: false };
}
export const tokensOf = (line) => String(line).split(/ +/).filter(Boolean).map(splitToken);
const coresOf = (line) => tokensOf(line).map((t) => plain(t.core)).filter((c) => c && c !== HOLE);

// ── particles (Korean) ──────────────────────────────────────────────────────
const JOSA = ['에게서', '한테서', '으로', '에서', '에게', '한테', '까지', '부터', '처럼', '이', '가', '을', '를', '은', '는', '의', '에', '로', '와', '과', '도', '만'];
const FIRM = new Set(['에게서', '한테서', '으로', '에서', '에게', '한테', '까지', '부터', '처럼', '이', '가', '을', '를', '의', '에', '로', '와', '과']);   // a token ending on one of these is taken for a noun
const FITS = { '이': (c) => c > 0, '가': (c) => c === 0, '을': (c) => c > 0, '를': (c) => c === 0, '은': (c) => c > 0, '는': (c) => c === 0, '과': (c) => c > 0, '와': (c) => c === 0, '으로': (c) => c > 0 && c !== 8, '로': (c) => c === 0 || c === 8 };
const PAIR = { '이': ['이', '가'], '가': ['이', '가'], '을': ['을', '를'], '를': ['을', '를'], '은': ['은', '는'], '는': ['은', '는'], '과': ['과', '와'], '와': ['과', '와'] };
// stems that are not a thing one could take out of a telling: pronouns, time and reason words, adverbs that only look like noun + particle
const NOT_NOUN = new Set(['나', '너', '저', '내', '네', '제', '우리', '그것', '이것', '저것', '그거', '이거', '여기', '거기', '저기', '무엇', '누구', '어디', '언제', '자신', '때문', '대신', '나중', '다음', '이후', '이전', '동안', '사이', '하나', '그때', '이때', '정도', '경우', '처음', '마지막', '이번', '저번', '오늘', '어제', '내일', '지금', '아까', '방금', '이제', '아직', '벌써', '정말', '진짜', '그냥', '조금', '너무', '아주', '거의', '가끔', '항상', '매일', '모두', '전부', '서로', '스스', '함부', '저절', '억지', '때', '일일', '나날', '가까', '깨끗', '어린', '반드시', '정확', '선명', '한번', '한 번']);
const PRON = new Set(['나', '너', '내', '네', '그', '이', '저', '제', '뭐', '누', '것', '곳', '밤', '낮', '집', '물', '피', '눈', '손', '발', '꿈', '말', '몸', '숨', '땅', '길', '문', '벽', '빛', '불', '방', '잠', '삶', '책', '옷', '약', '힘']);   // a one-syllable stem that may still be a thing (the memory's own names count too)
const NOT_WHOLE = new Set(['하지만', '그대로', '제대로', '절대로', '정말로', '실제로', '대체로', '그러니까', '그런데도', '그래도', '아직도', '너무도', '무엇보다', '이미', '어느새']);
function splitJosaIn(core, list) {
  if (NOT_WHOLE.has(core)) return null;
  for (const j of JOSA) {
    if (list && !list.has(j)) continue;
    if (core.length <= j.length || !core.endsWith(j)) continue;
    const stem = core.slice(0, -j.length), last = stem.slice(-1);
    if (!isHangul(last)) continue;
    const fit = FITS[j]; if (fit && !fit(jong(last))) continue;
    if (jong(last) === 20) continue;                                 // 않았을 · 죽었을 (a past stem, not a noun)
    if (j === '가' && last === '다') continue;                       // ~다가
    if (j === '로' && (last === '므' || last === '대' || last === '기')) continue;   // ~므로 · ~대로 · 믿기로
    if (j === '와' && /[어아여워와]$/.test(stem)) continue;           // 들어와 · 돌아와
    if (j === '도' && /[어아여해도고서]$/.test(stem)) continue;       // ~어도 · ~고도
    if (j === '만' && /[지다]$/.test(stem)) continue;                 // ~지만 · ~다만
    return { stem, josa: j };
  }
  return null;
}
export const splitJosa = (core) => splitJosaIn(core, null);
/** The particle a new word takes in the old one's place: 엄마를 → 욕조를 · 서랍을. */
export function fitJosa(josa, stem) {
  const pair = PAIR[josa], c = jong(String(stem).slice(-1));
  if (josa === '으로' || josa === '로') return c < 0 ? josa : (c > 0 && c !== 8 ? '으로' : '로');
  if (!pair || c < 0) return josa;
  return c > 0 ? pair[0] : pair[1];
}

// ── which words can be taken out, and which word comes in ───────────────────
const EN_STOP = new Set(['that', 'this', 'with', 'from', 'were', 'was', 'have', 'been', 'what', 'when', 'where', 'they', 'them', 'then', 'there', 'their', 'into', 'like', 'just', 'still', 'would', 'could', 'should', 'about', 'because', 'while', 'again', 'only', 'even', 'ever', 'never', 'always', 'every', 'here', 'your', 'mine', 'does', 'didn', 'doesn', 'will', 'more', 'than', 'very', 'some', 'much', 'such', 'over', 'under', 'after', 'before', 'once', 'same', 'half', 'something', 'someone', 'nothing', 'anything', 'instead', 'already', 'myself', 'herself', 'himself', 'itself']);
const VERBY = /(다|요|어|아|지|네|까|죠|야|고|서|게|면|데|며|나|니|라|자|래|해|돼|써|여|워|봐|줘|져|려|던|한|인|운|은|는|을|를|ㄹ)$/;
/**
 * @param ko      Korean (particles) or not (plain words)
 * @param nouns   words the memory itself names as things (its tags): a one-syllable stem counts only if it is one of these
 */
export function createLexicon(ko, nouns) {
  const known = new Set(Array.from(nouns || []).map((w) => String(w).trim()).filter(Boolean));
  /** A word that names a thing (noun + particle, or one of the memory's own names) → { stem, josa } | null. Used to choose where a hole opens when the lines give no partner. */
  function nounish(core) {
    if (!core || core === HOLE || markedOf(core)) return null;
    if (!ko) return (/^[A-Za-z][A-Za-z'’-]{3,}$/.test(core) && !EN_STOP.has(core.toLowerCase())) ? { stem: core, josa: '' } : null;
    const sp = splitJosaIn(core, FIRM);
    if (sp) {
      if (NOT_NOUN.has(sp.stem)) return null;
      if (sp.stem.length >= 2 || known.has(sp.stem)) return sp;
      return null;
    }
    return known.has(core) ? { stem: core, josa: '' } : null;
  }
  /**
   * Any word of a text can take the hole (author, 261123: "not where it is assigned — where I want to put it").
   * → { stem, josa }: the word goes out, a particle it carries stays (엄마를 → [   ]를 → 욕조를). A word that came in
   * this walk, and the hole itself, do not.
   */
  function pressable(core) {
    if (!core || core === HOLE) return null;
    const mk = markedOf(core);
    if (mk) return mk.owner === 'mine' ? null : { stem: mk.stem, josa: mk.rest };   // a word an earlier walker put in can go out again; one this walker put in cannot
    if (!ko) return /[A-Za-z]/.test(core) ? { stem: core, josa: '' } : null;
    const sp = splitJosa(core);
    if (sp && sp.stem.length === 1 && !known.has(sp.stem) && !PRON.has(sp.stem)) return { stem: core, josa: '' };   // 오는 · 가는 · 보는: one syllable before 는 is a verb, not a thing — the whole word goes
    return sp || { stem: core, josa: '' };
  }
  /** The word of what was said that can stand in a text: [{ stem, score }], best first. Nothing is made up — a word the speaker used, its particle taken off. */
  function wordsOf(lines) {
    const out = [];
    (lines || []).forEach((line, li) => tokensOf(line).forEach((t, ti) => {
      const core = t.core; if (!core || core === HOLE) return;
      if (!ko) { if (/^[A-Za-z][A-Za-z'’-]{3,}$/.test(core) && !EN_STOP.has(core.toLowerCase())) out.push({ stem: core, score: 1 + Math.min(core.length, 12) / 100, at: li * 100 + ti }); return; }
      const sp = splitJosa(core);
      if (sp) {
        if (NOT_NOUN.has(sp.stem) || (sp.stem.length < 2 && !known.has(sp.stem))) return;
        if (!FIRM.has(sp.josa) && VERBY.test(sp.stem) && !known.has(sp.stem)) return;   // 기다리는 · 가도
        out.push({ stem: sp.stem, score: known.has(sp.stem) ? 4 : FIRM.has(sp.josa) ? 3 : 2, at: li * 100 + ti });
      } else if (known.has(core)) out.push({ stem: core, score: 4, at: li * 100 + ti });
      else if (core.length >= 2 && isHangul(core.slice(-1)) && !VERBY.test(core) && !NOT_NOUN.has(core) && !NOT_WHOLE.has(core)) out.push({ stem: core, score: 1, at: li * 100 + ti });   // a bare word: 엄마 보고 싶어
    }));
    return out.sort((a, b) => (b.score - a.score) || (a.at - b.at));
  }
  return { pressable, nounish, wordsOf, ko };
}

/** The word a held hole brings: the walker's own from the stay it was made in, else an earlier walker's there, else none (the place stays empty). */
export function fillOf(lex, held, not) {
  const skip = new Set([not].filter(Boolean));
  const mine = lex.wordsOf(held.said).find((w) => !skip.has(w.stem));
  if (mine) return { stem: mine.stem, owner: 'mine' };
  const other = lex.wordsOf(held.others).find((w) => !skip.has(w.stem));
  return other ? { stem: other.stem, owner: 'other' } : null;
}

// ── the mismatch ────────────────────────────────────────────────────────────
/**
 * Same = two lines are the same when they read the same without their end marks (normLine).
 * Mismatch at a return = a line stands now that is not the same as any line the walker read here.
 * The hole: the first such line that has a partner among the lines read last time and no longer standing
 * (the one sharing most words with it) loses the first word the partner did not have; if no line has a
 * partner (a line was put in, not rewritten), the first such line loses its first noun, or its longest word.
 * @param now   the lines standing now   @param seen  Set(normLine) of every line read here before
 * @param last  the lines read here last time   @param own   (line) → whose it is
 * @returns { line, tok, word, was } | null
 */
export function findHole(now, seen, last, own, lex) {
  const fresh = [];
  now.forEach((l, i) => { if (!seen.has(normLine(l)) && own(l) !== 'mine' && l.indexOf(HOLE) < 0) fresh.push(i); });
  if (!fresh.length) return null;
  const nowSet = new Set(now.map(normLine)), lost = (last || []).filter((l) => !nowSet.has(normLine(l)));
  for (const i of fresh) {
    const toks = tokensOf(now[i]), cores = toks.map((t) => plain(t.core)), cs = new Set(cores);
    let best = null, bs = 0;
    for (const l of lost) { const n = coresOf(l).filter((c) => cs.has(c)).length; if (n > bs) { bs = n; best = l; } }
    if (!best) continue;
    const old = coresOf(best), os = new Set(old), k = cores.findIndex((c) => c && !os.has(c));
    if (k >= 0) return { line: i, tok: k, word: cores[k], was: (old.length === cores.length && old[k] && !cs.has(old[k])) ? old[k] : null };   // the word read in that very place, when the line kept its length
  }
  for (const i of fresh) { const k = tokensOf(now[i]).findIndex((t) => lex.nounish(t.core)); if (k >= 0) return { line: i, tok: k, word: tokensOf(now[i])[k].core, was: null }; }
  const i = fresh[0], cores = tokensOf(now[i]).map((t) => (markedOf(t.core) ? '' : t.core));
  let k = -1; cores.forEach((c, j) => { if (c && (k < 0 || c.length > cores[k].length)) k = j; });
  return k < 0 ? null : { line: i, tok: k, word: cores[k], was: null };
}

// ── a text after words were taken out of it ─────────────────────────────────
/** swaps: [{ old, neu, owner }] — every token whose word is `old` reads `neu` (its particle fitted). `neu` null = the place is empty. */
/** A word changed, then changed again (an earlier walker's word taken out by this one): the last change is what reads. */
function follow(swaps, s) {
  for (let i = 0; i < 4 && s.neu != null; i++) { const n = swaps.find((t) => t !== s && t.old === s.neu); if (!n) break; s = n; }
  return s;
}
export function swapCore(core, swaps) {
  const mk = markedOf(core);
  if (mk && mk.owner === 'mine') return null;                           // a word this walker put in is not swapped again
  for (let s of swaps) {
    if (mk) { if (mk.stem === s.old) { s = follow(swaps, s); return { stem: s.neu, josa: s.neu == null ? '' : fitJosa(mk.rest, s.neu), swap: s }; } continue; }
    if (core === s.old) { s = follow(swaps, s); return { stem: s.neu, josa: '', swap: s }; }
    const sp = splitJosa(core);
    if (sp && sp.stem === s.old) { s = follow(swaps, s); return { stem: s.neu, josa: s.neu == null ? '' : fitJosa(sp.josa, s.neu), swap: s }; }
  }
  return null;
}
/**
 * What earlier walkers changed, as the next walker reads it (author, 261123: "pass it on — for now, three changed → two arrive").
 * Of each earlier run's own changes, KEEP of them stay (ceil(n·KEEP), chosen by a fixed lottery on the run id: the memory
 * keeps most, not all). A word changed twice reads as the later change; a change of a word that itself came in collapses
 * onto the first. Returns swaps with owner 'other'.
 * @param journals [{ run_id, swaps: [{ out, in }] }] oldest first
 */
export const KEEP = 2 / 3;   // free parameter (not a definition)
export function inheritSwaps(journals) {
  const out = [];
  for (const j of journals || []) {
    const own = (j.swaps || []).filter((s) => s && s.out);
    const n = Math.ceil(own.length * KEEP);
    const kept = own.map((s, i) => ({ s, h: h01(j.run_id + ':' + i) })).sort((a, b) => a.h - b.h).slice(0, n).map((x) => x.s);
    for (const s of kept) {
      const neu = s.in == null ? null : String(s.in);
      for (const e of out) if (e.neu != null && e.neu === s.out) e.neu = neu;
      const dup = out.findIndex((e) => e.old === s.out); if (dup >= 0) out.splice(dup, 1);
      out.push({ old: String(s.out), neu, owner: 'other', inherited: true, run: j.run_id });
    }
  }
  return out;
}
export function vary(text, swaps) {
  if (!swaps || !swaps.length || !text) return text;
  return String(text).split(/( +)/).map((part) => {
    if (!part.trim()) return part;
    const t = splitToken(part); if (t.hole) return part;
    const sw = swapCore(t.core, swaps);
    return sw ? t.lead + (sw.stem == null ? HOLE : mark(sw.swap.owner, sw.stem) + sw.josa) + t.tail : part;
  }).join('');
}
/** The holes a scene keeps: the first token that is each fallen word reads as a hole. */
export function withHoles(lines, words) {
  if (!words || !words.length) return lines;
  const left = words.slice();
  return lines.map((l) => String(l).split(/( +)/).map((part) => {
    if (!part.trim() || !left.length) return part;
    const t = splitToken(part), k = left.indexOf(plain(t.core));
    if (k < 0) return part;
    left.splice(k, 1);
    return t.lead + HOLE + t.tail;
  }).join(''));
}
/** A line in pieces, for a text that shows whose each word is: [{ t, who }] (who: '' · 'mine' · 'other' · 'hole'). Read off the marks in the line itself. */
export function segsOf(line) {
  const out = []; let buf = '';
  const flush = () => { if (buf) { out.push({ t: buf, who: '' }); buf = ''; } };
  String(line).split(/( +)/).forEach((part) => {
    if (!part.trim()) { buf += part; return; }
    const t = splitToken(part);
    if (t.hole) { buf += t.lead; flush(); out.push({ t: HOLE, who: 'hole' }); buf += t.tail; return; }
    const mk = markedOf(t.core);
    if (!mk) { buf += plain(part); return; }
    buf += t.lead; flush(); out.push({ t: mk.stem, who: mk.owner }); buf += mk.rest + t.tail;
  });
  flush();
  return out.some((s) => s.who) ? out : null;
}

// ── the text column: a typed line turned into words that can be touched ────
/**
 * @param p      a typed line (<p><span>text</span>…</p>, the room stage's)
 * @param lex    the lexicon
 * @param swaps  words already changed in this walk (they keep their colour)
 */
export function tokenise(p, lex) {
  const holder = p.firstElementChild; if (!holder || holder.dataset.sb) return [];
  const text = holder.textContent;
  holder.textContent = ''; holder.dataset.sb = '1';
  const out = [];
  text.split(/( +)/).forEach((part) => {
    if (!part.trim()) { if (part) holder.appendChild(document.createTextNode(part)); return; }
    const t = splitToken(part), el = document.createElement('span'); el.className = 'sb-t';
    const s = document.createElement('span'), j = document.createElement('span'); s.className = 'sb-s'; j.className = 'sb-j';
    if (t.hole) { s.textContent = HOLE; s.classList.add('sb-hole'); el.classList.add('sb-holed'); }
    else {
      const mk = markedOf(t.core), can = lex.pressable(t.core);          // (pressable refuses the hole and a word this walker put in)
      const cut = mk ? { stem: mk.stem, josa: mk.rest } : (can || { stem: t.core, josa: '' });
      s.textContent = cut.stem; j.textContent = cut.josa;
      if (mk) s.classList.add(mk.owner === 'mine' ? 'sb-mine' : 'sb-other');
      if (can) el.classList.add('sb-can');
    }
    if (t.lead) el.appendChild(document.createTextNode(t.lead));
    el.appendChild(s); el.appendChild(j);
    if (t.tail) el.appendChild(document.createTextNode(t.tail));
    holder.appendChild(el); out.push(el);
  });
  return out;
}
/** The line as it reads now — with a changed word marked (so the ending, and a later reading, know it came in). */
export function lineText(p) {
  const h = p.firstElementChild; if (!h) return '';
  if (!h.dataset.sb) return h.textContent;
  let out = '';
  for (const node of h.childNodes) {
    if (node.nodeType === 3) { out += node.textContent; continue; }
    const s = node.querySelector('.sb-s'), j = node.querySelector('.sb-j');
    if (!s) { out += node.textContent; continue; }
    const owner = s.classList.contains('sb-mine') ? 'mine' : s.classList.contains('sb-other') ? 'other' : null;
    for (const c of node.childNodes) {
      if (c === s) out += owner && !s.classList.contains('sb-hole') ? mark(owner, s.textContent) : s.textContent;
      else if (c === j) out += j.textContent;
      else out += c.textContent;
    }
  }
  return out;
}

export function createTyping(pace, voice) {                                // voice: a tap for each letter typed in (261124; none for letters taken out)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (pace || 1)));
  async function back(el, per) { while (el.textContent.length) { el.textContent = Array.from(el.textContent).slice(0, -1).join(''); await sleep(per || 70); } }
  async function type(el, text, per) { for (const ch of Array.from(text)) { el.textContent += ch; if (voice) voice(ch); await sleep(per || 85); } }
  /** A word goes out of a line and a hole stays. `was` = the word the walker read in its place before: it is typed once more, and goes too. */
  async function fall(tok, was) {
    const s = tok.querySelector('.sb-s'), j = tok.querySelector('.sb-j');
    tok.classList.add('sb-going');
    await sleep(1100);
    await back(j); await back(s);
    if (was) { s.classList.add('sb-was'); await sleep(450); await type(s, was); await sleep(1300); await back(s); s.classList.remove('sb-was'); }
    await sleep(350);
    s.classList.add('sb-hole'); await type(s, HOLE, 110);
    tok.classList.remove('sb-going', 'sb-can'); tok.classList.add('sb-holed');
  }
  /** A hole is held against a word: the word goes out, the hole stands in it a moment, and what the walker said comes in (or nothing does). */
  async function fill(tok, fillWord, quick) {
    const s = tok.querySelector('.sb-s'), j = tok.querySelector('.sb-j');
    tok.classList.remove('sb-can'); tok.classList.add('sb-going');
    await back(s, quick ? 45 : 80);
    s.classList.add('sb-hole'); await type(s, HOLE, quick ? 40 : 70);
    await sleep(quick ? 450 : 1200);
    if (!fillWord) { j.textContent = ''; tok.classList.remove('sb-going'); tok.classList.add('sb-holed'); return; }
    await back(s, 45); s.classList.remove('sb-hole');
    s.classList.add(fillWord.owner === 'mine' ? 'sb-mine' : 'sb-other');
    await type(s, fillWord.stem, quick ? 60 : 100);
    j.textContent = fitJosa(j.textContent, fillWord.stem);
    tok.classList.remove('sb-going');
  }
  return { sleep, back, type, fall, fill };
}

// ── the hole that follows ───────────────────────────────────────────────────
/**
 * The holes carried — as many as were made (author, 261123: "let them add up"), one under another, the oldest on top
 * and used first. Where the cursor is free they keep beside it; where the walker looks round (no cursor) they keep
 * under the aim point. Slow, wide, heavy: they arrive late and do not tremble.
 * @param o { locked: () => boolean }
 */
export function createHand(o) {
  const wrap = document.createElement('div'); wrap.id = 'sbHand'; wrap.setAttribute('aria-hidden', 'true'); document.body.appendChild(wrap);
  const held = [];                                                    // [{ info, el }] oldest first
  let x = innerWidth / 2, y = innerHeight / 2, mx = null, my = null, last = performance.now(), t = 0;
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  (function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now; t += dt;
    if (!held.length && !wrap.classList.contains('on')) return;
    const free = !(o && o.locked && o.locked()) && mx != null && !('ontouchstart' in window && matchMedia('(pointer: coarse)').matches);
    const tx = free ? mx + 22 : innerWidth / 2 + 26, ty = free ? my + 26 : innerHeight / 2 + 34;
    const k = 1 - Math.exp(-dt / 0.42);
    x += (tx - x) * k; y += (ty - y) * k;
    wrap.style.transform = 'translate3d(' + (x + 3 * Math.sin(t * 0.9)).toFixed(1) + 'px,' + (y + 2.2 * Math.sin(t * 0.62 + 1.3)).toFixed(1) + 'px,0)';
  })(performance.now());
  const erase = async (el) => { while (el.textContent.length) { el.textContent = el.textContent.slice(0, -1); await new Promise((r) => setTimeout(r, 70)); } el.remove(); };
  return {
    el: wrap,
    /** The hole that will be used next (the oldest), or null. */
    held: () => (held.length ? held[0].info : null),
    count: () => held.length,
    /** @param info what the hole carries (where it was made, what was said there)  @param from a rect it comes loose from */
    async give(info, from) {
      const el = document.createElement('div'); el.className = 'sb-h'; wrap.appendChild(el);
      held.push({ info, el });
      if (from && held.length === 1) { x = from.left; y = from.top; wrap.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'; }
      wrap.classList.add('on'); document.body.classList.add('sb-held');
      await typeText(el, HOLE, { per: 120 });
    },
    /** The oldest hole is used up: its letters go out. Returns what it carried. */
    take() {
      const h = held.shift(); if (!h) return null;
      erase(h.el);
      if (!held.length) { document.body.classList.remove('sb-held'); setTimeout(() => { if (!held.length) wrap.classList.remove('on'); }, 600); }
      return h.info;
    },
    /** The walk ends: every hole goes out. */
    async drop() {
      if (!held.length) return;
      const all = held.splice(0); document.body.classList.remove('sb-held');
      await Promise.all(all.map((h) => erase(h.el)));
      wrap.classList.remove('on');
    },
  };
}

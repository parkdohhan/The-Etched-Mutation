// js/shared/person_shelf.js — ARCHIVE: memory cards, their owners, the gate (2026-11-24, reshaped 2026-11-28)
//
// Decisions: docs/아카이브_사람칸_결정-261124.md (people's shelves) → docs/아카이브_기억칸_질문_결정-261128.md (this shape).
//   - A shelf = one person (memories.curator_id) and every public space memory they put up (meta.space_record),
//     named by the pen name of their latest memory (meta.space_record.pen_name). The author's shelf = the author's
//     memories (AUTHOR_CODES). A memory with no owner is a shelf of its own ("이름 없는 사람").
//   - 261128: ARCHIVE draws one card per MEMORY (title large, the owner's name small) — only the memories this browser
//     has walked (tem_walked:<id>, or tem_first_play:<id> from record-space). The owner's name opens that person's
//     page: everything they have put up, in the order it went up.
//   - 261128: a memory may carry a gate — meta.gate = { v: 1, intro, line } — a short introduction and one sentence
//     with an empty place in it (GATE_HOLE). What the walker writes there goes with them into the stage (sessionStorage),
//     where it is read as an emotion and names the first scene (js/spaceblank/main.js pickEntry).
//   - The chain (one shelf walked memory after memory) is switched off since 261128: a card is one memory. The three
//     functions stay — nothing calls startChain now; calling it again turns the chain back on.
// Readers: js/app/archive.js (the cards, the person's page), js/spaceblank/main.js · js/spaceplay/main.js (the walked mark, the gate).

export const AUTHOR_NAME = { ko: '박도한', en: 'Dohhan Park' };   // the author's pen name (author, 261128)
// the author's memories, per screen language. The order here is not the order shown (that is created_at).
export const AUTHOR_CODES = { ko: ['UNDW-001', 'GWON-001', 'DANG-001', 'JANG-001'], en: ['UNDW-001-EN'] };
const NAMELESS = { ko: '이름 없는 사람', en: 'someone unnamed' };
const CHAIN_KEY = 'tem_shelf_chain';
const GATE_KEY = 'tem_gate';
const GATE_TTL = 30 * 60 * 1000;          // an answer written at a card is good for one entry, made soon after
export const GATE_HOLE = '___';           // where the empty place stands in meta.gate.line

export function markWalked(memoryId) {
  try { if (memoryId) localStorage.setItem('tem_walked:' + memoryId, String(Date.now())); } catch (_) {}
}
export function hasWalked(memoryId) {
  try { return !!(localStorage.getItem('tem_walked:' + memoryId) || localStorage.getItem('tem_first_play:' + memoryId)); } catch (_) { return false; }
}

/**
 * The shelves, from memory rows ({ id, code, curator_id, created_at, is_public, meta }). Latest put-up first.
 * Each shelf: { key, name, memories (the order they went up), walked: [memories this browser has walked], latest }.
 * A shelf none of whose memories has been walked is left out.
 */
export function buildShelves(rows, lang) {
  const L = lang === 'en' ? 'en' : 'ko';
  const authorCodes = new Set(AUTHOR_CODES[L]);
  const byKey = new Map();
  for (const m of rows || []) {
    if (!m || !m.id) continue;
    let key;
    if (authorCodes.has(m.code)) key = 'author';
    else if (m.meta && m.meta.space_record && m.is_public !== false) key = m.curator_id ? 'u:' + m.curator_id : 'm:' + m.id;
    else continue;
    if (!byKey.has(key)) byKey.set(key, { key, memories: [] });
    if (!byKey.get(key).memories.some((x) => x.id === m.id)) byKey.get(key).memories.push(m);
  }
  const shelves = [];
  for (const sh of byKey.values()) {
    sh.memories.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));   // the order they went up
    sh.walked = sh.memories.filter((m) => hasWalked(m.id));
    if (!sh.walked.length) continue;
    const latest = sh.memories[sh.memories.length - 1];
    if (sh.key === 'author') sh.name = AUTHOR_NAME[L];
    else {
      let pen = '';
      for (let i = sh.memories.length - 1; i >= 0 && !pen; i--) pen = (sh.memories[i].meta.space_record.pen_name || '').trim();
      sh.name = pen || NAMELESS[L];
    }
    sh.latest = String(latest.created_at || '');
    shelves.push(sh);
  }
  shelves.sort((a, b) => b.latest.localeCompare(a.latest));   // latest first — never by count (a count order reads as a ranking)
  return shelves;
}

// ── the gate: one sentence with an empty place, answered at the card ────────────────────────────
/** A memory's gate, or null. { intro, line, before, after } — line split at the empty place (no hole in the line = no gate). */
export function gateOf(memory) {
  const g = memory && memory.meta && memory.meta.gate;
  const line = g && typeof g.line === 'string' ? g.line.trim() : '';
  const intro = (g && typeof g.intro === 'string' && g.intro.trim()) || '';
  const at = line.indexOf(GATE_HOLE);
  if (!line || at < 0) return intro ? { intro, line: '', before: '', after: '' } : null;
  return { intro, line, before: line.slice(0, at), after: line.slice(at + GATE_HOLE.length) };
}
/** Written at the card, just before going to the stage. */
export function putGateAnswer(memoryId, text, line) {
  try { sessionStorage.setItem(GATE_KEY, JSON.stringify({ memory: String(memoryId), text: String(text || '').slice(0, 90), line: String(line || ''), at: Date.now() })); } catch (_) {}
}
/** Read once by the stage: the answer written for this memory, or null. It is taken out as it is read (a reload does not use it again). */
export function takeGateAnswer(memoryId) {
  let g = null;
  try { g = JSON.parse(sessionStorage.getItem(GATE_KEY) || 'null'); sessionStorage.removeItem(GATE_KEY); } catch (_) { g = null; }
  if (!g || String(g.memory) !== String(memoryId) || !g.text || !String(g.text).trim() || Date.now() - Number(g.at || 0) > GATE_TTL) return null;
  return { text: String(g.text).trim().slice(0, 90), line: String(g.line || '') };
}
export function clearGateAnswer() { try { sessionStorage.removeItem(GATE_KEY); } catch (_) {} }

// ── the chain (off since 261128 — see the header) ───────────────────────────────────────────────
export function startChain(ids) {
  try { sessionStorage.setItem(CHAIN_KEY, JSON.stringify({ ids, at: 0 })); } catch (_) {}
}
export function clearChain() {
  try { sessionStorage.removeItem(CHAIN_KEY); } catch (_) {}
}
/** After a memory ends: the next memory's id when this walk is part of a shelf's chain, else null (and the chain is dropped). */
export function chainNext(currentId) {
  let c = null;
  try { c = JSON.parse(sessionStorage.getItem(CHAIN_KEY) || 'null'); } catch (_) { c = null; }
  if (!c || !Array.isArray(c.ids) || c.ids[c.at] !== currentId || c.at + 1 >= c.ids.length) { clearChain(); return null; }
  c.at += 1;
  try { sessionStorage.setItem(CHAIN_KEY, JSON.stringify(c)); } catch (_) {}
  return c.ids[c.at];
}

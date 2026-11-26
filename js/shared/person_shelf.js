// js/shared/person_shelf.js — ARCHIVE as people's shelves (2026-11-24)
//
// Decision: docs/아카이브_사람칸_결정-261124.md.
//   - A shelf = one person (memories.curator_id) and every public space memory they put up (meta.space_record),
//     named by the pen name of their latest memory (meta.space_record.pen_name). The author's shelf = UNDW-001 (or the
//     English copy). A memory with no owner is a shelf of its own ("이름 없는 사람").
//   - Only the shelves of people this browser has walked at least once are shown (tem_walked:<id>, or tem_first_play:<id>
//     from record-space). The count is all of that person's memories.
//   - Opening a shelf walks the memories one after another, in the order they went up (the chain, sessionStorage).
// Readers: js/app/archive.js (the shelves), js/spaceblank/main.js (the walked mark, the next memory).

export const AUTHOR_NAME = { ko: '작가', en: 'the author' };   // the author's pen name — change here (author: "가명은 내가 정함")
export const AUTHOR_CODES = { ko: 'UNDW-001', en: 'UNDW-001-EN' };
const NAMELESS = { ko: '이름 없는 사람', en: 'someone unnamed' };
const CHAIN_KEY = 'tem_shelf_chain';

export function markWalked(memoryId) {
  try { if (memoryId) localStorage.setItem('tem_walked:' + memoryId, String(Date.now())); } catch (_) {}
}
export function hasWalked(memoryId) {
  try { return !!(localStorage.getItem('tem_walked:' + memoryId) || localStorage.getItem('tem_first_play:' + memoryId)); } catch (_) { return false; }
}

/** The shelves, from memory rows ({ id, code, curator_id, created_at, is_public, meta }). Latest put-up first. */
export function buildShelves(rows, lang) {
  const L = lang === 'en' ? 'en' : 'ko';
  const byKey = new Map();
  for (const m of rows || []) {
    if (!m || !m.id) continue;
    let key;
    if (m.code === AUTHOR_CODES[L]) key = 'author';
    else if (m.meta && m.meta.space_record && m.is_public !== false) key = m.curator_id ? 'u:' + m.curator_id : 'm:' + m.id;
    else continue;
    if (!byKey.has(key)) byKey.set(key, { key, memories: [] });
    byKey.get(key).memories.push(m);
  }
  const shelves = [];
  for (const sh of byKey.values()) {
    sh.memories.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));   // the order they went up
    if (!sh.memories.some((m) => hasWalked(m.id))) continue;
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

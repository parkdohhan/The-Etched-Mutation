/**
 * Tidying a line someone typed (2026-11-28).
 *
 * Author, on seeing "외로웠겠다ㅏ" afloat in a scene: "slips of the hand like this — sift them out without being told."
 * A Korean keyboard leaves letters of the alphabet standing alone when a key is struck once too often or out of turn
 * ("외로웠겠다ㅏ", "막ㄷ았다"), and a hand run across the keys leaves nothing else ("ㅁㄴㅇㄹ"). Those letters are not
 * part of any word, so they are taken out; a line with nothing left is no line.
 *
 * What it does NOT do: it does not correct a word spelled wrong with whole syllables ("됬다"), and it cannot restore a
 * syllable that was never finished ("ㄱ래" → "래"). Laughing and crying written in loose letters ("ㅋㅋ", "ㅠㅠ") go too.
 *
 * Where it stands: at the door (what a walker types is tidied before it is shown, answered, measured or kept —
 * js/spaceremain/main.js, js/spaceblank/main.js) and at the shelf (lines kept before this rule are tidied when they are
 * read back to be shown — the lines afloat by a scene, the line beside a scene in the prologue).
 * Pure: no DOM, no storage. Checked by test/unit/tidy_line.test.js.
 */
// letters standing alone: the keyboard's (compatibility jamo) and uncomposed ones (conjoining jamo, after NFC has joined what joins)
const LOOSE = /[ㄱ-ㆎᄀ-ᇿꥠ-ꥼힰ-ퟻ]+/g;

/** @returns the line without loose letters and what they left hanging; '' if no word is left */
export function tidyLine(raw) {
  let s = String(raw == null ? '' : raw).normalize('NFC').replace(LOOSE, '');
  s = s.replace(/\s+/g, ' ').replace(/\s+([.,!?…])/g, '$1').trim();
  s = s.replace(/^[^\p{L}\p{N}"'“‘(…]+/u, '').replace(/[^\p{L}\p{N}.!?…~"'”’)]+$/u, '').trim();   // marks left with nothing to lean on (";", "]")
  return /[\p{L}\p{N}]/u.test(s) ? s : '';
}

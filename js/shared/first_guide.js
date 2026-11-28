/**
 * Is this browser walking TEM for the first time? (2026-11-28, author: "no separate tutorial piece — straight to the main
 * screen, and if this browser seems to be opening TEM for the first time, just show the guiding lines on the first walk.")
 *
 * First = this browser holds no mark of a walk: not the mark this file leaves when a walk is ended (tem_guide_seen), and
 * none of the marks the stages and the archive leave (tem_walked:<memory>, tem_first_play:<memory>).
 * Asked once, when the stage's page is read — before the walk itself leaves any mark.
 *   ?guide=1  the lines are shown whatever the browser holds (to look at them again)
 *   ?guide=0  never
 */
const KEY = 'tem_guide_seen';

export function firstTime(qs) {
  const g = qs && qs.get ? qs.get('guide') : null;
  if (g === '1') return true;
  if (g === '0') return false;
  try {
    if (localStorage.getItem(KEY)) return false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (k.startsWith('tem_walked:') || k.startsWith('tem_first_play:')) return false;
    }
    return true;
  } catch (_) { return false; }                                            // no storage: nothing can be remembered, so the lines are not pressed on every walk
}

/** A walk was ended with the lines shown: from now on this browser is not new. */
export function guideSeen() { try { localStorage.setItem(KEY, String(Date.now())); } catch (_) { /* none */ } }

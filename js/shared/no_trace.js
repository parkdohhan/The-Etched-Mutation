/**
 * Accounts whose walks leave nothing (2026-11-28).
 *
 * Author: "I'll make the ID june — let nothing be recorded for that ID."
 * A walk taken while signed in with one of these IDs is walked as the real one is (the same door, the same blanks, the
 * same answers, the same ending) and written nowhere: no ledger row, no journal, no line left for others, no changed
 * text, no "has walked" mark — so it can be walked again as often as wanted.
 *
 * The ID is the sign-in ID (profiles.username; the one given at sign-up if that row cannot be read). This is not a lock:
 * it only keeps a walk from being written, which harms nothing if someone else were to hold such an ID.
 * Stages that ask: js/spaceremain/main.js, js/spaceblank/main.js. Undo = empty the list.
 */
export const NO_TRACE_IDS = ['june'];

/** @param client a Supabase client of this page (it holds the browser's sign-in) → true if this walk is to leave nothing */
export async function leavesNoTrace(client) {
  try {
    const s = await client.auth.getSession();
    const user = s && s.data && s.data.session && s.data.session.user;
    if (!user) return false;
    let id = (user.user_metadata && user.user_metadata.username) || '';
    try { const r = await client.from('profiles').select('username').eq('id', user.id).maybeSingle(); if (r && r.data && r.data.username) id = r.data.username; } catch (_) { /* the sign-up name stands */ }
    return NO_TRACE_IDS.includes(String(id).trim().toLowerCase());
  } catch (_) { return false; }
}

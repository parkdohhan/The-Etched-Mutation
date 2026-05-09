/**
 * User Identity + First-Play Persistence (localStorage)
 *
 * Two roles:
 *   1. User identity — anonymous nickname only, no password.
 *      Stored under `tem_user_name`.
 *   2. First-play data per memory — to enable "second play wave comparison"
 *      and re-entry "something has changed" branch.
 *      Stored under `tem_first_play:<memoryId>`.
 *
 * No DB, no Supabase. Operator clears via DevTools or `clearUserIdentity()`.
 */

const USER_NAME_KEY = 'tem_user_name';
const FIRST_PLAY_PREFIX = 'tem_first_play:';

// ─────────────────────────────────────
// User identity (nickname)
// ─────────────────────────────────────

export function setUserName(name) {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return false;
    try {
        localStorage.setItem(USER_NAME_KEY, trimmed);
        return true;
    } catch (e) {
        console.warn('[userIdentity] setUserName failed:', e);
        return false;
    }
}

export function getUserName() {
    try {
        return localStorage.getItem(USER_NAME_KEY);
    } catch (e) {
        return null;
    }
}

export function hasUserName() {
    return !!getUserName();
}

// ─────────────────────────────────────
// First-play data per memory
// ─────────────────────────────────────

/**
 * @param {string} memoryId
 * @param {{
 *   scenes: Array<{ sceneIndex: number, sceneId?: string|null, userEmotion: object, userReason?: string }>,
 *   alignment_score?: number,
 *   alignment_bucket?: string,
 *   transition_pattern?: string,
 *   completed_sentence?: string,
 * }} data
 */
export function saveFirstPlayData(memoryId, data) {
    if (!memoryId) return false;
    try {
        const payload = {
            memoryId,
            userName: getUserName(),
            timestamp: Date.now(),
            ...data,
        };
        localStorage.setItem(FIRST_PLAY_PREFIX + memoryId, JSON.stringify(payload));
        return true;
    } catch (e) {
        console.warn('[userIdentity] saveFirstPlayData failed:', e);
        return false;
    }
}

export function getFirstPlayData(memoryId) {
    if (!memoryId) return null;
    try {
        const raw = localStorage.getItem(FIRST_PLAY_PREFIX + memoryId);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.warn('[userIdentity] getFirstPlayData parse failed:', e);
        return null;
    }
}

export function hasFirstPlayData(memoryId) {
    return !!getFirstPlayData(memoryId);
}

export function clearFirstPlayData(memoryId) {
    if (!memoryId) return;
    try {
        localStorage.removeItem(FIRST_PLAY_PREFIX + memoryId);
    } catch (e) { /* swallow */ }
}

/**
 * Operator-only: wipe nickname + every first-play row.
 * Useful between demo sessions.
 */
export function clearUserIdentity() {
    try {
        localStorage.removeItem(USER_NAME_KEY);
        const keysToDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(FIRST_PLAY_PREFIX)) keysToDelete.push(key);
        }
        keysToDelete.forEach(k => localStorage.removeItem(k));
        console.log('[userIdentity] cleared user identity + first-play rows:', keysToDelete.length);
    } catch (e) {
        console.warn('[userIdentity] clearUserIdentity failed:', e);
    }
}

// Expose to window for operator console use.
if (typeof window !== 'undefined') {
    window.temClearUserIdentity = clearUserIdentity;
    window.temGetUserName = getUserName;
}

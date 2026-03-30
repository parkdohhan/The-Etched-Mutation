// js/audio/getSoundscape.js
// Thin accessor for window.soundscape (set by SoundscapeBeta.js non-module script).
// All ES modules must go through this getter — never reference window.soundscape directly.
// When SoundscapeBeta.js is eventually converted to a module, only this file needs updating.

/** @returns {import('../audio/SoundscapeBeta.js').Soundscape | null} */
export function getSoundscape() {
    return window.soundscape || null;
}

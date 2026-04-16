// Lightweight Web Speech API wrapper for TEM.
// Used by:
//   - PLAY gate (Another Me's onboarding lines)
//   - play-test.html reveal screen (장면화 narration)
// Keep this module dependency-free; play-test.html loads it as an ES module.

const STORAGE_KEY = 'tem_voice_enabled';

let _voicesCache = null;
let _voicesLoadedPromise = null;

function _loadVoices() {
    if (_voicesCache && _voicesCache.length > 0) return Promise.resolve(_voicesCache);
    if (_voicesLoadedPromise) return _voicesLoadedPromise;
    _voicesLoadedPromise = new Promise((resolve) => {
        if (typeof speechSynthesis === 'undefined') { resolve([]); return; }
        const tryGet = () => {
            const v = speechSynthesis.getVoices();
            if (v && v.length > 0) { _voicesCache = v; resolve(v); return true; }
            return false;
        };
        if (tryGet()) return;
        speechSynthesis.addEventListener('voiceschanged', () => { tryGet(); }, { once: true });
        // fallback timeout — some browsers never fire voiceschanged
        setTimeout(() => { if (!_voicesCache) { _voicesCache = speechSynthesis.getVoices() || []; resolve(_voicesCache); } }, 1500);
    });
    return _voicesLoadedPromise;
}

function _pickVoice(voices, langPrefix) {
    if (!voices || voices.length === 0) return null;
    const exact = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix));
    if (exact) return exact;
    return voices[0];
}

export function isVoiceEnabled() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v === null ? true : v === '1'; // default ON
    } catch (_) { return true; }
}

export function setVoiceEnabled(enabled) {
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (_) {}
    if (!enabled) cancelSpeech();
}

export function cancelSpeech() {
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch (_) {}
}

/**
 * Speak text via Web Speech API.
 * @param {string} text
 * @param {Object} opts
 * @param {string} opts.lang   - 'ko' | 'en' (default: 'en')
 * @param {number} opts.rate   - 0.1–10, default 0.9 (slightly slow, contemplative)
 * @param {number} opts.pitch  - 0–2, default 0.95
 * @param {number} opts.volume - 0–1, default 1
 * @param {Function} opts.onEnd - called when utterance finishes (or is cancelled)
 * @returns {Promise<SpeechSynthesisUtterance|null>}
 */
export async function speak(text, opts = {}) {
    if (!text || typeof speechSynthesis === 'undefined') return null;
    if (!isVoiceEnabled()) return null;
    const lang = (opts.lang === 'ko') ? 'ko' : 'en';
    const langPrefix = (lang === 'ko') ? 'ko' : 'en';
    const voices = await _loadVoices();
    const voice = _pickVoice(voices, langPrefix);

    cancelSpeech(); // never overlap

    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : (lang === 'ko' ? 'ko-KR' : 'en-US');
    u.rate = (opts.rate != null) ? opts.rate : 0.9;
    u.pitch = (opts.pitch != null) ? opts.pitch : 0.95;
    u.volume = (opts.volume != null) ? opts.volume : 1;
    if (typeof opts.onEnd === 'function') {
        u.onend = opts.onEnd;
        u.onerror = opts.onEnd;
    }
    try { speechSynthesis.speak(u); } catch (_) {}
    return u;
}

/**
 * Speak a sequence of lines, one after another, with optional per-line callbacks.
 * Returns a controller with .cancel() to abort the whole sequence.
 *
 * lines: Array<{ text, lang?, rate?, pitch?, onStart?, onEnd?, gapMs? }>
 */
export function speakSequence(lines) {
    let cancelled = false;
    let currentUtter = null;

    const controller = {
        cancel() {
            cancelled = true;
            cancelSpeech();
            currentUtter = null;
        },
    };

    (async () => {
        for (let i = 0; i < lines.length; i++) {
            if (cancelled) return;
            const line = lines[i];
            if (typeof line.onStart === 'function') line.onStart(i);
            await new Promise((resolve) => {
                speak(line.text, {
                    lang: line.lang,
                    rate: line.rate,
                    pitch: line.pitch,
                    volume: line.volume,
                    onEnd: () => {
                        if (typeof line.onEnd === 'function') line.onEnd(i);
                        resolve();
                    },
                }).then((u) => { currentUtter = u; });
            });
            if (cancelled) return;
            const gap = (line.gapMs != null) ? line.gapMs : 400;
            if (gap > 0) await new Promise(r => setTimeout(r, gap));
        }
    })();

    return controller;
}

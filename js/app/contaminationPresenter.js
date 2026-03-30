// js/app/contaminationPresenter.js
// Presentation Spec v1 — Text contamination consumer.
//
// Reads ContaminationTracker state (cont_stage, cont_drift, cont_fixation)
// from a memory object and applies the appropriate text transformation.
//
// Design rules (Presentation Spec §1, §3):
//   - Does NOT recompute stage. Reads what ContaminationTracker persisted.
//   - stable     → original text
//   - biased_inclination → directional erosion (trailing chars dissolve)
//   - hypercompletion    → over-solidification (echo / block chars)
//   - Intensity bands: weak 0~0.33, medium 0.34~0.66, strong 0.67~1.0
//   - Pre-generated AI text (scene.text_biased / scene.text_hyper) always wins over client-side fallback
//   - Client-side fallback is seeded (mulberry32) — same text always produces same effect

import { getPresentationState } from '../core/ContaminationTracker.js';

// ─── Seeded PRNG ─────────────────────────────────────────────────

function _seedFromText(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return function () {
        h |= 0; h = h + 0x6D2B79F5 | 0;
        let t = Math.imul(h ^ h >>> 15, 1 | h);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const GLITCH_CHARS = '░▒▓█▪▫';

// ─── Client-side text fallback ────────────────────────────────────

/**
 * Apply Presentation Spec text effect to originalText.
 *
 * @param {string} originalText
 * @param {Object} scene - scene object (may have text_biased / text_hyper pre-generated)
 * @param {{ stage: string, intensity: number, band: string }} pres - getPresentationState() output
 * @returns {string} transformed text
 */
export function applyStageText(originalText, scene, pres) {
    const { stage, intensity, band } = pres;
    if (stage === 'stable' || intensity < 0.01) return originalText;

    // Pre-generated AI text wins
    if (stage === 'biased_inclination' && scene.text_biased) return scene.text_biased;
    if (stage === 'hypercompletion'    && scene.text_hyper)  return scene.text_hyper;

    // Client-side fallback: seeded so same text always produces same effect
    const rng = _seedFromText(originalText + stage + band);
    const isKo = /[가-힣]/.test(originalText);
    const words = originalText.split(/(\s+)/);

    const prob = band === 'strong' ? 0.18
        : band === 'medium' ? 0.10
        : 0.04;

    let out = '';
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (/^\s+$/.test(w)) { out += w; continue; }
        if (rng() >= prob)   { out += w; continue; }

        if (stage === 'biased_inclination') {
            // Directional erosion: trailing chars dissolve
            // Spec: "핵심 단어만 편향 방향으로 치환"
            const fadeStart = isKo
                ? Math.max(1, Math.floor(w.length * 0.5))
                : Math.max(1, Math.floor(w.length * 0.6));
            let result = w.slice(0, fadeStart);
            for (let c = fadeStart; c < w.length; c++) {
                result += rng() < 0.5 ? '·' : w[c];
            }
            out += result;

        } else if (stage === 'hypercompletion') {
            // Over-solidification: text becomes too certain, too fixed
            // Spec: "기억이 스스로 답을 확정하고 있다"
            if (rng() < 0.3 && w.length > 1) {
                out += w + w;   // word echo: memory over-confirming itself
            } else {
                let result = '';
                for (let c = 0; c < w.length; c++) {
                    result += rng() < 0.4
                        ? GLITCH_CHARS[Math.floor(rng() * GLITCH_CHARS.length)]
                        : w[c];
                }
                out += result;
            }
        } else {
            out += w;
        }
    }
    return out;
}

// ─── Main path entry point ────────────────────────────────────────

/**
 * Build the display text for a scene given the memory's contamination state.
 *
 * This replaces the old play-count-based loadSceneWithContamination() in index.js.
 * All computation is synchronous — no async Supabase calls needed.
 *
 * @param {Object} scene     - scene object from currentStoryData.scenes
 * @param {Object} memoryObj - memory row (from allMemoriesData or currentStoryData)
 *                             must have cont_stage, cont_drift, cont_fixation etc.
 *                             Falls back to stable / zero if columns are absent.
 * @returns {{ displayText: string, pres: Object }}
 *   displayText — text to render
 *   pres        — presentation state (for downstream use: CSS class, soundscape, etc.)
 */
export function getContaminatedSceneText(scene, memoryObj) {
    const contState = {
        cont_stage:    memoryObj?.cont_stage    || 'stable',
        cont_drift:    memoryObj?.cont_drift    || 0,
        cont_fixation: memoryObj?.cont_fixation || 0,
        drift_dir_v:   memoryObj?.drift_dir_v   || 0,
        drift_dir_a:   memoryObj?.drift_dir_a   || 0,
        drift_dir_d:   memoryObj?.drift_dir_d   || 0,
    };

    const pres = getPresentationState(contState);
    const originalText = scene.text || '';
    const displayText = applyStageText(originalText, scene, pres);

    return { displayText, pres };
}

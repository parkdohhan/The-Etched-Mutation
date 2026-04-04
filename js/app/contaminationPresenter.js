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
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config.js';
import { getAccessToken } from '../lib/supabaseClient.js';
import { networkService } from '../services/NetworkService.js';

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
 * Stage → text_stage mapping:
 *   stable                        → original text
 *   biased_inclination (weak)     → original text
 *   biased_inclination (medium)   → text_stage_1 (편향적 기울어짐)
 *   biased_inclination (strong)   → text_stage_2 (해석 병기)
 *   hypercompletion (weak)        → original text
 *   hypercompletion (medium)      → text_stage_2 (해석 병기)
 *   hypercompletion (strong)      → text_stage_3 (과잉 완결)
 *
 * If the target stage text is missing, falls through to client-side fallback.
 *
 * @param {string} originalText
 * @param {Object} scene - scene object (has text_stage_1 / text_stage_2 / text_stage_3)
 * @param {{ stage: string, intensity: number, band: string }} pres - getPresentationState() output
 * @returns {string} transformed text
 */
export function applyStageText(originalText, scene, pres) {
    const { stage, intensity, band } = pres;
    if (stage === 'stable' || intensity < 0.01) return originalText;

    // Pre-generated stage text: DB text_stage_1/2/3 mapped to contamination state
    if (stage === 'biased_inclination') {
        if (band === 'strong' && scene.text_stage_2) return scene.text_stage_2;
        if (band !== 'weak'  && scene.text_stage_1) return scene.text_stage_1;
    }
    if (stage === 'hypercompletion') {
        if (band === 'strong' && scene.text_stage_3) return scene.text_stage_3;
        if (band !== 'weak'  && scene.text_stage_2) return scene.text_stage_2;
    }

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

// ─── Auto-generation: Edge Function call + DB persist ─────────────

// In-flight requests — prevents duplicate calls for same scene+stage
const _pending = new Map();

/**
 * Determine which text_stage_N key is needed for the given presentation state.
 * Returns null if no AI text is needed (stable or weak band).
 */
function _neededStageKey(pres) {
    const { stage, band } = pres;
    if (stage === 'stable' || band === 'weak') return null;
    if (stage === 'biased_inclination') {
        return band === 'strong' ? 'text_stage_2' : 'text_stage_1';
    }
    if (stage === 'hypercompletion') {
        return band === 'strong' ? 'text_stage_3' : 'text_stage_2';
    }
    return null;
}

/**
 * Call contaminate-text Edge Function and persist result to DB.
 * Returns the generated text, or null on failure.
 */
async function _generateAndPersist(scene, contState, pres) {
    const stageKey = _neededStageKey(pres);
    if (!stageKey) return null;

    // De-duplicate: if already in-flight for this scene+key, wait for it
    const cacheKey = `${scene.id}:${stageKey}`;
    if (_pending.has(cacheKey)) return _pending.get(cacheKey);

    const promise = (async () => {
        try {
            const token = await getAccessToken().catch(() => null) || SUPABASE_ANON_KEY;
            const url = `${SUPABASE_URL}/functions/v1/contaminate-text`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'apikey': SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                    text: scene.text,
                    contamination: {
                        cont_stage:  contState.cont_stage,
                        cont_drift:  contState.cont_drift,
                        cont_fixation: contState.cont_fixation,
                        drift_dir_v: contState.drift_dir_v,
                        drift_dir_a: contState.drift_dir_a,
                        drift_dir_d: contState.drift_dir_d,
                        band: pres.band,
                    },
                }),
            });

            if (!res.ok) {
                console.warn('[contaminationPresenter] Edge Function error', res.status);
                return null;
            }

            const data = await res.json();
            // Edge Function returns { text_stage_1, text_stage_2, text_stage_3 } (whichever applies)
            const generated = data[stageKey];
            if (!generated) return null;

            // Persist to DB so next time it's instant
            if (scene.id) {
                networkService.updateScene(scene.id, { [stageKey]: generated });
            }

            // Also patch the in-memory scene object so the rest of this session sees it
            scene[stageKey] = generated;

            return generated;
        } catch (err) {
            console.warn('[contaminationPresenter] auto-generate failed', err);
            return null;
        } finally {
            _pending.delete(cacheKey);
        }
    })();

    _pending.set(cacheKey, promise);
    return promise;
}

// ─── Main path entry point ────────────────────────────────────────

/**
 * Build the display text for a scene given the memory's contamination state.
 *
 * When AI-generated stage text is missing from DB, automatically calls the
 * contaminate-text Edge Function to generate it, persists to DB, and returns.
 * Falls back to client-side effect while waiting or on failure.
 *
 * @param {Object} scene     - scene object from currentStoryData.scenes
 * @param {Object} memoryObj - memory row (from allMemoriesData or currentStoryData)
 *                             must have cont_stage, cont_drift, cont_fixation etc.
 *                             Falls back to stable / zero if columns are absent.
 * @returns {Promise<{ displayText: string, pres: Object }>}
 */
export async function getContaminatedSceneText(scene, memoryObj) {
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

    // Check if the needed stage text is already available
    const stageKey = _neededStageKey(pres);
    if (stageKey && !scene[stageKey]) {
        // Auto-generate: call Edge Function, persist, patch scene
        await _generateAndPersist(scene, contState, pres);
    }

    const displayText = applyStageText(originalText, scene, pres);
    return { displayText, pres };
}

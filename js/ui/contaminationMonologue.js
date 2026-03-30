// js/ui/contaminationMonologue.js
// Presentation Spec §5 — 기억의 독백 레이어
//
// 규칙:
//   - 시스템 메시지가 아니다. 기억이 스스로 흔들리는 소리다.
//   - 설명하지 않는다. 진단하지 않는다. 무언가가 달라졌다는 말도 하지 않는다.
//   - 기억은 자신이 오염됐는지 모른다. 그냥 뭔가 잘 안 맞는다.
//   - 문장이 완성되지 않아도 된다. 오히려 그편이 맞다.
//
// i18n: 모든 텍스트는 t() 경유 — 언어 설정과 자동 동기화.

import { t } from '../lib/i18n.js';

// ─── Seeded PRNG (scene 재방문 시 동일 트리거 보장) ────────────────

function _seed(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function _seedInt(sceneIndex, contDepth) {
    return (sceneIndex * 2654435761 ^ contDepth * 40503) | 0;
}

// ─── i18n key lookup ─────────────────────────────────────────────

function _biasedKey(emotion, band) {
    return `monologue.biased.${emotion}.${band}`;
}

// ─── Trigger probability per band ────────────────────────────────

const TRIGGER_PROB = { weak: 0.20, medium: 0.45, strong: 0.70 };

// ─── Public API ───────────────────────────────────────────────────

/**
 * Get the monologue text for a contamination state, if one should fire.
 *
 * Uses seeded PRNG keyed on (sceneIndex, cont_depth) so the same playthrough
 * always produces the same monologue triggers. Text comes from i18n t() so
 * it automatically follows the current language setting.
 *
 * @param {Object} contPres     - getPresentationState() output
 * @param {string} lastMismatch - memoryObj.cont_last_mismatch
 * @param {number} sceneIndex   - current scene index (for seed)
 * @param {number} contDepth    - memoryObj.cont_depth (for seed)
 * @returns {string|null}       monologue text, or null if should not fire
 */
export function getMonologue(contPres, lastMismatch, sceneIndex, contDepth) {
    const { stage, band } = contPres;
    if (stage === 'stable') return null;

    // Seeded probability roll
    const rng = _seed(_seedInt(sceneIndex, contDepth || 0));
    const prob = TRIGGER_PROB[band] || 0;
    if (rng() >= prob) return null;

    // Pick i18n key
    let key;
    if (lastMismatch === 'void_mismatch') {
        key = `monologue.void.${band}`;
    } else if (stage === 'hypercompletion') {
        key = `monologue.hyper.${band}`;
    } else {
        // biased_inclination — use dominant emotion
        const emotion = contPres.dominant_emotion_label || 'neutral';
        key = _biasedKey(emotion, band);
    }

    const text = t(key);
    // If key is returned bare (no translation found), suppress
    return text === key ? null : text;
}

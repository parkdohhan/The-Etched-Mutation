// js/ui/contaminationMonologue.js
// Presentation Spec §5 — 기억의 독백 레이어
//
// 규칙:
//   - 시스템 메시지가 아니다. 기억이 스스로 흔들리는 소리다.
//   - 설명하지 않는다. 진단하지 않는다. 무언가가 달라졌다는 말도 하지 않는다.
//   - 기억은 자신이 오염됐는지 모른다. 그냥 뭔가 잘 안 맞는다.
//   - 문장이 완성되지 않아도 된다. 오히려 그편이 맞다.

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
    // XOR mix so same scene at different depths gives different seed
    return (sceneIndex * 2654435761 ^ contDepth * 40503) | 0;
}

// ─── Monologue pools ──────────────────────────────────────────────

const MONOLOGUES = {
    biased_inclination: {
        anger: {
            weak:   '…이게 이렇게 뜨거웠었나.',
            medium: '그때 나 이만큼 떨렸었나. 잘 모르겠다.',
            strong: '화가 났었다고 생각했는데, 이건 좀 다른 것 같기도.',
        },
        sadness: {
            weak:   '…좀 더 무거웠던 것 같기도 하고.',
            medium: '울었었나. 아닌 것 같은데.',
            strong: '이 무게가 원래 여기 있었는지 모르겠어.',
        },
        excitement: {
            weak:   '…이렇게 밝았었나.',
            medium: '이때 웃었었나? 기억이 자꾸 미끄러진다.',
            strong: '이건 좀 과한 것 같아. 이만큼은 아니었어.',
        },
        calm: {
            weak:   '…너무 조용하다.',
            medium: '이렇게 담담하진 않았던 것 같은데.',
            strong: '이 고요함 밑에 뭔가 있었는데. 지금은 안 들려.',
        },
        neutral: {
            weak:   '…뭔가.',
            medium: '뭔가 달라. 근데 뭔지 모르겠어.',
            strong: '이건 내가 아는 그때가 아닌 것 같은데.',
        },
    },
    hypercompletion: {
        _any: {
            weak:   '…이상하게 또렷하다.',
            medium: '이렇게 선명할 리가 없는데.',
            strong: '너무 잘 기억나. 그래서 이상해.',
        },
    },
    void: {
        _any: {
            weak:   '…여기.',
            medium: '여기에 뭔가 있었는데.',
            strong: '분명히 있었는데. 그게 뭐였는지만 안 떠올라.',
        },
    },
};

// ─── Trigger probability per band ────────────────────────────────

const TRIGGER_PROB = { weak: 0.20, medium: 0.45, strong: 0.70 };

// ─── Public API ───────────────────────────────────────────────────

/**
 * Get the monologue text for a contamination state, if one should fire.
 *
 * Uses seeded PRNG keyed on (sceneIndex, cont_depth) so the same playthrough
 * always produces the same monologue triggers.
 *
 * @param {Object} contPres    - getPresentationState() output
 * @param {string} lastMismatch - memoryObj.cont_last_mismatch
 * @param {number} sceneIndex  - current scene index (for seed)
 * @param {number} contDepth   - memoryObj.cont_depth (for seed)
 * @returns {string|null}      monologue text, or null if should not fire
 */
export function getMonologue(contPres, lastMismatch, sceneIndex, contDepth) {
    const { stage, band } = contPres;
    if (stage === 'stable') return null;

    // Seeded probability roll
    const rng = _seed(_seedInt(sceneIndex, contDepth || 0));
    const prob = TRIGGER_PROB[band] || 0;
    if (rng() >= prob) return null;

    // Pick pool
    let pool;
    if (lastMismatch === 'void_mismatch') {
        pool = MONOLOGUES.void._any;
    } else if (stage === 'hypercompletion') {
        pool = MONOLOGUES.hypercompletion._any;
    } else {
        // biased_inclination — use dominant emotion
        const emotion = contPres.dominant_emotion_label || 'neutral';
        pool = MONOLOGUES.biased_inclination[emotion] || MONOLOGUES.biased_inclination.neutral;
    }

    return pool[band] || null;
}

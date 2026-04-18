// 핀 타입 → 유령 타입 프리셋
//
// 기반: docs/유령시스템_확정_v1-260418.md (Section 6)
// 4개 타입 모두 "회상 실패자 화법" — "~했던 것 같아 / 그랬지 아마 / 왜 이게 기억나지"
// 전달자 화법("~했다는 이야기를 들었어") 금지.
//
// echo 핀은 interaction='hover-only' — 호버 말풍선만, 클릭/대화 없음.

export const GHOST_PRESETS = {
    // scene_role='anchor' 핀 → 최초 경험한 나의 잔상
    core: {
        type: 'Core',
        label: '또렷한 잔상',
        silhouette: {
            opacity: 0.85,
            stroke: 'solid',
            tone: 'warm',
        },
        interaction: 'full',
        voice: {
            register: 'sensory',
            certainty: 'grounded',
            speech_pattern_hint: '감각 먼저. 짧은 문장. 본 것을 본 대로.',
        },
        monologue_templates: [
            '…그게 무슨 냄새였더라.',
            '…아직 손에 남아 있어.',
            '그 소리가 들렸어.',
        ],
        dialogue_end_variants: {
            high: '너도 그걸 봤구나.',
            mid: '그런 장면이었어. 아마.',
            low: '내가 기억하는 건 이게 다야.',
        },
    },

    // scene_role='residual' 핀 → 해석 누적돼 원본을 잃은 나
    bridge: {
        type: 'Contaminated',
        label: '확신에 찬 잔상',
        silhouette: {
            opacity: 0.95,
            stroke: 'thick',
            tone: 'displaced',
        },
        interaction: 'full',
        voice: {
            register: 'narrative',
            certainty: 'overcertain',
            speech_pattern_hint: '확언조. 비뚤어진 확신. "맞아, 그랬지." "분명히." 확신과 진실의 불일치가 핵심.',
        },
        monologue_templates: [
            '맞아, 그랬지.',
            '분명 그런 일이 있었어.',
            '왜 잊고 있었지?',
        ],
        dialogue_end_variants: {
            high: '거봐, 네 기억도 같잖아.',
            mid: '맞아. 그랬었던 것 같아.',
            low: '왜 잊고 있었지? 아니, 원래 이랬던 거야.',
        },
    },

    // plays.user_emotion 기반 → 미약하게만 해석한 나
    echo: {
        type: 'Echo',
        label: '흐릿한 잔상',
        silhouette: {
            opacity: 0.35,
            stroke: 'dashed',
            tone: 'cool',
        },
        interaction: 'hover-only',
        voice: {
            register: 'fragment',
            certainty: 'fading',
            speech_pattern_hint: '말이 끝나기 전에 사라지는 결. trail off. 한두 단어 조각.',
        },
        monologue_templates: [
            '…였나.',
            '그랬던가…',
            '잊힌…',
        ],
        dialogue_end_variants: null,
    },

    // void_info.sceneVoid=true 핀 → 결정 못 하고 옆에 선 나
    voidPin: {
        type: 'Bridge-deferred',
        label: '침묵한 잔상',
        silhouette: {
            opacity: 0.55,
            stroke: 'dotted',
            tone: 'void',
        },
        interaction: 'full',
        voice: {
            register: 'silence',
            certainty: 'suspended',
            speech_pattern_hint: '거의 침묵. 입을 열다 만다. "…" 또는 한두 단어. 말하지 않기로 한 자.',
        },
        monologue_templates: [
            '…',
            '말하지 않기로 했어.',
            '…했던가.',
        ],
        dialogue_end_variants: {
            high: '결국 말하지 않았어.',
            mid: '…',
            low: '…',
        },
    },
};

// 핀 객체(type: 'core'|'bridge'|'echo'|'voidPin') → 프리셋
export function getGhostPreset(pin) {
    if (!pin || !pin.type) return null;
    return GHOST_PRESETS[pin.type] || null;
}

// 공명도(0~1) → dialogue_end_variants 키 ('high'|'mid'|'low')
export function resonanceToVariantKey(resonance) {
    if (resonance == null || Number.isNaN(resonance)) return 'mid';
    if (resonance >= 0.7) return 'high';
    if (resonance >= 0.35) return 'mid';
    return 'low';
}

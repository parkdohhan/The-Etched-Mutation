/**
 * First-Play Scenification — V2-13.
 *
 * Triggered after first play of a memory. Shows the memory's completed
 * sentence + Continue button → inline nickname input.
 *
 * 260802 알파1 피드백 5: 씬별 파동 줄("파동 주르륵") 삭제 (사용자 결정).
 * 파동 스택 렌더 루프(_drawWave/_startAnim)와 .fps-waves DOM 제거 —
 * 문장과 이름 입력만 남는다. 롤백 = git revert.
 */

import { setUserName, saveFirstPlayData } from './userIdentity.js';

const CONTAINER_ID = 'firstPlayScenification';
const STYLE_ID = 'firstPlayScenificationStyle';

let _animId = null;

function _injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
#${CONTAINER_ID} {
    position: fixed; inset: 0;
    background: rgba(10, 10, 14, 0.96);
    z-index: 2600;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 4vh 5vw;
    opacity: 0; transition: opacity 1.2s ease;
    color: #d8d8e0;
    font-family: inherit;
}
#${CONTAINER_ID}.visible { opacity: 1; }
#${CONTAINER_ID} .fps-title {
    font-size: 0.85rem; letter-spacing: 0.3em;
    opacity: 0.55; margin-bottom: 2.5vh;
    text-transform: uppercase;
}
#${CONTAINER_ID} .fps-sentence {
    font-size: 1.6rem; line-height: 1.55;
    text-align: center; max-width: 720px;
    margin-bottom: 4vh; opacity: 0.92;
    font-weight: 300; letter-spacing: 0.02em;
}
#${CONTAINER_ID} .fps-cta {
    background: transparent;
    border: 1px solid rgba(216, 216, 224, 0.4);
    color: #d8d8e0;
    padding: 0.9em 2.4em;
    font-size: 0.9rem; letter-spacing: 0.25em;
    cursor: pointer;
    transition: all 0.4s ease;
    text-transform: uppercase;
    font-family: inherit;
}
#${CONTAINER_ID} .fps-cta:hover {
    border-color: rgba(216, 216, 224, 0.9);
    background: rgba(216, 216, 224, 0.05);
}
#${CONTAINER_ID} .fps-name-prompt {
    display: flex; flex-direction: column; align-items: center;
    gap: 1.5vh;
}
#${CONTAINER_ID} .fps-name-line {
    font-size: 1.05rem; opacity: 0.75;
    letter-spacing: 0.05em;
}
#${CONTAINER_ID} .fps-name-input {
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(216, 216, 224, 0.5);
    color: #d8d8e0;
    font-size: 1.3rem;
    text-align: center;
    outline: none;
    padding: 0.5em 0.5em;
    width: min(280px, 70vw);
    font-family: inherit;
    letter-spacing: 0.05em;
}
#${CONTAINER_ID} .fps-name-input:focus {
    border-bottom-color: rgba(216, 216, 224, 0.95);
}
#${CONTAINER_ID} .fps-name-hint {
    font-size: 0.7rem; opacity: 0.4;
    letter-spacing: 0.15em;
}
`;
    document.head.appendChild(st);
}

function _stopAnim() {
    if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
}

function _removeContainer() {
    _stopAnim();
    const el = document.getElementById(CONTAINER_ID);
    if (el) el.remove();
}

/**
 * @param {object} args
 * @param {string} args.memoryId
 * @param {string} args.completedSentence
 * @param {Array<{ sceneIndex: number, sceneId?: string, userEmotion: object, userReason?: string }>} args.scenes
 * @param {number} [args.alignment]
 * @param {string} [args.bucket]
 * @param {string} [args.transitionPattern]
 * @param {() => void} [args.onContinue]   Called after nickname submit + save.
 */
export async function showFirstPlayScenification(args) {
    _injectStyles();
    _removeContainer();

    const {
        memoryId,
        completedSentence,
        scenes = [],
        alignment,
        bucket,
        transitionPattern,
        onContinue,
    } = args;

    const container = document.createElement('div');
    container.id = CONTAINER_ID;

    const sentenceText = completedSentence && completedSentence.trim()
        ? completedSentence
        : '— this memory now bears your trace. —';

    container.innerHTML = `
        <div class="fps-title">your engraving</div>
        <div class="fps-sentence">${sentenceText.replace(/</g, '&lt;')}</div>
        <button class="fps-cta" data-fps-action="continue">Continue</button>
    `;
    document.body.appendChild(container);
    requestAnimationFrame(() => container.classList.add('visible'));

    function showNamePrompt() {
        const ctaEl = container.querySelector('.fps-cta');
        if (ctaEl) ctaEl.remove();
        const prompt = document.createElement('div');
        prompt.className = 'fps-name-prompt';
        prompt.innerHTML = `
            <div class="fps-name-line">너의 이름을 알려줘.</div>
            <input type="text" class="fps-name-input" maxlength="32" autocomplete="off" />
            <div class="fps-name-hint">press enter</div>
        `;
        container.appendChild(prompt);
        const input = prompt.querySelector('.fps-name-input');
        setTimeout(() => input?.focus(), 50);

        const submit = () => {
            const v = (input?.value || '').trim();
            if (!v) return;
            setUserName(v);
            saveFirstPlayData(memoryId, {
                scenes,
                alignment_score: alignment,
                alignment_bucket: bucket,
                transition_pattern: transitionPattern,
                completed_sentence: completedSentence,
            });
            container.style.opacity = '0';
            setTimeout(() => {
                _removeContainer();
                if (typeof onContinue === 'function') onContinue();
            }, 800);
        };
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            }
        });
    }

    container.querySelector('[data-fps-action="continue"]')?.addEventListener('click', showNamePrompt);
}

export function dismissFirstPlayScenification() {
    _removeContainer();
}

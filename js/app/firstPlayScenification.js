/**
 * First-Play Scenification — V2-13.
 *
 * Triggered after first play of a memory. Shows scene-by-scene wave + the
 * memory's completed sentence + Continue button → inline nickname input.
 *
 * Reuses `emotionVectorToWaveStyle` from `shared/math.js` and re-implements a
 * lightweight wave drawing loop (comparison.js wave loop is tightly coupled
 * to its own DOM/state).
 */

import { emotionVectorToWaveStyle } from '../shared/math.js';
import { setUserName, saveFirstPlayData } from './userIdentity.js';

const CONTAINER_ID = 'firstPlayScenification';
const STYLE_ID = 'firstPlayScenificationStyle';

let _animId = null;
let _t = 0;
let _audioRef = null;  // 현재 재생 중인 더빙 오디오 (cleanup용)

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
#${CONTAINER_ID} .fps-waves {
    width: min(720px, 90vw);
    display: flex; flex-direction: column;
    gap: 1.2vh; margin-bottom: 4vh;
}
#${CONTAINER_ID} .fps-wave-row {
    display: flex; align-items: center; gap: 1rem;
    height: 60px;
}
#${CONTAINER_ID} .fps-wave-idx {
    font-size: 0.75rem; opacity: 0.4;
    width: 2rem; text-align: right;
}
#${CONTAINER_ID} .fps-wave-canvas {
    flex: 1; height: 60px;
    background: rgba(18, 18, 26, 1);
    border-radius: 2px;
}
#${CONTAINER_ID} .fps-cta {
    background: transparent;
    border: 1px solid rgba(216, 216, 224, 0.4);
    color: #d8d8e0;
    padding: 0.9em 2.4em;
    font-size: 0.9rem; letter-spacing: 0.25em;
    cursor: pointer;
    transition: opacity 1.2s ease, border-color 0.4s ease, background 0.4s ease;
    text-transform: uppercase;
    font-family: inherit;
    opacity: 1;
}
#${CONTAINER_ID} .fps-cta:hover {
    border-color: rgba(216, 216, 224, 0.9);
    background: rgba(216, 216, 224, 0.05);
}
#${CONTAINER_ID} .fps-cta.fps-cta-hidden {
    opacity: 0;
    pointer-events: none;
}
#${CONTAINER_ID} .fps-loading {
    font-size: 1.4rem;
    letter-spacing: 0.6em;
    opacity: 0.45;
    margin-bottom: 0;
    transition: opacity 0.8s ease;
    animation: fps-loading-pulse 1.6s ease-in-out infinite;
}
@keyframes fps-loading-pulse {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 0.65; }
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

function _pnoise(x, y, z) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + (z || 0) * 37.719) * 43758.5453;
    return n - Math.floor(n);
}

function _drawWave(ctx, w, h, ws, tOff, alpha) {
    const cy = h / 2;
    const t = _t + tOff;
    const pts = [];
    const seg = 120;
    for (let i = 0; i <= seg; i++) {
        const x = (i / seg) * w;
        const nx = x / w;
        let y = Math.sin(x * ws.frequency + t * ws.speed) * ws.amplitude;
        y += Math.sin(x * ws.frequency * 2.3 + t * ws.speed * 0.7) * (ws.amplitude * 0.4);
        y += Math.sin(x * ws.frequency * 0.4 + t * ws.speed * 0.3) * (ws.amplitude * 0.6);
        y += (_pnoise(x * 0.01, t * 0.1, 0) - 0.5) * ws.chaos * 15;
        y *= Math.sin(nx * Math.PI);
        pts.push({ x, y: cy + y });
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 2; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    const c = ws.color;
    ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function _startAnim(canvases) {
    _stopAnim();
    _t = 0;
    const inits = new Map();
    function initCanvas(c) {
        if (!c || c.offsetWidth === 0 || c.offsetHeight === 0) return false;
        if (inits.has(c)) return true;
        const ctx = c.getContext('2d');
        c.width = c.offsetWidth * 2;
        c.height = c.offsetHeight * 2;
        ctx.scale(2, 2);
        inits.set(c, true);
        return true;
    }
    function loop() {
        canvases.forEach(({ canvas, waveStyle }) => {
            if (!canvas || !waveStyle) return;
            if (!initCanvas(canvas)) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width / 2;
            const h = canvas.height / 2;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(18, 18, 26, 1)';
            ctx.fillRect(0, 0, w, h);
            _drawWave(ctx, w, h, waveStyle, 0, 0.85);
        });
        _t += 0.016;
        _animId = requestAnimationFrame(loop);
    }
    loop();
}

function _removeContainer() {
    _stopAnim();
    if (_audioRef) {
        try { _audioRef.pause(); _audioRef.src = ''; } catch (e) { /* noop */ }
        _audioRef = null;
    }
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
 * @param {Promise<{audioUrl: string, narrationText: string} | null>} [args.narrationPromise]
 *        Optional. 있으면 음성 끝날 때까지 Continue 버튼 숨김. 없거나 null 응답이면 즉시 Continue 보임.
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
        narrationPromise,
        onContinue,
    } = args;

    const container = document.createElement('div');
    container.id = CONTAINER_ID;

    const sentenceText = completedSentence && completedSentence.trim()
        ? completedSentence
        : '— this memory now bears your trace. —';

    const wavesHtml = scenes.map((s, i) => `
        <div class="fps-wave-row">
            <div class="fps-wave-idx">${i + 1}</div>
            <canvas class="fps-wave-canvas" data-fps-idx="${i}"></canvas>
        </div>
    `).join('');

    // narrationPromise 있으면 Continue 버튼 초기 숨김 + 로딩 dots 표시.
    // 없으면 기존 동작(즉시 Continue 보임) 그대로.
    const hasNarration = !!narrationPromise;
    const ctaClass = hasNarration ? 'fps-cta fps-cta-hidden' : 'fps-cta';
    const loadingHtml = hasNarration ? '<div class="fps-loading">···</div>' : '';

    container.innerHTML = `
        <div class="fps-title">your engraving</div>
        <div class="fps-sentence">${sentenceText.replace(/</g, '&lt;')}</div>
        <div class="fps-waves">${wavesHtml}</div>
        ${loadingHtml}
        <button class="${ctaClass}" data-fps-action="continue">Continue</button>
    `;
    document.body.appendChild(container);
    requestAnimationFrame(() => container.classList.add('visible'));

    const canvasItems = scenes.map((s, i) => ({
        canvas: container.querySelector(`canvas[data-fps-idx="${i}"]`),
        waveStyle: s.userEmotion ? emotionVectorToWaveStyle(s.userEmotion) : null,
    }));
    setTimeout(() => _startAnim(canvasItems), 250);

    // ── 더빙 음성 처리 ───────────────────────────────────────────
    if (hasNarration) {
        const revealContinue = () => {
            const loadingEl = container.querySelector('.fps-loading');
            if (loadingEl) {
                loadingEl.style.opacity = '0';
                setTimeout(() => loadingEl.remove(), 800);
            }
            const ctaEl = container.querySelector('.fps-cta');
            if (ctaEl) ctaEl.classList.remove('fps-cta-hidden');
        };

        narrationPromise.then((result) => {
            if (!result || !result.audioUrl) {
                console.log('[firstPlayScenification] 더빙 없음 (실패 또는 비활성) — Continue 즉시 활성');
                revealContinue();
                return;
            }
            const audio = new Audio(result.audioUrl);
            audio.volume = 0.95;
            audio.preload = 'auto';
            _audioRef = audio;

            const onEndedOrError = () => {
                audio.removeEventListener('ended', onEndedOrError);
                audio.removeEventListener('error', onEndedOrError);
                revealContinue();
            };
            audio.addEventListener('ended', onEndedOrError);
            audio.addEventListener('error', onEndedOrError);

            audio.play().catch((e) => {
                console.warn('[firstPlayScenification] audio.play() 실패:', e?.message || e);
                // 브라우저 자동재생 차단 등 — Continue 즉시 활성해서 흐름 안 끊김
                revealContinue();
            });
        }).catch((e) => {
            console.warn('[firstPlayScenification] narrationPromise 거부:', e?.message || e);
            revealContinue();
        });
    }

    function showNamePrompt() {
        const wavesEl = container.querySelector('.fps-waves');
        const ctaEl = container.querySelector('.fps-cta');
        if (wavesEl) wavesEl.style.opacity = '0.35';
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

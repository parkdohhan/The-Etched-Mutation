/**
 * Play Replay Compare — V2-13.
 *
 * Triggered after second play of a memory (first-play data already saved
 * under `tem_first_play:<memoryId>` in localStorage). Shows two waves per
 * scene side-by-side: faint first-play wave + bright second-play wave.
 *
 * Reuses `emotionVectorToWaveStyle` from `shared/math.js`.
 */

import { emotionVectorToWaveStyle } from '../shared/math.js';
import { getFirstPlayData, getUserName } from './userIdentity.js';

const CONTAINER_ID = 'playReplayCompare';
const STYLE_ID = 'playReplayCompareStyle';

let _animId = null;
let _t = 0;

function _injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
#${CONTAINER_ID} {
    position: fixed; inset: 0;
    background: rgba(8, 8, 12, 0.97);
    z-index: 2600;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 4vh 5vw;
    opacity: 0; transition: opacity 1.4s ease;
    color: #d8d8e0;
    font-family: inherit;
    overflow-y: auto;
}
#${CONTAINER_ID}.visible { opacity: 1; }
#${CONTAINER_ID} .prc-title {
    font-size: 0.85rem; letter-spacing: 0.3em;
    opacity: 0.55; margin-bottom: 1.5vh;
    text-transform: uppercase;
}
#${CONTAINER_ID} .prc-greeting {
    font-size: 1.0rem; opacity: 0.7;
    margin-bottom: 3vh; letter-spacing: 0.04em;
}
#${CONTAINER_ID} .prc-sentence {
    font-size: 1.4rem; line-height: 1.55;
    text-align: center; max-width: 720px;
    margin-bottom: 3vh; opacity: 0.9;
    font-weight: 300; letter-spacing: 0.02em;
}
#${CONTAINER_ID} .prc-legend {
    display: flex; gap: 2.5em;
    margin-bottom: 2vh;
    font-size: 0.75rem; letter-spacing: 0.15em;
    opacity: 0.7; text-transform: uppercase;
}
#${CONTAINER_ID} .prc-legend span::before {
    content: ''; display: inline-block;
    width: 16px; height: 2px; margin-right: 0.6em;
    vertical-align: middle;
    background: currentColor;
}
#${CONTAINER_ID} .prc-legend .first { opacity: 0.45; }
#${CONTAINER_ID} .prc-legend .second { opacity: 1; }
#${CONTAINER_ID} .prc-waves {
    width: min(720px, 90vw);
    display: flex; flex-direction: column;
    gap: 1.5vh; margin-bottom: 4vh;
}
#${CONTAINER_ID} .prc-wave-row {
    display: flex; align-items: center; gap: 1rem;
    height: 80px;
}
#${CONTAINER_ID} .prc-wave-idx {
    font-size: 0.75rem; opacity: 0.4;
    width: 2rem; text-align: right;
}
#${CONTAINER_ID} .prc-wave-canvas {
    flex: 1; height: 80px;
    background: rgba(18, 18, 26, 1);
    border-radius: 2px;
}
#${CONTAINER_ID} .prc-cta {
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
#${CONTAINER_ID} .prc-cta:hover {
    border-color: rgba(216, 216, 224, 0.9);
    background: rgba(216, 216, 224, 0.05);
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
        canvases.forEach(({ canvas, firstStyle, secondStyle }) => {
            if (!canvas) return;
            if (!initCanvas(canvas)) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width / 2;
            const h = canvas.height / 2;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(18, 18, 26, 1)';
            ctx.fillRect(0, 0, w, h);
            // First play first (faint, behind)
            if (firstStyle) _drawWave(ctx, w, h, firstStyle, 30, 0.35);
            // Second play on top (bright)
            if (secondStyle) _drawWave(ctx, w, h, secondStyle, 0, 0.9);
        });
        _t += 0.016;
        _animId = requestAnimationFrame(loop);
    }
    loop();
}

function _removeContainer() {
    _stopAnim();
    const el = document.getElementById(CONTAINER_ID);
    if (el) el.remove();
}

/**
 * @param {object} args
 * @param {string} args.memoryId
 * @param {string} args.completedSentence — second play's completed sentence
 * @param {Array<{ sceneIndex: number, sceneId?: string, sceneText?: string, userEmotion: object, userReason?: string }>} args.secondScenes
 * @param {number} [args.secondAlignment]
 * @param {string} [args.secondBucket]
 * @param {string} [args.secondTransitionPattern]
 * @param {() => void} [args.onContinue]
 */
export async function showPlayReplayCompare(args) {
    _injectStyles();
    _removeContainer();

    const {
        memoryId,
        completedSentence,
        secondScenes = [],
        onContinue,
    } = args;

    const firstPlay = getFirstPlayData(memoryId);
    const userName = getUserName();

    const sceneCount = Math.max(secondScenes.length, firstPlay?.scenes?.length || 0);
    const sentenceText = completedSentence && completedSentence.trim()
        ? completedSentence
        : '— a second engraving rests over the first. —';

    const greetingText = userName
        ? `${userName}, 너의 두 번째 새김.`
        : '너의 두 번째 새김.';

    const wavesHtml = Array.from({ length: sceneCount }).map((_, i) => `
        <div class="prc-wave-row">
            <div class="prc-wave-idx">${i + 1}</div>
            <canvas class="prc-wave-canvas" data-prc-idx="${i}"></canvas>
        </div>
    `).join('');

    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.innerHTML = `
        <div class="prc-title">re-engraving</div>
        <div class="prc-greeting">${greetingText.replace(/</g, '&lt;')}</div>
        <div class="prc-sentence">${sentenceText.replace(/</g, '&lt;')}</div>
        <div class="prc-legend">
            <span class="first">first</span>
            <span class="second">now</span>
        </div>
        <div class="prc-waves">${wavesHtml}</div>
        <button class="prc-cta" data-prc-action="continue">Continue</button>
    `;
    document.body.appendChild(container);
    requestAnimationFrame(() => container.classList.add('visible'));

    const canvasItems = Array.from({ length: sceneCount }).map((_, i) => {
        const firstScene = firstPlay?.scenes?.[i];
        const secondScene = secondScenes[i];
        return {
            canvas: container.querySelector(`canvas[data-prc-idx="${i}"]`),
            firstStyle: firstScene?.userEmotion ? emotionVectorToWaveStyle(firstScene.userEmotion) : null,
            secondStyle: secondScene?.userEmotion ? emotionVectorToWaveStyle(secondScene.userEmotion) : null,
        };
    });
    setTimeout(() => _startAnim(canvasItems), 250);

    container.querySelector('[data-prc-action="continue"]')?.addEventListener('click', () => {
        container.style.opacity = '0';
        setTimeout(() => {
            _removeContainer();
            if (typeof onContinue === 'function') onContinue();
        }, 800);
    });
}

export function dismissPlayReplayCompare() {
    _removeContainer();
}

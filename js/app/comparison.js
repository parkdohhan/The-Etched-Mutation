import { appStore } from './appStore.js';
/**
 * Comparison Module — comparison view, merged wave, session end.
 *
 * Dependencies accessed via window.* (temporary, phase 3 cleanup):
 *   window.appStore, window.showEndScreen, window.currentStoryData,
 *   window.archiveAlignmentResult, window.archiveUserEmotions,
 *   window.archiveWaveData, window.showStrataView
 */

import { emotionVectorToWaveStyle } from '../shared/math.js';
import { byeoriEngine } from '../core/ByeoriEngine.js';
import { networkService } from '../services/NetworkService.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

let comparisonScenes = [];
let comparisonCurrentIndex = 0;
async function calculateAverageAlignment() { return { averageAlignment: appStore.getState().currentAlignment || 0, isTrueEnding: (appStore.getState().currentAlignment || 0) >= 0.65 }; }
async function showComparisonView() {
    try {
        const currentData = window.currentStoryData || null;
        if (!currentData || !currentData.scenes) {
            console.error('비교 화면: Scene 데이터가 not found');
            return;
        }
        const state = appStore.getState();
        const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);
        if (!memoryId) {
            console.error('비교 화면: memory_id를 not found');
            return;
        }
 // expInterview 시 모든 scene 서 wave 측정되므 , 모든 scene check
        const scenesWithEmotions = currentData.scenes.filter((scene, index) =>
            window.archiveUserEmotions && window.archiveUserEmotions[index]
        );
        if (scenesWithEmotions.length === 0) {
            console.log('비교 화면: 비교할 장면이 not found');
            const alignmentResult = await calculateAverageAlignment();
            window.showEndScreen(alignmentResult);
            return;
        }
        comparisonScenes = [];
        supabaseClient = getSupabaseClient();
        for (let i = 0; i < currentData.scenes.length; i++) {
            const scene = currentData.scenes[i];
 // expInterview 시 모든 scene 서 wave 측정되므 , 모든 scene check
            const userEmotionData = window.archiveUserEmotions && window.archiveUserEmotions[i] ? window.archiveUserEmotions[i] : null;
            if (userEmotionData) {
                let playData = null;
                let sceneAlignment = null;
                
 // expInterview collect 최신 alignment 우선 
                if (window.archiveSceneAlignments && window.archiveSceneAlignments[i] !== undefined) {
                    sceneAlignment = window.archiveSceneAlignments[i];
                    console.log(`[비교 화면] Scene ${i}: expInterview Alignment 사용:`, sceneAlignment);
                }
                
 // DB 서 plays data query (fallback용, expInterview data 없 때 )
                if (supabaseClient && scene.id) {
                    const { data: playsData, error: playsError } = await supabaseClient
                        .from('plays')
                        .select('user_emotion, user_reason, alignment')
                        .eq('scene_id', scene.id)
                        .eq('memory_id', memoryId)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                    if (playsError) {
                        console.warn(`[비교 화면] Scene ${scene.id} plays 조회 Failed:`, playsError);
                    }
                    if (playsData) {
                        playData = playsData;
 // expInterview alignment 없 때 DB alignment 
                        if (sceneAlignment === null) {
                            sceneAlignment = playsData.alignment;
                        }
                    }
                }
                
                if (!playData && !userEmotionData) {
                    console.log(`[비교 화면] Scene ${i} (${scene.id}): plays 데이터와 archiveUserEmotions 모두 없음, 스킵`);
                    continue;
                }
 // expInterview collect 최신 data 우선 
                let userEmotion = (userEmotionData ? userEmotionData.emotion : null) || playData?.user_emotion;
                let userReason = (userEmotionData ? userEmotionData.reason : null) || playData?.user_reason;
                let originalEmotion = scene.originalEmotion || scene.original_emotion;
                if (typeof userEmotion === 'string') {
                    try {
                        userEmotion = JSON.parse(userEmotion);
                    } catch (e) {
                        console.error(`[비교 화면] user_emotion 파싱 실패 (scene ${i}):`, e);
                    }
                }
                if (typeof originalEmotion === 'string') {
                    try {
                        originalEmotion = JSON.parse(originalEmotion);
                    } catch (e) {
                        console.error(`[비교 화면] originalEmotion 파싱 실패 (scene ${i}):`, e);
                    }
                }
                if (!userEmotion || !originalEmotion) {
                    console.warn(`[비교 화면] Scene ${i} (${scene.id}): 감정 벡터 누락`, {
                        hasUserEmotion: !!userEmotion,
                        hasOriginalEmotion: !!originalEmotion
                    });
                    continue;
                }
                console.log(`[비교 화면] Scene ${i} 데이터:`, {
                    sceneId: scene.id,
                    sceneType: scene.sceneType,
                    userEmotion: userEmotion,
                    originalEmotion: originalEmotion,
                    userEmotionType: typeof userEmotion,
                    originalEmotionType: typeof originalEmotion,
                    userEmotionKeys: userEmotion ? Object.keys(userEmotion) : null,
                    originalEmotionKeys: originalEmotion ? Object.keys(originalEmotion) : null
                });
                comparisonScenes.push({
                    scene: scene,
                    sceneIndex: i,
                    userEmotion: userEmotion,
                    userReason: userReason || '',
                    originalEmotion: originalEmotion,
                    originalReason: scene.originalReason || '',
                    alignment: sceneAlignment
                });
            }
        }
        if (comparisonScenes.length === 0) {
            console.log('비교 화면: 비교할 장면이 not found');
            const alignmentResult = await calculateAverageAlignment();
            window.showEndScreen(alignmentResult);
            return;
        }
        comparisonCurrentIndex = 0;
        const alignmentResult = await calculateAverageAlignment();
        window.archiveAlignmentResult = alignmentResult;
        const comparisonViewEl = document.getElementById('comparisonView');
        if (comparisonViewEl) {
            comparisonViewEl.style.display = 'flex';
            comparisonViewEl.style.zIndex = '2500';
        }
        renderComparisonView();
        setupComparisonSwipe();
 // sessionend button event listener add
        const endSessionBtn = comparisonViewEl.querySelector('.live-exit-btn');
        if (endSessionBtn) {
 // existing event remove 후 새 add
            endSessionBtn.replaceWith(endSessionBtn.cloneNode(true));
            const newEndSessionBtn = comparisonViewEl.querySelector('.live-exit-btn');
            newEndSessionBtn.addEventListener('click', async () => {
                console.log('[Ending] Session end button clicked');
                await endComparisonSession();
            });
            console.log('[Ending] Session end button event listener added');
        } else {
            console.warn('[Ending] Session end button not found');
        }
    } catch (e) {
        console.error('showComparisonView error:', e);
        window.showEndScreen();
    }
}
function renderComparisonView() {
    if (comparisonScenes.length === 0) return;
    const container = document.getElementById('comparisonScenesContainer');
    const dotsContainer = document.getElementById('comparisonDots');
    const counterEl = document.getElementById('comparisonSceneCounter');
    if (!container || !dotsContainer || !counterEl) return;
    container.innerHTML = '';
    dotsContainer.innerHTML = '';
    comparisonScenes.forEach((item, index) => {
        let alignment = item.alignment;
        if (alignment === null || alignment === undefined) {
            if (item.userEmotion && item.originalEmotion) {
                const er = byeoriEngine.calculateStep(
                    {
                        userVector: { base: item.userEmotion },
                        originalVector: { base: item.originalEmotion },
                        userTrajectory: [],
                        originalTrajectory: [],
                        sceneScores: []
                    }, {});
                alignment = er.alignment_score;
            } else { alignment = 0; }
        }
        let bucket = 'LOW';
        if (alignment >= 0.55) bucket = 'HIGH';
        else if (alignment >= 0.3) bucket = 'MID';
        item._bucket = bucket;
        item._alignment = alignment;

        const slide = document.createElement('div');
        slide.className = 'comparison-scene-slide';
        slide.innerHTML = `
            <div class="comparison-scene-text">${item.scene.text || ''}</div>
            <div class="comparison-waves-container">
                <div class="comparison-wave-item" style="width:100%">
                    <div class="comparison-wave-label user">Your Emotion</div>
                    <div class="comparison-wave-canvas-container">
                        <canvas class="comparison-wave-canvas" data-type="merged" data-index="${index}"></canvas>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(slide);
        const dot = document.createElement('div');
        dot.className = 'comparison-dot';
        if (index === 0) dot.classList.add('active');
        dot.onclick = () => navigateComparisonTo(index);
        dotsContainer.appendChild(dot);
    });
    counterEl.textContent = `${comparisonCurrentIndex + 1} / ${comparisonScenes.length}`;
    updateComparisonNavigation();

    const scenesWithWaveStyles = comparisonScenes.map(item => ({
        userEmotion: item.userEmotion,
        originalEmotion: item.originalEmotion,
        userWaveStyle: item.userEmotion ? emotionVectorToWaveStyle(item.userEmotion) : null,
        originalWaveStyle: item.originalEmotion ? emotionVectorToWaveStyle(item.originalEmotion) : null,
        bucket: item._bucket,
        alignment: item._alignment
    }));

    startBucketComparisonWaveAnimation(scenesWithWaveStyles);
    updateComparisonAlignment();
    updateComparisonAverageAlignment();
}
function updateComparisonAlignment() {
    if (comparisonScenes.length === 0 || comparisonCurrentIndex >= comparisonScenes.length) {
        console.warn('[updateComparisonAlignment] No comparison scenes');
        return;
    }
    const item = comparisonScenes[comparisonCurrentIndex];
    console.log(`[updateComparisonAlignment] Scene ${comparisonCurrentIndex}:`, {
        hasAlignment: item.alignment !== null && item.alignment !== undefined,
        alignment: item.alignment,
        hasUserEmotion: !!item.userEmotion,
        hasOriginalEmotion: !!item.originalEmotion,
        userEmotion: item.userEmotion,
        originalEmotion: item.originalEmotion
    });
    let alignment = null;
    if (item.alignment !== null && item.alignment !== undefined) {
        alignment = item.alignment;
        console.log(`[updateComparisonAlignment] 저장된 Alignment 사용: ${alignment}`);
    } else if (item.userEmotion && item.originalEmotion) {
        console.log(`[updateComparisonAlignment] Alignment 계산 시작...`);
        let anchorEmotions = item.scene?.anchor_emotions || null;
        if (anchorEmotions && typeof anchorEmotions === 'string') { try { anchorEmotions = JSON.parse(anchorEmotions) } catch (e) { anchorEmotions = null } } if (anchorEmotions && !Array.isArray(anchorEmotions)) { anchorEmotions = null }
        const engineResult = byeoriEngine.calculateStep({
            userVector: { base: item.userEmotion },
            originalVector: { base: item.originalEmotion },
            anchorEmotions: anchorEmotions,
            userTrajectory: [],
            originalTrajectory: [],
            sceneScores: []
        }, {});
        alignment = engineResult.alignment_score;
        console.log(`[updateComparisonAlignment] 계산된 Alignment: ${alignment}`);
    } else {
        console.warn(`[updateComparisonAlignment] Alignment를 계산할 수 not found:`, {
            hasUserEmotion: !!item.userEmotion,
            hasOriginalEmotion: !!item.originalEmotion
        });
    }
    if (alignment === null) {
        console.warn('[updateComparisonAlignment] Alignment가 null');
        return;
    }
    const alignmentValueEl = document.getElementById('comparisonAlignmentValue');
    const alignmentFillEl = document.getElementById('comparisonAlignmentFill');
    if (alignmentValueEl) {
        alignmentValueEl.textContent = alignment.toFixed(2);
        console.log(`[updateComparisonAlignment] Alignment 표시 update: ${alignment.toFixed(2)}`);
    }
    if (alignmentFillEl) {
        alignmentFillEl.style.width = (alignment * 100) + '%';
    }
}
function updateComparisonAverageAlignment() {
    const alignmentResult = window.archiveAlignmentResult;
    if (!alignmentResult) return;
    const averageValueEl = document.getElementById('comparisonAverageAlignmentValue');
    const averageFillEl = document.getElementById('comparisonAverageAlignmentFill');
    const trueEndingBadge = document.getElementById('comparisonTrueEndingBadge');
    if (averageValueEl) {
        averageValueEl.textContent = alignmentResult.averageAlignment.toFixed(2);
    }
    if (averageFillEl) {
        averageFillEl.style.width = (alignmentResult.averageAlignment * 100) + '%';
    }
    if (trueEndingBadge) {
        if (alignmentResult.isTrueEnding) {
            trueEndingBadge.style.display = 'inline-block';
        } else {
            trueEndingBadge.style.display = 'none';
        }
    }
}
function navigateComparison(direction) {
    const newIndex = comparisonCurrentIndex + direction;
    if (newIndex < 0 || newIndex >= comparisonScenes.length) return;
    comparisonCurrentIndex = newIndex;
    const container = document.getElementById('comparisonScenesContainer');
    if (container) {
        container.style.transform = `translateX(-${comparisonCurrentIndex * 100}%)`;
    }
    const dots = document.querySelectorAll('.comparison-dot');
    dots.forEach((dot, index) => {
        if (index === comparisonCurrentIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
    const counterEl = document.getElementById('comparisonSceneCounter');
    if (counterEl) {
        counterEl.textContent = `${comparisonCurrentIndex + 1} / ${comparisonScenes.length}`;
    }
    updateComparisonNavigation();
    updateComparisonAlignment();
}
function navigateComparisonTo(index) {
    if (index < 0 || index >= comparisonScenes.length) return;
    comparisonCurrentIndex = index;
    const container = document.getElementById('comparisonScenesContainer');
    if (container) {
        container.style.transform = `translateX(-${comparisonCurrentIndex * 100}%)`;
    }
    const dots = document.querySelectorAll('.comparison-dot');
    dots.forEach((dot, idx) => {
        if (idx === comparisonCurrentIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
    const counterEl = document.getElementById('comparisonSceneCounter');
    if (counterEl) {
        counterEl.textContent = `${comparisonCurrentIndex + 1} / ${comparisonScenes.length}`;
    }
    updateComparisonNavigation();
    updateComparisonAlignment();
}
function updateComparisonNavigation() {
    const prevBtn = document.getElementById('comparisonPrevBtn');
    const nextBtn = document.getElementById('comparisonNextBtn');
    if (prevBtn) {
        prevBtn.disabled = comparisonCurrentIndex === 0;
    }
    if (nextBtn) {
        nextBtn.disabled = comparisonCurrentIndex === comparisonScenes.length - 1;
    }
}
function setupComparisonSwipe() {
    const swiper = document.getElementById('comparisonSwiper');
    if (!swiper) return;
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    swiper.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
    });
    swiper.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
    });
    swiper.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        const diff = startX - currentX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                navigateComparison(1);
            } else {
                navigateComparison(-1);
            }
        }
    });
}
let _bucketCompAnimId = null;
let _bucketCompTime = 0;
function _pnoise(x, y, z) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + (z || 0) * 37.719) * 43758.5453;
    return n - Math.floor(n);
}
function stopBucketComparisonWaveAnimation() {
    if (_bucketCompAnimId) { cancelAnimationFrame(_bucketCompAnimId); _bucketCompAnimId = null; }
}
function startBucketComparisonWaveAnimation(scenesData) {
    stopBucketComparisonWaveAnimation();
    _bucketCompTime = 0;
    const initializedCanvases = new Map();
    function initCanvas(c) {
        if (!c || c.offsetWidth === 0 || c.offsetHeight === 0) return false;
        if (initializedCanvases.has(c)) return true;
        const ctx = c.getContext('2d');
        c.width = c.offsetWidth * 2;
        c.height = c.offsetHeight * 2;
        ctx.scale(2, 2);
        initializedCanvases.set(c, true);
        return true;
    }
    function drawWave(ctx, w, h, ws, tOff, alpha) {
        const cy = h / 2;
        const t = _bucketCompTime + tOff;
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
    function drawNoise(ctx, w, h, intensity) {
        const t = _bucketCompTime;
        const cy = h / 2;
        ctx.save();
        for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            const a = 0.04 + intensity * 0.06;
            ctx.strokeStyle = `rgba(180,180,200,${a})`;
            ctx.lineWidth = 0.5;
            for (let x = 0; x < w; x += 2) {
                const n = (_pnoise(x * 0.05 + j * 11, t * 0.15, j * 7) - 0.5) * (8 + intensity * 20);
                const y = cy + n + Math.sin(x * 0.03 + t * 0.5 + j) * (2 + intensity * 4);
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.restore();
    }
    function animate() {
        scenesData.forEach((item, index) => {
            const canvas = document.querySelector(`canvas[data-type="merged"][data-index="${index}"]`);
            if (!canvas || !item.userWaveStyle) return;
            if (!initCanvas(canvas)) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width / 2;
            const h = canvas.height / 2;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(18, 18, 26, 1)';
            ctx.fillRect(0, 0, w, h);
            const bucket = item.bucket;
            drawWave(ctx, w, h, item.userWaveStyle, 0, 0.8);
            if (bucket === 'MID') {
                drawNoise(ctx, w, h, 0.3);
            } else if (bucket === 'HIGH' && item.originalWaveStyle) {
                drawWave(ctx, w, h, item.originalWaveStyle, 50, 0.2);
                drawNoise(ctx, w, h, 0.7);
            }
        });
        _bucketCompTime += 0.016;
        _bucketCompAnimId = requestAnimationFrame(animate);
    }
    animate();
}
function closeComparisonView() {
    stopBucketComparisonWaveAnimation();
    const comparisonViewEl = document.getElementById('comparisonView');
    if (comparisonViewEl) {
        comparisonViewEl.style.display = 'none';
    }
    const alignmentResult = window.archiveAlignmentResult || { averageAlignment: 0, isTrueEnding: false };
    window.showEndScreen(alignmentResult);
}
async function endComparisonSession() {
    console.log('[Ending] endComparisonSession called');
    try {
        stopBucketComparisonWaveAnimation();
        const comparisonViewEl = document.getElementById('comparisonView');
        if (comparisonViewEl) {
            comparisonViewEl.style.display = 'none';
            comparisonViewEl.style.zIndex = '-1';
        }
 // alignment result 없으면 calculation
        let alignmentResult = window.archiveAlignmentResult;
        if (!alignmentResult) {
            console.log('[Ending] Alignment 계산 중...');
            alignmentResult = await calculateAverageAlignment();
            window.archiveAlignmentResult = alignmentResult;
            console.log('[Ending] Alignment 계산 complete:', alignmentResult);
        } else {
            console.log('[Ending] 기존 Alignment 사용:', alignmentResult);
        }
        
 // Strata 3D strata view display
        const currentData = window.currentStoryData || null;
        const state = appStore.getState();
        const memoryId = currentData.id || (state.allMemoriesData[state.currentMemory] && state.allMemoriesData[state.currentMemory].id);

        console.log('[Ending] Strata view check:', {
            memoryId: memoryId,
            hasShowStrataView: typeof window.showStrataView === 'function',
            currentData: currentData,
            currentMemory: state.currentMemory,
            allMemoriesDataLength: state.allMemoriesData.length
        });

        if (memoryId && typeof window.showStrataView === 'function') {
            console.log('[Ending] Strata view display start:', memoryId);
            try {
                await window.showStrataView(memoryId, alignmentResult, () => {
                    console.log('[Ending] Strata view closed, moving to ending screen');
                    window.showEndScreen(alignmentResult, true);
                });
                console.log('[Ending] Strata view display complete');
            } catch (strataError) {
                console.error('[Ending] Strata view display error:', strataError);
                await window.showEndScreen(alignmentResult, true);
            }
        } else {
            if (!memoryId) {
                console.warn('[Ending] memoryId not found. currentData:', currentData);
            }
            if (typeof window.showStrataView !== 'function') {
                console.warn('[Ending] window.showStrataView is not defined. Make sure strataView.js is loaded.');
            }
            console.log('[Ending] Strata view unavailable, going directly to ending screen');
            await window.showEndScreen(alignmentResult, true);
        }
    } catch (e) {
        console.error('[Ending] endComparisonSession error:', e);
        window.showEndScreen(null, true);
    }
}
window.navigateComparison = navigateComparison;
window.closeComparisonView = closeComparisonView;
window.endComparisonSession = endComparisonSession;

// ─────────────────────────────────────
// === Exports ===
// ─────────────────────────────────────

export {
    calculateAverageAlignment,
    showComparisonView,
    renderComparisonView,
    updateComparisonAlignment,
    updateComparisonAverageAlignment,
    navigateComparison,
    navigateComparisonTo,
    updateComparisonNavigation,
    setupComparisonSwipe,
    startBucketComparisonWaveAnimation,
    stopBucketComparisonWaveAnimation,
    closeComparisonView,
    endComparisonSession,
};

// js/app/endScreen.js
// End-screen display logic extracted from index.js.
// Handles session termination UI: alignment display, true/normal ending, original memory modal.

import { appStore } from './appStore.js';
import { networkService } from '../services/NetworkService.js';
import { visualizer } from '../ui/Visualizer.js';
import { showNpcDialogue } from '../ui/notify.js';
import { NPC_DIALOGUES } from '../npc-dialogues.js';
import { showTrueEndingNoteUI } from './auth.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { getSoundscape } from '../audio/getSoundscape.js';
import { hasFirstPlayData } from './userIdentity.js';

// ─── Internal helpers ─────────────────────────────────────────────

function stopBaseAnimations() {
    // Stop appStore-tracked wave animations (does not touch live voice — live.js handles those)
    const state = appStore.getState();
    if (state.waveAnimationId) {
        cancelAnimationFrame(state.waveAnimationId);
        appStore.setState({ waveAnimationId: null });
    }
    if (state.liveWaveAnimationId) {
        cancelAnimationFrame(state.liveWaveAnimationId);
        appStore.setState({ liveWaveAnimationId: null });
    }
    visualizer.stopAlignmentWaveAnimation();
}

function escapeHtml(text) {
    if (!text) return '—';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── showOriginalMemory ───────────────────────────────────────────

async function showOriginalMemory(memoryId) {
    try {
        console.log('=== Viewing Original ===');
        console.log('Memory ID:', memoryId);
        const scenesResult = await networkService.getScenesByMemoryId(memoryId);
        if (!scenesResult.ok) {
            console.error('Error loading original memory:', scenesResult.error);
            alert('Error loading original memory.');
            return;
        }
        const scenes = scenesResult.data || [];
        console.log('Scenes:', scenes.length);
        const modal = document.createElement('div');
        modal.className = 'original-memory-modal';
        modal.innerHTML = `<div class="original-memory-content">
            <h2>Original Memory</h2>
            <p class="original-note">This is the original memory left by the author.</p>
            <div class="original-scenes">
                ${scenes.map((scene, i) => `
                    <div class="original-scene">
                        <span class="scene-number">${i + 1}</span>
                        <p class="scene-text">${escapeHtml(scene.text)}</p>
                    </div>`).join('')}
            </div>
            <button class="close-original-btn" onclick="this.closest('.original-memory-modal').remove()">Close</button>
        </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    } catch (e) {
        console.error('showOriginalMemory error:', e);
        alert('Error loading original memory.');
    }
}

// ─── V2-13 re-entry handoff ───────────────────────────────────────

function _collectFirstPlaySnapshot(state) {
    const currentData = state.currentStoryData;
    if (!currentData) return null;
    const memoryId = currentData.id || (state.allMemoriesData?.[state.currentMemory]?.id);
    if (!memoryId) return null;
    const completedSentence = currentData.completed_sentence || '';
    const sourceScenes = Array.isArray(currentData.scenes) ? currentData.scenes : [];
    const recorded = (typeof window !== 'undefined' && window.archiveUserEmotions) || [];
    const scenes = sourceScenes.map((scene, i) => {
        const slot = recorded[i];
        if (!slot || !slot.emotion) return null;
        return {
            sceneIndex: i,
            sceneId: scene?.id || null,
            sceneText: scene?.text || '',
            userEmotion: slot.emotion,
            userReason: slot.reason || '',
        };
    }).filter(Boolean);
    return {
        memoryId,
        completedSentence,
        scenes,
    };
}

async function _maybeHandoffToReentryFlow(state, alignmentResult) {
    if (state.currentMode !== 'archive') return false;
    const snapshot = _collectFirstPlaySnapshot(state);
    if (!snapshot || !snapshot.memoryId || snapshot.scenes.length === 0) return false;

    stopBaseAnimations();
    const liveContainerEl = document.getElementById('liveContainer');
    if (liveContainerEl) { liveContainerEl.classList.remove('active'); liveContainerEl.style.display = 'none'; }
    const archiveContainerEl = document.getElementById('archiveContainer');
    if (archiveContainerEl) { archiveContainerEl.classList.remove('active'); archiveContainerEl.style.display = 'none'; }
    const sceneViewerEl = document.getElementById('sceneViewer');
    if (sceneViewerEl) { sceneViewerEl.classList.remove('active'); sceneViewerEl.style.display = 'none'; }
    const endScreenEl = document.getElementById('endScreen');
    if (endScreenEl) { endScreenEl.classList.remove('active'); endScreenEl.style.display = 'none'; }

    const alignment = alignmentResult?.averageAlignment ?? state.currentAlignment ?? 0;
    const bucket = state.currentBucket || null;
    const transitionPattern = state.currentTransitionPattern || null;

    const goHome = async () => {
        try {
            const opening = await import('./opening.js');
            if (typeof opening.returnToOpening === 'function') {
                opening.returnToOpening();
                return;
            }
            if (typeof opening.showOpening === 'function') {
                opening.showOpening();
                return;
            }
        } catch (e) { /* fall through */ }
        const introScreen = document.getElementById('introScreen');
        if (introScreen) {
            introScreen.classList.remove('hidden');
            introScreen.style.cssText = '';
        }
    };

    if (!hasFirstPlayData(snapshot.memoryId)) {
        const { showFirstPlayScenification } = await import('./firstPlayScenification.js');
        await showFirstPlayScenification({
            memoryId: snapshot.memoryId,
            completedSentence: snapshot.completedSentence,
            scenes: snapshot.scenes,
            alignment,
            bucket,
            transitionPattern,
            onContinue: () => { goHome(); },
        });
        return true;
    }

    try {
        const { showPlayReplayCompare } = await import('./playReplayCompare.js');
        await showPlayReplayCompare({
            memoryId: snapshot.memoryId,
            completedSentence: snapshot.completedSentence,
            secondScenes: snapshot.scenes,
            secondAlignment: alignment,
            secondBucket: bucket,
            secondTransitionPattern: transitionPattern,
            onContinue: () => { goHome(); },
        });
        return true;
    } catch (e) {
        console.warn('[Ending] playReplayCompare module not yet wired, falling back to legacy endScreen:', e?.message || e);
        return false;
    }
}

// ─── showEndScreen ────────────────────────────────────────────────

export async function showEndScreen(alignmentResult, forceEndScreen = false) {
    const soundscape = getSoundscape();
    if (soundscape) soundscape.stop();

    const state = appStore.getState();
    console.log('[Ending] showEndScreen called:', { alignmentResult, forceEndScreen, currentMode: state.currentMode });

    // ─── V2-13 re-entry sequence branch ─────────────────────────────
    // Archive mode only. First play → scenification + nickname input.
    // Second play → wave compare (first vs second).
    try {
        const handed = await _maybeHandoffToReentryFlow(state, alignmentResult);
        if (handed) return;
    } catch (e) {
        console.warn('[Ending] re-entry branch failed, falling through to legacy endScreen:', e);
    }

    try {
        stopBaseAnimations();

        const liveContainerEl = document.getElementById('liveContainer');
        if (liveContainerEl) { liveContainerEl.classList.remove('active'); liveContainerEl.style.display = 'none'; }
        const archiveContainerEl = document.getElementById('archiveContainer');
        if (archiveContainerEl) { archiveContainerEl.classList.remove('active'); archiveContainerEl.style.display = 'none'; }
        const sceneViewerEl = document.getElementById('sceneViewer');
        if (sceneViewerEl) { sceneViewerEl.classList.remove('active'); sceneViewerEl.style.display = 'none'; }

        console.log('[Ending] Ending screen display start');
        let finalAlignment = state.currentAlignment;
        let isTrueEnding = false;
        if (alignmentResult) {
            finalAlignment = alignmentResult.averageAlignment;
            isTrueEnding = alignmentResult.isTrueEnding;
        }
        console.log('[Ending] Alignment 계산 complete:', { finalAlignment, isTrueEnding });

        const endScreenEl = document.getElementById('endScreen');
        if (endScreenEl) {
            endScreenEl.classList.add('active');
            endScreenEl.style.cssText = 'display:flex !important';
            console.log('[Ending] Ending screen elements displayed');
        } else {
            console.error('[Ending] endScreen element not found!');
        }

        const currentData = appStore.getState().currentStoryData;
        const lastScene = currentData?.scenes?.length > 0 ? currentData.scenes[currentData.scenes.length - 1] : null;
        const lastChoiceIndex = state.userChoices.length > 0 ? state.userChoices[state.userChoices.length - 1] : 0;
        const lastReason = state.userReasons.length > 0 ? state.userReasons[state.userReasons.length - 1] : '—';

        const yourChoice = lastScene?.choices?.[lastChoiceIndex]?.text ?? '—';
        const theirChoice = lastScene?.choices?.[lastScene.originalChoice]?.text ?? '—';
        const theirReason = lastScene?.originalReason ?? '—';

        document.getElementById('finalAlignment').textContent = 'Emotional Structure Alignment: ' + finalAlignment.toFixed(2);

        if (isTrueEnding) {
            console.log('[Ending] 트루엔딩 표시');
            const trueBadge = document.getElementById('trueEndingBadge');
            const normalBadge = document.getElementById('normalEndingBadge');
            const subtitle = document.getElementById('endSubtitle');
            if (trueBadge) trueBadge.classList.add('active');
            if (normalBadge) normalBadge.classList.remove('active');
            if (subtitle) subtitle.style.display = 'none';
            document.getElementById('endTitle').textContent = 'Touching the Engraving';
            document.getElementById('finalMessage').innerHTML = '<strong>You reached the true ending.</strong><br><br>Your emotional structure nearly overlapped with theirs.<br>This alignment will be deeply etched into the original strata.';

            const freshState = appStore.getState();
            const memoryId = currentData?.id || freshState.allMemoriesData?.[freshState.currentMemory]?.id;
            if (memoryId && freshState.currentMode === 'archive') {
                const endButtons = document.querySelector('.end-buttons');
                if (endButtons) {
                    endButtons.querySelector('.original-view-btn')?.remove();
                    const originalButton = document.createElement('button');
                    originalButton.className = 'original-view-btn';
                    originalButton.textContent = 'View Original Memory';
                    originalButton.onclick = () => showOriginalMemory(memoryId);
                    endButtons.appendChild(originalButton);
                }
                try {
                    const supabaseClient = getSupabaseClient();
                    if (supabaseClient) {
                        const memoryResult = await networkService.getMemoryById(memoryId);
                        if (memoryResult.ok && memoryResult.data?.source_session_id) {
                            const sessionResult = await networkService.getSessionNarratorId(memoryResult.data.source_session_id);
                            if (sessionResult.ok && sessionResult.data) {
                                setTimeout(() => { showTrueEndingNoteUI(memoryResult.data.author_note, sessionResult.data.narrator_id, memoryId); }, 3000);
                            }
                        }
                    }
                } catch (e) {
                    console.error('트루엔딩 쪽지 UI 로드 error:', e);
                }
            }
        } else {
            console.log('[Ending] 일반 엔딩 표시');
            const trueBadge = document.getElementById('trueEndingBadge');
            const normalBadge = document.getElementById('normalEndingBadge');
            const subtitle = document.getElementById('endSubtitle');
            if (trueBadge) trueBadge.classList.remove('active');
            if (normalBadge) normalBadge.classList.add('active');
            if (subtitle) { subtitle.style.display = 'block'; subtitle.textContent = 'Felt in a Different Grain'; }
            document.getElementById('endTitle').textContent = 'ENDING';
            document.getElementById('finalMessage').innerHTML = 'You experienced this memory in a different way.<br>Same scene, different emotions.<br>That, too, is an interpretation.';
        }

        const endContentEl = document.getElementById('endContent');
        if (endContentEl) endContentEl.style.opacity = '1';

        setTimeout(() => {
            const s = appStore.getState();
            if (s.currentMode === 'live') {
                showNpcDialogue(NPC_DIALOGUES.live.memoryTransition, 6000);
            } else {
                showNpcDialogue(NPC_DIALOGUES.archive.trueEnding, 6000);
            }
        }, 2000);

        // ─── Afterimage: rise after the end screen settles ───
        // §7.1: trigger after the scene closes and a beat of silence has passed.
        // See docs/잔상_시스템_설계-260409.md
        setTimeout(async () => {
            try {
                const { showAfterimage } = await import('../ui/afterimage.js');
                const s = appStore.getState();
                const data = s.currentStoryData;
                const lastSceneObj = data?.scenes?.length ? data.scenes[data.scenes.length - 1] : null;
                const baseVec = data?.original_vector || lastSceneObj?.original_emotion || {};
                const emotionTags = Object.entries(baseVec || {})
                    .filter(([, v]) => typeof v === 'number' && v > 0.15)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 4)
                    .map(([k]) => k);
                const lang = (data?.lang) || (typeof navigator !== 'undefined' && /^en/i.test(navigator.language) ? 'en' : 'ko');
                await showAfterimage(
                    {
                        lang,
                        emotionTags,
                        keywords: [],
                        axisX: 0,
                        axisZ: 0,
                        preferOwn: true,
                    },
                    { dwellMs: 10000 }
                );
            } catch (e) {
                console.warn('[Ending] afterimage skipped:', e?.message || e);
            }
        }, 3800);

        const footer = document.querySelector('.footer');
        if (footer) footer.classList.add('visible');
        console.log('[Ending] showEndScreen complete');
    } catch (e) {
        console.error('[Ending] showEndScreen error:', e);
    }
}

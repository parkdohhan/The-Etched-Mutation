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

// ─── showEndScreen ────────────────────────────────────────────────

export async function showEndScreen(alignmentResult, forceEndScreen = false) {
    const soundscape = getSoundscape();
    if (soundscape) soundscape.stop();

    const state = appStore.getState();
    console.log('[Ending] showEndScreen called:', { alignmentResult, forceEndScreen, currentMode: state.currentMode });

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

        const footer = document.querySelector('.footer');
        if (footer) footer.classList.add('visible');
        console.log('[Ending] showEndScreen complete');
    } catch (e) {
        console.error('[Ending] showEndScreen error:', e);
    }
}

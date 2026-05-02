// js/core/SceneNavigator.js
// Emotion-space geometry-based scene navigation.
//
// Core rule (from CLAUDE-260329.md):
//   Pattern changes GEOMETRY (center shift), not just radius.
//   Each transition_pattern biases the search center differently.

import { cosineSimilarity, DEFAULT_EMOTION_ANCHORS } from '../shared/math.js';

// Per-pattern blend weights: how much of originalEmotion vs userEmotion
// defines the center of the accessible-scene search space.
const PATTERN_CENTER = {
    echo_follow:   { wOrig: 0.7,  wUser: 0.3 },        // pull toward original
    bridge:        { wOrig: 0.5,  wUser: 0.5 },        // balanced
    contradiction: { wOrig: 0.0,  wUser: 0.0, mode: 'negate_user' },  // opposite of user
    displacement:  { wOrig: 0.3,  wUser: 0.7 },        // follow user, slight original pull
    avoidance:     { wOrig: 0.0,  wUser: 0.0, mode: 'void' },         // neutral/empty space
    fixation:      { wOrig: 0.0,  wUser: 0.0, mode: 'current_scene' }, // locked near here
};

// Minimum cosine similarity for a scene to be "accessible"
const BASE_RADIUS = 0.35;

// Narrative shown when no scene is within radius (fallback B)
export const FALLBACK_NARRATIVES = [
    '기억의 빈틈이 다른 장면을 끌어당긴다',
    '가장 가까운 잔향이 떠오른다',
];

export class SceneNavigator {
    /**
     * Find the next scene index based on transition pattern + emotion geometry.
     *
     * @param {Object} params
     * @param {Array}         params.scenes              All scenes (with original_emotion)
     * @param {number}        params.currentSceneIndex   Index of the scene just completed
     * @param {Array<number>} params.visitedScenes       Already-visited scene indices
     * @param {string}        params.transitionPattern   From ByeoriEngine output
     * @param {Object}        params.userEmotion         User's last emotion vector
     * @param {Object}        params.originalEmotion     Current scene's original emotion
     * @param {Object}        [params.playerState]       Optional player context for exclusion filter
     *   - userEmotion, contaminationStage, visitedScenes
     *
     * @returns {{ index: number, isFallback: boolean, fallbackNarrative?: string } | null}
     *   null = no unvisited scenes remain (session end)
     */
    navigate({ scenes, currentSceneIndex, visitedScenes = [], transitionPattern, userEmotion, originalEmotion, playerState }) {
        if (!scenes || scenes.length === 0) return null;

        const effectivePlayerState = playerState || { userEmotion, visitedScenes };

        // Spatial trajectory: if current scene declares an explicit candidate set
        // (meta.trajectory_targets — array of scene IDs), restrict candidates to it.
        // Empty/absent = legacy behavior (all unvisited scenes are candidates).
        const currentScene = scenes[currentSceneIndex];
        const targetIds = currentScene?.meta?.trajectory_targets;
        const hasSpatial = Array.isArray(targetIds) && targetIds.length > 0;

        const baseCandidates = scenes
            .map((_, i) => i)
            .filter(i => i !== currentSceneIndex && !visitedScenes.includes(i));

        const beforeExclusion = hasSpatial
            ? baseCandidates.filter(i => targetIds.includes(scenes[i]?.id))
            : baseCandidates;

        const unvisited = beforeExclusion.filter(i => !isExcluded(scenes[i], effectivePlayerState));

        if (typeof window !== 'undefined' && window.__TEM_DEBUG_EXCLUSIONS__) {
            const excluded = beforeExclusion.filter(i => !unvisited.includes(i));
            if (excluded.length > 0) {
                console.group('[부정 제약] 제외된 씬');
                excluded.forEach(i => {
                    const sc = scenes[i];
                    const list = sc?.meta?.exclusions || sc?.exclusions || [];
                    console.log(`  씬 ${i} (${sc?.meta?.scene_code || sc?.id || '?'}) — 조건:`, list);
                });
                console.log('  playerState:', effectivePlayerState);
                console.log(`  전체 ${beforeExclusion.length}개 중 ${unvisited.length}개 후보 남음`);
                console.groupEnd();
            } else if (beforeExclusion.length > 0) {
                console.log(`[부정 제약] 제외 없음 (후보 ${beforeExclusion.length}개)`);
            }
        }

        if (unvisited.length === 0) return null;

        const center = this._computeCenter(
            transitionPattern,
            userEmotion,
            originalEmotion,
            scenes[currentSceneIndex]
        );

        const scored = unvisited.map(i => {
            const sceneEmo = scenes[i]?.original_emotion || scenes[i]?.originalEmotion || {};
            const sim = cosineSimilarity(center, sceneEmo);
            return { index: i, score: sim };
        });

        scored.sort((a, b) => b.score - a.score);

        const inRadius = scored.filter(s => s.score >= BASE_RADIUS);

        if (inRadius.length > 0) {
            return { index: inRadius[0].index, isFallback: false };
        }

        // Fallback B: closest available scene, with narrative framing
        const narrative = FALLBACK_NARRATIVES[Math.floor(Math.random() * FALLBACK_NARRATIVES.length)];
        return { index: scored[0].index, isFallback: true, fallbackNarrative: narrative };
    }

    /**
     * Compute the emotion-space center for the given pattern.
     */
    _computeCenter(pattern, userEmotion, originalEmotion, currentScene) {
        const cfg = PATTERN_CENTER[pattern] || PATTERN_CENTER.bridge;

        if (cfg.mode === 'void') {
            // Empty vector → all cosine similarities ≈ 0 → triggers fallback
            return {};
        }
        if (cfg.mode === 'current_scene') {
            return currentScene?.original_emotion || currentScene?.originalEmotion || {};
        }
        if (cfg.mode === 'negate_user') {
            return this._negateEmotion(userEmotion);
        }

        return this._blendEmotions(originalEmotion, userEmotion, cfg.wOrig, cfg.wUser);
    }

    /**
     * Weighted blend of two emotion vectors.
     */
    _blendEmotions(original, user, wOrig, wUser) {
        const keys = new Set([
            ...Object.keys(original || {}),
            ...Object.keys(user || {}),
            ...DEFAULT_EMOTION_ANCHORS,
        ]);
        const result = {};
        for (const k of keys) {
            result[k] = (original?.[k] || 0) * wOrig + (user?.[k] || 0) * wUser;
        }
        return result;
    }

    /**
     * Invert an emotion vector: high values become low, low become high.
     * Used for contradiction pattern — steer toward opposite emotional space.
     */
    _negateEmotion(emotion) {
        const result = {};
        for (const k of DEFAULT_EMOTION_ANCHORS) {
            result[k] = 1 - (emotion?.[k] || 0);
        }
        return result;
    }
}

/**
 * Evaluate whether a scene should be excluded from the trajectory candidates.
 * Returns true if ANY exclusion condition matches.
 * Absent/empty exclusions → never excluded.
 */
export function isExcluded(scene, playerState = {}) {
    const list = scene?.meta?.exclusions || scene?.exclusions;
    if (!list || !Array.isArray(list) || list.length === 0) return false;
    return list.some(entry => matchesExclusion(entry?.condition, playerState));
}

function matchesExclusion(condition, playerState) {
    if (!condition || typeof condition !== 'object') return false;
    if (condition.type === 'emotion_threshold') {
        const val = Number(playerState.userEmotion?.[condition.emotion] || 0);
        const min = Number(condition.min ?? 0.6);
        return val >= min;
    }
    if (condition.type === 'contamination_stage') {
        return playerState.contaminationStage === condition.stage;
    }
    if (condition.type === 'visited_scene') {
        return (playerState.visitedScenes || []).includes(condition.sceneIndex);
    }
    return false;
}

export const sceneNavigator = new SceneNavigator();

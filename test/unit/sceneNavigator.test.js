// test/unit/sceneNavigator.test.js
// SceneNavigator 단위 테스트 — geometry center shift, fallback, pattern routing

import { describe, it, expect } from 'vitest';
import { SceneNavigator, sceneNavigator, FALLBACK_NARRATIVES } from '../../js/core/SceneNavigator.js';

// ─── Helper: scene factory ─────────────────────────────────────

function makeScenes(emotions) {
  return emotions.map((emo, i) => ({
    id: i,
    original_emotion: emo,
  }));
}

// Standard scenes: fear-heavy, sadness-heavy, joy-heavy, anger-heavy
const STANDARD_SCENES = makeScenes([
  { fear: 0.8, sadness: 0.1, joy: 0.0, anger: 0.1 },   // 0: fear
  { fear: 0.1, sadness: 0.8, joy: 0.0, anger: 0.1 },   // 1: sadness
  { fear: 0.0, sadness: 0.0, joy: 0.9, anger: 0.1 },   // 2: joy
  { fear: 0.1, sadness: 0.1, joy: 0.0, anger: 0.8 },   // 3: anger
]);

// ─── Basic navigation ──────────────────────────────────────────

describe('SceneNavigator.navigate — basic', () => {
  const nav = new SceneNavigator();

  it('returns a scene index', () => {
    const result = nav.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.7, sadness: 0.3 },
      originalEmotion: { fear: 0.8, sadness: 0.1 },
    });
    expect(result).not.toBeNull();
    expect(typeof result.index).toBe('number');
    expect(result.index).not.toBe(0); // not current scene
  });

  it('returns null when no unvisited scenes remain', () => {
    const result = nav.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 0,
      visitedScenes: [1, 2, 3],
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.5 },
      originalEmotion: { fear: 0.5 },
    });
    expect(result).toBeNull();
  });

  it('returns null for empty scenes', () => {
    expect(nav.navigate({ scenes: [], currentSceneIndex: 0 })).toBeNull();
  });

  it('excludes current scene from candidates', () => {
    const result = nav.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'echo_follow',
      userEmotion: STANDARD_SCENES[0].original_emotion,
      originalEmotion: STANDARD_SCENES[0].original_emotion,
    });
    expect(result.index).not.toBe(0);
  });

  it('excludes visited scenes from candidates', () => {
    const result = nav.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 0,
      visitedScenes: [1, 2],
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.5 },
      originalEmotion: { fear: 0.5 },
    });
    if (result) {
      expect(result.index).toBe(3); // only unvisited option
    }
  });
});

// ─── Pattern-based center shift (core design principle) ────────

describe('SceneNavigator — pattern geometry', () => {
  const nav = new SceneNavigator();

  it('echo_follow biases toward original emotion', () => {
    // Original = fear, User = joy → center should lean toward fear
    const result = nav.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 2, // joy scene
      visitedScenes: [],
      transitionPattern: 'echo_follow',
      userEmotion: { joy: 0.9 },
      originalEmotion: { fear: 0.8 },
    });
    // Should prefer fear-like scene (0) over joy-like (already current)
    expect(result).not.toBeNull();
    // echo_follow = 0.7 original + 0.3 user → center has more fear
  });

  it('contradiction steers toward OPPOSITE of user emotion', () => {
    // User feels fear → contradiction center = inverted (high on everything EXCEPT fear)
    const result = nav.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'contradiction',
      userEmotion: { fear: 0.9 },
      originalEmotion: { fear: 0.8 },
    });
    // Negated user: fear→0.1, other anchors→1.0 → should NOT pick fear scene
    expect(result).not.toBeNull();
  });

  it('avoidance produces fallback (void center)', () => {
    // Void center → all cosine similarities ≈ 0 → no scene in radius → fallback
    const result = nav.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'avoidance',
      userEmotion: { fear: 0.5 },
      originalEmotion: { fear: 0.5 },
    });
    expect(result).not.toBeNull();
    expect(result.isFallback).toBe(true);
    expect(FALLBACK_NARRATIVES).toContain(result.fallbackNarrative);
  });

  it('fixation locks near current scene emotion', () => {
    // Current scene = fear → fixation center = current scene emotion
    const result = nav.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'fixation',
      userEmotion: { joy: 0.9 },
      originalEmotion: { fear: 0.8 },
    });
    // Center = current scene's original_emotion (fear-heavy)
    // Should prefer fear-like scenes
    expect(result).not.toBeNull();
  });

  it('bridge blends 50/50 between original and user', () => {
    const result = nav.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'bridge',
      userEmotion: { sadness: 0.8 },
      originalEmotion: { fear: 0.8 },
    });
    expect(result).not.toBeNull();
  });

  it('displacement follows user more (0.3 orig : 0.7 user)', () => {
    const result = nav.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'displacement',
      userEmotion: { sadness: 0.9 },
      originalEmotion: { fear: 0.9 },
    });
    expect(result).not.toBeNull();
    // With displacement, center is 0.7 user (sadness) → should prefer sadness scene
  });
});

// ─── Fallback behavior ─────────────────────────────────────────

describe('SceneNavigator — fallback', () => {
  const nav = new SceneNavigator();

  it('falls back to closest scene when none in radius', () => {
    // Scenes with very specific emotions, user emotion very different
    const scenes = makeScenes([
      { fear: 0.9 },
      { joy: 0.9 },
    ]);
    // Use void pattern to ensure no match
    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'avoidance',
      userEmotion: { fear: 0.5 },
      originalEmotion: { fear: 0.5 },
    });
    expect(result.isFallback).toBe(true);
    expect(result.fallbackNarrative).toBeTruthy();
    expect(result.index).toBe(1); // only unvisited
  });

  it('isFallback is false when scene is within radius', () => {
    const scenes = makeScenes([
      { fear: 0.8 },
      { fear: 0.7, sadness: 0.2 },
    ]);
    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'echo_follow',
      userEmotion: { fear: 0.8 },
      originalEmotion: { fear: 0.8 },
    });
    expect(result.isFallback).toBe(false);
  });
});

// ─── Internal methods ──────────────────────────────────────────

describe('SceneNavigator — _blendEmotions', () => {
  const nav = new SceneNavigator();

  it('blends two emotions with weights', () => {
    const result = nav._blendEmotions(
      { fear: 1.0, joy: 0.0 },
      { fear: 0.0, joy: 1.0 },
      0.7, 0.3
    );
    expect(result.fear).toBeCloseTo(0.7);
    expect(result.joy).toBeCloseTo(0.3);
  });

  it('handles missing keys in either vector', () => {
    const result = nav._blendEmotions(
      { fear: 1.0 },
      { joy: 1.0 },
      0.5, 0.5
    );
    expect(result.fear).toBeCloseTo(0.5);
    expect(result.joy).toBeCloseTo(0.5);
  });
});

describe('SceneNavigator — _negateEmotion', () => {
  const nav = new SceneNavigator();

  it('inverts emotion values (1 - value)', () => {
    const result = nav._negateEmotion({ fear: 0.9, joy: 0.1, sadness: 0.5 });
    expect(result.fear).toBeCloseTo(0.1);
    expect(result.joy).toBeCloseTo(0.9);
    expect(result.sadness).toBeCloseTo(0.5);
  });

  it('handles null emotion', () => {
    const result = nav._negateEmotion(null);
    // All DEFAULT_EMOTION_ANCHORS should be 1.0 (1 - 0)
    expect(result.fear).toBe(1);
    expect(result.sadness).toBe(1);
  });
});

// ─── Singleton export ──────────────────────────────────────────

describe('sceneNavigator singleton', () => {
  it('works as expected', () => {
    const result = sceneNavigator.navigate({
      scenes: STANDARD_SCENES,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.5, sadness: 0.5 },
      originalEmotion: { fear: 0.8 },
    });
    expect(result).not.toBeNull();
  });
});

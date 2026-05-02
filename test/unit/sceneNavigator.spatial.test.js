// test/unit/sceneNavigator.spatial.test.js
// SceneNavigator 핀 모드(spatial trajectory) 분기 검증.
// scene.meta.trajectory_targets 가 후보를 한정하는지, 비어있을 땐 기존 동작 유지하는지.

import { describe, it, expect } from 'vitest';
import { SceneNavigator } from '../../js/core/SceneNavigator.js';

// 4개 씬: 각 씬 id 는 'A'..'D'. 감정 분포는 fear-heavy 4개로 동일하게 둬서
// trajectory_targets 필터만 골라내는 효과를 격리.
function makeScenes() {
  return [
    { id: 'A', original_emotion: { fear: 0.8, sadness: 0.1 }, meta: {} },
    { id: 'B', original_emotion: { fear: 0.7, sadness: 0.2 }, meta: {} },
    { id: 'C', original_emotion: { fear: 0.6, sadness: 0.3 }, meta: {} },
    { id: 'D', original_emotion: { fear: 0.5, sadness: 0.4 }, meta: {} },
  ];
}

describe('SceneNavigator — 핀 모드 (spatial trajectory_targets)', () => {
  const nav = new SceneNavigator();

  it('trajectory_targets 정의돼 있으면 그 안에서만 후보 선택', () => {
    const scenes = makeScenes();
    // A 의 다음 후보를 C 로만 한정 (B, D 제외)
    scenes[0].meta.trajectory_targets = ['C'];

    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.5, sadness: 0.3 },
      originalEmotion: scenes[0].original_emotion,
    });
    expect(result).not.toBeNull();
    expect(scenes[result.index].id).toBe('C');
  });

  it('trajectory_targets 안에 여러 개면 감정 유사도로 그중 1개 선택', () => {
    const scenes = makeScenes();
    scenes[0].meta.trajectory_targets = ['B', 'C', 'D']; // A 제외하고 다 후보

    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.5, sadness: 0.3 },
      originalEmotion: scenes[0].original_emotion,
    });
    expect(result).not.toBeNull();
    expect(['B', 'C', 'D']).toContain(scenes[result.index].id);
  });

  it('trajectory_targets 비어있으면 기존 동작 (모든 unvisited 후보)', () => {
    const scenes = makeScenes();
    scenes[0].meta.trajectory_targets = []; // 빈 배열

    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.5, sadness: 0.3 },
      originalEmotion: scenes[0].original_emotion,
    });
    expect(result).not.toBeNull();
    // 빈 배열 = 비활성. 기존처럼 B/C/D 중 하나
    expect(['B', 'C', 'D']).toContain(scenes[result.index].id);
  });

  it('trajectory_targets 키 없으면 기존 동작 (모든 unvisited 후보)', () => {
    const scenes = makeScenes();
    // meta.trajectory_targets 자체를 안 정의

    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.5, sadness: 0.3 },
      originalEmotion: scenes[0].original_emotion,
    });
    expect(result).not.toBeNull();
    expect(['B', 'C', 'D']).toContain(scenes[result.index].id);
  });

  it('trajectory_targets 안에 visited 씬이 있으면 그건 제외', () => {
    const scenes = makeScenes();
    scenes[0].meta.trajectory_targets = ['B', 'C']; // 후보 2개

    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [1], // B 이미 방문
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.5, sadness: 0.3 },
      originalEmotion: scenes[0].original_emotion,
    });
    expect(result).not.toBeNull();
    expect(scenes[result.index].id).toBe('C'); // B 제외, C만 남음
  });

  it('trajectory_targets 안의 씬이 exclusions 걸리면 그것도 제외', () => {
    const scenes = makeScenes();
    scenes[0].meta.trajectory_targets = ['B', 'C'];
    // C 에 "fear ≥ 0.4 면 차단" 조건
    scenes[2].meta.exclusions = [
      { condition: { type: 'emotion_threshold', emotion: 'fear', min: 0.4 } },
    ];

    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.6, sadness: 0.2 }, // fear ≥ 0.4 → C 차단
      originalEmotion: scenes[0].original_emotion,
      playerState: { userEmotion: { fear: 0.6, sadness: 0.2 }, visitedScenes: [] },
    });
    expect(result).not.toBeNull();
    expect(scenes[result.index].id).toBe('B'); // C 차단, B만 남음
  });

  it('trajectory_targets 후보 모두 visited+exclude 되면 null (세션 종료)', () => {
    const scenes = makeScenes();
    scenes[0].meta.trajectory_targets = ['B'];

    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [1], // B 도 visited
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.5 },
      originalEmotion: scenes[0].original_emotion,
    });
    expect(result).toBeNull();
  });

  it('현재 씬은 항상 후보에서 제외 (trajectory_targets 에 자기 자신 들어있어도)', () => {
    const scenes = makeScenes();
    // 자기 자신 + B
    scenes[0].meta.trajectory_targets = ['A', 'B'];

    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'bridge',
      userEmotion: { fear: 0.5 },
      originalEmotion: scenes[0].original_emotion,
    });
    expect(result).not.toBeNull();
    expect(scenes[result.index].id).toBe('B');
  });

  it('regression — trajectory_targets 없는 메모리는 동작 똑같음', () => {
    const scenes = makeScenes();
    // 어떤 씬도 trajectory_targets 안 가짐 — 즉 기존 메모리 시뮬레이션
    const result = nav.navigate({
      scenes,
      currentSceneIndex: 0,
      visitedScenes: [],
      transitionPattern: 'echo_follow',
      userEmotion: { fear: 0.7 },
      originalEmotion: scenes[0].original_emotion,
    });
    expect(result).not.toBeNull();
    expect(typeof result.index).toBe('number');
    expect(result.index).not.toBe(0);
  });
});

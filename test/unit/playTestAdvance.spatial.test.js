// test/unit/playTestAdvance.spatial.test.js
// play-test.html `_advanceToNextSceneLinear` 핀 모드 분기 알고리즘 검증.
//
// 원본 함수가 거대한 IIFE 안에 있어 직접 import 불가.
// 같은 알고리즘을 순수 함수로 복제해서 로직만 검증한다.
// (play-test.html 수정 시 이쪽도 같이 갱신해야 함 — 동기화 책임은 작성자에게)

import { describe, it, expect } from 'vitest';

// ── 복제: play-test.html `_advanceToNextSceneLinear` 알고리즘 ──
// 입력 형식만 단순화한 순수 함수. 실제 enterSceneMode 호출 대신
// 다음 핀 객체를 반환 (또는 null = 마지막 씬).
function advance(currentPin, scenes, pins, visitedCore) {
  const cores = pins.filter(p => p.type === 'core' || p.type === 'bridge');
  const currentScene = scenes && scenes.find(s => s.id === currentPin.sceneId);
  const targets = currentScene && currentScene.meta && currentScene.meta.trajectory_targets;

  if (Array.isArray(targets) && targets.length > 0) {
    const targetSet = Object.create(null);
    targets.forEach(tid => { targetSet[tid] = true; });
    const candidatePins = cores.filter(p => targetSet[p.sceneId]);
    if (candidatePins.length > 0) {
      const visited = visitedCore || {};
      const unvisited = candidatePins.filter(p => !visited[p.sceneId]);
      const pool = unvisited.length > 0 ? unvisited : candidatePins;
      pool.sort((a, b) => (a.sceneOrder || 0) - (b.sceneOrder || 0));
      return pool[0];
    }
  }

  // 선형 fallback
  const sortedByOrder = cores.slice().sort((a, b) => (a.sceneOrder || 0) - (b.sceneOrder || 0));
  const idx = sortedByOrder.findIndex(p => p.id === currentPin.id);
  if (idx >= 0 && idx + 1 < sortedByOrder.length) {
    return sortedByOrder[idx + 1];
  }
  return null;
}

// ── Helpers ──
function pin(id, sceneId, sceneOrder) {
  return { id, sceneId, sceneOrder, type: 'core' };
}
function scene(id, targets) {
  return { id, meta: targets ? { trajectory_targets: targets } : {} };
}

describe('play-test _advanceToNextSceneLinear — 핀 모드 적용', () => {
  it('trajectory_targets 비어있으면 scene_order 다음 핀으로 (선형)', () => {
    const scenes = [scene('s1'), scene('s2'), scene('s3')];
    const pins = [pin('p1', 's1', 1), pin('p2', 's2', 2), pin('p3', 's3', 3)];
    const next = advance(pins[0], scenes, pins, {});
    expect(next.id).toBe('p2');
  });

  it('trajectory_targets 정의되면 그 안의 핀으로 점프', () => {
    const scenes = [
      scene('s1', ['s3']), // s1 → s3 만
      scene('s2'),
      scene('s3'),
    ];
    const pins = [pin('p1', 's1', 1), pin('p2', 's2', 2), pin('p3', 's3', 3)];
    const next = advance(pins[0], scenes, pins, {});
    expect(next.id).toBe('p3'); // s2 건너뛰고 s3
  });

  it('trajectory_targets 후보 여러 개면 visited 안 된 것 + scene_order 작은 것', () => {
    const scenes = [
      scene('s1', ['s2', 's3', 's4']),
      scene('s2'), scene('s3'), scene('s4'),
    ];
    const pins = [
      pin('p1', 's1', 1), pin('p2', 's2', 2),
      pin('p3', 's3', 3), pin('p4', 's4', 4),
    ];
    // s2 이미 visited → s3 가야
    const next = advance(pins[0], scenes, pins, { s2: true });
    expect(next.id).toBe('p3');
  });

  it('후보 다 visited면 사이클 허용 (visited 무시하고 첫 후보)', () => {
    const scenes = [
      scene('s1', ['s2', 's3']),
      scene('s2'), scene('s3'),
    ];
    const pins = [pin('p1', 's1', 1), pin('p2', 's2', 2), pin('p3', 's3', 3)];
    const next = advance(pins[0], scenes, pins, { s2: true, s3: true });
    expect(next.id).toBe('p2'); // 사이클 — scene_order 작은 것 (s2)
  });

  it('마지막 선형 씬 (trajectory_targets 없음, 다음 scene_order 없음) → null', () => {
    const scenes = [scene('s1'), scene('s2')];
    const pins = [pin('p1', 's1', 1), pin('p2', 's2', 2)];
    const next = advance(pins[1], scenes, pins, {});
    expect(next).toBeNull();
  });

  it('trajectory_targets 가 존재하지 않는 씬 ID 가리키면 → 선형 fallback', () => {
    const scenes = [
      scene('s1', ['s_does_not_exist']),
      scene('s2'),
    ];
    const pins = [pin('p1', 's1', 1), pin('p2', 's2', 2)];
    const next = advance(pins[0], scenes, pins, {});
    expect(next.id).toBe('p2'); // candidatePins 0개 → fallback
  });

  it('regression — 기존 메모리 (trajectory_targets 전혀 없음) 동작 보존', () => {
    const scenes = [scene('s1'), scene('s2'), scene('s3')];
    const pins = [pin('p1', 's1', 1), pin('p2', 's2', 2), pin('p3', 's3', 3)];
    expect(advance(pins[0], scenes, pins, {}).id).toBe('p2');
    expect(advance(pins[1], scenes, pins, {}).id).toBe('p3');
    expect(advance(pins[2], scenes, pins, {})).toBeNull();
  });
});

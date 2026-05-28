// test/unit/quilt_footprints_thin.test.js
// 거리 기반 trajectory thinning 알고리즘 — lumen_footprints.js _thinTrajectory mirror
//
// 5줄짜리 순수 함수라 별도 ES6 module 분리 대신 인라인 복사 + 동기화 주석.
// lumen_footprints.js 알고리즘 바꾸면 이 함수도 같이 바꿔야 함.

import { describe, it, expect } from 'vitest';

function thinTrajectory(traj, stride) {
  if (!traj || !traj.length) return [];
  var picked = [traj[0]];
  for (var i = 1; i < traj.length; i++) {
    var last = picked[picked.length - 1];
    var dx = traj[i].x - last.x, dz = traj[i].z - last.z;
    if (Math.sqrt(dx * dx + dz * dz) >= stride) picked.push(traj[i]);
  }
  return picked;
}

describe('thinTrajectory (lumen_footprints 알고리즘 mirror)', () => {
  it('빈 배열/null → 빈 배열', () => {
    expect(thinTrajectory([], 0.85)).toEqual([]);
    expect(thinTrajectory(null, 0.85)).toEqual([]);
    expect(thinTrajectory(undefined, 0.85)).toEqual([]);
  });

  it('첫 점은 항상 포함된다', () => {
    expect(thinTrajectory([{ x: 0, z: 0 }], 1)).toEqual([{ x: 0, z: 0 }]);
  });

  it('stride 미만 거리는 skip', () => {
    var traj = [{ x: 0, z: 0 }, { x: 0.3, z: 0 }, { x: 0.6, z: 0 }];
    expect(thinTrajectory(traj, 1)).toEqual([{ x: 0, z: 0 }]);
  });

  it('stride 이상 거리는 픽', () => {
    var traj = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }];
    expect(thinTrajectory(traj, 1)).toHaveLength(3);
  });

  it('지그재그 이동도 last picked 기준으로 거리 검사 (누적 X)', () => {
    // 0 → 0.6 → 0 → 0.6 (stride 1 미만). last picked는 항상 첫 점이라 모두 skip.
    var traj = [{ x: 0, z: 0 }, { x: 0.6, z: 0 }, { x: 0, z: 0 }, { x: 0.6, z: 0 }];
    expect(thinTrajectory(traj, 1)).toEqual([{ x: 0, z: 0 }]);
  });

  it('대각선 이동도 유클리드 거리로 검사', () => {
    var traj = [{ x: 0, z: 0 }, { x: 0.6, z: 0.8 }]; // dist = 1.0
    expect(thinTrajectory(traj, 1.0)).toHaveLength(2);
    expect(thinTrajectory(traj, 1.01)).toHaveLength(1);
  });

  it('실제 trajectory 형태 — yaw/h/t 같은 추가 필드 보존', () => {
    var traj = [
      { x: 0, z: 0, yaw: 0.5, h: 1.6, t: 0 },
      { x: 1, z: 0, yaw: 0.6, h: 1.6, t: 150 },
    ];
    var r = thinTrajectory(traj, 0.85);
    expect(r).toHaveLength(2);
    expect(r[1].yaw).toBe(0.6); // 객체 통째 보존
    expect(r[1].t).toBe(150);
  });

  it('대량 점도 처리 (1000개 샘플, stride 0.85)', () => {
    var traj = [];
    for (var i = 0; i < 1000; i++) traj.push({ x: i * 0.05, z: 0 }); // 5cm 간격
    // 5cm × 17 = 85cm 마다 픽 — 기대 ~59개
    var r = thinTrajectory(traj, 0.85);
    expect(r.length).toBeGreaterThan(55);
    expect(r.length).toBeLessThan(63);
  });
});

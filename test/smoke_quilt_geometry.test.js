// test/smoke_quilt_geometry.test.js
// QuiltGeometry 회귀 스모크 — js/core/quilt_geometry.js 의 계약을 고정한다.
//
// 검증 대상 (docs/지형quilt_확정모델_v1-260613.md §5표 + §6 거리공식):
//   1) echo_follow → 가까운 목표(TARGET_NEAR)로 수렴 + clamp(목표 아래로 안 내려감)
//   2) avoidance  → 먼 목표(TARGET_FAR)로 수렴 + clamp(목표 위로 안 올라감)
//   3) 안 거친 쌍은 작가 원형(scene_order 간격) 유지
//   4) fixation → 거리 안 건드리고 도착 장면 scale↑ + SCALE_MAX clamp
//   5) seam 매핑 §5표: echo=ridge / bridge=ridge / contradiction=valley
//      / displacement=offset / avoidance=break / fixation=isolate
//   6) 같은 패턴이라도 alignment(강도) 가 크면 한 스텝에 더 많이 움직인다
//   7) pairKey 구분자 = NUL(\0) footgun — 구분자가 space 가 아니라 NUL 임을
//      *계약으로 고정*. NUL 이라서 공백 든 ID 도 충돌하지 않는다는 사실을 못박는다.
//
// 모듈을 실제 import 한다 (브라우저 의존성 없음 — 순수 계산).

import { describe, it, expect } from 'vitest';
import { QuiltGeometry, QUILT_GEOMETRY } from '../js/core/quilt_geometry.js';

// pairKey 구분자 (quilt_geometry.js ~81행: `${a}\0${b}`). 편집기에서 안 보이는
// 리터럴 NUL 을 파일에 안 박기 위해 escape 로 만든다. 이 상수가 원본 구분자와
// 동기화돼야 한다 — 원본이 바꾸면 여기도 바꿔야 함.
const PAIR_SEP = '\u0000';
const archKey = (a, b) => [a, b].sort().join(PAIR_SEP);

// ─── 1. echo_follow — 가까운 목표로 수렴 + clamp ────────────────────────────
describe('echo_follow — TARGET_NEAR 수렴 + clamp', () => {
  it('한 전이마다 거리가 TARGET_NEAR 쪽으로 줄지만 목표 아래로는 안 내려간다', () => {
    // 원형 거리 = |0-3| * ORDER_UNIT = 3 (멀리서 출발)
    const geo = new QuiltGeometry({ sceneOrder: { s1: 0, s2: 3 } });
    const start = geo.getPairDistance('s1', 's2');
    expect(start).toBeCloseTo(3.0, 6);

    let prev = start;
    for (let i = 0; i < 50; i++) {
      geo.recordTransition('s1', 's2', 'echo_follow', 1.0);
      const d = geo.getPairDistance('s1', 's2');
      // 단조 감소 (가까운 목표로 당겨짐)
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      // 절대 목표 아래로 내려가지 않음 (clamp 자동 — §6 "목표를 넘지 않음")
      expect(d).toBeGreaterThanOrEqual(QUILT_GEOMETRY.TARGET_NEAR - 1e-9);
      prev = d;
    }
    // 충분히 반복하면 목표에 거의 도달
    expect(prev).toBeCloseTo(QUILT_GEOMETRY.TARGET_NEAR, 2);
  });

  it('bridge 도 echo_follow 와 같은 near 목표 (§5표 동일 행)', () => {
    const geo = new QuiltGeometry({ sceneOrder: { a: 0, b: 5 } });
    for (let i = 0; i < 60; i++) geo.recordTransition('a', 'b', 'bridge', 1.0);
    expect(geo.getPairDistance('a', 'b')).toBeCloseTo(QUILT_GEOMETRY.TARGET_NEAR, 2);
  });
});

// ─── 2. avoidance — 먼 목표로 수렴 + clamp ──────────────────────────────────
describe('avoidance — TARGET_FAR 수렴 + clamp', () => {
  it('가까이서 출발해도 TARGET_FAR 쪽으로 밀려나지만 목표 위로는 안 올라간다', () => {
    // 원형 거리 = |0-1| = 1 (가까이서 출발) — avoidance 면 멀어져야 함
    const geo = new QuiltGeometry({ sceneOrder: { s1: 0, s2: 1 } });
    let prev = geo.getPairDistance('s1', 's2');
    expect(prev).toBeCloseTo(1.0, 6);

    for (let i = 0; i < 50; i++) {
      geo.recordTransition('s1', 's2', 'avoidance', 1.0);
      const d = geo.getPairDistance('s1', 's2');
      // 단조 증가 (먼 목표로 밀림)
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      // 절대 목표 위로 안 올라감
      expect(d).toBeLessThanOrEqual(QUILT_GEOMETRY.TARGET_FAR + 1e-9);
      prev = d;
    }
    expect(prev).toBeCloseTo(QUILT_GEOMETRY.TARGET_FAR, 1);
  });
});

// ─── 3. 안 거친 쌍은 원형 유지 ───────────────────────────────────────────────
describe('안 거친 쌍 — 작가 원형 거리 유지 (§6 "안 거친 쌍은 원형 유지")', () => {
  it('전이를 안 먹인 쌍은 scene_order 간격 그대로다', () => {
    const geo = new QuiltGeometry({ sceneOrder: { s1: 0, s2: 1, s3: 4 } });
    // s1-s2 만 거치고 s1-s3 / s2-s3 는 안 거침
    geo.recordTransition('s1', 's2', 'echo_follow', 0.9);
    // s1-s3 = |0-4| = 4 (원형 그대로)
    expect(geo.getPairDistance('s1', 's3')).toBeCloseTo(4.0, 6);
    // s2-s3 = |1-4| = 3 (원형 그대로)
    expect(geo.getPairDistance('s2', 's3')).toBeCloseTo(3.0, 6);
    // 안 거친 쌍은 seam 도 없음 (null = 원형, 생김새 없음)
    expect(geo.getSeam('s1', 's3')).toBeNull();
  });

  it('scene_order 도 archetypeDist 도 없으면 DEFAULT_ARCHETYPE_DIST 폴백', () => {
    const geo = new QuiltGeometry({});
    expect(geo.getPairDistance('x', 'y')).toBe(QUILT_GEOMETRY.DEFAULT_ARCHETYPE_DIST);
  });

  it('archetypeDist 명시값이 scene_order 보다 우선', () => {
    // !!! 계약: pairKey 구분자는 space 가 아니라 NUL(\0) 이다 (quilt_geometry.js ~81행).
    //     archetypeDist 키는 "정렬된 두 ID 를 NUL 로 이은 문자열"이어야 한다.
    const geo = new QuiltGeometry({
      sceneOrder: { s1: 0, s2: 9 },               // order 간격이면 9
      archetypeDist: { [archKey('s1', 's2')]: 2.5 },
    });
    expect(geo.getPairDistance('s1', 's2')).toBe(2.5);
    // 순서 무관 — getPairDistance(b,a) 도 같은 명시값
    expect(geo.getPairDistance('s2', 's1')).toBe(2.5);
  });
});

// ─── 4. fixation → scale↑ + clamp, 거리 안 건드림 ───────────────────────────
describe('fixation — 거리 아님, 도착 장면 scale↑ + SCALE_MAX clamp (§5표)', () => {
  it('거리는 그대로, 도착 장면만 커지고 SCALE_MAX 를 넘지 않는다', () => {
    const geo = new QuiltGeometry({ sceneOrder: { s1: 0, s2: 2 } });
    const distBefore = geo.getPairDistance('s1', 's2');
    expect(geo.getSceneScale('s2')).toBe(QUILT_GEOMETRY.SCALE_BASE);

    let prevScale = QUILT_GEOMETRY.SCALE_BASE;
    for (let i = 0; i < 50; i++) {
      geo.recordTransition('s1', 's2', 'fixation', 0.9);
      const sc = geo.getSceneScale('s2');
      expect(sc).toBeGreaterThanOrEqual(prevScale - 1e-9); // 단조 증가
      expect(sc).toBeLessThanOrEqual(QUILT_GEOMETRY.SCALE_MAX + 1e-9); // clamp
      prevScale = sc;
    }
    // 충분히 반복하면 SCALE_MAX 까지 차오름
    expect(prevScale).toBeCloseTo(QUILT_GEOMETRY.SCALE_MAX, 6);
    // 거리는 단 한 번도 안 변함 (fixation = distance:'none')
    expect(geo.getPairDistance('s1', 's2')).toBeCloseTo(distBefore, 6);
    // fixation 은 거리·seam 을 안 엮음 → seam null
    expect(geo.getSeam('s1', 's2')).toBeNull();
  });
});

// ─── 5. seam 매핑 §5표 ──────────────────────────────────────────────────────
describe('seam 매핑 — §5 관계표 정확히 고정', () => {
  const cases = [
    ['echo_follow', 'ridge'],
    ['bridge', 'ridge'],
    ['contradiction', 'valley'],
    ['displacement', 'offset'],
    ['avoidance', 'break'],
  ];
  it.each(cases)('%s → seam=%s', (pattern, expectedSeam) => {
    const geo = new QuiltGeometry({ sceneOrder: { a: 0, b: 1 } });
    geo.recordTransition('a', 'b', pattern, 0.8);
    const seam = geo.getSeam('a', 'b');
    expect(seam).not.toBeNull();
    expect(seam.seam).toBe(expectedSeam);
    expect(seam.pattern).toBe(pattern);
    // seam.gap 은 현재 거리와 동기 (렌더가 거리 따로 안 읽어도 됨)
    expect(seam.gap).toBeCloseTo(geo.getPairDistance('a', 'b'), 6);
    // strength 는 0~1 사이 + alignment 만큼 자람
    expect(seam.strength).toBeGreaterThan(0);
    expect(seam.strength).toBeLessThanOrEqual(1);
  });

  it('알 수 없는 패턴은 bridge 로 폴백 (near/ridge)', () => {
    const geo = new QuiltGeometry({ sceneOrder: { a: 0, b: 5 } });
    geo.recordTransition('a', 'b', 'totally_unknown_pattern', 1.0);
    expect(geo.getSeam('a', 'b').seam).toBe('ridge'); // bridge 폴백
    // near 목표로 당겨짐(멀어지지 않음)
    expect(geo.getPairDistance('a', 'b')).toBeLessThan(5);
  });
});

// ─── 6. 강한 alignment 가 더 많이 움직인다 ──────────────────────────────────
describe('강도(alignment) — 강할수록 한 스텝에 더 많이 움직인다 (§6 "강하면 확, 약하면 살짝")', () => {
  it('한 전이 비교: alignment 1.0 의 이동량 > alignment 0.2 의 이동량', () => {
    const strong = new QuiltGeometry({ sceneOrder: { s1: 0, s2: 5 } });
    const weak = new QuiltGeometry({ sceneOrder: { s1: 0, s2: 5 } });
    const start = 5.0;

    strong.recordTransition('s1', 's2', 'echo_follow', 1.0);
    weak.recordTransition('s1', 's2', 'echo_follow', 0.2);

    const moveStrong = start - strong.getPairDistance('s1', 's2');
    const moveWeak = start - weak.getPairDistance('s1', 's2');
    expect(moveStrong).toBeGreaterThan(moveWeak);
    // 정확한 비율: alignment 가 선형 강도이므로 이동량도 alignment 비율
    expect(moveStrong / moveWeak).toBeCloseTo(1.0 / 0.2, 4);
  });

  it('alignment 0 이면 거리가 안 움직인다 (강도 0 = 안 당김)', () => {
    const geo = new QuiltGeometry({ sceneOrder: { s1: 0, s2: 5 } });
    geo.recordTransition('s1', 's2', 'echo_follow', 0);
    expect(geo.getPairDistance('s1', 's2')).toBeCloseTo(5.0, 6);
  });

  it('alignment 범위 밖(>1, <0)은 clamp 되어 폭주하지 않는다', () => {
    const geo = new QuiltGeometry({ sceneOrder: { s1: 0, s2: 5 } });
    geo.recordTransition('s1', 's2', 'echo_follow', 99);   // → clamp 1
    const afterHigh = geo.getPairDistance('s1', 's2');
    expect(afterHigh).toBeGreaterThanOrEqual(QUILT_GEOMETRY.TARGET_NEAR);

    const geo2 = new QuiltGeometry({ sceneOrder: { s1: 0, s2: 5 } });
    geo2.recordTransition('s1', 's2', 'echo_follow', -7);  // → clamp 0 = 안 움직임
    expect(geo2.getPairDistance('s1', 's2')).toBeCloseTo(5.0, 6);
  });
});

// ─── 7. pairKey 구분자 = NUL footgun — 계약 고정 ────────────────────────────
// pairKey(a,b) = `${a}\0${b}` (정렬 후 NUL 구분). 구분자가 NUL 이라는 사실을
// 못박는다. 만약 누가 구분자를 흔한 문자(space, '-', '|' 등)로 바꾸면 — 그 문자가
// sceneId 에 들어갈 때 서로 다른 쌍이 같은 키로 뭉개진다. NUL 은 그 위험을 막는
// 의도된 선택이므로, "공백 든 ID 가 충돌하지 않는다"를 테스트로 고정한다.
describe('pairKey 구분자 = NUL footgun — 계약 고정', () => {
  it('정상 케이스: 공백 없는 ID 는 순서 무관하게 같은 쌍으로 처리', () => {
    const geo = new QuiltGeometry({});
    geo.recordTransition('s1', 's2', 'echo_follow', 1.0);
    // (a,b) 와 (b,a) 가 같은 쌍을 가리킴
    expect(geo.getPairDistance('s1', 's2')).toBe(geo.getPairDistance('s2', 's1'));
    expect(geo.getSeam('s1', 's2').seam).toBe(geo.getSeam('s2', 's1').seam);
  });

  it('구분자가 NUL 이라 "공백 든 ID" 두 쌍이 충돌하지 않는다 (지금 구현 계약)', () => {
    // 만약 구분자가 space 였다면:
    //   ('a','b c') → 'a' + ' ' + 'b c' = 'a b c'
    //   ('a b','c') → 'a b' + ' ' + 'c' = 'a b c'   ← 충돌!
    // 실제 구분자는 NUL 이라 두 키는 'a\0b c' vs 'a b\0c' 로 서로 다르다 → 충돌 X.
    const geo = new QuiltGeometry({});
    geo.recordTransition('a', 'b c', 'avoidance', 1.0); // 'a'  'b c' 쌍만 far 로 밀림
    const distAB_C = geo.getPairDistance('a', 'b c');   // 거쳐서 변형됨 (> 원형)
    const distA_BC = geo.getPairDistance('a b', 'c');   // 안 거친 쌍 → 원형(DEFAULT)
    // 충돌이 없다는 증거: 한쪽만 변형됐고 다른 쪽은 원형 그대로다.
    expect(distA_BC).toBe(QUILT_GEOMETRY.DEFAULT_ARCHETYPE_DIST);
    expect(distAB_C).not.toBe(distA_BC);
    // 만약 향후 구분자를 흔한 문자로 바꾸면 이 not.toBe 가 깨지며 계약 변경을 알린다.
    // (그땐 위 PAIR_SEP 상수 + 이 기대값을 함께 갱신.)
  });
});

// ─── reset — 한 판 끝 → 원형부터 다시 (§6 무대) ──────────────────────────────
describe('reset — 다음 사람 위해 원형 복귀', () => {
  it('reset 후 모든 쌍 거리/seam/scale 가 원형으로 돌아간다', () => {
    const geo = new QuiltGeometry({ sceneOrder: { s1: 0, s2: 3 } });
    for (let i = 0; i < 10; i++) geo.recordTransition('s1', 's2', 'echo_follow', 1.0);
    geo.recordTransition('s1', 's2', 'fixation', 1.0); // scale 도 키워둠
    expect(geo.getPairDistance('s1', 's2')).toBeLessThan(3); // 변형됨
    expect(geo.getSceneScale('s2')).toBeGreaterThan(QUILT_GEOMETRY.SCALE_BASE);

    geo.reset();
    expect(geo.getPairDistance('s1', 's2')).toBeCloseTo(3.0, 6); // 원형 복귀
    expect(geo.getSeam('s1', 's2')).toBeNull();
    expect(geo.getSceneScale('s2')).toBe(QUILT_GEOMETRY.SCALE_BASE);
    expect(geo.getSnapshot()).toEqual({ distances: {}, seams: {}, scales: {} });
  });
});

// ─── null/undefined 입력 방어 ────────────────────────────────────────────────
describe('null/undefined 입력 — 조용히 무시/폴백', () => {
  it('fromId/toId 가 null 이면 recordTransition 은 아무 일도 안 한다', () => {
    const geo = new QuiltGeometry({});
    geo.recordTransition(null, 's2', 'echo_follow', 1.0);
    geo.recordTransition('s1', null, 'echo_follow', 1.0);
    expect(geo.getSnapshot().distances).toEqual({});
  });

  it('getPairDistance/getSeam/getSceneScale 가 null 입력에 폴백한다', () => {
    const geo = new QuiltGeometry({});
    expect(geo.getPairDistance(null, 's2')).toBe(QUILT_GEOMETRY.DEFAULT_ARCHETYPE_DIST);
    expect(geo.getSeam(null, 's2')).toBeNull();
    expect(geo.getSceneScale(null)).toBe(QUILT_GEOMETRY.SCALE_BASE);
  });
});

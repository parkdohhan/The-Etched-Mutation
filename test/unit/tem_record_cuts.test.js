// test/unit/tem_record_cuts.test.js
// RECORD v4 §5-2 절단 규칙 'era-lull-v1' 단위 테스트

import { describe, it, expect } from 'vitest';
import {
  cosineSim, meanVector, turnDeltas, findEraBoundaries, segmentTurns, segmentTurnsRelaxed,
  MIN_SCENES, MAX_SCENES,
} from '../../js/shared/tem_record_cuts.js';

// 17축 벡터 헬퍼 — 지배 감정 하나 + 잔여 노이즈
function vec(dom, strength = 0.8, noise = {}) {
  return { [dom]: strength, ...noise };
}
const A = () => vec('sadness', 0.8, { longing: 0.3 });
const B = () => vec('anger', 0.85, { shame: 0.2 });
const C = () => vec('relief', 0.7, { peace: 0.4 });
const turn = (text, vector, isVoid = false) => ({ text, vector, isVoid });

describe('cosineSim / meanVector', () => {
  it('같은 벡터 = 1, 직교 = 0', () => {
    expect(cosineSim(A(), A())).toBeCloseTo(1, 6);
    expect(cosineSim({ fear: 1 }, { joy: 1 })).toBe(0);
  });
  it('meanVector 는 키별 평균 (원시값 유지)', () => {
    const m = meanVector([{ fear: 0.8, joy: 0 }, { fear: 0.4, joy: 0.2 }]);
    expect(m.fear).toBeCloseTo(0.6, 6);
    expect(m.joy).toBeCloseTo(0.1, 6);
  });
});

describe('findEraBoundaries — era-lull-v1', () => {
  it('세 덩어리(A×3 B×3 C×3) → 2경계 3씬, 경계는 덩어리 끝', () => {
    const v = [A(), A(), A(), B(), B(), B(), C(), C(), C()];
    const r = findEraBoundaries(v);
    expect(r.method).toBe('era-lull-v1');
    expect(r.boundaries).toEqual([2, 5]);
  });

  it('소강 없이 요동만 이어지면(단조 표류) 촉발력 폴백으로 3씬 보강', () => {
    // 인접 델타가 전부 같은 크기 → hi=lo 경계 구분 불가 → 폴백
    const v = [];
    for (let i = 0; i < 8; i++) v.push({ fear: 1 - i * 0.12, joy: i * 0.12 });
    const r = findEraBoundaries(v);
    expect(r.method).toBe('trigger-power-fallback');
    expect(r.boundaries.length).toBe(MIN_SCENES - 1);
    // 모든 씬 길이 ≥ 2
    let start = 0; const lens = [];
    r.boundaries.forEach((b) => { lens.push(b - start + 1); start = b + 1; });
    lens.push(v.length - start);
    lens.forEach((L) => expect(L).toBeGreaterThanOrEqual(2));
  });

  it('측정 턴 3개뿐이면 경계 없음 (호출자가 대화 연장)', () => {
    const r = findEraBoundaries([A(), B(), B()]);
    expect(r.boundaries).toEqual([]);
  });

  it('7씬 상한 — 덩어리 10개여도 경계 ≤ 6', () => {
    const doms = ['fear', 'joy', 'anger', 'peace', 'guilt', 'relief', 'shame', 'hope', 'sadness', 'love'];
    const v = [];
    doms.forEach((d) => { v.push(vec(d)); v.push(vec(d, 0.78)); });
    const r = findEraBoundaries(v);
    expect(r.boundaries.length + 1).toBeLessThanOrEqual(MAX_SCENES);
  });
});

describe('segmentTurns — 턴 → 씬', () => {
  it('침묵(VOID)·미측정 턴은 직전 씬에 붙고, 씬 감정은 구성 턴 평균', () => {
    const turns = [
      turn('a1', A()), turn('a2', A()), turn('[VOID]', null, true), turn('a3', A()),
      turn('b1', B()), turn('b2', B()), turn('b3', B()),
      turn('c1', C()), turn('c2', C()), turn('(측정 실패)', null), turn('c3', C()),
    ];
    const r = segmentTurns(turns);
    expect(r.needMore).toBe(false);
    expect(r.segments.length).toBe(3);
    expect(r.segments[0].turnIndices).toEqual([0, 1, 2, 3]);
    expect(r.segments[0].voidCount).toBe(1);
    expect(r.segments[1].turnIndices).toEqual([4, 5, 6]);
    expect(r.segments[2].turnIndices).toEqual([7, 8, 9, 10]);
    expect(r.segments[0].vector.sadness).toBeCloseTo(0.8, 6);
    expect(r.segments[1].vector.anger).toBeCloseTo(0.85, 6);
    expect(r.measuredCount).toBe(9);
  });

  it('맨 앞 침묵은 첫 씬에, 꼬리 침묵은 마지막 씬에', () => {
    const turns = [
      turn('[VOID]', null, true), turn('a1', A()), turn('a2', A()),
      turn('b1', B()), turn('b2', B()), turn('c1', C()), turn('c2', C()), turn('[VOID]', null, true),
    ];
    const r = segmentTurns(turns);
    expect(r.segments[0].turnIndices[0]).toBe(0);
    const last = r.segments[r.segments.length - 1];
    expect(last.turnIndices[last.turnIndices.length - 1]).toBe(7);
    const total = r.segments.reduce((s, g) => s + g.turnIndices.length, 0);
    expect(total).toBe(turns.length);
  });

  it('짧은 대화는 needMore=true', () => {
    const r = segmentTurns([turn('a', A()), turn('b', B()), turn('c', C())]);
    expect(r.needMore).toBe(true);
  });
});

describe('segmentTurnsRelaxed — 두 번째 거절 뒤 완화 저장', () => {
  it('측정 3턴 이상이면 3씬으로 강제 분할', () => {
    const r = segmentTurnsRelaxed([turn('a', A()), turn('b', B()), turn('c', C())]);
    expect(r.needMore).toBe(false);
    expect(r.segments.length).toBe(3);
    expect(r.method).toBe('even-split-relaxed');
  });
  it('측정 3턴 미만이면 있는 만큼', () => {
    const r = segmentTurnsRelaxed([turn('a', A()), turn('b', B())]);
    expect(r.segments.length).toBeGreaterThanOrEqual(1);
    expect(r.method).toContain('short');
  });
  it('이미 3씬 이상이면 원 결과 그대로', () => {
    const turns = [turn('a1', A()), turn('a2', A()), turn('a3', A()), turn('b1', B()), turn('b2', B()), turn('b3', B()), turn('c1', C()), turn('c2', C()), turn('c3', C())];
    const r = segmentTurnsRelaxed(turns);
    expect(r.method).toBe('era-lull-v1');
  });
});

describe('turnDeltas', () => {
  it('길이 n−1, 같은 벡터 사이는 0', () => {
    const d = turnDeltas([A(), A(), B()]);
    expect(d.length).toBe(2);
    expect(d[0]).toBeCloseTo(0, 6);
    expect(d[1]).toBeGreaterThan(0.5);
  });
});

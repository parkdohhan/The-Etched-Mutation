// test/unit/quilt_demo_state.test.js
// QuiltDemoState 어댑터 단위 테스트
//
// 검증 범위 — 신규 로직이 없는 어댑터이므로, 메서드 약속(계약)만 시험한다.
//   1) snapshot 형상이 약속대로 나오는지
//   2) recordDialogTurn 필드 매핑
//   3) startReturn / completeReturnStep / endReturn 상태 전환
//   4) recordMutation 누적
//   5) reset

import { describe, it, expect } from 'vitest';
import { QuiltDemoState } from '../../js/core/QuiltDemoState.js';

// ─── snapshot 형상 ─────────────────────────────────────────────

describe('QuiltDemoState.getSnapshot — 초기 형상', () => {
  it('mode는 explore로 시작, returnIndex는 -1', () => {
    const q = new QuiltDemoState({ memoryId: 'mem-1' });
    const snap = q.getSnapshot();
    expect(snap.memoryId).toBe('mem-1');
    expect(snap.mode).toBe('explore');
    expect(snap.returnIndex).toBe(-1);
    expect(snap.visited).toEqual([]);
    expect(snap.trajectory).toEqual([]);
    expect(snap.dialogTurns).toEqual([]);
    expect(snap.mutatedLines).toEqual([]);
  });

  it('getVisited / getTrajectory 콜백 결과가 snapshot에 그대로 반영된다', () => {
    const q = new QuiltDemoState({
      memoryId: 'm',
      getVisited: () => ['a', 'b', 'c'],
      getTrajectory: () => [{ x: 1 }, { x: 2 }],
    });
    const snap = q.getSnapshot();
    expect(snap.visited).toEqual(['a', 'b', 'c']);
    expect(snap.trajectory).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('snapshot의 배열은 내부 상태와 분리된다 (외부에서 push해도 안전)', () => {
    const q = new QuiltDemoState();
    const snap = q.getSnapshot();
    snap.dialogTurns.push({ sceneId: 'hack' });
    expect(q.getSnapshot().dialogTurns).toEqual([]);
  });
});

// ─── recordDialogTurn ───────────────────────────────────────────

describe('QuiltDemoState.recordDialogTurn', () => {
  it('주요 필드를 표준 모양으로 누적한다', () => {
    const q = new QuiltDemoState();
    q.recordDialogTurn({
      sceneId: 's1',
      sceneOrder: 0,
      scene_link_input: '냄새가 났어',
      alignment: 0.82,
      resonance: 'resonance',
    });
    const [turn] = q.getSnapshot().dialogTurns;
    expect(turn.sceneId).toBe('s1');
    expect(turn.sceneOrder).toBe(0);
    expect(turn.input).toBe('냄새가 났어');
    expect(turn.alignment).toBe(0.82);
    expect(turn.resonance).toBe('resonance');
    expect(typeof turn.ts).toBe('number');
  });

  it('null/undefined turn은 무시한다', () => {
    const q = new QuiltDemoState();
    q.recordDialogTurn(null);
    q.recordDialogTurn(undefined);
    expect(q.getSnapshot().dialogTurns).toEqual([]);
  });
});

// ─── mode 전환 ─────────────────────────────────────────────────

describe('QuiltDemoState.startReturn', () => {
  it('explore 모드에서 호출 시 returnIndex는 visited 마지막 인덱스', () => {
    const q = new QuiltDemoState({
      getVisited: () => ['s1', 's2', 's3', 's4'],
    });
    q.startReturn();
    const snap = q.getSnapshot();
    expect(snap.mode).toBe('return');
    expect(snap.returnIndex).toBe(3);
  });

  it('이미 return/done 모드면 무시한다', () => {
    const q = new QuiltDemoState({ getVisited: () => ['s1', 's2'] });
    q.startReturn();
    const before = q.getSnapshot().returnIndex;
    q.startReturn(); // 다시 호출
    expect(q.getSnapshot().returnIndex).toBe(before);
    expect(q.getSnapshot().mode).toBe('return');
  });
});

describe('QuiltDemoState.completeReturnStep', () => {
  it('올바른 sceneId면 returnIndex 1 감소', () => {
    const q = new QuiltDemoState({ getVisited: () => ['s1', 's2', 's3'] });
    q.startReturn(); // returnIndex = 2, expected = 's3'
    const result = q.completeReturnStep('s3');
    expect(result.ok).toBe(true);
    expect(result.done).toBe(false);
    expect(q.getSnapshot().returnIndex).toBe(1);
  });

  it('잘못된 sceneId는 거부되고 expected를 알려준다', () => {
    const q = new QuiltDemoState({ getVisited: () => ['s1', 's2', 's3'] });
    q.startReturn();
    const result = q.completeReturnStep('s99');
    expect(result.ok).toBe(false);
    expect(result.expected).toBe('s3');
    expect(q.getSnapshot().returnIndex).toBe(2); // 변화 없음
  });

  it('마지막 step을 통과하면 mode가 done으로 바뀐다', () => {
    const q = new QuiltDemoState({ getVisited: () => ['s1', 's2'] });
    q.startReturn(); // returnIndex = 1, expected = 's2'
    q.completeReturnStep('s2'); // returnIndex = 0
    const final = q.completeReturnStep('s1'); // returnIndex = -1
    expect(final.ok).toBe(true);
    expect(final.done).toBe(true);
    expect(q.getSnapshot().mode).toBe('done');
  });

  it('return 모드가 아니면 거부한다', () => {
    const q = new QuiltDemoState({ getVisited: () => ['s1'] });
    const result = q.completeReturnStep('s1');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_returning');
  });
});

// ─── recordMutation ─────────────────────────────────────────────

describe('QuiltDemoState.recordMutation', () => {
  it('before/after를 sceneId와 함께 누적한다', () => {
    const q = new QuiltDemoState();
    q.recordMutation('s1', '그게 무슨 냄새였더라.', '네가 냄새라고 해서 그런지, 이제 먼저 냄새가 나.');
    const [m] = q.getSnapshot().mutatedLines;
    expect(m.sceneId).toBe('s1');
    expect(m.before).toBe('그게 무슨 냄새였더라.');
    expect(m.after).toMatch(/네가 냄새라고 해서/);
    expect(typeof m.ts).toBe('number');
  });
});

// ─── reset ─────────────────────────────────────────────────────

describe('QuiltDemoState.reset', () => {
  it('mode/returnIndex/dialogTurns/mutatedLines 다 초기화', () => {
    const q = new QuiltDemoState({ getVisited: () => ['s1', 's2'] });
    q.recordDialogTurn({ sceneId: 's1', alignment: 0.7, resonance: 'vague' });
    q.recordMutation('s1', 'a', 'b');
    q.startReturn();
    q.reset();
    const snap = q.getSnapshot();
    expect(snap.mode).toBe('explore');
    expect(snap.returnIndex).toBe(-1);
    expect(snap.dialogTurns).toEqual([]);
    expect(snap.mutatedLines).toEqual([]);
  });
});

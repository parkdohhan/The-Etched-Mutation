// Words that remain (branch space-remain, 2026-11-28) — the rules of js/spaceremain/remain.js, checked against their own definitions.
import { describe, it, expect } from 'vitest';
import { beforeOf, remaining, placeLocal, placeServer, withChange, alike, pieceShift, textOf, stamp, fresh } from '../../js/spaceremain/remain.js';

const R = (blame, fear, base) => ({ base, reason_analysis: { attribution: blame, core_fear: fear } });
const L = (order, raw, blame, fear, emo) => ({ order, raw, blame, fear, emo });

describe('before entering', () => {
  it('takes the direction named most often; a tie keeps the earlier blank', () => {
    expect(beforeOf([R('self_blame', 'abandonment', { guilt: 1 }), R('other_blame', 'abandonment', { anger: 1 }), R('self_blame', 'death', { guilt: 1 })]).blame).toBe('self_blame');
    expect(beforeOf([R('other_blame', 'failure', {}), R('self_blame', 'death', {}), R('fate_blame', 'rejection', {})]).blame).toBe('other_blame');
    expect(beforeOf([R('other_blame', 'failure', {}), R('self_blame', 'death', {}), R('fate_blame', 'rejection', {})]).fear).toBe('failure');
  });
  it('a reading that failed, or a name the classifier does not have, is not counted', () => {
    const b = beforeOf([null, R('unknown', 'none', { guilt: 0.4 }), null]);
    expect(b.blame).toBe(null); expect(b.fear).toBe(null); expect(b.read).toBe(1);
  });
});

describe('which lines remain', () => {
  const before = { blame: 'self_blame', fear: 'abandonment', emo: { guilt: 1, anger: 0 } };
  it('one candidate a scene, and the first half of the scenes (rounded up)', () => {
    const lines = [L(1, 'a', 'self_blame', 'abandonment', { guilt: 1 }), L(1, 'b', 'other_blame', 'death', { anger: 1 }),
      L(2, 'c', 'other_blame', 'death', { anger: 1 }), L(3, 'd', 'other_blame', 'abandonment', { anger: 1 })];
    const keep = remaining(lines, before);
    expect(keep.size).toBe(2);                        // 3 scenes → 2
    expect(keep.has(0)).toBe(true);                   // scene 1: the line the same in blame
    expect(keep.has(3)).toBe(true);                   // then the scene whose candidate is the same in fear, before the one that is neither
    expect(keep.has(1)).toBe(false);
  });
  it('the same in blame comes before the same in fear, and that before the cosine', () => {
    const lines = [L(1, 'far but same blame', 'self_blame', 'death', { anger: 1 }), L(1, 'near, other blame', 'other_blame', 'abandonment', { guilt: 1 })];
    expect(Array.from(remaining(lines, before))).toEqual([0]);
    const level = [L(1, 'far', 'other_blame', 'death', { anger: 1 }), L(1, 'near', 'other_blame', 'death', { guilt: 1, anger: 0.1 })];
    expect(Array.from(remaining(level, before))).toEqual([1]);
  });
  it('refutation: when every line is the same in blame, no line that is not the nearest of its scene remains', () => {
    const lines = [L(1, 'x', 'self_blame', 'death', { anger: 1 }), L(1, 'y', 'self_blame', 'abandonment', { guilt: 1 }), L(2, 'z', 'self_blame', 'death', { guilt: 0.2, anger: 1 }), L(2, 'w', 'self_blame', 'death', { guilt: 1 })];
    const keep = remaining(lines, before);
    expect(keep.has(0)).toBe(false); expect(keep.has(2)).toBe(false);
  });
  it('a line that cannot remain (a silent scene, held back) is left out, and one line is one scene kept', () => {
    expect(Array.from(remaining([null, L(4, 'only', 'fate_blame', 'none', { guilt: 0.3 })], before))).toEqual([1]);
    expect(remaining([], before).size).toBe(0);
  });
  it('left to chance: still one a scene and half the scenes', () => {
    let n = 0; const random = () => [0.9, 0.1, 0.4, 0.7, 0.2, 0.6][n++ % 6];
    const lines = [L(1, 'a'), L(1, 'b'), L(2, 'c'), L(3, 'd'), L(4, 'e')];
    const keep = remaining(lines, before, { random });
    expect(keep.size).toBe(2);
    expect(keep.has(0) && keep.has(1)).toBe(false);
  });
});

describe('the seam', () => {
  const S = ['처음부터 알고 있었다.', '전화는 내게 왔었다.', '내가 받지 않았다.'];
  it('without the server: the sentence sharing the most with the line; none shared → the last', () => {
    expect(placeLocal(S, '전화는 엄마가 건 거야').index).toBe(1);
    expect(placeLocal(S, 'zzz').index).toBe(2);
    expect(placeLocal(S, '네 잘못').text).toBe('네 잘못.');
  });
  it('the server names the sentence; its spelling is used only while it is still the walker\'s own words', () => {
    expect(placeServer(S, '엄마가 먼저 버린 거잖아', { index: 2, text: '엄마가 먼저 버린 거잖아.' })).toEqual({ index: 2, text: '엄마가 먼저 버린 거잖아.', by: 'server' });
    const rewritten = placeServer(S, '엄마가 먼저 버린 거잖아', { index: 2, text: '어머니는 나를 먼저 떠나갔다.' });
    expect(rewritten.index).toBe(2); expect(rewritten.text).toBe('엄마가 먼저 버린 거잖아.');
    expect(placeServer(S, '네 잘못', { index: 9, text: '네 잘못.' }).by).toBe('local');
    expect(placeServer(S, '네 잘못', null).by).toBe('local');
  });
  it('one sentence is displaced; the others stand as they stood', () => {
    expect(withChange(S, 2, '엄마가 먼저 버린 거잖아.')).toBe('처음부터 알고 있었다. 전화는 내게 왔었다. 엄마가 먼저 버린 거잖아.');
    expect(alike('내가 받지 않았다.', '내가 받지 않았다')).toBe(1);
  });
});

describe('a changed piece', () => {
  const TOPO = { L: 150, G: 0.42, Y: 0.7 };
  const acc = { axes: ['guilt', 'anger'], own: new Map([['a', [1, 0]], ['b', [0, 1]], ['c', [1, 0]]]), pos: new Map([['a', [0, 0, 0]], ['b', [1, 0, 0]], ['c', [-1, 0, 0]]]) };
  it('moves toward the scenes that carry what the line carried', () => {
    const s = pieceShift(acc, 'a', { guilt: 0, anger: 1 }, 4, TOPO);
    expect(s[0]).toBeGreaterThan(0);                  // toward b (anger), away from c (guilt)
  });
  it('does not move when the line carried what the scene already does, or was not read', () => {
    expect(pieceShift(acc, 'a', { guilt: 1, anger: 0 }, 4, TOPO).every((x) => Math.abs(x) < 1e-9)).toBe(true);
    expect(pieceShift(acc, 'a', null, 4, TOPO)).toEqual([0, 0, 0]);
  });
});

describe('what this browser keeps', () => {
  it('the next person reads what was left, else the text as written', () => {
    const st = fresh('X'); const scene = { scene_order: 7, text: 'as written.' };
    expect(textOf(st, scene)).toBe('as written.');
    const a = stamp(st); st.texts[7] = 'as left.';
    expect(textOf(st, scene)).toBe('as left.');
    expect(stamp(st)).not.toBe(a);
  });
});

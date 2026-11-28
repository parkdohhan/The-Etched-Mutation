// Words that remain (branch space-remain, 2026-11-28) — the rules of js/spaceremain/remain.js, checked against their own definitions.
import { describe, it, expect } from 'vitest';
import { beforeOf, remaining, turnsBack, speaksOfFault, placeLocal, placeServer, withChange, alike, pieceShift, textOf, stamp, fresh } from '../../js/spaceremain/remain.js';

const L = (order, raw, whom, back, emo) => ({ order, raw, whom, back, emo });

describe('before entering', () => {
  it('keeps the emotion reading of each blank, in order; a blank not read has none', () => {
    const b = beforeOf([{ base: { guilt: 1 } }, null, { base: { longing: 1 } }]);
    expect(b.blanks.length).toBe(3); expect(b.blanks[0].emo).toEqual({ guilt: 1 }); expect(b.blanks[1].emo).toBe(null); expect(b.read).toBe(2);
    expect(beforeOf([]).blanks.length).toBe(0);
  });
});

describe('which lines remain', () => {
  const before = { blanks: [{ emo: { guilt: 1, anger: 0 } }, { emo: { longing: 1 } }, { emo: null }] };
  const B = { byBlank: true };                                              // the second rule, kept for comparison (?pick=blanks)
  it('third rule (261129): whatever speaks of fault — narrator, other, nobody, then the earlier; one a scene; three at most', () => {
    const lines = [L(1, 'fact', 'none', 0), L(2, 'excuse', 'nobody', -1), L(3, 'her', 'other', -1), L(4, 'you', 'narrator', -1), L(4, 'you again', 'narrator', 0), L(5, 'you too', 'narrator', -1), null, L(6, '', 'narrator', 0)];
    expect(Array.from(remaining(lines, before)).sort()).toEqual([2, 3, 5]);         // both narrator lines of other scenes, then the other; scene 4 holds one
    expect(Array.from(remaining(lines.slice(0, 3), before)).sort()).toEqual([1, 2]);
    expect(remaining([L(1, 'a', 'none', 0), L(2, 'b', 'none', 1)], before).size).toBe(0);   // refutation: nothing remains whose whom is none
    expect(remaining(lines.concat([L(7, 'x', 'narrator', -1), L(8, 'y', 'narrator', -1)]), before).size).toBe(3);
  });
  it('a line turns back on a blank when it is the same matter AND speaks of fault', () => {
    expect(turnsBack(L(7, '받았어야지. 네가.', 'narrator', 0), 0)).toBe(true);
    expect(turnsBack(L(7, '누가 건 전화야?', 'none', 0), 0)).toBe(false);          // the same matter, but a question of fact
    expect(turnsBack(L(7, '받았어야지. 네가.', 'narrator', -1), 0)).toBe(false);   // about fault, but no matter of the walker's own
    expect(turnsBack(L(7, '받았어야지. 네가.', 'narrator', 0), 1)).toBe(false);
    expect(speaksOfFault(L(1, 'x', 'nobody', -1))).toBe(true); expect(speaksOfFault(L(1, 'x', 'none', 2))).toBe(false);
  });
  it('at most one line a blank — three at most — and one a scene', () => {
    const lines = [L(3, 'a', 'narrator', 0), L(7, 'b', 'narrator', 0), L(8, 'c', 'other', 1), L(9, 'd', 'other', 1), L(2, 'e', 'nobody', 2), L(4, 'f', 'narrator', -1), L(5, 'g', 'none', 2)];
    const keep = remaining(lines, before, B);
    expect(Array.from(keep).sort()).toEqual([0, 2, 4]);
    expect(remaining(lines.concat([L(6, 'h', 'narrator', 2), L(1, 'i', 'narrator', 0)]), before, B).size).toBe(3);
  });
  it('among lines that turn back on the same blank: narrator, then other, then nobody; then the cosine with that blank; then the earlier', () => {
    expect(Array.from(remaining([L(3, 'excuse', 'nobody', 0, { guilt: 1 }), L(7, 'other', 'other', 0, { guilt: 1 }), L(13, 'you', 'narrator', 0, { anger: 1 })], before, B))).toEqual([2]);
    expect(Array.from(remaining([L(3, 'far', 'narrator', 0, { anger: 1 }), L(7, 'near', 'narrator', 0, { guilt: 1, anger: 0.1 })], before, B))).toEqual([1]);
    expect(Array.from(remaining([L(3, 'first', 'narrator', 2), L(7, 'second', 'narrator', 2)], before, B))).toEqual([0]);   // blank 2 was not read: level, the earlier
  });
  it('a scene holds one remaining line: the next blank takes its next line', () => {
    const lines = [L(7, 'call', 'narrator', 0), L(7, 'night', 'narrator', 1), L(8, 'night, elsewhere', 'nobody', 1)];
    expect(Array.from(remaining(lines, before, B)).sort()).toEqual([0, 2]);
    expect(Array.from(remaining(lines.slice(0, 2), before, B))).toEqual([0]);
  });
  it('refutation: nothing remains whose back is none or whose whom is none; nothing turns back → nothing remains', () => {
    const lines = [L(1, 'a', 'narrator', -1, { guilt: 1 }), L(2, 'b', 'none', 0, { guilt: 1 }), L(3, 'c', 'other', -1), null, L(4, '', 'narrator', 0)];
    expect(remaining(lines, before, B).size).toBe(0);
    expect(remaining([], before).size).toBe(0);
  });
  it('left to chance: three at most, one a scene, whatever was read', () => {
    let n = 0; const random = () => [0.9, 0.1, 0.4, 0.7, 0.2, 0.6][n++ % 6];
    const lines = [L(1, 'a', 'none', -1), L(1, 'b', 'none', -1), L(2, 'c', 'none', -1), L(3, 'd', 'none', -1), L(4, 'e', 'none', -1)];
    const keep = remaining(lines, before, { random });
    expect(keep.size).toBe(3);
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
  it('the server names the sentence and rewrites the line in the manner of the text; a runaway or empty answer is not used', () => {
    expect(placeServer(S, '엄마가 먼저 버린거자나', { index: 2, text: '엄마가 먼저 버린 것이다' })).toEqual({ index: 2, text: '엄마가 먼저 버린 것이다.', by: 'server' });
    expect(placeServer(S, '네가 안 받은 거야. 엄마가 아니라.', { index: 2, text: '내가 받지 않은 것이다. 엄마가 아니라.' }).text).toBe('내가 받지 않은 것이다. 엄마가 아니라.');
    const runaway = placeServer(S, '네 잘못', { index: 1, text: '그것은 결국 누구의 잘못도 아니었고 다만 오래 울리던 전화가 있었을 뿐이라고 나는 생각했다.' });
    expect(runaway).toEqual({ index: 1, text: '네 잘못.', by: 'server-place' });
    expect(placeServer(S, '네 잘못', { index: 1, text: '  ' }).text).toBe('네 잘못.');
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

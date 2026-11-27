// Tidying a typed line (2026-11-28) — js/shared/tidy_line.js, checked against the lines that were actually typed.
import { describe, it, expect } from 'vitest';
import { tidyLine } from '../../js/shared/tidy_line.js';

describe('tidyLine', () => {
  it('takes out a letter left standing alone', () => {
    expect(tidyLine('외로웠겠다ㅏ')).toBe('외로웠겠다');
    expect(tidyLine('그리고 나는 코를 막ㄷ았다')).toBe('그리고 나는 코를 막았다');
    expect(tidyLine('오늘 점심은 짜장면이 먹고 싶다 ㅋㅋㅋ')).toBe('오늘 점심은 짜장면이 먹고 싶다');
    expect(tidyLine('나는 ㅠㅠ 몰라.')).toBe('나는 몰라.');
  });
  it('a line of loose letters only is no line', () => {
    for (const s of ['ㅁㄴㅇㄹ', 'ㅠㅓ;ㅏ', "ㄴㅇ'ㄹㅇㄴ", 'ㅇㅇㅇㅇㅇㅇ', '   ', '', null, undefined, '...', ';;']) expect(tidyLine(s)).toBe('');
  });
  it('takes what the loose letters left hanging with them', () => {
    expect(tidyLine('그럼에도 불구하고 ]ㅏ')).toBe('그럼에도 불구하고');
    expect(tidyLine('그런데 ㅇㅈㅇㅁㅈㅇ')).toBe('그런데');
    expect(tidyLine('왜 그랬어 ㅋ?')).toBe('왜 그랬어?');
  });
  it('leaves a clean line as it is', () => {
    for (const s of ['전화를 안 받은 건 네 잘못이야. 겁이 났던 거잖아.', '엄마', '"그만해."', '왜?', '싫어어어어', 'I was afraid.', "it wasn't me", '(웃음)', '……몰라', '3년'])
      expect(tidyLine(s)).toBe(s);
  });
  it('joins letters that were only stored apart', () => {
    expect(tidyLine('엄마'.normalize('NFD'))).toBe('엄마');
  });
  it('trims and closes doubled spaces', () => {
    expect(tidyLine('  불을   켜 두고 잤다  ')).toBe('불을 켜 두고 잤다');
  });
});

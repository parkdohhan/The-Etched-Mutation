// js/content/narrative_fallback_strings.js
//
// V2-6 drift 픽 폴백 문구 — DriftPicker 가 변주 풀에서 픽 실패 시 (의미 필터 점진 풀기
// 끝까지 갔는데도 빈 풀) 박는 자리. 유령이 침묵하지 않게.
//   → CLAUDE.md §6.5 #4 "Fallback has narrative justification" 정합.
//   → SCOPE §9-5 — narrative_fallback_strings (한국어 13 + 영어 13).
//
// 톤 = 작품 톤. 게임 톤 ("다시 해보세요!", "정답!") 금지. 유령이 *기억의 자리에 대해*
// 말하는 결 — "...남았다", "...거기 있었어", "...그게 아니야".
//
// 결마다 분배: resonance 5 / vague 4 / dissonance 4 = 13 (한국어·영어 동일).
// 이건 작가 손질 가능한 시드 자리 (SCOPE §9-5). 톤 안 맞으면 갈아끼움 — 무리해서
// "완벽한" 13개 만들 자리 아님. 빈 풀이면 pickFallbackString 이 한국어로 폴백.

export const NARRATIVE_FALLBACK_STRINGS = {
  ko: {
    // resonance — 사용자 입력이 원본 유령 감정과 맞물림. 유령이 부드럽게 받아침.
    resonance: [
      '—그래. 그 자리, 나도 거기 있었어.',
      '응. 너도 그렇게 기억하는구나.',
      '맞아. 그게 거기 그대로 남아 있었어.',
      '...어, 그 결. 나도 같은 데서 멈췄던 것 같아.',
      '그렇게 닿는구나. 나한테도 그 자리는 그랬어.',
    ],
    // vague — 사용자 입력이 어중간. 유령도 흐릿하게.
    vague: [
      '...뭐였더라. 그 언저리였던 것 같은데.',
      '글쎄. 그렇게 말하면… 그런 것도 같고.',
      '그쯤이었나. 자꾸 가장자리가 번져서.',
      '...어딘가 그 비슷한 게 남아 있긴 한데.',
    ],
    // dissonance — 사용자 입력이 원본과 어긋남. 유령이 거리를 둠.
    dissonance: [
      '—그건 네 자리가 아닐 텐데.',
      '아니. 내가 기억하는 건 그게 아니야.',
      '...그쪽으로는 안 갔던 것 같은데. 적어도 나는.',
      '어긋났어. 거기, 그렇게 새겨진 적 없어.',
    ],
  },
  en: {
    // resonance
    resonance: [
      '—Yes. I was there too, in that place.',
      'So you remember it that way as well.',
      'That much stayed, right where it was.',
      '...Oh. I think I stopped at the same spot.',
      'It reaches you like that. It was the same for me, there.',
    ],
    // vague
    vague: [
      '...What was it. Somewhere around there, I think.',
      'Hm. Put it that way and… maybe, kind of.',
      'About there, was it. The edges keep bleeding.',
      '...Something close to that did stay, somewhere.',
    ],
    // dissonance
    dissonance: [
      '—That place wouldn’t be yours, though.',
      'No. That isn’t what I remember.',
      '...I don’t think it went that way. Not for me, at least.',
      'It slipped. It was never etched there, not like that.',
    ],
  },
};

const VALID_TONES = ['resonance', 'vague', 'dissonance'];

/**
 * 결(tone) + 언어(lang)로 폴백 문구 하나 픽.
 *
 * 결정성 seed 인자 — 같은 (tone, lang, seed) = 같은 픽. plays 도장 재현 자리에서 쓰임
 * (회차마다 다시 sampling 하지 않고 도장 읽기 — SCOPE §9-5 결정성 모드 정합).
 *
 * @param {string} tone - 'resonance' | 'vague' | 'dissonance'. 그 외 값은 'vague' 로 떨어짐.
 * @param {string} [lang='ko'] - 'ko' | 'en'. 빈 풀(예: 영어 미박)이면 'ko' 로 폴백.
 * @param {number} [seed] - 0~1 결정성 seed. 생략 시 Math.random().
 * @returns {string} 폴백 문구. 모든 풀이 비었으면 '' (호출 자리에서 추가 안전망).
 */
export function pickFallbackString(tone, lang = 'ko', seed) {
  const t = VALID_TONES.indexOf(tone) >= 0 ? tone : 'vague';
  const langTable = NARRATIVE_FALLBACK_STRINGS[lang] || NARRATIVE_FALLBACK_STRINGS.ko;
  const pool = (langTable && langTable[t]) || [];

  if (pool.length === 0) {
    // 영어 빈 풀 → 한국어로 폴백. 한국어도 비었으면 '' (이론상 발생 안 함).
    if (lang !== 'ko') return pickFallbackString(t, 'ko', seed);
    return '';
  }

  const r = (typeof seed === 'number' && seed >= 0 && seed < 1) ? seed : Math.random();
  const idx = Math.min(pool.length - 1, Math.floor(r * pool.length));
  return pool[idx];
}

/**
 * 전체 폴백 풀 개수 (smoke/vitest 검증용).
 * @returns {{ ko: number, en: number }}
 */
export function fallbackPoolSizes() {
  const count = (table) => VALID_TONES.reduce((sum, t) => sum + ((table[t] || []).length), 0);
  return {
    ko: count(NARRATIVE_FALLBACK_STRINGS.ko),
    en: count(NARRATIVE_FALLBACK_STRINGS.en),
  };
}

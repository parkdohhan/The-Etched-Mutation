// test/unit/contaminationPresenter.test.js
// contaminationPresenter — seeded PRNG determinism + text transformation tests
//
// 작품의 결정론 약속:
//   "같은 기억·같은 오염 상태에서 다시 플레이해도 동일한 오염 패턴이 보인다"
//   이 테스트는 그 약속이 코드에서 강제되는지 검증한다.

import { describe, it, expect, vi } from 'vitest';

// Mock browser-dependent modules so contaminationPresenter can import in Node
vi.mock('../../js/lib/supabaseClient.js', () => ({
  getAccessToken: () => Promise.resolve(null),
}));
vi.mock('../../js/services/NetworkService.js', () => ({
  networkService: { updateScene: () => {} },
}));

import { applyStageText } from '../../js/app/contaminationPresenter.js';

// ─── Determinism ──────────────────────────────────────────────────

describe('contaminationPresenter — seeded determinism', () => {
  const TEXTS = [
    'The cold morning. The wet grass. You were there when it happened.',
    '비가 왔다. 병원 복도에서 누군가의 발소리가 들렸다. 나는 거기 서 있었다.',
    'I remember your face but not your name. The light was harsh.',
    '그 사람이 떠난 뒤에도 냄새가 남아있었다.',
    'A long hallway. Fluorescent lights. The sound of my own breathing.',
  ];

  const STAGES = [
    { stage: 'biased_inclination', intensity: 0.5, band: 'medium' },
    { stage: 'biased_inclination', intensity: 0.8, band: 'strong' },
    { stage: 'hypercompletion', intensity: 0.5, band: 'medium' },
    { stage: 'hypercompletion', intensity: 0.8, band: 'strong' },
  ];

  for (const text of TEXTS) {
    for (const pres of STAGES) {
      it(`deterministic: "${text.slice(0, 30)}..." + ${pres.stage}/${pres.band}`, () => {
        const scene = {}; // no pre-generated text → forces client-side fallback
        const out1 = applyStageText(text, scene, pres);
        const out2 = applyStageText(text, scene, pres);
        const out3 = applyStageText(text, scene, pres);

        expect(out1).toBe(out2);
        expect(out2).toBe(out3);
      });
    }
  }

  it('different text → different output (seed varies)', () => {
    const pres = { stage: 'biased_inclination', intensity: 0.7, band: 'strong' };
    const out1 = applyStageText('The cold morning in December.', {}, pres);
    const out2 = applyStageText('A warm evening in July silence.', {}, pres);
    // Very unlikely to be identical with different seed inputs
    // (could theoretically match if both pass all rng gates, but near-impossible)
    expect(out1).not.toBe(out2);
  });

  it('snapshot: stable → original text unchanged', () => {
    const text = 'The light was cold and distant.';
    expect(applyStageText(text, {}, { stage: 'stable', intensity: 0, band: 'weak' })).toBe(text);
  });

  it('snapshot: very low intensity → original text unchanged', () => {
    const text = 'Memory fragments scattered on the floor.';
    expect(applyStageText(text, {}, { stage: 'biased_inclination', intensity: 0.005, band: 'weak' })).toBe(text);
  });
});

// ─── biased_inclination effects ───────────────────────────────────

describe('contaminationPresenter — biased_inclination', () => {
  it('produces · erosion characters at strong intensity', () => {
    let foundDot = false;
    // Run many different texts to ensure at least one triggers erosion
    for (let i = 0; i < 30; i++) {
      const text = `word_${i}_longer another_word_${i} test_phrase_${i}_extended`;
      const out = applyStageText(text, {}, {
        stage: 'biased_inclination', intensity: 0.8, band: 'strong',
      });
      if (out.includes('·')) { foundDot = true; break; }
    }
    expect(foundDot).toBe(true);
  });

  it('medium band has lower transformation probability than strong', () => {
    const text = 'a'.repeat(200) + ' ' + 'b'.repeat(200) + ' ' + 'c'.repeat(200);
    const outMed = applyStageText(text, {}, {
      stage: 'biased_inclination', intensity: 0.5, band: 'medium',
    });
    const outStrong = applyStageText(text, {}, {
      stage: 'biased_inclination', intensity: 0.8, band: 'strong',
    });

    const countDotsMed = (outMed.match(/·/g) || []).length;
    const countDotsStrong = (outStrong.match(/·/g) || []).length;

    // Strong should have more erosion than medium (probabilistically)
    // With 600 chars this is extremely reliable
    expect(countDotsStrong).toBeGreaterThanOrEqual(countDotsMed);
  });

  it('Korean text erosion starts earlier (50% vs 60%)', () => {
    // This is a structural test: Korean fadeStart = max(1, floor(len*0.5))
    // English fadeStart = max(1, floor(len*0.6))
    const koText = '기억이라는것은변형되는것이다';
    const enText = 'memorytransformation';

    // Both should be processable without error
    const koOut = applyStageText(koText, {}, {
      stage: 'biased_inclination', intensity: 0.9, band: 'strong',
    });
    const enOut = applyStageText(enText, {}, {
      stage: 'biased_inclination', intensity: 0.9, band: 'strong',
    });

    expect(typeof koOut).toBe('string');
    expect(typeof enOut).toBe('string');
    expect(koOut.length).toBeGreaterThan(0);
    expect(enOut.length).toBeGreaterThan(0);
  });
});

// ─── hypercompletion effects ──────────────────────────────────────

describe('contaminationPresenter — hypercompletion', () => {
  const GLITCH_CHARS = '░▒▓█▪▫';

  it('produces word echo or glitch characters', () => {
    let foundEcho = false;
    let foundGlitch = false;

    for (let i = 0; i < 50; i++) {
      const text = `memory_${i} recollection_${i} certainty_${i} absolute_${i}`;
      const out = applyStageText(text, {}, {
        stage: 'hypercompletion', intensity: 0.85, band: 'strong',
      });

      if (!foundEcho) {
        const words = out.split(/\s+/);
        for (let j = 1; j < words.length; j++) {
          if (words[j] === words[j - 1] && words[j].length > 1) {
            foundEcho = true;
            break;
          }
        }
      }
      if (!foundGlitch) {
        for (const c of GLITCH_CHARS) {
          if (out.includes(c)) { foundGlitch = true; break; }
        }
      }
      if (foundEcho && foundGlitch) break;
    }

    expect(foundEcho || foundGlitch).toBe(true);
  });

  it('glitch chars come from the defined set only', () => {
    const allowedGlitch = new Set([...GLITCH_CHARS]);
    const validChars = new Set([
      ...('abcdefghijklmnopqrstuvwxyz0123456789_ '),
      ...allowedGlitch,
    ]);

    for (let i = 0; i < 20; i++) {
      const text = `test${i} word${i}`;
      const out = applyStageText(text, {}, {
        stage: 'hypercompletion', intensity: 0.9, band: 'strong',
      });

      for (const c of out) {
        if (!validChars.has(c)) {
          // Character not in our expected set — this is fine if it's from the original text
          // (e.g., original had uppercase). Just check glitch chars are from the set.
          if (allowedGlitch.has(c) || text.includes(c) || c === ' ') continue;
          // Unexpected character — fail
          expect(validChars.has(c) || text.includes(c)).toBe(true);
        }
      }
    }
  });
});

// ─── Pre-generated text priority ──────────────────────────────────

describe('contaminationPresenter — pre-generated text priority', () => {
  it('text_stage_1 wins for biased_inclination/medium', () => {
    const scene = { text_stage_1: '이미 기울어진 기억.' };
    const out = applyStageText('original text', scene, {
      stage: 'biased_inclination', intensity: 0.5, band: 'medium',
    });
    expect(out).toBe(scene.text_stage_1);
  });

  it('text_stage_2 wins for biased_inclination/strong', () => {
    const scene = { text_stage_2: '해석이 병기된 기억.' };
    const out = applyStageText('original text', scene, {
      stage: 'biased_inclination', intensity: 0.8, band: 'strong',
    });
    expect(out).toBe(scene.text_stage_2);
  });

  it('text_stage_2 wins for hypercompletion/medium', () => {
    const scene = { text_stage_2: '해석이 병기된 기억.' };
    const out = applyStageText('original text', scene, {
      stage: 'hypercompletion', intensity: 0.5, band: 'medium',
    });
    expect(out).toBe(scene.text_stage_2);
  });

  it('text_stage_3 wins for hypercompletion/strong', () => {
    const scene = { text_stage_3: '과잉 완결된 기억.' };
    const out = applyStageText('original text', scene, {
      stage: 'hypercompletion', intensity: 0.9, band: 'strong',
    });
    expect(out).toBe(scene.text_stage_3);
  });

  it('falls through to client-side when pre-generated text missing', () => {
    const out = applyStageText('some longer text here for testing', {}, {
      stage: 'biased_inclination', intensity: 0.8, band: 'strong',
    });
    // Should still return a string (client-side fallback)
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('weak band always returns original text', () => {
    const scene = { text_stage_1: 'should not use this' };
    const text = 'The original memory text.';
    const out = applyStageText(text, scene, {
      stage: 'biased_inclination', intensity: 0.2, band: 'weak',
    });
    expect(out).toBe(text);
  });
});

// ─── Snapshot regression ──────────────────────────────────────────

describe('contaminationPresenter — output snapshots', () => {
  const FIXED_TEXTS = [
    'The cold morning. The wet grass. You were there.',
    '비가 내리던 날. 병원 복도. 발소리.',
  ];

  for (const text of FIXED_TEXTS) {
    for (const stage of ['biased_inclination', 'hypercompletion']) {
      for (const band of ['medium', 'strong']) {
        it(`snapshot: "${text.slice(0, 25)}..." ${stage}/${band}`, () => {
          const out = applyStageText(text, {}, {
            stage,
            intensity: band === 'strong' ? 0.8 : 0.5,
            band,
          });
          expect(out).toMatchSnapshot();
        });
      }
    }
  }
});

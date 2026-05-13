/**
 * V2.1 V2-3 멀티턴 fingerprint 파이프라인 — vitest 회귀 가드.
 *
 * 검증:
 *   - initFingerprint 빈 슬롯 6 + _turnsRaw 빈 배열
 *   - mergeTurn 첫 턴 EMA α=1.0 (덮어쓰기), 둘째 턴부터 α 적용
 *   - 카테고리 슬롯 마지막 턴 우선 (unknown/none 은 무시)
 *   - motif_words 모든 턴 합집합
 *   - extractMotifWords 한글 2자+ / 영어 3자+
 *   - pickNextQuestion 빈 슬롯 우선순위 (modality > role > attribution > core_fear > fallback)
 *   - QUESTION_BANK ko/en 5 슬롯 모두 정의
 *   - CHIP_EMOTION_SEED 6 칩 모두 emotion_vec
 *   - TOTAL_TURNS 3
 */

import { describe, it, expect } from 'vitest';
import {
  EMOTION_KEYS,
  QUESTION_BANK,
  CHIP_EMOTION_SEED,
  TOTAL_TURNS,
  initFingerprint,
  mergeTurn,
  extractMotifWords,
  pickNextQuestion,
} from '../js/core/SeekerFingerprint.js';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

describe('상수', () => {
  it('EMOTION_KEYS 12개 (frozen)', () => {
    expect(EMOTION_KEYS.length).toBe(12);
    expect(Object.isFrozen(EMOTION_KEYS)).toBe(true);
    ['fear', 'sadness', 'anger', 'joy', 'longing', 'guilt',
     'shame', 'numbness', 'isolation', 'relief', 'confusion', 'emptiness']
      .forEach(k => expect(EMOTION_KEYS).toContain(k));
  });

  it('QUESTION_BANK ko/en 5 슬롯', () => {
    ['ko', 'en'].forEach(lang => {
      ['modality', 'role', 'attribution', 'core_fear', 'fallback'].forEach(slot => {
        expect(QUESTION_BANK[lang][slot]).toBeTruthy();
        expect(typeof QUESTION_BANK[lang][slot]).toBe('string');
      });
    });
  });

  it('CHIP_EMOTION_SEED 6 칩', () => {
    ['sadness', 'longing', 'anger', 'fear', 'guilt', 'joy']
      .forEach(chip => {
        expect(CHIP_EMOTION_SEED[chip]).toBeDefined();
        expect(typeof CHIP_EMOTION_SEED[chip]).toBe('object');
      });
  });

  it('TOTAL_TURNS = 3', () => {
    expect(TOTAL_TURNS).toBe(3);
  });
});

// ─────────────────────────────────────────────
// initFingerprint
// ─────────────────────────────────────────────

describe('initFingerprint', () => {
  it('빈 슬롯 6개 + _turnsRaw 빈 배열', () => {
    const fp = initFingerprint();
    expect(fp.emotion_vec).toEqual({});
    expect(fp.attribution).toBeNull();
    expect(fp.core_fear).toBeNull();
    expect(fp.modality).toBeNull();
    expect(fp.role).toBeNull();
    expect(fp.motif_words).toEqual([]);
    expect(fp._turnsRaw).toEqual([]);
  });

  it('두 인스턴스 독립', () => {
    const a = initFingerprint();
    const b = initFingerprint();
    a.emotion_vec.sadness = 0.5;
    expect(b.emotion_vec.sadness).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// mergeTurn — emotion_vec EMA
// ─────────────────────────────────────────────

describe('mergeTurn — emotion_vec', () => {
  it('첫 턴 (α 무시) → 그대로 박음', () => {
    const fp = initFingerprint();
    mergeTurn(fp, { base: { sadness: 0.8, longing: 0.6 }, _raw_text: '' }, 0.6);
    expect(fp.emotion_vec.sadness).toBeCloseTo(0.8, 3);
    expect(fp.emotion_vec.longing).toBeCloseTo(0.6, 3);
  });

  it('둘째 턴 EMA α=0.6 → new = 0.6*turn + 0.4*prev', () => {
    const fp = initFingerprint();
    fp._turnsRaw.push({ turn: 1, raw_text: 'x', ts: 't1' });
    fp.emotion_vec = { sadness: 0.8 };
    mergeTurn(fp, { base: { sadness: 0.4 }, _raw_text: 'y' }, 0.6);
    // 0.6*0.4 + 0.4*0.8 = 0.24 + 0.32 = 0.56
    expect(fp.emotion_vec.sadness).toBeCloseTo(0.56, 2);
  });

  it('0.05 이하면 슬롯 삭제', () => {
    const fp = initFingerprint();
    fp._turnsRaw.push({ turn: 1, raw_text: 'x', ts: 't1' });
    fp.emotion_vec = { sadness: 0.05 };
    mergeTurn(fp, { base: { sadness: 0.0 }, _raw_text: '' }, 0.6);
    expect(fp.emotion_vec.sadness).toBeUndefined();
  });

  it('base 빈 객체 → emotion_vec 그대로', () => {
    const fp = initFingerprint();
    fp.emotion_vec = { sadness: 0.7 };
    fp._turnsRaw.push({ turn: 1, raw_text: 'x', ts: 't1' });
    mergeTurn(fp, { base: {}, _raw_text: '' });
    // 첫 턴 아니라 EMA 적용 — sadness 0.6*0 + 0.4*0.7 = 0.28
    expect(fp.emotion_vec.sadness).toBeCloseTo(0.28, 2);
  });

  it('null fp 안전', () => {
    expect(() => mergeTurn(null, { base: { sadness: 1 } })).not.toThrow();
  });

  it('null turnResult 안전', () => {
    const fp = initFingerprint();
    expect(() => mergeTurn(fp, null)).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// mergeTurn — 카테고리 (마지막 턴 우선)
// ─────────────────────────────────────────────

describe('mergeTurn — 카테고리 슬롯', () => {
  it('attribution 마지막 턴 우선', () => {
    const fp = initFingerprint();
    mergeTurn(fp, { reason_analysis: { attribution: 'self_blame' }, _raw_text: '' });
    expect(fp.attribution).toBe('self_blame');
    fp._turnsRaw.push({});
    mergeTurn(fp, { reason_analysis: { attribution: 'other_blame' }, _raw_text: '' });
    expect(fp.attribution).toBe('other_blame');
  });

  it('attribution=unknown 은 무시', () => {
    const fp = initFingerprint();
    mergeTurn(fp, { reason_analysis: { attribution: 'self_blame' }, _raw_text: '' });
    fp._turnsRaw.push({});
    mergeTurn(fp, { reason_analysis: { attribution: 'unknown' }, _raw_text: '' });
    expect(fp.attribution).toBe('self_blame');  // 덮어쓰기 안 됨
  });

  it('core_fear=none 은 무시', () => {
    const fp = initFingerprint();
    mergeTurn(fp, { reason_analysis: { core_fear: 'abandonment' }, _raw_text: '' });
    fp._turnsRaw.push({});
    mergeTurn(fp, { reason_analysis: { core_fear: 'none' }, _raw_text: '' });
    expect(fp.core_fear).toBe('abandonment');
  });

  it('modality 마지막 턴 우선', () => {
    const fp = initFingerprint();
    mergeTurn(fp, { modality: 'visual', _raw_text: '' });
    fp._turnsRaw.push({});
    mergeTurn(fp, { modality: 'olfactory', _raw_text: '' });
    expect(fp.modality).toBe('olfactory');
  });

  it('role 마지막 턴 우선 + unknown 무시', () => {
    const fp = initFingerprint();
    mergeTurn(fp, { reason_analysis: { role: 'actor' }, _raw_text: '' });
    fp._turnsRaw.push({});
    mergeTurn(fp, { reason_analysis: { role: 'unknown' }, _raw_text: '' });
    expect(fp.role).toBe('actor');
  });
});

// ─────────────────────────────────────────────
// mergeTurn — motif_words
// ─────────────────────────────────────────────

describe('mergeTurn — motif_words', () => {
  it('모든 턴 텍스트 합집합', () => {
    const fp = initFingerprint();
    mergeTurn(fp, { _raw_text: '엄마가 보고 싶어' });
    fp._turnsRaw.push({});
    mergeTurn(fp, { _raw_text: '김치찌개 냄새가 났어' });
    expect(fp.motif_words).toEqual(expect.arrayContaining(['엄마가', '보고', '싶어', '김치찌개', '냄새가', '났어']));
  });

  it('중복 제거', () => {
    const fp = initFingerprint();
    mergeTurn(fp, { _raw_text: '엄마 엄마 엄마' });
    expect(fp.motif_words.filter(w => w === '엄마').length).toBe(1);
  });

  it('빈 텍스트 → 변경 없음', () => {
    const fp = initFingerprint();
    fp.motif_words = ['엄마'];
    mergeTurn(fp, { _raw_text: '' });
    expect(fp.motif_words).toEqual(['엄마']);
  });
});

// ─────────────────────────────────────────────
// extractMotifWords
// ─────────────────────────────────────────────

describe('extractMotifWords', () => {
  it('한글 2자+ 추출', () => {
    expect(extractMotifWords('엄마가 보고 싶어')).toEqual(expect.arrayContaining(['엄마가', '보고', '싶어']));
  });

  it('한글 1자 무시', () => {
    expect(extractMotifWords('가 나 다')).toEqual([]);
  });

  it('영어 3자+ 추출 + 소문자', () => {
    expect(extractMotifWords('I miss MOM and Dad')).toEqual(expect.arrayContaining(['miss', 'mom', 'and', 'dad']));
  });

  it('영어 2자 무시', () => {
    expect(extractMotifWords('I am OK')).toEqual([]);
  });

  it('빈 입력', () => {
    expect(extractMotifWords('')).toEqual([]);
    expect(extractMotifWords(null)).toEqual([]);
    expect(extractMotifWords(undefined)).toEqual([]);
  });

  it('숫자/특수문자 무시', () => {
    expect(extractMotifWords('123 !!! ???')).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// pickNextQuestion — 빈 슬롯 우선순위
// ─────────────────────────────────────────────

describe('pickNextQuestion', () => {
  it('우선순위 modality > role > attribution > core_fear > fallback', () => {
    const fp = initFingerprint();
    expect(pickNextQuestion(fp, 'ko')).toBe(QUESTION_BANK.ko.modality);

    fp.modality = 'visual';
    expect(pickNextQuestion(fp, 'ko')).toBe(QUESTION_BANK.ko.role);

    fp.role = 'actor';
    expect(pickNextQuestion(fp, 'ko')).toBe(QUESTION_BANK.ko.attribution);

    fp.attribution = 'self_blame';
    expect(pickNextQuestion(fp, 'ko')).toBe(QUESTION_BANK.ko.core_fear);

    fp.core_fear = 'abandonment';
    expect(pickNextQuestion(fp, 'ko')).toBe(QUESTION_BANK.ko.fallback);
  });

  it('lang 미지정 → en', () => {
    // pickNextQuestion 은 fp._askedSlots 를 mutate (한 번 물은 슬롯 skip — 무한 반복 방지).
    // 따라서 각 호출은 새 fp 로 — 같은 fp 재사용 시 두 번째 호출은 다음 슬롯(role)을 픽함.
    expect(pickNextQuestion(initFingerprint(), 'ja')).toBe(QUESTION_BANK.en.modality);
    expect(pickNextQuestion(initFingerprint(), undefined)).toBe(QUESTION_BANK.en.modality);
  });

  it('ko / en 분기 정확', () => {
    expect(pickNextQuestion(initFingerprint(), 'ko')).toBe(QUESTION_BANK.ko.modality);
    expect(pickNextQuestion(initFingerprint(), 'en')).toBe(QUESTION_BANK.en.modality);
    expect(QUESTION_BANK.ko.modality).not.toBe(QUESTION_BANK.en.modality);
  });
});

// ─────────────────────────────────────────────
// 통합 시나리오 — 미나 (3턴)
// ─────────────────────────────────────────────

describe('통합 — 미나 3턴 fingerprint', () => {
  it('칩 sadness → "엄마가 보고싶었어" (modality 미지정) → "냄새가 났어" → fp 응축', () => {
    const fp = initFingerprint();

    // 턴 1 — 칩 sadness
    fp._turnsRaw.push({ turn: 1, raw_text: '(chip:sadness)', ts: 't1' });
    mergeTurn(fp, { base: { sadness: 0.85 }, _raw_text: '' }, 1.0);
    expect(fp.emotion_vec.sadness).toBeCloseTo(0.85, 2);

    // 턴 2 — 자유텍스트 + LLM 결과 (가짜)
    fp._turnsRaw.push({ turn: 2, raw_text: '엄마가 보고싶었어', ts: 't2' });
    mergeTurn(fp, {
      base: { longing: 0.88, sadness: 0.72, guilt: 0.55 },
      reason_analysis: { attribution: 'self_blame', core_fear: 'abandonment', role: 'actor' },
      _raw_text: '엄마가 보고싶었어',
    }, 0.6);
    expect(fp.attribution).toBe('self_blame');
    expect(fp.core_fear).toBe('abandonment');
    expect(fp.role).toBe('actor');
    expect(fp.motif_words).toContain('엄마가');

    // 턴 3 — 감각 modality (sensory_analysis 결과 가정)
    fp._turnsRaw.push({ turn: 3, raw_text: '김치찌개 냄새가 났어', ts: 't3' });
    mergeTurn(fp, {
      base: { sadness: 0.50 },
      modality: 'olfactory',
      _raw_text: '김치찌개 냄새가 났어',
    }, 0.6);
    expect(fp.modality).toBe('olfactory');
    expect(fp.motif_words).toContain('김치찌개');

    // 빈 슬롯 없음 → fallback
    expect(pickNextQuestion(fp, 'ko')).toBe(QUESTION_BANK.ko.fallback);
  });
});

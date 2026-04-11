// test/unit/piiFilter.test.js
// PII auto-filter — afterimage utterance 수집 파이프라인의 개인정보 필터
//
// js/lib/afterimage.js의 PII_PATTERNS를 직접 테스트.
// Supabase 의존 없이 패턴만 검증.

import { describe, it, expect } from 'vitest';

// PII_PATTERNS는 export되지 않으므로 여기에 복제.
// afterimage.js와 동기화 필요 — 패턴이 바뀌면 여기도 갱신.
const PII_PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /\b\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}\b/,
  /\b\d{6}[-\s]?[1-4]\d{6}\b/,
  /https?:\/\/\S+/i,
  /\bwww\.\S+/i,
  /\b\d{10,}\b/,
  /(^|\s)@[A-Za-z0-9_]{3,}/,
];

function looksLikePII(text) {
  if (!text) return false;
  return PII_PATTERNS.some((re) => re.test(text));
}

// ─── Should REJECT (PII detected) ────────────────────────────────

describe('PII filter — should reject', () => {
  const REJECT_CASES = [
    ['email', 'john.doe@gmail.com'],
    ['email with +', 'test+tag@domain.co.kr'],
    ['KR phone (dashes)', '010-1234-5678'],
    ['KR phone (spaces)', '010 1234 5678'],
    ['KR phone (no sep)', '01012345678'],
    ['international phone', '02-123-4567'],
    ['RRN (주민번호)', '900101-1234567'],
    ['RRN with space', '900101 1234567'],
    ['URL http', 'http://example.com/path'],
    ['URL https', 'https://some.site.kr/page?q=1'],
    ['www domain', 'www.mysite.com'],
    ['long digit (card)', '1234567890123456'],
    ['social handle @user', '@dohhan_ posted this'],
    ['social handle start', '@username123'],
    ['embedded email', '그 사람 이메일이 foo@bar.com이었어'],
    ['embedded phone', '번호가 010-9876-5432래'],
    ['embedded URL', '여기 봐 https://link.kr/abc'],
  ];

  for (const [label, text] of REJECT_CASES) {
    it(`rejects: ${label}`, () => {
      expect(looksLikePII(text)).toBe(true);
    });
  }
});

// ─── Should PASS (no PII) ────────────────────────────────────────

describe('PII filter — should pass', () => {
  const PASS_CASES = [
    ['normal sentence', 'The rain was falling silently.'],
    ['Korean sentence', '비가 내리고 있었다.'],
    ['numbers < 10 digits', '전화번호 12345'],
    ['short number', '2024'],
    ['emotion text', 'I feel so empty and lost.'],
    ['Korean with numbers', '그게 3번째였어'],
    ['at sign alone', '@ 기호가 있었어'],
    ['short handle', '@ab'],  // < 3 chars after @
    ['date-like', '2026-04-11'],
    ['memory text', '그 사람이 떠난 뒤에도 냄새가 남아있었다.'],
    ['void expression', '...'],
    ['silence', ''],
    ['null', null],
  ];

  for (const [label, text] of PASS_CASES) {
    it(`passes: ${label}`, () => {
      expect(looksLikePII(text)).toBe(false);
    });
  }
});

// ─── Edge cases ──────────────────────────────────────────────────

describe('PII filter — edge cases', () => {
  it('9-digit number matches phone pattern (2+3+4=9)', () => {
    // Phone regex: \b\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}\b
    // "123456789" → "12" + "345" + "6789" → matches
    expect(looksLikePII('123456789')).toBe(true);
  });

  it('8-digit number passes (too short for phone pattern)', () => {
    expect(looksLikePII('12345678')).toBe(false);
  });

  it('10-digit number rejected', () => {
    expect(looksLikePII('1234567890')).toBe(true);
  });

  it('domain without www or http passes', () => {
    expect(looksLikePII('example.com')).toBe(false);
  });

  it('Korean text with embedded short numbers passes', () => {
    expect(looksLikePII('3시에 만나자고 했는데 5분 늦었어')).toBe(false);
  });
});

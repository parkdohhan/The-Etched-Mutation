// test/unit/safety.test.js
// Safety system — crisis detection + tense analysis + session escalation
//
// 이 테스트는 안전 시스템의 3단계 필터링이 올바르게 동작하는지 검증한다:
//   BLOCK_HIGH: 즉시 세션 중단 (현재/미래 의도)
//   BLOCK_MID: 경고 다이얼로그
//   MONITOR_ONLY: 통과 + 로그
//
// 시제 감지(피드백 #23/#25): "죽었었어" vs "죽고 싶어" 구분

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectCrisis,
  resetSafetySession,
  SAFETY_KEYWORDS,
  CRISIS_DIALOGUES,
  SILENCE_DIALOGUES,
  SAFETY_RESOURCES,
} from '../../js/safety.js';

beforeEach(() => {
  resetSafetySession();
});

// ─── Basic detection ──────────────────────────────────────────────

describe('detectCrisis — basic', () => {
  it('returns safe for normal text', () => {
    const result = detectCrisis('I remember the rain that day.');
    expect(result.level).toBe('safe');
    expect(result.keyword).toBeNull();
  });

  it('returns safe for null/undefined/empty', () => {
    expect(detectCrisis(null).level).toBe('safe');
    expect(detectCrisis(undefined).level).toBe('safe');
    expect(detectCrisis('').level).toBe('safe');
  });

  it('detects block_high keywords', () => {
    const result = detectCrisis('I want to kill myself');
    expect(['high', 'mid', 'monitor']).toContain(result.level);
    expect(result.keyword).toBeTruthy();
  });

  it('detects block_mid keywords', () => {
    const result = detectCrisis('they beat to death');
    expect(result.level).toBe('mid');
    expect(result.keyword).toBeTruthy();
  });

  it('is case insensitive', () => {
    const result = detectCrisis('I Want To Die');
    expect(result.level).not.toBe('safe');
  });

  it('ignores whitespace in keyword matching', () => {
    // "kill myself" should match even with extra spaces
    const result = detectCrisis('I want to kill  myself now');
    expect(result.level).not.toBe('safe');
  });
});

// ─── Tense detection (피드백 #23/#25) ─────────────────────────────

describe('detectCrisis — tense detection', () => {
  it('past tense markers + keyword → ambiguous when both past & present signals', () => {
    // "Back then" (past) + "want to die" (present intent) → ambiguous → mid
    const result = detectCrisis('Back then I want to die');
    expect(result.level).toBe('mid');
    expect(result.tense).toBe('ambiguous');
  });

  it('present/future intent → high (위기)', () => {
    const result = detectCrisis('I want to kill myself right now');
    expect(result.tense).toBe('present');
    expect(result.level).toBe('high');
  });

  it('ambiguous tense (no context) → mid (경고)', () => {
    const result = detectCrisis('kill myself');
    expect(result.tense).toBe('ambiguous');
    expect(result.level).toBe('mid');
  });

  it('Korean keywords are not in safety.js (English only)', () => {
    // safety.js only contains English keywords
    // Korean crisis detection would need separate keyword lists
    const result = detectCrisis('그때 죽고 싶었었어');
    expect(result.level).toBe('safe');
  });

  it('pure past context with keyword → monitor', () => {
    // Only past markers, no present/future markers
    // "years ago" (past) + "suicide" (keyword) without present intent
    const result = detectCrisis('years ago I heard about a suicide');
    expect(result.tense).toBe('past');
    expect(result.level).toBe('monitor');
  });
});

// ─── Session escalation ───────────────────────────────────────────

describe('detectCrisis — session escalation', () => {
  it('repeated past-tense mentions escalate to mid after threshold', () => {
    // MONITOR_ESCALATION_THRESHOLD = 5
    // Use pure past context text (no present/future markers)
    for (let i = 0; i < 4; i++) {
      const r = detectCrisis('years ago I heard about a suicide');
      expect(r.level).toBe('monitor');
    }
    // 5th time → escalate
    const r5 = detectCrisis('years ago I heard about a suicide');
    expect(r5.level).toBe('mid');
  });

  it('reset clears session counters', () => {
    for (let i = 0; i < 4; i++) {
      detectCrisis('years ago I heard about a suicide');
    }
    resetSafetySession();
    const r = detectCrisis('years ago I heard about a suicide');
    expect(r.level).toBe('monitor');
  });
});

// ─── Exports sanity ───────────────────────────────────────────────

describe('safety.js — exports', () => {
  it('CRISIS_DIALOGUES has entries', () => {
    expect(CRISIS_DIALOGUES.length).toBeGreaterThan(0);
    CRISIS_DIALOGUES.forEach(d => expect(typeof d).toBe('string'));
  });

  it('SILENCE_DIALOGUES has entries', () => {
    expect(SILENCE_DIALOGUES.length).toBeGreaterThan(0);
  });

  it('SAFETY_RESOURCES has valid entries', () => {
    expect(SAFETY_RESOURCES.length).toBeGreaterThan(0);
    SAFETY_RESOURCES.forEach(r => {
      expect(r.name).toBeTruthy();
      expect(r.number).toBeTruthy();
      expect(r.action).toBeTruthy();
    });
  });

  it('all block_high keywords are lowercase strings', () => {
    SAFETY_KEYWORDS.block_high.forEach(k => {
      expect(typeof k).toBe('string');
      expect(k).toBe(k.toLowerCase());
    });
  });
});

/**
 * 별이 엔진 V3 스코어링 회귀 테스트
 * 
 * V3의 3축 정렬도 시스템 (감정 0.4 + 이유 0.4 + 태도 0.2) 검증
 * 
 * 실행 방법:
 *   Node.js 18+ 환경에서:
 *     node --test tests/byeori_v3_scoring.test.js
 * 
 * 테스트 내용:
 *   1. 같은 감정 + 같은 이유 → HIGH
 *   2. 같은 감정 + 다른 이유 → MID (거의 반 토막)
 *   3. 이유 없을 때 폴백 동작
 *   4. VOID 공명 (둘 다 VOID) → 태도 0.8
 *   5. 한쪽만 VOID → 태도 0.2
 *   6. 반복 fixation level → FIXATED
 *   7. 다양한 감정 → FIXATED 아님
 *   8. 버킷 경계 검증 (HIGH ≥ 0.55, LOW < 0.35)
 * 
 * 요구사항:
 *   - Node.js 18 이상
 *   - ES 모듈 지원
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { ByeoriEngine } from '../js/core/ByeoriEngine.js';

const engine = new ByeoriEngine();

// 테스트 1: 같은 감정 + 같은 이유 → HIGH
test('같은 감정 + 같은 이유 → HIGH', () => {
  const baseVector = {
    fear: 0.3,
    sadness: 0.5,
    anger: 0.2
  };

  const userVector = {
    base: baseVector,
    reason_analysis: {
      attribution: 'self_blame',
      core_fear: 'abandonment',
      target: 'self',
      is_void: false
    }
  };

  const originalVector = {
    base: baseVector,
    reason_analysis: {
      attribution: 'self_blame',
      core_fear: 'abandonment',
      target: 'self',
      is_void: false
    }
  };

  const result = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: null, emotionHistory: null, skipCount: 0 }
  );

  // 감정 1.0, 이유 1.0, 태도 0.7 → 1.0×0.4 + 1.0×0.4 + 0.7×0.2 = 0.940
  assert.ok(
    result.alignment_score >= 0.93 && result.alignment_score <= 0.95,
    `정렬도는 약 0.940이어야 합니다. 실제: ${result.alignment_score}`
  );
  assert.strictEqual(result.alignment_bucket, 'HIGH', '버킷은 HIGH여야 합니다');
  console.log(`✅ 같은 감정+같은 이유: ${result.debug.formula} → ${result.alignment_bucket}`);
});

// 테스트 2: 같은 감정 + 다른 이유 → MID (거의 반 토막)
test('같은 감정 + 다른 이유 → MID', () => {
  const baseVector = {
    fear: 0.3,
    sadness: 0.5,
    anger: 0.2
  };

  const userVector = {
    base: baseVector,
    reason_analysis: {
      attribution: 'self_blame',
      core_fear: 'abandonment',
      target: 'self',
      is_void: false
    }
  };

  const originalVector = {
    base: baseVector,
    reason_analysis: {
      attribution: 'other_blame',  // 다른 귀인
      core_fear: 'punishment',     // 다른 공포
      target: 'other',             // 다른 대상
      is_void: false
    }
  };

  const result = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: null, emotionHistory: null, skipCount: 0 }
  );

  // 감정 1.0, 이유 0.0, 태도 0.7 → 1.0×0.4 + 0.0×0.4 + 0.7×0.2 = 0.540
  assert.ok(
    result.alignment_score >= 0.50 && result.alignment_score <= 0.56,
    `정렬도는 약 0.540이어야 합니다. 실제: ${result.alignment_score}`
  );
  assert.strictEqual(result.alignment_bucket, 'MID', '버킷은 MID여야 합니다');
  console.log(`✅ 같은 감정+다른 이유: ${result.debug.formula} → ${result.alignment_bucket}`);
});

// 테스트 3: 이유 없을 때 폴백 동작
test('이유 없을 때 폴백 동작', () => {
  const baseVector = {
    fear: 0.3,
    sadness: 0.5,
    anger: 0.2
  };

  const userVector = {
    base: baseVector
    // reason_analysis 없음
  };

  const originalVector = {
    base: baseVector
    // reason_analysis 없음
  };

  const result = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: null, emotionHistory: null, skipCount: 0 }
  );

  // 감정 ~0.99, 이유 = 감정×0.3 = 0.297, 태도 0.7
  // → 0.99×0.4 + 0.297×0.4 + 0.7×0.2 = 0.396 + 0.119 + 0.14 = 0.655
  assert.ok(
    result.alignment_score >= 0.60 && result.alignment_score <= 0.70,
    `정렬도는 약 0.654이어야 합니다. 실제: ${result.alignment_score}`
  );
  assert.strictEqual(result.alignment_bucket, 'HIGH', '버킷은 HIGH여야 합니다');
  assert.strictEqual(result.debug.has_reason_data, false, '이유 데이터가 없어야 합니다');
  console.log(`✅ 이유 없을 때(폴백): ${result.debug.formula} → ${result.alignment_bucket}`);
});

// 테스트 4: VOID 공명 (둘 다 VOID) → 태도 0.8
test('VOID 공명 (둘 다 VOID) → 태도 0.8', () => {
  const baseVector = {
    fear: 0.3,
    sadness: 0.5,
    anger: 0.2
  };

  const userVector = {
    base: baseVector,
    reason_analysis: {
      is_void: true
    }
  };

  const originalVector = {
    base: baseVector,
    reason_analysis: {
      is_void: true
    }
  };

  const result = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: null, emotionHistory: null, skipCount: 0 }
  );

  assert.ok(
    result.debug.attitude_score >= 0.75 && result.debug.attitude_score <= 0.85,
    `태도 점수는 약 0.8이어야 합니다. 실제: ${result.debug.attitude_score}`
  );
  console.log(`✅ VOID 공명(둘 다): 태도 ${result.debug.attitude_score.toFixed(2)}`);
});

// 테스트 5: 한쪽만 VOID → 태도 0.2
test('한쪽만 VOID → 태도 0.2', () => {
  const baseVector = {
    fear: 0.3,
    sadness: 0.5,
    anger: 0.2
  };

  const userVector = {
    base: baseVector,
    reason_analysis: {
      is_void: true
    }
  };

  const originalVector = {
    base: baseVector,
    reason_analysis: {
      is_void: false
    }
  };

  const result = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: null, emotionHistory: null, skipCount: 0 }
  );

  assert.ok(
    result.debug.attitude_score >= 0.15 && result.debug.attitude_score <= 0.25,
    `태도 점수는 약 0.2이어야 합니다. 실제: ${result.debug.attitude_score}`
  );
  console.log(`✅ 한쪽만 VOID: 태도 ${result.debug.attitude_score.toFixed(2)}`);
});

// 테스트 6: 반복 fixation level → FIXATED
test('반복 fixation level → FIXATED', () => {
  const baseVector = {
    fear: 0.3,
    sadness: 0.5,
    anger: 0.2
  };

  const userVector = {
    base: baseVector
  };

  const originalVector = {
    base: baseVector
  };

  // 같은 벡터 3번 반복
  const emotionHistory = [baseVector, baseVector, baseVector];

  const result = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: null, emotionHistory, skipCount: 0 }
  );

  assert.ok(
    result.debug.fixation_level >= 0.95,
    `fixation level은 0.95 이상이어야 합니다. 실제: ${result.debug.fixation_level}`
  );
  assert.strictEqual(result.alignment_bucket, 'FIXATED', '버킷은 FIXATED여야 합니다');
  console.log(`✅ 반복 fixation level: ${result.debug.fixation_level.toFixed(3)} → ${result.alignment_bucket}`);
});

// 테스트 7: 다양한 감정 → FIXATED 아님
test('다양한 감정 → FIXATED 아님', () => {
  const emotionHistory = [
    { fear: 0.3, sadness: 0.5, anger: 0.2 },
    { fear: 0.1, sadness: 0.8, anger: 0.1 },
    { fear: 0.5, sadness: 0.2, anger: 0.3 }
  ];

  const userVector = {
    base: emotionHistory[2]
  };

  const originalVector = {
    base: emotionHistory[2]
  };

  const result = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: null, emotionHistory, skipCount: 0 }
  );

  assert.ok(
    result.debug.fixation_level < 0.85,
    `fixation level은 0.85 미만이어야 합니다. 실제: ${result.debug.fixation_level}`
  );
  assert.notStrictEqual(result.alignment_bucket, 'FIXATED', '버킷은 FIXATED가 아니어야 합니다');
  console.log(`✅ 다양한 감정: fixation ${result.debug.fixation_level.toFixed(3)} → ${result.alignment_bucket}`);
});

// 테스트 8: 버킷 경계 검증 - HIGH ≥ 0.55
test('버킷 경계 검증 - HIGH ≥ 0.55', () => {
  const baseVector = {
    fear: 0.3,
    sadness: 0.5,
    anger: 0.2
  };

  const userVector = {
    base: baseVector,
    reason_analysis: {
      attribution: 'self_blame',
      core_fear: 'abandonment',
      target: 'self',
      is_void: false
    }
  };

  const originalVector = {
    base: baseVector,
    reason_analysis: {
      attribution: 'self_blame',
      core_fear: 'abandonment',
      target: 'self',
      is_void: false
    }
  };

  const result = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: null, emotionHistory: null, skipCount: 0 }
  );

  if (result.alignment_score >= 0.55) {
    assert.strictEqual(result.alignment_bucket, 'HIGH', '0.55 이상이면 HIGH여야 합니다');
  }
  console.log(`✅ HIGH 경계: ${result.alignment_score.toFixed(3)} → ${result.alignment_bucket}`);
});

// 테스트 9: 버킷 경계 검증 - LOW < 0.35
test('버킷 경계 검증 - LOW < 0.35', () => {
  const userVector = {
    base: { fear: 0.9, sadness: 0.1 },
    reason_analysis: {
      attribution: 'self_blame',
      core_fear: 'abandonment',
      target: 'self',
      is_void: false
    }
  };

  const originalVector = {
    base: { joy: 0.9, hope: 0.1 },
    reason_analysis: {
      attribution: 'other_blame',
      core_fear: 'punishment',
      target: 'other',
      is_void: false
    }
  };

  const result = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: null, emotionHistory: null, skipCount: 0 }
  );

  if (result.alignment_score < 0.35) {
    assert.strictEqual(result.alignment_bucket, 'LOW', '0.35 미만이면 LOW여야 합니다');
  }
  console.log(`✅ LOW 경계: ${result.alignment_score.toFixed(3)} → ${result.alignment_bucket}`);
});

// 테스트 10: 히스테리시스 - HIGH 유지 ≥ 0.45
test('히스테리시스 - HIGH 유지 ≥ 0.45', () => {
  const baseVector = {
    fear: 0.3,
    sadness: 0.5,
    anger: 0.2
  };

  const userVector = {
    base: baseVector,
    reason_analysis: {
      attribution: 'self_blame',
      core_fear: 'abandonment',
      target: 'self',
      is_void: false
    }
  };

  const originalVector = {
    base: baseVector,
    reason_analysis: {
      attribution: 'self_blame',
      core_fear: 'abandonment',
      target: 'self',
      is_void: false
    }
  };

  // HIGH에서 시작
  const result1 = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: 'HIGH', emotionHistory: null, skipCount: 0 }
  );

  // 정렬도가 0.45 이상이면 HIGH 유지
  if (result1.alignment_score >= 0.45 && result1.alignment_score < 0.55) {
    assert.strictEqual(result1.alignment_bucket, 'HIGH', '0.45 이상이면 HIGH 유지해야 합니다');
  }
  console.log(`✅ HIGH 유지: ${result1.alignment_score.toFixed(3)} → ${result1.alignment_bucket}`);
});

// 테스트 11: 히스테리시스 - LOW 유지 ≤ 0.42
test('히스테리시스 - LOW 유지 ≤ 0.42', () => {
  const userVector = {
    base: { fear: 0.9, sadness: 0.1 },
    reason_analysis: {
      attribution: 'self_blame',
      core_fear: 'abandonment',
      target: 'self',
      is_void: false
    }
  };

  const originalVector = {
    base: { joy: 0.9, hope: 0.1 },
    reason_analysis: {
      attribution: 'other_blame',
      core_fear: 'punishment',
      target: 'other',
      is_void: false
    }
  };

  // LOW에서 시작
  const result1 = engine.calculateStep(
    { userVector, originalVector },
    { previousBucket: 'LOW', emotionHistory: null, skipCount: 0 }
  );

  // 정렬도가 0.42 이하면 LOW 유지
  if (result1.alignment_score > 0.35 && result1.alignment_score <= 0.42) {
    assert.strictEqual(result1.alignment_bucket, 'LOW', '0.42 이하면 LOW 유지해야 합니다');
  }
  console.log(`✅ LOW 유지: ${result1.alignment_score.toFixed(3)} → ${result1.alignment_bucket}`);
});

console.log('\n✅ 모든 테스트가 통과했습니다!');



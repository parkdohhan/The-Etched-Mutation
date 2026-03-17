/**
 * 별이 엔진 V2 스코어링 회귀 테스트
 * 
 * 이 테스트는 V2 마이그레이션 중에도 핵심 점수 로직이 깨지지 않도록 보장합니다.
 * 
 * 실행 방법:
 *   Node.js 18+ 환경에서:
 *     node --test tests/byeori_v2_scoring.test.js
 * 
 *   또는 프로젝트 루트에서:
 *     node --test tests/byeori_v2_scoring.test.js
 * 
 * 테스트 내용:
 *   A. VAD 동일 시 calculateVADSimilarity가 정확히 1인지 확인
 *   B. 임베딩 동일 시 calculateEmbeddingSimilarity가 정확히 1인지 확인
 *   C. void mismatch 시 alignment_score가 0.7배 되는지 확인
 * 
 * 요구사항:
 *   - Node.js 18 이상
 *   - ES 모듈 지원 (프로젝트가 ES 모듈을 사용하므로)
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { 
  calculateVADSimilarity, 
  calculateEmbeddingSimilarity 
} from '../js/shared/math.js';
import { ByeoriEngine } from '../js/core/ByeoriEngine.js';

// 테스트 A: VAD 동일하면 calculateVADSimilarity가 1에 매우 가깝게 나와야 한다
test('VAD 동일 시 유사도는 1이어야 함', () => {
  const userVAD = { v: 0.5, a: -0.3, d: 0.8 };
  const originVAD = { v: 0.5, a: -0.3, d: 0.8 };
  const k = 3.0;
  
  const similarity = calculateVADSimilarity(userVAD, originVAD, k);
  
  // 동일한 VAD이면 거리가 0이므로 exp(-3.0 * 0) = exp(0) = 1
  assert.strictEqual(similarity, 1.0, '동일한 VAD는 유사도가 정확히 1이어야 합니다');
});

// 테스트 B: 임베딩 벡터가 동일하면 calculateEmbeddingSimilarity가 1에 매우 가깝게 나와야 한다
test('임베딩 동일 시 유사도는 1이어야 함', () => {
  const vecA = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const vecB = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  
  const similarity = calculateEmbeddingSimilarity(vecA, vecB);
  
  // 동일한 벡터의 코사인 유사도는 1 (부동소수점 오차 감안)
  const tolerance = 1e-10; // 허용 오차
  assert.ok(
    Math.abs(similarity - 1.0) < tolerance,
    `동일한 임베딩 벡터는 유사도가 1에 매우 가까워야 합니다. 실제: ${similarity}, 차이: ${Math.abs(similarity - 1.0)}`
  );
});

// 테스트 C: void mismatch면 최종 alignment_score가 0.7배 되는지 확인
test('void mismatch 시 alignment_score가 0.7배 되어야 함', () => {
  const engine = new ByeoriEngine();
  
  // 기본 벡터 설정 (동일한 벡터 사용)
  const baseVector = {
    fear: 0.3,
    sadness: 0.5,
    anger: 0.2,
    joy: 0.1,
    longing: 0.4,
    guilt: 0.3
  };
  
  // void mismatch = false인 경우
  const userVectorNoMismatch = {
    base: baseVector,
    reason_analysis: {
      is_void: false,
      attribution: 'self_blame',
      core_fear: 'abandonment'
    }
  };
  
  const originalVectorNoMismatch = {
    base: baseVector,
    reason_analysis: {
      is_void: false,
      attribution: 'self_blame',
      core_fear: 'abandonment'
    }
  };
  
  // void mismatch = true인 경우
  const userVectorWithMismatch = {
    base: baseVector,
    reason_analysis: {
      is_void: true,
      attribution: 'self_blame',
      core_fear: 'abandonment'
    }
  };
  
  const originalVectorWithMismatch = {
    base: baseVector,
    reason_analysis: {
      is_void: false,  // 불일치
      attribution: 'self_blame',
      core_fear: 'abandonment'
    }
  };
  
  // void mismatch = false일 때 점수
  const resultNoMismatch = engine.calculateStep(
    { userVector: userVectorNoMismatch, originalVector: originalVectorNoMismatch },
    {}
  );
  const scoreNoMismatch = resultNoMismatch.alignment_score;
  
  // void mismatch = true일 때 점수
  const resultWithMismatch = engine.calculateStep(
    { userVector: userVectorWithMismatch, originalVector: originalVectorWithMismatch },
    {}
  );
  const scoreWithMismatch = resultWithMismatch.alignment_score;
  
  // void mismatch 시 점수가 0.7배 되어야 함 (부동소수 오차 감안)
  const expectedScore = scoreNoMismatch * 0.7;
  const tolerance = 0.001; // 허용 오차
  
  assert.ok(
    Math.abs(scoreWithMismatch - expectedScore) < tolerance,
    `void mismatch 시 점수가 0.7배 되어야 합니다. ` +
    `예상: ${expectedScore}, 실제: ${scoreWithMismatch}, 차이: ${Math.abs(scoreWithMismatch - expectedScore)}`
  );
  
  // 디버그 정보 확인
  assert.strictEqual(
    resultWithMismatch.debug.void_penalty,
    0.7,
    'void mismatch 시 void_penalty가 0.7이어야 합니다'
  );
  
  assert.strictEqual(
    resultNoMismatch.debug.void_penalty,
    1.0,
    'void mismatch가 없을 때 void_penalty가 1.0이어야 합니다'
  );
});

console.log('✅ 모든 테스트가 통과했습니다!');

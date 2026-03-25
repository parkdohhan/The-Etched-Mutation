# 별이 엔진 V2 마이그레이션 가이드

## 1. V2 목표

V2 마이그레이션의 핵심 목표는 다음과 같습니다:

- **UX 안정성 향상**: 억울함(False Negative) 감소
- **점수 분포 튜닝 가능성 확보**: 분포를 먼저 관찰하고 조정할 수 있는 구조

기존 V1에서는 Appraisal/Reason이 점수에 직접 반영되어 불안정한 점수 분포를 보였습니다. V2에서는 점수 계산을 Embedding + VAD 중심으로 단순화하고, Appraisal은 narrative tag 분류에만 사용합니다.

## 2. 핵심 변경 공식

### VAD 유사도 계산

```
dist = sqrt((dv)² + (da)² + (dd)²)
maxDist = sqrt(12)  // VAD가 [-1, 1] 범위라고 가정
normalizedDist = clamp(dist / maxDist, 0, 1)
vad_score = exp(-k * normalizedDist)  // k = 3.0
```

- **변경 전**: 코사인 유사도 기반
- **변경 후**: 3D 유클리드 거리 + 정규화 + 지수 감쇠
- **효과**: 거리에 따른 부드러운 감쇠, 튜닝 가능한 k 값

### Embedding 유사도 계산

```
emb_score_raw = cosineSimilarity(vecA, vecB)  // 음수는 0으로 클램프
emb_score_adj = pow(emb_score_raw, EMB_EXPONENT)  // 기본 1.35
```

- **변경 전**: 코사인 유사도 그대로 사용
- **변경 후**: 지수 보정을 통한 비선형 변환
- **효과**: 높은 유사도를 더 강조, 분포 조정 가능

### 최종 점수 계산

```
rawScore = (emb_score_adj * 0.65) + (vad_score * 0.35)
voidPenalty = (void_mismatch) ? 0.7 : 1.0
finalScore = clamp(rawScore * voidPenalty, 0, 1)
```

- **가중치**: Embedding 65%, VAD 35%
- **Void Penalty**: VOID 불일치 시 0.7 배율 적용

## 3. Thresholds

### 버킷 임계값

- **HIGH**: `>= 0.76`
- **LOW**: `< 0.52`
- **MID**: `0.52 <= alignment < 0.76`

### 히스테리시스

버킷 전환 시 채터링 방지를 위한 히스테리시스 적용:

- **HIGH 유지 기준**: `>= 0.70` (HIGH에서 떨어질 때)
- **LOW 유지 기준**: `<= 0.58` (LOW에서 올라갈 때)

## 4. Appraisal 정책

### 점수 반영 제외

V2에서는 Appraisal/Reason이 **점수 계산에 반영되지 않습니다**.

- `attribution` (귀인 방향)
- `core_fear` (핵심 두려움)
- `is_void` (공백 여부)

이들은 점수에 영향을 주지 않고, 오직 **narrative tag 분류**에만 사용됩니다.

### Mismatch Type 우선순위

`mismatch_type` 판정 시 다음 우선순위를 따릅니다:

### 1. **void_mismatch** (최우선)
### 2. **attribution_mismatch** (attribution 존재할 때만)
### 3. **core_fear_mismatch** (core_fear 존재할 때만)
### 4. **emotion_mismatch** (fallback)

## 5. 파일별 변경 요약

### js/shared/math.js

### 신규 함수 추가

- `calculateVADSimilarity(userVAD, originVAD, k=3.0)`
  - 3D 유클리드 거리 기반 VAD 유사도 계산
  - 지수 감쇠 적용

- `calculateEmbeddingSimilarity(vecA, vecB)`
  - 코사인 유사도 계산 (임베딩 전용)
  - 음수는 0으로 클램프

### 기존 함수 변경

- `getBucket()`: 임계값 조정
  - HIGH: 0.55 → 0.76
  - LOW: 0.35 → 0.52
  - 히스테리시스 값도 조정

- `cosineSimilarity()`: deprecated 주석 추가 (하위 호환성 유지)

### js/core/ByeoriEngine.js

### Import 추가

```javascript
import {
  calculateVADSimilarity,
  calculateEmbeddingSimilarity
} from '../shared/math.js';
```

### 튜닝 상수 정의

```javascript
const EMB_WEIGHT = 0.65;
const VAD_WEIGHT = 0.35;
const EMB_EXPONENT = 1.35;  // 1.35~1.45로 튜닝 가능
const VAD_K = 3.0;
const VOID_PENALTY = 0.7;
```

### 함수 변경

- `_calculateComplexAlignment()` → `_calculateSimplerAlignment()` 교체
  - Appraisal/Reason 제외
  - Embedding + VAD 중심 계산
  - Void penalty 적용

- `_getMismatchType()`: 우선순위 조정
  - `target_displacement` → `core_fear_mismatch`로 변경
  - 점수에는 관여하지 않고 narrative tag 분류용으로만 사용

### Debug 정보 확장

```javascript
debug: {
  vad_score,
  emb_score_raw,
  emb_score_adj,
  void_penalty,
  weights: { emb: EMB_WEIGHT, vad: VAD_WEIGHT },
  exponent: EMB_EXPONENT,
  k: VAD_K
}
```

### js/services/AIService.js

### validateEmotionAnalysisResult() 변경

- `analysis.embedding` 검증 추가
  - 배열 타입 확인
  - 모든 원소가 number이고 NaN이 아닌지 확인
  - 길이가 10 미만이면 경고만 (실패 처리하지 않음)

- `analysis.reason_analysis` 선택사항으로 완화
  - 있으면 검증, 없으면 통과
  - 점수 계산에 사용되지 않으므로 필수가 아님

- 기존 필수 필드 유지
  - `analysis.base` (핵심 좌표)
  - `generatedEmotion`

## 6. 튜닝 가이드

### 원칙: "분포를 먼저 보고 조정"

튜닝 전에 반드시 다음을 확인하세요:

### 1. **점수 분포 히스토그램**: HIGH/MID/LOW 비율 확인
### 2. **False Negative 사례**: 억울하게 LOW로 분류된 케이스
### 3. **False Positive 사례**: 과도하게 HIGH로 분류된 케이스

### EMB_EXPONENT 조절 (1.35 ~ 1.45)

**목적**: Embedding 유사도의 비선형 보정 강도 조절

- **값이 클수록**: 높은 유사도를 더 강조 (분포가 오른쪽으로 치우침)
- **값이 작을수록**: 유사도 차이를 완화 (분포가 왼쪽으로 이동)

**조절 전략**:
- HIGH 비율이 너무 낮으면 → 값 증가 (1.35 → 1.40 → 1.45)
- HIGH 비율이 너무 높으면 → 값 감소

### HIGH/LOW 임계값 조절

**목적**: 버킷 분포 조정

- **HIGH 임계값 낮추기** (0.76 → 0.72): HIGH 비율 증가
- **HIGH 임계값 높이기** (0.76 → 0.80): HIGH 비율 감소
- **LOW 임계값 낮추기** (0.52 → 0.48): LOW 비율 감소
- **LOW 임계값 높이기** (0.52 → 0.56): LOW 비율 증가

**주의**: HIGH와 LOW 사이에 MID가 있어야 하므로, HIGH >= LOW + 0.2 이상 유지

### VAD_K 조절 (기본 3.0)

**목적**: VAD 거리에 따른 감쇠 강도 조절

- **값이 클수록**: 거리에 민감하게 반응 (가까울수록 높은 점수)
- **값이 작을수록**: 거리 차이를 완화

**조절 전략**:
- VAD 점수가 전반적으로 낮으면 → 값 감소 (3.0 → 2.5 → 2.0)
- VAD 점수가 전반적으로 높으면 → 값 증가 (3.0 → 3.5 → 4.0)

### 가중치 조절 (EMB_WEIGHT / VAD_WEIGHT)

**목적**: Embedding과 VAD의 상대적 중요도 조절

- **EMB_WEIGHT 증가** (0.65 → 0.70): Embedding에 더 의존
- **VAD_WEIGHT 증가** (0.35 → 0.40): VAD에 더 의존

**조절 전략**:
- Embedding 품질이 좋으면 → EMB_WEIGHT 증가
- Embedding이 불안정하면 → VAD_WEIGHT 증가

### Void Penalty 조절 (기본 0.7)

**목적**: VOID 불일치 시 페널티 강도 조절

- **값이 작을수록**: VOID 불일치 시 더 큰 페널티
- **값이 클수록**: VOID 불일치 시 완화된 페널티

**조절 전략**:
- VOID 불일치가 심각한 문제면 → 값 감소 (0.7 → 0.6 → 0.5)
- VOID 불일치가 덜 중요하면 → 값 증가 (0.7 → 0.8 → 0.9)

## 7. 마이그레이션 체크리스트

- [ ] `js/shared/math.js`에 `calculateVADSimilarity`, `calculateEmbeddingSimilarity` 추가 확인
- [ ] `js/core/ByeoriEngine.js`에서 `_calculateSimplerAlignment` 사용 확인
- [ ] `js/services/AIService.js`에서 `embedding` 검증 로직 확인
- [ ] 점수 분포 히스토그램 확인
- [ ] HIGH/MID/LOW 비율 확인
- [ ] False Negative/Positive 사례 확인
- [ ] 튜닝 상수 조정 (필요시)

## 8. 참고사항

- V2는 하위 호환성을 유지합니다. 기존 `cosineSimilarity` 함수는 deprecated이지만 여전히 동작합니다.
- `reason_analysis`가 없어도 정상 동작합니다 (점수 계산에 사용되지 않음).
- `embedding`이 없으면 VAD로 대체됩니다.
- 모든 튜닝 상수는 `ByeoriEngine.js` 파일 상단에 명시적으로 정의되어 있어 쉽게 조정 가능합니다.

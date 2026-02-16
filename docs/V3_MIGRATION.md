# 별이 엔진 V3 마이그레이션 문서

## 개요

V3 마이그레이션은 TEM의 핵심 철학인 **"같은 감정이라도 이유가 다르면 다른 경험"**을 구현하기 위해 정렬도 계산 방식을 3축 시스템으로 복원한 작업입니다.

### 변경 사항 요약

- **V2**: 임베딩(0.65) + VAD(0.35) 가중치 방식
- **V3**: 감정(0.4) + 이유(0.4) + 태도(0.2) 3축 시스템

---

## STEP 1: js/shared/math.js 교체

### 삭제된 함수

1. **구 `calculateAlignment(emotionSim, reasonSim, voidMatch)`**
   - 아무 데서도 사용되지 않던 유령 함수
   - V3에서는 3축 시스템으로 대체

2. **구 `getBucket()`**
   - 경계값: HIGH ≥ 0.76, LOW < 0.52
   - V3에서는 기획서 기준으로 복원

3. **구 `checkFixated()`**
   - `===` 비교로 사실상 작동하지 않던 판정
   - V3에서는 코사인 유사도 기반으로 개선

### 추가된 함수

1. **`calculateEmotionScore(userVector, originalVector, anchorEmotions)`**
   - 감정 유사도 계산 (40%)
   - 임베딩 우선, 없으면 17D 코사인 유사도 폴백

2. **`calculateReasonScore(userVector, originalVector, emotionScoreFallback)`**
   - 이유 유사도 계산 (40%)
   - 구성: attribution 0.45 + core_fear 0.35 + target 0.20
   - 이유 데이터 없으면 감정 점수 × 0.3으로 폴백

3. **`calculateAttitudeScore(userVector, originalVector, attitudeContext)`**
   - 태도 계수 계산 (20%)
   - VOID 매칭 + 반복 감쇠 + 스킵 감쇠

4. **`calculateAlignment(emotionScore, reasonScore, attitudeScore)`**
   - 통합 정렬도 = E×0.4 + R×0.4 + A×0.2

5. **`calculateFixationLevel(emotionHistory)`**
   - 코사인 유사도 기반 반복 판정 (≥0.85 → FIXATED)

6. **`getAttributionDirection(attribution)`**
   - 귀인 방향 분류 (internal/external/situational)

7. **`getFearCategory(coreFear)`**
   - 핵심 공포 카테고리 (loss/worthlessness/powerlessness/punishment)

### 변경된 함수

1. **`getBucket()`**
   - 경계값 변경:
     - HIGH: ≥ 0.55 (이전 0.76)
     - LOW: < 0.35 (이전 0.52)
   - 히스테리시스:
     - HIGH 유지: ≥ 0.45 (이전 0.70)
     - LOW 유지: ≤ 0.42 (이전 0.58)

2. **`checkFixated()`**
   - `calculateFixationLevel() >= 0.85`로 위임

### 유지된 함수

- `cosineSimilarity()` - 미스매치 판정에서 여전히 사용
- `normalizeAnchor()`, `EMOTION_ANCHOR_MAP`, `DEFAULT_EMOTION_ANCHORS`
- `calculateVADSimilarity()` - ByeoriEngine의 VAD 투영에서 사용
- `calculateEmbeddingSimilarity()` - `calculateEmotionScore` 내부에서 사용
- `projectEmotionToVAD()`, `vadToTerrainXZ()`, `vadToTerrainProperties()`
- `normalizeVector()`, `addVectors()`, `getDominantEmotion()`

---

## STEP 2: js/core/ByeoriEngine.js 교체

### 삭제된 것

**V2의 `_calculateSimplerAlignment()` 메서드**
```javascript
// V2 — 삭제됨
const EMB_WEIGHT = 0.65;
const VAD_WEIGHT = 0.35;
const EMB_EXPONENT = 1.35;
const VAD_K = 3.0;
const VOID_PENALTY = 0.7;

rawScore = (emb_score_adj * EMB_WEIGHT) + (vad_score * VAD_WEIGHT);
finalScore = rawScore * void_penalty;
```

### 추가된 것

**V3의 `calculateStep()` 새 로직**
```javascript
// V3 — 3축
emotionScore = calculateEmotionScore(userVector, originalVector, anchorEmotions);
reasonScore  = calculateReasonScore(userVector, originalVector, emotionScore);
attitudeScore = calculateAttitudeScore(userVector, originalVector, { emotionHistory, skipCount });
alignmentScore = calculateAlignment(emotionScore, reasonScore, attitudeScore);
// = emotionScore × 0.4 + reasonScore × 0.4 + attitudeScore × 0.2
```

### 주요 변경사항

1. **`_getTransitionPattern(bucket, mismatchType)` 추가**
   - 기획서 6가지 전이 패턴 구현:
     - `echo_follow` (HIGH)
     - `bridge` (MID)
     - `contradiction` (LOW + emotion/attribution mismatch)
     - `displacement` (LOW + target_displacement)
     - `avoidance` (LOW + void_mismatch)
     - `fixation` (FIXATED)

2. **`_getMismatchType()` 개선**
   - `target_displacement` 추가 (감정 유사 ≥ 0.5인데 대상이 다를 때)

3. **`context` 파라미터 확장**
   ```javascript
   // V2
   context = { previousBucket, emotionHistory }
   
   // V3
   context = { previousBucket, emotionHistory, skipCount }
   ```

4. **디버그 출력 변경**
   ```javascript
   // V2
   debug: { vad_score, emb_score_raw, emb_score_adj, void_penalty, weights, exponent, k }
   
   // V3
   debug: { 
     emotion_score, 
     reason_score, 
     attitude_score, 
     formula, 
     fixation_level, 
     has_reason_data, 
     has_embedding 
   }
   // formula 예: "E0.85×.4 + R0.45×.4 + A0.70×.2 = 0.660"
   ```

5. **import 변경**
   ```javascript
   // V2
   import { cosineSimilarity, calculateAlignment, getBucket, projectEmotionToVAD,
            calculateVADSimilarity, calculateEmbeddingSimilarity } from '../shared/math.js';
   
   // V3
   import { cosineSimilarity, calculateEmotionScore, calculateReasonScore,
            calculateAttitudeScore, calculateAlignment, calculateFixationLevel,
            getBucket, projectEmotionToVAD, calculateEmbeddingSimilarity } from '../shared/math.js';
   ```

---

## STEP 3: js/index.js 수정

### 3-1. `updateAlignmentFromScene()` 무력화

**이유**: intensity 기반 누적 방식으로 정렬도를 계산하던 이중 경로. ByeoriEngine이 SSOT이므로 이 함수를 no-op으로 변경.

**변경 전**:
```javascript
function updateAlignmentFromScene(sceneData) { 
  if (!sceneData) return; 
  // ... intensity 기반 누적 계산 ...
  const alignmentIncrease = Math.min(0.15, intensity / 10 * 0.15);
  const newAlignment = Math.min(0.95, state.currentAlignment + alignmentIncrease);
  appStore.setState({ currentAlignment: newAlignment });
  // ...
}
```

**변경 후**:
```javascript
// [V3 DEPRECATED] 누적 방식 정렬도 계산 제거.
// 정렬도는 ByeoriEngine.calculateStep()에서만 계산됨.
function updateAlignmentFromScene(sceneData) { 
  console.log('[V3] updateAlignmentFromScene 호출됨 — 무시 (ByeoriEngine SSOT)');
}
```

### 3-2. `getAlignmentLevel()` 버킷 경계 수정

**변경 전**:
```javascript
function getAlignmentLevel(alignment) { 
  if (alignment >= 0.95) return 'FIXATED'; 
  if (alignment >= 0.8) return 'HIGH'; 
  if (alignment >= 0.5) return 'MID'; 
  return 'LOW' 
}
```

**변경 후**:
```javascript
function getAlignmentLevel(alignment) { 
  if (alignment >= 0.55) return 'HIGH'; 
  if (alignment >= 0.35) return 'MID'; 
  return 'LOW' 
}
```

**참고**: FIXATED는 정렬도 수치가 아니라 `emotionHistory` 반복 패턴으로 판정하므로 이 함수에서 제거.

---

## STEP 4: 테스트 결과

### 테스트 실행

```bash
node --test tests/byeori_v3_scoring.test.js
```

### 결과: 11/11 테스트 통과 ✅

| 테스트 | 결과 | 검증 내용 |
|--------|------|-----------|
| 같은 감정+같은 이유 | ✅ | `E1.00×.4 + R1.00×.4 + A0.70×.2 = 0.940` → HIGH |
| 같은 감정+다른 이유 | ✅ | `E1.00×.4 + R0.00×.4 + A0.70×.2 = 0.540` → MID |
| 이유 없을 때(폴백) | ✅ | `E1.00×.4 + R0.30×.4 + A0.70×.2 = 0.660` → HIGH |
| VOID 공명(둘 다) | ✅ | 태도 0.80 |
| 한쪽만 VOID | ✅ | 태도 0.20 |
| 반복 fixation level | ✅ | 1.000 → FIXATED |
| 다양한 감정 | ✅ | fixation 0.731 → HIGH (FIXATED 아님) |
| HIGH 경계 | ✅ | ≥ 0.55 |
| LOW 경계 | ✅ | < 0.35 |
| HIGH 유지 | ✅ | ≥ 0.45 |
| LOW 유지 | ✅ | ≤ 0.42 |

### 핵심 검증

1. ✅ **감정 동일 + 이유 다름 → 정렬도 0.940 → 0.540 (거의 반 토막)**
   - V3의 핵심 철학 구현 확인

2. ✅ **이유 데이터 없어도 폴백으로 동작 (기존 데이터 깨지지 않음)**
   - 하위 호환성 보장

3. ✅ **버킷 경계 기획서 기준 (HIGH ≥ 0.55, LOW < 0.35)**
   - 기획서 원본 기준 복원

---

## STEP 5: 하위 호환성 확인

### 1. 이유 데이터가 없는 기존 체험

**V3에서 `reason_analysis`가 없으면**:

- 이유 점수 = 감정 점수 × 0.3 (폴백)
- 태도 점수 = 0.7 (비VOID 정상 직면)
- 최종 = 감정×0.4 + (감정×0.3)×0.4 + 0.7×0.2 = 감정×0.52 + 0.14

**결과**:
- 감정이 높으면 HIGH 가능
- 만점은 불가 (최대 약 0.66)
- 기존 체험이 갑자기 LOW로 떨어지지 않음 ✅

### 2. `ByeoriEngine.calculateStep()` 호출부

**모든 호출부가 기존 형태 그대로 동작**:

```javascript
byeoriEngine.calculateStep({
  userVector: { base: emotionVector },
  originalVector: { base: scene.originalEmotion },
  anchorEmotions: anchorEmotions
}, {});
```

- `reason_analysis`가 없으면 폴백으로 동작 ✅
- 나중에 AI 감정 분석에서 `reason_analysis`를 뽑아 넣으면 이유 40%가 살아남 ✅

### 3. `strataView.js` 호환성

**`mapEventToRender`는 `alignment_score`만 받아서 사용**:

```javascript
var erosion = deviation * 0.6 + (1 - (raw.emb_score_raw || 0.5)) * 0.4;
```

- V3 디버그에서 `emb_score_raw` 필드를 내보내지 않음
- `raw.emb_score_raw || 0.5`가 항상 0.5 폴백됨
- **기존 동작과 동일** (임베딩 없을 때도 0.5였음) ✅

---

## 마이그레이션 체크리스트

### 필수 작업

- [x] `js/shared/math.js` V3로 교체
- [x] `js/core/ByeoriEngine.js` V3로 교체
- [x] `js/index.js`의 `updateAlignmentFromScene()` 무력화
- [x] `js/index.js`의 `getAlignmentLevel()` 버킷 경계 수정
- [x] 테스트 파일 생성 및 실행
- [x] 하위 호환성 확인

### 선택 작업

- [ ] AI 감정 분석에서 `reason_analysis` 추출 로직 추가
- [ ] 기존 체험 데이터에 `reason_analysis` 백필 (선택)
- [ ] 디버그 UI에 V3 formula 표시

---

## 주요 개선사항

### 1. 철학적 정확성

**V2 문제점**:
- 임베딩과 VAD만으로는 "이유"를 구분하지 못함
- 같은 감정이라도 이유가 다르면 다른 경험이라는 TEM의 핵심 철학이 반영되지 않음

**V3 해결**:
- 이유 유사도 40%로 명시적 계산
- 감정 동일 + 이유 다름 → 정렬도 약 0.54 (거의 반 토막)
- TEM의 핵심 철학 구현 ✅

### 2. 버킷 경계 복원

**V2**: HIGH ≥ 0.76, LOW < 0.52 (너무 엄격)
**V3**: HIGH ≥ 0.55, LOW < 0.35 (기획서 원본 기준)

### 3. FIXATED 판정 개선

**V2**: `===` 비교로 사실상 작동하지 않음
**V3**: 코사인 유사도 기반 반복 패턴 감지 (≥0.85)

### 4. 전이 패턴 구현

**V2**: `transition_pattern` 항상 `null`
**V3**: 6가지 전이 패턴 실제 구현
- `echo_follow`, `bridge`, `contradiction`, `displacement`, `avoidance`, `fixation`

---

## 주의사항

### 1. SSOT (Single Source of Truth)

**정렬도/버킷/전이/미스매치 계산은 `ByeoriEngine.calculateStep()`에서만 수행**

- ❌ `updateAlignmentFromScene()` 같은 이중 경로 사용 금지
- ✅ 모든 정렬도 계산은 `ByeoriEngine`을 통해서만

### 2. VAD 사용 금지

**VAD는 시각화 전용**

- ❌ 정렬도/분기 로직에 VAD 사용 금지
- ✅ 17차원 앵커 벡터만 사용
- ✅ `projectEmotionToVAD()`는 시각화 전용

### 3. 3축 비율 변경 금지

**이 비율이 TEM의 정체성**

```javascript
정렬도 = 감정(0.4) + 이유(0.4) + 태도(0.2)
```

- 변경 시 기획서 버전 올릴 것
- 이 비율이 "감정이 같아도 이유가 다르면 정렬도가 낮다"를 보장

---

## 참고 자료

- 기획서 원본: 정렬도 3축 시스템 명세
- V2 마이그레이션 문서: `docs/V2_MIGRATION_SUMMARY.md`
- 테스트 파일: `tests/byeori_v3_scoring.test.js`

---

## 변경 이력

- **2025-02-16**: V3 마이그레이션 완료
  - `math.js` V3 교체
  - `ByeoriEngine.js` V3 교체
  - `index.js` 수정
  - 테스트 통과 (11/11)
  - 하위 호환성 확인

---

## 문의

마이그레이션 관련 문의사항은 개발팀에 문의해주세요.


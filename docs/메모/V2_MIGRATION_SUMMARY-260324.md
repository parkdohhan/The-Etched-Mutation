# V2 마이그레이션 및 개선 작업 요약

## 작업 기간
최종 커밋 이후 ~ 현재

## 주요 작업 내용

### 1. 오프닝 파동 효과 개선

### 호버 효과 위치 수정
- **문제**: 오프닝 파동 호버 시 일렁이는 효과가 커서 위치보다 오른쪽에 표시됨
- **해결**: `ctx.scale(2, 2)` 스케일링된 좌표계에 맞게 마우스 위치 계산 수정
- **파일**: `js/index.js` (startOpeningWaveAnimation 함수)

### 파동 진폭 및 불규칙성 개선
- 진폭을 더 넓고 불규칙하게 조정
- 다층 노이즈 시스템 추가 (3개의 서로 다른 주파수 노이즈 조합)
- 동적 진폭 추가 (시간에 따라 변하는 진폭)
- 파동 레이어 5개 → 6개로 증가
- **파일**: `js/index.js`, `css/index.css`

### 호버 효과 개선
- 호버 효과를 더 드라마틱하게 강화
- 영향력 반경 확대 (X: 350px → 600px, Y: 400px → 700px)
- 푸시 강도 증가 (0.6 → 2.8)
- 진폭 부스트 증가 (0.3 → 1.5)
- 파동이 벌어지는 효과로 변경 (좁혀지는 효과 제거)
- **파일**: `js/index.js`

### 위아래 잘림 방지
- 캔버스 높이 증가 (200px → 600px)
- 클램핑 패딩 증가 (2px → 높이의 20%, 최소 30px)
- 최대 진폭 조정 (0.35 → 0.6)
- overflow: visible 설정
- **파일**: `js/index.js`, `css/index.css`

### 파동 위치 조정
- 파동을 화면 가운데로 조정 (margin-top: -200px → -100px)
- **파일**: `css/index.css`

### UI 요소 제거
- "[ 시작하려면 키를 누르거나 클릭하세요 ]" 문구 삭제
- **파일**: `index.html`

### 2. 별이 엔진 V2 마이그레이션

### js/shared/math.js 리팩토링

**신규 함수 추가:**
- `calculateVADSimilarity(userVAD, originVAD, k=3.0)`
  - 3D 유클리드 거리 + 정규화 + 지수 감쇠 방식
  - VAD가 [-1, 1] 범위라고 가정하여 maxDist = sqrt(12) 사용
  - 입력 누락/NaN 방어 로직 포함

- `calculateEmbeddingSimilarity(vecA, vecB)`
  - 코사인 유사도 계산 (임베딩 전용)
  - 음수는 0으로 클램프
  - 길이 불일치/빈 벡터는 0 반환

**기존 함수 수정:**
- `getBucket()`: 임계값 조정
  - HIGH: 0.55 → 0.76
  - LOW: 0.35 → 0.52
  - MID: 0.52 <= alignment < 0.76
  - 히스테리시스 값도 조정 (HIGH 유지: 0.70, LOW 유지: 0.58)

- `cosineSimilarity()`: deprecated 주석 추가 (하위 호환성 유지)

### js/core/ByeoriEngine.js V2 마이그레이션

**Import 추가:**
- `calculateVADSimilarity`, `calculateEmbeddingSimilarity` 추가

**튜닝 상수 정의:**
```javascript
const EMB_WEIGHT = 0.65;
const VAD_WEIGHT = 0.35;
const EMB_EXPONENT = 1.35;  // 1.35~1.45로 튜닝 가능
const VAD_K = 3.0;
const VOID_PENALTY = 0.7;
```

**핵심 변경사항:**
- `_calculateComplexAlignment()` → `_calculateSimplerAlignment()` 교체
  - Appraisal/Reason을 점수에서 제외 (UX 안정성)
  - Embedding + VAD 중심 계산
  - Void penalty 적용
  - Embedding이 없으면 VAD로 대체

- `_getMismatchType()`: 우선순위 조정
  - `target_displacement` → `core_fear_mismatch`로 변경
  - 점수에는 관여하지 않고 narrative tag 분류용으로만 사용
  - 우선순위: void_mismatch → attribution_mismatch → core_fear_mismatch → emotion_mismatch

- Debug 정보 확장:
  - `vad_score`, `emb_score_raw`, `emb_score_adj`, `void_penalty`
  - `weights`, `exponent`, `k` 값 포함

**점수 계산 공식:**
```
emb_score_adj = pow(emb_score_raw, EMB_EXPONENT)
rawScore = (emb_score_adj * 0.65) + (vad_score * 0.35)
finalScore = clamp(rawScore * voidPenalty, 0, 1)
```

### js/services/AIService.js 검증 로직 개선

**validateEmotionAnalysisResult() 수정:**
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

### 3. 문서화

### ENGINE_V2_MIGRATION-260323.md 생성
- V2 목표 및 핵심 변경 공식 설명
- Thresholds 및 Appraisal 정책 설명
- 파일별 변경 요약
- 튜닝 가이드 ("분포를 먼저 보고 조정" 원칙)
- 마이그레이션 체크리스트
- **위치**: `docs/ENGINE_V2_MIGRATION-260323.md`

### 4. 테스트 추가

### byeori_v2_scoring.test.js 생성
- V2 마이그레이션 중에도 핵심 점수 로직이 깨지지 않도록 보장하는 회귀 테스트
- **테스트 3개:**
  1. VAD 동일 시 `calculateVADSimilarity`가 1인지 확인
  2. 임베딩 동일 시 `calculateEmbeddingSimilarity`가 1인지 확인 (부동소수점 오차 허용)
  3. void mismatch 시 `alignment_score`가 0.7배 되는지 확인

- Node.js 내장 `node:test` 모듈 사용 (추가 의존성 없음)
- **위치**: `tests/byeori_v2_scoring.test.js`
- **실행 방법**: `node --test tests/byeori_v2_scoring.test.js`

## 주요 개선 효과

### UX 안정성 향상
- Appraisal/Reason을 점수에서 제외하여 False Negative 감소
- Void mismatch penalty로 명확한 점수 차별화
- 버킷 임계값 조정으로 더 안정적인 분류

### 튜닝 가능성 확보
- 모든 튜닝 상수를 파일 상단에 명시적으로 정의
- EMB_EXPONENT, VAD_K, 가중치 등을 쉽게 조정 가능
- "분포를 먼저 보고 조정" 원칙으로 체계적인 튜닝 가능

### 코드 품질 개선
- 함수 분리 및 명확한 책임 분담
- 하위 호환성 유지 (deprecated 주석)
- 회귀 테스트로 안정성 보장
- 상세한 문서화

## 기술 스택
- JavaScript (ES Modules)
- Node.js 18+ (테스트용)
- 순수 함수 기반 아키텍처

## 다음 단계 (권장)
### 1. 실제 데이터로 점수 분포 히스토그램 확인
### 2. False Negative/Positive 사례 분석
### 3. 튜닝 상수 조정 (필요시)
### 4. 추가 회귀 테스트 케이스 확장

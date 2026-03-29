# Contamination MVP Spec v3

**기준 엔진:** 별이엔진 V4 (궤적 기반 정렬도)  
**문서 목적:** 3개월 내 구현 가능한 오염 체감 MVP 정의  
**작성일:** 2026-03-27  
**상태:** 구현용 확정 초안

---

## 0. 이 문서의 목적

이 문서는 **기억 오염을 체감시키기 위한 최소 제어층(MVP)** 을 정의한다.

이 문서의 목표는 다음이 아니다.

- 기억의 객관적 진실 상태를 측정하는 것
- 기억유전학 전체를 완전하게 구현하는 것
- 모든 Stage를 동시에 정교하게 렌더링하는 것

이 문서의 목표는 다음이다.

- 세션 종료 시, 기억 단위 contamination state를 갱신한다.
- 그 state를 프론트엔드가 바로 읽을 수 있는 형태로 제공한다.
- 사용자가 **"내 해석 때문에 기억이 틀어지거나 굳어진다"** 를 실제로 느끼게 만든다.

즉 이 모듈은 **진실 모델**이 아니라 **연출 제어 모델**이다.

---

## 1. MVP 범위

### MVP에서 반드시 포함할 것

- 기억(memory) 단위 contamination 누적
- 세션 종료 시 1회 contamination update
- `drift` 축
- `fixation` 축
- dominant stage 판정
- Stage 1 / Stage 3에 대한 프론트 반응
- 디버그용 마지막 엔진 출력 저장
- 최소 테스트 케이스

### MVP에서 제외할 것

- heterogeneity
- Welford 분산 추적
- Stage 1/2/3 혼합비
- recombination readiness
- 시간 감쇠 배치 재계산
- Stage 2 본격 구현
- 다중 stage 동시 렌더링

---

## 2. 아키텍처 위치

```text
별이엔진 V4
  → alignment, level, shape, shape_active,
    transition_pattern, mismatch_type, fixation_level 출력

Contamination Controller (이 문서)
  → V4 출력을 받아
  → memory 단위 contamination state 갱신
  → dominant stage 산출

프론트엔드 렌더러 (별도 문서)
  → contamination state를 받아
  → 텍스트, 시각, 사운드 반응 실행
```

원칙
- 별이엔진 V4는 변경하지 않는다.
- contamination은 V4 출력의 소비자다.
- contamination은 프론트엔드가 바로 읽을 수 있어야 한다.
- stage는 혼합비가 아니라 dominant stage 하나를 반환한다.

## 3. 입력: 별이엔진 V4 최종 출력

세션 종료 시점에 V4가 반환하는 최종값은 아래를 기준으로 한다.

```javascript
{
  alignment: 0.52,              // level × shape × void_mod
  level: 0.73,                  // scene_score 평균
  shape: 0.71,                  // delta 궤적 유사도
  shape_active: true,           // 장면 3개 이상이면 true
  transition_pattern: 'contradiction',
  mismatch_type: 'emotion_mismatch',
  fixation_level: 0.30          // 0~1
}
```

이 문서에서 사용하는 입력 필드
- alignment
- level
- shape
- shape_active
- transition_pattern
- mismatch_type
- fixation_level

그 외 필드는 contamination MVP에서 사용하지 않는다.

## 4. 저장 구조

MVP에서는 아래 필드만 저장한다.

```javascript
{
  memory_id: 'uuid',

  cont_depth: 0,                     // int: 해석 누적 수
  cont_drift: 0.0,                   // float 0~1: 원본에서 얼마나 틀어졌는가
  cont_fixation: 0.0,                // float 0~1: 특정 해석으로 얼마나 굳어졌는가
  cont_stage: 'stable',              // 'stable' | 'biased_inclination' | 'hypercompletion'

  cont_last_alignment: 0.0,          // debug / renderer reference
  cont_last_level: 0.0,
  cont_last_shape: 1.0,
  cont_last_pattern: 'bridge',
  cont_last_mismatch: 'none',

  cont_last_updated: null
}
```

## 5. DB 스키마

```sql
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS cont_depth integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS cont_drift real DEFAULT 0,
ADD COLUMN IF NOT EXISTS cont_fixation real DEFAULT 0,
ADD COLUMN IF NOT EXISTS cont_stage text DEFAULT 'stable',
ADD COLUMN IF NOT EXISTS cont_last_alignment real DEFAULT 0,
ADD COLUMN IF NOT EXISTS cont_last_level real DEFAULT 0,
ADD COLUMN IF NOT EXISTS cont_last_shape real DEFAULT 1,
ADD COLUMN IF NOT EXISTS cont_last_pattern text DEFAULT 'bridge',
ADD COLUMN IF NOT EXISTS cont_last_mismatch text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS cont_last_updated timestamptz;

CREATE INDEX IF NOT EXISTS idx_memories_cont_stage ON memories(cont_stage);
```

## 6. contamination 축 정의

### 6.1 cont_drift

정의:  
사용자의 해석이 원본 기억의 정서 궤적과 수준에서 얼마나 벗어났는가.

이 값은 주로 Stage 1: 편향적 기울어짐의 강도를 결정한다.

이 축이 높을수록 프론트엔드에서 다음이 강해진다.

- 텍스트의 의미 기울어짐
- 지형의 방향성 왜곡
- 사운드의 스펙트럼 편향

### 6.2 cont_fixation

정의:  
기억이 특정 해석 방향으로 얼마나 굳어졌는가.

이 값은 주로 Stage 3: 과잉 완결의 강도를 결정한다.

이 축이 높을수록 프론트엔드에서 다음이 강해진다.

- 텍스트의 과잉 확정
- 시각적 표면 고정
- 사운드 루프/잔향 고착

### 6.3 cont_stage

정의:  
현재 기억이 어떤 dominant contamination mode에 있는가.

허용값:

- stable
- biased_inclination
- hypercompletion

## 7. 상수 정의

```javascript
export const CONTAMINATION = {
  DECAY_RATE: 0.06,

  DRIFT_WEIGHTS: {
    LEVEL: 0.45,
    SHAPE: 0.35,
    MISMATCH: 0.20,
  },

  FIX_WEIGHTS: {
    FIXATION: 0.55,
    ALIGNMENT: 0.25,
    PATTERN: 0.20,
  },

  MISMATCH_BONUS: {
    emotion_mismatch: 1.0,
    attribution_mismatch: 0.7,
    target_displacement: 0.6,
    void_mismatch: 0.8,
    none: 0.0,
  },

  PATTERN_BONUS: {
    fixation: 1.0,
    echo_follow: 0.5,
    bridge: 0.2,
    contradiction: 0.0,
    displacement: 0.0,
    avoidance: 0.0,
  },

  STAGE_THRESHOLDS: {
    HYPERCOMPLETION_FIXATION: 0.65,
    BIASED_INCLINATION_DRIFT: 0.35,
  },
};
```

상수 설계 원칙
- 초기에 과도한 이론 정합성보다 체감 강도를 우선한다.
- threshold와 weight는 실데이터 플레이테스트 후 조정한다.
- MVP에서는 공식보다 반응 가독성이 더 중요하다.

## 8. 증분 공식

### 8.1 depth

세션 종료 시 1 증가.

```javascript
cont_depth += 1;
```

### 8.2 drift signal

기존 문서의 `(1 - shape) * (1 - level)`은 너무 보수적이므로 사용하지 않는다.

MVP에서는 다음 세 요소를 합산한다.

- level 차이
- shape 차이
- mismatch_type 보너스

```javascript
const effectiveShape = shape_active ? shape : 1.0;

const driftSignal =
  0.45 * (1 - level) +
  0.35 * (1 - effectiveShape) +
  0.20 * mismatchBonus;
```

해석
- level이 낮을수록 감정 강도/수준이 어긋난 것
- shape가 낮을수록 해석 궤적이 어긋난 것
- mismatchBonus는 "어긋남의 종류"를 서사적으로 반영

mismatchBonus 매핑

```javascript
const mismatchBonusMap = {
  emotion_mismatch: 1.0,
  attribution_mismatch: 0.7,
  target_displacement: 0.6,
  void_mismatch: 0.8,
  none: 0.0
};
```

### 8.3 fixation signal

MVP에서는 다음 세 요소를 합산한다.

- fixation_level
- alignment가 일정 수준 이상일 때의 보너스
- transition_pattern 보너스

```javascript
const fixSignal =
  0.55 * fixation_level +
  0.25 * normalizedAlignmentBonus +
  0.20 * patternBonus;
```

alignment bonus

```javascript
function normalizeAlignmentBonus(alignment) {
  if (alignment <= 0.55) return 0;
  return Math.min((alignment - 0.55) / 0.45, 1);
}
```

patternBonus 매핑

```javascript
const patternBonusMap = {
  fixation: 1.0,
  echo_follow: 0.5,
  bridge: 0.2,
  contradiction: 0.0,
  displacement: 0.0,
  avoidance: 0.0
};
```

해석
- fixation_level은 반복 고착의 직접 신호
- alignment bonus는 일관된 해석 누적 보조 신호
- patternBonus는 V4의 서사적 결과를 contamination 쪽에 반영

### 8.4 decay

해석 수가 늘수록 새 세션 하나가 기존 기억을 완전히 뒤집지 않도록 감쇠를 건다.

```javascript
const decay = 1 / (1 + cont_depth * DECAY_RATE);
```

### 8.5 누적

```javascript
cont_drift = clamp01(cont_drift + driftSignal * decay);
cont_fixation = clamp01(cont_fixation + fixSignal * decay);
```

## 9. dominant stage 판정

MVP에서는 Stage 혼합비를 계산하지 않는다.  
지배적 stage 하나만 판정한다.

```javascript
if (cont_fixation >= 0.65 && cont_fixation > cont_drift) {
  cont_stage = 'hypercompletion';
} else if (cont_drift >= 0.35) {
  cont_stage = 'biased_inclination';
} else {
  cont_stage = 'stable';
}
```

stage 의미

### stable

오염이 아직 약하다. 프론트 변화 최소.

### biased_inclination

기억이 특정 방향으로 기울고 있다.  
왜곡은 있지만 아직 완전히 고정되지는 않았다.

### hypercompletion

기억이 자기 해석을 과잉 확정하고 있다.  
빈칸을 스스로 메우고, 하나의 답으로 굳어지는 상태다.

## 10. 전체 업데이트 함수

```javascript
import { CONTAMINATION } from './constants.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function normalizeAlignmentBonus(alignment) {
  if (alignment <= 0.55) return 0;
  return Math.min((alignment - 0.55) / 0.45, 1);
}

export function createEmptyContaminationState() {
  return {
    cont_depth: 0,
    cont_drift: 0,
    cont_fixation: 0,
    cont_stage: 'stable',
    cont_last_alignment: 0,
    cont_last_level: 0,
    cont_last_shape: 1,
    cont_last_pattern: 'bridge',
    cont_last_mismatch: 'none',
    cont_last_updated: null,
  };
}

export function updateContamination(memory, engineOutput) {
  const next = { ...memory };

  const {
    alignment = 0,
    level = 0,
    shape = 1,
    shape_active = false,
    transition_pattern = 'bridge',
    mismatch_type = 'none',
    fixation_level = 0,
  } = engineOutput;

  next.cont_depth += 1;
  const n = next.cont_depth;
  const decay = 1 / (1 + n * CONTAMINATION.DECAY_RATE);

  const effectiveShape = shape_active ? shape : 1.0;

  const mismatchBonus =
    CONTAMINATION.MISMATCH_BONUS[mismatch_type] ?? 0;

  const patternBonus =
    CONTAMINATION.PATTERN_BONUS[transition_pattern] ?? 0;

  const driftSignal =
    CONTAMINATION.DRIFT_WEIGHTS.LEVEL * (1 - level) +
    CONTAMINATION.DRIFT_WEIGHTS.SHAPE * (1 - effectiveShape) +
    CONTAMINATION.DRIFT_WEIGHTS.MISMATCH * mismatchBonus;

  const fixSignal =
    CONTAMINATION.FIX_WEIGHTS.FIXATION * fixation_level +
    CONTAMINATION.FIX_WEIGHTS.ALIGNMENT * normalizeAlignmentBonus(alignment) +
    CONTAMINATION.FIX_WEIGHTS.PATTERN * patternBonus;

  next.cont_drift = clamp01(next.cont_drift + driftSignal * decay);
  next.cont_fixation = clamp01(next.cont_fixation + fixSignal * decay);

  const { HYPERCOMPLETION_FIXATION, BIASED_INCLINATION_DRIFT } =
    CONTAMINATION.STAGE_THRESHOLDS;

  if (
    next.cont_fixation >= HYPERCOMPLETION_FIXATION &&
    next.cont_fixation > next.cont_drift
  ) {
    next.cont_stage = 'hypercompletion';
  } else if (next.cont_drift >= BIASED_INCLINATION_DRIFT) {
    next.cont_stage = 'biased_inclination';
  } else {
    next.cont_stage = 'stable';
  }

  next.cont_last_alignment = alignment;
  next.cont_last_level = level;
  next.cont_last_shape = effectiveShape;
  next.cont_last_pattern = transition_pattern;
  next.cont_last_mismatch = mismatch_type;
  next.cont_last_updated = new Date().toISOString();

  return next;
}
```

## 11. 호출 시점

원칙

- 아카이브 세션 종료 시 1회만 호출한다.
- 장면 중간마다 contamination을 갱신하지 않는다.
- MVP에서는 튜닝 복잡도를 줄이기 위해 세션 종료 기준만 사용한다.

호출 흐름

```javascript
const updatedMemory = updateContamination(memory, finalEngineOutput);
await saveMemoryContamination(updatedMemory);
```

## 12. 프론트엔드 전달 규격

프론트엔드는 contamination 계산식을 직접 해석하지 않는다.  
`stage`, `drift`, `fixation`만 읽어 반응한다.

프론트가 필요한 값
- cont_stage
- cont_drift
- cont_fixation

선택적으로 디버그/보조용:
- cont_last_pattern
- cont_last_mismatch

## 13. Stage → 프론트 반응 규칙

이 문서에서는 최소 규칙만 정의한다.  
세부 구현은 별도 연출 문서에서 확정한다.

### 13.1 stable

텍스트
- 원문 거의 유지
- 변형 없음 또는 극미세 흔들림만 허용

시각
- 지형 안정
- surface noise 최소
- contour 변화 없음

사운드
- 기본 ambient
- 특별한 기울기 없음

사용자 체감
- 아직 오염이 강하지 않다

### 13.2 biased_inclination

텍스트
- 문장 전체를 갈아엎지 않는다
- 핵심 단어만 의미 방향을 한쪽으로 기울인다
- "애매한 진술"이 "조금 더 확정된 진술"로 변한다

예:
- "그는 떠났다"
- "그는 결국 떠났다"
- "그는 차갑게 떠났다"

시각
- 지형이 특정 방향으로 약하게 밀린다
- contour가 한쪽으로 기운다
- 핀 위치 자체는 유지한다

사운드
- spectral tilt
- 특정 대역 강조
- stereo imbalance 또는 미세한 어긋남

사용자 체감
- 기억이 틀어지고 있다

### 13.3 hypercompletion

텍스트
- 원문에 없던 과잉 확정 디테일이 추가된다
- 기억의 빈칸을 멋대로 채운다
- "가능성"을 "이미 정해진 사실"처럼 밀어붙인다

예:
- "그는 문 앞에 서 있었다"
- "그는 이미 결심한 사람처럼 문 앞에 서 있었다"

시각
- 표면 패턴이 반복 고정된다
- 유동성이 줄어든다
- 파형/표면이 자기 루프에 갇힌 것처럼 보인다

사운드
- loop lock
- 잔향 또는 짧은 모티프 반복
- 반복성이 점차 고착됨

사용자 체감
- 기억이 스스로 답을 정해버렸다

## 14. 디버그 규격

개발 중 debug overlay 또는 admin panel에 아래를 반드시 표시한다.

- cont_depth
- cont_drift
- cont_fixation
- cont_stage
- cont_last_alignment
- cont_last_level
- cont_last_shape
- cont_last_pattern
- cont_last_mismatch
- cont_last_updated

목적
- threshold 튜닝
- stage 전이 확인
- 체감이 약한 원인 추적
- 세션별 contamination 누적 검증

## 15. 최소 테스트 케이스

MVP에서는 아래 4개를 필수 테스트로 둔다.

### 15.1 LOW mismatch 반복 → biased_inclination

조건:
- 낮은 alignment
- 낮은 level
- 낮은 shape
- emotion mismatch

기대:
- cont_drift 상승
- cont_stage === 'biased_inclination'

### 15.2 fixation 반복 → hypercompletion

조건:
- 높은 fixation_level
- 높은 alignment
- transition_pattern = fixation

기대:
- cont_fixation 상승
- cont_stage === 'hypercompletion'

### 15.3 shape inactive early session

조건:
- shape_active = false

기대:
- effectiveShape = 1.0
- shape 축이 drift를 과도하게 밀지 않음

### 15.4 clamp 보장

조건:
- 극단 입력 반복

기대:
- cont_drift <= 1
- cont_fixation <= 1

## 16. MVP 이후로 미루는 항목

아래는 MVP 이후 확장용이다.

- heterogeneity
- Welford variance tracking
- Stage 2 (해석 병기)
- Stage 혼합 렌더링
- recombination readiness
- 장기 시간 감쇠
- batch recomputation
- contamination genealogy / memory genetics full extension

이 항목들은 vNext 문서로 분리한다.

## 17. 구현 우선순위

1단계
- DB 필드 추가
- ContaminationController 구현
- 테스트 작성

2단계
- 세션 종료 시 update 연결
- debug overlay 연결

3단계
- Stage 1 텍스트 반응 구현
- Stage 3 텍스트 반응 구현

4단계
- Stage 1 시각 반응 구현
- Stage 3 시각 반응 구현

5단계
- Stage 1 사운드 반응 구현
- Stage 3 사운드 반응 구현

6단계
- threshold 튜닝
- 플레이테스트

## 18. 최종 원칙

이 MVP의 성공 기준은 다음이다.

사용자가 플레이 후  
"내 해석 때문에 기억이 살짝 틀어졌구나"  
또는  
"이 기억이 한 방향으로 굳어버렸구나"  
를 별도 설명 없이 감각적으로 느낄 수 있어야 한다.

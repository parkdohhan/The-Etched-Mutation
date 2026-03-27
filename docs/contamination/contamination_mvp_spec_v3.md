# Contamination MVP Spec v3

**기준 엔진:** 별이엔진 V4 (궤적 기반 정렬도)  
**문서 목적:** 3개월 내 구현 가능한 contamination 계산/저장 MVP  
**작성일:** 2026-03-27  
**상태:** 구현용 확정 초안

---

## 0) 목적과 원칙

- contamination은 **진실 모델**이 아니라 **연출 제어 모델**이다.
- 이 문서는 "어떻게 계산하고 저장하는가"만 다룬다.
- 별이엔진 V4는 변경하지 않는다.
- contamination은 V4 출력의 소비자이며 세션 종료 시 1회 갱신한다.

---

## 1) MVP 범위

### 포함

- 기억(`memory`) 단위 contamination 누적
- 세션 종료 시 1회 업데이트
- `cont_drift`, `cont_fixation`, `cont_stage` 계산
- contamination DB 저장
- 디버그용 마지막 엔진 출력 저장
- 최소 테스트 케이스

### 제외

- heterogeneity
- Welford 분산 추적
- Stage 2 본격 구현
- Stage 혼합 렌더링
- recombination readiness
- 장기 배치 재계산
- genealogy/memory genetics 확장

---

## 2) 입력 필드 (V4 최종 출력)

세션 종료 시 아래 필드만 사용한다.

```javascript
{
  alignment: 0.52,
  level: 0.73,
  shape: 0.71,
  shape_active: true,
  transition_pattern: 'contradiction',
  mismatch_type: 'emotion_mismatch',
  fixation_level: 0.30
}
```

---

## 3) contamination 저장 필드

```javascript
{
  memory_id: 'uuid',

  cont_depth: 0,                     // int
  cont_drift: 0.0,                   // 0~1
  cont_fixation: 0.0,                // 0~1
  cont_stage: 'stable',              // stable | biased_inclination | hypercompletion

  cont_last_alignment: 0.0,
  cont_last_level: 0.0,
  cont_last_shape: 1.0,
  cont_last_pattern: 'bridge',
  cont_last_mismatch: 'none',

  cont_last_updated: null
}
```

---

## 4) DB 스키마

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

---

## 5) 상수 정의

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

---

## 6) 공식

### depth

```javascript
cont_depth += 1;
```

### drift

```javascript
const effectiveShape = shape_active ? shape : 1.0;

const driftSignal =
  0.45 * (1 - level) +
  0.35 * (1 - effectiveShape) +
  0.20 * mismatchBonus;
```

### fixation

```javascript
const fixSignal =
  0.55 * fixation_level +
  0.25 * normalizedAlignmentBonus +
  0.20 * patternBonus;
```

```javascript
function normalizeAlignmentBonus(alignment) {
  if (alignment <= 0.55) return 0;
  return Math.min((alignment - 0.55) / 0.45, 1);
}
```

### decay + 누적

```javascript
const decay = 1 / (1 + cont_depth * DECAY_RATE);
cont_drift = clamp01(cont_drift + driftSignal * decay);
cont_fixation = clamp01(cont_fixation + fixSignal * decay);
```

### dominant stage 판정

```javascript
if (cont_fixation >= 0.65 && cont_fixation > cont_drift) {
  cont_stage = 'hypercompletion';
} else if (cont_drift >= 0.35) {
  cont_stage = 'biased_inclination';
} else {
  cont_stage = 'stable';
}
```

---

## 7) 전체 업데이트 함수

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
  const mismatchBonus = CONTAMINATION.MISMATCH_BONUS[mismatch_type] ?? 0;
  const patternBonus = CONTAMINATION.PATTERN_BONUS[transition_pattern] ?? 0;

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

---

## 8) 호출 시점

- 아카이브 세션 종료 시 1회 호출한다.
- 장면 중간 업데이트는 하지 않는다.

```javascript
const updatedMemory = updateContamination(memory, finalEngineOutput);
await saveMemoryContamination(updatedMemory);
```

---

## 9) 프론트엔드 전달 최소 상태값

- `cont_stage`
- `cont_drift`
- `cont_fixation`

선택(디버그/보조):
- `cont_last_pattern`
- `cont_last_mismatch`

---

## 10) 디버그 규격

아래 필드를 overlay 또는 admin에서 표시한다.

- `cont_depth`
- `cont_drift`
- `cont_fixation`
- `cont_stage`
- `cont_last_alignment`
- `cont_last_level`
- `cont_last_shape`
- `cont_last_pattern`
- `cont_last_mismatch`
- `cont_last_updated`

---

## 11) 최소 테스트 케이스

1. **LOW mismatch 반복 -> biased_inclination**
   - 조건: 낮은 `alignment/level/shape`, `mismatch_type='emotion_mismatch'`
   - 기대: `cont_drift` 상승, `cont_stage==='biased_inclination'`

2. **fixation 반복 -> hypercompletion**
   - 조건: 높은 `fixation_level`, 높은 `alignment`, `transition_pattern='fixation'`
   - 기대: `cont_fixation` 상승, `cont_stage==='hypercompletion'`

3. **shape inactive early session**
   - 조건: `shape_active=false`
   - 기대: `effectiveShape===1.0`, shape 항이 drift를 밀지 않음

4. **clamp 보장**
   - 조건: 극단 입력 반복
   - 기대: `cont_drift<=1`, `cont_fixation<=1`

5. **초기 mismatch 드리프트 검증 (추가)**
   - 조건: `shape_active=false`, `mismatch_type='emotion_mismatch'`
   - 기대: mismatch 항만으로 drift가 증가하는 현재 동작을 확인하고, 임계치 조정 필요 여부를 판단

---

## 12) 구현 우선순위

1. DB 필드 추가
2. Contamination Controller 구현
3. 테스트 작성
4. 세션 종료 update 연결
5. debug overlay 연결
6. threshold 튜닝 및 플레이테스트

---

## 13) 현재 이슈/결정 메모 (MVP 범위)

- **초기 drift 상승:** `shape_active=false`에서도 mismatch 항은 작동한다. 초기 1~2장면에서 stable 구간이 짧아질 수 있으므로 테스트로 확인 후 가중치/임계치 조정.
- **Stage 뒤집힘 가능성:** drift/fixation이 모두 높은 구간에서 세션별 stage 전환이 잦을 수 있다. MVP는 단일 dominant를 유지하고, 히스테리시스는 vNext 검토 항목으로 둔다.

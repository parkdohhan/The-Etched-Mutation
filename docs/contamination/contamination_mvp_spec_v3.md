# Contamination MVP Spec v3.1

**기준 엔진:** 별이엔진 V4 (궤적 기반 정렬도)
**문서 목적:** contamination 계산/저장/체감 MVP
**작성일:** 2026-03-27
**수정일:** 2026-03-29
**상태:** 계산 구현 완료, 체감 레이어 설계 확정

---

## 0) 목적과 원칙

- contamination은 **진실 모델**이 아니라 **연출 제어 모델**이다.
- 별이엔진 V4는 변경하지 않는다. contamination은 V4 출력의 소비자이다.
- 세션 종료 시 1회 갱신한다.
- **오염의 존재는 시스템이 설명하지 않는다. 기억 자신이 의심한다.**

---

## 1) MVP 범위

### 포함

- 기억(`memory`) 단위 contamination 누적
- EMA(지수이동평균) 기반 세션 갱신 + lifetime 카운터
- `cont_drift`, `cont_fixation`, `cont_stage` 계산
- contamination DB 저장
- 디버그용 마지막 엔진 출력 저장
- 텍스트 오염 효과 (client-side fallback)
- **지형 탐험 + 기억의 독백** (체감 전달 메커니즘)
- 최소 테스트 케이스

### 제외

- heterogeneity / Welford 분산 추적
- Stage 2 본격 구현
- Stage 혼합 렌더링
- recombination readiness
- 장기 배치 재계산
- 앵커 기반 시맨틱 변이 (anchor-based semantic mutation)
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

### 이중 상태 구조

세션 레벨(EMA)과 lifetime 카운터를 분리한다.

- **세션 EMA**: stage 판정 + 렌더링에 사용. 최근 ~7세션이 지배적.
- **Lifetime 카운터**: strata/archive/history에 사용. 절대 리셋하지 않음.

```javascript
{
  memory_id: 'uuid',

  // Session-level (EMA) — stage 판정 + 렌더링
  cont_drift: 0.0,                   // 0~1
  cont_fixation: 0.0,                // 0~1
  cont_stage: 'stable',              // stable | biased_inclination | hypercompletion

  // Lifetime — strata/archive/history
  cont_depth: 0,                     // int: 총 해석 수
  lifetime_drift_sum: 0.0,           // 누적 drift 신호 합
  lifetime_fix_sum: 0.0,             // 누적 fixation 신호 합

  // 마지막 엔진 출력 (debug/admin)
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
ADD COLUMN IF NOT EXISTS lifetime_drift_sum real DEFAULT 0,
ADD COLUMN IF NOT EXISTS lifetime_fix_sum real DEFAULT 0,
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
  // EMA smoothing factor
  // α = 0.10 → half-life ≈ 6.6 sessions
  // 최근 ~7세션이 축 값을 지배
  EMA_ALPHA: 0.10,

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

### drift signal

```javascript
const effectiveShape = shape_active ? shape : 1.0;

const driftSignal =
  0.45 * (1 - level) +
  0.35 * (1 - effectiveShape) +
  0.20 * mismatchBonus;
```

### fixation signal

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

### EMA 누적 (v3.1 변경: cumulative + decay → EMA)

v3 원본은 `cont_drift + driftSignal * decay` 방식이었으나, 포화 문제 발생.
EMA로 전환: 최근 세션이 지배적이되 포화하지 않음.

```javascript
const α = 0.10;

// 축 = α × 신호 + (1 - α) × 축_이전
cont_drift    = clamp01(α * driftSignal   + (1 - α) * cont_drift);
cont_fixation = clamp01(α * fixSignal     + (1 - α) * cont_fixation);

// Lifetime (별도, 절대 리셋 안 함)
lifetime_drift_sum += driftSignal;
lifetime_fix_sum   += fixSignal;
```

**왜 EMA인가:**
- cumulative 누적은 해석 횟수가 늘수록 양축 모두 1.0에 수렴 → stage 의미 없어짐
- EMA는 half-life (~6.6 세션) 후 과거 영향이 절반으로 줄어듦 → 포화 방지
- 기억의 최근 경험이 현재 상태를 지배 — 이것이 체감적으로도 맞음
- lifetime 합계는 별도 보존 → strata depth 표현에 사용

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

## 7) 구현 파일

| 파일 | 역할 | 상태 |
|------|------|------|
| `js/core/ContaminationTracker.js` | 계산 모듈 (EMA, dual state, replay) | ✅ 완료 |
| `play-test.html` | 파이프라인 연결 (로드 시 replay, 봉인 시 update) | ✅ 완료 |
| `js/contamination.js` | Stage 3 글리치 효과 (admin용) | 기존 유지 |

### 주요 export

```javascript
createEmptyState()                    // 초기 상태 생성
updateContamination(state, output)    // 세션 종료 시 EMA 갱신
replayFromPlays(plays)                // 역사적 플레이 배치 리플레이
getPresentationState(state)           // { stage, intensity, band }
getDominantMismatch(plays)            // 지배적 mismatch 방향
```

---

## 8) 호출 시점

- 메모리 로드 시: `replayFromPlays()`로 전체 플레이 이력 리플레이 → stage/band 결정
- 세션 종료(봉인) 시: `updateContamination()`으로 현재 세션 V4 출력 반영
- 장면 중간 업데이트는 하지 않는다.

```javascript
// 로드 시
game.contState = replayFromPlays(allPlays);
game.contPresentation = getPresentationState(game.contState);

// 봉인 시
game.contState = updateContamination(game.contState, sessionEngineOutput);
```

---

## 9) 체감 전달: 지형 탐험 + 기억의 독백

### 왜 "원문 대비"가 아닌가

원문 대비는 **시스템이 사용자에게 설명하는** 구조다.

> "보세요, 이게 원본이고 이게 오염된 거예요."

이것은 전시 캡션이다. TEM의 체험이 아니라 TEM의 해설.

지형 탐험 + 기억의 독백은 근본적으로 다르다:

- **기억이 자기 자신에게 말하는 거다.** 시스템이 아니라.
- **사용자가 발견하는 거다.** 보여주는 게 아니라.
- "내가 그렇게 화가 나있었나?" — 이건 기억 자체가 자기 오염을 의심하는 순간이다.
- 이것이 기억유전학의 **과잉 수선(5)**과 정확히 맞는다. 기억이 자기를 복원하려고 하는데, 그 복원 시도 자체가 새로운 왜곡을 만드는 것.

### SoniScope → TEM 매핑

| SoniScope | TEM |
|-----------|-----|
| 산점도 위의 렌즈 | 3D strata 위에서 사용자의 탐색 위치 |
| 보이는 축 (x, y) | 지형의 공간 좌표 (감정 공간) |
| 숨겨진 3번째 차원 | 그 지점에 퇴적된 오염의 결 |
| 소리 높낮이 | 오염 강도/방향의 사운드 매핑 |

### 사용자 이동 시 레이어

| 채널 | 반응 |
|------|------|
| **귀** | 오염 강도가 사운드 텍스처로 — drift 강한 구역은 톤이 기울고, fixation 높은 구역은 모티프가 반복 |
| **눈** | 지형 표면에 오염 흔적 — 색감 변화, 표면 질감 차이 |
| **텍스트** | 특정 구역 진입 시 기억의 독백이 떠오름 |

### 기억의 독백 — 오염 방향별

독백은 "Another Me"의 톤과 같은 결이다. 시스템 메시지가 아니라 기억의 내면 독백.

**분노 편향 구역** (drift + emotion_mismatch: anger)
> "내가 그렇게 원래 화가 나있었나? 아니었던 거 같아..."

**슬픔 수렴 구역** (fixation + echo_follow)
> "이렇게까지 슬펐었나. 아니, 이건 내 슬픔이 아닌 것 같기도..."

**과잉완결 구역** (hypercompletion)
> "이건 너무 선명해. 기억이 이렇게 깔끔할 리가 없어."

**공허 구역** (void_mismatch)
> "여기엔 뭔가 있었는데... 지금은 비어 있다."

### 체감 흐름 (첫 방문자 기준)

1. **씬 플레이**: 텍스트를 읽음 (오염된 텍스트인 줄 모름)
2. **감정 입력**: 자기 해석을 남김
3. **봉인 후 strata 진입**: 지형을 탐험함
4. **특정 구역에서**: "내가 그렇게 화가 나있었나?" — 기억이 말함
5. **그 순간**: "아, 내가 읽은 게 원래 그대로가 아니었구나"

비교를 보여주지 않아도, **기억 자신의 의심**이 오염의 존재를 알려준다.
처음 온 사람도 한 세션 안에서 체감할 수 있다.

### 기술 요소

| 컴포넌트 | 상태 | 위치 |
|----------|------|------|
| 3D strata 지형 | 구현됨 | `strataSection.js`, `tem_af_strata_terrain.js` |
| 사운드스케이프 | 구현됨 | `play-test.html` SFX/soundscape |
| 커서/터치 위치 추적 | 구현됨 | `game.cursorPos`, `cursorTarget` |
| 오염 벡터 (drift/fixation) | 구현됨 | `ContaminationTracker.js` |
| 감정 공간 좌표 | 구현됨 | `emotionToMapCoords`, VAD 좌표 |
| 오염 데이터→지형 좌표 매핑 | **미구현** | 씬별 감정 위치 + 플레이 데이터 |
| 커서 위치→오염 핫스팟 감지 | **미구현** | 근접 판정 + 트리거 |
| 사운드 텍스처 변화 | **미구현** | drift/fixation→주파수/반복 매핑 |
| 독백 풀 | **미구현** | 오염 방향별 × 강도별 텍스트 |

이미 있는 strata 탐험 단계("Explore the terrain")에 레이어 하나를 얹는 구조다.
지금 그 단계는 지형을 보여주기만 하고 끝인데, 거기에 **오염의 청진기**를 넣는 것.

---

## 10) 프론트엔드 전달 최소 상태값

- `cont_stage`
- `cont_drift`
- `cont_fixation`

선택(디버그/보조):
- `cont_depth`
- `cont_last_pattern`
- `cont_last_mismatch`
- `lifetime_drift_sum`
- `lifetime_fix_sum`

---

## 11) 텍스트 오염 효과 (client-side fallback)

Presentation Spec v1의 규칙을 따르되, 앵커 기반 시맨틱 변이가 구현되기 전까지 client-side fallback을 사용한다.

| stage | 효과 | 체감 |
|-------|------|------|
| stable | 원문 유지 | "아직 오염이 강하지 않다" |
| biased_inclination | 방향성 침식 — 단어 끝부터 `·`로 녹음 (한국어: 조사/어미 우선) | "기억이 한 방향으로 틀어지고 있다" |
| hypercompletion | 단어 에코(반복) + 블록문자 글리치 | "기억이 스스로 답을 확정하고 있다" |

강도별 확률: weak 4%, medium 10%, strong 18% (단어 단위 적용).

Seeded PRNG 사용 — 동일 텍스트 + 동일 stage/band → 동일 결과 (QA 결정론 요구사항).

---

## 12) 디버그 규격

아래 필드를 overlay 또는 admin에서 표시한다.

- `cont_depth`
- `cont_drift`
- `cont_fixation`
- `cont_stage`
- `lifetime_drift_sum`
- `lifetime_fix_sum`
- `cont_last_alignment`
- `cont_last_level`
- `cont_last_shape`
- `cont_last_pattern`
- `cont_last_mismatch`
- `cont_last_updated`

---

## 13) 최소 테스트 케이스

1. **LOW mismatch 반복 → biased_inclination**
   - 조건: 낮은 `alignment/level/shape`, `mismatch_type='emotion_mismatch'`
   - 기대: `cont_drift` 상승, `cont_stage==='biased_inclination'`

2. **fixation 반복 → hypercompletion**
   - 조건: 높은 `fixation_level`, 높은 `alignment`, `transition_pattern='fixation'`
   - 기대: `cont_fixation` 상승, `cont_stage==='hypercompletion'`

3. **shape inactive early session**
   - 조건: `shape_active=false`
   - 기대: `effectiveShape===1.0`, shape 항이 drift를 밀지 않음

4. **clamp 보장**
   - 조건: 극단 입력 반복
   - 기대: `cont_drift<=1`, `cont_fixation<=1`

5. **EMA 포화 방지**
   - 조건: 동일 drift 신호 100회 반복
   - 기대: `cont_drift`가 신호값에 수렴하되 1.0에 도달하지 않음 (cumulative와 다름)

6. **초기 mismatch 드리프트 검증**
   - 조건: `shape_active=false`, `mismatch_type='emotion_mismatch'`
   - 기대: mismatch 항만으로 drift가 증가하는 현재 동작 확인

---

## 14) 구현 우선순위

1. ~~DB 필드 추가~~ → 스키마 준비됨, 마이그레이션 대기
2. ~~Contamination Controller 구현~~ → `ContaminationTracker.js` 완료
3. ~~세션 종료 update 연결~~ → 봉인 핸들러에 연결 완료
4. ~~텍스트 오염 효과~~ → client-side fallback 완료
5. **DB 마이그레이션 실행** → Supabase에 컬럼 추가
6. **봉인 시 DB 저장** → contState를 memories 테이블에 persist
7. **지형 탐험 + 독백 레이어** → strata에 오염 청진기 + 독백 트리거
8. debug overlay 연결
9. threshold 튜닝 및 플레이테스트
10. 앵커 기반 시맨틱 변이

---

## 15) 현재 이슈/결정 메모

- **EMA α 값 (0.10):** half-life ≈ 6.6세션. 체감이 너무 느리면 α를 올리고, 너무 빠르면 내린다. 실데이터로 튜닝.
- **Stage 뒤집힘 가능성:** drift/fixation이 모두 높은 구간에서 세션별 stage 전환이 잦을 수 있다. MVP는 단일 dominant를 유지하고, 히스테리시스는 vNext 검토.
- **독백 풀 크기:** 오염 방향(4) × 강도(3) = 12개 최소. 시작은 작게, 체감 확인 후 확장.
- **사운드 매핑 범위:** 기존 SFX 인프라 위에 얹을 수 있는지 확인 필요. Web Audio API 파라메트릭 조절이면 충분.

---

*별이엔진 V4 기반. 기억유전학 v0.3 연동. 연출 제어 모델.*
*v3 원본: 2026-03-27. v3.1 수정: 2026-03-29 (EMA 전환, dual state, 지형 탐험 체감 설계 추가).*

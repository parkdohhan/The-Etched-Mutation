# SceneNavigator + ContaminationTracker + Record 통합 설계 v1

**작성일:** 2026-03-29
**상태:** 설계 확정, 구현 대기
**기준 엔진:** 별이엔진 V4
**기준 이론:** 기억유전학 v0.3
**기준 오염 모델:** 오염벡터 계산 구현 명세 v2

---

## 0. 이 문서의 범위

이 문서는 세 가지 모듈의 설계를 다룬다:

1. **SceneNavigator** — Play 중 다음 접근 가능 씬을 결정하는 감정 공간 탐색 엔진
2. **ContaminationTracker** — 오염벡터 v2를 SceneNavigator 출력과 연결하는 추적기
3. **Record 통합** — Record 플로우에서 동일 엔진 로직을 AI 질문 리듬에 적용하는 구조

이 세 모듈은 별이엔진 V4를 **변경하지 않고** 그 출력을 소비한다.

---

## 1. SceneNavigator

### 1.1 존재 이유

현재 main path의 씬 진행은 `currentScene + 1` (단순 선형)이다.
demo path는 하드코딩된 `SCENE_TRANSITION_MAP`으로 분기한다.

둘 다 문제가 있다:
- 선형: 엔진의 transition_pattern 출력을 완전히 무시
- 하드코딩: 특정 기억에만 적용 가능, 범용성 없음

SceneNavigator는 **감정 공간(VAD) 위의 실시간 반경 계산**으로 이 문제를 해결한다.
모든 기억에 범용 적용 가능하고, 엔진 출력이 직접 경로를 결정한다.

### 1.2 핵심 설계 결정: Pattern이 기하를 바꾼다

**위험한 설계 (기각됨):**
```
center = average(userEmotion, originalEmotion)  // 항상 같은 방식
radius = RADIUS_MAP[pattern]                     // pattern은 숫자 하나로 축소
```

이 구조에서 transition_pattern은 "반경 값 테이블"로 퇴화한다.
echo_follow(0.42)와 contradiction(0.36)의 차이가 단지 0.06 — 의미가 사라진다.

**채택된 설계:**
```
center = blend(originalEmotion, userEmotion, patternConfig[pattern])
radius = patternConfig[pattern].radius
candidates = rankByPattern(accessibleScenes, pattern, context)
```

center 자체가 pattern에 따라 이동하고, 후보 씬의 랭킹 로직도 pattern별로 다르다.

### 1.3 Pattern별 Center Shift + Radius

```javascript
const PATTERN_CONFIG = {
  echo_follow: {
    // 화자의 감정 쪽으로 가중 → 원본 근처에서 자연스럽게 이동
    blendWeight: { original: 0.7, user: 0.3 },
    radius: 0.42,
    rankBy: 'proximity_to_original'  // 원본 감정에 가까운 씬 우선
  },
  bridge: {
    // 균등 → 넓게 열린 중립 탐색
    blendWeight: { original: 0.5, user: 0.5 },
    radius: 0.62,
    rankBy: 'unvisited_first'  // 미방문 씬 우선
  },
  contradiction: {
    // 사용자 감정의 반대 방향 → 현재 감정과 먼 곳으로 튕김
    blendWeight: { original: 0.3, user: -0.5 },  // user를 반전 가중
    // 실제 계산: center = 0.3 * original + 0.5 * invert(user) + 0.2 * neutral
    radius: 0.36,
    rankBy: 'emotional_contrast'  // 현재 감정과 가장 다른 씬 우선
  },
  displacement: {
    // 감정 유지, 대상/귀인 축으로 이동
    blendWeight: { original: 0.4, user: 0.6 },
    radius: 0.48,
    rankBy: 'attribution_shift'  // 같은 감정이지만 다른 attribution을 가진 씬 우선
  },
  avoidance: {
    // void/neutral 영역으로 밀림
    blendWeight: { original: 0.2, user: 0.2, neutral: 0.6 },
    radius: 0.24,
    rankBy: 'low_intensity'  // 감정 강도가 낮은 씬 우선
  },
  fixation: {
    // 현재 씬 좌표에 거의 고정
    blendWeight: { original: 0.1, user: 0.0, current: 0.9 },
    radius: 0.09,
    rankBy: 'nearest'  // 가장 가까운 것만
  }
};
```

### 1.4 Center 계산 수식

```javascript
function calculateCenter(originalEmotion, userEmotion, currentSceneEmotion, pattern) {
  const config = PATTERN_CONFIG[pattern];
  const w = config.blendWeight;

  if (pattern === 'contradiction') {
    // 사용자 감정을 VAD 공간에서 반전
    const invertedUser = invertVAD(userEmotion);
    return blendVectors([
      { vec: originalEmotion, weight: w.original },
      { vec: invertedUser, weight: Math.abs(w.user) },
      { vec: NEUTRAL_POINT, weight: 1 - w.original - Math.abs(w.user) }
    ]);
  }

  if (pattern === 'avoidance') {
    return blendVectors([
      { vec: originalEmotion, weight: w.original },
      { vec: userEmotion, weight: w.user },
      { vec: NEUTRAL_POINT, weight: w.neutral }
    ]);
  }

  if (pattern === 'fixation') {
    return blendVectors([
      { vec: originalEmotion, weight: w.original },
      { vec: currentSceneEmotion, weight: w.current }
    ]);
  }

  // echo_follow, bridge, displacement
  return blendVectors([
    { vec: originalEmotion, weight: w.original },
    { vec: userEmotion, weight: w.user }
  ]);
}
```

### 1.5 접근 가능 씬 결정

```javascript
function getAccessibleScenes(scenes, center, radius, visitedScenes, pattern) {
  const config = PATTERN_CONFIG[pattern];

  // 1. 반경 내 씬 필터
  let candidates = scenes.filter(s =>
    vadDistance(s.original_emotion, center) <= radius
    && s.id !== currentSceneId
  );

  // 2. pattern별 랭킹
  candidates = rankCandidates(candidates, config.rankBy, {
    originalEmotion: currentScene.original_emotion,
    userEmotion: currentUserEmotion,
    visitedScenes
  });

  // 3. 최소 1개 보장 (폴백)
  if (candidates.length === 0) {
    candidates = [getNearestUnvisited(scenes, center, visitedScenes)];
    candidates[0]._isFallback = true;  // 내러티브 프레이밍 트리거
  }

  return candidates;
}
```

### 1.6 폴백 규칙

accessible이 0개일 때 가장 가까운 미방문 씬을 강제 개방하되, **조용히 열지 않는다.**

프론트엔드는 `_isFallback === true`를 감지하면 내러티브 메시지를 표시:
- "기억의 빈틈이 다른 장면을 끌어당긴다."
- "가장 가까운 잔향이 떠오른다."
- "어딘가에서 소리가 들린다."

이 메시지는 규칙 위반이 아니라 기억 시스템의 보정처럼 체감되어야 한다.

### 1.7 씬 ≤ 3개: B 폴백

씬이 3개 이하인 기억에서는 반경 계산이 의미를 잃는다 (거의 모든 씬이 반경 안에 들어감).

이 경우:
- 반경 계산 대신 **감정 거리 순 정렬**로 전체 개방
- 단, 방문 순서에 따라 delta 궤적은 여전히 추적
- pattern은 여전히 AI/오염 피드에 사용

### 1.8 Fixation 감지: 복합 신호

**단순 count 기반 (기각됨):**
```
fixationCounts[sceneId] >= 2 → FIXATED  // 너무 기계적, 부당할 수 있음
```

**채택: pattern persistence 기반:**
```javascript
function detectFixation(context) {
  const {
    recentEmotions,      // 최근 3회 감정 벡터
    recentAttributions,  // 최근 3회 attribution
    accessibleCount,     // 접근 가능했던 씬 수
    actualMoves,         // 실제 이동한 씬 수 (다른 씬으로)
    fixationCounts       // 보조: 같은 씬 방문 횟수
  } = context;

  let score = 0;

  // 1. 최근 감정 유사도 (주 신호)
  if (recentEmotions.length >= 3) {
    const pairwiseSim = avgPairwiseCosineSim(recentEmotions);
    if (pairwiseSim > 0.85) score += 0.4;
    else if (pairwiseSim > 0.7) score += 0.2;
  }

  // 2. attribution 반복 (보조 신호)
  if (recentAttributions.length >= 2) {
    const allSame = recentAttributions.every(a => a === recentAttributions[0]);
    if (allSame) score += 0.2;
  }

  // 3. 탐색 회피율 (보조 신호)
  if (accessibleCount > 1 && actualMoves > 0) {
    const explorationRatio = new Set(actualMoves).size / accessibleCount;
    if (explorationRatio < 0.3) score += 0.2;
  }

  // 4. 동일 씬 재방문 (보조 가중)
  const maxRevisit = Math.max(...Object.values(fixationCounts));
  if (maxRevisit >= 2) score += 0.15;
  if (maxRevisit >= 3) score += 0.15;

  return {
    isFixated: score >= 0.6,
    score,
    // 갇힘 엔딩 트리거: fixation 점수 높고 + 충분한 방문 횟수
    forceEnding: score >= 0.8 && Object.values(fixationCounts).reduce((a, b) => a + b, 0) >= 5
  };
}
```

fixation은 "패턴의 지속"이지, "숫자의 도달"이 아니다.

### 1.9 종료 조건

| 조건 | 결과 |
|------|------|
| 모든 씬 방문 완료 | 정상 엔딩 |
| fixation.forceEnding === true | 갇힘 엔딩 |
| 엔딩 타입 씬(sceneType === 'ending') 도달 | 해당 엔딩 |
| 방문 횟수 >= 씬 수 × 2 | 안전장치 엔딩 (무한루프 방지) |

### 1.10 플레이어 UI: 안개 속 국소 구조

**하지 않는 것:**
- 전체 감정 공간 맵 노출
- 모든 씬 위치 표시
- 반경 원 시각화
- 접근 불가 씬의 흐린 표시

**하는 것:**
- 현재 위치에서 접근 가능한 씬들만 "떠오르는 문장 조각"으로 등장
- 각 조각은 감정 색조(emotion → RGB 매핑)를 띰
- 거리감은 문장의 선명도/크기로 표현 (가까울수록 또렷)
- 선택 시 자연스러운 전환 (fog transition)
- 폴백 씬은 특별한 시각 처리 (잔향 효과)

"우주 지도"가 아니라 "안개 속에서 가까운 장면들이 떠오르는 감각"

---

## 2. ContaminationTracker 연결

### 2.1 기존 오염벡터 v2와의 관계

오염벡터 v2 (`docs/오염벡터_계산_구현_명세_v2-260327.md`)의 `updateContaminationVector()` 함수는 이미 축별 계산을 수행한다:
- `cont_divergence`: (1-shape) × (1-level) × decay
- `cont_convergence`: alignment × weight (fixation/HIGH/MID 조건별) × decay
- `cont_heterogeneity`: Welford 온라인 분산

이 함수는 **변경 없이 그대로 사용**한다.

### 2.2 SceneNavigator가 추가로 제공하는 데이터

오염벡터 v2는 세션 단위 최종 엔진 출력만 소비한다.
SceneNavigator는 **씬 단위 히스토리**를 추가로 생성한다:

```javascript
// 매 씬 완료 시 SceneNavigator가 sceneHistory에 push
{
  sceneId: 'uuid',
  sceneIndex: 2,
  engineResult: { alignment, level, shape, transition_pattern, mismatch_type, fixation_level },
  accessibleCount: 4,        // 이 시점에 접근 가능했던 씬 수
  wasFallback: false,        // 폴백 개방 여부
  centerUsed: { v, a, d },   // 실제 사용된 center 좌표
  radiusUsed: 0.42,
  fixationScore: 0.15,       // 복합 fixation 점수
  timestamp: ISO
}
```

이 히스토리는:
- **Admin 대시보드**: 씬별 접근 통계, 오염 기여 추적
- **Strata 시각화**: 지형 이펙트 매핑 (terrain effect type)
- **세션 리플레이**: 어떤 경로로 기억을 탐색했는지 사후 확인

### 2.3 세션 종료 시 흐름

```
1. SceneNavigator가 sceneHistory 완성
2. 별이엔진 V4 최종 출력 산출 (기존 로직)
3. updateContaminationVector(memory, engineOutput)  // 기존 v2 함수
4. sceneHistory를 plays 테이블에 저장 (추가 필드)
5. Admin 대시보드용 통계 갱신
```

---

## 3. Admin 패널 추가

### 3.1 반경 시뮬레이터 (신규 탭)

**목적:** 작가가 기억의 감정 공간 구조를 사전 검증

**구성:**
- 2D 감정 공간 맵 (VAD → 2D 투영, Valence × Arousal 축)
- 모든 씬을 점으로 표시 (크기 = 감정 강도, 색 = 지배 감정)
- 가상 경험자 위치: 드래그로 이동
- Pattern 선택 드롭다운 → center 이동 + 반경 원 실시간 표시
- 접근 가능/불가 씬 하이라이트

**경고 시스템:**
- **고립 씬 경고**: 어떤 pattern + 어떤 위치에서도 반경 안에 들어오지 않는 씬
- **허브 씬 경고**: 모든 pattern에서 항상 접근 가능한 씬 (과도 중심화)
- **데드엔드 경고**: 특정 경로 진입 시 접근 가능 씬이 0개 되는 조합

### 3.2 씬별 접근 통계

| 표시 항목 | 출처 |
|----------|------|
| 총 방문 수 / 방문률 | sceneHistory 집계 |
| 평균 alignment | sceneHistory.engineResult 집계 |
| 주요 진입 pattern | 직전 씬에서의 transition_pattern 집계 |
| 평균 접근 가능 씬 수 (이 씬 도달 시) | sceneHistory.accessibleCount 집계 |
| 폴백 진입 빈도 | sceneHistory.wasFallback 집계 |

**0% 방문 씬은 빨간색 경고** — 감정 공간에서 고립됐을 가능성.
작가는 이 정보를 보고 씬의 `original_emotion`을 조정하거나 override를 설정.

### 3.3 오염 대시보드

기존 admin의 오염 제어에 추가:
- 5축 레이더 차트 (divergence, convergence, heterogeneity, stage_1, stage_2, stage_3)
- 최근 세션 이력: 각 세션의 엔진 출력 + 축별 기여 delta
- **변이본 미리보기**: "Stage 1 텍스트 재생성" 버튼 대신, 현재 축적값이 반영되었을 때의 변이 시뮬레이션을 표시. 작가는 개입하는 것이 아니라 관찰한다.

### 3.4 씬별 Override

```javascript
// scene 메타데이터에 추가
{
  nav_override: {
    force_accessible: false,   // 어떤 pattern이든 항상 접근 가능
    force_locked: false,       // 특정 조건 전까지 잠금
    min_visited_before: null,  // 최소 n개 다른 씬 방문 후 접근
    requires_scenes: [],       // 특정 씬 방문 후에만 접근
  }
}
```

**Override 비율 표시**: "현재 Override 적용 씬: 2/12 (17%)"
**15% 초과 시 경고**: "Override가 많으면 엔진이 장식이 됩니다."

---

## 4. Record 통합: 기억을 말하는 행위가 첫 번째 Play

### 4.1 핵심 명제

> 기억을 말하는 행위 자체가 이미 첫 번째 Play다.

Record는 데이터 수집 UI가 아니라 기억 변이의 최초 사건이다.
화자는 자기 기억의 첫 번째 경험자이고, 말하는 과정에서 이미 파괴적 복제가 시작된다.

### 4.2 Pattern-Aware AI Questioning

Record 대화 중 AI("또 다른 나")의 질문 방향을 감지된 pattern으로 조절.

**원칙: AI는 pattern을 명명하지 않는다. 질문의 결만 바꾼다.**

| 감지 pattern | AI 질문 리듬 | 하지 않는 것 |
|---|---|---|
| echo_follow | 짧고 전진. "그래서 그 다음엔?" "또?" | "자연스럽게 흘러가고 있네요" (해석) |
| contradiction | 전환 확인, 중립. "다른 장면인 것 같아." | "아까랑 완전 다른 감정이네요" (진단) |
| avoidance | 침묵/간격/선택형. "..." 또는 "[말해도 되고, 넘어가도 돼]" | "회피하고 있는 것 같아요" (지적) |
| fixation | 감각/장소/신체로 초점 이동. "그때 어디에 있었어? 뭐가 보였어?" | "계속 같은 이야기를 하고 있어" (판단) |
| bridge | 열린 질문. "그때 어떤 느낌이었어?" | (특별한 제약 없음) |
| displacement | 대상 전환 유도. "그 사람은 어땠을까?" | "감정은 같은데 대상이 다르네요" (분석) |

**구현 위치:** `collect-memory` Edge Function의 system prompt에 현재 감지 pattern을 주입.
프론트엔드(`recordChat.js`)에서 축적된 감정 벡터로 pseudo-pattern을 추출하고 API 호출 시 전달.

### 4.3 Pseudo-Pattern 추출 (Record용)

Record에서는 별이엔진을 직접 돌리지 않는다 (비교 대상인 "원본"이 아직 없으므로).
대신, 화자의 감정 궤적 자체에서 패턴을 추출한다:

```javascript
function extractRecordPattern(emotionHistory) {
  if (emotionHistory.length < 2) return 'bridge';  // 초기: 열린 질문

  const recent = emotionHistory.slice(-2);
  const delta = subtractVAD(recent[1], recent[0]);
  const magnitude = vadMagnitude(delta);
  const similarity = cosineSimilarity(recent[0], recent[1]);

  // 감정 변화 없음 → fixation 후보
  if (similarity > 0.9 && magnitude < 0.1) {
    return emotionHistory.length >= 3 ? 'fixation' : 'echo_follow';
  }

  // 큰 반전 → contradiction
  if (similarity < 0.2 || magnitude > 0.6) return 'contradiction';

  // void 입력 → avoidance
  if (recent[1]._isVoid) return 'avoidance';

  // 감정 유사 + 다른 대상 → displacement
  if (similarity > 0.7 && recent[1].attribution !== recent[0].attribution) {
    return 'displacement';
  }

  // 자연스러운 흐름 → echo_follow
  if (similarity > 0.6) return 'echo_follow';

  return 'bridge';
}
```

### 4.4 Initial Telling Trajectory 저장

```javascript
// Record 완료 시 기억과 함께 저장
{
  telling_trajectory: [
    {
      sceneIndex: 0,
      emotion: { fear: 0.3, sadness: 0.7, ... },
      vad: { v: -0.4, a: 0.1, d: -0.3 },
      pattern: 'echo_follow',
      attribution: 'self_blame',
      isVoid: false,
      timestamp: ISO
    },
    {
      sceneIndex: 1,
      emotion: { ... },
      vad: { ... },
      pattern: 'contradiction',
      ...
    },
    ...
  ]
}
```

**DB:** `memories` 테이블에 `telling_trajectory jsonb` 컬럼 추가

**Play에서의 활용:**
별이엔진 V4의 `originalTrajectory`로 `telling_trajectory`의 감정 시퀀스를 사용.
즉, shape_similarity가 "씬의 원본 감정 순서"가 아니라 "화자가 말할 때의 감정 흐름"과 비교된다.

이 순간, 기억의 "원본"은 텍스트가 아니라 감정 궤적이 된다.

### 4.5 명명 규칙

| 기존 용어 | 교정 | 이유 |
|----------|------|------|
| original emotion | initial telling emotion | "원본"은 TEM의 철학에 위배 |
| original trajectory | telling trajectory (최초 진술 궤적) | 순수 원본을 전제하지 않음 |
| narrator's original | narrator's telling | 말해진 것이지, 있었던 것이 아님 |

단, 코드의 기존 `original_emotion` 필드명은 하위호환을 위해 유지.
새로운 필드는 `telling_trajectory`로 명명.

### 4.6 Record 미니맵 (Phase 2 — 당장 구현하지 않음)

씬 3개 이상 쌓였을 때, 사용자 요청 시에만 열리는 보조 패널:
- "지금까지의 기억 지형 보기" 버튼
- 현재까지의 씬 감정 벡터를 2D 점으로 표시
- 기본은 숨김 — 몰입과 메타 인식이 동시에 전면에 나오면 서로 잡아먹음

**이것은 2차 구현이다.** 핵심 파이프라인이 안정된 후에 붙인다.

---

## 5. 구현 순서 및 의존성

```
Phase 1 (병렬 가능):
  [1] SceneNavigator.js 모듈 생성
      - calculateCenter(), getAccessibleScenes(), detectFixation()
      - PATTERN_CONFIG, 폴백 로직, 종료 조건
      예상: ~250줄

  [2] ContaminationTracker.js 연결 모듈
      - sceneHistory 관리
      - 세션 종료 시 updateContaminationVector() 호출
      - DB 저장 로직
      예상: ~150줄

Phase 2:
  [3] main path 연결
      - js/index.js의 proceedToNextScene() → SceneNavigator.getAccessibleScenes() 호출
      - 씬 선택 UI (안개 속 문장 조각)
      - appStore 상태 업데이트
      예상: ~200줄 수정

Phase 3 (병렬 가능):
  [4] Admin 반경 시뮬레이터
      - 2D 감정 공간 맵 (Canvas 기반)
      - 가상 경험자 드래그 + pattern 선택
      - 고립/허브/데드엔드 경고
      예상: ~400줄

  [5] Admin 오염 대시보드 + 접근 통계
      - sceneHistory 집계 뷰
      - 레이더 차트
      - Override UI + 비율 경고
      예상: ~300줄

Phase 4:
  [6] Record pattern-aware questioning
      - extractRecordPattern() 구현
      - collect-memory Edge Function system prompt 수정
      - recordChat.js에서 감정 축적 + pattern 전달
      예상: ~150줄

  [7] Initial telling trajectory 저장
      - DB 컬럼 추가
      - Record 완료 시 trajectory 구성 + 저장
      - Play에서 originalTrajectory 소스 변경
      예상: ~100줄
```

---

## 6. 테스트 전략

### SceneNavigator 단위 테스트

```
- 각 pattern에 대해 center 위치가 예상대로 이동하는지
- 반경 내/외 씬 필터링 정확성
- 폴백 트리거 조건 및 _isFallback 플래그
- fixation 복합 점수 계산
- 씬 ≤ 3개 B 폴백 모드
- 종료 조건 각각 트리거
```

### 통합 테스트

```
- 5씬 기억으로 전체 Play 시뮬레이션
  → 감정 입력 시퀀스별로 경로가 다른지 확인
- 오염 누적 시뮬레이션
  → 동일 기억 10회 Play 후 축별 값 변화 추적
- Admin 시뮬레이터와 실제 Play 결과 일치 여부
```

---

## 7. 미결정 사항

| 항목 | 결정 시점 |
|------|-----------|
| VAD → 2D 투영 방식 (Admin 맵용) | Admin 구현 시 |
| PATTERN_CONFIG 상수 튜닝 | 시뮬레이션 후 |
| contradiction의 invert 방식 (VAD 반전 vs 반대 감정 앵커) | SceneNavigator 구현 시 |
| displacement에서 "다른 attribution" 판별 기준 | SceneNavigator 구현 시 |
| Record pseudo-pattern의 threshold 튜닝 | Record 통합 시 |
| telling_trajectory가 shape_similarity에 미치는 영향 범위 | V4 연동 테스트 후 |
| 갇힘 엔딩의 연출 (UI/사운드/텍스트) | Phase 2 이후 |

---

*별이엔진 V4 기반. 기억유전학 v0.3 연동. 2026-03-29.*

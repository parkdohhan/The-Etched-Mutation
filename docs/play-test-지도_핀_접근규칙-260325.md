# play-test 지도 핀 접근 규칙 (SSOT: `play-test.html`)

## 목적

`play-test.html`의 지도 화면은 **등고선 지형 + 핀(pin)** 으로 장면 접근 가능 범위를 표현한다.  
이 문서는 “어떤 핀이 클릭 가능해지는가(잠금/해제)”를 코드 기준으로 정리한다.

---

## 용어

- **core pin**: 일반 장면(기본 앵커 장면). `pin.type === 'core'`
- **bridge pin**: 잔여/중립 역할 장면. `pin.type === 'bridge'` (조건: `scene.scene_role === 'residual'`)
- **void pin**: void 장면(특정 조건에서만 열리는 특수 핀). `pin.type === 'voidPin'`
- **echo pin**: 최근 플레이(해석) 흔적 장식. `pin.type === 'echo'` (**항상 잠금**, 클릭 불가)

상태:

- `pin.state`: `'active' | 'locked'` (코드 내부 플래그)
- 렌더 클래스:
  - `active`: 클릭 가능(아직 방문 전인 경우)
  - `visited`: 이미 방문한 core/bridge/void
  - `locked`: 클릭 불가
  - `entrance`: “이번에 열려있는 새 입구” 강조

---

## 핀 배치 규칙 (좌표계)

### 1) core/bridge

- 원본 감정(`scene.original_emotion`)을 **AF 좌표**로 투영해 지도 좌표로 변환한다.
  - `emotionToMapCoords()` → `{ x, y }` in \([0,1]\)
  - 내부: `projectEmotionToAFContour()` 결과의 `x,z`를 `(HALF/SIZE)`로 정규화
- 핀이 완전히 겹치지 않도록 `mapCoordsSpread()`로 memory/scene 기반의 작은 오프셋을 더한다.

### 2) echo

- 최근 `plays`에서 `user_emotion`을 AF 투영 → 퍼센트 좌표(`vadToPercent`)로 찍고,
- 약간의 지터(jitter)를 더해 점군처럼 분포시킨다.
- **잠금 처리**(장식)라 클릭 경로에 영향 없음.

### 3) void

- void 장면이 존재하면 **고정 좌표**로 핀을 추가한다.
  - 현재: `x=88%`, `y=78%` (코드 상 고정)

---

## 접근(Unlock) 규칙 개요

접근 가능 목록은 `game.accessiblePinIds: Set<string>`로 관리한다.

핵심 흐름:

1. **초기 접근**: `applyInitialAccess()`
2. **플레이 후 접근 재계산**: `handleEmotionResult()` → `updateAccess(...)`
3. `syncPinStateFlags()` + `applyPinVisualFlags()`로 `active/locked/visited/entrance` 상태를 최종 반영

경로별 진입 (260727 배선 완비):

- **고전 감정 제출 경로**: `afterTerrainReturn()` → `handleEmotionResult()`
- **대화 경로(v21-phase1)**: `onSceneEnd` 에서 `byeoriCalculateStep` 실행 후 `handleEmotionResult()` 호출.
  260727 이전엔 이 경로가 접근 재계산을 **아예 안 해서** FP 플레이 접근 핀이 입장 초기 3개로 고정돼 있었다.

---

## 1) 초기 접근 규칙 (`applyInitialAccess`)

- 대상: `core + bridge` 핀만
- 아직 방문하지 않은(`!game.visitedCore[sceneId]`) 핀을 우선으로, 없다면 전체 코어 풀을 사용
- `sceneOrder` 오름차순으로 정렬 후 **최대 3개**를 열어준다
- void 장면이 존재하면 `voidPin`도 추가로 열어준다

즉, 시작하자마자 열리는 핀:

- **(core/bridge 중) 3개**
- **(+ void 장면이 있으면 voidPin 1개)**

---

## 2) 플레이 후 접근 규칙 (`updateAccess`)

### 입력

- `pattern`: 전이 패턴 (예: `echo_follow`, `bridge`, `contradiction`, `displacement`, `avoidance`, `fixation`)
- `emotionPosition`: 사용자 감정의 지도 좌표 `{x,y}` (AF 기반)
- `originSceneId`: 직전에 플레이한 core/bridge/void 장면 id

### 중심점(center) 계산 — 260727 교체 (원칙 1 수복)

> 구모델(패턴 무관하게 `(emotionPosition + originPin) / 2` 평균)은 260727 폐기.
> 패턴이 반경만 바꾸고 중심은 안 움직여 CLAUDE.md §6.5 #1 WRONG 모델이었다.

`computeAccessCenter(pattern, userEmotion, originScene, fallbackPos)` —
중심을 **감정 공간(17축)에서 패턴별로 블렌드한 뒤 AF 지도좌표로 투영**한다.
규칙은 `js/core/SceneNavigator.js` `PATTERN_CENTER` 와 동일(모듈 경계 사본, 변경 시 동기화):

| 패턴 | 중심 |
|---|---|
| `echo_follow` | 원본 0.7 : 유저 0.3 블렌드 → 투영 |
| `bridge` | 0.5 : 0.5 |
| `displacement` | 원본 0.3 : 유저 0.7 |
| `contradiction` | 유저 벡터 반전(축별 1−v) → 투영 |
| `avoidance` | voidPin 좌표 (없으면 유저 위치) |
| `fixation` | 현재 씬 감정 투영 (선택은 여전히 originPin 단독) |

`emotionPosition`(지도좌표)은 감정 벡터가 비었을 때의 fallback 위치로만 쓰인다.

### 반경(rule.radius)

패턴별 반경(`TRANSITION_RULES`):

- `echo_follow`: 0.42
- `bridge`: 0.62
- `contradiction`: 0.36
- `displacement`: 0.48
- `avoidance`: 0.24
- `fixation`: 0.09

### 선택 알고리즘

대상은 항상 `core + bridge` 핀들(= `cores`).

1. **fixation + originPin 존재**: `selected = [originPin]`
2. 그 외:
   - \(d(center, pin) <= radius\) 인 핀을 1차 선택
   - 비었으면 \(radius * 1.85\) 로 확장해서 재시도
   - 그래도 비었으면 **중심에서 가장 가까운 미방문 핀 1개** (260727 교체 — Fallback B,
     SceneNavigator 동일 규칙. 구버전 "미방문 전부 개방"은 패턴이 중심을 멀리 보낸 순간
     기하가 무효화되는 구멍이었다)
   - 미방문이 하나도 없으면 “core/bridge 전부”

### voidPin 추가 규칙

void 장면이 존재하고, 패턴이 아래 중 하나면 voidPin을 `selected`에 추가한다.

- `avoidance`
- `contradiction`

결과:

- `game.accessiblePinIds = new Set(selected.map(p => p.id))`

---

## 3) 잠금/활성/방문 플래그 (`syncPinStateFlags` + `applyPinVisualFlags`)

### `syncPinStateFlags()`

- core/bridge:
  - 방문했거나(`visitedCore`) 접근 Set에 포함이면 `active`, 아니면 `locked`
- voidPin:
  - 방문했거나 접근 Set에 포함이면 `active`, 아니면 `locked`
- echo:
  - 항상 `locked`

### `applyPinVisualFlags()`

렌더링용 플래그를 정리한다.

- echo:
  - 무조건 `locked` 처리, 나머지 플래그 리턴
- core/bridge/void:
  - `visited = visitedCore[sceneId]`
  - `canOpen = visited || accessiblePinIds.has(id)`
  - `locked = !canOpen`
  - `active = canOpen && !visited`
  - `entrance = canOpen && !visited`

즉, “이번에 열려있는 신규 핀”은 `entrance`로 애니메이션 강조된다.

---

## 클릭 동작 (`onPinClick`)

- `pin.locked` 이면 클릭 무시
- `core/bridge/voidPin` 모두 `enterSceneMode(pin)`로 진입
- `game.sealed` 상태면 전체 클릭 무시

---

## 디버깅 포인트

`updateAccess()` / `handleEmotionResult()`는 콘솔에 다음을 출력한다.

- center 좌표
- 패턴/반경
- 후보 핀 거리 분포
- 최종 선택된 accessible pin id 리스트

문제(핀 전부 잠김, 접근 범위 이상) 발생 시 이 로그가 1차 SSOT이다.


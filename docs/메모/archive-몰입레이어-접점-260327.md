# 아카이브 플레이 · 몰입 레이어 접점 정리 (260327)

목적: **등고선 지형(2D profile)**, **핀/트레이스**, **커서(감정 입력·파동)**, **씬 전이**, **VAD**, **Core / 오염(Contaminated) / Echo**가 어디서 정의·소비되는지 한 장으로 보고, **몰입 레이어를 깔끔히 붙이려면 무엇을 단일화해야 하는지** 정리한다.

---

## 1. 실행 경로가 둘이다 (가장 중요한 접점)

| 구분 | 엔트리 | 상태 | 지형·전이 |
|------|--------|------|-----------|
| **메인 (index)** | `index.html` → `js/index.js` | `appStore` (`currentScene`, `fixationCounts`, `lastTransitionPattern` 등) | `window.strataSection` (`js/ui/strataSection.js`) |
| **데모 (demo)** | `test/demo2.html` 등 → `js/demo/demoFlow.js` | `demoState` (`js/demo/demoState.js`) | 인라인 `draw2DTerrain()` (demoFlow 내부) |

두 경로는 **화면 구조·데이터 모델·전이 규칙이 완전히 같지 않다.** 몰입 레이어(전이 패턴 → 타이핑/도착 연출 → 지형 위 흔적)를 붙이려면 **“어느 쪽을 SSOT로 할지”**를 먼저 정해야 한다.

---

## 2. 메인 아카이브 플레이 (`js/index.js`)

### 2.1 씬 렌더링·텍스트 몰입

- **`renderScene()`**  
  - 데이터: `window.currentStoryData` (또는 `storyData`)의 `scenes[state.currentScene]`.  
  - **Echo**: `scene.echoWords` → `renderEchoLayer()` (DOM에 `echo-word` 스팬).  
  - **방문 횟수·도착 패턴**: `state.fixationCounts[state.currentScene]`, `state.lastTransitionPattern` → `buildArchiveSceneHTML()`, `getArrivalTypingSpeed()`, `data-arrival` 속성.  
  - **주의**: 아래 3절과 같이 **`fixationCounts` / `lastTransitionPattern`을 메인 플로우에서 갱신하는 코드가 현재 거의 없음** → UI는 “분기 몰입”을 기대하지만 상태는 기본값에 머물 수 있음.

### 2.2 등고선 지형(하단 2D) + “핀”에 가까운 것

- **`window.strataSection`** (`js/ui/strataSection.js`)  
  - 프로필: `buildProfileFromScenes(scenes)` — 씬의 **`original_emotion` / `originalEmotion`** 가중치로 고도·색 샘플 생성.  
  - **트레이스(구간별 이펙트)**: `setTraces(traces)` 후 `render()`.  
  - 캔버스: 기본 `#strataSectionCanvas`.

- **메인에서 트레이스에 넣는 객체 형태** (`renderScene()` 내부):

```text
{
  sceneIndex: number,      // 완료된 이전 씬 인덱스
  effectType: string,      // deriveEffectType(alignment) — 'smooth' | 'layer' | 'deposit' | 'erosion' | 'fade'
  strength: number,        // 1 - alignment
  color: [r, g, b]        // strataSection.emotionVectorToRGB(archiveUserEmotions[scene].emotion)
}
```

- **플레이어 마커(현재 위치)**: `setCurrentScene(state.currentScene)`로 프로필 위 위치 표시.

즉 메인의 “핀”은 **DB의 고정 핀 레코드가 아니라**, 매 플레이마다 쌓이는 **`_strataCompletedScenes` 트레이스 + 현재 씬 마커**다.

### 2.3 씬 전이 (선형 + 미사용 맵)

- **실제 아카이브 진행**: `proceedToNextSceneOrEnd()` 등에서 **`currentScene + 1`** 선형 이동이 중심.  
- **`SCENE_TRANSITION_MAP`** (`index.js` 상단, 3씬 데모용 주석)은 정의만 있고, **grep 기준으로 이 맵을 읽어 다음 인덱스를 고르는 호출은 없음.**  
- **`lastTransitionPattern`**: 스토어에 필드는 있으나, **`demoFlow`의 `demoState`가 아닌 `appStore` 쪽은 엔진의 `transition_pattern`과 연결되는 갱신 경로가 분리·누락**되어 있을 수 있음 → 도착 연출(`getArrivalTypingSpeed`)이 항상 `bridge`에 가깝게 동작할 위험.

**정리 포인트 (메인)**  
1. `ByeoriEngine` 결과의 `transition_pattern`을 **`appStore.lastTransitionPattern`**에 반드시 반영.  
2. 재방문·고정(fixation) 루프를 쓸 거면 **`fixationCounts` 갱신 규칙**을 `submit` 파이프라인에 명시적으로 넣기.  
3. `SCENE_TRANSITION_MAP`을 쓸지, **씬 수 N에 대한 일반 그래프**로 바꿀지 결정하고, **미사용 코드는 제거하거나 한 함수로 통합**.

---

## 3. 데모 플로우 (`js/demo/demoFlow.js`)

### 3.1 `sceneIndex += 1` 하드코딩 위치

- **`nextOrReveal()`** (약 706행): `demoState.sceneIndex += 1` 후 다음 씬 또는 리빌.  
  - `processScene()` 실패·벡터 없음 분기 등에서 호출 → **맵 전이가 아닌 순차 진행 폴백**.

### 3.2 `applyTransition(pattern)` — 이 파일에만 존재

- **정의**: `demoFlow.js` 내부 단일 구현.  
- **역할**:  
  - `demoState.lastTransitionPattern = pattern`  
  - `SCENE_TRANSITION_MAP[currentSceneIndex]`로 **다음 `sceneIndex` 결정** (패턴별 분기, `_terminal`이면 리빌).  
  - `totalScenesPlayed` 상한(6) 시 컷오프 메시지 후 강제 분기.  
  - 지연 후 `updateTerrain()` → `draw2DTerrain(..., contaminations)`.

- **메인 `index.js`에는 동명 함수 없음** → “전이 몰입”을 데모와 메인에서 같게 하려면 **`applyTransition` 수준의 단일 모듈**로 빼는 것이 좋다.

### 3.3 데모 지형·오염 “핀” 데이터

- **`updateTerrain()`** → `demoState.sceneHistory`에서:

```text
contaminations: { sceneIndex, terrainEffectType }[]
```

- **`terrainEffectType`** 출처: `demoState.js`의 **`recordScene()`** → **`resolveTerrainEffect(distortionTag, mismatchType, resolvedVector)`**  
  - 예: `avoidance`→`fade`, `projection`→`spread`, 귀인/감정 미스매치 시 `erosion`/`deposit` 등.

- **`draw2DTerrain()`** (demoFlow 내부): `strataSection.js`와 **같은 개념**(프로필 + underlayer + effect 스위치)이지만 **구현이 복제** — 수치·노이즈·정규화가 어긋나면 메인과 데모 지형이 달라 보인다.

### 3.4 Core / Reveal 정렬

- **`startReveal()`**: 헤더에 “Core Scenes” 표기.  
- **`demoState.sceneHistory` 항목** 중 `isCoreMoment === true`인 것을 앞에 모아 표시 (`coreFirst`).  
- **`isCoreMoment` 판정**: `recordScene()` 내 — `alignment_bucket`, `mismatch_type` 조합.

---

## 4. Emotion cursor / VAD

### 4.1 정렬도·엔진 (SSOT)

- **`js/core/ByeoriEngine.js`**  
  - 정렬도는 **감정·이유·태도** 조합 (VAD로 점수 내지 않음).  
  - **`projectEmotionToVAD(userVector.base, anchorEmotions)`** → 결과 필드 **`affective_position`** (시각화용으로 명시).

### 4.2 VAD 수학·앵커

- **`js/shared/math.js`**: `projectEmotionToVAD`, `calculateVADSimilarity` 등.  
- **`js/shared/tem_geo_map.js`**: `TEM_ANCHOR_VAD`, `TEM_VAD_IS_VISUAL_ONLY` — **정렬도와 분리**라는 주석이 코드에 있음.

### 4.3 메인 라이브/체험자 쪽

- **`index.js`**: Live 파이프라인에서 `projectEmotionToVAD` 호출 로그 구간 존재 (디버그·시각화 성격).

### 4.4 데모 모노로그의 `vad`

- **`MONOLOGUES`** (`demoFlow.js`): 각 항목 `vad: { v, a, d }`.  
- **실사용**: 클릭/분석 경로가 아니라 **떠다니는 단어 애니메이션 속도**에 `vad.a`만 간접 사용 (`freq = 0.3 + abs(vad.a)*0.8`).  
- **`dataset.vadA`**: 저장만 하고 상위 로직과의 연결은 제한적.

**정리 포인트 (VAD)**  
- “커서”가 **2D 지형 위 좌표**를 가져야 하면: **AF 평면(`tem_af_map.js`) vs VAD** 중 어디를 쓸지 기획과 코드 주석을 맞출 것.  
- 현재는 **엔진 점수 ≠ VAD**이므로, 몰입 레이어에서 VAD 커서를 쓰면 **별도의 매핑 계약**이 필요하다.

---

## 5. Core / Contaminated / Echo — 용어와 데이터 매핑

코드베이스에 **한 테이블 이름으로 “CorePin”**이 있는 것이 아니라, **개념이 여러 필드로 쪼개져** 있다.

| 기획 용어 | 코드에서의 실체 | 저장/흐름 |
|-----------|-----------------|-----------|
| **Echo** | `echo_words` / `echoWords` | 씬 JSON·DB → `buildArchiveSceneHTML`, `renderEchoLayer` |
| **Contaminated** (오염 흔적) | 데모: `terrainEffectType` / 메인: `effectType` in traces | 데모: `resolveTerrainEffect` + `draw2DTerrain`; 메인: `deriveEffectType(alignment)` + `strataSection` |
| **Core** | 데모: `isCoreMoment` | `recordScene()`에서 플래그 → Reveal에서 정렬 |

**주의**: 메인 트레이스의 `effectType`과 데모의 `terrainEffectType` **이름·분기 테이블이 동일해 보이지만, 입력 신호가 다름** (데모는 distortion+mismatch, 메인은 대체로 alignment 기반 `deriveEffectType`).

---

## 6. 몰입 레이어를 “깔끔하게” 붙이기 위한 체크리스트

1. **단일 전이 모듈**  
   - `applyTransition(pattern, { sceneIndex, map, scenesLength, fixationCounts })` 형태로 추출.  
   - 메인은 `currentScene` 갱신을 이 모듈 결과만 따르게 할지, 선형+맵 혼합을 없앨지 결정.

2. **스토어 필드 계약**  
   - `lastTransitionPattern`, `fixationCounts`, `visitedScenes`, `totalScenesPlayed`를 **아카이브 submit 한 곳에서만** 갱신.

3. **지형 렌더러 하나**  
   - `strataSection.js` vs `demoFlow.draw2DTerrain` — **하나로 합치거나**, 공통 `buildProfile` + `drawTraces`만 공유.

4. **트레이스 스키마 통일**  
   - `{ sceneIndex, effectType | terrainEffectType, strength?, color? }` 필드명·enum을 통일.

5. **Echo는 씬 데이터 SSOT**  
   - API/DB는 `echo_words` 카멜/스네이크 혼용 정리 (`NetworkService` 로드 시 이미 일부 정규화).

6. **VAD/AF “커서” 역할 분리**  
   - 시각화용 좌표만 쓸지, UI 상호작용(호버·클릭)과 연결할지 문서화.

---

## 7. 빠른 파일 인덱스

| 주제 | 파일 |
|------|------|
| 메인 씬·Echo·strata 하단 | `js/index.js` (`renderScene`, `buildArchiveSceneHTML`, `_strataCompletedScenes`) |
| 2D 지형(플레이 UI) | `js/ui/strataSection.js` |
| 데모 전체·`applyTransition`·`draw2DTerrain` | `js/demo/demoFlow.js` |
| 데모 상태·`recordScene`·terrainEffect | `js/demo/demoState.js` |
| 엔진·VAD 투영 | `js/core/ByeoriEngine.js`, `js/shared/math.js`, `js/shared/tem_geo_map.js` |
| 3D Strata (별도) | `js/ui/strataView.js`, `js/shared/tem_af_strata_terrain.js` |

---

*작성일: 2026-03-27. 코드 기준으로 정리했으며, 이후 리팩터링 시 이 문서의 “미연결” 항목을 우선 갱신하면 된다.*

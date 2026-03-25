# Strata 3D Rendering (AF Version)

## 개요

현재 Strata 3D는 기존의 시간 슬랩(`surface/near/mid/deep/bedrock`) 누적 렌더링이 아니라,
**AF 좌표계(Attribution × Core Fear)** 기반 단일 지형 렌더링으로 동작한다.

- X축: `self_blame → other_blame → fate_blame`
- Z축: `abandonment/rejection/powerlessness/loss`
- Y축: 기억/해석 누적으로 형성된 높이맵

핵심 구현은 `js/shared/tem_af_strata_terrain.js`에 공통 모듈로 분리되어 있고,
`js/ui/strataView.js`는 데이터 로드 + HUD + 뷰 라이프사이클만 담당한다.

---

## 파일 구조

```text
index.html / admin.html / demo-sequence.html
├── three.js
├── OrbitControls.js
├── js/shared/tem_af_strata_terrain.js   # AF 지형 엔진 (공통)
└── js/ui/strataView.js                  # showStrataView, 데이터 fetch, HUD
```

---

## 데이터 흐름

### 1. `window.showStrataView(memoryId, ...)` 호출
### 2. `strataView.js`에서 `memories` + `plays` 조회
   - Supabase 실패/빈 결과면 `_simulatedPlaysMap` 폴백
### 3. `TemAfStrataTerrain.buildMemoryItems(...)`로 렌더용 `P` 생성
### 4. `createStrataTerrain(...).buildTerrain(null)` 내부에서 `computeAfTerrainFields(P, null)`로 높이·색 필드 생성 후 메시에 올림
### 5. HUD(`strataHudTR`, contamination bar) 갱신

---

## 공유 높이맵 API (3D / 2D 동기화)

3D 메시와 2D 등고선(예: `play-test.html`)이 **같은 스칼라 필드**를 쓰려면 아래를 사용한다.

### `TemAfStrataTerrain.computeAfTerrainFields(P, filterIdx, opt?)`

- **인자**
  - `P`: `buildMemoryItems` 결과 배열
  - `filterIdx`: `null`이면 전체 기억 합산, 숫자면 해당 인덱스만
  - `opt`: `{ G?: number, SZ?: number }` — 기본 `G=72`, `SZ=46` (Three 런타임과 동일)
- **반환**
  - `hts`: `Float32Array` 길이 `G*G` (원시 높이, 메시 정규화 전)
  - `cls`: `Float32Array` 길이 `G*G*3` (RGB 누적)
  - `minH`, `maxH`: `hts`의 최소·최대
  - `G`, `SZ`, `H2`

`createStrataTerrain(...).buildTerrain()`은 이 함수를 호출한 뒤, `minH`~`maxH`로 Y를 정규화해 `PlaneGeometry`에 올린다.

### `play-test.html` 등고선

- `buildMemoryItems` + `computeAfTerrainFields`로 `game.agg.heights` / `colors`를 채우고, `game.agg.gridG`(= `G`)를 두어 래스터·marching squares가 72×72와 일치하도록 한다.

---

## AF 지형 생성 규칙

`tem_af_strata_terrain.js` 기준:

- 감정 벡터 → 귀인 분해(`E2A`) → `x = pX(attr)`
- 감정 벡터 → 핵심두려움 분해(`E2F`) → `z = pZ(fear)`
- 기억별 중심점(`pillarWx`, `pillarWz`)에 가우시안 봉우리 누적
- play별 정렬도(`alignment`)에 따라 융기/침하 및 색 혼합
- 마지막에 fBm 노이즈와 색상 스무딩 적용

결과(3D):

- `terrain` (vertex color mesh)
- `terrainWire` (와이어 오버레이)
- `seedGrp` (기억 기둥 + 포인트 라이트)

---

## 주요 API

### `window.showStrataView(memoryId, alignmentResult, onClose)`

- memory 단위 AF 지형 로드/표시
- 닫기 버튼(`strataCloseBtn`)과 연결

### `window.Strata`

- `start()`: runtime 초기화 + 애니메이션 루프 시작
- `init(config)`: `P` 주입 후 지형 재생성
- `stop()`: 루프 정지
- `resizeToCanvas()`: 캔버스 크기 동기화
- `getData()`: 디버그 데이터 반환

> 참고: 기존 슬랩 엔진의 `appendEvent`, `recompute`는 AF 모드에서는 실시간 증분 리빌드를 제공하지 않고 경고만 남긴다.

---

## HUD 의미

- 우상단: 메모리 제목, interpretation 수, AF 좌표
- 우하단 contamination: `mean(1 - alignment)`, 범위 `0.00 ~ 1.00`

---

## 로컬 디버깅

```js
debugStrata();
debugStrata('memory-uuid');
debugStrataHelp();
```

---

## 마이그레이션 노트 (구버전 대비)

- 제거: 레이어별 `bakeLayer`/`buildSlab` 시간층 렌더
- 도입: AF 단일 높이맵 + `computeAfTerrainFields` 공유
- 기대효과: 3D와 2D 등고선이 동일 필드에서 파생, 테스트 페이지와 본편 로직 일치

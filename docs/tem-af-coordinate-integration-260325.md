# TEM AF 좌표계 통합 가이드

## 개요

VAD 기반 지형 시각화에 더해 **AF(Attribution × Core Fear)** 좌표를 사용할 수 있도록 모듈을 분리해 두었습니다.
실제 본편(`index.js`, `strataView.js`, Edge Function) 전면 교체는 **선택 단계**이며, 아래 파일로 즉시 사용·테스트할 수 있습니다.

## 아키텍처 규칙

### 1. **AF 좌표는 시각화 전용** — 정렬도, 전이 패턴, 서사 분기에 사용하지 않는다.
### 2. **17D → AF 투영은 허용**, AF → 17D 역추론은 하지 않는다.
### 3. **`js/core/ByeoriEngine.js`** 의 정렬도 계산은 **변경하지 않는다**.

## 좌표 정의

| 축 | 의미 |
|----|------|
| **X** | 귀인: `self_blame(-1)` ← → `other_blame(0)` ← → `fate_blame(+1)` |
| **Z** | 핵심 공포: `abandonment(-1)` … `loss(+1)` (중간 앵커: rejection, powerlessness) |
| **Y** (개념) | 해석 누적·퇴적 — 지형 높이/레이어에서 표현 |

## 프로젝트 내 파일

| 파일 | 역할 |
|------|------|
| `js/shared/tem_af_map.js` | 앵커, 17D 폴백, `projectToAFCoordinate()`, `afToTerrainXZ()`, 색상 `EMOTION_COLORS` |
| `js/shared/tem_af_analysis.js` | Claude용 프롬프트 스텁, `validateAndProjectAnalysis()`, `buildPlayRecord()`, 백필 유틸 |
| `js/shared/math.js` | `projectEmotionToVAD` **유지** + AF 함수 **re-export** (`AF_EMOTION_COLORS` 등) |
| `af-terrain-test.html` | Supabase URL/KEY 입력 후 memories/plays로 AF 지형 3D 프리뷰 |
| `js/af-terrain-test-page.js` | 위 페이지 로직 (`plays.alignment` 사용, `user_emotion` JSON 파싱) |

## `reason_analysis` 호환

- **분포 객체** (권장): `attribution.{self_blame,other_blame,fate_blame}`, `core_fear.{abandonment,rejection,powerlessness,loss}`
- **레거시 문자열** (`self_blame`, `abandonment` 등): `tem_af_map.js`에서 one-hot으로 변환 후 투영

한쪽만 있으면 나머지 축은 **17D `base` 폴백**으로 채운다.

## 본편 연동 시 권장 순서 (참고)

### 1. `tem_af_map.js`로 좌표 계산 검증
### 2. `af-terrain-test.html`로 실 DB 시각화 확인
### 3. `index.js` plays 저장 시 `projectToAFCoordinate` 결과를 메타데이터로 저장 (기존 `vad` 필드 유지 가능)
### 4. 지형/Strata 빌더에서 `af_coordinate` 또는 `terrain_pos` 우선, 없으면 17D 폴백
### 5. Edge Function 응답을 attribution/core_fear **분포**로 확장 (선택)
### 6. DB 컬럼 추가 (선택): `af_coordinate`, `attribution`, `core_fear`, `af_estimated` JSONB

## 테스트

### 1. 로컬 서버로 `af-terrain-test.html` 열기
### 2. Supabase URL · anon key 입력 → CONNECT
### 3. 지형·필·카메라 시퀀스 버튼으로 동작 확인

## 관련 문서

- `docs/strata-3d-rendering-260325.md` — Strata 3D(AF 기반) 렌더링/동기화 정리

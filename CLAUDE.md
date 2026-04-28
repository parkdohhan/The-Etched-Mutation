# 어시스턴트 가이드

## 한국어 답변에서 코드/전문 용어 인용 규칙

프로젝트가 고도화되면서 영어 식별자, Web API, 라이브러리, 도메인 용어가 답변에 자주 등장한다.
이런 용어는 **풀어쓰거나 한국어로 바꾸지 말고 원문 그대로** 쓴다. 대신 등장할 때마다
**괄호 안에 짧은 설명을 무조건 함께 붙인다.**

### 형식

`용어(설명)` — 괄호 앞뒤 공백 없음. 설명은 5~15자 내외로, 그 용어가 무슨 역할/무엇인지
즉시 파악되게 쓴다.

### 적용 대상

- 코드 식별자 (변수/함수/모듈/파일명): `_fpTick`, `MutationObserver`, `BufferSource`
- Web API / Three.js / 외부 라이브러리 용어: `Raycaster`, `AudioContext`, `requestAnimationFrame`
- 프로젝트 도메인 용어: `stage_position`, `ghost_condensation_points`, `_fpScenePins`

### 적용 제외

- HTML, CSS, JSON 같은 일반 상식 수준 용어
- 사용자가 직접 채팅에서 먼저 꺼낸 용어를 그대로 받을 때
  (단, 사용자가 의미를 묻는 흐름이면 붙임)

### 예시

좋음:
- "`MutationObserver`(DOM 클래스 변경 감지)가 `mapMode` 클래스 바뀔 때 발동해서 그 안에서 `_fpScenePins`(씬 진입 핀 배열)를 다시 만들어요."
- "`BufferSource`(WebAudio 재생 노드) stop/start 글리치로 `ambient`(배경 사운드 레이어) 음량이 튐."
- "`stage_position`(admin 드래그로 지정한 씬 좌표)이 비어있으면 emotion 기반 자동 투영으로 fallback."

나쁨 (풀어써서 코드 매핑 끊김):
- "DOM 변경 감지 객체가 지도 모드 클래스 바뀔 때 발동해서 그 안에서 씬 진입 핀들을 다시 만들어요."

나쁨 (설명 없이 용어만 던짐):
- "`MutationObserver`가 `mapMode` 변화 시 발동해서 `_fpScenePins`를 재구축해요."

### 의도

- 코드 ↔ 답변 매핑이 끊기지 않아 사용자가 grep/파일 점프로 즉시 코드 찾을 수 있음
- 동시에 사용자가 매번 의미를 추측하지 않아도 됨
- 풀어쓰는 과정에서 정보가 누락되지 않게 보장

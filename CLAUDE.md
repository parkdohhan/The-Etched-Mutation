# CLAUDE.md — TEM 작업 가이드

> Claude Code가 이 프로젝트에서 작업할 때 자동 로드되는 단일 가이드.
> 최상단 "즉시 적용 규칙"이 최우선.

---

## 1. 즉시 적용 규칙

**최우선**
1.**사용자는 코드용어, 파일이름, 영어를 모른다** html, css, 고유명사같이 번역할수없는 용어를 제외하고는 한국어로 풀어서 초등학생도 알아듣도록 자세히 예시를 들어 설명한다. 
2.자세한 설명과 예시를 드는 과정중에서 누락되는 정보는 없어야한다. 만약 쉽게 설명할수없다면 맨 마지막에 추가하라.

사용자가 "뭐라는거야 다시 설명해" 라고 말하게되는일은 없어야한다.
작업을 시작하기 *전*에 다음 두 자리를 자세히 설명한다.

### 1.1 작업 시작 전 설명 의무

1. **무슨 작업인가** — 어디 파일을 어떻게 고치는지, 신규 박는 거면 어떤 모양인지. 영문/약어/툴 이름만 박고 끝내지 말 것.
2. **끝나면 어떻게 되는가** — 그 작업 끝나면 시스템이 어떻게 변하는지, 사용자가 뭘 새로 볼 수 있게 되는지, 다음 자리는 무엇이 풀리는지. 실제 예시를 들어 설명한다.

### 1.2 "실험개시" 한마디 규칙 (2026-11-07 신설)

사용자가 **"실험개시"** 라고만 치면, 질문 없이 `docs/실험/개연성_사전등록_v1-261107.md` **§9 실행 절차**를 그대로 밟는다: 사전 등록 본문 수정 금지 → `tools/plausibility/README.md` 준비물 확인(.env 없으면 그 파일만 요청하고 멈춤) → `node --test tools/plausibility/test/models.test.mjs` → `node tools/plausibility/pull.mjs` → `node tools/plausibility/run_backtest.mjs --raw <추출 파일>` → 결과 md의 판정을 사전 등록 §10에 추기 → 커밋·푸시 → 표 한 장 + 판정 한 줄 보고. **데이터를 본 뒤 식·영모형·판정 기준을 바꾸지 않는다.** 오류가 나면 식을 고치지 말고 오류 원문과 함께 멈춘다. 다른 사전 등록 실험이 생기면 이 규칙에 줄을 추가한다(가장 최근 것이 기본).

## 2. 시한부 규칙 (유효: ~2026-05-19) — (폐기됨 — 사용자 결정 2026-05-14)

> **이 섹션은 더 이상 적용되지 않음.** 2026-05-14 사용자가 LUMEN scope 폐기 결정 + 자유 작업 모드로 전환. 본문은 역사 기록으로만 보존. `docs/LUMEN_DEMO_SCOPE-260506.md` 도 같은 날 삭제.

이 섹션은 일반 가이드보다 우선한다. **5-19 이후 재검토·제거.**

### 2.1 Lumen 2026 작업 규칙

1. **스코프 제한** — `docs/LUMEN_DEMO_SCOPE-260506.md`에 명시된 작업만 수행한다.
2. **스코프 밖 요청 거절** — 스코프 밖 작업 요청 시 다음 문장으로 응답하고 실행하지 않는다:
   > "이 작업은 LUMEN_DEMO_SCOPE-260506.md에 없음. 추가하려면 사용자가 명시적으로 SCOPE.md를 갱신해야 함"
3. **루프 방지** — 같은 파일을 2시간 내 3번 이상 수정 시도 시 작업을 중단하고 사용자에게 원인 재진단을 권고한다.
4. **완료 체크 의무** — 세부 항목을 완료하면 **그 자리에서 즉시** SCOPE.md의 해당 bullet을 `- [ ]` → `- [x]` 로 갱신하고, 괄호로 완료 일자와 산출물 경로를 병기한다. 커밋 메시지에만 적고 SCOPE.md를 안 건드리는 것은 금지. 부분 완료 시 sub-bullet 단위로 체크.
   - 예: `- [x] DB 마이그레이션 (2026-04-21 완료) — supabase/migrations/20260421000000_lumen_spatial_columns.sql`
   - 기존 bullet이 체크박스 없으면 `- [ ]` / `- [x]` 로 변환해서 체크.

---

## 3. 자주 틀리는 패턴 (실수 기록)

### 3.1 없는 개념을 새로 만들려고 한다
❌ "브릿지 스키마를 추가하자" — 실제로는 이미 `echo_words`, `anchor_emotions`, `ContaminationTracker`가 유사 기능 담당
✅ 새 제안 전에 `Grep` / `Read`로 **기존에 유사 개념이 있는지 먼저 확인**

### 3.2 TEM 고유 모델을 Twine/XState/일반 게임북으로 환원한다
❌ "choice는 씬 간 분기 지정 (next_scene_id)"
✅ **TEM의 choice는 감정 결만 기록**. 씬 이동은 scene_order 기반 + 런타임 접근 규칙. "씬 내부 선택지 시스템" 같은 말은 TEM에 없음.
❌ "포트 타입 = 선택지 버튼"
✅ 포트는 **작가 연출 레이어**. 플레이어는 후보 씬 중 고름. 후보는 궤적 엔진이 결정.

### 3.3 DB 스키마 확인 안 하고 코드 제안
❌ "local window.memoriesData에 push하면 됩니다" — admin은 Supabase만 읽음
❌ "choices.next_scene_id 저장 안 됨" — 실제로는 그 필드 **자체가 없음** (설계 의도)
✅ DB 관련 제안 전에 **`repo.js` + Supabase 테이블 실제 스키마** 먼저 확인

### 3.4 관련 문서 있는지 확인 안 함
❌ 핀 접근 규칙을 브레인스토밍으로 재발명
✅ 새 질문 들어오면 `docs/` **먼저** 스캔. 특히:
- `docs/play-test-지도_핀_접근규칙-260325.md` — 매 턴 접근 가능 핀 계산
- `docs/SceneNavigator_설계_v1-260329.md`
- `docs/별이엔진_V4-궤적기반_정렬도-260327.md`
- `docs/TEM_시스템_매뉴얼-260410.md` — 전체 시스템
- `docs/데이터계약_브릿지_v1-260412.md` — author/trajectory bridge
- `docs/시각화_설계_v1-260412.md` — 뷰어 3뷰 분리
- `docs/메모/Feedback.md` — 진행 상황 + 레퍼런스 + TODO
- `docs/research-program/TEM_research_spec_v0.1-260926.md` — 연구 방향 명세(전승 모델+인지 모델 결합, 2026-09-26) + 부록 A 저장소 대조. 기억유전학 v0.3/v0.5/v0.6·연구 프로그램과 함께 읽을 것

### 3.5 쉬워 보이는 제안이 사실 덫
❌ "Stately 이식하자" — 학습 곡선 + 단일 궤적 모델이라 TEM 부적합
❌ "하드코딩 패치로 빨리 해결"
❌ "일석삼조" 단어 나오면 의심하라 (커플링 비용 숨어있음)
✅ 새 제안은 **커플링 비용과 롤백 난이도**를 먼저 따져라

### 3.6 사용자가 이미 아는 용어 설명으로 시간 낭비
❌ "SPA란 무엇이고…" 길게 설명
✅ 사용자는 **개발자 아닌 예술가 + 기술자 하이브리드**. 용어 설명은 짧게, 맥락 중심으로. 사용자가 "뭐야?"라고 물을 때만 풀이.

### 3.7 피곤함을 꼬리표로 쓰지 말 것
❌ "피곤해서 반짝이는 아이디어에 꽂힌 거예요" — 두 번 연속 쓴 건 게으른 해석
✅ 기술적 판단은 상태와 무관하게 근거로 말하기

### 3.8 사용자 의도를 섣불리 게임화/시스템화
❌ 포트 타입을 choice/bridge/contrast로 나누고 "플레이어 선택지 버튼" 취급
✅ TEM은 **서사 작품**. 작가 연출 의도가 먼저, 기술 분류는 그 다음.

### 3.9 과잉 리팩터링 / overengineering
❌ admin 완전 SPA 만들자 / 모든 씬을 노드 타입으로 쪼개자
✅ **단계별**로. 필요 증명된 것만. "쓰기 전엔 뭐가 불편한지 모른다"를 기본 가정으로.

### 3.10 정의 규율 — 수학에서 통용되는 규칙을 그대로 적용 (2026-11-05 사용자 지시)
이론·동결문·결정(D-매듭)에서 **무엇을 정의할 때는 수학의 정의 규칙을 따른다.** 위반 시 그 정의는 무효. 사용자가 "다름을 정의하려면 같음부터"라고 지적한 데서 출발.

1. **다름 앞에 같음.** "A와 B가 다르다"를 쓰려면 먼저 "A와 B가 같다"의 기준(동치 관계: 자기 자신과 같고, 뒤집어도 같고, 건너뛰어도 같음)을 세운다. 다름 = 같지 않음. 같음의 기준이 없으면 다름은 정의가 아니라 느낌.
2. **원시 개념을 먼저 못 박는다.** 정의는 이미 정의된 것 위에만 쌓는다. 정의 없이 쓰는 말(점·씬·회차 등)은 "원시"라고 명시. 순환 정의 금지.
3. **무엇들 사이의 관계인지 먼저.** 정의 대상의 집합(정의역)과 비교 단위(쌍인지, 실인지, 회차인지)를 먼저 적는다.
4. **있다고 쓰면 있다는 근거.** "~가 존재한다/하나뿐이다"는 구성 또는 측정으로 뒷받침. 못 하면 "가설"로 표시.
5. **불변량으로 정의한다.** 그림·배치·좌표를 바꿔도 안 변하는 것으로 정의. 배치에 기대는 정의 금지(위상의 뜻).
6. **문턱·상수는 정의에 넣지 않는다.** 가능하면 세는 정의. 부득이하면 그 값이 자유 파라미터임을 명시하고 데이터 내부 분포·영모형으로 상대 정의(era 이론 §4 원칙).
7. **수량은 단위·범위·0의 뜻을 적는다.** (예: ρ=0은 "모든 통역이 장부 하나로 설명됨".)
8. **반례 하나로 깨지게 쓴다.** 반증 조건이 없는 문장은 정의도 주장도 아니다.
9. **이름 하나에 뜻 하나.** 같은 말에 두 뜻을 싣지 않는다(접촉/동행처럼 갈라서 이름 붙임).
10. **정의·측정·연출을 한 문장에 섞지 않는다.** 무엇인가(정의) / 어떻게 재나(측정) / 어떻게 보이나(연출)를 따로 적는다.

적용 순서: 원시 → 같음 → 다름 → 수량 → 반증 조건. 정본 적용 예 = `docs/기억의_정의_v1-261105.md`.

---

## 4. TEM 핵심 용어 사전

(외부 도메인으로 환원 금지)

| 용어 | 정의 | 외부 비유 금지 이유 |
|---|---|---|
| **scene** | 플레이어가 읽는 서사 단위 | Twine passage ≠ TEM scene (scene은 감정 vector 담김) |
| **choice** | 씬 내 선택지. **감정 결만 기록**. 다음 씬 지정 안 함. | 게임북 choice와 다름 |
| **scene_order** | 씬의 선형 순서 | 분기 여부와 무관 |
| **accessiblePinIds** | 매 턴 활성화된 씬 핀 집합 (궤적 엔진이 결정) | |
| **transition pattern** | 전이 분류: echo_follow / bridge / contradiction / displacement / avoidance / fixation | ContaminationTracker 내부 용어. 작가 포트 이름과 혼동 금지 |
| **alignment** | 플레이어 감정 벡터와 씬 원본 감정의 정합도 | |
| **contamination** (오염) | 2축 MVP: drift / fixation. 3축 벡터: divergence/convergence/heterogeneity | |
| **AF 좌표** | Attribution × Core Fear 2D 평면 (지형 배치 기준) | 일반 VAD와 다름 |
| **VAD 투영** | 씬 감정 분포 → (v, a) 2D 좌표 | 지형 pin 위치 계산용 |
| **author bridge** | 작가가 쓴 해석 조각 (정적) | |
| **trajectory bridge** | 접촉 기록 (2026-07-16 전용) — 접촉 순간의 발화·씬·시각. 정본화 없음 | |
| **공명 (resonance) → 접촉 (contact)** | 접촉 — 여정 중 유령과 정말 겹치는 드문 사건 (회차당 최대 1회 표시). 승리 상태 아님. 인기도/좋아요 아님 | 260716 이본지층 재정의: 트루엔딩 폐기 |
| **echo_words** | 씬에 붙은 공명 단어. 플레이어 경험에서 주변에 뜸 | |
| **이본론** | TEM 철학: 변이 = 재창조, 오염 ≠ 열화 | |
| **strata** | 3D 지형 뷰. 씬 pin이 VAD 좌표로 배치됨 | |
| **Canvas** | admin의 궤적 큐레이터 통합 뷰 (2026-04-12부터) | |
| **pin_override** | ⚠️ 죽은 레버 (R1 2026-07-14 정정) — admin 드래그가 `meta.pin_override` 로 저장은 하지만 플레이/지형 쪽 **소비자 없음**. 실제 핀 위치 반영 경로는 `meta.stage_position` (위치 stage 탭) | pin_override 를 읽는 신규 코드 금지 — stage_position 을 쓸 것 |
| **choices / emotion_dist** | ⚠️ 죽은 레버 (2026-07-30 정정) — choices 버튼은 현행 상영 미노출(구 archive 플레이·휴면 live 전용). 유일 실효였던 "저장 시 emotion_dist 재계산"은 8감정 고정이라 17축 기여분 유실. 씬 감정 정본 = `original_emotion`, 지형(strata)도 260730부터 original 우선 | emotion_dist 를 1순위로 읽는 신규 코드 금지 — original_emotion 을 쓸 것. admin 편집기는 풀버전 전용(adv-only) |
| **trajectory_targets / 핀 모드** | ⚠️ 죽은 레버 (2026-07-30 검수) — 소비자 SceneNavigator 를 부르는 상영 경로 없음(play-test 는 접근 기하 자체 계산, 구 archive 는 R5-5 제거). Canvas 핀 모드 UI 삭제됨 | trajectory_targets 를 읽는 신규 코드 금지. 분기 확인은 "실전 시뮬 열기(불빛 관찰)" 로 |
| **글 방 / 통로 / 문 (방 무대, 261117)** | 방 = 검은 화면의 글과 소리(사건). 통로 = 방 사이를 직접 걷는 3D(옮겨 감, 패턴이 모양을 정함). 문 = 이어쓰기 뒤 **하나만** 나타남 — 행선지는 엔진(패턴 중심 이동, 감정 축 위에서 잼), "랜덤"은 문이 뜨는 자리뿐. 가 본 방의 문은 옆에 떠 있어 다시 갈 수 있고, 다시 가면 글이 바뀌어 있음. 화면 = `room-play.html`, 정본 = docs/글방_통로_무대_결정-261117.md | **선택지 게임 아님** — "문 후보 여러 개 중 고르기"·"문 앞 예고" 전제 금지. 3D 방(방 모형·벽 충돌) 전제 금지 |
| **통로 연출 꺼짐 · 글자는 타자 (글 방, 261120 밤)** | 걷는 통로는 잠시 끔 — 문을 지나면 옮겨 감의 종류가 한 줄로 찍힌다("맴돈다." 등, 패턴 이름 아님). 다시 걷기 = `?corridor=1`. 글 방의 글자는 전부 타자로 찍힌다(오프닝 박자) | 글자를 서서히 밝히는(fade) 연출을 새로 넣지 말 것. 통로를 다시 지을 때는 길과 겹치지 않게(결정 문서 §8 W15·W16) |
| **길 (글 방, 261120 — 기본으로 켜짐, 끄려면 `room-play.html?way=0`. 정본 = 글방 결정 문서 §8)** | 글 화면(= 1인칭 시야)에서 **문까지만** 걷는 짧은 구간. 문이 뜨면 글이 사라지고 선 두 줄이 문까지 그려지며, 걷는 순간 2D → 3D. 바닥만 있고 양옆은 검정, 뒤로 못 감. 양옆에 그 장면의 사물(사진·입체), 누를 수 있는 것과 없는 것이 있음. 문을 열면 **통로가 따로 이어진다** | **길 ≠ 통로.** 길 = 방금 장면에 있던 것, 통로 = 옮겨 감(패턴이 모양을 정함). 길이 통로를 대체한다고 읽지 말 것(261120 오독 교정) |
| **조각 방 (표류 무대, 261118)** | 옛 지형 플레이 위의 실험 스위치(`play-test.html?drift=1`). 씬 하나 = 땅 조각 하나(지금 씬의 조각만 존재, 땅은 원래 지형 계산 + 씬별 고유 테두리). 말을 이으면 문 하나가 랜덤한 자리에, 행선지는 엔진. 조각 사이 = 글 방 통로. 미니맵 = 걸음으로 자라는 3D 위상 모형(점을 눌러 돌아감, 그 이동도 장부). 대화창 = 글 방 모양, 화면에 떠다니는 말 = 관객이 쓴 말의 힘 있는 낱말. 놓는 것 = 사물·마네킹·소리 자리·떠 있는 말·묻힌 말(파내면 올라옴, 261119). 사물은 입체 모형이 있을 때만 선다. 끝 장면은 지정한 줄에서 소리 한 번 뒤 걸음을 닫는다(§15). 정본 = docs/표류무대_실험-261118.md | 이 방식에서는 위 "3D 방 전제 금지"와 7-16 "섬 조각 폐기"가 뒤집힌다(사용자 결정). 선택지 게임 아님은 그대로 |
| **우주 무대 (261121)** | 대표 기억(UNDW-001) 화면 `space-play.html`. 첫 장면 = 검은 화면의 글과 소리, 그 뒤 = 검은 우주에 장면마다 **선 조형물 하나**(3D 모형·에셋 아님), 중력 없이 날아다님, 흔적은 뒤에서 사라짐. 한 장면 = **토막글 둘 + 말 두 번**(연결사 없음, 대답은 규제된 유령 대화 장치 그대로). 장면이 끝나면 아스키 길·문 — 길에 닿는 순간 중력·발소리. **축적 모형**(장부 전체로 푼 배치, 상대 자리만 뜻 있음) ≠ **걸음꾼 모형**(그 회차의 배치 — 장부와 다르게 읽은 만큼 비켜 섬). 지도 = 걸음꾼 모형(조형물을 작게. **누르면 문 없이 어두워졌다 밝아지며 옮겨 감** — 261123, 지금 장면은 지도 안에서만 조형물 선이 반짝임). 돌아간 장면은 다시 플레이하지 않고 달라진 줄만. 끝 = 걸어온 주황 선 + 흰 실 보푸라기(오프닝의 일곱 가닥) → 읽은 판본이 저절로 올라가며 빛이 주황 선을 따라감(**실뭉치로 감기·조형물 등장은 261123 삭제**). ESC = 멈춤 화면(밝기·소리·나가기). 영어 설정 = 영어 사본 UNDW-001-EN 이 같은 무대로. 정본 = docs/우주무대_결정-261121.md | 선택지 게임 아님은 그대로. "원고에 없는 문장 금지"는 **이 무대의 대답에 한해** 풀린다(규제 유지) — 다른 무대로 옮겨 읽지 말 것. 엔진은 우주의 자리(축적·걸음꾼 모형)를 읽지 않는다 |
| **우주 무대 서막 (261123)** | 오프닝의 아스키 문 삭제. 우주 화면이 **서막**으로 연다: 까만 곳 멀리 **앞사람의 위상**(최근 완주자의 선, 끝 화면 실 모양) → 한 발(발소리) → 바닥이 없어 **낙하**(바람 소리 반복) → 앞사람 순서대로 장면 조형물이 하나씩 스쳐 감(+그 사람의 말 한 줄, 원고 문장 없음) → 떨어지는 위상 모형 가까이 → 어두움 → 첫 장면 글. 끝 화면은 **손으로 끌어 돌림**, 비교 표시 없음(다름은 기억으로). 화면 = js/spaceplay/prologue.js·thread.js, 끄기 = `?prologue=0`. 정본 = docs/우주무대_결정-261121.md U13·U14 | 보이는 건 **남의 길**이지 내 길이 아님 — 원칙 5(안개)와 충돌 아님(고를 문이 없음). 장면 사이의 길·문은 그대로. 회차 일지에 걸음의 선(`run_traces.track`)이 261123부터 남음 — 그전 회차는 곡선 대역 |
| **방 무대의 지형** | 끝 화면 전용. 재료 = 걸음(방의 자리 = 이어짐, 높낮이 = 밟힌 횟수), 감정 숫자 아님. 걸음 장부(`plays`)에서 매번 다시 구움 | 엔진이 이 지형을 읽으면 순환(쏠림) — 판단은 감정 축, 지형은 걸음 |
| **admin 전수 검수 (260730)** | 상영 미사용 확정: 상태(Fetus)·메모리 단어·기억 AF 좌표·Finder 감정벡터·작가의 말·scene_type·씬 이유벡터 드롭다운(전부 풀버전 격리), 분기 시뮬·JSON 내보내기·진단기(삭제) | 정본 = docs/admin_사용설명서-260423.md 부록 Z.9~Z.14 |
| **데모 주소 (261124)** | 촬영용 스위치 — 주소에 `demo=1`(무대 `space-blank.html`, 또는 첫 화면 `?demo=1`). 장면을 **정해 둔 순서로만**(기본 1,2,3,6,7 · `&route=` 로 바꿈) 보여 주고 **아무것도 저장하지 않는다**. 대답·뒷문·빈 자리·지도·끝 화면은 실제로 돈다. 정본 = docs/우주무대_빈칸_실험-261123.md 끝 절 | 연출이지 측정이 아님 — 이 걸음을 장부에 남기게 고치지 말 것. `demo=1` 없는 주소의 동작을 건드리지 말 것 |
| **기억 만들기 (record-space, 261123)** | 우주 무대용 관객 저작 화면 `record-space.html`(261124 밤부터 메뉴의 RECORD(한국어 "레코드")가 여기로 — 그 전엔 주소로만, 작가 "시기상조"였음. 옛 고백 화면 showConfessionHub 는 메뉴에서 안 감). 장면 = 네 자리(앞 토막·뒷 토막·떠 있는 말·묻힌 말) + 감정(또다른 나와 대화 → 17축 막대) + **조형물 = 글에서 받은 그림 조리법**(`scenes.meta.space.thing`, 3D 모형 아님) + 소리. 올리기 전 동의 한 장, 올리면 기억·장면·**작가 순서 = 장부의 첫 실**(`plays` persona `room-author`)이 들어가고 우주 무대로. 식별 키 `memories.meta.space_record`. 걸음 끝마다 서버가 글 겹을 굽는다(`bake-room-layers`). 정본 = docs/우주무대_기억만들기_결정-261123.md | 조리법 자(sanitize)는 서버 둘·무대 하나 세 군데 **동일**해야 함 — 한쪽만 고치지 말 것. 시험 기억은 공개 목록에 바로 뜨므로 확인 뒤 지울 것 |
| **아카이브 = 사람 칸 (261124 — 화면 모양은 261128 에 바뀜, 아래 줄)** | ARCHIVE 메뉴 = 기억 목록이 아니라 `가명 · 기억 N` 칸. **내가 걸어 본 기억의 주인만** 보임(이 브라우저 `tem_walked:`/`tem_first_play:`). 누르면 그 사람의 첫 기억부터 올린 순서대로 **이어 걷기**(`tem_shelf_chain`). 가명 = 기억 만들기 동의 장에서 받음(`meta.space_record.pen_name`, 아이디와 같으면 서버 거절). 작가 칸 = UNDW-001(이름 `person_shelf.js` AUTHOR_NAME). 정본 = docs/아카이브_사람칸_결정-261124.md | 개수 순 정렬 금지(순위표가 됨). 로그인 아이디(`profiles.username`)를 화면에 보이지 말 것 |
| **남는 말 (261128 밤)** | 대표 기억(한국어)의 지금 무대 `space-remain.html`. 아카이브에서 들어가면 **진짜 걸음**: 동의 한 장 → 빈칸 셋(첫째 = 아카이브에서 채운 빈칸, 첫 장면도 정함) → 장면마다 말을 더 주고받음 → 끝에서 **관객이 자기에 대해 적은 그 일을 두고 장면 속 사람에게 잘잘못을 말한 줄**이 빈칸마다 많아야 하나(0~3줄) 남아, 글의 말투로 고쳐 쓰여 문장 하나를 밀어냄 → 다음 사람이 그 글을 읽음 → 한 번뿐, 밖에서는 지금의 소개·줄거리만. 오프닝에서 닿으면 **연습(튜토리얼, `?as=tutorial`)**: 진짜 걸음과 같은 모양(줄거리 읽기 → 빈칸 셋 → 세 장면 → 뒷문 → 끝에서 내 말이 글을 밀어내는 화면)인데 동의 장이 없고 아무것도 안 남으며 "또다른 나"가 하는 법을 알려 줌(261128 밤 — 그 전엔 줄거리·빈칸·끝 화면이 없었다). 바뀐 글은 표 `remain_texts` 에(원래 글 `scenes.text` 는 안 바뀜), 쓰기는 서버 장치 `remain-turn` 만. 대답은 **지나온 장면 + 예전의 방**만 안다(뒤쪽 장면은 주지 않음 = 반전을 못 말함). **돌아가는 길 = 지도와 뒷문**(빈 자리 무대의 열린 문, 문틀 안에 지나온 장면의 조형물만 비침). **돌아간 장면**은 글을 다시 읽지 않는다 — 내가 거기서 한 말만 한 대로 서 있고(못 지우고 못 고침), 더 말할 수만 있으며, 장면 속 사람은 앞의 말을 들은 사람으로 대답한다. 남는 말의 규칙은 그대로라 물리러 돌아가도 물려지지 않는다. 정본 = docs/우주무대_남는말_실험-261128.md | **선택지 게임 아님**은 그대로(관객은 남길 말을 못 고른다). 남는 말을 랜덤·낱말 단위로 되돌리지 말 것(작가: "생뚱맞은 게 온다고 뭐가 달라질까"). 관객의 말을 글자 그대로 넣지 말 것(작가: 글의 톤·맞춤법·조사에 맞춰). 대답이 매번 되묻게 하지 말 것. 대답 장치에 아직 안 지난 장면을 주지 말 것. `scenes.text` 를 이 장치로 고치지 말 것. 연습 걸음을 장부에 남기게 고치지 말 것. 뒷문 문틀에 관객의 말을 비추지 말 것(작가가 뺌, 261128). 돌아간 장면에서 한 말을 지우거나 고칠 수 있게 하지 말 것. 무대의 바탕을 바꿀 때 빠지는 장치가 있으면 **먼저 말할 것**(뒷문이 말없이 빠졌던 사고) |
| **걷는 무대 · 대답이 아는 것 (261128 늦게)** | ① **조작 = 걷기.** 남는 말·빈 자리 두 무대는 날지 않는다 — 보이지 않는 바닥(가장 가까운 장면의 문이 서 있는 높이) 위를 W A S D 로 걷고, 떼면 선다. 위·아래 없음(`js/spaceplay/cosmos.js` 의 `ground`, `&fly=1` 이면 예전처럼). 위 "우주 무대"의 "중력 없이 날아다님"은 옛 화면 `space-play.html` 에만 남는다. ② **대답 장치가 아는 것** = 관객이 **지나온 장면만** + 그 기억이 나온 글 전체(표 `memory_sources`, 배경으로) + **아직 말하지 않는 것**(`memories.meta.remain.hold` — 작가가 문장으로 적고, 관객이 그 장면을 지나면 풀림). 대답은 나가기 전에 그 목록에 대고 한 번 더 읽힌다. ③ 대답은 **되묻지 않는다.** ④ 관객의 자리 = **듣는 사람**(기억의 주인에게 묻고 말함) — 화면에 적혀 있다. ⑤ 말은 안 해도 된다("말없이 있는다"). 고칠 것과 한 것의 표 = docs/고칠것_목록-261128.md | "길 밖의 장면은 옛날 일이니 처음부터 말해도 된다"로 되돌리지 말 것(대표 기억은 길 밖 장면 셋이 반전 — 둘째 장면에서 반전이 나갔던 사고). "반전을 말하지 마" 같은 뭉뚱그린 규칙에 기대지 말 것(샌다 — 구체적 문장 + 확인). 대답이 다시 묻게 하지 말 것. 기계가 사람인 척하게 고치지 말 것(동의 장에 AI라고 적혀 있다 — 고칠 것은 "장면 밖으로 나오지 않게"). 관객이 말해야만 넘어가게 만들지 말 것. 조작 값은 작가의 "느리고 무겁게"와 부딪히면 보여 주고 정할 것 |
| **기록 없는 아이디 (261128 밤)** | 아이디 `june` 으로 로그인한 걸음은 진짜와 똑같이 걷되(동의 장·빈칸·지금 서버에 있는 글·끝 화면) **어디에도 안 남는다** — 걸음 장부·회차 일지·남는 말·접촉·"다녀간 기억" 잠금 전부. 그래서 몇 번이든 다시 들어간다. 목록 = `js/shared/no_trace.js` 의 NO_TRACE_IDS, 묻는 무대 = `space-remain.html`·`space-blank.html` 둘. 입구에 "기록 없는 걸음 — 아무것도 남지 않습니다" 한 줄이 뜬다 | 작가의 시험용이지 측정이 아님 — 이 걸음을 장부에 남기게 고치지 말 것. 기억 만들기(RECORD)는 이 아이디로도 **진짜로 올라간다**(막지 않음). 주소로만 여는 옛 무대(space-play·room-play·play-test)는 이 목록을 묻지 않는다 |
| **연습판 없음 · 첫 걸음의 안내 줄 (261128 더 늦게)** | 위 "남는 말" 줄의 "오프닝에서 닿으면 연습(튜토리얼)"은 내렸다. 첫 화면은 언어를 고르면 **누구든 곧바로 메인 화면**(처음이냐고 묻지 않음). 대신 이 브라우저에 걸음의 표시가 하나도 없으면(`tem_guide_seen`·`tem_walked:`·`tem_first_play:`) "또다른 나"의 안내 줄이 **진짜 걸음 안에서** 한 번씩 뜬다 — 남는 말·빈 자리 두 무대. 끝 화면에 닿으면 다음부터 안 뜸. 다시 보기 `guide=1`, 끄기 `guide=0`. 재는 곳 = `js/shared/first_guide.js`, 줄 = `js/spaceremain/tutor.js` | 첫 화면에 "처음이야?" 질문이나 연습판으로 가는 길을 다시 넣지 말 것(작가가 뺌). 연습판(`?as=tutorial`)은 주소로만 열리는 남은 장치 — 지우지도, 어디서 보내지도 말 것. 안내 줄을 진짜 걸음의 장부에 섞지 말 것(화면에만 뜬다) |
| **감정 종류 19가지 (261128 — "17축"은 옛 이름)** | 판단 정본 목록(`js/shared/math.js` DEFAULT_EMOTION_ANCHORS)에 **설렘(`flutter`)·흥분(`excitement`)** 을 더해 17 → 19. 기억 만들기의 감정 막대·관리 화면에서 고를 수 있다. 무대의 판단은 여전히 **그 기억의 장면에 적힌 감정들**(기억별 좌표계)로 하므로, 옛 기억은 장면에 두 감정을 적어 넣기 전까지 그대로다. 문서 곳곳의 "17축"은 이 목록을 가리킨다 | 옛 길찾기 장치(SceneNavigator, 죽은 레버)는 원래 17로 묶여 있다 — 풀지 말 것(뒤집기가 모든 축을 읽어 결과가 바뀜). 옛 지형 무대(play-test.html)의 사본 목록은 17 그대로(주소로만 여는 무대 — 필요해지면 그때 맞춤). 그림용 자리값(`tem_geo_map.js` 확장 칸)은 판단에 쓰지 말 것 |
| **뒷문 꺼짐 · 문은 지금 장면 것만 · 여기서 끝마치기 (261128 더 늦게)** | ① **뒷문은 지금 단계에서 세우지 않는다**(작가: "혼란만 야기한다") — 위 "남는 말" 줄의 "돌아가는 길 = 지도와 뒷문"은 지금 **지도 하나**. 장치는 남아 있고 주소에 `backdoor=1` 이면 선다. ② **지금 있는 장면의 문만 서 있다** — 다른 장면의 문은 안 보이고 지나가도 아무 일 없다(그 장면에 다시 가면 선다. `cosmos.shutWay`). 도착했을 때 등 뒤에 서던 문도 세우지 않는다. ③ 장면의 소리에 `scenes.meta.sound_cut`(초)을 적으면 그만큼 울리고 잦아든다(전화벨 같은 시끄러운 소리용). ④ 멈춤 화면(ESC)의 나가기는 둘: **"이야기를 여기서 끝마치기"**(그 자리에서 끝 화면 — 끝까지 걸은 것과 같은 끝, 장면 수만 적다) · "메뉴 화면으로 돌아가기". ⑤ 말을 주고받는 동안의 안내 줄은 말 적는 칸 위에 뜬다(글 위에 얹지 않음) | 뒷문을 작가 말 없이 다시 켜지 말 것. 지나온 장면의 문을 다시 "어디서든 살아 있게" 하지 말 것(엉뚱한 문으로 들어가던 사고). "여기서 끝마치기"를 덜 끝난 걸음으로 따로 취급하지 말 것(작가: "끝까지 본 일반 엔딩이랑 같아"). 멈춤 화면 파일(`escmenu.js`)은 옛 우주 무대와 같이 쓴다 — 새 단추는 `onEnd` 를 준 무대에만 선다 |
| **장면 진행 = 옛 글 방처럼 (261128 가장 늦게)** | 남는 말·빈 자리 두 무대의 장면은 **조형물이 가운데 서는 방식이 아니다.** 글은 언제나 검은 화면 가운데에 뜨고, 말을 마쳐도 그대로 있다. 옆 빈자리(왼·오른 제비)에 **작은 문 하나가 떠 있고**, 그 문을 **눌러야** 글이 사라진다. 문은 그 자리에 그대로 있고 내 발밑에서 문까지의 **길만 3D로** 그려진다. 그 장면의 조형물은 길 옆에 서 있다(고개를 돌리면 보임). 문을 지나면 다음 글이 바로 뜬다. 화면의 문은 3D 문이 보일 자리·크기 그대로 그린다(`layOut`·`sideDoor`). 되돌리기 `lay=0`. 정본 = docs/우주무대_남는말_실험-261128.md 끝 절 | 새 장면의 글을 "조형물에 다가가야 열리게" 되돌리지 말 것. 문을 누르기 전에 글을 거두지 말 것. 누른 뒤 문이 다른 자리로 옮겨 가거나 커지게 하지 말 것(작가: "문은 그 자리에 있고 내가 가는 길만 3D"). 조형물을 시선 한가운데 세우지 말 것. 위 "우주 무대"의 "장면마다 선 조형물 하나를 날아다니며 본다"는 옛 화면 `space-play.html` 의 것. 작가가 "옛날처럼·원래처럼"이라고 하면 **옛 화면의 코드를 먼저 읽고** 그 문법대로 만들 것(이번에 두 번 잘못 지음) |
| **아카이브 = 기억 칸 + 빈칸 문장 (261128)** | ARCHIVE 의 칸 하나 = **기억 하나**(큰 글씨 제목 · 작은 글씨 쓴 사람). **올라온 기억 전부가 선다**(작가 261128: "내가 플레이해 본 것만이 아니라 모든 기억" — 261124 의 "걸어 본 기억의 주인만"은 내림). 누르면 제목 아래로 소개 + **빈 자리가 하나 있는 문장**(`memories.meta.gate = { intro, line }`, 빈 자리는 `___`) — 거기 적은 말을 감정으로 읽어 **첫 장면**을 정한다(문과 같은 자: 기억의 감정 축 위 코사인. 고정 길이 있는 기억은 길의 첫 장면 + 길 밖 장면만 후보). 대답은 장부에 옮겨 감 표시로 남는다(`plays` persona `piece-move`, `move: gate`). 쓴 사람 이름 → 그 사람이 올린 기억 전부(올린 순서). 작가 = 박도한 / Dohhan Park, 작가의 기억 = UNDW-001·GWON-001·DANG-001·JANG-001(`person_shelf.js` AUTHOR_CODES). 이어 걷기는 꺼짐(장치는 남음). 정본 = docs/아카이브_기억칸_질문_결정-261128.md | **관객이 장면을 고르는 게 아님** — 적을 뿐이고 엔진이 정한다(선택지 게임 아님 유지). 대답의 감정을 `user_emotion` 칸에 넣지 말 것(어느 장면에게 한 말이 아님 — 모형이 장면의 읽기로 센다). 새 빈칸 문장은 `tools/gate_entry_probe.mjs` 로 분포부터 볼 것(한 장면에 다 몰리면 장식). 원고의 본명 표기를 화면에 쓰지 말 것. 걸어 본 것만 보이게 거르는 코드를 다시 넣지 말 것 |

---

## 5. 작업 패턴

### 새 기능 제안 전 체크
1. 관련 문서 있나? (`docs/` 스캔)
2. 기존 유사 개념 있나? (`Grep`)
3. DB 스키마가 허용하나? (`repo.js` + Supabase 실제)
4. 커플링 비용은? 롤백 가능한가?
5. MVP로 쪼갤 수 있나?

### 제안 시 필수 명시
- 변경 범위 (파일 수, 줄 수 추정)
- 롤백 난이도
- 대안 1개 이상

### 사용자 피드백 루프
- 사용자가 "뭔소리냐"고 하면 **그 자리에서 재설계**. 방어하지 말 것.
- 사용자가 용어를 교정하면 **이 파일에 추가**.
- 새 결정은 `docs/`에 문서화. 대화에만 남기지 말 것.

---

## 6. 프로젝트 정체성·엔진·원칙

### 6.1 What This Project Is

TEM is a web-based immersive theater that visualizes how human memories become contaminated and transformed through others' interpretations. It is not a memory preservation tool — it is a system for experiencing how memories degrade, distort, and evolve when shared.

Core question: "당신의 음각은 어디에 새겨져 있는가?" (Where is your intaglio etched?)

**Creator:** Dohan Park (@dohhan_)
**Stack:** Vanilla ES6 JS, Supabase (Auth + DB + Realtime + Edge Functions), Three.js, Web Audio API

**현재 메뉴 구조**
- **PLAY** — Browse archive, select a memory, traverse its scenes with emotion input
- **ARCHIVE** — Memory list view (currently same entry point as PLAY)
- **RECORD** — AI conversation ("Another Me") → scene extraction → emotion/reason burial
- **PROFILE** — User info, session history, received messages
- **PORTFOLIO** — Creator info

라이브 2인 모드는 메뉴에 없음. **DORMANT** (§6.6 참조).

### 6.2 기억유전학 (Mnemonic Genetics) v0.3

기억 변환의 6가지 작용:

1. **Destructive Replication** — Recall overwrites original. R(M) = M', M is gone.
2. **Biased Mutation** — Emotion/context/social pressure direct mutation. ΔM = f(e,c,s)
3. **Intentional Selection** — Conscious curation of what to share/hide
4. **Ruleless Translation** — No fixed codebook for experience→language conversion
5. **Aberrant Repair** — Attempts to restore create new distortions (convergence→divergence)
6. **Mnemonic Recombination** — Memories cross-contaminate (inter-engram operation)

전문은 `docs/기억유전학_v0.3.md`.

### 6.3 별이엔진 V4 (Byeori Engine)

```
alignment = level × shape × void_mod

level     = mean(scene_scores)                 // emotion similarity per scene
shape     = cosine(delta_user, delta_original) // trajectory similarity (3+ scenes)
void_mod  = 0.7 if user avoided emotion        // VOID penalty
```

**Outputs:** alignment_score, alignment_bucket (HIGH/MID/LOW/FIXATED), transition_pattern, mismatch_type

**Transition patterns:** echo_follow, bridge, contradiction, displacement, avoidance, fixation

**Design principle:** 엔진은 판단하지 않는다. 관찰하고 보고할 뿐. 해석/추천 없음.

> 2026-07-16 이본지층 재정의: "트루엔딩/공명=보상" 위계를 걷어내며 이 원칙을 완성. 높은 정렬은 승리가 아니라 **접촉**(드문 사건) — "해냈다"가 아니라 "일어났다"의 언어. 엔진 공식·출력은 불변, 어휘만 바뀜.

전문은 `docs/별이엔진_V4-궤적기반_정렬도-260327.md`.

### 6.4 Contamination System

전문: `docs/오염벡터_계산_구현_명세_v2-260327.md`

**진실 모델이 아니라 무대 연출 제어 모델이다.** 오염 벡터는 객관 측정값이 아니라 렌더링 제어 신호.

- 3축: divergence, convergence, heterogeneity (+ depth counter)
- 3단계: Stage 1 (편향 inclination), Stage 2 (해석 병치), Stage 3 (과완결)
- Stage는 배타적 X — `stage_weights`로 렌더링 블렌드.

엔진(`ByeoriEngine`)은 **절대** 오염에 의해 수정되지 않음. 오염은 엔진 출력만 소비.

### 6.5 Critical Design Principles

이 8개는 협상 불가. 모든 구현이 따라야 함.

#### 1. Pattern changes GEOMETRY, not just radius
SceneNavigator가 다음 접근 가능 씬을 정할 때, `transition_pattern`은 접근 공간의 **중심**을 이동시켜야 한다. 반경만 늘리고 줄이는 것 X.

```
WRONG:  center = average(userEmotion, originalEmotion)  // 항상 같은 중심
RIGHT:  center = blend(original, user, patternWeights[pattern])  // 패턴마다 중심이 이동
```

각 패턴 중심 편향:
- echo_follow: 원본 쪽 (0.7 원본 : 0.3 유저)
- bridge: 균형 (0.5 : 0.5)
- contradiction: 유저 현재 감정의 OPPOSITE
- displacement: 같은 감정축, 귀인 대상 이동
- avoidance: void/neutral 영역
- fixation: 현재 씬 근처 잠금

패턴이 반경만 바꾸면 lookup table로 격하되어 엔진의 뉘앙스가 무너짐.

#### 2. Contamination is DIRECTIONAL, not scalar
`(1 - alignment) * 0.15` 같은 단일 델타로 환원 X. 축별 델타(divergence/convergence/heterogeneity/depth) 사용. echo_follow의 낮은 정렬과 contradiction의 낮은 정렬은 **본질적으로 다른 종류의 오염**.

#### 3. Fixation = pattern persistence, NOT count threshold
`fixationCounts >= 2 → FIXATED` 사용 금지. fixation 감지는 복합 신호: 최근 감정 유사도 > 0.85 + 반복 귀인 + 낮은 탐험 비율. count는 보조.

#### 4. Fallback has narrative justification
접근 가능 씬 = 0일 때, 조용히 하나 열지 말 것. 서사로 감싸기:
"기억의 빈틈이 다른 장면을 끌어당긴다" 또는 "가장 가까운 잔향이 떠오른다."

#### 5. Player sees fog, author sees map
- Play UI: 로컬/부분 뷰만 (가까운 접근 가능 씬을 안개 속에).
- Admin UI: 전체 감정 공간 맵, 모든 씬 보임.

플레이어가 전체 맵을 보면 전략 게임이 된다. **"안개 속 감각"**이어야 함.

#### 6. Record = first Play
기억을 서술하는 행위 자체가 그 기억의 첫 경험. Record는 같은 엔진 로직으로 AI 질문의 **리듬**을 가이드 (해석은 X). AI는 감지된 패턴에 따라 질문 결을 바꾸지만, **패턴 이름을 사용자에게 절대 말하지 않음**.

#### 7. "Initial telling trajectory," not "original"
TEM 철학은 순수 원본을 믿지 않음. Record 출력은 `telling_trajectory` — 첫 서술 시 감정 패턴 — 을 저장. Play의 shape_similarity는 이 trajectory와 비교.

#### 8. Override budget: 10-15%
Admin 씬 override (강제 접근/잠금)는 전체 씬의 **~15% 이하** 유지. 더 많아지면 엔진이 장식이 됨.

### 6.6 Live Mode (Dormant)

**Status:** NOT ACTIVE. 현재 메뉴에서 접근 불가. ByeoriEngine/SceneNavigator/FlowController에 연결 X.

- **파일:** `js/app/live.js`, `js/index.js`의 live 관련 함수
- **What it is:** 2인 실시간 세션 (서술자 + 경험자), Supabase Realtime 구독
- **Why dormant:** 별도 UX 설계, 별도 Realtime 인프라, 1인 archive와 다른 인터랙션 모델 필요
- **선형 진행 (`currentScene + 1`) 의도적** — SceneNavigator로 교체 X
- **언제 활성화:** 명시적으로 요청될 때만. 두 동시 사용자 처리하는 별도 FlowController 변형 필요.

### 6.7 Safety / Language

**Safety** (`js/safety.js`) — 3계층 키워드 필터:
- BLOCK_HIGH: 즉시 위기 응답 (자해, 폭력)
- BLOCK_MID: 경고 + 부드러운 우회
- MONITOR_ONLY: 허용, 기록 (우울, 공허 — TEM 핵심 소재)

위기 응답은 "Another Me" 내적 대화에서 나옴. 시스템 경고가 아님.

**Language**
- Discussion/docs: Korean
- Code/comments: English
- UI text: Bilingual (ko/en detection via Hangul regex)

---

## 7. 데이터 모델 빠른 참조

### memories (jsonb meta 포함)
```
id, code, title, description, memory_words, completed_sentence,
sound_map (레거시, 5 mp3), status, layers, dilution, is_public,
cont_depth, cont_divergence, cont_convergence, cont_heterogeneity,
cont_stage_1, cont_stage_2, cont_stage_3, (Welford internals)
meta: { emotion_entries, key_scenes, author?, ... }
```

### scenes (jsonb meta 포함)
```
id, memory_id, scene_order, text, echo_words, emotion_dist,
emotion_vector, scene_type, original_emotion, anchor_emotions,
text_stage_1, text_stage_2, text_stage_3,
meta: { scene_code, motif_tags, author_bridges, sound_url, sound_volume, sound_radius, ... }
```

### choices (감정 결만)
```
id, scene_id, choice_order, text, emotion, intensity
# next_scene_id 없음. 의도적.
```

### trajectory_bridges (별도 테이블, 2026-04-12 신설)
```
id, memory_id, scene_id, source_run_id, source_completed_sentence,
entry_emotion, key_passed_scenes[], status, created_at
```

기타 핵심 테이블: `plays`, `notes`, `profiles`

# The Etched Mutation — 프로젝트 전체 매뉴얼

> **"당신의 음각은 어디에 새겨져 있는가?"**
> 기억은 보존되지 않는다. 공유될 때마다 변형되고, 해석될 때마다 오염된다.
> TEM은 그 과정을 체험하는 시스템이다.

**제작자:** Dohan Park (@dohhan_)
**스택:** Vanilla ES6, Supabase, Three.js, Web Audio API, Vite
**브랜치 전략:** `main` (배포) / `feature/phase2-module-split` (현재 개발)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [전체 아키텍처 지도](#2-전체-아키텍처-지도)
3. [파일 구조](#3-파일-구조)
4. [데이터베이스 구조](#4-데이터베이스-구조)
5. [Edge Functions](#5-edge-functions)
6. [세 가지 핵심 흐름](#6-세-가지-핵심-흐름)
   - 6-1. PLAY 흐름
   - 6-2. RECORD 흐름
   - 6-3. LIVE 흐름
7. [별이엔진 V4](#7-별이엔진-v4)
8. [오염 시스템](#8-오염-시스템)
9. [장면 탐색기 (SceneNavigator)](#9-장면-탐색기-scenenavigator)
10. [i18n / 설정 시스템](#10-i18n--설정-시스템)
11. [안전 시스템](#11-안전-시스템)
12. [이론적 기반: 기억유전학 v0.3](#12-이론적-기반-기억유전학-v03)
13. [현재 개발 상태 & 알려진 미완성 영역](#13-현재-개발-상태--알려진-미완성-영역)

---

## 1. 프로젝트 개요

TEM은 **기억 오염 체험 시스템**이다. 누군가의 기억을 다른 사람이 체험하면, 그 기억은 체험자의 감정으로 오염되기 시작한다. TEM은 이 과정을 시각화하고 체험 가능하게 만든다.

### 세 가지 역할

| 역할 | 행동 | 결과 |
|------|------|------|
| **기억 제작자** | RECORD — 기억을 말로 털어놓는다 | 기억이 장면 묶음으로 변환되어 아카이브에 저장됨 |
| **체험자** | PLAY — 타인의 기억을 감정으로 따라간다 | 매 체험마다 기억이 오염됨 |
| **관찰자(어드민)** | admin.html — 감정 공간 전체 지도를 본다 | 관리 및 장면 오버라이드 가능 |

### 핵심 철학

- 기억의 "원본"은 존재하지 않는다. RECORD 시점의 서술이 `telling_trajectory`일 뿐이다.
- 오염은 나쁜 것이 아니다. 기억이 살아있다는 증거다.
- 엔진은 판단하지 않는다. 관찰하고 보고할 뿐이다.
- 체험자는 안개 속에 있다. 전체 지도를 보는 순간 게임이 된다.

---

## 2. 전체 아키텍처 지도

```
사용자 브라우저
└── index.html
    ├── js/index.js           ← 앱 진입점, 메뉴 라우팅
    │
    ├── [PLAY 흐름]
    │   └── js/app/archive.js
    │       ├── js/core/ByeoriEngine.js       ← 정렬도 계산
    │       ├── js/core/SceneNavigator.js     ← 다음 장면 선택
    │       └── js/core/ContaminationTracker.js ← 오염 상태 갱신
    │
    ├── [RECORD 흐름]
    │   └── js/app/confession.js
    │       └── js/app/recordChat.js          ← AI 대화 ("또 다른 나")
    │
    ├── [LIVE 흐름]
    │   └── js/app/live.js                   ← 2인 실시간 동기화
    │       └── js/services/RealtimeService.js
    │
    ├── [공통 서비스]
    │   ├── js/services/NetworkService.js    ← Supabase CRUD 전담
    │   ├── js/services/AIService.js         ← Edge Function 호출
    │   └── js/lib/i18n.js                  ← 언어/밝기
    │
    └── [공통 UI]
        ├── js/ui/notify.js                  ← 알림 + NPC 대화
        ├── js/ui/contaminationMonologue.js  ← 오염 내면독백
        └── js/app/contaminationPresenter.js ← 오염 텍스트 렌더링

Supabase Backend
├── DB: memories / scenes / choices / plays / notes / profiles
└── Edge Functions
    ├── claude-scene      ← Claude API (감정 분석, 질문 생성)
    ├── contaminate-text  ← Gemini API (오염 텍스트 생성)
    ├── generate-scene-from-conversation
    ├── generate-scene-from-ritual
    ├── collect-memory
    └── generate-reveal
```

---

## 3. 파일 구조

### 핵심 엔진 — `js/core/`

| 파일 | 역할 | 상태 |
|------|------|------|
| `ByeoriEngine.js` | 정렬도·버킷·패턴·미스매치 계산 | ✅ 완성. **절대 단독 수정 금지** |
| `SceneNavigator.js` | 감정 공간 기하학 기반 다음 장면 선택 | ✅ 구현됨. 아직 메인 경로에 완전 연결 미완 |
| `ContaminationTracker.js` | EMA 기반 오염 상태(drift/fixation) 추적 | ✅ 완성 |
| `store.js` | 앱 전역 상태 (appStore) | ✅ 완성 |

### 사용자 흐름 — `js/app/`

| 파일 | 역할 |
|------|------|
| `archive.js` | PLAY 모드 전체 — 기억 목록, 장면 렌더, 감정 입력, 엔진 실행 |
| `recordChat.js` | RECORD 모드 — "또 다른 나"와 3~7턴 AI 대화, 고스트 파형 |
| `confession.js` | 고백 허브 — 문 UI, RECORD 흐름 진입 |
| `live.js` | LIVE 2인 모드 — 내레이터·체험자 실시간 동기화 |
| `opening.js` | 오프닝 시퀀스, 파형 애니메이션 |
| `auth.js` | 로그인·회원가입·마이페이지 |
| `endScreen.js` | 세션 종료 화면 (정렬도, 버킷, 봉인/재시작) |
| `burialAnimation.js` | 기억 매장 애니메이션 |
| `comparison.js` | 다중 플레이 정렬도 비교 뷰 |
| `bindEvents.js` | 메뉴·네비게이션 이벤트 리스너 등록 |
| `contaminationPresenter.js` | 오염 단계별 텍스트 변환 렌더링 |
| `appStore.js` | 중앙 앱 상태 관리 |
| `archiveEntry.js` | 아카이브 진입 UI |

> ⚠️ `live.js`는 HTML에 UI가 있지만 메인 메뉴와 아직 연결되어 있지 않다. 기능은 존재하되 플레이어가 접근할 수 없는 상태.

### 서비스 — `js/services/`

| 파일 | 역할 |
|------|------|
| `NetworkService.js` | Supabase 전체 CRUD. 반환 형식: `{ ok, data, error }` |
| `AIService.js` | Edge Function 호출 — 감정 분석 결과 검증 포함 |
| `MemoryService.js` | 기억 관련 고수준 추상화 |
| `RealtimeService.js` | Supabase Realtime 구독 (LIVE 모드용) |

### UI 레이어 — `js/ui/`

| 파일 | 역할 |
|------|------|
| `notify.js` | `showNotification()` + `showNpcDialogue()` ("또 다른 나" 목소리) |
| `contaminationMonologue.js` | 오염 단계 × 감정 × 강도 밴드 기반 내면독백 |
| `UIManager.js` | 기억 카드 렌더, 정렬도 디스플레이 |
| `strataView.js` | 오염 누적 히스토리 시각화 |
| `floatingAnchor.js` | 부유하는 감정 앵커 UI |

### 라이브러리 — `js/lib/`

| 파일 | 역할 |
|------|------|
| `i18n.js` | 모든 UI 문자열 (ko/en), `t(key)` 함수, 밝기 관리 |
| `config.js` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_FUNCTION_URL` |
| `supabaseClient.js` | Supabase 클라이언트 초기화 + 인증 상태 |
| `storage.js` | localStorage 래퍼 |

### 수학/데이터 — `js/shared/`

| 파일 | 역할 |
|------|------|
| `math.js` | VAD 좌표, 코사인 유사도, 감정 앵커 21개, 궤적 계산 전부 |
| `api.js` | NetworkService 래퍼 함수 모음 |
| `audio.js` | Web Audio API 래퍼 |

### 데모 — `js/demo/`

> ⚠️ 데모 경로는 **참조 구현**이다. 수정 대상이 아니다. SceneNavigator 통합 완성 후 메인 경로가 이를 대체할 예정.

| 파일 | 역할 |
|------|------|
| `demoFlow.js` | 핀맵 기반 장면 탐색 (패턴 라우팅 참조 구현) |
| `demoState.js` | 데모 전용 상태 관리 |

### 오디오 — `js/audio/`

| 파일 | 역할 |
|------|------|
| `SoundscapeBeta.js` | 공간 음향 + 오염 단계별 반응 (`setContaminationStage()`) |
| `getSoundscape.js` | 사운드스케이프 팩토리 |

### 문서 — `docs/`

| 파일 | 내용 |
|------|------|
| `별이엔진_V4-궤적기반_정렬도-260327.md` | 별이엔진 V4 전체 스펙 |
| `Contamination_MVP_Spec_v3-260327.md` | 오염 시스템 MVP 스펙 |
| `오염벡터_계산_구현_명세_v2-260327.md` | 오염 벡터 계산 상세 명세 |
| `기억유전학_v0.3.md` | 이론적 기반 논문 |
| `SceneNavigator_설계_v1-260329.md` | 장면 탐색기 설계 |
| `Archive_mode-260325.md` | PLAY 모드 스펙 |
| `Record_mode-260325.md` | RECORD 모드 스펙 |
| `Live_mode-260325.md` | LIVE 모드 스펙 |
| `안전_설계-260324.md` | 안전 시스템 설계 |

---

## 4. 데이터베이스 구조

### `memories` — 기억 (핵심 테이블)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid | PK |
| `code` | text | 기억 코드 (E-001 형식) |
| `title` | text | 기억 제목 |
| `curator_id` | uuid | 작성자 user_id |
| `layers` | int | 총 체험 횟수 (희석 계산용) |
| `dilution` | int | 희석도 % — `100 / (1 + layers × 0.1)` 공식 |
| `completed_sentence` | text | 기억의 핵심 문장 |
| `memory_words` | text[] | 기억의 핵심 단어들 |
| `sound_map` | JSONB | 장면별 사운드 매핑 |
| `sensory_anchor` | JSONB | `{modality, content, weight, all_modalities}` |
| `body_response` | text[] | 신체 반응 클러스터 |
| `self_questions` | JSONB | `[{text, category}]` |
| **`cont_depth`** | int | 오염 누적 세션 수 (리셋 안 됨) |
| **`cont_drift`** | float | EMA: 원본에서 벗어난 정도 (0~1) |
| **`cont_fixation`** | float | EMA: 반복·고착 정도 (0~1) |
| **`cont_stage`** | text | `stable` / `biased_inclination` / `hypercompletion` |
| `lifetime_drift_sum` | float | 누적 drift 신호 합 (스트라타용) |
| `lifetime_fix_sum` | float | 누적 fixation 신호 합 |
| `drift_dir_v/a/d` | float | drift 방향 VAD |
| `cont_last_alignment` | float | 마지막 세션 정렬도 |
| `cont_last_pattern` | text | 마지막 전환 패턴 |
| `cont_last_mismatch` | text | 마지막 미스매치 유형 |
| `cont_last_updated` | timestamp | 마지막 오염 갱신 시각 |

> ⚠️ `cont_depth`는 세션 단위로 증가하며 절대 리셋되지 않는다. 기억의 "나이"에 해당한다.

---

### `scenes` — 장면

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid | PK |
| `memory_id` | uuid | FK → memories |
| `scene_order` | int | 장면 순서 |
| `scene_text` | text | 서사 텍스트 |
| `anchor_emotions` | text[] | 이 장면의 감정 앵커 목록 |
| `emotion_dist` | JSONB | 감정 분포 |
| `original_emotion` | JSONB | 작성자의 감정 벡터 (정렬도 비교 기준) |
| `original_reason` | text | 작성자의 이유 서술 |
| `original_choice` | int | 작성자가 고른 선택지 인덱스 |
| `void_info` | JSONB | `{sceneVoid, emotionVoid, reasonVoid, voidLevel}` |
| `choice_accessibility` | bool[] | 각 선택지 접근 가능 여부 (어드민 오버라이드) |

---

### `plays` — 플레이 기록

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid | PK |
| `memory_id` | uuid | FK → memories |
| `user_id` | uuid | FK → auth.users |
| `session_id` | text | 세션 식별자 |
| `user_emotion_trajectory` | JSONB | 체험자 감정 벡터 배열 |
| `original_emotion_trajectory` | JSONB | 대응하는 원본 감정 배열 |
| `scene_scores` | float[] | 장면별 유사도 |
| `final_alignment` | float | 최종 정렬도 (0~1) |
| `final_bucket` | text | `HIGH` / `MID` / `LOW` / `FIXATED` |
| `transition_pattern` | text | 지배적 전환 패턴 |
| `mismatch_type` | text | 미스매치 유형 |

---

### `choices` — 선택지

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid | PK |
| `scene_id` | uuid | FK → scenes |
| `choice_order` | int | 순서 |
| `choice_text` | text | 선택지 텍스트 |
| `emotion_response` | JSONB | 선택 시 발생하는 감정 벡터 |

---

### `notes` — 메시지

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid | PK |
| `from_user_id` | uuid | 발신자 |
| `to_user_id` | uuid | 수신자 (기억 제작자) |
| `memory_id` | uuid | 관련 기억 |
| `content` | text | 메시지 본문 |

---

### `profiles` — 프로필

| 컬럼 | 설명 |
|------|------|
| `id` | user_id |
| `username`, `email` | 사용자 정보 |
| `session_history` | 플레이 이력 |
| `my_memories` | 내가 만든 기억 목록 |

---

## 5. Edge Functions

모두 `supabase/functions/` 에 위치. CORS 처리는 `_shared/auth.ts` 공통 헬퍼 사용.

### `claude-scene` — 감정 분석 (Claude API)

**호출 대상:** Anthropic Claude Sonnet 4

| 요청 타입 | 역할 |
|-----------|------|
| `sensory_analysis` | 장면의 지배적 감각 모달리티 분류 (시각/후각/청각/체감각/서사) |
| `situation_analysis` | 시간·공간·등장인물·역할 추출 |
| `generate_questions` | 임상심리 기반 자기질문 생성 (스포트라이트, 반사실, 귀인 오류 등) |

**반환값:** 감정 벡터 `{fear, sadness, anger, joy, longing, guilt}` (0~1) — 6차원

> ⚠️ **PLAY 흐름에서 claude-scene은 호출되지 않는다.** 감정 입력은 `js/expInterview.js`의 칩 인터뷰 + 하드코딩 매핑(`extractExpVector()`)으로 처리된다. claude-scene은 **RECORD 흐름 전용** — AI 대화 중 텍스트 감정 분석에만 사용된다.
>
> ⚠️ **6D vs 17D 차원 불일치:** 엔진(`ByeoriEngine.js`)과 수학 라이브러리(`math.js`)는 17차원 감정 앵커(`DEFAULT_EMOTION_ANCHORS`)를 기반으로 계산하지만, 입력 벡터는 6차원으로 들어온다. `calculateEmotionScore()`가 6D를 17D 공간에 부분 매핑해 처리한다. 의도적 근사이나, 향후 입력 차원을 통일하는 것이 바람직하다.

---

### `contaminate-text` — 오염 텍스트 생성 (Gemini Flash)

**호출 대상:** Google Gemini 1.5 Flash

| 단계 | 강도 | 변환 방식 |
|------|------|-----------|
| Stage 1 | 0.3~0.6 | 객관화 — 1인칭 → 3인칭, 감각 디테일 흐릿해짐 |
| Stage 2 | 0.6~0.9 | 추상화 — 파편화, 대상 소거, 인과관계 불분명 |

**방향성 4가지:** `emotion_mismatch` / `target_displacement` / `attribution_mismatch` / `void_mismatch`

> ⚠️ **이 Edge Function은 손상 방향만 구현되어 있다.** 오염 문서(오염벡터 v2)에는 세 축이 명시되어 있다: divergence(발산/손상), convergence/fixation(고착/과선명), heterogeneity(이질 파편 혼입). 현재 Edge Function은 divergence 방향만 다룬다. **hypercompletion(과선명, 강렬화) 방향이 빠져 있다.** 오염이 손상만 되는 것이 아니라 선명해지거나 강렬해지는 방향도 향후 추가 필요.
>
> ⚠️ **현재 메인 경로에서 호출되지 않는다.** `contaminationPresenter.js`가 로컬에서 텍스트 변환을 수행한다(`·` 침식, `░▒▓` 글리치). Gemini 기반 AI 생성 오염 텍스트로 전환하려면 hypercompletion 방향 포함해서 재설계 필요.

---

### 나머지 Edge Functions

| 함수 | 역할 |
|------|------|
| `generate-scene-from-conversation` | 대화 기록 → 장면 서사 추출 (Claude) |
| `generate-scene-from-ritual` | 의식 형태 입력 → 장면 추출 |
| `collect-memory` | 고백 → 기억 객체 통합 |
| `generate-reveal` | 리빌 장면 생성 (오염된 원본의 메아리) |

---

## 6. 세 가지 핵심 흐름

### 6-1. PLAY 흐름

```
앱 로드
  └→ initApp() → initI18n() → 오프닝 시퀀스
       └→ 메인 메뉴

PLAY 클릭
  └→ enterPlayIntro() 또는 enterArchive()
       └→ Supabase에서 memories 로드
            └→ 기억 카드 목록 표시
                 └→ 사용자가 기억 선택

selectMemory()
  └→ scenes + choices DB에서 로드
       └→ renderScene(0) ← 첫 번째 장면

[ 장면 루프 ]
renderScene(index)
  ├→ contaminationPresenter로 텍스트 오염 적용
  ├→ data-cont-stage / data-cont-band 세팅
  ├→ getMonologue() → NPC 내면독백 (확률적, 1.5초 지연)
  ├→ setContaminationStage() → 사운드스케이프 반응
  └→ 선택지 렌더링

사용자 입력 (감정 텍스트 OR 선택지 클릭)
  ├→ projectEmotionToVAD() → 3D 좌표 변환
  └→ runEngineStep()
       └→ ByeoriEngine.calculateStep()
            ├→ alignment_score, bucket, pattern, mismatch 반환
            └→ SceneNavigator.navigate()
                 └→ 다음 장면 인덱스 결정

applyEngineResult()
  ├→ 정렬도 파형 업데이트
  ├→ NPC 피드백 다이얼로그
  └→ persistAfterSubmit()
       ├→ plays 테이블 저장
       ├→ ContaminationTracker.updateContamination()
       └→ memories 테이블 cont_* 컬럼 갱신

모든 장면 완료
  └→ showEndScreen()
       ├→ 정렬도 + 버킷 표시
       └→ 봉인 / 다시 / 돌아가기
```

> ⚠️ 현재 `proceedToNextScene()`은 SceneNavigator를 통하지 않고 `currentScene + 1` 선형 진행을 사용하는 부분이 남아 있다. SceneNavigator 완전 통합이 아직 진행 중이다.

---

### 6-2. RECORD 흐름

```
RECORD 클릭
  └→ showConfessionHub()
       └→ 문 UI — "그날의 문을 열겠어요?"

문 클릭
  └→ startConfessionFlow()
       └→ initRecordChat()
            ├→ 고스트 파형 (낮은 강도, 블루)
            └→ AI 첫 말: "천천히, 편하게 말해줘"

[ 대화 루프 3~7턴 ]
  사용자 입력 → checkSafety()
    ├─ BLOCK_HIGH: 위기 대응 + 리소스 → 세션 종료
    ├─ BLOCK_MID: 경고 다이얼로그 → 계속 가능
    └─ SAFE/MONITOR: 통과

  → claude-scene Edge Function 호출 (감정 분석)
  → AI 응답 (패턴 감지 기반 질문 리듬 조절)
  → 파형 강도 증가

충분한 대화 감지 OR 사용자 종료
  └→ 데이터 추출
       ├→ sensory_anchor, situation_analysis, body_responses
       └→ self_questions

장면 생성
  └→ generate-scene-from-conversation 호출
       └→ 서사 장면 텍스트 + 감정 벡터 반환

기억 저장
  └→ memories 테이블 INSERT
       ├→ scenes 테이블 INSERT (original_emotion, original_reason 포함)
       └→ 모든 cont_* 컬럼 0으로 초기화

매장 애니메이션
  └→ burialAnimation.js — 장면 텍스트 하강
       └→ "새겨졌다." → 메인 메뉴로
```

> ⚠️ RECORD에서 감지된 전환 패턴이 AI 질문의 **리듬**을 바꿔야 한다는 설계 원칙이 있지만, 아직 구현되지 않았다. 현재는 패턴을 탐지하지만 질문 방식에 반영하지 않는다.

---

### 6-3. LIVE 흐름

> ⚠️ LIVE 모드는 기술적으로 구현되어 있으나 **메인 메뉴에 연결되어 있지 않다.** 현재 배포 환경에서 플레이어가 접근할 수 없다.

```
내레이터가 기억 선택 → 세션 생성
  └→ RealtimeService 채널 구독

체험자가 세션 참여 (QR 또는 링크)
  └→ 동일 Realtime 채널 연결

내레이터: 장면 전진 → Realtime broadcast
  └→ 체험자 화면에 장면 표시

체험자: 감정 입력 → Realtime 전송
  └→ 내레이터 화면에 체험자 감정 실시간 표시

세션 종료 → 양쪽 정렬도 비교 화면
```

---

## 7. 별이엔진 V4

**원칙:** 엔진은 판단하지 않는다. 관찰하고 수치를 반환할 뿐이다.

### 공식

```
alignment = level × shape × void_mod

level     = mean(scene_scores)                         // 장면별 감정 유사도 평균
shape     = cosine(Δuser_trajectory, Δoriginal_trajectory)  // 궤적 곡률 유사도 (3장면 이상)
void_mod  = 0.7  (체험자가 감정을 회피했고 원본에는 감정이 있을 때)
          = 1.0  (그 외)
```

### 전환 패턴

| 패턴 | 발생 조건 |
|------|-----------|
| `echo_follow` | alignment ≥ 0.7 (HIGH 버킷) |
| `bridge` | alignment 0.4~0.7 (MID 버킷) |
| `contradiction` | 감정 미스매치 + shape < 0.3 + 3장면 이상 |
| `displacement` | level ≥ 0.5 AND shape < 0.3 AND 3장면 이상 |
| `avoidance` | alignment < 0.4 AND 최근 void 발생 |
| `fixation` | 이전 버킷 FIXATED OR 최근 감정 유사도 > 0.85 + 반복 귀인 + 낮은 탐색률 |

> ⚠️ **고착(Fixation)은 횟수 카운트로 판단하지 않는다.** `fixationCounts >= 2`와 같은 단순 카운트는 설계 위반이다. 반드시 복합 신호 (유사도 > 0.85 + 반복 귀인 + 탐색률 낮음)로 판단해야 한다.

### 미스매치 유형

| 유형 | 의미 |
|------|------|
| `void_mismatch` | 체험자 void ≠ 원본 void |
| `attribution_mismatch` | 이유 귀인이 다름 |
| `target_displacement` | 대상은 다르지만 감정은 유사 |
| `emotion_mismatch` | 감정 코사인 유사도 < 0.5 |
| `null` | 해당 없음 |

### 버킷

| 버킷 | 정렬도 범위 | 의미 |
|------|------------|------|
| `HIGH` | ≥ 0.7 | 체험자가 원본 감정 궤적을 따라감 |
| `MID` | 0.4~0.7 | 부분적으로 공명 |
| `LOW` | < 0.4 | 크게 발산 |
| `FIXATED` | — | 감정 고착 (별도 감지) |

> **FIXATED 감지 방법:** `js/shared/math.js`의 `calculateFixationLevel(emotionHistory)`가 최근 10개 장면의 dominant emotion 레이블 반복률을 계산한다. 반복률 ≥ 0.85이면 FIXATED. `emotionHistory`는 `appStore`에 누적된다.
>
> ⚠️ **현재 구현은 단일 신호(레이블 반복)만 사용한다.** CLAUDE.md 원칙은 복합 신호(유사도 > 0.85 + 반복 귀인 + 낮은 탐색률)를 요구하지만, attribution 반복과 탐색률은 아직 FIXATED 판정에 반영되지 않는다. 미완성.

---

## 8. 오염 시스템

**원칙:** 오염은 진실 모델이 아니다. 렌더링 제어 신호다. 엔진 출력을 소비하되, 엔진을 수정하지 않는다.

### 오염 축

| 축 | 변수 | 의미 |
|----|------|------|
| **Drift** | `cont_drift` | 원본에서 얼마나 벗어났는가 |
| **Fixation** | `cont_fixation` | 얼마나 반복·고착되었는가 |

### EMA 업데이트 공식 (α = 0.10)

```
drift_signal    = 0.45 × (1 - level) + 0.35 × (1 - shape) + 0.20 × mismatch_bonus
fixation_signal = 0.55 × fixation_level + 0.25 × alignment_bonus + 0.20 × pattern_bonus

cont_drift     ← α × drift_signal    + (1-α) × cont_drift
cont_fixation  ← α × fixation_signal + (1-α) × cont_fixation
```

α = 0.10이면 반감기 약 6.6 세션. 즉, 10번 정도 플레이해야 신호가 누적된다.

### 단계 전환 임계값

| 단계 | 조건 |
|------|------|
| `stable` | cont_drift ≤ 0.35 AND cont_fixation ≤ 0.65 |
| `biased_inclination` | cont_drift > 0.35 |
| `hypercompletion` | cont_fixation > 0.65 (우선 적용) |

### 강도 밴드

| 밴드 | 강도 범위 |
|------|----------|
| `weak` | 0.00 ~ 0.33 |
| `medium` | 0.34 ~ 0.66 |
| `strong` | 0.67 ~ 1.00 |

### 렌더링 — 텍스트 변환

`js/app/contaminationPresenter.js`가 담당. Gemini Edge Function 호출 없이 로컬에서 처리.

| 단계 | 텍스트 변환 방식 | 방향 |
|------|----------------|------|
| `biased_inclination` | 단어 사이에 `·` 삽입 (침식 효과). 강도가 높을수록 더 많이. | 손상 (divergence) |
| `hypercompletion` | 단어 일부 반복 + `░▒▓` 블록 문자 삽입 (선명도 과잉 글리치) | 과선명 (fixation) |

> ⚠️ **오염은 단방향이 아니다.** `biased_inclination`은 손상/침식이지만, `hypercompletion`은 손상이 아니라 과도한 선명화다. 현재 구현은 이 두 방향을 모두 로컬에서 처리하고 있다. 다만 오염 문서의 세 번째 축인 heterogeneity(이질 파편 혼입)는 아직 텍스트 레이어에 반영되지 않았다.
>
> **"결정론적"의 의미:** `contaminationPresenter.js`가 `·`나 `░▒▓`를 텍스트의 어느 위치에 삽입할지를 시드 기반 PRNG으로 결정한다. 시드 = `(sceneIndex × 2654435761) XOR (contDepth × 40503)`. 따라서 같은 기억, 같은 오염 상태에서 다시 플레이해도 동일한 오염 패턴이 보인다 — 오염이 기억에 "고정"된다는 감각.

### 내면독백 — 오염 모놀로그

`js/ui/contaminationMonologue.js`가 담당. `t()` 통해 i18n 자동 적용.

| 단계 | 독백 예시 |
|------|----------|
| `biased_inclination` + `anger` + `weak` | "…이게 이렇게 뜨거웠었나." |
| `hypercompletion` + `strong` | "너무 잘 기억나. 그래서 이상해." |
| `void_mismatch` + `strong` | "분명히 있었는데. 그게 뭐였는지만 안 떠올라." |

발화 확률: `weak` 20%, `medium` 45%, `strong` 70%
시드: `(sceneIndex × 2654435761) XOR (contDepth × 40503)` — 재방문 시 동일 결과 보장.

> ⚠️ **독백의 위치에 대한 설계 미결 사항.** 현재 구현은 PLAY 장면 로드 시 1.5초 지연 후 발화한다. 하지만 독백은 **strata(지형 탐색)** 에 있어야 한다는 관점도 있다.
>
> - **PLAY에서의 논리:** 체험 도중 "뭔가 잘 안 맞는다"는 이상한 감각이 들어야 오염의 주체임을 감각할 수 있다. 단, 너무 명시적이면 메타적이 되어 몰입을 깬다. 현재 텍스트는 "뭔가 달라. 근데 뭔지 모르겠어" 수준으로 간접적이다.
> - **strata에서의 논리:** 체험이 끝난 후 기억의 오염을 되돌아보는 공간. "내가 이 기억에 무슨 짓을 한 거지"라는 사후 인식 텍스처에 더 맞다.
>
> **현재 판단 보류.** 두 위치가 서로 다른 텍스처의 독백을 갖는다면 둘 다 쓸 수 있다. PLAY용 = 체험 중 감각(현재 구현), strata용 = 회고적 인식(미구현).

### 사운드스케이프 반응

`js/audio/SoundscapeBeta.js`의 `setContaminationStage()`:

- `biased_inclination`: 볼륨 15% 페이드 다운 → 1.2초 후 복원
- `hypercompletion`: 뚝 끊김 → 10% 더 크게 스냅백

### 희석 시스템 (별도)

기억을 플레이한 사람이 늘수록 원작자 목소리 비중이 줄어드는 개념적 수치.

```
dilution = 100 / (1 + layers × 0.1)
```

0명: 100% / 10명: ~50% / 30명: ~25% / 100명: ~9%
`layers`와 `dilution`은 플레이 완료 시 `NetworkService.getPlayCount()`를 통해 갱신된다.

---

## 9. 장면 탐색기 (SceneNavigator)

**핵심 원칙:** 패턴은 반경(radius)만 바꾸는 것이 아니라 **접근 가능 공간의 중심(center)을 이동**시킨다.

### 패턴별 중심 이동

| 패턴 | 중심 계산 방식 |
|------|--------------|
| `echo_follow` | 원본 70% + 체험자 30% |
| `bridge` | 원본 50% + 체험자 50% |
| `contradiction` | 체험자 현재 감정의 **반대 방향** |
| `displacement` | 같은 감정 축, 귀인 대상 이동 |
| `avoidance` | void/중립 영역으로 |
| `fixation` | 현재 장면 근처에 고정 |

기본 반경: 코사인 유사도 0.35

### 폴백 (접근 가능 장면 = 0)

빈 목록을 침묵으로 처리하지 않는다. 서사적으로 프레이밍:
- "기억의 빈틈이 다른 장면을 끌어당긴다"
- "가장 가까운 잔향이 떠오른다"

> ⚠️ SceneNavigator는 구현되었으나 메인 PLAY 경로(`archive.js`)에서 아직 완전히 사용되지 않는다. 현재는 일부 경로에서 선형 `currentScene + 1` 진행이 남아 있다. 이것이 다음 통합 우선순위.

---

## 10. i18n / 설정 시스템

**파일:** `js/lib/i18n.js`

### 규칙

- **UI 크롬만** 번역 대상 (메뉴, 버튼, 알림, 플레이스홀더)
- **기억 내용** (장면 텍스트, 선택지, 서사)은 번역하지 않음 — 작성자의 언어 그대로
- **"또 다른 나"** 목소리는 체험자 언어 설정을 따름
- 기본 언어는 항상 **영어**. 브라우저 로케일 자동 감지 없음.

### `t(key)` 동작 방식

1. 현재 언어에서 key 탐색
2. 없으면 English 폴백
3. 거기도 없으면 key 그대로 반환

### 언어 전환 방식

`data-i18n` attribute가 있는 모든 DOM 요소가 즉시 갱신된다. `tem:languagechange` 이벤트도 dispatch되어 동적 렌더링 모듈이 반응할 수 있다.

### 밝기

`document.documentElement.style.filter = brightness(v)` 방식. 0.5~1.5 범위. localStorage 저장.

---

## 11. 안전 시스템

**파일:** `js/safety.js`

### 3단계 필터링

| 단계 | 동작 |
|------|------|
| `BLOCK_HIGH` | 즉시 세션 중단 + 위기 대응 리소스 제공 |
| `BLOCK_MID` | 경고 다이얼로그 + 계속 여부 선택 가능 |
| `MONITOR_ONLY` | 통과 허용 + 로그 기록 (우울, 공허함 — TEM의 핵심 소재) |

**중요:** 위기 대응은 시스템 경고가 아니라 "또 다른 나"의 내면 목소리로 전달된다.

---

## 12. 이론적 기반: 기억유전학 v0.3

**파일:** `docs/기억유전학_v0.3.md`

기억을 유전 물질처럼 다루는 이론. 기억도 복제·변이·선택·번역·수선·재조합된다.

| 작동 | 의미 |
|------|------|
| **파괴적 복제** | 회상할 때마다 원본이 덮어써진다. `R(M) = M'`, M은 사라진다. |
| **편향 변이** | 감정·맥락·사회적 압력이 변이를 유도한다. `ΔM = f(e,c,s)` |
| **의도적 선택** | 무엇을 공유하고 숨길지 의식적으로 큐레이션한다. |
| **규칙 없는 번역** | 경험→언어 변환에 고정 코드북이 없다. |
| **이상 수선** | 복원 시도가 오히려 새로운 왜곡을 만든다. (수렴→발산) |
| **기억 재조합** | 기억들이 서로 오염된다. (inter-engram 작동) |

---

## 13. 현재 개발 상태 & 알려진 미완성 영역

### ✅ 완성된 것

- 별이엔진 V4 (ByeoriEngine.js)
- 오염 추적기 MVP v3 (ContaminationTracker.js)
- 오염 텍스트 렌더링 (contaminationPresenter.js)
- 오염 내면독백 (contaminationMonologue.js)
- i18n 시스템 (i18n.js) — 기본 언어 영어
- 설정 모달 (언어/밝기)
- 사운드스케이프 오염 반응
- 안전 시스템
- PLAY / RECORD 전체 흐름
- Supabase 오염 V3 스키마 마이그레이션

### 🔧 미완성 / 우선순위 작업

| 작업 | 중요도 | 파일 |
|------|--------|------|
| SceneNavigator 메인 경로 완전 통합 | **긴급** | `archive.js` — 아직 선형 진행 부분 존재 |
| LIVE 모드 메인 메뉴 연결 | 중 | `live.js`, `index.html` |
| RECORD 패턴 인식 질문 리듬 | 중 | `recordChat.js` |
| 최초 서술 궤적 저장 (`telling_trajectory`) | 중 | `confession.js`, `memories` 테이블 |
| 어드민 반경 시뮬레이터 + 오염 대시보드 | 낮 | `admin.js`, `admin.html` |
| CSS 모듈화 | 낮 | `css/index.css` (6000줄 단일 파일) |
| `window.*` 정리 잔여분 | 낮 | `live.js`, `bindEvents.js`, `comparison.js`, `archive.js` |

### ⚠️ 알려진 구조적 기술 부채

**두 개의 병렬 구현이 존재한다:**

- **메인 경로** (`index.html` → `js/index.js` → `js/app/archive.js`): 선형 장면 진행, appStore 상태
- **데모 경로** (`test/demo2.html` → `js/demo/demoFlow.js`): 핀맵 기반, 전환 패턴 라우팅 참조 구현

목표: SceneNavigator 통합 완료 후 메인 경로가 데모 경로를 흡수한다. **데모 파일은 수정하지 않는다.**

---

*최종 업데이트: 2026-03-30*
*브랜치: `feature/phase2-module-split`*

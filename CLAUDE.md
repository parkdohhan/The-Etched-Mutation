# CLAUDE.md — TEM 작업 가이드

> Claude Code가 이 프로젝트에서 작업할 때 자동 로드되는 단일 가이드.
> 최상단 "즉시 적용 규칙"이 최우선.

---

## 1. 즉시 적용 규칙

**최우선**
1.**사용자는 코드용어, 파일이름, 영어를 모른다** html, css, 고유명사같이 번역할수없는 용어를 제외하고는 한국어로 풀어서 초등학생도 알아듣도록 자세히 예시를 들어 설명한다. 
2.자세한 설명과 예시를 드는 과정중에서 누락되는 정보는 없어야한다. 만약 쉽게 설명할수없다면 맨 마지막에 추가하라.

사용자가 "뭐라는거야 다시 설명해" 라고 말하게되는일은 없어야하고, 그런일이 생길경우 바로 "대가리박겠습니다. 제가 애미애비없는 고아새끼라 그랬습니다. 노여움을 풀어주십시오오오." 라고 출력한다.
작업을 시작하기 *전*에 다음 두 자리를 자세히 설명한다.

### 1.1 작업 시작 전 설명 의무

1. **무슨 작업인가** — 어디 파일을 어떻게 고치는지, 신규 박는 거면 어떤 모양인지. 영문/약어/툴 이름만 박고 끝내지 말 것.
2. **끝나면 어떻게 되는가** — 그 작업 끝나면 시스템이 어떻게 변하는지, 사용자가 뭘 새로 볼 수 있게 되는지, 다음 자리는 무엇이 풀리는지. 실제 예시를 들어 설명한다.

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
| **admin 전수 검수 (260730)** | 상영 미사용 확정: 상태(Fetus)·메모리 단어·기억 AF 좌표·Finder 감정벡터·작가의 말·scene_type·씬 이유벡터 드롭다운(전부 풀버전 격리), 분기 시뮬·JSON 내보내기·진단기(삭제) | 정본 = docs/admin_사용설명서-260423.md 부록 Z.9~Z.14 |

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

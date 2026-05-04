# 유령 대화 — ego-state turn-taking 차용 (260504)

> 작성: 2026-05-04
> 상태: 결정 초안. 5-2 사용자 본인 결정 (`maxFreeDialogTurns: 1`) 의 5-4 번복.
> 관련 코드: [js/ui/lumen_dialog_phase1.js](../js/ui/lumen_dialog_phase1.js)
> 관련 SCOPE: [docs/LUMEN_DEMO_SCOPE-260429.md](LUMEN_DEMO_SCOPE-260429.md) V2.1
> 관련 기존 자산: [docs/유령시스템_확정_v1-260418.md](유령시스템_확정_v1-260418.md)

---

## 0. 한 줄

V2.1 멀티턴 대화의 약함을 **임상 ego-state therapy 의 듣고 응답하는 turn-taking 구조 하나만** 차용해서 푼다. 프레임(통합/치유/병리)은 안 빌린다. 마감 5-19 영향 없음.

---

## 1. 진단 — 현재 플로우 약점

### 1.1 현재 한 씬 흐름 (코드)

[js/ui/lumen_dialog_phase1.js:357](../js/ui/lumen_dialog_phase1.js#L357) 기준:
```
1. ghost_intro          작가 박은 정해진 1줄
2. choice_select        플레이어 버튼 3개 중 클릭
3. choice_reply         작가 박은 choice별 정해진 응답
4. free_dialog_open     작가 박은 정해진 첫 질문
5. free_dialog (1턴)    플레이어 자유 텍스트 한 줄
6. urge                 alignment 점수로 풀 픽 (입력 내용 안 봄)
7. scene_link prompt    시스템 메타 한 줄
8. scene_link input     플레이어 자유 텍스트 한 줄
```

`maxFreeDialogTurns: 1` ([lumen_dialog_phase1.js:44](../js/ui/lumen_dialog_phase1.js#L44)) — 5-2 결정 ("단일턴이 작품 톤에 더 맞음"). 본 문서가 번복 자료.

### 1.2 약점 4가지

**(가) 유령이 안 듣는다.** 1·3·4번이 작가 대본 그대로. 6번도 풀 픽이지만 alignment *점수*만 보지 입력 *내용*은 안 봄. 즉 플레이어 5번 자유 텍스트는 *어디에도 응답되지 않는다*.

**(나) "유령과 대화"가 아니라 "장면 옆에 글짓기 보태기"가 됨.** 유령이 듣지 않으니 플레이어 자유 텍스트는 유령에게 말 거는 게 아니라 *작가가 만든 장면 옆에 내 한 줄 더하기*가 됨. 작가의 ghostwriter 모드.

**(다) drift 가시화가 회차 안에서 안 일어남.** 1턴 한정이라 변형 펄스 1회·풀 픽 1회. 본인이 회차 도중 "어, 같은 유령이 다르게 말하네" 체험할 자리 0개.

**(라) 작품 명제 §2 ("관객이 자기 기억 확신을 잃고 나온다") 의 마찰점이 없다.** 흔들림은 *대화 상대와의 마찰*에서 나오는데, 마찰이 없음. 대본 옆에 한 줄 보탠 사람은 흔들리지 않음.

---

## 2. 보완 — ego-state turn-taking 차용

### 2.1 차용·거부 분리

**차용**: parts dialogue 의 *turn-taking 구조 하나*. "part가 환자 말을 듣고 응답한다."

**거부**: 통합(integration) 목적, 치유 어휘, fixation 병리화, "치료 시뮬레이터" 프레이밍.

거부 근거:
- 메모리 [feedback_avoid_authorial_control_framing] — 작가 통제·치유를 정체성으로 포장 X
- [CLAUDE.md](../CLAUDE.md) §6.5 #3 — fixation 가치중립
- 작품 명제 §2 화살표 = 임상 화살표의 *거꾸로* (§4 참조)

### 2.2 변경 항목

| 자리 | 현재 | 차용 후 |
|---|---|---|
| `maxFreeDialogTurns` | 1 | **3** |
| ghost_intro | 작가 박은 1줄 | **회상 실패자 그라운딩 풀** 5~6 (감각 닻 — 비/냄새/온도/공기 톤) |
| choice_reply | 작가 박은 1줄 | **choice별 변주 풀** 2~3 |
| free_dialog_open | 작가 박은 1줄 | **choice 결과 + 시작 alignment 기반 풀 픽**. "너는 봤어?" 같은 호명 자리 박힘 |
| 매 턴 유령 응답 | (없음, 1턴이라) | `pickResponse({alignment, playerInput})` — alignment HIGH/MID/LOW 풀 픽 |
| drift 누적 가시화 | 다음 회차 가야 | **이번 회차 안** (3턴 응답 결 누적, MID→HIGH 톤 변화) |
| 호명 자리 | 없음 | 2~3회 ("너는 봤어?", "너도 그 자리에 있었어?") |

### 2.3 인프라 — 이미 박혀있는 자산

- [`LumenGhostResponse.pickResponse({memoryId, sceneId, turn, alignment, playerInput})`](../js/ui/lumen_ghost_response.js) — 이미 존재
- `_analyzeEmotion → cosineSim → alignment` ([lumen_dialog_phase1.js:265](../js/ui/lumen_dialog_phase1.js#L265)) — 이미 존재
- `pickResponse` 풀 = V2-10 콘텐츠 작업이 박을 자리

→ 코드 인프라 거의 그대로. **콘텐츠 *구조*만 바뀜.** 분량은 비슷.

---

## 3. 예시 시나리오

### 3.0 씬 가정

- **메모리**: "비 오는 날 그 사람을 마지막으로 본 기억"
- **씬**: 우산을 든 사람을 멀리서 본 anchor 씬
- **유령 타입**: Core (anchor) — 감각 먼저, 본 대로
- **원본 감정**: 슬픔 + 그리움. 우산 검은색. 비 막 그칠 때.

### 3.1 시나리오 A — 현재 흐름

```
[유령]   "그 우산이 어디 갔더라."           ← 작가 박은 정해진 1줄
[시스템] (버튼 3개 표시)
         · 당신이 들고 있던 거 아니야?
         · 비가 그쳐서 두고 갔잖아.
         · ...
[플레이어] 첫 번째 버튼 클릭
[유령]   "내가? ...그랬나."                ← 작가 박은 choice별 응답
[유령]   "그게 무슨 색이었더라."           ← 작가 박은 정해진 첫 질문
[플레이어 입력 1턴]
         "검은색이었던 거 같아. 손잡이가 나무로 된."
[유령]   "...그래. 그랬을지도."            ← alignment 점수로 풀 픽 (입력 내용 안 봄)
[시스템] (회색 메타) "한 줄 남겨."
[플레이어 입력]
         "아직도 비 오는 날엔 그 우산이 떠올라."
→ 다음 씬
```

플레이어가 한 일: 버튼 1번 + 자유 텍스트 2번. **유령이 들은 자리 0건.** 6번 풀 픽도 emotion vector 점수만 보고 *내용*은 안 봄.

체감: "장면 옆에 내가 한 줄 보탰다."

### 3.2 시나리오 B — 차용 후 (같은 플레이어, 같은 입력)

```
[유령]   "...빗소리야. 어딘가에 빗소리가 있었어."
         ← 그라운딩 풀 5~6개에서 픽 (비/냄새/공기 톤)

[시스템] (버튼 3개 — anchor 자리는 유지)
[플레이어] "당신이 들고 있던 거 아니야?" 클릭

[유령]   "...내가? ...그랬나. 손이 비어있었던 것 같은데."
         ← choice별 변주 풀 2~3 중 픽

[유령]   "...그게 무슨 색이었지. 너는 봤어?"
         ← free_dialog_open 풀 픽. **"너는 봤어?" — 유령이 플레이어를 호명**
            (현재는 없는 자리)

[플레이어 턴 1]
         "검은색이었던 거 같아. 손잡이가 나무로 된."
[시스템] (alignment 계산 → MID. 검은색 일치, 손잡이 재질은 원본 정보 X)
[유령]   "...나무였나. 검은 우산은 맞아. 그건 분명해."
         ← MID 풀 픽. 색은 받았고, 재질엔 약간 흔들림.

[플레이어 턴 2]
         "그래. 비가 막 멈출 때쯤 당신이 우산을 접었어."
[시스템] (alignment 재계산 → HIGH. 비 그침 시점도 일치)
[유령]   "...접었지. 비가 그치고. 손이 빈 채로 걸어갔어.
          너도 그 자리에 있었어?"
         ← HIGH 풀 픽 + drift 누적 → *기억을 따라가는* 톤으로 풀림. 또 호명.

[플레이어 턴 3]
         "있었어. 멀리서 봤어."
[유령]   "...그래. 너도 봤구나. 그럼 이건 내 기억만이 아니네."
         ← 마무리 어휘 풀. 종합 alignment HIGH → "확인" 결.

[시스템] (회색 메타) "한 줄 남겨."
[플레이어]
         "아직도 비 오는 날엔 그 우산이 떠올라."
→ 다음 씬
```

체감: "유령이 나를 보고 있고, 내 말을 듣고 있다." 작가 ghostwriter 가 아니라 대화 상대.

### 3.3 시나리오 C — 두 번째 플레이어 (drift / speciation 가시화)

같은 메모리에 다른 플레이어. 비 오는 기억이 *다른 비*. 우산 노란색.

```
[유령]   "...빗소리야. 누가 또 왔구나."
         ← 그라운딩 풀에서 다른 변주 픽. 첫 플레이어 drift 누적이 한 줄 묻어남.

[유령]   "...그게 무슨 색이었지. 너는 봤어?"

[두 번째 플레이어 턴 1]
         "노란색이었어. 학교 로고 박힌 거."
[시스템] (alignment LOW — 원본 검은색 vs 입력 노란색)
[유령]   "...노란? 아냐, 그건 아니야. 내 우산은 검었어. 그건 분명히."
         ← LOW 풀 픽. Core 유령이 *확언조 거부*.

[두 번째 플레이어 턴 2]
         "노란색이었다니까. 그날 비 그치고 들고 갔잖아."
[시스템] (alignment LOW 누적 + 12축 drift 벡터 norm 임계 근접)
[유령]   "...어디서 다른 비를 본 거 아니야?
          내가 본 건 검은 우산이었어. ......아닌가?"
         ← LOW 누적 풀 → *흔들리는 변주* 픽. "......아닌가?"

[두 번째 플레이어 턴 3]
         "노란색 맞아."
[V2-4 decideBranch → speciation 트리거]
         ← drift_norm > 임계. 같은 유령이 흡수 못 함.
[유령]   "...그러게. 너는 다른 비를 봤구나. 나는 모르겠어, 이젠."
         ← 종결 어휘. 유령이 *떠나는* 톤.

→ 회차 끝 outro
[시스템] "당신이 만든 새 유령이 이 메모리에 머물고 있다.
          다음 사람이 만나게 될 거야."
         ← V2-7 outro 분기별 한 줄 (speciation 케이스)

[데이터]  ghost_variants 테이블에 [노란 우산 / 학교 로고] path 가
          새 시드 row 로 박힘. parent_variant_id = 검은 우산 유령.
```

**세 번째 플레이어**가 같은 메모리 진입 시:
- 오프닝 fingerprint 매칭 → `pickGhostVariant` 가 두 풀에서 픽:
  - 검은 우산 유령 (원본)
  - 노란 우산 유령 (두 번째 플레이어가 만든 시드)
- 세 번째 플레이어 fingerprint 가 어느 쪽에 더 가까운가에 따라 다른 유령 만남
- → 작품 명제 §2 "관객의 파편은 다음 관객의 유령으로 흘러간다" **진짜 작동**

### 3.4 차이 한 눈에

| 자리 | A (현재) | B (차용 후) |
|---|---|---|
| 유령 발화 횟수 | 4 (대부분 대본) | 6 (대부분 풀 픽 응답) |
| 유령이 *들은* 자리 | 0 | 3 |
| 유령이 플레이어 호명 | 없음 | 2~3회 |
| drift 가시화 | 다음 회차 가야 | 이번 회차 안 |
| §2 명제 마찰점 | 없음 | 매 턴 |
| 체감 | 장면에 한 줄 보탬 | 유령이 나를 보고 듣고 있음 |

---

## 4. 정당화 — "기억을 찾는다" 컨셉과의 정합

### 4.1 TEM 의 컨셉 한 줄

> "당신의 음각은 어디에 새겨져 있는가?"
> 관객은 남의 기억을 자기 기억처럼 체험한 뒤, 자기 기억 확신을 잃고 나온다 (작품 명제 §2).

이 컨셉은 *해리성 기억상실(DA) 회복 작업*과 메커니즘 단위에서 거울상이다. 다만 **방향이 반대**다.

### 4.2 메커니즘 동형성 (이미 박혀있는 거울상)

| TEM 자산 | 임상 (DA / DID) 대응 |
|---|---|
| 유령 4종 (Core / Contaminated / Echo / Bridge-deferred) | DID "ghost" alters / Van der Hart structural dissociation 의 ANP·EP·단편·silent part |
| 유령과의 멀티턴 대화 | parts dialogue / ego-state therapy |
| "회상 실패자 화법" ([유령시스템_확정_v1:64](유령시스템_확정_v1-260418.md#L64)) | DID ghost alter 정의 — 트라우마에서 분리된 자아가 자기 경험을 흐릿하게 회상 |
| 이본론 (변이 = 재창조) | 회상 = reconstruction (현대 기억과학 합의), 매 회상이 변형 |
| drift (같은 유령 점진 변형) | 반복 회상에 의한 destructive replication / biased mutation (기억유전학 §1·§2) |
| speciation (새 유령 분기) | structural dissociation — 새 EP 가 떨어져 나오는 사건 |
| transition pattern 6종 | 임상 회피·고착·재경험·재구성·다리놓기 패턴 |

→ TEM 자산은 *이미* 임상의 거울상으로 박혀 있다. **ego-state turn-taking 차용은 이 거울상 관계를 *체험 자리*에서도 작동시키는 것.**

### 4.3 방향이 반대인 자리 (의도된 비대칭)

| 임상 | TEM |
|---|---|
| 환자 *자기 안의* 분열된 자아 (intra-personal) | *남의* 기억 잔상 (inter-personal) |
| 통합(integration) 이 목적 | 변이를 환영, 통합 거부 |
| 환자가 *자기 기억의 확신을 회복* | 관객이 *자기 기억의 확신을 잃음* |
| fixation = 병리 | fixation = 가치중립 패턴 6종 중 하나 ([CLAUDE.md](../CLAUDE.md) §6.5 #3) |

→ **메커니즘은 같은데 화살표는 거꾸로다.** 이게 작품의 본질 — *치료 시뮬레이터*가 아니라 *치료의 거울상*.

박사 framing 자료로 강력. 메모리 [Career Goal — MIT Media Lab] / [project_terminal_goal — 기억 염기서열화] 와 정합. 박사 단계에서 분리 가능 framing 후보 (위상 quilt = sheaf theory + 유령 분기 = structural dissociation theory + 궤적 = quasispecies ODE).

### 4.4 "기억을 찾는다"의 정확한 의미

플레이어는 *자기* 기억을 찾는 것도, *남의* 기억을 *복원*하는 것도 아니다.

플레이어는 **남의 기억의 잔상(유령)과 대화하면서 그 기억의 한 단면을 자기 안에 새긴다.** 그 새김 과정 자체가 *자기 기억의 변형*이다 (이본론 §6.2 destructive replication / biased mutation).

ego-state turn-taking 차용 = 이 "대화하면서 새긴다" 자리를 **진짜 대화로 만드는 것**. 작가 대본을 읽는 동안엔 *새김*이 안 일어난다 — 마찰이 없으니까.

즉 본 차용 = 작품 명제 §2 의 메커니즘 부재를 푸는 것. *없던 자리를 새로 박는 게 아니라*, 이미 박혀 있는데 작동 안 하던 자리를 작동시키는 것.

---

## 5. 변경 범위 + 일정 영향

### 5.1 코드 변경

- [lumen_dialog_phase1.js:44](../js/ui/lumen_dialog_phase1.js#L44) `maxFreeDialogTurns: 1 → 3`
- [lumen_dialog_phase1.js:328-350](../js/ui/lumen_dialog_phase1.js#L328-L350) `ghost_intro` / `choice_reply` / `free_dialog_open` 단일 텍스트 → 풀 픽
- `LumenGhostResponse.pickResponse` 시그니처 검증 (이미 있음)

→ **0.5 ~ 1일.**

### 5.2 콘텐츠 변경

- V2-10 가이드 = "응답 풀 12 슬롯 (4 유령 타입 × HIGH/MID/LOW)" 재정의
- 슬롯당 변주 2~3개 = **24~36개**. 양은 기존 drift 변주 10~15와 비슷.
- 가이드 신규 작성 4시간.

### 5.3 일정 영향

- V2-10 시작 5-3 → 가이드 + 결정 1일 끼움 → **5-4 시작 → 5-8 마감** (원래 5-10)
- V2-12 디버깅·튜닝 (5-11~5-12) 에 멀티턴 페이스 튜닝 자연스럽게 흡수 (SCOPE §9-6 "본인 한 바퀴 후 임계 결정" 과 같은 자리)
- **마감 5-19 영향: 거의 없음.** 1.5일 여유 발생.

### 5.4 롤백

`maxFreeDialogTurns: 3 → 1` 되돌리고 풀 픽을 단일 텍스트로 되돌리면 **1시간**.

---

## 6. 결정 기록

### 6.1 5-2 결정 번복 — `maxFreeDialogTurns: 1`

5-2 사용자 본인 결정 ("멀티턴 별로, 단일턴이 작품 톤에 더 맞음") → 5-4 번복.

근거: §1.2 (가)~(라) 약점 4종. 단일턴은 *유령이 듣는 자리* 0개를 만들고, 작품 명제 §2 의 마찰점이 없음. 5-2 시점엔 "단일턴이 톤에 맞다"가 옳아 보였으나, 5-4 시점에 "유령이 안 듣는다"가 더 큰 약점으로 드러남.

### 6.2 임상 프레임 차용 분리

**차용**: ego-state turn-taking 구조 (메커니즘 한 자리)
**거부**: integration 목적, 치유 어휘, fixation 병리화, 임상 프레이밍 (정체성 자리)

### 6.3 SCOPE V2.1 영향

본 문서 = SCOPE V2.1 §0-A "scope change V2.1.1" 발동 자료.
SCOPE 갱신 시 본 문서 링크 박음.

---

## 7. 작업 순서

1. [x] 본 문서 확정 ← **2026-05-04**
2. [ ] SCOPE V2.1 §0-A 에 "V2.1.1 ego-state turn-taking 차용" 한 단락 + 본 문서 링크
3. [x] V2-10 콘텐츠 가이드 신규 — [docs/유령응답풀_가이드_v1-260504.md](유령응답풀_가이드_v1-260504.md) (2026-05-04 완료, 세션 2)
   - 핸드오프 표현 "12 슬롯 (4 유령 × HIGH/MID/LOW)" 정정 = 코드 시그니처와 안 맞음
   - 실제 차원 = *유령 정체성 (메모리당 N마리) × 3결 (resonance/vague/dissonance) × 변주 4~5*
   - "4종 (Core/Contaminated/Echo/Bridge-deferred)" = 씬 핀 표시 + 변주 톤 hint 자리, 응답 풀 차원 X
   - 결정 (a)~(d) = *콘텐츠 자리* 결정. §7.4 의 (a)~(d) (코드 자리) 와 *다른 자리* — 알파벳만 같음, 충돌 X
4. [x] [lumen_dialog_phase1.js](../js/ui/lumen_dialog_phase1.js) `maxFreeDialogTurns: 3`, ghost_intro/choice_reply/free_dialog_open 풀 픽 시그니처 정리 (2026-05-04 완료, 세션 1 차용 코드 자리)
   - `maxFreeDialogTurns: 1 → 3` (DEFAULTS L48)
   - ghost_intro / choice_reply / free_dialog_open = string OR array. 배열이면 (memId|sceneId|slotKey) 시드로 deterministic pick. `_pickAuthored` 헬퍼 박음.
   - 매 턴 `pickResponse(turn, alignment, playerInput)` 호출 — turn 인자가 시드에 들어가서 매 턴 다른 변주.
   - 매 턴 console.log `[phase1] turn N/3 alignment=X resonance=Y reply="..."` — drift 가시화 검증 자리.
   - 회차 끝 console.log `[phase1] scene cycle Xs` + 540s(9분) 초과 시 console.warn (결정 (d)).
   - 결정 자리 (a)~(d):
     - **(a) 매 턴 alignment** = `_analyzeEmotion` 단독 호출. 누적 fingerprint X (오프닝 자산 의미와 섞이는 자리 회피).
     - **(b) 풀 빔 fallback** = 모듈 기본값 `'...'` 유지. 풀 채움은 V2-10 자리.
     - **(c) 호명 자리** = 콘텐츠 자리 (V2-10 가이드가 turn ≥ 2 슬롯에 호명 어휘 박음). 코드는 turn 인자만 전달.
     - **(d) smoke 시간 임계** = 540s (9분). 작가 한 바퀴 페이스 점검 자리.
5. [x] smoke 가드 갱신 ([test/smoke_v21_phase1.js](../test/smoke_v21_phase1.js) 멀티턴 3턴 검증) (2026-05-04 완료)
   - 검증 11: `_config.maxFreeDialogTurns === 3`
   - 검증 12: `_utils.pickAuthored` — string passthrough / array seeded / 빈 배열 / null / 시드 다양성
   - 검증 13: `_config.sceneCycleWarnMs === 540000`
   - [test/v21_phase1_test.html](../test/v21_phase1_test.html) 검증 자리 문구 갱신 (3턴 + sceneCycleMs + 콘솔 로그 자리)
6. [ ] 회차 끝 decideBranch 자리 검증 — `js/app/opening.js:524` 에 박힘, phase1 끝나면 `onSceneEnd` 콜백 → play-test 씬 루프 → run 끝 outro 흐름 (본 수정이 영향 X). **검증 통과 (2026-05-04 세션 1).**

7. [x] **setOptions 자동 분류 풀 주입** ([lumen_dialog_phase1.js](../js/ui/lumen_dialog_phase1.js)) — 2026-05-05 완료
   - `_loadAndInjectGhostPools(supabase, memoryId, ghosts)` 헬퍼 신규
   - start() 진입 시 await 호출 (drift visualizer attach 직후, race 회피)
   - 로직: ghost_variants drift SELECT → anchor (is_seed+root) emotion_vec 와 cosine sim → 0.85/0.5 임계 → resonance/vague/dissonance 3결 분류 → `LumenGhostResponse.setOptions` 주입
   - speciation 시드는 SELECT 단계 `kind='drift'` 로 제외 ([§15-1](LUMEN_DEMO_SCOPE-260429.md) 후속 플레이어 자리)
   - fallback 5종 = 글로벌 디폴트 유지: missing_deps / select_failed / no_anchor / 변주<3 / exception
   - lazy capture `_originalGhostDefaults` = 메모리 간 stale 방지 (빈 결 디폴트 fallback)
   - 효과: 발자국 14 변주가 글로벌 디폴트 (5+6+7=18 어휘) 대신 진짜 유령 입에 들어감

각 단계 완료 시 본 문서 §7 + SCOPE V2.1 §3 V2-10 자리 갱신.

---

## 8. 관련 문서

- [docs/LUMEN_DEMO_SCOPE-260429.md](LUMEN_DEMO_SCOPE-260429.md) — V2.1 SCOPE
- [docs/유령시스템_확정_v1-260418.md](유령시스템_확정_v1-260418.md) — 유령 4종 화법 §4
- [CLAUDE.md](../CLAUDE.md) §6.5 — 8 critical design principles (특히 #3 fixation, #6 Record=first Play)
- [기억유전학_v0.3.md](기억유전학_v0.3.md) — destructive replication, biased mutation
- 메모리 [feedback_avoid_authorial_control_framing] — 임상/통제 프레이밍 거부 근거
- 메모리 [Career Goal — MIT Media Lab] — 박사 framing 자료 자리

## 9. 임상 자료 출처 (참고)

- [Effectiveness of phase-oriented treatment for trauma-related dissociative disorders (PMC, 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12406319/)
- [ISSTD Adult Treatment Guidelines (2011)](https://www.isst-d.org/wp-content/uploads/2019/02/GUIDELINES_REVISED2011.pdf)
- [Treating Complex Posttraumatic Dissociation (DID-Research.org)](https://did-research.org/treatment/)
- [Ego-state therapy — Wikipedia](https://en.wikipedia.org/wiki/Ego-state_therapy)
- [Structural Dissociation (DID-Research.org)](https://did-research.org/origin/structural_dissociation/)
- [3 Phases of Trauma Treatment (Herman model)](https://www.sustainablewellnessny.com/post/3-phases-of-trauma-treatment)

# TODO — 2026-05-04 (Lumen V2.1)

> **이 파일의 성격**: 오늘 8개 병렬 세션 + α 가 cold-start 로 들어와서 바로 작업 시작할 수 있는 핸드아웃 모음.
> **마감 기준**: 5-19 안전 마감, 본 작업은 21일 SCOPE 의 5-4 ~ 5-9 코드 풀 구현 구간.
> **편성 원칙**: Wave 1 (read-heavy, 충돌 X) 4 자리 동시 → Wave 2 (write-heavy) 4 자리 동시 → α (의존 자리, 직렬).
> **충돌 회피**: 각 세션은 *서로 다른 파일* 만 건드리거나 *읽기 전용*. Wave 2 시작 = Wave 1 완료 후.

---

## 오늘 시점 결정 요약 (메인 세션 컨텍스트)

이게 cold-start 세션이 먼저 알아야 할 자리.

### 5-3 시점 박힌 자리 (V2.1 SCOPE §4 기준)
- V2-1 DB 모델 (`ghost_variants`(유령 변주 풀 테이블) + `plays.dialog_turns`(멀티턴 누적)) — 5-3 완료
- V2-3 멀티턴 fingerprint 파이프라인 — 5-3 코드 완료, 작가 손 검증 미완. **3턴 고정 명시** ([memory: V2-4 분기 트리거 핸드오프](C:/Users/user/.claude/projects/d--The-Etched-Mutation/memory/project_v24_branch_trigger_handoff.md))
- V2-4 분기 트리거 (`decideBranch`(drift/speciation 결정 함수) + `buildSpeciationRow`(speciation INSERT 페이로드 빌더)) — 5-3 완료, INSERT 경로는 V2-4 후반

### 5-4 메인 세션이 박은 자리
- **S1 (drift 시간 감쇠)** = 사용자 별 세션에서 해결 완료. **본 todo.md 에 디테일 미반영** — 세션 진입 시 사용자에게 1줄 받아서 적용할 것.
- **S2/S3 (drift 픽 시스템)** = 별 세션에서 결정:
  - drift = **12축 방향 벡터** (1차원 강도 X). CLAUDE.md §6.5 #2 정합.
  - 픽 알고리즘 = **2단계 (B)** — 글로벌 누적 변위 가까운 변주 N개 좁힘 + 회차 변위 방향 softmax 픽
  - 베이스라인 = **회차 시작 fingerprint** (작가 정답 X)
  - fallback = **필터 점진 풀기 (모티프 → 귀인만 → 무필터) → 풀 빔 시 작가 폴백 문구**. 본 유령 silent fallback 절대 X
  - 도장 = 회차 끝 변주 ID + 12축 변위 벡터 `plays` 행에 박음
  - 폐기: 0.2/0.5/0.8 양자화 라벨, 1차원 `intended_drift` 컬럼, argmax NN, `drift_residue` 시계열 audit 테이블
- **S4 (V2-15 회차 끝 폴리싱)** = 신규 작업 X, 기존 [`showEndScreen`](js/app/endScreen.js) + [`LumenRewindPlayback`](js/ui/lumen_rewind_playback.js) + [`showAfterimage`](js/ui/afterimage.js) 3자에 V2.1 데이터 흘리는 폴리싱. 디자인 자리는 W1S3.
- **`classifyBranch` 누적 무시 문제** = V2-12 튜닝 자리 (5-11~5-12 본인 한 바퀴 후) 에 위임. V2.1 코드 작업에 박지 않음.

### 폐기된 자리 (이전 메인 세션 잘못된 제안)
- 24시간 선형 fade decay 룰 (S1 사용자가 별 세션에서 해결, 디테일 받기)
- ~~V2-15 신규 작업 (회차 종합 장면화 2~3일)~~ → 폴리싱으로 격하
- ~~drift_intensity 컬럼 추가 마이그레이션~~ → 12축 emotion_vec 으로 대체
- ~~한국어 메인 메모리~~ → 영어 메인 + 한국어 시드 (S7 검증 후 확정)

### 핵심 메모리 룰 (모든 세션 강제)
- **[기존 자산 grep 후에 제안](C:/Users/user/.claude/projects/d--The-Etched-Mutation/memory/feedback_reuse_existing_assets_first.md)** — 매트릭/엔진/감쇠 룰 제안 전 `ContaminationTracker`(오염 추적기) / `afterimage`(잔상) / `SceneNavigator`(씬 항법) / `lumen_*` 자산 grep 무조건. Generic EMA / linear decay 룰 단독 제안 금지.
- **[작가 통제 정체성 X](C:/Users/user/.claude/projects/d--The-Etched-Mutation/memory/feedback_avoid_authorial_control_framing.md)** — 작가 통제 = 구현 trade-off, 정체성 = 변이/부산물.
- **답변 = 초등학생도 알아먹게** — 비유, 일상어, 구체 예시. 백틱+괄호 strict 룰 폐기.
- **LLM 호출 금지 (결정론 룰셋)** — 분기 결정 / 변주 픽 / 매칭 모두 결정론. claude-scene 같은 emotion 분석 호출은 OK (입력 가공만).

---

## 의존 그래프

```
Wave 1 (read-heavy, 동시 4자리)
├─ W1S1: cont_drift α + EMA 코드 audit ── ROOT
├─ W1S2: Tripo 사전 베이크 viability ── 독립
├─ W1S3: V2-15 회차 끝 폴리싱 design ── 독립
└─ W1S4: Lumen 출품 양식 + 콘텐츠 분배 ── 독립

       ↓ (Wave 1 완료 후)

Wave 2 (write-heavy, 동시 4자리)
├─ W2S1: migration SQL (3 컬럼)        ← W1S1 결과 입력
├─ W2S2: ContaminationTracker 12축 EMA ← W1S1 결과 입력
├─ W2S3: V2-2 admin 12축 UI            ← W1S1 결과 입력
└─ W2S4: V2-7 귀환 toast 컴포넌트       ← W1S3 trigger 명세 입력

       ↓ (Wave 2 완료 후)

α (직렬, 의존 풀린 자리)
├─ α1: pickDriftUtterance 함수 + vitest    ← W2S1 + W2S2
└─ α2: opening.js wiring + 폴백 문구 26개   ← α1
```

---

# Wave 1 — 동시 4 자리 (read-heavy / 독립 파일)

## W1S1 — `cont_drift` α + EMA 구조 실측 (ROOT)

### 목표
TEM 코드에 *실제로* 박혀있는 EMA 매트릭 자산을 그대로 보고하고, S2/S3 가 가정한 자리들 (`EMA_ALPHA = 0.10`, `ghost_variants.emotion_vec` 12차원, 4축 룰) 이 진짜인지 *코드로* 확인. 이게 모든 코드 작업의 root.

### 컨텍스트
메인 세션이 5-4 답변에서 시뮬 EMA α=0.6 으로 박았는데, SCOPE §16-5 명시는 α=0.10. 두 자리가 다른 매트릭인지 단위 차이인지 확인 X 한 채로 S1/S2/S3 결정 진행됨. S3 plan 이 "EMA_ALPHA 0.10 재사용" 박았는데 *명세 인용* 인지 *코드 실측* 인지 구분 X. 본 세션이 그 자리를 잠근다.

### 읽을 파일 (순서대로)
1. [`js/core/ContaminationTracker.js`](js/core/ContaminationTracker.js) — 통째 읽기. 클래스 메서드 / EMA α 값 / 갱신 단위 (턴 vs 회차) / 4축 룰 / Welford 자리 / VAD 3축 (`drift_dir_v/_a/_d`)
2. [`docs/오염벡터_계산_구현_명세_v2-260327.md`](docs/오염벡터_계산_구현_명세_v2-260327.md) — 명세 vs 코드 일치 확인
3. [`docs/Contamination_MVP_Spec_v3-260327.md`](docs/Contamination_MVP_Spec_v3-260327.md) — 2축 MVP 시점 명세
4. [`supabase/migrations/`](supabase/migrations/) 검색 — `cont_drift` / `cont_divergence` / `cont_convergence` / `cont_heterogeneity` 컬럼 + 갱신 트리거/RPC
5. [`supabase/migrations/20260503000000_v21_ghost_variants_and_dialog_turns.sql`](supabase/migrations/20260503000000_v21_ghost_variants_and_dialog_turns.sql) — `ghost_variants.emotion_vec` 차원수 (12축? VAD 3축? 다른?)
6. [`test/unit/contaminationTracker.test.js`](test/unit/contaminationTracker.test.js) + [`tests/contamination_unit_test.mjs`](tests/contamination_unit_test.mjs) — 회귀 가드에서 α 값/갱신 룰 검증 자리
7. [`js/core/SeekerFingerprint.js`](js/core/SeekerFingerprint.js) — fingerprint 출력 차원수 + EMA 룰 (멀티턴 누적 자리)
8. [`docs/별이엔진_V4-궤적기반_정렬도-260327.md`](docs/별이엔진_V4-궤적기반_정렬도-260327.md) — `alignment` 정의 + `turn_drift` 입력 자리

### 작업
1. 위 파일 다 읽고 다음 5개 답을 *코드 인용 라인 번호와 함께* 보고:
   - (a) `EMA_ALPHA` 또는 동등 변수 = 어디 박혀 있고 값 얼마? 갱신 단위 (턴/회차)?
   - (b) `turn_drift` = 코드에 *진짜 정의* 있나? 있으면 정확 정의. 없으면 "정의 없음, alignment 의 보수 추정만".
   - (c) 4축 (drift / divergence / convergence / heterogeneity) 갱신 룰 차이 = 한 자리에서 1단락 정리. 다 같은 EMA α? 다른 룰?
   - (d) `memories.cont_drift` 갱신 트리거 = 어디서 호출? 회차 끝마다? Edge function? 클라이언트?
   - (e) `ghost_variants.emotion_vec` 차원수 = 12? 3 (VAD)? 다른? 컬럼 정의 문 그대로 인용.
2. *시뮬 / 추정 / 새 매트릭 제안 절대 금지*. 실측만.

### 결정할 것 (보고만, 결정은 메인 세션이 받아서 박음)
- W2S1 마이그레이션이 신규 컬럼 `memories.cumulative_emotion_vec` 박을 때 차원수 = (e) 답에 의존
- W2S2 12축 EMA 메서드가 *기존* α 재사용 가능 여부 = (a) 답에 의존
- α2 wiring 의 매 턴 hook 자리 = (d) 답에 의존

### 출력 형식
채팅에 보고. 5 답 + 각 코드 인용 (path + line). 새 파일 박지 말 것.

### 차단/막는 자리
- W2S1, W2S2, W2S3, α1 모두 본 세션 결과 입력으로 받음. **Wave 2 시작 전 무조건 완료**.

---

## W1S2 — Tripo 사전 베이크 viability check

### 목표
Tripo (이미지→3D 메시 생성 서비스) 가 V2.1 데모 (5-19) 안에 박을 수 있는 자산인지 진위 판정. 본 호환 깨지면 fallback 결정.

### 컨텍스트
사용자가 Q1 답에서 Tripo 사전 베이크 (c) 채택. N개 변주 메시 미리 만들고 런타임은 swap만 (LLM 호출 X 룰 준수). 베이스 = 현재 [`test/ghost-mannequin-test.html`](test/ghost-mannequin-test.html) 의 Mixamo Y-Bot + Fresnel rim glow + 회색 unlit. 단 Tripo 출력 본 구조가 Mixamo 본 (Hips/Spine/LeftArm/...) 호환 X 가능성 큼 — 아무도 아직 검증 X.

S2/S3 결정 이후 Tripo 변주가 **12축 emotion_vec 좌표** 박는 자리에 들어가야 하는지 추가 결정 필요. 현재 후보:
- (a) Tripo 변주마다 12축 좌표 박기 (작가 부담 큼 + Tripo 호출당 비용)
- (b) 외형은 베이스 1개 + 자세/표정 애니메이션 N개 (Mixamo 클립 풀과 비슷, 결국 Tripo 가 필요한가?)

### 읽을 파일
1. [`test/ghost-mannequin-test.html`](test/ghost-mannequin-test.html) — 통째 읽기. 모델 로딩 흐름 (`loadModel`, `loadOne`, `onLoaded`, `nameFromUrl`), 본 인식 (`skinnedMesh count`), cm→m 자동 리스케일, FBX/GLB 호환, extra clips merge, Fresnel rim glow 셰이더 주입 (`injectRimGlow`)

### 웹 조사
1. Tripo 공식 사이트 — 가격 / 출력 포맷 (.glb/.fbx/.obj?) / 평균 가공 시간 / 무료 tier 여부 / API 자동화 가능성
2. Tripo 출력 본 구조 문서 — Humanoid rig? T-pose? Mixamo 호환?
3. 대안 비교 (간단히): Meshy, Luma AI, Rodin, MakeHuman, Mixamo Auto-Rigger

### 작업
1. Tripo 사이트에서 1개 출력 받기 (가능하면 무료 tier). 입력 = 단순 인물 사진 또는 텍스트 프롬프트.
2. 출력 .glb 또는 .fbx 다운로드 → `test/` 폴더에 박기 → 로컬 dev server 띄우고 `test/ghost-mannequin-test.html` 의 custom URL 자리에 박기
3. 다음 항목 체크:
   - [ ] 모델 로드 성공? (디버그 HUD 의 "skinned=N" / "bbox h=X" 표시)
   - [ ] 본 인식? (`skinnedMesh count > 0`)
   - [ ] cm→m 자동 리스케일 작동? (bbox h ≈ 1.8)
   - [ ] Mixamo `Walking.fbx` / `Idle.fbx` 클립 머지 후 재생? (extras textarea 에 박고 reload)
   - [ ] Fresnel rim glow 박힘?
4. 호환 깨지면:
   - (i) Tripo mixamo-compatible rig 옵션 있는지 재확인
   - (ii) Mixamo Auto-Rigger 에 Tripo .glb 업로드해서 자동 리깅 시도
   - (iii) (i)(ii) 둘 다 깨지면 fallback = Mixamo Y-Bot 베이스 그대로 + 자세 클립으로만 변주 (Tripo 자체 V3 이월)

### 결정할 것
- (a) Tripo 진짜 채택 vs Mixamo Y-Bot + 자세 클립 전용
- (b) 변주 N개 = drift 변주 풀 사이즈 (10~15) 매핑? 또는 2~3개 외형만?
- (c) 호환 깨질 시 fallback 어디

### 출력 형식
채팅에 보고:
- Tripo 가격/시간/포맷 1단락
- 호환 검증 결과 5 체크박스 + 1줄씩
- 권장 결정 (a/b/c) + 근거 1단락

### 차단/막는 자리
- 독립. V2-10 콘텐츠 작성 (영문 메인 메모리) 시 외형 변주 자리 결정에 영향. V2.1 데모 자체는 Tripo 없어도 작동 가능.

---

## W1S3 — V2-15 회차 끝 폴리싱 design

### 목표
V2.1 회차가 끝났을 때 본인이 보는 시퀀스 ([`showEndScreen`](js/app/endScreen.js) → 카메라 rewind → 잔상 → 메뉴 복귀 → toast) 흐름을 잠그고 V2.1 데이터 (`plays.dialog_turns`(멀티턴 누적), `decideBranch.kind`(drift/speciation), picked drift 변주 ID, 12축 변위 벡터) 가 *어디서 어떻게* 흐르는지 design 문서 박기. 코드 X, design 만.

### 컨텍스트
사용자가 메인 세션에 "장면화 이미 있다 찾아봐 병신아" 짚어줘서 grep — 기존 3자 박혀있음:
1. [`js/app/endScreen.js:75`](js/app/endScreen.js#L75) `showEndScreen` — `finalAlignment` 표시 + 트루엔딩/일반 분기 + 3.8초 뒤 `showAfterimage` 호출 + NPC 대사
2. [`js/ui/lumen_rewind_playback.js:42`](js/ui/lumen_rewind_playback.js#L42) `LumenRewindPlayback.attach` — `void` 진입 시 본인 궤적 거꾸로 카메라 lerp 보간 + 입력 잠금
3. [`js/ui/afterimage.js`](js/ui/afterimage.js) + [`js/lib/afterimage.js`](js/lib/afterimage.js) — 다른 사람 발화 떠오름 (잔상 명제 = "타인의 파편 매칭")

V2-15 신규 작업 = 취소. 폴리싱 자리.

V1 자산 = walking 흐름이라 `void` 진입 자연. V2.1 = 멀티턴 대화 흐름이라 *void 자리 새로 박아야* 할 가능성. `LumenRewindPlayback` 의 `forceStart` API 활용 가능.

### 읽을 파일
1. [`js/app/endScreen.js`](js/app/endScreen.js) — `showEndScreen` 통째. 흐름 + 잔상 트리거 + 트루엔딩 분기
2. [`js/ui/lumen_rewind_playback.js`](js/ui/lumen_rewind_playback.js) — `attach` API + `triggerEvent` 옵션 + `forceStart`/`forceStop` + `on(rewindStart/rewindEnd)`
3. [`js/ui/afterimage.js`](js/ui/afterimage.js) — UI 표시 시퀀스 (트리거 → 등장 → 인터랙션 → 사라짐)
4. [`js/lib/afterimage.js`](js/lib/afterimage.js) — 데이터 레이어 + cool-down 룰 (같은 utterance 두 번 X, 세션당 2회)
5. [`docs/잔상_시스템_설계-260409.md`](docs/잔상_시스템_설계-260409.md) §7 연출 명세 — 트리거 / 등장 / 인터랙션 / 사라짐
6. [`docs/LUMEN_return_components-260421.md`](docs/LUMEN_return_components-260421.md) — 귀환 컴포넌트 명세 전체
7. [`js/ui/lumen_return_speech.js`](js/ui/lumen_return_speech.js) + [`js/ui/lumen_return_events.js`](js/ui/lumen_return_events.js) — V2.1 데이터 흘릴 자리 후보
8. [`js/app/opening.js`](js/app/opening.js) `_handleOpeningSubmit` — 멀티턴 회차 끝 자리에서 `showEndScreen` 호출 가능한지

### 작업
다음 5개 결정 박고 design 문서 1개 작성 (마크다운, 채팅에 또는 [`docs/v21_session_end_design.md`](docs/v21_session_end_design.md) 신규):
1. **(a) V2.1 데이터 흘리는 자리** = `showEndScreen` 본문 / `LumenRewindPlayback` rewindEnd 직후 / `showAfterimage` 후속 / 신규 모듈 — 어디?
2. **(b) `LumenRewindPlayback` V2.1 사용 가능?** — `void` 진입 자리 박을지 / `forceStart` 회차 끝에 강제 시작 / 폐기
3. **(c) 잔상 자리** = 그대로 보존 (다른 사람 발화) vs V2.1화 (본인 drift 잔향 텍스트) — 잔상 명제 변경 = SCOPE 위반? 또는 *V2.1 회차 요약 + V1 잔상 둘 다 표시*?
4. **(d) `finalAlignment`(V1) vs `topScore`(V2.1)** = 한 화면 같이 vs 분리 vs `topScore` 만 (V2.1 흐름은 alignment 없음)
5. **(e) 시퀀스 순서** = 회차 끝 → ? → ? → ? → 메뉴 복귀 → V2-7 toast (W2S4)

### 결정할 것
위 5 (a~e). 추가:
- (f) V2-7 toast trigger 정확 조건 — speciation 만? drift decay 잔향도? 본인 손 검증 자리.

### 출력 형식
채팅 또는 신규 마크다운 (`docs/v21_session_end_design.md`). 다음 항목 포함:
- 회차 끝 시퀀스 timeline (시점 → 호출 함수 → 표시 데이터)
- V2.1 신규 자리 (어디 wire, 어떤 데이터)
- V1 자산 변경 자리 (있으면 명시 — `showEndScreen` 본문 수정?)
- toast trigger 명세 (W2S4 입력)

### 차단/막는 자리
- W2S4 (귀환 toast 컴포넌트) trigger 명세 입력
- α2 (wiring) 회차 끝 hook 자리 입력

---

## W1S4 — Lumen 2026 출품 양식 검증 + 콘텐츠 분배 결정

### 목표
"Lumen 영문 default" 가정 직접 검증. 영문/한국어 콘텐츠 분배 잠그고, 작가 작성 페이스 베이스라인 측정해서 V2-10 4일 일정 검증.

### 컨텍스트
메인 세션이 "Lumen 영문 default → 영어 메인 + 한국어 시드" 박았는데 직접 검증 안 함. 사용자가 "한국어 메모리 제출 뭔소리야 빡대가리야" 짚어줘서 정정. 단 *메모리 본문* 영문 필수인지 확인 X — statement 영문 필수는 가능성 크지만 본문은 한국어 + 영문 자막 가능성 X.

S2/S3 결정 이후 *변주 작성에 12축 emotion_vec 좌표* 박는 자리 추가 — 1 변주당 작성 시간이 늘어남 (학습 부담 + 좌표 입력 시간).

### 읽을 파일
1. [`docs/lumen_memory_authoring_checklist-260421.md`](docs/lumen_memory_authoring_checklist-260421.md) — 작가 본 페이스 데이터 / 1 메모리 작성 시간 베이스라인
2. [`docs/lumen_memory_story_worksheet-260421.md`](docs/lumen_memory_story_worksheet-260421.md) — 메모리 워크시트 구조
3. [`docs/critic_input_LUMEN-260428.md`](docs/critic_input_LUMEN-260428.md) — V1 시점 출품 패키지 검토 자료
4. [`docs/LUMEN_DEMO_SCOPE-260429.md`](docs/LUMEN_DEMO_SCOPE-260429.md) §10 V2.1 성공 판정 — 영상 1~2분 + 스크린샷 4~10장 + statement 계보 명시
5. `memories` 테이블 스키마 — `lang` 컬럼 / 본문 다국어 박힌 메모리 있는지 (Supabase MCP `list_tables` 또는 마이그레이션 검색)

### 웹 조사
1. **Lumen 2026 공식 출품 양식** — statement 언어 / 영상 자막 / 작품 본문 언어 / 심사 위원 언어
2. 카테고리별 요구사항 (몰입형 미디어 / 인터랙티브 등)

### 작업
1. Lumen 2026 출품 페이지 직접 조사. 다음 5 항목 답:
   - (a) statement 영문 필수 여부
   - (b) 영상 영문 자막 필수 여부
   - (c) 작품 본문 (메모리 텍스트) 언어 요구
   - (d) 심사 위원 언어 (영어 기본?)
   - (e) 카테고리 결정 (V2.1 데모 어느 자리)
2. 작가 페이스 베이스라인:
   - 1 변주 작성 시간 (발화 텍스트 5~10분 + motif/attribution 2~3분 + 12축 좌표 박기 10~30분 = 약 20~40분)
   - 영문 작성 시간이 한국어 대비 1.5~2배 (작가 모국어 한국어 가정)
   - 1 메모리 (변주 13개 + speciation 시드 1~2개 + 본 유령 본문) ≈ 6~10시간 = 1~1.5일
3. 분배 잠그기:
   - (i) Lumen 본문 영문 필수면 → 영어 메인 (1.5일) + 한국어 시드 (0.5~1일) = 약 2~2.5일
   - (ii) 영문 자막만이면 → 한국어 메인 (1일) + 영문 자막 작업 (0.5일) + 영어 시드 (0.5일) = 약 2일
   - (iii) 둘 다 가능 → 작가 자유

### 결정할 것
- (a) Lumen 정확한 언어 요구 확인 후 분배 결정
- (b) 페이스 측정 베이스라인
- (c) V2-10 SCOPE 4일 안에 들어가는지 — 안 들어가면 시나리오 A (코드 슬립) 임계 자리 진입 알림

### 출력 형식
채팅 보고:
- Lumen 출품 양식 5 답
- 페이스 베이스라인 1단락
- 분배 결정 + V2-10 일정 정합 판정

### 차단/막는 자리
- V2-10 콘텐츠 작성 시작 (5-3 ~ 5-10 SCOPE 일정)
- W2S3 admin UI 12축 입력 형태 (작가 학습 부담 베이스라인 입력)

---

# Wave 2 — 동시 4 자리 (write-heavy / 다른 파일 / Wave 1 완료 후 시작)

## W2S1 — S2/S3 마이그레이션 SQL

### 목표
S2/S3 결정대로 3 컬럼 추가 마이그레이션 1 파일 박기:
- `memories.cumulative_emotion_vec` jsonb — 글로벌 누적 12축 변위 벡터
- `plays.ghost_variant_id` uuid — 회차 끝 받은 변주 도장
- `plays.final_drift_vector` jsonb — 회차 끝 12축 변위 벡터

### 컨텍스트
S2/S3 가 drift 픽 시스템 = 12축 방향 벡터 + 2단계 (글로벌 좁힘 → 회차 픽) + 회차 끝 도장 박음. 도장 = 사후 재현 (디버깅 / 작가 손 검증) 시 sampling 재실행 X — 받은 변주 ID 와 변위 벡터 그대로 읽기.

기존 자산 그대로 보존:
- `memories.cont_drift` (스칼라) — 연출 신호 자리. 변경 X.
- `ghost_variants.emotion_vec` — W1S1 (e) 답에 따라 차원수 확인 후 사용. 차원 부족 시 마이그레이션에 차원 확장 추가.

### 읽을 파일
1. **W1S1 보고 결과** (채팅) — `EMA_ALPHA` 값, `ghost_variants.emotion_vec` 차원수
2. [`supabase/migrations/20260503000000_v21_ghost_variants_and_dialog_turns.sql`](supabase/migrations/20260503000000_v21_ghost_variants_and_dialog_turns.sql) — 직전 V2.1 마이그레이션 패턴 (CHECK / 인덱스 / RLS) 참조
3. [`supabase/migrations/20260330000000_add_contamination_v3_to_memories.sql`](supabase/migrations/20260330000000_add_contamination_v3_to_memories.sql) — `cont_*` 추가 마이그레이션 패턴
4. [`docs/LUMEN_DEMO_SCOPE-260429.md`](docs/LUMEN_DEMO_SCOPE-260429.md) §16-1 4축 명세

### 작업
1. 신규 파일: [`supabase/migrations/20260504000000_v21_drift_pick_vectors.sql`](supabase/migrations/20260504000000_v21_drift_pick_vectors.sql)
2. SQL 작성:
   ```sql
   -- memories.cumulative_emotion_vec (글로벌 12축 누적)
   ALTER TABLE memories ADD COLUMN cumulative_emotion_vec jsonb DEFAULT '{}'::jsonb;
   ALTER TABLE memories ADD CONSTRAINT cumulative_emotion_vec_object
     CHECK (jsonb_typeof(cumulative_emotion_vec) = 'object');

   -- plays.ghost_variant_id (회차 끝 받은 변주 도장)
   ALTER TABLE plays ADD COLUMN ghost_variant_id uuid REFERENCES ghost_variants(id);
   CREATE INDEX idx_plays_ghost_variant ON plays(ghost_variant_id) WHERE ghost_variant_id IS NOT NULL;

   -- plays.final_drift_vector (회차 끝 12축 변위)
   ALTER TABLE plays ADD COLUMN final_drift_vector jsonb DEFAULT '{}'::jsonb;
   ALTER TABLE plays ADD CONSTRAINT final_drift_vector_object
     CHECK (jsonb_typeof(final_drift_vector) = 'object');
   ```
3. *W1S1 (e) 답이 ghost_variants.emotion_vec 차원수 < 12* 면 차원 확장 SQL 추가 (jsonb 라 컬럼 변경 X, 데이터 검증만 추가)
4. Supabase MCP 로 운영 DB 적용 (`apply_migration` tool)
5. smoke 검증: vitest 또는 schema lock 테스트 (기존 `test/smoke_v21_admin_ghost_variants.js` 또는 [`test/smoke_v21_match_engine.test.js`](test/smoke_v21_match_engine.test.js) 패턴 참조)

### 결정할 것
- (a) ghost_variants.emotion_vec 차원 확장 필요 여부 (W1S1 (e) 결과)
- (b) RLS 정책 — `plays.ghost_variant_id` / `plays.final_drift_vector` 읽기 권한 (본인만? 작가도? admin?)
- (c) 인덱스 — `final_drift_vector` 에 GIN 박을지 (자주 쿼리되는 자리 X 면 X)

### 출력 형식
- 신규 마이그레이션 파일
- Supabase MCP 적용 로그
- vitest 회귀 통과 (이전 회귀 케이스 + 신규 schema lock 21~30 케이스)

### 차단/막는 자리
- α1 (pickDriftUtterance) — 입력 자리 (스키마)
- α2 (opening.js wiring) — 도장 박는 자리

---

## W2S2 — `ContaminationTracker` 12축 EMA 메서드

### 목표
`ContaminationTracker`(오염 추적기 클래스) 에 12축 emotion_vec EMA 누적 메서드 추가. 기존 VAD 3축 (`drift_dir_v/_a/_d`) 옆에 12축이 평행으로 박힘. 기존 `EMA_ALPHA` (W1S1 실측값) 재사용.

### 컨텍스트
S3 plan = "drift_dir_v/_a/_d (VAD 3축) 옆에 12축 emotion_vec 누적, 기존 EMA_ALPHA 0.10 재사용". 본 세션이 그 자리 박음.

평행 두 자리 의도:
- VAD 3축 = 시각/사운드 연출 자리 (`lumen_walk_effects.js`(보행 시 시각효과) / `lumen_visual_effects.js`(공간 시각효과) 가 입력으로 받음)
- 12축 emotion_vec = 변주 픽 입력 자리 (`pickDriftUtterance` 가 받음)

### 읽을 파일
1. **W1S1 보고 결과** — `EMA_ALPHA` 정확값 + 갱신 단위 + 4축 룰 + 기존 메서드 시그니처
2. [`js/core/ContaminationTracker.js`](js/core/ContaminationTracker.js) — 본 세션이 *수정* 할 파일. 기존 메서드 스타일 그대로 따름.
3. [`test/unit/contaminationTracker.test.js`](test/unit/contaminationTracker.test.js) — 기존 회귀 가드. 본 세션이 *연장* 할 파일.

### 작업
1. `ContaminationTracker` 클래스에 다음 메서드 추가:
   - `updateEmotionVec(turnEmotionVec)` — 매 턴 12축 emotion_vec 입력받아 누적 EMA 업데이트
   - `getCumulativeEmotionVec()` — 현재 누적값 반환
   - `getDriftVector(baselineEmotionVec)` — 누적값 - 베이스라인 = 변위 벡터 반환 (회차 시작 fp 가 베이스라인)
   - `resetEmotionVec()` — 회차 시작 시 호출 (또는 새 메모리 진입 시)
2. 시그니처 예:
   ```js
   updateEmotionVec(turnEmotionVec) {
     // turnEmotionVec = { 축1: 값, 축2: 값, ..., 축12: 값 }
     for (const axis of EMOTION_AXES_12) {
       const prev = this._cumulativeEmotionVec[axis] || 0;
       const curr = turnEmotionVec[axis] || 0;
       this._cumulativeEmotionVec[axis] = EMA_ALPHA * curr + (1 - EMA_ALPHA) * prev;
     }
   }
   ```
3. `EMOTION_AXES_12` 상수 = 12축 라벨 정의. W1S1 (e) 답에서 `ghost_variants.emotion_vec` 가 어떤 축들인지 받아서 그대로 박음 (또는 [`docs/오염벡터_계산_구현_명세_v2-260327.md`](docs/오염벡터_계산_구현_명세_v2-260327.md) 명시).
4. vitest 케이스 4 자리 추가:
   - (a) 초기 상태 = 모든 축 0
   - (b) 1턴 입력 후 = `EMA_ALPHA × turnVec` (이전 0)
   - (c) 5턴 입력 후 = 수렴값 손계산 일치
   - (d) reset 후 = 다시 모든 축 0

### 결정할 것
- (a) `EMOTION_AXES_12` 상수 자리 = `ContaminationTracker.js` 안 vs 별도 [`js/core/emotion_axes.js`](js/core/emotion_axes.js)(12축 라벨 상수)
- (b) baseline 입력 자리 — 회차 시작 fp 를 어디서 받아서 어떻게 박는지

### 출력 형식
- `ContaminationTracker.js` 수정 (메서드 4개 + 상수)
- vitest 회귀 (기존 케이스 PASS + 신규 4 케이스 PASS)
- 채팅 보고 (메서드 시그니처 + 회귀 통과 수)

### 차단/막는 자리
- α1 (pickDriftUtterance) — `getCumulativeEmotionVec` / `getDriftVector` 사용
- α2 (opening.js wiring) — `updateEmotionVec` 매 턴 호출 / `resetEmotionVec` 회차 시작 호출

---

## W2S3 — V2-2 admin 12축 emotion_vec 입력 UI

### 목표
admin 유령 변주 풀 입력 도구에 12축 좌표 입력 UI 추가. 작가가 변주 작성 시 발화 텍스트 + motif_tags + attribution + **12축 emotion_vec** 박을 수 있음.

### 컨텍스트
SCOPE V2-2 = admin 유령 변주 풀 도구 (drift 변주 + speciation 시드 입력). 5-3 시점에 `test/smoke_v21_admin_ghost_variants.js` 박혔는데 작가 손 검증 미완. 본 세션이 *12축 입력 자리 추가* + 본인 손 검증 1번.

12축 입력 UI 옵션:
- (i) 12 슬라이더 (가장 단순, 작가 학습 부담 ↑)
- (ii) 12 숫자 입력 (정밀, 직관 X)
- (iii) PCA 2D 투영 + 클릭 (시각적, 12축 입력 자유도 X — 2D 평면에 박힘)
- (iv) 텍스트 → emotion 분석 자동 추출 (claude-scene 호출 — 결정론 룰 베이스 OK, LLM 판정 X)

권장 = (i) + (iv) 둘 다. 작가가 텍스트 박으면 자동 emotion 추출이 12축 슬라이더 default 값 박고, 작가가 손으로 조정.

### 읽을 파일
1. [`js/admin/ghost_variants_editor.js`](js/admin/ghost_variants_editor.js) — admin 변주 풀 입력 모듈. 본 세션이 *수정* 할 파일.
2. [`admin.html`](admin.html) — admin 페이지 진입 자리. 변주 풀 섹션 DOM
3. [`js/admin.js`](js/admin.js) — admin 메인 모듈
4. [`test/smoke_v21_admin_ghost_variants.js`](test/smoke_v21_admin_ghost_variants.js) — 5-3 박힌 smoke. 본 세션이 *연장* 할 파일.
5. [`supabase/functions/contaminate-text/`](supabase/functions/contaminate-text/) 또는 `claude-scene` 엣지 함수 — emotion 추출 호출 자리 (텍스트 → 12축 emotion_vec)

### 작업
1. `ghost_variants_editor.js` 에 12축 입력 섹션 추가:
   - 12 슬라이더 (라벨 = `EMOTION_AXES_12` 상수, W2S2 와 공유)
   - "텍스트에서 자동 추출" 버튼 (utterance 텍스트 → claude-scene 호출 → 12축 default 박힘)
   - 저장 시 `ghost_variants.emotion_vec` 컬럼 jsonb 로 박힘
2. CSS 살짝 (`admin.html` 또는 별도 css) — 슬라이더 12개 정렬 + 라벨 + 현재값 표시
3. smoke 연장:
   - DOM 엘리먼트 (슬라이더 12개) 존재
   - "자동 추출" 버튼 클릭 → 슬라이더 default 박힘
   - 저장 → DB 행에 `emotion_vec` jsonb 박힘
4. **본인 손 검증 (W2S3 끝나면 채팅으로 사용자에게 1번 돌려보고 받기)**:
   - drift 변주 5개 + speciation 시드 1개 입력·저장
   - 12축 좌표 작가가 직관적으로 박을 수 있는지 체감

### 결정할 것
- (a) 12 슬라이더 + 자동 추출 vs 다른 UI 형태 (W1S4 작가 페이스 베이스라인 입력)
- (b) `EMOTION_AXES_12` 상수가 W2S2 와 같은 자리에서 import 하는지 (단일 진실 자리)
- (c) "자동 추출" 호출이 결정론적인지 — claude-scene 의 emotion 분석은 결정론 가능하지만 prompt 변경 시 결과 다름. 모델/프롬프트 버전 박기.

### 출력 형식
- `ghost_variants_editor.js` + CSS 수정
- smoke 연장 (~10 케이스 추가)
- 작가 손 검증 1 사이클 결과 보고

### 차단/막는 자리
- V2-10 콘텐츠 작성 시작 (작가가 변주 풀 박는 자리)
- W1S4 페이스 베이스라인 입력 받음

---

## W2S4 — V2-7 귀환 toast 컴포넌트

### 목표
회차 끝 메뉴 복귀 시 띄울 토스트 (잠깐 떴다 사라지는 작은 알림 박스) 컴포넌트 박기. wiring 은 α2 에서.

### 컨텍스트
V2.1 SCOPE V2-7 = "당신이 만든 새 유령이 이 메모리에 머물고 있다" 1회 toast. 0.5일.

기존 toast 패턴 = [`play-test.html:3212`](play-test.html#L3212) `showTypoCorrectionToast`(오타 교정 알림 박스) — 입력 패널 안 host 에 insertBefore. 본 세션은 *메뉴 화면 자리* 에 toast 박는 자리라 host 가 다름.

S1 결정 (drift decay) 디테일에 따라 trigger 조건 (a) 답 영향. 본 세션은 *컴포넌트 자체* 만 박고 trigger 는 wiring 자리 (α2).

### 읽을 파일
1. [`play-test.html:3212-3236`](play-test.html#L3212) `showTypoCorrectionToast` — 패턴 재활용 자리
2. [`index.html`](index.html) — 메뉴 화면 DOM 구조 (toast host 자리 박을 컨테이너)
3. [`js/index.js`](js/index.js) — 메뉴 진입 자리 (toast 띄울 시점)
4. [`js/ui/notify.js`](js/ui/notify.js) `showNpcDialogue`(NPC 대사 박스) — 유사 패턴
5. [`css/index.css`](css/index.css) — 기존 fade/toast 어휘 자리 + TEM 톤 (흐림/잔상)

### 작업
1. 신규 파일: [`js/ui/return_toast.js`](js/ui/return_toast.js)
2. API:
   ```js
   export function showReturnToast({ memoryTitle, kind, durationMs = 6000 }) {
     // kind = 'speciation' | 'drift' (S1 결정에 따라)
     // 메뉴 우하단 fixed 자리에 박힘
     // memoryTitle 기반 어휘 박기
     // durationMs 후 fade-out + remove
     // 클릭 시 즉시 fade-out
   }
   ```
3. CSS — `position: fixed; bottom: 24px; right: 24px;` + opacity transition + TEM 톤 (회색 베이스 + 얇은 세리프 또는 타자기체)
4. 어휘 (정문):
   - speciation: "당신이 만든 새 유령이 〈메모리 제목〉에 머물고 있다"
   - drift (S1 결정에 따라): 잔향 알림 어휘 또는 toast 자체 X
5. smoke 또는 콘솔 테스트:
   - `window.showReturnToast({ memoryTitle: '테스트' })` 호출 → 토스트 뜸 → 6초 후 사라짐
   - 클릭 → 즉시 사라짐
   - SCOPE 작업 원칙 8 (c) "콘솔 테스트 옵션" 적용 — DOM/시각만이라 vitest 강제 X

### 결정할 것
- (a) 노출 시간 6초 vs 다른 값 (정문 2줄 읽는 베이스라인)
- (b) 자리 우하단 vs 다른 자리 (메뉴 화면 빈 공간 확인 후)
- (c) drift 잔향 toast 자리 — S1 결정 디테일에 따라 trigger 추가 vs X
- (d) fade 어휘 = opacity / translateY / scale (TEM 톤 정합)
- (e) 재활용 vs 신규 — `showTypoCorrectionToast` 코드 재활용 가능량 측정

### 출력 형식
- 신규 [`js/ui/return_toast.js`](js/ui/return_toast.js)
- CSS 수정 (또는 모듈 안 inline)
- 콘솔 테스트 1 사이클 결과 보고

### 차단/막는 자리
- α2 (opening.js wiring) — 회차 끝에서 호출하는 자리
- W1S3 design 의 (e) 시퀀스 끝 자리

---

# α — 직렬 자리 (Wave 2 완료 후)

## α1 — `pickDriftUtterance` 함수 + vitest

### 목표
S2/S3 plan 의 2단계 픽 알고리즘 박기. 글로벌 좁힘 → 회차 변위 softmax 픽 + 필터 점진 풀기 + 직전 변주 패널티.

### 컨텍스트
S3 plan A2 (B 2단계):
1. **회차 시작 시**: 글로벌 누적 벡터 (`memories.cumulative_emotion_vec`) 가까운 변주 N개 활성 풀 좁힘
2. **회차 진행 중**: 활성 풀 안에서 회차 변위 벡터 (`getDriftVector`) softmax 가중 확률 sampling

A3 fallback:
- 활성 풀 0 → 필터 풀기 (모티프 → 귀인만 → 무필터). 어떻게든 픽 시도.
- 진짜 0 (전체 풀 빔) → 작가 폴백 문구 호출 (α2 에서 wire)
- 본 유령 silent fallback 절대 X

V2-12 위임 자리 (본 세션 박지 X):
- softmax temperature 값
- 활성 풀 N
- 직전 변주 패널티 강도
- transition_pattern 입력 여부

### 읽을 파일
1. [`js/core/SeekerMatchEngine.js`](js/core/SeekerMatchEngine.js) — `pickGhostVariant`(매칭 1등 결정성 픽) 패턴 참조 + `scoreCard` 가중치 룰 + score=0 → null 룰
2. **W1S1 보고** — `ghost_variants.emotion_vec` 차원수 + axes 라벨
3. **W2S1 마이그레이션** — `memories.cumulative_emotion_vec` / `plays.final_drift_vector` 자리
4. **W2S2** — `ContaminationTracker.getDriftVector` API
5. [`test/smoke_v21_match_engine.test.js`](test/smoke_v21_match_engine.test.js) — 기존 매칭 엔진 회귀 가드 (44 케이스). 본 세션 vitest 패턴 참조.

### 작업
1. 신규 파일: [`js/core/DriftPicker.js`](js/core/DriftPicker.js) (또는 `SeekerMatchEngine.js` 안 추가 — 분리 권장)
2. 함수 시그니처:
   ```js
   /**
    * @param {Object} opts
    * @param {Object} opts.cumulativeEmotionVec — memories.cumulative_emotion_vec
    * @param {Object} opts.driftVector — 회차 시작 fp 기준 변위 (W2S2 getDriftVector 결과)
    * @param {Array} opts.ghostVariants — kind='drift' 변주 풀 전체
    * @param {Object} opts.fingerprint — { motif_words, attribution }
    * @param {String|null} opts.lastVariantId — 직전 사용 변주 (없으면 null)
    * @param {Object} opts.tuning — { temperature, narrowN, lastPenalty }
    * @returns { variant, driftVectorAtPick, fallbackKind }
    */
   export function pickDriftUtterance(opts) { ... }
   ```
3. 알고리즘:
   - **Step 1 글로벌 좁힘**: variants 중 cumulativeEmotionVec 와 cosine 거리 가장 가까운 N개 (default N=8)
   - **Step 2 의미 필터**: motif_tags 일치 → attribution 일치 → 필터 빔
   - **Step 3 softmax 픽**: 좁힌 풀 + 필터 후, 각 variant 의 emotion_vec 와 driftVector 간 cosine 유사도 → softmax(temperature) 확률 sampling
   - **Step 4 직전 패널티**: lastVariantId 와 같으면 확률 ×0.3 (또는 tuning.lastPenalty)
   - **Step 5 fallback**: 풀 빔 시 fallbackKind = 'narrative_silence' 반환 (variant=null)
4. vitest 25 케이스 (`test/smoke_v21_drift_picker.test.js` 신규):
   - 글로벌 좁힘 (3 케이스)
   - 의미 필터 풀기 (4 케이스)
   - softmax sampling 결정론 (random seed 고정 시 재현, 5 케이스)
   - 직전 변주 패널티 (3 케이스)
   - fallback 풀 빔 (2 케이스)
   - 100회 동일 입력 → 분포 검증 (1 케이스)
   - 사용자 메모리 [V2-4 핸드오프](C:/Users/user/.claude/projects/d--The-Etched-Mutation/memory/project_v24_branch_trigger_handoff.md) 의 score=0 룰 회귀 (3 케이스)
   - 결정 자리 (4 케이스)

### 결정할 것 (V2-12 까지 default 박기)
- (a) softmax temperature default = 0.5 (V2-12 튜닝)
- (b) 활성 풀 N default = 8 (V2-12 튜닝)
- (c) 직전 패널티 default = 0.3 (V2-12 튜닝)
- (d) random seed = 결정성 테스트용 fixed seed 옵션 박기 (Math.random 대체)

### 출력 형식
- 신규 [`js/core/DriftPicker.js`](js/core/DriftPicker.js)
- 신규 [`test/smoke_v21_drift_picker.test.js`](test/smoke_v21_drift_picker.test.js) (25 케이스)
- vitest 회귀 통과 (전체 + 신규)

### 차단/막는 자리
- α2 (opening.js wiring) — `pickDriftUtterance` import + 호출

---

## α2 — opening.js wiring + 폴백 문구 26개

### 목표
멀티턴 흐름 안에서 *매 턴* `ContaminationTracker.updateEmotionVec` 호출 + *회차 끝* `pickDriftUtterance` 호출 + 도장 박기 + V2-7 toast 호출. 추가로 폴백 문구 26개 (한국어 13 + 영어 13) 박기.

### 컨텍스트
S3 step 4 = "opening.js / play 진입 wiring + 회차 끝 시점 plays 행에 ghost_variant_id + final_drift_vector 박기". S4 권고 = "매 턴 EMA hook" 박기. 둘 다 본 세션.

폴백 문구 = α1 의 fallbackKind = 'narrative_silence' 시 toast 또는 화면에 띄울 어휘. CLAUDE.md §6.5 #4 "Fallback has narrative justification" 정합. 예: "이 기억은 잠시 침묵한다", "가장 가까운 잔향이 떠오른다".

### 읽을 파일
1. [`js/app/opening.js`](js/app/opening.js) — `_handleOpeningSubmit`(오프닝 멀티턴 제출 핸들러) 통째. 본 세션이 *수정* 할 파일.
2. [`js/core/SeekerFingerprint.js`](js/core/SeekerFingerprint.js) — fingerprint 누적 자리. 매 턴 EMA hook 박을 자리 후보.
3. **W2S2 ContaminationTracker** — `updateEmotionVec` / `getDriftVector` / `resetEmotionVec` API
4. **α1 DriftPicker** — `pickDriftUtterance` API
5. **W2S4 return_toast** — `showReturnToast` API
6. **W1S3 design 문서** — 회차 끝 시퀀스 timeline (어디서 무엇 호출)
7. [`memories`](docs/LUMEN_DEMO_SCOPE-260429.md) 테이블 — `cumulative_emotion_vec` 갱신 자리

### 작업
1. **opening.js 수정**:
   - 회차 시작 (멀티턴 첫 진입) → `tracker.resetEmotionVec()` + 회차 시작 fp 저장 (`baselineEmotionVec`)
   - 매 턴 끝 → `tracker.updateEmotionVec(turnEmotionVec)` + `dialog_turns` 누적
   - 회차 끝 → `decideBranch` (V2-4 기존) + `pickDriftUtterance` (α1) + `plays` 행 도장 + (speciation 시 toast)
2. **plays 행 도장**:
   ```js
   const driftVector = tracker.getDriftVector(baselineEmotionVec);
   const picked = pickDriftUtterance({
     cumulativeEmotionVec: memory.cumulative_emotion_vec,
     driftVector,
     ghostVariants: variants.filter(v => v.kind === 'drift'),
     fingerprint: fp,
     lastVariantId: sessionStorage.getItem('tem_last_variant_id'),
     tuning: { temperature: 0.5, narrowN: 8, lastPenalty: 0.3 }
   });
   await db.plays.update(playId, {
     ghost_variant_id: picked.variant?.id || null,
     final_drift_vector: driftVector,
   });
   sessionStorage.setItem('tem_last_variant_id', picked.variant?.id || '');
   ```
3. **memories 글로벌 누적 갱신**:
   - 회차 끝마다 그 메모리의 `cumulative_emotion_vec` 도 EMA 갱신 (다른 사람 plays 누적값과 본 회차 변위 합성)
   - 또는 *RPC / Edge function* 자리에서 갱신 (트리거 자리 결정 — W1S1 (d) 답 참조)
4. **toast 호출**:
   - decideBranch.kind === 'speciation' → `showReturnToast({ memoryTitle, kind: 'speciation' })`
   - decideBranch.kind === 'drift' + S1 결정에 따라 → drift 잔향 toast (또는 X)
5. **폴백 문구**:
   - 신규 파일 [`js/content/narrative_fallback_strings.js`](js/content/narrative_fallback_strings.js)
   - 26 문장 (한국어 13 + 영어 13). 작가 손 자리. 메인 세션이 채팅에서 1차 박고 작가가 손질.
   - 예시:
     - "이 기억은 잠시 침묵한다."
     - "가장 가까운 잔향이 떠오른다."
     - "기억의 빈틈이 다른 장면을 끌어당긴다."
   - α1 fallbackKind === 'narrative_silence' 시 호출
6. smoke 또는 콘솔 테스트:
   - 멀티턴 풀 사이클 (3턴) → fingerprint 누적 → 회차 끝 → plays 행 도장 박힘 → toast 뜸 (또는 폴백)
   - 콘솔에서 `await db.plays.select(playId)` → ghost_variant_id + final_drift_vector 박혀 있음

### 결정할 것
- (a) 매 턴 EMA hook 자리 = `_handleOpeningSubmit` 안 vs `SeekerFingerprint` 안
- (b) `memories.cumulative_emotion_vec` 갱신 자리 = 클라이언트 직접 update vs Edge function vs DB 트리거 (W1S1 (d) 답 참조)
- (c) 폴백 문구 13 테마 = 작가 손에 위임 (메인 세션이 1차 박고 작가가 손질)
- (d) drift toast trigger 여부 = S1 결정 디테일 받은 후

### 출력 형식
- `opening.js` 수정
- 신규 `js/content/narrative_fallback_strings.js`
- 콘솔 테스트 1 사이클 결과
- vitest 또는 smoke (자동화 가능 부분만)

### 차단/막는 자리
- 본 세션 = 오늘 작업의 끝 자리. 다음 자리 = V2-2 admin 작가 손 검증 / V2-10 콘텐츠 작성 시작 / V2-12 튜닝 (5-11~5-12) / 5-6 통합 체크포인트.

---

# 통합 체크포인트 (5-6 SCOPE §8-1)

오늘 작업 끝나면 다음 검증 (메인 세션 작가 손 1번):
- [ ] admin 유령 변주 풀 도구 (W2S3) 로 drift 변주 5개 + speciation 시드 1개 입력·저장 풀 사이클
- [ ] 멀티턴 대화 입력 (V2-3) → emotion 분석 → 분기 트리거 (decideBranch) → 변주 픽 (pickDriftUtterance) → toast (V2-7) 풀 사이클 1회
- [ ] 콘솔 에러 0건
- [ ] vitest 회귀 (전체) 통과

체크포인트 FAIL 시 SCOPE §11 시나리오 (시나리오 A 코드 슬립 임계 진입).

---

# 5-19 까지 남은 자리 (todo.md 외)

본 todo.md 끝나도 V2.1 SCOPE 아래 자리들 박을 게 남음:
- V2-5 오염 카메라 연출 (사용자 본인이 가져감)
- V2-10 콘텐츠 작성 (영문 메인 + 한국어 시드, V2-2 admin 검증 후 시작)
- V2-11 통합 디버깅 (5-11)
- V2-12 튜닝 (5-12) — softmax temperature, classifyBranch 임계 깎기, drift toast 자리, 폴백 문구 손질
- V2-13 파일럿 5~7명 (5-13~5-14)
- V2-14 statement·증거 패키지·영상 (5-15~5-18)
- V2-15 제출 (5-19)

오늘 작업이 V2-1 / V2-2 / V2-3 / V2-4 / V2-6 / V2-7 의 *대부분* 박힘. V2-5 / V2-10 / V2-11 / V2-12 / V2-13 / V2-14 / V2-15 가 다음 자리.

---

# 진행 상태 (메인 세션이 작업 중 갱신)

- [x] W1S1 — cont_drift α + EMA audit (2026-05-04 완료 — α=0.10, ghost_variants.emotion_vec=12축 jsonb, _applyContaminationAtEnd 가 회차 끝 트리거. 5 답 채팅 보고)
- [x] W1S2 — Tripo viability (2026-05-04 결정 — Tripo V3 이월, V2.1 = Mixamo Y-Bot + 자세 그룹 2~3개 + emotion_vec 자동 매핑)
- [ ] W1S3 — V2-15 endscreen polish design
- [ ] W1S4 — Lumen 출품 양식 + 콘텐츠 분배
- [x] W2S1 — migration SQL (2026-05-04 완료 — supabase/migrations/20260504000000_v21_drift_pick_vectors.sql 박음 + Supabase MCP apply_migration 운영 DB 적용. memories.cumulative_emotion_vec / plays.ghost_variant_id / plays.final_drift_vector 3 컬럼 추가.)
- [x] W2S2 — ContaminationTracker 12축 EMA (2026-05-04 마감 — updateCumulativeEmotionVec / computeDriftVector 이미 박혀있음 (ContaminationTracker.js:300-333) + vitest 22 케이스 통과 (test/unit/contaminationTracker.test.js:491-583). 매 턴 hook + reset 자리는 α2 opening.js wiring 안에서 박음.)
- [ ] W2S3 — V2-2 admin 12축 UI (사용자 결정 박힘 2026-05-04: 작가 수정권 0 + 메타데이터 가산점 룰 + pre-flight calibration. 사전 작업 완료:)
    - [x] claude-scene emotion_extract 결정론 fix (2026-05-04 — temperature: 0 + PROMPT_VERSION "tem-emotion-v2.1.0" 응답에 박음. version 19→20 배포)
    - [x] ghost_variants.extractor_version 컬럼 추가 (2026-05-04 — supabase/migrations/20260504010000_v21_ghost_variants_extractor_version.sql 적용)
    - [x] pre-flight calibration 도구 (2026-05-04 — test/emotion_calibration.html. 사용자 손 작업 대기)
    - [x] **사용자 손 작업** — calibration 돌림 (2026-05-04 — "정확하게 뽑는다" 검증 OK. 어긋난 자리 없음. 프롬프트 v2.1.0 그대로 유지)
    - [x] 메타데이터 가산점 룰 (2026-05-04 — emotion_extract_helper.js 의 ATTRIBUTION_BOOST + CORE_FEAR_BOOST. attribution=self_blame → guilt+0.3 등 default 값. V2-12 튜닝 자리)
    - [x] admin 변주 풀 도구 본 수정 (2026-05-04 — ghost_variants_editor.js 12 슬라이더 폐기 → "자동 추출" 버튼 + 12축 막대그래프 읽기 전용 + extractor_version 도장. 추출 전 저장 차단. 사용자 손 검증 대기)
- [~] W2S4 — V2-7 return toast 컴포넌트 (2026-05-04 폐기 — SCOPE V2-7 [x] 이미 박힘 (lumen_run_outro.js 가 정문 자리). todo.md W2S4 핸드아웃 자체가 SCOPE 갱신 못 따라간 stale 자리. 본 세션이 박은 js/ui/return_toast.js + index.html script 태그 모두 되돌림.)
- [ ] α1 — pickDriftUtterance + vitest
- [ ] α2 — opening.js wiring + 폴백 문구 26개 (자동 생성 자리만 2026-05-04 완료:)
    - [x] buildSpeciationRow 에 extractor_version 추가 (GhostBranchTrigger.js)
    - [x] SeekerFingerprint 에 extractor_version 슬롯 + mergeTurn 누적 (마지막 emotion_extract 응답)
    - [x] opening.js _analyzeTurnText 가 prompt_version 을 turnResult 에 포함
    - [x] insert-ghost-variant Edge function 신규 + 배포 (anon → service_role 우회, validation 포함)
    - [x] opening.js wiring — speciation 시 buildSpeciationRow + Edge function 호출 + sessionStorage 기록 (사용자 손 검증 대기)
    - [ ] 폴백 문구 26개 (한국어 13 + 영어 13) — 별도 자리, V2-12 튜닝 시점
    - [ ] drift 잔향 toast trigger — 별도 자리, S1 결정 후

체크 = `[x]` 로 변경. 부분 완료 시 sub-bullet 추가.

---

# 2026-05-04 늦은 결정 — ego-state turn-taking 차용 (V2.1.1)

문서: [docs/유령대화_egostate_차용-260504.md](docs/유령대화_egostate_차용-260504.md)

5-2 사용자 본인 결정 (`maxFreeDialogTurns: 1`) 의 5-4 번복. 임상 ego-state therapy 의 turn-taking 구조 한 자리만 차용 (프레임 거부 — integration / 치유 / fixation 병리화 X).

근거: 현재 1턴 구조의 약점 4종 — (가) 유령이 안 듣는다 / (나) 작가 ghostwriter 모드 / (다) drift 회차 안에서 가시화 X / (라) 작품 명제 §2 마찰점 X.

본 세션 (5-4) 박은 자리들이 이 차용을 *진짜 작동* 시킴:
- α2 자동 생성 wiring → 시나리오 C (두 번째 플레이어 → speciation → 세 번째 플레이어 만남)
- emotion_extract 결정론 fix (temperature 0 + PROMPT_VERSION) → 매 턴 alignment 일관성
- ghost_variants 통합 풀 활용 (응답 풀 = 변주 풀, 사용자 답 #3)

## 사용자 답 5개 (의심 자리 해소)
1. 톤 ("연결사 + 자기 문장") = 의식하고 진행. 톤 손실 최소화 룰을 가이드 (세션 2) 가 박음
2. 분량 폭발 = "해봐야 안다". 1 씬 풀 사이클 시간 측정 (smoke 추가)
3. 응답 풀 = 변주 풀 통합 = ghost_variants 그대로
4. 일정 = 본 세션 큰 자리 박았으니 OK
5. decideBranch 자리 = 매 턴 응답 픽 (LumenGhostResponse) ≠ 회차 끝 분기 결정 (GhostBranchTrigger). 둘이 분리. decideBranch 회차 끝 1회만.

## 차용 후 작업 순서

| # | 자리 | 시간 | 상태 |
|---|---|---|---|
| 1 | 차용 코드 — lumen_dialog_phase1.js 1턴→3턴 + 풀 픽 시그니처 + smoke | 0.5~1일 | [x] 2026-05-05 (세션 1 디버깅 끝) |
| 2 | V2-10 가이드 — docs/유령응답풀_가이드_v1-260504.md (응답 풀 = ghost_variants 통합, 3결 자동 분류) | 4시간 | [x] 2026-05-04 (세션 2 박음) |
| 3 | 작가 손 1 씬 시도 — 발자국 1 씬에 응답 풀 박고 풀 사이클 직접 돌림. 톤·분량 검증 | 1~2시간 | ⬜ |
| 4 | 본격 콘텐츠 — dialog_choices + 응답 풀 변주 + echo_words 통합 (발자국 + 다른 메모리) | 1~3일 작가 손 | ⬜ |
| 5 | status='alive' SQL — 5/13 파일럿 직전 | 5초 | ⬜ |

---

# 2026-05-05 — V2.1.2 슬롯 흡수 (scope change)

문서: [docs/슬롯흡수_차용-260505.md](docs/슬롯흡수_차용-260505.md)

V2.1.1 멀티턴에 *플레이어 입력 내용 흡수* 자리 추가. 자유텍스트 → 한국어 명사구 NER → 작가 박은 슬롯 변주 (`"...그래. 맞아. {대상}을(를) 기다렸어."`) 채움 → 유령이 받아침 → ghost_variants 새 drift row 자생 (`is_seed=false`, `parent_variant_id=본_유령`). 다음 플레이어 풀에 자동 들어감.

작품 명제 §2 ("관객 파편이 다음 관객 유령으로 흘러간다") 가장 강력한 형태. 시나리오 D (자생 새 유령 0건) 위험 자동 감소.

## 박힌 자리 (5/5 코어 흐름)

| 자리 | 상태 |
|---|---|
| SCOPE V2.1.2 §0-A 갱신 | [x] |
| `insert-ghost-variant` Edge fn 확장 (`kind: 'drift'` 허용 + 메모리당 흡수 변주 상한 30) | [x] 코드 (운영 배포 미확인) |
| 차용 문서 [docs/슬롯흡수_차용-260505.md](docs/슬롯흡수_차용-260505.md) | [x] (304줄) |
| `js/core/SlotAbsorber.js` 신규 모듈 — 한국어 NER + 슬롯 채움 | [x] (230줄) |
| `lumen_dialog_phase1.js _backgroundInsertAbsorbed` 통합 — turn 응답 자리에 tryAbsorb + 흡수 시 비동기 INSERT | [x] (L313) |
| smoke 가드 [test/smoke_v21_slot_absorb.js](test/smoke_v21_slot_absorb.js) | [x] (185줄) |

**1일 카운터 룰 통과**. 시나리오 C 폴백 X.

## 미박힌 자리

| 자리 | 시급 | 비고 |
|---|---|---|
| `safety.js` 입력 필터 강화 (고유명사 일반화 + 트롤링) | 높음 | absorb/slot/trolling grep 결과 0. SCOPE L47 명시 자리 미박힘 |
| 작가 슬롯 변주 콘텐츠 (발자국 1 슬롯이라도) | 중간 | 작가 손. 검증 자리 입력 |
| `insert-ghost-variant` Edge fn 운영 배포 (v2) | 중간 | 코드 수정만, 배포 미확인 |
| 작가 손 1 씬 시도 (3번) — 슬롯 흡수 풀 사이클 검증 포함 | 중간 | safety + 슬롯 변주 박힌 후 |

1+2 = 다른 세션에서 병렬 (cold-start 핸드아웃 채팅에 박힘). 3 = 1+2 후 검증.

## 본 세션 (5-4) 박은 발자국 메모리 디버깅 자리 (todo.md 외)
- 응결점 임계값 0 (첫 자리만, 1인 테스트 데드락 회피)
- play-test.html:5141 가드 완화 (시스템 전체 마네킨 0 fix)
- 씬 텍스트 70~120자 압축 (E-004 패턴 정합)
- scenes.meta.stage_position 6 핀 정육각형 SQL 박음

## 정공법 자리 (V2-10 본격 콘텐츠 흡수)
- dialog_choices 박힌 메모리 0개 = chat 진입 자체 불가 자리 = 5/13 파일럿 전 정공법 박혀야 함
- echo_words 박힌 메모리 일부만 = 응결 잔상 sprite 작동 위해 박음
- 둘 다 위 작업 4번에 흡수

---

# 다음 세션 cold-start 가이드

각 세션 시작 시 무조건:
1. 본 todo.md 의 "오늘 시점 결정 요약" 섹션 + 본 세션 핸드아웃 통째 읽기
2. 메모리 [매트릭/엔진/감쇠 룰 — 기존 자산 grep 후에 제안](C:/Users/user/.claude/projects/d--The-Etched-Mutation/memory/feedback_reuse_existing_assets_first.md) 적용 — 새 함수 박기 전 grep 무조건
3. CLAUDE.md (특히 §3 자주 틀리는 패턴 + §4 TEM 핵심 용어 사전 + §6.5 Critical Design Principles) 적용
4. SCOPE.md ([`docs/LUMEN_DEMO_SCOPE-260429.md`](docs/LUMEN_DEMO_SCOPE-260429.md)) 의 본 세션 자리 확인 — 스코프 밖 작업 거절 룰
5. 작업 끝나면 본 todo.md "진행 상태" 체크박스 갱신 + 채팅에 보고

작업 충돌 발생 시 (다른 세션이 같은 파일 수정 중) → 해당 세션 끝날 때까지 대기 + 메인 세션에 보고.

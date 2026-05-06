# LUMEN 2026 DEMO SCOPE

**제출 마감**: 2026-05-23
**안전 마감**: 2026-05-19 (buffer 4일)
**작성**: 2026-04-21
**기반 문서**: `docs/update_lumen-260420.md`, IMA 비평 판정 (2026-04-20, 83점 B+)
**최근 갱신**: 2026-04-29 — **scope change V2 → V2.1 같은 날 두 번 좁힘**. 09시 V2 통합 form (작가 quilt + 플레이어 quilt + cell 분기) 재계약 → 같은 날 V2.1 좁힘 (quilt/지형분기 V3 이월, 단일 공간 + 멀티턴 + 유령 단위 분기 + 오염 카메라 연출). V1 history = `LUMEN_DEMO_SCOPE-260427.md`. V2 풀판 history 별도 보존 X (V2 09시 재계약과 V2.1 좁힘 같은 날·한 커밋).

---

## 0. 이 문서의 성격

계약서다. 문서 밖 작업은 Lumen 스코프 밖이다.
새 아이디어는 `docs/V3_backlog-260429.md`로 이월한다.
이 문서를 수정하려면 명시적 결정 필요 — 커밋 메시지에 "scope change" 태그.

---

## 0-Z. 한눈 체크박스 (2026-05-05 갱신, 매일 갱신 자리)

> **본인 매일 보는 자리.** 본문 §0-A ~ §17 = 결정 기록·근거·시나리오·이론 자료 (다음 작업자/박사 자료). 매일 작업 자리만 한눈에 보고 싶으면 본 §0-Z 만 펼침.

### ✓ 박힌 자리 (시간 순)
- [x] 작업 0 매칭 엔진 prequel (5-03) — `js/core/SeekerMatchEngine.js`, vitest 44 케이스
- [x] V2-1 DB 모델 — `ghost_variants` 테이블 + `plays.dialog_turns` (5-03)
- [x] V2-3 멀티턴 fingerprint 파이프라인 (5-03 코드, 작가 손 검증 미완)
- [x] V2-4 분기 트리거 — `GhostBranchTrigger.decideBranch` (5-03)
- [x] V2-7 귀환 outro — `LumenRunOutro` (5-04 완료, 작가 손 검증 미완)
- [x] V2.1.1 ego-state turn-taking 차용 — `lumen_dialog_phase1.js` 멀티턴 3턴 (5-04)
- [x] V2.1.2 (α) 자동 분류 풀 주입 — `_loadAndInjectGhostPools` (5-05)
- [x] V2.1.2 (β) 슬롯 흡수 — `SlotAbsorber.js` + dialog_phase1 통합 + 발자국 슬롯 변주 7개 + safety 강화 (5-05 commit f021c32, ef2a5e5)
- [x] V2.1.2 (γ) LLM 흡수 Haiku 4.5 — `absorb-slot` edge function, 휴리스틱 NER false positive 결정 번복 (5-05 commit 2c1fdc9)
- [x] V2.1.2 (δ) 콘텐츠 fallback 하이브리드 — `generate-dialog-choices` edge function + 작가 손 우선 + Haiku 자동 + 균일 톤 안전망 (5-05 commit e4eb249)
- [x] V2.1.2 (δ-2) oneScene + 백그라운드 — first 진입 timeout fix (5-06 commit d641f0a, deploy 끝). 본문 §V2.1.2 (δ-2) 참조.
- [x] V2.1.2 (ε) 학습된 유령 자유 대화 — `dialog-turn` edge function + ghost_variants 학습 (5-06 commit 93cbee7, deploy 끝 5-06 19:48 KST). 작가 손 검증 (5-06): *공원에서* drift row 6개 자생. 풀 사이클(다음 플레이어 조우 + 캐시 hit 토큰 검증)은 파일럿 단계. 본문 §V2.1.2 (ε) 참조.
- [x] plays insert + game.traces push — generate-reveal 자리 visits 입력 (5-05 commit c0319f8)
- [x] **작가 손 검증** (5-05) — 발자국 메모리 27 흡수 drift row 자생 박힘 확인 (β 메커니즘 작동). 흡수 응답 톤 자연 박힘. 다음 플레이어 시연 = 풀 픽 자동 박힘 자리.
- [x] ABSORB_DRIFT_CAP 30 → 50 — `insert-ghost-variant/index.ts` + SCOPE + 차용 문서 갱신 (5-05 commit 6467297, deploy 끝 5-06 13:27 KST = `insert-ghost-variant` version 3 updated_at). 작가 손 검증 27/30 임박 자리 사용자 결정 (C).
- [x] **V2-2 admin 유령 변주 풀 도구 작가 손 검증** (5-06) — admin.html 진입 → 발자국 메모리 편집 → 유령 변주 풀 섹션 풀 사이클 (카드 추가 + utterance + 자동 추출 + 메타 dropdown + 저장 → `ghost_variants` row 박힘) 정상 작동. 코드 자산은 5-03 박힌 `js/admin/ghost_variants_editor.js` (526줄) + admin.html `#ghostVariantsSection` 마크업 (line 299~306) + admin.js `loadGhostVariants(memoryId)` wiring (line 308·399).

### □ 박을 자리 (우선순위 순, 5-19 안전 마감)
- [ ] V2-5 오염 카메라 연출 — drift 시 즉시 가시화 (1일, 5-6)
  - [x] V2-5 보강 — 파동 부활 (2026-05-06 완료). proximity 동화 재가동(`play-test.html` `_awUpdateFromProximity` 100ms 폴 재박음) + 두 줄 파동 결마다 펄스(`_fpAmbientWave.pulseResonance` 신규 — `lumen_drift_visualizer` spec 차용) + dialog phase1 매 턴 호출(`lumen_dialog_phase1.js` L800 옆) + 결 분류 히스테리시스(`lumen_ghost_response.classifyResonance` buffer 0.04 + hold 250ms) + 회차 시작 시 `resetHysteresis()` + 히스테리시스 smoke 검증 추가(`test/smoke_v21_phase1.js` 섹션 2-B). 핸드아웃 `docs/세션핸드아웃_파동부활-260506.md`.
  - [x] V2-5 보강+ — 파동 표시 lerp + 진입 텀 단축 (2026-05-06 완료). `Visualizer.js` 두 줄 파동 표시 스타일 프레임 단위 lerp(SMOOTH=0.08, ~150ms 안에 따라잡음) — proximity 100ms 갱신 사이 갑자기 결 바뀌는 자리 둔화. `play-test.html` `LONG_PRESS_MS` 1200→800.
  - [x] V21/유령 응답 — 입력 인용 모호 결까지 확장 (2026-05-06 완료). 기존 `lumen_ghost_response.dissonancePool`만 박혔던 마커(`'____'`) `vaguePool`도 박음 (시드 2개 추가). `_applyQuote`는 결 무관 — 마커 박힌 변주는 어느 풀(공명/모호/충돌)에 박혀도 동일 동작. 공명 결은 부드러운 받아침이라 인용 어색해서 의도적 미박. smoke 가드 모호 결 인용 발동 + 빈 입력 안전 (`test/smoke_v21_phase1.js` 섹션 4 확장).
- [ ] V2-6 drift 픽 시스템 — 12축 emotion_vec 2단계 픽 + `plays.ghost_variant_id`·`final_drift_vector` 도장 (2일, 5-7)
- [ ] **V2-13 재진입 유도 시퀀스** (5-05 V2.1.3 신규) — outro 뒤 메모리 변화 힌트 + 재진입 시 흡수 cinematic 가시화 + localStorage 추적 (0.5~1일, 5-8)
- [ ] V2-9 통합·smoke 가드 — `test/smoke_v21_*.js` (2일, 5-9)
- [ ] V2-10 데모 메모리 1개 — 본문 + drift 변주 풀 10~15개 + speciation 시드 1~2개 (4일, V2-2 완료 후)
- [ ] V2-12 디버깅·튜닝 — 분기 임계 + drift 강도 + 카메라 강도 (2일, 5-11 ~ 5-12)
- [ ] 파일럿 n=5~7 외부 표본 (5-13 ~ 5-17)
- [ ] 영상 1~2분 + 스크린샷 4~10장 + statement 계보 (5-17 ~ 5-19)
- [ ] Lumen 제출 양식 작성 (마감 5-23, 안전 5-19)

### 검증 자리 (§10, 11개)
- [x] admin 변주 풀 도구 작동 (5-06 작가 손 검증)
- [ ] 멀티턴 → 분기 트리거 풀 사이클
  - [x] 멀티턴 turn 1/2/3 자리 = (ε) `dialog-turn` + `_renderChoicesOrInput` (5-06 *공원에서* 검증)
  - [ ] 분기 트리거 (`GhostBranchTrigger.decideBranch`) 발화 자리 = V2-3 멀티턴 fingerprint 파이프라인 작가 손 검증 미완 (line 27 자리)
- [ ] drift 가시 변형 (어휘·발화 + 카메라 연출)
  - [x] 카메라 연출 = V2-5 보강 파동 부활 (5-06 commit 11038ac)
  - [x] 어휘 자생 = (ε) drift row 6개 박힘 (5-06 commit 93cbee7)
  - [ ] 어휘 *플레이어 체감* = 본인 손 한 회차 자생까지만, 두 번째 플레이어가 다른 발화 만남 시연 = 파일럿 단계
- [ ] speciation 트리거 → `ghost_variants` 새 유령 누적
- [ ] 후속 플레이어 새 유령 조우 (β 슬롯 흡수) — **본인 손 검증 불가, 파일럿 n=5~7에서만**
- [ ] 귀환 텍스트 알림 작동
- [ ] 파일럿 n=5~7
- [ ] **두 명 다른 유령 풀 시연** (코어 명제) — **본인 손 검증 불가, 파일럿 n=5~7에서만**
- [ ] **재진입 시 발화 변화 시연** (V2.1.3 트리오 — V2-6 + β + V2-13) — V2-13 영상 컷 자리에서 본인 손 가능
- [ ] 영상 + 스크린샷 + statement
- [ ] Lumen 제출 양식

---

## 0-A. SCOPE V2 → V2.1 재계약 (2026-04-29)

본 문서는 4-21 ~ 4-28 까지 LUMEN 단일 공간 데모를 정의하던 계약서였다. 4-29 같은 날 두 번 scope change.

**V2 (4-29 09시 재계약, 폐기)**: 작가 quilt + 플레이어 quilt 분리, cell 단위 1인칭 공간, cell 간 흡수 cut, 위상적 이동, 새 지형 언락. quilt/지형분기 시스템 전면.

**V2.1 (4-29 같은 날 좁힘, 현행)**: quilt/지형분기 V3 이월. 단일 1인칭 공간 (지형 V1 고정) + 자유텍스트 멀티턴 + 오염 카메라 연출 + 유령 단위 분기. 본인 페이스 ("멀티턴+연출만 해도 빡세다") 판단으로 좁힘.

V2.1 코어 정의:
- 메모리 = 단일 1인칭 공간 (지형 V1 그대로, **형성 메트릭 안 건드림** — `computeAfTerrainFields`(지형 필드 계산), `gH`(높이 함수) 원본 유지)
- 자유텍스트 멀티턴 대화 (한 회차 안에서)
- 오염 강도 두 갈래 (§15-1 두 층 구조 그대로, **유령 단위**):
  - **약한 변화 → 같은 유령 변형 (drift)**: 그 자리 카메라 연출 + 유령 발화 변화 즉시 가시화
  - **다른 path → 새 유령 생성 (speciation)**: 데이터 누적, **후속 플레이어가 만남 (β)**. 본인은 귀환 후 텍스트 알림만 ("당신이 만든 새 유령이 이 메모리에 머물고 있다")
- 분기 결정: 결정론적 (LLM 호출 X), `ByeoriEngine`(별이 엔진, 분기 결정 룰셋) + `ContaminationTracker`(오염 3축 추적기) 재활용
- §2 파편 흐름 명제 작동: 본인 강한 일탈 → 새 유령 데이터 누적 → 다음 플레이어가 그 메모리 갔을 때 새 유령 조우

근거:
- 4-27 발견 §14 위상 quilt 비전 (→ V3 격하)
- 4-28 §15 페어링·두 층 모델 (→ V2.1 유령 단위로 작동)
- 4-29 09시 V2 작가/플레이어 quilt 분리 + 깊이 파기 분기 (→ 같은 날 좁힘)
- 4-29 V2.1 좁힘 — quilt/지형분기 V3 이월, "멀티턴+연출" 코어
- 통합 form 메모: `~/.claude/projects/d--The-Etched-Mutation/memory/project_lumen_unified_form_v2.md` (V2.1 좁힘 반영 갱신 필요)

기존 §0 계약 원칙은 V2.1 작업 범위에 그대로 적용 (스코프 밖 X, 새 아이디어 V3_backlog 이월, 커밋 "scope change" 태그).

**V2.1.1 ego-state turn-taking 차용 (2026-05-04 scope change)** — V2.1 phase1 자유대화 단일턴(5-2 결정) 번복. ego-state therapy 의 turn-taking 메커니즘 *한 자리만* 차용 (임상 프레임/통합 목적/치유 어휘 거부). `maxFreeDialogTurns: 1 → 3`. 매 턴 alignment 단독 분석 + 응답 풀 pick. 근거: 단일턴은 "유령이 듣는 자리 0건" + 작품 명제 §2 마찰점 부재. 마감 5-19 영향 없음 (롤백 1시간). 전문: [docs/유령대화_egostate_차용-260504.md](유령대화_egostate_차용-260504.md). 세션 1 차용 코드 = [js/ui/lumen_dialog_phase1.js](../js/ui/lumen_dialog_phase1.js) **완료 (2026-05-04, smoke 검증 13 PASS)**. 세션 2 V2-10 콘텐츠 가이드 = [docs/유령응답풀_가이드_v1-260504.md](유령응답풀_가이드_v1-260504.md) 완료 — **응답 풀 = ghost_variants 통합** (3결 자동 분류 resonance/vague/dissonance × N 변주 / 유령 정체성, 4 유령 프리셋 = 씬 핀 표시 차원). 핸드오프 표현 "12 슬롯 (4 유령 × HIGH/MID/LOW)" 은 코드 시그니처 (lumen_ghost_response.js) 와 안 맞아 가이드가 정정.

**V2.1.2 자동 분류 풀 주입 + 슬롯 흡수 (2026-05-05 scope change)** — V2.1.1 멀티턴이 *작가 박은 변주를 진짜 유령 입에 들어가게* 만드는 자리. 두 갈래.

*(α) 자동 분류 풀 주입* — start() 진입 시 `ghost_variants` drift SELECT → anchor (is_seed+root) emotion_vec 와 cosine sim → 0.85/0.5 임계 → resonance/vague/dissonance 자동 분류 → `LumenGhostResponse.setOptions` 주입. speciation 시드 = SELECT 단계 `kind='drift'` 로 제외 (§15-1 후속 플레이어 자리). fallback 5종 (missing_deps / select_failed / no_anchor / 변주<3 / exception) = 글로벌 디폴트 유지. lazy capture `_originalGhostDefaults` = 메모리 간 stale 방지. 효과: 글로벌 디폴트 풀(18 어휘) → 메모리당 자동 분류 풀로 교체. [lumen_dialog_phase1.js](../js/ui/lumen_dialog_phase1.js) `_loadAndInjectGhostPools`. smoke 검증 14 (a~h) 박힘. 가이드: [docs/유령응답풀_가이드_v1-260504.md](유령응답풀_가이드_v1-260504.md). 코드 ~1시간 (5-05 완료).

*(β) 슬롯 흡수 — 플레이어 자유텍스트 자생 변주* — V2.1.1 멀티턴에 *입력 내용 흡수* 자리 추가. 플레이어 자유텍스트 → 한국어 명사구 NER → 작가 박은 슬롯 변주 (`"...그래. 맞아. {대상}을(를) 기다렸어."`) 채움 → 유령이 받아침 → `ghost_variants` 새 drift row 자생 (`is_seed=false`, `parent_variant_id=본_유령`). 다음 플레이어 풀에 자동 들어감. 작품 명제 §2 ("관객 파편이 다음 관객 유령으로 흘러간다") 가장 강력한 형태. §10 성공 판정 8번째 (같은 메모리 두 명 다른 유령 풀) 시연 강화. 시나리오 D (자생 새 유령 0건) 위험 자동 감소. 기존 quoting 인프라 (`lumen_ghost_response.js _extractQuote/_applyQuote`) 확장. 안전 자리: safety.js 입력 필터 강화 (고유명사 일반화 + 트롤링) + alignment resonance/vague 결만 흡수 + 메모리당 흡수 변주 상한 50 (2026-05-05 30→50, 작가 손 검증 27 자생 박힘 + 5-19 데모 친구 7명·심사위원·영상 회차 누적 흡수 자리) + record-absorption edge function service_role 우회. 코드 ~9시간 (오늘 5-05). **1일 카운터 룰**: 오늘 자정 코어 흐름 (SlotAbsorber + dialog_phase1 통합 + 슬롯 변주 1개) 미완 시 시나리오 C (speciation 시드만) 폴백. 마감 5-19 영향: 1.2일 추가, 본인 페이스 1.67× 가정 안에서 들어감. 전문: [docs/슬롯흡수_차용-260505.md](슬롯흡수_차용-260505.md) (오늘 작업 끝 박을 자리).

**V2.1.2 (δ) 콘텐츠 fallback — 하이브리드 정공법 (2026-05-05 완료)** — 발자국만 풀 dialog_choices + absorption_slots 박힘. 외 8 메모리 = with_choices=0 → 옛 sceneMode UI 발동. 사용자 결정 (5-05) = **하이브리드 정공법**: 작가 손 우선 + 비어 있으면 Haiku 4.5 자동 생성 + DB 캐시 + 균일 톤 안전망 3층. (1) **새 edge function `generate-dialog-choices`** (`supabase/functions/generate-dialog-choices/index.ts`) — Haiku 4.5 호출. 메모리 본문 6 씬 통째 입력 → `byScene` dialog_choices 풀 출력 → `memories.meta.dialog_choices_llm` 캐시 박음 (service_role UPDATE). 캐시 hit 자리 = LLM 호출 X (서버 처리). temperature=0 / max_tokens=4000 / timeout 15s. (2) `lumen_dialog_phase1.js` `start()` 진입 흐름 갱신 — 작가 손 (`sceneData.meta.dialog_choices`) 박혀 있으면 그대로 사용 (부분 박힘이어도 *의도 존중*, 보강 X — 결정 #3). 비어 있으면 `generate-dialog-choices` invoke. 호출 실패/ok:false 시 `_autoGenerateDialogChoices` 균일 톤 (안전망 #2 유지). (3) `lumen_ghost_response.js` DEFAULTS = resonanceSlotPool 2 + vagueSlotPool 2 박음 + `resetSlotPools()` 노출 (메모리 간 stale 방지, 안전망 유지 — 결정 #2). (4) `play-test.html` gameplay 가드 = `scene.meta.dialog_choices` 검사 폐기 (scene.text 만 검사 — 결정 (b) 항상 멀티턴) + `loadMemoryData` absorption_slots 비어 있으면 `resetSlotPools()` 호출. (5) smoke 가드 = `test/smoke_v21_phase1.js` 15·16 케이스 추가 (splitSceneText / defaultChoices / autoGenerateDialogChoices / resetSlotPools). 작가가 V2-2 admin에서 dialog_choices 박으면 = 작가 손 우선 (LLM 캐시 자동 무력화). 데모 5-19 작품 일관성 자리. 핸드아웃: [docs/세션핸드아웃_v21_콘텐츠_fallback-260505.md](세션핸드아웃_v21_콘텐츠_fallback-260505.md). 비용 ~$0.024 / 8 메모리, 지연 ~500-2000ms / 메모리 first 진입 (흡수 cinematic 도중 비동기). 코드 ~3.5h (5-05 완료, deploy 사용자 손).

**V2.1.2 (δ-2) oneScene + 백그라운드 — first 진입 timeout fix (2026-05-06 완료)**

δ 박은 뒤 *당신에게* (11 씬) 메모리 first 진입에서 LLM timeout (15초 안에 응답 없음) 발견. 사용자 결정 = 옵션 2 (첫 씬만 빠르게 + 백그라운드 통째).

(1) `generate-dialog-choices` 갱신
- `oneScene: boolean` 옵션 추가
- true: `scenes.eq('id', sceneId)` 그 씬 1개만 SELECT + max_tokens 1500 / timeout 8초 + DB UPDATE skip (race 회피)
- false: 통째 SELECT + max_tokens 8000 / timeout 45초 + DB UPDATE
- buildUserPrompt = 동적 N개 / system prompt = "6 씬" → "모든 씬"

(2) `lumen_dialog_phase1.js` start() 두 호출 동시 wiring
- (A) `await` `oneScene=true` → 첫 씬 즉시 진입
- (B) fire-and-forget 통째 → 백그라운드 ~15-30초에 DB 캐시 박힘
- 다음 씬 진입 = 캐시 hit (서버 처리)

(3) 운영 = deploy 끝 (5-06, `generate-dialog-choices` version 2)

(4) 실측 timing (supabase edge-function logs, version 2 5-06 자리)
- oneScene 호출 ~330ms (범위 320~510ms)
- 통째 호출 ~4-18초 (범위 4021~18515ms, timeout 45초 안 박힘 ✓)
- 사용자 체감 첫 씬 ~3-5초는 oneScene 330ms + 흡수 cinematic + UI 렌더 합계 — LLM 자체는 짧음

코드 ~30분 (5-06 완료).

**V2.1.2 (ε) 학습된 유령 자유 대화 — 임기응변 → 학습 (2026-05-06 완료)**

사용자 결정 = 작가가 박은 응답 풀 + 슬롯 채우는 임기응변 폐기. 매 턴 LLM (Haiku 4.5) 호출 = 유령이 그 씬 본문 통째로 학습. 사용자가 자유롭게 질문하면 학습된 자료 안에서 자연스럽게 답한다.

(1) 새 edge function `dialog-turn` (`supabase/functions/dialog-turn/index.ts`)
- 시스템 프롬프트 = 메모리 제목 + 모티프 + 그 씬 본문 통째 + `ghost_variants` drift 자료 (작가 시드 + 이전 회차 자생 변주, 최대 30개)
- `cache_control: ephemeral` 박음 → 같은 씬 멀티턴 자리 90% 비용 절약 (Anthropic ephemeral 자리 산출, **실측 미박음 — supabase logs는 token usage 노출 X. dialog-turn 응답에 console.log(`cache_read_input_tokens=...`) 추가가 박을 자리**)
- messages = dialogHistory 누적 + 새 입력
- temperature=0 / max_tokens=200 / timeout 10초

(2) `lumen_dialog_phase1.js` turn loop 갱신
- scene_context 5-6 → 2-3 문장
- turn 1 = 새 helper `_renderChoicesOrInput` (선택지 + 자유 입력 동시)
- turn 2-3 = 자유 입력만
- 응답 = `_callDialogTurn` (LLM)
- 슬롯 흡수 = 백그라운드 (`(async function()`) — §2 명제 보존
- dialogHistory 누적 / 풀 픽 (`pickResponse`) = LLM 실패 시 안전망만
- choice_reply / free_dialog_open 폐기 (작가 의도 = ghost_variants 시드로 시스템 프롬프트에 박혀 보존)

(3) §2 명제 작동 흐름
- 사용자 입력 → SlotAbsorber 자생 → ghost_variants drift row → 다음 플레이어 dialog-turn 시스템 프롬프트에 자료로 박힘 → 다음 유령이 이전 사람 박은 자리 알고 답
- **본인 손 검증 범위 = 자생 단계까지** (drift row 박힘). 다음 플레이어가 그 자료로 답하는 풀 사이클은 §10 line 58 "후속 플레이어 새 유령 조우" 항목 = 파일럿 n=5~7에서만 검증 가능

(4) 운영 = deploy 끝 (5-06 19:48 KST, `dialog-turn` version 1)

(5) 작가 손 검증 자료 (5-06)
- *공원에서* 메모리 (memId=c4888189) 진입 → turn 1/3 응답 "할아버지가 자꾸 그 공원을 보고만..." (씬 본문에서 자연)
- 슬롯 흡수 자생 → ghost_variants drift row 6개 박힘 (208f03ed / a0dd331b / dfcd987c / 2b2ae7c3 / 0cc398a6 / 4eea4410)
- 두 번째 씬 cache hit "즉시 진입" 체감 박힘 (단, cache_read_input_tokens 직접 증거는 미박음 — (1) 단서 자리 참조)

(6) 실측 timing (supabase edge-function logs, dialog-turn 10개 회차 5-06 19:48~20:35 KST)
- POST 평균 ~1.9초 (범위 1505~3651ms)
- 첫 턴 / 두 번째 턴 자리 logs로는 분리 불가 (HTTP timing만 박힘)
- 본문 추정치 "첫 턴 3-5초, 두 번째 턴 1-2초"는 체감 자료, 실측은 ~1.5-2.5초 단일 분포

(7) 비용 (추정치, 캐시 hit 검증 박기 전)
- cache 무효 시 ~$0.05/회차
- cache 유효 시 ~$0.015/회차 (90% 절약 — Anthropic 문서 산출, 실측 X)

코드 ~3시간 (5-06 완료).

**V2.1.2 (γ) LLM 흡수 — Haiku 4.5 차용 (2026-05-05 결정 번복)** — V2.1.2 (β) §6.2 "LLM 호출 X" 결정 번복. 이유: 휴리스틱 NER (정규식) false positive 끝없음 (`엄마 손`/`그랬던거같`/`손이`/인명/외국명사 등 작가 손 검증에서 매번 새 케이스 박음). Haiku 4.5 호출 = 문맥 한 방. 비용 ~$0.0005/턴 = 100 회차 $0.90 무시. 지연 ~500-1000ms 허용. 새 edge function `absorb-slot` (verify_jwt=false, deno serve, temperature=0, max_tokens=120, timeout 5s). 입력: playerInput + ghostTone + sceneContext (첫 3 문장) + resonance 결 + memoryTitle + motifs. 출력: 자연 흡수 응답 또는 null fallback. SlotAbsorber.tryAbsorbAsync 우선 LLM, 실패 시 휴리스틱 fallback. safety.js 입력 검증 *후* LLM 호출 (트롤링 그대로 차단). dialog_phase1 turn 응답 자리 await 통합. 위험: 메모리 톤 깨짐 (system prompt 강제 + 예시 박음 완화), 응답 일관성 (temperature=0 완화). 마감 5-19 영향: 추가 ~1h.

**V2.1.3 재진입 유도 시퀀스 (2026-05-05 scope change)** — V2-6 drift 픽 시스템 V3 이월 추천 *철회* + 신규 V2-13 자리 추가. 1회 회차 끝 → 메뉴 복귀 → "메모리가 어떻게 변했는지 힌트" → 자연스러운 재플레이 유도. (1) `LumenRunOutro` 분기 텍스트 *뒤* 메모리 변화 힌트 한 줄 ("당신의 잔향이 이 메모리에 남았다, 다시 들어가면 다른 결을 만날지도"). (2) 같은 메모리 재진입 시 `buildDoor` 흡수 cinematic 안 한 줄 가시화 ("이 메모리는 네 흔적이 박혀있어"). (3) 익명 세션 추적 = `localStorage.tem_lumen_visited_memories[]` (페이지 닫아도 유지, 로그인 사용자 자리는 V3). (4) 콘텐츠 = 힌트 텍스트 풀 (drift/speciation × ko/en × 1·2회차+ 단계). (5) smoke 가드 = `test/smoke_v21_re_entry.js` (DevTools 콘솔). 근거: Lumen 제출 = 영상 + 도큐 (라이브 체험 X). 영상 안에서 §15 명제 ("관객 파편이 다음 관객 유령으로 흘러간다") 시연하려면 한 회차 + 재진입 후 다른 회차 비교 컷 필요 — 한 작가 본인 손으로 만들 수 있음. 수상 후 심사위원 라이브 체험 시도 자연 재플레이 유도. 의존: V2-6 정교한 픽 + V2.1.2 (β) 슬롯 흡수 둘 다 박혀야 재진입 발화 *진짜로* 다름 (random 픽이면 같은 변주 또 뽑힐 위험). §10 검증 11번째 항목 ("재진입 발화 변화") = V2-6 + (β) + V2-13 트리오 작동 증거. 함정: 힌트 톤 = 작품 톤 유지 ("...남았다", "...머문다"), 게임 톤 ("다시 해보세요!") 금지. 마감 5-19 영향: 0.5~1일, 본인 페이스 1.67× buffer 안에서 압박하며 들어감. 코드 합계 11일 → 11.5~12일.

V1 history (LUMEN 단일 공간 데모) = `LUMEN_DEMO_SCOPE-260427.md` 보존. **V2 풀판 history 별도 보존 X** (V2 09시 재계약과 V2.1 좁힘 같은 날·한 커밋에 처리).

§14, §15 본문은 *이론적 근거* 로 남겨둠. §14 위상 quilt = **V3 영역**. §15 두 층 구조 = **V2.1 유령 단위 작동**. §14-7, §15-4 의 "데모와의 관계" 섹션은 V1 history 시점 기록이며 V2.1 에서는 본 §0-A 가 우선.

---

## 1. V2.1 코어 전환 (한 줄)

메모리 = 단일 1인칭 공간 (지형 V1 고정). 자유텍스트 멀티턴 대화. 약한 변화 → 같은 유령 drift (그 자리 카메라 연출 + 발화 변화 즉시 가시화). 강한 일탈 → 새 유령 speciation (데이터 누적, 후속 플레이어가 만남). 결과 = 같은 메모리에서 사람마다 다른 유령 풀 = 이본의 sheaf section 단면 (**유령 단위**).

## 2. 작품 명제 (변경 불가)

- 관객은 남의 기억을 자기 기억처럼 체험한 뒤, 자기 기억 확신을 잃고 나온다
- 기억 공간은 관객마다 같지 않다 (이본)
- 관객의 파편은 다음 관객의 유령으로 흘러간다

V2.1 코어가 위 세 명제의 *작동 메커니즘* 을 깔음 (§0-A 참조). 단 (이본) 는 *지형 quilt* 가 아니라 *유령 풀 단면* 으로 시연 — 지형 quilt 시연은 V3.

---

## 3. 이미 완료된 것 (V1 자산, V2.1 재활용)

- [x] 오프닝: 1필드 + 감정 칩 6개 ("어떤 기억을 찾고 있어?") — V2.1 그대로
- [x] 메뉴: Record 흡수, 귀환 후 또다른 나 + 아카이브 노출 — V2.1 그대로 (귀환 알림은 V2-7 에서 추가)
- [x] 작업 1 흡수 연출 (`buildDoor`(메뉴→공간 흡수 cut) phase 1·2) — V2.1 **오염 카메라 연출 어휘** 로 일반화 (V2-5)
- [x] 작업 12 Admin 메모리 저작기 — V2.1 **유령 변주 풀 입력** 도구로 확장 (V2-2)
- [x] 작업 13 motif_tags 매칭 — V2.1 메모리 매칭에 그대로 (cell 결정 X, 메모리 결정만)
- [x] `ByeoriEngine` + `ContaminationTracker` — V2.1 **유령 단위 분기 결정** 에 그대로 사용 (V2-4)
- [x] 작업 14 자동 quilt mask Phase 1 — V2.1 영역 X (지형 quilt = V3). admin 씬별 미리보기로만 유지.

> V1 코드 작업의 완료분은 §13 참조. V2.1 에서 어느 자산이 어떻게 재활용되는지는 §4 V2.1 작업 항목 의 권장 시작 컬럼에 명시.

## 4. V2.1 작업 항목 (4-29 ~ 5-19, 21일)

### 코드 (4-30 ~ 5-9, 약 10일)

| 작업 | 일수 | 권장 시작 |
|---|---|---|
| **[x]** V2-1 DB 모델 — `ghost_variants` 테이블 (memory_id별 유령 drift 변주 + speciation 새 유령 풀) + `plays.dialog_turns`(JSONB 멀티턴 누적) (2026-05-03 완료) | 1 | 4-30 |
| **[x]** V2-2 admin 유령 변주 풀 도구 — drift 발화 변주 입력 + speciation 새 유령 시드 입력 (작업 12 메모리 저작기 확장) (2026-05-06 작가 손 검증 완료) | 1.5 | 5-1 |
| **[x]** V2-3 대화 입력 UI (자유텍스트 멀티턴) + emotion 분석 파이프라인 (`claude-scene` 재활용) (2026-05-03 코드 완료, 작가 손 검증 미완) | 2 | 5-3 |
| **[x]** V2-4 분기 트리거 시스템 — drift vs speciation 임계 (LLM 금지, 결정론적, **유령 단위**) (2026-05-03 완료) | 1 | 5-5 |
| V2-5 오염 카메라 연출 — drift 시 즉시 가시화 (작업 1 `buildDoor` 카메라 어휘 일반화 — cell 간 cut 아니라 *공간 안* 카메라/조명/지형 표면 연출) | 1 | 5-6 |
| V2-6 drift 픽 시스템 — 12축 emotion_vec 2단계 픽 (글로벌 좁힘 → 회차 변위 softmax sampling, §9-5 참조) + 회차 끝 도장 (`plays.ghost_variant_id` + `final_drift_vector`) + 폴백 문구 26개. 작업 2-C `lumen_return_speech.js` 재활용. | 2 | 5-7 |
| **[x]** V2-7 귀환 텍스트 알림 + 회차 끝 outro (2026-05-04 완료, 작가 손 검증 미완) — speciation/drift/none 분기별 한 줄씩 + LumenRewindPlayback `forceStart` wiring | 0.5 | 5-8 |
| ~~V2-8 lifecycle 정책 (cell 폭발 방지)~~ | — | **V3 이월** (V2.1 단일 공간 → cell 폭발 자체 없음. 유령 변주 풀 폭발은 V2-4 임계 안에서 hardcode 흡수) |
| V2-13 재진입 유도 시퀀스 (2026-05-05 scope change V2.1.3) — (1) `LumenRunOutro` 분기 텍스트 *뒤* 메모리 변화 힌트 한 줄 ("당신의 잔향이 이 메모리에 남았다"). (2) 같은 메모리 재진입 시 `buildDoor` 흡수 cinematic 안 한 줄 가시화 ("이 메모리는 네 흔적이 박혀있어"). (3) 익명 세션 추적 = localStorage `tem_lumen_visited_memories[]`. (4) 콘텐츠 = 힌트 텍스트 풀 (drift/speciation × ko/en × 1·2회차+ 단계). (5) smoke 가드 = `test/smoke_v21_re_entry.js` (DevTools 콘솔). V2-6 픽 알고리즘 + V2.1.2 (β) 슬롯 흡수 트리오 시연 자리 — Lumen 영상 비교 컷·라이브 재플레이 유도. | 0.5~1 | 5-8 |
| V2-9 통합·smoke 가드 (`test/smoke_v21_*.js`) | 2 | 5-9 |

코드 합계 = 1+1.5+2+1+1+2+0.5+(0.5~1)+2 = **11.5~12일** (V2-6 = 1→2일 2026-05-04 §9-5 drift 픽 시스템 12축 확장 반영, V2-13 = 0.5~1일 2026-05-05 §0-A V2.1.3 재진입 유도 시퀀스 추가).

**완료 기록:**
- [x] **작업 0 매칭 엔진 prequel** (2026-05-03 완료) — `js/core/SeekerMatchEngine.js`(매칭 엔진 모듈), `test/smoke_v21_match_engine.test.js`(vitest 회귀 가드, 44 케이스), `test/smoke_v21_match_engine.html`(시각 디버그). V2-3·V2-4 의 공통 의존. **(b) 유령 변주 선택** 결정 + 가중치 5종 좌표계 + 점진 도입 정책 박힘. SCOPE 표 외 prequel.
- [x] **V2-1 DB 모델** (2026-05-03 완료) — `supabase/migrations/20260503000000_v21_ghost_variants_and_dialog_turns.sql`. 운영 DB 적용 완료 (supabase MCP). schema 검증 통과: `ghost_variants` 15 컬럼 + RLS 4 정책 + CHECK 제약 7개 + 인덱스 6개, `plays.dialog_turns` jsonb 배열 컬럼. 명세 잠금 vitest 65 PASS (V2-1 enum 21 케이스 포함, 전체 회귀 342 PASS).
- [x] **V2-3 멀티턴 fingerprint 파이프라인** (2026-05-03 코드 완료, 작가 손 검증 미완) — `js/core/SeekerFingerprint.js`(순수 로직 모듈) + `js/app/opening.js` 의 `_handleOpeningSubmit` 멀티턴 시퀀스 (3턴 고정, 빈 슬롯 다음 질문 픽, claude-scene emotion_extract 호출, EMA α=0.6 누적, 카테고리 마지막 턴 우선). 회차 끝 `pickTopMemory` + `pickGhostVariant` 호출 → `sessionStorage` 박음. vitest `test/smoke_v21_dialog_pipeline.test.js` 30 PASS (전체 회귀 372 PASS). 작가 손 검증 자리 = dev server 진입 → 오프닝 풀 사이클 1회.
- [x] **V2-2 admin 콘솔 smoke** (2026-05-03 작성) — `test/smoke_v21_admin_ghost_variants.js` (DevTools 붙여넣기). 모듈 export + DOM 엘리먼트 + 섹션 위치 + 비활성 모드 검증.
- [x] **V2-2 admin 유령 변주 풀 도구 작가 손 검증** (2026-05-06 완료) — admin.html 진입 → 발자국 메모리 편집 → 유령 변주 풀 섹션 풀 사이클 박힘 확인 (카드 추가 + utterance + 자동 추출 + 메타 dropdown + 저장 → `ghost_variants` row 박힘). 코드 자산 = `js/admin/ghost_variants_editor.js` (5-03 작성, 526줄, drift/speciation 라디오 + parent_variant_id 드롭다운 + 12축 자동 추출 막대그래프 + INSERT/UPDATE/DELETE 즉시 supabase 호출), `admin.html` `#ghostVariantsSection` 마크업 (line 299~306), `js/admin.js` `loadGhostVariants(memoryId)` wiring (line 308 신규 메모리 비활성, line 399 기존 메모리 로드). 다음 자리 = V2-10 콘텐츠 (발자국 외 메모리 작가 손 변주 풀 박을 자리).
- [x] **V2-7 귀환 텍스트 알림 + 회차 끝 outro** (2026-05-04 완료, 작가 손 검증 미완) — `js/ui/lumen_run_outro.js`(`LumenRunOutro.run` 모듈, drift/speciation/none × ko/en 6 문장 템플릿 + rewind forceStart wiring + beforeText/onComplete 훅), `play-test.html` 세 자리 패치 (exit door long-press + all-visited handler + sealBtn Continue 핸들러), `test/smoke_v21_lumen_outro.js`(DevTools 콘솔 회귀 가드, 모듈 노출/OUTRO_TEXT 6 문장/skip/full cycle/invalid kind/lang fallback 검증). 문장은 GPT 안 그대로 박음 (2026-05-04 사용자 결정 = 틀만 박고 나중 수정). LumenRewindPlayback `forceStart` 호출 wiring 동시 흡수 — V1 `triggerEvent: null` 로 죽은 코드였던 자산 V2.1에서 살림.

  **2026-05-04 revision** — 작가 첫 손 체감 후 두 차례 피드백: (1) "흔들림 → 검은 화면 직행이 무서움, 원래 장면화 (V1 revealScreen + AI 내러티브) 다시 끼워달라" → revealScreen bridge 추가. (2) "문 클릭하면 갑자기 뒷걸음질 쳐서 걸어가는 게 뭐임" → rewind cinematic 자리 안 맞아서 *제거* (출구문 ≠ void 진입). `LumenRewindPlayback` 모듈은 코드 보존, V3 재배치 자리 (V3 backlog 2026-05-04 한 줄). 최종 V2.1 회차 끝 시퀀스 = `[FP 1P 출구문 long-press] → [exitFP + UI cleanup] → [V1 sealBtn click → revealScreen 페이드인 + generate-reveal AI 내러티브 typing + Continue 버튼] → [Continue 시 V2.1 검출 → revealScreen 페이드아웃 + LumenRunOutro 분기 텍스트 (rewind: false) → index.html 오프닝]`. revealScreen 의 alignment 점수 / 트루엔딩 배지 / 원본보기 버튼은 V2.1 흐름에서 *발동 안 함* (revealStats `display:none;` 기본, demo URL 흐름이라 revealRestart 도 숨김) — 즉 V1 archive 의 *score-based* 어휘는 V2.1에 안 들어옴. 들어오는 건 *narrative-based* 호흡 자리 (memory sealed + AI 재구성 내러티브) 뿐.

  작가 손 검증 자리 = play-test 진입 → 회차 끝 도달 → rewind cinematic + revealScreen 내러티브 + Continue + 분기 텍스트 + 오프닝 복귀 한 사이클 체감.

- [x] **V2-4 분기 트리거** (2026-05-03 완료) — `js/core/GhostBranchTrigger.js` (`decideBranch` + `buildSpeciationRow`), `test/smoke_v21_branch_trigger.test.js` (vitest 회귀 가드, 22 케이스). `js/app/opening.js` wiring 교체 (`classifyBranch` → `decideBranch`). 임계 정규화 (drift_high 0.7 / speciation_low 0.4) + mid_band_conservative 보수 (V2-8 V3 이월 흡수 정책). 직접 정렬 채택 — `pickGhostVariant` score=0 시 null 리턴 우회, score=0 라도 topVariant 보존 (편지 핸드오프 (α)). 두 세션 동시 작업 중 다른 세션 (Opus 4.7) 의 `SeekerMatchEngine.classifyBranch` 임시 사양 revert (사용자 (A) 채택). INSERT 경로 (edge function `record-speciation`) = V2-4 후반 단계, 작가 손 검증 후. 회귀 vitest 394 PASS.

### 콘텐츠 (5-3 ~ 5-10, 코드 동시 진행)

| 작업 | 일수 | 비고 |
|---|---|---|
| V2-10 데모 메모리 1개 — 유령 본문 + drift 발화 변주 풀 10~15개 + speciation 시드 새 유령 1~2개 | 4 | V2-2 admin 도구 검증 직후 시작 |

### 디버깅·튜닝 (5-11 ~ 5-12, 2 일)

| 작업 | 일수 | 비고 |
|---|---|---|
| V2-11 통합 디버깅 (race condition, DB migration, 멀티턴 컨텍스트 누적) | 1 | |
| V2-12 분기 트리거 임계 튜닝 + drift 강도 + 카메라 연출 강도 | 1 | 본인 한 바퀴 체감 |

### 파일럿·제출 (5-13 ~ 5-19, 5 일 — 2026-05-04 scope change: 파일럿 축소)

| 작업 | 일수 | 비고 |
|---|---|---|
| V2-13 파일럿 5~7명 외부 표본 1회 (시나리오 B 정식 채택) | 1.5 | 친구 표본 한계 statement 명시. 외부 학교 동기·작품 모르는 사람 표본 우선. |
| V2-14 statement·증거 패키지·영상·스크린샷 (본인+시드+축소 파일럿 자료) | 3 | V2-13 과 병행 가능 |
| V2-15 제출 | 0.5 | 5-19 |

> **scope change (2026-05-04)**: V2-13 원안 5인×5일=25명 → 5~7명 1회로 축소. 근거: V2-4 까지 코드 마무리 후 페이스 점검, 본인+시드 데이터로 §2 명제 *시뮬* 증거 가능 (시나리오 D 흡수 정책 적용). 외부 표본은 *깊이 파기 가설 검증* 자료로만 활용. 통계 신빙성은 statement 정직성 자료로 대체. V2-14 일수도 5→3 단축 (파일럿 자료량 줄어듦).

### 수락 기준 (V2-1 ~ V2-9 공통)

- (a) **smoke test 파일 필수** — `test/smoke_v21_*.js` 반복 실행 가능한 회귀 가드
- (b) **수락 기준 1~2줄 명시** — 각 작업 bullet 에
- (c) **콘솔 테스트 옵션** — 자동화 어려운 DOM/시각만

### 일정 압축 가정

총 코드 10일 + 콘텐츠 4일 (코드와 5일 중첩) + 디버깅·튜닝 2일 + 파일럿·제출 5일 (2026-05-04 scope change: 7→5) = 21일 분량을 16일 (5-19 안전 마감) 안에. V2 풀판 (13+5+1.5+5.5=25일) 대비 4일 여유 확보. 본인 페이스 = 평소 6시간/일 → 이번 14일 약 7시간/일 (1.17×) 으로 완화. 슬립 발견 즉시 §11 시나리오.

---

## 5. V3 연기 (V2.1 작업 중 건드리지 말 것)

**V2.1 코드 건드릴 유혹이 올 때 여기로 이월**:

V2.1 좁힘으로 V3 격하된 항목 (4-29 추가):
- **작가 quilt + 플레이어 quilt 분리** (cell 후보 풀 + 누적 부분집합)
- **cell 단위 1인칭 공간** (V2.1 = 단일 공간)
- **cell 간 흡수 cut 어휘** (V2.1 = 공간 안 카메라 연출만)
- **새 지형 cell 언락** (V2.1 = 유령 분기만)
- **두 quilt 시각화 archive 화면** (V2.1 = 귀환 텍스트 알림만)
- **lifecycle 정책 (cell 폭발 방지)** (V2.1 단일 공간 → 무관)
- **지형 형성 메트릭 cell 단위 재배선** (`computeAfTerrainFields`(지형 필드 계산), `gH`(높이 함수) 안 건드림)
- **분기 가시성 α 시각화** (V2.1 은 텍스트 알림만)

§14 위상 quilt 비전 전체:
- 수동 위상 에디터 (작가가 cell 모양·attaching map 직접 그리기)
- TDA / sheaf 엄밀 정식화
- 회차별 persistent homology 분석 도구
- 카드 H (위상 안의 호흡, 호메오모피즘 변형) — 박사 단계

기존 항목:
- TTS / 자기 목소리 유령 / `plays.first_input_field*`
- 화면 가장자리 왜곡 shader
- Reverb (ConvolverNode)
- 숨소리
- `trajectory_bridges` / 개인 아바타 유령
- 연출 레이어 L (포트 경향성), M (유령 경로)
- 기억유전학 v0.4 확장
- SoundscapeBeta + sound_map 전면 제거 (레거시 대청소)
- MM23L 자유 키 감정 모델 재설계
- ghost_presets DB화

---

## 6. 수정 금지 함수 (V2.1 — V1 그대로 유지)

V1 단일 공간 시절 수정 금지 함수:

```
enterFirstPerson       (L1159)
_fpTick                (L1159 enterFirstPerson 내부)
gH                     (L645)   ⚠️ 중복본: js/af-terrain-test-page.js:414 — canonical은 tem_af_strata_terrain.js
buildMemoryItems
computeAfTerrainFields
```

**V2.1 영향 검토: 다섯 함수 모두 안 건드림.**

V2.1 = 단일 1인칭 공간 (지형 V1 고정). cell 단위 재배선 필요 없음. V2 09시 재계약 시 검토했던 cell 단위 시그니처 변경 (memoryId + cellId), height field 재로딩 — 모두 V3 이월.

V2.1 작업은 위 다섯 함수의 *외부* 에서만 작동:
- V2-3 멀티턴 대화 UI = `enterFirstPerson` 위에 얹는 React/UI 레이어
- V2-5 카메라 연출 = `_fpTick` 안 카메라 상태 *읽기만*, 별도 카메라 효과 레이어로 가시화
- V2-1 DB = 메모리·플레이 데이터, 지형 함수와 무관

> §9-2 (V2 시점 어댑터 vs 원본 수정 비교) = **V2.1 에서 자동 해소**. §9-2 폐기, §9-4 V2.1 좁힘 결정으로 흡수.

---

## 7. V2.1 일정 (4-29 ~ 5-19, 21일)

| 구간 | 기간 | 내용 | 일수 |
|---|---|---|---|
| 0-A 재계약 | 4-29 | SCOPE V2 → V2.1 재계약 + 메모리 갱신 | 0.5 |
| 코드 풀 구현 | 4-30 ~ 5-9 | V2-1 ~ V2-9 (V2-8 V3 이월) | 10 |
| 콘텐츠 작성 | 5-3 ~ 5-10 | V2-10 (코드 중첩 진행) | 4 |
| 디버깅·튜닝 | 5-11 ~ 5-12 | V2-11, V2-12 | 2 |
| 파일럿 | 5-13 ~ 5-14 | V2-13 (5~7명 1회, 시나리오 B — scope change 2026-05-04) | 1.5 |
| 증거·제출 | 5-15 ~ 5-19 | V2-14, V2-15 (본인+시드+축소 파일럿 자료) | 3.5 |

본인 페이스 가정: 평소 6시간 → 이번 14일 약 8시간 (1.33×). V2 의 1.67× 보다 완화. 페이스 슬립 발견 즉시 §11.

> V1 일정 (`LUMEN_DEMO_SCOPE-260427.md` §7) 은 history. V2 풀판 일정 (코드 13일) 은 V2.1 좁힘으로 무효 — 별도 history 보존 X.

---

## 8. 작업 원칙

1. 같은 파일을 2시간 내 3번 이상 수정 시도 시(기능 추가가 아니라 디버깅) 작업 중단, 10분 쉰 뒤 재개.
2. 스코프 밖 작업 욕구는 즉시 `docs/V3_backlog-260429.md`에 기록하고 본 작업 복귀.
3. **작업 완료 조건**:
   - (a) **smoke test 파일 필수 (코드 작업 한정)** — `test/smoke_v2_*.js` 반복 실행 가능한 회귀 가드. 코드 수정이 없는 작업(콘텐츠·글쓰기·촬영·파일럿)은 면제.
   - (b) **수락 기준 1~2줄 명시** — 해당 작업 bullet 블록에 "수락 기준" 항목 추가. 모든 작업 공통.
   - (c) **콘솔 테스트는 옵션** — 자동화 어려운 DOM/시각 상태만 devtools 1회 검증 + 결과 bullet에 기록.

### 8-1. V2.1 통합 체크포인트

스프린트 단위 통합일 대신 V2.1 은 *코드 흐름 끊김 없이 21일 진행*. 다만 두 자리에서 본인 한 바퀴 체감 필수:

**5-6 체크포인트 (V2-1 ~ V2-4 직후)**
- [ ] admin 유령 변주 풀 도구로 drift 변주 5개 + speciation 시드 1개 입력·저장
- [ ] 멀티턴 대화 입력 → emotion 분석 → 분기 트리거 (drift/speciation) 1회 풀 사이클
- [ ] 콘솔 에러 0건

**5-10 체크포인트 (V2-1 ~ V2-7 직후, 콘텐츠 50% 진행)**
- [ ] 같은 유령 멀티턴 N회 대화 → drift 가시 변형 (어휘·발화·카메라 연출)
- [ ] 다른 path 입력 → speciation 트리거 → `ghost_variants` 새 유령 데이터 추가 확인
- [ ] 오염 카메라 연출 시청각 정합 (`_fpTick` 카메라 상태 위 연출 레이어)
- [ ] 귀환 텍스트 알림 작동 ("당신이 만든 새 유령이 이 메모리에 머물고 있다")
- [ ] V2-10 콘텐츠 drift 변주 8개 이상 + speciation 시드 1개 이상 작성

체크포인트 FAIL 시 §11 시나리오.

---

## 9. 결정 기록

### 9-1. `ghost_condensation_points` 저장 위치 — **A-2 확정 (2026-04-21)**
- DB 컬럼 `memories.ghost_condensation_points` (JSON) 유지.
- Admin 튠 UI를 Lumen 스코프에 포함 (작업 12 참조). 드래그 편집으로 iteration 속도 확보.
- 근거: 파일럿·큐레이션 단계에서 좌표 튜닝 iteration이 클 것으로 예상. SQL 직접 편집은 iteration 속도가 JS 편집보다도 느림 — A-1은 B보다 열등. A-2를 수용하려 0.8 세션 스코프 확장.

### 9-2. ~~V2 수정 금지 함수 재정의~~ — **V2.1 좁힘으로 자동 해소 (2026-04-29)**
- V2.1 = 단일 공간 (지형 V1 고정). 어댑터 vs 원본 수정 비교 자체 불필요. §6 참조.

### 9-3. V2 scope change 결정 — **2026-04-29 09시 확정 (같은 날 V2.1 로 좁힘)**
- LUMEN 데모 형식을 V2 통합 form (작가 quilt + 플레이어 quilt + cell 분기) 으로 교체.
- V1 (`LUMEN_DEMO_SCOPE-260427.md`) = history 보존. 회귀 비교 자료.

### 9-4. V2 → V2.1 좁힘 결정 — **2026-04-29 같은 날 확정**
- V2 풀판 (작가 quilt + 플레이어 quilt + cell 단위 + 새 지형 언락 + 두 quilt 시각화) 을 V2.1 (단일 공간 + 멀티턴 + 오염 카메라 연출 + 유령 단위 분기) 으로 좁힘.
- 근거: 본인 페이스 ("멀티턴+연출만 해도 빡세다"). V2 의 1.67× 페이스 가정 → V2.1 의 1.33× 로 완화.
- 격하 항목: §5 V3 연기 참조 (작가/플레이어 quilt, cell 단위, 새 지형 언락, 두 quilt 시각화, lifecycle, 지형 메트릭 재배선, 분기 가시성 α).
- 유지 항목: §15 두 층 구조는 *유령 단위* 로 V2.1 에서 작동 (drift = 같은 유령 변형, speciation = 새 유령 생성 + 후속 플레이어 β).
- §2 명제 작동: "관객 파편이 다음 관객 유령으로 흘러간다" = 새 유령 데이터 누적 + 다음 플레이어 조우. *지형 분기 시연은 V3*.
- V2 풀판 별도 history 보존 X (V2 09시 재계약과 V2.1 좁힘 같은 날·한 커밋).

### 9-5. V2.1 drift 픽 시스템 = 12축 방향 벡터 — **2026-05-04 확정**

drift 가 *방향성* (12축) 자리지 *강도* (스칼라) 자리 X. CLAUDE.md §6.5 #2 ("Contamination is DIRECTIONAL, not scalar") 정합. 부가 효과: 12축 좌표가 박사 단계 위상 마이그레이션 경로 (Lumen Topological Vision) 자동 확보.

- **픽 알고리즘 = 2단계 (B)**:
  1. 글로벌 좁힘 — `memories.cumulative_emotion_vec` (글로벌 누적 12축) 와 cosine 거리 가까운 변주 N개 활성 풀 좁힘 (default N=8)
  2. 회차 픽 — 좁힌 풀 안에서 회차 변위 벡터 (회차 시작 fp 기준) 와 cosine 유사도 → softmax(temperature) 가중 확률 sampling (default temperature=0.5)
- **베이스라인** = 회차 시작 fingerprint. 작가 정답/원본 X (`feedback_avoid_authorial_control_framing` 메모리 룰 정합).
- **fallback (다)→(나)**:
  - 우선 의미 필터 점진 풀기 (모티프 → 귀인만 → 무필터). 어떻게든 픽 시도
  - 진짜 풀 빔 → 작가 폴백 문구 (한 13 + 영 13). 본 유령 silent fallback 절대 X (§6.5 #4 정합)
- **도장** = 회차 끝 시 `plays.ghost_variant_id` + `plays.final_drift_vector` 박음. 사후 재현 = 도장 읽기 (sampling 재실행 X).
- **폐기**: 0.2/0.5/0.8 양자화 라벨, 1차원 `intended_drift` 컬럼, argmax NN (deterministic 가장 가까운 1개 픽 — 색인 동작, 명제 충돌), `drift_residue` 시계열 audit 테이블 (V3 또는 박사 단계), 데모 결정성 모드 (작품 명제 위반).
- **V2-12 위임** (5-11~5-12 본인 한 바퀴 후): softmax temperature, 활성 풀 N, 직전 변주 패널티 강도, `transition_pattern` 픽 입력 여부, 의미 필터 가중치, `cont_drift` α 캘리브레이션 (연출 강도 측면).
- **신규 자산**:
  - 마이그레이션 `supabase/migrations/20260504000000_v21_drift_pick_vectors.sql` (3 컬럼: `memories.cumulative_emotion_vec` jsonb / `plays.ghost_variant_id` uuid / `plays.final_drift_vector` jsonb)
  - `ContaminationTracker` 12축 EMA 메서드 (`updateEmotionVec` / `getCumulativeEmotionVec` / `getDriftVector` / `resetEmotionVec`). 기존 `EMA_ALPHA` 재사용 (todo.md W1S1 audit 결과 입력)
  - `pickDriftUtterance` (`js/core/DriftPicker.js`) + vitest 25 케이스
  - `narrative_fallback_strings` (한 13 + 영 13, `js/content/narrative_fallback_strings.js`)
- **보존 자산**:
  - `pickGhostVariant` (1등 결정성 픽) — V2.1 매칭 진입 게이트로 그대로 유지
  - `ghost_variants.emotion_vec` jsonb — 12축 가정 (W1S1 (e) 답에서 차원수 확인 후 부족 시 확장)
  - `plays.dialog_turns` (멀티턴 누적) — 회차 시작 fp 추출 자리
  - `drift_dir_v/_a/_d` (VAD 3축) — 시각/사운드 연출 자리. 변주 픽과 분리 유지.
- **작업 자리**: todo.md α1 + α2 (코드 2일). V2-6 일수 1→2일 갱신 (§4 표).

### 9-6. `classifyBranch` 누적 무시 → V2-12 위임 — **2026-05-04 결정**

V2-4 `decideBranch` 가 이번 턴 점수 (`pickGhostVariant` 결과 정규화 score) 만 봄. 누적 (`cont_drift` / 12축 변위 norm) 안 봄. "한 사람이 N턴 안에 분기 트리거" 명시적 메커니즘이 코드에 없음.

V2.1 결정: V2-12 (5-11~5-12 본인 한 바퀴 체감 후) 에 임계 깎기 또는 누적 입력 추가 결정. V2.1 본 코드 작업에 박지 않음.

근거: 자연 분기 빈도 데이터 X. 사전 박기 명분 부족. 본인 한 바퀴 돌려서 *너무 적은지 / 너무 많은지* 체감 후 데이터 기반 결정.

V2-12 추가 결정 항목:
- 임계 깎기 vs 누적 입력 추가 vs 둘 다
- 누적 입력 시 매트릭 (`cont_drift` 스칼라 / 12축 변위 norm / 둘 다)
- 회차 안 N턴 임계 (예: 변위 norm > X → 자동 speciation)

---

## 10. V2.1 성공 판정 (5-19 기준)

제출 전 체크:

- [ ] admin 유령 변주 풀 도구 작동 (drift 변주 10~15개 + speciation 시드 1~2개 입력·저장)
- [ ] 자유텍스트 멀티턴 대화 입력 → emotion 분석 → 분기 트리거 (drift/speciation) 풀 사이클
- [ ] 같은 유령 멀티턴 N회 대화 → drift 가시 변형 (어휘·발화 + 오염 카메라 연출)
- [ ] 다른 path 입력 → speciation 트리거 → `ghost_variants` 새 유령 데이터 누적
- [ ] 후속 플레이어가 같은 메모리 진입 → 본인이 만든 새 유령 조우 (β 시연)
- [ ] 귀환 텍스트 알림 작동 ("당신이 만든 새 유령이 이 메모리에 머물고 있다")
- [ ] 파일럿 n=5~7 외부 표본 1회 (시나리오 B — scope change 2026-05-04). 친구 표본 한계 + 통계 신빙성 단축 statement 명시.
- [ ] **같은 메모리 두 명이 다른 유령 풀 형성 시연** (이본 직접 증거 — 유령 단위)
- [ ] **재진입 시 발화 변화 시연** (V2.1.3 — 같은 메모리 1회 → outro 힌트 → 2회 진입했을 때 *진짜로* 다른 발화 나옴). V2-6 픽 알고리즘 + V2.1.2 (β) 슬롯 흡수 + V2-13 재진입 힌트 트리오 작동 증거.
- [ ] 영상 1~2분 + 스크린샷 4~10장 + statement 계보 명시
- [ ] Lumen 제출 양식 작성

위 11개 중 하나라도 미충족 시 §11 시나리오. 특히 *"두 명 다른 유령 풀"* 과 *"재진입 발화 변화"* 는 V2.1 코어 명제 — 미충족 시 시나리오 D 검토.

---

## 11. V2.1 비상 시나리오

**시나리오 A — 코드 슬립 (5-7 시점 V2-1~V2-4 미완)**
- V2-5 카메라 연출 최소형으로 (조명 변화만, 카메라 무빙 V3)
- V2-6 drift 풀 최소형으로 (변주 5 → 3개)
- V2-7 귀환 알림 텍스트 한 줄로 압축
- 코드 마감 5-9 유지, 디버깅 5-11~5-12 그대로

**시나리오 B — 파일럿 n<20 또는 친구 표본 한계 (5-17 까지)**
- 외부 학교 동기·작품 모르는 사람 표본 5~7명 우선 모집
- 친구 표본은 깊이 파기 가설 검증에 약함 — 외부 표본 데이터 우선
- statement 에 *"친구 표본 + 외부 표본 mix, 깊이 파기 미증명"* 명시 (정직성 자료)

**시나리오 C — 깊이 파기 가설 깨짐 (파일럿 결과 모두 폭으로 쏠림)**
- 작품 자체 수정 시간 없음 (5-13 ~ 5-19)
- statement 에 *"초기 관찰 — 깊이 파기 매력 가설 부분 검증"* 명시
- 작품 *형식* 자체는 작동했음을 강조 (유령 분기 메커니즘 작동, 가설 *체험 측면* 미증명 분리)
- 박사 단계 가설 재설계 자료로 활용

**시나리오 D — 두 유령 풀 시연 실패 (이본 코어 명제 미충족)**
- 시드 분기 사전 설계로 강제 speciation 시드 1~2개 미리 심기 (V2-10 콘텐츠 작성 시 같이)
- 파일럿 첫 2명 결과 보고 시드 추가 결정
- *"관찰된 새 유령"* 이 *플레이어 자생* 0건이고 *시드만* 이면 시나리오 D 발동
- 제출 카테고리 하향 또는 7월 데모 (Ars Electronica) 로 본 제출 미루기

**시나리오 E — 치명 regression 발견 (5-14 이후)**
- 해당 기능 off (feature flag)
- 작동 가능한 범위로 영상·캡처 재촬영
- 제출은 유지

**시나리오 F — 완수 불가 (5-17 시점 판단)**
- Lumen 제출 철회 or 카테고리 하향
- TEM 현재 상태로 아카이브, 7월 파일럿 이후 다음 공모전 재도전

---

## 12. 관련 문서

- `docs/LUMEN_DEMO_SCOPE-260427.md` — V1 history. 회귀 비교용
- `docs/update_lumen-260420.md` — V1 계획 원본
- `docs/V3_backlog-260429.md` — V2.1 작업 중 새 아이디어 이월 (작성 예정 — 4-29 안에)
- `CLAUDE.md` — Claude Code 세션 가드레일
- `prompt/critic.md` — critic v3 프롬프트. TEM 83점 B+ 판정 좌표계 (V1 시점 기준)
- `docs/critic_input_LUMEN-260428.md` — critic 입력 패키지 (V1 시점)
- `docs/pilot/*.md` — 파일럿 관찰 기록 템플릿 (작성 예정, 5-12 전)
- `~/.claude/projects/d--The-Etched-Mutation/memory/project_lumen_unified_form_v2.md` — V2 통합 form 메모리 (V2.1 좁힘 반영 갱신 필요)
- `~/.claude/projects/d--The-Etched-Mutation/memory/project_lumen_topological_vision.md` — §14 동반 메모리 (V3 격하)

---

## 13. 완료된 작업 (참고)

회귀 디버깅·구현 경로 추적용 부록. 새 작업이 아니라 이미 끝난 항목의 상세 기록. V1 시절 작업이며 V2 에서 어느 자산이 재활용되는지는 §3·§4 권장 시작 컬럼 참조.

### 작업 0 — 어댑터 + DB 마이그레이션 [2 세션] — ✅ 완료 (2026-04-21)
- [x] **`js/ui/lumen_terrain_adapter.js` 신규 (2026-04-21 완료)** — IIFE + `window.LumenTerrainAdapter.attach(runtime, opts)` API
- [x] **수정 금지 함수 원칙 유지 (2026-04-21)** — 원본 한 글자도 수정 X. `runtime.tick` / `enterFirstPerson` / `exitFirstPerson`만 wrap. `gH` / `buildMemoryItems` / `computeAfTerrainFields`는 건드리지 않음.
- [x] **궤적 push + onEnterVoid 이벤트 + exitFirstPerson 오버라이드 (2026-04-21 완료)**
  - 궤적: 150ms 간격 `{t, x, z, h, yaw}` push (옵션 `includeContamination` 시 `cont` 포함)
  - 이벤트 API: `on('enterVoid' | 'exitVoid' | 'sample' | 'enter' | 'exit', fn)` — void 반경은 기본 0.1R (5.6 유닛)
  - exit payload: `{ trajectory, voidEntered, duration, samples }` — 호출자가 `plays.spatial_trajectory` / `unreturned_flag`로 저장
  - SCOPE §1 준수: 오염→이동 커플링 없음. `getContamination` 콜백은 라벨링용.
- [x] **DB 마이그레이션 (2026-04-21 완료)** — `supabase/migrations/20260421000000_lumen_spatial_columns.sql`
  - [x] `memories.terrain_shape` (enum: circular) + CHECK 제약
  - [x] `memories.ghost_condensation_points` (JSONB, array 타입 CHECK) — A-2 결정(§9-1) 반영
  - [x] `plays.spatial_trajectory` (JSONB)
  - [x] `plays.unreturned_flag` (boolean, partial index)

> V1 §13 의 작업 1 ~ 작업 15 상세 기록은 `LUMEN_DEMO_SCOPE-260427.md` §13 참조. V2 에서는 §3 재활용 자산 목록만 유지.

---

## 14. 위상적 quilt — 이론적 근거 (2026-04-27 발견, V2.1 에서 V3 격하)

§14 본문은 V2 풀판 (4-29 09시) 의 *이론적 근거* 였으나, V2.1 좁힘으로 **V3 영역**으로 격하. 단일 공간 V2.1 에서는 위상 quilt 시연 X. §14 는 박사 단계 정식화 자료로 보존.

**한 줄**: 작품의 공간 모델을 메트릭(거리 측정) → 위상(이웃 관계 + 자동 모양) 으로 재정식화. V2 풀판은 본 비전을 prototype 시연 차원으로 격상하려 했으나, V2.1 에서 다시 박사 영역으로 환원.

### 14-1. 발견된 갭 (4-27 세션)

1. **위치 vs 궤적 vs 응결점** — 셋이 다른 차원. 위치=공간(씬 단위 stage_position), 궤적=논리(시간/분기), 응결점=메모리 누적(메모리 단위 단어 풀). admin UI 한 캔버스에 셋이 섞여 디자인 헷갈림의 근원.
2. **메트릭 vs 위상 갭** — 작가 직감("씬 1 둘러싼 영역에 3,4,7", "안의 상대성")은 위상수학적. 시스템 구현([SceneNavigator.js](../js/core/SceneNavigator.js) cosine similarity + BASE_RADIUS=0.35)은 메트릭. 두 모델 안 맞아 UI 결정 흔들림.
3. **시뮬 단순화 약점** — 시뮬은 페르소나 1벡터 결정론 (`r.emotion` 매 step 고정, [admin-trajectory.js:953](../js/admin-trajectory.js#L953)). 작품 자체는 매 씬마다 user_emotion 갱신 비결정론 ([play-test.html:4080](../play-test.html#L4080) `game.userEmotionTrajectory`). 시뮬로 작품 흐름 디버깅 불완전.
4. **사각형 캔버스의 인공성** — `computeAfTerrainFields` 가 SZ=112 정사각형 격자에 모든 점을 그림. 메트릭 자체는 자연 blob 인데 격자 mask 가 사각형으로 가둠.

### 14-2. 위상적 quilt 비전

**핵심 명제**: 씬 = 위상적 모양. 메모리 = 모양들의 quilt (CW complex). 매 회차 = 모양들의 동적 변형 (homotopy class 보존).

- 작가 정함: 모양 + 경계 매칭 규칙 + 의미 (정적, 위상적)
- 시스템 정함: 매 회차의 시각적 변형 (동적, 메트릭)
- 둘이 분리되어 *작가 통제* 와 *변이 부산물* 이 양립 — [Platform Direction] "변이는 부산물" 과 정합

작품 매핑 후보:
- 씬 종류 ↔ 모양 (V자=분기, 도넛=회피, 원=fixation, 별=공명, …)
- 관객 공명 ↔ 모양 변형 (부풀음/수축/회전)
- transition_pattern ↔ 변형 종류 (echo_follow=호흡, contradiction=반전, …)
- 인접 씬 ↔ 경계 매칭 (위상수학 attaching map)

### 14-3. 자동 quilt (구현 단순화)

작가가 모양을 *수동으로* 그리지 않아도, **메트릭이 자동 모양 생성**:

- 현재: 정사각형 격자 + 모든 점 그림 → 사각형 모양
- 변경 한 줄: `if (influence(x, z) > threshold) draw(...)` → 자연 blob
- Voronoi 분할: 씬 = seed, 각 cell = 자동 영역 → quilt 자동 생성

→ 수동 quilt 의 작가 부담 ↓ + 위상 비전의 핵심(사각형 벗기기, 자연 모양) 보존. **Phase 1 4-27 ~ 4-28 구현 완료** (3 커밋: 5a1a38f / b6bbf75 / 3c3fede). admin 씬별 미리보기 한정.

### 14-4. 인터페이스 분리

위상 quilt 채택 = admin 도구가 둘로 갈라짐:

| | 정적 위상 에디터 | 동적 검증 도구 |
|---|---|---|
| 작가 작업 | 모양 / 경계 / 의미 정의 | 시뮬 / plays 재생 / heatmap |
| 동역학 | 안 보임 | 자동 재생 (next/back), 페르소나 plays 재생, 통계 |
| 직접 조작 | 정적 quilt | next/back 만, 시뮬은 시스템 |

→ 작가가 *모든 회차를 미리 보는* 욕심 포기 = 작품 정체성 (변이=부산물) 과 정합.

### 14-5. 수학 분야 매핑 (포트폴리오 framing)

| 작품 측면 | 수학 분야 |
|---|---|
| 모양 + quilt | CW complex |
| 모양 변형 | Homotopy theory |
| 경계 매칭 | Attaching map |
| 동심원 / 깊이 / "안" 의 상대성 | Morse theory (gradient flow) |
| 이본론 (관객마다 다른 의미) | **Sheaf theory** (같은 base, 다른 section) |
| 회차 데이터 분석 | Persistent homology (TDA) |
| 페르소나 클러스터 | Information geometry |

가장 직접 매핑 = **이본론 ↔ sheaf theory**. 박사 지원서 framing 후보. 분리 가능 논문 3편 가능 (위상 narrative engine / sheaf semantics / TDA of audience trajectories).

V2 통합 form (§0-A) 에서 본 매핑이 *주장에서 prototype 시연 차원 메커니즘으로* 격상. 박사 단계 정식화는 V3 영역.

### 14-6. 단계화 (학부 → 박사)

| Phase | 내용 | 분량 | 시점 |
|---|---|---|---|
| 1 | 자동 quilt mask — 사각형 벗기기 | 한 주 | ✅ 4-27 ~ 4-28 완료 (admin 미리보기 한정) |
| 2 | ~~V2 통합 form 풀 구현~~ | ~~21일~~ | **V2.1 좁힘으로 V3 이월 (4-29)** |
| 2' | V2.1 멀티턴 + 카메라 연출 + 유령 단위 분기 | 21일 | **현재 진행 (4-29 ~ 5-19)** — §14 위상 quilt 미사용 |
| 3 | 이벤트 마커 6종 + 응결점 자동 짝짓기 | 한 학기 | 학부 졸논문 |
| 4 | 수동 모양 + 경계 매칭 + admin 위상 에디터 + 작가/플레이어 quilt + cell 단위 + 새 지형 언락 | — | 박사 단계 (V2 풀판 비전 격상) |
| 5 | TDA / sheaf 정식화 + 비교 실험 + 논문 | — | 박사 본격 |

### 14-7. ~~데모와의 관계~~ (V1 history, V2 무효)

> V1 시점 ("§14 비전은 본 데모 작업 *아님*") 표현은 V2 시점 (4-29) 에 무효. §0-A 참조.

### 14-8. 관련 메모리

- [Theoretical Framework](../memory/project_theoretical_framework.md) — 이본론 정의
- [Platform Direction](../memory/project_platform_direction.md) — "변이는 부산물"
- [Career Goal](../memory/project_career_goal.md) — MIT Media Lab
- [Avoid Authorial-Control Framing](../memory/feedback_avoid_authorial_control_framing.md) — 작가 통제는 정체성 X
- [Lumen Topological Vision](../memory/project_lumen_topological_vision.md) — 본 §14 동반 메모
- [Lumen 통합 작품 형식 v2](../memory/project_lumen_unified_form_v2.md) — V2 통합 form 메모

---

## 15. 씬·유령 페어링 모델 — V2.1 에서 유령 단위로 작동 (2026-04-28 발견)

§15 두 층 구조는 **V2.1 의 핵심 메커니즘** — 유령 단위로 작동. (V2 풀판은 cell·지형·유령 모두 페어링이었으나 V2.1 좁힘으로 **유령 단위만** 남음.)

§2 작품 명제 "관객의 파편은 다음 관객의 유령으로 흘러간다" 의 **메커니즘 정의 부재**가 본 §15 의 출발. V2.1 이 본 메커니즘을 *유령 단위 작동 수준*으로 시연 (지형 단위는 V3).

### 15-1. 페어링 모델 (V2.1 = 유령 단위)

- **메모리 = 1 단일 공간 + N 유령 풀** (V2.1 좁힘). 공간은 V1 고정, 유령 풀이 drift/speciation 으로 변동.
- **두 층 분리**:
  - **층1** (소극적 조우 · 익명 다수) → **유령 a 누적 변형 (drift)**. 다수의 약한 영향이 유령 a 의 발화·자세·잔영에 누적. 점돌연변이 유사. *V2.1: 그 자리 카메라 연출 + 발화 변화 즉시 가시화.*
  - **층2** (명명된 기여 · 다른 path 열음) → **유령 b 신규 생성 (speciation)**. 강한 일탈이 새 유령으로 분기. branching event. *V2.1: 데이터 누적, 후속 플레이어가 만남 (β). 본인은 귀환 텍스트 알림만.*
- 기억유전학 프레임 (quasispecies ODE) 와 동형 — 박사 제안서 인프라 정합.
- 메모리 [TEM 유령 위장 모드 — 두 층 구조] 의 정의와 1:1 대응.
- V2.1 멀티턴 대화 + 오염 카메라 연출이 본 두 층의 작동 메커니즘 시연 자리 (4-29 V2.1 좁힘).
- ~~씬 b 신규 생성~~ → **유령 b 신규 생성** (지형은 단일, 유령만 분기). 지형 cell 분기 시연은 V3.

### 15-2. 미해결 메커니즘 4종 → V2.1 부분 답

**(a) 유령 풀 폭발 + lifecycle 정책**
- V2.1 부분 답: 트리거 임계 조건 → 자연스러운 생성률 제한. V2-4 안에서 hardcode 임계로 흡수.
- 운영 정책 (시들기·흡수) V3. (V2 풀판의 V2-8 cell lifecycle 은 V2.1 단일 공간 → 자동 해소.)

**(b) "다른 path 열었다" 결정론적 판정**
- V2.1 부분 답: 같은 축 (alignment / motif / 누적) 의 *다른 임계* 로 drift·speciation 분리.
- V2-4 작업에서 `ByeoriEngine` + `ContaminationTracker` 출력 재활용. LLM 호출 X.

**(c) 유령 b 생성기 입력**
- V2-10 콘텐츠 작성 시 mutation 노선 — b 가 a 의 가족유사성 보임 (발화 톤, 어휘 패턴, 자세 잔영).
- *지형* 가족유사성 (잔영·색감·응결점 좌표) 은 V3.

**(d) 데모 규모 가시성 (V2.1 5-19 immediate 리스크)**
- V2.1 부분 답: 깊이 파는 사람이 자연 speciation. 단 시드 분기 1~2개 사전 설계 필수 (V2-10).
- 시나리오 D 발동 임계: 플레이어 자생 새 유령 0건 + 시드만.

### 15-3. 유령 분기 연출 항목 (V2.1)

V2.1 작업 시 §15-3 A·B 항목 결정 필요. V2-5 (오염 카메라 연출), V2-7 (귀환 알림) 작업에서 결정.

**A. ~~씬 경계 통과~~ → V2.1 단일 공간이라 해당 사항 없음**
- 지형 cell 분기 V3 이월 → 씬 경계 통과 어휘 자체 V3.
- V2.1 의 카메라 연출은 *공간 안 drift 가시화* (씬 경계 X). V2-5 작업.
- V1 작업 1 `buildDoor`(메뉴→공간 흡수 cut) 은 *메뉴 → 공간 진입* 1회만 사용. 회차 내 cell 간 cut X.

**B. 유령 분기 이벤트 (drift = 매 회차, speciation = 분기 발생 시 1회)**

*drift (약한 변화):*
- [ ] 그 자리 즉시 가시화 — V2-5 카메라 연출 + V2-6 발화 변화. 본인이 회차 중 직접 봄.
- [ ] 어휘 변형 — V2-6 같은 유령 발화 변주 풀
- [ ] 카메라 연출 — V2-5 조명/각도/표면 디테일 변화 (공간 안에서)
- [ ] 잔향 묻어가기 — 본인 직전 행적 carry, 멀티턴 컨텍스트 안에서

*speciation (다른 path 열음):*
- [ ] 본인 즉시 경험 — **(α) 귀환 텍스트 알림만** ("당신이 만든 새 유령이 이 메모리에 머물고 있다"). 회차 중 시각 변화 X.
- [ ] 후속 플레이어 발견 경로 — **(β)** 같은 메모리 진입 시 새 유령 풀에서 sampling. V2-4 분기 결정에서 출력.
- [ ] 분기 순간 시각 신호 — V2.1 본인 회차 중 무자각 (귀환 후 텍스트 알림만)
- [ ] mutation 가족유사성 — V2-10 콘텐츠 작성 시 (발화 톤·어휘·자세 잔영)
- [ ] archetype 흡수 — V2-6 drift 시스템에서
- [ ] ~~분기 횟수 시각화~~ — V3 영역 (체험 중 가시화 너무 systemic)
- [ ] ~~archive 화면 두 quilt 시각화~~ — V3 영역 (귀환 텍스트 알림만 V2.1)

### 15-4. ~~데모와의 관계~~ (V1 history, V2 무효)

> V1 시점 ("§15 모델은 7월말 데모 직전·직후의 후속 결정 항목") 표현은 V2 시점 (4-29) 에 무효. §0-A 참조.

### 15-5. 관련 메모리·문서

- [TEM 유령 위장 모드 — 두 층 구조](../memory/project_ghost_disguise_mode.md) — 두 층 정의 출처. §15-1 의 모태.
- [궤적 비교 프레임](../memory/project_trajectory_frame_seed.md) — quasispecies ODE 메인. §15-1 의 분자적 정합.
- [최종 목표 — 기억 염기서열화](../memory/project_terminal_goal.md) — 박사 10년 인프라 맥락.
- [플레이어 기여 판정에 LLM 추가 호출 금지](../memory/feedback_no_llm_judgment.md) — §15-2 (b) 의 제약.
- [Lumen 통합 작품 형식 v2](../memory/project_lumen_unified_form_v2.md) — V2 통합 form 메모
- §14 위상적 quilt — quilt 모델의 수학적 정식화 (페어링 모델은 콘텐츠/소셜 층, 둘이 직교).
- §2 명제 "관객의 파편은 다음 관객의 유령으로 흘러간다" — V2 통합 form 이 메커니즘 부여.

---

## 16. 오염 자산 4 레이어 (V2.1 wiring 참조)

V2.1 코어 체험 = 유령과의 대화에서 오염 누적이 즉시 가시화. 본 §16 은 *지금 코드베이스에 이미 있는 오염 자산*을 enumerate — V2-5 (카메라 연출) / V2-6 (drift 발화) / V2-10 (시드 콘텐츠) 작업이 본 §16 자산을 wire 하는 작업.

### 16-1. 수치 오염 — `ContaminationTracker`(오염 추적기 클래스, [js/core/ContaminationTracker.js](../js/core/ContaminationTracker.js))

**2축 (MVP, 세션 단위 EMA(지수이동평균)):**
- `cont_drift`(기억이 얼마나 틀어졌나, 0~1) — `alignment`(별이 엔진 정렬도) + mismatch 조합
- `cont_fixation`(기억이 얼마나 고착됐나, 0~1) — `fixation_level`(반복 강도) + `transition_pattern` 조합

**3축 벡터 (오염벡터 v2, 분자생물학 메타포):**
- `cont_divergence`(분자시계 포화 — 떠난 정도)
- `cont_convergence`(면역 압박 수렴 — 모이는 정도)
- `cont_heterogeneity`(준종 구름 폭 — 변이 분산. Welford 온라인 분산 알고리즘)

**감정 방향 벡터:**
- `drift_dir_v` / `_a` / `_d` (VAD — Valence·Arousal·Dominance, 정서가·각성·지배)

### 16-2. 텍스트 오염 — 3 단계

**Stage 1·2 (LLM 기반):** [supabase/functions/contaminate-text/](../supabase/functions/contaminate-text/)(엣지 함수) — Claude/Gemini 호출, VAD 방향 프롬프트로 20~40% 변형. 의미 오염.

**Stage 3 (코드 생성, [js/contamination.js](../js/contamination.js)):**
- `Glitch`(유니코드 블록 ░▒▓█) 35% 확률 대체
- `Redact`(████ 검열) 단어 40% 확률 소거
- `Dissolve`(글자 공백화) 55% 확률 소멸

**씬 미리 박힌 변주, [supabase/migrations/20250105000000_add_contamination_stages_to_scenes.sql](../supabase/migrations/20250105000000_add_contamination_stages_to_scenes.sql):**
- `text_stage_1`(편향적 기울어짐), `text_stage_2`(해석 병기), `text_stage_3`(과잉 완결)

**매핑 룰, [js/app/contaminationPresenter.js](../js/app/contaminationPresenter.js):**
- `biased_inclination`(편향) medium → stage 1, strong → stage 2
- `hypercompletion`(과잉완결) medium → stage 2, strong → stage 3

### 16-3. 시각 오염

- [js/ui/lumen_walk_effects.js](../js/ui/lumen_walk_effects.js), [js/ui/lumen_visual_effects.js](../js/ui/lumen_visual_effects.js) — `cont_stage` / `cont_drift` / `cont_fixation` 받아서 카메라·조명·텍스처 왜곡
- [js/ui/lumen_drift_visualizer.js](../js/ui/lumen_drift_visualizer.js) — 매 턴 변형 펄스 (V2.1 Phase 1, **단발** — V2-5 작업에서 *누적형* 으로 확장 필요)

### 16-4. 청각/내적 오염 — `contaminationMonologue`(기억의 독백, [js/ui/contaminationMonologue.js](../js/ui/contaminationMonologue.js))

기억 자신이 흔들리는 발화. 시스템 메시지 X. 확률 기반:
- weak 20% / medium 45% / strong 70%

### 16-5. 누적 트리거 시그널

`alignment`(별이 엔진 출력), `emotion_mismatch`(사용자↔기억 감정 불일치), `attribution_mismatch`(귀인 불일치), `target_displacement`(대상 전치), `void_mismatch`(공백 불일치), `transition_pattern`(bridge / fixation / echo_follow / contradiction 등), `emotionHistory`(멀티턴 감정 누적) → EMA α=0.10 (최근 7세션 지배).

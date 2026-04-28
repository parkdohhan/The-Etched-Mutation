# LUMEN 2026 DEMO SCOPE

**제출 마감**: 2026-05-23
**안전 마감**: 2026-05-19 (buffer 4일)
**작성**: 2026-04-21
**기반 문서**: `docs/update_lumen-260420.md`, IMA 비평 판정 (2026-04-20, 83점 B+)
**최근 갱신**: 2026-04-29 — **scope change V2 통합 form 재계약**. 단일 1인칭 공간 데모 → 작가 quilt + 플레이어 quilt 분리 + 대화 자동 분기 + 깊이 파기 분기로 형식 자체 교체. V1 history = `LUMEN_DEMO_SCOPE-260427.md`.

---

## 0. 이 문서의 성격

계약서다. 문서 밖 작업은 Lumen 스코프 밖이다.
새 아이디어는 `docs/V3_backlog.md`로 이월한다.
이 문서를 수정하려면 명시적 결정 필요 — 커밋 메시지에 "scope change" 태그.

---

## 0-A. SCOPE V2 재계약 (2026-04-29)

본 문서는 4-21 ~ 4-28 까지 LUMEN 단일 공간 데모를 정의하던 계약서였다. 4-29 명시적 scope change 결정으로 LUMEN 데모 형식 자체가 V2 통합 form 으로 교체된다.

V2 통합 form 정의:
- 작가 quilt (가능성 풀) vs 플레이어 quilt (누적 부분집합) 분리
- cell 단위 1인칭 공간 + cell 간 흡수 cut (위상적 이동)
- 대화 자동 분기 (LLM 호출 X, ByeoriEngine 재활용)
- 같은 유령 누적 변형 (drift) + 임계 트리거 분기 (speciation)
- 분기 가시성: 후속 플레이어가 발견 (β), 본인은 사후 archive 자각 (α)

근거:
- 4-27 발견 §14 위상 quilt 비전
- 4-28 §15 페어링·두 층 모델
- 4-29 작가/플레이어 quilt 분리 + 깊이 파기 분기 = 다섯 비전 통합 도달
- 통합 form 메모: `~/.claude/projects/d--The-Etched-Mutation/memory/project_lumen_unified_form_v2.md`

기존 §0 계약 원칙은 V2 작업 범위에 그대로 적용 (스코프 밖 X, 새 아이디어 V3_backlog 이월, 커밋 "scope change" 태그).

V2 이전 history (LUMEN 단일 공간 데모) = `LUMEN_DEMO_SCOPE-260427.md` 보존. 회귀 디버깅 / 작가 진술 비교 자료.

§14, §15 본문은 V2 통합 form 의 *이론적 근거* 로 남겨둠 (당시 "post-demo 비전" 표현은 V1 시점 기록). §14-7, §15-4 의 "데모와의 관계" 섹션은 V1 history 시점 기록이며 V2 에서는 본 §0-A 가 우선.

---

## 1. V2 코어 전환 (한 줄)

작가 quilt = 메모리당 cell 후보 풀. 플레이어 quilt = 대화로 누적된 부분집합. 같은 유령에 머물면 누적 변형(drift), 임계 통과 시 새 cell 분기(speciation). 분기 가시성은 후속 플레이어. 결과 = 같은 메모리에서 사람마다 다른 quilt = 이본의 sheaf section 단면.

## 2. 작품 명제 (변경 불가)

- 관객은 남의 기억을 자기 기억처럼 체험한 뒤, 자기 기억 확신을 잃고 나온다
- 기억 공간은 관객마다 같지 않다 (이본)
- 관객의 파편은 다음 관객의 유령으로 흘러간다

V2 통합 form 이 위 세 명제의 *작동 메커니즘* 을 깔음 (§0-A 참조).

---

## 3. 이미 완료된 것 (V1 자산, V2 재활용)

- [x] 오프닝: 1필드 + 감정 칩 6개 ("어떤 기억을 찾고 있어?")
- [x] 메뉴: Record 흡수, 귀환 후 또다른 나 + 아카이브 노출
- [x] 작업 1 흡수 연출 (`buildDoor` phase 1·2) — V2 cell 간 cut 어휘로 일반화
- [x] 작업 12 Admin 메모리 저작기 — V2 작가 quilt 도구로 확장
- [x] 작업 13 motif_tags 매칭 — V2 첫 cell 결정에 재활용
- [x] ByeoriEngine — V2 분기 결정에 그대로 사용
- [x] 작업 14 자동 quilt mask Phase 1 — V2 cell 자체 자동 모양 도구

> V1 코드 작업의 완료분은 §13 참조. V2 에서 어느 자산이 어떻게 재활용되는지는 §4 V2 작업 항목 의 권장 시작 컬럼에 명시.

## 4. V2 작업 항목 (4-29 ~ 5-19, 21일)

### 코드 (4-30 ~ 5-12, 13 일)

| 작업 | 일수 | 권장 시작 |
|---|---|---|
| V2-1 DB 모델 — `playerQuilt` 테이블, cell 후보 메타 확장 | 1 | 4-30 |
| V2-2 admin 작가 quilt 도구 — cell 후보 CRUD + 가능성 풀 | 2 | 5-1 |
| V2-3 대화 입력 UI + emotion 분석 파이프라인 (`claude-scene` 재활용) | 1.5 | 5-3 |
| V2-4 분기 트리거 시스템 — 누적 카운터 + 임계 (LLM 금지, 결정론적) | 1.5 | 5-4 |
| V2-5 cell 간 흡수 cut 어휘 (작업 1 `buildDoor` 일반화) | 1 | 5-6 |
| V2-6 drift 시스템 — 같은 유령 발화 변주 풀 (작업 2-C `lumen_return_speech.js` 일반화) | 1.5 | 5-7 |
| V2-7 두 quilt 시각화 (archive 사후 자각 화면) | 1.5 | 5-8 |
| V2-8 lifecycle 정책 — cell 폭발 방지 (시들기·흡수, hardcode 임계) | 1 | 5-10 |
| V2-9 통합·smoke 가드 (`test/smoke_v2_*.js`) | 2 | 5-11 |

### 콘텐츠 (5-3 ~ 5-12, 코드 동시 진행)

| 작업 | 일수 | 비고 |
|---|---|---|
| V2-10 데모 메모리 1개 cell 후보 15개 + 유령 본문 + drift 풀 + 시드 분기 1~2개 | 5 | V2-2 admin 도구 검증 직후 시작 |

### 디버깅·튜닝 (5-13 ~ 5-14 오전, 1.5 일)

| 작업 | 일수 | 비고 |
|---|---|---|
| V2-11 통합 디버깅 (race condition, DB migration, 모듈 상호작용) | 1 | |
| V2-12 분기 트리거 임계 튜닝 + drift 강도 + 흡수 cut 타이밍 | 0.5 | 본인 한 바퀴 체감 |

### 파일럿·제출 (5-14 오후 ~ 5-19, 5.5 일)

| 작업 | 일수 | 비고 |
|---|---|---|
| V2-13 파일럿 5인 × 5일 = 25명 | 5 | 친구 표본 한계 §11 시나리오 B 참조 |
| V2-14 statement·증거 패키지·영상·스크린샷 (파일럿 자료 동시 활용) | 5 | V2-13 과 병행 |
| V2-15 제출 | 0.5 | 5-19 |

### 수락 기준 (V2-1 ~ V2-9 공통)

- (a) **smoke test 파일 필수** — `test/smoke_v2_*.js` 반복 실행 가능한 회귀 가드
- (b) **수락 기준 1~2줄 명시** — 각 작업 bullet 에
- (c) **콘솔 테스트 옵션** — 자동화 어려운 DOM/시각만

### 일정 압축 가정

총 코드 13일 + 콘텐츠 5일 (코드와 5일 중첩) + 디버깅 1.5일 + 파일럿·제출 5.5일 = 25일 분량을 21일 안에 압축. 콘텐츠·코드 중첩 5일이 본인 동시 진행 가능 가정. 본인 페이스 = 평소 6시간/일 → 이번 14일 10시간/일 (1.67×) 가능 명시. 슬립 발견 즉시 §11 시나리오.

---

## 5. V3 연기 (V2 작업 중 건드리지 말 것)

**V2 코드 건드릴 유혹이 올 때 여기로 이월**:

- 수동 위상 에디터 (작가가 cell 모양·attaching map 직접 그리기)
- TDA / sheaf 엄밀 정식화
- 회차별 persistent homology 분석 도구
- 멀티턴 대화 (현 V2 는 자유 텍스트 한 번)
- 분기 가시성 α (즉시 자각) — V2 는 β + 사후 α 만
- 카드 H (위상 안의 호흡, 호메오모피즘 변형) — 박사 단계
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

## 6. 수정 금지 함수 (V2 재검토)

V1 단일 공간 시절 수정 금지 함수:

```
enterFirstPerson       (L1159)
_fpTick                (L1159 enterFirstPerson 내부)
gH                     (L645)   ⚠️ 중복본: js/af-terrain-test-page.js:414 — canonical은 tem_af_strata_terrain.js
buildMemoryItems
computeAfTerrainFields
```

V2 영향 검토:
- `enterFirstPerson`, `_fpTick` : cell 단위 entry 로 *재배선* 필요. 어댑터 패턴 한계 → 직접 수정 검토.
- `buildMemoryItems`, `computeAfTerrainFields` : *cell 단위 호출*로 변경 (memoryId 외 cellId 인자 추가). canonical 계약 변경.
- `gH` : cell 안에서만 의미. cell 전환 시 새 height field 로딩.

V2 수정 금지 함수 = V2-1 작업 시작 시 재정의. 직접 수정이 필요하면 *어댑터 패턴 우회 vs 원본 수정* 비교 후 결정. 결정은 본 문서 §9-2 에 추가 기록.

---

## 7. V2 일정 (4-29 ~ 5-19, 21일)

| 구간 | 기간 | 내용 | 일수 |
|---|---|---|---|
| 0-A 재계약 | 4-29 | SCOPE V2 재계약 + 메모리 갱신 | 0.5 |
| 코드 풀 구현 | 4-30 ~ 5-12 | V2-1 ~ V2-9 | 13 |
| 콘텐츠 작성 | 5-3 ~ 5-12 | V2-10 (코드 중첩 진행) | 5 |
| 디버깅·튜닝 | 5-13 ~ 5-14 오전 | V2-11, V2-12 | 1.5 |
| 파일럿 | 5-14 오후 ~ 5-18 | V2-13 (5인/일 × 5일) | 4.5 |
| 증거·제출 | 5-15 ~ 5-19 | V2-14, V2-15 (파일럿 병행) | 5 |

본인 페이스 가정: 평소 6시간 → 이번 14일 10시간 (1.67×) 가능성 명시. 페이스 슬립 발견 즉시 §11.

> V1 일정 (`LUMEN_DEMO_SCOPE-260427.md` §7) 은 history. V2 에서 무효.

---

## 8. 작업 원칙

1. 같은 파일을 2시간 내 3번 이상 수정 시도 시(기능 추가가 아니라 디버깅) 작업 중단, 10분 쉰 뒤 재개.
2. 스코프 밖 작업 욕구는 즉시 `docs/V3_backlog.md`에 기록하고 본 작업 복귀.
3. **작업 완료 조건**:
   - (a) **smoke test 파일 필수 (코드 작업 한정)** — `test/smoke_v2_*.js` 반복 실행 가능한 회귀 가드. 코드 수정이 없는 작업(콘텐츠·글쓰기·촬영·파일럿)은 면제.
   - (b) **수락 기준 1~2줄 명시** — 해당 작업 bullet 블록에 "수락 기준" 항목 추가. 모든 작업 공통.
   - (c) **콘솔 테스트는 옵션** — 자동화 어려운 DOM/시각 상태만 devtools 1회 검증 + 결과 bullet에 기록.

### 8-1. V2 통합 체크포인트

스프린트 단위 통합일 대신 V2 는 *코드 흐름 끊김 없이 21일 진행*. 다만 두 자리에서 본인 한 바퀴 체감 필수:

**5-7 체크포인트 (V2-1 ~ V2-5 직후)**
- [ ] admin 작가 quilt 도구로 cell 후보 5개 입력·저장
- [ ] 대화 입력 → emotion 분석 → 자동 cell 전이 1회 풀 사이클
- [ ] 콘솔 에러 0건

**5-12 체크포인트 (V2-1 ~ V2-9 직후, 콘텐츠 50% 진행)**
- [ ] 같은 유령 N회 대화 → drift 가시 변형
- [ ] 누적 임계 통과 → 새 cell 분기 1회 발화
- [ ] cell 간 흡수 cut 시청각 정합 (drone 연속 + 시각 cut)
- [ ] 사후 archive 화면 두 quilt 시각화 작동
- [ ] V2-10 콘텐츠 cell 후보 8개 이상 작성

체크포인트 FAIL 시 §11 시나리오.

---

## 9. 결정 기록

### 9-1. `ghost_condensation_points` 저장 위치 — **A-2 확정 (2026-04-21)**
- DB 컬럼 `memories.ghost_condensation_points` (JSON) 유지.
- Admin 튠 UI를 Lumen 스코프에 포함 (작업 12 참조). 드래그 편집으로 iteration 속도 확보.
- 근거: 파일럿·큐레이션 단계에서 좌표 튜닝 iteration이 클 것으로 예상. SQL 직접 편집은 iteration 속도가 JS 편집보다도 느림 — A-1은 B보다 열등. A-2를 수용하려 0.8 세션 스코프 확장.

### 9-2. V2 수정 금지 함수 재정의 — **V2-1 시작 시 결정 (예정)**
- 어댑터 패턴 우회 vs 원본 수정 비교 후 결정. 본 자리에 추가 기록.

### 9-3. V2 scope change 결정 — **2026-04-29 확정**
- LUMEN 데모 형식을 V2 통합 form 으로 교체. 본 문서 §0-A 참조.
- V1 (`LUMEN_DEMO_SCOPE-260427.md`) = history 보존. 회귀 비교 자료.

---

## 10. V2 성공 판정 (5-19 기준)

제출 전 체크:

- [ ] 작가 quilt admin 도구 작동 (cell 후보 15개 입력·저장)
- [ ] 대화 입력 → emotion 분석 → 자동 cell 전이 풀 사이클
- [ ] 같은 유령 N회 대화 → drift 가시 변형 (어휘·자세·잔향)
- [ ] 누적 임계 통과 → 새 cell 분기 후속 플레이어에게 보임
- [ ] cell 간 흡수 cut 어휘 시청각 정합 (drone 연속 + 시각 cut)
- [ ] 사후 archive 화면에서 본인 quilt 단면 시각화
- [ ] 파일럿 n≥20 (친구 표본 한계 statement 명시)
- [ ] 같은 메모리 두 명이 다른 quilt 형성 시연 (이본 직접 증거)
- [ ] 영상 1~2분 + 스크린샷 4~10장 + statement 계보 명시
- [ ] Lumen 제출 양식 작성

위 10개 중 하나라도 미충족 시 §11 시나리오. 특히 *"두 명 다른 quilt"* 는 V2 코어 명제 — 미충족 시 시나리오 D 검토.

---

## 11. V2 비상 시나리오

**시나리오 A — 코드 슬립 (5-9 시점 V2-1~V2-5 미완)**
- V2-6 drift 풀 최소형으로 (변주 3개 → 1개)
- V2-7 두 quilt 시각화 사후 archive 만 유지, 누적 시각 V3 이월
- V2-8 lifecycle 정책 hardcode 임계로 — 운영 정책은 V3
- 코드 마감 5-12 유지, 디버깅 1일로 압축

**시나리오 B — 파일럿 n<20 또는 친구 표본 한계 (5-18 까지)**
- 외부 학교 동기·작품 모르는 사람 표본 5~7명 우선 모집
- 친구 표본은 깊이 파기 가설 검증에 약함 — 외부 표본 데이터 우선
- statement 에 *"친구 표본 + 외부 표본 mix, 깊이 파기 미증명"* 명시 (정직성 자료)

**시나리오 C — 깊이 파기 가설 깨짐 (파일럿 결과 모두 폭으로 쏠림)**
- 작품 자체 수정 시간 없음 (5-14 ~ 5-19)
- statement 에 *"초기 관찰 — 깊이 파기 매력 가설 부분 검증"* 명시
- 작품 *형식* 자체는 작동했음을 강조 (분기 메커니즘 작동, 가설 *체험 측면* 미증명 분리)
- 박사 단계 가설 재설계 자료로 활용

**시나리오 D — 두 quilt 시연 실패 (이본 코어 명제 미충족)**
- 시드 분기 사전 설계로 강제 분기 1~2개 미리 심기 (V2-10 콘텐츠 작성 시 같이)
- 파일럿 첫 2명 결과 보고 시드 추가 결정
- *"관찰된 분기"* 가 *플레이어 자생* 0건이고 *시드만* 이면 시나리오 D 발동
- 제출 카테고리 하향 또는 7월 데모 (Ars Electronica) 로 본 제출 미루기

**시나리오 E — 치명 regression 발견 (5-15 이후)**
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
- `docs/V3_backlog.md` — V2 작업 중 새 아이디어 이월 (작성 예정)
- `CLAUDE.md` — Claude Code 세션 가드레일
- `prompt/critic.md` — critic v3 프롬프트. TEM 83점 B+ 판정 좌표계 (V1 시점 기준)
- `docs/critic_input_LUMEN-260428.md` — critic 입력 패키지 (V1 시점)
- `docs/pilot/*.md` — 파일럿 관찰 기록 템플릿 (작성 예정, 5-13 전)
- `~/.claude/projects/d--The-Etched-Mutation/memory/project_lumen_unified_form_v2.md` — V2 통합 form 메모리
- `~/.claude/projects/d--The-Etched-Mutation/memory/project_lumen_topological_vision.md` — §14 동반 메모리

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

## 14. 위상적 quilt — 이론적 근거 (2026-04-27 발견)

§14 본문은 V2 통합 form 의 *이론적 근거* 로 보존. V1 시점 표현 ("post-demo 비전") 은 V2 에서 무효 — §0-A 가 우선.

**한 줄**: 작품의 공간 모델을 메트릭(거리 측정) → 위상(이웃 관계 + 자동 모양) 으로 재정식화. V2 통합 form 의 §14·§15·§0-A 통합으로 격상.

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
| 1 | 자동 quilt mask — 사각형 벗기기 | 한 주 | ✅ 4-27 ~ 4-28 완료 |
| 2 | V2 통합 form 풀 구현 | 21일 | **현재 진행 (4-29 ~ 5-19)** |
| 3 | 이벤트 마커 6종 + 응결점 자동 짝짓기 | 한 학기 | 학부 졸논문 |
| 4 | 수동 모양 + 경계 매칭 + admin 위상 에디터 | — | 박사 단계 |
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

## 15. 씬·유령 페어링 모델 — 이론적 근거 (2026-04-28 발견)

§15 본문은 V2 통합 form 의 *이론적 근거* 로 보존. V1 시점 표현 ("post-demo 풀문제") 은 V2 에서 무효 — §0-A 가 우선.

§2 작품 명제 "관객의 파편은 다음 관객의 유령으로 흘러간다" 의 **메커니즘 정의 부재**가 본 §15 의 출발. V2 통합 form 이 본 메커니즘을 *작동 수준*으로 격상.

### 15-1. 페어링 모델 (잠정)

- **씬 = 1 유령** (1:1 페어). §14 quilt 와 정합 — 퀼트가 의도된 이음매라는 (A) 노선 전제.
- **두 층 분리**:
  - **층1** (소극적 조우 · 익명 다수) → **유령 a 누적 변형**. 다수의 약한 영향이 유령 a 의 형태·말투·잔영에 누적. drift / 점돌연변이 유사.
  - **층2** (명명된 기여 · 다른 path 열음) → **씬 b 신규 생성**. 강한 일탈이 새 씬으로 분기. speciation / branching event.
- 기억유전학 프레임 (quasispecies ODE) 와 동형 — 박사 제안서 인프라 정합.
- 메모리 [TEM 유령 위장 모드 — 두 층 구조] 의 정의와 1:1 대응.
- V2 통합 form 의 *깊이 파기 분기* 가 본 두 층의 작동 메커니즘 (4-29 발견).

### 15-2. 미해결 메커니즘 4종 → V2 부분 답

**(a) 씬 폭발 + lifecycle 정책**
- V2 부분 답: 트리거 임계 조건 → 자연스러운 생성률 제한.
- V2-8 작업에서 hardcode 임계 + 시들기·흡수 정책. 운영 정책 V3.

**(b) "다른 path 열었다" 결정론적 판정**
- V2 부분 답: 같은 축 (alignment / motif / 누적) 의 *다른 임계* 로 누적·분기 분리.
- V2-4 작업에서 ByeoriEngine + ContaminationTracker 출력 재활용. LLM 호출 X.

**(c) 씬 b 생성기 입력**
- V2-10 콘텐츠 작성 시 mutation 노선 — b 가 a 의 가족유사성 보임 (지형 잔영, 색감, 응결점 좌표 상관).

**(d) 데모 규모 가시성 (V2 5-19 immediate 리스크)**
- V2 부분 답: 깊이 파는 사람이 자연 분기. 단 시드 분기 1~2개 사전 설계 필수 (V2-10).
- 시나리오 D 발동 임계: 플레이어 자생 분기 0건 + 시드만.

### 15-3. 씬 진입·생성 연출 미정 항목

V2 작업 시 §15-3 A·B 항목 결정 필요. V2-5 (cell 간 흡수 cut), V2-7 (사후 archive 자각) 작업에서 결정.

**A. 씬 경계 통과 (모든 회차에서 매번 발생)**
- [ ] 이음매 신호 — V2 는 *흡수 cut* (작업 1 buildDoor 일반화) 채택
- [ ] 이음매 길이 — V2-5 결정
- [ ] 좌표 리셋 — V2 는 cell 입구 좌표로 리셋 (cell 간 메트릭 단절 가정)
- [ ] 음향 — V2 는 drone 연속 + 시각만 cut (§5d 함정 답에서 결정)
- [ ] 잔향 묻어가기 — V2-6 drift 시스템에서 본인 직전 행적 carry 처리

**B. 씬 b 신규 생성 이벤트 (분기 발생 시 1회)**
- [ ] 본인 즉시 경험 — V2 는 (β) 후속 플레이어만 발견 + (α) 사후 archive 자각
- [ ] 후속 플레이어 발견 경로 — V2-7 archive 화면에서 본인 quilt 단면 시각화
- [ ] 분기 순간 시각 신호 — V2 는 본인 무자각, 사후 archive 자각만
- [ ] mutation 가족유사성 — V2-10 콘텐츠 작성 시
- [ ] archetype 흡수 — V2-6 drift 시스템에서
- [ ] 분기 횟수 시각화 — V3 영역 (체험 중 가시화는 너무 systemic)

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

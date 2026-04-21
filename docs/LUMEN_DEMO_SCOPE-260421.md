# LUMEN 2026 DEMO SCOPE

**제출 마감**: 2026-05-23
**안전 마감**: 2026-05-19 (buffer 4일)
**작성**: 2026-04-21
**기반 문서**: `docs/update_lumen-260420.md`, IMA 비평 판정 (2026-04-20, 83점 B+)

---

## 0. 이 문서의 성격

계약서다. 문서 밖 작업은 Lumen 스코프 밖이다.
새 아이디어는 `docs/V2_backlog.md`로 이월한다.
이 문서를 수정하려면 명시적 결정 필요 — 커밋 메시지에 "scope change" 태그.

---

## 1. 코어 전환 (한 줄)

선형 씬 전환을 AF 지형 1인칭 공간 내비게이션으로 승격.
관객은 WASD로 걷고, 유령을 만나고, 중심 void에 도달한 뒤 귀환한다.
오염은 이동을 제어하지 않는다. 환경 연출(fog·vignette·bob·발소리·drone)에만 쓴다.

## 2. 작품 명제 (변경 불가)

- 관객은 남의 기억을 자기 기억처럼 체험한 뒤, 자기 기억 확신을 잃고 나온다
- 기억 공간은 관객마다 같지 않다 (이본)
- 관객의 파편은 다음 관객의 유령으로 흘러간다

+관객의 파편은 다음 관객의 유령으로 흘러간다 <--이거에 관한 회의 필요

---

## 3. 이미 완료된 것

- [x] 오프닝: 1필드 + 감정 칩 6개 ("어떤 기억을 찾고 있어?")
- [x] 메뉴: Record 흡수, 귀환 후 또다른 나 + 아카이브 노출

## 4. 남은 작업 (13 세션)

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

### 작업 1 — 오프닝 흡수 연출 연결 [0.5 세션] — ✅ 완료 (2026-04-21)
- [x] **입력 → 흡수 연출 → AF 지형 진입 (2026-04-21 완료)** — `_handleOpeningSubmit` 재배선: finder 우회 → 파동 freeze+탈채도(`ctx.filter=saturate`, time×speedMul) → confession.js `buildDoor` phase 1(열림 1200ms)·phase 2(빨려들어감 1600ms) 재사용 → `play-test.html?memory=X&lang=Y` 직이동 → 기존 `initFpPlay` → `rt.enterFirstPerson()`. top-1 기억은 `_pickTopMemoryForLumen`(archive.js, finder 스코어링 재사용).
- [x] **진입 독백 2문장 유지 (2026-04-21 확인)** — `play-test.html:4576-4632`에 mono1("여긴 어디지?")·mono3("나갈 땐, 저기로 나가는 게 좋겠어.") 이미 존재. Lumen 흐름이 그대로 경유.
- [x] **exit door 이식 (2026-04-21 확인)** — `play-test.html:4586-4632` 원본 코드 유지. 수정 불필요.
- [x] **play-test 부팅 flash 보정 (2026-04-21 추가)** — `?memory` 감지 시 `#selectScreen` paint 전 숨김 + z-index 9998 검은 boot overlay(`_fpPlayActive` 전까지 유지).

### 작업 3 — 걸음 연출 시스템 [1.5 세션] — ✅ 완료 (2026-04-21)

**구현 경로**: 새 모듈 [js/ui/lumen_walk_effects.js](../js/ui/lumen_walk_effects.js). `runtime.tick` 이 `_fpTick` 직후 바로 render 까지 호출하므로 tick wrap 으로는 offset 이 그 프레임에 반영되지 않음 → **`renderer.render` wrap** 으로 전환하여 render 직전에 camera 수정. `_fpTick` / `_fpPos` / `_fpEuler` 건드리지 않음. play-test.html FP 진입 직후 `LumenTerrainAdapter` + `LumenWalkEffects` attach.

- [x] **카메라 bob (2026-04-21)** — sin 기반 y-offset, 기본 8mm / freq 1.2Hz / `bobDepthGain 0.10` · `bobDepthCap 2.0` (depth 폭주 시 최대 16mm로 cap). 정지 시 0.
- [x] **헤드스웨이 (2026-04-21)** — sin 기반 yaw offset, ±1° (0.01745 rad) / freq 0.6Hz (bob 의 절반). 움직임 중만.
- [x] **정지 breathing (2026-04-21)** — sin 기반 y-offset, 1cm / freq 0.3Hz (~3.3초 주기). 정지 시만.
- [x] **관성 (2026-04-21)** — 시각 x,z 지수 smoothing. accel tau 0.10s / decel tau 0.07s. 논리 `_fpPos`는 그대로, 시각만 lag. 스코프 "0.3s / 0.2s" 는 체감 목표 — exp smoothing time constant 는 그보다 작게 튜닝.
- [x] **스텝 사운드 (2026-04-21)** — bob sin +→− zero-cross 시 WebAudio 합성(흙바닥: 320~460Hz lowpass noise + 180Hz low-shelf +3dB, 240ms decay). **고정 샘플 파일 미사용** — `sounds/footstep.mp3`(15초 ambient)는 겹침 버그로 폐기. 5-variant 로테이션(cutoff + playback rate). 이속 `_fpSpeed` 8→4.5 로 동시 하향. 실 샘플 분리(층별 3~5) 는 V2.

### 작업 3b — 시각 연출 레이어 [1 세션]
- [ ] Fog 밀도 (FogExp2, 오염 depth 연결)
- [ ] Vignette (오염 depth 연결)
- [ ] Floating Anchor 거리 재튜닝

### 작업 3c — 청각 공간 레이어 [1.5 세션]
- [ ] Positional audio (유령 whisper 방향성)
- [ ] Noise floor (오염 depth 연결)
- [ ] Depth drone (중심 근접도 연결)

### 작업 4 — scene 잔상 공간 배치 [2 세션]
- [ ] 기존 echo word floater 확장
- [ ] 유령 응결 좌표에 잔상 텍스트 배치
- [ ] VAD → 위치 매핑 검증

### 작업 11 — 미니맵 수정 [0.3 세션]
- [ ] 유령 점: 전체 응결 좌표 표시 → **시선 교차로 마주친 유령만** 점 누적 표시
- [ ] 출구: 들어온 문과 같은 위치에 고정 표시 (바깥 원 위)
- [ ] 기존 미니맵 로직에 조건부 렌더 + 고정 점 추가

### 작업 7 — 메모리 큐레이션 [0.3 세션, 테스터 + 시범]

**2026-04-21 확정**: 접근 방식 3차 변경.
- (1차) RECORD 흐름 → (2차) SQL 직접 INSERT → **(3차) Admin UI 저작 (작업 12-L 사용)**
- 이유: 작가가 매체 안에서 시뮬 보며 창작하는 게 품질 최고. 워크시트/SQL 왕복은 과정이 바깥에서 돎.

**편지(E-004) = 테스터 확정** (2026-04-21).
- [x] **E-004 fills 완료 (2026-04-21)** — [supabase/seeds/lumen_mem_E-004_fills.sql](../supabase/seeds/lumen_mem_E-004_fills.sql), Sprint 1 코드 테스트용
- Lumen 데모 제출용 스토리는 아님.

**Lumen 데모 메모리 창작** (Sprint 2 이후 작가 페이스):
- [ ] 3개 목표 유지 (이본 시연)
- [ ] 언어 분배 기본값: 2 ko + 1 en
- [ ] 감정 분산: AF 좌표 서로 다른 사분면

**Sprint 2에 할당된 0.3 세션**:
- [ ] Admin 저작기로 **시범 메모리 1개 작성** (기능 검증 + 워크플로 체감)
- [ ] 응결점·시뮬 가시화 동작 확인

**품질 기준** (레퍼런스):
- 장면 7~10 (공간에 핀 풍부하도록)
- `text_stage_2`만 작성 (β 접근)
- PII/안전 트리거 회피
- 파일럿 n=5~7 반복 재생 견딜 감정 톤

**관련 문서**:
- [docs/lumen_memory_story_worksheet-260421.md](lumen_memory_story_worksheet-260421.md) — 워크시트 (Admin UI 실패 시 백업 경로)
- [docs/lumen_memory_authoring_checklist-260421.md](lumen_memory_authoring_checklist-260421.md) — 레버 레퍼런스
- [supabase/seeds/lumen_memory_template.sql](../supabase/seeds/lumen_memory_template.sql) — SQL 템플릿 (백업)

### 작업 2 — 귀환 구조 풀 [3.5 세션]
- [ ] 2-A: 궤적 기록 (`_fpTrajectory.push`, 150ms 단위) + rewind 재생 [1] — 어댑터의 `getTrajectory()` 활용
- [ ] 2-B: 색감 shift + 속도 ×1.5 + 유령 자세 변화 [1]
- [ ] 2-C: 유령 말투 미세 변화 + 입력 파편 재셔플 [1]
- [ ] 2-D: 귀환 전용 사건 2~3개 (입력 파편 공중 출몰 등) + 통합 [0.5]

### 작업 8 — Artist statement 계보 명시 [1 세션] — 🔄 진행 중
- [ ] 3~4명 실명 레퍼런스 (본인이 실제 아는 작가만)
  - 후보: Lozano-Hemmer / Yoko Ono / 오수경 / 하차연 / Lynn Hershman Leeson / Ian Cheng
- [ ] TEM을 어느 계보 교차점에 놓는지 선언

### 작업 9 — 증거 패키지 [1.5 세션]
- [ ] 스크린샷 4~10장 (시작 / 첫 유령 / 중간 / void / 귀환 / 종료)
- [ ] 1~2분 데모 영상 (OBS 녹화, 간단 편집)
- [ ] 짧은 프로젝트 설명 (Lumen 카테고리 맞춤)

### 작업 12 — Admin 메모리 저작기 (L 티어) [2.2 세션]

**2026-04-21 확정**: 워크시트·SQL 직접 작성 → **Admin UI 통합 저작**으로 전환. 이유: 작가가 시뮬 돌려보며 감정 입력·궤적·패턴 실시간 확인하면서 창작. 피드백 루프 단축 → 메모리 품질 상승.

**기존 인프라 확인** (2026-04-21 재조사):
- `+ 새 메모리 추가` 버튼 + `addNewMemory()` 존재 ([admin.html:55](../admin.html#L55), [admin.js:234](../js/admin.js#L234))
- 메타 입력(title·code·memory_words·completed_sentence·author_note) ✅
- `original_vector` 6-dim 슬라이더 ✅ (17-dim 확장은 V2)
- 씬 CRUD + scene_type + 본문 + text_stage_2 에디터 ✅
- VOID 토글 4 + voidLevel + 잔향 단어 input + Original Emotion 매핑 ✅
- admin-trajectory 페르소나 재생 ✅
- 저장 로직 `saveMemory()` ✅

→ **기존 폼에 섹션 추가**하는 방식이라 원래 3.0 세션 추정 과대. 재견적 2.2.

#### 12-1. 메모리 수준 폼 확장 [0.4] ✅ **2026-04-21 완료**
기존 폼 ([admin.html:55~170](../admin.html#L55-L170))에 섹션 끼워넣기:
- [x] `sensory_anchor` 섹션 (modality 라디오 + content input + weight 슬라이더)
- [x] `original_reason_vector` (AF) — 3+4 슬라이더 + 합계 실시간 표시 + 정규화 버튼 (삼각/사각 SVG picker는 V2 폴리시로 이월)
- [x] 오염 초기 상태 섹션: `cont_depth` range + `cont_divergence/convergence/heterogeneity` 3 슬라이더 + `cont_stage_1/2/3` 3 슬라이더 + 합=1 정규화
- [x] `terrain_shape` 드롭다운 (현재 'circular'만)
- [x] [admin.js:282](../js/admin.js#L282) `loadMemory()` 확장, [admin.js:1848](../js/admin.js#L1848) `saveMemory()` 확장
- [x] [repo.js:108](../js/lib/repo.js#L108) `saveMemoryGraph` 페이로드 확장 (UPDATE/INSERT 양쪽 조건부 spread)
- [x] 버그 fix: `sound_map` 컬럼 drop된 상태 대응 (조건부 포함)
- [x] **DB 라운드트립 smoke 검증 (2026-04-21)** — [test/smoke_task_12_1.js](../test/smoke_task_12_1.js), ALL 13 checks PASS + sound_map 잔존 참조 없음 확인

#### 12-2. 씬 수준 폼 확장 [0.2]
- [ ] `original_reason_vector` 씬별 AF picker (작은 버전) — 현재 씬 수준엔 없음
- 나머지(VOID/잔향/Original Emotion 매핑/text_stage_2)는 기존 UI 그대로

#### 12-3. 응결점 편집 [0.4]
- [ ] 원형 지형 SVG (R=56) overlay — 신규
- [ ] `ghost_condensation_points` 드래그 편집 (추가/삭제 + threshold 슬라이더)
- [ ] 씬 pin 자동 배치 (VAD 투영) 참조 표시
- [ ] Canvas 탭 내 서브뷰 or 새 탭

#### 12-4. 분기 시뮬·가시화 [1.0]
- [ ] 가상 관객 감정 입력기 (6-dim 슬라이더 or 프리셋 페르소나 로드)
- [ ] 매 씬마다 **alignment·level·shape·transition_pattern** 실시간 계산·표시
- [ ] SceneNavigator 호출하여 **다음에 열릴 후보 씬** 하이라이트
- [ ] 비교 모드: 가상 관객 2명 감정을 다르게 주입하여 궤적이 어떻게 갈라지는지 side-by-side
- [ ] 기존 [admin-trajectory.js](../js/admin-trajectory.js) 페르소나 재생 로직 확장

#### 12-5. 마감 [0.2]
- [ ] 스타일 일관성 (기존 admin 패턴 따름)
- [ ] 저장 안정성 (실수 방지 확인 다이얼로그)
- [ ] 에러 처리 최소선

**V2 이월 (L에 포함 안 됨)**: `original_vector` 17-dim 확장, 동심원 overlay·layer_radii 슬라이더·center_void 위치 지정·색상 테마 프리셋.

### 작업 13 — Play entry 감정진입점 motif 매칭 [0.5 세션] — ✅ 완료 (2026-04-21)
- 목적: motif_tags를 Play entry 매칭 신호로 활성화. 관객 입력 키워드가 특정 motif와 겹치면 해당 메모리 우선순위 ↑. motif_tags가 "죽은 작가 메모"에서 "감정진입 인덱스"로 재정의.
- [x] **motif_tags 위치 확정 (2026-04-21)** — `scenes.meta.motif_tags`(현행) + `memories.meta.motif_tags`(미래 확장) 둘 다 aggregate. 현 템플릿은 scene-level이므로 메모리의 모든 scene motif_tags 합집합으로 해석.
- [x] **memories 쿼리 selector (2026-04-21)** — no-op 확인. [js/services/NetworkService.js:37](../js/services/NetworkService.js#L37) `.select('*')` + scenes full fetch 이미 `meta` 포함. 쿼리 수정 불필요.
- [x] **유사도 보너스 구현 (2026-04-21)** — [js/app/archive.js](../js/app/archive.js)
  - `_collectMotifTags(memory)` — 메모리 레벨 + scene 레벨 motif_tags를 Set으로 합침 (lowercase 정규화)
  - `_motifBonus(queryLower, memory)` — 한국어 agglutinative 특성 대응으로 substring 매칭 (`query.includes(motif)` hit count)
  - α 상수 `_MOTIF_ALPHA = 0.15` — 튜닝 용이하게 module-top 노출
  - 적용 경로: `_finderMatchByText`, `_pickTopMemoryForLumen` text branch. chip-only `_finderMatch`는 입력 텍스트 없음 → 적용 안 함.
- [x] **아키텍처 편차 기록 (2026-04-21)** — 원문은 `supabase/functions/claude-scene` `play_entry_match` 프롬프트 확장을 명시했으나, 실제 아키텍처는 100% 클라이언트측 매칭 ([archive.js:_finderMatchByText](../js/app/archive.js)). claude-scene에 `play_entry_match` 타입 부재. LLM 라운드트립은 오프닝 UX 지연을 낳아 회피 — 클라이언트 구현으로 대체. 유사도 공식(cosine + α×intersection)은 동일.
- Sprint 2에 배치 → **Sprint 0 조기 완료** (작업 0 병행 중 자투리 0.5 세션 소화)

### 작업 10 — 파일럿 n=5~7 [별도, 5-09~13]
- [ ] 5월 초 대상자 확정
- [ ] 5-09~13 실시
- [ ] 조작적 정의는 5-07 외부 시연 전에 별도 체크리스트 md로 확정 (사후 cherry pick 방지)
- [ ] 결과는 작업 8·9에 반영
- 관찰 항목 (참고): 첫 30초 개념 감지, 튜토리얼 탐색 여부, void 체류, 귀환 후 자유 응답

---

## 5. V2 연기 (건드리지 말 것)

**코드 건드릴 유혹이 올 때 여기로 이월**:

- TTS / 자기 목소리 유령 / plays.first_input_field*
- 오염 3축 중 convergence, divergence (이동 제어 X)
- Admin UI 확장 (Canvas 지형 모드, 운영 탭 필터 등)
- 화면 가장자리 왜곡 shader
- Reverb (ConvolverNode)
- 숨소리
- trajectory_bridges / 개인 아바타 유령
- 연출 레이어 L (포트 경향성), M (유령 경로)
- 기억유전학 v0.4 확장
- SoundscapeBeta + sound_map 전면 제거 (레거시 대청소)
- MM23L 자유 키 감정 모델 재설계
- ghost_presets DB화

---

## 6. 수정 금지 함수

**모두 [js/shared/tem_af_strata_terrain.js](../js/shared/tem_af_strata_terrain.js) 한 파일에 위치.** 어댑터는 이 파일을 import만 할 것.

```
enterFirstPerson       (L1159)
_fpTick                (L1159 enterFirstPerson 내부)
gH                     (L645)   ⚠️ 중복본: js/af-terrain-test-page.js:414 — canonical은 tem_af_strata_terrain.js
buildMemoryItems
computeAfTerrainFields
```

이 함수들은 한 글자도 수정하지 않는다. Lumen 작업은 어댑터 패턴으로만 확장한다.
위반 시 regression 위험이 크다.

---

## 7. 일정

| 구간 | 기간 | 내용 | 세션 |
|---|---|---|---|
| Week 0 (일본) | 4-21~22 | 문서 · DB SQL · 편지 fills · 귀환 컴포넌트 정의 | 1.3 (실제 1일에 ~완료) |
| 귀국/시차 | 4-23 | 휴식 | — |
| Sprint 1 | 4-24~26 | 작업 0 + 3 + 3b + 3c + 11 | 6.3 |
| 통합일 | 4-27 | 본인 한 바퀴 + 버그 리스트 (코드 금지) | — |
| Sprint 2 | 4-28~30 | 작업 1 + 4 + 7(시범) + 12-L + 13 | 5.5 |
| 통합일 | 5-01 | 메모리 1개 풀 사이클 체험 (귀환 빼고) | — |
| Sprint 3 | 5-02~05 | 작업 2 (귀환 풀) | 3.5 |
| 통합일 | 5-06 | 귀환 포함 풀 사이클 체험 | — |
| 외부 시연 | 5-07~08 | 친구 1~2명 비공식 | — |
| 파일럿 | 5-09~13 | n=5~7 실시 + 정리 | — |
| Sprint 4 | 5-14~16 | 작업 8 + 9 | 2.5 |
| 버퍼 | 5-17~19 | 파일럿 반영 + 최종 점검 + 제출 | — |

**총 코드 세션**: 15.3 (직전 16.1 − 작업 12-L 재견적 0.8 [3.0→2.2, 기존 admin 인프라 반영])
**총 기간**: 28일 (4-22 ~ 5-19)

---

## 8. 작업 원칙

1. 스프린트 끝나면 통합일. 통합일에 코드 커밋 금지. 체험 + 메모만.
2. 같은 파일을 2시간 내 3번 이상 수정 시도 시(기능 추가가 아니라 디버깅) 작업 중단, 10분 쉰 뒤 재개.
3. 스코프 밖 작업 욕구는 즉시 `docs/V2_backlog.md`에 기록하고 본 작업 복귀.
4. 통합일마다 "이번 스프린트에서 하고 싶었는데 안 한 것" 리스트를 `V2_backlog.md`로 이월.
5. Week 3 귀환 작업 시작 전(5-01 통합일)에 귀환 8개 컴포넌트 "최소 작동 정의" 문서 재검토.
6. 5-09까지 3-A/B/C 중 하나라도 미완이면 **2-D(귀환 전용 사건)를 즉시 V2로 포기**.

---

## 9. 결정 기록

### 9-1. `ghost_condensation_points` 저장 위치 — **A-2 확정 (2026-04-21)**
- DB 컬럼 `memories.ghost_condensation_points` (JSON) 유지.
- Admin 튠 UI를 Lumen 스코프에 포함 (작업 12 참조). 드래그 편집으로 iteration 속도 확보.
- 근거: 파일럿·큐레이션 단계에서 좌표 튜닝 iteration이 클 것으로 예상. SQL 직접 편집은 iteration 속도가 JS 편집보다도 느림 — A-1은 B보다 열등. A-2를 수용하려 0.8 세션 스코프 확장.

---

## 10. 성공 판정 (5-19 기준)

제출 전 체크:

- [ ] AF 지형 1인칭 공간 내비게이션 작동
- [ ] 귀환 풀 사이클 작동 (궤적 기록·재생·3종 이상 변화 신호)
- [ ] 메모리 1~2개 end-to-end 체험 가능
- [ ] 파일럿 n≥5 결과 정리됨
- [ ] 스크린샷 4~10장 + 영상 1~2분 확보
- [ ] Artist statement 계보 3~4명 명시
- [ ] Lumen 제출 양식 작성 완료

위 7개 중 하나라도 미충족 시, 5-17~19 버퍼를 해당 항목에 투입.
버퍼로도 못 채우는 항목이 있으면, 해당 항목을 제외하고 제출 or 제출 포기 판단.

---

## 11. 비상 시나리오

**시나리오 A — Sprint 3 귀환 작업 지연 (5-13까지 2-C/D 미완)**
- 2-D 포기
- 2-C 부분 구현(말투 변화만, 파편 재셔플 연기)
- Sprint 4 일정대로 진행

**시나리오 B — 파일럿 n<5 (5-13까지 3명만 실시)**
- n=3으로 증거 패키지 작성
- artist statement에 "파일럿 초기 관찰 (n=3)"으로 명시
- 제출 진행

**시나리오 C — 치명 regression 발견 (5-15 이후)**
- 해당 기능 off (feature flag)
- 작동 가능한 범위로 영상·캡처 재촬영
- 제출은 유지

**시나리오 D — 완수 불가 (5-17 시점 판단)**
- Lumen 제출 철회 or 카테고리 하향
  (※ 원본의 "Interactive Art+ → Digital Art 일반"은 Ars Electronica 용어. Lumen 실제 카테고리명은 제출 직전 확인 후 교체)
- TEM 현재 상태로 아카이브, 7월 파일럿 이후 다음 공모전 재도전

---

## 12. 관련 문서

- `docs/update_lumen-260420.md` — 계획 원본
- `docs/V2_backlog.md` — 연기 항목 전부 (md-date 훅이 `V2_backlog-260421.md`로 리네임함)
- `CLAUDE.md` — Claude Code 세션 가드레일 (현재 `CLAUDE-260418.md`)
- `prompt/critic.md` — critic v3 프롬프트. TEM 83점 B+ 판정 좌표계 기준점 (2026-04-20).
- `docs/LUMEN_return_components-260421.md` — 귀환 8개 컴포넌트 최소 작동 정의 (작성 예정, 5-01 전)
- `docs/pilot/*.md` — 파일럿 관찰 기록 템플릿 (작성 예정, 5-07 전)

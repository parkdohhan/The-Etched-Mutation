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

### 작업 3b — 시각 연출 레이어 [1 세션] — ✅ 완료 (2026-04-22)

**구현 경로**: 새 모듈 [js/ui/lumen_visual_effects.js](../js/ui/lumen_visual_effects.js). walk_effects 와 동일하게 `renderer.render` wrap 패턴. 원본 `scene.fog` 밀도(0.008, [tem_af_strata_terrain.js:957](../js/shared/tem_af_strata_terrain.js#L957))는 attach 시점에 스냅샷 → FP 종료 시 복원. FP 밖에선 vignette opacity 0으로 autohide.

- [x] **Fog 밀도 depth 연결 (2026-04-22)** — `scene.fog.density = fogBaseDensity * min(fogDepthCap, 1 + depth * fogDepthGain)`. 기본 gain 0.35, cap 3.0 → depth 0일 땐 원본 0.008 유지, depth 폭주 시 최대 0.024.
- [x] **Vignette (2026-04-22)** — DOM overlay div + radial-gradient. 새 shader 금지(SCOPE §0 후속 원칙)에 부합. opacity = `vignetteBaseOpacity + depth * vignetteDepthGain`, cap `vignetteMaxOpacity 0.75`. 기본 inner stop 38% (중앙 선명), outer 100% (가장자리 암전).
- [x] **Floating Anchor 거리 재튜닝 (2026-04-22 / 파일럿 후 실 적용)** — `anchorHeightOffset` 옵션으로 노출. 기본 0(원본 배치 유지). 파일럿 체감 확인 후 `vfx.setOptions({anchorHeightOffset: n})` 로 조정. 실 sprite 배치 함수(`tem_af_strata_terrain.js:880` `baseY = ewh + 2 + wi*1`)는 수정 금지 대상이므로 현 단계는 tuning hook 만 제공.
- [x] **통합 (2026-04-22)** — [play-test.html:49](../play-test.html#L49) script include + FP attach 블록에 `LumenVisualEffects.attach` 추가 (walk_effects 뒤, audio_space 앞). 체인 순서: walk wrap → visual wrap → audio → origRender. 서로 간섭 없음.
- [x] **Smoke 검증 (2026-04-22)** — [test/smoke_task_3b.js](../test/smoke_task_3b.js), 9/9 PASS: fog·vignette 존재 · depth=0 기본치 · depth=3 단조증가 · depth=9999 cap (fog base×cap, vignette maxOpacity). FP 종료 시 원복은 수동 확인(가이드 출력).

### 작업 3c — 청각 공간 레이어 [1.5 세션] — ✅ 완료 (2026-04-22)

**구현 경로**: 새 모듈 [js/ui/lumen_audio_space.js](../js/ui/lumen_audio_space.js). 독립 AudioContext에 3-레이어(whisper × N / noise floor / depth drone). `runtime.tick` wrap 으로 매 frame 리스너 위치·방향 + 게인 smoothing 업데이트 (walk effects 는 `renderer.render` wrap이라 중복 없음). `_fpTick` / 카메라 논리 상태 수정 없음.

- [x] **Positional whisper (2026-04-22)** — `sfx_resonance.mp3` 루프, PannerNode(HRTF, inverse distance, refDist 2 / maxDist 20 / rolloff 1.6). 현재는 `_fpScenePins` accessible pin 위치를 whisper 소스로 사용. `memories.ghost_condensation_points` (작업 11에서 select 확장됨)로 교체는 Admin UI(작업 12-3) 저작 완료 후. playbackRate ±0.04 variant + 시작 offset 분산으로 동기 발화 방지. maxWhispers=6.
- [x] **Noise floor (2026-04-22)** — `Base_white.mp3` 전역 루프, `gain = min(0.25, 0.02 + 0.06 × cont_depth)`. depth=0 에서도 2% 옅은 벽지. 콘솔 검증: contDepth=85 → gainMax 0.25 수렴 확인.
- [x] **Depth drone (2026-04-22)** — `Base_Void.mp3` 전역 루프, `gain = max(0, (1 − r / (terrainR × 0.55))) × 0.45`. 중심 가까울수록 크게, 외곽 ratio 초과 시 0. 검증: r=25.46 / outer=30.8 → prox 0.17 × 0.45 ≈ 0.078 일치.
- [x] **debug API (2026-04-22)** — `rt.__lumenAudioSpace.getDebug()`/`muteLayer(name, bool)` 로 레이어 개별 격리·상태 덤프 제공. 파일럿 시 audio 디버깅 편의.

### 작업 4 — scene 잔상 공간 배치 [2 세션] — ✅ 완료 (2026-04-22)

**구현 경로**: 새 모듈 [js/ui/lumen_scene_ghosts.js](../js/ui/lumen_scene_ghosts.js). `renderer.render` wrap 패턴 (walk/visual_effects 와 동일 체인, 마지막 attach → 가장 바깥). 수정 금지 함수 원칙 준수 (tem_af_strata_terrain.js 한 글자도 안 건드림).

- [x] **Echo word floater 확장 (2026-04-22)** — strataView `_makeTextSprite` 연출(Gowun Batang + chromatic red/cyan blur + violet-white glow)을 FP 용으로 재구현. fontPx=44, shadowBlur=14, colorCss=pale violet `rgba(232,216,252,0.92)`.
- [x] **유령 응결 좌표에 잔상 텍스트 배치 (2026-04-22)** — `_fpGhostPoints` 를 소스로 sprite 생성. 점 index 에 memory-wide echo_words 풀을 modulo 픽(결정적 — 같은 점 → 같은 단어). 높이 `runtime.gH(x,z) + baseY(2.8m)` + bob(sin) ±0.22m. 가시성: `baseOpacity 0.14` → 카메라 거리 ≤ `proximityNear 6` 에서 `nearOpacity 0.72`, ≥ `proximityFar 26` 에서 base. `isSeenIndex` 콜백(작업 11 `_fpSeenGhosts` 연결)이 true 인 인덱스에 `seenBoost 0.18` 추가.
- [x] **VAD → 위치 매핑 검증 (2026-04-22)** — 점 좌표계 = camera world (x,z ∈ [-56,56]). Admin 12-3 저작 시 AF 투영으로 찍힌 점과 여기서 렌더되는 world 좌표 1:1. smoke 테스트([test/smoke_task_4.js](../test/smoke_task_4.js))에서 (-20,-20)·(10,5)·(0,25) 세 fake point 로 근접 ↔ 원거리 opacity 검증.
- [x] **씬 핀 Lumen 미니맵에서 제거 (2026-04-22 scope change)** — `_updateMinimap` 의 `_fpScenePins.forEach` 블록을 `game.terrain_shape === 'circular'` 가드로 감쌈. Lumen 모드에선 유령 응결점(seen) + 출구만 남음. 일반 모드 기존 로직 유지.
- [x] **Lifecycle (2026-04-22)** — adapter `on('enter', build)` / `on('exit', clear)` 로 FP 세션별 자동 재생성·해제. attach 시점이 adapter enter 이후라 즉시 build 도 수행. `rt.__lumenSceneGhosts.rebuild()` / `getDebug()` 디버그 API 제공.
- [x] **통합 (2026-04-22)** — [play-test.html:52](../play-test.html#L52) script include. FP attach 블록에서 `_loadGhostPointsForCurrentMemory()` 선행 호출 + `LumenSceneGhosts.attach` (audio_space 뒤). `_initMinimap` 의 재호출은 idempotent.

### 작업 11 — 미니맵 수정 [0.3 세션] — ✅ 완료 (2026-04-22)
- [x] **유령 점 시선 교차 누적 표시 (2026-04-22)** — [play-test.html](../play-test.html) `_checkGhostGaze()` + `_fpSeenGhosts` Set. 카메라 forward 벡터와 (ghost-player) 방향 각도차 < 15°(`GAZE_HALF_ANGLE=0.26rad`) + 거리 < 35 유닛이면 seen 누적. `_updateMinimap`에서 seen set만 렌더(창백한 자주 `rgba(168,140,196,.85)`).
- [x] **출구 고정 표시 (2026-04-22)** — 들어온 문 좌표 (22, 22) 상수화 `EXIT_DOOR_POS`. 미니맵에 골드 직사각형(`rgba(196,168,130,.9)` 8×12 + outline) 세션 내내 고정.
- [x] **기존 미니맵 로직 유지 (2026-04-22)** — `_fpScenePins` 렌더·플레이어 삼각형·FOV cone 건드리지 않음. 추가 렌더만 삽입.
  - **씬 핀 가림 처리는 작업 4로 이동** — 씬 핀이 "미리 보이는 지도" 인 점은 Lumen 발견 기반 철학과 충돌. 작업 4에서 유령 응결 좌표가 대체 길잡이로 확립된 뒤 씬 핀 렌더 블록 제거 (scope change 2026-04-22).
- [x] **loadMemoryData 확장 (2026-04-22)** — memories select에 `ghost_condensation_points, terrain_shape` 추가, `game.ghost_condensation_points`로 저장. 좌표계는 camera world와 동일 가정(x,z ∈ [-56,56]).

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
- [ ] **수락 기준**: 시범 메모리가 (a) Admin UI만으로 저작 완료 (b) FP 진입 → 응결점 → exit 풀 사이클 재생 (c) 12-4 비교 모드로 두 페르소나 분기 시각 확인

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
- [x] **2-A: 궤적 기록 + rewind 재생 [1] (2026-04-22 완료)** — 궤적 기록은 작업 0의 어댑터가 이미 수행. Rewind 재생은 신규 모듈 [js/ui/lumen_rewind_playback.js](../js/ui/lumen_rewind_playback.js). 어댑터 코드 한 글자도 수정 안 함 — `runtime.__lumenAdapter.on('enterVoid')` + `getTrajectory()` 만 소비. `renderer.render` wrap 가장 바깥에서 매 frame `cam.position.set + setYaw` 강제 적용 (walk/visual wrappers 가 그 위에 sub-cm bob/breath 만 가미). 입력 잠금은 `keydown`/`keyup`/`mousemove` **capture phase** `stopPropagation` — 원본 `_fpKeys`/`_fpEuler` 까지 도달 X. 보간: trajectory backward-walking + linear lerp, yaw shortest-path. 옵션 `playbackSpeed` 기본 1.0 (2-B 에서 1.5 주입 예정), `triggerOnce`/`lockInput`/`minTrajectoryPoints`. play-test 통합 [play-test.html:53, 4615-4621](../play-test.html#L4615-L4621).
  - [x] **smoke** [test/smoke_task_2a.js](../test/smoke_task_2a.js) — 14 checks (콘솔 붙여넣기). API 표면, trajectory 길이, forceStart 후 cam pose, capture phase 입력 차단, 자연 종료 시 trajectory 시작점 도달, 종료 후 입력 통과.
  - [x] **수락 기준**: rewind 시작 → 진입구 방향 자동 이동 + WASD/마우스 잠금 (컴포넌트 정의 §2 충족). 자연 종료 후 입력 잠금 해제. 자동 종료(exitFirstPerson 호출) 까지는 작업 2-D 영역으로 분리.
- [x] **2-B: 색감 shift + 속도 ×1.5 + 유령 자세 변화 [1] (2026-04-23 완료)** — 신규 모듈 [js/ui/lumen_return_mode.js](../js/ui/lumen_return_mode.js). rewind·scene_ghosts 원본 미수정, `rt.__lumenRewind.on('rewindStart'/'rewindEnd')` 구독만. 3종 신호: (1) **색감** `strataCanvas.style.filter = 'hue-rotate(-22deg) saturate(0.68) brightness(0.88)'` 전환·복원(transition 0.4s). (2) **속도** attach 시점에 `rewind.setOptions({playbackSpeed: 1.5})` 선주입 → rewindStart 이후 첫 frame 부터 가속. (3) **유령 자세** scene_ghosts `colorCss`(pale violet→jaundiced amber)·`bobFreq`(0.32→0.55)·`bobAmp`(0.22→0.34) 전환 + `rebuild()` 로 texture 재생성 + 현 sprite `material.rotation` 0.18 rad(~10°) 기울임. rewindEnd 에서 전부 원복. play-test 통합 [play-test.html:54, 4623-4627](../play-test.html#L4623-L4627).
  - [x] **smoke** [test/smoke_task_2b.js](../test/smoke_task_2b.js) — 21 checks. API 표면·1.5 선주입·초기 상태·3종 신호 동시 전환(filter/speed/color/bobFreq/bobAmp/sprite rotation)·정상 종료 후 전부 원복·입력 잠금 해제(W 350ms 이동 감지)·triggerOnce gating + returnMode 독립 forceEnter/Exit 검증.
  - [x] **수락 기준 충족**: rewind 시작 직후 색감(canvas filter)·이동(rewind 1.5×)·유령(색·흔들림·기울기) 3종이 동일 frame 에서 관찰 가능. 종료 시 원복.
- [x] **2-C: 유령 말투 미세 변화 + 입력 파편 재셔플 [1] (2026-04-23 완료)** — 신규 모듈 [js/ui/lumen_return_speech.js](../js/ui/lumen_return_speech.js). rewind 구독형, 원본 미수정. 시드: `'lrs|' + memoryId + '|' + openingText` (sessionStorage `tem_opening_prefilled` 활용). PRNG: FNV-1a + mulberry32. (1) **파편 재셔플** — 입력 텍스트를 공백·구두점으로 토크나이즈 → 1~2 단어 n-gram 풀 → 시드 기반 deterministic shuffle → 1~3개 선택 → rewindStart 시 DOM overlay(#lumenReturnSpeech, z-index 260) 에 순차 fade-in/out. (2) **유령 말투 변주** — core/bridge 두 타입별 rewind 전용 monologue 3개씩 pool, 시드 결정적 pick 으로 최대 2개 선택. 화면 상단 고정 표시. rewindEnd 에 timer 취소 + DOM clear. play-test 통합 [play-test.html:55, 4628-4635](../play-test.html#L4628-L4635).
  - [x] **smoke** [test/smoke_task_2c.js](../test/smoke_task_2c.js) — 18 checks. API 표면·재현성(같은 seed 2회 동일)·다른 openingText/memoryId → 다른 순서·`chip:`/`text:` prefix 제거·빈 입력 edge case·forceStart 시 overlay + monologue/fragment DOM 생성·forceEnd 시 cleanup·기본 provider(sessionStorage fallback) crash 없음.
  - [x] **수락 기준 충족**: 동일 `(memoryId, openingText)` pair → 동일 fragment 순서·동일 monologue pick. memoryId 또는 openingText 중 하나만 달라도 결과 달라짐. 재현성 검증 2회 동일.
- [ ] 2-D: 귀환 전용 사건 2~3개 (입력 파편 공중 출몰 등) + 통합 [0.5]
  - [ ] **smoke** `test/smoke_task_2d.js` — 귀환 세션에만 사건 트리거, 일반 세션에선 발화 안 됨
  - [ ] **수락 기준**: 사건 2~3개 한 귀환 세션 안에 timing 겹침 없이 발생

### 작업 8 — Artist statement 계보 명시 [1 세션] — 🔄 진행 중
- [ ] 3~4명 실명 레퍼런스 (본인이 실제 아는 작가만)
  - 후보: Lozano-Hemmer / Yoko Ono / 오수경 / 하차연 / Lynn Hershman Leeson / Ian Cheng
- [ ] TEM을 어느 계보 교차점에 놓는지 선언
- [ ] **수락 기준** (글쓰기 → smoke 면제): (a) 3~4명 모두 본인이 실제로 아는 범위 (b) TEM 3축 중 최소 2축이 계보와 교차하는 주장 성립 (c) 학부생 톤, overselling 없음

### 작업 9 — 증거 패키지 [1.5 세션]
- [ ] 스크린샷 4~10장 (시작 / 첫 유령 / 중간 / void / 귀환 / 종료)
- [ ] 1~2분 데모 영상 (OBS 녹화, 간단 편집)
- [ ] 짧은 프로젝트 설명 (Lumen 카테고리 맞춤)
- [ ] **수락 기준** (미디어 캡처 → smoke 면제): (a) 스크린샷 각 단계 구분 가능 (b) 영상 1~2분 끊김·크래시 없음 (c) 제출 양식 해상도·형식 요건 준수

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

#### 12-2. 씬 수준 폼 확장 [0.2] ✅ **2026-04-22 완료**
- [x] 씬별 AF picker — `renderSceneAfPicker(scene, sceneIndex)`, VOID 섹션 아래 자동 삽입. 3+4 input + 실시간 합계 + 비우면 originalReasonVector=null 복귀.
- [x] 이벤트 위임 — `document.addEventListener('input', handleSceneAfInput, true)`. renderScenes 재호출해도 리바인딩 불필요.
- [x] 저장·로드 경로 재사용 — [repo.js:61](../js/lib/repo.js#L61) (load) + [repo.js:263](../js/lib/repo.js#L263) (save) 이미 wired (camelCase `originalReasonVector` ↔ snake `original_reason_vector`).
- [x] 디버그 getter — `window.currentScenes`로 모듈 스코프 let 접근 가능.
- [x] 콘솔 테스트 통과 (AF 섹션 11/11, 합계 표시, null 복귀)
- 나머지(VOID/잔향/Original Emotion 매핑/text_stage_2)는 기존 UI 그대로 유지

#### 12-3. 응결점 편집 [0.4] ✅ **2026-04-22 완료**
- [x] 원형 지형 SVG (R=56) viewBox `-60 -60 120 120`, 외곽 원 + 중심 void(5.6) 점선 표시 + 십자 가이드
- [x] `ghost_condensation_points` 편집: 빈 공간 클릭=추가 / 점 드래그=이동 / 리스트 ✕ 버튼=삭제 / 리스트 slider=threshold 조절
- [x] 클램프 — void 경계 안쪽 클릭은 경계 밖으로 밀어냄, R=56 경계 밖은 안쪽으로 당김 (직접 `_ghostPoints.push`는 우회)
- [x] 씬 pin 자동 배치 — `renderScenePinsRef()` 씬별 `originalReasonVector` → AF 좌표 투영 (attribution X축, core_fear Z축, 70% 반경 스케일). 값 없는 씬은 스킵
- [x] 위치: 메모리 편집기 "공간 설정" 섹션 내부 (별도 탭 안 만듦, UX 단순화)
- [x] 저장·로드 경로 — [repo.js:108](../js/lib/repo.js#L108) destructure + UPDATE/INSERT 조건부 spread. `listMemoriesWithScenesChoices` 반환 객체에 Lumen 필드 전수 포함 (이전 12-1이 로컬 캐시로만 작동하던 버그 수반 수정)
- [x] 콘솔 테스트 통과 (dots=3, rows=3, threshold 조절, 삭제, save 포맷)
- [x] UI 실제 드래그·저장 → DB 라운드트립 검증 (2026-04-22)

#### 12-4. 분기 시뮬·가시화 [1.0] ✅ **2026-04-22 완료**

**구현 경로**: [js/admin-trajectory.js](../js/admin-trajectory.js) Canvas 탭 사이드바 "분기 시뮬" 섹션 ([admin.html:433](../admin.html#L433) 페르소나 재생 바로 아래). ByeoriEngine + SceneNavigator 직접 import. 재생 데이터(`plays`) 없이 작가 입력값만으로 on-the-fly 시뮬.

- [x] **가상 관객 감정 입력기 (2026-04-22)** — 6-dim 슬라이더(fear/sadness/anger/joy/longing/guilt, admin `originalVectorEditor` 와 동일). 프리셋 6종(애도·공명·분노회피·무감·죄책·치유) 드롭다운 + `페르소나 ←` 버튼으로 선택된 실제 페르소나의 평균 `user_emotion` 불러오기.
- [x] **실시간 계산·표시 (2026-04-22)** — 매 step 마다 `ByeoriEngine.calculateStep({userVector, originalVector:{base, reason_analysis}, userTraj, origTraj, sceneScores})` 호출. readout 패널에 `pattern · bucket · align · level · shape · mismatch_type · fallback narrative` 표시.
- [x] **후보 씬 하이라이트 (2026-04-22)** — `SceneNavigator.navigate()` 결과 `#simOverlay` SVG 그룹에 렌더: **현재 씬=꽉 찬 원**, **후보 씬=점선 링 + 화살**, **방문 경로=점선 라인**. `renderGraph()` 말미에서 자동 재적용.
- [x] **비교 모드 (2026-04-22)** — 체크박스 ON → B runner 슬라이더 노출. 두 runner 독립 궤적·엔진 상태 유지. A=amber (#c4a882), B=teal (#6aa383) 색 구분, A 위 / B 아래로 8px offset 하여 겹침 방지.
- [x] **시작 씬 지능 선택 (2026-04-22)** — `memories.meta.emotion_entries` 있으면 dominant 감정의 entry 씬, 없으면 `scene_order=0`.
- [x] **로직 smoke (2026-04-22)** — 가짜 씬 5개 + 두 페르소나(애도/분노) N=6 step: 감정 차이로 pattern 분기 확인(echo_follow vs contradiction). 체크 6/6 PASS. 브라우저 DOM smoke 는 [test/smoke_task_12_4.js](../test/smoke_task_12_4.js).

#### 12-5. 마감 [0.2] ✅ **2026-04-22 완료**
- [x] **스타일 일관성 (2026-04-22)** — 12-1/12-2/12-3/12-4 신설 UI 가 기존 `.editor-section`/`.tv-section-label`/`.tv-toggle` 패턴을 그대로 사용하는 것 확인. 신규 CSS 추가 없이 기존 토큰만 재사용 (amber #c4a882, teal #6aa383).
- [x] **저장 안정성 — dirty-flag 기반 이탈 확인 (2026-04-22)** — [js/admin.js](../js/admin.js) 상단 `editorDirty` 플래그 + document-level delegation 으로 `#editorScreen` 내부 input/textarea/select 변경 감지. `cancelEdit()` 에서 dirty 면 confirm 다이얼로그. `beforeunload` 가드로 새로고침/탭 닫기도 경고. `saveMemory` 성공 및 `editMemory`/`addNewMemory` 초기 진입 시 clear.
- [x] **에러 처리 최소선 — 기존 `saveMemory` try/catch 수용 (2026-04-22)** — 저장 실패 시 alert + console.error (detail/hint/code/stack 포함) 로 복구 가능한 상태 유지. UI 는 편집 화면에 남아 있어 사용자가 재시도 가능. 네트워크·입력 검증·권한 3종 에러 모두 동일 경로로 흡수.
- [~] **smoke 기각 (2026-04-22)** — 별도 smoke 파일 생성 대신 수동 테스트로 대체: (a) 편집 중 취소 → confirm 표시, (b) 저장 후 취소 → confirm 없음, (c) 입력 없이 취소 → confirm 없음.
- [x] **수락 기준 충족**: dirty 이탈 가드로 변경 유실 방지, 저장 에러 alert + console 상세 로그, 편집 화면 유지로 재시도 가능.

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

### 작업 14 — 중심 void 표식 + 도달 체류 트리거 [0.5~1 세션] — 🔄 미착수 (2026-04-23 scope change)

**발견**: 작업 2-A 통합 중 UX 결함 확인. adapter 의 `enterVoid` 는 기하학적 경계(r < 5.6) 로만 발화. 맵 중심에는 시각 표식이 없어 플레이어가 void 인식 불가능. 자동 트리거로 두면 탐험 중 우연히 스쳐도 rewind 발동. 현재 play-test 에서 `triggerEvent: null` 로 자동 트리거 꺼둔 상태라 귀환 플로우가 실질적으로 수동 호출(forceStart)에만 작동.

**작업 내용**:
- [ ] 신규 모듈 `js/ui/lumen_void_marker.js` — 중심 (0,0) 에 3D 시각 표식 배치 (느린 회전 원판 · 수직 빛 기둥 · 바닥 파동 중 1종 선정). 진입 거리에 따라 강화(opacity·scale·pulse).
- [ ] 체류 타이머 — 5.6유닛 경계 진입 후 2~3초 누적 체류 시 rewind 트리거. 경계 밖 이탈 시 타이머 리셋. 스쳐 지나감 방지.
- [ ] play-test.html 에서 `LumenRewindPlayback` 의 `triggerEvent` 를 void_marker 의 커스텀 이벤트로 재배선 (어댑터의 raw enterVoid 직접 구독 해제).
- [ ] **smoke** `test/smoke_task_14.js` — 표식 scene 추가 확인 · 근접 시 opacity 증가 · 경계 2.5초 체류 시 rewind 시작 · 스쳐 지나감 (<1초) 시 rewind 미발동 · 경계 이탈 시 타이머 리셋.
- [ ] **수락 기준**: (a) 맵 진입 직후 플레이어가 중심 위치를 시각적으로 식별 가능, (b) 중심 방향 이동 중 드론+표식 강화 체감, (c) 2.5초 체류 시 자동 rewind, (d) 단순 통과(스치기) 시 rewind 안 발동.

### 작업 10 — 파일럿 n=5~7 [별도, 5-09~13]
- [ ] 5월 초 대상자 확정
- [ ] 5-09~13 실시
- [ ] 조작적 정의는 5-07 외부 시연 전에 별도 체크리스트 md로 확정 (사후 cherry pick 방지)
- [ ] 결과는 작업 8·9에 반영
- 관찰 항목 (참고): 첫 30초 개념 감지, 튜토리얼 탐색 여부, void 체류, 귀환 후 자유 응답
- [ ] **수락 기준** (외부 활동 → smoke 면제): (a) n≥5 확보 or 시나리오 B 발동 (b) 조작적 정의 체크리스트가 실시 전 commit 됨 (c) 피험자별 관찰 기록 `docs/pilot/*.md` 존재

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

**총 코드 세션**: 17.1 (직전 16.1 + 작업 14 [중심 void 표식, 2026-04-23 scope change — 2-A 통합 중 UX 결함 발견])
**총 기간**: 28일 (4-22 ~ 5-19)

---

## 8. 작업 원칙

1. 스프린트 끝나면 통합일. 통합일에 코드 커밋 금지. 체험 + 메모만.
2. 같은 파일을 2시간 내 3번 이상 수정 시도 시(기능 추가가 아니라 디버깅) 작업 중단, 10분 쉰 뒤 재개.
3. 스코프 밖 작업 욕구는 즉시 `docs/V2_backlog.md`에 기록하고 본 작업 복귀.
4. 통합일마다 "이번 스프린트에서 하고 싶었는데 안 한 것" 리스트를 `V2_backlog.md`로 이월.
5. Week 3 귀환 작업 시작 전(5-01 통합일)에 귀환 8개 컴포넌트 "최소 작동 정의" 문서 재검토.
6. 5-09까지 3-A/B/C 중 하나라도 미완이면 **2-D(귀환 전용 사건)를 즉시 V2로 포기**.
7. **작업 완료 조건** (2026-04-22 scope change, §8-1 참조):
   - (a) **smoke test 파일 필수 (코드 작업 한정)** — `test/smoke_task_*.js` 반복 실행 가능한 회귀 가드. 코드 수정이 없는 작업(큐레이션·글쓰기·촬영·파일럿)은 면제.
   - (b) **수락 기준 1~2줄 명시** — 해당 작업 bullet 블록에 "수락 기준" 항목 추가. 모든 작업 공통.
   - (c) **콘솔 테스트는 옵션** — 자동화 어려운 DOM/시각 상태만 devtools 1회 검증 + 결과 bullet에 기록.

### 8-1. 통합일 통과 시나리오 (2026-04-22 신설)

통합일은 "체험 + 메모" 에 더해 **아래 체크리스트 전부 PASS** 가 커밋 재개 조건. FAIL 항목은 다음 스프린트 최우선 또는 V2 이월.

**4-27 통합일 (Sprint 1 직후: 작업 0 · 3 · 3b · 3c · 11)**
- [ ] FP 진입 → 5분 자유 이동 중 crash/NaN 없음
- [ ] bob·headsway·breathing 시각 이질감 없음 (단일 피험자 감)
- [ ] step 사운드 겹침 없음, 8분 연속 이동에도 buffer 누수 없음
- [ ] depth 0 → 최대값 fog·vignette 단조증가, FP 종료 시 원복
- [ ] whisper·noise·drone 3레이어 동시 재생 시 clip 없음
- [ ] 미니맵에 seen ghost만 점진 표시 + EXIT_DOOR 고정 표시
- [ ] 콘솔 에러 0건

**5-01 통합일 (Sprint 2 직후: 작업 1 · 4 · 7시범 · 12-L · 13)**
- [ ] 오프닝 입력 → 흡수 연출 → FP 진입 끊김 없음
- [ ] Admin 저작기로 시범 메모리 1개 end-to-end (메타·씬·AF·응결점·저장·재로드)
- [ ] 잔상 텍스트 VAD 좌표 매핑이 실제 응결점과 충돌 없음
- [ ] motif_tags 겹치는 입력이 해당 메모리 우선 매칭
- [ ] 귀환 8개 컴포넌트 최소 작동 정의 문서 재검토 완료

**5-06 통합일 (Sprint 3 직후: 작업 2 귀환 풀)**
- [ ] 궤적 기록 → rewind 재생 역방향 일관
- [ ] 귀환 색감·속도·유령 자세 3종 변화 신호 식별 가능
- [ ] 입력 파편 재셔플이 같은 시드에 동일 결과 (재현성)
- [ ] 오프닝 → 흡수 → 공간 → void → 귀환 → exit door 풀 사이클 1회 clean run

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

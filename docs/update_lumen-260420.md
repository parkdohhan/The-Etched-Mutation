# TEM Lumen 2026 — 업데이트 계획

작성: 2026-04-20
기준 커밋: `4f49a1e` (main)
연계 문서: [.claude/plans/interactive-media-arts-hidden-biscuit.md](/Users/parksojung/.claude/plans/interactive-media-arts-hidden-biscuit.md) (IMA 비평 평가)

---

## 0. 컨텍스트

IMA 비평 평가에서 드러난 치명적 약점 세 가지 — **몸 부재(2.1)**, **개념-감각 단절(2.2)**, **인터랙션 필연성(2.7)** — 를 동시에 메우기 위한 구조 전환. 선형 scene flow를 공간 내비게이션으로 대체하고, AF 지형을 PLAY 메인으로 승격한다. 남는 약점(2.3 개인 아바타 유령, 2.5 제도적 위치, 2.6 미술사 계보, 실관객 검증)은 **이번 업데이트 스코프 외**이며 별도 트랙으로 취급.

**핵심 원칙:**
- 새 도구 금지 (Tone.js·새 shader·새 엔진 X). 기존 Three.js + Web Audio API + Supabase + Vanilla ES6로 해결.
- 기존 작동 코드를 **수정하지 말고 감싸는 어댑터**로 확장. `enterFirstPerson`·`buildMemoryItems`·`computeAfTerrainFields`는 손대지 않는다.
- 15–25분 풀 세션이 모든 서브시스템의 설계 제약.
- **보상 기호 금지, 카피 기호 금지** ("이제 돌아갑니다" 류 금지).

---

## 1. 확정된 구현 방향

### 1.1 플레이어 플로우
```
오프닝 → 첫 입력(3필드: 찾는 대상 / 감각 하나 / 시기)
  ↓ (GSAP 3–5초, 입력이 문으로 흡수)
PLAY (AF 지형 위 WASD 1인칭)
  ↓
중심 도달 (void, 무보상)
  ↓
귀환 (왔던 길 되돌아감, 이동 1.3–1.5배 빠름)
  ↓
바깥 문 통과
  ↓ (이때 처음 메뉴 출현)
  ├─ 또다른 나와 대화
  └─ 아카이브(목록형)
```
- ESC는 유지(접근성). 누를 시 "귀환 없이 나가시겠습니까?" 확인 → 미귀환(未歸還) 플래그로 기록.
- **Record 모드는 메뉴에서 제거**, 기능은 Play 내부에 유지.

### 1.2 공간 구조
- 동심원 위상 고정, 크기 고정(반경 R). 기억마다 **형태 파라미터만 변형**.
- 매핑: VAD → 지형 질감, clarity → 해상도. 확률적 편향, 결정적 아님(점성술 방지).
- 중심은 void. 바깥 유령 = 집합적·다수 잔상 합성 / 안쪽 유령 = 개별적·깊은 잔상.

### 1.3 이동·시야·음향
- WASD 반응성 ↔ 오염 3축:
  - 고오염 → 이동 끈적함
  - 이질성↑ → 방향 어긋남
  - 수렴↑ → 드리프트
  - 발산↑ → 입력 증폭
- 시야 제한: 기존 **Floating Anchor + Clarity** 재사용. **새 fog shader 금지**.
- 음향 풍부화 (Web Audio API): 깊이 드론 레이어링, 유령 근접 whisper, 지형 오염 noise floor. 시각 좁아질 때 청각 단서 증가.

### 1.4 유령
- 지형에서 **응결**(바깥 따라다니지 않음). 특정 좌표의 오염 밀도 임계값에서 생성.
- 유령이 관객을 **동행**. 유령 주변만 살짝 보임. 통제 불가. 깊이 갈수록 파편화·깜박임.
- 손전등·도구 수여 금지(RPG 문법).

### 1.5 깊이 점수
- 단일 지표 금지. 합성: sensory-first 응답률 + 감정 이질성 + clarity score.
- 첫 입력 clarity = 개인 baseline, 이후 편차로 측정.
- 얕은 응답 시 바깥으로 밀려남(유지 비용).
- 판정 기준은 artist statement에 명시(공략 방지).

### 1.6 귀환 변화 (코어 예술적 결정)
- "분명히 다른 점들"이 관객에게 **"내가 잘못 기억하나"** 수준의 의심을 유발.
- 구체:
  - 유령 말투·파편 순서 미세 변화
  - 지형 색감 shift
  - 같은 위치 유령 자세 변화
  - 이전 입력 파편이 다른 유령 입에서
  - 이동 질감 변화 (오염 3축 재샘플링)
- 귀환 전용 사건 2–3개 배치 (입력 파편 공중 출몰 등).
- **자기 목소리로 변하는 유령**: 관객 첫 입력 3필드 → TTS 합성 → 귀환 중반 이후 유령 입에서 재생. Freud의 unheimlich를 공간 이동에 박아넣는 구조.
- 세션 종료 고지: *"당신의 파편은 다른 누군가의 유령으로 흘러갑니다."* 다음 세션 유령 출처에 부분 오염된 표기.

### 1.7 Artist Statement 축
- **통과 의례의 형식 차용, 목적 뒤집기.**
- 귀환한 관객은 얻는 게 아니라 **자기 기억 확신을 잃고 나온다.**
- 지형은 기억에서 생성 — 두 관객이 같은 terrain을 공유하지 않음.
- 음성 V2 연기 사유 재서술: *"지형 층이 먼저 확립되어야 음성이 그 위에 퇴적될 수 있음."* "screen-based prototype, 음성 확장 V2 설계됨"으로 포지셔닝.

---

## 2. 현재 지형 로직 파악

### 2.1 좌표계
- **AF 축 정의**: [js/shared/tem_af_strata_terrain.js:8-9](js/shared/tem_af_strata_terrain.js#L8-L9)
  - `AX = {self_blame:-1, other_blame:0, fate_blame:1}`
  - `FZ = {abandonment:-1, rejection:-0.33, powerlessness:0.33, loss:1}`
- **산출 함수**: `pX()`, `pZ()` — 감정 → 귀인/공포 축 정규화 ([tem_af_strata_terrain.js:37-50](js/shared/tem_af_strata_terrain.js#L37-L50))
- **범위**: x, z ∈ [-1, 1]
- **3D 좌표**: PlaneGeometry (x, y=높이, z). 지형 **고정 크기 112×112 유닛** (SZ=112, G=160 샘플).
- **높이 결정 요소**: plays count + 장면별 감정 크기(eMag) + contamination depth.

### 2.2 지형 생성
- **실제 heightmap** (mesh-free 스프라이트 아님). `PlaneGeometry` 160×160 정점.
- **매 실행마다 재생성**: `buildTerrain(filterIdx)` 호출 시 geometry clone + shader `onBeforeCompile`.
- **Material**: `MeshStandardMaterial` + wireframe overlay + strata 레이어 shader (fbm3 noise, crevice falloff, [tem_af_strata_terrain.js:763-790](js/shared/tem_af_strata_terrain.js#L763-L790)).
- **Fog**: `FogExp2(0x12121a, 0.006~0.008)` 균일.
- **void 함몰**: `sc.voidScore > 0.3`에서 gaussian 깊이(-14 unit) ([tem_af_strata_terrain.js:415-421](js/shared/tem_af_strata_terrain.js#L415-L421)).

### 2.3 카메라와 이동 — **가장 중요한 발견**
- **Orbit 카메라**가 기본 ([tem_af_strata_terrain.js:967](js/shared/tem_af_strata_terrain.js#L967)).
- **FPS WASD 모드가 완전 구현돼 있음** ([tem_af_strata_terrain.js:1127-1246](js/shared/tem_af_strata_terrain.js#L1127-L1246)):
  - `enterFirstPerson()` / `exitFirstPerson()`
  - 키 입력: W/ArrowUp→전진, S/ArrowDown→후진, A/ArrowLeft→좌, D/ArrowRight→우
  - 마우스 look (yaw/pitch), pointer lock, 중력, 높이 clamp
  - dt 기반 이동 `_fpTick()` ([L1203](js/shared/tem_af_strata_terrain.js#L1203))
- 커밋 `6d08560`는 손전등·달리기를 **제거**했지만 기반 FPS 시스템은 살아있다. **Lumen은 이걸 승격만 하면 된다.**
- **궤적 기록은 없음**. `_fpPos.x/z`를 시간 배열에 누적하는 코드 부재.

### 2.4 세이브·영속성
- Supabase `plays` 테이블: memory_id, user_emotion, alignment, mismatch_type 저장 ([tem_af_strata_terrain.js:213](js/shared/tem_af_strata_terrain.js#L213)).
- **공간 궤적 저장 없음**. 어드민 trajectory 뷰어([js/admin-trajectory.js](js/admin-trajectory.js))는 scene graph만 시각화, 3D 좌표 안 씀.

### 2.5 재사용 점수표

| 항목 | 상태 | 재사용성 |
|---|---|---|
| AF 좌표 변환 (pX/pZ) | 완성 | ★★★★★ 그대로 |
| heightmap 생성 (computeAfTerrainFields) | 완성 | ★★★★★ 그대로 |
| **WASD FPS 이동** | **완성** | ★★★★★ **승격만** |
| shader strata 레이어 | 완성 | ★★★★☆ void 강조만 추가 |
| void 중심 표현 | 함몰만 | ★★☆☆☆ fog·shader 강화 필요 |
| 궤적 기록 | 없음 | 0 — 신규 |
| 동심원 변환 | 없음 | 0 — 신규 (쉬움) |
| WASD ↔ 오염 3축 | 없음 | 0 — 신규 |
| 귀환 재생 | 없음 | 0 — 신규 |

**결론: 기존 60% 재사용, 신규 40%.** 위험 요소보다 기회가 크다. FPS 시스템이 이미 있다는 것이 **가장 좋은 소식**.

---

## 3. 동심원 맵 형성 — 설계

### 3.1 데카르트 → 극좌표 전환
현재 (x, z) 데카르트 유클리드 거리로 **radius = √(x² + z²)** 를 추가 컬럼화. 새 메시는 필요 없고, 기존 heightmap 위에 반경 기반 포스트프로세싱 layer 추가.

```
radius = sqrt(x² + z²)   // 0 ~ √2 (모서리)
angle  = atan2(z, x)     // -π ~ π
```

지형 반경 R은 SZ/2 = 56 유닛. 반경 [0, R]을 N개 레이어로 분할(예: 4–5개).

### 3.2 레이어별 특성
| 레이어 | 반경 | 특성 | 유령 |
|---|---|---|---|
| 바깥 (peripheral) | 0.8R~R | 이동 자유, 시야 넓음, clarity 높음 | 집합적·다수 잔상 합성 |
| 중간 (mid) | 0.4R~0.8R | 오염 3축 반응성 증가 시작 | 혼합 |
| 내부 (inner) | 0.1R~0.4R | 유령 개별화, 시야 좁아짐 | 개별적·깊은 잔상 |
| 중심 void | 0~0.1R | 유령 소리 멈춤, 입력 파편 응결, 무보상 | 없음(침묵) |

레이어 경계는 시각적으로 **명시하지 않는다**. 관객은 몸의 감각(끈적함·드리프트·어긋남)으로만 "깊어짐"을 알아챈다.

### 3.3 크기 고정, 형태만 변형
- 반경 R은 모든 기억 공통(56 유닛).
- 기억별 변형: **지형 질감(VAD)·높이 분포(clarity)·유령 응결 좌표·void 가장자리 불규칙성**.
- 기존 `buildMemoryItems()`가 이미 per-memory 필터링을 지원 → 파라미터 확장으로 충분.

### 3.4 Void 중심 강화
현재 gaussian 함몰만 있음. 추가:
- `gH()` (heightfield sampler, [L1116·1170·1231](js/shared/tem_af_strata_terrain.js#L1116)) 에 반경 계산 후처리: radius < 0.1R 일 때 깊이 ×1.5, 바닥 darken.
- Fragment shader 수정 (`onBeforeCompile`) — **새 shader 파일 금지**, 기존 shader에 uniform 추가로 반경 기반 fog 강도 증가.
- void 근처 입력 파편 하나 응결 (existing echo word floater sprite 재사용, [L849+](js/shared/tem_af_strata_terrain.js#L849)).

### 3.5 재사용 가능 판정
**가능하다.** 기존 로직을 수정하지 않고 어댑터 모듈 `js/ui/lumen_terrain_adapter.js`를 새로 만들어 `enterFirstPerson`·`_fpTick`·`gH`를 래핑. 어댑터는:
1. 매 tick 반경 계산 후 오염 3축 → 이동 벡터 변환
2. 궤적 push (`_fpTrajectory.push({t,x,z,h,yaw})`)
3. 반경 < 0.1R 감지 시 `onEnterVoid()` 이벤트 발행
4. `exitFirstPerson` 오버라이드: 귀환 재생 또는 플러시

---

## 4. WASD ↔ 오염 3축 매핑 — 구체

기존 입력→이동 변환 ([L1218-1221](js/shared/tem_af_strata_terrain.js#L1218)) 은 순수 키→방향 벡터. 어댑터에서 다음을 적용:

```
baseVelocity = inputVector * speed
velocity     = baseVelocity
             * (1 - 0.6 * contamination_depth)      // 끈적함
             + perpendicular(baseVelocity) * heterogeneity * drift_amp  // 어긋남
             + (toCenter * convergence) * drift_speed                    // 수렴→중심쪽 드리프트
             * (1 + divergence * noise_amp)                              // 발산→입력 증폭
```

`contamination_depth`·`heterogeneity`·`convergence`·`divergence`는 [js/core/ContaminationTracker.js](js/core/ContaminationTracker.js) 에서 이미 계산됨 — 어댑터에서 참조만 하면 된다.

**신규 코드:** `computeContaminatedVelocity(input, contTracker, pos)` 함수 하나로 충분.

---

## 5. 귀환 메커니즘 — 구체

### 5.1 궤적 기록
- `_fpTick` 내 매 prime 프레임(예: 150ms)마다 push: `{t_ms, x, z, h, yaw}`
- 메모리 상한: 10분 세션 × 150ms ≈ 4000 포인트 → 충분히 가볍다.

### 5.2 귀환 트리거
- 관객이 void 중심(radius < 0.1R) 도달 + **정지 3초** 유지 시 `onVoidDwell` 이벤트.
- 어떤 카피도 안 띄운다. 단서:
  - 유령 whisper 페이드 아웃
  - 입력 파편 sprite 중심에 응결 (기존 echo word floater 재사용)
  - 화면 "호흡" 감속 (fog 밀도 +30%, 2초)
- 관객이 스스로 돌아서야 작품이 성립. 돌아서지 않고 30초 지나면 fog 밀도 추가 +20% (불편 유도, 강제 아님).

### 5.3 귀환 상태
- `returning = true` 플래그 후:
  - 이동 속도 ×1.3~1.5 (몸이 경로 기억)
  - 지형 색감 shift (기존 material uniform 조정)
  - 유령 재샘플링: 같은 좌표, 다른 말투·자세
  - 입력 파편이 다른 유령 입에서 튀어나옴 (이전 orient된 파편 배열 재셔플)
  - TTS 합성 음성 (다음 섹션 참조) 중반 이후 유령 whisper에 mix-in

### 5.4 자기 목소리 유령 (TTS 경로)
**핵심: 음성 V2 없이 즉시 구현 가능.**
- 관객 첫 입력 3필드 텍스트 → Web Speech API `SpeechSynthesisUtterance` 생성.
- 한국어 voice 우선 선택, pitch ±0.2 랜덤, rate 0.9.
- 귀환 중반(radius 0.5R 통과 시점)부터 유령 whisper 채널에 **기존 whisper 60% + TTS 40%** mix.
- **주의**: Web Speech API는 브라우저별 voice 품질 편차 큼. Chrome/Edge에서 한국어 voice 품질 사전 확인 필수. 품질 미달 시 fallback으로 저장된 generic whisper만 사용.

### 5.5 타이밍 — 사용자 질문 응답
이전 대화에서 물었던 "스며듦 vs 급격한 각성" 중 **스며듦(귀환 시작부터 조금씩 섞음)** 을 추천. 사유:
- 통과 의례의 "재통합" 감각에 부합 (일어남이 아니라 **녹아듦**)
- 관객이 "뭐가 달라졌지?" 의심 상태에 더 오래 머물게 함
- 급격한 각성은 게임적 reveal 문법에 가까워 RPG 문법을 피하려는 원칙과 충돌

단, 관객 파일럿에서 "스며듦이 눈치채지 못하고 끝남"이 관찰되면 귀환 직전 마지막 10%에만 ratio 역전(TTS 70%)하는 하이브리드로 조정.

---

## 6. Admin 영향 — 작가용 체크리스트

### 6.1 Admin 현황 요약
- **진입**: `/admin.html`, Supabase Auth + `profiles.role='admin'` RLS
- **탭 5개**: 목록/편집/잔상/Canvas/운영 ([js/admin.js](js/admin.js), [js/admin-trajectory.js](js/admin-trajectory.js))
- **RLS 정책**: [supabase/migrations/20250215000000_fix_admin_rls_policies.sql](supabase/migrations/20250215000000_fix_admin_rls_policies.sql)

### 6.2 Lumen 변경이 강제하는 Admin 작업 (까먹으면 안 될 것)

#### DB 스키마 추가 (마이그레이션 1건)
- [ ] `memories.terrain_shape` (enum: circular/spiral/dispersed)
- [ ] `memories.layer_radii` (JSON, 레이어별 반경 + 오염 임계값)
- [ ] `memories.center_void_x`, `center_void_y` (float; 중심이 정확히 원점이 아닐 수도)
- [ ] `memories.return_trigger_distance` (float, 기본 0.1·R)
- [ ] `memories.ghost_condensation_points` (JSON array, `[{x, z, pollution_threshold}]`)
- [ ] `memories.vad_to_texture_map` (JSON, VAD 3축 → texture ID)
- [ ] `plays.spatial_trajectory` (JSONB, `[{t,x,z,h,yaw,cont}]`)
- [ ] `plays.unreturned_flag` (boolean, default false)
- [ ] `plays.first_input_field1/2/3` (text) — TTS 재생용
- [ ] `plays.return_duration_ms` (integer)

#### RLS 정책 갱신
- [ ] 위 `plays` 신규 컬럼들에 플레이어 INSERT/UPDATE 허용, admin SELECT 허용
- [ ] `memories` 신규 컬럼은 admin UPDATE 허용 (기존 정책에 자동 포함되는지 확인)

#### Admin UI 추가 작업
- [ ] **목록 탭**: 메모리 카드에 terrain_shape 배지 표시
- [ ] **편집 탭 > 메타 패널**: 
  - [ ] terrain_shape 드롭다운
  - [ ] layer_radii 슬라이더 (최소 3, 최대 6 레이어)
  - [ ] center_void 좌표 (x, z 입력)
  - [ ] return_trigger_distance 슬라이더
- [ ] **Canvas 탭 > 지형 모드**:
  - [ ] 동심원 레이어 원 렌더 (기존 SVG 위에 overlay)
  - [ ] 중심 void 마커
  - [ ] 유령 응결점 마커 + 임계값 게이지
  - [ ] 페르소나 재생 시 공간 궤적 선 렌더 (기존 시뮬 코드 `L4103-4147` 활용)
- [ ] **운영 탭**: plays 목록 필터 — 귀환/미귀환/void 미도달 구분
- [ ] **plays 상세 뷰**: 첫 입력 3필드 표시 + TTS 재생 버튼 (디버그용)

#### 데이터 이행
- [ ] 기존 memories의 terrain_shape 기본값 `circular` 일괄 채움
- [ ] 기존 plays 레코드의 unreturned_flag = NULL (미확정으로 보존)
- [ ] sound_map 레거시 — **Phase 4 drop 예정. Lumen 작업 중 건드리지 말 것.** 별도 마이그레이션 사이클에서 정리.

### 6.3 건드리지 말아야 할 것
- `memories ← scenes ← choices` FK cascade 순서 (`deleteMemoryGraph()` in repo.js)
- `profiles.role` enum 값 — 변경 시 RLS 정책 **20개 전수** 갱신
- `contamination 3축 가중치` stage_1+stage_2+stage_3 = 1 정규화 검증
- `EMOTION_LABELS` ([js/admin.js:687](js/admin.js#L687)) ↔ `schema.sql` 매칭
- `localStorage tv_positions_${memoryId}` — 메모리 ID 변경 금지 (고아 데이터)
- Strata Three.js 미로드 시 Canvas SVG fallback — **항상** 유지

### 6.4 문서상 존재하지만 Admin에 없는 것 (이번에 같이 할지 결정 필요)
| 기능 | 상태 | Lumen과 연관성 | 이번에? |
|---|---|---|---|
| trajectory_bridges 수동 생성/편집 | DB 테이블 자체 부재 | **높음** (귀환 파편 흐름) | **예** 권장 |
| ghost_presets DB 테이블 | 코드는 [js/shared/ghost_presets.js](js/shared/ghost_presets.js)에 static 상수 | 중 | 아니오 (별도 트랙) |
| 연출 레이어 포트 경향성 | 미구현 | 낮음 | 아니오 |
| plays 수동 시뮬레이션 | 페르소나 생성만 있음 | 중 | 검토 |

---

## 7. 실제 새 작업 5개 — 우선순위와 견적

| # | 작업 | 난이도 | 의존 | 예상 세션 |
|---|---|---|---|---|
| 1 | 오프닝 → 첫입력(3필드) → 진입 플로우 | 중 | GSAP, 기존 opening.js | 2~3 |
| 2 | 귀환 구조 + 귀환 후 변화 (TTS, 파편 재샘플링, 유령 재샘플링) | 상 | 1, 4 | 4~5 |
| 3 | 이동 반응성 (오염 3축 → WASD 어댑터) | 중 | ContaminationTracker 재사용 | 2 |
| 4 | scene 단위 잔상의 공간 배치 (엔드 스크린 → 3D 씬) | 중 | 기존 echo word floater 확장 | 2 |
| 5 | 메뉴 아키텍처 (Record 숨김, 귀환 후 또다른나+아카이브 노출) | 하 | 기존 menu | 1 |
| 0 | (선행) Lumen terrain adapter 모듈 + DB 마이그레이션 | 중 | — | 2 |

**총 견적**: 13~15 세션. 순서는 0 → 3 → 1 → 4 → 2 → 5 권장 (어댑터·마이그레이션 먼저, 귀환 마지막).

### 그대로 쓰는 것 (손대지 말 것)
- AF 지형 생성 ([tem_af_strata_terrain.js](js/shared/tem_af_strata_terrain.js) 중 `buildMemoryItems`, `computeAfTerrainFields`, `enterFirstPerson`, `_fpTick`)
- Floating Anchor + Clarity 시스템
- 유령 매칭 로직
- Record Flow V3 백엔드 ([js/app/confession.js](js/app/confession.js))
- Byeori 엔진 ([js/core/ByeoriEngine.js](js/core/ByeoriEngine.js))
- Contamination Tracker ([js/core/ContaminationTracker.js](js/core/ContaminationTracker.js))
- 안전 시스템 (ESC·모달 복구)

---

## 8. 검증 전략

### 8.1 기술 검증
- Lumen 어댑터 단위 테스트: `computeContaminatedVelocity()`, 궤적 push/rewind 로직.
- Chrome·Safari·Firefox 최신판에서 pointer lock + Web Speech API 동작 확인.
- `plays.spatial_trajectory` JSONB 쓰기 부하 측정 (세션당 4000 포인트 × 동시 10명).

### 8.2 체험 검증 (IMA 간판을 위해 반드시 필요)
- **실관객 파일럿 n ≥ 10.** 현재 페르소나 시뮬 293 plays로는 backtracking 피로·중심 도달 신호·TTS 언캐니 효과 전부 가설. 
- 측정 항목:
  - 세션 완료율 (귀환 도달 % vs 미귀환 ESC %)
  - void 체류 시간 (3초 dwell 후 스스로 돌아선 비율)
  - "귀환 중 뭔가 달라졌다"는 자유 응답 빈도
  - TTS 목소리 인식 시점 (사후 인터뷰)
- 파일럿은 **Lumen 구현 완료 후 1주 내** 실시 권장. 작품 외부 3~5명 미리 포섭.

---

## 9. 리스크와 회피

| 리스크 | 발생 시 | 회피/완화 |
|---|---|---|
| Backtracking 피로 | 세션 완료율 <50% | 귀환 속도 ×1.5로 상향, 귀환 경로 짧은 메모리부터 파일럿 |
| Void 중심에서 30초 멈춤 | 관객 혼란 | fog 밀도 점진 증가 + 입력 파편 응결로 단서, 카피는 계속 금지 |
| Web Speech API 한국어 voice 품질 불량 | TTS 유령이 싸구려 | fallback generic whisper + pitch shift로 최소 연출 유지 |
| 오염 3축이 너무 강해 이동 불능 | 2축 기준 0.8 초과 구간 | 이동 불능 대신 "감각 과포화" 시각 효과 + 강제 감속 |
| 스키마 마이그레이션 실패 | 기존 plays 읽기 깨짐 | 모든 신규 컬럼 NULLABLE, 기존 SELECT 쿼리 backward-compatible |
| `enterFirstPerson` 기존 코드 변경 | regression | 어댑터 패턴 엄수, 원본 함수는 **한 글자도 수정 금지** |

---

## 10. 이번 스코프 밖 (명시적으로 연기)

- **2.3 개인 아바타 유령** (관객 A → 다음 세션 B의 개별 유령): trajectory_bridges 링크 로직은 이번에 **안** 만든다. 파편 흐름 카피만 작동, 실제 개인 아바타 출현은 다음 사이클.
- **2.5 제도적 위치 선택** (Ars Electronica vs ICIDS vs 갤러리): 구현 완료 후 파일럿 결과 보고 결정.
- **2.6 미술사 계보 선언**: Van Gennep·Turner·Hershman·Cheng 등을 artist statement에 박는 작업은 Lumen 코드 완료 후 논문·statement 트랙에서.
- **음성 V2** (실시간 음성 톤·숨·침묵 감지): 지형 층 확립 후 다음 사이클.
- **실제 피험자 n ≥ 30 실험** (IEEE TAC 수준): 별도 리서치 트랙.

---

## 참고

- 원본 아이디어 정리: 이번 대화 턴 (2026-04-20)
- IMA 비평 평가: [.claude/plans/interactive-media-arts-hidden-biscuit.md](/Users/parksojung/.claude/plans/interactive-media-arts-hidden-biscuit.md)
- 선행 로드맵: [docs/업그레이드_로드맵-260410.md](docs/업그레이드_로드맵-260410.md)
- 기존 지형 구현: [js/shared/tem_af_strata_terrain.js](js/shared/tem_af_strata_terrain.js), [js/ui/strataView.js](js/ui/strataView.js)
- Admin 현황: [js/admin.js](js/admin.js), [js/admin-trajectory.js](js/admin-trajectory.js)

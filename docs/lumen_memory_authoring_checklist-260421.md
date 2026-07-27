# Lumen 메모리 저작 체크리스트

> ⚠️ **2026-07-27 대체됨** — 현행 정본은 [기억저작_워크시트_v2-260727.md](기억저작_워크시트_v2-260727.md).
> 이 문서는 SQL 직접 INSERT 시절(4월) 기준.

SQL 직접 INSERT로 Lumen 데모용 기억을 만들 때 **연출 레버 누락 방지용 한 페이지**.
메모리 1개 쓸 때마다 이걸 훑고, 각 레버의 값을 먼저 결정한 뒤 [supabase/seeds/lumen_memory_template.sql](../supabase/seeds/lumen_memory_template.sql)에 박는다.

**SCOPE 참조**: [docs/LUMEN_DEMO_SCOPE-260427.md §4 작업 7](LUMEN_DEMO_SCOPE-260427.md).

**작성 순서 권장**: 1 → 2 → 5 → 3 → 4 → 6 → 7 → 8. 서사 먼저, 감정 후, 공간 마지막.

---

## 1. 메모리 수준 메타 (`memories` row)

- [ ] `title` — 관객이 카드/입구에서 보는 이름. 10자 내외.
- [ ] `lang` — `'ko'` | `'en'` 하나로 고정.
- [ ] `code` — 내부 식별자. 예: `E-LUM-001`.
- [ ] `completed_sentence` — "이건 ~한 기억이었다" 한 문장. Play entry 호버 혼잣말 pool로 쓰임.
- [ ] `memory_words` — 키워드 text[]. 3~6개. 잔상 매칭·검색 인덱스. 예: `['병실','소독약','엄마']`.
- [ ] `terrain_shape` — `'circular'` 고정 (Lumen 전제).

## 2. 감정 지문 (memories 수준)

- [ ] `sensory_anchor` — Phase A 감각 무대. JSON:
      ```
      { modality: 'smell' | 'sound' | 'touch',
        content: '<단어>',
        weight: 0.0~1.0 }
      ```
      첫 30초 틴트·앰비언스 톤 결정.
- [ ] `original_vector` — 작성자 감정 벡터 (**17-dim 고정**, 6-dim 섞지 말 것).
      키: `fear, sadness, anger, joy, longing, guilt, shame, numbness, disgust, surprise, pride, hope, envy, contempt, tenderness, loneliness, awe`.
      모든 메모리가 동일 키셋 유지.
- [ ] `original_reason_vector` — 귀인/대상. JSON:
      ```
      { attribution: { self, other, fate },   // 합 1.0
        core_fear: { abandonment, rejection, powerlessness, loss } }  // 합 1.0
      ```
      Strata AF 좌표 결정 (X = attribution, Z = core_fear).

## 3. 오염 초기값 (memories 수준)

- [ ] `cont_depth` — int. 기본 0 (신선). 2~3 주면 "이미 몇 번 해석된" 상태로 입장.
- [ ] `cont_divergence` — float 0~1. 0 기본. 높이면 파괴적 복제·편향 변이 흔적 시작부터.
- [ ] `cont_convergence` — float 0~1. 0 기본. 높이면 과잉 수선·고착 텍스처 시작부터.
- [ ] `cont_heterogeneity` — float 0~1. 0 기본. 높이면 alignment 분산 흔적.
- [ ] `cont_stage_1` / `cont_stage_2` / `cont_stage_3` — 각 0~1. 합 1.0 근사. 오염 텍스처 혼합 비율.
- [ ] `_cont_align_mean`, `_cont_align_m2` — Welford 내부. 초기 0, 0.

**레거시 회피 (채우지 말 것)**: `cont_drift`, `cont_fixation`, `cont_stage`, `sound_map`.

## 4. 장면들 (`scenes` rows, N개)

메모리당 3~5 장면. 각 장면:

### 4-1. 순서·내용
- [ ] `memory_id` — FK
- [ ] `scene_order` — 1부터. 순서.
- [ ] `text` — 관객이 읽는 서사 텍스트. 60~200자.
- [ ] `scene_type` — `'normal'` 기본. (branch/ending는 Record 생성 전용이라 수동에선 normal 유지 권장)

### 4-2. 감정 (엔진 비교 기준)
- [ ] `original_emotion` — JSON, 17-dim 감정 벡터. **이 값에 감정 강도 이미 반영**(vector_weight 곱 쓰지 말 것). 예: `{fear: 0.3, sadness: 0.6, longing: 0.5, ...}`.
- [ ] `original_reason_vector` — 이 장면의 귀인/대상. memories 수준과 다를 수 있음.
- [ ] `anchor_emotions` — text[]. 이 장면에 "걸리는" 감정 앵커. 내면 독백 트리거. 예: `['guilt','longing']`.

### 4-3. VOID (침묵 설계)
- [ ] `void_info` — JSON:
      ```
      { sceneVoid: bool,       // 이 장면 전체가 침묵 처리
        emotionVoid: bool,     // 감정만 모름
        reasonVoid: bool,      // 왜인지 모름
        voidLevel: 'low' | 'high' }
      ```
      장면 중 하나 이상을 VOID로 설계하면 작품의 "안개" 감각이 선다.

### 4-4. 오염 사전 생성 (top-level 컬럼, meta 아님)
- [ ] `text_stage_1` — 편향적 기울어짐 버전. 원본에 `·` 침식. 작가가 직접 쓰거나 contaminationPresenter 알고리즘 흉내.
- [ ] `text_stage_2` — 해석 병기 버전. 두 갈래 해석이 나란히.
- [ ] `text_stage_3` — 과잉 완결 버전. `░▒▓` 글리치 + 반복 확신.
      사전 생성하면 런타임 AI 호출 없이 바로 표출. 작가 통제.

### 4-5. `meta` jsonb (장면 수준)
- [ ] `meta.scene_code` — 장면 코드. 예: `'E-LUM-001-S02'`.
- [ ] `meta.sound_url` — 장면별 mp3 경로. 없으면 omit. **작업 3c 이후 positional audio로 들림.**
- [ ] `meta.sound_volume` — 0~1. 기본 1.0.
- [ ] `meta.sound_radius` — 숫자. 기본 15. 이 반경 안에 플레이어 오면 최대 볼륨.
- [ ] `meta.echo_words` — text[]. 장면 주변에 떠오를 공명 단어. 3~5개. 예: `['보고 있었다','모르는 얼굴']`.
- [ ] `meta.motif_tags` — text[]. Play entry 감정진입점 매칭 시그널 (**작업 13**). 예: `['엄마','병실','소독약']`.

**제외 필드 (Lumen에선 안 씀)**:
- `meta.author_bridges` (표출 기능 미구현)
- `vector_weight` (READ 없음, 감정 강도는 `original_emotion`에 직접)

## 5. 선택지 (`choices` rows, 장면당 M개)

- [ ] `scene_id` — FK
- [ ] `choice_order` — 1부터
- [ ] `text` — 관객이 보는 선택지 표현. 짧게.
- [ ] `emotion` — 이 선택이 담는 감정 (단일 라벨). 17감정 중 하나.
- [ ] `intensity` — 0~1. 감정 강도.

**중요**: `next_scene_id` 없음. Choice는 다음 장면 지정 안 함. 감정 결만 기록.

선택지 2~3개/장면 권장. 하나는 침묵/회피 옵션(VOID 유도) 포함하면 이본 설계 강화.

## 6. Record = First Play (`plays` rows, 장면당 1개)

작가 본인의 원본 감정을 plays 테이블에 박아야 이후 관객 alignment 기준이 생김.

장면당 1 row:
- [ ] `memory_id` — FK
- [ ] `scene_id` — FK
- [ ] `user_id` — NULL (익명) 또는 curator_id
- [ ] `user_emotion` — `scenes.original_emotion`과 동일하게
- [ ] `user_reason` — `scenes.original_reason_vector`와 동일하게
- [ ] `alignment` — `1.0` 고정
- [ ] `mismatch_type` — NULL
- [ ] `created_at` — now()

## 7. 공간 좌표 (작업 12 Admin UI로 나중 입력)

- [ ] `memories.ghost_condensation_points` — JSON array. 2~3개.
      ```
      [{ x: -25, z: 18, pollution_threshold: 0.3 },
       { x:   5, z: -22, pollution_threshold: 0.6 }]
      ```
      관객이 이 좌표 근처로 걷고 오염이 임계 넘으면 유령 활성화.
      원 반경 R=56 기준. 중심 void 근처엔 놓지 말 것.

**Sprint 2 작업 12에서 Admin UI 완성 후 드래그 편집**. SQL INSERT 시점엔 빈 배열로 두고 나중 업데이트.

## 8. 검증 체크 (SQL 실행 후)

- [ ] admin.html에서 메모리 로드 → 장면 수·감정 벡터 확인
- [ ] Strata 뷰에서 메모리 AF 좌표 위치 확인 (기대 위치와 매치하나)
- [ ] 체험 실행 → 첫 30초 안에 핵심 감정 느껴지나
- [ ] 오염 사전생성 텍스트 렌더 확인 (오염 단계 수동 바꿔서 text_stage_1/2/3 전부 나오는지)
- [ ] VOID 장면 정상 처리되나
- [ ] Play entry에서 키워드 입력 → 이 메모리가 매칭 후보에 뜨나 (작업 13 완료 후)

---

## 3개 메모리 감정 분산 점검표

이본 시연의 근거 = 3 메모리의 AF 좌표가 서로 충분히 떨어져야 함.

| 메모리 | attribution 주축 | core_fear 주축 | 주 감정 |
|---|---|---|---|
| 1 (ko) | ? | ? | ? |
| 2 (en) | ? | ? | ? |
| 3 (ko) | ? | ? | ? |

→ 세 행이 같은 사분면에 몰리지 않도록. 예: self+loss / other+rejection / fate+powerlessness.

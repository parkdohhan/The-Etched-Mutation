# Lumen 메모리 스토리 워크시트

이 문서는 **한 기억(memory) 하나 작성할 때 쓰는 빈칸**이다. 작성 순서대로 채우면 SQL 템플릿(`supabase/seeds/lumen_memory_template.sql`)으로 변환 가능한 값이 나온다.

**관련**:
- 레퍼런스 (각 필드 의미): [lumen_memory_authoring_checklist-260421.md](lumen_memory_authoring_checklist-260421.md)
- 실행 예시: 편지(E-004) 채움 — [supabase/seeds/lumen_mem_E-004_fills.sql](../supabase/seeds/lumen_mem_E-004_fills.sql)
- SCOPE: [LUMEN_DEMO_SCOPE-260423.md §4 작업 7](LUMEN_DEMO_SCOPE-260423.md)

**사용법**: 이 파일을 `docs/stories/<code>_<short_title>.md`로 복사 → 빈칸 채움 → 값을 SQL로 옮겨 실행.

**β 접근 기준** (2026-04-21 확정): `text_stage_1`, `text_stage_3`는 비움. `text_stage_2`(병기 해석)만 작성.

---

## 0. 메타 결정

```
code:  E-LUM-___        (예: E-LUM-001)
title: _______          (10자 내외. 관객이 카드에서 볼 이름)
lang:  ko / en          (하나 선택. 번역 안 함)
```

**고려할 것**:
- 다른 Lumen 메모리와 AF 좌표 겹치지 않게 설계 (8번 섹션 점검표 먼저 보기)

---

## 1. 서사 씨앗

### 1-1. 한 줄 요약 (기억이 무엇에 대한 것인지)
> ___________________________________________________

### 1-2. 핵심 질문 (관객이 이 기억을 나올 때 남아야 할 질문)
> ___________________________________________________
> 예: "그 목소리는 정말 엄마였는가?" (편지의 경우)

### 1-3. completed_sentence (관객이 호버 시 혼잣말로 뜨는 한 문장)
> ___________________________________________________
> 예: "당신입니까? 지금 내 배 안에 있는 게." (편지)

### 1-4. memory_words (3~6 키워드, 잔상 매칭·검색 인덱스)
```
[_____, _____, _____, _____]
```

### 1-5. 주 모티프 (씬 간 반복되며 연결될 이미지·단어·행위)
```
[_____, _____, _____]
```
**고려할 것**: 모티프는 최소 2~3 씬에서 다시 나와야 연결감 생김.

---

## 2. 감각 앵커 (sensory_anchor)

Phase A 감각 무대 — 기억의 **전신 감각**.

```
modality:  smell / sound / touch  (하나 선택)
content:   _______                 (한 단어)
weight:    0.0 ~ 1.0               (보통 0.7~0.9)
```

**고려할 것**:
- 기억 전체를 관통하는 단일 감각. 장면 하나에만 나오면 이걸로 쓰지 말 것.
- 편지의 경우: 발소리(sound, 0.85) — 여러 장면에서 반복되고 "당신"을 호출하는 신호.

---

## 3. 감정 좌표

### 3-1. AF 좌표 결정 (가장 먼저)

**Attribution (귀인)** — 합 1.0:
```
self:  ____ (자책)
other: ____ (타인 책임)
fate:  ____ (운명·구조)
```

**Core fear (핵심 공포)** — 합 1.0:
```
abandonment:   ____ (버림받음)
rejection:     ____ (거절당함)
powerlessness: ____ (무력감)
loss:          ____ (상실)
```

**고려할 것**:
- 이 비율이 Strata 지형에서 이 기억의 위치를 결정 (X축=attribution, Z축=core_fear)
- 다른 Lumen 메모리와 다른 사분면에 놓이도록
- 편지: self 0.25 · other 0.55 · fate 0.20 / abandonment 0.45 · loss 0.35

### 3-2. 17-dim 감정 지문 (0.0 ~ 1.0)

```
fear:        ____
sadness:     ____
anger:       ____
joy:         ____
longing:     ____
guilt:       ____
shame:       ____
numbness:    ____
disgust:     ____
surprise:    ____
pride:       ____
hope:        ____
envy:        ____
contempt:    ____
tenderness:  ____
loneliness:  ____
awe:         ____
```

**고려할 것**:
- 이건 기억의 전반적 감정 팔레트. 장면별 감정은 6-6에서 따로 결정.
- 주 감정 3~5개만 0.4 이상으로. 나머지는 0.0~0.2.
- 17개 전부 0.5 이상이면 밋밋한 기억이 됨.

---

## 4. 오염 초기 상태

```
cont_depth:         ____    (0 = 신선 / 5~10 = 이미 해석 누적된 입장)
cont_divergence:    0.0     (기본 0)
cont_convergence:   0.0     (기본 0)
cont_heterogeneity: 0.0     (기본 0)
cont_stage_1:       0.33
cont_stage_2:       0.33
cont_stage_3:       0.34
```

**고려할 것**:
- cont_depth를 0이 아닌 값으로 올리면 관객 첫 방문부터 텍스트가 오염 버전(`text_stage_2`)으로 표출됨
- 편지는 8로 설정 (102회 플레이 반영 + 극적 효과)
- stage 혼합은 기본값으로. 특정 모드 강조 원하면 편향 (예: stage_2만 0.6, 나머지 0.2·0.2 — 병기 경향 기억)

---

## 5. 장면 목록 계획

**장면 수**: ___개 (권장 7~10, Lumen 공간에 핀이 풍부하도록)

각 장면의 **한 줄 요약** 먼저:

```
S0:  ________________________________
S1:  ________________________________
S2:  ________________________________
S3:  ________________________________
S4:  ________________________________
S5:  ________________________________
S6:  ________________________________
S7:  ________________________________
S8:  ________________________________
S9:  ________________________________
S10: ________________________________
```

**고려할 것**:
- 장면 순서는 **회상 순서**이지 시간 순서가 아닐 수 있음. 관객은 공간에서 비선형으로 조우.
- 최소 3 이상 (별이엔진 shape 점수 활성화 조건)
- 엔딩 장면 하나 `scene_type='ending'` 지정

---

## 6. 장면별 상세 (각 장면마다 이 블록 하나씩 복제)

### Scene N

#### 6-1. 원본 텍스트 (scenes.text)
> _______________________________________________________
> _______________________________________________________

**고려할 것**:
- 60~200자. 긴 문단보다 파편이 낫다.
- 시제는 현재형 권장 ("엄마가 나를 봤다" < "엄마가 나를 본다")
- 감각 디테일 1~2개 박아넣기 (소리, 빛, 촉감, 냄새, 공간 배치)

#### 6-2. 장면 감정 벡터 (scenes.original_emotion)

17-dim 중 이 장면에 해당하는 것만 0이 아닌 값. 나머지는 0:
```
fear: ___, sadness: ___, longing: ___, guilt: ___,
(그 외 해당되는 것만)
```

#### 6-3. 장면 AF 좌표 (scenes.original_reason_vector)

**기억 전체 AF와 같을 수도, 다를 수도.** 장면마다 미묘하게 이동 가능.
```
attribution: {self: ___, other: ___, fate: ___}
core_fear:   {abandonment: ___, rejection: ___, powerlessness: ___, loss: ___}
```

#### 6-4. anchor_emotions (이 장면에 "걸리는" 감정 앵커)
```
[_____, _____]
```
**고려할 것**: 내면 독백 트리거. 17감정 이름 그대로 사용 ("longing", "fear" 등) 또는 "isolation" 같은 관계 표현도 가능.

#### 6-5. VOID 설계

```
sceneVoid:   true/false   (이 장면 전체가 침묵/결손)
emotionVoid: true/false   (감정만 닫혀 있음)
reasonVoid:  true/false   (왜인지 말하지 않음)
voidLevel:   'low' / 'high'
```

**고려할 것**:
- VOID 없는 장면은 네 값 모두 false · voidLevel='low'
- 침묵과 결손도 의미 있는 연출. 11씬 중 2~4 장면을 VOID로 두면 기억의 "안개" 감각 생김

#### 6-6. meta 필드

```
scene_code:   '<code>-S<N>'     (예: E-LUM-001-S03)
echo_words:   [_____, _____]    (장면 주변에 떠오를 핵심 단어·구)
motif_tags:   [_____, _____]    (반복 모티프 — 다른 장면과 공유)
sound_url:    _____              (mp3 경로. 없으면 비움)
sound_volume: 0.0 ~ 1.0
sound_radius: 15 (기본)          (이 반경 안에 들어오면 최대 볼륨)
```

**고려할 것**:
- `echo_words`는 장면 핵심 문구 2~3개. 관객이 공간을 걸을 때 이 단어가 주변에 떠오름
- `motif_tags`는 장면 간 연결 키. 같은 태그 달린 장면끼리 감각적 연속성
- `sound_url`은 작업 3c 이후 positional audio로 들림. 이전까지는 데이터만

#### 6-7. text_stage_2 (병기 해석 버전) — β 선택에 따른 필수

원본 텍스트를 **두 해석이 공존하는** 버전으로 재작성.

> _______________________________________________________
> _______________________________________________________

**작성 원칙**:
- "아니" / "혹은" / "아니면"으로 대체 해석 붙임
- 자기교정 문장 추가 ("들었다. 들었다고 믿었다.")
- 과거형·현재형 섞임
- 원본 길이 ±30% 이내

**예시 (편지 S0)**:
- 원본: "철문에 귀를 댄다. 발을 끄는 소리, 하품 소리. 당신은 노크조차 하지 못한다."
- stage_2: "철문에 귀를 댄다. 발소리와 하품 소리. 아니면 내가 듣고 싶었던 소리였는지도 모른다. 당신은 노크하지 못했다. 혹은 노크할 필요가 없었다."

#### 6-8. 선택지 (choices, 장면당 2~3개)

```
choice 1:
  text:      _______________________
  emotion:   _______ (17감정 중 하나)
  intensity: 0.0 ~ 1.0

choice 2:
  text:      _______________________
  emotion:   _______
  intensity: 0.0 ~ 1.0

choice 3 (선택, 침묵/회피 옵션):
  text:      "..."
  emotion:   numbness / avoidance
  intensity: 0.3
```

**고려할 것**:
- choice는 다음 장면을 결정하지 않음. 감정 결만 기록.
- 2~3개 권장. 하나는 침묵("...") 옵션 넣으면 VOID 유도 가능.

---

## 7. 공간 좌표 (나중 작성 — 작업 12 Admin UI)

```
ghost_condensation_points: [
  { x: ___, z: ___, pollution_threshold: 0.0~1.0 },
  { x: ___, z: ___, pollution_threshold: ___ },
  { x: ___, z: ___, pollution_threshold: ___ }
]
```

**고려할 것**:
- 원 반경 R=56 기준. 중심(0,0)은 void — 응결점 두지 말 것.
- 2~3 점 권장. 너무 많으면 유령 조우 과밀.
- threshold 낮으면(0.2~0.4) 처음부터 유령 활성화. 높으면(0.6~0.8) 기억이 오염된 후에만 등장.
- **이 섹션은 SQL INSERT 시 빈 배열 `[]`로 두고, Admin UI 완성 후 (Sprint 2 작업 12) 드래그로 편집.**

---

## 8. 3 메모리 AF 좌표 분산 점검

**이본 시연의 근거** — 3개 메모리가 AF 평면 다른 사분면에 자리잡아야.

```
Attribution 축 (X): self_blame(-1) ← other_blame(0) → fate_blame(+1)
Core fear 축 (Z):   abandonment(-1) ← rejection ← powerlessness → loss(+1)
```

이 메모리 위치 표시:
```
Memory <code>: attribution=__ / core_fear=__
```

다른 두 메모리 위치와 비교:
```
Memory 1:  attribution=__ / core_fear=__
Memory 2:  attribution=__ / core_fear=__
Memory 3:  attribution=__ / core_fear=__
```

**최소 기준**:
- 세 메모리가 AF 평면 위 **서로 다른 사분면**에 하나씩
- 거리 유사하면 이본 시연 효과 약함
- 예 (편지 E-004): attribution=other 우세(0.55), core_fear=abandonment(0.45) — 좌하 사분면

---

## 9. 안전 체크 (SQL 실행 전)

- [ ] BLOCK_HIGH 트리거어 없음 (자살·살인·강간·성착취 직접 표현 없음)
- [ ] BLOCK_MID 트리거어 회피 (죽여버리·학교 폭력 등)
- [ ] PII 없음 (실명·주소·전화·주민번호·이메일)
- [ ] 17-dim 벡터 키 전부 있음 (빠진 키 있으면 0 명시)
- [ ] `original_vector` 합 범위 0~17 근방 (모든 키 합산)
- [ ] 감정·AF 반복 체크: 같은 값이 기계적으로 반복되지 않음

---

## 10. 변환 (워크시트 → SQL)

워크시트 완료 후:
1. `supabase/seeds/lumen_memory_template.sql` 복사 → `lumen_mem_<code>.sql`
2. 모든 `<<PLACEHOLDER>>` 실제 값으로 치환
3. Supabase SQL editor 또는 Claude에게 실행 요청

---

## 부록: 편지(E-004) 예시 값 매핑

| 워크시트 항목 | 편지 값 |
|---|---|
| 1-3. completed_sentence | "당신입니까? 지금 내 배 안에 있는 게." |
| 2. sensory_anchor | sound · 발소리 · 0.85 |
| 3-1. Attribution | self 0.25 / other 0.55 / fate 0.20 |
| 3-1. Core fear | abandonment 0.45 / loss 0.35 |
| 3-2. 17-dim 주 감정 | longing 0.70, loneliness 0.60, fear 0.55 |
| 4. cont_depth | 8 |
| 5. 장면 수 | 11 |
| 7. ghost_condensation_points | 아직 비움 (작업 12 대기) |
| 8. AF 사분면 | 좌하 (other + abandonment/loss) |

참고 자료: [편지 fills SQL](../supabase/seeds/lumen_mem_E-004_fills.sql)

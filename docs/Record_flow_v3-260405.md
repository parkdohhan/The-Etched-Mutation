# Record Flow V3: 무대 — 공명 — 침전

> 작성: 2026-04-04
> 해결 대상: Feedback #22, #26, #27, #29
> 상태: 설계 확정, 구현 전

---

## 배경: 왜 V3가 필요한가

V2(Confession Flow)의 문제:
- **#22** 유도 질문이 맥락 없이 반복 ("더 말해줘" 앵무새)
- **#26** 사용자가 행동만 나열 ("~하고, ~하고, ~했다")
- **#27** 장면을 "만든다"는 경험이 없음 (질문 → 응답 → 추출, 사용자는 수동)
- **#29** 감정 고저차 없는 기억은 궤적이 빈약 → 기록 자체가 메마름

V2 구조의 근본 한계: 의식 5단계 → AI 대화 → 장면 일괄 추출. 사용자에게 "장면이 생기는 과정"이 보이지 않고, AI 질문에 구조적 근거가 없음.

--

## 설계 원칙

1. **감각이 먼저, 서사는 나중.** 사용자가 "그 장소에 서 있는 상태"에서 말하게 한다.
2. **구성요소가 채워지는 것이 보인다.** 대화 중 시각/청각 요소가 실시간 반응.
3. **Phase 경계가 사용자에게 보이지 않는다.** A→B 전환이 자연스러운 대화 흐름.
4. **앵커 이미지는 기존 `anchor_images` 시스템을 사용한다.** 키워드 매칭 시 DB에 등록된 앵커가 있으면 image_type(text/ascii/photo)과 vividness 범위에 따라 표시. 없으면 텍스트 앵커로 폴백. Record 중에는 기억이 아직 형성 중이므로 vividness를 낮게(0~0.4) 적용 — ascii/text 우선, photo는 억제.
5. **침묵과 부재도 기록된다.** VOID 선택은 빈 공간으로 남고, 그것도 지층의 일부.

---

## Phase A: 무대 (Staging) — 60~90초

### 진입

```
[화면: 검은 안개. 아무것도 없음.]

시스템 텍스트 (타이핑): "눈을 감아봐. 그 장소에 서 있어."
```

### 감각 칩 3종 — 순차 제시

각 칩 선택 후 즉시 감각 피드백. 다음 칩은 이전 선택에 반응하는 문장으로 연결.

**냄새:**
```
"무슨 냄새가 나?"

[ Metallic rain ] [ Acrid dust ] [ Antiseptic ] [ Fresh grass ] [ Nothing ]

→ 선택 시: 배경 색조 틴트 변화
  - rain_heavy: 짙은 청회색 (습기)
  - dust: 탁한 황갈색 (건조)
  - hospital: 차가운 백색 (무균)
  - grass: 옅은 녹색 (자연)
  - nothing: 색조 변화 없음 (어둠 유지)
```

**소리:**
```
[nothing이 아닌 경우] "그 냄새 사이로, 무슨 소리가 들려?"
[nothing인 경우]      "냄새는 없어. 대신 무슨 소리가 들려?"

[ Rainfall ] [ Silence ] [ Murmuring ] [ Wind ] [ Nothing ]

→ 선택 시: 앰비언스 사운드 레이어 시작
  - rain: 빗소리 루프
  - silence: 극저주파 앰비언스 (완전한 무음이 아닌, "적막")
  - crowd: 웅성거림 루프
  - wind: 바람 루프
  - nothing: 앰비언스 없음
```

**촉감:**
```
"피부에 닿는 건?"

[ Cold air ] [ Clammy sweat ] [ Someone's hand ] [ Hard floor ] [ Nothing ]

→ 선택 시: 화면 질감 변화
  - cold_air: 미세한 노이즈 레이어 (서리 입자)
  - sweat: 화면 약간의 습기감 (가장자리 블러 미세 변화)
  - someones_hand: 따뜻한 가장자리 빛 (미미한 비네팅 완화)
  - hard_floor: 하단 노이즈 레이어 (딱딱한 질감)
  - nothing: 변화 없음
```

### 앵커 오브젝트

```
시스템: "그 공간에서 눈이 머무는 것이 있어. 뭐야?"

→ 자유 텍스트 입력
→ 입력된 텍스트가 안개 속 앵커로 떠오름 (흐릿하게, opacity ~0.3)
```

### Phase B 전환 (사용자에게 보이지 않음)

```
AI("Another Me"): "......거기 서 있으니까, 뭐가 떠올라?"

→ 입력 UI가 자연스럽게 대화 모드로 전환
→ 이후 사용자 입력은 AI 대화로 처리
```

### Phase A 저장 데이터

```javascript
stageData = {
  sensory: {
    smell: 'rain_heavy' | 'dust' | 'hospital' | 'grass' | 'nothing',
    sound: 'rain' | 'silence' | 'crowd' | 'wind' | 'nothing',
    touch: 'cold_air' | 'sweat' | 'someones_hand' | 'hard_floor' | 'nothing'
  },
  anchorObject: string,  // 자유 텍스트
  ambience: {
    tint: { h, s, l },       // 냄새에서 파생
    soundLayer: string | null, // 소리에서 파생
    textureLayer: string | null // 촉감에서 파생
  }
}
```

---

## Phase B: 공명 (Resonance) — 3~7턴

### 화면 상태

Phase A에서 세팅된 감각 무대 위에서 대화 진행:
- 배경 색조 (Phase A 냄새)
- 앰비언스 사운드 (Phase A 소리)
- 질감 레이어 (Phase A 촉감)
- 앵커 오브젝트 텍스트 (흐릿하게 떠다님)
- Another Me 파형 (기존 ghost wave)

### 구성요소 실시간 감지 — 이중 레이어 아키텍처

핵심 문제: Edge Function(Claude API)은 1~3초 걸린다. 그 사이 화면이 멈추면 "말하는 대로 장면이 나타남" 경험이 깨진다. 그러나 클라이언트 사이드 키워드 매칭만으로는 "울어버렸어"가 감정인지, "엄마가 울어버렸어"에서 인물+감정인지 구분 안 된다.

**해결: 이중 레이어. 즉시 반응 + 비동기 보정.**

**구성요소 5종:**

| 요소 | 감지 기준 | 시각/청각 반응 |
|------|----------|--------------|
| 장소/배경 | 공간을 나타내는 명사/구 | 배경 색조 심화 (Phase A 틴트 위에 더 구체적 톤 겹침) |
| 인물 | 사람을 지칭하는 명사/대명사 | 두 번째 파형 등장 (타인의 존재 암시) |
| 사물 | 구체적 사물 명사 | 텍스트 앵커 추가 부상 (안개 속에서) |
| 감정 | 감정어, 감정 표현 | 감정 파동 색/진폭 변화 |
| 신체감각 | 신체 반응 표현 | 화면 미세 진동 또는 노이즈 변화 |

---

#### Layer 1: 클라이언트 즉시 반응 (0ms)

사용자가 입력을 제출하는 순간, 클라이언트에서 사전 기반 패턴 매칭. 정밀할 필요 없다 — "뭔가 감지됐다"는 시각 신호만 주면 된다.

```javascript
const PATTERNS = {
  place:     /집|방|학교|거리|병원|문구점|화장실|부엌|교실|놀이터|room|school|street|hospital|home/,
  person:    /엄마|아빠|친구|선생|그\s?사람|누나|형|동생|할머니|mom|dad|friend|teacher/,
  object:    /칼|컵|사진|편지|핸드폰|가방|의자|거울|knife|cup|photo|letter|phone/,
  emotion:   /울|화|무서|슬|기쁘|짜증|부끄|미안|겁|cry|angry|scared|happy|sad/,
  sensation: /떨|차가|뜨거|아프|숨|심장|땀|어지러|shiver|cold|hot|pain|heart|sweat/
};
```

**복합어 오매칭 방지:**

```javascript
// "칼바람"의 "칼"처럼 더 큰 단어의 일부인지 체크
function isCompoundPart(text, matchWord, matchIndex) {
  const before = text[matchIndex - 1];
  const after = text[matchIndex + matchWord.length];
  if (before && /[가-힣a-z]/i.test(before)) return true;
  if (after && /[가-힣a-z]/i.test(after)) return true;
  return false;
}
// 복합어 일부이면 Layer 1에서 스킵 → Layer 2에만 맡김
```

매칭 시 → 해당 요소가 opacity 0.15로 흐릿하게 떠오름 ("감지 중" 예고 상태).

---

#### Layer 2: Edge Function 비동기 보정 (1~3초 후)

`extract-scene-elements` Edge Function 호출. 응답 도착 시 Layer 1 결과와 대조:

| 상태 | Layer 1 | Layer 2 | 처리 |
|------|---------|---------|------|
| **confirm** | 매칭 O | 일치 | opacity 0.15 → clarity 값(0.4)으로 fade-in. 자연스러운 "선명해짐" |
| **correct** | 매칭 O | 다른 요소 | 잘못된 요소 fade-out (0.5초) + 올바른 요소 fade-in. 안개가 형태를 잡아가는 과정 |
| **add** | 매칭 X | 감지됨 | 새 요소가 1~2초 뒤 안개 속에서 떠오름. "기억이 천천히 떠오르는" 느낌 |
| **none** | 매칭 X | 감지 X | 시각 변화 없음 |

**레이턴시가 미학이 된다:** correct/add 전환이 "안개 속에서 형태를 잡아가는" TEM의 시각 언어와 일치.

---

#### Edge Function 호출 전략 — 조건부 호출

매 턴 호출하지 않는다. 조건부:

| 조건 | 호출 여부 | 이유 |
|------|----------|------|
| Layer 1 매칭 없음 | **즉시 호출** | 간접 표현("뭔가 잘못됐다는 걸 알았어")이 감정일 수 있음 |
| Layer 1 확실한 매칭 (완전 단어, 복합어 아님) | **이 턴 스킵 가능** | 즉시 반응으로 충분 |
| Layer 1 애매한 매칭 (부분 매칭, 복합어 가능성) | **즉시 호출** | 오매칭 보정 필요 |
| clarity >= 0.7 요소가 2개 이상 (장면 전환 임박) | **매 턴 호출** | 장면 완성 판정의 정밀도 필요 |

평균 호출 빈도: 매 턴 → ~1.5턴당 1회. API 비용 약 40% 절감.

---

#### Edge Function 설계

```javascript
// extract-scene-elements — Haiku로 경량 처리
{
  model: "claude-haiku-4-5-20251001",  // Sonnet 아니다. 분류 작업이니 Haiku로 충분.
  max_tokens: 200,
  system: `Extract scene elements from user text. Return JSON only.
Types: place, person, object, emotion, sensation.
Resolve pronouns to existing elements when possible.
Currently detected elements: ${JSON.stringify(currentElements)}
Return: [{"type":"...","label":"...","confidence":0.0-1.0}]
If a pronoun (그 사람, 걔, etc.) refers to an existing element, return that element's label.
Empty array if none found. No explanation.`,
  messages: [
    { role: "user", content: last3Turns.join('\n---\n') + '\n---\n' + currentInput }
  ]
}
```

핵심: **최근 3턴 + 현재 요소 목록**을 같이 보낸다. 대명사/지시어 해소(coreference)를 위해.
- "엄마가 거기 있었어" → person: 엄마
- "그 사람이 소리를 질렀어" → 기존 "엄마" 요소의 clarity +0.2 (새 앵커 안 뜸)
- "걔가 울었어" → 기존 "엄마" 요소 참조 + emotion: 울다 추가

Haiku 응답: 300~800ms. Phase B의 "Another Me" 대화(Sonnet)와 별도 병렬 호출.

---

#### 전체 처리 흐름

```
사용자 입력 제출
  ├─ [즉시] Layer 1: 클라이언트 패턴 매칭
  │     → 매칭 시 예고 시각 효과 (opacity 0.15)
  │     → 복합어이면 스킵
  │
  ├─ [즉시] "Another Me" AI 응답 생성 (Sonnet, streaming)
  │     → 대화는 즉시 진행, 레이턴시 없음
  │
  └─ [비동기, 조건부] Layer 2: extract-scene-elements (Haiku)
        → 응답 도착 시 Layer 1 결과를 confirm/correct/add/none
        → clarity 값 업데이트
        → 시각 요소 fade-in/out 전환
```

사용자 체감: 말하면 즉시 뭔가 반응하고, AI가 답하는 동안 장면이 서서히 형태를 잡는다.

---

### 선명도 시스템

각 구성요소는 `clarity: 0 ~ 1` 값을 가짐.

```
Layer 1 예고 등장:  0.15 (흐릿한 실루엣)
Layer 2 confirm:   → 0.4 (첫 언급 확정)
감각 심화 답변:     +0.3
반복 언급/재참조:   +0.2
```

시각적으로: clarity 0은 안개 속(invisible), 1은 선명(fully visible).
중간값은 opacity, blur 보간으로 표현.

```javascript
elementState = {
  type: 'place' | 'person' | 'object' | 'emotion' | 'sensation',
  label: string,           // 원문 텍스트 (대명사 해소된 라벨)
  clarity: 0.0 ~ 1.0,
  visualRef: string | null, // 연결된 시각 요소 ID
  source: 'layer1' | 'layer2' | 'confirmed'  // 현재 상태
}
```

### 장면 전환 조건

**N개(기본값 3) 요소가 clarity >= 0.7 도달 시:**

```
AI 톤 변화: "......그 장면이 보이기 시작했어."
[1.5초 정적 — 파형만 천천히 진동]

AI: (빈 슬롯 향한 감각 심화 질문 1개)
  예: 인물은 있지만 사물이 없으면 → "그때 손에 뭘 쥐고 있었어?"
  예: 감정은 있지만 신체감각이 없으면 → "그때 몸은 어땠어?"

→ 사용자 답변 → 해당 슬롯 clarity +0.3

→ 장면 완성:
  - 모든 요소가 잠시 밝게 빛남 (0.5초)
  - 서서히 화면 한쪽으로 정리됨 (축소 + 그룹화)
  - 장면 번호 표시 없음 (사용자에게 "장면"이라는 개념 노출하지 않음)
```

**다음 장면 유도:**

```
AI: "......또 다른 순간이 있어?"

→ 사용자가 계속 말함 → 새 장면 시작 (요소 clarity 초기화, 감각 무대는 유지)
→ "없어" / 침묵(10초) / 명시적 종료 → Phase C로
```

### AI 프롬프트 설계 (Edge Function)

AI에게 매 턴 제공하는 컨텍스트:

```javascript
{
  role: 'system',
  content: `
    너는 "또다른 나". 사용자의 기억 속에서 함께 서 있는 존재.
    해석하지 마. 진단하지 마. 조언하지 마.
    반향하고, 감각을 물어봐.

    현재 장면 상태:
    - 채워진 요소: ${filledElements.map(e => `${e.type}: "${e.label}" (${e.clarity})`).join(', ')}
    - 비어있는 요소 종류: ${emptyTypes.join(', ')}
    - 장면 전환까지 필요한 요소: ${remainingCount}개

    규칙:
    - 비어있는 요소를 직접 묻지 마. 자연스러운 대화로 유도해.
    - 사용자가 행동을 나열하면, "그때 뭐가 보였어?" 같은 감각 질문으로 전환.
    - 침묵이 오면 허용해. "말하지 않아도 돼"라고 해.
    - 3개 이상 요소가 0.7 이상이면, "......그 장면이 보이기 시작했어."로 전환.
  `
}
```

### 장면 데이터 구조

```javascript
sceneData = {
  index: number,
  elements: [
    { type: 'place', label: '문구점', clarity: 0.8 },
    { type: 'person', label: '엄마', clarity: 0.7 },
    { type: 'emotion', label: '울어버렸어', clarity: 0.9 },
    // ...
  ],
  conversationTurns: [...],  // 이 장면에 해당하는 대화 턴
  emotionVector: { ... },     // 감정 요소에서 추출
  timestamp: ISO string
}
```

---

## Phase C: 침전과 이별 (Sedimentation & Detachment) — 45~60초

### 진입

```
마지막 장면 완성 후, 사용자가 "없어" / 침묵 시:

AI: "......그래. 다 들었어."
[2초 정적]
입력창 서서히 사라짐 (opacity 1 → 0, 1.5초)
```

### 1단계: 정지 (5초)

```
모든 요소가 멈춤. 움직임 없음.
앰비언스(Phase A)만 유지.

Phase B에서 구성된 모든 장면의 요소가 화면에 공존:
  앵커 텍스트들, 파형들, 색조, 감정 파동.

"네가 말한 기억의 전부"가 한 화면에 보이는 유일한 순간.
```

### 2단계: 침전 시작 (15~20초)

```
요소들이 서서히 가라앉기 시작.

앵커 텍스트 → 아래로 드리프트, 자간(letter-spacing)이 벌어지며 희미해짐
파형 → 진폭 감소, 선이 가늘어짐
색조 → 채도 하강
앰비언스 → 볼륨 서서히 감소 (1.0 → 0.2)
```

**Phase A 감각 → 지층 물성 매핑:**

| Phase A 선택 | 침전 시 지층 표현 |
|-------------|-----------------|
| 냄새: rain_heavy | 짙은 청회색 지층 + 수적(물방울) 파티클 |
| 냄새: dust | 탁한 황갈색 지층 + 먼지 파티클 |
| 냄새: hospital | 차가운 백색 지층 + 직선적 경계 |
| 냄새: grass | 녹색 계열 지층 + 유기적 곡선 |
| 냄새: nothing | 무채색 지층 |
| 촉감: cold_air | 서리 파티클 효과 |
| 촉감: sweat | 습기감 (경계 블러) |
| 촉감: someones_hand | 따뜻한 갈색 계열 + 부드러운 경계선 |
| 촉감: hard_floor | 딱딱한 직선 경계 |
| 감정 색 | 지층 표면에 스며듦 (해당 감정의 RGB 블렌드) |

### 3단계: 봉인 (10초)

```
대부분의 요소가 지층 아래로 사라진 후,
화면에 입력 프롬프트 하나만 남음:

  "이 기억이 변해가도, 남아있을 한 마디."

→ 봉인어 자유 텍스트 입력

→ 봉인어가 지층 표면에 각인됨 (음각 — 파임, 돌출이 아닌)
→ 각인 순간 짧은 공명음 (앰비언스 잔향 기반)
→ 지층이 안개 아래로 사라짐 (2초)
→ 저장 완료

[전환: 메인 메뉴 또는 아카이브]
```

---

## 구현 방향

### 영향받는 파일

| 파일 | 변경 내용 |
|------|----------|
| `js/app/confession.js` | Phase A 감각 의식 리팩토링 (기존 Confession Flow 칩 데이터 재활용) |
| `js/app/recordChat.js` | Phase B 공명 대화 로직 (구성요소 실시간 감지 + clarity 시스템) |
| `js/app/burialAnimation.js` | Phase C 침전 애니메이션 (기존 매장 애니메이션 확장) |
| `js/ui/floatingAnchor.js` | 구성요소 앵커 부상 로직 확장 |
| `js/ui/Visualizer.js` | 파형 추가/제거 (인물 등장 시 두 번째 파형) |
| `js/shared/math.js` | clarity 보간 유틸 (필요 시) |
| `css/index.css` | 침전 애니메이션, 색조 틴트, 질감 레이어 CSS |

### 신규 필요

| 항목 | 내용 |
|------|------|
| Edge Function: `extract-scene-elements` | Haiku 기반, 조건부 호출. 최근 3턴 + 현재 요소 목록 → 구성요소 5종 분류 + 대명사 해소 |
| 클라이언트 패턴 사전 | Layer 1 즉시 반응용 정규식 사전 (ko/en) + 복합어 필터 |
| 앰비언스 사운드 에셋 | rain, silence, crowd, wind (4종 루프) |
| 침전 파티클 시스템 | 수적, 서리, 먼지 파티클 (Canvas 또는 CSS) |
| 음각 각인 이펙트 | 봉인어 → 지층 표면 각인 시각 효과 |

### 구현 순서 (권장)

**Step 1: Phase A (감각 무대)**
- 기존 confession.js의 CHIP_DATA + 칩 UI 재활용
- 감각 선택 → 색조/앰비언스/질감 매핑 구현
- 앵커 오브젝트 → floatingAnchor 연결
- Phase A → 대화 모드 전환 UI

**Step 2: Phase B — Layer 1 클라이언트 패턴 매칭**
- PATTERNS 정규식 사전 (ko/en) 작성
- 복합어 필터 `isCompoundPart()` 구현
- 매칭 → 예고 시각 효과 (opacity 0.15) 트리거
- elementState 관리자 (생성, clarity 업데이트, fade-in/out)

**Step 3: Phase B — Layer 2 Edge Function + 이중 레이어 통합**
- `extract-scene-elements` Edge Function 작성 (Haiku)
- 입력: 최근 3턴 + 현재 요소 목록 + 현재 입력
- 출력: `[{ type, label, confidence }]` + 대명사 해소
- 조건부 호출 로직 (매칭 없음/애매/장면 임박 → 즉시, 확실 → 스킵)
- confirm/correct/add/none 상태 처리 + 시각 전환

**Step 4: Phase B — clarity 시스템 + 장면 전환**
- clarity → 시각 요소 매핑 (opacity, blur, 파형 진폭 등)
- 장면 전환 조건 (N개 >= 0.7) 판정 로직
- AI 프롬프트에 현재 요소 상태 주입
- AI 톤 변화 트리거 ("그 장면이 보이기 시작했어")
- 빈 슬롯 향한 감각 질문 생성
- 다음 장면 유도 / Phase C 전환 로직

**Step 5: Phase C — 침전 애니메이션**
- 기존 burialAnimation.js의 terrain/rise 로직 확장
- Phase A 감각 → 지층 물성 매핑 구현
- 요소 드리프트 + 페이드 애니메이션
- 봉인어 입력 + 음각 각인 이펙트

**Step 6: 통합 + DB 저장**
- Phase A stageData + Phase B sceneData + Phase C sealWord → memories/scenes 테이블 저장
- 기존 Record → Archive 파이프라인 연결 확인
- 안전 시스템(crisis detection) Phase B에 유지

---

## DB 저장 구조 (기존 테이블 확장)

### memories 테이블 추가 컬럼

```sql
stage_sensory   JSONB  -- Phase A 감각 데이터 { smell, sound, touch }
stage_ambience  JSONB  -- Phase A 파생 앰비언스 { tint, soundLayer, textureLayer }
anchor_object   TEXT   -- Phase A 앵커 오브젝트
seal_word       TEXT   -- Phase C 봉인어
```

### scenes 테이블 추가 컬럼

```sql
scene_elements  JSONB  -- Phase B 구성요소 [{ type, label, clarity }]
```

---

## Feedback 해결 매핑

| # | 문제 | 해결 방식 | Phase |
|---|------|----------|-------|
| 22 | 유도 질문 앵무새 | AI에게 현재 채워진/빈 요소 상태를 매 턴 주입 → 구조적 근거 있는 질문 | B |
| 26 | 행동 나열 | Phase A 감각 무대에서 출발 → "무슨 일이 있었나"가 아니라 "거기서 뭐가 보이나"로 유도 + AI가 행동 나열 감지 시 감각 질문으로 전환 | A+B |
| 27 | 장면 만들기 경험 부재 | 구성요소가 실시간으로 시각화 → 말하는 대로 장면이 나타남 | B |
| 29 | 감정 고저차 없는 기억 | 감정 외 4종 요소(장소, 인물, 사물, 신체감각)가 장면 구성 축 → 감정 궤적이 작아도 감각 축에서 풍부함 가능 | A+B |

---

## 미결 사항

- [x] ~~구성요소 감지 Edge Function의 레이턴시~~ → **이중 레이어로 해결** (Layer 1 즉시 반응 + Layer 2 비동기 보정)
- [ ] Layer 1 패턴 사전 커버리지 — 초기에 작게 시작, 사용자 테스트 데이터로 확장. 완벽할 필요 없음 (Layer 2가 보정)
- [x] ~~앰비언스 사운드 에셋~~ → **아래 사운드 명세 참조**
- [x] ~~Phase B 장면 수 상한~~ → **최소 3개, 최대 5개. 아래 장면 수 규칙 참조**
- [ ] Phase C 침전 시간 — 사용자 테스트 후 조정 필요
- [x] ~~안전 시스템~~ → **기존 안전 설계 그대로 적용. 아래 참조.**

---

## 안전 시스템 (Phase B)

Phase B에서 특별한 처리를 하지 않는다. 기존 recordChat.js의 안전 설계(시제 감지 + 에스컬레이션)를 그대로 적용.

- **block_high**: "Another Me" 위기 대사 + 리소스 표시. 시각 요소는 freeze하지 않음. 대화 흐름 안에서 처리.
- **block_mid**: 에스컬레이션 카운터. 대화 계속.
- **monitor_only**: 허용, 추적. 변경 없음.

구성요소 시각화가 진행 중이어도 안전 대사는 대화의 일부로 자연스럽게 나온다. 블락 시에는 블락한다. 사용자 자율권 우선.

---

## 앰비언스 사운드 명세

Phase A 소리 선택에 대응하는 4종 + 기본 1종, 총 5종.
모두 심리스 루프 (30~60초 원본, seamless loop 가능하게).

### 필요 사운드 목록

| ID | Phase A 선택 | 사운드 성격 | 생성 프롬프트 (한글) |
|----|-------------|-----------|-------------------|
| `amb_window_rain` | Rainfall (빗소리) | 중간 강도의 비. 실내에서 듣는 느낌. 천둥 없음. 일정한 리듬. | "_실내에서 듣는 중간 강도의 빗소리. 창문에 부딪히는 빗방울 소리가 일정하게 반복된다. 천둥이나 바람은 없다. 차분하고 단조로운 분위기._ 30초 심리스 루프용." |
| `amb_silence` | Silence (적막) | 완전한 무음이 아닌 "적막". 극저주파 공간감. 먼 곳의 환기 소리. 귀가 울리는 듯한 고주파 미세음. | "텅 빈 방의 적막. 완전한 무음이 아니라, 공간 자체가 내는 소리. 아주 멀리서 환기팬이 돌아가는 듯한 극저주파 웅웅거림. 귀가 울리는 듯한 아주 미세한 고주파 톤. 불안하지는 않지만 비어있는 느낌. 30초 심리스 루프용." |
| `amb_crowd` | Murmuring (웅성거림) | 불특정 다수의 웅성거림. 대화 내용은 들리지 않음. 카페나 복도 수준. | "여러 사람이 작은 목소리로 이야기하는 웅성거림. 개별 대화 내용은 알아들을 수 없다. 카페나 학교 복도 정도의 거리감. 간헐적으로 누군가 웃는 소리가 먼 곳에서 들린다. 위협적이지 않은 배경 소음. 30초 심리스 루프용." |
| `amb_wind` | Wind (바람) | 열린 공간의 바람. 강하지 않은 지속적인 바람. 가끔 세게 부는 돌풍. | "열린 공간에서 부는 바람. 기본적으로 일정한 세기로 불다가, 간헐적으로(10초에 한 번 정도) 잠깐 세게 분다. 나뭇잎이나 풀이 스치는 소리는 포함해도 되지만 주인공은 바람 자체. 30초 심리스 루프용." |
| `amb_base` | Nothing / 기본 | Phase A에서 소리를 "Nothing"으로 골랐을 때, 또는 기본 배경. 거의 들리지 않는 극저주파 드론. | "거의 들리지 않는 수준의 극저주파 드론. 공간이 존재한다는 것만 느끼게 하는 최소한의 소리. 음악적 요소 없음. 톤 하나가 아주 천천히 미세하게 변조된다. 30초 심리스 루프용." |

### Phase C 추가 사운드

| ID | 사용 시점 | 사운드 성격 | 생성 프롬프트 (한글) |
|----|----------|-----------|-------------------|
| `sfx_resonance` | 봉인어 각인 순간 | 짧은 공명음. 금속이나 돌에 무언가 새겨지는 느낌 + 잔향. | "돌이나 금속 표면에 무언가 깊이 새겨지는 짧은 소리(0.5초). 끌로 파는 듯한 날카로운 b타격 하나 + 공간에 퍼지는 깊은 잔향(2~3초). 잔향은 서서히 사라진다. 원샷 효과음." |
| `sfx_settle` | 침전 진행 중 (2단계) | 무언가 천천히 가라앉는 느낌. 물속에 가라앉는 듯한 저음 움직임. | "무거운 것이 물속으로 천천히 가라앉는 소리. 깊은 저음의 움직임이 15초에 걸쳐 서서히 낮아진다. 거품이나 물 튀는 소리 없이, 압력이 서서히 높아지는 듯한 느낌만. 원샷 15초." |

---

## 장면 수 규칙

### 범위: 최소 3개, 최대 5개

장면 수를 채우라고 유도하지 않는다. 구성요소 기반으로 자연스럽게 결정된다.

### 로직

```
장면 완성 조건: 구성요소 3개 이상 clarity >= 0.7

완성된 장면 < 3개:
  → Phase C 진입 불가. 대화 계속.
  → 사용자가 "그만할게" / 침묵(15초) 시:
     AI: "......아직 조금 흐릿해. 조금만 더 서 있어볼까."
     → 사용자가 다시 침묵(15초) 시: 
        현재까지의 요소로 장면을 강제 완성 (clarity 임계값 0.7 → 0.4로 낮춤)
        → Phase C 진입

완성된 장면 >= 3개:
  → 사용자가 "없어" / 침묵(10초) / 종료 의사 표현 시: Phase C 진입
  → 사용자가 계속 말하면: 다음 장면 시작 (5개까지)

완성된 장면 == 5개:
  → 자동으로 Phase C 진입
  → AI: "......그래. 다 들었어."
  → 유도 멘트 없음. 그냥 넘어감.
```

### 장면 수와 기억의 관계

장면이 적은 기억(3개)과 많은 기억(5개)은 질적으로 다른 기억이지, 부족한 기억이 아니다:
- 3개: 압축된 기억. 감정 궤적이 짧다. Play 모드에서 빠르게 끝남.
- 5개: 풍부한 기억. 감정 궤적이 길다. Play 모드에서 더 많은 전환 패턴 발생.
- 이 차이는 시스템이 판단하지 않는다. 기억의 밀도가 다를 뿐.

---

## 부록: Play 종료 — 문 → 장면화 (2026-04-18 추가)

> 상태: 개념 확정, 세부 설계 전. Record의 "문" 입장과 대칭되는 Play 쪽 "문" 퇴장.
> 데모 영상에는 넣지 않음 (v2 연기).

### 개념

Play가 끝날 때 플레이어는 문으로 나간다. 그 순간 **방금까지 본 장면들이 플레이어의 답변을 반영한 버전으로 다시 조립된다**. 통으로 보면 원본 기억이 아니라 **"내 답변이 녹아든 내 기억"**으로 읽힌다. 이본론("변이 = 재창조") 의 감각적 증거 지점.

### stage_1/2/3 텍스트 역할 재정의

- **버리는 프레임**: stage = 오염 단계에 따라 플레이 중 덧칠되는 텍스트
- **맞는 프레임**: stage = 문 퇴장 후 재조립에 쓰이는 **변주 텍스트 풀**. 어느 변주를 쓸지는 플레이어 궤적이 결정

### 열린 질문

- 재조립 대상: 본 장면 전부 vs 핵심 장면만
- 표시 형식: 원본과 나란히 비교 vs 변주만 단독
- 답변 → 변주 선택 규칙 (감정 궤적 / 선택지 감정 누적 / 오염 bucket 중 무엇?)
- 재조립 결과가 archive에 별도 저장되는가, 개인 경험으로만 소비되는가

### 데모 scope (2026-04-18 결정)

fixation 복합신호, 재조합 트리거, 문→장면화 — **3개 다 데모 영상에서 제외**. v2로 연기.
데모에 남는 것: record + play(단순 반응 버전: 본 장면이 답변에 살짝 반응하는 정도) + strata + archive.

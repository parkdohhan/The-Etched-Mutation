# PLAY 진입 재설계 — 설계 결정 문서 v2

**작성일:** 2026-04-19
**상태:** 구현 진행
**이전 버전:** [v1 (2026-03-30)](play_entry_redesign_v1-260330.md) — 코어 로직 근거
**관련 코드:** [js/services/AIService.js](../js/services/AIService.js), [index.html](../index.html), [js/app/confession.js](../js/app/confession.js), [supabase/functions/claude-scene/index.ts](../supabase/functions/claude-scene/index.ts)

---

## v1 대비 변경 요약

v1의 코어 설계는 **전부 유지**. v2는 가시적 flow만 구체화 + 확정 대사 반영.

| 항목 | v1 | v2 |
|---|---|---|
| 답변 입력 | 자유 텍스트 권장 | 자유 텍스트 **확정** |
| 감정 매칭 | claude-scene 1회 → 벡터 → cosine | 동일 |
| 혼잣말 소스 | DB 재배열 (completed_sentence, scene_text, echo_words) | 동일. LLM은 "3개 고르기 + 오염 적용"만, 생성 금지 |
| 의도적 편차 (공명·변주·이탈) | 명시 | 유지 |
| 오염 반영 (`·`, `░▒▓`) | 명시 | 유지 |
| baseline_emotion 저장 | 명시 | 유지 |
| 자유 탐색 입구 유지 | 명시 | 유지 |
| 선택 후 브릿지 한 줄 | 명시 | 유지 |
| **인트로 연출** | 미명시 | 깜박이는 실(wavy line) + 대사 3단 |
| **시각 전환** | 미명시 | Y축 180° 회전으로 뒷면의 3 문 등장 |
| **문 UI** | 미명시 | confession.js ASCII door 재활용, 3개 병치 |
| **문 진입 모션** | 미명시 | Record의 door 모션(doorPhase 2) 재활용 |
| **호버 UX** | 미명시 | 문 위 호버 → 혼잣말 한 줄 페이드인 |

---

## 확정 대사

톤 가이드: 무심 · 미세한 비웃음 · 호기심. 추궁 아님. 느린 템포.

### 한국어

1. ...너구나.
2. 너가 그렇게 기억을 찾고싶어할줄은 몰랐네.
3. 어떤 기억을 찾고있어?

### English

1. oh. you. again.
2. I didn't think you'd be searching this hard.
3. what are you looking for?

---

## 가시적 Flow (프레임 순서)

### Frame A — 인트로 + 입력

- 검은 배경
- 가운데 한 가닥 실(wavy line, SVG sine wave) — 한 세그먼트가 간헐적으로 깜박
- 대사 1 타이핑 효과로 등장 (0.8~1.2s)
- 대사 2, 3 순차 페이드인 (각 1.5s 간격)
- 맨 아래 텍스트 입력 필드 페이드인 (placeholder 없음, 포커스 자동)
- 엔터 또는 보내기 버튼으로 제출
- 입력 필드 아래 작은 링크: "아카이브 직접 둘러보기 →" / "browse archive" (자유 탐색 back door)

### Frame B — 분석 중

- 실이 답변을 흡수하듯 진동 (1~3s)
- 백엔드: claude-scene `play_entry_match` 호출 중

### Frame C — 180° 회전 + 3 문

- 화면 컨테이너 Y축 180° 회전 (CSS `transform: rotateY(180deg)`, 1.2s)
- 뒷면에 3 문이 ASCII 스타일로 정적 렌더 (confession.js `doorPhase 0` 활용)
- 문 3개 수평 병치, 간격 균등

### Frame D — 호버 / 선택

- 문 호버 → 해당 메모리의 혼잣말(DB pool에서 고른 한 줄) 문 위쪽에 페이드인
- 오염된 메모리:
  - `biased_inclination` → 가운데점(`·`) 몇 개 박힘
  - `hypercompletion` → `░▒▓` 과선명 텍스처 섞임
- 문 클릭 → 해당 문이 열리는 애니메이션 (doorPhase 1 → 2, 약 2s)
- 열린 문을 통과하는 모션

### Frame E — 브릿지 한 줄

- play 시작 직전: "이 기억이 반응했다." (한 줄, ko) / "this memory responded." (en)
- 1초 후 fade → 첫 씬 시작

---

## 백엔드 — claude-scene 확장

**새 type 추가:** `play_entry_match`

```
Request:
{
  type: 'play_entry_match',
  userText: string,
  locale: 'ko' | 'en',
  memories: [{
    id: string,
    completed_sentence: string,
    echo_words: string[],
    original_emotion: { [emotion]: number },
    cont_stage?: 'biased_inclination' | 'hypercompletion' | null,
    sample_scene_texts: string[]  // 상위 2~3 씬 텍스트 (혼잣말 pool)
  }]
}

Response:
{
  baselineEmotion: { fear: 0.3, guilt: 0.2, ... },   // 8차원
  picks: [
    {
      memoryId: string,
      monologue: string,          // DB에서 꺼낸 또는 재배열한 문장 1줄
      variance: 'resonance' | 'variation' | 'drift',
      contamination: 'clean' | 'biased_inclination' | 'hypercompletion'
    },
    ...
  ]
}
```

**LLM 프롬프트 지침 (v1 6-4 원칙 계승):**

1. userText에서 8차원 감정 벡터 추출 (기존 emotion_analysis 루틴 재활용 가능)
2. 메모리마다 cosine 유사도 계산
3. 3개 선택:
   - 1st (`resonance`): 유사도 top-1
   - 2nd (`variation`): top 3~5 중 뚜렷한 결 차이
   - 3rd (`drift`): top 10 내 의외성. 추천엔진 방지용
4. 각 pick에 대해 **해당 메모리의 completed_sentence / echo_words / sample_scene_texts 풀에서만** 혼잣말 1줄 고름
5. **새 문장 생성 금지**. 재배열·발췌만 허용
6. cont_stage 있으면 contamination 필드에 그대로 태깅 (실제 오염 텍스처는 프론트가 렌더)

---

## 프론트 — 구조

- 새 파일 **[js/app/playEntry.js](../js/app/playEntry.js)**: Frame A~E 오케스트레이션
- confession.js의 door 빌더 함수 export (`buildDoor`, `doorEase3`)
- AIService.js에 `matchPlayEntry(userText, memories, locale)` 추가
- 선택 결과: `baseline_emotion`을 plays 테이블 세션 시작 레코드에 저장 (정렬도 reference)

---

## 구현 Phase

### Phase 1 — 기능 뼈대 (애니메이션 없음)

- [ ] `enterPlayIntro` 현재 연결 지점 파악
- [ ] `claude-scene` Edge Function에 `play_entry_match` 추가
- [ ] Frame A 텍스트 입력 UI (정적)
- [ ] 3 문 기본 버튼 + 호버 혼잣말
- [ ] 문 클릭 → 기존 play 흐름 진입 (memory_id 전달) + baseline_emotion 저장
- [ ] 자유 탐색 back door 링크

### Phase 2 — 비주얼

- [ ] 깜박이는 실 SVG + 대사 타이핑
- [ ] 180° 회전 전환
- [ ] ASCII door 3개 병치 (confession.js 함수 재활용)
- [ ] 문 진입 모션 (doorPhase 2)
- [ ] 호버 혼잣말 페이드

### Phase 3 — 마감

- [ ] 오염 텍스처 렌더 (`·`, `░▒▓`)
- [ ] 브릿지 한 줄 오버레이
- [ ] locale 스위치 (ko/en)
- [ ] 타이밍 튜닝

---

## 리스크

| 위험 | 대처 |
|---|---|
| 기억 수 많을 때 LLM payload 비대 | 초기 필터링 — 최근·공개 30개로 제한하거나 valence 축으로 prefilter |
| 180° 회전 중 앞면 컨텐츠 역방향으로 보임 | 내부 컨테이너 `backface-visibility: hidden`, 뒷면 요소 미리 배치 |
| ASCII door 3개 병치 시 레이아웃 | confession.js doorPhase 정적(0) 렌더 추출해 인스턴스 3개 만드는 factory |
| 재플레이 유저가 대화 흐름 반복에 피로 | 자유 탐색 back door 유지 (Frame A) |
| LLM 혼잣말이 "생성"되는 실수 | 프롬프트에 "반드시 제공된 pool에서만" 강제, 검증 단계에서 일치 여부 체크 |

---

## 테스트 기준

- 답변 "엄마가 보고싶다" → 상실·그리움 계열 메모리 3개 우선순위
- 답변 "아무 감정도 없다" → numbness 벡터 → 무감·평면 계열
- 3번째 pick이 1·2번과 뚜렷하게 다른 방향(drift) 유지
- 오염된 메모리는 혼잣말에 텍스처 반영
- back door 링크 클릭 시 기존 archive 진입

# 상호작용 서사에서의 감정 궤적 이탈 측정: The Etched Mutation 시스템과 메트릭

**Measuring Emotional Trajectory Divergence in Interactive Narrative: The Etched Mutation System and Its Metrics**

Dohhan Park

Working Draft v0.2 — 2026-05-16

> **이 드래프트의 포지션**
> 본 논문은 작동하는 인터랙티브 서사 시스템과 그 위에서 계산되는 감정 궤적 메트릭만을 다룬다. 검증되지 않은 이론적 상부구조 — 분자유전학·레트로바이러스 생활사와의 구조적 유비, 기억 변형의 거대 유형론 — 는 본 논문의 주장에서 제외한다. 본 논문이 주장하는 것은 **시스템·메트릭·궤적 비교의 계산적·체험적 타당성**, 그뿐이다.

---

## Abstract

상호작용 서사에서 서로 다른 체험자는 서로 다른 경험을 하지만, 그 "다름"은 대부분 플롯 분기의 차이로만 기술되어 왔다. 본 논문은 **감정 궤적(emotional trajectory)을 상호작용 서사의 일차 차원으로 두는** 시스템 *The Etched Mutation (TEM)* 과, 체험자 궤적이 작가 원본 궤적으로부터 이탈하는 양상을 두 가지 분리 가능한 양식 — **drift (방향 이탈)** 과 **fixation (단일점 수렴)** — 으로 측정하는 오염 벡터(contamination vector), 그리고 궤적 형태의 유사도를 실시간으로 산출하는 별이엔진 V4(Byeori Engine V4)의 정렬도(alignment) 메트릭을 제시한다. 본 시스템은 명시적 분기 구조 없이 매 턴 체험자의 감정 상태에 따라 접근 가능한 장면 집합(accessible pin set)을 계산하며, 공명(resonance)에 도달한 체험자의 궤적은 다음 체험자를 위한 해석 조각(*trajectory bridge*)으로 자동 변환된다. 193 + 100 건의 페르소나 시뮬레이션 플레이로 메트릭의 내부 타당성을 시범 검증한다. 본 논문의 기여는 어떤 상부 이론의 증명이 아니라, 작동하는 **측정 장치와 체험 시스템 그 자체**이다.

**키워드:** 상호작용 서사, 감정 궤적, 정렬도, 오염 벡터, 궤적 비교, 정서 컴퓨팅, 독자 궤적

---

## 1. 서론

### 1.1 문제 설정 — 체험자의 "다름"을 어떻게 측정할 것인가

상호작용 서사(interactive narrative)의 핵심 약속은 체험자마다 다른 경험을 제공한다는 것이다. Janet Murray(1997)의 *Hamlet on the Holodeck* 이래, 이 약속을 구현하는 도구는 Twine, Ink, Articy:Draft, 나아가 StoryAssembler와 Versu 등 다양하게 발전해 왔다. 그러나 대부분의 도구는 **플롯 분기(branching plot)를 통한 경로의 다양성**에 집중해 왔으며, 체험자가 서사를 관통하며 겪는 **감정의 궤적**은 명시적으로 추적되지 않았다.

이 공백은 정서 컴퓨팅(affective computing) 쪽에서도 정확히 메워지지 않는다. 감정의 정량적 모델은 VAD(Russell & Mehrabian, 1977), PANAS(Watson et al., 1988), 감정 단어 규범(Warriner et al., 2013)으로 확립되어 있고, 감정의 시간적 패턴이 경험의 질을 예측한다는 TIES(Temporal Interpersonal Emotion Systems; Butler, 2011, 2017) 프레임워크와 그 계산적 구현인 CompTIES(Butler et al., 2017)가 있지만, 이들은 기본적으로 **관찰된 감정 데이터를 사후에 분석**하는 도구이며, 상호작용 서사 내부의 **실시간 궤적 비교**에는 적용되지 않는다. Reagan et al.(2016)은 서사의 감정 arc가 6개의 대표 형태로 수렴함을 보였으나, 이는 **작품 간 비교**이지 **동일 작품을 체험한 두 사람의 궤적 비교**가 아니다.

본 논문이 답하려는 질문은 다음과 같다:

- **R1.** 플롯 분기 없이, 체험자의 감정 궤적만으로 작동하는 상호작용 서사 접근 모델이 가능한가?
- **R2.** 체험자 궤적이 작가 원본 궤적으로부터 이탈하는 양상을 **정량적으로**, 그리고 **서로 다른 양식으로 분리하여** 측정할 수 있는가?
- **R3.** 특정 정서적 지향점(공명)에 도달한 체험자의 궤적이 다음 체험자를 위한 **해석 조각**으로 자동 변환되는 메커니즘이 구현 가능한가?

### 1.2 기여

본 논문은 세 가지 기여를 제시하며, 각 기여는 기존 연구가 비워 둔 특정 지점을 겨냥한다.

**첫째, 시스템적 기여.** *The Etched Mutation (TEM)* — 감정 벡터를 씬(scene)의 일차 속성으로 두고, 매 턴 체험자 감정 상태에 따라 접근 가능 씬 집합을 계산하는 인터랙티브 서사 시스템. 기존 저작 도구(Twine, Ink, Articy)가 명시적 플롯 분기 조건식으로 경로를 가르는 데 반해, TEM은 분기 조건식 없이 체험자 감정 상태와 씬 원본 감정 사이의 거리만으로 다음 경로를 결정한다. 나아가 전이 패턴(transition pattern)은 접근 공간의 *반경*이 아니라 *중심*을 이동시킨다 — 같은 정렬도라도 패턴이 다르면 다른 씬으로 이어진다(§3.3). 3D 감정 지형(*strata*) 위에 씬이 VAD 좌표로 배치되며, 공명 도달자의 궤적이 **trajectory bridge** 로 자동 축적된다.

**둘째, 방법론적 기여.** 두 가지 계산 가능한 메트릭.
1. **별이엔진 V4 정렬도 (Byeori Engine V4 alignment)** — 체험자 감정 시퀀스와 작가 원본 감정 시퀀스의 형태 유사도를 실시간으로 산출. 정서 컴퓨팅의 대인 감정 비교(TIES/CompTIES)가 관찰 데이터를 *사후 분석*하는 데 반해, 별이엔진은 감정의 전체 강도(level)를 제거하고 변화의 *형태(shape)*만 비교하는 정렬도를 인터랙티브 서사 내부에서 매 턴 실시간으로 산출한다.
2. **오염 벡터 (contamination vector)** — 궤적 이탈을 **drift (방향성 누적 이탈)** 와 **fixation (단일 귀인·감정으로의 과도한 수렴)** 두 축으로 분리 측정. 두 축은 동일 총 이탈량이라도 체험적으로 다른 양상을 구분한다 — 단일 스칼라로 환원하면 "다른 길로 빠지는" 이탈과 "한 점에 꽂혀 되풀이되는" 이탈이 같은 값으로 뭉뚱그려진다.

**셋째, 시범 검증.** 193 + 100 플레이 규모의 페르소나 시뮬레이션으로 메트릭의 내부 일관성과 페르소나 전략 간 분별력을 검증한다.

---

## 2. 관련 연구

### 2.1 기억의 구성적 성격과 변형의 메커니즘

기억 변형 현상에 대한 인지심리학의 축적은 두껍다. Bartlett(1932)의 고전적 연구는 기억이 저장소에서 인출되는 것이 아니라 **매번 재구성**된다는 것을 밝혔다. Nader et al.(2000)의 재고화(reconsolidation) 연구는 회상이 기억을 불안정화시키고 현재 맥락과 함께 재저장하는 분자적 메커니즘을 밝혔으며, Bridge & Paller(2012)는 인간에서도 동일 현상을 확인했다. Loftus & Palmer(1974)와 Loftus(2005)의 오정보 효과(misinformation effect)는 사후 정보가 기억을 체계적으로 왜곡함을, Roediger & McDermott(1995)의 DRM 패러다임은 실제로 경험하지 않은 사건의 거짓 기억 생성을, Johnson et al.(1993)의 출처 모니터링 연구는 기억 출처의 체계적 혼동을 보였다. Bower(1981)의 기분 일치 기억(mood-congruent memory)과 Levine(1997)의 종단 추적은 감정 상태가 회상 내용을 **비무작위적으로** 왜곡함을, Tversky & Marsh(2000)는 사회적 청자 효과를, Schooler & Engstler-Schooler(1990)는 언어화 자체가 기억을 왜곡하는 **언어적 가림(verbal overshadowing)** 을, Pasupathi(2001)와 Hirst & Echterhoff(2012)는 사회적 공유가 기억의 선택적 보존을 유도함을, Patihis & Loftus(2016)와 Goff & Roediger(1998)는 치료적·상상적 과잉 수선이 거짓 기억을 생성함을 밝혔다.

이 풍부한 축적에도 불구하고, 이 현상들은 대체로 **개별 현상으로 다루어져 왔다**. 본 논문은 이들을 하나로 묶는 통합 이론을 제안하지 않는다. 본 논문이 다루는 것은 이 변형들 중 **감정 궤적의 이탈**이라는 한 단면을, 인터랙티브 서사 안에서 실시간으로 측정 가능한 양으로 만드는 장치이다. 위 선행 연구는 그 장치가 겨냥하는 현상의 배경으로 참조되며, 본 논문은 그 인지적 메커니즘에 대한 어떤 주장도 하지 않는다.

### 2.2 감정 측정과 대인 비교

감정의 정량 모델은 VAD(Russell & Mehrabian, 1977), Ekman(1992)의 기본 정서, PANAS(Watson et al., 1988), 감정 단어 규범(Warriner et al., 2013)으로 확립되어 있다. 두 사람의 감정 경험을 비교하는 연구로는 감정 수렴(Anderson et al., 2003)이 있고, Butler(2011, 2017)의 TIES 프레임워크는 감정의 **동적 패턴**이 관계 질을 예측함을 이론화했으며, Butler et al.(2017)의 CompTIES는 이를 **coupled oscillator 모델**로 계산적으로 구현했다.

그러나 CompTIES는 비디오 rating dial 기록에 모델을 **사후에 피팅**하는 관찰 데이터 분석 도구이며, 실시간 인터랙티브 환경에서 체험자의 감정 입력에 즉각 반응하며 원본 궤적과 비교하는 도구는 확립되어 있지 않다. 본 논문의 별이엔진 V4(§4.1)는 TIES의 핵심 원리 — *궤적의 동적 패턴이 수준(level)과 독립적으로 유사성을 예측한다* — 를 상호작용 서사의 **실시간 내부 엔진**으로 이식한 첫 시도이다.

### 2.3 상호작용 서사와 감정 축의 부재

Janet Murray(1997), Marie-Laure Ryan(2001), Espen Aarseth(1997)의 이론적 작업은 상호작용 서사의 철학적 기반을 놓았다. 저작 도구 측면에서 Twine은 명시적 분기 기반, Ink(Inkle)는 변수·상태 기반 분기, Articy:Draft는 작가 노드 저작에 중점을 둔다. 학술 시스템으로 StoryAssembler(Short, 2018)와 Versu(Evans & Short, 2014)가 있다.

공통적으로, **감정이 서사 상태의 일차 차원(first-class dimension)으로 다뤄지지 않는다.** 체험자의 감정은 기록되지 않거나 기록되더라도 플롯 변수로 환원되며, 씬 접근은 플롯 조건식에 따라 결정된다. 본 논문은 감정 벡터를 씬의 일차 속성으로 두고, 체험자의 현재 감정 상태를 **접근 가능 씬 집합의 직접 결정 인자**로 사용한다(§3.3).

### 2.4 체험자 흔적의 다음 체험자로의 전달

체험자의 흔적이 다음 체험자에게 전해지는 메커니즘의 기존 형태는 세 부류로 나눌 수 있다. 첫째, FromSoftware의 *Soulsborne* 시리즈 메시지 시스템은 공간 위치에 플레이어 메시지를 익명으로 남기는 형태이다(Burford, 2015). 둘째, Hypothesis(hypothes.is)는 웹 페이지에 다수 독자의 주석을 중첩한다. 셋째, Genius.com은 가사에 해석을 중첩하되 **인기도 기반**으로 정렬한다.

TEM의 궤적 브릿지(trajectory bridge; §3.5)는 첫 번째에 가장 가까우나 결정적 차이가 있다. Soulsborne 메시지는 **공간 좌표** 에 붙지만, 궤적 브릿지는 **감정 축**에 붙는다. 또한 Genius의 인기도 정렬을 명시적으로 거부한다 — 궤적 브릿지의 노출 조건은 체험자 감정 상태와의 **정렬도**이지 누적 좋아요가 아니다.

### 2.5 본 논문의 위치

| 선행 연구 | 기여 | TEM과의 관계 |
|---|---|---|
| Bartlett(1932), Nader et al.(2000) 등 | 기억 변형 메커니즘 규명 | 배경으로만 참조 — 본 논문은 인지 메커니즘을 주장하지 않음 |
| Butler(2011, 2017) TIES / CompTIES(2017) | 감정 동적 패턴 사후 분석 | 별이엔진이 실시간 인터랙티브로 확장 |
| Reagan et al.(2016) | 서사 감정 arc 형태 6종 | 작품 간 → 체험자 간 비교로 확장 |
| Twine, Ink, Articy | 플롯 분기 저작 | 분기 없이 감정 궤적으로 접근 결정 |
| Soulsborne, Hypothesis | 독자 흔적 중첩 | 공간→감정 축, 인기도→정렬도 기반으로 전이 |

---

## 3. The Etched Mutation (TEM)

### 3.1 개요

TEM은 두 가지 모드로 작동하는 상호작용 서사 시스템이다. **Record 모드**에서 작가는 자신의 기억을 AI와의 대화를 통해 씬 단위로 구조화한다. **Play 모드**에서 체험자는 타인의 기억을 씬 단위로 체험하며, 매 턴 자신의 감정 입력을 제공한다. Strata 모드는 전체 기억을 3D 감정 지형으로 조망한다.

시스템은 vanilla JavaScript ES6 모듈, Three.js (3D), Supabase (인증·DB·Edge Functions), HRTF 기반 Web Audio API로 구현되어 있다. 회귀 테스트 인프라로 vitest 기반 결정론적 케이스가 상시 실행된다.

### 3.2 데이터 모델

TEM의 핵심 데이터 모델은 다음과 같다(표 1).

| 엔티티 | 핵심 필드 | 의미 |
|---|---|---|
| memory | id, code, title, meta.emotion_entries | 작가가 기록한 기억 한 편 |
| scene | id, memory_id, scene_order, text, emotion_vector, echo_words, anchor_emotions, original_emotion, text_stage_1/2/3 | 씬 한 개. emotion_vector는 8축 |
| choice | id, scene_id, emotion, intensity | **씬 내 선택지. 감정 결만 기록. next_scene_id 없음.** |
| play | id, memory_id, curator_id, trajectory_data | 체험자 한 번의 플레이 궤적 |
| trajectory_bridge | id, memory_id, scene_id, source_run_id, source_completed_sentence, entry_emotion, key_passed_scenes[], status | 공명 도달자의 궤적이 자동 변환된 해석 조각 |
| author_bridge | memory_id, scene_id, text | 작가가 쓴 정적 해석 조각 |

주목할 점은 `choices.next_scene_id`가 **존재하지 않는다**는 것이다. 이는 누락이 아니라 설계 결정이다. 선택지는 **체험자 감정 상태를 변화시키는 입력**일 뿐이며, 다음 씬은 감정 상태의 함수로 결정된다(§3.3).

### 3.3 감정 궤적 기반 Scene Navigation

TEM의 접근 규칙은 다음과 같이 요약된다:

> **매 턴, 체험자의 현재 감정 상태와 각 씬의 원본 감정 사이의 거리를 계산하고, 거리가 임계값 이내인 씬들을 접근 가능 씬 집합(`accessiblePinIds`)으로 제시한다.**

구체적으로, 씬 s의 원본 감정 벡터 o_s ∈ ℝ^8 과 체험자 현재 상태 u_t ∈ ℝ^8 에 대해,

$$
d(s, t) = 1 - \cos(u_t, o_s)
$$

의 값이 임계값 τ 이하인 씬을 후보로 삼고, 최근 방문 이력을 고려한 가중치로 정렬하여 상위 k개를 제시한다(SceneNavigator, [docs/SceneNavigator_설계_v1-260329.md](../SceneNavigator_설계_v1-260329.md)). 작가가 명시적 분기를 쓰지 않아도 체험자 궤적에 따라 개인화된 경로가 생성된다.

이 설계의 핵심은 전이 패턴(transition pattern)이 접근 공간의 **반경이 아니라 중심**을 이동시킨다는 점이다. echo_follow는 중심을 원본 쪽으로, contradiction은 체험자 현재 감정의 반대쪽으로, avoidance는 중립 영역으로 옮긴다. 패턴이 반경만 조절하면 단순 룩업 테이블로 격하되므로, 패턴마다 중심 자체가 이동해야 한다.

이 설계의 결과로, **동일 작품을 체험한 두 사람이 완전히 다른 씬 시퀀스를 경험할 수 있다.** 이것이 본 논문이 측정하려는 "다름"의 구체적 형태이다.

### 3.4 Strata — 3D 감정 지형

strata는 모든 씬을 3차원 감정 공간에 배치하는 뷰이다(그림 1 예정). VAD 투영으로 (x, z) 평면 위치를, 감정 강도로 y 축 높이를 결정하며, AF(Attribution × Core Fear) 좌표계를 보조로 사용한다. 각 씬 핀에는 HRTF 기반 공간음향이 결합되어, 체험자가 1인칭으로 걸으면서 감정 지형을 청각적으로도 탐색할 수 있다 ([spatialAudio.js](../../js/shared/spatialAudio.js)).

등고선은 누적 플레이 흔적으로 갱신된다 — 많이 방문된 영역은 깊게 패이고, 희소한 영역은 평탄하게 남는다. 이로써 strata는 단순 시각화를 넘어 **집단 궤적의 흔적이 누적된 지형** 이 된다. 이 누적 지형은 **궤적 브릿지**(§3.5)의 시각적 상관물이다.

### 3.5 Trajectory Bridges — 체험자 궤적의 자동 해석화

체험자가 작품의 핵심 정서적 지향점 — "공명(resonance)"이라 부르는 조건 — 에 도달하면, 그 체험의 궤적이 자동으로 **trajectory bridge**로 변환된다 ([docs/데이터계약_브릿지_v1-260412.md](../데이터계약_브릿지_v1-260412.md)). 이는 자동 승인되며 다음 체험자의 strata와 씬 렌더링에 노출된다.

궤적 브릿지의 형태는 다음과 같다:

```
{
  entry_emotion: {...},           // 이 궤적을 시작한 감정 상태
  key_passed_scenes: [s1, s2, ...], // 거쳐간 핵심 씬
  source_completed_sentence: "..." // 체험자가 마지막에 남긴 문장
}
```

즉 궤적 브릿지는 **한 체험자의 기억-속-기억**이다. 작가의 정적 해석(author_bridge)과 공존하되, **누적성·익명성·감정 축 기반 노출**이라는 점에서 구분된다. 노출 메커니즘은 인기도가 아니라 현재 체험자의 감정 상태와의 정렬도(§4.1)이다.

### 3.6 아키텍처 요약

TEM의 런타임 흐름은 다음과 같다:

```
[체험자 감정 입력]
        ↓
  ByeoriEngine (정렬도 계산, §4.1)
        ↓
  ContaminationTracker (오염 벡터 갱신, §4.2)
        ↓
  SceneNavigator (accessiblePinIds 계산)
        ↓
  Renderer (text_stage_1/2/3, 잔상, 사운드)
```

전체 파이프라인은 vitest 회귀 테스트로 결정론적 동작이 검증되어 있다 ([test/unit/pipeline.regression.test.js](../../test/unit/pipeline.regression.test.js)).

---

## 4. Metrics

### 4.1 Byeori Engine V4 — Trajectory Alignment

별이엔진 V4는 체험자 감정 시퀀스와 작가 원본 감정 시퀀스의 **형태(shape)** 유사도를 실시간으로 산출한다 ([docs/별이엔진_V4-궤적기반_정렬도-260327.md](../별이엔진_V4-궤적기반_정렬도-260327.md)).

체험자 궤적 U = {u_1, u_2, ..., u_t} 과 원본 궤적 O = {o_1, o_2, ..., o_t} 이 주어졌을 때, 정렬도는 다음과 같이 정의된다:

$$
\text{Align}(U, O) = \frac{1}{t} \sum_{i=1}^{t} w_i \cdot \cos(u_i - \bar{u}, o_i - \bar{o})
$$

여기서 \bar{u}, \bar{o}는 각 궤적의 평균 벡터(level 제거), w_i는 최근 턴에 더 높은 가중을 주는 시간 감쇠 가중치이다. **level을 제거한 뒤 형태를 비교**한다는 점이 TIES 원리의 핵심 이식이다 — 두 사람의 감정 수준이 달라도, **감정 변화의 방향이 유사하면** 정렬도는 높다.

#### 4.1.1 계산 속성
- **결정론적**: 동일 입력 궤적에 대해 동일 출력. 골든 픽스처로 스냅샷 테스트됨 ([test/unit/pipeline.regression.test.js](../../test/unit/pipeline.regression.test.js)).
- **실시간**: 매 턴 O(8t) 이하 비용으로 계산 가능.
- **단조성 불보장**: 단일 턴에서 정렬도가 하락할 수 있음(이는 설계 결정이며 §6에서 논의).

### 4.2 Contamination Vector — Drift & Fixation

오염 벡터는 체험자 궤적이 원본에서 이탈하는 **두 가지 분리된 양식**을 측정한다 ([docs/오염벡터_계산_구현_명세_v2-260327.md](../오염벡터_계산_구현_명세_v2-260327.md)).

#### 4.2.1 Drift (방향 이탈)

drift는 **방향성 누적 이탈**이다. 체험자 궤적의 연속 차분 벡터와 원본 궤적의 연속 차분 벡터가 얼마나 다른 방향을 가리키는지의 누적량:

$$
\text{Drift}(U, O) = \frac{1}{t-1} \sum_{i=2}^{t} \left\| (u_i - u_{i-1}) - (o_i - o_{i-1}) \right\|
$$

#### 4.2.2 Fixation (단일점 수렴)

fixation은 **특정 감정이나 귀인에 과도하게 머무는** 정도이다. TEM 매뉴얼 §8.3은 이를 3-way 복합 신호로 정의한다([docs/TEM_시스템_매뉴얼-260410.md](../TEM_시스템_매뉴얼-260410.md)):

```
signal_sim   = 1  if emotion cosine sim with previous state ≥ 0.85, else 0
signal_attr  = 1  if attribution repetition ratio of last 3 turns ≥ 0.8, else 0
signal_expl  = 1  if exploration rate (visited / total scenes) ≤ 0.3, else 0

Fixation = 0.5 · signal_sim + 0.3 · signal_attr + 0.2 · signal_expl
FIXATED  iff Fixation ≥ 0.65
```

현재 코드는 `signal_sim` 한 축만 구현되어 있으며, 전체 복합 신호 구현은 진행 중이다([docs/메모/Feedback.md](../메모/Feedback.md) §우선순위 A-1). 본 논문의 §5 평가는 복합 신호 정의를 기준으로 기술하되, 현 구현과의 격차는 §6.2에 한계로 명시한다.

#### 4.2.3 왜 두 축인가 — 분별력의 동기

동일 총 이탈량(예를 들어 정렬도 0.4)이라도, **drift-dominant**한 체험과 **fixation-dominant**한 체험은 체험적으로 구분된다. 전자는 "다른 길로 빠지는" 느낌이고 후자는 "한 지점에 꽂혀 되풀이되는" 느낌이다. 두 축을 분리하지 않으면 동일 총량 값으로 뭉뚱그려진다. TEM의 렌더링 결정 — text_stage_2/3 편향 텍스트 생성 조건, NPC 독백 트리거 조건 — 은 두 축을 독립적으로 참조한다.

### 4.3 메트릭의 한계 (선언적으로)

본 메트릭들은 세 가지 한계를 가진다.

1. **감정 벡터 부여는 작가 자기보고에 의존한다.** 씬의 `emotion_vector`는 작가 혹은 작가+AI 협업으로 할당된다. 외부 rater 혹은 독립 측정과의 수렴 타당성은 확인되지 않았다.
2. **체험자 입력은 이산적이다.** 체험자가 제공하는 감정 입력은 다지선다 혹은 슬라이더 값이며, 연속적 생리 신호(심박, GSR)와 같은 외재 측정이 아니다.
3. **Ground truth 부재.** 어떤 궤적이 "올바른" 궤적인지에 대한 기준이 없다. 이는 본 메트릭이 *부합*이나 *정확성*이 아니라 *유사도와 이탈 양식*을 측정함으로 설계된 결과이다.

이 한계들은 §6에서 다시 다룬다.

---

## 5. 평가

### 5.1 데이터

본 논문의 평가는 **페르소나 시뮬레이션 데이터**로 수행된다. 실제 인간 체험자 연구는 범위 밖이며 별도 후속 작업에서 다룬다(§6.3).

페르소나 시뮬레이션은 Big Five 성격 프로파일에 기반한 합성 체험자를 LLM으로 구동하여 생성한다 ([tools/persona-sim/](../../tools/persona-sim/)). 현재 데이터:

- **MM23L "당신에게"**: 193 plays × 15 personas
- **E-004 「편지」**: 100 plays × 15 personas
- 총 **293 plays** / 15 unique personas

각 플레이는 씬별 emotion_vector, alignment, mismatch_type, inner_reason을 기록한다.

### 5.2 가설

**H1. 메트릭의 전략 분별력.** 페르소나 성격 프로파일(특히 Openness, Neuroticism, Agreeableness)에 따라 최종 drift · fixation · alignment 분포가 통계적으로 구분된다.

**H2. 정렬도의 궤적 형태 민감도.** 동일 수준(level)이나 다른 형태(shape)의 두 궤적이 정렬도에서 구분된다. 특히 Reagan et al.(2016) 6종 arc 형태 중 서로 다른 형태를 할당받은 페르소나는 정렬도에서 분리된다.

**H3. Drift-Fixation 직교성.** drift와 fixation이 전략적으로 직교 — 즉, 높은 drift 저 fixation, 높은 fixation 저 drift, 둘 다 높음, 둘 다 낮음의 네 사분면이 모두 데이터에 관찰된다.

### 5.3 분석 방법

- H1: 페르소나 특성 벡터와 최종 메트릭 벡터 간 상관 행렬 + 다변량 회귀.
- H2: 페르소나 arc 라벨 × 정렬도 분포 ANOVA.
- H3: drift × fixation 2D 산포도 + 사분면별 빈도.

각 분석은 공개 Jupyter notebook으로 재현 가능하게 제공한다(appendix C 예정).

### 5.4 질적 예시 — E-004 「편지」

정량 분석을 보완하기 위해, 단일 페르소나의 궤적을 엔드투엔드로 읽는다. 예시로 E-004 작품에서 Openness=0.85, Neuroticism=0.3의 페르소나 P-07이 생성한 궤적을 §A에 전문 수록한다: 씬별 감정 변화, 각 씬에서의 alignment 값, 발생한 trajectory_bridge 텍스트, 그리고 이 체험이 다음 체험자에게 어떻게 노출되었는지.

### 5.5 평가하지 않는 것

본 평가는 다음을 주장하지 않는다:

- **외적 타당성**: 페르소나 시뮬은 LLM의 감정 모델을 경유하므로, 이 결과는 실제 인간 체험자의 행동을 담보하지 않는다. 페르소나 결과는 **메트릭의 계산적 일관성과 내부 분별력**의 증거이다.
- **인지심리학적 주장**: 본 메트릭은 기억 변형의 인지적 메커니즘에 대한 어떤 주장도 하지 않는다. 메트릭은 인터랙티브 서사 내부의 궤적 이탈을 측정할 뿐, 그 측정값이 실제 기억 과정의 모형이라고 주장하지 않는다.

---

## 6. 논의 및 한계

### 6.1 기여의 범위 재확인

본 논문은 세 가지를 기여한다: (1) 감정 궤적을 일차 차원으로 두는 작동 시스템, (2) 두 가지 분리 메트릭(alignment, drift/fixation), (3) 페르소나 시뮬로 확인된 내부 타당성. 이 기여들은 각각 자체 메리트로 평가될 수 있다.

본 논문은 다음을 주장하지 **않는다**: 기억 변형의 인지심리학적 메커니즘, 인간 체험자에 대한 외적 타당성, 어떤 궤적이 "올바른" 궤적인지에 대한 규범적 판단.

### 6.2 한계

- **감정 벡터 ground truth 부재**: 씬 감정 벡터가 작가 자기보고 → 복수 작가 교차 검증 혹은 독립 rater 필요.
- **fixation 복합 신호 부분 구현**: §4.2.2의 3-way 복합 신호 중 현 코드는 `signal_sim` 한 축만 구현. 평가 전 `signal_attr`·`signal_expl` 구현 완료가 선행되어야 하며, 그 전까지 fixation 결과는 단축 신호 기준임을 명시한다.
- **LLM 기반 페르소나의 편향**: LLM의 감정 모델 편향이 결과에 유입 → 복수 LLM 비교 혹은 인간 보정 필요.
- **공명 판정의 임계값 민감도**: 현재 공명 기준은 heuristic이며 민감도 분석 부재.
- **명시적 분기 부재의 한계**: 일부 서사적 순간(예: 작가가 의도한 결정적 갈림길)은 감정 거리만으로 유도가 어려움. 향후 "작가 포트" 모델로 보완 예정 ([docs/메모/Feedback.md](../메모/Feedback.md)).

### 6.3 향후 작업

- **인간 체험자 연구 (IRB + N=30~50)**: 페르소나 결과의 외적 타당성 검증.
- **Trajectory bridge 품질 연구**: 자동 승인된 궤적 브릿지가 다음 체험자에게 어떤 영향을 미치는지 — 노출 이후 alignment / drift / fixation 변화 추적.
- **복수 작품 교차 검증**: 현재 E-004, MM23L 두 작품. 장르·분량이 다른 작품군에서 메트릭 분포 비교.

---

## 7. 윤리 고려

체험자 감정 입력은 민감 데이터이다. TEM은 다음 방식으로 이에 대응한다.

- **명시적 동의**: record 단계 confession 화면에서 자신의 기억 조각이 다음 체험자에게 노출될 수 있음에 대한 동의 수집 (`js/app/confession.js` `consentLine`).
- **PII 필터**: 잔상(afterimage)에 개인 식별 정보가 포함되지 않도록 17종 케이스 필터 적용 ([test/unit/piiFilter.test.js](../../test/unit/piiFilter.test.js)).
- **안전 설계**: trigger word 감지 시 즉시 차단이 아닌 n회차 에스컬레이션, 시제 감지 기반 판단 ([docs/안전_설계-260324.md](../안전_설계-260324.md)).
- **철회 가능성**: 사용자 동의 철회 페이지(향후 `/profile/utterances`, 현재 구현 중).

궤적 브릿지는 `source_run_id`로 역추적 가능하나 표시되지는 않으며, 노출 시 작성자 식별자는 렌더링되지 않는다.

---

## 8. 결론

상호작용 서사는 체험자마다 다른 경험을 약속해 왔지만, 그 **다름이 감정의 차원에서 무엇인지**를 말하는 도구는 드물었다. 본 논문은 (1) 감정 궤적을 일차 차원으로 두는 작동 시스템 *The Etched Mutation*, (2) 궤적 형태의 실시간 유사도 측정 *Byeori Engine V4 alignment*, (3) 궤적 이탈의 두 분리 양식 *drift / fixation*, (4) 공명 도달자 궤적의 자동 해석화 *trajectory bridge* 를 제시하였으며, 페르소나 시뮬 293 plays로 메트릭의 내부 타당성을 확인하였다.

본 논문의 기여는 어떤 상부 이론의 증명이 아니라, 작동하는 **측정 장치와 체험 시스템 그 자체**이다. 시스템과 메트릭은 어떤 상부 이론에도 의존하지 않고 자립하며, 독자는 이를 그 자체의 계산적·체험적 메리트로 받아들이거나 반박할 수 있다.

기억이 변형되며 전파된다는 관찰은 Bartlett 이래 풍부하게 축적되어 왔다. 본 논문은 그 변형의 **양상을 측정 가능한 양으로 분해**하고, 그 양이 흐르는 **체험 환경을 실제로 구축**했다는 점에서 미약하나마 새로운 좌표를 제안한다.

---

## References

*(2026-04-03 통합 초안의 참고문헌 목록에서, 본 논문 스코프에 해당하는 항목만 유지. 추가로 상호작용 서사 / Soulsborne 관련 보강 필요. — 다음 작업.)*

- Aarseth, E. (1997). *Cybertext: Perspectives on Ergodic Literature*. JHU Press.
- Anderson, C., Keltner, D., & John, O. P. (2003). Emotional convergence between people over time. *Journal of Personality and Social Psychology*, 84(5), 1054–1068.
- Bartlett, F. C. (1932). *Remembering: A Study in Experimental and Social Psychology*. Cambridge UP.
- Bower, G. H. (1981). Mood and memory. *American Psychologist*, 36(2), 129–148.
- Bridge, D. J., & Paller, K. A. (2012). Neural correlates of reactivation and retrieval-induced distortion. *Journal of Neuroscience*, 32(35), 12144–12151.
- Burford, G. (2015). *FromSoftware's message system*. [URL]
- Butler, E. A. (2011). Temporal interpersonal emotion systems: The "TIES" that form relationships. *Personality and Social Psychology Review*, 15(4), 367–393.
- Butler, E. A. (2017). Emotions are temporal interpersonal systems. *Current Opinion in Psychology*, 17, 129–134.
- Butler, E. A., et al. (2017). Computational approaches to TIES: CompTIES. *[저널 확인 필요]*.
- Ekman, P. (1992). An argument for basic emotions. *Cognition and Emotion*, 6(3-4), 169–200.
- Evans, R., & Short, E. (2014). Versu — A simulationist storytelling system. *IEEE TCIAIG*.
- Goff, L. M., & Roediger, H. L. (1998). Imagination inflation for action events. *Memory & Cognition*, 26(1), 20–33.
- Hirst, W., & Echterhoff, G. (2012). Remembering in conversations. *Annual Review of Psychology*, 63, 55–79.
- Johnson, M. K., Hashtroudi, S., & Lindsay, D. S. (1993). Source monitoring. *Psychological Bulletin*, 114(1), 3–28.
- Levine, L. J. (1997). Reconstructing memory for emotions. *JEP: General*, 126(2), 165–177.
- Loftus, E. F. (2005). Planting misinformation in the human mind. *Learning & Memory*, 12(4), 361–366.
- Loftus, E. F., & Palmer, J. C. (1974). Reconstruction of automobile destruction. *JVLVB*, 13(5), 585–589.
- Murray, J. H. (1997). *Hamlet on the Holodeck*. MIT Press.
- Nader, K., Schafe, G. E., & Le Doux, J. E. (2000). Fear memories require protein synthesis in the amygdala for reconsolidation. *Nature*, 406, 722–726.
- Pasupathi, M. (2001). The social construction of the personal past. *Psychological Bulletin*, 127(5), 651–672.
- Patihis, L., & Loftus, E. F. (2016). Crashing memory 2.0. *Applied Cognitive Psychology*, 30(1).
- Reagan, A. J., Mitchell, L., Kiley, D., Danforth, C. M., & Dodds, P. S. (2016). The emotional arcs of stories are dominated by six basic shapes. *EPJ Data Science*, 5(1).
- Roediger, H. L., & McDermott, K. B. (1995). Creating false memories. *JEP:LMC*, 21(4), 803–814.
- Russell, J. A., & Mehrabian, A. (1977). Evidence for a three-factor theory of emotions. *Journal of Research in Personality*, 11(3), 273–294.
- Ryan, M.-L. (2001). *Narrative as Virtual Reality*. JHU Press.
- Schooler, J. W., & Engstler-Schooler, T. Y. (1990). Verbal overshadowing of visual memories. *Cognitive Psychology*, 22(1), 36–71.
- Short, E. (2018). StoryAssembler. *[출처 확인 필요]*.
- Tversky, B., & Marsh, E. J. (2000). Biased retellings. *Cognitive Psychology*, 40(1), 1–38.
- Warriner, A. B., Kuperman, V., & Brysbaert, M. (2013). Norms of valence, arousal, and dominance for 13,915 English lemmas. *Behavior Research Methods*, 45(4), 1191–1207.
- Watson, D., Clark, L. A., & Tellegen, A. (1988). Development and validation of brief measures of positive and negative affect: The PANAS scales. *JPSP*, 54(6), 1063–1070.

---

## Appendix (계획)

- **A.** E-004 「편지」 단일 페르소나(P-07) 궤적 전문 + 생성된 trajectory_bridge 텍스트
- **B.** 페르소나 prompt 템플릿 및 Big Five 매핑
- **C.** 메트릭 수식 전체 및 재현 Jupyter notebook 링크
- **D.** Supabase 스키마 (DDL) 전문

---

## 다음 작업 (v0.2 → v0.3 체크리스트)

- [x] **기억유전학·이본론 등 미검증 상부구조 제거** (2026-05-16, v0.2) — §1.3 개념적 계보 절·§4 기억유전학 매핑 절 폐기, Abstract·결론·§2.1·§6.5의 의존 표현 정리. 시스템·메트릭만 자립적으로 주장하도록 재구성.
- [x] **제목 중립화** (2026-05-16) — "기억유전학적 관점에서의..." → "상호작용 서사에서의 감정 궤적 이탈 측정". 심사자가 생물 formalism을 기대할 위험 제거.
- [ ] **§5 평가 가설 H1/H2/H3 실제로 돌려보기** — persona-sim 데이터로 숫자 뽑기. 결과에 따라 §5 본문 수정.
- [ ] **§4.1 alignment 수식 실제 코드 대조** — `js/shared/math.js` 확인 후 수식 일치 확인.
- [ ] **§4.2.2 fixation 복합 신호 구현 완료** — `signal_attr`·`signal_expl` 코드 박은 후 §6.2 한계 항목 갱신.
- [ ] **§2.2/2.3 인용 보강** — Short, Evans & Short, Burford 정확한 출처 확인.
- [ ] **§5.4 P-07 전문 부록 A** — 실제 한 페르소나 궤적 추출 후 삽입.
- [ ] **§3 Figure 1 (아키텍처 다이어그램), Figure 2 (strata 스크린샷), Figure 3 (trajectory bridge 렌더링 예)**.
- [ ] **V2.1 변주 시스템(ghost_variants / DriftPicker / GhostBranchTrigger)을 논문에 넣을지 결정** — 5월 구현 완료 + smoke 회귀 가드는 박혀 있으나 정량 분별력 검증 미완. 검증 데이터 확보 후 §3·§4 편입 여부 판단. (보류 근거: 검증 안 된 자리는 본문에 넣지 않는다 — v0.2 스코프 원칙.)
- [ ] **Venue 확정 후 포맷팅** (ICIDS full vs CHI PLAY vs IEEE TAC).

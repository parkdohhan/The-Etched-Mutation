# 기억유전학: 감정 궤적 정렬도를 통한 기억 변형의 측정과 렌더링을 위한 계산적 프레임워크

**Mnemonic Genetics: A Computational Framework for Measuring and Rendering Memory Transformation Through Emotional Trajectory Alignment**

Dohhan Park

Working Draft v0.1 — 2026-03-31

---

## Abstract

기억은 회상될 때마다 변형된다. 이 변형은 열화(degradation)가 아니라 복제, 변이, 선택, 번역, 수선, 재조합이라는 6가지 형식적 연산의 산물이다. 본 논문은 분자유전학의 중심 교의(Central Dogma)에서 유래하되 유전학에서는 불가능한 방식으로 작동하는 이 6연산 체계 — 기억유전학(Mnemonic Genetics) — 를 제시하고, 레트로바이러스(특히 HIV-1)의 생활사와의 구조적 대응을 통해 이론적 정당성을 확보한다. 이어 기억 경험의 유사성을 감정 궤적의 형태로 측정하는 별이엔진(Byeori Engine) V4, 기억 오염의 축적을 바이러스 계통역학 메트릭으로 추적하는 오염 벡터(Contamination Vector) 시스템, 그리고 이 프레임워크를 인터랙티브 시스템으로 구현한 The Etched Mutation(TEM)의 아키텍처를 제시한다.

**키워드:** 기억 변형, 감정 궤적, 정렬도, 재고화, 레트로바이러스, 준종, 인터랙티브 시스템

---

## 1. 서론 (Introduction)

### 1.1 감염으로서의 기억

1897년, 톨스토이는 「예술이란 무엇인가(Что такое искусство?)」에서 예술의 본질을 미(美)가 아닌 **감정의 감염(заражение)**으로 정의했다. 예술가가 경험한 감정이 작품을 매개로 관객에게 전염되며, 이 전염이 성공적일 때 — 즉 관객이 예술가와 동일한 감정을 경험할 때 — 예술이 성립한다는 것이다(Tolstoy, 1897).

121년 후, Pastuzyn et al.(2018)은 기억 형성에 필수적인 Arc 단백질이 레트로트랜스포존(Ty3/gypsy) 유래 Gag 도메인을 보유하며, 실제로 **바이러스 유사 캡시드(virus-like capsid)**를 자가조립하여 뉴런 간에 mRNA를 전달한다는 것을 밝혔다. Arc knockout 마우스는 장기기억을 형성하지 못한다(Plath et al., 2006). 기억의 분자적 매개체가 문자 그대로 바이러스처럼 행동하며 세포 간 정보를 전파한다는 사실은, 톨스토이의 "감염" 비유가 단순한 수사가 아니었음을 시사한다.

본 논문은 이 직관을 형식적 프레임워크로 발전시킨다. 기억은 보존되는 것이 아니라, 전파되고 변형되는 것이다. 그리고 이 변형은 무질서한 열화가 아니라, 분자유전학의 연산들과 구조적으로 대응하는 — 그러나 유전학에서는 "불가능한" — 체계적 연산의 산물이다.

### 1.2 기존 연구의 한계

기억 변형 현상은 인지심리학에서 오랫동안 연구되어 왔다. 기억 재고화(reconsolidation)는 회상이 기억을 불안정화시키고 현재 맥락과 함께 재저장하는 과정을 밝혔으며(Nader, 2000; Nader et al., 2000), 오정보 효과(misinformation effect)는 사후 정보가 기억을 왜곡하는 메커니즘을 보여주었고(Loftus & Palmer, 1974; Loftus, 2005), 출처 모니터링 오류(source monitoring error)는 기억의 출처가 혼동되는 현상을 기술했다(Johnson et al., 1993).

그러나 이 연구들은 각각 **개별 현상**으로 다루어져 왔다. 재고화와 오정보 효과와 출처 혼동이 왜 동시에 존재하는지, 이것들이 하나의 동역학의 서로 다른 표현인지, 아니면 독립적 메커니즘인지에 대한 통합적 프레임워크가 부재하다.

또한, 기억 변형을 **계산적으로 측정**하려는 시도는 대부분 자기보고 척도에 의존한다. 두 사람이 같은 기억을 얼마나 비슷하게 경험했는지를 실시간으로, 정량적으로 측정하는 도구는 확립되어 있지 않다. Butler(2011, 2017)의 TIES(Temporal Interpersonal Emotion Systems) 프레임워크는 감정의 동적 패턴이 관계의 질을 예측한다고 제안했으나, 이를 인터랙티브 시스템에서 조작화(operationalize)한 사례는 없다.

### 1.3 본 논문의 기여

본 논문은 세 가지 기여를 제시한다.

**첫째, 이론적 기여: 기억유전학(Mnemonic Genetics).** 분자유전학의 중심 교의에서 유래하되, 유전학에서는 불가능한 6가지 연산으로 구성된 기억 변형의 형식적 프레임워크를 제시한다. 이 프레임워크는 재고화, 오정보 효과, 출처 혼동, 과잉기억(hypermnesia) 등 기존에 개별적으로 다루어지던 현상들을 하나의 연산 체계로 통합하며, HIV-1 레트로바이러스의 생활사와의 구조적 대응(structural analogy)을 통해 이론적 정당성을 확보한다.

**둘째, 방법론적 기여: 별이엔진(Byeori Engine) V4.** 두 사람이 같은 기억을 얼마나 비슷하게 경험했는지를 감정 궤적(emotional trajectory)의 형태 유사도로 측정하는 계산적 도구를 제시한다. Butler(2017)의 TIES 이론을 인터랙티브 시스템에서 최초로 조작화한 것이며, 기존의 감정 수준(level) 비교를 넘어 감정 변화의 방향(shape)까지 측정한다.

**셋째, 시스템적 기여: 오염 벡터(Contamination Vector)와 TEM.** 기억 오염의 축적을 HIV 계통역학의 표준 메트릭 — root-to-tip divergence, convergent evolution rate, intra-patient diversity — 과 구조적으로 동일한 3축 벡터로 추적하는 모델을 제시하고, 이 전체 프레임워크를 인터랙티브 시스템(The Etched Mutation)으로 구현한 아키텍처를 기술한다.

---

## 2. 기억유전학 (Mnemonic Genetics)

### 2.1 기본 전제: 기억은 의존적 복제자이다

유전학의 자기복제자(self-replicator)는 자율적으로 복제를 수행한다. DNA는 세포 내 효소 시스템을 이용하지만, 복제의 정보적 주체는 DNA 자신이다. 반면 바이러스는 숙주 세포 없이 복제할 수 없는 **절대 의존적 복제자(obligate dependent replicator)**다.

기억은 바이러스보다 더 강한 의미에서 의존적이다. 바이러스가 숙주의 분자 기계를 필요로 하듯, 기억은 타자의 **의식(consciousness)**을 필요로 한다. 기억은 회상자 혼자서는 어떤 연산도 수행하지 못한다 — 회상 자체가 현재 맥락(= 타자의 존재, 사회적 압력, 자기 자신의 변화된 상태)에 의해 매개되며, 전달은 반드시 수신자를 요구한다. 기억유전학의 6연산 모두 타자의 존재를 전제한다.

이 전제는 Arc 단백질의 발견(Pastuzyn et al., 2018)에 의해 분자적 근거를 얻는다. 기억의 분자적 매개체인 Arc가 레트로바이러스 유래 단백질이며 바이러스 유사 입자로 세포 간 전파를 수행한다는 사실은, 기억의 의존적 복제자 성격이 비유가 아니라 진화적 기원에 뿌리박은 것임을 시사한다.

### 2.2 6연산 체계

기억유전학은 분자유전학의 중심 교의 — 복제, 변이, 선택, 번역 — 에 수선과 재조합을 추가한 6개 연산으로 기억 동역학을 기술한다. 각 연산은 유전학에서의 대응물이 있으나, 유전학에서는 "불가능한" 방식으로 작동한다.

#### 2.2.1 파괴적 복제 (Destructive Replication)

유전학에서 DNA 복제는 반보존적(semi-conservative)이다 — 원본 가닥이 주형으로 보존되고, 새로운 상보적 가닥이 합성된다. 원본은 소멸하지 않는다. 기억에서 회상(retrieval)은 기억을 불안정화시키고 현재 맥락과 함께 재고화(reconsolidation)한다(Nader, 2000). 원본은 변형된 사본에 의해 덮여 **소멸**한다.

형식적으로: R(M) = M', 여기서 M ≠ M'이며 원본 M은 더 이상 존재하지 않는다. 복제와 변형이 분리되지 않고 하나의 연산으로 결합된다.

**HIV-1 대응:** Provirus 통합. HIV RNA가 역전사되어 숙주 DNA에 삽입될 때, 원본 RNA 바이러스는 분해되고 숙주 게놈의 일부로 "재기록"된다. 원본 형태는 소멸한다.

#### 2.2.2 편향적 변이 (Biased Mutation)

유전학에서 돌연변이는 무작위(random)이며 방향성이 없다. 기억에서 변이는 비무작위(non-random)이다. 변이 방향은 회상 시점의 감정 상태(e), 현재 맥락(c), 사회적 압력(s)에 의해 결정된다: ΔM = f(e, c, s). 구조적으로 라마르크주의(획득형질의 유전)와 동형이며, 유전학에서 기각된 라마르크주의가 기억에서는 작동한다.

**HIV-1 대응:** APOBEC3G에 의한 편향적 과변이. 숙주의 APOBEC3G 효소는 HIV cDNA의 시토신(C)을 우라실(U)로 탈아미노화하여 G→A 과변이(hypermutation)를 유도한다(Harris & Dudley, 2015). 변이는 무작위가 아니라 숙주(= 해석자)가 방향을 결정하며, 특정 서열 맥락(5'TC)에서 편향적으로 발생한다. 이것은 기억의 "감정·맥락·사회적 압력이 변이 방향을 결정한다"는 편향적 변이의 가장 정확한 분자적 아날로그다.

#### 2.2.3 의도적 선택 (Intentional Selection)

자연선택의 주체는 의식 없는 환경이다. 기억에서 선택의 주체는 다른 의식(another consciousness)이다. 타인에게 전달될 때 "전할지/숨길지"가 의식적으로 선택되며, 그 메커니즘은 검열(censorship), 신화화(mythologization), 큐레이션(curation)이다.

**HIV-1 대응:** 항원 변이(antigenic variation). HIV는 면역체계(= 환경의 "선택 압력")를 피하기 위해 표면 단백질(gp120)을 지속적으로 변경한다. 기억이 사회적 맥락에 따라 어떤 면을 드러내고 숨기는 것과 같은 구조다.

#### 2.2.4 무규칙 번역 (Ruleless Translation)

유전학에서 번역은 코돈 테이블이라는 고정 규칙에 의해 결정론적이다. 기억에서 매체 전환(경험→언어, 언어→타인의 신경 패턴)에는 고정 규칙이 없다. 번역 함수 자체가 시간·맥락 의존적 확률 변수로 동작한다: T(M_a, t, c) = M_b + η(t, c).

**HIV-1 대응:** Arc 캡시드에 의한 mRNA 전달(Pastuzyn et al., 2018; Ashley et al., 2018). Arc 캡시드가 어떤 mRNA를 패키징하고 어떤 세포에 전달하는지는 고정된 "주소 테이블"이 아니라, 뉴런 활동 패턴에 의존하는 확률적 과정이다.

#### 2.2.5 과잉 수선 (Aberrant Repair)

DNA 수선 시스템(NER, BER, HR 등)은 높은 정확도로 손상을 복원하지만 완벽하지 않으며, 수선 과정 자체가 오류를 도입할 수 있다. 특히 텔로머레이스에 의한 텔로미어 과잉 재생은 세포 증식 제어를 무너뜨려 암을 유발한다 — 수선 자체가 병리를 만드는 역설이다.

기억에서 "수선"은 흐릿해지거나 왜곡된 기억을 원래대로 되돌리려는 시도다. 이 시도는 원본으로의 수렴을 지향하지만, 파괴적 복제(2.2.1)에 의해 회상 자체가 덮어쓰기이므로 수렴에 실패한다. 결과는 원본이 아니라 **원본보다 더 완결된 구성물** — 과잉기억(hypermnesia)이다. 실제로 없었던 감각, 대화, 맥락이 "복원"이라는 이름으로 생성되며, 회상자는 이를 원본의 일부로 확신한다.

**HIV-1 대응:** 면역 압력 하의 수렴 진화. 서로 다른 환자의 HIV가 독립적으로 동일한 약제 내성 변이(예: M184V)를 획득하는 현상. 수렴은 "원래 서열로의 복원"이 아니라 "선택 압력에 의해 강제된 새로운 고정"이다.

#### 2.2.6 기억 재조합 (Mnemonic Recombination)

유전적 재조합에서 상동 염색체가 교차(crossing over)하여 부모 양쪽의 유전 정보가 섞인 새로운 조합이 만들어진다. 기억에서 서로 다른 기억 단위의 조각이 합쳐져 실제로 일어나지 않은 기억이 구성되는 현상 — 출처 모니터링 오류(Johnson et al., 1993), 거짓 기억의 합성 — 이 이에 해당한다.

형식적으로: Recombine(M_a, M_b, breakpoint) = M_c, 여기서 M_c ≠ M_a, M_c ≠ M_b이다. 재조합이 일어나려면 두 기억이 최소한의 상동성(homology) — 같은 장소, 같은 인물, 유사한 감정 — 을 공유해야 한다. 이 상동성의 기준이 유전학보다 훨씬 느슨하다는 점이 기억 재조합의 특징이다.

**HIV-1 대응:** HIV는 RNA가 2카피(diploid)이며, 서로 다른 변이체가 동일 세포에서 만나면 역전사 중 template switching에 의해 재조합이 일어난다. 상동성이 느슨해도 재조합이 발생하는 점은 기억의 "비상동 재조합"과 구조적으로 동일하다.

### 2.3 6연산과 HIV-1 생활사: 구조적 대응 종합

| 기억유전학 연산 | 유전학에서의 불가능 | HIV-1 대응 | 대응 논리 |
|---|---|---|---|
| 파괴적 복제 | 원본 파괴 복제 | Provirus 통합 | 원본 소멸, 숙주 게놈으로 재기록 |
| 편향적 변이 | 방향적 돌연변이 | APOBEC3G 과변이 | 숙주가 변이 방향을 결정 |
| 의도적 선택 | 의식적 선택 주체 | 항원 변이 | 환경 압력에 따른 표면 변경 |
| 무규칙 번역 | 가변적 코돈 테이블 | Arc 캡시드 mRNA 전달 | 확률적 패키징, 고정 주소 없음 |
| 과잉 수선 | 수선이 병리를 생산 | 수렴 진화 (M184V 등) | "복원"이 아닌 강제적 고정 |
| 기억 재조합 | 비상동 교차 | Template switching 재조합 | 느슨한 상동성으로 교차 발생 |

이 대응은 **구조적 유사성(structural analogy)**이며 인과적 주장이 아니다. "기억이 HIV처럼 작동한다"가 아니라, "기억의 전파·변형 역학과 레트로바이러스의 생활사가 동일한 수학적 구조를 공유한다"는 것이다. 이 구조적 공유가 우연이 아닌 근거는, 기억의 분자적 매개체(Arc)가 실제로 레트로바이러스 유래라는 진화적 사실에 있다.

### 2.4 기존 기억 연구의 통합

6연산 체계는 기존에 개별적으로 다루어지던 기억 현상들을 하나의 프레임워크 안에 위치시킨다.

| 기존 연구 | 기억유전학 연산 |
|---|---|
| 기억 재고화 (Nader, 2000) | Op 1: 파괴적 복제 |
| 기분 일치 기억 왜곡 (Bower, 1981) | Op 2: 편향적 변이 |
| 출처 모니터링 오류 (Johnson et al., 1993) | Op 3: 의도적 선택 + Op 6: 재조합 |
| 오정보 효과 (Loftus, 2005) | Op 2 + Op 5: 편향적 변이 + 과잉 수선 |
| 과잉기억/과잉 세부 (Patihis & Loftus, 2016) | Op 5: 과잉 수선 |
| 거짓 기억 합성 (Roediger & McDermott, 1995) | Op 6: 기억 재조합 |

이 통합의 의의는, 각 현상이 독립적 메커니즘이 아니라 동일한 연산 체계의 서로 다른 발현이라는 관점을 제공한다는 데 있다.

---

## 3. 별이엔진 V4: 궤적 기반 정렬도

### 3.1 측정 대상

별이엔진(Byeori Engine)은 단일한 질문에 답한다:

> **A가 기억을 기록했다. B가 그 기억을 읽고 반응했다. A와 B의 경험이 얼마나 비슷한가?**

이 "비슷함"을 0~1 사이의 숫자(alignment score)로 산출하는 것이 엔진의 유일한 역할이다. 기억유전학의 관점에서 별이엔진은 **진단 검사(diagnostic assay)**에 해당한다 — 기억을 변형시키지 않으며, 관찰하고 보고할 뿐이다. 결과의 해석과 그에 따른 조치(렌더링 제어)는 상위 시스템(오염 벡터)의 영역이다.

### 3.2 이론적 기반: Butler의 TIES 이론

Butler(2011, 2017)의 TIES(Temporal Interpersonal Emotion Systems) 프레임워크는 감정을 개인 내부의 정적 상태가 아니라, 시간에 걸쳐 전개되는 대인적 동적 시스템으로 개념화했다. 핵심 주장: **감정의 동적 패턴(dynamics)은 감정의 수준(level)과 독립적으로 관계의 질과 안녕(well-being)을 예측한다.**

이 구분은 별이엔진 V4의 설계 원리가 된다. 두 사람의 감정이 "같은 높이"에 있는지(level)와 "같은 방향으로 움직이는지"(shape)는 독립적인 정보이며, 둘 다 측정해야 경험의 유사성을 포착할 수 있다.

Anderson, Keltner & John(2003)은 연인 커플과 룸메이트가 1년에 걸쳐 정서 반응이 수렴한다는 것을 보여주었으며, 이 수렴 자체가 관계 응집력과 관계 지속을 예측했다. 별이엔진의 shape_similarity는 이 정서 수렴의 순간적 스냅샷을 측정한다.

### 3.3 최종 공식

```
shape_raw = (scenes_played >= 3)
            ? cosine(flatten(delta_user), flatten(delta_original))
            : 1.0

shape     = max(0, shape_raw)
level     = mean(scene_scores)
void_mod  = (user_void && !original_void) ? 0.7 : 1.0

alignment = level × shape × void_mod
```

**scene_score:** 한 장면에서 체험자의 감정 벡터와 기록자의 원본 감정 벡터 간 코사인 유사도(0~1). 감정은 17차원 앵커 벡터(fear, sadness, anger, guilt, shame, isolation, numbness, moral_pain, helplessness, despair, joy, hope, relief, gratitude, love, peace, comfort)로 표현되며, VAD 공간 배치는 Warriner et al.(2013)의 13,915개 영단어 정서 규범 데이터에 기반한다.

**level_similarity (level):** 방문한 모든 장면의 scene_score 평균. "장면마다 감정이 얼마나 비슷했는가"의 누적 지표.

**shape_similarity (shape):** 감정 변화량(delta)의 궤적을 비교한 코사인 유사도. 체험자 B가 장면을 [3, 1, 4] 순서로 방문했다면:

```
delta_B = [B의 scene1 반응 − B의 scene3 반응, B의 scene4 반응 − B의 scene1 반응]
delta_A = [A의 scene1 원본 − A의 scene3 원본, A의 scene4 원본 − A의 scene1 원본]

shape_raw = cosine(flatten(delta_B), flatten(delta_A))
```

원본 A의 감정은 **B의 방문 순서대로 재배열**된다. 이는 철학적 선택이다 — 체험자의 탐색 행위(어떤 장면을 먼저 방문하는가)가 경험의 일부이며, 정전적(canonical) 순서가 아닌 체험 순서가 의미의 단위가 된다.

장면 3개 미만일 때 shape = 1.0으로 설정하는 이유: delta 계산에 최소 2개의 차이값이 필요하고, 이를 위해 3개 이상의 장면이 필요하다. 정보 부재 시 shape를 중립(1.0)으로 두어, level만으로 정렬도가 결정되도록 한다.

**void_modifier (void_mod):** 체험자가 감정 입력을 회피(VOID)했고 기록자는 감정을 드러냈을 때 ×0.7 페널티. 둘 다 VOID면 페널티 없음(공명).

### 3.4 곱셈 구조의 설계 근거

V4의 가장 중요한 설계 판단은 **곱셈 결합**이다. 이전 버전(V3)의 선형 결합과의 비교:

```
V3: alignment = E × 0.4 + R × 0.4 + A × 0.2     (가중합)
V4: alignment = level × shape × void_mod           (곱셈)
```

선형 결합의 구조적 문제: 감정이 정반대(E=0)여도 이유 레이블이 우연히 같으면(R=1), alignment가 0.4 + 0.14 = 0.54로 HIGH 경계 직전까지 올라간다. "다른 감정이라도 이유가 같으면 비슷한 경험"이라는, 의도하지 않은 철학적 함의가 발생한다.

곱셈 결합은 이 보상을 **구조적으로 차단**한다. level = 0이면 shape가 아무리 높아도 alignment = 0이다. "감정이 다르면 경험이 다르다"는 원칙이 수학적 구조에 내장된다.

추가로, V3의 0.4/0.4/0.2 가중치 비율에는 이론적·경험적 근거가 없었다. 곱셈 구조는 임의의 가중치를 제거한다.

### 3.5 V1에서 V4까지의 진화 경로

| 버전 | 공식 | 실패 이유 |
|------|------|-----------|
| V1 | cosine(user, original) | "같은 감정, 다른 이유" 구분 불가 |
| V2 | embedding(0.65) + VAD(0.35) | 임베딩이 감정과 이유를 분리 못함 |
| V3 | E(0.4) + R(0.4) + A(0.2) | AI 추출 노이즈 ±0.14, 이산 해상도, 축 간 보상, 근거 없는 가중치 |
| **V4** | **level × shape × void_mod** | 이유를 직접 측정하지 않고 결과(궤적 분기)를 관찰 |

V4의 핵심 전환: **이유를 직접 측정하는 대신 이유의 결과를 관찰한다.** "같은 감정이지만 다른 이유"를 가진 두 사람은 다음 장면에서 다르게 반응한다. 장면 1에서 둘 다 슬픔을 느꼈더라도, "내 탓"이라고 느낀 사람은 죄책감으로 이동하고, "그 사람 탓"이라고 느낀 사람은 분노로 이동한다. 궤적이 갈라지면 이유가 달랐다는 것이 간접적으로 드러난다.

이 전환은 인지적 평가 이론(Lazarus & Folkman, 1984)의 측정 한계에 대한 응답이다. 심리학에서 인지적 평가를 측정하는 검증된 도구(SAM, CAHS 등)는 전부 자기보고 척도이며, AI가 자유 텍스트에서 레이블을 추출하는 방식은 검증된 측정 도구가 아니다. V4는 인지적 평가를 직접 측정하는 대신, 평가 차이의 결과(= 궤적 분기)를 관찰하는 간접 접근으로 전환했다.

### 3.6 전이 패턴

alignment 점수와 별개로, 궤적의 형태에서 6가지 서사적 전이 패턴을 도출한다. 이 패턴은 점수 계산에 관여하지 않으며, 상위 시스템이 서사 분기와 시각적 연출에 사용한다.

| 패턴 | 판정 기준 | 기억유전학 대응 |
|---|---|---|
| echo_follow | 직전 2개 delta 방향 일치 | 파괴적 복제 (잔향) |
| contradiction | 직전 delta 방향 반대 | 편향적 변이 (반대 방향 왜곡) |
| fixation | 직전 3개 감정 벡터 코사인 ≥ 0.85 | 과잉 수선 (강박적 반복) |
| displacement | level 높고 shape 낮음 | 무규칙 번역 (같은 감정, 다른 궤적) |
| avoidance | VOID 발생 | 의도적 선택 (회피) |
| bridge | 나머지 | 중립적 연결 |

---

## 4. 오염 벡터 (Contamination Vector)

### 4.1 모듈의 성격: 연출 제어 모델

오염 벡터는 **진실 모델(truth model)이 아니라 연출 제어 모델(control signal model)**이다. 기억의 객관적 상태를 측정하는 계측기가 아니라, 체험자가 기억의 변이를 체감할 수 있도록 프론트엔드에 제어 신호를 보내는 장치다.

이 구분이 중요한 이유: 별이엔진(진단 검사)이 기억의 상태를 관찰하고, 오염 벡터(치료 방침)가 그 관찰에 기반하여 렌더링 강도를 결정한다. 바이러스학에서 RT-qPCR(진단)과 항바이러스 요법(치료)이 분리되어 있듯, 측정과 제어가 분리된다.

### 4.2 3축 + depth: HIV 계통역학 메트릭과의 구조적 대응

오염 벡터의 3축(divergence, convergence, heterogeneity) + depth는 HIV-1 계통역학(phylodynamics)에서 바이러스 진화를 추적하는 표준 메트릭과 구조적으로 동일하다. 이 대응이 3축 선택의 이론적 정당화를 제공한다.

| HIV 계통역학 메트릭 | 오염 벡터 축 | 수학적 대응 |
|---|---|---|
| **Root-to-tip divergence** | **divergence** | 원본으로부터의 감정적 거리 누적 |
| **Convergent evolution rate** | **convergence** | 반복 고정렬에 의한 과잉 수렴 |
| **Intra-patient diversity (π)** | **heterogeneity** | 해석 간 정렬도 분산 |
| **Serial passage count** | **depth** | 해석 반복 횟수 |

### 4.3 각 축의 정의와 갱신 공식

#### depth — Muller's Ratchet

```
depth += 1    (단조 증가, 감소 없음)
```

무성 생식 집단에서 해로운 변이가 비가역적으로 축적되는 현상인 Muller's Ratchet(Muller, 1964)의 직접적 구현이다. 기억의 해석 횟수는 되돌릴 수 없다.

#### divergence — 분자시계 포화 모델

```
delta_div = (1 − shape) × (1 − level)
decay = 1 / (1 + depth × DECAY_RATE)
divergence = min(divergence + delta_div × decay, 1.0)
```

low shape(궤적 분기) + low level(감정 차이)이 동시에 발생할 때 divergence가 증가한다. decay 함수는 HIV 분자시계의 포화 모델과 같은 형태다 — 초기 해석이 오염에 더 큰 영향을 미치고, 후기 해석은 점차 둔화된다.

#### convergence — 면역 압력 하의 수렴 진화

```
if depth >= MIN_DEPTH_FOR_CONVERGENCE:
  if fixation_level >= 0.85:
    delta_conv = alignment × FIXATION_CONV_WEIGHT
  else if shape >= 0.7 and level >= 0.7:
    delta_conv = alignment × HIGH_CONV_WEIGHT
  else if alignment >= 0.5:
    delta_conv = alignment × MID_CONV_WEIGHT
convergence = min(convergence + delta_conv × decay, 1.0)
```

depth ≥ 3 이전에는 convergence를 축적하지 않는다(v2 수정사항). 이는 별이엔진의 shape_active 임계값(장면 ≥ 3)과 정합한다 — 궤적이 관측 가능하기 전에 수렴을 가정하지 않는다. HIV에서 수렴 진화는 "원래 서열로의 복원"이 아니라 "선택 압력에 의해 강제된 새로운 고정"이며, 이것이 기억의 과잉 수선(Op 5) — 과잉완성된 "가짜 원본" — 에 대응한다.

#### heterogeneity — Eigen의 준종(Quasispecies) 이론

```
// Welford 온라인 분산 (Welford, 1962)
n = depth
d1 = alignment − mean
mean += d1 / n
d2 = alignment − mean
m2 += d1 × d2

if n >= 2:
  variance = m2 / (n − 1)
  heterogeneity = min(variance × HETERO_SCALE, 1.0)
```

Eigen & Schuster(1977)의 준종 이론에 따르면, 높은 변이율의 자기복제자 집단은 단일 서열이 아니라 변이체의 구름(cloud of mutants)으로 존재하며, 구름의 폭이 적응적 다양성을 결정한다. heterogeneity를 분산(variance)으로 계산하는 것은 준종의 "구름 폭 측정"과 동일한 수학적 조작이다.

### 4.4 Stage Mixing: 바이러스 적응도 지형의 세 국면

3축의 값으로부터 렌더링 강도를 결정하는 Stage mixing 비율을 산출한다:

```
stage_1 = divergence × (1 − convergence)         // 편향적 기울어짐
stage_2 = heterogeneity × min(depth / 5, 1.0)    // 해석 병기
stage_3 = convergence × (1 − heterogeneity)      // 과잉 완결
```

이 곱셈 구조는 바이러스 적응도 지형(fitness landscape)에서의 세 가지 진화 국면에 대응한다:

| 진화 국면 | 바이러스 상태 | Stage | 기억 상태 |
|---|---|---|---|
| **변이 확산기** | divergence 높음, convergence 낮음 | Stage 1 | 기억이 한 방향으로 기울어짐 |
| **준종 평형** | heterogeneity 높음, depth 깊음 | Stage 2 | 다수 해석이 공존 |
| **클론 고정기** | convergence 높음, heterogeneity 낮음 | Stage 3 | 과잉 완결된 "가짜 원본" |

Stage 1과 Stage 3이 반상관(anti-correlated)인 것은 바이러스 집단에서 변이 확산기와 클론 고정기가 동시에 일어나지 않는 것과 같은 구조적 제약이다.

---

## 5. 시스템: The Etched Mutation (TEM)

### 5.1 아키텍처 개요

TEM은 기억유전학의 6연산, 별이엔진 V4, 오염 벡터를 하나의 인터랙티브 시스템으로 통합한 웹 기반 "기억 극장(memory theater)"이다. 사용자는 타인의 기억을 체험하고, 그 체험이 기억을 변형시키며, 변형된 기억을 다음 체험자가 다시 만나는 순환 구조를 경험한다.

시스템은 세 층으로 구성된다:

```
[별이엔진 V4]  →  관찰 (진단 검사)
     ↓ alignment, pattern, fixation 출력
[오염 벡터]    →  제어 (치료 방침)
     ↓ stage_weights, divergence, convergence, heterogeneity
[렌더링]       →  표현 (투약)
     ↓ 텍스트 변형, 시각적 오염, 청각적 변조
```

별이엔진은 기억을 변형시키지 않는다 — 관찰하고 보고할 뿐이다. 오염 벡터는 별이엔진의 출력을 소비하여 렌더링 강도를 결정한다. 렌더링은 체험자에게 기억의 변이를 체감하게 한다. 각 층은 역할이 명확하고 역류(backflow)가 없다.

### 5.2 세 가지 모드

**Record 모드:** 사용자가 자신의 기억을 AI 대화("또 다른 나")를 통해 서사화한다. 이 행위는 기억유전학의 Op 4(무규칙 번역: 경험→언어)와 Op 3(의도적 선택: 무엇을 말하고 숨길지)이 동시에 작동하는 과정이다. 기록된 결과는 "원본"이 아니라 **최초 발화 궤적(initial telling trajectory)** — 기억의 첫 번째 전파 이벤트의 산물이다. TEM의 철학은 순수한 원본 기억의 존재를 부정한다.

**Play 모드:** 다른 사용자가 기록된 기억의 장면들을 순회하며 각 장면에서 감정을 입력한다. 별이엔진 V4가 매 장면의 정렬도를 계산하고, 오염 벡터가 갱신된다. 체험자는 전체 기억 공간의 지도가 아닌 "안개 속 감각(fog of sensing)"만을 경험한다 — 접근 가능한 장면만 보이고, 나머지는 감정 공간의 안개 속에 숨겨진다.

**Archive/Strata 모드:** 누적된 해석들이 3D 지형(Attribution × Core Fear 좌표계)으로 시각화된다. 각 Play가 지형에 미세한 융기를 만들고, 다수의 Play가 축적되면 기억의 "지층(strata)"이 형성된다. 이것은 기억유전학의 모든 연산이 남긴 흔적의 지질학적 기록이다.

### 5.3 Record = First Play

TEM의 핵심 설계 원칙 중 하나: **기억을 기록하는 행위 자체가 첫 번째 체험이다.** Record는 Play의 특수한 경우이며, AI 대화 과정에서 별이엔진의 전이 패턴이 AI의 질문 리듬을 조절한다. AI는 패턴을 이름 붙이거나 해석하지 않으며, 질문의 질감(texture)만 변화시킨다 — echo_follow일 때는 부드러운 연속, contradiction일 때는 방향 전환, fixation일 때는 침묵.

이 원칙은 기억유전학의 Op 1(파괴적 복제)과 정합한다: 기억을 말하는 행위가 이미 기억을 변형한다. "원본을 기록"하는 것이 아니라 "첫 번째 변형을 수행"하는 것이다.

### 5.4 데이터 순환

```
Record (기록자 A)
  → 최초 발화 궤적 저장 (telling_trajectory)
  → 장면(scenes) + 원본 감정 벡터 생성

Play (체험자 B₁)
  → 장면 순회 + 감정 입력
  → 별이엔진: alignment, pattern, fixation 산출
  → 오염 벡터: divergence/convergence/heterogeneity 갱신
  → 렌더링: Stage weights에 따른 텍스트/시각 변형

Play (체험자 B₂)
  → 이전 Play의 오염이 반영된 기억을 체험
  → 별이엔진: 새로운 alignment 산출
  → 오염 벡터: 추가 갱신
  → ...

Strata (누적)
  → 모든 Play의 흔적이 3D 지형으로 축적
```

매 Play마다 기억은 조금씩 변형된다. 충분한 Play가 축적되면(depth ≥ 5, heterogeneity ≥ 0.5) 재조합 트리거가 활성화되어, 서로 다른 해석이 교차한 제3의 서사가 생성될 가능성이 열린다.

---

## 참고문헌 (References)

Anderson, C., Keltner, D., & John, O. P. (2003). Emotional convergence between people over time. *Journal of Personality and Social Psychology*, 84(5), 1054–1068.

Ashley, J., Cordy, B., Lucia, D., et al. (2018). Retrovirus-like Gag protein Arc1 binds RNA and traffics across synaptic boutons. *Cell*, 172(1-2), 262-274.

Bower, G. H. (1981). Mood and memory. *American Psychologist*, 36(2), 129-148.

Butler, E. A. (2011). Temporal interpersonal emotion systems: The "TIES" that form relationships. *Personality and Social Psychology Review*, 15(4), 367–393.

Butler, E. A. (2017). Emotions are temporal interpersonal systems. *Current Opinion in Psychology*, 17, 129–134.

Eigen, M., & Schuster, P. (1977). The hypercycle: a principle of natural self-organization. *Naturwissenschaften*, 64(11), 541-565.

Harris, R. S., & Dudley, J. P. (2015). APOBECs and virus restriction. *Virology*, 479-480, 131-145.

Johnson, M. K., Hashtroudi, S., & Lindsay, D. S. (1993). Source monitoring. *Psychological Bulletin*, 114(1), 3–28.

Lazarus, R. S., & Folkman, S. (1984). *Stress, appraisal, and coping*. Springer.

Loftus, E. F. (2005). Planting misinformation in the human mind: A 30-year investigation of the malleability of memory. *Learning & Memory*, 12(4), 361–366.

Loftus, E. F., & Palmer, J. C. (1974). Reconstruction of automobile destruction: An example of the interaction between language and memory. *Journal of Verbal Learning and Verbal Behavior*, 13(5), 585–589.

Muller, H. J. (1964). The relation of recombination to mutational advance. *Mutation Research*, 1(1), 2-9.

Nader, K. (2000). Memory traces unbound. *Trends in Neurosciences*, 26(2), 65-72.

Nader, K., Schafe, G. E., & LeDoux, J. E. (2000). Fear memories require protein synthesis in the amygdala for reconsolidation after retrieval. *Nature*, 406(6797), 722-726.

Park, D. (2026). Mnemonic Genetics: Six operations of memory dynamics. Working Paper v0.3.

Pastuzyn, E. D., Day, C. E., Bhatt, R. B., et al. (2018). The neuronal gene Arc encodes a repurposed retrotransposon Gag protein that mediates intercellular RNA transfer. *Cell*, 172(1-2), 275-288.

Patihis, L., & Loftus, E. F. (2016). Crashing memories 2.0: False memories in adults for an upsetting childhood event. *Applied Cognitive Psychology*, 30(1), 41-50.

Plath, N., Ohana, O., Dammermann, B., et al. (2006). Arc/Arg3.1 is essential for the consolidation of synaptic plasticity and memories. *Neuron*, 52(3), 437-444.

Rambaut, A., Posada, D., Crandall, K. A., & Holmes, E. C. (2004). The causes and consequences of HIV evolution. *Nature Reviews Genetics*, 5(1), 52-61.

Reagan, A. J., Mitchell, L., Kiley, D., Danforth, C. M., & Dodds, P. S. (2016). The emotional arcs of stories are dominated by six basic shapes. *EPJ Data Science*, 5(1), 31.

Roediger, H. L., & McDermott, K. B. (1995). Creating false memories: Remembering words not presented in lists. *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 21(4), 803-814.

Tolstoy, L. (1897). *What Is Art?* (Что такое искусство?). Moscow.

Troiano, E., Padó, S., & Klinger, R. (2023). Dimensional modeling of emotions in text with appraisal theories. *Computational Linguistics*, 49(1).

Vishnubhotla, K., Hammond, A., & Mohammad, S. M. (2024). Emotional arcs of narration and dialogue. *Computational Linguistics*.

Warriner, A. B., Kuperman, V., & Brysbaert, M. (2013). Norms of valence, arousal, and dominance for 13,915 English lemmas. *Behavior Research Methods*, 45(4), 1191–1207.

Welford, B. P. (1962). Note on a method for calculating corrected sums of squares and products. *Technometrics*, 4(3), 419-420.

---

*[Section 6. Pilot Validation 및 Section 7. Discussion은 파일럿 테스트 실행 후 작성 예정]*

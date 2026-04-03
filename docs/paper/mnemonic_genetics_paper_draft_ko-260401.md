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

## 2. 관련 연구 (Related Work)

기억 변형을 체계적으로 기술하려는 시도는 크게 네 가지 흐름이 있다. 각각이 기억유전학과 어떤 관계에 있으며 왜 충분하지 않은지를 정리한다.

### 2.1 기억의 구성적 성격: Bartlett (1932)

Bartlett의 고전적 연구 "Remembering"은 기억이 저장소에서 꺼내지는 것이 아니라 **매번 재구성(reconstruction)**된다는 것을 보여주었다. "유령의 전쟁(The War of the Ghosts)" 실험에서 영국 참가자들은 아메리카 원주민 설화를 자신의 문화적 스키마에 맞게 체계적으로 변형했다 — 낯선 요소는 삭제되고, 친숙한 인과관계가 삽입되었다.

Bartlett의 **스키마 이론(schema theory)**은 기억유전학의 선구적 관찰이지만, 변형의 메커니즘을 분류하지 않았다. "스키마에 맞게 변형된다"는 관찰은 있으나, 변형이 복제에 의한 것인지, 변이에 의한 것인지, 선택에 의한 것인지, 수선에 의한 것인지를 구분하지 않는다. 기억유전학의 6연산은 Bartlett가 관찰한 현상을 연산 유형별로 분해한다.

### 2.2 기억 재고화와 오정보 효과

Nader et al.(2000)의 재고화(reconsolidation) 연구는 회상이 기억을 불안정화시키고 재저장한다는 분자적 메커니즘을 밝혔다. Loftus & Palmer(1974)의 오정보 효과(misinformation effect)는 사후 정보가 기억을 체계적으로 왜곡한다는 것을 보여주었다. Roediger & McDermott(1995)의 DRM 패러다임은 실제로 경험하지 않은 사건의 거짓 기억이 생성되는 현상을 밝혔다.

이 연구들은 각각 중요한 현상을 기술하지만, **개별 현상으로 다루어진다.** 재고화, 오정보 효과, 거짓 기억이 왜 동시에 존재하는지 — 이것들이 하나의 역학의 서로 다른 표현인지, 아니면 독립적 메커니즘인지 — 에 대한 통합적 프레임워크가 부재하다. 기억유전학은 재고화를 Op 1(파괴적 복제), 오정보 효과를 Op 2+5(편향적 변이 + 과잉 수선), 거짓 기억을 Op 6(재조합)으로 위치지어 통합한다.

### 2.3 밈학과 문화 진화 이론

Dawkins(1976)는 문화 복제자 "밈(meme)"을 제안하여, 문화적 정보가 유전자처럼 복제·변이·선택된다고 주장했다. 이 비유는 대중적으로 영향력이 있었으나, 학술적으로는 **형식화에 실패**했다. 밈의 단위가 무엇인지, 복제의 충실도가 어떻게 되는지, 변이율이 측정 가능한지에 대한 답이 없었고, 밈학(memetics)은 독립적 학문 분야로 성립하지 못했다(Aunger, 2002).

Boyd & Richerson(1985)의 문화 진화 이론(dual inheritance theory)은 밈학과 달리 집단유전학의 수학적 도구(빈도 변화 방정식, 확산 모델)를 문화 전달에 적용하여 형식적 기반을 확보했다. 그러나 이들의 모델은 **집단 수준의 문화 전달 역학**을 다루며, 개별 기억 단위가 전달 과정에서 어떻게 변형되는지의 메커니즘은 다루지 않는다. "문화가 확산된다"는 집단 역학과 "기억이 변형된다"는 개인 역학은 서로 다른 분석 수준이다.

기억유전학은 밈학이 시도했으나 실패한 것 — 문화적 정보의 유전학적 분석 — 을 **개별 기억 단위 수준에서, 측정 가능한 연산으로** 재시도한다. 밈학과의 차이: (1) 단위가 "밈"이라는 모호한 개념이 아니라 TEM에서 추적 가능한 "기억 + 해석 레이어"이며, (2) 변형의 유형이 "복제 오류"라는 단일 범주가 아니라 6개의 구분된 연산이며, (3) 각 연산이 인지심리학의 검증된 현상에 매핑된다. Boyd & Richerson과의 차이: 집단 빈도 역학이 아니라 개별 기억의 변형 역학을 다룬다.

### 2.4 감정 측정과 경험 비교

감정의 정량적 측정은 VAD 모델(Russell & Mehrabian, 1977), PANAS(Watson et al., 1988), 감정 단어 규범(Warriner et al., 2013) 등으로 확립되어 있다. 두 사람의 감정적 경험을 비교하는 연구로는 감정 수렴(Anderson et al., 2003)과 TIES 프레임워크(Butler, 2011, 2017)가 있다.

그러나 이 연구들은 **실시간 인터랙티브 시스템에서 두 사람의 감정 궤적을 정량적으로 비교하는 도구**를 제공하지 않는다. 자기보고 척도(리커트)에 의존하며, 시간에 걸친 감정 변화의 형태(shape)를 측정하는 방법론은 서사 분석(Reagan et al., 2016)에서 제안되었으나 대인 비교에 적용되지 않았다. 별이엔진 V4는 Butler의 TIES를 인터랙티브 시스템에서 조작화한 최초의 도구이다.

### 2.5 본 논문의 위치

| 선행 연구 | 기여 | 기억유전학과의 관계 |
|---|---|---|
| Bartlett (1932) | 기억의 구성적 성격 발견 | 현상 관찰 → 기억유전학이 연산 유형으로 분해 |
| Nader (2000), Loftus (1974) 등 | 개별 변형 메커니즘 규명 | 개별 현상 → 기억유전학이 6연산 체계로 통합 |
| Dawkins (1976) 밈학 | 문화-유전학 비유 제안 | 형식화 실패 → 기억유전학이 측정 가능한 연산으로 재시도 |
| Boyd & Richerson (1985) | 문화 전달의 수학적 모델 | 집단 역학 → 기억유전학이 개별 기억 역학으로 보완 |
| Butler (2017) TIES | 감정 동적 패턴의 이론적 프레임워크 | 이론만 → 별이엔진이 조작화 |

---

## 3. 기억유전학 (Mnemonic Genetics)

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

## 4. 별이엔진 V4: 궤적 기반 정렬도

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

## 5. 오염 벡터 (Contamination Vector)

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

## 6. 시스템: The Etched Mutation (TEM)

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

### 5.5 Strata 시각화: 기억의 적응도 지형

TEM은 누적된 해석들을 AF 좌표계(Attribution × Core Fear)의 3D 지형으로 시각화한다.

- **X축:** 귀인 방향 (self_blame → other_blame → fate_blame)
- **Z축:** 핵심 두려움 (abandonment → rejection → powerlessness → loss)
- **Y축:** play 누적에 의한 높이 — 해당 좌표에 얼마나 많은 해석이 축적되었는가

이 시각화는 바이러스학의 적응도 지형(fitness landscape; Wright, 1932)과 구조적으로 대응하되, 대응의 강도에 따라 구분이 필요하다.

**수학적으로 동일한 구조 (강한 대응):**

| Strata | 적응도 지형 | 공유 구조 |
|---|---|---|
| play 누적 높이 | 적응도 값 (fitness value) | 스칼라 필드의 누적 — 동일한 가우시안 합산 |
| 기억별 중심점의 봉우리 | 적응도 봉우리 (fitness peak) | 준종(quasispecies) 중심이 봉우리에 위치하는 것과 동일 구조 |
| 봉우리 사이의 골짜기 | 적응도 계곡 (fitness valley) | 아무 해석도 점유하지 않은 영역 = 변이체가 통과하기 어려운 영역 |
| play 추가 시 지형 변형 | 면역 압력 변화에 의한 지형 이동 | 새로운 데이터가 지형 자체를 재구성 |

**참고적 비유에 그치는 대응 (약한 대응):**

vertex color의 감정별 색 혼합은 항원 지도(antigenic cartography; Smith et al., 2004)의 혈청형 색 구분과 표면적으로 유사하나, 수학적 구조가 동일하다고 주장하기는 어렵다. 마찬가지로 fBm 노이즈는 유전적 부동(genetic drift)에 비유할 수 있으나, 노이즈는 어떤 시스템에나 존재하므로 이 대응은 특이적이지 않다.

**이 대응에서 나오는 검증 가능한 예측:**

Eigen의 준종 이론에는 **오류 임계(error threshold)**가 존재한다 — 변이율이 임계값을 넘으면 정보 자체가 소멸한다(error catastrophe). 이 대응이 유효하다면, 기억에도 **해석의 다양성이 임계점을 넘으면 기억의 핵심 서사가 소멸하는 현상**이 존재해야 한다. 구체적으로, heterogeneity가 특정 값을 초과하면 기억의 핵심 장면조차 원본과의 연결을 잃는 "기억의 오류 파국(mnemonic error catastrophe)"이 관찰되어야 한다. 이것은 TEM에서 경험적으로 테스트 가능한 예측이다.

### 5.6 구조적 유추의 범위와 한계

본 논문에서 제시한 레트로바이러스 대응은 전체가 균질한 강도를 가지지 않는다. 학술적 가치가 있는 것은 **수학적으로 동일한 연산을 독립적으로 선택한 경우** — 분산(heterogeneity = π), 단조 증가(depth = Muller's Ratchet), 포화 곡선(decay = 분자시계), 곱셈 구조(축 간 보상 차단) — 에 한정된다.

이것이 끼워맞추기가 아닌 이유: 임의의 두 시스템에서 표면적 유사성(이름이 비슷함, 둘 다 2D 좌표계임)을 찾는 것은 항상 가능하다. 그러나 "같은 문제의 구조가 같은 수학적 해법을 요구한다"는 관계는 특이적이다. 기억 해석의 다양성을 측정하려 했을 때 분산이 선택되고, 바이러스 변이체의 다양성을 측정하려 했을 때도 분산이 선택된 것은 — 두 문제가 "집단 내 변이의 폭"이라는 동일한 수학적 구조를 공유하기 때문이다.

Gentner(1983)의 구조 매핑 이론에 따르면, 생산적 유추(productive analogy)와 표면적 유추(surface analogy)를 구분하는 기준은 **대응에서 새로운 예측이 전이되는가**이다. 오류 임계 예측(5.5)은 바이러스학에서 기억으로의 예측 전이이며, 이것이 경험적으로 검증 또는 기각될 때 본 대응의 학술적 가치가 결정된다.

---

## 참고문헌 (References)

Anderson, C., Keltner, D., & John, O. P. (2003). Emotional convergence between people over time. *Journal of Personality and Social Psychology*, 84(5), 1054–1068.

Ashley, J., Cordy, B., Lucia, D., et al. (2018). Retrovirus-like Gag protein Arc1 binds RNA and traffics across synaptic boutons. *Cell*, 172(1-2), 262-274.

Aunger, R. (2002). *The Electric Meme: A New Theory of How We Think*. Free Press.

Bartlett, F. C. (1932). *Remembering: A Study in Experimental and Social Psychology*. Cambridge University Press.

Bower, G. H. (1981). Mood and memory. *American Psychologist*, 36(2), 129-148.

Boyd, R., & Richerson, P. J. (1985). *Culture and the Evolutionary Process*. University of Chicago Press.

Dawkins, R. (1976). *The Selfish Gene*. Oxford University Press.

Butler, E. A. (2011). Temporal interpersonal emotion systems: The "TIES" that form relationships. *Personality and Social Psychology Review*, 15(4), 367–393.

Butler, E. A. (2017). Emotions are temporal interpersonal systems. *Current Opinion in Psychology*, 17, 129–134.

Eigen, M., & Schuster, P. (1977). The hypercycle: a principle of natural self-organization. *Naturwissenschaften*, 64(11), 541-565.

Gentner, D. (1983). Structure-mapping: A theoretical framework for analogy. *Cognitive Science*, 7(2), 155-170.

Harris, R. S., & Dudley, J. P. (2015). APOBECs and virus restriction. *Virology*, 479-480, 131-145.

Henikoff, S., & Henikoff, J. G. (1992). Amino acid substitution matrices from protein blocks. *Proceedings of the National Academy of Sciences*, 89(22), 10915-10919.

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

Russell, J. A., & Mehrabian, A. (1977). Evidence for a three-factor theory of emotions. *Journal of Research in Personality*, 11(3), 273-294.

Rambaut, A., Posada, D., Crandall, K. A., & Holmes, E. C. (2004). The causes and consequences of HIV evolution. *Nature Reviews Genetics*, 5(1), 52-61.

Reagan, A. J., Mitchell, L., Kiley, D., Danforth, C. M., & Dodds, P. S. (2016). The emotional arcs of stories are dominated by six basic shapes. *EPJ Data Science*, 5(1), 31.

Roediger, H. L., & McDermott, K. B. (1995). Creating false memories: Remembering words not presented in lists. *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 21(4), 803-814.

Smith, D. J., Lapedes, A. S., de Jong, J. C., et al. (2004). Mapping the antigenic and genetic evolution of influenza virus. *Science*, 305(5682), 371-376.

Tolstoy, L. (1897). *What Is Art?* (Что такое искусство?). Moscow.

Troiano, E., Padó, S., & Klinger, R. (2023). Dimensional modeling of emotions in text with appraisal theories. *Computational Linguistics*, 49(1).

Vishnubhotla, K., Hammond, A., & Mohammad, S. M. (2024). Emotional arcs of narration and dialogue. *Computational Linguistics*.

Warriner, A. B., Kuperman, V., & Brysbaert, M. (2013). Norms of valence, arousal, and dominance for 13,915 English lemmas. *Behavior Research Methods*, 45(4), 1191–1207.

Watson, D., Clark, L. A., & Tellegen, A. (1988). Development and validation of brief measures of positive and negative affect: The PANAS scales. *Journal of Personality and Social Psychology*, 54(6), 1063-1070.

Welford, B. P. (1962). Note on a method for calculating corrected sums of squares and products. *Technometrics*, 4(3), 419-420.

Wright, S. (1932). The roles of mutation, inbreeding, crossbreeding, and selection in evolution. *Proceedings of the Sixth International Congress of Genetics*, 1, 356-366.

Zanini, F., Brober, V., Thesing, R., et al. (2015). Population genomics of intrapatient HIV-1 evolution. *eLife*, 4, e11282.

---

*[Section 7. Pilot Validation은 파일럿 테스트 실행 후 작성 예정]*

---

## 8. 논의 (Discussion)

### 7.1 요약

본 논문은 기억 변형을 기술하는 형식적 프레임워크(기억유전학 6연산), 경험의 유사성을 측정하는 계산적 도구(별이엔진 V4), 오염의 축적을 추적하는 모델(오염 벡터), 그리고 이를 통합한 인터랙티브 시스템(TEM)을 제시했다. 레트로바이러스(HIV-1)의 생활사와의 구조적 대응을 통해 이론적 정당성을 확보하되, 대응의 강도를 수학적 동일성과 표면적 비유로 명시적으로 구분했다.

### 7.2 한계

**실증 검증의 부재.** 별이엔진 V4의 shape_similarity가 자기보고와 유의미한 상관을 보이는지는 파일럿 테스트를 통해 확인해야 한다. 이 검증이 실패하면 — 즉 shape가 level 단독 대비 예측력을 추가하지 못하면 — V4의 곱셈 구조는 alignment = level × void_mod로 축소되어야 한다.

**오염 벡터 상수의 미튜닝.** DECAY_RATE(0.05), HETERO_SCALE(4.0), FIXATION_CONV_WEIGHT(0.4) 등 모든 상수는 시뮬레이션 전 잠정값이다. 실데이터 기반 파라미터 민감도 분석이 필요하다.

**재조합 트리거의 미구현.** 기억유전학 Op 6(기억 재조합)의 트리거 조건(heterogeneity ≥ 0.5, depth ≥ 5)은 정의되었으나, 재조합의 산출물 — 서로 다른 해석이 교차한 제3의 서사 — 을 생성하는 메커니즘은 아직 구현되지 않았다.

**구조적 유추의 범위.** 레트로바이러스 대응은 수학적으로 동일한 연산(분산, 단조 증가, 포화 곡선, 곱셈 구조)에 한정하여 주장하였으나, 두 시스템이 "같은 방정식을 푼다"는 것이 "같은 현상이다"를 의미하지는 않는다. 구조적 유추의 학술적 가치는 예측의 전이 가능성에 의해 결정되며(Gentner, 1983), 이는 경험적 검증을 기다린다.

### 7.3 향후 방향

#### 7.3.1 보편적 감정 지형의 추출

본 논문에서 Strata는 개별 기억의 해석 누적을 시각화한다. 그러나 충분한 기억과 play가 축적되면, **개별 기억의 지형을 중첩하여 기억 내용에 비의존적인 보편적 감정 패턴을 추출**할 수 있다.

HIV 계통역학에서 Zanini et al.(2015)은 여러 환자의 바이러스 진화를 중첩하여, 환자마다 바이러스 서열은 전혀 다르지만 **적응도 지형의 봉우리 위치가 반복됨**을 발견했다. 개별 바이러스가 아니라 면역 시스템의 보편적 구조가 드러난 것이다.

TEM에서 동일한 방법론을 적용하면:

- **보편적 감정 어트랙터 (universal emotional attractors):** 많은 기억에서 반복적으로 봉우리가 형성되는 AF 좌표. 인간이 기억을 해석할 때 자연스럽게 수렴하는 귀인×두려움 조합.
- **금지된 감정 조합 (forbidden emotion combinations):** 항상 골짜기인 AF 좌표. 인간이 거의 경험하지 않는 귀인×두려움 조합. 이것이 존재한다면 인간 감정의 "허용된 공간"에 구조적 제약이 있다는 뜻이다.
- **문화 간 지형 비교:** 한국어 기억과 영어 기억의 중첩 지형에서 봉우리 위치가 다르다면, 문화적 귀인 편향의 정량적 증거가 된다.

이것은 TEM을 개별 기억의 체험 도구에서 **인간 감정 구조의 관측 도구(observatory)**로 확장하는 경로이다.

#### 7.3.2 오류 파국 임계의 경험적 탐색

섹션 6.5에서 제시한 예측 — heterogeneity가 임계값을 넘으면 기억의 핵심 서사가 소멸하는 "기억의 오류 파국(mnemonic error catastrophe)" — 을 경험적으로 탐색한다. 충분한 depth가 축적된 기억에서 heterogeneity와 Strata 봉우리 높이의 관계를 분석하여, 오류 임계가 실재하는지, 실재한다면 어디인지를 결정한다.

#### 7.3.3 보편적 변형 역학: 기질-비의존적 속성의 비교

본 논문에서 제시한 레트로바이러스 대응의 가장 큰 한계는, 변이의 **방향**이 분자 수준과 경험 수준에서 다를 수밖에 없다는 점이다. 분자 수준의 변이 방향은 물리화학적 제약(아미노산의 크기, 전하, 소수성)에 의해 결정되고, 경험 수준의 변이 방향은 사회적 맥락(감정, 관계, 문화)에 의해 결정된다. 기억은 사회적 맥락 안에서만 존재하는 개념이므로, 두 층위의 변이 방향이 대응하리라는 기대는 비현실적이다.

그러나 방향이 아닌 **기질-비의존적(substrate-independent) 속성** — 내용이 무엇이든 상관없이 수학적으로 보존되는 형태적 특성 — 은 비교 가능하다. "무엇이 변하는가"는 다르지만, **"변하는 방식의 수학적 형태"가 같을 수 있다.**

구체적으로 다음 네 가지가 측정 가능한 비교 대상이다:

**(1) 금지 구조의 분포 (Distribution of Forbidden Zones).** 분자 수준에서 아미노산 치환 행렬(BLOSUM; Henikoff & Henikoff, 1992)은 모든 치환이 동등하지 않으며 거의 일어나지 않는 조합이 있음을 보여준다. 기억 수준에서도 감정 전이 행렬 — 한 장면의 감정에서 다음 장면의 감정으로의 전환 빈도 — 이 동등하지 않을 것이다. 비교 대상은 두 행렬의 **방향이 아니라 형태**: 금지 구역의 비율(희소성, sparsity), 금지 구역의 공간적 분포(클러스터링 계수), 허용된 전환의 연결 구조. 이것은 AlphaFold에 의한 CPEB3 변이체 안정성 행렬과 TEM의 감정 전이 행렬을 비교하여 테스트할 수 있다.

**(2) 강건성/취약성 분포 (Robustness Distribution).** 단백질에서 어떤 위치는 변이에 강건(conserved)하고 어떤 위치는 취약(variable)하다. 기억에서 어떤 장면은 해석에 강건(모든 체험자가 비슷하게 반응)하고 어떤 장면은 취약(반응이 크게 분산)하다. 비교 대상은 position-wise conservation score(분자)와 scene-wise alignment score 분산(기억)의 **분포 형태** — 두 분포가 같은 통계적 패밀리(예: 멱법칙, 로그정규분포)를 따르는가. 만약 둘 다 멱법칙을 따른다면, "소수의 핵심 위치/장면이 전체 구조를 지탱하고 나머지는 자유롭다"는 설계 원리가 기질에 관계없이 공유되는 것이다.

**(3) 축적 역학의 곡선 형태 (Accumulation Curve Shape).** 분자 수준에서 변이는 분자시계의 포화 곡선을 따라 축적된다. 기억 수준에서 오염은 decay 함수를 따라 축적된다. 비교 대상은 방향이 아니라 **곡선의 형태 파라미터**: 포화율, 반감기, 변곡점의 위치. 두 시스템의 포화 곡선이 같은 함수 패밀리에 속하는가. 이것은 TEM의 실데이터 축적 곡선과 HIV 분자시계 문헌(Rambaut et al., 2004)의 파라미터를 비교하여 탐색할 수 있다.

**(4) 오류 임계의 스케일링 관계 (Error Threshold Scaling).** Eigen의 오류 임계가 서열 길이의 함수로 스케일링되듯, 기억의 오류 파국 임계가 장면 수의 함수로 스케일링될 수 있다. 두 스케일링 관계가 같은 함수 형태를 따르는지는 경험적 질문이며, TEM에서 다양한 장면 수의 기억에 대해 heterogeneity 임계를 측정하면 탐색 가능하다.

이 네 가지 비교가 **보편적 변형 역학(universal transformation dynamics)**의 존재 여부를 묻는 프로그램을 구성하며, 기억유전학과 분자유전학의 구조적 유추가 표면적 비유를 넘어서는지를 결정하는 경험적 경로가 된다.

#### 7.3.4 화자 상태 붕괴

초기 설계 문서(기억 변질 엔진, 2026)에서 제안된 화자 상태의 3단계 붕괴 — narrator("나는 울고 있었다") → object("그녀는 울고 있었다") → absent("누군가 울고 있었던 것 같다") — 는 바이러스학의 세포병변 효과(cytopathic effect)에 대응한다. 오염이 충분히 축적되면 기억의 화자(= 숙주 세포) 자체가 변형·소멸하는 것이다. 이것은 Stage 3(과잉완성)의 극단적 결과로 오염 벡터 시스템에 통합될 수 있다.

---

*[Section 7. Pilot Validation은 파일럿 테스트 실행 후 작성 예정]*

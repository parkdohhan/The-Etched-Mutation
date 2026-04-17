# Track A — TEM 시스템 논문 아웃라인

> **작성일**: 2026-04-18
> **목적**: 2026-04-18 결정(TEM과 기억유전학 분리)에 따른 시스템 논문 드래프트 골격.
> **모체 문서**: [docs/paper/mnemonic_genetics_paper_draft_ko-260403.md](./mnemonic_genetics_paper_draft_ko-260403.md) (통합 접근). 본 outline은 그 중 시스템/메트릭 부분만 떼어내 재구성.

---

## 0. 메타

### 0.1 포지셔닝

**이 논문은:**
- 작동하는 인터랙티브 서사 시스템(TEM) + 체험자 감정 궤적의 정량 지표 두 개를 제시하는 **시스템/HCI 논문**.
- 정서컴퓨팅과 상호작용 서사학 사이에서 **체험자와 작가의 감정 궤적 발산을 측정·렌더링하는 기계**로 포지션.

**이 논문이 아닌 것:**
- 기억유전학을 증명하지 않음.
- Quasispecies ODE 수학적 매핑 없음 (박사 때).
- 레트로바이러스 / HIV 계통역학 언급 없음 (기억유전학 측 트랙으로 이관).

### 0.2 타겟 venue (우선순위)

1. **ICIDS** (International Conference on Interactive Digital Storytelling) — 가장 문화적으로 맞음. Full paper 12p, short paper 6p. 시스템 demo trail도 있음.
2. **CHI PLAY** — interactive experience 메트릭 쪽 관심 있음.
3. **IEEE Transactions on Affective Computing** — 메트릭(contamination drift/fixation)을 주 기여로 올리면 가능. 저널이라 호흡 김.
4. **ACII** (Affective Computing and Intelligent Interaction) — 메트릭 쪽.

**1차 타겟 제안**: ICIDS full paper. TEM의 작품성과 메트릭을 함께 평가받을 수 있는 유일한 학회.

### 0.3 기여 문장 (1~2줄)

> We present The Etched Mutation (TEM), an interactive narrative system in which scene access is driven by the reader's emotional trajectory rather than explicit branching, and introduce two computable metrics — **trajectory alignment** and **contamination (drift/fixation)** — that quantify how reader interaction diverges from an author's intended affective path. We demonstrate the system with [N] authored memories and [M] simulated reader trajectories, showing that the metrics distinguish echo-following from contradicting reader styles.

---

## 1. Introduction

### 1.1 문제 설정
- 상호작용 서사는 독자마다 경험이 다르도록 설계되지만, **그 "다름"을 정량화하는 도구가 빈약**함.
- 기존 상호작용 서사 도구(Twine, Ink)는 플롯 분기만 추적. 감정 축 측정 없음.
- 정서컴퓨팅은 감정 상태 *인식*에 집중. 서사 구조를 따라 흐르는 **감정 궤적의 대인 비교 도구 부재**.

### 1.2 연구 질문
- (R1) 플롯 분기 없이 **감정 궤적**만으로 작동하는 서사 접근 모델이 가능한가?
- (R2) 체험자와 작가 원본의 감정 궤적 **발산 양상**을 정량 지표로 구분할 수 있는가? 특히 서로 다른 발산 **양식**(drift vs fixation)을 분리할 수 있는가?
- (R3) 공명(작품 핵심 정서에 도달)에 이른 체험자의 궤적이 다음 체험자를 위한 **해석 조각**으로 자동 변환되는 메커니즘이 구현 가능한가?

### 1.3 기여
- **C1.** TEM — 작동하는 상호작용 서사 시스템. 감정 궤적 기반 scene 접근 + 3D affective landscape + reader-generated trajectory bridges.
- **C2.** **Trajectory alignment** — 체험자 감정 벡터 시퀀스와 작가 원본 시퀀스의 실시간 형태 유사도 지표 (별이엔진 V4).
- **C3.** **Contamination metrics (drift / fixation)** — 궤적 발산을 두 가지 분리 가능한 양식으로 측정하는 지표.
- **C4.** Persona-sim 데이터셋 ([N]명 페르소나 × [M] 플레이)으로 메트릭 타당성 시범 검증.

### 1.4 기억유전학 계보 (1단락만)
"TEM의 내부 용어(contamination, echo, bridge)는 저자가 별도로 발전시킨 개념적 관점에서 유래한다. 본 논문은 그 관점의 정당성은 다루지 않으며, 시스템과 메트릭을 각자의 계산적·체험적 메리트로 평가한다."
*— 한 단락, 각주 한두 개. 논문 무게 중심이 여기에 오지 않게.*

---

## 2. Related Work

### 2.1 Interactive Narrative
- Janet Murray (1997) *Hamlet on the Holodeck*
- Marie-Laure Ryan — multi-path narrative
- Espen Aarseth (1997) *Cybertext* — ergodic literature
- **저작 도구**: Twine, Ink (Inkle), Articy:Draft — 모두 명시적 분기 / 상태 머신
- **학술 시스템**: StoryAssembler, Versu — rule-based
- 공통 한계: 감정 축이 서사 상태의 1차 차원으로 존재하지 않음

### 2.2 Affective Computing & Emotional Trajectories
- VAD (Russell & Mehrabian 1977), PANAS (Watson et al. 1988)
- Butler (2011, 2017) TIES
- Butler et al. (2017) **CompTIES** — coupled oscillator, 사후 분석 전용
- Reagan et al. (2016) — 서사 감정 arc의 6 shape
- 한계: 실시간 인터랙티브 환경에서 체험자-원본 궤적 비교 도구 부재

### 2.3 Reader Traces in Interactive Media
- **Soulsborne 메시지 시스템** (FromSoftware) — 궤적 브릿지의 가장 가까운 형태
- **hypothes.is** — 웹 주석
- **Genius.com** — 주석 플랫폼 (단, 인기도 정렬 문제)
- **stately.ai/viz** (XState Visualizer) — UI 문법 참조
- 공통 한계: 공간적 / 인기도 기반이지 **감정 궤적 기반**이 아님

### 2.4 본 논문의 위치

| 선행 | 기여 | TEM과의 관계 |
|---|---|---|
| Twine/Ink | 명시적 분기 저작 | 분기 없이 감정 궤적만으로 동작 |
| TIES/CompTIES | 감정 동적 패턴 사후 분석 | 실시간 인터랙티브로 확장 |
| Soulsborne | 플레이어 궤적 메시지 | 공간→감정 축으로 전이 + 자동 생성 |
| Reagan (2016) | 서사 arc 6 shape | 대인 비교 메트릭으로 확장 |

---

## 3. TEM System

### 3.1 개요
- 작품으로서의 The Etched Mutation: 기억을 기록하고(record) 타인의 기억을 체험하는(play) 인터랙티브 서사 시스템
- 공개 URL / 빌드 / 스택 간략 (Three.js, Supabase, vanilla JS, HRTF 공간음향)

### 3.2 데이터 모델
- **memory**: 작가가 기록한 기억. 씬 배열 + 메타.
- **scene**: 본문 + emotion_vector (8축) + echo_words + anchor_emotions + motif_tags
- **choice**: 씬 내 선택지 — **감정 결만 기록**. next_scene_id 없음.
- **accessiblePinIds**: 매 턴 궤적 엔진이 계산하는 접근 가능 씬 집합
- **trajectory_bridge**: 공명 도달자의 궤적 자동 변환물

*(기존 CLAUDE.md 표를 논문 Table 1로 정리)*

### 3.3 감정 궤적 기반 Scene Navigation
- 참조: [docs/SceneNavigator_설계_v1-260329.md](../SceneNavigator_설계_v1-260329.md)
- 참조: [docs/play-test-지도_핀_접근규칙-260325.md](../play-test-지도_핀_접근규칙-260325.md)
- 매 턴 체험자 감정 상태 → 접근 가능 핀 계산 → 작가가 명시 분기를 쓰지 않아도 개인화된 경로 생성

### 3.4 Strata — 3D Affective Landscape
- VAD 투영 + AF(Attribution × Core Fear) 좌표
- 씬 pin 배치 + 등고선 + HRTF 공간음향 (spatialAudio.js)
- 참조: [docs/시각화_설계_v1-260412.md](../시각화_설계_v1-260412.md)

### 3.5 Trajectory Bridges (reader-generated interpretive fragments)
- 공명 엔딩 도달 → 체험자 궤적 자동 변환 → 다음 체험자에게 노출
- 참조: [docs/데이터계약_브릿지_v1-260412.md](../데이터계약_브릿지_v1-260412.md)
- 작가 브릿지(author_bridge)와의 공존

### 3.6 Architecture 요약 (그림 1)
- Engine → ContaminationTracker → SceneNavigator → Renderer 흐름도
- 기존 `docs/TEM_시스템_매뉴얼-260410.md` 다이어그램 활용

---

## 4. Metrics

### 4.1 Trajectory Alignment (별이엔진 V4)
- 참조: [docs/별이엔진_V4-궤적기반_정렬도-260327.md](../별이엔진_V4-궤적기반_정렬도-260327.md)
- 수식: 체험자 감정 시퀀스 {u_t} 와 원본 시퀀스 {o_t}의 형태 유사도 (코사인 시퀀스 합성)
- 논문에서 쓸 언어: **"affective trajectory alignment"**
- (기억유전학 용어 "정렬도"는 유지하되 매핑 주장 없이 기술)

### 4.2 Contamination — Drift & Fixation
- 참조: [docs/오염벡터_계산_구현_명세_v2-260327.md](../오염벡터_계산_구현_명세_v2-260327.md)
- **Drift**: 체험자 궤적이 작가 원본에서 방향적으로 이탈하는 누적량
- **Fixation**: 특정 감정/귀인에 과도하게 머무는 정도 — 기획서 §8.3 3-way 복합 신호 (emotion similarity + attribution repetition + exploration rate)
- 둘은 **발산 양식이 다름** (drift는 방향 이탈, fixation은 단일점 수렴)

### 4.3 왜 두 축인가
- 동일 저발산량이라도 drift-dominant vs fixation-dominant가 체험적으로 구분됨
- 렌더링(contamination stage 텍스트) 조건에 쓰임 — drift 높으면 text_stage_2/3 편향, fixation 높으면 NPC 독백 트리거

### 4.4 메트릭의 속성
- **결정론적**: 동일 궤적 입력 → 동일 출력 (단위 테스트 존재, `test/unit/` 참조)
- **실시간**: 매 턴 계산 가능, O(#scenes) 이하
- **한계**: 감정 벡터 할당이 작가 자기보고 — 독립 측정 아님 (§7 Limitations에서 논의)

---

## 5. Implementation

- 스택 요약: vanilla JS ES6 modules, Three.js (strata), Supabase (auth/DB/edge functions), HRTF via Web Audio API
- 모듈 맵: engine / contamination / sceneNavigator / strataView / afterimage / spatialAudio
- 코드 규모: [LOC 수], 회귀 테스트 [벡테스트 수] 케이스 (vitest)
- 오픈 리포지토리 여부 (TBD)

---

## 6. Evaluation

### 6.1 Persona Simulation 방식
- 참조: `tools/persona-sim/` 파이프라인
- Big Five 페르소나 → LLM이 각 씬 응답 생성 → plays 테이블 기록
- 현 데이터: **MM23L 193 plays / E-004 100 plays / 공통 15 personas**

### 6.2 가설 H1 — 지표의 분리 타당성
- 서로 다른 페르소나 전략(echo-follow 지향 vs contradiction 지향)이 drift / fixation 축에서 **통계적으로 구분되는가**
- 분석: 페르소나 특성 (e.g., Openness, Neuroticism) vs 최종 drift/fixation 분포 상관
- 예상 결과: echo-follow 페르소나는 낮은 drift / 낮은 fixation 근처 군집, contradiction 페르소나는 높은 drift

### 6.3 가설 H2 — Trajectory Alignment의 궤적 형태 민감도
- 동일 수준(level)이지만 다른 형태(shape)의 두 궤적이 alignment에서 구분되는가
- Reagan의 arc shape 6종을 페르소나에 주입 → alignment 출력 분포

### 6.4 질적 예시 (1~2 케이스)
- 특정 페르소나 한 명의 궤적 + scene navigator 경로 + 생성된 trajectory_bridge 실제 예시

### 6.5 무엇을 평가하지 않는가 (솔직히)
- 실제 인간 체험자 N명 평가 연구는 본 논문 범위 밖 — 향후 IRB 연구 별도.
- 페르소나 시뮬은 **메트릭의 계산적 타당성** 증거이지, **실제 체험자 행동** 증거 아님. 이 점 논문에 명시.

---

## 7. Discussion & Limitations

### 7.1 기여의 범위
- 메트릭은 **시스템 내부 일관성** 및 **페르소나 시뮬** 수준에서 타당성 확보. 외부 임상/심리 측정과의 수렴 타당성은 별도 연구 필요.
- TEM은 **작품이자 연구 인프라** — 재현성은 오픈 리포지토리로 확보하되, 작품 의도와 과학적 주장을 혼동하지 않도록 명시.

### 7.2 한계
- 감정 벡터 부여가 작가 자기보고 → 감정 원본의 "ground truth" 지위가 약함 (향후 독립 rater, 또는 복수 작가 교차 검증 필요)
- persona-sim은 LLM 기반 → LLM의 감정 모델 편향이 결과에 유입
- 공명(resonance) 판정 기준이 현재 heuristic — 임계값 민감도 분석 부재

### 7.3 향후 작업
- 실제 체험자 연구 (IRB + N=50 규모)
- 공명-기반 자동 브릿지의 curation 피드백 (현재 autoapprove)
- **별도 트랙**: 기억유전학 개념 틀에서 본 메트릭의 이론적 근거화 (이 논문 스코프 밖, 저자의 별도 작업물에서 다룸)

---

## 8. Ethics

- 체험자 감정 입력은 민감 데이터 — 동의 모델 (confession.js `consentLine`)
- PII 필터링 (잔상 17종 케이스, `test/unit/piiFilter.test.js`)
- 안전 설계 — trigger word 에스컬레이션 (§23 해결됨)
- 궤적 브릿지 자동 공개의 익명성 보장 방식

---

## 9. Conclusion
- 감정 궤적이 상호작용 서사의 1차 차원이 될 수 있음을 시스템·메트릭·데모의 3층으로 보였다.
- 기여는 형식적 증명이 아니라 **작동하는 개방형 시스템 + 재사용 가능한 메트릭**.

---

## Appendix (계획)

- A. Supabase 스키마 전문
- B. 페르소나 prompt 템플릿
- C. 메트릭 수식 전체
- D. E-004 「편지」 샘플 궤적 비교 (한 페르소나 정독)

---

# Scope 경계선 (절대 넘지 않을 것)

본 논문이 **포함하지 않는** 것 — 넘으려 할 때마다 이 목록 확인:

- ❌ 레트로바이러스 / HIV / Arc 단백질 / Pastuzyn et al.
- ❌ 6연산 체계 (복제·변이·선택·번역·수선·재조합) 이론 서술
- ❌ Quasispecies ODE / 집단유전학 수학
- ❌ AF(AlphaFold) / 분자 구조 예측
- ❌ "TEM은 기억유전학을 구현한다" 류 주장
- ❌ 이본론 전체 철학 전개 (각주 1~2줄 계보 언급까지만)

위 항목들은 **Track B (기억유전학 이론 작업)** 또는 **박사논문**에서 다룸.

---

# 미결정 항목 (저자 결정 필요)

1. **제목 — 기억유전학 단어 쓸 것인가**
   - 옵션 A: 완전 배제 — "The Etched Mutation: An Affective Trajectory System for Interactive Narrative"
   - 옵션 B: 부제에 최소 언급 — "The Etched Mutation: Measuring Emotional Trajectory Divergence in Interactive Narrative (a system in the mnemonic-genetic tradition)"
   - **권장: A**. 제목에 들어가면 심사자가 biology formalism을 기대함.

2. **Venue 1차 결정** — ICIDS full (12p) vs CHI PLAY full vs IEEE TAC (저널) vs ACII
   - ICIDS가 작품성+메트릭 동시 평가 가능한 유일 venue. 현재 가장 강력한 후보.
   - 2027년 ICIDS CFP 나오면 deadline 역산.

3. **공개 리포지토리 범위** — TEM 전체 오픈 vs 논문 appendix용 slim 버전
   - 작품 본체는 지속 운영 — 커밋 상태 freeze 버전 태그 필요.

4. **페르소나 데이터 공개 범위** — 현재 MM23L/E-004 personas.json은 .gitignore
   - 메트릭 검증 재현성에 필요. 체험 원본(작품 텍스트)과 페르소나 궤적 중 재현성 목적에 꼭 필요한 것만 선별.

5. **인간 체험자 파일럿을 이 논문에 넣을 것인가**
   - 소규모(N=10~15) 파일럿이라도 있으면 accept 확률 크게 오름
   - 단, IRB 시간 + 범위 확장 리스크. 별도 follow-up 논문으로 가는 편이 안전할 수 있음.

---

# 다음 작업 (구체 순서 제안)

1. **§4 메트릭 섹션 먼저 작성** — 가장 형식화가 많고 엄밀성이 요구되는 부분. 이게 통과하면 나머지 방어 쉬움.
2. **§6 평가 — 가설 H1/H2를 지금 persona-sim 데이터로 실제 돌려봄** — 숫자 나와야 논문 쓸 수 있음. Jupyter notebook 한 개.
3. **§2 Related Work 문헌 정리** — 논문 인용 grid 채움. 기존 mnemonic_genetics_draft의 §2에서 감정 측정 / 상호작용 서사 관련 참조만 추림.
4. **§3 시스템 서술** — 기존 문서들에서 텍스트 이관. 원본 참조 링크 유지.
5. **§1 Introduction** — 맨 마지막에. 나머지가 다 써진 후에 1~2페이지로 정제.

# Feedback 정리

> ⚠️ [260716 이본지층] 아래 역사 기록 중 "공명 엔딩 도달 자동 브릿지화"(합의 로그) 등 위계 어휘는 이본지층 설계 v1로 대체됨 (접촉 = 여정 중 겹치는 드문 사건, 승리 아님). 정본: docs/이본지층/이본지층_설계_v1-260716.md

## ✅ 해결됨

1. play/archive 에서 입력하고 나서 분석중이 뜨니까 밑에 지형선이 반짝거리든 말든 입력중...을 기다리게 된다. 입력 화면 위치에 지형클릭 유도 메세지가 뜨는게 맞다
2. "울었었나. 아닌것같은데" 이런 echo 문장이 "왜 나왔는지" 사용자가 알수가없다
3. 위에 있는 파동이 너무 시선강탈이라 지형에 시선이 안간다
4. 남의 기억을 플레이 하는데 내가 뭐라해야할지 모르겠다. 내 기억이 아닌데 내 기억을 회상하는 것처럼 말하니까 위화감이 든다.
5. 전이 방식에 따라 Unlock 된 기억을 처음 플레이어 입장에서는 왜 unlock 됐는지 모르겠다
7. pin-map 네비게이션 / strata에서 핀이 호버되도 아무정보가 안뜨니까 뭘 해야할지 몰겠다.
9. play/archive에서 이미 체험한 장면/앞으로 봐야할 장면에 대한 핀 구분이 가시적으로 분간이 안된다.
10. 등고선 지도에 있는 핀, 그 핀 옆에 있는샵+숫자가 뭔지 모르겠다
12. strata에서, 내가 플레이한 기억의 핀이 안보인다. → 해결 (사용자 play 마커 글로우 링 추가)
13. 등고선 색깔을 좀 더 진하게 → 해결 (등고선 두 패스 밝기/두께 조정)
17. Leave strata behind / return to menu 작동안함 → 해결 (closeStrataView 폴백 + showMainMenu 수정)
19. Record 에서 문만 덜렁 있으나까 뭔지 모를수있다. Click을 해서 문을 열라고 메세지를 띄워줘야한다.
20. record에서 내 기억을 기록 하는거라고 말을 해줘야된다
21. "그 기억" → "네가 기록하고 싶은 기억 속에서" → 해결 (collect-memory 프롬프트 수정)
23. 안전설계 — 바로 블락 대신 n회차 트리거 → 해결 (시제 감지 + 에스컬레이션)
24. 블락된 상태에서 뒤로가기 버튼 → 해결 (3초 후 복귀 + 컨테이너 정리)
25. 트리거워드 n회 제한 + 시제 기반 블락 → 해결 (#23과 함께)
28. record 플레이에서 앵무새같이 가장 최근의 응답만 반복하니까 흐름이 끊긴다.
30. Record play 후 archive 에 저장안됨 → 해결 (비회원 curator_id=null 저장)
31. 한국어 영어 전환이 제대로 안된다 → 해결 (getCurrentLanguage)
32. Play 메뉴에서 뒤로가기 안됨
33. archive 검색메뉴를 코드로 검색 → 해결 (제목 기준 검색)
34. 메인메뉴 타이틀/메뉴 크기 50퍼는 키워야한다.
35. PLAY/ARCHIVE 통합 → 해결 (맞춤 기억 찾기 시퀀스 + 직접 찾아보기)
36. Record 뒤로가기 시 LIVE role 선택 화면 뜸 → 해결 (showMainMenu → introScreen 직접 표시)
37. Profile 뒤로가기 버튼 없음 → 해결
14. 텍스트 오염의 방식에 대해서 오류라고 생각할수도 있을여지가 있다. → 해결 (Edge Function v2 + auto stage text generation 파이프라인 연결 완료. 어드민에서 stage 텍스트 확인 필요.)
16. strata에서도 내가 플레이한 흔적을 보고싶다 → 해결 (사용자 play 마커 추가 완료. 호버 시 상세 정보는 후순위.)
22. 기억 기록 유도 질문 프롬프트를 고쳐야됨 → 해결 (Record Flow V3: AI에게 채워진/빈 요소 상태를 매 턴 주입 → 구조적 근거 있는 질문)
26. record 플레이는 행동의 나열이 된다 → 해결 (Record Flow V3: Phase A 감각 무대에서 출발 → 감각 서술 유도 + AI가 행동 나열 감지 시 감각 질문 전환)
27. 장면을 실제로 만드는 경험을 만들어줘야한다 → 해결 (Record Flow V3: Phase B 구성요소 실시간 시각화, 이중 레이어 감지)
29. 감정의 고저차가 없는 기억의 궤적 문제 → 해결 (Record Flow V3: 감정 외 4종 요소(장소/인물/사물/신체감각)가 장면 구성 축, 감각 축에서 풍부함 가능)

---

## 🎬 유튜브 데모 전 수정 목록 (2026-04-05)

### 3. Play Flow 개선

#### 3-2. 사운드 레이어 개선
- [ ] 3-2a. 오염 단계(biased/hypercompletion)에 따른 사운드 변화 연결 — 현재 bucket만 반응
- [ ] 3-2b. 장면 전환 시 crossfade 자연스러운지 확인
- [ ] 3-2c. 안개(clarity) 짙어질 때 사운드 볼륨/필터 연동 검토
- [ ] 3-2d. 기존 음원 파일(amb_window_rain, amb_silence, amb_crowd, amb_wind, amb_base) 매핑 점검

#### 3-3. 프롬프트 개선
- [ ] 3-3a. contaminate-text Edge Function 프롬프트 품질 검증 — 실제 생성 결과물 5개 이상 확인
- [ ] 3-3b. biased_inclination stage 텍스트: "편향이 느껴지는가?" 수준의 미묘함 확인
- [ ] 3-3c. hypercompletion stage 텍스트: "너무 선명해서 불안한" 느낌 확인
- [ ] 3-3d. NPC 독백(contaminationMonologue) 타이밍 및 문장 품질 확인
- [ ] 3-3e. collect-memory (Record AI 대화) 프롬프트가 V3 설계와 정합한지 확인

### 4. 기억/장면 재구성 및 Admin 연출
- [ ] 4-1. 데모용 기억 1-2개 신규 구성 (장면 3-5개, 감정 벡터 다양하게)
- [ ] 4-2. 각 장면에 echoWords 설정 (anchor로 표시될 키워드)
- [ ] 4-3. 각 장면에 anchor_images 등록 (text/ascii/photo 혼합)
- [ ] 4-4. 사운드맵 설정 (HIGH/MID/LOW/FIXATED 음원 매핑)
- [ ] 4-5. contaminate-text로 stage 1/2/3 텍스트 사전 생성 or 자동 생성 파이프라인 확인
- [ ] 4-6. 오염 데이터가 쌓이도록 테스트 플레이 3-5회 수행
- [ ] 4-7. strata에서 여러 플레이 마커가 보이는지 확인

### 5. 브레인스토밍 대기 → 수정 필요
- [ ] 5-0d. (#38) 맞춤 기억 찾기 칩 카테고리 설계 — 감정 기반 / 상황 기반 / 감각 기반 결정 필요

### 6. 추가 확인 (빠뜨리기 쉬운 것들)
- [ ] 6-1. 모바일 반응형 — Play 화면, anchor, strata가 모바일에서 깨지지 않는지
- [ ] 6-2. 초기 로드 속도 — live.js 동적 import 후 초기 로드 개선 확인
- [ ] 6-4. 영어/한국어 전환 시 전체 flow 정상 동작

---

## 🎯 잔상(afterimage) 시스템 — 내 숙제 (2026-04-10)

설계 문서: `docs/잔상_시스템_설계-260409.md`
DB/코드/admin까지 다 들어감. 이제 내가 할 일만 남음.

### 🔴 최우선
- [ ] **S-1. 시드 코퍼스 본격 작성** — `data/seed_utterances.csv` 에 작가 목소리로 50~100개.
      AI가 쓴 한 줄은 티남. 짧은 파편(3~80자), 진단/해석 금지, 감각/장면/단편만.
      좋은 예: "울었었나. 아닌것같은데" / "그때 그 사람 표정이 아직도"
      나쁜 예: "나는 슬펐다"(해석) / "너 때문에 화가 났어"(대상 명시)
      카테고리 균형: 슬픔/그리움/마비/수치/회한/체감각/공간기억 — 각 5~10개.
      완료 후: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/import_seed_utterances.mjs --replace`

### 🟡 데모 전 확인
- [ ] **S-2. 플레이 테스트 + 매칭 품질 확인** — Record 1회 + Play 3~4회 돌려서 잔상이 어색하게 뜨는지 감 보기. 어색하면 `docs/잔상_시스템_설계-260409.md §6.1` 가중치(키워드×3/감정×2/축×1) 조정.
- [ ] **S-3. 동의 체크박스 카피 확정** — 현재: "이 기억의 조각이 누군가의 장면 끝에 떠올라도 좋다." (`js/app/confession.js` `consentLine`). 톤 판단 필요.
- [ ] **S-4. 잔상 시각 톤 결정** — 임시로 Nanum Myeongjo + 베이지 + fade/typewriter. 영상 찍기 전에 폰트/색/속도 확정. (`js/ui/afterimage.js` 상단 CSS)

### 🟢 영상 데모 관련
- [ ] **S-5. 영상에 잔상 넣을지 결정** — 넣으면 50% 게이트를 임시로 100%로 바꿔야 촬영 가능. 필요하면 "영상 모드 토글" 요청.

### 🗂️ 백로그 (나중에)
- [ ] **S-B1. 잔상 디버그 패널** — 어떤 utterance가 왜 골라졌는지 매칭 튜닝용
- [ ] **S-B2. 사용자 동의 철회 페이지** — `/profile/utterances`
- [ ] **S-B3. afterimage_events 통계** — admin에 잔상 노출/클릭률
- [ ] **S-B4. scene 단위 잔상** — 지금은 엔드스크린에만
- [ ] **S-B5. pgvector 임베딩 매칭 (v2)** — seed 100개 넘으면 의미 있음
- [ ] **S-B6. NPC 독백과 잔상 충돌 정리** — 지금은 둘 다 엔드스크린에서 뜸

---

## 🛠 Web 스택 업그레이드 로드맵 (2026-04-10)

상세 문서: `docs/업그레이드_로드맵-260410.md`
결론: **Unity 안 감.** Tone.js + Three.js 셰이더 + GSAP 세 카드만 6주 분할 도입.
원칙: 데모 영상 끝낸 후에만 도구 도입. 작품 천장은 도구가 아니라 연출 디테일.

### 🔴 Week 1 — GSAP (가장 빠른 ROI)
- [ ] **U-1. 잔상 등장/사라짐 GSAP 재작성** (`js/ui/afterimage.js`)
      안개 뚫고 다가옴 / 글자 무작위 stagger / 미세 떨림 / 클릭 시 사방으로 흩어짐
- [ ] **U-2. 엔드 스크린 GSAP 시퀀스** (`js/app/endScreen.js`)
      카운트업 정렬도 + 영화 엔드 크레딧 식 stagger
- [ ] **U-3. 씬 전환 GSAP** (live.js) — 디졸브 + 휘장 + 줌 (3-step)
- [ ] **U-4. `npm install gsap` + import 정리** (30KB, 무료)

### 🔴 Week 2-3 — Tone.js (사운드가 약점)
- [ ] **U-5. SoundscapeBeta.js 전면 재설계** — Tone.Player + 이펙트 체인
- [ ] **U-6. 오염 단계 → 필터/리버브/디스토션 자동 매핑**
      Stage 0~3에 따라 lowpass/wet/distortion rampTo
- [ ] **U-7. 감정 벡터 → FMSynth 음색 매핑** — fear는 harmonicity 3.5 등
- [ ] **U-8. 잔상 등장 시 한 음** — FMSynth로 톤 한 번
- [ ] **U-9. 씬 전환 사운드** — 페이드 + 공간감 자동 처리

### 🔴 Week 4-6 — Three.js + GLSL 셰이더 (Strata 작품화)
- [ ] **U-10. ShaderMaterial로 교체** (`js/shared/tem_af_strata_terrain.js`)
- [ ] **U-11. 종이 결 노이즈** — `noise(uv * 80.0)` fragment마다 미세 결
- [ ] **U-12. 깊이 그라디언트** — 위는 마름, 아래는 가라앉음 (퇴적층)
- [ ] **U-13. Fresnel 안개** — 가장자리가 시야와 만나면 안개
- [ ] **U-14. 시간 기반 마모** — `u_time` uniform으로 천천히 마모
- [ ] **U-15. 감정별 컬러 매핑** — vertex color로 17감정 × RGB (`EC` 테이블 활용)

### 🟢 미루는 카드
- [ ] **U-B1. WebGPU** — 6개월 뒤 v2 검토. Three.js r170+가 자동 백엔드 지원
- [ ] **U-B2. Rapier.js / Cannon.js** — 물리는 작품 핵심 아님. 거의 안 씀
- [ ] **U-B3. Lottie** — 모션 디자이너 협업 생기면
- [ ] **U-B4. Howler.js** — Tone.js로 흡수됨. 별도 도입 X

### ⚠️ Unity 검토 트리거
다음 중 하나가 명확해질 때만:
- 큐레이터가 "공간 설치 작품"으로 강하게 권유
- VR/XR 컨셉이 작품 메시지를 강화함
- 오프라인 키오스크 작품 의뢰
- Steam/itch.io 출시 의향 (지금 없음)

**원칙**: web 작품과 Unity 작품은 다른 작품으로 분리. 한 작품 안에서 갈아타지 않음.
최소 6개월 web 운영 후 결정. 그 전 시작은 회피 신호.

### ⚠️ 회피 신호 체크리스트 (도구 도입 전 자가진단)
- [ ] 새 도구 학습이 데모 일정을 1주 이상 미루고 있는가?
- [ ] 도구 도입이 **이미 작동하는 코드**를 다시 쓰고 있는가?
- [ ] "이거 하나만 더…" 패턴이 반복되는가?
- [ ] 데모 영상 촬영 일정이 2주째 안 잡히고 있는가?

→ 2개 이상 ✓면 도구 도입 멈추고 데모 마무리.

---

## 📌 TODO — 기획서(매뉴얼)에는 있으나 PLAY에 연결 안 된 것들 (2026-04-11)

> 출처: `docs/TEM_시스템_매뉴얼-260410.md` 대조 검증.
> PLAY 체감에 직접 영향 있는 것 우선. 1→2→3 순으로 진행.

### 🎯 우선순위 A — PLAY 체감에 직접 영향 (즉시 작업)

- [ ] **1. fixation 복합 신호** — §8.3, §18.1
  - 현재: `calculateFixationLevel()`이 감정 코사인 유사도 **하나만** 봄 ([js/shared/math.js:392](../../js/shared/math.js#L392))
  - 기획서: "유사도 > 0.85 + 반복 귀인 + 낮은 탐색률" **3-way 복합**
  - 작업:
    - `calculateFixationLevel(emotionHistory, reasonHistory, explorationRate)` 시그니처 확장
    - `getBucket()`에 컨텍스트 추가 전달
    - `ByeoriEngine.calculateStep()` context에 `reasonHistory` / `explorationRate` 주입 (엔진 내부 로직 변경 금지 — context만 확장)
    - `archive.js` `runEngineStep()`에서 `appStore.userReasons` + `visitedScenes / scenes.length` 전달
  - 판정식(제안):
    ```
    signal_sim   = emotionSim >= 0.85 ? 1 : 0
    signal_attr  = (최근 3개 attribution 중 동일 비율 >= 0.8) ? 1 : 0
    signal_expl  = explorationRate <= 0.3 ? 1 : 0
    fixLevel = 0.5*sim + 0.3*attr + 0.2*expl
    FIXATED if fixLevel >= 0.65
    ```

- [ ] **2. 재조합(6연산 6번) 트리거 + 후속 연출** — §2.3, §10.8
  - 현재: `ContaminationTracker.js`에 `RECOMBO_HETERO_THRESHOLD`/`RECOMBO_DEPTH_THRESHOLD`/`isRecombinationReady` **코드에 아예 없음** (grep 0건)
  - 기획서: `heterogeneity >= 0.5 AND depth >= 5` 시 재조합 활성화
  - 작업:
    - ContaminationTracker에 상수 + `isRecombinationReady` flag 계산 추가
    - PLAY 경로에서 flag true일 때 "다른 기억이 이 장면에 겹쳐진다" 연출 훅 (가장 가벼운 안: 장면 시작 시 잔상 확률 가중)

- [ ] **3. 장면(scene) 단위 잔상** — §13, §18.2
  - 현재: `showAfterimage()` 호출이 `endScreen.js`에만 존재 ([js/app/endScreen.js:188](../../js/app/endScreen.js#L188))
  - 기획서: 씬 종료 후 정적에 확률적 등장 (세션당 최대 2회 유지)
  - 작업:
    - `proceedToNextScene()` 끝에 장면 간 잔상 트리거 지점 추가
    - 세션 카운터로 2회 cap, 게이트 확률은 엔드 스크린보다 낮게(예: 15%)
    - 엔드 스크린 잔상과 중복 회피

### 🟡 우선순위 B — 데이터/Strata (후속)

- [ ] **4. AF 근접 기억의 간섭 억압** — §2.3, §11.5
  - Strata에서 같은 (x,z) 영역의 봉우리끼리 서로를 깎는 로직
  - 파일: [js/shared/tem_af_strata_terrain.js](../../js/shared/tem_af_strata_terrain.js)

- [ ] **5. `telling_trajectory` 컬럼 저장** — §1.1, §18.2
  - 코드 grep 0건. Record 시 말한 순서/흐름이 버려지고 있음
  - 파일: DB 스키마 + [js/app/confession.js](../../js/app/confession.js)

- [ ] **6. 17D ↔ 6D 차원 통일** — §8.6, §18.4
  - 현재 부분 매핑으로 손실. 큰 작업 — 별도 세션에서.

### 🟢 우선순위 C — PLAY 바깥

- [ ] 사용자 동의 철회 페이지 (`/profile/utterances`)
- [ ] 잔상 디버그 패널 / 통계 대시보드

---

## 📋 지금 할 일 (2026-04-11 기준)

### ✅ 완료
- [x] **코어 회귀 테스트 인프라** — vitest 8파일 261테스트, 골든 픽스처 스냅샷 포함
  - [test/unit/pipeline.regression.test.js](../../test/unit/pipeline.regression.test.js) — Engine→Contamination→SceneNavigator 풀 파이프라인
  - [test/unit/contaminationPresenter.test.js](../../test/unit/contaminationPresenter.test.js) — 시드 결정론 + 5종 텍스트 × 4 stage/band
  - [test/unit/safety.test.js](../../test/unit/safety.test.js) — 3단계 필터 + 시제 감지 + 세션 에스컬레이션
  - [test/unit/piiFilter.test.js](../../test/unit/piiFilter.test.js) — 잔상 PII 17종 케이스
  - 스냅샷: [test/unit/__snapshots__/](../../test/unit/__snapshots__/) 960줄
- [x] **GitHub Actions CI** — [.github/workflows/test.yml](../../.github/workflows/test.yml), push/PR 시 자동 `npm test`
---

## 🎯 admin Canvas 통합 프로젝트 (2026-04-12 진행 중)

**목표**: admin을 순차 씬 편집기에서 **궤적 기반 캔버스 에디터**로 재구축.
작가는 등고선 지형 위에 노드를 직접 배치 → 공간 배치가 곧 공간음향/UX 큐레이션이 되는 구조.

### ✅ 완료

- **데이터 계약 v1** ([docs/데이터계약_브릿지_v1-260412.md](../데이터계약_브릿지_v1-260412.md))
  - author_bridge / trajectory_bridge / emotion_entries 스키마
  - 공명 엔딩 도달 자동 브릿지화 합의
- **시각화 설계 v1** ([docs/시각화_설계_v1-260412.md](../시각화_설계_v1-260412.md))
  - 3뷰 분리: 전역 DAG / 국소 그래프 / 의미 비교
- **DB 스키마**: `memories.meta jsonb`, `scenes.meta jsonb`, `trajectory_bridges` 테이블 + RLS
- **E-004 「편지」(박소정)** Supabase 등록 — 11씬, 11 author_bridges, 8 emotion_entries
- **시각화 뷰어 Phase 1~3** (`js/admin-trajectory.js` — admin.html Canvas 섹션에 inline 마운트)
  - dagre + SVG + 수동 zoom/pan
  - 감정 진입점 체크박스 (기본 빈 캔버스)
  - 노드 뱃지: 통과 카운터, author/trajectory bridge 구분 (회색/푸른빛)
  - 경로 비교 탭 (누적 모티프/echo_words/궤적 브릿지)
  - 브릿지 점선 edge (모티프 공명 자동 탐지) + 전체 브릿지 토글
  - 감정 지형 모드 (VAD 2D 투영 + 사분면 축)
  - ComfyUI 스타일 cable edges + 실시간 드래그 업데이트
  - 레퍼런스 목록 정리 (Feedback.md)
- **admin 구조 분리 Phase 0**: 네비바 [목록][Canvas][운영] + 3섹션 래퍼 + localStorage 탭 기억
- **admin 구조 분리 Phase 0.5**: Canvas iframe 제거 → inline 마운트, 잔상 모더레이션 운영으로 이동
- **Canvas 편집 통합 Phase 1**
  - 우측 패널 2층: 씬 편집 (상단) / 기본 설정 (하단)
  - 씬 편집 폼: 본문/감정 분포 8축/모티프/코드/작가 브릿지 CRUD → DB 즉시 저장
  - 메모리 기본 설정: 제목/설명/키워드/완성 문장
  - 사이드바 [+ 새 기억] 모달, [+ 새 씬] 버튼
- **사운드 스키마 Phase 2a**
  - 씬별 sound_url / sound_volume / sound_radius 필드
  - ▶ 미리듣기 버튼 (Web Audio API)
  - 씬 삭제 버튼 (choices FK 처리)
  - `js/shared/spatialAudio.js` 신규 — HRTF PannerNode 기반 3D 공간음향 엔진

### ⏳ 남은 작업

#### Phase 2b — strata에 공간음향 연결 ✅ 2026-04-14
- [x] `strataView.js`에서 `createSpatialAudioEngine()` 초기화
- [x] 씬 등록 시 `scene.meta.sound_url` 있으면 engine.register
- [x] 씬 pin 위치 (wx/wz/h) → engine.register의 x/y/z로 매핑
- [x] 카메라/OrbitControls 이동 시 engine.setListener 갱신 (animateLoop)
- [x] 부수: admin Canvas 사이드바 '🌐 Strata 미리보기' 버튼 + strataView 컨테이너 복구
- [x] 부수: strataView HUD에 '1인칭 걷기 (F)' 토글 — WASD로 거리 감쇠 체감
- [x] 부수: floating anchor `ko is not defined` 스코프 버그 수정
- [ ] 관리자 캔버스에서 핀 드래그로 pin_override 편집 → strata 즉시 반영 (별건으로 미룸)
  - 선결: `scenes.meta.pin_override: {x,y,z}` 스키마 확정
  - `tem_af_strata_terrain.js:221`에서 pin_override 있으면 VAD 계산 대신 우선 사용

#### Phase 3 — 페르소나 시뮬레이션 ✅ 2026-04-14 (MVP)
- [x] Supabase `plays` 테이블 조회 (persona_id 기준 그룹핑)
- [x] Canvas 사이드바에 페르소나 드롭다운 + [▶ 재생] / [⏹ 중지] 버튼
- [x] 선택 시 해당 페르소나의 궤적이 scene_order 순서대로 순차 하이라이트 (1.4s 간격)
- [x] 씬 도착마다 우측 패널에 user_emotion top3 / alignment / mismatch_type / inner_reason
- [x] 선결: migration `20260414000000_add_persona_cols_to_plays.sql`
  (plays에 persona_id/persona_name/strata_label/visit 추가, 모두 nullable)
- [x] `4_insert_db.js` 매핑 업데이트
- [x] `3_simulate_plays.js`에 MAX_PLAYS env 캡 추가 (기본 무제한, E-004는 100개로 돌림)
- [x] 데이터: MM23L 193 plays · E-004 100 plays · 공통 15 personas (JSON은 .gitignore)
- [ ] **Phase 3.5 (옵션)** Big Five 슬라이더로 즉석 페르소나 생성 → Claude API로 실시간 시뮬
  - 이유: API 비용·레이턴시 있음. MVP 이후 분리 처리.

#### Phase 4 — 레거시 정리 (1~2시간)
- [x] ~~`admin.html` 내 editorScreen의 등고선 핀맵/3D strata/감정공간 진단 3섹션~~ — 2026-04-13 삭제 (previewContent 블록 + 미리보기 탭 제거)
- [ ] editorScreen **기본정보** — `original_vector` 6슬라이더 UI Canvas 이관 보류 (아래 항목 선결)
- [ ] editorScreen **씬 편집기** — contamination text_stage_1/2/3 폼 Canvas 미이관. 이관 후 제거
- [ ] editorScreen **사운드 매핑 5곡** — Phase 2b 공간음향 충돌 가능성. (A) 플레이어에서 씬 사운드 우선 (B) UI 유지 결정 필요
- [ ] editorScreen **데이터 내보내기/가져오기** — UI는 여기만 존재. Canvas로 옮기거나 상단 메뉴로 분리 후 제거
- [ ] **잔상 모더레이션** — Phase 0.5에서 운영 탭으로 옮기기로 했으나 미완. `#utterancesContent` 그대로 editorScreen에 잔존
- [ ] 세션/앵커 이미지 섹션 — 운영 탭으로 실제 이동
- [x] ~~`admin-trajectory.html` 독립 페이지~~ — 2026-04-13 삭제 (Canvas에 흡수됨)
- [ ] 기존 `memories.sound_map` 5개 mp3 필드 — 레거시로 남김 (플레이어 뷰 호환)
- [ ] **🚨 SoundscapeBeta + sound_map 전면 제거** (Phase 2b에서 ADD만 하고 미룬 작업, 2026-04-14 결정)
  - 영향 파일 17개: `js/audio/SoundscapeBeta.js`, `js/audio/getSoundscape.js`, `js/app/endScreen.js`, `js/app/archive.js`, `js/lib/repo.js`, `js/index.js`, `js/services/NetworkService.js`, `js/admin.js`, `index.html`, `play-test.html` 등
  - DB 마이그레이션: `memories.sound_map` 컬럼 drop (`20250216000000_add_sound_map_to_memories.sql` 역마이그레이션 필요)
  - 순수 공간음향(`spatialAudio.js`)으로 일원화. 배경 앰비언트 없음 확정.
  - 이유: Phase 2b에서 함께 했다가 play-test/archive/endScreen 회귀 위험 커서 분리. 대청소로 한 번에 처리.

#### Phase 4.5 — 데이터 모델 미해결 (선결 조사)
- [ ] **MM23L "당신에게" 자유 키 감정 모델** — `original_vector`와 씬 `original_emotion`이 6축 표준 밖 키 사용 (love/shame/numbness/confusion/isolation). 작가 의도 확인됨 (서사상 의미 있음). 별이엔진/오염추적/Finder 매칭이 비표준 키와 호환되는지 검증 필요. 호환 안 되면 (a) 6축 통일 (b) 자유 키 모델 정식 지원 결정.
- [ ] **`memories.original_vector` UI 재설계** — 현 6슬라이더는 MM23L 8키 케이스 못 다룸. Canvas 이관 시 자유 키 JSON 에디터로 만들거나, MM23L 정리 후 자동 유도(씬 평균)에만 의존. DB 현황: 8개 중 2개(DJ2DG, MM23L)만 override 사용.

#### [결정 대기] 항목
- [ ] **명시적 분기 도입 여부**: `choices.next_scene_id` 컬럼 추가할 것인가.
  - 현재: 씬은 선형(`scene_order` 순서), choice는 감정 결만 기록
  - "노드 연결 수동"이 진짜 필요한지 작가 판단 필요
- [ ] **공명궤적→브릿지 연출**: 공명 도달자의 흔적을 다음 플레이어에게 어떻게 보일 것인지
  - completed_sentence 그대로? 경로 모양만? echo_words 잔상?
- [ ] **사운드 마이그레이션**: 기존 E-001~E-003의 `memories.sound_map` 5곡을 씬별로 재배분할지 방치할지

### 🧭 우선순위

```
현재     : Phase 2b + Phase 3 MVP 완료 (2026-04-14)
다음     : Phase 4 — 레거시 editorScreen 제거 + SoundscapeBeta 대청소
그 다음  : Phase 3.5 — Big Five 실시간 슬라이더 (옵션)
미해결   : Phase 4.5 데이터 모델 (original_vector 재설계)
```

Canvas 통합 프로젝트는 **PLAY 통합(§18.4)과 독립**. 병렬 진행 가능.
다만 작가 제작 흐름을 먼저 궤도에 올리면, PLAY 쪽 리팩터링 시 "작가 의도가 무엇이었나" 추적이 쉬워짐.

---

## 📚 레퍼런스 (다궤적 시각화 / 비선형 서사 / 독자 흔적)

TEM과 정확히 일치하는 도구는 없지만, 부분 레퍼런스 4개를 합치면 시각 문법의 대부분을 커버함.
**핵심 정의**: TEM ≈ "문학 작품용 XState Visualizer + 독자 흔적 레이어".

### 시각화 패턴 — 직접 UI 훔쳐올 만한 것

- **[stately.ai/viz](https://stately.ai/viz)** (XState Visualizer) — ⭐ 가장 가까움.
  상태 기계를 노드 그래프로 자동 배치. **현재 경로 하이라이트 + 노드 클릭 시 우측 Inspector 패널** 패턴이 우리 도구와 거의 동일. 단, **한 번에 한 궤적만** 시뮬레이션. 우리는 여러 궤적 동시 비교가 필요.
  주의: 도구 자체는 프로그래머용 학습곡선 가파름 — 배울 필요 없음, **UI 패턴만 훔칠 것**.

- **Mixpanel Pathfinder / Amplitude Pathfinder** — 유저 행동 분석 툴.
  "다수 진입점 → 수렴점"을 Sankey로 시각화. 우리의 "8개 감정 진입 → K 수렴" 구조와 형태가 일치. 무료 계정 데모 데이터로 확인 가능.

- **Articy:Draft** — 게임 내러티브 저작도구.
  분기 서사 DAG. 작가가 노드 직접 배치. **노드 안에 메타데이터 박는 시각 레이아웃** 참고. 유튜브 데모 영상 다수.

### 비선형 서사 저작도구 — 개념적 조상

- **Tinderbox / Storyspace** (Eastgate, Mark Bernstein) — 하이퍼텍스트 문학 도구 원조 (1980s).
  씬 노드 + 의미 연결이라는 발상의 학술적 조상. **우리 "브릿지" 개념과 가장 가까운 역사적 전례.** 유료/Mac 전용이라 도구 자체는 접근 어려움. 구글 학술 검색으로 논문 읽는 게 실용적.

- **Twine** — 가장 유명한 분기 서사 무료 도구. 배우기 쉬움.
  한계: 명시적 분기만. **누적 상태 기반 변주 없음**.

- **Ink (Inkle)** — 80 Days, Heaven's Vault 제작사 도구.
  Twine보다 훨씬 정교. 변수/상태 기반 분기. VSCode 플러그인으로 시각 그래프 지원.

### 독자 해석 누적 — 궤적 브릿지의 기술 모델

- **[hypothes.is](https://hypothes.is)** (Hypothesis) — 웹 페이지에 주석 다는 도구.
  다른 사람 주석을 같이 봄. **궤적 브릿지가 다음 플레이어에게 노출되는 메커니즘의 기술적 모델**로 쓸 수 있음.

- **[Genius.com](https://genius.com)** — 가사 주석 플랫폼.
  한 줄에 여러 해석. **단, Genius는 인기도 정렬** — 우리는 공명 도달 여부만 씀. 페이스북식 인기도 매커닉은 TEM에 안 맞음 (명시적 거부).

- **Soulsborne 메시지 시스템** (From Software 게임) — ⭐ 가장 닮은 형태.
  "Try jumping" 같은 짧은 메시지를 다음 플레이어가 봄. 익명, 궤적 기반. **trajectory_bridge가 가장 가까움.**

### 학술 토대

- Janet Murray, *Hamlet on the Holodeck* (1997) — 인터랙티브 서사의 바이블.
- Marie-Laure Ryan, *Narrative as Virtual Reality* — 다궤적 서사 이론.
- Espen Aarseth, *Cybertext* — ergodic literature 개념. **TEM이 정확히 이 카테고리.**

### 문학적 전례 (작품 레벨, 도구 아님)

- Cortázar, *Hopscotch (Rayuela)* — 다중 읽기 순서.
- B.S. Johnson, *The Unfortunates* — 분권본, 임의 순서 읽기.
- Mark Z. Danielewski, *Only Revolutions* — 비선형 인쇄.
- Aaron Reed, *Subcutanean* — 독자마다 다른 책(작품 단위 변이, 궤적 단위는 아님).

### 요약 — TEM의 새로움

```
시각 문법       = XState Visualizer
수렴 흐름       = Mixpanel Pathfinder
노드 저작       = Tinderbox / Articy
독자 흔적       = Soulsborne / Hypothesis
─────────────────────────────────────
TEM = 위 4개 조합 + 감정 진입 + 누적 오염 + 공명 도달자의 해석 누적
```

이 네 개를 한 시스템에 묶은 전례는 확인되지 않음.

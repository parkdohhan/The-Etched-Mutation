# Critic.md 입력 패키지 — TEM (LUMEN demo)

**작성**: 2026-04-28
**대상 프롬프트**: [prompt/critic.md](../prompt/critic.md) v3 (2026-04-20)
**목적**: critic.md "사용자 입력 양식" 1·2·6·7·8·9 항목 채움. 3·4·5 (스크린샷) 는 캡처 대상만 명시 — 실제 이미지는 작업 9 증거 패키지에서 별도 첨부.
**스코프**: 본 문서는 LUMEN 데모 (제출 5-23, 안전 5-19) 시점의 작품 상태를 반영. PLAY/RECORD/LIVE 풀 시스템 포함하되, 데모는 LUMEN 1인칭 공간 흐름이 메인 경로.

---

## 1. 작품 한 줄 설명

TEM (The Etched Mutation) 은, 관객이 1인칭 웹 공간에서 타인의 기억을 자기 기억처럼 체험한 뒤 자기 기억의 확신을 잃고 나오는 이머시브 시어터다 — 기억 공간은 관객마다 다르게 생성되고 (이본), 관객이 남긴 입력 파편은 다음 관객의 세션에 유령으로 흘러간다.

---

## 2. 왜 이 매체여야 하는지 (5문장)

1. **변질은 공유와 저장이 동시에 일어나는 매체에서만 직접 작동한다.** 회화·영상은 한 방향 전달이라 "공유될 때마다 변질되는" 운동을 *바깥에서 묘사* 할 뿐이고, 인터랙티브 시스템은 그 변질을 *세션 단위로 누적·관측 가능* 하게 만든다 — `memories.cont_drift` / `cont_fixation` 두 EMA 컬럼이 매 세션 갱신되며 기억의 "나이" 가 데이터로 새겨진다.
2. **이본(Variant) 은 분기 + 자율 시뮬 매체에서만 무한 생성된다.** 동일한 초기 메모리에 다른 관객 입력이 들어가면 별이엔진 V4 의 alignment·pattern·mismatch 가 다른 값을 산출하고, SceneNavigator 가 코사인 반경 0.35 안의 *다른 다음 장면* 을 선택해 매 세션이 구조적으로 다른 작품이 된다 — 같은 명제를 비-인터랙티브 매체로 옮기면 "이본" 은 비유로만 남는다.
3. **브라우저는 "혼자의 닫힌 방" 이라는 매체적 메타포 자체를 제공한다.** 갤러리 설치는 사회적 압력이 끼어들고, VR 헤드셋은 신체 단절이 강해 *고백·가짜 친밀* 의 텍스처가 깨진다 — 웹 1인칭 + 텍스트 입력 + 사운드스케이프 조합이 "또 다른 나" 라는 화자 위치와 정확히 정합한다.
4. **관객의 흔적이 다음 관객의 유령이 되려면 *지속 가능한 공유 인프라* 가 필수다.** Supabase Postgres `plays.user_emotion_trajectory` 가 영구 저장되고, Realtime + afterimage 시스템이 *다른 시간대의 다른 관객* 입력을 현재 세션 공간에 잔상으로 호출한다 — 단발 설치나 영상 매체로는 *시간 축의 누적* 이 끊긴다.
5. **AF 지형 1인칭 공간은 "타자의 기억으로 들어가서 나의 기억을 잃는" 명제를 *공간 메타포로 직접 수행* 시킨다.** WASD 로 걸어 들어가 중심 void 에 도달하고 귀환하는 동선 자체가 관객 행위로 명제를 체험시키는 구조이며, fog/vignette/bob/footstep/drone 의 오염 단계 반응이 그 동선을 *환경 연출로 강화* 한다 — Three.js + Web Audio + 시드 결정론 PRNG 의 결합이 이 명제를 기술적으로 필연화한다.

---

## 6. 종료 혹은 실패 상태 (캡처 대상 명시)

### 6-1. 정상 종료 — True Ending
- 트리거: `alignmentResult.isTrueEnding === true` (감정 구조 거의 겹침).
- 화면 ([js/app/endScreen.js:121-158](../js/app/endScreen.js#L121)): "Touching the Engraving" 타이틀 + true ending badge + "Your emotional structure nearly overlapped with theirs. This alignment will be deeply etched into the original strata."
- 후속: 3초 뒤 작성자(narrator) 가 남긴 쪽지 UI 노출. 3.8초 뒤 afterimage 시스템 ([js/ui/afterimage.js](../js/ui/afterimage.js)) 가 다른 관객 잔상 1개 호출 (10초 dwell).
- "View Original Memory" 버튼이 동적 생성되어 작성자 원본 보기 가능.
- **캡처 대상**: 타이틀 + alignment 수치 + true ending badge 동시 노출 프레임.

### 6-2. 정상 종료 — Normal Ending (다른 결)
- 트리거: 일반 종료. alignment 가 true ending 임계 미만.
- 화면: "ENDING" 타이틀 + normal ending badge + 부제 "Felt in a Different Grain" + "You experienced this memory in a different way. Same scene, different emotions. That, too, is an interpretation."
- 후속: NPC 다이얼로그 ("또 다른 나") 6초 노출. afterimage 동일.
- **캡처 대상**: 부제 + final alignment 수치 동시 노출.

### 6-3. LUMEN 귀환 종료 (데모 메인 경로)
- 트리거: 중심 void (0,0) 시각 표식 5.6 유닛 경계 안 2.5초 체류 → `LumenRewindPlayback` rewind → 귀환 시퀀스.
- 화면: 자기 입력 파편이 공중에 출몰 (작업 2-D, 미착수). 메인 메뉴 복귀 시 "또다른 나" + 아카이브 노출.
- **캡처 대상**: rewind 직전(중심 표식 강화) → rewind 중(역재생) → 귀환 직후(파편 공중 출몰) 3장.

### 6-4. 실패 상태들

| 실패 종류 | 트리거 | 시각/시스템 상태 | 캡처 대상 |
|---|---|---|---|
| **FIXATED** | `calculateFixationLevel` 반복률 ≥ 0.85 | bucket=FIXATED, `cont_fixation > 0.65` → cont_stage = `hypercompletion`. 텍스트가 단어 반복 + `░▒▓` 글리치로 *너무 또렷* 해져 원본 잃음. 사운드스케이프 뚝 끊김 → 10% 더 크게 스냅백. | hypercompletion 텍스트 + 글리치 동시 노출 한 장. |
| **BLOCK_HIGH (안전)** | `js/safety.js` 위기 키워드 감지 | 즉시 세션 중단. 시스템 경고가 아니라 "또 다른 나" 내면 목소리로 위기 대응 리소스 전달. | 세션 중단 화면 + 리소스 노출. |
| **biased_inclination 정점** | `cont_drift > 0.35` 강도 strong | 텍스트가 단어 사이 `·` 다량 삽입으로 *침식* 됨. 볼륨 15% 페이드 다운 → 1.2초 복원. 원본 의미 부분 손실. | 침식 텍스트 + alignment 파형 동시. |
| **중심 void 미도달** | 플레이어가 5.6 경계 만나지 못한 채 세션 종료 시도 | 어댑터 `enterVoid` 미발화 → 귀환 플로우 부재. 작품 명제 ("자기 기억 확신 상실") 가 발생 안 한 채로 나옴 = *덜 잃은 채로* 나옴. | 중심 표식 멀리 보이는 1인칭 뷰 + 종료 직전 상태. |
| **SceneNavigator 빈 폴백** | 패턴 반경 안에 접근 가능 장면 0개 | 침묵 처리 X. 서사적으로 프레이밍 — "기억의 빈틈이 다른 장면을 끌어당긴다." | 폴백 멘트 노출 프레임. |

---

## 7. 관객 행동 흐름 5단계

LUMEN 데모 메인 경로 기준. PLAY/RECORD 별도 흐름은 §8 시스템 구조에서 다룸.

### 단계 1 — 진입 + 기억 매칭
- 오프닝 1필드: 감정 칩 6개 ("어떤 기억을 찾고 있어?").
- 관객의 칩 선택 → `_finderMatchByText` (cosine + α×intersection) 으로 시작 메모리 매칭. *선택 = 검색* 의 매체적 융합.
- LLM 라운드트립 회피 (오프닝 UX 지연 방지) — 100% 클라이언트측 매칭. [archive.js:_finderMatchByText](../js/app/archive.js).

### 단계 2 — 1인칭 공간 진입 + 첫 유령 조우
- WASD 로 AF 지형 mesh 위 걷기 ([js/shared/tem_af_strata_terrain.js](../js/shared/tem_af_strata_terrain.js) `enterFirstPerson`).
- 스토리지: `scenes.meta.stage_position = {x, z}` (수동 admin 드래그) 또는 `originalReasonVector.attribution × core_fear` AF 투영 자동 fallback.
- 첫 *유령* — 다른 관객 입력 파편 또는 작가 시범 메모리 응결점 — 의 시각 출몰. 거리에 따라 opacity·scale·pulse.

### 단계 3 — 장면 분기 + 감정 입력 + 환경 반응
- 유령 인근에서 `renderScene(index)`: 장면 텍스트 + 선택지. 텍스트는 `contaminationPresenter.js` 가 `cont_stage` 에 따라 변환 (`·` 침식 / `░▒▓` 과선명).
- 관객 감정 입력 (텍스트 OR 선택지 클릭) → `projectEmotionToVAD` → `runEngineStep` → ByeoriEngine 이 alignment·pattern·mismatch 산출.
- SceneNavigator 가 패턴별 중심 이동 + 0.35 반경 안에서 다음 장면 선택. 6 패턴 (echo_follow / bridge / contradiction / displacement / avoidance / fixation) 각각 *공간 위치* 가 다름.
- 환경 연출: fog·vignette·bob·footstep·drone 이 cont_stage 와 강도 밴드(weak/medium/strong) 에 반응. 사운드스케이프 — biased_inclination 시 볼륨 페이드, hypercompletion 시 끊김 + 스냅백.
- 0.5~1초 비결정 발화: contaminationMonologue ("뭔가 달라. 근데 뭔지 모르겠어") 가 weak 20% / medium 45% / strong 70% 확률 발화.

### 단계 4 — 중심 void 도달 + 귀환 트리거
- 맵 중심 (0,0) 시각 표식 (작업 14 미착수, 회전 원판/빛 기둥/바닥 파동 중 1종 선정 예정).
- 관객 자율 탐색으로 5.6 유닛 경계 진입 → 2.5초 누적 체류 → rewind 트리거. 스쳐 지나감 (<1초) 무효.
- LumenRewindPlayback 역재생 → 귀환 세션 진입.
- 귀환 전용 사건 (작업 2-D 미착수): 자기 입력 파편이 공중에 출몰 — "내가 한 행위가 흔적으로 돌아옴" 의 명제 수행.

### 단계 5 — 종료 + 침전 + 다음 관객으로 흐름
- `showEndScreen` → True / Normal Ending 분기 (§6-1, 6-2).
- `ContaminationTracker.updateContamination` → memories.cont_* EMA 갱신. `cont_depth` +1 (절대 리셋 안 됨, "기억의 나이").
- afterimage 시스템 3.8초 뒤 다른 관객 잔상 호출, 10초 dwell.
- `plays` 테이블에 `user_emotion_trajectory` / `final_alignment` / `final_bucket` / `transition_pattern` / `mismatch_type` 영구 저장.
- 매장 애니메이션 — 장면 텍스트 하강 → "새겨졌다." → 메인 메뉴 복귀 + "또다른 나" + 아카이브 노출.
- **다음 세션 효과**: 이 관객의 입력 파편이 다른 관객의 단계 2 유령 후보로 흘러감. 시간 축 누적이 작동.

---

## 8. 시스템 구조 요약

### 8-1. 스택
- **클라이언트**: Vanilla ES6, Three.js (AF 지형 mesh + 1인칭 카메라), Web Audio API (SoundscapeBeta), Vite. 메인 진입은 [play-test.html](../play-test.html) (LUMEN 데모) + [index.html](../index.html) (PLAY/RECORD 풀 시스템).
- **백엔드**: Supabase Postgres + Realtime + Edge Functions.
- **AI 호출 구조**: claude-scene (Anthropic Claude Sonnet 4 — RECORD 전용 감정/상황 분석) / contaminate-text (Gemini 1.5 Flash — 미사용 상태, 로컬 변환으로 대체) / generate-scene-from-conversation / collect-memory / generate-reveal.

### 8-2. DB 핵심 테이블
- `memories` — 기억. `cont_depth`(int, 리셋 안 됨) / `cont_drift` / `cont_fixation` / `cont_stage` / `lifetime_drift_sum` / `lifetime_fix_sum` / `drift_dir_v/a/d` 7+ 컬럼이 EMA 누적.
- `scenes` — 장면. `original_emotion` / `original_reason` / `original_choice` / `void_info` / `meta.stage_position` (작업 15 신규).
- `plays` — 플레이. `user_emotion_trajectory` / `original_emotion_trajectory` / `scene_scores` / `final_alignment` / `final_bucket` / `transition_pattern` / `mismatch_type`.
- `choices` / `notes` / `profiles` — 보조.

### 8-3. 핵심 엔진
| 모듈 | 역할 | 핵심 공식/원칙 |
|---|---|---|
| **별이엔진 V4** [ByeoriEngine.js](../js/core/ByeoriEngine.js) | alignment·pattern·mismatch 계산 | `alignment = level × shape × void_mod`. level=장면별 감정 코사인 평균, shape=궤적 곡률 cosine(Δuser, Δoriginal), void_mod=0.7 또는 1.0. **판단 X, 관측 O** |
| **SceneNavigator** [SceneNavigator.js](../js/core/SceneNavigator.js) | 다음 장면 *공간 위치* 결정 | 패턴별 *중심 이동* (echo_follow=원본 70%, contradiction=반대 방향, fixation=현재 근처 등) + 코사인 반경 0.35. 폴백 = 침묵 X, 서사 프레이밍 |
| **ContaminationTracker** [ContaminationTracker.js](../js/core/ContaminationTracker.js) | drift/fixation EMA 추적 | α=0.10 (반감기 ~6.6 세션). drift_signal = 0.45×(1-level) + 0.35×(1-shape) + 0.20×mismatch. fixation_signal = 0.55×fix_level + 0.25×align + 0.20×pattern. stable / biased_inclination / hypercompletion 단계 전환 |
| **contaminationPresenter** [contaminationPresenter.js](../js/app/contaminationPresenter.js) | 텍스트 오염 변환 | 시드 결정론 PRNG: `(sceneIndex × 2654435761) XOR (contDepth × 40503)`. biased_inclination = `·` 침식, hypercompletion = 단어 반복 + `░▒▓` |
| **contaminationMonologue** [contaminationMonologue.js](../js/ui/contaminationMonologue.js) | 내면독백 | 단계 × 감정 × 강도 밴드 매칭. 발화 확률 weak 20% / medium 45% / strong 70% |
| **SoundscapeBeta** [SoundscapeBeta.js](../js/audio/SoundscapeBeta.js) | 공간 음향 | `setContaminationStage()` → biased_inclination 페이드, hypercompletion 끊김+스냅백 |
| **safety.js** [safety.js](../js/safety.js) | 위기 필터 | 3-tier: BLOCK_HIGH (즉시 중단) / BLOCK_MID (경고) / MONITOR_ONLY (통과+로그). 위기 대응은 "또 다른 나" 내면 목소리 |

### 8-4. LUMEN 추가 (작업 14/15 v2 완료)
- **AF 지형 mesh top-down**: Three.js OrthographicCamera (0,200,0)→(0,0,0). PlaneGeometry(112, 112, 79, 79) + vertexColors. SVG 위 / terrain canvas 아래로 깔려 좌표 1:1 매핑.
- **Admin 두 레이어 분리**: 궤적 레이어(`original_reason_vector`/VA — 분기 결정) + 위치 레이어(`scenes.meta.stage_position` — 시각 좌표). 자동 fallback (AF 투영) vs 수동 드래그 분리. 자동=점선 헤일로, 수동=실선.
- **시뮬 동기화**: 6 패턴 색 — echo_follow `#c4a882` / bridge `#6aa383` / displacement `#a88aa3` / contradiction `#c97a6a` / avoidance `#7c7466` / fixation `#9d8a4a`. current=꽉 찬 dot, candidate=패턴색 펄스 링, visited=dimmed.
- **smoke** [smoke_task_15.mjs](../test/e2e/smoke_task_15.mjs) 11/11 PASS, [smoke_task_15_v2.mjs](../test/e2e/smoke_task_15_v2.mjs).

### 8-5. i18n / 결정론 / 데이터 흐름
- **i18n**: UI 크롬만 번역. *기억 내용은 작성자 언어 그대로*. 기본 영어. 브라우저 로케일 자동 감지 X.
- **결정론**: 동일 시드 → 동일 오염 패턴. 재방문 시 *기억이 변하지 않음* 의 감각.
- **세 흐름**: PLAY / RECORD / LIVE (메인 메뉴 미연결). LUMEN 은 PLAY 의 1인칭 공간 변형.

---

## 9. 참고 계보 (2~3개)

### 계보 ① — 분기 서사 + 자율 시뮬 (TEM 명제 축①: 이본)
**Lynn Hershman Leeson** *Lorna* (1984), *Roberta Breitmore* (1974~78) → **Ian Cheng** *Emissaries* trilogy (2015~17), *BOB (Bag of Beliefs)* (2018~19). 80년대 인터랙티브 비디오 디스크 분기 서사가 2010년대 자율 AI 시뮬로 확장된 흐름. 관객 입력에 따라 서사가 분기하고, 시스템이 자율로 진화한다는 매체 형식의 토대. TEM 의 별이엔진 V4 + SceneNavigator 가 *입력별 다른 다음 장면* 을 산출하는 구조는 이 계보의 직계.

### 계보 ② — 수행 지시 + 관객 흔적 누적 (TEM 명제 축②·③: 타자 수행 + 파편 전달)
**Yoko Ono** *Instruction Paintings* (1960s~), *Wish Tree* → **Rafael Lozano-Hemmer** *Pulse Room* (2006), *Bilateral Time Slicer*. 작가는 씨앗만 두고 관객 수행/신체 신호로 작품이 완성되며, 그 흔적이 공간에 누적되어 다음 관객을 만난다. TEM 의 afterimage 시스템 + plays.user_emotion_trajectory 영구 저장 + 다음 관객 세션의 유령 호출 구조가 이 계보의 직계.

### 계보 ③ — [한국 작가 슬롯, 미확정]
artist_statement_lineage 후보: 오수경 / 하차연. 사용자가 실제 알고 있는 작가의 대표작 1~2개 확정 후 채움. 둘 다 특정 불가하면 본 항목 생략 (계보 2개로 압축).

### 매트릭스 (요약)
| 작가 | TEM 축① 이본 | 축② 남의 기억→내 기억 | 축③ 파편→다음 유령 |
|---|---|---|---|
| Hershman Leeson | ○ | × | × |
| Ian Cheng | ○ | × | △ |
| Yoko Ono | △ | ○ | × |
| Lozano-Hemmer | × | △ | ○ |

3축을 한 명이 다 커버하는 작가는 없음. TEM 의 기여는 *세 계보를 한 공간에 겹침*.

---

## 부록 A — Critic.md 항목 3·4·5 캡처 대상 (실제 이미지는 작업 9 에서 첨부)

| critic.md 항목 | 캡처 대상 |
|---|---|
| 3. 시작 화면 | 오프닝 1필드 + 감정 칩 6개 노출 프레임 |
| 4. 핵심 상호작용 직후 | (A) 첫 유령 조우 1인칭 뷰, (B) 장면 분기 + 감정 입력 직후 alignment 파형 |
| 5. 분기/오염/변형 이후 | biased_inclination 또는 hypercompletion 텍스트 노출 + 사운드스케이프 반응 시각 단서 |
| 6. 종료/실패 | 본 문서 §6 의 4 종 화면 |

---

## 부록 B — 사용자에게 남긴 결정 사항

1. **계보 ③ 한국 작가 확정** — 오수경 / 하차연 또는 새 후보. 대표작 1~2개 본인이 실제로 아는 범위에서 확정해야 §9 채움 가능. 미확정 시 2계보로 제출.
2. **본인 호흡 리라이트** — 본 문서 § 1, 2, 9 는 사용자 톤이 아니라 자료 기반 합성. 학부생 statement 톤으로 1차 리라이트 필요.
3. **이전 판정 이력 첨부 여부** — critic.md 좌표계 정밀도용. 누적 좌표계 (Osmose 95 / Legible City 92 / Electronic Superhighway 87 / Tunnel 82 조건부 / TEM 83 anchor) 를 critic.md 호출 시 첨부할지 결정.
4. **캡처 시점** — 작업 14 (중심 void 표식) / 2-D (귀환 사건) 미착수 → 종료 화면 §6-3, §6-4 의 일부 캡처는 해당 작업 완료 후에만 가능. 5-14 코드 freeze 이후 작업 9 에서 일괄 캡처 권장.

---

*본 문서는 critic.md 입력 패키지로 작성됨. 실제 IMA / Media Lab 포트폴리오 제출용 artist statement 와는 별개. statement 는 작업 8 (5-13 파일럿 종료 직후) 에서 별도 드래프트.*

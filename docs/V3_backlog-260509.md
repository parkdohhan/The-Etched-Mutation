# V3 Backlog

V2.1 작업 (4-29 ~ 5-19) 중 떠오르는 새 아이디어를 즉시 이월하는 자리. 스코프 밖 욕구가 올 때 한 줄 적고 본 작업 복귀.

§0 계약 — 본 backlog 항목은 V2.1 안에서 건드리지 않는다. 기존 V3 항목 (V2 풀판 좁힘으로 격하된 quilt/cell/지형분기 등) 은 `LUMEN_DEMO_SCOPE-260506.md` §5 참조.

---

## 4-29 ~ 5-19 이월 항목

- **(2026-05-04) `LumenRewindPlayback`(궤적 역재생 cinematic) 자리 재배치** — V2.1 회차 끝 (출구문) 자리에 박았더니 작가 첫 손 체감에서 "이거 뭐임" 반응 (출구문 ≠ 도달 자리, 의미 안 읽힘). 모듈 자체는 [js/ui/lumen_rewind_playback.js](../js/ui/lumen_rewind_playback.js) 에 코드 보존. V3에서 정합 자리 (예: void 진입, 깊이 도달 후, 메타 질문 직후) 다시 박을 후보. 원래 V1 작업 2-A 의도 = "*도달 후 여정 회고*" — 그 의미가 살아나는 자리에서만 부활.

- **(2026-05-04) speciation 판정 시점 재설계 — trajectory 누적 기반** — Gemini critique 출처. 현재 `decideBranch`(분기 결정 함수, [js/core/GhostBranchTrigger.js](../js/core/GhostBranchTrigger.js))는 회차 *시작 직전* 오프닝 3턴 fingerprint 만으로 drift/speciation/none 결정. 이본론 정합 측면에서 *회차 끝* 에서 사용자가 공간을 어떻게 걸었는지(`getTrajectory` 누적 데이터)로 결정해야 "통과 중 흔적이 변형을 만든다" 명제와 정합. 단순 이전 X — 변주 선택은 시작에서 (drift 가시화용 필수), speciation 판정만 끝에서 trajectory 누적 기반으로 분리 필요. V2.1 손대면 코어 루프 깨짐 → V3 작업 자리.

---

## 4-30 신규 — V3 통합 플로우 비전 (이본 형성 의식 차원 추가)

### 발견

V2.1 좁힘 후 V3 비전 재구상. 사용자 직접 설계. 다섯 비전 (§14 위상 quilt + §15 페어링·두 층 + 작가/플레이어 quilt 분리 + 깊이 파기 분기) 위에 **여섯번째 차원 — 이본 형성 의식** 추가.

### 새 플로우

```
1. 문 입장 (작업 1 buildDoor 그대로)
2. 통로 (풀 덤불 등 — 시각 어휘 미정)
3. 통로 끝 → 한 지형 = 한 cell
4. 그 cell 안에 유령 1명 (1:1 페어링, §15-1 정합)
5. 멀티턴 자유텍스트 대화
6. 유령이 "어디 가고싶어?" 물음 (추상 질문, 후보 제시 X)
7. 답 → 시스템 분석 (의도 추출) → 다음 cell 결정
8. 통로 → 다음 지형 → 반복
9. 마지막 통로에서 메타 질문 (시스템 어휘, 화면 가운데):
   "이 기억을 너의 언어로 말해줘"
10. 답 입력 → 문으로 걸어가는 시퀀스
11. 제목 붙이기 → 저장 (후속 플레이어가 본 quilt 모음 포함)
12. 관찰자 모드: 자기가 만든 quilt + 오염·변형 + 통로 연결을 3인칭 시각으로
```

### 두 어휘 차원 의도적 분리

- **유령의 입** (대화 안) — "어디 가고싶어?" 같은 질문. cell 안 인격.
- **시스템 어휘** (대화 밖, 화면 가운데) — "이 기억을 너의 언어로 말해줘". 작품이 작품 자신을 가리키는 순간.

이 분리가 V3 작품 정체성의 핵심.

### 여섯번째 차원의 무게

이전 다섯 비전은 *작품 안의 메커니즘*. 여섯번째는 *작품이 자기 자신을 가리키는* 메타 차원.
- "이 기억을 너의 언어로 말해줘" — 작품 안에서 이본 형성을 *요청*
- 제목 = 변종 텍스트 명명
- 관찰자 모드 = sheaf section 의 인지 가능 객체화

paper 매핑: *플레이어가 자기 sheaf section 에 이름을 부여함으로써 변종 텍스트의 식별이 작품 안에서 이루어진다*. 박사 framing 결정적 자리.

### V3 작업 항목 (추정)

코드:
| 작업 | 추정 일수 | 비고 |
|---|---|---|
| V3-1 멀티 cell DB 모델 — `cells` 테이블 + cell 간 attaching 관계 + memory_id 별 cell 풀 | 1~1.5 | 대형 마이그레이션 |
| V3-2 cell 단위 1인칭 재배선 — 지형 함수 cell 단위 호출 또는 cell 전환 시 terrain 재로딩 + FP 재진입 | 2~3 | **수정 금지 함수 침범 검토** — 어댑터 패턴 한계 vs 원본 수정 결정 |
| V3-3 통로 시스템 — cell 간 1차원 transition 공간. 절차적 시각 어휘 (이전 cell 감정 → 다음 cell 감정) 또는 작가 수동 | 2~3 | 새 모듈 |
| V3-4 유령이 다음 cell 묻기 — 멀티턴 안 추상 질문 + 답 의도 추출 + 다음 cell 결정 | 1.5~2 | claude-scene 재활용 + 결정론적 매핑 |
| V3-5 메타 질문 + 제목 + 저장 시퀀스 | 1 | DOM 어휘 |
| V3-6 관찰자 모드 — 자기 quilt 3인칭 시각화 + 오염·변형 표시 | 2~3 | 새 시각 어휘 |
| V3-7 drift / speciation 재설계 (멀티 cell 안에서) | 1~1.5 | 본인 한 바퀴 체감 후 튜닝 |
| V3-8 cell lifecycle 정책 — 분기 cell 의 시들기·흡수·archive | 1~2 | §15-2(a) |
| V3-9 통합·smoke 가드 (`test/smoke_v3_*.js`) | 2 | 회귀 가드 |

코드 합계 = **14~19일**.

콘텐츠:
| V3-10 데모 메모리 1개 — cell 7~10개 + 유령 7~10명 + 멀티턴 변주 풀 + 시드 분기 1~2개 | 7~12일 | V2.1 콘텐츠의 2~3배 |

디버깅·튜닝 2~3일 + 파일럿·증거·제출 10.5일 = **합 27~38일 분량**.

본인 페이스 (1.33×~1.67×) 적용 = **16~28일 실 작업**.

### 미명시 결정 변수 (V3 시작 전)

1. 유령이 묻는 방식 — 후보 제시 X, 추상 질문 + 답 분석 권장
2. drift / speciation 작동 메커니즘 — 멀티턴 안 누적·분기 임계
3. 메타 질문 시점 — 마지막 한 번 권장
4. 제목 저장 — 후속 플레이어가 본 quilt 모음 권장 (이본 collection)
5. 통로 시각 어휘 — 절차적 생성 권장 (작가 부담 ↓)
6. 관찰자 모드 시각 — top-down vs 추상 그래프 vs 시간순 띠 vs sheaf 시각화
7. cell 도는 비율 — 일부만 (이본 정합)
8. V3 = LUMEN V2.1 후속 vs 별개 작품 — *별개* 정직 가능성
9. 17D 사전 통일 (paper A vs 지형 B vs 합집합 vs 새 사전)
10. 한국어 정서 lexicon 활용 (KOSAC, KAIST KER)
11. Warriner et al. (2013) VAD 좌표 검증

### V2.1 과의 관계

- V2.1 (5-19 데모): 단일 1인칭 공간. SCOPE §0-A 그대로 진행.
- V3: V2.1 종료 후 *묶음 결정*. 다섯 비전 + 새 플로우 + 17D 정합 동시 처리.
- V2.1 자산 재활용: 멀티턴, 유령 단위 분기, drift/speciation 결정론, claude-scene, ByeoriEngine, ContaminationTracker.

### 박사 framing

- CW complex(셀로 짜인 위상 공간) → 작가 cell 풀 (V3-1)
- Homotopy(연속 변형 이론) → 멀티턴 안 drift (V3-7)
- Attaching map(붙임 사상) → 통로 1차원 path (V3-3, V2 의 0차원 cut 보다 풍부)
- Sheaf(층, 같은 base 다른 단면) → 관찰자 모드 시각화 (V3-6)
- Persistent homology(지속 호몰로지) → 회차 분기 누적 분석 (박사 단계 별도)
- **이본 형성 의식** (4-30 신규) → "이 기억을 너의 언어로 말해줘" + 제목 + 관찰자 모드 = 변종 텍스트 명명 절차의 작품 차원 구현

§14-5 매핑 표가 V3 에서 *prototype 시연* 으로 완성. *학부 단계 잠정 정식화* 임을 statement 명시 — overselling 경계.

### 한계

- 새 플로우 가설 (깊이 파기 매력 / 유령 추상 질문에 자연스러운 답 / 메타 질문에 솔직한 응답) 미검증. 파일럿 필수.
- 콘텐츠 V2.1 의 2~3배 — 작가 부담 폭증.
- 17D 사전 정합 미해결 시 V3 코드와 paper 어긋남 그대로. V3 작업 중 함께 풀어야.
- 다섯 비전 + 여섯번째 = 여섯 자리가 *서로 모순 없이 한 framing* 에 들어가는 게 강점이자 *한 자리 무너지면 여섯 같이 무너짐* 위험.

### 관련 문서·메모리

- `docs/LUMEN_DEMO_SCOPE-260506.md` — V2.1 SCOPE
- `~/.claude/projects/d--The-Etched-Mutation/memory/project_lumen_unified_form_v2.md` — 다섯 비전 통합 (여섯번째 차원 추가 갱신 필요)
- `~/.claude/projects/d--The-Etched-Mutation/memory/project_lumen_topological_vision.md` — §14 위상 quilt
- `docs/paper/TEM_paper_draft_v0.1-260419.md` — paper 17D anchor 정합 검토 대상

---

## 5-15 신규 — 잔상 유령 동적 mutation·생성 (지형 퀼트 작업과 묶음)

### 발견

5-15 phase 1 정리 중 등장. 사용자 머릿속에서 "잔상 = 메모리에 떠 있는 상호작용 불가 sprite, 소문을 입으로 옮기는 이본론 부산물". 코드는 이미 `ghost_condensation_points` + `lumen_scene_ghosts.js` 자리에서 *정적* 잔상 sprite 작동. Phase 1 (5-15) = 시각화 통합·admin UI 정리. **Phase 2/3 = 잔상이 *동적*으로 mutate·생성되는 자리**. quilt 작업할 때 같이 박음. 이유: quilt cell 간 attaching map 위에서 잔상이 cell 간 이동·혼합·새 cell 생성 트리거 같은 역할 → 잔상 동적 메커니즘 + quilt 위상 구조가 한 framing.

### Phase 2.0 — 잔상 등장 게이팅 = 공간 오염 필드 (2026-05-16 결정)

mutation/생성의 *전제*. 잔상이 언제 보이는지부터 정해야 그 위 변형이 의미를 가짐.

**현재 상태 (미구현 — 작가가 코멘트로 "V3 확장" 미뤄둠):**
- `play-test.html:5023` `getPollutionAt(_x, _z)` — 좌표 인자를 받지만 *버림*. 반환 = `plays.alignment` 평균 역수, **메모리 전체 단일 스칼라**.
- 결과: 같은 `pollution_threshold` 잔상은 메모리 어디 있든 *전부 같이* 켜짐. 공간/장면 연관 0.

**결정 (사용자 5-16):** 잔상 등장을 *공간 오염 필드*로. 작가가 잔상↔장면을 명시적으로 안 묶음 — 오염이 공간에 퍼지며 잔상이 자연 발생. 이본론 정합("오염은 퍼지며 변형, 통제 X").

목표:
- `getPollutionAt(x, z)` → 좌표별 값. plays 의 공간 분포를 가우시안 누적 — 각 play 를 (v, a) 또는 응답 좌표에 가우시안으로 박고 (x, z) 에서 sample.
- 잔상 게이팅 = `getPollutionAt(잔상.x, 잔상.z) >= 잔상.pollution_threshold`.
- 작가가 박는 건 잔상 좌표 + threshold (이미 5-16 admin UI 구현). 등장 여부는 플레이 누적이 공간적으로 결정.

미명시 결정 변수:
1. play 의 "위치" — plays 에 응답 좌표가 저장되나? scene 의 stage_position? 응답 감정 VAD 투영? plays 스키마 확인 필요.
2. 가우시안 커널 폭(σ) — 오염이 한 점에서 얼마나 넓게 번지나.
3. 시간 감쇠 — 옛 play 의 오염 기여가 시간에 따라 옅어지나.
4. threshold 의미 재확인 — 공간 필드에서 0~1 정규화 기준.
5. quilt cell 과의 관계 — cell 경계가 오염 필드를 자르나, 연속인가.

**호환성:** 5-16 구현한 잔상 편집 UI(text + pollution_threshold 슬라이더)는 B 와 그대로 맞물림. 바뀌는 건 `getPollutionAt` 내부뿐.

### Phase 2 — 잔상 mutation (사례 1)

플레이어가 잔상 A 보고 → 장면 B 진입 → 장면 C 언락. 이 시점에 잔상 A가 *장면 C의 결*로 살짝 변형.

미명시 결정 변수:
1. "결"이 무엇인가 — keyword 일부 치환? echo_words 흡수? 감정 톤 (VAD shift)? 작가 톤 가드 어디까지?
2. mutation 트리거 — 장면 언락 한 번에 즉시? n번 누적 후? alignment 임계 만족 시?
3. mutation 적용 범위 — 모든 잔상? 가장 가까운 잔상만? 시선 교차한 잔상만?
4. idempotency — 같은 경로 N회 통과 시 잔상이 N번 변형? 한 번 잠금? 시간 감쇠?
5. 작가 보호 가드 — mutation 허용/금지 플래그? 변형 가능 키워드 화이트리스트?

연동:
- 별이엔진 `transition_pattern` (echo_follow / bridge / contradiction / displacement / avoidance / fixation) → 잔상 변형 방향 가이드
- ContaminationTracker 3축 (divergence / convergence / heterogeneity) → 변형 강도 조절
- 작품 철학 (§6.2 Biased Mutation + Mnemonic Recombination) 실시간 구현

### Phase 3 — 새 잔상 자동 생성 (사례 2)

플레이어가 DB에 없는 결의 답변 → 지형에 잔상 C 자동 생성. 잔상 A로 돌아가면 잔상 A도 그 새 결로 변형.

미명시 결정 변수:
1. "DB에 없는 결" 판정 룰 — LLM 호출 금지 (`feedback_no_llm_judgment`). 결정론적 기반: mismatch_type='unknown' + alignment_score < 임계 + 오염 3축 거리. 구체 임계값 미정.
2. trajectory_bridges 테이블 재활용 (§7 이미 존재) — 자동 승인 흐름, source_run_id + source_completed_sentence 박힌 자리.
3. 새 잔상의 공간 좌표 부여 — 답변 감정 벡터 VAD 투영? scene B 근처 jitter? quilt cell 내 자유 위치?
4. 합병·감쇠·만료 — 한 메모리 잔상 수 폭발 방지. 만료 룰: 시간 / 도달 횟수 / pollution_threshold 기반?
5. 잔상 C 생성 시 잔상 A 변형 — 모든 기존 잔상이 새 답변 결로 *연쇄 변형*? 또는 잔상 A만 (사용자 직전 경로)? 또는 잔상 C 좌표 부근만?

연동:
- `trajectory_bridges` 자동 승인 → 작가 검토 없이 잔상 sprite 풀에 흡수
- `ghost_condensation_points` 동적 확장 → 메모리 진입 시점에 누적된 잔상 풀 로딩
- 메모리 `project_ghost_disguise_mode.md` "기여도 큰 플레이어는 본인 아바타가 잔상으로 남아 다음 세대의 직전 전달자가 됨" — Phase 3 실현체

### 무게

작품 안에 *기억유전학 6작용 실시간 구현*이 박힘 → critic 좌표 (`project_tem_critic_anchor`) anchor 점수 큰 이동 가능. 박사 제안서·논문 트랙 A와 직접 묶이는 자리.

### V3 작업 항목 (추정 추가)

| 작업 | 추정 일수 | 비고 |
|---|---|---|
| V3-10b 잔상 등장 공간 오염 필드 (Phase 2.0) | 2~3 | getPollutionAt 좌표별 가우시안 + plays 위치 데이터 |
| V3-11 잔상 mutation 알고리즘 (Phase 2) | 3~4 | "결" 정의 + 별이엔진 연동 + 작가 톤 가드 |
| V3-12 잔상 자동 생성 (Phase 3) | 2~3 | trajectory_bridges 확장 + 결정론 판정 룰 + 좌표 부여 |
| V3-13 잔상 합병·감쇠 정책 | 1~2 | 폭발 방지 |

코드 추가 = **8~12일**. 본인 페이스 적용 = 13~20일 실 작업.

### 관련 코드 자리 (Phase 1 끝난 후 들어가는 곳)

- `js/ui/lumen_scene_ghosts.js` — 잔상 sprite 렌더링
- `memories.ghost_condensation_points` — 잔상 풀 저장
- `trajectory_bridges` 테이블 — 자동 생성 잔상 백엔드
- `js/core/ByeoriEngine.*` — transition_pattern 출처 (잔상 변형 방향)
- `js/core/ContaminationTracker.*` — 3축 (잔상 변형 강도)

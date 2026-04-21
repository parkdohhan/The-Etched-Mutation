# LUMEN 2026 DEMO SCOPE

**제출 마감**: 2026-05-23
**안전 마감**: 2026-05-19 (buffer 4일)
**작성**: 2026-04-21
**기반 문서**: `docs/update_lumen-260420.md`, IMA 비평 판정 (2026-04-20, 83점 B+)

---

## 0. 이 문서의 성격

계약서다. 문서 밖 작업은 Lumen 스코프 밖이다.
새 아이디어는 `docs/V2_backlog.md`로 이월한다.
이 문서를 수정하려면 명시적 결정 필요 — 커밋 메시지에 "scope change" 태그.

---

## 1. 코어 전환 (한 줄)

선형 씬 전환을 AF 지형 1인칭 공간 내비게이션으로 승격.
관객은 WASD로 걷고, 유령을 만나고, 중심 void에 도달한 뒤 귀환한다.
오염은 이동을 제어하지 않는다. 환경 연출(fog·vignette·bob·발소리·drone)에만 쓴다.

## 2. 작품 명제 (변경 불가)

- 관객은 남의 기억을 자기 기억처럼 체험한 뒤, 자기 기억 확신을 잃고 나온다
- 기억 공간은 관객마다 같지 않다 (이본)
- 관객의 파편은 다음 관객의 유령으로 흘러간다

+관객의 파편은 다음 관객의 유령으로 흘러간다 <--이거에 관한 회의 필요

---

## 3. 이미 완료된 것

- [x] 오프닝: 1필드 + 감정 칩 6개 ("어떤 기억을 찾고 있어?")
- [x] 메뉴: Record 흡수, 귀환 후 또다른 나 + 아카이브 노출

## 4. 남은 작업 (13 세션)

### 작업 0 — 어댑터 + DB 마이그레이션 [2 세션]
- `js/ui/lumen_terrain_adapter.js` 신규
- 기존 `enterFirstPerson`, `_fpTick`, `gH`, `buildMemoryItems`, `computeAfTerrainFields` **수정 금지**, 어댑터로만 확장
- 궤적 push, onEnterVoid 이벤트, exitFirstPerson 오버라이드
- DB 마이그레이션:
  - `memories.terrain_shape` (enum: circular)
  - `memories.ghost_condensation_points` (JSON) ⚠️ **DB 컬럼 vs JS 상수 결정 보류** — 아래 "결정 보류" 절 참조
  - `plays.spatial_trajectory` (JSONB)
  - `plays.unreturned_flag` (boolean)

### 작업 1 — 오프닝 흡수 연출 연결 [0.5 세션]
- 입력 → 흡수 연출(`js/ui/Visualizer.js` `setWaveOverride` 기구 존재, 미연결) → AF 지형 진입
- 진입 독백 2문장 유지: "여긴 어디지?" / "나갈 땐 저 문으로 나가면 되겠어"
- 주: `play-test.html:4586-4632`에 exit door + 한국어 대사(`"나갈 땐, 저기로 나가는 게 좋겠어."`) 이미 존재. 이식 + 회귀 방지가 0.5 세션에 들어갈지 Sprint 1 착수 시 판단.

### 작업 3 — 걸음 연출 시스템 [1.5 세션]
- 카메라 bob (진폭은 오염 depth 연결)
- 헤드스웨이 (±1도 yaw 미세 진동)
- 정지 breathing (주기 3~4초, 진폭 1cm)
- 관성 (가속 0.3s, 감속 0.2s)
- 스텝 사운드 (지형 오염 층별 3~5 샘플 로테이션)

### 작업 3b — 시각 연출 레이어 [1 세션]
- Fog 밀도 (FogExp2, 오염 depth 연결)
- Vignette (오염 depth 연결)
- Floating Anchor 거리 재튜닝

### 작업 3c — 청각 공간 레이어 [1.5 세션]
- Positional audio (유령 whisper 방향성)
- Noise floor (오염 depth 연결)
- Depth drone (중심 근접도 연결)

### 작업 4 — scene 잔상 공간 배치 [2 세션]
- 기존 echo word floater 확장
- 유령 응결 좌표에 잔상 텍스트 배치
- VAD → 위치 매핑 검증

### 작업 11 — 미니맵 수정 [0.3 세션]
- 유령 점: 전체 응결 좌표 표시 → **시선 교차로 마주친 유령만** 점 누적 표시
- 출구: 들어온 문과 같은 위치에 고정 표시 (바깥 원 위)
- 기존 미니맵 로직에 조건부 렌더 + 고정 점 추가

### 작업 7 — 메모리 3개 Record + 큐레이션 [2 세션, 분할]
- **신규 Record 3개** (2026-04-21 결정). 기존 아카이브 재활용 안 함.
- 언어 분배 기본값: **2 ko + 1 en** (한국어 파일럿 + 영어 심사자 커버). 역도 가능 — Record 착수 전 최종 확정.
- **분할 실행**:
  - Week 0 (4-21~22, 일본): **Record 2개 (1 ko + 1 en)** 먼저 녹음. [1.3 세션]
    - 이유: Sprint 1 코드가 실제 메모리 데이터로 테스트 가능. Sprint 2 부담 감소.
    - Record는 "조용한 공간 + 인터넷"만 필요 — 코드 환경 불필요.
  - Sprint 2 (4-28~30): **잔여 Record 1개 + 큐레이션 전체** [0.7 세션]
    - `terrain_shape = circular` SQL 업데이트
    - `ghost_condensation_points` 좌표 + 임계값 (작업 12 Admin UI로 편집)
- 품질 기준:
  - 장면 3~5개
  - PII 없음, 안전 트리거 없음
  - Lumen 심사자 3~5분 체험 분량
  - 작가가 파일럿 n=5~7 반복 재생해도 버틸 감정 톤
- 감정 클러스터링 방지: 3개의 감정 앵커·AF 좌표가 충분히 분산되도록 의식 (이본 시연의 근거).

### 작업 2 — 귀환 구조 풀 [3.5 세션]
- 2-A: 궤적 기록 (`_fpTrajectory.push`, 150ms 단위) + rewind 재생 [1]
- 2-B: 색감 shift + 속도 ×1.5 + 유령 자세 변화 [1]
- 2-C: 유령 말투 미세 변화 + 입력 파편 재셔플 [1]
- 2-D: 귀환 전용 사건 2~3개 (입력 파편 공중 출몰 등) + 통합 [0.5]

### 작업 8 — Artist statement 계보 명시 [1 세션]
- 3~4명 실명 레퍼런스 (본인이 실제 아는 작가만)
- 후보: Lozano-Hemmer / Yoko Ono / 오수경 / 하차연 / Lynn Hershman Leeson / Ian Cheng
- TEM을 어느 계보 교차점에 놓는지 선언

### 작업 9 — 증거 패키지 [1.5 세션]
- 스크린샷 4~10장 (시작 / 첫 유령 / 중간 / void / 귀환 / 종료)
- 1~2분 데모 영상 (OBS 녹화, 간단 편집)
- 짧은 프로젝트 설명 (Lumen 카테고리 맞춤)

### 작업 12 — Admin 응결점 튠 UI [0.8 세션]
- `admin.html` 내 탭 추가 or 기존 Canvas 탭에 subview
- 기억 선택 → 원형 지형 SVG 위에 응결점 드래그 편집
- 필드: `x`, `z`, `pollution_threshold`
- 저장: `memories.ghost_condensation_points` JSON 업데이트
- 범위 축소: 동심원 overlay·layer_radii·center_void 좌표는 V2 유지. 이 작업은 **응결점 CRUD + 임계값만**.

### 작업 10 — 파일럿 n=5~7 [별도, 5-09~13]
- 5월 초 대상자 확정, 5-09~13 실시
- 관찰 항목: 첫 30초 개념 감지, 튜토리얼 탐색 여부, void 체류, 귀환 후 자유 응답
- 조작적 정의는 5-07 외부 시연 전에 별도 체크리스트 md로 확정 (사후 cherry pick 방지)
- 결과는 작업 8·9에 반영

---

## 5. V2 연기 (건드리지 말 것)

**코드 건드릴 유혹이 올 때 여기로 이월**:

- TTS / 자기 목소리 유령 / plays.first_input_field*
- 오염 3축 중 convergence, divergence (이동 제어 X)
- Admin UI 확장 (Canvas 지형 모드, 운영 탭 필터 등)
- 화면 가장자리 왜곡 shader
- Reverb (ConvolverNode)
- 숨소리
- trajectory_bridges / 개인 아바타 유령
- 연출 레이어 L (포트 경향성), M (유령 경로)
- 기억유전학 v0.4 확장
- SoundscapeBeta + sound_map 전면 제거 (레거시 대청소)
- MM23L 자유 키 감정 모델 재설계
- ghost_presets DB화

---

## 6. 수정 금지 함수

**모두 [js/shared/tem_af_strata_terrain.js](../js/shared/tem_af_strata_terrain.js) 한 파일에 위치.** 어댑터는 이 파일을 import만 할 것.

```
enterFirstPerson       (L1159)
_fpTick                (L1159 enterFirstPerson 내부)
gH                     (L645)   ⚠️ 중복본: js/af-terrain-test-page.js:414 — canonical은 tem_af_strata_terrain.js
buildMemoryItems
computeAfTerrainFields
```

이 함수들은 한 글자도 수정하지 않는다. Lumen 작업은 어댑터 패턴으로만 확장한다.
위반 시 regression 위험이 크다.

---

## 7. 일정

| 구간 | 기간 | 내용 | 세션 |
|---|---|---|---|
| Week 0 (일본) | 4-21~22 | 문서 · DB SQL · Record 2개 (ko+en) · 귀환 컴포넌트 정의 | 2.1 |
| 귀국/시차 | 4-23 | 휴식 | — |
| Sprint 1 | 4-24~26 | 작업 0 + 3 + 3b + 3c + 11 | 6.3 |
| 통합일 | 4-27 | 본인 한 바퀴 + 버그 리스트 (코드 금지) | — |
| Sprint 2 | 4-28~30 | 작업 1 + 4 + 7(잔여 Record 1 + 큐레이션) + 12 | 4.0 |
| 통합일 | 5-01 | 메모리 1개 풀 사이클 체험 (귀환 빼고) | — |
| Sprint 3 | 5-02~05 | 작업 2 (귀환 풀) | 3.5 |
| 통합일 | 5-06 | 귀환 포함 풀 사이클 체험 | — |
| 외부 시연 | 5-07~08 | 친구 1~2명 비공식 | — |
| 파일럿 | 5-09~13 | n=5~7 실시 + 정리 | — |
| Sprint 4 | 5-14~16 | 작업 8 + 9 | 2.5 |
| 버퍼 | 5-17~19 | 파일럿 반영 + 최종 점검 + 제출 | — |

**총 코드 세션**: 15.1 (원안 13.3 + 작업 12 0.8 + 작업 7 확장 1.0)
**총 기간**: 28일 (4-22 ~ 5-19)

---

## 8. 작업 원칙

1. 스프린트 끝나면 통합일. 통합일에 코드 커밋 금지. 체험 + 메모만.
2. 같은 파일을 2시간 내 3번 이상 수정 시도 시(기능 추가가 아니라 디버깅) 작업 중단, 10분 쉰 뒤 재개.
3. 스코프 밖 작업 욕구는 즉시 `docs/V2_backlog.md`에 기록하고 본 작업 복귀.
4. 통합일마다 "이번 스프린트에서 하고 싶었는데 안 한 것" 리스트를 `V2_backlog.md`로 이월.
5. Week 3 귀환 작업 시작 전(5-01 통합일)에 귀환 8개 컴포넌트 "최소 작동 정의" 문서 재검토.
6. 5-09까지 3-A/B/C 중 하나라도 미완이면 **2-D(귀환 전용 사건)를 즉시 V2로 포기**.

---

## 9. 결정 기록

### 9-1. `ghost_condensation_points` 저장 위치 — **A-2 확정 (2026-04-21)**
- DB 컬럼 `memories.ghost_condensation_points` (JSON) 유지.
- Admin 튠 UI를 Lumen 스코프에 포함 (작업 12 참조). 드래그 편집으로 iteration 속도 확보.
- 근거: 파일럿·큐레이션 단계에서 좌표 튜닝 iteration이 클 것으로 예상. SQL 직접 편집은 iteration 속도가 JS 편집보다도 느림 — A-1은 B보다 열등. A-2를 수용하려 0.8 세션 스코프 확장.

---

## 10. 성공 판정 (5-19 기준)

제출 전 체크:

- [ ] AF 지형 1인칭 공간 내비게이션 작동
- [ ] 귀환 풀 사이클 작동 (궤적 기록·재생·3종 이상 변화 신호)
- [ ] 메모리 1~2개 end-to-end 체험 가능
- [ ] 파일럿 n≥5 결과 정리됨
- [ ] 스크린샷 4~10장 + 영상 1~2분 확보
- [ ] Artist statement 계보 3~4명 명시
- [ ] Lumen 제출 양식 작성 완료

위 7개 중 하나라도 미충족 시, 5-17~19 버퍼를 해당 항목에 투입.
버퍼로도 못 채우는 항목이 있으면, 해당 항목을 제외하고 제출 or 제출 포기 판단.

---

## 11. 비상 시나리오

**시나리오 A — Sprint 3 귀환 작업 지연 (5-13까지 2-C/D 미완)**
- 2-D 포기
- 2-C 부분 구현(말투 변화만, 파편 재셔플 연기)
- Sprint 4 일정대로 진행

**시나리오 B — 파일럿 n<5 (5-13까지 3명만 실시)**
- n=3으로 증거 패키지 작성
- artist statement에 "파일럿 초기 관찰 (n=3)"으로 명시
- 제출 진행

**시나리오 C — 치명 regression 발견 (5-15 이후)**
- 해당 기능 off (feature flag)
- 작동 가능한 범위로 영상·캡처 재촬영
- 제출은 유지

**시나리오 D — 완수 불가 (5-17 시점 판단)**
- Lumen 제출 철회 or 카테고리 하향
  (※ 원본의 "Interactive Art+ → Digital Art 일반"은 Ars Electronica 용어. Lumen 실제 카테고리명은 제출 직전 확인 후 교체)
- TEM 현재 상태로 아카이브, 7월 파일럿 이후 다음 공모전 재도전

---

## 12. 관련 문서

- `docs/update_lumen-260420.md` — 계획 원본
- `docs/V2_backlog.md` — 연기 항목 전부 (md-date 훅이 `V2_backlog-260421.md`로 리네임함)
- `CLAUDE.md` — Claude Code 세션 가드레일 (현재 `CLAUDE-260418.md`)
- `prompt/critic.md` — critic v3 프롬프트. TEM 83점 B+ 판정 좌표계 기준점 (2026-04-20).
- `docs/LUMEN_return_components.md` — 귀환 8개 컴포넌트 최소 작동 정의 (작성 예정, 5-01 전)
- `docs/pilot/*.md` — 파일럿 관찰 기록 템플릿 (작성 예정, 5-07 전)

# Hand-off — 작업 15 (Admin 두 레이어 분리 + 시뮬 동기화)

이 문서는 한 세션의 컨텍스트를 다음 세션 / 다른 작업자가 이어받을 수 있게 정리한 핸드오프.

---

## 1. 무엇을 하고 있었나

사용자 비전 (원문):
> admin에서 두 가지 레이어로 기억을 통제. (1) 궤적 레이어 = 기존 2-D 노드형, 드래그가 분기에 영향. (2) 위치 레이어 = strata 지형 위에 유령들이 서있고, 시뮬 재생 시 궤적에 따라 나타나거나 사라짐. 위 노드는 활성 장면 하이라이트.

작업 15 로 [docs/LUMEN_DEMO_SCOPE-260427.md](LUMEN_DEMO_SCOPE-260427.md) §4 에 추가 (당일 scope change). v1/v2/fallback 까지 진행. **player runtime 연결은 미완**.

---

## 2. 된 것 (커밋된 상태)

4 commits on `main` (마지막 1개는 미푸시):

| SHA | 내용 |
|---|---|
| `5247e7b` | v1 — 두 레이어 분리, drag→stage_position, 시뮬 sync, 패턴 색, smoke 11/11. saveMemoryGraph meta 보존 latent 버그 동시 수정 |
| `f6397d8` | resizer — 분할 핸들 (20%~85% 클램프, dblclick 50:50, localStorage 영속), smoke 5/5 |
| `18a1d50` | v2 — strata terrain mesh 직교 top-down (THREE.js OrthographicCamera), 시뮬 자동 재생 + 속도 슬라이더 |
| `b6b22d2` | fallback chain — manual / af / emotion / order 4단계, 모든 씬이 무조건 깔림. 콘솔 smoke 20/20 |

`d43b95f` 에 `test/ybot.fbx` (34MB, .gitignore force add) — mannequin 모듈용.

origin 까지 push 된 마지막 = `18a1d50`. `b6b22d2` 는 로컬 ahead 1.

---

## 3. 핵심 파일

| 파일 | 역할 |
|---|---|
| [js/ui/lumen_admin_stage_view.js](../js/ui/lumen_admin_stage_view.js) | 위치 레이어 모듈. SVG 오버레이 + THREE.js terrain canvas (z:0 아래) + 드래그 + fallback chain + sim sync |
| [js/admin-trajectory.js](../js/admin-trajectory.js) | Canvas 탭 전체. `bindLayerResizer`, `togglePlaySim`, `syncStageView` 등 |
| [admin.html](../admin.html) | `tv-canvas-wrap` 상하 분할 + resizer 핸들 + 시뮬 패널 (▶재생/속도 슬라이더) |
| [js/lib/repo.js:282-285](../js/lib/repo.js#L282-L285) | saveMemoryGraph insertData 의 `meta` 추가 (latent 버그 fix) |
| [test/smoke_task_15.js](../test/smoke_task_15.js) | 콘솔 smoke (DevTools 붙여넣기, 20 checks) |
| [test/e2e/smoke_task_15.mjs](../test/e2e/smoke_task_15.mjs), [smoke_task_15_v2.mjs](../test/e2e/smoke_task_15_v2.mjs), [smoke_layer_resizer.mjs](../test/e2e/smoke_layer_resizer.mjs) | Playwright e2e |

`scene.meta.stage_position = {x, z}` — DB 컬럼 신설 X, JSONB 활용.

---

## 4. **안 된 것 — 핵심 갭**

### 4-1. **stage_position 이 player 에 미반영** (사용자가 마지막에 지적)

진단:
- admin drag → `scenes.meta.stage_position` 저장 ✅
- player runtime ([js/ui/lumen_scene_ghosts.js](../js/ui/lumen_scene_ghosts.js)) 는 `memories.ghost_condensation_points` (메모리 단위 응결점) 만 사용. `stage_position` 키워드 grep 0건.
- 두 개념 차이:
  - `ghost_condensation_points` = 메모리 단위 잔상 단어 좌표 풀. echo_words modulo 매핑.
  - `stage_position` = 씬 단위 1좌표. 한 씬 = 한 유령 매핑.

**미결정 — 어느 옵션으로 갈지**:
- **A. 두 레이어 공존** (추천) — scene_ghosts 가 응결점 sprite + scene-stage sprite 둘 다. 의미 분리 보존.
- **B. stage_position 으로 흡수** — 응결점 폐기, 씬 단위로 통합. 마이그레이션 필요.
- **C. admin 위치 레이어 = 응결점 편집기로 재정의** — stage_position 폐기. player 변경 0.

사용자 비전 ("씬 → 유령 → 위치") 에 자연스러운 건 A 또는 B.

### 4-2. 다른 잔여
- **유령 시각화** — 점(circle)+라벨, 사용자 작업 중인 [js/ui/lumen_scene_mannequins.js](../js/ui/lumen_scene_mannequins.js) (323 lines, 신규) 통합 안 됨.
- **등장/퇴장 페이드** — 즉시 toggle, opacity 트랜지션 없음.
- **CI 워크플로우 실패** — `npm test` 로컬 261/261 PASS. 사용자가 GH Actions 실패 보고했으나 실제 실패 로그 없이 진단 불가. 후보: ybot.fbx checkout 시간 / npm ci / node 버전 (CI:20, 로컬:24.11.1). 해결: 사용자에게 실패 단계 로그 요청 필요.

---

## 5. 다음 세션 시작점

1. **사용자 답을 받을 것**: 4-1 의 옵션 A/B/C 중 어느 쪽으로 갈지.
2. **CI 실패 로그**: GitHub Actions 의 마지막 빨간 단계 식별 (Checkout / Setup Node / npm ci / npm test 중 어디).
3. **검증**: `npm run dev` → admin.html → Canvas 탭. status 라벨이 "씬 N · 수동 X · AF Y · 감정 Z · 순서 W" 표시되면 정상.
4. **콘솔 smoke**: DevTools Console 에 [test/smoke_task_15.js](../test/smoke_task_15.js) 통째 붙여넣기 → 20/20 PASS 기대.

---

## 6. 사용자 컨텍스트 (핸드오버 시 주의)

- 학부생, 박사 진학 고려. 시간 추정 학부 기준.
- 페이스 calibration: 스코프 N 세션 ≈ 체감 4~5×. 촉박함 섣부르게 주장 X.
- 병렬 세션 선호 (충돌 없는 작업 적극 묶음).
- "지지됨·증명" 단어 금지 (overselling). 한계·confound 함께 첫 제시.
- LLM 추가 호출로 분기 판정 X (결정론적 룰 기반).
- 메모리에 계획·일정 류 저장 X (사실/결정/맥락만).

자세한 메모리 인덱스: `~/.claude/projects/-Users-parksojung-The-Etched-Mutation/memory/MEMORY.md`.

---

## 7. 마지막 turn 요약

마지막 사용자 메시지: "이게 실제 위치에 반영되는 거 맞아?" → 답: 미반영. 옵션 A/B/C 제시. **사용자 응답 대기 중**.

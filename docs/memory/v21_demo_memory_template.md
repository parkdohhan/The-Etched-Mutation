# V2.1 데모 메모리 작성 템플릿

> **목적**: V2.1 LUMEN 데모 (5-19 마감) 에 박을 메모리 1개를 작가가 *오프라인* 으로 짜는 자리.
> **흐름**: 이 파일에 짜놓고 → 다른 세션 Task 2/3 (extractor_version 컬럼 + calibration 도구) 끝난 후 → 콘솔 코드로 일괄 INSERT.
> **장점**: admin UI 안 건드림 = 다른 세션과 충돌 0. 12축 좌표 손으로 박을 필요 X (calibration 끝나면 claude-scene 자동 추출).
>
> **분량 가이드** (SCOPE V2-10):
> - 씬 5~7개
> - drift 변주 10~15개 (유령 본 발화 1개 포함)
> - speciation 시드 1~2개

---

## 메모 / 짜기 메모

> 작가가 짜다 막히는 자리, 결정 자리, 메모 박는 곳.

- 메모리 톤:
- 핵심 명제:
- 시드 분기 의도 (시나리오 D 보험):
- 기타:

---

## 1. 메모리 본문

> [memories](../../supabase/migrations/) 테이블 행 1개. admin 작업 12 와 동일 필드.

| 필드 | 값 |
|---|---|
| **title** | (메모리 제목, 한국어 또는 영문 — W1S4 결정 따라) |
| **code** | (영문 짧은 식별자 예: `winter_door`) |
| **description** | (1~3줄 짧은 설명. 메모리 선택 시 노출되는 자리.) |
| **memory_words** | (모티프 단어 풀, 5~10개 — 공백 구분 또는 배열) |
| **persona_context** | (옵션. 페르소나 시뮬용 *읽기 맥락* 자리. V2.1 데모는 필수 X.) |
| **status** | `published` (또는 `draft` 로 박아두고 검증 후 변경) |
| **is_public** | `true` |

**유령 응결점 좌표** (`ghost_condensation_points`):
> ⚠️ 좌표는 **admin UI 에서 클릭으로 박는 자리**. 텍스트로 짤 수 X. 본문 / 씬 / 변주 다 짠 후 admin 열고 클릭.

---

## 2. 씬 5~7개

> [scenes](../../supabase/migrations/) 테이블 행. `original_emotion` 12축은 **자동 추출** 자리 (calibration 끝난 후 claude-scene 호출). 작가는 *텍스트만* 짜면 됨.

### 씬 1
- **scene_order**: 1
- **text**:
  ```
  (씬 본문 — 한 단락 또는 짧은 장면)
  ```
- **motif_tags**: [예: 엄마, 김치찌개]
- **anchor_emotions**: (옵션, 박아두면 매칭 입력 자리)
- **original_emotion**: ⏳ 자동 추출 예정

### 씬 2
- **scene_order**: 2
- **text**:
  ```
  (씬 본문)
  ```
- **motif_tags**: []
- **original_emotion**: ⏳ 자동 추출 예정

### 씬 3
- **scene_order**: 3
- **text**:
  ```
  (씬 본문)
  ```
- **motif_tags**: []
- **original_emotion**: ⏳ 자동 추출 예정

### 씬 4
- **scene_order**: 4
- **text**:
  ```
  (씬 본문)
  ```
- **motif_tags**: []
- **original_emotion**: ⏳ 자동 추출 예정

### 씬 5
- **scene_order**: 5
- **text**:
  ```
  (씬 본문)
  ```
- **motif_tags**: []
- **original_emotion**: ⏳ 자동 추출 예정

> 6~7번 씬 필요 시 위 패턴 복붙.

---

## 3. 유령 변주 풀

> [ghost_variants](../../supabase/migrations/20260503000000_v21_ghost_variants_and_dialog_turns.sql) 테이블 행. **emotion_vec 12축은 자동 추출 예정** (작가가 손으로 박을 필요 X).
>
> **enum 값 정합** (V2-1 CHECK 제약):
> - `attribution`: `self_blame` / `other_blame` / `fate_blame` / `unknown`
> - `core_fear`: `abandonment` / `death` / `rejection` / `failure` / `none`
> - `modality`: `visual` / `olfactory` / `auditory` / `somatic` / `narrative`
> - `role`: `actor` / `observer` / `victim`

### 유령 본 발화 (drift, is_seed=true)
> 모든 drift 변주의 *시작점* = "기본 유령". 1개만.

- **kind**: `drift`
- **is_seed**: `true`
- **parent_variant_id**: `null` (root)
- **utterance**:
  ```
  (유령 기본 발화 본문 — 1~1000자)
  ```
- **attribution**: (예: `self_blame`)
- **core_fear**: (예: `abandonment`)
- **modality**: (예: `somatic`)
- **role**: (예: `actor`)
- **motif_tags**: []
- **pose**: (옵션 — "쪼그려 앉음, 등 돌림 ...")
- **emotion_vec**: ⏳ 자동 추출 예정

---

### drift 변주 1
> 같은 유령의 *다른 결* 발화. 본 발화에서 미세하게 변형된 버전.

- **kind**: `drift`
- **is_seed**: `false`
- **parent_variant_id**: `null` (drift 변주는 root, speciation 만 부모 박음)
- **utterance**:
  ```
  (변주 본문)
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 2
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 3
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 4
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 5
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 6
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 7
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 8
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 9
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 10
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 11
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### drift 변주 12
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

> 13~15번 변주 필요 시 위 패턴 복붙.

---

## 4. speciation 시드 (새 유령) 1~2개

> *다른 유령*. 강한 일탈자가 만든 시드 — V2.1 시나리오 D 보험. 후속 플레이어 만남 (β) 자리.

### speciation 시드 1
- **kind**: `speciation`
- **is_seed**: `true`
- **parent_variant_id**: (어느 drift 변주에서 갈라졌나 — drift 변주 1~15 중 ID. 콘솔 INSERT 시 박음. 지금은 *힌트*만 박아두면 됨: 예 "drift 변주 5 (강한 일탈 자리)")
- **parent_variant_id_hint**: (예: drift 변주 5 — 가장 강한 일탈 자리)
- **utterance**:
  ```
  (새 유령 발화 본문 — 본 유령과 가족유사성 있되 결정적으로 다른 path)
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

### speciation 시드 2 (옵션)
- **kind**: `speciation`
- **is_seed**: `true`
- **parent_variant_id_hint**:
- **utterance**:
  ```
  ```
- **attribution**:
- **core_fear**:
- **modality**:
- **role**:
- **motif_tags**: []
- **pose**:
- **emotion_vec**: ⏳ 자동 추출 예정

---

## 5. 작성 후 흐름 (작가 본인 체크리스트)

다른 세션 Task 2/3 + 본문 작성 끝난 후:

- [ ] 메모리 본문 (제목/코드/설명/모티프) 짜기
- [ ] 씬 5~7개 본문 짜기
- [ ] 유령 본 발화 1개 짜기
- [ ] drift 변주 10~15개 짜기
- [ ] speciation 시드 1~2개 짜기
- [ ] *(다른 세션 Task 3 완료 후)* `test/emotion_calibration.html` 열고 5~10 텍스트로 추출기 직관 차이 1번 보기
- [ ] *(다른 세션 Task 2 완료 후)* 콘솔 코드 INSERT 흐름 메인 세션에 부탁:
  - memories INSERT
  - scenes INSERT (각 씬 text → claude-scene emotion_extract → original_emotion 박음)
  - ghost_variants INSERT (각 utterance → emotion_extract → emotion_vec + extractor_version 박음)
- [ ] admin 열고 유령 응결점 좌표 클릭으로 박기
- [ ] play-test 진입 → 멀티턴 1 사이클 풀 검증

---

## 6. 참고 자료

- [V2.1 SCOPE](../LUMEN_DEMO_SCOPE-260506.md) — V2-10 콘텐츠 작성 자리
- [메모리 워크시트 V1](../lumen_memory_story_worksheet-260421.md) — V1 시점 워크시트 (참조)
- [메모리 작성 체크리스트 V1](../lumen_memory_authoring_checklist-260421.md) — V1 시점 체크리스트
- [ghost_variants_editor.js](../../js/admin/ghost_variants_editor.js) — admin 변주 풀 입력 카드 UI (필드 정합 자리)
- [ghost_variants 마이그레이션](../../supabase/migrations/20260503000000_v21_ghost_variants_and_dialog_turns.sql) — DB 스키마 + CHECK 제약 enum

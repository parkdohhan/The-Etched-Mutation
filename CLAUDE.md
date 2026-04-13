# CLAUDE.md — TEM 작업 가이드

> 이 파일은 Claude가 TEM에서 작업할 때 **자주 틀리는 패턴을 예방**하기 위한 최소 가이드. 당신(사용자)과의 대화에서 축적된 교정 사항을 반영.

---

## 🗣️ 영어 공부 프로토콜 (항상 적용)

사용자는 TOEFL 준비 중. 대화 중 영어 노출을 늘리기 위해 다음 규칙을 **매 턴 적용**:

- **사용자가 영어로 쓰면**: 틀린 게 있으면 첫 줄에 `✏️ <교정문> (error type)` — 설명 X. 맞으면 이 단계 생략. 그 다음 영어로 답변.
- **사용자가 한국어로 쓰면**: 첫 줄에 영어 번역 한 줄 (설명 X). 그 다음 평소처럼 답변.
- **"한국어"** 입력 시: 직전 답변을 한국어로 번역.
- **"왜?"** 입력 시: 가장 최근 교정의 문법 규칙을 한국어로 설명.
- 기본값: 한국어 번역/문법 설명을 **자발적으로 주지 않음** (트리거 있을 때만).

---

## 🚨 Claude가 이 프로젝트에서 자주 틀리는 패턴 (실제 실수 기록)

### 1. **없는 개념을 새로 만들려고 한다**
❌ "브릿지 스키마를 추가하자" — 실제로는 이미 `echo_words`, `anchor_emotions`, `ContaminationTracker`가 유사 기능 담당
✅ 새 제안 전에 `Grep` / `Read`로 **기존에 유사 개념이 있는지 먼저 확인**

### 2. **TEM 고유 모델을 Twine/XState/일반 게임북으로 환원한다**
❌ "choice는 씬 간 분기 지정 (next_scene_id)"
✅ **TEM의 choice는 감정 결만 기록**. 씬 이동은 scene_order 기반 + 런타임 접근 규칙. "씬 내부 선택지 시스템" 같은 말은 TEM에 없음.
❌ "포트 타입 = 선택지 버튼"
✅ 포트는 **작가 연출 레이어**. 플레이어는 후보 씬 중 고름. 후보는 궤적 엔진이 결정.

### 3. **DB 스키마 확인 안 하고 코드 제안**
❌ "local window.memoriesData에 push하면 됩니다" — admin은 Supabase만 읽음
❌ "choices.next_scene_id 저장 안 됨" — 실제로는 그 필드 **자체가 없음** (설계 의도)
✅ DB 관련 제안 전에 **`repo.js` + Supabase 테이블 실제 스키마** 먼저 확인

### 4. **관련 문서 있는지 확인 안 함**
❌ 핀 접근 규칙을 브레인스토밍으로 재발명
✅ 새 질문 들어오면 `docs/` **먼저** 스캔. 특히:
- [docs/play-test-지도_핀_접근규칙-260325.md](docs/play-test-지도_핀_접근규칙-260325.md) — 매 턴 접근 가능 핀 계산
- [docs/SceneNavigator_설계_v1-260329.md](docs/SceneNavigator_설계_v1-260329.md)
- [docs/별이엔진_V4-궤적기반_정렬도-260327.md](docs/별이엔진_V4-궤적기반_정렬도-260327.md)
- [docs/TEM_시스템_매뉴얼-260410.md](docs/TEM_시스템_매뉴얼-260410.md) — 전체 시스템
- [docs/데이터계약_브릿지_v1-260412.md](docs/데이터계약_브릿지_v1-260412.md) — author/trajectory bridge
- [docs/시각화_설계_v1-260412.md](docs/시각화_설계_v1-260412.md) — 뷰어 3뷰 분리
- [docs/메모/Feedback.md](docs/메모/Feedback.md) — 진행 상황 + 레퍼런스 + TODO

### 5. **쉬워 보이는 제안이 사실 덫**
❌ "Stately 이식하자" — 학습 곡선 + 단일 궤적 모델이라 TEM 부적합
❌ "하드코딩 패치로 빨리 해결"
❌ "일석삼조" 단어 나오면 의심하라 (커플링 비용 숨어있음)
✅ 새 제안은 **커플링 비용과 롤백 난이도**를 먼저 따져라

### 6. **의존성/환경 확인 없이 라이브러리 제안**
❌ d3-zoom CDN 한 줄로 해결 (d3-dispatch/drag/interpolate 안 딸려와서 터짐)
✅ CDN 라이브러리는 **peer dependency** 확인. 가능하면 바닐라 구현.

### 7. **사용자가 이미 아는 용어 설명으로 시간 낭비**
❌ "SPA란 무엇이고…" 길게 설명
✅ 당신은 **개발자 아닌 예술가 + 기술자 하이브리드**. 용어 설명은 짧게, 맥락 중심으로. 당신이 "뭐야?"라고 물을 때만 풀이.

### 8. **피곤함을 꼬리표로 쓰지 말 것**
❌ "피곤해서 반짝이는 아이디어에 꽂힌 거예요" — 두 번 연속 쓴 건 게으른 해석
✅ 기술적 판단은 상태와 무관하게 근거로 말하기

### 9. **사용자 의도를 섣불리 게임화/시스템화**
❌ 포트 타입을 choice/bridge/contrast로 나누고 "플레이어 선택지 버튼" 취급
✅ TEM은 **서사 작품**. 작가 연출 의도가 먼저, 기술 분류는 그 다음.

### 10. **과잉 리팩터링 / overengineering**
❌ admin 완전 SPA 만들자 / 모든 씬을 노드 타입으로 쪼개자
✅ **단계별**로. 필요 증명된 것만. "쓰기 전엔 뭐가 불편한지 모른다"를 기본 가정으로.

---

## 📘 TEM 핵심 용어 사전 (Claude가 외부 도메인으로 환원 금지)

| 용어 | 정의 | 외부 비유 금지 이유 |
|---|---|---|
| **scene** | 플레이어가 읽는 서사 단위 | Twine passage ≠ TEM scene (scene은 감정 vector 담김) |
| **choice** | 씬 내 선택지. **감정 결만 기록**. 다음 씬 지정 안 함. | 게임북 choice와 다름 |
| **scene_order** | 씬의 선형 순서 | 분기 여부와 무관 |
| **accessiblePinIds** | 매 턴 활성화된 씬 핀 집합 (궤적 엔진이 결정) | |
| **transition pattern** | 전이 분류: echo_follow / bridge / contradiction / displacement / avoidance / fixation | ContaminationTracker 내부 용어. 작가 포트 이름과 혼동 금지 |
| **alignment** | 플레이어 감정 벡터와 씬 원본 감정의 정합도 | |
| **contamination** (오염) | 2축 MVP: drift / fixation. 3축 벡터: divergence/convergence/heterogeneity | |
| **AF 좌표** | Attribution × Core Fear 2D 평면 (지형 배치 기준) | 일반 VAD와 다름 |
| **VAD 투영** | 씬 감정 분포 → (v, a) 2D 좌표 | 지형 pin 위치 계산용 |
| **author bridge** | 작가가 쓴 해석 조각 (정적) | |
| **trajectory bridge** | 공명 엔딩 도달자의 궤적이 자동 변환된 브릿지 (동적, 자동 승인) | |
| **공명 (resonance)** | 트루엔딩 도달. 궤적 브릿지 생성 트리거 | 인기도/좋아요 아님 |
| **echo_words** | 씬에 붙은 공명 단어. 플레이어 경험에서 주변에 뜸 | |
| **이본론** | TEM 철학: 변이 = 재창조, 오염 ≠ 열화 | |
| **strata** | 3D 지형 뷰. 씬 pin이 VAD 좌표로 배치됨 | |
| **Canvas** | admin의 궤적 큐레이터 통합 뷰 (2026-04-12부터) | |
| **pin_override** | 작가가 드래그로 큐레이션한 핀 위치 (감정값과 별개) | |

---

## 🧭 작업 패턴

### 새 기능 제안 전 체크
1. 관련 문서 있나? (`docs/` 스캔)
2. 기존 유사 개념 있나? (`Grep`)
3. DB 스키마가 허용하나? (`repo.js` + Supabase 실제)
4. 커플링 비용은? 롤백 가능한가?
5. MVP로 쪼갤 수 있나?

### 제안 시 필수 명시
- 변경 범위 (파일 수, 줄 수 추정)
- 롤백 난이도
- 대안 1개 이상

### 사용자 피드백 루프
- 당신이 "뭔소리냐"고 하면 **그 자리에서 재설계**. 방어하지 말 것.
- 당신이 용어를 교정하면 **이 파일에 추가**.
- 새 결정은 `docs/`에 문서화. 대화에만 남기지 말 것.

---

## 📐 데이터 모델 빠른 참조

### memories (jsonb meta 포함)
```
id, code, title, description, memory_words, completed_sentence,
sound_map (레거시, 5 mp3), status, layers, dilution, is_public,
meta: { emotion_entries, key_scenes, author?, ... }
```

### scenes (jsonb meta 포함)
```
id, memory_id, scene_order, text, echo_words, emotion_dist,
emotion_vector, scene_type, original_emotion, anchor_emotions,
text_stage_1/2/3,
meta: { scene_code, motif_tags, author_bridges, sound_url, sound_volume, sound_radius, ... }
```

### choices (감정 결만)
```
id, scene_id, choice_order, text, emotion, intensity
# next_scene_id 없음. 의도적.
```

### trajectory_bridges (별도 테이블, 2026-04-12 신설)
```
id, memory_id, scene_id, source_run_id, source_completed_sentence,
entry_emotion, key_passed_scenes[], status, created_at
```

---

## 🎯 현재 진행 중 (2026-04-12 기준)

- **Canvas 통합 프로젝트 Phase 2a 완료** — admin 씬 편집 + 사운드 UI
- **다음**: Phase 2b (strata 공간음향 연결), Phase 3 (페르소나 시뮬), Phase 4 (레거시 정리)
- **설계 대기**: 포트 기반 연결 모델 (작가 연출 레이어), 공명궤적→브릿지 연출, 명시적 분기 여부

상세: [docs/메모/Feedback.md](docs/메모/Feedback.md) 하단 섹션

---

## 🛑 절대 하지 말 것

- `git push --force` 명시 요청 없이
- `--no-verify` 명시 요청 없이
- 사용자의 in-progress 작업 덮어쓰기
- 감정값을 드래그로 역편집 (8차원→2차원 역투영은 정보 손실)
- 테이블 DROP / 프로덕션 데이터 삭제 확인 없이

# TEM 프로젝트 구조도

> 2026-04-14 스냅샷. 파일 단위까지가 아닌 **역할 중심** 지도.

---

## 1. 최상위 레이아웃

```
The Etched Mutation/
├── index.html              # 플레이어 진입 (메인 메뉴 / 허브)
├── play-test.html          # 실제 플레이 화면 (거대 단일 페이지, 레거시 누적)
├── admin.html              # 작가/큐레이터 — Canvas 통합 뷰
├── pilot-survey.html       # 파일럿 설문
├── simulate-plays.html     # 시뮬레이션 러너
├── demo-sequence.html / demo.html / wave-demo.html / contour-test.html
│                           # 데모·실험용 페이지
├── af-terrain-test.html    # AF 좌표 지형 실험
├── test-byeori-engine.html # 별이엔진 수동 테스트
├── vite.config.js / package.json / vercel.json
├── CLAUDE.md                      # Claude 작업 가이드 (단일 통합)
├── run-simulation.mjs      # 노드 시뮬 엔트리
└── start-portfolio-server.{sh,bat}
```

---

## 2. 프론트엔드 로직 ([js/](../js/))

```
js/
├── core/                     # 엔진 코어 (TEM 고유 모델)
│   ├── ByeoriEngine.js       #  별이 정렬도 엔진 (V4, 궤적 기반)
│   ├── ContaminationTracker.js  # 오염/전이 분류 (echo_follow/bridge/…)
│   ├── SceneNavigator.js     # 접근 가능 핀 계산 + 씬 전이
│   └── store.js              # 전역 런타임 상태
│
├── app/                      # 화면/플로우 단위 앱 로직
│   ├── opening.js / live.js / archive.js / archiveEntry.js
│   ├── recordChat.js / confession.js / registration.js
│   ├── burialAnimation.js / endScreen.js / comparison.js
│   ├── contaminationPresenter.js
│   ├── appStore.js / bindEvents.js / auth.js
│
├── ui/                       # 뷰 컴포넌트
│   ├── UIManager.js / Visualizer.js
│   ├── strataView.js / strataSection.js   # 3D 지형 뷰
│   ├── floatingAnchor.js / afterimage.js  # 잔상 시스템
│   ├── contaminationMonologue.js / notify.js
│
├── services/                 # 외부 연동
│   ├── AIService.js / MemoryService.js
│   ├── NetworkService.js / RealtimeService.js
│
├── shared/                   # 순수 유틸 + AF 지형 수학
│   ├── tem_af_analysis.js / tem_af_map.js / tem_af_strata_terrain.js
│   ├── tem_geo_map.js / spatialAudio.js
│   ├── api.js / audio.js / math.js
│
├── audio/                    # 공간 음향
│   ├── SoundscapeBeta.js / getSoundscape.js
│
├── lib/                      # 저수준 어댑터
│   ├── repo.js               # Supabase 접근 단일 진입점
│   ├── supabaseClient.js / storage.js / config.js
│   ├── i18n.js / afterimage.js / env.example.js
│
├── demo/                     # 데모용 로컬 시뮬
│   └── demoFlow.js / demoAIAnalyze.js / demoEmotionLocal.js / demoReveal.js / demoState.js
│
├── admin.js / admin-trajectory.js / admin-recovery.js
├── index.js / expInterview.js / af-terrain-test-page.js
├── contamination.js / safety.js / npc-dialogues.js
```

**핵심 의존 흐름**
```
play-test.html
  → js/core/*  ← 런타임 엔진
  → js/app/*   ← 화면 플로우
  → js/ui/*    ← 렌더
  → js/services/* → js/lib/repo.js → Supabase
```

---

## 3. 스타일 / 에셋

```
css/     admin.css, admin-recovery.css, index.css, demo.css, demo-hub.css,
         expInterview.css, main-menu.css
sounds/  amb_*.mp3, sfx_*.mp3, Base_*.mp3, Rain_indoor.mp3, footstep.mp3
img/ image/ public/  # 이미지 에셋
data/    memories.js, seed_utterances.csv
```

---

## 4. 백엔드 ([supabase/](../supabase/))

```
supabase/
├── migrations/               # 시간 순. 스키마 = 여기가 진실
│   ├── 2025* …  초기 스키마 (void_info, original_fields, contamination_stages,
│   │             mismatch_type, notes, anchor_emotions, memory_words,
│   │             sound_map, RLS 정책들)
│   └── 2026* …  v3 컬럼, 3축 오염, anchor_images, utterances + consent
├── functions/                # Edge Functions
│   ├── claude-scene/                      # 씬 생성
│   ├── collect-memory/                    # 대화 → 기억 수집
│   ├── contaminate-text/                  # 오염 단계 텍스트 생성
│   ├── generate-reveal/
│   ├── generate-scene-from-conversation/
│   ├── generate-scene-from-ritual/
│   └── _shared/
└── add_void_info_simple.sql / check_schema.sql
```

---

## 5. 도구 / 테스트

```
tools/
├── persona-sim/              # 페르소나 시뮬레이터 (Big-Five 기반 플레이 생성)
│   ├── scripts/ prompts/ data/ big-five-data/
│   └── README-260409.md, HOW_TO_RUN-260409.md
├── import_seed_utterances.mjs
└── test-engine.html

tests/
├── byeori_v3_scoring.test.js
├── byeori_v4_scoring.test.js
└── contamination_unit_test.mjs

scripts/    # 보조 스크립트
test/       # 기타 실험 테스트
```

---

## 6. 문서 ([docs/](../docs/))

**시스템/엔진**
- [TEM_시스템_매뉴얼-260410.md](TEM_시스템_매뉴얼-260410.md) — 전체 시스템
- [TEM_PROJECT_MANUAL-260404.md](TEM_PROJECT_MANUAL-260404.md)
- [별이엔진_V4-궤적기반_정렬도-260327.md](별이엔진_V4-궤적기반_정렬도-260327.md)
- [SceneNavigator_설계_v1-260329.md](SceneNavigator_설계_v1-260329.md)
- [play-test-지도_핀_접근규칙-260325.md](play-test-지도_핀_접근규칙-260325.md)

**오염/전이**
- [contamination/](contamination/) — MVP v3 · presentation v1 · vNext 노트
- [오염벡터_계산_구현_명세_v2-260327.md](오염벡터_계산_구현_명세_v2-260327.md)
- [전이_규칙_구현_문서-260324.md](전이_규칙_구현_문서-260324.md)

**지형/시각화**
- [Strata 3d-260325.md](Strata%203d-260325.md) / [strata-3d-rendering-260401.md](strata-3d-rendering-260401.md)
- [tem-af-coordinate-integration-260325.md](tem-af-coordinate-integration-260325.md)
- [기억집단유전학_v0.4_지형설계-260405.md](기억집단유전학_v0.4_지형설계-260405.md)
- [시각화_설계_v1-260412.md](시각화_설계_v1-260412.md)

**브릿지/잔상/흐름**
- [데이터계약_브릿지_v1-260412.md](데이터계약_브릿지_v1-260412.md)
- [잔상_시스템_설계-260409.md](잔상_시스템_설계-260409.md)
- [Record_flow_v3-260405.md](Record_flow_v3-260405.md)
- [Archive_mode-260325.md](Archive_mode-260325.md) / [Live_mode-260325.md](Live_mode-260325.md)

**철학/연구**
- [기억유전학_v0.3.md](기억유전학_v0.3.md) / [mnemonic-genetics-요약-260325.md](mnemonic-genetics-요약-260325.md)
- [paper/](paper/) — main.tex / main.pdf / references.bib / 한국어 초안
- [프로젝트 정의-260324.md](프로젝트%20정의-260324.md) / [안전_설계-260324.md](안전_설계-260324.md)
- [업그레이드_로드맵-260410.md](업그레이드_로드맵-260410.md)

**진행/메타**
- [메모/Feedback.md](메모/Feedback.md) — 진행 상황 + TODO (핵심)
- [메모/](메모/) — 엔진 마이그레이션 기록 · 플로우 메모

---

## 7. 데이터 모델 요약 (진실은 migrations/)

```
memories        id, code, title, description, memory_words,
                completed_sentence, sound_map(legacy), status,
                layers, dilution, is_public, meta jsonb
scenes          id, memory_id, scene_order, text, echo_words,
                emotion_dist, emotion_vector, scene_type,
                original_emotion, anchor_emotions,
                text_stage_1/2/3, meta jsonb
choices         id, scene_id, choice_order, text, emotion,
                intensity   # next_scene_id 없음 (의도)
trajectory_bridges   id, memory_id, scene_id, source_run_id,
                     source_completed_sentence, entry_emotion,
                     key_passed_scenes[], status
plays / utterances / anchor_images / profiles / notes
```

---

## 8. 진입점 맵 (한눈에)

| 페르소나 | 파일 | 경로 |
|---|---|---|
| 플레이어 | [index.html](../index.html) → [play-test.html](../play-test.html) | `js/core` + `js/app` + `js/ui` |
| 작가/큐레이터 | [admin.html](../admin.html) | `js/admin.js` + `js/admin-trajectory.js` |
| 연구자(시뮬) | [simulate-plays.html](../simulate-plays.html) / [run-simulation.mjs](../run-simulation.mjs) | `tools/persona-sim` |
| 실험 | `*-test.html`, `demo-*.html`, `wave-demo.html` | — |

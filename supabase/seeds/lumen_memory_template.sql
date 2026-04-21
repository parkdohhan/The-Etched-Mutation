-- ============================================================
-- Lumen Memory Authoring Template
-- Checklist: docs/lumen_memory_authoring_checklist.md
-- SCOPE:     docs/LUMEN_DEMO_SCOPE-260421.md §4 작업 7
-- ------------------------------------------------------------
-- 사용법:
--   1. 이 파일을 복사: supabase/seeds/lumen_mem_<code>.sql
--   2. <<PLACEHOLDER>> 전부 실제 값으로 치환
--   3. SCENE 블록·CHOICE 블록·PLAY 블록을 장면 수만큼 복제
--   4. Supabase SQL editor에서 실행 (BEGIN/COMMIT 쌍 확인)
--   5. 실패 시 ROLLBACK; 후 값 수정
-- ------------------------------------------------------------
-- 주의:
--   * 17-dim emotion 키셋 고정: fear, sadness, anger, joy, longing,
--     guilt, shame, numbness, disgust, surprise, pride, hope, envy,
--     contempt, tenderness, loneliness, awe
--   * cont_drift / cont_fixation / cont_stage / sound_map — 쓰지 말 것 (레거시)
--   * vector_weight / meta.author_bridges — 쓰지 말 것 (READ 없음)
--   * meta.motif_tags — 작업 13 Play entry 매칭에 사용됨
--   * ghost_condensation_points — 여기선 [] 로 두고 작업 12 Admin UI에서 편집
-- ============================================================

BEGIN;

-- ===== 1. memories =====
INSERT INTO memories (
  code, title, lang, curator_id,
  completed_sentence, memory_words,
  terrain_shape,
  sensory_anchor,
  original_vector, original_reason_vector,
  cont_depth, cont_divergence, cont_convergence, cont_heterogeneity,
  cont_stage_1, cont_stage_2, cont_stage_3,
  _cont_align_mean, _cont_align_m2,
  ghost_condensation_points,
  is_public
) VALUES (
  '<<CODE>>',                          -- 예: 'E-LUM-001'
  '<<TITLE>>',                          -- 관객이 보는 이름, 10자 내외
  '<<LANG>>',                           -- 'ko' 또는 'en'
  NULL,                                  -- curator_id (익명)
  '<<COMPLETED_SENTENCE>>',             -- 핵심 한 문장
  ARRAY['<<WORD1>>','<<WORD2>>','<<WORD3>>']::text[],
  'circular',
  jsonb_build_object(
    'modality', '<<MODALITY>>',          -- 'smell' | 'sound' | 'touch'
    'content',  '<<SENSORY_CONTENT>>',   -- 예: '소독약'
    'weight',   <<SENSORY_WEIGHT>>       -- 0.0~1.0
  ),
  jsonb_build_object(
    'fear',        <<V_FEAR>>,
    'sadness',     <<V_SADNESS>>,
    'anger',       <<V_ANGER>>,
    'joy',         <<V_JOY>>,
    'longing',     <<V_LONGING>>,
    'guilt',       <<V_GUILT>>,
    'shame',       <<V_SHAME>>,
    'numbness',    <<V_NUMBNESS>>,
    'disgust',     <<V_DISGUST>>,
    'surprise',    <<V_SURPRISE>>,
    'pride',       <<V_PRIDE>>,
    'hope',        <<V_HOPE>>,
    'envy',        <<V_ENVY>>,
    'contempt',    <<V_CONTEMPT>>,
    'tenderness',  <<V_TENDERNESS>>,
    'loneliness',  <<V_LONELINESS>>,
    'awe',         <<V_AWE>>
  ),
  jsonb_build_object(
    'attribution', jsonb_build_object(
      'self',  <<ATTR_SELF>>,            -- 합 1.0
      'other', <<ATTR_OTHER>>,
      'fate',  <<ATTR_FATE>>
    ),
    'core_fear',   jsonb_build_object(
      'abandonment',   <<CF_ABANDON>>,   -- 합 1.0
      'rejection',     <<CF_REJECT>>,
      'powerlessness', <<CF_POWER>>,
      'loss',          <<CF_LOSS>>
    )
  ),
  <<CONT_DEPTH>>,                        -- 0 기본. 2~3이면 "이미 해석된" 느낌
  <<CONT_DIVERGENCE>>,                   -- 0 기본. 0~1
  <<CONT_CONVERGENCE>>,                  -- 0 기본. 0~1
  <<CONT_HETEROGENEITY>>,                -- 0 기본. 0~1
  <<CONT_STAGE_1>>,                      -- 합 1.0 근사. 기본 0.33/0.33/0.34
  <<CONT_STAGE_2>>,
  <<CONT_STAGE_3>>,
  0, 0,                                   -- Welford 내부 (건들지 말 것)
  '[]'::jsonb,                            -- ghost_condensation_points (작업 12에서 편집)
  true                                    -- is_public (데모용)
);

-- 방금 INSERT한 memory_id 캡처 (반복 사용)
\set memory_id '(SELECT id FROM memories WHERE code = ''<<CODE>>'')'

-- ===== 2. scenes =====
-- 아래 블록을 장면 수만큼 복제. scene_order 1부터 순차.

-- --- SCENE #1 ---
INSERT INTO scenes (
  memory_id, scene_order,
  text, scene_type,
  original_emotion, original_reason_vector,
  anchor_emotions,
  void_info,
  text_stage_1, text_stage_2, text_stage_3,
  meta
) VALUES (
  :memory_id, 1,
  '<<SCENE_1_TEXT>>',
  'normal',
  jsonb_build_object(  -- 17-dim, 강도 이미 반영 (vector_weight 곱 쓰지 말 것)
    'fear', <<S1_FEAR>>, 'sadness', <<S1_SADNESS>>, 'anger', <<S1_ANGER>>,
    'joy', <<S1_JOY>>, 'longing', <<S1_LONGING>>, 'guilt', <<S1_GUILT>>,
    'shame', <<S1_SHAME>>, 'numbness', <<S1_NUMBNESS>>, 'disgust', <<S1_DISGUST>>,
    'surprise', <<S1_SURPRISE>>, 'pride', <<S1_PRIDE>>, 'hope', <<S1_HOPE>>,
    'envy', <<S1_ENVY>>, 'contempt', <<S1_CONTEMPT>>, 'tenderness', <<S1_TENDERNESS>>,
    'loneliness', <<S1_LONELINESS>>, 'awe', <<S1_AWE>>
  ),
  jsonb_build_object(
    'attribution', jsonb_build_object('self',<<S1_AS>>,'other',<<S1_AO>>,'fate',<<S1_AF>>),
    'core_fear',   jsonb_build_object('abandonment',<<S1_CA>>,'rejection',<<S1_CR>>,'powerlessness',<<S1_CP>>,'loss',<<S1_CL>>)
  ),
  ARRAY['<<S1_ANCHOR1>>','<<S1_ANCHOR2>>']::text[],
  jsonb_build_object(
    'sceneVoid',   <<S1_VOID_SCENE>>,    -- true | false
    'emotionVoid', <<S1_VOID_EMOTION>>,
    'reasonVoid',  <<S1_VOID_REASON>>,
    'voidLevel',   '<<S1_VOID_LEVEL>>'   -- 'low' | 'high'
  ),
  '<<S1_TEXT_STAGE_1>>',                  -- 편향적 기울어짐 버전 ('·' 침식)
  '<<S1_TEXT_STAGE_2>>',                  -- 해석 병기 버전
  '<<S1_TEXT_STAGE_3>>',                  -- 과잉 완결 버전 (░▒▓ 글리치)
  jsonb_build_object(
    'scene_code', '<<S1_CODE>>',          -- 예: 'E-LUM-001-S01'
    'echo_words', ARRAY['<<S1_ECHO1>>','<<S1_ECHO2>>']::text[],
    'motif_tags', ARRAY['<<S1_MOTIF1>>','<<S1_MOTIF2>>']::text[],
    'sound_url',    '<<S1_SOUND_URL>>',   -- 예: 'sounds/amb_window_rain.mp3', 없으면 NULL
    'sound_volume', <<S1_SOUND_VOL>>,     -- 0.0~1.0
    'sound_radius', <<S1_SOUND_RADIUS>>   -- 기본 15
  )
);

-- --- SCENE #2, #3, ... 복제 ---


-- ===== 3. choices =====
-- 각 장면별 선택지. 보통 2~3개.

-- --- Scene 1 choices ---
INSERT INTO choices (scene_id, choice_order, text, emotion, intensity) VALUES
(
  (SELECT id FROM scenes WHERE memory_id = :memory_id AND scene_order = 1),
  1, '<<S1_C1_TEXT>>', '<<S1_C1_EMOTION>>', <<S1_C1_INTENSITY>>
),
(
  (SELECT id FROM scenes WHERE memory_id = :memory_id AND scene_order = 1),
  2, '<<S1_C2_TEXT>>', '<<S1_C2_EMOTION>>', <<S1_C2_INTENSITY>>
);
-- 하나는 침묵/회피 옵션(VOID 유도) 포함 권장


-- ===== 4. Record = First Play =====
-- 장면당 1 row. 작가 본인 감정 = scenes.original_emotion 그대로.

INSERT INTO plays (memory_id, scene_id, user_id, user_emotion, user_reason, alignment, mismatch_type)
SELECT
  :memory_id,
  s.id,
  NULL,                                    -- 익명
  s.original_emotion,
  s.original_reason_vector,
  1.0,                                     -- 자기 자신과 완전 정렬
  NULL
FROM scenes s
WHERE s.memory_id = :memory_id;


-- ===== 5. 검증 (선택) =====
-- COMMIT 전에 확인:
-- SELECT id, code, title, jsonb_array_length(memory_words::jsonb) AS n_words FROM memories WHERE code = '<<CODE>>';
-- SELECT scene_order, char_length(text) AS text_len, text_stage_1 IS NOT NULL AS has_s1 FROM scenes WHERE memory_id = :memory_id ORDER BY scene_order;
-- SELECT s.scene_order, COUNT(c.id) AS n_choices FROM scenes s LEFT JOIN choices c ON c.scene_id = s.id WHERE s.memory_id = :memory_id GROUP BY s.scene_order ORDER BY s.scene_order;
-- SELECT COUNT(*) FROM plays WHERE memory_id = :memory_id;  -- 장면 수와 같아야 함

COMMIT;

-- ROLLBACK;  -- 실패 시 주석 해제

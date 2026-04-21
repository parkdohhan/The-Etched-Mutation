-- ============================================================
-- 편지 (E-004) — Lumen 필드 보강
-- 작성: 2026-04-21
-- SCOPE:     docs/LUMEN_DEMO_SCOPE-260421.md §4 작업 7
-- Checklist: docs/lumen_memory_authoring_checklist-260421.md
-- 결정 기록:
--   * 접근: β (stage_2 병기만 저작, stage_1/3 은 런타임)
--   * cont_depth: 8 (102 플레이 반영, 오염된 입장)
--   * stage 혼합: 0.33 / 0.33 / 0.34 기본
--   * text_stage_1, text_stage_3: NULL 유지 (런타임 presenter 처리)
-- ============================================================

BEGIN;

-- ===== memories (E-004) =====
UPDATE memories SET
  sensory_anchor = jsonb_build_object(
    'modality', 'sound',
    'content',  '발소리',
    'weight',   0.85
  ),
  original_vector = jsonb_build_object(
    'fear',        0.55,
    'sadness',     0.40,
    'anger',       0.15,
    'joy',         0.00,
    'longing',     0.70,
    'guilt',       0.45,
    'shame',       0.25,
    'numbness',    0.35,
    'disgust',     0.05,
    'surprise',    0.10,
    'pride',       0.00,
    'hope',        0.10,
    'envy',        0.00,
    'contempt',    0.05,
    'tenderness',  0.30,
    'loneliness',  0.60,
    'awe',         0.15
  ),
  original_reason_vector = jsonb_build_object(
    'attribution', jsonb_build_object('self', 0.25, 'other', 0.55, 'fate', 0.20),
    'core_fear',   jsonb_build_object('abandonment', 0.45, 'loss', 0.35, 'rejection', 0.10, 'powerlessness', 0.10)
  ),
  cont_depth    = 8,
  cont_stage_1  = 0.33,
  cont_stage_2  = 0.33,
  cont_stage_3  = 0.34
WHERE code = 'E-004';

-- ===== scenes =====
-- scene_order 0 ~ 10
-- 각 UPDATE: text_stage_2 저작, void_info 설정, meta.echo_words 병합

-- S0
UPDATE scenes SET
  text_stage_2 = '철문에 귀를 댄다. 발소리와 하품 소리. 아니면 내가 듣고 싶었던 소리였는지도 모른다. 당신은 노크하지 못했다. 혹은 노크할 필요가 없었다. 나는 가끔 선명한 소리를 들었다. 들었다고 믿었다.',
  void_info    = jsonb_build_object('sceneVoid', false, 'emotionVoid', false, 'reasonVoid', true, 'voidLevel', 'low'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('발소리', '노크조차'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 0;

-- S1
UPDATE scenes SET
  text_stage_2 = '영안실. 엄지발가락의 굳은살, 뒤꿈치의 갈라진 틈. 엄마의 얼굴을 그리려 해도 흐려진다. 흐려지는 것이 아니라 이미 그려지지 않는다. 단추 두 개의 봉제인형. 아니면 엄마는 원래부터 얼굴이 없었을지도.',
  void_info    = jsonb_build_object('sceneVoid', false, 'emotionVoid', false, 'reasonVoid', false, 'voidLevel', 'low'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('단추 두 개', '흐려져'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 1;

-- S2
UPDATE scenes SET
  text_stage_2 = '현관문이 열려 있었다. 혹은 닫혀 있었다. 잠든 사이 전화가 깜박였다. "다시 태어나도 다시 똑같이 널 사랑할게." 녹음이었는지 꿈이었는지 기억이 나지 않는다. 깨어나 보면 문은 닫혀 있다. 열려 있었던 적이 없다는 듯이.',
  void_info    = jsonb_build_object('sceneVoid', true, 'emotionVoid', false, 'reasonVoid', true, 'voidLevel', 'high'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('다시 태어나도', '깨어나 보면'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 2;

-- S3
UPDATE scenes SET
  text_stage_2 = '할머니가 엄마에게 말했다. 너는 전생에 내 엄마였어. 아니면 내 딸이었던 적도 있었을 거야. 엄마가 폐경기에 들어갈 무렵 "핏줄"이라는 단어가 "운명의 실"로 바뀌었다. 혹은 처음부터 "운명의 실"이었던 단어를 내가 "핏줄"로 잘못 들었던 걸지도.',
  void_info    = jsonb_build_object('sceneVoid', false, 'emotionVoid', false, 'reasonVoid', false, 'voidLevel', 'low'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('전생에', '운명의 실'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 3;

-- S4
UPDATE scenes SET
  text_stage_2 = '식탁에 짜사이가 올라왔다. "너도 어릴 땐 좋아했어." 먹은 적 없는 기억이다. 혹은 먹었지만 싫어했던 기억이 변형된 것이다. 엄마가 내 배를 툭 쳤다. "얘도 좋아하겠지?" 질문이었을까. 선언이었을까.',
  void_info    = jsonb_build_object('sceneVoid', false, 'emotionVoid', false, 'reasonVoid', false, 'voidLevel', 'low'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('먹은 적 없는', '얘도 좋아하겠지'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 4;

-- S5
UPDATE scenes SET
  text_stage_2 = '산부인과. "남자아이예요." 초음파 사진을 의사가 엄마 쪽으로 내밀었다. 나에게 내밀 수도 있었다. "손주 축하드려요." 축하할 일이었는지 기억이 나지 않는다. 엄마의 표정은 보지 않았다. 보지 않기로 한 것인지, 볼 수 없었던 것인지 모른다.',
  void_info    = jsonb_build_object('sceneVoid', false, 'emotionVoid', false, 'reasonVoid', false, 'voidLevel', 'low'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('남자아이예요', '보지 않는다'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 5;

-- S6
UPDATE scenes SET
  text_stage_2 = '대리석 바닥에 누워 당신을 불렀다. 운명의 빨간 실을 떠올렸다. 혹은 떠올린 것이 아니라 이미 내 안에 있던 이미지였다. 피도 안 이어졌는데 이어져 있는가. 아니면 이어져 있지 않기 때문에 이어졌다고 믿어야 하는가. 발소리. 당신이었다. 당신이었을 것이다.',
  void_info    = jsonb_build_object('sceneVoid', false, 'emotionVoid', false, 'reasonVoid', false, 'voidLevel', 'low'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('운명의 빨간 실', '발소리'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 6;

-- S7
UPDATE scenes SET
  text_stage_2 = '엄마에게 말했다. "현관 앞에 찾아오지 말아달라." 코트를 입고 나가는 뒷모습. 처음으로 혼자인 것이 신혼처럼 느껴졌다. 혹은 그렇게 느껴야만 했다. 한 달 뒤, 엄마는 트럭을 박았다. 사고였는지 아니었는지 말할 수 없다. 말하지 않기로 했다.',
  void_info    = jsonb_build_object('sceneVoid', false, 'emotionVoid', false, 'reasonVoid', false, 'voidLevel', 'low'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('한 달 뒤', '트럭'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 7;

-- S8
UPDATE scenes SET
  text_stage_2 = '유가족과 중국집. 짜사이가 밥상에 올랐다. 오독오독, 식감이 다르다. 혹은 같은 식감인데 내가 다르게 듣고 있다. 합의에 대한 이야기를 조심스레 꺼내는 것을 들으면서, 미안하다고 생각했다. 누구에게 미안한지 정확히 알 수 없었다.',
  void_info    = jsonb_build_object('sceneVoid', false, 'emotionVoid', false, 'reasonVoid', false, 'voidLevel', 'low'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('오독오독', '미안하다고'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 8;

-- S9
UPDATE scenes SET
  text_stage_2 = '납골당에서 유골함을 안고 돌아왔다. 한 꼬집을 덜어냈다. 훔쳤다고 해도 좋을 것이다. 목욕물을 받으며 배 속을 두드렸다. "누구 있어요?" 대답은 없었다. 혹은 대답이 있었는데 내가 듣지 못했다.',
  void_info    = jsonb_build_object('sceneVoid', false, 'emotionVoid', true, 'reasonVoid', false, 'voidLevel', 'low'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('한 꼬집', '누구 있어요'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 9;

-- S10
UPDATE scenes SET
  text_stage_2 = '화장실 바닥. 손이 생생하다. 양막 안에 웅크린 것이 당신이다. 아니 엄마다. 머리는 어느 때보다도 뚜렷하지만, 누구의 얼굴인지 말할 수 없다. 말하지 않아도 된다.',
  void_info    = jsonb_build_object('sceneVoid', false, 'emotionVoid', false, 'reasonVoid', true, 'voidLevel', 'high'),
  meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('echo_words', jsonb_build_array('양막', '당신입니까', '엄마입니까'))
WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' AND scene_order = 10;

-- ===== 검증 =====
-- SELECT scene_order, text_stage_2 IS NOT NULL AS has_s2, void_info, meta->'echo_words' AS echo
-- FROM scenes WHERE memory_id = '0c358ab5-e4e6-4820-9743-844bfffa0254' ORDER BY scene_order;

COMMIT;

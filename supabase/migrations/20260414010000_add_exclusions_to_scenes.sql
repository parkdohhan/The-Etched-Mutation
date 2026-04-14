-- 연출 레이어 Step 1: 부정 제약 (negative constraint)
-- 작가가 "이 씬은 특정 조건에선 뜨지 않음"을 선언할 수 있도록.
-- 궤적 엔진 출력의 필터 단계에서 사용됨 (SceneNavigator.navigate).
--
-- Shape:
-- [
--   {
--     "condition": {
--       "type": "emotion_threshold" | "contamination_stage" | "visited_scene",
--       "emotion": "rage",      -- emotion_threshold
--       "min": 0.6,              -- emotion_threshold
--       "stage": "hypercompletion", -- contamination_stage
--       "sceneIndex": 2          -- visited_scene
--     },
--     "reason": "admin-only note"
--   }
-- ]

ALTER TABLE scenes
    ADD COLUMN IF NOT EXISTS exclusions jsonb DEFAULT NULL;

COMMENT ON COLUMN scenes.exclusions IS
    '작가 연출 레이어: 부정 제약. 조건이 하나라도 매칭되면 이 씬은 궤적 후보에서 제외.';

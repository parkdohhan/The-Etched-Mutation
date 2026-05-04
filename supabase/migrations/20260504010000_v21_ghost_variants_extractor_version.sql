-- V2.1 SCOPE §4 W2S3 사전 작업: ghost_variants 에 emotion_extract 프롬프트 버전 도장
-- See: todo.md W2S3, claude-scene emotion_extract PROMPT_VERSION (v2.1.0)
--
-- 추가 항목:
--   ghost_variants.extractor_version  TEXT  — emotion_vec 가 추출된 프롬프트 버전.
--                                             admin 도구 저장 시 emotion_extract 응답의 prompt_version 그대로 박음.
--                                             프롬프트 손대면 v2.1.0 → v2.1.1 식으로 올리고 전량 재추출 후 덮어쓰기.
--
-- NOT NULL 안 박음 — 기존 시드 행 (5/4 이전 박힌 자리) 은 NULL 그대로. NULL = "추출기 안 거친 시드".
-- DEFAULT 안 박음 — 클라이언트가 응답의 prompt_version 명시적으로 박아야 함. 자동 default 박으면 옛 버전 박힐 위험.

ALTER TABLE ghost_variants
  ADD COLUMN IF NOT EXISTS extractor_version TEXT;

CREATE INDEX IF NOT EXISTS idx_ghost_variants_extractor_version
  ON ghost_variants (extractor_version)
  WHERE extractor_version IS NOT NULL;

COMMENT ON COLUMN ghost_variants.extractor_version IS
  'V2.1 §4 W2S3 사전: emotion_extract 프롬프트 버전 도장 (예: tem-emotion-v2.1.0). 프롬프트 손대면 버전 올리고 전량 재추출. NULL = 추출기 안 거친 시드.';

NOTIFY pgrst, 'reload schema';

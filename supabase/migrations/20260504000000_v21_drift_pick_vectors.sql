-- V2.1 SCOPE §4 W2S1: drift 픽 시스템 3 컬럼 추가
-- See: todo.md W2S1, W1S1 audit 결과 (2026-05-04)
--
-- 추가 항목:
--   memories.cumulative_emotion_vec  jsonb  — 글로벌 12축 누적 변위 벡터
--                                            (회차 끝마다 EMA α=0.10 갱신, ContaminationTracker.updateCumulativeEmotionVec)
--   plays.ghost_variant_id           uuid   — 회차 끝 받은 변주 도장 (디버깅·작가 손 검증 시 sampling 재실행 X)
--   plays.final_drift_vector         jsonb  — 회차 끝 12축 변위 벡터 (도장과 평행)
--
-- 차원 확장 SQL 불필요 — ghost_variants.emotion_vec 이미 12축 jsonb (W1S1 (e) 답).
-- 12축 라벨 단일 진실 자리 = SeekerFingerprint.EMOTION_KEYS (= ContaminationTracker.EMOTION_AXES_12 re-export).

-- ============================================================================
-- memories.cumulative_emotion_vec
-- ============================================================================

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS cumulative_emotion_vec jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE memories
  DROP CONSTRAINT IF EXISTS memories_cumulative_emotion_vec_object_chk;
ALTER TABLE memories
  ADD CONSTRAINT memories_cumulative_emotion_vec_object_chk
  CHECK (jsonb_typeof(cumulative_emotion_vec) = 'object');

COMMENT ON COLUMN memories.cumulative_emotion_vec IS
  'V2.1 §4 W2S1: 글로벌 12축 누적 변위 벡터. 회차 끝마다 EMA α=0.10 갱신 (ContaminationTracker.updateCumulativeEmotionVec). pickDriftUtterance 의 Step 1 글로벌 좁힘 입력.';

-- ============================================================================
-- plays.ghost_variant_id  +  plays.final_drift_vector
-- ============================================================================

ALTER TABLE plays
  ADD COLUMN IF NOT EXISTS ghost_variant_id uuid REFERENCES ghost_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plays_ghost_variant
  ON plays (ghost_variant_id)
  WHERE ghost_variant_id IS NOT NULL;

COMMENT ON COLUMN plays.ghost_variant_id IS
  'V2.1 §4 W2S1: 회차 끝 받은 ghost_variants 도장. 사후 재현 시 pickDriftUtterance 재실행 X — 받은 변주 ID 그대로 읽기.';

ALTER TABLE plays
  ADD COLUMN IF NOT EXISTS final_drift_vector jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE plays
  DROP CONSTRAINT IF EXISTS plays_final_drift_vector_object_chk;
ALTER TABLE plays
  ADD CONSTRAINT plays_final_drift_vector_object_chk
  CHECK (jsonb_typeof(final_drift_vector) = 'object');

COMMENT ON COLUMN plays.final_drift_vector IS
  'V2.1 §4 W2S1: 회차 끝 12축 변위 벡터 (computeDriftVector(current, baseline) 결과). ghost_variant_id 와 평행 — 도장.';

-- ============================================================================
-- RLS — 본인만 읽기 (plays 의 기존 RLS 정책 그대로 상속, 신규 컬럼별 정책 X)
-- 신규 컬럼은 행 단위 권한이 아니라 컬럼 단위 — plays 행 SELECT 권한 가진 자가 다 봄.
-- ============================================================================

NOTIFY pgrst, 'reload schema';

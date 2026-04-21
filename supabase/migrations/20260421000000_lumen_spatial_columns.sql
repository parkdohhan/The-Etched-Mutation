-- Lumen 2026 spatial navigation columns
-- SCOPE: docs/LUMEN_DEMO_SCOPE-260421.md §4 작업 0
-- Adds:
--   memories.terrain_shape              — 기억 공간 형태 (Lumen: 'circular')
--   memories.ghost_condensation_points  — 유령 응결 좌표 목록 (작업 12 Admin UI에서 편집)
--   plays.spatial_trajectory            — FP 공간 이동 궤적 (작업 2-A에서 채움)
--   plays.unreturned_flag               — 귀환 미완 표시 (작업 2에서 세팅)

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS terrain_shape TEXT DEFAULT 'circular',
  ADD COLUMN IF NOT EXISTS ghost_condensation_points JSONB DEFAULT '[]'::jsonb;

ALTER TABLE plays
  ADD COLUMN IF NOT EXISTS spatial_trajectory JSONB,
  ADD COLUMN IF NOT EXISTS unreturned_flag BOOLEAN DEFAULT false;

-- 검색 인덱스
CREATE INDEX IF NOT EXISTS idx_memories_terrain_shape ON memories(terrain_shape);
CREATE INDEX IF NOT EXISTS idx_plays_unreturned ON plays(unreturned_flag) WHERE unreturned_flag = true;

-- 제약: terrain_shape은 현재 circular만 허용. V2에서 다른 형태 들어오면 이 체크 교체.
ALTER TABLE memories
  DROP CONSTRAINT IF EXISTS memories_terrain_shape_chk;
ALTER TABLE memories
  ADD CONSTRAINT memories_terrain_shape_chk CHECK (terrain_shape IN ('circular'));

-- 제약: ghost_condensation_points는 배열 형태여야 함
ALTER TABLE memories
  DROP CONSTRAINT IF EXISTS memories_ghost_condensation_is_array_chk;
ALTER TABLE memories
  ADD CONSTRAINT memories_ghost_condensation_is_array_chk
  CHECK (jsonb_typeof(ghost_condensation_points) = 'array');

-- 코멘트 (PostgreSQL)
COMMENT ON COLUMN memories.terrain_shape IS 'Lumen 공간 형태. 현재 circular만. V2에서 확장.';
COMMENT ON COLUMN memories.ghost_condensation_points IS 'array of {x, z, pollution_threshold}. 작업 12 Admin UI에서 편집.';
COMMENT ON COLUMN plays.spatial_trajectory IS 'array of {t, x, z, h, yaw, cont}. 150ms 단위. 작업 2-A rewind 용.';
COMMENT ON COLUMN plays.unreturned_flag IS 'true = 세션 중 void 도달 후 귀환 미완 (탈출 실패 / 세션 종료).';

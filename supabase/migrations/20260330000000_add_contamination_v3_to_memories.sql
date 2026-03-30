-- ContaminationTracker MVP v3 columns on memories table
-- 2-axis EMA model: cont_drift + cont_fixation
-- Stage: stable | biased_inclination | hypercompletion

ALTER TABLE memories
  -- EMA axes (0.0 ~ 1.0)
  ADD COLUMN IF NOT EXISTS cont_drift           float8  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cont_fixation        float8  DEFAULT 0,
  -- Dominant stage
  ADD COLUMN IF NOT EXISTS cont_stage           text    DEFAULT 'stable',
  -- Lifetime depth counter (increments every session, never resets)
  ADD COLUMN IF NOT EXISTS cont_depth           int     DEFAULT 0,
  -- Lifetime raw signal sums (for strata/history view)
  ADD COLUMN IF NOT EXISTS lifetime_drift_sum   float8  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_fix_sum     float8  DEFAULT 0,
  -- Drift direction (EMA of user VAD weighted by drift signal)
  ADD COLUMN IF NOT EXISTS drift_dir_v          float8  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drift_dir_a          float8  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drift_dir_d          float8  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_dir_v_sum   float8  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_dir_a_sum   float8  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_dir_d_sum   float8  DEFAULT 0,
  -- Last engine output snapshot (for admin/debug)
  ADD COLUMN IF NOT EXISTS cont_last_alignment  float8  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cont_last_level      float8  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cont_last_shape      float8  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cont_last_pattern    text    DEFAULT 'bridge',
  ADD COLUMN IF NOT EXISTS cont_last_mismatch   text    DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cont_last_updated    timestamptz DEFAULT NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

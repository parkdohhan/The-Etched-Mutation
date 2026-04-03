-- 3-axis contamination vector (divergence, convergence, heterogeneity)
-- Adds to existing 2-axis MVP (drift, fixation) for backward compatibility

-- 3-axis values
ALTER TABLE memories ADD COLUMN IF NOT EXISTS cont_divergence double precision DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS cont_convergence double precision DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS cont_heterogeneity double precision DEFAULT 0;

-- Welford online variance internals for heterogeneity
ALTER TABLE memories ADD COLUMN IF NOT EXISTS _cont_align_mean double precision DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS _cont_align_m2 double precision DEFAULT 0;

-- Stage mixing weights (normalized 0~1)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS cont_stage_1 double precision DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS cont_stage_2 double precision DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS cont_stage_3 double precision DEFAULT 0;

NOTIFY pgrst, 'reload schema';

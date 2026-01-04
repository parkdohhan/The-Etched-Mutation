-- Add original_emotion, original_reason, and original_choice columns to scenes table
-- These fields are used for alignment comparison in branch and ending scenes

ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS original_emotion JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_choice INTEGER DEFAULT NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Add comments for documentation
COMMENT ON COLUMN scenes.original_emotion IS 'Original emotion vector from narrator (A) for alignment comparison. Format: {"fear": 0.7, "guilt": 0.3}';
COMMENT ON COLUMN scenes.original_reason IS 'Original reason text from narrator (A) for alignment comparison';
COMMENT ON COLUMN scenes.original_choice IS 'Original choice index selected by narrator (A) for alignment comparison';


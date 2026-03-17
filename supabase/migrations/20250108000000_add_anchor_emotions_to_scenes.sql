-- Add anchor_emotions column to scenes table
-- Allows narrators to define custom emotion anchors per scene

ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS anchor_emotions JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN scenes.anchor_emotions IS 'Custom emotion anchors defined by narrator for this scene. Array of emotion strings (e.g., ["fear", "guilt", "hope"]). If null, uses default emotion anchors.';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';



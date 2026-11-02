-- Add void_info column to scenes table
-- This column stores VOID information (sceneVoid, emotionVoid, reasonVoid, voidLevel) as JSONB

ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS void_info JSONB DEFAULT NULL;

-- Reload PostgREST schema cache to ensure the new column is immediately available
NOTIFY pgrst, 'reload schema';



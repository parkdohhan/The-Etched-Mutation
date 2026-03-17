-- Add memory_words and completed_sentence columns to memories table
-- These fields are used for the word/sentence typewriter sequence in archive memory play

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS memory_words TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS completed_sentence TEXT DEFAULT NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Add comments for documentation
COMMENT ON COLUMN memories.memory_words IS 'Key words representing the memory (comma-separated). Used in archive memory play typewriter sequence.';
COMMENT ON COLUMN memories.completed_sentence IS 'Completed sentence that includes the memory words. Used in archive memory play typewriter sequence.';



-- Add persona simulation identity columns to plays
-- Nullable: real audience plays leave them NULL; persona-sim fills them.

ALTER TABLE plays
  ADD COLUMN IF NOT EXISTS persona_id TEXT,
  ADD COLUMN IF NOT EXISTS persona_name TEXT,
  ADD COLUMN IF NOT EXISTS strata_label TEXT,
  ADD COLUMN IF NOT EXISTS visit INTEGER;

CREATE INDEX IF NOT EXISTS idx_plays_persona_id ON plays(persona_id);
CREATE INDEX IF NOT EXISTS idx_plays_memory_persona ON plays(memory_id, persona_id);

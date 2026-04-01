-- Allow anonymous (non-logged-in) users to save memories from Record
-- Memory is saved with curator_id = NULL, optionally claimed via login afterward

-- ===== MEMORIES =====
-- Anonymous INSERT: curator_id must be NULL
CREATE POLICY "Allow anonymous memory creation"
  ON memories FOR INSERT WITH CHECK (curator_id IS NULL);

-- Logged-in user can claim an anonymous memory (set curator_id from NULL to own id)
CREATE POLICY "Users can claim anonymous memories"
  ON memories FOR UPDATE
  USING (curator_id IS NULL)
  WITH CHECK (curator_id = auth.uid());

-- ===== SCENES =====
-- Anonymous INSERT: parent memory must have NULL curator_id
CREATE POLICY "Allow anonymous scene creation"
  ON scenes FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memories
      WHERE memories.id = memory_id
        AND memories.curator_id IS NULL
    )
  );

NOTIFY pgrst, 'reload schema';

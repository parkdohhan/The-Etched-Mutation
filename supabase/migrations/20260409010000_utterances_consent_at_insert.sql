-- Allow contributors to opt their utterances into the public pool at INSERT time.
-- moderation_status MUST stay 'pending' so admin still gates visibility.
-- See docs/잔상_시스템_설계-260409.md §4.1

DROP POLICY IF EXISTS "Users can insert own utterances" ON utterances;
DROP POLICY IF EXISTS "Anonymous can insert utterances" ON utterances;

CREATE POLICY "Users can insert own utterances"
  ON utterances FOR INSERT
  WITH CHECK (
    contributor_id = auth.uid()
    AND moderation_status = 'pending'
  );

CREATE POLICY "Anonymous can insert utterances"
  ON utterances FOR INSERT
  WITH CHECK (
    contributor_id IS NULL
    AND moderation_status = 'pending'
  );

NOTIFY pgrst, 'reload schema';

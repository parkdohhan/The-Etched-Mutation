-- Afterimage (잔상) system — utterance archive + viewing events
-- See docs/잔상_시스템_설계-260409.md
--
-- utterances: short phrases spoken by audience members during Record/Play,
-- surfaced to other audience members after a scene closes. The audience
-- cannot reliably tell whether a given afterimage is their own past words
-- or someone else's — that ambiguity is the piece.
--
-- afterimage_events: log of which utterance was shown to which viewer,
-- for dedupe and analysis.

-- ============================================================================
-- utterances
-- ============================================================================

CREATE TABLE IF NOT EXISTS utterances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- content
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 3 AND 280),
  lang TEXT NOT NULL DEFAULT 'ko' CHECK (lang IN ('ko', 'en')),

  -- provenance
  contributor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'record'
    CHECK (source_type IN ('record', 'play', 'seed', 'scene_input')),
  memory_id UUID REFERENCES memories(id) ON DELETE SET NULL,
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,

  -- matching features (populated at insert time)
  emotion_tags TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  axis_x DOUBLE PRECISION DEFAULT 0, -- attribution axis (-1..1)
  axis_z DOUBLE PRECISION DEFAULT 0, -- core fear axis   (-1..1)

  -- consent + moderation
  is_public BOOLEAN NOT NULL DEFAULT false,
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  moderation_flags JSONB DEFAULT '{}'::jsonb,

  -- usage stats
  show_count INTEGER NOT NULL DEFAULT 0,

  -- v2 (pgvector) — nullable until embeddings are backfilled
  -- NOTE: enable with `CREATE EXTENSION IF NOT EXISTS vector;` in a later migration
  -- embedding VECTOR(384),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE utterances IS 'Archive of audience utterances surfaced as afterimages after scene close. See docs/잔상_시스템_설계-260409.md';
COMMENT ON COLUMN utterances.text IS 'Short phrase, 3-280 chars. Public display only when is_public AND moderation_status=approved.';
COMMENT ON COLUMN utterances.source_type IS 'record: from Record session. play: typed during Play. seed: curated by artist. scene_input: scene-specific typed input.';
COMMENT ON COLUMN utterances.is_public IS 'Explicit audience consent gate. Default false.';
COMMENT ON COLUMN utterances.axis_x IS 'Attribution projection: self_blame(-1) .. fate_blame(+1). See tem_af_strata_terrain.js';
COMMENT ON COLUMN utterances.axis_z IS 'Core fear projection: abandonment(-1) .. loss(+1). See tem_af_strata_terrain.js';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_utterances_public_approved
  ON utterances (lang, moderation_status)
  WHERE is_public = true AND moderation_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_utterances_keywords
  ON utterances USING GIN (keywords);

CREATE INDEX IF NOT EXISTS idx_utterances_emotion_tags
  ON utterances USING GIN (emotion_tags);

CREATE INDEX IF NOT EXISTS idx_utterances_axis
  ON utterances (axis_x, axis_z);

CREATE INDEX IF NOT EXISTS idx_utterances_contributor
  ON utterances (contributor_id);

CREATE INDEX IF NOT EXISTS idx_utterances_created_at
  ON utterances (created_at DESC);

-- updated_at trigger + contributor column guard
-- Non-admin contributors may only toggle is_public (to withdraw consent).
-- All other columns are locked on UPDATE unless the caller is an admin.
CREATE OR REPLACE FUNCTION utterances_before_update()
RETURNS TRIGGER AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  NEW.updated_at = now();

  -- admins bypass column locks
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    -- allow is_public toggle only; reject changes to any other column
    IF NEW.text             IS DISTINCT FROM OLD.text
       OR NEW.lang          IS DISTINCT FROM OLD.lang
       OR NEW.contributor_id IS DISTINCT FROM OLD.contributor_id
       OR NEW.source_type   IS DISTINCT FROM OLD.source_type
       OR NEW.memory_id     IS DISTINCT FROM OLD.memory_id
       OR NEW.scene_id      IS DISTINCT FROM OLD.scene_id
       OR NEW.emotion_tags  IS DISTINCT FROM OLD.emotion_tags
       OR NEW.keywords      IS DISTINCT FROM OLD.keywords
       OR NEW.axis_x        IS DISTINCT FROM OLD.axis_x
       OR NEW.axis_z        IS DISTINCT FROM OLD.axis_z
       OR NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
       OR NEW.moderation_flags  IS DISTINCT FROM OLD.moderation_flags
       OR NEW.show_count    IS DISTINCT FROM OLD.show_count
    THEN
      RAISE EXCEPTION 'utterances: non-admin can only modify is_public';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_utterances_before_update ON utterances;
CREATE TRIGGER trg_utterances_before_update
  BEFORE UPDATE ON utterances
  FOR EACH ROW EXECUTE FUNCTION utterances_before_update();

-- ============================================================================
-- afterimage_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS afterimage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_session_id TEXT, -- anonymous session id from localStorage
  utterance_id UUID NOT NULL REFERENCES utterances(id) ON DELETE CASCADE,

  play_id UUID REFERENCES plays(id) ON DELETE SET NULL,
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,

  shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reacted BOOLEAN NOT NULL DEFAULT false,
  reaction_kind TEXT CHECK (reaction_kind IS NULL OR reaction_kind IN ('hover', 'click', 'dismiss'))
);

COMMENT ON TABLE afterimage_events IS 'Log of afterimage shows per viewer. Used for dedupe (no repeat to same viewer) and analysis.';

CREATE INDEX IF NOT EXISTS idx_events_viewer_user
  ON afterimage_events (viewer_id, utterance_id)
  WHERE viewer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_viewer_anon
  ON afterimage_events (viewer_session_id, utterance_id)
  WHERE viewer_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_shown_at
  ON afterimage_events (shown_at DESC);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE utterances ENABLE ROW LEVEL SECURITY;
ALTER TABLE afterimage_events ENABLE ROW LEVEL SECURITY;

-- --- utterances policies ---

-- Read: anyone can read public+approved utterances
CREATE POLICY "Utterances public approved are readable by anyone"
  ON utterances FOR SELECT
  USING (is_public = true AND moderation_status = 'approved');

-- Read: contributors can read their own utterances (any status)
CREATE POLICY "Contributors can read own utterances"
  ON utterances FOR SELECT
  USING (auth.uid() IS NOT NULL AND contributor_id = auth.uid());

-- Read: admins can read everything
CREATE POLICY "Admins can read all utterances"
  ON utterances FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Insert: logged-in users can insert their own (is_public forced false, status forced pending)
CREATE POLICY "Users can insert own utterances"
  ON utterances FOR INSERT
  WITH CHECK (
    contributor_id = auth.uid()
    AND is_public = false
    AND moderation_status = 'pending'
  );

-- Insert: anonymous contributions allowed (contributor_id NULL, pending, non-public)
CREATE POLICY "Anonymous can insert utterances"
  ON utterances FOR INSERT
  WITH CHECK (
    contributor_id IS NULL
    AND is_public = false
    AND moderation_status = 'pending'
  );

-- Update: contributors can toggle their own is_public (withdraw consent), cannot change text or status
CREATE POLICY "Contributors can withdraw consent"
  ON utterances FOR UPDATE
  USING (auth.uid() IS NOT NULL AND contributor_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND contributor_id = auth.uid());

-- Update: admins can moderate (set status, flags, is_public)
CREATE POLICY "Admins can moderate utterances"
  ON utterances FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Delete: contributors can delete their own; admins can delete any
CREATE POLICY "Contributors can delete own utterances"
  ON utterances FOR DELETE
  USING (auth.uid() IS NOT NULL AND contributor_id = auth.uid());

CREATE POLICY "Admins can delete utterances"
  ON utterances FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- --- afterimage_events policies ---

-- Insert: anyone (logged in or anon) can log their own view events
CREATE POLICY "Anyone can insert own afterimage events"
  ON afterimage_events FOR INSERT
  WITH CHECK (
    (viewer_id IS NULL)
    OR (viewer_id = auth.uid())
  );

-- Update: viewers can mark their own events reacted
CREATE POLICY "Viewers can update own events"
  ON afterimage_events FOR UPDATE
  USING (
    (viewer_id IS NOT NULL AND viewer_id = auth.uid())
  );

-- Read: viewers can read their own event history (for dedupe)
CREATE POLICY "Viewers can read own events"
  ON afterimage_events FOR SELECT
  USING (
    (viewer_id IS NOT NULL AND viewer_id = auth.uid())
  );

-- Read: admins can read everything
CREATE POLICY "Admins can read all events"
  ON afterimage_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================================================
-- Helper: count intersection of two text[] (PostgreSQL has no built-in & for text[])
-- ============================================================================

CREATE OR REPLACE FUNCTION text_array_intersect_count(a TEXT[], b TEXT[])
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT COUNT(*)::int
     FROM (SELECT unnest(a) INTERSECT SELECT unnest(b)) AS _i),
    0
  );
$$;

COMMENT ON FUNCTION text_array_intersect_count IS 'Count of shared elements between two text arrays. Used by match_afterimage scoring.';

-- ============================================================================
-- RPC: match_afterimage
-- Returns a ranked-and-randomized afterimage candidate for a given context.
-- Excludes utterances the viewer has already seen.
-- ============================================================================

CREATE OR REPLACE FUNCTION match_afterimage(
  p_lang TEXT,
  p_emotion_tags TEXT[],
  p_keywords TEXT[],
  p_axis_x DOUBLE PRECISION,
  p_axis_z DOUBLE PRECISION,
  p_viewer_id UUID DEFAULT NULL,
  p_viewer_session_id TEXT DEFAULT NULL,
  p_prefer_contributor UUID DEFAULT NULL  -- set to viewer_id to bias toward viewer's own past utterances
)
RETURNS TABLE (
  id UUID,
  text TEXT,
  score DOUBLE PRECISION,
  is_own BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH seen AS (
    SELECT e.utterance_id
    FROM afterimage_events e
    WHERE
      (p_viewer_id IS NOT NULL AND e.viewer_id = p_viewer_id)
      OR (p_viewer_session_id IS NOT NULL AND e.viewer_session_id = p_viewer_session_id)
  ),
  candidates AS (
    SELECT
      u.id,
      u.text,
      u.contributor_id,
      (
        text_array_intersect_count(u.keywords, COALESCE(p_keywords, '{}'::text[])) * 3.0 +
        text_array_intersect_count(u.emotion_tags, COALESCE(p_emotion_tags, '{}'::text[])) * 2.0 +
        GREATEST(0, 2.0 - ABS(u.axis_x - p_axis_x) - ABS(u.axis_z - p_axis_z)) * 1.0 +
        (CASE WHEN p_prefer_contributor IS NOT NULL AND u.contributor_id = p_prefer_contributor THEN 4.0 ELSE 0.0 END) +
        random() * 0.3
      ) AS score
    FROM utterances u
    WHERE u.is_public = true
      AND u.moderation_status = 'approved'
      AND u.lang = p_lang
      AND u.id NOT IN (SELECT s.utterance_id FROM seen s)
  )
  SELECT
    c.id,
    c.text,
    c.score,
    (c.contributor_id IS NOT NULL AND c.contributor_id = p_viewer_id) AS is_own
  FROM candidates c
  ORDER BY c.score DESC
  LIMIT 5;
END;
$$;

COMMENT ON FUNCTION match_afterimage IS 'Rank-and-randomize afterimage candidates for a scene-close context. Client picks one from the top 5. Excludes already-seen utterances. See docs/잔상_시스템_설계-260409.md §6.1';

-- allow anon + authenticated to call it
GRANT EXECUTE ON FUNCTION match_afterimage TO anon, authenticated;

-- ============================================================================
NOTIFY pgrst, 'reload schema';

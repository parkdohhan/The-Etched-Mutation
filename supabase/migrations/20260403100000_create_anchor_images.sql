-- Anchor images for floating anchor system
-- Three types: text (keyword only), ascii (ASCII art), photo (Supabase Storage)
-- Selected based on memory vividness level

CREATE TABLE IF NOT EXISTS anchor_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  emotion TEXT,
  image_type TEXT NOT NULL CHECK (image_type IN ('text', 'ascii', 'photo')),
  content TEXT,
  storage_path TEXT,
  vividness_min FLOAT DEFAULT 0,
  vividness_max FLOAT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anchor_images_keyword ON anchor_images(keyword);
CREATE INDEX IF NOT EXISTS idx_anchor_images_emotion ON anchor_images(emotion);

-- RLS: everyone can read, admin can write
ALTER TABLE anchor_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anchor images readable by everyone"
  ON anchor_images FOR SELECT USING (true);

CREATE POLICY "Anchor images writable by admin"
  ON anchor_images FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Anchor images updatable by admin"
  ON anchor_images FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

NOTIFY pgrst, 'reload schema';

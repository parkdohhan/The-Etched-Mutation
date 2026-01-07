-- Create notes table for true ending note system
-- Allows players to send notes to memory authors when reaching true ending

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  note_type TEXT DEFAULT 'player_to_author',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notes_memory_id ON notes(memory_id);
CREATE INDEX IF NOT EXISTS idx_notes_sender_id ON notes(sender_id);
CREATE INDEX IF NOT EXISTS idx_notes_recipient_id ON notes(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notes_is_read ON notes(is_read);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);

-- Add RLS (Row Level Security) policies
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own received notes
CREATE POLICY "Users can read their own received notes"
  ON notes FOR SELECT
  USING (auth.uid() = recipient_id);

-- Policy: Users can insert notes they send
CREATE POLICY "Users can insert their own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Policy: Users can update notes they received (mark as read)
CREATE POLICY "Users can update their received notes"
  ON notes FOR UPDATE
  USING (auth.uid() = recipient_id);

-- Add comments for documentation
COMMENT ON TABLE notes IS 'Notes sent from players to memory authors when reaching true ending';
COMMENT ON COLUMN notes.memory_id IS 'Reference to the memory that triggered the note';
COMMENT ON COLUMN notes.sender_id IS 'User who sent the note (player who reached true ending)';
COMMENT ON COLUMN notes.recipient_id IS 'User who receives the note (memory author)';
COMMENT ON COLUMN notes.message IS 'Note message content (max 100 characters)';
COMMENT ON COLUMN notes.note_type IS 'Type of note: player_to_author, etc.';
COMMENT ON COLUMN notes.is_read IS 'Whether the recipient has read the note';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';


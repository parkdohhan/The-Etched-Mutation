-- memories 테이블에 소유권(curator_id) 추가
-- 기억을 생성한 사용자를 추적

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS curator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 인덱스 (RLS 서브쿼리 성능을 위해 필수)
CREATE INDEX IF NOT EXISTS idx_memories_curator_id ON memories(curator_id);

-- RLS 활성화
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능 (공개 아카이브)
CREATE POLICY "Memories are viewable by everyone"
  ON memories FOR SELECT USING (true);

-- 본인만 생성 (curator_id = 현재 사용자)
CREATE POLICY "Users can create own memories"
  ON memories FOR INSERT WITH CHECK (auth.uid() = curator_id);

-- 본인만 수정
CREATE POLICY "Users can update own memories"
  ON memories FOR UPDATE USING (auth.uid() = curator_id);

-- 본인만 삭제
CREATE POLICY "Users can delete own memories"
  ON memories FOR DELETE USING (auth.uid() = curator_id);

-- 문서화
COMMENT ON COLUMN memories.curator_id IS '기억을 생성한 사용자 (FK to auth.users)';

NOTIFY pgrst, 'reload schema';

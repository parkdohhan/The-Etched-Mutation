-- scenes/choices 테이블 RLS 정책
-- 읽기: 누구나 가능 (공개 아카이브)
-- 쓰기: 부모 memory의 curator_id 확인

-- ===== SCENES =====
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scenes readable by everyone"
  ON scenes FOR SELECT USING (true);

-- INSERT: 부모 memory의 curator_id 확인
-- 의존: memories.id PK 인덱스 + memories.curator_id 인덱스 (20250211에서 생성됨)
CREATE POLICY "Scenes writable by memory owner"
  ON scenes FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memories
      WHERE memories.id = memory_id
        AND memories.curator_id = auth.uid()
    )
  );

CREATE POLICY "Scenes updatable by memory owner"
  ON scenes FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM memories
      WHERE memories.id = memory_id
        AND memories.curator_id = auth.uid()
    )
  );

CREATE POLICY "Scenes deletable by memory owner"
  ON scenes FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM memories
      WHERE memories.id = memory_id
        AND memories.curator_id = auth.uid()
    )
  );

-- scenes.memory_id 인덱스 (RLS 서브쿼리 성능용)
CREATE INDEX IF NOT EXISTS idx_scenes_memory_id ON scenes(memory_id);

-- ===== CHOICES =====
ALTER TABLE choices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Choices readable by everyone"
  ON choices FOR SELECT USING (true);

-- INSERT: scenes → memories 경로로 소유자 확인
-- 의존: scenes.id PK + idx_scenes_memory_id + idx_memories_curator_id
CREATE POLICY "Choices writable by memory owner"
  ON choices FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenes s
      JOIN memories m ON s.memory_id = m.id
      WHERE s.id = scene_id
        AND m.curator_id = auth.uid()
    )
  );

CREATE POLICY "Choices updatable by memory owner"
  ON choices FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM scenes s
      JOIN memories m ON s.memory_id = m.id
      WHERE s.id = scene_id
        AND m.curator_id = auth.uid()
    )
  );

CREATE POLICY "Choices deletable by memory owner"
  ON choices FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM scenes s
      JOIN memories m ON s.memory_id = m.id
      WHERE s.id = scene_id
        AND m.curator_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';

-- Admin 사용자가 scenes와 choices를 관리할 수 있도록 RLS 정책 추가
-- profiles 테이블의 role이 'admin'인 사용자는 모든 scenes/choices에 접근 가능

-- ===== SCENES =====
-- Admin은 모든 scenes에 INSERT 가능
CREATE POLICY "Scenes writable by admin"
  ON scenes FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Admin은 모든 scenes에 UPDATE 가능
CREATE POLICY "Scenes updatable by admin"
  ON scenes FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Admin은 모든 scenes에 DELETE 가능
CREATE POLICY "Scenes deletable by admin"
  ON scenes FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ===== CHOICES =====
-- Admin은 모든 choices에 INSERT 가능
CREATE POLICY "Choices writable by admin"
  ON choices FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Admin은 모든 choices에 UPDATE 가능
CREATE POLICY "Choices updatable by admin"
  ON choices FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Admin은 모든 choices에 DELETE 가능
CREATE POLICY "Choices deletable by admin"
  ON choices FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ===== MEMORIES =====
-- Admin은 모든 memories에 INSERT/UPDATE/DELETE 가능
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Admin은 모든 memories에 INSERT 가능
CREATE POLICY "Memories writable by admin"
  ON memories FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Admin은 모든 memories에 UPDATE 가능
CREATE POLICY "Memories updatable by admin"
  ON memories FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Admin은 모든 memories에 DELETE 가능
CREATE POLICY "Memories deletable by admin"
  ON memories FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- profiles.id 인덱스 (RLS 서브쿼리 성능용)
CREATE INDEX IF NOT EXISTS idx_profiles_id_role ON profiles(id, role);

NOTIFY pgrst, 'reload schema';


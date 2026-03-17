-- Admin RLS 정책 수정 및 추가
-- 기존 정책과 충돌하지 않도록 OR 조건으로 작동

-- ===== SCENES =====
-- 기존 admin 정책이 있으면 삭제
DROP POLICY IF EXISTS "Scenes writable by admin" ON scenes;
DROP POLICY IF EXISTS "Scenes updatable by admin" ON scenes;
DROP POLICY IF EXISTS "Scenes deletable by admin" ON scenes;

-- Admin은 모든 scenes에 INSERT 가능 (OR 조건으로 기존 정책과 함께 작동)
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
-- 기존 admin 정책이 있으면 삭제
DROP POLICY IF EXISTS "Choices writable by admin" ON choices;
DROP POLICY IF EXISTS "Choices updatable by admin" ON choices;
DROP POLICY IF EXISTS "Choices deletable by admin" ON choices;

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
-- memories 테이블 RLS 활성화 확인
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- 기존 admin 정책이 있으면 삭제
DROP POLICY IF EXISTS "Memories writable by admin" ON memories;
DROP POLICY IF EXISTS "Memories updatable by admin" ON memories;
DROP POLICY IF EXISTS "Memories deletable by admin" ON memories;

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

-- profiles 테이블 읽기 정책 확인 (admin 정책이 profiles를 조회할 수 있어야 함)
-- profiles는 이미 SELECT 정책이 있으므로 추가 불필요

-- 인덱스 생성 (성능 향상)
CREATE INDEX IF NOT EXISTS idx_profiles_id_role ON profiles(id, role);

NOTIFY pgrst, 'reload schema';



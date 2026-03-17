-- profiles 테이블: 사용자 프로필 관리
-- auth.users와 1:1 관계, 회원가입 시 트리거로 자동 생성

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  memories_count INTEGER DEFAULT 0,
  interpretations_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- RLS 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 누구나 프로필 읽기 가능 (공개 정보)
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

-- 본인만 자기 프로필 수정
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 회원가입 시 자동 생성
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 자동 생성 트리거: auth.users에 새 사용자가 등록되면 profiles에 자동 삽입
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 기존 트리거가 있으면 삭제 후 재생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 문서화
COMMENT ON TABLE profiles IS '사용자 프로필 - auth.users와 1:1, 회원가입 시 자동 생성';
COMMENT ON COLUMN profiles.role IS '사용자 역할: user (기본), admin (관리자)';
COMMENT ON COLUMN profiles.memories_count IS '생성한 기억 수 (캐시)';
COMMENT ON COLUMN profiles.interpretations_count IS '경험한 기억 수 (캐시)';

-- PostgREST 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';

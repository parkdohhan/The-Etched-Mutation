-- plays 테이블에 user_id 추가
-- 익명 참여 허용: user_id는 NULL 가능 (익명으로 남기기)
-- 로그인 사용자: user_id 기록 → "내가 경험한 기억들" 추적 가능

ALTER TABLE plays
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_plays_user_id ON plays(user_id);

-- RLS 활성화
ALTER TABLE plays ENABLE ROW LEVEL SECURITY;

-- 누구나 plays 읽기 (지층 데이터는 공개)
CREATE POLICY "Plays are viewable by everyone"
  ON plays FOR SELECT USING (true);

-- 익명(user_id=NULL) + 로그인 사용자 모두 play 기록 가능
CREATE POLICY "Anyone can create plays"
  ON plays FOR INSERT WITH CHECK (true);

-- 문서화
COMMENT ON COLUMN plays.user_id IS '기억을 경험한 사용자 (NULL이면 익명 참여)';

NOTIFY pgrst, 'reload schema';

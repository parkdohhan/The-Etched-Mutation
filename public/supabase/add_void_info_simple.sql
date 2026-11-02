-- scenes 테이블에 void_info 컬럼 추가 (간단 버전)

-- 컬럼 추가 (이미 있으면 에러 발생하지 않음)
ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS void_info JSONB DEFAULT NULL;

-- 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';



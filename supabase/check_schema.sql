-- Supabase scenes 테이블 스키마 확인 및 void_info 컬럼 추가

-- 1. 현재 scenes 테이블의 모든 컬럼 확인
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_name = 'scenes'
ORDER BY ordinal_position;

-- 2. void_info 컬럼이 없으면 추가
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'scenes' 
        AND column_name = 'void_info'
    ) THEN
        ALTER TABLE scenes
        ADD COLUMN void_info JSONB DEFAULT NULL;
        
        RAISE NOTICE 'void_info 컬럼이 추가되었습니다.';
    ELSE
        RAISE NOTICE 'void_info 컬럼이 이미 존재합니다.';
    END IF;
END $$;

-- 3. 다시 한번 확인
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_name = 'scenes'
AND column_name = 'void_info';

-- 4. PostgREST 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';



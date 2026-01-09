-- plays 테이블에 mismatch_type 컬럼 추가
ALTER TABLE plays 
ADD COLUMN mismatch_type text DEFAULT NULL;

-- 선택적으로 인덱스 추가 (성능 향상)
CREATE INDEX IF NOT EXISTS idx_plays_mismatch_type ON public.plays (mismatch_type);

-- 선택적으로 memory_id와 mismatch_type 복합 인덱스 추가 (오염 방향 결정 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_plays_memory_mismatch ON public.plays (memory_id, mismatch_type) 
WHERE mismatch_type IS NOT NULL;






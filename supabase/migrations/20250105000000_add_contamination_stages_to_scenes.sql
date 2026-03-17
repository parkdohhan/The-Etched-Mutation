-- 오염 시스템을 위한 scenes 테이블 컬럼 추가
-- plays 수에 따라 텍스트가 변형되는 단계별 캐시 저장

ALTER TABLE scenes 
ADD COLUMN IF NOT EXISTS text_stage_1 text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS text_stage_2 text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS text_stage_3 text DEFAULT NULL;

-- 인덱스 추가 (선택사항, 성능 향상)
CREATE INDEX IF NOT EXISTS idx_scenes_text_stage_1 ON scenes(text_stage_1) WHERE text_stage_1 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scenes_text_stage_2 ON scenes(text_stage_2) WHERE text_stage_2 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scenes_text_stage_3 ON scenes(text_stage_3) WHERE text_stage_3 IS NOT NULL;






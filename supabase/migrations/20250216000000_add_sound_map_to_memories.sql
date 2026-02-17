-- memories 테이블에 sound_map JSONB 컬럼 추가
-- 기억별 커스텀 사운드 매핑 저장
-- 예: { "opening": "sounds/custom.mp3", "HIGH": "sounds/rain.mp3", ... }
ALTER TABLE memories ADD COLUMN IF NOT EXISTS sound_map JSONB DEFAULT NULL;

-- 인덱스 (선택사항, JSONB 쿼리 성능 향상)
CREATE INDEX IF NOT EXISTS idx_memories_sound_map ON memories USING GIN (sound_map);

-- 문서화
COMMENT ON COLUMN memories.sound_map IS '기억별 커스텀 사운드 매핑 (JSONB) - {opening, HIGH, MID, LOW, FIXATED}';

NOTIFY pgrst, 'reload schema';



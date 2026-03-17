-- V3 Confession 메타데이터 컬럼 추가
-- sensory_anchor: 감각 앵커 (modality, content, weight, arousal_weight?)
-- body_response: 신체 반응 칩 선택값 배열
-- self_questions: 자기 질문 배열 [{text, category, audio_url?}]

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS sensory_anchor jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS body_response text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS self_questions jsonb DEFAULT NULL;

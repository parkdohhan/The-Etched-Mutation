-- plays.run_id — 회차 식별자 (2026-07-17, 지휘)
-- 배경: 익명 관객은 user_id 가 null 이라 회차 복원이 시간 군집 근사뿐이었고,
--   봉인 도장 UPDATE 가 시간 창 필터라 동시 관객이 서로의 행에 도장을 찍는 구조였다.
--   이론 자료(층 논문 C2: 절편=회차 / 시스템 논문: 회차 궤적)의 단위가 바로 회차이므로
--   클라이언트 생성 uuid 를 행마다 기록한다. 과거 행은 null 유지(시간 군집 근사로만 해석).
ALTER TABLE plays ADD COLUMN IF NOT EXISTS run_id uuid;
COMMENT ON COLUMN plays.run_id IS '회차 식별자 (클라이언트 생성 uuid, 2026-07-17) — 절편/도장/궤적의 단위. 과거 행 null.';
CREATE INDEX IF NOT EXISTS idx_plays_memory_run ON plays (memory_id, run_id);

-- ============================================================================
-- plays.sky_stains — 하늘 감정 얼룩 (개인 영역, 한 판의 기록)
--
-- 하늘은 지층(지형)과 다르다.
--   · 지형 = 릴레이·누적. 앞사람의 궤적을 물려받는다.
--   · 하늘 = 개인의 영역. 빈 남색 하늘로 시작해서, 텍스트 분석으로 확정된 감정이
--            '얼룩'으로 쌓인다(교체 X — 화냈다가 슬퍼지면 붉은 얼룩과 푸른 얼룩이 같이 남는다).
--            기억 단위로 리셋되고, 플레이어 A의 하늘은 플레이어 B에게 넘어가지 않는다.
--
-- 넘어가는 건 왜곡된 말과 흔적(ghost_variants / 지형)뿐이고, 내가 실제로 느낀 것
-- 자체는 옮겨지지 않는다 — 그 비대칭을 시각화한 것이 하늘이다.
--
-- 이 컬럼은 판이 끝났을 때 "나는 이 기억을 어떤 감정으로 읽었는가"의 자료로,
-- 그 회차의 모든 plays 행에 도장 찍힌다 (final_drift_vector 와 같은 자리·같은 방식).
--
-- 형태: { "memory_id": "...", "stains": [ { "r":200, "g":80, "b":80, "w":0.8 }, ... ] }
--   r,g,b = 감정색 0~255 / w = 누적 무게 0~1 (같은 결의 감정을 반복하면 진해짐)
-- ============================================================================

ALTER TABLE plays
  ADD COLUMN IF NOT EXISTS sky_stains jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE plays
  DROP CONSTRAINT IF EXISTS plays_sky_stains_object_chk;
ALTER TABLE plays
  ADD CONSTRAINT plays_sky_stains_object_chk
  CHECK (jsonb_typeof(sky_stains) = 'object');

COMMENT ON COLUMN plays.sky_stains IS
  '하늘 감정 얼룩 — 이 판(기억 1회차)에서 플레이어가 뱉은 감정들이 하늘에 쌓인 얼룩 목록. 릴레이 X (개인 영역, 기억 단위 리셋). { memory_id, stains:[{r,g,b,w}] }';

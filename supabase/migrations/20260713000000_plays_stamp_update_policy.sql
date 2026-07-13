-- ============================================================================
-- plays UPDATE 정책 — 봉인 도장 전용 (final_drift_vector / ghost_variant_id / sky_stains)
--
-- 배경 (2026-07-13 발견): plays 에는 SELECT/INSERT 정책만 있고 UPDATE 정책이
-- 없었다. RLS 는 권한 없는 UPDATE 를 에러 없이 "0행 갱신"으로 통과시키므로,
-- 판 봉인 시의 도장(sb.from('plays').update(...))이 2026-01 이후 전 기간
-- 조용히 증발 — final_drift_vector 가 400/400 행에서 '{}' 로 남아 있었다.
--
-- 범위 제한: RLS 는 컬럼을 못 좁히므로 GRANT 를 도장 3컬럼으로 축소.
-- 익명 사용자는 이 3컬럼 외 (memory_id, user_emotion, 본문 등) 는 여전히
-- UPDATE 불가 (permission denied). 행 범위는 열려 있음 — 익명 참여 작품이라
-- 익명 INSERT 와 같은 신뢰 모델. 남용이 관찰되면 그때 행 조건 추가.
-- ============================================================================

REVOKE UPDATE ON plays FROM anon, authenticated;
GRANT UPDATE (ghost_variant_id, final_drift_vector, sky_stains)
  ON plays TO anon, authenticated;

DROP POLICY IF EXISTS "allow stamp update on plays" ON plays;
CREATE POLICY "allow stamp update on plays" ON plays
  FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

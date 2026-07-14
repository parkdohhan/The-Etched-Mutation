-- R3-5 (D3 🟡): plays 정책 정리 + 도장 UPDATE 행 범위 제한
-- 적용: 2026-07-14 (apply_migration `plays_policy_cleanup_and_stamp_window`)
--
-- 실측으로 확인된 것 (L3-06 의 전제 일부 정정):
--   컬럼 단위 GRANT 는 **이미 적용돼 있었다** (20260713000000 도장 마이그레이션).
--   anon/authenticated 의 UPDATE 권한 = ghost_variant_id, final_drift_vector, sky_stains 3개뿐.
--   따라서 "익명이 아무 컬럼이나 UPDATE" 는 성립하지 않는다. (실측: 도장 밖 컬럼 PATCH → 42501 permission denied)
--
-- 남아 있던 진짜 구멍: **행 범위가 열려 있다** — 익명이 *남의 과거 회차* 도장을 덮어쓸 수 있었다.
--   7-13 작성자가 "남용이 관찰되면 그때 행 조건 추가"로 유예한 자리. 지금 닫는다.
--   도장은 회차 끝(= plays INSERT 직후 수 분 내)에만 찍힌다. 그래서 최근 창으로 좁힌다.
--   창 24시간 = 긴 세션도 안 깨지는 넉넉한 값. 403행의 누적 관객 기록은 이제 못 건드린다.
--
-- 그리고 무의미 중복 정책 정리: INSERT 3중 / SELECT 3중 → 각 1벌 (전부 all-true 라 동작 동일,
--   매 요청 3중 평가 비용만 있었다 — advisor multiple_permissive_policies).
--
-- 검증 (익명 REST, 2026-07-14):
--   신규 행 INSERT → 200 / 그 행 도장 UPDATE → 200 (final_drift_vector 반영 확인)
--   도장 밖 컬럼 UPDATE → 42501 거부 / 24시간 밖 과거 행 도장 → 0행 (차단)

-- ── INSERT: 3중 → 1벌 (roles=public 유지 = 기존 동작 그대로) ──
DROP POLICY IF EXISTS "Anyone can create plays" ON public.plays;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.plays;
DROP POLICY IF EXISTS "allow insert for anon plays" ON public.plays;
CREATE POLICY "plays_insert_anyone" ON public.plays
  FOR INSERT TO public
  WITH CHECK (true);

-- ── SELECT: 3중 → 1벌 (지층 데이터는 공개 — 기존 동작 그대로) ──
DROP POLICY IF EXISTS "Enable read access for all users" ON public.plays;
DROP POLICY IF EXISTS "Plays are viewable by everyone" ON public.plays;
DROP POLICY IF EXISTS "allow select from plays" ON public.plays;
CREATE POLICY "plays_select_anyone" ON public.plays
  FOR SELECT TO public
  USING (true);

-- ── UPDATE: 도장 전용 + 최근 24시간 행만 ──
DROP POLICY IF EXISTS "allow stamp update on plays" ON public.plays;
CREATE POLICY "plays_stamp_update_recent" ON public.plays
  FOR UPDATE TO anon, authenticated
  USING (created_at > now() - interval '24 hours')
  WITH CHECK (created_at > now() - interval '24 hours');

-- GRANT 는 그대로 (도장 3컬럼). 재확인 겸 명시.
REVOKE UPDATE ON public.plays FROM anon, authenticated;
GRANT UPDATE (ghost_variant_id, final_drift_vector, sky_stains)
  ON public.plays TO anon, authenticated;

-- 주의 (수리 안 함 — R3 보고서 §못 고친 것 참조):
--   plays 에는 **DELETE 정책이 아예 없다.** 그래서 admin 의 plays 삭제(repo.js deleteMemoryGraph,
--   admin.js nukeThenReseed)는 조용히 0행 처리된다 → L3-10 의 "고아 plays 24행"의 원인.
--   지금은 이 침묵이 *우연한 안전망*으로 작동 중이다 (F1 파괴 경로가 살아있는 동안 데이터를 지켜준다).
--   R1 이 저작 파괴 연산을 고치기 전에는 DELETE 정책을 추가하지 말 것.

NOTIFY pgrst, 'reload schema';

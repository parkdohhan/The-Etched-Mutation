-- 2026-11-24 — close the anonymous memory writes opened on 2026-03-31 (20260331000000_allow_anonymous_record.sql).
--
-- Why: making a memory now needs a login (user request 261124; record-space-seal returns 401 without one), and
-- sign-up is open. The three rules below let
--   1. anyone, signed in or not, insert a memory with no owner (a way round the login),
--   2. anyone, signed in or not, insert scenes into ANY memory with no owner — 13 memories had none on 261124,
--      among them UNDW-001, UNDW-001-EN and GWON-001,
--   3. any signed-in user take ownership of any memory with no owner, and through the owner rules on scenes
--      (update / delete) rewrite or remove it.
-- Their only user was the old RECORD (js/app/confession.js, hidden from the menu since 261123): save without a
-- login, claim after logging in. record-space saves through the server (service role) and is not affected;
-- the admin screens write through the admin rules and are not affected.
--
-- Rollback: re-run 20260331000000_allow_anonymous_record.sql.

DROP POLICY IF EXISTS "Allow anonymous memory creation" ON public.memories;
DROP POLICY IF EXISTS "Users can claim anonymous memories" ON public.memories;
DROP POLICY IF EXISTS "Allow anonymous scene creation" ON public.scenes;

NOTIFY pgrst, 'reload schema';

-- R3-7 (L3-13 🟢): RLS initplan 최적화 — 정책 안의 auth.uid() 를 (select auth.uid()) 로 감싼다.
-- 적용: 2026-07-14 (apply_migration `rls_initplan_wrap_auth_uid`)
--
-- 배경: 정책 표현식에 auth.uid() 가 벌거벗고 들어가면 Postgres 가 **행마다** 재평가한다.
--   (select auth.uid()) 로 감싸면 InitPlan 으로 승격돼 쿼리당 1회만 평가된다.
--   advisor auth_rls_initplan 41건. admin 의 씬·선택지 대량 저장에서 행 단위 비용으로 돌아온다.
--
-- 의미는 완전히 동일하다 (같은 값, 평가 횟수만 다름). 그래서 정책 본문을 손으로 다시 쓰지 않고,
-- 카탈로그에서 현재 정의를 읽어 auth.uid() 만 기계적으로 감싸 재생성한다 — 오타로 RLS 를 뚫거나
-- 잠글 여지를 없앤다. 트랜잭션이라 중간 실패 시 전부 롤백.
--
-- 검증 (2026-07-14, 실측):
--   정책 수 57 → 57 유지
--   벌거벗은 auth.uid() 41 → 0
--   역정규화 md5 = 적용 전 md5 (23d4af1d34c497531cec9c048fd460a1) → **의미 불변 증명**
--     (Postgres 는 (select auth.uid()) 를 "( SELECT auth.uid() AS uid)" 로 역컴파일하므로,
--      그 문자열을 auth.uid() 로 되돌려 비교했다.)

DO $do$
DECLARE
  r record;
  v_qual text;
  v_check text;
  v_roles text;
  v_sql text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ILIKE '%auth.uid()%'
      AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) NOT ILIKE '%select auth.uid()%'
  LOOP
    v_qual  := replace(r.qual,       'auth.uid()', '(select auth.uid())');
    v_check := replace(r.with_check,  'auth.uid()', '(select auth.uid())');
    v_roles := array_to_string(r.roles, ', ');

    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    v_sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
                    r.policyname, r.schemaname, r.tablename,
                    CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                    r.cmd, v_roles);

    IF v_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;

    EXECUTE v_sql;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';

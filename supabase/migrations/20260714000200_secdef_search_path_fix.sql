-- R3-6 (D3 🟡): SECURITY DEFINER 함수 search_path 고정
-- 적용: 2026-07-14 (apply_migration `secdef_search_path_fix`)
--
-- 실측: SECURITY DEFINER 함수 3개 중 handle_new_user 만 proconfig 가 비어 있었다.
--   match_afterimage        → search_path=public          (이미 고정)
--   utterances_before_update→ search_path=public, pg_temp (이미 고정)
--   handle_new_user         → NULL                        ← 이것만 수리
--
-- SECURITY DEFINER + search_path 미고정 = 스키마 하이재킹 이론상 벡터
-- (호출자가 search_path 를 조작해 동명의 다른 테이블/함수를 태울 수 있음).
-- 본문이 public.profiles 로 완전 수식돼 있으므로 빈 search_path 로 고정해도 안전.
-- (COALESCE / split_part 는 pg_catalog 내장이라 항상 암묵 경로에 있음.)
--
-- EXECUTE revoke 는 **하지 않았다**: 트리거 함수라 PostgREST 로 직접 호출할 수 없고
-- (반환형이 trigger), 가입 경로(GoTrue)를 깨뜨릴 위험 대비 실익이 없다.
--
-- 검증 (2026-07-14): 고정 후 실제 가입 1건 수행 → profiles 행 자동 생성 확인 → 테스트 계정 삭제.

ALTER FUNCTION public.handle_new_user() SET search_path = '';

COMMENT ON FUNCTION public.handle_new_user() IS
  'auth.users INSERT 트리거 → public.profiles 자동 생성. search_path 고정 (2026-07-14 R3-6).';

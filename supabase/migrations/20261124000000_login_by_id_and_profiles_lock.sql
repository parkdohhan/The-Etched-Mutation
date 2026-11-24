-- 2026-11-24 — sign-up with an ID, sign-in with ID or email, and the profiles table locked down.
--
-- Why (user request 261124): "아이디랑 이메일은 따로 받아서, 아이디는 @gmail.com 안 붙여도 되게,
-- 비밀번호는 영어·숫자 7자". Making a memory (record-space) now needs a login.
--
-- 1. profiles.username is unique, ignoring case.
-- 2. profiles rows are readable only by their owner (emails were readable by anyone).
-- 3. profiles can no longer be inserted or updated from the browser. The UPDATE policy had no column limit,
--    so any signed-up user could set their own role to 'admin' and gain the admin write policies on
--    memories / scenes / choices / utterances / ghost_variants. Rows are made only by the signup trigger.
-- 4. public.login_email(id, password): returns the account email only when the password matches,
--    so the browser can call signInWithPassword(email, password). Unknown IDs cost the same time
--    (a dummy bcrypt check). 10 failures for one ID in 15 minutes → 'too_many_attempts'.
-- 5. public.username_taken(id): for the sign-up form.
-- 6. handle_new_user: a username chosen in our sign-up form (meta tem_signup) that is already taken
--    fails the sign-up; a username from elsewhere (future OAuth) gets a short suffix instead.
--
-- Rollback: see the block at the end.

-- ── 1. unique username, ignoring case ───────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON public.profiles (lower(username));

-- ── 2. owner-only read ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- ── 3. no writes from the browser ───────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;

-- ── 4. sign-in with an ID ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_failures (
  id    bigserial PRIMARY KEY,
  login text NOT NULL,
  at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_failures_login_at ON public.login_failures (login, at);
ALTER TABLE public.login_failures ENABLE ROW LEVEL SECURITY;          -- no policies: only the function below touches it
REVOKE ALL ON public.login_failures FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.login_email(p_login text, p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_login text := lower(btrim(coalesce(p_login, '')));
  v_email text;
  v_hash  text;
BEGIN
  IF v_login = '' OR coalesce(p_password, '') = '' THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM public.login_failures f
       WHERE f.login = v_login AND f.at > now() - interval '15 minutes') >= 10 THEN
    RAISE EXCEPTION 'too_many_attempts' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.email, u.encrypted_password INTO v_email, v_hash
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE lower(p.username) = v_login
   LIMIT 1;

  IF v_hash IS NOT NULL AND v_hash <> '' THEN
    IF extensions.crypt(p_password, v_hash) = v_hash THEN
      RETURN v_email;
    END IF;
  ELSE
    -- same cost as a real check, so an unknown ID does not answer faster
    PERFORM extensions.crypt(p_password, '$2a$10$RGjN.kzsHSD8ypTugHHAIODnVnqm015e/rCBaRLUkY9nb/lp9y6ey');
  END IF;

  INSERT INTO public.login_failures (login) VALUES (v_login);
  DELETE FROM public.login_failures WHERE at < now() - interval '1 day';
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.login_email(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.login_email(text, text) TO anon, authenticated;

-- ── 5. is an ID taken ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.username_taken(p_login text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(btrim(coalesce(p_login, ''))));
$$;
REVOKE ALL ON FUNCTION public.username_taken(text) FROM public;
GRANT EXECUTE ON FUNCTION public.username_taken(text) TO anon, authenticated;

-- ── 6. the sign-up trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := nullif(btrim(coalesce(NEW.raw_user_meta_data->>'username', '')), '');
  v_base text;
  v_try  int := 0;
BEGIN
  IF v_name IS NOT NULL AND (NEW.raw_user_meta_data->>'tem_signup') = 'true' THEN
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(v_name)) THEN
      RAISE EXCEPTION 'username_taken' USING ERRCODE = '23505';
    END IF;
  ELSE
    v_base := left(coalesce(v_name, split_part(NEW.email, '@', 1), 'walker'), 20);
    v_name := v_base;
    WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(v_name)) AND v_try < 20 LOOP
      v_try := v_try + 1;
      v_name := left(v_base, 15) || '_' || substr(md5(random()::text), 1, 4);
    END LOOP;
  END IF;

  INSERT INTO public.profiles (id, username, email) VALUES (NEW.id, v_name, NEW.email);
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.handle_new_user() IS
  'auth.users INSERT → public.profiles. 261124: our sign-up form (meta tem_signup) fails on a taken ID; other sources get a suffix.';

-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.login_email(text, text);
-- DROP FUNCTION IF EXISTS public.username_taken(text);
-- DROP TABLE IF EXISTS public.login_failures;
-- DROP INDEX IF EXISTS public.profiles_username_lower_key;
-- DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
-- CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
-- GRANT INSERT, UPDATE ON public.profiles TO authenticated;
-- CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
-- CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
-- (handle_new_user: the 2025-02-10 body is in 20250210000000_create_profiles_table.sql)

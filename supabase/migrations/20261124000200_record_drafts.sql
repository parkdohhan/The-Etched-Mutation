-- 261124 기억 만들기 임시저장 (작가: "서버 자리를 만들어야지")
-- 계정마다 한 줄. 본인만 읽고·쓰고·지운다. 로그인 안 한 요청(anon)은 아무것도 못 한다.
-- payload = 화면의 임시저장 모양 그대로(js/recordspace/main.js draftNow: v, savedAt, lang, title, desc, scenes[]).
-- 되돌리기: drop table public.record_drafts;

create table if not exists public.record_drafts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  constraint record_drafts_payload_size check (pg_column_size(payload) < 600000)   -- 열두 장면 + 대화·조형물 조리법이 넉넉히 들어가는 크기
);

alter table public.record_drafts enable row level security;

revoke all on public.record_drafts from anon;
grant select, insert, update, delete on public.record_drafts to authenticated;

create policy record_drafts_select_own on public.record_drafts for select to authenticated using (user_id = (select auth.uid()));
create policy record_drafts_insert_own on public.record_drafts for insert to authenticated with check (user_id = (select auth.uid()));
create policy record_drafts_update_own on public.record_drafts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy record_drafts_delete_own on public.record_drafts for delete to authenticated using (user_id = (select auth.uid()));

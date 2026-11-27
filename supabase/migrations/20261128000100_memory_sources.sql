-- 261128 기억의 본문 (작가: "단편소설 넣어서 1차 자동생성 … edit 에서 그 방식으로 만들어진 기억이면 본문도 볼 수 있게")
-- 기억 만들기(record-space.html)에서 소설을 넣어 초안을 받아 만든 기억의 본문 전체. 고치기(memory-edit.html)에서 주인이 새 창으로 본다.
--
-- memories.meta 에 두지 않는 이유: memories 는 누구나 읽는다 — 거기 두면 소설 전문이 공개된다.
-- 이 표는 **주인만** 읽고 쓰고 지운다. 로그인 안 한 요청은 아무것도 못 한다. 서버 장치도 이 표를 읽지 않는다.
-- 되돌리기: drop table public.memory_sources;

create table if not exists public.memory_sources (
  memory_id  uuid        primary key references public.memories(id) on delete cascade,
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  text       text        not null,
  created_at timestamptz not null default now(),
  constraint memory_sources_size check (char_length(text) < 200000)
);

alter table public.memory_sources enable row level security;

revoke all on public.memory_sources from anon;
grant select, insert, update, delete on public.memory_sources to authenticated;

create policy memory_sources_select_own on public.memory_sources for select to authenticated using (owner_id = (select auth.uid()));
create policy memory_sources_insert_own on public.memory_sources for insert to authenticated
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.memories m where m.id = memory_id and m.curator_id = (select auth.uid())));
create policy memory_sources_update_own on public.memory_sources for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy memory_sources_delete_own on public.memory_sources for delete to authenticated using (owner_id = (select auth.uid()));

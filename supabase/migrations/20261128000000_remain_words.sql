-- 261128 남는 말 (space-remain.html) — 관객의 말이 기억의 글에 남는 자리 (작가: "사이트에 반영해")
-- 기록: docs/우주무대_남는말_실험-261128.md
--
-- 장면의 원래 글(scenes.text)은 건드리지 않는다. 바뀐 글은 여기 따로 둔다 — 되돌리려면 이 세 표만 비우면 된다:
--   delete from public.remain_texts; delete from public.remain_outside; delete from public.remain_walks;
-- 걷어내려면: drop table public.remain_texts, public.remain_outside, public.remain_walks;
--
-- 쓰기는 전부 서버 장치(remain-commit, service role)만 한다. 브라우저는 읽기만 한다.
--   remain_texts   = 장면이 지금 어떻게 읽히는가 (누구나 읽음 — 다음 사람이 읽는 글)
--   remain_outside = 밖에서 보는 지금의 소개·줄거리 (누구나 읽음)
--   remain_walks   = 한 걸음이 남긴 것 전부. 들어가기 전에 적은 세 문장(blanks)이 들어 있어 **아무도 읽지 못한다**
--                    (동의 장: "들어가기 전에 적는 세 문장은 다른 사람에게 보이지 않습니다").

create table if not exists public.remain_texts (
  memory_id        uuid        not null references public.memories(id) on delete cascade,
  scene_order      integer     not null,
  text             text        not null,
  walker_sentences jsonb       not null default '[]'::jsonb,   -- 지금 이 글의 문장 가운데 관객의 말이었던 것들
  changes          integer     not null default 0,             -- 이 장면이 바뀐 횟수
  updated_at       timestamptz not null default now(),
  primary key (memory_id, scene_order),
  constraint remain_texts_size check (char_length(text) < 4000)
);

create table if not exists public.remain_outside (
  memory_id  uuid        primary key references public.memories(id) on delete cascade,
  intro      text        not null,
  synopsis   text        not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.remain_walks (
  id         uuid        primary key default gen_random_uuid(),
  memory_id  uuid        not null references public.memories(id) on delete cascade,
  run_id     text        not null,
  walker     text,                       -- 브라우저의 무작위 표시(localStorage tem_walker_key) — 사람·계정 아님
  user_id    uuid,                       -- 로그인한 채 걸었으면 그 계정
  lang       text,
  consent    jsonb,                      -- { v, at } 동의한 때
  blanks     jsonb,                      -- 들어가기 전에 적은 세 문장 (비공개)
  lines      jsonb,                      -- 장면에게 한 말 전부와 그 읽기
  changes    jsonb,                      -- 글에 들어간 것: [{ order, index, was, now, raw, blank }]
  applied    boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remain_walks_run unique (memory_id, run_id),
  constraint remain_walks_size check (pg_column_size(lines) < 200000)
);
create index if not exists remain_walks_walker on public.remain_walks (memory_id, walker);
create index if not exists remain_walks_user on public.remain_walks (memory_id, user_id);

alter table public.remain_texts   enable row level security;
alter table public.remain_outside enable row level security;
alter table public.remain_walks   enable row level security;

revoke all on public.remain_texts, public.remain_outside, public.remain_walks from anon, authenticated;
grant select on public.remain_texts, public.remain_outside to anon, authenticated;

create policy remain_texts_read   on public.remain_texts   for select to anon, authenticated using (true);
create policy remain_outside_read on public.remain_outside for select to anon, authenticated using (true);
-- remain_walks: 정책 없음 = 서버 장치(service role)만.

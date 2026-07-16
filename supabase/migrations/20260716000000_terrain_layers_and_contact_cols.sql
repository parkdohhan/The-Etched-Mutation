-- 이본 지층 W2-1 (2026-07-16): 변형층 표 + 접촉 기록 컬럼.
-- 정본: docs/이본지층/이본지층_설계_v1-260716.md §5 데이터, 결정 4·6·7.
--
-- terrain_layers = 기억별 누적 변형층(높이 델타 + 발길 지도)의 캐시.
--   plays 로그가 진실, 이 표는 재구성 가능한 캐시(rebuildFromPlays).
--   쓰기는 record-erosion Edge Function(service_role)만. 관객 직접 쓰기 금지가 설계.
-- trajectory_bridges ALTER = 기존 테이블을 접촉 기록으로 전용(轉用). status='contact'.

-- ─── terrain_layers 신설 ────────────────────────────────────────
create table if not exists public.terrain_layers (
  memory_id    uuid primary key references public.memories(id) on delete cascade,
  height_delta jsonb       not null default '{}'::jsonb,
  foot_map     jsonb       not null default '{}'::jsonb,
  generation   int         not null default 0,
  updated_at   timestamptz not null default now()
);

comment on table  public.terrain_layers is '이본 지층(2026-07-16 W2): 기억별 누적 변형층. plays 로그가 진실, 이 표는 캐시 — W1 rebuildFromPlays 로 재구성 가능. 쓰기는 record-erosion Edge(service_role) 전용.';
comment on column public.terrain_layers.height_delta is '높이맵 델타(원본 바닥 대비, 소수2자리 반올림). 구조는 W1 serializeLayer 계약을 따름 — 서버는 구조에 무지, 숫자 잎만 범위 검증.';
comment on column public.terrain_layers.foot_map   is '발길 지도 0~1 정규화 jsonb.';
comment on column public.terrain_layers.generation is '봉인 세대. 단조 증가. record-erosion 이 서버 보관값+1 만 허용(역행·점프 거부).';

alter table public.terrain_layers enable row level security;

-- SELECT 공개(anon/authenticated). INSERT/UPDATE/DELETE 정책은 두지 않는다.
-- = 관객(anon)의 쓰기는 매칭 행 0개로 조용히 통과(0행 UPDATE, 에러 아님). Edge service_role 만 RLS 우회.
drop policy if exists "terrain_layers public read" on public.terrain_layers;
create policy "terrain_layers public read"
on public.terrain_layers for select
to anon, authenticated
using (true);

-- ─── trajectory_bridges ALTER: 접촉 기록 전용 컬럼 ───────────────
alter table public.trajectory_bridges
  add column if not exists contact_utterance text,
  add column if not exists contact_turn      int;

comment on column public.trajectory_bridges.contact_utterance is '2026-07-16 접촉 기록 전용(轉用) — 정본화 없음. status=contact 행에서 유령과 겹친 순간의 발화.';
comment on column public.trajectory_bridges.contact_turn      is '2026-07-16 접촉 기록 전용(轉用) — 정본화 없음. 접촉이 일어난 대화 턴 번호.';

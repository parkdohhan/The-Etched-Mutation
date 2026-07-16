-- 이본 지층 W2-1 (2026-07-16): 지형 스냅샷 Storage 버킷.
-- 정본: docs/이본지층/이본지층_설계_v1-260716.md §5, §4 스냅샷 로깅.
--
-- terrain_snapshots = 매 봉인의 높이맵 전체를 {memoryId}/{generation}.json 으로 보관.
--   본격 위상 분석(지문·표류 곡선·족보)은 10월 오프라인 — 여기선 연구 자료 적재만.
--   비공개: 서비스 롤 쓰기 전용(record-erosion 이 RLS 우회), 읽기는 authenticated.
--   판례: 20260516000000_scene_sounds_bucket.sql (그건 공개, 이건 비공개).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'terrain_snapshots',
  'terrain_snapshots',
  false,                          -- 비공개: 익명 읽기 불가
  10485760,                       -- 10MB 상한 (스냅샷 목표 <150KB, 넉넉)
  array['application/json']
)
on conflict (id) do update set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 읽기: authenticated 만. 쓰기 정책 없음 = Edge service_role 만 업로드(RLS 우회).
drop policy if exists "terrain_snapshots authenticated read" on storage.objects;
create policy "terrain_snapshots authenticated read"
on storage.objects for select
to authenticated
using (bucket_id = 'terrain_snapshots');

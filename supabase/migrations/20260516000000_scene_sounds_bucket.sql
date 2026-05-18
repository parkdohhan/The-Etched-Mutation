-- Scene Sound Storage Bucket
-- admin 음향 생성(generate-scene-sound Edge Function)이 만든 씬별 ambient mp3 보관.
-- Edge Function 이 service_role 키로 업로드, 익명 사용자는 읽기만 (공개 버킷).
-- scene-voice 엔진(lumen_audio_space.js)이 이 버킷 public URL 을 직접 fetch.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scene_sounds',
  'scene_sounds',
  true,                           -- 공개: 클라이언트가 URL 로 직접 재생
  10485760,                       -- 10MB 상한 (SFX 한 개 보통 < 1MB)
  array['audio/mpeg', 'audio/mp3']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 익명 사용자는 읽기만 허용. 업로드는 Edge Function 의 service_role 이 RLS 우회.
drop policy if exists "scene_sounds public read" on storage.objects;

create policy "scene_sounds public read"
on storage.objects for select
to public
using (bucket_id = 'scene_sounds');

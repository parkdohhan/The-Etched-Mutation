-- Lumen Voice Narration Storage Bucket
-- 데모 더빙 시퀀스용 mp3 보관 자리. 플레이어 궤적 기반 음성 파일을 보관.
-- 전수 모델: 플레이어마다 새 음성 생성 → 이 버킷에 저장 → URL 반환.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lumen_voice',
  'lumen_voice',
  true,                           -- 공개 버킷: 클라이언트가 직접 audio src에서 재생 가능해야 함
  10485760,                       -- 10MB 상한 (한 음성 보통 < 1MB)
  array['audio/mpeg', 'audio/mp3']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Edge Function이 service_role 키로 업로드. 익명 사용자는 읽기만.
drop policy if exists "lumen_voice public read" on storage.objects;

create policy "lumen_voice public read"
on storage.objects for select
to public
using (bucket_id = 'lumen_voice');

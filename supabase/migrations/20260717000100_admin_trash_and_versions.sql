-- admin 상용화 W3 (feat(ADM3)) — 휴지통(soft-delete) + 판본 이력
-- 핸드아웃 docs/핸드아웃_ADM_상용화_1-3차-260717.md §W3-I.
-- 파일명은 저장소 14자리 타임스탬프 관례에 맞춤(핸드아웃의 202607170001 은 정렬 안전 위해 정규화).
-- 원격 적용: project bxmppaxpzbkwebfbgpsm (The Etched Mutation), 2026-07-17.

ALTER TABLE memories ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE IF NOT EXISTS admin_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,          -- {memory, scenes[], choices[]}
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_versions_auth_all ON admin_versions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

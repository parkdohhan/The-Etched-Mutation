-- R3-1 (F1 안전벨트): 씬 삭제가 관객 기록·공명 브릿지를 끌고 죽는 CASCADE 해체.
-- 적용: 2026-07-14 (apply_migration `fk_no_cascade_on_scene_delete`)
--
-- 배경: admin 편집화면 [저장] = repo.js saveMemoryGraph 의 DELETE+INSERT 사이클.
-- 씬 행이 지워지는 순간 plays_scene_id_fkey(CASCADE)가 그 기억의 관객 플레이 기록을
-- 통째로 끌고 삭제했다. "플레이 기록 6개월 증발"의 진범 (docs/점검/PhaseB_마스터취합-260714.md §0-2).
--
-- 수리: 씬이 사라져도 기록 자체는 살아남고 씬 연결만 끊긴다 (SET NULL).
--   - plays.scene_id            : CASCADE → SET NULL  (이미 nullable, null 34행 존재)
--   - trajectory_bridges.scene_id: CASCADE → SET NULL  (NOT NULL 해제 선행. 당시 0행)
--   - choices.scene_id          : CASCADE 유지 — 선택지는 씬의 부속물이라 함께 죽는 게 맞다.
--   - utterances.scene_id       : 이미 SET NULL (변경 없음)
--
-- 주의: 이건 안전벨트지 근본 수리가 아니다. 근본 수리는 R1 의 saveMemoryGraph id 보존 upsert.

ALTER TABLE public.plays DROP CONSTRAINT IF EXISTS plays_scene_id_fkey;
ALTER TABLE public.plays
  ADD CONSTRAINT plays_scene_id_fkey
  FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE SET NULL;

ALTER TABLE public.trajectory_bridges ALTER COLUMN scene_id DROP NOT NULL;
ALTER TABLE public.trajectory_bridges DROP CONSTRAINT IF EXISTS trajectory_bridges_scene_id_fkey;
ALTER TABLE public.trajectory_bridges
  ADD CONSTRAINT trajectory_bridges_scene_id_fkey
  FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.plays.scene_id IS
  '씬 삭제 시 SET NULL (2026-07-14 R3-1). 관객 기록은 씬보다 오래 산다.';
COMMENT ON COLUMN public.trajectory_bridges.scene_id IS
  '씬 삭제 시 SET NULL (2026-07-14 R3-1). 공명 브릿지 본문은 씬 소멸 후에도 보존.';

NOTIFY pgrst, 'reload schema';

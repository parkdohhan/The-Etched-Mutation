-- 작가 궤적 시딩(W3-P) 재실행 교체 수리: author-seed 행 전용 DELETE 정책
-- 적용: 2026-07-30 (apply_migration `plays_author_seed_delete_policy`)
--
-- 문제: admin [작가 궤적 시딩] 재실행 경로(admin.js seedAuthorTrajectory)는
--   "기존 author-seed 삭제 → 재삽입"인데, plays 에 DELETE 정책이 없어 삭제가
--   침묵 차단(200, 0행)되고 그 위에 재삽입 → author-seed 중복 축적.
--   (7-18 파이프라인 감사 R3-N1 재확인 항목과 같은 뿌리 — 당시엔 시딩 재실행
--   경로가 여기 걸린다는 게 안 짚였음.)
--
-- 20260714000100 의 "DELETE 정책 추가 금지" 경고에 대해:
--   그 경고의 전제(저장이 관객 plays 를 지우는 파괴 경로 F1)는 Phase D 로 봉합·실증됨
--   (admin_사용설명서 §0.3, 파이프라인 감사 7-18). 그리고 이 정책은 행 범위를
--   persona_id='author-seed' 로 좁혀서, 레거시 광역 삭제 경로(repo.js deleteMemoryGraph,
--   admin.js nukeThenReseed)가 살아 있어도 실관객(persona_id IS NULL)·페르소나 논문
--   표본(persona_id=그 외)은 여전히 삭제 불가 — 우연한 안전망이 의도된 안전망으로 격상.
--
-- 검증 (2026-07-30, 감사 고아 4행 대상 anon 롤 실측):
--   anon DELETE persona_id='author-seed' → 2행 삭제 (허용 확인)
--   anon DELETE 그 외(실관객 1·wave 1) → 0행 (차단 유지 확인)
CREATE POLICY "plays_delete_author_seed" ON public.plays
  FOR DELETE TO anon, authenticated
  USING (persona_id = 'author-seed');

NOTIFY pgrst, 'reload schema';

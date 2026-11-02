// js/shared/tem_record_visibility.js — RECORD v4 §6-① 씨앗 공개 규칙 (2026-09-09)
//
// v4 로 기록된 기억(meta.record_v4)은 status='Fetus' 인 동안 "씨앗"이다. 작가가 admin 에서
// 무대를 설치(상태를 Fetus 밖으로 바꿈)하기 전까지는 기록한 사람에게만 보인다.
//   - 기록한 사람 = 같은 브라우저(localStorage tem_first_play:<id> 표식) 또는 curator_id 본인.
//   - 옛 기억(대표 기억 포함, meta.record_v4 없음)은 status 가 Fetus 여도 이 규칙에 걸리지 않는다.
// 소비처: play-test.html 서가(loadMemories), js/app/archive.js 기억 풀(loadMemoriesFromSupabase).
// 직접 주소(?memory=<id>)는 막지 않는다 — 기록 직후 무대 진입 경로.

export function isRecordSeedHidden(m, opts = {}) {
  if (!m || !m.meta || !m.meta.record_v4) return false;
  if (m.status !== 'Fetus') return false;
  if (opts.isAdmin) return false;
  if (opts.userId && m.curator_id && m.curator_id === opts.userId) return false;
  try { if (typeof localStorage !== 'undefined' && localStorage.getItem('tem_first_play:' + m.id)) return false; } catch (_) {}
  return true;
}

export function filterVisibleMemories(list, opts) {
  return (list || []).filter((m) => !isRecordSeedHidden(m, opts));
}

if (typeof window !== 'undefined') {
  window.TemRecordVisibility = { isRecordSeedHidden, filterVisibleMemories };
}

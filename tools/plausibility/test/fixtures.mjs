// tools/plausibility/test/fixtures.mjs — 가짜 자료 생성기 (실데이터 접촉 없이 코드만 검증)
import { mulberry32 } from '../lib/vec.mjs';

const AXES = ['anger', 'confusion', 'emptiness', 'fear', 'guilt', 'isolation', 'joy', 'longing', 'numbness', 'sadness', 'shame'];

export function makeRaw({ nScenes = 13, nRuns = 20, seed = 7, withJournals = true } = {}) {
  const rng = mulberry32(seed);
  const vec = () => { const v = {}; for (const a of AXES) if (rng() < 0.45) v[a] = Math.round(rng() * 100) / 100; if (!Object.keys(v).length) v.sadness = 0.5; return v; };
  const scenes = [];
  for (let i = 0; i < nScenes; i++) {
    scenes.push({ id: `scene-${String(i + 1).padStart(2, '0')}-aaaa-bbbb`, scene_order: i + 1, original_emotion: vec(), anchor_emotions: null, original_reason: null,
      void_info: i === 9 ? { sceneVoid: true, voidLevel: 'high' } : null, exclusions: null, scene_role: null, echo_words: [] });
  }
  const plays = [], journals = [];
  let t = Date.parse('2026-07-30T10:00:00Z');
  for (let r = 0; r < nRuns; r++) {
    const runId = `run-${String(r + 1).padStart(3, '0')}`;
    const len = r % 7 === 0 ? 1 : 3 + Math.floor(rng() * 5);
    const order = scenes.map((s) => s.id); // 무작위 경로, 되돌아감 없음
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const path = order.slice(0, len);
    const traces = [];
    path.forEach((sid, k) => {
      t += 60000 * (1 + Math.floor(rng() * 5));
      plays.push({ run_id: runId, scene_id: sid, created_at: new Date(t + r * 86400000).toISOString(), user_emotion: vec(), alignment: rng(), mismatch_type: null, user_id: r % 3 === 0 ? 'user-x' : null, n_turns: 2, is_void: rng() < 0.08 });
      traces.push({ order: k + 1, scene_id: sid, pattern: ['bridge', 'echo_follow', 'contradiction'][Math.floor(rng() * 3)], bucket: 'MID', alignment: 0.4 });
    });
    if (withJournals && r % 2 === 0) journals.push({ run_id: runId, run_traces: { visit_order: path, scenes: traces } });
  }
  return { pulled_at: new Date().toISOString(), memory_id: 'fake', data_cutoff: '2026-11-07T00:00:00Z', scenes, plays, journals, counts: { scenes: scenes.length, plays: plays.length, runs: nRuns } };
}

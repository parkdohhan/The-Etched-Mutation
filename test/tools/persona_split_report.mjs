// test/tools/persona_split_report.mjs
// 기억별 분리 집계 — 발자국은 자 A ≡ 자 B (씬 anchor 없음 → 축 동일, 분류결과 재사용)
// 이므로 합산 집계는 A/B 차이를 희석한다. 진짜 대조는 UNDW-001 에서만 성립.
// 결과-{A,B,C}.json 만 읽는 순수 계산.

import fs from 'node:fs';
import path from 'node:path';

const EXP = path.join(path.resolve(import.meta.dirname, '..', '..'), 'docs', '실험', '페르소나_리트머스-260728');
const load = (f) => JSON.parse(fs.readFileSync(path.join(EXP, f), 'utf8'));
const R = { A: load('결과-A.json'), B: load('결과-B.json'), C: load('결과-C.json') };
const ARCH = ['echo_follow', 'bridge', 'contradiction', 'displacement', 'avoidance', 'fixation'];
const MEMS = ['footprints', 'UNDW-001'];

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const counts = (xs) => xs.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {});
const sess = (r, a, m) => R[r].sessions.find((s) => s.archetype === a && s.memory_code === m);

const out = { by_memory: {}, identity_check: {}, pattern_counts: {} };

for (const m of MEMS) {
  console.log(`\n===== 기억: ${m} =====`);
  console.log('아키타입'.padEnd(14), 'A'.padEnd(8), 'B'.padEnd(8), 'C');
  out.by_memory[m] = {};
  for (const a of ARCH) {
    const row = {};
    for (const r of ['A', 'B', 'C']) {
      const st = sess(r, a, m).steps.map((x) => x.alignment);
      row[r] = { median: +median(st).toFixed(4), steps: st, patterns: counts(sess(r, a, m).steps.map((x) => x.pattern)), buckets: counts(sess(r, a, m).steps.map((x) => x.bucket)) };
    }
    out.by_memory[m][a] = row;
    console.log(a.padEnd(14), row.A.median.toFixed(3).padEnd(8), row.B.median.toFixed(3).padEnd(8), row.C.median.toFixed(3));
  }
  console.log('-- 패턴 (A → B) --');
  for (const a of ARCH) {
    console.log(a.padEnd(14), JSON.stringify(out.by_memory[m][a].A.patterns).padEnd(58), '→', JSON.stringify(out.by_memory[m][a].B.patterns));
  }
}

// 축퇴 검증: 발자국에서 A 와 B 스텝이 완전 동일해야 한다
let identical = true;
for (const a of ARCH) {
  const sa = JSON.stringify(sess('A', a, 'footprints').steps);
  const sb = JSON.stringify(sess('B', a, 'footprints').steps);
  if (sa !== sb) { identical = false; console.log(`  축퇴 불일치: ${a}`); }
}
out.identity_check.footprints_A_equals_B = identical;
console.log(`\n[축퇴 검증] 발자국에서 자 A 결과 ≡ 자 B 결과: ${identical ? '동일 (대조 불가 확정)' : '불일치'}`);

// UNDW 만으로 리트머스 재판정
const medU = (r, a) => median(sess(r, a, 'UNDW-001').steps.map((x) => x.alignment));
const patU = (r, a) => counts(sess(r, a, 'UNDW-001').steps.map((x) => x.pattern));
const undw = {
  L1_B_대립_ge_공명: medU('B', 'contradiction') >= medU('B', 'echo_follow'),
  L1_측정: `대립 ${medU('B', 'contradiction').toFixed(3)} vs 공명 ${medU('B', 'echo_follow').toFixed(3)}`,
  L2_B_대립자_contradiction_0: !(patU('B', 'contradiction').contradiction > 0),
  L2_측정: `B 대립자 패턴 ${JSON.stringify(patU('B', 'contradiction'))}`,
  L3_A_대립_lt_공명: medU('A', 'contradiction') < medU('A', 'echo_follow'),
  L3_측정: `A 대립 ${medU('A', 'contradiction').toFixed(3)} vs A 공명 ${medU('A', 'echo_follow').toFixed(3)}`,
  L3_보조_A_대립자_contradiction수: patU('A', 'contradiction').contradiction || 0,
  L5_측정: `공명 A ${medU('A', 'echo_follow').toFixed(3)} → B ${medU('B', 'echo_follow').toFixed(3)}`,
};
out.undw_only_litmus = undw;
console.log('\n===== UNDW-001 단독 리트머스 (진짜 A/B 대조) =====');
for (const [k, v] of Object.entries(undw)) console.log(` ${k}: ${v}`);

// 실전 배선(판단=씬 anchor 우선) 부록 비교 — UNDW 만
console.log('\n===== 부록: 판단축까지 실전 배선(씬 anchor 우선)일 때 — UNDW-001 =====');
console.log('아키타입'.padEnd(14), 'A'.padEnd(8), 'B'.padEnd(8), 'C');
out.real_wiring_UNDW = {};
for (const a of ARCH) {
  const row = {};
  for (const r of ['A', 'B', 'C']) {
    const s = R[r].sessions_real_wiring.find((x) => x.archetype === a && x.memory_code === 'UNDW-001');
    row[r] = { median: +median(s.steps.map((x) => x.alignment)).toFixed(4), patterns: counts(s.steps.map((x) => x.pattern)) };
  }
  out.real_wiring_UNDW[a] = row;
  console.log(a.padEnd(14), row.A.median.toFixed(3).padEnd(8), row.B.median.toFixed(3).padEnd(8), row.C.median.toFixed(3));
}
console.log('-- 패턴 (실전배선 A) --');
for (const a of ARCH) console.log(a.padEnd(14), JSON.stringify(out.real_wiring_UNDW[a].A.patterns));

fs.writeFileSync(path.join(EXP, '기억별집계.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('\n저장: 기억별집계.json');

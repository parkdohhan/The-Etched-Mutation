// test/tools/stem_derive_refine.mjs
// 절단점 도출 2차 규칙 — 촉발력 = Δ(이음매) × 누적요동(그 앞까지의 Δ 합)
//
// 근거: 촉발 3조건 (결핍·하전·정체성). 순수 argmax Δ 는 하전을 무시해
// 몸통이 쌓이기 전(첫 이음매)에서 찢는 오류 (프로브 실측: footprints 0·1·4, UNDW 8·11).
// 하전(j) = Σ_{i<j} Δ_i (그 지점까지 몸통이 흔들린 총량). j=0 이면 하전 0 → 절단 불가
// (era 가 아직 열리지도 않은 곳) — 이론적으로 옳은 배제.
// 소문 공식 R ≈ i × a 와 동형: 전파력 = 중요도(하전) × 모호성(결핍).
//
// 입력: 절단프로브.json (동결 — 재호출 없음). 순수 계산.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const EXP_DIR = path.join(ROOT, 'docs', '실험', '이어받기_리트머스-260730');
const probe = JSON.parse(fs.readFileSync(path.join(EXP_DIR, '절단프로브.json'), 'utf8'));

const out = [];
for (const r of probe.rows) {
  const d = r.deltas.map((x) => (x == null ? 0 : x));
  let best = null;
  const scores = d.map((delta, j) => {
    const charge = d.slice(0, j).reduce((s, x) => s + x, 0);
    return +(delta * charge).toFixed(4);
  });
  scores.forEach((sc, j) => { if (best == null || sc > scores[best]) best = j; });
  out.push({
    key: r.key,
    scores,
    refined_joint: best,
    refined_stem_end: r.sentences[best],
    withheld: r.sentences[best + 1] || null,
    naive_joint: r.derived_joint,
    hand_joint: r.hand_joint,
    refined_vs_hand: best === r.hand_joint,
    refined_vs_naive: best === r.derived_joint,
  });
}

const agreeHand = out.filter((x) => x.refined_vs_hand).length;
const agreeNaive = out.filter((x) => x.refined_vs_naive).length;
fs.writeFileSync(path.join(EXP_DIR, '절단프로브_2차규칙.json'), JSON.stringify({
  meta: {
    created: '260730',
    rule: '촉발력(j) = Δ(j) × Σ_{i<j} Δ(i) — 결핍 × 하전. argmax 가 절단점.',
    agree_hand: agreeHand, agree_naive: agreeNaive, total: out.length,
  },
  rows: out,
}, null, 1), 'utf8');

console.log(`2차 규칙(촉발력) — 손 절단 일치 ${agreeHand}/18, 1차(순수 Δ) 일치 ${agreeNaive}/18\n`);
for (const x of out) {
  console.log(`${x.key} refined=${x.refined_joint} (naive=${x.naive_joint}, hand=${x.hand_joint})`);
  console.log(`  지문 끝: "${(x.refined_stem_end || '').slice(0, 34)}" → 감춰지는 도약: "${(x.withheld || '').slice(0, 34)}"`);
}

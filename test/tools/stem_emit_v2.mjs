// test/tools/stem_emit_v2.mjs
// 지문 v2 기계 생성 — 절단점 도출 v1 (촉발력 규칙, 2026-07-30 동결) 적용.
// 손 편집 0: 원문 문장 0..refined_joint 를 그대로 잇고, 말미 종결부호를 "…"로 치환.
// 입력: 절단프로브.json + 절단프로브_2차규칙.json (동결본). 순수 계산.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const EXP_DIR = path.join(ROOT, 'docs', '실험', '이어받기_리트머스-260730');
const probe = JSON.parse(fs.readFileSync(path.join(EXP_DIR, '절단프로브.json'), 'utf8'));
const refine = JSON.parse(fs.readFileSync(path.join(EXP_DIR, '절단프로브_2차규칙.json'), 'utf8'));

const byKey = new Map(probe.rows.map((r) => [r.key, r]));
const stems = [];
for (const r of refine.rows) {
  const p = byKey.get(r.key);
  const [code, orderStr] = r.key.split('#');
  const kept = p.sentences.slice(0, r.refined_joint + 1);
  let text = kept.join(' ');
  text = text.replace(/[.!?…]+["”']?\s*$/, '') + '…';
  stems.push({
    memory_code: code,
    scene_order: Number(orderStr),
    rule: 'trigger-power-v1',
    refined_joint: r.refined_joint,
    withheld: r.withheld,
    text,
  });
}
stems.sort((a, b) => a.memory_code.localeCompare(b.memory_code) || a.scene_order - b.scene_order);

fs.writeFileSync(path.join(EXP_DIR, '지문-v2.json'), JSON.stringify({
  meta: {
    created: '260730',
    rule: '절단점 도출 v1 — 촉발력(j)=Δ(j)×Σ_{i<j}Δ(i), argmax. 손 편집 0 (기계 생성).',
    source: '절단프로브.json + 절단프로브_2차규칙.json (동결본)',
    author_veto: '미행사 — 작가 거부권 대기 (기각 시 차순위 이음매)',
  },
  stems,
}, null, 1), 'utf8');
console.log(`지문-v2.json 저장 — ${stems.length}개`);
for (const s of stems) console.log(`${s.memory_code}#${s.scene_order}: "${s.text.slice(0, 44)}" [감춤: "${(s.withheld || '').slice(0, 24)}"]`);

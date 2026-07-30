// test/tools/stem_cuts_emit_asset.mjs
// 이어받기 형식 런타임 자산 생성 — 지문-v2.json → js/shared/tem_stem_cuts.js
// scene_id 키로 매핑 (씬스냅샷.json 조인). 손 편집 0 — 이 스크립트 재실행이 곧 갱신 경로.
// 작가 거부권 행사 시: 지문-v2.json 을 차순위 이음매로 재생성(stem_emit_v2.mjs) 후 본 스크립트 재실행.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', '실험', '페르소나_리트머스-260728', '씬스냅샷.json'), 'utf8'));
const stems = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', '실험', '이어받기_리트머스-260730', '지문-v2.json'), 'utf8'));

const idByKey = new Map(snap.scenes.map((s) => [`${s.code}#${s.scene_order}`, s.scene_id]));
const out = {};
for (const st of stems.stems) {
  const id = idByKey.get(`${st.memory_code}#${st.scene_order}`);
  if (!id) { console.warn(`scene_id 없음: ${st.memory_code}#${st.scene_order} — 스킵`); continue; }
  out[id] = { text: st.text, rule: st.rule, joint: st.refined_joint };
}

const banner = `// GENERATED — test/tools/stem_cuts_emit_asset.mjs (수정 금지, 재생성으로 갱신)
// 이어받기 형식(cont_v1) 지문 — 절단점 도출 v1 (촉발력 규칙, 절단점도출-260730.md)
// 키 = scenes.id. 지문 없는 씬은 자유 대화로 폴백 (lumen_dialog_phase1 가드).
// 작가 거부권: 지문-v2.json 재생성 → 본 자산 재생성. 생성일 260730.
`;
fs.writeFileSync(
  path.join(ROOT, 'js', 'shared', 'tem_stem_cuts.js'),
  banner + 'window.TemStemCuts = ' + JSON.stringify(out, null, 1) + ';\n',
  'utf8'
);
console.log(`js/shared/tem_stem_cuts.js 생성 — 씬 ${Object.keys(out).length}개`);

// test/tools/stem_mirror_en-260810.mjs
// UNDW-001-EN 지문 재굽기 — 260810 EN 본문 최신화(현행 KO 미러) 반영.
//
// 방식 = 260805 EN 최초 추가와 동일: 절단점은 한국어판 joint 를 그대로 미러 (LLM 0회).
//   KO joint 는 stem_refresh_undw-260810.mjs 가 촉발력 규칙으로 재도출한 값 (동일 scene_order).
//   EN 번역은 KO 와 문장 수를 일치시켜 작성했으므로 joint 가 1:1 로 옮겨진다.
// 자산은 항목 단위 문자열 수술 — 260805 EN 주석 블록·타 기억 항목 바이트 보존.
// 실행: node test/tools/stem_mirror_en-260810.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const ASSET = path.join(ROOT, 'js', 'shared', 'tem_stem_cuts.js');

// stem_derive_probe.mjs 와 동일한 문장 분할·지문 조립 (동결 규칙 복사)
function splitSentences(text) {
  const m = text.match(/[^.!?…]+[.!?…]+(?:["”']+)?/g);
  return (m || [text]).map((s) => s.trim()).filter(Boolean);
}
function buildStemText(sentences, joint) {
  let text = sentences.slice(0, joint + 1).join(' ');
  return text.replace(/[.!?…]+["”']?\s*$/, '') + '…';
}

// scene_order → { EN scene id, 현행 EN 본문(260810 DB 반영본), KO joint(260810 재도출) }
const ROWS = [
  { ord: 1, id: '7a1d4e92-3b6f-4c8a-9d2e-5f7b1c3a8e41', joint: 3,
    text: 'The offering failed. It lies sunk in the bathtub. The face half-submerged, only an outline shimmering. I turn my head away. Because I hate the shimmering.' },
  { ord: 2, id: '2c9f7b34-8e1a-4f6d-b3c8-7a2e9d5f1b62', joint: 3,
    text: 'I set out, cutting through the blizzard. A faded blue roof. The door is shut. I knock on the iron gate. Is anyone there?' },
  { ord: 3, id: '8d3a1f56-2c7e-4b9a-8e4f-3d6b2a9c7e83', joint: 0,
    text: 'In the rented room, the phone rings. Ringing, cut off, ringing.' },
  { ord: 4, id: '5e7c2d18-9f3b-4a6e-9c1d-8b4f7e2a3d94', joint: 1,
    text: 'A child clings to the woman’s waist. The small arms wrap around her, practiced and natural. Have I ever done that to Mom.' },
  { ord: 5, id: '1f4b8e63-7a2d-4e9c-a5b7-2c8d4f9e6a15', joint: 4,
    text: 'The Jindo dog was dead. I loosened the frozen leash. The paw pads were still warm. "What did you do." In that instant I ran. Having become the one who killed the dog. Though I didn’t kill it.' },
  { ord: 6, id: '9b2e5c47-4d8f-4c3a-b7e9-6a1c3d8f5b26', joint: 1,
    text: 'For the first time, I look at the offering’s face. Swollen and warped by the water, but the cheekbones were the same. The cheekbones I have in my own face.' },
  { ord: 7, id: '4a8d3f92-6b1e-4d7c-8a2f-9e5b7c4d1a37', joint: 4,
    text: 'I knew from the beginning. I just didn’t look. The calls had come to me. A month. For a whole month. I didn’t answer.' },
  { ord: 8, id: '6c1a9e25-3f7d-4b8e-9d6a-4b2f8c5e7d48', joint: 0,
    text: 'On days Mom didn’t come home, I went through her drawer. Holding it under the covers, I could imagine her somewhere, wearing the same panties.' },
  { ord: 9, id: '3e6f4b81-5c9a-4e2d-a8c4-7d3b9f6e2c59', joint: 0,
    text: 'As long as I am wearing this, I will not move; if I do not move, I will not go bad; if I do not go bad, Mom will come back. Mom did not come back.' },
  { ord: 11, id: '2a5e7d93-4c8b-4f1e-9b3d-6e8a4c2f9d71', joint: 0,
    text: 'So she’s dead. I wasn’t certain, but I decided to firmly believe that Mom was dead.' },
  { ord: 12, id: '8f4b2c67-1d9e-4c6a-a7f2-3b5d8e9c4a82', joint: 1,
    text: 'The panties on the drying rack have faded to brown. Blood, once soaked in, never fully washes out. It only pales, staying between the fibers.' },
  { ord: 13, id: '5b9d6e32-7f2a-4d4c-8c5e-1a7f3b6d9e93', joint: 4,
    text: 'I stared at the screen, then set it down. Neither connecting nor refusing. A month. For a whole month. Me too — the phone. There was a time I didn’t answer.' },
];
// 주의: DB 본문은 위 표와 동일해야 한다 (260810 UPDATE 와 같은 문자열).
//   아포스트로피는 DB에 ' (U+0027) 로 저장돼 있으므로 ’ 표기는 시각 표기일 뿐 — 아래에서 통일한다.

let src = fs.readFileSync(ASSET, 'utf8');
let replaced = 0;
for (const r of ROWS) {
  const plain = r.text.replace(/’/g, "'").replace(/—/g, '—');
  const sentences = splitSentences(plain);
  if (r.joint >= sentences.length) { console.warn(`#${r.ord}: joint ${r.joint} >= 문장 ${sentences.length} — 스킵`); continue; }
  const stem = buildStemText(sentences, r.joint);
  const entry = ' "' + r.id + '": {\n'
    + '  "text": ' + JSON.stringify(stem) + ',\n'
    + '  "rule": "trigger-power-v1",\n'
    + '  "joint": ' + r.joint + '\n'
    + ' }';
  const re = new RegExp(' "' + r.id + '": \\{[\\s\\S]*?\\n \\}');
  if (!re.test(src)) { console.warn(`#${r.ord}: 자산에 항목 없음 — 스킵`); continue; }
  src = src.replace(re, entry);
  replaced += 1;
  console.log(`#${r.ord} joint ${r.joint}: "${stem.slice(0, 60)}"`);
}
if (!src.includes('260810 EN 미러')) {
  src = src.replace(
    '// ─── 260805 수동 추가: UNDW-001-EN (영어 초벌 사본) 지문 — 절단점은 한국어판 joint 미러.',
    '// ─── 260805 수동 추가: UNDW-001-EN (영어 초벌 사본) 지문 — 절단점은 한국어판 joint 미러.\n'
    + ' // 260810 EN 미러 갱신 — stem_mirror_en-260810.mjs: EN 본문 최신화(현행 KO) 반영, joint = KO 재도출값.'
  );
}
fs.writeFileSync(ASSET, src, 'utf8');
console.log(`EN 지문 교체 ${replaced}/12`);

// tools/remain_judge_probe.mjs — how are a walker's lines read, and which would remain? (2026-11-28, branch space-remain)
//
// The "words that remain" preview (docs/우주무대_남는말_실험-261128.md) keeps at most one line for each of the three blanks:
// the line that is about the same matter the walker wrote of themselves. That reading is a model's (remain-turn "judge").
// This probe runs the same server call the stage runs, for made-up blanks and lines — TWICE, to see whether the reading
// holds still — and then applies the stage's own rule (js/spaceremain/remain.js). Run it BEFORE trusting new blank
// sentences: if nothing ever turns back on a blank, that blank is decoration. Nothing is written anywhere.
//
// usage: node tools/remain_judge_probe.mjs --memory UNDW-001 --walk path/to/walk.json
//   walk.json = { "answers": ["…", "…", "…"], "lines": [[scene_order, "what was said"], …] }
import fs from 'node:fs';
import { blanksFor, HOLE, remaining } from '../js/spaceremain/remain.js';

const URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
const KEY = fs.readFileSync(new globalThis.URL('../js/lib/config.js', import.meta.url), 'utf8').match(/VITE_SUPABASE_ANON_KEY \|\| '([^']+)'/)[1];
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const get = async (path) => { const r = await fetch(URL + '/rest/v1/' + path, { headers: H }); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); };

const code = arg('memory', 'UNDW-001');
const walk = JSON.parse(fs.readFileSync(arg('walk'), 'utf8'));
const [memory] = await get('memories?select=id,code,title&code=eq.' + encodeURIComponent(code));
if (!memory) throw new Error('no memory ' + code);
const scenes = await get('scenes?select=scene_order,text&memory_id=eq.' + memory.id + '&order=scene_order');
const textOf = new Map(scenes.map((s) => [s.scene_order, s.text]));
const blanks = blanksFor(code, 'ko').map((l, i) => l.replace(HOLE, walk.answers[i] || ''));
const items = walk.lines.map(([order, line], i) => ({ id: String(i), scene: textOf.get(order) || '', line }));

async function judge() {
  const t = Date.now();
  const r = await fetch(URL + '/functions/v1/remain-turn', { method: 'POST', headers: H, body: JSON.stringify({ mode: 'judge', blanks, items }) });
  const j = await r.json();
  if (!j.ok) throw new Error('judge: ' + JSON.stringify(j));
  return { by: new Map(j.items.map((x) => [x.id, x])), s: ((Date.now() - t) / 1000).toFixed(1) };
}
const [a, b] = [await judge(), await judge()];

console.log(`\n${memory.title} (${code}) — ${items.length} lines, read twice (${a.s}s, ${b.s}s)\n`);
blanks.forEach((x, i) => console.log(`  blank ${i}: ${x}`));
console.log('\n  scene  whom       back   2nd reading        line');
let same = 0;
const lines = walk.lines.map(([order, raw], i) => {
  const x = a.by.get(String(i)) || { whom: '?', back: -1 }, y = b.by.get(String(i)) || { whom: '?', back: -1 };
  const eq = x.whom === y.whom && x.back === y.back; if (eq) same++;
  console.log(`  ${String(order).padStart(5)}  ${x.whom.padEnd(9)}  ${String(x.back).padStart(4)}   ${eq ? 'same' : (y.whom + ' / ' + y.back).padEnd(16)}   ${raw}`);
  return { order, raw, whom: x.whom, back: x.back, emo: null };
});
console.log(`\n  read the same both times: ${same} of ${items.length}`);
const tally = (k) => lines.reduce((m, l) => (m[l[k]] = (m[l[k]] || 0) + 1, m), {});
console.log('  whom:', JSON.stringify(tally('whom')), '  back:', JSON.stringify(tally('back')));
const keep = remaining(lines, { blanks: blanks.map(() => ({ emo: null })) });
console.log(`\n  would remain (${keep.size}):`);
for (const i of Array.from(keep).sort((p, q) => p - q)) console.log(`    scene ${lines[i].order} · blank ${lines[i].back} · ${lines[i].whom} · ${lines[i].raw}`);
console.log('');

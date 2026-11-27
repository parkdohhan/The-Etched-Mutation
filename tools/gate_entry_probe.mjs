// tools/gate_entry_probe.mjs — where does the gate send people? (2026-11-28)
//
// The gate (docs/아카이브_기억칸_질문_결정-261128.md): what a walker writes in the empty place of a memory's one
// sentence is read as an emotion, and the first scene is the entry candidate nearest to it. If every answer lands on
// the same scene the gate is decoration — this probe is the check for that, run BEFORE trusting a gate line.
//
// It does what js/spaceblank/main.js pickEntry does, with the same server call (claude-scene emotion_analysis) and the
// same measure (cosine on the memory's own axes), for a list of made-up answers. Nothing is written anywhere.
//
// usage: node tools/gate_entry_probe.mjs --memory UNDW-001 --answers path/to/answers.json [--line "… ___ …"]
//   answers.json = ["…", "…"]   ·   --line overrides memories.meta.gate.line
import fs from 'node:fs';

const URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
const KEY = fs.readFileSync(new globalThis.URL('../js/lib/config.js', import.meta.url), 'utf8').match(/VITE_SUPABASE_ANON_KEY \|\| '([^']+)'/)[1];
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const get = async (path) => { const r = await fetch(URL + '/rest/v1/' + path, { headers: H }); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); };

const code = arg('memory', 'UNDW-001');
const answers = JSON.parse(fs.readFileSync(arg('answers'), 'utf8'));
const [memory] = await get('memories?select=id,code,title,meta&code=eq.' + encodeURIComponent(code));
if (!memory) throw new Error('no memory ' + code);
const scenes = await get('scenes?select=id,scene_order,text,original_emotion,exclusions,void_info&memory_id=eq.' + memory.id + '&order=scene_order');
const line = arg('line', (memory.meta && memory.meta.gate && memory.meta.gate.line) || '');

// = js/roomplay/engine.js memoryAxes / toArr / cos
const emoOf = (s) => (typeof s.original_emotion === 'string' ? JSON.parse(s.original_emotion) : s.original_emotion) || {};
const axes = Array.from(new Set(scenes.flatMap((s) => Object.entries(emoOf(s)).filter(([, v]) => Number(v) > 0).map(([k]) => k)))).sort();
const arr = (o) => axes.map((k) => Number(o[k]) || 0);
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? d / Math.sqrt(na * nb) : 0; };
const silent = (s) => !!(s.void_info && s.void_info.sceneVoid) || /^[…\s.]*$/.test(s.text || '');
const locked = (s, emo) => Array.isArray(s.exclusions) && s.exclusions.length > 0 && !s.exclusions.every((r) => { const c = r && r.condition; if (!c) return false; if (c.type === 'emotion_threshold') return Number(emo[c.emotion] || 0) >= Number(c.min != null ? c.min : 0.6); if (c.type === 'emotion_below') return Number(emo[c.emotion] || 0) < Number(c.max != null ? c.max : 0.5); return false; });

// = spaceblank/main.js firstScene / entryCandidates
const rig = memory.meta && memory.meta.rig && Array.isArray(memory.meta.rig.spine) && memory.meta.rig.spine.length ? memory.meta.rig : null;
const base = (rig && scenes.find((s) => s.scene_order === rig.spine[0])) || scenes[0];
const spine = rig ? new Set(rig.spine) : null, last = scenes[scenes.length - 1];
const candidates = (emo) => { const out = scenes.filter((s) => !silent(s) && !locked(s, emo) && (spine ? !spine.has(s.scene_order) : (scenes.length < 3 || s.id !== last.id))); if (!out.some((s) => s.id === base.id)) out.push(base); return out; };

async function measure(text) {
  const r = await fetch(URL + '/functions/v1/claude-scene', { method: 'POST', headers: H, body: JSON.stringify({ type: 'emotion_analysis', emotion: text, reason: text, anchorEmotions: axes, context: { scene_text: line.replace('___', '[   ]').slice(0, 400), ghost_line: '' } }) });
  if (!r.ok) return null;
  const d = await r.json();
  let b = d && d.analysis && d.analysis.base; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = null; } }
  if (!b || !Object.values(b).some((v) => Number(v) > 0)) return null;
  return { base: b, isVoid: !!(d.reason_analysis && d.reason_analysis.is_void) };
}

console.log(`${code} 「${memory.title}」 · 장면 ${scenes.length} · 축 ${axes.length} · ${rig ? '고정 길 ' + rig.spine.join(',') : '고정 길 없음'} · 원래 첫 장면 ${base.scene_order}`);
console.log('빈칸 문장:', line || '(없음)');
const tally = new Map(); const rows = [];
for (const a of answers) {
  const m = await measure(a);
  let picked = base.scene_order, via = 'default', top = '';
  if (m && m.isVoid) via = 'void';
  else if (m) {
    const ranked = candidates(m.base).map((s) => ({ o: s.scene_order, a: cos(arr(m.base), arr(emoOf(s))) })).sort((x, y) => (y.a - x.a) || (x.o - y.o));
    if (ranked.length && ranked[0].a > 0) { picked = ranked[0].o; via = 'reading'; }
    top = ranked.slice(0, 3).map((r) => r.o + ':' + r.a.toFixed(2)).join(' ');
  }
  tally.set(picked, (tally.get(picked) || 0) + 1);
  const strong = m ? Object.entries(m.base).filter(([, v]) => Number(v) >= 0.3).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => k + ' ' + Number(v).toFixed(1)).join(', ') : '(측정 실패)';
  rows.push({ a, picked, via, top, strong });
  console.log(`  → ${String(picked).padStart(2)}번 [${via}]  ${a}   | ${strong}   | ${top}`);
}
console.log('\n들어간 장면 분포 (' + answers.length + '개 대답):');
for (const [o, n] of Array.from(tally).sort((x, y) => y[1] - x[1])) { const sc = scenes.find((s) => s.scene_order === o); console.log(`  ${String(o).padStart(2)}번  ${'■'.repeat(n)} ${n}   ${String(sc.text).slice(0, 34)}…`); }
const cands = candidates({}).map((s) => s.scene_order).sort((x, y) => x - y);
console.log('첫 장면이 될 수 있는 장면:', cands.join(', '), '· 한 번도 안 뽑힌 장면:', cands.filter((o) => !tally.has(o)).join(', ') || '없음');
if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ code, line, axes, rows, tally: Object.fromEntries(tally) }, null, 1), 'utf8');

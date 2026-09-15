// tools/author_memory_stems.mjs — 임의 기억의 지문(stem) 도출 + tem_stem_cuts.js 굽기 (2026-09-15)
//
// test/tools/stem_refresh_undw-260810.mjs(UNDW-001 전용)를 기억 하나 단위로 일반화한 것.
// 규칙은 동결본 그대로 (절단점 도출 v1 — 촉발력 = Δ(j) × Σ_{i<j}Δ(i), argmax):
//   1) 씬 원문 = text_stage_1 우선(있으면), 없으면 text.  문장 분할(구두점 근사).
//   2) 문장마다 claude-scene emotion_analysis 로 단독 분류 — 기억 축 = 그 기억 씬들의 original_emotion 키 합집합
//      (기억별 좌표계, 260727). UNDW 스크립트는 스냅샷 axes 를 썼지만 새 기억은 스냅샷이 없으므로 DB 에서 만든다.
//   3) 인접 문장 델타 = 1 − cosine → 촉발력 argmax = 절단점(joint). 문장 0..joint 를 잇고 말미를 "…" 로.
//   4) js/shared/tem_stem_cuts.js 에 항목 단위 문자열 수술 — 이 기억 씬 id 항목만 제거 후 재삽입 (EN 블록·주석 불변).
//   문장 2개 미만인 씬(침묵 "…" 등)은 건너뜀 = 자유 대화 폴백.
//
// 사용:
//   node tools/author_memory_stems.mjs --memory-id <uuid> [--dry] [--json out.json] [--source auto|text|stage1]
//   --dry : 분류 호출 없이 씬·문장 수만 출력
//   --json: 도출 결과(거부권 표면)를 JSON 으로도 저장 (원고가 담기므로 공개 폴더에 두지 말 것)
//   --source: 절단 원문. auto(기본) = 기억 cont_depth ≥ 1 이면 text_stage_1 우선(관객이 읽는 판본), 0 이면 text.
//             UNDW 스크립트의 "stage_1 우선"은 depth 68 기억의 규칙이었다 — 갓 저작한 depth 0 기억에 그대로 쓰면
//             유령 지문(stage_1)과 사물 열람 발췌(text)가 어긋난다.
//
// 자산을 고친 뒤에는 play-test.html 의 tem_stem_cuts.js?v= 캐시버스터를 올려야 한다 (수동).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET = path.join(ROOT, 'js', 'shared', 'tem_stem_cuts.js');
const SUPABASE_URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bXBwYXhwemJrd2ViZmJncHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMTcyMTEsImV4cCI6MjA4MDU5MzIxMX0.vv6Bmi2rZdx_HzLcxuw1wxfN_fvQYiigQz11KPNxH2M';
const FN_URL = `${SUPABASE_URL}/functions/v1/claude-scene`;
const CONCURRENCY = 4;
const GAP_MS = 250;

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const memoryId = arg('memory-id', null);
const jsonOut = arg('json', null);
const sourceMode = arg('source', 'auto');   // auto | text | stage1
const dropIds = (arg('drop-ids', '') || '').split(',').map((s) => s.trim()).filter(Boolean); // 삭제된 씬의 옛 항목 제거
const dry = process.argv.includes('--dry');
if (!memoryId) { console.error('usage: --memory-id <uuid> [--dry] [--json out.json]'); process.exit(1); }

// ── 동결 계산부 (stem_refresh_undw-260810.mjs 복사, 규칙 변경 0) ─────────────
function splitSentences(text) {
  const m = text.match(/[^.!?…]+[.!?…]+(?:["”']+)?/g);
  return (m || [text]).map((s) => s.trim()).filter(Boolean);
}
function cosine(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) { const x = Number(a[k]) || 0, y = Number(b[k]) || 0; dot += x * y; na += x * x; nb += y * y; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
async function callOnce(text, axes) {
  const resp = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ type: 'emotion_analysis', emotion: text, reason: text, anchorEmotions: axes, context: null }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  let base = data && data.analysis && data.analysis.base;
  if (typeof base === 'string') { try { base = JSON.parse(base); } catch (_) { base = null; } }
  if (Array.isArray(base)) base = null;
  return base && typeof base === 'object' && Object.keys(base).length ? base : null;
}
async function classify(text, axes) {
  try { const r = await callOnce(text, axes); if (r) return r; } catch (e) { process.stderr.write(`retry: ${e.message}\n`); }
  await new Promise((r) => setTimeout(r, 1200));
  try { const r = await callOnce(text, axes); if (r) return r; } catch (e) { process.stderr.write(`FAIL: ${e.message}\n`); }
  return null;
}
function buildStemText(sentences, joint) {
  let text = sentences.slice(0, joint + 1).join(' ');
  return text.replace(/[.!?…]+["”']?\s*$/, '') + '…';
}

// 자산 문자열 수술 — 이 기억의 씬 id 항목만 제거·삽입. 다른 기억·EN 블록·주석 바이트 보존.
function bakeAsset(stems, sceneIds, memoryLabel) {
  let src = fs.readFileSync(ASSET, 'utf8');
  let removed = 0;
  for (const id of sceneIds.concat(dropIds)) {
    const re = new RegExp(' "' + id + '": \\{[\\s\\S]*?\\n \\},?\\n');
    if (re.test(src)) { src = src.replace(re, ''); removed += 1; }
  }
  // 같은 기억의 옛 머리말(재실행 때 중복 방지) 제거 — 라벨은 "CODE (" 로 시작
  const headRe = new RegExp('^ // ─── ' + memoryLabel.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\(.*\\n', 'gm');
  src = src.replace(headRe, '');
  const openMark = 'window.TemStemCuts = {\n';
  const at = src.indexOf(openMark);
  if (at < 0) throw new Error('자산 여는 괄호를 못 찾음 — 파일 구조 변경?');
  const block = stems.map((st) =>
    ' "' + st.scene_id + '": {\n' +
    '  "text": ' + JSON.stringify(st.text) + ',\n' +
    '  "rule": ' + JSON.stringify(st.rule) + ',\n' +
    '  "joint": ' + st.refined_joint + '\n' +
    ' },\n'
  ).join('');
  const header = ' // ─── ' + memoryLabel + ' 지문 — tools/author_memory_stems.mjs 도출 (' + new Date().toISOString().slice(0, 10) + ')\n';
  src = src.slice(0, at + openMark.length) + header + block + src.slice(at + openMark.length);
  fs.writeFileSync(ASSET, src, 'utf8');
  console.log(`tem_stem_cuts.js 수술 — 제거 ${removed} · 삽입 ${stems.length}`);
}

async function main() {
  const h = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const mResp = await fetch(`${SUPABASE_URL}/rest/v1/memories?id=eq.${memoryId}&select=id,code,title,cont_depth`, { headers: h });
  if (!mResp.ok) throw new Error(`memory fetch HTTP ${mResp.status}`);
  const mem = (await mResp.json())[0];
  if (!mem) throw new Error('기억 없음: ' + memoryId);
  const useStage1 = sourceMode === 'stage1' || (sourceMode === 'auto' && Number(mem.cont_depth) >= 1);
  console.log(`절단 원문 = ${useStage1 ? 'text_stage_1 우선' : 'text'} (source=${sourceMode}, cont_depth=${mem.cont_depth})`);
  const sResp = await fetch(`${SUPABASE_URL}/rest/v1/scenes?memory_id=eq.${memoryId}&select=id,scene_order,text,text_stage_1,original_emotion&order=scene_order`, { headers: h });
  if (!sResp.ok) throw new Error(`scenes fetch HTTP ${sResp.status}`);
  const dbScenes = await sResp.json();

  // 기억별 좌표계 = original_emotion 키 합집합
  const axesSet = new Set();
  dbScenes.forEach((s) => { const e = s.original_emotion || {}; Object.keys(e).forEach((k) => axesSet.add(k)); });
  const axes = Array.from(axesSet);
  console.log(`${mem.code} "${mem.title}" — 씬 ${dbScenes.length}개, 기억 축 ${axes.length}: ${axes.join(', ')}`);

  const scenes = dbScenes.map((s) => {
    const src = (useStage1 && s.text_stage_1 && s.text_stage_1.trim()) ? s.text_stage_1 : (s.text || '');
    return { id: s.id, order: s.scene_order, src, sentences: splitSentences(src) };
  });
  const jobs = [];
  for (const s of scenes) {
    console.log(`  #${s.order} ${s.id.slice(0, 8)}… ${s.sentences.length}문장${s.sentences.length < 2 ? ' (건너뜀 — 자유 대화 폴백)' : ''}`);
    if (s.sentences.length < 2) continue;
    s.sentences.forEach((sent, i) => jobs.push({ s, i, sent }));
  }
  console.log(`분류 호출 ${dry ? 0 : jobs.length}회 (문장 단독, 기억 축 ${axes.length}축)`);
  if (dry) return;

  const vec = new Map();
  let cursor = 0, done = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const j = jobs[cursor++];
      vec.set(`${j.s.id}|${j.i}`, await classify(j.sent, axes));
      await new Promise((r) => setTimeout(r, GAP_MS));
      done += 1;
      if (done % 20 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const stems = [];
  for (const s of scenes) {
    if (s.sentences.length < 2) continue;
    const deltas = [];
    for (let i = 1; i < s.sentences.length; i++) {
      const a = vec.get(`${s.id}|${i - 1}`), b = vec.get(`${s.id}|${i}`);
      deltas.push(a && b ? +(1 - cosine(a, b)).toFixed(3) : null);
    }
    const d = deltas.map((x) => (x == null ? 0 : x));
    let best = null;
    const scores = d.map((delta, j) => { const charge = d.slice(0, j).reduce((sum, x) => sum + x, 0); return +(delta * charge).toFixed(4); });
    scores.forEach((sc, j) => { if (best == null || sc > scores[best]) best = j; });
    stems.push({
      memory_code: mem.code, scene_order: s.order, scene_id: s.id, rule: 'trigger-power-v1',
      refined_joint: best, deltas: d, withheld: s.sentences[best + 1] || null, text: buildStemText(s.sentences, best),
    });
    console.log(`#${s.order}: [${d.map((x, j) => `${j}${j === best ? '★' : ''}:${x}`).join(' ')}]`);
    console.log(`   지문 "${stems[stems.length - 1].text.slice(0, 44)}" | 감춤 "${(s.sentences[best + 1] || '—').slice(0, 24)}"`);
  }

  if (jsonOut) {
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify({ memory: mem, axes, derived_at: new Date().toISOString(), stems }, null, 1), 'utf8');
    console.log('JSON 저장: ' + jsonOut);
  }
  bakeAsset(stems, scenes.map((s) => s.id), mem.code + ' (' + mem.title + ')');
}
main().catch((e) => { console.error(e); process.exit(1); });

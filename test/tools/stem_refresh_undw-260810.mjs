// test/tools/stem_refresh_undw-260810.mjs
// UNDW-001(한국어판) 지문 재도출 — 260810 본문 개고 반영.
//
// 배경: 유령이 건네는 지문(js/shared/tem_stem_cuts.js)은 260730에 그때 씬 텍스트로
//   잘라 구운 정적 자산이라, 작가가 DB 본문·text_stage_1 을 개고해도 상영에 반영되지
//   않았다 (씬 6 실측: DB "나는 처음으로 제물의…" vs 지문 "산 중턱…" — 짝 자체가 어긋남).
//
// 규칙은 동결본 그대로: 절단점 도출 v1 (촉발력 = Δ(j) × Σ_{i<j}Δ(i), argmax) —
//   stem_derive_probe.mjs(문장 분해·분류·델타) + stem_derive_refine.mjs(촉발력) +
//   stem_emit_v2.mjs(지문 조립) 의 계산을 한 글자 규칙 변경 없이 복사.
//
// 범위: UNDW-001 한 기억만. footprints·UNDW-001-EN 지문은 바이트 그대로 보존
//   (LLM 재분류의 비결정성으로 멀쩡한 기억의 절단점이 흔들리는 것을 막는다).
//
// 갱신 대상:
//   1) js/shared/tem_cuts 런타임 자산 — UNDW-001 씬 id 항목만 삭제 후 재삽입
//   2) docs/실험/이어받기_리트머스-260730/지문-v2.json — UNDW-001 항목만 교체 (거부권 표면)
//   씬스냅샷.json(260728 페르소나 실험 입력)은 건드리지 않는다 — 실험 기록 보존.
//
// 절단 원문: text_stage_1 우선(관객이 실제 읽는 판본, depth 68 ≥ 1), 없으면 text.
// 실행: node test/tools/stem_refresh_undw-260810.mjs [--dry] [--asset-only]
//   --asset-only: 분류 재호출 없이 지문-v2.json 의 UNDW-001 항목으로 자산만 다시 굽는다.
//
// 자산 굽기는 통째 JSON.parse 가 아니라 항목 단위 문자열 수술이다 — 260805에 EN 지문이
// JS 주석과 함께 수동 추가되어 파일이 순수 JSON 이 아니고, 주석의 경고("재생성 시 EN
// 블록 백업 후 재부착")를 지키는 가장 확실한 길이 EN 블록을 아예 안 건드리는 것이라서다.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const EXP_DIR = path.join(ROOT, 'docs', '실험', '이어받기_리트머스-260730');
const SNAP = path.join(ROOT, 'docs', '실험', '페르소나_리트머스-260728', '씬스냅샷.json');
const ASSET = path.join(ROOT, 'js', 'shared', 'tem_stem_cuts.js');

const SUPABASE_URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bXBwYXhwemJrd2ViZmJncHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMTcyMTEsImV4cCI6MjA4MDU5MzIxMX0.vv6Bmi2rZdx_HzLcxuw1wxfN_fvQYiigQz11KPNxH2M';
const FN_URL = `${SUPABASE_URL}/functions/v1/claude-scene`;
const MEMORY_ID = '1835926d-5acc-4d43-afd7-273ed853bca4'; // UNDW-001 (팬티만 입은 내여자, KO)
const MEMORY_CODE = 'UNDW-001';
const CONCURRENCY = 4;
const GAP_MS = 250;

// ── 이하 계산부는 동결 도구 복사 (규칙 변경 0) ─────────────────────────────
// stem_derive_probe.mjs — 문장 분할 (구두점 근사)
function splitSentences(text) {
  const m = text.match(/[^.!?…]+[.!?…]+(?:["”']+)?/g);
  return (m || [text]).map((s) => s.trim()).filter(Boolean);
}
// stem_derive_probe.mjs — 코사인
function cosine(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    const x = Number(a[k]) || 0, y = Number(b[k]) || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
// stem_derive_probe.mjs — 문장 단독 분류 (기억 축, 맥락 무주입)
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
// stem_emit_v2.mjs — 지문 조립 (문장 0..joint 잇고 말미 종결부호 → "…")
function buildStemText(sentences, joint) {
  let text = sentences.slice(0, joint + 1).join(' ');
  return text.replace(/[.!?…]+["”']?\s*$/, '') + '…';
}

// 런타임 자산 문자열 수술 — UNDW-001 씬 id 항목만 제거·삽입. EN 블록·주석 바이트 보존.
function bakeAsset(stems, allKoIds) {
  let src = fs.readFileSync(ASSET, 'utf8');
  let removed = 0;
  for (const id of allKoIds) {
    const re = new RegExp(' "' + id + '": \\{[\\s\\S]*?\\n \\},?\\n');
    if (re.test(src)) { src = src.replace(re, ''); removed += 1; }
  }
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
  src = src.slice(0, at + openMark.length) + block + src.slice(at + openMark.length);
  const refreshNote = '// 260810 갱신 — stem_refresh_undw-260810.mjs: UNDW-001(KO) 재도출(본문 개고 반영, 규칙 동일).\n';
  if (!src.includes('260810 갱신')) {
    src = src.replace('// 작가 거부권: 지문-v2.json 재생성 → 본 자산 재생성. 생성일 260730.\n',
      '// 작가 거부권: 지문-v2.json 재생성 → 본 자산 재생성. 생성일 260730.\n' + refreshNote);
  }
  fs.writeFileSync(ASSET, src, 'utf8');
  console.log(`tem_stem_cuts.js 수술 — 제거 ${removed} · 삽입 ${stems.length}`);
}

async function main() {
  const dry = process.argv.includes('--dry');
  const assetOnly = process.argv.includes('--asset-only');

  // 기억 축 = 260728 스냅샷의 기억별 좌표계 재사용 (좌표계 동결 — 재도출은 별개 파이프라인)
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  const axes = snap.memories.find((m) => m.code === MEMORY_CODE).memory_axes;

  // 현재 DB 씬 (관객이 읽는 판본 = text_stage_1 우선)
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/scenes?memory_id=eq.${MEMORY_ID}&select=id,scene_order,text,text_stage_1&order=scene_order`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
  );
  if (!resp.ok) throw new Error(`scenes fetch HTTP ${resp.status}`);
  const dbScenes = await resp.json();

  if (assetOnly) {
    // 직전 실행이 갱신해 둔 지문-v2.json 의 UNDW-001 항목으로 자산만 굽는다 (LLM 0회)
    const v2 = JSON.parse(fs.readFileSync(path.join(EXP_DIR, '지문-v2.json'), 'utf8'));
    const idByOrder = new Map(dbScenes.map((s) => [s.scene_order, s.id]));
    const stems = v2.stems
      .filter((st) => st.memory_code === MEMORY_CODE)
      .map((st) => ({ ...st, scene_id: idByOrder.get(st.scene_order) }))
      .filter((st) => st.scene_id);
    bakeAsset(stems, dbScenes.map((s) => s.id));
    return;
  }
  const scenes = dbScenes.map((s) => {
    const src = (s.text_stage_1 && s.text_stage_1.trim()) ? s.text_stage_1 : (s.text || '');
    return { id: s.id, order: s.scene_order, src, sentences: splitSentences(src) };
  });
  console.log(`UNDW-001 씬 ${scenes.length}개 (DB 현재본)`);
  for (const s of scenes) {
    const st1 = dbScenes.find((d) => d.id === s.id).text_stage_1;
    const differs = st1 && dbScenes.find((d) => d.id === s.id).text !== st1;
    console.log(`  #${s.order} ${s.id.slice(0, 8)}… ${s.sentences.length}문장${differs ? ' (stage_1≠text — stage_1 사용)' : ''}`);
  }
  const jobs = [];
  for (const s of scenes) {
    if (s.sentences.length < 2) continue; // 절단 불가 — 자유 대화 폴백 (프로브와 동일 배제)
    s.sentences.forEach((sent, i) => jobs.push({ s, i, sent }));
  }
  console.log(`분류 호출 ${dry ? 0 : jobs.length}회 (문장 단독, 기억 축 ${axes.length}축)`);
  if (dry) return;

  // 분류 (동시 4, 간격 250ms — 프로브와 동일)
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

  // 델타 → 촉발력(동결 규칙) → 절단점
  const stems = [];
  for (const s of scenes) {
    if (s.sentences.length < 2) continue;
    const deltas = [];
    for (let i = 1; i < s.sentences.length; i++) {
      const a = vec.get(`${s.id}|${i - 1}`), b = vec.get(`${s.id}|${i}`);
      deltas.push(a && b ? +(1 - cosine(a, b)).toFixed(3) : null);
    }
    const d = deltas.map((x) => (x == null ? 0 : x));
    // stem_derive_refine.mjs — 촉발력 = Δ(j) × Σ_{i<j}Δ(i), argmax
    let best = null;
    const scores = d.map((delta, j) => {
      const charge = d.slice(0, j).reduce((sum, x) => sum + x, 0);
      return +(delta * charge).toFixed(4);
    });
    scores.forEach((sc, j) => { if (best == null || sc > scores[best]) best = j; });
    stems.push({
      memory_code: MEMORY_CODE,
      scene_order: s.order,
      scene_id: s.id,
      rule: 'trigger-power-v1',
      refined_joint: best,
      withheld: s.sentences[best + 1] || null,
      text: buildStemText(s.sentences, best),
    });
    console.log(`#${s.order}: [${d.map((x, j) => `${j}${j === best ? '★' : ''}:${x}`).join(' ')}]`);
    console.log(`   지문 "${stems[stems.length - 1].text.slice(0, 44)}" | 감춤 "${(s.sentences[best + 1] || '—').slice(0, 24)}"`);
  }

  // (1) 지문-v2.json — UNDW-001 항목만 교체 (거부권 표면 최신화)
  const v2Path = path.join(EXP_DIR, '지문-v2.json');
  const v2 = JSON.parse(fs.readFileSync(v2Path, 'utf8'));
  const kept = v2.stems.filter((st) => st.memory_code !== MEMORY_CODE);
  v2.stems = kept.concat(stems.map(({ scene_id, ...rest }) => rest))
    .sort((a, b) => a.memory_code.localeCompare(b.memory_code) || a.scene_order - b.scene_order);
  v2.meta.refreshed_260810 = 'UNDW-001 재도출 — 본문 개고 반영 (규칙 동일 trigger-power-v1, 원문 = text_stage_1 우선). 타 기억 동결 유지.';
  fs.writeFileSync(v2Path, JSON.stringify(v2, null, 1), 'utf8');
  console.log(`지문-v2.json 갱신 — UNDW-001 ${stems.length}개 교체, 타 기억 ${kept.length}개 유지`);

  // (2) 런타임 자산 — 항목 단위 문자열 수술 (footprints·EN·주석 바이트 보존)
  bakeAsset(stems, scenes.map((s) => s.id));
}

main().catch((e) => { console.error(e); process.exit(1); });

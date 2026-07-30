// test/tools/stem_derive_probe.mjs
// 절단점 도출 프로브 — "절단점 = era 내부 Δ 최대 이음매" (2026-07-30 브레인스토밍 층위 1)
//
// 방법: 씬 텍스트를 문장으로 쪼개 → 문장별 감정 벡터(배포 claude-scene, 기억 축) →
//   인접 델타(1−코사인) → 최대 델타 이음매 = 이론 도출 절단점.
//   지문.json 의 손 절단(cut_before 착지 문장)과 대조.
//
// 한계 (출력 meta 에 동결):
//   - 작가측 감정 델타 프록시 (E1·E2 계승 — 관계항 아님)
//   - 문장 단독 분류 (맥락 무주입 — 델타 보존 우선. 짧은 문장은 노이즈 큼)
//   - 문장 분할은 구두점 근사
// DB 쓰기 0건.
//
// 실행: node test/tools/stem_derive_probe.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BASE_DIR = path.join(ROOT, 'docs', '실험', '페르소나_리트머스-260728');
const EXP_DIR = path.join(ROOT, 'docs', '실험', '이어받기_리트머스-260730');

const SUPABASE_URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bXBwYXhwemJrd2ViZmJncHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMTcyMTEsImV4cCI6MjA4MDU5MzIxMX0.vv6Bmi2rZdx_HzLcxuw1wxfN_fvQYiigQz11KPNxH2M';
const FN_URL = `${SUPABASE_URL}/functions/v1/claude-scene`;
const CONCURRENCY = 4;
const GAP_MS = 250;

const loadJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// 손 절단의 착지 문장 식별 조각 (지문.json cut_before 기반, 원문 부분 문자열)
const LANDING = {
  'footprints#0': '일원이 된다',
  'footprints#1': '좋은 건지 모른다',
  'footprints#2': '주인은 누구였을까',
  'footprints#3': '칼로 표식을 새긴다',
  'footprints#4': '여인을 알까',
  'footprints#5': '속하지 못한다',
  'UNDW-001#1': '아른거리는 것이 싫어서',
  'UNDW-001#2': '믿고 싶어진다',
  'UNDW-001#3': '우연이길 바라지 않는다',
  'UNDW-001#4': '한 적이 있었나',
  'UNDW-001#5': '죽인 건 아니지만',
  'UNDW-001#6': '시체를 버릴',
  'UNDW-001#7': '같은 얼굴이었다',
  'UNDW-001#8': '상상할 수 있었다',
  'UNDW-001#9': '안 지켰다',
  'UNDW-001#11': '아프지 않았고',
  'UNDW-001#12': '언젠가 저렇게 되었다',
  'UNDW-001#13': '안 받은 적이 있어요',
};

function splitSentences(text) {
  const m = text.match(/[^.!?…]+[.!?…]+(?:["”']+)?/g);
  const parts = (m || [text]).map((s) => s.trim()).filter(Boolean);
  return parts;
}

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

async function main() {
  const dry = process.argv.includes('--dry');
  const snap = loadJSON(path.join(BASE_DIR, '씬스냅샷.json'));
  const memByCode = new Map(snap.memories.map((m) => [m.code, m]));

  const scenes = snap.scenes
    .map((s) => ({ ...s, key: `${s.code}#${s.scene_order}`, sentences: splitSentences(s.text) }))
    .sort((a, b) => (a.code + a.scene_order).localeCompare(b.code + b.scene_order));

  const jobs = [];
  for (const s of scenes) {
    const axes = memByCode.get(s.code).memory_axes;
    s.sentences.forEach((sent, i) => jobs.push({ key: s.key, i, sent, axes }));
  }
  console.log(`씬 ${scenes.length} · 문장 ${jobs.length} · 호출 ${dry ? 0 : jobs.length}회`);
  if (dry) {
    for (const s of scenes) console.log(`  ${s.key}: ${s.sentences.length}문장`);
    return;
  }

  const vec = new Map();
  let cursor = 0, done = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const j = jobs[cursor++];
      const v = await classify(j.sent, j.axes);
      vec.set(`${j.key}|${j.i}`, v);
      await new Promise((r) => setTimeout(r, GAP_MS));
      done += 1;
      if (done % 20 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const rows = [];
  for (const s of scenes) {
    const n = s.sentences.length;
    if (n < 2) continue;
    const deltas = [];
    for (let i = 1; i < n; i++) {
      const a = vec.get(`${s.key}|${i - 1}`), b = vec.get(`${s.key}|${i}`);
      deltas.push(a && b ? +(1 - cosine(a, b)).toFixed(3) : null);
    }
    const valid = deltas.map((d, i) => [d, i]).filter(([d]) => d != null);
    const derivedJoint = valid.length ? valid.reduce((m, x) => (x[0] > m[0] ? x : m))[1] : null;
    const frag = LANDING[s.key];
    const landingIdx = s.sentences.findIndex((x) => frag && x.includes(frag));
    const handJoint = landingIdx > 0 ? landingIdx - 1 : null;
    rows.push({
      key: s.key, sentences: s.sentences, deltas,
      derived_joint: derivedJoint, hand_joint: handJoint,
      agree: derivedJoint != null && handJoint != null && derivedJoint === handJoint,
      derived_stem_end: derivedJoint != null ? s.sentences[derivedJoint] : null,
      landing_sentence: landingIdx >= 0 ? s.sentences[landingIdx] : null,
    });
  }

  const agree = rows.filter((r) => r.agree).length;
  fs.writeFileSync(path.join(EXP_DIR, '절단프로브.json'), JSON.stringify({
    meta: {
      created: '260730',
      method: '문장 단독 분류(기억 축, 맥락 무주입) → 인접 델타(1−코사인) → 최대 이음매',
      limits: ['작가측 델타 프록시(E1·E2 계승)', '문장 단독 분류 — 짧은 문장 노이즈', '구두점 근사 분할'],
      agree_count: agree, total: rows.length,
    },
    rows,
  }, null, 1), 'utf8');
  console.log(`\n저장: 절단프로브.json — 일치 ${agree}/${rows.length}\n`);

  for (const r of rows) {
    const dstr = r.deltas.map((d, i) => `${i}${i === r.derived_joint ? '★' : ''}${i === r.hand_joint ? '✋' : ''}:${d ?? '—'}`).join(' ');
    console.log(`${r.key} [${dstr}]`);
    console.log(`  도출: …"${(r.derived_stem_end || '').slice(0, 30)}" 까지 | 손: 착지="${(r.landing_sentence || '?').slice(0, 30)}" ${r.agree ? '=== 일치' : '=/= 불일치'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

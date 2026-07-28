// test/tools/persona_noise.mjs
// 설계 외 추가 — 분류기 재현성(LLM 비결정성) 측정.
//
// 왜: 실행 중 같은 발화·같은 축으로 재호출했더니 anger 0.75 → 0.40 으로 흔들렸다.
// 자(축) 간 차이가 이 흔들림보다 작으면 리트머스 판정 자체가 노이즈에 잠긴다.
// 발화 12개 × 자 B 축 × 3회 반복 → 반복 간 코사인 유사도 분포를 잰다.
//
// 실행: node test/tools/persona_noise.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const EXP_DIR = path.join(ROOT, 'docs', '실험', '페르소나_리트머스-260728');
const SUPABASE_URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bXBwYXhwemJrd2ViZmJncHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMTcyMTEsImV4cCI6MjA4MDU5MzIxMX0.vv6Bmi2rZdx_HzLcxuw1wxfN_fvQYiigQz11KPNxH2M';
const FN = `${SUPABASE_URL}/functions/v1/claude-scene`;
const REPEATS = 3;

const load = (f) => JSON.parse(fs.readFileSync(path.join(EXP_DIR, f), 'utf8'));

function cos(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  let d = 0, na = 0, nb = 0;
  for (const k of keys) { const x = +a[k] || 0, y = +b[k] || 0; d += x * y; na += x * x; nb += y * y; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

async function call(text, axes) {
  const r = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ type: 'emotion_analysis', emotion: text, reason: '', anchorEmotions: axes }),
  });
  const d = await r.json();
  let b = d?.analysis?.base;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = null; } }
  return b && !Array.isArray(b) ? b : null;
}

async function main() {
  const snap = load('씬스냅샷.json');
  const corpus = load('발화코퍼스.json');
  const memByCode = new Map(snap.memories.map((m) => [m.code, m]));

  // 아키타입별 2개씩 = 12발화 (기억 하나씩 섞어서)
  const picks = [];
  for (const a of ['echo_follow', 'bridge', 'contradiction', 'displacement', 'avoidance', 'fixation']) {
    const us = corpus.utterances.filter((u) => u.archetype === a && !['ㅇ', '응', '어', '네', '그래'].includes(u.text.trim()));
    picks.push(us[2], us.find((u) => u.memory_code === 'UNDW-001'));
  }

  const out = [];
  for (const u of picks) {
    const axes = memByCode.get(u.memory_code).memory_axes;
    const runs = [];
    for (let i = 0; i < REPEATS; i++) {
      runs.push(await call(u.text, axes));
      await new Promise((r) => setTimeout(r, 300));
    }
    const pairs = [];
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        if (runs[i] && runs[j]) pairs.push(cos(runs[i], runs[j]));
      }
    }
    const rec = {
      utterance_id: u.id, archetype: u.archetype, text: u.text,
      repeat_cosines: pairs.map((x) => +x.toFixed(4)),
      mean_repeat_cosine: +(pairs.reduce((s, x) => s + x, 0) / pairs.length).toFixed(4),
      runs,
    };
    out.push(rec);
    console.log(`${u.id} ${u.archetype.padEnd(13)} 반복간 코사인 평균 ${rec.mean_repeat_cosine}`);
  }
  const overall = +(out.reduce((s, r) => s + r.mean_repeat_cosine, 0) / out.length).toFixed(4);
  console.log(`\n전체 평균 반복간 코사인: ${overall}  (1.000 = 완전 재현, 낮을수록 흔들림)`);
  fs.writeFileSync(path.join(EXP_DIR, '재현성측정.json'),
    JSON.stringify({ meta: { created: '260728', repeats: REPEATS, overall_mean_repeat_cosine: overall,
      note: '설계 외 추가. 자 간 차이가 이 흔들림보다 큰지 판단하는 기준선.' }, results: out }, null, 1), 'utf8');
  console.log('저장: 재현성측정.json');
}

main().catch((e) => { console.error(e); process.exit(1); });

// test/tools/contform_classify.mjs
// 이어받기 형식 리트머스 §5 — 배포된 claude-scene 으로 이어받기 발화 분류.
//
// 설계 정본: docs/실험/이어받기형식_리트머스_설계-260730.md
//   - 자 1종만: 현행 배포 우선순위 (씬 anchor > 기억 축 > 원본 키) = 실관객이 맞을 자.
//   - 발화 = "연결사 + 이어쓴 문장" 전체. reason = 동일 (260728 reason 주입 유지).
//   - context = { scene_text, ghost_line: 지문 } — 프로덕션 _analyzeEmotion 동형.
//     베이스라인 v3 는 ghost_line=null 이었음. 이어받기에서 지문은 형식의 내재 속성
//     (교락 아니라 처치의 일부 — 설계 §5 명시 한계).
//   - DB 쓰기 0건 (claude-scene 은 DB 접근 코드 없음 — 260728 §12 확인 승계).
//
// 실행: node test/tools/contform_classify.mjs [--limit N] [--dry]

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

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function parseEmotion(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (_) { return {}; } }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return {};
}

// 현행 배포 우선순위 재현 — persona_classify.mjs rulerAxes('A') 사본
function currentAxes(scene, memory) {
  if (scene.anchor_emotions && scene.anchor_emotions.length) return scene.anchor_emotions;
  if (memory.memory_axes && memory.memory_axes.length) return memory.memory_axes;
  const orig = parseEmotion(scene.original_emotion_raw);
  const keys = Object.keys(orig);
  return keys.length ? keys : null;
}

async function callOnce(text, axes, ctx) {
  const resp = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ type: 'emotion_analysis', emotion: text, reason: text, anchorEmotions: axes, context: ctx || null }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  let base = data && data.analysis && data.analysis.base;
  if (typeof base === 'string') { try { base = JSON.parse(base); } catch (_) { base = null; } }
  if (Array.isArray(base)) base = null;
  if (base && typeof base === 'object' && Object.keys(base).length > 0) {
    return {
      vector: base,
      confidence: data.analysis.confidence ?? null,
      intensity: data.analysis.intensity ?? null,
      reason_analysis: data.reason_analysis ?? null,
    };
  }
  return null;
}

async function classify(text, axes, ctx) {
  try {
    const r = await callOnce(text, axes, ctx);
    if (r) return r;
  } catch (e) {
    process.stderr.write(`  retry after: ${e.message}\n`);
  }
  await new Promise((r) => setTimeout(r, 1200));
  try {
    const r = await callOnce(text, axes, ctx);
    if (r) return r;
  } catch (e) {
    process.stderr.write(`  FAIL: ${e.message}\n`);
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const dry = args.includes('--dry');
  // 260730 저녁: --suffix v2 = 도출 지문(촉발력 규칙) 재실행. 무접미사 v1 산출물은 동결 유지.
  const sfx = args.includes('--suffix') ? `-${args[args.indexOf('--suffix') + 1]}` : '';
  // 260730 자 수술 후 3차: --postop = 분류 축을 기억 축 고정 (수술본 lumen_dialog_phase1.js 재현).
  // 축 배열이 수술 전과 문자 그대로 같은 발화(footprints — 씬 anchor 없음)는 기존 결과 재사용.
  const postop = args.includes('--postop');

  const snap = loadJSON(path.join(BASE_DIR, '씬스냅샷.json'));
  const stems = loadJSON(path.join(EXP_DIR, `지문${sfx}.json`));
  const corpus = loadJSON(path.join(EXP_DIR, `이어받기코퍼스${sfx}.json`));

  const sceneByKey = new Map(snap.scenes.map((s) => [`${s.code}#${s.scene_order}`, s]));
  const memByCode = new Map(snap.memories.map((m) => [m.code, m]));
  const stemByKey = new Map(stems.stems.map((st) => [`${st.memory_code}#${st.scene_order}`, st]));

  // postop 재사용 소스: 수술 전 v2 분류결과 (동형 호출 — 지문·맥락 동일, 축만 비교)
  let preop = null;
  if (postop) {
    const prePath = path.join(EXP_DIR, `분류결과-cont${sfx}.json`);
    if (fs.existsSync(prePath)) preop = new Map(loadJSON(prePath).results.map((r) => [r.utterance_id, r]));
  }

  const jobs = corpus.utterances.slice(0, limit === Infinity ? undefined : limit).map((u) => {
    const key = `${u.memory_code}#${u.scene_order}`;
    const scene = sceneByKey.get(key);
    const memory = memByCode.get(u.memory_code);
    const stem = stemByKey.get(key);
    if (!scene || !memory || !stem) throw new Error(`조인 실패: ${key}`);
    const preAxes = currentAxes(scene, memory);
    const axes = postop ? (memory.memory_axes && memory.memory_axes.length ? memory.memory_axes : preAxes) : preAxes;
    const reusable = postop && preop && preop.has(u.id) && JSON.stringify(axes) === JSON.stringify(preop.get(u.id).anchorKeys);
    const fullText = `${u.connective} ${u.text}`;
    const ctx = {
      scene_text: String(scene.text || '').slice(0, 400),
      ghost_line: String(stem.text || '').slice(0, 200),
    };
    return { u, fullText, axes, ctx, reusable };
  });

  const reuseN = jobs.filter((j) => j.reusable).length;
  console.log(`[cont_v1${postop ? '·postop' : ''}] 발화 ${jobs.length}개 — 호출 ${jobs.length - reuseN}회 (재사용 ${reuseN}회)`);
  if (dry) {
    const uniq = new Map();
    jobs.forEach((j) => { const k = JSON.stringify(j.axes); uniq.set(k, (uniq.get(k) || 0) + 1); });
    for (const [k, n] of uniq) console.log(`  ${n}발화 ← 축 ${k}`);
    return;
  }

  const results = new Array(jobs.length);
  let done = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const i = cursor++;
      const j = jobs[i];
      if (j.reusable) {
        results[i] = { ...preop.get(j.u.id), ruler: postop ? 'B-postop' : 'A-current', reused_from_preop: true };
      } else {
        const r = await classify(j.fullText, j.axes, j.ctx);
        results[i] = {
          utterance_id: j.u.id,
          ruler: postop ? 'B-postop' : 'A-current',
          input_form: 'cont_v1',
          classified_text: j.fullText,
          anchorKeys: j.axes,
          vector: r ? r.vector : null,
          confidence: r ? r.confidence : null,
          intensity: r ? r.intensity : null,
          reason_analysis: r ? r.reason_analysis : null,
          missing: !r,
        };
        await new Promise((res) => setTimeout(res, GAP_MS));
      }
      done += 1;
      if (done % 12 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const missing = results.filter((r) => r.missing).length;
  const out = {
    meta: {
      created: '260730',
      ruler: 'A-current (씬 anchor > 기억 축 > 원본 키)',
      input_form: 'cont_v1',
      endpoint: FN_URL,
      note: '배포판 claude-scene. emotion=reason="연결사+이어쓰기" 전체, context={scene_text, ghost_line:지문}. DB 쓰기 0건.',
      call_count: jobs.length,
      missing_count: missing,
      missing_rate: +(missing / results.length).toFixed(4),
    },
    results,
  };
  const outPath = path.join(EXP_DIR, `분류결과-cont${sfx}${postop ? '-postop' : ''}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1), 'utf8');
  console.log(`저장: ${outPath} (결측 ${missing}/${results.length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });

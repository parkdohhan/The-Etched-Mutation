// test/tools/persona_classify.mjs
// 페르소나 리트머스 §7 — 자 3종 × 발화 분류 호출 (배포된 claude-scene edge function).
//
// 설계 정본: docs/실험/페르소나_리트머스_설계-260728.md
//   - 배포판 사용이 의도 (저장소-배포판 드리프트 이력. 실관객이 맞는 건 배포판).
//   - 호출 형태 = js/ui/lumen_dialog_phase1.js:1345 _analyzeEmotion 과 동일
//     body { type:'emotion_analysis', emotion: <발화>, reason:'', anchorEmotions: <자별 축> }
//   - 응답 data.analysis.base 를 그대로 저장 (string/array 방어는 1361행 로직 복사).
//   - DB 쓰기 0건. claude-scene 은 DB 접근 코드 없음 (소스 확인 §12).
//
// 자 3종 (설계 §3):
//   A(현행) = 씬 anchor_emotions(있으면) > 기억 축 > 원본 키   ← 1663행 우선순위 재현
//   B(수술안) = 기억 축(memoryEmotionAxes) 고정
//   C(참고) = 판단 정본 17축 DEFAULT_EMOTION_ANCHORS
//
// 축퇴 최적화: 어떤 발화의 A 축 배열이 B 축 배열과 문자 그대로 같으면 프롬프트가 동일하므로
//   B 결과를 재사용한다 (재호출은 LLM 노이즈만 측정하게 됨). reused_from_B 플래그로 표시.
//
// 실행: node test/tools/persona_classify.mjs [--ruler A|B|C] [--limit N] [--dry]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const EXP_DIR = path.join(ROOT, 'docs', '실험', '페르소나_리트머스-260728');

const SUPABASE_URL = 'https://bxmppaxpzbkwebfbgpsm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bXBwYXhwemJrd2ViZmJncHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMTcyMTEsImV4cCI6MjA4MDU5MzIxMX0.vv6Bmi2rZdx_HzLcxuw1wxfN_fvQYiigQz11KPNxH2M';
const FN_URL = `${SUPABASE_URL}/functions/v1/claude-scene`;

// js/shared/math.js DEFAULT_EMOTION_ANCHORS (260727판) 사본 — 하네스 무의존 유지
const DEFAULT_EMOTION_ANCHORS = [
  'fear', 'sadness', 'anger', 'guilt', 'shame',
  'isolation', 'numbness', 'moral_pain', 'helplessness', 'despair',
  'joy', 'hope', 'relief', 'gratitude', 'love', 'peace', 'comfort',
];

const CONCURRENCY = 4;
const GAP_MS = 250;

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// play-test.html safeParseEmotion 과 같은 결 — string 이면 파싱
function parseEmotion(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (_) { return {}; } }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return {};
}

function rulerAxes(ruler, scene, memory) {
  if (ruler === 'C') return DEFAULT_EMOTION_ANCHORS;
  if (ruler === 'B') return memory.memory_axes;
  // A — lumen_dialog_phase1.js:1663 우선순위 재현
  if (scene.anchor_emotions && scene.anchor_emotions.length) return scene.anchor_emotions;
  if (memory.memory_axes && memory.memory_axes.length) return memory.memory_axes;
  const orig = parseEmotion(scene.original_emotion_raw);
  const keys = Object.keys(orig);
  return keys.length ? keys : null;
}

// 260728 reason 주입 (§7-① 후속): 프로덕션 _analyzeEmotion 이 reason: text 로 바뀜.
// 하네스도 동형이어야 재실행이 "고친 경로"를 시험한다. 옛 형태(reason:'')의 결과는
// 분류결과-{A,B,C}.json 에 동결 — 본 하네스는 이제 -v2 파일에 쓴다 (동결 침범 금지).
async function callOnce(text, axes) {
  const resp = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ type: 'emotion_analysis', emotion: text, reason: text, anchorEmotions: axes }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  // lumen_dialog_phase1.js:1361 방어 로직 복사
  let base = data && data.analysis && data.analysis.base;
  if (typeof base === 'string') { try { base = JSON.parse(base); } catch (_) { base = null; } }
  if (Array.isArray(base)) base = null;
  if (base && typeof base === 'object' && Object.keys(base).length > 0) {
    return {
      vector: base,
      confidence: data.analysis.confidence ?? null,
      intensity: data.analysis.intensity ?? null,
      // 260728: is_void 배선 검증용 — 프로덕션이 이제 이 값을 소비한다
      reason_analysis: data.reason_analysis ?? null,
    };
  }
  return null;
}

async function classify(text, axes) {
  try {
    const r = await callOnce(text, axes);
    if (r) return r;
  } catch (e) {
    process.stderr.write(`  retry after: ${e.message}\n`);
  }
  await new Promise((r) => setTimeout(r, 1200));
  try {
    const r = await callOnce(text, axes);
    if (r) return r;
  } catch (e) {
    process.stderr.write(`  FAIL: ${e.message}\n`);
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const ruler = (args.includes('--ruler') ? args[args.indexOf('--ruler') + 1] : 'B').toUpperCase();
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const dry = args.includes('--dry');
  if (!['A', 'B', 'C'].includes(ruler)) throw new Error('--ruler 는 A|B|C');

  const snap = loadJSON(path.join(EXP_DIR, '씬스냅샷.json'));
  const corpus = loadJSON(path.join(EXP_DIR, '발화코퍼스.json'));
  const sceneById = new Map(snap.scenes.map((s) => [s.scene_id, s]));
  const memByCode = new Map(snap.memories.map((m) => [m.code, m]));

  // 자 A 이고 축이 B 와 동일하면 B 결과 재사용 — v2 파일에서 (동형 호출끼리만 재사용 가능)
  let bResults = null;
  const bPath = path.join(EXP_DIR, '분류결과-B-v2.json');
  if (ruler === 'A' && fs.existsSync(bPath)) {
    bResults = new Map(loadJSON(bPath).results.map((r) => [r.utterance_id, r]));
  }

  const jobs = corpus.utterances.slice(0, limit === Infinity ? undefined : limit).map((u) => {
    const scene = sceneById.get(u.scene_id);
    const memory = memByCode.get(u.memory_code);
    const axes = rulerAxes(ruler, scene, memory);
    const bAxes = rulerAxes('B', scene, memory);
    const sameAsB = ruler === 'A' && JSON.stringify(axes) === JSON.stringify(bAxes);
    return { u, axes, sameAsB };
  });

  const reuse = jobs.filter((j) => j.sameAsB && bResults && bResults.has(j.u.id)).length;
  console.log(`[자 ${ruler}] 발화 ${jobs.length}개 — 호출 ${jobs.length - reuse}회 (B 재사용 ${reuse}회)`);
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
      if (j.sameAsB && bResults && bResults.has(j.u.id)) {
        const b = bResults.get(j.u.id);
        results[i] = { ...b, ruler, reused_from_B: true };
      } else {
        const r = await classify(j.u.text, j.axes);
        results[i] = {
          utterance_id: j.u.id,
          ruler,
          anchorKeys: j.axes,
          vector: r ? r.vector : null,
          confidence: r ? r.confidence : null,
          intensity: r ? r.intensity : null,
          reason_analysis: r ? r.reason_analysis : null, // 260728 is_void 배선 검증용
          missing: !r,
          reused_from_B: false,
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
      created: '260728',
      ruler,
      variant: 'v2-reason주입',
      endpoint: FN_URL,
      note: '배포판 claude-scene 호출, reason=발화 텍스트 (§7-① 후속). DB 쓰기 0건. v1(reason 빈값)은 분류결과-{A,B,C}.json 동결.',
      call_count: jobs.length - reuse,
      reused_from_B: reuse,
      missing_count: missing,
      missing_rate: +(missing / results.length).toFixed(4),
    },
    results,
  };
  const outPath = path.join(EXP_DIR, `분류결과-${ruler}-v2.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1), 'utf8');
  console.log(`저장: ${outPath} (결측 ${missing}/${results.length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });

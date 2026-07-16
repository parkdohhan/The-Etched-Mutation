// tools/contact_rate_probe.mjs
//
// 접촉 희소성 측정 (이본 지층 W3-4, 2026-07-16).
// docs/이본지층/이본지층_설계_v1-260716.md 결정 3: 기존 이름-드러남(턴 코사인 ≥0.85)을
// "접촉 사건"으로 승격. 회차당 최대 1회. 임계 상향 여부(0.85 유지 / 0.90 / 0.92)를 이 스크립트로
// 실측하여 권고. 최종 결정은 지휘·작가.
//
// 측정 (모두 DB SELECT 만, 쓰기 없음):
//   (1) ghost_variants: anchor(is_seed & parent_variant_id null) 대 나머지 변주의
//       최근접 코사인 분포 → 0.85/0.90/0.92 초과 비율.
//   (2) plays.user_emotion: 실제(또는 시뮬) 턴 감정 대 최근접 anchor 코사인 → 초과 비율.
//       persona_id null = 실관객 / not null = 페르소나(시뮬) 로 분리 (설계 §6: 침식 인구=실관객만).
//   (3) utterances(잔상): emotion_tags(text[]) + axis_x/axis_z 표현이라 12축 emotion_vec 과
//       코사인 비교 불가 + 기억/anchor 미연결 → 측정 제외(사유 출력).
//
// emotion_vec / user_emotion 은 12축 근처의 jsonb (sadness, fear, longing, isolation, guilt,
// emptiness, numbness, confusion, joy, shame, anger, relief, ...). 코사인은 두 벡터 키의 합집합
// 위에서 계산(없는 축 = 0). 감정축이 전부 비음수라 코사인은 구조적으로 0 이상.
//
// 사용:
//   SUPABASE_URL="https://xxx.supabase.co" SUPABASE_SERVICE_ROLE_KEY="eyJ..." node tools/contact_rate_probe.mjs
//   (anon 키로도 ghost_variants 는 읽히지만, plays RLS 때문에 실관객 분리는 service_role 권장)
//   env 대체 키: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 도 인식.
//
// 옵션:
//   --turns-per-run=N   회차당 턴 수 가정 (기본 10; MM23L 씬 11개 기준). per-run 접촉 확률 추정에 사용.
//   --json              결과를 JSON 으로도 출력.

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.map((a) => {
  if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }
  return [a, true];
}));
const TURNS_PER_RUN = Number(flags['turns-per-run']) || 10;
const AS_JSON = !!flags.json;
const THRESHOLDS = [0.85, 0.90, 0.92];

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or VITE_ 대체 키).');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

// ─── cosine over the union of keys (missing axis = 0) ──────────────
function cosine(a, b) {
  if (!a || !b) return null;
  let dot = 0, na = 0, nb = 0;
  for (const k of Object.keys(a)) { const v = Number(a[k]) || 0; na += v * v; dot += v * (Number(b[k]) || 0); }
  for (const k of Object.keys(b)) { const v = Number(b[k]) || 0; nb += v * v; }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function nearestCos(vec, anchors) {
  let best = null;
  for (const a of anchors) { const c = cosine(a, vec); if (c !== null && (best === null || c > best)) best = c; }
  return best;
}
function bucket(values) {
  const vals = values.filter((v) => v !== null);
  const out = { n: vals.length, mean: null, max: null };
  if (vals.length) {
    out.mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    out.max = Math.max(...vals);
  }
  for (const t of THRESHOLDS) {
    const c = vals.filter((v) => v >= t).length;
    out[`ge_${t}`] = c;
    out[`pct_${t}`] = vals.length ? (100 * c / vals.length) : 0;
  }
  return out;
}
// per-run 접촉 확률 (회차당 1회 cap): p_run = 1 - (1 - p_turn)^TURNS_PER_RUN
function perRun(pTurn) { return 1 - Math.pow(1 - pTurn, TURNS_PER_RUN); }
function fmt(x, d = 3) { return x === null || x === undefined ? '—' : Number(x).toFixed(d); }
function turnsPerContact(pTurn) { return pTurn > 0 ? (1 / pTurn) : Infinity; }

async function loadAll(table, cols) {
  // page through in case of >1000 rows
  const pageSize = 1000; let from = 0; const rows = [];
  for (;;) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} select failed: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  const report = { thresholds: THRESHOLDS, turnsPerRun: TURNS_PER_RUN, variants: {}, plays: {}, notes: [] };

  // ── (1) ghost_variants: anchor 대 나머지 변주 ─────────────────────
  const gv = await loadAll('ghost_variants', 'id, memory_id, is_seed, parent_variant_id, emotion_vec');
  const byMem = new Map();
  for (const r of gv) {
    if (!byMem.has(r.memory_id)) byMem.set(r.memory_id, { anchors: [], others: [] });
    const isAnchor = r.is_seed && (r.parent_variant_id === null || r.parent_variant_id === undefined);
    (isAnchor ? byMem.get(r.memory_id).anchors : byMem.get(r.memory_id).others).push(r.emotion_vec);
  }
  console.log('\n=== (1) ghost_variants: anchor(is_seed & parent null) 대 나머지 변주, 최근접 코사인 ===');
  console.log('memory                                | anchors | others | mean  | max   | ≥.85 | ≥.90 | ≥.92');
  for (const [mem, { anchors, others }] of byMem) {
    if (anchors.length === 0) { report.variants[mem] = { anchors: 0, others: others.length, skipped: 'no anchor' }; continue; }
    const b = bucket(others.map((o) => nearestCos(o, anchors)));
    report.variants[mem] = { anchors: anchors.length, ...b };
    console.log(`${mem} | ${String(anchors.length).padStart(7)} | ${String(b.n).padStart(6)} | ${fmt(b.mean)} | ${fmt(b.max)} | ${String(b['ge_0.85']).padStart(4)} | ${String(b['ge_0.9']).padStart(4)} | ${String(b['ge_0.92']).padStart(4)}`);
  }
  const noAnchor = [...byMem.entries()].filter(([, v]) => v.anchors.length === 0).map(([m]) => m);
  if (noAnchor.length) console.log(`(anchor 0 이라 제외된 기억: ${noAnchor.length}개 — ${noAnchor.join(', ')})`);

  // ── (2) plays.user_emotion 대 최근접 anchor (human/persona 분리) ──
  const plays = await loadAll('plays', 'memory_id, user_emotion, persona_id');
  const memAnchors = new Map([...byMem.entries()].filter(([, v]) => v.anchors.length).map(([m, v]) => [m, v.anchors]));
  console.log('\n=== (2) plays.user_emotion 대 최근접 anchor 코사인 (anchor 보유 기억만) ===');
  console.log('memory                               | cohort  | turns | mean  | max   | ≥.85 | ≥.90 | ≥.92');
  for (const [mem, anchors] of memAnchors) {
    for (const cohort of ['human', 'persona']) {
      const turns = plays
        .filter((p) => p.memory_id === mem && p.user_emotion && Object.keys(p.user_emotion).length)
        .filter((p) => cohort === 'human' ? (p.persona_id == null) : (p.persona_id != null))
        .map((p) => nearestCos(p.user_emotion, anchors));
      const b = bucket(turns);
      if (b.n === 0) continue;
      report.plays[`${mem}:${cohort}`] = b;
      console.log(`${mem} | ${cohort.padEnd(7)} | ${String(b.n).padStart(5)} | ${fmt(b.mean)} | ${fmt(b.max)} | ${String(b['ge_0.85']).padStart(4)} | ${String(b['ge_0.9']).padStart(4)} | ${String(b['ge_0.92']).padStart(4)}`);
    }
  }

  // ── 접촉률 요약 (per-turn → per-run) ──────────────────────────────
  console.log(`\n=== 접촉률 요약 (회차 ${TURNS_PER_RUN}턴 가정, 회차당 1회 cap) ===`);
  for (const [key, b] of Object.entries(report.plays)) {
    console.log(`[${key}]  n=${b.n}`);
    for (const t of THRESHOLDS) {
      const p = (b[`pct_${t}`] || 0) / 100;
      const tpc = turnsPerContact(p);
      console.log(`  ≥${t}: 턴당 ${(p * 100).toFixed(1)}%  ≈ ${tpc === Infinity ? '접촉 없음' : `${tpc.toFixed(1)}턴에 1회`}  → 회차당 ${(perRun(p) * 100).toFixed(0)}%`);
    }
  }

  // ── (3) utterances: 표현 불일치로 제외 ────────────────────────────
  const utt = await loadAll('utterances', 'id, emotion_tags, axis_x, axis_z');
  const note3 = `(3) utterances(잔상) ${utt.length}행 = emotion_tags(text[]) + axis_x/axis_z 표현. 12축 emotion_vec 과 코사인 비교 불가 + 기억/anchor 미연결 → 측정 제외.`;
  report.notes.push(note3);
  console.log(`\n=== ${note3} ===`);

  if (AS_JSON) console.log('\n' + JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

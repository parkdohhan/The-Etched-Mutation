/**
 * 별이엔진 V4 — 1단계: 감정 벡터 추출 안정성 테스트
 *
 * 목적: 같은 텍스트를 Claude에 5번 돌려서 감정 벡터가 얼마나 흔들리는지 측정
 * 판정: 쌍별 코사인 유사도 평균 ≥ 0.95면 안정적, < 0.90이면 불안정
 *
 * 실행: node tests/emotion_stability_test.js
 *
 * 소요 시간: API 호출 100번 (20텍스트 × 5회), 약 10~15분
 *
 * 참고: Supabase `claude-scene`은 원시 { system, messages } 패스스루가 없다.
 *       본 스크립트는 배포된 `type: "emotion_extract"`(장면+반응)로 호출한 뒤,
 *       아래 V4 목표 축(EMOTION_KEYS)으로 벡터를 정규화해 코사인을 계산한다.
 */

const { readFileSync } = require('fs');
const _env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SUPABASE_URL = _env.VITE_SUPABASE_URL + '/functions/v1/claude-scene';
const SUPABASE_ANON_KEY = _env.VITE_SUPABASE_ANON_KEY;

/** V4 목표 출력 스키마 (문서/추후 전용 엔드포인트용 참고). 실제 호출은 emotion_extract. */
const SYSTEM_PROMPT = `너는 기억 해석 분석 엔진이다.
사용자가 타인의 기억 장면을 읽고 쓴 짧은 반응 텍스트를 분석한다.
다음 JSON만 반환하라. 설명이나 마크다운 없이.

{
  "base": {
    "fear": 0~1,
    "sadness": 0~1,
    "anger": 0~1,
    "guilt": 0~1,
    "shame": 0~1,
    "longing": 0~1,
    "numbness": 0~1,
    "isolation": 0~1,
    "moral_pain": 0~1
  },
  "attribution": "self" | "other" | "situation" | "mixed" | null,
  "distortionTag": "idealization" | "projection" | "rationalization" | "avoidance" | "raw" | null,
  "intensity": 0~1,
  "isVoid": true | false
}

규칙:
- 각 감정 항목은 독립적. 합이 1일 필요 없음.
- 텍스트가 짧아도 분석할 것.
- 회피, 합리화, 전가, 미화 같은 해석 기울기를 distortionTag로 잡아라.
- isVoid는 감정을 직접 쓰지 않거나 상황 묘사만 할 때 true.`;

// ─── 테스트 텍스트 20개 ───

const TEST_TEXTS = [
  // === 직접적 서술 10개 (감정을 명시적으로 표현) ===
  { id: 'D01', type: 'direct', text: '무서웠다. 심장이 빠르게 뛰었고 도망치고 싶었다.' },
  { id: 'D02', type: 'direct', text: '화가 났다. 왜 그 사람이 그런 말을 했는지 이해할 수 없었다.' },
  { id: 'D03', type: 'direct', text: '너무 슬펐다. 눈물이 멈추지 않았다.' },
  { id: 'D04', type: 'direct', text: '미안했다. 내가 좀 더 잘했으면 이렇게 안 됐을 텐데.' },
  { id: 'D05', type: 'direct', text: '부끄러웠다. 사람들이 다 나를 보고 있는 것 같았다.' },
  { id: 'D06', type: 'direct', text: '그리웠다. 그때로 돌아가고 싶었다.' },
  { id: 'D07', type: 'direct', text: '아무것도 느끼지 못했다. 멍했다.' },
  { id: 'D08', type: 'direct', text: '혼자라는 느낌이 강하게 들었다. 아무도 없었다.' },
  { id: 'D09', type: 'direct', text: '안도했다. 드디어 끝났다는 생각뿐이었다.' },
  { id: 'D10', type: 'direct', text: '죄책감이 밀려왔다. 그 사람한테 너무 못했다.' },

  // === 은유적/서사적 서술 10개 (감정을 간접적으로 표현) ===
  { id: 'M01', type: 'metaphor', text: '가슴 한가운데에 돌멩이가 하나 올라앉은 것 같았다.' },
  { id: 'M02', type: 'metaphor', text: '그 방은 점점 좁아지고 있었다. 벽이 다가오는 느낌.' },
  { id: 'M03', type: 'metaphor', text: '그 사람의 목소리가 자꾸 머릿속에서 재생됐다. 끄고 싶은데 버튼이 없었다.' },
  { id: 'M04', type: 'metaphor', text: '모든 게 물 밑에 가라앉아 있는 것처럼 느려졌다.' },
  { id: 'M05', type: 'metaphor', text: '누군가 내 안에서 조용히 문을 닫았다.' },
  { id: 'M06', type: 'metaphor', text: '손이 기억하고 있었다. 그때 잡았던 그 온기를.' },
  { id: 'M07', type: 'metaphor', text: '그때의 냄새가 갑자기 올라왔다. 코끝이 시큰했다.' },
  { id: 'M08', type: 'metaphor', text: '나는 그 장면의 관객이었다. 무대 위의 사람은 나였는데.' },
  { id: 'M09', type: 'metaphor', text: '입 안이 텁텁해졌다. 말을 삼킨 것 같았다.' },
  { id: 'M10', type: 'metaphor', text: '어디선가 유리가 깨지는 소리가 들렸다. 아무도 치우지 않았다.' },
];

const SCENE_CONTEXT = '어린 시절, 가족과의 저녁 식사 자리에서 아버지가 갑자기 소리를 질렀다. 식탁 위의 그릇이 흔들렸다.';
const REPEATS = 5;
const EMOTION_KEYS = ['fear', 'sadness', 'anger', 'guilt', 'shame', 'longing', 'numbness', 'isolation', 'moral_pain'];

// ─── API 호출 (emotion_extract → V4 9축 정규화) ───

function normalizeBaseForCosine(baseRaw) {
  const out = {};
  for (const k of EMOTION_KEYS) {
    const v = baseRaw[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  return out;
}

/** emotion_extract의 reason_analysis.attribution → 안정성 비교용 라벨 */
function mapAttributionStable(raw) {
  if (raw == null || raw === '' || raw === 'unknown') return 'null';
  const m = {
    self_blame: 'self',
    other_blame: 'other',
    fate_blame: 'situation',
    self: 'self',
    other: 'other',
    situation: 'situation',
    mixed: 'mixed',
  };
  return m[raw] || String(raw);
}

async function callEmotionAnalysis(text) {
  const res = await fetch(SUPABASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      type: 'emotion_extract',
      scene_text: SCENE_CONTEXT,
      user_text: text,
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));

  const base = normalizeBaseForCosine(data.base || {});
  const attribution = mapAttributionStable(data.reason_analysis?.attribution);
  return { base, attribution };
}

// ─── 코사인 유사도 ───

function cosineSim(vecA, vecB) {
  let dot = 0, magA = 0, magB = 0;
  for (const k of EMOTION_KEYS) {
    const a = vecA[k] || 0;
    const b = vecB[k] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

// 한 텍스트의 5회 결과에서 모든 쌍의 코사인 유사도 평균
function pairwiseMeanCosine(vectors) {
  let total = 0, pairs = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      total += cosineSim(vectors[i], vectors[j]);
      pairs++;
    }
  }
  return pairs > 0 ? total / pairs : 0;
}

// 표준편차
function stdDev(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq = values.map(v => (v - mean) ** 2);
  return Math.sqrt(sq.reduce((a, b) => a + b, 0) / values.length);
}

// ─── 딜레이 ───

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 메인 ───

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  별이엔진 V4 — 감정 벡터 추출 안정성 테스트');
  console.log('  텍스트 20개 × 5회 = API 호출 100번');
  console.log('═══════════════════════════════════════════════════════════\n');

  const results = [];
  let totalCalls = 0;
  let failedCalls = 0;

  for (const item of TEST_TEXTS) {
    const vectors = [];
    const attributions = [];
    process.stdout.write(`[${item.id}] "${item.text.slice(0, 25)}..." → `);

    for (let r = 0; r < REPEATS; r++) {
      try {
        const result = await callEmotionAnalysis(item.text);
        vectors.push(result.base);
        attributions.push(result.attribution || 'null');
        process.stdout.write('✓');
        totalCalls++;
      } catch (e) {
        process.stdout.write('✗');
        failedCalls++;
        totalCalls++;
      }
      // rate limit 방어
      await sleep(1500);
    }

    if (vectors.length >= 2) {
      const meanCos = pairwiseMeanCosine(vectors);
      const uniqueAttr = [...new Set(attributions)];
      const attrStable = uniqueAttr.length === 1;

      results.push({
        id: item.id,
        type: item.type,
        text: item.text,
        meanCosine: meanCos,
        attrValues: attributions,
        attrStable,
        vectorCount: vectors.length,
        vectors,
      });

      const status = meanCos >= 0.95 ? '✅' : meanCos >= 0.90 ? '⚠️' : '❌';
      const attrIcon = attrStable ? '🟢' : '🔴';
      console.log(` cos=${meanCos.toFixed(4)} ${status}  attr=[${uniqueAttr.join(',')}] ${attrIcon}`);
    } else {
      console.log(' (벡터 부족, 스킵)');
    }
  }

  // ─── 요약 ───

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  결과 요약');
  console.log('═══════════════════════════════════════════════════════════\n');

  const directResults = results.filter(r => r.type === 'direct');
  const metaphorResults = results.filter(r => r.type === 'metaphor');

  const allCosines = results.map(r => r.meanCosine);
  const directCosines = directResults.map(r => r.meanCosine);
  const metaphorCosines = metaphorResults.map(r => r.meanCosine);

  const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  console.log(`총 API 호출: ${totalCalls} (성공: ${totalCalls - failedCalls}, 실패: ${failedCalls})`);
  console.log('');

  console.log('── 감정 벡터 코사인 유사도 (같은 텍스트 5회 간) ──');
  console.log(`  전체 평균:     ${avg(allCosines).toFixed(4)}  (σ=${stdDev(allCosines).toFixed(4)})`);
  console.log(`  직접 서술:     ${avg(directCosines).toFixed(4)}  (σ=${stdDev(directCosines).toFixed(4)})`);
  console.log(`  은유적 서술:   ${avg(metaphorCosines).toFixed(4)}  (σ=${stdDev(metaphorCosines).toFixed(4)})`);
  console.log('');

  console.log('── attribution 안정성 ──');
  const attrStableCount = results.filter(r => r.attrStable).length;
  console.log(`  일관된 텍스트: ${attrStableCount}/${results.length} (${results.length ? (attrStableCount/results.length*100).toFixed(0) : '0'}%)`);
  console.log(`  직접 서술:     ${directResults.filter(r => r.attrStable).length}/${directResults.length}`);
  console.log(`  은유적 서술:   ${metaphorResults.filter(r => r.attrStable).length}/${metaphorResults.length}`);
  console.log('');

  // 불안정한 텍스트 나열
  const unstable = results.filter(r => r.meanCosine < 0.90);
  if (unstable.length > 0) {
    console.log('── ❌ 불안정한 텍스트 (코사인 < 0.90) ──');
    for (const r of unstable) {
      console.log(`  [${r.id}] cos=${r.meanCosine.toFixed(4)} "${r.text.slice(0, 40)}..."`);
    }
    console.log('');
  }

  const borderline = results.filter(r => r.meanCosine >= 0.90 && r.meanCosine < 0.95);
  if (borderline.length > 0) {
    console.log('── ⚠️ 경계선 텍스트 (0.90 ≤ 코사인 < 0.95) ──');
    for (const r of borderline) {
      console.log(`  [${r.id}] cos=${r.meanCosine.toFixed(4)} "${r.text.slice(0, 40)}..."`);
    }
    console.log('');
  }

  // 불안정한 attribution 나열
  const attrUnstable = results.filter(r => !r.attrStable);
  if (attrUnstable.length > 0) {
    console.log('── 🔴 attribution 불일치 텍스트 ──');
    for (const r of attrUnstable) {
      console.log(`  [${r.id}] [${r.attrValues.join(', ')}] "${r.text.slice(0, 40)}..."`);
    }
    console.log('');
  }

  // ─── 판정 ───

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  판정');
  console.log('═══════════════════════════════════════════════════════════\n');

  const overallAvg = avg(allCosines);
  if (overallAvg >= 0.95) {
    console.log('  ✅ 감정 벡터 추출 안정적 (평균 ≥ 0.95)');
    console.log('  → V4 궤적 비교의 입력 신호로 사용 가능');
  } else if (overallAvg >= 0.90) {
    console.log('  ⚠️ 감정 벡터 추출 경계선 (0.90 ≤ 평균 < 0.95)');
    console.log('  → 사용 가능하나, 은유적 서술에서의 변동을 주시해야 함');
  } else {
    console.log('  ❌ 감정 벡터 추출 불안정 (평균 < 0.90)');
    console.log('  → V4 이전에 추출 파이프라인(프롬프트/모델)을 먼저 개선해야 함');
  }

  console.log('');
  console.log(`  attribution 일관성: ${results.length ? (attrStableCount/results.length*100).toFixed(0) : '0'}%`);
  if (results.length && attrStableCount / results.length < 0.6) {
    console.log('  → 이유 축(V3 reason_score) 삭제 결정이 정당화됨');
    console.log('     AI 레이블 추출이 재현 불가능한 수준');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  테스트 완료');
  console.log('═══════════════════════════════════════════════════════════');

  // JSON 결과 저장
  const fs = await import('fs');
  const path = await import('path');
  const resolvedOut = path.resolve(process.cwd(), 'tests', 'emotion_stability_results.json');
  fs.writeFileSync(resolvedOut, JSON.stringify({
    timestamp: new Date().toISOString(),
    config: { repeats: REPEATS, textCount: TEST_TEXTS.length, sceneContext: SCENE_CONTEXT },
    summary: {
      overall: { mean: overallAvg, stddev: stdDev(allCosines) },
      direct: { mean: avg(directCosines), stddev: stdDev(directCosines) },
      metaphor: { mean: avg(metaphorCosines), stddev: stdDev(metaphorCosines) },
      attrStability: results.length ? attrStableCount / results.length : 0,
    },
    results: results.map(r => ({
      id: r.id, type: r.type, text: r.text,
      meanCosine: r.meanCosine, attrValues: r.attrValues, attrStable: r.attrStable,
      vectors: r.vectors,
    })),
  }, null, 2));

  console.log(`\n결과 저장됨: ${resolvedOut}`);
}

main().catch(e => {
  console.error('치명적 오류:', e);
  process.exit(1);
});

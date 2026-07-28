// test/tools/persona_backtest.mjs
// 페르소나 리트머스 §8 — 결정적 재계산 하네스.
//
// 입력: 씬스냅샷.json + 발화코퍼스.json + 분류결과-{A,B,C}.json (전부 동결본)
// LLM·네트워크 호출 없음. 같은 입력 → 항상 같은 출력.
//
// 계산 체인 (아키타입 1명 × 기억 1개 = 가상 1회차):
//   씬을 scene_order 순으로 걷는다. 씬마다 그 씬의 발화들을 turn 순으로 흘려
//   lumen_dialog_phase1.js 의 lastUserEmotion / lastAlignment / short-affirmative
//   규칙을 그대로 재현하고, 씬이 끝나면 play-test.html:3681 의 엔진 스텝 1회를 돈다.
//
// 판단 좌표계 (설계 §3): 세 자 모두 기억 축(emotionKeys) 고정. 바꾸는 변인은 분류 축뿐.
//   → 부록으로 실전 배선(씬 anchor 우선) 도 함께 계산해 차이를 기록한다.

import fs from 'node:fs';
import path from 'node:path';
import { ByeoriEngine } from '../../js/core/ByeoriEngine.js';
import { cosineSimilarity, DEFAULT_EMOTION_ANCHORS } from '../../js/shared/math.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const EXP_DIR = path.join(ROOT, 'docs', '실험', '페르소나_리트머스-260728');
const engine = new ByeoriEngine();

const load = (f) => JSON.parse(fs.readFileSync(path.join(EXP_DIR, f), 'utf8'));

// ── 사본 구역 (모듈이 아니라 인라인이라 복사. 원본 수정 시 여기도 갱신할 것) ──

// play-test.html:2575 buildOriginalVectorFromScene + safeParseEmotion
function parseEmotion(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (_) { return {}; } }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return {};
}
function buildOriginalVector(scene) {
  return {
    base: parseEmotion(scene.original_emotion_raw),
    reason_analysis: { attribution: null, target: null, core_fear: null, is_void: false },
  };
}

// lumen_dialog_phase1.js:125 SHORT_AFFIRMATIVES + :135 _isShortAffirmative
const SHORT_AFFIRMATIVES = [
  'ㅇ', 'ㅇㅇ', 'ㅇㅇㅇ', '응', '응응', '응ㅇ', '어', '어어',
  '네', '넹', '넵', '옙', '맞', '맞아', '맞다', '맞네',
  '그래', '그러게', '그치', '그렇지', '오키', '오케이',
  'ok', 'OK', 'okay', 'yes', 'yeah',
];
function isShortAffirmative(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t.length || t.length > 4) return false;
  return SHORT_AFFIRMATIVES.indexOf(t) >= 0;
}

// lumen_dialog_phase1.js:104 _cosineSim — 두 벡터 키 합집합 (축 인자 없음)
function dialogCosine(a, b) {
  if (!a || !b) return 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    const av = Number(a[k]) || 0;
    const bv = Number(b[k]) || 0;
    dot += av * bv; na += av * av; nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ByeoriEngine.js:152 _getTransitionPattern 사본 — 대체 bucket 규칙 실험(§10)용.
// 엔진은 수정하지 않는다. 이 사본은 "LOW 문턱을 분위수로 바꾸면 패턴 분포가
// 어떻게 되는가"만 계산한다.
function transitionPatternFrom(bucket, mismatchType, level, shape, trajLen) {
  if (bucket === 'FIXATED') return 'fixation';
  if (level >= 0.5 && shape < 0.3 && trajLen >= 3) return 'displacement';
  if (bucket === 'HIGH') return 'echo_follow';
  if (bucket === 'MID') return 'bridge';
  if (bucket === 'LOW') {
    switch (mismatchType) {
      case 'void_mismatch': return 'avoidance';
      case 'target_displacement': return 'displacement';
      case 'emotion_mismatch': return 'contradiction';
      case 'attribution_mismatch': return 'contradiction';
      default: return 'bridge';
    }
  }
  return null;
}

// ── 자가 검사: 기억별_좌표계 §1 극단 최소쌍 ──
function selfCheck() {
  const user = { longing: 0.7, sadness: 0.4 };
  const orig = { longing: 0.7, sadness: 0.4, confusion: 0.3 };
  const AX11 = ['anger', 'confusion', 'emptiness', 'fear', 'guilt', 'isolation', 'joy', 'longing', 'numbness', 'sadness', 'shame'];
  const c17 = cosineSimilarity(user, orig, DEFAULT_EMOTION_ANCHORS);
  const c11 = cosineSimilarity(user, orig, AX11);
  const ok = Math.abs(c17 - 1.0) < 0.001 && Math.abs(c11 - 0.937) < 0.001;
  console.log(`[자가검사] 17축 ${c17.toFixed(3)} (기대 1.000) / 기억축 11 ${c11.toFixed(3)} (기대 0.937) → ${ok ? 'OK' : '결함'}`);
  if (!ok) { console.error('하네스 결함 — 설계 §8 검증 앵커 불일치. 중단.'); process.exit(1); }
}

// ── 회차 시뮬 ──
function runSession(ruler, archetype, memory, scenes, utterances, classMap, opts = {}) {
  const useSceneAnchorForJudge = !!opts.useSceneAnchorForJudge;
  const orig0 = null;
  let lastUserEmotion = null;
  let lastAlignment = 0;
  let previousBucket = null;
  const emotionHistory = [];
  const userTrajectory = [];
  const originalTrajectory = [];
  const sceneScores = [];
  const steps = [];
  const turnLog = [];

  for (const scene of scenes) {
    const origVector = buildOriginalVector(scene);
    const origEmotion = origVector.base;
    const sceneUtts = utterances
      .filter((u) => u.scene_id === scene.scene_id && u.archetype === archetype)
      .sort((a, b) => a.turn - b.turn);

    for (const u of sceneUtts) {
      let userEmo, alignment, via;
      if (isShortAffirmative(u.text)) {
        userEmo = lastUserEmotion || origEmotion;
        alignment = Math.max(lastAlignment, 0.7);
        via = 'short_affirmative';
      } else {
        const c = classMap.get(u.id);
        userEmo = c && c.vector ? c.vector : null;
        alignment = userEmo ? dialogCosine(userEmo, origEmotion) : 0.5;
        via = userEmo ? 'classified' : 'missing';
        if (alignment === 0) {
          alignment = lastAlignment > 0 ? lastAlignment : 0.5;
          via += '+zero_fallback';
        }
      }
      lastAlignment = alignment;
      if (userEmo && Object.keys(userEmo).length) lastUserEmotion = userEmo;
      turnLog.push({
        utterance_id: u.id, scene_order: scene.scene_order, turn: u.turn,
        via, dialog_alignment: +alignment.toFixed(4),
      });
    }

    if (!lastUserEmotion) continue; // no user emotion — 실전도 스킵

    const input = {
      userVector: { base: lastUserEmotion, reason_analysis: { is_void: false, attribution: null, target: null, core_fear: null } },
      originalVector: origVector,
      anchorEmotions: useSceneAnchorForJudge ? (scene.anchor_emotions || null) : null,
      userTrajectory: [...userTrajectory],
      originalTrajectory: [...originalTrajectory],
      sceneScores: [...sceneScores],
      emotionKeys: memory.memory_axes,
    };
    const r = engine.calculateStep(input, { previousBucket, emotionHistory: [...emotionHistory] });

    previousBucket = r.alignment_bucket;
    emotionHistory.push({ ...lastUserEmotion });
    userTrajectory.push({ ...lastUserEmotion });
    originalTrajectory.push({ ...(origVector.base || {}) });
    sceneScores.push(r.current_scene_score || 0);

    steps.push({
      scene_order: scene.scene_order,
      alignment: +r.alignment_score.toFixed(4),
      bucket: r.alignment_bucket,
      pattern: r.transition_pattern,
      mismatch: r.mismatch_type,
      scene_score: +(r.current_scene_score || 0).toFixed(4),
      level: +r.debug.level.toFixed(4),
      shape: +r.debug.shape.toFixed(4),
      dialog_alignment: +lastAlignment.toFixed(4),
    });
  }
  return { ruler, archetype, memory_code: memory.code, steps, turns: turnLog };
}

// ── 집계 ──
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const counts = (xs) => xs.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {});

function summarize(sessions) {
  const byArchetype = {};
  for (const s of sessions) {
    const a = (byArchetype[s.archetype] ||= { alignments: [], patterns: [], buckets: [], byMemory: {} });
    const al = s.steps.map((x) => x.alignment);
    a.alignments.push(...al);
    a.patterns.push(...s.steps.map((x) => x.pattern));
    a.buckets.push(...s.steps.map((x) => x.bucket));
    a.byMemory[s.memory_code] = {
      alignment_median: median(al),
      patterns: counts(s.steps.map((x) => x.pattern)),
    };
  }
  const out = {};
  for (const [k, v] of Object.entries(byArchetype)) {
    out[k] = {
      n_steps: v.alignments.length,
      alignment_median: +median(v.alignments).toFixed(4),
      alignment_q25: +quantile(v.alignments, 0.25).toFixed(4),
      alignment_q75: +quantile(v.alignments, 0.75).toFixed(4),
      alignment_min: +Math.min(...v.alignments).toFixed(4),
      alignment_max: +Math.max(...v.alignments).toFixed(4),
      patterns: counts(v.patterns),
      buckets: counts(v.buckets),
      by_memory: v.byMemory,
    };
  }
  return out;
}

function main() {
  selfCheck();
  const snap = load('씬스냅샷.json');
  const corpus = load('발화코퍼스.json');
  const memByCode = new Map(snap.memories.map((m) => [m.code, m]));
  const scenesByCode = {};
  for (const s of snap.scenes) (scenesByCode[s.code] ||= []).push(s);
  for (const k of Object.keys(scenesByCode)) scenesByCode[k].sort((a, b) => a.scene_order - b.scene_order);

  const archetypes = ['echo_follow', 'bridge', 'contradiction', 'displacement', 'avoidance', 'fixation'];
  const rulers = ['A', 'B', 'C'];
  const all = {};

  for (const ruler of rulers) {
    const cls = load(`분류결과-${ruler}.json`);
    const classMap = new Map(cls.results.map((r) => [r.utterance_id, r]));
    const sessions = [];
    const sessionsRealWiring = [];
    for (const archetype of archetypes) {
      for (const code of Object.keys(scenesByCode)) {
        const memory = memByCode.get(code);
        sessions.push(runSession(ruler, archetype, memory, scenesByCode[code], corpus.utterances, classMap));
        sessionsRealWiring.push(runSession(ruler, archetype, memory, scenesByCode[code], corpus.utterances, classMap, { useSceneAnchorForJudge: true }));
      }
    }
    const payload = {
      meta: {
        created: '260728', ruler,
        judge_frame: '기억 축 고정 (설계 §3 — 변인은 분류 축뿐)',
        appendix: '판단_실전배선 = 씬 anchor 우선 (현행 코드 재현)',
        missing_rate: cls.meta.missing_rate,
        reused_from_B: cls.meta.reused_from_B,
      },
      sessions,
      sessions_real_wiring: sessionsRealWiring,
      summary: summarize(sessions),
      summary_real_wiring: summarize(sessionsRealWiring),
    };
    fs.writeFileSync(path.join(EXP_DIR, `결과-${ruler}.json`), JSON.stringify(payload, null, 1), 'utf8');
    all[ruler] = payload;
    console.log(`저장: 결과-${ruler}.json`);
  }

  // ── 요약 표 ──
  console.log('\n== 아키타입 × 자 → 정렬 중앙값 (판단=기억 축 고정) ==');
  console.log('아키타입'.padEnd(14), 'A(현행)'.padEnd(10), 'B(수술안)'.padEnd(10), 'C(17축)');
  for (const a of archetypes) {
    const row = rulers.map((r) => (all[r].summary[a] ? all[r].summary[a].alignment_median.toFixed(3) : '—'));
    console.log(a.padEnd(14), row[0].padEnd(10), row[1].padEnd(10), row[2]);
  }
  console.log('\n== 패턴 분포 (자 B) ==');
  for (const a of archetypes) console.log(a.padEnd(14), JSON.stringify(all.B.summary[a].patterns));
  console.log('\n== 패턴 분포 (자 A) ==');
  for (const a of archetypes) console.log(a.padEnd(14), JSON.stringify(all.A.summary[a].patterns));

  // ── 리트머스 판정 (§9) ──
  const verdicts = [];
  const medB = (a) => all.B.summary[a].alignment_median;
  const medA = (a) => all.A.summary[a].alignment_median;
  const patB = (a) => all.B.summary[a].patterns;

  verdicts.push({
    id: 'L1', 조건: '자 B에서 대립자 정렬 중앙값 ≥ 공명자 정렬 중앙값',
    측정: `대립 ${medB('contradiction').toFixed(3)} vs 공명 ${medB('echo_follow').toFixed(3)}`,
    위반: medB('contradiction') >= medB('echo_follow'),
  });
  verdicts.push({
    id: 'L2', 조건: '자 B에서 대립자 회차의 contradiction 패턴 = 0',
    측정: `contradiction ${patB('contradiction').contradiction || 0}회 / ${all.B.summary.contradiction.n_steps}스텝`,
    위반: !(patB('contradiction').contradiction > 0),
  });
  verdicts.push({
    id: 'L3', 조건: '자 A에서 L1이 통과됨(=병명 재현 실패)',
    측정: `A: 대립 ${medA('contradiction').toFixed(3)} vs 공명 ${medA('echo_follow').toFixed(3)}`,
    위반: medA('contradiction') < medA('echo_follow'),
  });
  const avoidTurns = all.B.sessions.filter((s) => s.archetype === 'avoidance').flatMap((s) => s.turns);
  const shortRate = avoidTurns.filter((t) => t.via === 'short_affirmative').length / avoidTurns.length;
  verdicts.push({
    id: 'L4', 조건: '회피자 발화의 short-affirmative 우회 발동률 > 30%',
    측정: `${(shortRate * 100).toFixed(1)}% (${avoidTurns.filter((t) => t.via === 'short_affirmative').length}/${avoidTurns.length})`,
    위반: shortRate > 0.30,
  });
  verdicts.push({
    id: 'L5', 조건: '자 B에서 공명자가 HIGH 상실 (A 대비 급락해 MID 아래)',
    측정: `공명자 B ${medB('echo_follow').toFixed(3)} vs A ${medA('echo_follow').toFixed(3)} (MID 하한 0.10)`,
    위반: medB('echo_follow') < 0.10 && medB('echo_follow') < medA('echo_follow'),
  });

  console.log('\n== 리트머스 판정 (실패 조건 — 위반 시 ✗) ==');
  for (const v of verdicts) console.log(`${v.id} ${v.위반 ? '✗ 위반' : '○ 통과'} — ${v.조건}\n     측정: ${v.측정}`);

  // ── 잠정 문턱 (§10) ──
  const allB = all.B.sessions.flatMap((s) => s.steps.map((x) => x.alignment));
  const thresholds = {
    n: allB.length,
    q10: +quantile(allB, 0.10).toFixed(4),
    q25: +quantile(allB, 0.25).toFixed(4),
    q50: +quantile(allB, 0.50).toFixed(4),
    q75: +quantile(allB, 0.75).toFixed(4),
    q90: +quantile(allB, 0.90).toFixed(4),
    현행_HIGH_0_50_이상_비율: +(allB.filter((x) => x >= 0.5).length / allB.length).toFixed(4),
    현행_LOW_0_10_미만_비율: +(allB.filter((x) => x < 0.1).length / allB.length).toFixed(4),
    딱지: '잠정 — 페르소나 분포 기반. 알파 실관객 3회차 분포로 재추정.',
  };
  console.log('\n== 자 B 전체 정렬 분포 (잠정 문턱 재료) ==');
  console.log(JSON.stringify(thresholds, null, 1));

  // ── 대체 LOW 규칙(하위 분위수) 적용 시 패턴 분포 (§10 교체안 재료) ──
  const lowCut = thresholds.q25;
  const highCut = thresholds.q75;
  const altPatterns = {};
  for (const s of all.B.sessions) {
    let prev = null;
    for (const st of s.steps) {
      let bucket;
      if (prev === 'HIGH' && st.alignment >= highCut * 0.8) bucket = 'HIGH';
      else if (prev === 'LOW' && st.alignment <= lowCut) bucket = 'LOW';
      else if (st.alignment >= highCut) bucket = 'HIGH';
      else if (st.alignment < lowCut) bucket = 'LOW';
      else bucket = 'MID';
      prev = bucket;
      const p = transitionPatternFrom(bucket, st.mismatch, st.level, st.shape, 3);
      const a = (altPatterns[s.archetype] ||= {});
      a[p] = (a[p] || 0) + 1;
    }
  }
  console.log(`\n== 대체 문턱(LOW<q25=${lowCut}, HIGH≥q75=${highCut}) 적용 시 패턴 분포 (자 B) ==`);
  for (const a of archetypes) console.log(a.padEnd(14), JSON.stringify(altPatterns[a] || {}));

  fs.writeFileSync(path.join(EXP_DIR, '판정.json'), JSON.stringify({
    verdicts, thresholds, alt_threshold_patterns: altPatterns,
    alt_cuts: { low: lowCut, high: highCut },
  }, null, 1), 'utf8');
  console.log('\n저장: 판정.json');
}

main();

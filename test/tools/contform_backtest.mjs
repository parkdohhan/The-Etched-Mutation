// test/tools/contform_backtest.mjs
// 이어받기 형식 리트머스 §6·§7 — 결정적 재계산 + 베이스라인(자유 대화, 결과-A-v3) 비교.
//
// 설계 정본: docs/실험/이어받기형식_리트머스_설계-260730.md
// 계산 체인 = persona_backtest.mjs 와 동일 (사본 구역 주석 승계). LLM·네트워크 0회.
// 추가: 턴 코사인(접촉 판정과 동형) 집계 + 자유 대화 대비 이동량 + 분위수 맞춤 문턱.
//
// 비교의 짝: 결과-A-v3 의 sessions_real_wiring (판단=씬 anchor 우선, 현행 코드 재현)
//   vs 본 실험 sessions_real_wiring. 판단 좌표계를 실전과 동일하게 맞춘 비교다.
//   (기억 축 고정 프레임도 함께 산출·저장 — 부록.)

import fs from 'node:fs';
import path from 'node:path';
import { ByeoriEngine } from '../../js/core/ByeoriEngine.js';
import { cosineSimilarity, DEFAULT_EMOTION_ANCHORS } from '../../js/shared/math.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BASE_DIR = path.join(ROOT, 'docs', '실험', '페르소나_리트머스-260728');
const EXP_DIR = path.join(ROOT, 'docs', '실험', '이어받기_리트머스-260730');
const engine = new ByeoriEngine();

const loadBase = (f) => JSON.parse(fs.readFileSync(path.join(BASE_DIR, f), 'utf8'));
const loadExp = (f) => JSON.parse(fs.readFileSync(path.join(EXP_DIR, f), 'utf8'));

// ── 사본 구역 (persona_backtest.mjs 와 동일 — 원본 수정 시 양쪽 갱신) ──
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

function selfCheck() {
  const user = { longing: 0.7, sadness: 0.4 };
  const orig = { longing: 0.7, sadness: 0.4, confusion: 0.3 };
  const AX11 = ['anger', 'confusion', 'emptiness', 'fear', 'guilt', 'isolation', 'joy', 'longing', 'numbness', 'sadness', 'shame'];
  const c17 = cosineSimilarity(user, orig, DEFAULT_EMOTION_ANCHORS);
  const c11 = cosineSimilarity(user, orig, AX11);
  const ok = Math.abs(c17 - 1.0) < 0.001 && Math.abs(c11 - 0.937) < 0.001;
  console.log(`[자가검사] 17축 ${c17.toFixed(3)} / 기억축11 ${c11.toFixed(3)} → ${ok ? 'OK' : '결함'}`);
  if (!ok) process.exit(1);
}

// ── 회차 시뮬 (이어받기: 씬당 1발화, short-affirmative 경로는 연결사 접두 탓에 사실상 미발동) ──
function runSession(archetype, memory, scenes, utterances, classMap, opts = {}) {
  const useSceneAnchorForJudge = !!opts.useSceneAnchorForJudge;
  let lastUserEmotion = null;
  let lastAlignment = 0;
  let lastReasonAnalysis = null;
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
    const sceneUtts = utterances.filter(
      (u) => u.memory_code === scene.code && u.scene_order === scene.scene_order && u.archetype === archetype
    );

    for (const u of sceneUtts) {
      const c = classMap.get(u.id);
      const userEmo = c && c.vector ? c.vector : null;
      if (c && c.reason_analysis) lastReasonAnalysis = c.reason_analysis;
      let alignment = userEmo ? dialogCosine(userEmo, origEmotion) : 0.5;
      let via = userEmo ? 'classified' : 'missing';
      if (alignment === 0) {
        alignment = lastAlignment > 0 ? lastAlignment : 0.5;
        via += '+zero_fallback';
      }
      lastAlignment = alignment;
      if (userEmo && Object.keys(userEmo).length) lastUserEmotion = userEmo;
      turnLog.push({
        utterance_id: u.id, scene_order: scene.scene_order, connective: u.connective,
        via, dialog_alignment: +alignment.toFixed(4),
      });
    }

    if (!lastUserEmotion) continue;

    const input = {
      userVector: { base: lastUserEmotion, reason_analysis: { is_void: !!(lastReasonAnalysis && lastReasonAnalysis.is_void), attribution: null, target: null, core_fear: null } },
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
  return { archetype, memory_code: memory.code, steps, turns: turnLog };
}

// ── 집계 도구 ──
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
    const a = (byArchetype[s.archetype] ||= { alignments: [], patterns: [], buckets: [] });
    a.alignments.push(...s.steps.map((x) => x.alignment));
    a.patterns.push(...s.steps.map((x) => x.pattern));
    a.buckets.push(...s.steps.map((x) => x.bucket));
  }
  const out = {};
  for (const [k, v] of Object.entries(byArchetype)) {
    out[k] = {
      n_steps: v.alignments.length,
      alignment_median: +median(v.alignments).toFixed(4),
      patterns: counts(v.patterns),
      buckets: counts(v.buckets),
    };
  }
  return out;
}

// 턴 코사인 집계 — 접촉(≥0.85, 회차당 최대 1회)과 동형
function contactStats(sessions, threshold = 0.85) {
  const allTurns = sessions.flatMap((s) => s.turns.map((t) => t.dialog_alignment));
  const over = allTurns.filter((x) => x >= threshold).length;
  const sessionsWithContact = sessions.filter((s) => s.turns.some((t) => t.dialog_alignment >= threshold)).length;
  return {
    n_turns: allTurns.length,
    turn_rate_over: +(over / allTurns.length).toFixed(4),
    n_sessions: sessions.length,
    session_rate_over: +(sessionsWithContact / sessions.length).toFixed(4),
    turn_median: +median(allTurns).toFixed(4),
    turn_q90: +quantile(allTurns, 0.90).toFixed(4),
    turn_q95: +quantile(allTurns, 0.95).toFixed(4),
    all: allTurns,
  };
}

function main() {
  selfCheck();
  // 260730 저녁: --suffix v2 = 도출 지문 재실행분 재계산. 무접미사 v1 산출물 동결 유지.
  const argv = process.argv.slice(2);
  const sfx = argv.includes('--suffix') ? `-${argv[argv.indexOf('--suffix') + 1]}` : '';
  // 260730 자 수술 3차: --postop = 분류결과·출력 파일만 -postop 접미 (코퍼스·지문은 v2 그대로)
  const postop = argv.includes('--postop') ? '-postop' : '';
  const snap = loadBase('씬스냅샷.json');
  const corpus = loadExp(`이어받기코퍼스${sfx}.json`);
  const cls = loadExp(`분류결과-cont${sfx}${postop}.json`);
  const classMap = new Map(cls.results.map((r) => [r.utterance_id, r]));
  const memByCode = new Map(snap.memories.map((m) => [m.code, m]));
  const scenesByCode = {};
  for (const s of snap.scenes) (scenesByCode[s.code] ||= []).push(s);
  for (const k of Object.keys(scenesByCode)) scenesByCode[k].sort((a, b) => a.scene_order - b.scene_order);

  const archetypes = ['echo_follow', 'bridge', 'contradiction', 'displacement', 'avoidance', 'fixation'];
  const sessions = [];
  const sessionsRealWiring = [];
  for (const archetype of archetypes) {
    for (const code of Object.keys(scenesByCode)) {
      const memory = memByCode.get(code);
      sessions.push(runSession(archetype, memory, scenesByCode[code], corpus.utterances, classMap));
      sessionsRealWiring.push(runSession(archetype, memory, scenesByCode[code], corpus.utterances, classMap, { useSceneAnchorForJudge: true }));
    }
  }

  // ── 베이스라인 (자유 대화, 동일 분류기 세대) ──
  const baseline = loadBase('결과-A-v3.json');
  const baseRW = baseline.sessions_real_wiring;
  const baseSummaryRW = baseline.summary_real_wiring;

  const contCS = contactStats(sessionsRealWiring);
  const freeCS = contactStats(baseRW);

  // 분위수 맞춤 문턱: 자유 대화에서 P(코사인 ≥ 0.85) = p 였다면,
  // 이어받기 분포에서 같은 초과율 p 를 주는 문턱 q 를 찾는다.
  const p = freeCS.turn_rate_over;
  const q = +quantile(contCS.all, 1 - p).toFixed(4);

  const summaryRW = summarize(sessionsRealWiring);
  const summaryMem = summarize(sessions);

  // ── M1~M5 ──
  const M = [];
  M.push({
    id: 'M1', 항목: '아키타입 분리 유지 (대립 < 공명, 실전 배선)',
    측정: `대립 ${summaryRW.contradiction.alignment_median} vs 공명 ${summaryRW.echo_follow.alignment_median}`,
    위반: summaryRW.contradiction.alignment_median >= summaryRW.echo_follow.alignment_median,
  });
  const shifts = {};
  for (const a of archetypes) {
    const c = summaryRW[a] ? summaryRW[a].alignment_median : null;
    const f = baseSummaryRW[a] ? baseSummaryRW[a].alignment_median : null;
    shifts[a] = { free: f, cont: c, delta: c != null && f != null ? +(c - f).toFixed(4) : null };
  }
  M.push({ id: 'M2', 항목: '정렬 분포 이동량 (cont − free, 실전 배선)', 측정: shifts, 위반: null });
  M.push({
    id: 'M3', 항목: '접촉 희소성 (턴 코사인 ≥0.85)',
    측정: {
      free: { turn_rate: freeCS.turn_rate_over, session_rate: freeCS.session_rate_over, turn_median: freeCS.turn_median },
      cont: { turn_rate: contCS.turn_rate_over, session_rate: contCS.session_rate_over, turn_median: contCS.turn_median },
      분위수맞춤문턱: q, 딱지: '잠정 — 페르소나 분포. 알파 실관객 분포로 재추정.',
    },
    위반: contCS.turn_rate_over > freeCS.turn_rate_over * 3,
  });
  const contPatterns = {};
  for (const a of archetypes) contPatterns[a] = summaryRW[a] ? summaryRW[a].patterns : {};
  const contradictionReach = Object.values(contPatterns).reduce((s, p2) => s + (p2.contradiction || 0), 0);
  const avoidanceReach = Object.values(contPatterns).reduce((s, p2) => s + (p2.avoidance || 0), 0);
  M.push({
    id: 'M4', 항목: '패턴 도달성 (contradiction·avoidance 사멸 여부)',
    측정: { contradiction: contradictionReach, avoidance: avoidanceReach, 패턴분포: contPatterns },
    위반: contradictionReach === 0 || avoidanceReach === 0,
  });
  const connByArch = {};
  for (const u of corpus.utterances) {
    const a = (connByArch[u.archetype] ||= {});
    a[u.connective] = (a[u.connective] || 0) + 1;
  }
  M.push({ id: 'M5', 항목: '연결사 × 아키타입 (관찰만 — Δ 서명 가설 첫 데이터)', 측정: connByArch, 위반: null });

  // ── 저장 ──
  const { all: _f, ...freeCSslim } = freeCS;
  const { all: _c, ...contCSslim } = contCS;
  fs.writeFileSync(path.join(EXP_DIR, `결과-cont${sfx}${postop}.json`), JSON.stringify({
    meta: {
      created: '260730',
      judge_frames: ['기억 축 고정 (부록)', '실전 배선 (씬 anchor 우선) — 비교 정본'],
      baseline: '페르소나_리트머스-260728/결과-A-v3.json (자유 대화, 동일 분류기 세대)',
      missing_rate: cls.meta.missing_rate,
    },
    sessions, sessions_real_wiring: sessionsRealWiring,
    summary_memory_axes: summaryMem, summary_real_wiring: summaryRW,
    contact: { free: freeCSslim, cont: contCSslim, matched_threshold: q },
    observations: M,
  }, null, 1), 'utf8');
  console.log('저장: 결과-cont.json');

  // ── 콘솔 요약 ──
  console.log('\n== 아키타입별 정렬 중앙값 (실전 배선): free → cont (Δ) ==');
  for (const a of archetypes) {
    const s = shifts[a];
    console.log(a.padEnd(14), `${s.free?.toFixed(3) ?? '—'} → ${s.cont?.toFixed(3) ?? '—'}`, s.delta != null ? `(Δ ${s.delta >= 0 ? '+' : ''}${s.delta.toFixed(3)})` : '');
  }
  console.log('\n== 접촉 (턴 코사인 ≥0.85) ==');
  console.log(`free: 턴 초과율 ${(freeCS.turn_rate_over * 100).toFixed(1)}% · 회차 발생률 ${(freeCS.session_rate_over * 100).toFixed(1)}% · 턴 중앙값 ${freeCS.turn_median}`);
  console.log(`cont: 턴 초과율 ${(contCS.turn_rate_over * 100).toFixed(1)}% · 회차 발생률 ${(contCS.session_rate_over * 100).toFixed(1)}% · 턴 중앙값 ${contCS.turn_median}`);
  console.log(`분위수 맞춤 문턱 (free 희소성 유지): ${q} [잠정]`);
  console.log('\n== 패턴 분포 (cont, 실전 배선) ==');
  for (const a of archetypes) console.log(a.padEnd(14), JSON.stringify(contPatterns[a]));
  console.log('\n== 관찰 판정 ==');
  for (const m of M) if (m.위반 !== null) console.log(`${m.id} ${m.위반 ? '✗ 위반' : '○ 통과'} — ${m.항목}`);
}

main();

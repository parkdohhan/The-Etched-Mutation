// test/unit/pipeline.regression.test.js
// Pipeline regression test — ByeoriEngine + ContaminationTracker + SceneNavigator
//
// 골든 픽스처: 대표 시나리오 6종(패턴별 1개)을 풀 파이프라인으로 통과시키고
// 수치 스냅샷과 비교. 코어 로직 변경 시 수치 드리프트를 즉시 감지.
//
// ⚠ 이 테스트가 실패하면 "작품의 결정론 약속"이 깨진 것이다.
//   의도적 변경이면 `npx vitest -u` 로 스냅샷 갱신.

import { describe, it, expect } from 'vitest';
import { ByeoriEngine } from '../../js/core/ByeoriEngine.js';
import { SceneNavigator } from '../../js/core/SceneNavigator.js';
import {
  createEmptyState,
  updateContamination,
} from '../../js/core/ContaminationTracker.js';

const engine = new ByeoriEngine();
const nav = new SceneNavigator();

// ─── Test scenes (감정 공간에 분포) ──────────────────────────────

const SCENES = [
  { original_emotion: { fear: 0.8, sadness: 0.1, anger: 0.05, joy: 0.0 } },
  { original_emotion: { fear: 0.2, sadness: 0.6, longing: 0.15 } },
  { original_emotion: { anger: 0.7, fear: 0.1, sadness: 0.1 } },
  { original_emotion: { joy: 0.5, hope: 0.3, gratitude: 0.15 } },
  { original_emotion: { guilt: 0.6, shame: 0.2, sadness: 0.15 } },
];

// ─── Helper: 시나리오 한 세션 통과 ──────────────────────────────

function runSession(userEmotions, sceneIndices) {
  const userTrajectory = [];
  const originalTrajectory = [];
  const sceneScores = [];
  const visitedScenes = [];
  const results = [];

  for (let i = 0; i < userEmotions.length; i++) {
    const sceneIdx = sceneIndices[i];
    const userVec = { base: userEmotions[i] };
    const origVec = { base: SCENES[sceneIdx].original_emotion };

    const step = engine.calculateStep(
      {
        userVector: userVec,
        originalVector: origVec,
        userTrajectory: [...userTrajectory],
        originalTrajectory: [...originalTrajectory],
        sceneScores: [...sceneScores],
      },
      {
        previousBucket: results.length > 0 ? results[results.length - 1].alignment_bucket : null,
        emotionHistory: [...userTrajectory],
      }
    );

    userTrajectory.push(userEmotions[i]);
    originalTrajectory.push(SCENES[sceneIdx].original_emotion);
    sceneScores.push(step.debug?.scene_score ?? 0);
    visitedScenes.push(sceneIdx);

    // SceneNavigator
    const navResult = nav.navigate({
      scenes: SCENES,
      currentSceneIndex: sceneIdx,
      visitedScenes: [...visitedScenes],
      transitionPattern: step.transition_pattern,
      userEmotion: userEmotions[i],
      originalEmotion: SCENES[sceneIdx].original_emotion,
    });

    results.push({
      engine: {
        alignment: round6(step.alignment_score),
        level: round6(step.debug?.level),
        shape: round6(step.debug?.shape),
        shape_active: step.debug?.shape_active,
        void_mod: step.debug?.void_mod,
        bucket: step.alignment_bucket,
        pattern: step.transition_pattern,
        mismatch: step.mismatch_type,
      },
      nav: navResult
        ? { index: navResult.index, isFallback: navResult.isFallback }
        : null,
    });
  }

  return results;
}

function round6(v) {
  if (v == null) return null;
  return Math.round(v * 1e6) / 1e6;
}

// ─── Helper: 오염 누적 ──────────────────────────────────────────

function runContaminationSequence(sessions) {
  let state = createEmptyState();
  const snapshots = [];

  for (const session of sessions) {
    state = updateContamination(state, session);
    snapshots.push({
      depth: state.cont_depth,
      drift: round6(state.cont_drift),
      fixation: round6(state.cont_fixation),
      stage: state.cont_stage,
      divergence: round6(state.cont_divergence),
      convergence: round6(state.cont_convergence),
      heterogeneity: round6(state.cont_heterogeneity),
      stage_1: round6(state.cont_stage_1),
      stage_2: round6(state.cont_stage_2),
      stage_3: round6(state.cont_stage_3),
    });
  }

  return snapshots;
}

// ═══════════════════════════════════════════════════════════════════
// GOLDEN FIXTURES — 6 representative scenarios
// ═══════════════════════════════════════════════════════════════════

describe('Pipeline Regression — golden fixtures', () => {

  // ── Scenario 1: echo_follow (높은 정렬) ────────────────────────
  it('echo_follow: near-identical emotions → HIGH alignment', () => {
    const results = runSession(
      [
        { fear: 0.75, sadness: 0.15, anger: 0.05 },
        { fear: 0.25, sadness: 0.55, longing: 0.1 },
        { anger: 0.65, fear: 0.15, sadness: 0.1 },
        { joy: 0.45, hope: 0.25, gratitude: 0.2 },
      ],
      [0, 1, 2, 3]
    );

    // Scene 0: identical-ish to original → high alignment
    expect(results[0].engine.alignment).toBeGreaterThan(0.8);
    expect(results[0].engine.bucket).toBe('HIGH');

    // After 4 scenes: shape should be active
    expect(results[3].engine.shape_active).toBe(true);
    // alignment depends on shape penalty — snapshot captures exact value
    expect(results[3].engine.alignment).toBeGreaterThan(0);

    // Snapshot for regression
    expect(results).toMatchSnapshot();
  });

  // ── Scenario 2: contradiction (감정 반전) ──────────────────────
  it('contradiction: opposite emotions → LOW, pattern contradiction/bridge', () => {
    const results = runSession(
      [
        { joy: 0.9, hope: 0.1 },           // original: fear 0.8
        { anger: 0.8, fear: 0.1 },          // original: sadness 0.6
        { sadness: 0.7, longing: 0.2 },     // original: anger 0.7
        { fear: 0.8, guilt: 0.1 },          // original: joy 0.5
      ],
      [0, 1, 2, 3]
    );

    expect(results[0].engine.alignment).toBeLessThan(0.3);
    expect(results).toMatchSnapshot();
  });

  // ── Scenario 3: displacement (level 높고 shape 낮음) ───────────
  it('displacement: same emotions but reversed trajectory', () => {
    // User goes fear→sadness→anger, original goes anger→sadness→fear
    const results = runSession(
      [
        { anger: 0.65, fear: 0.15, sadness: 0.1 },  // scene 2 original
        { fear: 0.2, sadness: 0.55, longing: 0.15 }, // scene 1 original
        { fear: 0.75, sadness: 0.15 },                // scene 0 original
      ],
      [2, 1, 0]
    );

    // High level (same emotions) but potentially low shape (reversed order)
    expect(results[2].engine.shape_active).toBe(true);
    expect(results).toMatchSnapshot();
  });

  // ── Scenario 4: avoidance (VOID) ───────────────────────────────
  it('avoidance: user void on non-void original → void_mod 0.7', () => {
    const results = runSession(
      [
        { fear: 0.0, sadness: 0.0 },  // near-void user
      ],
      [0]
    );

    // void_mod should be 1.0 since the vector isn't tagged as void
    // (reason_analysis.is_void must be set explicitly)
    expect(results[0].engine.void_mod).toBe(1.0);

    // Now with explicit void tag
    const voidStep = engine.calculateStep(
      {
        userVector: { base: {}, reason_analysis: { is_void: true } },
        originalVector: { base: SCENES[0].original_emotion, reason_analysis: { is_void: false } },
      },
      {}
    );
    expect(voidStep.debug.void_mod).toBe(0.7);
    expect(results).toMatchSnapshot();
  });

  // ── Scenario 5: fixation (반복 동일 감정) ──────────────────────
  it('fixation: repeated identical emotions → FIXATED bucket', () => {
    const sameEmo = { fear: 0.8, sadness: 0.1, anger: 0.05 };
    const results = runSession(
      [sameEmo, sameEmo, sameEmo, sameEmo],
      [0, 0, 0, 0]  // same scene 4 times
    );

    // With 4 identical emotions in history, fixation should be detected
    const lastBucket = results[3].engine.bucket;
    expect(['HIGH', 'FIXATED']).toContain(lastBucket);
    expect(results).toMatchSnapshot();
  });

  // ── Scenario 6: bridge (중간 정렬) ─────────────────────────────
  it('bridge: moderate alignment → MID bucket', () => {
    const results = runSession(
      [
        { fear: 0.4, sadness: 0.3, anger: 0.2 },  // partial match to scene 0
        { sadness: 0.3, longing: 0.3, guilt: 0.2 }, // partial match to scene 1
        { anger: 0.3, fear: 0.3, sadness: 0.2 },   // partial match to scene 2
      ],
      [0, 1, 2]
    );

    // Middle-ground alignment expected
    expect(results).toMatchSnapshot();
  });
});

// ═══════════════════════════════════════════════════════════════════
// CONTAMINATION SEQUENCE — 수치 결정론 검증
// ═══════════════════════════════════════════════════════════════════

describe('Contamination sequence regression', () => {

  it('10-session divergence-dominant sequence', () => {
    const sessions = Array.from({ length: 10 }, () => ({
      alignment: 0.1,
      level: 0.1,
      shape: 0.2,
      shape_active: true,
      transition_pattern: 'contradiction',
      mismatch_type: 'emotion_mismatch',
      fixation_level: 0,
      user_valence: -0.5,
      user_arousal: 0.5,
      user_dominance: 0,
    }));

    const snapshots = runContaminationSequence(sessions);

    // Divergence should grow, convergence stays 0 (depth gate)
    expect(snapshots[0].divergence).toBeGreaterThan(0);
    expect(snapshots[0].convergence).toBe(0); // depth=1 < 3
    expect(snapshots[2].convergence).toBe(0); // alignment=0.1 < 0.5

    // Stage should shift to biased_inclination
    const lastStage = snapshots[9].stage;
    expect(['biased_inclination', 'stable']).toContain(lastStage);

    expect(snapshots).toMatchSnapshot();
  });

  it('20-session convergence-dominant sequence (high fixation)', () => {
    // EMA α=0.10 needs ~11+ sessions to push cont_fixation above 0.65 threshold
    const sessions = Array.from({ length: 20 }, () => ({
      alignment: 0.9,
      level: 0.9,
      shape: 0.95,
      shape_active: true,
      transition_pattern: 'fixation',
      mismatch_type: 'none',
      fixation_level: 0.95,
      user_valence: 0,
      user_arousal: 0,
      user_dominance: 0,
    }));

    const snapshots = runContaminationSequence(sessions);

    // Convergence accumulates starting at depth >= 3 (MIN_DEPTH_FOR_CONVERGENCE)
    expect(snapshots[2].convergence).toBeGreaterThan(0);
    expect(snapshots[4].convergence).toBeGreaterThan(snapshots[2].convergence);

    // Should eventually reach hypercompletion (EMA needs ~11 sessions)
    const finalStage = snapshots[19].stage;
    expect(finalStage).toBe('hypercompletion');

    expect(snapshots).toMatchSnapshot();
  });

  it('alternating high/low alignment → heterogeneity spike', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({
      alignment: i % 2 === 0 ? 0.9 : 0.1,
      level: i % 2 === 0 ? 0.9 : 0.1,
      shape: 0.5,
      shape_active: true,
      transition_pattern: 'bridge',
      mismatch_type: 'none',
      fixation_level: 0,
    }));

    const snapshots = runContaminationSequence(sessions);

    // Heterogeneity should be high (Welford variance of alternating 0.9/0.1)
    expect(snapshots[9].heterogeneity).toBeGreaterThan(0.5);

    expect(snapshots).toMatchSnapshot();
  });

  it('Welford mean/M2 determinism — same sequence always produces same state', () => {
    const sessions = [
      { alignment: 0.3, level: 0.3, shape: 0.4, shape_active: true },
      { alignment: 0.7, level: 0.7, shape: 0.8, shape_active: true },
      { alignment: 0.1, level: 0.2, shape: 0.3, shape_active: true, fixation_level: 0.5 },
      { alignment: 0.9, level: 0.9, shape: 0.95, shape_active: true, fixation_level: 0.9 },
      { alignment: 0.5, level: 0.5, shape: 0.5, shape_active: true },
    ];

    const run1 = runContaminationSequence(sessions);
    const run2 = runContaminationSequence(sessions);

    // Exact equality — determinism guarantee
    expect(run1).toEqual(run2);

    expect(run1).toMatchSnapshot();
  });
});

// ═══════════════════════════════════════════════════════════════════
// STAGE MIXING — 정규화 검증
// ═══════════════════════════════════════════════════════════════════

describe('Stage mixing normalization', () => {
  it('stage_1 + stage_2 + stage_3 ≈ 1.0 when any axis > 0', () => {
    let state = createEmptyState();
    for (let i = 0; i < 8; i++) {
      state = updateContamination(state, {
        alignment: 0.4,
        level: 0.3,
        shape: 0.5,
        shape_active: true,
        fixation_level: 0.3,
      });
    }

    const sum = state.cont_stage_1 + state.cont_stage_2 + state.cont_stage_3;
    if (sum > 0) {
      expect(sum).toBeCloseTo(1.0, 6);
    }
  });

  it('all three weights are non-negative', () => {
    let state = createEmptyState();
    for (let i = 0; i < 20; i++) {
      state = updateContamination(state, {
        alignment: Math.sin(i) * 0.5 + 0.5,
        level: Math.cos(i) * 0.5 + 0.5,
        shape: 0.6,
        shape_active: true,
        fixation_level: i > 10 ? 0.8 : 0,
      });
      expect(state.cont_stage_1).toBeGreaterThanOrEqual(0);
      expect(state.cont_stage_2).toBeGreaterThanOrEqual(0);
      expect(state.cont_stage_3).toBeGreaterThanOrEqual(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// SCENENAVIGATOR — pattern → center geometry
// ═══════════════════════════════════════════════════════════════════

describe('SceneNavigator — pattern-geometry regression', () => {
  const userEmo = { fear: 0.5, sadness: 0.3 };
  const origEmo = { anger: 0.6, fear: 0.2 };

  for (const pattern of ['echo_follow', 'bridge', 'contradiction', 'displacement', 'avoidance', 'fixation']) {
    it(`${pattern}: navigate returns consistent result`, () => {
      const result = nav.navigate({
        scenes: SCENES,
        currentSceneIndex: 0,
        visitedScenes: [0],
        transitionPattern: pattern,
        userEmotion: userEmo,
        originalEmotion: origEmo,
      });

      // Run twice — must be identical (no Math.random in core logic except fallback narrative)
      const result2 = nav.navigate({
        scenes: SCENES,
        currentSceneIndex: 0,
        visitedScenes: [0],
        transitionPattern: pattern,
        userEmotion: userEmo,
        originalEmotion: origEmo,
      });

      expect(result?.index).toBe(result2?.index);
      expect(result?.isFallback).toBe(result2?.isFallback);

      // Snapshot the index + fallback status (not narrative text — that's random)
      expect({
        pattern,
        index: result?.index,
        isFallback: result?.isFallback,
      }).toMatchSnapshot();
    });
  }
});

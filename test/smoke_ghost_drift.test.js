// test/smoke_ghost_drift.test.js
// 전이(轉移) 귀환 스모크 — "물든 유령" 두 머리의 계약을 고정한다.
// docs/통합빌드계획_전이+지형quilt_병렬세션-260614.md §1-1 (잠긴 결정) · §1-4 (계약) · §S1·T5.
//
// 두 모듈을 실제 import 해서 계약만 시험한다 (브라우저·DB·three 의존 없음).
//
//   A. js/core/QuiltDemoState.js  — within-run 물듦 추적 (T0, 이미 완료)
//      · 어긋난 접촉(alignment < 임계)이면 그 유령을 "2장면 뒤 물듦"으로 예약 → 발현.
//      · strength = clamp(1 − alignment). 잘 따르면(alignment 높음) 안 물듦.
//      · 같은 유령 재접촉이면 최신 접촉 기준으로 갱신. reset 이면 다 비움.
//
//   B. js/core/drift_lines.js     — 물든 유령의 "바뀐 대사" 선택 (T1, 순수 함수)
//      · murmur  = drift.input 으로 빚은 짧은 한 조각 (구멍1=A, 항상 층0=현재 사람).
//      · redialog= layerIndex 로 층 선택 (구멍2=나). 0=현재 사람(input 빚음),
//                  k≥1 = layers[k-1].utterance (layers 는 created_at 내림차순=최신→오래된
//                  → k 커질수록 더 오래된 층). k-1 이 layers 길이 이상이면 null(원본 복귀).
//
// ⚠️ 이 테스트는 QuiltDemoState/drift_lines 의 *현재 동작*을 못박는 회귀 스모크다.
//    상수(DRIFT_LATENCY_SCENES=2, DRIFT_ALIGN_THRESHOLD=0.55, MURMUR_MAX_CHARS=12,
//    REDIALOG_MAX_CHARS=18)에 결합돼 있으니, 모듈이 그 값을 바꾸면 여기도 같이 갱신해야 함.

import { describe, it, expect } from 'vitest';
import { QuiltDemoState } from '../js/core/QuiltDemoState.js';
import { pickDriftedLine, DRIFT_LINE_TONE } from '../js/core/drift_lines.js';

// QuiltDemoState 내부 상수와 동기화 (QuiltDemoState.js:29-30).
const LATENCY = 2;        // DRIFT_LATENCY_SCENES — 접촉 후 이만큼 장면 지나면 발현
const ALIGN_THRESH = 0.55; // DRIFT_ALIGN_THRESHOLD — 이 아래면 어긋남 → 물듦 큐

// 아무 장면이나 "한 턴 더 흘리는" 헬퍼 — 잘 따른(높은 alignment) 무해한 접촉.
// 잠복 카운트를 진행시키되 자기 자신은 물들지 않게 한다.
function passTurn(q, sceneId) {
  q.recordDialogTurn({ sceneId, alignment: 1, resonance: 'follow' });
}

// ─────────────────────────────────────────────────────────────────
// A. QuiltDemoState — within-run 물듦 (T0)
// ─────────────────────────────────────────────────────────────────

describe('QuiltDemoState — 어긋난 접촉은 2장면 뒤 발현한다', () => {
  it('어긋난 턴 직후엔 아직 안 물들고(잠복), 2장면 지나면 물든다', () => {
    const q = new QuiltDemoState();

    // 턴 1: 's1' 에서 어긋난 접촉 (alignment 낮음). 여기서 바로 물들면 안 됨 — 잠복.
    q.recordDialogTurn({ sceneId: 's1', alignment: 0.2, resonance: 'vague' });
    expect(q.getGhostDrift('s1')).toBeNull();

    // 턴 2: 다른 무해한 장면. 아직 잠복 (1/2).
    passTurn(q, 's2');
    expect(q.getGhostDrift('s1')).toBeNull();

    // 턴 3: 잠복(LATENCY=2) 충족 → 's1' 물듦 발현.
    passTurn(q, 's3');
    const drift = q.getGhostDrift('s1');
    expect(drift).not.toBeNull();
    expect(typeof drift.firedAt).toBe('number'); // 발현됐음을 firedAt 으로 확인 (input 보존은 아래 케이스)
  });

  it('발현된 drift 는 그 사람이 한 말(input)을 보존한다', () => {
    const q = new QuiltDemoState();
    q.recordDialogTurn({ sceneId: 's1', scene_link_input: '쇠 냄새가 났어', alignment: 0.2 });
    passTurn(q, 's2');
    passTurn(q, 's3');
    const drift = q.getGhostDrift('s1');
    expect(drift).not.toBeNull();
    expect(drift.input).toBe('쇠 냄새가 났어');
    expect(typeof drift.firedAt).toBe('number');
  });
});

describe('QuiltDemoState — 잘 따르면(alignment 높음) 안 물든다', () => {
  it('alignment 가 임계 이상이면 시간이 지나도 영영 안 물듦', () => {
    const q = new QuiltDemoState();
    // 임계(0.55) 이상 — 잘 따름.
    q.recordDialogTurn({ sceneId: 's1', scene_link_input: '맞아 그랬지', alignment: 0.9 });
    // 충분히 장면을 흘려도 안 물듦.
    passTurn(q, 's2');
    passTurn(q, 's3');
    passTurn(q, 's4');
    expect(q.getGhostDrift('s1')).toBeNull();
  });

  it('정확히 임계값(0.55)이면 물들지 않는다 (경계: >= 임계는 안 물듦)', () => {
    const q = new QuiltDemoState();
    q.recordDialogTurn({ sceneId: 's1', alignment: ALIGN_THRESH });
    passTurn(q, 's2');
    passTurn(q, 's3');
    expect(q.getGhostDrift('s1')).toBeNull();
  });

  it('임계 바로 아래(0.54)면 물든다 (경계 반대편)', () => {
    const q = new QuiltDemoState();
    q.recordDialogTurn({ sceneId: 's1', alignment: ALIGN_THRESH - 0.01 });
    passTurn(q, 's2');
    passTurn(q, 's3');
    expect(q.getGhostDrift('s1')).not.toBeNull();
  });
});

describe('QuiltDemoState — strength = 1 − alignment (clamp 0..1)', () => {
  it('alignment 0.2 → strength 0.8', () => {
    const q = new QuiltDemoState();
    q.recordDialogTurn({ sceneId: 's1', alignment: 0.2 });
    passTurn(q, 's2');
    passTurn(q, 's3');
    expect(q.getGhostDrift('s1').strength).toBeCloseTo(0.8, 6);
  });

  it('alignment 0 → strength 1', () => {
    const q = new QuiltDemoState();
    q.recordDialogTurn({ sceneId: 's1', alignment: 0 });
    passTurn(q, 's2');
    passTurn(q, 's3');
    expect(q.getGhostDrift('s1').strength).toBeCloseTo(1, 6);
  });
});

describe('QuiltDemoState — 같은 유령 재접촉이면 최신 접촉으로 갱신', () => {
  it('아직 잠복 중에 같은 유령에 다시 어긋나게 닿으면 input·strength 가 최신 것으로 바뀐다', () => {
    const q = new QuiltDemoState();
    // 첫 접촉 (잠복 시작).
    q.recordDialogTurn({ sceneId: 's1', scene_link_input: '첫번째 말', alignment: 0.4 }); // strength 0.6
    // 아직 발현 전(잠복 1턴)에 같은 유령 재접촉 — 더 어긋남.
    q.recordDialogTurn({ sceneId: 's1', scene_link_input: '두번째 말', alignment: 0.1 }); // strength 0.9
    // 재접촉이 잠복을 다시 시작시키므로 충분히 더 흘려 발현.
    passTurn(q, 's2');
    passTurn(q, 's3');
    const drift = q.getGhostDrift('s1');
    expect(drift).not.toBeNull();
    // 최신(두번째) 접촉 기준으로 갱신됐어야 함.
    expect(drift.input).toBe('두번째 말');
    expect(drift.strength).toBeCloseTo(0.9, 6);
  });
});

describe('QuiltDemoState — reset 은 물듦을 비운다', () => {
  it('발현된 drift 도 reset 후엔 사라진다', () => {
    const q = new QuiltDemoState();
    q.recordDialogTurn({ sceneId: 's1', scene_link_input: '말', alignment: 0.1 });
    passTurn(q, 's2');
    passTurn(q, 's3');
    expect(q.getGhostDrift('s1')).not.toBeNull(); // 발현 확인
    q.reset();
    expect(q.getGhostDrift('s1')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// B. drift_lines.pickDriftedLine — 바뀐 대사 선택 (T1)
// ─────────────────────────────────────────────────────────────────

// 공통 mock — getGhostDrift 결과 모양 { strength, input, firedAt }.
const mkDrift = (input, strength = 0.8) => ({ strength, input, firedAt: 1 });

// layers = ghost_variants 를 created_at 내림차순(최신→오래된)으로 정렬한 배열.
//   layers[0] = 가장 최신 변주, 뒤로 갈수록 더 오래된 변주.
const LAYERS = [
  { utterance: '비교적 최근에 남은 변주', created_at: '2026-06-10' },
  { utterance: '그보다 오래된 변주',     created_at: '2026-06-05' },
  { utterance: '가장 오래된 변주',       created_at: '2026-06-01' },
];

describe('pickDriftedLine — murmur (구멍1=A: 내 말로 빚은 짧은 조각)', () => {
  it('murmur 는 비지 않은 짧은 한 줄을 돌려준다', () => {
    const line = pickDriftedLine({ mode: 'murmur', drift: mkDrift('쇠 냄새가 코를 찔렀어') });
    expect(typeof line).toBe('string');
    expect(line.trim().length).toBeGreaterThan(0);
  });

  it('murmur 핵심 조각은 MURMUR_MAX_CHARS 를 넘지 않는다 (말줄임/꼬리 제외)', () => {
    const long = '가나다라마바사아자차카타파하가나다라마바사'; // 길게
    const line = pickDriftedLine({ mode: 'murmur', drift: mkDrift(long) });
    // 톤 꼬리(MURMUR_SUFFIX)를 떼어낸 핵심 부분이 상한 이하여야 한다.
    const suffix = DRIFT_LINE_TONE.MURMUR_SUFFIX || '';
    const core = suffix && line.endsWith(suffix) ? line.slice(0, -suffix.length) : line;
    expect(core.length).toBeLessThanOrEqual(DRIFT_LINE_TONE.MURMUR_MAX_CHARS);
  });

  it('drift 가 없으면 null', () => {
    expect(pickDriftedLine({ mode: 'murmur', drift: null })).toBeNull();
  });

  it('input 이 비어 있으면 null (빚을 재료 없음)', () => {
    expect(pickDriftedLine({ mode: 'murmur', drift: mkDrift('   ') })).toBeNull();
    expect(pickDriftedLine({ mode: 'murmur', drift: mkDrift('') })).toBeNull();
  });
});

describe('pickDriftedLine — redialog (구멍2=나: layerIndex 로 층 선택)', () => {
  it('layerIndex 0 = 현재 사람(내 input) 으로 빚은 줄', () => {
    const line = pickDriftedLine({
      mode: 'redialog', drift: mkDrift('내가 방금 한 말'), layers: LAYERS, layerIndex: 0,
    });
    expect(typeof line).toBe('string');
    expect(line).toContain('내가 방금 한 말'.slice(0, 4)); // 내 말의 흔적이 남는다
  });

  it('layerIndex 0·1·2 가 서로 다른 줄을 돌려준다 (재대화마다 다른 층)', () => {
    const drift = mkDrift('내가 방금 한 말');
    const l0 = pickDriftedLine({ mode: 'redialog', drift, layers: LAYERS, layerIndex: 0 });
    const l1 = pickDriftedLine({ mode: 'redialog', drift, layers: LAYERS, layerIndex: 1 });
    const l2 = pickDriftedLine({ mode: 'redialog', drift, layers: LAYERS, layerIndex: 2 });
    expect(l0).not.toBe(l1);
    expect(l1).not.toBe(l2);
    expect(l0).not.toBe(l2);
    // k≥1 은 layers[k-1].utterance 를 그대로(=더 오래된 층).
    expect(l1).toBe(LAYERS[0].utterance);
    expect(l2).toBe(LAYERS[1].utterance);
  });

  it('layerIndex 가 커질수록 layers 의 더 오래된(뒤쪽) 변주를 고른다', () => {
    const drift = mkDrift('내 말');
    const l3 = pickDriftedLine({ mode: 'redialog', drift, layers: LAYERS, layerIndex: 3 });
    expect(l3).toBe(LAYERS[2].utterance); // 가장 오래된 변주
  });

  it('layerIndex 가 layers 범위를 넘으면 null (원본 복귀)', () => {
    const drift = mkDrift('내 말');
    // layers 길이 3 → layerIndex 4 면 idx(3) >= length(3) → null.
    expect(
      pickDriftedLine({ mode: 'redialog', drift, layers: LAYERS, layerIndex: 4 }),
    ).toBeNull();
  });

  it('layers 가 비어 있으면 layerIndex 0(내 말)만 살고 k≥1 은 null', () => {
    const drift = mkDrift('나 혼자 남은 말');
    const l0 = pickDriftedLine({ mode: 'redialog', drift, layers: [], layerIndex: 0 });
    const l1 = pickDriftedLine({ mode: 'redialog', drift, layers: [], layerIndex: 1 });
    expect(typeof l0).toBe('string');
    expect(l0.trim().length).toBeGreaterThan(0);
    expect(l1).toBeNull();
  });

  it('layerIndex 0 이면서 input 이 비면 null (빚을 재료 없음)', () => {
    expect(
      pickDriftedLine({ mode: 'redialog', drift: mkDrift(''), layers: LAYERS, layerIndex: 0 }),
    ).toBeNull();
  });

  it('layerIndex 미지정/비정상이면 0 으로 처리한다', () => {
    const drift = mkDrift('기본값 층');
    const lDefault = pickDriftedLine({ mode: 'redialog', drift, layers: LAYERS });
    const lZero = pickDriftedLine({ mode: 'redialog', drift, layers: LAYERS, layerIndex: 0 });
    expect(lDefault).toBe(lZero);
    // NaN 같은 비정상 값도 0 으로.
    const lNaN = pickDriftedLine({ mode: 'redialog', drift, layers: LAYERS, layerIndex: NaN });
    expect(lNaN).toBe(lZero);
  });
});

describe('pickDriftedLine — 알 수 없는 mode 는 null', () => {
  it('mode 가 murmur/redialog 가 아니면 null', () => {
    expect(pickDriftedLine({ mode: 'unknown', drift: mkDrift('말') })).toBeNull();
    expect(pickDriftedLine({})).toBeNull();
  });
});

// test/unit/tem_variant_strata.test.js
// 이본 지층 코어 엔진 (js/shared/tem_variant_strata.js) 단위 테스트.
// 설계: docs/이본지층/이본지층_설계_v1-260716.md §3(작용)·§4(위상 자)·§6(계약).
//
// IIFE 전역 모듈 — side-effect import 후 globalThis 에서 집는다 (tem_replay_terrain 패턴).

import { describe, it, expect, beforeEach } from 'vitest';
import '../../js/shared/tem_variant_strata.js';

const TVS = globalThis.TemVariantStrata;

// ─── 합성 지형 헬퍼 ─────────────────────────────────────────────
function flatField(G, val) {
  const f = new Float32Array(G * G);
  if (val) f.fill(val);
  return f;
}
function addGaussian(f, G, cx, cz, amp, sig) {
  for (let z = 0; z < G; z++) {
    for (let x = 0; x < G; x++) {
      const dx = x - cx, dz = z - cz;
      f[z * G + x] += amp * Math.exp(-(dx * dx + dz * dz) / (2 * sig * sig));
    }
  }
}
function rmsDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s / a.length);
}

// 씬 스텁: stage_position 을 격자 좌표(world ±H2)로 흩뿌린 기억.
function makeMemory(id, opt) {
  opt = opt || {};
  const H2 = (opt.SZ || 112) / 2;
  const emos = [
    { fear: 0.7, anger: 0.3 },
    { sadness: 0.6, isolation: 0.4 },
    { joy: 0.6, hope: 0.4 },
    { guilt: 0.7, shame: 0.3 },
    { numbness: 0.6, resignation: 0.4 },
  ];
  const spots = [
    { x: -30, z: -20 }, { x: 25, z: -25 }, { x: 30, z: 25 },
    { x: -25, z: 25 }, { x: 0, z: 0 },
  ];
  const scenes = emos.map((emo, i) => ({
    id: id + '-s' + i,
    scene_order: i,
    original_emotion: emo,
    meta: { stage_position: spots[i] },
  }));
  return { id, scenes };
}

// ─── 모듈 존재 ─────────────────────────────────────────────────
describe('TemVariantStrata 계약', () => {
  it('§6 API 를 전부 노출한다', () => {
    ['isEnabled', 'setEnabled', 'buildBase', 'beginRun', 'beat',
     'applyVisitorErosion', 'getInvariants', 'serializeLayer', 'loadLayer',
     'rebuildFromPlays', 'computeFields'].forEach((k) => {
      expect(typeof TVS[k]).toBe('function');
    });
  });

  it('플래그 기본 OFF (테스트 환경엔 URL/localStorage 없음)', () => {
    expect(TVS.isEnabled()).toBe(false);
  });
});

// ─── W1-1 결정론 바닥 ──────────────────────────────────────────
describe('buildBase — 결정론 바닥(제0판)', () => {
  it('같은 memoryData → 바닥 완전 동일', () => {
    const m = makeMemory('mem-A');
    const b1 = TVS.buildBase(m, { G: 48 });
    const base1 = Float32Array.from(TVS._currentLand());
    const b2 = TVS.buildBase(m, { G: 48 });
    const base2 = Float32Array.from(TVS._currentLand());
    expect(base1.length).toBe(48 * 48);
    expect(rmsDiff(base1, base2)).toBe(0);
    expect(b1.features).toBe(b2.features);
  });

  it('다른 기억 → 다른 땅 (리트머스 ④ 씨앗)', () => {
    TVS.buildBase(makeMemory('mem-A'), { G: 48 });
    const a = Float32Array.from(TVS._currentLand());
    TVS.buildBase(makeMemory('mem-B'), { G: 48 });
    const b = Float32Array.from(TVS._currentLand());
    expect(rmsDiff(a, b)).toBeGreaterThan(0.1);
  });

  it('바닥은 유한값 연속 대륙 (NaN/Infinity 없음, 봉우리 존재)', () => {
    const b = TVS.buildBase(makeMemory('mem-C'), { G: 48 });
    const land = TVS._currentLand();
    for (let i = 0; i < land.length; i++) expect(Number.isFinite(land[i])).toBe(true);
    expect(b.features).toBeGreaterThan(0);
    expect(b.pMin).toBeGreaterThan(0);
    expect(b.tauRough).toBeGreaterThan(0);
  });

  it('stage_position 없으면 감정 VA 투영 폴백 (에러 없이 바닥 생성)', () => {
    const scenes = [
      { id: 'x0', scene_order: 0, original_emotion: { fear: 0.8 } },
      { id: 'x1', scene_order: 1, original_emotion: { joy: 0.8 } },
    ];
    const b = TVS.buildBase({ id: 'mem-nofp', scenes }, { G: 48 });
    expect(b.features).toBeGreaterThan(0);
  });
});

// ─── W1-3 위상 자 (합성 검증) ──────────────────────────────────
describe('computeInvariants — 위상 자 (§4)', () => {
  const G = 40;

  it('봉우리 3개 인공 생성 → features=3 (peaks=3, basins=0)', () => {
    const f = flatField(G, 0);
    addGaussian(f, G, 10, 10, 10, 3);
    addGaussian(f, G, 30, 10, 10, 3);
    addGaussian(f, G, 20, 30, 10, 3);
    const inv = TVS.computeInvariants(f, G, 2.0);
    expect(inv.peaks).toBe(3);
    expect(inv.basins).toBe(0);
    expect(inv.features).toBe(3);
  });

  it('잡음 추가해도 봉우리 수 불변 (지속도 밴드)', () => {
    const f = flatField(G, 0);
    addGaussian(f, G, 10, 10, 10, 3);
    addGaussian(f, G, 30, 10, 10, 3);
    addGaussian(f, G, 20, 30, 10, 3);
    // pMin(2.0) 아래 진폭의 결정론 잔주름
    for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
      f[z * G + x] += 0.4 * Math.sin(x * 1.3) * Math.cos(z * 1.7);
    }
    const inv = TVS.computeInvariants(f, G, 2.0);
    expect(inv.peaks).toBe(3);
  });

  it('봉우리 1개 → peaks=1', () => {
    const f = flatField(G, 0);
    addGaussian(f, G, 20, 20, 12, 4);
    expect(TVS.computeInvariants(f, G, 2.0).peaks).toBe(1);
  });

  it('relief=p95−p5, roughness=평균 이웃차, mass=총합 (형상)', () => {
    const f = flatField(G, 0);
    addGaussian(f, G, 20, 20, 10, 4);
    const inv = TVS.computeInvariants(f, G, 2.0);
    expect(inv.relief).toBeGreaterThan(0);
    expect(inv.roughness).toBeGreaterThan(0);
    expect(inv.mass).toBeGreaterThan(0);
  });
});

// ─── W1-2 파이프라인 + 질량 로그 ───────────────────────────────
describe('applyVisitorErosion — 파이프라인(§3) + 질량 로그(§9.6)', () => {
  beforeEach(() => {
    TVS.buildBase(makeMemory('mem-ero'), { G: 48 });
    TVS.resetRun();
  });

  function oneVisitor(order) {
    const m = makeMemory('mem-ero');
    TVS.beginRun('mem-ero');
    order.forEach((i) => {
      TVS.beat('mem-ero', {
        sceneId: m.scenes[i].id,
        sceneEmo: m.scenes[i].original_emotion,
        userEmo: m.scenes[i].original_emotion,
      });
    });
    return TVS.applyVisitorErosion();
  }

  it('한 관객 봉인 → 침식·재응고 질량 보존, generation 증가', () => {
    const out = oneVisitor([0, 1, 2, 3, 4]);
    expect(out.generation).toBe(1);
    expect(out.massLog.ok).toBe(true);
    expect(out.massLog.erosionConserved).toBeLessThan(1.0);
    expect(out.massLog.thermalConserved).toBeLessThan(1.0);
    // W1-6 융기 질량 예산: 올린 만큼 국소 해자로 뺌 → net ≈ 0 (로그로 증명)
    expect(out.massLog.uplift).toBeDefined();
    expect(out.massLog.uplift.pos).toBeGreaterThan(0);
    expect(Math.abs(out.massLog.uplift.net)).toBeLessThan(out.massLog.tol);
    // 발길 지도 정규화 0~1
    let mx = 0;
    for (let i = 0; i < out.footMap.length; i++) mx = Math.max(mx, out.footMap[i]);
    expect(mx).toBeLessThanOrEqual(1.0);
    expect(mx).toBeGreaterThan(0);
  });

  it('봉인은 바닥을 실제로 바꾼다 (delta 비영)', () => {
    const base = Float32Array.from(TVS._currentLand());
    oneVisitor([0, 1, 2, 3, 4]);
    const after = Float32Array.from(TVS._currentLand());
    expect(rmsDiff(base, after)).toBeGreaterThan(0.001);
  });

  it('순서만 바꾸면 다른 땅 (셔플 리트머스 ③, 씬 단위)', () => {
    // 같은 씬 집합, 순서만 반대 — 씨앗은 generation 로 고정.
    TVS.buildBase(makeMemory('mem-ero'), { G: 48 });
    oneVisitor([0, 1, 2, 3, 4]);
    const forward = Float32Array.from(TVS._currentLand());

    TVS.buildBase(makeMemory('mem-ero'), { G: 48 });
    oneVisitor([4, 3, 2, 1, 0]);
    const reverse = Float32Array.from(TVS._currentLand());

    expect(rmsDiff(forward, reverse)).toBeGreaterThan(0.001);
  });

  // W1-6: 융기(퇴적) 도입 후 features 는 밴드 ±60% 대신 '동적 평형' — 붕괴도 폭발도 안 함.
  // (엄밀한 features 밴드 유지·RMS 포화 곡선은 시뮬 G=96/1000명 리트머스 ①⑥에서 검증 — 보고서 §13.)
  it('다관객 누적은 붕괴(≤1)도 폭발(≥base×3)도 안 한다 (융기 평형)', () => {
    const b = TVS.buildBase(makeMemory('mem-ero'), { G: 48 });
    for (let v = 0; v < 40; v++) {
      const order = [0, 1, 2, 3, 4].sort(() => 0.5 - ((v * 7 + 3) % 5) / 5);
      oneVisitor(order);
    }
    const inv = TVS.getInvariants();
    expect(inv.features).toBeGreaterThanOrEqual(2);          // 무형태(붕괴) 아님
    expect(inv.features).toBeLessThanOrEqual(b.features * 3); // 폭발 아님
  });
});

// ─── 저장 계약 ─────────────────────────────────────────────────
describe('serializeLayer / loadLayer 왕복', () => {
  it('serialize → load → 같은 현재 땅 복원', () => {
    TVS.buildBase(makeMemory('mem-ser'), { G: 48 });
    const m = makeMemory('mem-ser');
    TVS.beginRun('mem-ser');
    [0, 2, 4].forEach((i) => TVS.beat('mem-ser', {
      sceneId: m.scenes[i].id, userEmo: m.scenes[i].original_emotion,
    }));
    TVS.applyVisitorErosion();
    const landA = Float32Array.from(TVS._currentLand());
    const layer = TVS.serializeLayer();
    expect(layer.generation).toBe(1);
    expect(layer.height_delta.length).toBe(48 * 48);

    // 바닥만 다시 깔고 layer 얹기
    TVS.buildBase(makeMemory('mem-ser'), { G: 48 });
    TVS.loadLayer(layer);
    const landB = Float32Array.from(TVS._currentLand());
    // 소수 2자리 반올림 저장이라 미세오차 허용
    expect(rmsDiff(landA, landB)).toBeLessThan(0.02);
    expect(TVS.getInvariants().features).toBeGreaterThan(0);
  });
});

// ─── W1-5 복구 도구 ────────────────────────────────────────────
describe('rebuildFromPlays — 복구 도구(근사)', () => {
  it('(user_id, 30분 간격) 세션 군집 → 재굽기, 근사 명시', () => {
    TVS.buildBase(makeMemory('mem-rb'), { G: 40 });
    const m = makeMemory('mem-rb');
    const base = 1_000_000_000_000; // 고정 타임스탬프 (Date.now 미사용 — 결정론)
    const rows = [];
    // 관객1: 3박자 (같은 세션, 5분 간격)
    [0, 1, 2].forEach((i, k) => rows.push({
      user_id: 'u1', created_at: base + k * 5 * 60 * 1000,
      scene_id: m.scenes[i].id, user_emotion: m.scenes[i].original_emotion,
    }));
    // 관객2: 2박자 (다른 user)
    [3, 4].forEach((i, k) => rows.push({
      user_id: 'u2', created_at: base + k * 5 * 60 * 1000,
      scene_id: m.scenes[i].id, user_emotion: m.scenes[i].original_emotion,
    }));
    // 관객1의 두번째 방문 (같은 user, 1시간 뒤 → 새 세션)
    [1, 2].forEach((i, k) => rows.push({
      user_id: 'u1', created_at: base + 60 * 60 * 1000 + k * 5 * 60 * 1000,
      scene_id: m.scenes[i].id, user_emotion: m.scenes[i].original_emotion,
    }));

    const res = TVS.rebuildFromPlays(rows);
    expect(res.approximate).toBe(true);
    expect(res.sessions).toBe(3); // u1-1차, u2, u1-2차
    expect(res.generation).toBe(3);
    expect(res.plays).toBe(7);
    expect(res.invariants.features).toBeGreaterThan(0);
    expect(typeof res.note).toBe('string');
  });

  it('같은 rows → 같은 결과 (결정론)', () => {
    const m = makeMemory('mem-rb2');
    const base = 1_000_000_000_000;
    const rows = [0, 1, 2, 3, 4].map((i, k) => ({
      user_id: 'u1', created_at: base + k * 60 * 1000,
      scene_id: m.scenes[i].id, user_emotion: m.scenes[i].original_emotion,
    }));
    TVS.buildBase(makeMemory('mem-rb2'), { G: 40 });
    const r1 = TVS.rebuildFromPlays(rows);
    const land1 = Float32Array.from(TVS._currentLand());
    TVS.buildBase(makeMemory('mem-rb2'), { G: 40 });
    const r2 = TVS.rebuildFromPlays(rows);
    const land2 = Float32Array.from(TVS._currentLand());
    expect(r1.generation).toBe(r2.generation);
    expect(rmsDiff(land1, land2)).toBe(0);
  });
});

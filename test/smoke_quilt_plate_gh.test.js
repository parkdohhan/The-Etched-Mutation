// test/smoke_quilt_plate_gh.test.js
// Q2 plate-aware gH 디스패처 회귀 스모크.
//
// 왜 알고리즘을 복제하는가:
//   js/shared/tem_af_strata_terrain.js 는 (function (global){...})(this) IIFE 로
//   THREE / document(canvas) / scene3 같은 브라우저 전역에 묶여 있어, node/vitest 에서
//   그대로 import 가 안 된다 (모듈 export 없음 + WebGL 의존). 그래서 프로젝트가
//   이미 쓰는 mirror 패턴(test/unit/quilt_footprints_thin.test.js 와 동일)을 따라
//   gH 디스패처의 *load-bearing 세 조각*만 순수 함수로 복제해 계약을 고정한다:
//     (1) world→local 역변환:  lx = (wx - posX)/sclX,  lz = (wz - posZ)/sclZ
//     (2) AABB 소유 판정:       wx∈[minX,maxX] && wz∈[minZ,maxZ] 인 첫 plate 가 소유
//     (3) 빈틈 fallback:        어떤 plate 도 안 덮으면 base(단일메쉬) 경로
//     (4) 높이 합성:            localY * sclY + posY
//
// !!! 원본과 동기화 필요 !!!
//   원본: js/shared/tem_af_strata_terrain.js  function gH(wx,wz) {...}  (현재 ~690행)
//   + worldAABB 산정:  halfX=(SZk/2)*sclX,  minX=posX-halfX, maxX=posX+halfX (현재 ~838행)
//   원본 dispatcher 식이 바뀌면 아래 _gH / _makePlate 도 같이 바꿔야 한다.
//   (계약 변경 시 이 주석 + 해당 테스트의 기대값을 함께 갱신.)

import { describe, it, expect } from 'vitest';

// ─── 원본 _sampleHeight 미러 (bilinear) — 원본 ~672행과 동일 식 ───────────────
function _sampleHeight(posArr, gRes, szLocal, lx, lz) {
  var gx = ((lx / szLocal) + 0.5) * (gRes - 1);
  var gz = ((lz / szLocal) + 0.5) * (gRes - 1);
  var ix = Math.min(gRes - 2, Math.max(0, Math.floor(gx)));
  var iz = Math.min(gRes - 2, Math.max(0, Math.floor(gz)));
  var fx = gx - ix; var fz = gz - iz;
  return posArr[(iz * gRes + ix) * 3 + 1] * (1 - fx) * (1 - fz)
    + posArr[(iz * gRes + ix + 1) * 3 + 1] * fx * (1 - fz)
    + posArr[((iz + 1) * gRes + ix) * 3 + 1] * (1 - fx) * fz
    + posArr[((iz + 1) * gRes + ix + 1) * 3 + 1] * fx * fz;
}

// ─── plate 등록부 항목 팩토리 — 원본 ~838행 worldAABB 산정 미러 ────────────────
// posY/sclY 까지 받아 높이 합성 계약도 고정.
function _makePlate(opts) {
  var SZk = opts.SZ_k != null ? opts.SZ_k : 24;
  var Gk = opts.G_k != null ? opts.G_k : 4;
  var sclX = opts.sclX != null ? opts.sclX : 1;
  var sclZ = opts.sclZ != null ? opts.sclZ : 1;
  var sclY = opts.sclY != null ? opts.sclY : 1;
  var posX = opts.posX, posZ = opts.posZ;
  var posY = opts.posY != null ? opts.posY : 0;
  var halfX = (SZk / 2) * sclX;
  var halfZ = (SZk / 2) * sclZ;

  // pos_k: packed XYZ vertex array. 테스트는 Y(높이)만 의미 있으므로
  // 호출자가 준 flat height 또는 평평한 0 으로 채운다.
  var flatY = opts.flatY != null ? opts.flatY : 0;
  var pos_k = opts.pos_k;
  if (!pos_k) {
    pos_k = new Float32Array(Gk * Gk * 3);
    for (var j = 0; j < Gk * Gk; j++) pos_k[j * 3 + 1] = flatY;
  }

  return {
    sceneId: opts.sceneId || 'sc',
    worldAABB: { minX: posX - halfX, maxX: posX + halfX, minZ: posZ - halfZ, maxZ: posZ + halfZ },
    G_k: Gk, SZ_k: SZk, pos_k: pos_k,
    posX: posX, posZ: posZ, posY: posY,
    sclX: sclX, sclZ: sclZ, sclY: sclY,
  };
}

// ─── gH 디스패처 미러 — 원본 ~690행 function gH 와 동일 분기 ────────────────────
// _plates 비어 있으면 base 경로(여기선 주입된 baseFn) 로 떨어진다.
function _gH(plates, baseFn, wx, wz) {
  if (plates && plates.length) {
    for (var pi = 0; pi < plates.length; pi++) {
      var pl = plates[pi];
      var ab = pl.worldAABB;
      if (wx >= ab.minX && wx <= ab.maxX && wz >= ab.minZ && wz <= ab.maxZ) {
        var lx = (wx - pl.posX) / (pl.sclX || 1);
        var lz = (wz - pl.posZ) / (pl.sclZ || 1);
        var localY = _sampleHeight(pl.pos_k, pl.G_k, pl.SZ_k, lx, lz);
        return localY * (pl.sclY || 1) + pl.posY;
      }
    }
    return baseFn(wx, wz); // gap fallback
  }
  return baseFn(wx, wz);
}

// ─── 1. _plates 비면 base 경로로 떨어진다 (롤백 안전 — 원본 §617 주석) ────────────
describe('gH 디스패처 — plate 없으면 단일메쉬 base 경로', () => {
  it('plates=[] 면 모든 좌표가 baseFn 로 간다', () => {
    let baseCalls = 0;
    const base = (wx, wz) => { baseCalls++; return 42 + wx + wz; };
    expect(_gH([], base, 1, 2)).toBe(45);
    expect(_gH(null, base, 5, 5)).toBe(52);
    expect(baseCalls).toBe(2);
  });
});

// ─── 2. AABB 소유 판정 — 자기 plate 안의 좌표만 그 plate 가 처리 ──────────────────
describe('gH 디스패처 — AABB 소유 판정', () => {
  it('plate AABB 안의 좌표는 그 plate 의 localY*sclY+posY 를 돌려준다', () => {
    // 평평한 높이 7 plate, scale 1, posY 0 → 안쪽 어디든 7
    const plate = _makePlate({ sceneId: 'A', posX: 0, posZ: 0, SZ_k: 24, G_k: 4, flatY: 7 });
    const base = () => -999; // base 로 새면 즉시 들통
    expect(_gH([plate], base, 0, 0)).toBeCloseTo(7, 6);   // 정중앙
    expect(_gH([plate], base, 11, 11)).toBeCloseTo(7, 6); // 가장자리(half=12) 안쪽
    expect(_gH([plate], base, -11, 8)).toBeCloseTo(7, 6);
  });

  it('AABB 밖 좌표는 base(빈틈) 로 떨어진다', () => {
    const plate = _makePlate({ sceneId: 'A', posX: 0, posZ: 0, SZ_k: 24, flatY: 7 });
    const base = (wx, wz) => 100; // 빈틈 noise floor 대역
    // half = 12. |13| 은 AABB 밖.
    expect(_gH([plate], base, 13, 0)).toBe(100);
    expect(_gH([plate], base, 0, 13)).toBe(100);
    expect(_gH([plate], base, 50, 50)).toBe(100);
  });

  it('경계값(minX/maxX) 은 포함(>=, <=) — 소유 경계 계약', () => {
    const plate = _makePlate({ sceneId: 'A', posX: 0, posZ: 0, SZ_k: 24, flatY: 3 });
    const base = () => -1;
    // 정확히 ±12(=half) 는 포함
    expect(_gH([plate], base, 12, 12)).toBeCloseTo(3, 6);
    expect(_gH([plate], base, -12, -12)).toBeCloseTo(3, 6);
  });

  it('겹치는 plate 는 배열 순서상 먼저 오는 plate 가 소유 (first-match 계약)', () => {
    const first = _makePlate({ sceneId: 'first', posX: 0, posZ: 0, SZ_k: 24, flatY: 1 });
    const second = _makePlate({ sceneId: 'second', posX: 0, posZ: 0, SZ_k: 24, flatY: 2 });
    const base = () => -1;
    // 둘 다 (0,0) 을 덮지만 배열 첫 항목(first, flatY=1)이 이긴다.
    expect(_gH([first, second], base, 0, 0)).toBeCloseTo(1, 6);
    expect(_gH([second, first], base, 0, 0)).toBeCloseTo(2, 6);
  });
});

// ─── 3. world→local 역변환 — position/scale 되돌리기 ─────────────────────────
describe('gH 디스패처 — world→local 역변환', () => {
  it('plate 가 평행이동 돼 있어도 자기 로컬 원점 기준으로 샘플한다', () => {
    // plate 를 (100, -50) 으로 옮김. AABB 도 따라감(half=12).
    const plate = _makePlate({ sceneId: 'A', posX: 100, posZ: -50, SZ_k: 24, flatY: 5 });
    const base = () => -999;
    // world (100,-50) = plate 로컬 (0,0). 평평하므로 5.
    expect(_gH([plate], base, 100, -50)).toBeCloseTo(5, 6);
    // AABB: x∈[88,112], z∈[-62,-38]. 안쪽이면 여전히 5.
    expect(_gH([plate], base, 110, -40)).toBeCloseTo(5, 6);
    // 밖이면 base.
    expect(_gH([plate], base, 0, 0)).toBe(-999);
  });

  it('scale 이 걸린 plate 는 역스케일로 로컬 좌표를 복원한다 (AABB 도 scale 반영)', () => {
    // sclX=2 → halfX=(24/2)*2=24. AABB x∈[-24,24].
    // 평평한 높이라 역변환 좌표가 맞기만 하면 값은 일정.
    const plate = _makePlate({ sceneId: 'A', posX: 0, posZ: 0, SZ_k: 24, sclX: 2, sclZ: 2, flatY: 9 });
    const base = () => -999;
    // |20| 은 sclX=1 이면 AABB 밖(>12)이지만 sclX=2 라 AABB(±24) 안 → plate 처리.
    expect(_gH([plate], base, 20, 0)).toBeCloseTo(9, 6);
    expect(_gH([plate], base, 0, -23)).toBeCloseTo(9, 6);
    // ±25 는 AABB(±24) 밖 → base.
    expect(_gH([plate], base, 25, 0)).toBe(-999);
  });

  it('sclY/posY 높이 합성: localY*sclY + posY', () => {
    const plate = _makePlate({ sceneId: 'A', posX: 0, posZ: 0, SZ_k: 24, flatY: 4, sclY: 3, posY: 10 });
    const base = () => -999;
    // 4 * 3 + 10 = 22
    expect(_gH([plate], base, 0, 0)).toBeCloseTo(22, 6);
  });

  it('역변환이 비선형 높이장에서도 위치별로 다른 값을 준다 (좌표가 진짜 쓰임)', () => {
    // 4x4 격자에 x 방향 경사 높이장을 직접 깔아, 로컬 좌표가 실제로 샘플에 반영되는지 본다.
    const Gk = 4, SZk = 24;
    const pos_k = new Float32Array(Gk * Gk * 3);
    // 행(z) 무관, 열(ix) 에 따라 높이 0,1,2,3 — x 경사.
    for (let iz = 0; iz < Gk; iz++) {
      for (let ix = 0; ix < Gk; ix++) {
        pos_k[(iz * Gk + ix) * 3 + 1] = ix; // 높이 = 열 인덱스
      }
    }
    const plate = _makePlate({ sceneId: 'A', posX: 0, posZ: 0, SZ_k: SZk, G_k: Gk, pos_k });
    const base = () => -999;
    // 로컬 lx=-12(왼끝)=ix 0 → 높이 0. lx=+12(오른끝)=ix 3 → 높이 3.
    const left = _gH([plate], base, -12, 0);
    const right = _gH([plate], base, 12, 0);
    expect(right).toBeGreaterThan(left);
    expect(left).toBeCloseTo(0, 6);
    expect(right).toBeCloseTo(3, 6);
  });
});

// ─── 4. 빈틈 fallback + 여러 plate 라우팅 종합 ───────────────────────────────
describe('gH 디스패처 — 여러 plate 라우팅 + 빈틈', () => {
  it('두 분리된 plate 사이의 빈틈은 base, 각 plate 위는 자기 값', () => {
    const a = _makePlate({ sceneId: 'A', posX: -40, posZ: 0, SZ_k: 24, flatY: 1 }); // x∈[-52,-28]
    const b = _makePlate({ sceneId: 'B', posX: 40, posZ: 0, SZ_k: 24, flatY: 8 });  // x∈[28,52]
    const base = (wx, wz) => 0; // 빈틈 floor
    expect(_gH([a, b], base, -40, 0)).toBeCloseTo(1, 6); // A 위
    expect(_gH([a, b], base, 40, 0)).toBeCloseTo(8, 6);  // B 위
    expect(_gH([a, b], base, 0, 0)).toBe(0);             // 사이 빈틈 → base
    expect(_gH([a, b], base, 100, 0)).toBe(0);           // 둘 다 밖 → base
  });
});

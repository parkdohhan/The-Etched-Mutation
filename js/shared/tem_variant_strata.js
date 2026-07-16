/**
 * TEM Variant Strata — 이본 지층 코어 엔진 (설계: docs/이본지층/이본지층_설계_v1-260716.md)
 * 후속: 생성형_지형모델_v2-260619.md §9 (재생 굽기). 퀼트 섬 기하는 폐기(§2 결정 5·10),
 * 연속 대륙 + 작가 바닥(제0판) + 관객 침식 누적(기억 작용 3종) + 위상 자로 재편.
 *
 * ADDITIVE & FLAG-GATED (default OFF).
 *   enable:  ?variant_strata=1  또는  localStorage.tem_variant_strata='1'
 *            또는 console: TemVariantStrata.setEnabled(true)
 *   disable: TemVariantStrata.setEnabled(false)  또는  ?variant_strata=0
 *   rollback: 이 파일 삭제 + tem_af_strata_terrain.js computeAfTerrainFields 상단
 *             guarded block 삭제. (배선은 W4 몫 — 이 레인은 엔진+시뮬만.)
 *
 * 옛 tem_replay_terrain 키는 읽지 않는다(§6 계약). 물리(물방울·비탈 무너짐·씨앗 난수·
 * simplex)는 tem_replay_terrain.js 에서 **복사 이식** — 원본 파일 무수정, 은퇴는 W4.
 *
 * §6 레인 계약 (동결):
 *   isEnabled()/setEnabled(v)
 *   buildBase(memoryData[, opt]) → {G,SZ,H2,hts,cls,minH,maxH, base, ...}
 *   beginRun(memoryId) / beat(memoryId, {sceneId,sceneEmo,userEmo,isVoid})
 *   applyVisitorErosion() → {delta, footMap, generation, invariants, massLog}
 *   loadLayer({height_delta, foot_map, generation}) / serializeLayer()
 *   rebuildFromPlays(playRows) → {generation, invariants, sessions, approximate:true, ...}
 *   getInvariants() → {features, peaks, basins, relief, roughness, mass}
 *   computeFields(P, filterIdx, opt, helpers) — 입구 훅용 drop-in (strata view 호환)
 */
(function (global) {
  'use strict';

  var FLAG_KEY = 'tem_variant_strata';

  // ───────────────────────── flag ─────────────────────────
  // 옛 tem_replay_terrain 키는 읽지 않는다. URL ?variant_strata=1/0 은 sticky.
  var _enabled = null;
  function isEnabled() {
    if (_enabled != null) return _enabled;
    var q = '';
    try { q = (global.location && global.location.search) || ''; } catch (_) {}
    var on = null;
    if (/[?&]variant_strata=1/.test(q)) on = true;
    else if (/[?&]variant_strata=0/.test(q)) on = false;
    if (on != null) {
      try { global.localStorage.setItem(FLAG_KEY, on ? '1' : '0'); } catch (_) {}
    } else {
      try { on = global.localStorage && global.localStorage.getItem(FLAG_KEY) === '1'; }
      catch (_) { on = false; }
    }
    _enabled = !!on;
    if (_enabled) {
      console.log('[variant-strata] ON — 이본 지층 경로 활성. 끄기: TemVariantStrata.setEnabled(false) 또는 ?variant_strata=0');
    }
    return _enabled;
  }
  function setEnabled(v) {
    _enabled = !!v;
    try { global.localStorage.setItem(FLAG_KEY, v ? '1' : '0'); } catch (_) {}
    console.log('[variant-strata] ' + (v ? 'ON — 다음 buildBase부터 이본 지층' : 'OFF — 원본 지형 경로'));
  }

  // ─────────────────── seeded randomness (복사 이식) ───────────────────
  function seedFromString(s) {
    var h = 5381;
    s = String(s || 'tem');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Simplex 2D (Gustavson), seeded permutation — grid-scar-free base noise. (복사 이식)
  function makeSimplex(rand) {
    var p = new Uint8Array(256), i, j, tmp;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) {
      j = (rand() * (i + 1)) | 0;
      tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    var perm = new Uint8Array(512);
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
    var GR = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    var F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    return function (xin, yin) {
      var n0 = 0, n1 = 0, n2 = 0;
      var s = (xin + yin) * F2;
      var ii = Math.floor(xin + s), jj = Math.floor(yin + s);
      var t = (ii + jj) * G2;
      var x0 = xin - (ii - t), y0 = yin - (jj - t);
      var i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      var x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      var ia = ii & 255, ja = jj & 255, g;
      var t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) { t0 *= t0; g = GR[perm[ia + perm[ja]] & 7]; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
      var t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) { t1 *= t1; g = GR[perm[ia + i1 + perm[ja + j1]] & 7]; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
      var t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) { t2 *= t2; g = GR[perm[ia + 1 + perm[ja + 1]] & 7]; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
      return 70 * (n0 + n1 + n2);
    };
  }

  // ─── physics constants (§9.5 — world softness, shared by ALL emotions) ───
  // 복사 이식(tem_replay_terrain.js) 후 **누적 모델용 1회 보정** (2026-07-16, W1_구현보고).
  //   원본은 1회 굽기(관객 1명분)용 값 — erode 0.35 / maxSteps 80 / capacity 6 은
  //   물방울 하나가 봉우리→골 경로를 깊게 판다. 500명 누적 시 봉우리를 통째로 깎아 features 붕괴.
  //   누적 모델은 관객당 침식이 얕아야(수백 명이 쌓여 이본이 됨) 하므로 아래로 낮춤:
  //   erode 0.35→0.06, deposit 0.3→0.10, capacity 6→4, maxSteps 80→48.
  var PHYS = {
    inertia: 0.08, capacity: 4, minSlope: 0.01,
    erode: 0.06, deposit: 0.10, evaporate: 0.02,
    gravity: 4, maxSteps: 48, radius: 3,
  };
  var BRUSH = (function () {
    var r = PHYS.radius, arr = [], tw = 0, dx, dz, d, w;
    for (dz = -r; dz <= r; dz++) for (dx = -r; dx <= r; dx++) {
      d = Math.sqrt(dx * dx + dz * dz);
      if (d > r) continue;
      w = 1 - d / r;
      arr.push({ dx: dx, dz: dz, w: w });
      tw += w;
    }
    for (var i = 0; i < arr.length; i++) arr[i].w /= tw;
    return arr;
  })();

  // ─── 손잡이 3개 (§3 — 10월 튜닝 대상) + 유도 상수 ───
  // 기본값은 500명 리트머스(발자국·당신에게, G=96)로 보정 확정 (2026-07-16, W1_구현보고 §손잡이).
  //   k_forget: 설계 초안 0.005 → 0.0008. 근거: 500 봉인 누적 시 잔주름만 지우고 실루엣 보존.
  //   tau_rough_mult: 설계 초안 3(평균 기준) → 1.0(p98 기준). τ_rough 기준을 '평균 이웃차'에서
  //     '이웃차 p98'로 바꿔(성긴 봉우리를 안 먹게) mult 1.0 이면 바닥 봉우리 경사보다 위 → 보존.
  var HANDLES = {
    k_reinforce: 0.6,      // 강화: 침식력 × min(2, 1 + k_reinforce·발길)
    k_forget: 0.0008,      // 망각: lerp(높이, 이웃8평균, k_forget·(1−발길)) / 봉인
    tau_rough_mult: 1.0,   // 재응고: τ_rough = 바닥 이웃차 p98 × mult
    p_min_frac: 0.08,      // 위상 자: 지속도 임계 = 바닥 높이 범위 × frac
    features_band_frac: 0.6, // 리트머스: 밴드 = 바닥 features ± frac
    // W1-6 박자 융기(퇴적): 관객이 느낀 씬 감정을 그 로브에 쌓는 복원항. 국소 해자로 질량 net≈0.
    //   융기 도입으로 순수 침식의 '평탄 끌개'가 동적 평형(RMS 포화)으로 바뀐다(§13/W1-6).
    //   보정 확정(G=96, 1000명): k_uplift 0.5 / erosion_scale 0.3 → RMS 포화(~1.0, 250명에 평형)
    //   + features 밴드 유지(6~8) + 1명 봉인 maxDelta≈5.7(무대 가시). 근거는 W1_구현보고 §13.
    k_uplift: 0.5,         // 융기 세기: 감정축 w당 봉우리 진폭 = k_uplift·w
    // §9.5 물리 보정(1회 확정): 봉인 1회 물방울 총량 배율. W1-6에서 융기가 받쳐주므로
    //   0.012(종잇장) → 0.3 로 상향 — 관객 1명 몫이 무대에서 보이게(⑦) 하면서 평형 유지.
    erosion_scale: 0.3,
  };

  // ─────────────── emotion space (자족 복사, 판단 아님 — 배치/색 전용) ───────────────
  // VAD 좌표: tem_af_strata_terrain.js VAD_FULL 와 동일값(로브 배치·물길 경유점 계산에만 사용).
  var VAD = {
    fear:{v:-0.9,a:0.9}, sadness:{v:-0.8,a:-0.4}, anger:{v:-0.7,a:0.8},
    guilt:{v:-0.8,a:0.2}, shame:{v:-0.9,a:-0.2}, isolation:{v:-0.7,a:-0.5},
    numbness:{v:-0.6,a:-0.8}, longing:{v:-0.3,a:0.2}, resentment:{v:-0.5,a:0.6},
    resignation:{v:-0.4,a:-0.6}, joy:{v:0.9,a:0.6}, hope:{v:0.7,a:0.4},
    relief:{v:0.6,a:-0.3}, gratitude:{v:0.8,a:-0.2}, love:{v:1.0,a:0.5},
    peace:{v:0.8,a:-0.6}, confusion:{v:-0.4,a:0.3},
  };
  var EC = {
    fear:[0.4,0.28,0.7], sadness:[0.25,0.38,0.65], anger:[0.8,0.25,0.22], guilt:[0.6,0.48,0.35],
    longing:[0.28,0.62,0.65], numbness:[0.32,0.32,0.38], shame:[0.58,0.35,0.48], isolation:[0.14,0.14,0.24],
    joy:[0.82,0.72,0.38], resentment:[0.6,0.2,0.15], resignation:[0.4,0.38,0.35], hope:[0.55,0.65,0.45],
    relief:[0.48,0.68,0.48], love:[0.7,0.4,0.5], gratitude:[0.65,0.58,0.4], peace:[0.45,0.58,0.52],
    confusion:[0.48,0.38,0.55],
  };
  var KO = {
    fear:'공포', sadness:'슬픔', anger:'분노', guilt:'죄책감', shame:'수치심',
    isolation:'고립', numbness:'무감각', longing:'그리움', resentment:'원망',
    resignation:'체념', joy:'기쁨', hope:'희망', relief:'안도', gratitude:'감사',
    love:'사랑', peace:'평화', confusion:'혼란',
  };

  function parseEmo(e) {
    if (!e) return null;
    if (typeof e === 'string') { try { e = JSON.parse(e); } catch (_) { return null; } }
    if (typeof e !== 'object') return null;
    return e;
  }
  // 감정 분포 → VA 무게중심 (물길 경유점·자동 폴백 배치에만. 판단 금지)
  function projectVA(emo) {
    var V = 0, A = 0, w = 0;
    for (var k in emo) {
      if (!Object.prototype.hasOwnProperty.call(emo, k)) continue;
      var m = VAD[k]; var wk = Number(emo[k] || 0);
      if (!m || !wk) continue;
      V += wk * m.v; A += wk * m.a; w += wk;
    }
    if (w <= 0) return { v: 0, a: 0 };
    return { v: Math.max(-1, Math.min(1, V / w)), a: Math.max(-1, Math.min(1, A / w)) };
  }

  // ─────────────────── heightfield helpers (복사 이식) ───────────────────
  function heightAndGrad(h, G, x, z) {
    var xi = Math.floor(x), zi = Math.floor(z);
    var fx = x - xi, fz = z - zi;
    var i00 = zi * G + xi;
    var h00 = h[i00], h10 = h[i00 + 1], h01 = h[i00 + G], h11 = h[i00 + G + 1];
    return {
      h: h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz,
      gx: (h10 - h00) * (1 - fz) + (h11 - h01) * fz,
      gz: (h01 - h00) * (1 - fx) + (h11 - h10) * fx,
    };
  }
  function depositAt(h, G, x, z, amt) {
    if (amt <= 0) return;
    var xi = Math.floor(x), zi = Math.floor(z);
    var fx = x - xi, fz = z - zi;
    h[zi * G + xi] += amt * (1 - fx) * (1 - fz);
    h[zi * G + xi + 1] += amt * fx * (1 - fz);
    h[(zi + 1) * G + xi] += amt * (1 - fx) * fz;
    h[(zi + 1) * G + xi + 1] += amt * fx * fz;
  }
  // 강화 반영: 침식량 × reinforce (호출측이 발길 기반 배율 계산).
  function erodeAt(h, G, x, z, amt) {
    if (amt <= 0) return;
    var cx = Math.round(x), cz = Math.round(z), ws = 0, i, xx, zz;
    for (i = 0; i < BRUSH.length; i++) {
      xx = cx + BRUSH[i].dx; zz = cz + BRUSH[i].dz;
      if (xx < 0 || xx >= G || zz < 0 || zz >= G) continue;
      ws += BRUSH[i].w;
    }
    if (ws <= 0) return;
    for (i = 0; i < BRUSH.length; i++) {
      xx = cx + BRUSH[i].dx; zz = cz + BRUSH[i].dz;
      if (xx < 0 || xx >= G || zz < 0 || zz >= G) continue;
      h[zz * G + xx] -= amt * BRUSH[i].w / ws;
    }
  }
  // 한 물방울 (§9.4 특수화: 태어나는 자리=전이 경로, 초기 방향=이동 벡터, 순서=재생 순서).
  // 흙 주머니로 질량 보존. ctx = {footRead, footWrite, kReinforce} — 강화(§3-1) 적용.
  function dropOne(h, G, x, z, dx, dz, rng, ctx) {
    var speed = 1, water = 1, sediment = 0, life, g, l, nx, nz, gn, dh, cap, dep, ero, ang;
    for (life = 0; life < PHYS.maxSteps; life++) {
      if (x < 1 || x > G - 3 || z < 1 || z > G - 3) break;
      // 발길 누적: 물이 지난 칸 +1 (§3 발길 지도).
      if (ctx && ctx.footWrite) { var fi = Math.round(z) * G + Math.round(x); if (fi >= 0 && fi < ctx.footWrite.length) ctx.footWrite[fi] += water; }
      g = heightAndGrad(h, G, x, z);
      dx = dx * PHYS.inertia - g.gx * (1 - PHYS.inertia);
      dz = dz * PHYS.inertia - g.gz * (1 - PHYS.inertia);
      l = Math.sqrt(dx * dx + dz * dz);
      if (l < 1e-8) { ang = rng() * Math.PI * 2; dx = Math.cos(ang); dz = Math.sin(ang); l = 1; }
      dx /= l; dz /= l;
      nx = x + dx; nz = z + dz;
      if (nx < 1 || nx > G - 3 || nz < 1 || nz > G - 3) { depositAt(h, G, x, z, sediment); return; }
      gn = heightAndGrad(h, G, nx, nz);
      dh = gn.h - g.h;
      cap = Math.max(-dh, PHYS.minSlope) * speed * water * PHYS.capacity;
      if (dh > 0) {
        dep = Math.min(dh, sediment);
        depositAt(h, G, x, z, dep); sediment -= dep;
      } else if (sediment > cap) {
        dep = (sediment - cap) * PHYS.deposit;
        depositAt(h, G, x, z, dep); sediment -= dep;
      } else {
        // 강화(§3-1): 발길 많은 칸일수록 더 깊게 판다. 깎은 흙은 그대로 주머니로 → 질량 보존.
        var rf = 1;
        if (ctx && ctx.footRead) {
          var ci = Math.round(z) * G + Math.round(x);
          if (ci >= 0 && ci < ctx.footRead.length) rf = Math.min(2, 1 + ctx.kReinforce * ctx.footRead[ci]);
        }
        ero = Math.min((cap - sediment) * PHYS.erode * rf, -dh);
        erodeAt(h, G, x, z, ero); sediment += ero;
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * PHYS.gravity));
      water *= (1 - PHYS.evaporate);
      x = nx; z = nz;
      if (water < 0.02) break;
    }
    if (x >= 1 && x <= G - 3 && z >= 1 && z <= G - 3) depositAt(h, G, x, z, sediment);
  }
  // 재응고 (§3-3): 이웃 높이차 > τ_rough 인 칸만 국소 무너짐. 질량 보존(이웃끼리 흙 이동).
  // "복사 이식"한 비탈 무너짐 패스(열 침식)를 τ_rough 게이트로 국소화·안식각화한 것.
  // (전역판 thermal 은 누적 모델에서 500× 확산으로 땅을 평탄화시켜 폐기 — W1_구현보고 참조.)
  // 안식각(rest angle) = τ_rough 자체. 즉 "바닥이 자연히 갖는 최대 경사"보다 가파른 절벽만,
  // 그 경사까지만 흘러내린다. → 작가 봉우리(바닥에 이미 있던 경사)는 건드리지 않고,
  // 침식이 새로 판 그럴듯하지 않은 절벽만 굳힌다. (설계 §3-3 "모래는 절벽 불가"의 정확한 구현.)
  function reconsolidate(h, G, tauRough, iters) {
    var RATE = 0.25, it, z, x, i, d, mv;
    for (it = 0; it < iters; it++) {
      for (z = 1; z < G - 1; z++) {
        for (x = 1; x < G - 1; x++) {
          i = z * G + x;
          d = h[i] - h[i - 1]; if (d > tauRough) { mv = (d - tauRough) * RATE; h[i] -= mv; h[i - 1] += mv; }
          d = h[i] - h[i + 1]; if (d > tauRough) { mv = (d - tauRough) * RATE; h[i] -= mv; h[i + 1] += mv; }
          d = h[i] - h[i - G]; if (d > tauRough) { mv = (d - tauRough) * RATE; h[i] -= mv; h[i - G] += mv; }
          d = h[i] - h[i + G]; if (d > tauRough) { mv = (d - tauRough) * RATE; h[i] -= mv; h[i + G] += mv; }
        }
      }
    }
  }

  // ─────────────────── module state ───────────────────
  var _G = 0, _SZ = 0, _H2 = 0;
  var _memoryId = null;
  var _base = null;         // 결정론 바닥 (Float32Array) — buildBase 산물, 저장 불요
  var _baseCls = null;      // 바닥 색 (Float32Array*3)
  var _delta = null;        // 누적 변형층 (현재 땅 = base + delta)
  var _footTraffic = null;  // 발길 누적(raw). 정규화는 serialize/강화 시점 on-the-fly
  var _generation = 0;
  var _sceneCenters = {};   // sceneId → {gx, gz} (바닥 로브 닻)
  var _pMin = 0, _tauRough = 0, _baseFeatures = 0;
  var _lastInvariants = null;

  // world(±H2) ↔ grid 변환
  function worldToGrid(wx, wz) {
    return { gx: (wx / _SZ + 0.5) * (_G - 1), gz: (wz / _SZ + 0.5) * (_G - 1) };
  }

  // 발길 정규화(0~1): 현재 최대값 기준.
  function footNormalized() {
    var mx = 0, i;
    for (i = 0; i < _footTraffic.length; i++) if (_footTraffic[i] > mx) mx = _footTraffic[i];
    var out = new Float32Array(_footTraffic.length);
    if (mx <= 0) return out;
    for (i = 0; i < _footTraffic.length; i++) out[i] = _footTraffic[i] / mx;
    return out;
  }

  // ─────────────────── W1-1 : buildBase (제0판) ───────────────────
  // 결정론 연속 대륙. 같은 memoryData → 완전 동일. plays/오염 불참(그건 침식층).
  // memoryData: { id, scenes:[{ id, scene_order, emotion_dist|original_emotion,
  //                             meta:{stage_position:{x,z}} }] }  (또는 sceneAF 형)
  function buildBase(memoryData, opt) {
    opt = opt || {};
    _G = opt.G != null ? opt.G : 160;
    _SZ = opt.SZ != null ? opt.SZ : 112;
    _H2 = _SZ / 2;
    _memoryId = (memoryData && memoryData.id) || 'tem';

    var G = _G, SZ = _SZ, H2 = _H2;
    var hts = new Float32Array(G * G);
    var cls = new Float32Array(G * G * 3);
    var simplex = makeSimplex(mulberry32(seedFromString(_memoryId)));

    // ── 연속 대륙 바탕: 부드러운 simplex fBm (섬/공허 없음) ──
    var iz, ix, idx;
    for (iz = 0; iz < G; iz++) {
      for (ix = 0; ix < G; ix++) {
        var a = 1, f = 0.03, s = 0, norm = 0, o;
        for (o = 0; o < 4; o++) { s += a * simplex(ix * f, iz * f); norm += a; a *= 0.5; f *= 2.1; }
        hts[iz * G + ix] = 2.2 * (s / norm);
      }
    }

    // ── 씬 목록 정규화 (sceneAF 형/DB 형 모두 흡수) ──
    var scenes = (memoryData && (memoryData.scenes || memoryData.sceneAF)) || [];
    var normScenes = scenes.map(function (sc, i) {
      var emo = parseEmo(sc.emotion_dist) || parseEmo(sc.original_emotion) || parseEmo(sc.emo) || null;
      var sp = (sc.meta && sc.meta.stage_position) ||
               (Number.isFinite(sc.wx) && Number.isFinite(sc.wz) ? { x: sc.wx, z: sc.wz } : null);
      return {
        id: sc.id != null ? sc.id : ('s' + i),
        order: sc.scene_order != null ? sc.scene_order : (sc.order != null ? sc.order : i),
        emo: emo,
        sp: sp && Number.isFinite(sp.x) && Number.isFinite(sp.z) ? sp : null,
      };
    }).filter(function (sc) { return sc.emo; });
    // 첫 서술 순서 (결정론 재현용) — 배치 자체는 가산이라 순서 무관하지만 명시.
    normScenes.sort(function (a, b) { return a.order - b.order; });

    _sceneCenters = {};
    var patchR = Math.max(6, G * 0.055);   // 씬 패치 반경(cells)

    normScenes.forEach(function (sc) {
      // 씬 패치 중심(닻) = stage_position, 없으면 감정 VA 투영 폴백.
      var cx, cz;
      if (sc.sp) {
        var gp = worldToGrid(sc.sp.x, sc.sp.z);
        cx = gp.gx; cz = gp.gz;
      } else {
        var va = projectVA(sc.emo);
        var gp2 = worldToGrid(va.v * H2, va.a * H2);
        cx = gp2.gx; cz = gp2.gz;
      }
      cx = Math.max(2, Math.min(G - 3, cx));
      cz = Math.max(2, Math.min(G - 3, cz));
      _sceneCenters[String(sc.id)] = { gx: cx, gz: cz };

      // 안 뭉갠 17축: 각 축이 패치 안 자기 로브(친척 배치=VA 오프셋)에 융기.
      for (var k in sc.emo) {
        if (!Object.prototype.hasOwnProperty.call(sc.emo, k)) continue;
        var w = Number(sc.emo[k] || 0);
        if (!w || !VAD[k]) continue;
        var a01 = (VAD[k].a + 1) / 2;                     // 0 calm … 1 aroused
        var lx = cx + VAD[k].v * patchR * 0.55;
        var lz = cz + VAD[k].a * patchR * 0.55;
        var sig = patchR * (0.16 + 0.20 * (1 - a01));      // aroused → tight/sharp
        var amp = 9.0 * w;
        var ec = EC[k] || [0.5, 0.5, 0.5];
        var Rb = Math.ceil(sig * 3);
        var x0 = Math.max(0, Math.floor(lx - Rb)), x1 = Math.min(G - 1, Math.ceil(lx + Rb));
        var z0 = Math.max(0, Math.floor(lz - Rb)), z1 = Math.min(G - 1, Math.ceil(lz + Rb));
        for (var zz = z0; zz <= z1; zz++) {
          for (var xx = x0; xx <= x1; xx++) {
            var ddx = xx - lx, ddz = zz - lz;
            var env = Math.exp(-(ddx * ddx + ddz * ddz) / (2 * sig * sig));
            if (env < 0.004) continue;
            var v = amp * env;
            if (a01 > 0.05) v += env * a01 * w * 2.0 * simplex(xx * 0.18 + 31.7, zz * 0.18 - 11.3);
            var ii = zz * G + xx;
            hts[ii] += v;
            var ci = ii * 3;
            cls[ci] += ec[0] * env * w * 0.16;
            cls[ci + 1] += ec[1] * env * w * 0.16;
            cls[ci + 2] += ec[2] * env * w * 0.16;
          }
        }
      }
    });

    // 색 마감 (검은 바닥 방지 + 최소 채도)
    var i3, ci3, av;
    for (i3 = 0; i3 < G * G; i3++) {
      ci3 = i3 * 3;
      av = (cls[ci3] + cls[ci3 + 1] + cls[ci3 + 2]) / 3;
      cls[ci3] = Math.min(1, Math.max(0, cls[ci3] * 0.85 + av * 0.15 + 0.04));
      cls[ci3 + 1] = Math.min(1, Math.max(0, cls[ci3 + 1] * 0.85 + av * 0.15 + 0.04));
      cls[ci3 + 2] = Math.min(1, Math.max(0, cls[ci3 + 2] * 0.85 + av * 0.15 + 0.055));
    }

    // 상태 확정
    _base = hts;
    _baseCls = cls;
    _delta = new Float32Array(G * G);
    _footTraffic = new Float32Array(G * G);
    _generation = 0;

    // 손잡이 유도값: p_min·τ_rough·features 밴드 (바닥 실측)
    var mn = Infinity, mx = -Infinity, i;
    for (i = 0; i < G * G; i++) { if (hts[i] < mn) mn = hts[i]; if (hts[i] > mx) mx = hts[i]; }
    _pMin = (mx - mn) * HANDLES.p_min_frac;
    // τ_rough = 바닥 이웃차 상위 백분위(p98) × mult. 평균×3(설계 초안)은 성긴 봉우리에 눌려
    // 0.6 수준 → 작가 봉우리(경사 ~3)를 매 봉인 무너뜨려 features 붕괴. p98 기준으로 바꿔
    // "바닥이 자연히 갖는 가장 가파른 경사보다 더 가파른 절벽"만 굳히게 한다(§3-3 원의미).
    _tauRough = percentileNeighborDiff(hts, G, 0.98) * HANDLES.tau_rough_mult;
    _lastInvariants = computeInvariants(hts, G, _pMin);
    _baseFeatures = _lastInvariants.features;

    return {
      G: G, SZ: SZ, H2: H2, hts: hts, cls: cls, minH: mn, maxH: mx,
      base: hts, pMin: _pMin, tauRough: _tauRough,
      features: _baseFeatures, invariants: _lastInvariants,
      sceneCenters: _sceneCenters,
    };
  }

  // ─────────────────── run state (§6 계약 승계) ───────────────────
  var run = { memoryId: null, beats: [], active: false };
  function beginRun(memoryId) {
    run.memoryId = memoryId || _memoryId;
    run.beats = [];
    run.active = true;
  }
  function beat(memoryId, b) {
    if (run.memoryId !== (memoryId || _memoryId)) { run.memoryId = memoryId || _memoryId; run.beats = []; run.active = true; }
    run.beats.push({
      sceneId: (b && b.sceneId) != null ? b.sceneId : null,
      sceneEmo: parseEmo(b && b.sceneEmo),
      userEmo: parseEmo(b && b.userEmo),
      isVoid: !!(b && b.isVoid),
    });
  }
  function resetRun() { run.memoryId = null; run.beats = []; run.active = false; }

  // 한 박자의 물길 경유점 = 씬 패치 중심(닻)을 이번 관객의 느낌 쪽으로 미세 이동.
  function waypointOf(bt) {
    if (bt.isVoid) return null;
    var c = bt.sceneId != null ? _sceneCenters[String(bt.sceneId)] : null;
    var src = bt.userEmo || bt.sceneEmo || null;
    if (!c) {
      // 닻 없음: 느낌 감정 VA 투영으로 폴백.
      if (!src) return null;
      var va = projectVA(src);
      var gp = worldToGrid(va.v * _H2, va.a * _H2);
      return { x: Math.max(2, Math.min(_G - 3, gp.gx)), z: Math.max(2, Math.min(_G - 3, gp.gz)) };
    }
    if (!src) return { x: c.gx, z: c.gz };
    // 닻에서 느낌 쪽으로 살짝(≤ patchR) 당김.
    var va2 = projectVA(src);
    var pr = Math.max(6, _G * 0.055);
    return {
      x: Math.max(2, Math.min(_G - 3, c.gx + va2.v * pr * 0.45)),
      z: Math.max(2, Math.min(_G - 3, c.gz + va2.a * pr * 0.45)),
    };
  }

  // W1-6 박자 융기(퇴적): 관객이 느낀 씬 감정(17축, 안 뭉갬)을 그 씬 로브에 얇게 쌓는다.
  // buildBase 의 로브 융기와 같은 기하(친척 배치·arousal 폭), 색·simplex 없이 높이만.
  // **국소 질량 예산**: 봉우리(양 가우시안)를 올리며 그 둘레에 같은 부피의 얕은 해자(음 가우시안,
  //   σ_out = MOAT·σ, 진폭 = amp/MOAT²)를 판다 — "산이 솟으며 둘레에서 흙을 끌어옴". 먼 벌판 불변.
  //   그리드 절단분만 잔차로 남아 호출측이 미세 균일 보정(전역 침강 아님).
  // 반환 = {pos, neg} (양·음 기여 총합) — 질량 예산 로그·잔차 보정용.
  var MOAT = 2.2;
  function upliftBeatLobes(land, G, cx, cz, emo, patchR, kUplift) {
    var pos = 0, neg = 0;
    for (var k in emo) {
      if (!Object.prototype.hasOwnProperty.call(emo, k)) continue;
      var w = Number(emo[k] || 0);
      if (!w || !VAD[k]) continue;
      var a01 = (VAD[k].a + 1) / 2;
      var lx = cx + VAD[k].v * patchR * 0.55;
      var lz = cz + VAD[k].a * patchR * 0.55;
      var sig = patchR * (0.16 + 0.20 * (1 - a01));
      var sigOut = sig * MOAT;
      var amp = kUplift * w;
      var ampMoat = amp / (MOAT * MOAT);            // 양·음 부피 동일 → 국소 net≈0
      var Rb = Math.ceil(sigOut * 3);
      var x0 = Math.max(0, Math.floor(lx - Rb)), x1 = Math.min(G - 1, Math.ceil(lx + Rb));
      var z0 = Math.max(0, Math.floor(lz - Rb)), z1 = Math.min(G - 1, Math.ceil(lz + Rb));
      for (var zz = z0; zz <= z1; zz++) {
        for (var xx = x0; xx <= x1; xx++) {
          var ddx = xx - lx, ddz = zz - lz;
          var r2 = ddx * ddx + ddz * ddz;
          var up = amp * Math.exp(-r2 / (2 * sig * sig));
          var moat = ampMoat * Math.exp(-r2 / (2 * sigOut * sigOut));
          var v = up - moat;
          if (Math.abs(v) < 0.0005) continue;
          land[zz * G + xx] += v;
          if (v > 0) pos += v; else neg += v;
        }
      }
    }
    return { pos: pos, neg: neg };
  }

  // ─────────────────── W1-2/W1-6 : applyVisitorErosion (파이프라인) ───────────────────
  // 순서 고정: ⓪융기(W1-6) → ①침식(강화) → ②망각 → ③재응고 → ④불변량 → ⑤(serialize는 호출측).
  // 융기를 맨 앞에 둔 근거: 관객은 씬을 '느끼며 퇴적'한 뒤(박자 융기) 그 사이를 '이동하며 침식'한다
  //   (§9.1 "박자마다 융기, 박자 사이 물"의 관객판). buildBase 도 융기가 먼저다 — 일관.
  //   beat 즉시가 아니라 봉인 파이프라인 단계로 둔 근거: 소급 변경은 스케줄이 아니라 물리(§9.9),
  //   같은 로그 = 같은 땅(순수 재계산). beat 은 로그만 쌓고 실제 지형 변형은 봉인 1회에 모은다.
  // 현재 땅(=base+delta)에 이번 관객 몫만 굽고, 누적 delta·발길·generation 갱신.
  function applyVisitorErosion(opt) {
    opt = opt || {};
    if (!_base) throw new Error('[variant-strata] buildBase 먼저 호출해야 함');
    var G = _G;
    // 현재 땅
    var land = new Float32Array(G * G);
    var i;
    for (i = 0; i < G * G; i++) land[i] = _base[i] + _delta[i];

    var gen = _generation + 1;
    var rng = mulberry32(seedFromString(_memoryId + ':' + gen));
    var footRead = footNormalized();               // 강화용: 이전까지 발길(정규화)
    var footWrite = new Float32Array(G * G);        // 이번 관객이 남기는 발길
    var ctx = { footRead: footRead, footWrite: footWrite, kReinforce: HANDLES.k_reinforce };

    var massStart = sumArr(land);
    var massLog = { massStart: massStart, forgetDrift: 0, ok: true };
    var beats = run.active ? run.beats : [];
    var patchR = Math.max(6, G * 0.055);

    // ── ⓪ 융기 (W1-6): 이번 관객이 느낀 씬을 그 로브에 퇴적 (국소 해자로 질량 예산 net≈0) ──
    // "올리기·깎기 균형" = 봉우리 올림 + 둘레 해자 팜(국소 상쇄). 그리드 절단 잔차만 미세 균일 보정.
    var upPos = 0, upNeg = 0;
    beats.forEach(function (bt) {
      if (bt.isVoid) return;
      var c = bt.sceneId != null ? _sceneCenters[String(bt.sceneId)] : null;
      var emo = bt.userEmo || bt.sceneEmo;
      if (!c || !emo) return;
      var r = upliftBeatLobes(land, G, c.gx, c.gz, emo, patchR, HANDLES.k_uplift);
      upPos += r.pos; upNeg += r.neg;
    });
    // 잔차(해자 절단분)만 균일 보정 — 전역 침강 아님(먼 벌판 불변).
    var residual = upPos + upNeg;                    // 해자가 완전하면 ≈ 0
    var settle = residual / (G * G);
    if (settle !== 0) for (i = 0; i < G * G; i++) land[i] -= settle;
    var massAfterUplift = sumArr(land);
    massLog.uplift = {
      pos: upPos, neg: upNeg, residual: residual,
      net: massAfterUplift - massStart,             // ≈ 0 (국소 해자 + 잔차 보정)
    };

    // ── ① 침식 (강화 내장): 박자 사이 물길 ──
    massLog.erosionBefore = massAfterUplift;
    var prevWp = null;
    var waterMul = opt.waterMul != null ? opt.waterMul : 1;
    var dropMul = opt.dropMul != null ? opt.dropMul : 1;
    beats.forEach(function (bt) {
      var wp = waypointOf(bt);
      if (prevWp && wp) waterTransition(land, G, prevWp, wp, rng, ctx, waterMul, dropMul);
      prevWp = bt.isVoid ? null : (wp || prevWp);   // void → 경로 단절
    });
    var massAfterErosion = sumArr(land);
    massLog.erosionConserved = Math.abs(massAfterErosion - massLog.erosionBefore);

    // 발길 갱신 (이번 관객 몫 누적)
    for (i = 0; i < G * G; i++) _footTraffic[i] += footWrite[i];
    var footNow = footNormalized();

    // ── ② 망각: 현재 땅에 lerp (발길 적은 칸일수록 강하게). 질량 보존 예외(로그 별도) ──
    var kForget = HANDLES.k_forget;
    var forgotten = new Float32Array(G * G);
    for (i = 0; i < G * G; i++) forgotten[i] = land[i];
    var z, x, ii;
    for (z = 1; z < G - 1; z++) {
      for (x = 1; x < G - 1; x++) {
        ii = z * G + x;
        var nb = (land[ii - 1] + land[ii + 1] + land[ii - G] + land[ii + G] +
                  land[ii - G - 1] + land[ii - G + 1] + land[ii + G - 1] + land[ii + G + 1]) / 8;
        var lam = kForget * (1 - footNow[ii]);
        forgotten[ii] = land[ii] + (nb - land[ii]) * lam;
      }
    }
    for (i = 0; i < G * G; i++) land[i] = forgotten[i];
    var massAfterForget = sumArr(land);
    massLog.forgetDrift = massAfterForget - massAfterErosion;   // lerp라 0 아님 — 정상

    // ── ③ 재응고: 이웃차 > τ_rough 인 칸만 국소 무너짐 (질량 보존) ──
    massLog.thermalBefore = sumArr(land);
    reconsolidate(land, G, _tauRough, 2);
    massLog.thermalAfter = sumArr(land);
    massLog.thermalConserved = Math.abs(massLog.thermalAfter - massLog.thermalBefore);

    // 질량 이상 판정: 융기(net≈0)·침식·재응고는 보존이어야(허용오차). 망각은 예외.
    var tol = Math.max(1e-3, Math.abs(massStart) * 1e-4);
    massLog.uplift.netAbs = Math.abs(massLog.uplift.net);
    massLog.ok = (massLog.uplift.netAbs <= tol) &&
                 (massLog.erosionConserved <= tol) &&
                 (massLog.thermalConserved <= tol);
    massLog.tol = tol;

    // ── ④ 불변량 + delta/generation 확정 ──
    for (i = 0; i < G * G; i++) _delta[i] = land[i] - _base[i];
    _generation = gen;
    _lastInvariants = computeInvariants(land, G, _pMin);

    return {
      delta: roundArr(_delta, 2),
      footMap: footNow,
      generation: _generation,
      invariants: _lastInvariants,
      massLog: massLog,
    };
  }

  // 한 전이의 물 배치: 선분 A→B 위에서 태어나고(개수 ∝ |delta|), 초기 방향=이동 벡터.
  function waterTransition(land, G, A, B, rng, ctx, waterMul, dropMul) {
    var ddx = B.x - A.x, ddz = B.z - A.z;
    var dist = Math.sqrt(ddx * ddx + ddz * ddz);
    var ndx = dist > 1e-6 ? ddx / dist : 0;
    var ndz = dist > 1e-6 ? ddz / dist : 0;
    var count = Math.round((50 + 250 * Math.min(1, dist / (G * 0.5))) * dropMul * HANDLES.erosion_scale);
    if (count < 1) count = 1;
    for (var i = 0; i < count; i++) {
      var t = rng();
      var px = A.x + ddx * t + (rng() * 2 - 1) * 2.5;
      var pz = A.z + ddz * t + (rng() * 2 - 1) * 2.5;
      var dx = ndx, dz = ndz;
      if (dist <= 1e-6) { var ang = rng() * Math.PI * 2; dx = Math.cos(ang); dz = Math.sin(ang); }
      dropOne(land, G,
        Math.min(G - 3, Math.max(1, px)),
        Math.min(G - 3, Math.max(1, pz)),
        dx * waterMul, dz * waterMul, rng, ctx);
    }
    // 주의: 여기서 thermal 을 돌리지 않는다. 비탈 무너짐은 §3 파이프라인의 ③재응고에서
    // 봉인당 1회만 (전이마다 돌리면 500명 누적 시 5000회 확산 → 땅이 평탄해져 features 붕괴).
    // erodeAt 의 반경-3 브러시가 스파이크를 이미 억제한다.
  }

  // ─────────────────── W1-3 : 위상 자 (물 채우기 특징 세기) ───────────────────
  // union-find 서브레벨 필트레이션. 지속도 ≥ pMin 인 국소 최소(분지)/최대(봉우리) 세기.
  //   basins  = countPersistentMinima(land, excludeGlobal=true)   // 전역 '바다'는 특징 아님
  //   peaks   = countPersistentMinima(-land, excludeGlobal=false)  // 가장 높은 봉우리도 특징
  //   features = peaks + basins
  function computeInvariants(field, G, pMin) {
    var peaks = countPersistentExtrema(field, G, pMin, /*peaks*/ true);
    var basins = countPersistentExtrema(field, G, pMin, /*peaks*/ false);
    return {
      features: peaks + basins,
      peaks: peaks,
      basins: basins,
      relief: relief(field),
      roughness: meanNeighborDiff(field, G),
      mass: sumArr(field),
    };
  }

  // union-find 로 서브레벨 필트레이션. peaks=true 면 -field(초레벨) 로 봉우리를 센다.
  // 국소 극값에서 컴포넌트가 태어나고, saddle 에서 병합될 때 젊은(늦게 태어난) 쪽이 죽는다.
  // 지속도 = |saddle - birth| ≥ pMin 인 것 + (peaks면 전역 극값 포함).
  function countPersistentExtrema(field, G, pMin, peaks) {
    var n = G * G;
    var h = field;
    var sign = peaks ? -1 : 1;                 // peaks: -field 의 최소 = field 의 최대
    // 처리 순서: (부호 적용) 오름차순
    var order = new Int32Array(n);
    for (var i = 0; i < n; i++) order[i] = i;
    // 안정 정렬: 값 같으면 index 순 (결정론)
    var arr = Array.prototype.slice.call(order);
    arr.sort(function (a, b) {
      var va = sign * h[a], vb = sign * h[b];
      if (va < vb) return -1; if (va > vb) return 1;
      return a - b;
    });
    var parent = new Int32Array(n);
    var birth = new Float32Array(n);           // 컴포넌트 대표의 birth 값(부호 적용)
    var alive = new Uint8Array(n);             // 셀이 필트레이션에 편입됐는지
    for (i = 0; i < n; i++) parent[i] = -1;
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }

    var count = 0;   // 지속도 ≥ pMin 로 '죽은' 극값 수
    var nbrs = [1, -1, G, -G];
    for (var oi = 0; oi < n; oi++) {
      var c = arr[oi];
      var cx = c % G, cz = (c / G) | 0;
      var cv = sign * h[c];
      parent[c] = c; birth[c] = cv; alive[c] = 1;
      // 이미 편입된 이웃 컴포넌트들과 병합
      for (var d = 0; d < 4; d++) {
        var nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        var nz = cz + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || nx >= G || nz < 0 || nz >= G) continue;
        var nb = nz * G + nx;
        if (!alive[nb]) continue;
        var ra = find(c), rb = find(nb);
        if (ra === rb) continue;
        // 병합: 젊은(birth 큰) 컴포넌트가 죽는다. saddle = cv.
        var younger, older;
        if (birth[ra] >= birth[rb]) { younger = ra; older = rb; } else { younger = rb; older = ra; }
        var persistence = cv - birth[younger];   // ≥ 0
        if (persistence >= pMin) count++;
        parent[younger] = older;                 // older 대표 유지(birth 유지)
        // older 의 birth 는 그대로(더 오래된 극값)
        // find 경로 압축 위해 대표를 older 로
        parent[c] = older; // c 는 어차피 방금 편입, older 밑으로
      }
    }
    // 전역 극값(끝까지 안 죽은 컴포넌트) 처리
    // peaks: 가장 높은 봉우리 = 전역 극값 → 특징으로 센다(+1).
    // basins: 전역 '바다' = 지형의 받침 → 특징 아님(제외).
    if (peaks) count += 1;
    return count;
  }

  function relief(field) {
    var a = Array.prototype.slice.call(field);
    a.sort(function (x, y) { return x - y; });
    var p5 = a[Math.floor(a.length * 0.05)];
    var p95 = a[Math.floor(a.length * 0.95)];
    return p95 - p5;
  }
  function meanNeighborDiff(field, G) {
    var s = 0, cnt = 0, z, x, i;
    for (z = 0; z < G; z++) {
      for (x = 0; x < G; x++) {
        i = z * G + x;
        if (x + 1 < G) { s += Math.abs(field[i] - field[i + 1]); cnt++; }
        if (z + 1 < G) { s += Math.abs(field[i] - field[i + G]); cnt++; }
      }
    }
    return cnt ? s / cnt : 0;
  }
  // 이웃차의 상위 백분위 — 바닥이 '자연히 갖는 가장 가파른 경사'를 잡는다.
  // 재응고 τ_rough 기준(평균은 성긴 봉우리에 눌려 너무 낮아 봉우리를 먹는다).
  function percentileNeighborDiff(field, G, p) {
    var diffs = [], z, x, i;
    for (z = 0; z < G; z++) {
      for (x = 0; x < G; x++) {
        i = z * G + x;
        if (x + 1 < G) diffs.push(Math.abs(field[i] - field[i + 1]));
        if (z + 1 < G) diffs.push(Math.abs(field[i] - field[i + G]));
      }
    }
    if (!diffs.length) return 0;
    diffs.sort(function (a, b) { return a - b; });
    return diffs[Math.min(diffs.length - 1, Math.floor(diffs.length * p))];
  }
  function sumArr(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function roundArr(a, dp) {
    var m = Math.pow(10, dp), out = new Float32Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = Math.round(a[i] * m) / m;
    return out;
  }

  function getInvariants() {
    if (_lastInvariants) return _lastInvariants;
    if (_base) {
      var land = new Float32Array(_G * _G);
      for (var i = 0; i < land.length; i++) land[i] = _base[i] + (_delta ? _delta[i] : 0);
      _lastInvariants = computeInvariants(land, _G, _pMin);
    }
    return _lastInvariants;
  }

  // ─────────────────── serialize / load (§5 저장 계약) ───────────────────
  function serializeLayer() {
    return {
      height_delta: _delta ? Array.prototype.slice.call(roundArr(_delta, 2)) : [],
      foot_map: _footTraffic ? Array.prototype.slice.call(roundArr(footNormalized(), 3)) : [],
      generation: _generation,
      G: _G, SZ: _SZ,
    };
  }
  function loadLayer(layer) {
    if (!layer || !_base) return false;
    var G = _G;
    if (layer.G && layer.G !== G) {
      console.warn('[variant-strata] loadLayer G 불일치 — 무시', layer.G, G);
      return false;
    }
    _delta = Float32Array.from(layer.height_delta || new Float32Array(G * G));
    // 저장된 발길은 정규화(0~1). 내부 traffic 기준선으로 승계(교차-로드는 근사 — §5 캐시).
    _footTraffic = Float32Array.from(layer.foot_map || new Float32Array(G * G));
    _generation = layer.generation || 0;
    var land = new Float32Array(G * G);
    for (var i = 0; i < G * G; i++) land[i] = _base[i] + _delta[i];
    _lastInvariants = computeInvariants(land, G, _pMin);
    return true;
  }

  // ─────────────────── W1-5 : rebuildFromPlays (복구 도구) ───────────────────
  // (user_id, 30분 간격) 세션 군집 → 시간순 베이트 근사 → 전체 재굽기.
  // 근사임을 반환값에 명시(§5·§7). 호출측이 인구 필터(persona_id null 등) 담당.
  function rebuildFromPlays(playRows) {
    if (!_base) throw new Error('[variant-strata] buildBase 먼저 호출해야 함');
    var rows = (playRows || []).slice();
    // 세대 초기화(바닥으로 되돌림)
    _delta = new Float32Array(_G * _G);
    _footTraffic = new Float32Array(_G * _G);
    _generation = 0;

    // (user_id, created_at) 로 정렬 후 30분 간격으로 세션 분할.
    function ts(r) {
      var t = r.created_at || r.createdAt || r.ts || 0;
      if (typeof t === 'number') return t;
      var p = Date.parse(t); return isNaN(p) ? 0 : p;
    }
    rows.sort(function (a, b) {
      var ua = String(a.user_id || a.userId || ''), ub = String(b.user_id || b.userId || '');
      if (ua < ub) return -1; if (ua > ub) return 1;
      return ts(a) - ts(b);
    });
    var GAP = 30 * 60 * 1000;
    var sessions = [];
    var cur = null, lastU = null, lastT = -Infinity;
    rows.forEach(function (r) {
      var u = String(r.user_id || r.userId || '');
      var t = ts(r);
      if (u !== lastU || (t - lastT) > GAP) { cur = []; sessions.push(cur); }
      cur.push(r);
      lastU = u; lastT = t;
    });

    // 세션(=한 관객 여정) 시간순으로 순차 봉인.
    var results = [];
    sessions.forEach(function (sess) {
      beginRun(_memoryId);
      sess.forEach(function (r) {
        beat(_memoryId, {
          sceneId: r.scene_id != null ? r.scene_id : (r.sceneId != null ? r.sceneId : null),
          sceneEmo: r.scene_emotion || r.original_emotion || null,
          userEmo: r.user_emotion || r.userEmo || null,
          isVoid: !!(r.is_void || r.isVoid),
        });
      });
      var out = applyVisitorErosion();
      results.push({ generation: out.generation, features: out.invariants.features, massOk: out.massLog.ok });
    });
    resetRun();

    return {
      approximate: true,
      note: '세션 = (user_id, 30분 간격) 군집 근사. plays 로그가 진실, 이 재굽기는 캐시 복원(§5·§7).',
      generation: _generation,
      sessions: sessions.length,
      plays: rows.length,
      invariants: _lastInvariants,
      perSession: results,
    };
  }

  // ─────────────────── 입구 훅용 computeFields (strata view drop-in) ───────────────────
  // computeAfTerrainFields 와 같은 계약: {G,SZ,H2,hts,cls,minH,maxH}.
  // P = buildMemoryItems 결과. filterIdx null=전체(첫 기억만 바닥으로), 그 외 해당 기억.
  // W1 은 바닥+로드된 delta 를 렌더. 실제 배선(run/봉인)은 W4.
  function computeFields(P, filterIdx, opt, helpers) {
    var m = filterIdx == null ? (P && P[0]) : (P && P[filterIdx]);
    if (!m) return null;
    var scenes = (m.sceneAF || []).map(function (sc) {
      return { id: sc.id, scene_order: sc.order, original_emotion: sc.emo, meta: sc.meta };
    });
    var base = buildBase({ id: m.id, scenes: scenes }, opt);
    // 로드된 delta 있으면 얹어서 현재 땅 반영(없으면 바닥 그대로).
    var G = _G, hts = new Float32Array(G * G);
    for (var i = 0; i < G * G; i++) hts[i] = _base[i] + (_delta ? _delta[i] : 0);
    var mn = Infinity, mx = -Infinity;
    for (i = 0; i < G * G; i++) { if (hts[i] < mn) mn = hts[i]; if (hts[i] > mx) mx = hts[i]; }
    return { G: G, SZ: _SZ, H2: _H2, hts: hts, cls: base.cls, minH: mn, maxH: mx };
  }

  // ─────────────────── 진단/시뮬 접근자 ───────────────────
  function _getState() {
    return {
      G: _G, SZ: _SZ, generation: _generation,
      base: _base, delta: _delta, footTraffic: _footTraffic,
      pMin: _pMin, tauRough: _tauRough, baseFeatures: _baseFeatures,
      sceneCenters: _sceneCenters, handles: HANDLES,
    };
  }
  function _currentLand() {
    if (!_base) return null;
    var land = new Float32Array(_G * _G);
    for (var i = 0; i < _G * _G; i++) land[i] = _base[i] + (_delta ? _delta[i] : 0);
    return land;
  }
  function setHandles(h) { for (var k in h) if (Object.prototype.hasOwnProperty.call(HANDLES, k)) HANDLES[k] = h[k]; }

  global.TemVariantStrata = {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    buildBase: buildBase,
    beginRun: beginRun,
    beat: beat,
    resetRun: resetRun,
    applyVisitorErosion: applyVisitorErosion,
    getInvariants: getInvariants,
    computeInvariants: computeInvariants,   // 시뮬/테스트용 (임의 field)
    serializeLayer: serializeLayer,
    loadLayer: loadLayer,
    rebuildFromPlays: rebuildFromPlays,
    computeFields: computeFields,
    setHandles: setHandles,
    HANDLES: HANDLES,
    // 시뮬/테스트 전용 내부 접근자
    _getState: _getState,
    _currentLand: _currentLand,
    _VAD: VAD, _EC: EC, _KO: KO,
    _version: '1.0-variant-strata',
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.TemVariantStrata;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

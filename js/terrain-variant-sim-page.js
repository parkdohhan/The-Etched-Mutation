// Terrain Variant Strata Simulator — 이본 지층 코어 검증 페이지 (W1-4)
// 설계: docs/이본지층/이본지층_설계_v1-260716.md §3·§4. 엔진: js/shared/tem_variant_strata.js.
// 독립 페이지 (play-test/admin 불변, 롤백 = 파일 삭제).
//
// 하는 일:
//   ① 발자국 실데이터로 작가 바닥(제0판) 결정론 생성 (DB SELECT 2026-07-16 임베드)
//   ② 가짜 관객 N명(기본 500, 여정 프리셋 5종 랜덤 혼합, 씨앗 고정) 순차 봉인
//   ③ 리트머스 5종을 그래프로:
//        ① features 밴드 유지(밴드 = 바닥 features ±60%)
//        ② 500명 후 바닥과 RMS 차이 유의(이본 발생)
//        ③ 셔플 리트머스(같은 관객 순서만 섞으면 다른 땅)
//        ④ 발자국·당신에게 두 기억이 500명 후에도 서로 다른 땅
//        ⑤ 질량 로그 이상 = 0
//   ④ 스냅샷 직렬화 크기 실측 (목표 <150KB/장)

/* global THREE, TemVariantStrata */
(function () {
  'use strict';
  var TVS = window.TemVariantStrata;
  if (!TVS) { console.error('[variant-sim] TemVariantStrata 미로드'); return; }

  // ─────────── 실데이터 임베드 (DB SELECT 2026-07-16) ───────────
  // stage_position 은 world(±) 좌표. original_emotion 그대로(비정규 axis 'emptiness' 는 엔진이 무시).
  var MEMORIES = {
    footprints: {
      id: 'footprints', title: '발자국',
      scenes: [
        { id: 'fp0', scene_order: 0, original_emotion: { joy:0.3, fear:0.2, shame:0.4, longing:0.7, sadness:0.4, isolation:0.6 }, meta: { stage_position: { x:0, z:-18 } } },
        { id: 'fp1', scene_order: 1, original_emotion: { joy:0.3, fear:0.2, longing:0.1, sadness:0.1, confusion:0.6, isolation:0.4 }, meta: { stage_position: { x:16, z:-9 } } },
        { id: 'fp2', scene_order: 2, original_emotion: { joy:0.4, fear:0.1, longing:0.7, sadness:0.2, confusion:0.3, isolation:0.6 }, meta: { stage_position: { x:16, z:9 } } },
        { id: 'fp3', scene_order: 3, original_emotion: { fear:0.4, anger:0.1, guilt:0.2, shame:0.1, longing:0.3, sadness:0.7, numbness:0.6, confusion:0.5, isolation:0.8 }, meta: { stage_position: { x:0, z:18 } } },
        { id: 'fp4', scene_order: 4, original_emotion: { fear:0.2, longing:0.4, sadness:0.3, confusion:0.6 }, meta: { stage_position: { x:-16, z:9 } } },
        { id: 'fp5', scene_order: 5, original_emotion: { fear:0.4, longing:0.3, sadness:0.7, isolation:0.9 }, meta: { stage_position: { x:-16, z:-9 } } },
      ],
    },
    letter: {
      id: 'letter', title: '당신에게',
      scenes: [
        { id:'lt0', scene_order:0, original_emotion:{ shame:0.35, longing:0.2, sadness:0.15, confusion:0.05, isolation:0.25 }, meta:{ stage_position:{ x:30.28, z:-7.676 } } },
        { id:'lt1', scene_order:1, original_emotion:{ fear:0.2, love:0.1, guilt:0.4, shame:0.15, sadness:0.15 }, meta:{ stage_position:{ x:-40.632, z:-17.96 } } },
        { id:'lt2', scene_order:2, original_emotion:{ fear:0.25, love:0.15, longing:0.15, sadness:0.15, confusion:0.3 }, meta:{ stage_position:{ x:-22.066, z:-9.1 } } },
        { id:'lt3', scene_order:3, original_emotion:{ fear:0.1, guilt:0.3, shame:0.05, sadness:0.2, numbness:0.35 }, meta:{ stage_position:{ x:-22.184, z:-1.519 } } },
        { id:'lt4', scene_order:4, original_emotion:{ love:0.15, guilt:0.1, longing:0.25, sadness:0.35, numbness:0.15 }, meta:{ stage_position:{ x:-6.402, z:2.977 } } },
        { id:'lt5', scene_order:5, original_emotion:{ fear:0.1, sadness:0.2, guilt:0.35, longing:0.25 }, meta:{ stage_position:{ x:-17.16, z:31.376 } } },
        { id:'lt6', scene_order:6, original_emotion:{ fear:0.3, love:0.15, longing:0.25, sadness:0.15, numbness:0.15 }, meta:{ stage_position:{ x:-19.262, z:-9.443 } } },
        { id:'lt7', scene_order:7, original_emotion:{ fear:0.4, love:0.2, guilt:0.15, longing:0.15, confusion:0.1 }, meta:{ stage_position:{ x:-15.518, z:-22.703 } } },
        { id:'lt8', scene_order:8, original_emotion:{ fear:0.2, hope:0.1, love:0.15, longing:0.25, confusion:0.3 }, meta:{ stage_position:{ x:17.371, z:-4.677 } } },
        { id:'lt9', scene_order:9, original_emotion:{ fear:0.35, love:0.1, longing:0.3, numbness:0.15, confusion:0.1 }, meta:{ stage_position:{ x:-38.774, z:-5.094 } } },
        { id:'lt10', scene_order:10, original_emotion:{ fear:0.3, love:0.1, longing:0.35, sadness:0.2, confusion:0.05 }, meta:{ stage_position:{ x:-33.744, z:-21.611 } } },
      ],
    },
  };

  // ─────────── page state ───────────
  var G = 96;
  var memKey = 'footprints';
  var SEED = 20260716;
  var N_VISITORS = 500;
  var baseInfo = null;
  var records = [];            // per-sealing: {gen, features, peaks, basins, rms, massOk}
  var visitorLog = [];         // per visitor: {preset, beats}  (셔플 리트머스 재현용)
  var litmus = { rmsFinal: 0, rmsBaseStd: 0, shuffleRms: 0, twoMemRms: 0, massAnoms: 0, snapKB: 0, featBand: null };
  var running = false;

  // ─────────── seeded rng (page-local) ───────────
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function perturb(emo, amt, rng) {
    var out = {};
    for (var k in emo) out[k] = Math.min(1, Math.max(0, emo[k] + (rng() * 2 - 1) * amt));
    return out;
  }
  function addAxis(emo, axis, w) { var o = {}; for (var k in emo) o[k] = emo[k]; o[axis] = Math.min(1, (o[axis] || 0) + w); return o; }
  function shuffled(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = (rng() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ─────────── 여정 프리셋 5종 → beats ───────────
  var PRESETS = {
    '완만 (순행·잔잔)': function (scenes, rng) {
      return scenes.map(function (sc) {
        return { sceneId: sc.id, sceneEmo: sc.original_emotion, userEmo: perturb(sc.original_emotion, 0.08, rng) };
      });
    },
    '널뛰기 (뒤섞임)': function (scenes, rng) {
      return shuffled(scenes, rng).map(function (sc) {
        return { sceneId: sc.id, sceneEmo: sc.original_emotion, userEmo: perturb(sc.original_emotion, 0.3, rng) };
      });
    },
    '고착 (한 자리 맴돎)': function (scenes, rng) {
      var anchor = scenes[(rng() * scenes.length) | 0];
      var beats = [];
      for (var i = 0; i < 6; i++) {
        var sc = (i % 3 === 2) ? scenes[(rng() * scenes.length) | 0] : anchor;
        beats.push({ sceneId: sc.id, sceneEmo: sc.original_emotion, userEmo: perturb(anchor.original_emotion, 0.05, rng) });
      }
      return beats;
    },
    '회피 (침묵 섞임)': function (scenes, rng) {
      return scenes.map(function (sc, i) {
        if (rng() < 0.4) return { sceneId: sc.id, isVoid: true };
        return { sceneId: sc.id, sceneEmo: sc.original_emotion, userEmo: perturb(sc.original_emotion, 0.2, rng) };
      });
    },
    '격정 → 침잠': function (scenes, rng) {
      var n = scenes.length;
      return scenes.map(function (sc, i) {
        var frac = n > 1 ? i / (n - 1) : 0;
        var ue = perturb(sc.original_emotion, 0.15, rng);
        if (frac < 0.5) { ue = addAxis(ue, 'fear', 0.3 * (1 - frac)); ue = addAxis(ue, 'anger', 0.2 * (1 - frac)); }
        else { ue = addAxis(ue, 'numbness', 0.3 * frac); ue = addAxis(ue, 'peace', 0.2 * frac); }
        return { sceneId: sc.id, sceneEmo: sc.original_emotion, userEmo: ue };
      });
    },
  };
  var PRESET_KEYS = Object.keys(PRESETS);

  // ─────────── helpers ───────────
  function rmsDiff(a, b) { var s = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; s += d * d; } return Math.sqrt(s / a.length); }
  function kb(str) { return Math.round(str.length / 1024 * 10) / 10; }
  // 스냅샷 크기 분리 측정: ① 높이맵 스냅샷(§4·§5 Storage, '장') ② 변형층(§5 terrain_layers, delta+foot)
  function measureSnapshot(finalLand) {
    var hm = Array.prototype.slice.call(finalLand).map(function (x) { return Math.round(x * 100) / 100; });
    litmus.snapHeightmapKB = kb(JSON.stringify(hm));                 // 이게 '<150KB/장' 목표 대상
    litmus.snapLayerKB = kb(JSON.stringify(TVS.serializeLayer()));   // terrain_layers 저장분
    litmus.snapKB = litmus.snapHeightmapKB;
    // G=160(strata 뷰 해상도) 외삽 (선형 셀 수 비례)
    litmus.snapHeightmap160KB = Math.round(litmus.snapHeightmapKB * (160 * 160) / (G * G) * 10) / 10;
  }
  function stddev(a) { var m = 0, i; for (i = 0; i < a.length; i++) m += a[i]; m /= a.length; var s = 0; for (i = 0; i < a.length; i++) { var d = a[i] - m; s += d * d; } return Math.sqrt(s / a.length); }
  function el(id) { return document.getElementById(id); }

  // ─────────── 바닥 굽기 ───────────
  function buildBase(key) {
    memKey = key || memKey;
    var mem = MEMORIES[memKey];
    baseInfo = TVS.buildBase({ id: mem.id, scenes: mem.scenes }, { G: G });
    records = [];
    visitorLog = [];
    litmus = { rmsFinal: 0, rmsBaseStd: 0, shuffleRms: 0, twoMemRms: 0, massAnoms: 0, snapKB: 0, featBand: null };
    var f = baseInfo.features;
    litmus.featBand = { lo: f * (1 - TVS.HANDLES.features_band_frac), hi: f * (1 + TVS.HANDLES.features_band_frac), base: f };
    renderLand();
    drawGraphs();
    updateHud('바닥 (제0판) — ' + mem.title);
  }

  // ─────────── 한 관객 ───────────
  function makeVisitor(rng) {
    var mem = MEMORIES[memKey];
    var pk = PRESET_KEYS[(rng() * PRESET_KEYS.length) | 0];
    var beats = PRESETS[pk](mem.scenes, rng);
    return { preset: pk, beats: beats };
  }
  function sealVisitor(v) {
    var mem = MEMORIES[memKey];
    TVS.beginRun(mem.id);
    v.beats.forEach(function (b) { TVS.beat(mem.id, b); });
    return TVS.applyVisitorErosion();
  }

  // ─────────── 500명 흘리기 (배치) ───────────
  function runVisitors(n, thenShuffle) {
    if (running) return;
    running = true;
    N_VISITORS = n;
    buildBase(memKey);
    var baseLand = Float32Array.from(TVS._currentLand());
    litmus.rmsBaseStd = stddev(baseLand);
    var rng = mulberry32(SEED ^ (memKey === 'letter' ? 0x1111 : 0));
    var i = 0, massAnoms = 0;
    var t0 = performance.now();

    function chunk() {
      var end = Math.min(i + 15, n);
      for (; i < end; i++) {
        var v = makeVisitor(rng);
        visitorLog.push(v);
        var out = sealVisitor(v);
        if (!out.massLog.ok) massAnoms++;
        var land = TVS._currentLand();
        records.push({
          gen: out.generation,
          features: out.invariants.features,
          peaks: out.invariants.peaks,
          basins: out.invariants.basins,
          rms: rmsDiff(land, baseLand),
          massOk: out.massLog.ok,
        });
      }
      litmus.massAnoms = massAnoms;
      renderLand();
      drawGraphs();
      updateHud('관객 ' + i + '/' + n + ' 봉인 중…');
      if (i < n) { requestAnimationFrame(chunk); return; }

      // 완료
      var finalLand = Float32Array.from(TVS._currentLand());
      litmus.rmsFinal = rmsDiff(finalLand, baseLand);
      measureSnapshot(finalLand);
      var lastFeat = records[records.length - 1].features;
      var band = litmus.featBand;
      litmus.featOk = lastFeat >= Math.floor(band.lo) && lastFeat <= Math.ceil(band.hi);
      var dt = Math.round(performance.now() - t0);
      running = false;
      renderLand();
      drawGraphs();
      updateHud('완료 — 관객 ' + n + '명 · ' + dt + 'ms · RMS ' + litmus.rmsFinal.toFixed(3));
      console.log('[variant-sim] 500명 완료', litmus, 'snapKB=', litmus.snapKB, 'dt=', dt);
      if (thenShuffle) setTimeout(shuffleLitmus, 30);
    }
    requestAnimationFrame(chunk);
  }

  // ─────────── ③ 셔플 리트머스: 같은 관객, 순서만 섞기 ───────────
  function shuffleLitmus() {
    if (!visitorLog.length) { updateHud('먼저 500명 흘리기'); return; }
    var savedFinal = Float32Array.from(TVS._currentLand());  // 정상 순서 결과
    // 같은 관객 목록, 순서만 셔플
    var rng = mulberry32(SEED * 31 + 13);
    var order = shuffled(visitorLog.map(function (_, i) { return i; }), rng);
    TVS.buildBase({ id: MEMORIES[memKey].id, scenes: MEMORIES[memKey].scenes }, { G: G });
    order.forEach(function (idx) { sealVisitor(visitorLog[idx]); });
    var shufFinal = Float32Array.from(TVS._currentLand());
    litmus.shuffleRms = rmsDiff(shufFinal, savedFinal);
    // 원상 복구(정상 순서 재굽기 — 화면/후속 검증 일관성)
    TVS.buildBase({ id: MEMORIES[memKey].id, scenes: MEMORIES[memKey].scenes }, { G: G });
    visitorLog.forEach(function (v) { sealVisitor(v); });
    renderLand();
    drawGraphs();
    updateHud('셔플 리트머스 — RMS ' + litmus.shuffleRms.toFixed(3) + (litmus.shuffleRms > litmus.rmsBaseStd * 0.05 ? ' ✓ 순서가 땅에 새겨짐' : ' ✗ 순서 효과 미미'));
  }

  // ─────────── ④ 두 기억 비교 ───────────
  function twoMemoryLitmus() {
    if (running) return;
    updateHud('두 기억 500명씩 굽는 중…');
    running = true;
    setTimeout(function () {
      // 발자국
      TVS.buildBase({ id: MEMORIES.footprints.id, scenes: MEMORIES.footprints.scenes }, { G: G });
      var rngF = mulberry32(SEED);
      memKey = 'footprints';
      for (var i = 0; i < 300; i++) sealVisitor(makeVisitor(rngF));
      var landF = Float32Array.from(TVS._currentLand());
      // 당신에게
      TVS.buildBase({ id: MEMORIES.letter.id, scenes: MEMORIES.letter.scenes }, { G: G });
      var rngL = mulberry32(SEED ^ 0x1111);
      memKey = 'letter';
      for (i = 0; i < 300; i++) sealVisitor(makeVisitor(rngL));
      var landL = Float32Array.from(TVS._currentLand());
      litmus.twoMemRms = rmsDiff(landF, landL);
      running = false;
      // 화면은 발자국으로 복귀
      memKey = 'footprints';
      buildBase('footprints');
      updateHud('두 기억 비교 — RMS ' + litmus.twoMemRms.toFixed(3) + ' (서로 다른 땅 ' + (litmus.twoMemRms > 0.5 ? '✓' : '✗') + ')');
    }, 20);
  }

  // ─────────── HUD ───────────
  function updateHud(now) {
    var inv = TVS.getInvariants() || {};
    var st = TVS._getState();
    el('hud-now').textContent = now || '—';
    el('hud-mem').textContent = MEMORIES[memKey].title;
    el('hud-gen').textContent = st.generation + '세대';
    el('hud-feat').textContent = (inv.features != null ? inv.features : '—') + ' (봉우리 ' + (inv.peaks != null ? inv.peaks : '—') + ' · 분지 ' + (inv.basins != null ? inv.basins : '—') + ')';
    el('hud-relief').textContent = inv.relief != null ? inv.relief.toFixed(2) : '—';
    el('hud-rough').textContent = inv.roughness != null ? inv.roughness.toFixed(3) : '—';
    el('hud-mass').textContent = inv.mass != null ? inv.mass.toFixed(0) : '—';
    el('hud-band').textContent = litmus.featBand ? (Math.floor(litmus.featBand.lo) + '~' + Math.ceil(litmus.featBand.hi) + ' (바닥 ' + litmus.featBand.base + ')') : '—';
    el('hud-anom').textContent = litmus.massAnoms + ' 이상';
    el('hud-snap').textContent = litmus.snapKB ? litmus.snapKB + ' KB' : '—';
    el('hud-handles').textContent = 'k_reinf ' + TVS.HANDLES.k_reinforce + ' · k_forget ' + TVS.HANDLES.k_forget + ' · τ×' + TVS.HANDLES.tau_rough_mult;
  }

  // ─────────── 리트머스 그래프 (2D 캔버스) ───────────
  var gc = el('graph');
  var gctx = gc.getContext('2d');
  function drawGraphs() {
    var W = gc.width, H = gc.height;
    gctx.clearRect(0, 0, W, H);
    gctx.fillStyle = 'rgba(10,10,16,0.85)';
    gctx.fillRect(0, 0, W, H);
    var pad = 28, gw = W - pad * 2, gh = (H - pad * 3) / 2;

    // 상단: features (①) — 밴드 + 선
    var y0 = pad;
    drawPanel(pad, y0, gw, gh, '① features (봉우리+분지) · 밴드 = 바닥 ±60%', function (x, y, w, h) {
      if (!litmus.featBand) return;
      var b = litmus.featBand;
      var maxF = Math.max(b.hi * 1.2, b.base * 1.5, 4);
      function fy(v) { return y + h - (v / maxF) * h; }
      // 밴드
      gctx.fillStyle = 'rgba(120,160,110,0.15)';
      gctx.fillRect(x, fy(b.hi), w, fy(b.lo) - fy(b.hi));
      gctx.strokeStyle = 'rgba(120,160,110,0.5)'; gctx.setLineDash([4, 3]);
      line(x, fy(b.base), x + w, fy(b.base)); gctx.setLineDash([]);
      // 선
      if (records.length) {
        gctx.strokeStyle = '#c4a882'; gctx.beginPath();
        records.forEach(function (r, i) {
          var px = x + (records.length === 1 ? 0 : i / (records.length - 1) * w);
          var py = fy(r.features);
          if (i === 0) gctx.moveTo(px, py); else gctx.lineTo(px, py);
        });
        gctx.stroke();
      }
    });

    // 하단: RMS vs 바닥 (②)
    var y1 = pad * 2 + gh;
    drawPanel(pad, y1, gw, gh, '② 바닥과 RMS 차이 (이본 발생) — 최종 ' + litmus.rmsFinal.toFixed(3), function (x, y, w, h) {
      if (!records.length) return;
      var maxR = 0; records.forEach(function (r) { if (r.rms > maxR) maxR = r.rms; });
      maxR = Math.max(maxR, 1e-6);
      function ry(v) { return y + h - (v / maxR) * h; }
      gctx.strokeStyle = '#88aacc'; gctx.beginPath();
      records.forEach(function (r, i) {
        var px = x + (records.length === 1 ? 0 : i / (records.length - 1) * w);
        var py = ry(r.rms);
        if (i === 0) gctx.moveTo(px, py); else gctx.lineTo(px, py);
      });
      gctx.stroke();
      // 바닥 표준편차 대비 기준선
      gctx.strokeStyle = 'rgba(200,120,120,0.4)'; gctx.setLineDash([3, 3]);
      var thr = litmus.rmsBaseStd * 0.05;
      if (thr < maxR) line(x, ry(thr), x + w, ry(thr));
      gctx.setLineDash([]);
    });

    // 요약 수치 (③④⑤ + 스냅샷)
    gctx.fillStyle = '#99a'; gctx.font = '10px "Courier New",monospace';
    var sy = H - 8;
    var s3 = '③셔플 RMS ' + litmus.shuffleRms.toFixed(3);
    var s4 = '④두기억 RMS ' + litmus.twoMemRms.toFixed(3);
    var s5 = '⑤질량이상 ' + litmus.massAnoms;
    var s6 = '스냅 ' + (litmus.snapKB || '—') + 'KB';
    gctx.fillText(s3 + '   ' + s4 + '   ' + s5 + '   ' + s6, pad, sy);
  }
  function drawPanel(x, y, w, h, title, body) {
    gctx.strokeStyle = 'rgba(80,80,110,0.4)'; gctx.strokeRect(x, y, w, h);
    gctx.fillStyle = '#778'; gctx.font = '10px "Courier New",monospace';
    gctx.fillText(title, x + 2, y - 4);
    body(x, y, w, h);
  }
  function line(x0, y0, x1, y1) { gctx.beginPath(); gctx.moveTo(x0, y0); gctx.lineTo(x1, y1); gctx.stroke(); }

  // ─────────── three.js 지형 렌더 ───────────
  var canvas = el('c');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(0, 95, 120);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a10);
  scene.fog = new THREE.Fog(0x0a0a10, 180, 420);
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  scene.add(new THREE.AmbientLight(0x8890aa, 0.55));
  var sun = new THREE.DirectionalLight(0xfff2dd, 0.95); sun.position.set(60, 120, 40); scene.add(sun);

  var terrain = null;
  var RAMP = [
    [0.00, 0x0e0e16], [0.32, 0x2c2c3c], [0.58, 0x655a48], [0.80, 0x9c8760], [1.00, 0xe0cba2],
  ].map(function (s) { return [s[0], new THREE.Color(s[1])]; });
  function rampColor(t) {
    for (var i = 1; i < RAMP.length; i++) {
      if (t <= RAMP[i][0]) {
        var t0 = RAMP[i - 1][0], t1 = RAMP[i][0];
        return RAMP[i - 1][1].clone().lerp(RAMP[i][1], (t - t0) / (t1 - t0));
      }
    }
    return RAMP[RAMP.length - 1][1].clone();
  }

  function renderLand() {
    var land = TVS._currentLand();
    if (!land) return;
    var st = TVS._getState();
    var Gg = st.G, SZ = st.SZ;
    if (terrain && terrain.userData.G !== Gg) { scene.remove(terrain); terrain.geometry.dispose(); terrain.material.dispose(); terrain = null; }
    if (!terrain) {
      var geo = new THREE.PlaneGeometry(SZ, SZ, Gg - 1, Gg - 1); geo.rotateX(-Math.PI / 2);
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Gg * Gg * 3), 3));
      var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
      terrain = new THREE.Mesh(geo, mat); terrain.userData.G = Gg; scene.add(terrain);
    }
    var pos = terrain.geometry.attributes.position, col = terrain.geometry.attributes.color;
    var mn = Infinity, mx = -Infinity, i;
    for (i = 0; i < land.length; i++) { if (land[i] < mn) mn = land[i]; if (land[i] > mx) mx = land[i]; }
    var span = Math.max(1e-6, mx - mn);
    var baseCls = baseInfo && baseInfo.cls;
    for (i = 0; i < land.length; i++) {
      pos.setY(i, land[i]);
      var t = (land[i] - mn) / span;
      var c = rampColor(t);
      if (baseCls) {
        // 바닥 감정색을 지형 명암과 블렌드 (읽히게)
        c = c.clone().lerp(new THREE.Color(baseCls[i * 3], baseCls[i * 3 + 1], baseCls[i * 3 + 2]), 0.4);
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    terrain.geometry.computeVertexNormals();
  }

  // ─────────── UI 배선 ───────────
  var memSel = el('mem');
  Object.keys(MEMORIES).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = MEMORIES[k].title; memSel.appendChild(o); });
  memSel.addEventListener('change', function () { buildBase(memSel.value); });

  var gSel = el('gres');
  [64, 96, 128, 160].forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v + '×' + v; if (v === G) o.selected = true; gSel.appendChild(o); });
  gSel.addEventListener('change', function () { G = parseInt(gSel.value, 10); buildBase(memKey); });

  el('btn-base').addEventListener('click', function () { buildBase(memKey); });
  el('btn-500').addEventListener('click', function () { runVisitors(500, false); });
  el('btn-shuffle').addEventListener('click', shuffleLitmus);
  el('btn-two').addEventListener('click', twoMemoryLitmus);
  el('btn-all').addEventListener('click', function () { runVisitors(500, true); });

  function bindHandle(id, key, fmt) {
    var inp = el(id), lab = el(id + '-val');
    inp.addEventListener('input', function () { var v = parseFloat(inp.value); lab.textContent = fmt ? fmt(v) : v; var h = {}; h[key] = v; TVS.setHandles(h); });
    inp.addEventListener('change', function () { buildBase(memKey); });
    lab.textContent = fmt ? fmt(parseFloat(inp.value)) : inp.value;
  }
  bindHandle('h-reinf', 'k_reinforce');
  bindHandle('h-forget', 'k_forget');
  bindHandle('h-tau', 'tau_rough_mult');

  // ─────────── loop ───────────
  function fit() { var w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', fit); fit();
  buildBase('footprints');
  (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

  // ─────────── 동기 실행 (자동화/검증용 — rAF 배치 없이 한 번에) ───────────
  // 리트머스 5종을 한 호출로 산출해 반환. 화면도 최종 상태로 갱신.
  function runAllSync(n) {
    n = n || 500;
    // ① 바닥 + 500명
    buildBase(memKey);
    var baseLand = Float32Array.from(TVS._currentLand());
    litmus.rmsBaseStd = stddev(baseLand);
    var rng = mulberry32(SEED ^ (memKey === 'letter' ? 0x1111 : 0));
    var massAnoms = 0, i;
    for (i = 0; i < n; i++) {
      var v = makeVisitor(rng);
      visitorLog.push(v);
      var out = sealVisitor(v);
      if (!out.massLog.ok) massAnoms++;
      var land = TVS._currentLand();
      records.push({ gen: out.generation, features: out.invariants.features, peaks: out.invariants.peaks, basins: out.invariants.basins, rms: rmsDiff(land, baseLand), massOk: out.massLog.ok });
    }
    litmus.massAnoms = massAnoms;
    var finalLand = Float32Array.from(TVS._currentLand());
    litmus.rmsFinal = rmsDiff(finalLand, baseLand);
    measureSnapshot(finalLand);
    var lastFeat = records[records.length - 1].features;
    litmus.featOk = lastFeat >= Math.floor(litmus.featBand.lo) && lastFeat <= Math.ceil(litmus.featBand.hi);

    // ③ 셔플 리트머스 (같은 관객, 순서만 섞기)
    var rng2 = mulberry32(SEED * 31 + 13);
    var order = shuffled(visitorLog.map(function (_, k) { return k; }), rng2);
    TVS.buildBase({ id: MEMORIES[memKey].id, scenes: MEMORIES[memKey].scenes }, { G: G });
    order.forEach(function (idx) { sealVisitor(visitorLog[idx]); });
    litmus.shuffleRms = rmsDiff(Float32Array.from(TVS._currentLand()), finalLand);

    // 정상 순서 복구 (화면 일관성) + 침식 결과 저장
    TVS.buildBase({ id: MEMORIES[memKey].id, scenes: MEMORIES[memKey].scenes }, { G: G });
    visitorLog.forEach(function (v2) { sealVisitor(v2); });
    var erodedLayer = TVS.serializeLayer();

    // ④ 두 기억 비교 (각 300명) — 엔진 상태를 흩뜨리므로 뒤에 복구
    litmus.twoMemRms = twoMemorySyncCompute(300);

    // 발자국 침식 결과 복원 (최종 스크린샷용)
    buildBaseSilent(memKey);
    TVS.loadLayer(erodedLayer);

    renderLand(); drawGraphs();
    updateHud('완료(동기) — ' + n + '명 · RMS ' + litmus.rmsFinal.toFixed(3));
    return {
      base: { features: litmus.featBand.base, band: [Math.floor(litmus.featBand.lo), Math.ceil(litmus.featBand.hi)] },
      finalFeatures: lastFeat, featOk: litmus.featOk,
      rmsFinal: +litmus.rmsFinal.toFixed(4), rmsBaseStd: +litmus.rmsBaseStd.toFixed(4),
      shuffleRms: +litmus.shuffleRms.toFixed(4), twoMemRms: +litmus.twoMemRms.toFixed(4),
      massAnoms: litmus.massAnoms,
      snapHeightmapKB: litmus.snapHeightmapKB, snapLayerKB: litmus.snapLayerKB, snapHeightmap160KB: litmus.snapHeightmap160KB,
      featSeries: records.map(function (r) { return r.features; }),
      peaksMinMax: minMax(records.map(function (r) { return r.peaks; })),
      basinsMinMax: minMax(records.map(function (r) { return r.basins; })),
    };
  }
  function twoMemorySyncCompute(n) {
    var savedMem = memKey;
    TVS.buildBase({ id: MEMORIES.footprints.id, scenes: MEMORIES.footprints.scenes }, { G: G });
    memKey = 'footprints';
    var rF = mulberry32(SEED);
    for (var i = 0; i < n; i++) sealVisitor(makeVisitor(rF));
    var landF = Float32Array.from(TVS._currentLand());
    TVS.buildBase({ id: MEMORIES.letter.id, scenes: MEMORIES.letter.scenes }, { G: G });
    memKey = 'letter';
    var rL = mulberry32(SEED ^ 0x1111);
    for (i = 0; i < n; i++) sealVisitor(makeVisitor(rL));
    var landL = Float32Array.from(TVS._currentLand());
    memKey = savedMem;
    // 엔진 상태 복원은 호출측(runAllSync)이 erodedLayer 로 처리.
    return rmsDiff(landF, landL);
  }
  function buildBaseSilent(key) { var m = MEMORIES[key]; TVS.buildBase({ id: m.id, scenes: m.scenes }, { G: G }); }

  // 손잡이 스윕 (보정용): 각 설정으로 n명 굽고 평형·밴드·질량을 사분위 체크포인트로 반환.
  function sweep(cfgs, n) {
    n = n || 500;
    var save = {}; Object.keys(TVS.HANDLES).forEach(function (k) { save[k] = TVS.HANDLES[k]; });
    var out = cfgs.map(function (cfg) {
      TVS.setHandles(cfg);
      var m = MEMORIES[memKey];
      TVS.buildBase({ id: m.id, scenes: m.scenes }, { G: G });
      var baseLand = Float32Array.from(TVS._currentLand());
      var baseFeat = TVS.getInvariants().features;
      var rng = mulberry32(SEED);
      var featMin = baseFeat, featMax = baseFeat, massAnoms = 0;
      var cp = {}, marks = [Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n];
      for (var i = 1; i <= n; i++) {
        var out2 = sealVisitor(makeVisitor(rng));
        if (!out2.massLog.ok) massAnoms++;
        var f = out2.invariants.features;
        if (f < featMin) featMin = f; if (f > featMax) featMax = f;
        if (marks.indexOf(i) >= 0) cp[i] = { f: f, rms: +rmsDiff(TVS._currentLand(), baseLand).toFixed(3) };
      }
      return {
        cfg: cfg, baseFeat: baseFeat, featMin: featMin, featMax: featMax,
        band: [Math.floor(baseFeat * 0.4), Math.ceil(baseFeat * 1.6)],
        cp: cp, massAnoms: massAnoms, baseStd: +stddev(baseLand).toFixed(3),
      };
    });
    TVS.setHandles(save);
    return out;
  }
  // ⑦ 1인 가시성: 바닥에서 1명만 봉인 → 그 봉인의 delta(RMS·최대) 반환.
  function oneVisitorVisibility() {
    var m = MEMORIES[memKey];
    TVS.buildBase({ id: m.id, scenes: m.scenes }, { G: G });
    var before = Float32Array.from(TVS._currentLand());
    var rng = mulberry32(SEED + 777);
    var out = sealVisitor(makeVisitor(rng));
    var after = TVS._currentLand();
    var maxAbs = 0; for (var i = 0; i < after.length; i++) maxAbs = Math.max(maxAbs, Math.abs(after[i] - before[i]));
    return { rms: +rmsDiff(after, before).toFixed(4), maxDelta: +maxAbs.toFixed(3), baseStd: +stddev(before).toFixed(3), massOk: out.massLog.ok, uplift: out.massLog.uplift };
  }
  function minMax(arr) { var mn = Infinity, mx = -Infinity; arr.forEach(function (v) { if (v < mn) mn = v; if (v > mx) mx = v; }); return [mn, mx]; }

  // 콘솔 자동화용 훅 (MCP 스크린샷 시나리오)
  window._variantSim = {
    buildBase: buildBase, runVisitors: runVisitors, shuffleLitmus: shuffleLitmus,
    twoMemoryLitmus: twoMemoryLitmus, runAllSync: runAllSync, sweep: sweep,
    oneVisitorVisibility: oneVisitorVisibility,
    // ⑦ 1봉인 전후 스크린샷용 (렌더 포함)
    visBefore: function () { buildBase(memKey); updateHud('⑦ 바닥 (1봉인 전)'); return { features: TVS.getInvariants().features }; },
    visAfter: function () {
      var rng = mulberry32(SEED + 777);
      var before = Float32Array.from(TVS._currentLand());
      var out = sealVisitor(makeVisitor(rng));
      renderLand(); drawGraphs();
      var after = TVS._currentLand();
      var mx = 0; for (var i = 0; i < after.length; i++) mx = Math.max(mx, Math.abs(after[i] - before[i]));
      updateHud('⑦ 1명 봉인 후 — maxΔ ' + mx.toFixed(2));
      return { rms: +rmsDiff(after, before).toFixed(4), maxDelta: +mx.toFixed(3), uplift: out.massLog.uplift };
    },
    getLitmus: function () { return litmus; },
    getRecords: function () { return records; }, isRunning: function () { return running; },
  };
})();

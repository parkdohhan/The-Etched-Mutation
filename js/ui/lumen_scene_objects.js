/**
 * Lumen Scene Objects — 사물 모티프 지형 조형 (1단계 슬라이스)
 *
 * docs/사물모티프_지형조형_설계-260712.md v1.1
 * "시계는 처음부터 거기 있었지만, 그대로 있는 건 아니다."
 * 유령(사람의 잔상)만 서 있던 지형에 장소의 잔상 — 그 장면의 사물 — 을 세운다.
 *
 * 1단계 범위 (이 파일):
 *   - 절차적 블록 클러스터: 단어 해시 → 항상 같은 형체 (§2.1)
 *   - 처음부터 무대에 있음 + 거리 안개만, 오염/접근성 게이팅 없음 (§2.2)
 *   - 배치 = scene_order 사슬 길목, 접근성과 무관한 고정 좌표 (§2.5 — 순간이동 함정 회피)
 *   - 근접 시 단어 + 원문 문장 배어남 (§2.4 문장 운반자 — 저작 비용 0 자동 추출)
 * 2단계(되새김 stage 동기·붕괴)는 룩 승인 후 별도 슬라이스.
 *
 * 원칙: tem_af_strata_terrain.js 한 글자도 안 건드림 (마네킹 모듈과 동일).
 * render wrap 은 조형 페이드/라벨만 — 카메라 안 건드림.
 *
 * 사용 (play-test.html):
 *   LumenSceneObjects.attach(rt, { getScenePins: function () { return _fpScenePins; } });
 *   rt.__lumenSceneObjects.rebuild();   // 핀 빌드 직후 (마네킹 rebuild 옆)
 *   rt.__lumenSceneObjects.clear();     // 회차 종료 (되새김 clear 옆)
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    getScenePins: null,          // () => Array<_fpScenePins 원소> (전 장면 — accessible 무관)
    maxPerScene: 2,              // 씬당 사물 상한 (설계 §3.1)
    // §3.3 룩 튜닝 — 조형 레시피/팔레트. 콘솔에서 LumenSceneObjects.setLook('cairn','ash')
    look: 'stack',               // stack(현행) | cairn(돌탑) | shards(파편) | volume(덩어리)
    palette: 'ocher',            // ocher(황토) | ash(재) | bone(뼈)
    // 260730 GLB 사물 모델 — memories.meta.object_models = { 단어: { path, scale?, rotX?, rotY?, rotZ? } }
    // 모델이 있는 단어는 GLB 로 서고, 없는 단어는 블록 대역 유지 ("만질 수 없는 것은 응결되지 않는다").
    getObjectModels: null,       // () => ({ 단어: entry }) | null — 기억 단위 (play-test 배선)
    modelMaxDim: 1.15,           // 모델 최대 변 길이(m) 표준화 — entry.scale 로 단어별 배율
    modelNearOpacity: 0.92,      // 모델 근접 불투명도 — 유령(0.72)보다 또렷하게 ("증거물")
    modelEmissive: 0.4,          // 밤에도 제 색을 내는 자가발광 강도 (텍스처 색 유지, 0~1)
    // 거리 안개 — 유령 검증값 차용 (설계 §2.2)
    fadeNear: 6,
    fadeFar: 26,
    baseOpacity: 0.14,
    nearOpacity: 0.72,
    // 라벨 (단어 + 원문 문장)
    // 260730 'click' = 사물을 겨눠 **길게 눌러** 하단 대화창풍 창에 표시 (기본)
    //   씬 진입과 같은 동작으로 통일 — 겨눈 대상만 다르다 (사물=열람 / 유령=씬 진입)
    // 'float' = 구버전 공중 부유 스프라이트 (롤백용)
    labelMode: 'click',
    clickRange: 9,               // 열람 최대 거리(m)
    holdMs: null,                // null = play-test 의 LONG_PRESS_MS 를 따름 (없으면 800)
    labelNear: 4.5,              // float 모드: 이 안쪽에서 라벨 페이드인
    labelOpacity: 0.92,
    // 길목 배치 (설계 §2.5)
    segT: [0.35, 0.65],          // 사슬 선분 위 위치 범위
    perpMin: 1.0, perpMax: 3.0,  // 선분에서 수직 이탈 (마네킹·동선과 겹침 방지)
    // 2단계 — 되새김 동기 (설계 §3.2): 입에 담을수록 또렷, 3회+ 붕괴
    recallSync: true,
    recallPollMs: 1000,          // 되새김 내부 dimTimer 와 같은 저비용 폴링
    stageFloor: [0, 0.30, 0.48], // stage 1·2 의 최소 밝기 (멀리서도 "밝아진" 게 보이게)
    stageGlow: [0, 0.35, 0.75],  // stage 1·2 의 발광(emissive) 강도
    collapseKeepRatio: 0.55,     // 붕괴 시 잔해로 남는 블록 비율 ("무너진 기억"도 기억)
    collapseMs: 1400,
    collapsedDim: 0.55,          // 잔해 밝기 배율
    // 260802 노출 게이트 (사용자 결정: "시작하면 씬1 것만") — 열린/방문한 씬의 사물만 세운다.
    //   (scene) => bool. 미설정 = 전 씬(기존 §2.2). 좌표는 전체 계산 그대로라 등장 시점만 달라짐
    //   (순간이동 함정 회피 원칙 유지 — 자리는 불변, 노출만 게이트).
    sceneGate: null,
    // 260802 심볼 중복 제외 — 그 씬의 "상징 사물"(유령 몸이 된 단어)은 일반 사물로 또 세우지
    //   않는다 (같은 모형이 크게+작게 두 번 서는 혼동 방지). (scene) => word | null.
    excludeWordForScene: null,
  };

  // ─── 결정적 PRNG (lumen_recalled_anchors / mannequins 와 동일 문법) ───
  function _hash(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function _rng(seed) {
    var a = _hash(seed);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ─── GLB 모델 로더 캐시 (260730) — 같은 path 는 한 번만 내려받고 clone 으로 복제 ───
  var _glbCache = {};
  function _loadModelTemplate(path) {
    var THREE = (typeof window !== 'undefined' ? window : globalThis).THREE;
    if (!THREE || !THREE.GLTFLoader) return Promise.reject(new Error('GLTFLoader 없음'));
    if (!_glbCache[path]) {
      _glbCache[path] = new Promise(function (res, rej) {
        new THREE.GLTFLoader().load(path, function (g) { res(g.scene); }, undefined, rej);
      });
    }
    return _glbCache[path];
  }

  // 씬 본문에서 그 단어가 든 문장 자동 추출 (§2.4). 여러 개면 해시 픽, 없으면 null.
  // 작가 오버라이드: scene.meta.object_lines[word]
  function _pickSentence(word, scene) {
    var meta = (scene && scene.meta) || {};
    if (meta.object_lines && typeof meta.object_lines[word] === 'string') {
      return meta.object_lines[word];
    }
    var text = (scene && scene.text) || '';
    if (!text) return null;
    // 260802: 부분 문자열 오탐 차단 — "물"이 "제물"에, "눈"이 "눈물"에 걸리던 것.
    //   단어 앞 글자가 한글이면 다른 단어의 꼬리다. 뒤는 조사(물이/물을)라 한글 허용.
    var wordRe;
    try {
      wordRe = new RegExp('(^|[^가-힣])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    } catch (_) { wordRe = null; }
    var all = text.split(/(?<=[.!?。])\s+/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    var idxs = [];
    for (var si = 0; si < all.length; si++) {
      if (all[si].length < 4) continue;
      if (wordRe ? wordRe.test(all[si]) : all[si].indexOf(word) !== -1) idxs.push(si);
    }
    if (!idxs.length) return null;
    var r = _rng('line|' + word);
    var hit = idxs[Math.floor(r() * idxs.length)];
    // 260802c: 단답 → 본문 발췌 (사용자 결정 — 유령 아닌 사물이 스토리를 나른다).
    // 260802e: 최소 3문장 보장, 길어도 됨(최대 ~4문장) — "스토리 이해" 용 (사용자 지시).
    var from = Math.max(0, hit - 1);
    var to = Math.min(all.length - 1, hit + 2);
    while ((to - from + 1) < 3 && (from > 0 || to < all.length - 1)) {
      if (from > 0) from--;
      else to++;
    }
    return all.slice(from, to + 1).join(' ');
  }

  function attach(runtime, opts) {
    if (!runtime) { console.error('[lumen-scene-objects] runtime required'); return null; }
    if (runtime.__lumenSceneObjects) return runtime.__lumenSceneObjects;
    opts = Object.assign({}, DEFAULTS, opts || {});

    var THREE = global.THREE;
    var scene3 = runtime.getScene && runtime.getScene();
    var renderer = runtime.getRenderer && runtime.getRenderer();
    if (!THREE || !scene3 || !renderer || typeof renderer.render !== 'function') {
      console.warn('[lumen-scene-objects] THREE/scene/renderer 없음 — 비활성');
      return null;
    }

    var _objects = [];  // [{ group, mats:[], label, labelMat, cx, cz, word }]

    // ─── 조형: 단어 해시 → 블록 클러스터 (같은 단어 = 항상 같은 형체) ───
    // §3.3 룩 튜닝: 형체 레시피(LOOKS)만 갈아끼운다. 배치·페이드·라벨·되새김·붕괴는
    // blocks 계약({mesh, mat, h})만 지키면 전부 그대로 생존한다 (설계의 교체 탈출구).
    // 모든 레시피는 결정적 — 시드는 'obj|'+word 하나. Math.random 금지.

    var PALETTES = {
      ocher: { hue: [0.07, 0.13], sat: [0.10, 0.24], lig: [0.52, 0.68] }, // 현행 — 마른 흙
      ash:   { hue: [0.55, 0.61], sat: [0.03, 0.09], lig: [0.44, 0.58] }, // 차가운 재
      bone:  { hue: [0.09, 0.12], sat: [0.04, 0.12], lig: [0.66, 0.80] }, // 바랜 뼈
    };
    function _paletteColor(r) {
      var p = PALETTES[opts.palette] || PALETTES.ocher;
      return new THREE.Color().setHSL(
        p.hue[0] + r() * (p.hue[1] - p.hue[0]),
        p.sat[0] + r() * (p.sat[1] - p.sat[0]),
        p.lig[0] + r() * (p.lig[1] - p.lig[0])
      );
    }

    // 각 룩: (r) => { col, specs: [{w,h,d,x,y,z,rotY,tilt?}] }
    var LOOKS = {
      // 현행 유지 — r() 소비 순서까지 종전 코드와 동일 (같은 단어 = 종전과 같은 형체)
      stack: function (r) {
        var n = 6 + Math.floor(r() * 9);            // 블록 6~14개
        var col = _paletteColor(r);
        var specs = [];
        var accum = 0;                               // 세로 응집형 스택
        for (var i = 0; i < n; i++) {
          var w = 0.07 + r() * 0.26;
          var h = 0.05 + r() * 0.22;
          var d = 0.07 + r() * 0.26;
          // 수직 스택 + 수평 산포(위로 갈수록 좁게) — "쌓인 것"의 실루엣
          var spread = 0.30 * (1 - accum / 1.4);
          specs.push({
            w: w, h: h, d: d,
            x: (r() * 2 - 1) * spread, y: accum + h / 2, z: (r() * 2 - 1) * spread,
            rotY: (r() * 2 - 1) * 0.5,
          });
          accum += h * (0.55 + r() * 0.4);           // 살짝 겹치며 쌓임
          if (accum > 1.25) break;
        }
        return { col: col, specs: specs };
      },
      // 돌탑 — 큼직한 단 4~6개, 위로 갈수록 작게, 거의 안 비뚤게. "사람이 쌓은 흔적"
      cairn: function (r) {
        var col = _paletteColor(r);
        var n = 4 + Math.floor(r() * 3);
        var w0 = 0.55 + r() * 0.35;
        var d0 = 0.55 + r() * 0.35;
        var specs = [];
        var accum = 0;
        for (var i = 0; i < n; i++) {
          var k = Math.pow(0.74 + r() * 0.08, i);
          var h = 0.14 + r() * 0.14;
          specs.push({
            w: w0 * k, h: h, d: d0 * k,
            x: (r() * 2 - 1) * 0.05, y: accum + h / 2, z: (r() * 2 - 1) * 0.05,
            rotY: (r() * 2 - 1) * 0.35,
          });
          accum += h * 0.97;                         // 거의 맞닿게
        }
        return { col: col, specs: specs };
      },
      // 파편 — 가늘고 긴 조각들이 사이가 뜬 채 나선으로 떠오름. "부서진 기억의 부유"
      shards: function (r) {
        var col = _paletteColor(r);
        var n = 5 + Math.floor(r() * 5);
        var specs = [];
        var y = 0;
        for (var i = 0; i < n; i++) {
          var w = 0.05 + r() * 0.10;
          var h = 0.30 + r() * 0.55;
          var d = 0.05 + r() * 0.10;
          var ang = r() * Math.PI * 2;
          var rad = r() * 0.30;
          specs.push({
            w: w, h: h, d: d,
            x: Math.cos(ang) * rad, y: y + h / 2, z: Math.sin(ang) * rad,
            rotY: r() * Math.PI, tilt: (r() * 2 - 1) * 0.12,
          });
          y += h * (0.35 + r() * 0.30) + 0.06;       // 조각 사이가 뜬 채 위로
          if (y > 1.6) break;
        }
        return { col: col, specs: specs };
      },
      // 덩어리 — 단어마다 원형(기둥/봉분/판/문)을 정하고 그 윤곽 속을 블록으로 채움.
      // 격자 정렬 + 모서리 깎기라 "무언가의 형상"이라는 인상이 가장 강함.
      volume: function (r) {
        var col = _paletteColor(r);
        var arch = Math.floor(r() * 4);
        var dims = [
          { X: 0.55, Y: 1.45, Z: 0.55 },             // 기둥
          { X: 1.00, Y: 0.62, Z: 1.00 },             // 봉분
          { X: 1.25, Y: 0.55, Z: 0.50 },             // 넓적한 판
          { X: 0.95, Y: 1.05, Z: 0.40 },             // 문 (가운데 아래가 빔)
        ][arch];
        var cell = 0.30;
        // 얇은 축도 최소 격자 확보 — 260730 fix: 종전엔 2칸 축의 모든 칸이 "가장자리"라
        // 껍데기 깎기가 덩어리 전체를 지워버렸다 (기둥·판 실종)
        var nx = Math.max(3, Math.round(dims.X / cell));
        var ny = Math.max(3, Math.round(dims.Y / cell));
        var nz = Math.max(2, Math.round(dims.Z / cell));
        var bw = dims.X / nx, bh = dims.Y / ny, bd = dims.Z / nz;
        var specs = [];
        for (var iy = 0; iy < ny; iy++) {
          for (var ix = 0; ix < nx; ix++) {
            for (var iz = 0; iz < nz; iz++) {
              // 칸 중심 기준 정규화 (-1..1)
              var fx = ((ix + 0.5) / nx) * 2 - 1;
              var fy = ((iy + 0.5) / ny) * 2 - 1;
              var fz = ((iz + 0.5) / nz) * 2 - 1;
              // 타원 껍데기 — 윗쪽 모서리만 깎는다 (바닥은 평평히 땅에 앉게)
              var f = fx * fx + fy * fy + fz * fz;
              if (fy > 0 && f > 1.15) continue;
              if (arch === 3 && Math.abs(fx) < 0.5 && fy < 0.45) continue;  // 문 구멍
              if (r() > 0.88) continue;              // 살짝 결손 — 손맛
              var jw = bw * (0.84 + r() * 0.28);
              var jh = bh * (0.84 + r() * 0.28);
              var jd = bd * (0.84 + r() * 0.28);
              specs.push({
                w: jw, h: jh, d: jd,
                x: (ix + 0.5) * bw - dims.X / 2 + (r() * 2 - 1) * 0.02,
                y: iy * bh + jh / 2,
                z: (iz + 0.5) * bd - dims.Z / 2 + (r() * 2 - 1) * 0.02,
                rotY: (r() * 2 - 1) * 0.06,
              });
              if (specs.length >= 32) return { col: col, specs: specs };
            }
          }
        }
        return { col: col, specs: specs };
      },
    };

    // GLB 인스턴스 조립 (260730): 표준화(최대 변 modelMaxDim) + 땅 앉히기 + 인스턴스별
    // 반투명 재질(원본 색 유지 — "증거물"의 절충안). 거리 페이드·발광은 blocks 계약으로 합류.
    function _instantiateModel(template, entry) {
      var group = new THREE.Group();
      var root = template.clone(true);
      var box = new THREE.Box3().setFromObject(root);
      var size = box.getSize(new THREE.Vector3());
      var maxDim = Math.max(size.x, size.y, size.z) || 1;
      root.scale.setScalar((opts.modelMaxDim / maxDim) * (entry.scale || 1));
      if (entry.rotX) root.rotation.x = entry.rotX;   // 눕히기 등 방향 조정 칸 (작가 튜닝용)
      if (entry.rotZ) root.rotation.z = entry.rotZ;
      var box2 = new THREE.Box3().setFromObject(root);
      root.position.y = -box2.min.y;                  // 땅에 앉히기
      group.add(root);
      var mats = [], blocks = [];
      root.traverse(function (m) {
        if (!m.isMesh || !m.material) return;
        var list = Array.isArray(m.material) ? m.material : [m.material];
        var cloned = list.map(function (mm) {
          var c = mm.clone();                         // 인스턴스별 opacity (거리 페이드)
          c.transparent = true;
          c.opacity = opts.baseOpacity;
          c.fog = true;
          c.depthWrite = false;
          // 밤 조명에 색이 죽지 않게 — 텍스처를 자가발광으로도 태움 (색은 원본 그대로)
          if (c.emissive) {
            if (c.map && 'emissiveMap' in c) c.emissiveMap = c.map;
            if (c.map) c.emissive.setScalar(opts.modelEmissive);
            else c.emissive.copy(c.color).multiplyScalar(opts.modelEmissive);
          }
          return c;
        });
        m.material = Array.isArray(m.material) ? cloned : cloned[0];
        for (var i = 0; i < cloned.length; i++) {
          mats.push(cloned[i]);
          blocks.push({ mesh: m, mat: cloned[i], h: 0.2 });
        }
      });
      return { group: group, mats: mats, blocks: blocks };
    }

    function _buildCluster(word) {
      var look = LOOKS[opts.look] || LOOKS.stack;
      var r = _rng('obj|' + word);
      var out = look(r);
      var group = new THREE.Group();
      var mats = [];
      var blocks = [];
      for (var i = 0; i < out.specs.length; i++) {
        var s = out.specs[i];
        var geo = new THREE.BoxGeometry(s.w, s.h, s.d);
        var mat = new THREE.MeshLambertMaterial({
          color: out.col,
          transparent: true,
          opacity: opts.baseOpacity,
          fog: true,
          depthWrite: false,
        });
        var m = new THREE.Mesh(geo, mat);
        m.position.set(s.x, s.y, s.z);
        m.rotation.y = s.rotY || 0;
        if (s.tilt) m.rotation.z = s.tilt;
        group.add(m);
        mats.push(mat);
        blocks.push({ mesh: m, mat: mat, h: s.h });
      }
      return { group: group, mats: mats, blocks: blocks };
    }

    // ─── 라벨: 단어(크게) + 원문 문장(작게, 줄바꿈) 캔버스 스프라이트 ───
    function _wrap(ctx, text, maxW) {
      var lines = [];
      var cur = '';
      for (var i = 0; i < text.length; i++) {
        var next = cur + text[i];
        if (ctx.measureText(next).width > maxW && cur.length) {
          lines.push(cur); cur = text[i];
        } else cur = next;
        if (lines.length >= 3) break;                 // 문장 최대 3줄
      }
      if (cur.length && lines.length < 4) lines.push(cur);
      return lines;
    }
    function _buildLabel(word, sentence) {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var wordFont = '30px "Gowun Batang", "Noto Serif KR", serif';
      var lineFont = '19px "Gowun Batang", "Noto Serif KR", serif';
      canvas.width = 512;
      ctx.font = lineFont;
      var lines = sentence ? _wrap(ctx, sentence, 460) : [];
      canvas.height = 56 + lines.length * 27 + 14;
      var cx = canvas.width / 2;
      // 단어 — 마른 금빛 (유령 보라와 구분)
      ctx.font = wordFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(214,188,150,0.5)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(224,206,170,0.96)';
      ctx.fillText(word, cx, 30);
      // 문장 — 옅게, 증거물의 목소리
      ctx.shadowBlur = 6;
      ctx.font = lineFont;
      ctx.fillStyle = 'rgba(216,204,186,0.88)';
      for (var i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], cx, 64 + i * 27);
      }
      var tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      var mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, fog: false,
        depthWrite: false, depthTest: false,
      });
      var sp = new THREE.Sprite(mat);
      sp.renderOrder = 998;
      sp.scale.set(canvas.width / 320, canvas.height / 320, 1);  // ~1.6m 폭, 근접 열람용
      return { sprite: sp, mat: mat };
    }

    function _clear() {
      _stopPoll();
      _hideClickUI();
      _gen++;   // 로딩 중이던 GLB 콜백 무효화 (회차 경계)
      _objects.forEach(function (o) {
        if (o.group && o.group.parent) o.group.parent.remove(o.group);
        if (o.group) o.group.traverse(function (m) {
          if (m.isMesh) {
            // 모델 geometry 는 _glbCache 템플릿과 공유 — dispose 하면 다음 회차가 깨진다
            if (m.geometry && !o.isModel) m.geometry.dispose();
            if (m.material) {
              (Array.isArray(m.material) ? m.material : [m.material]).forEach(function (mm) { mm.dispose(); });
            }
          }
        });
        if (o.label) {
          if (o.label.parent) o.label.parent.remove(o.label);
          if (o.labelMat) { if (o.labelMat.map) o.labelMat.map.dispose(); o.labelMat.dispose(); }
        }
      });
      _objects.length = 0;
    }

    var _gen = 0;   // 회차 세대 카운터 — 비동기 GLB 로드의 유령 콜백 차단

    // ─── 배치: 공용 계산기(TemObjectAnchors)가 정한 자리에 세운다 ───
    // 260730: 자리 수식은 js/shared/tem_object_anchors.js 한 곳에만 있다 (admin 과 공유).
    //   작가 지정 좌표(scenes.meta.object_pos) 우선 적용도 그 안에서 처리.
    function _rebuild() {
      _clear();      // 폴링도 함께 멈춘다
      _startPoll();  // 이 회차분을 다시 켠다 (안 켜면 rebuild 후 되새김 동기가 죽는다)
      if (typeof opts.getScenePins !== 'function') return;
      var OA = global.TemObjectAnchors;
      if (!OA || typeof OA.layout !== 'function') {
        console.error('[lumen-scene-objects] TemObjectAnchors 미로드 — 사물 배치 중단. '
          + 'js/shared/tem_object_anchors.js script 태그 확인');
        return;
      }
      var pins = opts.getScenePins() || [];
      var anchors = OA.layout(pins, {
        maxPerScene: opts.maxPerScene,
        segT: opts.segT, perpMin: opts.perpMin, perpMax: opts.perpMax,
      });
      // 260802 노출 게이트 + 심볼 중복 제외 — 자리는 전체 계산 그대로, 거르기만 한다.
      if (typeof opts.sceneGate === 'function' || typeof opts.excludeWordForScene === 'function') {
        anchors = anchors.filter(function (a) {
          try {
            if (typeof opts.sceneGate === 'function' && !opts.sceneGate(a.scene)) return false;
            if (typeof opts.excludeWordForScene === 'function' &&
                opts.excludeWordForScene(a.scene) === a.word) return false;
          } catch (_) {}
          return true;
        });
      }
      if (!anchors.length) return;

      // getter 가 던져도 사물 배치 전체가 죽으면 안 된다 — 실패 시 블록 대역으로 전원 진행
      var models = null;
      if (typeof opts.getObjectModels === 'function') {
        try { models = opts.getObjectModels() || null; } catch (e) {
          console.warn('[lumen-scene-objects] getObjectModels 실패 — 블록 대역:', e && e.message);
        }
      }

      var placed = 0;
      {
        for (var w = 0; w < anchors.length; w++) {
          var a = anchors[w];
          var word = a.word;
          var cx = a.x, cz = a.z, rotY = a.rotY;
          var gy = (typeof runtime.gH === 'function') ? runtime.gH(cx, cz) : 0;
          if (gy < -10) gy = -10;

          var sentence = _pickSentence(word, a.scene);
          var label = null;
          if (opts.labelMode === 'float') {   // 구버전 공중 라벨 (롤백용)
            label = _buildLabel(word, sentence);
            label.sprite.position.set(cx, gy + 1.55, cz);
            scene3.add(label.sprite);
          }

          var o = {
            group: null, mats: [], blocks: [],
            label: label && label.sprite, labelMat: label && label.mat,
            sentence: sentence,
            cx: cx, cz: cz, gy: gy, word: word,
            stage: 0, glowBoost: 1, everSynced: false,
            collapsing: null, collapsed: false, isModel: false,
          };
          _objects.push(o);

          var entry = models && models[word];
          if (entry && entry.path) {
            // GLB 사물 (260730): 비동기 로드 — 도착 전엔 라벨만, 실패 시 블록 대역 복귀
            o.isModel = true;
            (function (o, entry, cx, cz, gy, rotY, myGen) {
              _loadModelTemplate(entry.path).then(function (tpl) {
                if (myGen !== _gen) return;   // 회차가 이미 끝남 — 유령 콜백 버림
                var inst = _instantiateModel(tpl, entry);
                inst.group.position.set(cx, gy, cz);
                inst.group.rotation.y = (entry.rotY != null) ? entry.rotY : rotY;
                scene3.add(inst.group);
                o.group = inst.group; o.mats = inst.mats; o.blocks = inst.blocks;
              }).catch(function (e) {
                if (myGen !== _gen) return;
                console.warn('[lumen-scene-objects] 모델 로드 실패 — 블록 대역:', o.word, e && e.message);
                o.isModel = false;
                var cluster = _buildCluster(o.word);
                cluster.group.position.set(cx, gy, cz);
                cluster.group.rotation.y = rotY;
                scene3.add(cluster.group);
                o.group = cluster.group; o.mats = cluster.mats; o.blocks = cluster.blocks;
              });
            })(o, entry, cx, cz, gy, rotY, _gen);
          } else {
            var cluster = _buildCluster(word);
            cluster.group.position.set(cx, gy, cz);
            cluster.group.rotation.y = rotY;
            scene3.add(cluster.group);
            o.group = cluster.group; o.mats = cluster.mats; o.blocks = cluster.blocks;
          }
          placed++;
        }
      }
      console.log('[lumen-scene-objects] placed:', placed,
        '/ 작가지정:', anchors.filter(function (a) { return a.pinned; }).length);
    }

    // ─── 2단계: 되새김 stage → 발광/붕괴 (설계 §3.2, 곡선은 260709 확정본) ───
    function _applyStageGlow(o) {
      var g = Math.min(2, Math.max(0, o.stage));
      var k = opts.stageGlow[g] || 0;
      for (var m = 0; m < o.blocks.length; m++) {
        var mat = o.blocks[m].mat;
        if (!mat.emissive) continue;
        if (o.isModel) {
          // 모델은 기본 자가발광(밤 색 유지)이 바닥 — 되새김 발광은 그 위에 얹힘
          if (mat.map) mat.emissive.setScalar(Math.max(opts.modelEmissive, k * 0.6));
          else mat.emissive.copy(mat.color).multiplyScalar(Math.max(opts.modelEmissive, k * 0.6));
        } else {
          mat.emissive.copy(mat.color).multiplyScalar(k * 0.45);
        }
      }
      o.glowBoost = 1 + k * 0.6;
    }

    // 붕괴: 블록 일부 소멸 + 나머지 흩어져 잔해로. instant=true 면 애니 없이 완성형
    // (턴 전환 rebuild 직후 이미 stage 3 인 사물 — "무너진 채 발견").
    function _startCollapse(o, instant) {
      var r = _rng('collapse|' + o.word);
      var parts = [];
      for (var i = 0; i < o.blocks.length; i++) {
        var b = o.blocks[i];
        var keep = r() < opts.collapseKeepRatio;
        var ang = r() * Math.PI * 2;
        var d = 0.35 + r() * 0.95;
        parts.push({
          b: b, keep: keep,
          from: b.mesh.position.clone(),
          to: new THREE.Vector3(Math.cos(ang) * d, b.h / 2, Math.sin(ang) * d),
          rotFrom: b.mesh.rotation.y,
          rotTo: b.mesh.rotation.y + (r() * 2 - 1) * 1.8,
        });
        if (!keep) b.mat._dying = true;
      }
      if (instant) {
        for (var j = 0; j < parts.length; j++) {
          var p = parts[j];
          if (p.keep) {
            p.b.mesh.position.copy(p.to);
            p.b.mesh.rotation.y = p.rotTo;
          } else {
            p.b.mesh.visible = false;
          }
        }
        o.collapsed = true;
        o.glowBoost = 1;
        _applyStageGlow(o);
        return;
      }
      o.collapsing = { t0: performance.now(), parts: parts };
    }

    function _advanceCollapse(o) {
      var col = o.collapsing;
      var k = Math.min(1, (performance.now() - col.t0) / opts.collapseMs);
      var e = 1 - Math.pow(1 - k, 3);  // easeOutCubic — 무너져 내림
      for (var i = 0; i < col.parts.length; i++) {
        var p = col.parts[i];
        p.b.mesh.position.lerpVectors(p.from, p.to, e);
        p.b.mesh.rotation.y = p.rotFrom + (p.rotTo - p.rotFrom) * e;
      }
      if (k >= 1) {
        for (var j = 0; j < col.parts.length; j++) {
          if (!col.parts[j].keep) col.parts[j].b.mesh.visible = false;
        }
        o.collapsing = null;
        o.collapsed = true;
        o.glowBoost = 1;
        _applyStageGlow(o);
      }
    }

    function _pollRecall() {
      if (!opts.recallSync || !_objects.length) return;
      var RA = global.LumenRecalledAnchors;
      if (!RA || typeof RA.getState !== 'function') return;
      var st;
      try { st = RA.getState(); } catch (_) { return; }
      var words = (st && st.words) || {};
      for (var i = 0; i < _objects.length; i++) {
        var o = _objects[i];
        var s = words[o.word] | 0;
        if (s === o.stage) { o.everSynced = true; continue; }
        var fresh = !o.everSynced;   // rebuild 직후 첫 동기 — 애니 없이 상태만
        o.stage = s;
        o.everSynced = true;
        if (s >= 3 && !o.collapsed && !o.collapsing) {
          if (o.isModel) {
            // GLB 모델의 블록 붕괴는 없음 (조형 문법이 다름) — 잔해 대신 어두워짐만.
            // 모델 전용 붕괴 연출(가라앉기·조각내기)은 후속 튜닝 항목.
            o.collapsed = true;
            _applyStageGlow(o);
          } else {
            _startCollapse(o, fresh);
          }
        } else if (s < 3) {
          _applyStageGlow(o);        // 붕괴는 안 되돌림 (잔해는 잔해로)
        }
      }
    }
    // 폴링 핸들 보관 (R2-7). 여태 핸들 없이 setInterval 만 걸어서, 회차마다 attach 될 때
    // 옛 interval 이 살아남아 겹겹이 쌓였고 회차가 끝나도 영영 돌았다.
    var _pollId = null;
    function _startPoll() {
      if (_pollId == null) _pollId = setInterval(_pollRecall, opts.recallPollMs);
    }
    function _stopPoll() {
      if (_pollId != null) { clearInterval(_pollId); _pollId = null; }
    }
    _startPoll();

    // ─── 260730 클릭 열람 — 사물을 겨눠 짧게 클릭 → 하단 대화창풍 창에 단어+원문 ───
    // (공중 부유 라벨 대체. 긴 클릭은 씬 진입이므로 400ms 이내만 열람으로 침)
    var _uiWord = null, _uiSent = null, _uiTimer = null;
    // 조준 안내 — 유령의 "길게 눌러 이 장면에…" 와 같은 자리·같은 결 (둘은 배타적)
    var _uiHint = null;

    // ── 260806 하단 문구 층 치수 ────────────────────────────────
    // 좁은 화면(가로로 눕힌 폰, 세로 390~420)에서는 데스크톱 치수가 화면 밖으로 넘친다.
    // play-test 의 파동 높이(AW_HEIGHT 280→132)와 같은 기준으로 층 전체를 내린다.
    function _isTouchUI() {
      if (global.__temForceTouch !== null && global.__temForceTouch !== undefined) return global.__temForceTouch;
      if (typeof global._temIsMobileDevice === 'function') return global._temIsMobileDevice();
      var hasTouch = 'ontouchstart' in global || navigator.maxTouchPoints > 0;
      var coarse = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
      return /Mobi|Android|iPhone|iPod|iPad/i.test(navigator.userAgent) || (hasTouch && coarse);
    }
    function _narrow() { return _isTouchUI() && global.innerHeight < 560; }
    function _lay() {
      return _narrow()
        ? { hint: 142, sent: 186, gap: 20, fWord: 19, fSent: 14, fHint: 14, maxW: '80vw' }
        : { hint: 300, sent: 384, gap: 39, fWord: 24, fSent: 17, fHint: 17, maxW: '620px' };
    }

    function _ensureHintUI() {
      if (_uiHint) return;
      var parent = document.getElementById('strataView') || document.body;
      var L = _lay();
      _uiHint = document.createElement('div');
      // 260802: 하단 파동 위로 올림 + 키움 — play-test 의 _fpHintEl 과 같은 자리·같은 크기.
      _uiHint.style.cssText = 'position:absolute;bottom:' + L.hint + 'px;left:50%;transform:translateX(-50%);color:rgba(206,180,144,0.82);font-size:' + L.fHint + 'px;letter-spacing:2px;text-align:center;pointer-events:none;opacity:0;transition:opacity 0.4s;z-index:200;text-shadow:0 0 8px rgba(196,168,130,0.45);';
      _uiHint.textContent = (document.documentElement.lang || 'en').substring(0, 2) === 'ko'
        ? '길게 눌러 들여다보기' : 'Hold to look closer';
      parent.appendChild(_uiHint);
    }
    function _ensureClickUI() {
      if (_uiWord) return;
      var parent = document.getElementById('strataView') || document.body;
      var L = _lay();
      _uiWord = document.createElement('div');
      // 하단 배치 (260802 재조정 — 전부 파동 위로):
      //   안내 ↔ 속삭임(_fpProxEl) ↔ 문장 ↔ 사물 이름
      // 260806 수리: 둘 다 bottom 고정인데 문장만 위로 자란다. 종전엔 384↔452 를 68px
      //   벌려 "두 줄까지"를 버텼는데, 영어 사본 문장이 세 줄(17px × 1.7 × 3 ≈ 87px)이 되며
      //   이름을 밟았다(사용자 스크린샷 8-06, "blood" 가 본문 위에 겹침).
      //   이제 이름의 bottom 은 고정값이 아니라 _showClickUI 에서 문장 실제 높이 + gap 으로 잡는다.
      //   gap 39 는 한 줄 문장일 때 종전 452 와 같은 자리가 되도록 맞춘 값(384 + 29 + 39 = 452).
      _uiWord.style.cssText = 'position:absolute;bottom:' + (L.sent + L.gap + Math.round(L.fSent * 1.7)) + 'px;left:50%;transform:translateX(-50%);color:#e8d8b6;font-size:' + L.fWord + 'px;letter-spacing:6px;text-align:center;pointer-events:none;opacity:0;transition:opacity 0.5s,bottom 0.25s ease;z-index:200;text-shadow:0 0 14px rgba(224,206,170,0.55);font-family:"Gowun Batang","Noto Serif KR",serif;';
      parent.appendChild(_uiWord);
      _uiSent = document.createElement('div');
      _uiSent.style.cssText = 'position:absolute;bottom:' + L.sent + 'px;left:50%;transform:translateX(-50%);color:rgba(226,216,200,0.94);font-size:' + L.fSent + 'px;letter-spacing:1px;text-align:center;pointer-events:none;opacity:0;transition:opacity 0.5s;z-index:200;max-width:' + L.maxW + ';line-height:1.7;text-shadow:0 2px 10px rgba(0,0,0,0.7);font-family:"Gowun Batang","Noto Serif KR",serif;';
      parent.appendChild(_uiSent);
    }
    // 260731 열람 장부 — 이번 회차에 어떤 사물을 몇 번 들여다봤나 (회차 일지 봉인용).
    // "지형에서 본다 → 입에 담는다 → 되새김" 고리가 실제로 작동했는지의 앞 단 증거.
    var _viewLog = {};
    function _showClickUI(word, sentence) {
      _viewLog[word] = (_viewLog[word] || 0) + 1;
      _ensureClickUI();
      _uiWord.textContent = word;
      _uiSent.textContent = sentence || '';
      _uiWord.style.opacity = '1';
      _uiSent.style.opacity = '1';
      // 260806: 문장이 몇 줄이 되든 이름이 그 위에 얹히게 — 그려진 뒤 실제 높이를 재서 밀어올린다.
      //   (문장 길이는 언어·사물마다 달라 고정 간격으로는 못 막는다.)
      var _L2 = _lay();
      requestAnimationFrame(function () {
        if (!_uiWord || !_uiSent) return;
        var h = _uiSent.offsetHeight || Math.round(_L2.fSent * 1.7);
        _uiWord.style.bottom = (_L2.sent + h + _L2.gap) + 'px';
      });
      // 260806: 문장이 세 줄이 되면 좌상단 미니맵(325px) 높이까지 올라와 첫 몇 글자가
      //   지도에 가려 안 읽힌다(영어 사본에서 드러남). 읽는 동안만 지도를 접는다.
      _fadeMinimap(true);
      if (_uiTimer) clearTimeout(_uiTimer);
      // 260802c: 발췌가 길어졌다 — 표시 시간을 글 길이에 비례 (읽다 끊기지 않게)
      // 260802e: 최소 3문장 체제 — 상한도 같이 올림
      var _readMs = Math.min(14000, 3200 + String(sentence || '').length * 45);
      _uiTimer = setTimeout(function () {
        if (_uiWord) _uiWord.style.opacity = '0';
        if (_uiSent) _uiSent.style.opacity = '0';
        _fadeMinimap(false);
      }, _readMs);
    }
    // 읽는 동안 미니맵 접기. 모바일 조작기(tem_mobile_controls)도 대화 중 같은 자리를
    // 건드리므로, 그쪽은 상태가 바뀔 때만 세팅하도록 맞춰 두었다 — 서로 덮어쓰지 않는다.
    function _fadeMinimap(dim) {
      var mini = document.getElementById('fpMinimap');
      if (!mini) return;
      mini.style.transition = 'opacity 0.4s ease';
      mini.style.opacity = dim ? '0.08' : '1';
    }
    function _hideClickUI() {
      if (_uiTimer) { clearTimeout(_uiTimer); _uiTimer = null; }
      if (_uiWord) _uiWord.style.opacity = '0';
      if (_uiSent) _uiSent.style.opacity = '0';
      if (_uiHint) _uiHint.style.opacity = '0';
      _fadeMinimap(false);
    }
    var _lastCam = null;
    var _clickRay = null;
    var _downAt = 0;
    var _aimedObj = null;   // 지금 겨눈 사물 (조준 안내 + play-test 가림 판정용)
    // ndc = {x, y} (-1..1). 주면 그 화면 지점으로 광선을 쏜다 — 모바일은 손가락으로 사물을 직접 짚는다
    // (260806: 유령 진입이 짚기로 바뀌면서 모바일 크로스헤어를 없앴다. 사물만 보이지 않는
    //  화면 한가운데에 맞추라고 두면 조작이 둘로 갈린다.)
    function _pickObject(ndc) {
      if (!_lastCam) return null;
      if (!_clickRay) _clickRay = new THREE.Raycaster();
      if (ndc) _clickRay.setFromCamera(ndc, _lastCam);
      else _clickRay.set(_lastCam.position, _lastCam.getWorldDirection(new THREE.Vector3()));
      _clickRay.far = opts.clickRange;
      var groups = [];
      for (var i = 0; i < _objects.length; i++) if (_objects[i].group) groups.push(_objects[i].group);
      if (!groups.length) return null;
      var hits = _clickRay.intersectObjects(groups, true);
      if (!hits.length) return null;
      var node = hits[0].object;
      while (node) {
        for (var j = 0; j < _objects.length; j++) if (_objects[j].group === node) return _objects[j];
        node = node.parent;
      }
      return null;
    }
    // 길게 누르기 = 열람 (씬 진입과 동일한 동작. 겨눈 대상이 사물이면 열람, 유령이면 진입)
    var _holdTimer = null, _holdObj = null;
    function _holdMs() {
      return opts.holdMs || global.__temLongPressMs || 800;
    }
    function _cancelHold() {
      if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
      if (_holdObj) { _holdObj.holdBoost = 0; _holdObj = null; }
    }
    function _beginHold(ndc) {
      if (opts.labelMode !== 'click' || !_objects.length) return;
      if (typeof runtime.isFirstPerson === 'function' && !runtime.isFirstPerson()) return;
      _cancelHold();
      // 260802 이중 발동 차단 — 유령이 조준선 앞에 있으면 열람 양보 (진입만 발동).
      //   우리 raycast 는 사물만 보므로, 유령이 앞이고 사물이 뒤인 각도에서
      //   씬 대화와 사물 열람이 동시에 터지던 결함. play-test 가 매 프레임 세팅.
      //   260806 모바일: play-test 의 pointerdown 이 touchstart 보다 먼저 돌아, 손가락이
      //   유령을 짚었으면 그 자리에서 같은 플래그를 세운다 — 짚기에서도 양보가 유지된다.
      if (global.__temGhostAimed) return;
      var o = _pickObject(ndc);
      if (!o) return;
      _holdObj = o;
      _holdStart = performance.now();
      _holdTimer = setTimeout(function () {
        _holdTimer = null;
        if (_holdObj === o) { _showClickUI(o.word, o.sentence); o.holdBoost = 0; _holdObj = null; }
      }, _holdMs());
    }
    var _holdStart = 0;
    // 260806: 터치 기기에서만 짚은 좌표를 쓴다. 데스크톱은 포인터 잠금이라 커서 좌표가
    //   의미 없으므로(그리고 크로스헤어가 살아 있으므로) 예전대로 카메라 정면을 겨눈다.
    function _ndcFromEvent(e) {
      if (!_isTouchUI()) return null;
      var t = (e && e.changedTouches && e.changedTouches[0])
           || (e && e.touches && e.touches[0])
           || e;
      if (!t || typeof t.clientX !== 'number') return null;
      var r = renderer.domElement.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return {
        x: ((t.clientX - r.left) / r.width) * 2 - 1,
        y: -(((t.clientY - r.top) / r.height) * 2 - 1)
      };
    }
    renderer.domElement.addEventListener('mousedown', function (e) { _downAt = performance.now(); _beginHold(_ndcFromEvent(e)); });
    renderer.domElement.addEventListener('mouseup', _cancelHold);
    renderer.domElement.addEventListener('mouseleave', _cancelHold);
    // 모바일 — 탭이 아니라 꾹 누르기로 동일하게
    renderer.domElement.addEventListener('touchstart', function (e) { _downAt = performance.now(); _beginHold(_ndcFromEvent(e)); }, { passive: true });
    renderer.domElement.addEventListener('touchend', _cancelHold);
    renderer.domElement.addEventListener('touchcancel', _cancelHold);

    // ─── render wrap: 거리 페이드 + 근접 라벨 + 붕괴 진행 (카메라 안 건드림) ───
    var _origRender = renderer.render.bind(renderer);
    var fadeRange = Math.max(0.01, opts.fadeFar - opts.fadeNear);
    var _aimCheckAt = 0;
    var _groundSyncAt = 0;
    renderer.render = function (s, c) {
      if (c && c.position) _lastCam = c;
      // 260802d 공중부양 수리 — 지형이 회차 중 살아 움직인다(퀼트 융기·침식).
      //   배치 순간의 높이에 박제하지 말고 0.5초마다 발밑을 다시 재서 땅에 붙인다.
      var nowG = performance.now();
      if (nowG - _groundSyncAt > 500 && typeof runtime.gH === 'function') {
        _groundSyncAt = nowG;
        for (var gsi = 0; gsi < _objects.length; gsi++) {
          var og = _objects[gsi];
          if (!og.group || typeof og.gy !== 'number') continue;
          var ngy = runtime.gH(og.cx, og.cz);
          if (ngy < -10) ngy = -10;
          if (Math.abs(ngy - og.gy) > 0.005) {
            og.group.position.y += (ngy - og.gy);
            if (og.label) og.label.position.y += (ngy - og.gy);
            og.gy = ngy;
          }
        }
      }
      // 조준 안내 — 매 프레임 레이캐스트는 낭비라 120ms 간격으로만
      if (opts.labelMode === 'click' && _objects.length && c && c.position) {
        var nowA = performance.now();
        if (nowA - _aimCheckAt > 120) {
          _aimCheckAt = nowA;
          var fpOk = (typeof runtime.isFirstPerson !== 'function') || runtime.isFirstPerson();
          _aimedObj = fpOk ? _pickObject() : null;
          _ensureHintUI();
          _uiHint.style.opacity = _aimedObj ? '1' : '0';
        }
      } else if (_uiHint) {
        _uiHint.style.opacity = '0';
      }
      if (_objects.length && c && c.position) {
        for (var i = 0; i < _objects.length; i++) {
          var o = _objects[i];
          if (o.collapsing) _advanceCollapse(o);
          var ddx = o.cx - c.position.x, ddz = o.cz - c.position.z;
          var dist = Math.sqrt(ddx * ddx + ddz * ddz);
          var tt = 1 - Math.min(1, Math.max(0, (dist - opts.fadeNear) / fadeRange));
          var nearOp = o.isModel ? opts.modelNearOpacity : opts.nearOpacity;  // 모델은 유령보다 또렷
          var op = opts.baseOpacity + (nearOp - opts.baseOpacity) * tt;
          // 되새김 stage: 최소 밝기 바닥 + 발광 배율. 잔해는 어둡게.
          var floor = opts.stageFloor[Math.min(2, o.stage)] || 0;
          op = Math.max(op, floor) * (o.glowBoost || 1);
          if (o.collapsed) op *= opts.collapsedDim;
          // 누르고 있는 동안 그 사물만 서서히 또렷해짐 — 열람이 임박했다는 유일한 신호
          if (_holdObj === o && _holdTimer) {
            op *= 1 + Math.min(1, (performance.now() - _holdStart) / _holdMs()) * 0.4;
          }
          if (op > 0.96) op = 0.96;
          for (var m = 0; m < o.blocks.length; m++) {
            var mat = o.blocks[m].mat;
            var tgt = mat._dying ? 0 : op;
            mat.opacity = mat.opacity + (tgt - mat.opacity) * 0.08;   // 부드럽게
            // 260802 지형질감 1단계: 또렷할 때만 그림자 — 흐려져 사라진 사물이
            // 그림자만 땅에 남기는 결함 방지 (불투명도 연동 게이트)
            o.blocks[m].mesh.castShadow = mat.opacity > 0.3;
          }
          if (o.labelMat) {                                 // float 모드에만 존재
            var lt = dist <= opts.labelNear
              ? (1 - dist / opts.labelNear) * 0.5 + 0.5    // 근접할수록 또렷
              : 0;
            var lcur = o.labelMat.opacity;
            o.labelMat.opacity = lcur + (lt * opts.labelOpacity - lcur) * 0.08;
          }
        }
      }
      _origRender(s, c);
    };

    var adapter = runtime.__lumenAdapter;
    if (adapter && typeof adapter.on === 'function') {
      adapter.on('enter', function () { setTimeout(_rebuild, 80); });
      adapter.on('exit', _clear);
    }
    setTimeout(_rebuild, 80);  // attach 시점이 이미 enter 이후일 수 있음

    var api = {
      rebuild: _rebuild,
      clear: _clear,
      // 사물 메시 전체 — play-test 의 씬 진입 레이캐스트가 "가림막"으로 쓴다.
      // (사물을 겨눴는데 뒤의 유령까지 같이 발동하는 이중 발화 방지)
      meshes: function () {
        var out = [];
        for (var i = 0; i < _objects.length; i++) {
          if (!_objects[i].group) continue;
          _objects[i].group.traverse(function (m) { if (m.isMesh) out.push(m); });
        }
        return out;
      },
      isAiming: function () { return !!_aimedObj; },
      // 260731 열람 장부 — [{ word, count }] (회차 일지 봉인 스냅샷용, 읽기 전용)
      getViewLog: function () {
        return Object.keys(_viewLog).map(function (w) { return { word: w, count: _viewLog[w] }; });
      },
      // 260731 회상 연출 — 지금 세워진 사물의 단어·자리. play-test 근접 판정용 (읽기 전용).
      anchors: function () {
        return _objects.map(function (o) { return { word: o.word, x: o.cx, z: o.cz }; });
      },
      // §3.3 룩 튜닝 — 조형만 다시 세운다 (배치 좌표는 결정적이라 그대로)
      setLook: function (lookName, paletteName) {
        if (lookName && LOOKS[lookName]) opts.look = lookName;
        if (paletteName && PALETTES[paletteName]) opts.palette = paletteName;
        _rebuild();
        return { look: opts.look, palette: opts.palette };
      },
      getDebug: function () {
        return _objects.map(function (o) {
          return {
            word: o.word, x: +o.cx.toFixed(1), z: +o.cz.toFixed(1),
            stage: o.stage, collapsed: o.collapsed, collapsing: !!o.collapsing,
            model: o.isModel ? (o.group ? 'loaded' : 'loading') : false,
            sentence: o.sentence || null,
          };
        });
      },
    };
    runtime.__lumenSceneObjects = api;
    _active = api;
    return api;
  }

  // 마지막으로 attach 된 인스턴스 (회차당 하나).
  var _active = null;

  global.LumenSceneObjects = {
    attach: attach,
    // 회차 종료 정리 지점이 부르는 자리. 여태 전역에 clear 가 없어서
    // window.LumenSceneObjects.clear() 는 TypeError 였고 try/catch 에 조용히 삼켜졌다 (R2-7).
    clear: function () {
      if (_active && typeof _active.clear === 'function') _active.clear();
    },
    // 콘솔 룩 전환: LumenSceneObjects.setLook('cairn', 'ash')
    // looks = stack(현행)/cairn(돌탑)/shards(파편)/volume(덩어리), palettes = ocher/ash/bone
    setLook: function (look, palette) {
      if (_active && typeof _active.setLook === 'function') return _active.setLook(look, palette);
      return null;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

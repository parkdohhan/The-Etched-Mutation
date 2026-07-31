/**
 * tem_object_anchors.js — 사물 앵커 자리 계산 (플레이·admin 공용 단일 출처)
 *
 * docs/사물모티프_지형조형_설계-260712.md §2.5 / §7
 *
 * 왜 공용인가 (260730):
 *   자리 계산이 플레이 모듈 안에만 있으면 admin 이 사물을 그리려고 같은 수식을 베껴야 하고,
 *   그 순간부터 두 계산은 서로 모르게 어긋난다 — "admin 에서 본 자리 ≠ 실제 자리".
 *   pin_override 가 죽은 레버가 된 것과 같은 종류의 사고이므로, 계산은 이 파일 하나에만 둔다.
 *
 * 자리 규칙 (우선순위):
 *   1. 작가 지정 — scenes.meta.object_pos[단어] = { x, z }   (admin 위치 화면 드래그가 여기 씀)
 *   2. 자동 — scene_order 사슬의 선분 위 t∈segT + 수직 이탈 perp. 전부 단어 해시 기반 결정적.
 *      접근성과 무관한 고정 좌표 (§2.5 순간이동 함정 회피).
 *
 * 난수 소비 순서는 절대 바꾸지 말 것 — t → side → perp → rotY.
 * 순서가 바뀌면 기존 기억의 모든 사물이 다른 자리로 이동한다 (같은 단어 = 같은 자리 원칙 붕괴).
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    maxPerScene: 2,              // 씬당 사물 상한 (설계 §3.1)
    segT: [0.35, 0.65],          // 사슬 선분 위 위치 범위
    perpMin: 1.0, perpMax: 3.0,  // 선분에서 수직 이탈 (마네킹·동선과 겹침 방지)
  };

  // 결정적 PRNG — lumen_recalled_anchors / mannequins 와 동일 문법
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

  // 이 씬에 세울 사물 단어 (260713 fix 유지):
  //   object_tags 키가 **존재하면** 그것만 쓴다. 빈 배열 = "세울 사물 없음" 의사표시.
  //   length 로 판정하면 빈 배열이 motif_tags 로 폴백해 "손끝·먼지" 같은 비사물이 선다.
  //   motif_tags 폴백은 object_tags 자체가 없는 레거시 기억에서만.
  function wordsFor(sceneMeta, maxPerScene) {
    var m = sceneMeta || {};
    var words;
    if (Array.isArray(m.object_tags)) words = m.object_tags;
    else if (Array.isArray(m.motif_tags)) words = m.motif_tags;
    else words = [];
    var lim = (maxPerScene == null) ? DEFAULTS.maxPerScene : maxPerScene;
    return words.slice(0, lim);
  }

  /**
   * 씬 하나의 지형 좌표 — 사물의 기준틀. 플레이·admin 이 같은 답을 봐야 한다.
   *
   * 260730 배경: 씬 13개 중 stage_position 이 있는 건 1개뿐이고, 나머지는 자동 투영이었다.
   *   그런데 플레이는 감정 투영(H2=23 + 기억 해시 오프셋)을, admin 은 다른 공식(AF·VAD·원형)을
   *   쓰고 있었다 → 같은 씬이 두 화면에서 다른 자리. 사물을 admin 에서 배치하려면 기준틀이
   *   먼저 일치해야 하므로, 규칙을 플레이 쪽(=관객이 실제로 걷는 지형)으로 통일한다.
   *
   * 우선순위: 1) meta.stage_position (작가 드래그)  2) 감정 투영  → 둘 다 없으면 null
   * 반환: { x, z, source: 'manual' | 'emotion' } | null
   */
  function resolvePinPos(scene, memoryId, emoOverride) {
    if (!scene) return null;
    var sp = scene.meta && scene.meta.stage_position;
    if (sp && isFinite(sp.x) && isFinite(sp.z)) {
      return { x: Number(sp.x), z: Number(sp.z), source: 'manual' };
    }
    var T = global.TemAfStrataTerrain;
    if (!T || typeof T._eA !== 'function' || typeof T._hashWorldOffset !== 'function') return null;
    var emo = emoOverride || scene.original_emotion || scene.originalEmotion
      || scene.emotion_dist || scene.emotionDist;
    if (typeof emo === 'string') { try { emo = JSON.parse(emo); } catch (_) { return null; } }
    if (!emo || typeof emo !== 'object') return null;
    var H2 = 23;                                  // 플레이 핀 배치 스케일 (play-test 와 동일 상수)
    var off = T._hashWorldOffset(memoryId || '');
    return {
      x: T._pX(T._eA(emo)) * H2 + off.ox,
      z: T._pZ(T._eF(emo)) * H2 + off.oz,
      source: 'emotion',
    };
  }

  function _orderOf(item, fallbackIdx) {
    var sc = item.scene || {};
    if (sc.scene_order != null) return sc.scene_order;
    if (item.pin && item.pin.sceneOrder != null) return item.pin.sceneOrder;
    return fallbackIdx;
  }

  /**
   * items: [{ scene, wx, wz, ... }] — 씬 하나당 하나. 좌표는 호출자가 이미 해석한 값
   *        (플레이 = 핀 wx/wz, admin = getStagePosition 결과). 정렬은 이 함수가 한다.
   * 반환: [{ scene, sceneId, word, x, z, rotY, k, pinned }]
   *        pinned = true 면 작가 지정 좌표 (자동 계산 아님)
   */
  function layout(items, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var pins = (items || []).filter(function (p) {
      return p && typeof p.wx === 'number' && typeof p.wz === 'number' && p.scene;
    });
    if (pins.length < 1) return [];
    pins = pins.slice().sort(function (a, b) {
      return _orderOf(a, 0) - _orderOf(b, 0);
    });

    var out = [];
    for (var k = 0; k < pins.length; k++) {
      var p = pins[k];
      var sMeta = (p.scene && p.scene.meta) || {};
      var words = wordsFor(sMeta, o.maxPerScene);
      if (!words.length) continue;

      // 이 씬의 길목 선분: 내 핀 → 다음 핀 (마지막 씬은 이전 핀 방향)
      var q = pins[k + 1] || pins[k - 1] || p;
      var dx = q.wx - p.wx, dz = q.wz - p.wz;
      var len = Math.sqrt(dx * dx + dz * dz);
      // 260713 fix: 핀이 겹치거나 선분이 0에 가까우면 방향이 정의되지 않아
      //   그 기억의 사물이 전부 한 점에 포개졌다. 황금각 방사 배치로 대체.
      if (len < 0.5) {
        var ang0 = (k * 2.39996) % (Math.PI * 2);
        dx = Math.cos(ang0) * 8;
        dz = Math.sin(ang0) * 8;
        len = 8;
      }
      var ux = dx / len, uz = dz / len;             // 선분 방향
      var px = -uz, pz = ux;                        // 수직 방향
      var posMap = (sMeta.object_pos && typeof sMeta.object_pos === 'object') ? sMeta.object_pos : null;

      for (var w = 0; w < words.length; w++) {
        var word = String(words[w] || '').trim();
        if (!word) continue;
        var r = _rng('place|' + word + '|' + k);
        var t = o.segT[0] + r() * (o.segT[1] - o.segT[0]);
        var side = (r() < 0.5 ? -1 : 1);
        var perp = o.perpMin + r() * (o.perpMax - o.perpMin);
        var cx = p.wx + dx * t + px * perp * side;
        var cz = p.wz + dz * t + pz * perp * side;
        var rotY = r() * Math.PI * 2;               // ← 난수 4번째. 순서 고정.

        // 작가 지정이 있으면 자동 좌표를 덮는다 (회전은 자동 유지)
        var pinned = false;
        if (posMap) {
          var ov = posMap[word];
          if (ov && isFinite(ov.x) && isFinite(ov.z)) {
            cx = Number(ov.x); cz = Number(ov.z); pinned = true;
          }
        }

        out.push({
          scene: p.scene,
          sceneId: (p.scene && p.scene.id) || null,
          word: word, x: cx, z: cz, rotY: rotY, k: k, pinned: pinned,
        });
      }
    }
    return out;
  }

  /**
   * 출구문 자리 (260730) — 사물과 같은 문법. 플레이·admin 공용.
   *
   * 배경(결함): 문이 (22,22) 하드코딩이라 모든 기억이 같은 자리였고, 씬 핀은 ±50까지
   *   흩어져 있어 어떤 기억은 문이 씬 한복판, 어떤 기억은 아무도 안 가는 구석이었다.
   *   게다가 "문을 시작 자리 쪽으로 돌린다"는 줄이 문 자신의 좌표를 바라보게 돼 있어
   *   회전이 통째로 무효였다.
   *
   * 우선순위: 1) memories.meta.door_pos (작가가 admin 에서 끌어 지정)
   *           2) 자동 — **씬 무리의 반대편**. 관객은 지형 중심에서 시작해 기억들 쪽으로
   *              걸어가므로, 그 반대편이 곧 등 뒤가 된다("들어온 쪽으로 나간다").
   *              시작 좌표가 아니라 씬 배치로 정의해야 admin 도 같은 자리를 그릴 수 있다.
   *
   * @param items [{ wx, wz }] — 핀 좌표 (resolvePinPos 결과)
   * @param memoryMeta memories.meta
   * @returns { x, z, faceX, faceZ, source } — face* = 문이 바라볼 지점(씬 무리 중심)
   */
  function resolveDoorPos(items, memoryMeta) {
    var pts = (items || []).filter(function (p) {
      return p && typeof p.wx === 'number' && typeof p.wz === 'number';
    });
    // 씬 무리 중심 — 문이 바라볼 곳
    var cx = 0, cz = 0;
    if (pts.length) {
      for (var i = 0; i < pts.length; i++) { cx += pts[i].wx; cz += pts[i].wz; }
      cx /= pts.length; cz /= pts.length;
    }
    var meta = memoryMeta || {};
    var dp = meta.door_pos;
    if (dp && isFinite(dp.x) && isFinite(dp.z)) {
      return { x: Number(dp.x), z: Number(dp.z), faceX: cx, faceZ: cz, source: 'manual' };
    }
    // 자동 — 중심에서 씬 무리 반대 방향으로, 무리 반경만큼 더 멀리
    var len = Math.sqrt(cx * cx + cz * cz);
    var ux, uz;
    if (len < 0.5) {                 // 씬이 지형 한가운데 모여 방향이 없을 때
      ux = 0.7071; uz = 0.7071;      // 옛 (22,22) 와 같은 대각 방향 유지
    } else {
      ux = cx / len; uz = cz / len;
    }
    // 무리에서 가장 먼 씬까지의 거리 + 여유 → 문이 기억들 바깥에 선다
    var far = 0;
    for (var k = 0; k < pts.length; k++) {
      var d = Math.sqrt(pts[k].wx * pts[k].wx + pts[k].wz * pts[k].wz);
      if (d > far) far = d;
    }
    var R = Math.max(15, Math.min(50, far * 0.55 + 12));
    return { x: -ux * R, z: -uz * R, faceX: cx, faceZ: cz, source: 'auto' };
  }

  global.TemObjectAnchors = {
    layout: layout,
    resolvePinPos: resolvePinPos,
    resolveDoorPos: resolveDoorPos,
    wordsFor: wordsFor,
    hash: _hash,
    rng: _rng,
    DEFAULTS: DEFAULTS,
  };
})(typeof window !== 'undefined' ? window : globalThis);

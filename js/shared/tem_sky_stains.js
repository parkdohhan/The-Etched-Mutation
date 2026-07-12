// ================================================================
//  TEM — 하늘 감정 얼룩 (Sky Emotion Stains)
//
//  하늘은 *개인의 영역*이다. 지형(지층)이 릴레이·누적이라면, 하늘은 이 한 판의 것.
//   · 빈 하늘(남색)로 시작 — 아직 아무것도 뱉지 않은 상태
//   · 텍스트 분석으로 감정이 확정될 때마다 그 색이 '얼룩'으로 쌓인다 (교체 X, 누적)
//   · 같은 결의 감정을 반복하면 그 얼룩이 진해지고, 다른 감정은 새 얼룩으로 번진다
//   · 기억 단위로 리셋 — 플레이어 A의 하늘은 플레이어 B에게 넘어가지 않는다
//   · 판이 끝나면 serialize() 해서 그 판 기록에 붙는다 (자료: "나는 이 기억을 이렇게 읽었다")
//
//  평균내지 않는 이유: 색을 섞어 평균내면 턴이 쌓일수록 진흙색으로 수렴해 다 죽는다.
//  얼룩(patch)으로 남겨야 각 감정이 제 색을 유지한 채 공존한다. 셰이더가 fbm 노이즈로
//  얼룩마다 다른 구역을 물들인다 (tem_af_strata_terrain.js 하늘 돔).
// ================================================================

(function (global) {
  'use strict';

  var MAX = 8;              // 하늘에 동시에 남을 수 있는 얼룩 수 (셰이더 배열 크기와 일치)
  var ADD_W = 0.45;         // 새 얼룩이 처음 앉을 때의 무게
  var REINFORCE_W = 0.35;   // 같은 감정 반복 시 얼룩이 진해지는 양
  var SAME_STAIN_SIM = 0.88; // 이 이상 비슷하면 '같은 결의 감정' → 새 얼룩 대신 기존 얼룩 강화

  var _stains = [];         // [{ r, g, b, w }] — w = 누적 무게 (0~1)
  var _memoryId = null;

  /** 두 색의 유사도 0~1 (1 = 같은 색) */
  function _sim(a, b) {
    var dr = (a.r - b.r) / 255;
    var dg = (a.g - b.g) / 255;
    var db = (a.b - b.b) / 255;
    var d = Math.sqrt(dr * dr + dg * dg + db * db);
    return 1 - Math.min(1, d / 1.2);
  }

  /** 기억 진입 = 빈 하늘로 리셋. 다음 플레이어는 남의 하늘을 물려받지 않는다. */
  function reset(memoryId) {
    _stains = [];
    _memoryId = memoryId || null;
  }

  /**
   * 감정색 얼룩 추가 (텍스트 분석으로 감정이 확정됐을 때만 호출).
   * @param {{r:number,g:number,b:number}} rgb 0~255
   */
  function add(rgb) {
    if (!rgb || rgb.r == null) return;
    var c = { r: rgb.r, g: rgb.g, b: rgb.b };

    // 같은 결의 감정 → 기존 얼룩이 진해짐 (새 얼룩 안 만듦)
    for (var i = 0; i < _stains.length; i++) {
      if (_sim(_stains[i], c) > SAME_STAIN_SIM) {
        _stains[i].w = Math.min(1, _stains[i].w + REINFORCE_W);
        return;
      }
    }

    // 자리가 꽉 찼으면 가장 옅은 얼룩을 새 감정이 덮어씀
    if (_stains.length >= MAX) {
      var mi = 0;
      for (var j = 1; j < _stains.length; j++) {
        if (_stains[j].w < _stains[mi].w) mi = j;
      }
      _stains[mi] = { r: c.r, g: c.g, b: c.b, w: ADD_W };
      return;
    }

    _stains.push({ r: c.r, g: c.g, b: c.b, w: ADD_W });
  }

  /** 셰이더가 매 프레임 읽는 얼룩 목록 */
  function list() {
    return _stains;
  }

  /** 얼룩들의 가중 평균색 — 안개/지평선이 이 색으로 녹아든다. 없으면 null. */
  function averageColor() {
    var r = 0, g = 0, b = 0, sum = 0;
    for (var i = 0; i < _stains.length; i++) {
      var s = _stains[i];
      r += s.r * s.w; g += s.g * s.w; b += s.b * s.w; sum += s.w;
    }
    if (sum <= 0) return null;
    return { r: r / sum, g: g / sum, b: b / sum, weight: Math.min(1, sum / 2) };
  }

  /** 판 기록에 붙일 직렬화 — "나는 이 기억을 이렇게 읽었다"의 자료 */
  function serialize() {
    return {
      memory_id: _memoryId,
      stains: _stains.map(function (s) {
        return { r: Math.round(s.r), g: Math.round(s.g), b: Math.round(s.b), w: Math.round(s.w * 100) / 100 };
      }),
    };
  }

  global.TemSkyStains = {
    MAX: MAX,
    reset: reset,
    add: add,
    list: list,
    averageColor: averageColor,
    serialize: serialize,
  };
})(typeof window !== 'undefined' ? window : this);

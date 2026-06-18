/**
 * Terrain distinctness FIX harness.
 * Reuses the EXACT Pass-1 bedrock math ported in _terrain_distinct_probe.js,
 * but lets us toggle three candidate fixes and re-measure within/cross RMS:
 *
 *   (A) EMO_NOISE cluster param SPREADING — pull fear/anger/resentment apart in
 *       freq/oct/lac so same-cluster scenes get distinct noise textures.
 *   (B) FULL emotion-vector hash as an extra noise octave seed (not just dom emo).
 *   (C) ridged folding: mix(n, 1-|2n-1|, r) on the emotion noise.
 *
 * Baseline (no fix) MUST reproduce _terrain_distinct_probe.js exactly.
 * Run: node _terrain_distinct_fixes.js
 */
'use strict';

var EC = {
  fear: [0.4, 0.28, 0.7], sadness: [0.25, 0.38, 0.65], anger: [0.8, 0.25, 0.22], guilt: [0.6, 0.48, 0.35],
  longing: [0.28, 0.62, 0.65], numbness: [0.32, 0.32, 0.38], shame: [0.58, 0.35, 0.48], isolation: [0.14, 0.14, 0.24],
  joy: [0.82, 0.72, 0.38], resentment: [0.6, 0.2, 0.15], resignation: [0.4, 0.38, 0.35], hope: [0.55, 0.65, 0.45],
  relief: [0.48, 0.68, 0.48], love: [0.7, 0.4, 0.5], gratitude: [0.65, 0.58, 0.4], peace: [0.45, 0.58, 0.52],
  confusion: [0.48, 0.38, 0.55],
};
var VAD_FULL = {
  fear:{v:-0.9,a:0.9,d:-0.8}, sadness:{v:-0.8,a:-0.4,d:-0.7}, anger:{v:-0.7,a:0.8,d:0.3},
  guilt:{v:-0.8,a:0.2,d:-0.6}, shame:{v:-0.9,a:-0.2,d:-0.9}, isolation:{v:-0.7,a:-0.5,d:-0.6},
  numbness:{v:-0.6,a:-0.8,d:-0.4}, longing:{v:-0.3,a:0.2,d:-0.2}, resentment:{v:-0.5,a:0.6,d:0.1},
  resignation:{v:-0.4,a:-0.6,d:-0.5}, joy:{v:0.9,a:0.6,d:0.5}, hope:{v:0.7,a:0.4,d:0.6},
  relief:{v:0.6,a:-0.3,d:0.4}, gratitude:{v:0.8,a:-0.2,d:0.7}, love:{v:1.0,a:0.5,d:0.6},
  peace:{v:0.8,a:-0.6,d:0.7}, confusion:{v:-0.4,a:0.3,d:-0.5},
};
var VA_ANCHORS = {};
for (var ek in EC) { var vad = VAD_FULL[ek]; if (!vad) continue; VA_ANCHORS[ek] = { v: vad.v, a: vad.a, color: EC[ek] }; }

// ─── BASELINE EMO_NOISE (verbatim) ──
var EMO_NOISE_BASE = {
  fear:       { freq: 0.25, lac: 2.4, oct: 5, amp: 1.0 },
  anger:      { freq: 0.22, lac: 2.5, oct: 5, amp: 1.1 },
  resentment: { freq: 0.20, lac: 2.3, oct: 4, amp: 0.9 },
  sadness:    { freq: 0.08, lac: 2.0, oct: 4, amp: 0.7 },
  numbness:   { freq: 0.06, lac: 1.8, oct: 3, amp: 0.5 },
  resignation:{ freq: 0.07, lac: 1.9, oct: 3, amp: 0.6 },
  isolation:  { freq: 0.09, lac: 2.0, oct: 4, amp: 0.65 },
  joy:        { freq: 0.12, lac: 2.0, oct: 4, amp: 0.8 },
  hope:       { freq: 0.11, lac: 2.0, oct: 4, amp: 0.75 },
  love:       { freq: 0.10, lac: 1.9, oct: 4, amp: 0.85 },
  relief:     { freq: 0.10, lac: 2.0, oct: 3, amp: 0.7 },
  gratitude:  { freq: 0.11, lac: 2.0, oct: 3, amp: 0.7 },
  peace:      { freq: 0.09, lac: 1.8, oct: 3, amp: 0.65 },
  guilt:      { freq: 0.15, lac: 2.6, oct: 5, amp: 0.8 },
  shame:      { freq: 0.16, lac: 2.7, oct: 5, amp: 0.75 },
  confusion:  { freq: 0.18, lac: 2.8, oct: 5, amp: 0.7 },
  longing:    { freq: 0.13, lac: 2.2, oct: 4, amp: 0.8 },
};
var EMO_NOISE_DEFAULT = { freq: 0.12, lac: 2.0, oct: 4, amp: 0.7 };

// ─── FIX (A): SPREAD same-cluster params apart ──
// Within fear_anger cluster baseline freq sits 0.20..0.25 (near-identical noise).
// Within guilt_shame baseline 0.15..0.16. We widen the SPACING between siblings so
// same-cluster scenes get visibly different ridge wavelengths. We DON'T touch
// magnitude/VA — only the noise texture identity.
var EMO_NOISE_SPREAD = JSON.parse(JSON.stringify(EMO_NOISE_BASE));
// fear/anger/resentment: spread freq 0.18..0.34, oct 4..6, lac 2.2..2.8
EMO_NOISE_SPREAD.fear       = { freq: 0.34, lac: 2.8, oct: 6, amp: 1.0 };
EMO_NOISE_SPREAD.anger      = { freq: 0.26, lac: 2.5, oct: 5, amp: 1.1 };
EMO_NOISE_SPREAD.resentment = { freq: 0.18, lac: 2.2, oct: 4, amp: 0.9 };
// guilt/shame/confusion: spread freq 0.12..0.24
EMO_NOISE_SPREAD.guilt      = { freq: 0.12, lac: 2.4, oct: 4, amp: 0.8 };
EMO_NOISE_SPREAD.shame      = { freq: 0.20, lac: 2.7, oct: 5, amp: 0.75 };
EMO_NOISE_SPREAD.confusion  = { freq: 0.24, lac: 2.8, oct: 6, amp: 0.7 };
// sad/numb/resignation/isolation: spread freq 0.04..0.16
EMO_NOISE_SPREAD.numbness   = { freq: 0.04, lac: 1.8, oct: 3, amp: 0.5 };
EMO_NOISE_SPREAD.resignation= { freq: 0.07, lac: 1.9, oct: 3, amp: 0.6 };
EMO_NOISE_SPREAD.sadness    = { freq: 0.11, lac: 2.0, oct: 4, amp: 0.7 };
EMO_NOISE_SPREAD.isolation  = { freq: 0.16, lac: 2.2, oct: 4, amp: 0.65 };

function hs(x, y) { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function sN(x, y) {
  var ix = Math.floor(x); var iy = Math.floor(y); var fx = x - ix; var fy = y - iy;
  var sx = fx * fx * (3 - 2 * fx); var sy = fy * fy * (3 - 2 * fy);
  return hs(ix, iy) * (1 - sx) * (1 - sy) + hs(ix + 1, iy) * sx * (1 - sy) + hs(ix, iy + 1) * (1 - sx) * sy + hs(ix + 1, iy + 1) * sx * sy;
}
function fbCustom(x, y, freq, lac, oct, amp) {
  var v = 0; var a = amp * 0.5; var f = freq;
  for (var i = 0; i < oct; i++) { v += a * sN(x * f, y * f); a *= 0.5; f *= lac; }
  return v;
}
function projectToVAD(emoVec) {
  var V = 0, A = 0, wSum = 0;
  for (var k in emoVec) {
    if (!Object.prototype.hasOwnProperty.call(emoVec, k)) continue;
    var w = Number(emoVec[k] || 0); var m = VAD_FULL[k];
    if (!w || !m) continue;
    V += w * m.v; A += w * m.a; wSum += w;
  }
  if (wSum <= 0) return { v: 0, a: 0 };
  return { v: Math.max(-1, Math.min(1, V / wSum)), a: Math.max(-1, Math.min(1, A / wSum)) };
}
function computeVAWeights(vad, anchors) {
  var weights = {}; var totalW = 0;
  for (var name in anchors) {
    var anc = anchors[name];
    var dv = vad.v - anc.v; var da = vad.a - anc.a;
    var dist2 = dv * dv + da * da;
    var w = Math.exp(-dist2 / 0.5);
    if (w > 0.01) { weights[name] = w; totalW += w; }
  }
  if (totalW > 0) { for (var k in weights) weights[k] /= totalW; }
  return weights;
}
function hashWorldOffset(id) {
  var h = 5381; var s = String(id);
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  h = Math.abs(h);
  var ang = (h % 628) / 100; var mag = 1.4 + (h % 700) / 180;
  return { ox: Math.cos(ang) * mag, oz: Math.sin(ang * 1.07) * mag };
}
function computeMag(emo) { var e = 0; for (var ek in emo) { if (typeof emo[ek] === 'number') e += emo[ek] * emo[ek]; } return Math.sqrt(e); }
function computeDom(emo) { var domK = '', domV = 0; for (var dk in emo) { if (emo[dk] > domV) { domV = emo[dk]; domK = dk; } } return domK; }

// FIX (B): hash the FULL emotion vector (all keys+values, sorted) into a stable seed.
// This makes two scenes that share a dominant emotion but differ in the rest of the
// vector sample DIFFERENT noise — the texture now depends on the whole emotion shape.
function hashEmoVec(emo) {
  var keys = Object.keys(emo).filter(function (k) { return typeof emo[k] === 'number' && emo[k] !== 0; }).sort();
  var s = '';
  for (var i = 0; i < keys.length; i++) { s += keys[i] + ':' + Math.round(emo[keys[i]] * 1000) + '|'; }
  var h = 5381;
  for (var j = 0; j < s.length; j++) h = ((h << 5) + h) ^ s.charCodeAt(j);
  h = Math.abs(h);
  return { sx: (h % 997) / 7.3, sz: (Math.floor(h / 997) % 997) / 6.1 }; // two large seed offsets
}

// FIX (C): ridged fold. mix(n, 1-|2n-1|, r). r in [0,1].
function ridgedFold(n, r) {
  var ridged = 1 - Math.abs(2 * n - 1);
  return n * (1 - r) + ridged * r;
}

/**
 * Local heightfield for ONE scene emotion vector. `fix` selects which fix(es) apply.
 * fix = { spread:bool, fullHash:bool, ridged:0..1 }
 */
function sceneHeightfield(emo, memId, fix) {
  var G = 48, window = 60;
  var H2 = 112 / 2;
  var off2 = hashWorldOffset(memId);
  var scVad = projectToVAD(emo);
  var scWeights = computeVAWeights(scVad, VA_ANCHORS);
  var domEmo = computeDom(emo);
  var eMag = computeMag(emo);
  var noiseTable = fix.spread ? EMO_NOISE_SPREAD : EMO_NOISE_BASE;
  var np = noiseTable[domEmo] || EMO_NOISE_DEFAULT;
  var emoSeed = fix.fullHash ? hashEmoVec(emo) : { sx: 0, sz: 0 };

  var cx = scVad.v * H2 + off2.ox;
  var cz = scVad.a * H2 + off2.oz;

  var hts = new Float64Array(G * G);
  for (var iz = 0; iz < G; iz++) {
    for (var ix = 0; ix < G; ix++) {
      var idx = iz * G + ix;
      var wx = cx + (ix / (G - 1) - 0.5) * window;
      var wz = cz + (iz / (G - 1) - 0.5) * window;
      var totalH = 0;
      var si = 0;
      for (var ancName in scWeights) {
        var aw = scWeights[ancName];
        if (!aw || !VA_ANCHORS[ancName]) continue;
        var anc = VA_ANCHORS[ancName];
        var ax = anc.v * H2 + off2.ox;
        var az = anc.a * H2 + off2.oz;
        var ddx = wx - ax; var ddz = wz - az;
        var dist = Math.sqrt(ddx * ddx + ddz * ddz);
        var radius = 10 + aw * 22;
        if (dist >= radius * 1.8) continue;
        var sig = radius * 0.55;
        var inf = Math.exp(-(dist * dist) / (2 * sig * sig)) * aw;

        // emotion noise sample coord (+ FIX B full-vector seed offset)
        var nx = wx * np.freq * 0.7 + si * 5 + emoSeed.sx;
        var nz = wz * np.freq * 0.7 + si * 3 + emoSeed.sz;
        var emoNoise = fbCustom(nx, nz, np.freq * 0.7, np.lac, np.oct, np.amp);
        // FIX C: ridged fold
        if (fix.ridged > 0) emoNoise = ridgedFold(emoNoise, fix.ridged);

        var dh = eMag * 22 * inf * (0.4 + emoNoise * 0.6);
        totalH += dh;
      }
      hts[idx] = totalH;
    }
  }
  return { hts: hts, domEmo: domEmo, eMag: eMag, scVad: scVad };
}

function rmsDiff(a, b) { var n = a.length, s = 0; for (var i = 0; i < n; i++) { var d = a[i] - b[i]; s += d * d; } return Math.sqrt(s / n); }

var DATA = [
  { mem:'7a700000', scene:6, cluster:'fear_anger', vec:{fear:0.8,anger:0.05,guilt:0.05,shame:0.1,longing:0.05,sadness:0.2,numbness:0.25,isolation:0.5} },
  { mem:'d9fd25f0', scene:4, cluster:'fear_anger', vec:{fear:0.7,numbness:0.35,isolation:0.5} },
  { mem:'1dde3a8a', scene:0, cluster:'fear_anger', vec:{fear:0.7,sadness:0.2,isolation:0.4} },
  { mem:'82d6a613', scene:4, cluster:'fear_anger', vec:{joy:0,fear:0.05,anger:0.4,guilt:0.05,longing:0.15,sadness:0.45} },
  { mem:'d9fd25f0', scene:0, cluster:'fear_anger', vec:{fear:0.55,anger:0.3,numbness:0.42,isolation:0.65} },
  { mem:'82d6a613', scene:3, cluster:'fear_anger', vec:{joy:0,fear:0.038,anger:0.307,guilt:0.038,longing:0.115,sadness:0.345} },
  { mem:'7a700000', scene:0, cluster:'sad_numb', vec:{fear:0.15,anger:0.05,guilt:0.05,shame:0.1,longing:0.15,sadness:0.3,numbness:0.7,isolation:0.5} },
  { mem:'c4888189', scene:5, cluster:'sad_numb', vec:{fear:0.15,numbness:0.65,isolation:0.4} },
  { mem:'d9fd25f0', scene:6, cluster:'sad_numb', vec:{longing:0.2,sadness:0.4,numbness:0.65,isolation:0.5} },
  { mem:'d9fd25f0', scene:1, cluster:'sad_numb', vec:{guilt:0.45,longing:0.35,sadness:0.6,numbness:0.28} },
  { mem:'1dde3a8a', scene:2, cluster:'sad_numb', vec:{sadness:0.6,longing:0.5,isolation:0.4} },
  { mem:'c4888189', scene:0, cluster:'sad_numb', vec:{fear:0.15,sadness:0.25,numbness:0.58,isolation:0.48} },
  { mem:'d9fd25f0', scene:2, cluster:'guilt_shame', vec:{anger:0.58,guilt:0.4,shame:0.72,isolation:0.35} },
  { mem:'7a700000', scene:5, cluster:'guilt_shame', vec:{fear:0.3,anger:0.15,guilt:0.55,shame:0.65,longing:0.15,sadness:0.35,numbness:0.45,isolation:0.5} },
  { mem:'c291e1aa', scene:1, cluster:'guilt_shame', vec:{fear:0.2,love:0.1,guilt:0.4,shame:0.15,sadness:0.15} },
  { mem:'7a700000', scene:4, cluster:'guilt_shame', vec:{fear:0.2,anger:0.25,guilt:0.4,shame:0.55,longing:0.35,sadness:0.45,numbness:0.4,isolation:0.4} },
  { mem:'c291e1aa', scene:0, cluster:'guilt_shame', vec:{shame:0.35,longing:0.2,sadness:0.15,confusion:0.05,isolation:0.25} },
  { mem:'7a700000', scene:1, cluster:'guilt_shame', vec:{fear:0.5,anger:0.05,guilt:0.15,shame:0.45,longing:0.1,sadness:0.3,numbness:0.4,isolation:0.5} },
];

function mean(arr) { return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; }
function median(arr) { var s = arr.slice().sort(function (a, b) { return a - b; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function mn(arr) { return Math.min.apply(null, arr); }
function mx(arr) { return Math.max.apply(null, arr); }

function measure(fix) {
  var fields = DATA.map(function (d) {
    var f = sceneHeightfield(d.vec, d.mem, fix);
    f.label = d.mem + ':s' + d.scene; f.cluster = d.cluster; f.dom = f.domEmo;
    return f;
  });
  var within = [], cross = [];
  var withinPairs = [], crossPairs = [];
  for (var i = 0; i < fields.length; i++) {
    for (var j = i + 1; j < fields.length; j++) {
      var r = rmsDiff(fields[i].hts, fields[j].hts);
      var ps = fields[i].label + '(' + fields[i].dom + ') vs ' + fields[j].label + '(' + fields[j].dom + ') = ' + r.toFixed(4);
      if (fields[i].cluster === fields[j].cluster) { within.push(r); withinPairs.push({ p: ps, r: r }); }
      else { cross.push(r); crossPairs.push({ p: ps, r: r }); }
    }
  }
  var crossSorted = crossPairs.slice().sort(function (a, b) { return a.r - b.r; });
  return {
    within_mean: mean(within), within_median: median(within), within_min: mn(within), within_max: mx(within),
    cross_mean: mean(cross), cross_median: median(cross), cross_min: mn(cross), cross_max: mx(cross),
    ratio: mean(cross) / mean(within),
    overlap: mn(cross) <= mx(within),
    cross_min_gt_within_max: mn(cross) > mx(within),
    worstMush: crossSorted.slice(0, 4).map(function (o) { return o.p; }),
    n_within_below_cross_min: within.filter(function (w) { return false; }).length,
  };
}

function selfVariant(fix) {
  var baseFear = {fear:0.8,anger:0.05,guilt:0.05,shame:0.1,longing:0.05,sadness:0.2,numbness:0.25,isolation:0.5};
  var mems = ['7a700000','d9fd25f0','1dde3a8a','82d6a613','c4888189','c291e1aa','1f586f9b'];
  var fields = mems.map(function (mid) { return sceneHeightfield(baseFear, mid, fix); });
  var diffs = [];
  for (var i = 0; i < fields.length; i++) for (var j = i + 1; j < fields.length; j++) diffs.push(rmsDiff(fields[i].hts, fields[j].hts));
  return mean(diffs);
}

var SCEN = [
  { name: 'BASELINE (no fix)',                 fix: { spread:false, fullHash:false, ridged:0 } },
  { name: '(A) EMO_NOISE spread',              fix: { spread:true,  fullHash:false, ridged:0 } },
  { name: '(B) full-vector hash seed',         fix: { spread:false, fullHash:true,  ridged:0 } },
  { name: '(C) ridged fold r=0.7',             fix: { spread:false, fullHash:false, ridged:0.7 } },
  { name: '(C) ridged fold r=1.0',             fix: { spread:false, fullHash:false, ridged:1.0 } },
  { name: 'A+B combined',                      fix: { spread:true,  fullHash:true,  ridged:0 } },
  { name: 'A+B+C(0.7) combined',               fix: { spread:true,  fullHash:true,  ridged:0.7 } },
];

console.log('=== TERRAIN DISTINCTNESS — FIX COMPARISON ===');
console.log('18 real DB scenes, G=48 local heightfield, exact Pass-1 math, cont=0/void=0/warp=0\n');
var base = measure(SCEN[0].fix);
console.log('scenario'.padEnd(28) + 'within_mean  within_med   cross_mean   ratio   cross_min  within_max  overlap?  self-var');
SCEN.forEach(function (s) {
  var m = measure(s.fix);
  var sv = selfVariant(s.fix);
  var deltaWithin = ((m.within_mean - base.within_mean) / base.within_mean * 100);
  var line = s.name.padEnd(28)
    + m.within_mean.toFixed(4).padStart(8)
    + (deltaWithin >= 0 ? ' (+' : ' (') + deltaWithin.toFixed(0) + '%)'
    + m.within_median.toFixed(4).padStart(8)
    + m.cross_mean.toFixed(4).padStart(13)
    + m.ratio.toFixed(3).padStart(8)
    + m.cross_min.toFixed(4).padStart(11)
    + m.within_max.toFixed(4).padStart(12)
    + (m.overlap ? '  OVERLAP' : '  CLEAN ').padStart(10)
    + sv.toFixed(4).padStart(10);
  console.log(line);
});

console.log('\n=== worst cross-cluster MUSH pairs per scenario (smaller RMS = worse mush) ===');
SCEN.forEach(function (s) {
  var m = measure(s.fix);
  console.log('\n[' + s.name + ']  cross_min=' + m.cross_min.toFixed(4));
  m.worstMush.forEach(function (p) { console.log('   ' + p); });
});

console.log('\n=== JSON SUMMARY ===');
var out = {};
SCEN.forEach(function (s) {
  var m = measure(s.fix);
  out[s.name] = {
    within_mean: +m.within_mean.toFixed(4),
    within_mean_delta_pct: +((m.within_mean - base.within_mean) / base.within_mean * 100).toFixed(1),
    cross_mean: +m.cross_mean.toFixed(4),
    cross_min: +m.cross_min.toFixed(4),
    within_max: +m.within_max.toFixed(4),
    ratio_cross_over_within: +m.ratio.toFixed(3),
    overlap: m.overlap,
    cross_min_gt_within_max: m.cross_min_gt_within_max,
    self_variant_mean: +selfVariant(s.fix).toFixed(4),
  };
});
console.log(JSON.stringify(out, null, 2));

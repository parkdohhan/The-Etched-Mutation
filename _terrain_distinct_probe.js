/**
 * Faithful port of js/shared/tem_af_strata_terrain.js bedrock height formula.
 * Goal: compute a local heightfield per real emotion vector, then measure
 * same-cluster vs cross-cluster RMS height difference.
 *
 * Ported VERBATIM from the source (line refs in comments):
 *  - hs / sN  (:147-152)   noise basis
 *  - fbCustom (:321-325)   custom FBM
 *  - EMO_NOISE (:296-318)  per-emotion noise params
 *  - eMag (:206-208), domEmo (:210-211)
 *  - projectToVAD (:105-116), computeVAWeights (:118-129)
 *  - hashWorldOffset (:137-145), VA_ANCHORS (:96-103)
 *  - Pass-1 bedrock bump loop (:376-422)
 *
 * Contamination/drift/warp/void are all 0 here (we feed bare original_emotion),
 * so we exercise ONLY the scene->terrain geometry path, which is exactly what
 * "does scene terrain actually differ" asks.
 */
'use strict';

// ─── EC (color anchors define which emotions are "real" categories) :29-35 ──
var EC = {
  fear: [0.4, 0.28, 0.7], sadness: [0.25, 0.38, 0.65], anger: [0.8, 0.25, 0.22], guilt: [0.6, 0.48, 0.35],
  longing: [0.28, 0.62, 0.65], numbness: [0.32, 0.32, 0.38], shame: [0.58, 0.35, 0.48], isolation: [0.14, 0.14, 0.24],
  joy: [0.82, 0.72, 0.38], resentment: [0.6, 0.2, 0.15], resignation: [0.4, 0.38, 0.35], hope: [0.55, 0.65, 0.45],
  relief: [0.48, 0.68, 0.48], love: [0.7, 0.4, 0.5], gratitude: [0.65, 0.58, 0.4], peace: [0.45, 0.58, 0.52],
  confusion: [0.48, 0.38, 0.55],
};

// ─── VAD_FULL :86-93 ──
var VAD_FULL = {
  fear:{v:-0.9,a:0.9,d:-0.8}, sadness:{v:-0.8,a:-0.4,d:-0.7}, anger:{v:-0.7,a:0.8,d:0.3},
  guilt:{v:-0.8,a:0.2,d:-0.6}, shame:{v:-0.9,a:-0.2,d:-0.9}, isolation:{v:-0.7,a:-0.5,d:-0.6},
  numbness:{v:-0.6,a:-0.8,d:-0.4}, longing:{v:-0.3,a:0.2,d:-0.2}, resentment:{v:-0.5,a:0.6,d:0.1},
  resignation:{v:-0.4,a:-0.6,d:-0.5}, joy:{v:0.9,a:0.6,d:0.5}, hope:{v:0.7,a:0.4,d:0.6},
  relief:{v:0.6,a:-0.3,d:0.4}, gratitude:{v:0.8,a:-0.2,d:0.7}, love:{v:1.0,a:0.5,d:0.6},
  peace:{v:0.8,a:-0.6,d:0.7}, confusion:{v:-0.4,a:0.3,d:-0.5},
};

// VA_ANCHORS :96-103
var VA_ANCHORS = {};
for (var ek in EC) {
  var vad = VAD_FULL[ek];
  if (!vad) continue;
  VA_ANCHORS[ek] = { v: vad.v, a: vad.a, color: EC[ek] };
}

// ─── EMO_NOISE :296-318 ──
var EMO_NOISE = {
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

// ─── noise basis :147-152 ──
function hs(x, y) { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function sN(x, y) {
  var ix = Math.floor(x); var iy = Math.floor(y); var fx = x - ix; var fy = y - iy;
  var sx = fx * fx * (3 - 2 * fx); var sy = fy * fy * (3 - 2 * fy);
  return hs(ix, iy) * (1 - sx) * (1 - sy) + hs(ix + 1, iy) * sx * (1 - sy) + hs(ix, iy + 1) * (1 - sx) * sy + hs(ix + 1, iy + 1) * sx * sy;
}
// fbCustom :321-325
function fbCustom(x, y, freq, lac, oct, amp) {
  var v = 0; var a = amp * 0.5; var f = freq;
  for (var i = 0; i < oct; i++) { v += a * sN(x * f, y * f); a *= 0.5; f *= lac; }
  return v;
}

// projectToVAD :105-116
function projectToVAD(emoVec) {
  var V = 0, A = 0, wSum = 0;
  for (var k in emoVec) {
    if (!Object.prototype.hasOwnProperty.call(emoVec, k)) continue;
    var w = Number(emoVec[k] || 0);
    var m = VAD_FULL[k];
    if (!w || !m) continue;
    V += w * m.v; A += w * m.a; wSum += w;
  }
  if (wSum <= 0) return { v: 0, a: 0 };
  return { v: Math.max(-1, Math.min(1, V / wSum)), a: Math.max(-1, Math.min(1, A / wSum)) };
}

// computeVAWeights :118-129
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

// hashWorldOffset :137-145
function hashWorldOffset(id) {
  var h = 5381;
  var s = String(id);
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  h = Math.abs(h);
  var ang = (h % 628) / 100;
  var mag = 1.4 + (h % 700) / 180;
  return { ox: Math.cos(ang) * mag, oz: Math.sin(ang * 1.07) * mag };
}

// eMag :206-208
function computeMag(emo) {
  var eMag = 0;
  for (var ek in emo) { if (typeof emo[ek] === 'number') eMag += emo[ek] * emo[ek]; }
  return Math.sqrt(eMag);
}
// domEmo :210-211
function computeDom(emo) {
  var domK = ''; var domV = 0;
  for (var dk in emo) { if (emo[dk] > domV) { domV = emo[dk]; domK = dk; } }
  return domK;
}

/**
 * Compute a LOCAL heightfield for ONE scene emotion vector, using the exact
 * Pass-1 bedrock bump math (:376-422). We sample a GxG grid centered on the
 * scene's own VA position so the bumps actually land in-frame (the real terrain
 * uses a global SZ=112 plane; here we crop a local window around the scene).
 *
 * memId is used for hashWorldOffset, exactly as the real code does
 * (off2 = hashWorldOffset(m.id), :386). We pass the scene's source memory id.
 */
function sceneHeightfield(emo, memId, G, window) {
  G = G || 48;
  window = window || 60; // local window size in world units around the scene
  var H2 = 112 / 2; // SAME H2 as real terrain (SZ=112 -> H2=56), anchors live in this space :331,388
  var off2 = hashWorldOffset(memId);

  var scVad = projectToVAD(emo);
  var scWeights = computeVAWeights(scVad, VA_ANCHORS);
  var domEmo = computeDom(emo);
  var eMag = computeMag(emo);
  var np = EMO_NOISE[domEmo] || EMO_NOISE_DEFAULT;

  // scene center in world space (where scVad maps to). We center the local
  // sampling window here so we capture this scene's bumps.
  var cx = scVad.v * H2 + off2.ox;
  var cz = scVad.a * H2 + off2.oz;

  var hts = new Float64Array(G * G);
  for (var iz = 0; iz < G; iz++) {
    for (var ix = 0; ix < G; ix++) {
      var idx = iz * G + ix;
      // world coordinate of this grid cell (local window around scene center)
      var wx = cx + (ix / (G - 1) - 0.5) * window;
      var wz = cz + (iz / (G - 1) - 0.5) * window;

      var totalH = 0;
      // si = 0 (single scene). The real loop adds si*5 / si*3 offsets to the
      // emotion-noise sampling coords (:398); with one scene si=0 so no offset.
      var si = 0;
      for (var ancName in scWeights) {
        var aw = scWeights[ancName];
        if (!aw || !VA_ANCHORS[ancName]) continue;
        var anc = VA_ANCHORS[ancName];
        // off2 = hashWorldOffset(m.id) :386 — same as scene's memory id
        var ax = anc.v * H2 + off2.ox;
        var az = anc.a * H2 + off2.oz;
        var ddx = wx - ax; var ddz = wz - az;
        var dist = Math.sqrt(ddx * ddx + ddz * ddz);
        var radius = 10 + aw * 22;            // :391
        if (dist >= radius * 1.8) continue;    // :392

        var sig = radius * 0.55;               // :394
        var inf = Math.exp(-(dist * dist) / (2 * sig * sig)) * aw; // :395

        var emoNoise = fbCustom(wx * np.freq * 0.7 + si * 5, wz * np.freq * 0.7 + si * 3, np.freq * 0.7, np.lac, np.oct, np.amp); // :398
        var dh = eMag * 22 * inf * (0.4 + emoNoise * 0.6); // :401
        // heterogeneity term :404 omitted (cont.heterogeneity = 0 for bare original_emotion)
        totalH += dh;
      }
      // void term :415-421 omitted (no void_info on these bare vectors)
      hts[idx] = totalH;
    }
  }
  return { hts: hts, G: G, domEmo: domEmo, eMag: eMag, scVad: scVad, weights: scWeights };
}

// RMS difference between two equal-size heightfields
function rmsDiff(a, b) {
  var n = a.length, s = 0;
  for (var i = 0; i < n; i++) { var d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s / n);
}

// ─── REAL DB vectors (verbatim from the handoff, de-stringified) ──
// Each entry: { mem, scene, vec, cluster }
// Cluster assignment follows the handoff's clustering_notes ground truth.
var DATA = [
  // FEAR/ANGER cluster
  { mem:'7a700000', scene:6, cluster:'fear_anger', vec:{fear:0.8,anger:0.05,guilt:0.05,shame:0.1,longing:0.05,sadness:0.2,numbness:0.25,isolation:0.5} }, // fear single-peak
  { mem:'d9fd25f0', scene:4, cluster:'fear_anger', vec:{fear:0.7,numbness:0.35,isolation:0.5} },                                                        // fear single-peak
  { mem:'1dde3a8a', scene:0, cluster:'fear_anger', vec:{fear:0.7,sadness:0.2,isolation:0.4} },                                                          // fear-dominant
  { mem:'82d6a613', scene:4, cluster:'fear_anger', vec:{joy:0,fear:0.05,anger:0.4,guilt:0.05,longing:0.15,sadness:0.45} },                              // anger-dominant (+sadness)
  { mem:'d9fd25f0', scene:0, cluster:'fear_anger', vec:{fear:0.55,anger:0.3,numbness:0.42,isolation:0.65} },                                            // fear/isolation+anger
  { mem:'82d6a613', scene:3, cluster:'fear_anger', vec:{joy:0,fear:0.038,anger:0.307,guilt:0.038,longing:0.115,sadness:0.345} },                        // anger/sadness

  // SADNESS/NUMBNESS cluster
  { mem:'7a700000', scene:0, cluster:'sad_numb', vec:{fear:0.15,anger:0.05,guilt:0.05,shame:0.1,longing:0.15,sadness:0.3,numbness:0.7,isolation:0.5} }, // numbness-dominant
  { mem:'c4888189', scene:5, cluster:'sad_numb', vec:{fear:0.15,numbness:0.65,isolation:0.4} },                                                         // numbness single-peak
  { mem:'d9fd25f0', scene:6, cluster:'sad_numb', vec:{longing:0.2,sadness:0.4,numbness:0.65,isolation:0.5} },                                           // numbness/isolation
  { mem:'d9fd25f0', scene:1, cluster:'sad_numb', vec:{guilt:0.45,longing:0.35,sadness:0.6,numbness:0.28} },                                             // sadness-dominant
  { mem:'1dde3a8a', scene:2, cluster:'sad_numb', vec:{sadness:0.6,longing:0.5,isolation:0.4} },                                                         // sadness-dominant
  { mem:'c4888189', scene:0, cluster:'sad_numb', vec:{fear:0.15,sadness:0.25,numbness:0.58,isolation:0.48} },                                           // numbness-dominant

  // GUILT/SHAME cluster
  { mem:'d9fd25f0', scene:2, cluster:'guilt_shame', vec:{anger:0.58,guilt:0.4,shame:0.72,isolation:0.35} },                                             // shame-dominant
  { mem:'7a700000', scene:5, cluster:'guilt_shame', vec:{fear:0.3,anger:0.15,guilt:0.55,shame:0.65,longing:0.15,sadness:0.35,numbness:0.45,isolation:0.5} }, // guilt/shame
  { mem:'c291e1aa', scene:1, cluster:'guilt_shame', vec:{fear:0.2,love:0.1,guilt:0.4,shame:0.15,sadness:0.15} },                                        // guilt-dominant
  { mem:'7a700000', scene:4, cluster:'guilt_shame', vec:{fear:0.2,anger:0.25,guilt:0.4,shame:0.55,longing:0.35,sadness:0.45,numbness:0.4,isolation:0.4} }, // shame/guilt
  { mem:'c291e1aa', scene:0, cluster:'guilt_shame', vec:{shame:0.35,longing:0.2,sadness:0.15,confusion:0.05,isolation:0.25} },                          // shame-dominant
  { mem:'7a700000', scene:1, cluster:'guilt_shame', vec:{fear:0.5,anger:0.05,guilt:0.15,shame:0.45,longing:0.1,sadness:0.3,numbness:0.4,isolation:0.5} }, // fear+shame boundary
];

// Optional self-variant: same emotion vector, DIFFERENT memory id (so the
// hashWorldOffset differs). This reproduces the "fear vs self-variant" probe
// the prior workflow ran. We take fear single-peak and re-hash with each memory.
function selfVariantTest() {
  var baseFear = {fear:0.8,anger:0.05,guilt:0.05,shame:0.1,longing:0.05,sadness:0.2,numbness:0.25,isolation:0.5};
  var mems = ['7a700000','d9fd25f0','1dde3a8a','82d6a613','c4888189','c291e1aa','1f586f9b'];
  var fields = mems.map(function(mid){ return sceneHeightfield(baseFear, mid, 48, 60); });
  var diffs = [];
  for (var i=0;i<fields.length;i++) for (var j=i+1;j<fields.length;j++) {
    diffs.push(rmsDiff(fields[i].hts, fields[j].hts));
  }
  return diffs;
}

// ─── Build all heightfields ──
var fields = DATA.map(function (d) {
  var f = sceneHeightfield(d.vec, d.mem, 48, 60);
  f.label = d.mem + ':s' + d.scene;
  f.cluster = d.cluster;
  f.dom = f.domEmo;
  return f;
});

// ─── Pairwise RMS, split by same-cluster vs cross-cluster ──
var withinRms = [], crossRms = [];
var withinPairs = [], crossPairs = [];
for (var i = 0; i < fields.length; i++) {
  for (var j = i + 1; j < fields.length; j++) {
    var r = rmsDiff(fields[i].hts, fields[j].hts);
    var pairStr = fields[i].label + '(' + fields[i].dom + ')' +
                  ' vs ' + fields[j].label + '(' + fields[j].dom + ') = ' + r.toFixed(4);
    if (fields[i].cluster === fields[j].cluster) { withinRms.push(r); withinPairs.push(pairStr); }
    else { crossRms.push(r); crossPairs.push(pairStr); }
  }
}

function mean(arr) { return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; }
function median(arr) { var s = arr.slice().sort(function(a,b){return a-b;}); var m = Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }
function mn(arr){return Math.min.apply(null,arr);} function mx(arr){return Math.max.apply(null,arr);}

var withinMean = mean(withinRms), crossMean = mean(crossRms);

// worst "mush" pairs: cross-cluster pairs that are SMALLEST (most similar despite different cluster)
var crossSorted = crossPairs.map(function(p,idx){return {p:p,r:crossRms[idx]};}).sort(function(a,b){return a.r-b.r;});
// and within-cluster pairs that are LARGEST (most different despite same cluster)
var withinSorted = withinPairs.map(function(p,idx){return {p:p,r:withinRms[idx]};}).sort(function(a,b){return b.r-a.r;});

var selfDiffs = selfVariantTest();

// ─── Report ──
console.log('=== TERRAIN DISTINCTNESS PROBE (real DB original_emotion vectors) ===');
console.log('G=48 local heightfield per scene, exact Pass-1 bedrock math, cont=0/void=0/warp=0');
console.log('N scenes =', fields.length, '| within-cluster pairs =', withinRms.length, '| cross-cluster pairs =', crossRms.length);
console.log('');
console.log('--- per-scene domEmo + eMag ---');
fields.forEach(function (f) {
  console.log('  ' + f.label.padEnd(14) + ' cluster=' + f.cluster.padEnd(12) + ' dom=' + String(f.dom).padEnd(10) + ' eMag=' + f.eMag.toFixed(3) + ' VA=(' + f.scVad.v.toFixed(2) + ',' + f.scVad.a.toFixed(2) + ')');
});
console.log('');
console.log('--- WITHIN-cluster RMS ---  mean=' + withinMean.toFixed(4) + ' median=' + median(withinRms).toFixed(4) + ' min=' + mn(withinRms).toFixed(4) + ' max=' + mx(withinRms).toFixed(4));
console.log('--- CROSS-cluster  RMS ---  mean=' + crossMean.toFixed(4) + ' median=' + median(crossRms).toFixed(4) + ' min=' + mn(crossRms).toFixed(4) + ' max=' + mx(crossRms).toFixed(4));
console.log('');
console.log('ratio cross/within (mean) = ' + (crossMean / withinMean).toFixed(3));
console.log('SEPARATION CHECK: cross-mean > within-mean ? ' + (crossMean > withinMean));
console.log('OVERLAP: cross-min(' + mn(crossRms).toFixed(4) + ') vs within-max(' + mx(withinRms).toFixed(4) + ') -> ' +
            (mn(crossRms) > mx(withinRms) ? 'CLEAN (no overlap)' : 'OVERLAP (distributions mix)'));
console.log('');
console.log('--- 6 worst "mush" CROSS pairs (different cluster but most SIMILAR terrain) ---');
crossSorted.slice(0,6).forEach(function(o){ console.log('  ' + o.p); });
console.log('');
console.log('--- 6 worst WITHIN pairs (same cluster but most DIFFERENT terrain) ---');
withinSorted.slice(0,6).forEach(function(o){ console.log('  ' + o.p); });
console.log('');
console.log('--- SELF-VARIANT test (same fear vec, different memory hash) ---');
console.log('  pairwise RMS: [' + selfDiffs.map(function(x){return x.toFixed(4);}).join(', ') + ']');
console.log('  self-variant mean RMS = ' + mean(selfDiffs).toFixed(4));
console.log('');
console.log('=== JSON ===');
console.log(JSON.stringify({
  within_mean: withinMean, within_median: median(withinRms), within_min: mn(withinRms), within_max: mx(withinRms),
  cross_mean: crossMean, cross_median: median(crossRms), cross_min: mn(crossRms), cross_max: mx(crossRms),
  ratio_cross_over_within: crossMean / withinMean,
  cross_min_gt_within_max: mn(crossRms) > mx(withinRms),
  cross_mean_gt_within_mean: crossMean > withinMean,
  self_variant_mean: mean(selfDiffs),
}, null, 2));

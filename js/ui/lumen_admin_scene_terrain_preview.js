/**
 * Lumen Admin — 씬별 3D 자연 모양 미리보기
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260426.md §14 Phase 1.
 *
 * 한 씬의 original_emotion 만으로 단독 지형을 만들어 perspective + orbit 으로 보여준다.
 *
 * - canonical computeAfTerrainFields 는 씬 1개를 받아도 21개 anchor 위에 Gaussian 분산을 깔아서
 *   서로 다른 씬도 negative-valence 권역이면 거의 같은 모양이 나옴. 미리보기는 그게 아니라
 *   "이 씬만의 고유 모양"이 보여야 의미 있으니, 자체 single-scene field 함수를 가진다.
 * - 자체 field: 존재하는 감정마다 그 감정 anchor 위에 단일 Gaussian 봉우리를 직접 배치.
 *   봉우리 크기 ∝ intensity, 모양 = dominant emotion 의 EMO_NOISE, 색 = 감정 EC.
 * - canonical (tem_af_strata_terrain.js) 는 한 글자도 안 건드림.
 *
 * 사용:
 *   const api = LumenAdminSceneTerrainPreview.attach(containerEl, scene, {
 *     width: 480, height: 320,
 *   });
 *   api.refresh(updatedScene);
 *   api.dispose();
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    width: 480,
    height: 320,
    G: 64,                  // 격자 해상도 (admin 미리보기용 경량)
    SZ: 56,                 // 56유닛 정사각 박스
    threshold: 0.08,        // mask: maxH 의 8%
    minThreshold: 0.05,     // absolute lower bound
    colorBoost: 1.7,        // vertex color RGB 곱 (clamp to 1)
    compression: 0.5,       // peak 위치 = anchor.v × H2 × compression — 봉우리를 plane 안쪽에 모음
    showAxes: false,
  };

  // ── canonical 과 동기화된 정적 테이블 (tem_af_strata_terrain.js 의 EC / VAD_FULL / EMO_NOISE 와 일치) ──
  // canonical 안 건드리려고 사본 보유. canonical 쪽 값이 바뀌면 여기도 손으로 맞춰야 함.
  var VAD_LOCAL = {
    fear:{v:-0.9,a:0.9}, sadness:{v:-0.8,a:-0.4}, anger:{v:-0.7,a:0.8},
    guilt:{v:-0.8,a:0.2}, shame:{v:-0.9,a:-0.2}, isolation:{v:-0.7,a:-0.5},
    numbness:{v:-0.6,a:-0.8}, longing:{v:-0.3,a:0.2}, resentment:{v:-0.5,a:0.6},
    resignation:{v:-0.4,a:-0.6}, joy:{v:0.9,a:0.6}, hope:{v:0.7,a:0.4},
    relief:{v:0.6,a:-0.3}, gratitude:{v:0.8,a:-0.2}, love:{v:1.0,a:0.5},
    peace:{v:0.8,a:-0.6}, confusion:{v:-0.4,a:0.3},
  };
  var EC_LOCAL = {
    fear:[0.4,0.28,0.7], sadness:[0.25,0.38,0.65], anger:[0.8,0.25,0.22], guilt:[0.6,0.48,0.35],
    longing:[0.28,0.62,0.65], numbness:[0.32,0.32,0.38], shame:[0.58,0.35,0.48], isolation:[0.14,0.14,0.24],
    joy:[0.82,0.72,0.38], resentment:[0.6,0.2,0.15], resignation:[0.4,0.38,0.35], hope:[0.55,0.65,0.45],
    relief:[0.48,0.68,0.48], love:[0.7,0.4,0.5], gratitude:[0.65,0.58,0.4], peace:[0.45,0.58,0.52],
    confusion:[0.48,0.38,0.55],
  };
  var EMO_NOISE_LOCAL = {
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
  var EMO_NOISE_DEFAULT_LOCAL = { freq: 0.12, lac: 2.0, oct: 4, amp: 0.7 };

  function _hs(x, y) { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
  function _sN(x, y) {
    var ix = Math.floor(x); var iy = Math.floor(y); var fx = x - ix; var fy = y - iy;
    var sx = fx * fx * (3 - 2 * fx); var sy = fy * fy * (3 - 2 * fy);
    return _hs(ix, iy) * (1 - sx) * (1 - sy) + _hs(ix + 1, iy) * sx * (1 - sy) +
           _hs(ix, iy + 1) * (1 - sx) * sy + _hs(ix + 1, iy + 1) * sx * sy;
  }
  function _fbCustom(x, y, freq, lac, oct, amp) {
    var v = 0; var a = amp * 0.5; var f = freq;
    for (var i = 0; i < oct; i++) { v += a * _sN(x * f, y * f); a *= 0.5; f *= lac; }
    return v;
  }
  // canonical fb (oct 기본 4, lac 2.1) — fissure / erosion 노이즈에 쓰임
  function _fb(x, y, o) {
    var v = 0; var a = 0.5; var f = 1;
    for (var i = 0; i < (o || 4); i++) { v += a * _sN(x * f, y * f); a *= 0.5; f *= 2.1; }
    return v;
  }

  /**
   * 씬 단독 모양 필드. canonical 21-anchor 분산 우회 + 메모리 cont 변형 적용.
   *
   * cont 변형 매핑 (canonical Pass 1/2/3 의 single-scene 사본):
   *  - drift           → 도메인 워핑 (좌표 비틀기, driftDir 방향)
   *  - divergence      → 균열 (fissure) — 노이즈 임계 넘는 셀에서 height 차감
   *  - convergence     → 계단화 (terracing) — uniform step 양자화 (preview 는 play 데이터 없으니 plate 전체 적용)
   *  - heterogeneity   → 봉우리 표면 거칠기
   *  - dilution(0~100) → 1) erosion 워핑 (저 dilution → 외형 변형)
   *                    → 2) 색상 desaturation
   *  - stage3 (0~1)    → hypercompletion: 모든 봉우리가 가중평균 위치로 lerp 수렴 (stage3=1 → 단일 dome)
   *
   * @param {Object} emo {emotion: intensity} (0~1)
   * @param {Object|null} voidInfo {sceneVoid?, emotionVoid?, reasonVoid?}
   * @param {Object|null} cont {drift, divergence, convergence, heterogeneity, dilution(0~100), stage1, stage2, stage3, driftDirV, driftDirA}
   * @param {{G:number, SZ:number, compression?:number}} opt
   * @returns {{G,SZ,hts,cls,minH,maxH,domName,peaks}}
   */
  function _computeSingleSceneField(emo, voidInfo, cont, opt) {
    var G = opt.G, SZ = opt.SZ, H2 = SZ / 2;
    var compression = opt.compression != null ? opt.compression : 0.5;
    var hts = new Float32Array(G * G);
    var cls = new Float32Array(G * G * 3);

    cont = cont || {};
    var drift         = Math.max(0, Math.min(1, Number(cont.drift) || 0));
    var divergence    = Math.max(0, Math.min(1, Number(cont.divergence) || 0));
    var convergence   = Math.max(0, Math.min(1, Number(cont.convergence) || 0));
    var heterogeneity = Math.max(0, Math.min(1, Number(cont.heterogeneity) || 0));
    var dilutionRaw   = cont.dilution != null ? Number(cont.dilution) : 100;
    var dilNorm       = Math.max(0, Math.min(1, dilutionRaw / 100));
    var erosion       = 1 - dilNorm;
    var stage3        = Math.max(0, Math.min(1, Number(cont.stage3) || 0));
    var driftDirV     = Number(cont.driftDirV) || 0.5;
    var driftDirA     = Number(cont.driftDirA) || 0.5;
    var ddLen         = Math.sqrt(driftDirV * driftDirV + driftDirA * driftDirA) || 1;
    driftDirV /= ddLen; driftDirA /= ddLen;
    var warpStrength  = drift * 8;

    // intensity > 0.05 인 감정만 → 봉우리 한 개씩
    var peaks = [];
    var domName = ''; var domVal = -Infinity;
    for (var k in emo) {
      if (!Object.prototype.hasOwnProperty.call(emo, k)) continue;
      var iv = Number(emo[k]) || 0;
      if (iv < 0.05) continue;
      var vad = VAD_LOCAL[k];
      if (!vad) continue;
      peaks.push({
        name: k,
        intensity: iv,
        v: vad.v, a: vad.a,
        color: EC_LOCAL[k] || [0.5, 0.5, 0.5],
      });
      if (iv > domVal) { domVal = iv; domName = k; }
    }
    var np = EMO_NOISE_LOCAL[domName] || EMO_NOISE_DEFAULT_LOCAL;

    // 가중평균 VAD (void crater + stage3 collapse 둘 다 필요)
    var meanV = 0, meanA = 0, wSum = 0;
    for (var pi = 0; pi < peaks.length; pi++) {
      meanV += peaks[pi].v * peaks[pi].intensity;
      meanA += peaks[pi].a * peaks[pi].intensity;
      wSum += peaks[pi].intensity;
    }
    if (wSum > 0) { meanV /= wSum; meanA /= wSum; }

    // stage3 hypercompletion: 봉우리 위치를 가중평균으로 lerp (1 이면 모두 한 점에 수렴 = 단일 dome)
    for (var pp = 0; pp < peaks.length; pp++) {
      peaks[pp].posV = peaks[pp].v * (1 - stage3) + meanV * stage3;
      peaks[pp].posA = peaks[pp].a * (1 - stage3) + meanA * stage3;
    }

    var voidScore = 0;
    if (voidInfo) {
      if (voidInfo.sceneVoid) voidScore += 0.33;
      if (voidInfo.emotionVoid) voidScore += 0.33;
      if (voidInfo.reasonVoid) voidScore += 0.34;
    }

    // ─── Pass 1: 봉우리 + drift 워핑 + heterogeneity 거칠기 + dilution erosion + void crater ───
    for (var iz = 0; iz < G; iz++) {
      for (var ix = 0; ix < G; ix++) {
        var idx = iz * G + ix;
        var ci = idx * 3;
        var gx = (ix / (G - 1) - 0.5) * SZ;
        var gz = (iz / (G - 1) - 0.5) * SZ;

        // drift 도메인 워핑: 샘플 좌표 자체를 드리프트 방향으로 변위
        var wx = gx, wz = gz;
        if (warpStrength > 0.01) {
          var warpN = _fb(gx * 0.04, gz * 0.04, 3);
          wx = gx + warpN * warpStrength * driftDirV;
          wz = gz + warpN * warpStrength * driftDirA;
        }

        var totalH = 0;

        for (var p = 0; p < peaks.length; p++) {
          var pk = peaks[p];
          var px = pk.posV * H2 * compression;
          var pz = pk.posA * H2 * compression;
          var ddx = wx - px; var ddz = wz - pz;
          var dist = Math.sqrt(ddx * ddx + ddz * ddz);
          var radius = 4 + pk.intensity * 10;
          if (dist >= radius * 1.8) continue;
          var sig = radius * 0.55;
          var inf = Math.exp(-(dist * dist) / (2 * sig * sig));
          var emoNoise = _fbCustom(wx * np.freq * 0.7 + p * 5, wz * np.freq * 0.7 + p * 3,
                                    np.freq * 0.7, np.lac, np.oct, np.amp);
          var dh = pk.intensity * 30 * inf * (0.4 + emoNoise * 0.6);
          // heterogeneity: 봉우리 영향 범위 안에서만 표면 거칠기 추가
          if (heterogeneity > 0.05) {
            dh += heterogeneity * (_hs(wx * 0.25 + p, wz * 0.25) - 0.5) * 2.5 * inf;
          }
          totalH += dh;

          var cInf = inf * 0.6 * pk.intensity;
          cls[ci]     += pk.color[0] * cInf;
          cls[ci + 1] += pk.color[1] * cInf;
          cls[ci + 2] += pk.color[2] * cInf;
        }

        // dilution erosion: 저 dilution → 전반적 외형 비틀기 노이즈 추가
        if (erosion > 0.05) {
          var erN = _fb(wx * 0.06 + 100, wz * 0.06, 4);
          totalH += (erN - 0.4) * erosion * 6;
        }

        // void crater at intensity-weighted VAD mean
        if (voidScore > 0.3 && peaks.length > 0) {
          var vx = meanV * H2 * compression;
          var vz = meanA * H2 * compression;
          var vddx = wx - vx; var vddz = wz - vz;
          var vdist = Math.sqrt(vddx * vddx + vddz * vddz);
          var voidInf = Math.exp(-(vdist * vdist) / (2 * 49));
          totalH -= voidScore * 18 * voidInf;
        }

        hts[idx] = totalH;
      }
    }

    // ─── Pass 2: divergence 균열 + convergence 계단화 (canonical Pass 2 의 single-scene 사본) ───
    if (divergence > 0.05 || convergence > 0.05) {
      for (var iz2 = 0; iz2 < G; iz2++) {
        for (var ix2 = 0; ix2 < G; ix2++) {
          var idx2 = iz2 * G + ix2;
          var gx2 = (ix2 / (G - 1) - 0.5) * SZ;
          var gz2 = (iz2 / (G - 1) - 0.5) * SZ;

          if (divergence > 0.05) {
            var fissN = _fb(gx2 * 0.12, gz2 * 0.12, 4);
            var fissThresh = 1.0 - divergence * 0.5;
            if (fissN > fissThresh) {
              var fissDepth = (fissN - fissThresh) / (1 - fissThresh);
              hts[idx2] -= fissDepth * divergence * 15;
            }
          }
          // preview 는 play 데이터 없어 per-scene convergence 계산 불가 → plate 전체에 uniform terracing
          if (convergence > 0.05) {
            var steps = 3 + Math.round(convergence * 8);
            var h2 = hts[idx2];
            hts[idx2] = Math.round(h2 * steps / 10) * 10 / steps;
          }
        }
      }
    }

    // ─── Pass 3: dilution desaturation + clamp ───
    for (var ic = 0; ic < G * G; ic++) {
      var ci3 = ic * 3;
      if (dilNorm < 0.95) {
        var grey = (cls[ci3] + cls[ci3 + 1] + cls[ci3 + 2]) / 3;
        var desat = (1 - dilNorm) * 0.7;
        cls[ci3]     = cls[ci3]     * (1 - desat) + grey * desat;
        cls[ci3 + 1] = cls[ci3 + 1] * (1 - desat) + grey * desat;
        cls[ci3 + 2] = cls[ci3 + 2] * (1 - desat) + grey * desat;
      }
      cls[ci3]     = Math.min(1, Math.max(0, cls[ci3]));
      cls[ci3 + 1] = Math.min(1, Math.max(0, cls[ci3 + 1]));
      cls[ci3 + 2] = Math.min(1, Math.max(0, cls[ci3 + 2]));
    }

    var minH = Infinity; var maxH = -Infinity;
    for (var i = 0; i < G * G; i++) {
      if (hts[i] < minH) minH = hts[i];
      if (hts[i] > maxH) maxH = hts[i];
    }
    return { G: G, SZ: SZ, hts: hts, cls: cls, minH: minH, maxH: maxH, domName: domName, peaks: peaks };
  }

  function attach(container, scene, opts) {
    if (!container) { console.warn('[scene-terrain-preview] container required'); return null; }
    if (!global.THREE) { console.warn('[scene-terrain-preview] THREE 미로드'); return null; }
    if (!global.THREE.OrbitControls) { console.warn('[scene-terrain-preview] OrbitControls 미로드'); return null; }

    opts = Object.assign({}, DEFAULTS, opts || {});

    // ── DOM scaffold ──
    container.innerHTML = '';
    container.style.position = 'relative';
    var canvas = document.createElement('canvas');
    // 사각형 박스 안 보이게: 배경/보더 제거, 투명 canvas (renderer alpha:true + clearAlpha 0).
    canvas.style.cssText = 'display:block;width:' + opts.width + 'px;height:' + opts.height + 'px;background:transparent;';
    container.appendChild(canvas);

    var statusLabel = document.createElement('div');
    statusLabel.style.cssText = 'font-size:0.7rem;color:rgba(196,168,130,0.55);margin-top:4px;letter-spacing:0.05em;';
    statusLabel.textContent = '— 준비 중 —';
    container.appendChild(statusLabel);

    // ── three.js setup ──
    var THREE = global.THREE;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(opts.width, opts.height, false);
    renderer.setClearColor(0x000000, 0); // 투명 — 메시 외 영역은 페이지 배경 비침

    var scene3 = new THREE.Scene();
    // scene3.background 안 설정: 그래야 알파 통과해서 canvas 가 투명하게 합성됨

    var camera = new THREE.PerspectiveCamera(45, opts.width / opts.height, 0.1, 400);
    camera.position.set(opts.SZ * 0.7, opts.SZ * 0.55, opts.SZ * 0.9);

    var controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 12;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0, 0);

    scene3.add(new THREE.AmbientLight(0xffffff, 1.4));
    var hemi = new THREE.HemisphereLight(0xffffff, 0x303038, 0.8);
    scene3.add(hemi);
    var dir = new THREE.DirectionalLight(0xfff0d8, 1.0);
    dir.position.set(40, 60, 30);
    scene3.add(dir);
    var dir2 = new THREE.DirectionalLight(0x6080c0, 0.45);
    dir2.position.set(-30, 40, -20);
    scene3.add(dir2);

    // 옅은 보조 axes (옵션)
    if (opts.showAxes) {
      var ax = new THREE.AxesHelper(opts.SZ * 0.4);
      scene3.add(ax);
    }

    var mesh = null;

    // ── core: build mesh from one scene ──
    function _buildMeshForScene(sc) {
      _disposeMesh();
      if (!sc) {
        statusLabel.textContent = '— 씬 없음 —';
        return;
      }

      // scene.original_emotion / originalEmotion 둘 다 지원 (admin currentScenes 는 camelCase)
      var emoSrc = sc.original_emotion || sc.originalEmotion || null;
      if (emoSrc && typeof emoSrc === 'object' && Object.keys(emoSrc).length === 0) emoSrc = null;
      if (!emoSrc) {
        statusLabel.textContent = '— originalEmotion 비어있음 —';
        return;
      }

      var voidInfo = sc.void_info || sc.voidInfo || null;
      if (typeof voidInfo === 'string') {
        try { voidInfo = JSON.parse(voidInfo); } catch (_) { voidInfo = null; }
      }

      // cont 는 attach/refresh 시점에 옵션으로 흘러옴 — admin 메모리 cont 슬라이더 값
      var contNow = (opts.getCont && typeof opts.getCont === 'function')
        ? (opts.getCont() || {})
        : (opts.cont || {});

      var field = _computeSingleSceneField(emoSrc, voidInfo, contNow, {
        G: opts.G, SZ: opts.SZ, compression: opts.compression,
      });
      if (!field || !field.hts) {
        statusLabel.textContent = '— 필드 비어있음 —';
        return;
      }
      var domLabel = field.domName;
      var emoSummary = Object.keys(emoSrc)
        .map(function (k) { return k + ':' + emoSrc[k]; }).join(',');
      var contSummary = 'drift=' + (Number(contNow.drift) || 0).toFixed(2) +
        ' div=' + (Number(contNow.divergence) || 0).toFixed(2) +
        ' conv=' + (Number(contNow.convergence) || 0).toFixed(2) +
        ' het=' + (Number(contNow.heterogeneity) || 0).toFixed(2) +
        ' dil=' + (contNow.dilution != null ? Number(contNow.dilution).toFixed(0) : '100') +
        ' s3=' + (Number(contNow.stage3) || 0).toFixed(2);
      console.log('[scene-terrain-preview] build sceneId=' + (sc.id || '∅') +
        ' emo=' + emoSummary + ' peaks=' + field.peaks.length +
        ' maxH=' + field.maxH.toFixed(3) + ' dom=' + domLabel +
        ' · ' + contSummary);

      // ── geometry: PlaneGeometry(SZ, SZ, G-1, G-1) ──
      var G = opts.G, SZ = opts.SZ;
      var geo = new THREE.PlaneGeometry(SZ, SZ, G - 1, G - 1);
      geo.rotateX(-Math.PI / 2); // y-up

      var pos = geo.attributes.position.array;
      var colors = new Float32Array(pos.length);
      var hts = field.hts;
      var cls = field.cls;
      var maxH = field.maxH != null ? field.maxH : 0;
      // mask 임계: maxH 비례 + absolute lower bound (씬 한 개라 maxH 가 작을 수 있음)
      var hThresh = Math.max(opts.minThreshold, Math.max(0, maxH) * opts.threshold);
      var boost = opts.colorBoost;

      // height + color 적용 (color boost + clamp).
      // peaks 가 이미 compression 으로 plane 안쪽에 모이고 Gaussian 으로 자연 falloff 라 vignette 불필요.
      for (var i = 0; i < G * G; i++) {
        pos[i * 3 + 1] = hts[i] * 0.8; // 수직 강조
        var cr = cls[i * 3] * boost;
        var cg = cls[i * 3 + 1] * boost;
        var cb = cls[i * 3 + 2] * boost;
        colors[i * 3]     = cr > 1 ? 1 : cr;
        colors[i * 3 + 1] = cg > 1 ? 1 : cg;
        colors[i * 3 + 2] = cb > 1 ? 1 : cb;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.attributes.position.needsUpdate = true;

      // ── auto-mask: 임계 미만 face 제거 (자연 윤곽 / 사각형 깎기) ──
      // 세 vertex 모두 임계 이상이어야 face 유지 (강한 mask) — 사각형 박스 사라짐
      if (geo.index) {
        var oldIdx = geo.index.array;
        var newIdx = [];
        var keptFaces = 0, totalFaces = oldIdx.length / 3;
        for (var f = 0; f < oldIdx.length; f += 3) {
          var a = oldIdx[f], b = oldIdx[f + 1], c = oldIdx[f + 2];
          var ha = hts[a], hb = hts[b], hc = hts[c];
          if (ha > hThresh && hb > hThresh && hc > hThresh) {
            newIdx.push(a, b, c);
            keptFaces++;
          }
        }
        if (newIdx.length) {
          geo.setIndex(newIdx);
        }
        statusLabel.textContent = 'dom ' + (domLabel || '∅') +
          ' · peaks ' + field.peaks.length +
          ' · face ' + keptFaces + '/' + totalFaces +
          ' · maxH ' + maxH.toFixed(2) +
          ' · 임계 ' + hThresh.toFixed(2);
      } else {
        statusLabel.textContent = 'maxH ' + maxH.toFixed(2);
      }

      geo.computeVertexNormals();

      var mat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      });
      mesh = new THREE.Mesh(geo, mat);
      scene3.add(mesh);
    }

    function _disposeMesh() {
      if (!mesh) return;
      scene3.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      mesh = null;
    }

    // ── render loop ──
    var rafId = null;
    var stopped = false;
    function _tick() {
      if (stopped) return;
      controls.update();
      renderer.render(scene3, camera);
      rafId = requestAnimationFrame(_tick);
    }

    // ── resize ──
    function resize(w, h) {
      var W = w || opts.width, H = h || opts.height;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
    }

    // initial build + start
    _buildMeshForScene(scene);
    _tick();

    // ── public API ──
    var api = {
      refresh: function (newScene) { _buildMeshForScene(newScene); },
      resize: resize,
      dispose: function () {
        stopped = true;
        if (rafId) cancelAnimationFrame(rafId);
        _disposeMesh();
        controls.dispose();
        renderer.dispose();
        if (container.contains(canvas)) container.removeChild(canvas);
        if (container.contains(statusLabel)) container.removeChild(statusLabel);
      },
      _debug: function () {
        return {
          hasMesh: !!mesh,
          camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          opts: Object.assign({}, opts),
        };
      },
    };
    return api;
  }

  global.LumenAdminSceneTerrainPreview = { attach: attach };
})(typeof window !== 'undefined' ? window : this);

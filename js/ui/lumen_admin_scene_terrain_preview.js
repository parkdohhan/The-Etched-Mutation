/**
 * Lumen Admin — 씬별 3D 자연 모양 미리보기
 *
 * SCOPE: docs/LUMEN_DEMO_SCOPE-260426.md §14 Phase 1 (자동 quilt mask) 즉시 prototype.
 *
 * 한 씬의 감정 벡터만으로 strata terrain 을 만들어 perspective + orbit 으로 보여준다.
 * 사각형 캔버스를 자동 mask 로 벗겨 자연 blob 모양만 남긴다.
 *
 * - 단위: 메모리 전체가 아니라 씬 1개 (그 씬의 original_emotion + originalReasonVector)
 * - mask: hts < maxH × threshold 인 vertex 가 모두 포함된 face 는 indices 에서 제거 → 자연 윤곽
 * - 카메라: PerspectiveCamera + OrbitControls (1인칭 X)
 * - 수정 금지 함수 원칙 준수: tem_af_strata_terrain.js 한 글자도 안 건드림. buildMemoryItems / computeAfTerrainFields 만 호출.
 *
 * 사용:
 *   const api = LumenAdminSceneTerrainPreview.attach(containerEl, scene, {
 *     width: 480, height: 320, threshold: 0.05
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
    SZ: 56,                 // 한 씬은 작게: 56유닛 정사각 박스 (메모리 전체 112의 절반)
    threshold: 0.08,        // mask: maxH 의 8% — 사각형 윤곽 충분히 깎임
    minThreshold: 0.05,     // absolute lower bound — maxH 가 작아도 0.05 미만은 mask
    colorBoost: 1.7,        // vertex color RGB 곱 (clamp to 1) — 어두움 보정
    bgColor: 0x18181f,      // 더 밝은 배경 (모양 인지)
    showAxes: false,
  };

  function attach(container, scene, opts) {
    if (!container) { console.warn('[scene-terrain-preview] container required'); return null; }
    if (!global.THREE) { console.warn('[scene-terrain-preview] THREE 미로드'); return null; }
    if (!global.TemAfStrataTerrain) { console.warn('[scene-terrain-preview] TemAfStrataTerrain 미로드'); return null; }
    if (!global.THREE.OrbitControls) { console.warn('[scene-terrain-preview] OrbitControls 미로드'); return null; }

    opts = Object.assign({}, DEFAULTS, opts || {});

    // ── DOM scaffold ──
    container.innerHTML = '';
    container.style.position = 'relative';
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:' + opts.width + 'px;height:' + opts.height + 'px;background:#18181f;border-radius:4px;border:1px solid rgba(196,168,130,.2);';
    container.appendChild(canvas);

    var statusLabel = document.createElement('div');
    statusLabel.style.cssText = 'font-size:0.7rem;color:rgba(196,168,130,0.55);margin-top:4px;letter-spacing:0.05em;';
    statusLabel.textContent = '— 준비 중 —';
    container.appendChild(statusLabel);

    // ── three.js setup ──
    var THREE = global.THREE;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(opts.width, opts.height, false);
    renderer.setClearColor(opts.bgColor, 1);

    var scene3 = new THREE.Scene();
    scene3.background = new THREE.Color(opts.bgColor);

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

      // 한 씬짜리 가짜 메모리 → buildMemoryItems → computeAfTerrainFields
      var fakeMem = {
        id: 'preview',
        title: sc.text || '',
        memory_words: '',
        completed_sentence: '',
        cont_drift: 0, cont_divergence: 0, cont_convergence: 0, cont_heterogeneity: 0,
        cont_dilution: 100,
        cont_stage_1: 1, cont_stage_2: 0, cont_stage_3: 0,
      };
      // scene.original_emotion / originalEmotion 둘 다 지원 (admin currentScenes 는 camelCase)
      var emoSrc = sc.original_emotion || sc.originalEmotion || null;
      if (emoSrc && typeof emoSrc === 'object' && Object.keys(emoSrc).length === 0) emoSrc = null;
      if (!emoSrc) {
        statusLabel.textContent = '— originalEmotion 비어있음 —';
        return;
      }

      var fakeScenes = [{
        id: sc.id || 'preview-scene',
        scene_order: 0,
        original_emotion: emoSrc,
        original_reason_vector: sc.original_reason_vector || sc.originalReasonVector || null,
        meta: sc.meta || null,
      }];

      var T = global.TemAfStrataTerrain;
      var P;
      try {
        P = T.buildMemoryItems([fakeMem], { preview: [] }, { preview: fakeScenes });
      } catch (e) {
        statusLabel.textContent = '— buildMemoryItems 실패: ' + e.message + ' —';
        return;
      }
      if (!P || !P.length) {
        statusLabel.textContent = '— 빌드 실패 —';
        return;
      }

      var field;
      try {
        field = T.computeAfTerrainFields(P, 0, { G: opts.G, SZ: opts.SZ });
      } catch (e) {
        statusLabel.textContent = '— computeAfTerrainFields 실패: ' + e.message + ' —';
        return;
      }
      if (!field || !field.hts) {
        statusLabel.textContent = '— 필드 비어있음 —';
        return;
      }

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

      // height + color 적용 (color boost + clamp)
      for (var i = 0; i < G * G; i++) {
        pos[i * 3 + 1] = hts[i] * 0.6; // 강조 위해 수직 스케일
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
        statusLabel.textContent = 'face ' + keptFaces + '/' + totalFaces +
          ' · maxH ' + maxH.toFixed(2) +
          ' · 임계 ' + hThresh.toFixed(2) +
          ' · boost ×' + boost.toFixed(1);
      } else {
        statusLabel.textContent = 'maxH ' + maxH.toFixed(2);
      }

      geo.computeVertexNormals();

      var mat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        flatShading: false,
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

/**
 * Lumen Scene Mannequins
 *
 * 장면핀(_fpScenePins) 위치마다 ybot(Mixamo) 마네킨을 한 체 배치.
 * test/ghost-mannequin-test.html 의 검증 결과를 옮겨온 것 — 머티리얼/로더 동일.
 *
 * 수정 금지 함수 원칙 준수: tem_af_strata_terrain.js 한 글자도 안 건드림.
 * 외부 파이프라인:
 *   - 의존: THREE r128 + FBXLoader + SkeletonUtils + (fflate)
 *   - 어댑터: runtime.__lumenAdapter 의 'enter'/'exit' 구독
 *   - render wrap: 가장 바깥 (mixer.update 만 함, 카메라 안 건드림)
 *
 * 사용:
 *   LumenSceneMannequins.attach(rt, {
 *     getScenePins: function () { return _fpScenePins; }
 *   });
 *   // 핀 빌드 직후 명시적 rebuild 권장:
 *   rt.__lumenSceneMannequins.rebuild();
 */
(function (global) {
  'use strict';

  // 2026-04-26: ghost-mannequin-test 화면 잠금값. 변경 시 디자인 미팅 필수.
  var DEFAULTS = {
    getScenePins: null,                       // () => Array<{wx, wz, accessible, visited, ...}>
    fbxBaseUrl: '/test/ybot.fbx',
    // 2026-04-26: Standing Up 클립 제거(징그러움). ybot 내장 Take 001(차분한 standing) 만 사용.
    fbxClipUrls: [],
    // 비-accessible 핀까지 마네킨 세우면 1.8m 사람이 너무 많음 — 원래 가시 핀만.
    accessibleOnly: true,
    // 머티리얼
    opacity: 0.7,
    grey: 128,
    mode: 'xray',                             // 'xray' | 'silhouette'
    rimGlow: false,
    rimColor: '#c4a882',
    rimStrength: 1.4,                         // 0..3
    rimSharpness: 2.8,                        // 1..8
    // 애니메이션
    speed: 1.0,
    desyncTime: true,
    preferLastClip: false,                    // true 면 fbxClipUrls extras 의 마지막 클립 우선
    // 배치
    yOffset: 0,                               // 발이 지면에 닿도록 0
    faceCenter: true,                         // 중심(0,0) 바라봄
    autoRescale: true,                        // FBX(cm) → m 자동
    // 핀 가시성 — 마네킨이 자리 잡았으니 octahedron + 수직선 숨김
    // (visible=false 면 raycast 도 차단 — Lumen 은 ghost_condensation_points 로 길잡이 → 무방)
    hidePinVisuals: true
  };

  function attach(runtime, opts) {
    if (!runtime) { console.error('[lumen-scene-mannequins] runtime required'); return null; }
    if (runtime.__lumenSceneMannequins) return runtime.__lumenSceneMannequins;
    opts = Object.assign({}, DEFAULTS, opts || {});

    var THREE = global.THREE;
    var scene = runtime.getScene && runtime.getScene();
    var renderer = runtime.getRenderer && runtime.getRenderer();
    if (!THREE || !scene || !renderer || typeof renderer.render !== 'function') {
      console.warn('[lumen-scene-mannequins] THREE/scene/renderer 없음 — 비활성');
      return null;
    }
    if (!THREE.FBXLoader || !THREE.SkeletonUtils) {
      console.warn('[lumen-scene-mannequins] FBXLoader / SkeletonUtils 누락. play-test.html 의 CDN include 확인');
      return null;
    }

    var _ghosts = [];                          // [{ root, mixer, pinIndex }]
    var _source = null;                        // { scene, animations }
    var _loading = null;                       // Promise<void>
    var _clock = new THREE.Clock();
    var _attached = false;

    function _hexToColor(hex) {
      var h = (hex || '#ffffff').replace('#', '');
      return new THREE.Color(parseInt(h, 16));
    }

    // Fresnel rim — ghost-mannequin-test 의 injectRimGlow 동일 이식
    function _injectRim(mat) {
      if (!opts.rimGlow) return;
      var rimColor = _hexToColor(opts.rimColor);
      var rimPower = +opts.rimSharpness;
      var rimIntensity = +opts.rimStrength;
      mat.onBeforeCompile = function (shader) {
        shader.uniforms.uRimColor = { value: rimColor };
        shader.uniforms.uRimPower = { value: rimPower };
        shader.uniforms.uRimIntensity = { value: rimIntensity };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>',
            '#include <common>\nvarying vec3 vRimNormal;\nvarying vec3 vRimViewDir;')
          .replace('#include <project_vertex>',
            '#include <project_vertex>\n' +
            'vec4 wPos = modelMatrix * vec4(transformed, 1.0);\n' +
            'vRimNormal = normalize(mat3(modelMatrix) * objectNormal);\n' +
            'vRimViewDir = normalize(cameraPosition - wPos.xyz);');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>',
            '#include <common>\nvarying vec3 vRimNormal;\nvarying vec3 vRimViewDir;\n' +
            'uniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimIntensity;')
          .replace('#include <dithering_fragment>',
            'float rim = 1.0 - max(dot(normalize(vRimNormal), normalize(vRimViewDir)), 0.0);\n' +
            'rim = pow(rim, uRimPower) * uRimIntensity;\n' +
            'gl_FragColor.rgb += uRimColor * rim;\n' +
            'gl_FragColor.a = clamp(gl_FragColor.a + rim * 0.6, 0.0, 1.0);\n' +
            '#include <dithering_fragment>');
      };
      mat.needsUpdate = true;
    }

    function _makeMat(isSkinned) {
      var g = opts.grey | 0;
      var mat = new THREE.MeshLambertMaterial({
        color: (g << 16) | (g << 8) | g,
        transparent: true,
        opacity: opts.opacity,
        fog: true,
        side: opts.mode === 'xray' ? THREE.DoubleSide : THREE.FrontSide,
        depthWrite: opts.mode === 'silhouette',
        blending: opts.mode === 'xray' ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      if (isSkinned) { mat.skinning = true; mat.morphTargets = true; }
      _injectRim(mat);
      return mat;
    }

    function _stripDetails(root) {
      root.traverse(function (o) {
        if (o.isSkinnedMesh) {
          o.material = _makeMat(true);
          o.frustumCulled = false;
          o.castShadow = false;
          o.receiveShadow = false;
        } else if (o.isMesh) {
          o.material = _makeMat(false);
          o.frustumCulled = false;
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
    }

    function _loadFbx(url) {
      return new Promise(function (resolve, reject) {
        var loader = new THREE.FBXLoader();
        loader.load(url, function (obj) {
          resolve({ scene: obj, animations: obj.animations || [] });
        }, null, reject);
      });
    }

    function _loadSource() {
      if (_source) return Promise.resolve(_source);
      if (_loading) return _loading;
      _loading = _loadFbx(opts.fbxBaseUrl).then(function (base) {
        if (!opts.fbxClipUrls || !opts.fbxClipUrls.length) return base;
        return Promise.all(opts.fbxClipUrls.map(_loadFbx)).then(function (extras) {
          extras.forEach(function (e, i) {
            if (e.animations && e.animations[0]) {
              var clip = e.animations[0];
              clip.name = 'extra_' + i;
              base.animations.push(clip);
            }
          });
          return base;
        });
      }).then(function (base) {
        if (opts.autoRescale) {
          var bbox = new THREE.Box3().setFromObject(base.scene);
          var sz = bbox.getSize(new THREE.Vector3());
          if (sz.y > 10) {
            var s = 1.8 / sz.y;
            base.scene.scale.setScalar(s);
          }
        }
        _source = base;
        console.log('[lumen-scene-mannequins] FBX loaded; clips:',
          base.animations.map(function (c) { return c.name || '(unnamed)'; }));
        return base;
      }).catch(function (err) {
        console.error('[lumen-scene-mannequins] FBX load failed', err);
        _loading = null;
        throw err;
      });
      return _loading;
    }

    function _spawnAt(pin, idx) {
      if (!_source) return null;
      var root = THREE.SkeletonUtils.clone(_source.scene);
      _stripDetails(root);

      var groundY = (typeof runtime.gH === 'function') ? runtime.gH(pin.wx, pin.wz) : 0;
      root.position.set(pin.wx, groundY + opts.yOffset, pin.wz);
      if (opts.faceCenter) {
        root.rotation.y = Math.atan2(-pin.wx, -pin.wz);
      }
      scene.add(root);

      var mixer = new THREE.AnimationMixer(root);
      var anims = _source.animations || [];
      if (anims.length) {
        // ybot.fbx 에 임베드된 첫 클립("mixamo.com" = idle 모션) 사용.
        // extras 를 의도적으로 우선시키려면 opts.preferLastClip 켜기.
        var clip = opts.preferLastClip ? anims[anims.length - 1] : anims[0];
        var a = mixer.clipAction(clip);
        if (opts.desyncTime) {
          a.time = Math.random() * (clip.duration || 1);
          a.setEffectiveTimeScale(0.85 + Math.random() * 0.3);
        }
        a.play();
      }
      return { root: root, mixer: mixer, pinIndex: idx };
    }

    function _hidePinVisuals(pins) {
      // 1) 핀 mesh 직접 가림 (옥타헤드론)
      pins.forEach(function (p) { if (p.mesh) p.mesh.visible = false; });
      // 2) 같은 _fpPin 태그를 단 수직선(THREE.Line) 들도 가림
      scene.traverse(function (o) {
        if (o.userData && o.userData._fpPin && o.isLine) o.visible = false;
      });
    }

    function _restorePinVisuals(pins) {
      pins.forEach(function (p) { if (p.mesh) p.mesh.visible = true; });
      scene.traverse(function (o) {
        if (o.userData && o.userData._fpPin && o.isLine) o.visible = true;
      });
    }

    function _clear() {
      _ghosts.forEach(function (g) {
        if (g.root && g.root.parent) g.root.parent.remove(g.root);
      });
      _ghosts.length = 0;
      // 핀은 다음 세션이 _buildPlayScenePins 로 재생성하므로 굳이 복원 안 함.
      // setOptions({hidePinVisuals:false}) 하면 명시적 복원 흐름 필요.
    }

    function _rebuild() {
      _clear();
      if (!_source || typeof opts.getScenePins !== 'function') return;
      var pins = opts.getScenePins() || [];
      pins.forEach(function (p, i) {
        if (opts.accessibleOnly && !p.accessible) return;
        var g = _spawnAt(p, i);
        if (g) _ghosts.push(g);
      });
      if (opts.hidePinVisuals) _hidePinVisuals(pins);
      console.log('[lumen-scene-mannequins] spawned:', _ghosts.length, '/', pins.length,
        opts.hidePinVisuals ? '(pins hidden)' : '(pins visible)');
    }

    // renderer.render wrap — 가장 바깥. mixer 만 update.
    var _origRender = renderer.render.bind(renderer);
    renderer.render = function (s, c) {
      var dt = _clock.getDelta();
      for (var i = 0; i < _ghosts.length; i++) {
        if (_ghosts[i].mixer) _ghosts[i].mixer.update(dt * opts.speed);
      }
      _origRender(s, c);
    };

    var adapter = runtime.__lumenAdapter;
    if (adapter && typeof adapter.on === 'function') {
      adapter.on('enter', function () {
        _attached = true;
        _loadSource().then(function () {
          // _buildPlayScenePins 가 enter 직후 sync 로 돌므로 다음 tick 에 rebuild
          setTimeout(_rebuild, 50);
        });
      });
      adapter.on('exit', function () {
        _attached = false;
        _clear();
      });
      // attach 시점이 이미 enter 이후일 수 있음 — 즉시 시도
      _loadSource().then(function () { setTimeout(_rebuild, 50); });
    } else {
      _loadSource().then(function () { setTimeout(_rebuild, 50); });
    }

    var api = {
      rebuild: function () {
        // 핀 가림은 FBX 로드와 무관하게 즉시 — 36MB 로드 대기 동안 어두운 옥타헤드론 잠깐 보이는 것 방지
        if (opts.hidePinVisuals && typeof opts.getScenePins === 'function') {
          try { _hidePinVisuals(opts.getScenePins() || []); } catch (_) {}
        }
        return _loadSource().then(_rebuild);
      },
      hidePinsNow: function () {
        if (typeof opts.getScenePins === 'function') {
          _hidePinVisuals(opts.getScenePins() || []);
        }
      },
      clear: _clear,
      setOptions: function (o) {
        var prevHide = opts.hidePinVisuals;
        Object.assign(opts, o || {});
        _ghosts.forEach(function (g) { _stripDetails(g.root); });
        if (o && Object.prototype.hasOwnProperty.call(o, 'hidePinVisuals') && opts.hidePinVisuals !== prevHide) {
          var pins = (typeof opts.getScenePins === 'function') ? (opts.getScenePins() || []) : [];
          if (opts.hidePinVisuals) _hidePinVisuals(pins); else _restorePinVisuals(pins);
        }
      },
      getDebug: function () {
        return {
          loaded: !!_source,
          attached: _attached,
          clips: _source ? _source.animations.map(function (c) { return c.name; }) : [],
          mannequins: _ghosts.length,
          opts: Object.assign({}, opts, { getScenePins: '<fn>' })
        };
      }
    };
    runtime.__lumenSceneMannequins = api;
    return api;
  }

  global.LumenSceneMannequins = { attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);

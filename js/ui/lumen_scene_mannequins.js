/**
 * Lumen Scene Mannequins
 *
 * 장면핀(_fpScenePins) 위치마다 ybot(Mixamo) 마네킨을 한 체 배치.
 * test/ghost-mannequin-test.html 의 검증 결과를 옮겨온 것 — 머티리얼/로더 동일.
 *
 * 수정 금지 함수 원칙 준수: tem_af_strata_terrain.js 한 글자도 안 건드림.
 * 외부 파이프라인:
 *   - 의존: THREE r128 + FBXLoader(fbx 쓸 때) + GLTFLoader(glb 쓸 때) + SkeletonUtils + (fflate)
 *   - 260730: fbxBaseUrl 이 .glb 면 GLTFLoader 로 읽음 (Tripo 생성 유령 몸 —
 *     tools/tripo_generate.cjs --rig 산출물. spec=mixamo 라 본 이름·headBone 탐색 호환)
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
    // 2026-05-03: Sitting Idle / Standing Idle 추가 (mixamo). poseRandomize 로 핀별 결정적 픽 → 자세 다양화.
    // 2026-05-09: Sitting Idle / Standing Idle 파일 미박힘 — Promise.all reject 자리 발동
    //   → 전체 마네킹 빌드 실패. 작가 손으로 mixamo 다운로드 박을 때까지 임시 fix:
    //   extras 비우고 ybot 내장 Take 001 (차분한 standing) 단독 사용.
    fbxClipUrls: [],
    // 2026-05-15: 자세 다양화 끔 — extras 미박힘 상태에서 RNG 분기가 첫 클립을 못 잡거나
    //   풀 length=1 분기로 빠질 때 자세가 깨진 채로 보였음. base FBX 첫 클립(Take 001 standing)
    //   하나로 통일. extras 복구 시 true 로 되돌릴 것.
    poseRandomize: false,
    // 2026-05-09: extras 비웠으므로 base 클립을 풀에 포함해야 자세 0개 회피.
    //   mixamo extras 박힘 자리 복구 시 true 로 되돌림.
    excludeBaseClips: false,
    // 2026-05-03: sitting 클립일 때만 머리 본 위쪽 회전 — "앉아서 고개 들고 보는" 자세.
    //   mixer.update 직후 head bone quaternion 에 multiply 로 덮어 클립 자세 + 고개 든 모양.
    //   부호: +값 = 위 보기(고개 들기). 반대로 보이면 음수.
    headTiltSittingDeg: 18,
    headTiltStandingDeg: 0,
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
    hidePinVisuals: true,
    // 2026-04-30: 인식·혼잣말·응시 (ghost awareness)
    awareness: true,                          // false 면 monologue/gaze 비활성
    // 260709: 마네킹 옆 혼잣말 스프라이트 별도 게이트. 기본 끔 —
    //   ghost_presets.monologue_templates 가 하드코딩이라 기억과 무관하게 떠서 (사용자 결정).
    //   gaze(응시)는 awareness 로 살아있음.
    monologue: false,
    // 거리: "옆에서 혼잣말 들릴 만큼" — 2.5m 안에서 또렷, 4.5m 넘으면 사라짐
    monologueNear: 2.5,
    monologueFar: 4.5,
    monologueBaseOpacity: 0,                  // 기본 안 보임
    monologueNearOpacity: 0.85,
    // 머리 옆 (위가 아니라). headY = 머리 높이, sideOffset = 카메라 right 방향 거리
    monologueHeadY: 1.65,                     // 마네킨 머리 ~1.7m → 살짝 아래
    monologueSideOffset: 0.55,                // 카메라 시점 right 방향(어깨 옆)
    monologueFontPx: 24,
    monologueColorCss: 'rgba(232,216,252,0.92)', // ghost violet
    monologueBobAmp: 0.06,
    monologueBobFreq: 0.28,
    // GHOST_PRESETS[ghostType].monologue_templates 에서 결정적 픽.
    // pin.id+memoryId 시드 → 같은 유령은 같은 줄.
    ghostTypeForPin: function (pin) { return 'core'; },
    getPresets: function () {
      return (typeof window !== 'undefined' && window.GHOST_PRESETS) || null;
    },
    getMemoryId: function () {
      try { return (window._temGame && window._temGame.memoryId) || ''; } catch (_) { return ''; }
    },
    // 클릭 응시
    gazeFollowSpeed: 0.045,                   // 매 프레임 LERP 비율 (1.5초 ≈ 0.045)
    gazeMaxRayDist: 18,                       // 클릭 raycast 최대 거리 (m)
    // 2026-06-14: 자세 기욺 (S1·T4) — 그 핀 장면이 within-run 으로 물들면(getGhostDrift)
    //   마네킨이 옆으로 살짝 기운다. 강도(strength=1−alignment) 클수록 더 기욺. 안 물들면 0.
    //   회전축 = root.rotation.z (옆 기울임). 응시 LERP 가 쓰는 root.rotation.y(헤딩) 과 독립.
    //   값 0.18rad ≈ 10° = lumen_return_mode 의 spriteRotation 차용(약속된 톤).
    driftLean: true,                          // false 면 자세 기욺 비활성
    driftLeanFactor: 0.18,                    // rad. 최종 lean = strength × 이 값
    driftLeanLerp: 0.08,                      // 매 프레임 기욺 LERP (갑자기 안 꺾이게). 0=즉시
    // 그 핀이 물들었는지 묻는 콜백. W(play-test.html)가 runtime.__quiltDemo.getGhostDrift 를 넘김.
    //   기대 반환: { strength, input, firedAt } | null  (T0 계약). 없으면 기욺 항상 0.
    getGhostDrift: null,                      // (pin) => { strength } | null
    // 260731 회상 연출 — 스폰 게이트. () => false 면 rebuild 가 유령을 세우지 않는다
    //   (핀 가림은 그대로). 관객이 대표 앵커를 보고 "기억나?"에 답하면 play-test 가
    //   rebuild() 를 다시 불러 유령이 그때 나타난다. 미설정 = 항상 열림(기존 동작).
    spawnGate: null
  };

  // ─── 결정적 PRNG: FNV-1a + mulberry32 (lumen_return_speech 와 동일) ───
  function _hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }
  function _mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // -π~π 안전한 각도 LERP
  function _lerpAngle(cur, tgt, t) {
    var d = tgt - cur;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return cur + d * t;
  }

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
    // 260730: 필요한 로더만 검사 — glb 경로면 GLTFLoader, fbx 경로면 FBXLoader.
    var _isGlbUrl = function (url) { return /\.(glb|gltf)(\?|#|$)/i.test(url || ''); };
    var _needGlb = _isGlbUrl(opts.fbxBaseUrl);
    if (!THREE.SkeletonUtils || (_needGlb ? !THREE.GLTFLoader : !THREE.FBXLoader)) {
      console.warn('[lumen-scene-mannequins] ' + (_needGlb ? 'GLTFLoader' : 'FBXLoader') + ' / SkeletonUtils 누락. play-test.html 의 CDN include 확인');
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

    // 260730: GLB/GLTF — Tripo 생성 유령 몸. gltf.scene + gltf.animations 를 FBX 와 같은 모양으로.
    function _loadGlb(url) {
      return new Promise(function (resolve, reject) {
        var loader = new THREE.GLTFLoader();
        loader.load(url, function (gltf) {
          resolve({ scene: gltf.scene, animations: gltf.animations || [] });
        }, null, reject);
      });
    }

    function _loadModel(url) {
      return _isGlbUrl(url) ? _loadGlb(url) : _loadFbx(url);
    }

    function _nameFromUrl(url) {
      var base = (url || '').split('/').pop().split('?')[0].split('#')[0];
      try { base = decodeURIComponent(base); } catch (_) {}
      return base.replace(/\.(fbx|glb|gltf)$/i, '');
    }

    function _loadSource() {
      if (_source) return Promise.resolve(_source);
      if (_loading) return _loading;
      _loading = _loadModel(opts.fbxBaseUrl).then(function (base) {
        // extras push 전 base 클립 개수 기록 — _spawnAt 의 excludeBaseClips 분기에서 base/extras 경계 식별
        base._lumenBaseClipCount = (base.animations || []).length;
        if (!opts.fbxClipUrls || !opts.fbxClipUrls.length) return base;
        return Promise.all(opts.fbxClipUrls.map(_loadModel)).then(function (extras) {
          extras.forEach(function (e, i) {
            if (e.animations && e.animations[0]) {
              var clip = e.animations[0];
              clip.name = _nameFromUrl(opts.fbxClipUrls[i]) || ('extra_' + i);
              base.animations.push(clip);
            } else {
              console.warn('[lumen-scene-mannequins] extras['+i+'] 클립 0개 —', opts.fbxClipUrls[i]);
            }
          });
          return base;
        });
      }).then(function (base) {
        if (opts.autoRescale) {
          var bbox = new THREE.Box3().setFromObject(base.scene);
          var sz = bbox.getSize(new THREE.Vector3());
          // 260730: FBX(cm, ~180) 만 아니라 GLB(m 또는 정규화 ~1)도 — 키가 1.8m 에서
          //   15% 넘게 벗어나면 항상 1.8m 로 맞춤. ybot 은 기존과 동일 결과.
          if (sz.y > 0.01 && Math.abs(sz.y - 1.8) > 0.27) {
            var s = 1.8 / sz.y;
            base.scene.scale.setScalar(s);
          }
          // 260730: 발바닥 오프셋 — Tripo GLB 는 원점이 몸 중앙이라 그대로 세우면 반쯤
          //   파묻힘. 스케일 반영 후 bbox 바닥(min.y)을 재서 _spawnAt 이 보정.
          //   Mixamo(원점=발) 는 ~0 이라 기존과 동일.
          var bbox2 = new THREE.Box3().setFromObject(base.scene);
          base._lumenFootY = isFinite(bbox2.min.y) ? bbox2.min.y : 0;
        } else {
          base._lumenFootY = 0;
        }
        _source = base;
        console.log('[lumen-scene-mannequins] model loaded (' + (_isGlbUrl(opts.fbxBaseUrl) ? 'glb' : 'fbx') + '); clips:',
          base.animations.map(function (c) { return c.name || '(unnamed)'; }));
        return base;
      }).catch(function (err) {
        console.error('[lumen-scene-mannequins] FBX load failed', err);
        _loading = null;
        throw err;
      });
      return _loading;
    }

    // T4: 그 핀 장면이 within-run 으로 물들었으면 strength(0..1) 반환, 아니면 0.
    //   getGhostDrift 미설정/예외/null 이면 안전하게 0 (= 안 기욺).
    function _driftStrengthFor(pin) {
      if (!opts.driftLean || typeof opts.getGhostDrift !== 'function') return 0;
      var d = null;
      try { d = opts.getGhostDrift(pin); } catch (_) { return 0; }
      if (!d || typeof d.strength !== 'number') return 0;
      return Math.max(0, Math.min(1, d.strength));
    }

    function _pickMonologueLine(pin) {
      var presets = (typeof opts.getPresets === 'function') ? opts.getPresets() : null;
      if (!presets) return null;
      var ghostType = (typeof opts.ghostTypeForPin === 'function') ? (opts.ghostTypeForPin(pin) || 'core') : 'core';
      var preset = presets[ghostType] || presets.core;
      if (!preset || !preset.monologue_templates || !preset.monologue_templates.length) return null;
      var memId = (typeof opts.getMemoryId === 'function') ? opts.getMemoryId() : '';
      var pinId = (pin && pin.id) || (pin && pin.pin && pin.pin.id) || '';
      var seed = 'mono|' + memId + '|' + pinId + '|' + ghostType;
      var rng = _mulberry32(_hashString(seed));
      return preset.monologue_templates[Math.floor(rng() * preset.monologue_templates.length)];
    }

    function _makeMonologueSprite(text) {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var font = opts.monologueFontPx + 'px "Gowun Batang", "Noto Serif KR", serif';
      ctx.font = font;
      var pad = 28;
      var wMeasure = ctx.measureText(text).width + pad * 2;
      canvas.width = Math.min(1024, Math.max(256, Math.pow(2, Math.ceil(Math.log2(wMeasure)))));
      canvas.height = 88;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var cx = canvas.width / 2, cy = canvas.height / 2;
      // chromatic afterimage (lumen_scene_ghosts 와 동일 톤)
      ctx.save();
      ctx.filter = 'blur(4px)';
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255,70,70,0.6)';
      ctx.fillText(text, cx - 5, cy);
      ctx.fillStyle = 'rgba(70,220,255,0.6)';
      ctx.fillText(text, cx + 5, cy);
      ctx.restore();
      // 본문
      ctx.save();
      ctx.shadowColor = 'rgba(232,216,252,0.55)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = opts.monologueColorCss;
      ctx.fillText(text, cx, cy);
      ctx.restore();

      var tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      var mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: opts.monologueBaseOpacity,
        fog: true,
        depthWrite: false,
        depthTest: true
      });
      var sp = new THREE.Sprite(mat);
      // 짧은 거리(2~4m) 옆에서 보는 텍스트 — 너무 크면 압도. canvas 512×88 → ~1.8m × 0.31m world.
      sp.scale.set(canvas.width / 280, canvas.height / 280, 1);
      sp.userData._lumenMannequinMonologue = true;
      sp._lumenTex = tex;
      sp._lumenMat = mat;
      return sp;
    }

    // ─── 260708 대화 집중 — 유령 얼굴 속 글자 ─────────────────────────
    // docs/유령대화_얼굴자막_연출_v1-260708.md (v2). 대화 진입 시 그 마네킹의 머리
    // 주변·내부를 모티프/공명 단어 스프라이트가 천천히 떠다닌다. 마네킹 머티리얼이
    // xray(additive·depthWrite off)라 글자가 머리 "속"에 겹쳐 보이는 게 의도.
    // 카메라는 여기서 안 건드림 (모듈 원칙) — 줌인은 play-test 쪽 트윈.
    var _dlg = null;   // { ghost, sprites:[], listening, opacityMul, jitter, dying }
    var _dlgHeadTmp = null;

    function _makeFaceWordSprite(text) {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var font = '34px "Gowun Batang", "Noto Serif KR", serif';
      ctx.font = font;
      var pad = 22;
      var wMeasure = ctx.measureText(text).width + pad * 2;
      canvas.width = Math.min(512, Math.max(128, Math.pow(2, Math.ceil(Math.log2(wMeasure)))));
      canvas.height = 64;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var cx = canvas.width / 2, cy = canvas.height / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(232,216,252,0.5)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(238,228,252,0.92)';
      ctx.fillText(text, cx, cy);
      ctx.restore();

      var tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      var mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false,
        depthTest: false     // 줌인 시 머리 메시에 안 가리게 — "속에서 떠다니는" 감각
      });
      var sp = new THREE.Sprite(mat);
      sp.renderOrder = 999;
      // 머리(~0.24m) 스케일에 맞춘 작은 글자 — canvas 256×64 → ~0.15m×0.038m world.
      // 얼굴 폭 안에 여러 단어가 겹치지 않고 들어가는 크기.
      sp.scale.set(canvas.width / 1500, canvas.height / 1500, 1);
      sp._lumenTex = tex;
      sp._lumenMat = mat;
      return sp;
    }

    function _findGhostBySceneId(sceneId) {
      if (!sceneId) return null;
      for (var i = 0; i < _ghosts.length; i++) {
        var p = _ghosts[i].pin || {};
        var sid = (p.scene && p.scene.id) || (p.pin && p.pin.sceneId) || p.sceneId || null;
        if (sid === sceneId) return _ghosts[i];
      }
      return null;
    }

    function _ghostHeadWorld(g, target) {
      if (!g) return null;
      var v = target || new THREE.Vector3();
      if (g.headBone) {
        g.headBone.getWorldPosition(v);
      } else {
        v.set(g.root.position.x, (g.groundY || 0) + 1.62, g.root.position.z);
      }
      return v;
    }

    function _dlgSpawnWord(word, isAbsorbed) {
      if (!_dlg || !word) return;
      if (_dlg.sprites.length >= 8) return; // 과밀 방지
      var rng = _mulberry32(_hashString('faceword|' + word + '|' + _dlg.sprites.length));
      var sp = _makeFaceWordSprite(word);
      scene.add(sp);
      _dlg.sprites.push({
        sp: sp,
        phase: rng() * Math.PI * 2,
        rx: 0.02 + rng() * 0.05,          // 수평 궤도 반경 — 머리 반경(~0.11m) *안쪽*
        ry: 0.025 + rng() * 0.035,        // 수직 흔들림 폭 — 얼굴 높이 안
        speed: 0.1 + rng() * 0.08,        // 궤도 속도 (아주 느리게)
        flashUntil: isAbsorbed ? (performance.now() + 1400) : 0,  // 흡수 단어 등장 플래시
        dying: false
      });
    }

    function _dlgUpdate(cam, nowSec) {
      if (!_dlg) return;
      var g = _dlg.ghost;
      if (!g || !g.root || !g.root.parent) { _dlgDisposeAll(); return; }
      if (!_dlgHeadTmp) _dlgHeadTmp = new THREE.Vector3();
      var head = _ghostHeadWorld(g, _dlgHeadTmp);

      // 카메라 → 머리 방향 (글자를 얼굴 앞쪽으로 살짝 당겨 "들여다보면 보이는" 결)
      var toCamX = 0, toCamZ = 0;
      if (cam && cam.position) {
        var ddx = cam.position.x - head.x, ddz = cam.position.z - head.z;
        var dl = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
        toCamX = ddx / dl; toCamZ = ddz / dl;
        // 260709: 대화 중엔 유령이 반드시 카메라를 마주보게 몸을 돌린다.
        // gaze(seen·fpActive 조건부)와 별개의 보장 회전 — 등 보이는 채 대화 방지.
        var faceA = Math.atan2(cam.position.x - g.root.position.x, cam.position.z - g.root.position.z);
        g.root.rotation.y = _lerpAngle(g.root.rotation.y, faceA, 0.06);
      }

      var targetBase = (_dlg.listening ? 0.92 : 0.26) * _dlg.opacityMul;
      var alive = 0;
      for (var i = 0; i < _dlg.sprites.length; i++) {
        var w = _dlg.sprites[i];
        if (!w.sp) continue;
        var a = nowSec * w.speed * Math.PI * 2 + w.phase;
        var jx = _dlg.jitter ? (Math.random() - 0.5) * _dlg.jitter : 0;
        var jy = _dlg.jitter ? (Math.random() - 0.5) * _dlg.jitter : 0;
        // 얼굴 "안": 머리 중심 반경 안에서 부유 + 카메라 쪽 0.1m 당김 (얼굴 면 근처).
        w.sp.position.set(
          head.x + Math.cos(a) * w.rx + toCamX * 0.1 + jx,
          head.y + Math.sin(nowSec * 0.55 + w.phase * 1.7) * w.ry + jy,
          head.z + Math.sin(a) * w.rx + toCamZ * 0.1
        );
        var tgt = w.dying ? 0 : targetBase;
        if (w.flashUntil && performance.now() < w.flashUntil) tgt = Math.min(1, targetBase * 1.5 + 0.15);
        var cur = w.sp._lumenMat.opacity;
        w.sp._lumenMat.opacity = cur + (tgt - cur) * 0.07;
        if (w.dying && w.sp._lumenMat.opacity < 0.02) {
          _dlgDisposeSprite(w);
        } else {
          alive++;
        }
      }
      if (_dlg.dying && alive === 0) _dlg = null;
    }

    function _dlgDisposeSprite(w) {
      if (!w.sp) return;
      if (w.sp.parent) w.sp.parent.remove(w.sp);
      if (w.sp._lumenMat && w.sp._lumenMat.dispose) w.sp._lumenMat.dispose();
      if (w.sp._lumenTex && w.sp._lumenTex.dispose) w.sp._lumenTex.dispose();
      w.sp = null;
    }

    function _dlgDisposeAll() {
      if (!_dlg) return;
      for (var i = 0; i < _dlg.sprites.length; i++) _dlgDisposeSprite(_dlg.sprites[i]);
      _dlg = null;
    }

    function _spawnAt(pin, idx) {
      if (!_source) return null;
      var root = THREE.SkeletonUtils.clone(_source.scene);
      _stripDetails(root);
      // Mixamo 본 이름은 'mixamorigHead' 또는 'mixamorig:Head' — 'head'로 끝나는 첫 본만 (HeadTop_End 제외)
      // 260730 Tripo GLB: 'tripo::Head_0'(머리 관절)·'tripo::Head_1'(정수리) — 끝이 _N 이라
      //   느슨한 매칭(head 포함, End 제외)을 2순위로. traverse 는 부모 먼저라 Head_0 이 잡힘.
      var headBone = null, headLoose = null;
      root.traverse(function (o) {
        if (!o.isBone) return;
        if (!headBone && /head$/i.test(o.name)) headBone = o;
        if (!headLoose && /head/i.test(o.name) && !/end/i.test(o.name)) headLoose = o;
      });
      if (!headBone) headBone = headLoose;

      var groundY = (typeof runtime.gH === 'function') ? runtime.gH(pin.wx, pin.wz) : 0;
      // 260730: _lumenFootY = 모델 바닥 높이 (Tripo GLB 원점 보정). Mixamo 는 ~0.
      var footY = _source._lumenFootY || 0;
      root.position.set(pin.wx, groundY + opts.yOffset - footY, pin.wz);
      if (opts.faceCenter) {
        root.rotation.y = Math.atan2(-pin.wx, -pin.wz);
      }
      root.userData._lumenGhostIdx = idx;        // 클릭 raycast 시 ghost 매핑
      scene.add(root);

      var mixer = new THREE.AnimationMixer(root);
      var anims = _source.animations || [];
      // 풀 결정: excludeBaseClips 면 extras(앞쪽 baseN개 이후) 만, 아니면 전체.
      var baseN = _source._lumenBaseClipCount || 0;
      var pool;
      if (opts.excludeBaseClips && anims.length > baseN) {
        pool = anims.slice(baseN);
      } else {
        pool = anims;
      }
      var pickedClipName = null;
      if (pool.length) {
        // poseRandomize 면 핀별 결정적 RNG 로 다양화 — 같은 메모리·같은 핀은 항상 같은 자세.
        var clipIdx;
        if (opts.preferLastClip) {
          clipIdx = pool.length - 1;
        } else if (opts.poseRandomize && pool.length > 1) {
          var poseMemId = (typeof opts.getMemoryId === 'function') ? opts.getMemoryId() : '';
          var posePinId = (pin && pin.id) || ('idx' + idx);
          var poseRng = _mulberry32(_hashString('pose|' + poseMemId + '|' + posePinId));
          clipIdx = Math.floor(poseRng() * pool.length);
        } else {
          clipIdx = 0;
        }
        var clip = pool[clipIdx];
        var a = mixer.clipAction(clip);
        if (opts.desyncTime) {
          a.time = Math.random() * (clip.duration || 1);
          a.setEffectiveTimeScale(0.85 + Math.random() * 0.3);
        }
        a.play();
        pickedClipName = clip.name || ('clip#' + clipIdx);
      }

      // ─── awareness: monologue sprite + gaze 상태 ───
      // 260709: monologue(마네킹 옆 혼잣말 스프라이트) 끔 — ghost_presets 하드코딩 문구가
      //   그 기억과 무관하게 떠서 (사용자 결정). gaze(응시)는 awareness 로 유지.
      var monologueSprite = null;
      var monologueLine = null;
      if (opts.awareness && opts.monologue) {
        monologueLine = _pickMonologueLine(pin);
        if (monologueLine) {
          monologueSprite = _makeMonologueSprite(monologueLine);
          monologueSprite.position.set(pin.wx, groundY + opts.monologueHeadY, pin.wz);
          scene.add(monologueSprite);
        }
      }

      return {
        root: root, mixer: mixer, pinIndex: idx,
        pin: pin,                                 // T4: getGhostDrift(pin) 조회용 (sceneId 등 포함)
        baseRotY: root.rotation.y,                // faceCenter 기본값 — 응시 LERP 의 시작점
        seen: false,                              // 한 번 클릭되면 true 영구 유지
        monologueSprite: monologueSprite,
        monologueLine: monologueLine,
        monologuePhase: idx * 1.37,
        groundY: groundY,
        pickedClipName: pickedClipName,           // 분포 진단용
        headBone: headBone,                       // headTilt 적용 대상
        leanCur: 0                                // T4: 현재 옆 기욺(rad) — 매 프레임 목표값으로 LERP
      };
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
      _dlgDisposeAll();  // 260708: 유령 사라지면 얼굴 글자도 즉시 정리
      _ghosts.forEach(function (g) {
        if (g.root && g.root.parent) g.root.parent.remove(g.root);
        if (g.monologueSprite) {
          if (g.monologueSprite.parent) g.monologueSprite.parent.remove(g.monologueSprite);
          if (g.monologueSprite._lumenMat && g.monologueSprite._lumenMat.dispose) g.monologueSprite._lumenMat.dispose();
          if (g.monologueSprite._lumenTex && g.monologueSprite._lumenTex.dispose) g.monologueSprite._lumenTex.dispose();
        }
      });
      _ghosts.length = 0;
      // 핀은 다음 세션이 _buildPlayScenePins 로 재생성하므로 굳이 복원 안 함.
      // setOptions({hidePinVisuals:false}) 하면 명시적 복원 흐름 필요.
    }

    function _rebuild() {
      _clear();
      if (!_source || typeof opts.getScenePins !== 'function') return;
      var pins = opts.getScenePins() || [];
      // 260731 회상 연출 — 게이트 닫힘이면 유령 없이 (핀 가림은 아래에서 그대로 함).
      //   관객이 대표 앵커를 보고 "기억나?"에 답하면 play-test 가 rebuild() 를 다시 불러
      //   유령이 그때 나타난다. 게이트 미설정 = 항상 열림(기존 동작).
      var _gateOpen = true;
      if (typeof opts.spawnGate === 'function') {
        try { _gateOpen = !!opts.spawnGate(); } catch (_) {}
      }
      if (!_gateOpen) {
        if (opts.hidePinVisuals) _hidePinVisuals(pins);
        console.log('[lumen-scene-mannequins] spawn gate 닫힘 — 유령 대기 (회상 전)');
        return;
      }
      pins.forEach(function (p, i) {
        if (opts.accessibleOnly && !p.accessible) return;
        var g = _spawnAt(p, i);
        if (g) _ghosts.push(g);
      });
      if (opts.hidePinVisuals) _hidePinVisuals(pins);
      // 자세 분포 — sitting/standing 비중이 의도대로 나오는지 확인용
      var poseDist = {};
      _ghosts.forEach(function (g) {
        var k = g.pickedClipName || '(none)';
        poseDist[k] = (poseDist[k] || 0) + 1;
      });
      console.log('[lumen-scene-mannequins] spawned:', _ghosts.length, '/', pins.length,
        opts.hidePinVisuals ? '(pins hidden)' : '(pins visible)', '· poses:', poseDist);
    }

    // renderer.render wrap — 가장 바깥. mixer + awareness (proximity opacity + gaze LERP).
    var _origRender = renderer.render.bind(renderer);
    var _t0 = performance.now();
    var _camRight = new THREE.Vector3();      // 매 프레임 재사용 (alloc 절약)
    var _headTiltAxisX = new THREE.Vector3(1, 0, 0);
    var _headTiltQuatTmp = new THREE.Quaternion();
    renderer.render = function (s, c) {
      var dt = _clock.getDelta();
      var fpActive = runtime.isFirstPerson && runtime.isFirstPerson();
      var camPos = (c && c.position) ? c.position : null;
      var nowSec = (performance.now() - _t0) / 1000;
      var nearD = opts.monologueNear, farD = opts.monologueFar;
      var rangeD = Math.max(0.01, farD - nearD);

      // 카메라 right 벡터 — sprite 를 머리 "옆"으로 보내기 위해. (1,0,0)을 카메라 회전으로.
      // y 컴포넌트 제거해서 지면과 평행한 옆방향으로 정규화 (위/아래 기울임 안 따라가게).
      if (c && c.quaternion) {
        _camRight.set(1, 0, 0).applyQuaternion(c.quaternion);
        _camRight.y = 0;
        var rl = _camRight.length();
        if (rl > 0.0001) _camRight.multiplyScalar(1 / rl);
      }

      for (var i = 0; i < _ghosts.length; i++) {
        var g = _ghosts[i];
        if (g.mixer) g.mixer.update(dt * opts.speed);

        // ─── T4: 자세 기욺 — 물든 핀이면 옆으로 strength 비례로 기운다 ───
        // 목표 기욺 = strength × driftLeanFactor (안 물들면 0). 갑자기 안 꺾이게 매 프레임 LERP.
        // root.rotation.z(옆 기울임) 에만 씀 → 응시 LERP 의 root.rotation.y(헤딩) 과 충돌 X.
        if (opts.driftLean) {
          var leanTgt = _driftStrengthFor(g.pin) * (opts.driftLeanFactor || 0);
          var ll = opts.driftLeanLerp;
          if (ll > 0 && ll < 1) {
            g.leanCur += (leanTgt - g.leanCur) * ll;     // 부드럽게 다가감
          } else {
            g.leanCur = leanTgt;                          // 0 이면 즉시
          }
          g.root.rotation.z = g.leanCur;
        }

        // mixer 갱신 직후 head bone 위쪽 회전 — sitting 클립일 때 "고개 들고 보기".
        // mixer 가 매 프레임 head quat 을 클립 값으로 덮어쓰므로 이 multiply 도 매 프레임 필요(누적 X).
        if (g.headBone) {
          var tilt = 0;
          if (g.pickedClipName && /sitting/i.test(g.pickedClipName)) {
            tilt = opts.headTiltSittingDeg || 0;
          } else {
            tilt = opts.headTiltStandingDeg || 0;
          }
          if (tilt) {
            // 부호: +값 = 위 보기. Mixamo head bone 은 +X 회전이 위 보기가 되도록 양수.
            //   거꾸로 보이면 옵션을 음수로 입력.
            _headTiltQuatTmp.setFromAxisAngle(_headTiltAxisX, tilt * Math.PI / 180);
            g.headBone.quaternion.multiply(_headTiltQuatTmp);
          }
        }

        if (!opts.awareness || !camPos) continue;

        var dx = g.root.position.x - camPos.x;
        var dz = g.root.position.z - camPos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);

        // Monologue sprite — proximity opacity + 머리 옆 (카메라 right) + 가벼운 bob
        if (g.monologueSprite) {
          if (fpActive) {
            var tProx = 1 - Math.min(1, Math.max(0, (dist - nearD) / rangeD));
            var op = opts.monologueBaseOpacity + (opts.monologueNearOpacity - opts.monologueBaseOpacity) * tProx;
            // 260708: 대화 집중 중인 유령은 혼잣말 대신 얼굴 속 글자 + 하단 자막이 말한다.
            if (_dlg && _dlg.ghost === g) op = 0;
            var bob = Math.sin(nowSec * 2 * Math.PI * opts.monologueBobFreq + g.monologuePhase) * opts.monologueBobAmp;
            var sx = g.root.position.x + _camRight.x * opts.monologueSideOffset;
            var sz = g.root.position.z + _camRight.z * opts.monologueSideOffset;
            g.monologueSprite.position.set(sx, g.groundY + opts.monologueHeadY + bob, sz);
            g.monologueSprite._lumenMat.opacity = op;
          } else {
            g.monologueSprite._lumenMat.opacity = 0;
          }
        }

        // Gaze — _seen 이면 매 프레임 카메라 방향으로 LERP. 한 번 본 유령은 계속 응시.
        if (g.seen && fpActive) {
          // ghost → cam 수평 방향. atan2(dx, dz) (root.rotation.y 컨벤션).
          var tgtAngle = Math.atan2(camPos.x - g.root.position.x, camPos.z - g.root.position.z);
          g.root.rotation.y = _lerpAngle(g.root.rotation.y, tgtAngle, opts.gazeFollowSpeed);
        }
      }

      // 260708: 대화 집중 얼굴 글자 갱신 (머리 본 추적 + 궤도 부유 + 페이드)
      if (_dlg) {
        try { _dlgUpdate(c, nowSec); } catch (_) {}
      }

      _origRender(s, c);
    };

    // ─── 클릭 → 응시 시작 (raycast: 카메라 정면 ray, crosshair 기준) ───
    // 빠른 클릭만으로 _seen=true 영구 마킹. 핀 long-press 입장 흐름과 공존:
    //   long-press 는 _fpNearPin(5m) 안에서만 발동, 클릭 응시는 거리 무관(<gazeMaxRayDist).
    var _ghostRaycaster = null;
    var _v3tmp = null;
    function _onCanvasMouseDown(ev) {
      if (!opts.awareness) return;
      if (!runtime.isFirstPerson || !runtime.isFirstPerson()) return;
      if (ev && ev.button !== 0) return;        // 좌클릭만
      var cam = runtime.getCamera && runtime.getCamera();
      if (!cam) return;
      if (!_ghosts.length) return;

      if (!_ghostRaycaster) _ghostRaycaster = new THREE.Raycaster();
      if (!_v3tmp) _v3tmp = new THREE.Vector3();
      _ghostRaycaster.set(cam.position, cam.getWorldDirection(_v3tmp));
      _ghostRaycaster.far = opts.gazeMaxRayDist;

      var roots = [];
      for (var i = 0; i < _ghosts.length; i++) roots.push(_ghosts[i].root);
      var hits = _ghostRaycaster.intersectObjects(roots, true);
      if (!hits.length) return;

      // hit object 의 부모 체인에서 _lumenGhostIdx 찾기
      var idx = -1;
      var node = hits[0].object;
      while (node) {
        if (node.userData && typeof node.userData._lumenGhostIdx === 'number') {
          idx = node.userData._lumenGhostIdx; break;
        }
        node = node.parent;
      }
      if (idx < 0) return;
      var hitGhost = null;
      for (var k = 0; k < _ghosts.length; k++) {
        if (_ghosts[k].pinIndex === idx) { hitGhost = _ghosts[k]; break; }
      }
      if (!hitGhost) return;
      if (!hitGhost.seen) {
        hitGhost.seen = true;
        console.log('[lumen-scene-mannequins] ghost #' + idx + ' seen — gaze locked.');
      }
    }
    var rendererDom = renderer && renderer.domElement;
    if (rendererDom) rendererDom.addEventListener('mousedown', _onCanvasMouseDown);

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
      // ADDITIVE 공간 안개 게이팅용: [{ root, monologueSprite, pin, ... }] 그대로 노출 (읽기 전용으로 쓸 것)
      ghosts: function () { return _ghosts.slice(); },
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
          seenCount: _ghosts.filter(function (g) { return g.seen; }).length,
          monologues: _ghosts.map(function (g) { return { idx: g.pinIndex, line: g.monologueLine, seen: g.seen }; }),
          poses: _ghosts.map(function (g) { return { idx: g.pinIndex, clip: g.pickedClipName }; }),
          leans: _ghosts.map(function (g) {
            return { idx: g.pinIndex, strength: _driftStrengthFor(g.pin), leanRad: g.leanCur };
          }),
          opts: Object.assign({}, opts, { getScenePins: '<fn>', getPresets: '<fn>', getMemoryId: '<fn>', ghostTypeForPin: '<fn>', getGhostDrift: '<fn>' })
        };
      },
      // 테스트/디자인 미팅 용: 강제 seen 토글
      markSeen: function (idx) {
        for (var i = 0; i < _ghosts.length; i++) {
          if (_ghosts[i].pinIndex === idx) { _ghosts[i].seen = true; return true; }
        }
        return false;
      },
      clearSeen: function () {
        _ghosts.forEach(function (g) {
          g.seen = false;
          // 즉시 baseRotY 로 되돌리지 않고 자연 LERP — 이건 향후 분기. 지금은 instant 복귀.
          g.root.rotation.y = g.baseRotY;
        });
      },

      // ─── 260708 대화 집중 API (docs/유령대화_얼굴자막_연출_v1-260708.md v2) ───
      // play-test 가 대화 진입 시 호출. 반환 headWorld 는 카메라 줌인 목표.
      dialogFocus: function (sceneId, words) {
        _dlgDisposeAll();
        var g = _findGhostBySceneId(sceneId);
        if (!g) {
          console.warn('[lumen-scene-mannequins] dialogFocus — sceneId 매칭 유령 없음:', sceneId);
          return { ok: false, headWorld: null };
        }
        _dlg = { ghost: g, sprites: [], listening: true, opacityMul: 0.85, jitter: 0, dying: false };
        // 대화가 시작되면 유령이 몸을 돌려 카메라를 마주본다 — 기존 응시(gaze) LERP 재사용.
        g.seen = true;
        var ws = Array.isArray(words) ? words : [];
        for (var i = 0; i < ws.length && i < 6; i++) {
          var w = String(ws[i] || '').trim();
          if (w) _dlgSpawnWord(w, false);
        }
        var head = _ghostHeadWorld(g, new THREE.Vector3());
        return {
          ok: true,
          headWorld: head.clone(),
          getHeadWorld: function () { return _ghostHeadWorld(g, new THREE.Vector3()); }
        };
      },
      // 자막 나가는 동안(false) 가라앉고, 플레이어 차례(true)에 일렁임.
      dialogActivity: function (listening) {
        if (_dlg) _dlg.listening = !!listening;
      },
      // 매 턴 결 → 글자 선명도/떨림. resonance=또렷 / vague=옅음 / dissonance=흐리고 떨림.
      dialogMood: function (alignment, resonance) {
        if (!_dlg) return;
        _dlg.opacityMul = resonance === 'resonance' ? 1.0 : resonance === 'dissonance' ? 0.5 : 0.8;
        _dlg.jitter = resonance === 'dissonance' ? 0.012 : 0;
      },
      // 흡수된 플레이어 단어가 얼굴 속으로 들어옴 (등장 플래시).
      dialogAbsorb: function (word) {
        var w = String(word || '').trim();
        if (_dlg && w) _dlgSpawnWord(w, true);
      },
      // 대화 종료 — 글자 페이드아웃 후 자체 정리.
      dialogEnd: function () {
        if (!_dlg) return;
        _dlg.dying = true;
        for (var i = 0; i < _dlg.sprites.length; i++) _dlg.sprites[i].dying = true;
      }
    };
    runtime.__lumenSceneMannequins = api;
    return api;
  }

  global.LumenSceneMannequins = { attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);

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
    // 2026-05-03: Sitting Idle / Standing Idle 추가 (mixamo). poseRandomize 로 핀별 결정적 픽 → 자세 다양화.
    // 2026-05-09: Sitting Idle / Standing Idle 파일 미박힘 — Promise.all reject 자리 발동
    //   → 전체 마네킹 빌드 실패. 작가 손으로 mixamo 다운로드 박을 때까지 임시 fix:
    //   extras 비우고 ybot 내장 Take 001 (차분한 standing) 단독 사용.
    fbxClipUrls: [],
    poseRandomize: true,
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
    gazeMaxRayDist: 18                        // 클릭 raycast 최대 거리 (m)
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

    function _nameFromUrl(url) {
      var base = (url || '').split('/').pop().split('?')[0].split('#')[0];
      try { base = decodeURIComponent(base); } catch (_) {}
      return base.replace(/\.(fbx|glb|gltf)$/i, '');
    }

    function _loadSource() {
      if (_source) return Promise.resolve(_source);
      if (_loading) return _loading;
      _loading = _loadFbx(opts.fbxBaseUrl).then(function (base) {
        // extras push 전 base 클립 개수 기록 — _spawnAt 의 excludeBaseClips 분기에서 base/extras 경계 식별
        base._lumenBaseClipCount = (base.animations || []).length;
        if (!opts.fbxClipUrls || !opts.fbxClipUrls.length) return base;
        return Promise.all(opts.fbxClipUrls.map(_loadFbx)).then(function (extras) {
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

    function _spawnAt(pin, idx) {
      if (!_source) return null;
      var root = THREE.SkeletonUtils.clone(_source.scene);
      _stripDetails(root);
      // Mixamo 본 이름은 'mixamorigHead' 또는 'mixamorig:Head' — 'head'로 끝나는 첫 본만 (HeadTop_End 제외)
      var headBone = null;
      root.traverse(function (o) {
        if (!headBone && o.isBone && /head$/i.test(o.name)) headBone = o;
      });

      var groundY = (typeof runtime.gH === 'function') ? runtime.gH(pin.wx, pin.wz) : 0;
      root.position.set(pin.wx, groundY + opts.yOffset, pin.wz);
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
      var monologueSprite = null;
      var monologueLine = null;
      if (opts.awareness) {
        monologueLine = _pickMonologueLine(pin);
        if (monologueLine) {
          monologueSprite = _makeMonologueSprite(monologueLine);
          monologueSprite.position.set(pin.wx, groundY + opts.monologueHeadY, pin.wz);
          scene.add(monologueSprite);
        }
      }

      return {
        root: root, mixer: mixer, pinIndex: idx,
        baseRotY: root.rotation.y,                // faceCenter 기본값 — 응시 LERP 의 시작점
        seen: false,                              // 한 번 클릭되면 true 영구 유지
        monologueSprite: monologueSprite,
        monologueLine: monologueLine,
        monologuePhase: idx * 1.37,
        groundY: groundY,
        pickedClipName: pickedClipName,           // 분포 진단용
        headBone: headBone                        // headTilt 적용 대상
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
          opts: Object.assign({}, opts, { getScenePins: '<fn>', getPresets: '<fn>', getMemoryId: '<fn>', ghostTypeForPin: '<fn>' })
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
      }
    };
    runtime.__lumenSceneMannequins = api;
    return api;
  }

  global.LumenSceneMannequins = { attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * spatialAudio.js — Web Audio API 기반 공간음향 엔진
 *
 * 사용:
 *   const engine = createSpatialAudioEngine();
 *   engine.register(sceneId, { url, x, y, z, volume, radius });
 *   engine.setListener(x, y, z, forward, up);  // forward/up 은 생략 가능
 *   engine.dispose();                          // 정리
 *
 * 메커니즘:
 *   - 각 씬에 PannerNode + AudioBufferSourceNode + GainNode
 *   - PannerNode 의 refDistance/maxDistance/rolloff 로 거리 기반 감쇠
 *   - register 시 fade-in, unregister/dispose 시 fade-out (등장/퇴장 pop 제거)
 *   - 같은 url 은 AudioBuffer 를 캐시 — 여러 씬이 한 파일을 써도 1회만 디코드
 *
 * 주의: distanceModel 'inverse' 는 maxDistance 에서 음량이 0 이 되지 않는다.
 *       maxDistance 는 감쇠 계산에 쓰는 거리의 상한일 뿐이라, 반경 밖의 먼
 *       소리도 옅은 꼬리로 계속 들린다 (TEM 잔향 연출상 의도적으로 유지).
 *       "반경 밖 완전 묵음" 이 필요하면 distanceModel 을 'linear' 로 바꿀 것.
 */

function createSpatialAudioEngine(engineOpts) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const sources = new Map();      // sceneId -> { panner, gain, source, opts }
  const bufferCache = new Map();  // url -> Promise<AudioBuffer>
  let listenerPos = { x: 0, y: 0, z: 0 };
  let disposed = false;

  const FADE_IN  = (engineOpts && engineOpts.fadeIn)  || 0.8; // 초
  const FADE_OUT = (engineOpts && engineOpts.fadeOut) || 0.6; // 초

  function loadBuffer(url) {
    let p = bufferCache.get(url);
    if (p) return p;
    p = fetch(url)
      .then(res => { if (!res.ok) throw new Error('fetch fail: ' + url); return res.arrayBuffer(); })
      .then(ab => ctx.decodeAudioData(ab));
    p.catch(() => bufferCache.delete(url)); // 실패는 캐시에 안 남김 — 재시도 허용
    bufferCache.set(url, p);
    return p;
  }

  async function register(sceneId, opts) {
    // opts: { url, x, y, z, volume=1, radius=15, loop=true }
    if (sources.has(sceneId)) unregister(sceneId);
    if (!opts.url || disposed) return;

    let buffer;
    try { buffer = await loadBuffer(opts.url); }
    catch (e) { console.warn(`[spatialAudio] ${sceneId} load fail:`, e.message); return; }
    // dispose / 재등록이 await 사이에 끼어들었으면 중단
    if (disposed || sources.has(sceneId)) return;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = opts.radius || 15;
    panner.rolloffFactor = 1;
    panner.positionX.value = opts.x || 0;
    panner.positionY.value = opts.y || 0;
    panner.positionZ.value = opts.z || 0;

    const vol = opts.volume != null ? opts.volume : 1;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + FADE_IN); // fade-in

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = opts.loop !== false;
    source.connect(gain).connect(panner).connect(ctx.destination);

    try { source.start(); } catch(e) {}

    sources.set(sceneId, { panner, gain, source, opts });
  }

  function unregister(sceneId) {
    const entry = sources.get(sceneId);
    if (!entry) return;
    sources.delete(sceneId);
    const { source, gain, panner } = entry;
    // fade-out 후 노드 정리
    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
    } catch(e) {}
    setTimeout(() => {
      try { source.stop(); } catch(e){}
      try { source.disconnect(); } catch(e){}
      try { gain.disconnect(); } catch(e){}
      try { panner.disconnect(); } catch(e){}
    }, FADE_OUT * 1000 + 60);
  }

  function updatePosition(sceneId, x, y, z) {
    const entry = sources.get(sceneId);
    if (!entry) return;
    entry.panner.positionX.value = x;
    entry.panner.positionY.value = y;
    entry.panner.positionZ.value = z;
  }

  function setListener(x, y, z, forward, up) {
    listenerPos = { x, y, z };
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
    } else if (L.setPosition) {
      L.setPosition(x, y, z);
    }
    // forward/up 을 주면 리스너 방향(회전)도 갱신 — 카메라가 돌면 음상도 같이 돈다
    if (forward && up) {
      if (L.forwardX) {
        L.forwardX.value = forward.x; L.forwardY.value = forward.y; L.forwardZ.value = forward.z;
        L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
      } else if (L.setOrientation) {
        L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
      }
    }
  }

  function resume() { if (ctx.state === 'suspended') return ctx.resume(); }

  function dispose() {
    disposed = true;
    for (const id of Array.from(sources.keys())) unregister(id);
    // fade-out 이 끝난 뒤 컨텍스트 종료
    setTimeout(() => { try { ctx.close(); } catch(e){} }, FADE_OUT * 1000 + 120);
  }

  return { register, unregister, updatePosition, setListener, resume, dispose, ctx, sources };
}

if (typeof window !== 'undefined') {
  window.createSpatialAudioEngine = createSpatialAudioEngine;
}

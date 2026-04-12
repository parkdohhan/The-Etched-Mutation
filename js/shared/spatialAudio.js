/**
 * spatialAudio.js — Web Audio API 기반 공간음향 엔진
 *
 * 사용:
 *   const engine = createSpatialAudioEngine();
 *   engine.register(sceneId, { url, x, y, z, volume, radius });
 *   engine.setListener(x, y, z);   // 플레이어 위치 이동 시 호출
 *   engine.dispose();              // 정리
 *
 * 메커니즘:
 *   - 각 씬에 PannerNode + AudioBufferSourceNode
 *   - PannerNode의 refDistance/maxDistance로 반경 기반 감쇠
 *   - 배경 루프 재생; 리스너 이동 시 자동 크로스페이드
 */

export function createSpatialAudioEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const sources = new Map(); // sceneId -> { panner, gain, source, buffer, opts }
  let listenerPos = { x: 0, y: 0, z: 0 };

  async function loadBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch fail: ' + url);
    const ab = await res.arrayBuffer();
    return await ctx.decodeAudioData(ab);
  }

  async function register(sceneId, opts) {
    // opts: { url, x, y, z, volume=1, radius=15, loop=true }
    if (sources.has(sceneId)) unregister(sceneId);
    if (!opts.url) return;

    let buffer;
    try { buffer = await loadBuffer(opts.url); }
    catch (e) { console.warn(`[spatialAudio] ${sceneId} load fail:`, e.message); return; }

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = opts.radius || 15;
    panner.rolloffFactor = 1;
    panner.positionX.value = opts.x || 0;
    panner.positionY.value = opts.y || 0;
    panner.positionZ.value = opts.z || 0;

    const gain = ctx.createGain();
    gain.gain.value = opts.volume != null ? opts.volume : 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = opts.loop !== false;
    source.connect(gain).connect(panner).connect(ctx.destination);

    try { source.start(); } catch(e) {}

    sources.set(sceneId, { panner, gain, source, buffer, opts });
  }

  function unregister(sceneId) {
    const entry = sources.get(sceneId);
    if (!entry) return;
    try { entry.source.stop(); } catch(e){}
    try { entry.source.disconnect(); } catch(e){}
    try { entry.gain.disconnect(); } catch(e){}
    try { entry.panner.disconnect(); } catch(e){}
    sources.delete(sceneId);
  }

  function updatePosition(sceneId, x, y, z) {
    const entry = sources.get(sceneId);
    if (!entry) return;
    entry.panner.positionX.value = x;
    entry.panner.positionY.value = y;
    entry.panner.positionZ.value = z;
  }

  function setListener(x, y, z) {
    listenerPos = { x, y, z };
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
    } else if (L.setPosition) {
      L.setPosition(x, y, z);
    }
  }

  function resume() { if (ctx.state === 'suspended') return ctx.resume(); }

  function dispose() {
    for (const id of Array.from(sources.keys())) unregister(id);
    try { ctx.close(); } catch(e){}
  }

  return { register, unregister, updatePosition, setListener, resume, dispose, ctx, sources };
}

if (typeof window !== 'undefined') {
  window.createSpatialAudioEngine = createSpatialAudioEngine;
}

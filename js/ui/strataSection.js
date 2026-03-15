/**
 * strataSection.js — Terrain Profile Renderer (play UI bottom only)
 * strataView.js(3D) 완전 독립.
 *
 * 3D terrain 계통 같 대표 고저선 + underlayer + trace + marker.
 * "정확 단면 " 아니라 "읽기 쉬운 terrain profile".
 *
 * API:
 *   window.strataSection.init()
 *   window.strataSection.setScenes(scenes)
 *   window.strataSection.setTraces(traces)
 *   window.strataSection.setCurrentScene(index)
 *   window.strataSection.render(canvas?)
 *   window.strataSection.emotionVectorToRGB(ev)
 */

/* ── deterministic noise (strataView.js 동일 계통) ── */

function _hs(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function _sn(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return _hs(i, j) + (_hs(i + 1, j) - _hs(i, j)) * sx + (_hs(i, j + 1) - _hs(i, j)) * sy + (_hs(i, j) - _hs(i + 1, j) - _hs(i, j + 1) + _hs(i + 1, j + 1)) * sx * sy;
}
function _fm(x, y, o) {
  o = o || 4; let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { v += a * _sn(x * f, y * f); a *= 0.5; f *= 2.1; }
  return v;
}

/* ── emotion → color ── */

const ANCHOR_COLORS = {
  anger: [140, 20, 20], fear: [60, 20, 80], shame: [100, 30, 60],
  moral_pain: [70, 30, 50], sadness: [30, 50, 100], guilt: [80, 50, 30],
  isolation: [20, 20, 40], numbness: [60, 60, 65], longing: [80, 60, 100],
  joy: [180, 140, 60], hope: [140, 160, 80], love: [140, 60, 80],
};

const EMOTION_COLORS = {
  fear: [100, 80, 180], sadness: [80, 100, 160], anger: [200, 80, 80],
  joy: [200, 180, 100], longing: [80, 180, 180], guilt: [150, 130, 100],
  shame: [160, 100, 130], numbness: [90, 90, 110], isolation: [70, 90, 130],
};

function emotionVectorToRGB(ev) {
  if (!ev || typeof ev !== 'object') return [120, 120, 140];
  const base = ev.base || ev;
  const entries = Object.entries(base).filter(([, v]) => v != null && v > 0);
  if (entries.length === 0) return [120, 120, 140];
  const dom = entries.sort((a, b) => b[1] - a[1])[0];
  return EMOTION_COLORS[dom[0]] || [120, 120, 140];
}

/* ── profile generation ── */

function buildProfileFromScenes(scenes, sampleCount) {
  const n = scenes.length;
  if (n === 0) {
    const pts = [];
    for (let i = 0; i < sampleCount; i++) pts.push({ h: 0.3, r: 0.10, g: 0.10, b: 0.13 });
    return pts;
  }

  const raw = [];
  for (let si = 0; si < n; si++) {
    const em = scenes[si].original_emotion || scenes[si].originalEmotion || {};
    let totalW = 0, wH = 0;
    let cr = 0.10, cg = 0.10, cb = 0.13;
    for (const [name, val] of Object.entries(em)) {
      if (!val || val <= 0) continue;
      const anc = ANCHOR_COLORS[name];
      wH += val * 15 * val;
      if (anc) { cr += (anc[0] / 255) * val * 0.6; cg += (anc[1] / 255) * val * 0.6; cb += (anc[2] / 255) * val * 0.6; }
      totalW += val;
    }
    const h = totalW > 0 ? wH / totalW : 2;
    raw.push({ h: Math.max(0.5, Math.min(12, h)), r: Math.min(1, cr), g: Math.min(1, cg), b: Math.min(1, cb) });
  }

  const pts = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = (i / (sampleCount - 1)) * (n - 1);
    const lo = Math.floor(t), hi = Math.min(lo + 1, n - 1);
    const frac = t - lo;
    const a = raw[lo], b = raw[hi];
    const noise = (_fm(i * 0.12, 0.5, 5) - 0.35) * 2.8;
    pts.push({
      h: a.h * (1 - frac) + b.h * frac + noise,
      r: a.r * (1 - frac) + b.r * frac,
      g: a.g * (1 - frac) + b.g * frac,
      b: a.b * (1 - frac) + b.b * frac,
    });
  }
  return pts;
}

/* ── canvas setup ── */

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (w <= 0 || h <= 0) return null;
  const needW = Math.round(w * dpr), needH = Math.round(h * dpr);
  if (canvas.width !== needW || canvas.height !== needH) {
    canvas.width = needW;
    canvas.height = needH;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/* ── main render ── */

function renderTerrainProfile(canvas, scenes, traces, currentSceneIndex) {
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;

  ctx.fillStyle = '#09090d';
  ctx.fillRect(0, 0, w, h);

  const n = Math.max(1, scenes.length);
  const sampleCount = Math.max(n * 8, 60);
  const profile = buildProfileFromScenes(scenes, sampleCount);

  const profileTop = h * 0.12;
  const profileBottom = h * 0.40;
  const profileRange = profileBottom - profileTop;

  let maxH = 0;
  profile.forEach(p => { if (p.h > maxH) maxH = p.h; });
  if (maxH < 1) maxH = 1;

  const profileY = [];
  for (let i = 0; i < sampleCount; i++) {
    profileY.push(profileBottom - (profile[i].h / maxH) * profileRange);
  }

  /* ── underlayers (4 bands, darker toward bottom) ── */
  const UNDER_LAYERS = 4;
  const underStart = profileBottom;
  const underEnd = h * 0.92;
  const layerGap = (underEnd - underStart) / UNDER_LAYERS;

  for (let li = UNDER_LAYERS - 1; li >= 0; li--) {
    const layerTopBase = underStart + li * layerGap;
    const layerBotBase = underStart + (li + 1) * layerGap;
    const dampening = 1 - (li / UNDER_LAYERS) * 0.8;
    const darkness = 0.08 + (li / UNDER_LAYERS) * 0.06;

    ctx.beginPath();
    for (let i = 0; i < sampleCount; i++) {
      const x = (i / (sampleCount - 1)) * w;
      const baseOffset = (profileY[i] - profileBottom) * dampening * 0.25;
      const noise = (_fm(i * 0.08 + li * 2.7, li * 1.3, 5) - 0.35) * layerGap * 0.32 * dampening;
      const y = layerTopBase + baseOffset + noise;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    for (let i = sampleCount - 1; i >= 0; i--) {
      const x = (i / (sampleCount - 1)) * w;
      const baseOffset = (profileY[i] - profileBottom) * dampening * 0.15;
      const noise = (_fm(i * 0.07 + li * 3.1 + 5, li * 1.7 + 2, 5) - 0.35) * layerGap * 0.18 * dampening;
      const y = layerBotBase + baseOffset + noise;
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    const avgR = Math.round(profile[Math.floor(sampleCount / 2)].r * 255 * darkness);
    const avgG = Math.round(profile[Math.floor(sampleCount / 2)].g * 255 * darkness);
    const avgB = Math.round(profile[Math.floor(sampleCount / 2)].b * 255 * darkness);
    ctx.fillStyle = `rgba(${avgR},${avgG},${avgB},${0.35 - li * 0.06})`;
    ctx.fill();
  }

  /* ── bottom black closure ── */
  const botGrad = ctx.createLinearGradient(0, underEnd - layerGap, 0, h);
  botGrad.addColorStop(0, 'rgba(9,9,13,0)');
  botGrad.addColorStop(0.6, 'rgba(9,9,13,0.85)');
  botGrad.addColorStop(1, 'rgba(9,9,13,1)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, underEnd - layerGap, w, h - underEnd + layerGap);

  /* ── fill under profile line (primary layer) ── */
  ctx.beginPath();
  ctx.moveTo(0, profileY[0]);
  for (let i = 1; i < sampleCount; i++) {
    const x = (i / (sampleCount - 1)) * w;
    const px = ((i - 1) / (sampleCount - 1)) * w;
    ctx.quadraticCurveTo(px, profileY[i - 1], (px + x) / 2, (profileY[i - 1] + profileY[i]) / 2);
  }
  ctx.lineTo(w, profileBottom + 4);
  ctx.lineTo(0, profileBottom + 4);
  ctx.closePath();

  const midP = profile[Math.floor(sampleCount / 2)];
  const pR = Math.round(midP.r * 255 * 0.4 + 10);
  const pG = Math.round(midP.g * 255 * 0.4 + 10);
  const pB = Math.round(midP.b * 255 * 0.4 + 10);
  const fillGrad = ctx.createLinearGradient(0, profileTop, 0, profileBottom + 4);
  fillGrad.addColorStop(0, `rgba(${pR},${pG},${pB},0.35)`);
  fillGrad.addColorStop(1, `rgba(${pR},${pG},${pB},0.08)`);
  ctx.fillStyle = fillGrad;
  ctx.fill();

  /* ── effect traces on completed scenes ── */
  const segW = w / n;
  (traces || []).forEach((tr) => {
    const si = tr.sceneIndex;
    if (si < 0 || si >= n) return;
    const x0 = si * segW, x1 = (si + 1) * segW;
    const midX = (x0 + x1) / 2;
    const sampleMid = Math.round(((si + 0.5) / n) * (sampleCount - 1));
    const midY = profileY[Math.min(sampleMid, sampleCount - 1)];
    const effect = tr.effectType || 'mark';

    ctx.save();
    switch (effect) {
      case 'erosion':
        ctx.strokeStyle = 'rgba(200,80,80,0.35)';
        ctx.lineWidth = 1.5;
        for (let j = 0; j < 3; j++) {
          ctx.beginPath();
          ctx.moveTo(x0 + 4, midY + 2 + j * 3);
          ctx.lineTo(x1 - 4, midY + 4 + j * 3);
          ctx.stroke();
        }
        break;
      case 'deposit':
        ctx.fillStyle = 'rgba(100,160,200,0.25)';
        ctx.beginPath();
        ctx.moveTo(x0, midY);
        ctx.quadraticCurveTo(midX, midY - 8, x1, midY);
        ctx.quadraticCurveTo(midX, midY + 2, x0, midY);
        ctx.closePath();
        ctx.fill();
        break;
      case 'spread': {
        const grad = ctx.createRadialGradient(midX, midY, 0, midX, midY, segW * 0.6);
        grad.addColorStop(0, 'rgba(160,120,200,0.3)');
        grad.addColorStop(1, 'rgba(160,120,200,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x0, midY - 15, segW, 30);
        break;
      }
      case 'fade':
        ctx.fillStyle = 'rgba(9,9,13,0.3)';
        ctx.fillRect(x0, profileTop, segW, profileBottom - profileTop);
        break;
      case 'smooth':
        ctx.strokeStyle = 'rgba(196,168,130,0.2)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x0, midY);
        ctx.lineTo(x1, midY);
        ctx.stroke();
        break;
      case 'layer':
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(150,140,120,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, midY - 2);
        ctx.lineTo(x1, midY - 2);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      default:
        ctx.fillStyle = 'rgba(196,168,130,0.4)';
        ctx.beginPath();
        ctx.arc(midX, midY, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  });

  /* ── main profile line ── */
  ctx.beginPath();
  ctx.moveTo(0, profileY[0]);
  for (let i = 1; i < sampleCount; i++) {
    const x = (i / (sampleCount - 1)) * w;
    const px = ((i - 1) / (sampleCount - 1)) * w;
    ctx.quadraticCurveTo(px, profileY[i - 1], (px + x) / 2, (profileY[i - 1] + profileY[i]) / 2);
  }
  ctx.strokeStyle = 'rgba(196,168,130,0.65)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  /* ── player marker ── */
  if (currentSceneIndex != null && currentSceneIndex >= 0 && currentSceneIndex < n) {
    const markerSampleIdx = Math.round(((currentSceneIndex + 0.5) / n) * (sampleCount - 1));
    const markerX = (currentSceneIndex + 0.5) / n * w;
    const markerY = profileY[Math.min(markerSampleIdx, sampleCount - 1)] - 2;

    ctx.shadowColor = 'rgba(196,168,130,0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(196,168,130,0.95)';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(196,168,130,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(markerX, markerY + 4.5);
    ctx.lineTo(markerX, h * 0.85);
    ctx.stroke();
  }
}

/* ═══════════════════════════════════════════════
   STATE & PUBLIC API
   ═══════════════════════════════════════════════ */

let _scenes = [];
let _traces = [];
let _currentSceneIndex = 0;

function init() {
  _scenes = [];
  _traces = [];
  _currentSceneIndex = 0;
}

function setScenes(scenes) {
  _scenes = scenes || [];
}

function setTraces(traces) {
  _traces = traces || [];
}

function setCurrentScene(index) {
  _currentSceneIndex = index;
}

function render(canvas) {
  const el = canvas || document.getElementById('strataSectionCanvas');
  if (!el) return;
  renderTerrainProfile(el, _scenes, _traces, _currentSceneIndex);
}

window.strataSection = {
  init,
  setScenes,
  setTraces,
  setCurrentScene,
  render,
  emotionVectorToRGB,
};

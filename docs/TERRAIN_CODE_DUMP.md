# TEM / The Etched Mutation — 지형(Terrain) 관련 코드 덤프

> 이 문서는 **현재 워크스페이스 기준**으로 지형·층위·등고·프로필과 연관된 코드 위치와 **의존 관계**를 정리한 것입니다.  
> (대화 중에만 존재했던 `archiveMapMode.js` / `archiveMap` 오버레이 등은 **이 스냅샷에는 없음**.)

---

## 1. 한눈에 보는 맵 (무엇이 어디에 있는지)

| 구역 | 파일 | 역할 |
|------|------|------|
| **본편 아카이브 하단 2D 프로필** | `js/ui/strataSection.js` | 장면 `original_emotion` 기반 높이·색 → 캔버스에 단면 지형 + 트레이스 + 마커 |
| **3D 축적 지형 (Strata 뷰)** | `js/ui/strataView.js` | Three.js + 그리드 `bakeLayer`로 높이/색 필드, 이벤트 레이어 롤오버 등 (**대용량**) |
| **데모 플레이 하단 2D** | `js/demo/demoFlow.js` | `draw2DTerrain` — **strataSection과 거의 동일한 알고리즘**을 `demoState`용으로 인라인 복제 |
| **등고선 스탠드얼론 테스트** | `contour-test.html` | 인라인 `<script>`: `strataView`의 `bakeLayer` / 레이어 정의 / 노이즈 계열을 **포팅**해 Supabase plays로 래스터+등고선 렌더 |
| **지질도 상수 (VAD 앵커)** | `js/shared/tem_geo_map.js` | **렌더링 아님** — 감정 앵커 VAD 정의 (시각화 전용 플래그) |
| **본편 연동** | `js/index.js` | `loadStrataLayers`, `renderScene` 안에서 `window.strataSection.*` 호출 |
| **마크업** | `index.html` | `#strataPanel` + `#strataSectionCanvas`, `#strataView` 전체 오버레이 |
| **스타일** | `css/index.css` | `.strata-panel`, `#strataView` HUD, 엔딩 strata 애니 등 |
| **데모 HTML/CSS** | `demo-sequence.html`, `css/demo.css` | `#terrainCanvas2D` 레이아웃 |

---

## 2. 의존 관계 (어디서 뭘 가져오나)

### 2.1 노이즈 함수 계열 (공통 패턴)

- **`strataSection.js`** 상단 `_hs` / `_sn` / `_fm`  
  → 주석: *「strataView.js 동일 계통」*  
- **`strataView.js`** 상단 `hs` / `sn` / `fm` (이름만 다름, 수식 동일 계열)  
- **`contour-test.html`** 인라인 `hs` / `sn` / `fm`  
- **`demoFlow.js`** `draw2DTerrain` 위쪽 `_hs` / `_sn` / `_fm`  

→ **별도 npm 패키지가 아니라**, 프로젝트 안에서 **복붙·미세 수정**으로 공유됩니다.

### 2.2 2D 단면 지형 (`strataSection` vs `demoFlow`)

- **`js/ui/strataSection.js`**: `buildProfileFromScenes` + `renderTerrainProfile` — **단일 소스로 보는 것이 맞음**.
- **`js/demo/demoFlow.js`** 약 **717–986행** `draw2DTerrain`: 같은 구조(언더레이어 4단, 프로필 곡선, contamination 트레이스, 마커)이나  
  - 높이 정규화: strataSection은 min-max+gamma, demo는 `maxH` 단순 나눗셈 등 **차이** 있음.

### 2.3 등고선 / 래스터 (`contour-test.html`)

- 푸터 문구: *「strataView bakeLayer 포팅」*
- **`strataView.js`**의 `bakeLayer` / `aggregateLayerCaches` / `recomputeLayers` 개념을 **단일 HTML 파일 안**으로 옮긴 형태.
- 데이터는 **Supabase** `plays` 등에서 가져와 이벤트로 변환 후 그리드에 굽습니다.

### 2.4 3D Strata (`strataView.js`)

- **Three.js** ( `index.html`에서 `three.min.js` 로드 ) + 내부 IIFE로 `window`에 API 노출.
- `index.js` 엔딩 등에서 `window.showStrataView` 호출 (주석/에러 로그 참고).

---

## 3. `index.html` — 지형과 붙는 DOM

- **아카이브 플레이 하단 2D**:  
  `scene-viewer` 안 `#strataPanel` → `#strataSectionCanvas`  
  (`index.html` 약 335–342행 부근)
- **3D 전체 화면**:  
  `#strataView` 고정 레이어, `#strataCanvas`, HUD, contamination 바 등  
  (`index.html` 약 389–404행 부근)

---

## 4. `js/index.js` — 끌어다 쓰는 부분 (요약)

- **`loadStrataLayers(memoryId)`** (약 2215행대):  
  `window.strataSection.init` → `setScenes` → `setTraces` → `setCurrentScene` → `render()`
- **`renderScene()`** (아카이브 분기):  
  `_strataCompletedScenes` 갱신, `strataSection.emotionVectorToRGB`, `setTraces`, `render()`
- **`startEndStrataAnimation`**, 엔딩 시 **strata 3D** 시도 등 — 문자열 검색 `strata`로 추가 참조 가능.

---

## 5. `css/index.css` — 지형 관련 클래스 (grep 기준)

- `.strata-panel`, `.scene-viewer.archive-play .strata-panel`, `.strata-panel canvas` — 약 2126–2146행
- `.strata-container`, `.strata-layer`, 엔딩 `.end-strata-*` — 약 1635행대, 2523행대
- `#strataView` HUD `.strata-hud`, `.strata-h-tl` 등 — 약 5156행대

---

## 6. `js/shared/tem_geo_map.js` — 전체

지형 **그리기 코드는 아님**. TEM 지질도용 앵커 VAD 상수 정의.

```javascript
// TEM v1.0 Geological Map (World Constant)
// 값 절대 변경하지 않 다

export const TEM_ANCHOR_VAD = {
  fear:         { v: -0.9, a:  0.9, d: -0.8 },
  sadness:      { v: -0.8, a: -0.4, d: -0.7 },
  // ... 생략: 파일 전체 참조
};

export const TEM_ANCHOR_VAD_EXTENDED = {
  longing:      { v: -0.3, a:  0.2, d: -0.2 },
  // ...
};

export const TEM_VAD_IS_VISUAL_ONLY = true;
```

---

## 7. `js/ui/strataSection.js` — 전체 (본편 하단 2D 프로필)

```javascript
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
    // sqrt(totalW)로 나누어 평균 압축 완화 + 감정 개수에 따른 높이 폭발 방지
    const h = totalW > 0 ? wH / Math.sqrt(totalW) : 2;
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

  // min-max 정규화로 profileRange 전체를 사용해 지형 고저가 확실히 보이도록
  let minH = Infinity;
  let maxH = -Infinity;
  profile.forEach(p => {
    if (p.h < minH) minH = p.h;
    if (p.h > maxH) maxH = p.h;
  });
  const rangeH = maxH - minH || 1;

  const profileY = [];
  for (let i = 0; i < sampleCount; i++) {
    // 약한 gamma(0.85)로 봉우리 과도한 뾰족함 완화, 중간 지형 강조
    const norm = Math.pow((profile[i].h - minH) / rangeH, 0.85);
    profileY.push(profileBottom - norm * profileRange * 0.9);
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
```

---

## 8. `js/ui/strataView.js` — 요약 (파일 전체 ~1040행)

**외부에서 직접 import 하지 않음.** IIFE로 로드되며 Three.js 캔버스에 지형 메시 생성.

핵심 블록 (라인 번호는 대략적):

| 대략 라인 | 내용 |
|-----------|------|
| 12–45 | `mulberry32`, `hashStr`, `rngFrom`, `hs`/`sn`/`fm` 노이즈 |
| 47 | `GRID = 80`, `SIZE = 50` |
| 53–91 | `computeWeightsFromVAD`, `mapEventToRender` |
| 97–103 | `DEFAULT_LAYER_DEFS` (surface / near / mid / deep / bedrock) |
| 128–198 | `recomputeLayers` — 시간 윈도우별 이벤트 분배, pollution, bedrock compaction |
| 204~ | `bakeLayer` — 그리드별 `heights`, `colors`, pollution 필드 |
| 이후 | `aggregateLayerCaches`, Three.js 메시, 라벨, `window.showStrataView` 등 |

---

## 9. `js/demo/demoFlow.js` — 2D 지형 블록

- **위치**: 약 **717행~986행** (`TERRAIN PROFILE RENDERER` 주석 ~ `draw2DTerrain` 끝)
- **호출**: `updateTerrain()` → `getElementById('terrainCanvas2D')` → `draw2DTerrain(canvas, contaminations)`
- **데이터**: `demoState.scenes` + `sceneHistory`에서 만든 `contaminations[]`
- **출처**: `strataSection.js`와 **동일한 시각 언어**를 복제한 인라인 구현 (단일 파일 데모용).

---

## 10. `contour-test.html` — 구조

- **스타일**: `<style>` 안 `.canvas-wrap`, 그라데이션 배경 등 (파일 상단 ~65행)
- **스크립트**: 단일 `<script>` (약 116행 이후 ~끝)
  - Supabase 클라이언트
  - `LAYER_DEFS`, `GRID`/`SIZE` — `strataView`와 동일 계열
  - `buildAnchors`, `bakeLayer`, `aggregateLayerCaches`, `toPastelTone`, `drawRaster`, `marchingSquaresSegments`, `render()` 등
  - **별도 모듈 분리 없음** — 전부 인라인

> 전체를 이 MD에 붙이면 수백 줄이 넘어가므로, **원본 파일 `contour-test.html`을 그대로 열어 복사**하는 것을 권장합니다.

---

## 11. `demo-sequence.html` / `css/demo.css`

- `demo-sequence.html`: `#terrainCanvas2D` (플레이 패널 `play-terrain-panel` 안)
- `css/demo.css`: `#terrainCanvas2D { width:100%; height:100%; }` 등 (약 272행)

---

## 12. 부록: 네트워크/데이터와의 연결 (지형 데이터)

- `js/services/NetworkService.js` — `plays` / scenes 조회 등 (지형 **렌더**는 아님, 데이터 공급)
- `data/memories.js` — 로컬 시드 메모리 (씬·감정 필드가 `strataSection`의 입력)

---

*생성: 워크스페이스 스냅샷 기준 자동 정리. `strataView.js` / `contour-test.html` 전문은 용량 때문에 파일 직접 참조를 권장합니다.*

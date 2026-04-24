/**
 * Lumen 통합테스트 자동화 — Phase 1 (헤드리스 결정적 검사)
 * SCOPE: docs/통합테스트_체크리스트-260423.md
 *
 * 전략: opening 애니 플로우는 사람 몫(시청각)이라 bypass.
 *   play-test.html?memory=<id>&lang=ko 로 직접 진입 후 모듈 attach · DOM 존재 · smoke 를 검증.
 *
 * 커버리지:
 *   ✓ index.html 부팅 · Console 에러 0건
 *   ✓ play-test.html 로드 · Lumen 모듈 attach (Terrain/Walk/Visual/Audio)
 *   ✓ 미니맵 + vignette DOM 존재
 *   ✓ 3b in-browser smoke (fog/vignette depth 모듈레이션 + cap)
 *   ✓ Part G (Console · Page 에러 집계)
 *
 * 미커버:
 *   ✗ opening 애니 · 걸음 연출 자연스러움 · 색감 · 사운드 (사람 필수)
 *   ✗ admin (Phase 2 — auth storageState 필요)
 *   ✗ rewind 연출 시각 (사람 필수)
 *
 * 실행:
 *   터미널: npm run dev (Vite 5173)
 *   별도:   node test/e2e/lumen_integration.mjs [--headed] [--url=...]
 */

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const BASE_URL = (args.find(a => a.startsWith('--url=')) || '--url=http://localhost:5173').slice(6);
const HEADLESS = !args.includes('--headed');
const TEST_MEMORY_ID_ARG = args.find(a => a.startsWith('--memory='));
const TEST_MEMORY_ID = TEST_MEMORY_ID_ARG ? TEST_MEMORY_ID_ARG.slice(9) : null;  // null = auto-fetch

const results = [];
const consoleErrors = [];
const pageErrors = [];

function record(part, check, pass, detail) {
  results.push({ part, check, pass: pass ? '✅' : '❌', detail: detail || '' });
}

async function waitFor(page, pred, timeoutMs = 10000, stepMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await pred()) return true; } catch (_) {}
    await page.waitForTimeout(stepMs);
  }
  return false;
}

async function main() {
  console.log(`[e2e] base=${BASE_URL} headless=${HEADLESS} memory=${TEST_MEMORY_ID}`);
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ko-KR'
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), location: msg.location() });
  });
  page.on('pageerror', err => pageErrors.push({ message: err.message, stack: err.stack }));

  // ═════════ 1. index.html 부팅 ═════════
  try {
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    record('index', 'domcontentloaded', true);
  } catch (e) {
    record('index', 'domcontentloaded', false, e.message);
  }
  await page.waitForTimeout(1500);
  record('index', 'openingScreen DOM', (await page.locator('#openingScreen').count()) > 0);
  record('index', 'canvas 존재', (await page.locator('canvas').count()) >= 1);

  // ═════════ 2a. 실제 메모리 UUID 취득 (Supabase) ═════════
  let memoryId = TEST_MEMORY_ID;
  if (!memoryId) {
    try {
      memoryId = await page.evaluate(async () => {
        if (typeof window.getSupabaseClient !== 'function') return null;
        const sb = await window.getSupabaseClient();
        if (!sb) return null;
        const { data, error } = await sb.from('memories').select('id,code').limit(1);
        if (error || !data || !data[0]) return null;
        return data[0].id;
      });
      record('supabase', '테스트 메모리 UUID 취득', !!memoryId, memoryId || 'null');
    } catch (e) {
      record('supabase', '테스트 메모리 UUID 취득', false, e.message);
    }
  }
  if (!memoryId) {
    console.log('[e2e] 메모리 UUID 못 가져옴 — play-test 단계 skip');
    await browser.close();
    return report();
  }

  // ═════════ 2b. play-test.html 직접 진입 ═════════
  const playUrl = `${BASE_URL}/play-test.html?memory=${encodeURIComponent(memoryId)}&lang=ko`;
  try {
    await page.goto(playUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    record('play-test', 'URL 로드', true, playUrl);
  } catch (e) {
    record('play-test', 'URL 로드', false, e.message);
    await browser.close();
    return report();
  }

  // Lumen 모듈 attach 대기 (최대 12초). FP 자동 진입까지 시간 걸림.
  const attached = await waitFor(page, async () => {
    return await page.evaluate(() => {
      const rt = window.TemAfStrataTerrain && window.TemAfStrataTerrain._lastRuntime;
      return !!(rt && rt.__lumenVisualFx && rt.__lumenAdapter && rt.__lumenWalkFx);
    });
  }, 12000);
  record('Lumen', '3개 모듈 attach (Adapter/Walk/Visual)', attached);

  const fpActive = await page.evaluate(() => {
    const rt = window.TemAfStrataTerrain && window.TemAfStrataTerrain._lastRuntime;
    return !!(rt && rt.isFirstPerson && rt.isFirstPerson());
  });
  record('C-2', 'FP 자동 진입', fpActive);

  // 개별 모듈 플래그
  const modules = await page.evaluate(() => {
    const rt = window.TemAfStrataTerrain && window.TemAfStrataTerrain._lastRuntime;
    return {
      adapter: !!(rt && rt.__lumenAdapter),
      walk:    !!(rt && rt.__lumenWalkFx),
      visual:  !!(rt && rt.__lumenVisualFx),
      audio:   !!(rt && rt.__lumenAudioSpace)
    };
  });
  record('작업 0', 'LumenTerrainAdapter attach', modules.adapter);
  record('작업 3', 'LumenWalkEffects attach', modules.walk);
  record('작업 3b', 'LumenVisualEffects attach', modules.visual);
  record('작업 3c', 'LumenAudioSpace attach', modules.audio);

  // DOM
  record('D-2', '미니맵 #fpMinimap', (await page.locator('#fpMinimap').count()) > 0);
  record('3b', 'vignette #lumenVignette', (await page.locator('#lumenVignette').count()) > 0);

  // Ghost sprite build count
  const ghostCount = await page.evaluate(() => {
    const rt = window.TemAfStrataTerrain && window.TemAfStrataTerrain._lastRuntime;
    if (!rt) return -1;
    const scene = rt.getScene && rt.getScene();
    if (!scene) return -1;
    let c = 0;
    scene.traverse(o => { if (o && o.userData && o.userData._lumenGhost) c++; });
    return c;
  });
  record('D-1', '유령 sprite 개수 >= 0 (runtime 쿼리)', ghostCount >= 0, `count=${ghostCount}`);

  // ═════════ B 추가: 오프닝 칩 DOM 검증 (bypass 경로 별개, URL 경유로 역방향 확인) ═════════
  // index.html 재방문하여 칩 DOM 렌더 확인만 (클릭 흐름은 overlay intercept 이슈로 제외)
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(2500); // 오프닝 대사/애니 대기
  const chipCount = await page.locator('[data-emotion], .opening-chip, .emotion-chip').count();
  record('B-2', '감정 칩 DOM 존재 (>=1)', chipCount >= 1, `count=${chipCount}`);
  // play-test 로 되돌아감
  await page.goto(playUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await waitFor(page, async () => await page.evaluate(() => {
    const rt = window.TemAfStrataTerrain && window.TemAfStrataTerrain._lastRuntime;
    return rt && rt.isFirstPerson && rt.isFirstPerson();
  }), 15000);

  // ═════════ C-3: WASD 키 이동 → camera.position 변화 ═════════
  const moveCheck = await page.evaluate(async () => {
    const rt = window.TemAfStrataTerrain._lastRuntime;
    const cam = rt.getCamera();
    const before = { x: cam.position.x, z: cam.position.z };
    // _fpTick 은 document keydown/keyup 리스너를 사용 — 직접 dispatch
    const evDown = new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true });
    const evUp = new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true });
    document.dispatchEvent(evDown);
    await new Promise(r => setTimeout(r, 600));
    document.dispatchEvent(evUp);
    await new Promise(r => setTimeout(r, 100));
    const after = { x: cam.position.x, z: cam.position.z };
    const dist = Math.sqrt((after.x - before.x) ** 2 + (after.z - before.z) ** 2);
    return { before, after, dist };
  });
  record('C-3', 'W 키 600ms → 카메라 이동 > 0.1',
    moveCheck.dist > 0.1,
    `before=(${moveCheck.before.x.toFixed(2)},${moveCheck.before.z.toFixed(2)}) after=(${moveCheck.after.x.toFixed(2)},${moveCheck.after.z.toFixed(2)}) dist=${moveCheck.dist.toFixed(3)}`);

  // ═════════ F-1: 출구 door 오브젝트 존재 ═════════
  const doorExists = await page.evaluate(() => {
    const rt = window.TemAfStrataTerrain._lastRuntime;
    if (!rt) return false;
    const scene = rt.getScene();
    let found = false;
    scene.traverse(o => { if (o.userData && o.userData._exitDoor) found = true; });
    return found;
  });
  record('F-1', '출구 door 오브젝트 scene 내 존재', doorExists);

  // ═════════ E: rewind 모듈 attach + forceStart/Stop 사이클 ═════════
  const rewindAttached = await page.evaluate(() => {
    const rt = window.TemAfStrataTerrain._lastRuntime;
    return !!(rt && rt.__lumenRewind);
  });
  record('E', 'LumenRewind 모듈 attach', rewindAttached);

  if (rewindAttached) {
    const rewindCycle = await page.evaluate(async () => {
      const rt = window.TemAfStrataTerrain._lastRuntime;
      const rw = rt.__lumenRewind;
      const wait = (ms) => new Promise(r => setTimeout(r, ms));

      const before = rw.isRewinding();
      const started = rw.forceStart();
      await wait(300);
      const duringActive = rw.isRewinding();
      // triggerOnce 확인: 두 번째 forceStart
      const secondAttempt = rw.forceStart();
      await wait(100);
      rw.forceStop();
      await wait(200);
      const afterStop = rw.isRewinding();
      return { before, started, duringActive, secondAttempt, afterStop };
    });
    record('E-1', 'forceStart() 첫 호출 true',     rewindCycle.started === true);
    record('E-2', 'forceStart 직후 isRewinding',    rewindCycle.duringActive === true);
    record('E-9', 'triggerOnce: 2번째 forceStart false', rewindCycle.secondAttempt === false);
    record('E-7', 'forceStop 후 isRewinding false', rewindCycle.afterStop === false);
  }

  // ═════════ 3. 3b in-browser smoke ═════════
  if (fpActive && modules.visual) {
    const smoke = await page.evaluate(async () => {
      const rt = window.TemAfStrataTerrain._lastRuntime;
      const vfx = rt.__lumenVisualFx;
      const scene = rt.getScene();
      const vignetteEl = document.getElementById('lumenVignette');
      const origOpts = vfx.getOptions();
      let fakeDepth = 0;
      vfx.setOptions({ contaminationDepthProvider: () => fakeDepth });
      const wait = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      fakeDepth = 0;     await wait();
      const fog0 = scene.fog.density, vig0 = parseFloat(vignetteEl.style.opacity || '0');
      fakeDepth = 3;     await wait();
      const fog3 = scene.fog.density, vig3 = parseFloat(vignetteEl.style.opacity || '0');
      fakeDepth = 9999;  await wait();
      const fogMax = scene.fog.density, vigMax = parseFloat(vignetteEl.style.opacity || '0');
      vfx.setOptions({ contaminationDepthProvider: origOpts.contaminationDepthProvider });
      return {
        fog0, vig0, fog3, vig3, fogMax, vigMax,
        expectedFogMax: origOpts.fogBaseDensity * origOpts.fogDepthCap,
        expectedVigMax: origOpts.vignetteMaxOpacity,
        base: origOpts.fogBaseDensity,
        vigBase: origOpts.vignetteBaseOpacity
      };
    });
    record('3b-smoke', 'depth=0 · fog ≈ base',     Math.abs(smoke.fog0 - smoke.base) < 1e-6);
    record('3b-smoke', 'depth=0 · vignette ≈ base', Math.abs(smoke.vig0 - smoke.vigBase) < 0.005);
    record('3b-smoke', 'depth=3 · fog > base',      smoke.fog3 > smoke.fog0);
    record('3b-smoke', 'depth=3 · vignette > base', smoke.vig3 > smoke.vig0);
    record('3b-smoke', 'fog capped',                Math.abs(smoke.fogMax - smoke.expectedFogMax) < 1e-6);
    record('3b-smoke', 'vignette capped',           Math.abs(smoke.vigMax - smoke.expectedVigMax) < 1e-3);
  }

  await browser.close();
  report();
}

function report() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  통합테스트 결과');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.table(results);
  const failed = results.filter(r => r.pass === '❌');
  console.log(`\n총 ${results.length}개 체크 · ✅ ${results.length - failed.length} · ❌ ${failed.length}`);

  console.log('\n[파트 G] Console / Page 에러');
  if (consoleErrors.length === 0 && pageErrors.length === 0) {
    console.log('  ✅ 에러 0건');
  } else {
    consoleErrors.slice(0, 15).forEach((e, i) => {
      const loc = e.location ? ` (${e.location.url}:${e.location.lineNumber})` : '';
      console.log(`  ❌ console[${i}]: ${e.text}${loc}`);
    });
    if (consoleErrors.length > 15) console.log(`  ... +${consoleErrors.length - 15} more`);
    pageErrors.slice(0, 5).forEach((e, i) => console.log(`  ❌ pageerror[${i}]: ${e.message}`));
  }

  const totalBad = failed.length + consoleErrors.length + pageErrors.length;
  process.exit(totalBad > 0 ? 1 : 0);
}

main().catch(e => { console.error('[e2e] fatal:', e); process.exit(2); });

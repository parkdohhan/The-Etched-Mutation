/**
 * Lumen 시각 검증 — 스크린샷 캡처
 *
 * 실행: node test/e2e/visual_check.mjs [--url=http://localhost:5173]
 * 출력: test/e2e/screenshots/*.png
 *
 * 커버:
 *   1. baseline-fp      — FP 진입 직후 기본 화면
 *   2. depth-0          — 오염 depth=0 (vignette 최소, fog base)
 *   3. depth-5          — 중간 오염 (vignette·fog 모두 반응)
 *   4. depth-9999       — 최대 오염 (cap 적용된 상태)
 *   5. rewind-during    — rewind 활성 중 (색감 shift 있으면 보여야 함)
 *   6. after-rewind     — 종료 후 원복
 *
 * Claude 가 이후 Read 툴로 각 PNG 를 보고 육안 확인.
 */

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const args = process.argv.slice(2);
const BASE_URL = (args.find(a => a.startsWith('--url=')) || '--url=http://localhost:5173').slice(6);
const OUT = 'test/e2e/screenshots';

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ko-KR'
  });
  const page = await ctx.newPage();

  // memory UUID 취득
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const memId = await page.evaluate(async () => {
    const sb = await window.getSupabaseClient();
    const { data } = await sb.from('memories').select('id').limit(1);
    return data?.[0]?.id;
  });
  if (!memId) { console.error('메모리 UUID 취득 실패'); process.exit(1); }

  const playUrl = `${BASE_URL}/play-test.html?memory=${encodeURIComponent(memId)}&lang=ko`;
  await page.goto(playUrl, { waitUntil: 'domcontentloaded' });

  // FP 자동 진입 대기
  await page.waitForFunction(() => {
    const rt = window.TemAfStrataTerrain && window.TemAfStrataTerrain._lastRuntime;
    return rt && rt.isFirstPerson && rt.isFirstPerson();
  }, { timeout: 15000 });
  await page.waitForTimeout(1500);   // 초기 렌더 안정화

  // 1. baseline
  await page.screenshot({ path: `${OUT}/01_baseline.png` });
  console.log('[vis] 01_baseline.png');

  // contamination depth 조작 헬퍼
  async function setFakeDepth(d) {
    await page.evaluate((d) => {
      const rt = window.TemAfStrataTerrain._lastRuntime;
      const vfx = rt.__lumenVisualFx;
      if (vfx) vfx.setOptions({ contaminationDepthProvider: () => d });
    }, d);
    await page.waitForTimeout(500);
  }

  // 2. depth=0
  await setFakeDepth(0);
  await page.screenshot({ path: `${OUT}/02_depth-0.png` });
  console.log('[vis] 02_depth-0.png');

  // 3. depth=5
  await setFakeDepth(5);
  await page.screenshot({ path: `${OUT}/03_depth-5.png` });
  console.log('[vis] 03_depth-5.png');

  // 4. depth=9999 (cap)
  await setFakeDepth(9999);
  await page.screenshot({ path: `${OUT}/04_depth-max.png` });
  console.log('[vis] 04_depth-max.png');

  // depth 원복
  await setFakeDepth(0);
  await page.waitForTimeout(500);

  // 5. rewind 충분한 궤적 먼저 확보 (5초 전진)
  await page.evaluate(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    await new Promise(r => setTimeout(r, 5000));
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
  });
  await page.waitForTimeout(300);

  // forceStart 후 즉시 + 중간 지점 (rewind 진행 중) 두 컷
  await page.evaluate(() => {
    const rw = window.TemAfStrataTerrain._lastRuntime.__lumenRewind;
    if (rw) rw.forceStart();
  });
  await page.waitForTimeout(500);    // rewind 초기 (CSS filter 이행 완료 후, 진행 초반)
  const rewindingAtCap = await page.evaluate(() => {
    const rw = window.TemAfStrataTerrain._lastRuntime.__lumenRewind;
    return rw && rw.isRewinding();
  });
  console.log(`[vis] rewinding at capture: ${rewindingAtCap}`);
  await page.screenshot({ path: `${OUT}/05_rewind-during.png` });
  console.log('[vis] 05_rewind-during.png');

  // rewind 끝까지 대기 (자연 종료) 또는 강제 종료
  await page.waitForFunction(() => {
    const rw = window.TemAfStrataTerrain._lastRuntime.__lumenRewind;
    return !rw.isRewinding();
  }, { timeout: 10000 }).catch(async () => {
    await page.evaluate(() => window.TemAfStrataTerrain._lastRuntime.__lumenRewind.forceStop());
  });
  await page.waitForTimeout(600);   // filter transition 0.4s 원복 대기
  await page.screenshot({ path: `${OUT}/06_after-rewind.png` });
  console.log('[vis] 06_after-rewind.png');

  await browser.close();
  console.log(`\n✅ 6장 저장 → ${OUT}/`);
}

main().catch(e => { console.error('[vis] fatal:', e); process.exit(1); });

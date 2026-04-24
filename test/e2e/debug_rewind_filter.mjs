// rewind 색감 shift 디버그: canvas.style.filter 가 실제로 적용되는지 확인
import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

await page.goto(BASE_URL + '/');
await page.waitForTimeout(1000);
const memId = await page.evaluate(async () => {
  const sb = await window.getSupabaseClient();
  const { data } = await sb.from('memories').select('id').limit(1);
  return data?.[0]?.id;
});

await page.goto(`${BASE_URL}/play-test.html?memory=${memId}&lang=ko`);
await page.waitForFunction(() => {
  const rt = window.TemAfStrataTerrain?._lastRuntime;
  return rt?.isFirstPerson?.();
}, { timeout: 15000 });
await page.waitForTimeout(1500);

const state = await page.evaluate(async () => {
  const rt = window.TemAfStrataTerrain._lastRuntime;
  const canvas = document.getElementById('strataCanvas');
  const out = {
    lumenReturnModeExists: typeof window.LumenReturnMode !== 'undefined',
    lumenReturnModeAttached: !!rt.__lumenReturnMode,
    rewindExists: !!rt.__lumenRewind,
    canvasExists: !!canvas,
    canvasStyleFilterBefore: canvas ? canvas.style.filter : null,
    canvasComputedFilterBefore: canvas ? getComputedStyle(canvas).filter : null,
    savedFilter: null
  };

  // rewindStart 이벤트 리스너 수를 간접 확인 (lumen_return_mode 가 subscribe 했는지)
  if (rt.__lumenRewind) {
    rt.__lumenRewind.forceStart();
    await new Promise(r => setTimeout(r, 1500));
    out.canvasStyleFilterDuring = canvas ? canvas.style.filter : null;
    out.canvasComputedFilterDuring = canvas ? getComputedStyle(canvas).filter : null;
    out.isRewindingDuring = rt.__lumenRewind.isRewinding();

    rt.__lumenRewind.forceStop();
    await new Promise(r => setTimeout(r, 600));
    out.canvasStyleFilterAfter = canvas ? canvas.style.filter : null;
    out.isRewindingAfter = rt.__lumenRewind.isRewinding();
  }
  return out;
});

console.log(JSON.stringify(state, null, 2));
await browser.close();

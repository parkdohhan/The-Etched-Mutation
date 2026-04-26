/**
 * Layer resizer smoke — 작업 15 후속
 * 분할 핸들 드래그 / 더블클릭 리셋 / localStorage 영속 검증.
 * 실행: node test/e2e/smoke_layer_resizer.mjs [--headed]
 */
import { chromium } from 'playwright';
import { existsSync } from 'fs';

const args = process.argv.slice(2);
const BASE_URL = (args.find(a => a.startsWith('--url=')) || '--url=http://localhost:5173').slice(6);
const HEADLESS = !args.includes('--headed');
const STATE_PATH = 'test/e2e/.auth/admin.json';
if (!existsSync(STATE_PATH)) { console.error('auth 없음'); process.exit(2); }

const results = [];
const rec = (n, p, d) => results.push({ n, p: p ? '✅' : '❌', d: d || '' });

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({ storageState: STATE_PATH, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE_URL + '/admin.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#adminDashboard');
    await page.evaluate(() => window.switchAdminSection('canvas'));
    await page.waitForFunction(() => {
      const h = document.getElementById('tvLayerResizer');
      return h && h._bound === true;
    }, { timeout: 15000 });

    // 1. 핸들 존재 + 초기 비율
    const initial = await page.evaluate(() => {
      const top = document.getElementById('tvLayerTrajectory');
      const wrap = document.querySelector('#section-canvas .tv-canvas-wrap');
      return { topH: top.getBoundingClientRect().height, wrapH: wrap.getBoundingClientRect().height };
    });
    rec('초기 분할 ~55%', Math.abs(initial.topH / initial.wrapH - 0.55) < 0.05, `${(initial.topH / initial.wrapH * 100).toFixed(1)}%`);

    // 2. 드래그 — 30% 위치로 (headless mouse API 우회: dispatchEvent 직접)
    // 실 사용자 환경 마우스는 mousedown→window.mousemove→mouseup 같은 경로라 동치.
    const after = await page.evaluate(() => {
      const handle = document.getElementById('tvLayerResizer');
      const wrap = document.querySelector('#section-canvas .tv-canvas-wrap');
      const wrapR = wrap.getBoundingClientRect();
      const handleR = handle.getBoundingClientRect();
      const targetY = wrapR.top + wrapR.height * 0.30;
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: handleR.left + 30, clientY: handleR.top + 3 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: handleR.left + 30, clientY: targetY }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      const top = document.getElementById('tvLayerTrajectory');
      return { ratio: top.getBoundingClientRect().height / wrapR.height };
    });
    rec('드래그 후 ~30%', Math.abs(after.ratio - 0.30) < 0.04, `${(after.ratio * 100).toFixed(1)}%`);

    // 3. localStorage 저장
    const ls = await page.evaluate(() => parseFloat(localStorage.getItem('tv_layer_split_pct')));
    rec('localStorage 영속', Math.abs(ls - 0.30) < 0.06, `ls=${ls}`);

    // 4. 더블클릭 → 50% (dispatchEvent)
    const reset = await page.evaluate(() => {
      const handle = document.getElementById('tvLayerResizer');
      handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const top = document.getElementById('tvLayerTrajectory');
      const wrap = document.querySelector('#section-canvas .tv-canvas-wrap');
      return top.getBoundingClientRect().height / wrap.getBoundingClientRect().height;
    });
    rec('더블클릭 50:50', Math.abs(reset - 0.5) < 0.04, `${(reset * 100).toFixed(1)}%`);

    // 5. 리로드 후 0.5 유지
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.switchAdminSection('canvas'));
    await page.waitForFunction(() => {
      const h = document.getElementById('tvLayerResizer');
      return h && h._bound === true;
    }, { timeout: 15000 });
    await page.waitForTimeout(500);
    const persist = await page.evaluate(() => {
      const top = document.getElementById('tvLayerTrajectory');
      const wrap = document.querySelector('#section-canvas .tv-canvas-wrap');
      return top.getBoundingClientRect().height / wrap.getBoundingClientRect().height;
    });
    rec('새로고침 후 비율 유지', Math.abs(persist - 0.5) < 0.05, `${(persist * 100).toFixed(1)}%`);

    // cleanup
    await page.evaluate(() => localStorage.removeItem('tv_layer_split_pct'));

  } catch (e) { rec('실행', false, e.message); }
  finally { await browser.close(); }

  console.log('\n=== layer resizer smoke ===');
  results.forEach(r => console.log(`${r.p} ${r.n}${r.d ? ' — ' + r.d : ''}`));
  const fail = results.filter(r => r.p === '❌').length;
  console.log(`\n${results.length - fail}/${results.length} PASS`);
  process.exit(fail ? 1 : 0);
})();

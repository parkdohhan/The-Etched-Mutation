/**
 * Quilt 발자국 smoke — 깃발 off 회귀 + 깃발 on 모듈 노출만 빠르게.
 * FP 진입까지는 사람 클릭 필요라 e2e 안 함. 모듈 로드/회귀만.
 *
 * 실행: node test/e2e/quilt_footprints_smoke.mjs
 *   (npm run dev 먼저 띄워둬야 함)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const results = [];
function rec(name, pass, detail) { results.push({ name, pass: pass ? '✅' : '❌', detail: detail || '' }); }

async function probe(url, expectQuilt) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1280, height: 800 } }).then(c => c.newPage());
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2500); // 모듈 로드 시간

    const probe = await page.evaluate(() => ({
      hasFootprints: typeof window.LumenFootprints === 'object' && typeof window.LumenFootprints.attach === 'function',
      hasQuiltCtor: typeof window.QuiltDemoState === 'function' || (window.QuiltDemoState && typeof window.QuiltDemoState === 'function'),
      hasDialogPhase1: typeof window.LumenDialogPhase1 === 'object',
      hasTerrainAdapter: typeof window.LumenTerrainAdapter === 'object',
    }));

    rec(`${url} → LumenFootprints 노출`, probe.hasFootprints);
    rec(`${url} → LumenDialogPhase1 노출 (회귀)`, probe.hasDialogPhase1);
    rec(`${url} → LumenTerrainAdapter 노출 (회귀)`, probe.hasTerrainAdapter);
    rec(`${url} → console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    rec(`${url} → page errors`, pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } catch (e) {
    rec(`${url} → load`, false, e.message);
  } finally {
    await browser.close();
  }
}

await probe(`${BASE}/play-test.html`, false);
await probe(`${BASE}/play-test.html?quiltDemo=1`, true);

console.log('\n=== Quilt Footprints Smoke ===');
results.forEach(r => console.log(`${r.pass} ${r.name}${r.detail ? '\n   ' + r.detail : ''}`));
const failed = results.filter(r => r.pass === '❌').length;
console.log(`\n${failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);

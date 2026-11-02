// Render the three English figure HTML files to PNG with playwright (node_modules).
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..');
const figs = [
  { file: 'fig1_pipeline_en.html', w: 1700, h: 1060,  png: 'fig1_pipeline_en.png' },
  { file: 'fig2_dist_en.html',     w: 2400, h: 1560, png: 'fig2_dist_en.png' },
  { file: 'fig3_paths_en.html',    w: 2400, h: 1400, png: 'fig3_paths_en.png' },
];

const browser = await chromium.launch();
for (const f of figs) {
  const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(here, f.file)).href);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, f.png), clip: { x: 0, y: 0, width: f.w, height: f.h } });
  console.log('wrote', f.png);
  await page.close();
}
await browser.close();

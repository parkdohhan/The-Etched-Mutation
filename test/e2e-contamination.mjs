import { chromium } from 'playwright';
import { setTimeout as delay } from 'timers/promises';
import fs from 'fs';

const BASE = 'http://localhost:5176';
const SS = 'test/screenshots';

const TEST = {
  구덩이: { id: 'd9fd25f0-26bc-4a52-b02d-5a22a8b5b622', stage: 'biased_inclination', band: 'strong',
    contParams: 'cont_stage=biased_inclination&cont_drift=0.8&cont_fixation=0.1&cont_depth=15&cont_last_mismatch=bridge' },
  공원에서: { id: 'c4888189-164e-4866-b024-3d071a2cbd5e', stage: 'hypercompletion', band: 'strong',
    contParams: 'cont_stage=hypercompletion&cont_drift=0.1&cont_fixation=0.8&cont_depth=20&cont_last_mismatch=echo_follow' },
  Funeral: { id: '341f3ed3-7657-433d-af40-8bdbda13dcb0', stage: 'biased_inclination', band: 'strong',
    contParams: 'cont_stage=biased_inclination&cont_drift=0.75&cont_fixation=0.1&cont_depth=10&cont_last_mismatch=void_mismatch' },
};

const allErrors = [];
const allLogs = [];

function hookConsole(page, tag) {
  page.on('console', msg => {
    const t = `[${tag}] ${msg.type()}: ${msg.text()}`;
    if (msg.type() === 'error') allErrors.push(t);
    else allLogs.push(t);
  });
  page.on('pageerror', err => allErrors.push(`[${tag}] PAGE_ERROR: ${err.message}`));
}

function report(name, checks) {
  console.log(`\n${'═'.repeat(60)}\nTEST: ${name}\n${'═'.repeat(60)}`);
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v.pass ? 'PASS ✓' : 'FAIL ✗'}  ${k}`);
    if (v.detail) console.log(`          → ${v.detail}`);
  }
  return checks;
}

async function skipOpening(page) {
  await page.waitForLoadState('domcontentloaded');
  await delay(800);
  const o = await page.$('#openingScreen');
  if (o && await o.isVisible().catch(() => false)) {
    await page.click('body');
    await delay(1200);
    await page.click('body');
    await delay(800);
  }
}

function parseContaminationFromLogs(tag) {
  // LOG('contamination:', stage, '|', band, '| drift:', ..., '| dir:', ..., '| mismatch:', ...)
  const re = /\[play-test\] contamination: (\S+) \| (\S+)/;
  for (const l of allLogs) {
    if (!l.startsWith(`[${tag}]`)) continue;
    const m = l.match(re);
    if (m) return { stage: m[1], band: m[2] };
  }
  return null;
}

async function enterSceneViaPin(page) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const pin = await page.$('.map-pin.active, .map-pin.entrance');
    if (pin) {
      try {
        await pin.click({ force: true, timeout: 3000 });
        await delay(1500);
        const active = await page.$eval('#sceneMode', el => el.classList.contains('active')).catch(() => false);
        if (active) return true;
      } catch (_) {}
    }
    await delay(800);
  }
  return false;
}

// ─── Contamination play test ───────────────────────────────
async function testContamination(browser, name, memId, expectStage, expectBand, tag, opts = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  hookConsole(page, tag);
  const c = {};
  try {
    const contP = opts.contParams || '';
    await page.goto(`${BASE}/play-test.html?memory=${encodeURIComponent(memId)}&lang=ko${contP ? '&' + contP : ''}`);
    await page.waitForLoadState('domcontentloaded');
    await delay(8000);
    await page.screenshot({ path: `${SS}/${tag}_map.png`, fullPage: true });

    // Parse contamination from console logs (LOG('contamination:', ...))
    const cont = parseContaminationFromLogs(tag);
    c['Contamination computed'] = {
      pass: !!cont && cont.stage !== 'stable',
      detail: cont ? `stage=${cont.stage}, band=${cont.band}` : 'No contamination log found'
    };
    if (cont) {
      c[`stage="${expectStage}"`] = { pass: cont.stage === expectStage, detail: `Got "${cont.stage}"` };
      c[`band="${expectBand}"`] = { pass: cont.band === expectBand, detail: `Got "${cont.band}"` };
    } else {
      c[`stage="${expectStage}"`] = { pass: false, detail: 'No contamination log' };
      c[`band="${expectBand}"`] = { pass: false, detail: 'No contamination log' };
    }

    // Click a pin to enter scene
    const entered = await enterSceneViaPin(page);
    c['Scene entered via pin'] = { pass: entered, detail: entered ? 'sceneMode active' : 'Could not enter scene' };

    if (entered) {
      await delay(3000);
      await page.screenshot({ path: `${SS}/${tag}_scene.png`, fullPage: true });

      const sceneText = await page.$eval('#sceneText', el => el.textContent).catch(() => '');
      c['Scene text rendered'] = { pass: sceneText.length > 5, detail: `"${sceneText.slice(0, 100)}..."` };

      if (expectStage === 'biased_inclination') {
        const hasErosion = /·/.test(sceneText);
        c['Erosion · in text'] = { pass: hasErosion, detail: hasErosion ? 'Found ·' : `No · in "${sceneText.slice(0, 60)}"` };
      }
      if (expectStage === 'hypercompletion') {
        const htmlContent = await page.$eval('#sceneText', el => el.innerHTML).catch(() => '');
        const hasGlitch = /[░▒▓]/.test(htmlContent) || /(.)\1{3,}/.test(sceneText);
        c['Echo/glitch effects'] = { pass: hasGlitch, detail: hasGlitch ? 'Glitch chars found' : `No glitch: "${sceneText.slice(0, 60)}"` };
      }

      // Check NPC monologue (in #sceneNpc after ~1.5s+)
      await delay(4000);
      const npcText = await page.$eval('#sceneNpc', el => el.textContent?.trim()).catch(() => '');
      await page.screenshot({ path: `${SS}/${tag}_npc.png`, fullPage: true });

      const npcLabel = opts.checkVoid ? 'NPC monologue (void tone)' : 'NPC monologue appears';
      c[npcLabel] = { pass: npcText.length > 2, detail: npcText ? `"${npcText.slice(0, 100)}"` : 'No NPC text' };
    }

    if (opts.checkVoid) {
      const hasMismatchAttr = await page.$('[data-cont-last-mismatch]').then(el => !!el).catch(() => false);
      c['No data-cont-last-mismatch attr'] = { pass: !hasMismatchAttr, detail: hasMismatchAttr ? 'Found' : 'Not present (correct)' };
    }

    const errs = allErrors.filter(e => e.startsWith(`[${tag}]`));
    c['No console errors'] = { pass: errs.length === 0, detail: errs.length ? errs.slice(0, 3).join(' | ') : 'Clean' };
  } catch (err) {
    c['Execution'] = { pass: false, detail: err.message.slice(0, 200) };
  }
  report(name, c);
  await ctx.close();
  return c;
}

// ─── Test 4: i18n Settings ─────────────────────────────────
async function test4(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  hookConsole(page, 'T4');
  const c = {};
  try {
    await page.goto(BASE);
    await skipOpening(page);
    await delay(1500);

    const sb = await page.$('[data-menu-id="settings"]');
    if (sb) await sb.click();
    await delay(800);
    await page.screenshot({ path: `${SS}/t4_settings.png`, fullPage: true });

    const vis = await page.$eval('#settingsModal', el => getComputedStyle(el).display !== 'none').catch(() => false);
    c['Modal opens'] = { pass: vis, detail: vis ? 'visible' : 'hidden' };

    const btns = await page.$$eval('.settings-lang-btn', b => b.length).catch(() => 0);
    const slider = !!(await page.$('#settingsBrightness'));
    c['Has EN/KO + Brightness'] = { pass: btns >= 2 && slider, detail: `btns=${btns}, slider=${slider}` };

    const ko = await page.$('.settings-lang-btn[data-lang="ko"]');
    if (ko) await ko.click();
    await delay(400);
    const label = await page.$eval('[data-i18n="menu.play"]', el => el.textContent).catch(() => '');
    c['KO → labels Korean'] = { pass: /[가-힣]/.test(label), detail: `"${label}"` };

    await page.$eval('#settingsBrightness', el => { el.value = '0.7'; el.dispatchEvent(new Event('input')); });
    await delay(400);
    const filt = await page.$eval('html', el => el.style.filter).catch(() => '');
    c['Brightness changes'] = { pass: filt.includes('brightness'), detail: filt };
    await page.screenshot({ path: `${SS}/t4_ko.png`, fullPage: true });

    const cl = await page.$('.settings-close-btn');
    if (cl) await cl.click();
    await delay(300);

    await page.goto(BASE);
    await skipOpening(page);
    await delay(1500);
    const l2 = await page.$eval('[data-i18n="menu.play"]', el => el.textContent).catch(() => '');
    const f2 = await page.$eval('html', el => el.style.filter).catch(() => '');
    c['Persists after refresh'] = { pass: /[가-힣]/.test(l2) && f2.includes('brightness'), detail: `label="${l2}", filter="${f2}"` };

    const fc = await browser.newContext();
    const fp = await fc.newPage();
    await fp.goto(BASE);
    await delay(1500);
    const o2 = await fp.$('#openingScreen');
    if (o2 && await o2.isVisible().catch(() => false)) { await fp.click('body'); await delay(1200); await fp.click('body'); await delay(800); }
    const fl = await fp.$eval('[data-i18n="menu.play"]', el => el.textContent).catch(() => 'N/A');
    c['Fresh context → EN'] = { pass: fl.toUpperCase().includes('PLAY'), detail: `"${fl}"` };
    await fc.close();

    const errs = allErrors.filter(e => e.startsWith('[T4]'));
    c['No errors'] = { pass: errs.length === 0, detail: errs.length ? errs.join(' | ') : 'Clean' };
  } catch (err) {
    c['Execution'] = { pass: false, detail: err.message.slice(0, 200) };
  }
  report('Test 4 — i18n Settings', c);
  await ctx.close();
  return c;
}

// ─── Test 5: Full play regression ──────────────────────────
async function test5(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  hookConsole(page, 'T5');
  const c = {};
  try {
    await page.goto(`${BASE}/play-test.html?memory=${TEST.Funeral.id}&lang=en`);
    await page.waitForLoadState('domcontentloaded');
    await delay(8000);

    let scenesPlayed = 0;
    for (let i = 0; i < 6; i++) {
      const mapActive = await page.$eval('#mapMode', el => el.classList.contains('active')).catch(() => false);
      if (!mapActive) break;

      const entered = await enterSceneViaPin(page);
      if (!entered) break;
      scenesPlayed++;
      await delay(3000);
      await page.screenshot({ path: `${SS}/t5_s${scenesPlayed}.png`, fullPage: true });

      // Fill emotion input
      const textarea = await page.$('#emotionInputArea textarea');
      if (textarea && await textarea.isVisible().catch(() => false)) {
        await textarea.fill('I feel a deep sadness and longing');
        await delay(300);
        const sub = await page.$('#submitBtn');
        if (sub && await sub.isVisible().catch(() => false)) {
          await sub.click({ force: true });
          await delay(6000);
        }
      }

      // Check if back to map
      await delay(2000);
      const stillScene = await page.$eval('#sceneMode', el => el.classList.contains('active')).catch(() => false);
      if (stillScene) {
        const backBtn = await page.$('#backToMapBtn');
        if (backBtn && await backBtn.isVisible().catch(() => false)) {
          await backBtn.click({ force: true });
          await delay(1500);
        }
      }
    }

    c[`Scenes played`] = { pass: scenesPlayed >= 1, detail: `${scenesPlayed} scenes` };

    // Seal
    const sealBtn = await page.$('#sealBtn');
    if (sealBtn && await sealBtn.isVisible().catch(() => false)) {
      await sealBtn.click({ force: true });
      await delay(6000);
    }
    await page.screenshot({ path: `${SS}/t5_seal.png`, fullPage: true });

    // Check strata or end
    const strataVis = await page.$eval('#strataView', el => el.style.display !== 'none').catch(() => false);
    if (strataVis) {
      await delay(3000);
      await page.screenshot({ path: `${SS}/t5_strata.png`, fullPage: true });
      const closeBtn = await page.$('#strataCloseBtn');
      if (closeBtn && await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click({ force: true });
        await delay(2000);
      }
    }

    const endVis = await page.$eval('#phaseEnd', el => {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    }).catch(() => false);
    c['End/Strata reached'] = { pass: endVis || strataVis, detail: `end=${endVis}, strata=${strataVis}` };
    await page.screenshot({ path: `${SS}/t5_final.png`, fullPage: true });

    // Dilution log
    const dilLogs = allLogs.filter(l => l.includes('T5') && (l.toLowerCase().includes('dilution') || l.includes('Dilution')));
    c['[Dilution] log'] = { pass: dilLogs.length > 0, detail: dilLogs.length ? dilLogs[0].slice(0, 120) : 'No dilution log' };

    const errs = allErrors.filter(e => e.startsWith('[T5]'));
    c['No JS errors'] = { pass: errs.length === 0, detail: errs.length ? errs.slice(0, 5).join(' | ') : 'Clean' };
  } catch (err) {
    c['Execution'] = { pass: false, detail: err.message.slice(0, 200) };
  }
  report('Test 5 — Full play regression', c);
  await ctx.close();
  return c;
}

// ─── Main ──────────────────────────────────────────────────
if (!fs.existsSync(SS)) fs.mkdirSync(SS, { recursive: true });
const all = {};
const browser = await chromium.launch({ headless: false, slowMo: 80 });

try {
  all['Test 1'] = await testContamination(browser,
    'Test 1 — biased_inclination (구덩이)', TEST.구덩이.id, 'biased_inclination', 'strong', 'T1',
    { contParams: TEST.구덩이.contParams });
  all['Test 2'] = await testContamination(browser,
    'Test 2 — hypercompletion (공원에서)', TEST.공원에서.id, 'hypercompletion', 'strong', 'T2',
    { contParams: TEST.공원에서.contParams });
  all['Test 3'] = await testContamination(browser,
    'Test 3 — void_mismatch (Funeral)', TEST.Funeral.id, TEST.Funeral.stage, TEST.Funeral.band, 'T3',
    { checkVoid: true, contParams: TEST.Funeral.contParams });
  all['Test 4'] = await test4(browser);
  all['Test 5'] = await test5(browser);
} catch (err) {
  console.error('\n[FATAL]', err);
}

console.log(`\n${'═'.repeat(60)}\nALL CONSOLE ERRORS:\n${'═'.repeat(60)}`);
allErrors.length ? allErrors.forEach(e => console.log('  ' + e)) : console.log('  (none)');

// Print relevant contamination logs
const contLogs = allLogs.filter(l => l.includes('contamination:') || l.includes('Dilution') || l.includes('[play-test] loaded'));
if (contLogs.length) {
  console.log(`\nRelevant play-test logs:`);
  contLogs.forEach(l => console.log('  ' + l));
}

console.log(`\n${'═'.repeat(60)}\nFINAL SUMMARY\n${'═'.repeat(60)}`);
let tp = 0, tf = 0;
for (const [n, ch] of Object.entries(all)) {
  const p = Object.values(ch).filter(v => v.pass).length;
  const f = Object.values(ch).filter(v => !v.pass).length;
  tp += p; tf += f;
  console.log(`  ${n}: ${f === 0 ? '✓ ALL PASS' : `✗ ${f} FAIL`} (${p}/${p + f})`);
}
console.log(`\n  TOTAL: ${tp} pass, ${tf} fail\n  Screenshots: ${SS}/`);
await browser.close();

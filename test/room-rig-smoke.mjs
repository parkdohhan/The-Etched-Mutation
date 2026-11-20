// Headless walk through room-play with the rigged route (memories.meta.rig) — a showing must not fail.
//   npx vite --port 5199 --strictPort --host 127.0.0.1 --open false   (in another shell)
//   node test/room-rig-smoke.mjs [GWON-001] [way]        as=test: nothing is shared, rows are marked room-test
import { chromium } from 'playwright';
const MEM = process.argv[2] || 'GWON-001', WAY = process.argv.includes('way');
const LINES = ['문이 열려 있는 게 자꾸 마음에 걸렸다', '나는 한참 서 있다가 돌아섰다', '미안하다는 말을 끝내 하지 못했다', '그 자국을 오래 들여다보았다', '아무도 없는 골목이 이상하게 편했다', '숨을 죽이고 기다렸다', '그 사람이 돌아오길 바랐던 것 같다', '내가 한 짓이라는 걸 알고 있었다', '무서워서 고개를 들지 못했다', '그래도 걸음을 멈추지 않았다'];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
const BASE = process.env.BASE || 'http://127.0.0.1:5199';   // BASE=https://… to walk the deployed site
await page.goto(`${BASE}/room-play.html?memory=${MEM}&as=test&fast=8${WAY ? '' : '&way=0'}`);
await page.waitForFunction(() => { const b = document.getElementById('rpEnter'); return b && !b.disabled; }, null, { timeout: 30000 });
await page.fill('#rpEntryInput', '시험 걸음');
await page.click('#rpEnter');
let n = 0, ended = false;
const t0 = Date.now();
while (Date.now() - t0 < 520000) {
  const st = await page.evaluate(() => {
    const vis = (el) => !!el && getComputedStyle(el).opacity !== '0' && el.offsetParent !== null;
    const field = document.querySelector('.rp-write input[type=text]'), box = field && field.closest('.on');
    const door = document.querySelector('.rp-door.new');
    const r = window.__room || {};
    const end = document.getElementById('rpEndText');
    return { ask: !!(field && box), door: !!door && door.classList.contains('in'), end: !!(end && end.classList.contains('on')) || !!document.querySelector('#rpEndBtns.on'), gone: !/room-play/.test(location.pathname),
      way: !!(r.way && r.way.state && r.way.state().active), cor: document.getElementById('rpCorridor').classList.contains('on'), rooms: r.run ? r.run.rooms.length : 0, path: r.run ? r.run.path.length : 0 };
  }).catch(() => ({ gone: true }));
  if (st.gone || st.end) { ended = true; break; }
  if (st.ask) {
    const silentOnly = await page.evaluate(() => !document.querySelector('.rp-conn'));
    if (!silentOnly) await page.click('.rp-conn').catch(() => {});
    await page.fill('.rp-write input[type=text]', LINES[n++ % LINES.length]);
    await page.click('.rp-send');
    await page.waitForTimeout(900);
    continue;
  }
  if (st.way) { await page.evaluate(() => window.__room.way.walk(20)); await page.waitForTimeout(1200); continue; }
  if (st.cor) { await page.evaluate(() => window.__room.corridor.walk(20)); await page.waitForTimeout(1200); continue; }
  if (st.door) { await page.click('.rp-door.new', { force: true }).catch(() => {}); await page.waitForTimeout(1200); continue; }
  await page.waitForTimeout(500);
}
const out = await page.evaluate(() => { const r = window.__room && window.__room.run; return r ? { order: r.path.map((id) => r.scenes.find((s) => s.id === id).scene_order), rooms: r.rooms.map((x) => ({ o: x.scene_order, stage: x.text_stage, seen: x.seen_text.slice(0, 26) + '…' + x.seen_text.slice(-22), res: x.resonance, pat: x.engine && x.engine.pattern, door: x.door && (x.door.mode === 'end' ? 'END' : x.door.to), rig: x.door && x.door.rig, turns: x.turns ? x.turns.length : 1 })) } : null; }).catch(() => null);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-parksojung-The-Etched-Mutation/40aade99-78af-497d-ac87-e22791861699/scratchpad/rig-end' + (WAY ? '-way' : '') + '.png' }).catch(() => {});
console.log(WAY ? '[way=1]' : '[기본 화면]', 'ended:', ended, '· seconds', Math.round((Date.now() - t0) / 1000), '· order', out && out.order.join('→'));
if (out) for (const r of out.rooms) console.log('  #' + r.o, 'stage', r.stage, '|', r.res, r.pat, '| 문', r.door, r.rig ? '(고정)' : '', '| 턴', r.turns);
console.log('errors', errors.length, errors.slice(0, 6));
await browser.close();

// Walk-and-look helper for the piece stage (play-test.html?drift=1&dry=1).
// Used by the project skill .claude/skills/tem-walk-critic — the agent calls one step, takes a
// screenshot, calls the next. Each step returns what a script CAN know (numbers); what it looks
// like is judged from the screenshot. Not loaded by any page.
//   await import('/test/walk-critic.js')   ->   window.__walk
import './drift-helpers.js';

const D = window.__drift;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rt = () => window.TemAfStrataTerrain._lastRuntime;
const TP = () => window.TemPiece;
const game = () => window._temGame;

// errors the page throws while we walk
const errs = [];
if (!window.__walkHooked) {
  window.__walkHooked = true;
  window.addEventListener('error', (e) => errs.push('error: ' + String(e.message).slice(0, 160)));
  window.addEventListener('unhandledrejection', (e) => errs.push('rejection: ' + String((e.reason && e.reason.message) || e.reason).slice(0, 160)));
  const ce = console.error.bind(console);
  console.error = (...a) => { errs.push('console.error: ' + a.map(String).join(' ').slice(0, 160)); ce(...a); };
}

async function fps() {
  let n = 0; const t0 = performance.now();
  await new Promise((res) => { (function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(); })(); });
  return n;
}

/** What is on the screen right now, as numbers. */
function measure() {
  const THREE = window.THREE, cam = rt().getCamera(), sc = rt().getScene();
  const W = innerWidth, H = innerHeight, out = { sprites: [], overlays: [], hints: [] };
  const v = new THREE.Vector3(), fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  sc.traverse((o) => {
    if (!o.isSprite || !o.visible || !o.material || o.material.opacity < 0.08) return;
    const wp = o.getWorldPosition(new THREE.Vector3()), to = wp.clone().sub(cam.position), dist = to.length();
    if (dist > 70 || to.dot(fwd) <= 0) return;
    v.copy(wp).project(cam);
    if (Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3) return;
    const ws = o.getWorldScale(new THREE.Vector3());
    const pxPerUnit = (H / 2) / (Math.tan((cam.fov * Math.PI / 180) / 2) * Math.max(0.01, to.dot(fwd)));
    const w = ws.x * pxPerUnit, h = ws.y * pxPerUnit;
    if (ws.y > 12) return;                                  // light columns
    out.sprites.push({ dist: +dist.toFixed(1), w: Math.round(w), h: Math.round(h), tooBig: w > W * 0.5 || h > H * 0.3, tooSmall: dist < 14 && h < 11 });
  });
  // DOM layers over the middle of the view (the playfield)
  const box = { x0: W * 0.3, x1: W * 0.7, y0: H * 0.3, y1: H * 0.7 };
  document.querySelectorAll('body *').forEach((el) => {
    if (el.children.length > 3) return;
    const cs = getComputedStyle(el); if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const as = getComputedStyle(a); if (as.display === 'none' || as.visibility === 'hidden' || +as.opacity < 0.15) return; }
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.15) return;
    const t = (el.textContent || '').trim(); if (!t || t.length > 120) return;
    const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return;
    const ix = Math.max(0, Math.min(r.right, box.x1) - Math.max(r.left, box.x0)), iy = Math.max(0, Math.min(r.bottom, box.y1) - Math.max(r.top, box.y0));
    if (ix * iy > 400) out.overlays.push({ text: t.slice(0, 40), px: Math.round(ix * iy) });
    if (/누르|걷습니다|들어가|파내|들여다/.test(t)) out.hints.push(t.slice(0, 50));
  });
  out.sprites.sort((a, b) => a.dist - b.dist); out.sprites = out.sprites.slice(0, 12);
  out.overlays = out.overlays.slice(0, 8); out.hints = [...new Set(out.hints)].slice(0, 5);
  return out;
}

function where() {
  const cam = rt().getCamera(), id = TP().current(), s = game().scenes.find((x) => x.id === id) || {};
  const g = TP().ghostPos(id), L = TP().landOf ? TP().landOf(id) : {};
  return {
    scene: s.scene_order, sceneId: id, pos: [+cam.position.x.toFixed(1), +cam.position.z.toFixed(1)], eyeY: +cam.position.y.toFixed(1),
    ghostDist: +Math.hypot(g.x - cam.position.x, g.z - cam.position.z).toFixed(1), groundAtGhost: +rt().gH(g.x, g.z).toFixed(1), groundHere: +rt().gH(cam.position.x, cam.position.z).toFixed(1),
    land: L, door: TP().door(), visited: Object.keys(game().visitedCore || {}).length, route: TP().route().length,
    dialog: !!document.getElementById('lumenDialogPhase1'), busy: TP().busy(),
  };
}
async function snap(extra) { await sleep(700); return Object.assign({ where: where(), see: measure(), fps: await fps(), errors: errs.splice(0) }, extra || {}); }

const steps = {
  /** click through the intro, wait for the first piece */
  async enter() {
    for (let i = 0; i < 20; i++) {
      const el = [...document.querySelectorAll('div,span,button')].find((e) => e.children.length === 0 && /클릭해서 들어가기|click to enter/i.test(e.textContent));
      if (el) { el.click(); break; }
      await sleep(500);
    }
    for (let i = 0; i < 30 && !(TP() && TP().runtime()); i++) await sleep(500);
    await sleep(4500);
    return snap({ step: 'enter' });
  },
  /** the view a walker has on arriving (nothing touched) */
  async arrival() { return snap({ step: 'arrival' }); },
  /** turn on the spot: deg from the direction of the ghost */
  async look(deg) {
    const cam = rt().getCamera(), g = TP().ghostPos(TP().current());
    const a = Math.atan2(g.z - cam.position.z, g.x - cam.position.x) + (Number(deg) || 0) * Math.PI / 180;
    D.face(cam.position.x + Math.cos(a) * 10, cam.position.z + Math.sin(a) * 10);
    return snap({ step: 'look ' + deg });
  },
  /** walk up to the ghost (stops short of it) */
  async toGhost() {
    const g = TP().ghostPos(TP().current());
    const d = await D.walkTo(g.x, g.z, 4.2, 40000);
    return snap({ step: 'toGhost', stoppedAt: d, stuck: d > 6 });
  },
  /** walk to the nearest thing that can be touched (a buried word / a thing with words) */
  async toNearestThing() {
    const cam = rt().getCamera(), id = TP().current();
    const props = (window.TemPieceProps.propsOf(id) || []).filter((p) => p.kind === 'buried' || (p.kind === 'object' && p.role === 'speaking'));
    if (!props.length) return snap({ step: 'toNearestThing', none: true });
    props.sort((a, b) => Math.hypot(a.x - cam.position.x, a.z - cam.position.z) - Math.hypot(b.x - cam.position.x, b.z - cam.position.z));
    const p = props[0], d = await D.walkTo(p.x, p.z, 2.6, 30000);
    return snap({ step: 'toNearestThing', kind: p.kind, name: p.name, stoppedAt: d, stuck: d > 4 });
  },
  /** press E (dig / read) n times */
  async touch(n) { for (let i = 0; i < (n || 1); i++) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE' })); await sleep(500); } await sleep(3500); return snap({ step: 'touch', dug: window.TemPieceProps.dug() }); },
  /** open the talk with the piece's ghost; the screenshot shows the text arriving */
  async talk() { const r = await D.open(); await sleep(5000); return snap({ step: 'talk', opened: r }); },
  /** advance to the writing place and fill it (not sent yet) */
  async write(conn, text) { const r = await D.fill(conn || '그래서', text || '나는 그 자리에 한참 서 있었다'); await sleep(800); return snap({ step: 'write', filled: r }); },
  /** send; waits for the engine and the door */
  async send() { let r; try { r = await D.submit(); } catch (e) { r = { err: String(e).slice(0, 120) }; } await sleep(2500); const d = TP().door(); if (d) D.face(d.x, d.z); return snap({ step: 'send', result: r }); },
  /** walk to the door that appeared; the corridor opens */
  async toDoor() {
    const d = TP().door(); if (!d) return snap({ step: 'toDoor', noDoor: true });
    const dist = await D.walkTo(d.x, d.z, 0.6, 45000); await sleep(4000);
    return snap({ step: 'toDoor', stoppedAt: dist, inCorridor: TP().busy(), stuck: !TP().busy() });
  },
  /** inside the corridor: walk for `sec` seconds and report (screenshot = the corridor) */
  async corridor(sec) {
    const c = TP().corridor(); if (!c || !TP().busy()) return snap({ step: 'corridor', notIn: true });
    c.walk(sec || 3); await sleep((sec || 3) * 1000 + 300);
    let s = {}; try { s = c.state() || {}; } catch (_) {}
    return { step: 'corridor', state: s, errors: errs.splice(0) };
  },
  /** walk the corridor to its end and arrive */
  async cross() {
    const c = TP().corridor(); if (!c || !TP().busy()) return snap({ step: 'cross', notIn: true });
    c.walk(600); const t0 = Date.now();
    while (TP().busy() && Date.now() - t0 < 90000) await sleep(1000);
    await sleep(3500);
    return snap({ step: 'cross', seconds: Math.round((Date.now() - t0) / 1000), arrived: !TP().busy() });
  },
};
window.__walk = Object.assign({ measure, where, errs }, steps);

// Verification helpers for the drift stage (play-test.html?drift=1&dry=1).
// Load from the page console or an automated check:  await import('/test/drift-helpers.js')
// Walking goes through the real touch-input channel (setTouchMove); only the long-press
// entry is replaced by _temEnterSceneMode. Not loaded by any page.
const rt = window.TemAfStrataTerrain._lastRuntime;
const cam = rt.getCamera();
const g = window._temGame;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function face(x, z) { rt.setYaw(Math.atan2(-(x - cam.position.x), -(z - cam.position.z))); }

export async function walkTo(x, z, stop = 4.4, maxMs = 45000) {
  const t0 = performance.now(); let d = 99;
  while (performance.now() - t0 < maxMs) {
    const dx = x - cam.position.x, dz = z - cam.position.z;
    d = Math.hypot(dx, dz);
    if (d < stop) break;
    rt.setYaw(Math.atan2(-dx, -dz)); rt.setTouchMove(0, 1);
    await sleep(80);
  }
  rt.setTouchMove(0, 0); face(x, z);
  return +d.toFixed(1);
}

// the one open, not-yet-met scene that has a ghost (the prologue scene has none)
export function target() {
  // piece rooms: the only ghost in the world is the current piece's
  if (window.TemPiece && window.TemPiece.on) {
    const id = window.TemPiece.current();
    const pin = g.pins.find((p) => (p.type === 'core' || p.type === 'bridge') && p.sceneId === id && !g.visitedCore[id]);
    return pin ? { pin, p: window.TemPiece.ghostPos(id), order: g.scenes.find((s) => s.id === id).scene_order } : null;
  }
  const pos = window.TemDrift.positions();
  const min = Math.min(...g.scenes.map((s) => s.scene_order));
  const pin = g.pins.find((p) => (p.type === 'core' || p.type === 'bridge') && g.accessiblePinIds.has(p.id)
    && !g.visitedCore[p.sceneId] && pos[p.sceneId] && g.scenes.find((s) => s.id === p.sceneId).scene_order !== min);
  return pin ? { pin, p: pos[pin.sceneId], order: g.scenes.find((s) => s.id === pin.sceneId).scene_order } : null;
}

export async function open() {
  if (document.getElementById('lumenDialogPhase1')) return 'already';
  const t = target(); if (!t) return 'no target';
  rt.setSceneTransition && rt.setSceneTransition(true);
  window._temEnterSceneMode(t.pin);
  rt.setSceneTransition && rt.setSceneTransition(false);
  for (let n = 0; n < 30 && !document.getElementById('lumenDialogPhase1'); n++) await sleep(500);
  return 'opened';
}

// advance the text until the continuation input shows, then fill it (does not submit)
export async function fill(conn, text) {
  const dlg = document.getElementById('lumenDialogPhase1'); if (!dlg) return { err: 'no dialog' };
  let sel = dlg.querySelector('select');
  for (let i = 0; i < 30 && !sel; i++) { dlg.click(); await sleep(1200); sel = dlg.querySelector('select'); }
  if (!sel) return { err: 'no select' };
  const ins = dlg.querySelectorAll('input');
  if ([...sel.options].some((o) => o.value === conn)) { sel.value = conn; sel.onchange && sel.onchange(); }
  else { sel.value = '__custom__'; sel.onchange && sel.onchange(); ins[0].value = conn; }
  ins[1].value = text; ins[1].oninput && ins[1].oninput();
  return { ok: true };
}

export async function submit() {
  const dlg = document.getElementById('lumenDialogPhase1');
  const n0 = window.TemDrift.log().length; const geom0 = g._lastAccessGeom;
  dlg.querySelector('button').click();
  const t0 = Date.now();
  while (Date.now() - t0 < 70000) {
    await sleep(1000);
    if (g._lastAccessGeom !== geom0 && !document.getElementById('lumenDialogPhase1')) break;
    const d2 = document.getElementById('lumenDialogPhase1');
    if (d2 && Date.now() - t0 > 9000 && !d2.querySelector('select')) d2.click();
  }
  await sleep(2500);
  const G = g._lastAccessGeom || {}; const L = window.TemDrift.log();
  return {
    pattern: G.pattern,
    mapOffsetInSpreads: G.center && G.originMap ? +(Math.hypot(G.center.x - G.originMap.x, G.center.y - G.originMap.y) / G.spread).toFixed(2) : null,
    appeared: L.length > n0 ? L[L.length - 1] : null,
    met: Object.keys(g.visitedCore).length,
  };
}

window.__drift = { face, walkTo, target, open, fill, submit, sleep };

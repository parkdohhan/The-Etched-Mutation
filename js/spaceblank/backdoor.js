/**
 * Space-blank back doors (2026-11-23) — at a scene, beside the door the engine names, a second door that stands open
 * and gives onto a scene the walker has already read.
 *
 *   · It is a door of the stage's own kind (the opening's ASCII door), standing open. The far scene is not a picture:
 *     that scene's own line figure stands behind the door and is drawn only where the doorway is (a stencil) — walk
 *     round the door and it is gone; look through and it is there.
 *   · Coming near does not take the walker through. Near it and facing it, one line is typed in the stage's voice
 *     ("past the door, a scene you walked through — you can come back"), and Enter / a click (a button, on a phone)
 *     goes in. Nothing else happens by itself.
 *   · Which scene it gives onto is one of the scenes already read, by a fixed lottery on the run — never a scene not yet
 *     read (that would be a second door forward, and a choice among candidates, which this stage does not give).
 *
 * Staging only: nothing here measures or decides. Requires the three.js r128 global build (window.THREE).
 * Decision record: docs/우주무대_빈칸_실험-261123.md §2′
 */
import { drawAsciiDoor, DOOR_ASPECT, DOOR_COLS, DOOR_ROWS } from '../roomplay/asciidoor.js';
import { typeText } from '../roomplay/room.js';

const NEAR = 4.8, FACE = 0.4;                 // how close, and how squarely one must face it, for the line to come up (staging)
const BEHIND = 4.4, FLOOR_LEN = 6.5, TILE = 0.21;

export function createBackDoors(o) {
  const cosmos = o.cosmos, THREE = cosmos.THREE, world = cosmos.world, ko = o.ko !== false;
  const H = cosmos.DOOR_H, W = H * DOOR_ASPECT, cw = W / DOOR_COLS, ch = H / DOOR_ROWS;
  const doors = [];
  let active = null, hidden = false, time = 0;

  // the line beside the door, and the button a phone needs
  const line = document.createElement('div'); line.id = 'sbDoorLine'; line.setAttribute('aria-live', 'polite'); document.body.appendChild(line);
  const btn = document.createElement('button'); btn.id = 'sbDoorGo'; btn.type = 'button'; btn.className = 'rp-btn'; btn.textContent = ko ? '들어간다' : 'go in'; document.body.appendChild(btn);
  btn.addEventListener('click', () => enter());

  // one shade tile for the floor beyond the door (the way's floor glyph)
  const floorTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.font = '64px "SFMono-Regular", Menlo, Consolas, "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(226,214,196,1)';
    x.translate(32, 32); x.scale(1 / 0.6, 1); x.fillText('░', 0, 2);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; return t;
  })();
  const seen = (m) => { m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.EqualStencilFunc; m.stencilFail = THREE.KeepStencilOp; m.stencilZFail = THREE.KeepStencilOp; m.stencilZPass = THREE.KeepStencilOp; return m; };   // drawn only where the doorway is

  /**
   * @param r { from, to, at: Vector3 (the door's foot), dir: Vector3 (the walker comes toward the door along this), key, thing: the far scene's record in cosmos.things }
   */
  function raise(r) {
    const e = new THREE.Vector3(r.dir.x, 0, r.dir.z); if (e.lengthSq() < 1e-6) e.set(0, 0, -1); e.normalize();
    const G = new THREE.Group(); G.position.set(r.at.x, r.at.y + H / 2, r.at.z); G.rotation.y = Math.atan2(-e.x, -e.z);   // local +z faces the walker; the far scene stands at local −z
    // the door, open
    const dc = document.createElement('canvas'); drawAsciiDoor(dc, 1, { px: 30, tone: true });
    const tex = new THREE.CanvasTexture(dc); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    door.renderOrder = 5; G.add(door);
    // the doorway: the cells to the right of the folded leaf (frame, leaf of two cells, then the opening to the far frame)
    const x0 = 3 * cw, x1 = (DOOR_COLS - 1) * cw, mw = x1 - x0, mh = (DOOR_ROWS - 2) * ch, mx = x0 + mw / 2 - W / 2;
    const mask = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp }));
    mask.position.set(mx, 0, 0.005); mask.renderOrder = -1; G.add(mask);
    // the far scene: its own figure, stood a few steps beyond the door, and a floor of shade glyphs toward it
    const src = r.thing, inner = new THREE.Group();
    if (src && src.thing && src.thing.g) {
      const fig = src.thing.g.clone(true);
      fig.traverse((ob) => { if (ob.material) { ob.material = Array.isArray(ob.material) ? ob.material.map((m) => seen(m.clone())) : seen(ob.material.clone()); ob.renderOrder = 8; } });
      const s = Math.min(1, (H * 0.74) / Math.max(0.5, src.thing.h));
      fig.scale.setScalar(s); fig.position.set(mx + 0.15, -H / 2 + 0.04, -BEHIND); fig.rotation.set(0, 0.55, 0);
      inner.add(fig); inner.userData.fig = fig;
    }
    const floorMat = seen(new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    floorMat.map = floorTex.clone(); floorMat.map.needsUpdate = true; floorMat.map.repeat.set(mw / TILE, FLOOR_LEN / TILE);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(mw, FLOOR_LEN), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(mx, -H / 2 + 0.012, -FLOOR_LEN / 2 - 0.2); floor.renderOrder = 8; inner.add(floor);
    G.add(inner); world.add(G);
    const rec = { key: r.key, from: r.from, to: r.to, G, door, mask, inner, D: r.at.clone(), e, t0: time, live: true, fade: 0 };
    doors.push(rec);
    return rec;
  }

  function show(d) {
    line.innerHTML = '';
    const p = document.createElement('p'), k = document.createElement('span'); k.className = 'k';
    line.appendChild(p); line.appendChild(k); line.classList.add('on');
    typeText(p, ko ? '문 너머에 지나온 장면이 있다. 들어가면, 돌아올 수 있다.' : 'Past the door, a scene you walked through. You can come back.', { per: 36 });
    if (cosmos.isTouch()) btn.classList.add('on');
    else setTimeout(() => { if (active === d) typeText(k, ko ? 'Enter · 클릭 — 들어간다' : 'Enter · click — go in', { per: 30 }); }, 1800);
  }
  function hide() { line.classList.remove('on'); btn.classList.remove('on'); }
  function enter() {
    if (!active || hidden) return;
    const d = active; active = null; hide();
    if (o.onEnter) o.onEnter(d);
  }
  window.addEventListener('keydown', (e) => {
    if (!active || /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) return;
    if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'KeyF') { e.preventDefault(); enter(); }
  });
  window.addEventListener('pointerdown', (e) => { if (active && cosmos.locked() && e.button === 0) enter(); });   // while the walker looks round, a click is the step in

  const F = new THREE.Vector3(), FW = new THREE.Vector3();
  function tick(dt) {
    time += dt;
    if (!doors.length) return;
    F.copy(cosmos.feet()); FW.copy(cosmos.forward());
    let best = null, bd = Infinity;
    for (const d of doors) {
      d.fade += ((hidden ? 0 : 1) - d.fade) * (1 - Math.exp(-dt / (hidden ? 1.4 : 1.2)));
      d.door.material.opacity = d.fade; d.inner.visible = d.fade > 0.02;
      if (d.inner.userData.fig) d.inner.userData.fig.rotation.y = 0.55 + 0.18 * Math.sin(time * 0.05 + d.D.x);
      const dx = d.D.x - F.x, dz = d.D.z - F.z, dist = Math.hypot(dx, dz);
      if (dist < NEAR && dist < bd) { const dot = (dx * FW.x + dz * FW.z) / (dist || 1e-6); if (dot > FACE || dist < 1.4) { bd = dist; best = d; } }
    }
    const m = cosmos.mode();
    if (hidden || !(m === 'fly' || m === 'walk') || (o.canEnter && !o.canEnter())) best = null;
    if (best !== active) { active = best; if (active) show(active); else hide(); }
  }
  function hideAll() { hidden = true; active = null; hide(); }
  return { raise, tick, hideAll, enter, doors, active: () => active };
}

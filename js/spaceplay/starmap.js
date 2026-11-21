/**
 * Space-play star map (2026-11-21) — the walk so far, top left, as a small sky.
 *
 * What it shows is the walker's own model (topo.js Q): each scene reached is its own thing, small (the same
 * line sculpture as in the place — no beads, no captions), joined by the crossings made. The walker is an
 * acute triangle pointing where they look; a door that has appeared is on it too.
 * Pressed (or M), it opens to a size that can be read. Pressing a scene there calls `onPick(id, x, y)` with the
 * very point of the screen that was pressed — the door back to that scene is stood at that point.
 *
 * Position on the map means what it means in the model: only who stands where relative to whom.
 * Requires the three.js r128 global build (window.THREE).
 */
import { makeThing, glowTexture, C } from './things.js';

const TILT = 0.52, FIT = 0.7, MIN_SPAN = 64;
const THING_SMALL = 0.21, THING_OPEN = 0.135;   // a thing's height on the map: closed (it must still be a figure at a few pixels) · open (room between them)

// a star: a soft point with four thin rays
let _star = null;
function starTexture(THREE) {
  if (_star) return _star;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,.55)'); g.addColorStop(0.4, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  for (const [w, h] of [[128, 1.6], [1.6, 128]]) {
    const r = x.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = r; x.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  return (_star = new THREE.CanvasTexture(cv));
}

export function createStarMap(o) {
  const THREE = window.THREE, wrap = o.wrap, canvas = o.canvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -20, 20);
  cam.position.set(0, Math.sin(TILT) * 5, Math.cos(TILT) * 5); cam.lookAt(0, 0, 0);
  const model = new THREE.Group(); scene.add(model);

  const nodes = new Map();                 // id → { id, g (group), thing, glint, w:[x,y,z] world, here }
  let centre = [0, 0, 0], scale = FIT / MIN_SPAN, open = false, spin = 0.5, last = performance.now(), W = 0, H = 0, doorAt = null, doorBorn = 0, size = THING_SMALL;
  const toModel = (w, out) => (out || new THREE.Vector3()).set((w[0] - centre[0]) * scale, (w[1] - centre[1]) * scale, (w[2] - centre[2]) * scale);

  const edgeMat = new THREE.LineBasicMaterial({ color: C.amber, transparent: true, opacity: 0.5 });
  let edgeLines = null;
  // the walker: an acute triangle, lying flat, pointing where they look
  const arrow = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.085), new THREE.Vector3(0.03, 0, 0.04), new THREE.Vector3(-0.03, 0, 0.04)]), new THREE.MeshBasicMaterial({ color: 0xfff1dc, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false }));
  arrow.renderOrder = 9; model.add(arrow);
  // a door that has appeared: a small upright frame
  const doorMark = new THREE.Line(new THREE.BufferGeometry().setFromPoints([[-0.022, 0, 0], [-0.022, 0.075, 0], [0.022, 0.075, 0], [0.022, 0, 0], [-0.022, 0, 0]].map((p) => new THREE.Vector3(p[0], p[1], p[2]))), new THREE.LineBasicMaterial({ color: 0xc4a882, transparent: true, opacity: 0.95, depthTest: false }));
  doorMark.visible = false; doorMark.renderOrder = 8; model.add(doorMark);

  function refit() {
    const list = Array.from(nodes.values());
    if (!list.length) return;
    centre = [0, 0, 0]; for (const n of list) { centre[0] += n.w[0] / list.length; centre[1] += n.w[1] / list.length; centre[2] += n.w[2] / list.length; }
    let span = MIN_SPAN; for (const n of list) span = Math.max(span, Math.hypot(n.w[0] - centre[0], n.w[1] - centre[1], n.w[2] - centre[2]) + 26);
    scale = FIT / span;
    for (const n of list) toModel(n.w, n.g.position);
  }
  function set(list, edges, door) {
    const keep = new Set(list.map((n) => n.id));
    for (const [id, n] of nodes) if (!keep.has(id)) { model.remove(n.g); nodes.delete(id); }
    for (const it of list) {
      let n = nodes.get(it.id);
      if (!n) {
        const th = makeThing(o.memoryCode, it.scene), g = new THREE.Group(), unit = 1 / Math.max(1.5, th.h, 1), holder = new THREE.Group();
        th.g.scale.setScalar(unit); th.g.position.y = -th.h * unit / 2; holder.add(th.g); holder.scale.setScalar(size);
        const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(THREE), color: 0xdfe6f2, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
        glint.scale.set(0.2, 0.2, 1); glint.userData.ph = Math.random() * 6.28;
        g.add(glint, holder); model.add(g);
        n = { id: it.id, g, holder, thing: th, glint, w: it.pos.slice(), here: false };
        nodes.set(it.id, n);
      }
      n.w = it.pos.slice(); n.here = !!it.here; n.thing.setAsked(!!it.asked);
      n.base = n.here ? 0.7 : 0.34; n.glint.scale.setScalar(n.here ? 0.3 : 0.2);
    }
    refit();
    if (edgeLines) { model.remove(edgeLines); edgeLines.geometry.dispose(); edgeLines = null; }
    const pts = [], seen = new Set();
    for (const [a, b] of edges || []) {
      const k = a < b ? a + '|' + b : b + '|' + a; if (seen.has(k) || !nodes.has(a) || !nodes.has(b)) continue; seen.add(k);
      pts.push(nodes.get(a).g.position.clone(), nodes.get(b).g.position.clone());
    }
    if (pts.length) { edgeLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), edgeMat); model.add(edgeLines); }
    if (door && door.pos) { const was = doorAt; doorAt = door.pos.slice(); if (!was || was.join() !== doorAt.join()) doorBorn = performance.now(); } else doorAt = null;
  }
  function walker(pos, yaw) {
    toModel([pos.x, pos.y, pos.z], arrow.position);
    arrow.rotation.y = yaw;
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === W && h === H) return; W = w; H = h;
    renderer.setSize(w, h, false);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!wrap.classList.contains('on')) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    resize();
    if (!open) spin += dt * 0.035;                                         // closed, the sky turns very slowly; open, it holds still to be pressed
    model.rotation.y = spin;
    size += ((open ? THING_OPEN : THING_SMALL) - size) * (1 - Math.exp(-dt / 0.35));
    for (const n of nodes.values()) {
      n.thing.tick(now / 1000, dt); n.holder.scale.setScalar(size);
      n.glint.material.opacity = (n.base || 0.34) * (0.86 + 0.14 * Math.sin(now / 1000 * 0.7 + n.glint.userData.ph));   // a star's slow breath, not a twinkle
    }
    doorMark.visible = !!doorAt;
    if (doorAt) {
      toModel(doorAt, doorMark.position);
      const age = (now - doorBorn) / 1000, k = age < 12 ? 1 + 0.55 * (0.5 + 0.5 * Math.sin(age * 2.2)) : 1;   // for its first seconds it breathes large
      doorMark.scale.setScalar(k * 1.25); doorMark.rotation.y = -spin;
    }
    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);

  /** The scene whose small thing lies nearest a pressed point (client pixels), within reach. */
  function at(cx, cy) {
    const r = canvas.getBoundingClientRect(); let best = null, bd = Math.max(26, r.width * 0.07);
    model.updateMatrixWorld(true);
    for (const n of nodes.values()) {
      const v = n.g.getWorldPosition(new THREE.Vector3()).project(cam);
      const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height, d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }
  const setOpen = (v) => { if (open === v) return; open = v; wrap.classList.toggle('open', v); if (v && o.onOpen) o.onOpen(); if (!v && o.onClose) o.onClose(); };
  wrap.addEventListener('click', (e) => {
    if (!open) { setOpen(true); return; }
    const id = at(e.clientX, e.clientY);
    if (id && o.onPick) o.onPick(id, e.clientX, e.clientY); else setOpen(false);
  });
  wrap.addEventListener('pointermove', (e) => { wrap.style.cursor = open ? (at(e.clientX, e.clientY) ? 'pointer' : 'default') : 'pointer'; });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) setOpen(false); });

  return {
    set, walker,
    open: () => setOpen(true), close: () => setOpen(false), toggle: () => setOpen(!open), isOpen: () => open,
    /** Automation: where a scene's small thing is on the screen (client pixels). */
    screenOf(id) { const n = nodes.get(id); if (!n) return null; const r = canvas.getBoundingClientRect(); model.updateMatrixWorld(true); const v = n.g.getWorldPosition(new THREE.Vector3()).project(cam); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
    pick(id) { const p = this.screenOf(id); if (p && o.onPick) o.onPick(id, p.x, p.y); return p; },
  };
}

/**
 * Record-space preview (2026-11-23) — the thing a recipe draws, turning slowly in a small black frame.
 * The same interpreter the space stage uses (js/spaceplay/things.js fromRecipe), so what the author sees here is what stands
 * in the place. Each card has its own canvas; a preview that is scrolled out of view stops drawing (several WebGL contexts
 * on one page). Requires the three.js r128 global build (window.THREE).
 */
import { sanitizeRecipe, fromRecipe } from '../spaceplay/things.js?v=261123c';

export function createPreview(canvas) {
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 100);
  let group = null, thing = null, raf = 0, visible = true, last = performance.now();
  const t0 = performance.now();

  function fit() {
    const w = canvas.clientWidth || 320, h = canvas.clientHeight || Math.round(w * 0.75);
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  function frame() {
    raf = 0;
    if (!visible || !group) return;
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    if (thing && thing.tick) thing.tick(t, dt);
    group.rotation.y = t * 0.22;                        // slow, wide, heavy (260809)
    renderer.render(scene, cam);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && visible && group) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  /** Stand this recipe in the frame. Returns false when nothing in it can be drawn. */
  function show(recipe) {
    const r = sanitizeRecipe(recipe);
    if (!r) return false;
    if (group) { scene.remove(group); group = null; }
    thing = fromRecipe(r);
    group = new THREE.Group(); thing.g.position.y = -r.h / 2; group.add(thing.g); scene.add(group);
    const d = Math.max(3.4, r.h * 1.85);
    cam.position.set(0, r.h * 0.12, d); cam.lookAt(0, 0, 0);
    fit(); start();
    return true;
  }
  function clear() { if (group) { scene.remove(group); group = null; thing = null; } renderer.render(scene, cam); }
  // out of view: no drawing
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { for (const e of es) { visible = e.isIntersecting; if (visible) start(); } }, { threshold: 0.05 }).observe(canvas);
  }
  window.addEventListener('resize', () => { if (group) fit(); });
  return { show, clear, fit };
}

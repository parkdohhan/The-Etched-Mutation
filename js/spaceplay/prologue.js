/**
 * Space-play prologue (2026-11-23) — before the first scene. A door, far off in the black. One step toward it: the
 * floor was not there. The fall — the head goes down and there, far below the feet, is the model of the one who walked
 * before, falling too. The head comes up: the scenes of that walk stand down the fall, in the order they were reached,
 * each in its place; at each the fall stops for a moment, then goes on at the same speed to the next. After the last
 * the head goes down again: the model, close now. The screen goes dark; the fall does not stop.
 *
 * What is shown is not this walker's own path (they have none yet) but the last complete walk of this memory:
 *   · its line, drawn as the ending draws one (thread.js) — from the journal (run_traces.track), or, for walks before
 *     261123 whose line was not kept, a curve through the places its scenes stood (topo.placeNext replayed);
 *   · its scenes, in the order it reached them, each the scene's own line sculpture (things.js), all standing from
 *     the start (nothing comes into being in view: the fall arrives at what is there);
 *   · beside each, one line that walker said there (grey, italic — the ending's colour for someone before you).
 * No sentence of the manuscript is shown: the text is read for the first time in the walk itself.
 * When nobody has walked this memory yet: the scenes in the author's order, placed by the ledger alone (δ = 0).
 *
 * The close view at the end uses the ending's framing (finale.js distReveal), so the line seen here and one's own
 * line at the end are seen alike. Nothing is compared for the walker; the difference is theirs to feel.
 * The engine reads none of this (docs/우주무대_결정-261121.md §4). The eye is moved by hand (cosmos 'cine'); the fall
 * is not part of the walk's line (no trail is sampled in 'cine'). The fall is felt: the air streaks up past the eye,
 * the head shakes and tilts with the speed, the wind rises with it — and all of it goes on under the dark.
 *
 * Decision record: docs/우주무대_결정-261121.md U13. Requires the three.js r128 global build.
 *
 * 261128: any key (or the screen) held down for about a second during the fall cuts it short — dark at once, then on.
 *
 * runPrologue({ cosmos, run, data, lang, fast, hint, auto }) → resolves when the screen is black again
 *   run: { memory, scenes, acc }  ·  data: ../roomplay/data.js  ·  hint(msg, ms)  ·  auto: the step is taken by itself (tests)
 */
import { placeNext } from './topo.js';
import { makeThing, glowTexture } from './things.js?v=261123c';
import { createThread, splineThrough, unpackTrack } from './thread.js?v=261123d';
import { drawAsciiDoor, DOOR_ASPECT } from '../roomplay/asciidoor.js';
import { tidyLine } from '../shared/tidy_line.js?v=261128a';   // 261128: a line kept with a slip of the hand in it is tidied before it is shown

const FALL_SOUND = 'sounds/fall_air.wav', FALL_GAIN = 0.34;   // about a footstep's loudness (0.30~0.36); grows with the speed of the fall; loops without a seam (one buffer)
const STREAKS = 460, STREAK_X = 15, STREAK_Y = 26, STREAK_Z = [-28, 6];   // the air: fine specks around the eye that rush up as it falls (a box that follows the eye sideways, not down)
const SHAKE = 0.012, SWAY_ROLL = 0.05, SHAKE_X = 0.12;   // the fall shakes the head (radians, at full speed), tilts it slowly, and jolts the body sideways (units)
const HOLD_FELT = 1.0;                         // slowed at a scene the body is still in the fall: the shaking, the air and the wind keep this much of their full strength — all of it (author: "the body keeps trembling", "the rain and the sound stay as they are")
const CLOUD_FALL = 2.3;                        // the cloud haze, this much thicker while falling (it streams up past the eye)
const FLOOR_PITCH = -0.04;                     // standing: the eyes a touch below level
const DOOR_AT = 32;                            // the door, this far ahead across the black floor (small, lit)
const G = 8.0, V_MAX = 28;                     // the fall: how fast it gathers, how fast at most (world units a second) — slow and heavy
const FIRST_DEPTH = 130, SPACING = 36;         // the scenes stand down the fall: the first this far below the floor, then this far apart
const SLOW = { in: 11, at: 3, past: -1.5, out: -8, v: 3.0, tau: 0.18 };   // at a scene the fall does not stop: from `in` above it the speed eases down, is `v` from `at` above to `past` below, and is full again by `out` below (no stop — author 261124); `tau` = how closely the speed follows
const GLANCE = 10, GLANCE_END = -6, GLANCE_TAU = 0.35, GLANCE_YAW = 0.6;   // from this far above a scene to this far below it the eyes go to it — this quickly, turning this much of the way toward its side
const AHEAD = 12, SIDE = 2.4, SAY_OUT = 2.9;   // a scene stands in front of the eyes, this far ahead, a little to one side; its line further out
const LOOK1 = { down: 0.3, downS: 1.6, hold: 4.2, upS: 1.8 };   // the first look (seconds into the fall): the head goes down (from, how long), stays on the model below till, comes up (how long)
const LOOK_SCENES = -0.32;                     // between the scenes: the eyes down a little, looking ahead (the next scene comes into view from below just before the stop)
const DOWN = [0, -1, -0.45];                   // where the model is: below, a little ahead — the head turns there
const HEAD_DOWN_S = 2.6;                       // how long the head takes to go down the second time
const TAIL = { headDown: 0.5, black: 6.5, end: 9.8, fall: 175 };   // after the last stop (seconds): the head goes down; the screen goes (the model in full view ~3.5 s before, and under the dark); it is over · how far the eye falls by the time the screen goes
const HOLD_SKIP = 0.9, SKIP_DARK = 2.8, AFTER_SKIP = 1.0;   // 261128 (author: "the scenes going by one at a time is too long — let any key, held, skip it"): held this long (s) the fall is cut short — the screen goes dark at once (its own 2.6 s), the fall going on under it, then a short breath
const AFTER = 4.2;                             // then nothing — black and silent — this long before the first scene's text begins (author: "a pause after the fade")
const TUMBLE_Y = 0.07, TUMBLE_X = 0.03;        // how the model turns while it falls (radians a second)
const MODEL_FROM = 3.0;                        // as the fall begins the model is below the feet, this many full-view distances away; one by the time the screen goes, and still coming
const FONT_STACK = '"Noto Serif KR", "Nanum Myeongjo", "AppleMyungjo", "Batang", serif';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * ease(k);

export async function runPrologue(o) {
  const cosmos = o.cosmos, run = o.run, data = o.data, THREE = cosmos.THREE, FAST = o.fast || 1, ko = o.lang !== 'en';
  const pl = cosmos.pl, world = cosmos.world, canvas = cosmos.renderer.domElement, hint = o.hint || (() => {});
  const wait = (ms) => new Promise((r) => setTimeout(r, ms / FAST));

  // ── the material: the one who walked before ───────────────────────────────
  const prev = await lastWalk(data, run);
  const thread = createThread(THREE, prev.track);
  const pivot = new THREE.Group(); pivot.add(thread.group); thread.group.position.copy(thread.center).negate(); world.add(pivot);
  const tanHalf = Math.tan((cosmos.FOV * Math.PI) / 360);
  const distClose = () => thread.radius * (1 / Math.min(tanHalf, tanHalf * cosmos.cam.aspect)) * 1.18 + 20;   // = the ending's first full view
  const modelAt = pivot.position;
  const downDir = new THREE.Vector3(DOWN[0], DOWN[1], DOWN[2]).normalize(), LOOK_DOWN = Math.atan2(downDir.y, Math.hypot(downDir.x, downDir.z));

  // ── the eye on the floor, the door far ahead ──────────────────────────────
  cosmos.setMode('cine'); cosmos.start();
  const EYE = cosmos.EYE, EYE0 = EYE - 0.12, Z_FALL = -1.45;               // the eye when the fall begins (after the step and the lean)
  cosmos.teleport(new THREE.Vector3(0, EYE, 0), 0, FLOOR_PITCH);
  modelAt.set(0, -1e5, 0);                                                  // the model: nowhere yet
  const door = makeDoor(THREE, cosmos.DOOR_H, new THREE.Vector3(0, 0, -DOOR_AT)); world.add(door.m, door.glow);
  canvas.classList.add('on');

  // the scenes, standing down the fall from the start — in the order the one before reached them
  const passers = prev.order.map((scene, i) => ({ scene, eyeY: EYE0 - FIRST_DEPTH - i * SPACING, side: i % 2 ? 1 : -1, j: hash(scene.id), x: 0, thing: null, say: null, shown: false }));
  for (const p of passers) stand(p);
  // looking down at the start there is only the model: the scenes are shown each at a moment it is out of view as the head
  // comes up (so none comes into being before the eyes), and from then on they simply stand where they stand
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sphere = new THREE.Sphere(new THREE.Vector3(), 3.5);
  let hidden = passers.length;
  const n = passers.length, fallTotal = FIRST_DEPTH + Math.max(0, n - 1) * SPACING + TAIL.fall;   // how far the eye falls by the time the screen goes
  console.info('[prologue]', prev.whose, n + ' scenes', 'first ' + FIRST_DEPTH + ' below, ' + SPACING + ' apart');
  const sound = fallSound();
  const air = makeStreaks(THREE); world.add(air.lines);
  const cloud0 = cosmos.clouds ? cosmos.clouds.level : 1;

  let T = 0, phase = 'stand', pt = 0, fallT = 0, vy = 0, fade = 0, gone = false, alive = true, done;
  let ni = 0, tailT = -1, atSpeed = false;                                  // the fall: the next scene not yet passed; the tail after the last; whether full speed has been reached once (gravity until then)
  let heldAt = 0, skipT = -1, skipped = false, skipHinted = false;         // 261128: a key or the screen held down since (ms, 0 = nothing held) · the dark of a skip, running (s of real time)
  const keysDown = new Set(); let ptrDown = false;
  const holdNow = () => { if (keysDown.size || ptrDown) { if (!heldAt) heldAt = performance.now(); } else heldAt = 0; };
  const onKeyD = (e) => { if (e.code === 'Escape' || e.metaKey || e.ctrlKey || e.altKey) return; keysDown.add(e.code); holdNow(); };
  const onKeyU = (e) => { keysDown.delete(e.code); holdNow(); };
  const onPtrD = () => { ptrDown = true; holdNow(); }, onPtrU = () => { ptrDown = false; holdNow(); }, onBlur = () => { keysDown.clear(); ptrDown = false; heldAt = 0; };
  window.addEventListener('keydown', onKeyD); window.addEventListener('keyup', onKeyU); window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPtrD); window.addEventListener('pointerup', onPtrU); window.addEventListener('pointercancel', onPtrU);
  let glanceP = LOOK_SCENES, glanceY = 0;                                   // where the eyes are between/at the scenes (they go to each scene as it is reached)
  const over = new Promise((r) => { done = r; });

  function tick(dt) {
    if (!alive) return;
    T += dt * FAST; const sdt = dt * FAST;
    if (phase === 'stand') {
      pl.yaw = pl.tyaw = Math.sin(T * 0.21) * 0.012; pl.pitch = pl.tpitch = FLOOR_PITCH + Math.sin(T * 0.17) * 0.006;
      door.set(ease(T / 2.2) * (0.86 + 0.14 * Math.sin(T * 0.9)));          // it comes up out of the dark, and breathes
    } else if (phase === 'step') {                                           // one stride toward the door: the body lifts and settles
      pt += sdt; const k = ease(pt / 0.9);
      pl.pos.set(0, EYE + Math.sin(k * Math.PI) * 0.03, -k); pl.pitch = pl.tpitch = FLOOR_PITCH - Math.sin(k * Math.PI) * 0.01;
      if (pt >= 0.9) { phase = 'lean'; pt = 0; }
    } else if (phase === 'lean') {                                           // the other foot goes out and finds nothing
      pt += sdt; const k = Math.min(1, pt / 0.5);
      pl.pos.set(0, EYE - 0.12 * k * k, -1 - 0.45 * k); pl.pitch = pl.tpitch = FLOOR_PITCH - 0.08 * k * k;
      if (pt >= 0.5) { phase = 'fall'; fallT = 0; pl.pos.z = Z_FALL; sound.start(); }
    } else if (phase === 'fall') {
      fallT += sdt;
      // ── the fall itself: gravity until full speed; then the speed is set by where the eye is — full between the scenes,
      //    easing down as a scene comes into view, very slow past it, and quickly full again (never a stop) ──
      if (!atSpeed) { vy = Math.min(V_MAX, vy + G * sdt); if (vy >= V_MAX) atSpeed = true; }
      else {
        let want = V_MAX;
        if (ni < n) {
          const d = pl.pos.y - passers[ni].eyeY;                             // above the scene: +, below: −
          want = d > SLOW.in ? V_MAX
            : d > SLOW.at ? V_MAX + (SLOW.v - V_MAX) * ease((SLOW.in - d) / (SLOW.in - SLOW.at))
            : d > SLOW.past ? SLOW.v
            : d > SLOW.out ? SLOW.v + (V_MAX - SLOW.v) * ease((SLOW.past - d) / (SLOW.past - SLOW.out))
            : V_MAX;
          if (d <= SLOW.out) { ni++; if (ni >= n) tailT = 0; }               // passed: the next one
        }
        vy += (want - vy) * (1 - Math.exp(-sdt / SLOW.tau));
      }
      pl.pos.y -= vy * sdt;
      if (tailT >= 0) tailT += sdt;
      const sp = vy / V_MAX;                                                 // how fast, 0..1
      const felt = Math.min(1, fallT / 1.2) * (HOLD_FELT + (1 - HOLD_FELT) * sp);   // how much of the fall the body feels: never less than HOLD_FELT once it has begun — a stop is a stop of the place, not of the body
      // ── the eyes between the scenes: ahead and a little down; nearing a scene, and stopped at it, they go to it ──
      const dn = ni < n ? pl.pos.y - passers[ni].eyeY : Infinity, near = dn < GLANCE && dn > GLANCE_END ? passers[ni] : null;
      const wantP = near ? Math.atan2(near.eyeY - 0.2 - pl.pos.y, AHEAD) : LOOK_SCENES, wantY = near ? Math.atan2(-near.x, AHEAD) * GLANCE_YAW : 0;
      const kg = 1 - Math.exp(-sdt / GLANCE_TAU); glanceP += (wantP - glanceP) * kg; glanceY += (wantY - glanceY) * kg;
      // ── the head: down at once (the model below the feet, far) → up (the scenes, in front) → down again after the last one ──
      const base = fallT < LOOK1.down ? FLOOR_PITCH
        : fallT < LOOK1.down + LOOK1.downS ? lerp(FLOOR_PITCH, LOOK_DOWN, (fallT - LOOK1.down) / LOOK1.downS)
        : fallT < LOOK1.hold ? LOOK_DOWN
        : fallT < LOOK1.hold + LOOK1.upS ? lerp(LOOK_DOWN, glanceP, (fallT - LOOK1.hold) / LOOK1.upS)
        : tailT < TAIL.headDown ? glanceP
        : lerp(glanceP, LOOK_DOWN, (tailT - TAIL.headDown) / HEAD_DOWN_S);
      const baseY = tailT < TAIL.headDown ? glanceY : glanceY * (1 - ease((tailT - TAIL.headDown) / HEAD_DOWN_S));
      // the fall is felt: the head shakes (quick, small, more with speed), tilts slowly, the body is jolted sideways
      const t = fallT;
      pl.pitch = pl.tpitch = base + Math.sin(t * 0.5) * 0.025 + (Math.sin(t * 7.3) + 0.6 * Math.sin(t * 11.7 + 1.3)) * SHAKE * felt;
      pl.yaw = pl.tyaw = baseY + Math.sin(t * 0.31) * 0.05 + (Math.sin(t * 6.1 + 0.7) + 0.5 * Math.sin(t * 9.9)) * SHAKE * felt;
      pl.roll = (Math.sin(t * 0.9) * SWAY_ROLL + (Math.sin(t * 5.3) + 0.5 * Math.sin(t * 8.1)) * SHAKE) * felt;
      pl.pos.x = Math.sin(t * 4.7) * SHAKE_X * felt + Math.sin(t * 0.7) * 0.3 * felt;
      // the air rushes up — and keeps rushing while the place is stopped, as if the body hung in it; the haze thickens; the wind blows with what is felt
      air.update(pl.pos, Math.max(vy, V_MAX * felt), vy, sdt, (0.35 + 0.65 * felt) * (tailT > TAIL.black + 0.3 ? 1 - ease((tailT - TAIL.black - 0.3) / 2.2) : 1));
      if (cosmos.clouds) cosmos.clouds.level = cloud0 + (CLOUD_FALL - cloud0) * felt;
      sound.level(0.35 + 0.65 * felt);
      // the scenes keep their own slow movement; their lines face the eye
      for (const p of passers) { p.thing.th.tick(T, dt); if (p.say) p.say.lookAt(pl.pos); }
      if (hidden && fallT > LOOK1.hold) {                                    // the head is coming up: a scene out of view is let be seen (it was there)
        projView.multiplyMatrices(cosmos.cam.projectionMatrix, cosmos.cam.matrixWorldInverse); frustum.setFromProjectionMatrix(projView);
        for (const p of passers) {
          if (p.shown) continue;
          sphere.center.copy(p.thing.wrap.position);
          if (!frustum.intersectsSphere(sphere)) { p.shown = true; hidden--; p.thing.wrap.visible = true; if (p.say) p.say.visible = true; }
        }
      }
      // ── the model: below the feet from the first moment of the fall, far; nearer the whole way down (the eye falls
      //    faster than it does) — at the ending's distance when the screen goes, and still coming under the dark. It turns as it falls. ──
      if (fallT > 1.0) {
        const k = Math.min(1.3, (EYE0 - pl.pos.y) / fallTotal), dist = distClose() * (MODEL_FROM + (1 - MODEL_FROM) * k);
        modelAt.copy(pl.pos).addScaledVector(downDir, dist);
        pivot.rotation.y += TUMBLE_Y * sdt; pivot.rotation.x += TUMBLE_X * sdt;
        fade = ease((fallT - 1.0) / 1.0);
      }
      // 261128: held down long enough, the rest of the fall is not shown — dark at once, the wind out, and on (nothing is jumped: the body goes on falling under the dark)
      if (!gone && !skipped && heldAt && fallT > 0.8 && performance.now() - heldAt > HOLD_SKIP * 1000) { skipped = true; gone = true; skipT = 0; canvas.classList.remove('on'); sound.fadeOut(1.6); hint(''); }
      if (!skipHinted && !skipped && tailT < 0 && fallT > LOOK1.hold + LOOK1.upS) { skipHinted = true; hint(cosmos.isTouch() ? (ko ? '화면을 길게 누르면 건너뜁니다' : 'press and hold the screen to skip') : (ko ? '아무 키나 길게 누르면 건너뜁니다' : 'hold any key to skip'), 6000); }
      if (skipT >= 0) { skipT += dt; if (skipT > SKIP_DARK) { alive = false; done(); } }
      if (tailT > TAIL.black && !gone) { gone = true; canvas.classList.remove('on'); }   // black (the canvas's own 2.6 s) — the fall goes on under it
      if (tailT > TAIL.black + 0.8) sound.fadeOut(2.4 / FAST);              // the wind goes only once the screen is dark
      if (tailT > TAIL.end) { alive = false; done(); }
    }
    thread.tick(T, pl.pos.distanceTo(modelAt), { open: 1, draw: 1, fade });
  }
  cosmos.setCine(tick);

  // ── the step is the walker's ──────────────────────────────────────────────
  await wait(1400);
  if (phase === 'stand') hint(cosmos.isTouch() ? (ko ? '화면을 누르면 문으로 한 발 내딛습니다' : 'tap to step toward the door') : (ko ? 'W 를 누르면 문으로 한 발 내딛습니다' : 'press W to step toward the door'), 14000);
  await new Promise((res) => {
    let to = 0;
    const go = (e) => {
      if (e && e.type === 'keydown' && !['KeyW', 'ArrowUp', 'Space', 'Enter'].includes(e.code)) return;
      window.removeEventListener('keydown', go); canvas.removeEventListener('pointerdown', go); clearTimeout(to);
      sound.prime(); res();
    };
    window.addEventListener('keydown', go); canvas.addEventListener('pointerdown', go);
    if (o.auto) to = setTimeout(go, 1200 / FAST);
  });
  hint('');
  cosmos.footstep(0.36);                                                     // the one weight there was
  phase = 'step'; pt = 0;

  await over;
  if (o.onDark) { try { o.onDark(); } catch (e) { console.error('[prologue] onDark', e); } }   // the screen is dark and still: heavy making-ready goes here (the map's renderer)
  window.removeEventListener('keydown', onKeyD); window.removeEventListener('keyup', onKeyU); window.removeEventListener('blur', onBlur);
  canvas.removeEventListener('pointerdown', onPtrD); window.removeEventListener('pointerup', onPtrU); window.removeEventListener('pointercancel', onPtrU);
  await (skipped ? new Promise((r) => setTimeout(r, AFTER_SKIP * 1000)) : wait(AFTER * 1000));   // black, silent: a breath before the first scene (a short one after a skip)
  // ── nothing of this stays ─────────────────────────────────────────────────
  for (const p of passers) unstand(p);
  thread.dispose(); if (pivot.parent) pivot.parent.remove(pivot);
  door.dispose(); air.dispose(); if (cosmos.clouds) cosmos.clouds.level = cloud0;
  sound.stop();
  cosmos.setCine(null); cosmos.setMode('held'); pl.roll = 0;
  cosmos.teleport(new THREE.Vector3(0, EYE, 0), 0, 0);
  return { whose: prev.whose, from: prev.from || null, scenes: n, seconds: +T.toFixed(1), skipped };   // from = the run whose walk was shown (261124: PROFILE counts it)

  // ── a scene, standing in its place down the fall ─────────────────────────
  function stand(p) {
    p.x = p.side * (SIDE + p.j * 1.0);
    const th = makeThing(run.memory.code, p.scene), wrap = new THREE.Group();
    th.g.position.y = -th.h / 2; wrap.add(th.g); wrap.position.set(p.x, p.eyeY - 0.2, Z_FALL - AHEAD);
    wrap.rotation.y = Math.atan2(-p.x, AHEAD) + (p.j - 0.5) * 0.5;          // turned to where the eye will be, a little askew
    wrap.visible = false; world.add(wrap);                                   // not seen while the head is down (see `hidden` above)
    p.thing = { wrap, th };
    const said = prev.said.get(p.scene.id);
    if (said) { const m = sayPlane(THREE, said); m.position.set(p.x + p.side * SAY_OUT, p.eyeY + 0.1, Z_FALL - AHEAD + 0.4); m.material.opacity = 0.95; m.renderOrder = 12; m.visible = false; world.add(m); p.say = m; }
  }
  function unstand(p) {
    if (p.thing) { world.remove(p.thing.wrap); p.thing = null; }            // a thing's lines share things.js's materials with the scenes to come: taken out of the world, not disposed
    if (p.say) { world.remove(p.say); p.say.geometry.dispose(); p.say.material.map.dispose(); p.say.material.dispose(); p.say = null; }
  }
}

/** The door, far off: the stage's own ASCII door (closed), standing on the floor, with a small light. */
function makeDoor(THREE, DOOR_H, at) {
  const dc = document.createElement('canvas'); drawAsciiDoor(dc, 0, { px: 30, tone: true });
  const tex = new THREE.CanvasTexture(dc); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_H * DOOR_ASPECT, DOOR_H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.position.set(at.x, at.y + DOOR_H / 2, at.z); m.renderOrder = 5;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xe6c99a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, sizeAttenuation: false }));
  glow.scale.set(0.05, 0.05, 1); glow.position.set(at.x, at.y + DOOR_H * 0.55, at.z); glow.renderOrder = 4;
  return {
    m, glow,
    set(o) { m.material.opacity = o; glow.material.opacity = 0.45 * o; },
    dispose() { if (m.parent) m.parent.remove(m); if (glow.parent) glow.parent.remove(glow); m.geometry.dispose(); m.material.dispose(); tex.dispose(); glow.material.dispose(); },
  };
}

/**
 * The air of the fall: fine specks in a box round the eye. The box follows the eye sideways but not down, so as the eye
 * falls they rush up past it; each is a short vertical streak whose length grows with the speed. Dim, additive, no fog.
 */
function makeStreaks(THREE) {
  const n = STREAKS, pos = new Float32Array(n * 6), col = new Float32Array(n * 6), p = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random, s = { dx: (r() - 0.5) * 2 * STREAK_X, y: (r() - 0.5) * 2 * STREAK_Y, dz: STREAK_Z[0] + r() * (STREAK_Z[1] - STREAK_Z[0]), b: 0.25 + r() * 0.75, l: 0.6 + r() * 0.8 };
    p.push(s); const c = s.b; col[i * 6] = c * 0.42; col[i * 6 + 1] = c * 0.47; col[i * 6 + 2] = c * 0.55; col[i * 6 + 3] = c * 0.12; col[i * 6 + 4] = c * 0.13; col[i * 6 + 5] = c * 0.16;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(g, mat); lines.frustumCulled = false; lines.renderOrder = 6;
  let y0 = null;
  return {
    lines,
    /** eye: the eye's place · vAir: how fast the air should pass (up) · vEye: how fast the eye is falling · dt · k: 0..1 how much is seen */
    update(eye, vAir, vEye, dt, k) {
      if (y0 == null) y0 = eye.y;
      const L = Math.max(0.08, Math.min(1.6, vAir * 0.045)), extra = Math.max(0, vAir - vEye) * dt;   // the air that passes beyond the eye's own fall (a stopped body still hangs in rushing air)
      for (let i = 0; i < n; i++) {
        const s = p[i]; s.y += extra;
        let y = y0 + s.y; while (y > eye.y + STREAK_Y) { s.y -= 2 * STREAK_Y; y -= 2 * STREAK_Y; } while (y < eye.y - STREAK_Y) { s.y += 2 * STREAK_Y; y += 2 * STREAK_Y; }
        const x = eye.x + s.dx, z = eye.z + s.dz, j = i * 6;
        pos[j] = x; pos[j + 1] = y; pos[j + 2] = z; pos[j + 3] = x; pos[j + 4] = y + L * s.l; pos[j + 5] = z;
      }
      g.attributes.position.needsUpdate = true; mat.opacity = 0.6 * Math.max(0, Math.min(1, k));
    },
    dispose() { if (lines.parent) lines.parent.remove(lines); g.dispose(); mat.dispose(); },
  };
}

/** One line someone said, as a plane of text: grey, italic — the ending's colour for someone who walked before. */
function sayPlane(THREE, text) {
  text = String(text).replace(/\s+/g, ' ').trim(); if (text.length > 64) text = text.slice(0, 63) + '…';
  const px = 48, c = document.createElement('canvas'), x = c.getContext('2d');
  x.font = 'italic 300 ' + px + 'px ' + FONT_STACK;
  const w = Math.ceil(x.measureText(text).width) + 24; c.width = Math.min(2048, w); c.height = Math.ceil(px * 1.6);
  x.font = 'italic 300 ' + px + 'px ' + FONT_STACK; x.fillStyle = '#8f8b99'; x.textBaseline = 'middle'; x.fillText(text, 12, c.height / 2);
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const hM = 0.62, wM = hM * (c.width / c.height);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.frustumCulled = false;
  return m;
}

/**
 * The last complete walk of this memory (run_journals, this stage, not practice), or the ledger alone.
 * @returns { whose: 'walker' | 'ledger', from: run_id of the walk shown (walker only), order: [scene] (first reached first), said: Map(scene id → one line), track: cosmos.track points }
 */
async function lastWalk(data, run) {
  const byOrder = new Map(run.scenes.map((s) => [Number(s.scene_order), s]));
  let j = null, from = null;
  try {
    const r = await data.client().from('run_journals').select('run_id, created_at, run_traces').eq('memory_id', run.memory.id).eq('input_form', data.STAGE_TAG).order('created_at', { ascending: false }).limit(40);
    if (r.error) throw r.error;
    const row = (r.data || []).find((x) => { const t = x.run_traces; return t && t.place === 'space_v1' && t.mode !== 'test' && Array.isArray(t.visit_order) && t.visit_order.length >= 2; });
    if (row) { j = row.run_traces; from = row.run_id || null; }
  } catch (e) { console.warn('[prologue] journals', e); }
  if (!j) {
    const order = run.scenes.slice().sort((a, b) => a.scene_order - b.scene_order);
    return { whose: 'ledger', order, said: new Map(), track: splineThrough(modelOf(run.acc, order, () => null)) };
  }
  const path = j.visit_order.map((n) => byOrder.get(Number(n))).filter(Boolean);
  const order = [], seen = new Set(); for (const s of path) if (!seen.has(s.id)) { seen.add(s.id); order.push(s); }
  const said = new Map(), reading = new Map();
  for (const r of (Array.isArray(j.scenes) ? j.scenes : [])) {
    const s = byOrder.get(Number(r.scene_order)); if (!s) continue;
    const t = (Array.isArray(r.turns) ? r.turns : []).map((x) => tidyLine(x && x.text)).find(Boolean);
    if (t && !said.has(s.id)) said.set(s.id, t);
    if (r.user_emotion && !reading.has(s.id)) reading.set(s.id, r.user_emotion);
  }
  let track = j.track ? unpackTrack(j.track) : null;
  if (!track || track.length < 2) track = splineThrough(modelOf(run.acc, path.length >= 2 ? path : order, (id) => reading.get(id) || null));
  return { whose: 'walker', from, order: order.length ? order : run.scenes.slice(), said, track };
}

/** A walker's model replayed along their path (topo.placeNext, their reading at each scene they left): the places of the path, in order. */
function modelOf(acc, path, readingOf) {
  const Q = new Map(), pts = []; let prev = null;
  for (const s of path) {
    if (!Q.has(s.id)) Q.set(s.id, prev ? placeNext(acc, Q, prev.id, s.id, readingOf(prev.id)).pos : [0, 0, 0]);
    pts.push(Q.get(s.id)); prev = s;
  }
  return pts;
}

/**
 * The air of the fall: one buffer, looped without a seam; a second gain follows the speed of the fall.
 * It cannot outlive the fall: a hidden tab (whose frames stop, and with them the fade) has it held and let go with
 * the page; the page going away stops it; and it stops itself after MAX_S whatever happens.
 */
const MAX_S = 150;
function fallSound() {
  let ctx = null, buf = null, src = null, gain = null, level = null, started = false, want = false, fading = false, stopped = false;
  const AC = window.AudioContext || window.webkitAudioContext;
  const ensure = () => { if (stopped) return null; if (!ctx && AC) { try { ctx = new AC(); } catch (_) { ctx = null; } } if (ctx && ctx.state === 'suspended' && !document.hidden) { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } return ctx; };
  const onVis = () => { if (!ctx || !started || stopped) return; const p = document.hidden ? ctx.suspend() : ctx.resume(); if (p && p.catch) p.catch(() => {}); };
  document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', stop);
  fetch(FALL_SOUND).then((r) => r.arrayBuffer()).then((ab) => { const c = ensure(); return c ? c.decodeAudioData(ab) : null; }).then((b) => { buf = b; if (want && !stopped) start(); }).catch(() => {});
  function start() {
    want = true; const c = ensure(); if (!c || !buf || started) return; started = true;
    src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    gain = c.createGain(); gain.gain.setValueAtTime(0.0001, c.currentTime); gain.gain.exponentialRampToValueAtTime(FALL_GAIN, c.currentTime + 1.2);
    level = c.createGain(); level.gain.setValueAtTime(0.35, c.currentTime);
    src.connect(level).connect(gain).connect(c.destination); src.start(); src.stop(c.currentTime + MAX_S);   // never longer than this, whatever happens to the frames
  }
  function setLevel(k) { if (level && ctx && !stopped) level.gain.setTargetAtTime(Math.max(0.05, Math.min(1, k)), ctx.currentTime, 0.25); }
  function fadeOut(sec) {
    if (!started || fading || stopped) return; fading = true;
    const now = ctx.currentTime; gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now); gain.gain.exponentialRampToValueAtTime(0.0001, now + sec);
    setTimeout(stop, sec * 1000 + 200);
  }
  function stop() {
    if (stopped) return; stopped = true; want = false;
    document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', stop);
    try { if (src) { src.stop(); src.disconnect(); } } catch (_) {} src = null;
    try { if (gain) gain.disconnect(); } catch (_) {} try { if (level) level.disconnect(); } catch (_) {}
    try { if (ctx) ctx.close(); } catch (_) {} ctx = null;
  }
  return { prime: ensure, start, level: setLevel, fadeOut, stop };
}

function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

/**
 * Space-play cosmos (2026-11-21) — the black place the scenes float in.
 *
 *   · black, with a thin cloud-fog (the terrain stage's cloud mix: two drifting noise layers + large lumps)
 *   · one line sculpture per scene (things.js), standing where the walker's own model puts it (topo.js)
 *   · the walker flies: no gravity, a heavy slow drift. A line is left under the feet and goes out behind them
 *   · after a scene, a way and a door written in the opening's letters. Near the way there is a pull;
 *     when the feet touch it there is weight, and footsteps. Past the door: the next scene
 *
 * Staging only. Nothing here measures or decides anything: where a scene goes and where a door leads
 * are given to it (main.js). Requires the three.js r128 global build (window.THREE).
 */
import { drawAsciiDoor, DOOR_ASPECT } from '../roomplay/asciidoor.js';
import { makeThing, glowTexture, C } from './things.js';

// staging values (free parameters — not definitions; tuned on screen)
const FOV = 58, EYE = 1.6;
const FLY = 8.5, FLY_TAU = 0.9;            // cruising speed and how slowly it is reached ("slow, wide, heavy")
const WALK = 1.9, STRIDE = 1.0;            // = the room stage's way (W12)
const DOOR_H = 2.3, END_HALF = 0.62, START_HALF = 1.05, EDGE_W = 0.15, FLOOR_TILE = 0.21, SEG = 64;
const DRAW_S = 3.0, REPEAT_DRAW_S = 1.5;
const PULL_R = 8, PULL_G = 15;            // the way's pull: from how far, and how strong at the way itself
const NEAR_R = 7.5;                        // how close to a thing before its text comes up
const FOG_D = 0.0052;
const TRAIL_LIFE = 7.0, TRAIL_N = 240, TRAIL_GLOW = 0.62;   // how long the line under the feet lasts · most samples kept in view · its brightest
const CLOUDS = 36, CLOUD_EXT = 175;
const AMBER = 'rgba(196,168,130,0.95)';
const FONT_STACK = '"Noto Serif KR", "Nanum Myeongjo", "AppleMyungjo", "Batang", serif';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const h01 = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

export function createCosmos(opts) {
  const THREE = window.THREE;
  if (!THREE) throw new Error('three.js r128 global build is required');
  const canvas = opts.canvas, cb = opts.on || {};
  const SPEED = opts.speed || 1;           // test runs only
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, FOG_D);
  const cam = new THREE.PerspectiveCamera(FOV, 1, 0.05, 3000);
  cam.rotation.order = 'YXZ';
  const world = new THREE.Group(); scene.add(world);
  const UP = new THREE.Vector3(0, 1, 0);
  const V = () => new THREE.Vector3();
  const T1 = V(), T2 = V(), T3 = V();

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // ── the walker ────────────────────────────────────────────────────────────
  // mode: 'held' (a text is up, or a cut) · 'fly' · 'walk' (on a way) · 'cine' (the ending moves the eye)
  const pl = { pos: V(), vel: V(), yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, mode: 'held', way: null, s: 0, bob: 0, stepAcc: 0, heading: 0, blend: 0, forward: false, walkUntil: 0, landed: 0 };
  const keys = new Set();
  let locked = false, wasLocked = false, drag = null, time = 0, last = 0, raf = 0, running = false;
  const fwd = (out) => out.set(-Math.sin(pl.yaw) * Math.cos(pl.pitch), Math.sin(pl.pitch), -Math.cos(pl.yaw) * Math.cos(pl.pitch));
  const feet = (out) => out.copy(pl.pos).addScaledVector(UP, -EYE);

  // ── text as a plane (typed, never faded in) ───────────────────────────────
  function wrapText(x, text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const w of para.split(' ')) {
        const tryL = line ? line + ' ' + w : w;
        if (line && x.measureText(tryL).width > maxW) { out.push(line); line = w; } else line = tryL;
      }
      if (line) out.push(line);
    }
    return out.length ? out : [''];
  }
  function textPlane(text, size, o) {
    const px = 64, c = document.createElement('canvas'), x = c.getContext('2d');
    const font = ((o && o.italic) ? 'italic ' : '') + '300 ' + px + 'px ' + FONT_STACK;
    x.font = font;
    const lines = wrapText(x, text, (o && o.wrap) || 1e9), lh = px * 1.5;
    const tw = Math.ceil(Math.max(...lines.map((l) => x.measureText(l).width))) + 28;
    c.width = Math.min(2048, tw); c.height = Math.ceil(lh * lines.length + px * 0.3);
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const hM = size * lines.length * 1.5 + size * 0.3, wM = hM * (c.width / c.height);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, color: (o && o.color) || 0xffffff }));
    m.userData.typed = { lines, total: lines.reduce((n, l) => n + l.length, 0), n: -1, c, x, font, tex, lh, px };
    writeText(m, o && o.whole ? 1e9 : 0);
    return m;
  }
  function writeText(m, n) {
    const t = m.userData.typed; n = clamp(Math.floor(n), 0, t.total);
    if (n === t.n) return; t.n = n;
    t.x.clearRect(0, 0, t.c.width, t.c.height);
    t.x.font = t.font; t.x.fillStyle = '#fff'; t.x.textBaseline = 'middle'; t.x.textAlign = 'center';
    let left = n;
    for (let i = 0; i < t.lines.length && left > 0; i++) {
      const s = t.lines[i].slice(0, left); left -= t.lines[i].length;
      // typed from the line's own left edge: the letters do not slide while they are written
      const full = t.x.measureText(t.lines[i]).width, part = t.x.measureText(s).width;
      t.x.fillText(s, t.c.width / 2 - full / 2 + part / 2, t.px * 0.15 + t.lh * (i + 0.5));
    }
    t.tex.needsUpdate = true;
  }

  // ── things ────────────────────────────────────────────────────────────────
  const things = new Map();                // scene id → { id, scene, pos, wrap, thing, glint, words:[], facing, near }
  function placeThing(sceneRec, pos, toward) {
    if (things.has(sceneRec.id)) return things.get(sceneRec.id);
    const th = makeThing(opts.memoryCode, sceneRec), wrap = new THREE.Group();
    th.g.position.y = -th.h / 2;                                       // floats round its own middle
    wrap.add(th.g); wrap.position.copy(pos);
    const facing = toward ? Math.atan2(toward.x - pos.x, toward.z - pos.z) : h01(sceneRec.id + 'f') * 6.28;
    wrap.rotation.y = facing;
    world.add(wrap);
    // far away a scene is a small light with its figure inside it
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xcfd8e6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, sizeAttenuation: false }));
    glint.scale.set(0.02, 0.02, 1); glint.position.copy(pos); world.add(glint);
    const rec = { id: sceneRec.id, scene: sceneRec, pos: pos.clone(), wrap, thing: th, glint, words: [], facing, armed: true, ph: h01(sceneRec.id + 'p') * 6.28 };
    things.set(sceneRec.id, rec);
    return rec;
  }
  function setAsked(id, on) { const r = things.get(id); if (r) r.thing.setAsked(on); }

  // faint threads between scenes the walker crossed (the model, not the walker's line)
  const threads = [];
  const threadMat = new THREE.LineBasicMaterial({ color: 0x8b97a6, transparent: true, opacity: 0.11, fog: false, depthWrite: false });
  function link(aId, bId) {
    const a = things.get(aId), b = things.get(bId); if (!a || !b || aId === bId) return;
    if (threads.some((t) => (t.a === aId && t.b === bId) || (t.a === bId && t.b === aId))) return;
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.pos, b.pos]), threadMat); l.frustumCulled = false;
    world.add(l); threads.push({ a: aId, b: bId, l });
  }

  // ── words afloat round a thing ────────────────────────────────────────────
  /** @param items [{ key, text, kind:'echo'|'ghost'|'mine' }] — typed where they hang, then they drift: slow, wide, heavy */
  function addWords(id, items) {
    const r = things.get(id); if (!r) return;
    for (const it of items) {
      if (!it || !String(it.text || '').trim() || r.words.some((w) => w.key === it.key)) continue;
      const kind = it.kind || 'echo', key = it.key || (kind + r.words.length);
      const m = textPlane(String(it.text).trim(), kind === 'ghost' ? 0.27 : kind === 'mine' ? 0.3 : 0.33,
        { italic: kind === 'ghost', wrap: kind === 'ghost' ? 620 : 900, color: kind === 'mine' ? C.amber : kind === 'ghost' ? 0x8a8794 : 0xa9a6b4 });
      const a = h01(id + key + 'a') * Math.PI * 2, el = (h01(id + key + 'e') - 0.5) * 1.5, rad = 5.2 + h01(id + key + 'r') * 6.5;
      const w = { key, kind, m, base: V().set(Math.cos(a) * Math.cos(el) * rad, Math.sin(el) * rad * 0.8, Math.sin(a) * Math.cos(el) * rad),
        px: h01(key + 'px') * 6.28, py: h01(key + 'py') * 6.28, tx: 58 + h01(key + 'tx') * 46, ty: 74 + h01(key + 'ty') * 52, amp: 1.1 + h01(key + 'am') * 1.5,
        o: kind === 'mine' ? 0.72 : kind === 'ghost' ? 0.42 : 0.5, lean: 1, born: time };
      m.material.opacity = w.o; m.renderOrder = 6;
      world.add(m); r.words.push(w);
    }
  }
  /** Earlier lines nearer to what the walker said come closer and stand out; the others recede. fn(key) → 0..1 */
  function leanWords(id, fn) { const r = things.get(id); if (!r) return; for (const w of r.words) if (w.kind === 'ghost') w.lean = 0.55 + 0.9 * clamp(fn(w.key), 0, 1); }

  // ── the cloud-fog ─────────────────────────────────────────────────────────
  const clouds = (() => {
    // a tileable noise (value noise, four octaves)
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const x = cv.getContext('2d'), img = x.createImageData(N, N);
    const lat = (p, seed) => { const g = new Float32Array(p * p); let s = seed; for (let i = 0; i < g.length; i++) { s = (s * 16807) % 2147483647; g[i] = s / 2147483647; } return g; };
    const octs = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]].map(([p, w], i) => ({ p, w, g: lat(p, 7919 + i * 131) }));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let v = 0;
      for (const o of octs) {
        const fx = (i / N) * o.p, fy = (j / N) * o.p, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (x0 + 1) % o.p, y1 = (y0 + 1) % o.p;
        const a = o.g[y0 * o.p + x0], b = o.g[y0 * o.p + x1], c = o.g[y1 * o.p + x0], d = o.g[y1 * o.p + x1];
        v += o.w * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
      const k = (j * N + i) * 4, q = Math.round(clamp(v, 0, 1) * 255); img.data[k] = img.data[k + 1] = img.data[k + 2] = q; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearFilter;
    const uTime = { value: 0 }, list = [];
    // far away, the same pattern lies all round, very thin: wherever the eye turns the black is not quite empty
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
      uniforms: { tNoise: { value: tex }, uTime, uLevel: { value: 0.055 }, uColor: { value: new THREE.Color(0x6c7f95) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec3 vDir; uniform sampler2D tNoise; uniform float uTime; uniform float uLevel; uniform vec3 uColor;',
        'float lay(vec3 d, vec3 w, float sc, vec2 dr){ return w.x * texture2D(tNoise, d.yz * sc + dr).r + w.y * texture2D(tNoise, d.xz * sc + dr + 0.31).r + w.z * texture2D(tNoise, d.xy * sc + dr + 0.67).r; }',
        'void main(){',
        '  vec3 d = normalize(vDir); vec3 w = pow(abs(d), vec3(4.0)); w /= (w.x + w.y + w.z);',
        '  float n0 = lay(d, w, 0.21, vec2(0.13, 0.57));',
        '  float mw  = lay(d + (n0 - 0.5) * 0.35, w, 0.50, vec2(uTime * 0.0040, uTime * 0.0017));',
        '  float mw2 = lay(d + (n0 - 0.5) * 0.35, w, 1.55, vec2(-uTime * 0.0060, uTime * 0.0034));',
        '  float mott = 0.55 + mw * 0.75 + mw2 * 0.28;',
        '  float dn = smoothstep(0.93, 1.33, mott);',
        '  float dz = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;',   // a grain finer than one step of brightness: no bands in the dark
        '  gl_FragColor = vec4(max(vec3(0.0), uColor * dn * uLevel + dz), 1.0);',
        '}'].join('\n'),
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, transparent: true, blending: THREE.AdditiveBlending,
    }));
    dome.frustumCulled = false; dome.renderOrder = -5; scene.add(dome);
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < CLOUDS; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { tNoise: { value: tex }, uTime, uSeed: { value: new THREE.Vector2(h01('cs' + i), h01('ct' + i)) }, uFade: { value: 0 }, uColor: { value: new THREE.Color(0x66788c) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'varying vec2 vUv; uniform sampler2D tNoise; uniform float uTime; uniform vec2 uSeed; uniform float uFade; uniform vec3 uColor;',
          'void main(){',
          // a large slow lump first: it bends the pattern and breaks the round outline, so a cloud is a torn sheet, not a disc
          '  float n0 = texture2D(tNoise, vUv * 0.31 + uSeed).r;',
          '  float n1 = texture2D(tNoise, vUv * 0.31 + uSeed.yx + 0.37).r;',
          '  vec2 q = vUv + (vec2(n0, n1) - 0.5) * 0.42;',
          '  float r = length(vUv - 0.5) * 2.0 + (n0 - 0.5) * 0.9;',
          '  float edge = smoothstep(1.0, 0.2, r);',
          // two layers of cloud pattern drifting at different speeds + large lumps (the terrain stage's fog mottle: 0.55 + mw*0.75 + mw2*0.28)
          '  float mw  = texture2D(tNoise, q * 0.62 + uSeed + vec2(uTime * 0.0060, uTime * 0.0025)).r;',
          '  float mw2 = texture2D(tNoise, q * 1.90 + uSeed.yx + vec2(-uTime * 0.0090, uTime * 0.0050)).r;',
          '  float mott = 0.55 + mw * 0.75 + mw2 * 0.28;',
          '  float d = edge * smoothstep(0.90, 1.34, mott);',
          '  float dz = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;',
          '  gl_FragColor = vec4(max(vec3(0.0), uColor * d * uFade + dz * step(0.004, d * uFade)), 1.0);',
          '}'].join('\n'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      });
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 1;
      const size = 110 + h01('cz' + i) * 140;
      m.scale.set(size, size * (0.42 + 0.3 * h01('cy' + i)), 1);
      scene.add(m);
      list.push({ m, mat, size, base: V().set((h01('cx' + i) - 0.5) * 2 * CLOUD_EXT, (h01('cv' + i) - 0.5) * 2 * CLOUD_EXT * 0.6, (h01('cw' + i) - 0.5) * 2 * CLOUD_EXT), o: 0.06 + 0.07 * h01('co' + i), dx: (h01('cd' + i) - 0.5) * 0.7, dz: (h01('ce' + i) - 0.5) * 0.7 });
    }
    const wrapAx = (v, ext) => ((((v + ext) % (2 * ext)) + 2 * ext) % (2 * ext)) - ext;
    return {
      level: 1, dome,
      tick(dt) {
        uTime.value += dt;
        dome.position.copy(cam.position); dome.material.uniforms.uLevel.value = 0.055 * this.level;
        for (const c of list) {
          c.base.x += c.dx * dt; c.base.z += c.dz * dt;
          const rx = wrapAx(c.base.x - cam.position.x, CLOUD_EXT), ry = wrapAx(c.base.y - cam.position.y, CLOUD_EXT * 0.6), rz = wrapAx(c.base.z - cam.position.z, CLOUD_EXT);
          c.m.position.set(cam.position.x + rx, cam.position.y + ry, cam.position.z + rz);
          c.m.quaternion.copy(cam.quaternion);
          const d = Math.hypot(rx, ry, rz);
          c.mat.uniforms.uFade.value = c.o * this.level * smooth(16, 72, d) * (1 - smooth(CLOUD_EXT * 0.62, CLOUD_EXT * 0.97, d));   // none close to the eye (no white-out), none at the field's edge (no popping)
        }
      },
    };
  })();

  // ── the line left under the feet ──────────────────────────────────────────
  // Two records. `track` keeps every sample of the whole walk (the ending draws it). What is seen in the walk is
  // only its last seconds, as one hair-thin line: nothing under the feet themselves (it comes up a moment
  // behind them), brightest just behind, gone by its tail. A line, not a band: a band lay like a road and was
  // the first thing the eye saw (seen and thrown out, 261121).
  const track = [];                         // { x, y, z, t, k }  k: 0 flying · 1 walking on a way · 2 carried through a door
  const trail = (() => {
    const pos = new Float32Array(TRAIL_N * 3), col = new Float32Array(TRAIL_N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setDrawRange(0, 0);
    const m = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.frustumCulled = false; m.renderOrder = 4; world.add(m);
    const amber = new THREE.Color(C.amber), recent = [];
    let lastT = -1;
    return {
      sample(k) {
        const f = feet(T1), L = track[track.length - 1];
        if (L && L.k === k && Math.hypot(f.x - L.x, f.y - L.y, f.z - L.z) < 0.3 && time - lastT < 0.4) return;
        if (L && L.k === k && Math.hypot(f.x - L.x, f.y - L.y, f.z - L.z) < 0.02) return;
        lastT = time;
        const p = { x: f.x, y: f.y, z: f.z, t: time, k }; track.push(p); recent.push(p);
        while (recent.length > TRAIL_N - 1) recent.shift();
      },
      cut() { recent.length = 0; },
      tick() {
        while (recent.length && time - recent[0].t > TRAIL_LIFE) recent.shift();
        const pts = recent.filter((p) => p.k === 0), n = pts.length;
        if (pl.mode !== 'fly' || n < 2) { g.setDrawRange(0, 0); return; }
        for (let i = 0; i < n; i++) {
          const p = pts[i], sec = time - p.t, age = clamp(sec / TRAIL_LIFE, 0, 1);
          const k = TRAIL_GLOW * smooth(0.35, 1.3, sec) * Math.pow(1 - age, 1.5);   // nothing at the feet, most a second behind, none at the tail
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          col[i * 3] = amber.r * k; col[i * 3 + 1] = amber.g * k; col[i * 3 + 2] = amber.b * k;
        }
        g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.setDrawRange(0, n);
      },
      mesh: m,
    };
  })();

  // ── ways and doors ────────────────────────────────────────────────────────
  const tiles = {};
  function tile(ch, color) {
    const key = ch + color; if (tiles[key]) return tiles[key];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.font = '64px "SFMono-Regular", Menlo, Consolas, "Courier New", monospace';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color;
    x.translate(32, 32); x.scale(1 / 0.6, 1); x.fillText(ch, 0, 2);      // a cell is 0.6 wide: stretched to the square so neighbours join
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return (tiles[key] = t);
  }
  function strip(a, b, mat, lift, uv, shade) {
    const n = a.length, pos = new Float32Array(n * 6), tex = new Float32Array(n * 4), col = shade ? new Float32Array(n * 6) : null, idx = [];
    for (let i = 0; i < n; i++) {
      pos.set([a[i].x, a[i].y + lift, a[i].z, b[i].x, b[i].y + lift, b[i].z], i * 6);
      const q = uv(i); tex.set([q.u, q.va, q.u, q.vb], i * 4);
      if (col) { const k = shade(i / (n - 1)); col.set([k, k, k, k, k, k], i * 6); }
      if (i < n - 1) { const p = i * 2; idx.push(p, p + 1, p + 3, p, p + 3, p + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(tex, 2));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3;
    return m;
  }
  const steps = (() => {                    // the same sample the room stage's way uses (three steps in one file)
    let ctx = null, buf = null, n = 0;
    function ensure() {
      if (ctx) { if (ctx.state !== 'running') { try { ctx.resume(); } catch (_) {} } return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        fetch('sounds/footstep_on_dirt.mp3').then((r) => r.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab)).then((b) => { buf = b; }).catch(() => {});
      } catch (_) {}
    }
    function play(vol) {
      if (!ctx || !buf) return;
      const third = buf.duration / 3, k = n % 3, rate = [0.95, 1.02, 0.98, 1.05, 1.0][n % 5]; n++;
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
      const g = ctx.createGain(), now = ctx.currentTime, dur = Math.max(0.08, third / rate * 0.95);
      g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(vol || 0.30, now + 0.008); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(g); g.connect(ctx.destination); src.start(now, k * third, dur + 0.02);
    }
    return { ensure, play, count: () => n };
  })();

  const ways = [];
  let drawnOnce = false;
  function doorMesh(at, e, open) {
    const dc = document.createElement('canvas'); drawAsciiDoor(dc, open || 0, { px: 30, tone: true });
    const tex = new THREE.CanvasTexture(dc); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_H * DOOR_ASPECT, DOOR_H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.set(at.x, at.y + DOOR_H / 2, at.z); m.rotation.y = Math.atan2(-e.x, -e.z); m.renderOrder = 5;
    m.userData = { open: open || 0, target: open || 0, drawn: open || 0, canvas: dc, tex };
    world.add(m);
    return m;
  }
  function redrawDoor(d, dt) {
    const u = d.userData;
    u.open += (u.target - u.open) * (1 - Math.exp(-dt / 0.9));
    const q = Math.round(u.open * 24) / 24;
    if (q !== u.drawn) { u.drawn = q; drawAsciiDoor(u.canvas, q, { px: 30, tone: true }); u.tex.needsUpdate = true; }
  }
  /**
   * A way written to a door. The door's place is given and is never moved; the way goes to it.
   * @param o { door: Vector3 (the foot of the door), dir: Vector3 (the way goes through the door along this), start?: Vector3, startDir?: Vector3, key, kind:'door'|'back' }
   * @returns way { passed: Promise, ... }
   */
  function openWay(o) {
    const e = V().set(o.dir.x, 0, o.dir.z); if (e.lengthSq() < 1e-6) e.set(0, 0, -1); e.normalize();
    const side = V().set(-e.z, 0, e.x), sgn = h01(o.key + 's') < 0.5 ? -1 : 1, D = o.door.clone();
    const N = o.start ? o.start.clone() : D.clone().addScaledVector(e, -9.5).addScaledVector(side, sgn * 3.4).setY(D.y + (h01(o.key + 'y') - 0.5) * 1.6);
    const u0 = o.startDir ? V().set(o.startDir.x, 0, o.startDir.z).normalize() : e.clone().addScaledVector(side, sgn * 0.55).normalize();
    const L = D.distanceTo(N);
    const curve = new THREE.CubicBezierCurve3(N, N.clone().addScaledVector(u0, L * 0.45), D.clone().addScaledVector(e, -L * 0.3), D);
    const pts = curve.getSpacedPoints(SEG), tan = [], along = [0], left = [], right = [], eL = [], eR = [], hws = [], rail = [];
    for (let i = 0; i <= SEG; i++) {
      const t3 = curve.getTangentAt(i / SEG), t = V().set(t3.x, 0, t3.z).normalize();
      tan.push(t);
      if (i > 0) along.push(along[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const r = V().set(-t.z, 0, t.x), hw = START_HALF + (END_HALF - START_HALF) * smooth(0, 1, i / SEG); hws.push(hw);
      left.push(pts[i].clone().addScaledVector(r, -hw)); right.push(pts[i].clone().addScaledVector(r, hw));
      eL.push(pts[i].clone().addScaledVector(r, -hw - EDGE_W)); eR.push(pts[i].clone().addScaledVector(r, hw + EDGE_W));
      rail.push({ p: pts[i], t, s: along[i], hw });
    }
    const floorMat = new THREE.MeshBasicMaterial({ map: tile('░', 'rgba(226,214,196,1)'), vertexColors: true, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const edgeMat = new THREE.MeshBasicMaterial({ map: tile('═', AMBER), transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const floor = strip(left, right, floorMat, 0, (i) => ({ u: along[i] / FLOOR_TILE, va: 0.5 - hws[i] / FLOOR_TILE, vb: 0.5 + hws[i] / FLOOR_TILE }), (u) => 0.55 + 0.45 * u);   // brighter toward the door
    const edges = [strip(eL, left, edgeMat, 0.012, (i) => ({ u: along[i] / EDGE_W, va: 0, vb: 1 })), strip(right, eR, edgeMat, 0.012, (i) => ({ u: along[i] / EDGE_W, va: 0, vb: 1 }))];
    floor.geometry.setDrawRange(0, 0); edges.forEach((m) => m.geometry.setDrawRange(0, 0));
    world.add(floor, edges[0], edges[1]);
    const door = doorMesh(D, e, 0);
    const w = { key: o.key, kind: o.kind || 'door', to: o.to, from: o.from, rail, total: along[SEG], e, D, N, floor, floorMat, edgeMat, edges, door, t0: time, drawS: drawnOnce ? REPEAT_DRAW_S : DRAW_S,
      ready: false, live: true, uses: 0, resolve: null, onPass: o.onPass || null };
    w.passed = new Promise((res) => { w.resolve = res; });
    ways.push(w);
    return w;
  }
  /** Beyond a door: a few steps of floor that give out. At their end the weight lets go. */
  function openStub(o) {
    const e = V().set(o.dir.x, 0, o.dir.z); if (e.lengthSq() < 1e-6) e.set(0, 0, -1); e.normalize();
    const r = V().set(-e.z, 0, e.x), LEN = 4.6, n = 12, left = [], right = [], eL = [], eR = [], rail = [], along = [];
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * LEN, p = o.at.clone().addScaledVector(e, s), hw = END_HALF + 0.3 * (i / n);
      along.push(s); rail.push({ p, t: e, s, hw });
      left.push(p.clone().addScaledVector(r, -hw)); right.push(p.clone().addScaledVector(r, hw));
      eL.push(p.clone().addScaledVector(r, -hw - EDGE_W)); eR.push(p.clone().addScaledVector(r, hw + EDGE_W));
    }
    const fade = (u) => 1 - smooth(0.25, 1, u);
    const floorMat = new THREE.MeshBasicMaterial({ map: tile('░', 'rgba(226,214,196,1)'), vertexColors: true, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const edgeMat = new THREE.MeshBasicMaterial({ map: tile('═', AMBER), vertexColors: true, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const hwAt = (i) => END_HALF + 0.3 * (i / n);
    const floor = strip(left, right, floorMat, 0, (i) => ({ u: along[i] / FLOOR_TILE, va: 0.5 - hwAt(i) / FLOOR_TILE, vb: 0.5 + hwAt(i) / FLOOR_TILE }), fade);
    const edges = [strip(eL, left, edgeMat, 0.012, (i) => ({ u: along[i] / EDGE_W, va: 0, vb: 1 }), fade), strip(right, eR, edgeMat, 0.012, (i) => ({ u: along[i] / EDGE_W, va: 0, vb: 1 }), fade)];
    world.add(floor, edges[0], edges[1]);
    const door = doorMesh(o.at, e, 1); door.material.opacity = 1; door.userData.target = 0;      // it stands open behind the walker, and closes
    const w = { key: o.key, kind: 'stub', rail, total: LEN, e, D: o.at.clone(), floor, floorMat, edgeMat, edges, door, t0: time, ready: true, live: true, resolve: null, gone: 0 };
    w.released = new Promise((res) => { w.resolve = res; });
    ways.push(w);
    return w;
  }
  function removeWay(w) {
    const i = ways.indexOf(w); if (i >= 0) ways.splice(i, 1);
    for (const m of [w.floor, w.edges[0], w.edges[1], w.door]) { world.remove(m); m.geometry.dispose(); }
    w.floorMat.dispose(); w.edgeMat.dispose(); w.door.material.map.dispose(); w.door.material.dispose();
    w.live = false;
  }
  function railAt(w, s) {
    const r = w.rail; let i = 1; while (i < r.length - 1 && r[i].s < s) i++;
    const a = r[i - 1], b = r[i], k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0, kc = clamp(k, 0, 1);
    return { x: a.p.x + (b.p.x - a.p.x) * k, y: a.p.y + (b.p.y - a.p.y) * kc, z: a.p.z + (b.p.z - a.p.z) * k, tx: a.t.x + (b.t.x - a.t.x) * kc, tz: a.t.z + (b.t.z - a.t.z) * kc, hw: a.hw + (b.hw - a.hw) * kc };
  }
  function nearestOnRail(w, p) {
    let best = null, bd = Infinity;
    for (let i = 1; i < w.rail.length; i++) {
      const a = w.rail[i - 1], b = w.rail[i], ax = b.p.x - a.p.x, ay = b.p.y - a.p.y, az = b.p.z - a.p.z, L2 = ax * ax + ay * ay + az * az;
      const k = L2 > 0 ? clamp(((p.x - a.p.x) * ax + (p.y - a.p.y) * ay + (p.z - a.p.z) * az) / L2, 0, 1) : 0;
      const x = a.p.x + ax * k, y = a.p.y + ay * k, z = a.p.z + az * k, d = Math.hypot(p.x - x, p.y - y, p.z - z);
      if (d < bd) { bd = d; best = { x, y, z, s: a.s + (b.s - a.s) * k, d, hw: a.hw + (b.hw - a.hw) * k }; }
    }
    return best;
  }
  function land(w, s) {
    pl.mode = 'walk'; pl.way = w; pl.s = s; pl.vel.set(0, 0, 0); pl.stepAcc = 0; pl.bob = 0; pl.landed = time; pl.blend = 1;
    const q = railAt(w, s); pl.heading = Math.atan2(-q.tx, -q.tz);
    steps.ensure(); steps.play(0.36);                                    // the first weight: one step
    if (cb.onLand) cb.onLand(w);
  }

  // ── the frame ─────────────────────────────────────────────────────────────
  let lookTween = null, moveTween = null, pullNow = 0, cineFn = null;
  function update(dt) {
    time += dt;
    const sdt = dt * SPEED;
    // the head: late and heavy
    const er = 1 - Math.exp(-dt / 0.07);
    if (lookTween) {
      const k = clamp((time - lookTween.t0) / lookTween.dur, 0, 1), e = k * k * (3 - 2 * k);
      pl.tyaw = lookTween.y0 + lookTween.dy * e; pl.tpitch = lookTween.p0 + (lookTween.p1 - lookTween.p0) * e;
      if (k >= 1) { const r = lookTween.res; lookTween = null; r(); }
    }
    pl.yaw += (pl.tyaw - pl.yaw) * er; pl.pitch += (pl.tpitch - pl.pitch) * er;
    if (pl.mode === 'cine' && cineFn) cineFn(dt, time);                    // the ending moves the eye itself (sets pl.pos / pl.yaw / pl.pitch)

    pullNow = 0;
    if (pl.mode === 'fly') {
      const f = fwd(T1), want = T2.set(0, 0, 0);
      const ws = (keys.has('KeyW') || keys.has('ArrowUp') || pl.forward || time < pl.walkUntil ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const ad = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const ud = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0);
      want.addScaledVector(f, ws); want.x += Math.cos(pl.yaw) * ad; want.z += -Math.sin(pl.yaw) * ad; want.y += ud;
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(FLY);
      pl.vel.addScaledVector(T3.copy(want).sub(pl.vel), 1 - Math.exp(-sdt / FLY_TAU));
      // the pull of a way: the nearer the feet, the more weight; on touching it, the walker stands
      const ft = feet(T1); let cw = null, cn = null;
      for (const w of ways) {
        if (!w.live || !w.ready || w.kind === 'stub') continue;
        const n = nearestOnRail(w, ft);
        if (n && n.d < PULL_R && (!cn || n.d < cn.d)) { cn = n; cw = w; }
      }
      if (cw) {
        const k = 1 - cn.d / PULL_R; pullNow = k;
        T2.set(cn.x - ft.x, cn.y - ft.y, cn.z - ft.z); const l = T2.length() || 1e-6;
        pl.vel.addScaledVector(T2, (PULL_G * k * k * sdt) / l);
        pl.vel.multiplyScalar(1 - 0.9 * k * k * Math.min(1, sdt * 2));     // it does not swing round the way: the weight settles
        if (cn.d < 0.34 && cn.s < cw.total - 0.4) land(cw, cn.s);
      }
      if (pl.mode === 'fly') { pl.pos.addScaledVector(pl.vel, sdt); trail.sample(0); }
    }
    if (pl.mode === 'walk') {
      const w = pl.way, stub = w.kind === 'stub';
      const go = keys.has('KeyW') || keys.has('ArrowUp') || pl.forward || time < pl.walkUntil;
      let moved = 0;
      if (go) {
        const limit = stub ? w.total + 0.2 : (w.door.userData.open >= 0.6 ? w.total + 0.9 : w.total - 0.6);
        const ns = Math.min(limit, pl.s + WALK * sdt); moved = Math.max(0, ns - pl.s); pl.s = Math.max(pl.s, ns);
      }
      if (moved > 1e-5) { pl.bob += moved * (2 * Math.PI / STRIDE); pl.stepAcc += moved; if (pl.stepAcc >= STRIDE) { pl.stepAcc -= STRIDE; steps.play(0.30); } }
      const q = railAt(w, pl.s), hd = Math.atan2(-q.tx, -q.tz);
      let dh = hd - pl.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); pl.heading = hd;
      pl.tyaw += dh; pl.yaw += dh;                                         // the way turns the walker with it; the look stays theirs
      if (pl.blend > 0) {                                                  // on landing the eyes come round to the way, once
        let d = hd - pl.tyaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        const k = 1 - Math.exp(-dt / 0.55); pl.tyaw += d * k; pl.tpitch += (0 - pl.tpitch) * k; pl.blend -= dt / 1.6;
      }
      const tp = T1.set(q.x, q.y + EYE + Math.sin(pl.bob) * 0.012, q.z);
      pl.pos.lerp(tp, 1 - Math.exp(-dt / 0.12));
      trail.sample(1);
      if (!stub) {
        if (w.total - pl.s < 2.2) w.door.userData.target = 1;
        if (pl.s >= w.total + 0.6) { w.uses++; const r = w.resolve; w.passed = new Promise((res) => { w.resolve = res; }); pl.mode = 'held'; pl.way = null; w.door.userData.target = 0; if (r) r(w); if (w.onPass) w.onPass(w); }
      } else if (pl.s >= w.total) {
        pl.mode = 'fly'; pl.way = null; pl.vel.set(w.e.x * 1.5, 0.22, w.e.z * 1.5);   // the floor gives out: no weight again
        w.gone = time; const r = w.resolve; w.resolve = null; if (r) r(w);
        if (cb.onRelease) cb.onRelease(w);
      }
    }
    if (pl.mode === 'held') {
      if (moveTween) {
        const k = clamp((time - moveTween.t0) / moveTween.dur, 0, 1), e = k * k * (3 - 2 * k);
        pl.pos.lerpVectors(moveTween.from, moveTween.to, e); pl.vel.set(0, 0, 0);
        if (k >= 1) { const r = moveTween.res; moveTween = null; r(); }
      } else { pl.vel.multiplyScalar(Math.exp(-dt / 0.6)); pl.pos.addScaledVector(pl.vel, dt); }
    }

    cam.position.copy(pl.pos); cam.rotation.set(pl.pitch, pl.yaw, 0); cam.updateMatrixWorld();

    // ways are written out toward their doors; doors open and close
    for (const w of ways.slice()) {
      redrawDoor(w.door, dt);
      if (w.kind === 'stub') {
        if (w.gone && time - w.gone > 2.5) { const k = 1 - smooth(2.5, 7, time - w.gone); w.floorMat.opacity = 0.78 * k; w.edgeMat.opacity = 0.95 * k; w.door.material.opacity = k; if (k <= 0) removeWay(w); }
        continue;
      }
      const age = (time - w.t0) * SPEED;
      w.door.material.opacity = Math.min(1, age / 1.2) * (w.uses && pl.way !== w ? 0.62 : 1);
      w.edges.forEach((m) => m.geometry.setDrawRange(0, Math.floor(smooth(0, w.drawS, age) * SEG) * 6));
      w.floor.geometry.setDrawRange(0, Math.floor(smooth(w.drawS * 0.5, w.drawS, age) * SEG) * 6);
      if (!w.ready && age >= w.drawS) { w.ready = true; drawnOnce = true; if (cb.onWayReady) cb.onWayReady(w); }
    }

    // things: their own slow movement; far away they are small lights
    let nearest = null, nd = Infinity;
    for (const r of things.values()) {
      r.thing.tick(time, dt);
      r.wrap.rotation.y = r.facing + 0.22 * Math.sin(time * 0.045 + r.ph);
      r.wrap.position.y = r.pos.y + 0.16 * Math.sin(time * 0.21 + r.ph);
      const d = r.pos.distanceTo(pl.pos);
      r.glint.material.opacity = 0.5 * smooth(30, 90, d);
      if (d < nd) { nd = d; nearest = r; }
      if (d > NEAR_R * 1.7) r.armed = true;
      for (const w of r.words) {
        const t = time, k = w.lean;
        w.m.position.set(r.pos.x + w.base.x / k + w.amp * Math.sin((2 * Math.PI * t) / w.tx + w.px), r.pos.y + w.base.y / k + w.amp * 0.6 * Math.sin((2 * Math.PI * t) / w.ty + w.py), r.pos.z + w.base.z / k + w.amp * Math.cos((2 * Math.PI * t) / (w.tx * 1.3) + w.py));
        w.m.quaternion.copy(cam.quaternion);
        writeText(w.m, (time - w.born) / 0.055);
        const dw = w.m.position.distanceTo(pl.pos);
        w.m.material.opacity = w.o * Math.min(1.25, 0.6 + 0.5 * k) * smooth(2.6, 7.5, dw) * (1 - smooth(34, 60, dw));   // a word that drifts up to the eye goes out before it fills the view
      }
    }
    if (nearest && nd < NEAR_R && nearest.armed && pl.mode === 'fly') { nearest.armed = false; if (cb.onNear) cb.onNear(nearest.id, nd); }
    clouds.tick(dt);
    trail.tick();
    if (cb.onFrame) cb.onFrame(dt, time);
    renderer.render(scene, cam);
  }
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    update(dt);
  }

  // ── input ─────────────────────────────────────────────────────────────────
  const canMove = () => pl.mode === 'fly' || pl.mode === 'walk';
  const turn = (dx, dy, k) => { if (!canMove() || lookTween) return; pl.tyaw -= dx * k; pl.tpitch = clamp(pl.tpitch - dy * k, -1.45, 1.45); };
  window.addEventListener('keydown', (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { keys.add(e.code); if (canMove()) { e.preventDefault(); steps.ensure(); } }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('click', () => { if (canMove() && !locked && !isTouch() && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (_) {} } });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (cb.onLock) cb.onLock(locked); });
  document.addEventListener('mousemove', (e) => { if (locked) turn(e.movementX || 0, e.movementY || 0, 0.0021); });
  canvas.addEventListener('pointerdown', (e) => { if (locked) return; drag = { x: e.clientX, y: e.clientY }; steps.ensure(); try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
  canvas.addEventListener('pointermove', (e) => { if (!drag || locked) return; turn(e.clientX - drag.x, e.clientY - drag.y, 0.0042); drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', () => { drag = null; });
  function isTouch() { return window.__temForceTouch === true || ((('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches); }

  return {
    THREE, scene, world, cam, renderer, things, ways, track, clouds, pl, isTouch, threadMat, FOV, FOG_D,
    setCine(fn) { cineFn = fn; },
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    time: () => time,
    /** Test runs: advance by hand (a hidden tab draws no frames). */
    step(dt, n) { for (let i = 0; i < (n || 1); i++) update(dt); },
    setMode(m) { pl.mode = m; if (m !== 'walk') pl.way = null; if (m === 'held' || m === 'cine') { keys.clear(); if (locked) { wasLocked = m === 'held'; if (document.exitPointerLock) document.exitPointerLock(); } } },
    /** The page let the cursor go itself (a text came up, the map was opened): the look is taken back without another press, where the browser allows it. */
    relock() { if (!wasLocked || locked || isTouch() || !canvas.requestPointerLock) return; wasLocked = false; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {} },
    mode: () => pl.mode,
    locked: () => locked,
    unlock() { if (locked && document.exitPointerLock) { wasLocked = true; document.exitPointerLock(); } },
    teleport(pos, yaw, pitch) { pl.pos.copy(pos); pl.vel.set(0, 0, 0); if (yaw != null) pl.yaw = pl.tyaw = yaw; if (pitch != null) pl.pitch = pl.tpitch = pitch; trail.cut(); },
    /** Mark a carry (through a door) in the walk's record: it is part of the line the ending draws. */
    carry(from, to) { track.push({ x: from.x, y: from.y - EYE, z: from.z, t: time, k: 2 }, { x: to.x, y: to.y - EYE, z: to.z, t: time, k: 2 }); },
    /** Turn the eyes to a point, slowly. */
    lookToward(p, ms) {
      const dx = p.x - pl.pos.x, dy = p.y - pl.pos.y, dz = p.z - pl.pos.z, y1 = Math.atan2(-dx, -dz), p1 = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -1.2, 1.2);
      let dyaw = y1 - pl.tyaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      return new Promise((res) => { lookTween = { t0: time, dur: Math.max(0.2, (ms || 1800) / 1000 / SPEED), y0: pl.tyaw, dy: dyaw, p0: pl.tpitch, p1, res }; });
    },
    /**
     * Come to rest to read: about `dist` from a point, and turned so the point stands to one side of the text
     * (side -1 left, 1 right, 0 = above a text that sits low, on a narrow screen). Slow. Only while held.
     */
    settle(p, o) {
      const dist = (o && o.dist) || 10, side = o && o.side != null ? o.side : -1, dur = Math.max(0.2, ((o && o.ms) || 2000) / 1000 / SPEED);
      const dir = pl.pos.clone().sub(p); if (dir.lengthSq() < 1e-4) dir.set(0, 0.2, 1); dir.normalize(); dir.y = clamp(dir.y, -0.15, 0.4); dir.normalize();
      const to = p.clone().addScaledVector(dir, dist), dx = p.x - to.x, dy = p.y - to.y, dz = p.z - to.z;
      const tanH = Math.tan((FOV * Math.PI) / 360), y1 = Math.atan2(-dx, -dz) + side * Math.atan(0.5 * tanH * cam.aspect);
      const p1 = clamp(Math.atan2(dy, Math.hypot(dx, dz)) - (side === 0 ? Math.atan(0.5 * tanH) : 0), -1.2, 1.2);
      let dyaw = y1 - pl.tyaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      lookTween = { t0: time, dur, y0: pl.tyaw, dy: dyaw, p0: pl.tpitch, p1, res: () => {} };
      return new Promise((res) => { moveTween = { t0: time, dur, from: pl.pos.clone(), to, res }; });
    },
    /** Turn the eyes to a point at once. */
    face(p) { const dx = p.x - pl.pos.x, dy = p.y - pl.pos.y, dz = p.z - pl.pos.z; pl.yaw = pl.tyaw = Math.atan2(-dx, -dz); pl.pitch = pl.tpitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -1.3, 1.3); },
    placeThing, setAsked, link, addWords, leanWords, openWay, openStub, removeWay, land,
    /** A point `dist` away along the ray through a screen point (pixels). */
    screenRay(px, py, dist) {
      const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
      const d = new THREE.Vector3((px / w) * 2 - 1, -(py / h) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
      return { dir: d, at: cam.position.clone().addScaledVector(d, dist) };
    },
    screenOf(p) { const v = p.clone().project(cam), w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, front: v.z < 1 }; },
    forward: () => fwd(new THREE.Vector3()),
    feet: () => feet(new THREE.Vector3()),
    pull: () => pullNow,
    setForward(on) { pl.forward = !!on; if (on) steps.ensure(); },
    /** Automation: hold "forward" for `seconds`. */
    go(seconds) { pl.walkUntil = time + seconds; },
    ensureAudio() { steps.ensure(); },
    stepCount: () => steps.count(),
    EYE, NEAR_R, DOOR_H,
  };
}

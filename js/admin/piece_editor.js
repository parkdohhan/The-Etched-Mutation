// piece_editor.js — author's editor for the piece stage (2026-11-18, v2)
// Page: piece-editor.html?memory=<id|code>[&scene=<scene id>]
//   overview  = the 3D net: one point per scene, lines = walks actually taken (from the ledger)
//   one scene = its land + everything about how the scene is staged (text, editions, words in
//               the air, sounds, things and mannequins stood on it, size of the land)
// Writes, for one scene: text, text_stage_1..3, echo_words, and in meta: ghost_name, sound_url,
// sound_volume, sound_radius, piece{…}. meta is merged onto the latest row; other keys untouched.
// Play side: js/ui/tem_piece_props.js · record: docs/표류무대_실험-261118.md §11–12
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config.js';

const THREE = window.THREE, T = window.TemAfStrataTerrain, TP = window.TemPiece;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const EMBED = qs.get('embed') === '1';     // shown inside admin.html (no own scene list; tells the parent which scene is open)
if (EMBED) document.body.classList.add('embed');

const st = {
  memory: null, scenes: [], plays: [], P: null, scene: null, view: 'net',
  size: 1, props: [], sel: null, placing: null, dirty: false,
  markers: new Map(), sounds: [],
};

// ── three ──────────────────────────────────────────────────────────────────
const canvas = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setClearColor(0x12141b);
const scene3 = new THREE.Scene();
scene3.fog = new THREE.FogExp2(0x12141b, 0.005);
const cam = new THREE.PerspectiveCamera(46, 1, 0.5, 600);
const controls = new THREE.OrbitControls(cam, canvas);
scene3.add(new THREE.AmbientLight(0xb8c0d4, 0.95));
const sun = new THREE.DirectionalLight(0xfff0dc, 0.9); sun.position.set(40, 80, 30); scene3.add(sun);
const landGroup = new THREE.Group(); scene3.add(landGroup);     // one scene's land + what stands on it
const propGroup = new THREE.Group(); landGroup.add(propGroup);
const fixedGroup = new THREE.Group(); landGroup.add(fixedGroup);
const netGroup = new THREE.Group(); scene3.add(netGroup);       // the overview
let land = null, field = null;
let drag = null, downAt = null, netDrag = false;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
}
(function loop() {
  requestAnimationFrame(loop); resize(); controls.update();
  if (st.view === 'net' && !netDrag) netGroup.rotation.y += 0.0012;      // slow: one turn in about 90 s
  renderer.render(scene3, cam);
})();

function label(text, color, size) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = '500 44px "Gowun Batang",serif';
  g.font = font; const w = Math.ceil(g.measureText(text).width) + 36; c.width = w; c.height = 64;
  const g2 = c.getContext('2d'); g2.font = font; g2.textAlign = 'center'; g2.textBaseline = 'middle';
  g2.shadowColor = 'rgba(0,0,0,0.8)'; g2.shadowBlur = 8; g2.fillStyle = color || '#f0e6d2'; g2.fillText(text, w / 2, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  const k = size || 2.2; s.scale.set(k * w / 64, k, 1); s.renderOrder = 5;
  return s;
}
function parseMeta(m) { if (typeof m === 'string') { try { return JSON.parse(m); } catch (_) { return {}; } } return m || {}; }
function hash01(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 100000) / 100000; }

// ── overview: the net ──────────────────────────────────────────────────────
const net = { edges: {}, visits: {}, pos: {}, meshes: new Map(), runs: 0 };
function buildNetData() {
  net.edges = {}; net.visits = {}; net.runs = 0;
  const byRun = new Map();
  st.plays.forEach((p) => { if (!p.run_id || !p.scene_id) return; if (!byRun.has(p.run_id)) byRun.set(p.run_id, []); byRun.get(p.run_id).push(p); });
  byRun.forEach((rows) => {
    rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let prev = null, moved = false;
    rows.forEach((r) => {
      if (r.persona_id !== 'piece-move') net.visits[r.scene_id] = (net.visits[r.scene_id] || 0) + 1;
      if (prev && prev !== r.scene_id) { const k = prev + '|' + r.scene_id; net.edges[k] = (net.edges[k] || 0) + 1; moved = true; }
      prev = r.scene_id;
    });
    if (moved) net.runs++;
  });
}
function layoutNet() {
  const ids = st.scenes.map((s) => s.id), n = ids.length, pos = {};
  ids.forEach((id) => { const a = hash01(id + '|la') * Math.PI * 2, b = Math.acos(2 * hash01(id + '|lb') - 1); pos[id] = [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)]; });
  let E = Object.keys(net.edges).map((k) => k.split('|')).filter((e) => pos[e[0]] && pos[e[1]]);
  // nobody has walked yet: let the scene order hold the points loosely, so the model is not a cloud
  const soft = []; for (let i = 0; i + 1 < n; i++) soft.push([ids[i], ids[i + 1]]);
  const K = 1.0;
  for (let it = 0; it < 260; it++) {
    const temp = 0.12 * (1 - it / 260) + 0.004, disp = {}; ids.forEach((id) => { disp[id] = [0, 0, 0]; });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = pos[ids[i]], B = pos[ids[j]], dx = A[0] - B[0], dy = A[1] - B[1], dz = A[2] - B[2], d = Math.hypot(dx, dy, dz) || 0.01, f = K * K / d;
      disp[ids[i]][0] += dx / d * f; disp[ids[i]][1] += dy / d * f; disp[ids[i]][2] += dz / d * f;
      disp[ids[j]][0] -= dx / d * f; disp[ids[j]][1] -= dy / d * f; disp[ids[j]][2] -= dz / d * f;
    }
    const pull = (e, w) => {
      const A = pos[e[0]], B = pos[e[1]], dx = A[0] - B[0], dy = A[1] - B[1], dz = A[2] - B[2], d = Math.hypot(dx, dy, dz) || 0.01, f = w * d * d / K;
      disp[e[0]][0] -= dx / d * f; disp[e[0]][1] -= dy / d * f; disp[e[0]][2] -= dz / d * f;
      disp[e[1]][0] += dx / d * f; disp[e[1]][1] += dy / d * f; disp[e[1]][2] += dz / d * f;
    };
    E.forEach((e) => pull(e, 1)); soft.forEach((e) => pull(e, 0.18));
    ids.forEach((id) => { const v = disp[id], l = Math.hypot(v[0], v[1], v[2]) || 0.01, s = Math.min(l, temp) / l; pos[id][0] += v[0] * s; pos[id][1] += v[1] * s; pos[id][2] += v[2] * s; });
  }
  let cx = 0, cy = 0, cz = 0, r = 0.01; ids.forEach((id) => { cx += pos[id][0]; cy += pos[id][1]; cz += pos[id][2]; });
  ids.forEach((id) => { pos[id][0] -= cx / n; pos[id][1] -= cy / n; pos[id][2] -= cz / n; r = Math.max(r, Math.hypot(pos[id][0], pos[id][1], pos[id][2])); });
  ids.forEach((id) => { pos[id] = pos[id].map((v) => v / r * 26); });
  net.pos = pos;
}
function buildNet() {
  while (netGroup.children.length) netGroup.remove(netGroup.children[0]);
  net.meshes.clear();
  layoutNet();
  const P3 = (id) => new THREE.Vector3(net.pos[id][0], net.pos[id][1], net.pos[id][2]);
  const done = new Set();
  Object.keys(net.edges).forEach((k) => {
    const [a, b] = k.split('|'); if (!net.pos[a] || !net.pos[b] || done.has(b + '|' + a)) return; done.add(k);
    const back = net.edges[b + '|' + a] || 0, cnt = net.edges[k] + back;
    const A = P3(a), B = P3(b), mid = A.clone().add(B).multiplyScalar(0.5), len = A.distanceTo(B);
    // a tube whose thickness is how often it was walked
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1 + Math.min(0.6, 0.07 * cnt), 0.1 + Math.min(0.6, 0.07 * cnt), len, 8),
      new THREE.MeshStandardMaterial({ color: back ? 0x8fd0a0 : 0xd8c4a0, roughness: 0.6, transparent: true, opacity: 0.85 }));
    tube.position.copy(mid); tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    netGroup.add(tube);
  });
  if (!Object.keys(net.edges).length) {
    for (let i = 0; i + 1 < st.scenes.length; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([P3(st.scenes[i].id), P3(st.scenes[i + 1].id)]);
      const ln = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x59606e, dashSize: 0.8, gapSize: 0.7 })); ln.computeLineDistances(); netGroup.add(ln);
    }
  }
  st.scenes.forEach((s) => {
    const v = net.visits[s.id] || 0;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.0 + Math.min(1.4, v * 0.06), 22, 16),
      new THREE.MeshStandardMaterial({ color: v ? 0xf2dfbc : 0x7d8492, roughness: 0.5, emissive: v ? 0x3a2f1c : 0x000000 }));
    m.position.copy(P3(s.id)); m.userData.sceneId = s.id; netGroup.add(m); net.meshes.set(s.id, m);
    const cnt = (parseMeta(s.meta).piece || {}).props;
    const lb = label(s.scene_order + '  ' + String(s.text || '').slice(0, 14) + (Array.isArray(cnt) && cnt.length ? '  · 세운 것 ' + cnt.length : ''), '#e9dfcc', 1.7);
    lb.position.copy(P3(s.id)).add(new THREE.Vector3(0, 2.6, 0)); netGroup.add(lb);
  });
  const walks = Object.values(net.edges).reduce((a, b) => a + b, 0);
  $('ovStat').textContent = walks ? `지금까지 ${net.runs}번의 걸음에서 씬 사이 이동 ${walks}번.` : '아직 씬 사이를 걸은 기록이 없습니다. 점선은 씬 순서만 보여 줍니다.';
}
function showNet() {
  if (st.dirty && !confirm('저장하지 않은 것이 있습니다. 버리고 위상 모형으로 갈까요?')) return;
  st.dirty = false; st.view = 'net'; st.scene = null; st.sel = null; setPlacing(null);
  landGroup.visible = false; netGroup.visible = true;
  cam.position.set(0, 18, 78); controls.target.set(0, 0, 0); controls.maxPolarAngle = Math.PI; controls.minDistance = 20; controls.maxDistance = 200;
  $('ovPanel').classList.remove('hidden'); $('scPanel').classList.add('hidden'); $('back').classList.add('hidden');
  $('where').textContent = '위상 모형'; $('tip').textContent = '끌어서 돌려 보기 · 휠로 당기기 · 점을 누르면 그 씬 안으로';
  document.querySelectorAll('.scene').forEach((el) => el.classList.remove('on'));
  history.replaceState(null, '', `?${EMBED ? 'embed=1&' : ''}memory=${st.memory.id}`);
  buildNet();
}

// ── one scene: land ────────────────────────────────────────────────────────
function heightAt(x, z) {
  if (!field) return 0;
  const { G, SZ, hts } = field;
  const fx = (x / SZ + 0.5) * (G - 1), fz = (z / SZ + 0.5) * (G - 1);
  const ix = Math.max(0, Math.min(G - 2, Math.floor(fx))), iz = Math.max(0, Math.min(G - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - ix)), tz = Math.max(0, Math.min(1, fz - iz));
  const h = (a, b) => hts[b * G + a];
  return (h(ix, iz) * (1 - tx) + h(ix + 1, iz) * tx) * (1 - tz) + (h(ix, iz + 1) * (1 - tx) + h(ix + 1, iz + 1) * tx) * tz;
}
function buildLand() {
  if (land) { landGroup.remove(land); land.geometry.dispose(); land.material.dispose(); land = null; }
  if (!st.scene || !st.P) return;
  TP.setSize(st.scene.id, st.size);
  field = TP.fieldsFor(st.P, st.scene.id, null, {});
  if (!field || !field.hts) { status('이 씬은 감정 값이 없어 땅을 만들 수 없습니다.', true); return; }
  const { G, SZ, hts, cls } = field;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(G * G * 3), col = new Float32Array(G * G * 3);
  for (let iz = 0; iz < G; iz++) for (let ix = 0; ix < G; ix++) {
    const i = iz * G + ix, x = (ix / (G - 1) - 0.5) * SZ, z = (iz / (G - 1) - 0.5) * SZ;
    pos[i * 3] = x; pos[i * 3 + 1] = hts[i]; pos[i * 3 + 2] = z;
    const inside = TP.inside(st.scene.id, x, z, 0);
    // the play is dark and foggy; the editor lifts the colours so the author can see the ground
    col[i * 3] = inside ? Math.min(1, 0.2 + cls[i * 3] * 1.7) : 0.07;
    col[i * 3 + 1] = inside ? Math.min(1, 0.2 + cls[i * 3 + 1] * 1.7) : 0.08;
    col[i * 3 + 2] = inside ? Math.min(1, 0.22 + cls[i * 3 + 2] * 1.7) : 0.11;
  }
  const idx = [];
  for (let iz = 0; iz < G - 1; iz++) for (let ix = 0; ix < G - 1; ix++) { const a = iz * G + ix, b = a + 1, c = a + G, d = c + 1; idx.push(a, c, b, b, c, d); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  landGroup.add(land);
  buildFixed();
  st.props.forEach((p) => seat(p));
}

// ── markers ────────────────────────────────────────────────────────────────
function lightColumn() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  m.position.y = 13; return m;
}
function bodyOf(prop) {
  const g = new THREE.Group(), speaking = prop.role === 'speaking';
  if (prop.kind === 'figure') {
    const mat = new THREE.MeshStandardMaterial({ color: speaking ? 0xe8e4f4 : 0x7a7f8c, roughness: 0.7 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.45, 12), mat); b.position.y = 0.72;
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), mat); h.position.y = 1.66;
    g.add(b); g.add(h);
  } else if (prop.kind === 'sound') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshBasicMaterial({ color: 0x86c6d8, transparent: true, opacity: 0.85 })); b.position.y = 1.2; g.add(b);
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: speaking ? 0xd9b98a : 0x77808c, roughness: 0.8 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat); b.position.y = 0.55; g.add(b);
  }
  return g;
}
const glb = {};
function loadGlb(path) { return glb[path] || (glb[path] = new Promise((res, rej) => new THREE.GLTFLoader().load(path, (g) => res(g.scene), undefined, rej))); }
const KIND = { 'object:speaking': '글이 든 사물', 'object:scenery': '환경 사물', 'figure:speaking': '말 거는 마네킹', 'figure:scenery': '서 있는 마네킹', 'sound:scenery': '소리 자리', 'sound:speaking': '소리 자리' };
function kindName(p) { return KIND[p.kind + ':' + p.role] || p.kind; }
function makeMarker(prop) {
  const old = st.markers.get(prop.id); if (old) propGroup.remove(old);
  const g = new THREE.Group(); g.userData.propId = prop.id;
  const inner = new THREE.Group(); inner.name = 'inner'; g.add(inner);
  const stand = bodyOf(prop); inner.add(stand);
  const entry = prop.kind !== 'sound' && prop.model && st.memory.meta.object_models && st.memory.meta.object_models[prop.model];
  if (entry && entry.path) {
    loadGlb(entry.path).then((tpl) => {
      const o = tpl.clone(true), box = new THREE.Box3().setFromObject(o), s = box.getSize(new THREE.Vector3());
      o.scale.setScalar((Number(entry.scale) || 1) * (prop.kind === 'figure' ? 1.8 : 1.4) / Math.max(0.001, Math.max(s.x, s.y, s.z)));
      const b2 = new THREE.Box3().setFromObject(o); o.position.y = -b2.min.y;
      inner.remove(stand); inner.add(o);
    }).catch(() => {});
  }
  if (prop.kind === 'figure' && prop.role === 'speaking') g.add(lightColumn());   // the white light = can be talked to
  if (prop.sound_url) {                                                           // how far the spot's sound carries
    const r = Number(prop.sound_radius) || 22;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 64), new THREE.MeshBasicMaterial({ color: 0x86c6d8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; g.add(ring);
  }
  const lb = label((prop.name || kindName(prop)) + (prop.click_sound_url ? ' ♪' : ''), prop.kind === 'sound' ? '#a9dbe8' : (prop.role === 'speaking' ? '#ffe9c4' : '#aeb6c4'));
  lb.position.y = prop.kind === 'figure' ? 3.1 : 2.5; g.add(lb);
  const sel = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.16, 32), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false }));
  sel.rotation.x = -Math.PI / 2; sel.position.y = 0.06; sel.name = 'ring'; g.add(sel);
  propGroup.add(g); st.markers.set(prop.id, g);
  seat(prop);
}
function seat(prop) {
  const g = st.markers.get(prop.id); if (!g) return;
  g.position.set(prop.x, heightAt(prop.x, prop.z), prop.z);
  const inner = g.getObjectByName('inner');
  inner.rotation.y = Number(prop.rot) || 0;
  inner.scale.setScalar(prop.kind === 'sound' ? 1 : (Number(prop.scale) || 1));
  g.getObjectByName('ring').material.opacity = st.sel === prop.id ? 0.9 : 0;
}
function buildFixed() {
  while (fixedGroup.children.length) fixedGroup.remove(fixedGroup.children[0]);
  if (!st.scene) return;
  const gp = TP.ghostPos(st.scene.id);
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.75 });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.45, 12), mat); b.position.y = 0.72;
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), mat); h.position.y = 1.66;
  g.add(b); g.add(h); g.add(lightColumn());
  const lb = label('이 씬의 유령 · 본문을 말함' + (st.symbol ? ' · 몸 = ' + st.symbol : '') + ' (자리 고정)', '#cfd6e6'); lb.position.y = 3.2; g.add(lb);
  g.position.set(gp.x, heightAt(gp.x, gp.z), gp.z);
  fixedGroup.add(g);
}

// ── picking / placing / dragging ───────────────────────────────────────────
const ray = new THREE.Raycaster();
function ndc(e) { const r = canvas.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
function groundHit(e) { if (!land) return null; ray.setFromCamera(ndc(e), cam); const h = ray.intersectObject(land, false); return h.length ? h[0].point : null; }
function propHit(e) {
  ray.setFromCamera(ndc(e), cam);
  for (const h of ray.intersectObjects(propGroup.children, true)) { let o = h.object; while (o && !o.userData.propId) o = o.parent; if (o) return o.userData.propId; }
  return null;
}
function nodeHit(e) {
  ray.setFromCamera(ndc(e), cam);
  let best = null, bd = 2.4;
  net.meshes.forEach((m, id) => { const wp = new THREE.Vector3(); m.getWorldPosition(wp); const d = ray.ray.distanceToPoint(wp); if (d < bd) { bd = d; best = id; } });
  return best;
}
canvas.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  if (st.view === 'net') { netDrag = true; return; }
  if (st.placing) return;
  const id = propHit(e);
  if (id) { select(id); drag = id; controls.enabled = false; canvas.setPointerCapture(e.pointerId); }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = groundHit(e); if (!p || !TP.inside(st.scene.id, p.x, p.z, 2)) return;
  const prop = st.props.find((x) => x.id === drag); prop.x = +p.x.toFixed(2); prop.z = +p.z.toFixed(2);
  seat(prop); touch();
});
canvas.addEventListener('pointerup', (e) => {
  const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5;
  if (st.view === 'net') {
    netDrag = false;
    if (!moved) { const id = nodeHit(e); if (id) openScene(st.scenes.find((s) => s.id === id)); }
    return;
  }
  if (drag) { drag = null; controls.enabled = true; return; }
  if (moved) return;
  if (st.placing) {
    const p = groundHit(e);
    if (!p || !TP.inside(st.scene.id, p.x, p.z, 2)) { status('조각 안쪽 땅을 눌러 주세요.', true); return; }
    addProp(st.placing.kind, st.placing.role, p.x, p.z);
    setPlacing(null);
  } else if (!propHit(e)) select(null);
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setPlacing(null); });

// ── props ──────────────────────────────────────────────────────────────────
const BLANK = { rot: 0, scale: 1, name: '', model: '', text: '', text_again: '', sound_url: '', sound_volume: 0.7, sound_radius: 22, click_sound_url: '', click_sound_volume: 0.85 };
function setPlacing(v) {
  st.placing = v;
  $('mode').style.display = v ? 'block' : 'none';
  if (v) $('mode').textContent = KIND[v.kind + ':' + v.role] + ' — 세울 자리를 누르세요 (Esc 취소)';
  canvas.style.cursor = v ? 'crosshair' : '';
}
function addProp(kind, role, x, z) {
  const prop = Object.assign({}, BLANK, { id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), kind, role, x: +x.toFixed(2), z: +z.toFixed(2) });
  st.props.push(prop); makeMarker(prop); renderList(); select(prop.id); touch();
  return prop;
}
function select(id) { st.sel = id; st.props.forEach((p) => seat(p)); renderList(); fillForm(); }
function renderList() {
  const box = $('props');
  if (!st.props.length) { box.innerHTML = '<div class="sub">아직 없습니다.</div>'; return; }
  box.innerHTML = '';
  st.props.forEach((p) => {
    const d = document.createElement('div'); d.className = 'prop' + (st.sel === p.id ? ' on' : '');
    const a = document.createElement('span'); a.textContent = p.name || '(이름 없음)';
    const b = document.createElement('em'); b.textContent = kindName(p) + (p.sound_url ? ' · 계속 소리' : '') + (p.click_sound_url ? ' · 한 번 소리' : '');
    d.appendChild(a); d.appendChild(b); d.onclick = () => select(p.id); box.appendChild(d);
  });
}
function cur() { return st.props.find((p) => p.id === st.sel) || null; }
function soundOptions(sel, value) {
  sel.innerHTML = '<option value="">소리 없음</option>' + st.sounds.map((s) => `<option value="${s.url}">${s.label}</option>`).join('') + '<option value="__custom__">직접 주소 넣기</option>';
  sel.value = !value ? '' : (st.sounds.some((s) => s.url === value) ? value : '__custom__');
}
function fillForm() {
  const p = cur(); $('form').classList.toggle('hidden', !p); if (!p) return;
  const isSound = p.kind === 'sound', speaking = p.role === 'speaking' && !isSound;
  $('fName').value = p.name || ''; $('fKind').value = p.kind; $('fRole').value = p.role;
  $('fRole').parentElement.classList.toggle('hidden', isSound);
  $('shapeWrap').classList.toggle('hidden', isSound);
  const models = Object.keys(st.memory.meta.object_models || {});
  $('fModel').innerHTML = '<option value="">' + (p.kind === 'figure' ? '기본 마네킹' : '블록 (모형 없음)') + '</option>' + models.map((m) => `<option value="${m}">${m}</option>`).join('');
  $('fModel').value = models.includes(p.model) ? p.model : '';
  $('fScale').value = p.scale || 1; $('fScaleV').textContent = (+p.scale || 1).toFixed(2);
  const deg = Math.round(((Number(p.rot) || 0) * 180 / Math.PI + 360) % 360); $('fRot').value = deg; $('fRotV').textContent = deg + '°';
  $('textWrap').classList.toggle('hidden', !speaking);
  $('againWrap').classList.toggle('hidden', !(speaking && p.kind === 'figure'));
  $('fTextL').textContent = p.kind === 'figure' ? '대사 — 끝까지 다 나오고, 마지막 문장에서 끊겨 관객이 이어 씁니다' : '들여다보면 뜨는 글';
  $('fText').value = p.text || ''; $('fAgain').value = p.text_again || '';
  soundOptions($('fSndSel'), p.sound_url); $('fSnd').value = p.sound_url || '';
  $('fSndVol').value = p.sound_volume != null ? p.sound_volume : 0.7; $('fSndVolV').textContent = (+$('fSndVol').value).toFixed(2);
  $('fSndRad').value = p.sound_radius || 22; $('fSndRadV').textContent = $('fSndRad').value;
  $('clickBox').classList.toggle('hidden', isSound);
  $('clickHelp').textContent = p.kind === 'figure'
    ? (speaking ? '관객이 이 마네킹에게 말을 걸 때마다 한 번 납니다.' : '관객이 이 마네킹 곁에서 길게 누르거나 E 를 누르면 한 번 납니다.')
    : (speaking ? '관객이 이 사물을 들여다볼 때마다 한 번 납니다.' : '관객이 이 사물 곁에서 길게 누르거나 E 를 누르면 한 번 납니다.');
  soundOptions($('fClkSel'), p.click_sound_url); $('fClk').value = p.click_sound_url || '';
  $('fClkVol').value = p.click_sound_volume != null ? p.click_sound_volume : 0.85; $('fClkVolV').textContent = (+$('fClkVol').value).toFixed(2);
}
function bind(id, ev, fn) { $(id).addEventListener(ev, () => { const p = cur(); if (!p) return; fn(p); touch(); }); }
bind('fName', 'input', (p) => { p.name = $('fName').value.trim(); makeMarker(p); renderList(); });
bind('fKind', 'change', (p) => { p.kind = $('fKind').value; if (p.kind === 'sound') p.role = 'scenery'; makeMarker(p); renderList(); fillForm(); });
bind('fRole', 'change', (p) => { p.role = $('fRole').value; makeMarker(p); renderList(); fillForm(); });
bind('fModel', 'change', (p) => { p.model = $('fModel').value; makeMarker(p); });
bind('fScale', 'input', (p) => { p.scale = +$('fScale').value; $('fScaleV').textContent = p.scale.toFixed(2); seat(p); });
bind('fRot', 'input', (p) => { p.rot = +(+$('fRot').value * Math.PI / 180).toFixed(3); $('fRotV').textContent = $('fRot').value + '°'; seat(p); });
bind('fText', 'input', (p) => { p.text = $('fText').value; });
bind('fAgain', 'input', (p) => { p.text_again = $('fAgain').value; });
bind('fSndSel', 'change', (p) => { const v = $('fSndSel').value; if (v !== '__custom__') { p.sound_url = v; $('fSnd').value = v; } makeMarker(p); renderList(); });
bind('fSnd', 'input', (p) => { p.sound_url = $('fSnd').value.trim(); makeMarker(p); renderList(); });
bind('fSndVol', 'input', (p) => { p.sound_volume = +$('fSndVol').value; $('fSndVolV').textContent = p.sound_volume.toFixed(2); });
bind('fSndRad', 'input', (p) => { p.sound_radius = +$('fSndRad').value; $('fSndRadV').textContent = p.sound_radius; makeMarker(p); });
bind('fClkSel', 'change', (p) => { const v = $('fClkSel').value; if (v !== '__custom__') { p.click_sound_url = v; $('fClk').value = v; } makeMarker(p); renderList(); });
bind('fClk', 'input', (p) => { p.click_sound_url = $('fClk').value.trim(); makeMarker(p); renderList(); });
bind('fClkVol', 'input', (p) => { p.click_sound_volume = +$('fClkVol').value; $('fClkVolV').textContent = p.click_sound_volume.toFixed(2); });
$('fDel').onclick = () => { const p = cur(); if (!p) return; const g = st.markers.get(p.id); if (g) propGroup.remove(g); st.markers.delete(p.id); st.props = st.props.filter((x) => x.id !== p.id); st.sel = null; renderList(); fillForm(); touch(); };
document.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { const [kind, role] = b.dataset.add.split(':'); setPlacing({ kind, role }); }; });
let testAudio = null;
document.querySelectorAll('[data-test]').forEach((b) => { b.onclick = () => {
  if (testAudio) { testAudio.pause(); testAudio = null; return; }
  const url = $(b.dataset.test).value.trim(); if (!url) return;
  testAudio = new Audio(url); testAudio.play().catch(() => status('이 소리를 틀 수 없습니다.', true)); testAudio.onended = () => { testAudio = null; };
}; });
$('size').addEventListener('input', () => {
  st.size = +$('size').value; $('sizeV').textContent = st.size.toFixed(2); buildLand();
  // things left outside a smaller piece come back in
  st.props.forEach((p) => { if (!TP.inside(st.scene.id, p.x, p.z, 2)) { const q = TP.polar(st.scene.id, Math.atan2(p.z, p.x), 0.9); p.x = +q.x.toFixed(2); p.z = +q.z.toFixed(2); seat(p); } });
  touch();
});
// scene-level fields
['sText', 'sCut', 'sSee', 'sSt1', 'sSt2', 'sSt3', 'sEcho', 'sGhost', 'sSnd'].forEach((id) => $(id).addEventListener('input', touch));
$('sCut').addEventListener('change', touch);
$('sSndSel').addEventListener('change', () => { const v = $('sSndSel').value; if (v !== '__custom__') $('sSnd').value = v; touch(); });
$('sSndVol').addEventListener('input', () => { $('sSndVolV').textContent = (+$('sSndVol').value).toFixed(2); touch(); });
$('sSndRad').addEventListener('input', () => { $('sSndRadV').textContent = $('sSndRad').value; touch(); });

// ── data ───────────────────────────────────────────────────────────────────
function status(msg, err) { const el = $('status'); el.textContent = msg || ''; el.className = err ? 'err' : ''; }
function touch() { st.dirty = true; status('고친 것이 있습니다 — 아직 저장 전'); }
window.addEventListener('beforeunload', (e) => { if (st.dirty) { e.preventDefault(); e.returnValue = ''; } });
function echoList(v) { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { v = v.split(','); } } return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []; }

function openScene(sc) {
  if (!sc) return;
  if (st.dirty && !confirm('저장하지 않은 것이 있습니다. 버리고 다른 씬으로 갈까요?')) return;
  st.view = 'scene'; st.scene = sc; st.sel = null; st.dirty = false; setPlacing(null);
  netGroup.visible = false; landGroup.visible = true;
  cam.position.set(0, 74, 78); controls.target.set(0, 0, 0); controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 12; controls.maxDistance = 220;
  $('ovPanel').classList.add('hidden'); $('scPanel').classList.remove('hidden'); $('back').classList.remove('hidden');
  $('where').textContent = sc.scene_order + '번 씬 안';
  $('tip').textContent = '끌어서 돌려 보기 · 휠로 당기기 · 세운 것을 잡아 끌면 옮겨집니다';
  st.markers.forEach((g) => propGroup.remove(g)); st.markers.clear();
  const meta = parseMeta(sc.meta), piece = meta.piece || {};
  st.size = Math.max(0.5, Math.min(1.2, Number(piece.size) || 1));
  st.props = (Array.isArray(piece.props) ? piece.props : []).map((p) => Object.assign({}, BLANK, p));
  // the scene's existing things (object words of the old stage, scattered over the shared terrain)
  // are brought inside this scene the first time it is opened here. Nothing is written until saved.
  let imported = 0;
  if (!piece.objects_in_piece) {
    const models = st.memory.meta.object_models || {};
    const words = Array.isArray(meta.object_tags) ? meta.object_tags : (Array.isArray(meta.motif_tags) ? meta.motif_tags : []);
    const symbol = (meta.symbol_object && models[meta.symbol_object]) ? meta.symbol_object : words.find((w) => models[w] && models[w].path);
    st.symbol = symbol || '';
    const gp = TP.ghostPos(sc.id);
    words.forEach((w, i) => {
      w = String(w || '').trim();
      if (!w || w === symbol || st.props.some((p) => p.name === w)) return;       // the symbol is the ghost's body
      const a = hash01(sc.id + '|' + w) * Math.PI * 2, r = 6 + (i % 3) * 2.4;
      let x = gp.x + Math.cos(a) * r, z = gp.z + Math.sin(a) * r;
      if (!TP.inside(sc.id, x, z, 3)) { const q = TP.polar(sc.id, Math.atan2(z, x), 0.8); x = q.x; z = q.z; }
      const line = (meta.object_lines && meta.object_lines[w]) || '';
      st.props.push(Object.assign({}, BLANK, { id: 'o' + Math.floor(hash01(sc.id + w) * 1e9).toString(36), kind: 'object', role: line ? 'speaking' : 'scenery',
        name: w, model: models[w] && models[w].path ? w : '', x: +x.toFixed(2), z: +z.toFixed(2), rot: +(hash01(w + '|r') * 6.28).toFixed(2), text: line }));
      imported++;
    });
  } else {
    const models2 = st.memory.meta.object_models || {};
    const words2 = Array.isArray(meta.object_tags) ? meta.object_tags : [];
    st.symbol = (meta.symbol_object && models2[meta.symbol_object]) ? meta.symbol_object : (words2.find((w) => models2[w] && models2[w].path) || '');
  }
  st.imported = imported;
  $('size').value = st.size; $('sizeV').textContent = st.size.toFixed(2);
  $('sText').value = sc.text || ''; $('sCut').value = piece.cut === 'stem' ? 'stem' : 'end'; $('sSee').value = piece.see_line || '';
  $('sSt1').value = sc.text_stage_1 || ''; $('sSt2').value = sc.text_stage_2 || ''; $('sSt3').value = sc.text_stage_3 || '';
  $('sEcho').value = echoList(sc.echo_words).join(', '); $('sGhost').value = meta.ghost_name || '';
  soundOptions($('sSndSel'), meta.sound_url); $('sSnd').value = meta.sound_url || '';
  $('sSndVol').value = meta.sound_volume != null ? meta.sound_volume : 1; $('sSndVolV').textContent = (+$('sSndVol').value).toFixed(2);
  $('sSndRad').value = meta.sound_radius != null ? meta.sound_radius : 15; $('sSndRadV').textContent = $('sSndRad').value;
  buildLand();
  st.props.forEach((p) => makeMarker(p));
  renderList(); fillForm(); status('');
  if (st.imported) { st.dirty = true; status('옛 지형에 흩어져 있던 사물 ' + st.imported + '개를 이 씬 안으로 가져왔습니다 — 자리를 잡고 저장하면 확정됩니다.'); }
  if (EMBED) { try { window.parent.postMessage({ type: 'tem-piece-scene', sceneId: sc.id }, '*'); } catch (_) {} }
  document.querySelectorAll('.scene').forEach((el) => el.classList.toggle('on', el.dataset.id === sc.id));
  $('walk').href = `play-test.html?memory=${st.memory.id}&drift=1&dry=1&lang=ko&start=${sc.id}`;
  history.replaceState(null, '', `?${EMBED ? 'embed=1&' : ''}memory=${st.memory.id}&scene=${sc.id}`);
}

async function save() {
  if (!st.scene) return;
  const { data: sess } = await sb.auth.getSession();
  if (!sess || !sess.session) { $('login').style.display = 'flex'; return; }
  const text = $('sText').value.trim();
  if (!text) { status('본문이 비어 있습니다.', true); return; }
  status('저장 중…');
  // merge onto the latest meta: other tools write other keys of the same column
  const fresh = await sb.from('scenes').select('meta').eq('id', st.scene.id).maybeSingle();
  if (fresh.error) { status('불러오기 실패: ' + fresh.error.message, true); return; }
  const meta = Object.assign({}, parseMeta(fresh.data && fresh.data.meta));
  const ghost = $('sGhost').value.trim(); if (ghost) meta.ghost_name = ghost; else delete meta.ghost_name;
  const snd = $('sSnd').value.trim();
  if (snd) { meta.sound_url = snd; meta.sound_volume = +$('sSndVol').value; meta.sound_radius = +$('sSndRad').value; }
  else { delete meta.sound_url; delete meta.sound_volume; delete meta.sound_radius; }
  meta.piece = {
    objects_in_piece: true,   // this scene's things now live in the piece; the old scattered ones are not stood
    size: +st.size.toFixed(2), cut: $('sCut').value === 'stem' ? 'stem' : 'end', see_line: $('sSee').value.trim(),
    props: st.props.map((p) => {
      const isSound = p.kind === 'sound', speaking = p.role === 'speaking' && !isSound;
      return {
        id: p.id, kind: p.kind, role: isSound ? 'scenery' : p.role, name: p.name || '', model: isSound ? '' : (p.model || ''),
        x: p.x, z: p.z, rot: Number(p.rot) || 0, scale: Number(p.scale) || 1,
        text: speaking ? (p.text || '') : '', text_again: (speaking && p.kind === 'figure') ? (p.text_again || '') : '',
        sound_url: p.sound_url || '', sound_volume: Number(p.sound_volume), sound_radius: Number(p.sound_radius) || 22,
        click_sound_url: isSound ? '' : (p.click_sound_url || ''), click_sound_volume: Number(p.click_sound_volume),
      };
    }),
  };
  const patch = {
    text, text_stage_1: $('sSt1').value.trim() || null, text_stage_2: $('sSt2').value.trim() || null, text_stage_3: $('sSt3').value.trim() || null,
    echo_words: $('sEcho').value.split(',').map((x) => x.trim()).filter(Boolean), meta,
  };
  const up = await sb.from('scenes').update(patch).eq('id', st.scene.id).select('id');
  if (up.error) { status('저장 실패: ' + up.error.message, true); return; }
  if (!up.data || !up.data.length) { status('저장되지 않았습니다 — 관리자 권한으로 로그인했는지 확인해 주세요.', true); return; }
  Object.assign(st.scene, patch); st.dirty = false;
  renderSceneList();
  status('저장했습니다. (' + new Date().toLocaleTimeString() + ')');
}
$('save').onclick = save;
$('back').onclick = showNet; $('toNet').onclick = showNet;
$('lGo').onclick = async () => {
  const r = await sb.auth.signInWithPassword({ email: $('lEmail').value.trim(), password: $('lPw').value });
  if (r.error) { $('lMsg').textContent = '로그인 실패: ' + r.error.message; return; }
  $('login').style.display = 'none'; save();
};

function renderSceneList() {
  const box = $('scenes'); box.innerHTML = '';
  st.scenes.forEach((s) => {
    const d = document.createElement('div'); d.className = 'scene' + (st.scene && st.scene.id === s.id ? ' on' : ''); d.dataset.id = s.id;
    const n = (parseMeta(s.meta).piece || {}).props, cnt = Array.isArray(n) ? n.length : 0;
    d.innerHTML = `<b>${s.scene_order}</b>${cnt ? '세운 것 ' + cnt : ''}<small></small>`;
    d.querySelector('small').textContent = String(s.text || '');           // the whole body, not cut
    d.onclick = () => openScene(s); box.appendChild(d);
  });
}

async function boot() {
  const ref = qs.get('memory');
  if (!ref) { $('memTitle').textContent = '주소에 기억이 없습니다 (?memory=…).'; return; }
  const isId = /^[0-9a-f-]{36}$/i.test(ref);
  const mem = await sb.from('memories').select('*').eq(isId ? 'id' : 'code', ref).maybeSingle();
  if (mem.error || !mem.data) { $('memTitle').textContent = '기억을 찾지 못했습니다.'; return; }
  st.memory = mem.data; st.memory.meta = parseMeta(st.memory.meta);
  const [sc, pl] = await Promise.all([
    sb.from('scenes').select('*').eq('memory_id', st.memory.id).order('scene_order', { ascending: true }),
    sb.from('plays').select('id, memory_id, scene_id, user_emotion, alignment, mismatch_type, created_at, user_id, persona_id, run_id').eq('memory_id', st.memory.id),
  ]);
  st.scenes = sc.data || [];
  st.plays = pl.data || [];
  TP.setScenes(st.scenes);
  st.P = T.buildMemoryItems([st.memory], { [st.memory.id]: st.plays.filter((p) => p.persona_id !== 'piece-move') }, { [st.memory.id]: st.scenes });
  $('memTitle').textContent = (st.memory.code ? st.memory.code + ' · ' : '') + (st.memory.title || '');
  const seen = new Set();
  st.scenes.forEach((s) => { const m = parseMeta(s.meta); if (m.sound_url && !seen.has(m.sound_url)) { seen.add(m.sound_url); st.sounds.push({ url: m.sound_url, label: s.scene_order + '번 씬의 소리' }); } });
  buildNetData();
  renderSceneList();
  const want = qs.get('scene');
  const first = want && st.scenes.find((s) => s.id === want);
  if (first) openScene(first); else showNet();
}
boot().catch((e) => { console.error(e); $('memTitle').textContent = '불러오는 중 오류: ' + e.message; });
window.__pieceEditor = { st, net, addProp, select, save, openScene, showNet };

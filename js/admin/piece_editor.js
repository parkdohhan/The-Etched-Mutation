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
  if (st.view === 'net' && !$('labels').classList.contains('hidden')) placeLabels();
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
const net = { edges: {}, visits: {}, arrivals: {}, walkers: {}, maxArr: 0, maxVis: 0, pos: {}, pull: {}, tubes: new Map(), shells: new Map(), labels: new Map(), hl: null, lit: null, hover: null, meshes: new Map(), runs: 0 };
function buildNetData() {
  // per scene, three counts from the same ledger rows (261121):
  //   visits   = rows left there (a move made by pressing a map point is not a row "left there")
  //   arrivals = times a walk entered the scene (first row of a walk, or the scene changed)
  //   walkers  = walks that were there at least once
  net.edges = {}; net.visits = {}; net.arrivals = {}; net.walkers = {}; net.runs = 0; net.dropped = 0; net.runList = [];
  const byRun = new Map();
  st.plays.forEach((p) => { if (!p.run_id || !p.scene_id) { net.dropped++; return; } if (!byRun.has(p.run_id)) byRun.set(p.run_id, []); byRun.get(p.run_id).push(p); });
  // rows of one walk stamped with the very same time (a batch written at once, e.g. the author's seed)
  // carry no order of their own; they are lined up by scene order so the result does not change from load to load.
  const ordOf = {}; st.scenes.forEach((s) => { ordOf[s.id] = Number(s.scene_order) || 0; });
  net.tied = 0;
  byRun.forEach((rows) => {
    rows.sort((a, b) => (new Date(a.created_at) - new Date(b.created_at)) || ((ordOf[a.scene_id] || 0) - (ordOf[b.scene_id] || 0)));
    const seenT = {}; rows.forEach((r) => { seenT[r.created_at] = (seenT[r.created_at] || 0) + 1; });
    Object.values(seenT).forEach((c) => { if (c > 1) net.tied += c; });
    let prev = null, moved = false; const been = new Set();
    rows.forEach((r) => {
      if (r.persona_id !== 'piece-move') net.visits[r.scene_id] = (net.visits[r.scene_id] || 0) + 1;
      if (prev !== r.scene_id) { net.arrivals[r.scene_id] = (net.arrivals[r.scene_id] || 0) + 1; been.add(r.scene_id); }
      if (prev && prev !== r.scene_id) { const k = prev + '|' + r.scene_id; net.edges[k] = (net.edges[k] || 0) + 1; moved = true; }
      prev = r.scene_id;
    });
    been.forEach((id) => { net.walkers[id] = (net.walkers[id] || 0) + 1; });
    if (moved) net.runs++;
    net.runList.push({ id: rows[0].run_id, rows, moved });
  });
  net.maxArr = Math.max(0, ...st.scenes.map((s) => net.arrivals[s.id] || 0));
  net.maxVis = Math.max(0, ...st.scenes.map((s) => net.visits[s.id] || 0));
}
// the point of a scene: a solid core sized by arrivals, inside a faint shell sized by rows left.
// Both are relative to the largest value in this memory (no fixed scale).
function dotSize(id) {
  const a = net.arrivals[id] || 0, v = net.visits[id] || 0;
  const core = 1.0 + (net.maxArr ? 1.4 * a / net.maxArr : 0);
  return { a, v, core, shell: v ? core + 0.25 + 1.0 * v / net.maxVis : 0 };
}
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
function layoutNet() {
  const ids = st.scenes.map((s) => s.id), n = ids.length, pos = {};
  ids.forEach((id) => { const a = hash01(id + '|la') * Math.PI * 2, b = Math.acos(2 * hash01(id + '|lb') - 1); pos[id] = [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)]; });
  // 261121: one spring per pair of scenes; its strength = (walks there + walks back) / the mean of
  // that number over this memory's pairs. No fixed scale: the average pair pulls with 1.
  const und = {};
  Object.keys(net.edges).forEach((k) => { const [a, b] = k.split('|'); if (!pos[a] || !pos[b]) return; const u = a < b ? a + '|' + b : b + '|' + a; und[u] = (und[u] || 0) + net.edges[k]; });
  const uk = Object.keys(und), meanW = uk.reduce((t, k) => t + und[k], 0) / (uk.length || 1);
  net.pull = {}; uk.forEach((k) => { net.pull[k] = und[k] / meanW; });
  const E = uk.map((k) => k.split('|'));
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
    E.forEach((e) => pull(e, net.pull[e[0] + '|' + e[1]])); soft.forEach((e) => pull(e, 0.18));
    ids.forEach((id) => { const v = disp[id], l = Math.hypot(v[0], v[1], v[2]) || 0.01, s = Math.min(l, temp) / l; pos[id][0] += v[0] * s; pos[id][1] += v[1] * s; pos[id][2] += v[2] * s; });
  }
  let cx = 0, cy = 0, cz = 0, r = 0.01; ids.forEach((id) => { cx += pos[id][0]; cy += pos[id][1]; cz += pos[id][2]; });
  ids.forEach((id) => { pos[id][0] -= cx / n; pos[id][1] -= cy / n; pos[id][2] -= cz / n; r = Math.max(r, Math.hypot(pos[id][0], pos[id][1], pos[id][2])); });
  ids.forEach((id) => { pos[id] = pos[id].map((v) => v / r * 26); });
  net.pos = pos;
}
function buildNet() {
  while (netGroup.children.length) netGroup.remove(netGroup.children[0]);
  net.meshes.clear(); net.tubes.clear(); net.shells.clear(); net.labels.clear(); $('labels').innerHTML = '';
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
    netGroup.add(tube); net.tubes.set(pairKey(a, b), tube);
  });
  if (!Object.keys(net.edges).length) {
    for (let i = 0; i + 1 < st.scenes.length; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([P3(st.scenes[i].id), P3(st.scenes[i + 1].id)]);
      const ln = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x59606e, dashSize: 0.8, gapSize: 0.7 })); ln.computeLineDistances(); netGroup.add(ln);
    }
  }
  st.scenes.forEach((s) => {
    const d = dotSize(s.id);
    const m = new THREE.Mesh(new THREE.SphereGeometry(d.core, 22, 16),
      new THREE.MeshStandardMaterial({ color: d.a ? 0xf2dfbc : 0x7d8492, roughness: 0.5, emissive: d.a ? 0x3a2f1c : 0x000000 }));
    m.position.copy(P3(s.id)); m.userData.sceneId = s.id; netGroup.add(m); net.meshes.set(s.id, m);
    if (d.shell) {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(d.shell, 22, 16), new THREE.MeshBasicMaterial({ color: 0xf2dfbc, transparent: true, opacity: 0.13, depthWrite: false }));
      sh.position.copy(m.position); netGroup.add(sh); net.shells.set(s.id, sh);
    }
    // name tag = a page element laid over the picture, so tags can step aside for one another (placeLabels)
    const cnt = (parseMeta(s.meta).piece || {}).props, el = document.createElement('div'), b = document.createElement('b'), sp = document.createElement('span');
    b.textContent = s.scene_order; sp.textContent = ' ' + String(s.text || '').slice(0, 14) + (Array.isArray(cnt) && cnt.length ? ' · 세운 것 ' + cnt.length : '');
    el.appendChild(b); el.appendChild(sp); $('labels').appendChild(el);
    net.labels.set(s.id, { el, r: Math.max(d.core, d.shell), wFull: 0, wShort: 0, h: 0 });
  });
  measureLabels();
  const walks = Object.values(net.edges).reduce((a, b) => a + b, 0);
  $('ovStat').textContent = walks ? `지금까지 ${net.runs}번의 걸음에서 씬 사이 이동 ${walks}번.` : '아직 씬 사이를 걸은 기록이 없습니다. 점선은 씬 순서만 보여 줍니다.';
  applyHl();
}
function measureLabels() {
  const box = $('labels'), was = box.classList.contains('hidden'); box.classList.remove('hidden');
  net.labels.forEach((L) => { L.el.classList.remove('short'); L.wFull = L.el.offsetWidth; L.h = L.el.offsetHeight; L.wShort = L.el.firstChild.offsetWidth; });
  if (was) box.classList.add('hidden');
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureLabels);
// Every frame: put each name tag above its point. Nearest points first; a tag that would cover one
// already placed shrinks to its number. The point under the mouse always shows its whole tag.
const _lv = new THREE.Vector3();
function placeLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight, f = (h / 2) / Math.tan(cam.fov * Math.PI / 360), items = [];
  net.labels.forEach((L, id) => {
    const m = net.meshes.get(id); if (!m) return;
    m.getWorldPosition(_lv); const dist = _lv.distanceTo(cam.position); _lv.project(cam);
    if (_lv.z > 1 || _lv.z < -1) { L.el.style.display = 'none'; return; }
    items.push({ id, L, x: (_lv.x + 1) / 2 * w, cy: (1 - _lv.y) / 2 * h, rp: L.r / dist * f + 3, dist, pri: id === net.hover ? 0 : (net.lit && net.lit.S.has(id) ? 1 : 2) });
  });
  items.sort((a, b) => a.pri - b.pri || a.dist - b.dist);
  const placed = [];
  items.forEach((it) => {
    // try, in order: whole tag above, whole tag below, number above, number below
    const L = it.L, rect = (W, below) => { const y1 = below ? it.cy + it.rp + L.h : it.cy - it.rp; return { x0: it.x - W / 2 - 3, x1: it.x + W / 2 + 3, y0: y1 - L.h, y1 }; };
    const hits = (r) => placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
    let full = true, r = rect(L.wFull, false);
    if (it.pri !== 0 && hits(r)) {
      const tries = [[true, true], [false, false], [false, true]]; let ok = false;
      for (const [fl, below] of tries) { const c = rect(fl ? L.wFull : L.wShort, below); if (!hits(c)) { full = fl; r = c; ok = true; break; } }
      if (!ok) { full = false; r = rect(L.wShort, false); }
    }
    placed.push(r);
    L.el.classList.toggle('short', !full); L.el.style.display = 'block';
    L.el.style.transform = 'translate(' + Math.round(r.x0 + 3) + 'px,' + Math.round(r.y0) + 'px)';
    L.el.style.opacity = net.lit && !net.lit.S.has(it.id) && it.pri ? 0.22 : 1;
    L.el.style.zIndex = it.pri === 0 ? 2 : 1;
  });
}
// ── one thing picked out (from a table row): it stays bright, the rest goes faint ──
function litSets() {
  const h = net.hl; if (!h) return null;
  const S = new Set(), T = new Set();
  if (h.type === 'scene') { S.add(h.id); net.tubes.forEach((m, k) => { const [a, b] = k.split('|'); if (a === h.id || b === h.id) { T.add(k); S.add(a); S.add(b); } }); }
  else if (h.type === 'pair') { S.add(h.a); S.add(h.b); T.add(pairKey(h.a, h.b)); }
  else if (h.type === 'run') { const r = net.runList.find((x) => String(x.id) === h.id); let prev = null; (r ? r.rows : []).forEach((x) => { S.add(x.scene_id); if (prev && prev !== x.scene_id) T.add(pairKey(prev, x.scene_id)); prev = x.scene_id; }); }
  return { S, T };
}
function hlKey(h) { return !h ? '' : h.type === 'pair' ? 'pair:' + pairKey(h.a, h.b) : h.type + ':' + h.id; }
function applyHl() {
  const L = net.lit = litSets();
  net.meshes.forEach((m, id) => { const on = !L || L.S.has(id); m.material.transparent = !on; m.material.opacity = on ? 1 : 0.1; m.material.needsUpdate = true; const sh = net.shells.get(id); if (sh) sh.material.opacity = on ? 0.13 : 0.02; });
  net.tubes.forEach((m, k) => { m.material.opacity = !L ? 0.85 : (L.T.has(k) ? 1 : 0.05); });
  const bar = $('hlBar'), h = net.hl;
  bar.classList.toggle('hidden', !h || st.view !== 'net' || !$('dataView').classList.contains('hidden'));
  if (!h) return;
  const ord = {}; st.scenes.forEach((s) => { ord[s.id] = s.scene_order; });
  const nm = (id) => (id in ord ? ord[id] + '번' : '(지워진 씬)');
  let t = '';
  if (h.type === 'scene') { const d = dotSize(h.id); t = nm(h.id) + ' 씬 — 찾아온 횟수 ' + d.a + ' · 머문 줄 ' + d.v + ' · 이어진 씬 ' + (L.S.size - 1) + '곳'; }
  else if (h.type === 'pair') t = nm(h.a) + ' ↔ ' + nm(h.b) + ' — ' + nm(h.a) + ' → ' + nm(h.b) + ' ' + (net.edges[h.a + '|' + h.b] || 0) + '번 · ' + nm(h.b) + ' → ' + nm(h.a) + ' ' + (net.edges[h.b + '|' + h.a] || 0) + '번';
  else { const r = net.runList.find((x) => String(x.id) === h.id); t = '걸음 ' + String(h.id).slice(0, 8) + (r ? ' (' + when(r.rows[0].created_at) + ') — ' + r.rows.map((x) => nm(x.scene_id).replace('번', '')).join(' → ') : ''); }
  $('hlText').textContent = t;
}
function setHl(h) { net.hl = h; applyHl(); }
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
  $('tabs').classList.remove('hidden'); setTab('model');
}

// ── overview, second tab: what the net is made from ─────────────────────────
// Read-only. Shows the same numbers buildNetData/layoutNet/buildNet just used, nothing recomputed
// by a second rule: ledger rows -> runs -> visits (points) + moves (lines) -> positions.
const escH = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function setTab(which) {
  const data = which === 'data';
  $('tabModel').classList.toggle('on', !data); $('tabData').classList.toggle('on', data);
  $('dataView').classList.toggle('hidden', !data); $('tip').classList.toggle('hidden', data); $('labels').classList.toggle('hidden', data);
  if (data) renderData();
  applyHl();
}
function who(pid) { return pid === 'piece-move' ? '지도 점을 눌러 옮김' : pid === 'author-seed' ? '작가가 심은 줄' : pid ? '가짜 관객 (' + pid + ')' : '관객'; }
function when(t) { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function renderData() {
  const ord = {}; st.scenes.forEach((s) => { ord[s.id] = s.scene_order; });
  const nm = (id) => (id in ord ? ord[id] + '번' : '(지워진 씬)');
  const f2 = (n) => Number(n).toFixed(2);
  const kept = st.plays.length - net.dropped;
  const byWho = {}; st.plays.forEach((p) => { const k = who(p.persona_id); byWho[k] = (byWho[k] || 0) + 1; });
  const edgeKeys = Object.keys(net.edges), pairs = [], seen = new Set();
  edgeKeys.forEach((k) => {
    const [a, b] = k.split('|'); if (seen.has(b + '|' + a)) return; seen.add(k);
    const go = net.edges[k], back = net.edges[b + '|' + a] || 0, drawn = !!(net.pos[a] && net.pos[b]);
    pairs.push({ a, b, go, back, sum: go + back, drawn });
  });
  pairs.sort((x, y) => y.sum - x.sum);
  const runs = net.runList.slice().sort((x, y) => new Date(y.rows[0].created_at) - new Date(x.rows[0].created_at));
  const RUN_MAX = 300, ROW_MAX = 500, cur = hlKey(net.hl);
  let h = '';
  h += '<h3>1. 재료 — 걸음 장부</h3>';
  h += '<p>이 기억에 남은 장부 줄을 읽어 옵니다. 한 줄은 "어느 걸음에서, 어느 씬에, 언제 있었나"입니다. 모형은 이 줄들만으로 만들어집니다. 감정 숫자는 쓰지 않습니다.</p>';
  h += '<p>표의 줄(씬, 씬 짝, 걸음)을 누르면 모형에서 그것만 밝게 보입니다.</p>';
  h += '<table><tr><th>무엇</th><th>수</th></tr>'
    + '<tr><td>읽어 온 장부 줄</td><td class="num">' + st.plays.length + '</td></tr>'
    + '<tr><td>그중 쓴 줄</td><td class="num">' + kept + '</td></tr>'
    + '<tr><td>버린 줄 (걸음 번호나 씬이 비어 있음)</td><td class="num">' + net.dropped + '</td></tr>'
    + '<tr><td>같은 걸음 안에서 시각이 똑같아 순서를 알 수 없는 줄 (씬 순서대로 세움)</td><td class="num">' + net.tied + '</td></tr>'
    + '<tr><td>걸음 수 (걸음 번호가 같은 줄끼리 한 묶음)</td><td class="num">' + net.runList.length + '</td></tr>'
    + '<tr><td>그중 씬을 한 번이라도 옮긴 걸음</td><td class="num">' + net.runs + '</td></tr>'
    + '<tr><td>씬 (점) 수</td><td class="num">' + st.scenes.length + '</td></tr>'
    + '<tr><td>이어진 씬 짝 (선) 수</td><td class="num">' + pairs.filter((p) => p.drawn).length + '</td></tr></table>';
  h += '<p style="margin-top:12px">누가 남긴 줄인가 — 지금 모형은 아래 줄을 가리지 않고 전부 셉니다.</p><table><tr><th>남긴 쪽</th><th>줄 수</th></tr>'
    + Object.keys(byWho).sort((a, b) => byWho[b] - byWho[a]).map((k) => '<tr><td>' + escH(k) + '</td><td class="num">' + byWho[k] + '</td></tr>').join('') + '</table>';

  h += '<h3>2. 점 — 씬마다 찾아온 횟수와 머문 줄 수</h3>';
  h += '<p>걸음마다 줄을 시간 순으로 세우고 두 가지를 따로 셉니다. <b>찾아온 횟수</b> = 그 씬에 들어온 횟수(걸음의 첫 줄이거나, 바로 앞 줄과 씬이 다를 때 1번. 같은 걸음이 나갔다가 다시 오면 또 1번). <b>머문 줄 수</b> = 그 씬에서 남긴 줄 수(같은 씬에서 말을 세 번 이으면 3. 지도 점을 눌러 옮긴 줄은 넣지 않음). 모형에서 속 구슬 크기 = 1.0 + 1.4 × (찾아온 횟수 ÷ 이 기억에서 가장 큰 찾아온 횟수), 겉 껍질 크기 = 속 구슬 + 0.25 + 1.0 × (머문 줄 수 ÷ 이 기억에서 가장 큰 머문 줄 수). 한 번도 안 찾아온 씬은 회색이고 껍질이 없습니다.</p>';
  h += '<table><tr><th>씬</th><th>글 앞머리</th><th>찾아온 걸음 수</th><th>찾아온 횟수</th><th>머문 줄 수</th><th>한 번 올 때 평균 줄</th><th>속 구슬</th><th>겉 껍질</th><th>색</th><th>세운 것</th><th>자리 (가로, 높이, 깊이)</th></tr>'
    + st.scenes.map((s) => {
      const d = dotSize(s.id), pr = (parseMeta(s.meta).piece || {}).props, P = net.pos[s.id] || [0, 0, 0];
      return '<tr class="lk' + (cur === 'scene:' + s.id ? ' on' : '') + '" data-hl="scene:' + escH(s.id) + '"><td>' + escH(s.scene_order) + '번</td><td class="txt">' + escH(String(s.text || '').slice(0, 14)) + '</td><td class="num">' + (net.walkers[s.id] || 0) + '</td><td class="num">' + d.a + '</td><td class="num">' + d.v + '</td><td class="num">' + (d.a ? f2(d.v / d.a) : '–') + '</td><td class="num">' + f2(d.core) + '</td><td class="num">' + (d.shell ? f2(d.shell) : '–') + '</td>'
        + '<td><span class="sw" style="background:' + (d.a ? '#f2dfbc' : '#7d8492') + '"></span>' + (d.a ? '밝음' : '회색') + '</td><td class="num">' + (Array.isArray(pr) ? pr.length : 0) + '</td>'
        + '<td class="num">' + P.map((x) => x.toFixed(1)).join(', ') + '</td></tr>';
    }).join('') + '</table>';

  h += '<h3>3. 선 — 씬 사이를 옮긴 횟수</h3>';
  h += '<p>같은 걸음 안에서 바로 앞 줄과 씬이 다르면 "옮김 1번"입니다. 지도 점을 눌러 옮긴 것도 여기에는 셉니다. 선 굵기 = 0.1 + (가는 횟수 + 오는 횟수) × 0.07 (가장 굵을 때 0.7). 양쪽으로 다 걸었으면 초록, 한쪽으로만 걸었으면 베이지입니다.</p>';
  if (!pairs.length) h += '<p>아직 씬 사이를 옮긴 줄이 없습니다. 그래서 모형에는 씬 순서대로 이은 점선만 그려져 있습니다.</p>';
  else h += '<table><tr><th>씬 짝</th><th>한쪽 방향</th><th>반대 방향</th><th>합</th><th>당기는 세기</th><th>점 사이 거리</th><th>선 굵기</th><th>색</th></tr>'
    + pairs.map((p) => '<tr class="lk' + (cur === 'pair:' + pairKey(p.a, p.b) ? ' on' : '') + '" data-hl="pair:' + escH(p.a + '|' + p.b) + '"><td>' + escH(nm(p.a)) + ' ↔ ' + escH(nm(p.b)) + '</td><td>' + escH(nm(p.a)) + ' → ' + escH(nm(p.b)) + ': <b>' + p.go + '</b></td><td>' + escH(nm(p.b)) + ' → ' + escH(nm(p.a)) + ': <b>' + p.back + '</b></td><td class="num">' + p.sum + '</td>'
      + (p.drawn ? '<td class="num">' + f2(net.pull[p.a < p.b ? p.a + '|' + p.b : p.b + '|' + p.a] || 0) + '</td><td class="num">' + Math.hypot(net.pos[p.a][0] - net.pos[p.b][0], net.pos[p.a][1] - net.pos[p.b][1], net.pos[p.a][2] - net.pos[p.b][2]).toFixed(1) + '</td><td class="num">' + f2(0.1 + Math.min(0.6, 0.07 * p.sum)) + '</td><td><span class="sw" style="background:' + (p.back ? '#8fd0a0' : '#d8c4a0') + '"></span>' + (p.back ? '오고 간 길' : '한쪽 길') + '</td>'
        : '<td colspan="4" class="warn">그리지 않음 (지워진 씬이 끼어 있음)</td>') + '</tr>').join('') + '</table>';

  h += '<h3>4. 자리 — 어떻게 놓이나</h3>';
  h += '<p>위·아래·좌우에는 뜻이 없고, 가까움에만 뜻이 있습니다. 정하는 순서는 이렇습니다. ① 씬마다 고유 번호로 공 위의 처음 자리를 정합니다(같은 기억이면 늘 같은 자리에서 시작). ② 모든 점이 서로를 밀어냅니다. ③ 걸은 길로 이어진 두 점은 서로 당깁니다. 당기는 세기 = 그 짝이 오간 횟수(가는 횟수 + 오는 횟수) ÷ 이 기억의 짝들이 오간 횟수의 평균. 평균만큼 오간 짝은 세기 1, 평균의 두 배 오간 짝은 세기 2입니다. 그래서 많이 오간 씬일수록 가까이 붙습니다. ④ 씬 순서가 이웃인 두 점도 약하게 당깁니다(세기 0.18) — 아무도 안 걸었을 때 점이 흩어지지 않게 하려는 것입니다. ⑤ 이것을 260번 되풀이한 뒤 한가운데로 옮기고, 가장 먼 점이 26만큼 떨어지도록 크기를 맞춥니다. 다만 점 하나가 여러 길에 동시에 당겨지기 때문에, 거리가 횟수 순서와 꼭 맞아떨어지지는 않습니다. 위 3번 표의 "점 사이 거리"에서 실제 값을 볼 수 있습니다.</p>';

  h += '<h3>5. 걸음별 기록</h3>';
  h += '<p>걸음 하나가 지나간 씬을 시간 순으로 적은 것입니다. 위 2번과 3번의 수는 전부 여기서 센 것입니다. <span class="mv">파란 숫자</span>는 지도 점을 눌러 옮긴 줄입니다.' + (runs.length > RUN_MAX ? ' 최근 ' + RUN_MAX + '개만 보입니다 (전체 ' + runs.length + '개).' : '') + '</p>';
  h += '<table><tr><th>시작</th><th>남긴 쪽</th><th>줄 수</th><th>지나간 씬</th><th>걸음 번호</th></tr>'
    + runs.slice(0, RUN_MAX).map((r) => {
      const first = r.rows.find((x) => x.persona_id !== 'piece-move') || r.rows[0];
      return '<tr class="lk' + (cur === 'run:' + r.id ? ' on' : '') + '" data-hl="run:' + escH(r.id) + '"><td>' + escH(when(r.rows[0].created_at)) + '</td><td>' + escH(who(first.persona_id)) + '</td><td class="num">' + r.rows.length + '</td><td class="seq">'
        + r.rows.map((x) => '<span' + (x.persona_id === 'piece-move' ? ' class="mv"' : '') + '>' + escH(nm(x.scene_id).replace('번', '')) + '</span>').join(' → ') + '</td><td style="color:var(--dim)">' + escH(String(r.id).slice(0, 8)) + '</td></tr>';
    }).join('') + '</table>';

  const raw = st.plays.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  h += '<h3>6. 장부 원본 줄</h3>';
  h += '<details><summary>펼쳐 보기 (' + raw.length + '줄' + (raw.length > ROW_MAX ? ' 가운데 최근 ' + ROW_MAX + '줄' : '') + ')</summary>'
    + '<table><tr><th>시각</th><th>걸음 번호</th><th>씬</th><th>남긴 쪽</th><th>쓰임</th></tr>'
    + raw.slice(0, ROW_MAX).map((p) => '<tr><td>' + escH(when(p.created_at)) + '</td><td style="color:var(--dim)">' + escH(p.run_id ? String(p.run_id).slice(0, 8) : '없음') + '</td><td>' + escH(p.scene_id ? nm(p.scene_id) : '없음') + '</td><td>' + escH(who(p.persona_id)) + '</td>'
      + '<td>' + (!p.run_id || !p.scene_id ? '<span class="warn">버림</span>' : p.persona_id === 'piece-move' ? '선에만' : '점과 선') + '</td></tr>').join('') + '</table></details>';
  h += '<p style="margin-top:18px"><button id="dataCopy">표에 쓴 수 전부 복사</button> <span id="dataCopyMsg"></span></p>';
  $('dataView').innerHTML = h;
  $('dataCopy').onclick = () => {
    const out = {
      memory: st.memory.code || st.memory.id, rows_read: st.plays.length, rows_dropped: net.dropped,
      points: st.scenes.map((s) => ({ scene_id: s.id, scene_order: s.scene_order, walks_that_came: net.walkers[s.id] || 0, arrivals: net.arrivals[s.id] || 0, rows_left: net.visits[s.id] || 0, position: net.pos[s.id] || null })),
      lines: pairs.map((p) => ({ from: p.a, to: p.b, forward: p.go, backward: p.back, drawn: p.drawn })),
      runs: runs.map((r) => ({ run_id: r.id, rows: r.rows.map((x) => ({ scene_id: x.scene_id, created_at: x.created_at, persona_id: x.persona_id || null })) })),
    };
    navigator.clipboard.writeText(JSON.stringify(out, null, 2)).then(() => { $('dataCopyMsg').textContent = '복사했습니다.'; }, () => { $('dataCopyMsg').textContent = '복사하지 못했습니다.'; });
  };
}
$('tabModel').onclick = () => setTab('model'); $('tabData').onclick = () => setTab('data');
$('dataView').addEventListener('click', (e) => {
  const tr = e.target.closest && e.target.closest('tr[data-hl]'); if (!tr) return;
  const v = tr.dataset.hl, i = v.indexOf(':'), type = v.slice(0, i), rest = v.slice(i + 1);
  if (type === 'pair') { const [a, b] = rest.split('|'); setHl({ type, a, b }); } else setHl({ type, id: rest });
  setTab('model');
});
$('hlClear').onclick = () => setHl(null);
$('hlToTable').onclick = () => { setTab('data'); const row = $('dataView').querySelector('tr.on'); if (row) row.scrollIntoView({ block: 'center' }); };
canvas.addEventListener('pointermove', (e) => { if (st.view !== 'net') return; net.hover = netDrag ? null : nodeHit(e); canvas.style.cursor = net.hover ? 'pointer' : ''; });
canvas.addEventListener('pointerleave', () => { net.hover = null; });

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
  } else if (prop.kind === 'word') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe8e0f6, transparent: true, opacity: 0.9 })); b.position.y = 1.9; g.add(b);
  } else if (prop.kind === 'buried') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 10), new THREE.MeshStandardMaterial({ color: 0x5a4f46, roughness: 1 })); b.scale.set(1, 0.3, 1); g.add(b);
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: speaking ? 0xd9b98a : 0x77808c, roughness: 0.8 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat); b.position.y = 0.55; g.add(b);
  }
  return g;
}
const glb = {};
function loadGlb(path) { return glb[path] || (glb[path] = new Promise((res, rej) => new THREE.GLTFLoader().load(path, (g) => res(g.scene), undefined, rej))); }
const KIND = { 'object:speaking': '글이 든 사물', 'object:scenery': '환경 사물', 'figure:speaking': '말 거는 마네킹', 'figure:scenery': '서 있는 마네킹', 'sound:scenery': '소리 자리', 'sound:speaking': '소리 자리',
  'word:scenery': '떠 있는 말', 'word:speaking': '떠 있는 말', 'buried:scenery': '묻힌 말', 'buried:speaking': '묻힌 말' };
KIND['build:scenery'] = KIND['build:speaking'] = '방 조각';
const KIT = 2.4, SNAP = 0.6;   // building kit: unit -> world; positions snap to a quarter of a wall
const snapBuild = (p) => { if (p.kind !== 'build') return; p.x = +(Math.round(p.x / SNAP) * SNAP).toFixed(2); p.z = +(Math.round(p.z / SNAP) * SNAP).toFixed(2); p.rot = +(Math.round((Number(p.rot) || 0) / (Math.PI / 2)) * (Math.PI / 2)).toFixed(4); };
const isWordKind = (p) => p.kind === 'word' || p.kind === 'buried';
function kindName(p) { return KIND[p.kind + ':' + p.role] || p.kind; }
function makeMarker(prop) {
  const old = st.markers.get(prop.id); if (old) propGroup.remove(old);
  const g = new THREE.Group(); g.userData.propId = prop.id;
  const inner = new THREE.Group(); inner.name = 'inner'; g.add(inner);
  const stand = bodyOf(prop); inner.add(stand);
  const entry = prop.kind !== 'sound' && !isWordKind(prop) && prop.model && st.memory.meta.object_models && st.memory.meta.object_models[prop.model];
  if (entry && entry.path && prop.kind === 'build') {
    loadGlb(entry.path).then((tpl) => { const o = tpl.clone(true); o.scale.setScalar(KIT); o.position.y = Number(prop.lift) || 0; inner.remove(stand); inner.add(o); }).catch(() => {});
  } else if (entry && entry.path) {
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
  const lb = label((isWordKind(prop) ? (prop.text || kindName(prop)) : (prop.name || kindName(prop))) + (prop.click_sound_url ? ' ♪' : ''), prop.kind === 'sound' ? '#a9dbe8' : (prop.role === 'speaking' ? '#ffe9c4' : '#aeb6c4'));
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
  (TP.roomProps ? TP.roomProps(st.scene.id) : []).forEach((rp) => {
    const e = st.memory.meta.object_models && st.memory.meta.object_models[rp.model]; if (!e || !e.path) return;
    const g = new THREE.Group(); g.position.set(rp.x, heightAt(rp.x, rp.z) + (Number(rp.lift) || 0), rp.z); g.rotation.y = rp.rot; fixedGroup.add(g);
    loadGlb(e.path).then((tpl) => { const o = tpl.clone(true); o.scale.setScalar(KIT * (Number(rp.scale) || 1)); g.add(o); }).catch(() => {});
  });
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
  const prop = st.props.find((x) => x.id === drag); prop.x = +p.x.toFixed(2); prop.z = +p.z.toFixed(2); snapBuild(prop);
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
  const isSound = p.kind === 'sound', isWord = isWordKind(p), speaking = isWord || (p.role === 'speaking' && !isSound);
  $('fName').value = p.name || ''; $('fKind').value = p.kind; $('fRole').value = p.role;
  $('fRole').parentElement.classList.toggle('hidden', isSound || isWord || p.kind === 'build');
  $('shapeWrap').classList.toggle('hidden', isSound || isWord);
  const models = Object.keys(st.memory.meta.object_models || {});
  $('fModel').innerHTML = '<option value="">' + (p.kind === 'figure' ? '기본 마네킹' : '모형 없음 — 무대에 안 나옴') + '</option>' + models.map((m) => `<option value="${m}">${m}</option>`).join('');
  $('fModel').value = models.includes(p.model) ? p.model : '';
  $('fScale').value = p.scale || 1; $('fScaleV').textContent = (+p.scale || 1).toFixed(2);
  const deg = Math.round(((Number(p.rot) || 0) * 180 / Math.PI + 360) % 360); $('fRot').value = deg; $('fRotV').textContent = deg + '°';
  $('textWrap').classList.toggle('hidden', !speaking);
  $('againWrap').classList.toggle('hidden', !(speaking && p.kind === 'figure'));
  $('fTextL').textContent = p.kind === 'figure' ? '대사 — 끝까지 다 나오고, 마지막 문장에서 끊겨 관객이 이어 씁니다'
    : p.kind === 'word' ? '공중에 떠 있는 말' : p.kind === 'buried' ? '땅에 묻힌 말 — 관객이 그 자리에서 세 번 파내면 올라옵니다' : '들여다보면 뜨는 글';
  $('fText').value = p.text || ''; $('fAgain').value = p.text_again || '';
  soundOptions($('fSndSel'), p.sound_url); $('fSnd').value = p.sound_url || '';
  $('fSndVol').value = p.sound_volume != null ? p.sound_volume : 0.7; $('fSndVolV').textContent = (+$('fSndVol').value).toFixed(2);
  $('fSndRad').value = p.sound_radius || 22; $('fSndRadV').textContent = $('fSndRad').value;
  $('clickBox').classList.toggle('hidden', isSound || p.kind === 'word');
  $('clickHelp').textContent = p.kind === 'buried' ? '말이 땅에서 올라오는 순간 한 번 납니다.' : p.kind === 'figure'
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
bind('fRot', 'input', (p) => { p.rot = +(+$('fRot').value * Math.PI / 180).toFixed(3); snapBuild(p); $('fRotV').textContent = $('fRot').value + '°'; seat(p); });
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
  st.props.forEach((p) => { if (p.kind !== 'build' && !TP.inside(st.scene.id, p.x, p.z, 2)) { const q = TP.polar(st.scene.id, Math.atan2(p.z, p.x), 0.9); p.x = +q.x.toFixed(2); p.z = +q.z.toFixed(2); seat(p); } });
  touch();
});
// scene-level fields
['sText', 'sCut', 'sSee', 'sCueLine', 'sCueSnd', 'sCueEnd', 'sSt1', 'sSt2', 'sSt3', 'sEcho', 'sGhost', 'sSnd'].forEach((id) => $(id).addEventListener('input', touch));
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
  $('tabs').classList.add('hidden'); $('dataView').classList.add('hidden'); $('tip').classList.remove('hidden'); $('labels').classList.add('hidden'); $('hlBar').classList.add('hidden'); canvas.style.cursor = '';
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
  { const cu = piece.cue || {}; $('sCueLine').value = cu.line || ''; $('sCueSnd').value = cu.sound_url || ''; $('sCueEnd').checked = cu.end !== false && !!cu.line; }
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
  const cueLine = $('sCueLine').value.trim(), cueSnd = $('sCueSnd').value.trim();
  const prevCue = (meta.piece && meta.piece.cue) || {};
  const _keepPiece = {}; ['ghost', 'spawn', 'ghost_body', 'ghost_scale', 'room'].forEach((k) => { if (meta.piece && meta.piece[k] != null) _keepPiece[k] = meta.piece[k]; });
  meta.piece = Object.assign(_keepPiece, (cueLine && cueSnd) ? { cue: Object.assign({}, prevCue, { line: cueLine, sound_url: cueSnd, end: $('sCueEnd').checked }) } : {}, {
    flat: !!(parseMeta(fresh.data && fresh.data.meta).piece || {}).flat || st.props.some((p) => p.kind === 'build'),   // a room stands on level ground
    objects_in_piece: true,   // this scene's things now live in the piece; the old scattered ones are not stood
    size: +st.size.toFixed(2), cut: $('sCut').value === 'stem' ? 'stem' : 'end', see_line: $('sSee').value.trim(),
    props: st.props.map((p) => {
      const isSound = p.kind === 'sound', isWord = isWordKind(p), speaking = isWord || (p.role === 'speaking' && !isSound);
      return {
        id: p.id, kind: p.kind, role: (isSound || isWord) ? 'scenery' : p.role, name: p.name || '', model: (isSound || isWord) ? '' : (p.model || ''),
        x: p.x, z: p.z, rot: Number(p.rot) || 0, scale: Number(p.scale) || 1,
        text: speaking ? (p.text || '') : '', text_again: (speaking && p.kind === 'figure') ? (p.text_again || '') : '',
        sound_url: p.sound_url || '', sound_volume: Number(p.sound_volume), sound_radius: Number(p.sound_radius) || 22,
        click_sound_url: isSound ? '' : (p.click_sound_url || ''), click_sound_volume: Number(p.click_sound_volume),
        ...(p.kind === 'build' ? { lift: Number(p.lift) || 0, light: Number(p.light) || 0, ...(p.tint ? { tint: p.tint } : {}) } : {}),
      };
    }),
  });
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

// The server hands back a limited number of rows per request, so read the ledger page by page
// until a page comes back empty (261121 — before this, a memory with more rows than one page lost the rest).
async function fetchAllPlays(memoryId) {
  const PAGE = Math.max(1, Number(qs.get('page_rows')) || 1000), out = [];
  for (;;) {
    const r = await sb.from('plays').select('id, memory_id, scene_id, user_emotion, alignment, mismatch_type, created_at, user_id, persona_id, run_id')
      .eq('memory_id', memoryId).order('created_at', { ascending: true }).order('id', { ascending: true }).range(out.length, out.length + PAGE - 1);
    if (r.error) throw new Error('걸음 장부를 읽지 못했습니다 — ' + r.error.message);
    if (!r.data || !r.data.length) break;
    out.push(...r.data);
  }
  return out;
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
    fetchAllPlays(st.memory.id),
  ]);
  st.scenes = sc.data || [];
  st.plays = pl;
  TP.setScenes(st.scenes);
  if (TP.setPlays) TP.setPlays(st.plays.filter((p) => p.persona_id !== 'piece-move'));   // the land of each piece is shaped by its walks
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

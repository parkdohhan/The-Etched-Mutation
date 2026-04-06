/* global THREE, supabase */
// AF Terrain DB test — loaded by af-terrain-test.html

const AX = { self_blame: -1, other_blame: 0, fate_blame: 1 };
const FZ = { abandonment: -1, rejection: -0.33, powerlessness: 0.33, loss: 1 };
const E2A = {
  fear: { s: 0.2, o: 0.1, f: 0.7 }, sadness: { s: 0.3, o: 0.1, f: 0.6 }, anger: { s: 0.1, o: 0.7, f: 0.2 },
  guilt: { s: 0.8, o: 0.05, f: 0.15 }, shame: { s: 0.75, o: 0.15, f: 0.1 }, joy: { s: 0.3, o: 0.3, f: 0.4 },
  numbness: { s: 0.15, o: 0.05, f: 0.8 }, isolation: { s: 0.3, o: 0.3, f: 0.4 }, longing: { s: 0.2, o: 0.2, f: 0.6 },
  resentment: { s: 0.1, o: 0.8, f: 0.1 }, resignation: { s: 0.1, o: 0.05, f: 0.85 }, hope: { s: 0.2, o: 0.2, f: 0.6 },
  relief: { s: 0.2, o: 0.1, f: 0.7 }, love: { s: 0.15, o: 0.3, f: 0.55 }, gratitude: { s: 0.15, o: 0.35, f: 0.5 },
  peace: { s: 0.15, o: 0.15, f: 0.7 }, confusion: { s: 0.3, o: 0.2, f: 0.5 },
};
const E2F = {
  fear: { a: 0.15, r: 0.1, p: 0.55, l: 0.2 }, sadness: { a: 0.3, r: 0.1, p: 0.1, l: 0.5 },
  anger: { a: 0.1, r: 0.3, p: 0.5, l: 0.1 }, guilt: { a: 0.2, r: 0.25, p: 0.15, l: 0.4 },
  shame: { a: 0.15, r: 0.6, p: 0.1, l: 0.15 }, joy: { a: 0.15, r: 0.15, p: 0.15, l: 0.55 },
  numbness: { a: 0.3, r: 0.1, p: 0.4, l: 0.2 }, isolation: { a: 0.6, r: 0.25, p: 0.1, l: 0.05 },
  longing: { a: 0.55, r: 0.15, p: 0.05, l: 0.25 }, resentment: { a: 0.15, r: 0.35, p: 0.4, l: 0.1 },
  resignation: { a: 0.2, r: 0.05, p: 0.6, l: 0.15 }, hope: { a: 0.2, r: 0.15, p: 0.15, l: 0.5 },
  relief: { a: 0.1, r: 0.1, p: 0.3, l: 0.5 }, love: { a: 0.4, r: 0.2, p: 0.1, l: 0.3 },
  gratitude: { a: 0.2, r: 0.15, p: 0.1, l: 0.55 }, peace: { a: 0.15, r: 0.1, p: 0.15, l: 0.6 },
  confusion: { a: 0.2, r: 0.2, p: 0.4, l: 0.2 },
};
const EC = {
  fear: [0.4, 0.28, 0.7], sadness: [0.25, 0.38, 0.65], anger: [0.8, 0.25, 0.22], guilt: [0.6, 0.48, 0.35],
  longing: [0.28, 0.62, 0.65], numbness: [0.32, 0.32, 0.38], shame: [0.58, 0.35, 0.48], isolation: [0.14, 0.14, 0.24],
  joy: [0.82, 0.72, 0.38], resentment: [0.6, 0.2, 0.15], resignation: [0.4, 0.38, 0.35], hope: [0.55, 0.65, 0.45],
  relief: [0.48, 0.68, 0.48], love: [0.7, 0.4, 0.5], gratitude: [0.65, 0.58, 0.4], peace: [0.45, 0.58, 0.52],
  confusion: [0.48, 0.38, 0.55],
};

function pX(d) {
  let x = 0; let w = 0;
  for (const [k, v] of Object.entries(d)) {
    if (AX[k] !== undefined && v > 0) { x += v * AX[k]; w += v; }
  }
  return w > 0 ? Math.max(-1, Math.min(1, x / w)) : 0;
}
function pZ(d) {
  let z = 0; let w = 0;
  for (const [k, v] of Object.entries(d)) {
    if (FZ[k] !== undefined && v > 0) { z += v * FZ[k]; w += v; }
  }
  return w > 0 ? Math.max(-1, Math.min(1, z / w)) : 0;
}
function eA(ev) {
  const r = { self_blame: 0, other_blame: 0, fate_blame: 0 }; let t = 0;
  for (const [e, i] of Object.entries(ev)) {
    const m = E2A[e];
    if (!m || i <= 0) continue;
    r.self_blame += i * m.s; r.other_blame += i * m.o; r.fate_blame += i * m.f; t += i;
  }
  if (t <= 0) return { self_blame: 0.33, other_blame: 0.33, fate_blame: 0.34 };
  r.self_blame /= t; r.other_blame /= t; r.fate_blame /= t;
  return r;
}
function eF(ev) {
  const r = { abandonment: 0, rejection: 0, powerlessness: 0, loss: 0 }; let t = 0;
  for (const [e, i] of Object.entries(ev)) {
    const m = E2F[e];
    if (!m || i <= 0) continue;
    r.abandonment += i * m.a; r.rejection += i * m.r; r.powerlessness += i * m.p; r.loss += i * m.l; t += i;
  }
  if (t <= 0) return { abandonment: 0.25, rejection: 0.25, powerlessness: 0.25, loss: 0.25 };
  r.abandonment /= t; r.rejection /= t; r.powerlessness /= t; r.loss /= t;
  return r;
}
function getDom(ev) {
  let mk = 'numbness'; let mv = 0;
  for (const [k, v] of Object.entries(ev)) {
    if (v > mv && EC[k]) { mk = k; mv = v; }
  }
  return mk;
}

function playAlignment(play) {
  if (play.alignment != null) return Number(play.alignment);
  if (play.alignment_score != null) return Number(play.alignment_score);
  return 0.5;
}

/** 같은 AF 폴백이어도 기둥이 겹치지 않게 memory id 기반 오프셋 (월드 단위) */
function hashWorldOffset(id) {
  let h = 5381;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  h = Math.abs(h);
  const ang = (h % 628) / 100;
  const mag = 1.4 + (h % 700) / 180;
  return { ox: Math.cos(ang) * mag, oz: Math.sin(ang * 1.07) * mag };
}

let sb; let scene3; let camera; let renderer; let controls; let terrain; let terrainWire; let seedGrp; let sD = []; let P = [];
/** null = 전체 기억 합산, 숫자 = 해당 인덱스만 지형에 반영 */
let terrainMemFilter = null;
const G = 110; const SZ = 80; const H2 = SZ / 2;
let hts; let cls; let pos;

document.getElementById('goBtn').onclick = async () => {
  const url = document.getElementById('sbUrl').value.trim();
  const key = document.getElementById('sbKey').value.trim();
  const err = document.getElementById('errMsg');
  if (!url || !key) { err.textContent = 'URL과 KEY를 입력하세요'; return; }
  err.textContent = '연결 중...';

  try {
    sb = supabase.createClient(url, key);

    const { data: mems, error: e1 } = await sb.from('memories').select('id, title, memory_words, completed_sentence').order('id', { ascending: true });
    if (e1) throw new Error('memories: ' + e1.message);
    if (!mems || !mems.length) throw new Error('memories 테이블이 비어있습니다');

    const memIds = mems.map((m) => m.id);
    const { data: allPlays, error: e2 } = await sb
      .from('plays')
      .select('id, memory_id, scene_id, user_emotion, alignment, mismatch_type, created_at')
      .in('memory_id', memIds);
    if (e2) throw new Error('plays: ' + e2.message);

    const playsByMem = {};
    (allPlays || []).forEach((p) => {
      if (!playsByMem[p.memory_id]) playsByMem[p.memory_id] = [];
      playsByMem[p.memory_id].push(p);
    });

    P = mems.map((m) => {
      const plays = playsByMem[m.id] || [];
      const merged = {};
      plays.forEach((p) => {
        if (!p.user_emotion) return;
        let ue = p.user_emotion;
        if (typeof ue === 'string') {
          try { ue = JSON.parse(ue); } catch (_) { return; }
        }
        for (const [k, v] of Object.entries(ue)) {
          merged[k] = (merged[k] || 0) + (typeof v === 'number' ? v : 0);
        }
      });
      const n = plays.length || 1;
      for (const k of Object.keys(merged)) merged[k] /= n;

      const attr = eA(Object.keys(merged).length ? merged : { numbness: 1 });
      const fear = eF(Object.keys(merged).length ? merged : { numbness: 1 });

      const af = { x: pX(attr), z: pZ(fear) };
      const off = hashWorldOffset(m.id);
      return {
        id: m.id,
        t: m.title || m.completed_sentence || m.memory_words || '(제목 없음)',
        plays,
        pc: plays.length,
        emo: Object.keys(merged).length ? merged : { numbness: 0.5 },
        attr,
        fear,
        af,
        pillarWx: af.x * H2 + off.ox,
        pillarWz: af.z * H2 + off.oz,
      };
    });

    err.textContent = `${P.length}개 기억, ${allPlays?.length || 0}개 plays 로드 완료. 렌더링...`;
    setTimeout(() => {
      document.getElementById('cfg').classList.add('off');
      document.getElementById('hud').style.display = 'block';
      if (!scene3) initThree();
      terrainMemFilter = null;
      buildTerrain(null);
      buildHUD();
      if (!window._afAnimStarted) { window._afAnimStarted = true; animate(); }
    }, 300);
  } catch (ex) {
    err.textContent = ex.message;
    console.error(ex);
  }
};

function initThree() {
  const cv = document.getElementById('c');
  scene3 = new THREE.Scene();
  scene3.background = new THREE.Color(0x07070b);
  scene3.fog = new THREE.FogExp2(0x07070b, 0.003);

  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);
  camera.position.set(75, 50, 90);

  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  controls = new THREE.OrbitControls(camera, cv);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 12;
  controls.maxDistance = 250;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, -1, 0);

  scene3.add(new THREE.AmbientLight(0x1a1828, 1.3));
  const dl = new THREE.DirectionalLight(0xc4a882, 0.7);
  dl.position.set(55, 80, 40); dl.castShadow = true;
  dl.shadow.mapSize.set(1024, 1024);
  dl.shadow.camera.left = -70; dl.shadow.camera.right = 70; dl.shadow.camera.top = 70; dl.shadow.camera.bottom = -70;
  scene3.add(dl);
  const dl2 = new THREE.DirectionalLight(0x3a4a80, 0.3); dl2.position.set(-40, 50, -30); scene3.add(dl2);
  window.oP1 = new THREE.PointLight(0x7a3020, 0.4, 100); scene3.add(oP1);
  window.oP2 = new THREE.PointLight(0x203a7a, 0.25, 80); scene3.add(oP2);

  const bp = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x050509, roughness: 1 }));
  bp.rotation.x = -Math.PI / 2; bp.position.y = -12; scene3.add(bp);

  const pc2 = 800; const pg2 = new THREE.BufferGeometry(); const pp2 = new Float32Array(pc2 * 3);
  window.pVl = new Float32Array(pc2);
  for (let i = 0; i < pc2; i++) {
    pp2[i * 3] = (Math.random() - 0.5) * SZ * 2;
    pp2[i * 3 + 1] = Math.random() * 30 - 8;
    pp2[i * 3 + 2] = (Math.random() - 0.5) * SZ * 2;
    pVl[i] = 0.002 + Math.random() * 0.006;
  }
  pg2.setAttribute('position', new THREE.BufferAttribute(pp2, 3));
  window.parts = new THREE.Points(pg2, new THREE.PointsMaterial({ color: 0x3a3a50, size: 0.1, transparent: true, opacity: 0.3, sizeAttenuation: true }));
  scene3.add(parts);

  function mkD(x, y, z, c, s2) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(s2 || 0.2, 8, 8), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(x, y, z); scene3.add(m);
  }
  function mkL(a, b, c) {
    scene3.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), new THREE.LineBasicMaterial({ color: c, opacity: 0.2, transparent: true })));
  }
  mkD(-H2 * 0.9, -6, H2 + 3, 0xc44040, 0.3); mkD(0, -6, H2 + 3, 0x555555, 0.2); mkD(H2 * 0.9, -6, H2 + 3, 0x4050c4, 0.3);
  mkL([-H2 * 0.95, -5.8, H2 + 3], [H2 * 0.95, -5.8, H2 + 3], 0x332233);
  mkD(-H2 - 3, -6, -H2 * 0.9, 0xc4a040, 0.3); mkD(-H2 - 3, -6, 0, 0x555555, 0.2); mkD(-H2 - 3, -6, H2 * 0.9, 0x40c4a0, 0.3);
  mkL([-H2 - 3, -5.8, -H2 * 0.95], [-H2 - 3, -5.8, H2 * 0.95], 0x223333);

  window.TL = 400; window.trP = new Float32Array(TL * 3); window.trG2 = new THREE.BufferGeometry();
  trG2.setAttribute('position', new THREE.BufferAttribute(trP, 3)); trG2.setDrawRange(0, 0);
  scene3.add(new THREE.Line(trG2, new THREE.LineBasicMaterial({ color: 0x886644, opacity: 0.4, transparent: true })));
  window.trC = 0;

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

function hs(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function sN(x, y) {
  const ix = Math.floor(x); const iy = Math.floor(y); const fx = x - ix; const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
  return hs(ix, iy) * (1 - sx) * (1 - sy) + hs(ix + 1, iy) * sx * (1 - sy) + hs(ix, iy + 1) * (1 - sx) * sy + hs(ix + 1, iy + 1) * sx * sy;
}
function fb(x, y, o) { let v = 0; let a = 0.5; let f = 1; for (let i = 0; i < (o || 4); i++) { v += a * sN(x * f, y * f); a *= 0.5; f *= 2.1; } return v; }
function sR(s) {
  let v = s;
  return () => { v = (v * 16807) % 2147483647; return v / 2147483647; };
}

function disposeTerrainLayer() {
  if (terrain) {
    scene3.remove(terrain);
    if (terrain.geometry) terrain.geometry.dispose();
    if (terrain.material) terrain.material.dispose();
    terrain = null;
  }
  if (terrainWire) {
    scene3.remove(terrainWire);
    if (terrainWire.geometry) terrainWire.geometry.dispose();
    if (terrainWire.material) terrainWire.material.dispose();
    terrainWire = null;
  }
  if (seedGrp) {
    scene3.remove(seedGrp);
    seedGrp.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((mm) => mm.dispose());
        else obj.material.dispose();
      }
    });
    seedGrp = null;
  }
}

/**
 * @param {number|null} filterIdx — null이면 모든 기억을 한 지형에 합산, 숫자면 해당 기억만
 */
function buildTerrain(filterIdx) {
  terrainMemFilter = filterIdx;
  disposeTerrainLayer();
  hts = new Float32Array(G * G); cls = new Float32Array(G * G * 3);

  const layers = filterIdx == null
    ? P.map((m, mi) => ({ m, mi }))
    : (P[filterIdx] ? [{ m: P[filterIdx], mi: filterIdx }] : []);

  layers.forEach(({ m, mi }) => {
    const cx = m.pillarWx; const cz = m.pillarWz;
    const eT = Object.values(m.emo).reduce((s, v) => s + v, 0) || 1;
    const r = sR(mi * 777);

    for (let iz = 0; iz < G; iz++) for (let ix = 0; ix < G; ix++) {
      const wx = (ix / (G - 1) - 0.5) * SZ; const wz = (iz / (G - 1) - 0.5) * SZ;
      const inf = Math.exp(-((wx - cx) ** 2 + (wz - cz) ** 2) / 40.5);
      hts[iz * G + ix] += inf * Math.min(eT, 3) * 0.25;
      const ci = (iz * G + ix) * 3;
      for (const [e, v] of Object.entries(m.emo)) {
        const c = EC[e] || [0.3, 0.3, 0.3];
        cls[ci] += c[0] * v * inf * 0.12; cls[ci + 1] += c[1] * v * inf * 0.12; cls[ci + 2] += c[2] * v * inf * 0.12;
      }
    }

    m.plays.forEach((play) => {
      let ue = play.user_emotion;
      if (!ue) return;
      if (typeof ue === 'string') { try { ue = JSON.parse(ue); } catch (_) { return; } }
      const pAttr = eA(ue); const pFear = eF(ue);
      const jt = 0.12;
      const px2 = pX({
        self_blame: Math.max(0, (pAttr.self_blame || 0) + (r() - 0.5) * jt),
        other_blame: Math.max(0, (pAttr.other_blame || 0) + (r() - 0.5) * jt),
        fate_blame: Math.max(0, (pAttr.fate_blame || 0) + (r() - 0.5) * jt),
      }) * H2;
      const pz2 = pZ({
        abandonment: Math.max(0, (pFear.abandonment || 0) + (r() - 0.5) * jt),
        rejection: Math.max(0, (pFear.rejection || 0) + (r() - 0.5) * jt),
        powerlessness: Math.max(0, (pFear.powerlessness || 0) + (r() - 0.5) * jt),
        loss: Math.max(0, (pFear.loss || 0) + (r() - 0.5) * jt),
      }) * H2;

      const al = playAlignment(play);
      const isV = al < 0.15;
      const dm = Object.entries(pAttr).sort((a, b) => b[1] - a[1])[0][0];
      let sX = 5; let sZ2 = 5;
      if (dm === 'self_blame') { sX = 2.5; sZ2 = 2.5; } else if (dm === 'other_blame') { sX = 4; sZ2 = 3; }
      const ds = al > 0.4 ? 1 : -0.6;
      const inten = isV ? 0.12 : 0.4 + al * 0.5;

      for (let iz = 0; iz < G; iz++) for (let ix = 0; ix < G; ix++) {
        const wx = (ix / (G - 1) - 0.5) * SZ; const wz = (iz / (G - 1) - 0.5) * SZ;
        const inf = Math.exp(-((wx - px2) ** 2 / (sX * sX) + (wz - pz2) ** 2 / (sZ2 * sZ2)) / 2);
        const idx = iz * G + ix;
        if (isV) hts[idx] -= inf * fb(ix * 0.15, iz * 0.15, 3) * 0.21;
        else hts[idx] += inf * inten * ds * (0.5 + (fb(ix * 0.1 + mi, iz * 0.1, 4) - 0.35) * 0.7);
        const ci = idx * 3;
        for (const [e, v] of Object.entries(ue)) {
          const c = EC[e] || [0.3, 0.3, 0.3];
          const cI = inf * (typeof v === 'number' ? v : 0) * 0.025 * (isV ? 0.3 : 1);
          cls[ci] += c[0] * cI; cls[ci + 1] += c[1] * cI; cls[ci + 2] += c[2] * cI;
        }
      }
    });
  });

  if (!layers.length) {
    for (let iz = 0; iz < G; iz++) for (let ix = 0; ix < G; ix++) {
      hts[iz * G + ix] = 0;
    }
  }

  for (let iz = 0; iz < G; iz++) for (let ix = 0; ix < G; ix++) {
    const idx = iz * G + ix;
    hts[idx] += (fb(ix * 0.07, iz * 0.07, 5) - 0.4) * 1.8;
    const ci = idx * 3; const av = (cls[ci] + cls[ci + 1] + cls[ci + 2]) / 3;
    cls[ci] = cls[ci] * 0.85 + av * 0.15 + 0.035;
    cls[ci + 1] = cls[ci + 1] * 0.85 + av * 0.15 + 0.035;
    cls[ci + 2] = cls[ci + 2] * 0.85 + av * 0.15 + 0.05;
  }

  const geo = new THREE.PlaneGeometry(SZ, SZ, G - 1, G - 1); geo.rotateX(-Math.PI / 2);
  pos = geo.attributes.position.array; const colA = new Float32Array(pos.length);
  let mn = Infinity; let mx = -Infinity;
  for (let i = 0; i < G * G; i++) { if (hts[i] < mn) mn = hts[i]; if (hts[i] > mx) mx = hts[i]; }
  const rg = mx - mn || 1;
  for (let i = 0; i < G * G; i++) {
    pos[i * 3 + 1] = ((hts[i] - mn) / rg - 0.5) * 22;
    const ci = i * 3;
    colA[ci] = Math.min(1, Math.max(0, cls[ci]));
    colA[ci + 1] = Math.min(1, Math.max(0, cls[ci + 1]));
    colA[ci + 2] = Math.min(1, Math.max(0, cls[ci + 2]));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colA, 3)); geo.computeVertexNormals();
  terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.06, side: THREE.DoubleSide }));
  scene3.add(terrain);
  terrainWire = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ wireframe: true, color: 0x221833, opacity: 0.04, transparent: true }));
  scene3.add(terrainWire);

  seedGrp = new THREE.Group(); sD = [];
  const seedList = filterIdx == null ? P.map((m, i) => ({ m, i })) : (P[filterIdx] ? [{ m: P[filterIdx], i: filterIdx }] : []);
  seedList.forEach(({ m, i }) => {
    const wx = m.pillarWx; const wz = m.pillarWz; const h = gH(wx, wz);
    sD.push({ wx, wz, h, t: m.t, c: m.pc, idx: i });
    const de = getDom(m.emo); const ec = EC[de] || [0.5, 0.5, 0.5]; const col = new THREE.Color(ec[0], ec[1], ec[2]);
    const pH = 1.2 + Math.min(m.pc, 60) * 0.03;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, pH, 6), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.3 }));
    pillar.position.set(wx, h + pH / 2 + 0.2, wz); seedGrp.add(pillar);
    const pl2 = new THREE.PointLight(col, 0.3, 10, 2); pl2.position.set(wx, h + 2.5, wz); seedGrp.add(pl2);
  });
  scene3.add(seedGrp);

  const totalPlays = P.reduce((s, m) => s + m.pc, 0);
  if (filterIdx == null) {
    document.getElementById('desc').textContent = `${P.length}개 기억 · ${totalPlays}개 해석 누적 (전체 합산 지형)`;
  } else {
    const one = P[filterIdx];
    document.getElementById('desc').textContent = one
      ? `선택: "${one.t}" · ${one.pc}개 plays 만 반영`
      : '선택 없음';
  }
}

function gH(wx, wz) {
  if (!pos) return 0;
  const gx = ((wx / SZ) + 0.5) * (G - 1); const gz = ((wz / SZ) + 0.5) * (G - 1);
  const ix = Math.min(G - 2, Math.max(0, Math.floor(gx))); const iz = Math.min(G - 2, Math.max(0, Math.floor(gz)));
  const fx = gx - ix; const fz = gz - iz;
  return pos[(iz * G + ix) * 3 + 1] * (1 - fx) * (1 - fz)
    + pos[(iz * G + ix + 1) * 3 + 1] * fx * (1 - fz)
    + pos[((iz + 1) * G + ix) * 3 + 1] * (1 - fx) * fz
    + pos[((iz + 1) * G + ix + 1) * 3 + 1] * fx * fz;
}

let camMode = 'free'; let camT = 0; let camSpd = 1; let camFrom = null; let camTo = null; let camActive = false; let afterCb = null;
function ss(t) { return t * t * (3 - 2 * t); }
function eIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function getCPt(t) {
  if (!camFrom || !camTo) return null;
  const F = camFrom; const T = camTo;
  switch (camMode) {
    case 'echo_follow': {
      const e = eIO(t); const x = F.wx + (T.wx - F.wx) * e; const z = F.wz + (T.wz - F.wz) * e; const h = gH(x, z);
      return { x, y: h + 3 + Math.sin(t * Math.PI) * 1.5, z, lx: x * 0.3, ly: h, lz: z * 0.3 };
    }
    case 'contradiction': {
      const mx2 = (F.wx + T.wx) * 0.5 + (T.wz - F.wz) * 0.8; const mz2 = (F.wz + T.wz) * 0.5 - (T.wx - F.wx) * 0.8;
      let x; let z;
      if (t < 0.4) { const l = t / 0.4; x = F.wx + (mx2 - F.wx) * ss(l); z = F.wz + (mz2 - F.wz) * ss(l); }
      else { const l = (t - 0.4) / 0.6; x = mx2 + (T.wx - mx2) * eIO(l); z = mz2 + (T.wz - mz2) * eIO(l); }
      const h = gH(x, z);
      return { x, y: h + 5 + Math.sin(t * Math.PI * 2) * 2, z, lx: x * 0.3, ly: h, lz: z * 0.3, shake: t > 0.35 && t < 0.5 ? 0.35 : 0 };
    }
    case 'avoidance': {
      const ap = Math.min(t * 1.8, 1); const rt = Math.max(0, (t - 0.55) * 2.5);
      const dx = T.wx - F.wx; const dz = T.wz - F.wz;
      const reach = ss(ap) * 0.55; const pull = ss(rt) * 0.6;
      const x = F.wx + dx * (reach - pull); const z = F.wz + dz * (reach - pull); const h = gH(x, z);
      return { x, y: h + 4 + rt * 8, z, lx: x * 0.5, ly: h - rt * 3, lz: z * 0.5, fogB: rt * 0.5 };
    }
    case 'fixation': {
      const cr = 6 - t * 4; const an = t * Math.PI * 6;
      const x = F.wx + Math.cos(an) * cr; const z = F.wz + Math.sin(an) * cr; const h = gH(x, z);
      return { x, y: h + Math.max(1.5, 8 - t * 5), z, lx: F.wx, ly: F.h, lz: F.wz, vig: t };
    }
    case 'bridge': {
      const e = ss(t); const wbx = Math.sin(t * 12) * (1 - t) * 1.5; const wbz = Math.cos(t * 9) * (1 - t) * 1.2;
      const x = F.wx + (T.wx - F.wx) * e + wbx; const z = F.wz + (T.wz - F.wz) * e + wbz; const h = gH(x, z);
      return { x, y: h + 6 + Math.sin(t * Math.PI) * 2, z, lx: x * 0.3, ly: h, lz: z * 0.3 };
    }
    case 'overview': {
      const an = t * Math.PI * 2; const r2 = 52 + Math.sin(t * Math.PI) * 15;
      return { x: Math.sin(an) * r2, y: 30 + Math.sin(t * Math.PI) * 10, z: Math.cos(an) * r2, lx: 0, ly: 0, lz: 0 };
    }
    default: return null;
  }
}
function startP(mode, fi, ti, spd) {
  if (!sD.length) return;
  camMode = mode;
  camFrom = sD[fi % sD.length];
  camTo = sD[(ti !== undefined ? ti : (fi + 1)) % sD.length];
  camT = 0;
  camSpd = spd || 1;
  camActive = true;
  controls.enabled = false;
  trC = 0;
  trG2.setDrawRange(0, 0);
}
function stopP() { camActive = false; camMode = 'free'; controls.enabled = true; }
function shLb(t, s) {
  const el = document.getElementById('mlbl');
  el.innerHTML = `<div style="font-size:11px;letter-spacing:4px;color:#665555;margin-bottom:6px">${t}</div><div style="font-size:9px;color:#556;max-width:280px;line-height:1.5">${s}</div>`;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

let seqQ = [];
function playSq() {
  if (!seqQ.length) { stopP(); return; }
  const n = seqQ.shift();
  startP(n.m, n.f, n.t, n.s);
  afterCb = () => setTimeout(playSq, 400);
}
function fullD() {
  const L = sD.length;
  if (L < 2) return;
  seqQ = [
    { m: 'echo_follow', f: 0, t: 1, s: 0.6 },
    { m: 'contradiction', f: 1, t: Math.min(2, L - 1), s: 0.5 },
    { m: 'bridge', f: Math.min(2, L - 1), t: Math.min(3, L - 1), s: 0.45 },
    { m: 'avoidance', f: Math.min(3, L - 1), t: Math.min(4, L - 1), s: 0.5 },
    { m: 'fixation', f: Math.min(L - 1, L - 1), t: Math.min(L - 1, L - 1), s: 0.35 },
    { m: 'overview', f: 0, t: 0, s: 0.3 },
  ];
  playSq();
}

function buildHUD() {
  const ml = document.getElementById('mlist');
  let h = `<div class="h">MEMORIES (${P.length})</div>`;
  P.forEach((m, i) => {
    const de = getDom(m.emo); const c = EC[de] || [0.5, 0.5, 0.5];
    const hex = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
    h += `<div class="mi" data-i="${i}"><div class="md" style="background:${hex};box-shadow:0 0 4px ${hex}"></div><span class="mt">${m.t}</span><span class="mc">(${m.pc})</span></div>`;
  });
  ml.innerHTML = h;

  ml.querySelectorAll('.mi').forEach((el) => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.i, 10);
      if (!P[i]) return;
      ml.querySelectorAll('.mi').forEach((x) => x.classList.remove('act'));
      el.classList.add('act');
      buildTerrain(i);
      shLb(P[i].t, `${P[i].pc} plays · 이 기억만 지형에 반영 (AF ${P[i].af.x.toFixed(2)}, ${P[i].af.z.toFixed(2)})`);
      if (sD.length >= 2) {
        const idx = sD.findIndex((d) => d.idx === i);
        const fromI = Math.max(0, idx - 1);
        startP('echo_follow', fromI, idx, 0.5);
        afterCb = stopP;
      } else if (sD.length === 1) {
        stopP();
        const d = sD[0];
        const hh = gH(d.wx, d.wz);
        camera.position.set(d.wx + 16, hh + 10, d.wz + 16);
        controls.target.set(d.wx, hh, d.wz);
        controls.update();
      }
    });
  });

  const bb = document.getElementById('btns');
  bb.innerHTML = '';
  const btns = [
    ['전체 지형', () => {
      ml.querySelectorAll('.mi').forEach((x) => x.classList.remove('act'));
      buildTerrain(null);
      shLb('전체', '모든 기억 합산 지형');
      stopP();
    }],
    ['▶ FULL DEMO', () => { shLb('FULL SEQUENCE', '6가지 전이 패턴'); fullD(); }],
    ['ECHO', () => { shLb('ECHO_FOLLOW', '"비슷하게 느꼈다"'); startP('echo_follow', 0, 1, 0.55); afterCb = stopP; }],
    ['CONTRADICTION', () => { shLb('CONTRADICTION', '"다르게 느꼈다"'); startP('contradiction', 1, Math.min(2, sD.length - 1), 0.45); afterCb = stopP; }],
    ['AVOIDANCE', () => { shLb('AVOIDANCE', '"준비가 안 됐다"'); startP('avoidance', Math.min(3, sD.length - 1), Math.min(4, sD.length - 1), 0.45); afterCb = stopP; }],
    ['FIXATION', () => { shLb('FIXATION', '"여기에 갇혔다"'); startP('fixation', sD.length - 1, sD.length - 1, 0.3); afterCb = stopP; }],
    ['BRIDGE', () => { shLb('BRIDGE', '"아직 확신이 없다"'); startP('bridge', Math.min(2, sD.length - 1), Math.min(3, sD.length - 1), 0.4); afterCb = stopP; }],
    ['FREE', () => { shLb('FREE', '드래그/스크롤/우클릭'); stopP(); }],
  ];
  btns.forEach(([l, fn]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l;
    b.onclick = fn;
    bb.appendChild(b);
  });
}

const rc = new THREE.Raycaster(); const ptr = new THREE.Vector2();
document.getElementById('c').addEventListener('mousemove', (e) => {
  const r = e.target.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
});

let time = 0; const baseFog = 0.003;
function animate() {
  requestAnimationFrame(animate);
  time += 0.004;

  if (camActive) {
    camT += 0.003 * camSpd;
    if (camT >= 1) {
      camT = 1;
      camActive = false;
      if (afterCb) { const cb = afterCb; afterCb = null; cb(); }
    }
    const pt = getCPt(camT);
    if (pt) {
      camera.position.set(pt.x, pt.y, pt.z);
      if (pt.shake) {
        camera.position.x += (Math.random() - 0.5) * pt.shake;
        camera.position.y += (Math.random() - 0.5) * pt.shake * 0.5;
      }
      camera.lookAt(pt.lx || 0, pt.ly || 0, pt.lz || 0);
      scene3.fog.density = baseFog + (pt.fogB || 0) * 0.015;
      document.getElementById('vig').style.opacity = String(pt.vig || 0);
      if (trC < TL) {
        trP[trC * 3] = pt.x; trP[trC * 3 + 1] = pt.y - 1; trP[trC * 3 + 2] = pt.z;
        trC++;
        trG2.attributes.position.needsUpdate = true;
        trG2.setDrawRange(0, trC);
      }
    }
  } else {
    controls.update();
    scene3.fog.density = baseFog;
    document.getElementById('vig').style.opacity = '0';
  }

  oP1.position.set(Math.sin(time * 0.6) * 50, 10 + Math.sin(time * 0.3) * 5, Math.cos(time * 0.4) * 50);
  oP2.position.set(Math.cos(time * 0.5) * 40, 12, Math.sin(time * 0.7) * 40);

  if (seedGrp) {
    seedGrp.children.forEach((c, i) => {
      if (c.isMesh && c.geometry.type === 'CylinderGeometry') {
        const p = 1 + Math.sin(time * 2.5 + i * 1.2) * 0.08;
        c.scale.set(p, 1, p);
        if (c.material.emissiveIntensity !== undefined) c.material.emissiveIntensity = 0.35 + Math.sin(time * 3 + i * 0.8) * 0.2;
      }
    });
  }

  const pp = parts.geometry.attributes.position;
  for (let i = 0; i < 800; i++) {
    let y = pp.getY(i) + pVl[i];
    if (y > 28) y = -8;
    pp.setY(i, y);
    pp.setX(i, pp.getX(i) + Math.sin(time + i * 0.3) * 0.0015);
  }
  pp.needsUpdate = true;

  if (!camActive && seedGrp) {
    rc.setFromCamera(ptr, camera);
    const pillars = seedGrp.children.filter((c) => c.isMesh && c.geometry.type === 'CylinderGeometry');
    const hits = rc.intersectObjects(pillars);
    const tip = document.getElementById('tip');
    if (hits.length > 0) {
      const idx = pillars.indexOf(hits[0].object);
      if (idx >= 0 && sD[idx]) {
        const d = sD[idx]; const m = P[idx];
        tip.style.opacity = '1';
        tip.innerHTML = `<div style="color:#aab;font-size:11px;margin-bottom:2px">${d.t}</div><div style="font-size:9px;color:#556">${d.c}명 · AF(${m.af.x.toFixed(2)}, ${m.af.z.toFixed(2)})</div><div style="font-size:8px;color:#664;margin-top:3px">self:${(m.attr.self_blame * 100).toFixed(0)}% other:${(m.attr.other_blame * 100).toFixed(0)}% fate:${(m.attr.fate_blame * 100).toFixed(0)}%</div>`;
      }
    } else tip.style.opacity = '0';
  }

  renderer.render(scene3, camera);
}

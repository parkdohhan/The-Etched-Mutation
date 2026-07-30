// QA 순찰자 — 한 줄로 도는 손 QA 대체 + 되감기 (2026-07-30)
//
// 사용:  npm run qa                     → 직진입 풀 플레이스루 (스냅샷→QA→복원)
//        npm run qa -- --full           → 오프닝 경로(index→감정 칩→FP)까지 포함
//        npm run qa -- --headed         → 브라우저 눈으로 보며
//        npm run qa -- --no-rollback    → 되감기 없이 (봇 흔적이 남는다)
//        node tools/qa.cjs --restore test/e2e/qa_snapshot-<ts>.json  → 수동 복원
//
// 되감기 설계 (왜 "행 삭제"가 아니라 "스냅샷 복원"인가):
//   plays 행은 지우면 끝이지만, 오염 수치(cont_*, Welford 내부값)는 로그가 아니라
//   누적기다 — 봇 회차가 흐르는 평균에 한 번 섞이면 행 삭제로는 안 돌아온다.
//   지형 릴레이(terrain_layers)도 다음 실관객이 봇의 침식을 물려받는다.
//   그래서 QA 전에 기억의 가변 상태 전부를 사진 찍고, 끝나면 사진대로 되돌린다.
//   한 회차가 건드리는 표면 = memories(오염 누적) · scenes(오염 문장) · plays ·
//   trajectory_bridges(접촉) · terrain_layers(릴레이 지형) · ghost_variants(유령 변주).
//
// 필요 키: .env 에 SUPABASE_SERVICE_KEY (Supabase 대시보드 → Settings → API →
//   service_role). RLS 를 넘어 memories/scenes 를 복원하려면 익명 키로는 안 된다.
//   없으면 되감기 생략 + 경고만 하고 QA 는 돈다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const HEADED = args.includes('--headed');
const FULL = args.includes('--full');
const NO_ROLLBACK = args.includes('--no-rollback');
const RESTORE_I = args.indexOf('--restore');

// ─── .env ───
function readEnv(name) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > 0 && t.slice(0, i).trim() === name) return t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
  return '';
}
const SB_URL = readEnv('VITE_SUPABASE_URL');
const SB_SERVICE = readEnv('SUPABASE_SERVICE_KEY');
const SB_ANON = readEnv('VITE_SUPABASE_ANON_KEY');
const QA_MEMORY = readEnv('TEM_QA_MEMORY_ID');

// ─── Supabase REST (의존성 0) ───
function sbHeaders(key) {
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
}
async function sbGet(key, pathq) {
  const res = await fetch(SB_URL + '/rest/v1/' + pathq, { headers: sbHeaders(key) });
  if (!res.ok) throw new Error('GET ' + pathq + ' → HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res.json();
}
async function sbDelete(key, pathq) {
  const res = await fetch(SB_URL + '/rest/v1/' + pathq, { method: 'DELETE', headers: sbHeaders(key) });
  if (!res.ok) throw new Error('DELETE ' + pathq + ' → HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
}
async function sbUpsert(key, table, rows, conflictCol) {
  if (!rows.length) return;
  const res = await fetch(SB_URL + '/rest/v1/' + table + '?on_conflict=' + (conflictCol || 'id'), {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error('UPSERT ' + table + ' → HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
}

// 스냅샷 대상: [테이블, memory 필터 컬럼, upsert 충돌 키]
const TABLES = [
  ['memories', 'id', 'id'],
  ['scenes', 'memory_id', 'id'],
  ['plays', 'memory_id', 'id'],
  ['trajectory_bridges', 'memory_id', 'id'],
  ['terrain_layers', 'memory_id', 'memory_id'],
  ['ghost_variants', 'memory_id', 'id'],
];

async function takeSnapshot(memId) {
  const snap = { memoryId: memId, takenAt: new Date().toISOString(), tables: {} };
  for (const [table, col] of TABLES) {
    snap.tables[table] = await sbGet(SB_SERVICE, table + '?' + col + '=eq.' + memId + '&select=*');
  }
  return snap;
}

async function restoreSnapshot(snap) {
  const memId = snap.memoryId;
  // 1) QA 중 생긴 새 행 삭제 — 자식(bridges) 먼저, FK 역순
  // terrain_layers 는 id 컬럼이 없는 기억당 1행 upsert 테이블 — 스냅샷이 비어 있으면
  // QA 가 만든 행을 통째로 지우고, 있으면 아래 2) upsert 가 원상복구한다.
  if (!(snap.tables.terrain_layers || []).length) {
    await sbDelete(SB_SERVICE, 'terrain_layers?memory_id=eq.' + memId);
  }
  const logOrder = ['trajectory_bridges', 'ghost_variants', 'plays'];
  for (const table of logOrder) {
    const [, col] = TABLES.find((t) => t[0] === table);
    const keep = new Set((snap.tables[table] || []).map((r) => r.id));
    const now = await sbGet(SB_SERVICE, table + '?' + col + '=eq.' + memId + '&select=id');
    const newIds = now.map((r) => r.id).filter((id) => !keep.has(id));
    // FK 자기참조(ghost_variants) 대비 2회전
    for (let pass = 0; pass < 2 && newIds.length; pass++) {
      for (let i = 0; i < newIds.length; i += 50) {
        const chunk = newIds.slice(i, i + 50);
        try { await sbDelete(SB_SERVICE, table + '?id=in.(' + chunk.join(',') + ')'); } catch (e) {
          if (pass === 1) throw e;
        }
      }
      const rest = await sbGet(SB_SERVICE, table + '?' + col + '=eq.' + memId + '&select=id');
      newIds.length = 0;
      for (const r of rest) if (!keep.has(r.id)) newIds.push(r.id);
    }
    if (newIds.length) console.log('[qa] ⚠ ' + table + ' 새 행 ' + newIds.length + '건 삭제 실패');
  }
  // 2) 스냅샷 상태로 복원 (부모 → 자식)
  for (const [table, , conflict] of TABLES) {
    await sbUpsert(SB_SERVICE, table, snap.tables[table] || [], conflict);
  }
}

// ─── 내장 정적 서버 (감시 없음 = 병렬 세션 저장으로 인한 HMR 리로드 간섭 차단) ───
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
  '.fbx': 'application/octet-stream', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};
function serve(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        const file = path.join(ROOT, p);
        if (!path.resolve(file).startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end(); return; }
        const data = fs.readFileSync(file);
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      } catch (_) { res.writeHead(404); res.end('not found'); }
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

function run(script, extra) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [script, ...extra], { cwd: ROOT, stdio: 'inherit' });
    child.on('close', (code) => resolve({ script: path.basename(script), code, sec: Math.round((Date.now() - t0) / 1000) }));
  });
}

(async () => {
  // ─── 수동 복원 모드 ───
  if (RESTORE_I !== -1) {
    const file = args[RESTORE_I + 1];
    if (!file || !SB_SERVICE) { console.error('[qa] --restore <스냅샷.json> + .env SUPABASE_SERVICE_KEY 필요'); process.exit(1); }
    const snap = JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
    console.log('[qa] 수동 복원: ' + snap.memoryId + ' (' + snap.takenAt + ' 사진)');
    await restoreSnapshot(snap);
    console.log('[qa] 복원 완료');
    return;
  }

  // ─── QA 대상 기억 결정 ───
  const readKey = SB_SERVICE || SB_ANON;
  let memId = QA_MEMORY;
  if (!memId && readKey && SB_URL) {
    const rows = await sbGet(readKey, 'memories?select=id,title&limit=1');
    memId = rows[0] && rows[0].id;
    if (rows[0]) console.log('[qa] 대상 기억(첫 행 폴백): ' + rows[0].title + ' — ' + memId);
  } else if (memId) {
    console.log('[qa] 대상 기억(.env 지정): ' + memId);
  }

  // ─── 스냅샷 ───
  const canRollback = !!(SB_SERVICE && SB_URL && memId) && !NO_ROLLBACK;
  let snap = null, snapFile = null;
  if (canRollback) {
    snap = await takeSnapshot(memId);
    snapFile = path.join(ROOT, 'test/e2e/qa_snapshot-' + snap.takenAt.replace(/[:.]/g, '-') + '.json');
    fs.mkdirSync(path.dirname(snapFile), { recursive: true });
    fs.writeFileSync(snapFile, JSON.stringify(snap));
    const counts = TABLES.map(([t]) => t + ':' + (snap.tables[t] || []).length).join(' ');
    console.log('[qa] 스냅샷 완료 — ' + counts);
    console.log('[qa] 사진 파일: ' + path.relative(ROOT, snapFile) + ' (복원 실패 시 --restore 로 재시도)');
  } else if (!NO_ROLLBACK) {
    console.log('[qa] ⚠ 되감기 불가 — .env 에 SUPABASE_SERVICE_KEY 가 없다.');
    console.log('     (Supabase 대시보드 → Settings → API → service_role 키를 SUPABASE_SERVICE_KEY= 로 추가)');
    console.log('     이번 실행의 봇 흔적(오염 수치·접촉·지형)이 기억에 그대로 남는다.');
  }

  // ─── 정적 서버 + 테스트 실행 ───
  let srv = null, port = 8123;
  for (; port <= 8130; port++) {
    try { srv = await serve(port); break; } catch (_) {}
  }
  if (!srv) { console.error('[qa] 8123~8130 포트 전부 사용 중'); process.exit(1); }
  const url = 'http://localhost:' + port;
  console.log('[qa] 정적 서버: ' + url);

  const extra = ['--url=' + url];
  if (HEADED) extra.push('--headed');

  const results = [];
  try {
    results.push(await run(path.join(ROOT, 'test/e2e/full_playthrough_extended.mjs'),
      memId ? [...extra, '--memory=' + memId] : extra));
    if (FULL) results.push(await run(path.join(ROOT, 'test/e2e/full_playthrough.mjs'), extra));
  } finally {
    srv.close();
    // ─── 되감기 (테스트가 죽어도 반드시) ───
    if (canRollback && snap) {
      try {
        await restoreSnapshot(snap);
        console.log('[qa] 되감기 완료 — 봇 흔적 0 (오염 수치·접촉·지형·변주 원상복구)');
      } catch (e) {
        console.error('[qa] ✗ 되감기 실패: ' + e.message);
        console.error('     수동 복원: node tools/qa.cjs --restore ' + path.relative(ROOT, snapFile));
        process.exitCode = 1;
      }
    }
  }

  console.log('\n────── QA 요약 ──────');
  let fail = 0;
  for (const r of results) {
    const ok = r.code === 0;
    if (!ok) fail++;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + r.script + '  (' + r.sec + 's)');
  }
  console.log('스크린샷: test/e2e/screenshots/');
  if (fail) process.exit(1);
})();

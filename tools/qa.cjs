// QA 순찰자 — 한 줄로 도는 손 QA 대체 (2026-07-30)
//
// 사용:  npm run qa            → 직진입 풀 플레이스루 (extended)
//        npm run qa -- --full  → 오프닝 경로(index→감정 칩→FP)까지 포함
//        npm run qa -- --headed → 브라우저 눈으로 보며
//
// 설계:
//  - vite(5173) 대신 파일 감시 없는 내장 정적 서버를 띄운다.
//    병렬 Claude 세션이 파일을 저장할 때마다 vite 가 페이지를 통째로 리로드해
//    테스트가 도중에 깨지는 간섭(260730 실측)을 차단하기 위함.
//  - .env 의 TEM_QA_MEMORY_ID 가 있으면 그 기억만 두드린다. 봇 회차가 상영 기억의
//    cont_depth(실제 관객 수 — "숫자를 지어내지 않는다")에 섞이는 것을 막는 격리 수단.
//    없으면 DB 첫 기억으로 폴백하고 경고를 띄운다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const HEADED = args.includes('--headed');
const FULL = args.includes('--full');

// ─── .env 에서 QA 전용 기억 id ───
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
const QA_MEMORY = readEnv('TEM_QA_MEMORY_ID');

// ─── 내장 정적 서버 (감시 없음 = HMR 리로드 없음) ───
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

// ─── 테스트 하나 실행 ───
function run(script, extra) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [script, ...extra], { cwd: ROOT, stdio: 'inherit' });
    child.on('close', (code) => resolve({ script: path.basename(script), code, sec: Math.round((Date.now() - t0) / 1000) }));
  });
}

(async () => {
  let srv = null, port = 8123;
  for (; port <= 8130; port++) {
    try { srv = await serve(port); break; } catch (_) {}
  }
  if (!srv) { console.error('[qa] 8123~8130 포트 전부 사용 중'); process.exit(1); }
  const url = 'http://localhost:' + port;
  console.log('[qa] 정적 서버: ' + url + ' (파일 감시 없음 — HMR 간섭 차단)');
  if (QA_MEMORY) console.log('[qa] QA 전용 기억: ' + QA_MEMORY);
  else console.log('[qa] ⚠ TEM_QA_MEMORY_ID 미설정 — DB 첫 기억으로 폴백. 봇 회차가 그 기억 이력에 남는다. .env 에 QA 전용 기억 id 를 넣어라.');

  const extra = ['--url=' + url];
  if (HEADED) extra.push('--headed');

  const results = [];
  results.push(await run(path.join(ROOT, 'test/e2e/full_playthrough_extended.mjs'),
    QA_MEMORY ? [...extra, '--memory=' + QA_MEMORY] : extra));
  if (FULL) {
    results.push(await run(path.join(ROOT, 'test/e2e/full_playthrough.mjs'), extra));
  }

  srv.close();
  console.log('\n────── QA 요약 ──────');
  let fail = 0;
  for (const r of results) {
    const ok = r.code === 0;
    if (!ok) fail++;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + r.script + '  (' + r.sec + 's)');
  }
  console.log('스크린샷: test/e2e/screenshots/');
  process.exit(fail ? 1 : 0);
})();

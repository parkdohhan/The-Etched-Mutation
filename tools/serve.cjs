// TEM 로컬 서버 — 더블클릭 런처(.bat)에서 호출. 의존성 0 (node 내장 모듈만).
// 사용: node tools/serve.cjs [열_페이지]   (기본 index.html)
// 끄기: 실행된 콘솔 창을 닫으면 됨.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 기본 브라우저로 url 열기 — 실행 중인 OS를 자동 감지 (맥/윈도/리눅스)
function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? `open "${url}"` :        // 맥
    process.platform === 'win32'  ? `start "" "${url}"` :    // 윈도우
                                    `xdg-open "${url}"`;      // 리눅스
  exec(cmd);
}

const root = path.join(__dirname, '..'); // tools/ 의 상위 = 프로젝트 루트
const PORT = 8777;
const page = process.argv[2] || 'index.html';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/' + page;
  const fp = path.normalize(path.join(root, u));
  // 프로젝트 루트 밖 접근 차단
  if (!fp.startsWith(path.normalize(root))) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found: ' + u); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(PORT, () => {
  const url = `http://localhost:${PORT}/${page}`;
  console.log('');
  console.log('  TEM 서버가 켜졌습니다.');
  console.log('  주소: ' + url);
  console.log('');
  console.log('  >> 끄려면 이 창을 닫으세요. <<');
  console.log('');
  // 기본 브라우저로 자동 열기 (OS 자동 감지)
  openBrowser(url);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('  서버가 이미 켜져 있는 것 같습니다 (포트 ' + PORT + ' 사용 중).');
    console.log('  브라우저에서 http://localhost:' + PORT + '/' + page + ' 를 열어보세요.');
    openBrowser(`http://localhost:${PORT}/${page}`);
  } else {
    console.log('  서버 오류:', err.message);
  }
});

// 임시 정적 서버 (비교 그림 스크린샷용). 롤백 = 파일 삭제.
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.css':'text/css', '.jpeg':'image/jpeg', '.jpg':'image/jpeg' };
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/_terrain_distinct_compare.html';
  const fp = path.join(root, u);
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(8777, () => console.log('serving on http://localhost:8777'));

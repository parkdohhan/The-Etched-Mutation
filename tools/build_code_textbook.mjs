// 코드 읽기 교재 조립기 — docs/코드읽기_교재/part*.html 을 한 권으로 합쳐 PDF 로 뽑는다.
//
// 사용:  node tools/build_code_textbook.mjs
// 출력:  docs/코드읽기_교재-<DATE>.pdf  (+ 합쳐진 원본 docs/코드읽기_교재/코드읽기_교재-<DATE>.html)
//        260925 = 1~18장 초판 · 261019 = 엔진 편(19~24장) 추가판
//
// 순서:
//   1. 조각 파일을 순서대로 이어 붙인다.
//   2. 표지·목차·각 장을 따로 인쇄해 쪽수를 센다 (각 장은 새 쪽에서 시작하므로 누적합 = 시작 쪽).
//   3. 목차의 빈 쪽수 칸을 채운 뒤 전체를 한 번 더 인쇄한다 (책갈피 포함).
// 의존: node_modules/playwright (이미 설치됨). 파이썬 불필요.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const DIR = resolve('docs/코드읽기_교재');
const DATE = '261019';
const OUT_PDF = resolve(`docs/코드읽기_교재-${DATE}.pdf`);
const OUT_HTML = resolve(DIR, `코드읽기_교재-${DATE}.html`);

const PARTS = [
  'part00_head.html',
  'part01_map_web.html',
  'part02_three_shapes.html',
  'part03_names_links.html',
  'part04_moving.html',
  'part05_inspect.html',
  'part06_three_final.html',
  'part06e1_engine_outputs.html',   // 19~20장 (2026-10-19 엔진 편)
  'part06e2_engine_byeori.html',    // 21~22장
  'part06e3_engine_contamination.html', // 23~24장
  'part07_appendix.html',
];

const full = PARTS.map(p => readFileSync(resolve(DIR, p), 'utf8')).join('\n');

// ── 조각 나누기: head / cover / sections / tail ──
const bodyIdx = full.indexOf('<body>') + '<body>'.length;
const head = full.slice(0, bodyIdx);
const tailIdx = full.lastIndexOf('<style>\npre.code.nonum');
const tail = full.slice(tailIdx); // 추가 css + 하이라이터 script + </body></html>
const middle = full.slice(bodyIdx, tailIdx);

const firstSection = middle.indexOf('<section class="toc">');
const cover = middle.slice(0, firstSection);
const sectionRe = /<section class="(?:toc|chapter)"[^>]*>[\s\S]*?<\/section>/g;
const sections = middle.slice(firstSection).match(sectionRe);

function idOf(sec) {
  const m = sec.match(/<section class="chapter" id="([^"]+)"/);
  return m ? m[1] : 'toc';
}

const FOOTER = `<div style="font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:8pt;color:#666;width:100%;text-align:center;">
  TEM 코드 읽기 교재 &nbsp;·&nbsp; <span class="pageNumber"></span>
</div>`;

const PDF_OPTS = {
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: FOOTER,
};

function countPages(buf) {
  const raw = buf.toString('latin1');
  return (raw.match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

const browser = await chromium.launch();
const page = await browser.newPage();

async function renderPiece(bodyHtml, extraCss = '') {
  const html = head + `<style>${extraCss}</style>` + bodyHtml + tail;
  await page.setContent(html, { waitUntil: 'load' });
  return page.pdf(PDF_OPTS);
}

// ── 2. 쪽수 세기 ──
// 따로 인쇄할 때는 첫 h1 의 강제 쪽나눔을 끄고(어차피 첫 쪽), 실제 책과 같은 조건으로 센다.
const ISOLATED_CSS = '.chapter > h1, .toc > h1 { page-break-before: auto !important; }';
const starts = {};
let cursor = 1;
const coverPages = countPages(await renderPiece(cover));
cursor += coverPages;
const counts = [];
for (const sec of sections) {
  const id = idOf(sec);
  const n = countPages(await renderPiece(sec, ISOLATED_CSS));
  starts[id] = cursor;
  counts.push([id, n, cursor]);
  cursor += n;
}
const expectedTotal = cursor - 1;

// ── 3. 목차 채우기 + 최종 인쇄 ──
let filled = full.replace(/<span class="pg" data-ch="([^"]+)"><\/span>/g, (_, id) =>
  `<span class="pg" data-ch="${id}">${starts[id] ?? ''}</span>`);
writeFileSync(OUT_HTML, filled, 'utf8');

await page.setContent(filled, { waitUntil: 'load' });
const finalBuf = await page.pdf({ ...PDF_OPTS, path: OUT_PDF, outline: true });
const finalPages = countPages(finalBuf);
await browser.close();

console.log('장별 쪽수 (id, 쪽수, 시작쪽):');
console.log(`  cover 1p → ${coverPages}p`);
for (const [id, n, s] of counts) console.log(`  ${id.padEnd(5)} ${String(n).padStart(3)}p  시작 ${s}`);
console.log(`예상 총 ${expectedTotal}쪽 / 실제 ${finalPages}쪽 ${expectedTotal === finalPages ? '(일치)' : '(불일치! 목차 쪽수 확인 필요)'}`);
console.log('PDF :', OUT_PDF);
console.log('HTML:', OUT_HTML);

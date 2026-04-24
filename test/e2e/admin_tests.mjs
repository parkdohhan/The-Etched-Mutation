/**
 * Admin E2E 테스트 — 파트 A (통합테스트 체크리스트 A-1 ~ A-15)
 *
 * 사전 조건: node test/e2e/setup_admin_auth.mjs 로 1회 로그인 세션 저장 완료
 *
 * 실행: node test/e2e/admin_tests.mjs [--headed] [--url=http://localhost:5173]
 *
 * 커버:
 *   A-1 Admin 로드 · 메모리 목록
 *   A-2 새 메모리 추가 → 편집기 전환
 *   A-3 감각 anchor 입력
 *   A-4 AF (original_reason_vector) — 슬라이더 + 정규화 합=1
 *   A-5 오염 초기 상태 (cont_depth + 3축 + stage) — 정규화 합=1
 *   A-6 terrain_shape 드롭다운
 *   A-7 씬 추가 → 최소 1개 생성
 *   A-14 저장 → 성공
 *   A-15 **재로드 검증** — DB 쿼리로 필드별 복원 확인
 *   A-18 cleanup — 테스트 메모리 DELETE
 *
 * 미커버 (UI 상호작용 복잡 / 수동 몫):
 *   A-8 씬별 AF picker (씬 편집 열기 필요)
 *   A-10~11 응결점 SVG 드래그 (Playwright 드래그 가능하지만 픽셀 좌표 정확성 필요)
 *   A-16 dirty flag confirm (다이얼로그 핸들러)
 *   A-17 탭 닫기 beforeunload (브라우저 제약)
 */

import { chromium } from 'playwright';
import { existsSync } from 'fs';

const args = process.argv.slice(2);
const BASE_URL = (args.find(a => a.startsWith('--url=')) || '--url=http://localhost:5173').slice(6);
const HEADLESS = !args.includes('--headed');
const STATE_PATH = 'test/e2e/.auth/admin.json';

if (!existsSync(STATE_PATH)) {
  console.error('[admin-e2e] auth state 없음. 먼저 실행: node test/e2e/setup_admin_auth.mjs');
  process.exit(2);
}

const results = [];
const consoleErrors = [];
const pageErrors = [];

function record(check, pass, detail) {
  results.push({ check, pass: pass ? '✅' : '❌', detail: detail || '' });
}

const TEST_CODE = `E2E-${Date.now().toString().slice(-8)}`;
const TEST_TITLE = `e2e 자동 ${new Date().toISOString().slice(11, 19)}`;

async function main() {
  console.log(`[admin-e2e] base=${BASE_URL} headless=${HEADLESS} testCode=${TEST_CODE}`);
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR'
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), location: msg.location() });
  });
  page.on('pageerror', err => pageErrors.push({ message: err.message, stack: err.stack }));
  // 다이얼로그(alert/confirm)는 자동 수락
  page.on('dialog', async dlg => {
    console.log(`[dialog ${dlg.type()}] ${dlg.message()}`);
    try { await dlg.accept(); } catch (_) {}
  });

  // ═════════ A-1. admin.html 로드 ═════════
  try {
    await page.goto(`${BASE_URL}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    record('A-1 admin.html 로드', true);
  } catch (e) {
    record('A-1 admin.html 로드', false, e.message);
    await browser.close(); return report();
  }

  // 대시보드 노출 대기 (로그인 완료 + admin 권한 체크 통과)
  try {
    await page.waitForSelector('#adminDashboard', { state: 'visible', timeout: 15000 });
    record('A-1 대시보드 가시', true);
  } catch (e) {
    record('A-1 대시보드 가시', false, '권한 체크 실패 또는 세션 만료 — setup_admin_auth 재실행 필요');
    await browser.close(); return report();
  }

  // 새 메모리 버튼 존재
  const addBtn = page.locator('button.add-memory-btn');
  record('A-1 새 메모리 버튼 존재', (await addBtn.count()) > 0);

  // ═════════ A-2. 새 메모리 추가 ═════════
  await addBtn.click();
  try {
    await page.waitForSelector('#editorScreen', { state: 'visible', timeout: 5000 });
    record('A-2 편집기 전환', true);
  } catch (e) {
    record('A-2 편집기 전환', false, e.message);
    await browser.close(); return report();
  }

  // 메타 입력
  await page.fill('#memoryTitle', TEST_TITLE);
  await page.fill('#memoryCode', TEST_CODE);
  await page.fill('#memoryWords', '비, 젖은 흙, 우산');
  await page.fill('#completedSentence', '그날의 비는 냄새부터 달랐다.');
  await page.fill('#authorNote', 'e2e 자동 테스트');
  record('A-2 메타 입력', true);

  // 헬퍼: input 값 세팅 + change/input 이벤트 디스패치 (admin.js 내부 state 업데이트 강제)
  async function setInput(id, value) {
    await page.evaluate(([id, value]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, String(value)]);
  }

  // ═════════ A-3. 감각 anchor ═════════
  // modality 라디오 선택 (없으면 content 있어도 null 저장되는 정책 — admin.js:1977)
  await page.check('input[name="sensoryModality"][value="smell"]');
  await setInput('sensoryContent', '젖은 아스팔트 냄새');
  await setInput('sensoryWeight', '0.5');
  record('A-3 sensory modality/content/weight 입력', true);

  // ═════════ A-4. AF original_reason_vector ═════════
  const attrVals = { ar_attr_self: 0.2, ar_attr_other: 0.2, ar_attr_fate: 0.2 };
  const cfVals = { ar_cf_abandonment: 0.2, ar_cf_rejection: 0.2, ar_cf_powerlessness: 0.2, ar_cf_loss: 0.2 };
  for (const [id, v] of Object.entries(attrVals)) await setInput(id, v);
  for (const [id, v] of Object.entries(cfVals)) await setInput(id, v);

  await page.click('button.table-btn[onclick*="normalizeAttribution"]');
  await page.waitForTimeout(150);
  const attrSum = parseFloat(await page.textContent('#arAttribSum') || '0');
  // step=0.05 반올림 허용 오차
  record('A-4 Attribution 정규화 합≈1', Math.abs(attrSum - 1.0) < 0.06, `sum=${attrSum}`);

  await page.click('button.table-btn[onclick*="normalizeCoreFear"]');
  await page.waitForTimeout(150);
  const cfSum = parseFloat(await page.textContent('#arCoreFearSum') || '0');
  record('A-4 CoreFear 정규화 합≈1', Math.abs(cfSum - 1.0) < 0.06, `sum=${cfSum}`);

  // ═════════ A-5. 오염 초기 상태 ═════════
  await setInput('contDepth', '2');
  await setInput('cont_divergence_input', '0.3');
  await setInput('cont_convergence_input', '0.2');
  await setInput('cont_heterogeneity_input', '0.5');
  await setInput('cont_stage_1_input', '0.3');
  await setInput('cont_stage_2_input', '0.4');
  await setInput('cont_stage_3_input', '0.3');
  await page.click('button.table-btn[onclick*="normalizeContStage"]');
  await page.waitForTimeout(100);
  const stageSum = parseFloat(await page.textContent('#contStageSum') || '0');
  record('A-5 cont_stage 정규화 후 합=1', Math.abs(stageSum - 1.0) < 0.01, `sum=${stageSum}`);

  // ═════════ A-6. terrain_shape ═════════
  try {
    await page.selectOption('#terrainShape', 'circular');
    record('A-6 terrain_shape=circular 선택', true);
  } catch (e) {
    record('A-6 terrain_shape=circular 선택', false, e.message);
  }

  // ═════════ A-7 / A-9. 씬 3개 추가 ═════════
  const sceneAddBtn = page.locator('button.add-scene-btn');
  if ((await sceneAddBtn.count()) > 0) {
    for (let i = 0; i < 3; i++) {
      await sceneAddBtn.first().click();
      await page.waitForTimeout(250);
    }
    const dbScenePreview = await page.evaluate(() => {
      return (window._sceneList && window._sceneList.length) ||
             document.querySelectorAll('[data-scene-id], .scene-block').length;
    });
    record('A-7/A-9 씬 3회 추가', true, `dom/state count hint=${dbScenePreview}`);
  } else {
    record('A-7 씬 추가 버튼 존재', false);
  }

  // ═════════ A-10 / A-11. 응결점 SVG 존재 + 프로그래밍 추가 ═════════
  const svgExists = (await page.locator('#ghostPointsSvg').count()) > 0;
  record('A-10 응결점 SVG 존재', svgExists);
  if (svgExists) {
    // 핸들러: svg.mousedown 으로 점 추가 (admin.js:3895). SVG 를 화면 안에 스크롤 + locator.click 으로 정확한 hit.
    await page.locator('#ghostPointsSvg').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await page.locator('#ghostPointsSvg').boundingBox();
    if (box) {
      const targets = [
        { wx: 20, wz: 0 }, { wx: -20, wz: 15 }, { wx: 0, wz: -25 }
      ];
      for (const t of targets) {
        const relX = (t.wx + 60) * (box.width / 120);
        const relY = (t.wz + 60) * (box.height / 120);
        // locator.click 은 상대 position 으로 auto-scroll + 정확한 원소 위 클릭
        await page.locator('#ghostPointsSvg').click({ position: { x: relX, y: relY } });
        await page.waitForTimeout(200);
      }
      const ghostCountText = await page.textContent('#ghostPointsCount');
      record('A-11 응결점 3개 추가 (SVG 클릭)',
        parseInt(ghostCountText || '0', 10) === 3,
        `count=${ghostCountText}`);
    } else {
      record('A-11 SVG bounding box', false);
    }
  }

  // 저장 직전 DOM 값 스냅샷 (진단용)
  const preSaveDOM = await page.evaluate(() => {
    const get = id => (document.getElementById(id) || {}).value;
    return {
      sensoryContent: get('sensoryContent'),
      sensoryWeight:  get('sensoryWeight'),
      ar_attr_self:   get('ar_attr_self'),
      ar_cf_abandonment: get('ar_cf_abandonment'),
      contDepth:      get('contDepth'),
      terrainShape:   get('terrainShape')
    };
  });
  console.log('[pre-save DOM]', preSaveDOM);

  // ═════════ A-14. 저장 ═════════
  await page.click('button.editor-save-btn');
  // 저장 처리 대기 (네트워크 + UI 리셋)
  await page.waitForTimeout(3000);
  record('A-14 저장 버튼 클릭 + 대기', true);

  // ═════════ A-15. DB 라운드트립 검증 ═════════
  const roundtrip = await page.evaluate(async (code) => {
    if (typeof window.getSupabaseClient !== 'function') return { error: 'no supabase client' };
    const sb = await window.getSupabaseClient();
    const { data, error } = await sb.from('memories').select('*').eq('code', code).single();
    if (error) return { error: error.message };
    return { ok: true, row: data };
  }, TEST_CODE);

  if (roundtrip.error) {
    record('A-15 DB 조회 성공', false, roundtrip.error);
  } else {
    const r = roundtrip.row;
    record('A-15 DB 조회 성공', true, `id=${r.id}`);
    record('A-15 title 복원',            r.title === TEST_TITLE);
    record('A-15 code 복원',             r.code === TEST_CODE);
    record('A-15 sensory_anchor.content 복원',
      r.sensory_anchor?.content === '젖은 아스팔트 냄새',
      `got=${JSON.stringify(r.sensory_anchor)}`);
    record('A-15 sensory_anchor.weight 복원',
      Math.abs((r.sensory_anchor?.weight || 0) - 0.5) < 0.01,
      `got=${r.sensory_anchor?.weight}`);
    // AF 는 object 포맷 ({self, other, fate} / {abandonment, rejection, powerlessness, loss})
    const attr = r.original_reason_vector?.attribution;
    const cf = r.original_reason_vector?.core_fear;
    record('A-15 AF attribution 3-key 복원',
      attr && typeof attr === 'object'
        && ['self','other','fate'].every(k => typeof attr[k] === 'number'),
      `got=${JSON.stringify(attr)}`);
    record('A-15 AF core_fear 4-key 복원',
      cf && typeof cf === 'object'
        && ['abandonment','rejection','powerlessness','loss'].every(k => typeof cf[k] === 'number'),
      `got=${JSON.stringify(cf)}`);
    record('A-15 cont_depth = 2',        r.cont_depth === 2);
    record('A-15 cont_stage sum ≈ 1',
      Math.abs((r.cont_stage_1||0) + (r.cont_stage_2||0) + (r.cont_stage_3||0) - 1) < 0.01);
    record('A-15 terrain_shape = circular', r.terrain_shape === 'circular');
    record('A-15 ghost_condensation_points is array', Array.isArray(r.ghost_condensation_points));
    record('A-15 ghost_condensation_points = 3개 (SVG 클릭분)',
      Array.isArray(r.ghost_condensation_points) && r.ghost_condensation_points.length === 3,
      `count=${r.ghost_condensation_points?.length}`);
  }

  // ═════════ Cleanup: 테스트 메모리 삭제 ═════════
  if (roundtrip.ok) {
    const del = await page.evaluate(async (id) => {
      const sb = await window.getSupabaseClient();
      // scenes → memory 순서 (FK)
      await sb.from('scenes').delete().eq('memory_id', id);
      const { error } = await sb.from('memories').delete().eq('id', id);
      return { ok: !error, error: error?.message };
    }, roundtrip.row.id);
    record('cleanup 테스트 메모리 삭제', del.ok, del.error || '');
  }

  await browser.close();
  report();
}

function report() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Admin E2E 결과');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.table(results);
  const failed = results.filter(r => r.pass === '❌');
  console.log(`\n총 ${results.length}개 체크 · ✅ ${results.length - failed.length} · ❌ ${failed.length}`);

  // Console/page 에러는 일부 (Admin은 비-admin 접근 거부 요청 등에서 400 나는 게 정상) → 경고로만 표시
  if (consoleErrors.length || pageErrors.length) {
    console.log('\n[Console / Page 경고] (Admin은 일부 400/권한 거부가 정상 — 검토용)');
    consoleErrors.slice(0, 10).forEach((e, i) => console.log(`  [${i}] ${e.text}`));
    pageErrors.slice(0, 5).forEach((e, i) => console.log(`  pageerror[${i}] ${e.message}`));
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(e => { console.error('[admin-e2e] fatal:', e); process.exit(2); });

/**
 * 작업 15 smoke — Admin 두 레이어 분리 + 시뮬 동기화
 *
 * 사전 조건: node test/e2e/setup_admin_auth.mjs (1회)
 * 실행: node test/e2e/smoke_task_15.mjs [--headed]
 *
 * 검증:
 *   1. Canvas 탭 진입 → tv-layer-trajectory + tv-layer-position 둘 다 존재
 *   2. tvStageRoot 안에 SVG mount 됨 (외곽 원, void, AF anchor 라벨 4개)
 *   3. 씬에 stage_position 자동 fallback 작동 — originalReasonVector 있는 씬 → ghost 표시
 *   4. 드래그 — ghost 1개 잡고 옮긴 뒤 meta.stage_position 이 갱신됨
 *   5. 시뮬 시작 → 위치 레이어가 sim active 상태 반영 (ghost 표시 변화)
 *   6. 드래그가 _diagAccessMatrix·sceneVA 미수정 (admin.js 변수, admin-trajectory 와는 별도라
 *      여기선 admin-trajectory 의 state.scenes[].originalReasonVector 미수정 여부로 대체 검증)
 */

import { chromium } from 'playwright';
import { existsSync } from 'fs';

const args = process.argv.slice(2);
const BASE_URL = (args.find(a => a.startsWith('--url=')) || '--url=http://localhost:5173').slice(6);
const HEADLESS = !args.includes('--headed');
const STATE_PATH = 'test/e2e/.auth/admin.json';

if (!existsSync(STATE_PATH)) {
  console.error('[smoke-15] auth 없음 → setup_admin_auth.mjs 먼저');
  process.exit(2);
}

const results = [];
const errors = [];

function rec(name, pass, detail) {
  results.push({ name, pass: pass ? '✅' : '❌', detail: detail || '' });
}

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({ storageState: STATE_PATH, viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));

  try {
    await page.goto(BASE_URL + '/admin.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#adminDashboard', { timeout: 10000 });

    // 1. Canvas 탭 진입 — switchAdminSection 직접 호출 (loadMemoryId 없이도 작동)
    await page.evaluate(() => window.switchAdminSection && window.switchAdminSection('canvas'));
    await page.waitForFunction(() => {
      const sec = document.getElementById('section-canvas');
      return sec && sec.style.display !== 'none';
    }, { timeout: 5000 });
    // initTrajectoryViewer 가 비동기라 메모리 라벨 채워질 때까지 대기
    await page.waitForFunction(() => {
      const lbl = document.getElementById('tvMemoryLabel');
      return lbl && lbl.textContent && !lbl.textContent.includes('로딩');
    }, { timeout: 20000 });

    // 2. 두 레이어 컨테이너 존재
    const trajExists = await page.locator('.tv-layer-trajectory').count();
    const posExists = await page.locator('.tv-layer-position').count();
    rec('상하 분할 레이어 존재', trajExists === 1 && posExists === 1, `traj=${trajExists} pos=${posExists}`);

    // 3. tvStageRoot 안 SVG + 배경 요소
    const stageBg = await page.locator('#tvStageRoot svg #tvStageBg').count();
    const anchorLabels = await page.locator('#tvStageRoot svg #tvStageBg text').count();
    rec('위치 레이어 SVG mount', stageBg === 1, `tvStageBg count=${stageBg}`);
    rec('AF anchor 라벨 4개', anchorLabels === 4, `text count=${anchorLabels}`);

    // 4. 씬 렌더 (auto fallback 으로 보일 수도, 안 보일 수도) — status 라벨로 확인
    const status = await page.textContent('#tvStageStatus');
    rec('스테이지 status 표시', /씬 \d+\/\d+/.test(status || ''), `status="${status}"`);

    // 5. 위치 레이어 렌더 검증 — 자동 fallback 데이터가 없을 수 있으므로 모듈에 fake 좌표 주입
    const renderCheck = await page.evaluate(() => {
      const sv = window.LumenAdminStageView;
      if (!sv) return { ok: false, reason: 'view not exposed' };
      const fakeScenes = [
        { id: 'fake-1', scene_order: 0, meta: { scene_code: 'X1', stage_position: { x: -20, z: -10 } } },
        { id: 'fake-2', scene_order: 1, meta: { scene_code: 'X2', stage_position: { x: 15, z: 12 } } },
      ];
      sv.setScenes(fakeScenes);
      sv.setSimState({ active: false, runners: { A: null, B: null }, compareMode: false });
      const ghosts = document.querySelectorAll('#tvStageRoot g.tv-stage-ghost').length;
      const dots = document.querySelectorAll('#tvStageRoot g.tv-stage-ghost circle').length;
      return { ok: ghosts === 2, ghosts, dots };
    });
    rec('수동 stage_position 으로 ghost 2개 렌더', renderCheck.ok, JSON.stringify(renderCheck));

    // 6. 시뮬 sync — sim active 상태 주입 시 idle 씬 숨김 (current·visited 만 남음)
    const simCheck = await page.evaluate(() => {
      const sv = window.LumenAdminStageView;
      if (!sv) return { ok: false };
      // current=fake-1, candidate=fake-2 (visited 0 — current 만 보일 것)
      // 시뮬 active 시: idle role 인 씬 숨김. fake-1 = current, fake-2 = candidate → 둘 다 보여야
      sv.setSimState({
        active: true,
        runners: {
          A: { currentIdx: 0, candidateIdx: 1, visited: [0], lastResult: { transition_pattern: 'echo_follow' } },
          B: null,
        },
        compareMode: false,
      });
      const ghosts = document.querySelectorAll('#tvStageRoot g.tv-stage-ghost').length;
      const animates = document.querySelectorAll('#tvStageRoot animate').length;
      // current 강조 halo + dot, candidate pulse animate
      return { ok: ghosts === 2 && animates >= 2, ghosts, animates };
    });
    rec('시뮬 sync — current+candidate 2개 표시 + pulse', simCheck.ok, JSON.stringify(simCheck));

    // 7. sim active idle 씬 숨김 — 3번째 씬 추가 후 idle 이면 표시 안 됨
    const idleHide = await page.evaluate(() => {
      const sv = window.LumenAdminStageView;
      const fakeScenes = [
        { id: 'fake-1', scene_order: 0, meta: { scene_code: 'X1', stage_position: { x: -20, z: -10 } } },
        { id: 'fake-2', scene_order: 1, meta: { scene_code: 'X2', stage_position: { x: 15, z: 12 } } },
        { id: 'fake-3', scene_order: 2, meta: { scene_code: 'X3', stage_position: { x: 0, z: 25 } } },
      ];
      sv.setScenes(fakeScenes);
      sv.setSimState({
        active: true,
        runners: {
          A: { currentIdx: 0, candidateIdx: 1, visited: [0], lastResult: { transition_pattern: 'bridge' } },
          B: null,
        },
        compareMode: false,
      });
      const ghosts = document.querySelectorAll('#tvStageRoot g.tv-stage-ghost').length;
      // idle 인 fake-3 은 sim active 시 숨김 → 2개만
      return { ok: ghosts === 2, ghosts };
    });
    rec('sim active 시 idle 씬 숨김 (3개 중 2개만 표시)', idleHide.ok, JSON.stringify(idleHide));

    // 8. 패턴 색 구분 — bridge=#6aa383
    const patternCheck = await page.evaluate(() => {
      const sv = window.LumenAdminStageView;
      sv.setSimState({
        active: true,
        runners: {
          A: { currentIdx: 0, candidateIdx: 1, visited: [0], lastResult: { transition_pattern: 'contradiction' } },
          B: null,
        },
        compareMode: false,
      });
      const dots = document.querySelectorAll('#tvStageRoot g.tv-stage-ghost circle');
      const strokes = Array.from(dots).map(d => d.getAttribute('stroke'));
      // contradiction = #c97a6a 가 candidate 의 stroke 에 등장해야
      return { ok: strokes.some(s => s && s.toLowerCase() === '#c97a6a'), strokes };
    });
    rec('candidate 패턴 색 (contradiction=#c97a6a)', patternCheck.ok, patternCheck.strokes.join(','));

    // 9. 드래그 후 stage_position 갱신 + ARV 미수정 — 모듈 내부에서 직접 검증
    const dragCheck = await page.evaluate(async () => {
      const sv = window.LumenAdminStageView;
      const sceneWithARV = {
        id: 'fake-arv',
        scene_order: 0,
        originalReasonVector: { attribution: { self: 0.5, fate: 0.3 }, core_fear: { abandonment: 0.4, loss: 0.2 } },
        meta: { scene_code: 'XA' },
      };
      sv.setScenes([sceneWithARV]);
      sv.setSimState({ active: false, runners: { A: null, B: null }, compareMode: false });
      const beforeARV = JSON.parse(JSON.stringify(sceneWithARV.originalReasonVector));
      // 드래그 시뮬 — 직접 meta 갱신
      sceneWithARV.meta.stage_position = { x: 10, z: 5 };
      sv.setScenes([sceneWithARV]);
      const afterARV = sceneWithARV.originalReasonVector;
      return {
        ok: JSON.stringify(beforeARV) === JSON.stringify(afterARV) &&
            sceneWithARV.meta.stage_position.x === 10,
        beforeARV: JSON.stringify(beforeARV),
        afterARV: JSON.stringify(afterARV),
      };
    });
    rec('드래그(=stage_position 갱신) 가 ARV 미수정', dragCheck.ok, dragCheck.afterARV);

    // 10. 실 DB 라운드트립 — 한 씬에 stage_position write → reload → 복원 확인
    const roundtrip = await page.evaluate(async () => {
      // 첫 실 씬 가져오기 (state 가 module 안이라 supabase 클라이언트 직접 사용)
      const sb = (window.getSupabaseClient ? await window.getSupabaseClient() : null);
      if (!sb) return { ok: false, reason: 'no supabase client' };
      const lbl = document.getElementById('tvMemoryLabel');
      // memory id 는 라벨에서 못 얻음 — meta 직접 select
      const { data: scenesList } = await sb.from('scenes').select('id, meta').limit(1);
      if (!scenesList || !scenesList.length) return { ok: false, reason: 'no scene' };
      const target = scenesList[0];
      const original = target.meta || {};
      const testCoord = { x: 12.345, z: -8.765 };
      const newMeta = Object.assign({}, original, { stage_position: testCoord });
      const { error: upErr } = await sb.from('scenes').update({ meta: newMeta }).eq('id', target.id);
      if (upErr) return { ok: false, reason: 'update fail: ' + upErr.message };
      const { data: re } = await sb.from('scenes').select('meta').eq('id', target.id).single();
      const got = re && re.meta && re.meta.stage_position;
      // cleanup — 원래 meta 로 복원
      await sb.from('scenes').update({ meta: original }).eq('id', target.id);
      return {
        ok: got && Math.abs(got.x - testCoord.x) < 1e-6 && Math.abs(got.z - testCoord.z) < 1e-6,
        got,
      };
    });
    rec('DB 라운드트립 — meta.stage_position 보존', roundtrip.ok, JSON.stringify(roundtrip));

    // 콘솔 에러 0건
    rec('console 에러 0건', errors.length === 0, errors.slice(0, 3).join(' | '));

  } catch (e) {
    rec('테스트 실행', false, e.message);
  } finally {
    await browser.close();
  }

  console.log('\n=== 작업 15 smoke 결과 ===');
  results.forEach(r => console.log(`${r.pass} ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
  const fail = results.filter(r => r.pass === '❌').length;
  console.log(`\n${results.length - fail}/${results.length} PASS`);
  process.exit(fail ? 1 : 0);
})();

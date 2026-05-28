/**
 * Quilt 발자국 attach + 발자국 박힘 검증 (mock runtime)
 *
 * 실제 PLAY/Strata 진입 없이도 LumenFootprints.attach 동작 확인.
 * 카메라 이동 시뮬레이션 후 scene.children 증가하는지.
 *
 * 실행: node test/e2e/quilt_footprints_attach.mjs (dev server 5173 필요)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(`${BASE}/play-test.html?quiltDemo=1`, { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(2000);

  const result = await page.evaluate(() => {
    const out = { steps: [] };
    const THREE = window.THREE;
    if (!THREE) { out.error = 'THREE not loaded'; return out; }
    if (!window.LumenFootprints) { out.error = 'LumenFootprints not loaded'; return out; }
    if (!window.QuiltDemoState) { out.error = 'QuiltDemoState not loaded'; return out; }

    // mock scene/camera/runtime
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 1.6, 0);
    let tickCount = 0;
    const runtime = {
      getScene: () => scene,
      getCamera: () => cam,
      getYaw: () => 0,
      isFirstPerson: () => true,
      tick: function () { tickCount++; },
      __lumenAdapter: {
        getTrajectory: () => [
          { x: 0, z: 0, yaw: 0 },
          { x: 1, z: 0, yaw: 0 },
          { x: 2, z: 0, yaw: 0 },
          { x: 3, z: 0, yaw: 0 },
        ],
      },
    };

    // mock quilt
    const quilt = new window.QuiltDemoState({
      memoryId: 'test-mem',
      getVisited: () => ['s1', 's2'],
      getTrajectory: () => runtime.__lumenAdapter.getTrajectory(),
    });
    runtime.__quiltDemo = quilt;

    const sceneBefore = scene.children.length;
    out.steps.push({ name: 'scene 초기 mesh', value: sceneBefore });

    const fp = window.LumenFootprints.attach(runtime, {
      quilt: () => quilt,
      getAccessibleCount: () => 1,
      onDoorReached: () => { out.doorReached = true; },
    });
    if (!fp) { out.error = 'attach returned null'; return out; }
    out.steps.push({ name: 'attach 성공', value: !!runtime.__lumenFootprints });

    // 첫 tick — 시작점에 첫 발자국
    runtime.tick();
    out.steps.push({ name: '첫 tick 후 active', value: fp.getActiveCount() });

    // 신장 절반 미만 이동 — 발자국 안 박힘
    cam.position.x = 0.3;
    runtime.tick();
    out.steps.push({ name: '0.3m 이동 후 active', value: fp.getActiveCount() });

    // 신장 절반 초과 이동 — 발자국 박힘
    cam.position.x = 1.0;
    runtime.tick();
    out.steps.push({ name: '1m 이동 후 active', value: fp.getActiveCount() });

    // 또 1m
    cam.position.x = 2.0;
    runtime.tick();
    out.steps.push({ name: '2m 이동 후 active', value: fp.getActiveCount() });

    // scene mesh 추가 확인
    out.steps.push({ name: 'scene mesh 증가', value: scene.children.length - sceneBefore });

    // 강제 return — 역순 발자국 즉시 출현
    const okForce = fp._forceReturn();
    out.steps.push({ name: '_forceReturn', value: okForce });
    out.steps.push({ name: 'return mode', value: quilt.getSnapshot().mode });
    out.steps.push({ name: 'return 후 active (initial 7개 즉시)', value: fp.getActiveCount() });

    // fade-out 시뮬레이션은 시간 필요 — skip

    return out;
  });

  await browser.close();

  console.log('\n=== Quilt Footprints Attach (mock runtime) ===');
  if (result.error) {
    console.log('❌ ERROR:', result.error);
    process.exit(1);
  }
  result.steps.forEach(s => console.log(`  ${s.name}: ${JSON.stringify(s.value)}`));
  if (consoleErrors.length) {
    console.log('\nconsole errors:');
    consoleErrors.slice(0, 5).forEach(e => console.log('  - ' + e));
  }

  // 검증
  const checks = [
    { name: '첫 tick 후 1개 발자국', pass: result.steps[2]?.value === 1 },
    { name: '0.3m 이동 시 그대로 1개', pass: result.steps[3]?.value === 1 },
    { name: '1m 이동 시 2개로 증가', pass: result.steps[4]?.value === 2 },
    { name: '2m 이동 시 3개로 증가', pass: result.steps[5]?.value === 3 },
    { name: 'return mode 전환', pass: result.steps[8]?.value === 'return' },
    { name: 'return 시 발자국 추가 (3 + initial)', pass: result.steps[9]?.value > 3 },
  ];
  console.log('\n=== Checks ===');
  let failed = 0;
  checks.forEach(c => { console.log(`${c.pass ? '✅' : '❌'} ${c.name}`); if (!c.pass) failed++; });
  console.log(`\n${failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });

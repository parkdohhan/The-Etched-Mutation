/**
 * Lumen 플레이스루 자동화 — 장면 진입 가능한지 검증
 *
 * 실행: node test/e2e/playthrough.mjs
 * 출력: test/e2e/screenshots/playthrough_*.png
 *
 * 플로우:
 *   1. FP 진입 확인
 *   2. 첫 scene pin 방향으로 WASD 이동 (최대 15초 시도)
 *   3. pin 접근 시 scene UI (#sceneMode) 활성 감지
 *   4. scene UI 내부 DOM 덤프 + 스크린샷
 *   5. 사용 가능하면 응답 제출 → 다음 전환 관찰
 */

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const BASE_URL = 'http://localhost:5173';
const OUT = 'test/e2e/screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
const page = await ctx.newPage();

const consoleMsgs = [];
page.on('console', msg => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));

await page.goto(BASE_URL + '/');
await page.waitForTimeout(1500);
const memId = await page.evaluate(async () => {
  const sb = await window.getSupabaseClient();
  const { data } = await sb.from('memories').select('id').limit(1);
  return data?.[0]?.id;
});

await page.goto(`${BASE_URL}/play-test.html?memory=${memId}&lang=ko`);
await page.waitForFunction(() => {
  const rt = window.TemAfStrataTerrain?._lastRuntime;
  return rt?.isFirstPerson?.();
}, { timeout: 15000 });
await page.waitForTimeout(2000);

// 씬 핀 목록 + 가장 가까운 pin 찾기
const navPlan = await page.evaluate(() => {
  const rt = window.TemAfStrataTerrain._lastRuntime;
  const cam = rt.getCamera();
  // _fpScenePins 는 클로저라 직접 접근 불가. window.getFpPins() 있으면 쓰고, 없으면 scene traverse.
  let pins = [];
  if (typeof window.getFpPins === 'function') {
    pins = window.getFpPins();
  } else {
    // scene 에서 scene pin userData 찾기
    const scene = rt.getScene();
    scene.traverse(o => {
      if (o.userData && o.userData._fpPin) {
        pins.push({ wx: o.position.x, wz: o.position.z, visited: !!o.userData.visited });
      }
    });
  }
  const camX = cam.position.x, camZ = cam.position.z;
  // 가장 가까운 accessible (미방문) pin
  const sorted = pins
    .filter(p => !p.visited)
    .map(p => ({ p, d: Math.sqrt((p.wx - camX) ** 2 + (p.wz - camZ) ** 2) }))
    .sort((a, b) => a.d - b.d);
  return {
    camX, camZ, camYaw: cam.rotation.y,
    pinCount: pins.length,
    nearest: sorted[0] || null
  };
});
console.log('[play] navPlan:', JSON.stringify(navPlan));

await page.screenshot({ path: `${OUT}/playthrough_01_start.png` });
console.log('[play] 01_start.png');

if (!navPlan.nearest) {
  console.log('[play] 접근 가능한 pin 없음 — 빈 메모리 또는 모두 방문 완료');
  await browser.close();
  process.exit(0);
}

// pin 방향으로 yaw 설정하고 W 전진
const dx = navPlan.nearest.p.wx - navPlan.camX;
const dz = navPlan.nearest.p.wz - navPlan.camZ;
const targetYaw = Math.atan2(-dx, -dz);  // forward = (-sin(yaw), -cos(yaw)) → yaw = atan2(-dx, -dz)
console.log(`[play] target pin 거리=${navPlan.nearest.d.toFixed(2)} yaw=${targetYaw.toFixed(3)}`);

await page.evaluate((yaw) => {
  const rt = window.TemAfStrataTerrain._lastRuntime;
  if (typeof rt.setYaw === 'function') rt.setYaw(yaw);
}, targetYaw);
await page.waitForTimeout(300);

// W 전진 — pin 근접까지 최대 15초
const approachStart = Date.now();
await page.evaluate(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
});

const approached = await page.waitForFunction(
  (targetPin) => {
    const rt = window.TemAfStrataTerrain._lastRuntime;
    const cam = rt.getCamera();
    const d = Math.sqrt((targetPin.wx - cam.position.x) ** 2 + (targetPin.wz - cam.position.z) ** 2);
    // scene UI 가 열려도 OK. pin 근접(3 유닛) 이내도 OK.
    const sceneOpen = document.getElementById('sceneMode');
    return d < 3.5 || (sceneOpen && sceneOpen.classList.contains('active'));
  },
  navPlan.nearest.p,
  { timeout: 15000 }
).then(() => true).catch(() => false);

await page.evaluate(() => {
  document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
});

console.log(`[play] 접근 완료 ${approached ? 'YES' : 'NO (timeout)'} · 소요 ${((Date.now()-approachStart)/1000).toFixed(1)}s`);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/playthrough_02_near_pin.png` });
console.log('[play] 02_near_pin.png');

const sceneState = await page.evaluate(() => {
  const sm = document.getElementById('sceneMode');
  return {
    sceneModeActive: sm && sm.classList.contains('active'),
    sceneModeVisible: sm && getComputedStyle(sm).display !== 'none',
    choiceButtons: document.querySelectorAll('.choice-btn, [data-choice-id], .scene-choice').length,
    hasTextInput: !!document.querySelector('#sceneResponse, textarea[placeholder*="답"]'),
    bodyClass: document.body.className
  };
});
console.log('[play] sceneState:', JSON.stringify(sceneState));

// scene UI 가 열렸으면 응답 제출 시도
if (sceneState.sceneModeActive) {
  await page.screenshot({ path: `${OUT}/playthrough_03_scene_ui.png` });
  console.log('[play] 03_scene_ui.png (scene UI opened)');
} else {
  console.log('[play] scene UI 근접 only 로는 안 열림 → 클릭 대용으로 _temEnterSceneMode 직호출 시도');
  // 핀 ID 얻어서 직접 scene mode 진입
  const entered = await page.evaluate(() => {
    const fp = window._fpPlay;
    if (!fp || typeof fp.pins !== 'function') return { error: 'no _fpPlay.pins' };
    const pins = fp.pins();
    const acc = pins.filter(p => p.accessible && !p.visited);
    if (!acc.length) return { error: 'no accessible pin', total: pins.length };
    const target = acc[0];
    if (typeof window._temEnterSceneMode !== 'function') return { error: 'no _temEnterSceneMode' };
    // sp 가 아니라 sp.pin 을 전달 (enterSceneMode 는 pinOrId 기대)
    window._temEnterSceneMode(target.pin);
    return { ok: true, pinType: target.pin && target.pin.type, pinId: target.pin && target.pin.id,
             sceneId: target.pin && target.pin.sceneId };
  });
  console.log('[play] _temEnterSceneMode:', JSON.stringify(entered));

  if (entered.ok) {
    await page.waitForTimeout(1500);  // scene UI 전환 + 텍스트 타이핑 애니 대기
    await page.screenshot({ path: `${OUT}/playthrough_03_scene_ui.png` });

    const sceneState2 = await page.evaluate(() => {
      const sm = document.getElementById('sceneMode');
      return {
        sceneModeActive: sm && sm.classList.contains('active'),
        sceneText: document.querySelector('#sceneText, .scene-text, #sceneBody')?.textContent?.trim().slice(0, 80),
        choiceButtons: document.querySelectorAll('.choice-btn, [data-choice-id], .scene-choice').length,
        hasTextInput: !!document.querySelector('#sceneResponse, textarea'),
      };
    });
    console.log('[play] sceneState2:', JSON.stringify(sceneState2));
    console.log('[play] 03_scene_ui.png 저장됨');
  }
}

await browser.close();
console.log('\n[play] 완료. 스크린샷:', OUT);
console.log('[play] console msgs:', consoleMsgs.length);

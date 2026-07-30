/**
 * Lumen 풀 플레이스루 — 확장 (2~5 시나리오 관찰)
 *
 * 목표:
 *   Phase 1. Scene 제출 → 복귀 → 두번째 pin 플레이 (여러 씬 연속)
 *   Phase 2. Void 중심 접근·체류 관찰 (auto-trigger 의도 꺼짐 · forceStart 만 수동)
 *   Phase 3. Exit door long press → 세션 종료
 *   Phase 4. 종료 후 화면 상태 (메뉴 / 엔드 화면)
 *
 * 실행: node test/e2e/full_playthrough_extended.mjs
 */

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

// 260730 QA 러너 대응: --url(vite HMR 리로드 간섭 회피용 정적 서버) · --memory(QA 전용 기억 고정) 인자
const _args = process.argv.slice(2);
const BASE_URL = (_args.find(a => a.startsWith('--url=')) || '--url=http://localhost:5173').slice(6);
const MEMORY_ARG = (_args.find(a => a.startsWith('--memory=')) || '--memory=').slice(9);
const OUT = 'test/e2e/screenshots';
await mkdir(OUT, { recursive: true });

const log = [];
const rec = (msg, detail) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  log.push(line);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
const page = await ctx.newPage();
const consoleMsgs = [];
page.on('console', m => { if (m.type() === 'error') consoleMsgs.push(m.text()); });
page.on('pageerror', e => consoleMsgs.push('[pageerror] ' + e.message));
page.on('dialog', async d => { console.log(`[dialog] ${d.message()}`); await d.accept(); });

// 부트 + FP 진입
await page.goto(BASE_URL + '/');
await page.waitForTimeout(1500);
const memId = MEMORY_ARG || await page.evaluate(async () => {
  const sb = await window.getSupabaseClient();
  const { data } = await sb.from('memories').select('id').limit(1);
  return data?.[0]?.id;
});
await page.goto(`${BASE_URL}/play-test.html?memory=${memId}&lang=ko`);
await page.waitForFunction(() => {
  const rt = window.TemAfStrataTerrain?._lastRuntime;
  return rt?.isFirstPerson?.();
}, { timeout: 15000 });
await page.waitForTimeout(3000);  // 독백+회전 끝
rec('FP 진입·독백 완료');

// helper: 가까운 미방문 핀
async function getNearestPin() {
  return await page.evaluate(() => {
    const fp = window._fpPlay;
    const rt = window.TemAfStrataTerrain._lastRuntime;
    const cam = rt.getCamera();
    if (!fp?.pins) return null;
    const pins = fp.pins().filter(p => p.accessible && !p.visited);
    if (!pins.length) return null;
    const sorted = pins
      .map(p => ({ sp: p, d: Math.sqrt((p.wx - cam.position.x) ** 2 + (p.wz - cam.position.z) ** 2) }))
      .sort((a, b) => a.d - b.d);
    return { wx: sorted[0].sp.wx, wz: sorted[0].sp.wz, d: sorted[0].d,
             total: pins.length, pinId: sorted[0].sp.pin?.id };
  });
}

async function walkToPin(target, maxSecs = 15) {
  await page.evaluate(({ wx, wz }) => {
    const rt = window.TemAfStrataTerrain._lastRuntime;
    const cam = rt.getCamera();
    const yaw = Math.atan2(-(wx - cam.position.x), -(wz - cam.position.z));
    if (rt.setYaw) rt.setYaw(yaw);
  }, target);
  await page.waitForTimeout(200);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })));
  const reached = await page.waitForFunction(({ wx, wz }) => {
    const cam = window.TemAfStrataTerrain._lastRuntime.getCamera();
    return Math.sqrt((wx - cam.position.x) ** 2 + (wz - cam.position.z) ** 2) < 3.0;
  }, target, { timeout: maxSecs * 1000 }).then(() => true).catch(() => false);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true })));
  return reached;
}

async function longPressCanvasCenter() {
  const box = await page.locator('#strataCanvas').boundingBox();
  if (!box) return false;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(1400);
  await page.mouse.up();
  return true;
}

async function submitScene(response) {
  try {
    await page.fill('textarea', response);
  } catch (_) { return { error: 'textarea fill 실패' }; }
  await page.waitForTimeout(300);
  const submitBtn = page.locator('button:has-text("제출"), button:has-text("다음"), .scene-submit, #coreSubmitBtn, #sceneSubmit, #submitBtn');
  if (!(await submitBtn.count())) return { error: 'submit 버튼 없음' };
  try {
    await submitBtn.first().click({ force: true, timeout: 5000 });
  } catch (e) { return { error: 'submit click 실패: ' + e.message }; }
  // LLM round-trip + analysisDone 타이핑(~4s) + wave hoist(1.5s) 대기 → 총 10s
  await page.waitForTimeout(10000);

  // FP 모드 복귀: ambient wave 클릭
  try {
    await page.locator('#fpAmbientWaveWrap').click({ force: true, timeout: 5000 });
  } catch (e) {
    return { ok: true, waveClickError: e.message };
  }
  await page.waitForTimeout(1500);
  const still = await page.evaluate(() => {
    const sm = document.getElementById('sceneMode');
    return sm && sm.classList.contains('active');
  });
  return { ok: true, sceneStillActive: still };
}

async function getSceneModeState() {
  return await page.evaluate(() => {
    const sm = document.getElementById('sceneMode');
    const body = document.querySelector('#sceneBody, .scene-text')?.textContent?.trim().slice(0, 60);
    const tb = document.getElementById('terrainBar');
    const tc = document.getElementById('terrainCanvas');
    return {
      sceneActive: sm && sm.classList.contains('active'),
      body,
      awaitingTerrain: tb && tb.classList.contains('awaiting-terrain'),
      terrainClickable: tc && tc.classList.contains('clickable'),
      fpActive: !!(window.TemAfStrataTerrain?._lastRuntime?.isFirstPerson?.())
    };
  });
}

// ═════════ Phase 1: 첫 씬 ═════════
rec('— Phase 1: 첫 씬 진입·제출 —');
let pin1 = await getNearestPin();
rec('pin1 타겟', JSON.stringify(pin1));
if (pin1) {
  const reached = await walkToPin(pin1);
  rec(`pin1 접근 ${reached ? 'OK' : 'FAIL'}`);
  await longPressCanvasCenter();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/ext_01_scene1.png` });
  const s1 = await getSceneModeState();
  rec('scene1 상태', JSON.stringify(s1));

  const submit1 = await submitScene('이 냄새는 어렴풋이 기억이 나.');
  rec('scene1 제출', JSON.stringify(submit1));
  await page.screenshot({ path: `${OUT}/ext_02_after_submit1.png` });
  const s1After = await getSceneModeState();
  rec('scene1 제출 후 상태', JSON.stringify(s1After));

  // (ambient wave 복귀는 submitScene 헬퍼 내부에서 처리됨)
}

// ═════════ Phase 1b: 두번째 씬 ═════════
rec('— Phase 1b: 두번째 씬 시도 —');
await page.waitForTimeout(500);
const pin2 = await getNearestPin();
rec('pin2 타겟', JSON.stringify(pin2));
if (pin2 && pin2.pinId !== pin1?.pinId) {
  const r2 = await walkToPin(pin2);
  rec(`pin2 접근 ${r2 ? 'OK' : 'FAIL'}`);
  await longPressCanvasCenter();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/ext_03_scene2.png` });
  rec('scene2 상태', JSON.stringify(await getSceneModeState()));
  const submit2 = await submitScene('그때는 정말 슬펐던 것 같아.');
  rec('scene2 제출', JSON.stringify(submit2));
  await page.screenshot({ path: `${OUT}/ext_04_after_submit2.png` });
} else {
  rec('pin2 없거나 pin1 동일 — 2개 이상 연속 플레이 미검증');
}

// ═════════ Phase 2: Void 중심 체류 ═════════
rec('— Phase 2: Void 중심 체류 관찰 —');
// scene 있으면 닫기
if ((await getSceneModeState()).sceneActive) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
  await page.locator('#strataCanvas').click({ position: { x: 640, y: 400 }, force: true }).catch(() => {});
  await page.waitForTimeout(500);
}

// 중심으로 이동
const voidAtStart = await page.evaluate(() => {
  const rt = window.TemAfStrataTerrain._lastRuntime;
  const cam = rt.getCamera();
  return { x: cam.position.x, z: cam.position.z, r: Math.sqrt(cam.position.x ** 2 + cam.position.z ** 2),
           rewindAuto: rt.__lumenRewind?.getOptions?.()?.triggerEvent };
});
rec('void 접근 시작', JSON.stringify(voidAtStart));
await walkToPin({ wx: 0, wz: 0, d: voidAtStart.r }, 20);
const voidArrive = await page.evaluate(() => {
  const cam = window.TemAfStrataTerrain._lastRuntime.getCamera();
  return { x: cam.position.x, z: cam.position.z, r: Math.sqrt(cam.position.x ** 2 + cam.position.z ** 2) };
});
rec('void 도달 시 위치', JSON.stringify(voidArrive));

// 3초 체류
await page.waitForTimeout(3500);
const voidDwell = await page.evaluate(() => {
  const rt = window.TemAfStrataTerrain._lastRuntime;
  return {
    isRewinding: rt.__lumenRewind?.isRewinding?.(),
    adapterInVoid: rt.__lumenAdapter?.isInVoid?.(),
    adapterEverEntered: rt.__lumenAdapter?.voidEverEntered?.(),
    voidRadius: rt.__lumenAdapter?.voidRadius
  };
});
rec('void 3초 체류 후', JSON.stringify(voidDwell));
await page.screenshot({ path: `${OUT}/ext_05_void.png` });

// ═════════ Phase 3: Exit door long press ═════════
rec('— Phase 3: Exit door long press —');
// 출구 door 위치 (22, 22)
await walkToPin({ wx: 22, wz: 22, d: 99 }, 20);
const doorArrive = await page.evaluate(() => {
  const cam = window.TemAfStrataTerrain._lastRuntime.getCamera();
  const d = Math.sqrt((22 - cam.position.x) ** 2 + (22 - cam.position.z) ** 2);
  return { x: cam.position.x, z: cam.position.z, doorDist: d };
});
rec('door 도달', JSON.stringify(doorArrive));
await page.screenshot({ path: `${OUT}/ext_06_near_door.png` });

// proximity hint 확인 + long press
const hintBefore = await page.evaluate(() => {
  const hint = Array.from(document.querySelectorAll('div'))
    .find(d => /길게 눌러/.test(d.textContent || ''))?.textContent;
  return hint;
});
rec('door proximity hint', hintBefore || '(없음)');

await longPressCanvasCenter();
await page.waitForTimeout(3000);  // seal/reveal flow 전환 대기
await page.screenshot({ path: `${OUT}/ext_07_after_door_press.png` });

// ═════════ Phase 4: 종료 후 상태 — 진행 추적 (최대 25초) ═════════
rec('— Phase 4: reveal → menu 진행 추적 —');
const snapshots = [];
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => {
    const rt = window.TemAfStrataTerrain?._lastRuntime;
    const anotherMeBtn = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .find(el => /또다른 나|another me|아카이브|archive/i.test(el.textContent || ''));
    return {
      fpStillActive: !!(rt?.isFirstPerson?.()),
      strataView: document.getElementById('strataView')?.style?.display,
      endScreen: !!document.querySelector('#endScreen.active, .end-screen.active, .end-screen.visible'),
      revealScreen: !!document.querySelector('#revealScreen.active, .reveal-screen.active'),
      revealDisplay: document.getElementById('revealScreen')?.style?.display,
      menuScreen: !!document.querySelector('#menuScreen.active, #mainMenu.active, #introScreen.visible'),
      anotherMe: anotherMeBtn ? anotherMeBtn.textContent.trim().slice(0, 30) : null,
      url: location.href
    };
  });
  snapshots.push({ t: (i + 1) * 5, ...s });
  rec(`  +${(i + 1) * 5}s`, JSON.stringify(s));
  await page.screenshot({ path: `${OUT}/ext_08_final_${i + 1}.png` });
  if (s.revealScreen) break;   // reveal 도달하면 즉시 탈출
}

// reveal 버튼 클릭 → reload → index.html 로 redirect 되는지 확인
rec('— Phase 5: revealRestart 버튼 클릭 후 reload 거동 확인 —');
const btnCount = await page.locator('#revealRestart').count();
if (btnCount > 0) {
  await page.locator('#revealRestart').click({ force: true }).catch(() => {});
  rec('다시 시작 버튼 클릭 → reload 대기 중');
  // reload 트리거 + 새 페이지 DOM 준비까지 명시 대기
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const afterReload = await page.evaluate(() => ({
    url: location.href,
    openingScreen: !!document.getElementById('openingScreen'),
    introScreen: !!document.getElementById('introScreen')
  })).catch(e => ({ error: e.message }));
  rec('reload 후 상태', JSON.stringify(afterReload));
  await page.screenshot({ path: `${OUT}/ext_09_after_restart.png` });
}

// 요약
console.log('\n━━━━━━━ 확장 플레이스루 요약 ━━━━━━━');
log.forEach(l => console.log(l));
console.log(`\nConsole 에러: ${consoleMsgs.length}건`);
consoleMsgs.slice(0, 8).forEach(m => console.log('  ' + m));

await browser.close();

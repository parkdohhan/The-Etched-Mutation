/**
 * Lumen 풀 플레이스루 — 일반 플레이어 시뮬레이션
 *
 * 실행: node test/e2e/full_playthrough.mjs [--headed]
 * 출력: test/e2e/screenshots/full_*.png + 콘솔 로그
 *
 * 단계:
 *   1. index.html 접속
 *   2. 한국어 선택 → 시작
 *   3. 오프닝 대사/애니 대기 or 스킵
 *   4. 감정 칩 클릭 (진짜 클릭)
 *   5. 빨려들어가는 연출 → play-test.html 자동 이동
 *   6. FP 자동 진입 + 독백 대기
 *   7. 핀 쪽으로 WASD 이동
 *   8. 캔버스 클릭으로 핀 raycast (실제 player UX)
 *   9. Scene UI 진입 확인
 *   10. 응답 텍스트 입력 + 제출
 *   11. 다음 씬 전환 / 엔드 화면 관찰
 */

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const args = process.argv.slice(2);
const BASE_URL = (args.find(a => a.startsWith('--url=')) || '--url=http://localhost:5173').slice(6);
const HEADLESS = !args.includes('--headed');
const OUT = 'test/e2e/screenshots';
await mkdir(OUT, { recursive: true });

const stepLog = [];
function step(name, detail) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${name}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  stepLog.push(line);
}

const browser = await chromium.launch({ headless: HEADLESS });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
const page = await ctx.newPage();

const consoleMsgs = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleMsgs.push(`[error] ${msg.text()}`);
});
page.on('pageerror', err => consoleMsgs.push(`[pageerror] ${err.message}`));
page.on('dialog', async d => { console.log(`[dialog ${d.type()}] ${d.message()}`); await d.accept(); });

// ═════════ 1. index.html ═════════
await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
step('index.html 로드');
await page.screenshot({ path: `${OUT}/full_01_index.png` });

// ═════════ 2. 언어 게이트 ═════════
// 게이트 pointer-events:auto 되는 400ms 대기 + 여유
await page.waitForTimeout(1500);
try {
  await page.locator('.opening-lang-btn[data-lang="ko"]').click({ force: true, timeout: 5000 });
  step('한국어 선택');
} catch (e) {
  step('한국어 선택 실패', e.message);
}
try {
  await page.locator('#openingStartBtn').click({ force: true, timeout: 5000 });
  step('시작 버튼 클릭');
} catch (e) {
  step('시작 버튼 클릭 실패', e.message);
}

// ═════════ 3. 오프닝 시퀀스 → 칩 등장까지 대기 ═════════
// 오프닝 screen 이 닫히고 openingV2 화면에서 칩 노출 (클래스 `.opening-chip`)
const chipSelector = 'button.opening-chip, .opening-v2-chip, [class*="opening"][class*="chip"]';
const chipsAppeared = await page.waitForFunction(
  (sel) => document.querySelectorAll(sel).length >= 3,
  chipSelector,
  { timeout: 25000 }
).then(() => true).catch(() => false);

step(`오프닝 진행 · 칩 노출 ${chipsAppeared ? 'OK' : 'TIMEOUT'}`);
await page.screenshot({ path: `${OUT}/full_02_chips.png` });

if (!chipsAppeared) {
  step('칩 미노출 — 오프닝 스킵 시도 (키 입력)');
  await page.keyboard.press('Space');
  await page.waitForTimeout(2000);
}

// ═════════ 4. 감정 칩 클릭 ═════════
const chipCount = await page.locator(chipSelector).count();
step(`노출된 칩 개수 ${chipCount}`);
if (chipCount > 0) {
  try {
    await page.locator(chipSelector).first().click({ force: true, timeout: 5000 });
    step('첫 감정 칩 클릭');
  } catch (e) {
    step('칩 클릭 실패', e.message);
  }
}

// ═════════ 5. play-test.html 전환 대기 ═════════
const transitioned = await page.waitForURL(/play-test\.html/, { timeout: 20000 })
  .then(() => true).catch(() => false);
step(`play-test.html 전환 ${transitioned ? 'OK' : 'TIMEOUT'}`, page.url());

if (!transitioned) {
  step('전환 실패 → fallback: 직접 URL 이동');
  const memId = await page.evaluate(async () => {
    const sb = await window.getSupabaseClient?.();
    const { data } = sb ? await sb.from('memories').select('id').limit(1) : { data: null };
    return data?.[0]?.id;
  });
  if (memId) {
    await page.goto(`${BASE_URL}/play-test.html?memory=${memId}&lang=ko`);
  }
}
await page.screenshot({ path: `${OUT}/full_03_play_landing.png` });

// ═════════ 6. FP 자동 진입 + 독백 ═════════
const fpActive = await page.waitForFunction(() => {
  const rt = window.TemAfStrataTerrain?._lastRuntime;
  return rt?.isFirstPerson?.();
}, { timeout: 15000 }).then(() => true).catch(() => false);
step(`FP 자동 진입 ${fpActive ? 'OK' : 'TIMEOUT'}`);
await page.waitForTimeout(3000);   // 독백 2줄 + 카메라 회전 대기
await page.screenshot({ path: `${OUT}/full_04_fp_entry.png` });

// ═════════ 7. 핀 방향 WASD 이동 ═════════
const target = await page.evaluate(() => {
  const fp = window._fpPlay;
  const rt = window.TemAfStrataTerrain._lastRuntime;
  const cam = rt.getCamera();
  if (!fp || typeof fp.pins !== 'function') return null;
  const pins = fp.pins().filter(p => p.accessible && !p.visited);
  if (!pins.length) return null;
  // 가장 가까운 pin
  const sorted = pins
    .map(p => ({ sp: p, d: Math.sqrt((p.wx - cam.position.x) ** 2 + (p.wz - cam.position.z) ** 2) }))
    .sort((a, b) => a.d - b.d);
  return { wx: sorted[0].sp.wx, wz: sorted[0].sp.wz, dist: sorted[0].d };
});
step('접근 대상 핀', target ? JSON.stringify(target) : 'no accessible pin');

if (target) {
  // 방향 세팅
  const dx = target.wx, dz = target.wz;
  await page.evaluate(({ wx, wz }) => {
    const rt = window.TemAfStrataTerrain._lastRuntime;
    const cam = rt.getCamera();
    const yaw = Math.atan2(-(wx - cam.position.x), -(wz - cam.position.z));
    if (typeof rt.setYaw === 'function') rt.setYaw(yaw);
  }, { wx: target.wx, wz: target.wz });
  await page.waitForTimeout(300);

  // W 전진 — 핀 3 유닛 내 접근까지
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })));
  const near = await page.waitForFunction(({ wx, wz }) => {
    const cam = window.TemAfStrataTerrain._lastRuntime.getCamera();
    const d = Math.sqrt((wx - cam.position.x) ** 2 + (wz - cam.position.z) ** 2);
    return d < 3.0;
  }, { wx: target.wx, wz: target.wz }, { timeout: 15000 }).then(() => true).catch(() => false);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true })));
  step(`핀 접근 ${near ? 'OK' : 'TIMEOUT'}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/full_05_near_pin.png` });

  // ═════════ 8. LONG PRESS (1.2초 홀드) 로 씬 진입 — 실제 UX ═════════
  // 조건: _fpNearPin 설정되려면 proximity <5 유닛. 앞서 <3 까지 접근했으니 proximity 통과.
  const proxCheck = await page.evaluate(() => {
    // proximity loop 는 _fpNearPin 을 closure 내 유지. DOM hint 로 감지.
    const hint = document.querySelector('#fpHintEl, div[style*="길게"]');
    const hintText = Array.from(document.querySelectorAll('div'))
      .find(d => /길게 눌러/.test(d.textContent || ''))?.textContent;
    return { hint: !!hint, hintText };
  });
  step('proximity hint 감지', JSON.stringify(proxCheck));

  const canvasBox = await page.locator('#strataCanvas').boundingBox();
  if (canvasBox) {
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;
    // LONG PRESS: mousedown → 1400ms 대기 (LONG_PRESS_MS=1200) → mouseup
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    step(`long press 시작 @ (${cx.toFixed(0)},${cy.toFixed(0)})`);
    await page.waitForTimeout(1400);
    await page.mouse.up();
    step('long press 종료 (1.4초 홀드)');
    await page.waitForTimeout(1500);   // 씬 전환 + scene mode 활성 대기
    await page.screenshot({ path: `${OUT}/full_06_after_hold.png` });
  }

  // ═════════ 9. Scene UI 확인 ═════════
  const sceneStatus = await page.evaluate(() => {
    const sm = document.getElementById('sceneMode');
    return {
      active: sm && sm.classList.contains('active'),
      body: document.querySelector('#sceneBody, #sceneText, .scene-text')?.textContent?.trim().slice(0, 100),
      hasInput: !!document.querySelector('#sceneResponse, textarea'),
      hasSubmit: !!document.querySelector('.scene-submit, button[onclick*="submit"], #sceneSubmit')
    };
  });
  step('scene UI 상태 (click 후)', JSON.stringify(sceneStatus));

  // click 으로 scene 안 열렸으면 직호출 fallback (player 경험은 클릭이 정답이지만 데이터 검증용)
  if (!sceneStatus.active) {
    step('click 으로 scene 진입 실패 → 직호출 fallback (플레이 데이터 검증 목적)');
    await page.evaluate(() => {
      const fp = window._fpPlay;
      const pins = fp.pins().filter(p => p.accessible && !p.visited);
      if (pins.length && window._temEnterSceneMode) window._temEnterSceneMode(pins[0].pin);
    });
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: `${OUT}/full_07_scene_ui.png` });

  // ═════════ 10. 응답 입력 + 제출 ═════════
  const sceneActive = await page.locator('#sceneMode.active').count();
  if (sceneActive > 0) {
    const resp = '이 냄새는 낯설지 않아, 어디선가 맡아본 적 있는 것 같아.';
    try {
      // 입력 textarea 찾기
      const textareaSel = 'textarea[placeholder], #sceneResponse, .scene-response-input textarea';
      await page.fill(textareaSel, resp);
      step('응답 텍스트 입력');
    } catch (e) {
      step('응답 textarea 없음 or fill 실패', e.message);
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/full_08_response_typed.png` });

    // 제출 버튼
    const submitBtn = page.locator('button:has-text("제출"), button:has-text("다음"), .scene-submit, #sceneSubmit');
    const btnCount = await submitBtn.count();
    step(`submit 버튼 후보 ${btnCount}개`);
    if (btnCount > 0) {
      try {
        await submitBtn.first().click({ force: true, timeout: 5000 });
        step('제출 클릭');
      } catch (e) {
        step('제출 클릭 실패', e.message);
      }
      // 응답 처리 대기 (LLM 라운드트립 최대 15초)
      await page.waitForTimeout(8000);
      await page.screenshot({ path: `${OUT}/full_09_after_submit.png` });

      const afterSubmit = await page.evaluate(() => {
        const sm = document.getElementById('sceneMode');
        return {
          stillActive: sm && sm.classList.contains('active'),
          endScreenVisible: !!document.querySelector('#endScreen.active, .end-screen.visible'),
          url: location.href
        };
      });
      step('제출 후 상태', JSON.stringify(afterSubmit));
    }
  }
}

// ═════════ 마무리 ═════════
await page.screenshot({ path: `${OUT}/full_10_final.png` });
step('종료 스크린샷 캡처');

console.log('\n━━━━ 플레이스루 요약 ━━━━');
stepLog.forEach(l => console.log(l));
console.log(`\nConsole 에러: ${consoleMsgs.length}건`);
consoleMsgs.slice(0, 10).forEach(m => console.log('  ' + m));

await browser.close();

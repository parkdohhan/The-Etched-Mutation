/**
 * Admin Auth Storage State 셋업 (1회 실행)
 *
 * 실행: node test/e2e/setup_admin_auth.mjs [--url=http://localhost:5173]
 *   1. Playwright 브라우저 headed 로 열림 → admin.html 자동 이동
 *   2. 너가 admin 계정으로 로그인 (이메일+비번, 매직링크, OAuth 뭐든 OK)
 *   3. 스크립트가 localStorage 의 Supabase 세션을 자동 감지
 *   4. 세션 감지되면 자동 저장하고 브라우저 닫음 — 터미널 입력 불필요
 *
 * 저장 위치: test/e2e/.auth/admin.json (gitignored)
 * 수동 종료: 창에서 Ctrl+C
 *
 * 세션 만료 (~7일 Supabase 기본) 후에는 이 스크립트 다시 돌려야 함.
 */

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const args = process.argv.slice(2);
const BASE_URL = (args.find(a => a.startsWith('--url=')) || '--url=http://localhost:5173').slice(6);
const STATE_PATH = 'test/e2e/.auth/admin.json';
const MAX_WAIT_MIN = 10;   // 10분 내 로그인 없으면 자동 종료

async function main() {
  await mkdir('test/e2e/.auth', { recursive: true });

  console.log(`\n[auth-setup] base=${BASE_URL}`);
  console.log('[auth-setup] 브라우저 띄움. admin 계정으로 로그인 하면 자동으로 저장·종료.');
  console.log('[auth-setup] 로그인 타임아웃: ' + MAX_WAIT_MIN + '분\n');

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ko-KR'
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/admin.html`);

  // Supabase 세션 키 폴링. v1: "supabase.auth.token" · v2: "sb-<ref>-auth-token"
  // 둘 다 access_token 문자열 포함하므로 raw에 access_token 있으면 세션 있는 것으로 간주.
  const detectSession = () => page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      keys.push(k);
      const raw = localStorage.getItem(k) || '';
      // 어떤 키든 raw 안에 access_token 이 있으면 Supabase 세션으로 본다 (충분히 유니크함)
      if (raw.includes('access_token') && (k.startsWith('sb-') || /supabase/i.test(k))) {
        return { hit: true, key: k, rawLen: raw.length };
      }
    }
    return { hit: false, keys };
  });

  const start = Date.now();
  const timeout = MAX_WAIT_MIN * 60 * 1000;
  let detected = false;
  let lastLog = 0;
  while (Date.now() - start < timeout) {
    try {
      const res = await detectSession();
      if (res.hit) {
        detected = true;
        console.log(`[auth-setup] 감지됨: key="${res.key}" rawLen=${res.rawLen}`);
        break;
      }
      // 10초마다 한 번 localStorage 키 목록 덤프
      if (Date.now() - lastLog > 10000) {
        lastLog = Date.now();
        console.log('[auth-setup] 대기 중... localStorage keys =', (res.keys || []).join(', ') || '(empty)');
      }
    } catch (_) { /* navigation 중이면 예외 가능 — 무시 */ }
    await page.waitForTimeout(800);
  }

  if (!detected) {
    console.log('[auth-setup] ❌ 세션 감지 타임아웃. 로그인 확인 후 다시 실행.');
    await browser.close();
    process.exit(1);
  }

  // 세션 값이 완전히 기록되도록 0.5초 더 대기 (렌더·리프레시 타이밍 안전마진)
  await page.waitForTimeout(500);
  await ctx.storageState({ path: STATE_PATH });
  console.log(`[auth-setup] ✅ 세션 감지 + 저장 완료: ${STATE_PATH}`);
  await browser.close();
}

main().catch(e => { console.error('[auth-setup] fatal:', e); process.exit(1); });

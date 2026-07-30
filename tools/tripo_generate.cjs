// Tripo text-to-3D 왕복 심부름꾼 — 파일럿 (2026-07-30, 사물 앵커 생성 파이프라인의 씨앗)
// 사용: node tools/tripo_generate.cjs --prompt "..." --out assets/object_models/panty.glb
// 키는 .env 의 TRIPO_API_KEY 에서 읽는다. 코드/로그에 키를 절대 출력하지 않는다.
// 의존성 0 (node 18+ 내장 fetch). 나중에 Supabase Edge Function 으로 이식할 몸통.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = 'https://openapi.tripo3d.ai/v3';
const POLL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000; // 문서 기준 통상 10~120초 — 여유 5분

function readEnvKey(name) {
  const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0 && t.slice(0, i).trim() === name) return t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const key = readEnvKey('TRIPO_API_KEY');
  if (!key) { console.error('[tripo] .env 에 TRIPO_API_KEY 가 없다'); process.exit(1); }
  const prompt = arg('prompt', null);
  const out = arg('out', null);
  const model = arg('model', 'v3.1-20260211');
  if (!prompt || !out) { console.error('usage: --prompt "..." --out file.glb [--model ...]'); process.exit(1); }

  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };

  // 생성 요청 (엔드포인트 정본: developers.tripo3d.ai/en/docs/quick-start)
  let task = null;
  for (const ep of ['/v3/generation/text-to-model']) {
    const res = await fetch(API.replace('/v3', '') + ep, {
      method: 'POST', headers, body: JSON.stringify({ prompt, model }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body && body.data && body.data.task_id) { task = body.data.task_id; break; }
    console.log('[tripo] ' + ep + ' -> HTTP ' + res.status + ' ' + JSON.stringify(body).slice(0, 300));
    if (res.status !== 404) break; // 404 만 다음 후보 시도, 그 외(401 등)는 즉시 중단
  }
  if (!task) { console.error('[tripo] 생성 요청 실패'); process.exit(1); }
  console.log('[tripo] task:', task);

  // 폴링
  const t0 = Date.now();
  let modelUrl = null;
  while (Date.now() - t0 < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(API + '/tasks/' + task, { headers });
    const body = await res.json().catch(() => ({}));
    const d = (body && body.data) || {};
    process.stdout.write('\r[tripo] status: ' + d.status + ' progress: ' + (d.progress != null ? d.progress : '?') + '   ');
    if (d.status === 'success') { modelUrl = d.output && d.output.model_url; break; }
    if (d.status === 'failed' || d.status === 'banned' || d.status === 'cancelled' || d.status === 'expired') {
      console.error('\n[tripo] 작업 실패: ' + JSON.stringify(body).slice(0, 400)); process.exit(1);
    }
  }
  if (!modelUrl) { console.error('\n[tripo] 시간 초과 또는 model_url 없음'); process.exit(1); }
  console.log('\n[tripo] model_url 수신, 다운로드 중…');

  const bin = await fetch(modelUrl);
  if (!bin.ok) { console.error('[tripo] 다운로드 실패 HTTP ' + bin.status); process.exit(1); }
  const buf = Buffer.from(await bin.arrayBuffer());
  fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, out), buf);
  console.log('[tripo] 저장 완료: ' + out + ' (' + (buf.length / 1024).toFixed(0) + ' KB)');
}

main().catch((e) => { console.error('[tripo] 오류:', e.message); process.exit(1); });

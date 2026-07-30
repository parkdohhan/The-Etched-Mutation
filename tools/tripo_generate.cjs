// Tripo text-to-3D 왕복 심부름꾼 — 파일럿 (2026-07-30, 사물 앵커 생성 파이프라인의 씨앗)
// 사용:
//   사물(1단):  node tools/tripo_generate.cjs --prompt "..." --out assets/object_models/panty.glb
//   유령(3단):  node tools/tripo_generate.cjs --prompt "..." --rig --animations "preset:idle" --out assets/ghost_models/faceless.glb
//   이어하기:   node tools/tripo_generate.cjs --from-task <task_id> --rig --animations "preset:idle" --out ...
//               (생성은 이미 됐는데 리깅부터 다시 하고 싶을 때 — 크레딧 절약)
// 키는 .env 의 TRIPO_API_KEY 에서 읽는다. 코드/로그에 키를 절대 출력하지 않는다.
// 의존성 0 (node 18+ 내장 fetch). 나중에 Supabase Edge Function 으로 이식할 몸통.
//
// 리깅 3단 v3 형식 (정본: VAST-AI-Research/tripo-js-sdk src/client.js + examples/rig-and-animate.js, 260730 확인):
//   POST /v3/animations/rig-check { input: <task_id> }            → output.riggable, output.rig_type
//   POST /v3/animations/rig      { input, rig_type, spec, out_format }   // spec: mixamo | tripo
//   POST /v3/animations/retarget { input: <rig_task_id>, animations(≤5), out_format,
//                                  bake_animation, export_with_geometry }
//   spec=mixamo 로 심으면 본 이름이 Mixamo 계열 → lumen_scene_mannequins.js 의
//   headBone 탐색(/head$/i)·클립 재생이 그대로 호환된다.
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
function flag(name) {
  return process.argv.indexOf('--' + name) !== -1;
}

// 작업 하나 등록 → task_id 반환. ep 는 '/generation/text-to-model' 같은 전용 경로.
async function createTask(headers, ep, body) {
  const res = await fetch(API + ep, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  const id = (data && data.data && data.data.task_id) || data.task_id || null;
  if (res.ok && id) return id;
  throw new Error('작업 등록 실패 (' + ep + '): HTTP ' + res.status + ' ' + JSON.stringify(data).slice(0, 300));
}

// success 까지 폴링 → data(전체) 반환
async function pollTask(headers, task, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(API + '/tasks/' + task, { headers });
    const body = await res.json().catch(() => ({}));
    const d = (body && body.data) || {};
    process.stdout.write('\r[tripo] ' + label + ' status: ' + d.status + ' progress: ' + (d.progress != null ? d.progress : '?') + '   ');
    if (d.status === 'success') { process.stdout.write('\n'); return d; }
    if (d.status === 'failed' || d.status === 'banned' || d.status === 'cancelled' || d.status === 'expired') {
      throw new Error(label + ' 실패: ' + JSON.stringify(body).slice(0, 400));
    }
  }
  throw new Error(label + ' 시간 초과');
}

// 결과 모델 주소 — task type 마다 자리가 달라서 후보 순회 (retarget 은 model_urls 배열일 수 있음)
function modelUrlOf(d) {
  const o = (d && d.output) || {};
  if (Array.isArray(o.model_urls) && o.model_urls.length) return o.model_urls[0];
  return o.model || o.model_url || o.pbr_model || o.base_model || null;
}

async function download(url, out) {
  const bin = await fetch(url);
  if (!bin.ok) throw new Error('다운로드 실패 HTTP ' + bin.status);
  const buf = Buffer.from(await bin.arrayBuffer());
  fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, out), buf);
  console.log('[tripo] 저장 완료: ' + out + ' (' + (buf.length / 1024).toFixed(0) + ' KB)');
}

async function main() {
  const key = readEnvKey('TRIPO_API_KEY');
  if (!key) { console.error('[tripo] .env 에 TRIPO_API_KEY 가 없다'); process.exit(1); }
  const prompt = arg('prompt', null);
  const out = arg('out', null);
  const model = arg('model', 'v3.1-20260211');
  const fromTask = arg('from-task', null);        // 생성 건너뛰고 이 task 에서 이어하기
  const doRig = flag('rig');
  const animations = arg('animations', 'preset:idle').split(',').map((s) => s.trim()).filter(Boolean);
  const spec = arg('spec', 'mixamo');             // mixamo | tripo — 기본 mixamo (본 이름 호환)
  // 리깅 엔진 버전 — 미지정 시 서버 기본값이 낡아서 400 이 남 (260730 실측: 허용 v1.0-20240301, v2.5-20260210)
  const rigModel = arg('rig-model', 'v2.5-20260210');
  if ((!prompt && !fromTask) || !out) {
    console.error('usage: --prompt "..." --out file.glb [--model ...] [--rig [--animations "preset:idle,preset:walk"] [--spec mixamo]] [--from-task id]');
    process.exit(1);
  }
  if (animations.length > 5) { console.error('[tripo] animations 는 최대 5개'); process.exit(1); }

  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };

  // ── 1단: 생성 (또는 --from-task 로 건너뜀) ──
  let baseTask = fromTask;
  let baseData = null;
  if (!baseTask) {
    baseTask = await createTask(headers, '/generation/text-to-model', { prompt, model });
    console.log('[tripo] 생성 task:', baseTask);
    baseData = await pollTask(headers, baseTask, '생성');
  } else {
    console.log('[tripo] 생성 건너뜀 — from-task:', baseTask);
  }

  // ── 리깅 없이 끝 (사물 경로, 기존 동작 그대로) ──
  if (!doRig) {
    if (!baseData) baseData = await pollTask(headers, baseTask, '조회');
    const url = modelUrlOf(baseData);
    if (!url) { console.error('[tripo] model url 없음: ' + JSON.stringify(baseData.output || {}).slice(0, 300)); process.exit(1); }
    console.log('[tripo] model_url 수신, 다운로드 중…');
    await download(url, out);
    return;
  }

  // ── 2단: 리깅 가능 검사 → 뼈대 심기 ──
  const checkId = await createTask(headers, '/animations/rig-check', { input: baseTask });
  const checkData = await pollTask(headers, checkId, '리깅검사');
  const riggable = checkData.output && checkData.output.riggable;
  const rigType = (checkData.output && checkData.output.rig_type) || 'biped';
  console.log('[tripo] 리깅검사: riggable=' + riggable + ' rig_type=' + rigType);
  if (!riggable) { console.error('[tripo] 리깅 불가 판정 — 프롬프트를 바꿔 다시 생성해야 함 (base=' + baseTask + ')'); process.exit(1); }

  const rigId = await createTask(headers, '/animations/rig', {
    input: baseTask, rig_type: rigType, spec, out_format: 'glb', model: rigModel,
  });
  await pollTask(headers, rigId, '리깅');
  console.log('[tripo] 리깅 task:', rigId);

  // ── 3단: 동작 입히기 (geometry 포함해서 단독 재생 가능한 GLB 로) ──
  const retargetId = await createTask(headers, '/animations/retarget', {
    input: rigId, animations, out_format: 'glb',
    bake_animation: true, export_with_geometry: true,
  });
  const retargetData = await pollTask(headers, retargetId, '동작');
  const url = modelUrlOf(retargetData);
  if (!url) { console.error('[tripo] 동작 결과 model url 없음: ' + JSON.stringify(retargetData.output || {}).slice(0, 300)); process.exit(1); }
  console.log('[tripo] 동작 입힌 GLB 수신, 다운로드 중…');
  await download(url, out);
  console.log('[tripo] 끝. base=' + baseTask + ' rig=' + rigId + ' retarget=' + retargetId);
}

main().catch((e) => { console.error('[tripo] 오류:', e.message); process.exit(1); });

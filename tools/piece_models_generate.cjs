// 조각 꾸밈에 쓸 사물 모형을 한꺼번에 만든다 (2026-11-19).
// 사용:  node tools/piece_models_generate.cjs "Tem - dangsin/설계/당신입니까_조각꾸밈-261119.json" [--only 열쇠,변기] [--dry]
// 꾸밈 정본(JSON)의 models_todo = { 낱말: [파일이름, 영어 생성 문구] } 를 차례로 tools/tripo_generate.cjs 에 넘겨
// assets/object_models/<폴더>/ 에 저장하고, 끝에 기억(memories.meta.object_models)에 등록할 SQL 을 출력한다.
// 이미 파일이 있는 낱말은 건너뛴다(다시 돈 쓰지 않음). 생성은 유료 — 작가 승인 후에만 돌린다.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const specPath = process.argv[2];
if (!specPath) { console.error('꾸밈 정본 JSON 경로가 필요합니다'); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, specPath), 'utf8'));
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const only = arg('only') ? arg('only').split(',').map((x) => x.trim()) : null;
const dry = process.argv.includes('--dry');
const dir = 'assets/object_models/' + (spec.model_dir || 'dang');
const reg = {};
for (const [word, [file, prompt]] of Object.entries(spec.models_todo || {})) {
  if (only && !only.includes(word)) continue;
  const out = dir + '/' + file;
  if (fs.existsSync(path.join(ROOT, out))) { console.log('있음 —', word, out); reg[word] = { path: out }; continue; }
  if (dry) { console.log('만들 것 —', word, '→', out, '|', prompt); continue; }
  console.log('생성 —', word);
  const r = spawnSync(process.execPath, [path.join(__dirname, 'tripo_generate.cjs'), '--model', 'P1-20260311', '--prompt', prompt + (spec.model_prompt_tail || ''), '--out', out], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('실패 —', word, '(여기서 멈춤. 이미 만든 것은 다음 실행 때 건너뜁니다)'); break; }
  reg[word] = { path: out, source: 'tripo:P1-20260311', created_at: new Date().toISOString().slice(0, 10) };
}
if (Object.keys(reg).length) {
  console.log('');
  console.log('-- 기억에 등록 (Supabase SQL):');
  console.log("update memories set meta = jsonb_set(coalesce(meta,'{}'::jsonb), '{object_models}', coalesce(meta->'object_models','{}'::jsonb) || '" + JSON.stringify(reg).replace(/'/g, "''") + "'::jsonb, true) where id = '" + spec.memory_id + "';");
}

// tools/author_memory_spec_to_sql.mjs — 기억 스펙(JSON) → scenes INSERT SQL (2026-09-15)
//
// 소설 → 기억 저작 자동화의 첫 조각. 스펙 파일(author-spec-v1) 의 scenes[] 를 읽어
// scenes 테이블 INSERT 문을 찍는다. 실행 주체(service_role / Supabase SQL 편집기 / MCP)는
// 이 파일이 정하지 않는다 — SQL 텍스트만 만든다.
//
// 사용:
//   node tools/author_memory_spec_to_sql.mjs --spec "Tem - gwonyeok/설계/권역_기억_스펙-260915.json" --memory-id <uuid>
//   node tools/author_memory_spec_to_sql.mjs --spec ... --memory-id ... --out /tmp/scenes.sql
//   node tools/author_memory_spec_to_sql.mjs --spec ... --memory-id ... --update      ← 이미 심은 씬 고치기
//     --update: spec.db.scene_ids_by_order[order] 로 씬을 찾아 UPDATE. 본문·감정·잔향·잠금·침묵과
//       meta 의 저작 칸(scene_code·motif_tags·object_tags·object_lines·symbol_object·ghost_name·
//       dialog_choices·stage_position·sound_prompt/volume/radius)만 바꾸고, sound_url·object_pos 같은
//       나중에 붙은 칸은 보존한다. spec.db.deleted_scene_ids 가 있으면 그 씬을 먼저 DELETE.
//
// 씬 한 행에 들어가는 것 (admin Canvas 씬 패널이 쓰는 칸과 동일 — docs/admin_사용설명서 §0.1.1):
//   scene_order · scene_role · text · text_stage_1 · echo_words(json[]) · anchor_emotions(jsonb)
//   original_emotion / emotion_dist / emotion_vector (같은 객체 — admin 저장 규칙과 동일)
//   exclusions(jsonb|null) · void_info(jsonb|null)
//   meta: scene_code · motif_tags · object_tags · object_lines? · symbol_object? · ghost_name?
//         author_bridges[] · dialog_choices{ghost_intro,choices,scene_context}? · stage_position
//         sound_prompt? / sound_url? / sound_volume / sound_radius
//   소리 파일(sound_url)은 별도 단계(generate-scene-sound)에서 채운다 — 스펙에 url 이 있으면 그대로.

import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const specPath = arg('spec', null);
const memoryId = arg('memory-id', null);
const outPath = arg('out', null);
const updateMode = process.argv.includes('--update');
if (!specPath || !memoryId) {
  console.error('usage: --spec <spec.json> --memory-id <uuid> [--out file.sql]');
  process.exit(1);
}
if (!/^[0-9a-f-]{36}$/i.test(memoryId)) {
  console.error('memory-id 가 UUID 꼴이 아니다: ' + memoryId);
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(path.resolve(specPath), 'utf8'));
const scenes = Array.isArray(spec.scenes) ? spec.scenes : [];
if (!scenes.length) { console.error('scenes 가 비어 있다'); process.exit(1); }

// dollar-quoting — 본문에 따옴표·역슬래시가 있어도 안전. 태그 문자열이 본문에 나오면 태그를 바꾼다.
function dq(s) {
  let tag = 'q';
  let n = 0;
  while (s.includes('$' + tag + '$')) { n += 1; tag = 'q' + n; }
  return '$' + tag + '$' + s + '$' + tag + '$';
}
function jsonb(v) { return dq(JSON.stringify(v)) + '::jsonb'; }
// scenes.echo_words 는 json[] (json 값의 배열) — text[] 를 넣으면 42804. 원소마다 to_json(text) 로 감싼다.
function jsonArr(arr) {
  const xs = Array.isArray(arr) ? arr : [];
  if (!xs.length) return "'{}'::json[]";
  return 'ARRAY[' + xs.map((x) => 'to_json(' + dq(String(x)) + '::text)').join(', ') + ']::json[]';
}
function nullable(v, f) { return v == null ? 'NULL' : f(v); }

// 씬 하나의 meta 저작 칸 (INSERT 는 통째, UPDATE 는 이 키들만 덮음)
function authoredMeta(s) {
  const meta = {
    scene_code: s.code || String(s.order),
    motif_tags: Array.isArray(s.motif_tags) ? s.motif_tags : [],
    author_bridges: [],
  };
  if (Array.isArray(s.object_tags)) meta.object_tags = s.object_tags;      // [] = 사물 없음 (3상태 규칙)
  if (s.object_lines && Object.keys(s.object_lines).length) meta.object_lines = s.object_lines;
  if (s.symbol_object) meta.symbol_object = s.symbol_object;
  if (s.ghost_name) meta.ghost_name = s.ghost_name;
  if (Array.isArray(s.ghost_intro) && s.ghost_intro.length) {
    meta.dialog_choices = { ghost_intro: s.ghost_intro, choices: [], scene_context: [] };
  }
  if (s.stage_position && Number.isFinite(s.stage_position.x) && Number.isFinite(s.stage_position.z)) {
    meta.stage_position = { x: +(+s.stage_position.x).toFixed(3), z: +(+s.stage_position.z).toFixed(3) };
  }
  if (s.sound) {
    if (s.sound.url) meta.sound_url = s.sound.url;
    if (s.sound.prompt) meta.sound_prompt = s.sound.prompt;
    if (s.sound.url || s.sound.prompt) {
      meta.sound_volume = Number.isFinite(s.sound.volume) ? s.sound.volume : 1;
      meta.sound_radius = Number.isFinite(s.sound.radius) ? s.sound.radius : 15;
    }
  }
  if (s.label) meta.authoring_label = s.label;
  return meta;
}
// UPDATE 에서 스펙에 없으면 지워야 하는 선택 키 (있던 값이 남아 옛 저작을 되살리지 않게)
const OPTIONAL_META_KEYS = ['object_lines', 'symbol_object', 'ghost_name', 'dialog_choices', 'object_tags'];

const rows = scenes.map((s) => {
  const emo = s.original_emotion || {};
  const meta = authoredMeta(s);

  return '(' + [
    dq(memoryId) + '::uuid',
    String(Number(s.order)),
    "'normal'",
    dq(s.role === 'residual' ? 'residual' : 'anchor'),
    dq(String(s.text || '')),
    nullable(s.text_stage_1, (v) => dq(String(v))),
    jsonArr(s.echo_words),
    nullable(s.anchor_emotions, jsonb),
    jsonb(emo), jsonb(emo), jsonb(emo),
    nullable(s.exclusions, jsonb),
    nullable(s.void_info, jsonb),
    jsonb(meta),
  ].join(',\n   ') + ')';
});

function buildUpdateSql() {
  const ids = (spec.db && spec.db.scene_ids_by_order) || {};
  const deleted = (spec.db && spec.db.deleted_scene_ids) || {};
  const out = ['-- generated by tools/author_memory_spec_to_sql.mjs (--update) — ' + path.basename(specPath) + ' → memory ' + memoryId];
  for (const [label, id] of Object.entries(deleted)) {
    out.push(`delete from scenes where id = ${dq(String(id))}::uuid and memory_id = ${dq(memoryId)}::uuid; -- 삭제: ${label}`);
  }
  // 순서 충돌 회피: scene_order 를 먼저 큰 임시값으로 올린 뒤(+1000) 최종값으로 내린다 (unique 제약 대비)
  const targets = scenes.map((s) => ({ s, id: ids[String(s.order)] })).filter((t) => t.id);
  const missing = scenes.filter((s) => !ids[String(s.order)]).map((s) => s.order);
  if (missing.length) console.error('경고: scene_ids_by_order 에 없는 order → 건너뜀: ' + missing.join(', '));
  targets.forEach(({ s, id }) => out.push(`update scenes set scene_order = ${1000 + Number(s.order)} where id = ${dq(String(id))}::uuid;`));
  targets.forEach(({ s, id }) => {
    const emo = s.original_emotion || {};
    const meta = authoredMeta(s);
    // sound_url 이 이미 있으면 스펙의 url 없는 sound 블록이 그것을 지우면 안 된다 — url 키는 스펙에 있을 때만.
    const metaPatch = { ...meta };
    if (!(s.sound && s.sound.url)) delete metaPatch.sound_url;
    const strip = OPTIONAL_META_KEYS.map((k) => ` - ${dq(k)}`).join('');
    out.push('update scenes set ' + [
      `scene_order = ${Number(s.order)}`,
      `scene_role = ${dq(s.role === 'residual' ? 'residual' : 'anchor')}`,
      `text = ${dq(String(s.text || ''))}`,
      `text_stage_1 = ${nullable(s.text_stage_1, (v) => dq(String(v)))}`,
      `echo_words = ${jsonArr(s.echo_words)}`,
      `anchor_emotions = ${nullable(s.anchor_emotions, jsonb)}`,
      `original_emotion = ${jsonb(emo)}`, `emotion_dist = ${jsonb(emo)}`, `emotion_vector = ${jsonb(emo)}`,
      `exclusions = ${nullable(s.exclusions, jsonb)}`,
      `void_info = ${nullable(s.void_info, jsonb)}`,
      `meta = (coalesce(meta, '{}'::jsonb)${strip}) || ${jsonb(metaPatch)}`,
    ].join(',\n   ') + `\n where id = ${dq(String(id))}::uuid; -- #${s.order} ${s.label || ''}`);
  });
  out.push(`select scene_order, scene_role, meta->>'scene_code' as code, length(text) as len, meta->'motif_tags' as motifs from scenes where memory_id = ${dq(memoryId)}::uuid order by scene_order;`);
  return out.join('\n') + '\n';
}

const sql = updateMode ? buildUpdateSql() :
  '-- generated by tools/author_memory_spec_to_sql.mjs — ' + path.basename(specPath) + ' → memory ' + memoryId + '\n' +
  'insert into scenes (memory_id, scene_order, scene_type, scene_role, text, text_stage_1, echo_words, anchor_emotions, original_emotion, emotion_dist, emotion_vector, exclusions, void_info, meta)\n' +
  'values\n' + rows.join(',\n') + '\n' +
  'returning id, scene_order, scene_role, left(text, 24) as head;\n';

if (outPath) { fs.writeFileSync(path.resolve(outPath), sql, 'utf8'); console.error('wrote ' + outPath + ' (' + rows.length + ' scenes)'); }
else process.stdout.write(sql);

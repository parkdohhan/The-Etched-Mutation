// 안개 기하부만 추출해 갇힘 재현·수리 검증. attach 는 셰이더 uniform 을 요구하므로
// 소스에서 순수 기하 함수 블록(_effective ~ constrainMove)만 잘라 독립 평가한다.
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('d:/The Etched Mutation/js/ui/lumen_spatial_fog.js', 'utf8');
const lines = src.split(/\r?\n/);

const findLine = (needle, from = 0) => {
  for (let i = from; i < lines.length; i++) if (lines[i].includes(needle)) return i;
  throw new Error('못 찾음: ' + needle);
};
// DEFAULTS 와 _now 는 attach 밖, 기하부는 attach 안
const defStart = findLine('var DEFAULTS = {');
const defEnd = findLine('};', defStart);
const nowStart = findLine('function _now()');
const nowEnd = findLine('}', nowStart);
const easeLine = findLine('function _ease(t)');
const geomStart = findLine('function _effective(rp, now)');
const geomEnd = findLine('global.__temSpatialFogConstrain = constrainMove;');

// 시간 제어: 소스의 _now 대신 가짜 시계를 쓴다. 걷힘/닫힘은 시간 애니메이션이라
// 시계를 안 돌리면 close 직후 값이 그대로여서 사고를 재현할 수 없다.
const harness = `
${lines.slice(defStart, defEnd + 1).join('\n')}
${lines[easeLine]}
var FAKE_T = 1000000;
function _now(){ return FAKE_T; }
function advance(ms){ FAKE_T += ms; }
var opts = Object.assign({}, DEFAULTS);
var _reveals = [], _lift = 0, _lifting = false, _liftT0 = 0;
var global = { __temSpatialFogOnWallTouch: function(){ wallTouches++; } };
var wallTouches = 0;
${lines.slice(geomStart, geomEnd + 1).join('\n')}
function clear(){ _reveals.length = 0; _pending.length = 0; _lift = 0; _lifting = false; }
module_exports = { revealAt, constrainMove, close, seed, carve, clear, opts, advance,
  wallTouches: function(){ return wallTouches; } };
`;

const sandbox = { console, performance: { now: () => Date.now() }, module_exports: null };
vm.createContext(sandbox);
vm.runInContext(harness, sandbox);
const F = sandbox.module_exports;
const BLOCK = F.opts.moveBlockBelow;
const at = (x, z) => F.revealAt(x, z);
const step = (fx, fz, tx, tz) => F.constrainMove(fx, fz, tx, tz);
const fmt = (r) => (r === null ? '자유(null)' : `막힘/보정 → (${r.x.toFixed(1)},${r.z.toFixed(1)})`);
let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
};

console.log(`기하부 추출 OK (BLOCK=${BLOCK})\n`);

console.log('[1] 정상 — 걷힌 자리 안에서 자유 이동');
F.clear(); F.seed(0, 0, 14);
check('걷힌 중심 이동 자유', step(0, 0, 1, 0) === null, `걷힘 ${at(0, 0).toFixed(3)}, ${fmt(step(0, 0, 1, 0))}`);

console.log('\n[2] 벽 보존 — 걷힌 자리에서 먼 안개로는 못 간다 (연출 유지)');
F.clear(); F.seed(0, 0, 14); F.advance(100);
const wall = step(10, 0, 40, 0);
check('안개로 큰 걸음 차단됨', wall !== null, `발밑 ${at(10, 0).toFixed(3)} → 목표 ${at(40, 0).toFixed(3)}, ${fmt(wall)}`);

console.log('\n[3] 사고 재현 — close 가 발밑을 삼킨 경우 (standAt 없음 = 옛 호출)');
F.clear(); F.seed(50, 50, 14);
const before = at(50, 50);
F.close(50, 50);
F.advance(4000);                 // 닫힘 애니메이션(closeMs 2600) 완료까지 진행
const after = at(50, 50);
console.log(`     발밑 걷힘 ${before.toFixed(3)} → ${after.toFixed(3)} (닫힘 완료 후)`);
check('사고 재현됨 (발밑이 안개에 잠김)', after < BLOCK, `${after.toFixed(3)} < ${BLOCK}`);
const escape = step(50, 50, 51, 50);
check('A 면제가 탈출 허용', escape === null, `${fmt(escape)} ← 수정 전이면 (50.0,50.0) 정지`);

console.log('\n[4] B 검증 — close(발밑, standAt) 은 발밑을 즉시 되열어야');
F.clear(); F.seed(50, 50, 14);
F.close(50, 50, { x: 50, z: 50 });
F.advance(4000);                 // 같은 시간을 흘려도 발밑은 살아 있어야 한다
const protectedRv = at(50, 50);
check('발밑이 벽 위로 복구', protectedRv >= BLOCK, `걷힘 ${protectedRv.toFixed(3)} ≥ ${BLOCK}`);
check('이동 자유', step(50, 50, 51, 50) === null, fmt(step(50, 50, 51, 50)));

console.log('\n[5] 사방 균일 안개 — 전 방향 시도 (원 사고 상황)');
F.clear();  // 아무것도 안 걷힘 = 완전 균일
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]];
let free = 0;
for (const [dx, dz] of dirs) if (step(100, 100, 100 + dx * 2, 100 + dz * 2) === null) free++;
check('모든 방향 탈출 가능', free === dirs.length, `${free}/${dirs.length} 방향 자유 ← 수정 전이면 0/6`);

console.log('\n[6] 회랑 위에서는 회랑 따라 이동, 밖으로는 막힘');
F.clear(); F.seed(0, 0, 14); F.carve(0, 0, 60, 0);
F.advance(3000);                 // 회랑 파임(corridorMs 1600) 완료까지 진행
check('회랑 위 전진 자유', step(30, 0, 33, 0) === null, `회랑 중앙 걷힘 ${at(30, 0).toFixed(3)}`);
const offCorridor = step(30, 0, 30, 30);
check('회랑 밖(측면) 제약 걸림', offCorridor !== null, `측면 걷힘 ${at(30, 30).toFixed(3)}, ${fmt(offCorridor)}`);


// ── [7] 순서 결함 (260728 D) ──────────────────────────────────────────────
// close 는 대상을 회랑의 **끝점**(rp.bx/bz)으로 고른다. 그래서 파기 → 닫기 순서면
// 닫는 지점이 방금 판 회랑의 끝점 근처일 때 **막 만든 길이 닫기 대상에 포함된다.**
// 실측(memory=1835926d): carve (4,-2)→(5,-7) 직후 close(8,3) 이 8항목을 닫았고,
// 끝점까지 거리 10.4 < 닫기 반경 12.8 이었다.
console.log('\n[7] 순서 결함 — close 가 방금 판 회랑을 지우는가');
const R_CLOSE = Math.max(F.opts.corridorRadius, F.opts.regionRadius) * 0.8;

// 순수 조건: 다른 걷힘(스폰 시드·발밑 보호)을 전부 배제하고 회랑 하나만 놓고 본다.
// 실전에서는 여러 겹이 겹쳐 대개 구제되지만(→ 7b), 규칙 자체의 결함은 이렇게만 보인다.
function pureOrder(closeFirst) {
  const stand = { x: 0, z: 0 }, target = { x: 0, z: 12 }, closed = { x: 2, z: 14 };
  F.clear();
  if (closeFirst) { F.close(closed.x, closed.z); F.carve(stand.x, stand.z, target.x, target.z); }
  else { F.carve(stand.x, stand.z, target.x, target.z); F.close(closed.x, closed.z); }
  F.advance(4000);
  return F.revealAt(target.x, target.z);
}
const p_old = pureOrder(false), p_new = pureOrder(true);
console.log(`  7a 순수 조건 (끝점→닫는점 거리 2.8 < ${R_CLOSE.toFixed(1)})`);
console.log(`     목표 걷힘 — 파기후닫기 ${p_old.toFixed(3)} / 닫기후파기 ${p_new.toFixed(3)}`);
check('7a 구순서: 방금 판 길이 지워짐 (결함 확인)', p_old < BLOCK, `${p_old.toFixed(3)} < ${BLOCK}`);
check('7a 신순서: 길 생존 (수리 확인)', p_new >= BLOCK, `${p_new.toFixed(3)} ≥ ${BLOCK}`);

// 7b — 실측 좌표에서는 겹친 걷힘(스폰 시드 r=14 + 발밑 보호 r=8)이 구제한다.
//   즉 이 기억에서 결함의 실피해는 없었다. 순서 수정은 방어적 조치 (비용 0).
F.clear();
F.seed(18, 18, 14); F.carve(18, 18, 8, 3); F.advance(3000);
F.seed(4, -2, 8); F.carve(4, -2, 5, -7); F.close(8, 3, { x: 4, z: -2 }); F.advance(4000);
const realOld = F.revealAt(5, -7);
console.log(`  7b 실측좌표 — 구순서에서도 목표 걷힘 ${realOld.toFixed(3)} (스폰 시드가 덮음)`);
check('7b 실측 배치에서는 겹친 걷힘이 구제 — 실피해 없었음', realOld >= BLOCK);

console.log(`\n===== 최종 통과 ${pass} / 실패 ${fail} =====`);
process.exit(fail ? 1 : 0);

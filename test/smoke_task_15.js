// 작업 15 (v1+v2+fallback) 콘솔 smoke
// 사용법:
//   1. npm run dev → admin.html → 로그인 → Canvas 탭
//   2. 메모리 라벨이 채워질 때까지 대기 (수 초)
//   3. DevTools Console 에 이 파일 통째로 붙여넣기
//
// 커버:
//   - 두 레이어 분할 + resizer 핸들
//   - terrain mesh (THREE.js ortho top-down) 로드
//   - ghost fallback chain (manual / af / emotion / order) 작동
//   - 시뮬 자동 재생 + 일시정지 + reset
//   - sim active 시 idle 씬 숨김 / reset 후 복귀
//   - stage_position 드래그가 originalReasonVector 미수정

(async () => {
  const sv = window.LumenAdminStageView;
  const checks = [];
  const ok = (n, p, d) => checks.push([p ? '✅' : '❌', n, d || '']);

  // 0. API surface
  ok('LumenAdminStageView 노출', !!sv);
  if (!sv) { _print(); return; }
  ok('mount/setScenes/setSimState/setMemoryId/_debugTerrain API',
     ['mount','setScenes','setSimState','setMemoryId','_debugTerrain'].every(k => typeof sv[k] === 'function'));

  // 1. 분할 — 두 레이어 + resizer
  const layerTop = document.getElementById('tvLayerTrajectory');
  const layerBot = document.getElementById('tvLayerPosition');
  const resizer = document.getElementById('tvLayerResizer');
  ok('상단 궤적 레이어 존재', !!layerTop);
  ok('하단 위치 레이어 존재', !!layerBot);
  ok('분할 resizer 핸들 존재 + bound', !!resizer && resizer._bound === true);

  // 2. resizer 드래그 (직접 dispatch — Playwright 헤드리스 우회와 동일 경로)
  const wrap = document.querySelector('#section-canvas .tv-canvas-wrap');
  const wrapR = wrap.getBoundingClientRect();
  const handleR = resizer.getBoundingClientRect();
  resizer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: handleR.left + 30, clientY: handleR.top + 3 }));
  window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: handleR.left + 30, clientY: wrapR.top + wrapR.height * 0.30 }));
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  const ratio30 = layerTop.getBoundingClientRect().height / wrapR.height;
  ok('resizer 드래그 ~30%', Math.abs(ratio30 - 0.30) < 0.04, `${(ratio30 * 100).toFixed(1)}%`);
  resizer.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const ratio50 = layerTop.getBoundingClientRect().height / wrapR.height;
  ok('더블클릭 50:50', Math.abs(ratio50 - 0.50) < 0.04, `${(ratio50 * 100).toFixed(1)}%`);

  // 3. terrain mesh 로드
  const dbg = sv._debugTerrain();
  ok('terrain canvas mount', dbg.hasCanvas);
  ok('terrain mesh (vertex>0)', dbg.hasMesh && dbg.meshVertexCount > 0, JSON.stringify(dbg));
  ok('memoryId 기록', !!dbg.memoryId, dbg.memoryId);

  // 4. ghost fallback — status 텍스트
  const status = document.getElementById('tvStageStatus')?.textContent || '';
  const m = status.match(/씬\s+(\d+)\s+·\s+수동\s+(\d+)\s+·\s+AF\s+(\d+)\s+·\s+감정\s+(\d+)\s+·\s+순서\s+(\d+)/);
  ok('status fallback 분포 표시', !!m, status);
  if (m) {
    const [_, total, manual, af, em, order] = m.map(Number);
    const placed = manual + af + em + order;
    ok('모든 씬이 어떤 fallback 으로든 placement (placed===total)', placed === total, `placed=${placed} total=${total}`);
  }
  const ghostNodes = document.querySelectorAll('#tvStageRoot g.tv-stage-ghost').length;
  ok('ghost SVG 노드 = 씬 수', m && ghostNodes === Number(m[1]), `ghostNodes=${ghostNodes}`);

  // 5. 시뮬 자동 재생
  const slider = document.querySelector('#tvSimSliders input[type=range]');
  if (slider) { slider.value = '0.5'; slider.dispatchEvent(new Event('input', { bubbles: true })); }
  document.getElementById('tvSimStartBtn').click();
  await new Promise(r => setTimeout(r, 150));
  ok('▶재생 → ⏸ 일시정지 텍스트', /일시정지/.test(document.getElementById('tvSimStartBtn').textContent));
  await new Promise(r => setTimeout(r, 1900)); // ~2 step
  const visited = window.__tvSimDebug?.A?.visited?.length || 0;
  ok('자동 step 누적 (>=2)', visited >= 2, `visited=${visited}`);

  // 6. 시뮬 active 시 idle 씬 숨김 — current+candidate 만 보여야
  const ghostsSim = document.querySelectorAll('#tvStageRoot g.tv-stage-ghost').length;
  ok('sim active 시 ghost 축소 (idle 숨김)', ghostsSim < ghostNodes, `before=${ghostNodes} sim=${ghostsSim}`);

  // 7. ⏸ → ▶
  document.getElementById('tvSimStartBtn').click();
  await new Promise(r => setTimeout(r, 150));
  ok('⏸ → ▶재생 텍스트 복귀', /재생/.test(document.getElementById('tvSimStartBtn').textContent) &&
                              !/일시정지/.test(document.getElementById('tvSimStartBtn').textContent));

  // 8. reset → 전체 다시
  document.getElementById('tvSimResetBtn').click();
  await new Promise(r => setTimeout(r, 200));
  const ghostsReset = document.querySelectorAll('#tvStageRoot g.tv-stage-ghost').length;
  ok('reset 후 전체 ghost 복귀', ghostsReset === ghostNodes, `${ghostsReset}/${ghostNodes}`);

  // 9. 속도 슬라이더 즉시 표시
  const speed = document.getElementById('tvSimSpeed');
  speed.value = '500'; speed.dispatchEvent(new Event('input', { bubbles: true }));
  ok('속도 슬라이더 즉시 표시', document.getElementById('tvSimSpeedVal').textContent === '500ms');

  // 10. 드래그 모사 — fake scene 으로 stage_position 만 갱신, ARV 미수정 검증
  const fakeARV = { attribution: { self: 0.5, fate: 0.3 }, core_fear: { abandonment: 0.4, loss: 0.2 } };
  const fake = { id: 'fake-sm15', scene_order: 0, originalReasonVector: fakeARV, meta: { scene_code: 'XS' } };
  sv.setScenes([fake]);
  const beforeStr = JSON.stringify(fake.originalReasonVector);
  fake.meta.stage_position = { x: 8, z: -3 };
  sv.setScenes([fake]);
  const afterStr = JSON.stringify(fake.originalReasonVector);
  ok('stage_position 갱신이 ARV 미수정', beforeStr === afterStr);

  // 11. 콘솔 출력
  function _print() {
    console.log('\n=== 작업 15 콘솔 smoke ===');
    checks.forEach(([p, n, d]) => console.log(`${p} ${n}${d ? ' — ' + d : ''}`));
    const fail = checks.filter(c => c[0] === '❌').length;
    console.log(`\n${checks.length - fail}/${checks.length} PASS`);
  }
  _print();
})();

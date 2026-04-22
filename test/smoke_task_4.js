// 작업 4 잔상 텍스트 sprite smoke test
// 사용법:
//   1. play-test.html?memory=<ID>&lang=ko 진입 → FP 모드 활성
//   2. Admin 에서 해당 메모리에 ghost_condensation_points ≥ 1 배치되어 있어야 의미 있음
//      (없으면 harness 가 fake points 주입으로 대체 검증)
//   3. DevTools Console 붙여넣기

(async () => {
  const rt  = window.TemAfStrataTerrain && window.TemAfStrataTerrain._lastRuntime;
  const sg  = rt && rt.__lumenSceneGhosts;
  if (!rt) { console.error('[4-smoke] runtime 없음'); return; }
  if (!sg) { console.error('[4-smoke] LumenSceneGhosts 미attach. FP 진입 후 실행'); return; }
  if (!rt.isFirstPerson || !rt.isFirstPerson()) {
    console.error('[4-smoke] FP 모드 아님');
    return;
  }

  const scene = rt.getScene();
  const cam   = rt.getCamera();
  if (!scene || !cam) { console.error('[4-smoke] scene/camera 없음'); return; }

  const wait2frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const countGhostSprites = () => {
    let n = 0;
    scene.traverse(o => { if (o && o.userData && o.userData._lumenSceneGhost) n++; });
    return n;
  };
  const opacityAt = (idx) => {
    let found = null, i = 0;
    scene.traverse(o => {
      if (o && o.userData && o.userData._lumenSceneGhost) { if (i === idx) found = o; i++; }
    });
    return found && found.material ? found.material.opacity : null;
  };

  const checks = [];

  // 0. Infra
  checks.push(['api reachable',            !!sg && typeof sg.rebuild === 'function']);
  checks.push(['getDebug returns object',  typeof sg.getDebug().sprites === 'number']);

  // 1. Harness — 고정 좌표 3개 + 단어 풀 고정. 원래 provider 는 closure 라 복원이 안 되므로 테스트 끝에서 실 build 복구.
  const FAKE_POINTS = [
    { x: -20, z: -20, pollution_threshold: 0 },
    { x:  10, z:   5, pollution_threshold: 0 },
    { x:   0, z:  25, pollution_threshold: 0 }
  ];
  const FAKE_WORDS = ['잔상', '숨결', '흔적'];
  let fakeSeen = new Set();

  sg.setOptions({
    getGhostPoints:  () => FAKE_POINTS,
    getEchoWords:    () => FAKE_WORDS,
    isSeenIndex:     (i) => fakeSeen.has(i),
    proximityNear:   3,
    proximityFar:    40
  });
  const built = sg.rebuild();
  checks.push(['rebuild returns 3',        built === 3]);
  await wait2frames();
  checks.push(['scene has 3 ghost sprites', countGhostSprites() === 3]);

  // 2. Proximity opacity — 카메라 teleport 은 _fpTick 이 매 frame 덮어써서 먹히지 않음.
  //    대신 "현재 카메라 위치"에서 각 sprite 까지의 거리를 기준으로 formula 대비 실측 opacity 가 일치하는지 검증.
  await wait2frames();
  const curOpts = sg.getOptions();
  const camX = cam.position.x, camZ = cam.position.z;
  const pRange = Math.max(0.01, curOpts.proximityFar - curOpts.proximityNear);
  function expectedOpacity(idx) {
    const p = FAKE_POINTS[idx];
    const d = Math.hypot(p.x - camX, p.z - camZ);
    const tProx = 1 - Math.min(1, Math.max(0, (d - curOpts.proximityNear) / pRange));
    return curOpts.baseOpacity + (curOpts.nearOpacity - curOpts.baseOpacity) * tProx;
  }
  const dists = FAKE_POINTS.map(p => Math.hypot(p.x - camX, p.z - camZ));
  const actualOps = [0, 1, 2].map(opacityAt);
  for (let i = 0; i < 3; i++) {
    const exp = expectedOpacity(i);
    checks.push([
      `sprite[${i}] opacity matches formula (d=${dists[i].toFixed(1)} exp=${exp.toFixed(3)} got=${actualOps[i].toFixed(3)})`,
      Math.abs(actualOps[i] - exp) < 0.02
    ]);
  }
  // 거리 정렬 → 가까운 sprite 가 더 진해야
  const order = [0, 1, 2].slice().sort((a, b) => dists[a] - dists[b]);
  const nearIdx = order[0], farIdx = order[2];
  if (Math.abs(dists[nearIdx] - dists[farIdx]) > 1) {
    checks.push([
      `nearest[${nearIdx}] opacity ≥ farthest[${farIdx}]`,
      actualOps[nearIdx] >= actualOps[farIdx] - 1e-6
    ]);
  }

  // 3. Seen boost — 가장 먼 sprite 를 seen 으로 마크 → opacity 상승 확인
  const op_far_before = opacityAt(farIdx);
  fakeSeen = new Set([farIdx]);
  sg.setOptions({ isSeenIndex: (i) => fakeSeen.has(i) });
  await wait2frames();
  const op_far_after = opacityAt(farIdx);
  checks.push([
    `seen boost on farthest[${farIdx}] raises opacity by ≈ seenBoost`,
    Math.abs((op_far_after - op_far_before) - curOpts.seenBoost) < 0.02 ||
    op_far_after > op_far_before + 0.1  // cap 걸렸을 수 있음
  ]);

  // 4. Clear
  sg.clear();
  checks.push(['clear drops all sprites',              countGhostSprites() === 0]);

  // 5. Rebuild 재작동
  const built2 = sg.rebuild();
  checks.push(['rebuild after clear ≥ 3',              built2 === 3]);

  // 보고
  let pass = 0, fail = 0;
  for (const [name, ok] of checks) {
    if (ok) { pass++; console.log('%c✔', 'color:#8a8', name); }
    else    { fail++; console.log('%c✘', 'color:#c66', name); }
  }
  console.log(`[4-smoke] ${pass}/${pass + fail} PASS`);
  console.log('[4-smoke] NOTE: provider 원복은 페이지 새로고침 필요 (closure 라 outside 에서 복구 불가).');
})();

// 작업 2-A 후반 (rewind 재생) smoke test
// 사용법:
//   1. play-test.html?memory=<ID>&lang=ko 로 진입 (Lumen 흐름)
//   2. FP 진입 후 WASD로 약간 걸어서 trajectory 쌓기 (≥ 5초 권장)
//   3. DevTools Console에 본 파일 붙여넣기
// 목적: rewind 모듈이 어댑터 API(getTrajectory + on('enterVoid'))만으로 정상 동작하는지,
//   forceStart로 시작·보간·입력 잠금·종료까지 한 사이클 검증.

(async () => {
  const rt = window.TemAfStrataTerrain && window.TemAfStrataTerrain._lastRuntime;
  const adapter = rt && rt.__lumenAdapter;
  const rw = rt && rt.__lumenRewind;

  if (!rt) { console.error('[2a-smoke] runtime 없음'); return; }
  if (!adapter) { console.error('[2a-smoke] LumenTerrainAdapter 미attach'); return; }
  if (!rw) { console.error('[2a-smoke] LumenRewindPlayback 미attach'); return; }
  if (!rt.isFirstPerson || !rt.isFirstPerson()) {
    console.error('[2a-smoke] FP 모드 아님. 먼저 1인칭 진입 후 WASD로 5초 이상 이동');
    return;
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const frames = n => new Promise(r => {
    let i = 0;
    const step = () => { if (++i >= n) r(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });

  const checks = [];
  const cam = rt.getCamera();

  // 0. API 표면
  checks.push(['adapter.getTrajectory 존재',          typeof adapter.getTrajectory === 'function']);
  checks.push(['rw.on / forceStart / forceStop 존재', typeof rw.on === 'function'
    && typeof rw.forceStart === 'function' && typeof rw.forceStop === 'function']);
  checks.push(['rw.isRewinding 초기 false',           rw.isRewinding() === false]);

  // 1. trajectory 충분
  const traj = adapter.getTrajectory();
  checks.push(['trajectory length ≥ 10 (사용자 이동 충분)', traj.length >= 10]);
  if (traj.length < 10) {
    console.warn('[2a-smoke] trajectory 가 짧음. WASD로 더 걸은 후 재실행 권장.');
  }

  // 2. 보간 정확성 (보간 유틸 직접 검증 불가 → forceStart 직후 cam pose 가 trajectory 끝점 근방인지)
  const lastPt = traj[traj.length - 1];
  const startCamX = cam.position.x;
  const startCamZ = cam.position.z;

  // rewindStart / rewindEnd 이벤트 캡처
  let evStart = null, evEnd = null;
  const offS = rw.on('rewindStart', p => { evStart = p; });
  const offE = rw.on('rewindEnd',   p => { evEnd = p; });

  // 3. forceStart
  // (입력 잠금이 활성화되면 page key event 가 막혀 사용자 입력은 안먹힘. 자동 테스트만 진행)
  // playbackSpeed 를 일시적으로 8x로 올려 빠르게 진행
  rw.setOptions({ playbackSpeed: 8.0, triggerOnce: false });
  const started = rw.forceStart();
  checks.push(['forceStart() returned true',          started === true]);
  checks.push(['rewindStart event fired',             evStart !== null]);
  checks.push(['rewinding 활성',                       rw.isRewinding() === true]);
  checks.push(['rewindStart payload trajectoryLength', evStart && evStart.trajectoryLength === traj.length]);

  // 4. 첫 프레임 후 cam pose 가 trajectory 끝점 근방으로 이동했는지
  await frames(2);
  const dx0 = Math.abs(cam.position.x - lastPt.x);
  const dz0 = Math.abs(cam.position.z - lastPt.z);
  // 보간 시작 직후 (elapsed≈30ms × speed8 = 240ms back) — 마지막 점에서 약간만 떨어짐
  // walk_effects 가 sub-cm offset 가미하므로 1.0 유닛 이내면 OK
  checks.push(['rewind 직후 cam ≈ trajectory 끝점',     dx0 < 1.0 && dz0 < 1.0]);

  // 5. 입력 잠금 — 합성 keydown 이벤트가 차단되는지 (capture 단계 stopPropagation 검증)
  let bubbledKey = false;
  const bubbleListener = e => { if (e.code === 'KeyW') bubbledKey = true; };
  document.addEventListener('keydown', bubbleListener, false); // bubble phase
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  document.removeEventListener('keydown', bubbleListener, false);
  checks.push(['rewind 중 keydown bubble 차단',         bubbledKey === false]);

  // 6. rewind 자연 종료 대기 (speed 8x 기준 ~1초 안에 끝남)
  const totalMs = (lastPt.t - traj[0].t);
  const expectedRewindMs = totalMs / 8.0;
  await wait(Math.min(5000, expectedRewindMs + 500));
  checks.push(['rewindEnd event fired',                evEnd !== null]);
  checks.push(['rewindEnd reason = reached_start',     evEnd && evEnd.reason === 'reached_start']);
  checks.push(['rewinding 종료',                        rw.isRewinding() === false]);

  // 7. cam 이 trajectory 시작점 근방으로 도달
  const firstPt = traj[0];
  const dxN = Math.abs(cam.position.x - firstPt.x);
  const dzN = Math.abs(cam.position.z - firstPt.z);
  checks.push(['종료 후 cam ≈ trajectory 시작점',       dxN < 1.0 && dzN < 1.0]);

  // 8. 종료 후 keydown 정상 통과
  let bubbledKey2 = false;
  const bubbleListener2 = e => { if (e.code === 'KeyW') bubbledKey2 = true; };
  document.addEventListener('keydown', bubbleListener2, false);
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  document.removeEventListener('keydown', bubbleListener2, false);
  checks.push(['rewind 종료 후 keydown 통과',           bubbledKey2 === true]);

  // 정리
  offS(); offE();
  rw.setOptions({ playbackSpeed: 1.0, triggerOnce: true });

  // 리포트
  const rows = checks.map(([name, pass]) => ({ check: name, pass: pass ? '✅' : '❌' }));
  console.table(rows);
  const failed = checks.filter(([, p]) => !p);
  if (failed.length === 0) {
    console.log('%c[2a-smoke] ALL ' + checks.length + ' PASS — rewind 재생 OK',
      'color:#4caf50;font-weight:bold');
  } else {
    console.error('[2a-smoke] ' + failed.length + '개 FAIL', failed.map(([n]) => n));
  }

  console.log('[2a-smoke] (수동 확인) void(중심 5.6 유닛) 진입 → 자동으로 rewind 시작, ' +
    'WASD/마우스 잠긴 채 진입구 방향으로 카메라 자동 이동해야 함.');
})();

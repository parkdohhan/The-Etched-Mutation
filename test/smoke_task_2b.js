// 작업 2-B 귀환 모드 smoke test
// 사용법:
//   1. play-test.html?memory=<ID>&lang=ko 진입 → FP 모드 활성 (scene_ghosts·rewind·returnMode attach)
//   2. 대기 — adapter 가 sampleMs 150ms 간격으로 궤적 push. rewind 재생을 위해 최소 2점 필요.
//      (본 smoke 는 내부 1.2s wait 로 자동 확보)
//   3. DevTools Console 붙여넣기
//
// 검증 요약:
//   - API 표면, rewind playbackSpeed 1.5 선주입, 귀환 모드 색감·속도·유령 자세 3종 동시 전환,
//     종료 후 모두 원복, isReturning 토글, 정리 후 입력 잠금 해제.

(async () => {
  const rt = window.TemAfStrataTerrain && window.TemAfStrataTerrain._lastRuntime;
  if (!rt) { console.error('[2b-smoke] runtime 없음'); return; }

  const rw  = rt.__lumenRewind;
  const rm  = rt.__lumenReturnMode;
  const sg  = rt.__lumenSceneGhosts;
  if (!rw) { console.error('[2b-smoke] rt.__lumenRewind 없음 — rewind_playback attach 안됨'); return; }
  if (!rm) { console.error('[2b-smoke] rt.__lumenReturnMode 없음 — return_mode attach 안됨'); return; }
  if (!sg) { console.error('[2b-smoke] rt.__lumenSceneGhosts 없음 — scene_ghosts attach 안됨'); return; }
  if (!rt.isFirstPerson || !rt.isFirstPerson()) {
    console.error('[2b-smoke] FP 모드 아님 — ?memory= 로 진입 후 실행');
    return;
  }

  const canvas = document.getElementById('strataCanvas');
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const checks = [];

  // ── 0. API 표면 ─────────────────────────────────────
  checks.push(['returnMode API: isReturning',  typeof rm.isReturning === 'function']);
  checks.push(['returnMode API: forceEnter',   typeof rm.forceEnter === 'function']);
  checks.push(['returnMode API: forceExit',    typeof rm.forceExit === 'function']);
  checks.push(['returnMode API: getOptions',   typeof rm.getOptions === 'function']);
  checks.push(['returnMode API: setOptions',   typeof rm.setOptions === 'function']);

  // ── 1. 선주입 검증 — attach 시점에 rewind.playbackSpeed 1.5 로 교체 ──
  const rwOpts = rw.getOptions ? rw.getOptions() : {};
  checks.push([
    `rewind.playbackSpeed pre-set to 1.5 (got ${rwOpts.playbackSpeed})`,
    Math.abs((rwOpts.playbackSpeed || 0) - 1.5) < 1e-6
  ]);

  // ── 2. 초기 상태 — 귀환 모드 아님, canvas filter 없음(or 빈값), ghost 기본 colorCss 유지 ──
  checks.push(['initial !isReturning',          rm.isReturning() === false]);
  checks.push([
    `canvas filter initially empty or none (got "${canvas ? canvas.style.filter : '(no canvas)'}")`,
    !canvas || !canvas.style.filter || canvas.style.filter === 'none'
  ]);
  const sgOptsBefore = sg.getOptions ? sg.getOptions() : {};
  const baselineColor   = sgOptsBefore.colorCss;
  const baselineBobFreq = sgOptsBefore.bobFreq;
  const baselineBobAmp  = sgOptsBefore.bobAmp;

  // ── 3. 궤적 축적 후 rewind 시작 ─────────────────────
  // adapter sampleMs=150 → 1.2s 면 약 8점 확보 (minTrajectoryPoints=2 여유).
  await wait(1200);
  const started = rw.forceStart();
  checks.push(['rewind.forceStart() returns true', started === true]);

  // rewindStart listener → returnMode._enter 동기 실행 (await 불필요하지만 필터 transition 반영 위해 약간 대기)
  await wait(50);

  // ── 4. 귀환 모드 3종 신호 동시 전환 ─────────────────
  checks.push(['isReturning === true after start', rm.isReturning() === true]);

  // 신호 1: canvas filter
  const filterNow = canvas ? canvas.style.filter : '';
  checks.push([
    `signal 1 — canvas filter contains hue-rotate (got "${filterNow}")`,
    !!filterNow && filterNow.indexOf('hue-rotate') >= 0
  ]);

  // 신호 2: rewind playbackSpeed 1.5 — 이미 attach 시 선주입됐지만 귀환 중에도 유지되는지 확인
  const rwOpts2 = rw.getOptions ? rw.getOptions() : {};
  checks.push([
    `signal 2 — rewind.playbackSpeed remains 1.5 during return (got ${rwOpts2.playbackSpeed})`,
    Math.abs((rwOpts2.playbackSpeed || 0) - 1.5) < 1e-6
  ]);

  // 신호 3: scene_ghosts 옵션 3종 전환
  const sgOptsDuring = sg.getOptions ? sg.getOptions() : {};
  checks.push([
    `signal 3a — ghost colorCss changed (before="${baselineColor}" after="${sgOptsDuring.colorCss}")`,
    sgOptsDuring.colorCss && sgOptsDuring.colorCss !== baselineColor
  ]);
  checks.push([
    `signal 3b — ghost bobFreq increased (${baselineBobFreq} → ${sgOptsDuring.bobFreq})`,
    sgOptsDuring.bobFreq > baselineBobFreq + 1e-6
  ]);
  checks.push([
    `signal 3c — ghost bobAmp increased (${baselineBobAmp} → ${sgOptsDuring.bobAmp})`,
    sgOptsDuring.bobAmp > baselineBobAmp + 1e-6
  ]);

  // 신호 3d — sprite material.rotation 기울어짐 (존재 시)
  const scene = rt.getScene && rt.getScene();
  let rotatedCount = 0, totalGhostSprites = 0;
  if (scene) {
    scene.traverse(o => {
      if (o && o.userData && o.userData._lumenSceneGhost) {
        totalGhostSprites++;
        if (o.material && typeof o.material.rotation === 'number' && Math.abs(o.material.rotation) > 1e-4) rotatedCount++;
      }
    });
  }
  checks.push([
    `signal 3d — sprite material.rotation tilted on all (${rotatedCount}/${totalGhostSprites})`,
    totalGhostSprites > 0 && rotatedCount === totalGhostSprites
  ]);

  // ── 5. 정상 종료 — forceStop → rewindEnd emit → _exit ──
  rw.forceStop();
  await wait(50);
  checks.push(['isReturning === false after stop', rm.isReturning() === false]);

  const filterAfter = canvas ? canvas.style.filter : '';
  checks.push([
    `canvas filter cleared after stop (got "${filterAfter}")`,
    !filterAfter || filterAfter === 'none' || filterAfter === ''
  ]);

  const sgOptsAfter = sg.getOptions ? sg.getOptions() : {};
  checks.push([
    `ghost colorCss restored (got "${sgOptsAfter.colorCss}")`,
    sgOptsAfter.colorCss === baselineColor
  ]);
  checks.push([
    `ghost bobFreq restored (got ${sgOptsAfter.bobFreq})`,
    Math.abs(sgOptsAfter.bobFreq - baselineBobFreq) < 1e-6
  ]);
  checks.push([
    `ghost bobAmp restored (got ${sgOptsAfter.bobAmp})`,
    Math.abs(sgOptsAfter.bobAmp - baselineBobAmp) < 1e-6
  ]);

  let rotatedAfter = 0, total2 = 0;
  if (scene) {
    scene.traverse(o => {
      if (o && o.userData && o.userData._lumenSceneGhost) {
        total2++;
        if (o.material && Math.abs(o.material.rotation) > 1e-4) rotatedAfter++;
      }
    });
  }
  checks.push([
    `sprite rotation cleared after stop (${rotatedAfter}/${total2} still tilted)`,
    total2 === 0 || rotatedAfter === 0
  ]);

  // ── 6. 입력 잠금 해제 확인 — keydown 이 _fpKeys 에 다시 쓰임 ──
  // _fpKeys 는 내부 closure 라 직접 접근 불가. 카메라 위치가 바뀌는지로 간접 확인.
  // 종료 직후 W 1회 눌러보고 300ms 내 이동 감지.
  const cam = rt.getCamera();
  const p0 = { x: cam.position.x, z: cam.position.z };
  const kdown = new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true });
  const kup   = new KeyboardEvent('keyup',   { code: 'KeyW', key: 'w', bubbles: true });
  document.dispatchEvent(kdown);
  await wait(350);
  document.dispatchEvent(kup);
  const dx = cam.position.x - p0.x, dz = cam.position.z - p0.z;
  const moved = Math.hypot(dx, dz);
  checks.push([
    `post-stop input pass-through — W 350ms moved cam (${moved.toFixed(3)}m)`,
    moved > 0.1
  ]);

  // ── 7. 토글 재진입 검증 — forceStart → forceStop 다시 ──
  // triggerOnce 기본 true 라 두 번째 forceStart 는 실패. 이게 예상 동작인지 확인.
  const started2 = rw.forceStart();
  checks.push([
    'triggerOnce gating: 2nd forceStart returns false (expected by 2-A spec)',
    started2 === false
  ]);
  // triggerOnce 로 막혀도 returnMode 자체는 forceEnter 로 진입 가능해야 함 (수동 테스트용)
  rm.forceEnter();
  checks.push(['returnMode.forceEnter works when rewind gated', rm.isReturning() === true]);
  rm.forceExit();
  checks.push(['returnMode.forceExit works', rm.isReturning() === false]);

  // ── 보고 ─────────────────────────────────────────────
  let pass = 0, fail = 0;
  for (const [name, ok] of checks) {
    if (ok) { pass++; console.log('%c✔', 'color:#8a8', name); }
    else    { fail++; console.log('%c✘', 'color:#c66', name); }
  }
  console.log(`[2b-smoke] ${pass}/${pass + fail} PASS`);
  console.log('[2b-smoke] NOTE: triggerOnce 기본이 true 라 rewind 재시작은 페이지 새로고침 필요.');
})();

// 작업 3b 시각 연출 smoke test
// 사용법:
//   1. play-test.html?memory=<ID>&lang=ko (Lumen 흐름) 또는 아카이브에서 메모리 진입
//   2. FP 진입 (WASD 가능한 1인칭 모드 — 문 통과 or 캔버스 클릭)
//   3. DevTools Console 붙여넣기
// 목적: Fog density · Vignette opacity 가 contamination depth 에 비례해서 움직이고 cap 되는지,
//   FP 종료 시 fog 원복·vignette 0 으로 가는지, DOM/scene 레퍼런스가 살아있는지 검증.

(async () => {
  const rt = window.TemAfStrataTerrain && window.TemAfStrataTerrain._lastRuntime;
  const vfx = rt && rt.__lumenVisualFx;
  if (!rt) { console.error('[3b-smoke] TemAfStrataTerrain runtime 없음'); return; }
  if (!vfx) { console.error('[3b-smoke] LumenVisualEffects 미attach. FP 진입 후 실행'); return; }
  if (!rt.isFirstPerson || !rt.isFirstPerson()) {
    console.error('[3b-smoke] FP 모드가 아님. 먼저 1인칭 진입 필요');
    return;
  }

  const scene = rt.getScene();
  const vignetteEl = document.getElementById('lumenVignette');
  const origOpts = vfx.getOptions();

  // Harness: contamination provider 를 fake 로 swap. 테스트 후 원복.
  let fakeDepth = 0;
  vfx.setOptions({ contaminationDepthProvider: () => fakeDepth });

  const wait2frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const vigOpa = () => parseFloat((vignetteEl && vignetteEl.style.opacity) || '0');
  const fogDen = () => (scene.fog && scene.fog.density) || 0;

  const checks = [];

  // 0. 인프라
  checks.push(['scene.fog exists',                  !!scene.fog]);
  checks.push(['vignette DOM element present',      !!vignetteEl && !!vignetteEl.parentNode]);
  checks.push(['LumenVisualEffects api reachable',  !!vfx && typeof vfx.setOptions === 'function']);

  // 1. depth=0 기본치
  fakeDepth = 0;
  await wait2frames();
  const fog0 = fogDen(), vig0 = vigOpa();
  checks.push(['depth=0 · fog ≈ base',              Math.abs(fog0 - origOpts.fogBaseDensity) < 1e-6]);
  checks.push(['depth=0 · vignette ≈ base',         Math.abs(vig0 - origOpts.vignetteBaseOpacity) < 0.005]);

  // 2. depth=3 (중간) 단조 증가
  fakeDepth = 3;
  await wait2frames();
  const fog3 = fogDen(), vig3 = vigOpa();
  checks.push(['depth=3 · fog > base',              fog3 > fog0 + 1e-6]);
  checks.push(['depth=3 · vignette > base',         vig3 > vig0 + 1e-3]);

  // 3. depth 매우 큼 → cap
  fakeDepth = 9999;
  await wait2frames();
  const fogMax = fogDen(), vigMax = vigOpa();
  const expectedFogMax = origOpts.fogBaseDensity * origOpts.fogDepthCap;
  checks.push(['fog capped at base × cap',          Math.abs(fogMax - expectedFogMax) < 1e-6]);
  checks.push(['vignette capped at maxOpacity',     Math.abs(vigMax - origOpts.vignetteMaxOpacity) < 1e-3]);

  // 4. 복원
  vfx.setOptions({ contaminationDepthProvider: origOpts.contaminationDepthProvider });

  // 5. 리포트
  const rows = checks.map(([name, pass]) => ({ check: name, pass: pass ? '✅' : '❌' }));
  console.table(rows);
  const failed = checks.filter(([, p]) => !p);
  if (failed.length === 0) {
    console.log('%c[3b-smoke] ALL ' + checks.length + ' PASS — 3b 시각 연출 OK',
      'color:#4caf50;font-weight:bold');
  } else {
    console.error('[3b-smoke] ' + failed.length + '개 FAIL', failed.map(([n]) => n));
  }

  // 6. (참고) FP 종료 시 원복 체크 — 자동으론 못 함. 수동 확인 가이드 출력.
  console.log('[3b-smoke] (수동 확인) ESC로 FP 종료 → ' +
    'vignette opacity=0, fog density=' + origOpts.fogBaseDensity.toFixed(4) + ' 으로 복귀해야 함.');
})();

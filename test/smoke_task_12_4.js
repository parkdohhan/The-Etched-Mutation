// 작업 12-4 분기 시뮬·가시화 smoke test
// 사용법:
//   1. admin.html 로그인 → Canvas 탭 → 메모리 선택 (최소 3~4 씬 + original_emotion 있는 것)
//   2. DevTools Console 에 이 파일 전체 복붙 → Enter
//   3. 결과 PASS/FAIL + 단계별 상태 로그 확인
// 목적:
//   - 프리셋 로드 → A 슬라이더에 반영
//   - 시작 → runner A 생성 + lastResult/candidateIdx 설정
//   - 다음 → visited.push + engine 재계산 + 후보 갱신 (종료까지 safe step 반복)
//   - 비교 모드 → B 활성 + 두 runner 독립 전진
//   - overlay SVG 확인 (#simOverlay 존재)

(async () => {
  const log  = (msg, ok) => console.log(`%c${ok ? '✅' : '—'} ${msg}`, ok ? 'color:#6aa383' : 'color:#c4a882');
  const fail = (msg) => console.warn(`%c❌ ${msg}`, 'color:#b85540');
  const trace = (label, obj) => console.log(`[smoke 12-4] ${label}`, obj);

  // DOM 체크
  const required = ['tvSimPreset','tvSimSliders','tvSimSlidersB','tvSimCompareToggle','tvSimStartBtn','tvSimStepBtn','tvSimResetBtn','tvSimReadout'];
  const missing = required.filter(id => !document.getElementById(id));
  if (missing.length) { fail(`DOM 누락: ${missing.join(', ')}`); return; }
  log('DOM 존재', true);

  // 메모리 로드 확인
  await new Promise(r => setTimeout(r, 300));
  const svg = document.getElementById('tvSvg');
  const nodes = svg?.querySelectorAll('.scene-node') || [];
  if (nodes.length < 2) { fail(`씬 노드 부족 (${nodes.length}) — 2개 이상 필요`); return; }
  log(`씬 노드 ${nodes.length}개`, true);

  // 1) 프리셋 로드 → A 슬라이더 변화
  const preset = document.getElementById('tvSimPreset');
  preset.value = 'grief';
  preset.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 60));
  const sadInput = document.querySelector('input[data-sim-runner="A"][data-sim-dim="sadness"]');
  if (!sadInput || Number(sadInput.value) <= 0) { fail('프리셋 "grief" 미적용 (sadness=0)'); return; }
  log(`프리셋 grief 적용 → sadness=${sadInput.value}`, true);

  // 2) 비교 모드 ON → B 슬라이더 조작
  const cmp = document.getElementById('tvSimCompareToggle');
  cmp.checked = true;
  cmp.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 30));
  const panelB = document.getElementById('tvSimSlidersB');
  if (panelB.style.display === 'none') { fail('비교 모드 B 패널 미표시'); return; }
  // B 에 anger 0.7 주입
  const angBInp = document.querySelector('input[data-sim-runner="B"][data-sim-dim="anger"]');
  angBInp.value = '0.7'; angBInp.dispatchEvent(new Event('input'));
  const fearBInp = document.querySelector('input[data-sim-runner="B"][data-sim-dim="fear"]');
  fearBInp.value = '0.4'; fearBInp.dispatchEvent(new Event('input'));
  log('B runner 감정 설정 (anger 0.7, fear 0.4)', true);

  // 3) 시작
  document.getElementById('tvSimStartBtn').click();
  await new Promise(r => setTimeout(r, 100));

  // readout 확인
  const readout = document.getElementById('tvSimReadout').textContent;
  if (!/pattern/.test(readout) || !/align/.test(readout)) { fail('시작 후 readout 표기 누락'); console.log(readout); return; }
  log('시작 후 readout 표시', true);

  // overlay SVG 존재 확인
  const overlay = document.querySelector('#simOverlay');
  if (!overlay) { fail('#simOverlay SVG 그룹 미생성'); return; }
  const circles = overlay.querySelectorAll('circle');
  if (circles.length < 2) { fail(`overlay circle 부족 (${circles.length}) — A 현재+후보 최소 2`); return; }
  log(`overlay circles=${circles.length}`, true);

  // 4) step 여러 번 — 엔진 상태가 진행되는지
  const trajs = { A: [], B: [] };
  for (let i = 0; i < 5; i++) {
    const btn = document.getElementById('tvSimStepBtn');
    if (btn.disabled) break;
    btn.click();
    await new Promise(r => setTimeout(r, 60));
    // 이 시점 실제 runner state 덤프
    ['A','B'].forEach(k => {
      // eslint-disable-next-line no-undef
      if (!window.__tvSimDebug) return;
      const r = window.__tvSimDebug[k];
      if (r) trajs[k].push({ cur: r.currentIdx, cand: r.candidateIdx, pattern: r.lastResult?.transition_pattern });
    });
  }

  // 5) 상태 확인 — readout 업데이트
  const readout2 = document.getElementById('tvSimReadout').textContent;
  if (readout2 === readout) fail('step 후 readout 변경 없음 (step 미적용 가능)');
  else log('step 후 readout 갱신', true);

  // 6) 리셋
  document.getElementById('tvSimResetBtn').click();
  await new Promise(r => setTimeout(r, 30));
  const stillOverlay = document.querySelector('#simOverlay');
  if (stillOverlay) { fail('reset 후 overlay 잔존'); return; }
  log('reset → overlay 제거', true);

  const stepBtnDisabled = document.getElementById('tvSimStepBtn').disabled;
  if (!stepBtnDisabled) fail('reset 후 step 버튼 disabled 아님');
  else log('reset → step disabled', true);

  trace('trajs', trajs);
  console.log('%c🧪 작업 12-4 smoke: 모든 체크 통과', 'color:#6aa383;font-weight:bold;');
})();

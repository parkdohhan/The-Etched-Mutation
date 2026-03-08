// js/demo/demoReveal.js
// 데모 리빌: 스텝별 노출/애니메이션, demoFlow와 연동

const revealState = {
  revealedSteps: new Set([0]),
};

/**
 * 스텝 인덱스에 맞춰 리빌 영역 갱신 (demoFlow에서 호출 가능)
 * @param {number} stepIndex
 */
function demoRevealStep(stepIndex) {
  revealState.revealedSteps.add(stepIndex);
  const el = document.getElementById('demoReveal');
  if (!el) return;
  el.setAttribute('aria-hidden', 'false');
  el.classList.add('revealed');
}

/**
 * 데모 리빌 영역에 텍스트/엘리먼트 표시
 * @param {string} htmlOrText
 */
function setRevealContent(htmlOrText) {
  const el = document.getElementById('demoReveal');
  if (!el) return;
  if (htmlOrText.startsWith('<')) {
    el.innerHTML = htmlOrText;
  } else {
    el.textContent = htmlOrText;
  }
}

/**
 * 리빌 영역 초기화
 */
function clearReveal() {
  const el = document.getElementById('demoReveal');
  if (el) {
    el.innerHTML = '';
    el.setAttribute('aria-hidden', 'true');
    el.classList.remove('revealed');
  }
  revealState.revealedSteps.clear();
  revealState.revealedSteps.add(0);
}

// demoFlow에서 호출할 수 있도록 전역 노출
window.demoRevealStep = demoRevealStep;
window.setRevealContent = setRevealContent;
window.clearReveal = clearReveal;

export { demoRevealStep, setRevealContent, clearReveal, revealState };

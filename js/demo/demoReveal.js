// js/demo/demoReveal.js
// 데모 리빌: 스텝별 노출/애니메 션, demoFlow 연동

const revealState = {
  revealedSteps: new Set([0]),
};

/**
 * 스텝 index 맞춰 리빌 영역 갱신 (demoFlow 서 call possible)
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
 * 데모 리빌 영역 text/엘리먼트 display
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
 * 리빌 영역 init
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

// demoFlow 서 call 수 있 록 global 노출
window.demoRevealStep = demoRevealStep;
window.setRevealContent = setRevealContent;
window.clearReveal = clearReveal;

export { demoRevealStep, setRevealContent, clearReveal, revealState };

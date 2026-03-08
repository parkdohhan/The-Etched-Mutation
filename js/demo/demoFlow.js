// js/demo/demoFlow.js
// 데모 플로우: 단계 진행, 마지막 CTA에서 index.html(confession)으로 연결
// ByeoriEngine은 수정 없이 재사용 (필요 시 정렬도 데모용)

import { ByeoriEngine } from '../core/ByeoriEngine.js';

const DEMO_STEPS = [
  {
    id: 'intro',
    content: '같은 기억이라도, 되짚어보면 다르게 느껴질 수 있습니다.',
    nextLabel: '다음',
  },
  {
    id: 'align',
    content: '감정과 이유, 태도가 맞아떨어질 때 기억은 한 층 더 선명해집니다.',
    nextLabel: '다음',
  },
  {
    id: 'cta',
    content: '당신의 기억을 기록해 보세요.',
    nextLabel: null,
  },
];

const demoState = {
  currentStep: 0,
  engine: new ByeoriEngine(),
};

const selectors = {
  root: '#demoRoot',
  container: '#demoContainer',
  stepInner: '#demoStepInner0',
  ctaWrap: '#demoCtaWrap',
  cta: '#demoCta',
};

function getEl(id) {
  const el = document.querySelector(selectors[id] || id);
  if (!el) console.warn('[demoFlow] element not found:', id);
  return el;
}

function renderStep() {
  const step = DEMO_STEPS[demoState.currentStep];
  if (!step) return;

  const inner = getEl('stepInner');
  const ctaWrap = getEl('ctaWrap');
  if (!inner) return;

  inner.textContent = step.content;
  inner.setAttribute('data-step-id', step.id);

  if (step.id === 'cta') {
    if (ctaWrap) {
      ctaWrap.classList.remove('hidden');
      ctaWrap.setAttribute('aria-hidden', 'false');
    }
  } else {
    if (ctaWrap) {
      ctaWrap.classList.add('hidden');
      ctaWrap.setAttribute('aria-hidden', 'true');
    }
  }
}

function goNext() {
  if (demoState.currentStep >= DEMO_STEPS.length - 1) return;
  demoState.currentStep += 1;
  renderStep();
  if (typeof window.demoRevealStep === 'function') {
    window.demoRevealStep(demoState.currentStep);
  }
}

function runDemoAlignment() {
  const userVector = {
    base: { joy: 0.6, sadness: 0.2, fear: 0.1 },
    reason_analysis: { attribution: 'self', target: 'self' },
  };
  const originalVector = {
    base: { joy: 0.5, sadness: 0.3, fear: 0.1 },
    reason_analysis: { attribution: 'self', target: 'self' },
  };
  try {
    return demoState.engine.calculateStep(
      { userVector, originalVector },
      { previousBucket: null }
    );
  } catch (e) {
    console.warn('[demoFlow] runDemoAlignment:', e);
    return null;
  }
}

function init() {
  renderStep();

  const inner = getEl('stepInner');
  if (inner) {
    inner.addEventListener('click', () => {
      const step = DEMO_STEPS[demoState.currentStep];
      if (step && step.id !== 'cta') goNext();
    });
  }

  const cta = getEl('cta');
  if (cta) {
    cta.setAttribute('href', 'index.html');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { demoState, DEMO_STEPS, goNext, renderStep, runDemoAlignment };

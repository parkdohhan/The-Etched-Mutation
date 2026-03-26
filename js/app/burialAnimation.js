/**
 * burialAnimation.js — 장면 확인 (Phase B-C) + 매장 연출 (Phase D)
 */

// strataSection의 EMOTION_COLORS와 동일
const EMOTION_COLORS = {
  fear: [100, 80, 180], sadness: [80, 100, 160], anger: [200, 80, 80],
  joy: [200, 180, 100], longing: [80, 180, 180], guilt: [150, 130, 100],
  shame: [160, 100, 130], numbness: [90, 90, 110], isolation: [70, 90, 130],
};

function emotionVectorToRGB(ev) {
  if (!ev || typeof ev !== 'object') return [120, 120, 140];
  const base = ev.base || ev;
  const entries = Object.entries(base).filter(([, v]) => v != null && v > 0);
  if (entries.length === 0) return [120, 120, 140];
  const dom = entries.reduce((a, b) => b[1] > a[1] ? b : a);
  return EMOTION_COLORS[dom[0]] || [120, 120, 140];
}

function getDominantEmotion(ev) {
  if (!ev || typeof ev !== 'object') return 'sadness';
  const base = ev.base || ev;
  const entries = Object.entries(base).filter(([, v]) => v != null && v > 0);
  if (entries.length === 0) return 'sadness';
  return entries.reduce((a, b) => b[1] > a[1] ? b : a)[0];
}

// Simple deterministic noise (consistent with strataSection)
function noise2D(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

// ===== Phase B-C: Scene Review =====
export function showSceneReview(container, { scenes, originalVector, lang = 'ko', onConfirm, onRetry }) {
  let currentScene = 0;

  function render() {
    const scene = scenes[currentScene];
    const rgb = scene.originalVector
      ? emotionVectorToRGB(scene.originalVector)
      : emotionVectorToRGB(originalVector);

    container.innerHTML = `
      <div class="scene-review">
        <div class="scene-review-header">
          <span class="scene-review-counter">${currentScene + 1} / ${scenes.length}</span>
        </div>
        <div class="scene-review-wave" id="sceneWaveCanvas"></div>
        <div class="scene-review-text" id="sceneReviewText"></div>
        <div class="scene-review-nav">
          ${currentScene > 0 ? `<button class="scene-nav-btn scene-prev-btn">&larr;</button>` : '<div></div>'}
          ${currentScene < scenes.length - 1
            ? `<button class="scene-nav-btn scene-next-btn">&rarr;</button>`
            : `<div class="scene-review-actions">
                <button class="scene-confirm-btn" id="sceneConfirmBtn">${lang === 'en' ? "This is my memory" : '이게 내 기억이야'}</button>
                <button class="scene-retry-btn" id="sceneRetryBtn">${lang === 'en' ? "Let me tell it again" : '다시 이야기할래'}</button>
              </div>`
          }
        </div>
      </div>
    `;

    // Type scene text
    const textEl = container.querySelector('#sceneReviewText');
    typeText(textEl, scene.text);

    // Wave animation
    const waveContainer = container.querySelector('#sceneWaveCanvas');
    startWaveAnimation(waveContainer, rgb, scene.originalVector?.base?.intensity || 0.5);

    // Navigation
    const prevBtn = container.querySelector('.scene-prev-btn');
    const nextBtn = container.querySelector('.scene-next-btn');
    if (prevBtn) prevBtn.addEventListener('click', () => { currentScene--; render(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentScene++; render(); });

    const confirmBtn = container.querySelector('#sceneConfirmBtn');
    const retryBtn = container.querySelector('#sceneRetryBtn');
    if (confirmBtn) confirmBtn.addEventListener('click', () => onConfirm());
    if (retryBtn) retryBtn.addEventListener('click', () => onRetry());
  }

  render();
}

function typeText(el, text, speed = 28) {
  let i = 0;
  el.textContent = '';
  const timer = setInterval(() => {
    if (i < text.length) {
      el.textContent += text[i];
      i++;
    } else {
      clearInterval(timer);
    }
  }, speed);
}

function startWaveAnimation(container, rgb, intensity) {
  const canvas = document.createElement('canvas');
  canvas.width = container.clientWidth || 400;
  canvas.height = 80;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let t = 0;
  let animId;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cy = canvas.height / 2;
    const amp = 15 + intensity * 20;

    for (let layer = 0; layer < 3; layer++) {
      const alpha = 0.3 - layer * 0.08;
      const freq = 0.015 + layer * 0.008;
      const phase = t * (0.02 + layer * 0.01);
      const layerAmp = amp * (1 - layer * 0.25);

      ctx.beginPath();
      ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
      ctx.lineWidth = 2 - layer * 0.5;

      for (let x = 0; x < canvas.width; x++) {
        const y = cy + Math.sin(x * freq + phase) * layerAmp
                     + Math.sin(x * freq * 2.3 + phase * 1.7) * layerAmp * 0.3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    t++;
    animId = requestAnimationFrame(draw);
  }

  draw();

  // Cleanup on container removal (MutationObserver)
  const observer = new MutationObserver(() => {
    if (!document.contains(canvas)) {
      cancelAnimationFrame(animId);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ===== Phase D: Burial Animation =====
export function showBurialAnimation(container, { originalVector, lang = 'ko', onArchive }) {
  const rgb = emotionVectorToRGB(originalVector);
  const intensity = originalVector?.base
    ? Math.max(...Object.values(originalVector.base).map(v => typeof v === 'number' ? v : 0))
    : 0.5;

  container.innerHTML = `
    <div class="burial-scene">
      <canvas id="burialCanvas" class="burial-canvas"></canvas>
      <div class="burial-text-overlay hidden" id="burialTextOverlay">
        <p class="burial-text-main" id="burialTextMain"></p>
        <p class="burial-text-sub hidden" id="burialTextSub"></p>
      </div>
      <button class="burial-archive-btn hidden" id="burialArchiveBtn">
        ${lang === 'en' ? 'View in Archive' : 'Archive에서 확인하기'}
      </button>
    </div>
  `;

  const canvas = container.querySelector('#burialCanvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  // Burial point (center with slight randomness)
  const bx = w * (0.4 + Math.random() * 0.2);
  const by = h * 0.55;
  const targetHeight = 30 + intensity * 70; // 30~100px

  // Animation
  let startTime = null;
  const RISE_DURATION = 2500; // 2.5 seconds
  let animId;

  function drawTerrain(progress) {
    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#0a0a0e');
    gradient.addColorStop(1, '#15141a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Base terrain line
    const baseY = h * 0.65;

    // Draw layers (darker toward bottom)
    for (let layer = 3; layer >= 0; layer--) {
      const layerOffset = layer * 8;
      ctx.beginPath();

      for (let x = 0; x <= w; x += 2) {
        // Base noise
        let y = baseY + layerOffset;
        y += noise2D(x * 0.005, layer * 10) * 6;
        y += noise2D(x * 0.02, layer * 20 + 5) * 3;

        // Rising terrain at burial point
        if (progress > 0) {
          const dist = Math.abs(x - bx);
          const radius = 80 + intensity * 40;
          if (dist < radius) {
            const factor = Math.cos((dist / radius) * Math.PI * 0.5);
            const rise = factor * factor * targetHeight * progress;
            y -= rise;
          }
        }

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();

      // Layer color
      const darkness = 0.3 + layer * 0.15;
      if (layer === 0 && progress > 0) {
        // Top layer gets emotion color
        const blend = progress * 0.6;
        const r = Math.round(rgb[0] * blend + 40 * (1 - blend));
        const g = Math.round(rgb[1] * blend + 35 * (1 - blend));
        const b = Math.round(rgb[2] * blend + 45 * (1 - blend));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
      } else {
        const v = Math.round(30 + layer * 12);
        ctx.fillStyle = `rgba(${v + 10}, ${v + 5}, ${v + 15}, ${0.9 - layer * 0.1})`;
      }
      ctx.fill();
    }

    // Ripple effect at burial point
    if (progress > 0.3) {
      const rippleProgress = (progress - 0.3) / 0.7;
      const numRipples = 3;
      for (let i = 0; i < numRipples; i++) {
        const rippleDelay = i * 0.25;
        const rp = Math.max(0, rippleProgress - rippleDelay);
        if (rp <= 0) continue;

        const radius = rp * (100 + i * 40);
        const alpha = Math.max(0, 0.3 * (1 - rp));

        ctx.beginPath();
        ctx.arc(bx, by - targetHeight * progress * 0.5, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function animate(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(1, elapsed / RISE_DURATION);

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    drawTerrain(eased);

    if (progress < 1) {
      animId = requestAnimationFrame(animate);
    } else {
      // Animation complete — show text
      showBurialText();
    }
  }

  function showBurialText() {
    const overlay = container.querySelector('#burialTextOverlay');
    const mainText = container.querySelector('#burialTextMain');
    const subText = container.querySelector('#burialTextSub');

    overlay.classList.remove('hidden');
    overlay.style.opacity = '0';
    mainText.textContent = lang === 'en' ? 'Your memory is buried here.' : '너의 기억이 여기 묻혔어.';

    // Fade in main text
    let opacity = 0;
    const fadeIn = setInterval(() => {
      opacity += 0.02;
      overlay.style.opacity = String(Math.min(1, opacity));
      if (opacity >= 1) {
        clearInterval(fadeIn);
        // Show sub text after 1 second
        setTimeout(() => {
          subText.classList.remove('hidden');
          subText.textContent = lang === 'en' ? 'Someone will find this place.' : '누군가 이곳을 찾아올 거야.';
          subText.style.opacity = '0';
          let subOpacity = 0;
          const fadeInSub = setInterval(() => {
            subOpacity += 0.02;
            subText.style.opacity = String(Math.min(1, subOpacity));
            if (subOpacity >= 1) {
              clearInterval(fadeInSub);
              // Show archive button after 3 seconds
              setTimeout(showArchiveButton, 3000);
            }
          }, 20);
        }, 1000);
      }
    }, 20);
  }

  function showArchiveButton() {
    const btn = container.querySelector('#burialArchiveBtn');
    if (btn) {
      btn.classList.remove('hidden');
      btn.style.opacity = '0';
      let opacity = 0;
      const fadeIn = setInterval(() => {
        opacity += 0.02;
        btn.style.opacity = String(Math.min(1, opacity));
        if (opacity >= 1) clearInterval(fadeIn);
      }, 20);
      btn.addEventListener('click', () => {
        if (onArchive) onArchive();
      });
    }
  }

  // Start: 1 second fade to dark, then terrain animation
  drawTerrain(0);
  setTimeout(() => {
    animId = requestAnimationFrame(animate);
  }, 1000);

  // Cleanup
  return () => {
    if (animId) cancelAnimationFrame(animId);
  };
}

// ===== Loading Screen =====
export function showLoadingScreen(container, lang = 'ko') {
  container.innerHTML = `
    <div class="burial-loading">
      <div class="burial-loading-text">${lang === 'en' ? 'Etching the memory...' : '기억을 새기는 중...'}</div>
      <div class="burial-loading-dots">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
    </div>
  `;
}

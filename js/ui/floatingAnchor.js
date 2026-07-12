/**
 * FloatingAnchor — DVD screen보호기 스타일 floating anchor
 * scene-main 내부에서 anchor 오브젝트가 유유히 떠다니며 벽 부딪히면 튕긴다.
 *
 * clarity 시스템:
 *   0 (원본) → 1 (흐림): 누적 데이터 기반 + transition_pattern 변동
 *   clarity가 높을수록 anchor가 흐릿하고 느리며, 배경에 안개가 짙어진다.
 */

// ─── Clarity: transition_pattern → delta ─────────────────────────
const PATTERN_CLARITY_DELTA = {
  echo_follow:   -0.06,   // 원본 따라감 → 선명해짐
  bridge:         0.00,   // 균형 → 변동 없음
  contradiction: +0.10,   // 충돌 → 흐려짐
  displacement:  +0.04,   // 이탈 → 약간 흐려짐
  avoidance:     +0.08,   // 회피 → 안개 짙어짐
  fixation:      -0.04,   // 고착 → 선명해짐 (왜곡된 선명)
};

let _currentClarity = 0;

/**
 * 누적 데이터에서 초기 clarity 계산
 * @param {Object} memoryObj - memory row (cont_* columns)
 * @returns {number} 0~1
 */
function calculateInitialClarity(memoryObj) {
  if (!memoryObj) return 0;
  const depth      = memoryObj.cont_depth        || 0;
  const hetero     = memoryObj.cont_heterogeneity || 0;
  const convergence = memoryObj.cont_convergence  || 0;
  const drift      = memoryObj.cont_drift         || 0;

  // depth가 깊을수록 기본 흐림 증가 (log scale, cap at ~0.3)
  const depthFog = Math.min(0.3, Math.log2(depth + 1) / 8);
  // heterogeneity가 높으면 해석이 분산 → 흐림
  const heteroFog = hetero * 0.4;
  // convergence가 높으면 해석이 수렴 → 선명 (흐림 상쇄)
  const convergenceClear = convergence * 0.3;
  // drift 자체는 약한 흐림 기여
  const driftFog = drift * 0.1;

  return Math.max(0, Math.min(1, depthFog + heteroFog + driftFog - convergenceClear));
}

/**
 * transition_pattern에 따라 clarity를 변동시킨다
 * @param {string} pattern - transition_pattern from engine
 * @returns {number} updated clarity (0~1)
 */
function applyPatternToClarity(pattern) {
  const delta = PATTERN_CLARITY_DELTA[pattern] ?? 0;
  _currentClarity = Math.max(0, Math.min(1, _currentClarity + delta));
  return _currentClarity;
}

/**
 * 배경(scene-main)에 clarity 기반 시각 효과 적용
 * @param {HTMLElement} container
 * @param {number} clarity - 0~1
 */
function _applyBackgroundClarity(container, clarity) {
  if (!container) return;
  // 안개 overlay: clarity가 높을수록 짙은 안개
  let fog = container.querySelector('.clarity-fog');
  if (!fog) {
    fog = document.createElement('div');
    fog.className = 'clarity-fog';
    fog.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;transition:opacity 1.2s ease,backdrop-filter 1.2s ease;';
    container.style.position = 'relative';
    container.insertBefore(fog, container.firstChild);
  }
  fog.style.opacity = clarity * 0.7;
  fog.style.background = `radial-gradient(ellipse at center, rgba(10,10,12,${clarity * 0.5}) 0%, transparent 70%)`;
  fog.style.backdropFilter = clarity > 0.15 ? `blur(${clarity * 3}px)` : 'none';
}

class FloatingAnchor {
  /**
   * @param {HTMLElement} container - scene-main 엘리먼트 (바운딩 영역)
   * @param {Object} options
   * @param {string} options.keyword - anchor keyword (예: "조개껍질", "낡은 의자")
   * @param {number} options.alignment - alignment 0.0~1.0
   * @param {number} [options.clarity] - clarity 0.0~1.0 (0=원본, 1=최대 흐림)
   * @param {string} [options.imageType] - 'text' | 'ascii' | 'photo'
   * @param {string} [options.content] - text/ascii 내용 (imageType이 text/ascii일 때)
   * @param {string} [options.storagePath] - photo URL (imageType이 photo일 때)
   * @param {number} [options.vividness] - 기억 선명도 0.0~1.0
   */
  constructor(container, options = {}) {
    this.container = container;
    this.keyword = options.keyword || '';
    this.alignment = options.alignment ?? 0.5;
    this.clarity = options.clarity ?? 0;
    this.imageType = options.imageType || 'text';
    this.content = options.content || '';
    this.storagePath = options.storagePath || '';
    this.vividness = options.vividness ?? 0.5;

    this.el = null;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.baseSpeed = 0;
    this.width = 0;
    this.height = 0;
    this.animId = null;
    this.alive = false;

    this._init();
  }

  _init() {
    this.layer = document.createElement('div');
    this.layer.className = 'floating-anchor-layer';
    this.container.appendChild(this.layer);

    this.el = document.createElement('div');
    this.el.className = 'floating-anchor';
    this._updateContent();
    this.layer.appendChild(this.el);

    this._resetPosition();

    this.alive = true;
    this._animate();
  }

  _updateContent() {
    // Determine visual state from alignment
    const stateClass = this.alignment >= 0.6 ? 'anchor-clear'
      : this.alignment >= 0.25 ? 'anchor-faded'
      : 'anchor-ghost';

    this.el.className = `floating-anchor ${stateClass}`;
    this.el.innerHTML = '';

    // Clarity affects blur and opacity on top of alignment state
    const clarityBlur = this.clarity * 4;      // 0~4px extra blur
    const clarityOpacity = 1 - this.clarity * 0.4; // 1.0~0.6 multiplier

    if (this.imageType === 'photo' && this.storagePath) {
      const img = document.createElement('img');
      img.src = this.storagePath;
      img.alt = this.keyword;
      img.style.cssText = `max-width:120px;max-height:80px;object-fit:cover;border-radius:2px;transition:filter 0.5s;`;
      const alignBlur = this.alignment >= 0.6 ? 0 : this.alignment >= 0.25 ? 3 : 8;
      const totalBlur = alignBlur + clarityBlur;
      const opacity = (0.3 + this.alignment * 0.7) * clarityOpacity;
      img.style.filter = `blur(${totalBlur}px) opacity(${opacity})`;
      this.el.appendChild(img);

    } else if (this.imageType === 'ascii' && this.content) {
      const pre = document.createElement('pre');
      pre.textContent = this.content;
      pre.style.cssText = `margin:0;font-family:'Courier New',monospace;font-size:8px;line-height:1.1;letter-spacing:0;white-space:pre;color:inherit;`;
      this.el.appendChild(pre);

    } else {
      if (stateClass === 'anchor-ghost') {
        this.el.textContent = this.keyword.charAt(0) || '·';
      } else {
        this.el.textContent = this.content || this.keyword;
      }
    }

    // Apply clarity layer to container element (not photo img which has its own filter)
    if (this.clarity > 0.05 && this.imageType !== 'photo') {
      this.el.style.filter = `blur(${clarityBlur}px)`;
      this.el.style.opacity = String(clarityOpacity);
    }
  }

  _resetPosition() {
    const rect = this.container.getBoundingClientRect();
    const containerW = rect.width || 600;
    const containerH = rect.height || 400;

    this.width = this.el.offsetWidth || 80;
    this.height = this.el.offsetHeight || 30;

    const extraW = containerW * 0.3;
    this.x = -extraW + Math.random() * (containerW + extraW * 2 - this.width);
    this.y = 20 + Math.random() * (containerH - this.height - 40);

    // clarity가 높을수록 느리게 떠다님 (1.0 → 0.3x speed)
    const claritySpeedMul = 1 - this.clarity * 0.7;
    this.baseSpeed = 0.15 + Math.random() * 0.25;
    const speed = this.baseSpeed * claritySpeedMul;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this._applyPosition();
  }

  _applyPosition() {
    this.el.style.transform = `translate(${this.x}px, ${this.y}px)`;
  }

  _animate() {
    if (!this.alive) return;

    const rect = this.container.getBoundingClientRect();
    const containerW = rect.width;
    const containerH = rect.height;
    const extraW = containerW * 0.3;
    const minX = -extraW;
    const maxX = containerW + extraW - this.width;

    this.x += this.vx;
    this.y += this.vy;

    if (this.x <= minX) {
      this.x = minX;
      this.vx = Math.abs(this.vx);
      this._onBounce();
    } else if (this.x >= maxX) {
      this.x = maxX;
      this.vx = -Math.abs(this.vx);
      this._onBounce();
    }

    if (this.y <= 0) {
      this.y = 0;
      this.vy = Math.abs(this.vy);
      this._onBounce();
    } else if (this.y + this.height >= containerH) {
      this.y = containerH - this.height;
      this.vy = -Math.abs(this.vy);
      this._onBounce();
    }

    this._applyPosition();
    this.animId = requestAnimationFrame(() => this._animate());
  }

  _onBounce() {
    this.el.style.opacity = '0.15';
    setTimeout(() => {
      if (this.el) {
        this.el.style.opacity = '';
      }
    }, 150);
  }

  updateAlignment(newAlignment) {
    this.alignment = newAlignment;
    this._updateContent();
  }

  updateClarity(newClarity) {
    this.clarity = newClarity;
    // Smoothly adjust speed based on new clarity
    const claritySpeedMul = 1 - this.clarity * 0.7;
    const speed = (this.baseSpeed || 0.2) * claritySpeedMul;
    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 0.001;
    this.vx = (this.vx / currentSpeed) * speed;
    this.vy = (this.vy / currentSpeed) * speed;
    this._updateContent();
  }

  updateKeyword(newKeyword) {
    this.keyword = newKeyword;
    this._updateContent();
    this._resetPosition();
  }

  destroy() {
    this.alive = false;
    if (this.animId) cancelAnimationFrame(this.animId);
    if (this.layer && this.layer.parentNode) {
      this.layer.parentNode.removeChild(this.layer);
    }
    this.el = null;
    this.layer = null;
  }
}

let currentFloatingAnchors = [];

/**
 * 앵커 하나 추가 (기존 앵커 유지, 누적 생성)
 * @param {HTMLElement} container - 바운딩 영역
 * @param {string} keyword - anchor keyword
 * @param {number} alignment - alignment 0.0~1.0
 * @param {Object} [anchorData] - optional anchor_images row data
 */
function startFloatingAnchor(container, keyword, alignment, anchorData) {
  if (!keyword || !container) return;

  currentFloatingAnchors.push(new FloatingAnchor(container, {
    keyword,
    alignment,
    clarity: _currentClarity,
    imageType: anchorData?.image_type || 'text',
    content: anchorData?.content || '',
    storagePath: anchorData?.storage_path || '',
    vividness: anchorData?.vividness ?? 0.5,
  }));

  // Apply background clarity to container
  _applyBackgroundClarity(container, _currentClarity);
}

/**
 * 모든 앵커의 alignment 업데이트
 */
function updateFloatingAnchorAlignment(alignment) {
  currentFloatingAnchors.forEach(a => a.updateAlignment(alignment));
}

/**
 * clarity 초기화 (memory 선택 시 호출)
 * @param {Object} memoryObj - memory row with cont_* columns
 */
function initClarity(memoryObj) {
  _currentClarity = calculateInitialClarity(memoryObj);
  return _currentClarity;
}

/**
 * transition_pattern에 따라 clarity 업데이트 (매 장면 전환 시 호출)
 * @param {string} pattern - transition_pattern from engine
 * @returns {number} updated clarity
 */
function updateClarity(pattern) {
  const newClarity = applyPatternToClarity(pattern);
  // Update all existing anchors
  currentFloatingAnchors.forEach(a => a.updateClarity(newClarity));
  // Update background fog on all anchor containers
  if (currentFloatingAnchors.length > 0) {
    _applyBackgroundClarity(currentFloatingAnchors[0].container, newClarity);
  }
  return newClarity;
}

/**
 * 현재 clarity 값 반환
 */
function getClarity() {
  return _currentClarity;
}

/**
 * 모든 앵커 제거
 */
function destroyFloatingAnchor() {
  currentFloatingAnchors.forEach(a => a.destroy());
  currentFloatingAnchors = [];
}

// 260709: 되새김 앵커(lumen_recalled_anchors)가 클래스를 직접 인스턴스화 — 전역 clarity/리스트와 분리.
window.FloatingAnchor = FloatingAnchor;
window.startFloatingAnchor = startFloatingAnchor;
window.updateFloatingAnchorAlignment = updateFloatingAnchorAlignment;
window.initClarity = initClarity;
window.updateClarity = updateClarity;
window.getClarity = getClarity;
window.destroyFloatingAnchor = destroyFloatingAnchor;

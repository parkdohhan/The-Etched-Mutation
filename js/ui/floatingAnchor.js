/**
 * FloatingAnchor — DVD 화면보호기 스타일 플로팅 앵커
 * scene-main 내부에서 앵커 오브젝트가 유유히 떠다니며 벽에 부딪히면 튕긴다.
 */

class FloatingAnchor {
  /**
   * @param {HTMLElement} container - scene-main 엘리먼트 (바운딩 영역)
   * @param {Object} options
   * @param {string} options.keyword - 앵커 키워드 (예: "조개껍질", "낡은 의자")
   * @param {number} options.alignment - 정렬도 0.0~1.0
   */
  constructor(container, options = {}) {
    this.container = container;
    this.keyword = options.keyword || '';
    this.alignment = options.alignment ?? 0.5;

    this.el = null;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
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
    if (this.alignment >= 0.6) {
      this.el.textContent = this.keyword;
      this.el.className = 'floating-anchor anchor-clear';
    } else if (this.alignment >= 0.25) {
      this.el.textContent = this.keyword;
      this.el.className = 'floating-anchor anchor-faded';
    } else {
      this.el.textContent = this.keyword.charAt(0) || '·';
      this.el.className = 'floating-anchor anchor-ghost';
    }
  }

  _resetPosition() {
    const rect = this.container.getBoundingClientRect();
    const containerW = rect.width || 600;
    const containerH = rect.height || 400;

    this.width = this.el.offsetWidth || 80;
    this.height = this.el.offsetHeight || 30;

    this.x = 50 + Math.random() * (containerW - this.width - 100);
    this.y = 50 + Math.random() * (containerH - this.height - 100);

    const speed = 0.15 + Math.random() * 0.25;
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

    this.x += this.vx;
    this.y += this.vy;

    if (this.x <= 0) {
      this.x = 0;
      this.vx = Math.abs(this.vx);
      this._onBounce();
    } else if (this.x + this.width >= containerW) {
      this.x = containerW - this.width;
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

let currentFloatingAnchor = null;

/**
 * @param {HTMLElement} container - scene-main 엘리먼트
 * @param {string} keyword - 앵커 키워드
 * @param {number} alignment - 정렬도
 */
function startFloatingAnchor(container, keyword, alignment) {
  if (currentFloatingAnchor) {
    currentFloatingAnchor.destroy();
    currentFloatingAnchor = null;
  }

  if (!keyword || !container) return;

  currentFloatingAnchor = new FloatingAnchor(container, {
    keyword,
    alignment,
  });
}

function updateFloatingAnchorAlignment(alignment) {
  if (currentFloatingAnchor) {
    currentFloatingAnchor.updateAlignment(alignment);
  }
}

function destroyFloatingAnchor() {
  if (currentFloatingAnchor) {
    currentFloatingAnchor.destroy();
    currentFloatingAnchor = null;
  }
}

window.startFloatingAnchor = startFloatingAnchor;
window.updateFloatingAnchorAlignment = updateFloatingAnchorAlignment;
window.destroyFloatingAnchor = destroyFloatingAnchor;

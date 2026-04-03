/**
 * FloatingAnchor — DVD screen보호기 스타일 floating anchor
 * scene-main 내부 서 anchor 오브젝트 유유히 떠다니며 벽 부딪히면 튕긴다.
 */

class FloatingAnchor {
  /**
   * @param {HTMLElement} container - scene-main 엘리먼트 (바운딩 영역)
   * @param {Object} options
   * @param {string} options.keyword - anchor keyword (예: "조개껍질", "낡은 의자")
   * @param {number} options.alignment - alignment 0.0~1.0
   * @param {string} [options.imageType] - 'text' | 'ascii' | 'photo'
   * @param {string} [options.content] - text/ascii 내용 (imageType이 text/ascii일 때)
   * @param {string} [options.storagePath] - photo URL (imageType이 photo일 때)
   * @param {number} [options.vividness] - 기억 선명도 0.0~1.0
   */
  constructor(container, options = {}) {
    this.container = container;
    this.keyword = options.keyword || '';
    this.alignment = options.alignment ?? 0.5;
    this.imageType = options.imageType || 'text';
    this.content = options.content || '';
    this.storagePath = options.storagePath || '';
    this.vividness = options.vividness ?? 0.5;

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
    // Determine visual state from alignment
    const stateClass = this.alignment >= 0.6 ? 'anchor-clear'
      : this.alignment >= 0.25 ? 'anchor-faded'
      : 'anchor-ghost';

    this.el.className = `floating-anchor ${stateClass}`;
    this.el.innerHTML = '';

    if (this.imageType === 'photo' && this.storagePath) {
      // Photo: <img> with blur based on alignment
      const img = document.createElement('img');
      img.src = this.storagePath;
      img.alt = this.keyword;
      img.style.cssText = `max-width:120px;max-height:80px;object-fit:cover;border-radius:2px;transition:filter 0.5s;`;
      const blur = this.alignment >= 0.6 ? 0 : this.alignment >= 0.25 ? 3 : 8;
      img.style.filter = `blur(${blur}px) opacity(${0.3 + this.alignment * 0.7})`;
      this.el.appendChild(img);

    } else if (this.imageType === 'ascii' && this.content) {
      // ASCII art: <pre> with monospace
      const pre = document.createElement('pre');
      pre.textContent = this.content;
      pre.style.cssText = `margin:0;font-family:'Courier New',monospace;font-size:8px;line-height:1.1;letter-spacing:0;white-space:pre;color:inherit;`;
      this.el.appendChild(pre);

    } else {
      // Text: keyword (or first char for ghost)
      if (stateClass === 'anchor-ghost') {
        this.el.textContent = this.keyword.charAt(0) || '·';
      } else {
        this.el.textContent = this.content || this.keyword;
      }
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
 * @param {string} [anchorData.image_type] - 'text' | 'ascii' | 'photo'
 * @param {string} [anchorData.content] - text/ascii content
 * @param {string} [anchorData.storage_path] - photo URL
 * @param {number} [anchorData.vividness] - memory vividness 0~1
 */
function startFloatingAnchor(container, keyword, alignment, anchorData) {
  if (!keyword || !container) return;

  currentFloatingAnchors.push(new FloatingAnchor(container, {
    keyword,
    alignment,
    imageType: anchorData?.image_type || 'text',
    content: anchorData?.content || '',
    storagePath: anchorData?.storage_path || '',
    vividness: anchorData?.vividness ?? 0.5,
  }));
}

/**
 * 모든 앵커의 alignment 업데이트
 */
function updateFloatingAnchorAlignment(alignment) {
  currentFloatingAnchors.forEach(a => a.updateAlignment(alignment));
}

/**
 * 모든 앵커 제거
 */
function destroyFloatingAnchor() {
  currentFloatingAnchors.forEach(a => a.destroy());
  currentFloatingAnchors = [];
}

window.startFloatingAnchor = startFloatingAnchor;
window.updateFloatingAnchorAlignment = updateFloatingAnchorAlignment;
window.destroyFloatingAnchor = destroyFloatingAnchor;

// toast.js — admin 상용화 W1 (2026-07-17, feat(ADM1))
// 성공/정보/오류 3종 인라인 토스트. 자동 소멸 + 큐. 브라우저 기본 alert 대체.
// 자기 완결형: CSS 를 스스로 주입한다 (css/admin.css 는 상용화 구역 밖이라 손대지 않음).
// 사용: import { showToast } from './admin/toast.js'  또는  window.temToast(msg, type)

const MAX_VISIBLE = 4;          // 화면에 동시에 쌓이는 최대 개수
const DEFAULT_TTL = { success: 3200, info: 3200, error: 7000 };

let _container = null;
let _styleInjected = false;
const _queue = [];              // 대기 큐 (MAX_VISIBLE 초과분)
let _visibleCount = 0;

function injectStyle() {
    if (_styleInjected) return;
    _styleInjected = true;
    const style = document.createElement('style');
    style.id = 'tem-toast-style';
    style.textContent = `
    #tem-toast-container {
        position: fixed; right: 20px; bottom: 20px; z-index: 4000;
        display: flex; flex-direction: column; gap: 10px;
        max-width: min(420px, 90vw); pointer-events: none;
    }
    .tem-toast {
        pointer-events: auto;
        display: flex; align-items: flex-start; gap: 10px;
        padding: 12px 14px; border-radius: 8px;
        background: rgba(20, 20, 28, 0.97);
        border: 1px solid rgba(196, 168, 130, 0.28);
        border-left-width: 4px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        color: #e8e2d6; font-family: 'Noto Serif KR', serif;
        font-size: 0.9rem; line-height: 1.45;
        opacity: 0; transform: translateY(12px);
        transition: opacity .22s ease, transform .22s ease;
        word-break: break-word;
    }
    .tem-toast.tem-show { opacity: 1; transform: translateY(0); }
    .tem-toast.tem-hide { opacity: 0; transform: translateY(12px); }
    .tem-toast-success { border-left-color: #7bb661; }
    .tem-toast-info    { border-left-color: #c4a882; }
    .tem-toast-error   { border-left-color: #d66a5a; }
    .tem-toast-icon { flex: 0 0 auto; font-size: 1rem; line-height: 1.35; }
    .tem-toast-success .tem-toast-icon { color: #7bb661; }
    .tem-toast-info    .tem-toast-icon { color: #c4a882; }
    .tem-toast-error   .tem-toast-icon { color: #d66a5a; }
    .tem-toast-body { flex: 1 1 auto; }
    .tem-toast-close {
        flex: 0 0 auto; background: none; border: none;
        color: rgba(232, 226, 214, 0.55); cursor: pointer;
        font-size: 1rem; line-height: 1; padding: 2px 4px;
    }
    .tem-toast-close:hover { color: #e8e2d6; }
    `;
    document.head.appendChild(style);
}

function ensureContainer() {
    injectStyle();
    if (_container && document.body.contains(_container)) return _container;
    _container = document.getElementById('tem-toast-container');
    if (!_container) {
        _container = document.createElement('div');
        _container.id = 'tem-toast-container';
        document.body.appendChild(_container);
    }
    return _container;
}

function iconFor(type) {
    if (type === 'success') return '✓';
    if (type === 'error') return '⚠';
    return 'ℹ';
}

function dismiss(el) {
    if (!el || el._temDismissed) return;
    el._temDismissed = true;
    if (el._temTimer) clearTimeout(el._temTimer);
    el.classList.remove('tem-show');
    el.classList.add('tem-hide');
    setTimeout(() => {
        el.remove();
        _visibleCount = Math.max(0, _visibleCount - 1);
        pump();
    }, 240);
}

function render({ message, type, ttl }) {
    const container = ensureContainer();
    const el = document.createElement('div');
    el.className = `tem-toast tem-toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'tem-toast-icon';
    icon.textContent = iconFor(type);

    const body = document.createElement('div');
    body.className = 'tem-toast-body';
    body.textContent = message;   // textContent — XSS 안전

    const close = document.createElement('button');
    close.className = 'tem-toast-close';
    close.setAttribute('aria-label', '닫기');
    close.textContent = '×';
    close.addEventListener('click', () => dismiss(el));

    el.appendChild(icon);
    el.appendChild(body);
    el.appendChild(close);
    container.appendChild(el);
    _visibleCount++;

    // 다음 프레임에 show 클래스 → 트랜지션 발동
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('tem-show')));

    const life = ttl != null ? ttl : (DEFAULT_TTL[type] || DEFAULT_TTL.info);
    if (life > 0) {
        el._temTimer = setTimeout(() => dismiss(el), life);
    }
    return el;
}

function pump() {
    while (_visibleCount < MAX_VISIBLE && _queue.length > 0) {
        render(_queue.shift());
    }
}

/**
 * 토스트를 띄운다.
 * @param {string} message  본문 텍스트
 * @param {'success'|'info'|'error'} [type='info']
 * @param {object} [opts]  { ttl?: number(ms, 0=수동닫기만) }
 */
export function showToast(message, type = 'info', opts = {}) {
    if (message == null) return;
    const t = (type === 'success' || type === 'error') ? type : 'info';
    const item = { message: String(message), type: t, ttl: opts.ttl };
    if (_visibleCount < MAX_VISIBLE) render(item);
    else _queue.push(item);
}

export const toastSuccess = (m, o) => showToast(m, 'success', o);
export const toastInfo = (m, o) => showToast(m, 'info', o);
export const toastError = (m, o) => showToast(m, 'error', o);

// 비-모듈 코드(admin-trajectory 등)에서도 쓰도록 전역 노출
if (typeof window !== 'undefined') {
    window.temToast = showToast;
}

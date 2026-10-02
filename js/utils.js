import { i18n } from './i18n.js?v=2.9.44';

export function debounce(func, wait, { maxWait } = {}) {
    let timeout, maxTimeout, lastArgs, lastThis;
    const invoke = () => {
        clearTimeout(timeout);
        clearTimeout(maxTimeout);
        timeout = maxTimeout = null;
        func.apply(lastThis, lastArgs);
    };
    return Object.assign(function(...args) {
        lastThis = this;
        lastArgs = args;
        clearTimeout(timeout);
        timeout = setTimeout(invoke, wait);
        if (maxWait && !maxTimeout) maxTimeout = setTimeout(invoke, maxWait);
    }, {
        cancel: () => {
            clearTimeout(timeout);
            clearTimeout(maxTimeout);
            timeout = maxTimeout = null;
        },
        flush: () => {
            if (timeout) invoke();
        }
    });
}

export function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// --- URL safety: prevent javascript:/data: XSS via imported config or user input ---
const SAFE_PROTOCOLS = ['http:', 'https:'];

export function safeUrl(raw, fallback = '') {
    if (typeof raw !== 'string') return fallback;
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    try {
        const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : 'https://' + trimmed;
        const u = new URL(normalized);
        return SAFE_PROTOCOLS.includes(u.protocol) ? u.href : fallback;
    } catch {
        return fallback;
    }
}

export function openExternal(url) {
    const safe = safeUrl(url);
    if (!safe) return;
    window.open(safe, '_blank', 'noopener,noreferrer');
}

export function showToast(message, type = 'normal') {
    const container = document.getElementById('toast-container');
    if (!container) {
        // Fallback: create a temporary toast container if none exists
        const tempContainer = document.createElement('div');
        tempContainer.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999';
        const toast = document.createElement('div');
        toast.style.cssText = 'background:rgba(0,0,0,0.85);color:white;padding:12px 24px;border-radius:30px;font-size:14px;font-weight:500;display:inline-block';
        toast.textContent = message;
        tempContainer.appendChild(toast);
        document.body.appendChild(tempContainer);
        setTimeout(() => tempContainer.remove(), 3000);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function t(key) {
    return i18n.t(key);
}

// --- Focus trap for modals ---
let lastFocused = null;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const dlg = document.querySelector('.modal:not(.hidden)');
    if (!dlg) return;
    const items = [...dlg.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const activeIndex = items.indexOf(document.activeElement);
    if (e.shiftKey && activeIndex <= 0) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (activeIndex === -1 || activeIndex === items.length - 1)) {
        e.preventDefault();
        first.focus();
    }
}

export function openDialog(id) {
    const dlg = document.getElementById(id);
    if (!dlg) return;
    lastFocused = document.activeElement;
    dlg.classList.remove('hidden');
    const initialFocus = dlg.querySelector('.modal-content') || dlg.querySelector(FOCUSABLE);
    if (initialFocus) {
        if (initialFocus.classList.contains('modal-content') && !initialFocus.hasAttribute('tabindex')) {
            initialFocus.setAttribute('tabindex', '-1');
        }
        initialFocus.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', trapFocus, true);
}

export function closeDialog(id) {
    const dlg = document.getElementById(id);
    if (!dlg) return;
    dlg.classList.add('hidden');
    document.removeEventListener('keydown', trapFocus, true);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
}

export function updateSyncStatus(status) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    if (window._syncTimer) clearTimeout(window._syncTimer);

    if (status === 'saving') {
        el.innerHTML = '<span class="spinner">↻</span> ' + t('msg_saving');
        el.className = 'sync-status visible saving';
    } else if (status === 'saved') {
        el.innerHTML = '✓ ' + t('msg_saved');
        el.className = 'sync-status visible saved';
        window._syncTimer = setTimeout(() => el.classList.remove('visible'), 2000);
    } else if (status === 'error') {
        el.innerHTML = '⚠ ' + t('msg_save_fail');
        el.className = 'sync-status visible error';
    }
}

// --- 核心新增：全局胶囊动画控制 ---
let shrinkTimer = null;

export function startPillAnimation() {
    const pill = document.getElementById('user-pill');
    if (!pill) return;

    // Early return: pill is already expanded and the shrink timer is armed
    const isIdle = !pill.classList.contains('shrunk');
    if (isIdle && shrinkTimer) return;

    // 1. 立即重置状态：显示并展开
    pill.classList.remove('shrunk');
    if (shrinkTimer) clearTimeout(shrinkTimer);

    // 2. 检查阻塞条件 (如果正在交互，则不启动倒计时)
    // 直接检查 DOM 类名，避免复杂的依赖引用
    const isEditing = document.body.classList.contains('is-editing');
    const isMenuOpen = document.getElementById('user-dropdown')?.classList.contains('active');

    // 检查所有可能的弹窗
    const modalIds = ['auth-modal', 'pref-modal', 'page-edit-modal', 'modal', 'theme-controls'];
    const isAnyModalOpen = modalIds.some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
    });

    // 如果处于任何一种交互状态，保持常亮，不启动定时器
    if (isEditing || isMenuOpen || isAnyModalOpen) {
        return;
    }

    // 3. 启动倒计时 (空闲状态)
    shrinkTimer = setTimeout(() => {
        if(pill) pill.classList.add('shrunk');
    }, 10000); // 10秒后收缩
}

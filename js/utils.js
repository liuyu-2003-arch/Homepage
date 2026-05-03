import { i18n } from './i18n.js';

export function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

export function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
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
let hideTimer = null;

export function startPillAnimation() {
    const pill = document.getElementById('user-pill');
    if (!pill) return;

    // 1. 立即重置状态：显示并展开
    pill.classList.remove('shrunk', 'hidden-anim');
    if (shrinkTimer) clearTimeout(shrinkTimer);
    if (hideTimer) clearTimeout(hideTimer);

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

    hideTimer = setTimeout(() => {
        if(pill) pill.classList.add('hidden-anim');
    }, 12000); // 10秒+2秒后隐藏
}
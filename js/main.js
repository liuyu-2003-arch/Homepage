import { initSupabase, loadData, exportConfig, importConfig, handleImport } from './api.js?v=2.9.60';
import { initAuth, handleLogin, handleRegister, handleLogout, handleOAuthLogin } from './auth.js?v=2.9.60';
import { i18n } from './i18n.js?v=2.9.60';
import { logger } from './logger.js?v=2.9.60';
import {
    render, toggleEditMode, initSwiper, saveBookmark, deleteBookmark, openModal, closeModal,
    addPage, deletePage, openPageEditModal, closePageEditModal, renderPageList, handleViewportResize,
    openDockEditModal, closeDockEditModal, saveDockEditConfig,
    initTheme, changeTheme, quickChangeTheme, openThemeControls, closeThemeControls,
    autoFillInfo, updatePreview, selectStyle, selectPage, debouncedSaveData
} from './ui.js?v=2.9.60';
import { t, showToast, startPillAnimation, openExternal, openDialog } from './utils.js?v=2.9.60';
import { state, onDataReloaded } from './state.js?v=2.9.60';
import { CONFIG } from './config.js?v=2.9.60';

async function loadTemplates() {
    const templates = [
        { id: 'user-dropdown-placeholder', url: 'templates/user_dropdown.html' },
        { id: 'modal-placeholder', url: 'templates/bookmark_modal.html' },
        { id: 'page-edit-modal-placeholder', url: 'templates/page_edit_modal.html' },
        { id: 'dock-edit-modal-placeholder', url: 'templates/dock_edit_modal.html' },
        { id: 'auth-modal-placeholder', url: 'templates/auth_modal.html' },
        { id: 'help-modal-placeholder', url: 'templates/help_modal.html' },
        { id: 'confirm-modal-placeholder', url: 'templates/confirm_modal.html' }
    ];

    await Promise.all(templates.map(async (template) => {
        try {
            const response = await fetch(template.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            const placeholder = document.getElementById(template.id);
            if (placeholder) {
                placeholder.outerHTML = html;
            }
        } catch (error) {
            logger.error(`Failed to load template: ${template.url}`, error);
        }
    }));
}


document.addEventListener('DOMContentLoaded', async () => {
    // 1. 初始化基础配置
    await loadTemplates();
    document.body.style.visibility = 'hidden';
    await i18n.loadTranslations(i18n.currentLang);
    initTheme();
    initSwiper();

    // 应用说明：默认隐藏，点右下角圆形 “!” 按钮打开。点 “×” 后永久不再显示
    // （记录在 localStorage；全新会话——例如审核方——仍能看到按钮与说明）。
    try {
        const intro = document.getElementById('app-intro');
        const toggle = document.getElementById('intro-toggle');
        if (intro && toggle) {
            const INTRO_DISMISSED_KEY = 'hp_intro_dismissed';
            const isDismissed = () => {
                try { return localStorage.getItem(INTRO_DISMISSED_KEY) === '1'; } catch (e) { return false; }
            };

            const setIntroOpen = (open) => {
                if (open) intro.removeAttribute('hidden');
                else intro.setAttribute('hidden', '');
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            };

            setIntroOpen(false);
            if (isDismissed()) toggle.setAttribute('hidden', '');

            toggle.addEventListener('click', (event) => {
                event.stopPropagation();
                setIntroOpen(intro.hasAttribute('hidden'));
            });

            const dismissBtn = document.getElementById('intro-dismiss');
            if (dismissBtn) {
                dismissBtn.addEventListener('click', () => {
                    setIntroOpen(false);
                    toggle.setAttribute('hidden', '');
                    try { localStorage.setItem(INTRO_DISMISSED_KEY, '1'); } catch (e) { logger.error(e); }
                });
            }

            document.addEventListener('click', (event) => {
                if (intro.hasAttribute('hidden')) return;
                if (intro.contains(event.target) || toggle.contains(event.target)) return;
                setIntroOpen(false);
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') setIntroOpen(false);
            });
        }
    } catch (e) { logger.error('Intro init failed', e); }

    // 显示版本号
    const injectVersion = () => {
        const el = document.getElementById('app-version');
        if (el) el.textContent = 'v' + CONFIG.APP_VERSION;
    };
    injectVersion();

    // 2. 注册数据重载回调（解除 api.js ↔ ui.js 循环依赖）
    onDataReloaded(render);

    // 3. 初始化 Supabase + 加载数据（容错：任何失败都不能白屏）
    try {
        const sb = initSupabase();
        if (sb) {
            try {
                await initAuth();
            } catch (authErr) {
                logger.error('Auth init failed, falling back to local data', authErr);
            }
            if (!state.currentUser) await loadData();
        } else {
            await loadData();
        }
    } catch (bootErr) {
        logger.error('Boot failed, loading local fallback', bootErr);
        await loadData();
    } finally {
        document.body.style.visibility = 'visible';
    }

    // 4. 监听导入文件
    const importInput = document.getElementById('import-file-input');
    if(importInput) importInput.addEventListener('change', handleImport);

    // 5. 绑定反馈按钮
    window.handleFeedback = () => {
        const subject = encodeURIComponent("Homepage Feedback");
        const body = encodeURIComponent("Hi Developer,\n\nI have some feedback:");
        window.location.href = `mailto:support@324893.xyz?subject=${subject}&body=${body}`;
    };

    window.handleDonate = () => {
        openExternal('https://buymeacoffee.com/324893');
    };

    // --- 鼠标悬停触发动画重置 ---
    const userTriggerArea = document.querySelector('.user-trigger-area');
    if (userTriggerArea) {
        userTriggerArea.addEventListener('mouseenter', startPillAnimation);
    }

    // ============================================================
    // 挂载所有交互函数到 window（供模板 inline onclick 使用）
    // ============================================================
    window.handleLogin = handleLogin;
    window.handleRegister = handleRegister;
    window.handleLogout = handleLogout;
    window.handleOAuthLogin = handleOAuthLogin;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.toggleEditMode = toggleEditMode;
    window.openPageEditModal = openPageEditModal;
    window.closePageEditModal = closePageEditModal;
    window.openThemeControls = openThemeControls;
    window.closeThemeControls = closeThemeControls;
    window.saveBookmark = saveBookmark;
    window.deleteBookmark = deleteBookmark;
    window.autoFillInfo = autoFillInfo;
    window.updatePreview = updatePreview;
    window.selectStyle = selectStyle;
    window.selectPage = selectPage;
    window.addPage = addPage;
    window.deletePage = deletePage;
    window.importConfig = importConfig;
    window.exportConfig = exportConfig;
    window.quickChangeTheme = quickChangeTheme;
    window.changeTheme = changeTheme;
    window.handleMenuEdit = () => {
        document.getElementById('user-dropdown').classList.remove('active');
        toggleEditMode(true);
    };
    window.openHelpModal = () => {
        document.getElementById('user-dropdown').classList.remove('active');
        openDialog('help-modal');
    };
    window.closeHelpModal = () => {
        document.getElementById('help-modal').classList.add('hidden');
        startPillAnimation();
    };
    window.changeLanguage = async (lang) => {
        await i18n.loadTranslations(lang);
    };
    window.toggleAuthModal = () => {
         if (state.currentUser) {
            document.getElementById('user-dropdown').classList.toggle('active');
        } else {
            openDialog('auth-modal');
            window.switchToLoginView();
        }
    };
    window.closeAuthModal = () => {
        document.getElementById('auth-modal').classList.add('hidden');
        startPillAnimation();
    };
    window.switchToSignUpView = () => {
        document.getElementById('auth-title').textContent = t('btn_register');
        document.getElementById('login-actions').classList.add('hidden');
        document.getElementById('register-actions').classList.remove('hidden');
        document.getElementById('social-login-container').classList.remove('hidden');
        document.getElementById('login-footer').classList.add('hidden');
        document.getElementById('register-footer').classList.remove('hidden');
    };
    window.switchToLoginView = () => {
        document.getElementById('auth-title').textContent = t('btn_login');
        document.getElementById('login-actions').classList.remove('hidden');
        document.getElementById('register-actions').classList.add('hidden');
        document.getElementById('social-login-container').classList.remove('hidden');
        document.getElementById('login-footer').classList.remove('hidden');
        document.getElementById('register-footer').classList.add('hidden');
    };


    // --- 数据保存兜底：关页/切后台时立即 flush ---
    window.addEventListener('pagehide', () => debouncedSaveData.flush());
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) debouncedSaveData.flush();
    });

    let resizeTimer;
    const scheduleResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            handleViewportResize();
        }, 150);
    };
    window.addEventListener('resize', scheduleResize);
    // iOS Safari resizes the visual viewport (not the window) when its toolbar
    // collapses/expands, so re-measure page capacity there too.
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleResize);
    }

    // --- 事件委托：统一处理 data-action ---
    const ACTIONS = {
        navigate: (el) => location.href = el.dataset.arg,
        closeModal: () => closeModal(),
        closePageEditModal: () => closePageEditModal(),
        closeDockEditModal: () => closeDockEditModal(),
        closeThemeControls: () => closeThemeControls(),
        closeAuthModal: () => window.closeAuthModal(),
        closeHelpModal: () => window.closeHelpModal(),
        openModal: () => openModal(),
        openPageEditModal: () => openPageEditModal(),
        openDockEditModal: () => openDockEditModal(),
        openThemeControls: () => openThemeControls(),
        openHelpModal: () => window.openHelpModal(),
        saveBookmark: () => saveBookmark(),
        saveDockEditConfig: () => saveDockEditConfig(),
        handleLogin: () => handleLogin(),
        handleRegister: () => handleRegister(),
        handleLogout: () => handleLogout(),
        handleMenuEdit: () => window.handleMenuEdit(),
        handleFeedback: () => window.handleFeedback(),
        handleDonate: () => window.handleDonate(),
        importConfig: () => importConfig(),
        exportConfig: () => exportConfig(),
        addPage: () => addPage(),
        toggleAuthModal: () => window.toggleAuthModal(),
        toggleEditMode: () => toggleEditMode(false),
        switchToSignUpView: () => window.switchToSignUpView(),
        switchToLoginView: () => window.switchToLoginView(),
        updatePreview: () => updatePreview(),
        changeLanguage: (el) => window.changeLanguage(el.dataset.arg),
        handleOAuthLogin: (el) => handleOAuthLogin(el.dataset.arg),
        quickChangeTheme: (el) => quickChangeTheme(null, el.dataset.arg),
        selectStyle: (el) => selectStyle(el),
        changeTheme: (el) => changeTheme(el.dataset.arg, el, null),
        savePreferences: () => window.savePreferences(),
    };

    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;
        if (ACTIONS[action]) { e.preventDefault(); ACTIONS[action](el, e); }
    });

    // Input delegation
    document.addEventListener('input', (e) => {
        const el = e.target.closest('[data-action]');
        if (el) {
            const action = el.dataset.action;
            if (el.hasAttribute('data-input')) {
                const fn = window[action];
                if (fn) fn(el.value);
            } else if (ACTIONS[action]) {
                ACTIONS[action](el, e);
            }
        }
        // Digit filter
        const filterEl = e.target.closest('[data-filter="digits"]');
        if (filterEl) filterEl.value = filterEl.value.replace(/\D/g, '');
    });

    // --- 关闭用户下拉菜单 ---
    // 使用 pointerdown 而非 click：iPadOS/iOS 对非交互的空白区域通常不会派发
    // click 事件，导致点击空白处无法收起菜单。pointerdown 对触摸和鼠标都会触发。
    document.addEventListener('pointerdown', (e) => {
        const menu = document.getElementById('user-dropdown');
        const pill = document.getElementById('user-pill');

        if (menu && menu.classList.contains('active')) {
            if (!menu.contains(e.target) && (!pill || !pill.contains(e.target))) {
                menu.classList.remove('active');
                startPillAnimation();
            }
        }
    }, { passive: true });
});

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=2.9.60').catch(() => {});
    });
}

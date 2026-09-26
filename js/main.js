import { initSupabase, loadData, exportConfig, importConfig, handleImport } from './api.js';
import { initAuth, handleLogin, handleRegister, handleLogout, handleOAuthLogin, savePreferences } from './auth.js';
import { i18n } from './i18n.js';
import { logger } from './logger.js';
import {
    render, toggleEditMode, initSwiper, saveBookmark, deleteBookmark, openModal, closeModal,
    addPage, deletePage, openPageEditModal, closePageEditModal, renderPageList,
    initTheme, changeTheme, quickChangeTheme, openThemeControls, closeThemeControls,
    autoFillInfo, updatePreview, selectStyle, selectPage,
    handleAvatarUrlInput, debouncedSaveData
} from './ui.js';
import { t, showToast, startPillAnimation, openExternal } from './utils.js';
import { state, onDataReloaded } from './state.js';
import { CONFIG } from './config.js';

async function loadTemplates() {
    const templates = [
        { id: 'user-dropdown-placeholder', url: 'templates/user_dropdown.html' },
        { id: 'modal-placeholder', url: 'templates/bookmark_modal.html' },
        { id: 'page-edit-modal-placeholder', url: 'templates/page_edit_modal.html' },
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
        window.location.href = `mailto:jemchmi@gmail.com?subject=${subject}&body=${body}`;
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
    window.savePreferences = savePreferences;
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
        document.getElementById('help-modal').classList.remove('hidden');
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
            document.getElementById('auth-modal').classList.remove('hidden');
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
    let lastIsMobile = window.innerWidth < CONFIG.MOBILE_MAX_WIDTH;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const isMobile = window.innerWidth < CONFIG.MOBILE_MAX_WIDTH;
            if (isMobile !== lastIsMobile) {
                lastIsMobile = isMobile;
                render();
            }
        }, 150);
    });

    // --- 关闭用户下拉菜单 ---
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('user-dropdown');
        const pill = document.getElementById('user-pill');

        if (menu && menu.classList.contains('active')) {
            if (!menu.contains(e.target) && (!pill || !pill.contains(e.target))) {
                menu.classList.remove('active');
                startPillAnimation();
            }
        }
    });
});

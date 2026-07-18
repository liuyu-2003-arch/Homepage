import { initSupabase, loadData, saveData, exportConfig, importConfig, handleImport } from './api.js';
import { initAuth, handleLogin, handleRegister, handleLogout, handleOAuthLogin, savePreferences } from './auth.js';
import { i18n } from './i18n.js';
import { logger } from './logger.js';
import {
    render, toggleEditMode, initSwiper, saveBookmark, deleteBookmark, openModal, closeModal,
    addPage, deletePage, openPageEditModal, closePageEditModal, renderPageList,
    initTheme, changeTheme, quickChangeTheme, openThemeControls, closeThemeControls,
    openPrefModal, switchAvatarTab, handleAvatarFile, selectNewAvatar, createAvatarSelector,
    autoFillInfo, updatePreview, selectStyle, selectPage, updatePrefNamePreview,
    handleAvatarUrlInput
} from './ui.js';
import { t, showToast, startPillAnimation } from './utils.js';
import { state } from './state.js';

async function loadTemplates() {
    const templates = [
        { id: 'user-dropdown-placeholder', url: 'templates/user_dropdown.html' },
        { id: 'modal-placeholder', url: 'templates/bookmark_modal.html' },
        { id: 'page-edit-modal-placeholder', url: 'templates/page_edit_modal.html' },
        { id: 'pref-modal-placeholder', url: 'templates/pref_modal.html' },
        { id: 'auth-modal-placeholder', url: 'templates/auth_modal.html' },
        { id: 'help-modal-placeholder', url: 'templates/help_modal.html' },
        { id: 'confirm-modal-placeholder', url: 'templates/confirm_modal.html' }
    ];

    for (const template of templates) {
        try {
            const response = await fetch(template.url);
            const html = await response.text();
            const placeholder = document.getElementById(template.id);
            if (placeholder) {
                placeholder.outerHTML = html;
            }
        } catch (error) {
            logger.error(`Failed to load template: ${template.url}`, error);
        }
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    // 1. 初始化基础配置
    await loadTemplates();
    document.body.style.visibility = 'hidden';
    await i18n.loadTranslations(i18n.currentLang);
    initTheme();
    initSwiper();

    // 2. 注册页面的头像选择器
    createAvatarSelector('avatar-selector', (url) => {
        state.selectedAvatarUrl = url;
    });
    const authContainer = document.getElementById('avatar-selector');
    if (authContainer && authContainer.firstChild) authContainer.firstChild.click();

    // 3. 初始化 Supabase
    const sb = initSupabase();
    if (sb) {
        initAuth().then(() => { if (!state.currentUser) loadData(); });
    } else {
        loadData();
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

    // 【新增】绑定捐赠按钮 (已更新链接)
    window.handleDonate = () => {
        const donateUrl = 'https://buymeacoffee.com/324893';
        window.open(donateUrl, '_blank');
    };

    // --- 新增：鼠标悬停触发动画重置 ---
    const userTriggerArea = document.querySelector('.user-trigger-area');
    if (userTriggerArea) {
        userTriggerArea.addEventListener('mouseenter', startPillAnimation);
        userTriggerArea.addEventListener('mousemove', startPillAnimation); // 持续移动也重置
    }

    // ============================================================
    // 🔥 核心修复：挂载所有交互函数到 window
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
    window.openPrefModal = openPrefModal;
    window.switchAvatarTab = switchAvatarTab;
    window.handleAvatarUrlInput = handleAvatarUrlInput;
    window.selectNewAvatar = selectNewAvatar;
    window.updatePrefNamePreview = updatePrefNamePreview;
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
    };
    window.changeLanguage = async (lang) => {
        await i18n.loadTranslations(lang);
    };
    window.toggleAuthModal = () => {
         if (state.currentUser) {
            document.getElementById('user-dropdown').classList.toggle('active');
        } else {
            document.getElementById('auth-modal').classList.remove('hidden');
            window.switchToLoginView(); // Default to login view
        }
    };
    window.closeAuthModal = () => {
        document.getElementById('auth-modal').classList.add('hidden');
    };
    window.switchToSignUpView = () => {
        document.getElementById('auth-title').textContent = 'Sign up';
        // document.getElementById('signup-specifics').classList.remove('hidden'); // REMOVED
        document.getElementById('login-actions').classList.add('hidden');
        document.getElementById('register-actions').classList.remove('hidden');
        document.getElementById('social-login-container').classList.remove('hidden');
        document.getElementById('login-footer').classList.add('hidden');
        document.getElementById('register-footer').classList.remove('hidden');
    };
    window.switchToLoginView = () => {
        document.getElementById('auth-title').textContent = 'Sign in';
        // document.getElementById('signup-specifics').classList.add('hidden'); // REMOVED
        document.getElementById('login-actions').classList.remove('hidden');
        document.getElementById('register-actions').classList.add('hidden');
        document.getElementById('social-login-container').classList.remove('hidden');
        document.getElementById('login-footer').classList.remove('hidden');
        document.getElementById('register-footer').classList.add('hidden');
    };


    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(render, 150);
    });

    // --- 核心修复：更新点击监听器 ---
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('user-dropdown');
        const pill = document.getElementById('user-pill');

        if (menu && menu.classList.contains('active')) {
            // 检查点击目标是否在菜单或按钮外部
            if (!menu.contains(e.target) && (!pill || !pill.contains(e.target))) {
                menu.classList.remove('active');
                // 菜单关闭后，重新开始动画计时
                startPillAnimation();
            }
        }
    });
});

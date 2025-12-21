import { initSupabase, loadData, saveData, exportConfig, importConfig, handleImport } from './api.js';
import { initAuth, handleLogin, handleRegister, handleLogout, handleOAuthLogin, savePreferences } from './auth.js';
import { i18n } from './i18n.js';
import {
    render, toggleEditMode, initSwiper, saveBookmark, deleteBookmark, openModal, closeModal,
    addPage, deletePage, openPageEditModal, closePageEditModal, renderPageList,
    initTheme, changeTheme, quickChangeTheme, openThemeControls, closeThemeControls,
    openPrefModal, switchAvatarTab, handleAvatarFile, selectNewAvatar, createAvatarSelector,
    autoFillInfo, updatePreview, selectStyle, selectPage, updatePrefNamePreview,
    handleAvatarUrlInput, handleMenuEdit, openHelpModal, closeHelpModal
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
        { id: 'help-modal-placeholder', url: 'templates/help_modal.html' }
    ];

    for (const template of templates) {
        try {
            const response = await fetch(template.url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const html = await response.text();
            const placeholder = document.getElementById(template.id);
            if (placeholder) placeholder.outerHTML = html;
        } catch (error) {
            console.error(`Failed to load template: ${template.url}`, error);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    document.body.style.visibility = 'hidden';

    // 1. 优先加载模板和语言
    await loadTemplates();
    await i18n.loadTranslations(i18n.currentLang);

    // 2. 初始化 UI 组件
    initTheme();
    initSwiper();
    createAvatarSelector('avatar-selector', (url) => { state.selectedAvatarUrl = url; });

    // 3. 初始化 Supabase 和数据
    const sb = initSupabase();
    if (sb) {
        await initAuth();
        if (!state.currentUser) await loadData();
    } else {
        await loadData();
    }

    // 4. 【核心修复】强制恢复显示，放在所有 await 之后
    document.body.style.visibility = 'visible';

    // 5. 挂载全局交互函数
    window.handleLogin = () => {
        const email = document.getElementById('auth-email')?.value;
        const pass = document.getElementById('auth-password')?.value;
        if(!email || !pass) return showToast(t("msg_input_req"), "error");
        handleLogin(email, pass);
    };

    window.handleRegister = () => {
        const email = document.getElementById('auth-email')?.value;
        const pass = document.getElementById('auth-password')?.value;
        handleRegister(email, pass, state.selectedAvatarUrl);
    };

    window.toggleAuthModal = () => {
        if (state.currentUser) {
            document.getElementById('user-dropdown')?.classList.toggle('active');
        } else {
            document.getElementById('auth-modal')?.classList.remove('hidden');
            window.switchToLoginView();
        }
    };

    window.closeAuthModal = () => document.getElementById('auth-modal')?.classList.add('hidden');
    window.handleLogout = handleLogout;
    window.handleOAuthLogin = handleOAuthLogin;
    window.savePreferences = savePreferences;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.toggleEditMode = toggleEditMode;
    window.importConfig = importConfig;
    window.exportConfig = exportConfig;
    window.openThemeControls = openThemeControls;
    window.closeThemeControls = closeThemeControls;
    window.handleMenuEdit = handleMenuEdit;
    window.openHelpModal = openHelpModal;
    window.closeHelpModal = closeHelpModal;
    window.openPrefModal = openPrefModal;

    // 导入监听
    const importInput = document.getElementById('import-file-input');
    if(importInput) importInput.addEventListener('change', handleImport);

    window.addEventListener('resize', () => { render(); });
});
import { initSupabase, loadData, saveData, exportConfig, importConfig, handleImport } from './api.js';
import { initAuth, handleLogin, handleRegister, handleLogout, handleOAuthLogin, savePreferences } from './auth.js';
import { i18n } from './i18n.js';
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
        { id: 'help-modal-placeholder', url: 'templates/help_modal.html' }
    ];

    for (const template of templates) {
        try {
            const response = await fetch(template.url);
            const html = await response.text();
            const placeholder = document.getElementById(template.id);
            if (placeholder) placeholder.outerHTML = html;
        } catch (error) {
            console.error(`Failed to load template: ${template.url}`, error);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 初始化基础配置
    await loadTemplates();
    document.body.style.visibility = 'hidden'; // 先隐藏以防闪烁
    await i18n.loadTranslations(i18n.currentLang);
    initTheme();
    initSwiper();

    // 2. 注册页面的头像选择器
    createAvatarSelector('avatar-selector', (url) => { state.selectedAvatarUrl = url; });

    // 3. 初始化 Supabase
    const sb = initSupabase();
    if (sb) {
        await initAuth();
        if (!state.currentUser) await loadData();
    } else {
        await loadData();
    }

    // 4. 【关键修复】所有初始化完成后，恢复页面可见性
    document.body.style.visibility = 'visible';

    // 5. 挂载全局交互函数 (确保 onclick 可用)
    window.handleLogin = () => {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-password').value;
        if(!email || !pass) return showToast(t("msg_input_req"), "error");
        handleLogin(email, pass);
    };

    window.handleRegister = () => {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-password').value;
        if(!email || !pass) return showToast(t("msg_input_req"), "error");
        handleRegister(email, pass, state.selectedAvatarUrl);
    };

    window.toggleAuthModal = () => {
         if (state.currentUser) {
            document.getElementById('user-dropdown').classList.toggle('active');
        } else {
            document.getElementById('auth-modal').classList.remove('hidden');
            window.switchToLoginView();
        }
    };

    // 其他全局挂载
    window.closeAuthModal = () => document.getElementById('auth-modal').classList.add('hidden');
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

    // 导入监听
    const importInput = document.getElementById('import-file-input');
    if(importInput) importInput.addEventListener('change', handleImport);

    // 视窗调整监听
    window.addEventListener('resize', () => { render(); });
});
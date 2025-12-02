import { initSupabase, loadData, saveData, exportConfig, importConfig, handleImport } from './api.js';
import { initAuth, handleLogin, handleRegister, handleLogout, handleOAuthLogin, savePreferences } from './auth.js';
import { i18n } from './i18n.js';
import {
    render, toggleEditMode, initSwiper, saveBookmark, deleteBookmark, openModal, closeModal,
    addPage, deletePage, openPageEditModal, closePageEditModal, renderPageList,
    initTheme, changeTheme, quickChangeTheme, openThemeControls, closeThemeControls,
    openPrefModal, switchAvatarTab, handleAvatarFile, selectNewAvatar, createAvatarSelector,
    autoFillInfo, updatePreview, selectStyle, selectPage, updatePrefNamePreview,
    handleAvatarUrlInput // <--- 新增导入
} from './ui.js';
import { t, showToast, startPillAnimation } from './utils.js';
import { state } from './state.js';

async function loadTemplates() {
    const templates = [
        { id: 'user-dropdown-placeholder', url: 'templates/user_dropdown.html' },
        { id: 'modal-placeholder', url: 'templates/bookmark_modal.html' },
        { id: 'page-edit-modal-placeholder', url: 'templates/page_edit_modal.html' },
        { id: 'pref-modal-placeholder', url: 'templates/pref_modal.html' },
        { id: 'auth-modal-placeholder', url: 'templates/auth_modal.html' }
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
            console.error(`Failed to load template: ${template.url}`, error);
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

    // --- 新增：鼠标悬停触发动画重置 ---
    const userTriggerArea = document.querySelector('.user-trigger-area');
    if (userTriggerArea) {
        userTriggerArea.addEventListener('mouseenter', startPillAnimation);
        userTriggerArea.addEventListener('mousemove', startPillAnimation); // 持续移动也重置
    }

    // ============================================================
    // 🔥 核心修复：挂载所有交互函数到 window
    // ============================================================

    // --- 弹窗逻辑 (重点修复) ---
    window.autoFillInfo = autoFillInfo;
    window.updatePreview = updatePreview;
    window.selectStyle = selectStyle;
    window.selectPage = selectPage;

    // --- 账户 (Auth) ---
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
    window.handleLogout = handleLogout;
    window.handleOAuthLogin = handleOAuthLogin;
    window.savePreferences = savePreferences;

    // --- 菜单与弹窗 ---
    window.toggleAuthModal = () => {
         if (state.currentUser) {
            document.getElementById('user-dropdown').classList.toggle('active');
        } else {
            document.getElementById('auth-modal').classList.remove('hidden');
        }
    };
    window.handleMenuEdit = () => {
        document.getElementById('user-dropdown').classList.remove('active');

        // 新增：移动端拦截逻辑
        if (window.innerWidth < 768) {
            showToast(t("msg_mobile_edit"), "normal");
            return;
        }

        toggleEditMode(true);
    };
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.toggleEditMode = toggleEditMode;

    // --- 书签操作 ---
    window.saveBookmark = saveBookmark;
    window.deleteBookmark = deleteBookmark;

    // --- 页面管理 ---
    window.addPage = addPage;
    window.deletePage = deletePage;
    window.openPageEditModal = openPageEditModal;
    window.closePageEditModal = closePageEditModal;

    // --- 导入导出 ---
    window.importConfig = importConfig;
    window.exportConfig = exportConfig;

    // --- 主题控制 ---
    window.openThemeControls = openThemeControls;
    window.closeThemeControls = closeThemeControls;
    window.quickChangeTheme = quickChangeTheme;
    window.changeTheme = (color, el, pattern) => changeTheme(color, el, pattern);

    // --- 偏好设置 ---
    window.openPrefModal = openPrefModal;
    window.switchAvatarTab = switchAvatarTab;

    // 修改：改用 URL 处理函数
    window.handleAvatarUrlInput = handleAvatarUrlInput;

    window.selectNewAvatar = selectNewAvatar;

    // 【新增】挂载预览更新函数
    window.updatePrefNamePreview = updatePrefNamePreview;

    // --- 语言 ---
    window.changeLanguage = async (lang) => {
        await i18n.loadTranslations(lang);
    };

    window.addEventListener('resize', () => { render(); });

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
import { getSupabase, loadData } from './api.js?v=2.9.38';
import { state } from './state.js?v=2.9.38';
import { showToast, t, startPillAnimation } from './utils.js?v=2.9.38';
import { CONFIG } from './config.js?v=2.9.38';
import { logger } from './logger.js?v=2.9.38';

export async function initAuth() {
    const sb = getSupabase();
    if (!sb) return;
    try {
        const { data: { session } } = await sb.auth.getSession();
        updateUserStatus(session?.user);
    } catch (e) {
        logger.error('getSession failed', e);
    }

    // 【修改点 1】监听 Auth 状态变化时，增加智能判断
    sb.auth.onAuthStateChange((event, session) => {
        const currentUser = state.currentUser;
        const newUser = session?.user;

        let shouldAnimate = true;

        // 如果是“已登录”或“刷新Token”事件，且用户ID一致，说明是 Tab 切换或后台刷新
        // 此时将 shouldAnimate 设为 false，防止图标重新弹出
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && currentUser && newUser && currentUser.id === newUser.id) {
            shouldAnimate = false;
        }

        updateUserStatus(newUser, shouldAnimate);
    });
}

// 【修改点 2】增加 animate 参数，默认值为 true (保持原有行为)
export function updateUserStatus(user, animate = true) {
    state.currentUser = user;

    const userPill = document.getElementById('user-pill');
    const svgIcon = document.getElementById('user-icon-svg');
    const imgIcon = document.getElementById('user-avatar-img');
    const pillText = document.getElementById('user-pill-text');

    const infoPanel = document.getElementById('user-info-panel');
    const menuUserName = document.getElementById('menu-user-name');
    const menuUserEmail = document.getElementById('menu-user-email');
    const menuUserAvatar = document.getElementById('menu-user-avatar');

    // Auth Modal Elements
    const formGroup = document.querySelector('#auth-modal .form-group');
    const socialSection = document.querySelector('.social-login-section');
    const divider = document.querySelector('.auth-divider');
    const loginBtn = document.querySelector('#auth-modal .modal-actions button:not(.primary)');
    const actionBtn = document.querySelector('#auth-modal .modal-actions .primary');
    const modalTitle = document.getElementById('auth-title');

    if (!userPill) return;

    // 【修改点 3】仅当 animate 为 true 时才重置动画
    if (animate) {
        startPillAnimation();
    }

    if (user) {
        userPill.classList.add('logged-in');
        const avatarUrl = user.user_metadata?.avatar_url;

        if (avatarUrl) {
            imgIcon.src = avatarUrl;
            imgIcon.referrerPolicy = 'no-referrer';
            imgIcon.style.display = 'block';
            svgIcon.style.display = 'none';
        } else {
            imgIcon.style.display = 'none';
            svgIcon.style.display = 'block';
            svgIcon.setAttribute('fill', '#333');
        }

        const userName = user.user_metadata?.full_name || user.user_metadata?.display_name || user.email.split('@')[0];
        if (pillText) {
            pillText.innerText = userName;
            pillText.removeAttribute('data-i18n');
        }

        if(infoPanel) infoPanel.classList.remove('hidden');
        if(menuUserName) {
            menuUserName.removeAttribute('data-i18n');
            menuUserName.innerText = userName;
        }
        if(menuUserEmail) menuUserEmail.innerText = user.email;
        if(menuUserAvatar) {
            menuUserAvatar.src = avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${Math.random()}`;
            menuUserAvatar.referrerPolicy = 'no-referrer';
        }

        const currentEmailEl = document.getElementById('current-email');
        if(currentEmailEl) currentEmailEl.innerText = user.email;

        loadData();
    } else {
        userPill.classList.remove('logged-in');

        imgIcon.style.display = 'none';
        svgIcon.style.display = 'block';
        svgIcon.setAttribute('fill', 'white');

        if (pillText) {
            pillText.setAttribute('data-i18n', 'btn_login');
            pillText.innerText = t('btn_login');
        }

        if(formGroup) formGroup.style.display = 'flex';
        if(socialSection) socialSection.style.display = 'flex';
        if(divider) divider.style.display = 'flex';
        if(loginBtn) loginBtn.style.display = 'block';
        if(actionBtn) actionBtn.textContent = t("btn_register");

        if(infoPanel) infoPanel.classList.add('hidden');
        if(menuUserName) {
            menuUserName.setAttribute('data-i18n', 'auth_guest');
            menuUserName.innerText = t("auth_guest");
        }
    }
}

export async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if (!email || !password) {
        showToast(t("msg_input_req"), "error");
        return;
    }

    const sb = getSupabase();
    if (!sb) return showToast(t("msg_sdk_error"), "error");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) showToast(error.message, "error");
    else {
        showToast(t("msg_login_success"), "success");
        document.getElementById('auth-modal').classList.add('hidden');
        if (data && data.user) updateUserStatus(data.user);
    }
}

export async function handleRegister() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    // 默认头像，因为注册界面不再提供选择
    const avatarUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${Math.random().toString(36).substring(2)}`;

    if (!email || !password) {
        showToast(t("msg_input_req"), "error");
        return;
    }

    const sb = getSupabase();
    if (!sb) return showToast(t("msg_sdk_error"), "error");
    try {
        const { data, error } = await sb.auth.signUp({
            email, password,
            options: { data: { avatar_url: avatarUrl } }
        });
        if (error) showToast(error.message, "error");
        else {
            showToast(t("msg_reg_success"), "success");
            document.getElementById('auth-modal').classList.add('hidden');
            if (data && data.user && data.session) updateUserStatus(data.user);
        }
    } catch(e) { showToast(e.message, "error"); }
}


export async function handleLogout() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    document.getElementById('user-dropdown').classList.remove('active');
    showToast(t("msg_logout"), "normal");
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    updateUserStatus(null);
    state.pages = [];
    loadData();
}

export async function handleOAuthLogin(provider) {
    const sb = getSupabase();
    if (!sb) return showToast(t("msg_sdk_error"), "error");
    showToast(t("msg_navigating").replace('{provider}', provider), "normal");
    try {
        const { error } = await sb.auth.signInWithOAuth({
            provider: provider,
            options: {
                redirectTo: window.location.origin,
            }
        });
        if (error) throw error;
    } catch (e) { showToast(e.message, "error"); }
}

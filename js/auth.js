import { getSupabase, loadData } from './api.js';
import { state } from './state.js';
import { showToast, t, startPillAnimation } from './utils.js'; // 引入 startPillAnimation

export async function initAuth() {
    const sb = getSupabase();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    updateUserStatus(session?.user);
    sb.auth.onAuthStateChange((_event, session) => { updateUserStatus(session?.user); });
}

export function updateUserStatus(user) {
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

    // 每次状态更新，重置并启动动画逻辑
    startPillAnimation();

    if (user) {
        userPill.classList.add('logged-in');
        const avatarUrl = user.user_metadata?.avatar_url;

        if (avatarUrl) {
            imgIcon.src = avatarUrl;
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
        if(menuUserAvatar) menuUserAvatar.src = avatarUrl || "https://api.dicebear.com/7.x/notionists/svg?seed=Guest";

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
        if(modalTitle) modalTitle.textContent = t("modal_auth_title");

        if(infoPanel) infoPanel.classList.add('hidden');
        if(menuUserName) {
            menuUserName.setAttribute('data-i18n', 'auth_guest');
            menuUserName.innerText = t("auth_guest");
        }
    }
}

export async function handleLogin(email, password) {
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

export async function handleRegister(email, password, avatarUrl) {
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
    loadData();
}

export async function handleOAuthLogin(provider) {
    const sb = getSupabase();
    if (!sb) return showToast(t("msg_sdk_error"), "error");
    showToast(`Navigating to ${provider}...`, "normal");
    const redirectUrl = window.location.origin + window.location.pathname;
    try {
        const { error } = await sb.auth.signInWithOAuth({
            provider: provider,
            options: {
                redirectTo: redirectUrl,
                queryParams: { access_type: 'offline', prompt: 'consent' }
            }
        });
        if (error) throw error;
    } catch (e) { showToast(e.message, "error"); }
}

export async function savePreferences() {
    const sb = getSupabase();
    if (!sb || !state.currentUser) return;

    if (state.prefAvatarUrl && state.prefAvatarUrl.length > 20000) {
        showToast(t("msg_img_too_large"), "error");
        return;
    }

    const name = document.getElementById('pref-name').value;
    const phone = document.getElementById('pref-phone').value;

    const updates = {
        data: {
            full_name: name,
            phone_number: phone,
            avatar_url: state.prefAvatarUrl
        }
    };

    const btn = document.querySelector('#pref-modal .primary');
    if(btn) {
        btn.textContent = 'Saving...';
        btn.disabled = true;
    }

    try {
        const { data, error } = await sb.auth.updateUser(updates);
        if (error) throw error;

        const { data: refreshData } = await sb.auth.refreshSession();
        updateUserStatus(refreshData.user || data.user);

        showToast(t("msg_save_success"), "success");
        // 关闭时也会触发动画重置
        document.getElementById('pref-modal').classList.add('hidden');
        startPillAnimation();
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        if(btn) {
            btn.textContent = t('btn_save') || 'Save';
            btn.disabled = false;
        }
    }
}
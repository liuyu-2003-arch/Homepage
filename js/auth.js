import { getSupabase, loadData } from './api.js';
import { state } from './state.js';
import { showToast, t, startPillAnimation } from './utils.js';

/**
 * 初始化认证状态
 */
export async function initAuth() {
    const sb = getSupabase();
    if (!sb) return;
    try {
        const { data: { session } } = await sb.auth.getSession();
        updateUserStatus(session?.user);
        sb.auth.onAuthStateChange((_, session) => updateUserStatus(session?.user));
    } catch (e) {
        console.error("Auth init error:", e);
    }
}

// 统一 UI 切换逻辑
window.switchToSignUpView = () => {
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    if (title) title.innerText = "创建新账号";
    if (subtitle) subtitle.innerText = "加入我们，开启个性化体验";

    document.getElementById('signup-specifics')?.classList.remove('hidden');
    document.getElementById('login-actions')?.classList.add('hidden');
    document.getElementById('register-actions')?.classList.remove('hidden');
    document.getElementById('login-footer')?.classList.add('hidden');
    document.getElementById('register-footer')?.classList.remove('hidden');
};

window.switchToLoginView = () => {
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    if (title) title.innerText = "欢迎回来";
    if (subtitle) subtitle.innerText = "登录以同步您的偏好设置";

    document.getElementById('signup-specifics')?.classList.add('hidden');
    document.getElementById('login-actions')?.classList.remove('hidden');
    document.getElementById('register-actions')?.classList.add('hidden');
    document.getElementById('login-footer')?.classList.remove('hidden');
    document.getElementById('register-footer')?.classList.add('hidden');
};

export async function handleLogin(email, password) {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) showToast(error.message, "error");
    else {
        showToast(t("msg_login_success"), "success");
        window.closeAuthModal();
    }
}

export async function handleRegister(email, password, avatarUrl) {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { avatar_url: avatarUrl } }
    });
    if (error) showToast(error.message, "error");
    else {
        showToast(t("msg_reg_success"), "success");
        window.closeAuthModal();
    }
}

export async function handleOAuthLogin(provider) {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.origin + window.location.pathname,
            queryParams: { access_type: 'offline' }
        }
    });
    if (error) showToast(error.message, "error");
}

export function updateUserStatus(user, animate = true) {
    state.currentUser = user;
    const userPill = document.getElementById('user-pill');
    if (!userPill) return;

    const pillText = document.getElementById('user-pill-text');
    const imgIcon = document.getElementById('user-avatar-img');
    const svgIcon = document.getElementById('user-icon-svg');

    if (user) {
        userPill.classList.add('logged-in');
        const avatarUrl = user.user_metadata?.avatar_url;
        if (avatarUrl && imgIcon) {
            imgIcon.src = avatarUrl;
            imgIcon.style.display = 'block';
            if (svgIcon) svgIcon.style.display = 'none';
        }
        if (pillText) {
            pillText.innerText = user.user_metadata?.full_name || user.email.split('@')[0];
        }
        loadData();
    } else {
        userPill.classList.remove('logged-in');
        if (imgIcon) imgIcon.style.display = 'none';
        if (svgIcon) svgIcon.style.display = 'block';
        if (pillText) pillText.innerText = t('btn_login') || "Login";
    }
    if (animate) startPillAnimation();
}

export async function handleLogout() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    window.location.reload();
}

export async function savePreferences() {
    const sb = getSupabase();
    if (!sb || !state.currentUser) return;
    const name = document.getElementById('pref-name')?.value;
    const updates = { data: { full_name: name } };
    const { error } = await sb.auth.updateUser(updates);
    if (error) showToast(error.message, "error");
    else showToast(t("msg_save_success"), "success");
}
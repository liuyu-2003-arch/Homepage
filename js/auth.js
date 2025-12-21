import { getSupabase, loadData } from './api.js';
import { state } from './state.js';
import { showToast, t, startPillAnimation } from './utils.js';

export async function initAuth() {
    const sb = getSupabase();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    updateUserStatus(session?.user);
    sb.auth.onAuthStateChange((event, session) => {
        updateUserStatus(session?.user);
    });
}

// 视图切换函数 (由 main.js 调用或设为全局)
window.switchToSignUpView = () => {
    document.getElementById('auth-title').textContent = t("btn_register") || "Sign Up";
    document.getElementById('signup-specifics').classList.remove('hidden');
    document.getElementById('login-actions').classList.add('hidden');
    document.getElementById('register-actions').classList.remove('hidden');
    document.getElementById('login-footer').classList.add('hidden');
    document.getElementById('register-footer').classList.remove('hidden');
};

window.switchToLoginView = () => {
    document.getElementById('auth-title').textContent = t("btn_login") || "Login";
    document.getElementById('signup-specifics').classList.add('hidden');
    document.getElementById('login-actions').classList.remove('hidden');
    document.getElementById('register-actions').classList.add('hidden');
    document.getElementById('login-footer').classList.remove('hidden');
    document.getElementById('register-footer').classList.add('hidden');
};

export async function handleLogin(email, password) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) showToast(error.message, "error");
    else {
        showToast(t("msg_login_success"), "success");
        window.closeAuthModal();
    }
}

export async function handleRegister(email, password, avatarUrl) {
    const sb = getSupabase();
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
        if (avatarUrl) {
            imgIcon.src = avatarUrl;
            imgIcon.style.display = 'block';
            svgIcon.style.display = 'none';
        }
        pillText.innerText = user.user_metadata?.full_name || user.email.split('@')[0];
        loadData();
    } else {
        userPill.classList.remove('logged-in');
        imgIcon.style.display = 'none';
        svgIcon.style.display = 'block';
        pillText.innerText = t('btn_login');
    }
    if (animate) startPillAnimation();
}

export async function handleLogout() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    location.reload(); // 退出时刷新页面清空状态最稳妥
}

export async function savePreferences() {
    // 保持原有 savePreferences 逻辑...
}
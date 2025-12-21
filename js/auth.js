import { getSupabase, loadData } from './api.js';
import { state } from './state.js';
import { showToast, t, startPillAnimation } from './utils.js';

/**
 * 初始化认证状态
 */
export async function initAuth() {
    const sb = getSupabase();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    updateUserStatus(session?.user);

    sb.auth.onAuthStateChange((event, session) => {
        updateUserStatus(session?.user);
    });
}

// --- 全局暴露函数：解决 HTML onclick 访问不到模块函数的问题 ---

window.closeAuthModal = () => {
    document.getElementById('auth-modal').classList.add('hidden');
};

window.switchToSignUpView = () => {
    document.getElementById('auth-title').textContent = t("btn_register") || "创建账号";
    document.getElementById('signup-specifics').classList.remove('hidden');
    document.getElementById('login-actions').classList.add('hidden');
    document.getElementById('register-actions').classList.remove('hidden');
    document.getElementById('login-footer').classList.add('hidden');
    document.getElementById('register-footer').classList.remove('hidden');
};

window.switchToLoginView = () => {
    document.getElementById('auth-title').textContent = t("btn_login") || "欢迎回来";
    document.getElementById('signup-specifics').classList.add('hidden');
    document.getElementById('login-actions').classList.remove('hidden');
    document.getElementById('register-actions').classList.add('hidden');
    document.getElementById('login-footer').classList.remove('hidden');
    document.getElementById('register-footer').classList.add('hidden');
};

window.handleLogin = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return showToast("请填写完整信息", "error");

    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) showToast(error.message, "error");
    else {
        showToast(t("msg_login_success"), "success");
        window.closeAuthModal();
    }
};

/**
 * 优化后的 OAuth 登录 (Google/GitHub)
 * 删除了 prompt 参数，实现“一键顺滑登录”
 */
window.handleOAuthLogin = async (provider) => {
    const sb = getSupabase();
    if (!sb) return;
    const redirectUrl = window.location.origin + window.location.pathname;

    const { error } = await sb.auth.signInWithOAuth({
        provider: provider,
        options: {
            redirectTo: redirectUrl,
            // 不设置 prompt: 'consent'，如果用户授权过，会直接跳回应用
            queryParams: { access_type: 'offline' }
        }
    });
    if (error) showToast(error.message, "error");
};

// 更新 UI 状态
export function updateUserStatus(user, animate = true) {
    state.currentUser = user;
    const userPill = document.getElementById('user-pill');
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
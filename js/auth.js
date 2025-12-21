import { getSupabase, loadData } from './api.js';
import { state } from './state.js';
import { showToast, t, startPillAnimation } from './utils.js';

// 初始化
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

// --- 切换到 注册 视图 ---
// 优化：隐藏社交登录，显示头像选择，更新文案
window.switchToSignUpView = () => {
    document.getElementById('auth-title').innerText = "创建账号";
    document.getElementById('auth-subtitle').innerText = "选择一个头像开启您的旅程";

    document.getElementById('signup-specifics')?.classList.remove('hidden');
    document.getElementById('login-actions')?.classList.add('hidden');
    document.getElementById('register-actions')?.classList.remove('hidden');

    document.getElementById('login-footer')?.classList.add('hidden');
    document.getElementById('register-footer')?.classList.remove('hidden');

    // 注册时隐藏社交登录，保持界面干净
    document.getElementById('social-login-container')?.classList.add('hidden');
};

// --- 切换到 登录 视图 ---
window.switchToLoginView = () => {
    document.getElementById('auth-title').innerText = "欢迎回来";
    document.getElementById('auth-subtitle').innerText = "登录以同步您的书签与设置";

    document.getElementById('signup-specifics')?.classList.add('hidden');
    document.getElementById('login-actions')?.classList.remove('hidden');
    document.getElementById('register-actions')?.classList.add('hidden');

    document.getElementById('login-footer')?.classList.remove('hidden');
    document.getElementById('register-footer')?.classList.add('hidden');

    // 登录时显示社交登录
    document.getElementById('social-login-container')?.classList.remove('hidden');
};

// --- 登录逻辑 ---
export async function handleLogin(email, password) {
    const sb = getSupabase();
    if (!sb) return;

    // 支持按回车提交，若未传参则从DOM获取
    if (!email || !password) {
        email = document.getElementById('auth-email')?.value;
        password = document.getElementById('auth-password')?.value;
    }

    if (!email || !password) return showToast("请输入邮箱和密码", "error");

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) showToast(error.message, "error");
    else {
        showToast(t("msg_login_success"), "success");
        window.closeAuthModal();
    }
}

// --- 注册逻辑 ---
export async function handleRegister(email, password, avatarUrl) {
    const sb = getSupabase();
    if (!sb) return;

    if (!email || !password) {
        email = document.getElementById('auth-email')?.value;
        password = document.getElementById('auth-password')?.value;
    }

    if (!email || !password) return showToast("请输入邮箱和密码", "error");

    const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { avatar_url: avatarUrl } }
    });

    if (error) showToast(error.message, "error");
    else {
        showToast("注册成功！请检查邮箱确认链接", "success");
        window.closeAuthModal();
    }
}

// --- OAuth 第三方登录 (优化版：点击即跳) ---
export async function handleOAuthLogin(provider) {
    const sb = getSupabase();
    if (!sb) return;

    const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.origin + window.location.pathname,
            // 关键优化：移除 prompt 参数
            queryParams: { access_type: 'offline' }
        }
    });
    if (error) showToast(error.message, "error");
}

// --- 状态更新 ---
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

// --- 登出 ---
export async function handleLogout() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    window.location.reload();
}

// --- 保存偏好设置 ---
export async function savePreferences() {
    const sb = getSupabase();
    if (!sb || !state.currentUser) return;
    const name = document.getElementById('pref-name')?.value;
    const { error } = await sb.auth.updateUser({ data: { full_name: name } });
    if (error) showToast(error.message, "error");
    else showToast(t("msg_save_success"), "success");
}
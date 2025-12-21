import { getSupabase, loadData } from './api.js';
import { state } from './state.js';
import { showToast, t, startPillAnimation } from './utils.js';

export async function initAuth() {
    const sb = getSupabase();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    updateUserStatus(session?.user);
    sb.auth.onAuthStateChange((_, session) => updateUserStatus(session?.user));
}

// 统一 UI 切换逻辑 (确保 main.js 中不要重复定义)
window.switchToSignUpView = () => {
    document.getElementById('auth-title').innerText = "创建新账号";
    document.getElementById('auth-subtitle').innerText = "加入我们，开启个性化体验";
    document.getElementById('signup-specifics').classList.remove('hidden');
    document.getElementById('login-actions').classList.add('hidden');
    document.getElementById('register-actions').classList.remove('hidden');
    document.getElementById('login-footer').classList.add('hidden');
    document.getElementById('register-footer').classList.remove('hidden');
};

window.switchToLoginView = () => {
    document.getElementById('auth-title').innerText = "欢迎回来";
    document.getElementById('auth-subtitle').innerText = "登录以同步您的偏好设置";
    document.getElementById('signup-specifics').classList.add('hidden');
    document.getElementById('login-actions').classList.remove('hidden');
    document.getElementById('register-actions').classList.add('hidden');
    document.getElementById('login-footer').classList.remove('hidden');
    document.getElementById('register-footer').classList.add('hidden');
};

/**
 * 优化后的 OAuth：移除 prompt，实现一键登录
 */
window.handleOAuthLogin = async (provider) => {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.origin + window.location.pathname,
            // 确保不携带 prompt: 'consent'
            queryParams: { access_type: 'offline' }
        }
    });
    if (error) showToast(error.message, "error");
};

// ... 原有的 handleLogin, handleRegister, updateUserStatus 保持不变 ...
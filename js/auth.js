import { getSupabase, loadData } from './api.js';
import { state } from './state.js';
import { showToast, t, startPillAnimation } from './utils.js';

let isSignUp = false;

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

// 切换 登录/注册 模式
window.toggleAuthMode = () => {
    isSignUp = !isSignUp;
    const title = document.getElementById('auth-title');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchText = document.getElementById('switch-text');
    const switchAction = document.getElementById('switch-action');
    const errorMsg = document.getElementById('auth-error');

    // 重置状态
    if (errorMsg) {
        errorMsg.classList.remove('show');
        errorMsg.innerText = '';
    }

    if (isSignUp) {
        title.innerText = "Create Account";
        submitBtn.innerText = "Create Account";
        switchText.innerText = "Already have an account? ";
        switchAction.innerText = "Sign In";
    } else {
        title.innerText = "Sign In";
        submitBtn.innerText = "Sign In";
        switchText.innerText = "Don't have an account? ";
        switchAction.innerText = "Sign Up";
    }
};

window.switchToSignUpView = () => { if(!isSignUp) window.toggleAuthMode(); };
window.switchToLoginView = () => { if(isSignUp) window.toggleAuthMode(); };

// 统一提交处理
window.handleAuthSubmit = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const submitBtn = document.getElementById('auth-submit-btn');
    const errorMsg = document.getElementById('auth-error');

    if (!email || !password) {
        showError("Please enter both email and password.");
        return;
    }

    const originalText = submitBtn.innerText;
    submitBtn.innerText = "Processing...";
    submitBtn.disabled = true;
    errorMsg.classList.remove('show');

    try {
        if (isSignUp) {
            await handleRegister(email, password);
        } else {
            await handleLogin(email, password);
        }
    } catch (err) {
        // Error handled in functions
    } finally {
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
    }
};

function showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) {
        el.innerText = msg;
        el.classList.add('show');
    } else {
        showToast(msg, "error");
    }
}

export async function handleLogin(email, password) {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        showError(error.message);
    } else {
        showToast(t("msg_login_success"), "success");
        window.closeAuthModal();
    }
}

export async function handleRegister(email, password) {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.auth.signUp({
        email, password
    });
    if (error) {
        showError(error.message);
    } else {
        showToast("Check your email for confirmation!", "success");
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
        if (pillText) pillText.innerText = user.user_metadata?.full_name || user.email.split('@')[0];
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
    const { error } = await sb.auth.updateUser({ data: { full_name: name } });
    if (error) showToast(error.message, "error");
    else showToast(t("msg_save_success"), "success");
}
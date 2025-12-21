import { getSupabase, loadData } from './api.js';
import { state } from './state.js';
import { showToast, t, startPillAnimation } from './utils.js';

export async function initAuth() {
    const sb = getSupabase();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    updateUserStatus(session?.user);
    sb.auth.onAuthStateChange((_, session) => {
        updateUserStatus(session?.user);
    });
}

export function updateUserStatus(user) {
    state.currentUser = user;
    const userPill = document.getElementById('user-pill');
    const svgIcon = document.getElementById('user-icon-svg');
    const imgIcon = document.getElementById('user-avatar-img');
    const pillText = document.getElementById('user-pill-text');

    if (!userPill) return;

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
        }

        const userName = user.user_metadata?.full_name || user.user_metadata?.display_name || user.email.split('@')[0];
        if (pillText) {
            pillText.innerText = userName;
            pillText.removeAttribute('data-i18n');
        }
        loadData();
    } else {
        userPill.classList.remove('logged-in');
        imgIcon.style.display = 'none';
        svgIcon.style.display = 'block';
        if (pillText) {
            pillText.setAttribute('data-i18n', 'btn_login');
            pillText.innerText = t('btn_login');
        }
    }
}

export async function handleLogin() {
    const sb = getSupabase();
    if (!sb) return showToast(t("msg_sdk_error"), "error");
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) showToast(error.message, "error");
    else {
        showToast(t("msg_login_success"), "success");
        document.getElementById('auth-modal').classList.add('hidden');
    }
}

export async function handleRegister() {
    const sb = getSupabase();
    if (!sb) return showToast(t("msg_sdk_error"), "error");
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const avatarUrl = state.selectedAvatarUrl;
    try {
        const { data, error } = await sb.auth.signUp({
            email, password,
            options: { data: { avatar_url: avatarUrl } }
        });
        if (error) throw error;
        showToast(t("msg_reg_success"), "success");
        document.getElementById('auth-modal').classList.add('hidden');
    } catch(e) { showToast(e.message, "error"); }
}

export async function handleLogout() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    document.getElementById('user-dropdown').classList.remove('active');
    showToast(t("msg_logout"), "normal");
    loadData();
}

export async function handleOAuthLogin(provider) {
    const sb = getSupabase();
    if (!sb) return showToast(t("msg_sdk_error"), "error");
    const { error } = await sb.auth.signInWithOAuth({ provider });
    if (error) showToast(error.message, "error");
}

export async function savePreferences() {
    const sb = getSupabase();
    if (!sb || !state.currentUser) return;

    const name = document.getElementById('pref-name').value;
    const phoneCode = document.getElementById('pref-phone-code').value;
    const phoneNumber = document.getElementById('pref-phone-number').value;
    const fullPhone = phoneNumber ? (phoneCode + phoneNumber) : '';

    const updates = {
        data: {
            full_name: name,
            phone_number: fullPhone,
            avatar_url: state.prefAvatarUrl
        }
    };

    const { data, error } = await sb.auth.updateUser(updates);
    if (error) {
        showToast(error.message, "error");
    } else {
        showToast(t("msg_save_success"), "success");
        updateUserStatus(data.user);
        document.getElementById('pref-modal').classList.add('hidden');
    }
}

export function switchToSignUpView() {
    document.getElementById('auth-title').innerText = 'Create Account';
    document.getElementById('login-actions').classList.add('hidden');
    document.getElementById('register-actions').classList.remove('hidden');
    document.getElementById('social-login-container').classList.add('hidden');
    document.getElementById('login-footer').classList.add('hidden');
    document.getElementById('register-footer').classList.remove('hidden');
    document.getElementById('signup-specifics').classList.remove('hidden');
}

export function switchToLoginView() {
    document.getElementById('auth-title').innerText = 'Sign In';
    document.getElementById('login-actions').classList.remove('hidden');
    document.getElementById('register-actions').classList.add('hidden');
    document.getElementById('social-login-container').classList.remove('hidden');
    document.getElementById('login-footer').classList.remove('hidden');
    document.getElementById('register-footer').classList.add('hidden');
    document.getElementById('signup-specifics').classList.add('hidden');
}
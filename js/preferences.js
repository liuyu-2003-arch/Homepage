import { CONFIG } from './config.js';
import { state } from './state.js';
import { showToast, t, safeUrl } from './utils.js';
import { i18n } from './i18n.js';
import { logger } from './logger.js';

let supabaseClient = null;
let prefAvatarUrl = '';

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.loadTranslations(i18n.currentLang);

    if (window.supabase && window.supabase.createClient) {
        try {
            supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
        } catch (e) {
            logger.error('Supabase init error', e);
        }
    }

    if (!supabaseClient) { location.href = 'index.html'; return; }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
            state.currentUser = session.user;
            populateForm(session.user);
            renderAvatarGrid(prefAvatarUrl);
        } else {
            location.href = 'index.html';
        }
    } catch (e) {
        logger.error('Auth check failed', e);
        location.href = 'index.html';
    }
});

function populateForm(user) {
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.display_name || (user.email ? user.email.split('@')[0] : '');

    document.getElementById('pref-name').value = meta.full_name || meta.display_name || '';
    document.getElementById('pref-preview-name').innerText = name || 'Display Name';

    // Phone
    const fullPhone = meta.phone_number || meta.phone || '';
    const codeSelect = document.getElementById('pref-phone-code');
    const numberInput = document.getElementById('pref-phone-number');
    if (fullPhone) {
        let foundCode = '';
        const options = Array.from(codeSelect.options).map(o => o.value).sort((a, b) => b.length - a.length);
        for (const code of options) {
            if (fullPhone.startsWith(code)) { foundCode = code; break; }
        }
        codeSelect.value = foundCode || '+86';
        numberInput.value = foundCode ? fullPhone.slice(foundCode.length) : fullPhone;
    }

    // Avatar
    prefAvatarUrl = meta.avatar_url || `https://api.dicebear.com/9.x/shapes/svg?seed=${Math.random()}`;
    const img = document.getElementById('pref-current-img');
    img.referrerPolicy = 'no-referrer';
    img.src = prefAvatarUrl;
}

window.switchAvatarTab = function(tabName) {
    document.querySelectorAll('.tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tabName);
    });
    document.getElementById('panel-emoji').style.display = tabName === 'emoji' ? 'block' : 'none';
    document.getElementById('panel-upload').classList.toggle('active', tabName === 'upload');
};

window.handleAvatarUrlInput = function(url) {
    prefAvatarUrl = url;
    const safe = safeUrl(url);
    const img = document.getElementById('pref-current-img');
    img.src = safe || `https://api.dicebear.com/9.x/shapes/svg?seed=${Math.random()}`;
    document.querySelectorAll('.grid-item').forEach(i => i.classList.remove('selected'));
};

function selectAvatar(el, url) {
    document.querySelectorAll('.grid-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    prefAvatarUrl = url;
    document.getElementById('pref-current-img').src = url;
}

function renderAvatarGrid(currentUrl) {
    const container = document.getElementById('pref-avatar-grid');
    if (!container) return;
    container.innerHTML = '';

    const styles = ['shapes', 'identicon', 'bottts', 'avataaars', 'fun-emoji', 'notionists', 'thumbs', 'adventurer', 'big-ears', 'big-smile', 'croodles', 'lorelei'];

    styles.forEach((style) => {
        for (let i = 0; i < 3; i++) {
            const seed = `${style}-${Math.random().toString(36).slice(2, 8)}`;
            const url = `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
            const div = document.createElement('div');
            div.className = 'grid-item';
            div.title = style;

            const img = document.createElement('img');
            img.referrerPolicy = 'no-referrer';
            img.loading = 'lazy';
            img.alt = style;
            img.src = url;

            div.appendChild(img);
            div.addEventListener('click', () => selectAvatar(div, url));
            container.appendChild(div);
        }
    });
}

window.updatePrefNamePreview = function(value) {
    const el = document.getElementById('pref-preview-name');
    if (el) el.innerText = value || 'Display Name';
};

window.savePreferences = async function() {
    if (!supabaseClient || !state.currentUser) {
        showToast(t('msg_please_login'), 'error');
        return;
    }
    if (prefAvatarUrl && prefAvatarUrl.length > CONFIG.MAX_AVATAR_URL_LENGTH) {
        showToast(t('msg_img_too_large'), 'error');
        return;
    }

    const name = document.getElementById('pref-name').value;
    const phoneCode = document.getElementById('pref-phone-code').value;
    const phoneNumber = document.getElementById('pref-phone-number').value;
    const fullPhone = phoneNumber ? phoneCode + phoneNumber : '';

    if (phoneNumber && !/^\d+$/.test(phoneNumber)) {
        showToast(t('msg_invalid_phone'), 'error');
        return;
    }

    const btn = document.getElementById('btn-save');
    if (btn) { btn.textContent = t('msg_saving'); btn.disabled = true; }

    try {
        const { error } = await supabaseClient.auth.updateUser({
            data: { full_name: name, phone_number: fullPhone, avatar_url: prefAvatarUrl }
        });
        if (error) throw error;
        showToast(t('msg_save_success'), 'success');
        setTimeout(() => location.href = 'index.html', 800);
    } catch (e) {
        logger.error('Save failed', e);
        showToast(e.message || t('msg_save_fail'), 'error');
    } finally {
        if (btn) { btn.textContent = t('btn_save'); btn.disabled = false; }
    }
};

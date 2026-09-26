import { CONFIG } from './config.js';
import { state } from './state.js';
import { showToast, t, safeUrl } from './utils.js';
import { i18n } from './i18n.js';
import { logger } from './logger.js';

let supabaseClient = null;
let prefAvatarUrl = '';

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    await i18n.loadTranslations(i18n.currentLang);

    // Init Supabase
    if (window.supabase && window.supabase.createClient) {
        try {
            supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
        } catch (e) {
            logger.error('Supabase init error', e);
        }
    }

    // Check auth
    if (supabaseClient) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session?.user) {
                state.currentUser = session.user;
                populateForm(session.user);
            } else {
                location.href = 'index.html';
                return;
            }
        } catch (e) {
            logger.error('Auth check failed', e);
            location.href = 'index.html';
            return;
        }
    } else {
        location.href = 'index.html';
        return;
    }

    renderAvatarGrid(prefAvatarUrl);
});

function populateForm(user) {
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.display_name || (user.email ? user.email.split('@')[0] : '');

    document.getElementById('pref-name').value = meta.full_name || meta.display_name || '';

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
        if (foundCode) {
            codeSelect.value = foundCode;
            numberInput.value = fullPhone.slice(foundCode.length);
        } else {
            codeSelect.value = '+86';
            numberInput.value = fullPhone;
        }
    } else {
        codeSelect.value = '+86';
    }

    // Avatar
    const currentAvatar = meta.avatar_url || `https://api.dicebear.com/9.x/shapes/svg?seed=${Math.random()}`;
    const img = document.getElementById('pref-current-img');
    img.src = currentAvatar;
    img.referrerPolicy = 'no-referrer';

    document.getElementById('pref-preview-name').innerText = name;
    prefAvatarUrl = currentAvatar;
}

// --- Avatar tab switching ---
window.switchAvatarTab = function(tabName) {
    document.querySelectorAll('.avatar-tab-item').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tabName);
    });
    document.getElementById('avatar-panel-emoji').classList.toggle('hidden', tabName !== 'emoji');
    document.getElementById('avatar-panel-upload').classList.toggle('hidden', tabName !== 'upload');
};

// --- Avatar URL input ---
window.handleAvatarUrlInput = function(url) {
    prefAvatarUrl = url;
    const safe = safeUrl(url);
    const img = document.getElementById('pref-current-img');
    img.src = safe || `https://api.dicebear.com/9.x/shapes/svg?seed=${Math.random()}`;
    document.querySelectorAll('.avatar-option').forEach(item => item.classList.remove('selected'));
};

// --- Select avatar from grid ---
function selectAvatar(el, url) {
    document.querySelectorAll('.avatar-option').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    prefAvatarUrl = url;
    const img = document.getElementById('pref-current-img');
    img.src = url;
}

// --- Render avatar grid ---
function renderAvatarGrid(currentUrl) {
    const container = document.getElementById('pref-avatar-grid');
    container.innerHTML = '';
    const styles = [
        { style: 'shapes', label: 'Shapes' },
        { style: 'identicon', label: 'Identicon' },
        { style: 'bottts', label: 'Bottts' },
        { style: 'avataaars', label: 'Avataaars' },
        { style: 'fun-emoji', label: 'Emoji' },
        { style: 'notionists', label: 'Notionists' },
        { style: 'thumbs', label: 'Thumbs' },
        { style: 'adventurer', label: 'Adventurer' },
        { style: 'big-ears', label: 'Big Ears' },
        { style: 'big-smile', label: 'Big Smile' },
        { style: 'croodles', label: 'Croodles' },
        { style: 'lorelei', label: 'Lorelei' },
    ];

    styles.forEach(({ style }) => {
        for (let i = 0; i < 3; i++) {
            const seed = `${style}-${Math.random()}`;
            const url = `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
            const div = document.createElement('div');
            div.className = 'avatar-option';
            div.title = style;

            const img = document.createElement('img');
            img.referrerPolicy = 'no-referrer';
            img.loading = 'lazy';
            img.src = url;
            img.alt = style;

            div.appendChild(img);
            div.addEventListener('click', () => selectAvatar(div, url));
            if (currentUrl && url === currentUrl) div.classList.add('selected');
            container.appendChild(div);
        }
    });
}

// --- Update preview name ---
window.updatePrefNamePreview = function(value) {
    const el = document.getElementById('pref-preview-name');
    if (el) el.innerText = value || 'Display Name';
};

// --- Save preferences ---
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

    const updates = {
        data: {
            full_name: name,
            phone_number: fullPhone,
            avatar_url: prefAvatarUrl
        }
    };

    const btn = document.getElementById('btn-save');
    if (btn) {
        btn.textContent = t('msg_saving');
        btn.disabled = true;
    }

    try {
        const { error } = await supabaseClient.auth.updateUser(updates);
        if (error) throw error;
        showToast(t('msg_save_success'), 'success');
        setTimeout(() => location.href = 'index.html', 800);
    } catch (e) {
        logger.error('Save failed', e);
        showToast(e.message || t('msg_save_fail'), 'error');
    } finally {
        if (btn) {
            btn.textContent = t('btn_save');
            btn.disabled = false;
        }
    }
};

import { CONFIG } from './config.js';
import { state } from './state.js';
import { showToast, t, safeUrl } from './utils.js';
import { i18n } from './i18n.js';
import { logger } from './logger.js';

let supabaseClient = null;
window.prefAvatarUrl = window.prefAvatarUrl || '';

// Event delegation for data-action
const PREF_ACTIONS = {
    navigate: (el) => location.href = el.dataset.arg,
    switchAvatarTab: (el) => window.switchAvatarTab(el.dataset.arg),
    handleAvatarUrlInput: (el) => window.handleAvatarUrlInput(el.value),
    updatePrefNamePreview: (el) => window.updatePrefNamePreview(el.value),
    savePreferences: () => window.savePreferences(),
};
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = PREF_ACTIONS[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-action][data-input]');
    if (el) {
        const fn = PREF_ACTIONS[el.dataset.action];
        if (fn) fn(el, e);
    }
    const filterEl = e.target.closest('[data-filter="digits"]');
    if (filterEl) filterEl.value = filterEl.value.replace(/\D/g, '');
});

// Render avatar grid immediately (module runs after DOM parsing)
renderAvatarGrid();

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
    const img = document.getElementById('pref-current-img');
    img.referrerPolicy = 'no-referrer';
    if (meta.avatar_url) {
        window.prefAvatarUrl = meta.avatar_url;
        img.style.display = 'block';
        img.src = meta.avatar_url;
    } else {
        const h = Math.floor(Math.random() * 360);
        window.prefAvatarUrl = `avatar-default-${h}`;
        img.style.display = 'none';
        img.parentElement.style.background = `linear-gradient(135deg, hsl(${h},70%,65%), hsl(${(h+40)%360},70%,55%))`;
    }
}

window.switchAvatarTab = function(tabName) {
    document.querySelectorAll('.tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tabName);
    });
    document.getElementById('panel-emoji').style.display = tabName === 'emoji' ? 'block' : 'none';
    document.getElementById('panel-upload').style.display = tabName === 'upload' ? 'block' : 'none';
};

window.handleAvatarUrlInput = function(url) {
    const safe = safeUrl(url);
    window.prefAvatarUrl = safe || '';
    const img = document.getElementById('pref-current-img');
    if (safe) {
        img.style.display = 'block';
        img.src = safe;
    } else {
        const h = Math.floor(Math.random() * 360);
        img.style.display = 'none';
        img.parentElement.style.background = `linear-gradient(135deg, hsl(${h},70%,65%), hsl(${(h+40)%360},70%,55%))`;
    }
    document.querySelectorAll('.grid-item').forEach(i => i.classList.remove('selected'));
};

function selectAvatar(el, url, c1, c2) {
    document.querySelectorAll('.grid-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    window.prefAvatarUrl = url;
    const img = document.getElementById('pref-current-img');
    if (c1 && c2) {
        img.style.display = 'none';
        img.parentElement.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
        img.parentElement.dataset.avatarId = url;
    } else {
        img.style.display = 'block';
        img.src = url;
    }
}

function renderAvatarGrid() {
    const container = document.getElementById('pref-avatar-grid');
    if (!container) return;
    container.innerHTML = '';
    const styles = ['shapes','identicon','bottts','avataaars','fun-emoji','notionists','thumbs','adventurer','big-ears','big-smile','croodles','lorelei'];
    for (let i = 0; i < 36; i++) {
        const style = styles[i % styles.length];
        const url = `https://api.dicebear.com/9.x/${style}/svg?seed=${style}-${i + 1}`;
        const d = document.createElement('div');
        d.className = 'grid-item';
        d.style.background = '#e8e8e8';
        const img = document.createElement('img');
        img.referrerPolicy = 'no-referrer';
        img.loading = 'eager';
        img.alt = style;
        img.src = url;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        d.appendChild(img);
        d.addEventListener('click', () => {
            document.querySelectorAll('.grid-item').forEach(x => x.classList.remove('selected'));
            d.classList.add('selected');
            const pi = document.getElementById('pref-current-img');
            if (pi) {
                pi.style.display = 'block';
                pi.src = url;
                pi.parentElement.style.background = '';
            }
            window.prefAvatarUrl = url;
        });
        container.appendChild(d);
    }
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
    if (window.prefAvatarUrl && window.prefAvatarUrl.length > CONFIG.MAX_AVATAR_URL_LENGTH) {
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
            data: { full_name: name, phone_number: fullPhone, avatar_url: window.prefAvatarUrl }
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

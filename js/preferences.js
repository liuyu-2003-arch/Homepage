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
    prefAvatarUrl = meta.avatar_url || generateDefaultAvatar();
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
    img.src = safe || generateDefaultAvatar();
    document.querySelectorAll('.grid-item').forEach(i => i.classList.remove('selected'));
};

function selectAvatar(el, url) {
    document.querySelectorAll('.grid-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    prefAvatarUrl = url;
    document.getElementById('pref-current-img').src = url;
}

function generateDefaultAvatar() {
    const hue = Math.floor(Math.random() * 360);
    return `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
            <defs><linearGradient id="dg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="hsl(${hue},70%,65%)"/><stop offset="100%" stop-color="hsl(${(hue+40)%360},70%,55%)"/>
            </linearGradient></defs>
            <rect width="64" height="64" rx="16" fill="url(#dg)"/>
            <circle cx="32" cy="26" r="10" fill="rgba(255,255,255,0.85)"/>
            <ellipse cx="32" cy="50" rx="16" ry="12" fill="rgba(255,255,255,0.85)"/>
        </svg>`
    )}`;
}

function renderAvatarGrid(currentUrl) {
    const container = document.getElementById('pref-avatar-grid');
    if (!container) return;
    container.innerHTML = '';

    const palettes = [
        ['#FF6B6B','#EE5A24'], ['#54A0FF','#5F27CD'], ['#00D2D3','#01A3A4'],
        ['#FF9FF3','#F368E0'], ['#54A0FF','#2E86DE'], ['#5F27CD','#341f97'],
        ['#FF6348','#eb4d4b'], ['#1DD1A1','#10ac84'], ['#FECA57','#ff9f43'],
        ['#54A0FF','#48dbfb'], ['#FF6B6B','#fc5c65'], ['#00D2D3','#0abde3'],
        ['#A29BFE','#6c5ce7'], ['#FD79A8','#e84393'], ['#FDCB6E','#f39c12'],
        ['#6C5CE7','#a29bfe'], ['#00B894','#00cec9'], ['#E17055','#d35400'],
        ['#74B9FF','#0984e3'], ['#81ECEC','#00cec9'], ['#DFE6E9','#b2bec3'],
        ['#FAB1A0','#e17055'], ['#55E6C1','#1abc9c'], ['#C44569','#c0392b'],
        ['#786FA6','#574b90'], ['#F8A5C2','#e84393'], ['#63CDDA','#22a6b3'],
        ['#E66767','#c0392b'], ['#778BEB','#3B4CCA'], ['#7DCEA0','#27AE60']
    ];

    const symbols = [
        // circle
        (c) => `<circle cx="32" cy="32" r="14" fill="rgba(255,255,255,0.85)"/>`,
        // square
        (c) => `<rect x="20" y="20" width="24" height="24" rx="4" fill="rgba(255,255,255,0.85)"/>`,
        // triangle
        (c) => `<polygon points="32,18 44,44 20,44" fill="rgba(255,255,255,0.85)"/>`,
        // diamond
        (c) => `<polygon points="32,16 44,32 32,48 20,32" fill="rgba(255,255,255,0.85)"/>`,
        // cross
        (c) => `<rect x="28" y="18" width="8" height="28" rx="3" fill="rgba(255,255,255,0.85)"/><rect x="18" y="28" width="28" height="8" rx="3" fill="rgba(255,255,255,0.85)"/>`,
        // ring
        (c) => `<circle cx="32" cy="32" r="14" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="5"/>`,
    ];

    palettes.forEach((colors, i) => {
        const symbol = symbols[i % symbols.length]();
        const svg = `data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
                <defs><linearGradient id="g${i}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="${colors[1]}"/>
                </linearGradient></defs>
                <rect width="64" height="64" rx="16" fill="url(#g${i})"/>${symbol}
            </svg>`
        )}`;

        const div = document.createElement('div');
        div.className = 'grid-item';
        div.title = `Avatar ${i + 1}`;

        const img = document.createElement('img');
        img.src = svg;
        img.alt = `Avatar ${i + 1}`;

        div.appendChild(img);
        div.addEventListener('click', () => selectAvatar(div, svg));
        container.appendChild(div);
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

import { CONFIG } from './config.js';
import { state } from './state.js';
import { showToast, t, safeUrl } from './utils.js';
import { i18n } from './i18n.js';
import { logger } from './logger.js';

let supabaseClient = null;
window.window.prefAvatarUrl = window.window.prefAvatarUrl || '';

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
    document.getElementById('panel-upload').classList.toggle('active', tabName === 'upload');
};

window.handleAvatarUrlInput = function(url) {
    window.prefAvatarUrl = url;
    const safe = safeUrl(url);
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

function renderAvatarGrid(currentUrl) {
    const container = document.getElementById('pref-avatar-grid');
    if (!container) return;
    container.innerHTML = '';

    const colors = [
        ['#FF6B6B','#EE5A24','#54A0FF','#5F27CD','#00D2D3','#01A3A4'],
        ['#FF9FF3','#F368E0','#FECA57','#FF9F43','#1DD1A1','#10AC84'],
        ['#A29BFE','#6C5CE7','#FD79A8','#E84393','#FDCB6E','#F39C12'],
        ['#74B9FF','#0984E3','#81ECEC','#00CEC9','#FAB1A0','#E17055'],
        ['#55E6C1','#1ABC9C','#C44569','#C0392B','#786FA6','#574B90'],
        ['#F8A5C2','#E84393','#63CDDA','#22A6B3','#E66767','#C0392B']
    ];
    const symbols = ['circle','square','triangle','diamond','ring','cross'];
    const n = 30;

    for (let i = 0; i < n; i++) {
        const c1 = colors[Math.floor(i / 5)][i % 5];
        const c2 = colors[Math.floor(i / 5)][(i % 5 + 1) % 5];
        const sym = symbols[i % symbols.length];

        const div = document.createElement('div');
        div.className = 'grid-item';
        div.title = 'Avatar ' + (i + 1);
        div.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;

        // Add symbol overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 64 64');
        svg.setAttribute('width', '60%');
        svg.setAttribute('height', '60%');
        svg.style.flexShrink = '0';

        const shape = document.createElementNS(svgNS, sym === 'circle' ? 'circle' :
            sym === 'square' ? 'rect' :
            sym === 'triangle' ? 'polygon' :
            sym === 'diamond' ? 'polygon' :
            sym === 'ring' ? 'circle' : 'g');

        if (sym === 'circle') {
            shape.setAttribute('cx', '32'); shape.setAttribute('cy', '32'); shape.setAttribute('r', '16');
            shape.setAttribute('fill', 'rgba(255,255,255,0.8)');
        } else if (sym === 'square') {
            shape.setAttribute('x', '18'); shape.setAttribute('y', '18');
            shape.setAttribute('width', '28'); shape.setAttribute('height', '28');
            shape.setAttribute('rx', '5');
            shape.setAttribute('fill', 'rgba(255,255,255,0.8)');
        } else if (sym === 'triangle') {
            shape.setAttribute('points', '32,16 46,46 18,46');
            shape.setAttribute('fill', 'rgba(255,255,255,0.8)');
        } else if (sym === 'diamond') {
            shape.setAttribute('points', '32,14 48,32 32,50 16,32');
            shape.setAttribute('fill', 'rgba(255,255,255,0.8)');
        } else if (sym === 'ring') {
            shape.setAttribute('cx', '32'); shape.setAttribute('cy', '32'); shape.setAttribute('r', '15');
            shape.setAttribute('fill', 'none');
            shape.setAttribute('stroke', 'rgba(255,255,255,0.8)');
            shape.setAttribute('stroke-width', '6');
        } else {
            const r1 = document.createElementNS(svgNS, 'rect');
            r1.setAttribute('x', '28'); r1.setAttribute('y', '16');
            r1.setAttribute('width', '8'); r1.setAttribute('height', '32'); r1.setAttribute('rx', '3');
            r1.setAttribute('fill', 'rgba(255,255,255,0.8)');
            const r2 = document.createElementNS(svgNS, 'rect');
            r2.setAttribute('x', '16'); r2.setAttribute('y', '28');
            r2.setAttribute('width', '32'); r2.setAttribute('height', '8'); r2.setAttribute('rx', '3');
            r2.setAttribute('fill', 'rgba(255,255,255,0.8)');
            shape.appendChild(r1); shape.appendChild(r2);
        }

        svg.appendChild(shape);
        overlay.appendChild(svg);
        div.appendChild(overlay);

        const avatarData = `avatar-${i}-${c1}`;
        div.addEventListener('click', () => selectAvatar(div, avatarData, c1, c2));
        container.appendChild(div);
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

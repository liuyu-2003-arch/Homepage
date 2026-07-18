import { CONFIG } from './config.js';
import { state } from './state.js';
import { generateUniqueId, updateSyncStatus, showToast, t } from './utils.js';
import { render } from './ui.js';
import { logger } from './logger.js';

let supabaseClient = null;
let saveQueue = Promise.resolve();
let latestSaveVersion = 0;

const LEGACY_STORAGE_KEY = 'pagedData';
const GUEST_STORAGE_KEY = 'pagedData:guest';
const MAX_IMPORT_SIZE = 2 * 1024 * 1024;

function getStorageKey(userId = state.currentUser?.id) {
    return userId ? `pagedData:user:${userId}` : GUEST_STORAGE_KEY;
}

function readCachedPages(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        logger.error('Failed to read cached bookmarks', error);
        return null;
    }
}

function writeCachedPages(key, pages) {
    try {
        localStorage.setItem(key, JSON.stringify(pages));
    } catch (error) {
        logger.error('Failed to cache bookmarks locally', error);
        showToast(t('msg_save_fail'), 'error');
    }
}

export function initSupabase() {
    if (window.supabase && window.supabase.createClient) {
        try {
            supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
        } catch (e) {
            logger.error("Supabase Init Error", e);
        }
    }
    return supabaseClient;
}

export function getSupabase() {
    return supabaseClient;
}

export async function loadData() {
    // The previous shared key may contain another account's data. It cannot be
    // safely attributed, so discard it instead of exposing it after sign-out.
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (error) { logger.error(error); }

    const cacheKey = getStorageKey();
    const storedData = readCachedPages(cacheKey);
    if (Array.isArray(storedData)) {
        state.pages = ensureBookmarkIds(migrateData(storedData));
        render();
        document.body.style.visibility = 'visible';
    } else {
        try {
            const response = await fetch('homepage_config.json');
            if (response.ok) {
                const data = await response.json();
                state.pages = migrateData(data);
                state.pages = ensureBookmarkIds(state.pages);
                render();
            }
        } catch (e) { logger.error(e); }
    }

    if (state.currentUser && supabaseClient) {
        try {
            const { data } = await supabaseClient
                .from('user_configs')
                .select('config_data')
                .eq('user_id', state.currentUser.id)
                .maybeSingle();

            if (data && data.config_data) {
                state.pages = ensureBookmarkIds(data.config_data);
                writeCachedPages(getStorageKey(state.currentUser.id), state.pages);
                render();
            }
        } catch (e) { logger.error("Cloud load error", e); }
    }
    document.body.style.visibility = 'visible';
}

export async function saveData() {
    const userId = state.currentUser?.id;
    const pagesSnapshot = JSON.parse(JSON.stringify(state.pages));
    writeCachedPages(getStorageKey(userId), pagesSnapshot);

    if (!userId || !supabaseClient) return;

    const version = ++latestSaveVersion;
    updateSyncStatus('saving');
    saveQueue = saveQueue.catch(() => {}).then(async () => {
        // A queued older snapshot must never overwrite a newer edit.
        if (version !== latestSaveVersion) return;

        const { error } = await supabaseClient
            .from('user_configs')
            .upsert({
                user_id: userId,
                config_data: pagesSnapshot,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) throw error;
        if (version === latestSaveVersion) updateSyncStatus('saved');
    }).catch((error) => {
        logger.error('Cloud save fail', error);
        if (version === latestSaveVersion) updateSyncStatus('error');
    });

    return saveQueue;
}

// Import/export functions
export function exportConfig() {
    const dataStr = JSON.stringify(state.pages, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "homepage_config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function importConfig() {
    document.getElementById('import-file-input').click();
}

export function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_SIZE) {
        showToast(t('msg_import_fail'), 'error');
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let importedData = JSON.parse(e.target.result);
            state.pages = migrateData(importedData);
            state.pages = ensureBookmarkIds(state.pages);
            saveData();
            render();
            showToast(t('msg_import_success'), "success");
        } catch (err) {
            showToast(t('msg_import_fail'), "error");
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

// Helper functions
function ensureBookmarkIds(pages) {
    if (!Array.isArray(pages)) return [];
    pages.forEach(page => {
        if(page.bookmarks) page.bookmarks.forEach(b => { if (!b.id) b.id = generateUniqueId(); });
    });
    return pages;
}

function migrateData(oldData) {
    const itemsPerPage = 32; const newPages = [];
    const pageTitles = oldData.pageTitles || ["Page 1", "Page 2", "Page 3"];
    let bookmarks = oldData.bookmarks || oldData;

    // If already in new structure, return as-is
    if (Array.isArray(oldData) && oldData.length > 0 && oldData[0].bookmarks) return oldData;

    if (!Array.isArray(bookmarks)) bookmarks = [];

    const totalPages = Math.max(pageTitles.length, Math.ceil(bookmarks.length / itemsPerPage));
    for (let i = 0; i < totalPages; i++) {
        newPages.push({
            title: pageTitles[i] || `Page ${i+1}`,
            bookmarks: bookmarks.slice(i * itemsPerPage, (i + 1) * itemsPerPage)
        });
    }
    if (newPages.length === 0) newPages.push({ title: "Page 1", bookmarks: [] });
    return ensureBookmarkIds(newPages);
}

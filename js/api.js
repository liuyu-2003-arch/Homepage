import { CONFIG } from './config.js?v=2.9.62';
import { state, emit, isDefaultAccount } from './state.js?v=2.9.62';
import { generateUniqueId, updateSyncStatus, showToast, t, safeUrl } from './utils.js?v=2.9.62';
import { logger } from './logger.js?v=2.9.62';
import { createCloudClient } from './cloud.js?v=2.9.62';

let cloudClient = null;
let saveQueue = Promise.resolve();
let latestSaveVersion = 0;
let defaultBookmarkNotesPromise = null;

const LEGACY_STORAGE_KEY = 'pagedData';
const GUEST_STORAGE_KEY = 'pagedData:guest';

function getStorageKey(userId = state.currentUser?.id) {
    if (!userId || isDefaultAccount()) return GUEST_STORAGE_KEY;
    return `pagedData:user:${userId}`;
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
        localStorage.setItem(key, typeof pages === 'string' ? pages : JSON.stringify(pages));
    } catch (error) {
        logger.error('Failed to cache bookmarks locally', error);
        showToast(t('msg_save_fail'), 'error');
    }
}

function loadDefaultBookmarkNotes() {
    if (!defaultBookmarkNotesPromise) {
        defaultBookmarkNotesPromise = fetch('homepage_config.json')
            .then((response) => response.ok ? response.json() : [])
            .then((pages) => {
                const notes = new Map();
                if (!Array.isArray(pages)) return notes;
                pages.forEach((page) => {
                    if (!Array.isArray(page.bookmarks)) return;
                    page.bookmarks.forEach((bookmark) => {
                        if (bookmark.url && typeof bookmark.note === 'string' && bookmark.note.trim()) {
                            notes.set(bookmark.url, bookmark.note.trim().slice(0, 160));
                        }
                    });
                });
                return notes;
            })
            .catch((error) => {
                logger.error('Default bookmark notes load error', error);
                return new Map();
            });
    }
    return defaultBookmarkNotesPromise;
}

async function preparePages(rawPages) {
    const pages = ensureBookmarkIds(sanitizePages(migrateData(rawPages)));
    const defaultNotes = await loadDefaultBookmarkNotes();
    pages.forEach((page) => {
        if (!Array.isArray(page.bookmarks)) return;
        page.bookmarks.forEach((bookmark) => {
            if (typeof bookmark.note !== 'string' && defaultNotes.has(bookmark.url)) {
                bookmark.note = defaultNotes.get(bookmark.url);
            }
        });
    });
    return pages;
}

export function initSupabase() {
    if (!cloudClient) {
        try {
            cloudClient = createCloudClient();
        } catch (e) {
            logger.error("Cloud client init error", e);
        }
    }
    return cloudClient;
}

export function getSupabase() {
    return cloudClient || initSupabase();
}

export async function loadData() {
    // The previous shared key may contain another account's data. It cannot be
    // safely attributed, so discard it instead of exposing it after sign-out.
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (error) { logger.error(error); }

    const cacheKey = getStorageKey();
    const storedData = readCachedPages(cacheKey);
    if (Array.isArray(storedData)) {
        state.pages = await preparePages(storedData);
        writeCachedPages(cacheKey, state.pages);
        emit('dataReloaded');
    } else {
        try {
            const response = await fetch('homepage_config.json');
            if (response.ok) {
                const data = await response.json();
                state.pages = await preparePages(data);
                emit('dataReloaded');
            }
        } catch (e) { logger.error("Config load error", e); }
    }

    if (state.currentUser && cloudClient) {
        try {
            const { data: configData, error } = await cloudClient.config.load();
            if (error) throw error;

            if (configData) {
                state.pages = await preparePages(configData);
                writeCachedPages(getStorageKey(state.currentUser.id), state.pages);
                emit('dataReloaded');
            }
        } catch (e) { logger.error("Cloud load error", e); }
    }
}

export async function saveData() {
    const userId = state.currentUser?.id;
    const snapshotStr = JSON.stringify(state.pages);
    const pagesSnapshot = JSON.parse(snapshotStr);
    writeCachedPages(getStorageKey(userId), snapshotStr);

    if (!userId || !cloudClient) return;

    const version = ++latestSaveVersion;
    updateSyncStatus('saving');
    saveQueue = saveQueue.catch(() => {}).then(async () => {
        // A queued older snapshot must never overwrite a newer edit.
        if (version !== latestSaveVersion) return;

        const { error } = await cloudClient.config.save(pagesSnapshot);

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
    if (file.size > CONFIG.MAX_IMPORT_SIZE) {
        showToast(t('msg_import_fail'), 'error');
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let importedData = JSON.parse(e.target.result);
            state.pages = ensureBookmarkIds(sanitizePages(migrateData(importedData)));
            saveData();
            emit('dataReloaded');
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
function sanitizePages(pages) {
    if (!Array.isArray(pages)) return [];
    pages.forEach(page => {
        if (!Array.isArray(page.bookmarks)) return;
        page.bookmarks.forEach(b => {
            b.url = safeUrl(b.url, '#');
            b.icon = safeUrl(b.icon, '');
            if (typeof b.note === 'string') b.note = b.note.trim().slice(0, 160);
        });
    });
    return pages;
}

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

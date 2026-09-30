import { state } from './state.js?v=2.9.22';
import { saveData } from './api.js?v=2.9.22';
import { CONFIG } from './config.js?v=2.9.22';
import { debounce, t, showToast, generateUniqueId, updateSyncStatus, startPillAnimation, safeUrl, openExternal, openDialog, closeDialog } from './utils.js?v=2.9.22';

export const debouncedSaveData = debounce(() => saveData(), 1000, { maxWait: 3000 });
let autoFillTimer = null;
let activeTooltipTarget = null;
let tooltipListenersBound = false;
const DOCK_STATS_PREFIX = 'homepageDockStats';
const DOCK_PINNED_PREFIX = 'homepageDockPinned';
const DOCK_LIMIT_DESKTOP = 5;
const DOCK_LIMIT_MOBILE = 3;
const LONG_PRESS_DELAY = 520;
const LONG_PRESS_FEEDBACK_DELAY = 180;
const LONG_PRESS_MOVE_TOLERANCE = 12;
const DOCK_MAGNIFICATION_SCALE = 0.38;
const DOCK_MAGNIFICATION_LIFT = 8;
let dockEditDraftIds = [];
let dockEditSortable = null;
let longPressTimer = null;
let longPressFeedbackTimer = null;
let longPressContext = null;
let longPressPointerId = null;
let longPressStartX = 0;
let longPressStartY = 0;
let longPressTriggered = false;
let suppressClickUntil = 0;
let dockMagnificationBound = false;
let dockMagnificationFrame = null;
let dockMagnificationPointerX = null;

function ensureBookmarkTooltipListeners() {
    if (tooltipListenersBound) return;
    tooltipListenersBound = true;
    const hide = () => hideBookmarkTooltip();
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

function showBookmarkTooltip(target, note) {
    if (state.isEditing || !note) return;
    const tooltip = document.getElementById('bookmark-tooltip');
    if (!tooltip) return;

    activeTooltipTarget = target;
    tooltip.textContent = note;
    tooltip.setAttribute('aria-hidden', 'false');
    tooltip.classList.add('visible');

    const gap = 10;
    const padding = 12;
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const maxLeft = Math.max(padding, window.innerWidth - tooltipRect.width - padding);
    const left = Math.min(Math.max(targetRect.left + targetRect.width / 2 - tooltipRect.width / 2, padding), maxLeft);
    let top = targetRect.top - tooltipRect.height - gap;
    if (top < padding) top = Math.min(targetRect.bottom + gap, window.innerHeight - tooltipRect.height - padding);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(padding, top)}px`;
}

function hideBookmarkTooltip(target) {
    if (target && activeTooltipTarget !== target) return;
    activeTooltipTarget = null;
    const tooltip = document.getElementById('bookmark-tooltip');
    if (!tooltip) return;
    tooltip.classList.remove('visible');
    tooltip.setAttribute('aria-hidden', 'true');
}

function getDockStatsKey() {
    return `${DOCK_STATS_PREFIX}:${state.currentUser?.id || 'guest'}`;
}

function getDockPinnedKey() {
    return `${DOCK_PINNED_PREFIX}:${state.currentUser?.id || 'guest'}`;
}

function getDockLimit() {
    return window.innerWidth < CONFIG.MOBILE_MAX_WIDTH ? DOCK_LIMIT_MOBILE : DOCK_LIMIT_DESKTOP;
}

function getBookmarkKey(bookmark) {
    return bookmark?.id || bookmark?.url || '';
}

function readDockStats() {
    try {
        const raw = localStorage.getItem(getDockStatsKey());
        const stats = raw ? JSON.parse(raw) : {};
        return stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : {};
    } catch {
        return {};
    }
}

function readDockPinnedIds() {
    try {
        const raw = localStorage.getItem(getDockPinnedKey());
        if (raw === null) return null;
        const ids = JSON.parse(raw);
        if (!Array.isArray(ids)) return null;
        return [...new Set(ids.filter(id => typeof id === 'string' && id.trim()))];
    } catch {
        return null;
    }
}

function writeDockPinnedIds(ids) {
    try {
        localStorage.setItem(getDockPinnedKey(), JSON.stringify([...new Set(ids)]));
    } catch {
        showToast(t('msg_save_fail'), 'error');
    }
}

function recordBookmarkOpen(bookmark) {
    const key = bookmark?.id || bookmark?.url;
    if (!key) return;

    const stats = readDockStats();
    const previous = stats[key] || {};
    stats[key] = {
        count: Math.max(0, Number(previous.count) || 0) + 1,
        lastOpened: Date.now()
    };

    const prunedStats = Object.fromEntries(
        Object.entries(stats)
            .sort(([, a], [, b]) => (Number(b?.lastOpened) || 0) - (Number(a?.lastOpened) || 0))
            .slice(0, 200)
    );

    try {
        localStorage.setItem(getDockStatsKey(), JSON.stringify(prunedStats));
    } catch {
        // Dock history is a convenience feature; storage failures should not block opening a link.
    }
}

function getAllBookmarks() {
    const bookmarks = [];
    const seen = new Set();

    state.pages.forEach((page) => {
        if (!Array.isArray(page?.bookmarks)) return;
        page.bookmarks.forEach((bookmark) => {
            const key = bookmark?.id || bookmark?.url;
            if (!key || seen.has(key) || !safeUrl(bookmark?.url)) return;
            seen.add(key);
            bookmarks.push(bookmark);
        });
    });

    return bookmarks;
}

function findBookmarkById(id) {
    if (!id) return null;
    for (const page of state.pages) {
        const bookmark = page.bookmarks?.find(item => item.id === id);
        if (bookmark) return bookmark;
    }
    return null;
}

function findBookmarkLocation(key) {
    if (!key) return null;
    for (let pageIndex = 0; pageIndex < state.pages.length; pageIndex++) {
        const bookmarkIndex = state.pages[pageIndex].bookmarks?.findIndex(bookmark => getBookmarkKey(bookmark) === key) ?? -1;
        if (bookmarkIndex >= 0) return { pageIndex, bookmarkIndex };
    }
    return null;
}

function triggerLongPressHaptic() {
    if (typeof navigator.vibrate !== 'function') return;
    try {
        navigator.vibrate(12);
    } catch {
        // Haptics are optional and unsupported in several browsers.
    }
}

function clearLongPressGesture() {
    if (longPressTimer) clearTimeout(longPressTimer);
    if (longPressFeedbackTimer) clearTimeout(longPressFeedbackTimer);
    longPressTimer = null;
    longPressFeedbackTimer = null;

    if (longPressContext?.element) {
        longPressContext.element.classList.remove('long-press-armed', 'long-press-active');
    }
    document.body.classList.remove(
        'long-press-bookmark-active',
        'long-press-theme-armed',
        'long-press-theme-active',
        'long-press-dock-armed',
        'long-press-dock-active'
    );
    longPressContext = null;
    longPressPointerId = null;
    longPressTriggered = false;
}

function activateLongPress() {
    if (!longPressContext || state.hasDragged || state.isScrolling || state.isEditing) return;

    const context = longPressContext;
    longPressTriggered = true;
    suppressClickUntil = Date.now() + 700;
    triggerLongPressHaptic();

    if (context.type === 'bookmark') {
        context.element.classList.remove('long-press-armed');
        context.element.classList.add('long-press-active');
        document.body.classList.add('long-press-bookmark-active');
        if (context.location) openModal(context.location.pageIndex, context.location.bookmarkIndex);
        return;
    }

    if (context.type === 'dock') {
        context.element.classList.remove('long-press-armed');
        context.element.classList.add('long-press-active');
        document.body.classList.add('long-press-dock-active');
        openDockEditModal();
        return;
    }

    document.body.classList.remove('long-press-theme-armed');
    document.body.classList.add('long-press-theme-active');
    openThemeControls({ source: 'longPress' });
}

function startLongPressGesture(e) {
    if (state.isEditing || longPressPointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const target = e.target;
    const bookmarkItem = target.closest('#bookmark-swiper .bookmark-item');
    const dock = target.closest('#bookmark-dock');
    if (target.closest('.delete-btn')) return;

    let context = null;
    if (bookmarkItem) {
        const location = findBookmarkLocation(bookmarkItem.dataset.id);
        if (location) context = { type: 'bookmark', element: bookmarkItem, location };
    } else if (dock) {
        context = { type: 'dock', element: dock };
    } else if (target.closest('.container')) {
        context = { type: 'theme', element: target.closest('.bookmark-page-content') || target };
    }

    if (!context) return;

    longPressContext = context;
    longPressPointerId = e.pointerId;
    longPressStartX = e.clientX;
    longPressStartY = e.clientY;
    longPressTriggered = false;

    longPressFeedbackTimer = window.setTimeout(() => {
        if (!longPressContext || state.hasDragged || state.isScrolling) return;
        if (longPressContext.type === 'bookmark') longPressContext.element.classList.add('long-press-armed');
        else if (longPressContext.type === 'dock') {
            longPressContext.element.classList.add('long-press-armed');
            document.body.classList.add('long-press-dock-armed');
        } else {
            document.body.classList.add('long-press-theme-armed');
        }
    }, LONG_PRESS_FEEDBACK_DELAY);

    longPressTimer = window.setTimeout(activateLongPress, LONG_PRESS_DELAY);
}

function moveLongPressGesture(e) {
    if (longPressPointerId === null || e.pointerId !== longPressPointerId) return;
    if (longPressTriggered) return;
    const movedX = Math.abs(e.clientX - longPressStartX);
    const movedY = Math.abs(e.clientY - longPressStartY);
    if (movedX > LONG_PRESS_MOVE_TOLERANCE || movedY > LONG_PRESS_MOVE_TOLERANCE) {
        clearLongPressGesture();
    }
}

function endLongPressGesture(e) {
    if (longPressPointerId === null || e.pointerId !== longPressPointerId) return;
    if (longPressTriggered) suppressClickUntil = Date.now() + 1200;
    clearLongPressGesture();
}

function suppressLongPressClick(e) {
    if (Date.now() > suppressClickUntil) return;
    suppressClickUntil = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
}

function initLongPressGestures() {
    document.addEventListener('pointerdown', startLongPressGesture, { passive: true });
    document.addEventListener('pointermove', moveLongPressGesture, { passive: true });
    document.addEventListener('pointerup', endLongPressGesture, { passive: true });
    document.addEventListener('pointercancel', endLongPressGesture, { passive: true });
    document.addEventListener('click', suppressLongPressClick, true);
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('#bookmark-swiper, #bookmark-dock')) e.preventDefault();
    });
    window.addEventListener('blur', clearLongPressGesture);
    window.addEventListener('scroll', clearLongPressGesture, true);
}

function resetDockMagnification() {
    dockMagnificationPointerX = null;
    if (dockMagnificationFrame) {
        cancelAnimationFrame(dockMagnificationFrame);
        dockMagnificationFrame = null;
    }

    document.querySelectorAll('#bookmark-dock .dock-item').forEach((item) => {
        item.style.removeProperty('--dock-scale');
        item.style.removeProperty('--dock-lift');
        item.style.removeProperty('--dock-shadow-y');
        item.style.removeProperty('--dock-shadow-blur');
        item.style.removeProperty('--dock-shadow-alpha');
    });
}

function applyDockMagnification() {
    const dock = document.getElementById('bookmark-dock');
    if (!dock || dockMagnificationPointerX === null || dock.classList.contains('hidden')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        resetDockMagnification();
        return;
    }

    dock.querySelectorAll('.dock-item').forEach((item) => {
        const rect = item.getBoundingClientRect();
        const distance = Math.abs(dockMagnificationPointerX - (rect.left + rect.width / 2));
        const baseSize = parseFloat(getComputedStyle(item).getPropertyValue('--dock-item-size')) || 46;
        const sigma = Math.max(38, baseSize * 1.18);
        const influence = Math.exp(-(distance * distance) / (2 * sigma * sigma));
        const scale = 1 + DOCK_MAGNIFICATION_SCALE * influence;
        const lift = -DOCK_MAGNIFICATION_LIFT * influence;

        item.style.setProperty('--dock-scale', scale.toFixed(3));
        item.style.setProperty('--dock-lift', `${lift.toFixed(2)}px`);
        item.style.setProperty('--dock-shadow-y', `${(5 + influence * 8).toFixed(2)}px`);
        item.style.setProperty('--dock-shadow-blur', `${(12 + influence * 15).toFixed(2)}px`);
        item.style.setProperty('--dock-shadow-alpha', (0.16 + influence * 0.12).toFixed(3));
    });
}

function queueDockMagnification(clientX) {
    dockMagnificationPointerX = clientX;
    if (dockMagnificationFrame) return;
    dockMagnificationFrame = requestAnimationFrame(() => {
        dockMagnificationFrame = null;
        applyDockMagnification();
    });
}

function initDockMagnification() {
    const dock = document.getElementById('bookmark-dock');
    if (!dock || dockMagnificationBound) return;
    dockMagnificationBound = true;

    dock.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'touch') queueDockMagnification(e.clientX);
    });
    dock.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'touch') queueDockMagnification(e.clientX);
    });
    dock.addEventListener('pointerleave', (e) => {
        if (e.pointerType !== 'touch') resetDockMagnification();
    });
    dock.addEventListener('pointercancel', resetDockMagnification);
    window.addEventListener('blur', resetDockMagnification);
    window.addEventListener('resize', resetDockMagnification);
}

function createBookmarkIcon(item, extraClass = '') {
    const firstChar = item.title ? item.title.charAt(0).toUpperCase() : 'A';
    const iconBox = document.createElement('div');
    iconBox.className = `icon-box ${extraClass}`.trim();

    if (item.icon && item.icon.trim() !== '') {
        const img = document.createElement('img');
        img.referrerPolicy = 'no-referrer';
        img.loading = 'lazy';
        img.src = item.icon;

        const textIcon = document.createElement('div');
        textIcon.className = 'text-icon';
        textIcon.textContent = firstChar;
        textIcon.style.display = 'none';

        img.addEventListener('load', () => {
            img.style.display = 'block';
            textIcon.style.display = 'none';
        });
        img.addEventListener('error', () => {
            img.style.display = 'none';
            textIcon.style.display = 'flex';
        });

        iconBox.appendChild(img);
        iconBox.appendChild(textIcon);
    } else {
        const textIcon = document.createElement('div');
        textIcon.className = 'text-icon';
        textIcon.textContent = firstChar;
        iconBox.appendChild(textIcon);
    }

    return iconBox;
}

function openBookmark(bookmark) {
    if (!bookmark) return;
    const safeHref = safeUrl(bookmark.url);
    if (!safeHref) return;

    recordBookmarkOpen(bookmark);
    openExternal(safeHref);
    renderBookmarkDock();
}

function createDockItem(bookmark) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dock-item';
    button.dataset.bookmarkKey = getBookmarkKey(bookmark);
    if (bookmark.style === 'white') button.classList.add('style-white');
    if (bookmark.style === 'fit') button.classList.add('style-fit');
    button.title = bookmark.title || bookmark.url;
    button.setAttribute('aria-label', bookmark.title || bookmark.url);

    const icon = createBookmarkIcon(bookmark, 'dock-icon');
    const label = document.createElement('span');
    label.className = 'dock-item-label';
    label.textContent = bookmark.title || bookmark.url;

    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener('click', () => openBookmark(bookmark));
    return button;
}

function renderBookmarkDock() {
    const dock = document.getElementById('bookmark-dock');
    const commonContainer = document.getElementById('dock-common-items');
    const recentContainer = document.getElementById('dock-recent-items');
    const commonGroup = document.getElementById('dock-common-group');
    const recentGroup = document.getElementById('dock-recent-group');
    const divider = document.getElementById('dock-divider');
    if (!dock || !commonContainer || !recentContainer || !commonGroup || !recentGroup || !divider) return;

    commonContainer.innerHTML = '';
    recentContainer.innerHTML = '';

    const bookmarks = getAllBookmarks();
    if (bookmarks.length === 0) {
        dock.classList.add('hidden');
        return;
    }

    const stats = readDockStats();
    const bookmarkByKey = new Map(bookmarks.map(bookmark => [getBookmarkKey(bookmark), bookmark]));
    const entries = bookmarks.map((bookmark, index) => {
        const stat = stats[bookmark.id || bookmark.url] || {};
        return {
            bookmark,
            index,
            count: Math.max(0, Number(stat.count) || 0),
            lastOpened: Math.max(0, Number(stat.lastOpened) || 0)
        };
    });
    const limit = getDockLimit();
    const pinnedIds = readDockPinnedIds();
    const commonBookmarks = pinnedIds === null
        ? entries
            .slice()
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                if (b.lastOpened !== a.lastOpened) return b.lastOpened - a.lastOpened;
                return a.index - b.index;
            })
            .slice(0, limit)
            .map(entry => entry.bookmark)
        : pinnedIds
            .map(id => bookmarkByKey.get(id))
            .filter(Boolean)
            .slice(0, limit);
    const recentEntries = entries
        .filter(entry => entry.lastOpened > 0)
        .sort((a, b) => b.lastOpened - a.lastOpened)
        .slice(0, limit);

    commonGroup.classList.toggle('hidden', commonBookmarks.length === 0);
    recentGroup.classList.toggle('hidden', recentEntries.length === 0);
    divider.classList.toggle('hidden', commonBookmarks.length === 0 || recentEntries.length === 0);

    commonBookmarks.forEach((bookmark) => {
        commonContainer.appendChild(createDockItem(bookmark));
    });

    recentEntries.forEach(({ bookmark }) => {
        recentContainer.appendChild(createDockItem(bookmark));
    });

    dock.classList.remove('hidden');
}

function getAutomaticCommonIds() {
    const stats = readDockStats();
    return getAllBookmarks()
        .map((bookmark, index) => {
            const stat = stats[getBookmarkKey(bookmark)] || {};
            return {
                bookmark,
                index,
                count: Math.max(0, Number(stat.count) || 0),
                lastOpened: Math.max(0, Number(stat.lastOpened) || 0)
            };
        })
        .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            if (b.lastOpened !== a.lastOpened) return b.lastOpened - a.lastOpened;
            return a.index - b.index;
        })
        .slice(0, getDockLimit())
        .map(entry => getBookmarkKey(entry.bookmark));
}

function createDockEditItem(bookmark, action) {
    const item = document.createElement('li');
    item.className = 'dock-edit-item';
    item.dataset.id = getBookmarkKey(bookmark);

    if (action === 'remove') {
        const handle = document.createElement('span');
        handle.className = 'dock-edit-handle';
        handle.textContent = '☰';
        handle.setAttribute('aria-hidden', 'true');
        item.appendChild(handle);
    }

    item.appendChild(createBookmarkIcon(bookmark, 'dock-edit-icon'));

    const title = document.createElement('span');
    title.className = 'dock-edit-title';
    title.textContent = bookmark.title || bookmark.url;
    title.title = bookmark.title || bookmark.url;
    item.appendChild(title);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `dock-edit-toggle ${action}`;
    button.textContent = action === 'remove' ? '−' : '+';
    button.setAttribute('aria-label', action === 'remove' ? `Remove ${title.textContent}` : `Add ${title.textContent}`);
    button.addEventListener('click', () => {
        const key = getBookmarkKey(bookmark);
        if (action === 'remove') {
            dockEditDraftIds = dockEditDraftIds.filter(id => id !== key);
        } else if (dockEditDraftIds.length >= getDockLimit()) {
            showToast(t('dock_limit_reached'), 'error');
            return;
        } else {
            dockEditDraftIds.push(key);
        }
        renderDockEditModal();
    });
    item.appendChild(button);
    return item;
}

function renderDockEditModal() {
    const pinnedList = document.getElementById('dock-pinned-list');
    const availableList = document.getElementById('dock-available-list');
    const count = document.getElementById('dock-pinned-count');
    if (!pinnedList || !availableList || !count) return;

    const bookmarks = getAllBookmarks();
    const bookmarkByKey = new Map(bookmarks.map(bookmark => [getBookmarkKey(bookmark), bookmark]));
    const validPinnedIds = dockEditDraftIds.filter(id => bookmarkByKey.has(id)).slice(0, getDockLimit());
    dockEditDraftIds = validPinnedIds;

    pinnedList.innerHTML = '';
    availableList.innerHTML = '';
    count.textContent = `${validPinnedIds.length}/${getDockLimit()}`;

    if (validPinnedIds.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'dock-edit-empty';
        empty.textContent = t('dock_empty_pinned');
        pinnedList.appendChild(empty);
    } else {
        validPinnedIds.forEach((id) => {
            pinnedList.appendChild(createDockEditItem(bookmarkByKey.get(id), 'remove'));
        });
    }

    const pinnedSet = new Set(validPinnedIds);
    const available = bookmarks.filter(bookmark => !pinnedSet.has(getBookmarkKey(bookmark)));
    if (available.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'dock-edit-empty';
        empty.textContent = t('dock_empty_available');
        availableList.appendChild(empty);
    } else {
        available.forEach((bookmark) => {
            availableList.appendChild(createDockEditItem(bookmark, 'add'));
        });
    }

    if (dockEditSortable) dockEditSortable.destroy();
    dockEditSortable = new Sortable(pinnedList, {
        animation: 160,
        handle: '.dock-edit-handle',
        ghostClass: 'dock-edit-ghost',
        onEnd: (evt) => {
            const [moved] = dockEditDraftIds.splice(evt.oldIndex, 1);
            dockEditDraftIds.splice(evt.newIndex, 0, moved);
            renderDockEditModal();
        }
    });
}

export function openDockEditModal() {
    const controls = document.getElementById('edit-controls');
    if (controls) controls.classList.add('hidden');

    const storedIds = readDockPinnedIds();
    dockEditDraftIds = storedIds === null ? getAutomaticCommonIds() : storedIds.slice(0, getDockLimit());
    renderDockEditModal();
    openDialog('dock-edit-modal');
}

export function closeDockEditModal() {
    if (dockEditSortable) {
        dockEditSortable.destroy();
        dockEditSortable = null;
    }
    closeModalById('dock-edit-modal');
}

export function saveDockEditConfig() {
    writeDockPinnedIds(dockEditDraftIds);
    closeDockEditModal();
    renderBookmarkDock();
}

function countGridColumns(template) {
    if (!template || template === 'none') return 1;
    return template.trim().split(/\s+/).filter(Boolean).length || 1;
}

function measurePageCapacity(wrapper) {
    if (!wrapper) return 1;

    const page = document.createElement('div');
    page.className = 'bookmark-page';
    page.setAttribute('aria-hidden', 'true');

    const content = document.createElement('div');
    content.className = 'bookmark-page-content';

    const title = document.createElement('h2');
    title.className = 'page-title';
    title.textContent = 'Probe';
    content.appendChild(title);

    // Enough items make auto-fit reveal every column the viewport can hold.
    for (let i = 0; i < 64; i++) {
        const item = document.createElement('div');
        item.className = 'bookmark-item';
        item.innerHTML = '<div class="icon-box"></div><div class="bookmark-title">Probe</div>';
        content.appendChild(item);
    }

    page.appendChild(content);
    wrapper.appendChild(page);

    try {
        const contentStyle = getComputedStyle(content);
        const columns = countGridColumns(contentStyle.gridTemplateColumns);
        const rowGap = parseFloat(contentStyle.rowGap) || parseFloat(contentStyle.gap) || 0;
        const paddingBottom = parseFloat(contentStyle.paddingBottom) || 0;
        const pageRect = page.getBoundingClientRect();
        const probeItem = content.querySelector('.bookmark-item');
        const itemRect = probeItem.getBoundingClientRect();
        const itemTop = Math.max(0, itemRect.top - pageRect.top + page.scrollTop);
        const itemHeight = probeItem.offsetHeight || itemRect.height || 1;
        const availableHeight = page.clientHeight - itemTop - paddingBottom;
        const rows = Math.max(1, Math.floor((availableHeight + rowGap) / (itemHeight + rowGap)));

        return Math.max(1, columns * rows);
    } finally {
        page.remove();
    }
}

function getVisualPageAnchor() {
    const currentVisualPage = state.visualPages[state.currentPage];
    if (!currentVisualPage) return null;

    return {
        originalPageIndex: currentVisualPage.originalPageIndex,
        bookmarkId: currentVisualPage.bookmarks[0]?.id || null,
        chunkIndex: currentVisualPage.chunkIndex || 0
    };
}

function restoreVisualPage(anchor) {
    if (!anchor || state.visualPages.length === 0) return;

    let nextIndex = -1;
    if (anchor.bookmarkId) {
        nextIndex = state.visualPages.findIndex(page =>
            page.bookmarks.some(bookmark => bookmark.id === anchor.bookmarkId)
        );
    }

    if (nextIndex < 0) {
        nextIndex = state.visualPages.findIndex(page =>
            page.originalPageIndex === anchor.originalPageIndex &&
            page.chunkIndex >= anchor.chunkIndex
        );
    }

    if (nextIndex < 0) {
        nextIndex = state.visualPages.findIndex(page => page.originalPageIndex === anchor.originalPageIndex);
    }

    if (nextIndex >= 0) state.currentPage = nextIndex;
}

// --- Custom Confirm Modal (replaces browser confirm) ---
export function showConfirm(message, title) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const msgEl = document.getElementById('confirm-message');
        const titleEl = document.getElementById('confirm-title');
        const cancelBtn = document.getElementById('confirm-cancel');
        const okBtn = document.getElementById('confirm-ok');

        if (!modal) { resolve(true); return; } // Fallback

        if (message) msgEl.textContent = message;
        if (title) titleEl.textContent = title;

        openDialog('confirm-modal');

        let settled = false;
        const cleanup = (val) => {
            if (settled) return;
            settled = true;
            modal.classList.add('hidden');
            cancelBtn.removeEventListener('click', onCancel);
            okBtn.removeEventListener('click', onOk);
            document.removeEventListener('keydown', onKey, true);
            resolve(val);
        };

        const onCancel = () => cleanup(false);
        const onOk = () => cleanup(true);
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cleanup(false); } };

        cancelBtn.addEventListener('click', onCancel);
        okBtn.addEventListener('click', onOk);
        document.addEventListener('keydown', onKey, true);
    });
}

// --- 渲染核心 (Render) ---
export function render(options = {}) {
    hideBookmarkTooltip();
    ensureBookmarkTooltipListeners();
    const preservePosition = options?.preservePosition === true;
    const currentAnchor = preservePosition ? getVisualPageAnchor() : null;
    const oldScrollTops = [];
    document.querySelectorAll('.bookmark-page').forEach(p => oldScrollTops.push(p.scrollTop));

    const swiperWrapper = document.getElementById('bookmark-swiper-wrapper');
    if (!swiperWrapper) return;
    createVisualPages(measurePageCapacity(swiperWrapper));
    swiperWrapper.innerHTML = '';

    state.sortableInstances.forEach(instance => instance.destroy());
    state.sortableInstances = [];

    const fragment = document.createDocumentFragment();

    state.visualPages.forEach((vPage, visualPageIndex) => {
        const pageEl = document.createElement('div');
        pageEl.className = 'bookmark-page';
        pageEl.dataset.visualPageIndex = visualPageIndex;
        pageEl.dataset.originalPageIndex = vPage.originalPageIndex;

        const content = document.createElement('div');
        content.className = 'bookmark-page-content';
        const title = document.createElement('h2');
        title.className = 'page-title';
        title.textContent = vPage.title || 'New Page';
        content.appendChild(title);

        vPage.bookmarks.forEach((item) => {
            const originalPageIndex = vPage.originalPageIndex;
            const originalBookmarkIndex = state.pages[originalPageIndex].bookmarks.findIndex(b => b.id === item.id);
            const div = document.createElement('div');
            let styleClass = '';
            if (item.style === 'white') styleClass = 'style-white';
            else if (item.style === 'fit') styleClass = 'style-fit';
            div.className = `bookmark-item ${styleClass}`;
            div.dataset.id = item.id;
            div.dataset.url = item.url;
            div.setAttribute('role', 'button');
            div.tabIndex = 0;
            const note = typeof item.note === 'string' ? item.note.trim() : '';
            div.setAttribute('aria-label', note ? `${item.title || item.url}. ${note}` : (item.title || item.url));
            if (note) {
                div.dataset.note = note;
                div.addEventListener('mouseenter', () => showBookmarkTooltip(div, note));
                div.addEventListener('mouseleave', () => hideBookmarkTooltip(div));
                div.addEventListener('focus', () => showBookmarkTooltip(div, note));
                div.addEventListener('blur', () => hideBookmarkTooltip(div));
            }

            // 使用事件监听器而非 onclick 字符串
            div.addEventListener('click', (e) => {
                if (Date.now() < suppressClickUntil) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if (state.isEditing) {
                    if (!e.target.classList.contains('delete-btn')) openModal(originalPageIndex, originalBookmarkIndex);
                } else {
                    if (!state.hasDragged) openBookmark(item);
                }
            });
            div.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); div.click(); }
            });

            // 构建 DOM 结构而非 innerHTML，防止 XSS
            const deleteBtn = document.createElement('div');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.addEventListener('click', (e) => deleteBookmark(e, item.id));

            const iconBox = createBookmarkIcon(item);

            const titleEl = document.createElement('div');
            titleEl.className = 'bookmark-title';
            titleEl.textContent = item.title; // textContent 防止 XSS

            div.appendChild(deleteBtn);
            div.appendChild(iconBox);
            div.appendChild(titleEl);
            content.appendChild(div);
        });
        pageEl.appendChild(content);
        fragment.appendChild(pageEl);
        if(oldScrollTops[visualPageIndex]) pageEl.scrollTop = oldScrollTops[visualPageIndex];
    });

    swiperWrapper.appendChild(fragment);

    restoreVisualPage(currentAnchor);
    if (state.currentPage >= state.visualPages.length) state.currentPage = Math.max(0, state.visualPages.length - 1);
    updateSwiperPosition(false);
    renderPaginationDots();
    renderBookmarkDock();
    if (state.isEditing) initSortable();
}

function createVisualPages(chunkSize = state.visualPageSize) {
    state.visualPages = [];
    chunkSize = Math.max(1, Number(chunkSize) || 1);
    state.visualPageSize = chunkSize;

    if (!state.pages || state.pages.length === 0) {
        state.pages = [{ title: t("untitled_page") || "Home", bookmarks: [] }];
    }

    state.pages.forEach((page, originalPageIndex) => {
        if (page.bookmarks.length === 0 && state.isEditing) {
            state.visualPages.push({ title: page.title, bookmarks: [], originalPageIndex: originalPageIndex, chunkIndex: 0 });
        } else if (page.bookmarks.length > 0) {
            for (let i = 0; i < page.bookmarks.length; i += chunkSize) {
                const chunk = page.bookmarks.slice(i, i + chunkSize);
                state.visualPages.push({ title: page.title, bookmarks: chunk, originalPageIndex: originalPageIndex, chunkIndex: i / chunkSize });
            }
        } else {
             if (state.pages.length === 1) {
                 state.visualPages.push({ title: page.title, bookmarks: [], originalPageIndex: 0, chunkIndex: 0 });
             }
        }
    });
}

export function handleViewportResize() {
    const wrapper = document.getElementById('bookmark-swiper-wrapper');
    if (!wrapper) return;

    renderBookmarkDock();
    const nextPageSize = measurePageCapacity(wrapper);
    if (nextPageSize !== state.visualPageSize) {
        render({ preservePosition: true });
        return;
    }

    updateSwiperPosition(false);
}

// --- 模态框与书签逻辑 ---
export function openModal(pageIndex = -1, bookmarkIndex = -1) {
    hideBookmarkTooltip();
    // 【修改点 1】打开书签编辑窗口时，隐藏底部编辑按钮栏
    const controls = document.getElementById('edit-controls');
    if (controls) controls.classList.add('hidden');

    state.currentEditInfo = { pageIndex, bookmarkIndex };
    openDialog('modal');
    const titleInput = document.getElementById('input-title');
    const urlInput = document.getElementById('input-url');
    const noteInput = document.getElementById('input-note');
    const iconInput = document.getElementById('input-icon');

    let currentStyle = 'full';
    let targetPageIndex = 0;

    if (pageIndex >= 0 && bookmarkIndex >= 0) {
        const item = state.pages[pageIndex].bookmarks[bookmarkIndex];
        titleInput.value = item.title;
        urlInput.value = item.url;
        noteInput.value = item.note || '';
        iconInput.value = item.icon || "";
        currentStyle = item.style || 'full';
        targetPageIndex = pageIndex;
        autoFillInfo();
    } else {
        const currentVisualPage = state.visualPages[state.currentPage];
        titleInput.value = '';
        urlInput.value = '';
        noteInput.value = '';
        iconInput.value = '';
        targetPageIndex = currentVisualPage ? currentVisualPage.originalPageIndex : 0;
        document.getElementById('icon-candidates').innerHTML = '';
        renderRandomButtons(document.getElementById('icon-candidates'));
    }

    document.querySelectorAll('.style-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.style === currentStyle);
    });

    renderPageOptions(targetPageIndex);
    updatePreview();
}

export function closeModal() {
    closeModalById('modal');
}

export function saveBookmark() {
    const title = document.getElementById('input-title').value;
    let url = document.getElementById('input-url').value;
    const note = document.getElementById('input-note').value.trim();
    const icon = document.getElementById('input-icon').value;
    const styleEl = document.querySelector('.style-option.active');
    const style = styleEl ? styleEl.dataset.style : 'full';

    const pageEl = document.querySelector('.page-option.active');
    const newPageIndex = pageEl ? parseInt(pageEl.dataset.index) : 0;

    if (!title || !url) return showToast(t('msg_title_url_req'), "error");
    const safeHref = safeUrl(url);
    if (!safeHref) return showToast(t('msg_invalid_url'), "error");
    url = safeHref;
    const safeIcon = safeUrl(icon);

    const { pageIndex, bookmarkIndex } = state.currentEditInfo;

    if (pageIndex >= 0 && bookmarkIndex >= 0) {
        const itemToUpdate = state.pages[pageIndex].bookmarks[bookmarkIndex];
        const newItem = { ...itemToUpdate, title, url, note, icon: safeIcon, style };

        if (pageIndex !== newPageIndex) {
            state.pages[pageIndex].bookmarks.splice(bookmarkIndex, 1);
            state.pages[newPageIndex].bookmarks.push(newItem);
        } else {
            state.pages[pageIndex].bookmarks[bookmarkIndex] = newItem;
        }
    } else {
        const newItem = { id: generateUniqueId(), title, url, note, icon: safeIcon, style };
        if (!state.pages[newPageIndex]) state.pages[newPageIndex] = { title: t("untitled_page") || "New Page", bookmarks: [] };
        state.pages[newPageIndex].bookmarks.push(newItem);
        state.currentPage = newPageIndex;
    }
    saveData();
    closeModal();
    render();
}

export async function deleteBookmark(e, bookmarkId) {
    e.stopPropagation();
    const confirmed = await showConfirm(t('confirm_delete_msg'), t('confirm_delete_title'));
    if (!confirmed) return;

    let found = false;
    for (const page of state.pages) {
        const index = page.bookmarks.findIndex(b => b.id === bookmarkId);
        if (index !== -1) { page.bookmarks.splice(index, 1); found = true; break; }
    }
    if (found) { saveData(); render(); }
}

// --- 自动填充与图标 ---
export function autoFillInfo() {
    if (autoFillTimer) clearTimeout(autoFillTimer);
    autoFillTimer = setTimeout(() => {
        const urlVal = document.getElementById('input-url').value;
        const titleInput = document.getElementById('input-title');
        const iconInput = document.getElementById('input-icon');

        generateIconCandidates(urlVal);

        if (urlVal && urlVal.includes('.') && urlVal.length > 4) {
            const normalizedUrl = safeUrl(urlVal);
            if (normalizedUrl) {
                try {
                    const urlObj = new URL(normalizedUrl);
                    let domain = urlObj.hostname;
                    if (domain.endsWith('.')) domain = domain.slice(0, -1);

                    if (!iconInput.value) iconInput.value = `https://manifest.im/icon/${domain}`;
                    if (!titleInput.value) {
                        let domainName = domain.replace('www.', '').split('.')[0];
                        if(domainName) titleInput.value = domainName.charAt(0).toUpperCase() + domainName.slice(1);
                    }
                    updatePreview();
                } catch (e) {}
            }
        }
    }, 500);
}

export function generateIconCandidates(urlVal) {
    const list = document.getElementById('icon-candidates');
    list.innerHTML = '';
    if (!urlVal || !urlVal.includes('.') || urlVal.length < 4) {
        renderRandomButtons(list);
        return;
    }

    const normalizedUrl = safeUrl(urlVal);
    if (!normalizedUrl) {
        renderRandomButtons(list);
        return;
    }
    let domain = "", protocol = "https:";

    try {
        const urlObj = new URL(normalizedUrl);
        domain = urlObj.hostname;
        protocol = urlObj.protocol;
        if (domain.endsWith('.')) domain = domain.slice(0, -1);
    } catch(e) {
        renderRandomButtons(list);
        return;
    }

    renderRandomButtons(list);

    const sources = [
        { name: 'Manifest', url: `https://manifest.im/icon/${domain}` },
        { name: 'Vemetric', url: `https://favicon.vemetric.com/${domain}` },
        { name: 'Logo.dev', url: `https://img.logo.dev/${domain}?token=${CONFIG.LOGO_DEV_TOKEN}&size=100&format=png` },
        { name: 'Brandfetch', url: `https://cdn.brandfetch.io/${domain}?c=${CONFIG.BRANDFETCH_CID}` },
        { name: 'Direct', url: `${protocol}//${domain}/favicon.ico` }
    ];

    for (let i = sources.length - 1; i >= 0; i--) {
        const src = sources[i];
        const item = document.createElement('div');
        item.className = 'candidate-item';
        item.title = src.name;
        const img = document.createElement('img');
        img.referrerPolicy = 'no-referrer';
        img.loading = 'lazy';
        img.src = src.url;

        item.addEventListener('click', () => {
            document.getElementById('input-icon').value = src.url;
            updatePreview();
            document.querySelectorAll('.candidate-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        });

        img.onerror = () => { item.style.display = 'none'; };
        item.appendChild(img);
        list.insertBefore(item, list.firstChild);
    }
}

function renderRandomButtons(container) {
    const randomTypes = [
        { type: 'random-shapes', icon: '🎲' },
        { type: 'random-identicon', icon: '🧩' },
        { type: 'random-emoji', icon: '😀' },
        { type: 'random-bottts', icon: '🤖' },
        { type: 'random-avataaars', icon: '🧑' }
    ];
    randomTypes.forEach(rnd => {
        const item = document.createElement('div');
        item.className = 'candidate-item candidate-random';
        item.textContent = rnd.icon;
        item.addEventListener('click', () => {
            const seed = Math.random().toString(36).substring(7);
            let url = '';
            if(rnd.type === 'random-shapes') url = `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}`;
            else if(rnd.type === 'random-identicon') url = `https://api.dicebear.com/9.x/identicon/svg?seed=${seed}`;
            else if(rnd.type === 'random-bottts') url = `https://api.dicebear.com/9.x/bottts/svg?seed=${seed}`;
            else if(rnd.type === 'random-avataaars') url = `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`;
            else url = `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${seed}`;

            document.getElementById('input-icon').value = url;
            updatePreview();
            document.querySelectorAll('.candidate-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        });
        container.appendChild(item);
    });
}

export function updatePreview() {
    const titleVal = document.getElementById('input-title').value || t("untitled_page") || "Preview";
    const iconVal = document.getElementById('input-icon').value;
    const styleEl = document.querySelector('.style-option.active');
    const styleVal = styleEl ? styleEl.dataset.style : 'full';

    const previewCard = document.getElementById('preview-card');
    const previewImg = document.getElementById('preview-img');
    const previewText = document.getElementById('preview-text');
    const previewTitle = document.getElementById('preview-title');

    previewTitle.innerText = titleVal;
    previewCard.classList.remove('style-white', 'style-fit');
    if (styleVal === 'white') previewCard.classList.add('style-white');
    else if (styleVal === 'fit') previewCard.classList.add('style-fit');

    const firstChar = titleVal.charAt(0).toUpperCase() || "A";
    previewText.innerText = firstChar;

    if (iconVal) {
        previewImg.src = iconVal;
        previewImg.style.display = 'block';
        previewText.style.display = 'none';
        previewImg.onerror = () => {
            previewImg.style.display = 'none';
            previewText.style.display = 'flex';
        };
    } else {
        previewImg.style.display = 'none';
        previewText.style.display = 'flex';
    }
}

// --- 辅助 UI 功能 ---
export function selectStyle(element) {
    document.querySelectorAll('.style-option').forEach(opt => opt.classList.remove('active'));
    element.classList.add('active');
    updatePreview();
}

export function selectPage(element) {
    document.querySelectorAll('.page-option').forEach(opt => opt.classList.remove('active'));
    element.classList.add('active');
}

export function renderPageOptions(selectedPageIndex) {
    const container = document.getElementById('page-options-container');
    if(!container) return;
    container.innerHTML = '';
    state.pages.forEach((page, index) => {
        const option = document.createElement('div');
        option.className = 'page-option';
        option.textContent = page.title || `Page ${index + 1}`;
        option.dataset.index = index;
        option.onclick = () => selectPage(option);
        if (index === selectedPageIndex) option.classList.add('active');
        container.appendChild(option);
    });
}

// --- 页面管理逻辑 ---
export function openPageEditModal() {
    // 【修改点 3】打开页面编辑窗口时，隐藏底部编辑按钮栏
    const controls = document.getElementById('edit-controls');
    if (controls) controls.classList.add('hidden');

    openDialog('page-edit-modal');
    renderPageList();
}

export function closePageEditModal() {
    closeModalById('page-edit-modal');
    render();
}

export function renderPageList() {
    const list = document.getElementById('page-list');
    list.innerHTML = '';
    state.pages.forEach((page, index) => {
        const li = document.createElement('li');
        li.className = 'page-list-item';
        li.dataset.index = index;

        const handle = document.createElement('span');
        handle.className = 'drag-handle';
        handle.textContent = '☰';
        li.appendChild(handle);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'page-title-input';
        input.value = page.title;
        input.onblur = () => {
            state.pages[index].title = input.value.trim() || t('untitled_page') || 'Untitled';
            saveData();
        };
        li.appendChild(input);

        if ((!page.bookmarks || page.bookmarks.length === 0) && state.pages.length > 1) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-page-list-btn';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = (e) => deletePage(e, index);
            li.appendChild(deleteBtn);
        }
        list.appendChild(li);
    });

    if (state.pageListSortable) state.pageListSortable.destroy();
    state.pageListSortable = new Sortable(list, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: (evt) => {
            const [movedPage] = state.pages.splice(evt.oldIndex, 1);
            state.pages.splice(evt.newIndex, 0, movedPage);
            saveData();
            renderPageList();
        }
    });
}

export function addPage() {
    state.pages.push({ title: t("untitled_page") || "New Page", bookmarks: [] });
    saveData();
    if (document.getElementById('page-edit-modal').classList.contains('hidden')) {
        state.currentPage = state.pages.length - 1;
        render();
    } else {
        renderPageList();
    }
}

export function deletePage(e, pageIndex) {
    if (state.pages[pageIndex].bookmarks.length > 0) return showToast(t("msg_page_not_empty"), "error");
    const listItem = e.target.closest('.page-list-item');
    listItem.classList.add('fading-out');
    setTimeout(() => {
        state.pages.splice(pageIndex, 1);
        saveData();
        if (state.currentPage >= state.pages.length) state.currentPage = Math.max(0, state.pages.length - 1);
        render();
        renderPageList();
    }, 300);
}

// --- 主题控制 ---
export function openThemeControls(options = {}) {
    document.getElementById('user-dropdown').classList.remove('active');
    toggleEditMode(false);
    const controls = document.getElementById('theme-controls');
    controls.classList.toggle('long-press-origin', options.source === 'longPress');
    controls.classList.remove('hidden');
}

export function closeThemeControls() {
    document.getElementById('theme-controls').classList.add('hidden');
    // 关闭时恢复动画
    startPillAnimation();
}export function quickChangeTheme(color, pattern) {
    changeTheme(color, null, pattern);
}

export function initTheme() {
    const savedColor = localStorage.getItem('themeColor') || '#e4d0e5';
    const savedPattern = localStorage.getItem('themePattern') || 'none';
    changeTheme(savedColor, null, savedPattern);
}

export function changeTheme(color, element, pattern) {
    const bg = document.querySelector('.background-layer');
    if (color) {
        bg.style.backgroundColor = color;
        localStorage.setItem('themeColor', color);
        document.body.classList.toggle('dark-mode', color === '#1a1a1a');
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', color);
        if (element) {
            document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            element.classList.add('active');
        }
    }
    if (pattern) {
        localStorage.setItem('themePattern', pattern);
        bg.classList.remove('bg-pattern-lines-d', 'bg-pattern-aurora', 'bg-pattern-flow');
        if (pattern !== 'none') {
            bg.classList.add(pattern);
        }
        document.querySelectorAll('.pattern-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.pattern === pattern);
        });
    }
}// --- Swiper 逻辑 (Swiper) ---
export function initSwiper() {
    const swiper = document.getElementById('bookmark-swiper');
    if (!swiper) return;
    initDockMagnification();
    initLongPressGestures();
    swiper.addEventListener('mousedown', dragStart);
    swiper.addEventListener('touchstart', dragStart, { passive: true });
    swiper.addEventListener('mouseup', dragEnd);
    swiper.addEventListener('mouseleave', dragEnd);
    swiper.addEventListener('touchend', dragEnd);
    swiper.addEventListener('mousemove', drag);
    swiper.addEventListener('touchmove', drag, { passive: false });
    swiper.addEventListener('wheel', handleWheel, { passive: false });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTopModal();
            return;
        }
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

        const swiper = document.getElementById('bookmark-swiper');
        const swiperWidth = swiper ? swiper.clientWidth : window.innerWidth;
        const bounceOffset = swiperWidth * 0.2;

        if (e.key === 'ArrowLeft') {
            if (state.currentPage > 0) {
                state.currentPage--; updateSwiperPosition(true); renderPaginationDots();
            } else {
                triggerKeyboardBounce(bounceOffset);
            }
        }
        else if (e.key === 'ArrowRight') {
            if (state.currentPage < state.visualPages.length - 1) {
                state.currentPage++; updateSwiperPosition(true); renderPaginationDots();
            } else {
                triggerKeyboardBounce(-bounceOffset);
            }
        }
    });
}

function closeTopModal() {
    const modalIds = ['confirm-modal', 'auth-modal', 'pref-modal', 'dock-edit-modal', 'page-edit-modal', 'modal', 'help-modal'];
    for (const id of modalIds) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) {
            closeModalById(id);
            return;
        }
    }
    const menu = document.getElementById('user-dropdown');
    if (menu && menu.classList.contains('active')) {
        menu.classList.remove('active');
        startPillAnimation();
    }
}

export function closeModalById(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    try { closeDialog(id); } catch (e) { /* focus trap cleanup is non-critical */ }

    // Restore edit toolbar if it was hidden by this modal
    if (state.isEditing && (id === 'modal' || id === 'page-edit-modal' || id === 'dock-edit-modal')) {
        const controls = document.getElementById('edit-controls');
        if (controls) controls.classList.remove('hidden');
    }

    // Re-enable pill auto-hide animation
    startPillAnimation();
}

function triggerKeyboardBounce(offset) {
    const swiperWrapper = document.getElementById('bookmark-swiper-wrapper');
    const swiper = document.getElementById('bookmark-swiper');
    if (!swiperWrapper || !swiper) return;

    const swiperWidth = swiper.clientWidth;
    const baseTranslate = state.currentPage * -swiperWidth;

    swiperWrapper.style.transition = 'transform 0.15s cubic-bezier(0.215, 0.610, 0.355, 1.000)';
    swiperWrapper.style.transform = `translateX(${baseTranslate + offset}px)`;

    setTimeout(() => {
        swiperWrapper.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        swiperWrapper.style.transform = `translateX(${baseTranslate}px)`;
    }, 150);
}

// --- 统一坐标获取 ---
function getPositionX(e) { return e.type.includes('mouse') ? e.clientX : e.touches[0].clientX; }
function getPositionY(e) { return e.type.includes('mouse') ? e.clientY : e.touches[0].clientY; }

function dragStart(e) {
    // 编辑模式下点书签，交给 Sortable，我们不管
    if (state.isEditing && e.target.closest('.bookmark-item')) { state.isDragging = false; return; }

    state.isDragging = true;
    state.hasDragged = false;

    // 初始化锁定状态
    state.isScrolling = false;
    state.dragDirectionLocked = false;

    // 记录起始数据，用于方向判断和“手动点击”判断
    state.startPos = getPositionX(e);
    state.startPosY = getPositionY(e);
    state.touchStartTime = Date.now();

    state.animationID = requestAnimationFrame(animation);
    const wrapper = document.getElementById('bookmark-swiper-wrapper');
    if(wrapper) wrapper.style.transition = 'none';
}

function drag(e) {
    if (!state.isDragging) return;
    if (state.isScrolling) return; // 已锁定为滚动，忽略水平移动

    const cx = getPositionX(e);
    const cy = getPositionY(e);
    const diffX = cx - state.startPos;
    const diffY = cy - state.startPosY;

    // --- 方向锁定逻辑 (Dead Zone) ---
    if (!state.dragDirectionLocked) {
        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);

        if (absX > 15 || absY > 15) {
            state.dragDirectionLocked = true;
            if (absY > absX) {
                state.isScrolling = true;
                return;
            }
        } else {
            // 移动小于 15px，视为死区，不动作，也不标记 hasDragged
            return;
        }
    }

    // 只有明确为水平移动且超过死区，才标记为“已拖拽”
    state.hasDragged = true;
    state.currentTranslate = state.prevTranslate + diffX;

    if (e.cancelable) e.preventDefault();
}

function dragEnd(e) {
    if (!state.isDragging) return;
    state.isDragging = false;
    cancelAnimationFrame(state.animationID);

    // --- 核心修复：手动接管“点击”逻辑 (Manual Tap) ---
    // 如果没有发生拖拽，没有发生滚动，且按住时间很短，则视为“点击”
    const duration = Date.now() - state.touchStartTime;
    const isTap = !state.hasDragged && !state.isScrolling && duration < 600;

    // 仅针对触摸设备 (touchend) 启用手动接管，鼠标继续用 onclick
    if (isTap && e.type === 'touchend') {
        const item = e.target.closest('.bookmark-item');
        // 排除删除按钮 (删除按钮有自己的 onclick)
        if (item && !e.target.closest('.delete-btn')) {
            e.preventDefault(); // 阻止浏览器触发默认 click，防止双重触发

            // 执行跳转或打开编辑
            if (!state.isEditing) {
                openBookmark(findBookmarkById(item.dataset.id));
            }
            // 编辑模式下的点击由 Sortable 或其他逻辑处理，或者如果需要也可在此添加
        }
    }

    // 处理翻页逻辑
    const movedBy = state.currentTranslate - state.prevTranslate;
    const swiper = document.getElementById('bookmark-swiper');
    const swiperWidth = swiper ? swiper.clientWidth : 1;
    let targetPage = state.currentPage;

    if (state.hasDragged) {
        if (movedBy < -swiperWidth * 0.15 && state.currentPage < state.visualPages.length - 1) targetPage++;
        else if (movedBy > swiperWidth * 0.15 && state.currentPage > 0) targetPage--;
    }
    state.currentPage = targetPage;
    updateSwiperPosition(true);
    renderPaginationDots();
}

function animation() { setSwiperPosition(); if (state.isDragging) requestAnimationFrame(animation); }
function setSwiperPosition() {
    const wrapper = document.getElementById('bookmark-swiper-wrapper');
    if(wrapper) wrapper.style.transform = `translateX(${state.currentTranslate}px)`;
}
function updateSwiperPosition(withTransition = true) {
    const swiperWrapper = document.getElementById('bookmark-swiper-wrapper');
    const swiper = document.getElementById('bookmark-swiper');
    if (!swiperWrapper || !swiper) return;
    const swiperWidth = swiper.clientWidth;
    state.currentTranslate = state.currentPage * -swiperWidth;
    state.prevTranslate = state.currentTranslate;
    if (withTransition) swiperWrapper.style.transition = 'transform 0.2s ease-out';
    setSwiperPosition();
}
function handleWheel(e) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) return;
    e.preventDefault();
    const swiperWrapper = document.getElementById('bookmark-swiper-wrapper');
    if(!swiperWrapper) return;
    swiperWrapper.style.transition = 'none';

    state.currentTranslate -= (e.deltaX * 0.75);
    setSwiperPosition();

    clearTimeout(state.wheelTimeout);
    state.wheelTimeout = setTimeout(() => {
        const swiper = document.getElementById('bookmark-swiper');
        const swiperWidth = swiper ? swiper.clientWidth : window.innerWidth;
        const moveOffset = state.currentTranslate - (state.currentPage * -swiperWidth);
        let targetPage = state.currentPage;
        if (moveOffset < -swiperWidth * 0.05) targetPage++;
        else if (moveOffset > swiperWidth * 0.05) targetPage--;
        state.currentPage = Math.max(0, Math.min(state.visualPages.length - 1, targetPage));
        updateSwiperPosition(true); renderPaginationDots();
    }, 60);
}

function renderPaginationDots() {
    const dotsContainer = document.getElementById('pagination-dots');
    if(!dotsContainer) return;
    dotsContainer.innerHTML = '';
    for (let i = 0; i < state.visualPages.length; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot';
        if (i === state.currentPage) dot.classList.add('active');

        // 配合 CSS 显示标题
        dot.setAttribute('data-title', state.visualPages[i].title || `Page ${i + 1}`);

        dot.addEventListener('click', (e) => { e.stopPropagation(); state.currentPage = i; updateSwiperPosition(true); renderPaginationDots(); });
        dotsContainer.appendChild(dot);
    }
    dotsContainer.classList.add('visible');
    if(state.dotsTimer) clearTimeout(state.dotsTimer);
    state.dotsTimer = setTimeout(() => dotsContainer.classList.remove('visible'), 2000);
}

// --- 编辑与交互 (保持不变) ---
export function toggleEditMode(enable) {
    state.isEditing = enable;
    document.body.classList.toggle('is-editing', enable);
    const controls = document.getElementById('edit-controls');
    document.getElementById('theme-controls').classList.add('hidden');

    if (enable) controls.classList.remove('hidden');
    else {
        controls.classList.add('hidden');
        state.sortableInstances.forEach(instance => instance.destroy());
        state.sortableInstances = [];
        // 退出编辑时恢复动画
        startPillAnimation();
    }
    render();
}

function initSortable() {
    if (!state.isEditing) return;
    document.querySelectorAll('.bookmark-page-content').forEach(content => {
        const instance = new Sortable(content, {
            group: 'shared-bookmarks', animation: 350, ghostClass: 'sortable-ghost', dragClass: 'sortable-drag', forceFallback: true,
            onEnd: function (evt) {
                const itemEl = evt.item; const newRect = itemEl.getBoundingClientRect(); const fallbackEl = document.querySelector('.sortable-drag');
                if (fallbackEl) {
                    const oldRect = fallbackEl.getBoundingClientRect(); const dx = oldRect.left - newRect.left; const dy = oldRect.top - newRect.top;
                    requestAnimationFrame(() => { itemEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`; itemEl.style.transition = 'transform 0s'; requestAnimationFrame(() => { itemEl.style.transform = 'translate3d(0, 0, 0)'; itemEl.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)'; }); });
                }
                const bookmarkMap = new Map(); state.pages.forEach(page => page.bookmarks.forEach(bookmark => bookmarkMap.set(bookmark.id, bookmark)));
                const newPages = []; const pageElements = document.querySelectorAll('.bookmark-page'); state.pages.forEach((p, i) => newPages[i] = { ...p, bookmarks: [] });
                pageElements.forEach(pageEl => {
                    const originalPageIndex = parseInt(pageEl.dataset.originalPageIndex); const bookmarkElements = pageEl.querySelectorAll('.bookmark-item');
                    bookmarkElements.forEach(itemEl => {
                        const bookmarkId = itemEl.dataset.id; const bookmark = bookmarkMap.get(bookmarkId);
                        if (bookmark && newPages[originalPageIndex]) newPages[originalPageIndex].bookmarks.push(bookmark);
                    });
                });
                state.pages = newPages.filter(p => p && Array.isArray(p.bookmarks));

                updateSyncStatus('saving');
                debouncedSaveData();
                setTimeout(() => { render(); }, 10);
            }
        });
        state.sortableInstances.push(instance);
    });
}

// 【新增】辅助函数：实时更新预览药丸的文字

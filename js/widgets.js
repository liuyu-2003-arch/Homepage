import { state } from './state.js?v=2.9.25';
import { t, showToast, safeUrl } from './utils.js?v=2.9.25';
import {
    getAllBookmarks,
    getBookmarkKey,
    getPinnedBookmarks,
    getRecentBookmarks,
    openBookmark
} from './ui.js?v=2.9.25';

const WIDGET_STORAGE_KEY = 'homepageWidgets:v1';
const SNAP_SIZE = 8;
const COLLISION_GAP = 6;
const MAX_SEARCH_RESULTS = 6;

const WIDGET_DEFINITIONS = [
    { id: 'clock', type: 'clock', labelKey: 'widget_clock', icon: '\u25f7' },
    { id: 'search', type: 'search', labelKey: 'widget_search', icon: '\u2315' },
    { id: 'pinned', type: 'pinned', labelKey: 'widget_pinned', icon: '\u2605' },
    { id: 'recent', type: 'recent', labelKey: 'widget_recent', icon: '\u2197' }
];

const DEFAULT_ITEMS = [
    { id: 'clock', type: 'clock', visible: true, x: 0.02, y: 0.04 },
    { id: 'search', type: 'search', visible: true, x: 0.98, y: 0.04 },
    { id: 'pinned', type: 'pinned', visible: true, x: 0.02, y: 0.96 },
    { id: 'recent', type: 'recent', visible: true, x: 0.98, y: 0.96 }
];

let initialized = false;
let layer = null;
let toolbar = null;
let toggleContainer = null;
let editHint = null;
let widgetConfig = loadWidgetConfig();
let editReturnFocus = null;
let editReturnWidgetId = null;
let searchQuery = '';
let activeSearchIndex = -1;
let clockTimer = null;
let positionFrame = null;
let dragState = null;

function cloneDefaultItems() {
    return DEFAULT_ITEMS.map(item => ({ ...item }));
}

function clampRatio(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

function loadWidgetConfig() {
    const defaults = cloneDefaultItems();
    try {
        const raw = localStorage.getItem(WIDGET_STORAGE_KEY);
        if (!raw) return { version: 1, items: defaults };

        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) {
            return { version: 1, items: defaults };
        }

        const items = defaults.map((fallback) => {
            const stored = parsed.items.find(item => item && item.id === fallback.id);
            if (!stored || stored.type !== fallback.type) return { ...fallback };
            return {
                ...fallback,
                visible: typeof stored.visible === 'boolean' ? stored.visible : fallback.visible,
                x: clampRatio(stored.x, fallback.x),
                y: clampRatio(stored.y, fallback.y)
            };
        });

        return { version: 1, items };
    } catch {
        return { version: 1, items: defaults };
    }
}

function saveWidgetConfig() {
    try {
        localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(widgetConfig));
        return true;
    } catch {
        showToast(t('msg_save_fail'), 'error');
        return false;
    }
}

function getDefinition(id) {
    return WIDGET_DEFINITIONS.find(definition => definition.id === id);
}

function getConfiguredItem(id) {
    return widgetConfig.items.find(item => item.id === id);
}

function getSafeBounds() {
    if (!layer) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    const styles = getComputedStyle(layer);
    const left = Math.max(0, parseFloat(styles.getPropertyValue('--widget-safe-left')) || 0);
    const top = Math.max(0, parseFloat(styles.getPropertyValue('--widget-safe-top')) || 0);
    const right = Math.max(0, parseFloat(styles.getPropertyValue('--widget-safe-right')) || 0);
    const bottom = Math.max(0, parseFloat(styles.getPropertyValue('--widget-safe-bottom')) || 0);
    const width = Math.max(0, layer.clientWidth - left - right);
    const height = Math.max(0, layer.clientHeight - top - bottom);
    return {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height
    };
}

function getElementForItem(item) {
    return layer?.querySelector(`.widget-card[data-widget-id="${item.id}"]`) || null;
}

function getTravelSize(item, element) {
    const bounds = getSafeBounds();
    const width = Math.max(0, bounds.width - element.offsetWidth);
    const height = Math.max(0, bounds.height - element.offsetHeight);
    return { bounds, maxX: width, maxY: height };
}

function applyWidgetPosition(item) {
    const element = getElementForItem(item);
    if (!element) return null;
    const { bounds, maxX, maxY } = getTravelSize(item, element);
    item.x = maxX > 0 ? Math.min(1, Math.max(0, item.x)) : 0;
    item.y = maxY > 0 ? Math.min(1, Math.max(0, item.y)) : 0;
    element.style.left = `${bounds.left + item.x * maxX}px`;
    element.style.top = `${bounds.top + item.y * maxY}px`;
    return element;
}

function positionWidgets({ save = false } = {}) {
    if (!layer) return;
    let changed = false;
    widgetConfig.items.forEach((item) => {
        if (!item.visible) return;
        const element = getElementForItem(item);
        if (!element) return;
        const previousX = item.x;
        const previousY = item.y;
        applyWidgetPosition(item);
        changed = changed || previousX !== item.x || previousY !== item.y;
    });
    fitSearchWidget();
    if (save && changed) saveWidgetConfig();
}

function schedulePositionRefresh(options = {}) {
    if (positionFrame) cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(() => {
        positionFrame = null;
        positionWidgets(options);
    });
}

function getVisibleWidgetElements(excludedId = null) {
    if (!layer) return [];
    return [...layer.querySelectorAll('.widget-card')]
        .filter(element => element.dataset.widgetId !== excludedId);
}

function rectsOverlap(a, b, gap = 0) {
    return a.left < b.right + gap &&
        a.right + gap > b.left &&
        a.top < b.bottom + gap &&
        a.bottom + gap > b.top;
}

function isFreePosition(item, left, top, comparisonElements) {
    const element = getElementForItem(item);
    if (!element) return false;
    const bounds = getSafeBounds();
    const rect = {
        left,
        top,
        right: left + element.offsetWidth,
        bottom: top + element.offsetHeight
    };

    if (rect.left < bounds.left || rect.top < bounds.top ||
        rect.right > bounds.right || rect.bottom > bounds.bottom) {
        return false;
    }

    return !comparisonElements.some(other => rectsOverlap(rect, other.getBoundingClientRect(), COLLISION_GAP));
}

function buildSnapCoordinates(maxValue) {
    const values = [];
    if (maxValue <= 0) return [0];
    for (let value = 0; value <= maxValue; value += SNAP_SIZE) values.push(value);
    if (values[values.length - 1] !== maxValue) values.push(maxValue);
    return values;
}

function findNearestFreePosition(item, desiredLeft, desiredTop, comparisonElements) {
    const element = getElementForItem(item);
    if (!element) return null;
    const { bounds, maxX, maxY } = getTravelSize(item, element);
    const targetLeft = Math.min(bounds.right - element.offsetWidth, Math.max(bounds.left, desiredLeft));
    const targetTop = Math.min(bounds.bottom - element.offsetHeight, Math.max(bounds.top, desiredTop));
    const xValues = buildSnapCoordinates(maxX);
    const yValues = buildSnapCoordinates(maxY);
    const candidates = [];

    xValues.forEach((offsetX) => {
        yValues.forEach((offsetY) => {
            const left = bounds.left + offsetX;
            const top = bounds.top + offsetY;
            const distance = ((left - targetLeft) ** 2) + ((top - targetTop) ** 2);
            candidates.push({ left, top, distance });
        });
    });

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.find(candidate => isFreePosition(item, candidate.left, candidate.top, comparisonElements)) || null;
}

function setItemFromPosition(item, left, top) {
    const element = getElementForItem(item);
    if (!element) return;
    const { bounds, maxX, maxY } = getTravelSize(item, element);
    item.x = maxX > 0 ? (left - bounds.left) / maxX : 0;
    item.y = maxY > 0 ? (top - bounds.top) / maxY : 0;
    item.x = Math.min(1, Math.max(0, item.x));
    item.y = Math.min(1, Math.max(0, item.y));
    applyWidgetPosition(item);
}

function resolveAfterResize() {
    const processedElements = [];
    let changed = false;

    widgetConfig.items.forEach((item) => {
        if (!item.visible) return;
        const element = getElementForItem(item);
        if (!element) return;

        const beforeX = item.x;
        const beforeY = item.y;
        applyWidgetPosition(item);
        changed = changed || beforeX !== item.x || beforeY !== item.y;

        const currentRect = element.getBoundingClientRect();
        if (rectsOverlap(currentRect, { left: 0, top: 0, right: 0, bottom: 0 })) return;
        const collides = processedElements.some(other => rectsOverlap(currentRect, other.getBoundingClientRect(), COLLISION_GAP));
        if (collides) {
            const position = findNearestFreePosition(item, currentRect.left, currentRect.top, processedElements);
            if (position) {
                setItemFromPosition(item, position.left, position.top);
                changed = true;
            }
        }
        processedElements.push(element);
    });

    if (changed) saveWidgetConfig();
    fitSearchWidget();
}

function handleWidgetViewportResize() {
    if (!initialized) return;
    if (positionFrame) cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(() => {
        positionFrame = null;
        resolveAfterResize();
    });
}

function createBookmarkVisual(bookmark, className) {
    const visual = document.createElement('span');
    visual.className = className;
    visual.setAttribute('aria-hidden', 'true');
    const title = bookmark.title || bookmark.url || '';
    visual.textContent = title.charAt(0).toUpperCase() || 'A';

    const iconUrl = safeUrl(bookmark.icon, '');
    if (iconUrl) {
        const image = document.createElement('img');
        image.src = iconUrl;
        image.alt = '';
        image.referrerPolicy = 'no-referrer';
        image.loading = 'lazy';
        image.addEventListener('load', () => visual.replaceChildren(image), { once: true });
    }
    return visual;
}

function getBookmarkHost(bookmark) {
    try {
        return new URL(safeUrl(bookmark.url)).hostname.replace(/^www\./, '');
    } catch {
        return bookmark.url || '';
    }
}

function createWidgetHeader(definition) {
    const header = document.createElement('div');
    header.className = 'widget-card-header';

    const icon = document.createElement('span');
    icon.className = 'widget-card-header-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = definition.icon;

    const title = document.createElement('span');
    title.className = 'widget-card-title';
    title.textContent = t(definition.labelKey);

    header.append(icon, title);
    return header;
}

function createBaseWidget(definition) {
    const card = document.createElement('article');
    card.className = 'widget-card';
    card.dataset.widgetId = definition.id;
    card.dataset.widgetType = definition.type;
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', t(definition.labelKey));
    card.appendChild(createWidgetHeader(definition));
    return card;
}

function buildClockWidget(card) {
    const time = document.createElement('div');
    time.className = 'widget-clock-time';
    time.dataset.widgetClockTime = '';

    const date = document.createElement('div');
    date.className = 'widget-clock-date';
    date.dataset.widgetClockDate = '';

    card.append(time, date);
    updateClockText();
}

function updateClockText() {
    if (!layer) return;
    const now = new Date();
    const locale = i18nCurrentLanguage();
    let timeText = '';
    let dateText = '';

    try {
        timeText = new Intl.DateTimeFormat(locale, {
            hour: '2-digit',
            minute: '2-digit'
        }).format(now);
        dateText = new Intl.DateTimeFormat(locale, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        }).format(now);
    } catch {
        timeText = now.toLocaleTimeString();
        dateText = now.toLocaleDateString();
    }

    const time = layer.querySelector('[data-widget-clock-time]');
    const date = layer.querySelector('[data-widget-clock-date]');
    if (time) time.textContent = timeText;
    if (date) date.textContent = dateText;
}

function i18nCurrentLanguage() {
    return document.documentElement.lang || 'en';
}

function scheduleClock() {
    clearTimeout(clockTimer);
    clockTimer = null;
    if (document.hidden) return;
    updateClockText();
    const now = new Date();
    const delay = Math.max(1000, 60000 - (now.getSeconds() * 1000) - now.getMilliseconds());
    clockTimer = window.setTimeout(() => {
        updateClockText();
        scheduleClock();
    }, delay);
}

function buildSearchWidget(card) {
    const form = document.createElement('form');
    form.className = 'widget-search-form';
    form.setAttribute('role', 'search');
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        activateSearchResult(activeSearchIndex >= 0 ? activeSearchIndex : 0);
    });

    const icon = document.createElement('span');
    icon.className = 'widget-search-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u2315';

    const input = document.createElement('input');
    input.id = 'widget-search-input';
    input.className = 'widget-search-input';
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = searchQuery;
    input.placeholder = t('widget_search_placeholder');
    input.setAttribute('aria-label', t('widget_search_placeholder'));
    input.setAttribute('aria-controls', 'widget-search-results');
    input.setAttribute('aria-expanded', 'false');
    input.addEventListener('input', () => {
        searchQuery = input.value;
        activeSearchIndex = -1;
        renderSearchResults(card);
    });
    input.addEventListener('keydown', (event) => handleSearchKeydown(event, card));

    const results = document.createElement('div');
    results.id = 'widget-search-results';
    results.className = 'widget-search-results';
    results.setAttribute('role', 'listbox');
    results.hidden = true;

    form.append(icon, input, results);
    card.appendChild(form);
    renderSearchResults(card);
}

function getSearchResults(query) {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return [];
    return getAllBookmarks()
        .filter((bookmark) => {
            const fields = [bookmark.title, bookmark.url, bookmark.note];
            return fields.some(value => String(value || '').toLocaleLowerCase().includes(normalizedQuery));
        })
        .sort((a, b) => {
            const titleA = String(a.title || a.url || '').toLocaleLowerCase();
            const titleB = String(b.title || b.url || '').toLocaleLowerCase();
            return titleA.localeCompare(titleB);
        })
        .slice(0, MAX_SEARCH_RESULTS);
}

function renderSearchResults(card) {
    const input = card.querySelector('.widget-search-input');
    const results = card.querySelector('.widget-search-results');
    if (!input || !results) return;
    results.innerHTML = '';

    if (!searchQuery.trim()) {
        results.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        fitSearchWidget();
        return;
    }

    const matches = getSearchResults(searchQuery);
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');

    if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'widget-empty';
        empty.textContent = t('widget_no_results');
        results.appendChild(empty);
        input.removeAttribute('aria-activedescendant');
        activeSearchIndex = -1;
        fitSearchWidget();
        return;
    }

    activeSearchIndex = Math.min(Math.max(activeSearchIndex, 0), matches.length - 1);
    matches.forEach((bookmark, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'widget-search-result';
        option.id = `widget-search-result-${index}`;
        option.dataset.widgetBookmarkKey = getBookmarkKey(bookmark);
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(index === activeSearchIndex));
        option.tabIndex = -1;

        const visual = createBookmarkVisual(bookmark, 'widget-result-icon');
        const copy = document.createElement('span');
        copy.className = 'widget-result-copy';
        const title = document.createElement('span');
        title.className = 'widget-result-title';
        title.textContent = bookmark.title || bookmark.url;
        const meta = document.createElement('span');
        meta.className = 'widget-result-meta';
        meta.textContent = bookmark.note || getBookmarkHost(bookmark);
        copy.append(title, meta);
        option.append(visual, copy);
        option.addEventListener('keydown', (event) => handleSearchResultKeydown(event, card, index, matches.length));
        results.appendChild(option);
    });

    input.setAttribute('aria-activedescendant', `widget-search-result-${activeSearchIndex}`);
    fitSearchWidget();
}

function updateSearchSelection(card) {
    const options = [...card.querySelectorAll('.widget-search-result')];
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === activeSearchIndex)));
    const input = card.querySelector('.widget-search-input');
    if (input && options[activeSearchIndex]) {
        input.setAttribute('aria-activedescendant', options[activeSearchIndex].id);
        options[activeSearchIndex].scrollIntoView({ block: 'nearest' });
    }
}

function handleSearchKeydown(event, card) {
    const matches = getSearchResults(searchQuery);
    if (event.key === 'ArrowDown' && matches.length) {
        event.preventDefault();
        activeSearchIndex = (activeSearchIndex + 1) % matches.length;
        updateSearchSelection(card);
    } else if (event.key === 'ArrowUp' && matches.length) {
        event.preventDefault();
        activeSearchIndex = activeSearchIndex <= 0 ? matches.length - 1 : activeSearchIndex - 1;
        updateSearchSelection(card);
    } else if (event.key === 'Enter') {
        event.preventDefault();
        activateSearchResult(activeSearchIndex >= 0 ? activeSearchIndex : 0);
    } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSearchResults(card);
    }
}

function handleSearchResultKeydown(event, card, index, length) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        activeSearchIndex = event.key === 'ArrowDown'
            ? (index + 1) % length
            : (index - 1 + length) % length;
        updateSearchSelection(card);
        card.querySelectorAll('.widget-search-result')[activeSearchIndex]?.focus();
    } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSearchResults(card);
        card.querySelector('.widget-search-input')?.focus();
    }
}

function closeSearchResults(card) {
    const results = card.querySelector('.widget-search-results');
    const input = card.querySelector('.widget-search-input');
    if (results) results.hidden = true;
    if (input) {
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    }
    activeSearchIndex = -1;
    fitSearchWidget();
}

function activateSearchResult(index) {
    if (state.isWidgetEditing) return;
    const matches = getSearchResults(searchQuery);
    const bookmark = matches[index];
    if (!bookmark) return;
    openWidgetBookmark(bookmark);
}

function getWidgetListLimit() {
    if (window.innerHeight <= 410) return 1;
    if (window.innerHeight <= 520) return 2;
    if (window.innerWidth < 768) return 3;
    return 4;
}

function buildListWidget(card, type) {
    const list = document.createElement('div');
    list.className = 'widget-list';
    const bookmarks = type === 'pinned'
        ? getPinnedBookmarks(getWidgetListLimit())
        : getRecentBookmarks(getWidgetListLimit());

    if (bookmarks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'widget-empty';
        empty.textContent = t(type === 'pinned' ? 'widget_no_pinned' : 'widget_no_recent');
        list.appendChild(empty);
    } else {
        bookmarks.forEach((bookmark) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'widget-list-item';
            button.dataset.widgetBookmarkKey = getBookmarkKey(bookmark);
            button.setAttribute('aria-label', bookmark.title || bookmark.url);
            button.appendChild(createBookmarkVisual(bookmark, 'widget-list-icon'));

            const copy = document.createElement('span');
            copy.className = 'widget-list-copy';
            const title = document.createElement('span');
            title.className = 'widget-list-title';
            title.textContent = bookmark.title || bookmark.url;
            const meta = document.createElement('span');
            meta.className = 'widget-list-meta';
            meta.textContent = getBookmarkHost(bookmark);
            copy.append(title, meta);
            button.appendChild(copy);
            list.appendChild(button);
        });
    }
    card.appendChild(list);
}

function createWidgetCard(definition, item) {
    const card = createBaseWidget(definition);
    if (definition.type === 'clock') buildClockWidget(card);
    else if (definition.type === 'search') buildSearchWidget(card);
    else buildListWidget(card, definition.type);
    card.style.display = item.visible ? '' : 'none';
    return card;
}

function renderWidgetCards() {
    if (!layer) return;
    const focusId = document.activeElement?.id || null;
    const focusWidgetId = document.activeElement?.closest?.('.widget-card')?.dataset.widgetId || null;
    const selectionStart = document.activeElement?.selectionStart;
    const selectionEnd = document.activeElement?.selectionEnd;

    layer.querySelectorAll('.widget-card').forEach(card => card.remove());
    widgetConfig.items.forEach((item) => {
        const definition = getDefinition(item.id);
        if (!definition || !item.visible) return;
        layer.insertBefore(createWidgetCard(definition, item), toolbar);
    });

    renderWidgetToggles();
    requestAnimationFrame(() => {
        positionWidgets();
        if (focusId) {
            const element = document.getElementById(focusId);
            if (element && typeof element.focus === 'function') {
                element.focus({ preventScroll: true });
                if (typeof selectionStart === 'number' && typeof element.setSelectionRange === 'function') {
                    element.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        } else if (focusWidgetId) {
            layer.querySelector(`.widget-card[data-widget-id="${focusWidgetId}"]`)
                ?.focus({ preventScroll: true });
        }
    });
}

function renderWidgetToggles() {
    if (!toggleContainer) return;
    toggleContainer.innerHTML = '';
    widgetConfig.items.forEach((item) => {
        const definition = getDefinition(item.id);
        if (!definition) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.widgetToggle = item.id;
        button.setAttribute('aria-pressed', String(item.visible));
        button.setAttribute('aria-label', t(definition.labelKey));

        const icon = document.createElement('span');
        icon.className = 'widget-toggle-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = definition.icon;
        const label = document.createElement('span');
        label.textContent = t(definition.labelKey);
        button.append(icon, label);
        toggleContainer.appendChild(button);
    });
}

function renderWidgetLayer() {
    if (!initialized) return;
    renderWidgetCards();
    scheduleClock();
}

function refreshWidgetData() {
    renderWidgetLayer();
}

function openWidgetBookmark(bookmark) {
    if (state.isWidgetEditing) return;
    openBookmark(bookmark);
}

function findBookmarkByKey(key) {
    return getAllBookmarks().find(bookmark => getBookmarkKey(bookmark) === key) || null;
}

function fitSearchWidget() {
    if (!layer) return;
    const searchCard = layer.querySelector('.widget-card[data-widget-id="search"]');
    if (!searchCard) return;
    const results = searchCard.querySelector('.widget-search-results');
    if (!results) return;

    const bottomTops = [...layer.querySelectorAll('.widget-card[data-widget-id="pinned"], .widget-card[data-widget-id="recent"]')]
        .map(element => element.getBoundingClientRect().top);
    const searchTop = searchCard.getBoundingClientRect().top;
    const available = bottomTops.length ? Math.min(...bottomTops) - searchTop - COLLISION_GAP : Infinity;

    if (Number.isFinite(available)) {
        const preferredMinimum = window.innerHeight <= 410 ? 76 : 92;
        const minimum = Math.min(preferredMinimum, Math.max(0, available));
        searchCard.style.minHeight = `${minimum}px`;
        searchCard.style.maxHeight = `${Math.max(minimum, available)}px`;
    } else {
        searchCard.style.removeProperty('min-height');
        searchCard.style.removeProperty('max-height');
    }

    const headerHeight = searchCard.querySelector('.widget-card-header')?.offsetHeight || 0;
    const inputHeight = searchCard.querySelector('.widget-search-input')?.offsetHeight || 0;
    const form = searchCard.querySelector('.widget-search-form');
    const formStyles = form ? getComputedStyle(form) : null;
    const resultStyles = getComputedStyle(results);
    const formPadding = formStyles
        ? (parseFloat(formStyles.paddingTop) || 0) + (parseFloat(formStyles.paddingBottom) || 0)
        : 0;
    const resultMargin = results.hidden ? 0 : (parseFloat(resultStyles.marginTop) || 0);
    const fixedContent = headerHeight + inputHeight + formPadding + resultMargin + 2;
    const availableResults = Number.isFinite(available)
        ? Math.max(0, available - fixedContent)
        : (window.innerHeight <= 410 ? 34 : Math.min(244, Math.round(window.innerHeight * 0.34)));
    results.style.maxHeight = `${availableResults}px`;
}

function beginWidgetDrag(event) {
    if (!state.isWidgetEditing || event.button > 0) return;
    if (event.target.closest('button, input, a, .widget-toolbar')) return;
    const card = event.target.closest('.widget-card');
    if (!card) return;
    const item = getConfiguredItem(card.dataset.widgetId);
    if (!item) return;

    event.preventDefault();
    event.stopPropagation();
    const startRect = card.getBoundingClientRect();
    const previous = { x: item.x, y: item.y };
    dragState = {
        pointerId: event.pointerId,
        card,
        item,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startLeft: startRect.left,
        startTop: startRect.top,
        previous,
        moved: false
    };
    card.classList.add('is-dragging');
    try {
        card.setPointerCapture(event.pointerId);
    } catch {
        // Pointer capture is best-effort; the document listeners still work.
    }
    card.addEventListener('pointermove', moveWidgetDrag);
    card.addEventListener('pointerup', endWidgetDrag);
    card.addEventListener('pointercancel', cancelWidgetDrag);
}

function moveWidgetDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    const { card, item } = dragState;
    const { bounds, maxX, maxY } = getTravelSize(item, card);
    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) dragState.moved = true;

    const desiredLeft = Math.min(bounds.right - card.offsetWidth, Math.max(bounds.left, dragState.startLeft + deltaX));
    const desiredTop = Math.min(bounds.bottom - card.offsetHeight, Math.max(bounds.top, dragState.startTop + deltaY));
    item.x = maxX > 0 ? (desiredLeft - bounds.left) / maxX : 0;
    item.y = maxY > 0 ? (desiredTop - bounds.top) / maxY : 0;
    applyWidgetPosition(item);
    fitSearchWidget();
}

function cleanupWidgetDrag() {
    if (!dragState) return;
    const { card } = dragState;
    card.classList.remove('is-dragging');
    card.removeEventListener('pointermove', moveWidgetDrag);
    card.removeEventListener('pointerup', endWidgetDrag);
    card.removeEventListener('pointercancel', cancelWidgetDrag);
    try {
        card.releasePointerCapture(dragState.pointerId);
    } catch {
        // The pointer may already have been released by the browser.
    }
}

function endWidgetDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const stateToFinish = dragState;
    cleanupWidgetDrag();
    dragState = null;

    if (!stateToFinish.moved) {
        stateToFinish.item.x = stateToFinish.previous.x;
        stateToFinish.item.y = stateToFinish.previous.y;
        applyWidgetPosition(stateToFinish.item);
        return;
    }

    const rect = stateToFinish.card.getBoundingClientRect();
    const comparisonElements = getVisibleWidgetElements(stateToFinish.item.id);
    const position = findNearestFreePosition(
        stateToFinish.item,
        rect.left,
        rect.top,
        comparisonElements
    );

    if (position) {
        setItemFromPosition(stateToFinish.item, position.left, position.top);
        saveWidgetConfig();
    } else {
        stateToFinish.item.x = stateToFinish.previous.x;
        stateToFinish.item.y = stateToFinish.previous.y;
        applyWidgetPosition(stateToFinish.item);
        showToast(t('widget_place_failed'), 'error');
    }
    fitSearchWidget();
}

function cancelWidgetDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const item = dragState.item;
    const previous = dragState.previous;
    cleanupWidgetDrag();
    dragState = null;
    item.x = previous.x;
    item.y = previous.y;
    applyWidgetPosition(item);
}

function moveWidgetWithKeyboard(item, deltaX, deltaY) {
    const element = getElementForItem(item);
    if (!element) return;
    const previous = { x: item.x, y: item.y };
    const desiredLeft = element.offsetLeft + deltaX;
    const desiredTop = element.offsetTop + deltaY;
    const comparisonElements = getVisibleWidgetElements(item.id);
    const relativePositionIsFree = isFreePosition(
        item,
        desiredLeft,
        desiredTop,
        comparisonElements
    );
    const position = findNearestFreePosition(
        item,
        desiredLeft,
        desiredTop,
        comparisonElements
    );

    if (!position && !relativePositionIsFree) {
        showToast(t('widget_place_failed'), 'error');
        return;
    }
    setItemFromPosition(
        item,
        relativePositionIsFree ? desiredLeft : position.left,
        relativePositionIsFree ? desiredTop : position.top
    );
    if (item.x !== previous.x || item.y !== previous.y) saveWidgetConfig();
    element.focus({ preventScroll: true });
    fitSearchWidget();
}

function handleWidgetKeyboard(event) {
    if (!state.isWidgetEditing) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeWidgetEdit();
        return;
    }

    const card = event.target.closest?.('.widget-card');
    if (!card || event.target.matches('input, textarea, button')) return;
    const deltas = {
        ArrowLeft: [-SNAP_SIZE, 0],
        ArrowRight: [SNAP_SIZE, 0],
        ArrowUp: [0, -SNAP_SIZE],
        ArrowDown: [0, SNAP_SIZE]
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    moveWidgetWithKeyboard(getConfiguredItem(card.dataset.widgetId), delta[0], delta[1]);
}

function toggleWidgetVisibility(id) {
    const item = getConfiguredItem(id);
    if (!item) return;
    item.visible = !item.visible;

    if (item.visible) {
        const definition = getDefinition(id);
        layer.insertBefore(createWidgetCard(definition, item), toolbar);
        applyWidgetPosition(item);
        const position = findNearestFreePosition(
            item,
            getElementForItem(item).getBoundingClientRect().left,
            getElementForItem(item).getBoundingClientRect().top,
            getVisibleWidgetElements(item.id)
        );
        if (!position) {
            item.visible = false;
            getElementForItem(item)?.remove();
            showToast(t('widget_place_failed'), 'error');
        } else {
            setItemFromPosition(item, position.left, position.top);
        }
    } else {
        getElementForItem(item)?.remove();
    }

    saveWidgetConfig();
    renderWidgetToggles();
    schedulePositionRefresh();
}

function resetWidgetLayout() {
    widgetConfig = { version: 1, items: cloneDefaultItems() };
    saveWidgetConfig();
    renderWidgetLayer();
}

function openWidgetEdit(trigger) {
    if (state.isWidgetEditing) return;
    state.isWidgetEditing = true;
    editReturnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
    editReturnWidgetId = trigger instanceof HTMLElement && trigger.classList.contains('widget-card')
        ? trigger.dataset.widgetId
        : null;
    document.body.classList.add('is-widget-editing');
    document.body.classList.remove('long-press-widget-armed', 'long-press-widget-active');
    toolbar?.classList.remove('hidden');
    editHint?.classList.remove('hidden');
    renderWidgetLayer();
    requestAnimationFrame(() => {
        positionWidgets();
        if (editReturnWidgetId) {
            layer?.querySelector(`.widget-card[data-widget-id="${editReturnWidgetId}"]`)
                ?.focus({ preventScroll: true });
        } else {
            toolbar?.querySelector('button')?.focus({ preventScroll: true });
        }
    });
}

function openWidgetEditFromLongPress(event) {
    const card = layer?.querySelector(`.widget-card[data-widget-id="${event.detail.widgetId}"]`);
    editReturnWidgetId = event.detail.widgetId;
    openWidgetEdit(card || document.activeElement);
}

function closeWidgetEdit() {
    if (!state.isWidgetEditing) return;
    state.isWidgetEditing = false;
    document.body.classList.remove('is-widget-editing', 'long-press-widget-armed', 'long-press-widget-active');
    toolbar?.classList.add('hidden');
    editHint?.classList.add('hidden');
    positionWidgets();

    let focusTarget = editReturnFocus;
    if ((!focusTarget || !focusTarget.isConnected) && editReturnWidgetId) {
        focusTarget = layer?.querySelector(`.widget-card[data-widget-id="${editReturnWidgetId}"]`);
    }
    editReturnFocus = null;
    editReturnWidgetId = null;
    requestAnimationFrame(() => focusTarget?.focus?.({ preventScroll: true }));
}

function handleToolbarClick(event) {
    const toggle = event.target.closest('[data-widget-toggle]');
    if (toggle) {
        toggleWidgetVisibility(toggle.dataset.widgetToggle);
        return;
    }
    const action = event.target.closest('[data-widget-action]')?.dataset.widgetAction;
    if (action === 'reset') resetWidgetLayout();
    if (action === 'done') closeWidgetEdit();
}

function handleLayerClick(event) {
    const bookmarkButton = event.target.closest('[data-widget-bookmark-key]');
    if (!bookmarkButton) return;
    const bookmark = findBookmarkByKey(bookmarkButton.dataset.widgetBookmarkKey);
    if (bookmark) openWidgetBookmark(bookmark);
}

function initWidgetLayer() {
    if (initialized) return;
    layer = document.getElementById('widget-layer');
    toolbar = document.getElementById('widget-toolbar');
    toggleContainer = document.getElementById('widget-toggles');
    editHint = document.getElementById('widget-edit-hint');
    if (!layer || !toolbar || !toggleContainer || !editHint) return;
    initialized = true;

    layer.addEventListener('pointerdown', beginWidgetDrag);
    layer.addEventListener('click', handleLayerClick);
    toolbar.addEventListener('click', handleToolbarClick);
    document.addEventListener('homepage:widget-edit-request', openWidgetEditFromLongPress);
    document.addEventListener('keydown', handleWidgetKeyboard, true);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearTimeout(clockTimer);
            clockTimer = null;
        } else {
            scheduleClock();
        }
    });
    window.addEventListener('pagehide', () => clearTimeout(clockTimer));
    renderWidgetLayer();
}

export {
    initWidgetLayer,
    refreshWidgetData,
    renderWidgetLayer,
    handleWidgetViewportResize,
    openWidgetEdit
};

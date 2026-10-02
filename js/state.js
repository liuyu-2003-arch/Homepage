export const state = {
    pages: [],
    visualPages: [],
    visualPageSize: 0,
    currentUser: null,
    isEditing: false,
    sortableInstances: [],
    pageListSortable: null,
    currentPage: 0,
    // 编辑相关
    currentEditInfo: { pageIndex: -1, bookmarkIndex: -1 },
    selectedAvatarUrl: '',
    prefAvatarUrl: '',
    // 拖拽相关
    isDragging: false,
    hasDragged: false,
    startPos: 0,
    currentTranslate: 0,
    prevTranslate: 0,
    animationID: null,
    dotsTimer: null,
    wheelTimeout: null,
    isWheelScrolling: false,
    wheelPeakOffset: 0
};

const DEFAULT_ACCOUNT_EMAILS = ['jemchmi@gmail.com'];

export function isDefaultAccount(user = state.currentUser) {
    return Boolean(user?.email) && DEFAULT_ACCOUNT_EMAILS.includes(user.email.trim().toLowerCase());
}

// Simple event bus — breaks circular dependency between api.js and ui.js
const listeners = new Map();
let pendingEvents = new Set();
let flushScheduled = false;

export function onDataReloaded(fn) {
    if (!listeners.has('dataReloaded')) listeners.set('dataReloaded', []);
    listeners.get('dataReloaded').push(fn);
}

export function emit(event) {
    pendingEvents.add(event);
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(() => {
        flushScheduled = false;
        const events = [...pendingEvents];
        pendingEvents.clear();
        events.forEach(ev => (listeners.get(ev) || []).forEach(fn => fn()));
    });
}

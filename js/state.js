export const state = {
    pages: [],
    visualPages: [],
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
    wheelTimeout: null
};

// Simple event bus — breaks circular dependency between api.js and ui.js
const listeners = new Map();

export function onDataReloaded(fn) {
    if (!listeners.has('dataReloaded')) listeners.set('dataReloaded', []);
    listeners.get('dataReloaded').push(fn);
}

export function emit(event) {
    (listeners.get(event) || []).forEach(fn => fn());
}
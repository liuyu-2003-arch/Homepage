// Simple logger utility
// Set DEBUG=true in localStorage to enable console output
const DEBUG_KEY = 'homepage_debug';

export const logger = {
    _debug: null,
    isDebug() {
        if (this._debug === null) {
            this._debug = localStorage.getItem(DEBUG_KEY) === 'true';
        }
        return this._debug;
    },
    enableDebug() {
        localStorage.setItem(DEBUG_KEY, 'true');
        this._debug = true;
    },
    disableDebug() {
        localStorage.removeItem(DEBUG_KEY);
        this._debug = false;
    },
    error(...args) {
        if (this.isDebug()) {
            console.error('[Homepage]', ...args);
        }
    },
    warn(...args) {
        if (this.isDebug()) {
            console.warn('[Homepage]', ...args);
        }
    },
    log(...args) {
        if (this.isDebug()) {
            console.log('[Homepage]', ...args);
        }
    }
};

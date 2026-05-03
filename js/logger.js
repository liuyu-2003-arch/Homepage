// Simple logger utility - Debug mode enabled by default
export const logger = {
    _debug: true,
    isDebug() {
        return this._debug;
    },
    enableDebug() {
        this._debug = true;
    },
    disableDebug() {
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

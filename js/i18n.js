import { logger } from './logger.js?v=2.9.71';
import { CONFIG } from './config.js?v=2.9.71';

let enTranslations = {};
let currentTranslations = {};
const translationPromises = new Map();
let translationRequestId = 0;

async function fetchLanguageFile(lang) {
    try {
        // 带上版本号，避免浏览器/Service Worker 用旧的翻译缓存（locales 的缓存
        // 策略较长，不加版本号会让新文案延迟到缓存过期才生效）。
        const response = await fetch(`locales/${lang}.json?v=${CONFIG.APP_VERSION}`);
        if (!response.ok) {
            logger.error(`Could not load translation file: ${lang}.json`);
            return {};
        }
        return await response.json();
    } catch (error) {
        logger.error(`Error fetching ${lang}.json:`, error);
        return {};
    }
}

function getCachedLanguage(lang) {
    if (!translationPromises.has(lang)) {
        const promise = fetchLanguageFile(lang);
        translationPromises.set(lang, promise);
        promise.then((translations) => {
            if ((!translations || Object.keys(translations).length === 0) &&
                translationPromises.get(lang) === promise) {
                translationPromises.delete(lang);
            }
        });
    }
    return translationPromises.get(lang);
}

export const i18n = {
    currentLang: localStorage.getItem('appLang') || 'en',

    async loadTranslations(lang) {
        const selectedLang = lang || 'en';
        const requestId = ++translationRequestId;
        const englishPromise = getCachedLanguage('en');
        const selectedPromise = selectedLang === 'en'
            ? englishPromise
            : getCachedLanguage(selectedLang);
        const [english, selected] = await Promise.all([englishPromise, selectedPromise]);

        if (requestId !== translationRequestId) return;

        enTranslations = english;
        currentTranslations = selectedLang === 'en' ? english : selected;
        this.currentLang = selectedLang;
        localStorage.setItem('appLang', selectedLang);
        this.updateTexts();
    },

    t(key) {
        return currentTranslations[key] || enTranslations[key] || key;
    },

    updateTexts() {
        document.documentElement.lang = this.currentLang;
        document.title = this.t('app_title');
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                el.textContent = this.t(key);
            }
        });

        const placeholderElements = {
            'input-url': 'ph_url', 'input-title': 'ph_title', 'input-note': 'ph_note', 'input-icon': 'ph_icon',
            'pref-name': 'label_display_name',
            'pref-current-password': 'label_current_password', 'pref-new-password': 'ph_new_password'
        };
        for (const [id, key] of Object.entries(placeholderElements)) {
            const el = document.getElementById(id);
            if (el) {
                el.placeholder = this.t(key);
            }
        }
    }
};

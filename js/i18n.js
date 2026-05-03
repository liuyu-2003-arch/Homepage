import { logger } from './logger.js';

let enTranslations = {};
let currentTranslations = {};

async function fetchLanguageFile(lang) {
    try {
        const response = await fetch(`locales/${lang}.json`);
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

export const i18n = {
    currentLang: localStorage.getItem('appLang') || 'en',

    async loadTranslations(lang) {
        if (Object.keys(enTranslations).length === 0) {
            enTranslations = await fetchLanguageFile('en');
        }

        if (lang === 'en') {
            currentTranslations = enTranslations;
        } else {
            currentTranslations = await fetchLanguageFile(lang);
        }

        this.currentLang = lang;
        localStorage.setItem('appLang', lang);
        this.updateTexts();
    },

    t(key) {
        return currentTranslations[key] || enTranslations[key] || key;
    },

    updateTexts() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                el.textContent = this.t(key);
            }
        });

        const placeholderElements = {
            'input-url': 'ph_url', 'input-title': 'ph_title', 'input-icon': 'ph_icon',
            'pref-name': 'label_display_name', 'pref-phone': 'label_phone'
        };
        for (const [id, key] of Object.entries(placeholderElements)) {
            const el = document.getElementById(id);
            if (el) {
                el.placeholder = this.t(key);
            }
        }
    }
};

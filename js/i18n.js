// js/i18n.js

// These will store our translation data
let enTranslations = {};
let currentTranslations = {};

// Fetches a single language JSON file
async function fetchLanguageFile(lang) {
    try {
        const response = await fetch(`locales/${lang}.json`);
        if (!response.ok) {
            console.error(`Could not load translation file: ${lang}.json`);
            return {}; // Return an empty object if the file is not found
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching ${lang}.json:`, error);
        return {};
    }
}

export const i18n = {
    currentLang: localStorage.getItem('appLang') || 'en',

    /**
     * Loads translations for the given language.
     * It always ensures that English is loaded as a fallback.
     * @param {string} lang - The language code to load (e.g., 'zh', 'en').
     */
    async loadTranslations(lang) {
        // 1. Load English as the base translation, but only do it once.
        if (Object.keys(enTranslations).length === 0) {
            enTranslations = await fetchLanguageFile('en');
        }

        // 2. Load the target language. If the target is English, we can just use the base.
        if (lang === 'en') {
            currentTranslations = enTranslations;
        } else {
            currentTranslations = await fetchLanguageFile(lang);
        }

        // 3. Store the user's preference and update all on-screen text.
        this.currentLang = lang;
        localStorage.setItem('appLang', lang);
        this.updateTexts();
    },

    /**
     * Gets the translation for a given key.
     * It looks for a translation in the current language first,
     * then falls back to English, and finally to the key itself.
     * @param {string} key - The translation key.
     * @returns {string} The translated text.
     */
    t(key) {
        return currentTranslations[key] || enTranslations[key] || key;
    },

    /**
     * Updates all elements on the page that have a `data-i18n` attribute.
     */
    updateTexts() {
        // Update text content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                // The t() function now handles the fallback logic automatically
                el.textContent = this.t(key);
            }
        });

        // Update placeholders
        const placeholderElements = {
            'input-url': 'ph_url', 'input-title': 'ph_title', 'input-icon': 'ph_icon',
            'auth-email': 'ph_email', 'auth-password': 'ph_password',
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
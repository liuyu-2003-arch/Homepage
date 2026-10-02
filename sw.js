const APP_VERSION = '2.9.33';
const CACHE_NAME = `homepage-v${APP_VERSION}`;
const APP_SCOPE = self.registration.scope;
const STATIC_ASSETS = [
    '', 'index.html', 'preferences.html', 'pages/address/index.html',
    `css/base.css?v=${APP_VERSION}`, `css/bookmark.css?v=${APP_VERSION}`, `css/modal.css?v=${APP_VERSION}`,
    `css/controls.css?v=${APP_VERSION}`, `css/user.css?v=${APP_VERSION}`, `css/responsive.css?v=${APP_VERSION}`,
    `js/main.js?v=${APP_VERSION}`, `js/ui.js?v=${APP_VERSION}`, `js/api.js?v=${APP_VERSION}`, `js/auth.js?v=${APP_VERSION}`,
    `js/state.js?v=${APP_VERSION}`, `js/utils.js?v=${APP_VERSION}`, `js/i18n.js?v=${APP_VERSION}`, `js/config.js?v=${APP_VERSION}`,
    `js/logger.js?v=${APP_VERSION}`, `js/preferences.js?v=${APP_VERSION}`,
    'templates/user_dropdown.html', 'templates/bookmark_modal.html', 'templates/page_edit_modal.html', 'templates/dock_edit_modal.html',
    'templates/auth_modal.html', 'templates/help_modal.html', 'templates/confirm_modal.html',
    'homepage_config.json', 'manifest.webmanifest', 'icon.svg', 'icon.png',
    'favicon-16.png', 'favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png',
    'locales/en.json', 'locales/zh.json', 'locales/zh-TW.json', 'locales/ja.json',
    'locales/ko.json', 'locales/fr.json', 'locales/es.json', 'locales/de.json',
    'locales/pt.json', 'locales/ru.json', 'locales/it.json', 'locales/ar.json'
].map((path) => new URL(path, APP_SCOPE).href);
const STATIC_ASSET_URLS = new Set(STATIC_ASSETS);

function cacheSuccessfulResponse(request, response) {
    if (!response || response.status !== 200) return response;
    const clone = response.clone();
    caches.open(CACHE_NAME)
        .then((cache) => cache.put(request, clone))
        .catch(() => {});
    return response;
}

function networkFirst(request) {
    return fetch(request)
        .then((response) => cacheSuccessfulResponse(request, response))
        .catch(() => caches.match(request, { ignoreSearch: true }));
}

// Install: pre-cache core assets (resilient — one failure won't abort the install)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                STATIC_ASSETS.map((url) => cache.add(url).catch(() => {}))
            );
        }).then(() => self.skipWaiting())
    );
});

// Activate: claim all clients and clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((cache) => cache !== CACHE_NAME)
                    .map((cache) => caches.delete(cache))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: handle requests with appropriate caching strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Never cache third-party icons, avatars, or API requests.
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    const isLocale = url.pathname.startsWith(new URL('locales/', APP_SCOPE).pathname) && url.pathname.endsWith('.json');
    if (!STATIC_ASSET_URLS.has(url.href) && !isLocale) return;

    // Keep HTML and JavaScript in sync by preferring fresh, same-version files.
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js')) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Network-first for JSON config files
    if (url.pathname.endsWith('.json')) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Stale-while-revalidate for static assets
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fresh = fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(event.request, clone))
                            .catch(() => {});
                    }
                    return response;
                })
                .catch(() => null);
            return cached || fresh;
        })
    );
});

const CACHE_NAME = 'homepage-v1.6';
const APP_SCOPE = self.registration.scope;
const STATIC_ASSETS = [
    '', 'index.html',
    'css/base.css', 'css/bookmark.css', 'css/modal.css', 'css/controls.css', 'css/user.css', 'css/responsive.css',
    'js/main.js', 'js/ui.js', 'js/api.js', 'js/auth.js', 'js/state.js', 'js/utils.js', 'js/i18n.js', 'js/config.js', 'js/logger.js',
    'templates/user_dropdown.html', 'templates/bookmark_modal.html', 'templates/page_edit_modal.html',
    'templates/pref_modal.html', 'templates/auth_modal.html', 'templates/help_modal.html', 'templates/confirm_modal.html',
    'homepage_config.json'
].map((path) => new URL(path, APP_SCOPE).href);
const STATIC_ASSET_URLS = new Set(STATIC_ASSETS);

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
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

    // Never cache third-party icons, avatars, or API requests. They are dynamic
    // and would otherwise grow the cache without limit.
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    const isLocale = url.pathname.startsWith(new URL('locales/', APP_SCOPE).pathname) && url.pathname.endsWith('.json');
    if (!STATIC_ASSET_URLS.has(url.href) && !isLocale) return;

    // Network-first for JSON config files
    if (url.pathname.endsWith('.json')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Stale-while-revalidate for static assets
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fresh = fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => null);
            return cached || fresh;
        })
    );
});

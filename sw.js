const CACHE_NAME = 'homepage-v1.3'; // 建议升级一下版本号
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/base.css',
    '/css/bookmark.css',
    '/css/modal.css',
    '/css/controls.css',
    '/css/user.css',
    '/css/responsive.css',
    '/js/main.js',
    '/templates/user_dropdown.html',
    '/templates/bookmark_modal.html',
    '/templates/page_edit_modal.html',
    '/templates/pref_modal.html',
    '/templates/auth_modal.html',
    'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js'
];

// 1. 安装阶段：预缓存核心文件
self.addEventListener('install', (event) => {
    self.skipWaiting(); // 跳过等待，立即激活
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

// 2. 激活阶段：清理旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim(); // 立即控制所有页面
});

// 3. 拦截请求：核心缓存策略
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 🔴 修复核心：如果是 Supabase API 请求或非 GET 请求（如 POST/PUT），直接走网络，不经过 SW 缓存
    // 这样能防止数据库更新后，刷新页面读取到旧的缓存数据
    if (url.hostname.includes('supabase.co') || event.request.method !== 'GET') {
        return; // 直接返回，浏览器会执行默认的网络请求
    }

    // 策略 A：对于 JSON 配置文件 -> 网络优先 (Network First)
    if (url.pathname.endsWith('.json')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 策略 B：对于其他静态资源 -> 缓存优先，后台更新 (Stale-While-Revalidate)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return networkResponse;
            }).catch(() => {
                // 网络失败忽略
            });
            return cachedResponse || fetchPromise;
        })
    );
});
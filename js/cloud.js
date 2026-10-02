// Minimal auth + data client backed by the site's own Pages Functions (/api/*).
// Mirrors the small slice of the supabase-js API this app used, so callers keep
// their existing shape: methods return { data, error } and errors have .message.

const API_BASE = '/api';

let session = null;
const listeners = new Set();

function emit(event) {
    listeners.forEach((callback) => {
        try { callback(event, session); } catch (error) { /* listener errors must not break auth */ }
    });
}

async function request(path, { method = 'GET', body } = {}) {
    const options = {
        method,
        credentials: 'same-origin',
        headers: { 'accept': 'application/json' },
    };
    if (body !== undefined) {
        options.headers['content-type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, options);
    } catch (error) {
        return { data: null, error: Object.assign(new Error('Network error'), { code: 'network_error' }) };
    }

    let payload = null;
    try { payload = await response.json(); } catch (error) { payload = null; }

    if (!response.ok) {
        const message = (payload && (payload.message || payload.error)) || `Request failed (${response.status})`;
        return { data: null, error: Object.assign(new Error(message), { status: response.status, code: payload?.error }) };
    }
    return { data: payload, error: null };
}

export function createCloudClient() {
    const auth = {
        async getSession() {
            const { data, error } = await request('/auth/session');
            if (error) return { data: { session: null }, error };
            session = data?.session || null;
            return { data: { session }, error: null };
        },

        async getUser() {
            const { data, error } = await request('/auth/me');
            if (error) return { data: { user: null }, error };
            if (data?.user) session = { ...(session || {}), user: data.user };
            return { data: { user: data?.user || null }, error: null };
        },

        onAuthStateChange(callback) {
            listeners.add(callback);
            return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } };
        },

        async signInWithPassword({ email, password }) {
            const { data, error } = await request('/auth/login', { method: 'POST', body: { email, password } });
            if (error) return { data: { user: null, session: null }, error };
            session = data?.session || null;
            emit('SIGNED_IN');
            return { data: { user: data?.user || null, session }, error: null };
        },

        async signUp({ email, password, options }) {
            const { data, error } = await request('/auth/register', {
                method: 'POST',
                body: { email, password, data: options?.data },
            });
            if (error) return { data: { user: null, session: null }, error };
            session = data?.session || null;
            emit('SIGNED_IN');
            return { data: { user: data?.user || null, session }, error: null };
        },

        async signOut() {
            await request('/auth/logout', { method: 'POST' });
            session = null;
            emit('SIGNED_OUT');
            return { error: null };
        },

        async updateUser(attributes = {}) {
            const body = {};
            if (attributes.data) body.data = attributes.data;
            if (attributes.password) body.password = attributes.password;
            if (attributes.email) body.email = attributes.email;

            const { data, error } = await request('/auth/update', { method: 'POST', body });
            if (error) return { data: { user: null }, error };
            const user = data?.user || null;
            if (user) session = { ...(session || {}), user };
            return { data: { user }, error: null };
        },

        async signInWithOAuth({ provider }) {
            const providers = await request('/auth/providers');
            if (providers.error) return { data: null, error: providers.error };
            if (!providers.data?.[provider]) {
                return {
                    data: null,
                    error: Object.assign(new Error(`${provider} login is not configured yet`), { code: 'oauth_not_configured' }),
                };
            }
            window.location.href = `${API_BASE}/auth/oauth/${provider}`;
            return { data: { provider }, error: null };
        },
    };

    const config = {
        async load() {
            const { data, error } = await request('/config');
            if (error) return { data: null, error };
            return { data: data?.config_data ?? null, error: null, updatedAt: data?.updated_at || null };
        },
        async save(pages) {
            return request('/config', { method: 'PUT', body: { config_data: pages } });
        },
    };

    return { auth, config };
}

export function getCurrentSession() {
    return session;
}

// Homepage auth + data API (Cloudflare Pages Functions, D1 backed).
// Replaces Supabase: password auth (PBKDF2/WebCrypto), opaque session cookies,
// per-user config storage and favorites.
//
// Secrets / vars (Pages project env):
//   SESSION_SECRET      (reserved, currently unused - sessions are opaque random tokens)
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
//   RESEND_API_KEY / RESEND_FROM (optional password-reset email delivery)

const COOKIE_SESSION = 'hp_session';
const COOKIE_STATE = 'hp_oauth_state';
const SESSION_DAYS = 30;
const PBKDF2_ITER = 10000; // free-plan CPU budget is 10ms/request; keep this modest
const MIN_PASSWORD = 6;
const RESET_TTL_MINUTES = 30;

/* ------------------------------------------------------------------ utils */

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra,
    },
  });

function b64urlEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomToken(bytes = 32) {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256,
  ));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITER);
  return `pbkdf2$sha256$${PBKDF2_ITER}$${b64urlEncode(salt)}$${b64urlEncode(bits)}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = parseInt(parts[2], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  let expected;
  try {
    expected = b64urlDecode(parts[4]);
  } catch {
    return false;
  }
  const bits = await pbkdf2(password, b64urlDecode(parts[3]), iterations);
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(/;\s*/)) {
    if (!part) continue;
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx)] = decodeURIComponent(part.slice(idx + 1));
  }
  return out;
}

function sessionCookie(token, maxAge) {
  return `${COOKIE_SESSION}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

const publicUser = (row) => ({
  id: row.id,
  email: row.email,
  email_confirmed_at: row.email_confirmed ? row.created_at : null,
  user_metadata: safeJson(row.user_metadata, {}),
  app_metadata: { provider: 'email', providers: ['email'] },
  created_at: row.created_at,
  updated_at: row.updated_at,
  aud: 'authenticated',
  role: 'authenticated',
});

function safeJson(value, fallback) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : (value ?? fallback);
  } catch {
    return fallback;
  }
}

/* --------------------------------------------------------------- sessions */

async function createSession(env, userId, request) {
  const token = randomToken(32);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
  ).bind(
    await sha256hex(token), userId, now.toISOString(), expires.toISOString(),
    request.headers.get('user-agent') || null,
  ).run();
  return { token, cookie: sessionCookie(token, SESSION_DAYS * 86400), expiresAt: expires.toISOString() };
}

async function getSessionRow(env, request) {
  const token = parseCookies(request.headers.get('cookie'))[COOKIE_SESSION];
  if (!token) return null;
  const hash = await sha256hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.email_confirmed, u.user_metadata, u.created_at, u.updated_at,
            s.token_hash, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
  ).bind(hash).first();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return null;
  }
  return row;
}

async function destroySession(env, request) {
  const token = parseCookies(request.headers.get('cookie'))[COOKIE_SESSION];
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256hex(token)).run();
  return sessionCookie('', 0);
}

/* --------------------------------------------------------------- handers  */

async function handleRegister(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const metadata = body.data && typeof body.data === 'object' ? body.data : {};

  if (!email || !email.includes('@')) return json({ error: 'invalid_email', message: 'Invalid email address' }, 400);
  if (password.length < MIN_PASSWORD) {
    return json({ error: 'weak_password', message: `Password must be at least ${MIN_PASSWORD} characters` }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return json({ error: 'user_exists', message: 'User already registered' }, 409);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, email_confirmed, user_metadata, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)',
  ).bind(id, email, await hashPassword(password), JSON.stringify(metadata), now, now).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO identities (provider, provider_id, user_id, identity_data, created_at) VALUES ('email', ?, ?, ?, ?)",
  ).bind(email, id, JSON.stringify({ email }), now).run();

  const session = await createSession(env, id, request);
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ user: publicUser(row), session: { user: publicUser(row), expires_at: session.expiresAt } },
    200, { 'set-cookie': session.cookie });
}

async function throttled(env, key) {
  const row = await env.DB.prepare('SELECT failures, blocked_until FROM login_attempts WHERE key = ?').bind(key).first();
  if (!row) return false;
  if (row.blocked_until && new Date(row.blocked_until) > new Date()) return true;
  return false;
}

async function recordFailure(env, key) {
  const now = new Date();
  const row = await env.DB.prepare('SELECT failures, first_at FROM login_attempts WHERE key = ?').bind(key).first();
  const windowMs = 15 * 60000;
  let failures = 1;
  let firstAt = now.toISOString();
  if (row && new Date(row.first_at).getTime() > now.getTime() - windowMs) {
    failures = row.failures + 1;
    firstAt = row.first_at;
  }
  const blocked = failures >= 10 ? new Date(now.getTime() + windowMs).toISOString() : null;
  await env.DB.prepare(
    'INSERT INTO login_attempts (key, failures, first_at, blocked_until) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, first_at = excluded.first_at, blocked_until = excluded.blocked_until',
  ).bind(key, failures, firstAt, blocked).run();
}

async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return json({ error: 'invalid_request', message: 'Email and password are required' }, 400);

  if (await throttled(env, email)) {
    return json({ error: 'too_many_requests', message: 'Too many failed attempts, try again later' }, 429);
  }

  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const ok = row && row.password_hash && await verifyPassword(password, row.password_hash);
  if (!ok) {
    await recordFailure(env, email);
    return json({ error: 'invalid_credentials', message: 'Invalid login credentials' }, 400);
  }

  await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(email).run();
  const session = await createSession(env, row.id, request);
  return json({ user: publicUser(row), session: { user: publicUser(row), expires_at: session.expiresAt } },
    200, { 'set-cookie': session.cookie });
}

async function handleUpdateUser(request, env, row) {
  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  const metadata = { ...safeJson(row.user_metadata, {}) };

  if (body.data && typeof body.data === 'object') {
    for (const [key, value] of Object.entries(body.data)) {
      if (value === null || value === '') delete metadata[key];
      else metadata[key] = value;
    }
  }

  let email = row.email;
  if (body.email) {
    const next = String(body.email).trim().toLowerCase();
    if (next !== email) {
      if (!next.includes('@')) return json({ error: 'invalid_email', message: 'Invalid email address' }, 400);
      const clash = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(next, row.id).first();
      if (clash) return json({ error: 'email_exists', message: 'Email already in use' }, 409);
      email = next;
    }
  }

  let passwordHash = row.password_hash;
  if (body.password) {
    const password = String(body.password);
    if (password.length < MIN_PASSWORD) {
      return json({ error: 'weak_password', message: `Password must be at least ${MIN_PASSWORD} characters` }, 400);
    }
    passwordHash = await hashPassword(password);
  }

  await env.DB.prepare(
    'UPDATE users SET email = ?, password_hash = ?, user_metadata = ?, updated_at = ? WHERE id = ?',
  ).bind(email, passwordHash, JSON.stringify(metadata), now, row.id).run();

  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.id).first();
  return json({ user: publicUser(updated) });
}

async function handleChangePassword(request, env, row) {
  const body = await request.json().catch(() => ({}));
  const current = String(body.current_password || '');
  const next = String(body.new_password || '');
  const confirmation = String(body.confirm_password || '');

  if (!current) return json({ error: 'missing_current', message: 'Current password is required' }, 400);
  if (!confirmation) return json({ error: 'missing_confirmation', message: 'Password confirmation is required' }, 400);
  if (next.length < MIN_PASSWORD) {
    return json({ error: 'weak_password', message: `Password must be at least ${MIN_PASSWORD} characters` }, 400);
  }
  if (next !== confirmation) {
    return json({ error: 'password_mismatch', message: 'Password confirmation does not match' }, 400);
  }
  if (next === current) return json({ error: 'same_password', message: 'New password must differ from the current one' }, 400);

  if (!(row.password_hash && await verifyPassword(current, row.password_hash))) {
    return json({ error: 'invalid_credentials', message: 'Current password is incorrect' }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
  ).bind(await hashPassword(next), now, row.id).run();

  // Revoked on every other device; this browser's session stays valid.
  await env.DB.prepare(
    'DELETE FROM sessions WHERE user_id = ? AND token_hash != ?',
  ).bind(row.id, row.token_hash).run();

  return json({ ok: true, updated_at: now });
}

/* -------------------------------------------------------- password reset */

async function handleForgotPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return json({ error: 'invalid_email', message: 'Invalid email address' }, 400);
  }

  const rateKey = `password_reset:${email}`;
  if (await throttled(env, rateKey)) {
    return json({ error: 'too_many_requests', message: 'Too many reset requests, try again later' }, 429);
  }

  const resendApiKey = env.RESEND_API_KEY;
  const resendFrom = env.RESEND_FROM;
  if (!resendApiKey || !resendFrom) {
    return json({ error: 'mail_not_configured', message: 'Password reset email is not configured' }, 503);
  }

  await recordFailure(env, rateKey);
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!user) return json({ ok: true });

  const token = randomToken(32);
  const tokenHash = await sha256hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + RESET_TTL_MINUTES * 60000);
  await env.DB.prepare(
    'DELETE FROM password_resets WHERE user_id = ? AND (expires_at <= ? OR used_at IS NOT NULL)',
  ).bind(user.id, now.toISOString()).run();
  await env.DB.prepare(
    'INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(tokenHash, user.id, now.toISOString(), expires.toISOString()).run();

  const resetUrl = `${new URL(request.url).origin}/index.html?reset_password=${encodeURIComponent(token)}`;
  let mailResponse;
  try {
    mailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [email],
        subject: 'Reset your My Homepage password',
        text: [
          'A password reset was requested for your My Homepage account.',
          '',
          `Reset your password within ${RESET_TTL_MINUTES} minutes:`,
          resetUrl,
          '',
          'If you did not request this, you can ignore this email. The link can only be used once.',
        ].join('\n'),
      }),
    });
  } catch {
    mailResponse = null;
  }

  if (!mailResponse || !mailResponse.ok) {
    await env.DB.prepare('DELETE FROM password_resets WHERE token_hash = ?').bind(tokenHash).run();
    return json({ error: 'mail_send_failed', message: 'Could not send the password reset email' }, 502);
  }

  return json({ ok: true });
}

async function restoreResetToken(env, tokenHash) {
  await env.DB.prepare('UPDATE password_resets SET used_at = NULL WHERE token_hash = ?')
    .bind(tokenHash).run();
}

async function handleResetPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || '').trim();
  const next = String(body.new_password || '');
  const confirmation = String(body.confirm_password || '');

  if (!token) return json({ error: 'invalid_token', message: 'Invalid reset token' }, 400);
  if (!confirmation) return json({ error: 'missing_confirmation', message: 'Password confirmation is required' }, 400);
  if (next.length < MIN_PASSWORD) {
    return json({ error: 'weak_password', message: `Password must be at least ${MIN_PASSWORD} characters` }, 400);
  }
  if (next !== confirmation) {
    return json({ error: 'password_mismatch', message: 'Password confirmation does not match' }, 400);
  }

  const tokenHash = await sha256hex(token);
  const row = await env.DB.prepare(
    'SELECT token_hash, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?',
  ).bind(tokenHash).first();
  if (!row) return json({ error: 'invalid_token', message: 'Invalid reset token' }, 400);
  if (row.used_at) return json({ error: 'token_used', message: 'Reset link has already been used' }, 400);
  if (new Date(row.expires_at) <= new Date()) {
    return json({ error: 'expired_token', message: 'Reset link has expired' }, 400);
  }

  const claimedAt = new Date().toISOString();
  const claim = await env.DB.prepare(
    'UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
  ).bind(claimedAt, tokenHash, claimedAt).run();
  if (!claim?.meta?.changes) {
    const current = await env.DB.prepare(
      'SELECT expires_at, used_at FROM password_resets WHERE token_hash = ?',
    ).bind(tokenHash).first();
    if (!current) return json({ error: 'invalid_token', message: 'Invalid reset token' }, 400);
    if (current.used_at) return json({ error: 'token_used', message: 'Reset link has already been used' }, 400);
    return json({ error: 'expired_token', message: 'Reset link has expired' }, 400);
  }

  try {
    const passwordHash = await hashPassword(next);
    const updated = await env.DB.prepare(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
    ).bind(passwordHash, claimedAt, row.user_id).run();
    if (!updated?.meta?.changes) throw new Error('User no longer exists');
  } catch (error) {
    await restoreResetToken(env, tokenHash);
    throw error;
  }

  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id).run();
  await env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(row.user_id).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}

/* ------------------------------------------------------------------ oauth */

const OAUTH = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    idVar: 'GOOGLE_CLIENT_ID',
    secretVar: 'GOOGLE_CLIENT_SECRET',
  },
  github: {
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    idVar: 'GITHUB_CLIENT_ID',
    secretVar: 'GITHUB_CLIENT_SECRET',
  },
};

async function oauthUser(provider, tokenJson, accessToken) {
  if (provider === 'google') {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const info = await res.json();
    return {
      providerId: String(info.sub),
      email: String(info.email || '').toLowerCase(),
      metadata: { avatar_url: info.picture || null, full_name: info.name || null },
      data: info,
    };
  }
  const headers = { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json', 'user-agent': 'homepage-auth' };
  const info = await (await fetch('https://api.github.com/user', { headers })).json();
  let email = info.email ? String(info.email).toLowerCase() : '';
  if (!email) {
    const emails = await (await fetch('https://api.github.com/user/emails', { headers })).json();
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) : null;
    email = primary ? String(primary.email).toLowerCase() : '';
  }
  return {
    providerId: String(info.id),
    email,
    metadata: { avatar_url: info.avatar_url || null, full_name: info.name || info.login || null },
    data: info,
  };
}

async function handleOAuthStart(provider, request, env) {
  const cfg = OAUTH[provider];
  if (!cfg) return json({ error: 'unknown_provider' }, 404);

  // OAuth only works on the canonical apex host: the provider callback URL is
  // registered for it and the state cookie must land on the same host.
  const reqUrl = new URL(request.url);
  if (reqUrl.hostname.startsWith('www.')) {
    const apex = reqUrl.hostname.replace(/^www\./, '');
    return Response.redirect(`${reqUrl.protocol}//${apex}${reqUrl.pathname}${reqUrl.search}`, 302);
  }

  const clientId = env[cfg.idVar];
  const clientSecret = env[cfg.secretVar];
  if (!clientId || !clientSecret) {
    return json({ error: 'oauth_not_configured', message: `${provider} login is not configured yet` }, 501);
  }
  const origin = reqUrl.origin;
  const state = randomToken(16);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/callback/${provider}`,
    response_type: 'code',
    scope: cfg.scope,
    state,
  });
  if (provider === 'google') params.set('prompt', 'select_account');
  return new Response(null, {
    status: 302,
    headers: {
      location: `${cfg.authorize}?${params}`,
      'set-cookie': `${COOKIE_STATE}=${provider}.${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

async function handleOAuthCallback(provider, request, env) {
  const cfg = OAUTH[provider];
  if (!cfg) return json({ error: 'unknown_provider' }, 404);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  const expected = parseCookies(request.headers.get('cookie'))[COOKIE_STATE] || '';
  if (!code) return json({ error: 'missing_code', message: url.searchParams.get('error_description') || 'Missing code' }, 400);
  if (expected !== `${provider}.${state}`) return json({ error: 'state_mismatch', message: 'OAuth state mismatch' }, 400);

  const clientId = env[cfg.idVar];
  const clientSecret = env[cfg.secretVar];
  if (!clientId || !clientSecret) return json({ error: 'oauth_not_configured' }, 501);

  const tokenRes = await fetch(cfg.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${url.origin}/api/auth/callback/${provider}`,
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  const accessToken = tokenJson.access_token;
  if (!accessToken) return json({ error: 'oauth_token_failed', details: tokenJson }, 400);

  const info = await oauthUser(provider, tokenJson, accessToken);
  const now = new Date().toISOString();

  let userId = null;
  const identity = await env.DB.prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_id = ?')
    .bind(provider, info.providerId).first();
  if (identity) {
    userId = identity.user_id;
  } else if (info.email) {
    const byEmail = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(info.email).first();
    if (byEmail) {
      userId = byEmail.id;
      const row = await env.DB.prepare('SELECT user_metadata FROM users WHERE id = ?').bind(userId).first();
      const merged = { ...safeJson(row?.user_metadata, {}), ...info.metadata };
      await env.DB.prepare('UPDATE users SET user_metadata = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(merged), now, userId).run();
    }
  }

  if (!userId) {
    userId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, email_confirmed, user_metadata, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, ?, ?)',
    ).bind(userId, info.email || `${provider}-${info.providerId}@users.local`, JSON.stringify(info.metadata), now, now).run();
  }

  await env.DB.prepare(
    'INSERT OR REPLACE INTO identities (provider, provider_id, user_id, identity_data, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(provider, info.providerId, userId, JSON.stringify(info.data).slice(0, 4000), now).run();

  const session = await createSession(env, userId, request);
  return new Response(null, {
    status: 302,
    headers: {
      location: '/',
      'set-cookie': session.cookie,
    },
  });
}

/* ----------------------------------------------------------------- router */

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin fetches may omit Origin
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const started = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);
  const { request } = context;
  const url = new URL(request.url);

  let response;
  try {
    response = await handleApiRequest(context);
  } catch (error) {
    // handleApiRequest guards its own routes; anything reaching here is a bug.
    console.log(JSON.stringify({
      lvl: 'error', req: requestId, path: url.pathname, method: request.method,
      error: String(error && error.message || error).slice(0, 300),
    }));
    response = json({ error: 'server_error', message: 'Internal error' }, 500);
  }

  // One structured line per request goes to Workers Logs (retention is set in
  // the Pages project). Bodies and cookies are never logged.
  const { error } = await response.clone().json().catch(() => ({ error: null }));
  console.log(JSON.stringify({
    lvl: response.status >= 500 ? 'error' : 'info',
    req: requestId,
    method: request.method,
    path: url.pathname,
    status: response.status,
    ms: Date.now() - started,
    ...(error ? { err: error } : {}),
  }));
  return response;
}

async function handleApiRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = `/${(Array.isArray(params.path) ? params.path.join('/') : params.path || '')}`.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (!env.DB) return json({ error: 'db_not_configured', message: 'D1 binding DB is missing' }, 500);

  if (path === '/health') return json({ ok: true, at: new Date().toISOString() });

  // Mutating requests must be same-origin (defence in depth on top of SameSite=Lax).
  if (!['GET', 'HEAD'].includes(method) && !sameOrigin(request)) {
    return json({ error: 'cross_origin_rejected' }, 403);
  }

  try {
    if (path === '/auth/register' && method === 'POST') return await handleRegister(request, env);
    if (path === '/auth/login' && method === 'POST') return await handleLogin(request, env);
    if (path === '/auth/logout' && method === 'POST') {
      const cookie = await destroySession(env, request);
      return json({ ok: true }, 200, { 'set-cookie': cookie });
    }
    if (path === '/auth/session' && method === 'GET') {
      const row = await getSessionRow(env, request);
      if (!row) return json({ session: null, user: null });
      return json({ session: { user: publicUser(row), expires_at: row.expires_at }, user: publicUser(row) });
    }
    if (path === '/auth/me' && method === 'GET') {
      const row = await getSessionRow(env, request);
      if (!row) return json({ error: 'not_authenticated', message: 'Not authenticated' }, 401);
      return json({ user: publicUser(row) });
    }
    if (path === '/auth/update' && method === 'POST') {
      const row = await getSessionRow(env, request);
      if (!row) return json({ error: 'not_authenticated' }, 401);
      return await handleUpdateUser(request, env, row);
    }
    if (path === '/auth/password' && method === 'POST') {
      const row = await getSessionRow(env, request);
      if (!row) return json({ error: 'not_authenticated' }, 401);
      return await handleChangePassword(request, env, row);
    }
    if (path === '/auth/password/forgot' && method === 'POST') {
      return await handleForgotPassword(request, env);
    }
    if (path === '/auth/password/reset' && method === 'POST') {
      return await handleResetPassword(request, env);
    }
    if (path === '/auth/providers' && method === 'GET') {
      return json({
        google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        github: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      });
    }
    if (path.startsWith('/auth/oauth/') && method === 'GET') {
      return await handleOAuthStart(path.slice('/auth/oauth/'.length), request, env);
    }
    if (path.startsWith('/auth/callback/') && method === 'GET') {
      return await handleOAuthCallback(path.slice('/auth/callback/'.length), request, env);
    }

    if (path === '/config') {
      const row = await getSessionRow(env, request);
      if (!row) return json({ error: 'not_authenticated' }, 401);
      if (method === 'GET') {
        const cfg = await env.DB.prepare('SELECT config_data, updated_at FROM user_configs WHERE user_id = ?').bind(row.id).first();
        return json({ config_data: cfg ? safeJson(cfg.config_data, null) : null, updated_at: cfg ? cfg.updated_at : null });
      }
      if (method === 'PUT' || method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!('config_data' in body)) return json({ error: 'invalid_request' }, 400);
        const payload = typeof body.config_data === 'string' ? body.config_data : JSON.stringify(body.config_data);
        if (payload.length > 2000000) return json({ error: 'payload_too_large' }, 413);
        const now = new Date().toISOString();
        await env.DB.prepare(
          'INSERT INTO user_configs (user_id, config_data, updated_at) VALUES (?, ?, ?) ' +
          'ON CONFLICT(user_id) DO UPDATE SET config_data = excluded.config_data, updated_at = excluded.updated_at',
        ).bind(row.id, payload, now).run();
        return json({ ok: true, updated_at: now });
      }
      return json({ error: 'method_not_allowed' }, 405);
    }

    if (path === '/favorites') {
      const row = await getSessionRow(env, request);
      if (!row) return json({ error: 'not_authenticated' }, 401);
      if (method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT comparison_key, created_at FROM favorites WHERE user_id = ? ORDER BY created_at',
        ).bind(row.id).all();
        return json({ favorites: results || [] });
      }
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const key = String(body.comparison_key || '').trim();
        if (!key) return json({ error: 'invalid_request' }, 400);
        await env.DB.prepare(
          'INSERT OR IGNORE INTO favorites (id, user_id, comparison_key, created_at) VALUES (?, ?, ?, ?)',
        ).bind(crypto.randomUUID(), row.id, key, new Date().toISOString()).run();
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        const key = url.searchParams.get('key') || '';
        await env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND comparison_key = ?').bind(row.id, key).run();
        return json({ ok: true });
      }
      return json({ error: 'method_not_allowed' }, 405);
    }

    return json({ error: 'not_found' }, 404);
  } catch (error) {
    return json({ error: 'server_error', message: String(error && error.message || error) }, 500);
  }
}

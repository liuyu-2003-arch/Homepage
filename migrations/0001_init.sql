-- Homepage auth + data schema (Cloudflare D1 / SQLite)
-- Replaces the Supabase tables auth.users, auth.identities,
-- public.user_configs and public.favorites.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,              -- uuid, kept from Supabase
  email           TEXT NOT NULL UNIQUE,          -- lowercased
  password_hash   TEXT,                          -- pbkdf2$sha256$<iters>$<salt_b64>$<hash_b64>
  email_confirmed INTEGER NOT NULL DEFAULT 1,
  user_metadata   TEXT NOT NULL DEFAULT '{}',    -- json: avatar_url, full_name, display_name, phone_number
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identities (
  provider      TEXT NOT NULL,                   -- google | github | email
  provider_id   TEXT NOT NULL,                   -- provider's subject id
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_data TEXT NOT NULL DEFAULT '{}',      -- json snapshot from the provider
  created_at    TEXT,
  PRIMARY KEY (provider, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,                   -- sha256 hex of the opaque cookie value
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS user_configs (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  config_data TEXT NOT NULL,                     -- json array of pages
  updated_at  TEXT NOT NULL
);

-- Brute-force throttle: 10 failures per email per 15 minutes
CREATE TABLE IF NOT EXISTS login_attempts (
  key           TEXT PRIMARY KEY,             -- lowercased email
  failures      INTEGER NOT NULL DEFAULT 0,
  first_at      TEXT NOT NULL,
  blocked_until TEXT
);

CREATE TABLE IF NOT EXISTS favorites (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comparison_key TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_user_key ON favorites(user_id, comparison_key);

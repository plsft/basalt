-- packages/api/migrations/0001_initial.sql
-- Initial D1 schema. Soft-delete columns for GDPR; created_at/updated_at on
-- every row. Indexes match the read patterns the API needs.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,             -- ULID
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  provider        TEXT NOT NULL,                -- 'google' | 'github'
  provider_sub    TEXT NOT NULL,                -- OAuth subject id
  tier            TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro' | 'founder'
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,                         -- soft-delete (30d grace per GDPR)
  UNIQUE (provider, provider_sub)
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

CREATE TABLE IF NOT EXISTS vaults (
  id              TEXT PRIMARY KEY,             -- ULID
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  sync_enabled    INTEGER NOT NULL DEFAULT 0,   -- 0/1 boolean
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_vaults_user ON vaults(user_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS briefs (
  id              TEXT PRIMARY KEY,             -- ULID
  vault_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  section         TEXT NOT NULL,                -- 'all' | single verb
  brief_json      TEXT NOT NULL,                -- serialized Brief
  created_at      TEXT NOT NULL,
  FOREIGN KEY (vault_id) REFERENCES vaults(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_briefs_vault_created ON briefs(vault_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefs_user_created ON briefs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS findings (
  id              TEXT PRIMARY KEY,             -- ULID
  brief_id        TEXT NOT NULL,
  vault_id        TEXT NOT NULL,
  verb            TEXT NOT NULL,
  finding_key     TEXT NOT NULL,                -- stable per (verb, content)
  finding_json    TEXT NOT NULL,
  falsification   TEXT NOT NULL,                -- JSON array
  status          TEXT NOT NULL DEFAULT 'pending',
  verdict_at      TEXT,
  verdict_reason  TEXT,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (brief_id) REFERENCES briefs(id),
  FOREIGN KEY (vault_id) REFERENCES vaults(id)
);
CREATE INDEX IF NOT EXISTS idx_findings_vault_status ON findings(vault_id, status);
CREATE INDEX IF NOT EXISTS idx_findings_brief ON findings(brief_id);
CREATE INDEX IF NOT EXISTS idx_findings_finding_key ON findings(vault_id, verb, finding_key);

CREATE TABLE IF NOT EXISTS subscriptions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  stripe_id       TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL,                -- 'active' | 'past_due' | 'cancelled'
  tier            TEXT NOT NULL,                -- 'pro' | 'founder'
  current_period_end TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  action          TEXT NOT NULL,
  payload_json    TEXT,
  ip              TEXT,
  user_agent      TEXT,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

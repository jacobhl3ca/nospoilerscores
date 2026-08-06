-- One row per address: issuing a new code atomically replaces every older one.
-- Email/IP lookup keys in the rate table are HMACs, never raw personal data.
CREATE TABLE IF NOT EXISTS email_login_codes (
  email_key TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_login_rate_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'request_ip', 'verify_ip')),
  key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_login_rate_lookup
  ON email_login_rate_events(kind, key_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_email_login_rate_created
  ON email_login_rate_events(created_at);

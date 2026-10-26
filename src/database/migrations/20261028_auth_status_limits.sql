-- Shared, expiring counters; keys are SHA-256 digests, never raw identifiers.
CREATE TABLE IF NOT EXISTS security_rate_limits (
  key_hash TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count > 0),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_rate_limits_expiry ON security_rate_limits(expires_at);
-- One active status capability per applicant; rotating it revokes the previous link.
CREATE TABLE IF NOT EXISTS career_status_tokens (
  application_id VARCHAR(64) PRIMARY KEY REFERENCES career_applications(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL
);

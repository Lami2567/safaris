-- ==============================================================================
-- SAFARIS UGANDA — Security Hardening: Token Versioning & Quotation Enforcement
-- Date: 2026-10-25
-- ==============================================================================

-- 1. Token Versioning for Instant Session Revocation on Password/Role Changes
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_users_token_version ON users(token_version);

-- 2. Quotation Model Hardening: Ownership Binding and Single-Use Consumption Tracking
ALTER TABLE price_quotations ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64);
ALTER TABLE price_quotations ADD COLUMN IF NOT EXISTS consumed BOOLEAN DEFAULT FALSE;
ALTER TABLE price_quotations ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE price_quotations ADD COLUMN IF NOT EXISTS consumed_by VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_price_quotations_customer_id ON price_quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_price_quotations_consumed ON price_quotations(consumed);
CREATE INDEX IF NOT EXISTS idx_price_quotations_expires_at ON price_quotations(expires_at);

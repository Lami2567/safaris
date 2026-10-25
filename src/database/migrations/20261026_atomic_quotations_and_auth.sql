-- ==============================================================================
-- SAFARIS UGANDA — Atomic Quotation Consumption & Replay-Resistant Auth Tokens
-- Date: 2026-10-26
-- ==============================================================================

-- 1. Table for tracking single-use auth tokens (setup tokens, OTP codes, password resets)
CREATE TABLE IF NOT EXISTS consumed_auth_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    token_type VARCHAR(32) NOT NULL,
    user_id VARCHAR(64),
    consumed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_consumed_auth_tokens_expires ON consumed_auth_tokens(expires_at);

-- 2. Indexes and columns for atomic quotation consumption
ALTER TABLE price_quotations ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64);
ALTER TABLE price_quotations ADD COLUMN IF NOT EXISTS consumed BOOLEAN DEFAULT FALSE;
ALTER TABLE price_quotations ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE price_quotations ADD COLUMN IF NOT EXISTS consumed_by VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_price_quotations_atomic_consume 
ON price_quotations(id, consumed, expires_at);

-- 3. Idempotently add check constraint for non-negative liabilities
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_projection_non_negative_liability'
    ) THEN
        ALTER TABLE account_balance_projections 
        ADD CONSTRAINT chk_projection_non_negative_liability 
        CHECK (
            account_code NOT IN ('2001', '2002', '2003') OR net_balance_ugx >= 0
        );
    END IF;
END $$;

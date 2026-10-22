-- ============================================================================
-- MUMWE SAFARIS — DPO Pay Sandbox & Controlled Live Payment Migration
-- Ticket Reference: #2777504 | Sandbox Service Type ID: 54841
-- ============================================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS phone VARCHAR(32) DEFAULT '';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS service_type_id VARCHAR(32) DEFAULT '54841';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS support_ticket_ref VARCHAR(32) DEFAULT '2777504';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS dpo_trans_token VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS dpo_trans_ref VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS dpo_approval_code VARCHAR(64);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS dpo_result_code VARCHAR(32);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS dpo_result_explanation TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS mobile_instructions TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS environment VARCHAR(16) DEFAULT 'sandbox';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(32) DEFAULT 'INITIATED';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS callback_count INT DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS last_callback_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS audit_trail JSONB DEFAULT '[]';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_metadata JSONB DEFAULT '{}';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS payment_status VARCHAR(32) DEFAULT 'PENDING';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS payment_environment VARCHAR(16);
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS payment_environment VARCHAR(16);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS payment_status VARCHAR(32) DEFAULT 'PENDING';
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS payment_environment VARCHAR(16);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sandbox_wallet_balance_ugx NUMERIC(14, 2) DEFAULT 0.0;

CREATE INDEX IF NOT EXISTS idx_payments_dpo_token ON payments(dpo_trans_token);
CREATE INDEX IF NOT EXISTS idx_payments_status_env ON payments(status, environment);
CREATE INDEX IF NOT EXISTS idx_payments_lifecycle_env ON payments(lifecycle_status, environment);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotency_key);

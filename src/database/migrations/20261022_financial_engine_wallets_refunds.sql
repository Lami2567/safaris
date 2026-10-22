-- ==========================================================
-- MUMWE SAFARIS — Financial Engine, Customer Wallets,
-- Platform Earnings, and Automatic Refunds Migration
-- ==========================================================

-- 1. WALLET TRANSACTIONS IMMUTABLE LEDGER
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_ugx NUMERIC(14, 2) NOT NULL, -- Positive for Credit (Deposit/Refund), Negative for Debit (Payment/Withdrawal)
    balance_after_ugx NUMERIC(14, 2) NOT NULL,
    type VARCHAR(32) NOT NULL, -- 'DEPOSIT', 'BOOKING_PAYMENT', 'REFUND', 'ADJUSTMENT', 'PAYOUT'
    reference_type VARCHAR(32) NOT NULL, -- 'TRIP', 'TOUR', 'DELIVERY', 'WALLET_TOPUP', 'ADMIN_ADJUSTMENT'
    reference_id VARCHAR(64) NOT NULL,
    payment_id VARCHAR(64),
    refund_id VARCHAR(64),
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox', -- 'sandbox' | 'production'
    idempotency_key VARCHAR(128),
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_ref ON wallet_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_env ON wallet_transactions(environment);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_idempotency ON wallet_transactions(idempotency_key);

-- 2. REFUND POLICIES TABLE (ADMIN CONFIGURABLE)
CREATE TABLE IF NOT EXISTS refund_policies (
    id VARCHAR(64) PRIMARY KEY,
    policy_name VARCHAR(128) NOT NULL UNIQUE,
    is_enabled BOOLEAN DEFAULT TRUE,
    max_waiting_minutes INT NOT NULL DEFAULT 15, -- Max permitted waiting period after agreed pickup time
    applicable_service_types TEXT[] DEFAULT ARRAY['ride', 'airport_shuttle', 'delivery'],
    applicable_payment_methods TEXT[] DEFAULT ARRAY['WALLET', 'CARD', 'MTN_MOMO', 'AIRTEL_MONEY'],
    refund_percentage NUMERIC(5, 2) DEFAULT 100.0,
    require_driver_assigned BOOLEAN DEFAULT TRUE,
    require_no_arrival BOOLEAN DEFAULT TRUE,
    auto_process_enabled BOOLEAN DEFAULT TRUE,
    updated_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. REFUNDS TABLE (IMMUTABLE RECORD OF REFUND REQUESTS AND EXECUTIONS)
CREATE TABLE IF NOT EXISTS refunds (
    id VARCHAR(64) PRIMARY KEY,
    refund_reference VARCHAR(128) UNIQUE NOT NULL,
    payment_id VARCHAR(64),
    booking_id VARCHAR(64),
    trip_id VARCHAR(64),
    delivery_id VARCHAR(64),
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    amount_ugx NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(8) DEFAULT 'UGX',
    reason VARCHAR(64) NOT NULL, -- 'DRIVER_NO_SHOW', 'CUSTOMER_CANCELLED', 'DUPLICATE_PAYMENT', 'ADMIN_DISCRETION', 'SERVICE_UNFULFILLED'
    refund_method VARCHAR(32) NOT NULL, -- 'WALLET', 'DPO_PROVIDER', 'MANUAL_OFFLINE'
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REJECTED'
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    policy_version VARCHAR(32),
    policy_snapshot JSONB DEFAULT '{}',
    eligibility_evidence JSONB DEFAULT '{}',
    dpo_refund_trans_token VARCHAR(128),
    failure_reason TEXT,
    processed_by VARCHAR(64) DEFAULT 'SYSTEM_AUTO_WORKER',
    processed_at TIMESTAMP WITH TIME ZONE,
    audit_trail JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refunds_status_env ON refunds(status, environment);
CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_trip ON refunds(trip_id);

-- 4. PLATFORM EARNINGS AND COMMISSION LEDGER
CREATE TABLE IF NOT EXISTS platform_earnings (
    id VARCHAR(64) PRIMARY KEY,
    booking_type VARCHAR(32) NOT NULL, -- 'TRIP', 'TOUR', 'DELIVERY'
    booking_id VARCHAR(64) NOT NULL,
    payment_id VARCHAR(64),
    payer_user_id VARCHAR(64) REFERENCES users(id),
    beneficiary_id VARCHAR(64), -- driver_id or tour_guide_id
    gross_amount_ugx NUMERIC(14, 2) NOT NULL,
    platform_commission_ugx NUMERIC(14, 2) NOT NULL,
    platform_commission_rate NUMERIC(5, 2) NOT NULL, -- e.g. 15.00 for 15%
    beneficiary_earnings_ugx NUMERIC(14, 2) NOT NULL, -- e.g. 85% payable to driver/guide
    payment_method VARCHAR(64) NOT NULL,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    status VARCHAR(32) NOT NULL DEFAULT 'EARNED', -- 'EARNED', 'HELD', 'REVERSED', 'REFUNDED'
    refund_id VARCHAR(64),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_earnings_booking ON platform_earnings(booking_type, booking_id);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_beneficiary ON platform_earnings(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_env ON platform_earnings(environment, status);

-- 5. FINANCIAL ADJUSTMENTS AUDIT TABLE
CREATE TABLE IF NOT EXISTS financial_adjustments (
    id VARCHAR(64) PRIMARY KEY,
    admin_id VARCHAR(64) REFERENCES users(id),
    target_type VARCHAR(32) NOT NULL, -- 'WALLET', 'DRIVER_PAYABLE', 'GUIDE_PAYABLE', 'PLATFORM_REVENUE'
    target_id VARCHAR(64) NOT NULL, -- userId or driverId
    amount_ugx NUMERIC(14, 2) NOT NULL,
    adjustment_type VARCHAR(32) NOT NULL, -- 'CREDIT', 'DEBIT'
    reason TEXT NOT NULL,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fin_adjustments_target ON financial_adjustments(target_type, target_id);

-- 6. EXTEND EXISTING TABLES WITH FINANCIAL/REFUND COLUMNS
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32) DEFAULT 'NONE'; -- 'NONE', 'PARTIAL', 'FULL'
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount_ugx NUMERIC(14, 2) DEFAULT 0.0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_id VARCHAR(64);

ALTER TABLE trips ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32) DEFAULT 'NONE';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS refunded_amount_ugx NUMERIC(14, 2) DEFAULT 0.0;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS refund_id VARCHAR(64);

ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32) DEFAULT 'NONE';
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS refunded_amount_ugx NUMERIC(14, 2) DEFAULT 0.0;
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS refund_id VARCHAR(64);

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32) DEFAULT 'NONE';
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS refunded_amount_ugx NUMERIC(14, 2) DEFAULT 0.0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS refund_id VARCHAR(64);

-- Seed default No-Show Refund Policy if not present
INSERT INTO refund_policies (
    id, policy_name, is_enabled, max_waiting_minutes, 
    applicable_service_types, applicable_payment_methods, refund_percentage, 
    require_driver_assigned, require_no_arrival, auto_process_enabled
) VALUES (
    'pol_driver_noshow_default',
    'DRIVER_NO_SHOW_POLICY',
    TRUE,
    15,
    ARRAY['ride', 'airport_shuttle', 'delivery'],
    ARRAY['WALLET', 'CARD', 'MTN_MOMO', 'AIRTEL_MONEY'],
    100.0,
    TRUE,
    TRUE,
    TRUE
) ON CONFLICT (policy_name) DO NOTHING;

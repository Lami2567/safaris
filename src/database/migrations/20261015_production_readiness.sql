-- ==========================================================
-- SAFARIS UGANDA — Production Readiness Migration
-- Date: 2026-10-15
-- Features:
--   1. Driver & Tour Guide Approval Workflow (Careers Portal Integration)
--   2. Careers Recruitment Applications Table
--   3. Authoritative Service & Delivery Pricing Settings
--   4. Enhanced Payments Audit & DPO Transaction Logs
--   5. Admin Password Change & Audit Tracking
-- ==========================================================

-- 1. ADD APPROVAL & RECRUITMENT STATUS TO USERS TABLE
DO $$ BEGIN
    CREATE TYPE approval_status_type AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(32) DEFAULT 'APPROVED',
    ADD COLUMN IF NOT EXISTS application_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status);

-- 2. ENHANCE DRIVERS TABLE FOR LICENSING & ADMIN APPROVAL
ALTER TABLE drivers 
    ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(32) DEFAULT 'PENDING_APPROVAL',
    ADD COLUMN IF NOT EXISTS national_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS driving_permit_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS permit_expiry DATE,
    ADD COLUMN IF NOT EXISTS years_of_experience INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS application_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS approved_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS speed NUMERIC(6, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS battery_level NUMERIC(5, 2);

CREATE INDEX IF NOT EXISTS idx_drivers_approval ON drivers(is_approved, approval_status);

-- 3. ENHANCE TOUR GUIDES TABLE FOR LICENSING & ADMIN APPROVAL
ALTER TABLE tour_guides 
    ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(32) DEFAULT 'PENDING_APPROVAL',
    ADD COLUMN IF NOT EXISTS application_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS national_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS uwa_license_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS approved_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tour_guides_approval ON tour_guides(is_approved, approval_status);

-- 4. CAREERS RECRUITMENT APPLICATIONS TABLE
CREATE TABLE IF NOT EXISTS career_applications (
    id VARCHAR(64) PRIMARY KEY,
    applicant_type VARCHAR(32) NOT NULL, -- 'driver' | 'tour_guide'
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    national_id VARCHAR(64),
    license_number VARCHAR(64),
    experience_years INT DEFAULT 0,
    vehicle_make VARCHAR(64),
    vehicle_model VARCHAR(64),
    vehicle_plate VARCHAR(32),
    vehicle_tier VARCHAR(32),
    languages TEXT[] DEFAULT ARRAY['English'],
    specialties TEXT[] DEFAULT ARRAY['Uganda Safaris'],
    documents JSONB DEFAULT '{}', -- CV, driving permit photo, national ID photo, UWA certificate
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL', -- 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED'
    rejection_reason TEXT,
    reviewed_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_career_apps_status ON career_applications(status, applicant_type);
CREATE INDEX IF NOT EXISTS idx_career_apps_email ON career_applications(email);
CREATE INDEX IF NOT EXISTS idx_career_apps_phone ON career_applications(phone);

-- 5. SERVICE PRICING CONFIGURATION & AUDIT TRAIL
CREATE TABLE IF NOT EXISTS service_pricing (
    id VARCHAR(64) PRIMARY KEY,
    service_type VARCHAR(64) NOT NULL UNIQUE, -- 'boda', 'go', 'comfort', 'safari4x4', 'tour_van', 'delivery', 'airport_shuttle'
    base_fare NUMERIC(12, 2) NOT NULL,
    per_km_rate NUMERIC(12, 2) NOT NULL,
    per_minute_rate NUMERIC(12, 2) DEFAULT 0.0,
    minimum_fare NUMERIC(12, 2) NOT NULL,
    cancellation_fee NUMERIC(12, 2) DEFAULT 0.0,
    config JSONB DEFAULT '{}', -- Additional rules (e.g. night surcharges, weight multipliers)
    updated_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pricing_audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    admin_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    service_category VARCHAR(64) NOT NULL,
    old_pricing JSONB NOT NULL,
    new_pricing JSONB NOT NULL,
    ip_address VARCHAR(64) DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pricing_audit_logs_created ON pricing_audit_logs(created_at DESC);

-- 6. ENHANCE PAYMENTS TABLE FOR OFFICIAL DPO PAY INTEGRATION
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS dpo_trans_token VARCHAR(128),
    ADD COLUMN IF NOT EXISTS dpo_trans_ref VARCHAR(128),
    ADD COLUMN IF NOT EXISTS dpo_result_code VARCHAR(32),
    ADD COLUMN IF NOT EXISTS dpo_result_explanation TEXT,
    ADD COLUMN IF NOT EXISTS payment_url TEXT,
    ADD COLUMN IF NOT EXISTS failure_reason TEXT,
    ADD COLUMN IF NOT EXISTS environment VARCHAR(16) DEFAULT 'sandbox',
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_payments_dpo_token ON payments(dpo_trans_token);
CREATE INDEX IF NOT EXISTS idx_payments_status_env ON payments(status, environment);

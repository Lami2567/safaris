-- ==========================================================
-- SAFARIS UGANDA — Relational PostgreSQL Production Schema
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ROLES ENUM
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'driver', 'tour_guide', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE trip_status AS ENUM (
        'REQUESTED', 'SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 
        'DRIVER_ARRIVED', 'TRIP_STARTED', 'TRIP_COMPLETED', 'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE delivery_status AS ENUM (
        'PLACED', 'COURIER_ASSIGNED', 'PACKAGE_COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(32) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'customer',
    avatar_url TEXT DEFAULT '',
    rating NUMERIC(3, 2) DEFAULT 5.00,
    total_trips INT DEFAULT 0,
    wallet_balance_ugx NUMERIC(14, 2) DEFAULT 0.00,
    is_verified BOOLEAN DEFAULT FALSE,
    approval_status VARCHAR(32) DEFAULT 'APPROVED',
    application_id VARCHAR(64),
    password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(32) DEFAULT 'APPROVED';
ALTER TABLE users ADD COLUMN IF NOT EXISTS application_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status);

-- 3. VEHICLES TABLE
CREATE TABLE IF NOT EXISTS vehicles (
    id VARCHAR(64) PRIMARY KEY,
    driver_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(32) NOT NULL, -- 'boda', 'go', 'comfort', 'safari4x4', 'tour_van'
    make VARCHAR(64) NOT NULL,
    model VARCHAR(64) NOT NULL,
    registration_plate VARCHAR(32) UNIQUE NOT NULL, -- e.g. UBM 714K
    color VARCHAR(32) NOT NULL,
    capacity INT DEFAULT 4,
    status VARCHAR(32) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. DRIVER PROFILES
CREATE TABLE IF NOT EXISTS drivers (
    id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id VARCHAR(64) REFERENCES vehicles(id) ON DELETE SET NULL,
    is_online BOOLEAN DEFAULT FALSE,
    is_available BOOLEAN DEFAULT TRUE,
    is_approved BOOLEAN DEFAULT FALSE,
    approval_status VARCHAR(32) DEFAULT 'PENDING_APPROVAL',
    current_lat NUMERIC(10, 6) DEFAULT 0.3136,
    current_lng NUMERIC(10, 6) DEFAULT 32.5811,
    heading NUMERIC(5, 2) DEFAULT 0.0,
    speed NUMERIC(6, 2) DEFAULT 0.0,
    battery_level NUMERIC(5, 2),
    license_number VARCHAR(64),
    license_expiry DATE,
    national_id VARCHAR(64),
    driving_permit_number VARCHAR(64),
    permit_expiry DATE,
    years_of_experience INT DEFAULT 0,
    application_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    acceptance_rate NUMERIC(5, 2) DEFAULT 98.0,
    today_earnings_ugx NUMERIC(14, 2) DEFAULT 0.0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS approval_status VARCHAR(32) DEFAULT 'PENDING_APPROVAL';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS national_id VARCHAR(64);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS driving_permit_number VARCHAR(64);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS permit_expiry DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS years_of_experience INT DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS application_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS approved_by VARCHAR(64);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS speed NUMERIC(6, 2) DEFAULT 0.0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS battery_level NUMERIC(5, 2);

CREATE INDEX IF NOT EXISTS idx_drivers_online ON drivers(is_online, is_available);
CREATE INDEX IF NOT EXISTS idx_drivers_approval ON drivers(is_approved, approval_status);

-- 5. TOUR GUIDES TABLE
CREATE TABLE IF NOT EXISTS tour_guides (
    id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    bio TEXT NOT NULL,
    languages TEXT[] DEFAULT ARRAY['English', 'Luganda'],
    specialties TEXT[] DEFAULT ARRAY['Gorilla Trekking', 'Savannah Safaris'],
    daily_rate_ugx NUMERIC(12, 2) NOT NULL DEFAULT 150000.0,
    is_uwa_certified BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN DEFAULT TRUE,
    is_approved BOOLEAN DEFAULT FALSE,
    approval_status VARCHAR(32) DEFAULT 'PENDING_APPROVAL',
    application_id VARCHAR(64),
    national_id VARCHAR(64),
    uwa_license_number VARCHAR(64),
    approved_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    expeditions_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS approval_status VARCHAR(32) DEFAULT 'PENDING_APPROVAL';
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS application_id VARCHAR(64);
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS national_id VARCHAR(64);
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS uwa_license_number VARCHAR(64);
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS approved_by VARCHAR(64);
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tour_guides_approval ON tour_guides(is_approved, approval_status);

-- 6. DESTINATIONS TABLE
CREATE TABLE IF NOT EXISTS destinations (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    subtitle VARCHAR(255) NOT NULL,
    region VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    highlights TEXT[] DEFAULT '{}',
    best_time_to_visit VARCHAR(128),
    distance_hours_from_kampala INT DEFAULT 5,
    hero_tag VARCHAR(64) DEFAULT 'SAFARI',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. TOUR PACKAGES TABLE
CREATE TABLE IF NOT EXISTS tour_packages (
    id VARCHAR(64) PRIMARY KEY,
    destination_id VARCHAR(64) REFERENCES destinations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    duration_days INT NOT NULL,
    price_per_person_ugx NUMERIC(14, 2) NOT NULL,
    group_type VARCHAR(64) NOT NULL,
    inclusions TEXT[] DEFAULT '{}',
    itinerary_summary TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. TRIPS TABLE
CREATE TABLE IF NOT EXISTS trips (
    id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    driver_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    pickup_title VARCHAR(255) NOT NULL,
    pickup_address TEXT NOT NULL,
    pickup_lat NUMERIC(10, 6) NOT NULL,
    pickup_lng NUMERIC(10, 6) NOT NULL,
    dest_title VARCHAR(255) NOT NULL,
    dest_address TEXT NOT NULL,
    dest_lat NUMERIC(10, 6) NOT NULL,
    dest_lng NUMERIC(10, 6) NOT NULL,
    vehicle_tier VARCHAR(32) NOT NULL,
    status trip_status NOT NULL DEFAULT 'REQUESTED',
    distance_km NUMERIC(8, 2) NOT NULL,
    estimated_duration_mins INT NOT NULL,
    fare_ugx NUMERIC(14, 2) NOT NULL,
    tip_ugx NUMERIC(10, 2) DEFAULT 0.0,
    payment_method VARCHAR(64) DEFAULT 'MTN Mobile Money',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trips_customer ON trips(customer_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);

-- 9. TOUR BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS tour_bookings (
    id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    destination_id VARCHAR(64),
    package_id VARCHAR(64),
    guide_id VARCHAR(64),
    tour_guide_id VARCHAR(64),
    travelers_count INT NOT NULL DEFAULT 1,
    guests_count INT NOT NULL DEFAULT 1,
    start_date VARCHAR(64),
    travel_date VARCHAR(64),
    pickup_location TEXT DEFAULT 'Kampala',
    special_requests TEXT DEFAULT '',
    total_ugx NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status VARCHAR(32) DEFAULT 'CONFIRMED',
    booking_status VARCHAR(32) DEFAULT 'CONFIRMED',
    payment_method VARCHAR(64) DEFAULT 'MTN Mobile Money',
    payment_status VARCHAR(32) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS destination_id VARCHAR(64);
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS tour_guide_id VARCHAR(64);
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS guests_count INT DEFAULT 1;
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS travel_date VARCHAR(64);
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS special_requests TEXT DEFAULT '';
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS booking_status VARCHAR(32) DEFAULT 'CONFIRMED';
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64) DEFAULT 'MTN Mobile Money';
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- 10. DELIVERIES TABLE
CREATE TABLE IF NOT EXISTS deliveries (
    id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    courier_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    pickup_address TEXT NOT NULL,
    dropoff_address TEXT NOT NULL,
    sender_phone VARCHAR(32) NOT NULL,
    recipient_name VARCHAR(128) NOT NULL,
    recipient_phone VARCHAR(32) NOT NULL,
    category VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    weight_kg NUMERIC(6, 2) DEFAULT 1.0,
    price_ugx NUMERIC(14, 2) NOT NULL,
    status delivery_status DEFAULT 'PLACED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    trip_id VARCHAR(64) REFERENCES trips(id) ON DELETE SET NULL,
    delivery_id VARCHAR(64) REFERENCES deliveries(id) ON DELETE SET NULL,
    booking_id VARCHAR(64) REFERENCES tour_bookings(id) ON DELETE SET NULL,
    amount_ugx NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(8) DEFAULT 'UGX',
    payment_method VARCHAR(64) NOT NULL,
    phone VARCHAR(32) DEFAULT '',
    reference VARCHAR(128) UNIQUE NOT NULL,
    idempotency_key VARCHAR(128),
    attempt_number INT DEFAULT 1,
    service_type_id VARCHAR(32) DEFAULT '54841',
    support_ticket_ref VARCHAR(32) DEFAULT '2777504',
    dpo_trans_token VARCHAR(128),
    dpo_trans_ref VARCHAR(128),
    dpo_approval_code VARCHAR(64),
    dpo_result_code VARCHAR(32),
    dpo_result_explanation TEXT,
    payment_url TEXT,
    mobile_instructions TEXT,
    failure_reason TEXT,
    environment VARCHAR(16) DEFAULT 'sandbox',
    lifecycle_status VARCHAR(32) DEFAULT 'INITIATED',
    status payment_status NOT NULL DEFAULT 'PENDING',
    callback_count INT DEFAULT 0,
    last_callback_at TIMESTAMP WITH TIME ZONE,
    audit_trail JSONB DEFAULT '[]',
    provider_metadata JSONB DEFAULT '{}',
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

-- 11b. CAREER RECRUITMENT APPLICATIONS TABLE
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
    documents JSONB DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL',
    rejection_reason TEXT,
    reviewed_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_career_apps_status ON career_applications(status, applicant_type);

-- 11c. SERVICE PRICING MATRIX TABLE
CREATE TABLE IF NOT EXISTS service_pricing (
    id VARCHAR(64) PRIMARY KEY,
    service_type VARCHAR(64) NOT NULL UNIQUE,
    base_fare NUMERIC(12, 2) NOT NULL,
    per_km_rate NUMERIC(12, 2) NOT NULL,
    per_minute_rate NUMERIC(12, 2) DEFAULT 0.0,
    minimum_fare NUMERIC(12, 2) NOT NULL,
    cancellation_fee NUMERIC(12, 2) DEFAULT 0.0,
    config JSONB DEFAULT '{}',
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

-- 12. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    sender_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    receiver_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    trip_id VARCHAR(64) REFERENCES trips(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id);

-- 13. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(32) NOT NULL, -- 'DRIVER', 'PAYMENT', 'ADMIN', 'SYSTEM'
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- 14. APP CONFIGURATION TABLE
CREATE TABLE IF NOT EXISTS app_config (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 15. LOCATION SESSIONS & REAL-TIME TELEMETRY TABLES
-- ==========================================================
CREATE TABLE IF NOT EXISTS location_sessions (
    id VARCHAR(64) PRIMARY KEY,
    driver_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    trip_id VARCHAR(64) REFERENCES trips(id) ON DELETE SET NULL,
    safari_leg_id VARCHAR(64),
    role VARCHAR(32) DEFAULT 'driver',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_loc_sessions_driver ON location_sessions(driver_id);
CREATE INDEX IF NOT EXISTS idx_loc_sessions_trip ON location_sessions(trip_id);

CREATE TABLE IF NOT EXISTS location_points (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64),
    trip_id VARCHAR(64),
    driver_id VARCHAR(64) NOT NULL,
    safari_leg_id VARCHAR(64),
    lat NUMERIC(10, 6) NOT NULL,
    lng NUMERIC(10, 6) NOT NULL,
    speed NUMERIC(6, 2) DEFAULT 0.0,
    heading NUMERIC(5, 2) DEFAULT 0.0,
    accuracy NUMERIC(6, 2) DEFAULT 5.0,
    battery_level NUMERIC(5, 2),
    is_offline_queued BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loc_points_driver_time ON location_points(driver_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_loc_points_trip_time ON location_points(trip_id, recorded_at ASC);

-- 16. MULTI-DAY SAFARI TOUR LEGS
CREATE TABLE IF NOT EXISTS tour_legs (
    id VARCHAR(64) PRIMARY KEY,
    booking_id VARCHAR(64) REFERENCES tour_bookings(id) ON DELETE CASCADE,
    day_number INT NOT NULL DEFAULT 1,
    origin_title VARCHAR(255) NOT NULL,
    origin_lat NUMERIC(10, 6) NOT NULL,
    origin_lng NUMERIC(10, 6) NOT NULL,
    dest_title VARCHAR(255) NOT NULL,
    dest_lat NUMERIC(10, 6) NOT NULL,
    dest_lng NUMERIC(10, 6) NOT NULL,
    distance_km NUMERIC(8, 2) DEFAULT 0.0,
    estimated_hours NUMERIC(4, 1) DEFAULT 4.0,
    status VARCHAR(32) DEFAULT 'pending', -- 'pending', 'active', 'completed'
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_tour_legs_booking ON tour_legs(booking_id, day_number);

-- 17. SECURE ADMIN AUDIT LOGS
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    admin_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(64) DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);

-- ==========================================================
-- 18. FINANCIAL ENGINE: WALLETS, REFUNDS, EARNINGS & POLICIES
-- ==========================================================

-- 18a. WALLET TRANSACTIONS IMMUTABLE LEDGER
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_ugx NUMERIC(14, 2) NOT NULL,
    balance_after_ugx NUMERIC(14, 2) NOT NULL,
    type VARCHAR(32) NOT NULL,
    reference_type VARCHAR(32) NOT NULL,
    reference_id VARCHAR(64) NOT NULL,
    payment_id VARCHAR(64),
    refund_id VARCHAR(64),
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    idempotency_key VARCHAR(128),
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_ref ON wallet_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_env ON wallet_transactions(environment);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_idempotency ON wallet_transactions(idempotency_key);

-- 18b. REFUND POLICIES TABLE (ADMIN CONFIGURABLE)
CREATE TABLE IF NOT EXISTS refund_policies (
    id VARCHAR(64) PRIMARY KEY,
    policy_name VARCHAR(128) NOT NULL UNIQUE,
    is_enabled BOOLEAN DEFAULT TRUE,
    max_waiting_minutes INT NOT NULL DEFAULT 15,
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

-- 18c. REFUNDS TABLE
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
    reason VARCHAR(64) NOT NULL,
    refund_method VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
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

-- 18d. PLATFORM EARNINGS AND COMMISSION LEDGER
CREATE TABLE IF NOT EXISTS platform_earnings (
    id VARCHAR(64) PRIMARY KEY,
    booking_type VARCHAR(32) NOT NULL,
    booking_id VARCHAR(64) NOT NULL,
    payment_id VARCHAR(64),
    payer_user_id VARCHAR(64) REFERENCES users(id),
    beneficiary_id VARCHAR(64),
    gross_amount_ugx NUMERIC(14, 2) NOT NULL,
    platform_commission_ugx NUMERIC(14, 2) NOT NULL,
    platform_commission_rate NUMERIC(5, 2) NOT NULL,
    beneficiary_earnings_ugx NUMERIC(14, 2) NOT NULL,
    payment_method VARCHAR(64) NOT NULL,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    status VARCHAR(32) NOT NULL DEFAULT 'EARNED',
    refund_id VARCHAR(64),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_earnings_booking ON platform_earnings(booking_type, booking_id);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_beneficiary ON platform_earnings(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_env ON platform_earnings(environment, status);

-- 18e. FINANCIAL ADJUSTMENTS AUDIT TABLE
CREATE TABLE IF NOT EXISTS financial_adjustments (
    id VARCHAR(64) PRIMARY KEY,
    admin_id VARCHAR(64) REFERENCES users(id),
    target_type VARCHAR(32) NOT NULL,
    target_id VARCHAR(64) NOT NULL,
    amount_ugx NUMERIC(14, 2) NOT NULL,
    adjustment_type VARCHAR(32) NOT NULL,
    reason TEXT NOT NULL,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fin_adjustments_target ON financial_adjustments(target_type, target_id);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32) DEFAULT 'NONE';
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

-- ==========================================================
-- 19. PRODUCTION DOUBLE-ENTRY FINANCIAL ENGINE SCHEMA
-- ==========================================================

-- 19a. CHART OF ACCOUNTS (ledger_accounts)
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id VARCHAR(64) PRIMARY KEY,
    account_code VARCHAR(64) NOT NULL UNIQUE,
    account_name VARCHAR(128) NOT NULL,
    account_type VARCHAR(32) NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY')),
    normal_balance VARCHAR(16) NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    owner_type VARCHAR(32) DEFAULT 'PLATFORM',
    owner_id VARCHAR(64),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_owner ON ledger_accounts(owner_type, owner_id);

-- 19b. IMMUTABLE LEDGER TRANSACTIONS HEADER (ledger_transactions)
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(128) NOT NULL UNIQUE,
    idempotency_key VARCHAR(128) UNIQUE,
    transaction_type VARCHAR(64) NOT NULL,
    reference_type VARCHAR(64) NOT NULL,
    reference_id VARCHAR(64) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    total_debit_ugx BIGINT NOT NULL CHECK (total_debit_ugx > 0),
    total_credit_ugx BIGINT NOT NULL CHECK (total_credit_ugx > 0),
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    status VARCHAR(32) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'REVERSED')),
    description TEXT NOT NULL,
    posted_by VARCHAR(64) DEFAULT 'SYSTEM',
    reversal_of_transaction_id VARCHAR(64) REFERENCES ledger_transactions(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_double_entry_balanced CHECK (total_debit_ugx = total_credit_ugx)
);

CREATE INDEX IF NOT EXISTS idx_ledger_tx_ref ON ledger_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_env_created ON ledger_transactions(environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_type ON ledger_transactions(transaction_type, environment);

-- 19c. IMMUTABLE LEDGER ENTRIES (ledger_entries)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id VARCHAR(64) PRIMARY KEY,
    transaction_id VARCHAR(64) NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    account_id VARCHAR(64) NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    account_code VARCHAR(64) NOT NULL,
    owner_id VARCHAR(64),
    direction VARCHAR(16) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount_ugx BIGINT NOT NULL CHECK (amount_ugx > 0),
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(account_code, environment);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_owner ON ledger_entries(owner_id, environment);

-- Enforce immutability of posted ledger entries at PostgreSQL boundary
CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Ledger entries are immutable and cannot be modified or deleted. Use a compensating ledger transaction.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_ledger_entries ON ledger_entries;
CREATE TRIGGER trg_immutable_ledger_entries
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entry_mutation();

-- 19d. ACCOUNT BALANCE PROJECTIONS (account_balance_projections)
CREATE TABLE IF NOT EXISTS account_balance_projections (
    id VARCHAR(128) PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL REFERENCES ledger_accounts(id),
    account_code VARCHAR(64) NOT NULL,
    owner_id VARCHAR(64) NOT NULL DEFAULT 'PLATFORM',
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    debit_total_ugx BIGINT NOT NULL DEFAULT 0,
    credit_total_ugx BIGINT NOT NULL DEFAULT 0,
    net_balance_ugx BIGINT NOT NULL DEFAULT 0,
    last_transaction_id VARCHAR(64),
    version BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_code, owner_id, currency, environment)
);

-- 19e. CUSTOMER & BENEFICIARY WALLETS (wallets & wallet_holds)
CREATE TABLE IF NOT EXISTS wallets (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    owner_role VARCHAR(32) NOT NULL DEFAULT 'customer',
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    available_balance_ugx BIGINT NOT NULL DEFAULT 0 CHECK (available_balance_ugx >= 0),
    reserved_balance_ugx BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance_ugx >= 0),
    pending_topups_ugx BIGINT NOT NULL DEFAULT 0 CHECK (pending_topups_ugx >= 0),
    total_verified_deposits_ugx BIGINT NOT NULL DEFAULT 0 CHECK (total_verified_deposits_ugx >= 0),
    total_completed_spending_ugx BIGINT NOT NULL DEFAULT 0 CHECK (total_completed_spending_ugx >= 0),
    total_refunded_ugx BIGINT NOT NULL DEFAULT 0 CHECK (total_refunded_ugx >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'SUSPENDED', 'COMPLIANCE_RESTRICTED')),
    custody_partner_status VARCHAR(64) DEFAULT 'INTERNAL_LEDGER_ONLY',
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, currency, environment)
);

CREATE TABLE IF NOT EXISTS wallet_holds (
    id VARCHAR(64) PRIMARY KEY,
    wallet_id VARCHAR(64) NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    amount_ugx BIGINT NOT NULL CHECK (amount_ugx > 0),
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    reference_type VARCHAR(64) NOT NULL,
    reference_id VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD', 'CAPTURED', 'RELEASED', 'EXPIRED')),
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_holds_user_status ON wallet_holds(user_id, status, environment);

-- 19f. PAYMENT INTENTS, ATTEMPTS, PROVIDER EVENTS, VERIFICATIONS & SETTLEMENTS
CREATE TABLE IF NOT EXISTS payment_intents (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    reference_type VARCHAR(32) NOT NULL,
    reference_id VARCHAR(64) NOT NULL,
    amount_ugx BIGINT NOT NULL CHECK (amount_ugx > 0),
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    payment_method VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    ledger_transaction_id VARCHAR(64),
    policy_version_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_attempts (
    id VARCHAR(64) PRIMARY KEY,
    payment_intent_id VARCHAR(64) REFERENCES payment_intents(id),
    payment_id VARCHAR(64),
    merchant_reference VARCHAR(128) NOT NULL UNIQUE,
    dpo_trans_token VARCHAR(128) UNIQUE,
    dpo_trans_ref VARCHAR(128),
    amount_ugx BIGINT NOT NULL CHECK (amount_ugx > 0),
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    payment_method VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'INITIATED',
    result_code VARCHAR(32),
    result_explanation TEXT,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_provider_events (
    id VARCHAR(64) PRIMARY KEY,
    provider VARCHAR(32) NOT NULL DEFAULT 'DPO',
    event_type VARCHAR(64) NOT NULL,
    dpo_trans_token VARCHAR(128),
    merchant_reference VARCHAR(128),
    payment_id VARCHAR(64),
    raw_payload JSONB DEFAULT '{}',
    processed BOOLEAN DEFAULT FALSE,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_verifications (
    id VARCHAR(64) PRIMARY KEY,
    payment_id VARCHAR(64) NOT NULL,
    dpo_trans_token VARCHAR(128) NOT NULL,
    merchant_reference VARCHAR(128) NOT NULL,
    result_code VARCHAR(32) NOT NULL,
    result_explanation TEXT,
    verified_amount_ugx BIGINT,
    verified_currency VARCHAR(8),
    is_amount_matched BOOLEAN NOT NULL DEFAULT FALSE,
    is_currency_matched BOOLEAN NOT NULL DEFAULT FALSE,
    verification_status VARCHAR(32) NOT NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'server',
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_settlements (
    id VARCHAR(64) PRIMARY KEY,
    settlement_reference VARCHAR(128) NOT NULL UNIQUE,
    provider VARCHAR(32) NOT NULL DEFAULT 'DPO',
    payment_id VARCHAR(64),
    dpo_trans_token VARCHAR(128),
    gross_amount_ugx BIGINT NOT NULL,
    gateway_fee_ugx BIGINT NOT NULL DEFAULT 0,
    net_settled_ugx BIGINT NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    settlement_status VARCHAR(32) NOT NULL DEFAULT 'SETTLED',
    settlement_date TIMESTAMP WITH TIME ZONE,
    ledger_transaction_id VARCHAR(64),
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 19g. REFUND ATTEMPTS & POLICY VERSIONS
CREATE TABLE IF NOT EXISTS financial_policy_versions (
    id VARCHAR(64) PRIMARY KEY,
    policy_id VARCHAR(64) NOT NULL,
    version_number INT NOT NULL,
    policy_name VARCHAR(128) NOT NULL,
    max_waiting_minutes INT NOT NULL DEFAULT 15,
    refund_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    developer_commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    platform_ride_commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    platform_tour_commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
    rules_snapshot JSONB NOT NULL DEFAULT '{}',
    created_by VARCHAR(64) DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(policy_id, version_number)
);

CREATE TABLE IF NOT EXISTS refund_attempts (
    id VARCHAR(64) PRIMARY KEY,
    refund_id VARCHAR(64) NOT NULL REFERENCES refunds(id),
    attempt_number INT NOT NULL DEFAULT 1,
    refund_method VARCHAR(32) NOT NULL,
    amount_ugx BIGINT NOT NULL CHECK (amount_ugx > 0),
    provider_reference VARCHAR(128),
    status VARCHAR(32) NOT NULL,
    failure_reason TEXT,
    ledger_transaction_id VARCHAR(64),
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 19h. WITHDRAWALS, PAYOUT DESTINATIONS, REQUESTS & ATTEMPTS
CREATE TABLE IF NOT EXISTS payout_destinations (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    beneficiary_role VARCHAR(32) NOT NULL,
    channel VARCHAR(32) NOT NULL CHECK (channel IN ('MTN_MOMO', 'AIRTEL_MONEY', 'BANK_TRANSFER')),
    account_number VARCHAR(64) NOT NULL,
    account_name VARCHAR(128) NOT NULL,
    bank_name VARCHAR(128),
    is_verified BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payout_requests (
    id VARCHAR(64) PRIMARY KEY,
    payout_reference VARCHAR(128) NOT NULL UNIQUE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    beneficiary_role VARCHAR(32) NOT NULL CHECK (beneficiary_role IN ('driver', 'tour_guide')),
    destination_id VARCHAR(64) REFERENCES payout_destinations(id),
    amount_ugx BIGINT NOT NULL CHECK (amount_ugx > 0),
    fee_ugx BIGINT NOT NULL DEFAULT 0 CHECK (fee_ugx >= 0),
    net_amount_ugx BIGINT NOT NULL CHECK (net_amount_ugx > 0),
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'APPROVED', 'PROCESSING', 'UNCERTAIN_TIMEOUT', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED', 'MANUAL_DISBURSEMENT_REQUIRED')),
    idempotency_key VARCHAR(128) UNIQUE,
    hold_id VARCHAR(64),
    ledger_transaction_id VARCHAR(64),
    provider_name VARCHAR(64) DEFAULT 'DISABLED_PENDING_PROVIDER',
    provider_tx_ref VARCHAR(128) UNIQUE,
    approved_by VARCHAR(64),
    approved_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    audit_trail JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON payout_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status, environment);

CREATE TABLE IF NOT EXISTS payout_attempts (
    id VARCHAR(64) PRIMARY KEY,
    payout_request_id VARCHAR(64) NOT NULL REFERENCES payout_requests(id),
    attempt_number INT NOT NULL DEFAULT 1,
    provider_name VARCHAR(64) NOT NULL,
    provider_reference VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL,
    response_code VARCHAR(32),
    response_message TEXT,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 19i. COMMISSION RECORDS, OUTBOX, RECONCILIATION & FINANCIAL AUDIT LOGS
CREATE TABLE IF NOT EXISTS commission_records (
    id VARCHAR(64) PRIMARY KEY,
    booking_type VARCHAR(32) NOT NULL,
    booking_id VARCHAR(64) NOT NULL,
    milestone_id VARCHAR(64) NOT NULL DEFAULT 'FULL_COMPLETION',
    payment_id VARCHAR(64),
    beneficiary_id VARCHAR(64),
    beneficiary_role VARCHAR(32) NOT NULL,
    gross_amount_ugx BIGINT NOT NULL CHECK (gross_amount_ugx > 0),
    developer_commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    developer_commission_ugx BIGINT NOT NULL DEFAULT 0 CHECK (developer_commission_ugx >= 0),
    platform_commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    platform_commission_ugx BIGINT NOT NULL DEFAULT 0 CHECK (platform_commission_ugx >= 0),
    beneficiary_net_ugx BIGINT NOT NULL CHECK (beneficiary_net_ugx >= 0),
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    status VARCHAR(32) NOT NULL DEFAULT 'EARNED' CHECK (status IN ('PENDING_MILESTONE', 'EARNED', 'REVERSED', 'DISPUTED')),
    ledger_transaction_id VARCHAR(64),
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_commission_allocation_sum CHECK (developer_commission_ugx + platform_commission_ugx + beneficiary_net_ugx = gross_amount_ugx),
    UNIQUE(booking_type, booking_id, milestone_id, environment)
);

CREATE TABLE IF NOT EXISTS financial_outbox (
    id VARCHAR(64) PRIMARY KEY,
    job_type VARCHAR(64) NOT NULL,
    dedupe_key VARCHAR(128) UNIQUE,
    payload JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED_RETRY', 'DEAD_LETTER')),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    next_run_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fin_outbox_poll ON financial_outbox(status, next_run_at ASC);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id VARCHAR(64) PRIMARY KEY,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    triggered_by VARCHAR(64) NOT NULL DEFAULT 'SCHEDULED_WORKER',
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    total_payments_checked INT NOT NULL DEFAULT 0,
    total_ledger_tx_checked INT NOT NULL DEFAULT 0,
    total_wallets_checked INT NOT NULL DEFAULT 0,
    discrepancies_found INT NOT NULL DEFAULT 0,
    summary JSONB NOT NULL DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) REFERENCES reconciliation_runs(id),
    discrepancy_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    reference_type VARCHAR(64) NOT NULL,
    reference_id VARCHAR(64) NOT NULL,
    expected_amount_ugx BIGINT,
    actual_amount_ugx BIGINT,
    currency VARCHAR(8) DEFAULT 'UGX',
    description TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE')),
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    resolved_by VARCHAR(64),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_discrepancies_open ON reconciliation_discrepancies(status, severity, environment);

CREATE TABLE IF NOT EXISTS financial_audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    actor_id VARCHAR(64) NOT NULL,
    actor_role VARCHAR(32) NOT NULL,
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    amount_ugx BIGINT,
    currency VARCHAR(8) DEFAULT 'UGX',
    previous_state JSONB DEFAULT '{}',
    new_state JSONB DEFAULT '{}',
    reason TEXT,
    ip_address VARCHAR(64) DEFAULT '',
    signature_hash VARCHAR(128) NOT NULL,
    environment VARCHAR(16) NOT NULL DEFAULT 'sandbox',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_logs_created ON financial_audit_logs(created_at DESC);

-- ==========================================================
-- 20. DYNAMIC CONTENT MANAGEMENT, VEHICLE CATALOGUE & PRICING ENGINE
-- ==========================================================

-- 20a. ENHANCED DESTINATIONS & TOUR PACKAGES COLUMNS
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS country VARCHAR(64) DEFAULT 'Uganda';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS district VARCHAR(128) DEFAULT '';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS location_address TEXT DEFAULT '';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'national_park';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 6) DEFAULT 0.3136;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 6) DEFAULT 32.5811;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS short_description TEXT DEFAULT '';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS audio_clips JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS activities JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS inclusions JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS exclusions JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS recommended_duration VARCHAR(128) DEFAULT '3 Days / 2 Nights';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS travel_duration VARCHAR(128) DEFAULT '5 hours';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS distance_from_kampala VARCHAR(128) DEFAULT '300 km';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS rating NUMERIC(3, 2) DEFAULT 4.90;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT TRUE;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS base_price_ugx BIGINT DEFAULT 0;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS tourist_pricing_tiers JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS assigned_vehicle_ids JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS assigned_guide_ids JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS itinerary JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS additional_charges JSONB DEFAULT '[]';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS booking_available BOOLEAN DEFAULT TRUE;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS publication_status VARCHAR(32) DEFAULT 'PUBLISHED';
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS content_version INT DEFAULT 1;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS short_description TEXT DEFAULT '';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '[]';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS audio_clips JSONB DEFAULT '[]';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS exclusions JSONB DEFAULT '[]';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS itinerary JSONB DEFAULT '[]';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS tourist_pricing_tiers JSONB DEFAULT '[]';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS assigned_vehicle_ids JSONB DEFAULT '[]';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS assigned_guide_ids JSONB DEFAULT '[]';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS additional_charges JSONB DEFAULT '[]';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT TRUE;
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS booking_available BOOLEAN DEFAULT TRUE;
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS publication_status VARCHAR(32) DEFAULT 'PUBLISHED';
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS content_version INT DEFAULT 1;
ALTER TABLE tour_packages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- 20b. DESTINATION & PACKAGE MULTIMEDIA METADATA (CLOUDFLARE R2 + VALIDATED EXTERNAL LINKS)
CREATE TABLE IF NOT EXISTS destination_media (
    id VARCHAR(64) PRIMARY KEY,
    owner_type VARCHAR(32) NOT NULL DEFAULT 'DESTINATION', -- 'DESTINATION' | 'PACKAGE' | 'VEHICLE' | 'GUIDE'
    owner_id VARCHAR(64) NOT NULL,
    media_type VARCHAR(32) NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO', 'AUDIO')),
    source_type VARCHAR(32) NOT NULL DEFAULT 'CLOUDFLARE_R2' CHECK (source_type IN ('CLOUDFLARE_R2', 'EXTERNAL_URL')),
    url TEXT NOT NULL,
    r2_key TEXT,
    mime_type VARCHAR(128) DEFAULT 'image/jpeg',
    title VARCHAR(255) DEFAULT '',
    caption TEXT DEFAULT '',
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dest_media_owner ON destination_media(owner_type, owner_id, display_order ASC);

-- 20c. CENTRALIZED VEHICLE CATALOGUE & EXPLICIT SERVICE ASSIGNMENT
CREATE TABLE IF NOT EXISTS catalogue_vehicles (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL,
    make VARCHAR(64) DEFAULT '',
    model VARCHAR(64) DEFAULT '',
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    icon_name VARCHAR(64) DEFAULT 'directions_car',
    passenger_capacity INT NOT NULL DEFAULT 4,
    luggage_capacity INT NOT NULL DEFAULT 2,
    max_weight_kg NUMERIC(8, 2) DEFAULT 50.0,
    eta_minutes INT DEFAULT 5,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    assigned_services JSONB NOT NULL DEFAULT '[]', -- Explicit list of ['ride_hailing', 'airport_shuttle', 'tours', 'express_delivery']
    service_pricing JSONB NOT NULL DEFAULT '{}',
    pricing_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalogue_vehicles_active ON catalogue_vehicles(is_active, is_available, display_order ASC);

-- 20d. SERVICE PRICING RULES (RIDE HAILING, AIRPORT SHUTTLE, EXPRESS DELIVERY, TOUR GUIDES)
CREATE TABLE IF NOT EXISTS service_pricing_rules (
    service_key VARCHAR(64) PRIMARY KEY, -- 'ride_hailing', 'airport_shuttle', 'express_delivery', 'tour_guides', 'tours'
    config JSONB NOT NULL DEFAULT '{}',
    pricing_version INT NOT NULL DEFAULT 1,
    updated_by VARCHAR(64) DEFAULT 'ADMIN',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 20e. IMMUTABLE SERVER-SIDE PRICE QUOTATIONS
CREATE TABLE IF NOT EXISTS price_quotations (
    id VARCHAR(64) PRIMARY KEY,
    service_type VARCHAR(32) NOT NULL CHECK (service_type IN ('RIDE', 'AIRPORT_SHUTTLE', 'TOUR', 'DELIVERY')),
    reference_id VARCHAR(64),
    vehicle_id VARCHAR(64),
    guide_id VARCHAR(64),
    guest_count INT DEFAULT 1,
    distance_km NUMERIC(10, 2) DEFAULT 0,
    weight_kg NUMERIC(10, 2) DEFAULT 0,
    base_price_ugx BIGINT NOT NULL DEFAULT 0,
    distance_price_ugx BIGINT NOT NULL DEFAULT 0,
    vehicle_charge_ugx BIGINT NOT NULL DEFAULT 0,
    tourist_count_charge_ugx BIGINT NOT NULL DEFAULT 0,
    tour_guide_fee_ugx BIGINT NOT NULL DEFAULT 0,
    additional_charges_ugx BIGINT NOT NULL DEFAULT 0,
    discounts_ugx BIGINT NOT NULL DEFAULT 0,
    taxes_ugx BIGINT NOT NULL DEFAULT 0,
    total_price_ugx BIGINT NOT NULL CHECK (total_price_ugx > 0),
    currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
    pricing_version INT NOT NULL DEFAULT 1,
    breakdown JSONB NOT NULL DEFAULT '[]',
    request_params JSONB NOT NULL DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_quotations_service ON price_quotations(service_type, created_at DESC);

-- 20f. ADD QUOTATION SNAPSHOT COLUMNS TO TRIPS, DELIVERIES & TOUR BOOKINGS
ALTER TABLE trips ADD COLUMN IF NOT EXISTS quotation_id VARCHAR(64);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS pricing_version INT DEFAULT 1;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS quotation_snapshot JSONB DEFAULT '{}';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS service_category VARCHAR(32) DEFAULT 'RIDE';

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS quotation_id VARCHAR(64);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pricing_version INT DEFAULT 1;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS quotation_snapshot JSONB DEFAULT '{}';
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS vehicle_id VARCHAR(64);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS distance_km NUMERIC(10, 2) DEFAULT 5.0;

ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS quotation_id VARCHAR(64);
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS pricing_version INT DEFAULT 1;
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS quotation_snapshot JSONB DEFAULT '{}';
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS vehicle_id VARCHAR(64);

ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS multi_day_rate_ugx NUMERIC(12, 2) DEFAULT 140000.0;
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS fixed_tour_fee_ugx NUMERIC(12, 2) DEFAULT 0.0;
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS group_size_surcharge_ugx NUMERIC(12, 2) DEFAULT 0.0;
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS supported_destination_ids JSONB DEFAULT '[]';
ALTER TABLE tour_guides ADD COLUMN IF NOT EXISTS supported_activities JSONB DEFAULT '[]';




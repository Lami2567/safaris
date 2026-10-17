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
    reference VARCHAR(128) UNIQUE NOT NULL,
    dpo_trans_token VARCHAR(128),
    dpo_trans_ref VARCHAR(128),
    dpo_result_code VARCHAR(32),
    dpo_result_explanation TEXT,
    payment_url TEXT,
    failure_reason TEXT,
    environment VARCHAR(16) DEFAULT 'sandbox',
    status payment_status NOT NULL DEFAULT 'COMPLETED',
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS dpo_trans_token VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS dpo_trans_ref VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS dpo_result_code VARCHAR(32);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS dpo_result_explanation TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS environment VARCHAR(16) DEFAULT 'sandbox';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_payments_dpo_token ON payments(dpo_trans_token);
CREATE INDEX IF NOT EXISTS idx_payments_status_env ON payments(status, environment);

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


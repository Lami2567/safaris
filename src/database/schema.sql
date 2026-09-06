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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

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
    current_lat NUMERIC(10, 6) DEFAULT 0.3136,
    current_lng NUMERIC(10, 6) DEFAULT 32.5811,
    heading NUMERIC(5, 2) DEFAULT 0.0,
    license_number VARCHAR(64),
    license_expiry DATE,
    acceptance_rate NUMERIC(5, 2) DEFAULT 98.0,
    today_earnings_ugx NUMERIC(14, 2) DEFAULT 0.0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drivers_online ON drivers(is_online, is_available);

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
    expeditions_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
    package_id VARCHAR(64) REFERENCES tour_packages(id) ON DELETE CASCADE,
    guide_id VARCHAR(64) REFERENCES tour_guides(id) ON DELETE SET NULL,
    travelers_count INT NOT NULL DEFAULT 1,
    start_date DATE NOT NULL,
    pickup_location TEXT NOT NULL,
    total_ugx NUMERIC(14, 2) NOT NULL,
    status VARCHAR(32) DEFAULT 'CONFIRMED',
    payment_status payment_status DEFAULT 'COMPLETED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
    status payment_status NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
    type VARCHAR(32) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. APP CONFIGURATION TABLE
CREATE TABLE IF NOT EXISTS app_config (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

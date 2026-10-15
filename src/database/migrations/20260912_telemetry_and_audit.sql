-- ==========================================================
-- SAFARIS UGANDA — Telemetry, Offline Queue, Safari Legs & Audit Migration
-- Date: 2026-09-12
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
    status VARCHAR(32) DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_tour_legs_booking ON tour_legs(booking_id, day_number);

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

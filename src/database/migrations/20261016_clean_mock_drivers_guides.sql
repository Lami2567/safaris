-- ==========================================================
-- SAFARIS UGANDA — Remove Legacy Seeded Mock Accounts
-- Date: 2026-10-16
-- Ensures only genuine registered user accounts and approved
-- drivers/tour guides remain in the production database.
-- ==========================================================

DELETE FROM drivers WHERE id IN ('driver-001', 'usr_drv_001', 'usr_drv_002');
DELETE FROM vehicles WHERE id IN ('veh-001', 'veh_001', 'veh_002') OR driver_id IN ('driver-001', 'usr_drv_001', 'usr_drv_002');
DELETE FROM tour_guides WHERE id IN ('usr_gd_001');
DELETE FROM users WHERE id IN ('driver-001', 'usr_ug_001', 'usr_drv_001', 'usr_drv_002', 'usr_gd_001');

ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'SEARCHING_COURIER';
ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'PICKED_UP';
-- Do not alter historical entries. Fail migration for existing negative protected
-- balances so an operator can reconcile them rather than silently rewriting money.
BEGIN;
ALTER TABLE account_balance_projections DROP CONSTRAINT IF EXISTS chk_projection_non_negative_liability;
ALTER TABLE account_balance_projections ADD CONSTRAINT chk_projection_non_negative_liability CHECK (
  account_code NOT IN (
    '2010_CUSTOMER_WALLET_LIABILITY', '2020_BOOKING_ESCROW_LIABILITY',
    '2030_DRIVER_PAYABLE', '2040_GUIDE_PAYABLE', '2050_DEVELOPER_COMMISSION_PAYABLE',
    '2060_PAYOUT_RESERVE_LIABILITY'
  ) OR net_balance_ugx >= 0
);
-- Existing migration runners reapply all SQL files; this unique index also stops
-- duplicate quote use if a writer omits the application-side check.
CREATE UNIQUE INDEX IF NOT EXISTS trips_single_quotation ON trips(quotation_id) WHERE quotation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tours_single_quotation ON tour_bookings(quotation_id) WHERE quotation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_single_quotation ON deliveries(quotation_id) WHERE quotation_id IS NOT NULL;
COMMIT;

# Mumwe Safaris — Financial Engine, Live Payment Tracking, Wallets, Platform Earnings & Automatic Refunds

## 1. Architectural Overview & Design Philosophy

The Mumwe Safaris Financial Engine provides a permanent, auditable, and segregated financial infrastructure across all services (Ride-Hailing, Airport Shuttles, Tour Packages, Tour Guide Bookings, and Deliveries).

### Core Invariants & Rules

1. **Authoritative Ledger Authority**:
   - Customer wallet balances are never arbitrary numbers stored in user records. Balances are calculated by summing immutable transactions in the `wallet_transactions` ledger (`CREDIT` - `DEBIT`).
   - Mutations to wallet balances execute atomically with an in-memory per-user lock and insert immutable entries before updating cached values.

2. **Segregation of Customer Liabilities vs. Platform Revenue**:
   - **Customer Wallet Balances** represent custodial funds held for users (Liabilities of Mumwe Safaris), never platform income or revenue.
   - **Platform Earnings** represent the net commission earned (default 15% on trips/deliveries, 20% on tour packages) recorded in `platform_earnings`.
   - **Beneficiary Payables** represent driver and tour guide earnings (80–85% of gross fare).
   - **Sandbox Isolation**: Test transactions and simulated wallet balances are strictly isolated from production collected revenue and driver payouts.

3. **Configurable No-Show Automatic Refund Engine**:
   - The No-Show Refund Policy (`refund_policies`) is administrator-configurable:
     - Waiting period threshold: default 15 minutes.
     - Refund percentage: default 100%.
     - Auto-process toggle: enabled by default.
     - Conditions: checks if driver was assigned and whether the driver registered an arrival event (`driver_arrived_at`). If no arrival occurred and the waiting period elapsed, the booking qualifies for an automatic refund.
   - Background worker evaluates active trips every 60 seconds and processes refunds immediately to the customer's wallet.

---

## 2. Database Schema & Tables

All financial events persist in PostgreSQL with fallback to persistent local JSON tables.

| Table Name | Description | Key Columns |
|------------|-------------|-------------|
| `payments` | Authoritative DPO Pay & Wallet payments | `id`, `transaction_id`, `user_id`, `amount_ugx`, `payment_method`, `status`, `refund_status`, `refunded_amount_ugx`, `refund_id`, `audit_trail` |
| `wallet_transactions` | Immutable, append-only wallet ledger | `id`, `user_id`, `amount_ugx`, `balance_after_ugx`, `type`, `reference_type`, `reference_id`, `payment_id`, `refund_id`, `environment` |
| `refund_policies` | Admin-configurable refund rules | `id`, `policy_name`, `is_enabled`, `max_waiting_minutes`, `refund_percentage`, `require_driver_assigned`, `require_no_arrival`, `auto_process_enabled` |
| `refunds` | Refund execution records & audit trail | `id`, `refund_reference`, `payment_id`, `trip_id`, `user_id`, `amount_ugx`, `reason`, `refund_method`, `status`, `eligibility_evidence`, `policy_snapshot` |
| `platform_earnings` | Commission & driver payable ledger | `id`, `booking_type`, `booking_id`, `payer_user_id`, `beneficiary_id`, `gross_amount_ugx`, `platform_commission_ugx`, `beneficiary_earnings_ugx`, `status` |
| `financial_adjustments` | Auditable manual adjustments | `id`, `admin_id`, `target_type`, `target_id`, `amount_ugx`, `adjustment_type`, `reason`, `environment` |

---

## 3. API Endpoints

### Customer Wallet Endpoints
- `GET /api/v1/wallet/balance`: Returns authoritative balance calculated from ledger transactions for the active environment.
- `GET /api/v1/wallet/transactions`: Returns paginated list of immutable ledger transactions.
- `POST /api/v1/payments/process`: Supports `paymentMethod: 'WALLET'` for direct booking payments from Safaris Wallet.

### Admin Financial Engine Endpoints
- `GET /api/v1/admin/financials/overview`: Returns live financial KPIs:
  - Total Verified Payments Collected
  - Customer Wallet Liabilities (funds held for customers)
  - Platform Commission Earned
  - Beneficiary Driver/Guide Earnings Payable
  - Total Refunds Processed
  - Active Refund Requests Queue
  - Financial Reconciliation Balance: `Verified Payments - (Commissions + Driver Earnings + Wallet Liabilities - Refunds)`
- `GET /api/v1/admin/financials/ledger`: Returns platform earnings ledger with search & date filters.
- `GET /api/v1/admin/refund-policies`: Lists active and past refund policies.
- `PUT /api/v1/admin/refund-policies/:id`: Updates waiting time, refund %, and auto-process settings.
- `GET /api/v1/admin/refunds`: Lists all processed and pending refunds with evidence snapshots.
- `POST /api/v1/admin/refunds`: Initiates a manual administrative refund.
- `POST /api/v1/admin/refunds/run-worker`: Triggers immediate evaluation of the automatic no-show refund worker.
- `POST /api/v1/admin/financial-adjustments`: Records an auditable manual balance adjustment with justification.

---

## 4. Admin Dashboard 4-Tab Implementation

The Admin Portal (`/admin/payments`) includes 4 dedicated panels:

1. **Live Payment Tracking**:
   - Live stream of all transactions: Customer Name, UID, Booking Reference, Service Type, Amount Paid, Currency, Payment Method, DPO Provider Reference, Environment (Sandbox/Live), Initiation Time, Verified Completion Time, Payment Status, and Refund Status.
   - Real-time Server-Sent Events (SSE) stream listener automatically updates the table without requiring manual browser refreshes.
   - Recheck / Reconcile button for open transactions.
2. **Platform Financials & Liabilities**:
   - Comprehensive KPI cards prominently displaying Customer Wallet Liabilities as custodial debt, distinct from company profit.
   - Mathematical reconciliation formula showing 0 UGX discrepancy.
   - Platform Earnings & Commission Ledger table detailing every gross fare, commission rate (15-20%), company earnings, and driver payout.
3. **Customer Wallets & Ledger**:
   - User wallet inspector with instant lookup by User ID or phone.
   - Append-only ledger display showing every credit, debit, balance after, and description.
   - Administrative balance adjustment modal with mandatory audit justification.
4. **No-Show Refund Policies & Cases**:
   - Policy configuration editor for adjusting waiting period (default 15 min), refund %, and automatic processing toggle.
   - "Run Auto-Refund Worker Now" button.
   - Detailed queue of refund cases with eligibility evidence and policy snapshot.

# MUMWE SAFARIS — DPO PAY INTEGRATION & TESTING GUIDE

**Provider:** DPO Pay (Direct Pay Online API v6 XML Protocol)  
**Support Ticket Reference:** `2777504`  
**Current Default Environment:** `sandbox`  
**Production Status:** Disabled (Fail-Closed until 8-point checklist is satisfied)  

---

## 1. Overview & Architecture

Mumwe Safaris integrates directly with DPO Pay's official **API v6 XML** interface for secure, PCI-DSS compliant customer payments across Safari Tours, Airport Shuttles, City Rides, Express Deliveries, and Wallet Top-Ups.

### Security Invariants
1. **Server-Side Credentials**: Company tokens are loaded strictly from environment variables on the backend server.
2. **Zero Client Leakage**: Company tokens, DPO secrets, and raw card details (PAN, CVV, PIN, OTP) are **never** exposed to client applications, Flutter apps, browser bundles, public configuration files, or logs.
3. **Fail-Closed Live Mode**: Live production payments cannot be initiated without valid live credentials, confirmed production service type ID, HTTPS endpoints, and explicit operator authorization (`DPO_LIVE_ACTIVATION_CONFIRMED=true`).
4. **Environment Isolation**: Sandbox transactions are strictly isolated from real company revenue, live driver trip earnings, and live tour guide balances.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CUSTOMER / MOBILE APP                            │
│           (Initiates checkout sheet: Card, MTN MoMo, Airtel Money)          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ POST /api/v1/payments/process
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SAFARIS BACKEND API                              │
│ 1. Resolves trusted price from DB (ignores tampered client amounts)         │
│ 2. Acquires in-process lock per reference (prevents double-charging)       │
│ 3. Normalizes MSISDN & escapes XML parameters                              │
│ 4. Calls DPO API v6 createToken                                            │
└──────────────────┬──────────────────────────────────────┬───────────────────┘
                   │                                      │
                   ▼ (CARD / HOSTED)                      ▼ (MOBILE MONEY)
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│     DPO Hosted Payment Page          │  │     DPO ChargeTokenMobile         │
│  payv3.php?ID={TransToken}           │  │ Direct STK Push (MTN/Airtel UG)   │
└──────────────────┬───────────────────┘  └──────────────────┬────────────────┘
                   │                                         │
                   ▼                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DPO NOTIFICATION & SERVER VERIFICATION                   │
│ 1. DPO PushPayments XML Callback (acknowledges with <Response>OK</Response>)│
│ 2. Authoritative verifyToken API call against secure.3gdirectpay.com        │
│ 3. Verifies Amount, Currency (UGX), and Approval Code before booking paid  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Configuration & Environment Variables

All settings are configured on the backend server (`backend/.env.development` or secret manager in production).

### Sandbox Defaults (Active)
```bash
# Gateway Mode
DPO_ENVIRONMENT=sandbox
DPO_SUPPORT_TICKET_REF=2777504

# Sandbox Credentials (Supplied by DPO Support)
DPO_SANDBOX_COMPANY_TOKEN=B3F59BE7-0756-420E-BB88-1D98E7A6B040
DPO_SANDBOX_SERVICE_TYPE_ID=54841

# Endpoints
DPO_API_BASE_URL=https://secure.3gdirectpay.com/API/v6/
DPO_PAY_URL=https://secure.3gdirectpay.com/payv3.php
DPO_CALLBACK_URL=https://admin.mumwesafarisuganda.com/api/v1/payments/dpo/callback
DPO_CANCEL_URL=https://admin.mumwesafarisuganda.com/api/v1/payments/dpo/cancel

# Workstation AV TLS scan bypass (sandbox testing only; forbidden in live mode)
DPO_REJECT_UNAUTHORIZED=false
```

### Production Variables (Pending DPO Onboarding)
```bash
# Keep empty until DPO provides live credentials
DPO_LIVE_COMPANY_TOKEN=
DPO_LIVE_SERVICE_TYPE_ID=
DPO_LIVE_ACTIVATION_CONFIRMED=false
```

> [!IMPORTANT]
> **Production Service Type ID**: Sandbox ID `54841` must **never** be assumed for live payments. DPO Pay assigns distinct service type IDs per merchant account and live service category.

---

## 3. DPO Sandbox Testing Credentials

### Official DPO Sandbox Test Cards
Use any future expiry date (e.g., `12/28`) and CVV `123`.

| Card Scheme | Test Card Number | CVV | Expiry | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **Mastercard** | `5436 8862 6984 8367` | `123` | MM/YY (Future) | **000 (Approved)** |
| **Visa** | `4012 8888 8888 1881` | `123` | MM/YY (Future) | **000 (Approved)** |
| **American Express** | `3456 7890 1234 564` | `123` | MM/YY (Future) | **000 (Approved)** |

### Uganda Mobile Money Sandbox Testing
DPO's sandbox handles Mobile Money simulations via `ChargeTokenMobile`:

- **MTN MoMo Uganda**: Select `MTN MoMo` and provide an active Uganda phone (e.g. `0772XXXXXX` or `078XXXXXXX`).
- **Airtel Money Uganda**: Select `Airtel Money` and provide an active Airtel phone (e.g. `0701XXXXXX` or `075XXXXXXX`).
- **Simulation**: In sandbox mode, `ChargeTokenMobile` initiates the push request. The system immediately registers the transaction token and polls/verifies with DPO. If direct STK push simulation is unavailable in sandbox for a test number, the system automatically surfaces the hosted checkout URL as a fallback.

---

## 4. Payment Lifecycle & Status Codes

Every payment attempt maintains an explicit state model:

| Status | Meaning | Can Booking Be Confirmed? |
| :--- | :--- | :--- |
| `INITIATED` | Transaction token created with DPO; awaiting customer action | **No** |
| `PENDING` | Customer redirected to DPO checkout or STK push prompt sent (DPO Code `900`) | **No** |
| `PROCESSING` | DPO verification or callback in flight | **No** |
| `SUCCESSFUL` | Authoritative DPO `verifyToken` confirmed Result `000`, matching amount & currency | **YES** |
| `FAILED` | Declined by issuing bank or DPO fraud check | **No** |
| `CANCELLED` | Abandoned or cancelled by customer | **No** |
| `EXPIRED` | Payment time limit exceeded (PTL hours elapsed) | **No** |

### DPO Result Code Mapping
- `000`: **Approved / Paid** -> Status becomes `SUCCESSFUL`. Booking or wallet is fulfilled.
- `900`: **Transaction not yet paid** -> Kept in `PENDING`. Recheck on next interval.
- `901`: **Transaction declined** -> Status becomes `FAILED`.
- `903`: **Payment timed out** -> Status becomes `EXPIRED`.
- `904`: **Transaction cancelled** -> Status becomes `CANCELLED`.
- `002`: **Suspected Fraud / Amount Mismatch** -> Flagged for manual admin inspection; booking is **not** fulfilled.

---

## 5. Automated Background Reconciliation

The server includes an automated background reconciliation engine (`PaymentService.startReconciler()`):
1. **Periodic Scan**: Runs every 2 minutes.
2. **Target**: Scans transactions stuck in `PENDING`, `INITIATED`, or `PROCESSING` created in the last 6 hours.
3. **Action**: Queries DPO's authoritative `verifyToken` API for each transaction.
4. **Resolution**: Automatically promotes approved payments to `SUCCESSFUL` and marks abandoned attempts as `CANCELLED` or `EXPIRED`.

---

## 6. Admin Command Center (`/payments`)

Authorized administrators can manage and inspect payments in real time at:
`https://admin.mumwesafarisuganda.com/payments` (or `http://localhost:3000/payments`)

### Features
1. **DPO Environment Indicator**: Header and sidebar show `SANDBOX ACTIVE` badge, Service ID `54841`, and Support Ticket `#2777504`.
2. **KPI Metrics Grid**:
   - Total Attempts
   - Verified Paid (Code 000)
   - Pending / Open
   - Failed / Cancelled
   - **Sandbox Tested Volume (UGX)** (isolated test volume)
   - **Real Live Revenue (UGX)** (strictly separated from sandbox)
3. **Transaction Inspection Modal**:
   - DPO Transaction Token & Approval Number
   - Masked phone/card details
   - Real-time audit trail events (Initiated -> Token Created -> Callback -> Verified)
   - One-click **"Recheck with DPO Now"** button for immediate authoritative lookup.
4. **Bulk Reconciliation**: "Reconcile Pending" button checks all pending payments with DPO.

---

## 7. 8-Point Production Activation Checklist

Before activating live payments, **ALL** eight checklist criteria must be verified:

- [ ] **1. DPO supplies live company token**: Received from DPO onboarding team and loaded into secret manager.
- [ ] **2. DPO confirms production service type ID**: Production service ID confirmed (sandbox ID `54841` must not be assumed).
- [ ] **3. Live API endpoints & merchant settings verified**: HTTPS endpoints and webhook URLs verified against DPO live documentation.
- [ ] **4. Production credentials secured on server**: Kept strictly in server environment variables or secret manager.
- [ ] **5. Operator explicitly authorizes activation**: Setting `DPO_LIVE_ACTIVATION_CONFIRMED=true` in server environment.
- [ ] **6. Backend validates complete configuration**: Automated `ENV.validateDpoConfig()` check passes with zero errors.
- [ ] **7. Controlled production verification performed**: Controlled low-value live test performed using DPO approved procedure.
- [x] **8. Environment recorded per transaction**: Database schema and revenue ledger enforce `sandbox` vs `live` separation.

---

## 8. Items Pending from DPO Support (Ticket #2777504)

To complete production activation, the following items must be provided by DPO Pay support:

1. **Production Company Token** (`DPO_LIVE_COMPANY_TOKEN`).
2. **Production Service Type ID** (`DPO_LIVE_SERVICE_TYPE_ID`) confirmed for Mumwe Safaris's Uganda merchant account.
3. **Production Merchant Portal URL** and merchant dashboard credentials.
4. Confirmation of enabled payment methods on the live merchant profile (Visa, Mastercard, American Express, MTN MoMo Uganda, Airtel Money Uganda).
5. Confirmation of webhook / push payments IP whitelist if applicable for production callbacks.

---

## 9. Running Verification Tests

Run the full automated test suites on the backend server:

```bash
# Run DPO-specific integration tests (12 tests)
npx ts-node src/__tests__/dpo_payment.test.ts

# Run complete system production readiness verification suite (17 tests)
npm test
```

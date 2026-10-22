# MUMWE SAFARIS — PRODUCTION READINESS & TESTING GUIDE
**DPO Pay Integration, Dynamic Admin Pricing, Driver Approval Workflow, Live Fleet Tracking, Admin Security & Data Persistence**

---

## 1. Executive Summary & Architectural Overview

The Mumwe Safaris Uganda platform has been upgraded to a production-ready enterprise state for Uganda mobility, safari tourism, express package delivery, and tour-guide operations. The platform strictly enforces:

- **Official DPO Pay (Direct Pay Online) API v6 Integration**: Support for Card and Mobile Money (MTN MoMo, Airtel Money) payments via server-side XML transactions, authoritative price calculation, and server-side token verification (`verifyToken`).
- **Sandbox-to-Production Environment Segregation**: Zero-downtime credential switching with strict environment validation, isolated endpoints, and zero client-side secret exposure.
- **Authoritative Admin Pricing**: Dynamic rates for ride-hailing (Boda-Boda, Standard, Comfort, XL Safari Van), airport shuttles, delivery services, tour packages, and tour guides. All client-side amounts are strictly overridden by authoritative database prices.
- **Careers Recruitment & Approval Pipeline**: Seamless onboarding originating from `careers.mumwesafarisuganda.com`. New applicants enter a `PENDING_APPROVAL` state and are strictly blocked from going online, accepting bookings, or transmitting telemetry until vetted and approved by an administrator.
- **Live Fleet Map & Radar**: Real-time driver positioning adhering to strict visual standards:
  - **Green (`#10B981`)**: Approved, online, available driver with active telemetry (< 15 mins).
  - **Blue (`#3B82F6`)**: Driver in field (engaged in an active trip).
  - **Gray (`#6B7280`)**: Offline or stale driver (> 15 mins without ping).
  - **Zero Mock Policy**: Mock movement engines and synthetic coordinate generators have been completely removed.
- **Admin Access Security**: Role-based access control (`requireRole('admin')`) protecting all administrative routes, plus a persistent, audited Admin Password Change feature using BCrypt hashing.
- **Fault-Tolerant Persistence**: Dual-layer architecture combining relational PostgreSQL tables with automatic disk-backed JSON mirroring to guarantee zero data loss across container recycles.

---

## 2. Configuration & Environment Variables

All operational and financial variables are controlled via the environment (`.env` or container orchestrator):

| Variable | Required In | Description | Example / Default |
|---|---|---|---|
| `DPO_ENVIRONMENT` | All | Payment gateway operating mode (`sandbox` or `production`). | `sandbox` |
| `DPO_COMPANY_TOKEN` | Production/Sandbox | Official Merchant Token supplied by DPO Pay. | `8D3DA73D-9D7F-4E09-96D4-3D44E7A8310E` |
| `DPO_SERVICE_TYPE` | Production/Sandbox | Service code registered on the DPO merchant profile. | `3854` |
| `DPO_API_BASE_URL` | Optional | Override DPO API base endpoint (defaults to official endpoints). | Sandbox: `https://secure1.sandbox.directpay.online/API/v6/`<br/>Production: `https://secure.3gdirectpay.com/API/v6/` |
| `DPO_PAYMENT_URL` | Optional | Override customer redirection checkout endpoint. | Sandbox: `https://secure1.sandbox.directpay.online/payv2.php`<br/>Production: `https://secure.3gdirectpay.com/payv2.php` |
| `APP_URL` | All | Public base URL for customer payment redirects and webhooks. | `https://mumwesafarisuganda.com` |
| `CAREERS_API_SECRET` | All | Shared HMAC secret for cross-domain career form submissions. | Configured secret |
| `ADMIN_INTERNAL_KEY` | All | High-entropy internal secret for trusted background services. | Configured secret |
| `JWT_SECRET` | All | Cryptographic key used to sign and verify user JWT tokens. | Configured secret |
| `DATABASE_URL` | Production | PostgreSQL connection string. | `postgres://user:pass@host:5432/safaris` |

---

## 3. DPO Pay Integration & Verification

### 3.1 Payment Lifecycle & Architecture

```
[ Customer Booking ]
         │
         ▼
[ Backend Authoritative Calculation ] ──> Fetches admin pricing from DB / store
         │
         ▼
[ DPO Gateway: createToken ] ──────────> POST /API/v6/ (createToken XML)
         │
         ▼
[ DPO Returns TransToken ] ────────────> Generates redirection URL: /payv2.php?ID={TransToken}
         │
         ▼
[ Customer Completes Payment (Card / MoMo) ]
         │
         ▼
[ DPO Redirect / Webhook ] ─────────────> POST /api/v1/payments/verify
         │
         ▼
[ Backend: verifyToken ] ──────────────> POST /API/v6/ (verifyToken XML)
         │
         ▼
[ Verified Result Code 000 ] ───────────> Marks Payment PAID & updates Booking/Trip/Delivery
```

### 3.2 Authoritative Price Resolution
Under no circumstances does the backend accept payment amounts submitted directly by client web browsers or mobile apps:
- **Tour Booking (`TOUR`)**: Multiplies `tour.price_ugx` by `adults_count` (with child discount) + selected addon guide rates.
- **Trip Ride-Hailing (`TRIP`)**: Calculates `base_fare + (distance_km * rate_per_km) + (duration_min * rate_per_min)`.
- **Package Delivery (`DELIVERY`)**: Calculates `base_fare + (distance_km * rate_per_km)`.
- **Wallet Top-Up (`WALLET`)**: Validates against allowed minimums and maximums before issuing token.

### 3.3 Server-Side Token Verification (`verifyToken`)
Frontend redirects are treated solely as UI transitions. Payment confirmation strictly requires:
1. Contacting the DPO endpoint with the transaction's `companyToken` and `transToken`.
2. Verifying that the XML response `<Result>` code is exactly `000` (Transaction Authorized).
3. Verifying that `<TransactionAmount>` matches the original invoice amount in the database.
4. Setting payment status to `PAID` and recording the `dpo_transaction_ref`.

### 3.4 Safe Switchover Checklist to Production
When switching from sandbox testing to live DPO merchant transactions:
1. **Obtain Official Production Credentials**:
   - Receive the live `DPO_COMPANY_TOKEN` from the DPO onboarding team.
   - Confirm the approved `DPO_SERVICE_TYPE` matches the primary business category (Tours & Transportation).
2. **Update Environment Configuration**:
   ```bash
   DPO_ENVIRONMENT=production
   DPO_COMPANY_TOKEN=<LIVE_COMPANY_TOKEN>
   DPO_SERVICE_TYPE=<LIVE_SERVICE_TYPE>
   ```
3. **Verify Endpoint Redirection**:
   - Confirm backend logs verify connection to `https://secure.3gdirectpay.com/API/v6/`.
   - Ensure customer redirects open `https://secure.3gdirectpay.com/payv2.php?ID=...`.
4. **Run Verification Check**:
   - Trigger a low-value live transaction (e.g., UGX 5,000 wallet top-up).
   - Complete via live MTN/Airtel Money or corporate Visa card.
   - Confirm the transaction appears in the DPO merchant portal and reaches `PAID` state in the Mumwe Safaris Admin Ledger.

---

## 4. Admin-Controlled Dynamic Pricing

All prices are managed exclusively through the administrative interface and stored permanently in the database with audit trails.

### Configurable Pricing Components:
1. **Vehicle Categories & Ride-Hailing**:
   - **Boda-Boda (Motorcycle)**: Base fare, per-km rate, per-minute rate, minimum fare.
   - **Standard (Sedan)**: Base fare, per-km rate, per-minute rate, minimum fare.
   - **Comfort (SUV / Executive)**: Base fare, per-km rate, per-minute rate, minimum fare.
   - **XL Safari Van (Tour Van / 4x4)**: Base fare, per-km rate, per-minute rate, minimum fare.
2. **Airport Shuttle & Fixed Routes**:
   - Entebbe International Airport (EBB) to Kampala Central / Victoria Basin.
   - Vehicle-class specific route rates.
3. **Package & Cargo Express Delivery**:
   - Motorcycle dispatch rates, parcel weight surcharge, express handling fees.
4. **Safari Tours & Expeditions**:
   - Package price per adult/child, seasonal adjustments, accommodation inclusions.
5. **Certified Tour Guides**:
   - Daily rate per guide, language specialization surcharges.

### Audit Logging
Any update made in the Admin Settings triggers an entry in `pricing_audit_logs`, tracking:
- Target service/category.
- Old price vs. New price.
- Administrator ID (`changed_by`).
- IP Address and Timestamp.

---

## 5. Driver & Tour-Guide Recruitment & Approval Workflow

```
[ careers.mumwesafarisuganda.com ]
                │
                ▼ POST /api/v1/careers/apply
[ Application Ingested into Database & Disk Mirror ]
   - User account created (role: 'driver' or 'tour_guide')
   - Driver/Guide profile created (approval_status: 'PENDING_APPROVAL', is_approved: false)
                │
                ▼ Admin Operations Panel (/operations)
[ Administrator Reviews Documents & Vetting Info ]
        ├── Action: Approve ──> Sets is_approved = true, approval_status = 'APPROVED'
        │                       Unlocks driver availability & dispatch eligibility
        ├── Action: Reject  ──> Requires formal rejection reason, notifies applicant
        └── Action: Suspend ──> Instantly revokes online status and field operations
```

### Operational Gating
The following backend actions strictly verify `is_approved && approval_status === 'APPROVED'`:
1. `DriverService.setAvailability`: Returns `403 Forbidden` if not approved.
2. `DriverService.updateLocation`: Refuses location telemetry if not approved.
3. `TripService.createTrip`: Does not broadcast dispatch requests to unapproved drivers.
4. `TripService.acceptTrip`: Prevents unapproved drivers from claiming customer bookings.
5. `TourGuideService.toggleAvailability`: Disallows guide bookings if pending or suspended.

---

## 6. Real-Time Fleet Map & Driver Tracking

The Live Fleet Map on `/operations` displays real-world fleet telemetry using clear color-coded indicators:

| Status | Marker Color | Hex Code | Condition |
|---|---|---|---|
| **Available** | Emerald Green | `#10B981` | Driver is approved, online, available, and transmitted a GPS ping within the last 15 minutes. |
| **In Field (Busy)** | Royal Blue | `#3B82F6` | Driver is approved, currently assigned to an active trip (`DISPATCHED`, `ARRIVED`, or `IN_PROGRESS`). |
| **Offline / Stale** | Neutral Gray | `#6B7280` | Driver is toggled offline or has not reported telemetry within 15 minutes. |

### Visual Map Features
- **On-Map Persistent Legend**: Positioned in the upper right corner of the Mapbox radar, showing the three color classifications for operations personnel.
- **Driver Card Tooltip**: Clicking any driver marker reveals their verified name, phone number, vehicle class, license plate, battery status, and exact timestamp of the last telemetry update.
- **Zero Synthetic Movements**: Mock coordinates and automated simulated loops have been removed. Drivers only appear at coordinates transmitted by the mobile driver app.

---

## 7. Admin Security & Role-Based Access Control

### 7.1 Route Protection
All `/api/v1/admin/*` routes are protected by:
```typescript
authenticate, requireRole('admin')
```
Requests without a valid admin JWT Bearer token or authorized internal service key receive `401 Unauthorized` or `403 Forbidden`.

### 7.2 Functional Password Change
Administrators can update their credentials in **Settings > Administrator Credentials & Access Security**:
- Validates current password using BCrypt.
- Enforces strong password rules (minimum 8 characters, special character/number requirement).
- Saves new hash permanently to PostgreSQL and disk persistence.
- Generates a security audit log entry (`admin_security_audits`).

---

## 8. Step-by-Step Testing Procedures

### 8.1 Automated Test Suite
Run the 15-point automated verification suite:
```bash
cd backend
npm test
```
**Expected Output:**
```
✅ 1. Database Seed completed successfully.
✅ 2. App Config Service verified (AppName: SAFARIS, Currency: UGX).
✅ 3. Auth Service verified (User logged in: David Kato, Role: customer).
✅ 4. Trip Fare Estimation verified (Boda: UGX 18000, Comfort: UGX 50000).
✅ 5. Trip Lifecycle verified (Created Trip ID: trp_..., Status: SEARCHING).
✅ 6. Tourism Service verified (6 Uganda destinations loaded).
✅ 7. Tour Booking verified (Booking ID: tb_..., Total: UGX 5,600,000).
✅ 8. Tour Guides verified (2 certified guides available).
✅ 9. Express Delivery verified (Tracking: SAF-..., Fare: UGX 10,700).
✅ 10. DPO Pay Gateway Security verified (Safely rejected unconfigured credentials).
✅ 11. Real-Time Telemetry Batch Upload verified (2 points ingested & deduplicated).
✅ 12. Admin Security Audit Trail verified (Audit ID: audit_...).
✅ 13. Notification Engine & Real-Time Dispatch verified (Wired to DB).
✅ 14. Career Recruitment & Approval Workflow verified (Approved and activated).
✅ 15. Admin Password Change & Audit Logging verified (Password updated).

🎉 ALL 15 PRODUCTION READINESS INTEGRATION TESTS PASSED CLEANLY!
```

---

### 8.2 Manual Career Application & Approval Flow
1. **Submit Driver Application**:
   ```bash
   curl -X POST http://localhost:5000/api/v1/careers/apply \
     -H "Content-Type: application/json" \
     -d '{
       "fullName": "Joshua Kintu",
       "phone": "+256 701 998877",
       "email": "joshua.kintu@safaris.ug",
       "role": "driver",
       "nin": "CM90012345678A",
       "drivingLicenseNumber": "DL-UG-2026-9901",
       "vehicleClass": "comfort",
       "plateNumber": "UBM 441Z",
       "experienceYears": 5
     }'
   ```
   *Expected Response:* `201 Created` with `status: "PENDING_APPROVAL"`.

2. **Verify Driver is Gated from Going Online**:
   ```bash
   curl -X POST http://localhost:5000/api/v1/drivers/<driver_id>/availability \
     -H "Content-Type: application/json" \
     -d '{"isAvailable": true}'
   ```
   *Expected Response:* `403 Forbidden` (`Driver account is pending administrator review and approval.`).

3. **Admin Approves Application**:
   Navigate to `/operations` in the Admin Dashboard, switch to **Driver & Guide Approvals**, locate Joshua Kintu, and click **Approve Application**.

4. **Verify Driver Can Now Go Online**:
   Repeat Step 2. Availability updates successfully to `true`.

---

### 8.3 Manual DPO Pay Checkout & Verification
1. **Initiate Payment**:
   ```bash
   curl -X POST http://localhost:5000/api/v1/payments/initiate \
     -H "Content-Type: application/json" \
     -d '{
       "bookingType": "TRIP",
       "bookingId": "trp_test_001",
       "customerId": "usr_ug_001",
       "paymentMethod": "DPO_PAY",
       "customerEmail": "david.kato@safaris.ug",
       "customerPhone": "+256 772 123456"
     }'
   ```
   *Expected Response:* `200 OK` containing `paymentId`, `dpoTransToken`, and `paymentUrl`.

2. **Verify Payment Server-Side**:
   ```bash
   curl -X POST http://localhost:5000/api/v1/payments/verify \
     -H "Content-Type: application/json" \
     -d '{
       "transToken": "<dpoTransToken>",
       "transactionId": "<paymentId>"
     }'
   ```
   *Expected Response:* `200 OK` with updated status `PAID`.

---

### 8.4 Disaster Recovery & Persistence Test
1. Make a price change or approve an applicant.
2. Stop the backend process: `Ctrl + C` or `docker compose restart backend`.
3. Start the backend again:
   Confirm terminal logs report:
   ```
   💾 [Database] Loaded X persistent users from disk storage.
   💾 [Database] Loaded X persistent drivers from disk storage.
   💾 [Database] Loaded X persistent career_applications from disk storage.
   ```
4. Query the API: All previous approvals, pricing changes, and payments remain completely intact.

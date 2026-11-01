# SAFARIS Uganda - Deployment & Environment Guide

This guide explains how to run SAFARIS in both **Local / Offline Development** and **VPS / Production Deployment** environments.

---

## 1. Architecture Overview

```
+-----------------------------------------------------------------------+
|                       SAFARIS Mobile Apps (Flutter)                   |
|                   Customer  |  Driver  |  Tour Guide                  |
+-----------------------------------------------------------------------+
                                    |
                    HTTP REST / WebSockets (Port 3000)
                                    v
+-----------------------------------------------------------------------+
|                    SAFARIS Backend API Gateway (/api/v1)              |
|          Rate Limiter | JWT Auth Middleware | Request Logger          |
+-----------------------------------------------------------------------+
        |                  |                    |                  |
   [Trips / Rides]    [Tourism / Parks]   [Tour Guides]    [Deliveries]
        |                  |                    |                  |
   [Payments MoMo]    [Notifications]     [In-App Chat]    [App Config]
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v (VPS / Production)                            v (Local Offline)
+------------------------+                     +------------------------+
| PostgreSQL 16 DB       |                     | Resilient In-Memory    |
| Redis 7 Real-time Hub  |                     | Data Store (Zero Host  |
| Nginx Reverse Proxy    |                     | Dependencies Needed)   |
| Daily Backups (.sh)    |                     +------------------------+
+------------------------+
```

---

## 2. Environment 1: Local / Offline Development

Run everything on your local machine without needing Docker or a remote VPS.

### Step 1: Start the Backend Server
```bash
cd backend
npm start
```
- Server binds to `http://0.0.0.0:3000`.
- Local Uganda test data is automatically seeded (David Kato, Moses Okello, Geoffrey Boda, Patrick Mukasa, Bwindi, Murchison, Jinja, Queen Elizabeth).
- If PostgreSQL is not running locally, the backend seamlessly switches to its built-in in-memory store so you can develop completely offline.

### Step 2: Run Verification Test Suite
```bash
cd backend
npm test
```
Executes all 10 automated unit & integration tests covering auth, trips, matching, tourism, guides, deliveries, and Mobile Money payments.

### Step 3: Run the Flutter App
- **Android Emulator**:
  ```bash
  flutter run
  ```
  *(Connects automatically to `http://10.0.2.2:3000/api/v1`)*

- **Physical Phone over Local Wi-Fi (e.g. Samsung SM-A055F)**:
  Find your PC's Wi-Fi IP address (e.g. `192.168.1.105` via `ipconfig`) and launch:
  ```bash
  flutter run --dart-define=API_URL=http://192.168.1.105:3000/api/v1 --dart-define=SOCKET_URL=http://192.168.1.105:3000
  ```

---

## 3. Environment 2: VPS / Production Deployment

### VPS Prerequisites
- Ubuntu 22.04 LTS or 24.04 LTS
- Docker & Docker Compose installed
- Domain pointed to your VPS IP (e.g. `api.safaris.ug`)

### Step 1: Deploy with Docker Compose
```bash
cd /home/ubuntu/safaris/backend

# 1. Configure 2GB swap space (essential for 512MB RAM VPS)
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 2. Setup production environment secrets
cp .env.production.example .env.production
nano .env.production

# 3. Run the automated deployment script
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

The production stack brings up:
1. **`safaris-backend`**: Multi-stage Node 22 Alpine container (`--max-old-space-size=128`).
2. **`safaris-postgres`**: PostgreSQL 16 database with memory tuning (`shared_buffers=32MB`).
3. **`safaris-redis`**: Redis 7 lightweight cache (`maxmemory 32mb`).
4. **`safaris-nginx`**: Nginx reverse proxy routing `/api/`, `/socket.io/`, `/health`.

### Step 2: Immediate IP Verification (Before Domain is Connected)
```bash
curl http://18.222.41.199/health
curl http://18.222.41.199/health/ready
curl http://18.222.41.199/api/v1/tourism/destinations
```

### Step 3: Configure SSL via Let's Encrypt Certbot (Once Domain is Pointed)
```bash
sudo apt update && sudo apt install -y certbot
sudo certbot certonly --webroot -w /var/lib/docker/volumes/backend_certbot_www/_data -d api.safaris.ug
sed 's/YOUR_DOMAIN/api.safaris.ug/g' nginx/conf.d/ssl.conf.template > nginx/conf.d/default.conf
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Step 4: Automated Database Backups
A production backup script is provided in `backend/scripts/backup_db.sh`.
Schedule daily automated backups via cron:
```bash
crontab -e
# Add line for daily backup at 2:00 AM UTC:
0 2 * * * /home/ubuntu/safaris/backend/scripts/backup_db.sh >> /var/log/safaris_backup.log 2>&1
```

To restore a backup:
```bash
./scripts/restore_db.sh backups/safaris_backup_YYYYMMDD_HHMMSS.sql.gz
```

### Step 5: Run Flutter App with Environment Base URLs
- **Local Dev:**
  ```bash
  flutter run
  ```
- **VPS Testing (Current IP):**
  ```bash
  flutter run --dart-define=API_URL=http://18.222.41.199/api/v1 --dart-define=SOCKET_URL=http://18.222.41.199
  ```
- **Production (HTTPS Domain):**
  ```bash
  flutter build apk --release --dart-define=ENV=production --dart-define=API_URL=https://api.safaris.ug/api/v1 --dart-define=SOCKET_URL=https://api.safaris.ug
  ```


---

## 4. Real-Time Communication & Standardized Map Architecture

### Dual Real-Time Transport (Socket.IO + Server-Sent Events)
- **WebSockets (`Socket.IO`)**: Used by the Flutter Customer, Driver, and Tour Guide mobile apps (`RealtimeSocketService`) for sub-second bidirectional telemetry and trip lifecycle events.
- **Server-Sent Events (`SSE`)**:
  - `GET /api/v1/admin/live-fleet/stream`: Authenticated Admin live fleet stream. Pushes incremental `fleet:telemetry_update`, `fleet:status_update`, and `fleet:driver_removed` events so the Admin Operations map updates individual driver markers without browser refresh.
  - `GET /api/v1/realtime/stream`: Authenticated Partner/Customer stream used by the Web Partner Portal (`careers.mumwesafarisuganda.com`) for instant ride request offers (`trip:new_request`, `trip:request_closed`), active trip updates (`trip:driver_assigned`, `trip:status_changed`), and tour guide assignment events (`tour:booking_assigned`, `tour:booking_updated`).

### Standardized Map Marker Color Rules
Across the Admin Operations Map (`MapboxFleetMap.tsx`), Web Partner Portal, and Flutter Map (`SafarisMapView`):
- **Green (`#10B981`) — Available:** Approved driver (`is_approved = true`, `approval_status = 'APPROVED'`) who is online, available for a new assignment (`is_available = true`), and has a fresh GPS location (`last_ping < 15 minutes`).
- **Blue (`#2563EB`) — Assigned / In Trip:** Approved driver currently assigned to or performing an active operational trip (`DRIVER_ASSIGNED`, `DRIVER_ARRIVING`, `DRIVER_ARRIVED`, `TRIP_STARTED`).
- **Gray (`#64748B`) — Offline / Stale:** Approved driver who is offline, unavailable, or whose last GPS update is older than 15 minutes (`STALE >15M`).
- **Unapproved / Rejected / Suspended:** Never rendered as active operational drivers on the live map and blocked from transmitting telemetry or going online (`403 Forbidden`).

---

## 5. End-to-End Real-Time Verification Suite (Tests A–E)

Run the automated end-to-end verification suite to validate all real-time flows:
```bash
cd backend
npx ts-node scripts/verify_e2e_realtime.ts
```
This script verifies:
- **Test A (Live Admin Location):** Approved driver logs in via OTP -> sets password -> goes online -> streams real GPS coordinates -> Admin SSE stream receives Green marker update without page reload; out-of-bounds coordinates rejected (`400`).
- **Test B (Customer Ride Request & Exclusive Lock):** Customer requests ride -> Driver 1 receives request on dashboard & accepts -> Driver 2 is blocked by conflict lock (`409 Conflict`) -> Admin SSE stream transitions Driver 1 marker to Blue -> trip progresses through `DRIVER_ARRIVING`, `DRIVER_ARRIVED`, `TRIP_STARTED`, `TRIP_COMPLETED` -> Driver 1 returns to Green and real earnings are credited.
- **Test C (Tour Guide Connection):** Approved Tour Guide toggles availability -> Customer books safari tour assigned to guide -> Guide dashboard receives assignment and updates status (`CONFIRMED` -> `IN_PROGRESS` -> `COMPLETED`) -> Customer receives persistent and real-time notifications.
- **Test D (Reconnection):** Partner SSE stream disconnects and cleanly reconnects while preserving timestamp sequence ordering.
- **Test E (Authorization & Suspension):** Unauthenticated admin stream blocked (`401`), unapproved driver blocked (`403`), and suspended driver immediately removed from live map and blocked from going online (`403`).

---

## 6. API Endpoints Reference (`/api/v1`)

| Domain | Method | Endpoint | Description |
|---|---|---|---|
| **Health** | GET | `/health` | Server health check |
| **Config** | GET | `/app-config` | Remote config & feature flags |
| **Auth** | POST | `/auth/register` | Customer signup with email OTP verification |
| **Auth** | POST | `/auth/login` | Phone / Email & password login |
| **Auth** | POST | `/auth/login-with-otp` | First-time approved Partner login with 6-digit OTP |
| **Auth** | POST | `/auth/setup-password` | Set permanent password after Partner OTP login |
| **Careers** | POST | `/careers/apply` | Submit Driver or Tour Guide application |
| **Admin Fleet** | GET | `/admin/live-fleet` | Snapshot of approved operational drivers |
| **Admin SSE** | GET | `/admin/live-fleet/stream` | Real-time SSE stream for Admin Live Operations Map |
| **Partner SSE** | GET | `/realtime/stream` | Real-time SSE stream for Driver/Guide/Customer events |
| **Drivers** | GET | `/drivers/dashboard` | Authenticated Driver profile, vehicle, active trip, incoming requests, history & earnings |
| **Drivers** | PUT | `/drivers/status` | Toggle online/available status (validates approval, updates Admin map) |
| **Drivers** | PUT | `/drivers/location` | Persist & broadcast live GPS coordinates (`lat`, `lng`, `heading`, `speed`) |
| **Drivers** | POST | `/drivers/cashout` | Withdraw real driver earnings to Mobile Money |
| **Trips** | POST | `/trips/estimate` | Calculate fare for boda, go, comfort, safari_4x4 |
| **Trips** | POST | `/trips` | Request ride & broadcast to eligible online drivers |
| **Trips** | GET | `/trips/active` | Restore active trip for customer or driver |
| **Trips** | POST | `/trips/:tripId/accept` | Exclusive driver acceptance lock (`409` on conflict) |
| **Trips** | POST | `/trips/:tripId/reject` | Decline incoming ride request for authenticated driver |
| **Trips** | PUT | `/trips/:tripId/status` | Authorized trip status transition (`DRIVER_ARRIVING` -> `TRIP_COMPLETED`) |
| **Tourism** | GET | `/tourism/destinations` | List Uganda tourist destinations |
| **Tourism** | GET | `/tourism/packages` | List tour packages & safari itineraries |
| **Tourism** | POST | `/tourism/bookings` | Create safari booking & notify assigned Tour Guide |
| **Tourism** | PUT | `/tourism/bookings/:id/assign-guide` | Admin assigns an approved Tour Guide to a booking |
| **Tourism** | PUT | `/tourism/bookings/:id/status` | Authorized Tour Guide / Admin updates booking status |
| **Guides** | GET | `/guides/me/dashboard` | Authenticated Tour Guide profile, assigned bookings, completed tours & earnings |
| **Guides** | PUT | `/guides/me/availability` | Toggle Tour Guide operational availability |
| **Delivery** | POST | `/delivery/dispatch` | Dispatch parcel & assign courier |
| **Payments** | POST | `/payments/process` | DPO Pay / MTN MoMo / Airtel Money payment processing |
| **Messages** | POST | `/messages` | Send in-app trip message |
| **Notifications** | GET | `/notifications/user/:userId` | Retrieve persistent user notifications |


# SAFARIS Backend - Production Deployment & Operations Guide
**AWS Lightsail Ubuntu 24.04 VPS (512 MB RAM, 2 vCPUs, 20 GB SSD)**  
**Public Testing IP:** `18.222.41.199` | **Target API Domain:** `api.safaris.ug`

---

## Table of Contents
1. [Architecture & Resource Strategy](#1-architecture--resource-strategy)
2. [Server Preparation & Swap Setup](#2-server-preparation--swap-setup)
3. [Environment Configuration & Secrets](#3-environment-configuration--secrets)
4. [Deployment Execution](#4-deployment-execution)
5. [Database Migrations & Seeding Policy](#5-database-migrations--seeding-policy)
6. [Testing & Verification (IP & Endpoints)](#6-testing--verification-ip--endpoints)
7. [Domain & HTTPS Activation (Certbot)](#7-domain--https-activation-certbot)
8. [Automated Updates via GitHub](#8-automated-updates-via-github)
9. [Operations: Logs, Restarts & Monitoring](#9-operations-logs-restarts--monitoring)
10. [Database Backup & Disaster Recovery](#10-database-backup--disaster-recovery)
11. [Mobile Client (Flutter) Configuration](#11-mobile-client-flutter-configuration)
12. [AWS Lightsail Firewall Specification](#12-aws-lightsail-firewall-specification)

---

## 1. Architecture & Resource Strategy

```
Internet (Mobile Flutter / Web / Admin)
                 │
           Ports 80 / 443
                 ▼
       ┌───────────────────┐
       │ NGINX (Reverse    │  Alpine (~12MB RAM)
       │ Proxy & SSL)      │  Rate limiting, WebSocket upgrade, ACME
       └─────────┬─────────┘
                 │ http://backend:3000 (Docker network only)
                 ▼
       ┌───────────────────┐
       │ Node 22 API       │  Multi-stage runner (~110MB RAM)
       │ Gateway (Express) │  --max-old-space-size=128
       └────┬─────────┬────┘
            │         │
    PostgreSQL       Redis
        16             7
   (~45MB RAM)    (~10MB RAM)
   shared_buffers  maxmemory 32MB
   =32MB           no persistence
```

### Memory Allocation Breakdown (512 MB RAM Limit)
| Component | Allocated RAM | Tuning Flags / Constraints |
|---|---|---|
| **Ubuntu 24.04 OS / Systemd** | ~170 MB | Default |
| **Node.js 22 Runtime** | ~110 MB | `--max-old-space-size=128` |
| **PostgreSQL 16** | ~45 MB | `shared_buffers=32MB`, `max_connections=30`, `work_mem=2MB` |
| **Redis 7** | ~10 MB | `--maxmemory 32mb --maxmemory-policy allkeys-lru --save ""` |
| **NGINX 1.25** | ~12 MB | Worker connections 2048 |
| **Emergency Buffer** | ~165 MB | Handled by 2GB NVMe SSD Swapfile |

---

## 2. Server Preparation & Swap Setup

> **CRITICAL FOR 512 MB RAM INSTANCES:**  
> AWS Lightsail instances ship with **0 MB Swap**. Without a swapfile, running `docker compose build` or `npm ci` will cause the Linux kernel Out-Of-Memory (OOM) killer to terminate processes.

SSH into the VPS:
```bash
ssh -i /path/to/key.pem ubuntu@18.222.41.199
```

Create and enable a persistent **2GB Swapfile**:
```bash
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify swap is active
free -h
```

---

## 3. Environment Configuration & Secrets

The repository is cloned at `/home/ubuntu/safaris`.

1. Navigate to the backend directory:
   ```bash
   cd /home/ubuntu/safaris/backend
   ```

2. Generate strong, unique random secrets using OpenSSL:
   ```bash
   # Generate DB Password:
   openssl rand -hex 16

   # Generate JWT Secret:
   openssl rand -hex 32

   # Generate Refresh Token Secret:
   openssl rand -hex 32
   ```

3. Create the production `.env.production` file:
   ```bash
   cp .env.production.example .env.production
   nano .env.production
   ```

4. Populate the values in `.env.production`:
   ```ini
   PORT=3000
   NODE_ENV=production

   # Database credentials (use values generated above)
   DB_HOST=postgres
   DB_PORT=5432
   DB_USER=safaris_prod_user
   DB_PASSWORD=<YOUR_GENERATED_DB_PASSWORD>
   DB_NAME=safaris_production
   DATABASE_URL=postgres://safaris_prod_user:<YOUR_GENERATED_DB_PASSWORD>@postgres:5432/safaris_production

   # Redis
   REDIS_URL=redis://redis:6379

   # Authentication Security
   JWT_SECRET=<YOUR_GENERATED_JWT_SECRET>
   JWT_EXPIRES_IN=24h
   REFRESH_TOKEN_SECRET=<YOUR_GENERATED_REFRESH_TOKEN_SECRET>
   REFRESH_TOKEN_EXPIRES_IN=30d

   # CORS (Allows mobile clients and specific web portals)
   CORS_ORIGIN=*

   # Production Safety
   AUTO_SEED=false
   DEFAULT_COUNTRY=Uganda
   DEFAULT_CURRENCY=UGX
   PAYMENT_MOCK_MODE=true

   # Remote Config
   MIN_APP_VERSION=1.0.0
   LATEST_APP_VERSION=1.0.0
   FORCE_UPDATE=false
   MAINTENANCE_MODE=false
   ```

---

## 4. Deployment Execution

### Method A: Automated One-Click Deployment Script (Recommended)
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### Method B: Manual Step-by-Step Deployment
1. Build the production Docker images:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production build
   ```

2. Launch the services in detached mode:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```

3. Inspect running containers:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```

---

## 5. Database Migrations & Seeding Policy

### Executing Idempotent Migrations
The database schema (`src/database/schema.sql`) is non-destructive (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). It will never erase existing tables or columns.

Run the migration inside the backend container:
```bash
docker compose -f docker-compose.prod.yml exec -T backend node dist/database/migrate.js
```

Expected output:
```
🔄 [Migration] Initializing database migration...
🔌 [Migration] Connected to PostgreSQL instance.
⚡ [Migration] Executing schema DDL statements...
✅ [Migration] Schema DDL executed successfully.
📊 [Migration] Verified 13 tables present in database:
   app_config, deliveries, destinations, drivers, messages, notifications, payments, tour_bookings, tour_guides, tour_packages, trips, users, vehicles
🎉 [Migration] Database migration completed cleanly with zero data loss.
```

### Seeding Policy
- In production (`NODE_ENV=production`), automatic seeding is strictly disabled on startup to protect production data.
- If initial test or catalog data is required on the VPS, execute:
  ```bash
  docker compose -f docker-compose.prod.yml exec -T backend node -e "require('./dist/database/seed').seedUgandaData()"
  ```

---

## 6. Testing & Verification (IP & Endpoints)

The initial NGINX configuration is pre-configured to proxy HTTP traffic directly to the backend API over the VPS IP (`18.222.41.199`).

### 1. Test Health Liveness
```bash
curl -i http://18.222.41.199/health
```
Response (`200 OK`):
```json
{
  "status": "ok",
  "platform": "SAFARIS Uganda API Gateway",
  "environment": "production",
  "timestamp": "2026-09-07T00:00:00.000Z",
  "version": "1.0.0"
}
```

### 2. Test Deep Readiness (Database Check)
```bash
curl -i http://18.222.41.199/health/ready
```
Response (`200 OK`):
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-09-07T00:00:00.000Z"
}
```

### 3. Test Representative Endpoints
- **Tourism Destinations:**
  ```bash
  curl -s http://18.222.41.199/api/v1/tourism/destinations | jq
  ```
- **Remote App Configuration:**
  ```bash
  curl -s http://18.222.41.199/api/v1/app-config | jq
  ```
- **Fare Estimation:**
  ```bash
  curl -s -X POST http://18.222.41.199/api/v1/trips/estimate \
    -H "Content-Type: application/json" \
    -d '{"distanceKm": 15.0}' | jq
  ```

---

## 7. Domain & HTTPS Activation (Certbot)

Once your DNS A-record points to `18.222.41.199` (e.g. `api.safaris.ug`):

### Step 1: Obtain Let's Encrypt Certificate
Because NGINX is already serving the `/.well-known/acme-challenge/` directory mapped to `certbot_www`, run Certbot using webroot mode:
```bash
sudo apt update && sudo apt install -y certbot

sudo certbot certonly --webroot \
  -w /var/lib/docker/volumes/backend_certbot_www/_data \
  -d api.safaris.ug \
  --email admin@safaris.ug \
  --agree-tos \
  --no-eff-email
```

*(Alternatively, if running standalone: `docker compose -f docker-compose.prod.yml stop nginx && sudo certbot certonly --standalone -d api.safaris.ug && docker compose -f docker-compose.prod.yml start nginx`)*

### Step 2: Switch NGINX to HTTPS
1. Copy the SSL template over the default config:
   ```bash
   cd /home/ubuntu/safaris/backend
   sed 's/YOUR_DOMAIN/api.safaris.ug/g' nginx/conf.d/ssl.conf.template > nginx/conf.d/default.conf
   ```

2. Reload NGINX:
   ```bash
   docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
   ```

3. Setup Automated Certificate Renewal:
   ```bash
   sudo crontab -e
   # Add daily renewal check at 3:00 AM:
   0 3 * * * certbot renew --quiet && docker compose -f /home/ubuntu/safaris/backend/docker-compose.prod.yml exec nginx nginx -s reload
   ```

---

## 8. Automated Updates via GitHub

When developers push code changes to GitHub:

```bash
cd /home/ubuntu/safaris/backend
./scripts/deploy.sh
```
This script will:
1. Pull the latest commits from `origin/main`.
2. Rebuild the Node.js production image with `npm ci --omit=dev`.
3. Recreate the API container with zero downtime.
4. Run pending database migrations.
5. Verify `/health`.

---

## 9. Operations: Logs, Restarts & Monitoring

### Inspecting Container Logs
```bash
# View all logs in real-time:
docker compose -f docker-compose.prod.yml logs -f --tail=100

# View only API gateway logs:
docker compose -f docker-compose.prod.yml logs -f backend

# View NGINX access/error logs:
docker compose -f docker-compose.prod.yml logs -f nginx
```

### Restarting Services
```bash
# Restart everything:
docker compose -f docker-compose.prod.yml restart

# Restart only API:
docker compose -f docker-compose.prod.yml restart backend
```

### Memory & Process Monitoring
```bash
# Live container resource usage:
docker stats --no-stream

# VPS memory overview:
free -m
```

---

## 10. Database Backup & Disaster Recovery

### Automated Nightly Backups
A production backup script with 7-day automated retention is located at `scripts/backup_db.sh`.

Add to crontab:
```bash
crontab -e
# Run daily at 02:00 UTC:
0 2 * * * /home/ubuntu/safaris/backend/scripts/backup_db.sh >> /var/log/safaris_backup.log 2>&1
```

### Restoring a Backup
```bash
chmod +x scripts/restore_db.sh
./scripts/restore_db.sh backups/safaris_backup_YYYYMMDD_HHMMSS.sql.gz
```

---

## 11. Mobile Client (Flutter) Configuration

The Flutter mobile application uses [lib/core/config/environment_config.dart](file:///c:/Users/USER/Desktop/SAFARIS/lib/core/config/environment_config.dart).

### 1. Local Offline Development
```bash
# Android Emulator (default host 10.0.2.2:3000):
flutter run

# Physical Device over Local Wi-Fi (e.g. 192.168.1.105):
flutter run --dart-define=API_URL=http://192.168.1.105:3000/api/v1 --dart-define=SOCKET_URL=http://192.168.1.105:3000
```

### 2. VPS Testing (Current Public IP)
```bash
flutter run \
  --dart-define=API_URL=http://18.222.41.199/api/v1 \
  --dart-define=SOCKET_URL=http://18.222.41.199
```
*(Note: For Android 9+ cleartext HTTP testing, ensure `android:usesCleartextTraffic="true"` is set in `AndroidManifest.xml` or use HTTPS domain below).*

### 3. Production Release (Secure HTTPS Domain)
```bash
flutter build apk --release \
  --dart-define=ENV=production \
  --dart-define=API_URL=https://api.safaris.ug/api/v1 \
  --dart-define=SOCKET_URL=https://api.safaris.ug
```

---

## 12. AWS Lightsail Firewall Specification

In the **AWS Lightsail Console > Networking > IPv4 Firewall**:

| Port | Protocol | Access | Purpose |
|---|---|---|---|
| **22** | TCP | Restricted (Your IP or Lightsail Browser SSH) | Secure Shell |
| **80** | TCP | Custom / Any IPv4 (`0.0.0.0/0`) | HTTP / Let's Encrypt ACME |
| **443** | TCP | Custom / Any IPv4 (`0.0.0.0/0`) | HTTPS Secure API Gateway |

### Strict Rule:
- **DO NOT OPEN** Port `3000`, `5432`, or `6379`.
- Node.js (`3000`), PostgreSQL (`5432`), and Redis (`6379`) reside strictly inside the internal Docker bridge network (`safaris_prod_net`) and are never exposed directly to the public internet.

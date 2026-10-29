#!/bin/bash
# ==============================================================================
# SAFARIS Backend - Safe Production Deployment Script (AWS Lightsail VPS)
# ==============================================================================

set -euo pipefail

# Navigate to backend root
cd "$(dirname "$0")/.."
BACKEND_DIR=$(pwd)

echo "========================================================"
echo "🚀 SAFARIS Backend VPS Production Deployment"
echo "📅 Date: $(date)"
echo "📂 Directory: ${BACKEND_DIR}"
echo "========================================================"

# 1. Ensure Swap Memory is active (Critical for 512MB RAM VPS)
TOTAL_SWAP=$(free -m | awk '/Swap:/ {print $2}')
if [ "$TOTAL_SWAP" -lt 1024 ]; then
  echo "⚠️  [Notice] Low or missing swap memory detected (${TOTAL_SWAP}MB)."
  if [ "$(id -u)" -eq 0 ] || sudo -n true 2>/dev/null; then
    echo "💡 Configuring recommended 2GB swap space on VPS..."
    if [ ! -f /swapfile ]; then
      sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
      sudo chmod 600 /swapfile
      sudo mkswap /swapfile
      sudo swapon /swapfile
      if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
      fi
      echo "✅ 2GB Swapfile activated successfully."
    fi
  else
    echo "ℹ️  Run 'sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile' if builds run out of memory."
  fi
fi

# 2. Validate Production Environment File
if [ ! -f ".env.production" ]; then
  echo "❌ Error: .env.production file is missing in ${BACKEND_DIR}!"
  echo "💡 Create it by copying .env.production.example:"
  echo "   cp .env.production.example .env.production"
  echo "   nano .env.production"
  exit 1
fi

echo "🔒 Validating environment configuration..."
# Ensure critical secrets are populated
if grep -q "CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET" .env.production; then
  echo "❌ Error: Unset placeholder secrets found in .env.production! Generate strong random secrets before deploying."
  exit 1
fi

# Preserve the pre-release database before changing the running application.
umask 077
mkdir -p backups
PREVIOUS_SHA=$(git rev-parse HEAD)
export SAFARIS_RELEASE_SHA="$PREVIOUS_SHA"
BACKUP_STEM="backups/pre-release-$(date -u +%Y%m%dT%H%M%SZ)"
if docker compose -f docker-compose.prod.yml --env-file .env.production ps --status running postgres | grep -q safaris_postgres_prod; then
  docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "${BACKUP_STEM}.sql.gz"
  gzip -t "${BACKUP_STEM}.sql.gz"
  printf '%s\n' "$PREVIOUS_SHA" > "${BACKUP_STEM}.commit"
else
  echo "Existing production database is not running; refusing unattended release."; exit 1
fi

# 3. Pull latest code from GitHub and verify target commit
TARGET_COMMIT="${1:-}"
if [[ ! "$TARGET_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full tested commit SHA is required."; exit 1
fi
CURRENT_RUNNING_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")
git diff --quiet && git diff --cached --quiet || { echo "Working tree contains local changes; refusing deployment."; exit 1; }
git fetch origin main
git merge-base --is-ancestor "$TARGET_COMMIT" origin/main || { echo "Commit is not on main."; exit 1; }
git checkout --detach "$TARGET_COMMIT"
DEPLOYED_SHA=$(git rev-parse HEAD)
[ "$DEPLOYED_SHA" = "$TARGET_COMMIT" ] || exit 1
export SAFARIS_RELEASE_SHA="$DEPLOYED_SHA"

# 4. Build Docker Production Images
echo "🔨 Building Docker production containers..."
# Always build backend container for the new commit
docker compose -f docker-compose.prod.yml --env-file .env.production build backend

# Rebuild admin dashboard only if image is missing or host has sufficient RAM (>1.2GB)
if [ -z "$CURRENT_RUNNING_SHA" ] || ! docker image inspect safaris-admin >/dev/null 2>&1; then
  echo "🔨 Building admin dashboard image..."
  docker compose -f docker-compose.prod.yml --env-file .env.production build admin
elif ! git diff --quiet "$CURRENT_RUNNING_SHA" "$TARGET_COMMIT" -- admin/ 2>/dev/null; then
  TOTAL_MEM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo 2048)
  if [ "$TOTAL_MEM_MB" -gt 1200 ]; then
    echo "🔨 Building admin dashboard image (host RAM: ${TOTAL_MEM_MB}MB)..."
    docker compose -f docker-compose.prod.yml --env-file .env.production build admin
  else
    echo "⚡ Low-memory host (${TOTAL_MEM_MB}MB RAM): preserving existing safaris-admin image to prevent swap thrashing..."
  fi
else
  echo "⏩ Skipping admin dashboard build (no changes in admin/)..."
fi

# The private applicant status flow requires deliverable SMTP, never a logged token fallback.
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps backend node -e "const {ENV}=require('./dist/config/env'); if (!ENV.SMTP_HOST || !ENV.SMTP_USER || !ENV.SMTP_PASS) throw new Error('SMTP configuration is required for private application status links');"
# Migrate while the previous backend is still running; all migrations must be additive.
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps backend node dist/database/migrate.js
# Verify certificates and Nginx syntax before replacing running services.
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps nginx sh -c 'printf "127.0.0.1 backend admin\n" >> /etc/hosts; nginx -t'
# Switch the services only after migration success.
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --remove-orphans
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec safaris_nginx_prod nginx -t >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec safaris_nginx_prod nginx -t
docker compose -f docker-compose.prod.yml --env-file .env.production restart nginx

# 8. Verify API Health Endpoint & Database Readiness
echo "🩺 Verifying API Gateway health check..."
sleep 3
HEALTH_RESPONSE=$(docker exec safaris_backend_prod node -e "fetch('http://127.0.0.1:3000/health').then(r => r.text()).then(console.log).catch(() => process.exit(1))")
echo "$HEALTH_RESPONSE" | python3 -c 'import json,sys; r=json.load(sys.stdin); assert r.get("status") == "ok" and r.get("commit") == sys.argv[1]' "$DEPLOYED_SHA"
READY_RESPONSE=$(docker exec safaris_backend_prod node -e "fetch('http://127.0.0.1:3000/health/ready').then(r => { if (!r.ok) process.exit(1); return r.text(); }).then(console.log).catch(() => process.exit(1))")
echo "$READY_RESPONSE" | python3 -c 'import json,sys; assert json.load(sys.stdin).get("database") == "connected"'
# Public origin TLS, redirects and route availability must also succeed.
for DOMAIN in admin.mumwesafarisuganda.com careers.mumwesafarisuganda.com; do
  curl -fsS --max-time 15 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" > /dev/null
  REDIRECT=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1/api/v1/auth/login)
  [ "$REDIRECT" = "308" ] || { echo "HTTPS enforcement failed for $DOMAIN"; exit 1; }
done
echo "✅ API Gateway verified healthy."

# 9. Report Container Status and Memory Usage
echo ""
echo "========================================================"
echo "📊 Current Container Status:"
docker compose -f docker-compose.prod.yml --env-file .env.production ps
echo ""
echo "💾 VPS Memory Usage:"
free -m
echo ""
echo "🎉 SAFARIS Backend deployed and verified successfully!"
echo "🌐 API Base: https://admin.mumwesafarisuganda.com/api/v1"
echo "🩺 Health Check: https://admin.mumwesafarisuganda.com/health"
echo "========================================================"

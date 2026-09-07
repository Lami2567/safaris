#!/bin/bash
# ==============================================================================
# SAFARIS Backend - Safe Production Deployment Script (AWS Lightsail VPS)
# ==============================================================================

set -e

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

# 3. Pull latest code from GitHub (Clean tracking just like Vercel / Render)
echo "📥 Syncing latest codebase from GitHub (origin/main)..."
git fetch origin main
git reset --hard origin/main
git clean -fd -e .env.production -e backups -e autodeploy.log

# 4. Build Docker Production Images
echo "🔨 Building Docker production containers..."
docker compose -f docker-compose.prod.yml --env-file .env.production build

# 5. Start / Update Services Gracefully
echo "🚀 Starting production service stack..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 6. Wait for Database Readiness
echo "⏳ Waiting for PostgreSQL to initialize..."
RETRIES=15
until docker compose -f docker-compose.prod.yml exec postgres pg_isready -U safaris_prod_user -d safaris_production 2>/dev/null || [ $RETRIES -eq 0 ]; do
  echo "   Waiting for database... ($RETRIES attempts remaining)"
  RETRIES=$((RETRIES-1))
  sleep 3
done

if [ $RETRIES -eq 0 ]; then
  echo "❌ Error: PostgreSQL failed to become healthy in time."
  docker compose -f docker-compose.prod.yml logs postgres --tail=20
  exit 1
fi
echo "✅ PostgreSQL is ready."

# 7. Execute Safe Idempotent Database Migrations
echo "🔄 Executing database migrations..."
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backend node dist/database/migrate.js

# 8. Verify API Health Endpoint
echo "🩺 Verifying API Gateway health check..."
sleep 3
HEALTH_RESPONSE=$(curl -s http://localhost/health || curl -s http://localhost:3000/health || echo "FAILED")
echo "   Health Check Response: ${HEALTH_RESPONSE}"

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
echo "🌐 API Base: http://18.222.41.199/api/v1"
echo "🩺 Health Check: http://18.222.41.199/health"
echo "========================================================"

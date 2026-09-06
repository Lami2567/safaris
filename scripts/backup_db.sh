#!/bin/bash
# ==============================================================================
# SAFARIS Database Backup Script
# Automatically dumps PostgreSQL database and enforces 7-day retention policy
# ==============================================================================

set -e

# Load environment from .env.production if running on host
if [ -f "$(dirname "$0")/../.env.production" ]; then
  # export variables ignoring comments
  export $(grep -v '^#' "$(dirname "$0")/../.env.production" | xargs)
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/safaris_backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-${POSTGRES_USER:-safaris_prod_user}}"
DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-safaris_production}}"

if [ -z "${DB_PASSWORD}" ]; then
  echo "❌ Error: DB_PASSWORD / POSTGRES_PASSWORD is not set. Cannot run backup."
  exit 1
fi

echo "[$(date)] Starting SAFARIS PostgreSQL backup (${DB_NAME})..."

# If running inside docker container or on host with docker
if command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q "safaris_postgres_prod"; then
  docker exec -t -e PGPASSWORD="${DB_PASSWORD}" safaris_postgres_prod pg_dump \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --format=plain --no-owner | gzip > "${BACKUP_FILE}"
else
  PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --format=plain --no-owner | gzip > "${BACKUP_FILE}"
fi

echo "✅ [$(date)] Backup completed successfully: ${BACKUP_FILE}"

# Retention: Delete backups older than 7 days
find "${BACKUP_DIR}" -type f -name "safaris_backup_*.sql.gz" -mtime +7 -exec rm -f {} \;
echo "🧹 [$(date)] Enforced 7-day backup retention policy."

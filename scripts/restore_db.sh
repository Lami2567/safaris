#!/bin/bash
# ==============================================================================
# SAFARIS Database Restore Script
# Restores a compressed SQL dump to the PostgreSQL instance
# Usage: ./restore_db.sh <path_to_backup_file.sql.gz>
# ==============================================================================

set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Please specify a valid backup file to restore."
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  exit 1
fi

# Load environment from .env.production if present
if [ -f "$(dirname "$0")/../.env.production" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env.production" | xargs)
fi

DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-${POSTGRES_USER:-safaris_prod_user}}"
DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD}}"
DB_NAME="${DB_NAME:-${POSTGRES_DB:-safaris_production}}"

if [ -z "${DB_PASSWORD}" ]; then
  echo "❌ Error: DB_PASSWORD / POSTGRES_PASSWORD is not set. Cannot run restore."
  exit 1
fi

echo "[$(date)] Restoring SAFARIS database from ${BACKUP_FILE} to ${DB_NAME}..."

if command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q "safaris_postgres_prod"; then
  gunzip -c "${BACKUP_FILE}" | docker exec -i -e PGPASSWORD="${DB_PASSWORD}" safaris_postgres_prod psql \
    -U "${DB_USER}" \
    -d "${DB_NAME}"
else
  gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${DB_PASSWORD}" psql \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}"
fi

echo "✅ [$(date)] Database restored successfully."

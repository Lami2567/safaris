#!/bin/bash
# ==============================================================================
# SAFARIS Database Backup Script
# Automatically dumps PostgreSQL database and enforces 7-day retention policy
# ==============================================================================

set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/safaris_backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting SAFARIS PostgreSQL backup..."

PGPASSWORD="${POSTGRES_PASSWORD:-prod_super_secure_pass_9921}" pg_dump \
  -h "${DB_HOST:-postgres}" \
  -U "${POSTGRES_USER:-safaris_prod_user}" \
  -d "${POSTGRES_DB:-safaris_production}" \
  --format=plain --no-owner | gzip > "${BACKUP_FILE}"

echo "[$(date)] Backup completed successfully: ${BACKUP_FILE}"

# Retention: Delete backups older than 7 days
find "${BACKUP_DIR}" -type f -name "safaris_backup_*.sql.gz" -mtime +7 -exec rm -f {} \;
echo "[$(date)] Enforced 7-day backup retention policy."

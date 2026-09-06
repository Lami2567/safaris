#!/bin/bash
# ==============================================================================
# SAFARIS Database Restore Script
# Restores a compressed SQL dump to the PostgreSQL instance
# Usage: ./restore_db.sh /backups/safaris_backup_YYYYMMDD_HHMMSS.sql.gz
# ==============================================================================

set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Please specify a valid backup file to restore."
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  exit 1
fi

echo "[$(date)] Restoring SAFARIS database from ${BACKUP_FILE}..."

gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${POSTGRES_PASSWORD:-prod_super_secure_pass_9921}" psql \
  -h "${DB_HOST:-postgres}" \
  -U "${POSTGRES_USER:-safaris_prod_user}" \
  -d "${POSTGRES_DB:-safaris_production}"

echo "[$(date)] Database restored successfully."

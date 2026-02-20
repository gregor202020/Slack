#!/usr/bin/env bash
#
# restore.sh — Restore a PostgreSQL backup for The Smoker
#
# Usage:
#   ./scripts/restore.sh <backup-file>
#   ./scripts/restore.sh --yes <backup-file>
#   ./scripts/restore.sh --list
#
# Arguments:
#   <backup-file>   Path to a .dump.gz backup file
#   --yes           Skip confirmation prompt
#   --list          List available backups and exit
#
# Environment variables:
#   DATABASE_URL    — PostgreSQL connection string (default: dev)
#   BACKUP_DIR      — Directory containing backups (default: ./backups)
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL="${DATABASE_URL:-postgresql://smoker:smoker_dev@localhost:5432/smoker}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backups}"

SKIP_CONFIRM=false
LIST_ONLY=false
BACKUP_FILE=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

usage() {
  echo "Usage: $0 [--yes] <backup-file>"
  echo "       $0 --list"
  echo ""
  echo "Options:"
  echo "  --yes    Skip confirmation prompt"
  echo "  --list   List available backups"
  echo ""
  echo "Environment:"
  echo "  DATABASE_URL   PostgreSQL connection string"
  echo "  BACKUP_DIR     Backup directory (default: ./backups)"
  exit 1
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y)
      SKIP_CONFIRM=true
      shift
      ;;
    --list|-l)
      LIST_ONLY=true
      shift
      ;;
    --help|-h)
      usage
      ;;
    -*)
      die "Unknown option: $1"
      ;;
    *)
      BACKUP_FILE="$1"
      shift
      ;;
  esac
done

# ---------------------------------------------------------------------------
# List mode
# ---------------------------------------------------------------------------

if [ "${LIST_ONLY}" = true ]; then
  echo "Available backups in ${BACKUP_DIR}:"
  echo ""
  if [ -d "${BACKUP_DIR}" ]; then
    found=false
    while IFS= read -r f; do
      [ -z "${f}" ] && continue
      found=true
      size="$(du -h "${f}" | cut -f1)"
      echo "  $(basename "${f}")  (${size})"
    done < <(find "${BACKUP_DIR}" -maxdepth 1 -name 'smoker-backup-*.dump.gz' -type f | sort -r)
    if [ "${found}" = false ]; then
      echo "  (none)"
    fi
  else
    echo "  Backup directory does not exist: ${BACKUP_DIR}"
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------

[ -z "${BACKUP_FILE}" ] && usage

[ -f "${BACKUP_FILE}" ] || die "Backup file not found: ${BACKUP_FILE}"

command -v pg_restore >/dev/null 2>&1 || die "pg_restore is not installed. Install PostgreSQL client tools."
command -v psql >/dev/null 2>&1 || die "psql is not installed. Install PostgreSQL client tools."

# Parse database name from URL
# URL format: postgresql://user:pass@host:port/dbname
DB_NAME="${DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
[ -z "${DB_NAME}" ] && die "Could not parse database name from DATABASE_URL"

# Build a maintenance connection URL (connect to 'postgres' db instead)
MAINTENANCE_URL="${DATABASE_URL%/*}/postgres"

# ---------------------------------------------------------------------------
# Confirmation
# ---------------------------------------------------------------------------

BACKUP_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"

log "Restore configuration:"
log "  Backup file:  ${BACKUP_FILE} (${BACKUP_SIZE})"
log "  Database:     ${DB_NAME}"
log "  URL:          ${DATABASE_URL%%@*}@***"
log ""
log "WARNING: This will DROP and RECREATE the '${DB_NAME}' database."
log "         All existing data will be lost."

if [ "${SKIP_CONFIRM}" = false ]; then
  echo ""
  printf "Type 'yes' to continue: "
  read -r CONFIRM
  if [ "${CONFIRM}" != "yes" ]; then
    log "Restore cancelled."
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

log "Starting restore..."

# Terminate existing connections
log "Terminating existing connections to '${DB_NAME}'..."
psql "${MAINTENANCE_URL}" -c "
  SELECT pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE pg_stat_activity.datname = '${DB_NAME}'
    AND pid <> pg_backend_pid();
" >/dev/null 2>&1 || true

# Drop and recreate the database
log "Dropping database '${DB_NAME}'..."
psql "${MAINTENANCE_URL}" -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" 2>&1

log "Creating database '${DB_NAME}'..."
psql "${MAINTENANCE_URL}" -c "CREATE DATABASE \"${DB_NAME}\";" 2>&1

# Restore from dump
log "Restoring from backup..."
gunzip -c "${BACKUP_FILE}" \
  | pg_restore \
    --format=custom \
    --verbose \
    --no-owner \
    --no-privileges \
    --dbname="${DATABASE_URL}" \
    2>&1

log "Restore complete."

# Verify
TABLE_COUNT="$(psql "${DATABASE_URL}" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')"
log "Verification: ${TABLE_COUNT} table(s) in public schema"

log "Done."
exit 0

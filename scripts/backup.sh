#!/usr/bin/env bash
#
# backup.sh — Create a PostgreSQL backup for The Smoker
#
# Usage:
#   ./scripts/backup.sh
#
# Environment variables:
#   DATABASE_URL          — PostgreSQL connection string (default: dev)
#   BACKUP_DIR            — Directory to store backups (default: ./backups)
#   BACKUP_RETENTION      — Number of backups to keep locally (default: 7)
#   BACKUP_S3_BUCKET      — S3 bucket name for remote backup storage
#   BACKUP_S3_ENDPOINT    — S3/MinIO endpoint URL (enables S3 upload)
#   BACKUP_S3_ACCESS_KEY  — S3 access key
#   BACKUP_S3_SECRET_KEY  — S3 secret key
#   BACKUP_S3_REGION      — S3 region (default: us-east-1)
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL="${DATABASE_URL:-postgresql://smoker:smoker_dev@localhost:5432/smoker}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-7}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-smoker-backups}"
BACKUP_S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
BACKUP_S3_ACCESS_KEY="${BACKUP_S3_ACCESS_KEY:-}"
BACKUP_S3_SECRET_KEY="${BACKUP_S3_SECRET_KEY:-}"
BACKUP_S3_REGION="${BACKUP_S3_REGION:-us-east-1}"

TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"
BACKUP_FILENAME="smoker-backup-${TIMESTAMP}.dump.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

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

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    log "Backup failed (exit code ${exit_code})"
    # Remove partial backup if it exists
    [ -f "${BACKUP_PATH}" ] && rm -f "${BACKUP_PATH}"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

command -v pg_dump >/dev/null 2>&1 || die "pg_dump is not installed. Install PostgreSQL client tools or use backup-docker.sh instead."

mkdir -p "${BACKUP_DIR}"

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

log "Starting backup..."
log "  Database:  ${DATABASE_URL%%@*}@***"
log "  Output:    ${BACKUP_PATH}"

pg_dump \
  --format=custom \
  --verbose \
  --no-owner \
  --no-privileges \
  "${DATABASE_URL}" 2>&1 \
  | gzip > "${BACKUP_PATH}"

BACKUP_SIZE="$(du -h "${BACKUP_PATH}" | cut -f1)"
log "Backup complete: ${BACKUP_FILENAME} (${BACKUP_SIZE})"

# ---------------------------------------------------------------------------
# S3 Upload (optional)
# ---------------------------------------------------------------------------

if [ -n "${BACKUP_S3_ENDPOINT}" ]; then
  log "Uploading to S3: ${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET}..."

  if command -v aws >/dev/null 2>&1; then
    # Use AWS CLI
    export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY}"
    export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY}"
    export AWS_DEFAULT_REGION="${BACKUP_S3_REGION}"

    aws s3 cp \
      "${BACKUP_PATH}" \
      "s3://${BACKUP_S3_BUCKET}/${BACKUP_FILENAME}" \
      --endpoint-url "${BACKUP_S3_ENDPOINT}" \
      2>&1

    log "S3 upload complete (aws cli)"

  elif command -v mc >/dev/null 2>&1; then
    # Use MinIO Client
    mc alias set smoker-backup \
      "${BACKUP_S3_ENDPOINT}" \
      "${BACKUP_S3_ACCESS_KEY}" \
      "${BACKUP_S3_SECRET_KEY}" \
      --api S3v4 \
      >/dev/null 2>&1

    mc cp \
      "${BACKUP_PATH}" \
      "smoker-backup/${BACKUP_S3_BUCKET}/${BACKUP_FILENAME}" \
      2>&1

    log "S3 upload complete (mc)"

  else
    log "WARNING: Neither 'aws' nor 'mc' CLI found. Skipping S3 upload."
    log "  Install AWS CLI:   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    log "  Install MinIO mc:  https://min.io/docs/minio/linux/reference/minio-mc.html"
  fi
else
  log "S3 upload skipped (BACKUP_S3_ENDPOINT not set)"
fi

# ---------------------------------------------------------------------------
# Retention — keep only the last N backups
# ---------------------------------------------------------------------------

log "Applying retention policy: keeping last ${BACKUP_RETENTION} backups"

# List backup files sorted oldest first, skip the most recent N
BACKUP_COUNT=0
while IFS= read -r old_backup; do
  [ -z "${old_backup}" ] && continue
  BACKUP_COUNT=$((BACKUP_COUNT + 1))
  log "  Removing old backup: $(basename "${old_backup}")"
  rm -f "${old_backup}"
done < <(
  find "${BACKUP_DIR}" -maxdepth 1 -name 'smoker-backup-*.dump.gz' -type f \
    | sort \
    | head -n -"${BACKUP_RETENTION}"
)

if [ "${BACKUP_COUNT}" -eq 0 ]; then
  log "  No old backups to remove"
else
  log "  Removed ${BACKUP_COUNT} old backup(s)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

REMAINING="$(find "${BACKUP_DIR}" -maxdepth 1 -name 'smoker-backup-*.dump.gz' -type f | wc -l)"
log "Done. ${REMAINING} backup(s) in ${BACKUP_DIR}"

exit 0

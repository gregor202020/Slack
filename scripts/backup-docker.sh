#!/usr/bin/env bash
#
# backup-docker.sh — Create a PostgreSQL backup using Docker
#
# Runs pg_dump inside the smoker-postgres container, so you don't need
# PostgreSQL client tools installed on the host.
#
# Usage:
#   ./scripts/backup-docker.sh
#
# Environment variables:
#   POSTGRES_CONTAINER  — Docker container name (default: smoker-postgres)
#   POSTGRES_USER       — PostgreSQL user (default: smoker)
#   POSTGRES_DB         — PostgreSQL database (default: smoker)
#   BACKUP_DIR          — Directory to store backups (default: ./backups)
#   BACKUP_RETENTION    — Number of backups to keep locally (default: 7)
#   BACKUP_S3_BUCKET    — S3 bucket name for remote backup storage
#   BACKUP_S3_ENDPOINT  — S3/MinIO endpoint URL (enables S3 upload)
#   BACKUP_S3_ACCESS_KEY — S3 access key
#   BACKUP_S3_SECRET_KEY — S3 secret key
#   BACKUP_S3_REGION    — S3 region (default: us-east-1)
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-smoker-postgres}"
POSTGRES_USER="${POSTGRES_USER:-smoker}"
POSTGRES_DB="${POSTGRES_DB:-smoker}"
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
CONTAINER_DUMP_PATH="/tmp/${BACKUP_FILENAME%.gz}"

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
  # Remove the dump file from inside the container
  docker exec "${POSTGRES_CONTAINER}" rm -f "${CONTAINER_DUMP_PATH}" 2>/dev/null || true
  if [ $exit_code -ne 0 ]; then
    log "Backup failed (exit code ${exit_code})"
    [ -f "${BACKUP_PATH}" ] && rm -f "${BACKUP_PATH}"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

command -v docker >/dev/null 2>&1 || die "docker is not installed."

# Check that the container is running
if ! docker inspect --format='{{.State.Running}}' "${POSTGRES_CONTAINER}" 2>/dev/null | grep -q true; then
  die "Container '${POSTGRES_CONTAINER}' is not running. Start it with: make infra"
fi

mkdir -p "${BACKUP_DIR}"

# ---------------------------------------------------------------------------
# Backup — run pg_dump inside the container
# ---------------------------------------------------------------------------

log "Starting Docker backup..."
log "  Container: ${POSTGRES_CONTAINER}"
log "  Database:  ${POSTGRES_DB}"
log "  User:      ${POSTGRES_USER}"
log "  Output:    ${BACKUP_PATH}"

# Run pg_dump inside the container
docker exec "${POSTGRES_CONTAINER}" \
  pg_dump \
    --format=custom \
    --verbose \
    --no-owner \
    --no-privileges \
    --username="${POSTGRES_USER}" \
    --file="${CONTAINER_DUMP_PATH}" \
    "${POSTGRES_DB}" \
    2>&1

# Copy the dump file from the container to the host and compress it
# docker cp with '-' outputs a tar stream, so extract the file and gzip it
docker cp "${POSTGRES_CONTAINER}:${CONTAINER_DUMP_PATH}" "${BACKUP_DIR}/"
gzip -f "${BACKUP_DIR}/$(basename "${CONTAINER_DUMP_PATH}")"
mv "${BACKUP_DIR}/$(basename "${CONTAINER_DUMP_PATH}").gz" "${BACKUP_PATH}"

# Remove the dump file from the container (also done in cleanup trap)
docker exec "${POSTGRES_CONTAINER}" rm -f "${CONTAINER_DUMP_PATH}" 2>/dev/null || true

BACKUP_SIZE="$(du -h "${BACKUP_PATH}" | cut -f1)"
log "Backup complete: ${BACKUP_FILENAME} (${BACKUP_SIZE})"

# ---------------------------------------------------------------------------
# S3 Upload (optional)
# ---------------------------------------------------------------------------

if [ -n "${BACKUP_S3_ENDPOINT}" ]; then
  log "Uploading to S3: ${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET}..."

  if command -v aws >/dev/null 2>&1; then
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
  fi
else
  log "S3 upload skipped (BACKUP_S3_ENDPOINT not set)"
fi

# ---------------------------------------------------------------------------
# Retention — keep only the last N backups
# ---------------------------------------------------------------------------

log "Applying retention policy: keeping last ${BACKUP_RETENTION} backups"

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

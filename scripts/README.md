# Database Backup & Restore Scripts

Automated PostgreSQL backup and restore tooling for The Smoker.

## Quick Start

```bash
# Backup using host pg_dump
make backup

# Backup via Docker (no pg_dump needed on host)
make backup-docker

# List available backups
./scripts/restore.sh --list

# Restore a backup
make restore FILE=backups/smoker-backup-2025-01-15-143022.dump.gz
```

## Scripts

### `backup.sh` — Host Backup

Runs `pg_dump` on the host machine. Requires PostgreSQL client tools installed locally.

```bash
# With defaults (dev database)
./scripts/backup.sh

# Custom database
DATABASE_URL=postgresql://user:pass@host:5432/mydb ./scripts/backup.sh

# With S3 upload to MinIO
BACKUP_S3_ENDPOINT=http://localhost:9000 \
BACKUP_S3_ACCESS_KEY=minioadmin \
BACKUP_S3_SECRET_KEY=minioadmin \
BACKUP_S3_BUCKET=smoker-backups \
./scripts/backup.sh
```

### `backup-docker.sh` — Docker Backup

Runs `pg_dump` inside the `smoker-postgres` container. Does not require PostgreSQL client tools on the host — only Docker.

```bash
# With defaults
./scripts/backup-docker.sh

# Custom container
POSTGRES_CONTAINER=my-postgres POSTGRES_DB=mydb ./scripts/backup-docker.sh
```

### `restore.sh` — Restore

Restores a `.dump.gz` backup file. Drops and recreates the target database.

```bash
# Interactive (prompts for confirmation)
./scripts/restore.sh backups/smoker-backup-2025-01-15-143022.dump.gz

# Non-interactive (skip confirmation)
./scripts/restore.sh --yes backups/smoker-backup-2025-01-15-143022.dump.gz

# List available backups
./scripts/restore.sh --list
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://smoker:smoker_dev@localhost:5432/smoker` | PostgreSQL connection string |
| `BACKUP_DIR` | `./backups` | Local directory for backup files |
| `BACKUP_RETENTION` | `7` | Number of local backups to keep |
| `BACKUP_S3_ENDPOINT` | _(unset)_ | S3/MinIO endpoint URL (enables upload) |
| `BACKUP_S3_BUCKET` | `smoker-backups` | S3 bucket for backup storage |
| `BACKUP_S3_ACCESS_KEY` | _(unset)_ | S3 access key |
| `BACKUP_S3_SECRET_KEY` | _(unset)_ | S3 secret key |
| `BACKUP_S3_REGION` | `us-east-1` | S3 region |
| `POSTGRES_CONTAINER` | `smoker-postgres` | Docker container name (Docker backup only) |
| `POSTGRES_USER` | `smoker` | PostgreSQL user (Docker backup only) |
| `POSTGRES_DB` | `smoker` | PostgreSQL database (Docker backup only) |

## S3 / MinIO Upload Configuration

Backups can be automatically uploaded to any S3-compatible storage (AWS S3, DigitalOcean Spaces, MinIO, etc.) by setting `BACKUP_S3_ENDPOINT`.

The scripts support two CLI tools for S3 upload (checked in order):

1. **AWS CLI** (`aws`) — `pip install awscli` or [install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
2. **MinIO Client** (`mc`) — [install guide](https://min.io/docs/minio/linux/reference/minio-mc.html)

### Local MinIO Example

The project already runs MinIO for file storage. To also use it for backups:

```bash
# Create the backup bucket (one-time setup)
docker exec smoker-minio mc mb /data/smoker-backups 2>/dev/null || true

# Run backup with S3 upload
BACKUP_S3_ENDPOINT=http://localhost:9000 \
BACKUP_S3_ACCESS_KEY=minioadmin \
BACKUP_S3_SECRET_KEY=minioadmin \
BACKUP_S3_BUCKET=smoker-backups \
./scripts/backup.sh
```

### AWS S3 Example

```bash
BACKUP_S3_ENDPOINT=https://s3.amazonaws.com \
BACKUP_S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE \
BACKUP_S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY \
BACKUP_S3_BUCKET=my-smoker-backups \
BACKUP_S3_REGION=us-west-2 \
./scripts/backup.sh
```

## Scheduling with Cron

### Daily backup at 2:00 AM (host pg_dump)

```cron
0 2 * * * cd /path/to/the-smoker && ./scripts/backup.sh >> /var/log/smoker-backup.log 2>&1
```

### Daily backup at 2:00 AM (Docker)

```cron
0 2 * * * cd /path/to/the-smoker && ./scripts/backup-docker.sh >> /var/log/smoker-backup.log 2>&1
```

### Daily backup with S3 upload

```cron
0 2 * * * cd /path/to/the-smoker && \
  BACKUP_S3_ENDPOINT=http://localhost:9000 \
  BACKUP_S3_ACCESS_KEY=minioadmin \
  BACKUP_S3_SECRET_KEY=minioadmin \
  BACKUP_S3_BUCKET=smoker-backups \
  ./scripts/backup.sh >> /var/log/smoker-backup.log 2>&1
```

### Using a .env file with cron

Create a dedicated backup env file and source it:

```bash
# /path/to/the-smoker/.env.backup
DATABASE_URL=postgresql://smoker:smoker_dev@localhost:5432/smoker
BACKUP_RETENTION=14
BACKUP_S3_ENDPOINT=http://localhost:9000
BACKUP_S3_ACCESS_KEY=minioadmin
BACKUP_S3_SECRET_KEY=minioadmin
BACKUP_S3_BUCKET=smoker-backups
```

```cron
0 2 * * * cd /path/to/the-smoker && set -a && . .env.backup && set +a && ./scripts/backup.sh >> /var/log/smoker-backup.log 2>&1
```

## Disaster Recovery Checklist

### Before an incident

- [ ] Automated backups are running (cron job configured)
- [ ] S3 upload is enabled for off-site copies
- [ ] Backup retention is set appropriately (default: 7)
- [ ] Test a restore periodically to verify backups are valid
- [ ] Monitor backup logs for failures
- [ ] Document the production DATABASE_URL securely

### During an incident

1. **Stop the application** to prevent further data corruption:
   ```bash
   make down        # full stack
   # or
   make infra-down  # dev infra
   ```

2. **Identify the most recent valid backup**:
   ```bash
   ./scripts/restore.sh --list
   # or check S3 bucket for remote backups
   ```

3. **Download from S3 if needed** (if local backups are lost):
   ```bash
   aws s3 cp \
     s3://smoker-backups/smoker-backup-2025-01-15-143022.dump.gz \
     ./backups/ \
     --endpoint-url http://localhost:9000
   ```

4. **Restore the backup**:
   ```bash
   # Review what will happen
   ./scripts/restore.sh backups/smoker-backup-2025-01-15-143022.dump.gz

   # Or skip confirmation in an emergency
   ./scripts/restore.sh --yes backups/smoker-backup-2025-01-15-143022.dump.gz
   ```

5. **Restart the application**:
   ```bash
   make up   # full stack
   # or
   make dev  # development
   ```

6. **Verify the restore**:
   - Check that the application loads correctly
   - Verify key data is present (users, channels, messages)
   - Check application logs for errors

### After an incident

- [ ] Document what happened and the timeline
- [ ] Identify the root cause
- [ ] Verify no data was lost beyond the backup window
- [ ] Confirm automated backups are running again
- [ ] Consider increasing backup frequency if data loss window is too large

## Backup Format

Backups use `pg_dump --format=custom` piped through `gzip`:

- **Custom format** supports parallel restore, selective restore of objects, and is compressed natively by PostgreSQL
- **gzip compression** provides additional compression on top of pg_dump's internal compression
- Files are named: `smoker-backup-YYYY-MM-DD-HHMMSS.dump.gz`
- Restore uses `gunzip | pg_restore` to decompress and load

## Makefile Targets

```bash
make backup          # Host backup using pg_dump
make backup-docker   # Docker backup (no local pg_dump needed)
make restore FILE=x  # Restore from a backup file
```

#!/usr/bin/env bash
# ===========================================================================
# Test Infrastructure Setup
# ===========================================================================
# Spins up isolated Postgres (5433), Redis (6380), and MinIO (9002),
# waits for health checks, then runs database migrations.
#
# Usage:  bash scripts/test-setup.sh
#         make test-infra test-db-setup   (equivalent Makefile targets)
# ===========================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔧 Starting test infrastructure..."
docker compose -f "$PROJECT_ROOT/docker-compose.test.yml" up -d --wait

echo "⏳ Waiting for services to be healthy..."
# Extra safety: wait for Postgres to accept connections
for i in $(seq 1 30); do
  if docker exec smoker-test-postgres pg_isready -U smoker -q 2>/dev/null; then
    echo "✅ Postgres is ready (port 5433)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "❌ Postgres failed to start within 30 seconds"
    exit 1
  fi
  sleep 1
done

# Wait for Redis
for i in $(seq 1 15); do
  if docker exec smoker-test-redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✅ Redis is ready (port 6380)"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "❌ Redis failed to start within 15 seconds"
    exit 1
  fi
  sleep 1
done

echo "🗃️  Running database migrations on test DB..."
DATABASE_URL="postgresql://smoker:smoker_dev@localhost:5433/smoker_test" \
  npx --prefix "$PROJECT_ROOT" turbo run db:migrate --filter=@smoker/db

echo ""
echo "✅ Test infrastructure is ready!"
echo ""
echo "  Postgres: localhost:5433  (smoker_test)"
echo "  Redis:    localhost:6380  (db 1)"
echo "  MinIO:    localhost:9002  (smoker-test-files)"
echo ""
echo "  Run tests:  make test-api"
echo "  Tear down:  make test-infra-down"

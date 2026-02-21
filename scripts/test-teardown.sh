#!/usr/bin/env bash
# ===========================================================================
# Test Infrastructure Teardown
# ===========================================================================
# Stops and removes test Postgres, Redis, and MinIO containers.
# Pass --volumes to also remove persistent data.
#
# Usage:  bash scripts/test-teardown.sh           (keep data)
#         bash scripts/test-teardown.sh --volumes  (remove data too)
#         make test-infra-down                     (equivalent Makefile target)
# ===========================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

EXTRA_FLAGS=""
if [ "${1:-}" = "--volumes" ] || [ "${1:-}" = "-v" ]; then
  EXTRA_FLAGS="-v"
  echo "🗑️  Tearing down test infrastructure (with volumes)..."
else
  echo "🛑 Tearing down test infrastructure..."
fi

docker compose -f "$PROJECT_ROOT/docker-compose.test.yml" down $EXTRA_FLAGS

echo "✅ Test infrastructure stopped."

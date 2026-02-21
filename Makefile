.PHONY: dev infra infra-down db-setup db-seed build test e2e up down clean nginx nginx-down \
	load-smoke load-test load-stress load-spike backup backup-docker restore monitoring monitoring-down \
	test-infra test-infra-down test-db-setup test-db-seed test-api test-mobile test-e2e test-load test-all test-setup test-teardown test-db-studio

# ===========================================================================
# Development
# ===========================================================================

# Start dev infrastructure (postgres, redis, minio)
infra:
	docker compose -f docker-compose.dev.yml up -d

# Stop dev infrastructure
infra-down:
	docker compose -f docker-compose.dev.yml down

# Run database migrations + seed
db-setup: infra
	npm run db:migrate
	npm run db:seed

# Just seed the database
db-seed:
	npm run db:seed

# Start full dev environment (infra + apps)
dev: infra
	npm run dev

# Build all packages
build:
	npm run build

# Start dev nginx proxy
nginx:
	docker compose -f docker-compose.dev.yml up -d nginx

# Stop dev nginx
nginx-down:
	docker compose -f docker-compose.dev.yml stop nginx

# ===========================================================================
# Testing — Isolated Environment (Postgres 5433, Redis 6380, MinIO 9002)
# ===========================================================================

# --- Infrastructure ---

# Start isolated test infrastructure
test-infra:
	docker compose -f docker-compose.test.yml up -d --wait

# Stop test infrastructure (keeps data)
test-infra-down:
	docker compose -f docker-compose.test.yml down

# Full setup: start infra + run migrations
test-setup:
	bash scripts/test-setup.sh

# Full teardown: stop infra + remove volumes
test-teardown:
	bash scripts/test-teardown.sh --volumes

# --- Database ---

# Run migrations on test database
test-db-setup:
	DATABASE_URL=postgresql://smoker:smoker_dev@localhost:5433/smoker_test npm run db:migrate

# Seed test database with fixture data
test-db-seed:
	DATABASE_URL=postgresql://smoker:smoker_dev@localhost:5433/smoker_test npm run db:seed

# Open Drizzle Studio on test database
test-db-studio:
	DATABASE_URL=postgresql://smoker:smoker_dev@localhost:5433/smoker_test npm run db:studio

# --- Test Runners ---

# API unit + E2E tests against real Postgres/Redis
test-api: test-infra test-db-setup
	npm run test -w @smoker/api

# Mobile tests (no infra needed — all mocked)
test-mobile:
	npm run test -w @smoker/mobile

# Playwright E2E tests against full stack on test infra
test-e2e: test-infra test-db-setup test-db-seed
	DATABASE_URL=postgresql://smoker:smoker_dev@localhost:5433/smoker_test \
	REDIS_URL=redis://localhost:6380/1 \
	npx playwright test -c apps/web/playwright.config.ts --project=chromium

# Run ALL tests: API → mobile → E2E → tear down
test-all: test-infra test-db-setup
	npm run test -w @smoker/api
	npm run test -w @smoker/mobile
	$(MAKE) test-db-seed
	DATABASE_URL=postgresql://smoker:smoker_dev@localhost:5433/smoker_test \
	REDIS_URL=redis://localhost:6380/1 \
	npx playwright test -c apps/web/playwright.config.ts --project=chromium
	$(MAKE) test-infra-down

# Quick: run all vitest suites (same as npm run test)
test:
	npm run test

# Legacy alias
e2e:
	npx playwright test --project=chromium

# ===========================================================================
# Load Testing
# ===========================================================================

load-smoke:
	k6 run load-tests/smoke.js

load-test:
	k6 run load-tests/load.js

load-stress:
	k6 run load-tests/stress.js

load-spike:
	k6 run load-tests/spike.js

# Load test against the dockerized full stack
test-load: up
	@echo "Waiting 10s for stack to settle..."
	@sleep 10
	k6 run load-tests/smoke.js
	$(MAKE) down

# ===========================================================================
# Docker — Full Stack
# ===========================================================================

# Build and run full stack with Docker
up:
	docker compose up --build -d

# Stop full stack
down:
	docker compose down

# ===========================================================================
# Monitoring
# ===========================================================================

monitoring:
	docker compose -f docker-compose.dev.yml --profile monitoring up -d prometheus grafana

monitoring-down:
	docker compose -f docker-compose.dev.yml --profile monitoring stop prometheus grafana

# ===========================================================================
# Database Backups
# ===========================================================================

backup:
	bash scripts/backup.sh

backup-docker:
	bash scripts/backup-docker.sh

restore:
	@test -n "$(FILE)" || (echo "Usage: make restore FILE=backups/smoker-backup-YYYY-MM-DD-HHMMSS.dump.gz" && exit 1)
	bash scripts/restore.sh $(FILE)

# ===========================================================================
# Cleanup
# ===========================================================================

# Remove all containers + volumes (dev, test, and production)
clean:
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.test.yml down -v

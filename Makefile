.PHONY: dev infra infra-down db-setup db-seed build test e2e up down clean nginx nginx-down load-smoke load-test load-stress backup backup-docker restore monitoring monitoring-down

# Start infrastructure (postgres, redis, minio)
infra:
	docker compose -f docker-compose.dev.yml up -d

# Stop infrastructure
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

# Run tests
test:
	npm run test

# Run E2E tests
e2e:
	npx playwright test --project=chromium

# Build and run full stack with Docker
up:
	docker compose up --build -d

# Stop full stack
down:
	docker compose down

# Start dev nginx proxy
nginx:
	docker compose -f docker-compose.dev.yml up -d nginx

# Stop dev nginx
nginx-down:
	docker compose -f docker-compose.dev.yml stop nginx

# Load testing
load-smoke:
	k6 run load-tests/smoke.js

load-test:
	k6 run load-tests/load.js

load-stress:
	k6 run load-tests/stress.js

# Database backup (host pg_dump)
backup:
	bash scripts/backup.sh

# Database backup (via Docker container)
backup-docker:
	bash scripts/backup-docker.sh

# Database restore (pass FILE=path/to/backup.dump.gz)
restore:
	@test -n "$(FILE)" || (echo "Usage: make restore FILE=backups/smoker-backup-YYYY-MM-DD-HHMMSS.dump.gz" && exit 1)
	bash scripts/restore.sh $(FILE)

# Start monitoring stack (Prometheus + Grafana)
monitoring:
	docker compose -f docker-compose.dev.yml --profile monitoring up -d prometheus grafana

# Stop monitoring stack
monitoring-down:
	docker compose -f docker-compose.dev.yml --profile monitoring stop prometheus grafana

# Full clean (remove volumes too)
clean:
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.test.yml down -v
